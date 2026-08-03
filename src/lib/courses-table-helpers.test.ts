import { describe, it, expect } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";
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
  parseColumnOrder,
  serializeColumnOrder,
  moveColumnInOrder,
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
    topicOutline: null,
    syllabusTemplateId: null,
    courseKind: null,
    endDate: null,
    breaks: null,
    assignmentDueRule: null,
    email: null,
    emailClient: null,
    classLengthMinutes: null,
    courseProject: emptyCourseProject(),
    materialsFiles: [],
    castletopFiles: [],
    miscFiles: [],
    exportFiles: [],
    materialsZipName: null,
    materialsZipPath: null,
    materialsZipSize: null,
    customTiles: [],
    hiddenTiles: [],
    studentRepos: [],
    weeklyChecklist: [],
    gradesDueDate: null,
    gradesDueTime: null,
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

  it("sorts weeklyChecklist by open (unchecked) item count, defensively coerced, ignoring overdue-ness", () => {
    const c = makeCourse({
      weeklyChecklist: [
        { id: "1", label: "a", checked: true, checkedAt: null, deadline: null },
        { id: "2", label: "b", checked: false, checkedAt: null, deadline: null },
        { id: "3", label: "c", checked: false, checkedAt: null, deadline: null },
      ],
    });
    expect(sortValueFor(c, "weeklyChecklist")).toEqual({ kind: "number", value: 2, empty: false });

    const missing = makeCourse({ weeklyChecklist: undefined });
    expect(sortValueFor(missing, "weeklyChecklist")).toEqual({ kind: "number", value: 0, empty: false });
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

  it("treats classLength as an empty-when-null number, mirroring weeks/tests", () => {
    expect(sortValueFor(makeCourse({ classLengthMinutes: 75 }), "classLength")).toEqual({ kind: "number", value: 75, empty: false });
    expect(sortValueFor(makeCourse({ classLengthMinutes: 0 }), "classLength")).toEqual({ kind: "number", value: 0, empty: false });
    expect(sortValueFor(makeCourse({ classLengthMinutes: null }), "classLength")).toEqual({ kind: "number", value: 0, empty: true });
  });

  it("treats modality as empty-when-unset text", () => {
    expect(sortValueFor(makeCourse({ modality: "async" }), "modality")).toEqual({ kind: "text", value: "async", empty: false });
    expect(sortValueFor(makeCourse({ modality: null }), "modality")).toEqual({ kind: "text", value: "", empty: true });
  });

  // F3: courseKind follows the SAME empty-when-unset text rule as modality
  // above - both are nullable two-option-plus-unset vocabulary columns.
  it("treats courseKind as empty-when-unset text", () => {
    expect(sortValueFor(makeCourse({ courseKind: "coding" }), "courseKind")).toEqual({ kind: "text", value: "coding", empty: false });
    expect(sortValueFor(makeCourse({ courseKind: "applied" }), "courseKind")).toEqual({ kind: "text", value: "applied", empty: false });
    expect(sortValueFor(makeCourse({ courseKind: null }), "courseKind")).toEqual({ kind: "text", value: "", empty: true });
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

  it("resolves syllabusTemplateId to its display name via ctx, falling back to the raw id when unmapped", () => {
    const c = makeCourse({ syllabusTemplateId: "tmpl-1" });
    const ctx = { syllabusTemplateNameById: new Map([["tmpl-1", "Standard Syllabus Template"]]) };
    expect(sortValueFor(c, "syllabusTemplate", ctx)).toEqual({ kind: "text", value: "Standard Syllabus Template", empty: false });
    expect(sortValueFor(c, "syllabusTemplate")).toEqual({ kind: "text", value: "tmpl-1", empty: false });
    expect(sortValueFor(makeCourse({ syllabusTemplateId: null }), "syllabusTemplate")).toEqual({ kind: "text", value: "", empty: true });
  });

  it("treats endDate/email/emailClient as empty-when-unset text", () => {
    expect(sortValueFor(makeCourse({ endDate: "2024-12-15" }), "endDate")).toEqual({ kind: "text", value: "2024-12-15", empty: false });
    expect(sortValueFor(makeCourse({ endDate: null }), "endDate")).toEqual({ kind: "text", value: "", empty: true });
    expect(sortValueFor(makeCourse({ email: "prof@mcc.edu" }), "email")).toEqual({ kind: "text", value: "prof@mcc.edu", empty: false });
    expect(sortValueFor(makeCourse({ email: null }), "email")).toEqual({ kind: "text", value: "", empty: true });
    expect(sortValueFor(makeCourse({ emailClient: "gmail" }), "emailClient")).toEqual({ kind: "text", value: "gmail", empty: false });
    expect(sortValueFor(makeCourse({ emailClient: null }), "emailClient")).toEqual({ kind: "text", value: "", empty: true });
  });

  it("treats gradesDue as empty-when-unset text, coerced defensively (gradesDueDate is optional)", () => {
    expect(sortValueFor(makeCourse({ gradesDueDate: "2024-12-20" }), "gradesDue")).toEqual({ kind: "text", value: "2024-12-20", empty: false });
    expect(sortValueFor(makeCourse({ gradesDueDate: null }), "gradesDue")).toEqual({ kind: "text", value: "", empty: true });
    expect(sortValueFor(makeCourse({ gradesDueDate: undefined }), "gradesDue")).toEqual({ kind: "text", value: "", empty: true });
  });

  it("sorts breaks by the earliest structured start date, not lexically by the raw text", () => {
    const single = makeCourse({ breaks: "2024-11-27..2024-11-29 | Thanksgiving" });
    expect(sortValueFor(single, "breaks")).toEqual({ kind: "text", value: "2024-11-27", empty: false });

    const multi = makeCourse({
      breaks: "2024-11-27..2024-11-29 | Thanksgiving\n2024-03-09..2024-03-13 | Spring Break",
    });
    expect(sortValueFor(multi, "breaks")).toEqual({ kind: "text", value: "2024-03-09", empty: false });
  });

  it("sorts an unset breaks column as empty", () => {
    expect(sortValueFor(makeCourse({ breaks: null }), "breaks")).toEqual({ kind: "text", value: "", empty: true });
    expect(sortValueFor(makeCourse({ breaks: "" }), "breaks")).toEqual({ kind: "text", value: "", empty: true });
  });

  it("sorts legacy free-text breaks as empty - there is no reliable date to sort unstructured prose by", () => {
    expect(sortValueFor(makeCourse({ breaks: "Week 8 - Spring Break" }), "breaks")).toEqual({ kind: "text", value: "", empty: true });
  });

  it("sorts assignmentDue by the human-readable description, not the raw encoded rule", () => {
    expect(sortValueFor(makeCourse({ assignmentDueRule: "sun|23:59" }), "assignmentDue")).toEqual({
      kind: "text",
      value: "Sundays at 11:59 PM",
      empty: false,
    });
    expect(sortValueFor(makeCourse({ assignmentDueRule: null }), "assignmentDue")).toEqual({ kind: "text", value: "", empty: true });
    expect(sortValueFor(makeCourse({ assignmentDueRule: "garbage" }), "assignmentDue")).toEqual({ kind: "text", value: "", empty: true });
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

  it("sorts by gradesDue with empty values always last, regardless of direction", () => {
    const earlier = makeCourse({ id: "e", gradesDueDate: "2024-05-01" });
    const later = makeCourse({ id: "l", gradesDueDate: "2024-12-20" });
    const unset = makeCourse({ id: "u", gradesDueDate: null });
    const asc = sortCourses([later, unset, earlier], { field: "gradesDue", direction: "asc" });
    expect(asc.map((c) => c.id)).toEqual(["e", "l", "u"]);
    const desc = sortCourses([later, unset, earlier], { field: "gradesDue", direction: "desc" });
    expect(desc.map((c) => c.id)).toEqual(["l", "e", "u"]);
  });

  it("sorts by breaks (earliest structured start date) with unstructured/unset values always last, regardless of direction", () => {
    const earlier = makeCourse({ id: "e", breaks: "2024-03-09..2024-03-13" });
    const later = makeCourse({ id: "l", breaks: "2024-11-27..2024-11-29" });
    const freeform = makeCourse({ id: "f", breaks: "Week 8 - Spring Break" });
    const unset = makeCourse({ id: "u", breaks: null });
    const asc = sortCourses([later, unset, earlier, freeform], { field: "breaks", direction: "asc" });
    expect(asc.slice(0, 2).map((c) => c.id)).toEqual(["e", "l"]);
    expect(asc.slice(2).map((c) => c.id).sort()).toEqual(["f", "u"]);
    const desc = sortCourses([later, unset, earlier, freeform], { field: "breaks", direction: "desc" });
    expect(desc.slice(0, 2).map((c) => c.id)).toEqual(["l", "e"]);
    expect(desc.slice(2).map((c) => c.id).sort()).toEqual(["f", "u"]);
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
      "integrations", "description", "scheduleCsv", "rubric", "materials", "lmsExports", "topicOutline", "castletop", "syllabusTemplate", "endDate", "breaks", "assignmentDue", "email", "emailClient", "classLength", "miscFiles",
      "courseProject",
      "weeklyChecklist",
      "gradesDue",
      "courseKind",
    ]);
  });

  it("unions all post-v0 columns into an empty legacy selection (a bare array is version 0)", () => {
    expect(parseColumnSet(JSON.stringify([]))).toEqual([
      "modality",
      "integrations", "description", "scheduleCsv", "rubric", "materials", "lmsExports", "topicOutline", "castletop", "syllabusTemplate", "endDate", "breaks", "assignmentDue", "email", "emailClient", "classLength", "miscFiles",
      "courseProject",
      "weeklyChecklist",
      "gradesDue",
      "courseKind",
    ]);
  });

  it("ignores name/actions if present since they are not toggleable columns", () => {
    expect(parseColumnSet(JSON.stringify(["name", "actions", "lms"]))).toEqual([
      "lms", "modality",
      "integrations", "description", "scheduleCsv", "rubric", "materials", "lmsExports", "topicOutline", "castletop", "syllabusTemplate", "endDate", "breaks", "assignmentDue", "email", "emailClient", "classLength", "miscFiles",
      "courseProject",
      "weeklyChecklist",
      "gradesDue",
      "courseKind",
    ]);
  });

  it("migrates legacy count-column ids to the columns that superseded them", () => {
    expect(parseColumnSet(JSON.stringify(["rosterCount", "studentRepoCount", "reposCount", "lms"]))).toEqual([
      "roster",
      "studentRepos",
      "repos",
      "lms",
      "modality",
      "integrations", "description", "scheduleCsv", "rubric", "materials", "lmsExports", "topicOutline", "castletop", "syllabusTemplate", "endDate", "breaks", "assignmentDue", "email", "emailClient", "classLength", "miscFiles",
      "courseProject",
      "weeklyChecklist",
      "gradesDue",
      "courseKind",
    ]);
  });

  it("dedups after migrating a legacy id that collides with a persisted new id", () => {
    expect(parseColumnSet(JSON.stringify(["roster", "rosterCount", "lms"]))).toEqual([
      "roster", "lms", "modality",
      "integrations", "description", "scheduleCsv", "rubric", "materials", "lmsExports", "topicOutline", "castletop", "syllabusTemplate", "endDate", "breaks", "assignmentDue", "email", "emailClient", "classLength", "miscFiles",
      "courseProject",
      "weeklyChecklist",
      "gradesDue",
      "courseKind",
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

  it("unions v2+v3+v4+v5+v6+v7+v8+v9+v10+v11+v12 columns into a v1 persisted set", () => {
    const v1 = JSON.stringify({ v: 1, columns: ["lms", "modality"] });
    expect(parseColumnSet(v1)).toEqual([
      "lms", "modality",
      "integrations", "description", "scheduleCsv", "rubric", "materials", "lmsExports", "topicOutline", "castletop", "syllabusTemplate", "endDate", "breaks", "assignmentDue", "email", "emailClient", "classLength", "miscFiles",
      "courseProject",
      "weeklyChecklist",
      "gradesDue",
      "courseKind",
    ]);
  });

  it("unions v3+v4+v5+v6+v7+v8+v9+v10+v11+v12 columns into a v2 persisted set", () => {
    const v2 = JSON.stringify({ v: 2, columns: ["lms", "modality"] });
    expect(parseColumnSet(v2)).toEqual(["lms", "modality", "topicOutline", "castletop", "syllabusTemplate", "endDate", "breaks", "assignmentDue", "email", "emailClient", "classLength", "miscFiles", "courseProject", "weeklyChecklist", "gradesDue", "courseKind"]);
  });

  it("unions v4+v5+v6+v7+v8+v9+v10+v11+v12 columns into a v3 persisted set", () => {
    const v3 = JSON.stringify({ v: 3, columns: ["lms", "modality"] });
    expect(parseColumnSet(v3)).toEqual(["lms", "modality", "castletop", "syllabusTemplate", "endDate", "breaks", "assignmentDue", "email", "emailClient", "classLength", "miscFiles", "courseProject", "weeklyChecklist", "gradesDue", "courseKind"]);
  });

  it("unions v5+v6+v7+v8+v9+v10+v11+v12 columns into a v4 persisted set", () => {
    const v4 = JSON.stringify({ v: 4, columns: ["lms", "modality"] });
    expect(parseColumnSet(v4)).toEqual(["lms", "modality", "syllabusTemplate", "endDate", "breaks", "assignmentDue", "email", "emailClient", "classLength", "miscFiles", "courseProject", "weeklyChecklist", "gradesDue", "courseKind"]);
  });

  it("unions v6+v7+v8+v9+v10+v11+v12 columns into a v5 persisted set", () => {
    const v5 = JSON.stringify({ v: 5, columns: ["lms", "modality"] });
    expect(parseColumnSet(v5)).toEqual(["lms", "modality", "endDate", "breaks", "assignmentDue", "email", "emailClient", "classLength", "miscFiles", "courseProject", "weeklyChecklist", "gradesDue", "courseKind"]);
  });

  it("unions v7+v8+v9+v10+v11+v12 columns into a v6 persisted set", () => {
    const v6 = JSON.stringify({ v: 6, columns: ["lms", "modality"] });
    expect(parseColumnSet(v6)).toEqual(["lms", "modality", "classLength", "miscFiles", "courseProject", "weeklyChecklist", "gradesDue", "courseKind"]);
  });

  it("unions v8+v9+v10+v11+v12 columns into a v7 persisted set", () => {
    const v7 = JSON.stringify({ v: 7, columns: ["lms", "modality"] });
    expect(parseColumnSet(v7)).toEqual(["lms", "modality", "miscFiles", "courseProject", "weeklyChecklist", "gradesDue", "courseKind"]);
  });

  it("unions v9+v10+v11+v12 columns into a v8 persisted set", () => {
    const v8 = JSON.stringify({ v: 8, columns: ["lms", "modality"] });
    expect(parseColumnSet(v8)).toEqual(["lms", "modality", "courseProject", "weeklyChecklist", "gradesDue", "courseKind"]);
  });

  it("unions v10+v11+v12 columns into a v9 persisted set", () => {
    const v9 = JSON.stringify({ v: 9, columns: ["lms", "modality"] });
    expect(parseColumnSet(v9)).toEqual(["lms", "modality", "weeklyChecklist", "gradesDue", "courseKind"]);
  });

  it("unions v11+v12 columns into a v10 persisted set", () => {
    const v10 = JSON.stringify({ v: 10, columns: ["lms", "modality"] });
    expect(parseColumnSet(v10)).toEqual(["lms", "modality", "gradesDue", "courseKind"]);
  });

  it("unions v12 columns into a v11 persisted set", () => {
    const v11 = JSON.stringify({ v: 11, columns: ["lms", "modality"] });
    expect(parseColumnSet(v11)).toEqual(["lms", "modality", "courseKind"]);
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

  it("parses classLengthMinutes as a number, blank/invalid as null, mirroring weeks/tests", () => {
    expect(computeFieldPatch("classLengthMinutes", "75")).toEqual({ classLengthMinutes: 75 });
    expect(computeFieldPatch("classLengthMinutes", "")).toEqual({ classLengthMinutes: null });
    expect(computeFieldPatch("classLengthMinutes", "abc")).toEqual({ classLengthMinutes: null });
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

  // F3: courseKind follows the SAME null-when-blank rule as modality above.
  it("maps courseKind to null when blank", () => {
    expect(computeFieldPatch("courseKind", "coding")).toEqual({ courseKind: "coding" });
    expect(computeFieldPatch("courseKind", "applied")).toEqual({ courseKind: "applied" });
    expect(computeFieldPatch("courseKind", "")).toEqual({ courseKind: null });
  });

  it("maps syllabusTemplateId to null when blank", () => {
    expect(computeFieldPatch("syllabusTemplateId", "tmpl-1")).toEqual({ syllabusTemplateId: "tmpl-1" });
    expect(computeFieldPatch("syllabusTemplateId", "")).toEqual({ syllabusTemplateId: null });
  });

  it("maps endDate to null when blank", () => {
    expect(computeFieldPatch("endDate", "2024-12-15")).toEqual({ endDate: "2024-12-15" });
    expect(computeFieldPatch("endDate", "")).toEqual({ endDate: null });
  });

  it("maps gradesDueDate to null when blank", () => {
    expect(computeFieldPatch("gradesDueDate", "2024-12-20")).toEqual({ gradesDueDate: "2024-12-20" });
    expect(computeFieldPatch("gradesDueDate", "")).toEqual({ gradesDueDate: null });
  });

  it("maps breaks to null when blank", () => {
    expect(computeFieldPatch("breaks", "Week 8 - Spring Break")).toEqual({ breaks: "Week 8 - Spring Break" });
    expect(computeFieldPatch("breaks", "")).toEqual({ breaks: null });
  });

  it("maps assignmentDueRule to null when blank", () => {
    expect(computeFieldPatch("assignmentDueRule", "sun|23:59")).toEqual({ assignmentDueRule: "sun|23:59" });
    expect(computeFieldPatch("assignmentDueRule", "")).toEqual({ assignmentDueRule: null });
  });

  it("maps email to null when blank", () => {
    expect(computeFieldPatch("email", "prof@mcc.edu")).toEqual({ email: "prof@mcc.edu" });
    expect(computeFieldPatch("email", "")).toEqual({ email: null });
  });

  it("maps emailClient to null when blank", () => {
    expect(computeFieldPatch("emailClient", "gmail")).toEqual({ emailClient: "gmail" });
    expect(computeFieldPatch("emailClient", "")).toEqual({ emailClient: null });
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

describe("column order", () => {
  describe("parseColumnOrder", () => {
    it("falls back to ALL_COLUMN_IDS for a missing or malformed value", () => {
      expect(parseColumnOrder(null)).toEqual([...ALL_COLUMN_IDS]);
      expect(parseColumnOrder("")).toEqual([...ALL_COLUMN_IDS]);
      expect(parseColumnOrder("not json")).toEqual([...ALL_COLUMN_IDS]);
      expect(parseColumnOrder(JSON.stringify({ nope: 1 }))).toEqual([...ALL_COLUMN_IDS]);
    });

    it("honours a stored order and appends every unmentioned column", () => {
      const stored = serializeColumnOrder(["miscFiles", "institution"]);
      const order = parseColumnOrder(stored);
      expect(order[0]).toBe("miscFiles");
      expect(order[1]).toBe("institution");
      // Still a complete, duplicate-free ordering of every column.
      expect(order.length).toBe(ALL_COLUMN_IDS.length);
      expect(new Set(order).size).toBe(ALL_COLUMN_IDS.length);
      for (const id of ALL_COLUMN_IDS) expect(order).toContain(id);
    });

    it("appends columns added after the value was written, in ALL_COLUMN_IDS order", () => {
      // A stored order naming only two columns stands in for one written before
      // every other column existed.
      const order = parseColumnOrder(JSON.stringify({ v: 1, order: ["weeks", "tests"] }));
      expect(order.slice(0, 2)).toEqual(["weeks", "tests"]);
      const rest = ALL_COLUMN_IDS.filter((id) => id !== "weeks" && id !== "tests");
      expect(order.slice(2)).toEqual(rest);
    });

    it("drops unknown ids and de-duplicates repeats", () => {
      const order = parseColumnOrder(
        JSON.stringify({ v: 8, order: ["institution", "institution", "not-a-column", 42] })
      );
      expect(order.length).toBe(ALL_COLUMN_IDS.length);
      expect(new Set(order).size).toBe(ALL_COLUMN_IDS.length);
      expect(order[0]).toBe("institution");
    });

    it("migrates legacy count ids the same way parseColumnSet does", () => {
      const order = parseColumnOrder(JSON.stringify({ v: 0, order: ["rosterCount"] }));
      expect(order[0]).toBe("roster");
    });

    it("accepts the legacy bare-array shape", () => {
      const order = parseColumnOrder(JSON.stringify(["email"]));
      expect(order[0]).toBe("email");
      expect(order.length).toBe(ALL_COLUMN_IDS.length);
    });

    it("round-trips through serializeColumnOrder", () => {
      const custom = [...ALL_COLUMN_IDS].reverse();
      expect(parseColumnOrder(serializeColumnOrder(custom))).toEqual(custom);
    });
  });

  describe("moveColumnInOrder", () => {
    const order = ["a", "b", "c", "d"] as unknown as Parameters<typeof moveColumnInOrder>[0];
    const allVisible = order;

    it("moves a column one place earlier and one place later", () => {
      expect(moveColumnInOrder(order, allVisible, order[2], "up")).toEqual(["a", "c", "b", "d"]);
      expect(moveColumnInOrder(order, allVisible, order[1], "down")).toEqual(["a", "c", "b", "d"]);
    });

    it("is a no-op at either visible edge", () => {
      expect(moveColumnInOrder(order, allVisible, order[0], "up")).toEqual(order);
      expect(moveColumnInOrder(order, allVisible, order[3], "down")).toEqual(order);
    });

    it("is a no-op for a hidden column", () => {
      const visible = [order[0], order[3]] as typeof allVisible;
      expect(moveColumnInOrder(order, visible, order[1], "up")).toEqual(order);
    });

    // The whole reason the helper takes the visible set: swapping with the raw
    // array neighbour would move the column past a hidden one and look to the
    // user like the button did nothing.
    it("swaps with the nearest VISIBLE neighbour, skipping hidden columns", () => {
      const visible = [order[0], order[3]] as typeof allVisible;
      expect(moveColumnInOrder(order, visible, order[3], "up")).toEqual(["d", "a", "b", "c"]);
    });

    it("never adds, drops, or duplicates a column", () => {
      const moved = moveColumnInOrder(order, allVisible, order[2], "up");
      expect(moved.length).toBe(order.length);
      expect(new Set(moved).size).toBe(order.length);
    });
  });

  describe("default grouping", () => {
    it("DEFAULT_VISIBLE_COLUMNS is exactly ALL_COLUMN_IDS, so the two cannot drift", () => {
      expect(DEFAULT_VISIBLE_COLUMNS).toEqual([...ALL_COLUMN_IDS]);
    });

    it("keeps related columns adjacent in the default order", () => {
      const at = (id: string) => ALL_COLUMN_IDS.indexOf(id as (typeof ALL_COLUMN_IDS)[number]);
      // Term dates sit together.
      expect(at("endDate")).toBe(at("startDate") + 1);
      // gradesDue sits directly after endDate - same "one calendar date"
      // shape as start/endDate, not the recurring-rule Assessment cadence
      // group assignmentDue/weeklyChecklist live in.
      expect(at("gradesDue")).toBe(at("endDate") + 1);
      // The email pair sits together.
      expect(at("emailClient")).toBe(at("email") + 1);
      // Both syllabus columns sit together.
      expect(at("syllabusTemplate")).toBe(at("syllabusId") + 1);
      // File-bearing columns are contiguous at the end.
      const fileCols = ["materials", "lmsExports", "castletop", "miscFiles"].map(at);
      expect(Math.max(...fileCols) - Math.min(...fileCols)).toBe(fileCols.length - 1);
    });
  });
});

describe("course project column", () => {
  it("is a known column, in the generated-artifacts group", () => {
    expect(ALL_COLUMN_IDS).toContain("courseProject");
    const at = (id: string) => ALL_COLUMN_IDS.indexOf(id as (typeof ALL_COLUMN_IDS)[number]);
    expect(at("courseProject")).toBeGreaterThan(at("castletop"));
  });

  it("has a min width, like every other column", () => {
    expect(COLUMN_MIN_WIDTHS.courseProject).toBeGreaterThan(0);
  });

  // Without the version bump AND the COLUMNS_ADDED_IN entry, the column is
  // invisible to anyone who already has a saved column set.
  it("is unioned into a column set saved before it existed", () => {
    const stored = JSON.stringify({ v: 8, columns: ["institution", "weeks"] });
    expect(parseColumnSet(stored)).toContain("courseProject");
  });

  it("bumped CURRENT_COLUMNS_VERSION past the version that lacked it", () => {
    expect(CURRENT_COLUMNS_VERSION).toBeGreaterThanOrEqual(9);
  });

  it("sorts by milestone count, with an unset project sorting as zero", () => {
    const planned = makeCourse({
      courseProject: {
        mode: "course-long",
        name: "P",
        definition: "d",
        brief: "",
        briefFileName: "",
        milestones: [
          { week: 1, title: "A", deliverable: "" },
          { week: 2, title: "B", deliverable: "" },
        ],
        tools: [],
        generatedAt: "",
      },
    });
    expect(sortValueFor(planned, "courseProject")).not.toEqual(
      sortValueFor(makeCourse({}), "courseProject")
    );
    // A project switched off is not "planned", however many milestones remain.
    const off = makeCourse({
      courseProject: { ...planned.courseProject, mode: "none" },
    });
    expect(sortValueFor(off, "courseProject")).toEqual(sortValueFor(makeCourse({}), "courseProject"));
  });

  // The cell saves through setCourseProjectAction, never through the generic
  // inline-edit path - a project is a structured record, not a text field.
  // That the cell saves through setCourseProjectAction rather than the
  // generic inline path is a compile-time guarantee (courseProject is not in
  // the InlineField union) plus the dedicated-writer allowlist in
  // registry-helpers.courseToInputPayload.test.ts - there is no runtime list
  // to assert against here.
});

describe("grades due column", () => {
  it("is a known column, placed with the other single-calendar-date columns", () => {
    expect(ALL_COLUMN_IDS).toContain("gradesDue");
    const at = (id: string) => ALL_COLUMN_IDS.indexOf(id as (typeof ALL_COLUMN_IDS)[number]);
    expect(at("gradesDue")).toBe(at("endDate") + 1);
  });

  it("has a min width, like every other column", () => {
    expect(COLUMN_MIN_WIDTHS.gradesDue).toBeGreaterThan(0);
  });

  // Without the version bump AND the COLUMNS_ADDED_IN entry, the column is
  // invisible to anyone who already has a saved column set.
  it("is unioned into a column set saved before it existed", () => {
    const stored = JSON.stringify({ v: 10, columns: ["institution", "weeks"] });
    expect(parseColumnSet(stored)).toContain("gradesDue");
  });

  it("bumped CURRENT_COLUMNS_VERSION past the version that lacked it", () => {
    expect(CURRENT_COLUMNS_VERSION).toBeGreaterThanOrEqual(11);
  });
});
