import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  mapAnnouncementExemplar,
  listAnnouncementExemplars,
  getMostRecentAnnouncementExemplar,
  saveAnnouncementExemplar,
  deleteAnnouncementExemplar,
} from "./announcement-exemplars";
import type { Database, Json } from "./supabase/types";

type Row = Database["public"]["Tables"]["announcement_exemplars"]["Row"];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "e1",
    user_id: "u1",
    course_id: "c1",
    exemplar_text: "Hi everyone, this week we cover chapters 4 and 5.",
    outline: [{ heading: "Greeting", kind: "prose" }] as unknown as Json,
    label: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("mapAnnouncementExemplar", () => {
  it("maps a full row, including a null label and the outline jsonb", () => {
    const outline = [
      { heading: "Greeting", kind: "prose" },
      { heading: "Due dates", kind: "list", ordered: false },
    ] as unknown as Json;

    const exemplar = mapAnnouncementExemplar(row({ outline, label: null }));

    expect(exemplar).toEqual({
      id: "e1",
      courseId: "c1",
      exemplarText: "Hi everyone, this week we cover chapters 4 and 5.",
      outline,
      label: null,
      createdAt: "2026-09-01T00:00:00Z",
    });
  });

  it("maps a non-null label through unchanged", () => {
    const exemplar = mapAnnouncementExemplar(row({ label: "Weekly" }));
    expect(exemplar.label).toBe("Weekly");
  });

  it("never spreads or destructures the raw row - every field is a hand mapping", () => {
    // Pinned by reading the source rather than by behavior alone: a spread
    // would still pass the two tests above but would defeat the mapper
    // pattern this module's header commits to.
    const source = fs.readFileSync(path.resolve(__dirname, "announcement-exemplars.ts"), "utf-8");
    expect(source).not.toMatch(/\.\.\.\s*row\b/);
  });
});

// ============================================================================
// Filter pinning: this table is accessed exclusively through a SERVICE-ROLE
// client, which bypasses RLS entirely and leaves auth.uid() null (see the
// migration and this module's own header). So the explicit user_id filter
// each function applies is the ONLY tenant boundary that exists on the real
// path - one test per function, per this feature's brief. See
// src/lib/artifact-templates.ts's own history (a live cross-tenant delete
// with no owner filter, and an upsert that let a client-supplied id
// reassign another user's row) for why this is pinned by a test rather than
// trusted by inspection.
//
// Each of these was run against a sabotaged copy of
// src/lib/announcement-exemplars.ts (the relevant .eq("user_id", ...) call
// deleted, one function at a time) to confirm the matching test goes red
// before being trusted here. See this task's final report for the exact
// failures produced.
// ============================================================================

type RecordedCall = {
  table: string;
  op: string;
  filters: Array<[string, unknown]>;
  order?: [string, boolean];
  limit?: number;
  row?: unknown;
};

function fakeSupabase(resultRows: Row[]) {
  const calls: RecordedCall[] = [];

  function builder(table: string) {
    let current: RecordedCall | null = null;

    const chain = {
      select() {
        // select() after insert() is asking for the just-written row back,
        // not a new call - keep it attached to the insert's own record so
        // the filter/row bookkeeping for that one call stays together.
        if (current && current.op === "insert") {
          return chain;
        }
        current = { table, op: "select", filters: [] };
        calls.push(current);
        return chain;
      },
      insert(insertedRow: unknown) {
        current = { table, op: "insert", filters: [], row: insertedRow };
        calls.push(current);
        return chain;
      },
      delete() {
        current = { table, op: "delete", filters: [] };
        calls.push(current);
        return chain;
      },
      eq(column: string, value: unknown) {
        current?.filters.push([column, value]);
        return chain;
      },
      order(column: string, opts: { ascending: boolean }) {
        if (current) current.order = [column, opts.ascending];
        return chain;
      },
      limit(n: number) {
        if (current) current.limit = n;
        return chain;
      },
      maybeSingle() {
        return Promise.resolve({ data: resultRows[0] ?? null, error: null });
      },
      single() {
        return Promise.resolve({ data: resultRows[0] ?? null, error: null });
      },
      // list() has no terminal .single()/.maybeSingle() call, so the chain
      // itself must be thenable to be awaited directly.
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve({ data: resultRows, error: null }).then(resolve);
      },
    };
    return chain;
  }

  return { client: { from: (table: string) => builder(table) }, calls };
}

const COURSE_ID = "course-a";
const OTHER_USER = "user-b";

describe("listAnnouncementExemplars - owner scoping", () => {
  it("filters on user_id", async () => {
    const { client, calls } = fakeSupabase([]);

    await listAnnouncementExemplars(client as never, "user-a", COURSE_ID);

    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("select");
    const columns = calls[0].filters.map(([c]) => c);
    expect(columns).toContain("user_id");
    expect(calls[0].filters).toContainEqual(["user_id", "user-a"]);
    // Not just any user_id - THIS caller's, never one read out of anywhere else.
    expect(calls[0].filters).not.toContainEqual(["user_id", OTHER_USER]);
  });

  it("also filters on course_id", async () => {
    const { client, calls } = fakeSupabase([]);

    await listAnnouncementExemplars(client as never, "user-a", COURSE_ID);

    expect(calls[0].filters).toContainEqual(["course_id", COURSE_ID]);
  });
});

describe("getMostRecentAnnouncementExemplar - owner scoping and ordering", () => {
  it("filters on user_id", async () => {
    const { client, calls } = fakeSupabase([row()]);

    await getMostRecentAnnouncementExemplar(client as never, "user-a", COURSE_ID);

    expect(calls[0].filters).toContainEqual(["user_id", "user-a"]);
  });

  it("orders by created_at descending and limits to one - deriving 'most recent is the default'", async () => {
    const { client, calls } = fakeSupabase([row()]);

    await getMostRecentAnnouncementExemplar(client as never, "user-a", COURSE_ID);

    expect(calls[0].order).toEqual(["created_at", false]);
    expect(calls[0].limit).toBe(1);
  });

  it("returns null when nothing has been saved yet, rather than throwing", async () => {
    const { client } = fakeSupabase([]);

    const result = await getMostRecentAnnouncementExemplar(client as never, "user-a", COURSE_ID);

    expect(result).toBeNull();
  });
});

describe("saveAnnouncementExemplar - owner scoping and no upsert", () => {
  it("writes the server-derived userId into the inserted row's user_id", async () => {
    const { client, calls } = fakeSupabase([row({ user_id: "user-a" })]);

    await saveAnnouncementExemplar(client as never, "user-a", {
      courseId: COURSE_ID,
      exemplarText: "Some announcement text",
      outline: [] as unknown as Json,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("insert");
    expect((calls[0].row as Record<string, unknown>).user_id).toBe("user-a");
  });

  it("is a plain insert, never an upsert", async () => {
    const { client, calls } = fakeSupabase([row()]);

    await saveAnnouncementExemplar(client as never, "user-a", {
      courseId: COURSE_ID,
      exemplarText: "Some announcement text",
      outline: [] as unknown as Json,
    });

    expect(calls.map((c) => c.op)).toEqual(["insert"]);
  });

  it("defaults an omitted label to null", async () => {
    const { client, calls } = fakeSupabase([row()]);

    await saveAnnouncementExemplar(client as never, "user-a", {
      courseId: COURSE_ID,
      exemplarText: "Some announcement text",
      outline: [] as unknown as Json,
    });

    expect((calls[0].row as Record<string, unknown>).label).toBeNull();
  });
});

describe("deleteAnnouncementExemplar - owner scoping", () => {
  it("filters on BOTH the exemplar id and the calling user's id", async () => {
    const { client, calls } = fakeSupabase([]);

    await deleteAnnouncementExemplar(client as never, "user-a", "exemplar-1");

    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("delete");
    expect([...calls[0].filters].sort()).toEqual(
      [
        ["id", "exemplar-1"],
        ["user_id", "user-a"],
      ].sort()
    );
  });

  it("never issues a delete filtered on the id alone", async () => {
    const { client, calls } = fakeSupabase([]);

    await deleteAnnouncementExemplar(client as never, "user-a", "exemplar-1");

    const columns = calls[0].filters.map(([column]) => column);
    expect(columns).toContain("user_id");
  });
});

describe("no function in this module ever calls .upsert()", () => {
  it("has no .upsert( in its CODE (comments mentioning .upsert() by name, to explain why this table never needs one, are expected and excluded)", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "announcement-exemplars.ts"), "utf-8");
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "") // block and JSDoc comments
      .replace(/\/\/.*$/gm, ""); // line comments
    expect(withoutComments).not.toMatch(/\.upsert\(/);
  });
});
