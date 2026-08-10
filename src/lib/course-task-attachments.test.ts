// Contract for the pure and injectable halves of "attach files to a
// Tasks-grid cell" (docs/task-cell-attachments-acceptance-criteria.md).
// Written BEFORE the implementation, from the AC rather than from an imagined
// implementation.
//
// vitest is node-env and collects only src/**/*.test.ts, so nothing here can
// render a component or reach Supabase. Two consequences shaped this file:
//
// - Everything decidable without I/O lives in src/lib/course-task-attachments.ts
//   and is pinned by behaviour: the caps and their exact wording (AC2 item 11,
//   AC5 item 29), the sanitised storage path (AC2 items 8-9), and the
//   client-side index the grid reads (AC4 item 20).
// - The upload and delete ORDERING (AC2 item 12) is the part most likely to be
//   got wrong and least visible in review, so it is expressed as functions
//   that take their storage client and their row-recorder as ARGUMENTS. Fed
//   fakes here, the rollback and the ordering become provable instead of
//   merely readable - the same shape institution-page-attachments.test.ts
//   already uses for the same problem.
import { describe, it, expect } from "vitest";
import {
  MAX_TASK_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_CELL,
  taskAttachmentExtension,
  taskAttachmentStoragePath,
  exceedsTaskAttachmentSize,
  taskAttachmentSizeCapMessage,
  taskAttachmentCountCapMessage,
  emptyTaskAttachmentMessage,
  taskAttachmentUploadFailedMessage,
  taskAttachmentKey,
  indexTaskAttachments,
  taskAttachmentsAt,
  taskAttachmentCountLabel,
  uploadTaskAttachment,
  deleteTaskAttachment,
  type TaskAttachment,
} from "./course-task-attachments";

function attachment(overrides: Partial<TaskAttachment> = {}): TaskAttachment {
  return {
    id: "a1",
    courseId: "c1",
    taskId: "t1",
    fileName: "syllabus.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    storagePath: "u1/c1/task-attachments/a1.pdf",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

/** A fake of the only three storage calls this feature makes, recording the
 * order it was called in so the ordering assertions below are about real
 * sequencing rather than about the presence of a line of code. */
function fakeStorage(options: { uploadError?: string; removeError?: string } = {}) {
  const calls: string[] = [];
  const uploaded: string[] = [];
  const removed: string[][] = [];
  return {
    calls,
    uploaded,
    removed,
    client: {
      async upload(path: string) {
        calls.push("upload");
        uploaded.push(path);
        return { error: options.uploadError ? { message: options.uploadError } : null };
      },
      async remove(paths: string[]) {
        calls.push("remove");
        removed.push(paths);
        return { error: options.removeError ? { message: options.removeError } : null };
      },
    },
  };
}

const uploadParams = {
  userId: "u1",
  courseId: "c1",
  taskId: "t1",
  attachmentId: "a1",
  fileName: "syllabus.pdf",
  sizeBytes: 1024,
  mimeType: "application/pdf",
  createdAt: "2026-08-01T00:00:00.000Z",
  file: { name: "syllabus.pdf" },
};

describe("the caps are real numbers with stated reasons (AC2 item 11)", () => {
  it("the per-file cap is 25 MB, expressed in bytes", () => {
    // Frozen as a literal: without it, every "is it too big" assertion below
    // is self-referential and a cap of 1 byte would satisfy them all.
    expect(MAX_TASK_ATTACHMENT_BYTES).toBe(25 * 1024 * 1024);
  });

  it("the per-cell cap is 20 files", () => {
    expect(MAX_ATTACHMENTS_PER_CELL).toBe(20);
  });

  it("exceedsTaskAttachmentSize is exclusive at the boundary - a file exactly at the cap is allowed", () => {
    expect(exceedsTaskAttachmentSize(MAX_TASK_ATTACHMENT_BYTES)).toBe(false);
    expect(exceedsTaskAttachmentSize(MAX_TASK_ATTACHMENT_BYTES + 1)).toBe(true);
    expect(exceedsTaskAttachmentSize(0)).toBe(false);
  });
});

describe("the error wording names the limit it enforces (AC5 item 29)", () => {
  it("the size message states the actual cap, so it never reads as a bare `too large`", () => {
    expect(taskAttachmentSizeCapMessage()).toBe("The selected file must be smaller than 25MB");
  });

  it("the count message states the actual cap", () => {
    expect(taskAttachmentCountCapMessage()).toBe("You can only attach up to 20 files to one task");
  });

  it("an empty file gets its own message rather than the size message", () => {
    expect(emptyTaskAttachmentMessage()).toBe("The selected file is empty");
  });

  it("a failed upload names the file, because the dialog uploads several at once", () => {
    expect(taskAttachmentUploadFailedMessage("syllabus.pdf")).toBe('Could not upload "syllabus.pdf" - try again');
  });

  it("no message contains an em or en dash - this repo writes plain hyphens", () => {
    const all = [
      taskAttachmentSizeCapMessage(),
      taskAttachmentCountCapMessage(),
      emptyTaskAttachmentMessage(),
      taskAttachmentUploadFailedMessage("x.pdf"),
    ].join(" ");
    expect(all).not.toMatch(/[–—]/);
  });
});

describe("the storage path is built, never taken from the user (AC2 items 8-9)", () => {
  it("puts the user id FIRST, which every policy on the bucket requires", () => {
    // Each `course-files` policy checks
    // (storage.foldername(name))[1] = auth.uid()::text - a path that does not
    // start with the user id is refused by RLS, not by our code, so getting
    // this wrong is a 403 in production rather than a visible bug.
    expect(taskAttachmentStoragePath("user-1", "course-9", "att-7", "Syllabus.PDF").split("/")[0]).toBe("user-1");
  });

  it("is exactly userId/courseId/task-attachments/attachmentId.ext", () => {
    expect(taskAttachmentStoragePath("user-1", "course-9", "att-7", "Syllabus.PDF")).toBe(
      "user-1/course-9/task-attachments/att-7.pdf"
    );
  });

  it("never contains the original file name, however hostile that name is", () => {
    const nasty = "../../../etc/passwd; DROP TABLE course_hub.pdf";
    const path = taskAttachmentStoragePath("user-1", "course-9", "att-7", nasty);
    expect(path).toBe("user-1/course-9/task-attachments/att-7.pdf");
    expect(path).not.toContain("passwd");
    expect(path).not.toContain("..");
  });

  it("gives two same-named files two different objects, so neither can overwrite the other (AC2 item 13)", () => {
    const first = taskAttachmentStoragePath("u", "c", "att-1", "rubric.pdf");
    const second = taskAttachmentStoragePath("u", "c", "att-2", "rubric.pdf");
    expect(first).not.toBe(second);
  });

  it("segregates task attachments from the course zips and misc files already in this bucket", () => {
    expect(taskAttachmentStoragePath("u", "c", "a", "x.png")).toContain("/task-attachments/");
  });
});

describe("taskAttachmentExtension (AC2 item 9)", () => {
  it("lowercases the extension", () => {
    expect(taskAttachmentExtension("Syllabus.PDF")).toBe("pdf");
  });

  it("takes the LAST extension of a multi-dotted name", () => {
    expect(taskAttachmentExtension("archive.tar.gz")).toBe("gz");
  });

  it("falls back to bin when there is no extension at all", () => {
    expect(taskAttachmentExtension("README")).toBe("bin");
    expect(taskAttachmentExtension("")).toBe("bin");
  });

  it("treats a dotfile as having no extension, not an extension of `gitignore`", () => {
    expect(taskAttachmentExtension(".gitignore")).toBe("bin");
  });

  it("strips anything that is not a letter or digit, so the path can never gain a separator", () => {
    expect(taskAttachmentExtension("weird.p df")).toBe("pdf");
    expect(taskAttachmentExtension("weird.p/df")).toBe("pdf");
    expect(taskAttachmentExtension("trailing.")).toBe("bin");
  });

  it("bounds the extension length, so a pathological name cannot produce an enormous path", () => {
    expect(taskAttachmentExtension(`x.${"a".repeat(200)}`).length).toBeLessThanOrEqual(12);
  });
});

describe("the client-side index the grid reads (AC4 item 20)", () => {
  it("keys by courseId:taskId, the same shape cellErrors already uses", () => {
    expect(taskAttachmentKey("c1", "t1")).toBe("c1:t1");
  });

  it("groups every attachment under its own cell", () => {
    const map = indexTaskAttachments([
      attachment({ id: "a1", courseId: "c1", taskId: "t1" }),
      attachment({ id: "a2", courseId: "c1", taskId: "t2" }),
      attachment({ id: "a3", courseId: "c2", taskId: "t1" }),
      attachment({ id: "a4", courseId: "c1", taskId: "t1" }),
    ]);
    expect(taskAttachmentsAt(map, "c1", "t1").map((a) => a.id)).toEqual(["a1", "a4"]);
    expect(taskAttachmentsAt(map, "c1", "t2").map((a) => a.id)).toEqual(["a2"]);
    expect(taskAttachmentsAt(map, "c2", "t1").map((a) => a.id)).toEqual(["a3"]);
  });

  it("orders each cell's files oldest first, so a newly added file appends rather than jumping the list", () => {
    const map = indexTaskAttachments([
      attachment({ id: "new", createdAt: "2026-08-09T00:00:00.000Z" }),
      attachment({ id: "old", createdAt: "2026-08-01T00:00:00.000Z" }),
      attachment({ id: "mid", createdAt: "2026-08-05T00:00:00.000Z" }),
    ]);
    expect(taskAttachmentsAt(map, "c1", "t1").map((a) => a.id)).toEqual(["old", "mid", "new"]);
  });

  it("breaks a createdAt tie by id, so the order is total and a re-render never reshuffles the list", () => {
    const map = indexTaskAttachments([
      attachment({ id: "b", createdAt: "2026-08-01T00:00:00.000Z" }),
      attachment({ id: "a", createdAt: "2026-08-01T00:00:00.000Z" }),
    ]);
    expect(taskAttachmentsAt(map, "c1", "t1").map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("returns an empty array for a cell with no files - never undefined", () => {
    expect(taskAttachmentsAt(indexTaskAttachments([]), "nope", "nope")).toEqual([]);
  });

  it("builds into a null-prototype object, the same posture coerceTaskCellMap documents", () => {
    // REGRESSION entry 232 check 9's own warning applies: assert on the
    // RETURNED object, never on global Object.prototype.
    expect(Object.getPrototypeOf(indexTaskAttachments([attachment()]))).toBeNull();
  });

  it("does not mutate or alias the array it was given", () => {
    const rows = [attachment({ id: "a2" }), attachment({ id: "a1" })];
    const snapshot = rows.map((r) => r.id);
    const map = indexTaskAttachments(rows);
    expect(rows.map((r) => r.id)).toEqual(snapshot);
    expect(taskAttachmentsAt(map, "c1", "t1")).not.toBe(rows);
  });
});

describe("taskAttachmentCountLabel (AC3 item 16, AC5 item 24)", () => {
  it("is singular for one file", () => {
    expect(taskAttachmentCountLabel(1)).toBe("1 file");
  });

  it("is plural for more than one", () => {
    expect(taskAttachmentCountLabel(2)).toBe("2 files");
    expect(taskAttachmentCountLabel(20)).toBe("20 files");
  });

  it("says so in words when there are none, rather than rendering a bare zero", () => {
    expect(taskAttachmentCountLabel(0)).toBe("No files");
  });
});

// -----------------------------------------------------------------------
// AC2 item 12 - the ordering and the rollback. This is the part that would
// otherwise be invisible: an implementation that records the row first, or
// that leaves the object behind when recording fails, looks identical in
// review and leaks an invisible, billable object every time it happens.

describe("uploadTaskAttachment: caps are enforced before any byte is uploaded (AC2 item 11)", () => {
  it("rejects an oversized file WITHOUT uploading it", async () => {
    const storage = fakeStorage();
    const result = await uploadTaskAttachment(storage.client, async () => ({ ok: true }), {
      ...uploadParams,
      sizeBytes: MAX_TASK_ATTACHMENT_BYTES + 1,
    });
    expect(result).toEqual({ ok: false, error: taskAttachmentSizeCapMessage() });
    expect(storage.calls).toEqual([]);
  });

  it("rejects an empty file WITHOUT uploading it, with its own message", async () => {
    const storage = fakeStorage();
    const result = await uploadTaskAttachment(storage.client, async () => ({ ok: true }), {
      ...uploadParams,
      sizeBytes: 0,
    });
    expect(result).toEqual({ ok: false, error: emptyTaskAttachmentMessage() });
    expect(storage.calls).toEqual([]);
  });

  it("never records a row for a file it refused to upload", async () => {
    const storage = fakeStorage();
    let recorded = 0;
    await uploadTaskAttachment(
      storage.client,
      async () => {
        recorded += 1;
        return { ok: true };
      },
      { ...uploadParams, sizeBytes: MAX_TASK_ATTACHMENT_BYTES + 1 }
    );
    expect(recorded).toBe(0);
  });
});

describe("uploadTaskAttachment: object first, row second, rollback on failure (AC2 item 12)", () => {
  it("uploads to the path the shared builder produced, and records the SAME path", async () => {
    const storage = fakeStorage();
    const rows: Array<{ storagePath: string }> = [];
    const result = await uploadTaskAttachment(
      storage.client,
      async (row) => {
        rows.push(row);
        return { ok: true };
      },
      uploadParams
    );
    const expected = taskAttachmentStoragePath("u1", "c1", "a1", "syllabus.pdf");
    expect(storage.uploaded).toEqual([expected]);
    expect(rows[0].storagePath).toBe(expected);
    expect(result).toEqual({
      ok: true,
      attachment: {
        id: "a1",
        courseId: "c1",
        taskId: "t1",
        fileName: "syllabus.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        storagePath: expected,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    });
  });

  it("uploads BEFORE it records - a row pointing at an object that does not exist is worse than neither", async () => {
    const storage = fakeStorage();
    const order: string[] = [];
    await uploadTaskAttachment(
      storage.client,
      async () => {
        order.push("record");
        return { ok: true };
      },
      uploadParams
    );
    expect(storage.calls).toEqual(["upload"]);
    expect(order).toEqual(["record"]);
  });

  it("does not record a row when the upload itself failed, and reports the file by name", async () => {
    const storage = fakeStorage({ uploadError: "network" });
    let recorded = 0;
    const result = await uploadTaskAttachment(
      storage.client,
      async () => {
        recorded += 1;
        return { ok: true };
      },
      uploadParams
    );
    expect(recorded).toBe(0);
    expect(result).toEqual({ ok: false, error: taskAttachmentUploadFailedMessage("syllabus.pdf") });
  });

  it("REMOVES the uploaded object when recording the row fails - otherwise it is an invisible, billable orphan", async () => {
    const storage = fakeStorage();
    const result = await uploadTaskAttachment(storage.client, async () => ({ ok: false, error: "row rejected" }), uploadParams);
    expect(storage.calls).toEqual(["upload", "remove"]);
    expect(storage.removed).toEqual([[taskAttachmentStoragePath("u1", "c1", "a1", "syllabus.pdf")]]);
    expect(result).toEqual({ ok: false, error: "row rejected" });
  });

  it("still reports the recording failure even if the rollback removal ALSO fails", async () => {
    const storage = fakeStorage({ removeError: "gone" });
    const result = await uploadTaskAttachment(storage.client, async () => ({ ok: false, error: "row rejected" }), uploadParams);
    expect(storage.calls).toEqual(["upload", "remove"]);
    expect(result).toEqual({ ok: false, error: "row rejected" });
  });
});

describe("deleteTaskAttachment: object first, row second (AC2 item 12)", () => {
  it("removes the object BEFORE deleting the row, so a failure leaves a visible row not an invisible orphan", async () => {
    const storage = fakeStorage();
    const order: string[] = [];
    const result = await deleteTaskAttachment(
      storage.client,
      async () => {
        order.push("delete-row");
        return { ok: true };
      },
      attachment()
    );
    expect(storage.calls).toEqual(["remove"]);
    expect(order).toEqual(["delete-row"]);
    expect(result).toEqual({ ok: true });
  });

  it("removes exactly the attachment's own object", async () => {
    const storage = fakeStorage();
    await deleteTaskAttachment(storage.client, async () => ({ ok: true }), attachment({ storagePath: "u1/c1/task-attachments/zz.pdf" }));
    expect(storage.removed).toEqual([["u1/c1/task-attachments/zz.pdf"]]);
  });

  it("does NOT delete the row when the object could not be removed", async () => {
    const storage = fakeStorage({ removeError: "storage down" });
    let deleted = 0;
    const result = await deleteTaskAttachment(
      storage.client,
      async () => {
        deleted += 1;
        return { ok: true };
      },
      attachment()
    );
    expect(deleted).toBe(0);
    expect(result.ok).toBe(false);
  });
});
