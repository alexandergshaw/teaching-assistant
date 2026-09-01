"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import TabShell from "./TabShell";
import CaptionStudio from "./CaptionStudio";
import SlideStudio from "./SlideStudio";
import styles from "../page.module.css";
import { useSupabase } from "@/context/SupabaseProvider";
import { useRecordingSettings } from "./recording/useRecordingSettings";
import { useDevices } from "./recording/useDevices";
import { useAnnotations } from "./recording/useAnnotations";
import { useBackgroundEffect } from "./recording/useBackgroundEffect";
import { usePipWebcam } from "./recording/usePipWebcam";
import { useTitleCards } from "./recording/useTitleCards";
import { useLectureScript } from "./recording/useLectureScript";
import { useTakes } from "./recording/useTakes";
import { useCanvasPipeline } from "./recording/useCanvasPipeline";
import { useRecorder } from "./recording/useRecorder";
import { useAvatarStudio } from "./recording/useAvatarStudio";
import { useWalkthrough } from "./recording/useWalkthrough";
import SourceDevicesPanel from "./recording/SourceDevicesPanel";
import LectureScriptPanel from "./recording/LectureScriptPanel";
import StagePanel from "./recording/StagePanel";
import SpeedPanel from "./recording/SpeedPanel";
import TakesPanel from "./recording/TakesPanel";
import AvatarStudioPanel from "./recording/AvatarStudioPanel";
import DiscussionRepliesPanel from "./recording/DiscussionRepliesPanel";
import GradingRecordingPanel from "./grading-recording/GradingRecordingPanel";
import WalkthroughPanel from "./recording/WalkthroughPanel";
import TakeAnnouncementPanel from "./recording/TakeAnnouncementPanel";
import { useAnnouncementBusy, type AnnouncementRecordingContext, type PostedAnnouncementInfo } from "./recording/useTakeAnnouncement";
import { listRecordingFiles, downloadRecordingFile, type RecordingFile } from "@/lib/recording-files";
import { awaitVideoMetadata, ensureFiniteDuration } from "@/lib/caption-burn";
import { RECORDING_LAUNCH_EVENT, parseRecordingLaunch } from "@/lib/recording-launch";
import type { Take } from "./recording/types";

export type { Take } from "./recording/types";

export default function RecordingTab({ active = true }: { active?: boolean }) {
  const { supabase, user } = useSupabase();

  // "announcement" (added alongside the pre-existing six): the owner's ask
  // was that recording FOR an announcement be a distinct, directly-reachable
  // feature rather than something found only via a per-take button buried
  // inside the Record sub-view. This is a NEW front door onto the same
  // underlying surface, not a replacement for the old one - see the shared
  // gating below (the block that used to render only for recView==="record")
  // for how both routes stay live at once.
  //
  // "grading" (docs/grading-via-recording-acceptance-criteria.md): a NEW,
  // independent inner view - grading-via-recording's own capture/extraction/
  // table surface (GradingRecordingPanel.tsx), reached from the Knowledge
  // base's "Grade via recording" bulk-bar button and the fab's own
  // navigateToRecordingTool("grading") entry, exactly the same two entry
  // points "discussions" already has.
  const [recView, setRecView] = useState<
    "record" | "discussions" | "speed" | "captions" | "slides" | "avatar" | "announcement" | "grading"
  >(() => {
    if (typeof window === "undefined") return "record";
    const v = localStorage.getItem("ta-rec-view");
    return v === "discussions" ||
      v === "speed" ||
      v === "captions" ||
      v === "slides" ||
      v === "avatar" ||
      v === "announcement" ||
      v === "grading"
      ? v
      : "record";
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-rec-view", recView);
  }, [recView]);

  // Launch seam (Knowledge base "Start recording" on a page selection, and
  // the fab's Recording-tab entries): RecordingTab is kept mounted for the
  // whole app session (see the always-mounted wrapper in page.tsx), so a
  // mount-only effect reading a one-shot payload would only ever observe the
  // FIRST launch of a session - see src/lib/recording-launch.ts's own header
  // comment for the full account. Registering this listener once (empty
  // deps) is still correct: it is the CALLBACK, not the effect body, that
  // must re-run per launch, and a live `window.addEventListener` does
  // exactly that - every openRecordingTool() dispatch, first or fifth,
  // reaches this handler and switches recView. Re-parses `e.detail`
  // defensively (matching AiChatFab's own re-parse of the sibling
  // "open-ai-chat" event) rather than trusting the dispatcher, since a raw
  // CustomEvent dispatch bypassing openRecordingTool() is not ruled out (see
  // ContextMenu.tsx's own bypass of openChat() for the "open-ai-chat"
  // event's precedent of exactly that).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = e instanceof CustomEvent ? parseRecordingLaunch(e.detail) : null;
      if (!detail) return;
      setRecView(detail.view);
    };
    window.addEventListener(RECORDING_LAUNCH_EVENT, handler);
    return () => window.removeEventListener(RECORDING_LAUNCH_EVENT, handler);
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [hasStream, setHasStream] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  const settings = useRecordingSettings();
  const dev = useDevices({ setError });
  const ann = useAnnotations();
  const bg = useBackgroundEffect({ source: settings.source });

  // AC16d/trap 17: the bubble now has a third, independent way to be live -
  // forced on by a walkthrough (mode "video") over a source that is never
  // "screen". `active` keeps its old meaning for the record stage; `forceOn`
  // is driven by the walkthrough below via setBubbleWanted.
  const [bubbleWanted, setBubbleWanted] = useState(false);
  const pip = usePipWebcam({
    active: settings.source === "screen" && hasStream,
    forceOn: bubbleWanted,
    cameraId: settings.cameraId,
    setError,
  });

  const cards = useTitleCards();
  const script = useLectureScript();
  const takes = useTakes({ supabase, user, setError });
  const avatarStudio = useAvatarStudio();

  const pipeline = useCanvasPipeline({
    videoRef,
    source: settings.source,
    mirror: settings.mirror,
    applyBackgroundEffect: bg.applyBackgroundEffect,
    overlayCanvasRef: ann.overlayCanvasRef,
    strokesRef: ann.strokesRef,
    redrawOverlay: ann.redrawOverlay,
    pipVideoRef: pip.pipVideoRef,
    pipEnabledRef: pip.pipEnabledRef,
    pipCornerRef: pip.pipCornerRef,
    bubbleShapeRef: pip.bubbleShapeRef,
    bubbleSizeRef: pip.bubbleSizeRef,
    cardPhaseRef: cards.cardPhaseRef,
    cardTitleRef: cards.cardTitleRef,
    cardSubtitleRef: cards.cardSubtitleRef,
    cardClosingRef: cards.cardClosingRef,
    cardBgRef: cards.cardBgRef,
    cardTextRef: cards.cardTextRef,
  });

  // Group E/AC28: the walkthrough and announcement panes are new surfaces
  // this tab can show. `walkthroughTake`/`announcementTake` gate them - never
  // `ta-rec-view` (AC16b: takes are in-memory object URLs, so restoring one of
  // these panes after a reload would restore a pane whose subject no longer
  // exists).
  const [walkthroughTake, setWalkthroughTake] = useState<Take | null>(null);
  const [announcementTake, setAnnouncementTake] = useState<Take | null>(null);
  const [postedByTakeId, setPostedByTakeId] = useState<Record<string, PostedAnnouncementInfo>>({});
  const [announcementCourseId, setAnnouncementCourseId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-ann-course") ?? "";
  });

  // AC28/modal-focus-restoration Decision 5: a KEYED ref map, not a single
  // ref - one walkthrough pane and one announcement panel serve N take rows.
  // Captured synchronously from event.currentTarget at click time (AC3).
  // Falls back to the TakesPanel container, which outlives a deleted row -
  // never document.body.
  const restoreTargetsRef = useRef<Record<string, HTMLElement | null>>({});
  const takesPanelContainerRef = useRef<HTMLDivElement | null>(null);

  const restoreFocusFor = useCallback((takeId: string) => {
    const target = restoreTargetsRef.current[takeId];
    delete restoreTargetsRef.current[takeId];
    if (target && document.contains(target)) {
      target.focus();
      return;
    }
    takesPanelContainerRef.current?.focus();
  }, []);

  // AC26: both new surfaces take a Take, and a library file is not one. A
  // chosen library file is downloaded once and wrapped as a Take-shaped
  // object with its own object URL - openWalkthrough/openAnnouncement below
  // accept it exactly like a session take, and neither sibling hook needs to
  // know the bytes came from the library. Tracked here (id -> object URL) so
  // it can be revoked when discarded even after the take state is cleared.
  const libraryDerivedUrlsRef = useRef<Map<string, string>>(new Map());

  // F3 fix: AC24's transcript cache never applied to a library-sourced take.
  // useTakeAnnouncement's own cache writes onto the take via `setTakes`,
  // which only ever matches something inside `takes.takes` - a library file
  // is wrapped into a Take here (buildTakeFromLibraryFile) and never added to
  // that array, so the write matched nothing and every re-open of the same
  // file paid the full wall-clock extractAudioOnly cost again. Owned here,
  // independent of `takes` array membership, and keyed by take id - which is
  // why buildTakeFromLibraryFile below mints a STABLE id per library file
  // rather than a fresh crypto.randomUUID() each time: without that, this
  // cache would still never be hit twice for the same file. State (matching
  // postedByTakeId's own shape just above), not a ref - the value is read at
  // render time to hand to whichever panel is mounted.
  const [transcriptCache, setTranscriptCache] = useState<Record<string, string>>({});
  const cacheTranscriptForTake = useCallback((takeId: string, transcript: string) => {
    setTranscriptCache((prev) => ({ ...prev, [takeId]: transcript }));
  }, []);

  const releaseLibraryDerivedTake = useCallback((takeId: string | undefined) => {
    if (!takeId) return;
    const url = libraryDerivedUrlsRef.current.get(takeId);
    if (url) {
      URL.revokeObjectURL(url);
      libraryDerivedUrlsRef.current.delete(takeId);
    }
  }, []);

  const openWalkthrough = useCallback((take: Take, sourceEl: HTMLElement) => {
    restoreTargetsRef.current[take.id] = sourceEl;
    setWalkthroughTake(take);
  }, []);

  const closeWalkthrough = useCallback(() => {
    if (!walkthroughTake) return;
    const id = walkthroughTake.id;
    releaseLibraryDerivedTake(id);
    setWalkthroughTake(null);
    restoreFocusFor(id);
  }, [walkthroughTake, releaseLibraryDerivedTake, restoreFocusFor]);

  // S7 fix: TakesPanel's overflow Delete calls handleDelete directly, which
  // revokes the take's object URL immediately (useTakes.ts) - but
  // walkthroughTake/announcementTake can still hold that exact Take, and
  // fetch(take.url) against a revoked URL fails with an opaque network error.
  // Wrapping the delete here (RecordingTab is the only owner of both pieces
  // of state) closes whichever surface has the deleted take open BEFORE the
  // URL is revoked, the same way the panels' own close paths do - so a
  // deleted take's open pane tears itself down cleanly instead of being left
  // pointing at dead bytes.
  const handleDeleteTake = useCallback(
    (id: string) => {
      if (walkthroughTake?.id === id) {
        releaseLibraryDerivedTake(id);
        setWalkthroughTake(null);
      }
      if (announcementTake?.id === id) {
        releaseLibraryDerivedTake(id);
        setAnnouncementTake(null);
      }
      takes.handleDelete(id);
    },
    [walkthroughTake, announcementTake, releaseLibraryDerivedTake, takes]
  );

  const openAnnouncement = useCallback((take: Take, sourceEl: HTMLElement) => {
    restoreTargetsRef.current[take.id] = sourceEl;
    setAnnouncementTake(take);
  }, []);

  const closeAnnouncement = useCallback(() => {
    if (!announcementTake) return;
    const id = announcementTake.id;
    releaseLibraryDerivedTake(id);
    setAnnouncementTake(null);
    restoreFocusFor(id);
  }, [announcementTake, releaseLibraryDerivedTake, restoreFocusFor]);

  // AC28: the R/P/M shortcuts (owned by useRecorder, gated only by `active`)
  // must not fire while a walkthrough or announcement pane is open, or
  // pressing R while narrating starts a second recorder. Rather than editing
  // useRecorder.ts (a sibling's file), the existing `active` gate is fed a
  // narrower value - true only when this tab is on-screen, showing the
  // recording stage, and neither new pane is open.
  //
  // Extended to the "announcement" view alongside "record": both views now
  // render the SAME recording-stage block (see the shared display gate a
  // little further down) whenever no take/walkthrough pane has been opened
  // yet, since drafting an announcement first requires a take to draft from.
  // While that stage is what is on screen, the record shortcuts should work
  // exactly as they do on the Record view - the opposite of the actual
  // panel's suppression, which is untouched: once `announcementTake` is set
  // and TakeAnnouncementPanel is what is showing, this still goes false via
  // the `announcementTake === null` check, and pressing R while editing an
  // announcement's subject/body still cannot start a second recorder.
  const recordSurfaceActive =
    active &&
    (recView === "record" || recView === "announcement") &&
    walkthroughTake === null &&
    announcementTake === null;

  const rec = useRecorder({
    active: recordSurfaceActive,
    settings,
    setError,
    hasStream,
    setHasStream,
    loadDevices: dev.loadDevices,
    videoRef,
    pipeline,
    cardPhaseRef: cards.cardPhaseRef,
    cardNoticeTimerRef: cards.cardNoticeTimerRef,
    setCardNotice: cards.setCardNotice,
    cardsOn: cards.cardsOn,
    cardSecondsRef: cards.cardSecondsRef,
    pipStreamRef: pip.pipStreamRef,
    pipVideoRef: pip.pipVideoRef,
    takesLength: takes.takes.length,
    addRecordedTake: takes.addRecordedTake,
  });

  // P3 fix: the always-on 30fps compositor (started at the end of
  // startPreview for the screen source, per AC14) was previously stopped only
  // by stopEverything - so it kept compositing a 1920x1080 drawImage plus
  // overlay at 30fps (~62 Mpx/s) while the user was on another inner view,
  // the Recording tab was hidden, or the browser tab was backgrounded, on a
  // machine that is simultaneously screen-sharing, and held a second camera
  // stream open when the bubble was on. RecordingTab already owns the
  // useCanvasPipeline instance and recordSurfaceActive, so this stops the
  // pipeline only when idle AND the record surface is not the visible one,
  // and restarts it (idempotently) once it is again. Gating on
  // recState === "idle" is required so REGRESSION check 1's "navigation
  // never kills a live recording" stays intact - recording/paused/finishing
  // always keep it running regardless of which pane is on screen.
  useEffect(() => {
    if (settings.source !== "screen" || !hasStream) return;
    if (rec.recState === "idle" && !recordSurfaceActive) {
      pipeline.stopPipeline();
    } else {
      pipeline.startPipeline();
    }
    // FIX 1: depend on the stable useCallback-wrapped start/stop functions,
    // never on `pipeline` itself - useCanvasPipeline returns a fresh object
    // literal every render (no useMemo, and that file is off-limits here), so
    // depending on the object re-ran this effect on every RecordingTab
    // render. On the live branch that re-ran startPipeline(), which
    // unconditionally stops the Worker-backed frame ticker and spins up a
    // brand new Blob-URL Worker - happening continuously WHILE a screen
    // recording is in progress, since elapsed/bytes/level updates re-render
    // this component at least once a second. Now the effect can only re-run
    // when one of the primitive gate values actually changes.
  }, [settings.source, hasStream, rec.recState, recordSurfaceActive, pipeline.startPipeline, pipeline.stopPipeline]);

  const walkthrough = useWalkthrough({
    take: walkthroughTake,
    pipVideoRef: pip.pipVideoRef,
    bubbleShapeRef: pip.bubbleShapeRef,
    bubbleSizeRef: pip.bubbleSizeRef,
    pipCornerRef: pip.pipCornerRef,
    setBubbleWanted,
    addRecordedTake: takes.addRecordedTake,
    micId: settings.micId,
    noiseSuppression: settings.noiseSuppression,
    echoCancellation: settings.echoCancellation,
    autoGain: settings.autoGain,
    recordPreviewActive: hasStream,
    stopRecordPreview: rec.stopEverything,
  });

  // AC15b: while a walkthrough capture, an audio extraction, or an
  // announcement draft is running (on any take), the other long-running
  // per-take actions are disabled on every row, not just the busy one - the
  // recorder and the transcription queue are singletons. The announcement
  // pipeline's own busy state lives inside useTakeAnnouncement, private to
  // TakeAnnouncementPanel - useAnnouncementBusy() reads it from the
  // module-level store that hook publishes to, with no prop threaded through
  // the panel (see that hook's own comment on the store for why).
  const walkthroughBusy =
    walkthroughTake !== null &&
    (walkthrough.stage === "loading" ||
      walkthrough.stage === "recording" ||
      walkthrough.stage === "paused" ||
      walkthrough.stage === "finishing");
  const announcementBusy = useAnnouncementBusy();
  const crossTakeBusyReason: string | null = walkthroughBusy
    ? "A walkthrough recording is in progress on another take."
    : takes.extractingAudioId !== null
      ? "Audio is being extracted from another take."
      : announcementBusy
        ? "An announcement is being prepared for another take."
        : null;
  const crossTakeBusy = crossTakeBusyReason !== null;

  // AC15c: the most recently finished take, so StagePanel can render its
  // actions inline on the stage. takes.addRecordedTake appends, so the last
  // entry is always the newest - this recomputes on every render rather than
  // being cached, so it is automatically superseded the moment a new take
  // lands.
  const latestTake: Take | null = takes.takes.length > 0 ? takes.takes[takes.takes.length - 1] : null;

  // AC25: the same course/topic context gatherRecordingContext() folds into
  // captions, built from the live hook state already held here rather than
  // re-reading localStorage a beat later.
  const announcementContext: AnnouncementRecordingContext = {
    topic: script.scriptTopic || undefined,
    objectives: script.scriptObjectives || undefined,
    cardTitle: cards.cardTitle || undefined,
    cardSubtitle: cards.cardSubtitle || undefined,
  };

  // AC26 reachability: recordings from before this page load live only in
  // the library. Loaded lazily, once, the same way useVideoImport does for
  // Caption Studio.
  const [libraryFiles, setLibraryFiles] = useState<RecordingFile[] | null>(null);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [selectedLibraryFileId, setSelectedLibraryFileId] = useState("");
  const [libraryActionBusy, setLibraryActionBusy] = useState<"walkthrough" | "announcement" | null>(null);

  useEffect(() => {
    if (!user || libraryFiles !== null || libraryBusy) return;
    let cancelled = false;
    (async () => {
      setLibraryBusy(true);
      try {
        const files = await listRecordingFiles(supabase, user.id);
        if (!cancelled) setLibraryFiles(files);
      } catch (err) {
        if (!cancelled) setLibraryError(err instanceof Error ? err.message : "Could not load your recording library.");
      } finally {
        if (!cancelled) setLibraryBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, user, libraryFiles, libraryBusy]);

  // Auto-picks the first library file once the list loads (minimize-clicks),
  // derived at render time rather than set-state-in-an-effect - the picker's
  // value falls back to the first file only until the user (or an onChange)
  // actually chooses one.
  const effectiveLibraryFileId =
    selectedLibraryFileId || (libraryFiles && libraryFiles.length > 0 ? libraryFiles[0].id : "");
  const selectedLibraryFile = libraryFiles?.find((f) => f.id === effectiveLibraryFileId) ?? null;

  async function buildTakeFromLibraryFile(file: RecordingFile): Promise<Take> {
    const blob = await downloadRecordingFile(supabase, file);
    const url = URL.createObjectURL(blob);
    let durationSec = file.durationSec ?? 0;
    try {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.muted = true;
      probe.src = url;
      await awaitVideoMetadata(probe);
      durationSec = await ensureFiniteDuration(probe);
    } catch {
      // Best effort - falls back to the library row's own duration (possibly 0).
    }
    const take: Take = {
      // F3: a STABLE id derived from the library file's own id, not a fresh
      // crypto.randomUUID() per open - the transcript cache above (and
      // postedByTakeId's "no second post" guarantee) are both keyed by take
      // id, so a random id here would mean neither ever survives closing and
      // reopening the same file, which is exactly the repeated-cost problem
      // this fix exists to close. Safe to reuse across opens: this take is
      // never added to `takes.takes`, so it can never collide with a
      // recorded take's own randomUUID id, and only one of the walkthrough/
      // announcement panes can be open at a time (the buttons that open
      // either one are hidden while the other's pane is showing), so the two
      // flows never contend for the same id concurrently.
      id: `library-${file.id}`,
      name: file.name,
      url,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      durationSec,
      createdAt: new Date(file.createdAt).getTime(),
    };
    libraryDerivedUrlsRef.current.set(take.id, url);
    return take;
  }

  async function handleLibraryTalkThrough(file: RecordingFile, sourceEl: HTMLElement) {
    setLibraryError(null);
    setLibraryActionBusy("walkthrough");
    try {
      const take = await buildTakeFromLibraryFile(file);
      openWalkthrough(take, sourceEl);
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : "Could not load that recording.");
    } finally {
      setLibraryActionBusy(null);
    }
  }

  async function handleLibraryDraftAnnouncement(file: RecordingFile, sourceEl: HTMLElement) {
    setLibraryError(null);
    setLibraryActionBusy("announcement");
    try {
      const take = await buildTakeFromLibraryFile(file);
      openAnnouncement(take, sourceEl);
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : "Could not load that recording.");
    } finally {
      setLibraryActionBusy(null);
    }
  }

  // Persist form control states to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-source", settings.source);
    localStorage.setItem("ta-rec-noise", settings.noiseSuppression ? "1" : "0");
    localStorage.setItem("ta-rec-echo", settings.echoCancellation ? "1" : "0");
    localStorage.setItem("ta-rec-gain", settings.autoGain ? "1" : "0");
    localStorage.setItem("ta-rec-use-countdown", settings.useCountdown ? "1" : "0");
    localStorage.setItem("ta-rec-bg", bg.bgMode);
    localStorage.setItem("ta-rec-pip", pip.pipEnabled ? "1" : "0");
    localStorage.setItem("ta-rec-pip-corner", pip.pipCorner);
    localStorage.setItem("ta-rec-pip-shape", pip.bubbleShape);
    localStorage.setItem("ta-rec-pip-size", pip.bubbleSize);
    localStorage.setItem("ta-rec-pen-color", ann.penColor);
    localStorage.setItem("ta-rec-pen-size", String(ann.penSize));
    localStorage.setItem("ta-rec-prompter", script.prompterOn ? "1" : "0");
    localStorage.setItem("ta-rec-prompter-size", script.prompterSize);
    localStorage.setItem("ta-rec-screen-audio", settings.shareSystemAudio ? "1" : "0");
    localStorage.setItem("ta-rec-walk-mode", walkthrough.mode);
    localStorage.setItem("ta-rec-walk-keep-source-audio", walkthrough.keepSourceAudio ? "1" : "0");
    localStorage.setItem("ta-rec-ann-course", announcementCourseId);
  }, [
    settings.source,
    settings.noiseSuppression,
    settings.echoCancellation,
    settings.autoGain,
    settings.useCountdown,
    bg.bgMode,
    pip.pipEnabled,
    pip.pipCorner,
    pip.bubbleShape,
    pip.bubbleSize,
    ann.penColor,
    ann.penSize,
    script.prompterOn,
    script.prompterSize,
    settings.shareSystemAudio,
    walkthrough.mode,
    walkthrough.keepSourceAudio,
    announcementCourseId,
  ]);

  // Unmount-only cleanup. Latest takes/stopEverything are read through refs so
  // this never re-runs (a deps-based cleanup would kill the stream and revoke
  // take URLs every time a take is added).
  useEffect(() => {
    const libraryUrls = libraryDerivedUrlsRef.current;
    return () => {
      void rec.stopEverythingRef.current();
      avatarStudio.stopEverythingRef.current();
      takes.takesRef.current.forEach((take) => {
        URL.revokeObjectURL(take.url);
      });
      bg.segmenterRef.current?.close();
      libraryUrls.forEach((url) => URL.revokeObjectURL(url));
      libraryUrls.clear();
    };
  }, [rec.stopEverythingRef, avatarStudio.stopEverythingRef, takes.takesRef, bg.segmenterRef]);

  return (
    <TabShell
      eyebrow="Recording"
      title="Record from a camera"
      subtitle="Record video from any attached camera or your screen, preview it live, and download the takes."
    >
      <div className={styles.lessonInnerTabs} role="tablist" aria-label="Recording tools">
        {([["record", "Record"], ["announcement", "Record announcement"], ["discussions", "Discussion replies"], ["grading", "Grading (from a recording)"], ["speed", "Change speed"], ["captions", "Caption a video"], ["slides", "Narrate a deck"], ["avatar", "Avatar"]] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={recView === key}
            className={`${styles.lessonInnerTab}${recView === key ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => setRecView(key)}>
            <span className={styles.tabLabelWrap}>{label}</span>
          </button>
        ))}
      </div>

      {/* Shared by "record" AND "announcement": the owner's ask was a
          directly-reachable front door for recording FOR an announcement,
          not a replacement for the existing per-take route reached from a
          take's own row while on Record. TakeAnnouncementPanel is gated on
          `announcementTake`, never on which of these two views is active
          (AC16b's own reasoning: a take is an in-memory object URL, so
          nothing about it can be restored from `recView` after a reload) -
          so the same recording stage, takes list, and library picker serve
          BOTH entry points: an instructor who opens this from the new
          Announcement tab with no take yet can record one right here or pick
          one from the library or the session's own takes list, exactly like
          Record; an instructor who opens the panel from a take's row while
          already on Record keeps that exact route too, unchanged. */}
      <div style={{ display: recView === "record" || recView === "announcement" ? undefined : "none" }}>
        {error && <p role="alert" className={styles.error}>{error}</p>}

        {recView === "announcement" && !walkthroughTake && !announcementTake && (
          <p className={styles.fieldHint}>
            Record a new take, or pick an existing one below (including from your recording library), to draft a Canvas announcement from it.
          </p>
        )}

        {/* AC16b: the walkthrough pane is a fifth pane of this always-mounted
            display:none stack, never a modal - reached only from a take's row
            and left again with "Back to takes". Nesting it here (rather than
            as a sibling of captions/slides/avatar) keeps it reachable without
            leaving the Record sub-tab, and still never unmounts it, since the
            whole subtree above is only ever display:none-toggled. */}
        <div style={{ display: walkthroughTake || announcementTake ? "none" : undefined }}>
          <SourceDevicesPanel
            devices={dev.devices}
            requestAccess={dev.requestAccess}
            settings={settings}
            bg={bg}
            pip={pip}
            cards={cards}
            backupDir={takes.backupDir}
            setBackupDir={takes.setBackupDir}
            userPickedRef={settings.userPickedRef}
            bgImageRef={bg.bgImageRef}
            bgFileRef={bg.bgFileRef}
            hasDisplayAudioTrack={rec.hasDisplayAudioTrack}
            screenAudioNotice={rec.screenAudioNotice}
          />
          <LectureScriptPanel
            scriptTopic={script.scriptTopic}
            setScriptTopic={script.setScriptTopic}
            scriptObjectives={script.scriptObjectives}
            setScriptObjectives={script.setScriptObjectives}
            scriptMinutes={script.scriptMinutes}
            setScriptMinutes={script.setScriptMinutes}
            script={script.script}
            setScript={script.setScript}
            scriptBusy={script.scriptBusy}
            setScriptBusy={script.setScriptBusy}
            scriptError={script.scriptError}
            setScriptError={script.setScriptError}
            prompterOn={script.prompterOn}
            setPrompterOn={script.setPrompterOn}
            prompterSize={script.prompterSize}
            setPrompterSize={script.setPrompterSize}
            handleGenerateScript={script.handleGenerateScript}
          />
          <StagePanel
            videoRef={videoRef}
            source={settings.source}
            mirror={settings.mirror}
            hasStream={hasStream}
            hasAudio={rec.hasAudio}
            script={script.script}
            prompterOn={script.prompterOn}
            prompterSize={script.prompterSize}
            annotations={ann}
            recState={rec.recState}
            elapsed={rec.elapsed}
            bytes={rec.bytes}
            muted={rec.muted}
            level={rec.level}
            countdown={rec.countdown}
            finishing={rec.finishing}
            toggleMute={rec.toggleMute}
            beginRecording={rec.beginRecording}
            pauseRecording={rec.pauseRecording}
            resumeRecording={rec.resumeRecording}
            stopRecording={rec.stopRecording}
            startPreview={rec.startPreview}
            stopEverything={rec.stopEverything}
            cardNotice={cards.cardNotice}
            autoStopMin={settings.autoStopMin}
            userPickedRef={settings.userPickedRef}
            attachPipelineCanvas={pipeline.attachPipelineCanvas}
            screenAudioNotice={rec.screenAudioNotice}
            audioMixNotice={rec.audioMixNotice}
            onShareAgain={() => { void rec.startPreview(); }}
            pipEnabled={pip.pipEnabled}
            bubbleShape={pip.bubbleShape}
            bubbleSize={pip.bubbleSize}
            pipCorner={pip.pipCorner}
            latestTake={latestTake}
            onTalkThrough={openWalkthrough}
            onDraftAnnouncement={openAnnouncement}
            latestTakeBusyReason={crossTakeBusyReason}
          />
          <TakesPanel
            takes={takes.takes}
            takeNameDrafts={takes.takeNameDrafts}
            setTakeNameDrafts={takes.setTakeNameDrafts}
            saveTakeName={takes.saveTakeName}
            handleDownload={takes.handleDownload}
            handleDelete={handleDeleteTake}
            handleExtractAudio={takes.handleExtractAudio}
            extractingAudioId={takes.extractingAudioId}
            onTalkThrough={openWalkthrough}
            onDraftAnnouncement={openAnnouncement}
            busyReason={crossTakeBusyReason}
            postedByTakeId={postedByTakeId}
            containerRef={takesPanelContainerRef}
          />

          {/* AC26: reach recordings made before this page load - a library
              file is not a Take, so it is downloaded and wrapped as one here,
              then handed to the same openWalkthrough/openAnnouncement entry
              points a session take uses. Neither sibling surface knows the
              difference. */}
          <div className={styles.adaptPanel}>
            <div className={styles.adaptPanelHeader}>
              <h2 className={styles.adaptPanelTitle}>Narrate or announce a saved recording</h2>
              <p className={styles.adaptPanelSubtitle}>
                Pick anything already in your recording library - including a captioned or narrated file - to talk over it or draft an announcement from it.
              </p>
            </div>
            {libraryError && <p role="alert" className={styles.error}>{libraryError}</p>}
            {libraryBusy && libraryFiles === null ? (
              <p className={styles.fieldHint} role="status" aria-live="polite">Loading your recording library…</p>
            ) : libraryFiles && libraryFiles.length === 0 ? (
              <p className={styles.fieldHint}>Nothing in your recording library yet.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
                <TextField
                  select
                  label="Library recording"
                  size="small"
                  value={effectiveLibraryFileId}
                  onChange={(e) => setSelectedLibraryFileId(e.target.value)}
                  sx={{ minWidth: 260 }}
                >
                  {(libraryFiles ?? []).map((f) => (
                    <MenuItem key={f.id} value={f.id}>
                      {f.name} ({f.kind})
                    </MenuItem>
                  ))}
                </TextField>
                {selectedLibraryFile && !selectedLibraryFile.mimeType.startsWith("audio/") && (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={crossTakeBusy || libraryActionBusy !== null}
                    onClick={(e) => void handleLibraryTalkThrough(selectedLibraryFile, e.currentTarget)}
                  >
                    {libraryActionBusy === "walkthrough" ? "Loading…" : "Talk through this"}
                  </Button>
                )}
                {selectedLibraryFile && (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={crossTakeBusy || libraryActionBusy !== null}
                    onClick={(e) => void handleLibraryDraftAnnouncement(selectedLibraryFile, e.currentTarget)}
                  >
                    {libraryActionBusy === "announcement" ? "Loading…" : "Draft announcement"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: walkthroughTake ? undefined : "none" }}>
          <WalkthroughPanel take={walkthroughTake} onClose={closeWalkthrough} walkthrough={walkthrough} />
        </div>

        {announcementTake && (
          <TakeAnnouncementPanel
            key={announcementTake.id}
            take={announcementTake}
            setTakes={takes.setTakes}
            context={announcementContext}
            cachedTranscript={transcriptCache[announcementTake.id] ?? null}
            onTranscriptCached={cacheTranscriptForTake}
            posted={postedByTakeId[announcementTake.id] ?? null}
            onPosted={(result) =>
              setPostedByTakeId((prev) => ({ ...prev, [announcementTake.id]: result }))
            }
            onCourseIdChange={setAnnouncementCourseId}
            onClose={closeAnnouncement}
          />
        )}
      </div>

      {/* Inner views stay mounted (hidden with display:none) so navigation never kills a live preview, takes, or an in-progress caption burn.
          "Change speed" lives here (not the Files tab) for the same reason -
          a speed re-encode can run five to eighty minutes, and RecordingTab
          is the always-mounted surface; FilesTab unmounts on a tab switch and
          would silently kill the job mid-encode. */}
      <div style={{ display: recView === "speed" ? undefined : "none" }}>
        <SpeedPanel takes={takes.takes} backupDir={takes.backupDir} />
      </div>

      {/* Same always-mounted stack, for the same reason: a capture session,
          its pending frame queue and its in-flight extraction must survive the
          user switching to another inner view. */}
      <div style={{ display: recView === "discussions" ? undefined : "none" }}>
        {/* NEW-4: AND with the tab-level `active` prop, matching
            `recordSurfaceActive`'s own idiom above - without it, a user whose
            persisted `ta-rec-view` is "discussions" fires this panel's lazy
            course fetch and starts both its loops on every page load even
            while sitting on a different top-level tab. */}
        <DiscussionRepliesPanel active={active && recView === "discussions"} />
      </div>

      {/* Same always-mounted stack, same reason: an in-progress capture and
          its extraction queue must survive the user switching to another
          inner view - grading-via-recording's own capture loop (see
          GradingRecordingPanel.tsx) needs exactly the guarantee
          "discussions" needs above. */}
      <div style={{ display: recView === "grading" ? undefined : "none" }}>
        <GradingRecordingPanel active={active && recView === "grading"} />
      </div>

      <div style={{ display: recView === "captions" ? undefined : "none" }}>
        <CaptionStudio takes={takes.takes} backupDir={takes.backupDir} />
      </div>

      <div style={{ display: recView === "slides" ? undefined : "none" }}>
        <SlideStudio />
      </div>

      <div style={{ display: recView === "avatar" ? undefined : "none" }}>
        <AvatarStudioPanel
          devices={dev.devices}
          requestAccess={dev.requestAccess}
          avatarStudio={avatarStudio}
        />
      </div>
    </TabShell>
  );
}
