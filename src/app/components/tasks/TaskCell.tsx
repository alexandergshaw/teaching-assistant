"use client";

// One status cell (<td> containing a <button>) in the Tasks grid. Owns its
// own non-modal editor (AC15 item 100) built on `Popper` + `ClickAwayListener`
// rather than MUI `Popover` (which is `styled(Modal, ...)`- focus trapping,
// scroll lock, and `aria-hidden` on the rest of the document all on by
// default, exactly the modal behaviour AC15 item 100 rules out: it would
// hide the grid the instructor is comparing against from assistive tech,
// make it unclickable, and swallow the first click outside on its invisible
// backdrop). This editor doubles as both "the explicit menu listing all four
// states" (AC15 item 98) and "F2 cell-edit mode" (amendment 125) - a single
// surface, opened by right-click, the visible "more options" affordance
// (revealed on cell hover/focus, matching CoursesTable.module.css's
// `.cellMenu` reveal pattern), or F2, rather than two separate surfaces.
//
// Every status/note change is computed by the pure course-tasks.ts helpers
// (nextTaskStatus/setTaskCellStatus/setTaskCellNote) and handed to the
// parent's onChange - this component makes no persistence decision of its
// own, matching the "keep components thin" rule: the only logic here is
// which pure helper a given interaction calls.
import type React from "react";
import { useEffect, useRef, useState } from "react";
import Popper from "@mui/material/Popper";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import {
  nextTaskStatus,
  setTaskCellStatus,
  setTaskCellNote,
  TASK_STATUSES,
  type TaskCell as TaskCellValue,
  type TaskDefinition,
  type TaskStatus,
} from "@/lib/course-tasks";
import { taskCellAccessibleName, TASK_STATUS_WORDS } from "@/lib/course-tasks-view";
import { HamburgerIcon } from "../courses/icons";
import styles from "./TasksGrid.module.css";

// AC15 item 90/AC16 amendment 129: four distinct SILHOUETTES, drawn as inline
// SVG paths rather than characters - the no-emojis scan (src/lib/
// no-emojis.test.ts) flags every check-mark code point (dingbats/misc
// symbols), so a text glyph is not just a design choice here, it is the only
// option that cannot trip that scan. Exported so the toolbar's legend and
// the Manage Tasks dialog's status pickers reuse the exact same marks rather
// than a second, possibly-drifting copy.
export function StatusGlyph({ status, size = 15 }: { status: TaskStatus; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 20 20", "aria-hidden": true } as const;
  switch (status) {
    case "done":
      return (
        <svg {...common}>
          <path
            d="M4 10.5L8 14.5L16 6"
            fill="none"
            stroke="var(--success)"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "open":
      return (
        <svg {...common}>
          <circle cx={10} cy={10} r={6.2} fill="none" stroke="currentColor" strokeWidth={1.5} />
        </svg>
      );
    case "blocked":
      return (
        <svg {...common}>
          <rect x={5} y={5} width={10} height={10} fill="var(--danger)" />
        </svg>
      );
    case "na":
      return (
        <svg {...common}>
          <rect x={4.5} y={9} width={11} height={2} rx={1} fill="var(--text-secondary)" />
        </svg>
      );
  }
}

// S8: a failed save must not rely on colour alone (WCAG 1.4.1) - this small
// corner marker (a triangle + exclamation, a DIFFERENT shape from every
// StatusGlyph above, not just a red version of one of them) is the
// non-colour channel; the red ring stays as a reinforcing colour cue, and
// the actual error TEXT is announced through the tab-level shared live
// region (TasksTab.tsx) rather than this cell's own `title` tooltip, which
// is invisible on touch and unreliable for keyboard users.
function ErrorGlyph() {
  return (
    <svg width={11} height={11} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 2.5 18.5 17H1.5Z" fill="none" stroke="var(--danger)" strokeWidth={1.8} strokeLinejoin="round" />
      <rect x="9.1" y="8" width="1.8" height="5" rx="0.9" fill="var(--danger)" />
      <circle cx="10" cy="14.5" r="1" fill="var(--danger)" />
    </svg>
  );
}

export interface TaskCellProps {
  courseId: string;
  courseName: string;
  task: TaskDefinition;
  cell: TaskCellValue;
  /** The status/outstanding-ness already resolved for THIS instant (period-
   * scoped for daily/weekly - see effectiveTaskStatus). Computed by the
   * caller so every cell in the row shares one nowMs read. */
  effectiveStatus: TaskStatus;
  isOutstanding: boolean;
  nowMs: number;
  rowIndex: number;
  colIndex: number;
  tabbable: boolean;
  /** Whether this cell's COLUMN is currently hovered/focused - AC15 item
   * 113's crosshair. The ROW half of the crosshair is painted at the <tr>
   * level (TaskGridRow sets data-row-active, and the CSS rule targets every
   * `td`/`th` child directly), so no equivalent "rowActive" prop is needed
   * here. */
  colActive: boolean;
  error?: string;
  /** AC15 item 111: a vertical divider at the FIRST status cell of a new
   * group - the row component is what knows each column's neighbor, so it
   * passes this down rather than TaskCell re-deriving it. */
  groupBoundary?: boolean;
  onMouseEnterCol?: () => void;
  registerRef: (row: number, col: number, el: HTMLButtonElement | null) => void;
  onFocusCell: (row: number, col: number) => void;
  onChange: (courseId: string, taskId: string, nextCell: TaskCellValue) => void;
  onNavigate: (row: number, col: number, key: string, ctrlKey: boolean) => void;
  onFillDown: (row: number, col: number) => void;
}

export default function TaskCell({
  courseId,
  courseName,
  task,
  cell,
  effectiveStatus,
  isOutstanding,
  nowMs,
  rowIndex,
  colIndex,
  tabbable,
  colActive,
  error,
  groupBoundary,
  onMouseEnterCol,
  registerRef,
  onFocusCell,
  onChange,
  onNavigate,
  onFillDown,
}: TaskCellProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [noteDraft, setNoteDraft] = useState(cell.note);

  // S1: Popper (unlike Popover's Modal base) never traps or auto-focuses -
  // that is the point, the grid behind it must stay operable - but a
  // keyboard user who opens the editor via F2 still needs focus to land
  // somewhere inside it. Moving focus to the editor's own container (not a
  // specific field) on open lets Tab proceed through its contents from
  // there, same as any other non-modal disclosure.
  useEffect(() => {
    if (anchorEl && editorRef.current) editorRef.current.focus();
  }, [anchorEl]);

  // Resyncs the draft to the cell's real note every time the popover
  // transitions from closed to open, so a stale draft from an earlier
  // session never lingers - the "adjusting state during rendering" pattern
  // (https://react.dev/learn/you-might-not-need-an-effect) rather than a
  // useEffect that calls setState synchronously, which this repo's lint
  // config forbids. `wasOpen` mirrors the PREVIOUS render's anchorEl-open
  // state; comparing against it (not against `cell.note` directly) is what
  // makes this fire once per open rather than on every keystroke the user
  // types into the note field.
  const [wasOpen, setWasOpen] = useState(false);
  const isOpen = Boolean(anchorEl);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setNoteDraft(cell.note);
  }

  const accessibleName = taskCellAccessibleName(courseName, task, cell, nowMs);

  const commitStatus = (status: TaskStatus) => {
    onChange(courseId, task.id, setTaskCellStatus(cell, status, nowMs));
  };

  const cycle = () => commitStatus(nextTaskStatus(effectiveStatus));

  const commitNote = () => {
    const next = setTaskCellNote(cell, noteDraft);
    if (next.note !== cell.note) onChange(courseId, task.id, next);
  };

  const closePopover = () => {
    setAnchorEl(null);
    buttonRef.current?.focus();
  };

  // AC15's full APG arrow-key contract (item 95) is grid-wide (it needs to
  // know the whole grid's shape, not just this one cell), so navigation keys
  // are simply forwarded to the parent via onNavigate. Everything else here
  // (cycle, the single-letter shortcuts, F2, Ctrl+D) is entirely local to
  // this one cell - amendment 126 pins d=done/n=blocked/a=na/o=open, and
  // amendment 97's "scoped to a focused gridcell only" is satisfied simply
  // by this being the focused button's own onKeyDown, never a document-level
  // listener (WCAG 2.2 SC 2.1.4).
  const NAV_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (NAV_KEYS.has(e.key)) {
      e.preventDefault();
      onNavigate(rowIndex, colIndex, e.key, e.ctrlKey || e.metaKey);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      onFillDown(rowIndex, colIndex);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return; // no other modified combos are handled here
    switch (e.key) {
      case "d":
      case "D":
        e.preventDefault();
        commitStatus("done");
        return;
      case "o":
      case "O":
        e.preventDefault();
        commitStatus("open");
        return;
      case "n":
      case "N":
        e.preventDefault();
        commitStatus("blocked");
        return;
      case "a":
      case "A":
        e.preventDefault();
        commitStatus("na");
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        cycle();
        return;
      case "F2":
        e.preventDefault();
        setAnchorEl(buttonRef.current);
        return;
      default:
        return;
    }
  };

  const openEditor = (anchor: HTMLElement) => setAnchorEl(anchor);

  const closeAndCommit = () => {
    commitNote();
    closePopover();
  };

  return (
    <td
      className={`${styles.statusCell}${groupBoundary ? ` ${styles.groupBoundary}` : ""}`}
      data-col-active={colActive ? "true" : undefined}
      role="gridcell"
      onMouseEnter={onMouseEnterCol}
    >
      <button
        type="button"
        ref={(el) => {
          buttonRef.current = el;
          registerRef(rowIndex, colIndex, el);
        }}
        className={`${styles.statusButton}${tabbable ? ` ${styles.gridFocusRing}` : ""}`}
        tabIndex={tabbable ? 0 : -1}
        data-outstanding={isOutstanding ? "true" : "false"}
        data-error={error ? "true" : undefined}
        data-row={rowIndex}
        data-col={colIndex}
        aria-label={accessibleName}
        title={
          error
            ? `Could not save: ${error}`
            : cell.note
              ? `${TASK_STATUS_WORDS[effectiveStatus]} - ${cell.note}`
              : TASK_STATUS_WORDS[effectiveStatus]
        }
        onFocus={() => onFocusCell(rowIndex, colIndex)}
        onClick={cycle}
        onContextMenu={(e) => {
          e.preventDefault();
          openEditor(e.currentTarget);
        }}
        onKeyDown={handleKeyDown}
      >
        <StatusGlyph status={effectiveStatus} />
        {cell.note && <span className={styles.noteMarker} aria-hidden />}
        {error && <span className={styles.errorMarker} aria-hidden><ErrorGlyph /></span>}
      </button>

      {/* S13: a visible "more options" affordance, revealed on hover/focus
          (CoursesTable.module.css's `.cellMenu` reveal pattern) - previously
          right-click and F2 were the only routes to this same editor, and
          both are invisible, which was the very objection raised against
          click-to-cycle in the first place. */}
      <span className={styles.cellMenuTrigger}>
        <IconButton
          size="small"
          aria-label={`More options for ${task.label}, ${courseName}`}
          aria-haspopup="dialog"
          aria-expanded={Boolean(anchorEl)}
          tabIndex={-1}
          sx={{ padding: "2px" }}
          onClick={(e) => {
            e.stopPropagation();
            openEditor(e.currentTarget);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <HamburgerIcon />
        </IconButton>
      </span>

      {/* S7: error text is announced through the single always-mounted live
          region in TasksTab.tsx, not a per-cell `role="status"` span that
          mounts at the same instant as its own text (unreliable, and there
          can be over a thousand of these cells). */}

      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="bottom"
        style={{ zIndex: 1300 }}
        modifiers={[{ name: "offset", options: { offset: [0, 4] } }]}
      >
        <ClickAwayListener onClickAway={closeAndCommit}>
          <Paper
            ref={editorRef}
            tabIndex={-1}
            elevation={4}
            className={styles.editorPopover}
            role="dialog"
            aria-label={`Status and note for ${task.label}, ${courseName}`}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                closeAndCommit();
              }
            }}
          >
            <p className={styles.editorMeta}>
              {courseName} - {task.label}
            </p>
            <div className={styles.editorStatusRow} role="group" aria-label="Set status">
              {TASK_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={styles.editorStatusButton}
                  data-active={status === effectiveStatus ? "true" : "false"}
                  onClick={() => commitStatus(status)}
                >
                  <StatusGlyph status={status} />
                  {TASK_STATUS_WORDS[status]}
                </button>
              ))}
            </div>
            <TextField
              size="small"
              fullWidth
              label="Note"
              placeholder="Optional note"
              multiline
              minRows={2}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value.slice(0, 200))}
              onBlur={commitNote}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <Button size="small" variant="contained" onClick={closeAndCommit}>
                Done
              </Button>
            </div>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </td>
  );
}
