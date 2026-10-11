// VIDEO-GRADING W3 (ops T9/T11, section 7.2): the grade-time seam against fakes.
// Ownership (T11), the grade-time magic-byte sniff (the trust boundary), the
// size re-check, Storage cleanup policy, and the AbortController cleanup.
import { describe, it, expect, vi } from "vitest";
import { withEntryVideos, videoRefsOwnedBy, videoFilesOf, type VideoSeamDeps } from "./video-grade-seam";
import { VIDEO_MAX_BYTES } from "./video-limits";
import type { StudentSubmissionEntry } from "./types";
import type { GeminiFilesClient } from "../gemini-files";
import { VIDEO_FAILURE_CLASSES } from "./video-failure";

const PATH = "u1/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4";
const FOREIGN = "u2/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4";
const URI = "https://generativelanguage.googleapis.com/v1beta/files/x-1";
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31, 1, 2, 3]);

function entryOf(...paths: string[]): StudentSubmissionEntry {
  return {
    student: "Alice",
    content: "c",
    mergedFileCount: paths.length,
    submittedFiles: paths.map((p, i) => ({
      name: `v${i}.mp4`,
      extension: "mp4",
      previewContent: "",
      previewTruncated: false,
      mimeType: "video/mp4",
      videoRef: { storagePath: p, sizeBytes: 10 },
    })),
  };
}

function setup(objects: Record<string, { size?: number; bytes: Uint8Array } | undefined>, signal?: AbortSignal) {
  const upload = vi.fn(async () => ({ name: "files/f-1", uri: URI }));
  const deleteFile = vi.fn(async () => undefined);
  const download = vi.fn(async (path: string) => {
    const o = objects[path];
    return o
      ? {
          size: o.size ?? o.bytes.byteLength,
          arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength) as ArrayBuffer,
        }
      : null;
  });
  const removeObjects = vi.fn(async () => undefined);
  const filesClient: GeminiFilesClient = { upload, waitActive: vi.fn(async () => undefined), delete: deleteFile };
  const deps: VideoSeamDeps = { download, removeObjects, filesClient, newUploadId: () => "id" };
  return { deps, upload, deleteFile, download, removeObjects, ctx: { userId: "u1", uploadDeadlineMs: Date.now() + 60_000, signal } };
}

describe("T11: path ownership", () => {
  it("videoRefsOwnedBy accepts the caller's own object and rejects a foreign user's", () => {
    expect(videoRefsOwnedBy("u1", entryOf(PATH))).toBe(true);
    expect(videoRefsOwnedBy("u1", entryOf(FOREIGN))).toBe(false);
    expect(videoRefsOwnedBy("u1", entryOf(PATH, FOREIGN))).toBe(false);
    expect(videoRefsOwnedBy("u1", entryOf("u1/grading-uploads/../x.mp4"))).toBe(false);
    expect(videoFilesOf(entryOf(PATH))).toHaveLength(1);
  });

  it("the consuming edge re-checks: a foreign path never reaches Storage or the Files client", async () => {
    const s = setup({ [FOREIGN]: { bytes: MP4 } });
    const consume = vi.fn(async () => 1);
    const out = await withEntryVideos(s.deps, s.ctx, entryOf(FOREIGN), consume);
    expect(out).toMatchObject({ ok: false, failure: "not supported here" });
    expect(s.download).not.toHaveBeenCalled();
    expect(s.upload).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });
});

describe("the grade-time sniff and size re-check", () => {
  it("a non-video body under a .mp4 path is unsupported format: no upload, no grade, the Storage object is removed", async () => {
    const text = new TextEncoder().encode("this is plain text padding and not a video container at all");
    const s = setup({ [PATH]: { bytes: text } });
    const consume = vi.fn(async () => 1);
    const out = await withEntryVideos(s.deps, s.ctx, entryOf(PATH), consume);
    expect(out).toMatchObject({ ok: false, failure: "unsupported format" });
    expect(s.upload).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
    expect(s.removeObjects).toHaveBeenCalledWith([PATH]);
  });

  it("a heic-brand ISO file is refused", async () => {
    const heic = new Uint8Array(MP4);
    heic.set([0x68, 0x65, 0x69, 0x63], 8);
    const s = setup({ [PATH]: { bytes: heic } });
    const out = await withEntryVideos(s.deps, s.ctx, entryOf(PATH), async () => 1);
    expect(out).toMatchObject({ ok: false, failure: "unsupported format" });
    expect(s.upload).not.toHaveBeenCalled();
  });

  it("an object larger than VIDEO_MAX_BYTES is too large (terminal): removed, never read into memory", async () => {
    const s = setup({ [PATH]: { bytes: MP4, size: VIDEO_MAX_BYTES + 1 } });
    const out = await withEntryVideos(s.deps, s.ctx, entryOf(PATH), async () => 1);
    expect(out).toMatchObject({ ok: false, failure: "too large" });
    expect(s.upload).not.toHaveBeenCalled();
    expect(s.removeObjects).toHaveBeenCalledWith([PATH]);
  });

  it("a missing Storage object is a transient upload failure and nothing is removed", async () => {
    const s = setup({});
    const out = await withEntryVideos(s.deps, s.ctx, entryOf(PATH), async () => 1);
    expect(out).toMatchObject({ ok: false, failure: "upload failed" });
    expect(s.removeObjects).not.toHaveBeenCalled();
  });

  it("every failure message is a fixed sentence with no path, uri or key", async () => {
    const s = setup({ [PATH]: { bytes: new Uint8Array(40) } });
    const out = await withEntryVideos(s.deps, s.ctx, entryOf(PATH), async () => 1);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(VIDEO_FAILURE_CLASSES).toContain(out.failure);
      expect(out.message).not.toContain("grading-uploads");
      expect(out.message).not.toMatch(/https?:/);
    }
  });
});

describe("cleanup policy", () => {
  it("success: the Files object and the Storage object are both removed", async () => {
    const s = setup({ [PATH]: { bytes: MP4 } });
    const seen: unknown[] = [];
    const out = await withEntryVideos(s.deps, s.ctx, entryOf(PATH), async (att) => {
      seen.push(att);
      return "graded";
    });
    expect(out).toEqual({ ok: true, value: "graded" });
    expect(seen).toEqual([[{ name: "v0.mp4", fileUri: URI, mimeType: "video/mp4" }]]);
    expect(s.deleteFile).toHaveBeenCalledWith("files/f-1");
    expect(s.removeObjects).toHaveBeenCalledWith([PATH]);
  });

  it("a thrown consume is a model-rejected outcome; the Files object is deleted, the Storage object kept", async () => {
    const s = setup({ [PATH]: { bytes: MP4 } });
    const out = await withEntryVideos(s.deps, s.ctx, entryOf(PATH), async () => {
      throw new Error("model exploded " + URI);
    });
    expect(out).toMatchObject({ ok: false, failure: "model rejected" });
    expect(out.ok === false && out.message).not.toContain("exploded");
    expect(s.deleteFile).toHaveBeenCalledWith("files/f-1");
    expect(s.removeObjects).not.toHaveBeenCalled();
  });

  it("the route's AbortController: abort during the model call deletes the Files object and returns timed out", async () => {
    const controller = new AbortController();
    const s = setup({ [PATH]: { bytes: MP4 } }, controller.signal);
    const pending = withEntryVideos(s.deps, s.ctx, entryOf(PATH), () => new Promise<number>(() => undefined));
    await new Promise((r) => setTimeout(r, 5));
    expect(s.deleteFile).not.toHaveBeenCalled();
    controller.abort();
    const out = await pending;
    expect(out).toMatchObject({ ok: false, failure: "timed out" });
    expect(s.deleteFile).toHaveBeenCalledWith("files/f-1");
  });

  it("two videos: both are uploaded, both deleted, both Storage objects removed", async () => {
    const p2 = "u1/grading-uploads/3f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4";
    const s = setup({ [PATH]: { bytes: MP4 }, [p2]: { bytes: MP4 } });
    const out = await withEntryVideos(s.deps, s.ctx, entryOf(PATH, p2), async (att) => att.length);
    expect(out).toEqual({ ok: true, value: 2 });
    expect(s.upload).toHaveBeenCalledTimes(2);
    expect(s.deleteFile).toHaveBeenCalledTimes(2);
    expect(s.removeObjects).toHaveBeenCalledWith([PATH, p2]);
  });
});
