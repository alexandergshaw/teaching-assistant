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
// (AC25-AC28, AC52); draftAllPending / retryRow / redraftAll; the three
// simple persisted controls (audience, courseId, saveVideo) and their
// ta-rec-disc-audience / ta-rec-disc-course / ta-rec-disc-save-video keys;
// lazy course loading (AC30, AC30a, AC37, AC46); the notices list (AC38) and
// the session-summary inputs (AC7b) - the summary sentence itself is D's
// rendering job, built from `rows` (state tallies) and `elapsedSec` (frozen
// at stop by C1), both already in the sealed return below.
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EXTRACT_BATCH_WIRE_BUDGET,
  draftDispatchForce,
  shouldLoopContinue,
  shouldTickerRun,
} from "./discussion-capture";
import { startFrameTicker, type FrameTicker } from "@/lib/frame-ticker";
import { useDiscussionCapture } from "./useDiscussionCapture";
import { useReplyRows } from "./useReplyRows";
import { useReplyResources } from "./useReplyResources";
import {
  extractDiscussionPostsAction,
  draftDiscussionRepliesAction,
} from "@/app/actions/discussion-replies";
import { listCourseHubAction } from "@/app/actions/course-hub-core";
import { getStoredProvider } from "@/lib/llm-provider";
import {
  EXTRACT_BATCH_SIZE,
  normalizeAudience,
  type DiscussionAudience,
  type ReplyCompositionSettings,
} from "@/lib/discussion-reply-prompt";
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
  readLocalStorage,
  writeLocalStorage,
  coerceReplyComposition,
  LOOP_IDLE_POLL_MS,
  type UseDiscussionRepliesReturn,
  type DraftQueueItem,
} from "./discussion-draft-loop";
// docs/DEV_LOOP.md's "every feature needs a downloadable log" rule
// (REGRESSION entries 369/372/373/374 record this surface's unpaid debt).
// COLLECTION lives here (the three event-stream refs and the timestamps
// below); ASSEMBLY (turning that plus `rawRows` into a full
// DiscussionRepliesRunLog, and formatting it) is entirely in
// discussion-replies-log.ts - see that file's header for the full split and
// for why parent resolution is a call to the SAME `resolveDraftParent` the
// drafting loop itself uses, never a second copy.
import {
  buildDiscussionRepliesRunLog,
  makeDiscussionRepliesLogBatch,
  type DiscussionRepliesLogBatch,
  type DiscussionRepliesLogRetry,
  type DiscussionRepliesRunLog,
} from "./discussion-replies-log";
// The notices system (AC38): a capped, deduped list plus the log mirror
// docs/DEV_LOOP.md's downloadable-log rule needs, and the forwarding of C1's
// recorder/frame-encode notices and C2's persist-error into the same
// channel. Split out purely to stay under recording-split.structure.test.ts's
// 1000-line ceiling on this directory - see that file's own header.
import { useDiscussionNotices } from "./useDiscussionNotices";

export type { UseDiscussionRepliesReturn } from "./discussion-draft-loop";

export function useDiscussionReplies(active: boolean): UseDiscussionRepliesReturn {
  // --- The three simple persisted controls (AC20). Keys are whole string
  // literals throughout this file - AC55 forbids a template literal, since
  // the canary derives its key set with a regex over the literal source. ---
  const [audience, setAudienceState] = useState<DiscussionAudience>(() =>
    normalizeAudience(readLocalStorage("ta-rec-disc-audience"))
  );
  const setAudience = useCallback((a: DiscussionAudience) => {
    setAudienceState(a);
    writeLocalStorage("ta-rec-disc-audience", a);
  }, []);

  const [courseId, setCourseIdState] = useState<string>(
    () => readLocalStorage("ta-rec-disc-course") ?? ""
  );
  const setCourseId = useCallback((id: string) => {
    setCourseIdState(id);
    writeLocalStorage("ta-rec-disc-course", id);
  }, []);

  const [saveVideo, setSaveVideoState] = useState<boolean>(
    () => readLocalStorage("ta-rec-disc-save-video") === "1"
  );
  const setSaveVideo = useCallback((v: boolean) => {
    setSaveVideoState(v);
    writeLocalStorage("ta-rec-disc-save-video", v ? "1" : "0");
  }, []);

  // --- docs/reply-composition-controls-acceptance-criteria.md C5/JOB1: the
  // three reply-composition controls (ingredients, address-by-name,
  // formality), stored as one ReplyCompositionSettings object in React state
  // but persisted as THREE SEPARATE keys - ta-rec-disc-ingredients (JSON
  // array), ta-rec-disc-address-name ("1"/"0"), ta-rec-disc-formality (the
  // literal stop name) - the same readLocalStorage/writeLocalStorage +
  // useState-initializer + wrapped-setter idiom as audience/courseId/
  // saveVideo above. Coercion is `coerceReplyComposition`
  // (discussion-draft-loop.ts), a plain exported function per C5a - never
  // inline here, since vitest renders no hook in this repo. ---
  const [composition, setCompositionState] = useState<ReplyCompositionSettings>(() =>
    coerceReplyComposition(
      readLocalStorage("ta-rec-disc-ingredients"),
      readLocalStorage("ta-rec-disc-address-name"),
      readLocalStorage("ta-rec-disc-formality")
    )
  );
  const setComposition = useCallback((next: ReplyCompositionSettings) => {
    setCompositionState(next);
    writeLocalStorage("ta-rec-disc-ingredients", JSON.stringify(next.ingredients));
    writeLocalStorage("ta-rec-disc-address-name", next.addressByName ? "1" : "0");
    writeLocalStorage("ta-rec-disc-formality", next.formality);
  }, []);

  // --- Lazy course list (AC30, AC30a, AC37, AC46). Gated on `active`,
  // latched so it fires at most once for the hook's whole lifetime even
  // though the panel is never unmounted on a tab switch. Deliberately NOT
  // filtered on a Canvas URL (AC30) - this feature never posts anywhere. ---
  const [courses, setCourses] = useState<Array<{ id: string; name: string }> | null>(null);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const hasActivatedRef = useRef(false);

  // LATCH CLASS (see NEW-1's wake-ticker cleanup effect below for the
  // canonical writeup of the same rule): every "already did this once" ref
  // in these hooks must either be reset in the cleanup of the SAME effect
  // that sets it, or be resilient to a cancelled run - never a plain
  // `if (ref.current) return; ref.current = true;` with no way back. This
  // effect used to set `hasActivatedRef.current = true` synchronously before
  // the fetch even started, so a run that was cancelled before it settled
  // (React StrictMode's simulated mount/cleanup/remount; a returning user
  // who lands on this view on first render) still permanently latched
  // "activated" - the remount's guard then bailed out before ever starting a
  // real fetch, leaving `coursesLoading` stuck `true` and `courses` stuck
  // `null` for the session. A cancelled fetch must not count as having
  // happened: the latch is set only once the fetch actually SETTLES
  // (resolved or errored) while its own run is still the live one, inside
  // the `finally` below - never on entry.
  useEffect(() => {
    if (!active || hasActivatedRef.current) return;
    let cancelled = false;
    setCoursesLoading(true);
    (async () => {
      try {
        const result = await listCourseHubAction();
        if (cancelled) return;
        if ("error" in result) {
          setCoursesError(result.error);
          setCourses([]);
        } else {
          setCourses(result.courses.map((c) => ({ id: c.id, name: c.name })));
          setCoursesError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setCoursesError(err instanceof Error ? err.message : "Could not load your courses.");
          setCourses([]);
        }
      } finally {
        if (!cancelled) {
          hasActivatedRef.current = true;
          setCoursesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

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
  // runs during render), and the `runLog` memo below needs every one of
  // these values to build its input. Each is appended to with a functional
  // updater at the moment its event happens, the same pattern
  // `setDraftQueueSize`/`setExtracting` already use from inside these same
  // async loops. See discussion-replies-log.ts's header for why this
  // collection lives here and formatting/assembly does not. `logAllNotices`
  // itself now comes from useDiscussionNotices.ts above, not a local
  // useState - see that hook's own header. ---
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

  const courseNameRef = useRef("");
  useEffect(() => {
    const match = courses?.find((c) => c.id === courseId);
    courseNameRef.current = match ? match.name : "";
  }, [courses, courseId]);

  // --- Mounted / loop-running latch. Doubles as AC43's isRunningRef (both
  // loops check it at the top of every iteration and stop draining once it
  // flips) and AC50's mountedRef (guards every post-await setState). ---
  const loopsActiveRef = useRef(true);
  useEffect(() => {
    loopsActiveRef.current = true;
    return () => {
      loopsActiveRef.current = false;
    };
  }, []);

  // --- BL1: the idle-wait source for both consumer loops below. A chained
  // main-thread `setTimeout` (the previous `delay()` helper) accumulates
  // timer nesting past Chromium's spec-compliant limit within ~2 seconds and
  // lands permanently on the intensively-throttleable timer queue: clamped
  // to ~1/s while this tab is hidden, ~1/min after five minutes hidden. That
  // is exactly this feature's whole useful life - the user is looking at
  // their LMS in another window - and it is the same throttling AC8 already
  // moved the frame-SAMPLING ticker off of. The two DRAINING loops
  // (extraction, drafting) were left on it: the sampler kept minting frames
  // at full rate while consumption collapsed, so the pending queue (16
  // frames) fills in ~19 seconds of scrolling and everything after that is
  // silently dropped for minutes at a time.
  //
  // Fixed the same way: a second Worker-backed ticker (frame-ticker.ts's
  // startFrameTicker - a worker's own postMessage hop is NOT on Chromium's
  // throttleable queue, unlike a chained setTimeout) whose tick resolves
  // every pending "wake" promise. Both loops `await waitForWake()` instead
  // of `await delay(...)` on their idle paths.
  const wakeResolversRef = useRef<Set<() => void>>(new Set());
  const wakeTickerRef = useRef<FrameTicker | null>(null);

  // NEW-1: the "have the loops been started at all, for the hook's whole
  // mount-to-unmount lifetime" latch, and the generation counter that keeps a
  // React StrictMode-orphaned pair of loop instances from running forever
  // alongside a freshly-started pair. Declared here (ahead of both loops and
  // the two effects below that touch them) so every reader of those effects
  // can see both refs' full lifecycle in one place - see the effect below
  // this block for why a plain boolean latch alone is not enough.
  const loopsStartedRef = useRef(false);
  const loopEpochRef = useRef(0);

  const waitForWake = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      wakeResolversRef.current.add(resolve);
    });
  }, []);

  const flushWakeResolvers = useCallback(() => {
    const resolvers = wakeResolversRef.current;
    wakeResolversRef.current = new Set();
    resolvers.forEach((resolve) => resolve());
  }, []);

  // NEW-1 (BLOCKER, fixed here): this effect's cleanup is the ONE place that
  // tears the wake mechanism down, and it now undoes everything the loop-
  // start effect below latches - that symmetry is the actual fix. Before this
  // change, nothing ever reset `loopsStartedRef`, so on any first mount where
  // the loop-start condition already held (the ordinary returning-user case:
  // a persisted table with rows, or `ta-rec-view` restored to "discussions"),
  // React StrictMode's simulated destroy-then-create ran this cleanup
  // (stopping and nulling the ticker) and then the loop-start effect's setup
  // again - which returned early on the still-latched ref and never recreated
  // the ticker. Both consumer loops then suspended on a `waitForWake()`
  // promise nothing could ever resolve again: frames piled up to
  // MAX_PENDING_FRAMES and nothing was ever extracted or drafted, for the
  // whole `next dev` session, with every gate green.
  //
  // Resetting `loopsStartedRef.current = false` here lets the loop-start
  // effect's next run actually restart things - but a reset guard alone is
  // NOT sufficient, because `loopsActiveRef` (this component's OTHER "am I
  // still mounted" ref) flips false-then-true-again fully SYNCHRONOUSLY
  // across StrictMode's cleanup-then-remount (no microtask yields occur in
  // between: React runs every effect's cleanup, then every effect's setup,
  // all inside one synchronous pass). By the time a loop suspended in this
  // cleanup's `flushWakeResolvers()` call actually resumes (a microtask,
  // scheduled only after that whole synchronous pass finishes), the OLD
  // loop's own `while (loopsActiveRef.current)` check would see `true` again
  // - set by the remount, not by anything telling it "you are the stale
  // instance" - and it would keep running side by side with the NEW pair the
  // remount just started, doing the same work twice for the rest of the
  // session. `loopEpochRef` is what actually distinguishes them: the
  // loop-start effect bumps it every time it really starts a pair of loops,
  // each loop instance captures the value it saw at its own start, and its
  // `while` condition re-checks that captured value on every wake - so the
  // orphaned pass-1 instance's stale epoch stops matching the moment the
  // pass-2 instance bumps it, and pass-1 exits cleanly instead of running
  // forever alongside pass-2.
  //
  // A REAL unmount (production, or the user navigating away) does not hit
  // this ambiguity: `loopsActiveRef` is already false by the time this
  // cleanup runs (its own effect, declared earlier above and therefore
  // cleaned up AFTER this one, on the same real unmount) and there is no
  // remount to bump the epoch back up, so the woken loop's very first re-
  // check of `loopsActiveRef.current` is `false` and it exits for good -
  // unchanged from AC48-AC51's existing guarantee.
  useEffect(() => {
    return () => {
      loopsStartedRef.current = false;
      wakeTickerRef.current?.stop();
      wakeTickerRef.current = null;
      flushWakeResolvers();
    };
  }, [flushWakeResolvers]);

  // --- Shared drafting queue, declared here (ahead of both loops) so
  // runExtractionLoop's deps array below can reference enqueueDrafts without
  // a temporal-dead-zone violation - a useCallback deps array is evaluated
  // during render, in declaration order, unlike a function body's internal
  // references which only resolve when the closure is later invoked. ---
  const draftQueueRef = useRef<DraftQueueItem[]>([]);
  // NEW-2: mirrored into React state purely so the ticker-idle effect below
  // can see "there is now something queued to draft" - a bare ref, like
  // `draftQueueRef` itself, never triggers a re-render. Kept in sync at both
  // ends: bumped here on enqueue, and again in runDraftLoop right after a
  // batch is spliced off the front.
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
  }, [pushNotice, enqueueDrafts, waitForWake]);

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
  // runDraftLoop(epoch)` in the loop-start effect, and `runDraftLoop` in
  // that effect's deps array). Deps here are exactly the refs/mutators/
  // action the loop closed over before the split; the deps array stays
  // [pushNotice, waitForWake] - unchanged from before, since every ref and
  // setState identity below is already stable across renders, the same
  // reasoning runExtractionLoop's own useCallback above already relies on.
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
        pushNotice,
        draftAction: draftDiscussionRepliesAction,
      }),
    [pushNotice, waitForWake]
  );

  // --- NEW-2: whether either loop has anything to wake up FOR, right now.
  // Computed in render (not derived only inside an effect) so both effects
  // below can read the exact same, already-current value - the loop-start
  // effect needs it to decide whether the ticker it is about to create
  // should be immediately paused again, and the idle effect after it needs
  // it to react to every later change.
  //
  // Deliberately does NOT include `rowsApi.rawRows.length > 0` - having a
  // persisted table sitting there is why the loops were STARTED at all (so
  // Retry/redraft can resume against it), but it says nothing about whether
  // either loop has anything to do RIGHT NOW. Enqueuing a draft (retryRow,
  // draftAllPending, redraftAll, or the extraction loop's own post-merge
  // enqueue) bumps `draftQueueSize`, which is exactly what flips `hasWork`
  // back to true and restarts the ticker - the loop that queued itself
  // asleep on `waitForWake()` while idle wakes on the very next tick.
  const hasWork = shouldTickerRun({
    capturing: capture.capturing,
    pendingFrames: capture.pendingFrames,
    extracting,
    drafting,
    draftQueueSize,
  });

  // --- S8/AC37: start both loops (and the wake ticker that drives their
  // idle waits) at most ONCE, for the hook's whole mount-to-unmount
  // lifetime - never restarted, so this does not reopen AC43's "no effect
  // keyed on `rows`" rule. But AC37 requires "the panel does no work at all
  // when it has never been opened and no persisted table exists", and a
  // `[]`-deps effect starts unconditionally on first mount of every page
  // load, since this panel is kept mounted at all times (AC3). So START is
  // gated on whichever of these becomes true FIRST: a capture is running, a
  // persisted table already has rows (AC37's own exception - drafting must
  // still be able to resume for it), or the panel has ever been activated
  // (`hasActivatedRef`, set by the course-loading effect above). This is
  // deliberately NOT gated on `active` itself (AC46 must hold: `active`
  // reaches only the lazy course fetch) as the loops' own condition - but
  // NEW-3: `active` still belongs in this effect's deps below, because
  // flipping `active` true is what makes the course-loading effect above
  // (declared earlier, so it runs first within the same commit) start
  // fetching at all, and a first-ever capture on a panel that had never
  // previously been activated would otherwise depend entirely on
  // `capture.capturing` flipping - which cannot happen before the loops (and
  // therefore `capture.start()`'s own downstream effects) exist to begin
  // with. `active` itself is read nowhere in the body below; it is a
  // trigger, not a condition. Do not remove it as "unused" - see AC46 in the
  // acceptance criteria for the full account of why this is one
  // active-reaching site, not the only one.
  //
  // `coursesLoading` is ALSO in this effect's deps, and it is the one that
  // actually observes `hasActivatedRef.current`'s freshly-set value now.
  // Since the latch-class fix above (see the course-loading effect's own
  // comment), `hasActivatedRef.current` no longer flips synchronously in the
  // same commit `active` becomes true - it flips later, asynchronously,
  // inside that effect's `finally`, once the fetch actually settles. That
  // `finally` also flips `coursesLoading` false in the same synchronous
  // stretch, so it is the dependency that carries the ref's new value into a
  // re-run of THIS effect; without it, a panel opened with zero persisted
  // rows and no capture running would never see `hasActivatedRef.current`
  // become true through any dependency change, and the idle loops (and
  // AC37's exception for them) would never start until the user did
  // something else that happened to touch `capture.capturing` or
  // `rowsApi.rawRows.length`.
  //
  // S5 fix: this gate reads `rawRows.length`, not the filtered `rows.length`
  // - a returning user with a persisted filter matching nothing must not
  // have loop start silently fall through to `hasActivatedRef`/`capturing`
  // (F0-2 forbids the filter changing anything but what is visible). ---
  useEffect(() => {
    if (loopsStartedRef.current) return;
    if (!(capture.capturing || rowsApi.rawRows.length > 0 || hasActivatedRef.current)) return;
    loopsStartedRef.current = true;
    // NEW-1: bump the epoch BEFORE starting the loops, and capture the
    // resulting value locally to hand to both - see the wake-ticker cleanup
    // effect above for what this guards against.
    const epoch = ++loopEpochRef.current;
    wakeTickerRef.current = startFrameTicker(1000 / LOOP_IDLE_POLL_MS, flushWakeResolvers);
    void runExtractionLoop(epoch);
    void runDraftLoop(epoch);
    // NEW-2: `hasWork` above was computed in THIS SAME render, so it is
    // exactly as current as any other value this effect closes over. A
    // resumed session (persisted rows, nothing actually drafting or
    // capturing yet) starts the loops but has nothing for them to wake up
    // for - stop the ticker immediately rather than waiting for some LATER
    // change to `hasWork` that may not come for a while, or ever, before the
    // user does anything. The idle effect right below keeps this in sync for
    // every subsequent change.
    if (!hasWork) {
      wakeTickerRef.current.stop();
      wakeTickerRef.current = null;
    }
  }, [
    active,
    coursesLoading,
    capture.capturing,
    rowsApi.rawRows.length,
    flushWakeResolvers,
    runExtractionLoop,
    runDraftLoop,
    hasWork,
  ]);

  // --- NEW-2: once started, the wake ticker used to run for the rest of the
  // page's life - a dedicated Worker posting to the main thread and running
  // two loop iterations roughly 3.3 times a second, forever, on a panel that
  // is never unmounted (AC3), even with no capture running, an empty pending-
  // frame queue and an empty draft queue. This effect pauses and resumes the
  // SAME ticker the effect above created, tied to `hasWork` - it never
  // creates the FIRST ticker (that stays the loop-start effect's job, so
  // NEW-1's symmetric start/stop ownership is untouched) and never needs its
  // own cleanup: the wake-ticker cleanup effect above is the sole final
  // backstop on unmount, and `wakeTickerRef.current = null` after every stop
  // here makes a second, redundant stop from that backstop a safe no-op.
  useEffect(() => {
    if (!loopsStartedRef.current) return;
    if (hasWork) {
      if (!wakeTickerRef.current) {
        wakeTickerRef.current = startFrameTicker(1000 / LOOP_IDLE_POLL_MS, flushWakeResolvers);
      }
    } else if (wakeTickerRef.current) {
      wakeTickerRef.current.stop();
      wakeTickerRef.current = null;
    }
  }, [hasWork, flushWakeResolvers]);

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
    try {
      await captureRef.current.start({ saveVideo: saveVideoRef.current });
    } catch (err) {
      // AC5: a cancelled picker (NotAllowedError) is swallowed inside C1's
      // own start() and never reaches here as a rejection - this branch is
      // only real capture-start failures.
      pushNotice(`Could not start the screen capture: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }, [pushNotice]);

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

  // R10: a plain row mutator, forwarded the same way editReply/removeRow
  // above are - no queue involvement, so it goes straight to C2 rather than
  // through resourcesApi.
  const removeResource = useCallback((id: string, url: string) => {
    rowsApiRef.current.removeResource(id, url);
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
    // a narrowed scope.
    const ids = rowsApiRef.current.rawRows
      .filter((r) => r.state === "pending" || r.state === "failed")
      .map((r) => r.id);
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
    const ids = rowsApiRef.current.rawRows.map((r) => r.id);
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
  }, []);

  // --- docs/DEV_LOOP.md's downloadable-log rule: assembly. `courseName` is
  // read the same way `courseNameRef` derives it (courses.find by id) rather
  // than through that ref, so this memo's own dependency array can name the
  // real reactive inputs (`courses`, `courseId`) instead of a ref whose
  // writes React cannot see. `rawRows`, never the filtered `rows` - F0-2/F11's
  // rule applies here exactly as it does to every other whole-table read in
  // this file: a search-box keystroke must never make the downloaded log
  // silently omit a row the instructor cannot currently see. Assembly itself
  // (turning this input plus `rawRows` into the full record, including the
  // per-row `resolveDraftParent` recompute) is entirely
  // discussion-replies-log.ts's `buildDiscussionRepliesRunLog` - this memo
  // only gathers the inputs and calls it. ---
  const runLog: DiscussionRepliesRunLog = useMemo(() => {
    const courseName = courses?.find((c) => c.id === courseId)?.name ?? "";
    return buildDiscussionRepliesRunLog(
      {
        startedAt: logStartedAt,
        endedAt: logEndedAt,
        audience,
        courseName,
        ingredients: composition.ingredients,
        addressByName: composition.addressByName,
        formality: composition.formality,
        framesCaptured: logFramesCaptured,
        droppedFrames: capture.droppedFrames,
        stalled: capture.stalled,
        batches: logBatches,
        notices: logAllNotices,
        retries: logRetries,
      },
      rowsApi.rawRows
    );
  }, [
    logStartedAt,
    logEndedAt,
    audience,
    courseId,
    courses,
    composition,
    logFramesCaptured,
    capture.droppedFrames,
    capture.stalled,
    logBatches,
    logAllNotices,
    logRetries,
    rowsApi.rawRows,
  ]);

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
    retryRow,
    draftAllPending,
    redraftAll,
    clearTable,
    drafting,

    resourceQueueSize: resourcesApi.resourceQueueSize,
    findMissing: resourcesApi.findMissing,
    retryResources: resourcesApi.retryResources,
    removeResource,

    runLog,
  };
}
