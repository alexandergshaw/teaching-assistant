"use client";

// Discussion reply capture - the orchestrator (set C3).
//
// Composes useDiscussionCapture() (C1, device-lifetime: screen share, frame
// sampling, the optional recording) and useReplyRows() (C2, table-lifetime:
// rows, sort, persistence) into UseDiscussionRepliesReturn EXACTLY as pinned
// in docs/discussion-reply-capture-acceptance-criteria.md section 12 - set D
// is written against that shape and must not see a field added, renamed or
// dropped here.
//
// Owns: the extraction loop (AC10, AC10a, AC51) and the drafting queue
// (AC25-AC28, AC52); draftAllPending / retryRow / redraftAll; lazy course
// loading's own gate (AC30, AC30a, AC37, AC46 - the fetch itself is
// useDiscussionCourses.ts); the notices list (AC38) and the session-summary
// inputs (AC7b) - the summary sentence itself is D's rendering job, built
// from `rows` (state tallies) and `elapsedSec` (frozen at stop by C1), both
// already in the sealed return below.
//
// SPLIT HISTORY (recording-split.structure.test.ts's 1000-line ceiling on
// this directory, non-recursive): 783 -> 820 -> 944 -> extracted to 900
// (useDiscussionNotices.ts) -> grown back to 990 across two more waves. This
// wave's extractions - discussion-persisted-controls.ts (the three simple
// controls plus the composition object), useDiscussionCourses.ts (the lazy
// course fetch), useDiscussionKnowledgeContext.ts (the Knowledge Base
// context's state and reload notice), useDiscussionLoopWake.ts +
// useDiscussionLoopStarter.ts (the wake-ticker mechanism, split into two
// hooks so the latches/resolvers both loops close over can be created before
// either loop exists, and the actual starting/pausing of the ticker - which
// needs both loops as inputs - can happen after) and
// useDiscussionRepliesRunLog.ts (the downloadable-log assembly memo) - were
// each chosen because they have few inbound references and do NOT touch the
// resource-search queue wiring, `enqueueDrafts`, or the four draft-dispatch
// call sites (the extraction loop's own auto-enqueue, retryRow,
// draftAllPending, redraftAll) that the next feature (resource controls:
// one-click insert, eligible resource kinds, a video-length preference, and
// a per-row resource search) will edit - those all stay here. `start()` also
// stays here in full, never split.
//
// STRUCTURAL FIX (owner ask: show a carried Knowledge Base context BEFORE a
// run): `start()` used to call takeRecordingKnowledgeContext() and
// resolveStartKnowledgeContext() itself - moved to
// useDiscussionKnowledgeContext.ts's own live launch listener (see that
// file's header) so the context (and its label) are already held by the
// time the instructor reaches this pane, not only after they click Start.
// `start()` keeps ONLY the persisted-label WRITE below, gated on an actual
// Start click - see that write's own inline comment for why moving the
// WRITE (as opposed to the take) would be wrong. discussion-knowledge-
// context.test.ts's source guard now scans useDiscussionKnowledgeContext.ts
// for the take (exactly one call site) and separately proves this file's
// `start()` contains none.
//
// CONTRACT NOTES BEYOND WHAT SECTION 12 PINS:
//
// 1. useDiscussionCapture()'s UseDiscussionCaptureReturn carries
//    `recordingError` (AC31's fully formatted "Could not save the
//    recording: <reason>. The capture is still running." message, or null),
//    `droppedFrames` (AC10's running drop count, mirrored into React state
//    by C1 so a change actually re-renders) and `frameEncodeNotice`
//    (AC10b/S5's re-encode-and-drop message) as REAL, always-present
//    fields. `recordingError` and `frameEncodeNotice` are each forwarded
//    into `notices` below (rendered as a dismissible notice, same channel
//    as every other out-of-band failure); `droppedFrames` is passed
//    straight through on this hook's own return so set D can render AC7b's
//    drop sentence directly beneath the persistent post-stop summary, which
//    is a more specific placement than the generic notices list gives it.
// 2. useReplyRows()'s return shape is NOT pinned anywhere in the AC (only
//    prose ownership) - this file uses its real exported
//    `UseReplyRowsReturn` type directly (S6: no hand-written duplicate, no
//    `as` assertion at the call site below).
//
// Import from siblings by contract only - never inline a copy. `Cannot find
// module` for './discussion-capture', './useDiscussionCapture' or
// './useReplyRows' is expected until sets A/C1/C2 land; report it, don't
// create it.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EXTRACT_BATCH_WIRE_BUDGET,
  draftDispatchForce,
  shouldLoopContinue,
  type ReplyResource,
} from "./discussion-capture";
// Resource-controls feature: the one-click insert's pure text-append leaf.
import { appendResourceToReply, replyAlreadyHasResource } from "./discussion-reply-insert";
import { useDiscussionCapture } from "./useDiscussionCapture";
import { useReplyRows } from "./useReplyRows";
import { useReplyResources } from "./useReplyResources";
// D9 (aesthetics-pass redesign, docs/aesthetics-pass-acceptance-criteria.md
// section 4b): draftAllPending/redraftAll's own bulk-eligibility predicates -
// pulled out as pure, tested leaves rather than inlined here, since this file
// is a hook this repo's vitest never renders (discussion-table-view.ts's own
// header).
import { isDraftAllPendingEligible, isRedraftAllEligible } from "./discussion-table-view";
import {
  extractDiscussionPostsAction,
  draftDiscussionRepliesAction,
} from "@/app/actions/discussion-replies";
import { getStoredProvider } from "@/lib/llm-provider";
// "Activate this recording from the Knowledge base" - only the persisted-
// label wording helper is needed here now; the one-shot TAKE and the
// taken-vs-current DECISION (resolveStartKnowledgeContext) both moved into
// useDiscussionKnowledgeContext.ts's own live launch listener - see that
// file's header for why.
import { knowledgeContextLabelFor } from "./discussion-knowledge-context";
import { EXTRACT_BATCH_SIZE } from "@/lib/discussion-reply-prompt";
// Contract/documentation block (UseDiscussionRepliesReturn, DraftQueueItem,
// LOOP_IDLE_POLL_MS, the two localStorage helpers) and the drafting queue's
// consumer loop (runDraftLoop) both live in discussion-draft-loop.ts now -
// split out purely to stay under recording-split.structure.test.ts's
// 1000-line ceiling (see that file's own header for why). This hook still
// OWNS both: it returns UseDiscussionRepliesReturn below exactly as before,
// and wraps runDraftLoop in its own useCallback, supplying the deps object -
// see that wrapper below for why the sibling loop is imported under an
// alias (`runDraftLoop` is also this hook's own local binding name, for the
// same call sites - `void runDraftLoop(epoch)`, the effect's deps array -
// that existed before this split).
import {
  runDraftLoop as runDraftLoopStep,
  writeLocalStorage,
  type UseDiscussionRepliesReturn,
  type DraftQueueItem,
} from "./discussion-draft-loop";
// docs/DEV_LOOP.md's "every feature needs a downloadable log" rule
// (REGRESSION entries 369/372/373/374 record this surface's unpaid debt).
// COLLECTION lives here (the three event-stream refs and the timestamps
// below); ASSEMBLY is useDiscussionRepliesRunLog.ts - see that file's header
// for why parent resolution is a call to the SAME `resolveDraftParent` the
// drafting loop itself uses, never a second copy.
import {
  makeDiscussionRepliesLogBatch,
  type DiscussionRepliesLogBatch,
  type DiscussionRepliesLogRetry,
} from "./discussion-replies-log";
import { useDiscussionRepliesRunLog } from "./useDiscussionRepliesRunLog";
// The notices system (AC38): a capped, deduped list plus the log mirror
// docs/DEV_LOOP.md's downloadable-log rule needs, and the forwarding of C1's
// recorder/frame-encode notices and C2's persist-error into the same
// channel. Split out purely to stay under recording-split.structure.test.ts's
// 1000-line ceiling on this directory - see that file's own header.
import { useDiscussionNotices } from "./useDiscussionNotices";
// The three simple persisted controls plus the composition object (AC20,
// docs/reply-composition-controls-acceptance-criteria.md C5/JOB1) - see that
// file's own header for the full account.
import { useDiscussionPersistedControls } from "./discussion-persisted-controls";
// The lazy course list (AC30, AC30a, AC37, AC46) - see that file's own
// header for the full account, including `hasActivatedRef`'s role in the
// loop-start gate below.
import { useDiscussionCourses } from "./useDiscussionCourses";
// "Activate this recording from the Knowledge base" STATE (the label,
// the ref mirror, the reload-visibility notice) - see that file's own
// header for why the one-shot TAKE itself stays in this file's `start()`.
import { useDiscussionKnowledgeContext } from "./useDiscussionKnowledgeContext";
// AC3 (docs/knowledge-recording-handoff-acceptance-criteria.md section 4):
// only a type import - the widened return now exposes the full context, not
// just its label, for CarriedKnowledgePages.tsx to render/edit.
import type { RecordingKnowledgeContext } from "@/lib/recording-launch";
// The wake-ticker mechanism, split into two hooks - see
// useDiscussionLoopWake.ts's own header for why creating the latches/
// resolvers (this one) and starting/pausing the actual ticker
// (useDiscussionLoopStarter.ts, below) cannot be the same hook call here.
import { useDiscussionLoopWake } from "./useDiscussionLoopWake";
import { useDiscussionLoopStarter } from "./useDiscussionLoopStarter";

export type { UseDiscussionRepliesReturn } from "./discussion-draft-loop";

export function useDiscussionReplies(active: boolean): UseDiscussionRepliesReturn {
  const {
    audience,
    setAudience,
    courseId,
    setCourseId,
    saveVideo,
    setSaveVideo,
    composition,
    setComposition,
    resourceKinds,
    setResourceKinds,
    videoLengthMinMinutes,
    videoLengthMaxMinutes,
    setVideoLengthPreference,
  } = useDiscussionPersistedControls();

  const { courses, coursesLoading, coursesError, hasActivatedRef } = useDiscussionCourses(active);

  // --- Compose C1 and C2. ---
  const capture = useDiscussionCapture();
  const rowsApi = useReplyRows();

  // --- notices (AC38): a capped list, not a slot, so an extraction failure,
  // a drafting failure, a recorder failure and a storage failure never erase
  // each other. Also carries the two conditions (AC10's drop sentence, AC23b's
  // table-full ceiling) that have no other channel in the sealed return.
  // Split into useDiscussionNotices.ts (its own hook) purely to stay under
  // recording-split.structure.test.ts's 1000-line ceiling on this directory
  // (non-recursive) - see that file's own header for the full account. It
  // also forwards C1's recorder failure (`recordingError`) and over-budget-
  // frame notice (`frameEncodeNotice`), and C2's AC23a storage failure
  // (`persistError`), into the same channel - this hook still owns and
  // returns every field below exactly as before. ---
  const { notices, dismissNotice, pushNotice, logAllNotices } = useDiscussionNotices({
    recordingError: capture.recordingError,
    frameEncodeNotice: capture.frameEncodeNotice,
    persistError: rowsApi.persistError,
  });

  // --- docs/DEV_LOOP.md's downloadable-log rule (REGRESSION entries
  // 369/372/373/374): the three event streams the log records, plus the two
  // run-timestamp fields and the running frame count. Plain React state, not
  // refs - this repo's `react-hooks/refs` lint rule forbids reading a ref's
  // `.current` during render (including inside a `useMemo` factory, which
  // runs during render), and useDiscussionRepliesRunLog.ts's memo needs
  // every one of these values to build its input. Each is appended to with a
  // functional updater at the moment its event happens, the same pattern
  // `setDraftQueueSize`/`setExtracting` already use from inside these same
  // async loops. `logAllNotices` itself comes from useDiscussionNotices.ts
  // above, not a local useState - see that hook's own header. ---
  const [logStartedAt, setLogStartedAt] = useState("");
  const [logEndedAt, setLogEndedAt] = useState("");
  const [logFramesCaptured, setLogFramesCaptured] = useState(0);
  const [logBatches, setLogBatches] = useState<DiscussionRepliesLogBatch[]>([]);
  const [logRetries, setLogRetries] = useState<DiscussionRepliesLogRetry[]>([]);

  // --- Refs mirroring everything the two async loops read to decide what to
  // dispatch (AC41). Both loops are await-suspended across renders, so their
  // closures are stale by definition; a ref mirrored in an effect is the only
  // way to read a current value from inside one. Whole sub-hook return
  // objects are mirrored (not just individual fields) so the loops are
  // correct regardless of whether C1/C2 memoize their returned callbacks. ---
  const captureRef = useRef(capture);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  const rowsApiRef = useRef(rowsApi);
  useEffect(() => {
    rowsApiRef.current = rowsApi;
  }, [rowsApi]);

  const audienceRef = useRef(audience);
  useEffect(() => {
    audienceRef.current = audience;
  }, [audience]);

  const saveVideoRef = useRef(saveVideo);
  useEffect(() => {
    saveVideoRef.current = saveVideo;
  }, [saveVideo]);

  // C5/JOB1: mirrors audienceRef/saveVideoRef exactly - runDraftLoop reads
  // this at dispatch time, never a closure captured before the last await.
  const compositionRef = useRef(composition);
  useEffect(() => {
    compositionRef.current = composition;
  }, [composition]);

  // Resource-controls feature: mirrors compositionRef exactly - both the
  // bulk resource drain and the per-row search (useReplyResources.ts) read
  // these at dispatch time, never a closure captured before the last await.
  const resourceKindsRef = useRef(resourceKinds);
  useEffect(() => {
    resourceKindsRef.current = resourceKinds;
  }, [resourceKinds]);

  const videoLengthPreferenceRef = useRef<{ minMinutes?: number; maxMinutes?: number }>({
    minMinutes: videoLengthMinMinutes,
    maxMinutes: videoLengthMaxMinutes,
  });
  useEffect(() => {
    videoLengthPreferenceRef.current = { minMinutes: videoLengthMinMinutes, maxMinutes: videoLengthMaxMinutes };
  }, [videoLengthMinMinutes, videoLengthMaxMinutes]);

  const courseNameRef = useRef("");
  useEffect(() => {
    const match = courses?.find((c) => c.id === courseId);
    courseNameRef.current = match ? match.name : "";
  }, [courses, courseId]);

  // --- "Activate this recording from the Knowledge base" STATE - see
  // useDiscussionKnowledgeContext.ts's own header for the full account,
  // including why the one-shot TAKE stays in `start()` below rather than
  // moving into that hook. ---
  const {
    knowledgeContext,
    setKnowledgeContext: setKnowledgeContextState,
    knowledgeContextRef,
    knowledgeContextLabel,
  } = useDiscussionKnowledgeContext({
    rawRowsLength: rowsApi.rawRows.length,
    pushNotice,
  });

  // AC3/4d (docs/knowledge-recording-handoff-acceptance-criteria.md section
  // 4): whether the persisted "ta-rec-disc-kb-context-label" key has ever
  // been written for THIS table's life - i.e. whether `start()` below has
  // run at least once with a context actually held. `setKnowledgeContext`
  // just below only rewrites that key when this is true: an edit made
  // BEFORE the first Start must not leave a label behind for a session that
  // has not captured anything yet - the identical correctness reason
  // start()'s own write is gated on `knowledgeContextRef.current` rather
  // than firing at launch/take time (see start()'s own comment). Reset to
  // false by clearTable() below, alongside that function's own reset of the
  // persisted key itself - a fresh table's life has no label to rewrite yet.
  const hasWrittenKbLabelRef = useRef(false);

  // THE CORRECTNESS TRAP (this feature's own highest-value fix): the draft
  // loop reads `knowledgeContextRef` fresh per BATCH DISPATCH (runDraftLoop,
  // discussion-draft-loop.ts), so an edit made mid-run - via
  // CarriedKnowledgePages.tsx's removal/undo control - takes effect on the
  // very next batch. But the persisted label was, before this fix, only ever
  // written once, inside `start()`. Left alone, a removal would silently
  // change what later batches actually draft with while the label an
  // instructor returns to (after a reload, via the reload-visibility notice)
  // kept describing the ORIGINAL, pre-edit selection - lying about the exact
  // thing that label exists to answer. This wrapper is the single write path
  // CarriedKnowledgePages.tsx's `onChange` reaches (via the widened
  // UseDiscussionRepliesReturn.setKnowledgeContext below), so every edit
  // rewrites the label the same way `start()` already does, gated on the ref
  // above.
  const setKnowledgeContext = useCallback(
    (next: RecordingKnowledgeContext | null) => {
      setKnowledgeContextState(next);
      if (hasWrittenKbLabelRef.current) {
        writeLocalStorage(
          "ta-rec-disc-kb-context-label",
          next ? knowledgeContextLabelFor(next) ?? "Knowledge Base pages" : ""
        );
      }
    },
    [setKnowledgeContextState]
  );

  // --- The wake-ticker mechanism's latches/resolvers - see
  // useDiscussionLoopWake.ts's own header for the full account. ---
  const { loopsActiveRef, loopEpochRef, loopsStartedRef, wakeTickerRef, waitForWake, flushWakeResolvers } =
    useDiscussionLoopWake();

  // --- Shared drafting queue, declared here (ahead of both loops) so
  // runExtractionLoop's deps array below can reference enqueueDrafts without
  // a temporal-dead-zone violation - a useCallback deps array is evaluated
  // during render, in declaration order, unlike a function body's internal
  // references which only resolve when the closure is later invoked. ---
  const draftQueueRef = useRef<DraftQueueItem[]>([]);
  // NEW-2: mirrored into React state purely so useDiscussionLoopStarter.ts's
  // ticker-idle effect can see "there is now something queued to draft" - a
  // bare ref, like `draftQueueRef` itself, never triggers a re-render. Kept
  // in sync at both ends: bumped here on enqueue, and again in runDraftLoop
  // right after a batch is spliced off the front.
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

  // --- The extraction loop (AC10, AC10a, AC51). Runs for the hook's whole
  // mount-to-unmount lifetime, NOT gated on `capturing` - AC6's teardown
  // flush and AC51 both require posts already scrolled past to still be
  // read after Stop, so `capturing` cannot be this loop's termination
  // condition. It idles cheaply when there is nothing pending. ---
  const [extracting, setExtracting] = useState(false);

  const runExtractionLoop = useCallback(async (epoch: number) => {
    // NEW-1: see shouldLoopContinue's own header (discussion-capture.ts) for
    // why `loopsActiveRef.current` alone cannot distinguish a StrictMode-
    // orphaned instance of this loop from the current one.
    while (shouldLoopContinue(loopsActiveRef.current, loopEpochRef.current, epoch)) {
      const cap = captureRef.current;
      if (cap.pendingFrames === 0) {
        await waitForWake();
        continue;
      }

      const frames = cap.takeFrameBatch(EXTRACT_BATCH_SIZE, EXTRACT_BATCH_WIRE_BUDGET);
      if (frames.length === 0) {
        await waitForWake();
        continue;
      }

      // AC45: snapshot the table epoch BEFORE dispatch. If clearTable or
      // redraftAll bump it while this request is in flight, the whole merge
      // is dropped so a stale response cannot resurrect deleted posts.
      const epochSnapshot = rowsApiRef.current.tableEpochRef.current;
      const provider = getStoredProvider();
      const courseName = courseNameRef.current;
      // Log collection: this batch's send time and frame count, recorded
      // once dispatch is decided. `logBatch` closes over `batchAt`/
      // `frames.length` so each of the four outcome branches below only
      // names what is non-default for it - see
      // discussion-replies-log.ts's `makeDiscussionRepliesLogBatch` for the
      // defaults and `DiscussionRepliesLogBatch` for what each field means.
      const batchAt = new Date().toISOString();
      setLogFramesCaptured((prev) => prev + frames.length);
      const logBatch = (args: Omit<Parameters<typeof makeDiscussionRepliesLogBatch>[0], "at" | "framesInBatch">) =>
        setLogBatches((prev) => [...prev, makeDiscussionRepliesLogBatch({ at: batchAt, framesInBatch: frames.length, ...args })]);

      if (loopsActiveRef.current) setExtracting(true);
      let result: Awaited<ReturnType<typeof extractDiscussionPostsAction>>;
      try {
        result = await extractDiscussionPostsAction(frames, courseName, provider);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "Could not read posts from the screen." };
      }
      if (!loopsActiveRef.current) return;
      setExtracting(false);

      if ("error" in result) {
        logBatch({ error: result.error });
        pushNotice(`Some of the screen could not be read: ${result.error} Capture is still running.`);
        continue;
      }

      if (rowsApiRef.current.tableEpochRef.current !== epochSnapshot) {
        // The table's epoch changed (Delete table / Redraft every reply)
        // while this batch's response was in flight - the posts it found
        // are dropped by design (AC45), but that is exactly the kind of
        // silent event this log exists to make legible.
        logBatch({ postsExtracted: result.posts.length, discarded: true });
        continue;
      }
      if (result.posts.length === 0) {
        logBatch({});
        continue;
      }

      const { addedIds, capped } = rowsApiRef.current.mergeIncoming(result.posts);
      logBatch({ postsExtracted: result.posts.length, postsAdded: addedIds.length, capped });
      if (capped) {
        pushNotice("The reply table is full. Delete it, or remove some rows, to keep capturing.");
      }
      if (addedIds.length > 0) enqueueDrafts(addedIds, draftDispatchForce("auto"));
    }
  }, [pushNotice, enqueueDrafts, waitForWake, loopsActiveRef, loopEpochRef]);

  // --- R-D: the resource-search queue (useReplyResources.ts). Instantiated
  // here - ahead of runDraftLoop below - so runDraftLoop's R6 trigger can
  // reach it through a ref the same way it already reaches rowsApi. Passed
  // plain reactive values (capturing/pendingFrames/extracting) rather than
  // refs: the hook mirrors them itself, the same way this file mirrors its
  // own captureRef/rowsApiRef for its two loops. ---
  const resourcesApi = useReplyResources({
    rowsApi,
    capturing: capture.capturing,
    pendingFrames: capture.pendingFrames,
    extracting,
    courseNameRef,
    resourceKindsRef,
    videoLengthPreferenceRef,
    pushNotice,
  });
  const resourcesApiRef = useRef(resourcesApi);
  useEffect(() => {
    resourcesApiRef.current = resourcesApi;
  }, [resourcesApi]);

  // --- The drafting queue (AC25-AC28, AC52). Also runs for the hook's whole
  // lifetime, independently of the extraction loop - Next.js serializes
  // client-dispatched Server Functions anyway, so the two interleave rather
  // than truly overlap, and replies can appear while the user is still
  // scrolling. ---
  const [drafting, setDrafting] = useState(false);

  // Extracted to discussion-draft-loop.ts's own `runDraftLoop` (imported
  // above as `runDraftLoopStep`, since this local binding keeps the same
  // name every existing call site below already uses - `void
  // runDraftLoop(epoch)`, referenced by useDiscussionLoopStarter.ts's own
  // deps array). Deps here are exactly the refs/mutators/action the loop
  // closed over before the split; the deps array stays [pushNotice,
  // waitForWake] - unchanged from before, since every ref and setState
  // identity below is already stable across renders, the same reasoning
  // runExtractionLoop's own useCallback above already relies on.
  const runDraftLoop = useCallback(
    (epoch: number) =>
      runDraftLoopStep(epoch, {
        loopsActiveRef,
        loopEpochRef,
        draftQueueRef,
        setDraftQueueSize,
        setDrafting,
        waitForWake,
        rowsApiRef,
        resourcesApiRef,
        audienceRef,
        courseNameRef,
        compositionRef,
        knowledgeContextRef,
        pushNotice,
        draftAction: draftDiscussionRepliesAction,
      }),
    [pushNotice, waitForWake, loopsActiveRef, loopEpochRef, knowledgeContextRef]
  );

  // --- Starts (and pauses/resumes) the shared wake ticker - see
  // useDiscussionLoopStarter.ts's own header for the full account of the
  // start gate and the idle pause/resume rule. ---
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

  // --- Session actions. All read fresh state through the refs above and
  // keep a stable identity across renders (useCallback with [] deps), which
  // also satisfies set D's React.memo row requirement for editReply. ---
  const start = useCallback(async () => {
    // Log collection: `startedAt` is the first Start this page load, never
    // overwritten by a later one (the functional updater keeps whatever is
    // already set) - a returning instructor asking "when did this begin"
    // means the whole session, not just its latest leg. `endedAt` clears
    // back to "" so a run currently capturing does not still claim an end
    // time from an earlier Stop.
    setLogStartedAt((prev) => prev || new Date().toISOString());
    setLogEndedAt("");
    // "Activate this recording from the Knowledge base" - the one-shot TAKE
    // and the taken-vs-current DECISION both already happened, live, in
    // useDiscussionKnowledgeContext.ts's own launch listener (see that
    // file's header) - by the time Start is clicked, `knowledgeContextRef`
    // already holds whatever this run should use (or null, if nothing was
    // ever launched, or the ordinary case of a Start with no new launch
    // since the last one).
    //
    // What MUST stay here is only the persisted-LABEL write (never the page
    // text - see useDiscussionKnowledgeContext.ts's own header on why only
    // a label is persisted at all). This is a correctness boundary, not a
    // style choice: writing the label at launch time instead - i.e. the
    // moment a "Start recording" button is clicked in the Knowledge base,
    // before this Start is ever pressed - would let a launch that is never
    // followed by a real capture still leave a label behind. A later reload
    // with this table's rows restored from that same (never-captured)
    // session would then wrongly tell the instructor "earlier replies here
    // used Knowledge Base context", when no reply was ever drafted under it.
    // Gating the write on THIS click, reading whatever context is currently
    // held, keeps the label meaning what it says: replies drafted from this
    // point on use this context. `if (knowledgeContextRef.current)` mirrors
    // the old `if (taken)` guard's intent - nothing to persist when there is
    // nothing held - it is simply evaluated at Start time now rather than at
    // take time, since the take itself no longer happens here.
    if (knowledgeContextRef.current) {
      writeLocalStorage(
        "ta-rec-disc-kb-context-label",
        knowledgeContextLabelFor(knowledgeContextRef.current) ?? "Knowledge Base pages"
      );
      // AC3/4d: from this point on, an edit (CarriedKnowledgePages.tsx's
      // removal/undo, via the wrapped setKnowledgeContext above) must
      // rewrite this same key - see that wrapper's own comment.
      hasWrittenKbLabelRef.current = true;
    }
    try {
      await captureRef.current.start({ saveVideo: saveVideoRef.current });
    } catch (err) {
      // AC5: a cancelled picker (NotAllowedError) is swallowed inside C1's
      // own start() and never reaches here as a rejection - this branch is
      // only real capture-start failures.
      pushNotice(`Could not start the screen capture: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }, [pushNotice, knowledgeContextRef]);

  const stop = useCallback(() => {
    setLogEndedAt(new Date().toISOString());
    captureRef.current.stop();
  }, []);

  const moveRow = useCallback((id: string, dir: "up" | "down") => {
    rowsApiRef.current.moveRow(id, dir);
  }, []);

  const editReply = useCallback((id: string, text: string) => {
    rowsApiRef.current.editReply(id, text);
  }, []);

  const removeRow = useCallback((id: string) => {
    rowsApiRef.current.removeRow(id);
  }, []);

  // D1/D9: plain row mutators, forwarded the same way editReply/removeRow
  // above are - see discussion-serialization.ts's own doc comment on
  // handledAt/skipped for why these are now real ReplyRow fields rather than
  // the side channel an earlier wave was forced into.
  const setHandledAt = useCallback((id: string, at: number | null) => {
    rowsApiRef.current.setHandledAt(id, at);
  }, []);

  const setSkipped = useCallback((id: string, skipped: boolean) => {
    rowsApiRef.current.setSkipped(id, skipped);
  }, []);

  // R10: a plain row mutator, forwarded the same way editReply/removeRow
  // above are - no queue involvement, so it goes straight to C2 rather than
  // through resourcesApi.
  const removeResource = useCallback((id: string, url: string) => {
    rowsApiRef.current.removeResource(id, url);
  }, []);

  // Resource-controls feature: one-click insert. A MOVE, not a copy - see
  // UseDiscussionRepliesReturn.insertResource's own doc comment
  // (discussion-draft-loop.ts) for why: appendResourceToReply (a pure,
  // tested leaf) computes the next reply text, `editReply` writes it (the
  // same C2 mutator every hand-typed keystroke already goes through, so
  // this row picks up `userEdited: true` exactly like manual text would -
  // an inserted link is protected the same way as anything else the
  // instructor put in the box), and `removeResource` (R10's existing
  // mutator, already bumping resourceSeq to guard an in-flight re-search)
  // removes it from the suggestion list - so the SAME resource's Insert
  // control unmounts with it and a second click on it is structurally
  // impossible WITHIN one render of the list, not merely discouraged. Reads
  // `rawRows`, never the filtered `rows`, mirroring every other single-row
  // lookup in this file's own B3/B5 discipline. A no-op when the row is gone.
  //
  // FIX 2 (review pass): the per-list guard above does not cover a resource
  // pass running AGAIN (retry / redraft / per-row search) and returning the
  // same URL - `applyResources` replaces the row's list wholesale, so that
  // URL remounts as a "new" entry and Insert becomes clickable on it again.
  // `replyAlreadyHasResource` guards THAT case by checking the live reply
  // text for the URL immediately before appending - see its own doc comment
  // (discussion-reply-insert.ts) for why that beats a separate "already
  // inserted" list. The suggestion is still removed from the row's list
  // either way, matching the existing one-click-dismisses-it behaviour.
  const insertResource = useCallback((id: string, resource: ReplyResource) => {
    const row = rowsApiRef.current.rawRows.find((r) => r.id === id);
    if (!row) return;
    if (!replyAlreadyHasResource(row.reply, resource)) {
      const nextReply = appendResourceToReply(row.reply, resource);
      rowsApiRef.current.editReply(id, nextReply);
    }
    rowsApiRef.current.removeResource(id, resource.url);
  }, []);

  const retryRow = useCallback(
    (id: string) => {
      // S1: force wins here - Retry is a targeted, single-row explicit user
      // action on a row already showing "Failed", and AC52's userEdited
      // guard exists to stop an AUTOMATIC dispatch from clobbering hand-typed
      // text, not to make this row's own retry button a permanent dead end.
      // Without this, a row left `failed` by a "Redraft every reply" that
      // itself failed (S7 correctly keeps `userEdited: true` on that row,
      // since the instructor's own text is still sitting in `reply` -
      // neither markDrafting nor markFailed ever writes to it) could never
      // be dispatched again by any action. See draftDispatchForce for the
      // full policy across all four dispatch sites.
      // Log collection: a row's final drafted/failed state never carries
      // "this was retried" on its own - recorded here as its own event so
      // the log can answer that question.
      setLogRetries((prev) => [...prev, { at: new Date().toISOString(), rowId: id }]);
      enqueueDrafts([id], draftDispatchForce("retry"));
    },
    [enqueueDrafts]
  );

  const draftAllPending = useCallback(() => {
    // B2 fix: `rawRows`, not `rows` - F12's whole-table list, and unlike
    // Copy/Find resources this button carries no count that could disclose
    // a narrowed scope. D9: isDraftAllPendingEligible also excludes a
    // skipped row - it opted out of the reply workflow this dispatches into.
    const ids = rowsApiRef.current.rawRows.filter(isDraftAllPendingEligible).map((r) => r.id);
    // S1: deliberately NOT forced - this is a BULK, un-targeted action across
    // every pending/failed row at once, and AC52's protection is exactly for
    // this case: a click meant for other rows must not silently overwrite
    // one instructor's hand-typed text on the one row among them that is
    // both failed and user-edited. Retry remains that row's own escape
    // hatch.
    enqueueDrafts(ids, draftDispatchForce("draftMissing"));
  }, [enqueueDrafts]);

  const redraftAll = useCallback(() => {
    // AC45: redraftAll is a structural, destructive rewrite of every row's
    // reply, so it bumps the table epoch the same way clearTable does.
    rowsApiRef.current.tableEpochRef.current += 1;
    // B1 fix - REGRESSION entry 258's class, hit a third time: `rawRows`,
    // not `rows`. The confirmation names "every reply in the table" and
    // stays armed through a filter change (F11); dispatch must match that.
    // D9: isRedraftAllEligible excludes a skipped row from that count too.
    const ids = rowsApiRef.current.rawRows.filter(isRedraftAllEligible).map((r) => r.id);
    // AC29: forced - this action is explicitly armed (a confirm step) and
    // allowed to overwrite hand-edited replies, because the user asked for
    // exactly that.
    enqueueDrafts(ids, draftDispatchForce("redraftAll"));
  }, [enqueueDrafts]);

  const clearTable = useCallback(() => {
    rowsApiRef.current.clearTable();
    // AC31: the saved-recording object URL is revoked when the table is
    // deleted, alongside session start and unmount.
    captureRef.current.clearRecording();
    // "Activate this recording from the Knowledge base": deleting the table
    // ends that table's "life" (useDiscussionKnowledgeContext.ts's own
    // header) - a brand new table started after this must not silently
    // inherit a stale context from the one just deleted. Calls the RAW
    // setter (setKnowledgeContextState), not the wrapped setKnowledgeContext
    // above - this line already writes the persisted label itself, so
    // routing through the wrapper too would just write the same "" twice.
    // AC3/4d: hasWrittenKbLabelRef resets alongside it - a brand new table's
    // life has no label to rewrite yet, exactly like a table that never had
    // Start clicked at all.
    setKnowledgeContextState(null);
    writeLocalStorage("ta-rec-disc-kb-context-label", "");
    hasWrittenKbLabelRef.current = false;
  }, [setKnowledgeContextState]);

  // --- docs/DEV_LOOP.md's downloadable-log rule: assembly is entirely
  // useDiscussionRepliesRunLog.ts's own memo - this file only gathers the
  // inputs and calls it. `rawRows`, never the filtered `rows` - F0-2/F11's
  // rule applies here exactly as it does to every other whole-table read in
  // this file. ---
  const runLog = useDiscussionRepliesRunLog({
    logStartedAt,
    logEndedAt,
    audience,
    courseId,
    courses,
    composition,
    logFramesCaptured,
    droppedFrames: capture.droppedFrames,
    stalled: capture.stalled,
    logBatches,
    logAllNotices,
    logRetries,
    rawRows: rowsApi.rawRows,
  });

  return {
    audience,
    setAudience,
    courseId,
    setCourseId,
    courses,
    coursesLoading,
    coursesError,

    saveVideo,
    setSaveVideo,
    recordingUrl: capture.recordingUrl,
    recordingBytes: capture.recordingBytes,

    composition,
    setComposition,
    resourceKinds,
    setResourceKinds,
    videoLengthMinMinutes,
    videoLengthMaxMinutes,
    setVideoLengthPreference,

    knowledgeContextLabel,
    knowledgeContext,
    setKnowledgeContext,

    capturing: capture.capturing,
    elapsedSec: capture.elapsedSec,
    pendingFrames: capture.pendingFrames,
    droppedFrames: capture.droppedFrames,
    extracting,
    stalled: capture.stalled,
    notices,
    dismissNotice,
    previewRef: capture.previewRef,
    start,
    stop,

    rows: rowsApi.rows,
    sort: rowsApi.sort,
    setSort: rowsApi.setSort,
    filterText: rowsApi.filterText,
    setFilterText: rowsApi.setFilterText,
    // F0-2/F11: the UNFILTERED row count, and it is not a convenience. `rows`
    // above is filtered for display, so eleven sites must read this instead of
    // `rows.length` - every count, every progress string, all five empty
    // states, and BOTH destructive arming signatures. If an arming signature
    // read the filtered count, typing in the search box while `Delete table`
    // is armed would silently re-arm it against a different number and the
    // confirmation would name a count that does not match what it deletes.
    // That is REGRESSION entry 258, which this feature has already hit twice.
    // Do not "simplify" this away as a duplicate of `rows.length`.
    totalCount: rowsApi.totalCount,
    rawRows: rowsApi.rawRows,
    moveRow,
    editReply,
    removeRow,
    setHandledAt,
    setSkipped,
    retryRow,
    draftAllPending,
    redraftAll,
    clearTable,
    drafting,

    resourceQueueSize: resourcesApi.resourceQueueSize,
    findMissing: resourcesApi.findMissing,
    retryResources: resourcesApi.retryResources,
    removeResource,
    searchRow: resourcesApi.searchRow,
    insertResource,

    runLog,
  };
}
