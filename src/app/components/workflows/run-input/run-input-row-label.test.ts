import { describe, it, expect } from "vitest";
import { describeRunInputRow } from "./run-input-row-label";
import type { RunInputColumn } from "./run-input-types";

const gradeColumns: RunInputColumn[] = [
  { key: "course", label: "Course" },
  { key: "assignment", label: "Assignment" },
  { key: "student", label: "Student", width: 140 },
  { key: "submission", label: "Submission", link: true, width: 90 },
  { key: "grade", label: "Grade", editable: true, width: 80 },
];

describe("describeRunInputRow", () => {
  it("prefers the 'student' column when it has a value", () => {
    const row = { course: "CS101", assignment: "HW1", student: "Ada Lovelace", submission: "https://x", grade: "" };
    expect(describeRunInputRow(gradeColumns, row, 0)).toBe("Ada Lovelace");
  });

  it("falls back to the first non-link column with a value when there is no student column", () => {
    const columns: RunInputColumn[] = [
      { key: "course", label: "Course" },
      { key: "toGrade", label: "To grade" },
    ];
    const row = { course: "CS101", toGrade: "5" };
    expect(describeRunInputRow(columns, row, 2)).toBe("CS101");
  });

  it("never uses a link column as the label", () => {
    const columns: RunInputColumn[] = [
      { key: "submission", label: "Submission", link: true },
      { key: "grade", label: "Grade" },
    ];
    const row = { submission: "https://example.com/file", grade: "" };
    // grade is blank too, so the fallback goes all the way to the row index.
    expect(describeRunInputRow(columns, row, 4)).toBe("row 5");
  });

  it("falls back to the 1-based row position when nothing else identifies the row", () => {
    const row = { course: "", assignment: "", student: "", submission: "https://x", grade: "" };
    expect(describeRunInputRow(gradeColumns, row, 6)).toBe("row 7");
  });
});
