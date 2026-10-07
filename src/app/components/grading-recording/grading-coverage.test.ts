import { describe, it, expect } from "vitest";
import { detectCoverageGap, mergeCoverageGap } from "./grading-coverage";

// Frozen literal oracle: every signature is a flat 1024-byte buffer of one
// value, so the mean absolute difference between two of them is exactly the
// difference of their fill values. The bound below is a literal, deliberately
// NOT imported from the detector, so the near-overlap cases pin behaviour
// rather than restating the constant.
function flat(value: number): Uint8Array {
  return new Uint8Array(1024).fill(value);
}

describe("detectCoverageGap", () => {
  it("reports no gap for clearly overlapping consecutive frames", () => {
    const r = detectCoverageGap([flat(100), flat(104), flat(110)], 20);
    expect(r).toEqual({ pairsCompared: 2, gapCount: 0, gapAfter: [] });
  });

  it("reports a gap for a full-turnover pair, naming the earlier frame", () => {
    const r = detectCoverageGap([flat(100), flat(105), flat(200)], 20);
    expect(r).toEqual({ pairsCompared: 2, gapCount: 1, gapAfter: [1] });
  });

  it("treats a difference exactly at the bound as NOT a gap, one above as a gap", () => {
    expect(detectCoverageGap([flat(100), flat(120)], 20).gapCount).toBe(0);
    expect(detectCoverageGap([flat(100), flat(121)], 20).gapCount).toBe(1);
  });

  it("is direction-independent", () => {
    expect(detectCoverageGap([flat(200), flat(100)], 20).gapCount).toBe(1);
  });

  it("compares nothing for fewer than two frames", () => {
    expect(detectCoverageGap([], 20)).toEqual({ pairsCompared: 0, gapCount: 0, gapAfter: [] });
    expect(detectCoverageGap([flat(5)], 20)).toEqual({ pairsCompared: 0, gapCount: 0, gapAfter: [] });
  });

  it("uses a default bound that separates a small scroll from a total change", () => {
    expect(detectCoverageGap([flat(100), flat(103)]).gapCount).toBe(0);
    expect(detectCoverageGap([flat(0), flat(255)]).gapCount).toBe(1);
  });
});

describe("mergeCoverageGap", () => {
  it("sums counts", () => {
    const r = mergeCoverageGap({ pairsCompared: 3, gapCount: 1 }, { pairsCompared: 2, gapCount: 1, gapAfter: [0] });
    expect(r).toEqual({ pairsCompared: 5, gapCount: 2 });
  });
});
