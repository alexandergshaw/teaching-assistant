"use client";

// The resource-search queue (set R-D).
// docs/discussion-reply-resources-acceptance-criteria.md sections 0 and 4,
// R5-R7, R11. Owns the queue that drives `gatherReplyResourcesAction` and
// nothing else - it knows about rows only through `UseReplyRowsReturn`'s
// mutators, and knows about capture/extraction only through the three
// booleans the orchestrator (useDiscussionReplies.ts) hands it every render.
//
// R5: SELF-KICKING, not a third ticker-driven loop. The queue is fed by
// exactly three explicit events - a reply landing (R6), `Find resources`
// (R11), a per-row Retry - so `enqueueResources` kicks its own drain
// directly (`if (!inFlightRef.current) void drain();`) and the drain exits
// the moment the queue is empty. Do NOT add this hook as a fourth
// participant to useDiscussionReplies.ts's `shouldTickerRun`/wake-ticker
// machinery - that ticker exists because the extraction and drafting loops
// have an IDLE path (they `await waitForWake()` when there is nothing to
// do); this drain has no idle path to wake up from, by construction.
//
// R0-4: the drain YIELDS while the capture pipeline is busy. Next
// serializes client-dispatched Server Functions (see
// useDiscussionReplies.ts:499-502), so a resource request does not run
// ALONGSIDE extraction - it HOLDS THE SINGLE LANE. Extraction's pending
// queue fills in roughly 19 seconds of scrolling (MAX_PENDING_FRAMES),
// so holding the lane during a live capture drops frames silently. The
// drain therefore checks `isResourceLaneBusy` before every dispatch; when
// busy it exits without dispatching, and either the next `enqueueResources`
// call or the busy->false transition (watched below) restarts it.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { RESOURCE_BATCH_SIZE, type ReplyRow } from "./discussion-capture";
import type { UseReplyRowsReturn } from "./useReplyRows";
import { gatherReplyResourcesAction } from "@/app/actions/discussion-replies";
import { getStoredProvider } from "@/lib/llm-provider";
import type { LlmProvider } from "@/lib/llm";

// F1 fix note: `isResourceBatchFresh` used to be defined and exported from
// THIS file, with its own sabotage-checked test block - and nothing in
// production ever called it. The guard production actually ran was
// `resourcesUnchangedSince` in useReplyRows.ts, a separate untested `===`.
// Inverting that untested copy discarded every drafted reply's resources
// with the whole suite green. Fixed by consolidating into one
// implementation, owned by useReplyRows.ts (it owns `resourceSeqRef`, the
// state the comparison actually reads) and wired into
// `resourcesUnchangedSince` there - see that file for the pure function and
// its doc comment. This hook reaches it only through
// `rowsApi.resourcesUnchangedSince` below, exactly as before.

// ---------------------------------------------------------------------------
// Pure decision logic, extracted so it is unit-testable at all - vitest in
// this repo is node-env and renders no hook (see useReplyRows.ts's own
// header for the same discipline applied to C2, and discussion-capture.ts's
// shouldLoopContinue/shouldTickerRun for the drafting queue's version of
// this same pattern).
// ---------------------------------------------------------------------------

/** R0-4: the drain's capture-busy yield gate. `pendingFrames > 0` is
 * included alongside `capturing` because a capture can be stopped while
 * frames are still queued for extraction (AC51) - the serialized action
 * lane is still busy even though `capturing` has already flipped false. */
export function isResourceLaneBusy(args: {
  capturing: boolean;
  pendingFrames: number;
  extracting: boolean;
}): boolean {
  return args.capturing || args.pendingFrames > 0 || args.extracting;
}

/** R11: `Find resources`' bulk eligibility predicate. A row counts as
 * "never searched" whether `resourceState` was never set at all (a row
 * that never drafted, or that the user wrote by hand - R6's own
 * "reachable only through Find resources and per-row Retry" case) or was
 * persisted as the literal string `"idle"` (deserializeReplyTable's
 * defensive fallback for a present-but-unrecognised value, R3c) - R3c-i's
 * "absent is not invalid" distinction governs ROUND-TRIPPING, not this
 * eligibility question, so both count here. `"done"` (searched, whatever
 * the outcome - including a row the instructor emptied by hand, R11) and
 * `"searching"` are excluded; `"failed"` is reachable only through that
 * row's own Retry, mirroring AC28a's bulk-versus-targeted drafting policy. */
export function isFindMissingEligible(row: { resourceState?: ReplyRow["resourceState"]; reply: string }): boolean {
  const neverSearched = row.resourceState === undefined || row.resourceState === "idle";
  return neverSearched && row.reply.length > 0;
}

/** F8/R4e: whether a degraded batch result should be surfaced through the
 * per-batch notice channel. `gatherReplyResourcesAction`'s embedded-provider
 * short-circuit also sets `degraded: true` (it makes no network call and can
 * neither search nor verify a link), but R4e requires that SPECIFIC case not
 * go through this channel at all - a capability limit is not a failure, and
 * an embedded-provider user would otherwise see a failure notice on every
 * batch for the whole session. Surfaced instead as a standing hint
 * (DiscussionRepliesPanel.tsx, driven independently by useLlmProvider()).
 * `provider` is the exact value the drain already dispatched this batch
 * with, so this is precisely the condition that put the action on the R4e
 * branch. */
export function shouldPushDegradedNotice(degraded: boolean, provider: LlmProvider): boolean {
  return degraded && provider !== "embedded";
}

/** F9: the resource-queue progress line's wording. During a live capture the
 * drain deliberately YIELDS (R0-4) without dispatching, so "Finding
 * resources..." would sit there unchanging while nothing runs and read as a
 * stall - `laneBusy` (the panel's own `isResourceLaneBusy` check, over the
 * same three booleans the drain itself checks) picks a sentence that names
 * the wait instead. */
export function resourceQueueProgressText(queueSize: number, laneBusy: boolean): string {
  const plural = queueSize === 1 ? "y" : "ies";
  if (laneBusy) return `${queueSize} repl${plural} queued for resources - search resumes once the capture finishes.`;
  return `Finding resources for ${queueSize} more repl${plural}...`;
}

/** F5: partitions a resource batch's ids by whether each is still unchanged
 * since dispatch, using the caller-supplied `isUnchangedSince` predicate
 * (useReplyRows.ts's `resourceSeqRef`-backed check). Pure: takes the
 * predicate as a parameter rather than reaching into any ref itself -
 * mirrors discussion-capture.ts's `partitionDraftOutcome`, the drafting
 * queue's own version of this same shape.
 *
 * Exists because the resourceSeq guard rejecting a stale id (R7 - the
 * instructor removed a link while a re-search for that row was in flight)
 * used to leave that row's `resourceState` wedged at "searching" forever:
 * `markResourceSearching` sets every id in the batch to "searching" at
 * dispatch, and neither the whole-batch error path nor the per-id guard
 * check below moved a REJECTED id back out of it - only an id whose result
 * was actually applied, or explicitly marked failed, ever left "searching".
 * `changedMidFlight` is the set that needs resolving to a terminal state
 * even though no error occurred and no result was applied to it. */
export function partitionResourceOutcome(
  ids: ReadonlyArray<string>,
  isUnchangedSince: (id: string) => boolean
): { unchanged: string[]; changedMidFlight: string[] } {
  const unchanged: string[] = [];
  const changedMidFlight: string[] = [];
  for (const id of ids) {
    if (isUnchangedSince(id)) unchanged.push(id);
    else changedMidFlight.push(id);
  }
  return { unchanged, changedMidFlight };
}

/** F5: the per-row message left behind when a resourceSeq-guard-rejected id
 * is resolved to "failed" rather than left wedged at "searching" - reachable
 * only through Retry links (R7's guard is only ever hit via that entry
 * point - see the reviewer's own reachability trace), which is exactly the
 * affordance this message needs to leave live. */
const RESOURCE_DISCARDED_MESSAGE =
  "Discarded because these links changed while the search was running. Click Retry links to search again.";

// A message-only forward of R4/R4e's `degraded` flag, per section 8's
// wiring contract ("forward degraded as ONE notice per batch"). Covers
// both a real degraded grounded pass and R4e's embedded-provider
// short-circuit (which also returns `degraded: true`) - the orchestrator's
// own `pushNotice` already dedupes identical consecutive text, so a run of
// embedded-provider batches collapses to showing this once.
const RESOURCE_DEGRADED_NOTICE =
  "Some resource results could not be fully gathered for this batch and may be incomplete.";

export interface UseReplyResourcesReturn {
  resourceQueueSize: number;
  searchingResources: boolean;
  enqueueResources: (ids: string[]) => void;
  findMissing: () => void;
  retryResources: (id: string) => void;
}

export interface UseReplyResourcesArgs {
  rowsApi: UseReplyRowsReturn;
  capturing: boolean;
  pendingFrames: number;
  extracting: boolean;
  /** A stable ref (useRef never changes identity across renders) mirroring
   *  the currently-selected course name - read fresh via `.current` at
   *  dispatch time, the same way useDiscussionReplies.ts's own
   *  `courseNameRef` is read inside its two loops. */
  courseNameRef: MutableRefObject<string>;
  pushNotice: (text: string) => void;
}

export function useReplyResources(args: UseReplyResourcesArgs): UseReplyResourcesReturn {
  const argsRef = useRef(args);
  useEffect(() => {
    argsRef.current = args;
  }, [args]);

  // Mounted/loop-running latch - this hook's own version of
  // useDiscussionReplies.ts's `loopsActiveRef`. Nothing here suspends
  // across a StrictMode remount (the queue and inFlightRef are refs, not
  // React state carrying identity across an unmount/remount pair), so a
  // plain mounted flag checked after every await is sufficient - no epoch
  // counter is needed (R5's own note on why the epoch machinery does not
  // apply to this hook).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resourceQueueRef = useRef<string[]>([]);
  const [resourceQueueSize, setResourceQueueSize] = useState(0);
  const [searchingResources, setSearchingResources] = useState(false);
  const inFlightRef = useRef(false);
  const busyRef = useRef(false);

  const drain = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      while (mountedRef.current && resourceQueueRef.current.length > 0) {
        if (busyRef.current) break; // R0-4: yield without dispatching

        const ids = resourceQueueRef.current.splice(0, RESOURCE_BATCH_SIZE);
        setResourceQueueSize(resourceQueueRef.current.length);

        const rowsApi = argsRef.current.rowsApi;
        const currentRows = rowsApi.rows;
        const posts = ids
          .map((id) => currentRows.find((r) => r.id === id))
          .filter((r): r is ReplyRow => !!r)
          .map((r) => ({ id: r.id, text: r.post }));

        if (posts.length === 0) continue; // every id vanished from the table under us

        const postIds = posts.map((p) => p.id);
        rowsApi.markResourceSearching(postIds);
        setSearchingResources(true);
        const snapshot = rowsApi.snapshotResourceSeq(postIds);
        const provider = getStoredProvider();
        const courseName = argsRef.current.courseNameRef.current;

        let result: Awaited<ReturnType<typeof gatherReplyResourcesAction>>;
        try {
          result = await gatherReplyResourcesAction(posts, courseName, provider);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : "Could not find resources for these replies." };
        }
        if (!mountedRef.current) return;

        // Re-read after the await - argsRef.current.rowsApi may be a newer
        // object than the one captured above, and its mutators are what
        // must be called (see useReplyResources's own file header on why a
        // ref, not a closed-over value, is required here).
        const freshRowsApi = argsRef.current.rowsApi;

        const isUnchangedSince = (id: string) => freshRowsApi.resourcesUnchangedSince(id, snapshot);

        if ("error" in result) {
          // R7: only ids still unchanged since dispatch get marked failed
          // with the real error - a row the instructor edited in the
          // meantime (removed a link) gets F5's discard message instead, so
          // it resolves to "failed" (Retry links stays reachable) rather
          // than staying wedged at "searching" forever - see
          // partitionResourceOutcome's own doc comment for why that
          // wedge happened.
          const { unchanged, changedMidFlight } = partitionResourceOutcome(postIds, isUnchangedSince);
          if (unchanged.length > 0) freshRowsApi.markResourceFailed(unchanged, result.error);
          if (changedMidFlight.length > 0) freshRowsApi.markResourceFailed(changedMidFlight, RESOURCE_DISCARDED_MESSAGE);
          argsRef.current.pushNotice(result.error);
          continue;
        }

        // R4e/F8: see shouldPushDegradedNotice's own doc comment above.
        if (shouldPushDegradedNotice(result.degraded, provider)) {
          argsRef.current.pushNotice(RESOURCE_DEGRADED_NOTICE);
        }

        // F5: ids whose resourceSeq advanced mid-flight (a link removed
        // while this same row was being re-searched) must not have
        // `applyResources` overwrite the row's resources wholesale - R7's
        // whole point - but they also must not be left at "searching"
        // forever just because no error occurred. Resolve them to "failed"
        // up front (Retry links stays reachable), then skip them below.
        const { changedMidFlight } = partitionResourceOutcome(postIds, isUnchangedSince);
        if (changedMidFlight.length > 0) freshRowsApi.markResourceFailed(changedMidFlight, RESOURCE_DISCARDED_MESSAGE);

        const byId = new Map(result.resources.map((r) => [r.id, r.resources]));
        for (const id of postIds) {
          if (changedMidFlight.includes(id)) continue; // already resolved above
          const found = byId.get(id);
          if (found === undefined) continue; // no entry for this id - leave its state alone rather than guessing
          freshRowsApi.applyResources(id, found);
        }
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setSearchingResources(false);
    }
  }, []);

  const enqueueResources = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        if (!resourceQueueRef.current.includes(id)) resourceQueueRef.current.push(id);
      }
      setResourceQueueSize(resourceQueueRef.current.length);
      // R5: self-kicking - the drain itself re-checks isResourceLaneBusy on
      // every iteration, so calling it unconditionally here is safe; it
      // simply exits again immediately if the lane is still busy.
      if (!inFlightRef.current) void drain();
    },
    [drain]
  );

  // R0-4: watches for the busy->false transition (capture stops, or
  // extraction/pendingFrames drain to nothing) and restarts the drain then
  // - the ONLY other restart path besides enqueueResources itself, per this
  // hook's own header comment.
  useEffect(() => {
    const wasBusy = busyRef.current;
    const isBusy = isResourceLaneBusy({
      capturing: args.capturing,
      pendingFrames: args.pendingFrames,
      extracting: args.extracting,
    });
    busyRef.current = isBusy;
    if (wasBusy && !isBusy && resourceQueueRef.current.length > 0 && !inFlightRef.current) {
      void drain();
    }
  }, [args.capturing, args.pendingFrames, args.extracting, drain]);

  const findMissing = useCallback(() => {
    const rows = argsRef.current.rowsApi.rows;
    const ids = rows.filter(isFindMissingEligible).map((r) => r.id);
    if (ids.length > 0) enqueueResources(ids);
  }, [enqueueResources]);

  const retryResources = useCallback(
    (id: string) => {
      enqueueResources([id]);
    },
    [enqueueResources]
  );

  return {
    resourceQueueSize,
    searchingResources,
    enqueueResources,
    findMissing,
    retryResources,
  };
}
