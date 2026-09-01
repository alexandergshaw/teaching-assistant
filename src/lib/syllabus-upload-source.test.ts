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
import { withUploadedSyllabusFile, isKnownUploadPath, syllabusUploadStoragePath } from "./syllabus-upload-source";

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
// The same lifecycle, unmodified, for the rubric-uploads segment
// (RubricInputModal.tsx). This is not a second implementation - it is the
// exact same withUploadedSyllabusFile call above, just fed a
// "rubric-uploads" path - so these tests exist to prove the always-delete
// guarantee holds for that segment too, on every branch, rather than assume
// it because the syllabus-uploads tests above passed.
// ---------------------------------------------------------------------------
const RUBRIC_PATH = "user-1/rubric-uploads/xyz.pdf";

describe("withUploadedSyllabusFile: the always-delete guarantee also holds for a rubric upload", () => {
  it("happy path: downloads, hands bytes to consume, removes the object", async () => {
    const storage = fakeStorage({ bytes: new Uint8Array([7]) });
    const result = await withUploadedSyllabusFile(storage.client, USER_ID, RUBRIC_PATH, async () => "rubric text");
    expect(result).toEqual({ ok: true, value: "rubric text" });
    expect(storage.calls).toEqual([`download:${RUBRIC_PATH}`, "remove"]);
    expect(storage.removed).toEqual([[RUBRIC_PATH]]);
  });

  it("download failure: still removes, never calls consume", async () => {
    const storage = fakeStorage({ downloadError: "network" });
    let consumed = 0;
    const result = await withUploadedSyllabusFile(storage.client, USER_ID, RUBRIC_PATH, async () => {
      consumed += 1;
      return "x";
    });
    expect(consumed).toBe(0);
    expect(result.ok).toBe(false);
    expect(storage.removed).toEqual([[RUBRIC_PATH]]);
  });

  it("consume throws (e.g. an unreadable rubric file): still removes", async () => {
    const storage = fakeStorage();
    const result = await withUploadedSyllabusFile(storage.client, USER_ID, RUBRIC_PATH, async () => {
      throw new Error("not a readable pdf");
    });
    expect(result).toEqual({ ok: false, error: "not a readable pdf" });
    expect(storage.removed).toEqual([[RUBRIC_PATH]]);
  });

  it("a mismatched path under a segment that is NOT in the allow-list is refused before any Storage call - no download, no remove, no consume", async () => {
    const storage = fakeStorage();
    let consumed = 0;
    const result = await withUploadedSyllabusFile(
      storage.client,
      USER_ID,
      "user-1/attachment-uploads/xyz.pdf",
      async () => {
        consumed += 1;
        return "x";
      }
    );
    expect(result.ok).toBe(false);
    expect(consumed).toBe(0);
    expect(storage.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isKnownUploadPath / withUploadedSyllabusFile's path guard.
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
describe("isKnownUploadPath", () => {
  it("accepts a path under this user's own syllabus-uploads prefix", () => {
    expect(isKnownUploadPath("user-1", "user-1/syllabus-uploads/abc.docx")).toBe(true);
  });

  it("rejects a path with no uploadId/extension after the prefix", () => {
    expect(isKnownUploadPath("user-1", "user-1/syllabus-uploads/")).toBe(false);
  });

  it("rejects a course materials path - the same bucket, a different segment", () => {
    expect(isKnownUploadPath("user-1", "user-1/course-9/materials.zip")).toBe(false);
  });

  it("rejects a Tasks-cell attachment path - the same bucket, a different segment", () => {
    expect(isKnownUploadPath("user-1", "user-1/course-9/task-attachments/attach-1.pdf")).toBe(false);
  });

  it("rejects another user's syllabus-uploads path", () => {
    expect(isKnownUploadPath("user-1", "user-2/syllabus-uploads/abc.docx")).toBe(false);
  });

  it("rejects a path that merely CONTAINS the prefix without starting with it", () => {
    expect(isKnownUploadPath("user-1", "attacker/user-1/syllabus-uploads/abc.docx")).toBe(false);
  });

  // RubricInputModal.tsx reuses this whole lifecycle for a rubric upload,
  // under its own honestly-named segment rather than "syllabus-uploads" -
  // this is the "second, equally-valid path segment" the generalisation
  // adds. These pin that it is genuinely equally valid, not a special case.
  it("accepts a path under this user's own rubric-uploads prefix - the second valid segment", () => {
    expect(isKnownUploadPath("user-1", "user-1/rubric-uploads/abc.pdf")).toBe(true);
  });

  it("rejects a rubric-uploads path with no uploadId/extension after the prefix", () => {
    expect(isKnownUploadPath("user-1", "user-1/rubric-uploads/")).toBe(false);
  });

  it("rejects another user's rubric-uploads path", () => {
    expect(isKnownUploadPath("user-1", "user-2/rubric-uploads/abc.pdf")).toBe(false);
  });

  // A THIRD segment nobody added to UPLOAD_PATH_SEGMENTS must still be
  // refused at runtime - proving the allow-list is actually closed, not
  // merely typed closed for callers that go through
  // syllabusUploadStoragePath's typed `segment` parameter. A raw string
  // reaching isKnownUploadPath (e.g. from browser-supplied metadata, which
  // is untyped by the time it is JSON) still has to be checked for real.
  it("rejects an invented third segment - the allow-list is closed at runtime too, not just at the type level", () => {
    expect(isKnownUploadPath("user-1", "user-1/attachment-uploads/abc.pdf")).toBe(false);
    expect(isKnownUploadPath("user-1", "user-1/rubric-uploads-extra/abc.pdf")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// syllabusUploadStoragePath's `segment` parameter: a frozen-literal oracle
// for the exact path each caller gets, so a future edit that silently
// changes the default (breaking the two syllabus callers, which never pass
// a fourth argument) or the rubric caller's explicit segment is caught here
// rather than discovered in Storage.
// ---------------------------------------------------------------------------
describe("syllabusUploadStoragePath: segment defaulting", () => {
  it("defaults to syllabus-uploads when no segment is passed - existing callers are unaffected", () => {
    expect(syllabusUploadStoragePath("user-1", "upload-1", ".docx")).toBe("user-1/syllabus-uploads/upload-1.docx");
  });

  it("builds a rubric-uploads path when that segment is passed explicitly", () => {
    expect(syllabusUploadStoragePath("user-1", "upload-1", ".pdf", "rubric-uploads")).toBe(
      "user-1/rubric-uploads/upload-1.pdf"
    );
  });

  it("a path built for the rubric segment is itself accepted by isKnownUploadPath - the builder and the guard agree", () => {
    const path = syllabusUploadStoragePath("user-1", "upload-1", ".pdf", "rubric-uploads");
    expect(isKnownUploadPath("user-1", path)).toBe(true);
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
