import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import type { previewRepoGradeStartupPlanAction } from "@/app/actions/repo-grades-dashboard";
import type { RepoGradePreparationDiagnostic } from "@/lib/repo-grades-dashboard/preparation-runtime";

type Operation = "readiness" | "courses" | "discovery" | "history" | "evaluation" | "stop"
  | "batch_read" | "batch_seal" | "batch_close" | "preview" | "background" | "background_preference" | "background_schedule"
  | "background_retry" | "background_recovery" | "background_start" | "background_stop"
  | "background_github_retry" | "background_github_cooldown";
type Outcome = "success" | "unavailable" | "incomplete" | "request-failed" | "failed" | "unknown" | "blocked"
  | "unchanged" | "disabled" | "not-configured" | "embedded-profile-required";
type PreviewResult = Awaited<ReturnType<typeof previewRepoGradeStartupPlanAction>> | { status: "request-failed" };
type PreviewDetail = {
  discoveryOutcome: "complete" | "incomplete" | "blocked" | "not-configured";
  historyOutcome: "complete" | "unknown" | "not-read";
  targetCount: number;
  incompleteSourceCount?: number;
};

export function recordRepoGradesStartup(
  operation: Operation,
  outcome: Outcome,
  startedAt: number,
  countOrPreview?: number | PreviewDetail,
) {
  const detail = typeof countOrPreview === "number" ? { itemCount: Math.min(10_000, countOrPreview) } : countOrPreview;
  recordSessionDiagnosticEntry({
    at: new Date().toISOString(),
    surface: "grading",
    operation: `repo_grades_startup_${operation}`,
    outcome: outcome === "success" ? "success" : "failure",
    ...(outcome === "success" ? {} : { cause: outcome }),
    durationMs: Math.min(3_600_000, Math.max(0, Math.round(performance.now() - startedAt))),
    ...(detail === undefined ? {} : { detail }),
  });
}

export function recordRepoGradesStartupPreview(result: PreviewResult, startedAt: number) {
  try {
    if (result.status !== "preview") {
      const outcome = result.status === "request-failed" ? "request-failed"
        : result.status === "discovery-disabled" ? "disabled" : "unavailable";
      recordRepoGradesStartup("preview", outcome, startedAt);
      return;
    }
    const { discovery, history, targetCount } = result;
    const discoveryOutcome = discovery.status !== "scanned" ? discovery.status
      : !discovery.enumerationComplete || discovery.incompleteSources > 0 ? "incomplete" : "complete";
    const outcome = discoveryOutcome !== "complete" ? discoveryOutcome : history === "unknown" ? "unknown" : "success";
    recordRepoGradesStartup("preview", outcome, startedAt, {
      discoveryOutcome,
      historyOutcome: history,
      targetCount: Math.min(10_000, targetCount),
      ...(discovery.status === "scanned" && { incompleteSourceCount: Math.min(10_000, discovery.incompleteSources) }),
    });
  } catch {
    // A diagnostic failure must not prevent the preview from opening.
  }
}

export function recordRepoGradesStartupPreparation(
  { status, durationMs }: Omit<RepoGradePreparationDiagnostic, "status"> & {
    status: RepoGradePreparationDiagnostic["status"] | "request-failed";
  },
  operation: "repo_grades_startup_preparation" | "repo_grades_startup_preparation_retry" = "repo_grades_startup_preparation",
) {
  recordSessionDiagnosticEntry({
    at: new Date().toISOString(),
    surface: "grading",
    operation,
    outcome: status === "ready" ? "success" : "failure",
    ...(status === "ready" ? {} : { cause: status }),
    durationMs,
  });
}
