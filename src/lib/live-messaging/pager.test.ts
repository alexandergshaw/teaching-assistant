import { describe, it, expect } from "vitest";
import { clampPage, DEFAULT_PAGE_SIZE, normalizePageSize, pageCount, paginate, showingLabel } from "./pager";

const nums = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe("pager", () => {
  it("normalizes page size", () => {
    expect(normalizePageSize(10)).toBe(10);
    expect(normalizePageSize(10.9)).toBe(10);
    expect(normalizePageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageSize(NaN)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageSize("5")).toBe(DEFAULT_PAGE_SIZE);
  });
  it("counts pages, with at least one", () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
    expect(pageCount(11, 10)).toBe(2);
  });
  it("clamps past the end after a filter shrinks the total", () => {
    expect(clampPage(5, 11, 10)).toBe(1);
    expect(clampPage(-3, 11, 10)).toBe(0);
    expect(clampPage(2, 0, 10)).toBe(0);
    expect(clampPage(NaN, 11, 10)).toBe(0);
  });
  it("slices pages and reports navigation flags at the boundaries", () => {
    const first = paginate(nums(25), 0, 10);
    expect(first.items).toEqual(nums(10));
    expect(first.hasPrevious).toBe(false);
    expect(first.hasNext).toBe(true);
    const last = paginate(nums(25), 2, 10);
    expect(last.items).toEqual([20, 21, 22, 23, 24]);
    expect(last.hasPrevious).toBe(true);
    expect(last.hasNext).toBe(false);
    const exact = paginate(nums(20), 1, 10);
    expect(exact.items).toHaveLength(10);
    expect(exact.hasNext).toBe(false);
  });
  it("clamps an out-of-range page inside paginate and handles empty", () => {
    expect(paginate(nums(5), 9, 10).page).toBe(0);
    const empty = paginate([], 0, 10);
    expect(empty.items).toEqual([]);
    expect(empty.hasNext).toBe(false);
    expect(empty.hasPrevious).toBe(false);
  });
  it("labels the row count", () => {
    expect(showingLabel(1)).toBe("Showing 1 row");
    expect(showingLabel(12)).toBe("Showing 12 rows");
    expect(showingLabel(0)).toBe("Showing 0 rows");
  });
});
