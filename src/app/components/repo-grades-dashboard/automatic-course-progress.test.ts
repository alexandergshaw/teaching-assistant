import { describe, expect, it } from "vitest";
import { automaticCourseProgress } from "./automatic-course-progress";

const course = { courseId: "course", label: "Class", reason: null, repositories: null };

describe("durable startup course counts", () => {
  it("adds a no-work marker without inventing a target", () => {
    const progress = automaticCourseProgress({ ...course, state: "scanned", counts: [] });
    expect(progress.states).toEqual([{ state: "no-work", count: 0 }]);
  });

  it("retains verified repository coverage and counts only grading targets", () => {
    const repositories = { checked: 2, found: 3, enumerationComplete: false };
    const progress = automaticCourseProgress({
      ...course, state: "partial", repositories,
      counts: [{ state: "queued", count: 4, reason: null }, { state: "partial", count: 1, reason: "prior-attempt" }],
    });
    expect(progress).toMatchObject({ repositories, states: [{ state: "queued", count: 4 }, { state: "partial", count: 1 }] });
    expect(progress.states.reduce((total, { count }) => total + count, 0)).toBe(5);
  });

  it("shows an incomplete scan with zero implied grading targets", () => {
    const progress = automaticCourseProgress({ ...course, state: "partial", counts: [] });
    expect(progress.states).toEqual([{ state: "partial", count: 0 }]);
  });
});
