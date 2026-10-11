/**
 * L3 - pure table logic for the live-LMS messaging table (LIVE-LMS-STUDENT-
 * MESSAGING W3, docs/live-lms-student-messaging-scope.md sections 5 and 7).
 *
 * Filter / sort / search over the aggregator's EnrollmentRow[]. Mirrors the
 * PATTERN of course-tasks-view-column-filters.ts (a Record<column, selected[]>
 * shape, a normalize function for untrusted persisted state, "empty or
 * everything selected is no constraint") but is not that module's
 * status-specific type.
 *
 * Columns covered: course, section, term, missing. The "Current Status" column
 * is DELIBERATELY ABSENT: its definition is an open owner decision, so no
 * filter token exists for it here. Persistence (ta- keys) is the surface's
 * job; this module only exports the normalize/apply functions it will call.
 * No React, no storage, no clock.
 */

import type { EnrollmentRow } from "./enrollment-aggregator";

export const FILTER_COLUMNS = ["course", "section", "term", "missing"] as const;
export type FilterColumn = (typeof FILTER_COLUMNS)[number];

/** column -> selected tokens to KEEP. Absent / empty / complete = no constraint. */
export type ColumnFilters = Partial<Record<FilterColumn, string[]>>;

export const SORT_KEYS = ["name", "course", "section", "term", "missing", "grade"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";
export interface SortSpec {
  readonly key: SortKey;
  readonly direction: SortDirection;
}

export interface TableViewState {
  readonly search?: string;
  readonly filters?: ColumnFilters;
  readonly sort?: SortSpec | null;
}

/** The filter token a row contributes to a column. "" is the blank bucket
 * (no section, no term, or an unreadable missing count). */
export function filterToken(row: EnrollmentRow, column: FilterColumn): string {
  switch (column) {
    case "course":
      return row.course;
    case "section":
      return row.section;
    case "term":
      return row.term ?? "";
    case "missing":
      return row.missingCount === null ? "" : String(row.missingCount);
  }
}

function isFilterColumn(value: string): value is FilterColumn {
  return (FILTER_COLUMNS as readonly string[]).includes(value);
}

/** Distinct tokens present in a column, sorted (numerically for "missing"). */
export function columnOptions(rows: readonly EnrollmentRow[], column: FilterColumn): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(filterToken(r, column));
  const out = [...set];
  if (column === "missing") {
    return out.sort((a, b) => {
      if (a === "") return b === "" ? 0 : 1;
      if (b === "") return -1;
      return Number(a) - Number(b);
    });
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Whether a selection constrains anything. With `options` given, selecting
 * every option is equivalent to no filter. Empty is never a constraint, so
 * deselecting everything cannot silently empty the table. */
export function isColumnFilterActive(
  selected: readonly string[] | undefined,
  options?: readonly string[]
): boolean {
  if (!selected || selected.length === 0) return false;
  if (!options) return true;
  const chosen = new Set(selected);
  return options.some((o) => !chosen.has(o));
}

/**
 * Coerces untrusted persisted state into well-formed ColumnFilters: drops
 * unknown columns, non-array values and non-string tokens, de-duplicates and
 * sorts the survivors, and drops an entry that ends up empty. Builds fresh
 * objects (null-prototype accumulator so a "__proto__" key cannot hijack it)
 * and never throws.
 */
export function normalizeColumnFilters(raw: unknown): ColumnFilters {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const acc = Object.create(null) as Record<string, string[]>;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isFilterColumn(key) || !Array.isArray(value)) continue;
    const tokens = [...new Set(value.filter((v): v is string => typeof v === "string"))].sort();
    if (tokens.length > 0) acc[key] = tokens;
  }
  const out: ColumnFilters = {};
  for (const column of FILTER_COLUMNS) {
    if (acc[column]) out[column] = acc[column];
  }
  return out;
}

/** Keeps rows whose token is selected in EVERY active column filter. Option
 * sets are taken from the unfiltered `rows`. */
export function applyColumnFilters(rows: readonly EnrollmentRow[], filters: ColumnFilters): EnrollmentRow[] {
  const active: Array<{ column: FilterColumn; keep: Set<string> }> = [];
  for (const column of FILTER_COLUMNS) {
    const selected = filters[column];
    if (isColumnFilterActive(selected, columnOptions(rows, column))) {
      active.push({ column, keep: new Set(selected) });
    }
  }
  if (active.length === 0) return [...rows];
  return rows.filter((r) => active.every((a) => a.keep.has(filterToken(r, a.column))));
}

/** Case-insensitive substring match over student name + course. Blank = all. */
export function searchRows(rows: readonly EnrollmentRow[], query: string): EnrollmentRow[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...rows];
  return rows.filter((r) => r.name.toLowerCase().includes(q) || r.course.toLowerCase().includes(q));
}

function compareNullable<T>(a: T, b: T, cmp: (x: NonNullable<T>, y: NonNullable<T>) => number): number {
  return cmp(a as NonNullable<T>, b as NonNullable<T>);
}

function isNullKey(row: EnrollmentRow, key: SortKey): boolean {
  if (key === "term") return row.term === null;
  if (key === "missing") return row.missingCount === null;
  if (key === "grade") return row.grade === null;
  return false;
}

function compareByKey(a: EnrollmentRow, b: EnrollmentRow, key: SortKey): number {
  switch (key) {
    case "name":
      return (
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName) ||
        a.name.localeCompare(b.name)
      );
    case "course":
      return a.course.localeCompare(b.course);
    case "section":
      return a.section.localeCompare(b.section);
    case "term":
      return compareNullable(a.term, b.term, (x, y) => x.localeCompare(y));
    case "missing":
      return compareNullable(a.missingCount, b.missingCount, (x, y) => x - y);
    case "grade":
      return compareNullable(a.grade, b.grade, (x, y) => x - y);
  }
}

/** Stable sort. Null values (term, missing, grade) always sort last, in both
 * directions. Does not mutate the input. */
export function sortRows(rows: readonly EnrollmentRow[], sort: SortSpec | null | undefined): EnrollmentRow[] {
  if (!sort) return [...rows];
  const sign = sort.direction === "desc" ? -1 : 1;
  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((x, y) => {
    const xn = isNullKey(x.row, sort.key);
    const yn = isNullKey(y.row, sort.key);
    if (xn || yn) return (xn ? 1 : 0) - (yn ? 1 : 0) || x.index - y.index;
    return compareByKey(x.row, y.row, sort.key) * sign || x.index - y.index;
  });
  return indexed.map((i) => i.row);
}

/** The composed view: search, then column filters, then sort. */
export function applyTableView(rows: readonly EnrollmentRow[], state: TableViewState): EnrollmentRow[] {
  const searched = searchRows(rows, state.search ?? "");
  const filtered = applyColumnFilters(searched, state.filters ?? {});
  return sortRows(filtered, state.sort);
}
