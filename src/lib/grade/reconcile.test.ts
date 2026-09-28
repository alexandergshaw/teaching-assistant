import { describe, it, expect, vi, beforeEach } from "vitest";

// A39 wave 4a (docs/a39-waves.md 8.4.1): a FROZEN LITERAL captured from
// TODAY's gradeStudentEntries (via the exported gradeEntries), over a
// fixture whose rubric parses to NO criteria and whose two students
// disagree on rubric area names/casing - engine.ts's own canonical-column
// fallback branch. This was originally the oracle wave 4b's extraction
// (reconcile.ts) must not move: gradeStudentEntries must return results
// byte-identical to what the old inline reconciliation block produced
// (W4-1).
//
// A39 W1 / RULING 134 DELIBERATELY SUPERSEDES that invariant for exactly
// this fallback case: the empty-canonical fallback now unions every
// result's areas (unionAreaNames) instead of taking the single richest
// result's own areas, so the whole-run route and the incremental route
// converge on the same column set. The literal below was RE-CAPTURED by
// running this fixture against the union implementation
// (`npx vitest run src/lib/grade/reconcile.test.ts`, reading the RECEIVED
// value out of the failed run) rather than hand-predicted.
//
// Same mocking shape as engine.test.ts (not imported from it -
// no-cross-test-file-imports: importing a helper from another *.test.ts
// re-runs its describe blocks).
vi.mock("../gemini", () => ({
  getGeminiInterRequestDelayMs: () => 0,
  getGeminiMaxCharsPerSubmission: () => 4000,
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
import { reconcileRun, unionAreaNames } from "./reconcile";
import type { GradeResult, StudentSubmissionEntry } from "./types";

const mockCallLlm = vi.mocked(callLlm);

function entry(overrides: Partial<StudentSubmissionEntry> = {}): StudentSubmissionEntry {
  return {
    student: "Student",
    content: "some submitted work",
    mergedFileCount: 1,
    submittedFiles: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// W4-1/W4-2 - the frozen-literal oracle.
// ---------------------------------------------------------------------------
describe("gradeStudentEntries canonical-column reconciliation (frozen literal, W4-1)", () => {
  it("matches the literal captured from today's implementation, rubric with no parseable criteria, two students disagreeing on area names", async () => {
    // Alice's model response: two areas, "Clarity" and "Grammar".
    mockCallLlm.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        overallComment: "Alice did well overall.",
        rubricResults: [
          { area: "Clarity", score: "8/10" },
          { area: "Grammar", score: "9/10" },
        ],
        totalScore: "17/20",
      }),
    });
    // Bob's model response: the SAME two areas, but a different case/spelling
    // for the first one ("clarity" vs "Clarity") and a THIRD area Alice's
    // response never mentioned ("Structure") - the disagreement engine.ts's
    // canonical-fallback branch exists to reconcile.
    mockCallLlm.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        overallComment: "Bob needs improvement.",
        rubricResults: [
          { area: "clarity", score: "5/10" },
          { area: "Structure", score: "6/10" },
        ],
        totalScore: "11/20",
      }),
    });

    const run = await gradeEntries(
      [entry({ student: "Alice" }), entry({ student: "Bob" })],
      "Grade the assignment.",
      // Blank rubric: extractRubricCriteria("") parses to zero criteria, so
      // the canonical set falls back to unionAreaNames (RULING 134): a
      // first-seen union of every result's areas, in results order - Alice's
      // "Clarity"/"Grammar" first, then Bob's "Structure".
      "",
      "gemini"
    );

    // FROZEN LITERAL - RE-CAPTURED for A39 W1 / RULING 134 by running this
    // exact fixture (`npx vitest run src/lib/grade/reconcile.test.ts`)
    // against the union-fallback implementation, seeing it go RED first
    // against the OLD (richest-single-result) literal below, and then
    // reading the RECEIVED value out of that failure output - never
    // hand-written. Under the union fallback, the canonical set is the
    // first-seen union of every result's areas in the order given
    // (Alice's "Clarity"/"Grammar" first, then Bob's "Structure"), so both
    // students now carry a "Structure" column: Bob's own "Structure"
    // ("6/10") is no longer un-mapped, and Alice's is filled blank because
    // her response never mentioned it. As before, parseRubricResponse's
    // toRubricAreaResult (parsing.ts:42-46) ALWAYS sets `comment: ""` on a
    // parsed area, and both students lost points here (17/20, 11/20), so
    // composeOverallComment appends RESUBMIT_NOTICE to every row.
    const FROZEN_RESULTS: Array<Pick<GradeResult, "student" | "overallComment" | "rubricAreas" | "totalScore">> = [
      {
        student: "Alice",
        overallComment: "Alice did well overall. You are welcome to resubmit this assignment, and I will regrade it with no late penalty.",
        rubricAreas: [
          { area: "Clarity", score: "8/10", comment: "" },
          { area: "Grammar", score: "9/10", comment: "" },
          { area: "Structure", score: "", comment: "" },
        ],
        totalScore: "17/20",
      },
      {
        student: "Bob",
        // Bob's "clarity" normalizes onto the union's "Clarity" column;
        // his own "Structure" area is now ALSO part of the union (it is no
        // longer un-mapped, so it is not folded into overallComment as a
        // stray); the union's "Grammar" column, which Bob never mentioned,
        // is filled blank.
        overallComment: "Bob needs improvement. You are welcome to resubmit this assignment, and I will regrade it with no late penalty.",
        rubricAreas: [
          { area: "Clarity", score: "5/10", comment: "" },
          { area: "Grammar", score: "", comment: "" },
          { area: "Structure", score: "6/10", comment: "" },
        ],
        totalScore: "11/20",
      },
    ];
    const FROZEN_AREA_NAMES = ["Clarity", "Grammar", "Structure"];

    expect(
      run.results.map((r) => ({
        student: r.student,
        overallComment: r.overallComment,
        rubricAreas: r.rubricAreas,
        totalScore: r.totalScore,
      }))
    ).toEqual(FROZEN_RESULTS);
    expect(run.rubricAreaNames).toEqual(FROZEN_AREA_NAMES);
  });
});

// ---------------------------------------------------------------------------
// A39 W1 / RULING 134 - unionAreaNames itself, direct and pure (no mocks,
// no gradeEntries round-trip). This is the function both routes now call,
// so it is exercised directly rather than only through reconcileRun's
// fallback above.
// ---------------------------------------------------------------------------
describe("unionAreaNames (A39 W1, RULING 134)", () => {
  function areaResult(overrides: Partial<GradeResult> = {}): GradeResult {
    return {
      student: "Student",
      overallComment: "",
      strengths: "",
      improvements: "",
      resubmitNotice: "",
      rubricAreas: [],
      totalScore: "",
      feedback: "",
      mergedFileCount: 1,
      submittedFiles: [],
      ...overrides,
    };
  }

  it("returns a first-seen union, in the order rows are given, keeping the first-seen raw spelling", () => {
    const rows: GradeResult[] = [
      areaResult({
        student: "Alice",
        rubricAreas: [
          { area: "Clarity", score: "8/10", comment: "" },
          { area: "Grammar", score: "9/10", comment: "" },
        ],
      }),
      areaResult({
        student: "Bob",
        rubricAreas: [
          { area: "clarity", score: "5/10", comment: "" },
          { area: "Structure", score: "6/10", comment: "" },
        ],
      }),
    ];
    expect(unionAreaNames(rows)).toEqual(["Clarity", "Grammar", "Structure"]);
  });

  it("excludes the empty area and the Overall placeholder, the same two exclusions the old richest fallback applied", () => {
    const rows: GradeResult[] = [
      areaResult({
        rubricAreas: [
          { area: "Overall", score: "17/20", comment: "" },
          { area: "", score: "", comment: "" },
          { area: "Clarity", score: "8/10", comment: "" },
        ],
      }),
    ];
    expect(unionAreaNames(rows)).toEqual(["Clarity"]);
  });

  it("is pure - it does not mutate its input rows", () => {
    const rows: GradeResult[] = [
      areaResult({ rubricAreas: [{ area: "Clarity", score: "8/10", comment: "" }] }),
    ];
    const snapshot = JSON.parse(JSON.stringify(rows));
    unionAreaNames(rows);
    expect(rows).toEqual(snapshot);
  });

  it("returns an empty array over an empty row list", () => {
    expect(unionAreaNames([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// W4-2b - the double-reconcile watched failure.
//
// reconcileRun is a PURE projection, but it is not safe to call twice with a
// GROWING canonical set: reconciling once against a NARROW set folds any
// column outside that set into overallComment as a stray and drops it from
// rubricAreas, so a second call with a WIDER set can never recover it - the
// data is gone by the time the second call runs, exactly the shape the old
// inline block (mutating results in place across two passes) could produce
// if it were ever called more than once. This is stated as the wave's own
// discipline: engine.ts calls reconcileRun EXACTLY ONCE, with the FINAL
// canonical set, never incrementally - and this test is the instrument that
// would go RED if that discipline were ever violated.
// ---------------------------------------------------------------------------
describe("reconcileRun - the double-reconcile case must not be relied on (W4-2b)", () => {
  function fixtureResults(): GradeResult[] {
    return [
      {
        student: "Alice",
        overallComment: "",
        strengths: "",
        improvements: "",
        resubmitNotice: "",
        rubricAreas: [
          { area: "Clarity", score: "8/10", comment: "" },
          { area: "Grammar", score: "9/10", comment: "clean" },
        ],
        totalScore: "17/20",
        feedback: "",
        mergedFileCount: 1,
        submittedFiles: [],
      },
    ];
  }

  it("WATCHED FAILURE: reconciling twice with a growing canonical set loses the widened column's data", () => {
    const growingFirstPass = reconcileRun(fixtureResults(), ["Clarity"]);
    const doubleReconciled = reconcileRun(growingFirstPass.results, ["Clarity", "Grammar"]);
    const singleReconciled = reconcileRun(fixtureResults(), ["Clarity", "Grammar"]);

    // RED against the correct, single-call literal: the widened "Grammar"
    // column is blank after the double-reconcile, because the first pass
    // already folded Grammar's score into overallComment as a stray and
    // dropped it from rubricAreas - it is not there for the second pass to
    // find.
    expect(doubleReconciled.results[0].rubricAreas).toEqual([
      { area: "Clarity", score: "8/10", comment: "" },
      { area: "Grammar", score: "", comment: "" },
    ]);
    expect(doubleReconciled.results).not.toEqual(singleReconciled.results);

    // The correct answer, called once over the final set: Grammar's score
    // AND comment survive (this fixture's Grammar area carries a real
    // comment, "clean" - unlike a model-parsed row, see the frozen-literal
    // test's own note on parseRubricResponse always blanking `comment`).
    expect(singleReconciled.results[0].rubricAreas).toEqual([
      { area: "Clarity", score: "8/10", comment: "" },
      { area: "Grammar", score: "9/10", comment: "clean" },
    ]);
  });

  it("is idempotent when called twice with the SAME (already-final) canonical set", () => {
    const once = reconcileRun(fixtureResults(), ["Clarity", "Grammar"]);
    const twice = reconcileRun(once.results, ["Clarity", "Grammar"]);
    expect(twice.results).toEqual(once.results);
    expect(twice.rubricAreaNames).toEqual(once.rubricAreaNames);
  });
});
