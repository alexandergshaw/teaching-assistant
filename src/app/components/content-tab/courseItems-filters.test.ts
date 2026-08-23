// Real unit tests for the pure facet-filtering leaf extracted out of
// CourseItemsView.tsx: unlike courseItemsView.wiring.test.ts, which can only
// regex-match source text because vitest here never renders a component,
// this file calls the filtering functions directly.
import { describe, it, expect } from "vitest";
import {
  DEFAULT_COURSE_ITEM_FILTERS,
  matchesCourseItemFilters,
  filterCourseItems,
  hiddenUnknownModuleCount,
  isFiltersActive,
  courseItemFiltersStorageKey,
  serializeCourseItemFilters,
  parseCourseItemFilters,
  type CourseItemFilters,
  type CourseItemFilterRow,
} from "./courseItems-filters";
import type { BulkItem } from "@/lib/canvas-modules";
import type { ItemModuleInfo } from "./courseItems-modules";

function item(overrides: Partial<BulkItem> & Pick<BulkItem, "id">): BulkItem {
  return {
    title: "Item",
    published: true,
    dueAt: null,
    pointsPossible: null,
    ...overrides,
  };
}

const KNOWN_IN_MODULE: ItemModuleInfo = { known: true, names: ["Week 1"] };
const KNOWN_NO_MODULE: ItemModuleInfo = { known: true, names: [] };
const UNKNOWN: ItemModuleInfo = { known: false };

describe("matchesCourseItemFilters - published facet", () => {
  it("'all' admits both published and unpublished rows", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, published: "all" as const };
    expect(matchesCourseItemFilters(item({ id: "1", published: true }), KNOWN_IN_MODULE, filters)).toBe(true);
    expect(matchesCourseItemFilters(item({ id: "2", published: false }), KNOWN_IN_MODULE, filters)).toBe(true);
  });

  it("'published' excludes unpublished rows and admits published ones", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, published: "published" as const };
    expect(matchesCourseItemFilters(item({ id: "1", published: true }), KNOWN_IN_MODULE, filters)).toBe(true);
    expect(matchesCourseItemFilters(item({ id: "2", published: false }), KNOWN_IN_MODULE, filters)).toBe(false);
  });

  it("'unpublished' excludes published rows and admits unpublished ones", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, published: "unpublished" as const };
    expect(matchesCourseItemFilters(item({ id: "1", published: true }), KNOWN_IN_MODULE, filters)).toBe(false);
    expect(matchesCourseItemFilters(item({ id: "2", published: false }), KNOWN_IN_MODULE, filters)).toBe(true);
  });
});

describe("matchesCourseItemFilters - module facet (F2: the honest three-state split)", () => {
  it("'in-module' admits only known rows with at least one module name", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, module: "in-module" as const };
    expect(matchesCourseItemFilters(item({ id: "1" }), KNOWN_IN_MODULE, filters)).toBe(true);
    expect(matchesCourseItemFilters(item({ id: "2" }), KNOWN_NO_MODULE, filters)).toBe(false);
  });

  it("'no-module' admits only known rows with zero module names", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, module: "no-module" as const };
    expect(matchesCourseItemFilters(item({ id: "1" }), KNOWN_NO_MODULE, filters)).toBe(true);
    expect(matchesCourseItemFilters(item({ id: "2" }), KNOWN_IN_MODULE, filters)).toBe(false);
  });

  it("F2: a row whose module state is UNKNOWN is excluded by 'no-module' - it must never be silently counted as unassociated", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, module: "no-module" as const };
    expect(matchesCourseItemFilters(item({ id: "1" }), UNKNOWN, filters)).toBe(false);
  });

  it("F2: the same unknown row is ALSO excluded by 'in-module' - unknown is not silently guessed the other way either", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, module: "in-module" as const };
    expect(matchesCourseItemFilters(item({ id: "1" }), UNKNOWN, filters)).toBe(false);
  });

  it("'all' admits an unknown row (the facet only excludes it when actively narrowed)", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, module: "all" as const };
    expect(matchesCourseItemFilters(item({ id: "1" }), UNKNOWN, filters)).toBe(true);
  });
});

describe("matchesCourseItemFilters - due date facet", () => {
  it("'has-due' admits only rows with a non-null dueAt", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, dueDate: "has-due" as const };
    expect(matchesCourseItemFilters(item({ id: "1", dueAt: "2026-01-01T00:00:00Z" }), KNOWN_IN_MODULE, filters)).toBe(true);
    expect(matchesCourseItemFilters(item({ id: "2", dueAt: null }), KNOWN_IN_MODULE, filters)).toBe(false);
  });

  it("'no-due' admits only rows with a null dueAt", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, dueDate: "no-due" as const };
    expect(matchesCourseItemFilters(item({ id: "1", dueAt: null }), KNOWN_IN_MODULE, filters)).toBe(true);
    expect(matchesCourseItemFilters(item({ id: "2", dueAt: "2026-01-01T00:00:00Z" }), KNOWN_IN_MODULE, filters)).toBe(false);
  });
});

describe("matchesCourseItemFilters - points facet", () => {
  it("'has-points' admits only rows with a non-null pointsPossible (including zero)", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, points: "has-points" as const };
    expect(matchesCourseItemFilters(item({ id: "1", pointsPossible: 10 }), KNOWN_IN_MODULE, filters)).toBe(true);
    expect(matchesCourseItemFilters(item({ id: "2", pointsPossible: 0 }), KNOWN_IN_MODULE, filters)).toBe(true);
    expect(matchesCourseItemFilters(item({ id: "3", pointsPossible: null }), KNOWN_IN_MODULE, filters)).toBe(false);
  });

  it("'no-points' admits only rows with a null pointsPossible", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, points: "no-points" as const };
    expect(matchesCourseItemFilters(item({ id: "1", pointsPossible: null }), KNOWN_IN_MODULE, filters)).toBe(true);
    expect(matchesCourseItemFilters(item({ id: "2", pointsPossible: 10 }), KNOWN_IN_MODULE, filters)).toBe(false);
  });
});

describe("matchesCourseItemFilters - quiz kind facet (Quizzes tab only)", () => {
  it("'classic' admits only rows without isNewQuiz", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, quizKind: "classic" as const };
    expect(matchesCourseItemFilters(item({ id: "1", isNewQuiz: true }), KNOWN_IN_MODULE, filters)).toBe(false);
    expect(matchesCourseItemFilters(item({ id: "2" }), KNOWN_IN_MODULE, filters)).toBe(true);
  });

  it("'new-quiz' admits only rows with isNewQuiz true", () => {
    const filters = { ...DEFAULT_COURSE_ITEM_FILTERS, quizKind: "new-quiz" as const };
    expect(matchesCourseItemFilters(item({ id: "1", isNewQuiz: true }), KNOWN_IN_MODULE, filters)).toBe(true);
    expect(matchesCourseItemFilters(item({ id: "2" }), KNOWN_IN_MODULE, filters)).toBe(false);
  });
});

describe("F1: facets combine with each other AND with the title search", () => {
  const rows: CourseItemFilterRow[] = [
    { item: item({ id: "1", title: "Essay One", published: true, dueAt: "2026-01-01T00:00:00Z", pointsPossible: 10 }), moduleInfo: KNOWN_NO_MODULE },
    { item: item({ id: "2", title: "Essay Two", published: false, dueAt: null, pointsPossible: null }), moduleInfo: KNOWN_IN_MODULE },
    { item: item({ id: "3", title: "Quiz Three", published: true, dueAt: null, pointsPossible: null }), moduleInfo: UNKNOWN },
  ];

  it("with every facet at 'all', only the title search narrows the result", () => {
    const shown = filterCourseItems(rows, DEFAULT_COURSE_ITEM_FILTERS, "essay");
    expect(shown.map((it) => it.id)).toEqual(["1", "2"]);
  });

  it("published AND no-module together narrow to the single row matching BOTH, not either alone", () => {
    const filters: CourseItemFilters = { ...DEFAULT_COURSE_ITEM_FILTERS, published: "published", module: "no-module" };
    const shown = filterCourseItems(rows, filters, "");
    expect(shown.map((it) => it.id)).toEqual(["1"]);
  });

  it("a facet combines with the title search, not replacing it", () => {
    const filters: CourseItemFilters = { ...DEFAULT_COURSE_ITEM_FILTERS, published: "unpublished" };
    // Row 2 is the only unpublished row, but the search excludes it.
    const shown = filterCourseItems(rows, filters, "quiz");
    expect(shown).toEqual([]);
  });
});

describe("isFiltersActive", () => {
  it("is false for the plain defaults", () => {
    expect(isFiltersActive(DEFAULT_COURSE_ITEM_FILTERS)).toBe(false);
  });

  it("is true when exactly one facet has been narrowed", () => {
    expect(isFiltersActive({ ...DEFAULT_COURSE_ITEM_FILTERS, points: "has-points" })).toBe(true);
  });
});

describe("hiddenUnknownModuleCount (F2/F4: honest about what the module facet hides)", () => {
  const rows: CourseItemFilterRow[] = [
    { item: item({ id: "1" }), moduleInfo: KNOWN_IN_MODULE },
    { item: item({ id: "2" }), moduleInfo: UNKNOWN },
    { item: item({ id: "3" }), moduleInfo: UNKNOWN },
  ];

  it("is 0 while the module facet is 'all' - nothing is excluded by it in that state", () => {
    expect(hiddenUnknownModuleCount(rows, DEFAULT_COURSE_ITEM_FILTERS)).toBe(0);
  });

  it("counts every unknown row once the facet is narrowed to 'no-module'", () => {
    expect(hiddenUnknownModuleCount(rows, { ...DEFAULT_COURSE_ITEM_FILTERS, module: "no-module" })).toBe(2);
  });

  it("counts the same unknown rows when narrowed to 'in-module' instead", () => {
    expect(hiddenUnknownModuleCount(rows, { ...DEFAULT_COURSE_ITEM_FILTERS, module: "in-module" })).toBe(2);
  });
});

describe("persistence (F5): one ta- key per kind, field-by-field validated on read", () => {
  it("builds a kind-scoped key", () => {
    expect(courseItemFiltersStorageKey("assignment")).toBe("ta-course-items-filters-assignment");
    expect(courseItemFiltersStorageKey("quiz")).toBe("ta-course-items-filters-quiz");
  });

  it("round-trips a full filters object through serialize/parse", () => {
    const filters: CourseItemFilters = {
      published: "published",
      module: "no-module",
      dueDate: "has-due",
      points: "no-points",
      quizKind: "new-quiz",
    };
    expect(parseCourseItemFilters(serializeCourseItemFilters(filters))).toEqual(filters);
  });

  it("null (nothing stored yet) returns the plain defaults", () => {
    expect(parseCourseItemFilters(null)).toEqual(DEFAULT_COURSE_ITEM_FILTERS);
  });

  it("malformed JSON falls back to the plain defaults instead of throwing", () => {
    expect(parseCourseItemFilters("{not json")).toEqual(DEFAULT_COURSE_ITEM_FILTERS);
  });

  it("a non-object JSON value (e.g. a bare string or array) falls back to the plain defaults", () => {
    expect(parseCourseItemFilters('"oops"')).toEqual(DEFAULT_COURSE_ITEM_FILTERS);
    expect(parseCourseItemFilters("[1,2,3]")).toEqual(DEFAULT_COURSE_ITEM_FILTERS);
  });

  it("an invalid value on ONE field falls back to 'all' for that field only, keeping the other valid fields", () => {
    const raw = JSON.stringify({ published: "bogus", module: "no-module", dueDate: "has-due", points: "no-points", quizKind: "classic" });
    expect(parseCourseItemFilters(raw)).toEqual({
      published: "all",
      module: "no-module",
      dueDate: "has-due",
      points: "no-points",
      quizKind: "classic",
    });
  });

  it("a partially-written blob (missing keys) fills in 'all' for whatever is missing", () => {
    const raw = JSON.stringify({ module: "in-module" });
    expect(parseCourseItemFilters(raw)).toEqual({ ...DEFAULT_COURSE_ITEM_FILTERS, module: "in-module" });
  });
});
