import "server-only";

import { createRepoGradeStartupSchedule, repoGradeRepositoryCoverage, repoGradeStartupKey } from "./scheduler";
import {
  prepareEmbeddedRepoGradeStartupProfile, prepareRepoGradeStartupProfile, type RepoGradeProfilePreparationFailure,
} from "./preparation-runtime";
import { planRepoGradeCourse, runRepoGradeTarget } from "./runner";
import { readRepoGradeStartupHistory } from "./startup-history";
import { automaticRepoGradeEvidenceStore, readAutomaticRepoGradeSnapshot, type AutomaticRepoGradeCompletion, type AutomaticRepoGradeWork } from "./automatic-store";
import { captureAutomaticRepoGradeSnapshot } from "./automatic-snapshot";
import { authorizeAutomaticRepoGradeEvidence, createAutomaticRepoGradeEvidenceResolver } from "./automatic-evidence";
import { confirmedGradeSourceCooldown } from "@/lib/github-grade-archive";
import { PreparationGithubThrottle } from "./preparation-github-throttle";

export type AutomaticRepoGradeMode = "coordinated" | "embedded-only";

export function createAutomaticRepoGradeWorker(mode: AutomaticRepoGradeMode) {
  // Legacy and partial courses still share a scan within one tick, as before.
  const legacyPlans = new Map<string, Awaited<ReturnType<typeof planRepoGradeCourse>>>();
  return async (work: AutomaticRepoGradeWork, lease: string): Promise<AutomaticRepoGradeCompletion> => {
    const { accountId, courseId, runId } = work;
    const stored = work.phase === "grading" ? await readAutomaticRepoGradeSnapshot(work, lease) : undefined;
    if (stored?.status === "unavailable") return { state: "blocked", reason: "pinned-inventory-unavailable" };
    const snapshot = stored?.status === "ready" ? stored.snapshot : undefined;
    const key = `${runId}:${courseId}`;
    const plan = snapshot ? await planRepoGradeCourse(accountId, courseId, snapshot)
      : stored?.status === "legacy" && legacyPlans.has(key) ? legacyPlans.get(key)
        : await planRepoGradeCourse(accountId, courseId);
    if (stored?.status === "legacy" && plan) legacyPlans.set(key, plan);
    const discovery = plan?.discovery;
    const incompleteDueToRateLimit = discovery?.status === "blocked" ? discovery.reason === "rate-limited"
      : discovery?.status === "scanned" && discovery.repos.some((row) => row.status === "blocked" && row.reason === "rate-limited");
    if (work.retryGithubRateLimits && discovery && discovery.status !== "not-configured"
      && (incompleteDueToRateLimit || (work.phase === "grading" && discovery.rateLimit
        && (!snapshot || (discovery.rateLimit.retryAtMs ?? 0) > Date.now())))) {
      // No rubric preparation or evaluation has started. An incomplete scan
      // can retry discovery; a complete snapshot keeps its pins after cooldown.
      legacyPlans.delete(key);
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
      const bounded = targets.filter(({ folder, sourceRef }) => folder.length <= 512 && sourceRef.length <= 255);
      const incompleteSource = discovery.repos.find(({ status }) => status !== "ready");
      const partial = incompleteSource || bounded.length !== targets.length;
      // Saved/manual profiles may still grade verified targets on the legacy
      // path. Never advertise a partial scan as complete pinned evidence.
      const pinned = !partial && plan.snapshotBasis && captureAutomaticRepoGradeSnapshot(plan.snapshotBasis, discovery);
      if (!partial && !pinned) return { state: "partial", reason: "pinned-inventory-unavailable", targets: [], repositories };
      const history = targets.length ? await readRepoGradeStartupHistory(accountId, courseId, targets) : new Map();
      if (!history) return { state: "partial", reason: "history-unavailable", targets: [], repositories };
      if (partial) legacyPlans.set(key, plan);
      return {
        repositories, state: partial ? "partial" : "scanned",
        reason: incompleteSource && "reason" in incompleteSource ? incompleteSource.reason
          : bounded.length !== targets.length ? "invalid-source" : undefined,
        ...(pinned && { snapshot: pinned }),
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

    if (!plan) return { state: "blocked", reason: snapshot ? "configuration-changed" : "course-unavailable" };
    // Do not create a ledger attempt while this instance already knows that
    // the credential is throttled. The existing scheduler releases the run
    // lease and resumes the same pinned target after the cooldown.
    const cooldown = work.retryGithubRateLimits ? confirmedGradeSourceCooldown() : null;
    if (cooldown) return { state: "github-throttled", rateLimit: cooldown };
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
    let preparationThrottle: PreparationGithubThrottle | undefined;
    const outcome = await runRepoGradeTarget(plan, target, {
      deferSourceThrottle: work.retryGithubRateLimits === true,
      loadPreparedProfile: (scope) => mode === "embedded-only"
        ? prepareEmbeddedRepoGradeStartupProfile(scope, expectedRef)
        : prepareRepoGradeStartupProfile(scope, plan.discovery, expectedRef, target, plan.courseConfig, plan.courseKindBasis, {
          observeProfileFailure: (reason) => { profileFailure = reason; },
          ...(snapshot && { resolveEvidence: createAutomaticRepoGradeEvidenceResolver(
            snapshot.basis, automaticRepoGradeEvidenceStore(work, lease),
            () => authorizeAutomaticRepoGradeEvidence(work.repo, work.sha),
          ) }),
        }).catch((error: unknown) => {
          if (error instanceof PreparationGithubThrottle) preparationThrottle = error;
          throw error;
        }),
    });
    if (outcome.status === "profile-unavailable" && work.retryGithubRateLimits && preparationThrottle) {
      return { state: "github-throttled", rateLimit: preparationThrottle.rateLimit };
    }
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
      case "deferred-source-throttle":
        return { state: "github-throttled", rateLimit: confirmedGradeSourceCooldown() ?? { retryAtMs: null, primary: false }, claim: outcome.claim };
      case "terminal": return { state: "already-processed" };
      case "succeeded":
      case "no-submission":
      case "failed":
      case "unknown":
      case "busy":
      case "embedded-profile-required":
        return { state: outcome.status };
      case "partial":
        return { state: "partial", reason: outcome.feedbackRetention ? "feedback-not-retained" : outcome.reason };
      case "profile-unavailable":
        return { state: "blocked", reason: profileFailure ?? outcome.status };
      default:
        return { state: "blocked", reason: outcome.status };
    }
  };
}
