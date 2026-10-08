// BULK-ZIP BW4 (docs/bulk-zip-finish-scope.md sections 3.1-3.2). Pure leaves,
// no React and no fetch, so vitest exercises every branch (no component renders
// in this repo's tests).
//
// Student-level vs file-level identity: `skipped` (oversized students) and
// `linkNotFetched` (students graded on a bare link note) are STUDENT outcomes.
// `failedFiles` is a per-FILE informational list - a student with one failed file
// can still grade on their other files - so it is never a student category and
// never enters the accounting identity.
import type { GradeResult } from "@/lib/grade/types";
import type { IngestLedger } from "@/lib/grade/ndjson-ingest-parser";

export interface LedgerView {
  /** Oversized students the ingest skipped, with the reason (student-level). */
  readonly skipped: readonly { readonly student: string; readonly reason: string }[];
  /** Graded students whose link was not fetched (a SUBSET of the graded rows). */
  readonly linkNotFetched: readonly { readonly student: string }[];
  /** Supported files that failed to extract (per-FILE, informational only). */
  readonly failedFiles: readonly string[];
  /** studentsFound === studentsEmitted + skipped.length (student-level). */
  readonly accountedFor: boolean;
  readonly hasAny: boolean;
}

/** Folds a later zip's ledger into the retained one, so a second zip never erases the first. */
export function mergeIngestLedgers(prev: IngestLedger | null, next: IngestLedger): IngestLedger {
  if (prev === null) return next;
  return {
    studentsFound: prev.studentsFound + next.studentsFound,
    studentsEmitted: prev.studentsEmitted + next.studentsEmitted,
    skipped: [...prev.skipped, ...next.skipped],
    failedSupportedFiles: [...prev.failedSupportedFiles, ...next.failedSupportedFiles],
  };
}

export function buildLedgerView(
  results: readonly GradeResult[],
  ledger: IngestLedger | null
): LedgerView {
  const skipped = ledger ? ledger.skipped.map((s) => ({ student: s.student, reason: s.reason })) : [];
  const failedFiles = ledger ? [...ledger.failedSupportedFiles] : [];
  const linkNotFetched = results
    .filter((r) => r.linkFetch === "failed" || r.linkFetch === "flagged")
    .map((r) => ({ student: r.student }));
  const accountedFor = ledger ? ledger.studentsFound === ledger.studentsEmitted + ledger.skipped.length : true;
  return {
    skipped,
    linkNotFetched,
    failedFiles,
    accountedFor,
    hasAny: skipped.length > 0 || linkNotFetched.length > 0 || failedFiles.length > 0 || !accountedFor,
  };
}

export type BulkProgressPhase = "idle" | "uploading" | "preparing" | "grading";

export function describeBulkProgress(args: {
  readonly phase: BulkProgressPhase;
  readonly dispatchedCount: number;
  readonly completedCount: number;
}): string {
  switch (args.phase) {
    case "uploading":
      return "Uploading zip...";
    case "preparing":
      return "Preparing students...";
    case "grading": {
      const outstanding = args.dispatchedCount - args.completedCount;
      if (outstanding <= 0) return "";
      return `${outstanding} of ${args.dispatchedCount} students still grading`;
    }
    default:
      return "";
  }
}
