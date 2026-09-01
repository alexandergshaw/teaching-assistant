// Take-announcement pipeline: prepare a take's audio (segments already
// captured this session, or a real-time fallback for one that was not) and
// transcribe it in sequential chunks. Split out of useTakeAnnouncement.ts
// purely to stay under recording-split.structure.test.ts's 1000-line
// ceiling on src/app/components/recording/ (non-recursive) -
// useTakeAnnouncement.ts was at 915 of that ceiling with no room left for
// the reply-composition-style controls (ingredients, address-by-name,
// formality, mandatory paragraphs) the next wave adds to the announcement
// prompt.
//
// Every function below is a plain function that takes its dependencies
// explicitly (refs, mutators, callbacks) rather than closing over
// useTakeAnnouncement.ts's hook scope - the same shape
// discussion-draft-loop.ts's runDraftLoop uses, for the same reason (see
// that file's own header). useTakeAnnouncement.ts still OWNS every ref and
// every piece of state this pipeline touches (created via useRef/useState
// there); it only hands them down through TranscriptionPipelineDeps and
// calls back out through onTranscriptReady once a transcript is ready to
// draft from. Behaviour is unchanged from when this was a closure.
//
// Import direction: useTakeAnnouncement.ts imports FROM this file, never
// the reverse - the same one-owner, one-direction rule discussion-thread.ts
// and discussion-serialization.ts's headers state for their own splits.
// This file imports nothing from useTakeAnnouncement.ts, so that direction
// is enforced structurally, not just by convention - see this repo's
// recorded split-constants-into-the-leaf failure (a back-imported constant
// created a cycle that silently yielded `undefined` past tsc) for why that
// matters. useTakeAnnouncement.ts re-exports AnnouncementStage and
// decideRealTimeGuard so no existing importer's path changes.

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { transcribeLiveAudioAction } from "../../actions";
import { LIVE_SAMPLE_RATE, downsampleToMono, encodeWav, base64FromArrayBuffer } from "@/lib/live-class/wav";
import { checkWireBudget } from "@/lib/upload-budget";
import { extractAudioOnly } from "@/lib/strip-audio";
import { awaitVideoMetadata, ensureFiniteDuration } from "@/lib/caption-burn";
import { planTranscriptChunks, sliceMonoSamples, joinTranscriptChunks, type TranscriptChunkPlan } from "@/lib/take-transcript";
import { getStoredProvider } from "@/lib/llm-provider";
import type { Take } from "./types";

// The stage a review-and-post pass is currently in. Kept as a discriminated
// union (rather than a handful of booleans) so a transcription failure, a
// draft failure and a post failure each get their own distinguishable
// message instead of collapsing into one generic "something went wrong".
// Defined here (rather than in useTakeAnnouncement.ts, which still writes
// the "drafting"/"review"/"posting"/failed:draft/failed:post phases this
// pipeline never touches) purely to keep the import direction above
// one-way - see this file's header.
export type AnnouncementStage =
  | { phase: "idle" }
  | { phase: "preparing"; realTime: boolean; pct: number }
  | { phase: "transcribing"; chunk: number; of: number }
  | { phase: "drafting" }
  | { phase: "review" }
  | { phase: "posting" }
  | { phase: "noSpeech" }
  | { phase: "failed"; stage: "audio" | "transcribe" | "draft" | "post"; message: string };

export type PreparedAudioKind = "segments" | "single" | null;

type TranscriptionOutcome =
  | { kind: "cancelled"; completed: number }
  | { kind: "failed"; chunkIndex: number; message: string }
  | { kind: "done" };

export function estimateRealTimeMinutes(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 1;
  return Math.max(1, Math.round(durationSec / 60));
}

// The sidecar path is bounded: it rotates into roughly one-minute segments, so
// only one is ever decoded at a time. The real-time fallback has no such bound
// - it hands the whole extracted blob to decodeAudioData in a single call, and
// decodeAudioData decodes the entire buffer at once. At 48 kHz stereo that is
// durationSec * 48000 * 2 * 4 bytes of intermediate PCM before the resample:
// about 23 MB per minute, so 20 minutes is roughly 460 MB in one allocation.
// Past that the tab is liable to die outright, which is a far worse outcome
// than declining, so this refuses with an actionable message instead.
//
// This is a ceiling on the FALLBACK only. A take recorded in this session
// carries its own audio segments and skips this path entirely at any length.
const REAL_TIME_MAX_SECONDS = 20 * 60;

function realTimeTooLong(durationSec: number): boolean {
  return Number.isFinite(durationSec) && durationSec > REAL_TIME_MAX_SECONDS;
}

// FIX 2: the decision half of the guard, pulled out as a pure function so it
// is reachable from node-env vitest (this project's suite has no jsdom - see
// useRepoGradesBulkGrade.test.ts's header comment for the established
// precedent this follows: extract the pure decision from the hook rather
// than trying to render it). `resolveRealAudioDurationSec` below is the
// impure half (touches the DOM) and is exercised only by reading; this
// function is exercised by a real test.
//
// null means "the duration could not be resolved" (Problem B: an
// unresolvable duration must refuse, not gamble, on exactly the path that
// can take the tab down). A non-null return is the refusal message; null
// means "go ahead and show the confirm".
export function decideRealTimeGuard(durationSec: number | null): string | null {
  if (durationSec === null) {
    return "Could not determine this recording's length, so it cannot safely be played back in real time to extract audio here. Record a take in this session to draft from it directly - it carries its own captured audio and skips this step entirely.";
  }
  if (realTimeTooLong(durationSec)) {
    const minutes = estimateRealTimeMinutes(durationSec);
    return `This recording is about ${minutes} minutes long, which is too long to prepare this way - it has no captured audio track, so the whole recording would have to be decoded at once. Record a take in this session to draft from it directly - it carries its own captured audio and skips this step entirely.`;
  }
  return null;
}

// FIX 2 / Problem B: `take.durationSec` is exactly the field finding B5 was
// raised about - buildTakeFromLibraryFile falls back to `file.durationSec ??
// 0` when its own metadata probe throws, and a MediaRecorder webm reports
// `Infinity` until seeked. Both sail past `realTimeTooLong` (Number.isFinite
// rejects Infinity, and 0 is never > REAL_TIME_MAX_SECONDS) straight into the
// ~920 MB single decodeAudioData call the cap exists to prevent. This loads
// the take's own URL into a throwaway <video> and resolves the REAL duration
// the same way buildTakeFromLibraryFile and stripAudio already do - metadata
// plus a seek, not playback - so the guard trusts measured bytes instead of
// a field known to be unreliable on exactly this path. Returns null (rather
// than throwing) when the duration genuinely cannot be determined, so the
// caller can refuse rather than gamble.
export async function resolveRealAudioDurationSec(url: string): Promise<number | null> {
  const probe = document.createElement("video");
  probe.preload = "metadata";
  probe.muted = true;
  probe.src = url;
  try {
    await awaitVideoMetadata(probe);
    return await ensureFiniteDuration(probe);
  } catch {
    return null;
  } finally {
    // Clean up the throwaway element only - `url` is the take's own object
    // URL, owned by the caller, and is never revoked here.
    probe.removeAttribute("src");
    probe.load();
  }
}

export async function decodeBlobToMono(ctx: AudioContext, blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  if (arrayBuffer.byteLength === 0) return new Float32Array(0);
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) channels.push(decoded.getChannelData(ch));
  return downsampleToMono(channels, decoded.sampleRate, LIVE_SAMPLE_RATE);
}

// ---------------------------------------------------------------------------
// The pipeline proper. useTakeAnnouncement.ts owns every ref and setState
// setter below (created via useRef/useState there) and hands them down
// through this object - see this file's header for why.
// ---------------------------------------------------------------------------

export interface TranscriptionPipelineDeps {
  take: Take;
  setTakes: Dispatch<SetStateAction<Take[]>>;
  onTranscriptCached?: (takeId: string, transcript: string) => void;
  /** Called with the joined transcript on a complete successful
   * transcription pass (AC23d) - never on a cancelled or failed one.
   * useTakeAnnouncement.ts supplies its own `runDraft` here. */
  onTranscriptReady: (transcript: string) => Promise<void>;
  transcriptRef: MutableRefObject<string | null>;
  cancelledRef: MutableRefObject<boolean>;
  realTimeAbortRef: MutableRefObject<AbortController | null>;
  decodeCtxRef: MutableRefObject<AudioContext | null>;
  preparedKindRef: MutableRefObject<PreparedAudioKind>;
  segmentsRef: MutableRefObject<Blob[] | null>;
  monoRef: MutableRefObject<Float32Array | null>;
  planRef: MutableRefObject<TranscriptChunkPlan[] | null>;
  chunkTranscriptsRef: MutableRefObject<string[]>;
  totalChunksRef: MutableRefObject<number>;
  failedChunkIndexRef: MutableRefObject<number>;
  lastAnnouncedQuartileRef: MutableRefObject<number>;
  /** FIX 2: the duration resolved by beginRealTimeGuardCheck (measured, never
   * take.durationSec) - useTakeAnnouncement.ts also reads this itself for its
   * own realTimeConfirmMessage, so "about N minutes" reflects the same value
   * the guard decided against. */
  resolvedRealTimeDurationRef: MutableRefObject<number | null>;
  setStage: Dispatch<SetStateAction<AnnouncementStage>>;
  announce: (text: string) => void;
  setLastMessage: (message: string | null) => void;
  setNeedsRealTimeConfirm: (value: boolean) => void;
}

async function ensureDecodeContext(deps: TranscriptionPipelineDeps): Promise<AudioContext> {
  if (deps.decodeCtxRef.current) return deps.decodeCtxRef.current;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (window.AudioContext ?? (w.webkitAudioContext as typeof AudioContext)) as typeof AudioContext | undefined;
  if (!Ctor) throw new Error("This browser cannot decode audio - no AudioContext is available.");
  const ctx = new Ctor({ sampleRate: LIVE_SAMPLE_RATE });
  deps.decodeCtxRef.current = ctx;
  return ctx;
}

async function getChunkMono(i: number, deps: TranscriptionPipelineDeps): Promise<Float32Array> {
  const ctx = await ensureDecodeContext(deps);
  if (deps.preparedKindRef.current === "segments") {
    const segments = deps.segmentsRef.current;
    if (!segments || !segments[i]) return new Float32Array(0);
    return decodeBlobToMono(ctx, segments[i]);
  }
  const mono = deps.monoRef.current;
  const plan = deps.planRef.current;
  if (!mono || !plan || !plan[i]) return new Float32Array(0);
  return sliceMonoSamples(mono, LIVE_SAMPLE_RATE, plan[i]);
}

function announceQuartileIfCrossed(chunk: number, total: number, deps: TranscriptionPipelineDeps) {
  if (total <= 0) return;
  const pct = Math.floor((chunk / total) * 100);
  const quartile = Math.floor(pct / 25);
  if (quartile > deps.lastAnnouncedQuartileRef.current) {
    deps.lastAnnouncedQuartileRef.current = quartile;
    deps.announce(`Transcribing - chunk ${chunk} of ${total} (${pct} percent complete).`);
  }
}

async function runTranscriptionLoop(startIndex: number, total: number, deps: TranscriptionPipelineDeps): Promise<TranscriptionOutcome> {
  const parts = deps.chunkTranscriptsRef.current;
  for (let i = startIndex; i < total; i++) {
    if (deps.cancelledRef.current) {
      return { kind: "cancelled", completed: i };
    }
    deps.setStage({ phase: "transcribing", chunk: i + 1, of: total });
    announceQuartileIfCrossed(i + 1, total, deps);

    let mono: Float32Array;
    try {
      mono = await getChunkMono(i, deps);
    } catch (err) {
      return {
        kind: "failed",
        chunkIndex: i,
        message: err instanceof Error ? err.message : "Could not read this chunk's audio.",
      };
    }

    if (mono.length === 0) {
      parts[i] = "";
      continue;
    }

    const wav = encodeWav(mono, LIVE_SAMPLE_RATE);
    const base64 = base64FromArrayBuffer(wav);
    const budget = checkWireBudget(base64.length, `Chunk ${i + 1} of ${total}`);
    if (!budget.ok) {
      return { kind: "failed", chunkIndex: i, message: budget.error ?? "This chunk is too large to send." };
    }

    const result = await transcribeLiveAudioAction(base64, { provider: getStoredProvider() });
    if ("error" in result) {
      return { kind: "failed", chunkIndex: i, message: result.error };
    }
    parts[i] = result.text;
  }
  return { kind: "done" };
}

export async function proceedToTranscription(startIndex: number, deps: TranscriptionPipelineDeps): Promise<void> {
  deps.cancelledRef.current = false;
  const total = deps.totalChunksRef.current;
  if (total === 0) {
    deps.setStage({ phase: "noSpeech" });
    deps.announce("No speech was found in this recording.");
    return;
  }

  deps.announce(`Transcribing this take - chunk ${startIndex + 1} of ${total}.`);
  deps.setStage({ phase: "transcribing", chunk: startIndex + 1, of: total });
  const outcome = await runTranscriptionLoop(startIndex, total, deps);

  if (outcome.kind === "cancelled") {
    deps.chunkTranscriptsRef.current = new Array(total).fill("");
    deps.setStage({ phase: "idle" });
    const message = `Transcription cancelled after ${outcome.completed} of ${total} chunks. Nothing was kept.`;
    deps.setLastMessage(message);
    deps.announce(message);
    return;
  }

  if (outcome.kind === "failed") {
    deps.failedChunkIndexRef.current = outcome.chunkIndex;
    const message = `Transcription failed on chunk ${outcome.chunkIndex + 1} of ${total} - ${outcome.message}.`;
    deps.setStage({ phase: "failed", stage: "transcribe", message });
    deps.announce(message);
    return;
  }

  const joined = joinTranscriptChunks(deps.chunkTranscriptsRef.current);
  if (!joined) {
    deps.setStage({ phase: "noSpeech" });
    deps.announce("No speech was found in this recording.");
    return;
  }

  // AC23d: the transcript is written ONLY here, on a complete successful
  // pass - never on a cancelled or failed one. Both writes below share
  // that guarantee: setTakes still updates Take.transcript for a take that
  // lives in the `takes` array, and onTranscriptCached feeds RecordingTab's
  // own id-keyed cache (F3) so a library-sourced take - never added to
  // `takes` - gets the same "do not pay for transcription twice" benefit.
  deps.transcriptRef.current = joined;
  const takeId = deps.take.id;
  deps.setTakes((prev) => prev.map((t) => (t.id === takeId ? { ...t, transcript: joined } : t)));
  deps.onTranscriptCached?.(takeId, joined);
  await deps.onTranscriptReady(joined);
}

export async function runPipelineFromSegments(segments: Blob[], deps: TranscriptionPipelineDeps): Promise<void> {
  deps.announce("Preparing this take's audio.");
  deps.setStage({ phase: "preparing", realTime: false, pct: 100 });
  deps.preparedKindRef.current = "segments";
  deps.segmentsRef.current = segments;
  deps.totalChunksRef.current = segments.length;
  deps.chunkTranscriptsRef.current = new Array(segments.length).fill("");
  deps.failedChunkIndexRef.current = 0;
  deps.lastAnnouncedQuartileRef.current = 0;
  await proceedToTranscription(0, deps);
}

export async function runPipelineFromRealTime(deps: TranscriptionPipelineDeps): Promise<void> {
  // FIX 2: the length refusal used to live here, reading take.durationSec -
  // the exact unreliable field B5 was raised about. It is now decided in
  // useTakeAnnouncement.ts's start(), before the confirm is even shown,
  // against a duration measured straight off the take's own bytes
  // (resolveRealAudioDurationSec). By the time this function runs the guard
  // has already passed, so it is not re-checked here against the
  // untrustworthy field.
  deps.cancelledRef.current = false;
  const controller = new AbortController();
  deps.realTimeAbortRef.current = controller;
  deps.announce("Preparing this take's audio - this plays back in real time, so it can take a while.");
  deps.setStage({ phase: "preparing", realTime: true, pct: 0 });
  try {
    const response = await fetch(deps.take.url);
    const blob = await response.blob();
    const audioBlob = await extractAudioOnly(
      blob,
      (pct) => {
        if (deps.cancelledRef.current) return;
        deps.setStage({ phase: "preparing", realTime: true, pct });
      },
      controller.signal
    );
    // The extraction stage is over (successfully) - the signal covers
    // only that stage, so drop the controller now rather than leaving a
    // spent one around for the next attempt to trip over.
    deps.realTimeAbortRef.current = null;

    const ctx = await ensureDecodeContext(deps);
    const mono = await decodeBlobToMono(ctx, audioBlob);
    // Decoding has no abort signal of its own - a Cancel press landing in
    // the narrow window between extraction finishing and decode finishing
    // still needs to be honoured here, via the same ref the chunk loop
    // checks.
    if (deps.cancelledRef.current) {
      deps.setStage({ phase: "idle" });
      const message = "Preparing the audio was cancelled. Nothing was kept.";
      deps.setLastMessage(message);
      deps.announce(message);
      return;
    }

    deps.preparedKindRef.current = "single";
    deps.monoRef.current = mono;
    // B5 fix: plan from the DECODED audio's own length, not take.durationSec.
    // On the AC26 library path, buildTakeFromLibraryFile falls back to
    // file.durationSec ?? 0 whenever the metadata probe throws, and
    // planTranscriptChunks(0) is [] - which proceedToTranscription turns
    // into a false "No speech was found" for a perfectly good recording.
    // mono.length / LIVE_SAMPLE_RATE is the only length actually true of
    // the buffer being sliced below; it also fixes the same bug for a
    // paused walkthrough (whose durationSec under-reports by the pause
    // length) and for any take whose recorded duration is simply wrong. A
    // genuinely empty decode still yields duration 0 here, so it still
    // correctly lands on noSpeech - only a duration failure is no longer
    // misreported as no speech.
    const decodedDurationSec = mono.length / LIVE_SAMPLE_RATE;
    const plan = planTranscriptChunks(decodedDurationSec);
    deps.planRef.current = plan;
    deps.totalChunksRef.current = plan.length;
    deps.chunkTranscriptsRef.current = new Array(plan.length).fill("");
    deps.failedChunkIndexRef.current = 0;
    deps.lastAnnouncedQuartileRef.current = 0;
    await proceedToTranscription(0, deps);
  } catch (err) {
    deps.realTimeAbortRef.current = null;
    // A pressed Cancel button aborts extractAudioOnly's signal, which
    // rejects with this exact AbortError (src/lib/strip-audio.ts) rather
    // than returning a partial blob - it must land as a cancellation
    // (AC23c), never as an audio failure (AC23), or a user who cancelled
    // is shown an error for having done so.
    if (err instanceof DOMException && err.name === "AbortError") {
      deps.setStage({ phase: "idle" });
      const message = "Preparing the audio was cancelled. Nothing was kept.";
      deps.setLastMessage(message);
      deps.announce(message);
      return;
    }
    const message = err instanceof Error ? err.message : "Could not prepare this take's audio.";
    deps.setStage({ phase: "failed", stage: "audio", message });
    deps.announce(message);
  }
}

// FIX 2 / Problem A: the 20-minute guard used to fire only after the user
// pressed "Play it back" on the AC22a confirm - so the confirm's own
// "...about N minutes" estimate was shown, the user committed to it, and
// only then was the request refused. The guard now runs BEFORE the confirm
// is shown, so a take that fails it never reaches the confirm at all - the
// refusal replaces it instead of following it.
//
// FIX 2 / Problem B: the duration used for the check is resolved from the
// take's own bytes (resolveRealAudioDurationSec), never read off
// take.durationSec - see that function's comment for why that field cannot
// be trusted on exactly this path.
export async function beginRealTimeGuardCheck(deps: TranscriptionPipelineDeps): Promise<void> {
  deps.announce("Checking this recording's length.");
  const durationSec = await resolveRealAudioDurationSec(deps.take.url);
  deps.resolvedRealTimeDurationRef.current = durationSec;

  const refusal = decideRealTimeGuard(durationSec);
  if (refusal) {
    deps.setStage({ phase: "failed", stage: "audio", message: refusal });
    deps.announce(refusal);
    return;
  }

  deps.setNeedsRealTimeConfirm(true);
}
