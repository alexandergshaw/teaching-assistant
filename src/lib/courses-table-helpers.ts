// Pure logic for the Courses table view (Phase 2 of the tiles -> table
// redesign): sort comparator, column-visibility persistence parsing, derived
// count columns, and the per-field save-patch computation that the table's
// inline cell editors share with the old tile editors' save path.
import type { Course, CourseInput } from "./supabase/courses";
import {
  rosterStats,
  parseRepoLines,
  parseIntegrationLines,
  studentReposToRows,
  type InlineField,
} from "./courses-tab-helpers";

// ---------------------------------------------------------------------------
// Column visibility (declared before sorting so SortField can derive from it)

// Toggleable columns (name and actions are always visible, so they are not
// part of this set). The former row-expansion cards (Codebases, Roster,
// Student repos, Integrations, Description, Schedule of Topics, Rubric,
// Materials, LMS Exports) are columns here too - row expansion is gone.
export const ALL_COLUMN_IDS = [
  "institution",
  "startDate",
  "dayTime",
  "weeks",
  "tests",
  "lms",
  "githubOrg",
  "syllabusId",
  "textbook",
  "repos",
  "roster",
  "studentRepos",
  "integrations",
  "description",
  "scheduleCsv",
  "rubric",
  "materials",
  "lmsExports",
] as const;

export type ColumnId = (typeof ALL_COLUMN_IDS)[number];

// The pre-widening default face: the twelve columns that were visible before
// the row-expansion cards became columns. The six heavy new columns
// (integrations, description, scheduleCsv, rubric, materials, lmsExports)
// default hidden - still discoverable in the Columns menu.
export const DEFAULT_VISIBLE_COLUMNS: ColumnId[] = [
  "institution",
  "startDate",
  "dayTime",
  "weeks",
  "tests",
  "lms",
  "githubOrg",
  "syllabusId",
  "textbook",
  "repos",
  "roster",
  "studentRepos",
];

const COLUMN_ID_SET: Set<string> = new Set(ALL_COLUMN_IDS);

// Legacy persisted column ids from before the count columns were superseded
// by the repos/roster/studentRepos columns (those columns display the same
// counts, plus editing, so no information is lost by the rename).
const LEGACY_COLUMN_ID_MIGRATIONS: Record<string, ColumnId> = {
  rosterCount: "roster",
  studentRepoCount: "studentRepos",
  reposCount: "repos",
};

/** Parse a persisted ta-courses-columns value; unknown ids are dropped and a
 * malformed value falls back to the default visible set. Legacy count-column
 * ids migrate to the column that superseded them. Name/actions are handled
 * separately by callers - they are never toggleable. */
export function parseColumnSet(raw: string | null | undefined): ColumnId[] {
  if (!raw) return [...DEFAULT_VISIBLE_COLUMNS];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_VISIBLE_COLUMNS];
    const seen = new Set<string>();
    const filtered: ColumnId[] = [];
    for (const rawId of parsed) {
      if (typeof rawId !== "string") continue;
      const id = LEGACY_COLUMN_ID_MIGRATIONS[rawId] ?? rawId;
      if (COLUMN_ID_SET.has(id) && !seen.has(id)) {
        seen.add(id);
        filtered.push(id as ColumnId);
      }
    }
    return filtered;
  } catch {
    return [...DEFAULT_VISIBLE_COLUMNS];
  }
}

export function serializeColumnSet(columns: ColumnId[]): string {
  return JSON.stringify(columns);
}

// ---------------------------------------------------------------------------
// Column min-widths (table layout)

/** Minimum width (px) applied as each th's inline minWidth style. Header
 * cells govern their column's width for the whole table, so horizontal
 * scroll inside the table's scroller wrapper engages exactly when the
 * visible columns need more room than the viewport gives them - never
 * before, and never a fixed table-wide minimum regardless of which optional
 * columns are shown. */
export const COLUMN_MIN_WIDTHS: Record<ColumnId | "name" | "actions", number> = {
  name: 240,
  institution: 150,
  startDate: 120,
  dayTime: 140,
  weeks: 70,
  tests: 70,
  lms: 190,
  githubOrg: 170,
  syllabusId: 230,
  textbook: 260,
  repos: 220,
  roster: 220,
  studentRepos: 220,
  integrations: 220,
  description: 260,
  scheduleCsv: 220,
  rubric: 220,
  materials: 190,
  lmsExports: 190,
  actions: 240,
};

// ---------------------------------------------------------------------------
// Sorting

export type SortField = "name" | ColumnId;
export type SortDirection = "asc" | "desc";

export interface SortState {
  field: SortField;
  direction: SortDirection;
}

export const DEFAULT_SORT: SortState = { field: "name", direction: "asc" };

// Derived from the column set so every column (including future ones) is
// sortable by construction. "actions" is deliberately excluded - it is not
// data.
export const SORT_FIELDS: SortField[] = ["name", ...ALL_COLUMN_IDS];
const SORT_DIRECTIONS: SortDirection[] = ["asc", "desc"];

/** Parse a persisted ta-courses-sort value; anything malformed falls back to the default. */
export function parseSortState(raw: string | null | undefined): SortState {
  if (!raw) return DEFAULT_SORT;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "field" in parsed &&
      "direction" in parsed &&
      SORT_FIELDS.includes((parsed as { field: unknown }).field as SortField) &&
      SORT_DIRECTIONS.includes((parsed as { direction: unknown }).direction as SortDirection)
    ) {
      return {
        field: (parsed as { field: SortField }).field,
        direction: (parsed as { direction: SortDirection }).direction,
      };
    }
    return DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

export interface SortContext {
  /** Resolved syllabus display name by syllabus id, for the syllabusId column. */
  syllabusNameById?: Map<string, string>;
}

export type SortValue = { kind: "text"; value: string; empty: boolean } | { kind: "number"; value: number; empty: boolean };

function textValue(raw: string | null | undefined): SortValue {
  const trimmed = (raw ?? "").trim();
  return { kind: "text", value: trimmed, empty: trimmed.length === 0 };
}

function numberValue(raw: number | null | undefined): SortValue {
  return { kind: "number", value: raw ?? 0, empty: raw === null || raw === undefined };
}

function countValue(count: number): SortValue {
  return { kind: "number", value: count, empty: false };
}

/** Pure extractor: maps one course + sortable field to a typed, comparable
 * value. "empty" marks values that must always sort last, in both
 * directions (unset dates, unset scalar fields, null week/test counts). The
 * derived count columns (repos/roster/studentRepos/integrations/materials/
 * lmsExports) are never "empty" - zero is an ordinary value, sorted
 * numerically like any other count. */
export function sortValueFor(course: Course, field: SortField, ctx?: SortContext): SortValue {
  switch (field) {
    case "name":
      return { kind: "text", value: course.name, empty: false };
    case "startDate":
      return textValue(course.startDate);
    case "institution":
      return textValue(course.institution);
    case "dayTime":
      return textValue(course.dayTime);
    case "lms":
      return textValue(course.lms);
    case "githubOrg":
      return textValue(course.githubOrg);
    case "textbook":
      return textValue(course.textbook);
    case "syllabusId": {
      const raw = (course.syllabusId ?? "").trim();
      if (!raw) return { kind: "text", value: "", empty: true };
      const resolved = ctx?.syllabusNameById?.get(raw) ?? raw;
      return { kind: "text", value: resolved, empty: false };
    }
    case "weeks":
      return numberValue(course.weeks);
    case "tests":
      return numberValue(course.tests);
    case "repos":
      return countValue(deriveCourseCounts(course).reposCount);
    case "roster":
      return countValue(deriveCourseCounts(course).rosterCount);
    case "studentRepos":
      return countValue(deriveCourseCounts(course).studentRepoCount);
    case "integrations":
      return countValue(course.integrations.length);
    case "description":
      return textValue(course.description);
    case "scheduleCsv":
      return textValue(course.csvData);
    case "rubric":
      return textValue(course.rubricData);
    case "materials":
      return countValue(course.materialsFiles.length + (course.materialsZipPath ? 1 : 0));
    case "lmsExports":
      return countValue(course.exportFiles.length);
  }
}

function compareSortValues(a: SortValue, b: SortValue): number {
  if (a.kind === "text" && b.kind === "text") return a.value.localeCompare(b.value, undefined, { sensitivity: "base" });
  if (a.kind === "number" && b.kind === "number") return a.value - b.value;
  // Same field always yields the same kind on both sides; this branch is
  // unreachable in practice, but keeps the function total.
  return 0;
}

/** One generic comparator for every sortable field, driven by sortValueFor.
 * Empty values always sort last, in both directions. When the primary
 * comparison ties (and the field is not itself "name"), ties break by name
 * ascending - stable and deterministic, independent of sort direction. */
export function compareCourses(a: Course, b: Course, sort: SortState, ctx?: SortContext): number {
  if (sort.field === "name") {
    const cmp = a.name.localeCompare(b.name);
    return sort.direction === "asc" ? cmp : -cmp;
  }

  const av = sortValueFor(a, sort.field, ctx);
  const bv = sortValueFor(b, sort.field, ctx);

  let primary: number;
  if (av.empty && bv.empty) primary = 0;
  else if (av.empty) return 1;
  else if (bv.empty) return -1;
  else primary = compareSortValues(av, bv);

  if (primary === 0) return a.name.localeCompare(b.name);

  return sort.direction === "asc" ? primary : -primary;
}

export function sortCourses(courses: Course[], sort: SortState, ctx?: SortContext): Course[] {
  return [...courses].sort((a, b) => compareCourses(a, b, sort, ctx));
}

// ---------------------------------------------------------------------------
// Derived (read-only) count columns

export interface DerivedCourseCounts {
  rosterCount: number;
  studentRepoCount: number;
  reposCount: number;
}

export function deriveCourseCounts(c: Course): DerivedCourseCounts {
  return {
    rosterCount: rosterStats(c.roster ?? "").students,
    studentRepoCount: (c.studentRepos ?? []).length,
    reposCount: c.repos.length,
  };
}

// ---------------------------------------------------------------------------
// Cell display helpers

/** Trim and truncate a value for a compact table cell, appending an ellipsis
 * when the text is cut short. */
export function truncateForCell(text: string, maxLength = 60): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// LMS/import eligibility (unchanged from the tile system)

/** True when the course has both a Canvas URL and an institution, so a live LMS pull is possible. */
export function canLms(c: Course): boolean {
  return Boolean((c.canvasUrl ?? "").trim() && (c.institution ?? "").trim());
}

/** True when the course has no live LMS connection but does have an uploaded export to fall back to. */
export function canImport(c: Course): boolean {
  return !canLms(c) && c.exportFiles.length > 0;
}

export function latestExportFile(c: Course) {
  if (c.exportFiles.length === 0) return null;
  return c.exportFiles.reduce((latest, f) => (f.addedAt > latest.addedAt ? f : latest));
}

// ---------------------------------------------------------------------------
// Inline cell save-patch computation
//
// This mirrors the tile editors' save-path patch computation (formerly
// saveTileEdit in CoursesTab) so the table's inline cells write through the
// exact same field mapping. "name" and "institution" were previously only
// editable via the add/edit course form; the table makes them inline cells
// too, using the same passthrough shape as the other plain-text fields.
export type TableEditableField = InlineField | "name" | "institution";

export function computeFieldPatch(field: TableEditableField, rawValue: string): Partial<CourseInput> {
  switch (field) {
    case "repos":
      return { repos: parseRepoLines(rawValue) };
    case "integrations":
      return { integrations: parseIntegrationLines(rawValue) };
    case "weeks":
      return { weeks: rawValue.trim() ? (Number.isFinite(Number(rawValue.trim())) ? Number(rawValue.trim()) : null) : null };
    case "tests":
      return { tests: rawValue.trim() ? (Number.isFinite(Number(rawValue.trim())) ? Number(rawValue.trim()) : null) : null };
    case "lms":
      return { lms: rawValue || null };
    case "dayTime":
      return { dayTime: rawValue };
    case "studentRepos":
      return {
        studentRepos: studentReposToRows(rawValue).map((r) => ({
          student: r.student,
          canvasUserId: r.canvasUserId || null,
          repo: r.repo,
        })),
      };
    case "name":
      return { name: rawValue };
    case "institution":
      return { institution: rawValue };
    default:
      return { [field]: rawValue } as Partial<CourseInput>;
  }
}
