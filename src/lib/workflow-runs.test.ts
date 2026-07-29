import { describe, it, expect, vi } from "vitest";
import {
  recordWorkflowRun,
  startWorkflowRun,
  finishWorkflowRun,
  recordRunStep,
  listRunSteps,
  listRecentRuns,
  getRun,
  mapWorkflowRun,
  mapWorkflowRunStep,
  latestWorkflowRun,
  runsSinceForWorkflow,
  latestRunAnyWorkflow,
  runsSinceAnyWorkflow,
} from "./workflow-runs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

// Hand-rolled fake Supabase client, following the inline-fake approach used
// in src/lib/grading-drafts.test.ts and src/lib/live-class-sessions.test.ts:
// each test builds exactly the chain the function under test calls, and
// records every call so assertions can check what was sent, including the
// user_id scoping. `from()` is called once per table()/stepsTable()
// invocation - some functions (finishWorkflowRun) call it twice (a select,
// then an update) - so responses are consumed in call order. A response can
// also be `{ reject: Error }` to make that call's terminal method (single,
// maybeSingle, or a bare await of the chain) reject instead of resolve, for
// exercising the "never throws" behavior of finishWorkflowRun/recordRunStep.

interface RecordedCall {
  method: string;
  args: unknown[];
}

type FakeResponse = { data: unknown; error: unknown } | { reject: Error };

function makeQueryBuilder(response: FakeResponse, calls: RecordedCall[]) {
  function settle(): Promise<{ data: unknown; error: unknown }> {
    if ("reject" in response) return Promise.reject(response.reject);
    return Promise.resolve(response);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return builder;
    },
    insert: (...args: unknown[]) => {
      calls.push({ method: "insert", args });
      return builder;
    },
    update: (...args: unknown[]) => {
      calls.push({ method: "update", args });
      return builder;
    },
    upsert: (...args: unknown[]) => {
      calls.push({ method: "upsert", args });
      return builder;
    },
    delete: (...args: unknown[]) => {
      calls.push({ method: "delete", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return builder;
    },
    neq: (...args: unknown[]) => {
      calls.push({ method: "neq", args });
      return builder;
    },
    gt: (...args: unknown[]) => {
      calls.push({ method: "gt", args });
      return builder;
    },
    is: (...args: unknown[]) => {
      calls.push({ method: "is", args });
      return builder;
    },
    not: (...args: unknown[]) => {
      calls.push({ method: "not", args });
      return builder;
    },
    order: (...args: unknown[]) => {
      calls.push({ method: "order", args });
      return builder;
    },
    limit: (...args: unknown[]) => {
      calls.push({ method: "limit", args });
      return builder;
    },
    single: () => {
      calls.push({ method: "single", args: [] });
      return settle();
    },
    maybeSingle: () => {
      calls.push({ method: "maybeSingle", args: [] });
      return settle();
    },
    // Supabase's query builder is itself a thenable, so a caller that never
    // reaches `.single()`/`.maybeSingle()` can still `await` the chain
    // directly (e.g. recordRunStep awaiting `.insert(...)` with nothing
    // chained after it).
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown, reject: (reason: unknown) => unknown) =>
      settle().then(resolve, reject),
  };
  return builder;
}

function makeSupabase(responses: FakeResponse[]) {
  const calls: RecordedCall[] = [];
  let callIndex = 0;
  const client = {
    from: (tableName: string) => {
      calls.push({ method: "from", args: [tableName] });
      const response = responses[Math.min(callIndex, responses.length - 1)];
      callIndex += 1;
      return makeQueryBuilder(response, calls);
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

function eqCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "eq").map((c) => c.args);
}

function neqCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "neq").map((c) => c.args);
}

function gtCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "gt").map((c) => c.args);
}

function notCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "not").map((c) => c.args);
}

function isCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "is").map((c) => c.args);
}

function orderCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "order").map((c) => c.args);
}

function insertArg(calls: RecordedCall[]) {
  return calls.find((c) => c.method === "insert")?.args[0];
}

function upsertArg(calls: RecordedCall[]) {
  return calls.find((c) => c.method === "upsert")?.args[0];
}

function updateArg(calls: RecordedCall[]) {
  return calls.find((c) => c.method === "update")?.args[0];
}

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
// latestWorkflowRun / runsSinceForWorkflow / latestRunAnyWorkflow /
// runsSinceAnyWorkflow - the four reads that feed decideWorkflowCompleted.
//
// Each of these four functions issues TWO underlying queries in parallel (a
// "finished" read, where finished_at is not null, and a "legacy" read, where
// finished_at is null) and merges the two in JS - see the section comment
// above these functions in workflow-runs.ts for why. So `makeSupabase` here
// is always given a two-element responses array: index 0 answers the
// "finished" query, index 1 answers the "legacy" query (Promise.all
// evaluates the two query-builder chains left to right before awaiting
// either, so `from()` is called in that order).
// ---------------------------------------------------------------------------

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
