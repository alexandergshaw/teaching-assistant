import "server-only";

import { createRepoGradeStartupSchedule, repoGradeRepositoryCoverage, repoGradeStartupKey } from "./scheduler";
import {
  prepareEmbeddedRepoGradeStartupProfile, prepareRepoGradeStartupProfile, type RepoGradeProfilePreparationFailure,
} from "./preparation-runtime";
import { planRepoGradeCourse, runRepoGradeTarget } from "./runner";
import { readRepoGradeStartupHistory } from "./startup-history";
import type { AutomaticRepoGradeCompletion, AutomaticRepoGradeWork } from "./automatic-store";

type Plan = Awaited<ReturnType<typeof planRepoGradeCourse>>;
export type AutomaticRepoGradeMode = "coordinated" | "embedded-only";

export function createAutomaticRepoGradeWorker(mode: AutomaticRepoGradeMode) {
  // Reuse a pinned scan within one tick. A later invocation rechecks the
  // source, and the grading ledger still validates the current configuration.
  const plans = new Map<string, Plan>();

  return async (work: AutomaticRepoGradeWork): Promise<AutomaticRepoGradeCompletion> => {
    const { accountId, courseId, runId } = work;
    const key = [runId, courseId].join(":");
    if (!plans.has(key)) plans.set(key, await planRepoGradeCourse(accountId, courseId));
    const plan = plans.get(key);
    const discovery = plan?.discovery;
    const incompleteDueToRateLimit = discovery?.status === "blocked" ? discovery.reason === "rate-limited"
      : discovery?.status === "scanned" && discovery.repos.some((row) => row.status === "blocked" && row.reason === "rate-limited");
    if (work.retryGithubRateLimits && discovery && discovery.status !== "not-configured"
      && (incompleteDueToRateLimit || (work.phase === "grading" && discovery.rateLimit))) {
      // Rediscover after the cooldown. No rubric preparation or evaluation
      // has started on this lease, so the same queue item may safely retry.
      plans.delete(key);
      return { state: "github-throttled", rateLimit: discovery.rateLimit ?? { retryAtMs: null, primary: false } };
    }
    if (work.phase === "discovering") {
      if (!plan) return { state: "partial", reason: "course-unavailable", targets: [] };
      const { discovery } = plan;
      if (discovery.status === "not-configured") return { state: "not-configured", targets: [] };
      if (discovery.status === "blocked") return { state: "partial", reason: discovery.reason, targets: [] };
      const repositories = repoGradeRepositoryCoverage(discovery);
      if (!discovery.enumerationComplete) return { state: "partial", reason: "enumeration-incomplete", targets: [], repositories };
      const schedule = createRepoGradeStartupSchedule({ accountId, generation: runId }, [{
        accountId, courseId, organization: plan.courseConfig.github_org, discovery,
      }], new Map(), false);
      if (schedule.work.size > 1000) return { state: "partial", reason: "target-limit", targets: [], repositories };
      const targets = [...schedule.work.values()].map(({ target }) => target);
      const history = targets.length ? await readRepoGradeStartupHistory(accountId, courseId, targets) : new Map();
      if (!history) return { state: "partial", reason: "history-unavailable", targets: [], repositories };
      const bounded = targets.filter(({ folder, sourceRef }) => folder.length <= 512 && sourceRef.length <= 255);
      const incompleteSource = discovery.repos.find(({ status }) => status !== "ready");
      return {
        repositories,
        state: incompleteSource || bounded.length !== targets.length ? "partial" : "scanned",
        reason: incompleteSource && "reason" in incompleteSource ? incompleteSource.reason
          : bounded.length !== targets.length ? "invalid-source" : undefined,
        targets: bounded.map((target) => {
          const { repo, folder, sourceRef, sha } = target;
          const selector = { repo, folder, ref: sourceRef, sha };
          const prior = history.get(repoGradeStartupKey(target));
          switch (prior) {
            case "never-attempted": return selector;
            case "succeeded":
            case "no-submission": return { ...selector, state: "already-processed" };
            case "claimed": return { ...selector, state: "busy", reason: "prior-attempt" };
            case "failed":
            case "partial":
            case "unknown": return { ...selector, state: prior, reason: "prior-attempt" };
            default: throw new Error("Missing automatic grading history");
          }
        }),
      };
    }

    if (!plan) return { state: "blocked", reason: "course-unavailable" };
    const target = { accountId, courseId, repo: work.repo, folder: work.folder, sourceRef: work.ref, sha: work.sha };
    const history = await readRepoGradeStartupHistory(accountId, courseId, [target]);
    const prior = history?.get(repoGradeStartupKey(target));
    if (!prior) return { state: "blocked", reason: "history-unavailable" };
    if (prior !== "never-attempted") {
      if (prior === "succeeded" || prior === "no-submission") return { state: "already-processed" };
      return { state: prior === "claimed" ? "busy" : prior, reason: "prior-attempt" };
    }
    const expectedRef = plan.folderSources.get(target.folder) ?? null;
    let profileFailure: RepoGradeProfilePreparationFailure | undefined;
    const outcome = await runRepoGradeTarget(plan, target, {
      loadPreparedProfile: (scope) => mode === "embedded-only"
        ? prepareEmbeddedRepoGradeStartupProfile(scope, expectedRef)
        : prepareRepoGradeStartupProfile(scope, plan.discovery, expectedRef, target, plan.courseConfig, plan.courseKindBasis, {
          observeProfileFailure: (reason) => { profileFailure = reason; },
        }),
    });
    if ((outcome.status === "partial" || outcome.status === "unknown") && outcome.unretainedResult) {
      const payload = JSON.stringify({
        target, status: outcome.status, unretainedResult: outcome.unretainedResult,
        feedbackRetention: outcome.feedbackRetention,
      }, null, 2);
      if (Buffer.byteLength(payload, "utf8") > 256 * 1024) {
        return { state: outcome.status, reason: "feedback-recovery-limit" };
      }
      return {
        state: outcome.status, reason: "feedback-retention-unconfirmed",
        recovery: Buffer.from(payload, "utf8").toString("base64"),
      };
    }
    if ((outcome.status === "failed" || outcome.status === "explicit-retry-required") && outcome.preparationRetry) {
      return { state: "blocked", reason: outcome.status, preparationRetry: outcome.preparationRetry };
    }
    switch (outcome.status) {
      case "terminal": return { state: "already-processed" };
      case "succeeded":
      case "no-submission":
      case "failed":
      case "unknown":
      case "busy":
      case "embedded-profile-required":
        return { state: outcome.status };
      case "partial":
        return { state: "partial", reason: outcome.feedbackRetention ? "feedback-not-retained" : undefined };
      case "profile-unavailable":
        return { state: "blocked", reason: profileFailure ?? outcome.status };
      default:
        return { state: "blocked", reason: outcome.status };
    }
  };
}
