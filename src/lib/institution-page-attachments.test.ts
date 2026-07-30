import { describe, it, expect } from "vitest";
import {
  formatByteSize,
  exceedsAttachmentSizeCap,
  attachmentSizeCapMessage,
  attachmentCountCapMessage,
  classifyAttachmentKind,
  attachmentFileExtension,
  buildAttachmentStoragePath,
  mapInstitutionPageAttachment,
  listInstitutionPageAttachments,
  listInstitutionPageAttachmentsForPages,
  getInstitutionPageAttachment,
  createInstitutionPageAttachment,
  deleteInstitutionPageAttachment,
  removeAttachmentStorageObjects,
  getInstitutionPageAttachmentUrl,
  deleteInstitutionPageAndAttachments,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_PAGE,
  INSTITUTION_ATTACHMENTS_BUCKET,
  type InstitutionPageAttachment,
} from "./institution-page-attachments";
import type { InstitutionPage } from "./knowledge-base";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

// ---------------------------------------------------------------------------
// Pure helpers - caps, path construction, classification, formatting.
// ---------------------------------------------------------------------------

describe("formatByteSize", () => {
  it("renders sub-KB sizes in bytes", () => {
    expect(formatByteSize(512)).toBe("512 B");
  });

  it("renders KB with one decimal below 10", () => {
    expect(formatByteSize(1536)).toBe("1.5 KB");
  });

  it("renders KB rounded to a whole number at or above 10", () => {
    expect(formatByteSize(12 * 1024)).toBe("12 KB");
  });

  it("renders MB with one decimal below 10", () => {
    expect(formatByteSize(6 * 1024 * 1024)).toBe("6 MB");
    expect(formatByteSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });

  it("renders MB rounded to a whole number at or above 10", () => {
    expect(formatByteSize(25 * 1024 * 1024)).toBe("25 MB");
  });
});

describe("exceedsAttachmentSizeCap / attachmentSizeCapMessage", () => {
  it("does not flag a file at exactly the cap", () => {
    expect(exceedsAttachmentSizeCap(MAX_ATTACHMENT_SIZE_BYTES)).toBe(false);
  });

  it("flags a file one byte over the cap", () => {
    expect(exceedsAttachmentSizeCap(MAX_ATTACHMENT_SIZE_BYTES + 1)).toBe(true);
  });

  it("names the file and the exact limit in the refusal message", () => {
    const message = attachmentSizeCapMessage("handbook.pdf", 12 * 1024 * 1024);
    expect(message).toContain("handbook.pdf");
    expect(message).toContain(formatByteSize(MAX_ATTACHMENT_SIZE_BYTES));
    expect(message).toContain(formatByteSize(12 * 1024 * 1024));
  });
});

describe("attachmentCountCapMessage", () => {
  it("names the exact per-page limit", () => {
    expect(attachmentCountCapMessage()).toContain(String(MAX_ATTACHMENTS_PER_PAGE));
  });
});

describe("classifyAttachmentKind", () => {
  it("classifies any image/* mime type as image", () => {
    expect(classifyAttachmentKind("image/png")).toBe("image");
    expect(classifyAttachmentKind("IMAGE/JPEG")).toBe("image");
  });

  it("classifies everything else as file", () => {
    expect(classifyAttachmentKind("application/pdf")).toBe("file");
    expect(classifyAttachmentKind("text/plain")).toBe("file");
    expect(classifyAttachmentKind("video/mp4")).toBe("file");
  });
});

describe("attachmentFileExtension", () => {
  it("returns the lowercased extension", () => {
    expect(attachmentFileExtension("Handbook.PDF")).toBe("pdf");
  });

  it("returns '' for a file with no extension", () => {
    expect(attachmentFileExtension("README")).toBe("");
  });

  it("returns '' for a leading-dot dotfile", () => {
    expect(attachmentFileExtension(".gitignore")).toBe("");
  });

  it("returns '' for a trailing dot", () => {
    expect(attachmentFileExtension("file.")).toBe("");
  });

  it("returns only the outermost extension for a multi-dot name", () => {
    expect(attachmentFileExtension("archive.tar.gz")).toBe("gz");
  });
});

describe("buildAttachmentStoragePath", () => {
  it("nests userId/pageId/attachmentId with the original extension", () => {
    expect(buildAttachmentStoragePath("user-1", "page-1", "attach-1", "Syllabus.pdf")).toBe(
      "user-1/page-1/attach-1.pdf"
    );
  });

  it("omits the extension segment when the file name has none", () => {
    expect(buildAttachmentStoragePath("user-1", "page-1", "attach-1", "README")).toBe("user-1/page-1/attach-1");
  });

  it("always leads with userId, matching the storage.objects RLS policy's foldername(name)[1] check", () => {
    const path = buildAttachmentStoragePath("user-42", "page-9", "attach-3", "notes.txt");
    expect(path.split("/")[0]).toBe("user-42");
  });
});

describe("mapInstitutionPageAttachment", () => {
  it("maps every snake_case column to its camelCase field", () => {
    const row: Database["public"]["Tables"]["institution_page_attachments"]["Row"] = {
      id: "attach-1",
      page_id: "page-1",
      user_id: "user-1",
      file_name: "Handbook.pdf",
      mime_type: "application/pdf",
      size_bytes: 4096,
      storage_path: "user-1/page-1/attach-1.pdf",
      created_at: "2026-08-01T00:00:00Z",
    };

    expect(mapInstitutionPageAttachment(row)).toEqual({
      id: "attach-1",
      pageId: "page-1",
      fileName: "Handbook.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      storagePath: "user-1/page-1/attach-1.pdf",
      createdAt: "2026-08-01T00:00:00Z",
    });
  });
});

// ---------------------------------------------------------------------------
// Data access - hand-rolled fake Supabase client, following the same
// inline-fake approach as src/lib/recording-files.test.ts: each test builds
// exactly the chain the function under test calls and records every call so
// assertions can check what was sent (including user_id scoping) and in what
// order (storage-before-row).
// ---------------------------------------------------------------------------

interface RecordedCall {
  method: string;
  args: unknown[];
}

type FakeTableResponse = { data: unknown; error: unknown; count?: number | null };
type FakeStorageResponse = { data: unknown; error: unknown };

function makeQueryBuilder(response: FakeTableResponse, calls: RecordedCall[]) {
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
    insert: (...args: unknown[]) => {
      calls.push({ method: "insert", args });
      return builder;
    },
    delete: (...args: unknown[]) => {
      calls.push({ method: "delete", args });
      return builder;
    },
    maybeSingle: () => {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(response);
    },
    single: () => {
      calls.push({ method: "single", args: [] });
      return Promise.resolve(response);
    },
    then: (resolve: (value: FakeTableResponse) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return builder;
}

interface MakeSupabaseOptions {
  /** FIFO queue of responses per table - each `.from(table)` call consumes
   * the next queued entry (falls back to `{data:null,error:null}` once
   * exhausted). Lets a single test configure two different responses for
   * two separate calls against the same table (e.g. createInstitutionPageAttachment's
   * count-select then insert). */
  tableResponses?: Record<string, FakeTableResponse[]>;
  storage?: {
    upload?: FakeStorageResponse;
    remove?: FakeStorageResponse;
    createSignedUrl?: FakeStorageResponse;
  };
}

function makeSupabase(opts: MakeSupabaseOptions = {}) {
  const calls: RecordedCall[] = [];
  const queues = new Map<string, FakeTableResponse[]>(
    Object.entries(opts.tableResponses ?? {}).map(([table, responses]) => [table, [...responses]])
  );

  const client = {
    from: (tableName: string) => {
      calls.push({ method: "from", args: [tableName] });
      const queue = queues.get(tableName);
      const response = queue && queue.length > 0 ? queue.shift()! : { data: null, error: null };
      return makeQueryBuilder(response, calls);
    },
    storage: {
      from: (bucket: string) => {
        calls.push({ method: "storage.from", args: [bucket] });
        return {
          upload: (...args: unknown[]) => {
            calls.push({ method: "storage.upload", args });
            return Promise.resolve(opts.storage?.upload ?? { data: { path: args[0] }, error: null });
          },
          remove: (...args: unknown[]) => {
            calls.push({ method: "storage.remove", args });
            return Promise.resolve(opts.storage?.remove ?? { data: args[0], error: null });
          },
          createSignedUrl: (...args: unknown[]) => {
            calls.push({ method: "storage.createSignedUrl", args });
            return Promise.resolve(
              opts.storage?.createSignedUrl ?? { data: { signedUrl: "https://example.com/signed" }, error: null }
            );
          },
        };
      },
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, calls };
}

function eqCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method === "eq").map((c) => c.args);
}

function attachmentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "attach-1",
    page_id: "page-1",
    user_id: "user-1",
    file_name: "Handbook.pdf",
    mime_type: "application/pdf",
    size_bytes: 4096,
    storage_path: "user-1/page-1/attach-1.pdf",
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function institutionPage(overrides: Partial<InstitutionPage> = {}): InstitutionPage {
  return {
    id: "root",
    institution: "MCC",
    parentId: null,
    title: "Attendance Policy",
    body: "",
    tags: [],
    position: 0,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function institutionPageRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "root",
    user_id: "user-1",
    institution: "MCC",
    parent_id: null,
    title: "Attendance Policy",
    body: "",
    tags: [],
    position: 0,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("listInstitutionPageAttachments", () => {
  it("scopes the query to both user_id and page_id", async () => {
    const { client, calls } = makeSupabase({
      tableResponses: { institution_page_attachments: [{ data: [], error: null }] },
    });
    await listInstitutionPageAttachments(client, "user-1", "page-1");
    const eq = eqCalls(calls);
    expect(eq).toContainEqual(["user_id", "user-1"]);
    expect(eq).toContainEqual(["page_id", "page-1"]);
  });

  it("maps every returned row through mapInstitutionPageAttachment", async () => {
    const { client } = makeSupabase({
      tableResponses: {
        institution_page_attachments: [
          { data: [attachmentRow({ id: "a" }), attachmentRow({ id: "b" })], error: null },
        ],
      },
    });
    const attachments = await listInstitutionPageAttachments(client, "user-1", "page-1");
    expect(attachments.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("throws when the query reports an error", async () => {
    const { client } = makeSupabase({
      tableResponses: { institution_page_attachments: [{ data: null, error: { message: "boom" } }] },
    });
    await expect(listInstitutionPageAttachments(client, "user-1", "page-1")).rejects.toThrow("boom");
  });
});

describe("listInstitutionPageAttachmentsForPages", () => {
  it("short-circuits to [] without querying when pageIds is empty", async () => {
    const { client, calls } = makeSupabase();
    const attachments = await listInstitutionPageAttachmentsForPages(client, "user-1", []);
    expect(attachments).toEqual([]);
    expect(calls.some((c) => c.method === "from")).toBe(false);
  });

  it("queries with a single .in('page_id', pageIds) call, scoped to user_id", async () => {
    const { client, calls } = makeSupabase({
      tableResponses: { institution_page_attachments: [{ data: [], error: null }] },
    });
    await listInstitutionPageAttachmentsForPages(client, "user-1", ["page-1", "page-2"]);
    expect(calls.filter((c) => c.method === "from")).toHaveLength(1);
    const inCall = calls.find((c) => c.method === "in");
    expect(inCall!.args).toEqual(["page_id", ["page-1", "page-2"]]);
    expect(eqCalls(calls)).toContainEqual(["user_id", "user-1"]);
  });
});

describe("getInstitutionPageAttachment", () => {
  it("scopes the query to user_id and id", async () => {
    const { client, calls } = makeSupabase({
      tableResponses: { institution_page_attachments: [{ data: attachmentRow(), error: null }] },
    });
    await getInstitutionPageAttachment(client, "user-1", "attach-1");
    const eq = eqCalls(calls);
    expect(eq).toContainEqual(["user_id", "user-1"]);
    expect(eq).toContainEqual(["id", "attach-1"]);
  });

  it("returns null for a missing or foreign id rather than leaking which", async () => {
    const { client } = makeSupabase({
      tableResponses: { institution_page_attachments: [{ data: null, error: null }] },
    });
    const attachment = await getInstitutionPageAttachment(client, "user-1", "not-mine");
    expect(attachment).toBeNull();
  });
});

describe("createInstitutionPageAttachment", () => {
  it("refuses an over-cap file before ever touching storage", async () => {
    const { client, calls } = makeSupabase();
    const oversized = MAX_ATTACHMENT_SIZE_BYTES + 1;

    await expect(
      createInstitutionPageAttachment(client, "user-1", "page-1", Buffer.from("x"), {
        fileName: "huge.zip",
        mimeType: "application/zip",
        sizeBytes: oversized,
      })
    ).rejects.toThrow(attachmentSizeCapMessage("huge.zip", oversized));

    expect(calls.some((c) => c.method === "storage.upload")).toBe(false);
  });

  it("refuses a new attachment once the page is already at the count cap, before touching storage", async () => {
    const { client, calls } = makeSupabase({
      tableResponses: {
        institution_page_attachments: [{ data: null, error: null, count: MAX_ATTACHMENTS_PER_PAGE }],
      },
    });

    await expect(
      createInstitutionPageAttachment(client, "user-1", "page-1", Buffer.from("x"), {
        fileName: "one-more.txt",
        mimeType: "text/plain",
        sizeBytes: 10,
      })
    ).rejects.toThrow(attachmentCountCapMessage());

    expect(calls.some((c) => c.method === "storage.upload")).toBe(false);
  });

  it("uploads then inserts, returning the mapped row, when under both caps", async () => {
    const insertedRow = attachmentRow({ id: "attach-9" });
    const { client, calls } = makeSupabase({
      tableResponses: {
        institution_page_attachments: [
          { data: null, error: null, count: 2 }, // count query
          { data: insertedRow, error: null }, // insert + select + single
        ],
      },
    });

    const attachment = await createInstitutionPageAttachment(client, "user-1", "page-1", Buffer.from("hello"), {
      fileName: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
    });

    expect(attachment.id).toBe("attach-9");
    const uploadCall = calls.find((c) => c.method === "storage.upload");
    expect(uploadCall).toBeTruthy();
    expect((uploadCall!.args[0] as string).startsWith("user-1/page-1/")).toBe(true);
    expect((uploadCall!.args[0] as string).endsWith(".txt")).toBe(true);
  });

  it("throws the storage error and never inserts a row when the upload fails", async () => {
    const { client, calls } = makeSupabase({
      tableResponses: { institution_page_attachments: [{ data: null, error: null, count: 0 }] },
      storage: { upload: { data: null, error: { message: "upload failed" } } },
    });

    await expect(
      createInstitutionPageAttachment(client, "user-1", "page-1", Buffer.from("x"), {
        fileName: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
      })
    ).rejects.toThrow("upload failed");

    expect(calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("best-effort removes the just-uploaded object and rethrows when the row insert fails", async () => {
    const { client, calls } = makeSupabase({
      tableResponses: {
        institution_page_attachments: [
          { data: null, error: null, count: 0 }, // count query
          { data: null, error: { message: "insert failed" } }, // insert fails
        ],
      },
    });

    await expect(
      createInstitutionPageAttachment(client, "user-1", "page-1", Buffer.from("x"), {
        fileName: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
      })
    ).rejects.toThrow("insert failed");

    const removeCall = calls.find((c) => c.method === "storage.remove");
    expect(removeCall).toBeTruthy();
    expect((removeCall!.args[0] as string[])[0].startsWith("user-1/page-1/")).toBe(true);
  });
});

describe("deleteInstitutionPageAttachment", () => {
  it("removes the storage object before deleting the row", async () => {
    const { client, calls } = makeSupabase({
      tableResponses: { institution_page_attachments: [{ data: null, error: null }] },
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

    await deleteInstitutionPageAttachment(client, "user-1", attachment);

    const removeIdx = calls.findIndex((c) => c.method === "storage.remove");
    const deleteIdx = calls.findIndex((c) => c.method === "delete");
    expect(removeIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThan(removeIdx);
    expect(calls.find((c) => c.method === "storage.remove")!.args[0]).toEqual(["user-1/page-1/attach-1.txt"]);
  });

  it("still deletes the row when the storage object is already missing (best-effort)", async () => {
    const { client } = makeSupabase({
      tableResponses: { institution_page_attachments: [{ data: null, error: null }] },
      storage: { remove: { data: null, error: { message: "not found" } } },
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

    await expect(deleteInstitutionPageAttachment(client, "user-1", attachment)).resolves.toBeUndefined();
  });

  it("throws when the row delete itself reports an error", async () => {
    const { client } = makeSupabase({
      tableResponses: { institution_page_attachments: [{ data: null, error: { message: "row delete failed" } }] },
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

    await expect(deleteInstitutionPageAttachment(client, "user-1", attachment)).rejects.toThrow("row delete failed");
  });
});

describe("removeAttachmentStorageObjects", () => {
  it("short-circuits without a storage call for an empty array", async () => {
    const { client, calls } = makeSupabase();
    const result = await removeAttachmentStorageObjects(client, []);
    expect(result).toEqual({ removedCount: 0 });
    expect(calls.some((c) => c.method === "storage.remove")).toBe(false);
  });

  it("returns removedCount on a successful batch remove", async () => {
    const { client } = makeSupabase({
      storage: { remove: { data: [{ name: "a" }, { name: "b" }], error: null } },
    });
    const result = await removeAttachmentStorageObjects(client, ["a", "b"]);
    expect(result).toEqual({ removedCount: 2 });
  });

  it("returns the error message rather than throwing when the batch remove fails (partial failure)", async () => {
    const { client } = makeSupabase({
      storage: { remove: { data: null, error: { message: "network blip" } } },
    });
    await expect(removeAttachmentStorageObjects(client, ["a"])).resolves.toEqual({
      removedCount: 0,
      error: "network blip",
    });
  });
});

describe("getInstitutionPageAttachmentUrl", () => {
  const attachment: InstitutionPageAttachment = {
    id: "attach-1",
    pageId: "page-1",
    fileName: "notes.txt",
    mimeType: "text/plain",
    sizeBytes: 5,
    storagePath: "user-1/page-1/attach-1.txt",
    createdAt: "2026-08-01T00:00:00Z",
  };

  it("returns a signed URL from the private bucket", async () => {
    const { client, calls } = makeSupabase({
      storage: { createSignedUrl: { data: { signedUrl: "https://example.com/signed-abc" }, error: null } },
    });
    const url = await getInstitutionPageAttachmentUrl(client, attachment, 900);
    expect(url).toBe("https://example.com/signed-abc");
    const bucketCall = calls.find((c) => c.method === "storage.from");
    expect(bucketCall!.args).toEqual([INSTITUTION_ATTACHMENTS_BUCKET]);
    const signCall = calls.find((c) => c.method === "storage.createSignedUrl");
    expect(signCall!.args).toEqual(["user-1/page-1/attach-1.txt", 900]);
  });

  it("throws when signing fails", async () => {
    const { client } = makeSupabase({
      storage: { createSignedUrl: { data: null, error: { message: "sign failed" } } },
    });
    await expect(getInstitutionPageAttachmentUrl(client, attachment)).rejects.toThrow("sign failed");
  });
});

describe("deleteInstitutionPageAndAttachments", () => {
  it("collects storage paths across the whole subtree, removes them, then deletes the page", async () => {
    const pages = [
      institutionPageRow({ id: "root", parent_id: null }),
      institutionPageRow({ id: "child", parent_id: "root" }),
      institutionPageRow({ id: "grandchild", parent_id: "child" }),
      institutionPageRow({ id: "unrelated", parent_id: null }),
    ];
    const attachments = [
      attachmentRow({ id: "a1", page_id: "root", storage_path: "user-1/root/a1" }),
      attachmentRow({ id: "a2", page_id: "grandchild", storage_path: "user-1/grandchild/a2" }),
    ];

    const { client, calls } = makeSupabase({
      tableResponses: {
        institution_pages: [
          { data: pages, error: null }, // listInstitutionPages
          { data: null, error: null }, // deleteInstitutionPage
        ],
        institution_page_attachments: [{ data: attachments, error: null }],
      },
    });

    const result = await deleteInstitutionPageAndAttachments(client, "user-1", institutionPage({ id: "root" }));

    expect(result).toEqual({});

    const inCall = calls.find((c) => c.method === "in");
    expect(new Set(inCall!.args[1] as string[])).toEqual(new Set(["root", "child", "grandchild"]));

    const removeCall = calls.find((c) => c.method === "storage.remove");
    expect(new Set(removeCall!.args[0] as string[])).toEqual(new Set(["user-1/root/a1", "user-1/grandchild/a2"]));

    // The page-row delete must still have happened - the second `institution_pages`
    // query's `delete` call.
    expect(calls.some((c) => c.method === "delete")).toBe(true);
  });

  it("skips the storage remove call entirely when the subtree has no attachments", async () => {
    const { client, calls } = makeSupabase({
      tableResponses: {
        institution_pages: [
          { data: [institutionPageRow({ id: "root" })], error: null },
          { data: null, error: null },
        ],
        institution_page_attachments: [{ data: [], error: null }],
      },
    });

    const result = await deleteInstitutionPageAndAttachments(client, "user-1", institutionPage({ id: "root" }));

    expect(result).toEqual({});
    expect(calls.some((c) => c.method === "storage.remove")).toBe(false);
  });

  it("still deletes the page and surfaces storageCleanupError when the batch remove fails (partial failure never blocks the delete)", async () => {
    const { client, calls } = makeSupabase({
      tableResponses: {
        institution_pages: [
          { data: [institutionPageRow({ id: "root" })], error: null },
          { data: null, error: null },
        ],
        institution_page_attachments: [{ data: [attachmentRow({ id: "a1", page_id: "root" })], error: null }],
      },
      storage: { remove: { data: null, error: { message: "network blip" } } },
    });

    const result = await deleteInstitutionPageAndAttachments(client, "user-1", institutionPage({ id: "root" }));

    expect(result).toEqual({ storageCleanupError: "network blip" });
    // The delete must have gone through anyway.
    expect(calls.some((c) => c.method === "delete")).toBe(true);
  });
});
