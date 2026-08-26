// Frozen-literal regression test for gradingApiToRun, moved from
// src/app/actions/grading.ts (originally lines 28-66) into
// grading-run-mapping.ts. The expected values below are NOT derived by
// calling the new function and comparing it to the old one (that would be a
// tautology - see AGENTS memory: refactor-disarms-tests.md). They were
// captured by running the PRE-MOVE implementation (copied verbatim into a
// throwaway node/vitest script) against these exact inputs and printing its
// JSON output; see the split's report for the captured console output. Any
// future change to this function's actual behaviour must show up here as a
// failing assertion against these pinned literals.

import { describe, it, expect } from "vitest";
import { gradingApiToRun } from "./grading-run-mapping";
import type { GradingApiResponse } from "@/lib/grading-engine";

const sampleResponse: GradingApiResponse = {
  result_id: "r1",
  criteria: ["Correctness", "Style"],
  warnings: [],
  csv: "",
  students: [
    {
      student: "Ada Lovelace",
      total: 17,
      possible: 20,
      criteria: [
        { criterion: "Correctness", passed: true, points_earned: 10, points_possible: 10, detail: "All tests pass" },
        { criterion: "Style", passed: false, points_earned: 7, points_possible: 10, detail: "Missing docstrings" },
      ],
    },
    {
      student: "Alan Turing",
      total: 20,
      possible: 20,
      criteria: [
        { criterion: "Correctness", passed: true, points_earned: 10, points_possible: 10, detail: "All tests pass" },
        { criterion: "Style", passed: true, points_earned: 10, points_possible: 10, detail: "Clean" },
      ],
    },
  ],
};

describe("gradingApiToRun (frozen literal oracle)", () => {
  it("maps students unscaled when pointsPossible is null", () => {
    expect(gradingApiToRun(sampleResponse, null)).toEqual({
      rubricAreaNames: ["Correctness", "Style"],
      fullCreditChecklist: [],
      results: [
        {
          student: "Ada Lovelace",
          totalScore: "17/20",
          overallComment: "1/2 checks passed",
          strengths: "1/2 checks passed",
          improvements: "",
          resubmitNotice: "",
          feedback: "",
          mergedFileCount: 0,
          submittedFiles: [],
          rubricAreas: [
            { area: "Correctness", score: "10/10", comment: "All tests pass" },
            { area: "Style", score: "7/10", comment: "Missing docstrings" },
          ],
        },
        {
          student: "Alan Turing",
          totalScore: "20/20",
          overallComment: "2/2 checks passed",
          strengths: "2/2 checks passed",
          improvements: "",
          resubmitNotice: "",
          feedback: "",
          mergedFileCount: 0,
          submittedFiles: [],
          rubricAreas: [
            { area: "Correctness", score: "10/10", comment: "All tests pass" },
            { area: "Style", score: "10/10", comment: "Clean" },
          ],
        },
      ],
    });
  });

  it("rescales totals and rubric areas onto pointsPossible when given", () => {
    expect(gradingApiToRun(sampleResponse, 40)).toEqual({
      rubricAreaNames: ["Correctness", "Style"],
      fullCreditChecklist: [],
      results: [
        {
          student: "Ada Lovelace",
          totalScore: "34/40",
          overallComment: "1/2 checks passed",
          strengths: "1/2 checks passed",
          improvements: "",
          resubmitNotice: "",
          feedback: "",
          mergedFileCount: 0,
          submittedFiles: [],
          rubricAreas: [
            { area: "Correctness", score: "20/20", comment: "All tests pass" },
            { area: "Style", score: "14/20", comment: "Missing docstrings" },
          ],
        },
        {
          student: "Alan Turing",
          totalScore: "40/40",
          overallComment: "2/2 checks passed",
          strengths: "2/2 checks passed",
          improvements: "",
          resubmitNotice: "",
          feedback: "",
          mergedFileCount: 0,
          submittedFiles: [],
          rubricAreas: [
            { area: "Correctness", score: "20/20", comment: "All tests pass" },
            { area: "Style", score: "20/20", comment: "Clean" },
          ],
        },
      ],
    });
  });

  it("returns an empty results array when there are no students", () => {
    expect(gradingApiToRun({ ...sampleResponse, students: [] }, null)).toEqual({
      rubricAreaNames: ["Correctness", "Style"],
      fullCreditChecklist: [],
      results: [],
    });
  });
});
