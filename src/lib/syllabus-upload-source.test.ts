// Contract for the temporary-object lifecycle the syllabus upload gains when
// it stops sending base64 through a server action
// (docs/upload-body-limit-acceptance-criteria.md AC2). Written BEFORE the
// implementation.
//
// Why this file exists at all: the syllabus upload PARSES the file and throws
// the bytes away - nothing in the app ever reads the original again. Under the
// old transport that was free, because the bytes only ever lived in a request
// body. Under the new one the browser writes a real object to a real bucket
// first, so "parsed and discarded" now requires someone to actually delete it.
// If that cleanup is missed, or is skipped when the parse throws, every failed
// syllabus upload leaves an invisible, billable object in a bucket nothing
// else enumerates - and no existing test, gate or UI would ever show it.
//
// The lifecycle is therefore expressed as a function that takes its storage
// client AS AN ARGUMENT, so both paths can be proven here with fakes rather
// than reasoned about in review. This is the same shape uploadTaskAttachment
// uses for the same class of problem.
import { describe, it, expect } from "vitest";
import { withUploadedSyllabusFile, isSyllabusUploadPath } from "./syllabus-upload-source";

/** A fake of the only two storage calls this lifecycle makes, recording the
 * order it was called in so the assertions below are about real sequencing
 * rather than the presence of a line of code. */
function fakeStorage(options: { bytes?: Uint8Array; downloadError?: string; removeError?: string } = {}) {
  const calls: string[] = [];
  const removed: string[][] = [];
  return {
    calls,
    removed,
    client: {
      async download(path: string) {
        calls.push(`download:${path}`);
        if (options.downloadError) return { data: null, error: { message: options.downloadError } };
        return { data: options.bytes ?? new Uint8Array([1, 2, 3]), error: null };
      },
      async remove(paths: string[]) {
        calls.push("remove");
        removed.push(paths);
        return { error: options.removeError ? { message: options.removeError } : null };
      },
    },
  };
}

const USER_ID = "user-1";
const PATH = "user-1/syllabus-uploads/abc.docx";

describe("withUploadedSyllabusFile: the happy path", () => {
  it("downloads the object, hands the bytes to the parser, and returns what the parser produced", async () => {
    const storage = fakeStorage({ bytes: new Uint8Array([9, 9]) });
    const seen: Uint8Array[] = [];
    const result = await withUploadedSyllabusFile(storage.client, USER_ID, PATH, async (bytes) => {
      seen.push(bytes);
      return "extracted text";
    });
    expect(seen).toEqual([new Uint8Array([9, 9])]);
    expect(result).toEqual({ ok: true, value: "extracted text" });
  });

  it("removes the temporary object AFTER the parse, never before - the parser must not race the delete", async () => {
    const storage = fakeStorage();
    const order: string[] = [];
    await withUploadedSyllabusFile(storage.client, USER_ID, PATH, async () => {
      order.push("parse");
      return "x";
    });
    expect(storage.calls).toEqual([`download:${PATH}`, "remove"]);
    expect(order).toEqual(["parse"]);
    expect(storage.removed).toEqual([[PATH]]);
  });
});

describe("withUploadedSyllabusFile: the object is removed even when things go wrong (AC2 item 9)", () => {
  it("removes the object when the PARSE THROWS - the failure path is the one that orphans", async () => {
    const storage = fakeStorage();
    const result = await withUploadedSyllabusFile(storage.client, USER_ID, PATH, async () => {
      throw new Error("not a readable docx");
    });
    expect(storage.calls).toContain("remove");
    expect(storage.removed).toEqual([[PATH]]);
    expect(result.ok).toBe(false);
  });

  it("surfaces the parse failure's own message rather than a generic one", async () => {
    const storage = fakeStorage();
    const result = await withUploadedSyllabusFile(storage.client, USER_ID, PATH, async () => {
      throw new Error("not a readable docx");
    });
    expect(result).toEqual({ ok: false, error: "not a readable docx" });
  });

  it("removes the object when the parser returns cleanly but the caller later fails - cleanup is not conditional on success", async () => {
    const storage = fakeStorage();
    await withUploadedSyllabusFile(storage.client, USER_ID, PATH, async () => null);
    expect(storage.removed).toEqual([[PATH]]);
  });

  it("still attempts removal when the DOWNLOAD fails, and never calls the parser", async () => {
    // A failed download does not prove the object is absent - it may be a
    // transient error against an object that really is there. Leaving it would
    // orphan it exactly as surely as skipping cleanup after a parse failure.
    const storage = fakeStorage({ downloadError: "network" });
    let parsed = 0;
    const result = await withUploadedSyllabusFile(storage.client, USER_ID, PATH, async () => {
      parsed += 1;
      return "x";
    });
    expect(parsed).toBe(0);
    expect(storage.calls).toContain("remove");
    expect(result.ok).toBe(false);
  });

  it("reports a real message when the download fails - never a crash and never a silent empty parse", async () => {
    const storage = fakeStorage({ downloadError: "object not found" });
    const result = await withUploadedSyllabusFile(storage.client, USER_ID, PATH, async () => "x");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("object not found");
      expect(result.error.trim()).not.toBe("");
    }
  });

  it("a failed CLEANUP does not mask a successful parse - the user's syllabus still lands", async () => {
    // The object is a temporary; failing to delete it is a storage-hygiene
    // problem, not a reason to tell the instructor their upload failed.
    const storage = fakeStorage({ removeError: "storage down" });
    const result = await withUploadedSyllabusFile(storage.client, USER_ID, PATH, async () => "extracted");
    expect(result).toEqual({ ok: true, value: "extracted" });
  });

  it("removes exactly the one path it was given, never a prefix or a wildcard", async () => {
    const storage = fakeStorage();
    await withUploadedSyllabusFile(storage.client, USER_ID, "user-1/syllabus-uploads/only-this.docx", async () => "x");
    expect(storage.removed).toEqual([["user-1/syllabus-uploads/only-this.docx"]]);
  });
});

// ---------------------------------------------------------------------------
// isSyllabusUploadPath / withUploadedSyllabusFile's path guard.
//
// storagePath arrives here as browser-supplied metadata, and this lifecycle
// both downloads AND deletes whatever path it is handed, against a
// service-role client that bypasses RLS - so an unvalidated path would let a
// malformed or hostile call point the download-and-delete at any other
// object in the "course-files" bucket under the same user prefix (a course's
// materials zip, or a Tasks-cell attachment). These tests prove the guard
// runs BEFORE either Storage call, not merely that it eventually reports an
// error.
// ---------------------------------------------------------------------------
describe("isSyllabusUploadPath", () => {
  it("accepts a path under this user's own syllabus-uploads prefix", () => {
    expect(isSyllabusUploadPath("user-1", "user-1/syllabus-uploads/abc.docx")).toBe(true);
  });

  it("rejects a path with no uploadId/extension after the prefix", () => {
    expect(isSyllabusUploadPath("user-1", "user-1/syllabus-uploads/")).toBe(false);
  });

  it("rejects a course materials path - the same bucket, a different segment", () => {
    expect(isSyllabusUploadPath("user-1", "user-1/course-9/materials.zip")).toBe(false);
  });

  it("rejects a Tasks-cell attachment path - the same bucket, a different segment", () => {
    expect(isSyllabusUploadPath("user-1", "user-1/course-9/task-attachments/attach-1.pdf")).toBe(false);
  });

  it("rejects another user's syllabus-uploads path", () => {
    expect(isSyllabusUploadPath("user-1", "user-2/syllabus-uploads/abc.docx")).toBe(false);
  });

  it("rejects a path that merely CONTAINS the prefix without starting with it", () => {
    expect(isSyllabusUploadPath("user-1", "attacker/user-1/syllabus-uploads/abc.docx")).toBe(false);
  });
});

describe("withUploadedSyllabusFile: a mismatched path is refused before any Storage call", () => {
  it("makes NO download and NO remove call for a path outside this user's syllabus-uploads prefix", async () => {
    const storage = fakeStorage();

    const result = await withUploadedSyllabusFile(
      storage.client,
      "user-1",
      "user-1/course-9/materials.zip",
      async () => "should never run"
    );

    expect(result.ok).toBe(false);
    expect(storage.calls).toEqual([]);
  });

  it("never calls consume for a mismatched path", async () => {
    const storage = fakeStorage();
    let consumed = 0;

    await withUploadedSyllabusFile(storage.client, "user-1", "user-2/syllabus-uploads/abc.docx", async () => {
      consumed += 1;
      return "x";
    });

    expect(consumed).toBe(0);
  });

  it("reports a real, non-empty error message rather than crashing or returning ok", async () => {
    const storage = fakeStorage();
    const result = await withUploadedSyllabusFile(storage.client, "user-1", "user-1/course-9/materials.zip", async () => "x");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.trim()).not.toBe("");
    }
  });
});
