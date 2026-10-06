import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Course } from "./supabase/courses";
import { makeCourse } from "./courses-table-helpers.fixtures";
import type { SortContext } from "./courses-table-helpers";
import { filterCoursesBySearch, parseSearchColumn } from "./courses-table-search";

function fixtures(): Course[] {
  return [
    makeCourse({
      id: "a",
      name: "Algebra I",
      courseCode: "MATH101",
      term: "Fall 2026",
      repos: [{ repo: "org/alg-notes", branch: null }],
      notes: "needs syllabus review",
      description: "intro",
      dayTime: "MWF 9am",
    }),
    makeCourse({
      id: "b",
      name: "Biology",
      term: "Spring 2027",
      institution: "State University",
      description: "covers algebra basics",
      integrations: [{ name: "Cengage", url: null }],
      dayTime: "TR 2pm",
    }),
    makeCourse({
      id: "c",
      name: "Chemistry",
      topics: "stoichiometry",
      textbook: "Zumdahl",
      syllabusId: "syl-1",
      dayTime: "MWF 9am",
    }),
  ];
}

const ids = (cs: Course[]): string[] => cs.map((c) => c.id);

// FROZEN LITERAL oracle: expected ids for the legacy global filter, written by
// hand from the fixtures above. Not computed by any production code.
const ALL_ORACLE: Array<[string, string[]]> = [
  ["", ["a", "b", "c"]],
  ["   ", ["a", "b", "c"]],
  ["algebra", ["a"]], // b's "algebra" is in description, which is NOT a legacy field
  ["  ALGEBRA ", ["a"]],
  ["fall", ["a"]], // term: a legacy field that is not a column
  ["math101", ["a"]], // courseCode: same
  ["alg-notes", ["a"]], // repos[].repo
  ["review", ["a"]], // notes
  ["cengage", ["b"]], // integrations[].name
  ["state university", ["b"]], // institution
  ["stoich", ["c"]], // topics
  ["zumdahl", ["c"]], // textbook
  ["mwf", []], // dayTime is a column but NOT a legacy field
  ["intro", []], // description: same
];

describe("filterCoursesBySearch - all columns is the legacy global filter", () => {
  for (const [query, expected] of ALL_ORACLE) {
    it(`all / ${JSON.stringify(query)} -> ${JSON.stringify(expected)}`, () => {
      expect(ids(filterCoursesBySearch(fixtures(), query, "all"))).toEqual(expected);
    });
  }
});

describe("filterCoursesBySearch - a chosen column", () => {
  it("matches only that column's text (a term hit does not surface under name)", () => {
    expect(ids(filterCoursesBySearch(fixtures(), "fall", "name"))).toEqual([]);
    expect(ids(filterCoursesBySearch(fixtures(), "bio", "name"))).toEqual(["b"]);
  });

  it("description column finds b but not a (whose NAME carries the token)", () => {
    expect(ids(filterCoursesBySearch(fixtures(), "algebra", "description"))).toEqual(["b"]);
  });

  it("reaches a column the legacy filter omits", () => {
    expect(ids(filterCoursesBySearch(fixtures(), "mwf", "dayTime"))).toEqual(["a", "c"]);
  });

  it("blank query returns the input array unchanged for any column", () => {
    const input = fixtures();
    expect(filterCoursesBySearch(input, "  ", "dayTime")).toBe(input);
    expect(filterCoursesBySearch(input, "", "all")).toBe(input);
  });

  it("resolves syllabusId to its display name through ctx, else the raw id", () => {
    const ctx: SortContext = {
      syllabusNameById: new Map([["syl-1", "Spring Syllabus"]]),
      syllabusTemplateNameById: new Map(),
    };
    expect(ids(filterCoursesBySearch(fixtures(), "spring syl", "syllabusId", ctx))).toEqual(["c"]);
    expect(ids(filterCoursesBySearch(fixtures(), "syl-1", "syllabusId"))).toEqual(["c"]);
  });
});

describe("parseSearchColumn", () => {
  const visible = ["description", "dayTime"] as const;
  it("falls back to all for empty, unknown or hidden values", () => {
    expect(parseSearchColumn(null, visible)).toBe("all");
    expect(parseSearchColumn("", visible)).toBe("all");
    expect(parseSearchColumn("bogus", visible)).toBe("all");
    expect(parseSearchColumn("roster", visible)).toBe("all");
  });
  it("keeps all, name and a visible column", () => {
    expect(parseSearchColumn("all", visible)).toBe("all");
    expect(parseSearchColumn("name", visible)).toBe("name");
    expect(parseSearchColumn("dayTime", visible)).toBe("dayTime");
  });
});

describe("wiring (source text)", () => {
  const tab = readFileSync(join(__dirname, "../app/components/CoursesTab.tsx"), "utf8");
  const table = readFileSync(join(__dirname, "../app/components/courses/CoursesTable.tsx"), "utf8");
  it("CoursesTab persists under ta-courses-search-column, validates on read, and calls the filter", () => {
    expect(tab).toContain('"ta-courses-search-column"');
    expect(tab).toContain("parseSearchColumn(");
    expect(tab).toContain("filterCoursesBySearch(courses, search, searchColumn, sortCtx)");
    expect(tab).toContain("localStorage.setItem(SEARCH_COLUMN_KEY");
  });
  it("CoursesTable renders the selector and hints on a heavy column before heavyReady", () => {
    expect(table).toContain("onSearchColumnChange(");
    expect(table).toContain('aria-label="Search in"');
    expect(table).toContain("heavyReadReady(heavyReady, searchColumn)");
  });
});
