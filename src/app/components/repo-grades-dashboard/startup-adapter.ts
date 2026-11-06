import {
  closeRepoGradeStartupBatchAction,
  planRepoGradeCourseAction,
  readRepoGradeStartupBatchAction,
  readRepoGradeStartupCoursesAction,
  readRepoGradeStartupReadinessAction,
  retryRepoGradePreparationAction,
  runRepoGradeStartupTargetAction,
  sealRepoGradeStartupBatchAction,
} from "@/app/actions/repo-grades-dashboard";
import { repoGradeStartupKey, type RepoGradeHistoryObservation } from "@/lib/repo-grades-dashboard/scheduler";
import type { RepoGradesStartupAdapter } from "./startup-coordinator";

type CoursePlan = Extract<Awaited<ReturnType<typeof planRepoGradeCourseAction>>, { status: "planned" }>;

function historyObservation({ state }: CoursePlan["preview"]["targets"][number]): RepoGradeHistoryObservation | undefined {
  switch (state.status) {
    case "blocked":
      // Read-only previews block explicitly unattempted targets on the runtime.
      return state.reason === "runtime-unavailable" ? "never-attempted" : undefined;
    case "succeeded":
    case "no-submission":
    case "partial":
    case "failed":
    case "unknown":
    case "claimed":
    case "not-started":
    case "terminal":
      return state.status;
    default:
      return undefined;
  }
}

export const serverRepoGradesStartupAdapter: RepoGradesStartupAdapter = {
  status: "configured",
  async openReadyRuntime({ accountId, generation }) {
    const readiness = await readRepoGradeStartupReadinessAction(accountId);
    if (readiness.status !== "ready" || readiness.accountId !== accountId) return null;

    // Each preview uses the expected account and derives its plan and durable
    // observations together on the server. Keep them for this generation only.
    const observations = new Map<string, RepoGradeHistoryObservation>();
    let stagingFailed = false;
    return {
      accountId,
      // Next dispatches client Server Functions one at a time. Avoid queuing
      // additional requests there that the Stop control could no longer reach.
      dispatchOneAtATime: true,
      batch: {
        async read() {
          const result = await readRepoGradeStartupBatchAction(accountId);
          if (result.status !== "loaded") throw new Error("Startup batch unavailable");
          return result.notice;
        },
        seal: async (count) => !stagingFailed && sealRepoGradeStartupBatchAction(accountId, generation, count),
        close: () => closeRepoGradeStartupBatchAction(accountId, generation),
      },
      async loadOwnedCourses() {
        const inventory = await readRepoGradeStartupCoursesAction(accountId);
        return inventory.status === "complete" ? inventory.courses : null;
      },
      async discoverCourse(courseId) {
        const plan = await planRepoGradeCourseAction(courseId, accountId, generation).catch(() => null);
        if (!plan || plan.status === "batch-unavailable" || plan.status === "storage-unavailable") stagingFailed = true;
        if (!plan) return { status: "blocked", reason: "unavailable" };
        if (plan.status !== "planned") return { status: "blocked", reason: "unavailable" };
        if (plan.preview.history === "complete") {
          for (const row of plan.preview.targets) {
            const observation = historyObservation(row);
            if (!observation) continue;
            const key = repoGradeStartupKey({
              accountId, courseId, repo: row.repo, sourceRef: row.sourceRef, sha: row.commit, folder: row.folder,
            });
            observations.set(key, observation);
          }
        }
        return plan.discovery;
      },
      async loadDurableHistory(targets) {
        const history = new Map<string, RepoGradeHistoryObservation>();
        for (const target of targets) {
          if (target.accountId !== accountId) continue;
          const key = repoGradeStartupKey(target);
          const observation = observations.get(key);
          if (observation) history.set(key, observation);
        }
        return history;
      },
      async runTarget(reservation) {
        const { scope, target } = reservation;
        if (scope.accountId !== accountId || scope.generation !== generation || target.accountId !== accountId) {
          return { status: "forbidden" };
        }
        const { courseId, repo, folder, sourceRef, sha } = target;
        return runRepoGradeStartupTargetAction(accountId, courseId, repo, folder, sourceRef, sha, generation);
      },
      retryPreparation({ scope, courseId, folder, selector }) {
        if (scope.accountId !== accountId || scope.generation !== generation) {
          return Promise.resolve({ status: "forbidden", durationMs: 0 });
        }
        return retryRepoGradePreparationAction(accountId, courseId, folder, selector.key, selector.generation);
      },
    };
  },
};
