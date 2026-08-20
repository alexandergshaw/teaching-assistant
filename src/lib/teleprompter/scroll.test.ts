import { describe, expect, it } from "vitest";
import { LECTURE_SCRIPT_WORDS_PER_MINUTE } from "@/lib/lecture-script-bounds";
import {
  DEFAULT_SCROLL_SPEED_MULTIPLIER,
  MANUAL_SCROLL_TOLERANCE_PX,
  SCROLL_SPEED_MULTIPLIERS,
  autoScrollTop,
  expectedDurationMs,
  isManualScroll,
  resolveScrollSpeed,
  scriptProgressFraction,
} from "./scroll";

const MINUTE = 60_000;

describe("resolveScrollSpeed", () => {
  it("passes through every offered multiplier, as a number or a string", () => {
    for (const speed of SCROLL_SPEED_MULTIPLIERS) {
      expect(resolveScrollSpeed(speed), `${speed} as a number`).toBe(speed);
      expect(resolveScrollSpeed(String(speed)), `${speed} as a string`).toBe(speed);
    }
  });

  it("defaults anything the control never offered", () => {
    // Membership, not range - 1.1 sits between two offered values and would
    // leave the select rendering with nothing selected.
    for (const junk of [1.1, 0, -1, 99, null, undefined, "fast", Number.NaN, {}]) {
      expect(resolveScrollSpeed(junk), String(junk)).toBe(DEFAULT_SCROLL_SPEED_MULTIPLIER);
    }
  });

  it("offers the default, so the default is always selectable", () => {
    expect(SCROLL_SPEED_MULTIPLIERS).toContain(DEFAULT_SCROLL_SPEED_MULTIPLIER);
  });
});

describe("scriptProgressFraction", () => {
  const totalWords = LECTURE_SCRIPT_WORDS_PER_MINUTE * 10; // a 10-minute script

  it("is zero at the start", () => {
    expect(scriptProgressFraction({ elapsedMs: 0, totalWords, scrollableDistance: 1000 })).toBe(0);
  });

  it("reaches the end exactly when the script would be delivered at the target pace", () => {
    expect(scriptProgressFraction({ elapsedMs: 10 * MINUTE, totalWords, scrollableDistance: 1000 })).toBe(1);
  });

  it("is half way at half the delivery time", () => {
    expect(scriptProgressFraction({ elapsedMs: 5 * MINUTE, totalWords, scrollableDistance: 1000 })).toBeCloseTo(0.5, 10);
  });

  it("never exceeds one, however long the instructor overruns", () => {
    expect(scriptProgressFraction({ elapsedMs: 60 * MINUTE, totalWords, scrollableDistance: 1000 })).toBe(1);
  });

  it("moves faster with a higher multiplier and slower with a lower one", () => {
    const at = (speedMultiplier: number) =>
      scriptProgressFraction({ elapsedMs: 2 * MINUTE, totalWords, scrollableDistance: 1000, speedMultiplier });
    expect(at(1.5)).toBeGreaterThan(at(1));
    expect(at(0.5)).toBeLessThan(at(1));
  });

  // Every guard below protects a value that is assigned straight to a DOM
  // property, where NaN silently does nothing.
  it("returns zero rather than NaN for a degenerate script or clock", () => {
    expect(scriptProgressFraction({ elapsedMs: 1000, totalWords: 0, scrollableDistance: 1000 })).toBe(0);
    expect(scriptProgressFraction({ elapsedMs: 1000, totalWords: -5, scrollableDistance: 1000 })).toBe(0);
    expect(scriptProgressFraction({ elapsedMs: -1000, totalWords, scrollableDistance: 1000 })).toBe(0);
    expect(scriptProgressFraction({ elapsedMs: Number.NaN, totalWords, scrollableDistance: 1000 })).toBe(0);
    expect(scriptProgressFraction({ elapsedMs: 1000, totalWords: Number.NaN, scrollableDistance: 1000 })).toBe(0);
  });

  it("always returns a fraction inside [0, 1]", () => {
    const probes = [-1, 0, 1, 1000, MINUTE, 100 * MINUTE, Number.NaN, Number.POSITIVE_INFINITY];
    for (const elapsedMs of probes) {
      const f = scriptProgressFraction({ elapsedMs, totalWords, scrollableDistance: 1000 });
      expect(f, `${elapsedMs} ms`).toBeGreaterThanOrEqual(0);
      expect(f, `${elapsedMs} ms`).toBeLessThanOrEqual(1);
    }
  });
});

describe("autoScrollTop", () => {
  const totalWords = LECTURE_SCRIPT_WORDS_PER_MINUTE * 10;

  it("maps the progress fraction onto the scrollable distance", () => {
    expect(autoScrollTop({ elapsedMs: 5 * MINUTE, totalWords, scrollableDistance: 800 })).toBe(400);
  });

  it("is zero when the script fits without scrolling", () => {
    // scrollHeight === clientHeight, so there is nowhere to go - and dividing
    // by it would be the obvious way to get NaN here.
    expect(autoScrollTop({ elapsedMs: 5 * MINUTE, totalWords, scrollableDistance: 0 })).toBe(0);
    expect(autoScrollTop({ elapsedMs: 5 * MINUTE, totalWords, scrollableDistance: -10 })).toBe(0);
  });

  it("returns an integer, so the position does not jitter frame to frame", () => {
    for (const elapsedMs of [1000, 7777, 123456]) {
      const top = autoScrollTop({ elapsedMs, totalWords, scrollableDistance: 913 });
      expect(Number.isInteger(top), `${elapsedMs} ms`).toBe(true);
    }
  });

  it("never scrolls past the end", () => {
    expect(autoScrollTop({ elapsedMs: 999 * MINUTE, totalWords, scrollableDistance: 800 })).toBe(800);
  });

  it("is monotonic - it never scrolls backwards as time advances", () => {
    let previous = -1;
    for (let ms = 0; ms <= 12 * MINUTE; ms += 5000) {
      const top = autoScrollTop({ elapsedMs: ms, totalWords, scrollableDistance: 800 });
      expect(top, `${ms} ms`).toBeGreaterThanOrEqual(previous);
      previous = top;
    }
  });
});

describe("expectedDurationMs", () => {
  it("is the length the pace target implies", () => {
    expect(expectedDurationMs(LECTURE_SCRIPT_WORDS_PER_MINUTE * 10)).toBe(10 * MINUTE);
  });

  it("shortens at a higher multiplier and lengthens at a lower one", () => {
    const words = LECTURE_SCRIPT_WORDS_PER_MINUTE * 10;
    expect(expectedDurationMs(words, 1.5)).toBeLessThan(expectedDurationMs(words, 1));
    expect(expectedDurationMs(words, 0.5)).toBeGreaterThan(expectedDurationMs(words, 1));
  });

  it("ignores a multiplier the control never offered, rather than honouring it", () => {
    // 2 is not in SCROLL_SPEED_MULTIPLIERS, so it resolves to the default -
    // the same membership-not-range rule resolveScrollSpeed enforces. Pinned
    // because it is genuinely surprising, and because an earlier draft of
    // this very test file assumed 2 would be honoured.
    const words = LECTURE_SCRIPT_WORDS_PER_MINUTE * 10;
    expect(expectedDurationMs(words, 2)).toBe(expectedDurationMs(words, DEFAULT_SCROLL_SPEED_MULTIPLIER));
  });

  it("is zero for an empty script rather than NaN or Infinity", () => {
    expect(expectedDurationMs(0)).toBe(0);
    expect(expectedDurationMs(-1)).toBe(0);
    expect(expectedDurationMs(Number.NaN)).toBe(0);
  });
});

describe("isManualScroll", () => {
  // THE POINT: without the tolerance, auto-scroll detects its OWN write as
  // human input on the very next frame and disables itself, because browsers
  // round scrollTop and smooth scrolling lands a pixel or two off.
  it("ignores a difference within tolerance, so auto-scroll does not disable itself", () => {
    expect(isManualScroll(400, 400)).toBe(false);
    expect(isManualScroll(400 + MANUAL_SCROLL_TOLERANCE_PX, 400)).toBe(false);
    expect(isManualScroll(400 - MANUAL_SCROLL_TOLERANCE_PX, 400)).toBe(false);
  });

  it("detects a real human scroll in either direction", () => {
    expect(isManualScroll(400 + MANUAL_SCROLL_TOLERANCE_PX + 1, 400)).toBe(true);
    expect(isManualScroll(120, 400)).toBe(true);
  });

  it("treats a non-finite reading as not-manual rather than yielding forever", () => {
    expect(isManualScroll(Number.NaN, 400)).toBe(false);
    expect(isManualScroll(400, Number.NaN)).toBe(false);
  });
});
