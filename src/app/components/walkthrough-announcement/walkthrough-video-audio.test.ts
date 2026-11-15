import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/app/actions/live-class", () => ({ transcribeLiveAudioAction: vi.fn() }));
vi.mock("../recording/takeAnnouncementTranscription", async original => {
  const actual = await original<typeof import("../recording/takeAnnouncementTranscription")>();
  return { ...actual };
});
import { readVideoAudio, type AudioAdapters } from "./walkthrough-video-audio";
import { LIVE_SAMPLE_RATE } from "@/lib/live-class/wav";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import { VIDEO_LOCAL_WAIT_MS, VIDEO_PROVIDER_WAIT_MS } from "./walkthrough-video-limits";
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function harness(seconds = 125) {
  const close = vi.fn(async () => undefined);
  const context = { close } as unknown as AudioContext;
  const adapters: AudioAdapters = { prepare: vi.fn(async () => new Blob(["audio"])), context: vi.fn(() => context),
    decode: vi.fn(async () => new Float32Array(seconds * LIVE_SAMPLE_RATE)), transcribe: vi.fn(async () => ({ text: "spoken fact" })) };
  const controller = new AbortController(); const progress = vi.fn();
  return { adapters, close, controller, progress, run: () => readVideoAudio(new Blob(["video"]), 125, "gemini", controller.signal, progress, adapters) };
}
afterEach(() => vi.useRealTimers());
describe("uploaded narration production adapter", () => {
  it("decodes a supported video directly without real-time preparation", async () => {
    const h = harness(); h.adapters.decodeDirect = vi.fn(async () => new Float32Array(125 * LIVE_SAMPLE_RATE));
    expect((await h.run()).status).toBe("complete");
    expect(h.adapters.prepare).not.toHaveBeenCalled(); expect(h.adapters.decodeDirect).toHaveBeenCalledOnce();
  });
  it("falls back when direct decoding is unsupported or empty", async () => {
    for (const direct of [async () => { throw new Error("unsupported"); }, async () => new Float32Array(0)]) {
      const h = harness(); h.adapters.decodeDirect = vi.fn(direct);
      expect((await h.run()).status).toBe("complete"); expect(h.adapters.prepare).toHaveBeenCalledOnce();
      expect(h.close).toHaveBeenCalledTimes(2);
    }
  });
  it("does not fall back after direct decoding is cancelled", async () => {
    const h = harness(); const entered = deferred<void>(); const pending = deferred<Float32Array>();
    h.adapters.decodeDirect = vi.fn(() => { entered.resolve(); return pending.promise; });
    const run = h.run(); const rejected = expect(run).rejects.toMatchObject({ code: "cancelled" });
    await entered.promise; h.controller.abort(); await rejected;
    pending.resolve(new Float32Array(10)); expect(h.adapters.prepare).not.toHaveBeenCalled(); expect(h.close).toHaveBeenCalledOnce();
  });
  it("does not start a second decode after the direct decode times out", async () => {
    vi.useFakeTimers(); const h = harness(); const late = deferred<Float32Array>();
    h.adapters.decodeDirect = vi.fn(() => late.promise);
    const run = h.run(); const rejected = expect(run).rejects.toMatchObject({ code: "audio-decode-timeout" });
    await vi.advanceTimersByTimeAsync(VIDEO_LOCAL_WAIT_MS + 1); await rejected;
    expect(h.adapters.prepare).not.toHaveBeenCalled(); expect(h.close).toHaveBeenCalledOnce();
    late.resolve(new Float32Array(10));
  });
  it("retries a short direct decode and rejects an incomplete fallback", async () => {
    const h = harness(100); h.adapters.decodeDirect = vi.fn(async () => new Float32Array(100 * LIVE_SAMPLE_RATE));
    await expect(h.run()).rejects.toMatchObject({ code: "audio-incomplete" });
    expect(h.adapters.prepare).toHaveBeenCalledOnce(); expect(h.adapters.transcribe).not.toHaveBeenCalled();
  });
  it("accepts small duration discrepancies from media timestamps", async () => {
    const h = harness(); h.adapters.decodeDirect = vi.fn(async () => new Float32Array(123 * LIVE_SAMPLE_RATE));
    expect((await h.run()).status).toBe("complete"); expect(h.adapters.prepare).not.toHaveBeenCalled();
  });
  it("does not accept ten missing seconds from a twenty-minute recording", async () => {
    const h = harness(); const incomplete = new Float32Array(1190 * LIVE_SAMPLE_RATE);
    h.adapters.decodeDirect = vi.fn(async () => incomplete);
    vi.mocked(h.adapters.decode).mockResolvedValue(incomplete);
    await expect(readVideoAudio(new Blob(["video"]), 1200, "gemini", h.controller.signal, h.progress, h.adapters)).rejects.toMatchObject({ code: "audio-incomplete" });
    expect(h.adapters.prepare).toHaveBeenCalledOnce(); expect(h.adapters.transcribe).not.toHaveBeenCalled();
  });
  it("does not accept a fraction of a short recording as complete", async () => {
    const h = harness(); const incomplete = new Float32Array(LIVE_SAMPLE_RATE / 10);
    h.adapters.decodeDirect = vi.fn(async () => incomplete); vi.mocked(h.adapters.decode).mockResolvedValue(incomplete);
    await expect(readVideoAudio(new Blob(["video"]), 2, "gemini", h.controller.signal, h.progress, h.adapters)).rejects.toMatchObject({ code: "audio-incomplete" });
    expect(h.adapters.transcribe).not.toHaveBeenCalled();
  });
  it("waits for the direct decode context to close before fallback", async () => {
    const h = harness(); const closed = deferred<undefined>();
    h.adapters.decodeDirect = vi.fn(async () => { throw new Error("unsupported"); });
    h.close.mockImplementationOnce(() => closed.promise);
    const run = h.run(); await vi.waitFor(() => expect(h.close).toHaveBeenCalledOnce());
    expect(h.adapters.prepare).not.toHaveBeenCalled(); closed.resolve(undefined);
    expect((await run).status).toBe("complete");
  });
  it.each(["cancel", "timeout"])("does not fall back after %s while closing the direct context", async mode => {
    vi.useFakeTimers(); const h = harness(); const entered = deferred<void>(); const pending = deferred<undefined>();
    h.adapters.decodeDirect = vi.fn(async () => { throw new Error("unsupported"); });
    h.close.mockImplementation(() => { entered.resolve(); return pending.promise; });
    const run = h.run(); const rejected = expect(run).rejects.toMatchObject({ code: mode === "cancel" ? "cancelled" : "audio-close-timeout" });
    await entered.promise;
    if (mode === "cancel") h.controller.abort(); else await vi.advanceTimersByTimeAsync(VIDEO_LOCAL_WAIT_MS + 1);
    await rejected; expect(h.adapters.prepare).not.toHaveBeenCalled(); pending.resolve(undefined);
  });
  it("rejects an empty decode as preparation failure rather than a complete silence pass", async () => {
    const h = harness(0);
    await expect(h.run()).rejects.toMatchObject({ code: "audio-empty-decode" });
    expect(h.adapters.transcribe).not.toHaveBeenCalled(); expect(h.close).toHaveBeenCalledOnce();
  });
  it("plans from decoded samples and transcribes bounded WAV chunks using the snapshotted provider", async () => {
    const h = harness(); const value = await h.run();
    expect(value).toEqual({ status: "complete", text: "spoken fact spoken fact spoken fact", chunks: 3 });
    expect(h.adapters.transcribe).toHaveBeenCalledTimes(3);
    for (const [wav, options] of vi.mocked(h.adapters.transcribe).mock.calls) {
      expect(wav.length).toBeLessThanOrEqual(UPLOAD_WIRE_BUDGET_BYTES); expect(options).toEqual({ provider: "gemini" });
      expect(atob(wav).slice(0, 4)).toBe("RIFF");
    }
    expect(h.close).toHaveBeenCalledOnce();
  });
  it("does not publish a partial transcript after a later failed chunk", async () => {
    const h = harness(); vi.mocked(h.adapters.transcribe).mockResolvedValueOnce({ text: "PRIVATE_PARTIAL" }).mockResolvedValueOnce({ error: "PRIVATE_ERROR" });
    await expect(h.run()).rejects.toMatchObject({ code: "transcription-failed" });
    expect(h.adapters.transcribe).toHaveBeenCalledTimes(2); expect(h.close).toHaveBeenCalledOnce();
  });
  it("returns silence distinctly from failure and never claims no audio track", async () => {
    const h = harness(); vi.mocked(h.adapters.transcribe).mockResolvedValue({ text: "   " });
    expect(await h.run()).toEqual({ status: "silence", chunks: 3 }); expect(h.close).toHaveBeenCalledOnce();
  });
  it("rejects real-time overlength before prepare and rejects decoded overlength before transcription", async () => {
    const h = harness(1201);
    await expect(readVideoAudio(new Blob(), 1201, "gemini", h.controller.signal, h.progress, h.adapters)).rejects.toMatchObject({ code: "audio-duration" });
    expect(h.adapters.prepare).not.toHaveBeenCalled();
    await expect(h.run()).rejects.toMatchObject({ code: "audio-duration" }); expect(h.adapters.transcribe).not.toHaveBeenCalled(); expect(h.close).toHaveBeenCalledOnce();
  });
  it("cancels prepare and aborts the extraction signal without creating a decode context", async () => {
    const h = harness(); const entered = deferred<void>(); const pending = deferred<Blob>();
    let prepareSignal: AbortSignal | undefined;
    vi.mocked(h.adapters.prepare).mockImplementation((_, __, signal) => { prepareSignal = signal; entered.resolve(); return pending.promise; });
    const run = h.run(); const rejected = expect(run).rejects.toMatchObject({ code: "cancelled" });
    await entered.promise; h.controller.abort(); await rejected;
    expect(prepareSignal?.aborted).toBe(true); pending.resolve(new Blob(["late"])); await Promise.resolve(); expect(h.adapters.context).not.toHaveBeenCalled();
  });
  it("times out decode, closes context, and discards late decoded audio", async () => {
    vi.useFakeTimers(); const h = harness(); const late = deferred<Float32Array>();
    vi.mocked(h.adapters.decode).mockReturnValue(late.promise);
    const run = h.run(); const rejected = expect(run).rejects.toMatchObject({ code: "audio-decode-timeout" });
    await vi.advanceTimersByTimeAsync(VIDEO_LOCAL_WAIT_MS + 1); await rejected;
    late.resolve(new Float32Array(100)); await Promise.resolve(); expect(h.close).toHaveBeenCalledOnce(); expect(h.adapters.transcribe).not.toHaveBeenCalled();
  });
  it.each(["cancel", "timeout"])("after %s at transcription schedules no next chunk on late settlement", async mode => {
    vi.useFakeTimers(); const h = harness(); const late = deferred<{ text: string }>(); const entered = deferred<void>();
    vi.mocked(h.adapters.transcribe).mockImplementation(() => { entered.resolve(); return late.promise; });
    const run = h.run(); const rejected = expect(run).rejects.toMatchObject({ code: mode === "cancel" ? "cancelled" : "transcription-timeout" });
    await entered.promise;
    if (mode === "cancel") h.controller.abort(); else await vi.advanceTimersByTimeAsync(VIDEO_PROVIDER_WAIT_MS + 1);
    await rejected; late.resolve({ text: "LATE_PRIVATE" }); await Promise.resolve();
    expect(h.adapters.transcribe).toHaveBeenCalledOnce(); expect(h.close).toHaveBeenCalledOnce();
  });
  it("aborts timed-out prepare and never starts decoding", async () => {
    vi.useFakeTimers(); const h = harness(); let prepareSignal: AbortSignal | undefined;
    vi.mocked(h.adapters.prepare).mockImplementation((_, __, signal) => { prepareSignal = signal; return new Promise(() => undefined); });
    const run = h.run(); const rejected = expect(run).rejects.toMatchObject({ code: "audio-prepare-timeout" });
    await vi.advanceTimersByTimeAsync(125_000 + VIDEO_LOCAL_WAIT_MS + 1); await rejected;
    expect(prepareSignal?.aborted).toBe(true); expect(h.adapters.context).not.toHaveBeenCalled();
  });
});
