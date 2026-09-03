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
// F7 fix (fixer pass): the "; " concepts joiner is owned by
// discussion-serialization.ts (the leaf that owns `concepts`' own type), not
// restated here - see that file's own comment on `CONCEPT_JOINER`.
import { CONCEPT_JOINER } from "./discussion-serialization";
import type { UseReplyRowsReturn } from "./useReplyRows";
import { gatherReplyResourcesAction } from "@/app/actions/discussion-replies";
import { getStoredProvider } from "@/lib/llm-provider";
import type { LlmProvider } from "@/lib/llm";
import type { ResourceKind } from "@/lib/resource-kind";
// The per-row targeted search (resource-controls feature: "each reply
// should also have a button to search for resources specific to that reply
// and its original message") reuses the SAME concept-normalization rule the
// bulk pass already applies via gatherReplyResourcesAction - never a second
// truncation rule.
import { deriveResourceConcept } from "@/lib/discussion-reply-prompt";
// THE PRIVACY BLOCKER: redactAuthorNameFromText now lives in
// discussion-reply-redact.ts, a dependency-free leaf importable by BOTH this
// "use client" hook (the per-row targeted search, below) and
// discussion-replies.ts's "use server" gatherReplyResourcesAction (the bulk
// path, BLOCKER 3) - one implementation, two callers. Re-exported from here
// too, unchanged, so this hook's own test file's existing import path keeps
// working.
import { redactAuthorNameFromText } from "@/lib/discussion-reply-redact";

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

/** R11/Y13: `Find resources`' bulk eligibility predicate. A row counts as
 * "never searched" whether `resourceState` was never set at all (a row
 * that never drafted, or that the user wrote by hand - R6's own
 * "reachable only through Find resources and per-row Retry" case) or was
 * persisted as the literal string `"idle"` (deserializeReplyTable's
 * defensive fallback for a present-but-unrecognised value, R3c) - R3c-i's
 * "absent is not invalid" distinction governs ROUND-TRIPPING, not this
 * eligibility question, so both count here. `"searching"` is excluded
 * outright (already in flight); `"failed"` is reachable only through that
 * row's own Retry, mirroring AC28a's bulk-versus-targeted drafting policy.
 * `"done"` is excluded UNLESS Y13 applies: a `"done"` row with no resources
 * and a `resourceSearchOutcome` (a real search ran and came back empty, Y8)
 * is ALSO eligible - one click on "Find resources" retries every such row,
 * rather than requiring a per-row Retry click for each. A `"done"` row the
 * instructor emptied BY HAND (removeResource) stays excluded: Y9 clears
 * `resourceSearchOutcome` the moment resources become non-empty and nothing
 * sets it again on a manual removal, so that row has no outcome and fails
 * this same check - R11's "instructor emptied it" case is preserved. D9
 * (aesthetics-pass redesign, docs/aesthetics-pass-acceptance-criteria.md
 * section 4b): a skipped row is excluded outright, regardless of the above -
 * it opted out of the reply workflow this bulk sweep serves. */
export function isFindMissingEligible(row: {
  resourceState?: ReplyRow["resourceState"];
  reply: string;
  skipped?: boolean;
  resources?: ReplyRow["resources"];
  resourceSearchOutcome?: ReplyRow["resourceSearchOutcome"];
}): boolean {
  if (row.reply.length === 0 || row.skipped === true) return false;
  const neverSearched = row.resourceState === undefined || row.resourceState === "idle";
  const noResources = !row.resources || row.resources.length === 0;
  const searchedButEmpty = row.resourceState === "done" && noResources && row.resourceSearchOutcome !== undefined;
  return neverSearched || searchedButEmpty;
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

// redactAuthorNameFromText itself now lives in discussion-reply-redact.ts
// (see this file's import above for why it had to move out of a "use
// client" hook file) - re-exported here unchanged so existing imports of it
// from this module keep working.
export { redactAuthorNameFromText };

// docs/reply-resource-concepts-acceptance-criteria.md RC4: whether a
// redacted string has any letters left in it at all - the test a
// concepts-derived query must pass before it is trusted over the prose
// fallback. A term that IS the author's name (or that redacts down to pure
// punctuation, e.g. "Newton's" -> "'s") must not be sent to the search as a
// "concept" with nothing left to search for.
function hasLetters(text: string): boolean {
  return /\p{L}/u.test(text);
}

/**
 * RC4: the ONE function that decides what text a resource search sends,
 * used by both the automatic drain (mode "auto", after a draft lands) and
 * the per-row targeted search (mode "manual", the "Search for resources"
 * button) - previously these disagreed (the drain sent `post` only; the
 * button sent `deriveRowSearchConcept`'s post+reply, now deleted). Prefers
 * `row.concepts` (source "concepts") - the noun phrases the drafting model
 * named for this reply - joined with "; ", redacted, then normalized the
 * same way the bulk pass always has via `deriveResourceConcept`. When
 * `concepts` is absent/empty, OR the concepts-derived text redacts to no
 * letters at all (every term either the author's own name, or a mangled
 * remnant of it), this falls back to the PROSE base for `mode`: the post
 * alone for `"auto"` (source `"post"`, today's drain rule, unchanged) or
 * post + " " + reply for `"manual"` (source `"post-reply"`, the rule
 * `deriveRowSearchConcept` used to apply) - redacted and normalized the
 * same way. `text` is `""` only when the prose fallback is itself blank
 * (nothing anywhere to search for); a caller must treat `""` as "do not
 * dispatch a search", mirroring the bulk pass's own empty-concept entries
 * being dropped before ever reaching the network
 * (gatherReplyResourcesAction's own `entries.length === 0` branch).
 */
export function resourceQueryForRow(
  row: Pick<ReplyRow, "post" | "reply" | "author" | "concepts">,
  mode: "auto" | "manual"
): { text: string; source: "concepts" | "post" | "post-reply" } {
  if (row.concepts && row.concepts.length > 0) {
    const conceptsText = deriveResourceConcept(redactAuthorNameFromText(row.concepts.join(CONCEPT_JOINER), row.author));
    if (hasLetters(conceptsText)) return { text: conceptsText, source: "concepts" };
  }
  const proseBase =
    mode === "manual" ? [row.post, row.reply].filter((t) => t.trim().length > 0).join(" ") : row.post;
  const proseText = deriveResourceConcept(redactAuthorNameFromText(proseBase, row.author));
  return { text: proseText, source: mode === "manual" ? "post-reply" : "post" };
}

/** Y8/Y9: the id -> outcome lookup the drain and `dispatchRowSearch` both
 *  pass to `applyResources` - `gatherReplyResourcesAction`'s own per-post
 *  `outcome` field, keyed by id. `undefined` for an id whose entry carried no
 *  `outcome` (a non-empty result) or whose id is missing from the result
 *  entirely - `applyResources` already treats a missing/undefined outcome as
 *  "nothing to store" (Y9). Pure and exported for the same reason
 *  `partitionResourceOutcome` above is - nothing inside a `drain`/
 *  `dispatchRowSearch` closure has a test surface of its own. */
export function outcomeById(
  resources: ReadonlyArray<{ id: string; outcome?: ReplyRow["resourceSearchOutcome"] }>
): Map<string, ReplyRow["resourceSearchOutcome"]> {
  return new Map(resources.map((r) => [r.id, r.outcome]));
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
//
// docs/reply-resource-search-yield-acceptance-criteria.md Y11: a
// non-degraded batch pushes no notice at all (the rows explain themselves,
// Y10, and the run summary counts them, Y12) - the one case this notice
// covers (`degraded`: not a single concept in the whole batch returned a
// source) is specific rather than generic.
const RESOURCE_DEGRADED_NOTICE =
  "No web pages came back for this batch. Find resources retries every reply that came back empty.";

export interface UseReplyResourcesReturn {
  resourceQueueSize: number;
  searchingResources: boolean;
  enqueueResources: (ids: string[]) => void;
  findMissing: () => void;
  retryResources: (id: string) => void;
  /** Per-row targeted search ("each reply should also have a button to
   *  search for resources specific to that reply and its original
   *  message"). Deliberately NOT routed through `enqueueResources`/the
   *  bulk queue - it dispatches immediately, on its own, using
   *  `resourceQueryForRow(row, "manual")` (RC4: concepts preferred, else
   *  post + reply, redacted) rather than the bulk pass's "auto" mode, and
   *  touches only THIS row's own
   *  `resourceState`/`resources`/`resourceSeq` (the same mutators the bulk
   *  drain already uses - `markResourceSearching`/`applyResources`/
   *  `markResourceFailed`/`resourcesUnchangedSince`) - never
   *  `resourceQueueRef`, `inFlightRef` or `searchingResources`, so it
   *  cannot disturb the bulk queue's own progress line or in-flight state.
   *  A no-op when the row is gone or has nothing to search for. */
  searchRow: (id: string) => void;
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
  /** Resource-controls feature: the persisted "eligible resource kinds"
   *  setting, read fresh at dispatch time by both the bulk drain and
   *  `searchRow` - mirrors `courseNameRef`'s own freshness reasoning. */
  resourceKindsRef: MutableRefObject<readonly ResourceKind[]>;
  /** Resource-controls feature: the persisted "preferred video length"
   *  setting, read fresh the same way. See discussion-replies.ts's own
   *  `videoLengthPreferenceSentence` for why this can only ever reach the
   *  model as a stated preference, never an enforced filter. */
  videoLengthPreferenceRef: MutableRefObject<{ minMinutes?: number; maxMinutes?: number }>;
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
        // B5 fix (sort-filter review): `rawRows`, not `rows` (the filtered
        // display array). This is worse than B3's version of the same bug -
        // this drain is fed automatically on every model-authored reply
        // landing (R6's single trigger point, useDiscussionReplies.ts:654),
        // not by any bulk-scope judgment call, so reading the filtered array
        // meant ANY filter active during a capture silently dropped resource
        // searches for rows outside it: never searched, never "searching",
        // never an error, dropped from a queue already spliced above. The
        // comment this replaced ("every id vanished from the table under
        // us") was no longer true once a filter could hide an id without
        // removing it.
        const currentRows = rowsApi.rawRows;
        const candidateRows = ids.map((id) => currentRows.find((r) => r.id === id)).filter((r): r is ReplyRow => !!r);

        if (candidateRows.length === 0) continue; // every id was actually removed from the table (rawRows), not merely filtered out

        // RC4 (docs/reply-resource-concepts-acceptance-criteria.md): ONE
        // function decides what each row searches for - `resourceQueryForRow`
        // prefers the reply's own concept terms, redacted, and falls back to
        // the post alone (mode "auto") when there are none or none survive
        // redaction. `queryById` is what `markResourceSearching` below
        // records onto each row (`resourceQuery`/`resourceQuerySource`) so
        // the log and the chip-row explanatory lines can say which base the
        // last search actually used.
        const queryById = new Map<string, { text: string; source: "concepts" | "post" | "post-reply" }>();
        // BLOCKER 3: `author` still travels alongside `text` so
        // gatherReplyResourcesAction can idempotently redact server-side
        // (discussion-reply-redact.ts) - the query text is already redacted
        // client-side above, but this keeps the server's own redaction pass
        // meaningful for the `author` field itself (discussion-replies-bulk-
        // redaction.test.ts).
        const posts = candidateRows.map((r) => {
          const query = resourceQueryForRow(r, "auto");
          queryById.set(r.id, query);
          return { id: r.id, text: query.text, author: r.author };
        });

        const postIds = posts.map((p) => p.id);
        rowsApi.markResourceSearching(postIds, queryById);
        setSearchingResources(true);
        const snapshot = rowsApi.snapshotResourceSeq(postIds);
        const provider = getStoredProvider();
        const courseName = argsRef.current.courseNameRef.current;
        const resourceKinds = argsRef.current.resourceKindsRef.current;
        const videoLengthPreference = argsRef.current.videoLengthPreferenceRef.current;

        let result: Awaited<ReturnType<typeof gatherReplyResourcesAction>>;
        try {
          result = await gatherReplyResourcesAction(posts, courseName, provider, resourceKinds, videoLengthPreference);
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
        // Y8/Y9: the per-id outcome lookup, built alongside `byId` from the
        // SAME `result.resources` array.
        const outcomes = outcomeById(result.resources);
        for (const id of postIds) {
          if (changedMidFlight.includes(id)) continue; // already resolved above
          const found = byId.get(id);
          if (found === undefined) continue; // no entry for this id - leave its state alone rather than guessing
          freshRowsApi.applyResources(id, found, outcomes.get(id));
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
    // DELIBERATE (sort-filter review S6, not B3/B5's bug): stays on `rows`,
    // the FILTERED display array - not `rawRows`. `Find resources (N)` is
    // not one of F12's three whole-table actions, and the panel's own
    // `eligibleForResources.length` (DiscussionRepliesPanel.tsx) reads this
    // SAME `rowsApi.rows` object, so the count on the button and the ids
    // this dispatches can never drift apart - unlike B3/B5, where nothing
    // on screen was ever a selection the user saw before clicking.
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

  // Per-row targeted search - see UseReplyResourcesReturn.searchRow's own
  // doc comment for why this bypasses the bulk queue entirely rather than
  // going through `enqueueResources`. Uses `rawRows` (never the filtered
  // `rows`), mirroring every other whole-table/single-row lookup in this
  // codebase's own B3/B5 discipline - a row hidden by an active search-box
  // filter must still be reachable by its own button.
  const dispatchRowSearch = useCallback(
    async (id: string, query: { text: string; source: "concepts" | "post" | "post-reply" }) => {
      const rowsApi = argsRef.current.rowsApi;
      rowsApi.markResourceSearching([id], new Map([[id, query]]));
      const snapshot = rowsApi.snapshotResourceSeq([id]);
      const provider = getStoredProvider();
      const courseName = argsRef.current.courseNameRef.current;
      const resourceKinds = argsRef.current.resourceKindsRef.current;
      const videoLengthPreference = argsRef.current.videoLengthPreferenceRef.current;

      let result: Awaited<ReturnType<typeof gatherReplyResourcesAction>>;
      try {
        result = await gatherReplyResourcesAction([{ id, text: query.text }], courseName, provider, resourceKinds, videoLengthPreference);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "Could not find resources for this reply." };
      }
      if (!mountedRef.current) return;

      const freshRowsApi = argsRef.current.rowsApi;
      const isUnchangedSince = () => freshRowsApi.resourcesUnchangedSince(id, snapshot);

      if ("error" in result) {
        // Mirrors the bulk drain's own R7 partition, at single-row scale: an
        // id changed mid-flight (the instructor removed a link while THIS
        // search was running) resolves to "failed" with the discard message
        // rather than staying wedged at "searching" forever.
        freshRowsApi.markResourceFailed([id], isUnchangedSince() ? result.error : RESOURCE_DISCARDED_MESSAGE);
        argsRef.current.pushNotice(result.error);
        return;
      }

      if (shouldPushDegradedNotice(result.degraded, provider)) {
        argsRef.current.pushNotice(RESOURCE_DEGRADED_NOTICE);
      }

      if (!isUnchangedSince()) {
        freshRowsApi.markResourceFailed([id], RESOURCE_DISCARDED_MESSAGE);
        return;
      }
      const entry = result.resources.find((r) => r.id === id);
      if (entry !== undefined) freshRowsApi.applyResources(id, entry.resources, entry.outcome);
    },
    []
  );

  const searchRow = useCallback(
    (id: string) => {
      const row = argsRef.current.rowsApi.rawRows.find((r) => r.id === id);
      if (!row) return;
      const query = resourceQueryForRow(row, "manual");
      if (!query.text) return;
      void dispatchRowSearch(id, query);
    },
    [dispatchRowSearch]
  );

  return {
    resourceQueueSize,
    searchingResources,
    enqueueResources,
    findMissing,
    retryResources,
    searchRow,
  };
}
