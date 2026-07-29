import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ __fake: "supabase" })),
}));

vi.mock("@/lib/workflow-schedules", () => ({
  getWorkflowSchedule: vi.fn(),
}));

vi.mock("@/lib/workflow-triggers", () => ({
  getWorkflowTrigger: vi.fn(),
}));

vi.mock("@/lib/workflow-defs", () => ({
  listWorkflowDefs: vi.fn(),
}));

vi.mock("@/lib/workflows/presets", () => ({
  allWorkflows: vi.fn((custom: unknown[]) => custom),
}));

vi.mock("@/lib/workflows/headless", () => ({
  isHeadlessSafeWorkflow: vi.fn(),
}));

vi.mock("@/lib/workflows/server-runner", () => ({
  runWorkflowUnattended: vi.fn(),
  buildServerStepRunHelpers: vi.fn(() => ({ __fake: "helpers" })),
}));

vi.mock("@/lib/workflows/run-logging", () => ({
  safeStartWorkflowRun: vi.fn(),
}));

vi.mock("@/lib/workflow-runs", () => ({
  finishWorkflowRun: vi.fn(),
}));

vi.mock("@/lib/author", () => ({
  resolveDocumentAuthor: vi.fn(() => "Author Name"),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { getWorkflowSchedule } from "@/lib/workflow-schedules";
import { getWorkflowTrigger } from "@/lib/workflow-triggers";
import { listWorkflowDefs } from "@/lib/workflow-defs";
import { isHeadlessSafeWorkflow } from "@/lib/workflows/headless";
import { runWorkflowUnattended } from "@/lib/workflows/server-runner";
import { safeStartWorkflowRun } from "@/lib/workflows/run-logging";
import { finishWorkflowRun } from "@/lib/workflow-runs";
import type { WorkflowSchedule } from "@/lib/workflow-schedules";
import type { WorkflowTrigger } from "@/lib/workflow-triggers";
import type { WorkflowDef } from "@/lib/workflows/types";
import { POST } from "./route";
import type { NextRequest } from "next/server";

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function makeSchedule(overrides: Partial<WorkflowSchedule> = {}): WorkflowSchedule {
  return {
    id: "sched-1",
    userId: "u1",
    workflowId: "w1",
    workflowName: "Weekly Announcement",
    fieldValues: { course: "CS101" },
    nextRunAt: "2026-08-01T00:00:00.000Z",
    repeat: "weekly",
    enabled: true,
    courseId: "course-1",
    institution: "ACME",
    lastRunAt: null,
    intervalMinutes: null,
    unattended: true,
    provider: "gemini",
    disabledSteps: [1],
    fanoutProgress: null,
    lastRunStatus: null,
    lastRunDetail: null,
    recoveryAttempts: 0,
    daysOfWeek: [],
    ...overrides,
  };
}

function makeTrigger(overrides: Partial<WorkflowTrigger> = {}): WorkflowTrigger {
  return {
    id: "trig-1",
    userId: "u1",
    workflowId: "w1",
    workflowName: "Weekly Announcement",
    fieldValues: { course: "CS101" },
    eventType: "app-open",
    eventConfig: {},
    cursor: null,
    checkVersion: 0,
    enabled: true,
    unattended: true,
    provider: "gemini",
    disabledSteps: [],
    courseId: null,
    institution: null,
    webhookToken: null,
    lastCheckedAt: null,
    lastFiredAt: null,
    lastRunStatus: null,
    lastRunDetail: null,
    recoveryAttempts: 0,
    ...overrides,
  };
}

function makeDef(overrides: Partial<WorkflowDef> = {}): WorkflowDef {
  return { id: "w1", name: "Weekly Announcement", description: "", steps: [], scope: {}, ...overrides };
}

async function readJson(res: Response) {
  return res.json();
}

describe("POST /api/automations/run-now", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "u1", email: "owner@example.com" } as never);
    vi.mocked(listWorkflowDefs).mockResolvedValue([]);
    vi.mocked(isHeadlessSafeWorkflow).mockReturnValue(true);
    vi.mocked(safeStartWorkflowRun).mockResolvedValue(undefined);
    vi.mocked(finishWorkflowRun).mockResolvedValue(undefined);
    vi.mocked(runWorkflowUnattended).mockResolvedValue({ ok: true, steps: [] });
  });

  it("returns 400 when id is missing", async () => {
    const res = await POST(makeReq({ kind: "schedule" }));
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toMatch(/Missing/);
  });

  it("returns an error response rather than throwing when requireOwner rejects", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized"));
    const res = await POST(makeReq({ kind: "schedule", id: "sched-1" }));
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.error).toContain("Not authorized");
  });

  it("scopes the schedule lookup to the authenticated owner's id, never a client-supplied one", async () => {
    vi.mocked(getWorkflowSchedule).mockResolvedValue(null);
    await POST(makeReq({ kind: "schedule", id: "sched-1" }));
    expect(getWorkflowSchedule).toHaveBeenCalledWith(expect.anything(), "u1", "sched-1");
  });

  it("returns 404 when the schedule is not found (missing or not owned)", async () => {
    vi.mocked(getWorkflowSchedule).mockResolvedValue(null);
    const res = await POST(makeReq({ kind: "schedule", id: "sched-1" }));
    expect(res.status).toBe(404);
    expect(runWorkflowUnattended).not.toHaveBeenCalled();
  });

  it("looks up a trigger (not a schedule) when kind is 'trigger'", async () => {
    vi.mocked(getWorkflowTrigger).mockResolvedValue(makeTrigger());
    vi.mocked(listWorkflowDefs).mockResolvedValue([makeDef()]);
    await POST(makeReq({ kind: "trigger", id: "trig-1" }));
    expect(getWorkflowTrigger).toHaveBeenCalledWith(expect.anything(), "u1", "trig-1");
    expect(getWorkflowSchedule).not.toHaveBeenCalled();
  });

  it("returns 422 with a reason when the workflow no longer exists", async () => {
    vi.mocked(getWorkflowSchedule).mockResolvedValue(makeSchedule());
    vi.mocked(listWorkflowDefs).mockResolvedValue([]); // no defs at all
    const res = await POST(makeReq({ kind: "schedule", id: "sched-1" }));
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toMatch(/no longer exists/);
    expect(runWorkflowUnattended).not.toHaveBeenCalled();
  });

  it("returns 422 with a reason (never an opaque error) when the workflow is not headless-safe", async () => {
    vi.mocked(getWorkflowSchedule).mockResolvedValue(makeSchedule());
    vi.mocked(listWorkflowDefs).mockResolvedValue([makeDef()]);
    vi.mocked(isHeadlessSafeWorkflow).mockReturnValue(false);
    const res = await POST(makeReq({ kind: "schedule", id: "sched-1" }));
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toMatch(/cannot be run this way/);
    expect(runWorkflowUnattended).not.toHaveBeenCalled();
    expect(safeStartWorkflowRun).not.toHaveBeenCalled();
  });

  it("runs the schedule's OWN stored fieldValues/disabledSteps/institution - never a blank run", async () => {
    vi.mocked(getWorkflowSchedule).mockResolvedValue(
      makeSchedule({ fieldValues: { course: "CS101", section: "A" }, disabledSteps: [0, 2], institution: "ACME" })
    );
    vi.mocked(listWorkflowDefs).mockResolvedValue([makeDef()]);

    await POST(makeReq({ kind: "schedule", id: "sched-1" }));

    expect(runWorkflowUnattended).toHaveBeenCalledTimes(1);
    const call = vi.mocked(runWorkflowUnattended).mock.calls[0][0];
    expect(call.fieldValues).toEqual({ course: "CS101", section: "A" });
    expect(Array.from(call.disabledTopIndices as Set<number>).sort()).toEqual([0, 2]);
  });

  it("logs the run with triggerSource 'manual' and triggerRef set to the schedule id (AC3)", async () => {
    vi.mocked(getWorkflowSchedule).mockResolvedValue(makeSchedule({ id: "sched-42" }));
    vi.mocked(listWorkflowDefs).mockResolvedValue([makeDef()]);

    await POST(makeReq({ kind: "schedule", id: "sched-42" }));

    expect(safeStartWorkflowRun).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      expect.objectContaining({ triggerSource: "manual", triggerRef: "sched-42" })
    );
  });

  it("logs the run with triggerSource 'manual' and triggerRef set to the trigger id for a trigger kind", async () => {
    vi.mocked(getWorkflowTrigger).mockResolvedValue(makeTrigger({ id: "trig-42" }));
    vi.mocked(listWorkflowDefs).mockResolvedValue([makeDef()]);

    await POST(makeReq({ kind: "trigger", id: "trig-42" }));

    expect(safeStartWorkflowRun).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      expect.objectContaining({ triggerSource: "manual", triggerRef: "trig-42" })
    );
  });

  it("returns ok:true and status 'ok' on a successful run, and finishes the run row as ok", async () => {
    vi.mocked(getWorkflowSchedule).mockResolvedValue(makeSchedule());
    vi.mocked(listWorkflowDefs).mockResolvedValue([makeDef()]);
    vi.mocked(runWorkflowUnattended).mockResolvedValue({ ok: true, steps: [] });

    const res = await POST(makeReq({ kind: "schedule", id: "sched-1" }));
    const body = await readJson(res);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("ok");
    expect(finishWorkflowRun).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      expect.any(String),
      expect.objectContaining({ status: "ok" })
    );
  });

  it("never reports success for a run that errored, and finishes the run row as error", async () => {
    vi.mocked(getWorkflowSchedule).mockResolvedValue(makeSchedule());
    vi.mocked(listWorkflowDefs).mockResolvedValue([makeDef()]);
    vi.mocked(runWorkflowUnattended).mockResolvedValue({
      ok: false,
      steps: [{ index: 0, type: "draft-announcement", status: "error", error: "boom", summary: null }],
    });

    const res = await POST(makeReq({ kind: "schedule", id: "sched-1" }));
    const body = await readJson(res);
    expect(body.ok).toBe(false);
    expect(body.status).toBe("error");
    expect(body.message).toContain("boom");
    expect(finishWorkflowRun).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      expect.any(String),
      expect.objectContaining({ status: "error" })
    );
  });

  it("reports a truncated fan-out as skipped, not ok", async () => {
    vi.mocked(getWorkflowSchedule).mockResolvedValue(makeSchedule());
    vi.mocked(listWorkflowDefs).mockResolvedValue([makeDef()]);
    vi.mocked(runWorkflowUnattended).mockResolvedValue({
      ok: true,
      steps: [],
      fanout: { total: 3, ranThisTick: ["a"], remaining: ["b", "c"], truncated: true },
    });

    const res = await POST(makeReq({ kind: "schedule", id: "sched-1" }));
    const body = await readJson(res);
    expect(body.ok).toBe(false);
    expect(body.status).toBe("skipped");
  });
});
