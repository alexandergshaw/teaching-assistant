import { describe, it, expect } from "vitest";
import {
  applyStopAfterCourse,
  buildCourseFanoutSummary,
  buildCourseFanoutDetail,
  countOkCourses,
  buildComposedFanoutEntities,
  pinComposedGroupScope,
  uniqueZipEntryName,
  planCourseDownload,
  type RunStateGroup,
} from "./attended-fanout";

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

describe("buildComposedFanoutEntities", () => {
  it("maps each resolved course tile to an entity carrying its own institution", () => {
    const entities = buildComposedFanoutEntities([
      { id: "t1", name: "Course A", institution: "MCC" },
      { id: "t2", name: "Course B", institution: "UT" },
    ]);
    expect(entities).toEqual([
      { institution: "MCC", courseId: "t1", courseName: "Course A" },
      { institution: "UT", courseId: "t2", courseName: "Course B" },
    ]);
  });

  it("preserves a null institution for an institution-less tile", () => {
    const entities = buildComposedFanoutEntities([{ id: "t1", name: "Course A", institution: null }]);
    expect(entities).toEqual([{ institution: null, courseId: "t1", courseName: "Course A" }]);
  });

  it("returns an empty array for an empty resolved list", () => {
    expect(buildComposedFanoutEntities([])).toEqual([]);
  });
});

describe("pinComposedGroupScope", () => {
  it("pins both the course id and the tile's own institution, preserving other scope families", () => {
    const scope = pinComposedGroupScope({ institution: "*", hubCourse: "*", org: "x" }, "t1", "MCC");
    expect(scope).toEqual({ institution: "MCC", hubCourse: "t1", org: "x" });
  });

  it("pins institution to an empty string for an institution-less tile (rather than leaving *)", () => {
    const scope = pinComposedGroupScope({ institution: "*", hubCourse: "*" }, "t1", null);
    expect(scope).toEqual({ institution: "", hubCourse: "t1" });
  });
});

// AC4 (defect-2 write-up): a course's step group used to trigger up to six
// separate browser downloads (a real Course Build run produced roughly
// eighteen across three courses) - these two pure functions are the "what to
// download" decision the runner (useWorkflowRun.ts) now makes exactly once,
// when a course's step group finishes, instead of each step deciding for
// itself.
describe("uniqueZipEntryName", () => {
  it("returns the name unchanged the first time it is seen, and records it as used", () => {
    const used = new Set<string>();
    expect(uniqueZipEntryName("Assignment.docx", used)).toBe("Assignment.docx");
    expect(used.has("Assignment.docx")).toBe(true);
  });

  it("inserts ' (2)' before the extension on a repeat", () => {
    const used = new Set<string>(["Assignment.docx"]);
    expect(uniqueZipEntryName("Assignment.docx", used)).toBe("Assignment (2).docx");
  });

  it("keeps incrementing until it finds a free name", () => {
    const used = new Set<string>(["Assignment.docx", "Assignment (2).docx", "Assignment (3).docx"]);
    expect(uniqueZipEntryName("Assignment.docx", used)).toBe("Assignment (4).docx");
  });

  it("handles a name with no extension", () => {
    const used = new Set<string>(["README"]);
    expect(uniqueZipEntryName("README", used)).toBe("README (2)");
  });

  it("adds every name it returns to `used`, so a THIRD identical name does not collide with the second's own rename", () => {
    const used = new Set<string>();
    const first = uniqueZipEntryName("Notes.txt", used);
    const second = uniqueZipEntryName("Notes.txt", used);
    const third = uniqueZipEntryName("Notes.txt", used);
    expect(new Set([first, second, third]).size).toBe(3);
    expect([first, second, third]).toEqual(["Notes.txt", "Notes (2).txt", "Notes (3).txt"]);
  });
});

describe("planCourseDownload", () => {
  it("returns kind 'none' when nothing was handed off", () => {
    expect(planCourseDownload([], "Course.zip")).toEqual({ kind: "none" });
  });

  it("returns kind 'single' with the SAME blob and file name, unchanged, for exactly one pending file (AC4: do not regress single-step use)", () => {
    const blob = new Blob(["x"]);
    const plan = planCourseDownload([{ blob, fileName: "Assignment.docx" }], "Course.zip");
    expect(plan).toEqual({ kind: "single", blob, fileName: "Assignment.docx" });
  });

  it("returns kind 'zip' with one entry per file and the caller-supplied combined name, for two or more pending files", () => {
    const blobA = new Blob(["a"]);
    const blobB = new Blob(["b"]);
    const plan = planCourseDownload(
      [
        { blob: blobA, fileName: "Blackboard Export.imscc" },
        { blob: blobB, fileName: "Course Materials.zip" },
      ],
      "Python - Course Build.zip"
    );
    expect(plan).toEqual({
      kind: "zip",
      entries: [
        { name: "Blackboard Export.imscc", blob: blobA },
        { name: "Course Materials.zip", blob: blobB },
      ],
      fileName: "Python - Course Build.zip",
    });
  });

  it("de-duplicates same-named entries within the zip plan via uniqueZipEntryName", () => {
    const blobA = new Blob(["a"]);
    const blobB = new Blob(["b"]);
    const blobC = new Blob(["c"]);
    const plan = planCourseDownload(
      [
        { blob: blobA, fileName: "Assignment.docx" },
        { blob: blobB, fileName: "Assignment.docx" },
        { blob: blobC, fileName: "Assignment.docx" },
      ],
      "Course.zip"
    );
    expect(plan.kind).toBe("zip");
    if (plan.kind === "zip") {
      expect(plan.entries.map((e) => e.name)).toEqual([
        "Assignment.docx",
        "Assignment (2).docx",
        "Assignment (3).docx",
      ]);
      // Each entry still carries its OWN distinct blob - the rename never
      // drops or overwrites content.
      expect(plan.entries.map((e) => e.blob)).toEqual([blobA, blobB, blobC]);
    }
  });
});
