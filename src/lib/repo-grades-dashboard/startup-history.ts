import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { RepoGradeAttemptReceiptRow } from "@/lib/supabase/types.repo-grades-dashboard";
import { repoGradeStartupKey, type RepoGradeLedgerObservation, type RepoGradeStartupTarget } from "./scheduler";

const MAX_RECEIPTS = 1_000;
const RECEIPT_COLUMNS = "generation, user_id, course_id, repo, folder, source_ref, source_sha, mode, status, claimed_at";
const RECEIPT_STATUSES = new Set<RepoGradeAttemptReceiptRow["status"]>([
  "claimed", "succeeded", "no-submission", "partial", "failed", "unknown",
]);
// Matches the stale-claim view in the ledger history RPC. This is a preview;
// only the ledger can change the persisted status or release a reservation.
const CLAIM_AGE_LIMIT_MS = 15 * 60 * 1_000;

const OBSERVATION_PRIORITY: Record<RepoGradeLedgerObservation, number> = {
  "never-attempted": 0,
  failed: 1,
  partial: 1,
  claimed: 2,
  unknown: 3,
  succeeded: 4,
  "no-submission": 4,
};

// Different refs can resolve to the same immutable work. Keep the exact ref
// in the target key returned to the scheduler and in persisted provenance.
function commitKey({ accountId, courseId, repo, sha, folder }: Omit<RepoGradeStartupTarget, "sourceRef">): string {
  return JSON.stringify([accountId, courseId, repo.toLowerCase(), sha, folder]);
}

/** Read one compact snapshot for a previously verified owner/course. The
 * targets are server-discovered. Null means coverage was not established. */
export async function readRepoGradeStartupHistory(
  ownerId: string, courseId: string, targets: readonly RepoGradeStartupTarget[],
): Promise<ReadonlyMap<string, RepoGradeLedgerObservation> | null> {
  const observationsByCommit = new Map<string, RepoGradeLedgerObservation>();
  for (const target of targets) {
    if (target.accountId !== ownerId || target.courseId !== courseId) return null;
    observationsByCommit.set(commitKey(target), "never-attempted");
  }
  if (observationsByCommit.size === 0) return observationsByCommit;

  try {
    const { data, error, count } = await createServiceClient().from("repo_grade_attempts")
      .select(RECEIPT_COLUMNS, { count: "exact" })
      .eq("user_id", ownerId).eq("course_id", courseId).neq("mode", "manual")
      .order("generation", { ascending: false }).limit(MAX_RECEIPTS).retry(false);
    // Exact count and data come from the same request. This also detects a
    // configured Data API limit lower than MAX_RECEIPTS.
    if (error || !Array.isArray(data) || data.length !== count || data.length > MAX_RECEIPTS) return null;

    const staleBefore = Date.now() - CLAIM_AGE_LIMIT_MS;
    let ceiling = Infinity;
    for (const row of data) {
      if (!row || row.user_id !== ownerId || row.course_id !== courseId
        || (row.mode !== "automatic" && row.mode !== "retry") || !RECEIPT_STATUSES.has(row.status)
        || !Number.isSafeInteger(row.generation) || row.generation <= 0 || row.generation >= ceiling
        || typeof row.repo !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(row.repo)
        || typeof row.folder !== "string" || typeof row.source_ref !== "string" || !row.source_ref
        || typeof row.source_sha !== "string" || !/^[0-9a-f]{40}$/.test(row.source_sha)
        || typeof row.claimed_at !== "string" || !Number.isFinite(Date.parse(row.claimed_at))) return null;
      ceiling = row.generation;
      const key = commitKey({
        accountId: ownerId, courseId, repo: row.repo, folder: row.folder, sha: row.source_sha,
      });
      const observed = observationsByCommit.get(key);
      if (observed === undefined) continue;
      const status = row.status === "claimed" && Date.parse(row.claimed_at) <= staleBefore ? "unknown" : row.status;
      // Rows descend by generation, so equal priority keeps the newer receipt.
      if (OBSERVATION_PRIORITY[status] > OBSERVATION_PRIORITY[observed]) observationsByCommit.set(key, status);
    }
    return new Map(targets.map((target) => [repoGradeStartupKey(target), observationsByCommit.get(commitKey(target))!]));
  } catch {
    return null;
  }
}
