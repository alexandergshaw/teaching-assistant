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
//
// RES-FILL-6 (docs/res-fill-6-provenance-guard-notes.md, checked BUILDABLE by
// docs/res-fill-6-provenance-guard-notes-check.md): this file also carries
// Instrument B of the two-instrument RULING 57 guard - a behavioural driver
// for every remaining GradingRun producer (Instrument A, the source-scan
// canary, is rubric-provenance-producers.structure.test.ts; it discovers a
// NEW unclassified producer but cannot verify STAMPING, because a correct
// pass-through producer has no stampRubricProvenance text in its own body to
// find - see that file's header). Instrument B drives each producer through
// its real production path (mocking only the model/canvas/extraction seams,
// never fetch) and asserts the OUTPUT run's rubricUsed/rubricFingerprint pair
// equals `stampRubricProvenance(<the same text that was sent>)`, built at
// test time from the text each test itself feeds the producer - never a
// recalled literal - so a producer that started stamping an arbitrary string
// instead of the real rubric would still be caught.
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

// gradeSubmissions dynamically imports "./extraction" (`await import(...)`);
// vi.mock intercepts a dynamic import the same as a static one. Only
// ingestZipEntries is driven by these tests (the empty-students branch);
// the real ./rubric (inferFileNameConvention), ./utils
// (groupSubmissionsByStudent) and ./collisionRefusal modules run unmocked and
// behave correctly on the empty input this drives them with, per the design
// notes' per-producer table.
vi.mock("./extraction", () => ({
  // gradeSubmissions now reads the shared ingestion chain from this module;
  // the helper is mocked too, so the empty branch is driven by what this mock
  // returns (real zero-entry coverage lives in the W1 oracle Z1-Z3).
  ingestZipEntries: vi.fn(),
  // gradeCanvasUrl destructures these from the same dynamic import; the
  // empty-students branch this file drives returns before either is ever
  // called, but the destructure itself requires the mock module to export
  // them.
  canvasWorkToEntry: vi.fn(),
  disambiguateCanvasEntries: vi.fn((entries) => entries),
}));

// gradeCanvasUrl dynamically imports "../canvas" for fetchCanvasWork and
// fetchAssignmentPointsPossible - mocked, never the platform fetch itself
// (memory: "a live 401 once made a sabotage pass").
vi.mock("../canvas", () => ({
  fetchCanvasWork: vi.fn(),
  fetchAssignmentPointsPossible: vi.fn(),
}));

import { callLlm } from "../llm";
import { gradeEntries, gradeSubmissions, gradeCanvasUrl } from "./engine";
import { ingestZipEntries } from "./extraction";
import { fetchCanvasWork, fetchAssignmentPointsPossible } from "../canvas";
import { rubricFingerprint } from "../research/rubric-fingerprint";
import { stampRubricProvenance } from "./rubric-provenance-stamp";
import type { StudentSubmissionEntry, GradingRunHeader, GradingRunTier2 } from "./types";
import { gradingApiToRun } from "@/app/actions/grading-run-mapping";
import type { GradingApiResponse } from "@/lib/grading-engine";
import {
  gradeDiscussion,
  gradeEntriesEmbedded,
  defaultDiscussionRubric,
  renderDiscussionRubric,
  renderRubricText,
} from "@/lib/embedded-grader";
import type { EmbeddedRubric } from "@/lib/embedded-grader";
import { buildIncrementalRun } from "@/app/components/grading/incrementalRunPlan";
import { stripGradingRunForDraft } from "@/lib/workflows/grading-review-rows";

const mockCallLlm = vi.mocked(callLlm);
const mockIngestZipEntries = vi.mocked(ingestZipEntries);
const mockFetchCanvasWork = vi.mocked(fetchCanvasWork);
const mockFetchAssignmentPointsPossible = vi.mocked(fetchAssignmentPointsPossible);

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

  it("gradeEntries with a blank rubric returns undefined for both fields (gradeStudentEntries' blank-rubric case, driven through the exported wrapper - gradeStudentEntries itself is not exported)", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: OK_RESPONSE_TEXT });

    const run = await gradeEntries([entry()], "Grade the assignment.", "", "gemini");

    expect(run.rubricUsed).toBeUndefined();
    expect(run.rubricFingerprint).toBeUndefined();
  });

  it("gradeSubmissions' empty-students branch stamps the rubric it was given, without delegating to gradeStudentEntries", async () => {
    mockIngestZipEntries.mockResolvedValueOnce({
      entries: [],
      attemptedSupportedFiles: 0,
      failedSupportedFiles: [],
    });

    const rubricText = "Criterion A (100%): completeness.";
    const run = await gradeSubmissions(new ArrayBuffer(0), "Grade the assignment.", rubricText, "gemini");

    expect(run.results).toEqual([]);
    expect(run.rubricUsed).toBe(rubricText);
    expect(run.rubricFingerprint).toBe(rubricFingerprint(rubricText));
    // The empty branch never reaches the model - proves this assertion is
    // exercising the early-return stamp, not the delegated path.
    expect(mockCallLlm).not.toHaveBeenCalled();
  });

  it("gradeCanvasUrl's empty-students branch stamps the rubric it was given, without delegating to gradeStudentEntries", async () => {
    mockFetchCanvasWork.mockResolvedValueOnce({ kind: "assignment", students: [], dueAt: null });
    mockFetchAssignmentPointsPossible.mockResolvedValueOnce(null);

    const rubricText = "Criterion A (100%): completeness.";
    const run = await gradeCanvasUrl(
      "https://canvas.example.edu/courses/1/assignments/2",
      "Grade the assignment.",
      rubricText,
      "gemini"
    );

    expect(run.results).toEqual([]);
    expect(run.rubricUsed).toBe(rubricText);
    expect(run.rubricFingerprint).toBe(rubricFingerprint(rubricText));
    expect(mockCallLlm).not.toHaveBeenCalled();
  });
});

describe("gradingApiToRun (the external 'Other API' mapper) stamps the pair against the rubric text it was actually sent", () => {
  const apiResponse: GradingApiResponse = {
    result_id: "r1",
    criteria: ["Loops"],
    students: [
      {
        student: "Jane Doe",
        total: 8,
        possible: 10,
        criteria: [{ criterion: "Loops", passed: true, points_earned: 8, points_possible: 10, detail: "ok" }],
      },
    ],
    warnings: [],
    csv: "",
  };

  it("stamps rubricText when supplied", () => {
    const rubricText = "Loops (100%): uses a for-loop.";
    const run = gradingApiToRun(apiResponse, null, rubricText);

    expect(run.rubricUsed).toBe(rubricText);
    expect(run.rubricFingerprint).toBe(rubricFingerprint(rubricText));
  });

  it("stamps undefined for both fields when rubricText is omitted (the `?? \"\"` blank path)", () => {
    const run = gradingApiToRun(apiResponse, null);

    expect(run.rubricUsed).toBeUndefined();
    expect(run.rubricFingerprint).toBeUndefined();
  });
});

describe("gradeDiscussion stamps the pair against the rendered composite-criteria text it actually graded against", () => {
  it("stamps renderDiscussionRubric(rubric), not the caller's raw rubric input", () => {
    const rubric = defaultDiscussionRubric();
    const expectedText = renderDiscussionRubric(rubric);

    const run = gradeDiscussion(
      [{ student: "Jane Doe", userId: 1, activity: { initialPosts: [], replies: [] } }],
      rubric,
      { dueAt: null, participants: [] }
    );

    expect(run.rubricUsed).toBe(expectedText);
    expect(run.rubricFingerprint).toBe(rubricFingerprint(expectedText));
    expect(stampRubricProvenance(expectedText)).toEqual({
      rubricUsed: run.rubricUsed,
      rubricFingerprint: run.rubricFingerprint,
    });
  });
});

describe("gradeEntriesEmbedded stamps the pair against the rendered rubric text it actually graded against", () => {
  it("stamps renderRubricText(rubric), not the caller's raw rubric input", () => {
    const rubric: EmbeddedRubric = {
      checks: [{ id: "c1", criterion: "Uses loops", checkType: "keyword", target: "for", points: 10 }],
      origin: "checks",
      warnings: [],
    };
    const expectedText = renderRubricText(rubric);

    const run = gradeEntriesEmbedded([entry({ content: "for i in range(10): pass" })], rubric);

    expect(run.rubricUsed).toBe(expectedText);
    expect(run.rubricFingerprint).toBe(rubricFingerprint(expectedText));
    expect(stampRubricProvenance(expectedText)).toEqual({
      rubricUsed: run.rubricUsed,
      rubricFingerprint: run.rubricFingerprint,
    });
  });
});

describe("buildIncrementalRun passes the header's already-stamped pair through unchanged (pass-through, RULING-57-legal)", () => {
  it("the run's rubricUsed/rubricFingerprint equal the header's - it never re-stamps", () => {
    const rubricText = "Criterion A (100%): completeness.";
    const stamped = stampRubricProvenance(rubricText);
    const header: Extract<GradingRunHeader, { kind: "ok" }> = {
      kind: "ok",
      effectiveRubric: rubricText,
      generatedRubric: undefined,
      criteriaNames: ["Criterion A"],
      rubricUsed: stamped.rubricUsed as string,
      rubricFingerprint: stamped.rubricFingerprint as string,
    };
    const tier2: GradingRunTier2 = { fullCreditChecklist: [], sampleAnswer: "" };

    const run = buildIncrementalRun({
      header,
      speedGraderUrl: null,
      totalTicketCount: 0,
      arrived: [],
      phase: "complete",
      tier2,
    });

    expect(run.rubricUsed).toBe(header.rubricUsed);
    expect(run.rubricFingerprint).toBe(header.rubricFingerprint);
    expect(run.rubricUsed).toBe(stamped.rubricUsed);
    expect(run.rubricFingerprint).toBe(stamped.rubricFingerprint);
  });
});

describe("stripGradingRunForDraft preserves an incoming run's pair unchanged (RULING-57-excluded transform, not a producer)", () => {
  it("the pair survives the transform byte-for-byte", () => {
    const rubricText = "Criterion A (100%): completeness.";
    const stamped = stampRubricProvenance(rubricText);
    const run = {
      results: [],
      rubricAreaNames: [],
      fullCreditChecklist: [],
      rubricUsed: stamped.rubricUsed,
      rubricFingerprint: stamped.rubricFingerprint,
    };

    const stripped = stripGradingRunForDraft(run);

    expect(stripped.rubricUsed).toBe(stamped.rubricUsed);
    expect(stripped.rubricFingerprint).toBe(stamped.rubricFingerprint);
  });
});
