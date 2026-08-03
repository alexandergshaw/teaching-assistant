// Split out of workflow-runs.test.ts (which had grown past this repo's
// 1000-line-per-file cap). Covers the four "since/latest" read functions that
// feed decideWorkflowCompleted: latestWorkflowRun, runsSinceForWorkflow,
// latestRunAnyWorkflow, and runsSinceAnyWorkflow. recordWorkflowRun /
// startWorkflowRun / finishWorkflowRun / recordRunStep stay in
// workflow-runs.test.ts; listRunSteps / listRecentRuns / getRun /
// mapWorkflowRun / mapWorkflowRunStep moved to workflow-runs.mapping.test.ts.
// The shared fake-Supabase infra lives in workflow-runs.fixtures.ts.
//
// Each of these four functions issues TWO underlying queries in parallel (a
// "finished" read, where finished_at is not null, and a "legacy" read, where
// finished_at is null) and merges the two in JS - see the section comment
// above these functions in workflow-runs.ts for why. So `makeSupabase` here
// is always given a two-element responses array: index 0 answers the
// "finished" query, index 1 answers the "legacy" query (Promise.all
// evaluates the two query-builder chains left to right before awaiting
// either, so `from()` is called in that order).

import { describe, it, expect } from "vitest";
import {
  latestWorkflowRun,
  runsSinceForWorkflow,
  latestRunAnyWorkflow,
  runsSinceAnyWorkflow,
} from "./workflow-runs";
import {
  makeSupabase,
  eqCalls,
  neqCalls,
  gtCalls,
  notCalls,
  isCalls,
  orderCalls,
} from "./workflow-runs.fixtures";

function makeTimeRow(
  overrides: Partial<{ created_at: string; finished_at: string | null; status: string }> = {}
): { created_at: string; finished_at: string | null; status: string } {
  return {
    created_at: "2026-07-27T10:00:00.000Z",
    finished_at: "2026-07-27T10:05:00.000Z",
    status: "ok",
    ...overrides,
  };
}

function makeNamedTimeRow(
  overrides: Partial<{ created_at: string; finished_at: string | null; status: string; workflow_name: string }> = {}
): { created_at: string; finished_at: string | null; status: string; workflow_name: string } {
  return {
    created_at: "2026-07-27T10:00:00.000Z",
    finished_at: "2026-07-27T10:05:00.000Z",
    status: "ok",
    workflow_name: "Weekly Announcement",
    ...overrides,
  };
}

describe("latestWorkflowRun", () => {
  it("excludes running rows via neq('status', 'running') on both reads, splits by finished_at (not-null desc / null desc by created_at), and scopes both to user_id + workflow_id", async () => {
    const { client, calls } = makeSupabase([{ data: [], error: null }, { data: [], error: null }]);
    await latestWorkflowRun(client, "u1", "wf-1");
    expect(neqCalls(calls).filter((a) => a[0] === "status" && a[1] === "running").length).toBe(2);
    expect(notCalls(calls)).toContainEqual(["finished_at", "is", null]);
    expect(isCalls(calls)).toContainEqual(["finished_at", null]);
    expect(orderCalls(calls)).toContainEqual(["finished_at", { ascending: false }]);
    expect(orderCalls(calls)).toContainEqual(["created_at", { ascending: false }]);
    const eq = eqCalls(calls);
    expect(eq.filter((a) => a[0] === "user_id" && a[1] === "u1").length).toBe(2);
    expect(eq.filter((a) => a[0] === "workflow_id" && a[1] === "wf-1").length).toBe(2);
  });

  it("returns null when neither read finds a row", async () => {
    const { client } = makeSupabase([{ data: [], error: null }, { data: [], error: null }]);
    const run = await latestWorkflowRun(client, "u1", "wf-1");
    expect(run).toBeNull();
  });

  it("a running row in the (misbehaving) query result is never returned - defense in depth beyond the query filter", async () => {
    const { client } = makeSupabase([
      { data: [makeTimeRow({ status: "running", finished_at: null })], error: null },
      { data: [makeTimeRow({ status: "running", finished_at: null, created_at: "2026-07-27T11:00:00.000Z" })], error: null },
    ]);
    const run = await latestWorkflowRun(client, "u1", "wf-1");
    expect(run).toBeNull();
  });

  it("reports finished_at, not created_at, as createdAt", async () => {
    const { client } = makeSupabase([
      {
        data: [
          makeTimeRow({ created_at: "2026-07-27T10:00:00.000Z", finished_at: "2026-07-27T10:05:00.000Z", status: "ok" }),
        ],
        error: null,
      },
      { data: [], error: null },
    ]);
    const run = await latestWorkflowRun(client, "u1", "wf-1");
    expect(run).toEqual({ createdAt: "2026-07-27T10:05:00.000Z", status: "ok" });
  });

  it("falls back to created_at for a legacy row with no finished_at", async () => {
    const { client } = makeSupabase([
      { data: [], error: null },
      { data: [makeTimeRow({ created_at: "2026-07-27T09:00:00.000Z", finished_at: null, status: "ok" })], error: null },
    ]);
    const run = await latestWorkflowRun(client, "u1", "wf-1");
    expect(run).toEqual({ createdAt: "2026-07-27T09:00:00.000Z", status: "ok" });
  });

  it("orders by completion time: a run started earlier but finished later outranks one started later but finished earlier", async () => {
    const { client } = makeSupabase([
      {
        data: [
          // Started later (09:00) but finished earlier (09:05).
          makeTimeRow({ created_at: "2026-07-27T09:00:00.000Z", finished_at: "2026-07-27T09:05:00.000Z", status: "ok" }),
          // Started earlier (08:00) but finished later (09:10) - this one should win.
          makeTimeRow({ created_at: "2026-07-27T08:00:00.000Z", finished_at: "2026-07-27T09:10:00.000Z", status: "ok" }),
        ],
        error: null,
      },
      { data: [], error: null },
    ]);
    const run = await latestWorkflowRun(client, "u1", "wf-1");
    expect(run?.createdAt).toBe("2026-07-27T09:10:00.000Z");
  });

  it("returns exactly { createdAt, status } - no extra keys", async () => {
    const { client } = makeSupabase([{ data: [makeTimeRow()], error: null }, { data: [], error: null }]);
    const run = await latestWorkflowRun(client, "u1", "wf-1");
    expect(Object.keys(run ?? {}).sort()).toEqual(["createdAt", "status"]);
  });
});

describe("runsSinceForWorkflow", () => {
  it("excludes running rows via neq('status', 'running') on both reads; BREAK3: the gt boundary compares finished_at (completion time) for the finished read and created_at for the legacy read - never created_at for a row that has finished_at", async () => {
    const sinceIso = "2026-07-27T10:00:00.000Z";
    const { client, calls } = makeSupabase([{ data: [], error: null }, { data: [], error: null }]);
    await runsSinceForWorkflow(client, "u1", "wf-1", sinceIso);
    expect(neqCalls(calls).filter((a) => a[0] === "status" && a[1] === "running").length).toBe(2);
    expect(gtCalls(calls)).toContainEqual(["finished_at", sinceIso]);
    expect(gtCalls(calls)).toContainEqual(["created_at", sinceIso]);
  });

  it("BREAK3 regression: a run started before the cursor but finished after it IS returned", async () => {
    const sinceIso = "2026-07-27T10:00:00.000Z";
    const longRun = makeTimeRow({
      created_at: "2026-07-27T09:50:00.000Z", // started BEFORE the cursor
      finished_at: "2026-07-27T10:10:00.000Z", // finished AFTER the cursor
      status: "ok",
    });
    const { client } = makeSupabase([
      { data: [longRun], error: null },
      { data: [], error: null },
    ]);
    const runs = await runsSinceForWorkflow(client, "u1", "wf-1", sinceIso);
    expect(runs).toEqual([{ createdAt: "2026-07-27T10:10:00.000Z", status: "ok" }]);
  });

  it("a running row in the (misbehaving) query result is never returned - defense in depth beyond the query filter", async () => {
    const { client } = makeSupabase([
      { data: [makeTimeRow({ status: "running", finished_at: null })], error: null },
      { data: [makeTimeRow({ status: "running", finished_at: null })], error: null },
    ]);
    const runs = await runsSinceForWorkflow(client, "u1", "wf-1", "2026-07-27T00:00:00.000Z");
    expect(runs).toEqual([]);
  });

  it("reports finished_at, not created_at, per row", async () => {
    const { client } = makeSupabase([
      {
        data: [
          makeTimeRow({ created_at: "2026-07-27T10:00:00.000Z", finished_at: "2026-07-27T10:05:00.000Z", status: "ok" }),
        ],
        error: null,
      },
      { data: [], error: null },
    ]);
    const runs = await runsSinceForWorkflow(client, "u1", "wf-1", "2026-07-27T00:00:00.000Z");
    expect(runs).toEqual([{ createdAt: "2026-07-27T10:05:00.000Z", status: "ok" }]);
  });

  it("falls back to created_at for a legacy row with no finished_at", async () => {
    const { client } = makeSupabase([
      { data: [], error: null },
      { data: [makeTimeRow({ created_at: "2026-07-27T09:00:00.000Z", finished_at: null, status: "ok" })], error: null },
    ]);
    const runs = await runsSinceForWorkflow(client, "u1", "wf-1", "2026-07-27T00:00:00.000Z");
    expect(runs).toEqual([{ createdAt: "2026-07-27T09:00:00.000Z", status: "ok" }]);
  });

  it("orders the merged list ascending by completion time: a run started earlier but finished later sorts after one started later but finished earlier", async () => {
    const { client } = makeSupabase([
      {
        data: [
          // Started later (09:00) but finished earlier (09:05).
          makeTimeRow({ created_at: "2026-07-27T09:00:00.000Z", finished_at: "2026-07-27T09:05:00.000Z", status: "ok" }),
          // Started earlier (08:00) but finished later (09:10) - should sort AFTER the row above.
          makeTimeRow({ created_at: "2026-07-27T08:00:00.000Z", finished_at: "2026-07-27T09:10:00.000Z", status: "error" }),
        ],
        error: null,
      },
      { data: [], error: null },
    ]);
    const runs = await runsSinceForWorkflow(client, "u1", "wf-1", "2026-07-27T00:00:00.000Z");
    expect(runs.map((r) => r.createdAt)).toEqual(["2026-07-27T09:05:00.000Z", "2026-07-27T09:10:00.000Z"]);
  });

  it("returns rows shaped exactly { createdAt, status } - no extra keys", async () => {
    const { client } = makeSupabase([{ data: [makeTimeRow()], error: null }, { data: [], error: null }]);
    const runs = await runsSinceForWorkflow(client, "u1", "wf-1", "2026-07-27T00:00:00.000Z");
    expect(Object.keys(runs[0]).sort()).toEqual(["createdAt", "status"]);
  });
});

describe("latestRunAnyWorkflow", () => {
  it("excludes running rows via neq('status', 'running') on both reads, and excludes the given workflow_id", async () => {
    const { client, calls } = makeSupabase([{ data: [], error: null }, { data: [], error: null }]);
    await latestRunAnyWorkflow(client, "u1", "wf-self");
    const neq = neqCalls(calls);
    expect(neq.filter((a) => a[0] === "status" && a[1] === "running").length).toBe(2);
    expect(neq.filter((a) => a[0] === "workflow_id" && a[1] === "wf-self").length).toBe(2);
  });

  it("returns null when neither read finds a row", async () => {
    const { client } = makeSupabase([{ data: [], error: null }, { data: [], error: null }]);
    const run = await latestRunAnyWorkflow(client, "u1", "wf-self");
    expect(run).toBeNull();
  });

  it("a running row in the (misbehaving) query result is never returned - defense in depth beyond the query filter", async () => {
    const { client } = makeSupabase([
      { data: [makeNamedTimeRow({ status: "running", finished_at: null })], error: null },
      { data: [makeNamedTimeRow({ status: "running", finished_at: null })], error: null },
    ]);
    const run = await latestRunAnyWorkflow(client, "u1", "wf-self");
    expect(run).toBeNull();
  });

  it("reports finished_at, not created_at, as createdAt", async () => {
    const { client } = makeSupabase([
      {
        data: [
          makeNamedTimeRow({ created_at: "2026-07-27T10:00:00.000Z", finished_at: "2026-07-27T10:05:00.000Z", status: "ok" }),
        ],
        error: null,
      },
      { data: [], error: null },
    ]);
    const run = await latestRunAnyWorkflow(client, "u1", "wf-self");
    expect(run).toEqual({ createdAt: "2026-07-27T10:05:00.000Z", status: "ok", workflowName: "Weekly Announcement" });
  });

  it("falls back to created_at for a legacy row with no finished_at", async () => {
    const { client } = makeSupabase([
      { data: [], error: null },
      { data: [makeNamedTimeRow({ created_at: "2026-07-27T09:00:00.000Z", finished_at: null, status: "ok" })], error: null },
    ]);
    const run = await latestRunAnyWorkflow(client, "u1", "wf-self");
    expect(run?.createdAt).toBe("2026-07-27T09:00:00.000Z");
  });

  it("orders by completion time: a run started earlier but finished later outranks one started later but finished earlier", async () => {
    const { client } = makeSupabase([
      {
        data: [
          makeNamedTimeRow({ created_at: "2026-07-27T09:00:00.000Z", finished_at: "2026-07-27T09:05:00.000Z", workflow_name: "Later start" }),
          makeNamedTimeRow({ created_at: "2026-07-27T08:00:00.000Z", finished_at: "2026-07-27T09:10:00.000Z", workflow_name: "Earlier start" }),
        ],
        error: null,
      },
      { data: [], error: null },
    ]);
    const run = await latestRunAnyWorkflow(client, "u1", "wf-self");
    expect(run?.workflowName).toBe("Earlier start");
  });

  it("returns exactly { createdAt, status, workflowName } - no extra keys", async () => {
    const { client } = makeSupabase([
      { data: [makeNamedTimeRow()], error: null },
      { data: [], error: null },
    ]);
    const run = await latestRunAnyWorkflow(client, "u1", "wf-self");
    expect(Object.keys(run ?? {}).sort()).toEqual(["createdAt", "status", "workflowName"]);
  });
});

describe("runsSinceAnyWorkflow", () => {
  it("excludes running rows via neq('status', 'running') on both reads, and excludes the given workflow_id", async () => {
    const { client, calls } = makeSupabase([{ data: [], error: null }, { data: [], error: null }]);
    await runsSinceAnyWorkflow(client, "u1", "2026-07-27T00:00:00.000Z", "wf-self");
    const neq = neqCalls(calls);
    expect(neq.filter((a) => a[0] === "status" && a[1] === "running").length).toBe(2);
    expect(neq.filter((a) => a[0] === "workflow_id" && a[1] === "wf-self").length).toBe(2);
  });

  it("BREAK3 regression: the gt boundary compares finished_at for the finished read and created_at for the legacy read", async () => {
    const sinceIso = "2026-07-27T10:00:00.000Z";
    const { client, calls } = makeSupabase([{ data: [], error: null }, { data: [], error: null }]);
    await runsSinceAnyWorkflow(client, "u1", sinceIso, "wf-self");
    expect(gtCalls(calls)).toContainEqual(["finished_at", sinceIso]);
    expect(gtCalls(calls)).toContainEqual(["created_at", sinceIso]);
  });

  it("BREAK3 regression: a run started before the cursor but finished after it IS returned", async () => {
    const sinceIso = "2026-07-27T10:00:00.000Z";
    const longRun = makeNamedTimeRow({
      created_at: "2026-07-27T09:50:00.000Z",
      finished_at: "2026-07-27T10:10:00.000Z",
      status: "ok",
    });
    const { client } = makeSupabase([
      { data: [longRun], error: null },
      { data: [], error: null },
    ]);
    const runs = await runsSinceAnyWorkflow(client, "u1", sinceIso, "wf-self");
    expect(runs).toEqual([{ createdAt: "2026-07-27T10:10:00.000Z", status: "ok", workflowName: "Weekly Announcement" }]);
  });

  it("falls back to created_at for a legacy row with no finished_at", async () => {
    const { client } = makeSupabase([
      { data: [], error: null },
      { data: [makeNamedTimeRow({ created_at: "2026-07-27T09:00:00.000Z", finished_at: null, status: "ok" })], error: null },
    ]);
    const runs = await runsSinceAnyWorkflow(client, "u1", "2026-07-27T00:00:00.000Z", "wf-self");
    expect(runs).toEqual([{ createdAt: "2026-07-27T09:00:00.000Z", status: "ok", workflowName: "Weekly Announcement" }]);
  });

  it("a running row in the (misbehaving) query result is never returned - defense in depth beyond the query filter", async () => {
    const { client } = makeSupabase([
      { data: [makeNamedTimeRow({ status: "running", finished_at: null })], error: null },
      { data: [makeNamedTimeRow({ status: "running", finished_at: null })], error: null },
    ]);
    const runs = await runsSinceAnyWorkflow(client, "u1", "2026-07-27T00:00:00.000Z", "wf-self");
    expect(runs).toEqual([]);
  });

  it("orders the merged list ascending by completion time: a run started earlier but finished later sorts after one started later but finished earlier", async () => {
    const { client } = makeSupabase([
      {
        data: [
          makeNamedTimeRow({ created_at: "2026-07-27T09:00:00.000Z", finished_at: "2026-07-27T09:05:00.000Z" }),
          makeNamedTimeRow({ created_at: "2026-07-27T08:00:00.000Z", finished_at: "2026-07-27T09:10:00.000Z" }),
        ],
        error: null,
      },
      { data: [], error: null },
    ]);
    const runs = await runsSinceAnyWorkflow(client, "u1", "2026-07-27T00:00:00.000Z", "wf-self");
    expect(runs.map((r) => r.createdAt)).toEqual(["2026-07-27T09:05:00.000Z", "2026-07-27T09:10:00.000Z"]);
  });

  it("returns rows shaped exactly { createdAt, status, workflowName } - no extra keys", async () => {
    const { client } = makeSupabase([
      { data: [makeNamedTimeRow()], error: null },
      { data: [], error: null },
    ]);
    const runs = await runsSinceAnyWorkflow(client, "u1", "2026-07-27T00:00:00.000Z", "wf-self");
    expect(Object.keys(runs[0]).sort()).toEqual(["createdAt", "status", "workflowName"]);
  });
});
