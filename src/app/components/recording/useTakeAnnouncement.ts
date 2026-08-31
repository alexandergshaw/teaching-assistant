"use client";

// Group D: draft, review and post an announcement built from a recorded
// take's audio. Owns the whole pipeline - obtain audio, transcribe it in
// sequential chunks, draft a subject/body, let the instructor review and
// edit, then post to Canvas (or save the draft for later) - behind the
// AnnouncementStage state machine so no two distinct failures ever collapse
// into one on-screen message.
//
// Every server action here is called exactly as it ships - transcription,
// drafting, posting and course listing are all owned elsewhere and none of
// them are edited by this feature.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  transcribeLiveAudioAction,
  draftAnnouncementAction,
  saveMessageDraftAction,
  createAnnouncementAction,
  listCourseHubAction,
} from "../../actions";
import type { MessageDraftPayload } from "@/lib/message-drafts";
import { LIVE_SAMPLE_RATE, downsampleToMono, encodeWav, base64FromArrayBuffer } from "@/lib/live-class/wav";
import { checkWireBudget } from "@/lib/upload-budget";
import { extractAudioOnly } from "@/lib/strip-audio";
import { awaitVideoMetadata, ensureFiniteDuration } from "@/lib/caption-burn";
import { planTranscriptChunks, sliceMonoSamples, joinTranscriptChunks, type TranscriptChunkPlan } from "@/lib/take-transcript";
import { buildTakeAnnouncementInstruction } from "@/lib/take-announcement";
import { getStoredProvider } from "@/lib/llm-provider";
import { useInstitutionSelection } from "@/lib/institutions";
import { isConfirmArmed, mayPostCommit } from "../content-tab/modules/postConfirmArming";
import { takePostArmSignature } from "./takeAnnouncementArming";
import type { Take } from "./types";

// The stage a review-and-post pass is currently in. Kept as a discriminated
// union (rather than a handful of booleans) so a transcription failure, a
// draft failure and a post failure each get their own distinguishable
// message instead of collapsing into one generic "something went wrong".
export type AnnouncementStage =
  | { phase: "idle" }
  | { phase: "preparing"; realTime: boolean; pct: number }
  | { phase: "transcribing"; chunk: number; of: number }
  | { phase: "drafting" }
  | { phase: "review" }
  | { phase: "posting" }
  | { phase: "noSpeech" }
  | { phase: "failed"; stage: "audio" | "transcribe" | "draft" | "post"; message: string };

export interface AnnCourseOption {
  id: string;
  name: string;
  canvasUrl: string;
  institution: string | null;
}

export interface AnnouncementRecordingContext {
  topic?: string;
  objectives?: string;
  cardTitle?: string;
  cardSubtitle?: string;
}

export interface PostedAnnouncementInfo {
  course: string;
  subject: string;
}

export interface UseTakeAnnouncementOptions {
  take: Take;
  setTakes: React.Dispatch<React.SetStateAction<Take[]>>;
  context: AnnouncementRecordingContext;
  /** The durable "this take has already been posted" fact, owned by the
   * caller (see this module's own header note and this file's sibling
   * TakeAnnouncementPanel.tsx for why - the Take type is frozen for this
   * wave and carries no field for it, so it cannot live on the take itself
   * the way `transcript` does). Passing this makes the "no second post"
   * guarantee (AC25f) survive the panel being closed and reopened, not just
   * a single mount. */
  posted: PostedAnnouncementInfo | null;
  onPosted: (result: PostedAnnouncementInfo) => void;
  /** F3 fix: AC24's transcript cache. `setTakes` below only ever reaches a
   * take that lives in `takes` - a library-sourced take (AC26) is built
   * fresh in `RecordingTab.buildTakeFromLibraryFile` and is never added to
   * that array, so the `setTakes` map matched nothing and every re-open paid
   * the full wall-clock `extractAudioOnly` cost again. This cache is owned
   * by RecordingTab and keyed by take id independently of `takes` array
   * membership, so it applies to every take this hook is ever opened with.
   * Read once at mount (matching `take.transcript`'s own seeding below) -
   * this hook's own `transcriptRef` is the source of truth for the rest of
   * its lifetime. */
  cachedTranscript?: string | null;
  /** Companion to `cachedTranscript`: called once, with the take id and the
   * transcript, immediately after AC23d's "complete successful pass" write -
   * never on a cancelled or failed one. */
  onTranscriptCached?: (takeId: string, transcript: string) => void;
}

type PreparedAudioKind = "segments" | "single" | null;

type TranscriptionOutcome =
  | { kind: "cancelled"; completed: number }
  | { kind: "failed"; chunkIndex: number; message: string }
  | { kind: "done" };

export interface ProgressInfo {
  value: number | null;
  max: number;
  valueText: string;
}

export interface UseTakeAnnouncementReturn {
  stage: AnnouncementStage;
  progress: ProgressInfo | null;
  liveRegionText: string;
  lastMessage: string | null;

  needsRealTimeConfirm: boolean;
  realTimeConfirmMessage: string;
  confirmRealTimeExtraction: () => void;
  cancelRealTimeConfirm: () => void;

  cancel: () => void;
  /** 1-based chunk number to show in "Retry from chunk N" (AC23e) - null
   * unless the current stage is a transcribe failure. */
  failedChunkNumber: number | null;
  retryFromFailedChunk: () => void;
  startOver: () => void;
  retryDraft: () => void;
  retryAudio: () => void;
  backToReviewAfterPostFailure: () => void;

  courses: AnnCourseOption[] | null;
  coursesError: string | null;
  courseId: string;
  setCourseId: (id: string) => void;

  subject: string;
  setSubject: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  fieldError: string | null;

  armed: boolean;
  postUnavailableReason: string | null;
  handlePostButtonClick: () => void;
  cancelPostConfirm: () => void;
  posting: boolean;
  postError: string | null;

  saveDraft: () => void;
  savingDraft: boolean;
  draftSaved: boolean;
  draftError: string | null;
}

// GAP 3 (cross-surface busy gating, AC15b): TakeAnnouncementPanel.tsx computes
// its own local `busy` from `stage.phase` but has never exposed it, so
// TakesPanel's per-row gating only ever saw the walkthrough's and audio-
// extraction's busy states. TakeAnnouncementPanel.tsx owns the only call site
// of this hook and is out of this wave's allow-list (a sibling agent's file),
// so the busy fact cannot be threaded up through a new prop the panel would
// have to forward. A module-level external store sidesteps that: this hook
// writes to it below, and RecordingTab.tsx reads it via useAnnouncementBusy()
// with no participation required from the panel in between. A plain
// singleton is also the semantically correct shape here - only one
// TakeAnnouncementPanel is ever mounted at a time (RecordingTab keeps a
// single `announcementTake`), mirroring the "the transcription queue is a
// singleton" reasoning AC15b itself gives.
type AnnouncementBusyListener = () => void;
let currentAnnouncementBusy = false;
const announcementBusyListeners = new Set<AnnouncementBusyListener>();

function setAnnouncementBusy(busy: boolean): void {
  if (busy === currentAnnouncementBusy) return;
  currentAnnouncementBusy = busy;
  announcementBusyListeners.forEach((listener) => listener());
}

function subscribeAnnouncementBusy(listener: AnnouncementBusyListener): () => void {
  announcementBusyListeners.add(listener);
  return () => {
    announcementBusyListeners.delete(listener);
  };
}

function getAnnouncementBusySnapshot(): boolean {
  return currentAnnouncementBusy;
}

/** True while THIS hook's pipeline is preparing audio, transcribing, or
 * drafting for whichever take its single mounted instance is open on - the
 * smallest fact that answers "is the announcement pipeline in flight". Not
 * "posting": posting is a Canvas write, not a use of the recorder or the
 * transcription queue, so it does not need to block another take's actions. */
export function useAnnouncementBusy(): boolean {
  return useSyncExternalStore(subscribeAnnouncementBusy, getAnnouncementBusySnapshot, () => false);
}

function estimateRealTimeMinutes(durationSec: number): number {
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
async function resolveRealAudioDurationSec(url: string): Promise<number | null> {
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

async function decodeBlobToMono(ctx: AudioContext, blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  if (arrayBuffer.byteLength === 0) return new Float32Array(0);
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) channels.push(decoded.getChannelData(ch));
  return downsampleToMono(channels, decoded.sampleRate, LIVE_SAMPLE_RATE);
}

export function useTakeAnnouncement({
  take,
  setTakes,
  context,
  posted,
  onPosted,
  cachedTranscript,
  onTranscriptCached,
}: UseTakeAnnouncementOptions): UseTakeAnnouncementReturn {
  const { active: activeInstitution } = useInstitutionSelection();

  const [stage, setStage] = useState<AnnouncementStage>({ phase: "idle" });
  const [liveRegionText, setLiveRegionText] = useState("");
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [needsRealTimeConfirm, setNeedsRealTimeConfirm] = useState(false);

  const [courses, setCourses] = useState<AnnCourseOption[] | null>(null);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("ta-rec-ann-course") ?? "";
  });

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const [armedFor, setArmedFor] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  // Session-only cache of the transcript this pass has produced (AC24): the
  // `take` prop is a snapshot from whichever render this hook mounted with,
  // so a value written onto it via setTakes below is never visible again
  // through that same snapshot - this ref is the thing every later read
  // (start(), retryDraft()) actually consults.
  const transcriptRef = useRef<string | null>(take.transcript ?? cachedTranscript ?? null);

  const cancelledRef = useRef(false);
  // Covers only the real-time (extractAudioOnly) extraction stage - the
  // chunk loop that follows is stopped by cancelledRef instead, since it has
  // no single awaited call to abort. Cleared back to null whenever that
  // stage settles (success, cancellation or failure) so a later attempt
  // always starts from a fresh, un-aborted controller.
  const realTimeAbortRef = useRef<AbortController | null>(null);
  // FIX 2: the duration resolved by beginRealTimeGuardCheck (measured, never
  // take.durationSec) - reused by the confirm message below so "about N
  // minutes" reflects the same value the guard decided against, and falls
  // back to take.durationSec only before the first check has ever run.
  const resolvedRealTimeDurationRef = useRef<number | null>(null);
  const decodeCtxRef = useRef<AudioContext | null>(null);
  const preparedKindRef = useRef<PreparedAudioKind>(null);
  const segmentsRef = useRef<Blob[] | null>(null);
  const monoRef = useRef<Float32Array | null>(null);
  const planRef = useRef<TranscriptChunkPlan[] | null>(null);
  const chunkTranscriptsRef = useRef<string[]>([]);
  const totalChunksRef = useRef(0);
  const failedChunkIndexRef = useRef(0);
  const lastAnnouncedQuartileRef = useRef(0);

  // Load the owner's courses once, filtering out export-only tiles
  // (canvasUrl: null) up front - they cannot be posted to, so offering them
  // in the picker would let someone choose one and fail later instead of
  // never seeing it. listCourseHubAction is called directly (not
  // useCoursesData(), which additionally fires several list actions per
  // course on mount - absurd for a small recording-tab picker).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await listCourseHubAction();
        if (cancelled) return;
        if ("error" in result) {
          setCoursesError(result.error);
          return;
        }
        const options: AnnCourseOption[] = result.courses
          .filter((c) => Boolean(c.canvasUrl))
          .map((c) => ({
            id: c.id,
            name: c.name,
            canvasUrl: c.canvasUrl as string,
            institution: c.institution ?? null,
          }));
        setCourses(options);
        setCoursesError(null);
      } catch (err) {
        if (!cancelled) setCoursesError(err instanceof Error ? err.message : "Could not load your courses.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // B4 fix: TakeAnnouncementPanel mounts this hook conditionally, so "Back
  // to takes" unmounts it while a pipeline may still be in flight. Without
  // this, closing during the real-time fallback left extractAudioOnly
  // playing the take out for the rest of its wall-clock duration, invisibly,
  // and closing during transcription left the chunk loop firing server
  // actions and calling setState on an unmounted hook - with the busy flag
  // already cleared, letting a second pipeline start on top of the orphaned
  // one. cancelledRef stops the chunk loop between chunks; aborting
  // realTimeAbortRef stops extractAudioOnly immediately rather than letting
  // it run to completion in the background. The shared decode context is
  // also closed here, as before.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      realTimeAbortRef.current?.abort();
      if (decodeCtxRef.current) {
        void decodeCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // GAP 3: publish "a long-running pipeline is in flight" to the module-level
  // store above, matching TakeAnnouncementPanel's own local `busy` derivation
  // exactly (preparing/transcribing/drafting - not posting, not review/idle/
  // failed/noSpeech). The cleanup also fires on unmount, so closing the panel
  // mid-pipeline (its "Back to takes" button is never disabled) cannot leave
  // every other take's actions stuck disabled.
  const pipelineBusy = stage.phase === "preparing" || stage.phase === "transcribing" || stage.phase === "drafting";
  useEffect(() => {
    setAnnouncementBusy(pipelineBusy);
    return () => setAnnouncementBusy(false);
  }, [pipelineBusy]);

  function announce(text: string) {
    setLiveRegionText(text);
  }

  async function ensureDecodeContext(): Promise<AudioContext> {
    if (decodeCtxRef.current) return decodeCtxRef.current;
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (window.AudioContext ?? (w.webkitAudioContext as typeof AudioContext)) as typeof AudioContext | undefined;
    if (!Ctor) throw new Error("This browser cannot decode audio - no AudioContext is available.");
    const ctx = new Ctor({ sampleRate: LIVE_SAMPLE_RATE });
    decodeCtxRef.current = ctx;
    return ctx;
  }

  async function getChunkMono(i: number): Promise<Float32Array> {
    const ctx = await ensureDecodeContext();
    if (preparedKindRef.current === "segments") {
      const segments = segmentsRef.current;
      if (!segments || !segments[i]) return new Float32Array(0);
      return decodeBlobToMono(ctx, segments[i]);
    }
    const mono = monoRef.current;
    const plan = planRef.current;
    if (!mono || !plan || !plan[i]) return new Float32Array(0);
    return sliceMonoSamples(mono, LIVE_SAMPLE_RATE, plan[i]);
  }

  function announceQuartileIfCrossed(chunk: number, total: number) {
    if (total <= 0) return;
    const pct = Math.floor((chunk / total) * 100);
    const quartile = Math.floor(pct / 25);
    if (quartile > lastAnnouncedQuartileRef.current) {
      lastAnnouncedQuartileRef.current = quartile;
      announce(`Transcribing - chunk ${chunk} of ${total} (${pct} percent complete).`);
    }
  }

  async function runTranscriptionLoop(startIndex: number, total: number): Promise<TranscriptionOutcome> {
    const parts = chunkTranscriptsRef.current;
    for (let i = startIndex; i < total; i++) {
      if (cancelledRef.current) {
        return { kind: "cancelled", completed: i };
      }
      setStage({ phase: "transcribing", chunk: i + 1, of: total });
      announceQuartileIfCrossed(i + 1, total);

      let mono: Float32Array;
      try {
        mono = await getChunkMono(i);
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

  async function proceedToTranscription(startIndex: number) {
    cancelledRef.current = false;
    const total = totalChunksRef.current;
    if (total === 0) {
      setStage({ phase: "noSpeech" });
      announce("No speech was found in this recording.");
      return;
    }

    announce(`Transcribing this take - chunk ${startIndex + 1} of ${total}.`);
    setStage({ phase: "transcribing", chunk: startIndex + 1, of: total });
    const outcome = await runTranscriptionLoop(startIndex, total);

    if (outcome.kind === "cancelled") {
      chunkTranscriptsRef.current = new Array(total).fill("");
      setStage({ phase: "idle" });
      const message = `Transcription cancelled after ${outcome.completed} of ${total} chunks. Nothing was kept.`;
      setLastMessage(message);
      announce(message);
      return;
    }

    if (outcome.kind === "failed") {
      failedChunkIndexRef.current = outcome.chunkIndex;
      const message = `Transcription failed on chunk ${outcome.chunkIndex + 1} of ${total} - ${outcome.message}.`;
      setStage({ phase: "failed", stage: "transcribe", message });
      announce(message);
      return;
    }

    const joined = joinTranscriptChunks(chunkTranscriptsRef.current);
    if (!joined) {
      setStage({ phase: "noSpeech" });
      announce("No speech was found in this recording.");
      return;
    }

    // AC23d: the transcript is written ONLY here, on a complete successful
    // pass - never on a cancelled or failed one. Both writes below share
    // that guarantee: setTakes still updates Take.transcript for a take that
    // lives in the `takes` array, and onTranscriptCached feeds RecordingTab's
    // own id-keyed cache (F3) so a library-sourced take - never added to
    // `takes` - gets the same "do not pay for transcription twice" benefit.
    transcriptRef.current = joined;
    setTakes((prev) => prev.map((t) => (t.id === take.id ? { ...t, transcript: joined } : t)));
    onTranscriptCached?.(take.id, joined);
    await runDraft(joined);
  }

  async function runPipelineFromSegments(segments: Blob[]) {
    announce("Preparing this take's audio.");
    setStage({ phase: "preparing", realTime: false, pct: 100 });
    preparedKindRef.current = "segments";
    segmentsRef.current = segments;
    totalChunksRef.current = segments.length;
    chunkTranscriptsRef.current = new Array(segments.length).fill("");
    failedChunkIndexRef.current = 0;
    lastAnnouncedQuartileRef.current = 0;
    await proceedToTranscription(0);
  }

  async function runPipelineFromRealTime() {
    // FIX 2: the length refusal used to live here, reading take.durationSec -
    // the exact unreliable field B5 was raised about. It is now decided in
    // start(), before the confirm is even shown, against a duration measured
    // straight off the take's own bytes (resolveRealAudioDurationSec). By the
    // time this function runs the guard has already passed, so it is not
    // re-checked here against the untrustworthy field.
    cancelledRef.current = false;
    const controller = new AbortController();
    realTimeAbortRef.current = controller;
    announce("Preparing this take's audio - this plays back in real time, so it can take a while.");
    setStage({ phase: "preparing", realTime: true, pct: 0 });
    try {
      const response = await fetch(take.url);
      const blob = await response.blob();
      const audioBlob = await extractAudioOnly(
        blob,
        (pct) => {
          if (cancelledRef.current) return;
          setStage({ phase: "preparing", realTime: true, pct });
        },
        controller.signal
      );
      // The extraction stage is over (successfully) - the signal covers
      // only that stage, so drop the controller now rather than leaving a
      // spent one around for the next attempt to trip over.
      realTimeAbortRef.current = null;

      const ctx = await ensureDecodeContext();
      const mono = await decodeBlobToMono(ctx, audioBlob);
      // Decoding has no abort signal of its own - a Cancel press landing in
      // the narrow window between extraction finishing and decode finishing
      // still needs to be honoured here, via the same ref the chunk loop
      // checks.
      if (cancelledRef.current) {
        setStage({ phase: "idle" });
        const message = "Preparing the audio was cancelled. Nothing was kept.";
        setLastMessage(message);
        announce(message);
        return;
      }

      preparedKindRef.current = "single";
      monoRef.current = mono;
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
      planRef.current = plan;
      totalChunksRef.current = plan.length;
      chunkTranscriptsRef.current = new Array(plan.length).fill("");
      failedChunkIndexRef.current = 0;
      lastAnnouncedQuartileRef.current = 0;
      await proceedToTranscription(0);
    } catch (err) {
      realTimeAbortRef.current = null;
      // A pressed Cancel button aborts extractAudioOnly's signal, which
      // rejects with this exact AbortError (src/lib/strip-audio.ts) rather
      // than returning a partial blob - it must land as a cancellation
      // (AC23c), never as an audio failure (AC23), or a user who cancelled
      // is shown an error for having done so.
      if (err instanceof DOMException && err.name === "AbortError") {
        setStage({ phase: "idle" });
        const message = "Preparing the audio was cancelled. Nothing was kept.";
        setLastMessage(message);
        announce(message);
        return;
      }
      const message = err instanceof Error ? err.message : "Could not prepare this take's audio.";
      setStage({ phase: "failed", stage: "audio", message });
      announce(message);
    }
  }

  async function runDraft(transcript: string) {
    announce("Writing the announcement.");
    setStage({ phase: "drafting" });
    const instruction = buildTakeAnnouncementInstruction(transcript, {
      takeName: take.name,
      durationSec: take.durationSec,
      topic: context.topic,
      objectives: context.objectives,
      cardTitle: context.cardTitle,
      cardSubtitle: context.cardSubtitle,
    });
    const result = await draftAnnouncementAction(instruction, getStoredProvider());
    if ("error" in result) {
      setStage({ phase: "failed", stage: "draft", message: result.error });
      announce(`Could not draft the announcement - ${result.error}`);
      return;
    }
    setSubject(result.title);
    setBody(result.message);
    setArmedFor(null);
    setFieldError(null);
    setPostError(null);
    setStage({ phase: "review" });
    announce("Draft ready to review.");
  }

  function start() {
    setLastMessage(null);
    setFieldError(null);
    if (transcriptRef.current) {
      void runDraft(transcriptRef.current);
      return;
    }
    if (take.audioSegments && take.audioSegments.length > 0) {
      void runPipelineFromSegments(take.audioSegments);
      return;
    }
    void beginRealTimeGuardCheck();
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
  async function beginRealTimeGuardCheck() {
    announce("Checking this recording's length.");
    const durationSec = await resolveRealAudioDurationSec(take.url);
    resolvedRealTimeDurationRef.current = durationSec;

    const refusal = decideRealTimeGuard(durationSec);
    if (refusal) {
      setStage({ phase: "failed", stage: "audio", message: refusal });
      announce(refusal);
      return;
    }

    setNeedsRealTimeConfirm(true);
  }

  // Auto-start the moment the panel opens for a take that has not already
  // been posted (AC15c/minimize-clicks: the "Draft announcement" click that
  // opened this surface IS the start click, nothing further to press). The
  // first setState is deferred past a microtask so it is never reached
  // synchronously from the effect body itself.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (posted) {
        setStage({ phase: "review" });
        return;
      }
      start();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function confirmRealTimeExtraction() {
    setNeedsRealTimeConfirm(false);
    void runPipelineFromRealTime();
  }

  function cancelRealTimeConfirm() {
    setNeedsRealTimeConfirm(false);
  }

  function cancel() {
    cancelledRef.current = true;
    // Covers the transcription chunk loop (checked between chunks). The
    // real-time extraction stage additionally needs its own signal aborted -
    // the ref alone cannot interrupt a call already awaited inside
    // extractAudioOnly.
    realTimeAbortRef.current?.abort();
  }

  function retryFromFailedChunk() {
    void proceedToTranscription(failedChunkIndexRef.current);
  }

  function startOver() {
    const total = totalChunksRef.current;
    chunkTranscriptsRef.current = new Array(total).fill("");
    lastAnnouncedQuartileRef.current = 0;
    void proceedToTranscription(0);
  }

  function retryDraft() {
    if (transcriptRef.current) void runDraft(transcriptRef.current);
  }

  function retryAudio() {
    start();
  }

  function backToReviewAfterPostFailure() {
    setPostError(null);
    setStage({ phase: "review" });
  }

  const selectedCourse = courses?.find((c) => c.id === courseId) ?? null;
  const institution = selectedCourse?.institution ?? activeInstitution;
  const currentArmSignature =
    selectedCourse !== null
      ? JSON.stringify([takePostArmSignature(take.id, selectedCourse.id, institution), subject, body])
      : null;
  const armed = currentArmSignature !== null && isConfirmArmed(armedFor, currentArmSignature);
  const postUnavailableReason = coursesError
    ? "Could not load your courses - try again."
    : !selectedCourse
      ? "Choose a course to post to."
      : null;

  function handlePostButtonClick() {
    setFieldError(null);
    if (!currentArmSignature) return;
    if (!subject.trim()) {
      setFieldError("Enter a subject - an announcement cannot be posted without one.");
      return;
    }
    if (!body.trim()) {
      setFieldError("Enter a message - an announcement cannot be posted without one.");
      return;
    }
    if (armed) {
      if (mayPostCommit(postUnavailableReason, false, armed)) void commitPost();
      return;
    }
    setArmedFor(currentArmSignature);
  }

  function cancelPostConfirm() {
    setArmedFor(null);
  }

  async function commitPost() {
    if (!selectedCourse) return;
    setPosting(true);
    setPostError(null);
    setStage({ phase: "posting" });
    announce("Posting to Canvas.");
    const result = await createAnnouncementAction(selectedCourse.canvasUrl, subject, body, institution || undefined);
    setPosting(false);
    if ("error" in result) {
      const message = `Canvas refused the announcement - ${result.error}. Nothing was posted.`;
      setStage({ phase: "failed", stage: "post", message });
      setPostError(message);
      announce(message);
      return;
    }
    setArmedFor(null);
    setStage({ phase: "review" });
    announce(`Posted to ${selectedCourse.name}. Students can see it now.`);
    onPosted({ course: selectedCourse.name, subject });
  }

  function saveDraft() {
    setFieldError(null);
    setDraftError(null);
    if (!subject.trim()) {
      setFieldError("Enter a subject - an announcement cannot be posted without one.");
      return;
    }
    if (!body.trim()) {
      setFieldError("Enter a message - an announcement cannot be posted without one.");
      return;
    }
    void (async () => {
      setSavingDraft(true);
      const payload: MessageDraftPayload = {
        kind: "announcement",
        title: subject,
        body,
        courseUrl: selectedCourse?.canvasUrl,
        hubCourseId: selectedCourse?.id,
        institution: institution || undefined,
      };
      const result = await saveMessageDraftAction(`Announcement from ${take.name}`, payload);
      setSavingDraft(false);
      if ("error" in result) {
        setDraftError(result.error);
        return;
      }
      setDraftSaved(true);
    })();
  }

  const realTimeMinutes = estimateRealTimeMinutes(resolvedRealTimeDurationRef.current ?? take.durationSec);
  const realTimeConfirmMessage = `This take has no captured audio track, so it has to be played back in real time to get one - about ${realTimeMinutes} minute${realTimeMinutes === 1 ? "" : "s"}.`;

  let progress: ProgressInfo | null = null;
  if (stage.phase === "preparing") {
    progress = {
      value: stage.pct,
      max: 100,
      valueText: stage.realTime ? `Preparing audio - ${stage.pct} percent` : "Preparing audio",
    };
  } else if (stage.phase === "transcribing") {
    progress = { value: stage.chunk, max: stage.of, valueText: `Transcribing chunk ${stage.chunk} of ${stage.of}` };
  } else if (stage.phase === "drafting") {
    progress = { value: null, max: 100, valueText: "Writing the announcement" };
  } else if (stage.phase === "posting") {
    progress = { value: null, max: 100, valueText: "Posting to Canvas" };
  }

  return {
    stage,
    progress,
    liveRegionText,
    lastMessage,

    needsRealTimeConfirm,
    realTimeConfirmMessage,
    confirmRealTimeExtraction,
    cancelRealTimeConfirm,

    cancel,
    failedChunkNumber: stage.phase === "failed" && stage.stage === "transcribe" ? failedChunkIndexRef.current + 1 : null,
    retryFromFailedChunk,
    startOver,
    retryDraft,
    retryAudio,
    backToReviewAfterPostFailure,

    courses,
    coursesError,
    courseId,
    setCourseId,

    subject,
    setSubject,
    body,
    setBody,
    fieldError,

    armed,
    postUnavailableReason,
    handlePostButtonClick,
    cancelPostConfirm,
    posting,
    postError,

    saveDraft,
    savingDraft,
    draftSaved,
    draftError,
  };
}
