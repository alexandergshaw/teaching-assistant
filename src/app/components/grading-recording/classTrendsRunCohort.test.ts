import { describe, expect, it } from "vitest";
import { gradedResults, ungradedResults, isUngraded, type GradeResult } from "@/lib/grade/types";
import { classifyGradingResult, GRADING_FAILURE_PREFIX, type GradingRecordingResult } from "./grading-rows";
import { buildRunCohort, cohortLabelSpread, runCohortMeta, toRunCohortEntry, type RunCohort } from "./classTrendsRunCohort";
import { hasTrendableResults } from "../grading-results/classTrendsEntry";

// A16-3 (docs/a16-plan.md 9.3, ruling 19): this file exercises the REAL
// merge, not a fixture of it - the panel's own capture code is never run by
// any test in this repo (nothing renders), so this is the only place a bad
// argument or a bad mapping can ever be caught.

function readyResult(id: string, overrides: Partial<GradingRecordingResult> = {}): { id: string } & GradingRecordingResult {
  return {
    id,
    totalScore: "9",
    strengths: "Clear structure.",
    improvements: "Cite a source.",
    overallComment: "Clear structure. Cite a source.",
    failed: false,
    rubricAreas: [{ area: "Structure", score: "9", comment: "Clear" }],
    ...overrides,
  };
}

function failedResult(id: string, message: string): { id: string } & GradingRecordingResult {
  return {
    id,
    totalScore: "",
    strengths: `${GRADING_FAILURE_PREFIX}${message}`,
    improvements: "",
    overallComment: "",
    failed: true,
    rubricAreas: [],
  };
}

describe("buildRunCohort - THE MERGE ITSELF (ruling 19)", () => {
  it("exercises the real classifyGradingResult over a real success result and returns a trendable cohort", () => {
    const results = [readyResult("s1")];
    const identity = [{ id: "s1", studentName: "Ada Lovelace", assessment: "Essay 2" }];
    const cohort = buildRunCohort(results, identity, { courseName: "CS 101", assignmentName: "Essay 2" });

    expect(cohort.rows.some((r) => !isUngraded(r.result) && r.result.rubricAreas.length > 0)).toBe(true);
    expect(hasTrendableResults(toRunCohortEntry(cohort))).toBe(true);
  });
});

describe("buildRunCohort - THE JOIN KEY IS BY id, NOT POSITIONAL", () => {
  it("attributes each result to its own student even when the two arrays are in different orders", () => {
    // DO NOT "simplify" this fixture back to two same-shaped readyResult()
    // calls with no overrides - that shape was tried first and it does NOT
    // catch a positional join. The P21 sabotage (join `results` to
    // `identity` by array index instead of by `id`) was run against exactly
    // that simpler fixture during this feature's own sabotage-verification
    // pass and it PASSED - every row's content was identical regardless of
    // which student it landed on, so a mis-ordering was invisible. Only
    // after giving each id its own distinguishable totalScore did the same
    // mutation go red. A fixture whose rows cannot be told apart cannot
    // detect which one got attributed to which student.
    const results = [readyResult("s2", { totalScore: "7" }), readyResult("s1", { totalScore: "10" })];
    const identity = [
      { id: "s1", studentName: "Ada Lovelace", assessment: undefined },
      { id: "s2", studentName: "Grace Hopper", assessment: undefined },
    ];
    const cohort = buildRunCohort(results, identity, { courseName: "", assignmentName: "" });

    const byStudent = new Map(cohort.rows.map((r) => [r.result.student, r.result]));
    expect(byStudent.get("Ada Lovelace")?.totalScore).toBe("10");
    expect(byStudent.get("Grace Hopper")?.totalScore).toBe("7");
  });

  it("omits a result whose id has no matching identity row, rather than emitting an undefined student", () => {
    const results = [readyResult("s1"), readyResult("missing")];
    const identity = [{ id: "s1", studentName: "Ada Lovelace", assessment: undefined }];
    const cohort = buildRunCohort(results, identity, { courseName: "", assignmentName: "" });

    expect(cohort.rows).toHaveLength(1);
    expect(cohort.rows[0].result.student).toBe("Ada Lovelace");
  });
});

describe("buildRunCohort - PER-ROW assessment (ruling 20)", () => {
  it("carries each row's OWN assessment value, never one value repeated across the cohort", () => {
    const results = [readyResult("s1"), readyResult("s2")];
    const identity = [
      { id: "s1", studentName: "Ada Lovelace", assessment: "Essay 1" },
      { id: "s2", studentName: "Grace Hopper", assessment: "Essay 2" },
    ];
    const cohort = buildRunCohort(results, identity, { courseName: "", assignmentName: "" });

    const byStudent = new Map(cohort.rows.map((r) => [r.result.student, r.assessment]));
    expect(byStudent.get("Ada Lovelace")).toBe("Essay 1");
    expect(byStudent.get("Grace Hopper")).toBe("Essay 2");
  });
});

describe("buildRunCohort - THE ROW-STATE MAPPING, RE-DERIVED", () => {
  it("maps a ready classification WITH rubric areas to a GradedResult carrying them", () => {
    const cohort = buildRunCohort(
      [readyResult("s1")],
      [{ id: "s1", studentName: "Ada Lovelace", assessment: undefined }],
      { courseName: "", assignmentName: "" }
    );
    const result = cohort.rows[0].result;
    expect(isUngraded(result)).toBe(false);
    expect(result.rubricAreas.length).toBeGreaterThan(0);
  });

  it("maps a ready classification with NO rubric areas to a GradedResult with an empty array", () => {
    const cohort = buildRunCohort(
      [readyResult("s1", { rubricAreas: [] })],
      [{ id: "s1", studentName: "Ada Lovelace", assessment: undefined }],
      { courseName: "", assignmentName: "" }
    );
    const result = cohort.rows[0].result;
    expect(isUngraded(result)).toBe(false);
    expect(result.rubricAreas).toEqual([]);
  });

  it("maps a failed classification to an UngradedResult whose message is the CLASSIFIER's stripped error, never a not-attempted outcome", () => {
    const cohort = buildRunCohort(
      [failedResult("s1", "The model returned no usable feedback.")],
      [{ id: "s1", studentName: "Ada Lovelace", assessment: undefined }],
      { courseName: "", assignmentName: "" }
    );
    const result = cohort.rows[0].result;
    // isUngraded (types.ts) is the repo's own sanctioned narrowing predicate
    // ("The one place any consumer asks the question") - `"ungraded" in
    // result` does NOT narrow here, because GradedResult declares `ungraded`
    // as an optional key (`ungraded?: undefined`), so the `in` operator
    // leaves `result.ungraded` typed `UngradedOutcome | undefined` on either
    // branch and `tsc` (never vitest's type-stripping esbuild transform)
    // catches it as TS18048. This assertion is not decoration: it is the
    // definedness check the narrowing depends on, so a leaf that ever
    // stopped classifying this input as ungraded fails LOUDLY here rather
    // than the compiler silently widening what is asserted below.
    expect(isUngraded(result)).toBe(true);
    if (!isUngraded(result)) throw new Error("expected an ungraded result");
    expect(result.ungraded.kind).toBe("grading-failed");
    expect(result.ungraded.message).toBe("The model returned no usable feedback.");
    // Cross-checked against the classifier itself, never re-derived here.
    expect(result.ungraded.message).toBe(classifyGradingResult(failedResult("x", "The model returned no usable feedback.")).error);
    expect(result.rubricAreas).toEqual([]);
  });

  it("never emits a not-attempted row for any input this row source can produce", () => {
    const cohort = buildRunCohort(
      [readyResult("s1"), failedResult("s2", "boom")],
      [
        { id: "s1", studentName: "Ada Lovelace", assessment: undefined },
        { id: "s2", studentName: "Grace Hopper", assessment: undefined },
      ],
      { courseName: "", assignmentName: "" }
    );
    for (const row of cohort.rows) {
      // Same isUngraded narrowing as above, for the same reason (`"ungraded"
      // in row.result` does not narrow away GradedResult's optional-but-
      // present `ungraded` key, so `tsc` sees `row.result.ungraded` as
      // possibly undefined).
      if (isUngraded(row.result)) {
        expect(row.result.ungraded.kind).not.toBe("not-attempted");
      }
    }
  });
});

describe("buildRunCohort - totalResults reflects only the ready rows", () => {
  it("computeClassTrends via toRunCohortEntry counts exactly the ready results, never the failed ones", async () => {
    const { computeClassTrends } = await import("@/lib/grade/class-trends");
    const cohort = buildRunCohort(
      [readyResult("s1"), readyResult("s2"), failedResult("s3", "boom")],
      [
        { id: "s1", studentName: "Ada Lovelace", assessment: undefined },
        { id: "s2", studentName: "Grace Hopper", assessment: undefined },
        { id: "s3", studentName: "Katherine Johnson", assessment: undefined },
      ],
      { courseName: "", assignmentName: "" }
    );
    expect(computeClassTrends(toRunCohortEntry(cohort)).totalResults).toBe(2);
  });
});

describe("buildRunCohort - the positive identity row", () => {
  it("every emitted result's student equals the identity row's studentName, on a distinctive value", () => {
    const cohort = buildRunCohort(
      [readyResult("s1")],
      [{ id: "s1", studentName: "Zzyzx Distinctive Name", assessment: undefined }],
      { courseName: "", assignmentName: "" }
    );
    expect(cohort.rows[0].result.student).toBe("Zzyzx Distinctive Name");
  });
});

describe("buildRunCohort - never carries userId", () => {
  it("the emitted result has no userId key at all", () => {
    const cohort = buildRunCohort(
      [readyResult("s1")],
      [{ id: "s1", studentName: "Ada Lovelace", assessment: undefined }],
      { courseName: "", assignmentName: "" }
    );
    const emitted = cohort.rows[0].result;
    expect(Object.keys(emitted)).not.toContain("userId");
    expect(JSON.stringify(emitted)).not.toContain('"userId"');
  });
});

describe("runCohortMeta - THE META PROJECTION", () => {
  // THREE cells, not four (docs/a16-wave2-verify.md RES-V-5): the prior
  // fourth cell ("empty capture") was byte-identical to the third
  // ("rows carry undefined") and its label was wrong regardless - every
  // cell here hardcodes a non-empty assignmentName, so none of them is the
  // empty-capture case at all. The genuine empty-capture case is the
  // separate `it` immediately below, which builds a cohort whose OWN
  // assignmentName is "". These three cells are honestly distinct inputs:
  // a label, a different single label, and undefined.
  it.each<[string, RunCohort["rows"]]>([
    ["a label", [{ result: { student: "A", overallComment: "", strengths: "", improvements: "", resubmitNotice: "", rubricAreas: [], totalScore: "", feedback: "", mergedFileCount: 0, submittedFiles: [] } as GradeResult, assessment: "Essay 2" }]],
    ["rows carry a different single label", [{ result: { student: "A", overallComment: "", strengths: "", improvements: "", resubmitNotice: "", rubricAreas: [], totalScore: "", feedback: "", mergedFileCount: 0, submittedFiles: [] } as GradeResult, assessment: "Some Other Label" }]],
    ["rows carry undefined", [{ result: { student: "A", overallComment: "", strengths: "", improvements: "", resubmitNotice: "", rubricAreas: [], totalScore: "", feedback: "", mergedFileCount: 0, submittedFiles: [] } as GradeResult, assessment: undefined }]],
  ])("returns the captured assignmentName unchanged regardless of what the rows carry - %s", (_label, rows) => {
    const cohort: RunCohort = { rows, courseName: "CS 101", assignmentName: "Essay 2" };
    const meta = runCohortMeta(cohort);
    expect(meta.assignmentName).toBe("Essay 2");
    expect(meta.courseName).toBe("CS 101");
    expect(meta.canvasUrl).toBe("");
  });

  it("returns '' unchanged when the capture itself was empty, never inventing a name from a row", () => {
    const cohort: RunCohort = {
      rows: [{ result: { student: "A", overallComment: "", strengths: "", improvements: "", resubmitNotice: "", rubricAreas: [], totalScore: "", feedback: "", mergedFileCount: 0, submittedFiles: [] } as GradeResult, assessment: "Essay 2" }],
      courseName: "",
      assignmentName: "",
    };
    expect(runCohortMeta(cohort).assignmentName).toBe("");
  });
});

describe("cohortLabelSpread - THE DISCLOSURE PREDICATE", () => {
  const row = (assessment: string | undefined) => ({
    result: { student: "A", overallComment: "", strengths: "", improvements: "", resubmitNotice: "", rubricAreas: [], totalScore: "", feedback: "", mergedFileCount: 0, submittedFiles: [] } as GradeResult,
    assessment,
  });

  it("is false when every row carries the same single label", () => {
    const cohort: RunCohort = { rows: [row("Essay 2"), row("Essay 2")], courseName: "", assignmentName: "" };
    expect(cohortLabelSpread(cohort)).toBe(false);
  });

  it("is true when one row carries a label and another carries undefined (counting undefined as its own value)", () => {
    const cohort: RunCohort = { rows: [row("Essay 2"), row(undefined)], courseName: "", assignmentName: "" };
    expect(cohortLabelSpread(cohort)).toBe(true);
  });

  it("is true when rows carry two different labels", () => {
    const cohort: RunCohort = { rows: [row("Essay 1"), row("Essay 2")], courseName: "", assignmentName: "" };
    expect(cohortLabelSpread(cohort)).toBe(true);
  });

  it("is false when every row carries undefined", () => {
    const cohort: RunCohort = { rows: [row(undefined), row(undefined)], courseName: "", assignmentName: "" };
    expect(cohortLabelSpread(cohort)).toBe(false);
  });
});

describe("buildRunCohort - never declares a second TRENDABLE predicate or meta type (ruling 10)", () => {
  it("this module's own source never declares a local hasTrendable* predicate", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./classTrendsRunCohort.ts", import.meta.url), "utf8");
    expect(/function\s+hasTrendable/i.test(source)).toBe(false);
    expect(/export\s+(?:type\s+)?\{\s*hasTrendableResults\s*\}/.test(source)).toBe(false);
  });
});

// ── FOUR LEAF-FIELD SURVIVORS, TRACED (docs/a16-wave2-verify.md section 5.2,
// N5/N6/N7/N10) - each field a cohort row carries was traced to every real
// consumer reachable from a Grade-submissions click, rather than assumed
// live or assumed dead.
//
// LIVE: overallComment (N10). Read by src/lib/grade/class-trends-insight.ts
// at anonymizeGradeResults (`.overallComment` copied per submission) and at
// renderSubmission (`submission.overallComment` rendered into the model
// prompt). Blanking it removes prose from the "Ask AI" concept-insight
// feature's own input. Fixed below with a positive read of a distinctive
// value.
//
// DEAD ON THIS PATH, confirmed by grep rather than assumed: `.strengths`,
// `.improvements` and `.feedback` never appear in any of the three files
// that read a GradeResult reachable from this cohort
// (src/lib/grade/class-trends.ts, src/lib/grade/class-trends-insight.ts,
// src/lib/grade/class-trends-draft.ts) - class-trends.ts reads only
// rubricAreas, class-trends-insight.ts reads only rubricAreas and
// overallComment, and class-trends-draft.ts never touches a raw GradeResult
// at all (it consumes AreaTrend and ClassTrendsInsightObservation, both
// already-aggregated). N6 (strengths/improvements swapped) and N7 (feedback
// blanked) are therefore instrument gaps, not reachable user-visible
// defects, on the path this feature ships. Same trace clears
// `ungraded.sourceIndex` (N5): class-trends.ts counts only `ungraded.kind`
// (`ungradedCounts`, itself read by nothing outside that file per
// docs/a16-wave2-verify.md section 5), never sourceIndex's value.
describe("buildRunCohort - overallComment reaches the emitted result (N10: read by class-trends-insight.ts)", () => {
  it("a ready row's overallComment equals the classifier's overallComment, on a distinctive value", () => {
    const cohort = buildRunCohort(
      [readyResult("s1", { overallComment: "A distinctive sentence only this classifier would produce." })],
      [{ id: "s1", studentName: "Ada Lovelace", assessment: undefined }],
      { courseName: "", assignmentName: "" }
    );
    const result = cohort.rows[0].result;
    expect(isUngraded(result)).toBe(false);
    if (isUngraded(result)) throw new Error("expected a graded result");
    expect(result.overallComment).toBe("A distinctive sentence only this classifier would produce.");
  });
});

describe("buildRunCohort - strengths/improvements/feedback/ungraded.sourceIndex are traced, not assumed (N5/N6/N7)", () => {
  it("no consumer reachable from this cohort reads .strengths, .improvements, .feedback, or ungraded row sourceIndex off a GradeResult", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const root = process.cwd();
    const consumerFiles = [
      resolve(root, "src/lib/grade/class-trends.ts"),
      resolve(root, "src/lib/grade/class-trends-insight.ts"),
      resolve(root, "src/lib/grade/class-trends-draft.ts"),
    ];
    const combined = consumerFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    // Canary: this scan does fire. overallComment IS read by one of these
    // files (class-trends-insight.ts), so a clean result on the fields
    // below is a measured absence, not a scan that never looks at anything.
    expect(combined).toMatch(/\.overallComment\b/);
    expect(combined).not.toMatch(/\.strengths\b/);
    expect(combined).not.toMatch(/\.improvements\b/);
    expect(combined).not.toMatch(/\.feedback\b/);
    expect(combined).not.toMatch(/\.sourceIndex\b/);
  });
});

// Keeps the imported gradedResults/ungradedResults helpers exercised so a
// future refactor of the row-state mapping above cannot silently widen the
// cohort past what class-trends.ts itself counts (5.5's own reasoning).
describe("sanity: gradedResults/ungradedResults agree with the mapping above", () => {
  it("splits a mixed cohort's results the same way class-trends.ts's own totalResults count does", () => {
    const cohort = buildRunCohort(
      [readyResult("s1"), failedResult("s2", "boom")],
      [
        { id: "s1", studentName: "Ada Lovelace", assessment: undefined },
        { id: "s2", studentName: "Grace Hopper", assessment: undefined },
      ],
      { courseName: "", assignmentName: "" }
    );
    const results = cohort.rows.map((r) => r.result);
    expect(gradedResults(results)).toHaveLength(1);
    expect(ungradedResults(results)).toHaveLength(1);
  });
});
