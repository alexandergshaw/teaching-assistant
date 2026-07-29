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
import { describeAssignmentDueRule } from "./assignment-due-rule";
import { hasProject } from "./course-project";
import { coerceWeeklyChecklist, countOpenWeeklyChecklistItems } from "./weekly-checklist";

// ---------------------------------------------------------------------------
// Column visibility (declared before sorting so SortField can derive from it)

// Toggleable columns (name and actions are always visible, so they are not
// part of this set). The former row-expansion cards (Codebases, Roster,
// Student repos, Integrations, Description, Schedule of Topics, Rubric,
// Materials, LMS Exports) are columns here too - row expansion is gone.
export const ALL_COLUMN_IDS = [
  // Grouped so related columns sit next to each other: term logistics, then
  // assessment cadence, then connected systems, then people and contact, then
  // course content, then generated artifacts and files. This array is also the
  // DEFAULT left-to-right order of the table; a user's own arrangement is
  // stored separately (see parseColumnOrder).
  // Term logistics
  "institution",
  "modality",
  "startDate",
  "endDate",
  "dayTime",
  "classLength",
  "weeks",
  "breaks",
  // Assessment cadence
  "tests",
  "assignmentDue",
  // Weekly recurring task list - placed directly after assignmentDue because
  // both columns encode the SAME "day of week + optional time" recurring
  // deadline shape (see src/lib/weekly-checklist.ts); a reader scanning the
  // Assessment-cadence group for "what repeats every week" finds them
  // together rather than the checklist buried at the far end of the table.
  "weeklyChecklist",
  // Connected systems
  "lms",
  "githubOrg",
  "integrations",
  "repos",
  "studentRepos",
  // People and contact
  "roster",
  "email",
  "emailClient",
  // Course content
  "syllabusId",
  "syllabusTemplate",
  "description",
  "topicOutline",
  "scheduleCsv",
  "textbook",
  // Generated artifacts and files
  "rubric",
  "materials",
  "lmsExports",
  "castletop",
  "miscFiles",
  "courseProject",
] as const;

export type ColumnId = (typeof ALL_COLUMN_IDS)[number];

// Every column is visible by default. Derived from ALL_COLUMN_IDS rather than
// restated, so the two lists cannot drift apart as columns are added.
export const DEFAULT_VISIBLE_COLUMNS: ColumnId[] = [...ALL_COLUMN_IDS];

const COLUMN_ID_SET: Set<string> = new Set(ALL_COLUMN_IDS);

// Legacy persisted column ids from before the count columns were superseded
// by the repos/roster/studentRepos columns (those columns display the same
// counts, plus editing, so no information is lost by the rename).
const LEGACY_COLUMN_ID_MIGRATIONS: Record<string, ColumnId> = {
  rosterCount: "roster",
  studentRepoCount: "studentRepos",
  reposCount: "repos",
};

// Version of the persisted ta-courses-columns shape. A newly added column
// can never appear for someone with an already-persisted (explicit-subset)
// column set unless it is unioned in here - bump this and add an entry to
// COLUMNS_ADDED_IN whenever ALL_COLUMN_IDS grows. The legacy bare-array shape
// (no wrapper object) is treated as version 0.
export const CURRENT_COLUMNS_VERSION = 10;

/** Columns introduced by each version, unioned into every persisted set
 * stored at an earlier version. Version 0 is the pre-versioning baseline, so
 * it never appears as a key here. */
const COLUMNS_ADDED_IN: Record<number, ColumnId[]> = {
  1: ["modality"],
  2: ["integrations", "description", "scheduleCsv", "rubric", "materials", "lmsExports"],
  3: ["topicOutline"],
  4: ["castletop"],
  5: ["syllabusTemplate"],
  6: ["endDate", "breaks", "assignmentDue", "email", "emailClient"],
  7: ["classLength"],
  8: ["miscFiles"],
  9: ["courseProject"],
  10: ["weeklyChecklist"],
};

/** Parse a persisted ta-courses-columns value; unknown ids are dropped and a
 * malformed value falls back to the default visible set. Legacy count-column
 * ids migrate to the column that superseded them. Name/actions are handled
 * separately by callers - they are never toggleable. Accepts both the
 * current versioned shape ({ v, columns }) and the legacy bare-array shape
 * (treated as version 0), unioning in any column added after the stored
 * version so upgrades are never invisible to an existing persisted set. */
export function parseColumnSet(raw: string | null | undefined): ColumnId[] {
  if (!raw) return [...DEFAULT_VISIBLE_COLUMNS];
  try {
    const parsed = JSON.parse(raw) as unknown;
    let storedVersion: number;
    let columns: unknown;
    if (Array.isArray(parsed)) {
      storedVersion = 0;
      columns = parsed;
    } else if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { v?: unknown }).v === "number" &&
      Array.isArray((parsed as { columns?: unknown }).columns)
    ) {
      storedVersion = (parsed as { v: number }).v;
      columns = (parsed as { columns: unknown[] }).columns;
    } else {
      return [...DEFAULT_VISIBLE_COLUMNS];
    }

    const seen = new Set<string>();
    const filtered: ColumnId[] = [];
    for (const rawId of columns as unknown[]) {
      if (typeof rawId !== "string") continue;
      const id = LEGACY_COLUMN_ID_MIGRATIONS[rawId] ?? rawId;
      if (COLUMN_ID_SET.has(id) && !seen.has(id)) {
        seen.add(id);
        filtered.push(id as ColumnId);
      }
    }

    for (const [versionStr, added] of Object.entries(COLUMNS_ADDED_IN)) {
      if (Number(versionStr) <= storedVersion) continue;
      for (const id of added) {
        if (!seen.has(id)) {
          seen.add(id);
          filtered.push(id);
        }
      }
    }

    return filtered;
  } catch {
    return [...DEFAULT_VISIBLE_COLUMNS];
  }
}

/** Serialize a column set at the current version. Callers should
 * re-serialize (via this function) whenever they persist a set read through
 * parseColumnSet, so a legacy or older-version value is upgraded on write. */
export function serializeColumnSet(columns: ColumnId[]): string {
  return JSON.stringify({ v: CURRENT_COLUMNS_VERSION, columns });
}

// ---------------------------------------------------------------------------
// Column order (user-arranged left-to-right order)

/**
 * Parse a persisted ta-courses-column-order value into a COMPLETE ordering of
 * every column id.
 *
 * Stored ids come first, in their stored order; any id the stored value does
 * not mention - a column added since it was written, or one dropped by a
 * malformed write - is appended in ALL_COLUMN_IDS order. The result therefore
 * always contains each id exactly once, so a caller can filter it by the
 * visible set and get a total order with no gaps and no duplicates.
 *
 * Accepts the versioned shape ({ v, order }) and, like parseColumnSet, a bare
 * array (treated as version 0). Anything malformed falls back to the default
 * order.
 */
export function parseColumnOrder(raw: string | null | undefined): ColumnId[] {
  const fallback = [...ALL_COLUMN_IDS];
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    let stored: unknown;
    if (Array.isArray(parsed)) {
      stored = parsed;
    } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { order?: unknown }).order)) {
      stored = (parsed as { order: unknown[] }).order;
    } else {
      return fallback;
    }

    const seen = new Set<string>();
    const order: ColumnId[] = [];
    for (const rawId of stored as unknown[]) {
      if (typeof rawId !== "string") continue;
      const id = LEGACY_COLUMN_ID_MIGRATIONS[rawId] ?? rawId;
      if (COLUMN_ID_SET.has(id) && !seen.has(id)) {
        seen.add(id);
        order.push(id as ColumnId);
      }
    }
    for (const id of ALL_COLUMN_IDS) {
      if (!seen.has(id)) order.push(id);
    }
    return order;
  } catch {
    return fallback;
  }
}

/** Serialize a column order at the current version. */
export function serializeColumnOrder(order: ColumnId[]): string {
  return JSON.stringify({ v: CURRENT_COLUMNS_VERSION, order });
}

/**
 * Move `id` one position earlier or later among the VISIBLE columns.
 *
 * The swap is against the nearest visible neighbour, not the raw array
 * neighbour: hidden columns sitting between two visible ones would otherwise
 * make the button look broken, since the user would press it and see nothing
 * move. Returns the array unchanged when `id` is hidden, unknown, or already
 * at the visible edge.
 */
export function moveColumnInOrder(
  order: ColumnId[],
  visible: ColumnId[],
  id: ColumnId,
  direction: "up" | "down"
): ColumnId[] {
  const visibleSet = new Set(visible);
  const from = order.indexOf(id);
  if (from === -1 || !visibleSet.has(id)) return order;

  const step = direction === "up" ? -1 : 1;
  let target = -1;
  for (let i = from + step; i >= 0 && i < order.length; i += step) {
    if (visibleSet.has(order[i])) {
      target = i;
      break;
    }
  }
  if (target === -1) return order;

  const next = [...order];
  next.splice(from, 1);
  next.splice(target, 0, id);
  return next;
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
  modality: 130,
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
  topicOutline: 260,
  castletop: 200,
  syllabusTemplate: 200,
  endDate: 120,
  breaks: 220,
  assignmentDue: 170,
  email: 200,
  emailClient: 140,
  classLength: 130,
  miscFiles: 190,
  courseProject: 260,
  // Wider than most 220-width cells: every item now renders inline with a
  // Day select + a Time input side by side (AC of the "no click to view"
  // redesign - see WeeklyChecklistCell.tsx), which needs more horizontal
  // room than a collapsed summary-plus-Popover ever did.
  weeklyChecklist: 280,
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
  /** Resolved syllabus template display name by template id, for the syllabusTemplate column. */
  syllabusTemplateNameById?: Map<string, string>;
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
    case "modality":
      return textValue(course.modality);
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
    case "topicOutline":
      return textValue(course.topicOutline);
    case "castletop":
      return countValue(course.castletopFiles.length);
    case "syllabusTemplate": {
      const raw = (course.syllabusTemplateId ?? "").trim();
      if (!raw) return { kind: "text", value: "", empty: true };
      const resolved = ctx?.syllabusTemplateNameById?.get(raw) ?? raw;
      return { kind: "text", value: resolved, empty: false };
    }
    case "endDate":
      return textValue(course.endDate);
    case "breaks":
      return textValue(course.breaks);
    case "assignmentDue":
      // Sort by the human-readable form (e.g. "Sundays at 11:59 PM") so the
      // column sorts the way it reads, not by the raw encoded string.
      return textValue(describeAssignmentDueRule(course.assignmentDueRule));
    case "email":
      return textValue(course.email);
    case "emailClient":
      return textValue(course.emailClient);
    case "classLength":
      return numberValue(course.classLengthMinutes);
    case "miscFiles":
      return countValue(course.miscFiles.length);
    case "courseProject":
      // Sorts by how planned the course is: courses with no project sort as 0,
      // which groups the unplanned ones together.
      return countValue(
        hasProject(course.courseProject) ? course.courseProject.milestones.length : 0
      );
    case "weeklyChecklist":
      // Sorts by how much is still outstanding (unchecked), not by overdue
      // count - overdue depends on "now" and sortValueFor stays a pure,
      // time-independent function of the course, matching every other case
      // here. Coerced defensively since course.weeklyChecklist is optional
      // (see the Course interface's comment).
      return countValue(countOpenWeeklyChecklistItems(coerceWeeklyChecklist(course.weeklyChecklist)));
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
    case "classLengthMinutes":
      return {
        classLengthMinutes: rawValue.trim() ? (Number.isFinite(Number(rawValue.trim())) ? Number(rawValue.trim()) : null) : null,
      };
    case "lms":
      return { lms: rawValue || null };
    case "modality":
      return { modality: rawValue || null };
    case "topicOutline":
      return { topicOutline: rawValue || null };
    case "syllabusTemplateId":
      return { syllabusTemplateId: rawValue || null };
    case "endDate":
      return { endDate: rawValue || null };
    case "breaks":
      return { breaks: rawValue || null };
    case "assignmentDueRule":
      return { assignmentDueRule: rawValue || null };
    case "email":
      return { email: rawValue || null };
    case "emailClient":
      return { emailClient: rawValue || null };
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
