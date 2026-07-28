import { describe, it, expect } from "vitest";
import { stripMatchingExt, listRecordingFilesForRuns, getRecordingFileById } from "./recording-files";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

describe("stripMatchingExt", () => {
  it('removes matching extension: "a.docx" + "docx" -> "a"', () => {
    expect(stripMatchingExt("a.docx", "docx")).toBe("a");
  });

  it('removes matching extension case-insensitively: "a.DOCX" + "docx" -> "a"', () => {
    expect(stripMatchingExt("a.DOCX", "docx")).toBe("a");
  });

  it('does not remove when extension is absent: "a" + "docx" -> "a"', () => {
    expect(stripMatchingExt("a", "docx")).toBe("a");
  });

  it('removes only one layer: "a.md.md" + "md" -> "a.md"', () => {
    expect(stripMatchingExt("a.md.md", "md")).toBe("a.md");
  });

  it('removes outer extension: "a.tar.gz" + "gz" -> "a.tar"', () => {
    expect(stripMatchingExt("a.tar.gz", "gz")).toBe("a.tar");
  });

  it('returns unchanged when ext is empty', () => {
    expect(stripMatchingExt("a.docx", "")).toBe("a.docx");
  });

  it("returns unchanged when name is empty", () => {
    expect(stripMatchingExt("", "docx")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// listRecordingFilesForRuns / getRecordingFileById - hand-rolled fake
// Supabase client, following the same inline-fake approach as
// workflow-runs.test.ts: each test builds exactly the chain the function
// under test calls and records every call so assertions can check what was
// sent, including user_id scoping.
// ---------------------------------------------------------------------------

interface RecordedCall {
  method: string;
  args: unknown[];
}

type FakeResponse = { data: unknown; error: unknown };

function makeQueryBuilder(response: FakeResponse, calls: RecordedCall[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return builder;
    },
    in: (...args: unknown[]) => {
      calls.push({ method: "in", args });
      return builder;
    },
    order: (...args: unknown[]) => {
      calls.push({ method: "order", args });
      return builder;
    },
    maybeSingle: () => {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(response);
    },
    then: (resolve: (value: FakeResponse) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return builder;
}

function makeSupabase(response: FakeResponse) {
  const calls: RecordedCall[] = [];
  const client = {
    from: (tableName: string) => {
      calls.push({ method: "from", args: [tableName] });
      return makeQueryBuilder(response, calls);
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

function eqCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "eq").map((c) => c.args);
}

function makeFileRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "file-1",
    user_id: "u1",
    name: "Gradebook export",
    kind: "file",
    mime_type: "text/csv",
    size_bytes: 100,
    duration_sec: null,
    storage_path: "u1/file-1.csv",
    source: null,
    origin: "unattended",
    workflow_name: "Weekly Announcement",
    workflow_id: "wf-1",
    workflow_run_id: "run-1",
    created_at: "2026-07-27T10:00:00.000Z",
    ...overrides,
  };
}

describe("listRecordingFilesForRuns", () => {
  it("short-circuits to [] without querying when runIds is empty", async () => {
    const { client, calls } = makeSupabase({ data: [], error: null });
    const files = await listRecordingFilesForRuns(client, "u1", []);
    expect(files).toEqual([]);
    expect(calls.some((c) => c.method === "from")).toBe(false);
  });

  it("queries with a single .in('workflow_run_id', runIds) call, scoped to user_id", async () => {
    const { client, calls } = makeSupabase({ data: [], error: null });
    await listRecordingFilesForRuns(client, "u1", ["run-1", "run-2"]);
    expect(calls.filter((c) => c.method === "from")).toHaveLength(1);
    const inCall = calls.find((c) => c.method === "in");
    expect(inCall!.args).toEqual(["workflow_run_id", ["run-1", "run-2"]]);
    expect(eqCalls(calls)).toContainEqual(["user_id", "u1"]);
  });

  it("maps every returned row through mapRecordingFile", async () => {
    const { client } = makeSupabase({
      data: [makeFileRow({ id: "a" }), makeFileRow({ id: "b", workflow_run_id: "run-2" })],
      error: null,
    });
    const files = await listRecordingFilesForRuns(client, "u1", ["run-1", "run-2"]);
    expect(files.map((f) => f.id)).toEqual(["a", "b"]);
    expect(files[0].workflowRunId).toBe("run-1");
    expect(files[1].workflowRunId).toBe("run-2");
  });

  it("throws when the query reports an error", async () => {
    const { client } = makeSupabase({ data: null, error: { message: "boom" } });
    await expect(listRecordingFilesForRuns(client, "u1", ["run-1"])).rejects.toThrow("boom");
  });
});

describe("getRecordingFileById", () => {
  it("scopes the query to the given user_id and id", async () => {
    const { client, calls } = makeSupabase({ data: makeFileRow(), error: null });
    await getRecordingFileById(client, "u1", "file-1");
    const eq = eqCalls(calls);
    expect(eq).toContainEqual(["user_id", "u1"]);
    expect(eq).toContainEqual(["id", "file-1"]);
  });

  it("returns null when no row is found", async () => {
    const { client } = makeSupabase({ data: null, error: null });
    const file = await getRecordingFileById(client, "u1", "missing");
    expect(file).toBeNull();
  });

  it("maps a found row through mapRecordingFile", async () => {
    const { client } = makeSupabase({ data: makeFileRow({ id: "file-1", name: "Gradebook export" }), error: null });
    const file = await getRecordingFileById(client, "u1", "file-1");
    expect(file?.id).toBe("file-1");
    expect(file?.name).toBe("Gradebook export");
  });

  it("throws when the query reports an error", async () => {
    const { client } = makeSupabase({ data: null, error: { message: "boom" } });
    await expect(getRecordingFileById(client, "u1", "file-1")).rejects.toThrow("boom");
  });
});
