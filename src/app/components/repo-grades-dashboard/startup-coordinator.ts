import {
  createRepoGradeStartupSchedule,
  reserveNextRepoGradeStartupTarget,
  settleRepoGradeStartupTarget,
  stopRepoGradeStartupSchedule,
  type RepoGradeStartupScope,
  type RepoGradeStartupTarget,
} from "@/lib/repo-grades-dashboard/scheduler";
import { recordRepoGradesStartup } from "./startup-diagnostics";
import type { CourseStartupState, RepoGradesStartupProgress } from "./startup-progress";

type Schedule = ReturnType<typeof createRepoGradeStartupSchedule>;
type Inventory = Schedule["courses"][number];
type OwnedCourse = Omit<Inventory, "discovery"> & { displayName?: string };
type History = Parameters<typeof createRepoGradeStartupSchedule>[2];
type Reservation = Parameters<typeof settleRepoGradeStartupTarget>[1];
type Outcome = Parameters<typeof settleRepoGradeStartupTarget>[2];
type Diagnostic = typeof recordRepoGradesStartup;

type ReadyRuntime = {
  accountId: string;
  loadOwnedCourses(): Promise<readonly OwnedCourse[]>;
  discoverCourse(courseId: string): Promise<Inventory["discovery"]>;
  loadDurableHistory(targets: readonly RepoGradeStartupTarget[]): Promise<History>;
  runTarget(reservation: Reservation): Promise<Outcome>;
};

export type RepoGradesStartupAdapter =
  | { status: "disabled" }
  | {
      status: "configured";
      // Server calls must authorize each request and verify its original
      // account. Return null until durable admission, history and the
      // bounded evaluator are all available.
      openReadyRuntime(scope: RepoGradeStartupScope): Promise<ReadyRuntime | null>;
    };

export const disabledRepoGradesStartupAdapter: RepoGradesStartupAdapter = { status: "disabled" };

function discoveryState(discovery: Inventory["discovery"]): CourseStartupState {
  if (discovery.status === "not-configured") return "not-configured";
  if (discovery.status === "blocked") return "blocked";
  if (!discovery.enumerationComplete) return "unknown";
  if (discovery.repos.some((repo) => repo.status !== "ready")) return "partial";
  return "succeeded";
}

function evaluationDiagnostic(outcome: Outcome): Parameters<Diagnostic>[1] {
  switch (outcome) {
    case "succeeded":
    case "no-submission":
    case "terminal":
      return "success";
    case "partial":
      return "incomplete";
    case "failed":
      return "failed";
    case "unknown":
    case "storage-unavailable":
      return "unknown";
    default:
      return "blocked";
  }
}

export function startRepoGradesStartup(
  scope: RepoGradeStartupScope,
  adapter: RepoGradesStartupAdapter,
  onProgress?: (progress: RepoGradesStartupProgress) => void,
) {
  let schedule: Schedule | null = null;
  let stopped = false;
  let attached = true;
  let phase: RepoGradesStartupProgress["phase"] = "checking";
  const courses = new Map<string, OwnedCourse>();
  const discoveries = new Map<string, Inventory["discovery"]>();
  const startedAt = performance.now();

  function report() {
    if (!attached || !onProgress) return;
    const byCourse = new Map<string, Map<CourseStartupState, number>>();
    for (const { target, state } of schedule?.work.values() ?? []) {
      const counts = byCourse.get(target.courseId) ?? new Map<CourseStartupState, number>();
      let status: CourseStartupState;
      switch (state.status) {
        case "queued": status = stopped ? "stopped" : "queued"; break;
        case "claimed": status = "busy"; break;
        case "terminal": status = "already-processed"; break;
        case "blocked": status = state.reason === "history-unavailable" ? "unknown" : "blocked"; break;
        default: status = state.status;
      }
      counts.set(status, (counts.get(status) ?? 0) + 1);
      byCourse.set(target.courseId, counts);
    }
    onProgress({
      phase: stopped ? "stopped" : phase,
      courses: [...courses.values()].map((course, index) => {
        const discovery = discoveries.get(course.courseId);
        const counts = byCourse.get(course.courseId) ?? new Map<CourseStartupState, number>();
        const coverage = discovery ? discoveryState(discovery) : stopped ? "stopped" : "checking";
        if (coverage !== "succeeded" || !counts.size) {
          const state = coverage === "succeeded"
            ? schedule ? "no-work" : stopped ? "stopped" : "checking"
            : coverage;
          counts.set(state, counts.get(state) ?? 0);
        }
        return {
          courseId: course.courseId,
          label: course.displayName?.trim() || `Class ${index + 1}`,
          states: [...counts].map(([state, count]) => ({ state, count })),
        };
      }),
    });
  }

  function diagnose(...args: Parameters<Diagnostic>) {
    if (attached) recordRepoGradesStartup(...args);
  }

  async function measure<T>(
    operation: Parameters<Diagnostic>[0],
    action: () => Promise<T>,
    summarize: (value: T) => readonly [Parameters<Diagnostic>[1], number?],
  ): Promise<T> {
    const start = performance.now();
    let value: T;
    try {
      value = await action();
    } catch (error) {
      diagnose(operation, "request-failed", start);
      throw error;
    }
    const [outcome, count] = summarize(value);
    diagnose(operation, outcome, start, count);
    return value;
  }

  function halt() {
    stopped = true;
    if (schedule) schedule = stopRepoGradeStartupSchedule(schedule, scope);
  }

  function stop() {
    if (stopped || phase === "complete" || phase === "unavailable" || adapter.status === "disabled") return;
    halt();
    diagnose("stop", "success", startedAt);
    report();
  }

  async function run() {
    if (stopped) return;
    if (adapter.status === "disabled") {
      phase = "unavailable";
      return;
    }
    report();
    const runtime = await measure("readiness", () => adapter.openReadyRuntime(scope), (ready) =>
      [ready?.accountId === scope.accountId ? "success" : "unavailable"],
    );
    if (stopped) return;
    if (runtime?.accountId !== scope.accountId) {
      phase = "unavailable";
      return;
    }

    const ownedCourses = await measure("courses", () => runtime.loadOwnedCourses(), (owned) => ["success", owned.length]);
    if (stopped) return;
    for (const course of ownedCourses) {
      if (course.accountId !== scope.accountId || courses.has(course.courseId)) continue;
      courses.set(course.courseId, course);
      if (!course.organization?.trim()) discoveries.set(course.courseId, { status: "not-configured" });
    }
    report();
    for (const course of courses.values()) {
      if (stopped) return;
      if (discoveries.has(course.courseId)) continue;
      let discovery: Inventory["discovery"];
      try {
        discovery = await measure("discovery", () => runtime.discoverCourse(course.courseId), (result) => [
          discoveryState(result) === "succeeded" ? "success" : result.status === "blocked" ? "blocked" : "incomplete",
          result.status === "scanned" ? result.repos.length : undefined,
        ]);
      } catch {
        discovery = { status: "blocked", reason: "unavailable" };
      }
      if (stopped) return;
      discoveries.set(course.courseId, discovery);
      report();
    }
    const inventories = [...courses.values()].map((course) => ({ ...course, discovery: discoveries.get(course.courseId)! }));
    const plan = createRepoGradeStartupSchedule(scope, inventories, new Map(), false);
    const targets = [...plan.work.values()].map(({ target }) => target);
    if (!targets.length) {
      schedule = plan;
      return;
    }

    // Only explicit durable observations can authorize a first attempt.
    const history = await measure("history", () => runtime.loadDurableHistory(targets), (receipts) => [
      [...plan.work.keys()].every((key) => receipts.has(key)) ? "success" : "incomplete",
      targets.length,
    ]).catch((error: unknown) => {
      if (!stopped) schedule = plan;
      throw error;
    });
    if (stopped) return;
    schedule = createRepoGradeStartupSchedule(scope, inventories, history, true);
    phase = "processing";
    report();

    const pending = new Set<Promise<void>>();
    async function dispatch(reservation: Reservation) {
      let status: Outcome;
      try {
        status = await measure("evaluation", () => runtime!.runTarget(reservation), (outcome) => [evaluationDiagnostic(outcome)]);
      } catch {
        status = "unknown";
      }
      if (schedule) schedule = settleRepoGradeStartupTarget(schedule, reservation, status);
      if (status === "storage-unavailable" || status === "runtime-unavailable" || status === "forbidden") halt();
      report();
    }

    for (;;) {
      while (schedule && !stopped) {
        const next = reserveNextRepoGradeStartupTarget(schedule, scope);
        if (!next) break;
        schedule = next.state;
        const job = dispatch(next.reservation).finally(() => pending.delete(job));
        pending.add(job);
      }
      report();
      if (!pending.size) break;
      await Promise.race(pending);
    }
  }

  // Cleanup can discard a mount before any action. In-flight requests retain
  // their original scope and can settle locally after user stop or teardown.
  const done = Promise.resolve().then(run).then(
    () => {
      if (phase !== "unavailable") phase = "complete";
      report();
    },
    () => {
      phase = schedule ? "complete" : "unavailable";
      report();
    },
  );
  return {
    done,
    stop,
    dispose: () => { attached = false; halt(); },
    readSchedule: () => schedule,
  };
}
