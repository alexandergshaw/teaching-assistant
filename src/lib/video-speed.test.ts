import { describe, expect, it } from "vitest";
import {
  SPEED_RATES,
  computeSpeedProgress,
  formatSpeedLabel,
  isSpeedRate,
  speedAdjustedDurationSec,
  speedAdjustedName,
} from "./video-speed";

// The renderer itself (renderSpeedAdjustedVideo) needs MediaRecorder, canvas,
// AudioContext and a real <video> element - none of which exist in this
// node-env vitest run. Only the pure helpers below are reachable from here;
// see docs/video-speed-adjust-acceptance-criteria.md's Limits section.

describe("SPEED_RATES", () => {
  it("is the closed set from the acceptance criteria, in order", () => {
    expect(SPEED_RATES).toEqual([0.5, 0.75, 1.25, 1.5, 1.75, 2]);
  });

  it("excludes the near-1.0 band where Chromium resamples instead of time-stretching", () => {
    for (const rate of SPEED_RATES) {
      expect(rate < 0.95 || rate > 1.06).toBe(true);
    }
  });

  it("stays inside the documented safe audio window on both ends", () => {
    for (const rate of SPEED_RATES) {
      expect(rate).toBeGreaterThanOrEqual(0.5);
      expect(rate).toBeLessThanOrEqual(2);
    }
  });
});

describe("isSpeedRate", () => {
  it("accepts every offered rate", () => {
    for (const rate of SPEED_RATES) {
      expect(isSpeedRate(rate)).toBe(true);
    }
  });

  it("rejects a rate that is not in the set", () => {
    expect(isSpeedRate(1.3)).toBe(false);
  });

  it("rejects the excluded near-1.0 values", () => {
    expect(isSpeedRate(1)).toBe(false);
    expect(isSpeedRate(0.95)).toBe(false);
    expect(isSpeedRate(1.06)).toBe(false);
  });

  it("rejects rates outside the offered range", () => {
    expect(isSpeedRate(0.25)).toBe(false);
    expect(isSpeedRate(4)).toBe(false);
  });

  it("rejects a numeric string, since the value must actually be a number", () => {
    expect(isSpeedRate("1.5")).toBe(false);
  });

  it("rejects non-numeric values without throwing", () => {
    expect(isSpeedRate(null)).toBe(false);
    expect(isSpeedRate(undefined)).toBe(false);
    expect(isSpeedRate({})).toBe(false);
  });
});

describe("formatSpeedLabel", () => {
  it("formats every offered rate per the acceptance criteria's table", () => {
    expect(formatSpeedLabel(0.5)).toBe("0.5x");
    expect(formatSpeedLabel(1.25)).toBe("1.25x");
    expect(formatSpeedLabel(1.5)).toBe("1.5x");
    expect(formatSpeedLabel(2)).toBe("2x");
  });

  it("trims trailing zeros so 2 never reads 2.0x or 2.00x", () => {
    expect(formatSpeedLabel(2)).toBe("2x");
    expect(formatSpeedLabel(0.75)).toBe("0.75x");
  });

  it("rounds away floating-point drift instead of exposing it", () => {
    // 0.1 + 0.4 in IEEE754 is 0.49999999999999994, not 0.5.
    expect(formatSpeedLabel(0.1 + 0.4)).toBe("0.5x");
  });
});

describe("speedAdjustedName", () => {
  it("appends the rate in parentheses", () => {
    expect(speedAdjustedName("Week 3 module", 1.5)).toBe("Week 3 module (1.5x)");
  });

  it("stacks a second suffix rather than collapsing it, because a second pass really is a different rate off the original", () => {
    expect(speedAdjustedName("Take 3 (1.5x)", 1.5)).toBe("Take 3 (1.5x) (1.5x)");
  });
});

describe("speedAdjustedDurationSec", () => {
  it("divides source duration by rate", () => {
    expect(speedAdjustedDurationSec(600, 0.5)).toBe(1200);
    expect(speedAdjustedDurationSec(600, 1.5)).toBe(400);
  });

  it("returns null for a null source duration", () => {
    expect(speedAdjustedDurationSec(null, 1.5)).toBeNull();
  });

  it("returns null for an infinite source duration", () => {
    expect(speedAdjustedDurationSec(Infinity, 1.5)).toBeNull();
  });

  it("returns null for a zero or negative source duration", () => {
    expect(speedAdjustedDurationSec(0, 1.5)).toBeNull();
    expect(speedAdjustedDurationSec(-5, 1.5)).toBeNull();
  });

  it("returns null for a NaN source duration", () => {
    expect(speedAdjustedDurationSec(NaN, 1.5)).toBeNull();
  });

  it("returns null for a zero, negative, NaN or infinite rate", () => {
    expect(speedAdjustedDurationSec(600, 0)).toBeNull();
    expect(speedAdjustedDurationSec(600, -1)).toBeNull();
    expect(speedAdjustedDurationSec(600, NaN)).toBeNull();
    expect(speedAdjustedDurationSec(600, Infinity)).toBeNull();
  });
});

describe("computeSpeedProgress", () => {
  it("reports 0 percent, full remaining time at the start", () => {
    const progress = computeSpeedProgress(0, 600, 1.5);
    expect(progress.pct).toBe(0);
    expect(progress.elapsedSourceSec).toBe(0);
    expect(progress.remainingWallSec).toBe(400);
  });

  it("reports 100 percent, 0 remaining time at the end", () => {
    const progress = computeSpeedProgress(600, 600, 1.5);
    expect(progress.pct).toBe(100);
    expect(progress.remainingWallSec).toBe(0);
  });

  it("computes remaining wall-clock time from what is left of the source, divided by rate", () => {
    // Halfway through a 10-minute source at 0.5x: 5 minutes of source left,
    // which takes 10 minutes of wall clock at half speed.
    const progress = computeSpeedProgress(300, 600, 0.5);
    expect(progress.pct).toBe(50);
    expect(progress.remainingWallSec).toBe(600);
  });

  it("clamps pct to 100 rather than overshooting on a final partial tick", () => {
    const progress = computeSpeedProgress(600.5, 600, 1.5);
    expect(progress.pct).toBe(100);
  });

  it("never reports negative remaining time on an overshoot", () => {
    const progress = computeSpeedProgress(600.5, 600, 1.5);
    expect(progress.remainingWallSec).toBe(0);
  });

  it("falls back to 0/0 rather than NaN or Infinity for a non-finite duration", () => {
    const progress = computeSpeedProgress(10, Infinity, 1.5);
    expect(progress.pct).toBe(0);
    expect(progress.remainingWallSec).toBe(0);
  });

  it("falls back to 0/0 rather than dividing by zero rate", () => {
    const progress = computeSpeedProgress(10, 600, 0);
    expect(progress.pct).toBe(0);
    expect(progress.remainingWallSec).toBe(0);
  });
});
