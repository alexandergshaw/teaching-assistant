import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";

type Operation = "readiness" | "courses" | "discovery" | "history" | "evaluation" | "stop";
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
