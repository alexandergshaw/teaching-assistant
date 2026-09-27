import { describe, it, expect, vi, beforeEach } from "vitest";

// A39 build check (docs/a39-build-check.md BLOCKER 2, docs/a39-build-rulings.md
// RULING 55): W2-3/W2-8 only ever tested describeRunRubricProvenance against a
// hand-built GradingRun literal. That is necessary and not sufficient - the
// wave's own 29-file gate stays green (734 tests) even when all three stamp
// sites in engine.ts are deleted, because nothing EXECUTES gradeEntries and
// checks the pair it actually produces. This file is that missing instrument:
// it calls the real grading path (mocking only the model seam, per
// vitest.setup.ts's network block and engine.test.ts's own established
// mocking pattern) and asserts the returned run carries both fields.
vi.mock("../gemini", () => ({
  getGeminiInterRequestDelayMs: () => 0,
  getGeminiMaxCharsPerSubmission: () => 20000,
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
import { rubricFingerprint } from "../research/rubric-fingerprint";
import type { StudentSubmissionEntry } from "./types";

const mockCallLlm = vi.mocked(callLlm);

function entry(overrides: Partial<StudentSubmissionEntry> = {}): StudentSubmissionEntry {
  return {
    student: "Jane Doe",
    content: "short submission",
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

describe("grading actually stamps the rubricUsed/rubricFingerprint pair on the produced run", () => {
  it("gradeEntries returns a run whose rubricUsed is the rubric text that was actually graded against, and whose rubricFingerprint is that text's fingerprint", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: OK_RESPONSE_TEXT });

    const rubricText = "Criterion A (50%): loop usage. Criterion B (50%): naming.";
    const run = await gradeEntries(
      [entry()],
      "Grade the assignment.",
      rubricText,
      "gemini"
    );

    // The value sent to the model must be the SAME text that gets stamped -
    // otherwise a producer could stamp an arbitrary string and still pass.
    const sentText = mockCallLlm.mock.calls[0][0].contents[0].parts[0];
    if (!("text" in sentText)) throw new Error("expected a text part");
    expect(sentText.text).toContain("Criterion A (50%): loop usage.");

    expect(run.rubricUsed).toBe(rubricText);
    expect(run.rubricFingerprint).toBe(rubricFingerprint(rubricText));
  });
});
