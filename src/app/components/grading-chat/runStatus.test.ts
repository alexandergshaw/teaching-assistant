import { describe, it, expect } from "vitest";
import { describeRunStatus, describeNamesNow, type RunStatusInput } from "./runStatus";

function input(over: Partial<RunStatusInput>): RunStatusInput {
  return {
    preparing: false,
    zipPhase: null,
    headerState: "ready",
    intakeNote: null,
    classifyingRecording: false,
    pendingCount: 0,
    inFlightStudents: [],
    inFlightCount: 0,
    completedCount: 0,
    ...over,
  };
}

describe("describeRunStatus", () => {
  it("is null when idle", () => {
    expect(describeRunStatus(input({}))).toBeNull();
  });

  it("names the zip phase", () => {
    expect(describeRunStatus(input({ zipPhase: "uploading", preparing: true }))?.title).toBe("Uploading zip...");
    expect(describeRunStatus(input({ zipPhase: "preparing", preparing: true }))?.title).toBe("Preparing students...");
  });

  it("describes session setup and submission reading", () => {
    expect(describeRunStatus(input({ preparing: true, headerState: "resolving" }))?.title).toBe("Setting up the session...");
    expect(describeRunStatus(input({ preparing: true }))?.title).toBe("Reading your submission...");
    expect(describeRunStatus(input({ preparing: true, intakeNote: "Fetching Canvas details..." }))?.title).toBe(
      "Fetching Canvas details..."
    );
  });

  it("lists the in-flight students with honest live counts", () => {
    const status = describeRunStatus(
      input({ pendingCount: 5, inFlightCount: 2, inFlightStudents: ["Ada Lovelace", "Grace Hopper"], completedCount: 12 })
    );
    expect(status?.title).toBe("Grading now: Ada Lovelace, Grace Hopper");
    expect(status?.detail).toBe("12 finished so far, 3 waiting");
  });

  it("falls back to a count when no labels are available and truncates long lists", () => {
    expect(describeNamesNow([], 3)).toBe("Grading 3 submissions now");
    expect(describeNamesNow(["a", "b", "c", "d", "e"], 5)).toBe("Grading now: a, b, c and 2 more");
  });

  it("shows a regrade of an already-finished row (pending with nothing outstanding from the totals)", () => {
    const status = describeRunStatus(input({ pendingCount: 1, inFlightCount: 1, inFlightStudents: ["Ada"], completedCount: 4 }));
    expect(status?.title).toBe("Grading now: Ada");
  });

  it("shows the analyzing state with its explanatory detail when nothing else is pending", () => {
    const status = describeRunStatus(input({ classifyingRecording: true, preparing: true }));
    expect(status?.title).toBe("Analyzing the recording...");
    expect(status?.detail).toBe("Checking whether it holds one submission or several");
  });

  it("does not let pending rows mask the analyzing state", () => {
    const status = describeRunStatus(
      input({ classifyingRecording: true, pendingCount: 3, inFlightCount: 2, inFlightStudents: ["Ada", "Grace"], completedCount: 4 })
    );
    expect(status?.title).toBe("Analyzing the recording...");
    expect(status?.detail).toBe("4 finished so far, 3 still grading");
  });

  it("is driven by the flag alone, not by preparing", () => {
    const status = describeRunStatus(input({ classifyingRecording: true, preparing: false, headerState: "ready", pendingCount: 0 }));
    expect(status).not.toBeNull();
    expect(status?.title).toBe("Analyzing the recording...");
  });

  it("leaves every other state unchanged when not classifying", () => {
    expect(describeRunStatus(input({ classifyingRecording: false }))).toBeNull();
    expect(describeRunStatus(input({ pendingCount: 1, inFlightCount: 1, inFlightStudents: ["Ada"] }))?.title).toBe("Grading now: Ada");
  });
});
