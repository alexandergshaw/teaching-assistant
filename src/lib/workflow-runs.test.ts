// Covers the four write-path functions: recordWorkflowRun, startWorkflowRun,
// finishWorkflowRun, and recordRunStep. This file had grown past this repo's
// 1000-line-per-file cap - the four "since/latest" read functions moved to
// workflow-runs.reads.test.ts, and listRunSteps / listRecentRuns / getRun /
// mapWorkflowRun / mapWorkflowRunStep moved to workflow-runs.mapping.test.ts.
// The shared fake-Supabase infra (used by all three files) lives in
// workflow-runs.fixtures.ts.

import { describe, it, expect, vi } from "vitest";
import {
  recordWorkflowRun,
  startWorkflowRun,
  finishWorkflowRun,
  recordRunStep,
} from "./workflow-runs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { makeSupabase, eqCalls, insertArg, upsertArg, updateArg } from "./workflow-runs.fixtures";

// ---------------------------------------------------------------------------
// recordWorkflowRun - existing behavior, must stay unchanged.
// ---------------------------------------------------------------------------

describe("recordWorkflowRun (existing behavior, unchanged)", () => {
  it("inserts scoped to the given user_id with the given fields", async () => {
    const { client, calls } = makeSupabase([{ data: null, error: null }]);
    await recordWorkflowRun(client, "u1", {
      workflowId: "wf-1",
      workflowName: "Grade sync",
      status: "ok",
      triggerSource: "manual",
    });
    expect(insertArg(calls)).toMatchObject({
      user_id: "u1",
      workflow_id: "wf-1",
      workflow_name: "Grade sync",
      status: "ok",
      trigger_source: "manual",
    });
  });

  it("includes the id in the insert when supplied", async () => {
    const { client, calls } = makeSupabase([{ data: null, error: null }]);
    await recordWorkflowRun(client, "u1", {
      workflowId: "wf-1",
      workflowName: "Grade sync",
      status: "ok",
      triggerSource: "manual",
      id: "run-abc",
    });
    expect(insertArg(calls)).toMatchObject({ id: "run-abc" });
  });

  it("omits the id key entirely when not supplied", async () => {
    const { client, calls } = makeSupabase([{ data: null, error: null }]);
    await recordWorkflowRun(client, "u1", {
      workflowId: "wf-1",
      workflowName: "Grade sync",
      status: "ok",
      triggerSource: "manual",
    });
    expect(insertArg(calls)).not.toHaveProperty("id");
  });

  it("throws when the insert reports an error", async () => {
    const { client } = makeSupabase([{ data: null, error: { message: "boom" } }]);
    await expect(
      recordWorkflowRun(client, "u1", {
        workflowId: "wf-1",
        workflowName: "Grade sync",
        status: "error",
        triggerSource: "webhook",
      })
    ).rejects.toThrow("boom");
  });
});

// ---------------------------------------------------------------------------
// startWorkflowRun
// ---------------------------------------------------------------------------

describe("startWorkflowRun", () => {
  it("upserts a running row with started_at set, scoped to the given user_id", async () => {
    const { client, calls } = makeSupabase([{ data: null, error: null }]);
    await startWorkflowRun(client, "u1", {
      id: "run-1",
      workflowId: "wf-1",
      workflowName: "Weekly Announcement",
      triggerSource: "schedule",
      triggerRef: "sched-9",
    });
    const payload = upsertArg(calls) as Record<string, unknown>;
    expect(payload).toMatchObject({
      id: "run-1",
      user_id: "u1",
      workflow_id: "wf-1",
      workflow_name: "Weekly Announcement",
      status: "running",
      trigger_source: "schedule",
      trigger_ref: "sched-9",
    });
    expect(typeof payload.started_at).toBe("string");
  });

  it("is idempotent for a repeated id: both calls upsert with onConflict id + ignoreDuplicates", async () => {
    const { client, calls } = makeSupabase([
      { data: null, error: null },
      { data: null, error: null },
    ]);
    const input = {
      id: "run-1",
      workflowId: "wf-1",
      workflowName: "Weekly Announcement",
      triggerSource: "schedule" as const,
    };
    await startWorkflowRun(client, "u1", input);
    await startWorkflowRun(client, "u1", input);

    const upsertCalls = calls.filter((c) => c.method === "upsert");
    expect(upsertCalls).toHaveLength(2);
    for (const call of upsertCalls) {
      expect(call.args[1]).toMatchObject({ onConflict: "id", ignoreDuplicates: true });
      expect((call.args[0] as Record<string, unknown>).id).toBe("run-1");
    }
  });

  it("throws when the upsert reports an error", async () => {
    const { client } = makeSupabase([{ data: null, error: { message: "boom" } }]);
    await expect(
      startWorkflowRun(client, "u1", {
        id: "run-1",
        workflowId: "wf-1",
        workflowName: "x",
        triggerSource: "manual",
      })
    ).rejects.toThrow("boom");
  });

  it("passes fieldValues through to the field_values column, defaulting to null when absent", async () => {
    const { client: withValues, calls: callsWithValues } = makeSupabase([{ data: null, error: null }]);
    await startWorkflowRun(withValues, "u1", {
      id: "run-1", workflowId: "wf-1", workflowName: "x", triggerSource: "manual",
      fieldValues: { institution: "MIT" },
    });
    expect(upsertArg(callsWithValues)).toMatchObject({ field_values: { institution: "MIT" } });

    const { client: withoutValues, calls: callsWithoutValues } = makeSupabase([{ data: null, error: null }]);
    await startWorkflowRun(withoutValues, "u1", { id: "run-1", workflowId: "wf-1", workflowName: "x", triggerSource: "manual" });
    expect(upsertArg(callsWithoutValues)).toMatchObject({ field_values: null });
  });
});

// ---------------------------------------------------------------------------
// finishWorkflowRun
// ---------------------------------------------------------------------------

describe("finishWorkflowRun", () => {
  it("sets finished_at and computes duration_ms from the row's started_at", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-27T10:00:10.000Z"));
      const { client, calls } = makeSupabase([
        { data: { started_at: "2026-07-27T10:00:00.000Z" }, error: null },
        { data: null, error: null },
      ]);
      await finishWorkflowRun(client, "u1", "run-1", { status: "ok", stepCount: 3, errorCount: 0 });

      const payload = updateArg(calls) as Record<string, unknown>;
      expect(payload.finished_at).toBe("2026-07-27T10:00:10.000Z");
      expect(payload.duration_ms).toBe(10000);
      expect(payload.status).toBe("ok");
      expect(payload.step_count).toBe(3);
      expect(payload.error_count).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("scopes both the read and the write to the given user_id and run id", async () => {
    const { client, calls } = makeSupabase([
      { data: { started_at: "2026-07-27T10:00:00.000Z" }, error: null },
      { data: null, error: null },
    ]);
    await finishWorkflowRun(client, "u1", "run-1", { status: "ok" });

    const eqArgs = eqCalls(calls);
    expect(eqArgs).toContainEqual(["user_id", "u1"]);
    expect(eqArgs).toContainEqual(["id", "run-1"]);
    expect(eqArgs.filter((a) => a[0] === "user_id").length).toBeGreaterThanOrEqual(2);
  });

  it("produces a null duration_ms when the row has no started_at", async () => {
    const { client, calls } = makeSupabase([
      { data: { started_at: null }, error: null },
      { data: null, error: null },
    ]);
    await finishWorkflowRun(client, "u1", "run-1", { status: "ok" });
    const payload = updateArg(calls) as Record<string, unknown>;
    expect(payload.duration_ms).toBeNull();
  });

  it("never throws when the select rejects", async () => {
    const { client } = makeSupabase([{ reject: new Error("select boom") }, { data: null, error: null }]);
    await expect(finishWorkflowRun(client, "u1", "run-1", { status: "error" })).resolves.toBeUndefined();
  });

  it("never throws when the update rejects", async () => {
    const { client } = makeSupabase([
      { data: { started_at: "2026-07-27T10:00:00.000Z" }, error: null },
      { reject: new Error("update boom") },
    ]);
    await expect(finishWorkflowRun(client, "u1", "run-1", { status: "error" })).resolves.toBeUndefined();
  });

  it("never throws when the update reports an error object", async () => {
    const { client } = makeSupabase([
      { data: { started_at: "2026-07-27T10:00:00.000Z" }, error: null },
      { data: null, error: { message: "update failed" } },
    ]);
    await expect(finishWorkflowRun(client, "u1", "run-1", { status: "error" })).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// recordRunStep
// ---------------------------------------------------------------------------

describe("recordRunStep", () => {
  it("inserts one step row scoped to the given user_id", async () => {
    const { client, calls } = makeSupabase([{ data: null, error: null }]);
    await recordRunStep(client, "u1", {
      runId: "run-1",
      stepIndex: 2,
      stepType: "post-announcement",
      status: "done",
      summary: "Posted to Canvas",
      progress: ["fetched module", "posted"],
      startedAt: "2026-07-27T10:00:00.000Z",
      finishedAt: "2026-07-27T10:00:01.500Z",
    });
    const payload = insertArg(calls) as Record<string, unknown>;
    expect(payload).toMatchObject({
      run_id: "run-1",
      user_id: "u1",
      step_index: 2,
      step_type: "post-announcement",
      status: "done",
      summary: "Posted to Canvas",
      progress: ["fetched module", "posted"],
      duration_ms: 1500,
    });
  });

  it("passes courseName through to the course_name column, defaulting to null when absent", async () => {
    const { client: withName, calls: callsWithName } = makeSupabase([{ data: null, error: null }]);
    await recordRunStep(withName, "u1", {
      runId: "run-1", stepIndex: 0, stepType: "grade-repo", status: "done", courseId: "c1", courseName: "Prescriptive AI",
    });
    expect(insertArg(callsWithName)).toMatchObject({ course_id: "c1", course_name: "Prescriptive AI" });

    const { client: withoutName, calls: callsWithoutName } = makeSupabase([{ data: null, error: null }]);
    await recordRunStep(withoutName, "u1", { runId: "run-1", stepIndex: 0, stepType: "x", status: "done" });
    expect(insertArg(callsWithoutName)).toMatchObject({ course_name: null });
  });

  it("passes inputs through to the inputs column, defaulting to null when absent", async () => {
    const { client: withInputs, calls: callsWithInputs } = makeSupabase([{ data: null, error: null }]);
    await recordRunStep(withInputs, "u1", {
      runId: "run-1", stepIndex: 0, stepType: "grade-repo", status: "done",
      inputs: { repo: "org/repo", org: "(empty)" },
    });
    expect(insertArg(callsWithInputs)).toMatchObject({ inputs: { repo: "org/repo", org: "(empty)" } });

    const { client: withoutInputs, calls: callsWithoutInputs } = makeSupabase([{ data: null, error: null }]);
    await recordRunStep(withoutInputs, "u1", { runId: "run-1", stepIndex: 0, stepType: "x", status: "done" });
    expect(insertArg(callsWithoutInputs)).toMatchObject({ inputs: null });
  });

  it("never throws when the insert rejects", async () => {
    const client = {
      from: () => ({
        insert: () => Promise.reject(new Error("insert boom")),
      }),
    } as unknown as SupabaseClient<Database>;
    await expect(
      recordRunStep(client, "u1", { runId: "run-1", stepIndex: 0, stepType: "x", status: "done" })
    ).resolves.toBeUndefined();
  });

  it("never throws when the insert reports an error object", async () => {
    const { client } = makeSupabase([{ data: null, error: { message: "insert failed" } }]);
    await expect(
      recordRunStep(client, "u1", { runId: "run-1", stepIndex: 0, stepType: "x", status: "error", error: "boom" })
    ).resolves.toBeUndefined();
  });
});
