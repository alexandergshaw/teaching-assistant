import { describe, it, expect } from "vitest";
import { buildGradingReviewRows, countPostableResults } from "./grading-review-rows";
import type { GradeResult, GradingRunEntry } from "@/lib/grade";

function makeResult(overrides: Partial<GradeResult> = {}): GradeResult {
  return {
    student: "Jane Doe",
    overallComment: "Nice work.",
    rubricAreas: [{ area: "Clarity", score: "8/10", comment: "" }],
    totalScore: "8/10",
    feedback: "",
    mergedFileCount: 1,
    submittedFiles: [],
    userId: 1,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<GradingRunEntry> = {}): GradingRunEntry {
  return {
    courseName: "Course A",
    assignmentName: "Essay 1",
    canvasUrl: "https://canvas.example.com/courses/1/assignments/2",
    run: {
      results: [makeResult()],
      rubricAreaNames: ["Clarity"],
      fullCreditChecklist: [],
      speedGraderUrl: "https://canvas.example.com/courses/1/gradebook/speed_grader?assignment_id=2",
    },
    ...overrides,
  };
}

describe("buildGradingReviewRows", () => {
  it("numbers runIndex/resultIndex over the full runs array, offline entries included", () => {
    const runs: GradingRunEntry[] = [
      makeEntry({ courseName: "Offline course", offline: true, canvasUrl: "" }),
      makeEntry({
        courseName: "Course A",
        run: {
          results: [makeResult({ student: "Alice", userId: 10 }), makeResult({ student: "Bob", userId: 11 })],
          rubricAreaNames: [],
          fullCreditChecklist: [],
          speedGraderUrl: "https://canvas.example.com/courses/1/gradebook/speed_grader?assignment_id=2",
        },
      }),
      makeEntry({ courseName: "Offline course 2", offline: true, canvasUrl: "" }),
      makeEntry({
        courseName: "Course B",
        run: {
          results: [makeResult({ student: "Carol", userId: 20 })],
          rubricAreaNames: [],
          fullCreditChecklist: [],
          speedGraderUrl: null,
        },
      }),
    ];

    const rows = buildGradingReviewRows(runs);

    // Offline entries at index 0 and 2 produce no rows, but the non-offline
    // entries keep their REAL position (1 and 3) in the full runs array.
    expect(rows.map((r) => [r.runIndex, r.resultIndex, r.student])).toEqual([
      ["1", "0", "Alice"],
      ["1", "1", "Bob"],
      ["3", "0", "Carol"],
    ]);
  });

  it("skips results with no numeric Canvas user id", () => {
    const runs: GradingRunEntry[] = [
      makeEntry({
        run: {
          results: [makeResult({ student: "No Id", userId: undefined }), makeResult({ student: "Has Id", userId: 5 })],
          rubricAreaNames: [],
          fullCreditChecklist: [],
        },
      }),
    ];
    const rows = buildGradingReviewRows(runs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runIndex: "0", resultIndex: "1", student: "Has Id" });
  });

  it("parses the earned score out of an earned/possible totalScore", () => {
    const runs: GradingRunEntry[] = [
      makeEntry({
        run: {
          results: [makeResult({ totalScore: "17.5/20" })],
          rubricAreaNames: [],
          fullCreditChecklist: [],
        },
      }),
    ];
    const rows = buildGradingReviewRows(runs);
    expect(rows[0].grade).toBe("17.5");
  });

  it("falls back to a bare number when totalScore has no earned/possible pair", () => {
    const runs: GradingRunEntry[] = [
      makeEntry({
        run: {
          results: [makeResult({ totalScore: "9" })],
          rubricAreaNames: [],
          fullCreditChecklist: [],
        },
      }),
    ];
    const rows = buildGradingReviewRows(runs);
    expect(rows[0].grade).toBe("9");
  });

  it("builds a SpeedGrader link with the student's userId appended, when available", () => {
    const runs: GradingRunEntry[] = [makeEntry()];
    const rows = buildGradingReviewRows(runs);
    expect(rows[0].submission).toBe(
      "https://canvas.example.com/courses/1/gradebook/speed_grader?assignment_id=2&student_id=1"
    );
  });

  it("leaves submission blank when the run has no speedGraderUrl", () => {
    const runs: GradingRunEntry[] = [
      makeEntry({
        run: { results: [makeResult()], rubricAreaNames: [], fullCreditChecklist: [], speedGraderUrl: null },
      }),
    ];
    const rows = buildGradingReviewRows(runs);
    expect(rows[0].submission).toBe("");
  });

  it("carries pointsPossible through as outOf, blank when unset", () => {
    const runs: GradingRunEntry[] = [
      makeEntry({ pointsPossible: 20 }),
      makeEntry({ pointsPossible: null }),
    ];
    const rows = buildGradingReviewRows(runs);
    expect(rows[0].outOf).toBe("20");
    expect(rows[1].outOf).toBe("");
  });

  it("returns no rows for an empty runs array", () => {
    expect(buildGradingReviewRows([])).toEqual([]);
  });
});

describe("countPostableResults", () => {
  it("matches the row count buildGradingReviewRows produces for the same runs", () => {
    const runs: GradingRunEntry[] = [
      makeEntry({ offline: true, canvasUrl: "" }),
      makeEntry({
        run: {
          results: [makeResult({ userId: 1 }), makeResult({ userId: undefined }), makeResult({ userId: 2 })],
          rubricAreaNames: [],
          fullCreditChecklist: [],
        },
      }),
    ];
    expect(countPostableResults(runs)).toBe(buildGradingReviewRows(runs).length);
    expect(countPostableResults(runs)).toBe(2);
  });

  it("returns 0 for an all-offline runs array", () => {
    const runs: GradingRunEntry[] = [makeEntry({ offline: true, canvasUrl: "" })];
    expect(countPostableResults(runs)).toBe(0);
  });
});
