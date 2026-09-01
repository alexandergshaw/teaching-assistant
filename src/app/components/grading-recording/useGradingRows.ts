"use client";

// Grading from a screen recording - the TABLE-lifetime state leaf. Owns
// `rows`, `sort`, `filterText`, the sorted-and-filtered display array, and
// the row mutators (editField / applyGradingResult / applyRosterMatch /
// setAllRows / removeRow / clearTable). Mirrors useReplyRows.ts's shape
// deliberately (same "own the table's whole lifetime, mutate through
// synchronous ref reads, delegate sort/filter/guard logic to a pure leaf"
// structure) but is far smaller: this wave builds no capture loop, no
// extraction merge, and no grading dispatch pipeline (R0/R5 of the AC - all
// three are a sibling EXTRACTION wave's job), so there is none of
// useReplyRows.ts's generation-guard (editSeq/tableEpoch/resourceSeq)
// machinery here - nothing in this file races an in-flight async request
// against a table mutation, because nothing in this file dispatches one.
//
// REACHABILITY: GradingRecordingPanel.tsx calls this hook once and renders
// <GradingTable> with its fields - `setAllRows`/`applyGradingResult` are the
// live seam the extraction/grading dispatch pipeline writes GradingRow
// objects through (syncGradingRowsFromExtracted / classifyGradingResult in
// grading-rows.ts), and `removeRow`/`clearTable` are the live seam
// GradingTable/GradingTableRow's Remove and Clear table controls call
// through.
//
// PERSISTENCE SCOPE (a judgment call, noted for review): only the two UI
// controls (`filterText`, `sort`) are persisted to localStorage here, NOT
// the `rows` array itself - unlike useReplyRows.ts's own STORAGE_KEY_TABLE,
// which persists the whole captured reply table across reloads. Two
// reasons: (1) nothing produces GradingRow objects yet in this wave (no
// capture/extraction caller exists - see above), so there is no real
// "reload mid-session" scenario to protect against today, and (2)
// GradingRow explicitly carries no field that could ever be written to
// `grading_drafts` (grading-row.ts's own header, R0-2) - persisting the raw
// rows to localStorage would not violate that boundary (localStorage is not
// the database table R0-2 forbids), but committing to a serialization
// format for a row shape a sibling wave has not finished driving felt
// premature. This can be revisited once a capture/extraction caller exists.
//
// Keys are whole string literals throughout this file (never a template
// literal) - this directory's own canary
// (grading-rows.test.ts's "grading-recording persisted key canary" block)
// derives its key set with a regex over the literal source, mirroring
// recording-split.structure.test.ts's AC55 discipline for the same reason:
// see useReplyRows.ts's STORAGE_KEY_TABLE comment for the exact footgun
// (writing the bare prefix in prose gets harvested as a fake key).

import { useCallback, useMemo, useRef, useState } from "react";
import {
  sortGradingRowsForTable,
  filterGradingRowsForTable,
  isGradingSort,
  editGradingRowField,
  applyGradingResultToRow,
  applyRosterMatchToRow,
  removeGradingRow,
  DEFAULT_GRADING_SORT,
  type GradingSort,
  type GradingFeedbackField,
  type GradingResultInput,
} from "./grading-rows";
import type { GradingRow, GradingRowNameMatch } from "./grading-row";

const STORAGE_KEY_FILTER = "ta-rec-grade-filter";
const STORAGE_KEY_SORT = "ta-rec-grade-sort";

export interface UseGradingRowsReturn {
  /** Sorted AND filtered for display. A fresh array whenever `rawRows`,
   *  `sort` or `filterText` changes; individual row objects keep the same
   *  reference when untouched, mirroring useReplyRows.ts's own `rows`
   *  (F9's discipline, inherited via filterGradingRowsForTable). */
  rows: GradingRow[];
  /** The UNFILTERED row count - read this, never `rows.length`, for any
   *  count/empty-state/arming decision that must describe the whole table
   *  regardless of the search box (useReplyRows.ts's own F0-2/F11 rule). */
  totalCount: number;
  /** The UNFILTERED rows themselves, for a caller that needs to act on the
   *  whole table rather than what is currently visible. */
  rawRows: GradingRow[];

  sort: GradingSort;
  setSort: (next: GradingSort) => void;
  filterText: string;
  setFilterText: (next: string) => void;

  /** The seam a future capture/extraction caller (not built in this wave)
   *  is expected to call once it has produced and roster-matched rows -
   *  see this file's own REACHABILITY NOTE. Replaces the whole table. */
  setAllRows: (rows: GradingRow[]) => void;

  /** An instructor typing into a feedback field - marks the row userEdited
   *  (grading-rows.ts's editGradingRowField). */
  editField: (id: string, field: GradingFeedbackField, value: string) => void;

  /** Item 5's guard: applies a (future) grading pass's result through
   *  applyGradingResultToRow, which refuses to overwrite an edited row's
   *  scored fields. The caller does not need to check `userEdited` itself -
   *  this function's whole point is that the check happens here, once. */
  applyGradingResult: (id: string, result: GradingResultInput) => void;

  /** Merges a roster-match verdict onto a row (grading-roster-match.ts's
   *  matchNameAgainstRoster is expected to produce the argument). */
  applyRosterMatch: (id: string, match: { nameMatch: GradingRowNameMatch; rosterCandidates: readonly string[] }) => void;

  removeRow: (id: string) => void;
  clearTable: () => void;
}

export function useGradingRows(): UseGradingRowsReturn {
  const [rawRows, setRawRows] = useState<GradingRow[]>([]);

  // Read-once-in-the-initializer, guarded by `typeof window` - mirrors
  // useReplyRows.ts's own sort/filter initializers. The table is not owned
  // by a capture session, so these two controls outlive one.
  const [sort, setSortState] = useState<GradingSort>(() => {
    if (typeof window === "undefined") return DEFAULT_GRADING_SORT;
    const stored = window.localStorage.getItem(STORAGE_KEY_SORT);
    return isGradingSort(stored) ? stored : DEFAULT_GRADING_SORT;
  });
  const [filterText, setFilterTextState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEY_FILTER) ?? "";
  });

  // The single synchronously-fresh source of truth for the row array -
  // mirrors useReplyRows.ts's rowsRef discipline (see that file's own
  // header for the staleness reasoning this avoids). Every mutator below
  // reads/writes rowsRef.current, never a `rawRows` closure.
  const rowsRef = useRef<GradingRow[]>(rawRows);

  const commitRows = useCallback((next: GradingRow[]) => {
    rowsRef.current = next;
    setRawRows(next);
  }, []);

  const setSort = useCallback((next: GradingSort) => {
    setSortState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY_SORT, next);
    } catch {
      // Best-effort, mirrors useReplyRows.ts's own low-stakes-control
      // handling for its filter key: losing this persistence does not
      // affect the in-memory table.
    }
  }, []);

  const setFilterText = useCallback((next: string) => {
    setFilterTextState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY_FILTER, next);
    } catch {
      // Best-effort - see setSort's own comment above.
    }
  }, []);

  const setAllRows = useCallback(
    (next: GradingRow[]) => {
      commitRows(next);
    },
    [commitRows]
  );

  const editField = useCallback(
    (id: string, field: GradingFeedbackField, value: string) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return; // row is gone - intentional no-op, mirrors editReply's own AC40 discipline
      const next = raw.map((r, i) => (i === idx ? editGradingRowField(r, field, value) : r));
      commitRows(next);
    },
    [commitRows]
  );

  const applyGradingResult = useCallback(
    (id: string, result: GradingResultInput) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const next = raw.map((r, i) => (i === idx ? applyGradingResultToRow(r, result) : r));
      commitRows(next);
    },
    [commitRows]
  );

  const applyRosterMatch = useCallback(
    (id: string, match: { nameMatch: GradingRowNameMatch; rosterCandidates: readonly string[] }) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const next = raw.map((r, i) => (i === idx ? applyRosterMatchToRow(r, match) : r));
      commitRows(next);
    },
    [commitRows]
  );

  const removeRow = useCallback(
    (id: string) => {
      const raw = rowsRef.current;
      const next = removeGradingRow(raw, id);
      if (next === raw) return; // row is gone - intentional no-op, mirrors editField's own discipline
      commitRows(next);
    },
    [commitRows]
  );

  const clearTable = useCallback(() => {
    commitRows([]);
  }, [commitRows]);

  const rows = useMemo(() => {
    const sorted = sortGradingRowsForTable(rawRows, sort);
    return filterGradingRowsForTable(sorted, filterText);
  }, [rawRows, sort, filterText]);

  return {
    rows,
    totalCount: rawRows.length,
    rawRows,
    sort,
    setSort,
    filterText,
    setFilterText,
    setAllRows,
    editField,
    applyGradingResult,
    applyRosterMatch,
    removeRow,
    clearTable,
  };
}
