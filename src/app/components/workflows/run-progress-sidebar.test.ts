import { describe, it, expect } from "vitest";
import {
  countSettledSteps,
  findRunningStep,
  describeRunProgressAnnouncement,
} from "./run-progress-sidebar";
import type { RunStateGroup } from "./attended-fanout";

function group(
  overrides: Partial<RunStateGroup> & { steps: RunStateGroup["steps"] }
): RunStateGroup {
  return { institution: null, ...overrides };
}

function steps(...statuses: RunStateGroup["steps"][number]["status"][]): RunStateGroup["steps"] {
  return statuses.map((status) => ({ status, progress: null, summary: null, error: null }));
}

describe("countSettledSteps", () => {
  it("returns zero/zero for no groups", () => {
    expect(countSettledSteps([])).toEqual({ settled: 0, total: 0 });
  });

  it("counts done/error/skipped/disabled as settled, pending/running as not", () => {
    const groups: RunStateGroup[] = [
      group({ steps: steps("done", "error", "skipped", "disabled", "pending", "running") }),
    ];
    expect(countSettledSteps(groups)).toEqual({ settled: 4, total: 6 });
  });

  it("sums across every group of a fan-out run", () => {
    const groups: RunStateGroup[] = [
      group({ courseId: "c1", courseName: "A", steps: steps("done", "done") }),
      group({ courseId: "c2", courseName: "B", steps: steps("done", "pending") }),
    ];
    expect(countSettledSteps(groups)).toEqual({ settled: 3, total: 4 });
  });
});

describe("findRunningStep", () => {
  it("returns null when nothing is running", () => {
    const groups: RunStateGroup[] = [group({ steps: steps("done", "pending") })];
    expect(findRunningStep(groups)).toBeNull();
  });

  it("returns null for an empty group list", () => {
    expect(findRunningStep([])).toBeNull();
  });

  it("finds a running step in the first group", () => {
    const groups: RunStateGroup[] = [
      group({ steps: steps("done", "running", "pending") }),
      group({ steps: steps("pending") }),
    ];
    expect(findRunningStep(groups)).toEqual({ groupIndex: 0, stepIndex: 1 });
  });

  it("finds a running step in a later group, in group order", () => {
    const groups: RunStateGroup[] = [
      group({ steps: steps("done", "skipped") }),
      group({ steps: steps("done", "running") }),
    ];
    expect(findRunningStep(groups)).toEqual({ groupIndex: 1, stepIndex: 1 });
  });
});

describe("describeRunProgressAnnouncement", () => {
  const stepNames = ["Fetch roster", "Generate slides", "Post to LMS"];

  it("returns null when nothing is running and nothing is waiting", () => {
    const groups: RunStateGroup[] = [group({ steps: steps("done", "done", "pending") })];
    expect(describeRunProgressAnnouncement(groups, stepNames, null)).toBeNull();
  });

  it("describes the running step for a plain (non-fanout) single-group run", () => {
    const groups: RunStateGroup[] = [group({ steps: steps("done", "running", "pending") })];
    expect(describeRunProgressAnnouncement(groups, stepNames, null)).toBe(
      "Step 2 of 3: Generate slides, running"
    );
  });

  it("prefixes the course/institution label for a fan-out run", () => {
    const groups: RunStateGroup[] = [
      group({
        institution: "Riverside U",
        courseId: "c1",
        courseName: "CS 101",
        steps: steps("running", "pending", "pending"),
      }),
    ];
    expect(describeRunProgressAnnouncement(groups, stepNames, null)).toBe(
      "Riverside U: CS 101 - Step 1 of 3: Fetch roster, running"
    );
  });

  it("uses just the institution label for an institution-only fan-out group", () => {
    const groups: RunStateGroup[] = [
      group({ institution: "Riverside U", steps: steps("pending", "running", "pending") }),
    ];
    expect(describeRunProgressAnnouncement(groups, stepNames, null)).toBe(
      "Riverside U - Step 2 of 3: Generate slides, running"
    );
  });

  it("prioritizes a waitingFor location over a running step, and says it needs input", () => {
    const groups: RunStateGroup[] = [
      group({ steps: steps("done", "running", "pending") }),
    ];
    expect(
      describeRunProgressAnnouncement(groups, stepNames, { groupIndex: 0, stepIndex: 2 })
    ).toBe("Step 3 of 3: Post to LMS, needs your input");
  });

  it("returns null when waitingFor points at a group that does not exist", () => {
    const groups: RunStateGroup[] = [group({ steps: steps("done") })];
    expect(
      describeRunProgressAnnouncement(groups, stepNames, { groupIndex: 5, stepIndex: 0 })
    ).toBeNull();
  });

  it("falls back to a generic step label when stepNames is missing an entry", () => {
    const groups: RunStateGroup[] = [group({ steps: steps("running") })];
    expect(describeRunProgressAnnouncement(groups, [], null)).toBe(
      "Step 1 of 1: Step 1, running"
    );
  });
});
