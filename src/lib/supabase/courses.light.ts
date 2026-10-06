// The LIGHT list query behind the Courses table's first paint. A sibling of
// courses.ts (not part of its public barrel, so the barrel's frozen runtime
// export set is untouched): the shared `listCourses` there keeps selecting
// every column, because castletop, the cohort guard, the ai-chat route and
// others depend on full rows. This module selects only the columns the table
// needs to paint, filter and sort, and returns `Course`-shaped rows whose
// HEAVY fields hold the same empty values `toCourse` already coerces a null
// column to. The full rows are fetched separately and merged in by id
// (src/lib/courses-hydration.ts).

import { table, toCourse, type CourseRow } from "./courses.row";
import type { Course } from "./courses.types";

/** Columns the table paints and sorts from. Frozen by courses.light.test.ts. */
export const LIGHT_LIST_COLUMNS =
  "id, name, course_code, term, canvas_url, repos, github_org, textbook, syllabus_id, institution, integrations, topics, csv_name, rubric_name, start_date, weeks, tests, lms, day_time, modality, syllabus_template_id, course_kind, end_date, breaks, assignment_due_rule, email, email_client, class_length_minutes, materials_zip_name, materials_zip_path, materials_zip_size, hidden_tiles, grades_due_date, grades_due_time, instructor_title, instructor_credentials, instructor_department, updated_at";

/** Content-bearing columns deliberately NOT selected by the light query. */
export const HEAVY_ROW_COLUMNS = [
  "roster",
  "notes",
  "csv_data",
  "rubric_data",
  "description",
  "topic_outline",
  "course_project",
  "materials_files",
  "castletop_files",
  "misc_files",
  "export_files",
  "custom_tiles",
  "student_repos",
  "weekly_checklist",
  "instructor_bio",
  "repo_module_pairing",
  "export_module_additions",
] as const;

export type HeavyRowColumn = (typeof HEAVY_ROW_COLUMNS)[number];
export type LightCourseRow = Omit<CourseRow, HeavyRowColumn>;

/** Map a light row to a `Course`, heavy fields set to their null defaults. */
export function toCourseLight(r: LightCourseRow): Course {
  const row: CourseRow = {
    ...r,
    roster: null,
    notes: null,
    csv_data: null,
    rubric_data: null,
    description: null,
    topic_outline: null,
    course_project: null,
    materials_files: null,
    castletop_files: null,
    misc_files: null,
    export_files: null,
    custom_tiles: null,
    student_repos: null,
    weekly_checklist: null,
    instructor_bio: null,
    repo_module_pairing: null,
    export_module_additions: null,
  };
  return toCourse(row);
}

/** List the owner's courses, newest first, WITHOUT the heavy content columns. */
export async function listCoursesLight(userId: string): Promise<Course[]> {
  const { data, error } = await table()
    .select(LIGHT_LIST_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[courses] Could not list courses (light):", error.message);
    return [];
  }
  return ((data ?? []) as LightCourseRow[]).map(toCourseLight);
}
