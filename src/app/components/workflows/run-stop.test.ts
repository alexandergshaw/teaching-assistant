import { describe, it, expect } from "vitest";
import { buildAbortRunConfirmMessage, describeStoppedRunDetail, stoppedRunStatus } from "./run-stop";

describe("buildAbortRunConfirmMessage", () => {
  it("states that finished work is not undone", () => {
    expect(buildAbortRunConfirmMessage()).toMatch(/NOT undone/);
  });

  it("states that remaining steps are skipped, not started", () => {
    expect(buildAbortRunConfirmMessage()).toMatch(/skipped, not started/);
  });

  it("states that the run's own record will show it was stopped", () => {
    expect(buildAbortRunConfirmMessage()).toMatch(/record will show it was stopped, not completed/);
  });
});

describe("describeStoppedRunDetail", () => {
  it("reports how many of the planned steps actually ran", () => {
    expect(describeStoppedRunDetail(3, 7)).toBe("Stopped by user after 3 of 7 steps");
  });

  it("singularizes a one-step run", () => {
    expect(describeStoppedRunDetail(1, 1)).toBe("Stopped by user after 1 of 1 step");
  });

  it("handles stopping before any step ran", () => {
    expect(describeStoppedRunDetail(0, 5)).toBe("Stopped by user after 0 of 5 steps");
  });

  it("clamps a completed count that would otherwise exceed the total", () => {
    // Defensive: completedSteps should never exceed totalSteps in practice,
    // but the record must never read e.g. "9 of 7 steps" if it somehow did.
    expect(describeStoppedRunDetail(9, 7)).toBe("Stopped by user after 7 of 7 steps");
  });

  it("never reports a negative completed count", () => {
    expect(describeStoppedRunDetail(-2, 5)).toBe("Stopped by user after 0 of 5 steps");
  });
});

describe("stoppedRunStatus", () => {
  it("is never 'ok' - a stopped run must not read as a clean success", () => {
    expect(stoppedRunStatus()).not.toBe("ok");
  });

  it("is 'error' - the closest status finishWorkflowRun actually accepts", () => {
    expect(stoppedRunStatus()).toBe("error");
  });
});
