import { describe, it, expect } from "vitest";
import {
  EMPTY_GRADING_EXTRACTION_LEDGER,
  foldBatchOutcome,
  type GradingBatchOutcome,
  type GradingExtractionLedger,
} from "./grading-extraction-ledger";

function foldAll(outcomes: GradingBatchOutcome[]): GradingExtractionLedger {
  return outcomes.reduce(foldBatchOutcome, EMPTY_GRADING_EXTRACTION_LEDGER);
}

describe("foldBatchOutcome", () => {
  it("folds a frozen success/failure sequence into the expected 'N of M unread' ledger", () => {
    const ledger = foldAll([
      { ok: true, frames: 6 },
      { ok: false, frames: 6, reason: "rate limited" },
      { ok: true, frames: 4 },
      { ok: false, frames: 3, reason: "unparseable" },
    ]);
    expect(ledger).toEqual({
      batchesAttempted: 4,
      batchesFailed: 2,
      windowsAttempted: 19,
      windowsUnread: 9,
      failureReasons: ["rate limited", "unparseable"],
    });
  });

  it("an all-success run reports zero unread", () => {
    const ledger = foldAll([
      { ok: true, frames: 6 },
      { ok: true, frames: 2 },
    ]);
    expect(ledger.windowsUnread).toBe(0);
    expect(ledger.batchesFailed).toBe(0);
    expect(ledger.failureReasons).toEqual([]);
  });

  it("does not mutate the ledger it was given", () => {
    const before = foldBatchOutcome(EMPTY_GRADING_EXTRACTION_LEDGER, { ok: false, frames: 5, reason: "x" });
    const snapshot = JSON.stringify(before);
    foldBatchOutcome(before, { ok: false, frames: 2, reason: "y" });
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(EMPTY_GRADING_EXTRACTION_LEDGER.batchesAttempted).toBe(0);
  });

  it("clamps a negative frame count to zero", () => {
    const ledger = foldBatchOutcome(EMPTY_GRADING_EXTRACTION_LEDGER, { ok: false, frames: -3, reason: "x" });
    expect(ledger.windowsAttempted).toBe(0);
    expect(ledger.windowsUnread).toBe(0);
  });
});
