"use client";

// Set C2 - the TABLE-lifetime hook for discussion reply capture
// (docs/discussion-reply-capture-acceptance-criteria.md, sections 5-7,
// AC40-AC45, AC52-AC58). Knows nothing about streams, the LLM, or server
// actions: it owns `rows`, `sort`, the sorted-for-display array, the
// editSeq/tableEpoch generation guards, the row mutators, and the
// `ta-rec-disc-table` / `ta-rec-disc-sort` persistence. The orchestrator
// (set C3, `useDiscussionReplies.ts`) is the only consumer and the only
// place that knows about capture, extraction or drafting.
//
// THE SINGLE-WRITER INVARIANT THIS FILE RELIES ON (read this before editing
// any mutator below):
//
// AC40 requires every write to `rows` to be `setRows(prev => ...)`, because
// two async loops living in C3 call these mutators after an `await`, and a
// value captured before that `await` is stale by definition. But AC40 also
// implicitly requires something React's plain `setState(updater)` cannot
// give for free: several mutators here (`mergeIncoming` above all) need to
// hand a synchronously-correct result back to their caller - React does not
// guarantee an updater function runs before `setRows(...)` returns, so a
// value written into a closure from inside the updater cannot be read back
// synchronously by the caller.
//
// The resolution: `rowsRef` is the single, always-synchronously-fresh
// source of truth. EVERY mutator below reads exclusively from
// `rowsRef.current` (never from the `rawRows` state value or a closure
// captured earlier), computes `next`, assigns `rowsRef.current = next`
// synchronously in its own body (a plain ref mutation in handler/loop-body
// code - exactly what AC42 sanctions), and only then calls `commitRows`,
// which schedules the React state write via `setRows((prev) => next)`. This
// hook is the sole writer of `rows` (C3 and D never call `setRows`
// directly, only these exposed functions), so `rowsRef.current` is always
// equal to whatever `prev` will be on the next dispatch - there is no
// window in which two of this hook's OWN calls can see divergent state,
// because every call is synchronous JS with no `await` in between reading
// and writing the ref. This is what actually eliminates the staleness AC40
// warns about; the `prev => next` shape is kept so every write is still
// visibly in that form.
//
// This synchronous-read guarantee is why `mergeIncoming` can return
// `addedIds` (and `capped`) directly, instead of forcing the caller to
// learn about a merge's outcome from a later render.

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  mergeCapturedPosts,
  serializeReplyTable,
  deserializeReplyTable,
  type ReplyRow,
  type ReplyRowState,
  type ReplyResource,
  type ReplySort,
} from "./discussion-capture";
// F5/F8/F9/F15: E-B's leaf
// (docs/discussion-reply-sort-filter-acceptance-criteria.md sections 5-7).
// `sortReplyRowsForTable` supersedes `discussion-capture.ts`'s own
// `sortReplyRows` as this hook's display sort (it delegates to that
// function for the five sorts it already owned, and adds the four
// first/last modes); `moveVisibleRow` supersedes that module's `moveRow`
// for the same reason (F15) - both plain `sortReplyRows`/`moveRow` imports
// were removed from this file in favour of these two.
import { filterRowsByQuery, sortReplyRowsForTable, moveVisibleRow, REPLY_ROW_HAYSTACK } from "./discussion-table-view";
// D1/D9 migration: imported directly from discussion-serialization.ts, not
// via the discussion-capture.ts re-export - that file's own re-export list
// is a different, concurrently-owned surface this migration has no reason
// to touch.
import { mergeLegacyReplyFlags, nextRowAfterRemoveQuestion } from "./discussion-serialization";
// docs/post-questions-acceptance-criteria.md Q1: type-only, imported ONLY
// from the leaf - never re-exported from discussion-serialization.ts or
// discussion-capture.ts (see that leaf's own comment on `questions`).
import type { PostQuestion } from "@/lib/discussion-reply-prompt";
// RC10 (docs/reply-resource-concepts-acceptance-criteria.md): the resource
// mutators and their own STRUCTURAL_DEBOUNCE_MS/TYPING_DEBOUNCE_MS constants
// moved into this leaf to keep this file under the soft line cap - see that
// file's own header for the single-writer invariant it still relies on and
// why importing the two constants FROM the leaf (rather than the leaf
// importing them back from here) is the safe direction.
import {
  useReplyRowResourceMutators,
  isResourceBatchFresh,
  STRUCTURAL_DEBOUNCE_MS,
  TYPING_DEBOUNCE_MS,
} from "./useReplyRowResourceMutators";

// Re-exported so useReplyResources.test.ts's existing import path
// (`import { isResourceBatchFresh } from "./useReplyRows"`) keeps working -
// see useReplyRowResourceMutators.ts's own doc comment on this function for
// why the re-export is now the point, not merely a convenience.
export { isResourceBatchFresh };

// AC55: localStorage keys are written as whole string literals - never a
// template literal - so the key-inventory scan in
// recording-split.structure.test.ts sees the real key, not a fragment.
//
// Do NOT spell that scan's regex out here. It matches the prefix followed by
// lowercase letters and hyphens, so writing the pattern in prose puts the bare
// prefix into this file's text, the scan harvests it as a 44th key, and the
// canary goes red against a key nothing ever writes. That is exactly what
// happened when this comment first quoted the pattern - the note explaining
// the footgun set it off.
const STORAGE_KEY_TABLE = "ta-rec-disc-table";
const STORAGE_KEY_SORT = "ta-rec-disc-sort";
// F10: same whole-string-literal discipline as the two keys above - see the
// comment on STORAGE_KEY_TABLE for why this file never spells out the scan's
// own pattern in prose.
const STORAGE_KEY_FILTER = "ta-rec-disc-filter";
// D1/D9 migration: the RETIRED side channel's own key
// (discussion-reply-flags.ts, deleted) - read once and removed below, never
// written again, unlike the three STORAGE_KEY_* keys above.
const LEGACY_FLAGS_KEY = "ta-rec-disc-flags";

// AC63, verbatim. Whatever the real cause (Firefox's NS_ERROR_DOM_QUOTA_
// REACHED, Safari private mode throwing on any setItem, or an origin quota
// actually filled by some other ta- key), this message is true and names
// the right risk - see AC23a.
const STORAGE_FULL_MESSAGE =
  "There is no room left to save the reply table. Your replies still work until you reload - copy the ones you need, then remove rows you are done with.";

// No default sort is specified in the AC. captured-asc (the order posts
// were found, oldest first) matches the reading order the user scrolled in
// and needs no justification beyond "do nothing surprising" - a judgment
// call, noted for review.
const DEFAULT_SORT: ReplySort = "captured-asc";

// F5: all nine members, none dropped - see discussion-capture.ts's own
// comment on the ReplySort union, which calls this exact list out by name.
// Shrinking this set out from under an already-persisted value (e.g.
// omitting "first-asc") makes isReplySort reject it and silently reverts a
// returning user's saved sort to the default with no error - the
// coercion-changes-set-membership lesson, applied here rather than merely
// cited.
const VALID_SORTS: ReadonlyArray<ReplySort> = [
  "captured-asc",
  "captured-desc",
  "name-asc",
  "name-desc",
  "first-asc",
  "first-desc",
  "last-asc",
  "last-desc",
  "custom",
];

function isReplySort(value: unknown): value is ReplySort {
  return typeof value === "string" && (VALID_SORTS as readonly string[]).includes(value);
}

// AC22/BL4: serialization is owned by discussion-capture.ts, not restated
// here. It was previously duplicated in this file and had diverged from the
// tested copy (the ReplyRow invariant "error is set only when
// state === 'failed'" was enforced here and NOT in the version the unit
// tests actually exercised) - see docs/discussion-reply-capture-acceptance-
// criteria.md. Importing the tested functions instead of keeping a second
// copy is what makes them tested AND live at the same time.

export interface UseReplyRowsReturn {
  /** Sorted AND filtered for display (AC14, F9). A fresh array reference
   *  whenever `rawRows`, `sort` or `filterText` changes; individual row
   *  objects keep the same reference when untouched (AC40/F9), which is
   *  what lets Set D's `React.memo` rows skip re-rendering. This is a
   *  SUBSET of the table when a filter is active - see `totalCount` below
   *  and F0-2/F11: nothing that arms a destructive action or reports a
   *  whole-table count may read `rows.length` any more. */
  rows: ReplyRow[];
  sort: ReplySort;
  setSort: (next: ReplySort) => void;

  /** F10. Persisted under `ta-rec-disc-filter` (see STORAGE_KEY_FILTER's own
   *  comment for why that key is never spelled out as a pattern in prose).
   *  Debounced on the typing timer, like `editReply`'s text writes. */
  filterText: string;
  setFilterText: (next: string) => void;

  /** F0-2/F11. The UNFILTERED row count - `rawRows.length`, exposed
   *  directly because eleven sites in the panel read a row count today and
   *  two of them (`deleteSignature`, `redraftSignature`) are arming
   *  signatures for destructive actions. A filter must change what is
   *  VISIBLE and nothing else (F0-2): if any of those eleven sites read the
   *  filtered `rows.length` instead, typing in the search box while
   *  `Delete table` is armed would silently re-arm it against a different
   *  number, and the confirmation would name a count that does not match
   *  what it deletes - REGRESSION entry 258's exact defect, already hit
   *  twice in this feature. Do not remove this in favour of `rows.length`. */
  totalCount: number;

  /** F0-2/F11 fixer pass (sort-filter review B1-B5): the UNFILTERED row
   *  objects themselves, not just their count. `totalCount` above (just
   *  `rawRows.length`) is enough for every COUNT/progress-string/arming-
   *  signature site F11 governs, but several existing callers need the
   *  actual ROWS of the whole table - a bulk dispatch (`Redraft every
   *  reply`, `Draft the missing replies`), the drafting queue's own
   *  dispatch-time row lookup and edited-during-dispatch resolution, and
   *  the resource drain's row lookup all used to read `rows` (this hook's
   *  filtered display array), so a filter active at the wrong moment
   *  silently narrowed a whole-table action to whatever the search box
   *  happened to show, or made a queued id resolve to `undefined`
   *  mid-dispatch and get quietly dropped - never drafted, never marked
   *  failed, never retried. REGRESSION entry 258's class, one level below
   *  the counts F11 already covers. Route every whole-table row read
   *  through this field; `rows` is for what is RENDERED only. */
  rawRows: ReplyRow[];

  /** AC12 (set A's pure `mergeCapturedPosts`, which itself enforces the
   *  AC23b row ceiling and reports `capped` - see BL5) wrapped with the
   *  AC23/AC57 debounced persistence. Returns the ids actually added and
   *  whether the ceiling refused at least one of them. `now` defaults to
   *  `Date.now()` - AC13's "pure, takes now as an argument" binds the
   *  underlying `mergeCapturedPosts`, not this wrapper; an optional
   *  override is kept for a future test.
   *
   *  FIX 2 (thread-structure group, dead-feature review): widened to
   *  `threadPosition`/`replyingToAuthor` - this is the shape
   *  `mergeCapturedPosts` (discussion-capture.ts) has always actually
   *  accepted and forwarded unrebuilt into `mergeCapturedPosts` below, in
   *  the implementation of this function. The narrower type previously
   *  declared here was a lie the excess-property check never caught,
   *  because every production caller passes a variable rather than a
   *  fresh object literal. No behaviour changes: this only makes the
   *  declared contract match what already happens at runtime, and stops a
   *  future literal caller (or a "fix" that trusts this type as ground
   *  truth and strips the extra fields) from either being wrongly
   *  rejected or silently breaking thread capture. */
  mergeIncoming: (
    incoming: ReadonlyArray<{
      author: string;
      text: string;
      postedAt?: string;
      threadPosition?: ReplyRow["threadPosition"];
      replyingToAuthor?: string;
    }>,
    now?: number
  ) => { addedIds: string[]; capped: boolean };

  /** AC14 + AC53. Operates on the DISPLAYED order (rows is already sorted
   *  for display). A no-op at the boundary - AC14 has the button's own
   *  handler announce "Already first."/"Already last." locally, since D
   *  already knows a row's displayed index without asking this hook. */
  moveRow: (id: string, dir: "up" | "down") => void;

  /** AC18 + AC44. Bumps editSeq BEFORE writing rows, sets userEdited, and
   *  moves a pending/failed row to ready. See the comment above this
   *  function's implementation for a gap this AC leaves open. */
  editReply: (id: string, text: string) => void;

  removeRow: (id: string) => void;

  /** D1: sets or clears the row's `handledAt` - `at: null` clears it. Not
   *  gated on editSeqRef/tableEpochRef - see this mutator's implementation
   *  for why both would be wrong here. */
  setHandledAt: (id: string, at: number | null) => void;

  /** D9: sets or clears the row's `skipped` flag - reversible, never
   *  implies removeRow. */
  setSkipped: (id: string, skipped: boolean) => void;

  /** AC19 + AC45. Empties the table and bumps tableEpochRef so an
   *  extraction merge already in flight cannot resurrect the posts just
   *  deleted. Does not touch `sort`. */
  clearTable: () => void;

  /** AC26/AC52. Flips the given ids to "drafting", clearing any stale
   *  error - covers both the normal dispatch path and a "Redraft every
   *  reply" dispatch. S7: does NOT clear `userEdited` here - that flag is
   *  now only resolved once the outcome is known, in `applyReply`, so a
   *  redraft that fails does not silently lose the "Yours" badge on text
   *  the instructor wrote by hand. Ids absent from the current table are
   *  dropped (AC40). */
  markDrafting: (ids: string[]) => void;

  /** AC26/AC44. Applies a drafted reply and sets the row ready. The
   *  caller MUST already have checked `isUnchangedSince` for this id -
   *  this function does not re-check it, so the edit guard lives in one
   *  place (the caller's dispatch/response bookkeeping), not two.
   *  S7: `userEdited` defaults to false (a normal landing is the model's
   *  own text) - pass the row's own current `userEdited` explicitly when
   *  re-applying the row's OWN text (the "edited during dispatch" discard
   *  path), so a hand-typed reply keeps its "Yours" badge.
   *  RC3 (docs/reply-resource-concepts-acceptance-criteria.md): `concepts`
   *  is a three-way switch, distinct from every other optional argument in
   *  this file - `undefined` leaves the row's current `concepts` field
   *  alone (the "edited during dispatch" re-apply call passes nothing,
   *  since that call is not about concepts at all); `[]` means "the model
   *  returned none this time" and SETS the field to `undefined`; a
   *  non-empty array replaces it (copied, so the caller's own array is
   *  never aliased into the row).
   *  docs/post-questions-acceptance-criteria.md Q6: `questions` is a FIFTH,
   *  identically-shaped three-way switch - undefined leave / [] clear /
   *  array replace with a COPY. `undefined` is what runDraftLoop passes on
   *  the discard path, which re-applies the row's own text and so replaces
   *  nothing the questions were drafted against; `[]` is a dispatch that DID
   *  replace the reply but carries no questions for it - the setting was
   *  off, or on with none returned this time. */
  applyReply: (id: string, reply: string, userEdited?: boolean, concepts?: readonly string[], questions?: readonly PostQuestion[]) => void;

  /** docs/post-questions-acceptance-criteria.md Q6: removes EVERY item on
   *  the row whose `question` equals the argument exactly (idempotent - a
   *  second call with the same text, now absent, is a no-op), clearing the
   *  field to `undefined` when the list empties. Mirrors `removeResource`'s
   *  shape exactly (useReplyRowResourceMutators.ts) - the pure transform
   *  lives in `nextRowAfterRemoveQuestion` (discussion-serialization.ts) for
   *  the same "no test surface inside a useCallback body" reason that
   *  file's own `nextRowAfter*` siblings exist. Scoped by `id`: the same
   *  question text can legitimately appear on two different rows. */
  removeQuestion: (id: string, question: string) => void;

  /** AC27. Same edit-guard expectation as applyReply: a caller dispatching
   *  a batch-level failure across several ids should drop any id that is
   *  no longer `isUnchangedSince` before calling this, so a failed
   *  request never overwrites a reply the user already fixed by hand. */
  markFailed: (ids: string[], error: string) => void;

  // AC44 - the per-row generation guard.
  bumpEditSeq: (id: string) => void;
  snapshotEditSeq: (ids: string[]) => Map<string, number>;
  isUnchangedSince: (id: string, snapshot: Map<string, number>) => boolean;

  /** AC45 - the whole-table generation guard. Exposed as the live ref
   *  itself, not a setter: `clearTable` above increments it as part of its
   *  own body, and C3's `redraftAll` (a C3-level orchestration action, not
   *  a C2 mutator) is expected to increment the SAME counter directly
   *  (`tableEpochRef.current += 1`) for the same reason - AC45 describes
   *  both as incrementing "tableEpochRef", one shared counter, not two. The
   *  extraction loop reads `.current` before dispatch and again on
   *  response to decide whether to drop a stale merge. */
  tableEpochRef: MutableRefObject<number>;

  /** AC23a. The exact user-facing message once the last localStorage write
   *  failed; null once a write succeeds again. In-memory rows keep working
   *  regardless - this never blocks a mutator. */
  persistError: string | null;

  // -------------------------------------------------------------------
  // docs/discussion-reply-resources-acceptance-criteria.md R3/R7: the
  // resource mutators and their own generation guard. RC10: IMPLEMENTED in
  // useReplyRowResourceMutators.ts now, spread into this hook's return - see
  // that file's own doc comments for why both tableEpochRef and editSeqRef
  // are deliberately not applied to them (R7 in the AC).
  // -------------------------------------------------------------------

  /** R3/R6/Y9. Applies a completed resource search: `resourceState` becomes
   *  "done" whether or not `resources` is non-empty (R11 relies on "done"
   *  meaning "searched", not "found something"). The caller MUST already
   *  have checked `resourcesUnchangedSince` for this id before calling -
   *  same division of responsibility as `applyReply`/`isUnchangedSince`
   *  above; this function does not re-check it. Y9: `outcome` is stored on
   *  the row only when `resources` is empty, and cleared otherwise - see
   *  useReplyRowResourceMutators.ts's `nextRowAfterApplyResources`. */
  applyResources: (id: string, resources: ReplyResource[], outcome?: ReplyRow["resourceSearchOutcome"]) => void;

  /** R10. One-click remove, matched by `url` within the row's own resource
   *  list. Bumps `resourceSeq` for this id BEFORE writing rows (mirrors
   *  `editReply`'s own bump-before-write ordering) so a search already in
   *  flight for this row cannot land on top of the removal and resurrect
   *  the link. Does NOT touch `resourceState` - R11 relies on a "done" row
   *  the instructor emptied by hand staying "done", not reverting to
   *  "idle" and re-entering the bulk `Find resources` sweep. */
  removeResource: (id: string, url: string) => void;

  /** Flips the given ids to "searching", clearing any stale
   *  `resourceError` - mirrors `markDrafting`. Ids absent from the current
   *  table are dropped. RC4: `queryById`, when supplied, sets
   *  `resourceQuery`/`resourceQuerySource` from each id's `{ text, source }`
   *  entry alongside `resourceState: "searching"` - neither field is ever
   *  cleared otherwise (they record the LAST search, including one that
   *  failed). */
  markResourceSearching: (
    ids: string[],
    queryById?: ReadonlyMap<string, { text: string; source: "concepts" | "post" | "post-reply" }>
  ) => void;

  /** Mirrors `markFailed` for the resource state machine. */
  markResourceFailed: (ids: string[], error: string) => void;

  // R7 - the per-row resource generation guard, mirroring editSeqRef's own
  // three-part shape exactly. Bumped only by removeResource; the caller
  // (useReplyResources.ts's drain) snapshots it before dispatch and checks
  // it before calling applyResources.
  bumpResourceSeq: (id: string) => void;
  snapshotResourceSeq: (ids: string[]) => Map<string, number>;
  resourcesUnchangedSince: (id: string, snapshot: Map<string, number>) => boolean;
}

export function useReplyRows(): UseReplyRowsReturn {
  // AC24: read once, in the initializer, guarded by `typeof window`. The
  // table is not owned by a capture session - it renders before, during and
  // after one.
  const [rawRows, setRawRows] = useState<ReplyRow[]>(() => {
    if (typeof window === "undefined") return [];
    return deserializeReplyTable(window.localStorage.getItem(STORAGE_KEY_TABLE));
  });
  const [sort, setSortState] = useState<ReplySort>(() => {
    if (typeof window === "undefined") return DEFAULT_SORT;
    const stored = window.localStorage.getItem(STORAGE_KEY_SORT);
    return isReplySort(stored) ? stored : DEFAULT_SORT;
  });
  // F10: same read-once-in-the-initializer pattern as `sort` above - the
  // filter is not owned by a capture session either.
  const [filterText, setFilterTextState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEY_FILTER) ?? "";
  });
  const [persistError, setPersistError] = useState<string | null>(null);

  // The single synchronously-fresh source of truth - see the file header.
  const rowsRef = useRef<ReplyRow[]>(rawRows);
  const sortRef = useRef<ReplySort>(sort);
  // F15: moveRow needs the CURRENT filter text synchronously, for the same
  // reason every mutator in this file reads rowsRef.current instead of a
  // state closure - see the file header. Kept in lockstep with filterText
  // by setFilterText below, mirroring sortRef/setSort exactly.
  const filterTextRef = useRef<string>(filterText);

  // AC42/AC44/AC45: non-React bookkeeping in refs, mutated only in handler
  // bodies below, never inside a setRows updater.
  const editSeqRef = useRef<Map<string, number>>(new Map());
  const tableEpochRef = useRef(0);

  // R7: the resource-search generation guard, mirroring editSeqRef exactly
  // - see the doc comment on removeResource below for the race it closes.
  const resourceSeqRef = useRef<Map<string, number>>(new Map());

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistTableNow = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY_TABLE, serializeReplyTable(rowsRef.current));
      setPersistError(null);
    } catch {
      // AC23a: caught by catching, never by err.name - Firefox and Safari
      // private mode each throw something different here.
      setPersistError(STORAGE_FULL_MESSAGE);
    }
  }, []);

  const scheduleSave = useCallback(
    (debounceMs: number) => {
      if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        persistTableNow();
      }, debounceMs);
    },
    [persistTableNow]
  );

  // AC23/AC57: flush once more on unmount (not on capture stop - a stopped
  // session is still followed by edits). Empty deps so this effect's own
  // cleanup never re-runs mid-life; rowsRef is read, never the `rawRows`
  // closure, so this is correct however stale the render that scheduled it.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      try {
        window.localStorage.setItem(STORAGE_KEY_TABLE, serializeReplyTable(rowsRef.current));
      } catch {
        // Unmounting - there is nowhere left to surface this.
      }
    };
  }, []);

  const commitRows = useCallback((next: ReplyRow[]) => {
    rowsRef.current = next;
    setRawRows((prev) => {
      // Invariant: prev === rowsRef.current-before-this-call, always - see
      // the file header. `next` was already computed from the freshest
      // state available; prev is read only so this stays the
      // setRows(prev => ...) shape AC40 requires.
      void prev;
      return next;
    });
  }, []);

  // D1/D9 migration (docs/aesthetics-pass-acceptance-criteria.md section 4b):
  // ONE-TIME. handledAt/skipped used to live in a side-channel localStorage
  // map (discussion-reply-flags.ts, deleted) because the mutator that would
  // set them on ReplyRow had no path back through useDiscussionReplies.ts's
  // pinned return shape at the time - see the fields' own doc comment
  // (discussion-serialization.ts) for the full account. This effect folds
  // any pre-existing side-channel data onto the newly-promoted fields so an
  // existing user's marks are not silently discarded the moment this ships.
  //
  // Runs once on mount against `rowsRef.current` (this file's own
  // single-writer invariant - file header). Ordering matters: the merged
  // table is persisted BEFORE the legacy key is removed, so a crash between
  // the two steps leaves the legacy key present and this effect simply
  // re-runs (a no-op, per mergeLegacyReplyFlags's "does not overwrite" rule)
  // on the next load, rather than losing data. Idempotent under StrictMode's
  // double-invoke: the second pass finds the key already gone.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const legacyRaw = window.localStorage.getItem(LEGACY_FLAGS_KEY);
    if (legacyRaw === null) return; // nothing to migrate
    const merged = mergeLegacyReplyFlags(rowsRef.current, legacyRaw);
    if (merged !== rowsRef.current) {
      commitRows(merged);
      try {
        window.localStorage.setItem(STORAGE_KEY_TABLE, serializeReplyTable(merged));
        setPersistError(null);
      } catch {
        setPersistError(STORAGE_FULL_MESSAGE);
      }
    }
    try {
      window.localStorage.removeItem(LEGACY_FLAGS_KEY);
    } catch {
      // Best-effort - a stale, unreadable key left behind is harmless: the
      // merge above already applied, and a future load re-merging the same
      // legacy data onto rows that already carry it is a no-op (see
      // mergeLegacyReplyFlags's own "does not overwrite" rule).
    }
  }, [commitRows]);

  const setSort = useCallback((next: ReplySort) => {
    sortRef.current = next;
    setSortState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY_SORT, next);
      setPersistError(null);
    } catch {
      setPersistError(STORAGE_FULL_MESSAGE);
    }
  }, []);

  // F10: debounced on the typing timer - a filter keystroke is exactly as
  // frequent as a reply edit, and not worth a persistence write per
  // character. The unmount effect below flushes the last value, mirroring
  // the table's own STRUCTURAL_DEBOUNCE_MS flush-on-unmount.
  const filterSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setFilterText = useCallback((next: string) => {
    filterTextRef.current = next;
    setFilterTextState(next);
    if (typeof window === "undefined") return;
    if (filterSaveTimerRef.current !== null) clearTimeout(filterSaveTimerRef.current);
    filterSaveTimerRef.current = setTimeout(() => {
      filterSaveTimerRef.current = null;
      try {
        window.localStorage.setItem(STORAGE_KEY_FILTER, next);
      } catch {
        // Best-effort. `persistError` is reserved for the table's own
        // storage failures (AC23a) - overloading it for this low-stakes
        // control would surface a scary banner for a search box losing its
        // own persistence, with the table itself unaffected.
      }
    }, TYPING_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (filterSaveTimerRef.current !== null) {
        clearTimeout(filterSaveTimerRef.current);
        filterSaveTimerRef.current = null;
      }
      try {
        window.localStorage.setItem(STORAGE_KEY_FILTER, filterTextRef.current);
      } catch {
        // Unmounting - nowhere left to surface this, mirrors the table
        // flush effect above.
      }
    };
  }, []);

  const mergeIncoming = useCallback(
    (
      // FIX 2: widened to match `UseReplyRowsReturn["mergeIncoming"]` above
      // (which itself now matches what `mergeCapturedPosts` below actually
      // accepts) - see that field's doc comment for why this was previously
      // narrower than the truth.
      incoming: ReadonlyArray<{
        author: string;
        text: string;
        postedAt?: string;
        threadPosition?: ReplyRow["threadPosition"];
        replyingToAuthor?: string;
      }>,
      now: number = Date.now()
    ) => {
      // BL5: the AC23b row ceiling is enforced INSIDE mergeCapturedPosts now
      // (it reports `capped` itself) rather than re-derived here by
      // comparing `finalRows.length` against MAX_TABLE_ROWS - that
      // comparison can never be true, because mergeCapturedPosts's own
      // ceiling check is exactly what keeps its returned length at or under
      // MAX_TABLE_ROWS in the first place. See discussion-capture.ts's
      // mergeCapturedPosts doc comment.
      const merged = mergeCapturedPosts(rowsRef.current, incoming, now);
      const finalRows = merged.rows;

      // Skip the write entirely when nothing actually changed (every row
      // came back the same object reference) - a still-scrolling session
      // otherwise re-serializes and re-renders on every batch that only
      // re-confirmed posts already known.
      const changed =
        finalRows.length !== rowsRef.current.length ||
        finalRows.some((r, i) => r !== rowsRef.current[i]);
      if (changed) {
        commitRows(finalRows);
        scheduleSave(STRUCTURAL_DEBOUNCE_MS);
      }

      return { addedIds: merged.addedIds, capped: merged.capped };
    },
    [commitRows, scheduleSave]
  );

  // BL4: delegates to a tested pure `moveRow`-shaped helper rather than an
  // inline reimplementation that clones every row unconditionally -
  // `displayed.map((r, i) => ({ ...r, order: i }))` - which would not
  // preserve identity for rows that did not move, violating AC40 and
  // defeating Set D's React.memo on every row after any sort. F15: the
  // helper is now `moveVisibleRow` from discussion-table-view.ts, not
  // discussion-capture.ts's own `moveRow` - see the F15 comment below for
  // why a filter-aware version is required.
  const moveRow = useCallback(
    (id: string, dir: "up" | "down") => {
      const curSort = sortRef.current;
      const displayed = sortReplyRowsForTable(rowsRef.current, curSort);
      if (!displayed.some((r) => r.id === id)) return; // AC40: the row is gone under us - intentional no-op

      // F15: swap against adjacency in the VISIBLE (filtered) list, not the
      // full sorted array - with a filter active, the immediate neighbour
      // in `displayed` can be a row the user cannot see, so the old
      // index +/- 1 swap silently targets nothing. `moveVisibleRow` still
      // rewrites `order` across the FULL sorted array (it takes `displayed`
      // for that), so the result is stable once the filter is cleared.
      // Recomputed from refs (rowsRef/sortRef/filterTextRef), not from the
      // `rows` memo, for the same synchronous-freshness reason every
      // mutator in this file reads rowsRef.current instead of a state
      // closure - see the file header.
      // S4 fix (sort-filter review): shared REPLY_ROW_HAYSTACK, not a
      // second inline copy of [author, post, reply] - see that constant's
      // own doc comment (discussion-table-view.ts) for why the two copies
      // being untested and independently spelled out was itself a defect.
      const visibleIds = filterRowsByQuery(displayed, filterTextRef.current, REPLY_ROW_HAYSTACK).map((r) => r.id);

      const result = moveVisibleRow(displayed, visibleIds, curSort, id, dir);
      if (result.atBoundary) return; // boundary - D announces this locally, see AC14

      commitRows(result.rows);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);

      // AC53: sort moves to "custom" in the same tick as the reorder (two
      // setState calls batched into one render, not two separate ones).
      if (result.sort !== curSort) {
        sortRef.current = result.sort;
        setSortState(result.sort);
        try {
          window.localStorage.setItem(STORAGE_KEY_SORT, result.sort);
          setPersistError(null);
        } catch {
          setPersistError(STORAGE_FULL_MESSAGE);
        }
      }
    },
    [commitRows, scheduleSave]
  );

  const editReply = useCallback(
    (id: string, text: string) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return; // AC40: row is gone - intentional no-op

      // AC44: bump editSeq BEFORE writing rows.
      const prevSeq = editSeqRef.current.get(id) ?? 0;
      editSeqRef.current.set(id, prevSeq + 1);

      const row = raw[idx];
      // AC18, read literally: only a pending/failed row is forced to ready
      // on edit. A "drafting" row is left "drafting" here - see the note
      // below applyReply for the gap that leaves.
      const nextState: ReplyRowState =
        row.state === "pending" || row.state === "failed" ? "ready" : row.state;
      // RC3: a hand edit clears `concepts` - the terms named a generated
      // reply that no longer exists once the instructor has typed over it.
      // `resourceQuery`/`resourceQuerySource` are NOT touched here - they
      // record the LAST search, which is still a true fact about this row
      // even after the reply text changes.
      const next = raw.map((r, i) =>
        i === idx
          ? {
              ...r,
              reply: text,
              userEdited: true,
              state: nextState,
              error: null,
              concepts: undefined,
              // docs/answers-in-the-reply-acceptance-criteria.md D2:
              // `questions` is deliberately NOT cleared here, unlike
              // `concepts` above - though the OLD reason ("they describe the
              // POST, which this edit did not change") died with D4, since
              // `answer` now quotes one specific draft. It survives a
              // keystroke because the UI derives each item's state at RENDER
              // time from the LIVE reply text (replyContainsAnswer), never
              // from a stored flag, so an edit reads correctly on the next
              // render with nothing here to keep in sync. Only a path that
              // REPLACES the reply clears them - see discussion-draft-loop.ts.
            }
          : r
      );
      commitRows(next);
      scheduleSave(TYPING_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  const removeRow = useCallback(
    (id: string) => {
      const raw = rowsRef.current;
      if (!raw.some((r) => r.id === id)) return;
      editSeqRef.current.delete(id);
      resourceSeqRef.current.delete(id);
      commitRows(raw.filter((r) => r.id !== id));
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  const clearTable = useCallback(() => {
    editSeqRef.current.clear();
    resourceSeqRef.current.clear();
    tableEpochRef.current += 1; // AC45 - handler body, not inside a setState updater (AC42)
    commitRows([]);
    scheduleSave(STRUCTURAL_DEBOUNCE_MS);
  }, [commitRows, scheduleSave]);

  const markDrafting = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      let changed = false;
      const next = rowsRef.current.map((r) => {
        if (!idSet.has(r.id)) return r;
        changed = true;
        // S7: error reset unconditionally - clearing a stale failure the
        // moment a redispatch starts is correct regardless of outcome.
        // userEdited is deliberately LEFT ALONE here - see the note on
        // applyReply below for why clearing it at DISPATCH time (rather
        // than when a replacement reply actually lands) is what caused a
        // failed redraft to lose the "Yours" badge on text the instructor
        // wrote by hand.
        return { ...r, state: "drafting" as const, error: null };
      });
      if (!changed) return; // AC40: none of the ids matched a current row
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  // AC26/AC44: the caller must already have checked isUnchangedSince before
  // calling this - see the file header on applyReply in the return type. A
  // row typed into WHILE "drafting" (after dispatch, before this settles)
  // has no C2-owned path back to "ready" if the eventual response is
  // discarded for having failed isUnchangedSince, since AC18 only forces
  // pending/failed -> ready on edit. C3 closes that gap by calling
  // applyReply with the row's own current text (and its own current
  // userEdited flag) on a discard - see resolveEditedDuringDispatch in
  // useDiscussionReplies.ts.
  //
  // S7: `userEdited` defaults to false here, NOT because markDrafting
  // already cleared it (it no longer does), but because THIS is the moment
  // that actually determines authorship: a reply landing through this
  // normal path is the model's own text, so it is machine-authored by
  // definition. The one caller that must NOT accept that default is C3's
  // "edited during dispatch" resolution above, which re-applies the row's
  // OWN reply and therefore passes the row's OWN current userEdited value
  // through explicitly - overwriting a hand-typed reply's authorship flag
  // the moment a draft you dispatched before the edit happens to land is
  // exactly the bug this parameter exists to prevent.
  const applyReply = useCallback(
    (id: string, reply: string, userEdited: boolean = false, concepts?: readonly string[], questions?: readonly PostQuestion[]) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return; // AC40: row removed or table cleared under us
      // RC3: `concepts` is a three-way switch - `undefined` (the parameter
      // omitted entirely) leaves the row's current field untouched, `[]`
      // sets it to `undefined` (the model returned none this time), and a
      // non-empty array replaces it with a COPY (never the caller's own
      // array reference).
      const nextConcepts: string[] | undefined =
        concepts === undefined ? undefined : concepts.length > 0 ? [...concepts] : undefined;
      // docs/post-questions-acceptance-criteria.md Q6: `questions` mirrors
      // `concepts` exactly, one parameter later - the same three-way switch,
      // the same "omitted means untouched" rule, the same COPY-never-alias
      // discipline.
      const nextQuestions: PostQuestion[] | undefined =
        questions === undefined ? undefined : questions.length > 0 ? [...questions] : undefined;
      const next = raw.map((r, i) =>
        i === idx
          ? {
              ...r,
              reply,
              userEdited,
              state: "ready" as const,
              error: null,
              ...(concepts === undefined ? {} : { concepts: nextConcepts }),
              ...(questions === undefined ? {} : { questions: nextQuestions }),
            }
          : r
      );
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  const markFailed = useCallback(
    (ids: string[], error: string) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      let changed = false;
      const next = rowsRef.current.map((r) => {
        if (!idSet.has(r.id)) return r;
        changed = true;
        return { ...r, state: "failed" as const, error };
      });
      if (!changed) return; // AC40
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  // ---------------------------------------------------------------------
  // D1/D9: the handledAt/skipped mutators - orthogonal per-row flags,
  // promoted onto ReplyRow itself (see that type's own doc comment,
  // discussion-serialization.ts). Neither gates on tableEpochRef/editSeqRef,
  // for the same reason applyResources/removeResource below do not: both
  // fields are disjoint from `reply`, so gating on the reply-edit generation
  // would discard a legitimate mark over an unrelated typo fix. Each is a
  // no-op (no commit, no scheduled save) when the value would not actually
  // change, mirroring every other mutator's AC40 discipline.
  // ---------------------------------------------------------------------

  const setHandledAt = useCallback(
    (id: string, at: number | null) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return; // row removed or table cleared under us
      const current = raw[idx].handledAt ?? null;
      if (current === at) return; // no-op: same reference, no commit, no save
      const next = raw.map((r, i) => (i === idx ? { ...r, handledAt: at === null ? undefined : at } : r));
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  const setSkipped = useCallback(
    (id: string, skipped: boolean) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const current = raw[idx].skipped === true;
      if (current === skipped) return;
      const next = raw.map((r, i) => (i === idx ? { ...r, skipped: skipped ? true : undefined } : r));
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  // ---------------------------------------------------------------------
  // docs/post-questions-acceptance-criteria.md Q6: removeQuestion. Mirrors
  // removeResource's own shape (useReplyRowResourceMutators.ts) exactly -
  // the pure row transform (`nextRowAfterRemoveQuestion`) lives in
  // discussion-serialization.ts, imported above, so it has a test surface
  // this useCallback body itself does not.
  // ---------------------------------------------------------------------

  const removeQuestion = useCallback(
    (id: string, question: string) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return; // AC40: row removed or table cleared under us
      const row = raw[idx];
      if (!row.questions?.some((q) => q.question === question)) return; // no-op: nothing to remove
      const next = raw.map((r, i) => (i === idx ? nextRowAfterRemoveQuestion(r, question) : r));
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  // ---------------------------------------------------------------------
  // docs/discussion-reply-resources-acceptance-criteria.md R3/R7, RC10: the
  // resource mutators themselves now live in useReplyRowResourceMutators.ts
  // - see that file's own header for the two guards (tableEpochRef,
  // editSeqRef) deliberately not applied to them. This hook only supplies
  // the refs/callbacks and spreads the seven callbacks back into its own
  // return below.
  // ---------------------------------------------------------------------

  const resourceMutators = useReplyRowResourceMutators({ rowsRef, resourceSeqRef, commitRows, scheduleSave });

  const bumpEditSeq = useCallback((id: string) => {
    editSeqRef.current.set(id, (editSeqRef.current.get(id) ?? 0) + 1);
  }, []);
  const snapshotEditSeq = useCallback((ids: string[]) => {
    const snap = new Map<string, number>();
    ids.forEach((id) => snap.set(id, editSeqRef.current.get(id) ?? 0));
    return snap;
  }, []);
  const isUnchangedSince = useCallback((id: string, snapshot: Map<string, number>) => {
    return (editSeqRef.current.get(id) ?? 0) === (snapshot.get(id) ?? 0);
  }, []);

  // AC14/F9: sorted for display, then filtered for display. A fresh array
  // reference whenever rawRows, sort or filterText changes; sortReplyRows
  // reorders and filterRowsByQuery narrows-by-reference, neither rebuilds a
  // row object, so untouched rows keep their identity (AC40/F9). Memoized
  // so a render triggered by something unrelated (e.g. persistError) does
  // not re-sort/re-filter and hand Set D's memoized rows a new array for
  // nothing. F0-2: this is the DISPLAY array only - `totalCount` below is
  // what every count/signature/empty-state site must read instead.
  const rows = useMemo(() => {
    const sorted = sortReplyRowsForTable(rawRows, sort);
    return filterRowsByQuery(sorted, filterText, REPLY_ROW_HAYSTACK);
  }, [rawRows, sort, filterText]);

  return {
    rows,
    sort,
    setSort,
    filterText,
    setFilterText,
    totalCount: rawRows.length,
    rawRows,
    mergeIncoming,
    moveRow,
    editReply,
    removeRow,
    setHandledAt,
    setSkipped,
    clearTable,
    markDrafting,
    applyReply,
    removeQuestion,
    markFailed,
    bumpEditSeq,
    snapshotEditSeq,
    isUnchangedSince,
    tableEpochRef,
    persistError,
    ...resourceMutators,
  };
}
