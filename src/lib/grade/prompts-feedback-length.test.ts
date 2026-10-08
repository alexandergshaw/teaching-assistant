import { describe, it, expect } from "vitest";
import { feedbackLengthDirective } from "./prompts";
import {
  FEEDBACK_WORD_TARGET_MAX,
  FEEDBACK_WORD_TARGET_MIN,
  coerceFeedbackWordTarget,
} from "./types";

// Feedback length wave 1, AC-L-1 (docs/feedback-length-control-scope.md section 5).
// The directive literal is DUPLICATED here, never imported, so the test cannot
// compare the implementation with itself.

function expected(n: number): string {
  return `Aim to keep the written feedback for this submission to approximately ${n} words in total across the feedback fields. Prioritize the most important points and keep the wording concise. Do not pad to reach the count, and do not drop a required deduction, rubric citation, or any other rule above just to stay under it.`;
}

const FROZEN_150 = "Aim to keep the written feedback for this submission to approximately 150 words in total across the feedback fields. Prioritize the most important points and keep the wording concise. Do not pad to reach the count, and do not drop a required deduction, rubric citation, or any other rule above just to stay under it.";

describe("feedbackLengthDirective purity", () => {
  it("returns the exact frozen literal for an in-range target", () => {
    expect(feedbackLengthDirective(150)).toBe(FROZEN_150);
    expect(feedbackLengthDirective(50)).toBe(expected(50));
  });

  const table: Array<[string, number | undefined, string]> = [
    ["unset", undefined, ""],
    ["zero", 0, ""],
    ["MIN - 1", 19, ""],
    ["MIN", 20, expected(20)],
    ["MAX", 500, expected(500)],
    ["MAX + 1", 501, ""],
    ["non-integer", 150.5, ""],
    ["NaN", NaN, ""],
    ["Infinity", Infinity, ""],
    ["negative", -150, ""],
  ];
  for (const [label, input, out] of table) {
    it(`${label} -> ${out === "" ? "empty" : "directive"}`, () => {
      expect(feedbackLengthDirective(input)).toBe(out);
    });
  }

  it("control: the in-range directive is non-empty, contains its number, and keeps the subordinate clause", () => {
    const d = feedbackLengthDirective(150);
    expect(d.length).toBeGreaterThan(0);
    expect(d).toContain("150");
    expect(d).toContain("do not drop a required deduction, rubric citation, or any other rule above just to stay under it");
  });

  it("contains no long or short dash", () => {
    const d = feedbackLengthDirective(150);
    expect(d.includes(String.fromCharCode(0x2014))).toBe(false);
    expect(d.includes(String.fromCharCode(0x2013))).toBe(false);
  });

  it("bounds are the documented 20 and 500", () => {
    expect(FEEDBACK_WORD_TARGET_MIN).toBe(20);
    expect(FEEDBACK_WORD_TARGET_MAX).toBe(500);
  });
});

describe("coerceFeedbackWordTarget", () => {
  const cases: Array<[string, unknown, number | undefined]> = [
    ["in-range number", 150, 150],
    ["MIN", 20, 20],
    ["MAX", 500, 500],
    ["numeric string", "150", 150],
    ["below MIN", 19, undefined],
    ["above MAX", 501, undefined],
    ["zero", 0, undefined],
    ["non-integer", 150.5, undefined],
    ["NaN", NaN, undefined],
    ["Infinity", Infinity, undefined],
    ["empty string", "", undefined],
    ["whitespace string", "  ", undefined],
    ["non-numeric string", "big", undefined],
    ["null", null, undefined],
    ["undefined", undefined, undefined],
    ["boolean", true, undefined],
    ["object", {}, undefined],
  ];
  for (const [label, input, out] of cases) {
    it(`${label} -> ${String(out)}`, () => {
      expect(coerceFeedbackWordTarget(input)).toBe(out);
    });
  }
});
