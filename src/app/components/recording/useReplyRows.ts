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
  sortReplyRows,
  moveRow as moveRowPure,
  serializeReplyTable,
  deserializeReplyTable,
  type ReplyRow,
  type ReplyRowState,
  type ReplySort,
} from "./discussion-capture";

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

// AC23: two debounces. Structural changes (merge, reorder, remove, a
// drafted reply landing) are rare and the user expects immediate
// durability; typing is frequent and a keystroke is not worth a 400ms
// round trip when AC57 already flushes once more on unmount.
const STRUCTURAL_DEBOUNCE_MS = 400;
const TYPING_DEBOUNCE_MS = 1000;

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

const VALID_SORTS: ReadonlyArray<ReplySort> = [
  "captured-asc",
  "captured-desc",
  "name-asc",
  "name-desc",
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
  /** Already sorted for display (AC14). A fresh array reference every time
   *  `rawRows` or `sort` changes; individual row objects keep the same
   *  reference when untouched (AC40), which is what lets Set D's
   *  `React.memo` rows skip re-rendering. */
  rows: ReplyRow[];
  sort: ReplySort;
  setSort: (next: ReplySort) => void;

  /** AC12 (set A's pure `mergeCapturedPosts`, which itself enforces the
   *  AC23b row ceiling and reports `capped` - see BL5) wrapped with the
   *  AC23/AC57 debounced persistence. Returns the ids actually added and
   *  whether the ceiling refused at least one of them. `now` defaults to
   *  `Date.now()` - AC13's "pure, takes now as an argument" binds the
   *  underlying `mergeCapturedPosts`, not this wrapper; an optional
   *  override is kept for a future test. */
  mergeIncoming: (
    incoming: ReadonlyArray<{ author: string; text: string; postedAt?: string }>,
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
   *  path), so a hand-typed reply keeps its "Yours" badge. */
  applyReply: (id: string, reply: string, userEdited?: boolean) => void;

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
  const [persistError, setPersistError] = useState<string | null>(null);

  // The single synchronously-fresh source of truth - see the file header.
  const rowsRef = useRef<ReplyRow[]>(rawRows);
  const sortRef = useRef<ReplySort>(sort);

  // AC42/AC44/AC45: non-React bookkeeping in refs, mutated only in handler
  // bodies below, never inside a setRows updater.
  const editSeqRef = useRef<Map<string, number>>(new Map());
  const tableEpochRef = useRef(0);

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

  const mergeIncoming = useCallback(
    (incoming: ReadonlyArray<{ author: string; text: string; postedAt?: string }>, now: number = Date.now()) => {
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

  // BL4: delegates to discussion-capture.ts's tested `moveRow` (previously
  // this hook carried its own inline reimplementation which cloned every
  // row unconditionally - `displayed.map((r, i) => ({ ...r, order: i }))` -
  // instead of preserving identity for rows that did not move, violating
  // AC40 and defeating Set D's React.memo on every row after any Name/
  // Captured sort. The pure version already gets this right and is already
  // unit-tested; importing it is the fix.
  const moveRow = useCallback(
    (id: string, dir: "up" | "down") => {
      const curSort = sortRef.current;
      const displayed = sortReplyRows(rowsRef.current, curSort);
      if (!displayed.some((r) => r.id === id)) return; // AC40: the row is gone under us - intentional no-op

      const result = moveRowPure(displayed, curSort, id, dir);
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
      const next = raw.map((r, i) =>
        i === idx ? { ...r, reply: text, userEdited: true, state: nextState, error: null } : r
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
      commitRows(raw.filter((r) => r.id !== id));
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  const clearTable = useCallback(() => {
    editSeqRef.current.clear();
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
    (id: string, reply: string, userEdited: boolean = false) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return; // AC40: row removed or table cleared under us
      const next = raw.map((r, i) =>
        i === idx ? { ...r, reply, userEdited, state: "ready" as const, error: null } : r
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

  // AC14: the sorted-for-display array. A fresh array reference whenever
  // rawRows or sort changes; sortReplyRows (set A) reorders, it does not
  // rebuild, so untouched row objects keep their identity (AC40). Memoized
  // so a render triggered by something unrelated (e.g. persistError) does
  // not re-sort and hand Set D's memoized rows a new array for nothing.
  const rows = useMemo(() => sortReplyRows(rawRows, sort), [rawRows, sort]);

  return {
    rows,
    sort,
    setSort,
    mergeIncoming,
    moveRow,
    editReply,
    removeRow,
    clearTable,
    markDrafting,
    applyReply,
    markFailed,
    bumpEditSeq,
    snapshotEditSeq,
    isUnchangedSince,
    tableEpochRef,
    persistError,
  };
}
