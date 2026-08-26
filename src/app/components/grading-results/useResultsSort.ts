"use client";

// The results table's sort state and derived sorted row list - moved out of
// GradingResults.tsx (originally the `sortState` useState at :163, and the
// `sortedResults` useMemo / `handleSort` / `sortLabel` block at :407-467) as
// its own hook. Pure MOVE, not a rewrite: same state, same effects, same
// three functions, called unconditionally once per GradingResults render
// exactly as the inline useState/useMemo were - a custom hook has no
// lifecycle GradingResults.tsx's own useState/useMemo calls did not already
// have, so relocating this block into a hook changes where the code LIVES,
// not when or how it runs.
//
// `sortState` is deliberately never reset when `run` changes - the pre-move
// component's own run-change reset block (GradingResults.tsx's `if (run !==
// prevRun)`) never touched it either, so a sort the instructor picked stays
// applied across a run refresh. The actual row-ordering comparator
// (sortGradeRows) is a separate, genuinely pure function in
// gradingResultsHelpers.ts - this hook only owns the STATEFUL half: holding
// `sortState` and recomputing the sorted list via useMemo when it or `run`
// changes.
import { useMemo, useState } from "react";
import {
  DEFAULT_SORT,
  sortColumnKey,
  sortGradeRows,
  type GradeRow,
  type GradingRun,
  type SortColumn,
} from "./gradingResultsHelpers";

export interface UseResultsSortResult {
  sortedResults: GradeRow[];
  sortState: typeof DEFAULT_SORT;
  handleSort: (column: SortColumn) => void;
  sortLabel: (column: SortColumn) => string;
}

export function useResultsSort(run: GradingRun): UseResultsSortResult {
  const [sortState, setSortState] = useState(DEFAULT_SORT);

  const sortedResults = useMemo(() => sortGradeRows(run.results, sortState), [run, sortState]);

  const handleSort = (column: SortColumn) => {
    const nextKey = sortColumnKey(column);
    const currentKey = sortColumnKey(sortState.column);
    if (nextKey === currentKey) {
      setSortState((current) => ({
        ...current,
        direction: current.direction === "asc" ? "desc" : "asc",
      }));
      return;
    }
    setSortState({ column, direction: "asc" });
  };

  const sortLabel = (column: SortColumn) => {
    if (sortColumnKey(column) !== sortColumnKey(sortState.column)) return "↕";
    return sortState.direction === "asc" ? "↑" : "↓";
  };

  return { sortedResults, sortState, handleSort, sortLabel };
}

export default useResultsSort;
