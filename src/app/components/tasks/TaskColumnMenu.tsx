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
import { TASK_STATUSES, type TaskDefinition, type TaskStatus } from "@/lib/course-tasks";
import {
  ALL_FILTER,
  hasActiveColumnFilter,
  TASK_STATUS_WORDS,
  type TaskColumnFilters,
  type TaskSortState,
} from "@/lib/course-tasks-view";
import { StatusGlyph, SortDirectionGlyph, MenuCheckGlyph } from "./TaskCell";
import styles from "./TasksGrid.module.css";

export type ColumnMenuTarget = { kind: "task"; task: TaskDefinition } | { kind: "course" } | { kind: "progress" };

// C1: excludes a disabled `[data-menuitem]` (the Progress menu's
// outstanding-only toggle, disabled whenever outstandingOnlyDisabled is
// true) from every roving-tabindex query - a disabled button cannot hold
// DOM focus, so leaving it in the queried list let the roving slot land on
// it anyway (via moveFocus/focusEdge or the initial-open autofocus below),
// leaving the menu with ZERO tabbable items. Shared by all three query
// sites so they can never drift out of sync on which elements count.
const MENU_ITEM_SELECTOR = '[data-menuitem="true"]:not([disabled])';

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
  institution,
  onInstitutionChange,
  institutionOptions,
  term,
  onTermChange,
  termOptions,
  outstandingOnly,
  onOutstandingOnlyChange,
  outstandingOnlyDisabled,
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

  if (!target) return null;

  // The sort options for THIS target, hoisted once - both the section below
  // and the item-index math further down need the same list/length.
  const sortOptions = sortOptionsFor(target);

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
  const itemCount =
    target.kind === "task"
      ? sortOptions.length + TASK_STATUSES.length + 2 + TASK_STATUSES.length
      : target.kind === "progress"
        ? sortOptions.length + 1
        : sortOptions.length + (institutionOptions.length + 1) + (termOptions.length + 1);
  const clampedActiveIndex = Math.min(activeIndex, Math.max(0, itemCount - 1));
  if (clampedActiveIndex !== activeIndex) setActiveIndex(clampedActiveIndex);

  /** Roving-tabindex props for the `[data-menuitem]` button at flat index
   * `idx` (B1): `tabIndex={0}` for the one item currently holding the
   * roving slot, `-1` for every other - and `onFocus` keeps that slot in
   * sync when focus arrives some way other than moveFocus/focusEdge below
   * (a mouse click, or the initial open). */
  const rovingProps = (idx: number) => ({
    tabIndex: clampedActiveIndex === idx ? 0 : -1,
    onFocus: () => setActiveIndex(idx),
  });

  // Escape returns focus to the header button that opened the menu (item
  // 230); a click-away does NOT force focus back - the user's click already
  // moved focus somewhere else on purpose.
  const closeAndRestoreFocus = () => {
    onClose();
    anchorEl?.focus();
  };

  const menuItems = () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? []);

  const moveFocus = (step: 1 | -1) => {
    const items = menuItems();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = current === -1 ? 0 : (current + step + items.length) % items.length;
    items[next]?.focus();
    // B1/C1: the roving TABINDEX has to move along with the actual DOM
    // focus - `items[next]` is drawn from MENU_ITEM_SELECTOR, which is the
    // SAME DOM-order list (minus any disabled element) `rovingProps`'s flat
    // indices were assigned against, so `next`'s position in this filtered
    // list still equals that element's true flat index PROVIDED no disabled
    // item sits before it in DOM order. That holds for every menu this file
    // renders today - the only disabled `[data-menuitem]` is the Progress
    // menu's outstanding-only toggle, and it is always the LAST item in its
    // section - but is not something this function can verify on its own,
    // so a future disabled item placed earlier in a section would need this
    // re-checked.
    setActiveIndex(next);
  };

  const focusEdge = (edge: "first" | "last") => {
    const items = menuItems();
    if (items.length === 0) return;
    const next = edge === "first" ? 0 : items.length - 1;
    items[next]?.focus();
    setActiveIndex(next);
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

    // B1: this section's flat indices start right after the sort section's
    // own (`sortOptions.length` of them); "Select all"/"Clear filter" follow
    // the four status checkboxes.
    const base = sortOptions.length;

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

  const bulkSection = (task: TaskDefinition) => {
    // B1: after the sort section, the four filter checkboxes and the two
    // "Select all"/"Clear filter" buttons.
    const base = sortOptions.length + TASK_STATUSES.length + 2;
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
        {...rovingProps(sortOptions.length)}
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
          role="menu"
          aria-label={menuLabel(target)}
          className={styles.colMenu}
          onKeyDown={handlePanelKeyDown}
        >
          {sortSection}
          {target.kind === "task" && (
            <>
              <Divider />
              {filterSection(target.task)}
              <Divider />
              {bulkSection(target.task)}
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
