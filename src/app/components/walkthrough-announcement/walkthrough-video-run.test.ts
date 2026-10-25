import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("@/app/actions/module-content-extract", () => ({ extractModuleContentAction: vi.fn() }));
vi.mock("@/app/actions/live-class", () => ({ transcribeLiveAudioAction: vi.fn() }));
vi.mock("../recording/takeAnnouncementTranscription", () => ({ decodeBlobToMono: vi.fn(), decideRealTimeGuard: (seconds: number) => seconds > 1200 ? "refuse" : null }));
import { runVideoRead, uploadedVideoMaterialText, recordVideoReadDiagnostic, type VideoRunAdapters, type VideoReadInput } from "./walkthrough-video-run";
import { createPairDraftRunner } from "./pair-dispatch";
import { makeSlot, slotsReducer } from "./announcement-draft-slots";
import { readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests, buildSessionDiagnosticLog, formatSessionDiagnosticLogJson, formatSessionDiagnosticLogCsv } from "@/lib/session-diagnostic-log";
import { VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS, VIDEO_MAX_FRAMES, VIDEO_PROVIDER_WAIT_MS, videoTimestamps } from "./walkthrough-video-limits";
import { EXTRACT_BATCH_WIRE_BUDGET } from "../recording/discussion-capture";
import { readVideoAudio } from "./walkthrough-video-audio";
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function harness(duration = 60) {
  const controller = new AbortController();
  let current = true;
  const reader = { duration: vi.fn(async () => duration), frame: vi.fn(async (time: number) => `frame-${time}`), dispose: vi.fn() };
  const extract = vi.fn<VideoRunAdapters["extract"]>(async frames => ({ blocks: [{ heading: "Current", text: frames.map(f => f.base64).join(";"), kind: "prose" }], illegibleCount: 0, confirmedEmpty: false }));
  const audio = vi.fn<VideoRunAdapters["audio"]>(async () => ({ status: "complete", text: "SPOKEN_ONLY_FACT", chunks: 1 }));
  const diagnostic = vi.fn();
  const adapters: VideoRunAdapters = { reader: vi.fn(() => reader), extract, audio, diagnostic };
  const input: VideoReadInput = { blob: new Blob(["local-file"], { type: "video/mp4" }), provider: "gemini", moduleLabel: "current", notes: "notes", framesOnly: false,
    signal: controller.signal, isCurrent: () => current, progress: vi.fn() };
  return { adapters, reader, extract, audio, input, controller, stale: () => { current = false; } };
}
afterEach(() => vi.useRealTimers());
describe("uploaded video production runner", () => {
  it("samples start and near-end across whole duration; drains sequential batches before narration", async () => {
    const h = harness(VIDEO_MAX_SECONDS);
    let active = 0;
    h.extract.mockImplementation(async frames => {
      expect(++active).toBe(1); expect(frames.length).toBeLessThanOrEqual(6);
      expect(frames.reduce((sum, f) => sum + f.base64.length, 0)).toBeLessThanOrEqual(EXTRACT_BATCH_WIRE_BUDGET);
      await Promise.resolve(); active--;
      return { blocks: [{ heading: "Current", text: "visual", kind: "prose" }], illegibleCount: 0, confirmedEmpty: false };
    });
    h.audio.mockImplementation(async () => { expect(h.extract).toHaveBeenCalledTimes(20); return { status: "complete", text: "SPOKEN_ONLY_FACT", chunks: 20 }; });
    const result = await runVideoRead(h.input, h.adapters);
    expect(result.status).toBe("ready"); expect(result.sampled).toBe(VIDEO_MAX_FRAMES);
    expect(h.reader.frame.mock.calls[0][0]).toBe(0);
    expect(h.reader.frame.mock.calls.at(-1)![0]).toBeCloseTo(1199.9);
    expect(result.narration).toContain("SPOKEN_ONLY_FACT"); expect(h.reader.dispose).toHaveBeenCalledTimes(1);
  });
  it.each([0, -1, Infinity, NaN, VIDEO_MAX_SECONDS + 0.01])("refuses invalid duration %s before providers", async duration => {
    const h = harness(duration); const result = await runVideoRead(h.input, h.adapters);
    expect(result.status).toBe("failed"); expect(h.extract).not.toHaveBeenCalled(); expect(h.audio).not.toHaveBeenCalled(); expect(h.reader.dispose).toHaveBeenCalledOnce();
  });
  it("accepts exact byte limit; refuses greater bytes and unsupported types before media/provider work", async () => {
    for (const [type, size, accepted] of [["video/mp4", VIDEO_MAX_BYTES, true], ["video/mp4", VIDEO_MAX_BYTES + 1, false], ["video/quicktime", 10, false]] as const) {
      const h = harness(1); Object.defineProperty(h.input, "blob", { value: { type, size } });
      const value = await runVideoRead(h.input, h.adapters);
      expect(value.status === "ready").toBe(accepted); expect(h.adapters.reader).toHaveBeenCalledTimes(accepted ? 1 : 0);
    }
  });
  it("keeps visuals after audio failure and requires explicit visible-only selection", async () => {
    const h = harness(2); h.audio.mockRejectedValue(new Error("PRIVATE_UPSTREAM_ERROR"));
    const value = await runVideoRead(h.input, h.adapters);
    expect(value.status).toBe("needs-visible-only"); expect(value.blocks).toHaveLength(1); expect(value.narration).toBe(""); expect(value.audio).toBe("failed");
  });
  it("requires visible-only fallback after the actual audio adapter receives an empty decode", async () => {
    const h = harness(2); const close = vi.fn(async () => undefined);
    h.audio.mockImplementation((blob, duration, provider, signal, progress) => readVideoAudio(blob, duration, provider, signal, progress, {
      prepare: async () => new Blob(), context: () => ({ close } as unknown as AudioContext),
      decode: async () => new Float32Array(0), transcribe: vi.fn(),
    }));
    const result = await runVideoRead(h.input, h.adapters);
    expect(result.status).toBe("needs-visible-only"); expect(result.audio).toBe("failed");
    expect(result.blocks).toHaveLength(1); expect(result.narration).toBe(""); expect(close).toHaveBeenCalledOnce();
  });
  it("reports frame gaps, unreadable blocks and partial extraction without claiming complete coverage", async () => {
    const h = harness(12); h.input.framesOnly = true;
    h.reader.frame.mockRejectedValueOnce(new Error("stalled"));
    h.extract.mockResolvedValue({ blocks: [{ heading: "current", text: "content", kind: "prose" }], illegibleCount: 2, confirmedEmpty: false });
    const value = await runVideoRead(h.input, h.adapters);
    expect(value.gaps).toBe(1); expect(value.illegible).toBe(2); expect(value.code).toBe("partial-visual-coverage"); expect(h.audio).not.toHaveBeenCalled();
  });
  it("rejects oversized frames without sending them; packs by wire bytes", async () => {
    const h = harness(12); h.input.framesOnly = true;
    h.reader.frame.mockResolvedValueOnce("x".repeat(EXTRACT_BATCH_WIRE_BUDGET + 1)).mockResolvedValue("a".repeat(1_600_000));
    const value = await runVideoRead(h.input, h.adapters);
    expect(value.gaps).toBe(1); expect(h.extract.mock.calls.every(call => call[0].length === 1)).toBe(true);
  });
  it.each(["metadata", "frame", "extraction", "audio"])("cancels at %s await and discards late work", async stage => {
    const h = harness(2); const wait = deferred<never>(); const entered = deferred<void>();
    const block = () => { entered.resolve(); return wait.promise; };
    if (stage === "metadata") h.reader.duration.mockImplementation(block);
    if (stage === "frame") h.reader.frame.mockImplementation(block);
    if (stage === "extraction") h.extract.mockImplementation(block);
    if (stage === "audio") h.audio.mockImplementation(async (...args) => {
      entered.resolve(); return new Promise((_, reject) => args[3].addEventListener("abort", () => reject(new Error("abort"))));
    });
    const pending = runVideoRead(h.input, h.adapters); await entered.promise; h.controller.abort();
    const value = await pending; expect(value.status).toBe("cancelled"); expect(value.narration).toBe(""); expect(value.blocks).toEqual([]); expect(h.reader.dispose).toHaveBeenCalledOnce();
  });
  it("discards stale extraction after a scope reset and schedules no audio", async () => {
    const h = harness(2); const wait = deferred<Awaited<ReturnType<VideoRunAdapters["extract"]>>>(); const entered = deferred<void>();
    h.extract.mockImplementation(() => { entered.resolve(); return wait.promise; });
    const pending = runVideoRead(h.input, h.adapters); await entered.promise; h.stale();
    wait.resolve({ blocks: [{ heading: "old", text: "OLD_PRIVATE", kind: "prose" }], illegibleCount: 0, confirmedEmpty: false });
    expect((await pending).status).toBe("cancelled"); expect(h.audio).not.toHaveBeenCalled();
  });
  it("times out extraction then offers partial coverage and never retries paid work", async () => {
    vi.useFakeTimers(); const h = harness(120); h.input.framesOnly = true; h.extract.mockReturnValue(new Promise(() => undefined));
    const pending = runVideoRead(h.input, h.adapters); await vi.advanceTimersByTimeAsync(VIDEO_PROVIDER_WAIT_MS + 1);
    const value = await pending; expect(value.failedBatches).toBe(1); expect(h.extract).toHaveBeenCalledOnce(); expect(value.status).toBe("failed");
  });
  it("delivers one finalized spoken-only fact to both real pair requests and exports safe upload diagnostics", async () => {
    resetSessionDiagnosticLogForTests("2026-01-01T00:00:00Z");
    const h = harness(1); h.input.moduleLabel = "PRIVATE_MODULE"; h.input.notes = "PRIVATE_NOTES";
    Object.defineProperty(h.input.blob, "name", { value: "PRIVATE_FILENAME.mp4" });
    h.extract.mockResolvedValue({ blocks: [{ heading: "PRIVATE_HEADING", text: "PRIVATE_VISUAL", kind: "prose" }], confirmedEmpty: false, illegibleCount: 0 });
    h.adapters.diagnostic = recordVideoReadDiagnostic;
    const value = await runVideoRead(h.input, h.adapters);
    const material = uploadedVideoMaterialText(value.blocks, value.narration, 100_000);
    let slots = [makeSlot("wta-slot-1", { kind: "none" }, "beginning-of-week"), makeSlot("wta-slot-2", { kind: "none" }, "midweek")];
    const draftOne = vi.fn(async () => ({ title: "PRIVATE_OUTPUT", message: "PRIVATE_BODY", researchNotice: { kind: "off" as const } }));
    const buildRequest = vi.fn(() => ({ sourceKind: "upload" as const, courseLabel: "PRIVATE_COURSE", moduleLabel: "PRIVATE_MODULE", materialsText: material, coverageBlock: "PRIVATE_COVERAGE", notes: "PRIVATE_NOTES", provider: "gemini" as const, emojiOn: false, researchOn: false }));
    const runner = createPairDraftRunner(() => slots, action => { slots = [...slotsReducer(slots, action)]; }, () => ({ buildRequest,
      resolveLive: () => ({ pastedOutline: null, mostRecent: null }), fetchResources: async () => ({ kind: "off" }), researchFingerprint: () => "fixed", draftOne }), vi.fn());
    await runner.generate();
    expect(buildRequest).toHaveBeenCalledOnce(); expect(draftOne).toHaveBeenCalledTimes(2);
    for (const call of draftOne.mock.calls as unknown as Array<[{ materialsText: string }]>) {
      expect(call[0].materialsText).toBe(material); expect(call[0].materialsText.split("SPOKEN_ONLY_FACT")).toHaveLength(2);
    }
    expect(h.audio).toHaveBeenCalledOnce(); expect(h.extract).toHaveBeenCalledOnce();
    const entries = readSessionDiagnosticLogState().entries;
    expect(entries.map(entry => entry.operation)).toEqual(["walkthrough_upload", "walkthrough_draft", "walkthrough_draft", "walkthrough_pair"]);
    expect(entries.every(entry => entry.detail?.source === "upload")).toBe(true);
    expect(Object.keys(entries[0].detail!).sort()).toEqual(["audio", "blocks", "durationSeconds", "failedBatches", "frames", "gaps", "illegible", "planned", "source"]);
    const log = buildSessionDiagnosticLog(readSessionDiagnosticLogState(), { currentInstitution: "", currentCourse: "", currentPage: "/", browser: "fixture" }, "2026-01-01T00:00:01Z");
    for (const exported of [formatSessionDiagnosticLogJson(log), formatSessionDiagnosticLogCsv(log)]) {
      expect(exported).toContain("WTA_VIDEO_OK"); expect(exported).not.toContain("PRIVATE_"); expect(exported).not.toContain("SPOKEN_ONLY_FACT");
    }
  });
  it("distinguishes silence and complete empty visible batches", async () => {
    const h = harness(1); h.audio.mockResolvedValue({ status: "silence", chunks: 1 });
    h.extract.mockResolvedValue({ blocks: [], confirmedEmpty: true, illegibleCount: 0 });
    const value = await runVideoRead(h.input, h.adapters);
    expect(value.audio).toBe("silence"); expect(value.emptyBatches).toBe(1); expect(value.code).toBe("no-readable-content");
  });
  it("keeps the named frame cap and duration boundary in the timestamp policy", () => {
    expect(videoTimestamps(1200)).toHaveLength(120); expect(videoTimestamps(0.01)).toEqual([0, 0.009000000000000001]);
  });
});
