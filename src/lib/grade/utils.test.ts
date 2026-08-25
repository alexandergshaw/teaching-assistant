import { describe, it, expect } from "vitest";
import { truncateSubmission } from "./utils";

// C1.2 / C2.7: truncateSubmission must (a) leave content exactly at the cap
// untouched, (b) cut anything over the cap and say so via `truncated`, not
// only via a note baked into the returned text - `truncated` is what
// engine.ts threads out to GradeResult.submissionTruncated so a UI can
// report it, rather than the instructor discovering it never happened.
describe("truncateSubmission", () => {
  it("returns content unchanged and truncated:false when exactly at the cap", () => {
    const content = "a".repeat(100);
    const result = truncateSubmission(content, 100);
    expect(result.text).toBe(content);
    expect(result.truncated).toBe(false);
  });

  it("returns content unchanged and truncated:false when under the cap", () => {
    const content = "a".repeat(99);
    const result = truncateSubmission(content, 100);
    expect(result.text).toBe(content);
    expect(result.truncated).toBe(false);
  });

  it("cuts content down and reports truncated:true when exactly one character over the cap", () => {
    const content = "a".repeat(101);
    const result = truncateSubmission(content, 100);
    expect(result.truncated).toBe(true);
    expect(result.text.startsWith("a".repeat(100))).toBe(true);
    expect(result.text).not.toBe(content);
  });

  it("appends a note naming the omitted character count for the model, in addition to reporting truncated:true", () => {
    const content = "a".repeat(150);
    const result = truncateSubmission(content, 100);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("[Truncated 50 characters to stay within configured grading limits.]");
  });

  it("never reports truncated:true for empty content", () => {
    const result = truncateSubmission("", 100);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe("");
  });
});
