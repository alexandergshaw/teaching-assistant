// Pure helpers for the "Weekly Checklist Overview" modal (opened from the
// FAB's third SpeedDialAction): flattening every course's weekly checklist
// into one row per item across ALL courses, sorting those rows, and
// persisting the chosen sort. Mirrors the automations-table-helpers.ts /
// courses-table-helpers.ts pattern (sortValueFor / compare / parse) so every
// sortable table in this app agrees on how "missing value" and "tie" are
// handled - see those files' own module comments for the same rationale.
//
// This view exists to answer one question - "what do I still owe across all
// my courses this week" - so the row shape and default sort are both built
// around that, not around a generic "dump the data" table.

import type { Course } from "./supabase/courses";
import {
  coerceWeeklyChecklist,
  isWeeklyChecklistItemOverdue,
  type WeeklyChecklistDeadline,
} from "./weekly-checklist";

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface WeeklyChecklistOverviewRow {
  /** `${courseId}:${itemId}` - unique across every course, used as the React
   * key and in tests; never re-derived from label text (which is not
   * guaranteed unique). */
  key: string;
  courseId: string;
  courseName: string;
  itemId: string;
  label: string;
  deadline: WeeklyChecklistDeadline | null;
  checked: boolean;
  /**
   * Computed once, at row-build time, from the `nowMs` the caller supplies -
   * NOT read from the clock in here or in the comparator below. This keeps
   * buildWeeklyChecklistOverviewRows the single, isolated place that is
   * time-dependent (mirrors currentTimeMs() in WeeklyChecklistCell.tsx,
   * which is the equivalent isolation point for the cell), while
   * compareWeeklyChecklistRows stays a pure function of two already-built
   * rows, just like sortValueFor in courses-table-helpers.ts and
   * automations-table-helpers.ts.
   */
  overdue: boolean;
}

/**
 * Flattens every course's weekly checklist into one row per item, across
 * ALL courses (AC1) - not scoped to one course the way WeeklyChecklistCell
 * is. A course with no items (or no weeklyChecklist at all) contributes zero
 * rows, not a placeholder row - callers distinguish "no courses have
 * checklist items yet" from "everything is just hidden by a filter" using
 * the length of THIS function's output before any filtering, never after.
 * Coerces defensively (coerceWeeklyChecklist) since Course.weeklyChecklist
 * is optional and untrusted, same as every other reader of that field.
 */
export function buildWeeklyChecklistOverviewRows(
  courses: Course[],
  nowMs: number
): WeeklyChecklistOverviewRow[] {
  const rows: WeeklyChecklistOverviewRow[] = [];
  for (const course of courses) {
    const items = coerceWeeklyChecklist(course.weeklyChecklist);
    for (const item of items) {
      rows.push({
        key: `${course.id}:${item.id}`,
        courseId: course.id,
        courseName: course.name,
        itemId: item.id,
        label: item.label,
        deadline: item.deadline,
        checked: item.checked,
        overdue: isWeeklyChecklistItemOverdue(item, nowMs),
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type WeeklyChecklistSortField = "course" | "item" | "weekday" | "time" | "checked" | "overdue";
export type WeeklyChecklistSortDirection = "asc" | "desc";

export interface WeeklyChecklistSortState {
  field: WeeklyChecklistSortField;
  direction: WeeklyChecklistSortDirection;
}

// "checked" ascending, not "course" - see sortValueFor's "checked" case for
// why: it surfaces every still-open ("owed") item before any already-done
// one, which is exactly what this view exists to answer.
export const DEFAULT_WEEKLY_CHECKLIST_SORT: WeeklyChecklistSortState = { field: "checked", direction: "asc" };

export const WEEKLY_CHECKLIST_SORT_FIELDS: WeeklyChecklistSortField[] = [
  "course",
  "item",
  "weekday",
  "time",
  "checked",
  "overdue",
];
const SORT_DIRECTIONS: WeeklyChecklistSortDirection[] = ["asc", "desc"];

/** Parse a persisted ta-weekly-checklist-overview-sort value; anything
 * unrecognized or malformed (unknown column, bad direction, wrong shape,
 * corrupt JSON) falls back to the default sort rather than throwing. */
export function parseWeeklyChecklistSortState(raw: string | null | undefined): WeeklyChecklistSortState {
  if (!raw) return DEFAULT_WEEKLY_CHECKLIST_SORT;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "field" in parsed &&
      "direction" in parsed &&
      WEEKLY_CHECKLIST_SORT_FIELDS.includes((parsed as { field: unknown }).field as WeeklyChecklistSortField) &&
      SORT_DIRECTIONS.includes((parsed as { direction: unknown }).direction as WeeklyChecklistSortDirection)
    ) {
      return {
        field: (parsed as { field: WeeklyChecklistSortField }).field,
        direction: (parsed as { direction: WeeklyChecklistSortDirection }).direction,
      };
    }
    return DEFAULT_WEEKLY_CHECKLIST_SORT;
  } catch {
    return DEFAULT_WEEKLY_CHECKLIST_SORT;
  }
}

type SortValue = { kind: "text"; value: string; empty: boolean } | { kind: "number"; value: number; empty: boolean };

/** Pure extractor: maps one row + sortable field to a typed, comparable
 * value. "empty" marks values that must always sort last, in both
 * directions - an item with no deadline has neither a weekday nor a time to
 * sort by, and an item with a deadline but no specific time (the "by end of
 * day" case - see WeeklyChecklistDeadline's own doc comment) still has no
 * TIME value, so it is empty for the "time" column specifically even though
 * it has a real "weekday" value. */
function sortValueFor(row: WeeklyChecklistOverviewRow, field: WeeklyChecklistSortField): SortValue {
  switch (field) {
    case "course":
      return { kind: "text", value: row.courseName, empty: false };
    case "item":
      return { kind: "text", value: row.label, empty: false };
    case "weekday":
      return row.deadline
        ? { kind: "number", value: row.deadline.weekday, empty: false }
        : { kind: "number", value: 0, empty: true };
    case "time":
      return row.deadline?.time
        ? { kind: "text", value: row.deadline.time, empty: false }
        : { kind: "text", value: "", empty: true };
    case "checked":
      // 0 = still open ("owed"), 1 = done. Ascending therefore surfaces open
      // items first - see DEFAULT_WEEKLY_CHECKLIST_SORT above. Never empty:
      // false is an ordinary value here, not a missing one.
      return { kind: "number", value: row.checked ? 1 : 0, empty: false };
    case "overdue":
      // 0 = overdue (needs attention now), 1 = not overdue. Ascending
      // therefore surfaces the most urgent rows first. This is the OPPOSITE
      // polarity from "checked" above - not an inconsistency, just a
      // different column: overdue's notable state is being true, while
      // checked's notable state (for THIS view's purpose) is being false.
      return { kind: "number", value: row.overdue ? 0 : 1, empty: false };
  }
}

function compareSortValues(a: SortValue, b: SortValue): number {
  if (a.kind === "text" && b.kind === "text") return a.value.localeCompare(b.value, undefined, { sensitivity: "base" });
  if (a.kind === "number" && b.kind === "number") return a.value - b.value;
  // Same field always yields the same kind on both sides; unreachable in
  // practice, but keeps the function total.
  return 0;
}

/** One comparator for every sortable column, driven by sortValueFor. Empty
 * values (no weekday, no time) always sort last, in both directions - an
 * item with no deadline must never land wherever the comparator happens to
 * drop it. Ties (including "both empty") break by course name ascending,
 * then item label ascending - both fixed, direction-independent, mirroring
 * how compareAutomationRows/compareCourses always tie-break by name
 * ascending regardless of the primary field or its direction. Two axes
 * (course, then item) rather than one because a row's identity here is a
 * pair, not a single name - two different courses very plausibly share an
 * item label ("Reading"), so course must break the tie first. */
export function compareWeeklyChecklistRows(
  a: WeeklyChecklistOverviewRow,
  b: WeeklyChecklistOverviewRow,
  sort: WeeklyChecklistSortState
): number {
  const av = sortValueFor(a, sort.field);
  const bv = sortValueFor(b, sort.field);

  let primary: number;
  if (av.empty && bv.empty) primary = 0;
  else if (av.empty) return 1;
  else if (bv.empty) return -1;
  else primary = compareSortValues(av, bv);

  if (primary === 0) {
    const courseCmp = a.courseName.localeCompare(b.courseName, undefined, { sensitivity: "base" });
    if (courseCmp !== 0) return courseCmp;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  }

  return sort.direction === "asc" ? primary : -primary;
}

export function sortWeeklyChecklistRows(
  rows: WeeklyChecklistOverviewRow[],
  sort: WeeklyChecklistSortState
): WeeklyChecklistOverviewRow[] {
  return [...rows].sort((a, b) => compareWeeklyChecklistRows(a, b, sort));
}

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

/** hour/minute here are already range-checked by weekly-checklist.ts's own
 * normalizeTime before a deadline is ever stored - duplicated here (rather
 * than importing an unexported helper) because weekly-checklist.ts is a
 * concurrently-owned file this feature only reads from, never edits. */
export function formatWeeklyChecklistTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour24 = Number(hourStr);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12raw = hour24 % 12;
  const hour12 = hour12raw === 0 ? 12 : hour12raw;
  return `${hour12}:${minuteStr} ${period}`;
}
