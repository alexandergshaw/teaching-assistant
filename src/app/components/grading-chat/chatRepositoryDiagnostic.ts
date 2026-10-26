import { recordGradingDiagnosticEntry } from "../grading/gradingDiagnosticLog";
import type { RepositoryBatchResult, RepositoryStageOutcome } from "./chatRepositoryBatch";
import type { RepositoryCollectResponse } from "@/lib/grade/repository-evidence-types";
import type { RepositoryWorkflowCounts, RepositoryWorkflowOperation } from "./chatRepositoryWorkflow";

export function recordRepositoryWorkflow(operation: RepositoryWorkflowOperation, success: boolean, startedAtMs: number, counts: RepositoryWorkflowCounts): void {
  try {
    recordGradingDiagnosticEntry({ at: new Date().toISOString(), operation: operation === "propose" ? "propose_repository_grade" : operation === "review" ? "review_repository_grade" : "accept_repository_grade",
      outcome: success ? "success" : "failure", durationMs: Math.max(0, Math.round(performance.now() - startedAtMs)),
      error: success ? undefined : operation === "propose" ? "Repository proposal failed" : operation === "review" ? "Repository review failed" : "Repository acceptance refused",
      repositoryDetail: { criteriaChanged: counts.criteriaChanged, reviewFindings: counts.reviewFindings, acceptedFields: counts.acceptedFields } });
  } catch { /* Diagnostics cannot change repository operations. */ }
}

export function recordRepositoryCollection(success: boolean, response: RepositoryCollectResponse | undefined, startedAtMs: number, acceptedLinks = 0): void {
  try {
    recordGradingDiagnosticEntry({
      at: new Date().toISOString(), operation: "collect_repository_evidence", outcome: success ? "success" : "failure",
      durationMs: Math.max(0, Math.round(performance.now() - startedAtMs)),
      error: success ? undefined : "Repository evidence collection failed",
      repositoryDetail: response ? { acceptedLinks: response.mappings.length,
        includedFiles: response.evidence.reduce((sum, item) => sum + item.manifest.files.length, 0),
        omittedFiles: response.evidence.reduce((sum, item) => sum + item.manifest.coverage.omitted.length, 0),
        partialCoverage: response.evidence.some((item) => !item.manifest.coverage.complete) } : { acceptedLinks },
    });
  } catch { /* Diagnostics cannot change collection. */ }
}

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
