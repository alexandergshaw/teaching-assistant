import { describe, expect, it } from "vitest";
import { filterGradeRowsForTable, GRADE_ROW_HAYSTACK } from "./gradeRowFilter";
import type { GradeRow } from "./gradingResultsHelpers";

function makeRow(fields: {
  student: string;
  totalScore?: string;
  strengths?: string;
  improvements?: string;
  resubmitNotice?: string;
}): GradeRow {
  const strengths = fields.strengths ?? "";
  const improvements = fields.improvements ?? "";
  const resubmitNotice = fields.resubmitNotice ?? "";
  return {
    student: fields.student,
    overallComment: `${strengths} ${improvements} ${resubmitNotice}`.trim(),
    strengths,
    improvements,
    resubmitNotice,
    rubricAreas: [],
    totalScore: fields.totalScore ?? "0/10",
    feedback: "",
    mergedFileCount: 0,
    submittedFiles: [],
  };
}

const ADA = makeRow({ student: "Ada Lovelace", totalScore: "9/10", strengths: "Clear loops" });
const GRACE = makeRow({ student: "Grace Hopper", totalScore: "7/10", improvements: "Handle the O'Neil edge case" });
const LINUS = makeRow({ student: "Linus Torvalds", totalScore: "4/10", resubmitNotice: "Resubmit by Friday" });
const ROWS: GradeRow[] = [ADA, GRACE, LINUS];

describe("GRADE_ROW_HAYSTACK", () => {
  it("is the frozen tuple of result fields in order", () => {
    expect(GRADE_ROW_HAYSTACK(ADA)).toEqual([
      "Ada Lovelace",
      "9/10",
      ADA.overallComment,
      "Clear loops",
      "",
      "",
    ]);
  });
});

describe("filterGradeRowsForTable", () => {
  it("returns the input array by reference for an empty query", () => {
    expect(filterGradeRowsForTable(ROWS, "")).toBe(ROWS);
  });

  it("returns the input array by reference for a whitespace or punctuation-only query", () => {
    expect(filterGradeRowsForTable(ROWS, "   ")).toBe(ROWS);
    expect(filterGradeRowsForTable(ROWS, "?!")).toBe(ROWS);
  });

  it("matches the student name case-insensitively", () => {
    expect(filterGradeRowsForTable(ROWS, "GRACE")).toEqual([GRACE]);
  });

  it("matches the score field", () => {
    expect(filterGradeRowsForTable(ROWS, "9/10")).toEqual([ADA]);
  });

  it("matches strengths, improvements and resubmit notice text", () => {
    expect(filterGradeRowsForTable(ROWS, "loops")).toEqual([ADA]);
    expect(filterGradeRowsForTable(ROWS, "edge case")).toEqual([GRACE]);
    expect(filterGradeRowsForTable(ROWS, "friday")).toEqual([LINUS]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterGradeRowsForTable(ROWS, "zzzz")).toEqual([]);
  });

  it("folds punctuation and whitespace runs", () => {
    expect(filterGradeRowsForTable(ROWS, "ada,   lovelace")).toEqual([ADA]);
  });

  it("ignores straight and curly apostrophes on both sides", () => {
    expect(filterGradeRowsForTable(ROWS, "oneil")).toEqual([GRACE]);
    expect(filterGradeRowsForTable(ROWS, "o’neil")).toEqual([GRACE]);
    expect(filterGradeRowsForTable(ROWS, "O'Neil")).toEqual([GRACE]);
  });
});
