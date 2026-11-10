import type { gradeRepoAction } from "@/app/actions/github-repos";
import { bulkGradeOutcomeFromRun, repoGradeAttemptErrorStatus } from "./repoGradesBulkGrade";

type GradeResult = Awaited<ReturnType<typeof gradeRepoAction>>;
export type State = "queued" | "paused" | "stopped" | "skipped" | "not-dispatched" | "running" | "graded" | "partial" | "failed" | "blocked" | "no-submission" | "unknown";
export type ManualRepoGradeDiagnostic = { attemptId: string; at: string; updatedAt: string; reason: string; repo: string | null; url: string | null; urlStatus: "available" | "invalid"; mode: "single" | "bulk"; status: State };
const stores = new Map<string, ManualRepoGradeDiagnostic[]>();
const dropped = new Map<string, number>();
const LIMIT = 2000;

/** Only canonical public GitHub repository identifiers may enter the export. */
export function canonicalRepo(value: string): { repo: string | null; url: string | null; urlStatus: "available" | "invalid" } {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/.test(value) || /\/(?:\.|\.\.)$/.test(value)) return { repo: null, url: null, urlStatus: "invalid" };
  return { repo: value, url: `https://github.com/${value}`, urlStatus: "available" };
}
export function readManualRepoGradeDiagnostics(accountId: string): ManualRepoGradeDiagnostic[] {
  return (stores.get(accountId) ?? []).map((item) => ({ ...item }));
}
export function manualRepoGradeDropped(accountId: string): number { return dropped.get(accountId) ?? 0; }
export function clearManualRepoGradeDiagnostics(accountId: string): void { stores.delete(accountId); dropped.delete(accountId); }
export function setManualRepoGradeState(record: ManualRepoGradeDiagnostic | undefined, status: State, reason: string): void {
  if (record) { record.status = status; record.reason = reason; record.updatedAt = new Date().toISOString(); }
}
export function beginManualRepoGrade(accountId: string | undefined, repo: string, mode: "single" | "bulk", status: State, reason: string = status): ManualRepoGradeDiagnostic | undefined {
  if (!accountId) return;
  let attemptId: string; try { attemptId = crypto.randomUUID(); } catch { return; }
  const now = new Date().toISOString();
  const record: ManualRepoGradeDiagnostic = { attemptId, at: now, updatedAt: now, reason, ...canonicalRepo(repo), mode, status };
  const entries = stores.get(accountId) ?? []; entries.push(record);
  if (entries.length > LIMIT) { entries.shift(); dropped.set(accountId, (dropped.get(accountId) ?? 0) + 1); }
  stores.set(accountId, entries); return record;
}

/** Observe only; transport rejection remains uncertain and propagates unchanged. */
export async function trackManualRepoGrade<T extends GradeResult>(accountId: string | undefined, repo: string, folder: string, mode: "single" | "bulk", run: () => Promise<T>, existing?: ManualRepoGradeDiagnostic): Promise<T> {
  const record = existing ?? beginManualRepoGrade(accountId, repo, mode, "running");
  if (!record) return run();
  setManualRepoGradeState(record, "running", "dispatched");
  try {
    const result = await run();
    try {
    if ("error" in result) { const status = repoGradeAttemptErrorStatus(result) ?? "failed"; setManualRepoGradeState(record, status, status === "unknown" ? "outcome-unconfirmed" : status === "blocked" ? "admission-blocked" : "action-failed"); }
    else if ("noSubmission" in result) setManualRepoGradeState(record, "no-submission", "no-submission");
    else {
      const outcome = bulkGradeOutcomeFromRun({ repo, folder }, result.run.results, "");
      const status = outcome.status === "graded" && (result.digestTruncated || result.run.results[0]?.submissionTruncated) ? "partial" : outcome.status;
      setManualRepoGradeState(record, status, status === "partial" ? "truncated-input" : status === "failed" ? "grading-failed" : status);
    }
    } catch { setManualRepoGradeState(record, "unknown", "classification-unavailable"); }
    return result;
  } catch (error) { setManualRepoGradeState(record, "unknown", "transport-unconfirmed"); throw error; }
}


/** Map the known plan reasons without exporting arbitrary source text. */
export function manualSkipReason(reason: string): string {
  if (reason === "already graded") return "already-graded";
  if (reason === "repo scan failed - folder presence unknown") return "scan-failed";
  return "folder-missing";
}
