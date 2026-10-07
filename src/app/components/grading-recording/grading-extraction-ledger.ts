// DET-Wave 1 (docs/grading-recording-detection-reliability-scope.md, Change 3,
// FM-2): a durable per-run ledger of extraction batch outcomes. Before this,
// a failed batch's frames were removed from the capture queue and only an
// ephemeral, dismissable notice remained, so a run with several failed
// batches looked complete. The ledger counts capture windows (frames)
// attempted versus unread so a later surface can say "N of M capture windows
// could not be read". Pure and dependency-free; its caller is
// useGradingRecordingExtraction.ts.

/** One finished extraction batch: how many frames it held and whether it was read. */
export type GradingBatchOutcome =
  | { ok: true; frames: number }
  | { ok: false; frames: number; reason: string };

export interface GradingExtractionLedger {
  batchesAttempted: number;
  batchesFailed: number;
  /** Capture windows (frames) sent to the model, across all batches. */
  windowsAttempted: number;
  /** Capture windows in batches that failed - these posts were never read. */
  windowsUnread: number;
  /** The reason of each failed batch, oldest first. */
  failureReasons: string[];
}

export const EMPTY_GRADING_EXTRACTION_LEDGER: GradingExtractionLedger = {
  batchesAttempted: 0,
  batchesFailed: 0,
  windowsAttempted: 0,
  windowsUnread: 0,
  failureReasons: [],
};

/** Folds one batch outcome into the ledger. Never mutates its input. */
export function foldBatchOutcome(
  ledger: GradingExtractionLedger,
  outcome: GradingBatchOutcome
): GradingExtractionLedger {
  const frames = Math.max(0, outcome.frames);
  return {
    batchesAttempted: ledger.batchesAttempted + 1,
    batchesFailed: ledger.batchesFailed + (outcome.ok ? 0 : 1),
    windowsAttempted: ledger.windowsAttempted + frames,
    windowsUnread: ledger.windowsUnread + (outcome.ok ? 0 : frames),
    failureReasons: outcome.ok ? ledger.failureReasons : [...ledger.failureReasons, outcome.reason],
  };
}
