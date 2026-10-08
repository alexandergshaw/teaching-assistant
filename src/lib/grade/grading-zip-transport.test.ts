// BULK-ZIP BW1: the client half of the Storage transport. Pins the path-bind
// (the client builds ONLY a grading-uploads path under the caller's uid), the
// transport choice, and the delete-on-reject courtesy. Whether the upload
// actually fires in a browser is an owner-walk.
import { describe, it, expect, vi } from "vitest";
import {
  GRADING_ZIP_MAX_BYTES,
  GRADING_ZIP_STORAGE_INGEST_ENABLED,
  chooseZipTransport,
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
  it("ships disabled until BW2 provides the server ingest", () => {
    expect(GRADING_ZIP_STORAGE_INGEST_ENABLED).toBe(false);
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
