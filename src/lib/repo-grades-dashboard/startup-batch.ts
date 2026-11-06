import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { repoGradeStartupKey, type RepoGradeHistoryObservation, type RepoGradeStartupTarget } from "./scheduler";

const MAX_TARGETS = 1000;
const COUNT_STATES = [
  "queued", "running", "busy", "succeeded", "no-submission", "partial", "failed",
  "unknown", "not-started", "already-processed",
] as const;
type CountState = typeof COUNT_STATES[number];
type BatchCount = { courseId: string; state: CountState; count: number };
type CapturedState = Exclude<RepoGradeHistoryObservation, "never-attempted">;
const CAPTURED_STATES: ReadonlySet<unknown> = new Set<CapturedState>([
  "claimed", "succeeded", "no-submission", "partial", "failed", "unknown", "not-started", "terminal",
]);

export type RepoGradeStartupBatchNotice = { active: boolean; counts: BatchCount[] };

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createServiceClient().rpc(name, args).retry(false).abortSignal(AbortSignal.timeout(10_000));
  if (error || data === undefined) throw new Error("Startup batch storage unavailable");
  return data;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function readStartupBatch(accountId: string): Promise<RepoGradeStartupBatchNotice | null> {
  const data = await rpc("repo_grade_read_startup", { p_user_id: accountId });
  if (data === null) return null;
  if (!record(data) || typeof data.active !== "boolean" || !Array.isArray(data.counts)) {
    throw new Error("Invalid startup batch response");
  }
  const counts: BatchCount[] = [];
  const keys = new Set<string>();
  let total = 0;
  for (const row of data.counts) {
    if (!record(row) || typeof row.courseId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(row.courseId)
      || !COUNT_STATES.includes(row.state as CountState)
      || typeof row.count !== "number" || !Number.isSafeInteger(row.count) || row.count < 1) {
      throw new Error("Invalid startup batch count");
    }
    const key = `${row.courseId}:${row.state}`;
    total += row.count;
    if (keys.has(key) || total > MAX_TARGETS) throw new Error("Invalid startup batch total");
    keys.add(key);
    counts.push({ courseId: row.courseId, state: row.state as CountState, count: row.count });
  }
  return { active: data.active, counts };
}

export async function stageStartupTargets(
  accountId: string, batchId: string, courseId: string, targets: readonly RepoGradeStartupTarget[],
): Promise<ReadonlyMap<string, CapturedState>> {
  if (targets.length > MAX_TARGETS) throw new Error("Startup batch target limit");
  const selectors = targets.map(({ repo, folder, sourceRef, sha }) => ({ repo, folder, ref: sourceRef, sha }));
  const data = await rpc("repo_grade_stage_startup", {
    p_user_id: accountId, p_batch_id: batchId, p_course_id: courseId, p_targets: selectors,
  });
  if (!Array.isArray(data)) throw new Error("Invalid startup batch staging response");
  const available = new Set(targets.map(repoGradeStartupKey));
  const skipped = new Map<string, CapturedState>();
  for (const row of data) {
    if (!record(row) || typeof row.repo !== "string" || typeof row.folder !== "string"
      || typeof row.ref !== "string" || typeof row.sha !== "string" || !CAPTURED_STATES.has(row.state)) {
      throw new Error("Invalid startup batch selector");
    }
    const key = repoGradeStartupKey({ accountId, courseId, repo: row.repo, folder: row.folder, sourceRef: row.ref, sha: row.sha });
    if (!available.has(key) || skipped.has(key)) throw new Error("Unexpected startup batch selector");
    skipped.set(key, row.state as CapturedState);
  }
  return skipped;
}

export async function sealStartupBatch(accountId: string, batchId: string, count: number) {
  return await rpc("repo_grade_seal_startup", { p_user_id: accountId, p_batch_id: batchId, p_count: count }) === true;
}

export async function closeStartupBatch(accountId: string, batchId: string) {
  return await rpc("repo_grade_close_startup", { p_user_id: accountId, p_batch_id: batchId }) === true;
}

function targetArgs(batchId: string, { accountId, courseId, repo, folder, sourceRef, sha }: RepoGradeStartupTarget) {
  return {
    p_user_id: accountId, p_batch_id: batchId, p_course_id: courseId,
    p_repo: repo, p_folder: folder, p_ref: sourceRef, p_sha: sha,
  };
}

export async function startStartupTarget(batchId: string, target: RepoGradeStartupTarget) {
  return await rpc("repo_grade_start_startup_target", targetArgs(batchId, target)) === true;
}

export async function finishStartupTarget(
  batchId: string, target: RepoGradeStartupTarget, status: "not-started" | "unknown" | "failed" | "already-processed",
) {
  return await rpc("repo_grade_finish_startup_target", { ...targetArgs(batchId, target), p_status: status }) === true;
}
