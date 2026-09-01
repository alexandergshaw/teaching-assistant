import { describe, it, expect } from "vitest";
import { videoLengthPreferenceSentence } from "./video-length-preference";

describe("videoLengthPreferenceSentence (preferred video length - a stated preference, never a guarantee)", () => {
  it("undefined when no preference is passed at all", () => {
    expect(videoLengthPreferenceSentence(undefined)).toBeUndefined();
  });

  it("undefined when both bounds are absent", () => {
    expect(videoLengthPreferenceSentence({})).toBeUndefined();
  });

  it("undefined when both bounds are zero or negative - never a nonsensical 'at least 0 minutes'", () => {
    expect(videoLengthPreferenceSentence({ minMinutes: 0, maxMinutes: -5 })).toBeUndefined();
  });

  it("states a minimum-only preference, and says explicitly that it is not a hard requirement", () => {
    const sentence = videoLengthPreferenceSentence({ minMinutes: 10 });
    expect(sentence).toContain("at least 10 minutes");
    expect(sentence).toMatch(/preference/i);
    expect(sentence).toMatch(/not a hard requirement/i);
  });

  it("states a maximum-only preference", () => {
    expect(videoLengthPreferenceSentence({ maxMinutes: 8 })).toContain("no more than 8 minutes");
  });

  it("states a range when both bounds are given", () => {
    expect(videoLengthPreferenceSentence({ minMinutes: 5, maxMinutes: 15 })).toContain("between 5 and 15 minutes");
  });

  it("SABOTAGE CHECK: the sentence never claims video length CAN be confirmed - the one honesty guarantee this setting has", () => {
    const sentence = videoLengthPreferenceSentence({ minMinutes: 5, maxMinutes: 15 })!;
    expect(sentence).toMatch(/cannot be confirmed/i);
  });

  // FIX 3 (review pass): this function is the last point before the pair
  // reaches the model's prompt - see its own doc comment for why an
  // inverted pair is dropped entirely here (both bounds discarded) rather
  // than silently swapped, mirroring DiscussionResourceSettings.tsx's own
  // "never guess on the instructor's behalf" reasoning at the control layer.
  describe("inverted min/max ordering (FIX 3)", () => {
    it("INVERTED MIN/MAX CASE: undefined - 'between 20 and 5 minutes' never reaches the prompt", () => {
      expect(videoLengthPreferenceSentence({ minMinutes: 20, maxMinutes: 5 })).toBeUndefined();
    });

    it("SABOTAGE CHECK: does not silently swap the inverted pair into a valid-looking 'between 5 and 20 minutes' sentence", () => {
      const inverted = videoLengthPreferenceSentence({ minMinutes: 20, maxMinutes: 5 });
      const swapped = videoLengthPreferenceSentence({ minMinutes: 5, maxMinutes: 20 });
      // If the implementation silently swapped instead of dropping, `inverted`
      // would equal `swapped` (both "between 5 and 20 minutes") - this proves
      // it does not.
      expect(inverted).not.toBe(swapped);
      expect(inverted).toBeUndefined();
    });

    it("equal bounds are NOT inverted - 'exactly 10 minutes' still states a range", () => {
      expect(videoLengthPreferenceSentence({ minMinutes: 10, maxMinutes: 10 })).toContain(
        "between 10 and 10 minutes"
      );
    });

    it("an inverted pair does not resurrect a single-bound preference either - both bounds are dropped together, not just reordered", () => {
      const sentence = videoLengthPreferenceSentence({ minMinutes: 20, maxMinutes: 5 });
      expect(sentence).toBeUndefined();
    });
  });
});
