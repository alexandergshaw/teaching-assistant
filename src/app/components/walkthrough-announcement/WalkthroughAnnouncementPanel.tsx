"use client";

// Manual > Recording > "Announcement from a walkthrough" - the assembly
// panel for docs/announcement-from-walkthrough-acceptance-criteria.md.
//
// A SIBLING to ModuleDeckCapturePanel.tsx, not a mode of it - see that
// document's "WHERE IT LIVES" section for the measured reason (that panel
// was already within ~150 lines of this repo's 1000-line ceiling, with its
// one available JSX extraction already spent). This file shares the
// REDUCTION seam (reduceCaptureToMaterials, module-deck-capture/
// module-blocks.ts) and the same capture wiring (useDiscussionCapture,
// extractModuleContentAction) rather than the panel itself - the cost,
// stated plainly by the acceptance document, is a second capture entry
// point and a second screen-share grant; an instructor cannot get a deck
// and an announcement from one recording.
//
// P5: TWO ALWAYS-VISIBLE BUTTONS ("Generate both" / "Generate video
// script"), never a mode toggle - a single persisted choice could be stale
// from a previous session and silently produce the wrong artifact.
// P6: the two outputs are fully independent state (announcement*/script*
// below) computed from ONE durable reduced-materials value
// (batchBlocksRef.current) - a script failure can never blank an
// already-drafted announcement, or vice versa.
// P1: the announcement draft is MARKDOWN text. It is posted through
// postWalkthroughAnnouncementAction, which converts it via markdownToHtml
// (never textToHtml) at the moment of posting - see that action's own doc
// comment.
// P11: library bodies stay in persistence; only acknowledged format outlines
// reach the announcement draft adapter.
// P15: a disclosure sits in the settings block, before the capture controls -
// frames are sent to a third-party AI provider, and a single shared window
// is safer than a whole screen.

import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { usePairPreferences } from "./usePairPreferences";
import { useWalkthroughVideoUpload } from "./useWalkthroughVideoUpload";
import { VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS, VIDEO_MAX_FRAMES } from "./walkthrough-video-limits";
import { uploadedVideoMaterialText, type VideoReadResult } from "./walkthrough-video-run";
import type { LlmProvider } from "@/lib/llm";
import { useAnnouncementLibrary } from "./useAnnouncementLibrary";
import AnnouncementLibrary from "./AnnouncementLibrary";
import { listAnnouncementLibraryAction, saveAnnouncementLibraryEntryAction, deleteAnnouncementLibraryEntryAction } from "@/app/actions/announcement-library";
import { Button, TextField } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import annChat from "../recording/announcement-chat.module.css";
import runBar from "./WalkthroughRunBar.module.css";
import { isSetupCollapsed } from "./walkthrough-setup-collapse";
import { variantFor } from "../ui/buttonVariant";
import { isConfirmArmed } from "../content-tab/modules/confirmArming";
import { LegibilityProbeModal } from "../grading-recording/LegibilityProbeModal";
import { triggerFileDownload } from "../course-planning/utils";
import { useLlmProvider } from "@/lib/llm-provider";
import { useDiscussionCapture } from "../recording/useDiscussionCapture";
import { EXTRACT_BATCH_WIRE_BUDGET } from "../recording/discussion-capture";
import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
import { extractModuleContentAction } from "@/app/actions/module-content-extract";
import { MODULE_EXTRACT_BATCH_SIZE, type ExtractedBlock } from "../module-deck-capture/module-extraction-prompt";
import { reduceCaptureToMaterials } from "../module-deck-capture/module-blocks";
import { deriveWalkthroughPageCoverage, renderWalkthroughCoverageBlock } from "./walkthrough-announcement-coverage";
import { WALKTHROUGH_ANNOUNCEMENT_MATERIALS_CAP } from "@/lib/walkthrough-announcement-prompt";
import { WALKTHROUGH_SCRIPT_MATERIALS_CAP } from "@/lib/walkthrough-script-prompt";
import {
  draftWalkthroughVideoScriptAction,
} from "@/app/actions/walkthrough-announcement";
import { useAnnouncementDraftSlots, type AnnouncementDraftRequestContext } from "./useAnnouncementDraftSlots";
import { MAX_NOTES_CHARS, useWalkthroughSetup } from "./useWalkthroughSetup";
import { useWalkthroughAutoDraft } from "./useWalkthroughAutoDraft";
import { useWalkthroughGenerationAdapters } from "./useWalkthroughGenerationAdapters";
import { isRunComplete, shouldWarnBeforeUnload } from "./walkthrough-run-decisions";
import AnnouncementDraftSlot from "./AnnouncementDraftSlot";
import AnnouncementCourseFieldset from "./AnnouncementCourseFieldset";
import {
  MAX_ANNOUNCEMENT_BATCH_SIZE,
  type TemplateCandidate,
  type TemplateOptionSource,
} from "./announcement-draft-slots";


interface Notice {
  id: string;
  kind: "info" | "danger";
  text: string;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function WalkthroughAnnouncementPanel({ active }: { active: boolean }) {
  const [provider] = useLlmProvider();

  // AC13-equivalent: saveVideo is ALWAYS false - a recording blob never
  // crosses a Server Action for this surface either.
  const { capturing, elapsedSec, pendingFrames, droppedFrames, frameEncodeNotice, stalled, previewRef, start, stop, takeFrameBatch } =
    useDiscussionCapture();

  // Setup state (course, module, notes, toggles, course list) lives in
  // useWalkthroughSetup.ts.
  const {
    courses,
    coursesError,
    courseId,
    setCourseId,
    moduleLabel,
    setModuleLabel,
    notesText,
    setNotesText,
    emojiOn,
    setEmojiOn,
    researchOn,
    setResearchOn,
    autoDraftOn,
    setAutoDraftOn,
    selectedCourse,
  } = useWalkthroughSetup(active);

  // The autosaved library is the single source of reusable announcement formats.

  const libraryAdapters = useMemo(() => ({
    list: (id: string) => listAnnouncementLibraryAction(id),
    save: (input: Parameters<typeof saveAnnouncementLibraryEntryAction>[0]) => saveAnnouncementLibraryEntryAction(input),
    remove: (id: string, entryId: string) => deleteAnnouncementLibraryEntryAction(id, entryId),
  }), []);
  const library = useAnnouncementLibrary(courseId, libraryAdapters);
  const upload = useWalkthroughVideoUpload(library.scopeKey);
  const [framesOnly, setFramesOnly] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<{ file: File; scope: string } | null>(null);
  const [inputKind, setInputKind] = useState<"live" | "upload" | null>(null);
  const uploadSnapshot = useRef<{ provider: LlmProvider; narration: string; coverage: string } | null>(null);
  const savedFormatsState = library.enabled ? library.state.load : "loaded";
  const savedExemplars = useMemo(() => library.state.cards.flatMap(card => card.acknowledged ? [card.acknowledged] : [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [library.state.cards]);
  const mostRecentExemplar = savedExemplars[0] ?? null;
  const loadSavedExemplars = useCallback(() => library.controller.load(), [library.controller]);
  const changeCourse = useCallback((next: string) => {
    if (next === courseId) return;
    if (library.controller.dirty() && !window.confirm("Unsaved announcements will be discarded. Change course?")) return;
    setCourseId(next);
  }, [courseId, library.controller, setCourseId]);

  // --- Notices --------------------------------------------------------------

  const [notices, setNotices] = useState<Notice[]>([]);
  const pushNotice = useCallback((kind: Notice["kind"], text: string) => {
    setNotices((prev) => [...prev, { id: crypto.randomUUID(), kind, text }]);
  }, []);
  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // --- Extraction / accumulation state (shared seam: reduceCaptureToMaterials) --

  const extractionEpoch = useRef(0);
  const batchBlocksRef = useRef<ExtractedBlock[][]>([]);
  const [legibleBlockCount, setLegibleBlockCount] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const batchInFlightRef = useRef(false);

  const runExtraction = useCallback(async () => {
    const epoch = extractionEpoch.current;
    const frames = takeFrameBatch(MODULE_EXTRACT_BATCH_SIZE, EXTRACT_BATCH_WIRE_BUDGET);
    if (frames.length === 0) return;
    // Set synchronously, BEFORE the await below: between the take (which can
    // drop pendingFrames to 0) and setExtracting(true) there is a window in
    // which neither state shows a batch in flight. The auto-draft effect reads
    // this ref so it cannot fire into that window with partial material.
    batchInFlightRef.current = true;
    await Promise.resolve();
    if (epoch !== extractionEpoch.current) return;
    setExtracting(true);

    try {
      const wireBytes = sumBase64WireBytes(frames.map((f) => f.base64));
      const budgetCheck = checkWireBudget(wireBytes, "This batch of captured frames");
      if (!budgetCheck.ok) {
        pushNotice("danger", budgetCheck.error ?? "This batch of captured frames was too large to send.");
        return;
      }

      const result = await extractModuleContentAction(
        frames.map((f) => ({ base64: f.base64 })),
        moduleLabel,
        notesText,
        provider
      );

      if (epoch !== extractionEpoch.current) return;
      if ("error" in result) {
        pushNotice("danger", result.error);
        return;
      }

      if (result.blocks.length === 0) {
        if (result.confirmedEmpty) {
          pushNotice("info", "One batch of frames showed no page content - nothing was added.");
        }
        return;
      }

      batchBlocksRef.current = [...batchBlocksRef.current, result.blocks];
      setLegibleBlockCount((prev) => prev + result.blocks.length);
    } finally {
      if (epoch === extractionEpoch.current) {
        batchInFlightRef.current = false;
        setExtracting(false);
      }
    }
  }, [takeFrameBatch, moduleLabel, notesText, provider, pushNotice]);

  // Drains the capture queue as frames arrive, and keeps draining after Stop
  // - mirrors ModuleDeckCapturePanel.tsx's own drain effect exactly
  // (useDiscussionCapture's documented contract: extraction outlives
  // capturing===false and drains the queue to empty).
  useEffect(() => {
    if (extracting) return;
    if (pendingFrames === 0) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await runExtraction();
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingFrames, extracting, runExtraction]);

  // --- Start/stop -------------------------------------------------------------

  const [startError, setStartError] = useState<string | null>(null);
  const [autoDrafted, setAutoDrafted] = useState(false);

  // --- Legibility probe --------------------------------------------------------

  const [probeOpen, setProbeOpen] = useState(false);
  const probeButtonRef = useRef<HTMLButtonElement>(null);

  const hasMaterial = legibleBlockCount > 0 || (upload.result?.status === "ready" && !!upload.result.narration);
  // WALKTHROUGH-MIMIC-CHAT (M1): derived, never persisted (no ta- key).
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const setupCollapsed = isSetupCollapsed({ capturing, hasMaterial, manuallyExpanded });

  // --- Generation (P5: two buttons, P6: two independent output states) -------
  // G2: N (<= MAX_ANNOUNCEMENT_BATCH_SIZE) draft slots, owned by
  // useAnnouncementDraftSlots. Every literal server-action call stays HERE
  // (the hook takes them as injected draftOne/postDraft adapters), so the
  // P1 pin keeps proving this panel is the one that calls the poster.

  const [scriptGenerating, setScriptGenerating] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [scriptText, setScriptText] = useState("");

  // Every slot's dropdown reads the SAME options source, fetched eagerly by
  // the course-change effect above.
  const optionSource: TemplateOptionSource = useMemo(
    () => ({
      hasPastedText: false,
      mostRecent: mostRecentExemplar
        ? {
            id: mostRecentExemplar.id,
            label: mostRecentExemplar.label || new Date(mostRecentExemplar.createdAt).toLocaleDateString(),
            outline: mostRecentExemplar.outline,
          }
        : null,
      saved: (savedExemplars ?? []).map(
        (e): TemplateCandidate => ({ id: e.id, label: e.label || new Date(e.createdAt).toLocaleDateString(), outline: e.outline })
      ),
      savedState: savedFormatsState,
    }),
    [mostRecentExemplar, savedExemplars, savedFormatsState]
  );

  const buildRequest = useCallback((): AnnouncementDraftRequestContext => {
    const narration = uploadSnapshot.current?.narration ?? "";
    const reduction = reduceCaptureToMaterials(batchBlocksRef.current, WALKTHROUGH_ANNOUNCEMENT_MATERIALS_CAP - narration.length - 2);
    const coverageBlock = renderWalkthroughCoverageBlock(deriveWalkthroughPageCoverage(reduction.blocks)) + (uploadSnapshot.current?.coverage ?? "");
    return {
      courseLabel: selectedCourse?.name ?? "",
      moduleLabel: moduleLabel.trim() || null,
      materialsText: uploadedVideoMaterialText(batchBlocksRef.current, narration, WALKTHROUGH_ANNOUNCEMENT_MATERIALS_CAP),
      coverageBlock,
      notes: notesText,
      provider: uploadSnapshot.current?.provider ?? provider,
      sourceKind: uploadSnapshot.current ? "upload" : "live",
      emojiOn,
      researchOn,
    };
  }, [selectedCourse, moduleLabel, notesText, provider, emojiOn, researchOn]);

  const resolveLive = useCallback(
    () => ({ pastedOutline: null, mostRecent: optionSource.mostRecent, saved: optionSource.saved, savedState: savedFormatsState, blocked: library.controller.blocked }),
    [optionSource.mostRecent, optionSource.saved, savedFormatsState, library.controller]
  );

  // Research / draft / post adapters (the literal server-action calls) live in
  // useWalkthroughGenerationAdapters.ts and are injected below.
  const { fetchResources, researchFingerprint, draftOne, postDraft } = useWalkthroughGenerationAdapters(selectedCourse);

  const {
    slots,
    readyToDraftCount,
    researching,
    addSlot,
    reset,
    removeSlot,
    chooseTemplate,
    chooseTiming,
    setScheduledAt,
    editSlot,
    generate,
    regenerate,
    retry,
    copySlot,
    armPost,
    cancelPost,
    armRegenerate,
    cancelRegenerate,
    postSignatureFor,
  } = useAnnouncementDraftSlots({ scopeKey: library.scopeKey, buildRequest, resolveLive, draftOne, postDraft, fetchResources, researchFingerprint, mayGenerate: () => !capturing && !extracting && pendingFrames === 0 && !batchInFlightRef.current && !upload.busy && hasMaterial && upload.result?.status !== "needs-visible-only" });

  const pairPreferences = usePairPreferences(library.scopeKey, library.enabled, chooseTemplate);
  useLayoutEffect(() => {
    extractionEpoch.current += 1;
    batchBlocksRef.current = [];
    uploadSnapshot.current = null;
    batchInFlightRef.current = false;
    stop();
    while (takeFrameBatch(MODULE_EXTRACT_BATCH_SIZE, EXTRACT_BATCH_WIRE_BUDGET).length) { /* Discard the previous course's queued frames. */ }
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) { setLegibleBlockCount(0); setExtracting(false); setScriptText(""); setScriptGenerating(false); setInputKind(null); setSelectedVideo(null); } });
    return () => { cancelled = true; extractionEpoch.current += 1; };
  }, [library.scopeKey, stop, takeFrameBatch]);

  // WA-DRAFT-LOSS: warn on a full page unload while a capture, a draft, or an
  // unposted drafted slot would be lost. Declared after `slots` on purpose.
  useEffect(() => {
    if (!upload.busy && !library.controller.dirty() && !shouldWarnBeforeUnload({ capturing, pendingFrames, slots })) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [capturing, pendingFrames, slots, library.controller, library.state, upload.busy]);

  const anyDrafting = slots.some((s) => s.draft.phase === "drafting");

  // Auto-draft on stop (F1) - useWalkthroughAutoDraft.ts. autoDraftOn is the
  // persisted toggle from useWalkthroughSetup.
  useWalkthroughAutoDraft({
    autoDraftOn,
    capturing,
    extracting,
    batchInFlightRef,
    pendingFrames,
    hasMaterial,
    readyToDraftCount,
    savedFormatsState,
    generate,
    setAutoDrafted,
  });

  // Start / Stop. Starting after a run whose every slot is already posted
  // begins a FRESH run (F4): the captured material and the slots reset, so last
  // week's frames never feed this week's draft. isRunComplete is false while
  // any drafted-but-unposted slot exists, so an unposted draft is never cleared.
  const handleStartStop = useCallback(() => {
    if (capturing) {
      stop();
      return;
    }
    if (extracting || pendingFrames > 0 || batchInFlightRef.current) return;
    if (inputKind === "upload" || upload.busy) { pushNotice("info", "Choose New walkthrough before switching from an uploaded video to live capture."); return; }
    setInputKind("live");
    setStartError(null);
    setAutoDrafted(false);
    if (isRunComplete(slots)) {
      batchBlocksRef.current = [];
      setLegibleBlockCount(0);
      reset();
    }
    (async () => {
      try {
        await start({ saveVideo: false });
      } catch (err) {
        setStartError(`Could not start the screen capture: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    })();
  }, [capturing, extracting, pendingFrames, start, stop, slots, reset, inputKind, upload.busy, pushNotice]);

  const publishUpload = (value: VideoReadResult, pinnedProvider: LlmProvider) => {
    batchBlocksRef.current = value.blocks;
    uploadSnapshot.current = { provider: pinnedProvider, narration: value.narration,
      coverage: `\nUploaded video: sampled ${value.sampled}/${value.planned} frames across ${Math.round(value.duration)} seconds, about ${value.interval.toFixed(1)} seconds apart. ${value.gaps} sampling gaps; ${value.failedBatches} failed batches; ${value.illegible} unreadable blocks. Visual coverage is sampled, not complete. Narration: ${value.audio}.` };
    setLegibleBlockCount(value.blocks.reduce((sum, batch) => sum + batch.length, 0));
  };
  const handleUpload = async (file: File) => {
    if (capturing || extracting || pendingFrames || batchInFlightRef.current || hasMaterial || upload.result?.blocks.some(batch => batch.length) || slots.some(slot => slot.draft.phase !== "empty") || inputKind === "live") {
      pushNotice("info", "Choose New walkthrough before replacing existing input or drafts."); return;
    }
    const pinnedProvider = provider;
    setInputKind("upload"); setAutoDrafted(false);
    const value = await upload.start({ blob: file, provider: pinnedProvider, moduleLabel, notes: notesText, framesOnly });
    if (value?.status === "ready") publishUpload(value, pinnedProvider);
    else if (value?.status === "needs-visible-only") uploadSnapshot.current = { provider: pinnedProvider, narration: "", coverage: "" };
  };

  const handleGenerateScript = useCallback(async () => {
    if (capturing || extracting || pendingFrames > 0 || batchInFlightRef.current || upload.busy || upload.result?.status === "needs-visible-only" || !hasMaterial) return;
    setScriptGenerating(true);
    const epoch = extractionEpoch.current;
    setScriptError(null);
    try {
      const narration = uploadSnapshot.current?.narration ?? "";
      const result = await draftWalkthroughVideoScriptAction({
        courseName: selectedCourse?.name ?? "",
        moduleLabel: moduleLabel.trim(),
        materialsText: uploadedVideoMaterialText(batchBlocksRef.current, narration, WALKTHROUGH_SCRIPT_MATERIALS_CAP),
        notes: notesText,
        provider: uploadSnapshot.current?.provider ?? provider,
      });
      if (epoch !== extractionEpoch.current) return;
      if ("error" in result) {
        setScriptError(result.error);
        return;
      }
      setScriptText(result.script);
    } finally {
      if (epoch === extractionEpoch.current) setScriptGenerating(false);
    }
  }, [selectedCourse, moduleLabel, notesText, provider, capturing, extracting, pendingFrames, upload.busy, upload.result?.status, hasMaterial]);

  return (
    <div className={`${styles.card} ${styles.form}`}>
      <h2 className={annChat.title}>Announcement from a walkthrough</h2>
      <p className={styles.fieldHint}>
        Share your screen and click through a series of LMS pages - the app reads what is visible and drafts an
        announcement matching a previous one&apos;s format, and/or a video script, covering the pages in the order
        you walked them.
      </p>

      {(startError || droppedFrames > 0 || frameEncodeNotice || notices.length > 0) && (
        <div role="status" aria-live="polite" className={styles.field}>
          {startError && <p className={`${controls.notice} ${controls.noticeDanger}`}>{startError}</p>}
          {droppedFrames > 0 && (
            <p className={`${controls.notice} ${controls.noticeDanger}`}>
              {droppedFrames} frame{droppedFrames === 1 ? "" : "s"} scrolled past faster than they could be read and
              were dropped. Scroll back over that section to catch it.
            </p>
          )}
          {frameEncodeNotice && <p className={`${controls.notice} ${controls.noticeDanger}`}>{frameEncodeNotice}</p>}
          {notices.map((n) => (
            <p key={n.id} className={n.kind === "danger" ? `${controls.notice} ${controls.noticeDanger}` : controls.notice}>
              {n.text}{" "}
              <button type="button" className={styles.linkButton} onClick={() => dismissNotice(n.id)}>
                Dismiss
              </button>
            </p>
          ))}
        </div>
      )}

      {/* AC1/AC3: course, module and notes, then the draft format and options,
          persisted under ta- keys. Reusable examples live in the library below. Extracted to
          AnnouncementCourseFieldset.tsx (backlog 4.1); it collapses to a
          one-line summary once a run is underway. The run bar is NOT a child
          of it - it is the sticky bottom dock at the end of this panel. */}
      <AnnouncementCourseFieldset
        courses={courses}
        courseId={courseId}
        onCourseIdChange={changeCourse}
        coursesError={coursesError}
        moduleLabel={moduleLabel}
        onModuleLabelChange={setModuleLabel}
        notesText={notesText}
        maxNotesChars={MAX_NOTES_CHARS}
        onNotesTextChange={setNotesText}
        emojiOn={emojiOn}
        onEmojiOnChange={setEmojiOn}
        researchOn={researchOn}
        onResearchOnChange={setResearchOn}
        autoDraftOn={autoDraftOn}
        onAutoDraftOnChange={setAutoDraftOn}
        collapsed={setupCollapsed}
        onExpand={() => setManuallyExpanded(true)}
        capturing={capturing}
      />

      {pairPreferences.notice && <p role="status">{pairPreferences.notice}</p>}
      <details>
        <summary>Manage saved examples ({savedExemplars.length}) - {savedFormatsState}{library.controller.dirty() || library.state.cards.some(card => card.error) ? "; unsaved edits or errors - open to save or retry" : ""}</summary>
        <AnnouncementLibrary key={library.scopeKey} controller={library.controller} state={library.state} enabled={library.enabled}
          canAddDraft={slots.length < MAX_ANNOUNCEMENT_BATCH_SIZE} addDraft={choice => addSlot(choice, "beginning-of-week")}
          onRemoved={() => { /* Keep selections visible; unavailable IDs block generation. */ }} />
      </details>

      <fieldset className={controls.section}>
        <legend className={controls.sectionLegend}>Upload a walkthrough video</legend>
        <p className={styles.fieldHint}>
          MP4 or WebM, up to {VIDEO_MAX_BYTES / (1024 * 1024)} MiB and {VIDEO_MAX_SECONDS / 60} minutes.
          Read narration and visible pages by default; preparing narration may take the video&apos;s playback time.
          The video stays local. Up to {VIDEO_MAX_FRAMES} sampled page images and bounded audio chunks go to your selected AI provider.
          Sampling can miss pages between frames. Nothing is posted to Canvas.
        </p>
        <label><input type="checkbox" checked={framesOnly} disabled={upload.busy}
          onChange={event => setFramesOnly(event.target.checked)} /> Read visible pages only (skip narration)</label>
        <label>Choose MP4 or WebM<input type="file" accept="video/mp4,video/webm" disabled={!library.enabled || capturing || extracting || pendingFrames > 0 || hasMaterial || upload.result?.blocks.some(batch => batch.length) || anyDrafting || researching || scriptGenerating || inputKind === "live"}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) { upload.cancel(); setSelectedVideo({ file, scope: library.scopeKey }); } }} /></label>
        <Button size="small" variant="outlined" disabled={!selectedVideo || selectedVideo.scope !== library.scopeKey || !library.enabled || upload.busy || capturing || extracting || pendingFrames > 0 || hasMaterial || !!upload.result?.blocks.some(batch => batch.length) || anyDrafting || researching || scriptGenerating || inputKind === "live"}
          onClick={() => { if (selectedVideo?.scope === library.scopeKey) void handleUpload(selectedVideo.file); }}>Read uploaded video</Button>
        {upload.busy && <div role="status" aria-live="polite">
          {upload.progress?.stage.replace(/-/g, " ") ?? "Checking video"}: {upload.progress?.completed ?? 0} / {upload.progress?.total ?? 1}.
          <Button size="small" onClick={() => { upload.cancel(); pushNotice("info", "Video reading cancelled. Late provider results will be discarded. Choose another video or New walkthrough."); }}>Cancel video reading</Button>
        </div>}
        {upload.result && <div role="status" aria-live="polite">
          <p>{upload.result.status === "ready" ? "Video reading finished. Review the sampled coverage before drafting." : upload.result.status === "needs-visible-only" ? "Narration could not be completed. Your successful visible pages are available below." : upload.result.status === "cancelled" ? "Video reading was cancelled; no material was kept." : upload.result.code === "unsupported-media" ? "Choose a supported MP4 or WebM video." : upload.result.code === "file-size" ? "The video is empty or exceeds the displayed file size limit." : upload.result.code === "duration-limit" ? "The video exceeds the displayed duration limit." : ["metadata-timeout", "unknown-duration"].includes(upload.result.code) ? "The video length could not be read safely. Try another MP4 or WebM export." : upload.result.code === "no-readable-content" ? "No readable page content or narration was found. Try a clearer video." : "The browser could not read this video. Try another MP4 or WebM export."}
            {" "}{upload.result.sampled} / {upload.result.planned} sampled frames, about {upload.result.interval.toFixed(1)} seconds apart;
            {" "}{upload.result.gaps} sampling gaps, {upload.result.illegible} unreadable blocks, {upload.result.failedBatches} failed batches, {upload.result.emptyBatches} confirmed empty batches.
            {" "}{upload.result.blocks.reduce((sum, batch) => sum + batch.length, 0)} content blocks extracted. Narration: {upload.result.audio}.
            This is sampled visual coverage, not a complete account of the video.</p>
          {upload.result.audio === "silence" && <p>No speech text was returned by the complete narration pass; this does not establish that the video has no audio track.</p>}
          {upload.result.status === "needs-visible-only" && <>
            <p>Narration could not be completed. No partial transcript was kept. Choose visible pages only to draft from the successful visual results, or start a new walkthrough to try again.</p>
            <Button disabled={!upload.result.blocks.some(batch => batch.length)} onClick={() => {
              const value = upload.result;
              if (!value || value.status !== "needs-visible-only" || !uploadSnapshot.current) return;
              publishUpload({ ...value, status: "ready", narration: "" }, uploadSnapshot.current.provider);
              upload.visibleOnly();
            }}>Use visible pages only</Button>
          </>}
        </div>}
      </fieldset>

      <p className={styles.fieldHint}>
        A capture in progress does not survive a reload or a closed tab: anything not yet read off the screen, and any
        vision call already in flight, is lost.
      </p>

      <p className={styles.fieldHint}>You can also stop from your browser&apos;s sharing bar.</p>

      <div className={controls.statusRow}>
        <video
          ref={previewRef}
          className={capturing ? controls.previewVideo : `${controls.previewVideo} ${controls.previewVideoHidden}`}
          aria-hidden="true"
          autoPlay
          muted
          playsInline
        />
        {capturing && (
          <div className={controls.statusText}>
            <span>{fmt(elapsedSec)}</span>
            <span>
              {legibleBlockCount === 0
                ? "Capturing - nothing read yet."
                : `${legibleBlockCount} block${legibleBlockCount === 1 ? "" : "s"} read so far.`}
            </span>
            {extracting && <span>Reading the screen…</span>}
            {pendingFrames > 0 && <span>Catching up - scroll a little slower.</span>}
          </div>
        )}
      </div>
      {stalled && (
        <p role="status" aria-live="polite" className={`${controls.notice} ${controls.noticeWarning}`}>
          Nothing new has been read off the screen for 30 seconds. Keep this app&apos;s tab visible in a second window
          while you scroll.
        </p>
      )}

      {/* G3 Ruling 24/34: Generate awaits research before any slot enters
          "drafting" and stays enabled throughout the wait (a second click
          reuses the in-flight research call) - this is the only feedback the
          instructor gets during that wait. */}
      {researching && (
        <p role="status" aria-live="polite" className={styles.fieldHint}>
          Researching resources for this module…
        </p>
      )}
      {!capturing && (extracting || pendingFrames > 0) && <p role="status">Finishing reading captured pages before drafting or starting a new walkthrough.</p>}
      {autoDrafted && (
        <p role="status" aria-live="polite" className={styles.fieldHint}>
          Drafting automatically from this capture. Nothing is posted until you confirm.
        </p>
      )}
      {!hasMaterial && <p className={styles.fieldHint}>Capture and stop a walkthrough, or read an uploaded video first - no finalized material is ready yet.</p>}
      {hasMaterial && readyToDraftCount === 0 && !anyDrafting && (
        <p className={controls.notice}>
          Generate both is off because every draft slot already has a draft. To redo a draft, press Regenerate in the button row under it (Post to Canvas, Regenerate, Copy) - you will be asked to confirm before it is replaced. To write another, use Add another draft slot.
        </p>
      )}

      {/* AC7/G2: one row per draft slot - always visible from mount, never
          gated on a generated result the way the single-draft version was. */}
      <fieldset className={controls.section}>
        <legend className={controls.sectionLegend}>Announcement drafts</legend>
        {slots.map((slot, index) => (
          <AnnouncementDraftSlot
            key={slot.id}
            slot={slot}
            ordinal={index + 1}
            optionSource={optionSource}
            /* Named canary (G1 task 8): keyed to BOTH failed and timedout,
               never failed alone - a ternary keyed to failure only ships
               Retry dead in the timed-out state, and vitest here renders no
               component to catch that. */
            onRetryOptions={
              savedFormatsState === "failed" || savedFormatsState === "timedout" ? () => void loadSavedExemplars() : null
            }
            postArmed={isConfirmArmed(slot.postArmedFor, postSignatureFor(slot) ?? "")}
            courseName={selectedCourse?.name ?? null}
            canRemove={index > 1}
            onChooseTemplate={pairPreferences.choose}
            onChooseTiming={chooseTiming}
            onSetScheduledAt={setScheduledAt}
            onEdit={editSlot}
            onRegenerateArm={armRegenerate}
            onRegenerateConfirm={regenerate}
            onRegenerateCancel={cancelRegenerate}
            onPostArm={armPost}
            onPostCancel={cancelPost}
            onCopy={copySlot}
            onRetry={retry}
            onRemove={removeSlot}
          />
        ))}
        <div className={styles.ghActions}>
          <Button
            size="small"
            variant="outlined"
            disabled={slots.length >= MAX_ANNOUNCEMENT_BATCH_SIZE}
            onClick={() => addSlot({ kind: "default" }, "beginning-of-week")}
          >
            Add another draft slot
          </Button>
        </div>
      </fieldset>

      {/* AC5: the video script - never posted, just read aloud while
          re-recording. */}
      {(scriptError || scriptText) && (
        <fieldset className={annChat.latestCard}>
          <legend className={annChat.latestCardLabel}>Video script draft</legend>
          {scriptError && (
            <div role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
              {scriptError}
            </div>
          )}
          {scriptText && (
            <>
              <TextField
                size="small"
                label="Script"
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                multiline
                minRows={8}
                fullWidth
              />
              <div className={styles.ghActions}>
                <Button size="small" variant="outlined" onClick={() => void navigator.clipboard.writeText(scriptText)}>
                  Copy
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    triggerFileDownload(
                      new Blob([scriptText], { type: "text/plain;charset=utf-8" }),
                      "walkthrough-video-script.txt"
                    )
                  }
                >
                  Download .txt
                </Button>
              </div>
            </>
          )}
        </fieldset>
      )}

      {/* W3: Start, the probe and both Generate buttons are siblings in ONE
          sticky run bar (P5: two always-visible Generate buttons, never a
          mode toggle). The bar holds no Post or other irreversible control. */}
      <div className={`${styles.ghActions} ${runBar.runBarDock}`}>
        <Button size="small" variant="outlined" disabled={capturing || extracting || pendingFrames > 0} onClick={() => {
          if (capturing || extracting || pendingFrames > 0 || batchInFlightRef.current) return;
          if ((hasMaterial || upload.busy || upload.result || slots.some(slot => slot.draft.phase !== "empty")) && !window.confirm("Start a new walkthrough? This cancels video reading and clears captured material and drafts; saved examples stay available.")) return;
          extractionEpoch.current += 1;
          batchBlocksRef.current = [];
          upload.reset(); uploadSnapshot.current = null; setInputKind(null); setSelectedVideo(null);
          setLegibleBlockCount(0); setScriptText(""); setScriptError(null); setScriptGenerating(false); reset();
        }}>New walkthrough</Button>
        <Button variant={variantFor(capturing || !hasMaterial)} color="primary" size="small" disabled={upload.busy || inputKind === "upload"} onClick={handleStartStop}>
          {capturing ? "Stop capture" : "Start capture"}
        </Button>
        <Button variant="outlined" size="small" ref={probeButtonRef} disabled={capturing} onClick={() => setProbeOpen(true)}>
          Run legibility probe
        </Button>
        <Button
          variant={variantFor(!capturing && hasMaterial)}
          color="primary"
          size="small"
          loading={anyDrafting}
          loadingPosition="start"
          // Per the owner's recorded decision (G1): only the LOADING state
          // gates Generate - a timed-out fetch re-enables it, so a click
          // drafts anyway rather than waiting indefinitely on saved formats.
          disabled={
            capturing || extracting || pendingFrames > 0 || upload.busy || upload.result?.status === "needs-visible-only" || !hasMaterial || anyDrafting || readyToDraftCount === 0
          }
          onClick={() => void generate()}
        >
          {anyDrafting ? "Generating…" : "Generate both"}
        </Button>
        <Button
          variant="outlined"
          color="primary"
          size="small"
          loading={scriptGenerating}
          loadingPosition="start"
          disabled={capturing || extracting || pendingFrames > 0 || upload.busy || upload.result?.status === "needs-visible-only" || !hasMaterial || scriptGenerating}
          onClick={() => void handleGenerateScript()}
        >
          {scriptGenerating ? "Generating…" : "Generate video script"}
        </Button>
      </div>

      {probeOpen && <LegibilityProbeModal onClose={() => setProbeOpen(false)} restoreFocusRef={probeButtonRef} />}
    </div>
  );
}
