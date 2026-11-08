import { describe, expect, it, vi } from "vitest";
import { stageCanvasVideos } from "./canvas-video-stage";

const bytes = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 2, 0, 105, 115, 111, 109, 109, 112, 52, 49, 1, 2, 3]);
const video = { name: "demo.mp4", mimeType: "video/mp4", base64: bytes.toString("base64") };
const first = "u1/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4";
const second = "u1/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5c.mp4";
function deps() { return { allocate: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second), upload: vi.fn< (path: string, bytes: Buffer, mime: string) => Promise<boolean> >().mockResolvedValue(true), remove: vi.fn< (paths: string[]) => Promise<void> >().mockResolvedValue(undefined) }; }

describe("Canvas video staging seam", () => {
  it("preserves file indices and never returns video bytes", async () => {
    const io = deps();
    const out = await stageCanvasVideos("u1", [{ name: "answer.txt", mimeType: "text/plain", base64: "YQ==" }, video], io);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.files.get(1)?.videoRef).toEqual({ storagePath: first, sizeBytes: bytes.length });
    expect(out.files.has(0)).toBe(false);
    expect(io.upload).toHaveBeenCalledWith(first, bytes, "video/mp4");
    expect(io.remove).not.toHaveBeenCalled();
  });
  it("cleans earlier and uncertain uploads on partial failure", async () => {
    const io = deps(); io.upload.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("network"));
    const out = await stageCanvasVideos("u1", [video, video], io);
    expect(out).toMatchObject({ ok: false, reason: "video upload failed", cleanupFailed: true, uncertainPaths: [second] });
    expect(io.remove).toHaveBeenCalledWith([first, second]);
  });
  it("never uploads or deletes a foreign allocation", async () => {
    const io = deps(); io.allocate.mockReset().mockReturnValue(first.replace("u1/", "u2/"));
    const out = await stageCanvasVideos("u1", [video], io);
    expect(out).toMatchObject({ ok: false, reason: "invalid storage allocation" });
    expect(io.upload).not.toHaveBeenCalled(); expect(io.remove).not.toHaveBeenCalled();
  });
  it("reports cleanup failures rather than claiming removal", async () => {
    const io = deps(); io.upload.mockResolvedValue(false); io.remove.mockRejectedValue(new Error("network"));
    expect(await stageCanvasVideos("u1", [video], io)).toMatchObject({ ok: false, cleanupFailed: true });
  });
  it("retains an uncertain path even if deletion precedes a late write", async () => {
    const io = deps(); let writeLater!: () => void; const objects = new Set<string>();
    io.upload.mockImplementationOnce(async path => { writeLater = () => objects.add(path); throw new Error("ambiguous timeout"); });
    io.remove.mockImplementationOnce(async paths => { paths.forEach(path => objects.delete(path)); });
    const out = await stageCanvasVideos("u1", [video], io);
    writeLater();
    expect(objects.has(first)).toBe(true);
    expect(out).toMatchObject({ ok: false, cleanupFailed: true, uncertainPaths: [first] });
  });
  it("cleans earlier uploads if a later allocation throws", async () => {
    const io = deps(); io.allocate.mockReset().mockReturnValueOnce(first).mockImplementationOnce(() => { throw new Error("allocation failed"); });
    expect(await stageCanvasVideos("u1", [video, video], io)).toMatchObject({ ok: false, reason: "invalid storage allocation" });
    expect(io.remove).toHaveBeenCalledWith([first]);
  });
  it("returns all unremoved paths when cleanup fails after a prior success", async () => {
    const io = deps(); io.upload.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("timeout")); io.remove.mockRejectedValueOnce(new Error("offline"));
    expect(await stageCanvasVideos("u1", [video, video], io)).toMatchObject({ ok: false, cleanupFailed: true, uncertainPaths: [second], unremovedPaths: [first, second] });
  });
  it("does not upload invalid bytes even when labeled as video", async () => {
    const io = deps();
    expect(await stageCanvasVideos("u1", [{ ...video, base64: "YQ==" }], io)).toMatchObject({ ok: false, reason: "unsupported video format" });
    expect(io.upload).not.toHaveBeenCalled();
  });
});
