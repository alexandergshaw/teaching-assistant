import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { AutomaticRepoGradeCourseState, AutomaticRepoGradeStatus, AutomaticRepoGradeTargetState } from "./automatic-status";

import type { RepoGradePreparationRetry } from "./preparation-ledger";
import type { RepoGradeRepositoryCoverage } from "./scheduler";

type Selector = { repo: string; folder: string; ref: string; sha: string };
type ClaimScope = { runId: string; accountId: string; courseId: string };
export type AutomaticRepoGradeWork = (ClaimScope & { phase: "discovering" }) | (ClaimScope & Selector & { phase: "grading" });
type StagedSelector = Selector & {
  state?: Extract<AutomaticRepoGradeTargetState, "already-processed" | "busy" | "failed" | "partial" | "unknown">;
  reason?: "prior-attempt";
};
type DiscoveryCompletion = {
  state: Exclude<AutomaticRepoGradeCourseState, "checking" | "stopped">; reason?: string; targets: StagedSelector[];
  repositories?: RepoGradeRepositoryCoverage;
};
type TargetCompletion = {
  state: Exclude<AutomaticRepoGradeTargetState, "queued" | "running" | "stopped">;
  reason?: string;
  preparationRetry?: RepoGradePreparationRetry;
  recovery?: string;
};
export type AutomaticRepoGradeCompletion = DiscoveryCompletion | TargetCompletion;

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

export async function readAutomaticRepoGrade(accountId: string): Promise<Omit<Extract<AutomaticRepoGradeStatus, { status: "loaded" }>, "status">> {
  const result = await rpc("repo_grade_automatic_status", { p_user_id: accountId });
  if (!record(result) || typeof result.enabled !== "boolean"
    || !Array.isArray(result.preparations) || !Array.isArray(result.recoveries)
    || (result.run !== null && (!record(result.run) || !isAutomaticRepoGradeId(result.run.id)
      || !Array.isArray(result.run.courses)))) throw new Error("Invalid automatic repository grading status");
  return {
    enabled: result.enabled,
    schedule: result.schedule,
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
  const scope = { runId: result.runId, accountId: result.accountId, courseId: result.courseId };
  if (result.phase === "discovering") return { ...scope, phase: result.phase };
  if (result.phase === "grading" && typeof result.repo === "string" && typeof result.folder === "string"
    && typeof result.ref === "string" && typeof result.sha === "string" && /^[0-9a-f]{40}$/.test(result.sha)) {
    return { ...scope, phase: result.phase, repo: result.repo, folder: result.folder, ref: result.ref, sha: result.sha };
  }
  throw new Error("Invalid automatic repository grading work");
}

export async function finishAutomaticRepoGrade(work: AutomaticRepoGradeWork, lease: string, result: AutomaticRepoGradeCompletion) {
  const discovery = "targets" in result;
  return await rpc(discovery ? "repo_grade_automatic_finish_discovery" : "repo_grade_automatic_finish", {
    p_run_id: work.runId,
    p_lease: lease,
    p_course_id: work.courseId,
    p_state: result.state,
    p_reason: result.reason ?? null,
    ...(discovery ? { p_targets: result.targets, p_repositories: result.repositories ?? null } : {
      p_preparation_key: result.preparationRetry?.key ?? null,
      p_preparation_generation: result.preparationRetry?.generation ?? null,
      p_recovery: result.recovery ?? null,
    }),
  }) === true;
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

export async function saveAutomaticRepoGradeSchedule(accountId: string, time: string | null, zone: string | null) {
  return await rpc("repo_grade_automatic_set_schedule", { p_user_id: accountId, p_time: time, p_zone: zone }) === true;
}

export async function enqueueDueAutomaticRepoGrades() {
  const result = await rpc("repo_grade_automatic_enqueue_due", {});
  if (!record(result) || typeof result.accepted !== "number" || typeof result.failed !== "number") {
    throw new Error("Invalid automatic repository grading wakeup");
  }
  return { accepted: result.accepted, failed: result.failed };
}
