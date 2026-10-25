import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./caption-burn", () => ({ ensureFiniteDuration: vi.fn(async () => 1) }));
import { extractAudioOnly } from "./strip-audio";
function harness(readyState = 1) {
  const video = Object.assign(new EventTarget(), { readyState, preload: "", muted: false, playsInline: false, src: "", currentTime: 0, ended: false,
    pause: vi.fn(), play: vi.fn(async () => undefined), removeAttribute: vi.fn(), load: vi.fn() });
  const track = { stop: vi.fn() };
  const disconnect = vi.fn(); const connect = vi.fn(); const close = vi.fn(async () => undefined);
  const context = { createMediaElementSource: () => ({ connect, disconnect }), createMediaStreamDestination: () => ({ stream: { getTracks: () => [track] } }), close };
  class Recorder {
    static isTypeSupported() { return true; }
    state = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["audio"]) }); this.onstop?.(); }
  }
  vi.stubGlobal("document", { createElement: () => video });
  vi.stubGlobal("window", { AudioContext: function () { return context; } });
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const controller = new AbortController();
  const run = () => extractAudioOnly(new Blob(["video"]), undefined, controller.signal);
  return { video, track, disconnect, close, revoke, controller, run };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("extractAudioOnly bounded lifecycle", () => {
  it("rejects an already cancelled call before allocating resources", async () => {
    const h = harness(); h.controller.abort(); await expect(h.run()).rejects.toMatchObject({ name: "AbortError" }); expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("cancels an outstanding metadata wait and removes its listeners", async () => {
    const h = harness(0); const remove = vi.spyOn(h.video, "removeEventListener");
    const pending = h.run(); const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve(); h.controller.abort(); await rejected;
    expect(remove.mock.calls.map(call => call[0])).toContain("loadedmetadata");
    expect(h.close).not.toHaveBeenCalled(); expect(h.revoke).toHaveBeenCalledOnce(); expect(h.video.load).toHaveBeenCalledOnce();
  });
  it("times out metadata and releases the object URL", async () => {
    vi.useFakeTimers(); const h = harness(0); const pending = h.run(); const rejected = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(20_001); await rejected; expect(h.revoke).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("completes even if stop fires synchronously and closes audio/track resources", async () => {
    vi.useFakeTimers(); const h = harness(); const pending = h.run();
    await vi.advanceTimersByTimeAsync(1); h.video.ended = true; h.video.currentTime = 1;
    await vi.advanceTimersByTimeAsync(100); expect((await pending).size).toBeGreaterThan(0);
    expect(h.close).toHaveBeenCalledOnce(); expect(h.track.stop).toHaveBeenCalledOnce(); expect(h.disconnect).toHaveBeenCalledOnce(); expect(h.revoke).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels during playback without returning partial recorded chunks", async () => {
    vi.useFakeTimers(); const h = harness(); const pending = h.run(); const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1); h.controller.abort(); await rejected;
    expect(h.close).toHaveBeenCalledOnce(); expect(h.track.stop).toHaveBeenCalledOnce(); expect(h.revoke).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("closes the context when playback rejects", async () => {
    const h = harness(); h.video.play.mockRejectedValue(new Error("unsupported"));
    await expect(h.run()).rejects.toThrow("unsupported");
    expect(h.close).toHaveBeenCalledOnce(); expect(h.disconnect).toHaveBeenCalledOnce(); expect(h.track.stop).toHaveBeenCalledOnce();
  });
  it("bounds stalled playback and closes all resources", async () => {
    vi.useFakeTimers(); const h = harness(); const pending = h.run(); const rejected = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(21_001); await rejected;
    expect(h.close).toHaveBeenCalledOnce(); expect(h.track.stop).toHaveBeenCalledOnce(); expect(h.revoke).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});
