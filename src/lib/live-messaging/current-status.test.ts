import { describe, expect, it } from "vitest";
import {
  AT_RISK_BELOW,
  CURRENT_STATUS_LABELS,
  FAILING_BELOW,
  currentStatusFor,
} from "./current-status";

describe("currentStatusFor (orchestrator default band, pending the owner definition)", () => {
  it("bands a score by the two thresholds", () => {
    expect(currentStatusFor(100)).toBe("on-track");
    expect(currentStatusFor(AT_RISK_BELOW)).toBe("on-track");
    expect(currentStatusFor(AT_RISK_BELOW - 0.01)).toBe("at-risk");
    expect(currentStatusFor(FAILING_BELOW)).toBe("at-risk");
    expect(currentStatusFor(FAILING_BELOW - 0.01)).toBe("failing");
    expect(currentStatusFor(0)).toBe("failing");
  });

  it("treats a missing or non-finite grade as unknown, never failing", () => {
    expect(currentStatusFor(null)).toBe("unknown");
    expect(currentStatusFor(Number.NaN)).toBe("unknown");
    expect(currentStatusFor(Number.POSITIVE_INFINITY)).toBe("unknown");
  });

  it("has a label for every band", () => {
    for (const status of ["on-track", "at-risk", "failing", "unknown"] as const) {
      expect(CURRENT_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });
});
