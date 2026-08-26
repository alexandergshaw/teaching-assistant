// Oracle for sortGradeRows, split out of gradingResultsHelpers.test.ts into
// its own file solely to keep that file under the project's 1000-line cap -
// same pattern that file's own header comment describes: every expected
// value below is a FROZEN LITERAL obtained by running a standalone node copy
// of the CURRENT (pre-move) `sortedResults` useMemo body from
// GradingResults.tsx (then :407-449) against this exact fixture, with plain
// node, before sortGradeRows existed in gradingResultsHelpers.ts. None of
// these expectations are computed by calling sortGradeRows and asserting it
// equals itself - see AGENTS.md / project memory on "refactors disarm tests"
// for why that distinction matters.
//
// SABOTAGE PROOF (performed once, during the move, then reverted): deleting
// the tie-break line (`if (comparison === 0) comparison = compareText(a.student,
// b.student);`) from sortGradeRows made the "sorts by total, breaking a tie
// by student name, both directions" test below fail with:
//   AssertionError: expected [ 'Bob Cole', 'Ann Cole', …(2) ] to deeply equal [ 'Ann Cole', 'Bob Cole', …(2) ]
// - proving this oracle has teeth, not just a description of what the code
// happens to do today.
//
// The fixture is deliberately built to exercise every branch: a TIE on the
// "total" column (Bob Cole and Ann Cole both "8/10") to prove the
// student-name tie-break fires; a non-numeric rubric score ("n/a", Bob Cole)
// and a student with no rubricAreas entry at all (Max Brooks) to exercise the
// compareText fallback; an empty submittedFiles array (Ann Cole) to exercise
// the "files" column's join-then-compare path at its edge; and a non-numeric
// totalScore ("not graded", Max Brooks) to exercise the "total" column's own
// compareText fallback.
import { describe, expect, it } from "vitest";
import { sortGradeRows, type GradeRow } from "./gradingResultsHelpers";

const rows = [
  {
    student: "Zoe Adams",
    submittedFiles: [{ name: "b.py" }, { name: "a.py" }],
    rubricAreas: [{ area: "Clarity", score: "7/10" }],
    totalScore: "15/20",
    overallComment: "Good structure.",
  },
  {
    student: "Bob Cole",
    submittedFiles: [{ name: "main.py" }],
    rubricAreas: [{ area: "Clarity", score: "n/a" }],
    totalScore: "8/10",
    overallComment: "Needs work.",
  },
  {
    student: "Ann Cole",
    submittedFiles: [],
    rubricAreas: [{ area: "Clarity", score: "9/10" }],
    totalScore: "8/10",
    overallComment: "Excellent.",
  },
  {
    student: "Max Brooks",
    submittedFiles: [{ name: "readme.md" }],
    rubricAreas: [],
    totalScore: "not graded",
    overallComment: "Alpha review.",
  },
] as unknown as GradeRow[];

function namesOf(sortState: { column: Parameters<typeof sortGradeRows>[1]["column"]; direction: "asc" | "desc" }) {
  return sortGradeRows(rows, sortState).map((r) => r.student);
}

describe("sortGradeRows", () => {
  it("sorts by student, ascending and descending", () => {
    expect(namesOf({ column: { kind: "student" }, direction: "asc" })).toEqual([
      "Ann Cole",
      "Bob Cole",
      "Max Brooks",
      "Zoe Adams",
    ]);
    expect(namesOf({ column: { kind: "student" }, direction: "desc" })).toEqual([
      "Zoe Adams",
      "Max Brooks",
      "Bob Cole",
      "Ann Cole",
    ]);
  });

  it("sorts by the files column's joined names, empty-array edge included", () => {
    expect(namesOf({ column: { kind: "files" }, direction: "asc" })).toEqual([
      "Ann Cole",
      "Zoe Adams",
      "Bob Cole",
      "Max Brooks",
    ]);
  });

  it("sorts by a rubric column, falling back to compareText for a missing/non-numeric score", () => {
    expect(namesOf({ column: { kind: "rubric", area: "Clarity" }, direction: "asc" })).toEqual([
      "Max Brooks",
      "Zoe Adams",
      "Ann Cole",
      "Bob Cole",
    ]);
  });

  it("sorts by total, breaking a tie by student name, both directions", () => {
    expect(namesOf({ column: { kind: "total" }, direction: "asc" })).toEqual([
      "Ann Cole",
      "Bob Cole",
      "Zoe Adams",
      "Max Brooks",
    ]);
    expect(namesOf({ column: { kind: "total" }, direction: "desc" })).toEqual([
      "Max Brooks",
      "Zoe Adams",
      "Bob Cole",
      "Ann Cole",
    ]);
  });

  it("sorts by overall comment", () => {
    expect(namesOf({ column: { kind: "overall" }, direction: "asc" })).toEqual([
      "Max Brooks",
      "Ann Cole",
      "Zoe Adams",
      "Bob Cole",
    ]);
  });

  it("never mutates the input array", () => {
    const before = rows.map((r) => r.student);
    sortGradeRows(rows, { column: { kind: "student" }, direction: "desc" });
    expect(rows.map((r) => r.student)).toEqual(before);
  });
});
