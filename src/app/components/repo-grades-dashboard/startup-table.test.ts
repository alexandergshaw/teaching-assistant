import { describe, expect, it } from "vitest";
import type { CourseStartupProgress } from "./startup-progress";
import { formatStartupRepositoryCoverage, nextStartupTableSort, orderStartupStatuses, sortStartupCourses } from "./startup-table";

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

describe("startup repository coverage labels", () => {
  it("distinguishes complete enumeration, incomplete checks, and a partial repository list", () => {
    expect(formatStartupRepositoryCoverage({ checked: 0, found: 0, enumerationComplete: true }))
      .toBe("Repositories checked: 0 of 0");
    expect(formatStartupRepositoryCoverage({ checked: 4, found: 5, enumerationComplete: true }))
      .toBe("Repositories checked: 4 of 5 · Incomplete checks: 1");
    expect(formatStartupRepositoryCoverage({ checked: 4, found: 5, enumerationComplete: false }))
      .toBe("Repositories checked: 4 of 5 found · Incomplete checks: 1 · Repository list incomplete");
  });
});
