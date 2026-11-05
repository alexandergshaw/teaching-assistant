import { useEffect, useState } from "react";
import { readRepoGradeHistoryAction } from "@/app/actions/repo-grades-dashboard";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import { recordRepoFeedbackStorage } from "./repoFeedbackClipboard";

type LoadedPage = Extract<Awaited<ReturnType<typeof readRepoGradeHistoryAction>>, { status: "loaded" }>;
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

type PageRequest = { cursors: number[] };

// Mounted under keys for both the signed-in account and selected course.
export function useRepoGradeHistory(courseId: string, accountId: string) {
  const [request, setRequest] = useState<PageRequest>({ cursors: [] });
  const [settledRequest, setSettledRequest] = useState<PageRequest | null>(null);
  const [visiblePage, setVisiblePage] = useState<{ data: LoadedPage; cursors: number[] } | null>(null);
  const [error, setError] = useState<Exclude<ReadResult["status"], "loaded"> | null>(null);
  const pending = request !== settledRequest;

  useEffect(() => {
    let current = true;
    void loadRepoGradeHistoryPage(courseId, accountId, request.cursors.at(-1), () => current).then((result) => {
      if (!current) return;
      if (result.status === "loaded") {
        setVisiblePage({ data: result, cursors: request.cursors });
        setError(null);
      } else {
        setError(result.status);
      }
      setSettledRequest(request);
    });
    return () => { current = false; };
  }, [accountId, courseId, request]);

  return {
    page: visiblePage?.data ?? null,
    pageNumber: (visiblePage?.cursors.length ?? 0) + 1,
    pending,
    error: pending ? null : error,
    older: () => {
      if (!pending && visiblePage && visiblePage.data.nextBefore !== null) {
        setRequest({ cursors: [...visiblePage.cursors, visiblePage.data.nextBefore] });
      }
    },
    newer: () => {
      if (!pending && visiblePage?.cursors.length) {
        setRequest({ cursors: visiblePage.cursors.slice(0, -1) });
      }
    },
    retry: () => {
      if (!pending && error) setRequest({ cursors: request.cursors });
    },
  };
}
