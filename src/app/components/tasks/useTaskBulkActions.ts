"use client";

// Bulk actions (AC6) - column bulk-set, row bulk-set, and Ctrl+D fill-down
// all funnel through one confirm + apply + announce pipeline. Extracted from
// TasksTab.tsx (line-budget split, matching tasksUiState.ts's own precedent
// - see that file's header comment) as this wave adds the BLOCKER 1/2 fixes
// below on top of what was already here.
//
// BLOCKER 1 (unconditional fill-down confirm) and the column/row threshold
// it leaves unchanged both live in bulkConfirmDecision.ts (pure, tested with
// frozen literals) - this hook only holds the STATEFUL half: the pending-
// confirm dialog state, the actual writes, and per-cell error reporting.
//
// BLOCKER 2: every branch below now reports outcome PER CELL through
// `reportCellError`/`clearCellError` (useTaskCellErrors.ts), not just as one
// aggregate announcement string - a course whose write failed keeps the same
// error ring/corner mark a failed single-cell edit already gets
// (TaskCell.tsx's `indicators.error`), rather than reverting silently. A
// course whose write SUCCEEDED clears any stale error left over from an
// earlier failed attempt at that same cell, the same way a successful
// single-cell save already does via handleCellChange's own clearCellError
// call.
import { useCallback, useState } from "react";
import { setTaskCellStatus, taskCellAt, type TaskCell as TaskCellValue, type TaskDefinition, type TaskStatus } from "@/lib/course-tasks";
import type { TaskRow } from "@/lib/course-tasks-view";
import type { WriteResult } from "./useCourseTasksData";
import {
  buildColumnBulkMessage,
  buildColumnBulkOutcome,
  buildFillDownMessage,
  buildFillDownOutcome,
  buildRowBulkMessage,
  buildRowBulkOutcome,
  decideFillDownConfirm,
  decideStatusBulkConfirm,
} from "./bulkConfirmDecision";

export type BulkAction =
  | { kind: "column"; task: TaskDefinition; status: TaskStatus }
  | { kind: "row"; courseId: string; courseName: string; status: TaskStatus }
  | { kind: "fill"; task: TaskDefinition; sourceCell: TaskCellValue; targetCourseIds: string[]; anchorCourseName: string };

export interface PendingBulk {
  action: BulkAction;
  /** Pre-built by the requesting handler (bulkConfirmDecision.ts) - the
   * Dialog below never recomputes this, so it can never disagree with the
   * decision that triggered it. */
  message: string;
}

export interface UseTaskBulkActionsArgs {
  sortedRows: TaskRow[];
  allRows: TaskRow[];
  visibleTasks: TaskDefinition[];
  nowMs: number;
  setCourseCells: (courseId: string, patch: Record<string, TaskCellValue | null>) => Promise<WriteResult>;
  reportCellError: (key: string, message: string) => void;
  clearCellError: (key: string) => void;
  setAnnouncement: (text: string) => void;
}

export interface UseTaskBulkActionsReturn {
  pendingBulk: PendingBulk | null;
  cancelBulk: () => void;
  confirmBulk: () => void;
  handleColumnBulkSet: (task: TaskDefinition, status: TaskStatus) => void;
  handleRowBulkSet: (courseId: string, courseName: string, status: TaskStatus) => void;
  handleFillDown: (task: TaskDefinition, sourceCell: TaskCellValue, targetCourseIds: string[], anchorCourseName: string) => void;
}

export function useTaskBulkActions({
  sortedRows,
  allRows,
  visibleTasks,
  nowMs,
  setCourseCells,
  reportCellError,
  clearCellError,
  setAnnouncement,
}: UseTaskBulkActionsArgs): UseTaskBulkActionsReturn {
  const [pendingBulk, setPendingBulk] = useState<PendingBulk | null>(null);

  const markCellOutcome = useCallback(
    (key: string, result: WriteResult) => {
      if (result.ok) clearCellError(key);
      else reportCellError(key, result.error ?? "Could not save.");
    },
    [clearCellError, reportCellError]
  );

  const applyBulk = useCallback(
    async (action: BulkAction) => {
      if (action.kind === "column") {
        const results = await Promise.all(
          sortedRows.map(async (row) => {
            const key = `${row.course.id}:${action.task.id}`;
            const result = await setCourseCells(row.course.id, {
              [action.task.id]: setTaskCellStatus(taskCellAt(row.cells, action.task.id), action.status, nowMs),
            });
            markCellOutcome(key, result);
            return result;
          })
        );
        const succeeded = results.filter((r) => r.ok).length;
        // S10: buildColumnBulkOutcome speaks TASK_STATUS_WORDS, not the raw
        // enum - `action.status` on its own produced announcements like "Set
        // Textbook Owned? to na for 3 courses."
        setAnnouncement(buildColumnBulkOutcome(action.task.label, action.status, succeeded, sortedRows.length));
        return;
      }
      if (action.kind === "row") {
        const row = allRows.find((r) => r.course.id === action.courseId);
        if (!row) return;
        const patch: Record<string, TaskCellValue> = {};
        for (const t of visibleTasks) patch[t.id] = setTaskCellStatus(taskCellAt(row.cells, t.id), action.status, nowMs);
        const result = await setCourseCells(action.courseId, patch);
        // One request covers every visible task for this course - a failure
        // does not say WHICH key inside the patch failed, so every task this
        // write touched gets marked (matching what actually reverted:
        // useCourseTasksData.ts's setCourseCells rolls the WHOLE course's
        // map back on any failure, never a subset).
        for (const t of visibleTasks) markCellOutcome(`${action.courseId}:${t.id}`, result);
        setAnnouncement(buildRowBulkOutcome(action.courseName, action.status, visibleTasks.length, result.ok, result.error));
        return;
      }
      // fill-down
      const results = await Promise.all(
        action.targetCourseIds.map(async (id) => {
          const key = `${id}:${action.task.id}`;
          const result = await setCourseCells(id, { [action.task.id]: action.sourceCell });
          markCellOutcome(key, result);
          return result;
        })
      );
      const succeeded = results.filter((r) => r.ok).length;
      setAnnouncement(buildFillDownOutcome(action.task.label, succeeded, action.targetCourseIds.length));
    },
    [sortedRows, allRows, visibleTasks, nowMs, setCourseCells, markCellOutcome, setAnnouncement]
  );

  const handleColumnBulkSet = (task: TaskDefinition, status: TaskStatus) => {
    const cells = sortedRows.map((row) => taskCellAt(row.cells, task.id));
    const decision = decideStatusBulkConfirm(cells, status);
    const action: BulkAction = { kind: "column", task, status };
    if (decision.requiresConfirm) {
      setPendingBulk({ action, message: buildColumnBulkMessage(task.label, status, decision.count) });
    } else {
      void applyBulk(action);
    }
  };

  const handleRowBulkSet = (courseId: string, courseName: string, status: TaskStatus) => {
    const row = allRows.find((r) => r.course.id === courseId);
    const cells = row ? visibleTasks.map((t) => taskCellAt(row.cells, t.id)) : [];
    const decision = decideStatusBulkConfirm(cells, status);
    const action: BulkAction = { kind: "row", courseId, courseName, status };
    if (decision.requiresConfirm) {
      setPendingBulk({ action, message: buildRowBulkMessage(courseName, status, decision.count) });
    } else {
      void applyBulk(action);
    }
  };

  const handleFillDown = (
    task: TaskDefinition,
    sourceCell: TaskCellValue,
    targetCourseIds: string[],
    anchorCourseName: string
  ) => {
    const cells = targetCourseIds.map((id) => {
      const row = allRows.find((r) => r.course.id === id);
      return row ? taskCellAt(row.cells, task.id) : taskCellAt({}, task.id);
    });
    const decision = decideFillDownConfirm(cells, sourceCell);
    const action: BulkAction = { kind: "fill", task, sourceCell, targetCourseIds, anchorCourseName };
    if (decision.requiresConfirm) {
      setPendingBulk({ action, message: buildFillDownMessage(task.label, sourceCell.status, decision, anchorCourseName) });
    } else {
      void applyBulk(action);
    }
  };

  const cancelBulk = () => setPendingBulk(null);
  const confirmBulk = () => {
    if (!pendingBulk) return;
    const action = pendingBulk.action;
    setPendingBulk(null);
    void applyBulk(action);
  };

  return { pendingBulk, cancelBulk, confirmBulk, handleColumnBulkSet, handleRowBulkSet, handleFillDown };
}
