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
//
// The audio-preparation and transcription pipeline (obtain audio, decide the
// real-time-fallback guard, transcribe in chunks) was split out into
// takeAnnouncementTranscription.ts to stay under
// recording-split.structure.test.ts's 1000-line ceiling on this directory -
// see that file's own header. This hook still OWNS every ref and setState
// setter that pipeline touches (created via useRef/useState below) and
// still owns drafting, review, arming and posting; it only hands the
// pipeline's own refs down through a TranscriptionPipelineDeps object and
// gets called back via onTranscriptReady (this hook's own runDraft) once a
// transcript is ready. AnnouncementStage and decideRealTimeGuard are
// re-exported below so no existing importer's path changes.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  draftAnnouncementAction,
  saveMessageDraftAction,
  createAnnouncementAction,
  listCourseHubAction,
} from "../../actions";
// Imported directly by module path, not through the "../../actions" barrel
// above - this action lives in this wave's own file set
// (src/app/actions/announcement-image.ts) while the barrel (src/app/actions.ts)
// does not, and a direct "@/app/actions/<file>" import is an already-
// established pattern in this repo (e.g. src/app/api/visualizer/create/route.ts
// imports createVisualizerConceptAction the same way) - so this stays out of
// a file two sibling agents' waves might also be touching.
import { generateAnnouncementImageAction } from "@/app/actions/announcement-image";
import type { MessageDraftPayload } from "@/lib/message-drafts";
import type { TranscriptChunkPlan } from "@/lib/take-transcript";
import {
  buildTakeAnnouncementInstruction,
  buildAnnouncementImagePrompt,
  DEFAULT_ANNOUNCEMENT_COMPOSITION,
  type AnnouncementCompositionSettings,
} from "@/lib/take-announcement";
import { coerceAnnouncementComposition } from "./announcement-composition";
import { announcementImageFileName } from "./announcement-image-filename";
import { getStoredProvider } from "@/lib/llm-provider";
import { useInstitutionSelection } from "@/lib/institutions";
import { isConfirmArmed, mayPostCommit } from "../content-tab/modules/postConfirmArming";
// The image's only real destination this wave ships (see this file's own
// note above imageState in UseTakeAnnouncementReturn): triggerFileDownload is
// the repo's one anchor/click/revoke idiom, not a hand-rolled sixth copy of
// it - see RepoGradesLogPanel.tsx's own comment on why (REGRESSION entry 267
// check 4 already refused one).
import { triggerFileDownload } from "../course-planning/utils";
import { takePostArmSignature } from "./takeAnnouncementArming";
import {
  runPipelineFromSegments,
  runPipelineFromRealTime,
  proceedToTranscription,
  beginRealTimeGuardCheck,
  decideRealTimeGuard,
  estimateRealTimeMinutes,
  type AnnouncementStage,
  type PreparedAudioKind,
  type TranscriptionPipelineDeps,
} from "./takeAnnouncementTranscription";
import type { Take } from "./types";

export type { AnnouncementStage };
export { decideRealTimeGuard };

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

  /** docs/reply-composition-controls-acceptance-criteria.md C0-1 (this
   * group): what every drafted announcement should contain and how formal it
   * should read. Persisted under this surface's own two new "ann-ingredients"
   * / "ann-formality" storage keys (see the literal key names a few lines
   * below, in the state initializer and setComposition - never restated in a
   * comment here, so this comment can never poison the key-inventory scan)
   * - see announcement-composition.ts's coerceAnnouncementComposition for the
   * read side. There is no addressByName field here (see take-announcement
   * .ts's header) and no per-row arming to join: drafting on this surface is
   * single-shot (one subject/body pair, not a queued table of rows), so a
   * composition change has no in-flight draft to disarm - it only takes
   * effect the next time runDraft() actually runs (the panel's auto-start on
   * open, or an explicit regenerate/retry click). The existing POST arm
   * signature already includes the live subject/body, so any regenerate
   * naturally disarms a pending "Confirm post" without composition needing
   * to join that signature too. */
  composition: AnnouncementCompositionSettings;
  setComposition: (next: AnnouncementCompositionSettings) => void;

  /** The announcement's companion image (owner's ask: "a simple, everyday
   * image that is relevant"). "idle" before any attempt or after an explicit
   * discard; "generating" while a call is in flight; "ready" with
   * imageBase64/imageMimeType populated; "failed" with imageError set to a
   * specific message (see announcement-image.ts's own failure branches).
   * Never persisted (not localStorage, not the message draft payload) - see
   * this hook's own note above generateImage for why, and
   * TakeAnnouncementPanel.tsx for how it is rendered. Purely additive: every
   * state here is independent of `stage`/`subject`/`body`, so an image
   * failure can never block or degrade the already-drafted, already-postable
   * announcement text.
   *
   * IMPORTANT: this image is NEVER sent when the announcement is posted.
   * commitPost() below calls createAnnouncementAction with only
   * (canvasUrl, subject, body, institution) - no image argument exists, and
   * none should be added here: the owner separately requires the
   * announcement stay plain-text copyable (see
   * useTakeAnnouncement.image-copy-safety.test.ts), which an inline or
   * attached image would break. Attaching it to the Canvas announcement
   * itself would need Canvas's file-upload API (upload, then reference the
   * result in an HTML body) - out of scope for this wave; see downloadImage
   * below for the destination this wave actually ships. Any UI copy near
   * this state must say so plainly (TakeAnnouncementPanel.tsx's Image
   * section) - an instructor who believes the image posts automatically and
   * finds out from a student is exactly the failure this note exists to
   * prevent. */
  imageState: "idle" | "generating" | "ready" | "failed";
  imageBase64: string | null;
  imageMimeType: string | null;
  imageError: string | null;
  regenerateImage: () => void;
  discardImage: () => void;
  /** The image's real destination (see the IMPORTANT note above imageState):
   * saves the current image to the instructor's downloads as
   * `<subject-slug>-image.<ext>` (announcement-image-filename.ts) so they can
   * attach it themselves wherever they are posting. A no-op when there is no
   * ready image (imageBase64/imageMimeType null) - TakeAnnouncementPanel.tsx
   * only ever renders the control that calls this inside the "ready" branch,
   * so that should never happen in practice; the guard is defense in depth,
   * not the primary gate. */
  downloadImage: () => void;
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

  // docs/reply-composition-controls-acceptance-criteria.md C5, this group's
  // own C-2: same useState-initializer + wrapped-setter idiom as courseId
  // just above - read once at mount via coerceAnnouncementComposition (a
  // plain exported function, per C5a - vitest here renders no hook), written
  // back through both keys on every change.
  const [composition, setCompositionState] = useState<AnnouncementCompositionSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_ANNOUNCEMENT_COMPOSITION;
    return coerceAnnouncementComposition(
      window.localStorage.getItem("ta-rec-ann-ingredients"),
      window.localStorage.getItem("ta-rec-ann-formality")
    );
  });
  function setComposition(next: AnnouncementCompositionSettings) {
    setCompositionState(next);
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ta-rec-ann-ingredients", JSON.stringify(next.ingredients));
    window.localStorage.setItem("ta-rec-ann-formality", next.formality);
  }

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Image companion (owner's ask, see this file's own header and
  // GenerateAnnouncementImageResult in announcement-image.ts). Deliberately
  // component state, not localStorage - the "no base64 image in
  // localStorage" constraint this feature was built under (see
  // upload-budget.ts's own header on wire-size discipline; the reply-table
  // persistence's quota-failure path already proves far smaller payloads can
  // blow a localStorage quota). The image lives only as long as this hook is
  // mounted for this take; closing the panel and reopening it re-generates
  // rather than restoring - a deliberate simplification, not an oversight
  // (see this hook's own header comment above imageState for the full
  // reasoning).
  const [imageState, setImageState] = useState<"idle" | "generating" | "ready" | "failed">("idle");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  // Guards the auto-generation effect below to at most one attempt per
  // drafted subject/body pair - set true the moment an attempt (auto or
  // manual) starts, and reset to false only when runDraft lands a genuinely
  // new draft (see runDraft's own reset of this ref).
  const autoImageAttemptedRef = useRef(false);

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
      // Deliberately read at CLEANUP time, not snapshotted at mount: these
      // are AbortController/AudioContext handles the transcription pipeline
      // (takeAnnouncementTranscription.ts) writes via TranscriptionPipelineDeps
      // while this hook is mounted, not DOM refs - a mount-time snapshot
      // would abort/close whatever existed at mount (usually nothing) rather
      // than whatever the pipeline most recently created, which is the
      // whole point of this cleanup. exhaustive-deps' "may have changed by
      // cleanup time" heuristic is written for DOM-node refs (see its own
      // "if this ref points to a node rendered by React" wording) and
      // cannot see that the write sites now live in the sibling module.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      realTimeAbortRef.current?.abort();
      if (decodeCtxRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Bundles every ref and setState setter the transcription pipeline
  // (takeAnnouncementTranscription.ts) touches into the deps object its
  // exported functions take explicitly - see that file's header for why it
  // takes dependencies as parameters rather than closing over this hook's
  // scope. Built fresh at each call site below so it always reflects the
  // current render's `take`/`setTakes`/`onTranscriptCached` props, exactly
  // as the inlined closures did before this split.
  function pipelineDeps(): TranscriptionPipelineDeps {
    return {
      take,
      setTakes,
      onTranscriptCached,
      onTranscriptReady: runDraft,
      transcriptRef,
      cancelledRef,
      realTimeAbortRef,
      decodeCtxRef,
      preparedKindRef,
      segmentsRef,
      monoRef,
      planRef,
      chunkTranscriptsRef,
      totalChunksRef,
      failedChunkIndexRef,
      lastAnnouncedQuartileRef,
      resolvedRealTimeDurationRef,
      setStage,
      announce,
      setLastMessage,
      setNeedsRealTimeConfirm,
    };
  }

  async function runDraft(transcript: string) {
    announce("Writing the announcement.");
    setStage({ phase: "drafting" });
    const instruction = buildTakeAnnouncementInstruction(
      transcript,
      {
        takeName: take.name,
        durationSec: take.durationSec,
        topic: context.topic,
        objectives: context.objectives,
        cardTitle: context.cardTitle,
        cardSubtitle: context.cardSubtitle,
      },
      composition
    );
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
    // A genuinely new draft lands here - reset the image companion so the
    // auto-generation effect below fires again for the new subject/body,
    // even if a prior draft's image was generated, regenerated, or
    // explicitly discarded. See this file's header comment on imageState for
    // why this is the deliberate behavior (a fresh draft gets a fresh image
    // attempt) rather than carrying a discard decision across drafts.
    autoImageAttemptedRef.current = false;
    setImageState("idle");
    setImageBase64(null);
    setImageMimeType(null);
    setImageError(null);
    setStage({ phase: "review" });
    announce("Draft ready to review.");
  }

  /**
   * Calls generateAnnouncementImageAction with a prompt built from the
   * CURRENT subject/body (buildAnnouncementImagePrompt,
   * src/lib/take-announcement.ts) - always the announcement actually on
   * screen, whether that came from the auto-drafted text, a regenerate, or
   * the instructor's own edits to the Subject/Message fields. Never throws
   * (announcement-image.ts's own discipline); every failure lands in
   * imageError with a specific message, and the drafted announcement text
   * itself is completely untouched either way.
   */
  async function generateImage() {
    setImageState("generating");
    setImageError(null);
    const prompt = buildAnnouncementImagePrompt(subject, body);
    const result = await generateAnnouncementImageAction(prompt);
    if ("error" in result) {
      setImageState("failed");
      setImageError(result.error);
      setImageBase64(null);
      setImageMimeType(null);
      return;
    }
    setImageState("ready");
    setImageBase64(result.base64);
    setImageMimeType(result.mimeType);
  }

  /** Explicit "Regenerate image" control (TakeAnnouncementPanel.tsx) -
   * replaces whatever image is currently shown (ready, failed, or none) with
   * a fresh attempt against the CURRENT subject/body. Marks the auto-attempt
   * ref used so the review-stage effect below never fires a second,
   * redundant attempt on top of this explicit one. */
  function regenerateImage() {
    autoImageAttemptedRef.current = true;
    void generateImage();
  }

  /** Explicit "Remove image" control - clears the image companion without
   * touching subject/body or re-attempting generation. The instructor can
   * still post (or save to drafts) with no image at all; this is the control
   * that makes that a real choice rather than only a byproduct of a failure. */
  function discardImage() {
    autoImageAttemptedRef.current = true;
    setImageState("idle");
    setImageBase64(null);
    setImageMimeType(null);
    setImageError(null);
  }

  /** "Download image" control (TakeAnnouncementPanel.tsx) - the image's only
   * real destination this wave ships (see the IMPORTANT note on imageState
   * above): posting to Canvas never carries it, so the instructor downloads
   * it here and attaches it themselves wherever they are posting. Decodes
   * the base64 the same way this repo's other client-side downloads already
   * do (Uint8Array.from(atob(...), c => c.charCodeAt(0)) - see e.g.
   * FinalizedSyllabusLibrary.tsx's downloadDocx) into a Blob, names it via
   * announcementImageFileName (a pure leaf, unit-tested with frozen
   * literals), and hands both to triggerFileDownload - never a hand-rolled
   * createObjectURL/anchor/click/revoke dance. */
  function downloadImage() {
    if (!imageBase64 || !imageMimeType) return;
    const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: imageMimeType });
    triggerFileDownload(blob, announcementImageFileName(subject, imageMimeType));
  }

  // Auto-generate the image companion the first time a drafted announcement
  // reaches "review" (mirroring this hook's own auto-start-on-open behavior
  // for the TEXT draft, a few lines below - "the click that opened this
  // surface IS the start click, nothing further to press", minimize-clicks).
  // Fires at most once per drafted subject/body pair (autoImageAttemptedRef),
  // never re-fires on every keystroke while the instructor edits the fields,
  // and is skipped entirely for an empty draft. Deferred past a microtask
  // (await Promise.resolve()) before the first setState, matching this
  // file's own auto-start effect's idiom for the same reason: setState must
  // never be reached synchronously from an effect body.
  useEffect(() => {
    if (stage.phase !== "review") return;
    if (autoImageAttemptedRef.current) return;
    if (!subject.trim() || !body.trim()) return;
    autoImageAttemptedRef.current = true;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      void generateImage();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.phase]);

  function start() {
    setLastMessage(null);
    setFieldError(null);
    if (transcriptRef.current) {
      void runDraft(transcriptRef.current);
      return;
    }
    if (take.audioSegments && take.audioSegments.length > 0) {
      void runPipelineFromSegments(take.audioSegments, pipelineDeps());
      return;
    }
    void beginRealTimeGuardCheck(pipelineDeps());
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
    void runPipelineFromRealTime(pipelineDeps());
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
    void proceedToTranscription(failedChunkIndexRef.current, pipelineDeps());
  }

  function startOver() {
    const total = totalChunksRef.current;
    chunkTranscriptsRef.current = new Array(total).fill("");
    lastAnnouncedQuartileRef.current = 0;
    void proceedToTranscription(0, pipelineDeps());
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

    composition,
    setComposition,

    imageState,
    imageBase64,
    imageMimeType,
    imageError,
    regenerateImage,
    discardImage,
    downloadImage,
  };
}
