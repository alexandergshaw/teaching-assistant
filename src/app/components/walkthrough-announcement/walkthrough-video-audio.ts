import type { LlmProvider } from "@/lib/llm";
import { extractAudioOnly } from "@/lib/strip-audio";
import { decodeBlobToMono, decideRealTimeGuard } from "../recording/takeAnnouncementTranscription";
import { LIVE_SAMPLE_RATE, encodeWav, base64FromArrayBuffer } from "@/lib/live-class/wav";
import { planTranscriptChunks, sliceMonoSamples, joinTranscriptChunks } from "@/lib/take-transcript";
import { checkWireBudget } from "@/lib/upload-budget";
import { transcribeLiveAudioAction } from "@/app/actions/live-class";
import { VIDEO_LOCAL_WAIT_MS, VIDEO_PROVIDER_WAIT_MS, VIDEO_MAX_SECONDS, VIDEO_NARRATION_CHARS, VideoReadError, videoWait } from "./walkthrough-video-limits";

export interface AudioAdapters {
  prepare: typeof extractAudioOnly;
  context(): AudioContext;
  decode: typeof decodeBlobToMono;
  decodeDirect?: typeof decodeBlobToMono;
  transcribe: typeof transcribeLiveAudioAction;
}
const browserAudio: AudioAdapters = {
  prepare: extractAudioOnly, context: () => new AudioContext(), decode: decodeBlobToMono, decodeDirect: decodeBlobToMono, transcribe: transcribeLiveAudioAction,
};
export type VideoAudioOutcome = { status: "complete"; text: string; chunks: number } | { status: "silence"; chunks: number };

/** Map only fixed server responses; never propagate provider or account text. */
export function transcriptionFailureCode(error: string): string {
  const status = /^Transcription failed: HTTP (\d{3})$/.exec(error)?.[1];
  if (status === "400" || status === "404" || status === "413") return "transcription-request-rejected";
  if (status === "401" || status === "403") return "transcription-access-denied";
  if (status === "429") return "transcription-rate-limited";
  if (status === "408" || (status && Number(status) >= 500 && Number(status) <= 599)) return "transcription-provider-unavailable";
  if (/^Audio clip is too large to transcribe \(~\d+(?:\.\d+)?MB, limit ~\d+MB per request\)\. Send a shorter clip\.$/.test(error)) return "transcription-request-rejected";
  return "transcription-failed";
}

export async function readVideoAudio(blob: Blob, duration: number, provider: LlmProvider, signal: AbortSignal,
  progress: (stage: string, completed: number, total: number) => void, adapters = browserAudio): Promise<VideoAudioOutcome> {
  if (!Number.isFinite(duration) || duration <= 0 || decideRealTimeGuard(duration)) throw new VideoReadError("audio-duration");
  const prepare = new AbortController();
  const abort = () => prepare.abort();
  signal.addEventListener("abort", abort, { once: true });
  let context: AudioContext | undefined;
  let mono: Float32Array | undefined;
  const durationTolerance = Math.min(2, duration * 0.02);
  let failurePhase = "audio-context-failed";
  try {
    if (adapters.decodeDirect) {
      context = adapters.context();
      try {
        progress("decoding-narration", 0, 1);
        const direct = await videoWait(() => adapters.decodeDirect!(context!, blob), signal, VIDEO_LOCAL_WAIT_MS, "audio-decode-timeout");
        if (direct.length && direct.length / LIVE_SAMPLE_RATE >= duration - durationTolerance) mono = direct;
      } catch (error) {
        if (signal.aborted || (error instanceof VideoReadError && (error.code === "cancelled" || error.code === "audio-decode-timeout"))) throw error;
      }
      if (!mono) {
        failurePhase = "audio-close-failed";
        await videoWait(() => context!.close(), signal, VIDEO_LOCAL_WAIT_MS, "audio-close-timeout");
        context = undefined;
      }
    }
    if (!mono) {
      failurePhase = "audio-prepare-failed";
      const audio = await videoWait(() => adapters.prepare(blob, pct => {
      if (!signal.aborted && !prepare.signal.aborted) progress("preparing-narration", pct, 100);
      }, prepare.signal), signal, duration * 1000 + VIDEO_LOCAL_WAIT_MS, "audio-prepare-timeout");
      failurePhase = "audio-context-failed";
      context = adapters.context();
      failurePhase = "audio-decode-failed";
      mono = await videoWait(() => adapters.decode(context!, audio), signal, VIDEO_LOCAL_WAIT_MS, "audio-decode-timeout");
    }
    if (mono.length === 0) throw new VideoReadError("audio-empty-decode");
    const decodedDuration = mono.length / LIVE_SAMPLE_RATE;
    if (decodedDuration > VIDEO_MAX_SECONDS) throw new VideoReadError("audio-duration");
    if (decodedDuration < duration - durationTolerance) throw new VideoReadError("audio-incomplete");
    failurePhase = "audio-chunk-failed";
    const plans = planTranscriptChunks(decodedDuration);
    const parts: string[] = [];
    for (const [index, plan] of plans.entries()) {
      if (signal.aborted) throw new VideoReadError("cancelled");
      progress("transcribing-narration", index, plans.length);
      failurePhase = "audio-chunk-failed";
      const wav = base64FromArrayBuffer(encodeWav(sliceMonoSamples(mono, LIVE_SAMPLE_RATE, plan), LIVE_SAMPLE_RATE));
      if (!checkWireBudget(wav.length, "Narration chunk").ok) throw new VideoReadError("audio-wire-limit");
      failurePhase = "transcription-failed";
      const result = await videoWait(() => adapters.transcribe(wav, { provider }), signal, VIDEO_PROVIDER_WAIT_MS, "transcription-timeout");
      if ("error" in result) throw new VideoReadError(transcriptionFailureCode(result.error));
      parts.push(result.text);
      if (parts.reduce((sum, text) => sum + text.length, 0) > VIDEO_NARRATION_CHARS) throw new VideoReadError("narration-limit");
    }
    const text = joinTranscriptChunks(parts);
    return text ? { status: "complete", text, chunks: plans.length } : { status: "silence", chunks: plans.length };
  } catch (error) {
    if (error instanceof VideoReadError) throw error;
    throw new VideoReadError(failurePhase);
  } finally {
    prepare.abort();
    signal.removeEventListener("abort", abort);
    mono = undefined;
    if (context) void context.close().catch(() => undefined);
  }
}
