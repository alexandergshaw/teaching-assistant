// Split out of workflow-runs.test.ts (which had grown past this repo's
// 1000-line-per-file cap). Covers listRunSteps / listRecentRuns / getRun (the
// list/get reads) and mapWorkflowRun / mapWorkflowRunStep (their defensive-
// degrade row mapping) - grouped together because both makeStepRow and
// makeRunRow feed both groups. recordWorkflowRun / startWorkflowRun /
// finishWorkflowRun / recordRunStep stay in workflow-runs.test.ts; the four
// "since/latest" reads moved to workflow-runs.reads.test.ts. The shared
// fake-Supabase infra lives in workflow-runs.fixtures.ts.

import { describe, it, expect } from "vitest";
import {
  listRunSteps,
  listRecentRuns,
  getRun,
  mapWorkflowRun,
  mapWorkflowRunStep,
} from "./workflow-runs";
import { makeSupabase, eqCalls } from "./workflow-runs.fixtures";

// ---------------------------------------------------------------------------
// listRunSteps / listRecentRuns / getRun
// ---------------------------------------------------------------------------

function makeStepRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "step-1",
    run_id: "run-1",
    user_id: "u1",
    step_index: 0,
    step_type: "pull-current-materials",
    status: "done",
    error: null,
    summary: null,
    progress: [],
    started_at: "2026-07-27T10:00:00.000Z",
    finished_at: "2026-07-27T10:00:01.000Z",
    duration_ms: 1000,
    institution: null,
    course_id: null,
    created_at: "2026-07-27T10:00:01.000Z",
    ...overrides,
  };
}

function makeRunRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "run-1",
    user_id: "u1",
    workflow_id: "wf-1",
    workflow_name: "Weekly Announcement",
    status: "ok",
    trigger_source: "schedule",
    trigger_ref: "sched-9",
    created_at: "2026-07-27T10:00:00.000Z",
    started_at: "2026-07-27T10:00:00.000Z",
    finished_at: "2026-07-27T10:00:05.000Z",
    duration_ms: 5000,
    step_count: 1,
    error_count: 0,
    detail: null,
    ...overrides,
  };
}

describe("listRunSteps", () => {
  it("orders by step_index ascending", async () => {
    const { client, calls } = makeSupabase([{ data: [makeStepRow()], error: null }]);
    await listRunSteps(client, "u1", "run-1");
    const orderCall = calls.find((c) => c.method === "order");
    expect(orderCall!.args[0]).toBe("step_index");
    expect(orderCall!.args[1]).toMatchObject({ ascending: true });
  });

  it("scopes the query to the given user_id and run_id", async () => {
    const { client, calls } = makeSupabase([{ data: [], error: null }]);
    await listRunSteps(client, "u1", "run-1");
    const eqArgs = eqCalls(calls);
    expect(eqArgs).toContainEqual(["user_id", "u1"]);
    expect(eqArgs).toContainEqual(["run_id", "run-1"]);
  });

  it("maps every returned row through mapWorkflowRunStep", async () => {
    const { client } = makeSupabase([{ data: [makeStepRow({ id: "a" }), makeStepRow({ id: "b" })], error: null }]);
    const steps = await listRunSteps(client, "u1", "run-1");
    expect(steps.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("listRecentRuns", () => {
  it("orders newest first with a default limit of 50", async () => {
    const { client, calls } = makeSupabase([{ data: [], error: null }]);
    await listRecentRuns(client, "u1");
    const orderCall = calls.find((c) => c.method === "order");
    expect(orderCall!.args[0]).toBe("created_at");
    expect(orderCall!.args[1]).toMatchObject({ ascending: false });
    const limitCall = calls.find((c) => c.method === "limit");
    expect(limitCall!.args[0]).toBe(50);
  });

  it("scopes the query to the given user_id", async () => {
    const { client, calls } = makeSupabase([{ data: [], error: null }]);
    await listRecentRuns(client, "u1");
    expect(eqCalls(calls)).toContainEqual(["user_id", "u1"]);
  });

  it("honors an explicit limit and workflowId filter", async () => {
    const { client, calls } = makeSupabase([{ data: [], error: null }]);
    await listRecentRuns(client, "u1", { workflowId: "wf-1", limit: 5 });
    const limitCall = calls.find((c) => c.method === "limit");
    expect(limitCall!.args[0]).toBe(5);
    expect(eqCalls(calls)).toContainEqual(["workflow_id", "wf-1"]);
  });

  it("filters by triggerRef when given", async () => {
    const { client, calls } = makeSupabase([{ data: [], error: null }]);
    await listRecentRuns(client, "u1", { triggerRef: "sched-9" });
    expect(eqCalls(calls)).toContainEqual(["trigger_ref", "sched-9"]);
  });

  it("omits the trigger_ref filter entirely when triggerRef is not given (no behaviour change)", async () => {
    const { client, calls } = makeSupabase([{ data: [], error: null }]);
    await listRecentRuns(client, "u1");
    expect(eqCalls(calls).some((a) => a[0] === "trigger_ref")).toBe(false);
  });

  it("combines workflowId and triggerRef filters when both are given", async () => {
    const { client, calls } = makeSupabase([{ data: [], error: null }]);
    await listRecentRuns(client, "u1", { workflowId: "wf-1", triggerRef: "sched-9", limit: 5 });
    const eq = eqCalls(calls);
    expect(eq).toContainEqual(["workflow_id", "wf-1"]);
    expect(eq).toContainEqual(["trigger_ref", "sched-9"]);
  });

  it("maps every returned row through mapWorkflowRun", async () => {
    const { client } = makeSupabase([{ data: [makeRunRow({ id: "r1" }), makeRunRow({ id: "r2" })], error: null }]);
    const runs = await listRecentRuns(client, "u1");
    expect(runs.map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});

describe("getRun", () => {
  it("scopes the query to the given user_id and run id", async () => {
    const { client, calls } = makeSupabase([{ data: makeRunRow(), error: null }]);
    await getRun(client, "u1", "run-1");
    const eqArgs = eqCalls(calls);
    expect(eqArgs).toContainEqual(["user_id", "u1"]);
    expect(eqArgs).toContainEqual(["id", "run-1"]);
  });

  it("returns null when no row is found", async () => {
    const { client } = makeSupabase([{ data: null, error: null }]);
    const run = await getRun(client, "u1", "missing");
    expect(run).toBeNull();
  });

  it("maps a found row through mapWorkflowRun", async () => {
    const { client } = makeSupabase([{ data: makeRunRow({ id: "run-1" }), error: null }]);
    const run = await getRun(client, "u1", "run-1");
    expect(run?.id).toBe("run-1");
    expect(run?.status).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// mapWorkflowRun / mapWorkflowRunStep - defensive degrade behavior.
// ---------------------------------------------------------------------------

describe("mapWorkflowRun", () => {
  it("maps a well-formed row", () => {
    const run = mapWorkflowRun(makeRunRow());
    expect(run).toEqual({
      id: "run-1",
      userId: "u1",
      workflowId: "wf-1",
      workflowName: "Weekly Announcement",
      status: "ok",
      triggerSource: "schedule",
      triggerRef: "sched-9",
      createdAt: "2026-07-27T10:00:00.000Z",
      startedAt: "2026-07-27T10:00:00.000Z",
      finishedAt: "2026-07-27T10:00:05.000Z",
      durationMs: 5000,
      stepCount: 1,
      errorCount: 0,
      detail: null,
      fieldValues: null,
    });
  });

  it("falls back an unrecognized status to error rather than throwing", () => {
    expect(() => mapWorkflowRun(makeRunRow({ status: "not-a-real-status" }))).not.toThrow();
    expect(mapWorkflowRun(makeRunRow({ status: "not-a-real-status" })).status).toBe("error");
  });

  it("passes through each recognized status", () => {
    for (const status of ["ok", "error", "skipped", "running"]) {
      expect(mapWorkflowRun(makeRunRow({ status })).status).toBe(status);
    }
  });

  it("degrades a missing/malformed row to safe defaults without throwing", () => {
    expect(() => mapWorkflowRun(null)).not.toThrow();
    expect(() => mapWorkflowRun("not an object")).not.toThrow();
    expect(() => mapWorkflowRun(undefined)).not.toThrow();
    const run = mapWorkflowRun({});
    expect(run.status).toBe("error");
    expect(run.startedAt).toBeNull();
    expect(run.finishedAt).toBeNull();
    expect(run.fieldValues).toBeNull();
  });

  it("maps a well-formed field_values object through to fieldValues", () => {
    const run = mapWorkflowRun(makeRunRow({ field_values: { institution: "MIT", repo: "(empty)" } }));
    expect(run.fieldValues).toEqual({ institution: "MIT", repo: "(empty)" });
  });

  it("falls back fieldValues to null for a row written before the column existed", () => {
    const run = mapWorkflowRun(makeRunRow());
    expect(run.fieldValues).toBeNull();
  });

  it("degrades a malformed field_values value (string, number, array, null) to null", () => {
    for (const bad of ["not an object", 42, ["an", "array"], null]) {
      expect(() => mapWorkflowRun(makeRunRow({ field_values: bad }))).not.toThrow();
      expect(mapWorkflowRun(makeRunRow({ field_values: bad })).fieldValues).toBeNull();
    }
  });

  it("drops non-string entries within an otherwise-valid field_values object", () => {
    const run = mapWorkflowRun(makeRunRow({ field_values: { ok: "yes", bad: 5, alsoOk: "sure" } }));
    expect(run.fieldValues).toEqual({ ok: "yes", alsoOk: "sure" });
  });

  it("degrades a field_values object that has ONLY non-string entries to null, not {}", () => {
    const run = mapWorkflowRun(makeRunRow({ field_values: { bad: 5 } }));
    expect(run.fieldValues).toBeNull();
  });
});

describe("mapWorkflowRunStep", () => {
  it("maps a well-formed row", () => {
    const step = mapWorkflowRunStep(makeStepRow({ progress: ["a", "b"] }));
    expect(step).toEqual({
      id: "step-1",
      runId: "run-1",
      userId: "u1",
      stepIndex: 0,
      stepType: "pull-current-materials",
      status: "done",
      error: null,
      summary: null,
      progress: ["a", "b"],
      startedAt: "2026-07-27T10:00:00.000Z",
      finishedAt: "2026-07-27T10:00:01.000Z",
      durationMs: 1000,
      institution: null,
      courseId: null,
      courseName: null,
      inputs: null,
      createdAt: "2026-07-27T10:00:01.000Z",
    });
  });

  it("maps course_name through to courseName", () => {
    const step = mapWorkflowRunStep(makeStepRow({ course_id: "c1", course_name: "Prescriptive AI" }));
    expect(step.courseId).toBe("c1");
    expect(step.courseName).toBe("Prescriptive AI");
  });

  it("falls back courseName to null for a row written before the column existed", () => {
    const step = mapWorkflowRunStep(makeStepRow({ course_id: "c1" }));
    expect(step.courseName).toBeNull();
  });

  it("maps a well-formed inputs object through to inputs", () => {
    const step = mapWorkflowRunStep(makeStepRow({ inputs: { repo: "org/repo", branch: "(empty)" } }));
    expect(step.inputs).toEqual({ repo: "org/repo", branch: "(empty)" });
  });

  it("falls back inputs to null for a row written before the column existed", () => {
    const step = mapWorkflowRunStep(makeStepRow());
    expect(step.inputs).toBeNull();
  });

  it("degrades a malformed inputs value (string, number, array, null) to null", () => {
    for (const bad of ["not an object", 42, ["an", "array"], null]) {
      expect(() => mapWorkflowRunStep(makeStepRow({ inputs: bad }))).not.toThrow();
      expect(mapWorkflowRunStep(makeStepRow({ inputs: bad })).inputs).toBeNull();
    }
  });

  it("drops non-string entries within an otherwise-valid inputs object", () => {
    const step = mapWorkflowRunStep(makeStepRow({ inputs: { ok: "yes", bad: 5, alsoOk: "sure" } }));
    expect(step.inputs).toEqual({ ok: "yes", alsoOk: "sure" });
  });

  it("degrades a malformed progress value (string, number, object, null) to []", () => {
    for (const badProgress of ["not an array", 42, { not: "an array" }, null]) {
      expect(() => mapWorkflowRunStep(makeStepRow({ progress: badProgress }))).not.toThrow();
      expect(mapWorkflowRunStep(makeStepRow({ progress: badProgress })).progress).toEqual([]);
    }
  });

  it("drops non-string entries within an otherwise-valid progress array", () => {
    const step = mapWorkflowRunStep(makeStepRow({ progress: ["ok", 5, null, "also ok", {}] }));
    expect(step.progress).toEqual(["ok", "also ok"]);
  });

  it("falls back an unrecognized status to error rather than throwing", () => {
    expect(() => mapWorkflowRunStep(makeStepRow({ status: "not-a-real-status" }))).not.toThrow();
    expect(mapWorkflowRunStep(makeStepRow({ status: "not-a-real-status" })).status).toBe("error");
  });

  it("passes through each recognized status", () => {
    for (const status of ["done", "error", "disabled", "needs-interaction", "skipped", "running"]) {
      expect(mapWorkflowRunStep(makeStepRow({ status })).status).toBe(status);
    }
  });
});
