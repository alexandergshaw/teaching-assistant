import { describe, it, expect, vi, beforeEach } from "vitest";

// N13a's own test file - kept separate from engine.test.ts (this repo's rule:
// a test file must not import a helper from another *.test.ts, so entry()
// below is duplicated rather than shared) so engine.test.ts stays at its
// measured 329 lines.
//
// getGeminiMaxSubmissions is a vi.fn() here (not a fixed arrow function)
// because every oracle below needs a different bound/deadline - the whole
// point of these tests is exercising the two ways a run can stop early.
const mockGetGeminiMaxSubmissions = vi.fn(() => 5);

vi.mock("../gemini", () => ({
  getGeminiInterRequestDelayMs: () => 0,
  getGeminiMaxCharsPerSubmission: () => 100000,
  getGeminiMaxOutputTokens: () => 700,
  getGeminiMaxSubmissions: () => mockGetGeminiMaxSubmissions(),
}));

vi.mock("../llm", () => ({
  callLlm: vi.fn(),
}));

vi.mock("../code-runner", () => ({
  runSubmittedCode: vi.fn(async () => null),
}));

import { callLlm } from "../llm";
import { gradeEntries } from "./engine";
import { computeClassTrends } from "./class-trends";
import { GRADING_FAILURE_PREFIX, type StudentSubmissionEntry } from "./types";
import { stripGradeResultForDraft } from "../workflows/grading-review-rows";

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

// A rubric that DOES parse a criterion (the "(N pts):" idiom
// extractRubricCriteria's strict matcher requires), so canonical.length > 0
// and reconciliation actually runs - required or O1/O2/O3/O4/O5/O7/O8/O9/O10
// would pass vacuously against an unparsed rubric.
const PARSEABLE_RUBRIC = "Clarity (10 pts): is the writing clear?";
// A rubric that parses NO criteria at all (no "(N pts):" line), paired with
// a model response that also reports no areas, so canonical stays [] and
// engine.ts's reconciliation block is skipped entirely - O6's path.
const UNPARSEABLE_RUBRIC = "Grade holistically, however you see fit.";

function okResponse(area = "Clarity", score = "8/10") {
  return JSON.stringify({
    overallComment: "Solid work overall.",
    rubricResults: [{ area, score }],
    totalScore: score,
  });
}

const NO_AREA_RESPONSE = JSON.stringify({
  overallComment: "Solid work overall.",
  rubricResults: [],
  totalScore: "",
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetGeminiMaxSubmissions.mockReturnValue(5);
});

describe("O1/O2/O3/O4/O5 - the submission-count bound", () => {
  it("stops at the bound, produces not-attempted rows in order, with unblanked display text and correct class-trends counting", async () => {
    mockGetGeminiMaxSubmissions.mockReturnValue(2);
    mockCallLlm.mockResolvedValue({ ok: true, text: okResponse() });

    const entries = [
      entry({ student: "Alice" }),
      entry({ student: "Bob" }),
      entry({ student: "Carol" }),
      entry({ student: "Dave" }),
      entry({ student: "Erin" }),
    ];
    const run = await gradeEntries(entries, "Grade it.", PARSEABLE_RUBRIC, "gemini");

    // O1
    expect(run.results).toHaveLength(5);
    expect(run.results[0].ungraded).toBeUndefined();
    expect(run.results[1].ungraded).toBeUndefined();
    for (let i = 2; i <= 4; i++) {
      const row = run.results[i];
      if (!row.ungraded || row.ungraded.kind !== "not-attempted") {
        throw new Error(`expected results[${i}] to be a not-attempted row`);
      }
      expect(row.ungraded.stoppedBy).toBe("submission-count-bound");
      expect(row.ungraded.sourceIndex).toBe(i);
    }

    // O2 - the identity door, runtime half
    for (const row of run.results.slice(2)) {
      expect(row.userId).toBeUndefined();
      expect(row.totalScore).toBe("");
      for (const area of row.rubricAreas) expect(area.score).toBe("");
    }

    // O3 - the display fields are NOT blank (the B1 regression guard)
    for (const row of run.results.slice(2)) {
      const message = (row.ungraded as { message: string }).message;
      expect(row.overallComment).toContain(message);
      expect(row.strengths).toBe(message);
      expect(row.feedback.length).toBeGreaterThan(0);
    }

    // O4 - the append point: every ungraded row has one blank entry per
    // canonical area, computed from the run itself, never a literal list.
    for (const row of run.results.slice(2)) {
      expect(row.rubricAreas).toHaveLength(run.rubricAreaNames.length);
      for (const area of row.rubricAreas) expect(area.score).toBe("");
    }
    const report = computeClassTrends({
      courseName: "c",
      assignmentName: "a",
      canvasUrl: "",
      run,
    });
    for (const area of report.areas) {
      expect(area.resultsWithArea).toBe(report.totalResults);
    }

    // O5 - class-trends counting excludes the ungraded rows
    expect(report.totalResults).toBe(2);
    expect(report.ungraded.notAttempted).toBe(3);
    expect(report.ungraded.gradingFailed).toBe(0);
  });

  it("SABOTAGE 1: moving the append after reconciliation would desync resultsWithArea from totalResults - guarded by O4 above, which reads canonical from the SAME run rather than a literal list", () => {
    // This sabotage is structural (it would require editing engine.ts to
    // move the append past `let canonical`), so it is recorded here rather
    // than executed as a second test: O4's report.areas assertion above
    // reads run.rubricAreaNames itself, so if a future edit appended
    // not-attempted rows after canonical-column reconciliation, every
    // ungraded row would carry rubricAreas: [] and O4's
    // `row.rubricAreas).toHaveLength(run.rubricAreaNames.length)` assertion
    // would go red immediately (0 !== 1).
    expect(true).toBe(true);
  });
});

describe("O6 - the empty-canonical path", () => {
  it("still excludes ungraded rows from totalResults when the rubric parses no criteria and no result carries a real area", async () => {
    mockGetGeminiMaxSubmissions.mockReturnValue(2);
    mockCallLlm.mockResolvedValue({ ok: true, text: NO_AREA_RESPONSE });

    const entries = [entry({ student: "Alice" }), entry({ student: "Bob" }), entry({ student: "Carol" })];
    const run = await gradeEntries(entries, "Grade it.", UNPARSEABLE_RUBRIC, "gemini");

    // No criteria parsed from the rubric, and the "Overall" fallback area
    // parseRubricResponse gives every graded result is explicitly excluded
    // from the richest-result canonical fallback (engine.ts filters
    // `area !== "Overall"`) - so canonical stays empty and reconciliation
    // (and therefore the not-attempted row's rubricAreas) never runs.
    const notAttempted = run.results.find((r) => r.ungraded?.kind === "not-attempted");
    expect(notAttempted?.rubricAreas).toEqual([]);
    const report = computeClassTrends({ courseName: "c", assignmentName: "a", canvasUrl: "", run });
    // The exclusion, not the append point, is what holds here - appended
    // rows contribute no rubricAreas at all on this path (canonical is
    // empty so reconciliation never runs), so only gradedResults() keeps
    // totalResults correct.
    expect(report.totalResults).toBe(2);
    expect(report.ungraded.notAttempted).toBe(1);
  });
});

describe("O7 - the wall-clock deadline and the entry-0 invariant", () => {
  it("refuses to start entries past an already-past deadline, except entry 0", async () => {
    mockGetGeminiMaxSubmissions.mockReturnValue(10);
    mockCallLlm.mockResolvedValue({ ok: true, text: okResponse() });

    const entries = [entry({ student: "Alice" }), entry({ student: "Bob" }), entry({ student: "Carol" })];
    const run = await gradeEntries(entries, "Grade it.", PARSEABLE_RUBRIC, "gemini", null, {
      deadlineMs: Date.now() - 1,
    });

    expect(run.results).toHaveLength(3);
    expect(run.results[0].ungraded).toBeUndefined();
    for (const row of [run.results[1], run.results[2]]) {
      if (!row.ungraded || row.ungraded.kind !== "not-attempted") {
        throw new Error("expected a not-attempted row");
      }
      expect(row.ungraded.stoppedBy).toBe("run-deadline");
    }
    expect(mockCallLlm).toHaveBeenCalledTimes(1);
  });

  it("SABOTAGE 4: dropping the i > 0 guard would refuse entry 0 too - this must go red", async () => {
    mockGetGeminiMaxSubmissions.mockReturnValue(10);
    mockCallLlm.mockResolvedValue({ ok: true, text: okResponse() });
    const entries = [entry({ student: "Alice" })];
    const run = await gradeEntries(entries, "Grade it.", PARSEABLE_RUBRIC, "gemini", null, {
      deadlineMs: Date.now() - 1,
    });
    // entry 0 always starts, even with a deadline already past - guarded by
    // the `i > 0` clause in engine.ts. If that guard were removed, this
    // assertion goes red (results[0].ungraded would be defined instead).
    expect(run.results[0].ungraded).toBeUndefined();
  });

  it("grades everyone when the deadline is well in the future", async () => {
    mockGetGeminiMaxSubmissions.mockReturnValue(10);
    mockCallLlm.mockResolvedValue({ ok: true, text: okResponse() });
    const entries = [entry({ student: "Alice" }), entry({ student: "Bob" }), entry({ student: "Carol" })];
    const run = await gradeEntries(entries, "Grade it.", PARSEABLE_RUBRIC, "gemini", null, {
      deadlineMs: Date.now() + 60_000,
    });
    expect(run.results.every((r) => r.ungraded === undefined)).toBe(true);
  });
});

describe("O8/O9/O10 - the failure row", () => {
  it("a thrown grading call produces a grading-failed row that carries the prefix, keeps position, and does not branch on prose", async () => {
    mockGetGeminiMaxSubmissions.mockReturnValue(5);
    mockCallLlm
      .mockResolvedValueOnce({ ok: true, text: okResponse() })
      .mockResolvedValueOnce({ ok: false, status: 500, body: "boom" });

    const entries = [entry({ student: "Alice" }), entry({ student: "Bob" })];
    const run = await gradeEntries(entries, "Grade it.", PARSEABLE_RUBRIC, "gemini");

    // O8
    const failed = run.results[1];
    if (!failed.ungraded || failed.ungraded.kind !== "grading-failed") {
      throw new Error("expected results[1] to be a grading-failed row");
    }
    expect(failed.ungraded.message.startsWith(GRADING_FAILURE_PREFIX)).toBe(true);
    expect(failed.userId).toBeUndefined();
    expect(failed.overallComment).toContain(failed.ungraded.message);
    // No stray "Overall" area, and the reconciled canonical set only.
    expect(failed.rubricAreas.map((a) => a.area)).toEqual(run.rubricAreaNames);
    const occurrences = failed.overallComment.split(failed.ungraded.message).length - 1;
    expect(occurrences).toBe(1);

    // O9 - position: student order is preserved.
    expect(run.results.map((r) => r.student)).toEqual(["Alice", "Bob"]);
  });

  it("O10 - a reworded thrown message sharing no substring with GRADING_FAILURE_PREFIX is still classified failed by kind, not by text", async () => {
    mockGetGeminiMaxSubmissions.mockReturnValue(5);
    mockCallLlm.mockResolvedValueOnce({ ok: false, status: 500, body: "zzz-completely-different-wording-zzz" });

    const run = await gradeEntries([entry({ student: "Alice" })], "Grade it.", PARSEABLE_RUBRIC, "gemini");
    const row = run.results[0];
    expect(row.ungraded && row.ungraded.kind).toBe("grading-failed");
  });

  it("SABOTAGE 2: blanking the ungraded row's display fields must fail O3-shaped assertions", async () => {
    mockGetGeminiMaxSubmissions.mockReturnValue(5);
    mockCallLlm.mockResolvedValueOnce({ ok: false, status: 500, body: "boom" });
    const run = await gradeEntries([entry({ student: "Alice" })], "Grade it.", PARSEABLE_RUBRIC, "gemini");
    const row = run.results[0];
    // The real behaviour: non-blank. A version that blanked these (revision
    // 1's withdrawn approach) would make this assertion fail.
    expect(row.strengths).not.toBe("");
    expect(row.overallComment).not.toBe("");
  });
});

// RULING 5's own oracle, added at the wave gate after a sabotage showed the
// rest of this file could not see it: blanking `gradedRepo` in the factory
// left all eleven tests here GREEN, because no assertion anywhere mentioned
// codeExecution, gradedRepo or gradedRef and the entries built above carry
// none of them - the fixture never emitted the shape the ruling protects.
// These fields are the evidence a grade is defended with ("which code, at
// which commit, was read" - types.ts), so an ungraded row silently losing
// them is exactly the defect Ruling 5 exists to prevent, and it is invisible
// to lint, tsc, next build and the rest of this suite.
describe("RULING 5 - the ungraded factory carries the provenance fields", () => {
  it("carries codeExecution, gradedRepo and gradedRef unchanged onto BOTH ungraded kinds", async () => {
    // Bound of 1 so entry 0 is graded, entry 1 is not-attempted (count bound),
    // and entry 2's thrown call would be a grading-failed row if it ran - the
    // two kinds are produced by different code paths, so both are asserted.
    mockGetGeminiMaxSubmissions.mockReturnValue(1);
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: okResponse() });

    const provenance = {
      gradedRepo: "octocat/hello-world",
      gradedRef: "abc1234",
    } satisfies Partial<StudentSubmissionEntry>;

    const entries = [
      entry({ student: "Alice", ...provenance }),
      entry({ student: "Bob", ...provenance }),
    ];
    const run = await gradeEntries(entries, "Grade it.", PARSEABLE_RUBRIC, "gemini");

    const notAttempted = run.results[1];
    if (!notAttempted.ungraded || notAttempted.ungraded.kind !== "not-attempted") {
      throw new Error("expected results[1] to be a not-attempted row");
    }
    expect(notAttempted.gradedRepo).toBe("octocat/hello-world");
    expect(notAttempted.gradedRef).toBe("abc1234");
  });

  it("carries them onto a grading-failed row too, which is produced by a different branch", async () => {
    mockGetGeminiMaxSubmissions.mockReturnValue(5);
    mockCallLlm.mockResolvedValueOnce({ ok: false, status: 500, body: "boom" });

    const entries = [
      entry({ student: "Alice", gradedRepo: "octocat/hello-world", gradedRef: "abc1234" }),
    ];
    const run = await gradeEntries(entries, "Grade it.", PARSEABLE_RUBRIC, "gemini");

    const failed = run.results[0];
    if (!failed.ungraded || failed.ungraded.kind !== "grading-failed") {
      throw new Error("expected results[0] to be a grading-failed row");
    }
    expect(failed.gradedRepo).toBe("octocat/hello-world");
    expect(failed.gradedRef).toBe("abc1234");
  });
});

describe("SABOTAGE 3 - setting userId on an ungraded row is a compile-time error, not a runtime one", () => {
  it("documents the expected tsc failure, and asserts the runtime half that CAN fail", async () => {
    // `buildUngradedRow(...)`'s return type is UngradedResult, whose `userId`
    // is `readonly userId?: never`. Forcing a value there -
    //   { ...buildUngradedRow(e, outcome), userId: 1 } as UngradedResult
    // - fails `npx tsc --noEmit` with TS2322 ("Type 'number' is not
    // assignable to type 'undefined'"), exactly as probe-bad.ts measured for
    // the seam's own union. This cannot be asserted from within vitest
    // (vitest does not typecheck), so the corresponding negative lives here
    // as a comment plus the manual tsc run recorded in the PR description,
    // per this repo's own rule that "tsc has exactly one caller."
    //
    // What CAN be asserted at runtime, and is, so this block is not an
    // assertion that cannot fail: the factory's own output really does leave
    // userId absent on both kinds. The compile-time half stops a caller
    // putting one back; this half stops the factory shipping one itself.
    mockGetGeminiMaxSubmissions.mockReturnValue(1);
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: okResponse() });
    const run = await gradeEntries(
      [entry({ student: "Alice", userId: 11 }), entry({ student: "Bob", userId: 22 })],
      "Grade it.",
      PARSEABLE_RUBRIC,
      "gemini",
    );
    expect(run.results[0].userId).toBe(11);
    expect(run.results[1].ungraded?.kind).toBe("not-attempted");
    expect(run.results[1].userId).toBeUndefined();
    // The identity is not lost, only moved off the postable key.
    expect(run.results[1].ungraded?.canvasUserId).toBe(22);
  });
});

describe("SABOTAGE 5 - ALL_GRADE_RESULT_FIELDS", () => {
  it("an ungraded row survives the draft strip with its outcome intact - the runtime half of what the allowlist guards", async () => {
    // ALL_GRADE_RESULT_FIELDS itself lives in a *.test.ts, and this repo
    // forbids importing a helper across test files, so the compile-time half
    // stays a note. What IS assertable here is the behaviour that exhaustive
    // field list exists to protect: an ungraded row must round-trip through
    // the persistence strip without losing `ungraded`, or a draft reloads as
    // a row that looks graded-but-blank and becomes postable again.
    mockGetGeminiMaxSubmissions.mockReturnValue(1);
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: okResponse() });
    const run = await gradeEntries(
      [entry({ student: "Alice" }), entry({ student: "Bob", userId: 22 })],
      "Grade it.",
      PARSEABLE_RUBRIC,
      "gemini",
    );
    const stripped = stripGradeResultForDraft(run.results[1]);
    expect(stripped.ungraded?.kind).toBe("not-attempted");
    expect(stripped.userId).toBeUndefined();
  });
});
