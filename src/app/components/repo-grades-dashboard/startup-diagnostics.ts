import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import type { RepoGradePreparationDiagnostic } from "@/lib/repo-grades-dashboard/preparation-runtime";

type Operation = "readiness" | "courses" | "discovery" | "history" | "evaluation" | "stop"
  | "batch_read" | "batch_seal" | "batch_close";
type Outcome = "success" | "unavailable" | "incomplete" | "request-failed" | "failed" | "unknown" | "blocked";

export function recordRepoGradesStartup(
  operation: Operation,
  outcome: Outcome,
  startedAt: number,
  count?: number,
) {
  recordSessionDiagnosticEntry({
    at: new Date().toISOString(),
    surface: "grading",
    operation: `repo_grades_startup_${operation}`,
    outcome: outcome === "success" ? "success" : "failure",
    ...(outcome === "success" ? {} : { cause: outcome }),
    durationMs: Math.min(3_600_000, Math.max(0, Math.round(performance.now() - startedAt))),
    ...(count === undefined ? {} : { detail: { itemCount: Math.min(10_000, count) } }),
  });
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
