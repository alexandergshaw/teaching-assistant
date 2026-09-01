import { describe, it, expect } from "vitest";
import { checkGradingReadiness, MISSING_RUBRIC_MESSAGE, NO_SUBMISSIONS_TO_GRADE_MESSAGE } from "./grading-dispatch";

describe("checkGradingReadiness (item 5: rubric required before grading, not before capturing)", () => {
  it("refuses with NO_SUBMISSIONS_TO_GRADE_MESSAGE when the table is empty, rubric or not", () => {
    expect(checkGradingReadiness("A real rubric", 0)).toEqual({ ok: false, reason: NO_SUBMISSIONS_TO_GRADE_MESSAGE });
    expect(checkGradingReadiness("", 0)).toEqual({ ok: false, reason: NO_SUBMISSIONS_TO_GRADE_MESSAGE });
  });

  it("refuses with MISSING_RUBRIC_MESSAGE when there are rows but no rubric text", () => {
    expect(checkGradingReadiness("", 3)).toEqual({ ok: false, reason: MISSING_RUBRIC_MESSAGE });
  });

  it("refuses on whitespace-only rubric text - not just a literally empty string", () => {
    expect(checkGradingReadiness("   \n  ", 3)).toEqual({ ok: false, reason: MISSING_RUBRIC_MESSAGE });
  });

  it("is ok once both a rubric and at least one row exist", () => {
    expect(checkGradingReadiness("Grade for clarity and evidence.", 3)).toEqual({ ok: true, reason: null });
  });

  it("recording first, pasting the rubric after, is exactly the flow this allows - rows can exist with no rubric yet without being refused for the WRONG reason", () => {
    const result = checkGradingReadiness("", 5);
    // The refusal is about the missing rubric, not a claim that capturing
    // without one was itself invalid.
    expect(result.reason).toBe(MISSING_RUBRIC_MESSAGE);
  });
});
