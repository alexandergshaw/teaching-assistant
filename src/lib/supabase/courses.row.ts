// Row layer for the owner's "course hub" table: the DB row shape, the
// snake_case column list, and the mappers between it and the app-facing
// `Course`/`CourseInput` types. See src/lib/supabase/courses.ts for the
// module map.
//
// `COLUMNS`, `CourseRow`, `toCourse` and `toRow` are parallel column lists
// that must always be edited together (docs/REGRESSION.md entry 225 check 3
// already treats them as one checklist) - add a column to one, add it to all
// four. `table` and `COLUMNS` are exported so courses.ts and courses.files.ts
// can use them, but they - along with `toCourse`/`toRow` - are NOT re-exported
// from the barrel (src/lib/supabase/courses.ts): callers get `Course` values
// through the CRUD functions, never the row shape directly.

import { createServiceClient } from "./server";
import type { Database, Json } from "./types";
import { coerceCourseProject } from "@/lib/course-project";
import { coerceWeeklyChecklist } from "@/lib/weekly-checklist";
import { coerceGradesDue, coerceGradesDueTime } from "@/lib/grades-due";
import type { Course, CourseInput } from "./courses.types";

export type CoursesTable = Database["public"]["Tables"]["course_hub"];

export const COLUMNS =
  "id, name, course_code, term, canvas_url, repos, github_org, textbook, syllabus_id, institution, integrations, roster, notes, topics, csv_name, csv_data, rubric_name, rubric_data, start_date, description, weeks, tests, lms, day_time, modality, topic_outline, syllabus_template_id, course_kind, end_date, breaks, assignment_due_rule, email, email_client, class_length_minutes, course_project, materials_files, castletop_files, misc_files, export_files, materials_zip_name, materials_zip_path, materials_zip_size, custom_tiles, hidden_tiles, student_repos, weekly_checklist, grades_due_date, grades_due_time, instructor_bio, instructor_title, instructor_credentials, instructor_department, updated_at";

export function table() {
  // Dedicated table name (not "courses") to avoid colliding with a pre-existing,
  // unrelated `courses` table in this database.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from("course_hub");
}

// Shape of a selected row (snake_case, from the DB).
export interface CourseRow {
  id: string;
  name: string;
  course_code: string | null;
  term: string | null;
  canvas_url: string | null;
  repos: Array<{ repo: string; branch: string | null }> | null;
  github_org: string | null;
  textbook: string | null;
  syllabus_id: string | null;
  institution: string | null;
  integrations: Array<{ name: string; url: string | null }> | null;
  roster: string | null;
  notes: string | null;
  topics: string | null;
  csv_name: string | null;
  csv_data: string | null;
  rubric_name: string | null;
  rubric_data: string | null;
  start_date: string | null;
  description: string | null;
  weeks: number | null;
  tests: number | null;
  lms: string | null;
  day_time: string | null;
  modality: string | null;
  topic_outline: string | null;
  syllabus_template_id: string | null;
  course_kind: string | null;
  end_date: string | null;
  breaks: string | null;
  assignment_due_rule: string | null;
  email: string | null;
  email_client: string | null;
  class_length_minutes: number | null;
  materials_files: Array<{ name: string; path: string; size: number; addedAt: string; parts?: string[] }> | null;
  castletop_files: Array<{ name: string; path: string; size: number; addedAt: string; parts?: string[] }> | null;
  misc_files: Array<{ name: string; path: string; size: number; addedAt: string; parts?: string[] }> | null;
  course_project: Json | null;
  export_files: Array<{ name: string; path: string; size: number; addedAt: string; parts?: string[] }> | null;
  materials_zip_name: string | null;
  materials_zip_path: string | null;
  materials_zip_size: number | null;
  custom_tiles: Array<{ id: string; label: string; value: string; groupId: string }> | null;
  hidden_tiles: string[] | null;
  student_repos: Array<{ student: string; canvasUserId: string | null; repo: string; username?: string | null; email?: string | null }> | null;
  weekly_checklist: Json | null;
  grades_due_date: string | null;
  grades_due_time: string | null;
  instructor_bio: string | null;
  instructor_title: string | null;
  instructor_credentials: string | null;
  instructor_department: string | null;
  updated_at: string;
}

export function toCourse(r: CourseRow): Course {
  const gradesDue = coerceGradesDue(r.grades_due_date, r.grades_due_time);
  return {
    id: r.id,
    name: r.name,
    courseCode: r.course_code,
    term: r.term,
    canvasUrl: r.canvas_url,
    repos: Array.isArray(r.repos) ? r.repos.filter((x) => x && x.repo) : [],
    githubOrg: r.github_org,
    textbook: r.textbook,
    syllabusId: r.syllabus_id,
    institution: r.institution,
    integrations: Array.isArray(r.integrations) ? r.integrations.filter((x) => x && x.name) : [],
    roster: r.roster,
    notes: r.notes,
    topics: r.topics,
    csvName: r.csv_name,
    csvData: r.csv_data,
    rubricName: r.rubric_name,
    rubricData: r.rubric_data,
    startDate: r.start_date,
    description: r.description,
    weeks: r.weeks,
    tests: r.tests,
    lms: r.lms,
    dayTime: r.day_time,
    modality: r.modality,
    topicOutline: r.topic_outline,
    syllabusTemplateId: r.syllabus_template_id,
    courseKind: r.course_kind,
    endDate: r.end_date,
    breaks: r.breaks,
    assignmentDueRule: r.assignment_due_rule,
    email: r.email,
    emailClient: r.email_client,
    classLengthMinutes: r.class_length_minutes,
    courseProject: coerceCourseProject(r.course_project),
    materialsFiles: Array.isArray(r.materials_files) ? r.materials_files.filter((x) => x && x.path && x.name) : [],
    castletopFiles: Array.isArray(r.castletop_files) ? r.castletop_files.filter((x) => x && x.path && x.name) : [],
    miscFiles: Array.isArray(r.misc_files) ? r.misc_files.filter((x) => x && x.path && x.name) : [],
    exportFiles: Array.isArray(r.export_files) ? r.export_files.filter((x) => x && x.path && x.name) : [],
    materialsZipName: r.materials_zip_name,
    materialsZipPath: r.materials_zip_path,
    materialsZipSize: r.materials_zip_size,
    customTiles: Array.isArray(r.custom_tiles) ? r.custom_tiles.filter((x) => x && typeof x.id === "string" && typeof x.label === "string") : [],
    hiddenTiles: Array.isArray(r.hidden_tiles) ? r.hidden_tiles.filter((x) => typeof x === "string") : [],
    studentRepos: Array.isArray(r.student_repos)
      ? (r.student_repos as unknown[])
          .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
          .map((t) => ({
            student: typeof t.student === "string" ? t.student : "",
            canvasUserId: typeof t.canvasUserId === "string" ? t.canvasUserId : null,
            repo: typeof t.repo === "string" ? t.repo : "",
            username: typeof t.username === "string" ? t.username : null,
            email: typeof t.email === "string" ? t.email : null,
          }))
      : [],
    weeklyChecklist: coerceWeeklyChecklist(r.weekly_checklist),
    gradesDueDate: gradesDue.date,
    gradesDueTime: gradesDue.time,
    instructorBio: r.instructor_bio,
    instructorTitle: r.instructor_title,
    instructorCredentials: r.instructor_credentials,
    instructorDepartment: r.instructor_department,
    updatedAt: r.updated_at,
  };
}

// Map the app-facing input onto the DB columns, coercing "" to null and
// dropping empty repo rows.
export function toRow(input: CourseInput): Omit<CoursesTable["Insert"], "user_id" | "name"> & { name?: string } {
  const clean = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
  };
  const repos = (input.repos ?? [])
    .map((r) => ({ repo: (r.repo ?? "").trim(), branch: (r.branch ?? "").trim() || null }))
    .filter((r) => r.repo !== "");
  const integrations = (input.integrations ?? [])
    .map((i) => ({ name: (i.name ?? "").trim(), url: (i.url ?? "").trim() || null }))
    .filter((i) => i.name !== "" || i.url !== null);
  return {
    name: input.name.trim(),
    course_code: clean(input.courseCode),
    term: clean(input.term),
    canvas_url: clean(input.canvasUrl),
    repos,
    github_org: clean(input.githubOrg),
    textbook: clean(input.textbook),
    syllabus_id: clean(input.syllabusId),
    institution: clean(input.institution),
    integrations,
    roster: clean(input.roster),
    notes: clean(input.notes),
    topics: clean(input.topics),
    csv_name: clean(input.csvName),
    csv_data: clean(input.csvData),
    rubric_name: clean(input.rubricName),
    rubric_data: clean(input.rubricData),
    start_date: clean(input.startDate),
    description: clean(input.description),
    weeks: typeof input.weeks === "number" && Number.isFinite(input.weeks) ? input.weeks : null,
    tests: typeof input.tests === "number" && Number.isFinite(input.tests) ? input.tests : null,
    lms: clean(input.lms),
    day_time: clean(input.dayTime),
    modality: clean(input.modality),
    topic_outline: clean(input.topicOutline),
    syllabus_template_id: clean(input.syllabusTemplateId),
    // Not re-validated against the "coding"/"applied" vocabulary here - same
    // as modality above (never checked against its own "async"/"sync"
    // options at this layer either): the UI select only ever offers those
    // two options plus "Not set", and every reader treats anything else as
    // unset via courseKindOrNull (@/lib/course-kind) rather than trusting
    // this column blindly.
    course_kind: clean(input.courseKind),
    end_date: clean(input.endDate),
    breaks: clean(input.breaks),
    assignment_due_rule: clean(input.assignmentDueRule),
    email: clean(input.email),
    email_client: clean(input.emailClient),
    class_length_minutes:
      typeof input.classLengthMinutes === "number" && Number.isFinite(input.classLengthMinutes)
        ? input.classLengthMinutes
        : null,
    custom_tiles: Array.isArray(input.customTiles) ? (input.customTiles as unknown as Json) : undefined,
    hidden_tiles: Array.isArray(input.hiddenTiles) ? (input.hiddenTiles as unknown as Json) : undefined,
    student_repos: Array.isArray(input.studentRepos)
      ? (input.studentRepos as unknown as Json)
      : undefined,
    // Re-coerced (not just cast) before writing, unlike the plain pass-through
    // siblings above - the nested deadline shape makes it cheap to also
    // enforce the item cap/label cap here as a second line of defense, not
    // just on read.
    weekly_checklist: Array.isArray(input.weeklyChecklist)
      ? (coerceWeeklyChecklist(input.weeklyChecklist) as unknown as Json)
      : undefined,
    // gradesDueDate is optional on CourseInput for the same reason
    // weeklyChecklist is above: undefined (the key never mentioned by this
    // caller) must leave both columns untouched rather than wiping them, so
    // a caller that never mentions grades-due (most workflow code building a
    // partial CourseInput by hand) can never accidentally clear it. Once the
    // caller DOES mention a date (including "" to clear it), grades_due_time
    // is re-coerced from scratch rather than passed through - this is what
    // enforces "a time with no date is meaningless" (see grades-due.ts) at
    // the write boundary too, not just on read: clearing the date always
    // clears the time with it, and a stray time can never persist without
    // its date even if a caller's patch sent one anyway.
    grades_due_date: input.gradesDueDate !== undefined ? clean(input.gradesDueDate) : undefined,
    grades_due_time:
      input.gradesDueDate !== undefined
        ? (clean(input.gradesDueDate) ? coerceGradesDueTime(input.gradesDueTime) : null)
        : undefined,
    // Plain scalar columns, same shape (and same "must always be carried by
    // the caller" hazard) as course_kind above - see that field's comment.
    // Not re-validated at this layer either; the About Your Instructor
    // document (steps.course-guides.ts) treats a blank/null instructor_bio
    // as "skip", never a bad-data error.
    instructor_bio: clean(input.instructorBio),
    instructor_title: clean(input.instructorTitle),
    instructor_credentials: clean(input.instructorCredentials),
    instructor_department: clean(input.instructorDepartment),
    // Omit materials_zip_* fields: inserts use NULL defaults, updates preserve existing
    // values. updateCourseMaterials is the sole writer of these columns.
    // Omit course_project: dedicated writer only (updateCourseProject). A
    // project is a generated artifact, not a form field, so keeping it out of
    // CourseInput and out of this object is what stops updateCourse's
    // full-input round-trip from wiping it on every unrelated save. Note this
    // is the INVERSE of the rule for plain scalar columns, which must appear
    // in both courseToInput and courseToInputPayload or they get wiped.
    // Omit materials_files, castletop_files, misc_files, and export_files: dedicated
    // writers only (appendCourseMaterialFile, removeCourseMaterialFile,
    // appendCourseCastletopFile, removeCourseCastletopFile, appendCourseMiscFile,
    // removeCourseMiscFile, appendCourseExportFile, removeCourseExportFile). This is
    // what stops updateCourse from clobbering these columns on every unrelated save -
    // do not add them here or to CourseInput.
    updated_at: new Date().toISOString(),
  };
}
