import { base64FromArrayBuffer, encodeWav, LIVE_SAMPLE_RATE } from "@/lib/live-class/wav";
import { extractAudioOnly } from "@/lib/strip-audio";
import { planTranscriptChunks, sliceMonoSamples } from "@/lib/take-transcript";
import { checkWireBudget } from "@/lib/upload-budget";
import { decodeBlobToMono } from "../recording/takeAnnouncementTranscription";
import { transcribeWalkthroughChunk } from "../walkthrough-announcement/walkthrough-transcription-transport";
import { VIDEO_LOCAL_WAIT_MS, VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS, VIDEO_PROVIDER_WAIT_MS, videoWait } from "../walkthrough-announcement/walkthrough-video-limits";
import type { LecturePart } from "./lectureProject";
import { MAX_CAPTION_CUES, MAX_CAPTION_TEXT, type LectureCaptionDraft } from "./lecture-captions";

type CaptionAudioSource = { blob: Blob; duration: number; kind: "video" | "audio" };

export function lectureCaptionAudioSource(part: LecturePart): CaptionAudioSource | undefined {
  if (part.audioMode === "source") return { blob: part.source, duration: part.duration, kind: "video" };
  if (part.output) return { blob: part.output, duration: part.duration, kind: "video" };
  if (part.audioMode === "take" && !part.mixSourceAudio && part.take) {
    return { blob: part.take.blob, duration: Math.min(part.take.duration, part.duration), kind: "audio" };
  }
}

function alignMilliseconds(seconds: number): string {
  return String(Math.floor(seconds * 1000 + 1e-8) / 1000);
}

/** Existing transcription returns words only; estimate reviewable timing within the audio chunk. */
export function captionDraftsFromTranscript(transcript: string, start: number, end: number): LectureCaptionDraft[] {
  const groups: string[] = [];
  let line = "";
  for (const word of transcript.split(/\s+/).filter(Boolean)) {
    if (line && line.length + word.length > 83) { groups.push(line); line = ""; }
    line += `${line ? " " : ""}${word}`;
  }
  if (line) groups.push(line);
  const total = groups.reduce((size, group) => size + group.length, 0);
  let sent = 0;
  return groups.map((text) => {
    const from = alignMilliseconds(start + (end - start) * sent / total);
    sent += text.length;
    return { id: crypto.randomUUID(), start: from, end: alignMilliseconds(start + (end - start) * sent / total), text };
  });
}

const browserAudio = {
  context: () => new AudioContext(),
  decode: decodeBlobToMono,
  extract: extractAudioOnly,
  transcribe: transcribeWalkthroughChunk,
};

export async function transcribeLectureCaptions(source: CaptionAudioSource, signal: AbortSignal, progress: (value: string) => void, audio = browserAudio): Promise<LectureCaptionDraft[]> {
  if (!source.blob.size || source.blob.size > VIDEO_MAX_BYTES || !Number.isFinite(source.duration) || source.duration <= 0 || source.duration > VIDEO_MAX_SECONDS) {
    throw new Error("Automatic captions support up to 20 minutes and 250 MB. Import captions for longer or larger videos.");
  }
  signal.throwIfAborted();
  const ctx = audio.context();
  try {
    const decode = (blob: Blob) => videoWait(() => audio.decode(ctx, blob), signal, VIDEO_LOCAL_WAIT_MS, "audio-decode-timeout");
    const complete = (samples: Float32Array) => samples.length > 0 && samples.length / LIVE_SAMPLE_RATE >= source.duration - Math.min(2, source.duration * 0.02);
    progress("Reading the audible audio…");
    let mono: Float32Array | undefined;
    try { mono = await decode(source.blob); } catch (error) {
      signal.throwIfAborted();
      if (source.kind !== "video" || error instanceof Error && error.message === "audio-decode-timeout") {
        throw new Error("The browser could not read this audio. Try importing a caption file.");
      }
    }
    if ((!mono || !complete(mono)) && source.kind === "video") {
      try {
        mono = await decode(await audio.extract(source.blob, (percent) => progress(`Reading video audio (${percent}%)…`), signal));
      } catch {
        signal.throwIfAborted();
        throw new Error("The browser could not read the video's complete audio. Try importing a caption file.");
      }
    }
    if (!mono || !complete(mono)) throw new Error("The browser could not read the full audio track.");
    const plans = planTranscriptChunks(Math.min(source.duration, mono.length / LIVE_SAMPLE_RATE), 15);
    const drafts: LectureCaptionDraft[] = [];
    for (const plan of plans) {
      signal.throwIfAborted();
      progress(`Transcribing audio ${plan.index + 1} of ${plans.length}…`);
      const samples = sliceMonoSamples(mono, LIVE_SAMPLE_RATE, plan);
      if (!samples.some((value) => value !== 0)) continue;
      const audioData = base64FromArrayBuffer(encodeWav(samples, LIVE_SAMPLE_RATE));
      if (!checkWireBudget(audioData.length, "Caption audio").ok) throw new Error("A caption audio chunk is too large to send.");
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(VIDEO_PROVIDER_WAIT_MS)]);
      let result: Awaited<ReturnType<typeof transcribeWalkthroughChunk>>;
      try { result = await audio.transcribe(audioData, { provider: "gemini" }, requestSignal); } catch {
        signal.throwIfAborted();
        throw new Error(`Could not transcribe audio chunk ${plan.index + 1}. Try again or import captions.`);
      }
      signal.throwIfAborted();
      if ("error" in result) throw new Error(result.error);
      drafts.push(...captionDraftsFromTranscript(result.text, plan.startSec, plan.endSec));
      if (drafts.length > MAX_CAPTION_CUES || drafts.some((draft) => draft.text.length > MAX_CAPTION_TEXT)) {
        throw new Error("The transcript is too long for one caption track. Import a caption file or use a shorter video.");
      }
    }
    if (!drafts.length) throw new Error("Gemini did not detect speech in the selected audio.");
    return drafts;
  } finally {
    if (ctx.state !== "closed") void ctx.close().catch(() => undefined);
  }
}
