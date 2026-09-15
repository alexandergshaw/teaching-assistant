import { describe, expect, it } from "vitest";
import {
  computeClassTrends,
  containsForbiddenCompletenessPhrase,
  parseScoreValue,
} from "./class-trends";
import type { GradeResult, GradingRunEntry, RubricAreaResult } from "./types";

// Independent of the implementation's own forbidden-phrase list, on purpose:
// if the module's list is ever narrowed, this test must still catch it.
const FORBIDDEN_PHRASES_FOR_TEST = [
  "the class",
  "all students",
  "every student",
  "the cohort",
];

function makeRubricArea(area: string, score: string): RubricAreaResult {
  return { area, score, comment: "" };
}

function makeResult(student: string, rubricAreas: RubricAreaResult[]): GradeResult {
  return {
    student,
    overallComment: "",
    strengths: "",
    improvements: "",
    resubmitNotice: "",
    rubricAreas,
    totalScore: "",
    feedback: "",
    mergedFileCount: 0,
    submittedFiles: [],
  };
}

function makeEntry(results: GradeResult[], rubricAreaNames: string[] = []): GradingRunEntry {
  return {
    courseName: "Test Course",
    assignmentName: "Test Assignment",
    canvasUrl: "https://example.instructure.com/courses/1/assignments/1",
    run: {
      results,
      rubricAreaNames,
      fullCreditChecklist: [],
    },
  };
}

function allSummaryText(report: ReturnType<typeof computeClassTrends>): string {
  return report.summaryLines.join("\n");
}

describe("parseScoreValue", () => {
  it("parses a percent literal", () => {
    expect(parseScoreValue("85%")).toEqual({ kind: "percent", value: 85 });
  });

  it("parses a fraction as a percentage", () => {
    expect(parseScoreValue("8/10")).toEqual({ kind: "percent", value: 80 });
  });

  it("parses a bare number as a raw-number, scale unknown", () => {
    expect(parseScoreValue("8")).toEqual({ kind: "raw-number", value: 8 });
  });

  it("treats a blank score as unscored, never coerced to 0", () => {
    expect(parseScoreValue("")).toEqual({ kind: "unscored" });
    expect(parseScoreValue("   ")).toEqual({ kind: "unscored" });
  });

  it('treats "N/A" as unscored', () => {
    expect(parseScoreValue("N/A")).toEqual({ kind: "unscored" });
  });

  it('treats "see comments" as unscored', () => {
    expect(parseScoreValue("see comments")).toEqual({ kind: "unscored" });
  });

  it("treats a range like 8-10 as unscored rather than averaging it", () => {
    expect(parseScoreValue("8-10")).toEqual({ kind: "unscored" });
  });

  it("treats a zero-denominator fraction as unscored rather than dividing by zero", () => {
    expect(parseScoreValue("5/0")).toEqual({ kind: "unscored" });
  });
});

describe("computeClassTrends - empty input", () => {
  it("returns an empty report for a run with no results", () => {
    const entry = makeEntry([]);
    const report = computeClassTrends(entry);

    expect(report.totalResults).toBe(0);
    expect(report.areas).toEqual([]);
    expect(report.strengths).toEqual([]);
    expect(report.struggles).toEqual([]);
    expect(report.summaryLines).toEqual([]);
  });
});

describe("computeClassTrends - happy path, one result", () => {
  it("reports full coverage for the single result's areas", () => {
    const entry = makeEntry([
      makeResult("Student A", [
        makeRubricArea("Thesis", "90%"),
        makeRubricArea("Grammar", "50%"),
      ]),
    ]);

    const report = computeClassTrends(entry);

    expect(report.totalResults).toBe(1);
    expect(report.areas).toHaveLength(2);

    const thesis = report.areas.find((a) => a.area === "thesis");
    expect(thesis).toBeDefined();
    expect(thesis?.resultsWithArea).toBe(1);
    expect(thesis?.totalResults).toBe(1);
    expect(thesis?.direction).toBe("high");

    const grammar = report.areas.find((a) => a.area === "grammar");
    expect(grammar?.direction).toBe("low");
  });
});

describe("computeClassTrends - coverage over a mixed set", () => {
  it("reports an area present on only some results as partial coverage, never averaged over all", () => {
    const entry = makeEntry([
      makeResult("Student A", [makeRubricArea("Thesis", "90%")]),
      makeResult("Student B", [makeRubricArea("Thesis", "85%")]),
      makeResult("Student C", [makeRubricArea("Grammar", "40%")]),
    ]);

    const report = computeClassTrends(entry);

    expect(report.totalResults).toBe(3);

    const thesis = report.areas.find((a) => a.area === "thesis");
    expect(thesis?.resultsWithArea).toBe(2);
    expect(thesis?.totalResults).toBe(3);
    expect(thesis?.scoredCount).toBe(2);

    const grammar = report.areas.find((a) => a.area === "grammar");
    expect(grammar?.resultsWithArea).toBe(1);
    expect(grammar?.totalResults).toBe(3);
  });

  it("groups differently-labelled but equivalent areas by normalized name", () => {
    const entry = makeEntry([
      makeResult("Student A", [makeRubricArea("Code Style (5 pts)", "90%")]),
      makeResult("Student B", [makeRubricArea("code style", "80%")]),
    ]);

    const report = computeClassTrends(entry);

    expect(report.areas).toHaveLength(1);
    expect(report.areas[0].area).toBe("code style");
    expect(report.areas[0].resultsWithArea).toBe(2);
  });
});

describe("computeClassTrends - unparseable scores", () => {
  it("counts each of the four unparseable forms as unscored, never as 0 and never dropped", () => {
    const entry = makeEntry([
      makeResult("Student A", [makeRubricArea("Thesis", "")]),
      makeResult("Student B", [makeRubricArea("Thesis", "N/A")]),
      makeResult("Student C", [makeRubricArea("Thesis", "see comments")]),
      makeResult("Student D", [makeRubricArea("Thesis", "8-10")]),
    ]);

    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis");

    expect(thesis?.resultsWithArea).toBe(4);
    expect(thesis?.scoredCount).toBe(0);
    expect(thesis?.unscoredCount).toBe(4);
    expect(thesis?.direction).toBe("insufficient-data");
    // Not coerced to 0: no numeric value was recorded for any of them.
    expect(thesis?.percentValues).toEqual([]);
    expect(thesis?.rawValues).toEqual([]);
  });
});

describe("computeClassTrends - consistently high area (strength)", () => {
  it("surfaces a consistently high area as a strength, coverage-qualified", () => {
    const entry = makeEntry([
      makeResult("Student A", [makeRubricArea("Thesis", "90%")]),
      makeResult("Student B", [makeRubricArea("Thesis", "85%")]),
      makeResult("Student C", [makeRubricArea("Thesis", "75%")]),
    ]);

    const report = computeClassTrends(entry);

    expect(report.strengths).toHaveLength(1);
    expect(report.strengths[0].area).toBe("thesis");
    expect(report.struggles).toHaveLength(0);
    expect(report.strengths[0].summary).toContain("3 of 3");
    expect(report.strengths[0].summary.toLowerCase()).toContain("high");
  });
});

describe("computeClassTrends - consistently low area (struggle)", () => {
  it("surfaces a consistently low area as a struggle, coverage-qualified", () => {
    const entry = makeEntry([
      makeResult("Student A", [makeRubricArea("Grammar", "40%")]),
      makeResult("Student B", [makeRubricArea("Grammar", "35%")]),
      makeResult("Student C", [makeRubricArea("Grammar", "55%")]),
    ]);

    const report = computeClassTrends(entry);

    expect(report.struggles).toHaveLength(1);
    expect(report.struggles[0].area).toBe("grammar");
    expect(report.strengths).toHaveLength(0);
    expect(report.struggles[0].summary).toContain("3 of 3");
    expect(report.struggles[0].summary.toLowerCase()).toContain("low");
  });
});

describe("computeClassTrends - mixed and no-scale areas", () => {
  it("reports mixed when percent scores land on both sides of the thresholds", () => {
    const entry = makeEntry([
      makeResult("Student A", [makeRubricArea("Thesis", "90%")]),
      makeResult("Student B", [makeRubricArea("Thesis", "30%")]),
    ]);

    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis");
    expect(thesis?.direction).toBe("mixed");
    expect(report.strengths).toHaveLength(0);
    expect(report.struggles).toHaveLength(0);
  });

  it("declines to classify high/low for raw numbers with no stated scale", () => {
    const entry = makeEntry([
      makeResult("Student A", [makeRubricArea("Thesis", "8")]),
      makeResult("Student B", [makeRubricArea("Thesis", "9")]),
    ]);

    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis");
    expect(thesis?.direction).toBe("no-scale");
    expect(thesis?.rawValues).toEqual([8, 9]);
    expect(report.strengths).toHaveLength(0);
    expect(report.struggles).toHaveLength(0);
  });
});

describe("computeClassTrends - no floor on layer A", () => {
  it("reports a trend even from a single graded result", () => {
    const entry = makeEntry([makeResult("Student A", [makeRubricArea("Thesis", "95%")])]);
    const report = computeClassTrends(entry);
    expect(report.strengths).toHaveLength(1);
  });
});

describe("containsForbiddenCompletenessPhrase", () => {
  it("flags each forbidden phrase", () => {
    for (const phrase of FORBIDDEN_PHRASES_FOR_TEST) {
      expect(containsForbiddenCompletenessPhrase(`Something about ${phrase} here`)).toBe(true);
    }
  });

  it("does not flag ordinary coverage language", () => {
    expect(
      containsForbiddenCompletenessPhrase("3 of 5 submissions graded so far covered Thesis")
    ).toBe(false);
  });
});

describe("output text never implies completeness or names a student", () => {
  it("never emits a forbidden completeness phrase across a realistic mixed report", () => {
    const entry = makeEntry([
      makeResult("Alice Anderson", [
        makeRubricArea("Thesis", "90%"),
        makeRubricArea("Grammar", "40%"),
      ]),
      makeResult("Bob Baker", [
        makeRubricArea("Thesis", "85%"),
        makeRubricArea("Grammar", ""),
      ]),
      makeResult("Carla Chen", [makeRubricArea("Thesis", "80%")]),
    ]);

    const report = computeClassTrends(entry);
    const text = allSummaryText(report);

    for (const phrase of FORBIDDEN_PHRASES_FOR_TEST) {
      expect(text.toLowerCase()).not.toContain(phrase);
    }
  });

  it("never emits a student name in any summary line", () => {
    const entry = makeEntry([
      makeResult("Alice Anderson", [makeRubricArea("Thesis", "90%")]),
      makeResult("Bob Baker", [makeRubricArea("Thesis", "20%")]),
    ]);

    const report = computeClassTrends(entry);
    const text = allSummaryText(report);

    expect(text).not.toContain("Alice");
    expect(text).not.toContain("Anderson");
    expect(text).not.toContain("Bob");
    expect(text).not.toContain("Baker");
  });
});

// SABOTAGE CONTROL (per the brief): temporarily break the per-area coverage
// count so it reports the run's total result count instead of the count of
// results that actually carried the area, confirm this test goes RED, then
// restore the real implementation. This test asserts the CORRECT behavior,
// so it is the one that must fail under the sabotaged code - see the report
// for the transcript of that run.
describe("sabotage control - per-area coverage must not equal total result count when they differ", () => {
  it("reports the true per-area coverage, not the run's total result count", () => {
    const entry = makeEntry([
      makeResult("Student A", [makeRubricArea("Thesis", "90%")]),
      makeResult("Student B", [makeRubricArea("Thesis", "85%")]),
      makeResult("Student C", []),
      makeResult("Student D", []),
      makeResult("Student E", []),
    ]);

    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis");

    expect(report.totalResults).toBe(5);
    expect(thesis?.resultsWithArea).toBe(2);
    expect(thesis?.resultsWithArea).not.toBe(report.totalResults);
  });
});
