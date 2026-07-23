import { describe, it, expect } from "vitest";
import {
  DEFAULT_SORT,
  parseSortState,
  compareCourses,
  sortCourses,
  ALL_COLUMN_IDS,
  DEFAULT_VISIBLE_COLUMNS,
  parseColumnSet,
  serializeColumnSet,
  COLUMN_MIN_WIDTHS,
  deriveCourseCounts,
  computeFieldPatch,
  canLms,
  canImport,
  latestExportFile,
  type SortState,
} from "./courses-table-helpers";
import type { Course } from "./supabase/courses";

function makeCourse(overrides: Partial<Course>): Course {
  return {
    id: "c1",
    name: "Course",
    courseCode: null,
    term: null,
    canvasUrl: null,
    repos: [],
    githubOrg: null,
    textbook: null,
    syllabusId: null,
    institution: null,
    integrations: [],
    roster: null,
    notes: null,
    topics: null,
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: null,
    description: null,
    weeks: null,
    tests: null,
    lms: null,
    dayTime: null,
    materialsFiles: [],
    exportFiles: [],
    materialsZipName: null,
    materialsZipPath: null,
    materialsZipSize: null,
    customTiles: [],
    hiddenTiles: [],
    studentRepos: [],
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseSortState", () => {
  it("returns the default for null/undefined", () => {
    expect(parseSortState(null)).toEqual(DEFAULT_SORT);
    expect(parseSortState(undefined)).toEqual(DEFAULT_SORT);
  });

  it("returns the default for malformed JSON", () => {
    expect(parseSortState("{not json")).toEqual(DEFAULT_SORT);
  });

  it("returns the default for an unknown field or direction", () => {
    expect(parseSortState(JSON.stringify({ field: "bogus", direction: "asc" }))).toEqual(DEFAULT_SORT);
    expect(parseSortState(JSON.stringify({ field: "name", direction: "sideways" }))).toEqual(DEFAULT_SORT);
  });

  it("round-trips a valid sort state", () => {
    const state: SortState = { field: "startDate", direction: "desc" };
    expect(parseSortState(JSON.stringify(state))).toEqual(state);
  });
});

describe("compareCourses / sortCourses", () => {
  it("sorts by name ascending and descending", () => {
    const a = makeCourse({ id: "a", name: "Beta" });
    const b = makeCourse({ id: "b", name: "Alpha" });
    expect(sortCourses([a, b], { field: "name", direction: "asc" }).map((c) => c.id)).toEqual(["b", "a"]);
    expect(sortCourses([a, b], { field: "name", direction: "desc" }).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("sorts by startDate with empty dates always last, regardless of direction", () => {
    const withDate1 = makeCourse({ id: "d1", startDate: "2024-09-01" });
    const withDate2 = makeCourse({ id: "d2", startDate: "2024-01-01" });
    const noDate = makeCourse({ id: "nd", startDate: null });
    const asc = sortCourses([withDate1, noDate, withDate2], { field: "startDate", direction: "asc" });
    expect(asc.map((c) => c.id)).toEqual(["d2", "d1", "nd"]);
    const desc = sortCourses([withDate1, noDate, withDate2], { field: "startDate", direction: "desc" });
    expect(desc.map((c) => c.id)).toEqual(["d1", "d2", "nd"]);
  });

  it("treats two empty start dates as equal (stable, no crash)", () => {
    const a = makeCourse({ id: "a", startDate: null });
    const b = makeCourse({ id: "b", startDate: "" as unknown as null });
    expect(compareCourses(a, b, { field: "startDate", direction: "asc" })).toBe(0);
  });

  it("does not mutate the input array", () => {
    const list = [makeCourse({ id: "b", name: "Beta" }), makeCourse({ id: "a", name: "Alpha" })];
    const original = [...list];
    sortCourses(list, { field: "name", direction: "asc" });
    expect(list).toEqual(original);
  });
});

describe("parseColumnSet / serializeColumnSet", () => {
  it("returns every column visible for null/undefined", () => {
    expect(parseColumnSet(null)).toEqual(DEFAULT_VISIBLE_COLUMNS);
    expect(parseColumnSet(undefined)).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });

  it("returns every column visible for malformed JSON or a non-array", () => {
    expect(parseColumnSet("{not json")).toEqual(DEFAULT_VISIBLE_COLUMNS);
    expect(parseColumnSet(JSON.stringify({ institution: true }))).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });

  it("drops unknown ids and de-duplicates", () => {
    expect(parseColumnSet(JSON.stringify(["institution", "bogus", "institution", "weeks"]))).toEqual([
      "institution",
      "weeks",
    ]);
  });

  it("preserves an empty selection (every optional column hidden)", () => {
    expect(parseColumnSet(JSON.stringify([]))).toEqual([]);
  });

  it("ignores name/actions if present since they are not toggleable columns", () => {
    expect(parseColumnSet(JSON.stringify(["name", "actions", "lms"]))).toEqual(["lms"]);
  });

  it("round-trips through serializeColumnSet", () => {
    const cols: typeof ALL_COLUMN_IDS[number][] = ["lms", "textbook"];
    expect(parseColumnSet(serializeColumnSet(cols))).toEqual(cols);
  });
});

describe("COLUMN_MIN_WIDTHS", () => {
  it("has a positive-integer entry for every column id plus name/actions, and no extra keys", () => {
    const expectedKeys = [...ALL_COLUMN_IDS, "name", "actions"].sort();
    const actualKeys = Object.keys(COLUMN_MIN_WIDTHS).sort();
    expect(actualKeys).toEqual(expectedKeys);
    for (const key of actualKeys) {
      const width = COLUMN_MIN_WIDTHS[key as keyof typeof COLUMN_MIN_WIDTHS];
      expect(Number.isInteger(width)).toBe(true);
      expect(width).toBeGreaterThan(0);
    }
  });
});

describe("deriveCourseCounts", () => {
  it("counts roster lines, student repos, and repos", () => {
    const c = makeCourse({
      roster: "Alice | agh\nBob\n\nCharlie | cgh",
      studentRepos: [
        { student: "Alice", canvasUserId: "1", repo: "a/a" },
        { student: "Bob", canvasUserId: null, repo: "b/b" },
      ],
      repos: [{ repo: "org/one", branch: null }, { repo: "org/two", branch: "main" }],
    });
    expect(deriveCourseCounts(c)).toEqual({ rosterCount: 3, studentRepoCount: 2, reposCount: 2 });
  });

  it("handles empty/null fields", () => {
    const c = makeCourse({ roster: null, studentRepos: [], repos: [] });
    expect(deriveCourseCounts(c)).toEqual({ rosterCount: 0, studentRepoCount: 0, reposCount: 0 });
  });
});

describe("computeFieldPatch", () => {
  it("parses repos lines", () => {
    expect(computeFieldPatch("repos", "org/a\norg/b#dev")).toEqual({
      repos: [
        { repo: "org/a", branch: null },
        { repo: "org/b", branch: "dev" },
      ],
    });
  });

  it("parses integrations lines", () => {
    expect(computeFieldPatch("integrations", "Cengage | https://cengage.test\nDiscord")).toEqual({
      integrations: [
        { name: "Cengage", url: "https://cengage.test" },
        { name: "Discord", url: null },
      ],
    });
  });

  it("parses weeks/tests as numbers, blank/invalid as null", () => {
    expect(computeFieldPatch("weeks", "15")).toEqual({ weeks: 15 });
    expect(computeFieldPatch("weeks", "")).toEqual({ weeks: null });
    expect(computeFieldPatch("weeks", "abc")).toEqual({ weeks: null });
    expect(computeFieldPatch("tests", "3")).toEqual({ tests: 3 });
  });

  it("maps lms to null when blank", () => {
    expect(computeFieldPatch("lms", "canvas")).toEqual({ lms: "canvas" });
    expect(computeFieldPatch("lms", "")).toEqual({ lms: null });
  });

  it("parses studentRepos rows", () => {
    expect(computeFieldPatch("studentRepos", "Alice | 1001 | alice-repo")).toEqual({
      studentRepos: [{ student: "Alice", canvasUserId: "1001", repo: "alice-repo" }],
    });
  });

  it("passes through plain text fields (including the new name/institution cells)", () => {
    expect(computeFieldPatch("name", "New name")).toEqual({ name: "New name" });
    expect(computeFieldPatch("institution", "MCC")).toEqual({ institution: "MCC" });
    expect(computeFieldPatch("textbook", "ISBN 123")).toEqual({ textbook: "ISBN 123" });
    expect(computeFieldPatch("githubOrg", "my-org")).toEqual({ githubOrg: "my-org" });
    expect(computeFieldPatch("syllabusId", "syl-1")).toEqual({ syllabusId: "syl-1" });
    expect(computeFieldPatch("startDate", "2024-09-01")).toEqual({ startDate: "2024-09-01" });
    expect(computeFieldPatch("description", "About the course")).toEqual({ description: "About the course" });
    expect(computeFieldPatch("dayTime", "MW 10-11")).toEqual({ dayTime: "MW 10-11" });
  });
});

describe("canLms / canImport / latestExportFile", () => {
  it("canLms requires both a Canvas URL and an institution", () => {
    expect(canLms(makeCourse({ canvasUrl: "https://x/courses/1", institution: "MCC" }))).toBe(true);
    expect(canLms(makeCourse({ canvasUrl: "https://x/courses/1", institution: null }))).toBe(false);
    expect(canLms(makeCourse({ canvasUrl: null, institution: "MCC" }))).toBe(false);
    expect(canLms(makeCourse({ canvasUrl: "  ", institution: "  " }))).toBe(false);
  });

  it("canImport is true only when canLms is false and an export exists", () => {
    const withExport = makeCourse({
      canvasUrl: null,
      institution: null,
      exportFiles: [{ name: "a.imscc", path: "p/a", size: 10, addedAt: "2024-01-01T00:00:00.000Z" }],
    });
    expect(canImport(withExport)).toBe(true);
    expect(canImport(makeCourse({ canvasUrl: "https://x/courses/1", institution: "MCC", exportFiles: withExport.exportFiles }))).toBe(false);
    expect(canImport(makeCourse({ canvasUrl: null, institution: null, exportFiles: [] }))).toBe(false);
  });

  it("latestExportFile returns the newest by addedAt, or null when there are none", () => {
    expect(latestExportFile(makeCourse({ exportFiles: [] }))).toBeNull();
    const older = { name: "old.imscc", path: "p/old", size: 1, addedAt: "2024-01-01T00:00:00.000Z" };
    const newer = { name: "new.imscc", path: "p/new", size: 1, addedAt: "2024-06-01T00:00:00.000Z" };
    expect(latestExportFile(makeCourse({ exportFiles: [older, newer] }))?.path).toBe("p/new");
  });
});
