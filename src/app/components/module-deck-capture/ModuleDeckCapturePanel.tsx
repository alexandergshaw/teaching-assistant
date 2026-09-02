"use client";

// Manual > Recording > "Module walkthrough" - the assembly panel for
// docs/module-walkthrough-deck-acceptance-criteria.md. Section 7 (DE1-DE21)
// is MEASURED and overrides sections 5/6 wherever they conflict - see that
// doc before changing anything here.
//
// This is G6 (wave 2): it OWNS these three files only and imports every
// pure/data seam from wave 1's sibling files in this same directory, plus
// already-shipped app modules (useDiscussionCapture, useDiscussionCourses,
// the deck-download helpers, recording-launch.ts). It never modifies a
// sibling file, RecordingTab.tsx, ModulesView.tsx or any structure canary -
// those are G7's (wave 3) job, including the new directory's own ORDINAL
// canary DE17 requires. This file's own report names every persisted key it
// reads/writes (see the STORAGE_KEY_* constants below) so that canary can be
// built without re-reading this file from scratch.
//
// STRUCTURE, closely mirroring GradingRecordingPanel.tsx (read in full
// before writing this file) - same capture wiring, same serial drain loop
// (useEffect gated on `extracting`, one batch in flight), same setState-in-
// effect idiom (an async IIFE with a `cancelled` flag, every setState after
// an `await`), same run-log-first placement, same Notice+dismiss shape for
// per-batch failures. Diverges where the AC requires it to:
//   - AM-I: extraction runs DURING capture (inherited from the shared drain
//     loop shape, not new here).
//   - AM-G: droppedFrames is folded through a SESSION accumulator
//     (accumulateDroppedFrames) rather than read live at download time - the
//     shipped grading panel's own pre-existing under-report bug, explicitly
//     not repeated here.
//   - AC13/point 3: `start({ saveVideo: false })` always - never a blob.
//   - DE18: a `beforeunload` guard while capturing or frames are still
//     queued - settings persist, the in-flight run does not (DE18's "do not
//     build half-persistence" rule).
//   - DE19: the context box's persistence retries with a reduced payload
//     (drop the text) before giving up, with two distinct messages - the
//     useGradingRows.ts shape, not useReplyRows.ts's throw-and-lose-it one.
//   - AM-C: the resolved slide count is computed with expandTemplate and
//     shown next to the template picker, unconditionally - it never depends
//     on `capturing`.
//   - AM-L: the legibility probe is its own modal/capture session
//     (LegibilityProbeModal, reused whole) and its button is disabled while
//     `capturing`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import { variantFor } from "../ui/buttonVariant";
import { visuallyHidden } from "../ui/visuallyHidden";
import RunLogRow from "../recording/RunLogRow";
import { useThrottledLiveSentence } from "../recording/captureLiveRegion";
import ModuleDeckSettings from "./ModuleDeckSettings";
import { useLlmProvider } from "@/lib/llm-provider";
import { useDiscussionCapture } from "../recording/useDiscussionCapture";
import { EXTRACT_BATCH_WIRE_BUDGET, type CapturedFrame } from "../recording/discussion-capture";
import { useDiscussionCourses } from "../recording/useDiscussionCourses";
import { RECORDING_LAUNCH_EVENT, parseRecordingLaunch } from "@/lib/recording-launch";
import { LegibilityProbeModal } from "../grading-recording/LegibilityProbeModal";
import { triggerFileDownload } from "../course-planning/utils";
import { listDeckTemplatesAction } from "@/app/actions";
import { extractModuleContentAction } from "@/app/actions/module-content-extract";
import { MODULE_EXTRACT_BATCH_SIZE, type ExtractedBlock } from "./module-extraction-prompt";
import { suppressPageFurniture, appendBatchBlocks, renderMaterialsText, capMaterialsText } from "./module-blocks";
import { accumulateDroppedFrames, canGenerateDeck, estimateRunCost, describeScrollSafety } from "./module-deck-dispatch";
import {
  buildModuleDeckCaptureRunLog,
  summarizeModuleDeckCaptureRunLog,
  moduleDeckCaptureLogSummaryLine,
  formatModuleDeckCaptureLogCsv,
  formatModuleDeckCaptureLogJson,
  moduleDeckCaptureLogFileName,
  makeModuleDeckCaptureLogBatch,
  type ModuleDeckCaptureLogBatch,
  type ModuleDeckCaptureEncodeNotice,
  type ModuleDeckCaptureGenerationAttempt,
  type ModuleDeckCaptureBlocks,
  type ModuleDeckCaptureReductionStage,
} from "./module-capture-log";
import { generateDeckFromCaptureApi, type DeckFromCaptureRequest } from "./deck-from-capture-client";
import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
import { expandTemplate, type DeckTemplate } from "@/lib/decks/types";
import { DECK_PRESETS } from "@/lib/decks/presets";
import { resolveDeckTemplateId } from "@/lib/lms-generation/deck";
import { artifactDownloadFormats, buildArtifactDownloadBlob, artifactDownloadFilename } from "@/lib/lms-generation/artifact-download";
import type { FrameEncodeFacts } from "../grading-recording/legibility-probe";
import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";

// PERSISTED CONTROLS (AC2/AC12/AM-L) - a bound const per key, mirroring
// useGradingRows.ts's STORAGE_KEY_* idiom, so ModuleDeckCapturePanel.wiring.
// test.ts and the future directory-wide ordinal canary (G7) can both find
// them without re-typing the literal. "moduledeck" is the RecordingLaunch
// view id (recording-launch.ts) and this feature's own reserved key prefix
// (AM-E) is distinct from useWalkthrough.ts's unrelated shipped keys and
// from grading-recording/'s own keys.
const STORAGE_KEY_COURSE = "ta-rec-mod-course";
const STORAGE_KEY_TEMPLATE = "ta-rec-mod-template";
const STORAGE_KEY_CONTEXT = "ta-rec-mod-context";
const STORAGE_KEY_MODULE = "ta-rec-mod-module";

// AM-L: the context box's own character cap, with a visible counter.
const MAX_CONTEXT_CHARS = 2000;

// DE19: the two-tier storage-failure shape for the one persisted field large
// enough to plausibly ever trip a quota (up to MAX_CONTEXT_CHARS) - copies
// useGradingRows.ts:189-203's retry-with-a-reduced-payload idiom, never
// useReplyRows.ts's throw-and-save-nothing one.
const CONTEXT_STORAGE_REDUCED_MESSAGE =
  "There was not enough room to save your context text across a reload. It still works for this session; shorten it, or clear other saved data, to keep it after a reload.";
const CONTEXT_STORAGE_FULL_MESSAGE =
  "There is no room left to save this panel's settings at all. They still work until you reload.";

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

export default function ModuleDeckCapturePanel({ active }: { active: boolean }) {
  const [provider] = useLlmProvider();

  // AC13/point 3: saveVideo is ALWAYS false below - a recording blob never
  // crosses a Server Action, and the simplest guarantee that one is never
  // even created is to never ask useDiscussionCapture to make one.
  const { capturing, elapsedSec, pendingFrames, droppedFrames, frameEncodeNotice, stalled, previewRef, start, stop, takeFrameBatch } =
    useDiscussionCapture();

  const { courses, coursesLoading, coursesError } = useDiscussionCourses(active);

  // --- Persisted controls (AC2/AC12) --------------------------------------

  const [courseId, setCourseId] = useState<string>(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem(STORAGE_KEY_COURSE) ?? "")
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_COURSE, courseId);
    } catch {
      // Best-effort, mirrors GradingRecordingPanel.tsx's own low-stakes
      // course-id persistence - losing this does not affect the session.
    }
  }, [courseId]);

  const [moduleLabel, setModuleLabel] = useState<string>(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem(STORAGE_KEY_MODULE) ?? "")
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_MODULE, moduleLabel);
    } catch {
      // Best-effort - same posture as courseId above.
    }
  }, [moduleLabel]);

  const [templateId, setTemplateId] = useState<string>(() => {
    if (typeof window === "undefined") return DECK_PRESETS[0]?.id ?? "";
    return (window.localStorage.getItem(STORAGE_KEY_TEMPLATE) ?? "").trim() || (DECK_PRESETS[0]?.id ?? "");
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_TEMPLATE, templateId);
    } catch {
      // Best-effort.
    }
  }, [templateId]);

  // AC2/AM-L: the free-text context box - optional, capped, and it must
  // ACTUALLY reach the extraction prompt (buildModuleContentExtractionPrompt's
  // `instructorContext` parameter, threaded via extractModuleContentAction
  // below) rather than merely existing on screen.
  const [contextText, setContextTextState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return (window.localStorage.getItem(STORAGE_KEY_CONTEXT) ?? "").slice(0, MAX_CONTEXT_CHARS);
  });
  const [contextPersistError, setContextPersistError] = useState<string | null>(null);
  // react-hooks/set-state-in-effect: the setState below must be reached only
  // when the outcome actually CHANGED since the last write (mirrors this
  // file's own frameEncodeNotice-collection effect and
  // GradingRecordingPanel.tsx's identical shape) - never as an unconditional
  // top-level call in the effect body.
  const contextPersistStatusRef = useRef<string | null>(null);
  const setContextText = useCallback((next: string) => {
    setContextTextState(next.slice(0, MAX_CONTEXT_CHARS));
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let nextStatus: string | null = null;
    try {
      window.localStorage.setItem(STORAGE_KEY_CONTEXT, contextText);
    } catch {
      // DE19: retry with a reduced payload (drop the text) before giving up,
      // two distinct messages - useGradingRows.ts:189-203's shape, never
      // useReplyRows.ts's throw-and-save-nothing one.
      try {
        window.localStorage.removeItem(STORAGE_KEY_CONTEXT);
        nextStatus = CONTEXT_STORAGE_REDUCED_MESSAGE;
      } catch {
        nextStatus = CONTEXT_STORAGE_FULL_MESSAGE;
      }
    }
    if (nextStatus !== contextPersistStatusRef.current) {
      setContextPersistError(nextStatus);
    }
    contextPersistStatusRef.current = nextStatus;
  }, [contextText]);

  // --- Templates (AC3/AM-C) ------------------------------------------------

  // Seeded synchronously with the built-in presets (DECK_PRESETS is a pure,
  // module-scope constant) - mirrors useLmsGeneration.ts's own precedent, so
  // the resolved-slide-count line and the picker are both usable before any
  // network round trip completes.
  const [templates, setTemplates] = useState<DeckTemplate[]>(DECK_PRESETS);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const templatesLoadedRef = useRef(false);

  useEffect(() => {
    if (!active || templatesLoadedRef.current) return;
    let cancelled = false;
    // setState-in-effect idiom: async IIFE, setState only after the await.
    void (async () => {
      const result = await listDeckTemplatesAction();
      if (cancelled) return;
      templatesLoadedRef.current = true;
      if ("error" in result) {
        setTemplatesError(result.error);
        return;
      }
      const loaded = [...DECK_PRESETS, ...result.templates];
      setTemplates(loaded);
      setTemplateId((prev) => resolveDeckTemplateId(prev, loaded));
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  // AM-C: THE SLIDE COUNT IS FIXED BY THE TEMPLATE, NOT BY THE CAPTURE. Every
  // shipped preset has an empty runtime loop-item list, so expandTemplate
  // emits each loop block exactly once - computed client-side, shown next to
  // the picker, BEFORE any capture starts, never gated on `capturing`.
  const resolvedSlideCount = useMemo(
    () => (selectedTemplate ? expandTemplate(selectedTemplate, {}).length : 0),
    [selectedTemplate]
  );

  // --- Launch handoff (AC1/AM-L) ------------------------------------------
  // Mirrors GradingRecordingPanel.tsx's own live RECORDING_LAUNCH_EVENT
  // listener. `capturePrefill` is ADVISORY ONLY (AM-L): it seeds a blank
  // field, it never overwrites one the instructor already set - the panel's
  // own controls stay authoritative regardless of which route reached it.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = e instanceof CustomEvent ? parseRecordingLaunch(e.detail) : null;
      if (!detail || detail.view !== "moduledeck" || !detail.capturePrefill) return;
      if (detail.capturePrefill.courseId && !courseId) setCourseId(detail.capturePrefill.courseId);
      if (detail.capturePrefill.moduleLabel && !moduleLabel) setModuleLabel(detail.capturePrefill.moduleLabel);
    };
    window.addEventListener(RECORDING_LAUNCH_EVENT, handler);
    return () => window.removeEventListener(RECORDING_LAUNCH_EVENT, handler);
  }, [courseId, moduleLabel]);

  // --- Run log collection (AC9) -------------------------------------------

  const [logStartedAt, setLogStartedAt] = useState("");
  const [logEndedAt, setLogEndedAt] = useState("");
  const [logBatches, setLogBatches] = useState<ModuleDeckCaptureLogBatch[]>([]);
  const [logEncodeNotices, setLogEncodeNotices] = useState<ModuleDeckCaptureEncodeNotice[]>([]);
  const [frameEncodeFacts, setFrameEncodeFacts] = useState<FrameEncodeFacts[]>([]);
  const [generationAttempts, setGenerationAttempts] = useState<ModuleDeckCaptureGenerationAttempt[]>([]);
  const [materialsTextForLog, setMaterialsTextForLog] = useState("");
  const [blocksForLog, setBlocksForLog] = useState<ModuleDeckCaptureBlocks>({
    blocksExtracted: 0,
    blocksIllegible: 0,
    reductionStages: [],
  });

  const prevEncodeNoticeRef = useRef<string | null>(null);
  useEffect(() => {
    if (frameEncodeNotice && frameEncodeNotice !== prevEncodeNoticeRef.current) {
      setLogEncodeNotices((prev) => [...prev, { at: new Date().toISOString(), text: frameEncodeNotice }]);
    }
    prevEncodeNoticeRef.current = frameEncodeNotice;
  }, [frameEncodeNotice]);

  // --- AM-G: a monotone dropped-frames session accumulator ----------------
  // useDiscussionCapture's own droppedFrames resets to 0 on every start() -
  // reading it live at download time (the shipped grading panel's bug) would
  // under-report every earlier Start/Stop cycle. accumulateDroppedFrames
  // (module-deck-dispatch.ts) is the tested pure fold; this effect is the
  // ONLY place that calls it, threading the hook's live value through on
  // every change and keeping the running total in state.
  const [droppedFramesTotal, setDroppedFramesTotal] = useState(0);
  const droppedFramesTotalRef = useRef(0);
  const prevLiveDroppedRef = useRef(0);
  useEffect(() => {
    const nextTotal = accumulateDroppedFrames(prevLiveDroppedRef.current, droppedFrames, droppedFramesTotalRef.current);
    prevLiveDroppedRef.current = droppedFrames;
    // react-hooks/set-state-in-effect: only reached when the total actually
    // changed - never an unconditional top-level setState call.
    if (nextTotal !== droppedFramesTotalRef.current) {
      droppedFramesTotalRef.current = nextTotal;
      setDroppedFramesTotal(nextTotal);
    }
  }, [droppedFrames]);

  // --- Notices (AC8) --------------------------------------------------------

  const [notices, setNotices] = useState<Notice[]>([]);
  const pushNotice = useCallback((kind: Notice["kind"], text: string) => {
    setNotices((prev) => [...prev, { id: crypto.randomUUID(), kind, text }]);
  }, []);
  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // --- Extraction / accumulation state -------------------------------------

  const batchIndexRef = useRef(0);
  // Legible blocks only, one entry per successfully-extracted batch, in
  // batchIndex order - AM-H's seam-overlap-join needs batches in order, never
  // a flattened or re-sorted list.
  const batchBlocksRef = useRef<ExtractedBlock[][]>([]);
  const [legibleBlockCount, setLegibleBlockCount] = useState(0);
  const [illegibleBlockCount, setIllegibleBlockCount] = useState(0);
  const [callsSoFar, setCallsSoFar] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [lastFrameSourceHeight, setLastFrameSourceHeight] = useState<number | null>(null);

  const runExtraction = useCallback(async () => {
    const frames = takeFrameBatch(MODULE_EXTRACT_BATCH_SIZE, EXTRACT_BATCH_WIRE_BUDGET);
    if (frames.length === 0) return;
    // setState-in-effect idiom: the microtask hop is a real gate, not a
    // no-op - every setState below runs strictly after this function's own
    // caller (the drain effect) has already returned.
    await Promise.resolve();
    setExtracting(true);
    const batchIndex = batchIndexRef.current++;
    const at = new Date().toISOString();
    const wireBytes = sumBase64WireBytes(frames.map((f) => f.base64));
    const lastFrame: CapturedFrame = frames[frames.length - 1];
    setLastFrameSourceHeight(lastFrame.sourceHeight);
    setFrameEncodeFacts((prev) => [
      ...prev,
      ...frames.map((f) => ({
        sourceWidth: f.sourceWidth,
        sourceHeight: f.sourceHeight,
        encodedWidth: f.encodedWidth,
        encodedHeight: f.encodedHeight,
        encodedQuality: f.encodedQuality,
      })),
    ]);

    try {
      // A batch refused for wire budget is a REACHABLE production path
      // (packFrameBatch always returns at least one frame, even an
      // oversized one) - checked here, client-side, with the exact same
      // function the server enforces with, so this never crosses the wire
      // at all and is logged/notified distinctly from a real model failure.
      const budgetCheck = checkWireBudget(wireBytes, "This batch of captured frames");
      if (!budgetCheck.ok) {
        const message = budgetCheck.error ?? "This batch of captured frames was too large to send.";
        setLogBatches((prev) => [
          ...prev,
          makeModuleDeckCaptureLogBatch({ at, index: batchIndex, framesSent: frames.length, wireBytes, outcome: "wire-budget-rejected", error: message }),
        ]);
        pushNotice("danger", message);
        return;
      }

      const result = await extractModuleContentAction(
        frames.map((f) => ({ base64: f.base64 })),
        moduleLabel,
        contextText,
        provider
      );
      setCallsSoFar((prev) => prev + 1);

      if ("error" in result) {
        setLogBatches((prev) => [
          ...prev,
          makeModuleDeckCaptureLogBatch({ at, index: batchIndex, framesSent: frames.length, wireBytes, outcome: "error", error: result.error }),
        ]);
        pushNotice("danger", result.error);
        return;
      }

      if (result.illegibleCount > 0) {
        setIllegibleBlockCount((prev) => prev + result.illegibleCount);
      }

      if (result.blocks.length === 0) {
        setLogBatches((prev) => [
          ...prev,
          makeModuleDeckCaptureLogBatch({ at, index: batchIndex, framesSent: frames.length, wireBytes, outcome: "empty" }),
        ]);
        if (result.confirmedEmpty) {
          pushNotice("info", "One batch of frames showed no module content (a module index, a loading state, or an empty page) - nothing was added.");
        }
        return;
      }

      batchBlocksRef.current = [...batchBlocksRef.current, result.blocks];
      setLegibleBlockCount((prev) => prev + result.blocks.length);
      setLogBatches((prev) => [
        ...prev,
        makeModuleDeckCaptureLogBatch({ at, index: batchIndex, framesSent: frames.length, wireBytes, outcome: "extracted" }),
      ]);
    } finally {
      setExtracting(false);
    }
  }, [takeFrameBatch, moduleLabel, contextText, provider, pushNotice]);

  // Drains the capture queue as frames arrive, and keeps draining after Stop
  // - mirrors GradingRecordingPanel.tsx:330-342 exactly (useDiscussionCapture's
  // own documented contract: the extraction loop outlives capturing===false
  // and drains it to empty).
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

  // --- Start/stop -----------------------------------------------------------

  const [startError, setStartError] = useState<string | null>(null);

  const handleStartStop = useCallback(() => {
    if (capturing) {
      setLogEndedAt(new Date().toISOString());
      stop();
      return;
    }
    setStartError(null);
    setLogStartedAt((prev) => prev || new Date().toISOString());
    setLogEndedAt("");
    (async () => {
      try {
        await start({ saveVideo: false });
      } catch (err) {
        // AC5 (upstream): a cancelled picker (NotAllowedError) is swallowed
        // inside useDiscussionCapture's own start() and never reaches here -
        // this branch is only a real capture-start failure (AC8).
        setStartError(`Could not start the screen capture: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    })();
  }, [capturing, start, stop]);

  // --- DE18: beforeunload guard --------------------------------------------
  // No resume path, no restore flow (DE18's own "do not build half-
  // persistence" rule) - only the settings above persist. This just stops a
  // closed tab from silently discarding an in-progress run and its already-
  // billed calls with no warning at all.
  useEffect(() => {
    if (!(capturing || pendingFrames > 0)) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [capturing, pendingFrames]);

  // --- AC5/AM-K: live cost, frames and calls only --------------------------

  const framesKeptSoFar = useMemo(
    () => logBatches.reduce((sum, b) => sum + (b.outcome === "wire-budget-rejected" ? 0 : b.framesSent), 0) + pendingFrames,
    [logBatches, pendingFrames]
  );
  const runCost = estimateRunCost(elapsedSec * 1000, framesKeptSoFar, callsSoFar);

  // --- DE7: the third loss channel ------------------------------------------

  const scrollSafety = describeScrollSafety(lastFrameSourceHeight ?? 1080);

  // --- Legibility probe (AM-L) ----------------------------------------------

  const [probeOpen, setProbeOpen] = useState(false);
  const probeButtonRef = useRef<HTMLButtonElement>(null);

  // --- Generation (AC7/AM-A/AM-J) --------------------------------------------

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [savedArtifact, setSavedArtifact] = useState<GeneratedArtifact | null>(null);

  const totalBlockCount = legibleBlockCount + illegibleBlockCount;
  const selectedCourse = (courses ?? []).find((c) => c.id === courseId) ?? null;

  const generateGate = canGenerateDeck({
    blockCount: totalBlockCount,
    legibleBlockCount,
    templateId,
    courseId,
    capturing,
    extracting,
    busy: generating,
  });

  const handleGenerate = useCallback(async () => {
    const gate = canGenerateDeck({
      blockCount: totalBlockCount,
      legibleBlockCount,
      templateId,
      courseId,
      capturing,
      extracting,
      busy: generating,
    });
    if (!gate.ok) {
      setGenerateError(gate.reason);
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    try {
      // DE12/DE16's fixed reduction pipeline: chrome suppression, then the
      // seam overlap-join (never a global dedupe set - see module-blocks.ts's
      // own header for why), then rendering, then the cap (never
      // tail-truncated).
      const suppressed = suppressPageFurniture(batchBlocksRef.current);
      const beforeJoinChars = suppressed.batches.reduce((sum, batch) => sum + batch.reduce((s, b) => s + b.text.length, 0), 0);
      let accumulated: ExtractedBlock[] = [];
      suppressed.batches.forEach((batch, i) => {
        accumulated = appendBatchBlocks(accumulated, batch, i);
      });
      const afterJoinChars = accumulated.reduce((sum, b) => sum + b.text.length, 0);
      const rendered = renderMaterialsText(accumulated);
      const capped = capMaterialsText(rendered.text);

      const reductionStages: ModuleDeckCaptureReductionStage[] = [
        { stage: "chrome-suppression", charactersRemoved: suppressed.charsRemoved, blocksAffected: suppressed.blocksRemoved },
        { stage: "duplicate-join", charactersRemoved: Math.max(0, beforeJoinChars - afterJoinChars) },
        { stage: "control-text-removal", charactersRemoved: capped.controlTextCharsRemoved },
        { stage: "proportional-downsampling", charactersRemoved: capped.downsampledCharsRemoved },
      ];
      setMaterialsTextForLog(capped.text);
      setBlocksForLog({ blocksExtracted: totalBlockCount, blocksIllegible: illegibleBlockCount, reductionStages });

      const payload: DeckFromCaptureRequest = {
        courseUrl: "",
        courseId,
        moduleLabel: moduleLabel.trim() || undefined,
        templateId,
        materialsText: capped.text,
        provider,
      };
      const at = new Date().toISOString();
      const result = await generateDeckFromCaptureApi(payload);
      if ("error" in result) {
        setGenerateError(result.error);
        setGenerationAttempts((prev) => [
          ...prev,
          { at, outcome: "error", error: result.error, materialsCharacterCount: capped.text.length, resolvedSlideCount },
        ]);
        return;
      }
      setSavedArtifact(result.artifact);
      setGenerationAttempts((prev) => [
        ...prev,
        { at, outcome: "success", error: "", materialsCharacterCount: capped.text.length, resolvedSlideCount },
      ]);
    } finally {
      setGenerating(false);
    }
  }, [totalBlockCount, legibleBlockCount, templateId, courseId, capturing, extracting, generating, illegibleBlockCount, moduleLabel, provider, resolvedSlideCount]);

  const handleDownloadDeck = useCallback(async () => {
    if (!savedArtifact) return;
    try {
      const blob = await buildArtifactDownloadBlob(savedArtifact, "Lecture deck", "pptx");
      triggerFileDownload(blob, artifactDownloadFilename(savedArtifact, "Lecture deck", "pptx"));
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Could not build the PowerPoint download.");
    }
  }, [savedArtifact]);

  // --- Run log (AC9) ---------------------------------------------------------

  const currentLog = useMemo(
    () =>
      buildModuleDeckCaptureRunLog({
        startedAt: logStartedAt,
        endedAt: logEndedAt || null,
        settings: {
          courseName: selectedCourse?.name ?? "",
          moduleLabel: moduleLabel.trim(),
          templateId,
          resolvedSlideCount,
          provider,
          contextText,
        },
        droppedFrames: droppedFramesTotal,
        estimatedScrollRatePxPerSec: null,
        frameEncodeFacts,
        batches: logBatches,
        encodeNotices: logEncodeNotices,
        blocks: blocksForLog,
        generationAttempts,
        materialsText: materialsTextForLog,
      }),
    [
      logStartedAt,
      logEndedAt,
      selectedCourse,
      moduleLabel,
      templateId,
      resolvedSlideCount,
      provider,
      contextText,
      droppedFramesTotal,
      frameEncodeFacts,
      logBatches,
      logEncodeNotices,
      blocksForLog,
      generationAttempts,
      materialsTextForLog,
    ]
  );

  const handleDownloadLog = (format: "csv" | "json") => {
    const now = new Date().toISOString();
    const text = format === "csv" ? formatModuleDeckCaptureLogCsv(currentLog) : formatModuleDeckCaptureLogJson(currentLog, { exportedAt: now });
    const filename = moduleDeckCaptureLogFileName(moduleLabel || currentLog.settings.courseName, format, now);
    const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
    triggerFileDownload(new Blob([text], { type: mimeType }), filename);
  };

  const pptxAvailable = savedArtifact ? artifactDownloadFormats(savedArtifact).includes("pptx") : false;

  // CC1: "extracted material exists" for this surface means at least one
  // legible block has been read off the screen - the same condition
  // canGenerateDeck itself gates decision 6 on (blockCount > 0 &&
  // legibleBlockCount === 0 is still a refusal), so hasMaterial and the
  // gate agree on what "material" means.
  const hasMaterial = legibleBlockCount > 0;

  // CC12: the panel keeps its own status-sentence copy (CC16 - unchanged
  // wording, unchanged conditions) and only adopts the shared throttle hook
  // and the shared visually-hidden style, mirroring the visible status text
  // rendered below so a screen-reader user hears the same information a
  // sighted user sees, without a live region firing on every frame.
  const captureStatusSentence = capturing
    ? [
        legibleBlockCount === 0
          ? "Capturing - nothing read yet."
          : `${legibleBlockCount} block${legibleBlockCount === 1 ? "" : "s"} read so far.`,
        extracting ? "Reading the screen…" : null,
        pendingFrames > 0 ? "Catching up - scroll a little slower." : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" ")
    : "";
  const throttledCaptureStatus = useThrottledLiveSentence(captureStatusSentence);

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Module walkthrough (record a lecture deck)</h2>
        <p className={styles.adaptPanelSubtitle}>
          Share your screen and scroll through a module - the app reads what is visible and turns it into a lecture
          slide deck using the template you pick below. The deck&apos;s slide count comes from the template, not from
          how long you record.
        </p>
      </div>

      {/* CC11: one consolidated notices slot, the first child after the
          header - the five paragraphs that used to be scattered through the
          rest of this file (start failure, stalled, dropped frames, an encode
          notice, per-batch notices).
          Fixer pass finding 2 (9b): CC11's original text let danger kinds
          keep their own per-notice role="alert" here; a bad run showed that
          was wrong for THIS surface - several of these can fire at once
          (a start failure, a stalled warning and a dropped-frames notice all
          together), and N simultaneous role="alert" regions queue and
          interrupt each other instead of being read in order. ONE wrapper
          now carries role="status"/aria-live="polite" and no role on the
          individual notices, mirroring DiscussionRepliesPanel.tsx's own
          CC11 wrapper. */}
      {(startError || droppedFramesTotal > 0 || frameEncodeNotice || notices.length > 0) && (
        <div role="status" aria-live="polite" className={styles.field}>
          {startError && <p className={`${controls.notice} ${controls.noticeDanger}`}>{startError}</p>}
          {droppedFramesTotal > 0 && (
            <p className={`${controls.notice} ${controls.noticeDanger}`}>
              {droppedFramesTotal} frame{droppedFramesTotal === 1 ? "" : "s"} scrolled past faster than they could be
              read and were dropped. Scroll back over that section to catch it.
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

      {/* CC8: directly under the header (notices above are the only thing
          that can precede it, and are absent on the common path). */}
      <RunLogRow
        summary={moduleDeckCaptureLogSummaryLine(summarizeModuleDeckCaptureRunLog(currentLog))}
        onDownload={handleDownloadLog}
      />

      {/* CC2/CC17: course, module, template and context - extracted to
          ModuleDeckSettings. All reachable BEFORE the record button, all
          persisted, all always offered regardless of a bulk-bar prefill
          (AC1's "the destination owns its context obligation"). */}
      <ModuleDeckSettings
        courseId={courseId}
        setCourseId={setCourseId}
        courses={courses}
        coursesLoading={coursesLoading}
        coursesError={coursesError}
        moduleLabel={moduleLabel}
        setModuleLabel={setModuleLabel}
        templateId={templateId}
        setTemplateId={setTemplateId}
        templates={templates}
        templatesError={templatesError}
        contextText={contextText}
        setContextText={setContextText}
        maxContextChars={MAX_CONTEXT_CHARS}
        contextPersistError={contextPersistError}
        // AM-C/Fixer pass finding 1: the literal stays here (the wiring test
        // requires it precede the run row's own capture toggle and not be
        // gated on `capturing`) but is now passed down so it renders
        // directly under the template picker's own row, inside the Deck
        // fieldset, instead of under the Context textarea.
        templateHint={
          <p className={styles.fieldHint}>
            This template always produces {resolvedSlideCount} slide{resolvedSlideCount === 1 ? "" : "s"}, regardless
            of how long you record.
          </p>
        }
      />

      {/* AM-L: nothing about a capture survives a reload - stated plainly,
          before the record button. */}
      <p className={styles.fieldHint}>
        A capture in progress does not survive a reload or a closed tab: anything not yet read off the screen, and any
        vision call already in flight, is lost.
      </p>
      <p className={styles.fieldHint}>{scrollSafety.message}</p>

      {/* CC1: the run row - the last thing in the settings block, immediately
          followed by the status area. Exactly one of these three is
          `contained` on any given render: Start/Stop while capturing or with
          no material yet, Generate deck once material exists and capture has
          stopped. The probe button below is always outlined - it is never
          the screen's primary. */}
      <div className={`${styles.ghActions} ${controls.runRow}`}>
        <Button variant={variantFor(capturing || !hasMaterial)} color="primary" size="small" onClick={handleStartStop}>
          {capturing ? "Stop capture" : "Start capture"}
        </Button>
        <Button variant="outlined" size="small" ref={probeButtonRef} disabled={capturing} onClick={() => setProbeOpen(true)}>
          Run legibility probe
        </Button>
        <Button
          variant={variantFor(!capturing && hasMaterial)}
          color="primary"
          size="small"
          loading={generating}
          loadingPosition="start"
          disabled={!generateGate.ok}
          onClick={() => void handleGenerate()}
        >
          {generating ? "Generating…" : "Generate deck"}
        </Button>
      </div>
      {!generateGate.ok && <p className={styles.fieldHint}>{generateGate.reason}</p>}
      <p className={styles.fieldHint}>
        You can also stop from your browser&apos;s sharing bar. Run the legibility probe first if you are unsure your
        text will be readable - a failed probe means the deck would be built from unreadable frames.
      </p>

      {/* CC12/CC13: only the <video> stays hidden from assistive tech - the
          status column next to it is real content and must reach it. The
          visible sentence is unchanged (CC16); the throttled hidden region
          beside it announces the same information at most once every 5s. */}
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
            <span>{legibleBlockCount === 0 ? "Capturing - nothing read yet." : `${legibleBlockCount} block${legibleBlockCount === 1 ? "" : "s"} read so far.`}</span>
            {extracting && <span>Reading the screen…</span>}
            {pendingFrames > 0 && <span>Catching up - scroll a little slower.</span>}
          </div>
        )}
      </div>
      {stalled && (
        <p role="status" aria-live="polite" className={`${controls.notice} ${controls.noticeWarning}`}>
          Nothing new has been read off the screen for 30 seconds. Keep this app&apos;s tab visible in a second
          window while you scroll.
        </p>
      )}
      <span role="status" aria-live="polite" style={visuallyHidden}>
        {throttledCaptureStatus}
      </span>

      {logStartedAt && (
        // AC5/AM-K: frames and calls only - never a token count, never a
        // currency figure.
        <p className={styles.fieldHint}>{runCost.message}</p>
      )}
      {generateError && (
        <p className={`${controls.notice} ${controls.noticeDanger}`} role="alert">
          {generateError}
        </p>
      )}
      {savedArtifact && (
        <>
          <p className={styles.fieldHint} role="status">
            Saved as version {savedArtifact.version} to {selectedCourse?.name ?? "the course"}&apos;s generated
            content. There is no preview on this panel - open it from the Modules tab, or download it below.
          </p>
          {pptxAvailable && (
            <div className={styles.ghActions}>
              <Button variant="outlined" size="small" onClick={() => void handleDownloadDeck()}>
                Download .pptx
              </Button>
            </div>
          )}
        </>
      )}

      {probeOpen && <LegibilityProbeModal onClose={() => setProbeOpen(false)} restoreFocusRef={probeButtonRef} />}
    </div>
  );
}
