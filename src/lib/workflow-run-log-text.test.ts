import { describe, it, expect } from "vitest";
import { buildRunLogText } from "./workflow-run-log-text";
import type { WorkflowRunRecord, WorkflowRunStep } from "./workflow-runs";

function makeRun(overrides: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return {
    id: "run-1",
    userId: "u1",
    workflowId: "wf-42",
    workflowName: "Weekly Announcement",
    status: "ok",
    triggerSource: "schedule",
    triggerRef: "sched-9",
    createdAt: "2026-07-27T10:00:00.000Z",
    startedAt: "2026-07-27T10:00:00.000Z",
    finishedAt: "2026-07-27T10:00:05.000Z",
    durationMs: 5000,
    stepCount: 2,
    errorCount: 0,
    detail: null,
    ...overrides,
  };
}

function makeStep(overrides: Partial<WorkflowRunStep> = {}): WorkflowRunStep {
  return {
    id: "step-1",
    runId: "run-1",
    userId: "u1",
    stepIndex: 0,
    stepType: "pull-current-materials",
    status: "done",
    error: null,
    summary: null,
    progress: [],
    startedAt: "2026-07-27T10:00:00.000Z",
    finishedAt: "2026-07-27T10:00:01.000Z",
    durationMs: 1000,
    institution: null,
    courseId: null,
    createdAt: "2026-07-27T10:00:01.000Z",
    ...overrides,
  };
}

describe("buildRunLogText", () => {
  it("includes every header field named in the spec", () => {
    const text = buildRunLogText(makeRun(), []);
    expect(text).toContain("Weekly Announcement");
    expect(text).toContain("wf-42");
    expect(text).toContain("run-1");
    expect(text).toContain("schedule");
    expect(text).toContain("sched-9");
    expect(text).toContain("Status: ok");
    expect(text).toContain("2026-07-27T10:00:00.000Z");
    expect(text).toContain("2026-07-27T10:00:05.000Z");
    expect(text).toContain("5000ms");
    expect(text).toContain("Step count: 2");
    expect(text).toContain("Error count: 0");
  });

  it("renders steps in the order given (index order)", () => {
    const steps = [
      makeStep({ id: "s0", stepIndex: 0, stepType: "first" }),
      makeStep({ id: "s1", stepIndex: 1, stepType: "second" }),
      makeStep({ id: "s2", stepIndex: 2, stepType: "third" }),
    ];
    const text = buildRunLogText(makeRun(), steps);
    const firstIdx = text.indexOf("[0] first");
    const secondIdx = text.indexOf("[1] second");
    const thirdIdx = text.indexOf("[2] third");
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(thirdIdx).toBeGreaterThan(secondIdx);
  });

  it("renders multiple progress messages in order", () => {
    const step = makeStep({ progress: ["fetched roster", "matched 12 students", "wrote grades"] });
    const text = buildRunLogText(makeRun(), [step]);
    const i1 = text.indexOf("fetched roster");
    const i2 = text.indexOf("matched 12 students");
    const i3 = text.indexOf("wrote grades");
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
  });

  it("renders a full, untruncated error", () => {
    const longError = "boom: " + "x".repeat(2000);
    const step = makeStep({ status: "error", error: longError });
    const text = buildRunLogText(makeRun({ status: "error" }), [step]);
    expect(text).toContain(longError);
  });

  it("renders the step summary when present", () => {
    const step = makeStep({ summary: "Posted 3 announcements" });
    const text = buildRunLogText(makeRun(), [step]);
    expect(text).toContain("Posted 3 announcements");
  });

  it("clearly marks a run with no finished_at as unfinished", () => {
    const text = buildRunLogText(makeRun({ finishedAt: null }), []);
    expect(text.toLowerCase()).toContain("no finish record");
  });

  it("does not mark a finished run as unfinished", () => {
    const text = buildRunLogText(makeRun({ finishedAt: "2026-07-27T10:00:05.000Z" }), []);
    expect(text.toLowerCase()).not.toContain("no finish record");
  });

  it("renders the run detail when present", () => {
    const text = buildRunLogText(makeRun({ status: "error", detail: "Step 2 failed: timeout" }), []);
    expect(text).toContain("Step 2 failed: timeout");
  });

  it("notes when no steps were recorded", () => {
    const text = buildRunLogText(makeRun(), []);
    expect(text).toContain("(no steps recorded)");
  });

  it("is deterministic: same inputs produce the exact same output", () => {
    const run = makeRun();
    const steps = [makeStep()];
    expect(buildRunLogText(run, steps)).toBe(buildRunLogText(run, steps));
  });

  it("produces plain text with no markdown markers", () => {
    const text = buildRunLogText(makeRun(), [makeStep({ summary: "done" })]);
    expect(text).not.toMatch(/^#+\s/m);
    expect(text).not.toMatch(/\*\*/);
  });
});
