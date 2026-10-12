import { describe, it, expect } from "vitest";
import { describeRunStatus, describeNamesNow, type RunStatusInput } from "./runStatus";

function input(over: Partial<RunStatusInput>): RunStatusInput {
  return {
    preparing: false,
    zipPhase: null,
    headerState: "ready",
    intakeNote: null,
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
});
