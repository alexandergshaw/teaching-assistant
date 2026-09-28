// Executes the pagination loop in listTaskAttachments and
// listTaskAttachmentStoragePathsForCourse against a hand-built fake Supabase
// client - see docs/task-cell-attachments-acceptance-criteria.md AC4 item 19
// and AC6 item 31. taskCellAttachments.wiring.test.ts (same feature) only
// reads this module's SOURCE TEXT (asserts `.range(` and `while (` appear) -
// a loop that pages correctly and a loop that silently truncates read
// identically to that scan. This file is what actually RUNS the loop.
//
// PAGE_SIZE is not exported by course-task-attachments.ts (deliberately kept
// internal - see that module's own comment on the constant), so this file
// derives it once from the implementation's own first `.range()` call rather
// than hardcoding 500 into every fixture below: the very first request is
// always `(0, PAGE_SIZE - 1)` regardless of how many rows the fixture holds,
// so an empty fixture is enough to read it back and stays correct even if
// PAGE_SIZE is ever retuned.
import { describe, it, expect, beforeAll } from "vitest";
import {
  listTaskAttachments,
  listTaskAttachmentStoragePathsForCourse,
  mapTaskAttachment,
  createTaskAttachmentRow,
  taskAttachmentStorageSweep,
} from "./course-task-attachments";
import { indexTaskAttachments, taskAttachmentsAt } from "@/lib/course-task-attachments";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// ---------------------------------------------------------------------------
// Fake client: fakes exactly the chain both functions call -
// .from(table).select(cols).eq(...)[.eq(...)].order(col, opts).range(from, to)
// - eq() is chainable any number of times, since listTaskAttachments uses one
// (user_id) and listTaskAttachmentStoragePathsForCourse uses two (user_id,
// course_id). Every call is recorded so tests can assert not just the rows
// handed back but the exact query shape asked for.
// ---------------------------------------------------------------------------

interface RangeCall {
  from: number;
  to: number;
}

interface FakeAttachmentsClientOptions<Row> {
  rows: Row[];
  /** 0-indexed request number (0 = the first `.range()` call) that should
   * return an error instead of a page, so a specific later page can be made
   * to fail without disturbing earlier ones. */
  errorOnRequest?: number;
  errorMessage?: string;
}

function makeFakeAttachmentsClient<Row>(opts: FakeAttachmentsClientOptions<Row>) {
  const calls = {
    from: [] as string[],
    selectColumns: [] as string[],
    eq: [] as [string, unknown][],
    order: [] as [string, unknown][],
    range: [] as RangeCall[],
  };
  let requestCount = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function eqChain(): any {
    return {
      eq: (col: string, val: unknown) => {
        calls.eq.push([col, val]);
        return eqChain();
      },
      order: (col: string, orderOpts: unknown) => {
        calls.order.push([col, orderOpts]);
        return {
          range: (from: number, to: number) => {
            calls.range.push({ from, to });
            const requestIndex = requestCount++;
            if (opts.errorOnRequest !== undefined && requestIndex === opts.errorOnRequest) {
              return Promise.resolve({ data: null, error: { message: opts.errorMessage ?? "boom" } });
            }
            return Promise.resolve({ data: opts.rows.slice(from, to + 1), error: null });
          },
        };
      },
    };
  }

  const client = {
    from: (table: string) => {
      calls.from.push(table);
      return {
        select: (cols: string) => {
          calls.selectColumns.push(cols);
          return eqChain();
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, calls };
}

// One fixture row shape wide enough to serve both readers: the full-column
// read (listTaskAttachments) and the storage_path-only read
// (listTaskAttachmentStoragePathsForCourse, which just ignores the extra
// fields - it only reads row.storage_path off whatever comes back).
interface FixtureRow {
  id: string;
  course_id: string;
  task_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  storage_path: string;
  created_at: string;
}

function buildRows(count: number, courseId = "course-1"): FixtureRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `att-${String(i).padStart(5, "0")}`,
    course_id: courseId,
    task_id: "syllabus-uploaded",
    file_name: `file-${i}.txt`,
    mime_type: "text/plain",
    size_bytes: 10,
    storage_path: `user-1/${courseId}/task-attachments/att-${i}.txt`,
    created_at: "2026-01-01T00:00:00Z",
  }));
}

let PAGE_SIZE: number;

beforeAll(async () => {
  const { client, calls } = makeFakeAttachmentsClient<FixtureRow>({ rows: [] });
  await listTaskAttachments(client, "probe-user");
  PAGE_SIZE = calls.range[0].to - calls.range[0].from + 1;
  expect(PAGE_SIZE).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// A. listTaskAttachments - the pagination loop
// ---------------------------------------------------------------------------

describe("listTaskAttachments: pagination loop", () => {
  it("fewer rows than one page: exactly one request, every row returned, loop stops", async () => {
    const rows = buildRows(3);
    const { client, calls } = makeFakeAttachmentsClient<FixtureRow>({ rows });

    const result = await listTaskAttachments(client, "user-1");

    expect(calls.range).toHaveLength(1);
    expect(result.map((a) => a.id)).toEqual(rows.map((r) => r.id));
  });

  it("off-by-one: exactly PAGE_SIZE rows forces a SECOND request, which comes back empty and stops the loop", async () => {
    // The off-by-one this guards: a naive `if (page.length <= PAGE_SIZE) break`
    // (or any variant that treats a FULL page as "no more") would stop right
    // here and never notice a user could have more rows sitting past the
    // first page - exactly the truncation AC4 item 19 exists to prevent.
    const rows = buildRows(PAGE_SIZE);
    const { client, calls } = makeFakeAttachmentsClient<FixtureRow>({ rows });

    const result = await listTaskAttachments(client, "user-1");

    expect(calls.range).toHaveLength(2);
    expect(calls.range[1]).toEqual({ from: PAGE_SIZE, to: 2 * PAGE_SIZE - 1 });
    expect(result).toHaveLength(PAGE_SIZE);
  });

  it("more than one page: every row returned in order, and the ranges requested are exactly the two full-page windows", async () => {
    const rows = buildRows(PAGE_SIZE + 7);
    const { client, calls } = makeFakeAttachmentsClient<FixtureRow>({ rows });

    const result = await listTaskAttachments(client, "user-1");

    expect(calls.range).toEqual([
      { from: 0, to: PAGE_SIZE - 1 },
      { from: PAGE_SIZE, to: 2 * PAGE_SIZE - 1 },
    ]);
    expect(result.map((a) => a.id)).toEqual(rows.map((r) => r.id));
  });

  it("two full pages then a short one: all three pages accumulate", async () => {
    const rows = buildRows(2 * PAGE_SIZE + 3);
    const { client, calls } = makeFakeAttachmentsClient<FixtureRow>({ rows });

    const result = await listTaskAttachments(client, "user-1");

    expect(calls.range).toHaveLength(3);
    expect(result).toHaveLength(rows.length);
    expect(result.map((a) => a.id)).toEqual(rows.map((r) => r.id));
  });

  it("zero rows: returns [] from exactly one request", async () => {
    const { client, calls } = makeFakeAttachmentsClient<FixtureRow>({ rows: [] });

    const result = await listTaskAttachments(client, "user-1");

    expect(result).toEqual([]);
    expect(calls.range).toHaveLength(1);
  });

  it("filters by the user id it was given", async () => {
    const { client, calls } = makeFakeAttachmentsClient<FixtureRow>({ rows: [] });
    await listTaskAttachments(client, "user-42");
    expect(calls.eq).toContainEqual(["user_id", "user-42"]);
  });

  it("orders by created_at ascending - the client-side index relies on this order", async () => {
    const { client, calls } = makeFakeAttachmentsClient<FixtureRow>({ rows: [] });
    await listTaskAttachments(client, "user-1");
    expect(calls.order).toContainEqual(["created_at", { ascending: true }]);
  });

  it("a Supabase error on the SECOND page throws with that error's message, not a silent partial list", async () => {
    // Deliberately on the second page rather than the first: an
    // implementation that only checks the FIRST page's error (e.g. an error
    // check placed before the loop, or one that swallows an error from a
    // later iteration) would pass a first-page-only version of this test and
    // still silently lose data from a real user with more than one page.
    const rows = buildRows(PAGE_SIZE);
    const { client } = makeFakeAttachmentsClient<FixtureRow>({
      rows,
      errorOnRequest: 1,
      errorMessage: "second page boom",
    });

    await expect(listTaskAttachments(client, "user-1")).rejects.toThrow("second page boom");
  });
});

// ---------------------------------------------------------------------------
// B. mapTaskAttachment
// ---------------------------------------------------------------------------

describe("mapTaskAttachment", () => {
  function row(overrides: Partial<FixtureRow> = {}): FixtureRow {
    return {
      id: "att-1",
      course_id: "course-1",
      task_id: "syllabus-uploaded",
      file_name: "Syllabus.pdf",
      mime_type: "application/pdf",
      size_bytes: 4096,
      storage_path: "user-1/course-1/task-attachments/att-1.pdf",
      created_at: "2026-08-01T00:00:00Z",
      ...overrides,
    };
  }

  it("maps every snake_case column to its camelCase field, with the right types", () => {
    expect(mapTaskAttachment(row())).toEqual({
      id: "att-1",
      courseId: "course-1",
      taskId: "syllabus-uploaded",
      fileName: "Syllabus.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      storagePath: "user-1/course-1/task-attachments/att-1.pdf",
      createdAt: "2026-08-01T00:00:00Z",
    });
  });

  it('a null mime_type survives as null - not the string "null" and not undefined', () => {
    const mapped = mapTaskAttachment(row({ mime_type: null }));
    expect(mapped.mimeType).toBeNull();
    expect(mapped.mimeType).not.toBe("null");
    expect(mapped.mimeType).not.toBeUndefined();
  });

  it("its output satisfies what indexTaskAttachments/taskAttachmentsAt expect - the join between the two modules, untested until now", () => {
    const mapped = mapTaskAttachment(row());
    const index = indexTaskAttachments([mapped]);
    expect(taskAttachmentsAt(index, mapped.courseId, mapped.taskId)).toEqual([mapped]);
    // A cell that was never populated must still read back as [], not throw
    // or return undefined - taskAttachmentsAt's own "absence reads as empty"
    // contract, exercised here against a REAL mapped row's courseId/taskId
    // rather than a hand-typed one.
    expect(taskAttachmentsAt(index, mapped.courseId, "some-other-task")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C. listTaskAttachmentStoragePathsForCourse
// ---------------------------------------------------------------------------

describe("listTaskAttachmentStoragePathsForCourse", () => {
  it("returns just the storage paths, filtered by both user id and course id", async () => {
    const rows = buildRows(3, "course-9");
    const { client, calls } = makeFakeAttachmentsClient<FixtureRow>({ rows });

    const paths = await listTaskAttachmentStoragePathsForCourse(client, "user-1", "course-9");

    expect(paths).toEqual(rows.map((r) => r.storage_path));
    expect(calls.eq).toContainEqual(["user_id", "user-1"]);
    expect(calls.eq).toContainEqual(["course_id", "course-9"]);
  });

  it("paginates the same way as listTaskAttachments - a course with more than one page of attachments must have every object swept", async () => {
    // Left unswept, these would be orphaned in Storage forever: deleteCourse
    // (src/lib/supabase/courses.ts) uses exactly this list to know what to
    // remove before the row delete cascades the metadata rows away, so a
    // truncated read here means a truncated delete there.
    const rows = buildRows(PAGE_SIZE + 7, "course-9");
    const { client, calls } = makeFakeAttachmentsClient<FixtureRow>({ rows });

    const paths = await listTaskAttachmentStoragePathsForCourse(client, "user-1", "course-9");

    expect(calls.range).toEqual([
      { from: 0, to: PAGE_SIZE - 1 },
      { from: PAGE_SIZE, to: 2 * PAGE_SIZE - 1 },
    ]);
    expect(paths).toEqual(rows.map((r) => r.storage_path));
  });
});

// ---------------------------------------------------------------------------
// D. createTaskAttachmentRow - RULING 127, Finding 1 (the write half).
//
// docs/service-role-predicate-audit.md Finding 1: before this fix,
// `input.storagePath` was checked for non-emptiness only, so a caller could
// register a victim's own object path against their own task cell. The
// RED/GREEN pair below is that exact defect: the "before" behaviour
// (documented, not re-run - this file only ever exercises the current
// source) would have resolved and inserted a row for a victim-prefixed path;
// the fix refuses it outright, with no database call at all.
// ---------------------------------------------------------------------------

function makeInsertFakeClient(insertResponse: { data: unknown; error: unknown }) {
  const calls: RecordedCall[] = [];
  interface RecordedCall {
    method: string;
    args: unknown[];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    insert: (...args: unknown[]) => {
      calls.push({ method: "insert", args });
      return chain;
    },
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return chain;
    },
    single: () => {
      calls.push({ method: "single", args: [] });
      return Promise.resolve(insertResponse);
    },
  };
  const client = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe("createTaskAttachmentRow: storagePath is validated before any database call (RULING 127, Finding 1)", () => {
  it.each([
    ["a different user entirely", "victim-user/course-9/materials.zip"],
    ["a prefix that merely starts with userId rather than equalling it", "user-12/course-9/materials.zip"],
    ["a traversal segment walking back out of the caller's own prefix", "user-1/course-1/../../victim-user/x.pdf"],
    ["nothing after the userId segment", "user-1"],
  ])("refuses a storagePath belonging to %s, making NO database call at all", async (_label, storagePath) => {
    const { client, calls } = makeInsertFakeClient({ data: null, error: null });

    await expect(
      createTaskAttachmentRow(client, "user-1", {
        id: "attach-new",
        courseId: "course-1",
        taskId: "task-1",
        fileName: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 10,
        storagePath,
      })
    ).rejects.toThrow();

    expect(calls).toEqual([]);
  });

  it("accepts a path under the caller's own prefix and proceeds to insert (positive control)", async () => {
    const insertedRow = {
      id: "attach-new",
      course_id: "course-1",
      task_id: "task-1",
      file_name: "notes.txt",
      mime_type: "text/plain",
      size_bytes: 10,
      storage_path: "user-1/course-1/task-attachments/attach-new.txt",
      created_at: "2026-08-01T00:00:00Z",
    };
    const { client, calls } = makeInsertFakeClient({ data: insertedRow, error: null });

    const attachment = await createTaskAttachmentRow(client, "user-1", {
      id: "attach-new",
      courseId: "course-1",
      taskId: "task-1",
      fileName: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 10,
      storagePath: "user-1/course-1/task-attachments/attach-new.txt",
    });

    expect(attachment.id).toBe("attach-new");
    expect(calls.some((c) => c.method === "insert")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E. taskAttachmentStorageSweep.remove - RULING 127, Finding 1 (PC3, the
// sink half - defence in depth alongside createTaskAttachmentRow above).
// ---------------------------------------------------------------------------

function makeStorageSweepFakeClient(removeResponse: { error: unknown } = { error: null }) {
  const removeArgs: string[][] = [];
  const client = {
    storage: {
      from: () => ({
        remove: (paths: string[]) => {
          removeArgs.push(paths);
          return Promise.resolve(removeResponse);
        },
      }),
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, removeArgs };
}

describe("taskAttachmentStorageSweep.remove: every path is checked against the caller's own prefix before any remove() call (RULING 127, Finding 1 PC3)", () => {
  it("throws and makes NO remove() call when even one path is outside the caller's own prefix - mixed batch", async () => {
    const { client, removeArgs } = makeStorageSweepFakeClient();

    await expect(
      taskAttachmentStorageSweep.remove(client, "user-1", [
        "user-1/course-1/task-attachments/a.pdf",
        "victim-user/course-1/task-attachments/b.pdf",
      ])
    ).rejects.toThrow();

    expect(removeArgs).toEqual([]);
  });

  it("throws on a lone out-of-prefix path", async () => {
    const { client, removeArgs } = makeStorageSweepFakeClient();

    await expect(
      taskAttachmentStorageSweep.remove(client, "user-1", ["victim-user/course-1/task-attachments/b.pdf"])
    ).rejects.toThrow();

    expect(removeArgs).toEqual([]);
  });

  it("removes a batch of paths that are ALL the caller's own (positive control) - a course delete must still sweep the caller's real attachments", async () => {
    const { client, removeArgs } = makeStorageSweepFakeClient();
    const ownPaths = ["user-1/course-1/task-attachments/a.pdf", "user-1/course-1/task-attachments/b.pdf"];

    await taskAttachmentStorageSweep.remove(client, "user-1", ownPaths);

    expect(removeArgs).toEqual([ownPaths]);
  });

  it("makes no call at all for an empty array", async () => {
    const { client, removeArgs } = makeStorageSweepFakeClient();

    await taskAttachmentStorageSweep.remove(client, "user-1", []);

    expect(removeArgs).toEqual([]);
  });
});
