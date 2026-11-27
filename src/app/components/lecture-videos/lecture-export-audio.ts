import { encodeWav } from "@/lib/live-class/wav";
import { VIDEO_MAX_SECONDS } from "../walkthrough-announcement/walkthrough-video-limits";
import { renderBlocker, type LecturePart } from "./lectureProject";

const SAMPLE_RATE = 24000;

export function narrationWavBlocker(part: LecturePart): string | undefined {
  if (part.audioMode !== "cues") return "Select generated cue narration to prepare a WAV.";
  if (!Number.isFinite(part.duration) || part.duration <= 0 || part.duration > VIDEO_MAX_SECONDS) {
    return `Narration WAV export supports recordings up to ${VIDEO_MAX_SECONDS / 60} minutes.`;
  }
  return renderBlocker(part);
}

export async function prepareLectureNarrationWav(part: LecturePart, signal: AbortSignal): Promise<Blob> {
  const blocker = narrationWavBlocker(part);
  if (blocker) throw new Error(blocker);
  signal.throwIfAborted();
  const context = new OfflineAudioContext(1, Math.ceil(part.duration * SAMPLE_RATE), SAMPLE_RATE);
  for (const [index, cue] of part.cues.entries()) {
    if (!cue.audio) throw new Error(`Narration audio is missing for cue ${index + 1}.`);
    const bytes = await cue.audio.blob.arrayBuffer();
    signal.throwIfAborted();
    const buffer = await context.decodeAudioData(bytes).catch(() => {
      throw new Error(`The browser could not decode narration cue ${index + 1}.`);
    });
    signal.throwIfAborted();
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    node.start(Number(cue.start));
  }
  const rendered = await context.startRendering();
  signal.throwIfAborted();
  return new Blob([encodeWav(rendered.getChannelData(0), SAMPLE_RATE)], { type: "audio/wav" });
}
