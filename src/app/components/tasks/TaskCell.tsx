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
import { taskCellAccessibleName, TASK_STATUS_WORDS, type TaskSortDirection } from "@/lib/course-tasks-view";
import { TASK_INSTRUCTION_MAX_LENGTH } from "@/lib/task-institution-instructions";
import { taskAttachmentCountLabel } from "@/lib/course-task-attachments";
import { taskCellIndicatorSet } from "./taskCellIndicators";
import { taskInstructionScopeText } from "./taskInstructionScope";
import { HamburgerIcon } from "../courses/icons";
import styles from "./TasksGrid.module.css";
import instructionStyles from "./instructionEditor.module.css";
import attachmentStyles from "./taskAttachments.module.css";

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

// AC-D item 222: the sort-direction indicator shown in a sorted column's
// header - the SAME triangle SHAPES the toolbar's ascending/descending
// toggle already uses (the literal "▲"/"▼" glyphs at TasksToolbar.tsx),
// redrawn as an inline SVG polygon so a column header can show the
// identical shape without repeating a bare text glyph (this repo's
// no-emojis scan only exempts the geometric-shape triangles - see this
// file's own header comment - and an SVG sidesteps the question of which
// literal characters are "safe" entirely). Shape is the only channel: no
// colour distinguishes ascending from descending.
export function SortDirectionGlyph({ direction, size = 10 }: { direction: TaskSortDirection; size?: number }) {
  const points = direction === "asc" ? "10,4 16,15 4,15" : "10,16 16,5 4,5";
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}

// AC-D item 223: the persistent filter indicator shown in a filtered
// column's header - a funnel silhouette, a distinct SHAPE from every
// StatusGlyph above (never a repurposed status glyph or a colour-only dot).
// `aria-hidden`: the header button's own accessible name (item 223) is what
// actually states the active constraint in words; this mark is the sighted
// scan-for-it cue, not the source of truth.
// B8: `currentColor`, matching SortDirectionGlyph above - a hardcoded
// `var(--accent-ink)` here fought the CSS that is actually supposed to
// choose the color per context (`.taskHeaderIndicators` sets it explicitly;
// the corner header buttons inherit theirs), and disagreed with the sort
// glyph rendered right next to it in the same button.
export function FilterActiveGlyph({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M2.5 3.5H17.5L12 10.2V16L8 14.2V10.2Z" fill="currentColor" />
    </svg>
  );
}

// B2: the visual mark inside a `role="menuitemcheckbox"` button in
// TaskColumnMenu.tsx (the per-status filter checkboxes, and the Progress
// header's "Outstanding only" toggle) - a NON-INTERACTIVE inline SVG,
// `aria-hidden` like every other glyph on this page. An MUI `Checkbox`
// there would render a real `<input type="checkbox">` nested inside the
// `<button role="menuitemcheckbox">`, which HTML's button content model
// forbids (no interactive descendants) and gives assistive tech two
// disagreeing sources of the same checked state. `aria-checked` on the
// button is the single source of truth; this mark only has to look right,
// never has to announce anything of its own.
export function MenuCheckGlyph({ checked, size = 15 }: { checked: boolean; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 20 20", "aria-hidden": true, focusable: false } as const;
  return (
    <svg {...common}>
      <rect x={2.5} y={2.5} width={15} height={15} rx={3} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {checked && (
        <path
          d="M5.3 10.2L8.3 13.2L14.7 6.3"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
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

// AC4 items 14-16 (docs/task-institution-instructions-acceptance-criteria.md):
// the institution-instruction corner mark - a small ruled-document
// silhouette, deliberately unlike every other mark on this cell so it can
// never be mistaken for one at a glance: StatusGlyph's four shapes are
// circle/check/square/dash, .noteMarker is a CSS-drawn triangular dog-ear,
// ErrorGlyph above is a triangle-with-exclamation. A document (a rectangle
// with two ruled lines, reading as "standing guidance to consult") is a
// fourth, distinct family of shape from all of those. Like every mark here,
// it carries its meaning through SHAPE alone (item 15 - never colour alone,
// never an emoji; src/lib/no-emojis.test.ts scans src/ and docs/) - the ink
// colour below is a reinforcing cue only, matching ErrorGlyph's own
// hardcoded-colour precedent rather than `currentColor`.
function InstructionGlyph() {
  return (
    <svg width={11} height={11} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="3" y="2" width="14" height="16" rx="1.5" fill="none" stroke="var(--accent-ink)" strokeWidth={1.8} />
      <rect x="6" y="7" width="8" height="1.6" rx="0.8" fill="var(--accent-ink)" />
      <rect x="6" y="11.4" width="8" height="1.6" rx="0.8" fill="var(--accent-ink)" />
    </svg>
  );
}

// docs/task-cell-attachments-acceptance-criteria.md AC5 item 24: the
// popover's own "Attachments" control - two overlapping document
// silhouettes (reading as "more than one file"), a fifth distinct shape
// family from InstructionGlyph's single ruled document and every
// StatusGlyph/ErrorGlyph shape above. Never the Unicode paperclip code
// point the no-emojis scan flags - drawn as plain SVG rects instead.
// Non-interactive and aria-hidden since the button around it already
// carries the count in its own visible text.
function AttachmentGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="4" y="6" width="10" height="12" rx="1.5" fill="none" stroke="var(--accent-ink)" strokeWidth={1.6} />
      <rect x="7" y="2" width="10" height="12" rx="1.5" fill="var(--field-background)" stroke="var(--accent-ink)" strokeWidth={1.6} />
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
  /**
   * The resolved institution-instruction text for this (course, task) pair
   * (docs/task-institution-instructions-acceptance-criteria.md AC3/AC4) - an
   * empty string when there is none. Already resolved by the caller
   * (TaskGridRow, via resolveTaskInstruction) - this component never touches
   * an institution string itself, and never builds the lookup key; it only
   * ever reads this one already-resolved value to decide whether to show
   * the bottom-left corner mark and to extend the accessible name/title
   * (never inlining the body itself - AC4 item 17).
   */
  instruction: string;
  /**
   * The course's own institution, trimmed, or null when the course has no
   * institution (docs/task-institution-instructions-acceptance-criteria.md
   * AC5 item 22) - resolved by the caller (TaskGridRow), same as
   * `instruction` above. This is the ONLY thing that decides whether this
   * cell's editor offers an instruction editor at all: a null institution
   * means there is nothing to attach a shared instruction to, so the editor
   * shows the one-line explanation (taskInstructionScopeText) instead of a
   * disabled control.
   */
  institution: string | null;
  /**
   * Saves (or, given a blank body, deletes) the institution-wide
   * instruction for (institution, task.id) - AC5 items 23/25/26. Fire-and-
   * forget from this component's own perspective: the caller
   * (useCourseTasksData.ts, via TasksTab.tsx) owns the optimistic update,
   * the local-map fan-out to every affected row, the revert-on-failure, and
   * the live-region announcement - this component never touches the
   * instructions map itself.
   */
  onSaveInstruction: (institution: string, taskId: string, body: string) => void;
  /**
   * This cell's attachment count (docs/task-cell-attachments-acceptance-
   * criteria.md AC4 item 20) - a plain number, never an array, so this
   * component can never re-render because of an array's identity changing.
   * Already resolved by the caller (TaskGridRow, via taskAttachmentsAt) -
   * this component never touches the attachment index itself. Fed into
   * taskCellIndicatorSet's 4th argument and taskCellAccessibleName's 6th, so
   * the corner mark and the spoken name can never disagree about whether
   * this cell has files.
   */
  attachmentCount: number;
  /**
   * Asks the tab to open the single, tab-level attachments dialog for this
   * cell (AC5 items 22-24) - this component never renders a dialog, never
   * calls useSupabase, and never fetches or signs anything itself. Fired
   * from the popover's "Attachments" control, after the popover's own note/
   * instruction drafts commit and the popover closes - see closeAndCommit
   * below.
   */
  onOpenAttachments: () => void;
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
  instruction,
  institution,
  onSaveInstruction,
  attachmentCount,
  onOpenAttachments,
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
  const [instructionDraft, setInstructionDraft] = useState(instruction);

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
    if (isOpen) {
      setNoteDraft(cell.note);
      // AC5 item 20: the instruction draft resyncs the same way the note
      // draft always has - once per open, from the already-resolved
      // `instruction` prop, never from a stale value left over from a
      // previous open.
      setInstructionDraft(instruction);
    }
  }

  // AC4 items 14-17 (docs/task-institution-instructions-acceptance-criteria.md),
  // extended by docs/task-cell-attachments-acceptance-criteria.md AC3 item
  // 15: the ONE place this component decides which corner marks to show - a
  // pure function (its own test file, taskCellIndicators.test.ts, pins AC4
  // item 16's "all three at once, none displacing another" directly) rather
  // than three separately re-derived inline conditions that could drift
  // apart from each other or from the accessible name/title text below.
  // `attachmentCount` is threaded straight into both calls below (never a
  // re-derived "note || attachmentCount > 0" here) so the note mark and the
  // spoken name can never disagree with the count actually loaded.
  const indicators = taskCellIndicatorSet(cell.note, instruction, error, attachmentCount);
  const accessibleName = taskCellAccessibleName(courseName, task, cell, nowMs, indicators.instruction, attachmentCount);

  const commitStatus = (status: TaskStatus) => {
    onChange(courseId, task.id, setTaskCellStatus(cell, status, nowMs));
  };

  const cycle = () => commitStatus(nextTaskStatus(effectiveStatus));

  const commitNote = () => {
    const next = setTaskCellNote(cell, noteDraft);
    if (next.note !== cell.note) onChange(courseId, task.id, next);
  };

  // AC5 items 23/25/26: fires onSaveInstruction only when the draft
  // actually differs from the already-resolved `instruction` prop (mirrors
  // commitNote's own `next.note !== cell.note` guard immediately above) - a
  // blank draft is a real change (it clears the institution's instruction,
  // AC5 item 25) and still reaches onSaveInstruction, which the caller
  // (useCourseTasksData.ts) treats as a delete.
  const commitInstruction = () => {
    if (!institution) return;
    if (instructionDraft.trim() === instruction.trim()) return;
    onSaveInstruction(institution, task.id, instructionDraft);
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
    commitInstruction();
    closePopover();
  };

  // docs/task-cell-attachments-acceptance-criteria.md AC5 item 24:
  // activating the popover's "Attachments" control commits and closes the
  // popover exactly like the Done button does (closeAndCommit, unchanged),
  // then asks the tab to open the single, tab-level dialog for this cell -
  // so the popover and the dialog are never open at once.
  const openAttachments = () => {
    closeAndCommit();
    onOpenAttachments();
  };

  // AC4 item 17: the SAME bounded rule as the accessible name - mentions
  // that an institution instruction exists, never its body. `error` still
  // takes over the whole tooltip on its own (unchanged from before this
  // feature - a failed save is the most urgent thing to communicate here),
  // otherwise status/note/instruction-presence are joined with the same
  // " - " separator the note already used, so the addition reads as one
  // more clause rather than a second, differently-punctuated tooltip.
  const statusTitleParts = [TASK_STATUS_WORDS[effectiveStatus]];
  if (cell.note) statusTitleParts.push(cell.note);
  if (indicators.instruction) statusTitleParts.push("Institution instructions available");
  // Accessibility review fix 8 (AC3 item 16): the title now mirrors the
  // accessible name's file count too - previously a cell with ONLY files
  // showed the corner mark with no tooltip explanation at all, since this
  // block never looked at attachmentCount.
  if (attachmentCount > 0) statusTitleParts.push(taskAttachmentCountLabel(attachmentCount));
  const cellTitle = error ? `Could not save: ${error}` : statusTitleParts.join(" - ");

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
        title={cellTitle}
        onFocus={() => onFocusCell(rowIndex, colIndex)}
        onClick={cycle}
        onContextMenu={(e) => {
          e.preventDefault();
          openEditor(e.currentTarget);
        }}
        onKeyDown={handleKeyDown}
      >
        <StatusGlyph status={effectiveStatus} />
        {indicators.note && <span className={styles.noteMarker} aria-hidden />}
        {indicators.instruction && (
          <span className={styles.instructionMarker} aria-hidden>
            <InstructionGlyph />
          </span>
        )}
        {indicators.error && <span className={styles.errorMarker} aria-hidden><ErrorGlyph /></span>}
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
          title={`More options for ${task.label}, ${courseName}`}
          aria-haspopup="dialog"
          aria-expanded={Boolean(anchorEl)}
          tabIndex={-1}
          sx={{ padding: "var(--space-1)" }}
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
            sx={{
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-md)",
              border: "1px solid var(--card-border)",
            }}
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
            <p className={instructionStyles.scopeLabel}>This course only</p>
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

            {/* AC5 items 19/20/22: a SEPARATE section, visually divided
                (.instructionSection's own border-top) from the note above -
                the note is this course's own scratchpad, this box is shared,
                standing guidance for every course at one institution. The
                scope sentence (taskInstructionScopeText) is the ONE place
                that fact is stated, on both this surface and
                TaskColumnMenu.tsx's, so the two can never drift into
                different wording for the same footgun. */}
            <div className={instructionStyles.instructionSection}>
              <p className={instructionStyles.scopeLabel}>Institution-wide</p>
              {institution ? (
                <>
                  <p className={instructionStyles.scopeText}>{taskInstructionScopeText(institution, task.label)}</p>
                  <TextField
                    size="small"
                    fullWidth
                    label="Institution instructions"
                    placeholder="Standing guidance for every course here"
                    multiline
                    minRows={2}
                    value={instructionDraft}
                    onChange={(e) => setInstructionDraft(e.target.value.slice(0, TASK_INSTRUCTION_MAX_LENGTH))}
                    onBlur={commitInstruction}
                  />
                </>
              ) : (
                <p className={instructionStyles.noInstructionNote}>{taskInstructionScopeText(null, task.label)}</p>
              )}
            </div>

            {/* docs/task-cell-attachments-acceptance-criteria.md AC5 item
                24: a third section, divided the same way the instructions
                box above is divided from the note - files are their own
                scope, not a third kind of note. Activating this control
                commits and closes the popover (openAttachments, above),
                then asks the tab to open the single, tab-level dialog for
                this cell - this component never renders that dialog
                itself. */}
            <div className={instructionStyles.instructionSection}>
              <p className={instructionStyles.scopeLabel}>Attachments</p>
              {/* Accessibility review fix 9: the only visible text here is
                  the count label ("No files" / "2 files"), which read as a
                  bare statement rather than an action and never said a
                  dialog would open. aria-haspopup="dialog" matches the
                  "More options" trigger above (both open a surface this
                  control's own click handler owns). */}
              <button
                type="button"
                className={attachmentStyles.attachmentsControl}
                aria-label={`Attachments - ${taskAttachmentCountLabel(attachmentCount)}`}
                aria-haspopup="dialog"
                onClick={openAttachments}
              >
                <AttachmentGlyph />
                <span>{taskAttachmentCountLabel(attachmentCount)}</span>
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-1)" }}>
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
