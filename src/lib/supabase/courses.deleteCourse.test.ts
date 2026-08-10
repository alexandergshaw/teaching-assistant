// Executes deleteCourse's pre-cascade Storage sweep (AC6 item 31,
// docs/task-cell-attachments-acceptance-criteria.md) against a hand-built
// fake of the SERVICE client createServiceClient() resolves to.
//
// deleteCourse calls createServiceClient() directly - once itself, and again
// inside courses.ts's own table() helper - rather than taking a client as an
// argument, so getting a fake into it means mocking the "./server" module it
// imports createServiceClient from. This is the same vi.mock("@/lib/supabase
// /server", ...) idiom already used throughout src/app/actions/*.test.ts
// (e.g. automation-runs.test.ts), just against the RELATIVE specifier
// courses.ts itself uses - and it works cleanly: no network, no real
// Supabase, table()'s second createServiceClient() call resolves to the same
// mocked instance as the first because vi.fn().mockReturnValue always
// returns the same object.
//
// The point of the fix under test: deleting the ROWS first would destroy the
// only record of which Storage objects existed, orphaning them invisibly and
// permanently the instant the FK cascade ran. So what matters here is ORDER
// (storage removal before the row delete, not merely that both happened) and
// that a failed removal THROWS rather than letting the delete proceed.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./server", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "./server";
import { deleteCourse } from "./courses";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

type FakeError = { message: string } | null;

interface FakeServiceClientOptions {
  /** storage_path values the course_task_attachments sweep should find. A
   * single page is enough here - the pagination loop itself is
   * course-task-attachments.test.ts's job, not this file's. */
  attachmentPaths?: string[];
  removeError?: FakeError;
  deleteError?: FakeError;
}

function makeFakeServiceClient(opts: FakeServiceClientOptions = {}) {
  const calls: string[] = [];
  const removeArgs: string[][] = [];
  const buckets: string[] = [];
  const deleteEq: [string, unknown][] = [];
  const attachmentPaths = opts.attachmentPaths ?? [];

  const client = {
    from: (table: string) => {
      if (table === "course_task_attachments") {
        // Mirrors listTaskAttachmentStoragePathsForCourse's own chain:
        // .select("storage_path").eq(user_id).eq(course_id).order(...).range(...)
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  range: (from: number, to: number) => {
                    calls.push("attachments.range");
                    const page = attachmentPaths.slice(from, to + 1).map((storage_path) => ({ storage_path }));
                    return Promise.resolve({ data: page, error: null });
                  },
                }),
              }),
            }),
          }),
        };
      }
      if (table === "course_hub") {
        return {
          delete: () => ({
            eq: (col1: string, val1: unknown) => ({
              eq: (col2: string, val2: unknown) => {
                calls.push("row.delete");
                deleteEq.push([col1, val1], [col2, val2]);
                return Promise.resolve({ error: opts.deleteError ?? null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table in fake client: ${table}`);
    },
    storage: {
      // Records the bucket too: the sweep must reach `course-files`, the
      // bucket the upload path actually writes into. A sweep of the wrong
      // bucket would remove nothing and still report success.
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          calls.push("storage.remove");
          buckets.push(bucket);
          removeArgs.push(paths);
          return Promise.resolve({ error: opts.removeError ?? null });
        },
      }),
    },
  };

  return {
    client: client as unknown as SupabaseClient<Database>,
    calls,
    removeArgs,
    buckets,
    deleteEq,
  };
}

describe("deleteCourse: Storage sweep before row delete (AC6 item 31)", () => {
  beforeEach(() => {
    vi.mocked(createServiceClient).mockReset();
  });

  it("removes the storage objects BEFORE the row delete - asserted on call ORDER, not just that both happened", async () => {
    const fake = makeFakeServiceClient({ attachmentPaths: ["user-1/course-1/task-attachments/a.pdf"] });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await deleteCourse("user-1", "course-1");

    const removeIdx = fake.calls.indexOf("storage.remove");
    const deleteIdx = fake.calls.indexOf("row.delete");
    expect(removeIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThan(removeIdx);
    expect(fake.removeArgs[0]).toEqual(["user-1/course-1/task-attachments/a.pdf"]);
    // The sweep must hit the bucket the upload path actually writes into -
    // sweeping the wrong bucket removes nothing and still reports success.
    expect(fake.buckets).toEqual(["course-files"]);
  });

  it("throws when the storage removal errors, and NEVER calls the row delete - a rows-first delete would orphan the objects invisibly and permanently", async () => {
    const fake = makeFakeServiceClient({
      attachmentPaths: ["user-1/course-1/task-attachments/a.pdf"],
      removeError: { message: "network blip" },
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await expect(deleteCourse("user-1", "course-1")).rejects.toThrow("network blip");
    expect(fake.calls).not.toContain("row.delete");
  });

  it("with no attachments, makes no storage call at all, and still deletes the row", async () => {
    const fake = makeFakeServiceClient({ attachmentPaths: [] });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await deleteCourse("user-1", "course-1");

    expect(fake.calls).not.toContain("storage.remove");
    expect(fake.calls).toContain("row.delete");
  });

  it("scopes the row delete to both user_id and id", async () => {
    const fake = makeFakeServiceClient({ attachmentPaths: [] });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await deleteCourse("user-7", "course-42");

    expect(fake.deleteEq).toContainEqual(["user_id", "user-7"]);
    expect(fake.deleteEq).toContainEqual(["id", "course-42"]);
  });
});
