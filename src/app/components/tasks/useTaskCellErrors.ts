"use client";

// The Tasks grid's per-cell save-error map (AC5, AC6 item 33) - extracted
// from TasksTab.tsx (line-budget split, matching tasksUiState.ts's own
// precedent) so the bulk-action hook (useTaskBulkActions.ts) and the
// single-cell edit path (TasksTab.tsx's handleCellChange) can share ONE
// error map without either owning the other.
//
// SHOULD 7 (Tasks-tab UX audit): a failed cell save used to erase its own
// error marker on a six-second `window.setTimeout`, while the cell's VALUE
// had already reverted (useCourseTasksData.ts's optimistic-write revert) -
// so once the timer fired, the marker vanished and the cell just quietly
// showed the pre-edit status again, with no explanation left on screen for
// an instructor who was looking at another column for ten seconds. This
// hook holds NO timer at all: `clearCellError` is called only from two
// places, both deliberate - the start of the NEXT save attempt for that same
// (courseId, taskId) key (TasksTab.tsx's handleCellChange, unchanged), and a
// bulk write that SUCCEEDED for a key that previously failed
// (useTaskBulkActions.ts). The error is "armed for a (courseId, taskId)
// attempt" - a new attempt is what invalidates it, never a clock.
import { useState } from "react";

export interface UseTaskCellErrorsReturn {
  /** Keyed `${courseId}:${taskId}`. */
  cellErrors: Record<string, string>;
  /** Sets (or replaces) the error message for one cell. Bare - callers that
   * also need to announce the failure (TasksTab.tsx's single-cell path) wrap
   * this rather than this hook reaching into the tab's own live region. */
  reportCellError: (key: string, message: string) => void;
  clearCellError: (key: string) => void;
}

export function useTaskCellErrors(): UseTaskCellErrorsReturn {
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});

  const clearCellError = (key: string) => {
    setCellErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const reportCellError = (key: string, message: string) => {
    setCellErrors((prev) => ({ ...prev, [key]: message }));
  };

  return { cellErrors, reportCellError, clearCellError };
}
