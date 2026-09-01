"use client";

// The per-column header menu (AC-D items 218-220): a single component with
// three variants selected by `target.kind` - a task column's Sort / Filter
// by value / Bulk update menu (item 219), the frozen Course header's sort-
// by-name/institution/term plus the institution/term pickers bound to the
// SAME state as the toolbar selects (item 220), and the frozen Progress
// header's sort-by-progress plus the outstanding-only toggle bound to the
// SAME state as the toolbar checkbox (item 220 - inherits
// outstandingOnlyDisabled, and the caller binds it to
// effectiveOutstandingOnly, never the raw value; see TasksTab.tsx). Every
// entry point that shares state with the toolbar is the SAME controlled
// value/handler pair, never a second copy, so changing one immediately
// reflects in the other.
//
// Presentation only (AC-G item 241): every decision (what counts as an
// active constraint, what the current sort is) is computed by the caller
// via course-tasks-view.ts and handed in as props.
//
// Built on Popper + ClickAwayListener, like TaskCell.tsx's own non-modal
// cell editor, rather than MUI `Menu` - TasksToolbar.tsx's Columns button
// already hit this exact wall (see its own "S14" comment): a `Menu`'s
// children must be valid ARIA children of role="menu" (a menuitem, a
// role="group", or a separator), and this panel's checkboxes, sort radios,
// pickers and section headings are not that shape. A hand-rolled
// role="menu" gives every item the real role item 219 requires
// (menuitemradio/menuitemcheckbox) without fighting a component built for a
// flatter list.
import type React from "react";
import { useEffect, useRef, useState } from "react";
import Popper from "@mui/material/Popper";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import { TASK_STATUSES, type TaskDefinition, type TaskStatus } from "@/lib/course-tasks";
import {
  ALL_FILTER,
  hasActiveColumnFilter,
  TASK_STATUS_WORDS,
  type TaskColumnFilters,
  type TaskSortState,
} from "@/lib/course-tasks-view";
import { resolveTaskInstruction, TASK_INSTRUCTION_MAX_LENGTH, type TaskInstructionMap } from "@/lib/task-institution-instructions";
import { StatusGlyph, SortDirectionGlyph, MenuCheckGlyph } from "./TaskCell";
import { moveToGroupEdge, stepWithinGroup, type ReorderableColumn } from "./columnOrder";
import { columnInstructionScope, taskInstructionScopeText } from "./taskInstructionScope";
import styles from "./TasksGrid.module.css";
import instructionStyles from "./instructionEditor.module.css";

export type ColumnMenuTarget = { kind: "task"; task: TaskDefinition } | { kind: "course" } | { kind: "progress" };

// C1: excludes a disabled `[data-menuitem]` (the Progress menu's
// outstanding-only toggle, disabled whenever outstandingOnlyDisabled is
// true) from every roving-tabindex query - a disabled button cannot hold
// DOM focus, so leaving it in the queried list let the roving slot land on
// it anyway (via moveFocus/focusEdge or the initial-open autofocus below),
// leaving the menu with ZERO tabbable items. Shared by all three query
// sites so they can never drift out of sync on which elements count.
const MENU_ITEM_SELECTOR = '[data-menuitem="true"]:not([disabled])';

// AC3: Move left / Move right / Move to start of group / Move to end of
// group - the WCAG 2.5.7 single-pointer route. Unlike every other disabled
// item this file has had until now (always the LAST item of its section -
// see moveFocus's own comment), these four can be disabled in ANY position
// (whichever pair sits at the current visible edge of the group), so
// moveFocus/focusEdge below no longer assume "filtered-list position ==
// flat rovingProps index" and instead read each item's real flat index off
// its own data-index attribute.
const REORDER_ITEMS: { key: string; label: string; kind: "left" | "right" | "start" | "end" }[] = [
  { key: "left", label: "Move left", kind: "left" },
  { key: "right", label: "Move right", kind: "right" },
  { key: "start", label: "Move to start of group", kind: "start" },
  { key: "end", label: "Move to end of group", kind: "end" },
];
const REORDER_ITEM_COUNT = REORDER_ITEMS.length;

/**
 * The parsing half of the C1 roving-tabindex fix above: given whatever a
 * `data-index` attribute read produced (a numeric string, or `null`/
 * `undefined` when the attribute or the element itself is absent), returns
 * the parsed flat index, or `fallback` when the value is missing or not a
 * finite number. Exported and unit-tested on its own (TaskColumnMenu.focus.
 * test.ts) because the DOM read that produces `raw` cannot be under this
 * repo's `environment: "node"` vitest - REGRESSION entry 233 covers this
 * menu's focus model, and this is the one piece of the fix a test can
 * actually reach; `moveFocus`/`focusEdge`'s own DOM traversal, and the
 * roving-tabindex behavior in context, stay verified by reading.
 */
export function parseFlatIndex(raw: string | null | undefined, fallback: number): number {
  const parsed = raw === null || raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface SortOption {
  key: string;
  label: string;
  sort: TaskSortState;
}

/** The sort choices offered per header (item 220): a task column offers
 * only its own ascending/descending pair; the Course header offers all
 * three fields it displays (name, institution, term - amendment: AC's
 * "Scope decisions" section); the Progress header offers its own pair,
 * phrased in progress terms rather than the generic ascending/descending so
 * "least done first" reads unambiguously next to a percentage column. */
function sortOptionsFor(target: ColumnMenuTarget): SortOption[] {
  if (target.kind === "task") {
    return [
      { key: "asc", label: "Ascending", sort: { field: "task", taskId: target.task.id, direction: "asc" } },
      { key: "desc", label: "Descending", sort: { field: "task", taskId: target.task.id, direction: "desc" } },
    ];
  }
  if (target.kind === "progress") {
    return [
      { key: "asc", label: "Ascending - least done first", sort: { field: "progress", direction: "asc" } },
      { key: "desc", label: "Descending - most done first", sort: { field: "progress", direction: "desc" } },
    ];
  }
  return [
    { key: "name-asc", label: "Course name, ascending", sort: { field: "name", direction: "asc" } },
    { key: "name-desc", label: "Course name, descending", sort: { field: "name", direction: "desc" } },
    { key: "institution-asc", label: "Institution, ascending", sort: { field: "institution", direction: "asc" } },
    { key: "institution-desc", label: "Institution, descending", sort: { field: "institution", direction: "desc" } },
    { key: "term-asc", label: "Term, ascending", sort: { field: "term", direction: "asc" } },
    { key: "term-desc", label: "Term, descending", sort: { field: "term", direction: "desc" } },
  ];
}

/** Whether `sort` is the CURRENT sort (item 219's aria-checked source) - the
 * same field/direction, and for a task sort, the same taskId too. Deliberately
 * NOT `resolveTaskSort`-aware: the caller passes an already-resolved sort
 * (see TasksTab.tsx), so this is a plain structural comparison. */
function sameSort(a: TaskSortState, b: TaskSortState): boolean {
  if (a.field !== b.field || a.direction !== b.direction) return false;
  return a.field !== "task" || a.taskId === b.taskId;
}

function menuLabel(target: ColumnMenuTarget): string {
  if (target.kind === "task") return `${target.task.label} column menu`;
  return target.kind === "course" ? "Course column menu" : "Progress column menu";
}

export interface TaskColumnMenuProps {
  anchorEl: HTMLElement | null;
  target: ColumnMenuTarget | null;
  onClose: () => void;

  sort: TaskSortState;
  onSortChange: (sort: TaskSortState) => void;

  columnFilters: TaskColumnFilters;
  onColumnFilterChange: (taskId: string, statuses: TaskStatus[]) => void;
  onColumnBulkSet: (task: TaskDefinition, status: TaskStatus) => void;

  /** AC3 (WCAG 2.5.7): the single-pointer, no-dragging route to every
   * reorder a drag can do - Move left/right/to start/to end of group,
   * disabled (not silently a no-op - item 12) at the visible edge of the
   * task's own group. `reorderColumns` is the SAME C5 input TasksTab.tsx
   * builds for the drag/keyboard routes (resolvedCatalog + visible flags,
   * not the grid's own rendered columns), so all three routes agree on what
   * "already at the edge" means. */
  reorderColumns: ReorderableColumn[];
  onMoveColumn: (taskId: string, kind: "left" | "right" | "start" | "end") => void;

  institution: string;
  onInstitutionChange: (v: string) => void;
  institutionOptions: string[];
  term: string;
  onTermChange: (v: string) => void;
  termOptions: string[];

  /** Effective value (already resolved by the caller) - see item 220's note
   * about binding to `effectiveOutstandingOnly`, never the raw toggle. */
  outstandingOnly: boolean;
  onOutstandingOnlyChange: (v: boolean) => void;
  outstandingOnlyDisabled: boolean;

  /**
   * Institutions present among the currently VISIBLE rows (docs/task-
   * institution-instructions-acceptance-criteria.md AC5 item 21) - already
   * deduped/sorted/blank-excluded via `distinctInstitutions`
   * (src/lib/course-tasks-view.ts), computed once by the caller (TasksGrid)
   * from the same `rows` it renders, never re-derived here. Only meaningful
   * for a task-column target.
   */
  visibleInstitutions: string[];
  /**
   * Every recorded (institution, task) instruction, loaded once per Tasks
   * tab mount - the same map TaskGridRow resolves cell-level instructions
   * from. Read-only here: this menu resolves the CURRENT body for whichever
   * institution the instructor is editing via resolveTaskInstruction; it
   * never builds the lookup key itself (AC2 item 7).
   */
  instructions: TaskInstructionMap;
  /**
   * Saves (or, given a blank body, deletes) one institution's instruction
   * for the target task - the SAME mutator TaskCell.tsx's cell editor calls
   * (useCourseTasksData.ts), so both editing surfaces share one write path
   * (AC5 items 23/25/26).
   */
  onSaveInstruction: (institution: string, taskId: string, body: string) => void;
}

export default function TaskColumnMenu({
  anchorEl,
  target,
  onClose,
  sort,
  onSortChange,
  columnFilters,
  onColumnFilterChange,
  onColumnBulkSet,
  reorderColumns,
  onMoveColumn,
  institution,
  onInstitutionChange,
  institutionOptions,
  term,
  onTermChange,
  termOptions,
  outstandingOnly,
  onOutstandingOnlyChange,
  outstandingOnlyDisabled,
  visibleInstitutions,
  instructions,
  onSaveInstruction,
}: TaskColumnMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const open = Boolean(anchorEl && target);

  // B1: the roving-tabindex slot - exactly one `[data-menuitem]` button is a
  // tab stop at a time (the APG menu model this file's own header comment
  // claims to implement), the same pattern TasksGrid.tsx already uses for
  // its own header row (registerRef + a single tabbable (row, col)), here
  // index-based since this menu is a flat list rather than a 2-D grid.
  const [activeIndex, setActiveIndex] = useState(0);

  // Resets the roving slot to the first item the instant `open` flips from
  // false to true - TaskCell.tsx's own "wasOpen" pattern (the "adjusting
  // state during render" technique - https://react.dev/learn/you-might-not-need-an-effect
  // - rather than a useEffect that calls setState synchronously, which this
  // repo's lint config forbids).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setActiveIndex(0);
  }

  // Mirrors TaskCell.tsx's own non-modal editor: focus moves into the panel
  // on open (there is no auto-focus trap to rely on - Popper never traps),
  // landing on the FIRST menu item rather than the panel itself, matching
  // the APG menu-button pattern. This is a genuine external-system sync (an
  // imperative DOM .focus() call), unlike the activeIndex reset above, so
  // it stays in an effect rather than joining that render-time check.
  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus();
  }, [open]);

  // AC5 item 21: the Instructions section's own local edit state - which
  // institution (when several are visible) is being edited, and the draft
  // body for it. Reset whenever the menu transitions closed->open OR the
  // target TASK changes while the menu stays open (the same "a mouse click
  // can swap target while open" case itemCount's own comment above already
  // has to handle) - same render-time-adjustment technique as `wasOpen`
  // above, keyed on a string rather than a boolean so a task-to-task swap
  // (not just closed-to-open) is caught too.
  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(null);
  const [instructionDraft, setInstructionDraft] = useState("");
  const [instructionResetKey, setInstructionResetKey] = useState<string | null>(null);
  const currentResetKey = open && target?.kind === "task" ? target.task.id : null;
  if (currentResetKey !== instructionResetKey) {
    setInstructionResetKey(currentResetKey);
    if (currentResetKey) {
      const scope = columnInstructionScope(visibleInstitutions);
      const initialInstitution = scope.kind === "single" ? scope.institution : null;
      setSelectedInstitution(initialInstitution);
      setInstructionDraft(initialInstitution ? resolveTaskInstruction(instructions, initialInstitution, currentResetKey) : "");
    }
  }

  if (!target) return null;

  // The sort options for THIS target, hoisted once - both the section below
  // and the item-index math further down need the same list/length.
  const sortOptions = sortOptionsFor(target);

  // AC5 item 21: how many extra roving-tabindex items the Instructions
  // section contributes - zero unless several institutions are visible (the
  // picker buttons), since a single institution's editor is a plain
  // TextField (Tab-reachable, not part of the arrow-key roving scheme, same
  // as TaskCell.tsx's own Note/Instructions fields).
  const instructionScope = target.kind === "task" ? columnInstructionScope(visibleInstitutions) : null;
  const instructionItemCount = instructionScope?.kind === "multiple" ? instructionScope.institutions.length : 0;

  // B1/C3: how many `[data-menuitem]` buttons this target's menu renders,
  // known up front from `target.kind` alone - courseSection's institution/
  // term pickers are now `menuitemradio` buttons themselves (one per option
  // plus "All institutions"/"All terms"), so they count here exactly like
  // every other section's items do. Clamped the same render-time way
  // TasksGrid clamps its own roving slot (the "adjusting state during
  // render" pattern, guarded by the `!==` check so it cannot loop): a mouse
  // click can swap `target` to a different header while this menu is
  // already open (open stays true throughout), which must not leave the
  // roving slot pointing past the new menu's item count.
  // AC3: a task target's menu gained a 4-item Reorder section (Move
  // left/right/to start/to end) between Sort and Filter by value.
  const itemCount =
    target.kind === "task"
      ? sortOptions.length + REORDER_ITEM_COUNT + TASK_STATUSES.length + 2 + TASK_STATUSES.length + instructionItemCount
      : target.kind === "progress"
        ? sortOptions.length + 1
        : sortOptions.length + (institutionOptions.length + 1) + (termOptions.length + 1);
  const clampedActiveIndex = Math.min(activeIndex, Math.max(0, itemCount - 1));
  if (clampedActiveIndex !== activeIndex) setActiveIndex(clampedActiveIndex);

  /** Roving-tabindex props for the `[data-menuitem]` button at flat index
   * `idx` (B1): `tabIndex={0}` for the one item currently holding the
   * roving slot, `-1` for every other - and `onFocus` keeps that slot in
   * sync when focus arrives some way other than moveFocus/focusEdge below
   * (a mouse click, or the initial open).
   *
   * `disabled` (defensive, reachability not confirmed): a disabled button
   * can never actually hold DOM focus, so if `clampedActiveIndex` ever
   * rests on a disabled item's index, handing it `tabIndex={0}` anyway
   * would leave this menu with ZERO tabbable items - the same failure C1's
   * own fix above exists to prevent, now possible from a different angle
   * since the Reorder section's four items (unlike the Progress menu's
   * single trailing disabled toggle) can be disabled in ANY position, so an
   * index that was a valid enabled item for one column's menu can be a
   * disabled one for another. Pass `disabled` for every item that has a
   * `disabled` prop of its own, so this can never hand out `tabIndex={0}`
   * to something that cannot accept it. */
  const rovingProps = (idx: number, disabled = false) => ({
    tabIndex: !disabled && clampedActiveIndex === idx ? 0 : -1,
    onFocus: () => setActiveIndex(idx),
    // C1 fix: every item's own flat index, read back by moveFocus/focusEdge
    // below instead of assuming it matches that item's position in the
    // disabled-filtered DOM list - true only when every section's disabled
    // items are trailing, which the new Reorder section's four items are
    // not (any of the four can be the disabled one, in any position).
    "data-index": idx,
  });

  // Escape returns focus to the header button that opened the menu (item
  // 230); a click-away does NOT force focus back - the user's click already
  // moved focus somewhere else on purpose.
  const closeAndRestoreFocus = () => {
    onClose();
    anchorEl?.focus();
  };

  const menuItems = () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? []);

  // B1/C1: the roving TABINDEX has to move along with the actual DOM focus.
  // `items[next]` is drawn from MENU_ITEM_SELECTOR, which excludes disabled
  // buttons, so its position in that FILTERED list is not always the same
  // as its true flat index (the number `rovingProps` was called with) - now
  // that the Reorder section can have a disabled item anywhere, not only
  // trailing. Reading `data-index` off the actual focused element is exact
  // regardless of where the disabled items fall - `parseFlatIndex` is the
  // parsing half of that (exported and unit-tested, since the DOM read
  // itself cannot be under this repo's node-environment vitest).
  const flatIndexOf = (el: HTMLElement | undefined, fallback: number): number =>
    parseFlatIndex(el?.getAttribute("data-index"), fallback);

  const moveFocus = (step: 1 | -1) => {
    const items = menuItems();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = current === -1 ? 0 : (current + step + items.length) % items.length;
    items[next]?.focus();
    setActiveIndex(flatIndexOf(items[next], next));
  };

  const focusEdge = (edge: "first" | "last") => {
    const items = menuItems();
    if (items.length === 0) return;
    const next = edge === "first" ? 0 : items.length - 1;
    items[next]?.focus();
    setActiveIndex(flatIndexOf(items[next], next));
  };

  // C3: the institution/term pickers used to be MUI `Select`s, which do not
  // forward Up/Down to this roving scheme while focused (those keys belong
  // to the native/MUI select's own option list) - they are now plain
  // `[data-menuitem]` menuitemradio buttons like every other item here, so
  // that split no longer applies; every item in this menu shares the one
  // handler below.
  const handleItemKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        e.stopPropagation();
        closeAndRestoreFocus();
        return;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(1);
        return;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(-1);
        return;
      case "Home":
        e.preventDefault();
        focusEdge("first");
        return;
      case "End":
        e.preventDefault();
        focusEdge("last");
        return;
      default:
        return;
    }
  };

  // The panel's own onKeyDown only needs Escape - every other key is
  // handled per-item by handleItemKeyDown above.
  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeAndRestoreFocus();
    }
  };

  const handleSortSelect = (option: SortOption) => {
    onSortChange(option.sort);
    closeAndRestoreFocus();
  };

  const sortSection = (
    <div role="group" aria-label="Sort" className={styles.colMenuSection}>
      <div className={styles.colMenuSectionLabel} aria-hidden="true">
        Sort
      </div>
      {sortOptions.map((option, idx) => {
        const checked = sameSort(sort, option.sort);
        return (
          <button
            key={option.key}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            data-menuitem="true"
            className={styles.colMenuItem}
            data-active={checked ? "true" : undefined}
            onClick={() => handleSortSelect(option)}
            onKeyDown={handleItemKeyDown}
            {...rovingProps(idx)}
          >
            <SortDirectionGlyph direction={option.sort.direction} />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );

  const filterSection = (task: TaskDefinition) => {
    const stored = columnFilters[task.id];
    // Re-applies the same empty/complete rule hasActiveColumnFilter already
    // owns (item 210/237), rather than a second inline copy of it.
    const active = hasActiveColumnFilter(columnFilters, task.id);
    // An inactive filter (absent, empty, or complete - item 210) displays as
    // every box checked: "no constraint" reads as "everything is included",
    // matching a conventional column-filter's own "select all" resting
    // state rather than an ambiguous all-unchecked look.
    const checkedSet = active ? new Set(stored) : new Set(TASK_STATUSES);

    const toggle = (status: TaskStatus) => {
      const next = new Set(checkedSet);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      onColumnFilterChange(
        task.id,
        TASK_STATUSES.filter((s) => next.has(s))
      );
    };

    // B1: this section's flat indices start after the sort AND reorder
    // sections' own; "Select all"/"Clear filter" follow the four status
    // checkboxes.
    const base = sortOptions.length + REORDER_ITEM_COUNT;

    return (
      <div role="group" aria-label="Filter by value" className={styles.colMenuSection}>
        <div className={styles.colMenuSectionLabel} aria-hidden="true">
          Filter by value
        </div>
        {TASK_STATUSES.map((status, i) => {
          const checked = checkedSet.has(status);
          return (
            <button
              key={status}
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              data-menuitem="true"
              className={styles.colMenuItem}
              onClick={() => toggle(status)}
              onKeyDown={handleItemKeyDown}
              {...rovingProps(base + i)}
            >
              <MenuCheckGlyph checked={checked} />
              <StatusGlyph status={status} />
              <span>{TASK_STATUS_WORDS[status]}</span>
            </button>
          );
        })}
        <button
          type="button"
          role="menuitem"
          data-menuitem="true"
          className={styles.colMenuItem}
          onClick={() => onColumnFilterChange(task.id, [...TASK_STATUSES])}
          onKeyDown={handleItemKeyDown}
          {...rovingProps(base + TASK_STATUSES.length)}
        >
          <span>Select all</span>
        </button>
        <button
          type="button"
          role="menuitem"
          data-menuitem="true"
          className={styles.colMenuItem}
          onClick={() => onColumnFilterChange(task.id, [])}
          onKeyDown={handleItemKeyDown}
          {...rovingProps(base + TASK_STATUSES.length + 1)}
        >
          <span>Clear filter</span>
        </button>
      </div>
    );
  };

  const reorderSection = (task: TaskDefinition) => {
    const base = sortOptions.length;
    return (
      <div role="group" aria-label="Reorder column" className={styles.colMenuSection}>
        <div className={styles.colMenuSectionLabel} aria-hidden="true">
          Reorder
        </div>
        {REORDER_ITEMS.map((item, i) => {
          const stillValid =
            item.kind === "left" || item.kind === "right"
              ? stepWithinGroup(reorderColumns, task.id, item.kind) !== null
              : moveToGroupEdge(reorderColumns, task.id, item.kind) !== null;
          return (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              data-menuitem="true"
              className={styles.colMenuItem}
              disabled={!stillValid}
              onClick={() => {
                onMoveColumn(task.id, item.kind);
                closeAndRestoreFocus();
              }}
              onKeyDown={handleItemKeyDown}
              {...rovingProps(base + i, !stillValid)}
            >
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const bulkSection = (task: TaskDefinition) => {
    // B1: after the sort and reorder sections, the four filter checkboxes
    // and the two "Select all"/"Clear filter" buttons.
    const base = sortOptions.length + REORDER_ITEM_COUNT + TASK_STATUSES.length + 2;
    return (
      <div role="group" aria-label="Bulk update" className={styles.colMenuSection}>
        <div className={styles.colMenuSectionLabel} aria-hidden="true">
          Bulk update
        </div>
        {TASK_STATUSES.map((status, i) => (
          <button
            key={status}
            type="button"
            role="menuitem"
            data-menuitem="true"
            className={styles.colMenuItem}
            onClick={() => {
              onColumnBulkSet(task, status);
              closeAndRestoreFocus();
            }}
            onKeyDown={handleItemKeyDown}
            {...rovingProps(base + i)}
          >
            <StatusGlyph status={status} />
            <span>{`Set every visible row to ${TASK_STATUS_WORDS[status]}`}</span>
          </button>
        ))}
      </div>
    );
  };

  // AC5 item 21: commits the current draft for `institution` if it actually
  // differs from what is already resolved for it - mirrors TaskCell.tsx's
  // own commitInstruction guard exactly, so the two surfaces behave
  // identically on "did anything change".
  const commitInstructionDraft = (institution: string, taskId: string) => {
    const current = resolveTaskInstruction(instructions, institution, taskId);
    if (instructionDraft.trim() === current.trim()) return;
    onSaveInstruction(institution, taskId, instructionDraft);
  };

  // Switching which institution is being edited (the "multiple" case only)
  // first commits whatever draft was pending for the PREVIOUS selection, so
  // picking a different institution can never silently discard an edit -
  // then loads the new selection's own already-resolved body as the new
  // draft.
  const chooseInstitution = (nextInstitution: string, taskId: string) => {
    if (selectedInstitution && selectedInstitution !== nextInstitution) {
      commitInstructionDraft(selectedInstitution, taskId);
    }
    setSelectedInstitution(nextInstitution);
    setInstructionDraft(resolveTaskInstruction(instructions, nextInstitution, taskId));
  };

  // AC5 item 21: the column menu's Instructions section - edits the ONE
  // institution directly when the visible rows span exactly one, LISTS them
  // when they span several (so the instructor picks deliberately rather
  // than the app guessing), and explains why there is nothing to edit when
  // none of the visible rows carry an institution at all. `scope` is the
  // SAME columnInstructionScope this component's own render-time reset
  // above already computed from `visibleInstitutions` - never re-derived
  // here with different logic.
  const instructionSection = (task: TaskDefinition) => {
    const scope = instructionScope ?? columnInstructionScope(visibleInstitutions);
    const base = sortOptions.length + REORDER_ITEM_COUNT + TASK_STATUSES.length + 2 + TASK_STATUSES.length;

    if (scope.kind === "none") {
      return (
        <div role="group" aria-label="Instructions" className={styles.colMenuSection}>
          <div className={styles.colMenuSectionLabel} aria-hidden="true">
            Instructions
          </div>
          <p className={instructionStyles.noInstructionNote}>
            No visible course has an institution set, so there is no shared instruction to edit for &quot;
            {task.label}&quot; here.
          </p>
        </div>
      );
    }

    const editingInstitution = scope.kind === "single" ? scope.institution : selectedInstitution;

    return (
      <div role="group" aria-label="Instructions" className={styles.colMenuSection}>
        <div className={styles.colMenuSectionLabel} aria-hidden="true">
          Instructions
        </div>
        {scope.kind === "multiple" && (
          <div className={instructionStyles.institutionPicker} role="group" aria-label="Choose institution to edit">
            {scope.institutions.map((inst, i) => (
              <button
                key={inst}
                type="button"
                role="menuitemradio"
                aria-checked={selectedInstitution === inst}
                data-menuitem="true"
                className={styles.colMenuItem}
                data-active={selectedInstitution === inst ? "true" : undefined}
                onClick={() => chooseInstitution(inst, task.id)}
                onKeyDown={handleItemKeyDown}
                {...rovingProps(base + i)}
              >
                <MenuCheckGlyph checked={selectedInstitution === inst} />
                <span>{inst}</span>
              </button>
            ))}
          </div>
        )}
        {editingInstitution && (
          <div className={instructionStyles.instructionField}>
            <p className={instructionStyles.scopeText}>{taskInstructionScopeText(editingInstitution, task.label)}</p>
            <TextField
              size="small"
              fullWidth
              label="Institution instructions"
              placeholder="Standing guidance for every course here"
              multiline
              minRows={2}
              value={instructionDraft}
              onChange={(e) => setInstructionDraft(e.target.value.slice(0, TASK_INSTRUCTION_MAX_LENGTH))}
              onBlur={() => commitInstructionDraft(editingInstitution, task.id)}
            />
          </div>
        )}
      </div>
    );
  };

  // C3: was two MUI `Select`s - `role="combobox" tabindex="0"` inside a
  // `role="menu"` panel, invalid children of `role="menu"` (same class of
  // problem as round 1's B5), reachable only via Tab (never the arrow keys,
  // since they carried no `data-menuitem`) - exactly the second tab-stop
  // path C1 exists to remove. Now a `menuitemradio` group per picker, built
  // like filterSection's status checkboxes above: one button per option
  // plus "All institutions"/"All terms", registered in the SAME roving list
  // via `data-menuitem`/`rovingProps`. Selecting an option keeps the menu
  // OPEN (no `closeAndRestoreFocus`) - the same behavior the Selects had,
  // since an instructor picking an institution here often wants to also set
  // a term without reopening the menu. Both still call the SAME
  // onInstitutionChange/onTermChange props the toolbar's own selects use
  // (item 220) - no second source of truth is introduced.
  const institutionBase = sortOptions.length;
  const termBase = institutionBase + institutionOptions.length + 1;

  const courseSection = (
    <>
      <div role="group" aria-label="Institution" className={styles.colMenuSection}>
        <div className={styles.colMenuSectionLabel} aria-hidden="true">
          Institution
        </div>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={institution === ALL_FILTER}
          data-menuitem="true"
          className={styles.colMenuItem}
          data-active={institution === ALL_FILTER ? "true" : undefined}
          onClick={() => onInstitutionChange(ALL_FILTER)}
          onKeyDown={handleItemKeyDown}
          {...rovingProps(institutionBase)}
        >
          <MenuCheckGlyph checked={institution === ALL_FILTER} />
          <span>All institutions</span>
        </button>
        {institutionOptions.map((opt, i) => {
          const checked = institution === opt;
          return (
            <button
              key={opt}
              type="button"
              role="menuitemradio"
              aria-checked={checked}
              data-menuitem="true"
              className={styles.colMenuItem}
              data-active={checked ? "true" : undefined}
              onClick={() => onInstitutionChange(opt)}
              onKeyDown={handleItemKeyDown}
              {...rovingProps(institutionBase + 1 + i)}
            >
              <MenuCheckGlyph checked={checked} />
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
      <Divider />
      <div role="group" aria-label="Term" className={styles.colMenuSection}>
        <div className={styles.colMenuSectionLabel} aria-hidden="true">
          Term
        </div>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={term === ALL_FILTER}
          data-menuitem="true"
          className={styles.colMenuItem}
          data-active={term === ALL_FILTER ? "true" : undefined}
          onClick={() => onTermChange(ALL_FILTER)}
          onKeyDown={handleItemKeyDown}
          {...rovingProps(termBase)}
        >
          <MenuCheckGlyph checked={term === ALL_FILTER} />
          <span>All terms</span>
        </button>
        {termOptions.map((opt, i) => {
          const checked = term === opt;
          return (
            <button
              key={opt}
              type="button"
              role="menuitemradio"
              aria-checked={checked}
              data-menuitem="true"
              className={styles.colMenuItem}
              data-active={checked ? "true" : undefined}
              onClick={() => onTermChange(opt)}
              onKeyDown={handleItemKeyDown}
              {...rovingProps(termBase + 1 + i)}
            >
              <MenuCheckGlyph checked={checked} />
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
    </>
  );

  const progressSection = (
    <div role="group" aria-label="Outstanding only" className={styles.colMenuSection}>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={outstandingOnly}
        data-menuitem="true"
        className={styles.colMenuItem}
        disabled={outstandingOnlyDisabled}
        onClick={() => onOutstandingOnlyChange(!outstandingOnly)}
        onKeyDown={handleItemKeyDown}
        {...rovingProps(sortOptions.length, outstandingOnlyDisabled)}
      >
        <MenuCheckGlyph checked={outstandingOnly} />
        <span>Outstanding only</span>
      </button>
    </div>
  );

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="bottom-start"
      style={{ zIndex: 1300 }}
      modifiers={[{ name: "offset", options: { offset: [0, 4] } }]}
    >
      <ClickAwayListener onClickAway={onClose}>
        <Paper
          ref={rootRef}
          elevation={4}
          sx={{
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            border: "1px solid var(--card-border)",
          }}
          role="menu"
          aria-label={menuLabel(target)}
          className={styles.colMenu}
          onKeyDown={handlePanelKeyDown}
        >
          {sortSection}
          {target.kind === "task" && (
            <>
              <Divider />
              {reorderSection(target.task)}
              <Divider />
              {filterSection(target.task)}
              <Divider />
              {bulkSection(target.task)}
              <Divider />
              {instructionSection(target.task)}
            </>
          )}
          {target.kind === "course" && (
            <>
              <Divider />
              {courseSection}
            </>
          )}
          {target.kind === "progress" && (
            <>
              <Divider />
              {progressSection}
            </>
          )}
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}
