import { describe, it, expect } from "vitest";
import type { EnrollmentRow } from "./enrollment-aggregator";
import {
  applyColumnFilters,
  applyTableView,
  columnOptions,
  filterToken,
  isColumnFilterActive,
  normalizeColumnFilters,
  searchRows,
  sortRows,
} from "./table-filter-model";

function row(over: Partial<EnrollmentRow> & { userId: string }): EnrollmentRow {
  const name = over.name ?? `Student ${over.userId}`;
  return {
    key: `i:${over.courseId ?? "1"}:${over.sectionId ?? ""}:${over.userId}`,
    institution: "i",
    courseId: "1",
    course: "CS 101",
    term: "Fall 2026",
    sectionId: "s1",
    section: "Sec A",
    name,
    firstName: "S",
    lastName: name,
    grade: 80,
    missingCount: 0,
    ...over,
  };
}

const ROWS: EnrollmentRow[] = [
  row({ userId: "1", name: "Ada", lastName: "Ada", course: "CS 101", section: "Sec A", term: "Fall 2026", missingCount: 2, grade: 90 }),
  row({ userId: "2", name: "Bob", lastName: "Bob", course: "CS 101", section: "Sec B", term: "Fall 2026", missingCount: 0, grade: null }),
  row({ userId: "3", name: "Cy", lastName: "Cy", course: "CS 202", section: "", term: null, missingCount: null, grade: 70 }),
  row({ userId: "4", name: "Di", lastName: "Di", course: "CS 202", section: "Sec A", term: "Spring 2027", missingCount: 2, grade: 85 }),
];

const ids = (rs: readonly EnrollmentRow[]): string[] => rs.map((r) => r.userId);

describe("filter tokens and options", () => {
  it("maps blanks to the empty token", () => {
    expect(filterToken(ROWS[2], "term")).toBe("");
    expect(filterToken(ROWS[2], "missing")).toBe("");
    expect(filterToken(ROWS[0], "missing")).toBe("2");
  });
  it("lists distinct options, missing numerically with blank last", () => {
    expect(columnOptions(ROWS, "missing")).toEqual(["0", "2", ""]);
    expect(columnOptions(ROWS, "course")).toEqual(["CS 101", "CS 202"]);
  });
});

describe("applyColumnFilters", () => {
  it("keeps only selected tokens and never leaks a filtered-out row", () => {
    expect(ids(applyColumnFilters(ROWS, { course: ["CS 202"] }))).toEqual(["3", "4"]);
    expect(ids(applyColumnFilters(ROWS, { section: ["Sec A"] }))).toEqual(["1", "4"]);
  });
  it("ANDs columns together", () => {
    expect(ids(applyColumnFilters(ROWS, { course: ["CS 202"], section: ["Sec A"] }))).toEqual(["4"]);
  });
  it("filters the blank bucket", () => {
    expect(ids(applyColumnFilters(ROWS, { term: [""] }))).toEqual(["3"]);
    expect(ids(applyColumnFilters(ROWS, { missing: ["2"] }))).toEqual(["1", "4"]);
  });
  it("treats empty and all-selected as no constraint", () => {
    expect(ids(applyColumnFilters(ROWS, { course: [] }))).toEqual(["1", "2", "3", "4"]);
    expect(ids(applyColumnFilters(ROWS, { course: ["CS 101", "CS 202"] }))).toEqual(["1", "2", "3", "4"]);
    expect(isColumnFilterActive([], ["a"])).toBe(false);
    expect(isColumnFilterActive(["a"], ["a", "b"])).toBe(true);
  });
  it("does not mutate its input", () => {
    const copy = [...ROWS];
    applyColumnFilters(ROWS, { course: ["CS 101"] });
    expect(ROWS).toEqual(copy);
  });
});

describe("normalizeColumnFilters", () => {
  it("drops junk and keeps well-formed entries, sorted and de-duplicated", () => {
    const out = normalizeColumnFilters({
      course: ["b", "a", "a", 3, null],
      bogus: ["x"],
      section: "notarray",
      term: [],
    });
    expect(out).toEqual({ course: ["a", "b"] });
  });
  it("returns {} for non-objects and survives a __proto__ key", () => {
    expect(normalizeColumnFilters(null)).toEqual({});
    expect(normalizeColumnFilters([1])).toEqual({});
    expect(normalizeColumnFilters("x")).toEqual({});
    const parsed: unknown = JSON.parse('{"__proto__":["x"],"term":["T"]}');
    expect(normalizeColumnFilters(parsed)).toEqual({ term: ["T"] });
  });
});

describe("searchRows", () => {
  it("matches name or course, case-insensitively; blank returns all", () => {
    expect(ids(searchRows(ROWS, "ada"))).toEqual(["1"]);
    expect(ids(searchRows(ROWS, " cs 202 "))).toEqual(["3", "4"]);
    expect(ids(searchRows(ROWS, "  "))).toEqual(["1", "2", "3", "4"]);
    expect(ids(searchRows(ROWS, "zzz"))).toEqual([]);
  });
});

describe("sortRows", () => {
  it("sorts by name ascending and descending", () => {
    expect(ids(sortRows(ROWS, { key: "name", direction: "desc" }))).toEqual(["4", "3", "2", "1"]);
  });
  it("is stable on ties", () => {
    expect(ids(sortRows(ROWS, { key: "missing", direction: "asc" }))).toEqual(["2", "1", "4", "3"]);
    expect(ids(sortRows(ROWS, { key: "course", direction: "asc" }))).toEqual(["1", "2", "3", "4"]);
  });
  it("keeps null values last in both directions", () => {
    expect(ids(sortRows(ROWS, { key: "grade", direction: "asc" }))).toEqual(["3", "4", "1", "2"]);
    expect(ids(sortRows(ROWS, { key: "grade", direction: "desc" }))).toEqual(["1", "4", "3", "2"]);
  });
  it("returns a copy without sort and does not mutate", () => {
    const copy = [...ROWS];
    expect(ids(sortRows(ROWS, null))).toEqual(["1", "2", "3", "4"]);
    sortRows(ROWS, { key: "name", direction: "desc" });
    expect(ROWS).toEqual(copy);
  });
});

describe("applyTableView composition", () => {
  it("searches, then filters, then sorts", () => {
    const out = applyTableView(ROWS, {
      search: "cs 1",
      filters: { missing: ["0", "2"] },
      sort: { key: "missing", direction: "desc" },
    });
    expect(ids(out)).toEqual(["1", "2"]);
    expect(ids(applyTableView(ROWS, {}))).toEqual(["1", "2", "3", "4"]);
  });
});
