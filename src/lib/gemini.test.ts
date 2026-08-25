import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getGeminiMaxCharsPerSubmission } from "./gemini";

// C1.2 / C1.3: the per-submission character cap must be raised against the
// model's real context window (not the old 12,000), GRADE_MAX_CHARS_PER_SUBMISSION
// must still override it, and a cap must always exist (an invalid override
// falls back rather than becoming unbounded).
describe("getGeminiMaxCharsPerSubmission", () => {
  const ORIGINAL_ENV = process.env.GRADE_MAX_CHARS_PER_SUBMISSION;

  beforeEach(() => {
    delete process.env.GRADE_MAX_CHARS_PER_SUBMISSION;
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.GRADE_MAX_CHARS_PER_SUBMISSION;
    } else {
      process.env.GRADE_MAX_CHARS_PER_SUBMISSION = ORIGINAL_ENV;
    }
  });

  it("defaults to 400000 characters, chosen against gemini-3.1-flash-lite's real context window", () => {
    expect(getGeminiMaxCharsPerSubmission()).toBe(400000);
  });

  it("is no longer the old 12000-character cap that discarded ~95% of a scoped folder", () => {
    expect(getGeminiMaxCharsPerSubmission()).not.toBe(12000);
  });

  it("honors GRADE_MAX_CHARS_PER_SUBMISSION as an override", () => {
    process.env.GRADE_MAX_CHARS_PER_SUBMISSION = "999000";
    expect(getGeminiMaxCharsPerSubmission()).toBe(999000);
  });

  it("lets an override raise the cap far above the default (still bounded, not unbounded)", () => {
    process.env.GRADE_MAX_CHARS_PER_SUBMISSION = "2000000";
    expect(getGeminiMaxCharsPerSubmission()).toBe(2000000);
  });

  it("falls back to the default when the override is not a positive integer", () => {
    process.env.GRADE_MAX_CHARS_PER_SUBMISSION = "not-a-number";
    expect(getGeminiMaxCharsPerSubmission()).toBe(400000);
  });

  it("falls back to the default when the override is zero or negative", () => {
    process.env.GRADE_MAX_CHARS_PER_SUBMISSION = "0";
    expect(getGeminiMaxCharsPerSubmission()).toBe(400000);
    process.env.GRADE_MAX_CHARS_PER_SUBMISSION = "-5";
    expect(getGeminiMaxCharsPerSubmission()).toBe(400000);
  });
});
