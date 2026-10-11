/**
 * Persisted control state of the Success Tracking table (search box, column
 * funnels, sort, page size) under one ta- key, so a reload keeps them
 * (MEMORY: persist-ui-control-state). Untrusted storage is coerced, never
 * trusted. The page index is deliberately NOT persisted (it is clamped against
 * a live dataset). Selection is also NOT persisted (per-institution, in-memory).
 */

import { normalizePageSize } from "./pager";
import {
  SORT_KEYS,
  isColumnFilterActive,
  normalizeColumnFilters,
  type ColumnFilters,
  type FilterColumn,
  type SortDirection,
  type SortSpec,
} from "./table-filter-model";

export const TABLE_VIEW_KEY = "ta-live-messaging-table-view";

/** Owner-specified default for the "Showing N rows" pager. */
export const DEFAULT_TABLE_PAGE_SIZE = 200;
export const PAGE_SIZE_OPTIONS: readonly number[] = [25, 50, 100, 200];

export interface TableControlState {
  search: string;
  filters: ColumnFilters;
  sort: SortSpec | null;
  pageSize: number;
}

export const DEFAULT_TABLE_CONTROLS: TableControlState = {
  search: "",
  filters: {},
  sort: null,
  pageSize: DEFAULT_TABLE_PAGE_SIZE,
};

export function serializeTableControls(state: TableControlState): string {
  return JSON.stringify({
    v: 1,
    search: state.search,
    filters: state.filters,
    sort: state.sort,
    pageSize: state.pageSize,
  });
}

function parseSort(raw: unknown): SortSpec | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  const key = (SORT_KEYS as readonly string[]).find((k) => k === p.key);
  const direction: SortDirection | null = p.direction === "asc" || p.direction === "desc" ? p.direction : null;
  if (!key || !direction) return null;
  return { key: key as SortSpec["key"], direction };
}

/** Coerces whatever is in storage into valid controls; malformed -> defaults. */
export function parseTableControls(raw: string | null | undefined): TableControlState {
  if (!raw) return { ...DEFAULT_TABLE_CONTROLS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_TABLE_CONTROLS };
    const p = parsed as Record<string, unknown>;
    if (p.v !== 1) return { ...DEFAULT_TABLE_CONTROLS };
    return {
      search: typeof p.search === "string" ? p.search.slice(0, 200) : "",
      filters: normalizeColumnFilters(p.filters),
      sort: parseSort(p.sort),
      pageSize:
        typeof p.pageSize === "number" && p.pageSize >= 1
          ? normalizePageSize(p.pageSize)
          : DEFAULT_TABLE_PAGE_SIZE,
    };
  } catch {
    return { ...DEFAULT_TABLE_CONTROLS };
  }
}

/**
 * The next sort for a header click: none -> asc -> desc -> none on the same
 * key; a different key starts at asc.
 */
export function nextSort(current: SortSpec | null, key: SortSpec["key"]): SortSpec | null {
  if (!current || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return null;
}

/**
 * Toggles one token in a column funnel. An inactive funnel shows every option
 * as checked, so the first toggle starts from "all options"; a result that is
 * empty or selects every option collapses back to "no filter" (key removed).
 */
export function toggleFilterToken(
  filters: ColumnFilters,
  column: FilterColumn,
  token: string,
  options: readonly string[]
): ColumnFilters {
  const existing = filters[column];
  const current = isColumnFilterActive(existing, options) ? [...(existing ?? [])] : [...options];
  const next = current.includes(token) ? current.filter((t) => t !== token) : [...current, token];
  const out: ColumnFilters = { ...filters };
  if (!isColumnFilterActive(next, options)) delete out[column];
  else out[column] = [...new Set(next)].sort();
  return out;
}
