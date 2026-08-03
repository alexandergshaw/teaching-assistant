// Shared fake-Supabase test infra for workflow-runs.test.ts,
// workflow-runs.reads.test.ts, and workflow-runs.mapping.test.ts. Split out
// of workflow-runs.test.ts (which had grown past this repo's
// 1000-line-per-file cap) so all three files build the same hand-rolled fake
// client and inspect recorded calls the same way, instead of drifting,
// copy-pasted implementations.
//
// This file is intentionally NOT named *.test.ts: vitest's config runs every
// src/**/*.test.ts file expecting at least one test in it, and a
// fixtures-only module with no test() / it() would fail that expectation.
//
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

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export type FakeResponse = { data: unknown; error: unknown } | { reject: Error };

export function makeQueryBuilder(response: FakeResponse, calls: RecordedCall[]) {
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

export function makeSupabase(responses: FakeResponse[]) {
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

export function eqCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "eq").map((c) => c.args);
}

export function neqCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "neq").map((c) => c.args);
}

export function gtCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "gt").map((c) => c.args);
}

export function notCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "not").map((c) => c.args);
}

export function isCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "is").map((c) => c.args);
}

export function orderCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "order").map((c) => c.args);
}

export function insertArg(calls: RecordedCall[]) {
  return calls.find((c) => c.method === "insert")?.args[0];
}

export function upsertArg(calls: RecordedCall[]) {
  return calls.find((c) => c.method === "upsert")?.args[0];
}

export function updateArg(calls: RecordedCall[]) {
  return calls.find((c) => c.method === "update")?.args[0];
}
