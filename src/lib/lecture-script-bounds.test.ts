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

  // THE INTRO-VIDEO STARVATION FIX. A FROZEN table, not a re-derivation of
  // the function's own formula - see docs/DEV_LOOP.md's own "pin the fact,
  // never the spelling" rule and this file's own precedent above (every
  // other `it` in this describe block asserts a PROPERTY, not a literal
  // number, for exactly this reason). This one test is deliberately the
  // exception: these four numbers ARE the fact this fix exists to
  // establish, spelled out with the arithmetic that produced each one (see
  // lecture-script-bounds.ts's own doc comment on lectureScriptMaxOutputTokens
  // for the identical table, kept in sync by hand).
  //
  // SABOTAGE-CHECKED (reported in this wave's own writeup): reverting the
  // fix (removing "+ THINKING_HEADROOM_TOKENS" from the function body) turns
  // this test red. It does NOT drop every one of these four numbers by
  // exactly 512, though - only the 2/3/5-minute rows drop by 512 (960->448,
  // 1184->672, 1632->1120); the 1-minute row drops from 736 to 512, not 224,
  // because the pre-headroom estimate (224) is below MIN_OUTPUT_TOKENS (512)
  // and the floor's Math.max catches it. Restoring the fix turns all four
  // rows green again.
  it("SCRIPT_LENGTH_OPTIONS table: every offered intro-video length gets budget = words*1.6 + 512 thinking headroom", () => {
    // minutes -> [wordTarget, expectedBudget]. wordTarget = minutes * 140
    // (LECTURE_SCRIPT_WORDS_PER_MINUTE); expectedBudget =
    // round(wordTarget * 1.6) + 512 (THINKING_HEADROOM_TOKENS).
    const table: Array<{ minutes: number; words: number; expectedBudget: number }> = [
      // 1 minute: 140 words * 1.6 = 224, + 512 headroom = 736.
      { minutes: 1, words: 140, expectedBudget: 736 },
      // 2 minutes, the DEFAULT (DEFAULT_SCRIPT_MINUTES, script-length.ts):
      // 280 words * 1.6 = 448, + 512 headroom = 960. This is the exact case
      // that used to starve: the OLD formula clamped 448 straight up to the
      // 512 floor, giving the model 512 tokens total to cover both thinking
      // and a 280-word script - the floor and the whole budget were the same
      // number. The new formula gives 960, of which even a full 512 tokens
      // of thinking still leaves exactly 448 for content - the size the
      // estimate itself says the content needs.
      { minutes: 2, words: 280, expectedBudget: 960 },
      // 3 minutes: 420 words * 1.6 = 672, + 512 headroom = 1184.
      { minutes: 3, words: 420, expectedBudget: 1184 },
      // 5 minutes: 700 words * 1.6 = 1120, + 512 headroom = 1632.
      { minutes: 5, words: 700, expectedBudget: 1632 },
    ];
    for (const { minutes, words, expectedBudget } of table) {
      expect(lectureScriptWordTarget(minutes), `${minutes}-minute word target`).toBe(words);
      expect(lectureScriptMaxOutputTokens(minutes), `${minutes}-minute budget`).toBe(expectedBudget);
    }
  });

  it("the DEFAULT (2 minutes) budget leaves room for the ~280-word target even if thinking consumes the entire headroom", () => {
    // Restates the 2-minute row above as the property the coordinator's brief
    // asked to see proven directly: budget >= content estimate + a genuine
    // 512-token headroom on top of it, for ~280 words.
    //
    // D-TEST (step-10c review): the headline assertion here used to read
    // `expect(budget - impliedHeadroom).toBeGreaterThanOrEqual(contentEstimate)`
    // with `impliedHeadroom = budget - contentEstimate` - substitute the
    // second into the first and it reduces to
    // `contentEstimate >= contentEstimate`, true for ANY budget, including
    // the broken pre-fix one (512). That version could never go red. The
    // assertion below states the same property directly instead, with no
    // intermediate variable for a reader (or a future edit) to silently
    // reintroduce a tautology through.
    const budget = lectureScriptMaxOutputTokens(2);
    const words = lectureScriptWordTarget(2);
    const contentEstimate = Math.round(words * 1.6);
    expect(words).toBe(280);
    expect(budget).toBeGreaterThanOrEqual(contentEstimate + 512);
  });
});
