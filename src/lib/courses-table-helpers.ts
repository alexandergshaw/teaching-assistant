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
// Sorting

export type SortField = "name" | "startDate";
export type SortDirection = "asc" | "desc";

export interface SortState {
  field: SortField;
  direction: SortDirection;
}

export const DEFAULT_SORT: SortState = { field: "name", direction: "asc" };

const SORT_FIELDS: SortField[] = ["name", "startDate"];
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

export function compareCourses(a: Course, b: Course, sort: SortState): number {
  let cmp: number;
  if (sort.field === "name") {
    cmp = a.name.localeCompare(b.name);
  } else {
    const aEmpty = !a.startDate;
    const bEmpty = !b.startDate;
    // Courses with no start date always sort to the end, regardless of direction.
    if (aEmpty && bEmpty) cmp = 0;
    else if (aEmpty) return 1;
    else if (bEmpty) return -1;
    else cmp = (a.startDate as string).localeCompare(b.startDate as string);
  }
  return sort.direction === "asc" ? cmp : -cmp;
}

export function sortCourses(courses: Course[], sort: SortState): Course[] {
  return [...courses].sort((a, b) => compareCourses(a, b, sort));
}

// ---------------------------------------------------------------------------
// Column visibility

// Toggleable columns (name and actions are always visible, so they are not
// part of this set).
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
  "rosterCount",
  "studentRepoCount",
  "reposCount",
] as const;

export type ColumnId = (typeof ALL_COLUMN_IDS)[number];

export const DEFAULT_VISIBLE_COLUMNS: ColumnId[] = [...ALL_COLUMN_IDS];

const COLUMN_ID_SET: Set<string> = new Set(ALL_COLUMN_IDS);

/** Parse a persisted ta-courses-columns value; unknown ids are dropped and a
 * malformed value falls back to every column visible. Name/actions are
 * handled separately by callers - they are never toggleable. */
export function parseColumnSet(raw: string | null | undefined): ColumnId[] {
  if (!raw) return [...DEFAULT_VISIBLE_COLUMNS];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_VISIBLE_COLUMNS];
    const seen = new Set<string>();
    const filtered: ColumnId[] = [];
    for (const id of parsed) {
      if (typeof id === "string" && COLUMN_ID_SET.has(id) && !seen.has(id)) {
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
