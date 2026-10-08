import { describe, it, expect, vi, beforeEach } from "vitest";

// I5 (wave 1a): proves the pdf/image parts are IN THE MODEL REQUEST. It does
// NOT prove Gemini read them - that live confirmation is owner-walk (RES-VIS-4).
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

function entry(overrides: Partial<StudentSubmissionEntry> = {}): StudentSubmissionEntry {
  return {
    student: "Student",
    content: "some submission text",
    mergedFileCount: 1,
    submittedFiles: [],
    ...overrides,
  };
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

function requestParts(): Array<Record<string, unknown>> {
  const req = mockCallLlm.mock.calls[0][0] as { contents: Array<{ parts: Array<Record<string, unknown>> }> };
  return req.contents[0].parts;
}

describe("I5 - inline visual parts reach the model request", () => {
  it("sends a pdf as inlineData", async () => {
    await gradeEntries(
      [
        entry({
          submittedFiles: [
            { name: "shots.pdf", extension: "pdf", previewContent: "", previewTruncated: false, rawBase64: "PDFB64", mimeType: "application/pdf" },
          ],
        }),
      ],
      "Grade it.",
      "Clarity (10 pts): is the writing clear?",
      "gemini"
    );
    expect(requestParts()).toContainEqual({ inlineData: { mimeType: "application/pdf", data: "PDFB64" } });
  });

  it("still sends a png as inlineData", async () => {
    await gradeEntries(
      [
        entry({
          submittedFiles: [
            { name: "shot.png", extension: "png", previewContent: "", previewTruncated: false, rawBase64: "PNGB64", mimeType: "image/png" },
          ],
        }),
      ],
      "Grade it.",
      "Clarity (10 pts): is the writing clear?",
      "gemini"
    );
    expect(requestParts()).toContainEqual({ inlineData: { mimeType: "image/png", data: "PNGB64" } });
  });
});
