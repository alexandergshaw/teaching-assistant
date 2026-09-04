"use client";

// Message replies (Manual > Recording > Message replies) - the orchestrator
// hook. Composes useDiscussionCapture() (device-lifetime capture, imported
// as-is per docs/message-replies-acceptance-criteria.md section 0),
// useMessageRows() (table-lifetime state), useMessagePersistedControls()
// (M5's nine simple controls) and useMessageDelivery() (M16/M17's save/send/
// check surface) into UseMessageRepliesReturn below - THE CONTRACT a
// .tsx components code against, so
// nothing here may be renamed or dropped without updating this file's own
// doc comments.
//
// Mirrors src/app/components/recording/useDiscussionReplies.ts's shape (see
// that file's own header) minus the resource-search lane and the
// thread-position lane (section 0), plus the M15 match surface (this file's
// own `runMatchPass`) and the M16/M17 save/send/check surface
// (useMessageDelivery.ts) that file has no analogue for.
//
// Originally a single ~890-line file; split three ways to stay well under
// the file-size ceiling: useMessagePersistedControls.ts (M5's nine simple controls),
// message-extraction-loop.ts (the capture-to-table loop, M8/M9), and
// useMessageDelivery.ts (M16/M17). What remains here is session wiring
// (start/stop/clear), the M15 match-pass orchestration (which both the
// extraction loop and `stop()` trigger, so it stays a shared owner rather
// than duplicated into either), the draft queue, and assembling
// UseMessageRepliesReturn from all of the above plus useMessageRowFiltering/
// useMessageSessionSummary/useMessageRepliesRunLog.
//
// One real deviation from the discussion sibling, forced by the action's
// already-landed action surface (src/app/actions/message-replies.ts) and
// documented at its call site below: `draftMessageRepliesAction` takes no
// `provider` argument. The instructor's writing-style block is resolved
// entirely server-side by that action itself, the same way its discussion
// sibling resolves its own - this hook never fetches or holds the raw
// writing-style sample, and imports nothing to reach it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { accumulateDroppedFrames, draftDispatchForce, type CapturedFrame } from "../recording/discussion-capture";
import { useDiscussionCapture } from "../recording/useDiscussionCapture";
import { useDiscussionCourses } from "../recording/useDiscussionCourses";
import { useDiscussionNotices } from "../recording/useDiscussionNotices";
import { useDiscussionLoopWake } from "../recording/useDiscussionLoopWake";
import { useDiscussionLoopStarter } from "../recording/useDiscussionLoopStarter";
import { knowledgeContextLabelFor } from "../recording/discussion-knowledge-context";
import { useInstitutionSelection } from "@/lib/institutions";
import { listCourseHubAction } from "@/app/actions/course-hub-core";
import {
  extractStudentMessagesAction,
  draftMessageRepliesAction,
} from "@/app/actions/message-replies";
import { listConversationsAction } from "@/app/actions/canvas-inbox";
import type { CanvasConversationSummary } from "@/lib/canvas/inbox";
import type { RecordingKnowledgeContext } from "@/lib/recording-launch";
import type { MessageCompositionSettings } from "@/lib/message-reply-prompt";
import { writeLocalStorage, type MessageSort } from "./message-capture";
import { useMessagePersistedControls } from "./useMessagePersistedControls";
import { useMessageRows } from "./useMessageRows";
import { useMessageKnowledgeContext } from "./useMessageKnowledgeContext";
import { useMessageReplyFiltering } from "./useMessageReplyFiltering";
import { useMessageSessionSummary, type StoppedMessageSummary } from "./useMessageSessionSummary";
import { useMessageRepliesRunLog } from "./useMessageRepliesRunLog";
import { useMessageDelivery } from "./useMessageDelivery";
import { runMessageExtractionLoop, type ExtractMessagesAction } from "./message-extraction-loop";
import type { MessageStatusFilter } from "./message-table-view";
import type { MessageThreadRow } from "./message-serialization";
import { latestIncoming } from "./message-thread";
import {
  runMessageDraftLoop,
  applyCanvasMatches,
  type MessageDraftQueueItem,
  type DraftMessageRepliesAction,
} from "./message-draft-loop";
import {
  makeMessageRepliesLogBatch,
  type MessageRepliesLogBatch,
  type MessageRepliesLogRetry,
  type MessageRepliesRunLog,
} from "./message-replies-log";

// AC55-style discipline (see useMessageRows.ts's own header): keys are whole
// string literals, never a template literal, so message-replies.structure.
// test.ts's directory-wide `ta-` key ordinal canary sees the real key. The
// only key this file still writes itself - the other nine of M5's own
// simple controls now live in useMessagePersistedControls.ts.
const STORAGE_KEY_KB_CONTEXT_LABEL = "ta-rec-msg-kb-context-label";

/** M14's "Draft the missing replies" bulk eligibility - every pending/failed
 * row, excluding previewOnly and skipped, AND only when the thread actually
 * has a latest incoming message to answer: a thread of
 * only `[you]` lines (every message fromMe - `latestIncoming` returns
 * `undefined`) has nothing for a drafted reply to respond to and must never
 * enter the queue, bulk click or not. Deliberately NOT gated on
 * `skipAnswered`: unlike the automatic queue, this is an explicit click the
 * instructor made, and `state === "pending"` combined with `answered` is
 * already a narrow, real case (a thread the instructor answered manually
 * before this tool ever drafted anything for it). */
function isDraftAllPendingEligible(row: MessageThreadRow): boolean {
  if (row.state !== "pending" && row.state !== "failed") return false;
  if (row.previewOnly || row.skipped) return false;
  return latestIncoming(row) !== undefined;
}

export interface UseMessageRepliesReturn {
  // -------------------------------------------------------------------
  // Persisted simple controls (M5).
  // -------------------------------------------------------------------
  courseId: string;
  setCourseId: (id: string) => void;
  courses: Array<{ id: string; name: string }> | null;
  coursesLoading: boolean;
  coursesError: string | null;

  instructorName: string;
  setInstructorName: (name: string) => void;
  signoff: string;
  setSignoff: (s: string) => void;
  /** M10's ingredients/formality/address-by-name. */
  composition: MessageCompositionSettings;
  setComposition: (next: MessageCompositionSettings) => void;
  /** M12: default on; keeps `answered` threads out of the automatic queue. */
  skipAnswered: boolean;
  setSkipAnswered: (v: boolean) => void;
  /** M13's table-level "Show the whole thread" default-open state. */
  threadExpand: boolean;
  setThreadExpand: (v: boolean) => void;
  saveVideo: boolean;
  setSaveVideo: (v: boolean) => void;
  recordingUrl: string | null;
  recordingBytes: number;

  knowledgeContextLabel: string | null;
  knowledgeContext: RecordingKnowledgeContext | null;
  setKnowledgeContext: (next: RecordingKnowledgeContext | null) => void;

  // -------------------------------------------------------------------
  // Capture (M7).
  // -------------------------------------------------------------------
  capturing: boolean;
  elapsedSec: number;
  pendingFrames: number;
  droppedFrames: number;
  extracting: boolean;
  stalled: boolean;
  notices: Array<{ id: string; text: string }>;
  dismissNotice: (id: string) => void;
  previewRef: React.RefObject<HTMLVideoElement | null>;
  start: () => Promise<void>;
  stop: () => void;

  // -------------------------------------------------------------------
  // Table (M9, M13, M18).
  // -------------------------------------------------------------------
  /** Sorted, text-filtered AND status-filtered for display. */
  rows: MessageThreadRow[];
  sort: MessageSort;
  setSort: (s: MessageSort) => void;
  filterText: string;
  setFilterText: (next: string) => void;
  statusFilter: MessageStatusFilter;
  setStatusFilter: (next: MessageStatusFilter) => void;
  statusCounts: Record<MessageStatusFilter, number>;
  /** True when either the text search or a status chip is narrowing the
   *  table. */
  filterActive: boolean;
  /** The one persistent element every "clear the filter" control refocuses
   *  (useMessageReplyFiltering.ts's own). */
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  handleClearFilters: () => void;
  /** The UNFILTERED row count - every count/progress-string/arming-signature
   *  site must read this, never `rows.length`. */
  totalCount: number;
  /** The UNFILTERED row objects. */
  rawRows: MessageThreadRow[];

  moveRow: (id: string, dir: "up" | "down") => void;
  /** `editReply` wrapped to clear `handledAt` on any edit. */
  editReply: (id: string, text: string) => void;
  removeRow: (id: string) => void;
  markHandled: (id: string) => void;
  toggleHandled: (id: string) => void;
  toggleSkipped: (id: string) => void;
  retryRow: (id: string) => void;
  redraftRow: (id: string) => void;
  draftAllPending: () => void;
  clearTable: () => void;
  drafting: boolean;

  // M15 - Match to Canvas. `matchUnmatched` is the manual retry (a course/
  // Canvas id that cannot resolve still no-ops silently - only this
  // explicit call ever reports a notice for that; a background pass never
  // does). `unmatchedCount` is N for the toolbar's "Match to Canvas (N)" -
  // unmatched, non-preview threads.
  matchUnmatched: () => void;
  unmatchedCount: number;

  // M16 - Save as draft. `saveDraft` is enabled only on a matched row with a
  // non-empty reply (the UI disables the control otherwise; this no-ops
  // defensively too). `saveAllDrafts` is "Save all as drafts (N)" - N =
  // matched, drafted, unsent, unsaved, unskipped rows. `savingDraftIds` is
  // for a disabled/spinner state.
  saveDraft: (id: string) => void;
  saveAllDrafts: () => void;
  savingDraftIds: readonly string[];

  // M17 - Send. `send` dispatches on confirm; a second call for the same id
  // while the first is in flight, or a row already sent, is a no-op.
  // `checkSent` re-checks a row whose send may or may not have gone
  // through. `sendErrorById` is M17's exact failure text keyed by row id,
  // DERIVED from `rawRows` (`row.sendError`) so it survives a reload
  // unchanged. `sendingIds` is for a disabled/spinner state on either call.
  send: (id: string) => void;
  checkSent: (id: string) => void;
  sendErrorById: Readonly<Record<string, string>>;
  sendingIds: readonly string[];

  // Session summary / run log.
  stoppedSummary: StoppedMessageSummary | null;
  showNeverOpened: boolean;
  showPersistedBanner: boolean;
  showCapturingEmpty: boolean;
  showStoppedEmpty: boolean;
  /** M18's live fieldHint under `<RunLogRow>` - "" when there is nothing
   *  outstanding (the caller hides the line entirely in that case). */
  outstandingHint: string;
  runLog: MessageRepliesRunLog;
}

// M15: the Canvas conversation-list cache's TTL - a
// merge-triggered match pass never hits the network at all (it only
// re-applies the pure predicate against whatever is cached), so this only
// bounds how stale a merge-time match can be before `stop()`/manual next
// refresh it.
const CONVERSATIONS_CACHE_TTL_MS = 60_000;

export function useMessageReplies(active: boolean): UseMessageRepliesReturn {
  const controls = useMessagePersistedControls();
  const {
    courseId,
    setCourseId,
    instructorName,
    setInstructorName,
    signoff,
    setSignoff,
    composition,
    setComposition,
    skipAnswered,
    setSkipAnswered,
    threadExpand,
    setThreadExpand,
    saveVideo,
    setSaveVideo,
  } = controls;

  const { courses, coursesLoading, coursesError, hasActivatedRef } = useDiscussionCourses(active);
  const { active: acronym } = useInstitutionSelection();

  const capture = useDiscussionCapture();
  const rowsApi = useMessageRows();

  const { notices, dismissNotice, pushNotice, logAllNotices } = useDiscussionNotices({
    recordingError: capture.recordingError,
    frameEncodeNotice: capture.frameEncodeNotice,
    persistError: rowsApi.persistError,
  });

  // --- Run-log collection (M19). ---
  const [logStartedAt, setLogStartedAt] = useState("");
  const [logEndedAt, setLogEndedAt] = useState("");
  const [logFramesCaptured, setLogFramesCaptured] = useState(0);
  const [logBatches, setLogBatches] = useState<MessageRepliesLogBatch[]>([]);
  const [logRetries, setLogRetries] = useState<MessageRepliesLogRetry[]>([]);

  const [droppedFramesTotal, setDroppedFramesTotal] = useState(0);
  const droppedFramesTotalRef = useRef(0);
  const prevLiveDroppedRef = useRef(0);
  useEffect(() => {
    const nextTotal = accumulateDroppedFrames(prevLiveDroppedRef.current, capture.droppedFrames, droppedFramesTotalRef.current);
    prevLiveDroppedRef.current = capture.droppedFrames;
    if (nextTotal !== droppedFramesTotalRef.current) {
      droppedFramesTotalRef.current = nextTotal;
      setDroppedFramesTotal(nextTotal);
    }
  }, [capture.droppedFrames]);

  // --- Refs mirroring dispatch-time values (both async loops below are
  // await-suspended across renders, so their closures are stale by
  // definition). Plain useRef+useEffect, not the useLiveRef helper this file
  // tried first: the react-hooks eslint plugin recognizes a bare `useRef()`
  // call as a stable identity that needs no deps-array entry, but cannot see
  // through a custom wrapper hook the same way - wrapping introduced thirteen
  // false "missing dependency" warnings below with no correctness upside. ---
  const captureRef = useRef(capture);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);
  const rowsApiRef = useRef(rowsApi);
  useEffect(() => {
    rowsApiRef.current = rowsApi;
  }, [rowsApi]);
  const instructorNameRef = useRef(instructorName);
  useEffect(() => {
    instructorNameRef.current = instructorName;
  }, [instructorName]);
  const signoffRef = useRef(signoff);
  useEffect(() => {
    signoffRef.current = signoff;
  }, [signoff]);
  const compositionRef = useRef(composition);
  useEffect(() => {
    compositionRef.current = composition;
  }, [composition]);
  const skipAnsweredRef = useRef(skipAnswered);
  useEffect(() => {
    skipAnsweredRef.current = skipAnswered;
  }, [skipAnswered]);
  const saveVideoRef = useRef(saveVideo);
  useEffect(() => {
    saveVideoRef.current = saveVideo;
  }, [saveVideo]);
  const acronymRef = useRef(acronym);
  useEffect(() => {
    acronymRef.current = acronym;
  }, [acronym]);
  // A plain reactive derivation for render-time reads (react-hooks/refs
  // forbids reading a ref's `.current` during render - see the run log call
  // below, which needs this value, not the mirror); `courseNameRef` is the
  // SAME value mirrored into a ref for the two async loops' dispatch-time
  // reads, which run outside render.
  const courseName = courses?.find((c) => c.id === courseId)?.name ?? "";
  const courseNameRef = useRef(courseName);
  useEffect(() => {
    courseNameRef.current = courseName;
  }, [courseName]);

  // M15's own "courseId comes from the selected course's canvasUrl" - the
  // discussion course list (useDiscussionCourses) deliberately maps down to
  // {id, name} only, so this feature fetches its own {id -> canvasUrl} map
  // once. `hasFetchedCourseUrlsRef` is reset - not left permanently true -
  // on a genuine fetch failure AND in the cleanup that fires when
  // `cancelled` is set before the map ever lands (StrictMode's synchronous
  // double-invoke runs a component's first cleanup before that first
  // effect's own async work could possibly have finished): without both
  // resets, either path would permanently disable M15's matching for the
  // rest of the session, with no course id ever resolving again.
  const courseCanvasUrlByIdRef = useRef<Map<string, string>>(new Map());
  const hasFetchedCourseUrlsRef = useRef(false);
  useEffect(() => {
    if (!active || hasFetchedCourseUrlsRef.current) return;
    hasFetchedCourseUrlsRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const result = await listCourseHubAction();
        if (cancelled) return; // the cleanup below already reset the latch
        if ("error" in result) {
          hasFetchedCourseUrlsRef.current = false; // a real failure - let a later render retry
          return;
        }
        const map = new Map<string, string>();
        for (const c of result.courses) {
          if (c.canvasUrl) map.set(c.id, c.canvasUrl);
        }
        courseCanvasUrlByIdRef.current = map;
      } catch {
        // A genuine network failure - reset the latch (unless already
        // cancelled, in which case the cleanup below already has) so a
        // later render gets a real retry.
        if (!cancelled) hasFetchedCourseUrlsRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
      hasFetchedCourseUrlsRef.current = false;
    };
  }, [active]);

  // --- "Activate this recording from the Knowledge base" (COPIED per
  // section 0 - see useMessageKnowledgeContext.ts's own header). ---
  const {
    knowledgeContext,
    setKnowledgeContext: setKnowledgeContextState,
    knowledgeContextRef,
    knowledgeContextLabel,
  } = useMessageKnowledgeContext({ rawRowsLength: rowsApi.rawRows.length, pushNotice });

  const hasWrittenKbLabelRef = useRef(false);

  const setKnowledgeContext = useCallback(
    (next: RecordingKnowledgeContext | null) => {
      setKnowledgeContextState(next);
      if (hasWrittenKbLabelRef.current) {
        writeLocalStorage(STORAGE_KEY_KB_CONTEXT_LABEL, next ? knowledgeContextLabelFor(next) ?? "Knowledge Base pages" : "");
      }
    },
    [setKnowledgeContextState]
  );

  // --- The wake-ticker mechanism (imported as-is per section 0). ---
  const { loopsActiveRef, loopEpochRef, loopsStartedRef, wakeTickerRef, waitForWake, flushWakeResolvers } = useDiscussionLoopWake();

  const draftQueueRef = useRef<MessageDraftQueueItem[]>([]);
  const [draftQueueSize, setDraftQueueSize] = useState(0);

  const enqueueDrafts = useCallback((ids: string[], force: boolean) => {
    for (const id of ids) {
      const idx = draftQueueRef.current.findIndex((q) => q.id === id);
      if (idx === -1) {
        draftQueueRef.current.push({ id, force });
      } else if (force && !draftQueueRef.current[idx].force) {
        draftQueueRef.current[idx] = { id, force: true };
      }
    }
    setDraftQueueSize(draftQueueRef.current.length);
  }, []);

  // -----------------------------------------------------------------------
  // M15 - Match to Canvas.
  //  - the conversation list is cached in a ref with a ~60s TTL
  //    (CONVERSATIONS_CACHE_TTL_MS); a merge-triggered pass (`forceRefetch`
  //    unset) NEVER hits the network - it only re-applies the pure
  //    `applyCanvasMatches` against whatever is already cached, or does
  //    nothing when nothing has been cached yet this session.
  //  - `stop()` and the manual retry both pass `forceRefetch: true` and
  //    always call Canvas, refreshing the cache.
  //  - a manual call that arrives while a refetch is already in flight gets
  //    a notice instead of a silent no-op; a `forceRefetch` call (stop's
  //    included) that arrives mid-flight is QUEUED to run again once the
  //    current one finishes, rather than dropped.
  // -----------------------------------------------------------------------
  const matchInFlightRef = useRef(false);
  const queuedMatchPassRef = useRef(false);
  const conversationsCacheRef = useRef<{ conversations: ReadonlyArray<CanvasConversationSummary>; at: number; courseId: string } | null>(null);

  const runMatchPass = useCallback(
    async (opts: { manual: boolean; rowIds?: string[]; forceRefetch?: boolean }) => {
      const canvasUrl = courseId ? courseCanvasUrlByIdRef.current.get(courseId) : undefined;
      const courseIdMatch = canvasUrl?.match(/\/courses\/(\d+)/);
      if (!courseIdMatch) {
        if (opts.manual) pushNotice("Select a course with a linked Canvas URL before matching to Canvas.");
        return;
      }
      const resolvedCourseId = courseIdMatch[1];

      if (!opts.forceRefetch) {
        const cached = conversationsCacheRef.current;
        if (cached && cached.courseId === resolvedCourseId && Date.now() - cached.at < CONVERSATIONS_CACHE_TTL_MS) {
          applyCanvasMatches(rowsApiRef, cached.conversations, Date.now(), opts.rowIds);
        }
        return;
      }

      if (matchInFlightRef.current) {
        if (opts.manual) {
          pushNotice("Already checking Canvas - try again in a moment.");
          return;
        }
        queuedMatchPassRef.current = true; // stop()'s own pass must not silently no-op
        return;
      }

      matchInFlightRef.current = true;
      try {
        // A LOOP, not a self-recursive call to this same useCallback: a
        // background pass queued WHILE this fetch was in flight
        // (queuedMatchPassRef) is served by fetching again right here, in
        // the same invocation - the React Compiler cannot preserve manual
        // memoization across a useCallback body that calls itself through
        // its own closed-over binding.
        let runAgain = true;
        while (runAgain) {
          runAgain = false;
          try {
            const result = await listConversationsAction(acronymRef.current || undefined, { courseId: resolvedCourseId });
            if ("error" in result) {
              if (opts.manual) pushNotice(`Could not check Canvas: ${result.error}`);
            } else {
              conversationsCacheRef.current = { conversations: result.conversations, at: Date.now(), courseId: resolvedCourseId };
              applyCanvasMatches(rowsApiRef, result.conversations, Date.now(), opts.rowIds);
            }
          } catch (err) {
            if (opts.manual) pushNotice(`Could not check Canvas: ${err instanceof Error ? err.message : "unknown error"}`);
          }
          if (queuedMatchPassRef.current) {
            queuedMatchPassRef.current = false;
            runAgain = true;
          }
        }
      } finally {
        matchInFlightRef.current = false;
      }
    },
    [courseId, pushNotice]
  );

  const matchUnmatched = useCallback(() => {
    void runMatchPass({ manual: true, forceRefetch: true });
  }, [runMatchPass]);

  const unmatchedCount = useMemo(
    () => rowsApi.rawRows.filter((r) => !r.canvas && !r.previewOnly).length,
    [rowsApi.rawRows]
  );

  // --- The extraction loop (M8/M9), pulled out to message-extraction-loop.ts. ---
  const [extracting, setExtracting] = useState(false);

  const recordExtractionBatch = useCallback(
    (framesInBatch: number, args: Omit<Parameters<typeof makeMessageRepliesLogBatch>[0], "at" | "framesInBatch">) => {
      const at = new Date().toISOString();
      setLogFramesCaptured((prev) => prev + framesInBatch);
      setLogBatches((prev) => [...prev, makeMessageRepliesLogBatch({ at, framesInBatch, ...args })]);
    },
    []
  );

  const runExtractionLoop = useCallback(
    (epoch: number) =>
      runMessageExtractionLoop(epoch, {
        loopsActiveRef,
        loopEpochRef,
        captureRef: captureRef as unknown as React.MutableRefObject<{
          pendingFrames: number;
          takeFrameBatch: (count: number, wireBudget: number) => CapturedFrame[];
        }>,
        waitForWake,
        rowsApiRef,
        courseNameRef,
        instructorNameRef,
        skipAnsweredRef,
        setExtracting,
        recordBatch: recordExtractionBatch,
        enqueueDrafts,
        onMerged: () => void runMatchPass({ manual: false }),
        pushNotice,
        extractAction: extractStudentMessagesAction as ExtractMessagesAction,
      }),
    [pushNotice, enqueueDrafts, waitForWake, loopsActiveRef, loopEpochRef, recordExtractionBatch, runMatchPass]
  );

  // --- The drafting queue (M12). ---
  const [drafting, setDrafting] = useState(false);

  const runDraftLoop = useCallback(
    (epoch: number) =>
      runMessageDraftLoop(epoch, {
        loopsActiveRef,
        loopEpochRef,
        draftQueueRef,
        setDraftQueueSize,
        setDrafting,
        waitForWake,
        rowsApiRef,
        courseNameRef,
        compositionRef,
        signoffRef,
        knowledgeContextRef,
        pushNotice,
        draftAction: draftMessageRepliesAction as DraftMessageRepliesAction,
      }),
    [pushNotice, waitForWake, loopsActiveRef, loopEpochRef, knowledgeContextRef]
  );

  useDiscussionLoopStarter({
    active,
    coursesLoading,
    capturing: capture.capturing,
    pendingFrames: capture.pendingFrames,
    extracting,
    drafting,
    draftQueueSize,
    rawRowsLength: rowsApi.rawRows.length,
    hasActivatedRef,
    loopsStartedRef,
    loopEpochRef,
    wakeTickerRef,
    flushWakeResolvers,
    runExtractionLoop,
    runDraftLoop,
  });

  // --- Session actions. ---
  const start = useCallback(async () => {
    setLogStartedAt((prev) => prev || new Date().toISOString());
    setLogEndedAt("");
    if (knowledgeContextRef.current) {
      writeLocalStorage(STORAGE_KEY_KB_CONTEXT_LABEL, knowledgeContextLabelFor(knowledgeContextRef.current) ?? "Knowledge Base pages");
      hasWrittenKbLabelRef.current = true;
    }
    try {
      await captureRef.current.start({ saveVideo: saveVideoRef.current });
    } catch (err) {
      pushNotice(`Could not start the screen capture: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }, [pushNotice, knowledgeContextRef]);

  const stop = useCallback(() => {
    setLogEndedAt(new Date().toISOString());
    captureRef.current.stop();
    // M15: auto-match runs "on capture stop" - always a real refetch.
    void runMatchPass({ manual: false, forceRefetch: true });
  }, [runMatchPass]);

  const moveRow = useCallback((id: string, dir: "up" | "down") => rowsApiRef.current.moveRow(id, dir), []);
  const removeRow = useCallback((id: string) => rowsApiRef.current.removeRow(id), []);

  const retryRow = useCallback(
    (id: string) => {
      setLogRetries((prev) => [...prev, { at: new Date().toISOString(), rowId: id }]);
      enqueueDrafts([id], draftDispatchForce("retry"));
    },
    [enqueueDrafts]
  );

  const redraftRow = useCallback(
    (id: string) => {
      setLogRetries((prev) => [...prev, { at: new Date().toISOString(), rowId: id }]);
      enqueueDrafts([id], draftDispatchForce("redraftRow"));
    },
    [enqueueDrafts]
  );

  const draftAllPending = useCallback(() => {
    const ids = rowsApiRef.current.rawRows.filter(isDraftAllPendingEligible).map((r) => r.id);
    enqueueDrafts(ids, draftDispatchForce("draftMissing"));
  }, [enqueueDrafts]);

  // --- M16/M17: save/send/check (useMessageDelivery.ts). ---
  const delivery = useMessageDelivery({ rowsApiRef, acronymRef, pushNotice });

  // M17: `sendErrorById` is DERIVED from `rawRows` (never its own state) -
  // see useMessageDelivery.ts's own header for why the derivation has to
  // live here rather than there.
  const sendErrorById = useMemo(() => {
    const out: Record<string, string> = {};
    for (const row of rowsApi.rawRows) {
      if (row.sendError) out[row.id] = row.sendError;
    }
    return out;
  }, [rowsApi.rawRows]);

  const clearTable = useCallback(() => {
    rowsApiRef.current.clearTable();
    captureRef.current.clearRecording();
    setKnowledgeContextState(null);
    writeLocalStorage(STORAGE_KEY_KB_CONTEXT_LABEL, "");
    hasWrittenKbLabelRef.current = false;
    // A deleted table must not leave a stale drafting queue, or a save/send
    // spinner, hanging around for ids that no longer exist.
    draftQueueRef.current = [];
    setDraftQueueSize(0);
    delivery.clearDeliveryState();
  }, [setKnowledgeContextState, delivery]);

  // --- M18: status/text filtering. ---
  const filtering = useMessageReplyFiltering({
    rawRows: rowsApi.rawRows,
    rows: rowsApi.rows,
    filterText: rowsApi.filterText,
    setFilterText: rowsApi.setFilterText,
    editReply: rowsApi.editReply,
    setHandledAt: rowsApi.setHandledAt,
    setSkipped: rowsApi.setSkipped,
  });

  const summary = useMessageSessionSummary({
    capturing: capture.capturing,
    elapsedSec: capture.elapsedSec,
    rawRows: rowsApi.rawRows,
    totalCount: rowsApi.totalCount,
  });

  const runLog = useMessageRepliesRunLog({
    logStartedAt,
    logEndedAt,
    courseName,
    composition,
    signoffSet: signoff.trim().length > 0,
    skipAnswered,
    logFramesCaptured,
    droppedFrames: droppedFramesTotal,
    stalled: capture.stalled,
    logBatches,
    logAllNotices,
    logRetries,
    rawRows: rowsApi.rawRows,
  });

  return {
    courseId,
    setCourseId,
    courses,
    coursesLoading,
    coursesError,

    instructorName,
    setInstructorName,
    signoff,
    setSignoff,
    composition,
    setComposition,
    skipAnswered,
    setSkipAnswered,
    threadExpand,
    setThreadExpand,

    saveVideo,
    setSaveVideo,
    recordingUrl: capture.recordingUrl,
    recordingBytes: capture.recordingBytes,

    knowledgeContextLabel,
    knowledgeContext,
    setKnowledgeContext,

    capturing: capture.capturing,
    elapsedSec: capture.elapsedSec,
    pendingFrames: capture.pendingFrames,
    droppedFrames: droppedFramesTotal,
    extracting,
    stalled: capture.stalled,
    notices,
    dismissNotice,
    previewRef: capture.previewRef,
    start,
    stop,

    rows: filtering.visibleRows,
    sort: rowsApi.sort,
    setSort: rowsApi.setSort,
    filterText: rowsApi.filterText,
    setFilterText: rowsApi.setFilterText,
    statusFilter: filtering.statusFilter,
    setStatusFilter: filtering.setStatusFilter,
    statusCounts: filtering.statusCounts,
    filterActive: filtering.filterActive,
    searchInputRef: filtering.searchInputRef,
    handleClearFilters: filtering.handleClearFilters,
    totalCount: rowsApi.totalCount,
    rawRows: rowsApi.rawRows,

    moveRow,
    editReply: filtering.handleEditReply,
    removeRow,
    markHandled: filtering.markHandled,
    toggleHandled: filtering.toggleHandled,
    toggleSkipped: filtering.toggleSkipped,
    retryRow,
    redraftRow,
    draftAllPending,
    clearTable,
    drafting,

    matchUnmatched,
    unmatchedCount,

    saveDraft: delivery.saveDraft,
    saveAllDrafts: delivery.saveAllDrafts,
    savingDraftIds: delivery.savingDraftIds,

    send: delivery.send,
    checkSent: delivery.checkSent,
    sendErrorById,
    sendingIds: delivery.sendingIds,

    stoppedSummary: summary.stoppedSummary,
    showNeverOpened: summary.showNeverOpened,
    showPersistedBanner: summary.showPersistedBanner,
    showCapturingEmpty: summary.showCapturingEmpty,
    showStoppedEmpty: summary.showStoppedEmpty,
    outstandingHint: summary.outstandingHint,
    runLog,
  };
}
