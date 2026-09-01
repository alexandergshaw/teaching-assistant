import { describe, it, expect } from "vitest";
import {
  GRADING_EXTRACT_BATCH_SIZE,
  MAX_SUBMISSION_CHARS,
  buildSubmissionExtractionPrompt,
} from "./grading-extraction-prompt";

// Per the repo's "source-text tests over-specify" lesson, these tests pin the
// FACT and the ORDERING of what the prompt builder produces, not the exact
// spelling of every sentence - except the load-bearing rules (R3's skip-if-
// unnamed instruction, R1a's no-bare-empty-array instruction), which are
// substantive enough that a sabotage deleting them must fail a test, not
// merely change prose a human might not re-read closely.

describe("GRADING_EXTRACT_BATCH_SIZE / MAX_SUBMISSION_CHARS", () => {
  it("are positive, sane values (R4b: this feature's own constants, not reused from discussion-reply-prompt.ts)", () => {
    expect(GRADING_EXTRACT_BATCH_SIZE).toBeGreaterThan(0);
    expect(MAX_SUBMISSION_CHARS).toBeGreaterThan(0);
  });
});

describe("buildSubmissionExtractionPrompt", () => {
  it("states the frame count somewhere in the prompt", () => {
    const prompt = buildSubmissionExtractionPrompt(4);
    expect(prompt).toContain("4");
  });

  it("differs when the frame count differs, so the count is not a fixed placeholder", () => {
    const promptA = buildSubmissionExtractionPrompt(3);
    const promptB = buildSubmissionExtractionPrompt(6);
    expect(promptA).not.toBe(promptB);
  });

  it("mentions the JSON output keys studentName/submissionText (the load-bearing schema)", () => {
    const prompt = buildSubmissionExtractionPrompt(5);
    expect(prompt).toContain("studentName");
    expect(prompt).toContain("submissionText");
  });

  it("instructs against code fences/backticks (lenient-json corrupts fenced content)", () => {
    const prompt = buildSubmissionExtractionPrompt(5);
    expect(prompt.toLowerCase()).toContain("backtick");
  });

  it("says nothing about discussion-board furniture - proves this is a fresh prompt, not the discussion one reused (R4b)", () => {
    const prompt = buildSubmissionExtractionPrompt(5);
    const lower = prompt.toLowerCase();
    expect(lower).not.toContain("thread");
    expect(lower).not.toContain("reply");
    expect(lower).not.toContain("discussion board");
  });

  describe("R3: the name rule (safety-critical - a misread name misattributes real feedback)", () => {
    it("instructs the model to SKIP a submission entirely when no name is visible", () => {
      const prompt = buildSubmissionExtractionPrompt(5);
      expect(prompt.toLowerCase()).toContain("skip");
    });

    it("explicitly forbids attributing an unnamed submission to the nearest visible name", () => {
      const prompt = buildSubmissionExtractionPrompt(5);
      expect(prompt.toLowerCase()).toContain("nearest visible name");
    });

    it("explicitly forbids guessing whose submission it is", () => {
      const prompt = buildSubmissionExtractionPrompt(5);
      expect(prompt.toLowerCase()).toContain("never guess");
    });

    it("states the consequence of a wrong name in the prompt itself, not just in code comments", () => {
      const prompt = buildSubmissionExtractionPrompt(5);
      expect(prompt.toLowerCase()).toContain("feedback meant for someone else");
    });
  });

  describe("R1a: refuses a bare empty array", () => {
    it("instructs the model to never return an empty array when nothing is visible", () => {
      const prompt = buildSubmissionExtractionPrompt(5);
      expect(prompt).toContain("do NOT return an empty array");
    });

    it("names the required marker key noSubmissionsVisible", () => {
      const prompt = buildSubmissionExtractionPrompt(5);
      expect(prompt).toContain("noSubmissionsVisible");
    });

    it("requires a reason to accompany the marker", () => {
      const prompt = buildSubmissionExtractionPrompt(5);
      expect(prompt).toContain("reason");
    });
  });

  it("uses singular phrasing for a 1-frame batch and plural for more than one (sabotage target: a hardcoded plural)", () => {
    const one = buildSubmissionExtractionPrompt(1);
    const many = buildSubmissionExtractionPrompt(2);
    expect(one).toContain("a single screenshot");
    expect(many).toContain("screenshots");
    expect(many).not.toContain("a single screenshot");
  });
});
