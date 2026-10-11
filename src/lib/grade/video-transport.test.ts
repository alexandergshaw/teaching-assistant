// VIDEO-GRADING W2: the loose-video transport leaf. T2 (hostile path table,
// SSRF-free: there is no URL input anywhere), T3 client boundary, T5 pending
// cap, the O-10 extension bind, and uploadGradingVideo's closed content-type.
import { describe, it, expect, vi } from "vitest";
import {
  VIDEO_NOT_ENABLED_MESSAGE,
  decideVideoTransport,
  hasVideoExtension,
  isVideoUploadPath,
  uploadGradingVideo,
  videoContentTypeFor,
  videoStoragePath,
} from "./video-transport";
import { VIDEO_MAX_BYTES, VIDEO_MAX_PENDING_STAGED } from "./video-limits";
import type { GradingZipStorage } from "./grading-zip-transport";
import { isKnownUploadPath } from "@/lib/syllabus-upload-source";

const UID = "11111111-2222-4333-8444-555555555555";
const OBJ = "2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b";
const GOOD = `${UID}/grading-uploads/${OBJ}.mp4`;

describe("T2: isVideoUploadPath", () => {
  it("accepts the shape this feature writes (positive control), for every closed extension", () => {
    for (const ext of ["mp4", "webm", "mov", "m4v"]) {
      expect(isVideoUploadPath(UID, `${UID}/grading-uploads/${OBJ}.${ext}`)).toBe(true);
    }
  });

  it("is exactly what videoStoragePath builds", () => {
    expect(isVideoUploadPath(UID, videoStoragePath(UID, OBJ, "mp4"))).toBe(true);
    expect(isKnownUploadPath(UID, videoStoragePath(UID, OBJ, "mp4"))).toBe(true);
  });

  it.each([
    ["traversal", `${UID}/grading-uploads/../x/${OBJ}.mp4`],
    ["traversal to another user", `${UID}/grading-uploads/../../other/${OBJ}.mp4`],
    ["encoded dot-dot", `${UID}/grading-uploads/%2e%2e/${OBJ}.mp4`],
    ["encoded separator", `${UID}/grading-uploads/%2fx${OBJ}.mp4`],
    ["foreign user", `someone-else/grading-uploads/${OBJ}.mp4`],
    ["wrong segment", `${UID}/syllabus-uploads/${OBJ}.mp4`],
    ["rubric segment", `${UID}/rubric-uploads/${OBJ}.mp4`],
    ["course path", `${UID}/course-1/${OBJ}.mp4`],
    ["zip extension", `${UID}/grading-uploads/${OBJ}.zip`],
    ["four segments", `${UID}/grading-uploads/sub/${OBJ}.mp4`],
    ["two segments", `${UID}/${OBJ}.mp4`],
    ["uppercase extension", `${UID}/grading-uploads/${OBJ}.MP4`],
    ["uppercase uuid", `${UID}/grading-uploads/${OBJ.toUpperCase()}.mp4`],
    ["not a uuid", `${UID}/grading-uploads/abc.mp4`],
    ["uuid v1 (not v4)", `${UID}/grading-uploads/2f8a4b1e-5c3d-1e6f-8a9b-0c1d2e3f4a5b.mp4`],
    ["bad variant nibble", `${UID}/grading-uploads/2f8a4b1e-5c3d-4e6f-1a9b-0c1d2e3f4a5b.mp4`],
    ["mkv extension", `${UID}/grading-uploads/${OBJ}.mkv`],
    ["double extension", `${UID}/grading-uploads/${OBJ}.mp4.zip`],
    ["trailing slash", `${UID}/grading-uploads/${OBJ}.mp4/`],
    ["backslash", `${UID}/grading-uploads\\${OBJ}.mp4`],
    ["empty", ""],
    ["NUL byte", `${UID}/grading-uploads/${OBJ}.mp4\u0000`],
    ["300-char name", `${UID}/grading-uploads/${"a".repeat(300)}.mp4`],
    ["a URL, not a path", `https://evil.example/${UID}/grading-uploads/${OBJ}.mp4`],
    ["leading slash", `/${UID}/grading-uploads/${OBJ}.mp4`],
  ])("rejects %s", (_label, path) => {
    expect(isVideoUploadPath(UID, path)).toBe(false);
  });

  it("rejects non-string input and an empty user id", () => {
    expect(isVideoUploadPath(UID, undefined as unknown as string)).toBe(false);
    expect(isVideoUploadPath("", GOOD)).toBe(false);
  });
});

describe("decideVideoTransport", () => {
  const file = (size: number, name = "demo.mp4") => ({ name, size });

  it("a non-video goes on to today's path untouched", () => {
    expect(decideVideoTransport(file(5, "a.docx"), 0, true)).toEqual({ kind: "not-video" });
    expect(decideVideoTransport(file(5, "a.zip"), 99, false)).toEqual({ kind: "not-video" });
    expect(hasVideoExtension("CLIP.MOV")).toBe(true);
    expect(hasVideoExtension("clip.mkv")).toBe(false);
  });

  it("disabled -> refused 'not supported here' with the worded text, before any size check", () => {
    const d = decideVideoTransport(file(VIDEO_MAX_BYTES * 2), 0, false);
    expect(d).toEqual({ kind: "refused", failure: "not supported here", message: VIDEO_NOT_ENABLED_MESSAGE });
  });

  it("T3: MAX-1 and MAX are accepted, MAX+1 is refused 'too large'", () => {
    expect(decideVideoTransport(file(VIDEO_MAX_BYTES - 1), 0, true).kind).toBe("storage");
    expect(decideVideoTransport(file(VIDEO_MAX_BYTES), 0, true).kind).toBe("storage");
    const over = decideVideoTransport(file(VIDEO_MAX_BYTES + 1), 0, true);
    expect(over).toMatchObject({ kind: "refused", failure: "too large" });
    if (over.kind === "refused") {
      expect(over.message).toContain("Nothing was uploaded");
      expect(over.message).not.toMatch(/archive/i);
    }
  });

  it("an empty file is 'unsupported format'", () => {
    expect(decideVideoTransport(file(0), 0, true)).toMatchObject({ kind: "refused", failure: "unsupported format" });
  });

  it("T5: VIDEO_MAX_PENDING_STAGED - 1 pending is ok, VIDEO_MAX_PENDING_STAGED is refused 'too many videos'", () => {
    expect(VIDEO_MAX_PENDING_STAGED).toBe(6);
    expect(decideVideoTransport(file(10), VIDEO_MAX_PENDING_STAGED - 1, true).kind).toBe("storage");
    expect(decideVideoTransport(file(10), VIDEO_MAX_PENDING_STAGED, true)).toMatchObject({
      kind: "refused",
      failure: "too many videos",
    });
  });
});

function fakeStorage(uploadError: { message: string } | null = null) {
  const upload = vi.fn(async () => ({ error: uploadError }));
  const remove = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({ upload, remove }));
  const storage: GradingZipStorage = { from };
  return { storage, upload, from };
}

describe("uploadGradingVideo", () => {
  it("uploads to ${userId}/grading-uploads/<uuid>.<ext> with the CLOSED content type, never File.type", async () => {
    const { storage, upload, from } = fakeStorage();
    // File.type lies (claims a zip); the closed map decides.
    const file = new File(["x"], "Demo Walkthrough.MOV", { type: "application/zip" });
    const result = await uploadGradingVideo(storage, UID, file, OBJ);
    expect(result).toEqual({ ok: true, storagePath: `${UID}/grading-uploads/${OBJ}.mov` });
    expect(from).toHaveBeenCalledWith("course-files");
    expect(upload).toHaveBeenCalledWith(`${UID}/grading-uploads/${OBJ}.mov`, file, {
      contentType: "video/quicktime",
      upsert: false,
    });
    expect(isVideoUploadPath(UID, (result as { storagePath: string }).storagePath)).toBe(true);
  });

  it("the path never contains the client file name", async () => {
    const { storage } = fakeStorage();
    const result = await uploadGradingVideo(storage, UID, new File(["x"], "Jordan Lee ../../x.mp4"), OBJ);
    expect(result.ok && result.storagePath).toBe(`${UID}/grading-uploads/${OBJ}.mp4`);
  });

  it("a generated id is a v4 uuid that passes the path contract", async () => {
    const { storage } = fakeStorage();
    const result = await uploadGradingVideo(storage, UID, new File(["x"], "a.webm"));
    expect(result.ok && isVideoUploadPath(UID, result.storagePath)).toBe(true);
  });

  it("an upload error or throw is typed 'upload failed' with a worded message", async () => {
    const failing = fakeStorage({ message: "boom" });
    const r1 = await uploadGradingVideo(failing.storage, UID, new File(["x"], "a.mp4"), OBJ);
    expect(r1).toEqual({ ok: false, failure: "upload failed", message: 'Could not upload "a.mp4" - try again.' });
    const throwing: GradingZipStorage = {
      from: () => ({
        upload: async () => {
          throw new Error("net");
        },
        remove: async () => ({ error: null }),
      }),
    };
    const r2 = await uploadGradingVideo(throwing, UID, new File(["x"], "a.mp4"), OBJ);
    expect(r2).toMatchObject({ ok: false, failure: "upload failed" });
  });

  it("an extension outside the closed map uploads nothing", async () => {
    const { storage, upload } = fakeStorage();
    const result = await uploadGradingVideo(storage, UID, new File(["x"], "a.mkv"), OBJ);
    expect(result).toMatchObject({ ok: false, failure: "unsupported format" });
    expect(upload).not.toHaveBeenCalled();
    expect(videoContentTypeFor("mkv")).toBeNull();
  });
});
