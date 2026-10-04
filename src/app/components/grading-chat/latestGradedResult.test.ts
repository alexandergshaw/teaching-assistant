import { describe, it, expect } from "vitest";
import { isUngraded, type GradedResult, type GradingRun, type GradeResult, type UngradedResult } from "../../../lib/grade/types";
import { selectLatestResult } from "./latestGradedResult";

// Frozen-literal oracle (GRADER-WORKFLOW-OVERHAUL M1 AC-M1(a)). Every expectation
// names a const declared here, never run.results.at(-1). The upstream ascending
// order is pinned by incrementalRunPlan.test.ts and is not re-authored here.
const gradedA: GradedResult = {
  student: "Ada", overallComment: "", strengths: "s-ada", improvements: "", resubmitNotice: "",
  rubricAreas: [], totalScore: "9/10", feedback: "", mergedFileCount: 1, submittedFiles: [],
};
const gradedB: GradedResult = {
  student: "Boris", overallComment: "", strengths: "s-boris", improvements: "i-boris", resubmitNotice: "",
  rubricAreas: [], totalScore: "7/10", feedback: "", mergedFileCount: 1, submittedFiles: [],
};
const ungradedU: UngradedResult = {
  student: "Uma", overallComment: "", strengths: "Not graded.", improvements: "", resubmitNotice: "",
  rubricAreas: [], totalScore: "", feedback: "", mergedFileCount: 0, submittedFiles: [],
  ungraded: { kind: "not-attempted", stoppedBy: "submission-count-bound", sourceIndex: 2, student: "Uma", message: "Not graded." },
};

function runOf(results: GradeResult[]): GradingRun {
  return { results, rubricAreaNames: [], fullCreditChecklist: [] };
}

describe("selectLatestResult", () => {
  it("returns the last element by reference", () => {
    expect(selectLatestResult(runOf([gradedA, gradedB]))).toBe(gradedB);
  });

  it("returns an ungraded last element, not only graded rows", () => {
    const result = selectLatestResult(runOf([gradedA, ungradedU]));
    expect(result).toBe(ungradedU);
    expect(result !== null && isUngraded(result)).toBe(true);
  });

  it("keeps the graded discriminator when a graded row is last", () => {
    const result = selectLatestResult(runOf([ungradedU, gradedB]));
    expect(result).toBe(gradedB);
    expect(result?.ungraded).toBeUndefined();
  });

  it("returns null on an empty run", () => {
    expect(selectLatestResult(runOf([]))).toBeNull();
  });
});
