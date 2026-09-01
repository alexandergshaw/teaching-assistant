import { describe, it, expect } from "vitest";
import { truncateSubmission, buildCodeExecutionNote } from "./utils";
import type { CodeRunResult } from "../code-runner";

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

function codeRun(overrides: Partial<CodeRunResult>): CodeRunResult {
  return { language: "c++", files: ["main.cpp"], ran: true, exitCode: 0, stdout: "", stderr: "", ...overrides };
}

// The C++ side of the stdin-EOF defect: cin >> x at empty stdin sets failbit
// and leaves x untouched, but the process still exits 0 - so ran stays true
// and this note WOULD present the resulting garbage stdout to the grading
// model as if it reflected real behavior. stdinReadSuspected (set by
// code-runner.ts's sourceLooksLikeItReadsStdin) is the caveat this function
// must add instead of silently trusting a clean exit code.
describe("buildCodeExecutionNote", () => {
  it("adds a caveat when stdinReadSuspected is set, without hiding the actual stdout", () => {
    const note = buildCodeExecutionNote(codeRun({ stdout: "0", stdinReadSuspected: true }));
    expect(note).toContain("Program output (stdout):\n0");
    expect(note).toMatch(/does not raise an error|Do not treat the output above as evidence/);
  });

  it("adds no stdin caveat for an ordinary run that never touched stdin", () => {
    const note = buildCodeExecutionNote(codeRun({ stdout: "hello", stdinReadSuspected: false }));
    expect(note).not.toMatch(/does not raise an error|Do not treat the output above as evidence/);
  });
});
