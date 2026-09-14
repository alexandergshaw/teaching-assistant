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
// P5: TWO ALWAYS-VISIBLE BUTTONS ("Generate announcement" / "Generate video
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
// P11: the pasted exemplar's RAW TEXT never leaves this component - only
// its derived outline (deriveAnnouncementOutline, a pure client-safe leaf)
// reaches draftWalkthroughAnnouncementAction.
// P15: a disclosure sits in the settings block, before the record button -
// frames are sent to a third-party AI provider, and a single shared window
// is safer than a whole screen.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { raceWithTimeout } from "@/lib/bounded-race";
import { Button, TextField } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import { variantFor } from "../ui/buttonVariant";
import { isConfirmArmed } from "../content-tab/modules/confirmArming";
import { LegibilityProbeModal } from "../grading-recording/LegibilityProbeModal";
import { triggerFileDownload } from "../course-planning/utils";
import { useLlmProvider } from "@/lib/llm-provider";
import { useDiscussionCapture } from "../recording/useDiscussionCapture";
import { EXTRACT_BATCH_WIRE_BUDGET } from "../recording/discussion-capture";
import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
import { listCourseHubAction } from "@/app/actions";
import { extractModuleContentAction } from "@/app/actions/module-content-extract";
import { MODULE_EXTRACT_BATCH_SIZE, type ExtractedBlock } from "../module-deck-capture/module-extraction-prompt";
import { reduceCaptureToMaterials } from "../module-deck-capture/module-blocks";
import { deriveWalkthroughPageCoverage, renderWalkthroughCoverageBlock } from "./walkthrough-announcement-coverage";
import { deriveAnnouncementOutline } from "@/lib/announcement-outline";
import type { AnnouncementOutline } from "@/lib/announcement-outline-types";
import { WALKTHROUGH_ANNOUNCEMENT_MATERIALS_CAP } from "@/lib/walkthrough-announcement-prompt";
import { WALKTHROUGH_SCRIPT_MATERIALS_CAP } from "@/lib/walkthrough-script-prompt";
import { fnv1aHash } from "@/lib/lms-generation/generation-diag";
import {
  getMostRecentAnnouncementExemplarAction,
  listAnnouncementExemplarsAction,
  saveAnnouncementExemplarAction,
  deleteAnnouncementExemplarAction,
  draftWalkthroughAnnouncementAction,
  draftWalkthroughVideoScriptAction,
  postWalkthroughAnnouncementAction,
  gatherWalkthroughResourcesAction,
} from "@/app/actions/walkthrough-announcement";
import {
  useAnnouncementDraftSlots,
  type AnnouncementDraftRequestContext,
  type AnnouncementDraftDispatchContext,
} from "./useAnnouncementDraftSlots";
import AnnouncementDraftSlot from "./AnnouncementDraftSlot";
import AnnouncementCourseFieldset, {
  type AnnouncementExemplarSummary,
  type WtaCourseOption,
} from "./AnnouncementCourseFieldset";
import {
  EXEMPLAR_FETCH_TIMEOUT_MS,
  MAX_ANNOUNCEMENT_BATCH_SIZE,
  type ResearchNotice,
  type ResourceOutcome,
  type SavedFormatsState,
  type TemplateCandidate,
  type TemplateOptionSource,
} from "./announcement-draft-slots";

// PERSISTED CONTROLS (AC1/AC3) - a bound const per key, mirroring
// ModuleDeckCapturePanel.tsx's own STORAGE_KEY_* idiom, so the directory's
// ordinal ta- key canary (walkthrough-announcement.structure.test.ts) can
// find them without re-typing the literal. "walkannounce" is this feature's
// own RecordingLaunch view id (recording-launch.ts). This surface's own key
// segment ("wta") is reserved and distinct from module-deck-capture's own
// segment and every other recording surface's own keys - deliberately not
// spelled out as a second literal here, so this comment cannot itself be
// miscounted by the directory-wide key-ordinal canary below.
const STORAGE_KEY_COURSE = "ta-rec-wta-course";
const STORAGE_KEY_MODULE = "ta-rec-wta-module";
const STORAGE_KEY_NOTES = "ta-rec-wta-notes";
// G3 Ruling 4/G: two new persisted format toggles.
const STORAGE_KEY_EMOJI = "ta-rec-wta-emoji";
const STORAGE_KEY_RESOURCES = "ta-rec-wta-resources";

const MAX_NOTES_CHARS = 2000;

// AnnouncementExemplarSummary/WtaCourseOption now live in
// AnnouncementCourseFieldset.tsx (backlog 4.1's extraction) and are imported
// above - still deliberately SEPARATE declarations from the (unexported,
// since a "use server" file may export only async functions) shape
// walkthrough-announcement.ts's own actions return, mirroring how
// AnnCourseOption (useTakeAnnouncement.ts) is its own local type rather than
// an import of CourseHub.

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

  // --- Course (AC1's own course key, and the destination for AC7's post) --

  const [courses, setCourses] = useState<WtaCourseOption[] | null>(null);
  const [coursesError, setCoursesError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await listCourseHubAction();
        if (cancelled) return;
        if ("error" in result) {
          setCoursesError(result.error);
          return;
        }
        setCourses(
          result.courses
            .filter((c) => Boolean(c.canvasUrl))
            .map((c) => ({ id: c.id, name: c.name, canvasUrl: c.canvasUrl as string, institution: c.institution ?? null }))
        );
        setCoursesError(null);
      } catch (err) {
        if (!cancelled) setCoursesError(err instanceof Error ? err.message : "Could not load your courses.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const [courseId, setCourseId] = useState<string>(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem(STORAGE_KEY_COURSE) ?? "")
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_COURSE, courseId);
    } catch {
      // Best-effort, mirrors every sibling recording panel's own low-stakes
      // course-id persistence - losing this does not affect the session.
    }
  }, [courseId]);

  const [moduleLabel, setModuleLabelState] = useState<string>(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem(STORAGE_KEY_MODULE) ?? "")
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_MODULE, moduleLabel);
    } catch {
      // Best-effort.
    }
  }, [moduleLabel]);

  const [notesText, setNotesTextState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return (window.localStorage.getItem(STORAGE_KEY_NOTES) ?? "").slice(0, MAX_NOTES_CHARS);
  });
  const setNotesText = useCallback((next: string) => setNotesTextState(next.slice(0, MAX_NOTES_CHARS)), []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_NOTES, notesText);
    } catch {
      // Best-effort - a lost notes box degrades the next draft's context,
      // it does not lose anything already captured or drafted.
    }
  }, [notesText]);

  // G3 Ruling 4/G: emoji and resource-research toggles, persisted. Unlike
  // courseId/moduleLabel/notesText above, these are BOOLEANS rendered as a
  // checked/unchecked control - a localStorage-seeded useState initializer
  // does not show its restored value on reload on an SSR'd surface (the
  // server-rendered markup always reflects the default, and a lazy
  // initializer reading localStorage on the client's first render disagrees
  // with it), so restoration happens in a mount effect instead
  // (persisted-details-open-hydration.md's own fix shape).
  const [emojiOn, setEmojiOn] = useState(false);
  const [researchOn, setResearchOn] = useState(false);
  useEffect(() => {
    // setState-in-effect idiom (AGENTS.md/CLAUDE.md guidance, this repo's own
    // useCourseIntel.ts precedent): every setState below is reached only
    // after an await, never synchronously from the effect body - eslint's
    // react-hooks/set-state-in-effect rejects the latter.
    void (async () => {
      await Promise.resolve();
      try {
        const storedEmoji = window.localStorage.getItem(STORAGE_KEY_EMOJI);
        if (storedEmoji !== null) setEmojiOn(storedEmoji === "true");
        const storedResearch = window.localStorage.getItem(STORAGE_KEY_RESOURCES);
        if (storedResearch !== null) setResearchOn(storedResearch === "true");
      } catch {
        // Best-effort - falls back to the defaults above.
      }
    })();
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY_EMOJI, String(emojiOn));
    } catch {
      // Best-effort.
    }
  }, [emojiOn]);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY_RESOURCES, String(researchOn));
    } catch {
      // Best-effort.
    }
  }, [researchOn]);

  const selectedCourse = (courses ?? []).find((c) => c.id === courseId) ?? null;

  // --- Exemplar (AC1, AC2, decision P3: Supabase, not localStorage) -------

  const [exemplarText, setExemplarText] = useState("");
  const [exemplarLabel, setExemplarLabel] = useState("");
  const [savingExemplar, setSavingExemplar] = useState(false);
  const [exemplarSaved, setExemplarSaved] = useState(false);
  const [exemplarError, setExemplarError] = useState<string | null>(null);

  const [mostRecentExemplar, setMostRecentExemplar] = useState<AnnouncementExemplarSummary | null>(null);
  const [savedExemplars, setSavedExemplars] = useState<AnnouncementExemplarSummary[] | null>(null);
  // G1: replaces the old savedExemplarsLoading/savedExemplarsFailed booleans
  // (announcement-draft-slots.ts's own SavedFormatsState doc comment). Starts
  // "loaded" to preserve today's behaviour exactly (both booleans used to
  // start false) - "loaded with a null list and no course chosen" is an
  // imprecise pre-existing representation of that idle state, left as-is
  // this wave.
  const [savedFormatsState, setSavedFormatsState] = useState<SavedFormatsState>("loaded");
  const [showExemplarPicker, setShowExemplarPicker] = useState(false);
  const [removeArmedId, setRemoveArmedId] = useState<string | null>(null);

  // AC1's default (most recent) AND (G2: every slot's dropdown needs the
  // full list up front) the full saved list, fetched eagerly together,
  // cancellation-guarded.
  // Shared between this effect and loadSavedExemplars below - both fetch the
  // same saved-exemplar list, and either can be in flight when the other
  // starts (a course switch while the picker's own retry is in flight, or
  // vice versa). One counter, bumped at the start of EITHER fetch, is what
  // lets a stale resolution recognize itself as stale no matter which of the
  // two started it (AccessibilityProvider.tsx's scanRunId/aborted idiom).
  const savedListRunId = useRef(0);

  useEffect(() => {
    const runId = ++savedListRunId.current;
    const stale = () => savedListRunId.current !== runId;
    // setState-in-effect idiom (see AGENTS.md/CLAUDE.md guidance and this
    // repo's own useCourseIntel.ts precedent): every setState below is
    // reached only after an await, never synchronously from the effect
    // body - eslint's react-hooks/set-state-in-effect rejects the latter.
    void (async () => {
      await Promise.resolve();
      if (stale()) return;
      setMostRecentExemplar(null);
      setSavedExemplars(null);
      setSavedFormatsState("loaded");
      setShowExemplarPicker(false);
      if (!courseId) return;
      setSavedFormatsState("loading");
      // Bounded per G1: a hung fetch must not leave the picker waiting
      // forever. Promise.race cannot cancel either promise below - only the
      // caller's own wait - so a timeout here does not stop the request.
      const outcome = await raceWithTimeout(
        Promise.all([getMostRecentAnnouncementExemplarAction(courseId), listAnnouncementExemplarsAction(courseId)]),
        EXEMPLAR_FETCH_TIMEOUT_MS
      );
      // Sequence-token guard, not the old local `cancelled` flag: a newer
      // fetch (this effect re-running on another course switch, or the
      // picker's own loadSavedExemplars) may already have written a fresher
      // list by the time this one resolves. The concrete failure this
      // closes: this fetch hangs, the instructor opens the picker and its
      // own fetch resolves first, then saves a new exemplar (prepended onto
      // that fresher list) - if this stale fetch were still allowed to
      // write afterward, it would overwrite that list with its own
      // pre-save snapshot and the new exemplar would silently vanish.
      if (stale()) return;
      if (outcome.kind === "timedout") {
        setSavedFormatsState("timedout");
        return;
      }
      if (outcome.kind === "failed") {
        setExemplarError(outcome.error instanceof Error ? outcome.error.message : "Could not load your saved formats.");
        setSavedFormatsState("failed");
        return;
      }
      const [mostRecentResult, listResult] = outcome.value;
      if ("error" in mostRecentResult) {
        setExemplarError(mostRecentResult.error);
      } else {
        setMostRecentExemplar(mostRecentResult.exemplar);
      }
      if ("error" in listResult) {
        setExemplarError(listResult.error);
        setSavedFormatsState("failed");
      } else {
        setExemplarError(null);
        setSavedExemplars(listResult.exemplars);
        setSavedFormatsState("loaded");
      }
    })();
    // Bump on unmount too. The counter alone only marks a run stale when
    // ANOTHER fetch starts, so without this an in-flight fetch resolving
    // after unmount would still run its setState calls - which the previous
    // `cancelled` flag's cleanup did guard against. Bumping here restores
    // that guard: React runs this cleanup before the next invocation, and
    // that invocation captures its own id afterwards, so the extra bump
    // never strands a live run.
    return () => {
      savedListRunId.current += 1;
    };
  }, [courseId]);

  const loadSavedExemplars = useCallback(async () => {
    if (!courseId) return;
    const runId = ++savedListRunId.current;
    const stale = () => savedListRunId.current !== runId;
    setSavedFormatsState("loading");
    const outcome = await raceWithTimeout(listAnnouncementExemplarsAction(courseId), EXEMPLAR_FETCH_TIMEOUT_MS);
    // Same sequence-token guard as the mount effect above, and the same
    // reason: this call and that effect share one counter, so whichever
    // started later wins and an earlier, now-stale resolution never
    // overwrites it.
    if (stale()) return;
    if (outcome.kind === "timedout") {
      setSavedFormatsState("timedout");
      return;
    }
    if (outcome.kind === "failed") {
      setExemplarError(outcome.error instanceof Error ? outcome.error.message : "Could not load your saved formats.");
      setSavedFormatsState("failed");
      return;
    }
    const result = outcome.value;
    if ("error" in result) {
      setExemplarError(result.error);
      setSavedFormatsState("failed");
      return;
    }
    setExemplarError(null);
    setSavedExemplars(result.exemplars);
    setSavedFormatsState("loaded");
  }, [courseId]);

  const handleToggleExemplarPicker = useCallback(() => {
    setShowExemplarPicker((prev) => {
      const next = !prev;
      // State-aware, not "list is null": in the timed-out state
      // savedExemplars is ALSO still null, so gating on nullness alone would
      // spawn a fresh fetch on every picker open with no limit. Start one
      // only when nothing is already in flight and the list is not already
      // resolved - failed/timedout are exactly the states worth retrying.
      if (next && savedFormatsState !== "loading" && savedFormatsState !== "loaded") void loadSavedExemplars();
      return next;
    });
  }, [savedFormatsState, loadSavedExemplars]);

  const handleSaveExemplar = useCallback(async () => {
    if (!courseId || !exemplarText.trim()) return;
    setSavingExemplar(true);
    setExemplarError(null);
    setExemplarSaved(false);
    const result = await saveAnnouncementExemplarAction(courseId, exemplarText, exemplarLabel.trim() || undefined);
    setSavingExemplar(false);
    if ("error" in result) {
      setExemplarError(result.error);
      return;
    }
    setSavedExemplars((prev) => (prev ? [result.exemplar, ...prev] : prev));
    if (savedExemplars === null) {
      // The list was never loaded (or is failed/timedout), so the prepend
      // above was a no-op - the new exemplar would otherwise never appear in
      // the picker. Fabricating a one-element list here would falsely claim
      // this is the ONLY saved format rather than an unknown-sized list, so
      // start a fresh bounded load instead and let it fetch the real thing.
      void loadSavedExemplars();
    }
    setMostRecentExemplar(result.exemplar);
    setExemplarLabel("");
    setExemplarSaved(true);
  }, [courseId, exemplarText, exemplarLabel, savedExemplars, loadSavedExemplars]);

  // P11/AC2: the outline a "pasted"/"default" choice reads (resolveLive
  // below) - per-slot precedence lives in resolveChoice, not here.
  const pastedOutline = useMemo(
    () => (exemplarText.trim() ? deriveAnnouncementOutline(exemplarText) : null),
    [exemplarText]
  );

  // --- Notices --------------------------------------------------------------

  const [notices, setNotices] = useState<Notice[]>([]);
  const pushNotice = useCallback((kind: Notice["kind"], text: string) => {
    setNotices((prev) => [...prev, { id: crypto.randomUUID(), kind, text }]);
  }, []);
  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // --- Extraction / accumulation state (shared seam: reduceCaptureToMaterials) --

  const batchBlocksRef = useRef<ExtractedBlock[][]>([]);
  const [legibleBlockCount, setLegibleBlockCount] = useState(0);
  const [extracting, setExtracting] = useState(false);

  const runExtraction = useCallback(async () => {
    const frames = takeFrameBatch(MODULE_EXTRACT_BATCH_SIZE, EXTRACT_BATCH_WIRE_BUDGET);
    if (frames.length === 0) return;
    await Promise.resolve();
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
      setExtracting(false);
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

  const handleStartStop = useCallback(() => {
    if (capturing) {
      stop();
      return;
    }
    setStartError(null);
    (async () => {
      try {
        await start({ saveVideo: false });
      } catch (err) {
        setStartError(`Could not start the screen capture: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    })();
  }, [capturing, start, stop]);

  useEffect(() => {
    if (!(capturing || pendingFrames > 0)) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [capturing, pendingFrames]);

  // --- Legibility probe --------------------------------------------------------

  const [probeOpen, setProbeOpen] = useState(false);
  const probeButtonRef = useRef<HTMLButtonElement>(null);

  const hasMaterial = legibleBlockCount > 0;

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
      hasPastedText: Boolean(exemplarText.trim()),
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
    [exemplarText, mostRecentExemplar, savedExemplars, savedFormatsState]
  );

  const buildRequest = useCallback((): AnnouncementDraftRequestContext => {
    const reduction = reduceCaptureToMaterials(batchBlocksRef.current, WALKTHROUGH_ANNOUNCEMENT_MATERIALS_CAP);
    const coverageBlock = renderWalkthroughCoverageBlock(deriveWalkthroughPageCoverage(reduction.blocks));
    return {
      courseLabel: selectedCourse?.name ?? "",
      moduleLabel: moduleLabel.trim() || null,
      materialsText: reduction.text,
      coverageBlock,
      notes: notesText,
      provider,
      emojiOn,
      researchOn,
    };
  }, [selectedCourse, moduleLabel, notesText, provider, emojiOn, researchOn]);

  const resolveLive = useCallback(
    () => ({ pastedOutline, mostRecent: optionSource.mostRecent }),
    [pastedOutline, optionSource.mostRecent]
  );

  // G3 Ruling 2/9: the actual research call - the only site (per blocker 5)
  // that may call a server action directly. gatherWalkthroughResourcesAction
  // never rejects on its own known failure paths, but the hook's own
  // in-flight handling still treats a thrown error as "failed" as an outer
  // belt (mirroring useReplyResources.ts's own shape).
  const fetchResources = useCallback(
    (ctx: AnnouncementDraftRequestContext): Promise<ResourceOutcome> =>
      gatherWalkthroughResourcesAction(ctx.materialsText, ctx.courseLabel, ctx.provider),
    []
  );

  // G3 Ruling 17/33: a control-character-free fingerprint over every input
  // the research result depends on - course, module, a hash+length of the
  // materials text (never the full text itself, which can run to tens of
  // thousands of characters), and researchOn. JSON.stringify's own quoting
  // keeps the fields unambiguous without a literal delimiter character.
  const researchFingerprint = useCallback((ctx: AnnouncementDraftRequestContext): string => {
    return JSON.stringify([
      ctx.courseLabel,
      ctx.moduleLabel ?? "",
      ctx.materialsText.length,
      fnv1aHash(ctx.materialsText),
      ctx.researchOn,
    ]);
  }, []);

  const draftOne = useCallback(
    async (
      ctx: AnnouncementDraftDispatchContext,
      outline: AnnouncementOutline
    ): Promise<{ title: string; message: string; researchNotice: ResearchNotice } | { error: string }> => {
      // G3 Ruling 9/M3.3: the derivation from the once-per-Generate research
      // OUTCOME to the RAW resource list the composer/enforcer actually
      // consume - any outcome other than "found" contributes zero citable
      // resources.
      const researchedResources = ctx.researchOutcome.kind === "found" ? ctx.researchOutcome.links : [];
      const result = await draftWalkthroughAnnouncementAction({
        courseLabel: ctx.courseLabel,
        moduleLabel: ctx.moduleLabel,
        materialsText: ctx.materialsText,
        outline,
        coverageBlock: ctx.coverageBlock,
        notes: ctx.notes,
        provider: ctx.provider,
        emojiPolicy: ctx.emojiOn ? "requested" : "forbidden",
        researchedResources,
        researchOutcome: ctx.researchOutcome,
      });
      if ("error" in result) return { error: result.error };
      return { title: result.title, message: result.message, researchNotice: result.researchNotice };
    },
    []
  );

  const postDraft = useCallback(
    (title: string, message: string) => {
      if (!selectedCourse) return null;
      return postWalkthroughAnnouncementAction(selectedCourse.canvasUrl, title, message, selectedCourse.institution ?? undefined).then(
        (result) => {
          if ("error" in result) {
            return { error: `Canvas refused the announcement - ${result.error}. Nothing was posted.` };
          }
          return { course: selectedCourse.name };
        }
      );
    },
    [selectedCourse]
  );

  const {
    slots,
    readyToDraftCount,
    researching,
    addSlot,
    removeSlot,
    chooseTemplate,
    editSlot,
    generate,
    regenerate,
    copySlot,
    armPost,
    cancelPost,
    armRegenerate,
    cancelRegenerate,
    postSignatureFor,
  } = useAnnouncementDraftSlots({ buildRequest, resolveLive, draftOne, postDraft, fetchResources, researchFingerprint });

  const anyDrafting = slots.some((s) => s.draft.phase === "drafting");

  const handleRemoveExemplar = useCallback(
    async (id: string) => {
      const result = await deleteAnnouncementExemplarAction(id);
      if ("error" in result) {
        setExemplarError(result.error);
        return;
      }
      setSavedExemplars((prev) => (prev ?? []).filter((e) => e.id !== id));
      setMostRecentExemplar((prev) => (prev?.id === id ? null : prev));
      setRemoveArmedId(null);
      // Reconcile any slot pointing at the deleted exemplar back to default.
      for (const slot of slots) {
        if (slot.choice.kind === "saved" && slot.choice.exemplarId === id) {
          chooseTemplate(slot.id, { kind: "default" });
        }
      }
    },
    [slots, chooseTemplate]
  );

  const handleGenerateScript = useCallback(async () => {
    setScriptGenerating(true);
    setScriptError(null);
    try {
      const reduction = reduceCaptureToMaterials(batchBlocksRef.current, WALKTHROUGH_SCRIPT_MATERIALS_CAP);
      const result = await draftWalkthroughVideoScriptAction({
        courseName: selectedCourse?.name ?? "",
        moduleLabel: moduleLabel.trim(),
        materialsText: reduction.text,
        notes: notesText,
        provider,
      });
      if ("error" in result) {
        setScriptError(result.error);
        return;
      }
      setScriptText(result.script);
    } finally {
      setScriptGenerating(false);
    }
  }, [selectedCourse, moduleLabel, notesText, provider]);

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Announcement from a walkthrough</h2>
        <p className={styles.adaptPanelSubtitle}>
          Share your screen and click through a series of LMS pages - the app reads what is visible and drafts an
          announcement matching a previous one&apos;s format, and/or a video script, covering the pages in the order
          you walked them.
        </p>
      </div>

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

      {/* AC1/AC3: course, module, exemplar, format toggles and notes - all
          reachable BEFORE the record button, all persisted where the
          standing rule requires it (course/module/notes/emoji/resources
          under ta- keys; the exemplar itself in Supabase, per decision P3,
          never localStorage). Extracted to AnnouncementCourseFieldset.tsx
          (backlog 4.1) - every literal server-action call stays here in the
          panel (blocker 5); the fieldset only renders and reports upward. */}
      <AnnouncementCourseFieldset
        courses={courses}
        courseId={courseId}
        onCourseIdChange={setCourseId}
        coursesError={coursesError}
        moduleLabel={moduleLabel}
        onModuleLabelChange={setModuleLabelState}
        exemplarText={exemplarText}
        onExemplarTextChange={setExemplarText}
        exemplarLabel={exemplarLabel}
        onExemplarLabelChange={setExemplarLabel}
        savingExemplar={savingExemplar}
        onSaveExemplar={() => void handleSaveExemplar()}
        exemplarSaved={exemplarSaved}
        exemplarError={exemplarError}
        showExemplarPicker={showExemplarPicker}
        onToggleExemplarPicker={handleToggleExemplarPicker}
        savedFormatsState={savedFormatsState}
        savedExemplars={savedExemplars}
        canAddSlotFromExemplar={slots.length < MAX_ANNOUNCEMENT_BATCH_SIZE}
        onAddSlotFromExemplar={(ex) =>
          addSlot({
            kind: "saved",
            exemplarId: ex.id,
            label: ex.label || new Date(ex.createdAt).toLocaleDateString(),
            outline: ex.outline,
          })
        }
        removeArmedId={removeArmedId}
        onArmRemoveExemplar={(id) => setRemoveArmedId(id)}
        onConfirmRemoveExemplar={(id) => void handleRemoveExemplar(id)}
        onCancelRemoveExemplar={() => setRemoveArmedId(null)}
        notesText={notesText}
        maxNotesChars={MAX_NOTES_CHARS}
        onNotesTextChange={setNotesText}
        emojiOn={emojiOn}
        onEmojiOnChange={setEmojiOn}
        researchOn={researchOn}
        onResearchOnChange={setResearchOn}
      />

      <p className={styles.fieldHint}>
        A capture in progress does not survive a reload or a closed tab: anything not yet read off the screen, and any
        vision call already in flight, is lost.
      </p>

      <div className={`${styles.ghActions} ${controls.runRow}`}>
        <Button variant={variantFor(capturing || !hasMaterial)} color="primary" size="small" onClick={handleStartStop}>
          {capturing ? "Stop capture" : "Start capture"}
        </Button>
        <Button variant="outlined" size="small" ref={probeButtonRef} disabled={capturing} onClick={() => setProbeOpen(true)}>
          Run legibility probe
        </Button>
      </div>
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

      {/* P5: two always-visible buttons, never a mode toggle. */}
      <div className={`${styles.ghActions} ${controls.runRow}`}>
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
            capturing || extracting || !hasMaterial || anyDrafting || savedFormatsState === "loading" || readyToDraftCount === 0
          }
          onClick={() => void generate()}
        >
          {anyDrafting ? "Generating…" : "Generate announcement"}
        </Button>
        <Button
          variant="outlined"
          color="primary"
          size="small"
          loading={scriptGenerating}
          loadingPosition="start"
          disabled={capturing || extracting || !hasMaterial || scriptGenerating}
          onClick={() => void handleGenerateScript()}
        >
          {scriptGenerating ? "Generating…" : "Generate video script"}
        </Button>
      </div>
      {/* G3 Ruling 24/34: Generate awaits research before any slot enters
          "drafting" and stays enabled throughout the wait (a second click
          reuses the in-flight research call) - this is the only feedback the
          instructor gets during that wait. */}
      {researching && (
        <p role="status" aria-live="polite" className={styles.fieldHint}>
          Researching resources for this module…
        </p>
      )}
      {!hasMaterial && <p className={styles.fieldHint}>Record and stop a walkthrough first - nothing has been read yet.</p>}
      {hasMaterial && readyToDraftCount === 0 && !anyDrafting && (
        <p className={styles.fieldHint}>
          Every draft slot already has a draft - add another slot, or use Regenerate on one.
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
            canRemove={slots.length > 1}
            onChooseTemplate={chooseTemplate}
            onEdit={editSlot}
            onRegenerateArm={armRegenerate}
            onRegenerateConfirm={regenerate}
            onRegenerateCancel={cancelRegenerate}
            onPostArm={armPost}
            onPostCancel={cancelPost}
            onCopy={copySlot}
            onRemove={removeSlot}
          />
        ))}
        <div className={styles.ghActions}>
          <Button
            size="small"
            variant="outlined"
            disabled={slots.length >= MAX_ANNOUNCEMENT_BATCH_SIZE}
            onClick={() => addSlot({ kind: "default" })}
          >
            Add another draft slot
          </Button>
        </div>
      </fieldset>

      {/* AC5: the video script - never posted, just read aloud while
          re-recording. */}
      {(scriptError || scriptText) && (
        <fieldset className={controls.section}>
          <legend className={controls.sectionLegend}>Video script draft</legend>
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

      {probeOpen && <LegibilityProbeModal onClose={() => setProbeOpen(false)} restoreFocusRef={probeButtonRef} />}
    </div>
  );
}
