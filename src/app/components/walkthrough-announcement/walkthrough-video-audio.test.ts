import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/app/actions/live-class", () => ({ transcribeLiveAudioAction: vi.fn() }));
vi.mock("../recording/takeAnnouncementTranscription", async original => {
  const actual = await original<typeof import("../recording/takeAnnouncementTranscription")>();
  return { ...actual };
});
import { readVideoAudio, transcriptionFailureCode, type AudioAdapters } from "./walkthrough-video-audio";
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
  it("maps only fixed transcription errors to safe categories", () => {
    expect(transcriptionFailureCode("Transcription failed: HTTP 403")).toBe("transcription-access-denied");
    expect(transcriptionFailureCode("Transcription failed: HTTP 429")).toBe("transcription-rate-limited");
    expect(transcriptionFailureCode("Transcription failed: HTTP 503")).toBe("transcription-provider-unavailable");
    expect(transcriptionFailureCode("Transcription failed: HTTP 408")).toBe("transcription-provider-unavailable");
    expect(transcriptionFailureCode("Transcription failed: HTTP 404")).toBe("transcription-request-rejected");
    expect(transcriptionFailureCode("Transcription failed: HTTP 413")).toBe("transcription-request-rejected");
    expect(transcriptionFailureCode("Transcription failed: HTTP 999")).toBe("transcription-failed");
    expect(transcriptionFailureCode("Transcription failed: HTTP 0")).toBe("transcription-transport-failed");
    expect(transcriptionFailureCode("Missing environment variable: GEMINI_API_KEY")).toBe("transcription-not-configured");
    expect(transcriptionFailureCode("Not authorized. Sign in with an approved account.")).toBe("transcription-sign-in-required");
    expect(transcriptionFailureCode("The account service is temporarily unavailable. Please try again in a moment.")).toBe("transcription-account-unavailable");
    expect(transcriptionFailureCode("PRIVATE_PROVIDER_ERROR 403")).toBe("transcription-failed");
  });
  it.each(["context", "prepare", "decode", "transcribe"] as const)("classifies an untyped %s failure without exposing its message", async phase => {
    const h = harness();
    if (phase === "context") vi.mocked(h.adapters.context).mockImplementation(() => { throw new Error("PRIVATE_DETAIL"); });
    if (phase === "prepare") vi.mocked(h.adapters.prepare).mockRejectedValue(new Error("PRIVATE_DETAIL"));
    if (phase === "decode") vi.mocked(h.adapters.decode).mockRejectedValue(new Error("PRIVATE_DETAIL"));
    if (phase === "transcribe") vi.mocked(h.adapters.transcribe).mockRejectedValue(new Error("PRIVATE_DETAIL"));
    const codes = { context: "audio-context-failed", prepare: "audio-prepare-failed", decode: "audio-decode-failed", transcribe: "transcription-call-failed" };
    await expect(h.run()).rejects.toMatchObject({ code: codes[phase] });
  });
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
    expect(value).toEqual({ status: "complete", text: Array(13).fill("spoken fact").join(" "), chunks: 13 });
    expect(h.adapters.transcribe).toHaveBeenCalledTimes(13);
    for (const [wav, options, signal] of vi.mocked(h.adapters.transcribe).mock.calls) {
      expect(wav.length).toBeLessThanOrEqual(UPLOAD_WIRE_BUDGET_BYTES); expect(options).toEqual({ provider: "gemini" }); expect(signal?.aborted).toBe(true);
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
    expect(await h.run()).toEqual({ status: "silence", chunks: 13 }); expect(h.close).toHaveBeenCalledOnce();
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

it("submits a 36-second recording as four ordered sub-megabyte WAV chunks", async () => {
  const h = harness();
  const samples = new Float32Array(36 * LIVE_SAMPLE_RATE);
  for (let second = 0; second < 36; second += 1) samples.fill((Math.floor(second / 10) + 1) / 10, second * LIVE_SAMPLE_RATE, (second + 1) * LIVE_SAMPLE_RATE);
  h.adapters.decodeDirect = vi.fn(async () => samples);
  const result = await readVideoAudio(new Blob(["video"]), 36, "gemini", h.controller.signal, h.progress, h.adapters);
  expect(result).toMatchObject({ status: "complete", chunks: 4 });
  const chunks = vi.mocked(h.adapters.transcribe).mock.calls.map(([wav]) => atob(wav));
  expect(chunks.map(wav => wav.length)).toEqual([320044, 320044, 320044, 192044]);
  expect(vi.mocked(h.adapters.transcribe).mock.calls.every(([wav]) => wav.length <= 512000)).toBe(true);
  const firstSample = (wav: string) => wav.charCodeAt(44) | wav.charCodeAt(45) << 8;
  expect(chunks.map(firstSample)).toEqual([3277, 6553, 9830, 13107]);
});

it("does not automatically retry a rejected action whose server outcome is unknown", async () => {
  const h = harness();
  vi.mocked(h.adapters.transcribe).mockRejectedValue(new Error("connection lost"));
  await expect(h.run()).rejects.toMatchObject({ code: "transcription-call-failed" });
  expect(h.adapters.transcribe).toHaveBeenCalledOnce();
});
