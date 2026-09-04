"use client";

// Message replies (Manual > Recording > Message replies) - the TABLE-lifetime
// hook. Mirrors src/app/components/recording/useReplyRows.ts's own shape
// (rows, sort, the sorted-for-display array, the editSeq/tableEpoch
// generation guards, the row mutators, the `ta-rec-msg-table` /
// `ta-rec-msg-sort` / `ta-rec-msg-filter` persistence) but is smaller: per
// docs/message-replies-acceptance-criteria.md section 0, this feature drops
// the resource lane and the thread-position lane, so none of that file's
// resourceSeq/useReplyRowResourceMutators machinery lives here. It adds
// three mutators that file has no analogue for - `setCanvasMatch`,
// `setSavedDraft`, `setSent` - for M15/M16/M17's own row fields
// (message-serialization.ts's `canvas`/`savedDraft`/`sent`).
//
// THE SAME SINGLE-WRITER INVARIANT useReplyRows.ts's own header documents
// applies here verbatim: the orchestrator's two async loops
// (useMessageReplies.ts) call these mutators after an `await`, so every
// mutator reads exclusively from `rowsRef.current` (never a state closure),
// computes `next`, assigns `rowsRef.current = next` synchronously, and only
// then calls `commitRows`, which schedules the React state write. This hook
// is the sole writer of `rows`.
//
// Keys are whole string literals throughout (never a template literal) -
// message-replies.structure.test.ts's directory-wide `ta-` key ordinal
// canary (M3) derives its key set with a regex over the literal source, the
// same AC55 discipline useReplyRows.ts's own STORAGE_KEY_TABLE comment
// records: spelling the bare prefix out in prose gets harvested as a fake key.

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { filterRowsByQuery } from "../recording/discussion-table-view";
import {
  sortMessageRows,
  swapAdjacentThreads,
  type MessageSort,
} from "./message-capture";
import {
  serializeMessageTable,
  deserializeMessageTable,
  type MessageThreadRow,
  type MessageRowState,
} from "./message-serialization";
import { mergeCapturedMessages } from "./message-thread";

const STORAGE_KEY_TABLE = "ta-rec-msg-table";
const STORAGE_KEY_SORT = "ta-rec-msg-sort";
const STORAGE_KEY_FILTER = "ta-rec-msg-filter";

const STRUCTURAL_DEBOUNCE_MS = 400;
const TYPING_DEBOUNCE_MS = 1000;

const STORAGE_FULL_MESSAGE =
  "There is no room left to save the message table. Your replies still work until you reload - copy the ones you need, then remove threads you are done with.";

const DEFAULT_SORT: MessageSort = "captured";

const VALID_SORTS: ReadonlyArray<MessageSort> = [
  "captured",
  "first-asc",
  "first-desc",
  "last-asc",
  "last-desc",
  "subject-asc",
  "subject-desc",
  "custom",
];

function isMessageSort(value: unknown): value is MessageSort {
  return typeof value === "string" && (VALID_SORTS as readonly string[]).includes(value);
}

const MESSAGE_ROW_HAYSTACK = (row: MessageThreadRow): string[] => [
  row.subject,
  row.student,
  row.reply,
  ...row.messages.map((m) => m.text),
];

export interface UseMessageRowsReturn {
  /** Sorted AND filtered for display; a fresh array reference whenever
   *  `rawRows`/`sort`/`filterText` changes, individual rows keep identity
   *  when untouched. */
  rows: MessageThreadRow[];
  sort: MessageSort;
  setSort: (next: MessageSort) => void;
  filterText: string;
  setFilterText: (next: string) => void;
  /** UNFILTERED row count - every count/progress-string/arming-signature
   *  site must read this, never `rows.length`. */
  totalCount: number;
  /** UNFILTERED row objects - a whole-table dispatch must read this, never
   *  the filtered `rows`. */
  rawRows: MessageThreadRow[];

  /** M9's `mergeCapturedMessages` wrapped with debounced persistence. `rows`
   *  on the return is the FULL post-merge table, synchronously current (the
   *  same `rowsRef.current` this hook's own mutators read) - callers that
   *  need to inspect an added/changed row's own fields (e.g. `answered`,
   *  `previewOnly`, to decide whether it should enter the automatic draft
   *  queue) must read it from here rather than `rawRows`, which only updates
   *  after the next render. */
  mergeIncoming: (
    entries: ReadonlyArray<{ subject: string; sender: string; text: string; sentAt?: string; pane: "list" | "thread" }>,
    opts: { instructorName: string; capturedAtMs: number; now: number }
  ) => { addedIds: string[]; capped: boolean; rows: MessageThreadRow[]; changed: boolean };

  /** M14's hover-reveal reorder pair, over the DISPLAYED order; a no-op at
   *  the boundary - the caller announces "Already first."/"Already last." */
  moveRow: (id: string, dir: "up" | "down") => void;

  /** Bumps editSeq before writing, sets userEdited, moves pending/failed to
   *  ready. */
  editReply: (id: string, text: string) => void;

  removeRow: (id: string) => void;

  /** `at: null` clears `handledAt`. */
  setHandledAt: (id: string, at: number | null) => void;

  /** Reversible; never implies removeRow. */
  setSkipped: (id: string, skipped: boolean) => void;

  /** Empties the table and bumps tableEpochRef so an in-flight extraction
   *  merge cannot resurrect the threads just deleted. */
  clearTable: () => void;

  /** Flips the given ids to "drafting", clearing any stale error. */
  markDrafting: (ids: string[]) => void;

  /** Applies a drafted reply, sets ready. Caller must already have checked
   *  `isUnchangedSince`. `userEdited` defaults false; pass the row's own
   *  current value when re-applying its OWN text (the discard path). */
  applyReply: (id: string, reply: string, userEdited?: boolean) => void;

  /** Same edit-guard expectation as applyReply. */
  markFailed: (ids: string[], error: string) => void;

  // The per-row generation guard.
  bumpEditSeq: (id: string) => void;
  snapshotEditSeq: (ids: string[]) => Map<string, number>;
  isUnchangedSince: (id: string, snapshot: Map<string, number>) => boolean;

  /** The whole-table generation guard, exposed as the live ref itself -
   *  `clearTable` bumps it, and a whole-table rewrite should bump the SAME
   *  counter directly. */
  tableEpochRef: MutableRefObject<number>;

  /** The exact message once the last localStorage write failed; null once a
   *  write succeeds again. In-memory rows keep working regardless. */
  persistError: string | null;

  // -----------------------------------------------------------------------
  // M15/M16/M17: three mutators useReplyRows.ts has no analogue for. None
  // gate on tableEpochRef/editSeqRef - each is orthogonal to a reply's own
  // text, the same reasoning setHandledAt/setSkipped rest on.
  // -----------------------------------------------------------------------

  /** M15: sets the row's Canvas-match snapshot. A no-op when the row already
   *  carries the identical match (by conversationId). Always clears
   *  `matchOutcome` in the same commit - a matched row never also carries a
   *  stale "none"/"ambiguous" reading. */
  setCanvasMatch: (id: string, canvas: NonNullable<MessageThreadRow["canvas"]>) => void;

  /** M15: records the match pass's own outcome ("none"/"ambiguous") for a
   *  row it examined and could not match. A no-op when the row already
   *  carries the identical outcome, or already carries a `canvas` match
   *  (matchOutcome and canvas never coexist - see setCanvasMatch above). */
  setMatchOutcome: (id: string, outcome: "none" | "ambiguous") => void;

  /** M16: records a successful "Save as draft" dispatch. */
  setSavedDraft: (id: string, savedDraft: NonNullable<MessageThreadRow["savedDraft"]>) => void;

  /** M17: records a successful send. Also sets `handledAt` in the SAME
   *  commit ("Success sets sent: {...} and handledAt") so a reload can never
   *  observe one without the other, and clears `sendAttempt`/`sendError` in
   *  that same commit - a sent row never also carries a stale in-flight
   *  attempt or failure text. */
  setSent: (id: string, sent: NonNullable<MessageThreadRow["sent"]>, handledAt: number) => void;

  /** M17: written BEFORE the send fetch goes out, so a reload mid-flight
   *  still remembers an attempt was made (message-serialization.ts's own
   *  load-time hydration reads this). */
  setSendAttempt: (id: string, attempt: NonNullable<MessageThreadRow["sendAttempt"]>) => void;

  /** M17: records a failed send's exact failure text. */
  setSendError: (id: string, error: string) => void;
}

export function useMessageRows(): UseMessageRowsReturn {
  const [rawRows, setRawRows] = useState<MessageThreadRow[]>(() => {
    if (typeof window === "undefined") return [];
    return deserializeMessageTable(window.localStorage.getItem(STORAGE_KEY_TABLE));
  });
  const [sort, setSortState] = useState<MessageSort>(() => {
    if (typeof window === "undefined") return DEFAULT_SORT;
    const stored = window.localStorage.getItem(STORAGE_KEY_SORT);
    return isMessageSort(stored) ? stored : DEFAULT_SORT;
  });
  const [filterText, setFilterTextState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEY_FILTER) ?? "";
  });
  const [persistError, setPersistError] = useState<string | null>(null);

  const rowsRef = useRef<MessageThreadRow[]>(rawRows);
  const sortRef = useRef<MessageSort>(sort);
  const filterTextRef = useRef<string>(filterText);

  const editSeqRef = useRef<Map<string, number>>(new Map());
  const tableEpochRef = useRef(0);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistTableNow = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY_TABLE, serializeMessageTable(rowsRef.current));
      setPersistError(null);
    } catch {
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

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      try {
        window.localStorage.setItem(STORAGE_KEY_TABLE, serializeMessageTable(rowsRef.current));
      } catch {
        // Unmounting - there is nowhere left to surface this.
      }
    };
  }, []);

  const commitRows = useCallback((next: MessageThreadRow[]) => {
    rowsRef.current = next;
    setRawRows((prev) => {
      void prev; // see the file header: prev === rowsRef.current-before-this-call, always
      return next;
    });
  }, []);

  const setSort = useCallback((next: MessageSort) => {
    sortRef.current = next;
    setSortState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY_SORT, next);
      setPersistError(null);
    } catch {
      setPersistError(STORAGE_FULL_MESSAGE);
    }
  }, []);

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
        // Best-effort - see useReplyRows.ts's own identical rationale.
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
        // Unmounting.
      }
    };
  }, []);

  const mergeIncoming = useCallback(
    (
      entries: ReadonlyArray<{ subject: string; sender: string; text: string; sentAt?: string; pane: "list" | "thread" }>,
      opts: { instructorName: string; capturedAtMs: number; now: number }
    ) => {
      const before = rowsRef.current;
      const merged = mergeCapturedMessages(before, entries, opts);
      const finalRows = merged.rows;
      const changed = finalRows.length !== before.length || finalRows.some((r, i) => r !== before[i]);
      if (changed) {
        commitRows(finalRows);
        scheduleSave(STRUCTURAL_DEBOUNCE_MS);
      }
      return { addedIds: merged.addedIds, capped: merged.capped, rows: finalRows, changed };
    },
    [commitRows, scheduleSave]
  );

  const moveRow = useCallback(
    (id: string, dir: "up" | "down") => {
      const curSort = sortRef.current;
      const displayed = sortMessageRows(rowsRef.current, curSort);
      if (!displayed.some((r) => r.id === id)) return;

      const visibleIds = filterRowsByQuery(displayed, filterTextRef.current, MESSAGE_ROW_HAYSTACK).map((r) => r.id);
      const visibleIndex = visibleIds.indexOf(id);
      if (visibleIndex === -1) return;
      const targetIndex = dir === "up" ? visibleIndex - 1 : visibleIndex + 1;
      if (targetIndex < 0 || targetIndex >= visibleIds.length) return; // boundary - caller announces this locally

      const result = swapAdjacentThreads(displayed, curSort, id, visibleIds[targetIndex]);
      if (result.atBoundary) return;

      commitRows(result.rows);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);

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
      if (idx === -1) return;

      const prevSeq = editSeqRef.current.get(id) ?? 0;
      editSeqRef.current.set(id, prevSeq + 1);

      const row = raw[idx];
      const nextState: MessageRowState = row.state === "pending" || row.state === "failed" ? "ready" : row.state;
      const next = raw.map((r, i) => (i === idx ? { ...r, reply: text, userEdited: true, state: nextState, error: undefined } : r));
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
    tableEpochRef.current += 1;
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
        return { ...r, state: "drafting" as const, error: undefined };
      });
      if (!changed) return;
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  const applyReply = useCallback(
    (id: string, reply: string, userEdited: boolean = false) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const next = raw.map((r, i) => (i === idx ? { ...r, reply, userEdited, state: "ready" as const, error: undefined } : r));
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
      if (!changed) return;
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  const setHandledAt = useCallback(
    (id: string, at: number | null) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const current = raw[idx].handledAt ?? null;
      if (current === at) return;
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

  const setCanvasMatch = useCallback(
    (id: string, canvas: NonNullable<MessageThreadRow["canvas"]>) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const row = raw[idx];
      if (row.canvas?.conversationId === canvas.conversationId) return; // already matched to the same conversation
      const next = raw.map((r, i) => (i === idx ? { ...r, canvas, matchOutcome: undefined } : r));
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  const setMatchOutcome = useCallback(
    (id: string, outcome: "none" | "ambiguous") => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const row = raw[idx];
      if (row.canvas || row.matchOutcome === outcome) return; // a matched row never gets an outcome; identical outcome is a no-op
      const next = raw.map((r, i) => (i === idx ? { ...r, matchOutcome: outcome } : r));
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  const setSavedDraft = useCallback(
    (id: string, savedDraft: NonNullable<MessageThreadRow["savedDraft"]>) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const next = raw.map((r, i) => (i === idx ? { ...r, savedDraft } : r));
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  const setSent = useCallback(
    (id: string, sent: NonNullable<MessageThreadRow["sent"]>, handledAt: number) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const next = raw.map((r, i) => (i === idx ? { ...r, sent, handledAt, sendAttempt: undefined, sendError: undefined } : r));
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  const setSendAttempt = useCallback(
    (id: string, attempt: NonNullable<MessageThreadRow["sendAttempt"]>) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const next = raw.map((r, i) => (i === idx ? { ...r, sendAttempt: attempt } : r));
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [commitRows, scheduleSave]
  );

  const setSendError = useCallback(
    (id: string, error: string) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      if (raw[idx].sendError === error) return;
      const next = raw.map((r, i) => (i === idx ? { ...r, sendError: error } : r));
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

  const rows = useMemo(() => {
    const sorted = sortMessageRows(rawRows, sort);
    return filterRowsByQuery(sorted, filterText, MESSAGE_ROW_HAYSTACK);
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
    markFailed,
    bumpEditSeq,
    snapshotEditSeq,
    isUnchangedSince,
    tableEpochRef,
    persistError,
    setCanvasMatch,
    setMatchOutcome,
    setSavedDraft,
    setSent,
    setSendAttempt,
    setSendError,
  };
}
