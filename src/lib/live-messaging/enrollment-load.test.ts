import { describe, expect, it } from "vitest";
import type { AggregateResult, EnrollmentRow, LiveCourse } from "./enrollment-aggregator";
import { combineCourseResults, failedCourseResult } from "./enrollment-load";

function course(id: string): LiveCourse {
  return { id, name: `Course ${id}`, termName: null };
}

function rowFor(courseId: string, userId: string): EnrollmentRow {
  return {
    key: `MCC:${courseId}::${userId}`,
    institution: "MCC",
    courseId,
    course: `Course ${courseId}`,
    term: null,
    sectionId: null,
    section: "",
    userId,
    name: `S${userId}`,
    firstName: `S${userId}`,
    lastName: "",
    grade: null,
    missingCount: null,
  };
}

function okResult(courseId: string, userIds: string[]): AggregateResult {
  return {
    rows: userIds.map((u) => rowFor(courseId, u)),
    courses: [{ courseId, course: `Course ${courseId}`, kind: "ok" }],
    listError: null,
  };
}

describe("combineCourseResults", () => {
  it("keeps course order and counts courses with no result yet as pending", () => {
    const listed = [course("1"), course("2"), course("3")];
    const combined = combineCourseResults(listed, { "3": okResult("3", ["z"]), "1": okResult("1", ["a", "b"]) });
    expect(combined.rows.map((r) => r.key)).toEqual(["MCC:1::a", "MCC:1::b", "MCC:3::z"]);
    expect(combined.pending).toBe(1);
    expect(combined.failed).toBe(0);
  });

  it("a failed course does not blank the others", () => {
    const listed = [course("1"), course("2")];
    const combined = combineCourseResults(listed, {
      "1": failedCourseResult(course("1"), "boom"),
      "2": okResult("2", ["a"]),
    });
    expect(combined.rows).toHaveLength(1);
    expect(combined.failed).toBe(1);
    expect(combined.statuses.find((s) => s.courseId === "1")?.kind).toBe("failed");
  });

  it("counts partial (degraded) courses separately from failed ones", () => {
    const partial: AggregateResult = {
      rows: [rowFor("1", "a")],
      courses: [{ courseId: "1", course: "Course 1", kind: "partial", degraded: ["grades"], errors: ["x"] }],
      listError: null,
    };
    const combined = combineCourseResults([course("1")], { "1": partial });
    expect(combined.partial).toBe(1);
    expect(combined.failed).toBe(0);
    expect(combined.rows).toHaveLength(1);
  });

  it("is empty and not pending for an institution with no courses", () => {
    const combined = combineCourseResults([], {});
    expect(combined).toMatchObject({ rows: [], statuses: [], pending: 0, failed: 0, partial: 0 });
  });
});
