import { describe, it, expect } from "vitest";
import {
  decideDeadlinePassed,
  decideCourseStart,
  decideWorkflowCompleted,
} from "@/lib/workflow-triggers";
import type { Json } from "./supabase/types";

describe("decideDeadlinePassed", () => {
  it("first eval sets the baseline and does not fire", () => {
    const d = decideDeadlinePassed(null, [{ assignmentId: "a1", name: "Assignment 1", dueAt: "2026-07-10T00:00:00Z" }], "2026-07-14T00:00:00Z");
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ lastCheck: "2026-07-14T00:00:00Z" });
  });

  it("does not fire when no assignment is between lastCheck and now", () => {
    const base = decideDeadlinePassed(null, [], "2026-07-14T00:00:00Z");
    const d = decideDeadlinePassed(base.cursor, [{ assignmentId: "a1", name: "Assignment 1", dueAt: "2026-07-20T00:00:00Z" }], "2026-07-15T00:00:00Z");
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ lastCheck: "2026-07-15T00:00:00Z" });
  });

  it("fires when an assignment dueAt is between lastCheck and now", () => {
    const base = decideDeadlinePassed(null, [], "2026-07-14T00:00:00Z");
    const d = decideDeadlinePassed(base.cursor, [{ assignmentId: "a1", name: "Assignment 1", dueAt: "2026-07-14T12:00:00Z" }], "2026-07-15T00:00:00Z");
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ lastCheck: "2026-07-15T00:00:00Z" });
    expect(d.detail).toContain("Assignment 1");
  });

  it("fires when an assignment dueAt equals now exactly", () => {
    const base = decideDeadlinePassed(null, [], "2026-07-14T00:00:00Z");
    const d = decideDeadlinePassed(base.cursor, [{ assignmentId: "a1", name: "Assignment 1", dueAt: "2026-07-15T00:00:00Z" }], "2026-07-15T00:00:00Z");
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ lastCheck: "2026-07-15T00:00:00Z" });
  });

  it("does not fire for assignments with null dueAt", () => {
    const base = decideDeadlinePassed(null, [], "2026-07-14T00:00:00Z");
    const d = decideDeadlinePassed(base.cursor, [{ assignmentId: "a1", name: "Assignment 1", dueAt: null }], "2026-07-15T00:00:00Z");
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ lastCheck: "2026-07-15T00:00:00Z" });
  });

  it("does not fire for assignments with dueAt in the future", () => {
    const base = decideDeadlinePassed(null, [], "2026-07-14T00:00:00Z");
    const d = decideDeadlinePassed(base.cursor, [{ assignmentId: "a1", name: "Assignment 1", dueAt: "2026-07-20T00:00:00Z" }], "2026-07-15T00:00:00Z");
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ lastCheck: "2026-07-15T00:00:00Z" });
  });

  it("fires for multiple assignments in the interval", () => {
    const base = decideDeadlinePassed(null, [], "2026-07-14T00:00:00Z");
    const d = decideDeadlinePassed(base.cursor, [
      { assignmentId: "a1", name: "Assignment 1", dueAt: "2026-07-14T12:00:00Z" },
      { assignmentId: "a2", name: "Assignment 2", dueAt: "2026-07-14T18:00:00Z" },
    ], "2026-07-15T00:00:00Z");
    expect(d.fired).toBe(true);
    expect(d.detail).toContain("Assignment 1");
    expect(d.detail).toContain("Assignment 2");
  });
});

describe("decideCourseStart", () => {
  it("never fires once the cursor already recorded a fire", () => {
    const d = decideCourseStart({ fired: true } as unknown as Json, "2026-01-01T00:00:00Z", Date.parse("2026-07-14T00:00:00Z"));
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ fired: true });
  });

  it("does not fire when there is no start date", () => {
    const d = decideCourseStart(null, null, Date.parse("2026-07-14T00:00:00Z"));
    expect(d.fired).toBe(false);
  });

  it("does not fire when the start date is in the future", () => {
    const now = Date.parse("2026-07-14T00:00:00Z");
    const d = decideCourseStart(null, "2026-08-01T00:00:00Z", now);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ fired: false });
  });

  it("fires when the start date has been reached", () => {
    const now = Date.parse("2026-07-14T00:00:00Z");
    const d = decideCourseStart(null, "2026-07-01T00:00:00Z", now);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ fired: true });
  });

  it("fires exactly at the start date", () => {
    const now = Date.parse("2026-07-14T00:00:00Z");
    const d = decideCourseStart(null, "2026-07-14T00:00:00Z", now);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ fired: true });
  });

  it("does not fire for an invalid date string", () => {
    const d = decideCourseStart(null, "not-a-date", Date.parse("2026-07-14T00:00:00Z"));
    expect(d.fired).toBe(false);
  });
});

describe("decideWorkflowCompleted", () => {
  it("first eval with a baseline latest run sets the baseline and does not fire", () => {
    const d = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, false);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ lastAt: "2026-07-10T00:00:00.000Z" });
  });

  it("first eval with no prior runs does not fire", () => {
    const d = decideWorkflowCompleted(null, { baselineLatest: null, runsSince: [] }, false);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({});
  });

  it("non-null cursor with no new runs does not fire", () => {
    const base = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, false);
    const d = decideWorkflowCompleted(base.cursor, { baselineLatest: null, runsSince: [] }, false);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ lastAt: "2026-07-10T00:00:00.000Z" });
  });

  it("fires on a newer run in runsSince and advances the cursor to the max timestamp", () => {
    const base = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, false);
    const d = decideWorkflowCompleted(
      base.cursor,
      { baselineLatest: null, runsSince: [{ createdAt: "2026-07-11T00:00:00.000Z", status: "ok" }] },
      false
    );
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ lastAt: "2026-07-11T00:00:00.000Z" });
  });

  it("with requireSuccess, a success (T1) followed by a later error (T2) in the same interval still fires and the cursor advances to T2", () => {
    const base = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, true);
    const d = decideWorkflowCompleted(
      base.cursor,
      {
        baselineLatest: null,
        runsSince: [
          { createdAt: "2026-07-11T00:00:00.000Z", status: "ok" },
          { createdAt: "2026-07-12T00:00:00.000Z", status: "error" },
        ],
      },
      true
    );
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ lastAt: "2026-07-12T00:00:00.000Z" });
  });

  it("with requireSuccess, only an errored newer run does not fire but still advances the cursor", () => {
    const base = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, true);
    const d = decideWorkflowCompleted(
      base.cursor,
      { baselineLatest: null, runsSince: [{ createdAt: "2026-07-11T00:00:00.000Z", status: "error" }] },
      true
    );
    expect(d.fired).toBe(false);
    // The cursor must still advance to the newer run's timestamp, so this run
    // is not re-examined on the next poll.
    expect(d.cursor).toEqual({ lastAt: "2026-07-11T00:00:00.000Z" });
  });

  it("any-workflow: baseline first eval sets cursor without firing", () => {
    const d = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, false);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ lastAt: "2026-07-10T00:00:00.000Z" });
  });

  it("any-workflow: fires on a new foreign run", () => {
    const base = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, false);
    const d = decideWorkflowCompleted(
      base.cursor,
      { baselineLatest: null, runsSince: [{ createdAt: "2026-07-11T00:00:00.000Z", status: "ok" }] },
      false
    );
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ lastAt: "2026-07-11T00:00:00.000Z" });
  });

  it("any-workflow: does NOT fire on excluded own workflow, cursor unchanged", () => {
    const base = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, false);
    const d = decideWorkflowCompleted(
      base.cursor,
      { baselineLatest: null, runsSince: [] },
      false
    );
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual(base.cursor);
  });

  it("does not fire on a skipped run regardless of requireSuccess", () => {
    const base = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, false);
    const skippedRun = { createdAt: "2026-07-11T00:00:00.000Z", status: "skipped" };
    const d1 = decideWorkflowCompleted(base.cursor, { baselineLatest: null, runsSince: [skippedRun] }, false);
    expect(d1.fired).toBe(false);
    expect(d1.cursor).toEqual({ lastAt: "2026-07-11T00:00:00.000Z" });
    const d2 = decideWorkflowCompleted(base.cursor, { baselineLatest: null, runsSince: [skippedRun] }, true);
    expect(d2.fired).toBe(false);
    expect(d2.cursor).toEqual({ lastAt: "2026-07-11T00:00:00.000Z" });
  });

  it("fires on an ok run after skipping a skipped run in the same interval", () => {
    const base = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, false);
    const runs = [
      { createdAt: "2026-07-11T00:00:00.000Z", status: "skipped" },
      { createdAt: "2026-07-12T00:00:00.000Z", status: "ok" },
    ];
    const d = decideWorkflowCompleted(base.cursor, { baselineLatest: null, runsSince: runs }, false);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ lastAt: "2026-07-12T00:00:00.000Z" });
  });
});
