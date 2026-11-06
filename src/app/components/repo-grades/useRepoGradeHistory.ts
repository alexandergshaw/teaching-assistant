import { readRepoGradeHistoryAction } from "@/app/actions/repo-grades-dashboard";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import { recordRepoFeedbackStorage } from "./repoFeedbackClipboard";

type ReadResult = Awaited<ReturnType<typeof readRepoGradeHistoryAction>> | { status: "request-failed" };

export async function loadRepoGradeHistoryPage(
  courseId: string, accountId: string, before?: number, isCurrent = () => true,
): Promise<ReadResult> {
  const started = performance.now();
  let result: ReadResult;
  try {
    result = await readRepoGradeHistoryAction(courseId, accountId, before);
  } catch {
    result = { status: "request-failed" };
  }
  try {
    if (!isCurrent()) {
      recordRepoFeedbackStorage("repo_feedback_restore", "durable", started, { outcome: "blocked", failureCategory: "stale_scope" });
    } else if (result.status === "loaded") {
      const incomplete = result.rows.filter((row) => row.feedback_retention || (row.feedback !== null && !row.feedback_sections)).length;
      recordRepoFeedbackStorage("repo_feedback_restore", "durable", started, {
        outcome: incomplete ? "partial" : "success",
        failureCategory: incomplete ? "retention_limit" : "none",
        affectedResultCount: incomplete || result.rows.length,
      });
    } else {
      recordRepoFeedbackStorage("repo_feedback_restore", "durable", started, {
        outcome: result.status === "course-unavailable" ? "blocked" : "failed",
        failureCategory: result.status === "request-failed" ? "transport_rejected"
          : result.status === "storage-unavailable" ? "service_rejected" : "unknown",
      });
    }
    const elapsed = performance.now() - started;
    recordSessionDiagnosticEntry({
      at: new Date().toISOString(),
      surface: "grading",
      operation: "repo_grade_history_read",
      label: "Read repository evaluation history",
      outcome: result.status === "loaded" ? "success" : "failure",
      durationMs: Math.min(3_600_000, Math.max(0, Math.round(elapsed))),
      ...(result.status === "loaded"
        ? { detail: { rowCount: result.rows.length } }
        : { cause: result.status }),
    });
  } catch {
    // A diagnostic failure must not affect history or the local dashboard.
  }
  return result;
}
