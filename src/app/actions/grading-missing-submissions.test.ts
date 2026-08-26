// Frozen-literal regression test for the assignment-id/course-id parsing and
// past-due filtering moved from src/app/actions/grading.ts (originally the
// duplicated block at lines 182-210 in listMissingSubmissionsAction and
// lines 305-333 in draftZerosForMissingAction) into
// grading-missing-submissions.ts. The expected values below were captured by
// running the PRE-MOVE implementation (copied verbatim into a throwaway
// node/vitest script) against these exact inputs and printing its output -
// never by comparing the new function to the old one (that would be a
// tautology - see AGENTS memory: refactor-disarms-tests.md).

import { describe, it, expect } from "vitest";
import {
  parseCourseIdFromCanvasUrl,
  parseSingleAssignmentId,
  selectPastDueZeroableAssignmentIds,
} from "./grading-missing-submissions";
import type { CanvasAssignmentWithDue } from "@/lib/canvas";

describe("parseCourseIdFromCanvasUrl (frozen literal oracle)", () => {
  it("extracts the numeric course id from a course URL", () => {
    expect(
      parseCourseIdFromCanvasUrl("https://school.instructure.com/courses/4821/assignments/99")
    ).toBe("4821");
  });

  it("returns null when the URL has no /courses/<id> segment", () => {
    expect(parseCourseIdFromCanvasUrl("https://school.instructure.com/no-course-here")).toBeNull();
  });
});

describe("parseSingleAssignmentId (frozen literal oracle)", () => {
  it("extracts the numeric assignment id from a URL, trimming whitespace", () => {
    expect(
      parseSingleAssignmentId(" https://school.instructure.com/courses/4821/assignments/99 ")
    ).toBe("99");
  });

  it("accepts a bare numeric id", () => {
    expect(parseSingleAssignmentId("123")).toBe("123");
  });

  it("returns null for a non-numeric, non-URL id", () => {
    expect(parseSingleAssignmentId("not-an-id")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseSingleAssignmentId("")).toBeNull();
  });
});

describe("selectPastDueZeroableAssignmentIds (frozen literal oracle)", () => {
  const nowIso = "2026-08-26T00:00:00.000Z";

  const briefs: CanvasAssignmentWithDue[] = [
    {
      assignmentId: "1",
      name: "Past due, zeroable",
      dueAt: "2026-08-20T00:00:00.000Z",
      pointsPossible: 10,
      submissionTypes: ["online_upload"],
      gradingType: "points",
      published: true,
      omitFromFinalGrade: false,
    },
    {
      assignmentId: "2",
      name: "Not yet due",
      dueAt: "2026-09-01T00:00:00.000Z",
      pointsPossible: 10,
      submissionTypes: ["online_upload"],
      gradingType: "points",
      published: true,
      omitFromFinalGrade: false,
    },
    {
      assignmentId: "3",
      name: "Past due but unpublished",
      dueAt: "2026-08-01T00:00:00.000Z",
      pointsPossible: 10,
      submissionTypes: ["online_upload"],
      gradingType: "points",
      published: false,
      omitFromFinalGrade: false,
    },
    {
      assignmentId: "4",
      name: "No due date",
      dueAt: null,
      pointsPossible: 10,
      submissionTypes: ["online_upload"],
      gradingType: "points",
      published: true,
      omitFromFinalGrade: false,
    },
    {
      assignmentId: "5",
      name: "Past due but not_graded",
      dueAt: "2026-08-01T00:00:00.000Z",
      pointsPossible: 10,
      submissionTypes: ["online_upload"],
      gradingType: "not_graded",
      published: true,
      omitFromFinalGrade: false,
    },
    {
      assignmentId: "6",
      name: "Past due but omitted from final grade",
      dueAt: "2026-08-01T00:00:00.000Z",
      pointsPossible: 10,
      submissionTypes: ["online_upload"],
      gradingType: "points",
      published: true,
      omitFromFinalGrade: true,
    },
    {
      assignmentId: "7",
      name: "Past due but no online submission type",
      dueAt: "2026-08-01T00:00:00.000Z",
      pointsPossible: 10,
      submissionTypes: ["on_paper"],
      gradingType: "points",
      published: true,
      omitFromFinalGrade: false,
    },
  ];

  it("keeps only the one assignment that is past due, published, graded, not omitted, and online", () => {
    expect(selectPastDueZeroableAssignmentIds(briefs, nowIso)).toEqual(["1"]);
  });
});
