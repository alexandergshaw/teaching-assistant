import type { GithubQuotaResult } from "@/lib/github-quota";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";

type QuotaSnapshot = Extract<GithubQuotaResult, { status: "observed" }>;
const UNAVAILABLE: GithubQuotaResult = { status: "unavailable" };

export function githubQuotaSnapshotIsStale(snapshot: QuotaSnapshot, nowMs: number) {
  return nowMs >= snapshot.staleAtMs || (snapshot.resetAtMs !== null && nowMs >= snapshot.resetAtMs);
}

export async function checkRepoGradesGithubQuota(accountId: string, signal: AbortSignal) {
  const startedAt = performance.now();
  let result: GithubQuotaResult = UNAVAILABLE;
  try {
    const response = await fetch("/api/repo-grades/github-quota", {
      cache: "no-store",
      headers: { "X-Repo-Grades-Account": accountId },
      signal,
    });
    if (response.ok) {
      const quota = await response.json() as GithubQuotaResult | null;
      if (quota?.status === "observed" || quota?.status === "throttled" || quota?.status === "not-configured") {
        result = quota;
      }
    }
  } catch {
    // A failed check cannot provide a current value.
  }
  if (signal.aborted) return null;
  const nowMs = Date.now();
  const cause = result.status === "observed" ? (githubQuotaSnapshotIsStale(result, nowMs) ? "stale" : null) : result.status;
  try {
    recordSessionDiagnosticEntry({
      at: new Date(nowMs).toISOString(),
      surface: "grading",
      operation: "repo_grades_github_quota",
      outcome: cause ? "failure" : "success",
      ...(cause && { cause }),
      durationMs: Math.min(3_600_000, Math.max(0, Math.round(performance.now() - startedAt))),
    });
  } catch {
    // Diagnostics cannot change the quota check outcome.
  }
  return { result, nowMs };
}
