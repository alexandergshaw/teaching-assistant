// BULK-ZIP BW1: the client half of the Storage transport. Pins the path-bind
// (the client builds ONLY a grading-uploads path under the caller's uid), the
// transport choice, and the delete-on-reject courtesy. Whether the upload
// actually fires in a browser is an owner-walk.
import { describe, it, expect, vi } from "vitest";
import {
  GRADING_ZIP_MAX_BYTES,
  GRADING_ZIP_STORAGE_INGEST_ENABLED,
  chooseZipTransport,
  chooseSingleFileTransport,
  SINGLE_FILE_MAX_BYTES,
  deleteGradingZipBestEffort,
  uploadGradingZip,
  type GradingZipStorage,
} from "./grading-zip-transport";
import { isKnownUploadPath } from "@/lib/syllabus-upload-source";

const MB = 1024 * 1024;

function fakeStorage(uploadError: { message: string } | null = null) {
  const upload = vi.fn(async () => ({ error: uploadError }));
  const remove = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({ upload, remove }));
  const storage: GradingZipStorage = { from };
  return { storage, upload, remove, from };
}

describe("uploadGradingZip builds only a grading-uploads path", () => {
  it("uploads to ${userId}/grading-uploads/<uuid>.zip in the course-files bucket", async () => {
    const { storage, upload, from } = fakeStorage();
    const file = new File(["zip"], "class.zip", { type: "application/zip" });
    const result = await uploadGradingZip(storage, "user-1", file, "abc-123");
    expect(result).toEqual({ ok: true, storagePath: "user-1/grading-uploads/abc-123.zip" });
    expect(from).toHaveBeenCalledWith("course-files");
    expect(upload).toHaveBeenCalledWith("user-1/grading-uploads/abc-123.zip", file, {
      contentType: "application/zip",
      upsert: false,
    });
    expect(isKnownUploadPath("user-1", "user-1/grading-uploads/abc-123.zip")).toBe(true);
  });

  it("reports a worded failure and no path when the upload errors", async () => {
    const { storage } = fakeStorage({ message: "boom" });
    const file = new File(["zip"], "class.zip");
    const result = await uploadGradingZip(storage, "user-1", file, "abc-123");
    expect(result).toEqual({ ok: false, message: 'Could not upload "class.zip" - try again.' });
  });
});

describe("chooseZipTransport", () => {
  it("is enabled now that BW2 provides the server ingest", () => {
    expect(GRADING_ZIP_STORAGE_INGEST_ENABLED).toBe(true);
    expect(chooseZipTransport({ name: "Class.zip", size: 12 * MB })).toEqual({ kind: "storage" });
  });

  it("keeps the body path for non-zip files and small zips, enabled or not", () => {
    expect(chooseZipTransport({ name: "a.docx", size: 20 * MB }, true)).toEqual({ kind: "body" });
    expect(chooseZipTransport({ name: "a.zip", size: 1 * MB }, true)).toEqual({ kind: "body" });
  });

  it("routes a large zip to storage when enabled, and leaves it to the body preflight when not", () => {
    expect(chooseZipTransport({ name: "Class.ZIP", size: 12 * MB }, true)).toEqual({ kind: "storage" });
    expect(chooseZipTransport({ name: "Class.zip", size: 12 * MB }, false)).toEqual({ kind: "body" });
  });

  it("refuses a zip over the 25 MB ceiling with a worded message", () => {
    const result = chooseZipTransport({ name: "a.zip", size: GRADING_ZIP_MAX_BYTES + 1 }, true);
    expect(result.kind).toBe("refused");
    if (result.kind === "refused") expect(result.message).toContain("Nothing was uploaded");
  });
});

describe("deleteGradingZipBestEffort", () => {
  it("removes the exact path from the bucket", async () => {
    const { storage, remove, from } = fakeStorage();
    await deleteGradingZipBestEffort(storage, "user-1/grading-uploads/abc.zip");
    expect(from).toHaveBeenCalledWith("course-files");
    expect(remove).toHaveBeenCalledWith(["user-1/grading-uploads/abc.zip"]);
  });

  it("never throws when the remove call throws", async () => {
    const storage: GradingZipStorage = {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => {
          throw new Error("network");
        },
      }),
    };
    await expect(deleteGradingZipBestEffort(storage, "user-1/grading-uploads/abc.zip")).resolves.toBeUndefined();
  });
});

describe("chooseSingleFileTransport (large-single-file W1)", () => {
  it("the single-file ceiling is the zip ceiling (one bucket limit covers both)", () => {
    expect(SINGLE_FILE_MAX_BYTES).toBe(GRADING_ZIP_MAX_BYTES);
    expect(SINGLE_FILE_MAX_BYTES).toBe(110_100_480);
  });

  it("a small docx under the wire budget stays on the body path", () => {
    expect(chooseSingleFileTransport({ name: "a.docx", size: 1 * MB }).kind).toBe("body");
    expect(chooseSingleFileTransport({ name: "a.docx", size: 2.5 * MB }).kind).toBe("body");
  });

  it("an over-budget office or text file goes to storage (the owner's 6 MiB docx)", () => {
    expect(chooseSingleFileTransport({ name: "SecurityUpgradePaper.docx", size: 6_354_708 }).kind).toBe("storage");
    expect(chooseSingleFileTransport({ name: "DECK.PPTX", size: 20 * MB }).kind).toBe("storage");
    expect(chooseSingleFileTransport({ name: "notes.txt", size: 5 * MB }).kind).toBe("storage");
  });

  it("an over-ceiling file is refused with a worded message", () => {
    const t = chooseSingleFileTransport({ name: "a.docx", size: SINGLE_FILE_MAX_BYTES + 1 });
    expect(t.kind).toBe("refused");
    if (t.kind === "refused") expect(t.message).toContain("Nothing was uploaded");
    expect(chooseSingleFileTransport({ name: "a.docx", size: SINGLE_FILE_MAX_BYTES }).kind).toBe("storage");
  });

  it("pdf, images and unknown kinds over budget keep the body path (their own refusal)", () => {
    for (const name of ["a.pdf", "a.png", "a.exe", "noext"]) {
      expect(chooseSingleFileTransport({ name, size: 20 * MB }).kind).toBe("body");
    }
  });

  it("ingest disabled over budget keeps the body path", () => {
    expect(chooseSingleFileTransport({ name: "a.docx", size: 20 * MB }, false).kind).toBe("body");
  });
});
