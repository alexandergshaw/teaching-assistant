import { describe, expect, it } from "vitest";
import type { CourseStartupProgress } from "./startup-progress";
import { nextStartupTableSort, orderStartupStatuses, sortStartupCourses } from "./startup-table";

const courses = [
  { courseId: "first", label: "Class 10", states: [{ state: "running", count: 3 }] },
  { courseId: "second", label: "Class 2", states: [{ state: "running", count: 1 }] },
  { courseId: "third", label: "Class 1", states: [{ state: "succeeded", count: 2 }] },
  { courseId: "fourth", label: "Class 3", states: [{ state: "succeeded", count: 5 }, { state: "unknown", count: 0 }] },
  { courseId: "fifth", label: "Class 4", states: [{ state: "failed", count: 1 }] },
] as const satisfies readonly CourseStartupProgress[];

describe("startup status table sorting", () => {
  it("orders classes numerically in both directions without changing the snapshot", () => {
    expect(sortStartupCourses(courses, { column: "class", direction: "asc" }).map(({ courseId }) => courseId))
      .toEqual(["third", "second", "fourth", "fifth", "first"]);
    expect(sortStartupCourses(courses, { column: "class", direction: "desc" }).map(({ courseId }) => courseId))
      .toEqual(["first", "fifth", "fourth", "second", "third"]);
    expect(courses.map(({ courseId }) => courseId)).toEqual(["first", "second", "third", "fourth", "fifth"]);
  });

  it("sorts mixed rows by their highest-priority state, including class-wide statuses with zero targets", () => {
    expect(sortStartupCourses(courses, { column: "status", direction: "asc" }).map(({ courseId }) => courseId))
      .toEqual(["fifth", "fourth", "second", "first", "third"]);
    expect(sortStartupCourses(courses, { column: "status", direction: "desc" }).map(({ courseId }) => courseId))
      .toEqual(["third", "second", "first", "fourth", "fifth"]);
    expect(orderStartupStatuses(courses[3].states)).toEqual([
      { state: "unknown", count: 0 }, { state: "succeeded", count: 5 },
    ]);
  });

  it("reverses the active header and starts a newly selected header ascending", () => {
    const byStatus = nextStartupTableSort({ column: "class", direction: "desc" }, "status");
    expect(byStatus).toEqual({ column: "status", direction: "asc" });
    const reversed = nextStartupTableSort(byStatus, "status");
    expect(reversed).toEqual({ column: "status", direction: "desc" });
    expect(nextStartupTableSort(reversed, "status")).toEqual(byStatus);
  });
});
