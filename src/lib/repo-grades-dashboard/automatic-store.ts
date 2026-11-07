import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { AutomaticRepoGradeClassQueue, AutomaticRepoGradeCourseState, AutomaticRepoGradeStatus, AutomaticRepoGradeTargetState } from "./automatic-status";
import type { DiscoveryRateLimit } from "./discovery-transport";
import { restoreAutomaticRepoGradeSnapshot, type AutomaticRepoGradeSnapshot } from "./automatic-snapshot";

import type { RepoGradePreparationRetry } from "./preparation-ledger";
import type { RepoGradeRepositoryCoverage } from "./scheduler";
import { parseAutomaticRepoGradeSchedule, type AutomaticRepoGradeScheduleDraft } from "./automatic-schedule";
import type { RepoGradeClaim } from "./state";
import type { RepoGradeEvidenceBatchProgress } from "./preparation-batch";
import type { RepoGradeReadmeExample } from "./preparation-evidence";

type Selector = { repo: string; folder: string; ref: string; sha: string };
type ClaimScope = { runId: string; accountId: string; courseId: string; retryGithubRateLimits?: boolean };
export type AutomaticRepoGradeWork = (ClaimScope & { phase: "discovering"; targetFilter?: { folders: string[] | null; repos: string[] | null; pairs?: { folder: string; repo: string }[] | null } }) | (ClaimScope & Selector & { phase: "grading" });
type StagedSelector = Selector & {
  state?: Extract<AutomaticRepoGradeTargetState, "already-processed" | "no-submission" | "busy" | "failed" | "partial" | "unknown">;
  reason?: "prior-attempt";
};
type DiscoveryCompletion = {
  state: Exclude<AutomaticRepoGradeCourseState, "checking" | "stopped">; reason?: string; targets: StagedSelector[];
  repositories?: RepoGradeRepositoryCoverage;
  snapshot?: AutomaticRepoGradeSnapshot;
};
type TargetCompletion = {
  state: Exclude<AutomaticRepoGradeTargetState, "queued" | "running" | "stopped">;
  reason?: string;
  preparationRetry?: RepoGradePreparationRetry;
  recovery?: string;
  readmeExample?: RepoGradeReadmeExample;
};
export type AutomaticRepoGradeCompletion = DiscoveryCompletion | TargetCompletion
  | { state: "evidence-continue"; basis: string; progress: RepoGradeEvidenceBatchProgress }
  | { state: "verified-empty-regrade" }
  | { state: "github-throttled"; rateLimit: DiscoveryRateLimit; claim?: RepoGradeClaim & { mode: "automatic" | "retry" } };

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createServiceClient().rpc(name, args).retry(false).abortSignal(AbortSignal.timeout(10_000));
  if (error || data === undefined) throw new Error("Automatic repository grading storage unavailable");
  return data;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isAutomaticRepoGradeId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
}

export async function controlAutomaticRepoGrade(accountId: string,
  control: { action: "enqueue" | "start" } | { action: "preference"; enabled: boolean } | { action: "stop"; runId: string },
) {
  return await rpc("repo_grade_automatic_control", {
    p_user_id: accountId,
    p_action: control.action,
    ...("enabled" in control && { p_enabled: control.enabled }),
    ...("runId" in control && { p_run_id: control.runId }),
  }) === true;
}

export async function startTargetedAutomaticRepoGrade(accountId: string, courseId: string, folder: string, repo: string | null) {
  return await rpc("repo_grade_target_request_enqueue", {
    p_user_id: accountId, p_course_id: courseId, p_folder: folder, p_repo: repo,
  });
}

export async function promoteTargetedAutomaticRepoGrade() {
  return await rpc("repo_grade_target_request_promote", {}) === true;
}

export async function enqueueBulkAutomaticRepoGrade(accountId: string, courseId: string, folders: string[] | null, repos: string[] | null) {
  return rpc("repo_grade_target_request_enqueue_bulk", {
    p_user_id: accountId, p_course_id: courseId, p_folders: folders, p_repos: repos,
  });
}

export async function enqueueCellsAutomaticRepoGrade(accountId: string, courseId: string, pairs: { folder: string; repo: string }[]) {
  return rpc("repo_grade_target_request_enqueue_cells", { p_user_id: accountId, p_course_id: courseId, p_pairs: pairs });
}

function parseClassQueue(value: unknown): AutomaticRepoGradeClassQueue | null {
  if (!record(value) || typeof value.customized !== "boolean" || !Array.isArray(value.courses)
    || value.courses.length > 1_000) return null;
  const ids = new Set<string>();
  const courses: AutomaticRepoGradeClassQueue["courses"] = [];
  for (const row of value.courses) {
    if (!record(row) || !isAutomaticRepoGradeId(row.courseId) || ids.has(row.courseId)
      || typeof row.label !== "string" || typeof row.included !== "boolean") return null;
    ids.add(row.courseId);
    courses.push({ courseId: row.courseId, label: row.label, included: row.included });
  }
  return { customized: value.customized, courses };
}

export async function saveAutomaticRepoGradeClassQueue(accountId: string, courseIds: string[] | null) {
  return await rpc("repo_grade_automatic_set_class_queue", { p_user_id: accountId, p_course_ids: courseIds }) === true;
}

export async function readAutomaticRepoGrade(accountId: string): Promise<Omit<Extract<AutomaticRepoGradeStatus, { status: "loaded" }>, "status">> {
  const result = await rpc("repo_grade_automatic_status_with_github_retry", { p_user_id: accountId });
  if (!record(result) || typeof result.enabled !== "boolean"
    || typeof result.githubRetryEnabled !== "boolean"
    || (result.githubRetryAt !== null && (typeof result.githubRetryAt !== "string" || !Number.isFinite(Date.parse(result.githubRetryAt))))
    || !Array.isArray(result.preparations) || !Array.isArray(result.recoveries)
    || (result.run !== null && (!record(result.run) || !isAutomaticRepoGradeId(result.run.id)
      || !Array.isArray(result.run.courses)))) throw new Error("Invalid automatic repository grading status");
  // The previous migration returned a daily schedule without a kind field.
  const rawSchedule = result.schedule;
  const draft = record(rawSchedule) && parseAutomaticRepoGradeSchedule({
    ...rawSchedule, kind: rawSchedule.kind ?? "daily",
  });
  const schedule = draft && record(rawSchedule) && typeof rawSchedule.nextAt === "string"
    && Number.isFinite(Date.parse(rawSchedule.nextAt)) ? { ...draft, nextAt: rawSchedule.nextAt } : null;
  if (rawSchedule != null && !schedule) throw new Error("Invalid automatic repository grading schedule");
  return {
    enabled: result.enabled,
    githubRetryEnabled: result.githubRetryEnabled,
    githubRetryAt: result.githubRetryAt,
    schedule,
    classQueue: parseClassQueue(result.classQueue),
    run: result.run,
    preparations: result.preparations,
    recoveries: result.recoveries,
  } as Omit<Extract<AutomaticRepoGradeStatus, { status: "loaded" }>, "status">;
}

export async function claimAutomaticRepoGrade(lease: string): Promise<AutomaticRepoGradeWork | "advanced" | null> {
  const result = await rpc("repo_grade_automatic_claim", { p_lease: lease });
  if (result === null) return null;
  if (record(result) && result.phase === "advanced") return "advanced";
  if (!record(result) || !isAutomaticRepoGradeId(result.runId) || !isAutomaticRepoGradeId(result.accountId)
    || !isAutomaticRepoGradeId(result.courseId)) throw new Error("Invalid automatic repository grading claim");
  const scope = {
    runId: result.runId, accountId: result.accountId, courseId: result.courseId,
    retryGithubRateLimits: result.retryGithubRateLimits === true,
  };
  if (result.phase === "discovering") {
    const filter = await rpc("repo_grade_automatic_read_target_filter", {
      p_run_id: scope.runId, p_user_id: scope.accountId, p_lease: lease,
    });
    if (!record(filter) || !(filter.folder === null || typeof filter.folder === "string")
      || !(filter.repo === null || typeof filter.repo === "string")
      || (filter.folder === null && filter.repo !== null)) throw new Error("Invalid automatic repository grading target filter");
    if (filter.bulk === true) {
      const validList = (value: unknown) => value === null || (Array.isArray(value) && value.length > 0 && value.length <= 1000 && value.every((entry) => typeof entry === "string"));
      if (!validList(filter.folders) || !validList(filter.repos)
        || !(filter.pairs === null || (Array.isArray(filter.pairs) && filter.pairs.length > 0 && filter.pairs.length <= 1000
          && filter.pairs.every((pair) => record(pair) && typeof pair.folder === "string" && typeof pair.repo === "string")))) throw new Error("Invalid automatic repository grading bulk filter");
      return { ...scope, phase: result.phase, targetFilter: { folders: filter.folders as string[] | null, repos: filter.repos as string[] | null, pairs: filter.pairs as { folder: string; repo: string }[] | null } };
    }
    return { ...scope, phase: result.phase, ...(filter.folder !== null && { targetFilter: { folders: [filter.folder], repos: filter.repo === null ? null : [filter.repo] } }) };
  }
  if (result.phase === "grading" && typeof result.repo === "string" && typeof result.folder === "string"
    && typeof result.ref === "string" && typeof result.sha === "string" && /^[0-9a-f]{40}$/.test(result.sha)) {
    return { ...scope, phase: result.phase, repo: result.repo, folder: result.folder, ref: result.ref, sha: result.sha };
  }
  throw new Error("Invalid automatic repository grading work");
}

export async function readAutomaticRepoGradeSnapshot(work: ClaimScope, lease: string) {
  const result = await rpc("repo_grade_automatic_read_pinned_inventory", {
    p_run_id: work.runId, p_lease: lease, p_user_id: work.accountId, p_course_id: work.courseId,
  });
  if (!record(result) || !Object.hasOwn(result, "snapshot")) return { status: "unavailable" } as const;
  if (result.snapshot === null) return { status: "legacy" } as const;
  const snapshot = restoreAutomaticRepoGradeSnapshot(result.snapshot);
  return snapshot ? { status: "ready", snapshot } as const : { status: "unavailable" } as const;
}

/** Only a live worker lease can distinguish explicit requests from startup work. */
export async function isTargetedAutomaticRepoGrade(work: ClaimScope, lease: string): Promise<boolean | null> {
  const result = await rpc("repo_grade_automatic_is_targeted", {
    p_run_id: work.runId, p_user_id: work.accountId, p_lease: lease,
  });
  return typeof result === "boolean" ? result : null;
}

export function automaticRepoGradeEvidenceStore(
  work: Extract<AutomaticRepoGradeWork, { phase: "grading" }>, lease: string,
) {
  const scope = {
    p_run_id: work.runId, p_lease: lease, p_user_id: work.accountId, p_course_id: work.courseId, p_folder: work.folder,
  };
  return {
    async read(basis: string) {
      const result = await rpc("repo_grade_automatic_read_pinned_evidence", { ...scope, p_basis: basis });
      if (!record(result) || !Object.hasOwn(result, "evidence")) throw new Error("Repository grading evidence unavailable");
      return result.evidence;
    },
    async write(basis: string, evidence: unknown) {
      if (await rpc("repo_grade_automatic_save_pinned_evidence", { ...scope, p_basis: basis, p_evidence: evidence }) !== true) {
        throw new Error("Repository grading evidence unavailable");
      }
    },
    async readProgress(basis: string) {
      const result = await rpc("repo_grade_automatic_read_evidence_progress", { ...scope, p_basis: basis });
      if (!record(result) || !Object.hasOwn(result, "progress")) throw new Error("Repository grading progress unavailable");
      return result.progress;
    },
  };
}

export async function finishAutomaticRepoGrade(work: AutomaticRepoGradeWork, lease: string, result: AutomaticRepoGradeCompletion) {
  if (result.state === "verified-empty-regrade") {
    if (work.phase !== "grading") return false;
    return await rpc("repo_grade_automatic_finish_empty_regrade", {
      p_user_id: work.accountId, p_run_id: work.runId, p_lease: lease, p_course_id: work.courseId,
      p_repo: work.repo, p_folder: work.folder, p_source_ref: work.ref, p_source_sha: work.sha,
    }) === true;
  }
  if (result.state === "evidence-continue") {
    if (work.phase !== "grading") return false;
    return await rpc("repo_grade_automatic_continue_evidence", {
      p_run_id: work.runId, p_lease: lease, p_user_id: work.accountId, p_course_id: work.courseId,
      p_folder: work.folder, p_basis: result.basis, p_progress: result.progress,
    }) === true;
  }
  if (result.state === "github-throttled") {
    const { retryAtMs, primary } = result.rateLimit;
    if (result.claim) {
      if (work.phase !== "grading") return false;
      return await rpc("repo_grade_automatic_retry_prepared_throttle", {
        p_user_id: work.accountId, p_run_id: work.runId, p_lease: lease, p_course_id: work.courseId,
        p_generation: result.claim.generation, p_token: result.claim.token,
        p_retry_at: retryAtMs === null ? null : new Date(retryAtMs).toISOString(), p_primary_limit: primary,
      }) === true;
    }
    return await rpc("repo_grade_automatic_finish_github_throttle", {
      p_run_id: work.runId, p_lease: lease, p_course_id: work.courseId,
      p_discovering: work.phase === "discovering",
      p_retry_at: retryAtMs === null ? null : new Date(retryAtMs).toISOString(),
      p_primary_limit: primary,
    }) === true;
  }
  if ("readmeExample" in result && result.readmeExample && work.phase === "grading" && result.state === "blocked") {
    return await rpc("repo_grade_automatic_finish_readme_example", {
      p_run_id: work.runId, p_lease: lease, p_user_id: work.accountId, p_course_id: work.courseId,
      p_reason: result.reason, p_example: result.readmeExample,
    }) === true;
  }
  const discovery = "targets" in result;
  const finish = discovery
    ? result.snapshot ? "repo_grade_automatic_finish_pinned_discovery" : "repo_grade_automatic_finish_discovery"
    : "repo_grade_automatic_finish";
  return await rpc(finish, {
    p_run_id: work.runId,
    p_lease: lease,
    p_course_id: work.courseId,
    p_state: result.state,
    p_reason: result.reason ?? null,
    ...(discovery ? { p_targets: result.targets, p_repositories: result.repositories ?? null,
      ...(result.snapshot && { p_snapshot: result.snapshot }) } : {
      p_preparation_key: result.preparationRetry?.key ?? null,
      p_preparation_generation: result.preparationRetry?.generation ?? null,
      p_recovery: result.recovery ?? null,
    }),
  }) === true;
}

export async function saveAutomaticRepoGradeGithubRetry(accountId: string, enabled: boolean) {
  return await rpc("repo_grade_automatic_set_github_retry", { p_user_id: accountId, p_enabled: enabled }) === true;
}

export async function readAutomaticRecovery(accountId: string, targetId: number) {
  const result = await rpc("repo_grade_automatic_recovery", { p_user_id: accountId, p_target_id: targetId });
  return typeof result === "string" ? Buffer.from(result, "base64").toString("utf8") : null;
}

export async function automaticPreparationRetry(
  accountId: string, targetId: number, update?: { expectedGeneration: string; replacement: RepoGradePreparationRetry | null },
) {
  const result = await rpc("repo_grade_automatic_retry", {
    p_user_id: accountId, p_target_id: targetId,
    ...(update && {
      p_replace: true, p_key: update.replacement?.key ?? null, p_generation: update.replacement?.generation ?? null,
      p_expected_generation: update.expectedGeneration,
    }),
  });
  if (!record(result) || !isAutomaticRepoGradeId(result.courseId) || typeof result.folder !== "string"
    || typeof result.key !== "string" || typeof result.generation !== "string") return null;
  return { courseId: result.courseId, folder: result.folder, key: result.key, generation: result.generation };
}

export async function saveAutomaticRepoGradeSchedule(accountId: string, schedule: AutomaticRepoGradeScheduleDraft | null) {
  if (schedule?.kind === "interval") {
    return await rpc("repo_grade_automatic_set_interval", {
      p_user_id: accountId, p_count: schedule.count, p_unit: schedule.unit,
    }) === true;
  }
  return await rpc("repo_grade_automatic_set_schedule", {
    p_user_id: accountId, p_time: schedule?.time ?? null, p_zone: schedule?.zone ?? null,
  }) === true;
}

export async function enqueueDueAutomaticRepoGrades() {
  const result = await rpc("repo_grade_automatic_enqueue_due", {});
  if (!record(result) || typeof result.accepted !== "number" || typeof result.failed !== "number") {
    throw new Error("Invalid automatic repository grading wakeup");
  }
  return { accepted: result.accepted, failed: result.failed };
}
