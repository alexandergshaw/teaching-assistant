"use client";

// One <tr> in the Tasks grid: the sticky identity cell (course/institution/
// term - AC2), the sticky progress cell (AC15 item 101), and one cell per
// visible column (a task status cell or a collapsed group's roll-up ratio).
//
// Deliberately thin: every number shown here (the row's own progress ratio,
// a roll-up group's ratio) is computed by the caller via the pure
// course-tasks-view.ts helpers and handed in as `progress`/already-resolved
// column descriptors - this component only lays them out.
import type React from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemText from "@mui/material/ListItemText";
import { useState } from "react";
import {
  effectiveTaskStatus,
  isTaskOutstanding,
  taskCellAt,
  TASK_STATUSES,
  type TaskCellMap,
  type TaskDefinition,
  type TaskGroupId,
  type TaskStatus,
  type TaskCell as TaskCellValue,
} from "@/lib/course-tasks";
import {
  computeTaskProgress,
  formatTaskProgress,
  TASK_STATUS_WORDS,
  type TaskProgress,
  type TaskRowCourse,
} from "@/lib/course-tasks-view";
import { resolveTaskInstruction, type TaskInstructionMap } from "@/lib/task-institution-instructions";
import { taskAttachmentsAt, type TaskAttachmentIndex } from "@/lib/course-task-attachments";
import TaskCell, { StatusGlyph } from "./TaskCell";
import styles from "./TasksGrid.module.css";

export type GridColumn =
  | { kind: "task"; task: TaskDefinition }
  | { kind: "rollup"; groupId: TaskGroupId; label: string; tasks: TaskDefinition[] };

export interface TaskGridRowProps {
  rowIndex: number;
  course: TaskRowCourse;
  cells: TaskCellMap;
  columns: GridColumn[];
  progress: TaskProgress;
  nowMs: number;
  isActiveRow: boolean;
  focusRow: number;
  focusCol: number;
  hoveredCol: number | null;
  cellErrors: Record<string, string>;
  /**
   * Per-(institution, task) instruction text (docs/task-institution-
   * instructions-acceptance-criteria.md AC3/AC4) - resolved to a single
   * value HERE, per task column, via resolveTaskInstruction
   * (src/lib/task-institution-instructions.ts). This is the first place in
   * the render tree that holds both this row's own `course.institution` and
   * each column's task id, so it is the one and only place the lookup key
   * is ever formed (through resolveTaskInstruction, never inline - AC2 item
   * 7); TaskCell.tsx below only ever receives the already-resolved string.
   */
  instructions: TaskInstructionMap;
  /**
   * Saves (or clears) one institution's instruction for one task - threaded
   * straight through to TaskCell's own cell editor (docs/task-institution-
   * instructions-acceptance-criteria.md AC5). This row never calls it
   * itself; it only knows the shape from the same place it already resolves
   * `instruction` above.
   */
  onSaveInstruction: (institution: string, taskId: string, body: string) => void;
  /**
   * Per-cell attachment index (docs/task-cell-attachments-acceptance-
   * criteria.md AC4 item 20) - threaded straight through from TasksGrid,
   * unchanged, the same posture `instructions` above already documents.
   * This row resolves ONE cell's list through taskAttachmentsAt below (the
   * shared helper, never a re-derived lookup) and hands TaskCell only the
   * list's length - a plain number, never the array itself, so a cell can
   * never re-render because of array identity.
   */
  attachments: TaskAttachmentIndex;
  /** Opens the tab-level attachments dialog for one (course, task) cell
   * (AC5 items 22-24) - threaded straight through to TaskCell's popover.
   * This row never opens the dialog itself. */
  onOpenAttachments: (courseId: string, taskId: string) => void;
  registerRef: (row: number, col: number, el: HTMLElement | null) => void;
  onFocusCell: (row: number, col: number) => void;
  onNavigate: (row: number, col: number, key: string, ctrlKey: boolean) => void;
  onCellChange: (courseId: string, taskId: string, nextCell: TaskCellValue) => void;
  onFillDown: (row: number, col: number) => void;
  /** AC-B item 255: widened so the caller knows which row this rollup cell's
   * toggle was activated from - `rowIndex`, passed at both call sites below
   * rather than inferred from the roving-tabindex `focus` state, which may
   * not have caught up to this row yet. */
  onToggleGroupCollapse: (groupId: TaskGroupId, activatedRow: number) => void;
  onBulkRowSet: (courseId: string, courseName: string, status: TaskStatus) => void;
  onRowMouseEnter: (row: number) => void;
  onColMouseEnter: (col: number) => void;
}

export default function TaskGridRow({
  rowIndex,
  course,
  cells,
  columns,
  progress,
  nowMs,
  isActiveRow,
  focusRow,
  focusCol,
  hoveredCol,
  cellErrors,
  instructions,
  onSaveInstruction,
  attachments,
  onOpenAttachments,
  registerRef,
  onFocusCell,
  onNavigate,
  onCellChange,
  onFillDown,
  onToggleGroupCollapse,
  onBulkRowSet,
  onRowMouseEnter,
  onColMouseEnter,
}: TaskGridRowProps) {
  const [rowMenuAnchor, setRowMenuAnchor] = useState<HTMLElement | null>(null);

  const institution = course.institution?.trim() || "—";
  const term = course.term?.trim() || "—";
  const progressPct = progress.applicable === 0 ? 0 : Math.round((progress.done / progress.applicable) * 100);

  const identityTabbable = focusRow === rowIndex && focusCol === 0;
  const progressTabbable = focusRow === rowIndex && focusCol === 1;

  const identityKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const nav = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
    if (nav.includes(e.key)) {
      e.preventDefault();
      onNavigate(rowIndex, 0, e.key, e.ctrlKey || e.metaKey);
      return;
    }
    if (e.key === "Enter" || e.key === " " || e.key === "ContextMenu") {
      e.preventDefault();
      setRowMenuAnchor(e.currentTarget);
    }
  };

  const progressKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const nav = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
    if (nav.includes(e.key)) {
      e.preventDefault();
      onNavigate(rowIndex, 1, e.key, e.ctrlKey || e.metaKey);
    }
  };

  return (
    <tr data-row-active={isActiveRow ? "true" : undefined} onMouseEnter={() => onRowMouseEnter(rowIndex)}>
      <th
        scope="row"
        className={`${styles.identityCell}${identityTabbable ? ` ${styles.gridFocusRing}` : ""}`}
        role="rowheader"
        tabIndex={identityTabbable ? 0 : -1}
        data-row={rowIndex}
        data-col={0}
        ref={(el) => registerRef(rowIndex, 0, el)}
        onFocus={() => onFocusCell(rowIndex, 0)}
        onKeyDown={identityKeyDown}
        onContextMenu={(e) => {
          e.preventDefault();
          setRowMenuAnchor(e.currentTarget);
        }}
        title="Enter or right-click for row actions"
      >
        <div className={styles.courseName}>{course.name}</div>
        <div className={styles.courseMeta}>
          {institution} &middot; {term}
        </div>
      </th>

      <td
        className={`${styles.progressCell}${progressTabbable ? ` ${styles.gridFocusRing}` : ""}`}
        role="gridcell"
        tabIndex={progressTabbable ? 0 : -1}
        data-row={rowIndex}
        data-col={1}
        ref={(el) => registerRef(rowIndex, 1, el)}
        onFocus={() => onFocusCell(rowIndex, 1)}
        onKeyDown={progressKeyDown}
      >
        <div className={styles.progressText}>{formatTaskProgress(progress)}</div>
        {progress.applicable > 0 && (
          <div className={styles.progressBarTrack}>
            <div className={styles.progressBarFill} style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </td>

      {columns.map((col, i) => {
        const colIndex = i + 2;
        const tabbable = focusRow === rowIndex && focusCol === colIndex;
        const colActive = hoveredCol === colIndex || focusCol === colIndex;

        if (col.kind === "rollup") {
          const rollupProgress = computeTaskProgress(cells, col.tasks, nowMs);
          return (
            <td
              key={col.groupId}
              className={`${styles.rollupCell} ${styles.groupBoundary}`}
              data-col-active={colActive ? "true" : undefined}
              role="gridcell"
            >
              <button
                type="button"
                ref={(el) => registerRef(rowIndex, colIndex, el)}
                className={`${styles.rollupButton}${tabbable ? ` ${styles.gridFocusRing}` : ""}`}
                tabIndex={tabbable ? 0 : -1}
                data-row={rowIndex}
                data-col={colIndex}
                aria-label={`${course.name}, ${col.label} group: ${formatTaskProgress(rollupProgress)} done. Activate to expand.`}
                title={`${col.label}: ${formatTaskProgress(rollupProgress)} - click to expand`}
                onFocus={() => onFocusCell(rowIndex, colIndex)}
                onClick={() => onToggleGroupCollapse(col.groupId, rowIndex)}
                onKeyDown={(e) => {
                  const nav = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
                  if (nav.includes(e.key)) {
                    e.preventDefault();
                    onNavigate(rowIndex, colIndex, e.key, e.ctrlKey || e.metaKey);
                    return;
                  }
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggleGroupCollapse(col.groupId, rowIndex);
                  }
                }}
              >
                {formatTaskProgress(rollupProgress)}
              </button>
            </td>
          );
        }

        const task = col.task;
        const cell = taskCellAt(cells, task.id);
        const effectiveStatus = effectiveTaskStatus(cell, task.cadence, nowMs);
        const outstanding = isTaskOutstanding(cell, task.cadence, nowMs);
        const previous = columns[i - 1];
        const isFirstInGroup = i === 0 || groupIdOf(previous) !== groupIdOf(col);
        // AC4 item 14/A4: a course with a blank/null institution resolves to
        // "" here (resolveTaskInstruction's own short-circuit) - not an
        // error, simply no instruction to show for this cell.
        const instruction = resolveTaskInstruction(instructions, course.institution, task.id);
        // docs/task-cell-attachments-acceptance-criteria.md AC4 item 20: the
        // shared helper, never a re-derived lookup - TaskCell receives only
        // the resulting length.
        const attachmentCount = taskAttachmentsAt(attachments, course.id, task.id).length;

        return (
          <TaskCell
            key={task.id}
            courseId={course.id}
            courseName={course.name}
            task={task}
            cell={cell}
            effectiveStatus={effectiveStatus}
            isOutstanding={outstanding}
            nowMs={nowMs}
            rowIndex={rowIndex}
            colIndex={colIndex}
            tabbable={tabbable}
            colActive={colActive}
            error={cellErrors[task.id]}
            instruction={instruction}
            institution={course.institution?.trim() || null}
            onSaveInstruction={onSaveInstruction}
            attachmentCount={attachmentCount}
            onOpenAttachments={() => onOpenAttachments(course.id, task.id)}
            groupBoundary={isFirstInGroup}
            onMouseEnterCol={() => onColMouseEnter(colIndex)}
            registerRef={registerRef}
            onFocusCell={onFocusCell}
            onChange={onCellChange}
            onNavigate={onNavigate}
            onFillDown={onFillDown}
          />
        );
      })}

      <Menu anchorEl={rowMenuAnchor} open={Boolean(rowMenuAnchor)} onClose={() => setRowMenuAnchor(null)}>
        {TASK_STATUSES.map((status) => (
          <MenuItem
            key={status}
            onClick={() => {
              setRowMenuAnchor(null);
              onBulkRowSet(course.id, course.name, status);
            }}
          >
            <StatusGlyph status={status} />
            <ListItemText primary={`Set every visible task to ${TASK_STATUS_WORDS[status]}`} style={{ marginLeft: 8 }} />
          </MenuItem>
        ))}
      </Menu>
    </tr>
  );
}

/** The group a grid column belongs to - a rollup contributes its own group
 * id, a task column its task's group. Exported (narrowed to `TaskGroupId`,
 * AC-A item 251) for reuse by TasksGrid.tsx's `columnGroupIds` memo. */
export function groupIdOf(col: GridColumn): TaskGroupId {
  return col.kind === "rollup" ? col.groupId : col.task.group;
}
