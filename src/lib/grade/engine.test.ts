import { describe, it, expect, vi, beforeEach } from "vitest";

// engine.ts's per-submission cap and inter-request delay come from ../gemini;
// pin them to small, deterministic values so tests don't depend on the real
// default (400000 chars) or sleep between submissions.
vi.mock("../gemini", () => ({
  getGeminiInterRequestDelayMs: () => 0,
  getGeminiMaxCharsPerSubmission: () => 20,
  getGeminiMaxOutputTokens: () => 700,
  getGeminiMaxSubmissions: () => 5,
}));

vi.mock("../llm", () => ({
  callLlm: vi.fn(),
}));

import { callLlm } from "../llm";
import { gradeEntries } from "./engine";
import type { StudentSubmissionEntry } from "./types";

const mockCallLlm = vi.mocked(callLlm);

function entry(overrides: Partial<StudentSubmissionEntry> = {}): StudentSubmissionEntry {
  return {
    student: "Jane Doe",
    content: "short",
    mergedFileCount: 1,
    submittedFiles: [],
    ...overrides,
  };
}

const OK_RESPONSE_TEXT = JSON.stringify({
  overallComment: "Solid work overall.",
  rubricResults: [{ area: "Overall", score: "8/10" }],
  totalScore: "8/10",
});

beforeEach(() => {
  vi.clearAllMocks();
});

// C1.2 / C2.7: truncation of the merged submission (per getGeminiMaxCharsPerSubmission,
// mocked to 20 chars here) must be reported on the returned GradeResult, not
// only written into the prompt text sent to the model.
describe("gradeEntries - submission truncation is reported to the caller (C2.7)", () => {
  it("marks submissionTruncated:true when content exceeds the cap, and sends only the truncated text to the model", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: OK_RESPONSE_TEXT });

    const overLimit = "x".repeat(50); // cap mocked to 20
    const run = await gradeEntries(
      [entry({ content: overLimit })],
      "Grade the assignment.",
      "Grade for correctness and clarity.",
      "gemini"
    );

    expect(run.results).toHaveLength(1);
    expect(run.results[0].submissionTruncated).toBe(true);

    const sentText = mockCallLlm.mock.calls[0][0].contents[0].parts[0];
    if (!("text" in sentText)) throw new Error("expected a text part");
    expect(sentText.text).toContain("x".repeat(20));
    expect(sentText.text).not.toContain("x".repeat(21));
    expect(sentText.text).toContain("[Truncated 30 characters to stay within configured grading limits.]");
  });

  it("marks submissionTruncated:false when content is within the cap", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: OK_RESPONSE_TEXT });

    const withinLimit = "x".repeat(10); // cap mocked to 20
    const run = await gradeEntries(
      [entry({ content: withinLimit })],
      "Grade the assignment.",
      "Grade for correctness and clarity.",
      "gemini"
    );

    expect(run.results).toHaveLength(1);
    expect(run.results[0].submissionTruncated).toBe(false);
  });

  it("still reports submissionTruncated:true on the fallback result when grading the (truncated) submission fails", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: false, status: 500, body: "server error" });

    const overLimit = "x".repeat(50); // cap mocked to 20
    const run = await gradeEntries(
      [entry({ content: overLimit })],
      "Grade the assignment.",
      "Grade for correctness and clarity.",
      "gemini"
    );

    expect(run.results).toHaveLength(1);
    expect(run.results[0].overallComment).toContain("could not be graded");
    expect(run.results[0].submissionTruncated).toBe(true);
  });

  it("does not change grading output semantics (score/comment) based on truncation", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: OK_RESPONSE_TEXT });

    const overLimit = "x".repeat(50);
    const run = await gradeEntries(
      [entry({ content: overLimit })],
      "Grade the assignment.",
      "Grade for correctness and clarity.",
      "gemini"
    );

    expect(run.results[0].totalScore).toBe("8/10");
    expect(run.results[0].overallComment).toContain("Solid work overall.");
  });
});
