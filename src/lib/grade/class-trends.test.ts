import { describe, expect, it } from "vitest";
import {
  computeClassTrends,
  containsForbiddenCompletenessPhrase,
  isSubsetTrend,
  parseScoreValue,
  SUBSET_MIN_STUDENTS,
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

function makeResult(
  student: string,
  rubricAreas: RubricAreaResult[],
  overrides: Partial<Pick<GradeResult, "gradedRepo" | "gradedRef">> = {}
): GradeResult {
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
    ...overrides,
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

// N13b Wave 1 (security R5), W1-7: computeClassTrends populates
// knownIdentifiers from the run's own identifier strings - the denylist
// composeClassTrendsDraft's name filter scans against.
describe("computeClassTrends - knownIdentifiers collection (N13b Wave 1, W1-7)", () => {
  const SEED = "Zbrinqua Qwelford";

  it("collects each graded result's student identifier", () => {
    const entry = makeEntry([
      makeResult(SEED, [makeRubricArea("Thesis", "90%")]),
      makeResult("Other Student", [makeRubricArea("Thesis", "85%")]),
    ]);

    const report = computeClassTrends(entry);

    expect(report.knownIdentifiers).toContain(SEED);
    expect(report.knownIdentifiers).toContain("Other Student");
  });

  it("collects the owner segment of a gradedRepo string", () => {
    const entry = makeEntry([
      makeResult("Some Student", [makeRubricArea("Thesis", "90%")], {
        gradedRepo: "octo-student/hw1",
      }),
    ]);

    const report = computeClassTrends(entry);

    expect(report.knownIdentifiers).toContain("octo-student");
  });

  it("returns an empty knownIdentifiers array for a run with no results", () => {
    const entry = makeEntry([]);
    const report = computeClassTrends(entry);
    expect(report.knownIdentifiers).toEqual([]);
  });
});

// N13b Wave 2 (docs/n13b-wave2-test-notes.md section 4, Group A): the
// subset-count + instructor named-list feature. Every fixture below builds
// PER-RESULT (default identity) results via makeResult; distinctness is
// structural (each result is its own key by userId-or-index), never derived
// from `.student` string equality (INFO-3) - so results may share a
// `.student` value and still count as distinct students below.

describe("computeClassTrends - subset numerator counts distinct students who missed ANY points (W2-1, AC-1)", () => {
  it("4 results [50%,40%,55%,100%] -> studentCount 3, denominator 4, unknownExcludedCount 0", () => {
    const entry = makeEntry([
      makeResult("Student A", [makeRubricArea("Thesis", "50%")]),
      makeResult("Student B", [makeRubricArea("Thesis", "40%")]),
      makeResult("Student C", [makeRubricArea("Thesis", "55%")]),
      makeResult("Student D", [makeRubricArea("Thesis", "100%")]),
    ]);
    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis");
    expect(thesis?.missedSubset).not.toBeNull();
    expect(thesis?.missedSubset).toEqual({ studentCount: 3, denominator: 4, unknownExcludedCount: 0 });
  });

  it("sabotage control: counting every percent-kind score regardless of < 100 would report 4, not 3", () => {
    // Documents the discriminating mutation from the test notes (push into
    // the numerator on parsed.kind === "percent" regardless of < 100) without
    // actually mutating source - the oracle above is what goes RED under it.
    const entry = makeEntry([
      makeResult("Student A", [makeRubricArea("Thesis", "50%")]),
      makeResult("Student B", [makeRubricArea("Thesis", "40%")]),
      makeResult("Student C", [makeRubricArea("Thesis", "55%")]),
      makeResult("Student D", [makeRubricArea("Thesis", "100%")]),
    ]);
    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis");
    expect(thesis?.missedSubset?.studentCount).not.toBe(4);
  });
});

describe("isSubsetTrend - the threshold is an ABSOLUTE count of >= 3 distinct students, never a fraction (W2-2, AC-2)", () => {
  it("class of 4, 3 missed -> flags", () => {
    const entry = makeEntry([
      makeResult("A", [makeRubricArea("Thesis", "50%")]),
      makeResult("B", [makeRubricArea("Thesis", "40%")]),
      makeResult("C", [makeRubricArea("Thesis", "55%")]),
      makeResult("D", [makeRubricArea("Thesis", "100%")]),
    ]);
    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis")!;
    expect(thesis.missedSubset).toEqual({ studentCount: 3, denominator: 4, unknownExcludedCount: 0 });
    expect(isSubsetTrend(thesis)).toBe(true);
  });

  it("class of 30, 3 missed (3x 50% + 27x 100%) -> flags exactly as 3 of 4 does (absolute, not a fraction)", () => {
    const missed = Array.from({ length: 3 }, (_, i) => makeResult(`M${i}`, [makeRubricArea("Thesis", "50%")]));
    const clean = Array.from({ length: 27 }, (_, i) => makeResult(`C${i}`, [makeRubricArea("Thesis", "100%")]));
    const entry = makeEntry([...missed, ...clean]);
    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis")!;
    expect(thesis.missedSubset).toEqual({ studentCount: 3, denominator: 30, unknownExcludedCount: 0 });
    expect(isSubsetTrend(thesis)).toBe(true);
  });

  it("2 missed -> does not flag", () => {
    const entry = makeEntry([
      makeResult("A", [makeRubricArea("Thesis", "50%")]),
      makeResult("B", [makeRubricArea("Thesis", "40%")]),
      makeResult("C", [makeRubricArea("Thesis", "100%")]),
      makeResult("D", [makeRubricArea("Thesis", "100%")]),
    ]);
    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis")!;
    expect(thesis.missedSubset?.studentCount).toBe(2);
    expect(isSubsetTrend(thesis)).toBe(false);
  });

  it("SUBSET_MIN_STUDENTS is 3 (pinned so a silent threshold change is caught)", () => {
    expect(SUBSET_MIN_STUDENTS).toBe(3);
  });
});

describe("computeClassTrends - missed points is ANY deduction; high/low direction is UNCHANGED (W2-3, AC-3)", () => {
  it("3 results at 80% -> studentCount 3 (all < 100) AND direction 'high' (all >= 70) - additive, not a replacement", () => {
    const entry = makeEntry([
      makeResult("A", [makeRubricArea("Thesis", "80%")]),
      makeResult("B", [makeRubricArea("Thesis", "80%")]),
      makeResult("C", [makeRubricArea("Thesis", "80%")]),
    ]);
    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis")!;
    expect(thesis.missedSubset?.studentCount).toBe(3);
    expect(thesis.direction).toBe("high");
    expect(report.strengths.map((a) => a.area)).toContain("thesis");
    expect(isSubsetTrend(thesis)).toBe(true);
  });

  it("sabotage control: the old low-score rule (numerator only below 60) would report 0, not 3, for the 80% fixture", () => {
    const entry = makeEntry([
      makeResult("A", [makeRubricArea("Thesis", "80%")]),
      makeResult("B", [makeRubricArea("Thesis", "80%")]),
      makeResult("C", [makeRubricArea("Thesis", "80%")]),
    ]);
    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis")!;
    expect(thesis.missedSubset?.studentCount).not.toBe(0);
  });

  it("regression: the pre-existing high/low/mixed/no-scale direction tests stay green (see the earlier describe blocks in this file) - restated here as a same-fixture cross-check", () => {
    const entry = makeEntry([
      makeResult("Student A", [makeRubricArea("Grammar", "40%")]),
      makeResult("Student B", [makeRubricArea("Grammar", "35%")]),
      makeResult("Student C", [makeRubricArea("Grammar", "55%")]),
    ]);
    const report = computeClassTrends(entry);
    expect(report.struggles).toHaveLength(1);
    expect(report.struggles[0].area).toBe("grammar");
  });
});

describe("computeClassTrends - unknown-scale scores excluded from BOTH terms and disclosed (W2-4, AC-4)", () => {
  it("[50%,100%,8,N/A] over 4 distinct students -> studentCount 1, denominator 2, unknownExcludedCount 2", () => {
    const entry = makeEntry([
      makeResult("A", [makeRubricArea("Thesis", "50%")]),
      makeResult("B", [makeRubricArea("Thesis", "100%")]),
      makeResult("C", [makeRubricArea("Thesis", "8")]),
      makeResult("D", [makeRubricArea("Thesis", "N/A")]),
    ]);
    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis")!;
    expect(thesis.missedSubset).not.toBeNull();
    expect(thesis.missedSubset).toEqual({ studentCount: 1, denominator: 2, unknownExcludedCount: 2 });
  });

  it("sabotage control: counting an unknown score into the denominator instead of unknownExcludedCount would report denominator 4, not 2", () => {
    const entry = makeEntry([
      makeResult("A", [makeRubricArea("Thesis", "50%")]),
      makeResult("B", [makeRubricArea("Thesis", "100%")]),
      makeResult("C", [makeRubricArea("Thesis", "8")]),
      makeResult("D", [makeRubricArea("Thesis", "N/A")]),
    ]);
    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis")!;
    expect(thesis.missedSubset?.denominator).not.toBe(4);
  });
});

describe("computeClassTrends - a resolved identity DEDUPES two results sharing one roster key (W2-5, AC-1/AC-2 identity basis)", () => {
  // keyOf maps repo-a and repo-b to one key ("ada"), repo-c to another
  // ("ben") - a unit test of the seam directly, ahead of any repo-surface
  // wiring (Wave 3).
  function keyOf(result: GradeResult): { key: string; displayName: string } | null {
    if (result.student === "repo-a" || result.student === "repo-b") {
      return { key: "ada", displayName: "Ada Lovelace" };
    }
    if (result.student === "repo-c") {
      return { key: "ben", displayName: "Ben Franklin" };
    }
    return null;
  }

  it("three results, two sharing a key -> studentCount 2 (deduped), isSubsetTrend false", () => {
    const entry = makeEntry([
      makeResult("repo-a", [makeRubricArea("Thesis", "50%")]),
      makeResult("repo-b", [makeRubricArea("Thesis", "40%")]),
      makeResult("repo-c", [makeRubricArea("Thesis", "55%")]),
    ]);
    const report = computeClassTrends(entry, { kind: "resolved", keyOf });
    const thesis = report.areas.find((a) => a.area === "thesis")!;
    expect(thesis.missedSubset).toEqual({ studentCount: 2, denominator: 2, unknownExcludedCount: 0 });
    expect(isSubsetTrend(thesis)).toBe(false);
  });

  it("sabotage control: keying by array index instead of keyOf's key would report studentCount 3, not 2", () => {
    const entry = makeEntry([
      makeResult("repo-a", [makeRubricArea("Thesis", "50%")]),
      makeResult("repo-b", [makeRubricArea("Thesis", "40%")]),
      makeResult("repo-c", [makeRubricArea("Thesis", "55%")]),
    ]);
    const report = computeClassTrends(entry, { kind: "resolved", keyOf });
    const thesis = report.areas.find((a) => a.area === "thesis")!;
    expect(thesis.missedSubset?.studentCount).not.toBe(3);
  });
});

describe("computeClassTrends - the named list EQUALS the counted set (W2-6, AC-9)", () => {
  it("4 distinct students on Thesis, one not-missed (100%) -> instructorAttribution names exactly the 3 who missed", () => {
    const entry = makeEntry([
      makeResult("Ada Lovelace", [makeRubricArea("Thesis", "50%")]),
      makeResult("Ben Franklin", [makeRubricArea("Thesis", "40%")]),
      makeResult("Cara Diaz", [makeRubricArea("Thesis", "55%")]),
      makeResult("Dan Ek", [makeRubricArea("Thesis", "100%")]),
    ]);
    const report = computeClassTrends(entry);
    const thesis = report.areas.find((a) => a.area === "thesis")!;
    expect(thesis.missedSubset?.studentCount).toBe(3);

    const attribution = report.instructorAttribution.find((a) => a.area === "thesis");
    expect(attribution).toBeDefined();
    const names = attribution!.students.map((s) => s.displayName).sort();
    expect(names).toEqual(["Ada Lovelace", "Ben Franklin", "Cara Diaz"]);
    expect(attribution!.students).toHaveLength(thesis.missedSubset!.studentCount);
    expect(names).not.toContain("Dan Ek");
  });

  it("sabotage control: building students from the denominator set (all 4) instead of the missed set would include Dan Ek and have length 4", () => {
    const entry = makeEntry([
      makeResult("Ada Lovelace", [makeRubricArea("Thesis", "50%")]),
      makeResult("Ben Franklin", [makeRubricArea("Thesis", "40%")]),
      makeResult("Cara Diaz", [makeRubricArea("Thesis", "55%")]),
      makeResult("Dan Ek", [makeRubricArea("Thesis", "100%")]),
    ]);
    const report = computeClassTrends(entry);
    const attribution = report.instructorAttribution.find((a) => a.area === "thesis")!;
    expect(attribution.students.map((s) => s.displayName)).not.toContain("Dan Ek");
    expect(attribution.students).not.toHaveLength(4);
  });
});

describe("computeClassTrends - INFO-2: under 'unavailable' identity, missedSubset/instructorAttribution are suppressed but knownIdentifiers STAYS populated (W2-7)", () => {
  it("two results, area Thesis [50%,40%], identity unavailable -> missedSubset null, instructorAttribution [], knownIdentifiers still has both names", () => {
    const entry = makeEntry([
      makeResult("Zbrinqua Qwelford", [makeRubricArea("Thesis", "50%")]),
      makeResult("S2", [makeRubricArea("Thesis", "40%")]),
    ]);
    const report = computeClassTrends(entry, { kind: "unavailable", reason: "no roster identity on this surface" });

    expect(report.areas[0].missedSubset).toBeNull();
    expect(report.instructorAttribution).toEqual([]);
    expect(report.knownIdentifiers).toContain("Zbrinqua Qwelford");
    expect(report.knownIdentifiers).toContain("S2");
  });

  it("THE LOAD-BEARING SABOTAGE (per the test notes: the single most important layer-A guard in the wave): gating collectKnownIdentifiers behind identity.kind !== 'unavailable' would empty knownIdentifiers under 'unavailable' - documented via a direct re-implementation of the (correct) production call, proving the real call must NOT take this shape", () => {
    const results: GradeResult[] = [
      makeResult("Zbrinqua Qwelford", [makeRubricArea("Thesis", "50%")]),
      makeResult("S2", [makeRubricArea("Thesis", "40%")]),
    ];
    const entry = makeEntry(results);
    const identity = { kind: "unavailable" as const, reason: "no roster identity on this surface" };
    const report = computeClassTrends(entry, identity);
    // The real production behavior: knownIdentifiers is non-empty even though
    // identity.kind === "unavailable". A gated implementation
    // (`identity.kind !== "unavailable" ? collect(...) : []`) would make this
    // assertion fail (knownIdentifiers would be []).
    expect(report.knownIdentifiers.length).toBeGreaterThan(0);
  });
});
