// Shared labels for the Courses table's columns and its two "raw code plus a
// small option list" scalar fields (modality, emailClient) - the same
// value/label + label-resolver shape src/lib/course-lms-options.ts already
// uses for `lms` (COURSE_LMS_OPTIONS/courseLmsLabel). Extracted here so the
// column-header labels (CoursesTable.tsx), the cell's own select options
// (CourseRow.tsx), and the copy/read layer (src/lib/cell-copy.ts) all read
// the exact same vocabulary instead of separate hand-typed copies that can
// drift apart. `lms` and `courseKind` already have their own shared sources
// (course-lms-options.ts / course-kind.ts respectively) and are deliberately
// NOT restated here.
//
// Pure - no I/O, no "use client" (this is consumed by both a client
// component and a plain data/logic module).

import type { ColumnId } from "./courses-table-helpers";

/** Every menu-bearing cell in the table: the sticky Name cell plus every
 * data column. */
export type CellColumnId = ColumnId | "name";

// Copied VERBATIM (including its per-entry comments) from CoursesTable.tsx's
// former own COLUMN_LABELS, plus a `name` entry that map never had
// (COLUMN_LABELS was typed Record<ColumnId, string> and Name is the one
// column that is never toggleable, so it was never part of that map - see
// this file's own CellColumnId, which is ColumnId plus "name"). That local
// copy has already been removed from CoursesTable.tsx in this same change -
// it now imports CELL_COLUMN_LABELS from here like every other consumer.
export const CELL_COLUMN_LABELS: Record<CellColumnId, string> = {
  name: "Name",
  institution: "Institution",
  modality: "Modality",
  startDate: "Start date",
  dayTime: "Day/Time",
  weeks: "Weeks",
  tests: "Tests",
  lms: "LMS",
  githubOrg: "Organization",
  syllabusId: "Syllabus",
  textbook: "Textbook",
  repos: "Codebases",
  roster: "Roster",
  studentRepos: "Student repos",
  integrations: "Integrations",
  description: "Description",
  courseKind: "Course type",
  scheduleCsv: "Schedule of Topics",
  rubric: "Rubric",
  materials: "Materials",
  lmsExports: "LMS Exports",
  topicOutline: "Topic Outline",
  castletop: "Castletop",
  syllabusTemplate: "Syllabus template",
  endDate: "End date",
  gradesDue: "Grades due",
  breaks: "Breaks",
  assignmentDue: "Assignment due",
  email: "Email",
  emailClient: "Email client",
  // C: the instructor's own profile, rendered verbatim into the "About Your
  // Instructor" guide document (generate-course-guides) - see
  // src/lib/supabase/courses.ts's Course.instructorBio comment.
  instructorTitle: "Instructor title",
  instructorDepartment: "Instructor department",
  instructorCredentials: "Instructor credentials",
  instructorBio: "Instructor bio",
  classLength: "Class length",
  miscFiles: "Misc files",
  courseProject: "Course project",
  // AC4/AC5: relabeled from "Weekly Checklist" - the instructor's ask was a
  // user-facing string change only. The ColumnId key itself ("weeklyChecklist"),
  // every internal symbol, and the weekly_checklist DB column all deliberately
  // keep the word "weekly" - see weekly-checklist.ts's own AC7 naming note for
  // why renaming those buys nothing and costs a real migration/rename risk.
  weeklyChecklist: "Checklist",
};

export interface CourseSelectOption {
  value: string;
  label: string;
}

// Matches CourseRow.tsx's own inline `modality` EditableCell options
// exactly, including the leading "Not set" entry - see this file's own
// module comment for why this list is extracted here rather than restated.
export const MODALITY_OPTIONS: readonly CourseSelectOption[] = [
  { value: "", label: "Not set" },
  { value: "async", label: "Asynchronous" },
  { value: "sync", label: "Synchronous" },
];

// Matches CourseRow.tsx's own inline `emailClient` EditableCell options
// exactly, including the leading "Not set" entry.
export const EMAIL_CLIENT_OPTIONS: readonly CourseSelectOption[] = [
  { value: "", label: "Not set" },
  { value: "outlook", label: "Outlook" },
  { value: "gmail", label: "Gmail" },
  { value: "other", label: "Other" },
];

// The "" -> "Not set" entries above label the SELECT's own empty option, not
// an unset value read back elsewhere - excluded here so modalityLabel/
// emailClientLabel never resolve an unset value to the string "Not set" (see
// their own doc comments).
const MODALITY_LABEL_BY_VALUE: ReadonlyMap<string, string> = new Map(
  MODALITY_OPTIONS.filter((opt) => opt.value !== "").map((opt) => [opt.value, opt.label])
);

const EMAIL_CLIENT_LABEL_BY_VALUE: ReadonlyMap<string, string> = new Map(
  EMAIL_CLIENT_OPTIONS.filter((opt) => opt.value !== "").map((opt) => [opt.value, opt.label])
);

/**
 * Resolves a stored `modality` value to its display label. "" / null /
 * undefined -> "" (never MODALITY_OPTIONS' own "Not set" placeholder text -
 * that string labels the select's empty option, not an unset value). Falls
 * back to the raw value unchanged for anything not in MODALITY_OPTIONS - same
 * fallback rule as courseLmsLabel (@/lib/course-lms-options), since this
 * column is also free-form-tolerant (a course.modality column is not
 * DB-constrained to just these two values).
 */
export function modalityLabel(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return "";
  return MODALITY_LABEL_BY_VALUE.get(trimmed) ?? trimmed;
}

/** Resolves a stored `emailClient` value to its display label. Same
 * "" / null / undefined -> "", unrecognized-falls-back-to-raw rule as
 * modalityLabel above. */
export function emailClientLabel(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return "";
  return EMAIL_CLIENT_LABEL_BY_VALUE.get(trimmed) ?? trimmed;
}
