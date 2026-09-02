"use client";

// The Tasks tab's attachments dialog state (docs/task-cell-attachments-
// acceptance-criteria.md AC5) - pulled out of TasksTab.tsx, which was again
// closing on this repo's 1000-line ceiling, the same way
// useTaskColumnReorder.ts was just pulled out of the same file: a
// self-contained "use*" hook's worth of state (which cell's dialog is open,
// which cell to restore focus to once it is actually gone) that nothing
// else in TasksTab.tsx reaches into. TasksTab.tsx still renders exactly ONE
// TaskAttachmentsDialog, driven by this hook's `attachmentTarget` - that
// rendering responsibility does not move, only the state and handlers behind
// it.
import type React from "react";
import { useCallback, useRef, useState } from "react";
import type { TaskRow } from "@/lib/course-tasks-view";
import type { TasksGridHandle } from "./TasksGrid";

export interface AttachmentTarget {
  courseId: string;
  taskId: string;
}

export interface UseTaskAttachmentsDialogArgs {
  allRows: TaskRow[];
  resolvedCatalog: Array<{ id: string; label: string }>;
}

export interface UseTaskAttachmentsDialogReturn {
  /** Reaches into TasksGrid's own roving-tabindex ref registry (item 25) -
   * TasksTab.tsx passes this straight through as `<TasksGrid ref={gridRef}>`. */
  gridRef: React.RefObject<TasksGridHandle | null>;
  attachmentTarget: AttachmentTarget | null;
  attachmentCourseName: string;
  attachmentTaskLabel: string;
  handleOpenAttachments: (courseId: string, taskId: string) => void;
  handleCloseAttachments: () => void;
  handleAttachmentsExited: () => void;
}

export function useTaskAttachmentsDialog({
  allRows,
  resolvedCatalog,
}: UseTaskAttachmentsDialogArgs): UseTaskAttachmentsDialogReturn {
  const [attachmentTarget, setAttachmentTarget] = useState<AttachmentTarget | null>(null);
  const gridRef = useRef<TasksGridHandle>(null);
  // Accessibility review fix 6: the cell to restore focus to once the
  // dialog's exit transition has actually finished - captured here (rather
  // than read back out of `attachmentTarget`, which handleCloseAttachments
  // clears immediately) because handleAttachmentsExited fires on a LATER
  // render, after `attachmentTarget` is already null.
  const pendingAttachmentFocusRef = useRef<AttachmentTarget | null>(null);
  // Regression fix: `attachmentTarget` nulls on close (handleCloseAttachments,
  // below) while the dialog is still visible for its own fade-out transition,
  // so deriving the title's course/task labels from `attachmentTarget` alone
  // collapses them to "" for the duration of that transition (the heading
  // reads "Attachments - , "). This mirrors `attachmentTarget` but is set on
  // open and cleared only in handleAttachmentsExited once the transition (and
  // the dialog) is actually gone - the SAME moment pendingAttachmentFocusRef
  // above already clears on, not a second mechanism. State, not a ref: a ref
  // read during render is a lint error (react-hooks/refs) and would not
  // reliably re-render this component's own JSX when it changed.
  const [attachmentDisplayTarget, setAttachmentDisplayTarget] = useState<AttachmentTarget | null>(null);

  const handleOpenAttachments = useCallback((courseId: string, taskId: string) => {
    setAttachmentTarget({ courseId, taskId });
    setAttachmentDisplayTarget({ courseId, taskId });
  }, []);

  // Item 25: closing the dialog only ever clears the state that controls
  // whether it is mounted - it must NOT itself move DOM focus. React
  // batches this alongside the Dialog's `open` prop going false, so the
  // dialog is still mounted and its FocusTrap still active for several more
  // renders (the whole exit transition); calling gridRef.focusCell here
  // would race MUI's own internal focus handling (see item 6's fix in
  // TaskAttachmentsDialog.tsx). The actual restoration is deferred to
  // handleAttachmentsExited below, which the dialog only calls once its
  // trap is fully gone. `attachmentDisplayTarget` is deliberately NOT cleared
  // here either, for the identical reason.
  const handleCloseAttachments = useCallback(() => {
    pendingAttachmentFocusRef.current = attachmentTarget;
    setAttachmentTarget(null);
  }, [attachmentTarget]);

  // Accessibility review fix 6: the ONE place DOM focus actually moves back
  // to the grid - wired to TaskAttachmentsDialog's onExited (MUI's Fade
  // onExited, which only fires after the exit transition, and therefore
  // the focus trap, is completely done). Also the one place
  // `attachmentDisplayTarget` clears, for the same reason.
  const handleAttachmentsExited = useCallback(() => {
    const target = pendingAttachmentFocusRef.current;
    pendingAttachmentFocusRef.current = null;
    setAttachmentDisplayTarget(null);
    if (target) gridRef.current?.focusCell(target.courseId, target.taskId);
  }, []);

  const attachmentCourseName = attachmentDisplayTarget
    ? (allRows.find((r) => r.course.id === attachmentDisplayTarget.courseId)?.course.name ?? "")
    : "";
  const attachmentTaskLabel = attachmentDisplayTarget
    ? (resolvedCatalog.find((t) => t.id === attachmentDisplayTarget.taskId)?.label ?? "")
    : "";

  return {
    gridRef,
    attachmentTarget,
    attachmentCourseName,
    attachmentTaskLabel,
    handleOpenAttachments,
    handleCloseAttachments,
    handleAttachmentsExited,
  };
}
