import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import type { FeedbackField } from "../grading-results/gradingResultsHelpers";
import type { RepoFeedbackStorageResult } from "./repoGradesResultsStore";

export type RepoFeedbackCopyTarget = FeedbackField | "overall" | "all";

const STORAGE_LABELS = {
  repo_feedback_draft_save: "Save repository feedback draft",
  repo_feedback_draft_discard: "Discard repository feedback draft",
  repo_feedback_restore: "Restore repository feedback",
};

export function recordRepoFeedbackStorage(
  operation: keyof typeof STORAGE_LABELS,
  storageSource: "browser_local" | "durable",
  started: number,
  { outcome, failureCategory, affectedResultCount }: RepoFeedbackStorageResult,
) {
  try {
    recordSessionDiagnosticEntry({
      at: new Date().toISOString(),
      surface: "grading",
      operation,
      label: STORAGE_LABELS[operation],
      outcome: outcome === "success" ? "success" : "failure",
      durationMs: Math.min(3_600_000, Math.max(0, Math.round(performance.now() - started))),
      detail: { outcome, failureCategory, storageSource, ...(affectedResultCount === undefined ? {} : { affectedResultCount }) },
    });
  } catch {
    // A diagnostic failure cannot change the outcome of reading or writing feedback.
  }
}

type CopyResult =
  | { outcome: "success"; cause: "none" }
  | { outcome: "blocked"; cause: "api_unavailable" | "stale_scope" }
  | { outcome: "denied"; cause: "permission_denied" }
  | { outcome: "failed"; cause: "clipboard_rejected" };

export async function copyRepoFeedback(
  getClipboard: () => Pick<Clipboard, "writeText"> | undefined,
  target: RepoFeedbackCopyTarget,
  value: string,
  isCurrent: () => boolean,
): Promise<CopyResult> {
  const started = performance.now();
  let result: CopyResult;
  try {
    const clipboard = isCurrent() ? getClipboard() : undefined;
    if (!isCurrent()) {
      result = { outcome: "blocked", cause: "stale_scope" };
    } else if (!clipboard || typeof clipboard.writeText !== "function") {
      result = { outcome: "blocked", cause: "api_unavailable" };
    } else {
      await clipboard.writeText(value);
      result = { outcome: "success", cause: "none" };
    }
  } catch (error) {
    result = error instanceof DOMException && error.name === "NotAllowedError"
      ? { outcome: "denied", cause: "permission_denied" }
      : { outcome: "failed", cause: "clipboard_rejected" };
  }
  // A change after writeText starts invalidates the status, but the browser owns the write.
  if (!isCurrent()) result = { outcome: "blocked", cause: "stale_scope" };
  recordSessionDiagnosticEntry({
    at: new Date().toISOString(),
    surface: "grading",
    operation: "repo_feedback_copy",
    label: "Copy repository feedback",
    outcome: result.outcome === "success" ? "success" : "failure",
    durationMs: Math.min(3_600_000, Math.max(0, Math.round(performance.now() - started))),
    detail: { outcome: result.outcome, failureCategory: result.cause, copyTarget: target },
  });
  return result;
}
