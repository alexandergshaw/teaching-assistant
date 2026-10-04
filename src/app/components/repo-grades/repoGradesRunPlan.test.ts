import { describe, expect, it } from "vitest";
import { repoGradesRunPlanLabels, type RepoGradesRunPlanInput } from "./repoGradesRunPlan";

function input(overrides: Partial<RepoGradesRunPlanInput>): RepoGradesRunPlanInput {
  return {
    folder: "week-05",
    gradeTargetCount: 0,
    scopedToSelection: false,
    scanTruncated: false,
    alreadyAttempted: false,
    postableCount: 0,
    ...overrides,
  };
}

describe("repoGradesRunPlanLabels gradeLabel (frozen literals)", () => {
  const cases: Array<[number, boolean, boolean, string]> = [
    [0, false, false, "Nothing to grade in week-05"],
    [0, true, true, "Nothing to grade in week-05"],
    [1, false, false, "Grade all 1 repo in week-05"],
    [1, false, true, "Grade all 1 repo in week-05 (scan incomplete)"],
    [2, false, false, "Grade all 2 repos in week-05"],
    [2, false, true, "Grade all 2 repos in week-05 (scan incomplete)"],
    [1, true, false, "Grade 1 selected repo in week-05"],
    [3, true, false, "Grade 3 selected repos in week-05"],
    [3, true, true, "Grade 3 selected repos in week-05 (scan incomplete)"],
  ];
  it.each(cases)("count=%i scoped=%s truncated=%s", (gradeTargetCount, scopedToSelection, scanTruncated, expected) => {
    expect(repoGradesRunPlanLabels(input({ gradeTargetCount, scopedToSelection, scanTruncated })).gradeLabel).toBe(expected);
  });
});

describe("repoGradesRunPlanLabels postLabel (frozen literals)", () => {
  const cases: Array<[boolean, number, string]> = [
    [false, 0, "Post 0 grade(s)"],
    [false, 1, "Post 1 grade(s)"],
    [false, 2, "Post 2 grade(s)"],
    [false, 3, "Post 3 grade(s)"],
    [true, 0, "Re-post 0 grade(s)"],
    [true, 3, "Re-post 3 grade(s)"],
  ];
  it.each(cases)("alreadyAttempted=%s postable=%i", (alreadyAttempted, postableCount, expected) => {
    expect(repoGradesRunPlanLabels(input({ alreadyAttempted, postableCount })).postLabel).toBe(expected);
  });
});
