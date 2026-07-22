import { describe, it, expect } from "vitest";
import { applyStopAfterCourse, buildCourseFanoutSummary, buildCourseFanoutDetail, countOkCourses, type RunStateGroup } from "./attended-fanout";

function group(courseId: string, courseName: string, stepStatuses: RunStateGroup["steps"][number]["status"][]): RunStateGroup {
  return {
    institution: null,
    courseId,
    courseName,
    steps: stepStatuses.map((status) => ({ status, progress: null, summary: null, error: null })),
  };
}

describe("applyStopAfterCourse", () => {
  it("marks every group from fromIndex onward as skipped, and leaves earlier groups untouched", () => {
    const groups: RunStateGroup[] = [
      { ...group("c1", "Course A", ["done", "done"]), courseStatus: "ok" },
      group("c2", "Course B", ["pending", "pending"]),
      group("c3", "Course C", ["pending", "pending"]),
    ];
    const { groups: next, skipped } = applyStopAfterCourse(groups, 1);

    expect(next[0]).toEqual(groups[0]);
    expect(next[1].courseStatus).toBe("skipped");
    expect(next[1].steps.every((s) => s.status === "skipped")).toBe(true);
    expect(next[2].courseStatus).toBe("skipped");
    expect(next[2].steps.every((s) => s.status === "skipped")).toBe(true);
    expect(skipped).toEqual([
      { courseId: "c2", courseName: "Course B", status: "skipped" },
      { courseId: "c3", courseName: "Course C", status: "skipped" },
    ]);
  });

  it("only turns PENDING steps skipped, leaving already-finished steps of a skipped group alone", () => {
    // A group can only be "remaining" (skipped) if it never started, so every
    // step in it should still be pending - but the transition is defensive:
    // a done/error step (should not happen in practice) is left as-is, not
    // overwritten to "skipped".
    const groups: RunStateGroup[] = [group("c1", "Course A", ["done", "pending"])];
    const { groups: next } = applyStopAfterCourse(groups, 0);
    expect(next[0].steps[0].status).toBe("done");
    expect(next[0].steps[1].status).toBe("skipped");
  });

  it("is a no-op (empty skipped list) when fromIndex is past the end", () => {
    const groups: RunStateGroup[] = [group("c1", "Course A", ["done"])];
    const { groups: next, skipped } = applyStopAfterCourse(groups, 1);
    expect(next).toEqual(groups);
    expect(skipped).toEqual([]);
  });

  it("does not mutate the input array or its groups", () => {
    const original: RunStateGroup[] = [group("c1", "Course A", ["pending"])];
    const snapshot = JSON.parse(JSON.stringify(original));
    applyStopAfterCourse(original, 0);
    expect(original).toEqual(snapshot);
  });
});

describe("buildCourseFanoutSummary", () => {
  it("builds the first-class results-block summary with no skipped clause when nothing was skipped", () => {
    const summary = buildCourseFanoutSummary([
      { courseId: "c1", courseName: "A", status: "ok" },
      { courseId: "c2", courseName: "B", status: "ok" },
      { courseId: "c3", courseName: "C", status: "failed" },
    ]);
    expect(summary).toBe("Generated 2 of 3 courses' runs; 1 failed");
  });

  it("appends the skipped clause when at least one course was skipped", () => {
    const summary = buildCourseFanoutSummary([
      { courseId: "c1", courseName: "A", status: "ok" },
      { courseId: "c2", courseName: "B", status: "failed" },
      { courseId: "c3", courseName: "C", status: "skipped" },
    ]);
    expect(summary).toBe("Generated 1 of 3 courses' runs; 1 failed; 1 skipped");
  });

  it("handles an all-ok fan-out", () => {
    const summary = buildCourseFanoutSummary([
      { courseId: "c1", courseName: "A", status: "ok" },
      { courseId: "c2", courseName: "B", status: "ok" },
    ]);
    expect(summary).toBe("Generated 2 of 2 courses' runs; 0 failed");
  });
});

describe("buildCourseFanoutDetail", () => {
  it("builds the compact write-back detail with no skipped clause when nothing was skipped", () => {
    const detail = buildCourseFanoutDetail([
      { courseId: "c1", courseName: "A", status: "ok" },
      { courseId: "c2", courseName: "B", status: "ok" },
      { courseId: "c3", courseName: "C", status: "failed" },
    ]);
    expect(detail).toBe("2/3 courses ok; 1 failed");
  });

  it("appends the skipped clause when at least one course was skipped", () => {
    const detail = buildCourseFanoutDetail([
      { courseId: "c1", courseName: "A", status: "ok" },
      { courseId: "c2", courseName: "B", status: "skipped" },
      { courseId: "c3", courseName: "C", status: "skipped" },
    ]);
    expect(detail).toBe("1/3 courses ok; 0 failed; 2 skipped");
  });

  it("includes all three counts for mixed-status outcomes", () => {
    const detail = buildCourseFanoutDetail([
      { courseId: "c1", courseName: "A", status: "ok" },
      { courseId: "c2", courseName: "B", status: "failed" },
      { courseId: "c3", courseName: "C", status: "skipped" },
      { courseId: "c4", courseName: "D", status: "ok" },
    ]);
    expect(detail).toBe("2/4 courses ok; 1 failed; 1 skipped");
  });
});

describe("countOkCourses", () => {
  it("counts groups with courseStatus ok", () => {
    const groups: RunStateGroup[] = [
      { ...group("c1", "Course A", ["done"]), courseStatus: "ok" },
      { ...group("c2", "Course B", ["done"]), courseStatus: "ok" },
      { ...group("c3", "Course C", ["error"]), courseStatus: "failed" },
    ];

    const count = countOkCourses(groups);
    expect(count).toBe(2);
  });

  it("returns 0 when no groups have ok status", () => {
    const groups: RunStateGroup[] = [
      { ...group("c1", "Course A", ["error"]), courseStatus: "failed" },
      { ...group("c2", "Course B", ["error"]), courseStatus: "failed" },
    ];

    const count = countOkCourses(groups);
    expect(count).toBe(0);
  });

  it("returns correct count with mixed statuses", () => {
    const groups: RunStateGroup[] = [
      { ...group("c1", "Course A", ["done"]), courseStatus: "ok" },
      { ...group("c2", "Course B", ["error"]), courseStatus: "failed" },
      { ...group("c3", "Course C", ["done"]), courseStatus: "ok" },
      { ...group("c4", "Course D", ["pending"]), courseStatus: "skipped" },
    ];

    const count = countOkCourses(groups);
    expect(count).toBe(2);
  });

  it("handles empty group array", () => {
    const groups: RunStateGroup[] = [];

    const count = countOkCourses(groups);
    expect(count).toBe(0);
  });

  it("ignores groups without courseStatus field", () => {
    const groups: RunStateGroup[] = [
      group("c1", "Course A", ["done"]),
      { ...group("c2", "Course B", ["done"]), courseStatus: "ok" },
    ];

    const count = countOkCourses(groups);
    expect(count).toBe(1);
  });
});
