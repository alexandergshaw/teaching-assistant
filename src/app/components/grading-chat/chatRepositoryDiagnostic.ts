import { recordGradingDiagnosticEntry } from "../grading/gradingDiagnosticLog";
import type { RepositoryBatchResult, RepositoryStageOutcome } from "./chatRepositoryBatch";

export function recordRepositoryStaging(args: {
  outcome: RepositoryStageOutcome;
  startedAtMs: number;
  settledAtMs: number;
  at: string;
}): void {
  try {
    const elapsed = args.settledAtMs - args.startedAtMs;
    recordGradingDiagnosticEntry({
      at: args.at,
      operation: "stage_repository_evidence",
      outcome: args.outcome === "staged" ? "success" : "failure",
      durationMs: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0,
      error: args.outcome === "staged" ? undefined : args.outcome === "refused"
        ? "Repository evidence batch refused" : "Repository evidence needs attention",
    });
  } catch {
    // Telemetry cannot change local staging.
  }
}

/** The UI passes the current operation result, never the retained history. */
export function recordRepositoryBatchResult(result: RepositoryBatchResult, timing: {
  startedAtMs: number;
  settledAtMs: number;
  at: string;
}): void {
  recordRepositoryStaging({ ...timing, outcome: result.outcome });
}
