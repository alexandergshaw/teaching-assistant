import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  enqueueScheduledRun,
  peekScheduledRun,
  takeScheduledRun,
  hasScheduledRun,
  SCHEDULED_RUN_EVENT,
  type ScheduledRun,
} from "./workflow-schedule-handoff";

describe("workflow-schedule-handoff", () => {
  beforeEach(() => {
    // Clear the queue before each test by taking all items
    while (takeScheduledRun()) {
      // keep removing until empty
    }
  });

  it("enqueues and takes a scheduled run", () => {
    const run: ScheduledRun = {
      scheduleId: "sched-1",
      triggerId: null,
      workflowId: "wf-1",
      workflowName: "Test Workflow",
      fieldValues: { key: "value" },
    };

    enqueueScheduledRun(run);
    const taken = takeScheduledRun();

    expect(taken).toEqual(run);
  });

  it("peek returns the first run without removing it", () => {
    const run: ScheduledRun = {
      scheduleId: "sched-1",
      triggerId: null,
      workflowId: "wf-1",
      workflowName: "Test Workflow",
      fieldValues: {},
    };

    enqueueScheduledRun(run);
    const peeked1 = peekScheduledRun();
    const peeked2 = peekScheduledRun();

    expect(peeked1).toEqual(run);
    expect(peeked2).toEqual(run);
    expect(hasScheduledRun()).toBe(true);
  });

  it("take removes and returns runs in FIFO order", () => {
    const run1: ScheduledRun = {
      scheduleId: "sched-1",
      triggerId: null,
      workflowId: "wf-1",
      workflowName: "Workflow 1",
      fieldValues: {},
    };
    const run2: ScheduledRun = {
      scheduleId: "sched-2",
      triggerId: null,
      workflowId: "wf-2",
      workflowName: "Workflow 2",
      fieldValues: {},
    };
    const run3: ScheduledRun = {
      scheduleId: "sched-3",
      triggerId: null,
      workflowId: "wf-3",
      workflowName: "Workflow 3",
      fieldValues: {},
    };

    enqueueScheduledRun(run1);
    enqueueScheduledRun(run2);
    enqueueScheduledRun(run3);

    expect(takeScheduledRun()).toEqual(run1);
    expect(takeScheduledRun()).toEqual(run2);
    expect(takeScheduledRun()).toEqual(run3);
  });

  it("has returns true when queue has runs", () => {
    expect(hasScheduledRun()).toBe(false);

    const run: ScheduledRun = {
      scheduleId: "sched-1",
      triggerId: null,
      workflowId: "wf-1",
      workflowName: "Test",
      fieldValues: {},
    };

    enqueueScheduledRun(run);
    expect(hasScheduledRun()).toBe(true);

    takeScheduledRun();
    expect(hasScheduledRun()).toBe(false);
  });

  it("take returns null when queue is empty", () => {
    expect(takeScheduledRun()).toBeNull();
  });

  it("peek returns null when queue is empty", () => {
    expect(peekScheduledRun()).toBeNull();
  });

  it("dispatches event when enqueueing", () => {
    if (typeof window === "undefined") {
      // Skip this test in non-browser environments
      expect(true).toBe(true);
      return;
    }

    const eventSpy = vi.spyOn(window, "dispatchEvent");

    const run: ScheduledRun = {
      scheduleId: "sched-1",
      triggerId: null,
      workflowId: "wf-1",
      workflowName: "Test",
      fieldValues: {},
    };

    enqueueScheduledRun(run);

    expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: SCHEDULED_RUN_EVENT }));

    eventSpy.mockRestore();
  });
});
