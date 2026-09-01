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

// engine.ts:142 runs any RUNNABLE code a student submitted before it ever calls
// the model, and the real runner reaches the network. Every other test here
// passes `submittedFiles: []`, so it returns null immediately and the omission
// stayed invisible - but the "SUBMITTED FILES" test below supplies .py/.java/
// .cpp, so it hung on the real runner and died on vitest's 5s timeout WITHOUT
// EVER REACHING ITS ASSERTIONS. That test guards a live grading defect (the
// model was not shown the submitted file names, so a misnamed Java file went
// unflagged), which means the guard was reporting nothing at all.
// This file tests prompt assembly and result mapping, never code execution.
vi.mock("../code-runner", () => ({
  runSubmittedCode: vi.fn(async () => null),
}));

import { callLlm } from "../llm";
import { gradeEntries } from "./engine";
import { RESUBMIT_NOTICE, type StudentSubmissionEntry } from "./types";

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

// AC6 item 22 (docs/grading-results-feedback-boxes-acceptance-criteria.md):
// gradeSubmission's RESUBMIT_NOTICE append (engine.ts) had NO test before this
// one, unlike the embedded-grader's two variants - so a regression here would
// fail silently while the embedded suites fail loudly. Pins CURRENT behavior
// (notice appended exactly when points were deducted, absent at full credit)
// before the three-feedback-boxes refactor touches this function.
describe("gradeEntries - resubmit notice on the LLM path (previously untested)", () => {
  it("appends RESUBMIT_NOTICE to overallComment when points were deducted", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: OK_RESPONSE_TEXT }); // scores 8/10

    const run = await gradeEntries(
      [entry()],
      "Grade the assignment.",
      "Grade for correctness and clarity.",
      "gemini"
    );

    expect(run.results[0].totalScore).toBe("8/10");
    expect(run.results[0].overallComment).toBe(`Solid work overall. ${RESUBMIT_NOTICE}`);
  });

  it("does not append RESUBMIT_NOTICE when the submission earns full credit", async () => {
    const fullCreditText = JSON.stringify({
      overallComment: "Excellent work overall.",
      rubricResults: [{ area: "Overall", score: "10/10" }],
      totalScore: "10/10",
    });
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: fullCreditText });

    const run = await gradeEntries(
      [entry()],
      "Grade the assignment.",
      "Grade for correctness and clarity.",
      "gemini"
    );

    expect(run.results[0].totalScore).toBe("10/10");
    expect(run.results[0].overallComment).toBe("Excellent work overall.");
    expect(run.results[0].overallComment).not.toContain(RESUBMIT_NOTICE);
  });
});

// Second live grading defect: a student submitted calculator.py, TripMath.java,
// and trip_math.cpp against a README requiring calculator.py, Calculator.java,
// calculator.cpp - the grader only caught the C++ mismatch and missed the
// Java one, because the model was never given the real submitted file names
// as an explicit list, only the merged text with names buried in "--- FILE:
// path ---" headers. This pins the FACT that the prompt actually sent to the
// model now carries that explicit list (not the model's grading behavior,
// which no unit test can prove).
describe("gradeEntries - submitted files reach the model as an explicit list (real-run defect)", () => {
  it("includes every submitted file's exact base name in the prompt sent to the model", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: OK_RESPONSE_TEXT });

    await gradeEntries(
      [
        entry({
          content: "File: calculator.py\n\n...\n\n---\n\nFile: TripMath.java\n\n...",
          submittedFiles: [
            {
              name: "calculator.py",
              extension: "py",
              previewContent: "...",
              previewTruncated: false,
            },
            {
              name: "TripMath.java",
              extension: "java",
              previewContent: "...",
              previewTruncated: false,
            },
            {
              name: "trip_math.cpp",
              extension: "cpp",
              previewContent: "...",
              previewTruncated: false,
            },
          ],
        }),
      ],
      "Required files: calculator.py, Calculator.java, calculator.cpp",
      "Grade for correctness and clarity.",
      "gemini"
    );

    const sentText = mockCallLlm.mock.calls[0][0].contents[0].parts[0];
    if (!("text" in sentText)) throw new Error("expected a text part");
    // "SUBMITTED FILES" also appears once in the static rule sentence
    // (prompts.ts), so a real per-student list block must push the count to
    // at least two occurrences, not merely one.
    expect(sentText.text.split("SUBMITTED FILES").length - 1).toBeGreaterThanOrEqual(2);
    expect(sentText.text).toContain("calculator.py");
    expect(sentText.text).toContain("TripMath.java");
    expect(sentText.text).toContain("trip_math.cpp");
  });

  it("sends no per-student SUBMITTED FILES list block when the entry has no submitted files (inert on paths with nothing to list)", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: OK_RESPONSE_TEXT });

    await gradeEntries(
      [entry({ submittedFiles: [] })],
      "Grade the assignment.",
      "Grade for correctness and clarity.",
      "gemini"
    );

    const sentText = mockCallLlm.mock.calls[0][0].contents[0].parts[0];
    if (!("text" in sentText)) throw new Error("expected a text part");
    // Only the static rule sentence mentions "SUBMITTED FILES" here - no
    // per-student list block was appended, since there was nothing to list.
    expect(sentText.text.split("SUBMITTED FILES").length - 1).toBe(1);
  });
});

// The stdin-EOF defect (code-runner.ts's CodeRunResult.neededStdin), LLM
// grading side: this sandbox always runs code with stdin hardcoded to "", so
// an assignment requiring input from the user fails Python's input() with
// EOFError for reasons that have nothing to do with the student's code.
// Before this fix, gradeSubmission (engine.ts) told the model "Ran without
// errors: no" plus the EOFError traceback for every such run, letting the
// model's own holistic judgment penalize the student for a platform
// limitation - the same mistake the deterministic embedded engine avoids for
// its own "Code runs" criterion (embedded-grader/index.test.ts). This pins
// that the AUTOMATED CODE EXECUTION note is withheld from the prompt
// entirely when neededStdin is set, exactly like the pre-existing `error`
// case, while a genuine failure or a normal run still gets the note.
describe("gradeEntries - stdin-starved runs are withheld from the model's prompt (neededStdin)", () => {
  it("sends no AUTOMATED CODE EXECUTION note when the run failed only because stdin was empty", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: OK_RESPONSE_TEXT });

    await gradeEntries(
      [
        entry({
          codeRun: {
            language: "python",
            files: ["main.py"],
            ran: false,
            exitCode: 1,
            stdout: "",
            stderr: "EOFError: EOF when reading a line",
            neededStdin: true,
          },
        }),
      ],
      "Grade the assignment.",
      "Grade for correctness and clarity.",
      "gemini"
    );

    const sentText = mockCallLlm.mock.calls[0][0].contents[0].parts[0];
    if (!("text" in sentText)) throw new Error("expected a text part");
    expect(sentText.text).not.toContain("AUTOMATED CODE EXECUTION");
    expect(sentText.text).not.toContain("EOFError");
  });

  it("still sends the AUTOMATED CODE EXECUTION note for a genuine failure unrelated to stdin", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: OK_RESPONSE_TEXT });

    await gradeEntries(
      [
        entry({
          codeRun: {
            language: "python",
            files: ["main.py"],
            ran: false,
            exitCode: 1,
            stdout: "",
            stderr: "NameError: name 'x' is not defined",
          },
        }),
      ],
      "Grade the assignment.",
      "Grade for correctness and clarity.",
      "gemini"
    );

    const sentText = mockCallLlm.mock.calls[0][0].contents[0].parts[0];
    if (!("text" in sentText)) throw new Error("expected a text part");
    expect(sentText.text).toContain("AUTOMATED CODE EXECUTION");
    expect(sentText.text).toContain("NameError");
  });

  it("still sends the note for an ordinary clean run (unaffected by this fix)", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: OK_RESPONSE_TEXT });

    await gradeEntries(
      [
        entry({
          codeRun: { language: "python", files: ["main.py"], ran: true, exitCode: 0, stdout: "42", stderr: "" },
        }),
      ],
      "Grade the assignment.",
      "Grade for correctness and clarity.",
      "gemini"
    );

    const sentText = mockCallLlm.mock.calls[0][0].contents[0].parts[0];
    if (!("text" in sentText)) throw new Error("expected a text part");
    expect(sentText.text).toContain("AUTOMATED CODE EXECUTION");
    expect(sentText.text).toContain("Ran without errors: yes");
  });
});
