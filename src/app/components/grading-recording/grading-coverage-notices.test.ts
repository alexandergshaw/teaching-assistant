import { describe, it, expect } from "vitest";
import { coverageGapNotice, ledgerUnreadNotice } from "./grading-coverage-notices";
import { EMPTY_GRADING_EXTRACTION_LEDGER, foldBatchOutcome, type GradingExtractionLedger } from "./grading-extraction-ledger";

describe("coverageGapNotice", () => {
  it("is null with no gap, including the pre-capture zero and a defensive negative/NaN", () => {
    expect(coverageGapNotice(0)).toBeNull();
    expect(coverageGapNotice(-1)).toBeNull();
    expect(coverageGapNotice(Number.NaN)).toBeNull();
  });

  it("names the gap count and tells the instructor to review and add missing posts", () => {
    const one = coverageGapNotice(1);
    expect(one).toContain("1 gap detected");
    expect(one).toContain("add any that are missing");
    expect(coverageGapNotice(3)).toContain("3 gaps detected");
  });
});

describe("ledgerUnreadNotice", () => {
  it("is null for an empty ledger and for a ledger where every batch was read", () => {
    expect(ledgerUnreadNotice(EMPTY_GRADING_EXTRACTION_LEDGER)).toBeNull();
    const ok = foldBatchOutcome(EMPTY_GRADING_EXTRACTION_LEDGER, { ok: true, frames: 4 });
    expect(ledgerUnreadNotice(ok)).toBeNull();
  });

  it("reports N of M windows once a batch failed (frozen sequence: ok 4, fail 3, ok 5)", () => {
    let ledger: GradingExtractionLedger = EMPTY_GRADING_EXTRACTION_LEDGER;
    ledger = foldBatchOutcome(ledger, { ok: true, frames: 4 });
    ledger = foldBatchOutcome(ledger, { ok: false, frames: 3, reason: "timeout" });
    ledger = foldBatchOutcome(ledger, { ok: true, frames: 5 });
    expect(ledgerUnreadNotice(ledger)).toContain("3 of 12 capture windows could not be read");
  });
});

describe("the two notices are independent of each other", () => {
  it("a gap with a clean ledger shows only the gap notice, and the reverse", () => {
    const failed = foldBatchOutcome(EMPTY_GRADING_EXTRACTION_LEDGER, { ok: false, frames: 2, reason: "x" });
    expect(coverageGapNotice(2)).not.toBeNull();
    expect(ledgerUnreadNotice(EMPTY_GRADING_EXTRACTION_LEDGER)).toBeNull();
    expect(coverageGapNotice(0)).toBeNull();
    expect(ledgerUnreadNotice(failed)).not.toBeNull();
  });
});
