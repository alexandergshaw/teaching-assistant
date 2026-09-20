// A16-1 unit tests for the adapter and gate in ./classTrendsEntry.ts.
// See that file's header comment and docs/a16-scope.md section 4.1/4.6 for
// why `run` must be carried by reference and what "trendable" means.
import { describe, expect, it } from "vitest";
import { hasTrendableResults, toClassTrendsEntry } from "./classTrendsEntry";
import type { GradeResult, GradingRun } from "@/lib/grade";

function gradedResult(overrides: Partial<GradeResult> = {}): GradeResult {
  return {
    student: "Ada",
    overallComment: "",
    strengths: "",
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [],
    totalScore: "",
    feedback: "",
    mergedFileCount: 0,
    submittedFiles: [],
    ...overrides,
  } as GradeResult;
}

function ungradedResult(overrides: Partial<GradeResult> = {}): GradeResult {
  return gradedResult({
    ungraded: {
      kind: "grading-failed",
      sourceIndex: 0,
      student: "Ada",
      message: "This submission could not be graded: timed out",
    },
    ...overrides,
  } as Partial<GradeResult>);
}

function run(results: GradeResult[]): GradingRun {
  return { results, rubricAreaNames: [], fullCreditChecklist: [] };
}

describe("toClassTrendsEntry", () => {
  it("V3: returns the SAME run object by reference (toBe, not toEqual)", () => {
    const r = run([gradedResult()]);
    const entry = toClassTrendsEntry(r, { courseName: "CS 101", assignmentName: "HW1", canvasUrl: "https://x" });
    expect(entry.run).toBe(r);
  });

  it("carries the meta fields through unchanged", () => {
    const r = run([]);
    const entry = toClassTrendsEntry(r, { courseName: "CS 101", assignmentName: "HW1", canvasUrl: "https://x" });
    expect(entry.courseName).toBe("CS 101");
    expect(entry.assignmentName).toBe("HW1");
    expect(entry.canvasUrl).toBe("https://x");
  });

  it("does not filter, reorder, or shorten results (length preserved)", () => {
    const results = [gradedResult({ student: "A" }), ungradedResult({ student: "B" }), gradedResult({ student: "C" })];
    const r = run(results);
    const entry = toClassTrendsEntry(r, { courseName: "", assignmentName: "", canvasUrl: "" });
    expect(entry.run.results).toHaveLength(3);
    expect(entry.run.results.map((res) => res.student)).toEqual(["A", "B", "C"]);
  });
});

describe("hasTrendableResults - enumerated product of {graded, ungraded} x {areas, no areas}", () => {
  const withAreas = [{ area: "Style", score: "8/10", comment: "" }];

  it.each([
    { label: "graded, has areas", result: gradedResult({ rubricAreas: withAreas }), expected: true },
    { label: "graded, no areas", result: gradedResult({ rubricAreas: [] }), expected: false },
    { label: "ungraded, has areas", result: ungradedResult({ rubricAreas: withAreas }), expected: false },
    { label: "ungraded, no areas", result: ungradedResult({ rubricAreas: [] }), expected: false },
  ])("$label -> $expected", ({ result, expected }) => {
    const entry = toClassTrendsEntry(run([result]), { courseName: "", assignmentName: "", canvasUrl: "" });
    expect(hasTrendableResults(entry)).toBe(expected);
  });

  it("is true when ANY result in a mixed run qualifies (some, not every)", () => {
    const results = [ungradedResult({ rubricAreas: [] }), gradedResult({ rubricAreas: [] }), gradedResult({ rubricAreas: withAreas })];
    const entry = toClassTrendsEntry(run(results), { courseName: "", assignmentName: "", canvasUrl: "" });
    expect(hasTrendableResults(entry)).toBe(true);
  });

  it("is false when every result in a mixed run fails to qualify", () => {
    const results = [ungradedResult({ rubricAreas: withAreas }), gradedResult({ rubricAreas: [] })];
    const entry = toClassTrendsEntry(run(results), { courseName: "", assignmentName: "", canvasUrl: "" });
    expect(hasTrendableResults(entry)).toBe(false);
  });

  it("is false for an empty run", () => {
    const entry = toClassTrendsEntry(run([]), { courseName: "", assignmentName: "", canvasUrl: "" });
    expect(hasTrendableResults(entry)).toBe(false);
  });
});
