import { describe, it, expect, vi, beforeEach } from "vitest";

// RECORDING ONE-VS-MANY W3: proves the per-segment grade window REACHES the
// model request (the scoreAxis text part), through gradeEntries ->
// gradeStudentEntries -> gradeSubmission -> scoreAxis. It does NOT prove the
// model confines its attention to the window - that is owner-walk (RES-R-1/2).
vi.mock("../gemini", () => ({
  getGeminiInterRequestDelayMs: () => 0,
  getGeminiMaxCharsPerSubmission: () => 100000,
  getGeminiMaxOutputTokens: () => 700,
  getGeminiMaxSubmissions: () => 5,
}));

vi.mock("../llm", () => ({
  callLlm: vi.fn(),
}));

vi.mock("../code-runner", () => ({
  runSubmittedCode: vi.fn(async () => null),
}));

import { callLlm } from "../llm";
import { gradeEntries } from "./engine";
import type { StudentSubmissionEntry } from "./types";

const mockCallLlm = vi.mocked(callLlm);

function entry(): StudentSubmissionEntry {
  return { student: "Student", content: "some submission text", mergedFileCount: 1, submittedFiles: [] };
}

const RESPONSE = JSON.stringify({
  overallComment: "ok",
  rubricResults: [{ area: "Clarity", score: "8/10" }],
  totalScore: "8/10",
});

beforeEach(() => {
  vi.clearAllMocks();
  mockCallLlm.mockResolvedValue({ ok: true, text: RESPONSE });
});

function promptText(): string {
  const req = mockCallLlm.mock.calls[0][0] as { contents: Array<{ parts: Array<{ text?: string }> }> };
  return req.contents[0].parts[0].text ?? "";
}

describe("videoGradeWindowSec reaches the scoreAxis prompt", () => {
  it("appends the fixed-wording window note naming the segment times", async () => {
    await gradeEntries([entry()], "Grade it.", "Clarity (10 pts): is the writing clear?", "gemini", null, {
      videoGradeWindowSec: { startSec: 95, endSec: 3725 },
    });
    const text = promptText();
    expect(text).toContain("Grade ONLY the portion from 1:35 to 1:02:05 of the video");
  });

  it("an unset window leaves the prompt without any window note (byte-identical default)", async () => {
    await gradeEntries([entry()], "Grade it.", "Clarity (10 pts): is the writing clear?", "gemini");
    expect(promptText()).not.toContain("Grade ONLY the portion");
  });
});
