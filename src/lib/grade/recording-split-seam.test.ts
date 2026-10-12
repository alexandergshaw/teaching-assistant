// RECORDING ONE-VS-MANY W1: the classification seam against fakes. The ruled
// contract { split, failed? } - an error-fallback single is DISTINGUISHABLE from a
// model-confirmed single - and the Files lifecycle (delete on every path).
import { describe, it, expect, vi } from "vitest";
import { classifyRecording, type RecordingSplitDeps } from "./recording-split-seam";
import type { LlmResult } from "../llm";
import type { GeminiFilesClient } from "../gemini-files";

const PATH = "u1/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4";
const URI = "https://generativelanguage.googleapis.com/v1beta/files/x-1";
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31, 1, 2, 3]);
const INPUT = { videoRef: { storagePath: PATH, sizeBytes: MP4.byteLength }, assignmentInstructions: "a", rubric: "r" };

function setup(callLlm: RecordingSplitDeps["callLlm"]) {
  const upload = vi.fn(async () => ({ name: "files/f-1", uri: URI }));
  const deleteFile = vi.fn(async () => undefined);
  const removeObjects = vi.fn(async () => undefined);
  const filesClient: GeminiFilesClient = { upload, waitActive: vi.fn(async () => undefined), delete: deleteFile };
  const deps: RecordingSplitDeps = {
    download: async () => ({ size: MP4.byteLength, arrayBuffer: async () => MP4.buffer.slice(0) as ArrayBuffer }),
    removeObjects,
    filesClient,
    newUploadId: () => "id",
    callLlm,
  };
  return { deps, upload, deleteFile, removeObjects, ctx: { userId: "u1", uploadDeadlineMs: Date.now() + 60_000 } };
}

const ok = (text: string): LlmResult => ({ ok: true, text });

describe("classifyRecording: the ruled { split, failed? } contract", () => {
  it("a model-confirmed single has failed ABSENT", async () => {
    const s = setup(vi.fn(async () => ok('{"kind":"single"}')));
    const out = await classifyRecording(s.deps, s.ctx, INPUT);
    expect(out).toEqual({ split: { kind: "single" } });
    expect("failed" in out).toBe(false);
  });

  it("a confirmed multiple returns its segments with failed absent", async () => {
    const text = '{"kind":"multiple","segments":[{"startSec":0,"endSec":30,"label":"A"},{"startSec":30,"endSec":60,"label":"B"}]}';
    const s = setup(vi.fn(async () => ok(text)));
    const out = await classifyRecording(s.deps, s.ctx, INPUT);
    expect(out.split.kind).toBe("multiple");
    expect("failed" in out).toBe(false);
  });

  it("a callLlm that THROWS is { single, failed: true }", async () => {
    const s = setup(
      vi.fn(async () => {
        throw new Error("boom");
      })
    );
    expect(await classifyRecording(s.deps, s.ctx, INPUT)).toEqual({ split: { kind: "single" }, failed: true });
  });

  it("a not-ok model result is { single, failed: true }", async () => {
    const s = setup(vi.fn(async () => ({ ok: false, status: 500, body: "x" }) as LlmResult));
    expect(await classifyRecording(s.deps, s.ctx, INPUT)).toEqual({ split: { kind: "single" }, failed: true });
  });

  it("an unreadable answer is { single, failed: true }", async () => {
    const s = setup(vi.fn(async () => ok("no idea")));
    expect(await classifyRecording(s.deps, s.ctx, INPUT)).toEqual({ split: { kind: "single" }, failed: true });
  });

  it("a foreign path never reaches the model", async () => {
    const callLlm = vi.fn(async () => ok('{"kind":"single"}'));
    const s = setup(callLlm);
    const out = await classifyRecording(s.deps, s.ctx, {
      ...INPUT,
      videoRef: { storagePath: PATH.replace("u1/", "u2/"), sizeBytes: 1 },
    });
    expect(out.failed).toBe(true);
    expect(callLlm).not.toHaveBeenCalled();
    expect(s.upload).not.toHaveBeenCalled();
  });
});

describe("classifyRecording: Files and Storage lifecycle", () => {
  it("success: makes ONE model call with the video attached, deletes the Files upload, KEEPS the Storage object", async () => {
    const callLlm = vi.fn(async () => ok('{"kind":"single"}'));
    const s = setup(callLlm);
    await classifyRecording(s.deps, s.ctx, INPUT);
    expect(callLlm).toHaveBeenCalledTimes(1);
    const req = (callLlm.mock.calls[0] as unknown as [{ contents: { parts: unknown[] }[] }])[0];
    expect(req.contents[0].parts).toContainEqual({ fileData: { fileUri: URI, mimeType: "video/mp4" } });
    expect(s.deleteFile).toHaveBeenCalledWith("files/f-1");
    expect(s.removeObjects).not.toHaveBeenCalled();
  });

  it("the throw path still deletes the Files upload and keeps the Storage object", async () => {
    const s = setup(
      vi.fn(async () => {
        throw new Error("boom");
      })
    );
    await classifyRecording(s.deps, s.ctx, INPUT);
    expect(s.upload).toHaveBeenCalledTimes(1);
    expect(s.deleteFile).toHaveBeenCalledWith("files/f-1");
    expect(s.removeObjects).not.toHaveBeenCalled();
  });

  it("the not-ok path deletes the Files upload too", async () => {
    const s = setup(vi.fn(async () => ({ ok: false, status: 503, body: "" }) as LlmResult));
    await classifyRecording(s.deps, s.ctx, INPUT);
    expect(s.deleteFile).toHaveBeenCalledTimes(1);
  });
});
