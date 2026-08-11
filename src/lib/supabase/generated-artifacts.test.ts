// Every function under test here takes an injected SupabaseClient<Database>
// (Pattern B - see this module's own header comment), so there is no
// internal Supabase import to intercept with vi.mock. Instead a small
// in-memory fake client is built below and passed in directly - the same
// dependency-injection approach fakeSupabase() uses in
// src/lib/deck-templates.test.ts. Every fake .from() call is a vi.fn spy
// (`from`), asserted on in at least one test, so an inert mock that never
// wires up would fail loudly rather than passing for the wrong reason.
import { describe, it, expect, vi } from "vitest";
import {
  mapGeneratedArtifact,
  saveGeneratedArtifactVersion,
  listGeneratedArtifactVersions,
  getCurrentGeneratedArtifact,
} from "./generated-artifacts";
import type { Database, Json } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Database["public"]["Tables"]["generated_artifacts"]["Row"];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "row-1",
    user_id: "user-1",
    course_id: "course-1",
    kind: "anticipated-qa",
    version: 1,
    is_current: true,
    title: null,
    text: "generated text",
    structured: null,
    prompt: "generate anticipated Q&A for week 3",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("mapGeneratedArtifact", () => {
  it("maps every column to its camelCase field", () => {
    const mapped = mapGeneratedArtifact(
      row({ title: "Week 3 Announcement", structured: { slides: [] } as unknown as Json })
    );
    expect(mapped).toEqual({
      id: "row-1",
      courseId: "course-1",
      kind: "anticipated-qa",
      version: 1,
      isCurrent: true,
      title: "Week 3 Announcement",
      text: "generated text",
      structured: { slides: [] },
      prompt: "generate anticipated Q&A for week 3",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("a null structured column maps to a null structured field", () => {
    expect(mapGeneratedArtifact(row({ structured: null })).structured).toBeNull();
  });
});

/**
 * Minimal in-memory stand-in for the query shapes generated-artifacts.ts
 * actually issues:
 *   - select("*").eq(...)*                      (awaited directly, no
 *                                                 terminal call - the real
 *                                                 postgrest builder is
 *                                                 itself a thenable, so
 *                                                 this fake implements
 *                                                 .then() too)
 *   - update(patch).eq(...)*                     (awaited directly)
 *   - insert(row).select("*").single()
 *
 * Filters are threaded through closures rather than mutated in place, so
 * branching a chain (calling .eq() twice from the same base) can never leak
 * filters across branches.
 */
function makeFakeClient(initialRows: Row[] = []) {
  let rows: Row[] = [...initialRows];
  let serial = rows.length;

  function matchesAll(candidate: Row, filters: Array<[string, unknown]>): boolean {
    return filters.every(([col, val]) => (candidate as unknown as Record<string, unknown>)[col] === val);
  }

  function selectChain(filters: Array<[string, unknown]>): PromiseLike<{ data: Row[]; error: null }> & {
    eq: (col: string, val: unknown) => ReturnType<typeof selectChain>;
  } {
    return {
      eq(col: string, val: unknown) {
        return selectChain([...filters, [col, val]]);
      },
      then(onFulfilled, onRejected) {
        const data = rows.filter((r) => matchesAll(r, filters));
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      },
    };
  }

  function updateChain(
    patch: Record<string, unknown>,
    filters: Array<[string, unknown]>
  ): PromiseLike<{ error: null }> & { eq: (col: string, val: unknown) => ReturnType<typeof updateChain> } {
    return {
      eq(col: string, val: unknown) {
        return updateChain(patch, [...filters, [col, val]]);
      },
      then(onFulfilled, onRejected) {
        rows = rows.map((r) => (matchesAll(r, filters) ? { ...r, ...(patch as Partial<Row>) } : r));
        return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
      },
    };
  }

  function insertChain(insertedRow: Record<string, unknown>) {
    return {
      select() {
        return {
          single() {
            const full: Row = row({
              id: `row-${++serial}`,
              created_at: "2026-02-01T00:00:00.000Z",
              updated_at: "2026-02-01T00:00:00.000Z",
              ...(insertedRow as Partial<Row>),
            });
            rows.push(full);
            return Promise.resolve({ data: full, error: null });
          },
        };
      },
    };
  }

  const from = vi.fn((table: string) => {
    if (table !== "generated_artifacts") {
      throw new Error(`fake client asked for unexpected table: ${table}`);
    }
    return {
      select() {
        return selectChain([]);
      },
      update(patch: Record<string, unknown>) {
        return updateChain(patch, []);
      },
      insert(insertedRow: Record<string, unknown>) {
        return insertChain(insertedRow);
      },
    };
  });

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    getRows: () => rows,
  };
}

describe("saveGeneratedArtifactVersion", () => {
  it("the first version of a kind is 1", async () => {
    const { client, from } = makeFakeClient();
    const saved = await saveGeneratedArtifactVersion(client, "user-1", {
      courseId: "course-1",
      kind: "anticipated-qa",
      text: "v1 text",
      prompt: "v1 prompt",
    });
    expect(saved.version).toBe(1);
    expect(saved.isCurrent).toBe(true);
    expect(from).toHaveBeenCalledWith("generated_artifacts");
  });

  it("the next version is previous+1 for the same course+kind", async () => {
    const { client } = makeFakeClient([row({ id: "row-1", version: 1, is_current: true })]);
    const saved = await saveGeneratedArtifactVersion(client, "user-1", {
      courseId: "course-1",
      kind: "anticipated-qa",
      text: "v2 text",
      prompt: "v2 prompt",
    });
    expect(saved.version).toBe(2);
  });

  it("kinds do not share a counter - a different kind in the same course starts back at 1", async () => {
    const { client } = makeFakeClient([
      row({ id: "row-1", kind: "anticipated-qa", version: 1, is_current: true }),
      row({ id: "row-2", kind: "anticipated-qa", version: 2, is_current: false }),
    ]);
    const saved = await saveGeneratedArtifactVersion(client, "user-1", {
      courseId: "course-1",
      kind: "current-events",
      text: "current events v1",
      prompt: "current events prompt",
    });
    expect(saved.version).toBe(1);
  });

  it("saving supersedes the prior current row and leaves it present", async () => {
    const { client, getRows } = makeFakeClient([row({ id: "row-1", version: 1, is_current: true })]);
    await saveGeneratedArtifactVersion(client, "user-1", {
      courseId: "course-1",
      kind: "anticipated-qa",
      text: "v2 text",
      prompt: "v2 prompt",
    });

    const allRows = getRows();
    expect(allRows).toHaveLength(2);
    const previous = allRows.find((r) => r.id === "row-1");
    const latest = allRows.find((r) => r.id !== "row-1");
    expect(previous?.is_current).toBe(false);
    expect(previous?.version).toBe(1);
    expect(latest?.is_current).toBe(true);
    expect(latest?.version).toBe(2);
  });

  it("structured round-trips as null when omitted", async () => {
    const { client } = makeFakeClient();
    const saved = await saveGeneratedArtifactVersion(client, "user-1", {
      courseId: "course-1",
      kind: "sample-answers",
      text: "sample answers text",
      prompt: "sample answers prompt",
    });
    expect(saved.structured).toBeNull();
  });

  it("structured round-trips as an object when provided", async () => {
    const structured = { slides: [{ title: "Intro" }] } as unknown as Json;
    const { client } = makeFakeClient();
    const saved = await saveGeneratedArtifactVersion(client, "user-1", {
      courseId: "course-1",
      kind: "deck",
      text: "deck preview text",
      prompt: "deck prompt",
      structured,
    });
    expect(saved.structured).toEqual({ slides: [{ title: "Intro" }] });
  });
});

describe("listGeneratedArtifactVersions", () => {
  it("returns newest-first", async () => {
    const { client } = makeFakeClient([
      row({ id: "row-1", version: 1, is_current: false }),
      row({ id: "row-3", version: 3, is_current: true }),
      row({ id: "row-2", version: 2, is_current: false }),
    ]);
    const versions = await listGeneratedArtifactVersions(client, "user-1", "course-1", "anticipated-qa");
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it("scopes to the given course and kind only", async () => {
    const { client } = makeFakeClient([
      row({ id: "row-1", course_id: "course-1", kind: "anticipated-qa", version: 1 }),
      row({ id: "row-2", course_id: "course-2", kind: "anticipated-qa", version: 1 }),
      row({ id: "row-3", course_id: "course-1", kind: "current-events", version: 1 }),
    ]);
    const versions = await listGeneratedArtifactVersions(client, "user-1", "course-1", "anticipated-qa");
    expect(versions).toHaveLength(1);
    expect(versions[0].id).toBe("row-1");
  });
});

describe("getCurrentGeneratedArtifact", () => {
  it("returns the row flagged current", async () => {
    const { client } = makeFakeClient([
      row({ id: "row-1", version: 1, is_current: false }),
      row({ id: "row-2", version: 2, is_current: true }),
    ]);
    const current = await getCurrentGeneratedArtifact(client, "user-1", "course-1", "anticipated-qa");
    expect(current?.id).toBe("row-2");
  });

  it("returns null when nothing has been generated yet", async () => {
    const { client } = makeFakeClient([]);
    const current = await getCurrentGeneratedArtifact(client, "user-1", "course-1", "anticipated-qa");
    expect(current).toBeNull();
  });
});
