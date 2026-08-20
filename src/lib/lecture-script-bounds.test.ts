import { describe, expect, it } from "vitest";
import {
  LECTURE_SCRIPT_MAX_MINUTES,
  LECTURE_SCRIPT_MIN_MINUTES,
  LECTURE_SCRIPT_WORDS_PER_MINUTE,
  checkLectureScriptMinutes,
  lectureScriptMaxOutputTokens,
  lectureScriptWordTarget,
} from "./lecture-script-bounds";

describe("checkLectureScriptMinutes", () => {
  it("accepts both bounds and everything between", () => {
    for (const minutes of [LECTURE_SCRIPT_MIN_MINUTES, 5, 15, 22, LECTURE_SCRIPT_MAX_MINUTES]) {
      expect(checkLectureScriptMinutes(minutes), `${minutes} minutes`).toEqual({ ok: true, minutes });
    }
  });

  // THE DEFECT THIS FILE EXISTS FOR. The old resolution was
  //   Number.isFinite(x) && x >= 1 && x <= 30 ? Math.round(x) : 5
  // so 50 did not clamp to 30 - it became 5, and the caller was never told.
  // steps.media.ts passed exactly this value.
  it("REFUSES the workflow step's old 50 rather than substituting any other length", () => {
    const result = checkLectureScriptMinutes(50);
    expect(result.ok).toBe(false);
    // The failure must be attributable: it names the offending value and the
    // range, so a run-form user can fix it without reading the source.
    if (result.ok) throw new Error("expected a refusal");
    expect(result.error).toContain("50");
    expect(result.error).toContain(String(LECTURE_SCRIPT_MAX_MINUTES));
  });

  it("never returns a minutes value the caller did not ask for", () => {
    // The property that matters, stated directly: for EVERY input, either the
    // call fails, or it returns the caller's own value (rounded). There is no
    // third outcome. A clamp (50 -> 30) would violate this too, which is why
    // clamping was rejected along with the fallback.
    const probes = [-10, 0, 0.4, 1, 12.4, 12.6, 29.9, 30, 30.1, 45, 50, 120, 1000];
    for (const probe of probes) {
      const result = checkLectureScriptMinutes(probe);
      if (result.ok) {
        expect(result.minutes, `${probe} minutes`).toBe(Math.round(probe));
      }
    }
  });

  it("refuses just outside each bound", () => {
    expect(checkLectureScriptMinutes(LECTURE_SCRIPT_MIN_MINUTES - 0.1).ok).toBe(false);
    expect(checkLectureScriptMinutes(LECTURE_SCRIPT_MAX_MINUTES + 0.1).ok).toBe(false);
    expect(checkLectureScriptMinutes(0).ok).toBe(false);
  });

  it("rounds a fraction inside the range instead of refusing it", () => {
    expect(checkLectureScriptMinutes(12.4)).toEqual({ ok: true, minutes: 12 });
    expect(checkLectureScriptMinutes(12.6)).toEqual({ ok: true, minutes: 13 });
  });

  it("refuses a non-number and a non-finite number rather than defaulting", () => {
    for (const junk of [undefined, null, "15", Number.NaN, Number.POSITIVE_INFINITY, {}, []]) {
      expect(checkLectureScriptMinutes(junk).ok, String(junk)).toBe(false);
    }
  });
});

describe("lectureScriptWordTarget", () => {
  it("is minutes times the speaking pace", () => {
    expect(lectureScriptWordTarget(10)).toBe(10 * LECTURE_SCRIPT_WORDS_PER_MINUTE);
  });
});

describe("lectureScriptMaxOutputTokens", () => {
  // THE SECOND HALF OF THE DEFECT. The call previously hardcoded 4096, which
  // at 140 wpm covers roughly 22 minutes - so an ACCEPTED 30-minute request
  // was still truncated mid-script, silently. An accepted length has to be a
  // producible length or the range is a second lie.
  it("covers the longest accepted script, which a fixed 4096 did not", () => {
    const longest = lectureScriptMaxOutputTokens(LECTURE_SCRIPT_MAX_MINUTES);
    const wordsAtMax = lectureScriptWordTarget(LECTURE_SCRIPT_MAX_MINUTES);
    expect(longest).toBeGreaterThan(4096);
    // At least one token per word, with headroom - a budget below the word
    // count cannot possibly render the script.
    expect(longest).toBeGreaterThan(wordsAtMax);
  });

  it("gives every accepted length a budget of at least one token per word", () => {
    for (let minutes = LECTURE_SCRIPT_MIN_MINUTES; minutes <= LECTURE_SCRIPT_MAX_MINUTES; minutes++) {
      expect(lectureScriptMaxOutputTokens(minutes), `${minutes} minutes`).toBeGreaterThan(
        lectureScriptWordTarget(minutes)
      );
    }
  });

  it("grows with the requested length, never shrinks", () => {
    let previous = 0;
    for (let minutes = LECTURE_SCRIPT_MIN_MINUTES; minutes <= LECTURE_SCRIPT_MAX_MINUTES; minutes++) {
      const budget = lectureScriptMaxOutputTokens(minutes);
      expect(budget, `${minutes} minutes`).toBeGreaterThanOrEqual(previous);
      previous = budget;
    }
  });

  it("floors a very short script above its bare word count", () => {
    // A 1-minute script is ~140 words; the floor leaves room for the opening
    // hook and closing recap the prompt also demands.
    expect(lectureScriptMaxOutputTokens(1)).toBeGreaterThanOrEqual(512);
  });
});
