import { describe, it, expect } from "vitest";
import {
  mapClassSession,
  createClassSession,
  appendClassSessionData,
  endClassSession,
  listClassSessions,
  getClassSession,
  type ClassSessionSegment,
  type ClassSessionAnswer,
} from "./live-class-sessions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

// Hand-rolled fake Supabase client, following the inline-fake approach used
// in src/lib/grading-drafts.test.ts (rather than a shared reusable class):
// each test builds exactly the chain the function under test calls, and
// records every call so assertions can check what was sent, including the
// user_id scoping. `from()` is called once per table() invocation - some
// functions (appendClassSessionData) call it twice (a select, then an
// update) - so responses are consumed in call order.

interface RecordedCall {
  method: string;
  args: unknown[];
}

function makeQueryBuilder(response: { data: unknown; error: unknown }, calls: RecordedCall[]) {
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
    delete: (...args: unknown[]) => {
      calls.push({ method: "delete", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
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
      return Promise.resolve(response);
    },
    maybeSingle: () => {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(response);
    },
    // Supabase's query builder is itself a thenable, so a caller that never
    // reaches `.single()`/`.maybeSingle()` (listClassSessions,
    // endClassSession) can still `await` the chain directly.
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return builder;
}

function makeSupabase(responses: { data: unknown; error: unknown }[]) {
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

function makeRawRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "s1",
    user_id: "u1",
    course_id: "c1",
    title: "Intro to CS",
    module_name: "Loops",
    status: "live",
    started_at: "2026-07-27T10:00:00.000Z",
    ended_at: null,
    segments: [],
    answered: [],
    created_at: "2026-07-27T10:00:00.000Z",
    updated_at: "2026-07-27T10:00:00.000Z",
    ...overrides,
  };
}

const segA: ClassSessionSegment = { id: "seg-1", text: "Hello class", atMs: 0 };
const segB: ClassSessionSegment = { id: "seg-2", text: "Today we cover loops", atMs: 5000 };
const answerA: ClassSessionAnswer = {
  id: "ans-1",
  question: "What is a loop?",
  answer: "A construct that repeats.",
  askedAtMs: 1000,
  answeredAtMs: 2000,
  grounded: true,
};

describe("mapClassSession", () => {
  it("maps a well-formed row", () => {
    const row = makeRawRow({
      segments: [segA, segB],
      answered: [answerA],
    });
    const session = mapClassSession(row);
    expect(session).toEqual({
      id: "s1",
      courseId: "c1",
      title: "Intro to CS",
      moduleName: "Loops",
      status: "live",
      startedAt: "2026-07-27T10:00:00.000Z",
      endedAt: null,
      segments: [segA, segB],
      answered: [answerA],
    });
  });

  it("degrades a string segments value to []", () => {
    const session = mapClassSession(makeRawRow({ segments: "not an array" }));
    expect(session.segments).toEqual([]);
  });

  it("degrades a null segments value to []", () => {
    const session = mapClassSession(makeRawRow({ segments: null }));
    expect(session.segments).toEqual([]);
  });

  it("degrades an object segments value to []", () => {
    const session = mapClassSession(makeRawRow({ segments: { not: "an array" } }));
    expect(session.segments).toEqual([]);
  });

  it("degrades a malformed answered value to []", () => {
    expect(mapClassSession(makeRawRow({ answered: "nope" })).answered).toEqual([]);
    expect(mapClassSession(makeRawRow({ answered: null })).answered).toEqual([]);
    expect(mapClassSession(makeRawRow({ answered: {} })).answered).toEqual([]);
  });

  it("drops individual malformed entries within an otherwise-valid segments array", () => {
    const session = mapClassSession(makeRawRow({ segments: [segA, { missing: "id and text" }, null] }));
    expect(session.segments).toEqual([segA]);
  });

  it("falls back an unrecognized status to ended", () => {
    const session = mapClassSession(makeRawRow({ status: "something-else" }));
    expect(session.status).toBe("ended");
  });

  it("passes through each recognized status", () => {
    expect(mapClassSession(makeRawRow({ status: "live" })).status).toBe("live");
    expect(mapClassSession(makeRawRow({ status: "ended" })).status).toBe("ended");
    expect(mapClassSession(makeRawRow({ status: "error" })).status).toBe("error");
  });
});

describe("createClassSession", () => {
  it("inserts scoped to the given user_id", async () => {
    const { client, calls } = makeSupabase([{ data: makeRawRow(), error: null }]);
    await createClassSession(client, "u1", { title: "Intro to CS", moduleName: "Loops" });

    const insertCall = calls.find((c) => c.method === "insert");
    expect(insertCall).toBeDefined();
    expect(insertCall!.args[0]).toMatchObject({ user_id: "u1", title: "Intro to CS", module_name: "Loops" });
  });
});

describe("appendClassSessionData", () => {
  it("dedupes new segments/answered by id against what is already stored", async () => {
    const stored = { segments: [segA], answered: [answerA] };
    const { client, calls } = makeSupabase([
      { data: stored, error: null },
      { data: null, error: null },
    ]);

    // Retry: segA is sent again alongside a genuinely new segB.
    await appendClassSessionData(client, "u1", "s1", { segments: [segA, segB] });

    const updateCall = calls.find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    const payload = updateCall!.args[0] as { segments: ClassSessionSegment[] };
    expect(payload.segments).toHaveLength(2);
    expect(payload.segments.map((s) => s.id)).toEqual(["seg-1", "seg-2"]);
  });

  it("dedupes a batch that repeats the same id within itself", async () => {
    const { client, calls } = makeSupabase([
      { data: { segments: [], answered: [] }, error: null },
      { data: null, error: null },
    ]);

    await appendClassSessionData(client, "u1", "s1", { segments: [segA, { ...segA, text: "duplicate" }] });

    const updateCall = calls.find((c) => c.method === "update");
    const payload = updateCall!.args[0] as { segments: ClassSessionSegment[] };
    expect(payload.segments).toHaveLength(1);
  });

  it("bumps updated_at", async () => {
    const { client, calls } = makeSupabase([
      { data: { segments: [], answered: [] }, error: null },
      { data: null, error: null },
    ]);

    await appendClassSessionData(client, "u1", "s1", { segments: [segA] });

    const updateCall = calls.find((c) => c.method === "update");
    const payload = updateCall!.args[0] as { updated_at?: string };
    expect(typeof payload.updated_at).toBe("string");
    expect(payload.updated_at!.length).toBeGreaterThan(0);
  });

  it("scopes both the read and the write to the given user_id", async () => {
    const { client, calls } = makeSupabase([
      { data: { segments: [], answered: [] }, error: null },
      { data: null, error: null },
    ]);

    await appendClassSessionData(client, "u1", "s1", { segments: [segA] });

    const eqArgs = eqCalls(calls);
    expect(eqArgs).toContainEqual(["user_id", "u1"]);
    // Two separate queries (select then update) each scope by user_id.
    expect(eqArgs.filter((a) => a[0] === "user_id").length).toBeGreaterThanOrEqual(2);
  });
});

describe("endClassSession", () => {
  it("sets both status and ended_at", async () => {
    const { client, calls } = makeSupabase([{ data: null, error: null }]);
    await endClassSession(client, "u1", "s1", "error");

    const updateCall = calls.find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    const payload = updateCall!.args[0] as { status?: string; ended_at?: string };
    expect(payload.status).toBe("error");
    expect(typeof payload.ended_at).toBe("string");
  });

  it("defaults status to ended when omitted", async () => {
    const { client, calls } = makeSupabase([{ data: null, error: null }]);
    await endClassSession(client, "u1", "s1");

    const updateCall = calls.find((c) => c.method === "update");
    const payload = updateCall!.args[0] as { status?: string };
    expect(payload.status).toBe("ended");
  });

  it("scopes the update to the given user_id", async () => {
    const { client, calls } = makeSupabase([{ data: null, error: null }]);
    await endClassSession(client, "u1", "s1");
    expect(eqCalls(calls)).toContainEqual(["user_id", "u1"]);
  });
});

describe("listClassSessions", () => {
  it("orders newest first", async () => {
    const { client, calls } = makeSupabase([{ data: [makeRawRow()], error: null }]);
    await listClassSessions(client, "u1");

    const orderCall = calls.find((c) => c.method === "order");
    expect(orderCall).toBeDefined();
    expect(orderCall!.args[0]).toBe("started_at");
    expect(orderCall!.args[1]).toMatchObject({ ascending: false });
  });

  it("defaults the limit to 20", async () => {
    const { client, calls } = makeSupabase([{ data: [], error: null }]);
    await listClassSessions(client, "u1");

    const limitCall = calls.find((c) => c.method === "limit");
    expect(limitCall).toBeDefined();
    expect(limitCall!.args[0]).toBe(20);
  });

  it("honors an explicit limit", async () => {
    const { client, calls } = makeSupabase([{ data: [], error: null }]);
    await listClassSessions(client, "u1", 5);

    const limitCall = calls.find((c) => c.method === "limit");
    expect(limitCall!.args[0]).toBe(5);
  });

  it("scopes the query to the given user_id", async () => {
    const { client, calls } = makeSupabase([{ data: [], error: null }]);
    await listClassSessions(client, "u1");
    expect(eqCalls(calls)).toContainEqual(["user_id", "u1"]);
  });

  it("maps every returned row through mapClassSession", async () => {
    const { client } = makeSupabase([{ data: [makeRawRow({ id: "s1" }), makeRawRow({ id: "s2" })], error: null }]);
    const sessions = await listClassSessions(client, "u1");
    expect(sessions.map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});

describe("getClassSession", () => {
  it("scopes the query to the given user_id", async () => {
    const { client, calls } = makeSupabase([{ data: makeRawRow(), error: null }]);
    await getClassSession(client, "u1", "s1");
    expect(eqCalls(calls)).toContainEqual(["user_id", "u1"]);
    expect(eqCalls(calls)).toContainEqual(["id", "s1"]);
  });

  it("returns null when no row is found", async () => {
    const { client } = makeSupabase([{ data: null, error: null }]);
    const session = await getClassSession(client, "u1", "missing");
    expect(session).toBeNull();
  });

  it("maps a found row through mapClassSession", async () => {
    const { client } = makeSupabase([{ data: makeRawRow({ id: "s1" }), error: null }]);
    const session = await getClassSession(client, "u1", "s1");
    expect(session?.id).toBe("s1");
  });
});
