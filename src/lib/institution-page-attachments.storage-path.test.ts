// Split out of institution-page-attachments.test.ts (which was pushed past
// the project's 1000-line cap by these additions) rather than grown inline -
// see that file's own note at insertInstitutionPageAttachmentRow and
// uploadInstitutionPageAttachment's cap-enforcement describe block.
//
// Regression-pass finding this covers: storagePath reaches
// insertInstitutionPageAttachmentRow as browser-supplied metadata (the
// browser already wrote the object to Storage before this row is recorded -
// see uploadInstitutionPageAttachmentAction), and once recorded it is read
// back by getInstitutionPageAttachmentUrlAction and
// deleteInstitutionPageAttachmentAction, both against createServiceClient()
// (src/lib/supabase/server.ts), which bypasses RLS entirely. An unvalidated
// path would let a malformed or hostile call make either of those reach any
// object in the "institution-attachments" bucket, not just the page's own.
// isInstitutionAttachmentStoragePath (checked inside
// insertInstitutionPageAttachmentRow, before any database call) closes that.
//
// Also covers the sizeBytes <= 0 floor uploadInstitutionPageAttachment
// gained for consistency with uploadTaskAttachment's own floor
// (src/lib/course-task-attachments.ts) - a 0-byte file used to upload and
// record successfully.
import { describe, it, expect } from "vitest";
import {
  insertInstitutionPageAttachmentRow,
  uploadInstitutionPageAttachment,
  buildAttachmentStoragePath,
  emptyAttachmentMessage,
  isInstitutionAttachmentStoragePath,
  type InstitutionPageAttachment,
} from "./institution-page-attachments";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

interface RecordedCall {
  method: string;
  args: unknown[];
}

/** Minimal fake covering exactly the chain insertInstitutionPageAttachmentRow
 * calls (count-select then insert), recording every call so a guard that
 * fails open is visible as a non-empty `calls` array, not just a caught
 * throw - the throw alone would not distinguish the real guard from a
 * fake that happens to also throw. */
function makeSupabase() {
  const calls: RecordedCall[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return chain;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return chain;
    },
    insert: (...args: unknown[]) => {
      calls.push({ method: "insert", args });
      return chain;
    },
    single: () => {
      calls.push({ method: "single", args: [] });
      return Promise.resolve({
        data: {
          id: "attach-new",
          page_id: "page-1",
          user_id: "user-1",
          file_name: "notes.txt",
          mime_type: "text/plain",
          size_bytes: 10,
          storage_path: "user-1/page-1/attach-new.txt",
          created_at: "2026-08-01T00:00:00Z",
        },
        error: null,
      });
    },
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null, count: 0 }).then(resolve, reject),
  };
  const client = {
    from: (tableName: string) => {
      calls.push({ method: "from", args: [tableName] });
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe("insertInstitutionPageAttachmentRow: storagePath is validated before any database call", () => {
  it.each([
    ["outside userId/pageId's own prefix entirely", "user-1/course-9/materials.zip"],
    ["a different page under the same user", "user-1/page-2/attach-new.txt"],
    ["a different user entirely", "user-2/page-1/attach-new.txt"],
    ["nothing after the prefix", "user-1/page-1/"],
    // RULING 128 - the traversal hole the bare prefix check let through: this
    // starts with "user-1/page-1/" and is longer than it, so the OLD
    // startsWith-only check accepted it. See this file's RED/GREEN block
    // below for the same case verified against the actually-reverted source.
    ["a traversal segment walking back out to a victim's own prefix", "user-1/page-1/../../user-2/x.pdf"],
  ])("refuses a storagePath belonging to %s, making NO database call at all", async (_label, storagePath) => {
    const { client, calls } = makeSupabase();

    await expect(
      insertInstitutionPageAttachmentRow(client, "user-1", "page-1", {
        id: "attach-new",
        fileName: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 10,
        storagePath,
      })
    ).rejects.toThrow();

    expect(calls).toEqual([]);
  });

  it("accepts exactly what buildAttachmentStoragePath produces, and proceeds to the count query", async () => {
    const { client, calls } = makeSupabase();
    const storagePath = buildAttachmentStoragePath("user-1", "page-1", "attach-new", "notes.txt");

    await insertInstitutionPageAttachmentRow(client, "user-1", "page-1", {
      id: "attach-new",
      fileName: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 10,
      storagePath,
    });

    expect(calls.some((c) => c.method === "from")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isInstitutionAttachmentStoragePath, unit-tested directly (RULING 128).
//
// Mirrors the shape of the sibling course-files.test.ts coverage for
// isOwnCourseFilesStoragePath (RULING 127): the traversal case is the
// defect this ruling closes; the rest are the sibling shapes the shipped
// "course-files" validator already handles, checked here against this
// module's own (two-segment-prefix) validator so the two dialects agree on
// substance even though their prefixes differ in shape. Each case below
// says in its own label whether the OLD (bare startsWith) check already
// refused it or whether this is newly refused - see docs/ruling-128.md for
// the same claim made in prose, reconciled against this table.
// ---------------------------------------------------------------------------
describe("isInstitutionAttachmentStoragePath", () => {
  it("accepts a legitimate userId/pageId/file path - ALREADY accepted, still accepted", () => {
    expect(isInstitutionAttachmentStoragePath("user-1", "page-1", "user-1/page-1/attach-1.txt")).toBe(true);
  });

  it("accepts a legitimate userId/pageId/file path with no extension - ALREADY accepted, still accepted", () => {
    expect(isInstitutionAttachmentStoragePath("user-1", "page-1", "user-1/page-1/attach-1")).toBe(true);
  });

  it("accepts a path with an extra segment after the fixed prefix - deeper nesting is not produced by buildAttachmentStoragePath today, but nothing in this module forbids it and the reference validator (isOwnCourseFilesStoragePath) does not cap depth after its own fixed segment either", () => {
    expect(isInstitutionAttachmentStoragePath("user-1", "page-1", "user-1/page-1/sub/attach-1.txt")).toBe(true);
  });

  it("refuses a `..` traversal segment walking back out of the prefix - NEWLY refused (this ruling's own fix; the old bare startsWith check accepted this)", () => {
    expect(isInstitutionAttachmentStoragePath("user-1", "page-1", "user-1/page-1/../../user-2/x.pdf")).toBe(false);
  });

  it("refuses an empty segment (a doubled slash) - NEWLY refused (the old check accepted it: it still starts with the prefix and is longer than it)", () => {
    expect(isInstitutionAttachmentStoragePath("user-1", "page-1", "user-1/page-1//attach-1.txt")).toBe(false);
  });

  it("refuses a bare `.` segment - NEWLY refused (same reason: the old check is a pure prefix test with no segment parsing)", () => {
    expect(isInstitutionAttachmentStoragePath("user-1", "page-1", "user-1/page-1/./attach-1.txt")).toBe(false);
  });

  it("refuses a percent-encoded `..` segment (%2e%2e) - NEWLY refused (the old check never decodes anything)", () => {
    expect(isInstitutionAttachmentStoragePath("user-1", "page-1", "user-1/page-1/%2e%2e/attach-1.txt")).toBe(false);
  });

  it("refuses a percent-encoded separator (%2f) hiding an extra path segment - NEWLY refused", () => {
    expect(isInstitutionAttachmentStoragePath("user-1", "page-1", "user-1/page-1/a%2fb/attach-1.txt")).toBe(false);
  });

  it("refuses malformed percent-encoding (a lone `%`) rather than guessing at it - NEWLY refused; the old check would have accepted this as an ordinary-looking literal segment", () => {
    expect(isInstitutionAttachmentStoragePath("user-1", "page-1", "user-1/page-1/%/attach-1.txt")).toBe(false);
  });

  it("refuses a userId that merely STARTS WITH the real userId - ALREADY refused (the old prefix string simply never matched)", () => {
    expect(isInstitutionAttachmentStoragePath("user-1", "page-1", "user-12/page-1/attach-1.txt")).toBe(false);
  });

  it("refuses a pageId that merely STARTS WITH the real pageId - ALREADY refused (same reason)", () => {
    expect(isInstitutionAttachmentStoragePath("user-1", "page-1", "user-1/page-12/attach-1.txt")).toBe(false);
  });

  it("refuses a bare userId/pageId with nothing after it - ALREADY refused (the old check required length > prefix.length)", () => {
    expect(isInstitutionAttachmentStoragePath("user-1", "page-1", "user-1/page-1")).toBe(false);
  });
});

const attachment: InstitutionPageAttachment = {
  id: "attach-1",
  pageId: "page-1",
  fileName: "notes.txt",
  mimeType: "text/plain",
  sizeBytes: 5,
  storagePath: "user-1/page-1/attach-1.txt",
  createdAt: "2026-08-01T00:00:00Z",
};

const uploadParams = {
  userId: "user-1",
  pageId: "page-1",
  attachmentId: "attach-1",
  fileName: "notes.txt",
  mimeType: "text/plain",
  sizeBytes: 5,
  file: { name: "notes.txt" },
};

describe("uploadInstitutionPageAttachment: the sizeBytes <= 0 floor", () => {
  it.each([0, -1])("rejects sizeBytes=%i WITHOUT uploading or recording it", async (sizeBytes) => {
    const calls: string[] = [];
    let recorded = 0;
    const storage = {
      async upload() {
        calls.push("upload");
        return { error: null };
      },
      async remove() {
        calls.push("remove");
        return { error: null };
      },
    };

    const result = await uploadInstitutionPageAttachment(
      storage,
      async () => {
        recorded += 1;
        return { ok: true, attachment };
      },
      { ...uploadParams, sizeBytes }
    );

    expect(result).toEqual({ ok: false, error: emptyAttachmentMessage() });
    expect(calls).toEqual([]);
    expect(recorded).toBe(0);
  });
});
