import type { GradeResult, StudentSubmissionEntry } from "@/lib/grade/types";
import type { LlmProvider } from "@/lib/llm";
import type { GradeRunItemRequestBody } from "@/app/components/grading/incrementalRunPlan";
import type { ItemDiagnosticSink } from "./chatGradeDetail";
import type { IngestOutcome } from "@/lib/grade/ndjson-ingest-parser";
import type { ClassifyRecordingFn, PrepareVideoFn } from "./videoClient";
import type { PrepareSingleFileFn } from "./singleFileClient";

export interface UseContinuousGradingRunParams {
  readonly provider: LlmProvider;
  /** Defaults to the real /api/grade-run-item POST. */
  readonly dispatchItem?: (request: GradeRunItemRequestBody, sink?: ItemDiagnosticSink) => Promise<GradeResult>;
  /** Defaults to the real never-throw NDJSON client for ZIP ingestion. */
  readonly ingestZip?: (storagePath: string, provider: string, onEntry: (entry: StudentSubmissionEntry) => void, reviewedZipMapping?: Readonly<Record<string, string>>, staticOnly?: true, expectedOwnerSession?: { readonly accountId: string; readonly sessionId: string }) => Promise<IngestOutcome>;
  readonly prepareVideo?: PrepareVideoFn;
  readonly classifyRecording?: ClassifyRecordingFn;
  readonly prepareSingleFile?: PrepareSingleFileFn;
  readonly maxEntries?: number;
  readonly commentSplit?: boolean;
  /** Internal test gate; the page must not enable until mixed-version operations are safe. */
  readonly enableSetupCorrections?: boolean;
}
