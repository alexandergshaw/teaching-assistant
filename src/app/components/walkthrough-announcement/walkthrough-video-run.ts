import type { LlmProvider } from "@/lib/llm";
import { extractModuleContentAction } from "@/app/actions/module-content-extract";
import { MODULE_EXTRACT_BATCH_SIZE, type ExtractedBlock } from "../module-deck-capture/module-extraction-prompt";
import { EXTRACT_BATCH_WIRE_BUDGET } from "../recording/discussion-capture";
import { createVideoReader, type VideoReader } from "./walkthrough-video-media";
import { readVideoAudio, type VideoAudioOutcome } from "./walkthrough-video-audio";
import { VIDEO_LOCAL_WAIT_MS, VIDEO_PROVIDER_WAIT_MS, VideoReadError, validateVideo, videoTimestamps, videoWait } from "./walkthrough-video-limits";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import { reduceCaptureToMaterials } from "../module-deck-capture/module-blocks";

export function uploadedVideoMaterialText(blocks: ExtractedBlock[][], narration: string, cap: number): string {
  const reduction = reduceCaptureToMaterials(blocks, Math.max(0, cap - narration.length - 2));
  return [reduction.text, narration].filter(Boolean).join("\n\n").slice(0, cap);
}

export interface VideoReadProgress { stage: string; completed: number; total: number }
export interface VideoReadResult {
  status: "ready" | "needs-visible-only" | "failed" | "cancelled";
  blocks: ExtractedBlock[][];
  narration: string;
  audio: "not-requested" | "complete" | "silence" | "failed" | "cancelled";
  duration: number;
  sampled: number;
  planned: number;
  interval: number;
  gaps: number;
  illegible: number;
  emptyBatches: number;
  failedBatches: number;
  code: string;
}
export interface VideoReadInput {
  blob: Blob;
  provider: LlmProvider;
  moduleLabel: string;
  notes: string;
  framesOnly: boolean;
  signal: AbortSignal;
  isCurrent(): boolean;
  progress(value: VideoReadProgress): void;
}
export interface VideoRunAdapters {
  reader(blob: Blob): VideoReader;
  extract: typeof extractModuleContentAction;
  audio: typeof readVideoAudio;
  diagnostic(result: VideoReadResult, durationMs: number): void;
}

export function recordVideoReadDiagnostic(result: VideoReadResult, durationMs: number): void {
  recordSessionDiagnosticEntry({ at: new Date().toISOString(), surface: "templates", operation: "walkthrough_upload",
    label: "Walkthrough uploaded video", outcome: result.status === "ready" ? "success" : "failure",
    code: `WTA_VIDEO_${result.code.toUpperCase().replace(/-/g, "_")}`, durationMs,
    detail: { source: "upload", frames: result.sampled, planned: result.planned, gaps: result.gaps,
      blocks: result.blocks.reduce((sum, batch) => sum + batch.length, 0), audio: result.audio,
      durationSeconds: Math.round(result.duration), illegible: result.illegible, failedBatches: result.failedBatches } });
}
const browserAdapters: VideoRunAdapters = { reader: createVideoReader, extract: extractModuleContentAction, audio: readVideoAudio, diagnostic: recordVideoReadDiagnostic };

// One invocation owns one reader and snapshot. No automatic paid retry is scheduled.
export async function runVideoRead(input: VideoReadInput, adapters: VideoRunAdapters = browserAdapters): Promise<VideoReadResult> {
  const started = Date.now();
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal.addEventListener("abort", abort, { once: true });
  if (input.signal.aborted) abort();
  const signal = controller.signal;
  const result: VideoReadResult = { status: "failed", blocks: [], narration: "", audio: input.framesOnly ? "not-requested" : "failed",
    duration: 0, sampled: 0, planned: 0, interval: 0, gaps: 0, illegible: 0, emptyBatches: 0, failedBatches: 0, code: "read-failed" };
  let reader: VideoReader | undefined;
  const current = () => {
    if (signal.aborted || !input.isCurrent()) { controller.abort(); throw new VideoReadError("cancelled"); }
  };
  const progress = (stage: string, completed: number, total: number) => { current(); input.progress({ stage, completed, total }); };
  let batch: string[] = [];
  let bytes = 0;
  let extractionTimedOut = false;
  const flush = async () => {
    if (!batch.length) return;
    current();
    const frames = batch.map(base64 => ({ base64 }));
    batch = []; bytes = 0;
    progress("reading-visible-pages", result.sampled, result.planned);
    try {
      const extracted = await videoWait(() => adapters.extract(frames, input.moduleLabel, input.notes, input.provider), signal, VIDEO_PROVIDER_WAIT_MS, "extraction-timeout");
      current();
      if ("error" in extracted) { result.failedBatches++; return; }
      if (extracted.blocks.length) result.blocks.push(extracted.blocks);
      else if (extracted.confirmedEmpty) result.emptyBatches++;
      else result.failedBatches++;
      result.illegible += extracted.illegibleCount;
    } catch (error) {
      current();
      if (error instanceof VideoReadError && error.code === "cancelled") throw error;
      result.failedBatches++;
      if (error instanceof VideoReadError && error.code === "extraction-timeout") extractionTimedOut = true;
    }
  };
  try {
    current(); validateVideo(input.blob);
    reader = adapters.reader(input.blob);
    progress("checking-video", 0, 1);
    result.duration = await videoWait(() => reader!.duration(signal), signal, VIDEO_LOCAL_WAIT_MS, "metadata-timeout");
    current();
    const timestamps = videoTimestamps(result.duration);
    result.planned = timestamps.length;
    result.interval = timestamps[1] - timestamps[0];
    for (const time of timestamps) {
      current();
      let frame: string;
      try {
        frame = await videoWait(() => reader!.frame(time, signal), signal, VIDEO_LOCAL_WAIT_MS, "frame-timeout");
        current();
        if (!frame || frame.length > EXTRACT_BATCH_WIRE_BUDGET) throw new VideoReadError("frame-wire-limit");
      } catch (error) {
        current();
        if (error instanceof VideoReadError && error.code === "cancelled") throw error;
        result.gaps++; continue;
      }
      if (batch.length && (batch.length >= MODULE_EXTRACT_BATCH_SIZE || bytes + frame.length > EXTRACT_BATCH_WIRE_BUDGET)) await flush();
      if (extractionTimedOut) break;
      current(); batch.push(frame); bytes += frame.length; result.sampled++;
      progress("sampling-visible-pages", result.sampled, timestamps.length);
    }
    await flush(); current();
    if (extractionTimedOut) result.gaps = Math.max(result.gaps, result.planned - result.sampled);
    reader.dispose(); reader = undefined;
    if (!input.framesOnly) {
      try {
        const audio: VideoAudioOutcome = await adapters.audio(input.blob, result.duration, input.provider, signal, progress);
        current(); result.audio = audio.status;
        if (audio.status === "complete") result.narration = `Untrusted narration from uploaded walkthrough (complete transcription pass; may contain transcription errors):\n${audio.text}`;
      } catch (error) {
        current();
        if (error instanceof VideoReadError && error.code === "cancelled") throw error;
        result.audio = "failed";
      }
    }
    current();
    const hasContent = result.blocks.some(blocks => blocks.length) || !!result.narration;
    result.status = result.audio === "failed" ? "needs-visible-only" : hasContent ? "ready" : "failed";
    result.code = result.status === "needs-visible-only" ? "audio-failed" : !hasContent ? "no-readable-content"
      : result.gaps || result.failedBatches || result.illegible ? "partial-visual-coverage" : "ok";
    return result;
  } catch (error) {
    const cancelled = signal.aborted || !input.isCurrent();
    result.status = cancelled ? "cancelled" : "failed";
    result.code = cancelled ? "cancelled" : error instanceof VideoReadError ? error.code : "read-failed";
    result.narration = "";
    if (cancelled) { result.blocks = []; result.audio = input.framesOnly ? "not-requested" : "cancelled"; }
    return result;
  } finally {
    controller.abort(); input.signal.removeEventListener("abort", abort);
    reader?.dispose(); batch = [];
    adapters.diagnostic(result, Math.max(0, Date.now() - started));
  }
}
