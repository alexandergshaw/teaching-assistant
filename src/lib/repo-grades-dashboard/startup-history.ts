import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { RepoGradeAttemptReceiptRow } from "@/lib/supabase/types.repo-grades-dashboard";
import { repoGradeStartupKey, type RepoGradeLedgerObservation, type RepoGradeStartupTarget } from "./scheduler";

const MAX_RECEIPTS = 1_000;
const COMMITS_PER_QUERY = 40;
const HISTORY_TIMEOUT_MS = 10_000;
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

/** Read compact history for the pinned targets of a verified owner/course.
 * Null means coverage of at least one requested commit was not established. */
export async function readRepoGradeStartupHistory(
  ownerId: string, courseId: string, targets: readonly RepoGradeStartupTarget[],
): Promise<ReadonlyMap<string, RepoGradeLedgerObservation> | null> {
  const observationsByCommit = new Map<string, RepoGradeLedgerObservation>();
  const commits = new Set<string>();
  for (const target of targets) {
    if (target.accountId !== ownerId || target.courseId !== courseId || !/^[0-9a-f]{40}$/.test(target.sha)) return null;
    observationsByCommit.set(commitKey(target), "never-attempted");
    commits.add(target.sha);
  }
  if (observationsByCommit.size === 0) return observationsByCommit;

  try {
    const client = createServiceClient();
    const signal = AbortSignal.timeout(HISTORY_TIMEOUT_MS);
    const pinnedCommits = [...commits];
    const staleBefore = Date.now() - CLAIM_AGE_LIMIT_MS;
    for (let start = 0; start < pinnedCommits.length; start += COMMITS_PER_QUERY) {
      // Scope the row cap to current evidence and bound the query-string size.
      const subset = new Set(pinnedCommits.slice(start, start + COMMITS_PER_QUERY));
      const { data, error, count } = await client.from("repo_grade_attempts")
        .select(RECEIPT_COLUMNS, { count: "exact" })
        .eq("user_id", ownerId).eq("course_id", courseId).neq("mode", "manual")
        .in("source_sha", [...subset])
        .order("generation", { ascending: false }).limit(MAX_RECEIPTS).abortSignal(signal).retry(false);
      // Exact count and data from the same request detect any Data API cap.
      if (signal.aborted || error || !Array.isArray(data) || data.length !== count || data.length > MAX_RECEIPTS) return null;

      let ceiling = Infinity;
      for (const row of data) {
        if (!row || row.user_id !== ownerId || row.course_id !== courseId
          || (row.mode !== "automatic" && row.mode !== "retry") || !RECEIPT_STATUSES.has(row.status)
          || !Number.isSafeInteger(row.generation) || row.generation <= 0 || row.generation >= ceiling
          || typeof row.repo !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(row.repo)
          || typeof row.folder !== "string" || typeof row.source_ref !== "string" || !row.source_ref
          || typeof row.source_sha !== "string" || !subset.has(row.source_sha)
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
    }
    return new Map(targets.map((target) => [repoGradeStartupKey(target), observationsByCommit.get(commitKey(target))!]));
  } catch {
    return null;
  }
}
