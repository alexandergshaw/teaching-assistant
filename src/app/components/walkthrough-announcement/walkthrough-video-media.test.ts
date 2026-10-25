import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/caption-burn", () => ({ awaitVideoMetadata: vi.fn(async () => undefined), awaitVideoFrameData: vi.fn(async () => undefined),
  ensureFiniteDuration: vi.fn(async () => 120), seekVideoTo: vi.fn(async () => "seeked") }));
import { seekVideoTo, awaitVideoFrameData, awaitVideoMetadata } from "@/lib/caption-burn";
import { createVideoReader } from "./walkthrough-video-media";
import { EXTRACT_BATCH_WIRE_BUDGET, FRAME_JPEG_QUALITY } from "../recording/discussion-capture";
function harness() {
  const video = { preload: "", muted: false, playsInline: false, src: "", videoWidth: 5120, videoHeight: 2880,
    pause: vi.fn(), dispatchEvent: vi.fn(), removeAttribute: vi.fn(), load: vi.fn() };
  const drawImage = vi.fn();
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ drawImage })), toDataURL: vi.fn(() => "data:image/jpeg;base64,small-frame") };
  vi.stubGlobal("document", { createElement: (name: string) => name === "video" ? video : canvas });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-video");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const reader = createVideoReader(new Blob(["local"])); const controller = new AbortController();
  return { reader, video, canvas, drawImage, revoke, controller };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("uploaded browser media adapter", () => {
  it("uses bounded metadata/seek/frame primitives and text legibility sizing; disposes every local resource", async () => {
    const h = harness();
    expect(await h.reader.duration(h.controller.signal)).toBe(120);
    expect(await h.reader.frame(119.9, h.controller.signal)).toBe("small-frame");
    expect(awaitVideoMetadata).toHaveBeenCalledWith(h.video, 20_000);
    expect(seekVideoTo).toHaveBeenCalledWith(h.video, 119.9);
    expect(awaitVideoFrameData).toHaveBeenCalledWith(h.video, 20_000);
    expect(h.canvas.width).toBe(2560); expect(h.canvas.height).toBe(1440);
    expect(h.canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", FRAME_JPEG_QUALITY);
    h.reader.dispose(); h.reader.dispose();
    expect(h.video.pause).toHaveBeenCalledOnce(); expect(h.video.removeAttribute).toHaveBeenCalledWith("src");
    expect(h.video.load).toHaveBeenCalledOnce(); expect(h.revoke).toHaveBeenCalledOnce(); expect(h.canvas.width).toBe(0);
  });
  it("rejects a stalled seek without encoding a misleading timestamp", async () => {
    const h = harness(); vi.mocked(seekVideoTo).mockResolvedValueOnce("stalled");
    await expect(h.reader.frame(30, h.controller.signal)).rejects.toMatchObject({ code: "seek-stalled" });
    expect(h.drawImage).not.toHaveBeenCalled(); expect(h.canvas.toDataURL).not.toHaveBeenCalled(); h.reader.dispose();
  });
  it("tries the existing quality downgrade and refuses a still oversized frame", async () => {
    const h = harness(); h.canvas.toDataURL.mockReturnValue(`data:image/jpeg;base64,${"x".repeat(EXTRACT_BATCH_WIRE_BUDGET + 1)}`);
    await expect(h.reader.frame(0, h.controller.signal)).rejects.toMatchObject({ code: "frame-wire-limit" });
    expect(h.canvas.toDataURL).toHaveBeenNthCalledWith(2, "image/jpeg", FRAME_JPEG_QUALITY / 2); h.reader.dispose();
  });
  it("honors cancellation before touching media helpers", async () => {
    const h = harness(); h.controller.abort();
    await expect(h.reader.duration(h.controller.signal)).rejects.toMatchObject({ code: "cancelled" });
    expect(awaitVideoMetadata).not.toHaveBeenCalled(); h.reader.dispose();
  });
});
