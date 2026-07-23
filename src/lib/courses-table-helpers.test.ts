import { describe, it, expect } from "vitest";
import {
  DEFAULT_SORT,
  SORT_FIELDS,
  parseSortState,
  compareCourses,
  sortCourses,
  sortValueFor,
  ALL_COLUMN_IDS,
  DEFAULT_VISIBLE_COLUMNS,
  parseColumnSet,
  serializeColumnSet,
  CURRENT_COLUMNS_VERSION,
  COLUMN_MIN_WIDTHS,
  deriveCourseCounts,
  truncateForCell,
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
    modality: null,
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

  it("accepts every sortable field (every ALL_COLUMN_IDS member plus name)", () => {
    for (const field of SORT_FIELDS) {
      const state: SortState = { field, direction: "asc" };
      expect(parseSortState(JSON.stringify(state))).toEqual(state);
    }
  });
});

describe("SORT_FIELDS completeness", () => {
  it("includes every ALL_COLUMN_IDS member plus name, and nothing else", () => {
    expect(SORT_FIELDS).toContain("name");
    for (const id of ALL_COLUMN_IDS) expect(SORT_FIELDS).toContain(id);
    expect(SORT_FIELDS.length).toBe(ALL_COLUMN_IDS.length + 1);
  });

  it("does not include actions - it is not a data column", () => {
    expect(SORT_FIELDS).not.toContain("actions");
  });
});

describe("sortValueFor", () => {
  it("returns the derived counts for repos/roster/studentRepos, never marked empty", () => {
    const c = makeCourse({
      repos: [{ repo: "org/one", branch: null }],
      roster: "Alice\nBob",
      studentRepos: [{ student: "Alice", canvasUserId: null, repo: "a/a" }],
    });
    expect(sortValueFor(c, "repos")).toEqual({ kind: "number", value: 1, empty: false });
    expect(sortValueFor(c, "roster")).toEqual({ kind: "number", value: 2, empty: false });
    expect(sortValueFor(c, "studentRepos")).toEqual({ kind: "number", value: 1, empty: false });

    const empty = makeCourse({ repos: [], roster: null, studentRepos: [] });
    expect(sortValueFor(empty, "repos")).toEqual({ kind: "number", value: 0, empty: false });
    expect(sortValueFor(empty, "roster")).toEqual({ kind: "number", value: 0, empty: false });
    expect(sortValueFor(empty, "studentRepos")).toEqual({ kind: "number", value: 0, empty: false });
  });

  it("counts integrations length", () => {
    const c = makeCourse({ integrations: [{ name: "Cengage", url: null }, { name: "Discord", url: null }] });
    expect(sortValueFor(c, "integrations")).toEqual({ kind: "number", value: 2, empty: false });
  });

  it("counts materials files plus the zip (if any), and exportFiles for lmsExports", () => {
    const c = makeCourse({
      materialsFiles: [{ name: "a.pdf", path: "p/a", size: 1, addedAt: "2024-01-01T00:00:00.000Z" }],
      materialsZipPath: "p/zip",
      exportFiles: [
        { name: "e1.imscc", path: "p/e1", size: 1, addedAt: "2024-01-01T00:00:00.000Z" },
        { name: "e2.imscc", path: "p/e2", size: 1, addedAt: "2024-01-02T00:00:00.000Z" },
      ],
    });
    expect(sortValueFor(c, "materials")).toEqual({ kind: "number", value: 2, empty: false });
    expect(sortValueFor(c, "lmsExports")).toEqual({ kind: "number", value: 2, empty: false });

    const noZip = makeCourse({ materialsFiles: [], materialsZipPath: null, exportFiles: [] });
    expect(sortValueFor(noZip, "materials")).toEqual({ kind: "number", value: 0, empty: false });
    expect(sortValueFor(noZip, "lmsExports")).toEqual({ kind: "number", value: 0, empty: false });
  });

  it("treats weeks/tests as empty-when-null numbers", () => {
    expect(sortValueFor(makeCourse({ weeks: 15 }), "weeks")).toEqual({ kind: "number", value: 15, empty: false });
    expect(sortValueFor(makeCourse({ weeks: null }), "weeks")).toEqual({ kind: "number", value: 0, empty: true });
    expect(sortValueFor(makeCourse({ tests: 0 }), "tests")).toEqual({ kind: "number", value: 0, empty: false });
    expect(sortValueFor(makeCourse({ tests: null }), "tests")).toEqual({ kind: "number", value: 0, empty: true });
  });

  it("treats modality as empty-when-unset text", () => {
    expect(sortValueFor(makeCourse({ modality: "async" }), "modality")).toEqual({ kind: "text", value: "async", empty: false });
    expect(sortValueFor(makeCourse({ modality: null }), "modality")).toEqual({ kind: "text", value: "", empty: true });
  });

  it("treats blank string fields as empty text", () => {
    expect(sortValueFor(makeCourse({ institution: "MCC" }), "institution")).toEqual({ kind: "text", value: "MCC", empty: false });
    expect(sortValueFor(makeCourse({ institution: null }), "institution")).toEqual({ kind: "text", value: "", empty: true });
    expect(sortValueFor(makeCourse({ institution: "  " }), "institution")).toEqual({ kind: "text", value: "", empty: true });
  });

  it("resolves syllabusId to its display name via ctx, falling back to the raw id when unmapped", () => {
    const c = makeCourse({ syllabusId: "syl-1" });
    const ctx = { syllabusNameById: new Map([["syl-1", "Intro to CS syllabus"]]) };
    expect(sortValueFor(c, "syllabusId", ctx)).toEqual({ kind: "text", value: "Intro to CS syllabus", empty: false });
    expect(sortValueFor(c, "syllabusId")).toEqual({ kind: "text", value: "syl-1", empty: false });
    expect(sortValueFor(makeCourse({ syllabusId: null }), "syllabusId")).toEqual({ kind: "text", value: "", empty: true });
  });

  it("uses raw content text for scheduleCsv/rubric, empty when unset", () => {
    expect(sortValueFor(makeCourse({ csvData: "week,topic\n1,Intro" }), "scheduleCsv")).toEqual({
      kind: "text",
      value: "week,topic\n1,Intro",
      empty: false,
    });
    expect(sortValueFor(makeCourse({ csvData: null }), "scheduleCsv")).toEqual({ kind: "text", value: "", empty: true });
    expect(sortValueFor(makeCourse({ rubricData: null }), "rubric")).toEqual({ kind: "text", value: "", empty: true });
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

  it("sorts a string column case-insensitively, with empty values always last in both directions", () => {
    const upper = makeCourse({ id: "u", institution: "ZETA" });
    const lower = makeCourse({ id: "l", institution: "alpha" });
    const blank = makeCourse({ id: "b", institution: null });
    const asc = sortCourses([upper, blank, lower], { field: "institution", direction: "asc" });
    expect(asc.map((c) => c.id)).toEqual(["l", "u", "b"]);
    const desc = sortCourses([upper, blank, lower], { field: "institution", direction: "desc" });
    expect(desc.map((c) => c.id)).toEqual(["u", "l", "b"]);
  });

  it("sorts weeks numerically with null always last in both directions", () => {
    const a = makeCourse({ id: "a", name: "A", weeks: 15 });
    const b = makeCourse({ id: "b", name: "B", weeks: 5 });
    const noWeeks = makeCourse({ id: "n", name: "N", weeks: null });
    const asc = sortCourses([a, noWeeks, b], { field: "weeks", direction: "asc" });
    expect(asc.map((c) => c.id)).toEqual(["b", "a", "n"]);
    const desc = sortCourses([a, noWeeks, b], { field: "weeks", direction: "desc" });
    expect(desc.map((c) => c.id)).toEqual(["a", "b", "n"]);
  });

  it("sorts a derived count column (repos) numerically, zero included in normal order", () => {
    const zero = makeCourse({ id: "z", name: "Z", repos: [] });
    const two = makeCourse({ id: "t", name: "T", repos: [{ repo: "a/a", branch: null }, { repo: "a/b", branch: null }] });
    const one = makeCourse({ id: "o", name: "O", repos: [{ repo: "a/a", branch: null }] });
    const asc = sortCourses([two, zero, one], { field: "repos", direction: "asc" });
    expect(asc.map((c) => c.id)).toEqual(["z", "o", "t"]);
  });

  it("sorts syllabusId by resolved display name via ctx, unset always last", () => {
    const withName = makeCourse({ id: "w", name: "W", syllabusId: "syl-2" });
    const unmapped = makeCourse({ id: "u", name: "U", syllabusId: "syl-unknown" });
    const unset = makeCourse({ id: "n", name: "N", syllabusId: null });
    const ctx = { syllabusNameById: new Map([["syl-2", "Astronomy syllabus"]]) };
    const asc = sortCourses([withName, unset, unmapped], { field: "syllabusId", direction: "asc" }, ctx);
    // "Astronomy syllabus" < "syl-unknown" (unmapped falls back to raw id) < unset (always last).
    expect(asc.map((c) => c.id)).toEqual(["w", "u", "n"]);
  });

  it("breaks ties by name ascending, regardless of sort direction", () => {
    const b = makeCourse({ id: "b", name: "Beta", institution: "Same" });
    const a = makeCourse({ id: "a", name: "Alpha", institution: "Same" });
    const asc = sortCourses([b, a], { field: "institution", direction: "asc" });
    expect(asc.map((c) => c.id)).toEqual(["a", "b"]);
    const desc = sortCourses([b, a], { field: "institution", direction: "desc" });
    expect(desc.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("parseColumnSet / serializeColumnSet", () => {
  it("returns the default visible columns for null/undefined", () => {
    expect(parseColumnSet(null)).toEqual(DEFAULT_VISIBLE_COLUMNS);
    expect(parseColumnSet(undefined)).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });

  it("returns the default visible columns for malformed JSON or a non-array", () => {
    expect(parseColumnSet("{not json")).toEqual(DEFAULT_VISIBLE_COLUMNS);
    expect(parseColumnSet(JSON.stringify({ institution: true }))).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });

  it("drops unknown ids and de-duplicates (a legacy bare-array set gains columns added in later versions)", () => {
    expect(parseColumnSet(JSON.stringify(["institution", "bogus", "institution", "weeks"]))).toEqual([
      "institution",
      "weeks",
      "modality",
      "integrations", "description", "scheduleCsv", "rubric", "materials", "lmsExports",
    ]);
  });

  it("unions all post-v0 columns into an empty legacy selection (a bare array is version 0)", () => {
    expect(parseColumnSet(JSON.stringify([]))).toEqual([
      "modality",
      "integrations", "description", "scheduleCsv", "rubric", "materials", "lmsExports",
    ]);
  });

  it("ignores name/actions if present since they are not toggleable columns", () => {
    expect(parseColumnSet(JSON.stringify(["name", "actions", "lms"]))).toEqual([
      "lms", "modality",
      "integrations", "description", "scheduleCsv", "rubric", "materials", "lmsExports",
    ]);
  });

  it("migrates legacy count-column ids to the columns that superseded them", () => {
    expect(parseColumnSet(JSON.stringify(["rosterCount", "studentRepoCount", "reposCount", "lms"]))).toEqual([
      "roster",
      "studentRepos",
      "repos",
      "lms",
      "modality",
      "integrations", "description", "scheduleCsv", "rubric", "materials", "lmsExports",
    ]);
  });

  it("dedups after migrating a legacy id that collides with a persisted new id", () => {
    expect(parseColumnSet(JSON.stringify(["roster", "rosterCount", "lms"]))).toEqual([
      "roster", "lms", "modality",
      "integrations", "description", "scheduleCsv", "rubric", "materials", "lmsExports",
    ]);
  });

  it("round-trips through serializeColumnSet", () => {
    const cols: typeof ALL_COLUMN_IDS[number][] = ["lms", "textbook"];
    expect(parseColumnSet(serializeColumnSet(cols))).toEqual(cols);
  });

  it("unions modality into a legacy bare-array persisted set (version 0)", () => {
    const legacy = JSON.stringify(["institution", "lms"]);
    const parsed = parseColumnSet(legacy);
    expect(parsed).toContain("modality");
    expect(parsed).toContain("institution");
    expect(parsed).toContain("lms");
  });

  it("leaves a set already persisted at the current version untouched (no duplicate union)", () => {
    const current = serializeColumnSet(["lms"]);
    expect(parseColumnSet(current)).toEqual(["lms"]);
  });

  it("unions modality exactly once even if it was already present in a legacy set", () => {
    const legacy = JSON.stringify(["institution", "modality", "lms"]);
    const parsed = parseColumnSet(legacy);
    expect(parsed.filter((id) => id === "modality").length).toBe(1);
  });

  it("still falls back to the default visible set for junk wrapped in a versioned shape", () => {
    expect(parseColumnSet(JSON.stringify({ v: 1, columns: "not-an-array" }))).toEqual(DEFAULT_VISIBLE_COLUMNS);
    expect(parseColumnSet(JSON.stringify({ v: "bogus", columns: ["lms"] }))).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });

  it("still migrates legacy count-column ids when read from a version-0 (bare array) set", () => {
    const legacy = JSON.stringify(["rosterCount", "lms"]);
    const parsed = parseColumnSet(legacy);
    expect(parsed).toContain("roster");
    expect(parsed).not.toContain("rosterCount");
  });

  it("still drops unknown ids under the versioned shape", () => {
    expect(parseColumnSet(JSON.stringify({ v: CURRENT_COLUMNS_VERSION, columns: ["bogus", "lms"] }))).toEqual(["lms"]);
  });

  it("unions v2 columns into a v1 persisted set", () => {
    const v1 = JSON.stringify({ v: 1, columns: ["lms", "modality"] });
    expect(parseColumnSet(v1)).toEqual([
      "lms", "modality",
      "integrations", "description", "scheduleCsv", "rubric", "materials", "lmsExports",
    ]);
  });

  it("serializeColumnSet writes the current version", () => {
    const written = JSON.parse(serializeColumnSet(["lms"])) as { v: number; columns: string[] };
    expect(written.v).toBe(CURRENT_COLUMNS_VERSION);
    expect(written.columns).toEqual(["lms"]);
  });
});

describe("DEFAULT_VISIBLE_COLUMNS", () => {
  it("includes all column ids by default", () => {
    for (const id of ALL_COLUMN_IDS) {
      expect(DEFAULT_VISIBLE_COLUMNS).toContain(id);
    }
  });

  it("every default-visible id is a real column id", () => {
    for (const id of DEFAULT_VISIBLE_COLUMNS) expect(ALL_COLUMN_IDS).toContain(id);
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

describe("truncateForCell", () => {
  it("returns short text unchanged", () => {
    expect(truncateForCell("short", 10)).toBe("short");
  });

  it("trims and truncates long text with an ellipsis", () => {
    expect(truncateForCell("  a very long piece of text indeed  ", 10)).toBe("a very lo…");
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

  it("maps modality to null when blank", () => {
    expect(computeFieldPatch("modality", "async")).toEqual({ modality: "async" });
    expect(computeFieldPatch("modality", "sync")).toEqual({ modality: "sync" });
    expect(computeFieldPatch("modality", "")).toEqual({ modality: null });
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
