"use client";

// The active-filter chip row (AC-E item 225/226): one removable chip per
// active constraint - search, institution, term, outstanding-only, and one
// per active task-column filter (via describeTaskColumnFilters, the same
// descriptor the header's accessible name and the live-region announcement
// use, so none of the three can drift apart from the others) - plus a
// "Clear all filters" control once two or more are active. A filtered table
// must never look identical to an unfiltered one (item 225's own
// rationale): a column filter can sit off-screen behind a horizontal
// scroll, or behind a hidden column, and silently change what the
// instructor is reading with no other visible sign.
//
// Presentation only (AC-G item 241) - every chip's text and the decision of
// which constraints are "active" is computed by the caller.
import { ALL_FILTER, describeTaskColumnFilters, type TaskColumnFilters } from "@/lib/course-tasks-view";
import type { TaskDefinition } from "@/lib/course-tasks";
import styles from "./TasksGrid.module.css";

// An inline SVG "x", matching this feature's StatusGlyph/SortDirectionGlyph/
// FilterActiveGlyph idiom (TaskCell.tsx) rather than a text character - kept
// local to this file since it is not a status mark those are shared for.
function RemoveGlyph() {
  return (
    <svg width={10} height={10} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export interface TasksFilterChipsProps {
  search: string;
  onClearSearch: () => void;
  institution: string;
  onClearInstitution: () => void;
  term: string;
  onClearTerm: () => void;
  outstandingOnly: boolean;
  onClearOutstandingOnly: () => void;
  columnFilters: TaskColumnFilters;
  tasks: TaskDefinition[];
  onClearColumnFilter: (taskId: string) => void;
  onClearAll: () => void;
}

export default function TasksFilterChips({
  search,
  onClearSearch,
  institution,
  onClearInstitution,
  term,
  onClearTerm,
  outstandingOnly,
  onClearOutstandingOnly,
  columnFilters,
  tasks,
  onClearColumnFilter,
  onClearAll,
}: TasksFilterChipsProps) {
  const columnDescriptors = describeTaskColumnFilters(columnFilters, tasks);

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (search.trim()) chips.push({ key: "search", label: `Search: "${search.trim()}"`, onRemove: onClearSearch });
  if (institution !== ALL_FILTER) chips.push({ key: "institution", label: `Institution: ${institution}`, onRemove: onClearInstitution });
  if (term !== ALL_FILTER) chips.push({ key: "term", label: `Term: ${term}`, onRemove: onClearTerm });
  if (outstandingOnly) chips.push({ key: "outstanding", label: "Outstanding only", onRemove: onClearOutstandingOnly });
  for (const d of columnDescriptors) {
    chips.push({
      key: `col:${d.taskId}`,
      label: `${d.label}: ${d.statusWords}`,
      onRemove: () => onClearColumnFilter(d.taskId),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className={styles.filterChipRow} role="group" aria-label="Active filters">
      {chips.map((chip) => (
        <span key={chip.key} className={styles.filterChip}>
          <span className={styles.filterChipLabel}>{chip.label}</span>
          <button
            type="button"
            className={styles.filterChipRemove}
            onClick={chip.onRemove}
            aria-label={`Remove filter: ${chip.label}`}
          >
            <RemoveGlyph />
          </button>
        </span>
      ))}
      {/* item 226: "Clear all filters" appears once two or more constraints
          are active, and resets ONLY the filters - never the sort, the
          column-visibility set, or density, which are separate controls
          with their own chips/menus. */}
      {chips.length >= 2 && (
        <button type="button" className={styles.filterChipClearAll} onClick={onClearAll}>
          Clear all filters
        </button>
      )}
    </div>
  );
}
