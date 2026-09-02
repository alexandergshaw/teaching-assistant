"use client";

// Column reorder orchestration for the Tasks tab (AC1-AC7, docs/tasks-
// column-reorder-acceptance-criteria.md) - pulled out of TasksTab.tsx, which
// was again closing on this repo's 1000-line ceiling, for the same reason
// useColumnDrag.ts was pulled out of TasksGrid.tsx when THAT file hit the
// same cap (see that hook's own header comment): a self-contained "use*"
// hook's worth of state - the debounced reorder-announcement ref pair, plus
// the three handlers that turn a columnOrder.ts result into a persisted
// write - that nothing else in TasksTab.tsx reaches into directly. Every
// pure decision (which column moves where) still lives in columnOrder.ts,
// untouched; this hook is only the impure glue TasksTab.tsx already needed
// around it (the debounce timer, and the actual saveDefs call).
import { useCallback, useRef, useState } from "react";
import {
  debounceElapsed,
  groupPositionAssignments,
  isValidDropTarget,
  moveToGroupEdge,
  moveWithinGroup,
  positionWithinGroup,
  stepWithinGroup,
  type ReorderableColumn,
} from "./columnOrder";
import { baseTaskCatalogOverride, type TaskCatalogOverride } from "@/lib/course-tasks-view";
import type { TaskDefinition } from "@/lib/course-tasks";

export interface UseTaskColumnReorderArgs {
  /** Built by TasksTab from resolvedCatalog + visibleColumnIds (C5) - see
   * that file's own comment on why this must never be built from a
   * visible-only list. Passed straight through to columnOrder.ts. */
  reorderColumns: ReorderableColumn[];
  /** Label lookup only - the same resolvedCatalog TasksTab already
   * computed. */
  resolvedCatalog: Array<{ id: string; label: string }>;
  groups: Array<{ id: string; label: string }>;
  builtIns: TaskDefinition[];
  overrides: TaskCatalogOverride[];
  saveDefs: (overrides: TaskCatalogOverride[]) => Promise<{ ok: boolean; error?: string }>;
}

export interface UseTaskColumnReorderReturn {
  reorderAnnouncement: string;
  handleReorderStep: (taskId: string, direction: "left" | "right") => void;
  handleReorderDrop: (draggedTaskId: string, targetTaskId: string) => void;
  handleMoveColumn: (taskId: string, kind: "left" | "right" | "start" | "end") => void;
}

export function useTaskColumnReorder({
  reorderColumns,
  resolvedCatalog,
  groups,
  builtIns,
  overrides,
  saveDefs,
}: UseTaskColumnReorderArgs): UseTaskColumnReorderReturn {
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const lastReorderFlushRef = useRef<number | null>(null);
  const pendingReorderRef = useRef<{ text: string; timeout: number } | null>(null);

  // AC5 item 19: debounced to 100ms via the pure debounceElapsed helper, so
  // a fast drag's rapid position changes announce at most every 100ms - the
  // trailing-most text always wins once the interval elapses.
  const announceReorder = useCallback((text: string) => {
    const now = Date.now();
    if (debounceElapsed(lastReorderFlushRef.current, now)) {
      lastReorderFlushRef.current = now;
      setReorderAnnouncement(text);
      return;
    }
    if (pendingReorderRef.current) window.clearTimeout(pendingReorderRef.current.timeout);
    const timeout = window.setTimeout(() => {
      lastReorderFlushRef.current = Date.now();
      setReorderAnnouncement(text);
      pendingReorderRef.current = null;
    }, 100);
    pendingReorderRef.current = { text, timeout };
  }, []);

  // AC2: the ONE place that turns a columnOrder.ts result into a bulk
  // write. A move that returns null (already at the edge, cross-group,
  // unknown id) is simply dropped; the pure layer already decided it was
  // not a real move.
  const applyReorder = useCallback(
    async (moved: ReorderableColumn[] | null, movedTaskId: string) => {
      if (!moved) return;
      const groupId = moved.find((c) => c.id === movedTaskId)?.group;
      if (!groupId) return;
      const label = resolvedCatalog.find((t) => t.id === movedTaskId)?.label ?? movedTaskId;
      const nextOverrides = groupPositionAssignments(moved, groupId).map((a) => ({
        ...baseTaskCatalogOverride(a.taskId, builtIns, overrides),
        position: a.position,
      }));
      const result = await saveDefs(nextOverrides);
      if (!result.ok) {
        announceReorder(`Could not reorder ${label}: ${result.error ?? "save failed"}.`);
        return;
      }
      // AC5 item 20: the pure module supplies index/total only - the label
      // and group label come from here, which already holds both.
      const pos = positionWithinGroup(moved, movedTaskId);
      const groupLabel = groups.find((g) => g.id === groupId)?.label ?? "";
      if (pos) announceReorder(`${label} moved to position ${pos.index} of ${pos.total} in ${groupLabel}.`);
    },
    [resolvedCatalog, builtIns, overrides, saveDefs, groups, announceReorder]
  );

  const handleReorderStep = (taskId: string, direction: "left" | "right") =>
    void applyReorder(stepWithinGroup(reorderColumns, taskId, direction), taskId);

  const handleReorderDrop = (draggedTaskId: string, targetTaskId: string) => {
    if (!isValidDropTarget(reorderColumns, draggedTaskId, targetTaskId)) return;
    void applyReorder(moveWithinGroup(reorderColumns, draggedTaskId, targetTaskId), draggedTaskId);
  };

  const handleMoveColumn = (taskId: string, kind: "left" | "right" | "start" | "end") => {
    const moved =
      kind === "left" || kind === "right"
        ? stepWithinGroup(reorderColumns, taskId, kind)
        : moveToGroupEdge(reorderColumns, taskId, kind);
    void applyReorder(moved, taskId);
  };

  return { reorderAnnouncement, handleReorderStep, handleReorderDrop, handleMoveColumn };
}
