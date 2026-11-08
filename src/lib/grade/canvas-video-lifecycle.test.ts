import { describe, expect, it, vi } from "vitest";
import { stageCanvasVideosWithLifecycle } from "./canvas-video-lifecycle";

const path = "owner/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4";
const bytes = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 2, 0, 105, 115, 111, 109, 109, 112, 52, 49, 1, 2, 3]);
const file = { name: "demo.mp4", mimeType: "video/mp4", base64: bytes.toString("base64") };
function deps() { return { allocate: vi.fn(() => path), reserve: vi.fn< (owner: string, path: string) => Promise<boolean> >().mockResolvedValue(true), upload: vi.fn< (path: string, bytes: Buffer, mime: string) => Promise<boolean> >().mockResolvedValue(true), remove: vi.fn< (paths: string[]) => Promise<void> >().mockResolvedValue(undefined) }; }

describe("Canvas staged video lifecycle", () => {
  it("reserves the authenticated owner's path before starting upload", async () => {
    const io = deps();
    io.upload.mockImplementation(async () => { expect(io.reserve).toHaveBeenCalledWith("owner", path); return true; });
    const result = await stageCanvasVideosWithLifecycle("owner", [file], io);
    expect(result.ok).toBe(true);
    expect(io.reserve.mock.invocationCallOrder[0]).toBeLessThan(io.upload.mock.invocationCallOrder[0]);
    expect(io.remove).not.toHaveBeenCalled();
  });
  it.each([false, "throw"])("never uploads if durable reservation fails: %s", async failure => {
    const io = deps();
    if (failure === "throw") io.reserve.mockRejectedValueOnce(new Error("offline")); else io.reserve.mockResolvedValueOnce(false);
    const result = await stageCanvasVideosWithLifecycle("owner", [file], io);
    expect(result.ok).toBe(false); expect(io.upload).not.toHaveBeenCalled();
    expect(io.remove).not.toHaveBeenCalled();
    expect(result).toMatchObject({ uncertainPaths: [path] });
  });
  it("keeps a reservation when an upload outcome is uncertain", async () => {
    const records: string[] = [];
    const io = deps(); io.reserve.mockImplementation(async (_owner, value) => { records.push(value); return true; });
    io.upload.mockRejectedValueOnce(new Error("timeout"));
    const result = await stageCanvasVideosWithLifecycle("owner", [file], io);
    expect(result).toMatchObject({ ok: false, uncertainPaths: [path] });
    expect(records).toEqual([path]);
  });
  it("rejects foreign allocation before reservation or upload", async () => {
    const io = deps(); io.allocate.mockReturnValueOnce(path.replace("owner/", "other/"));
    expect(await stageCanvasVideosWithLifecycle("owner", [file], io)).toMatchObject({ ok: false });
    expect(io.reserve).not.toHaveBeenCalled(); expect(io.upload).not.toHaveBeenCalled();
  });
});
