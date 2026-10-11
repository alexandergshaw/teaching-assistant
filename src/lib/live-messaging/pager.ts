/**
 * Pure pager logic for the "Showing N rows" pager (LIVE-LMS-STUDENT-MESSAGING
 * W3). Pages are zero-based. No React, no storage.
 */

export const DEFAULT_PAGE_SIZE = 25;

/** Coerces a page size to a positive integer, falling back to the default. */
export function normalizePageSize(size: unknown): number {
  return typeof size === "number" && Number.isFinite(size) && size >= 1 ? Math.floor(size) : DEFAULT_PAGE_SIZE;
}

/** Number of pages for a row total; an empty table still has one (empty) page. */
export function pageCount(total: number, pageSize: number): number {
  const size = normalizePageSize(pageSize);
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

/** Clamps a page index into [0, pageCount-1]. Use it whenever the filtered
 * total or page size changes so the view never points past the end. */
export function clampPage(page: number, total: number, pageSize: number): number {
  const last = pageCount(total, pageSize) - 1;
  if (!Number.isFinite(page)) return 0;
  return Math.min(Math.max(0, Math.floor(page)), last);
}

export interface PageView<T> {
  readonly items: T[];
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
}

/** The slice for a (clamped) page plus navigation flags. */
export function paginate<T>(rows: readonly T[], page: number, pageSize: number): PageView<T> {
  const size = normalizePageSize(pageSize);
  const total = rows.length;
  const clamped = clampPage(page, total, size);
  const count = pageCount(total, size);
  return {
    items: rows.slice(clamped * size, clamped * size + size),
    page: clamped,
    pageCount: count,
    total,
    hasPrevious: clamped > 0,
    hasNext: clamped < count - 1,
  };
}

/** "Showing 1 row" / "Showing 12 rows". */
export function showingLabel(total: number): string {
  const n = Math.max(0, Math.floor(total));
  return `Showing ${n} ${n === 1 ? "row" : "rows"}`;
}
