import "server-only";

import { isDeepStrictEqual } from "node:util";
import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { RepoGradeClaimStatus, RepoGradeHistoryRow } from "@/lib/supabase/types.repo-grades-dashboard";
import {
  isRepoGradeFeedbackField,
  unretainedRepoGradeFeedbackField,
  validRepoGradeCohortId,
  type RepoGradeAutomaticSettlement,
  type RepoGradeClaim,
  type RepoGradeClaimRequest,
  type RepoGradeManualSettlement,
} from "./state";

const DENIED_STATUSES: ReadonlySet<unknown> = new Set<RepoGradeClaimStatus>([
  "terminal", "busy", "capacity", "explicit-retry-required", "forbidden", "configuration-changed",
  "recovered-succeeded", "recovered-no-submission", "recovered-failed", "recovered-partial", "recovered-unknown",
]);

// Matches the fixed LIMIT in repo_grade_history.
export const REPO_GRADE_HISTORY_PAGE_SIZE = 100;
const HISTORY_STATUSES: ReadonlySet<unknown> = new Set<RepoGradeHistoryRow["status"]>([
  "claimed", "succeeded", "no-submission", "partial", "failed", "unknown",
]);

function validGeneration(generation: unknown): generation is number {
  return typeof generation === "number" && Number.isSafeInteger(generation) && generation > 0;
}

async function ledgerRpc(name: string, args: Record<string, unknown>, noRetry = false): Promise<unknown> {
  try {
    const request = createServiceClient().rpc(name, args);
    const { data, error } = await (noRetry ? request.retry(false) : request);
    if (!error) return data;
  } catch {
    // The database may have accepted the write before its response was lost.
    // Surface the failure without automatically issuing another request.
  }
  throw new Error("Repository grading storage is unavailable");
}

export async function claimRepoGrade(request: RepoGradeClaimRequest): Promise<
  { status: "claimed"; claim: RepoGradeClaim } | { status: RepoGradeClaimStatus }
> {
  const owner = await requireAppOwner();
  const automatic = request.mode !== "manual";
  const cohort = automatic ? request.cohort : null;
  const preparation = automatic ? request.preparation : undefined;
  const startupBatchId = automatic ? request.startupBatchId : undefined;
  const targetedRun = automatic ? request.targetedRun : undefined;
  const recoveryRun = automatic ? request.recoveryRun : undefined;
  if (automatic && (!cohort || !validRepoGradeCohortId(cohort.cohortId)
    || cohort.receipt?.accountId !== owner.id || cohort.receipt.courseId !== request.courseId
    || cohort.receipt.folder !== request.folder)) {
    return { status: "configuration-changed" };
  }
  if (preparation && !/^[0-9a-f]{64}$/.test(preparation.key)) return { status: "configuration-changed" };
  const args = {
    p_user_id: owner.id,
    p_course_id: request.courseId ?? null,
    p_repo: request.repo,
    p_folder: request.folder ?? null,
    p_mode: request.mode,
    p_source_ref: automatic ? request.sourceRef : null,
    p_source_sha: automatic ? request.sha : null,
    p_course_config: automatic ? request.courseConfig : null,
    p_cohort_id: cohort?.cohortId ?? null,
    p_receipt: cohort?.receipt ?? null,
  };
  let response: unknown;
  if (recoveryRun) {
    const { p_mode: mode, ...targetArgs } = args;
    if (mode !== "retry" || targetedRun || startupBatchId || !validRepoGradeCohortId(recoveryRun.runId)
      || !validRepoGradeCohortId(recoveryRun.lease)) return { status: "forbidden" };
    response = await ledgerRpc(recoveryRun.capability === "text-extension-v1" ? "repo_grade_claim_text_recovery" : "repo_grade_claim_prepared_recovery", {
      ...targetArgs, p_run_id: recoveryRun.runId, p_lease: recoveryRun.lease,
      p_preparation_key: preparation?.key ?? null,
    }, true);
  } else if (targetedRun) {
    const { p_mode: mode, ...targetArgs } = args;
    if (mode !== "retry" || startupBatchId || !validRepoGradeCohortId(targetedRun.runId)
      || !validRepoGradeCohortId(targetedRun.lease)) return { status: "forbidden" };
    response = await ledgerRpc("repo_grade_claim_targeted_regrade", {
      ...targetArgs, p_run_id: targetedRun.runId, p_lease: targetedRun.lease,
      p_preparation_key: preparation?.key ?? null,
    }, true);
  } else if (startupBatchId) {
    const { p_mode: mode, ...startupArgs } = args;
    if (mode !== "automatic" || !validRepoGradeCohortId(startupBatchId)) return { status: "forbidden" };
    response = await ledgerRpc("repo_grade_claim_startup_target", {
      ...startupArgs, p_batch_id: startupBatchId, p_preparation_key: preparation?.key ?? null,
    }, true);
  } else {
    response = preparation
      ? await ledgerRpc("repo_grade_claim_with_preparation", { ...args, p_preparation_key: preparation.key }, true)
      : await ledgerRpc("repo_grade_claim_tracked", args);
  }
  if (response && typeof response === "object" && "status" in response) {
    if (DENIED_STATUSES.has(response.status)) return { status: response.status as RepoGradeClaimStatus };
    if (
      response.status === "claimed"
      && "generation" in response && validGeneration(response.generation)
      && "token" in response && typeof response.token === "string"
      && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(response.token)
    ) {
      if (preparation && (!("preparation" in response) || !isDeepStrictEqual(response.preparation, preparation.context))) {
        return { status: "configuration-changed" };
      }
      return { status: "claimed", claim: { mode: request.mode, generation: response.generation, token: response.token } };
    }
  }
  throw new Error("Invalid repository grading admission response");
}

export async function beginRepoGradeDispatch(claim: RepoGradeClaim): Promise<number | null> {
  const owner = await requireAppOwner();
  const response = await ledgerRpc("repo_grade_begin_dispatch", {
    p_user_id: owner.id,
    p_generation: claim.generation,
    p_token: claim.token,
  });
  if (response !== null && (typeof response !== "number" || !Number.isSafeInteger(response)
    || response <= 0 || response > 15 * 60_000)) {
    throw new Error("Invalid repository grading dispatch response");
  }
  return response;
}

export function settleRepoGrade(
  claim: RepoGradeClaim & { mode: "manual" }, settlement: RepoGradeManualSettlement,
): Promise<boolean>;
export function settleRepoGrade(
  claim: RepoGradeClaim & { mode: "automatic" | "retry" }, settlement: RepoGradeAutomaticSettlement,
): Promise<boolean>;
export async function settleRepoGrade(
  claim: RepoGradeClaim, settlement: RepoGradeManualSettlement | RepoGradeAutomaticSettlement,
): Promise<boolean> {
  const owner = await requireAppOwner();
  const result = "result" in settlement ? settlement.result : null;
  if (result) {
    if (!Number.isFinite(result.score) || result.score < 0 || result.score > 100) {
      throw new Error("Invalid repository evaluation score");
    }
    const field = unretainedRepoGradeFeedbackField(result.feedback, result.sections, result.rubric);
    if (field) throw new Error(`Repository evaluation feedback cannot be retained (${field})`);
  }
  const retention = "feedbackRetention" in settlement ? settlement.feedbackRetention : null;
  const response = await ledgerRpc("repo_grade_settle", {
    p_user_id: owner.id,
    p_generation: claim.generation,
    p_token: claim.token,
    p_outcome: settlement.outcome,
    p_inputs_complete: "inputsComplete" in settlement && settlement.inputsComplete,
    p_score: result?.score ?? null,
    p_feedback: result?.feedback ?? null,
    p_rubric: result?.rubric.map(({ area, score, comment }) => ({ area, score, comment })) ?? null,
    ...(claim.mode !== "manual" && {
      p_feedback_sections: result ? {
        strengths: result.sections.strengths, improvements: result.sections.improvements,
        resubmitNotice: result.sections.resubmitNotice, rawScore: result.sections.rawScore,
      } : null,
      p_feedback_retention: retention ?? null,
    }),
  });
  if (typeof response !== "boolean") throw new Error("Invalid repository grading settlement response");
  return response;
}

// Only a trusted server recovery path with independent evidence may call this.
export async function reconcileEndedRepoGrade(generation: number): Promise<boolean> {
  const owner = await requireAppOwner();
  if (!validGeneration(generation)) throw new Error("Invalid repository grading generation");
  const response = await ledgerRpc("repo_grade_reconcile", { p_user_id: owner.id, p_generation: generation });
  if (typeof response !== "boolean") throw new Error("Invalid repository grading recovery response");
  return response;
}

export async function listOrphanedRepoGradeReservations(): Promise<number[]> {
  const owner = await requireAppOwner();
  const response = await ledgerRpc("repo_grade_orphaned_reservations", { p_user_id: owner.id });
  if (!Array.isArray(response) || !response.every(validGeneration)) {
    throw new Error("Invalid repository grading reservation response");
  }
  return response;
}

export async function readRepoGradeHistory(courseId: string, before?: number): Promise<RepoGradeHistoryRow[]> {
  const owner = await requireAppOwner();
  const rows = await readRepoGradeHistoryForOwner(owner.id, courseId, before);
  if (!rows) throw new Error("Repository grading course is unavailable");
  return rows;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validText(value: unknown, max: number, min = 0): value is string {
  return typeof value === "string" && value.length >= min && [...value].length <= max;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function validHistoryRow(row: unknown): row is RepoGradeHistoryRow {
  if (!isRecord(row) || !validGeneration(row.generation) || !HISTORY_STATUSES.has(row.status)) return false;
  if (!validText(row.repo, 200) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(row.repo)
    || !validText(row.folder, 512) || !validText(row.source_ref, 255, 1)
    || typeof row.source_sha !== "string" || !/^[0-9a-f]{40}$/.test(row.source_sha)
    || typeof row.profile_fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(row.profile_fingerprint)
    || !validDate(row.claimed_at)
    || (row.settled_at !== null && !validDate(row.settled_at))
    || (row.reconciled_at !== null && !validDate(row.reconciled_at))) return false;
  if (row.feedback_retention != null
    && (row.status !== "partial" || row.score !== null || !isRepoGradeFeedbackField(row.feedback_retention))) return false;
  if (row.score === null) return row.status !== "succeeded" && row.feedback === null
    && row.rubric === null && row.feedback_sections == null;
  if ((row.status !== "succeeded" && row.status !== "partial") || typeof row.score !== "number"
    || !Number.isFinite(row.score) || row.score < 0 || row.score > 100) return false;
  if (row.feedback_sections != null) {
    return !unretainedRepoGradeFeedbackField(row.feedback, row.feedback_sections, row.rubric);
  }
  return validText(row.feedback, 4000) && Array.isArray(row.rubric) && row.rubric.length <= 40
    && row.rubric.every((item: unknown) => isRecord(item) && validText(item.area, 150)
      && validText(item.score, 48) && validText(item.comment, 320));
}

/** The caller must supply the authenticated owner, never an ID from input.
 * The RPC independently verifies that this course belongs to that owner. */
export async function readRepoGradeHistoryForOwner(
  ownerId: string, courseId: string, before?: number,
): Promise<RepoGradeHistoryRow[] | null> {
  if (before !== undefined && !validGeneration(before)) throw new Error("Invalid repository grading cursor");
  const response = await ledgerRpc("repo_grade_history", {
    p_user_id: ownerId, p_course_id: courseId, p_before: before ?? null,
  });
  if (response === null) return null;
  if (!Array.isArray(response) || response.length > REPO_GRADE_HISTORY_PAGE_SIZE) {
    throw new Error("Invalid repository grading history response");
  }
  const rows: RepoGradeHistoryRow[] = [];
  let ceiling = before ?? Infinity;
  for (const row of response) {
    if (!validHistoryRow(row) || row.generation >= ceiling) {
      throw new Error("Invalid repository grading history response");
    }
    rows.push(row);
    ceiling = row.generation;
  }
  return rows;
}
