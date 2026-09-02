import { describe, it, expect } from "vitest";
import {
  accumulateDroppedFrames,
  canGenerateDeck,
  estimateRunCost,
  describeScrollSafety,
  MAX_KEPT_FRAMES_20MIN,
  TWENTY_MINUTES_MS,
} from "./module-deck-dispatch";

describe("accumulateDroppedFrames", () => {
  it("adds a same-session delta on top of the running total", () => {
    // Live counter climbs 0 -> 3 -> 7 within one session; total tracks it 1:1.
    let total = 0;
    total = accumulateDroppedFrames(0, 3, total);
    expect(total).toBe(3);
    total = accumulateDroppedFrames(3, 7, total);
    expect(total).toBe(7);
  });

  it("preserves the first session's drops across a Start/Stop restart (AM-G)", () => {
    // This is the exact case the shipped GradingRecordingPanel gets wrong:
    // session 1 drops 5, then Start() resets the hook's live counter to 0,
    // session 2 drops 2 more. The live value at the end is only 2; a naive
    // read (what GradingRecordingPanel.tsx:464 does) would report "2 dropped"
    // when the real session total is 7.
    let total = 0;
    total = accumulateDroppedFrames(0, 5, total); // session 1 climbs to 5
    expect(total).toBe(5);
    total = accumulateDroppedFrames(5, 0, total); // start() resets live to 0 - a decrease
    expect(total).toBe(5); // nothing lost across the reset
    total = accumulateDroppedFrames(0, 2, total); // session 2 climbs to 2
    expect(total).toBe(7); // NOT 2 - the shipped panel's bug this guards against
  });

  it("handles three or more restarts, each contributing its own live delta", () => {
    let total = 0;
    total = accumulateDroppedFrames(0, 4, total); // session 1: 4
    total = accumulateDroppedFrames(4, 0, total); // restart
    total = accumulateDroppedFrames(0, 1, total); // session 2: 1
    total = accumulateDroppedFrames(1, 0, total); // restart
    total = accumulateDroppedFrames(0, 6, total); // session 3: 6
    expect(total).toBe(11);
  });

  it("treats no change as a zero delta, not a new session", () => {
    let total = 3;
    total = accumulateDroppedFrames(2, 2, total);
    expect(total).toBe(3);
  });
});

describe("canGenerateDeck", () => {
  const base = {
    blockCount: 10,
    legibleBlockCount: 5,
    templateId: "preset-classic-lecture",
    courseId: "course-1",
    capturing: false,
    extracting: false,
    busy: false,
  };

  it("allows generation when every gate is clear", () => {
    expect(canGenerateDeck(base)).toEqual({ ok: true });
  });

  it("refuses while a generation is already in flight, distinctly from capturing", () => {
    const result = canGenerateDeck({ ...base, busy: true });
    expect(result).toEqual({
      ok: false,
      reason: "A deck is already being generated for this capture. Wait for it to finish before starting another.",
    });
  });

  it("refuses while still capturing or extracting, naming the fix", () => {
    const capturing = canGenerateDeck({ ...base, capturing: true });
    const extracting = canGenerateDeck({ ...base, extracting: true });
    expect(capturing).toEqual({
      ok: false,
      reason: "Stop the capture and let the last frames finish being read first.",
    });
    expect(extracting).toEqual(capturing);
  });

  it("refuses with no course picked, naming the fix", () => {
    expect(canGenerateDeck({ ...base, courseId: "" })).toEqual({
      ok: false,
      reason: "Pick a course - the deck is saved to that course's generated content.",
    });
    expect(canGenerateDeck({ ...base, courseId: "   " })).toEqual({
      ok: false,
      reason: "Pick a course - the deck is saved to that course's generated content.",
    });
  });

  it("refuses with no template picked, using resolveDeckTemplateSelection's own string so the two cannot drift", () => {
    expect(canGenerateDeck({ ...base, templateId: "" })).toEqual({
      ok: false,
      reason: "Pick a template before generating a deck.",
    });
  });

  it("refuses when nothing was captured, naming both remaining escape hatches", () => {
    const result = canGenerateDeck({ ...base, blockCount: 0, legibleBlockCount: 0 });
    expect(result).toEqual({
      ok: false,
      reason:
        "This capture read nothing off the screen. No deck was generated. Download the run log to see what each batch reported, or run the legibility probe and try again.",
    });
  });

  it("refuses when everything captured was illegible, distinctly from the empty-capture case", () => {
    const result = canGenerateDeck({ ...base, blockCount: 8, legibleBlockCount: 0 });
    expect(result).toEqual({
      ok: false,
      reason:
        "Everything captured was too small or blurred to read. A deck built from this would be invented, not read - so none was generated. Increase your display's text size or share a single window rather than a whole 4K screen, then capture again.",
    });
  });

  it("gives every refusal a distinct reason string", () => {
    const reasons = new Set(
      [
        canGenerateDeck({ ...base, busy: true }),
        canGenerateDeck({ ...base, capturing: true }),
        canGenerateDeck({ ...base, courseId: "" }),
        canGenerateDeck({ ...base, templateId: "" }),
        canGenerateDeck({ ...base, blockCount: 0, legibleBlockCount: 0 }),
        canGenerateDeck({ ...base, blockCount: 8, legibleBlockCount: 0 }),
      ].map((r) => (r.ok ? "" : r.reason))
    );
    expect(reasons.size).toBe(6);
  });

  it("checks busy/capturing before course or template so an in-flight generation is never masked by a config gap", () => {
    const result = canGenerateDeck({ ...base, busy: true, courseId: "", templateId: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("already being generated");
    }
  });
});

describe("estimateRunCost", () => {
  it("echoes frames kept and calls so far verbatim in the live line", () => {
    const result = estimateRunCost(60_000, 40, 10);
    expect(result.framesKept).toBe(40);
    expect(result.callsSoFar).toBe(10);
    expect(result.message).toContain("40 frames kept, 10 model calls so far.");
  });

  it("uses singular nouns at exactly one", () => {
    const result = estimateRunCost(60_000, 1, 1);
    expect(result.message).toContain("1 frame kept, 1 model call so far.");
  });

  it("projects honestly at the pause-per-page extreme (1.0 frame/call) without inventing a 6x saving", () => {
    // DE3: pause-on-each-page behaviour never lets the queue accumulate, so
    // packFrameBatch averages 1.0 frame per call - 101 frames cost 101 calls,
    // not ~17. Ten minutes in, 20 frames kept and 20 calls made (1:1) must
    // extrapolate to ~40 calls for 20 minutes, not ~7 (a /6 divide-by-batch-
    // size mistake would produce something close to that wrong number).
    const tenMinutesMs = TWENTY_MINUTES_MS / 2;
    const result = estimateRunCost(tenMinutesMs, 20, 20);
    expect(result.projectedCallsFor20Min).toBe(40);
    // The wrong "divide by 6" answer would land near 7 - assert we are nowhere near it.
    expect(result.projectedCallsFor20Min).toBeGreaterThan(30);
  });

  it("projects honestly at the fast-round-trip extreme, matching DE3's measured 4s-round-trip rate", () => {
    // DE3: continuous scroll at a 4s round trip measured 301 calls over a
    // full 20-minute capture. At the 10-minute mark roughly half of that
    // (150 calls, 400 frames kept - near the 801-frame ceiling) should
    // extrapolate back out to roughly 301, not to some batch-derived constant.
    const tenMinutesMs = TWENTY_MINUTES_MS / 2;
    const result = estimateRunCost(tenMinutesMs, 400, 150);
    expect(result.projectedCallsFor20Min).toBe(300);
  });

  it("never claims a projection when no calls have happened yet, rather than dividing by zero", () => {
    const result = estimateRunCost(5_000, 3, 0);
    expect(result.projectedCallsFor20Min).toBe(0);
    expect(result.message).toContain("0 calls");
  });

  it("never mentions tokens or a currency amount (AM-K)", () => {
    const result = estimateRunCost(120_000, 80, 20);
    expect(result.message.toLowerCase()).not.toContain("token");
    expect(result.message).not.toContain("$");
  });

  it("clamps negative inputs rather than producing a negative or NaN estimate", () => {
    const result = estimateRunCost(-100, -5, -2);
    expect(result.framesKept).toBe(0);
    expect(result.callsSoFar).toBe(0);
    expect(result.projectedCallsFor20Min).toBe(0);
    expect(Number.isNaN(result.projectedCallsFor20Min)).toBe(false);
  });
});

describe("describeScrollSafety", () => {
  it("matches DE7's measured 683 px/s limit at a 1080p-class content viewport", () => {
    // Content viewport height after browser chrome, per DE7's own worked
    // numbers: 1024px content height / 1.5s rounds to 683 px/s.
    const result = describeScrollSafety(1024);
    expect(result.maxSafeScrollSpeedPxPerSec).toBe(683);
  });

  it("matches DE7's measured 763 px/s limit at a 1200p-class content viewport", () => {
    const result = describeScrollSafety(1144);
    expect(result.maxSafeScrollSpeedPxPerSec).toBe(763);
  });

  it("matches DE7's measured 1403 px/s limit at a 2160p (4K)-class content viewport", () => {
    const result = describeScrollSafety(2105);
    expect(result.maxSafeScrollSpeedPxPerSec).toBe(1403);
  });

  it("states the limit with no warning when no observed rate is supplied", () => {
    const result = describeScrollSafety(1024);
    expect(result.overLimit).toBe(false);
    expect(result.observedScrollSpeedPxPerSec).toBeNull();
    expect(result.message).toContain("683 px/s");
  });

  it("warns when an observed skim sits at the top of AC8d's normal 500-800 px/s range and exceeds the 1080p limit", () => {
    const result = describeScrollSafety(1024, 800);
    expect(result.overLimit).toBe(true);
    expect(result.message).toContain("800 px/s");
    expect(result.message).toContain("683 px/s");
  });

  it("does not warn when the observed rate is within the limit", () => {
    const result = describeScrollSafety(1024, 500);
    expect(result.overLimit).toBe(false);
  });

  it("never labels the loss as backpressure, and explicitly disclaims the dropped-frames channel (DE7 must not be conflated with AC6)", () => {
    const withinLimit = describeScrollSafety(1024, 500);
    const overLimit = describeScrollSafety(1024, 900);
    for (const result of [withinLimit, overLimit]) {
      // Never presented as the same failure mode AC6's backpressure gate reports.
      expect(result.message.toLowerCase()).not.toContain("backpressure");
    }
    // Both modes clarify - rather than silently omit - that this loss is distinct
    // from AC6's dropped-frame count, so the run log cannot mistake one for the other.
    expect(withinLimit.message.toLowerCase()).toContain("separate loss from dropped frames");
    expect(overLimit.message).toContain("dropped-frames count");
    expect(overLimit.message).toContain("not dropped");
  });

  it("ignores a zero or negative observed rate as though none were supplied", () => {
    const zero = describeScrollSafety(1024, 0);
    const negative = describeScrollSafety(1024, -50);
    expect(zero.observedScrollSpeedPxPerSec).toBeNull();
    expect(zero.overLimit).toBe(false);
    expect(negative.observedScrollSpeedPxPerSec).toBeNull();
    expect(negative.overLimit).toBe(false);
  });
});

describe("cross-check constants stay internally consistent", () => {
  it("MAX_KEPT_FRAMES_20MIN matches the measured 40/minute ceiling over 20 minutes", () => {
    // 40 frames/minute * 20 minutes = 800; DE1's stated ceiling is 801
    // (accounting for the frame kept at t=0 before the first 1500ms interval
    // elapses), so this is a sanity bound rather than an exact derivation.
    expect(MAX_KEPT_FRAMES_20MIN).toBeGreaterThanOrEqual(800);
    expect(MAX_KEPT_FRAMES_20MIN).toBeLessThan(850);
  });
});
