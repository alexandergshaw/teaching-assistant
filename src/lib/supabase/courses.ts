// Persistence for the owner's "course hub" -- one row per course that bundles
// its associated resources (GitHub codebase, linked finalized syllabus,
// textbook, Canvas URL). Reads/writes go through the Supabase service-role
// client behind requireOwner() (mirrors src/lib/supabase/syllabus-templates.ts);
// every query is explicitly scoped to the owning user_id.

import { createServiceClient } from "./server";
import type { Database, Json } from "./types";
import { coerceCourseProject, type CourseProject } from "@/lib/course-project";
import { coerceWeeklyChecklist, type WeeklyChecklistItem } from "@/lib/weekly-checklist";
import { coerceGradesDue, coerceGradesDueTime } from "@/lib/grades-due";
import { listTaskAttachmentStoragePathsForCourse, taskAttachmentStorageSweep } from "./course-task-attachments";

type CoursesTable = Database["public"]["Tables"]["course_hub"];

/** One codebase associated with a course. */
export interface CourseRepo {
  repo: string;
  branch: string | null;
}

/** A third-party integration linked to a course (e.g. Cengage) + its URL. */
export interface CourseIntegration {
  name: string;
  url: string | null;
}

/** A single material file (workflow-generated zip, LMS export, etc.). */
export interface CourseMaterialFile {
  name: string;
  path: string;
  size: number;
  addedAt: string;
  /** Storage object paths when the file is stored as chunked parts (large
   * exports above the per-object upload limit); absent for single objects. */
  parts?: string[];
  /** Set when THIS APP produced the file - a Course Build cartridge written
   *  through the saveCourseExportFile helper - rather than the instructor
   *  uploading it or pulling it from a live LMS. Absent on every instructor
   *  upload and on every file written before this field existed. Read-as-input
   *  sites MUST skip these: see docs/REGRESSION.md entry 196 AC1. */
  generated?: boolean;
}

/** A custom tile in a course card. */
export interface CourseCustomTile {
  id: string;
  label: string;
  value: string;
  /** layout group this tile lives in */
  groupId: string;
}

/** A per-student {student, canvasUserId, repo} mapping. */
export interface CourseStudentRepo {
  student: string;
  canvasUserId: string | null;
  repo: string;
  username?: string | null;
  email?: string | null;
}

/** A course and the resources bundled with it. */
export interface Course {
  id: string;
  name: string;
  courseCode: string | null;
  term: string | null;
  canvasUrl: string | null;
  repos: CourseRepo[];
  githubOrg: string | null;
  textbook: string | null;
  syllabusId: string | null;
  institution: string | null;
  integrations: CourseIntegration[];
  roster: string | null;
  notes: string | null;
  topics: string | null;
  csvName: string | null;
  csvData: string | null;
  rubricName: string | null;
  rubricData: string | null;
  startDate: string | null;
  description: string | null;
  weeks: number | null;
  tests: number | null;
  lms: string | null;
  dayTime: string | null;
  /** "async" | "sync" | null (unset - never defaulted). */
  modality: string | null;
  topicOutline: string | null;
  syllabusTemplateId: string | null;
  /**
   * The course's kind - "coding" | "applied" | null (unset - never
   * defaulted; see src/lib/course-kind.ts's own CourseKind vocabulary, the
   * SAME two values Course Build/Refresh/Kickoff already use for pedagogy,
   * never a third). AUTHORITATIVE when set: Course Build prefers this over
   * deriving a kind from whichever schedule source the run happens to use
   * (steps.course-schedule-from-source.ts's own precedence comment). Null on
   * every course tile that predates this column - that is the ONLY state
   * possible before it existed, so leaving it null (never backfilled) is
   * what keeps every existing course's effective kind unchanged.
   *
   * Optional (unlike its required scalar siblings modality/emailClient just
   * above and below, which are the same "nullable two-option vocabulary
   * column" shape) for the SAME reason weeklyChecklist/gradesDueDate further
   * down are optional - see either field's own comment - so adding this
   * column does not force every pre-existing hand-built `Course` test
   * fixture across the codebase (many inside src/lib/workflows/, outside
   * this feature's scope) to grow a new property. Every course actually
   * loaded through listCourses/getCourse (i.e. via toCourse below) always
   * gets a concrete `string | null` - never undefined. Callers should go
   * through courseKindOrNull (@/lib/course-kind) or `?? null` rather than
   * assuming presence.
   */
  courseKind?: string | null;
  endDate: string | null;
  /** Free-text break annotations (e.g. "Week 8 - Spring Break"). Display
   * only - never shifts week numbering (weekDeadline, resolveTileCurrentWeek,
   * courseProgressStatus, and the Castletop's week blocks are unaffected). */
  breaks: string | null;
  /** Encoded recurring rule "<day>|<HH:MM>", e.g. "sun|23:59". See
   * src/lib/assignment-due-rule.ts for the parse/format/describe helpers. */
  assignmentDueRule: string | null;
  email: string | null;
  /** "outlook" | "gmail" | "other" | null (unset - never defaulted). */
  emailClient: string | null;
  /** Minutes per class meeting (e.g. 75). Unset - never defaulted; asked per
   * class since it varies by course. Used to derive a meeting's end time
   * from parseDayTime's start time (registry-helpers.ts). */
  classLengthMinutes: number | null;
  /** The course-long project. Dedicated-writer-only - see the toRow comment. */
  courseProject: CourseProject;
  materialsFiles: CourseMaterialFile[];
  castletopFiles: CourseMaterialFile[];
  miscFiles: CourseMaterialFile[];
  exportFiles: CourseMaterialFile[];
  materialsZipName: string | null;
  materialsZipPath: string | null;
  materialsZipSize: number | null;
  customTiles: CourseCustomTile[];
  /** Built-in tile keys hidden on this course's card only. */
  hiddenTiles: string[];
  studentRepos: CourseStudentRepo[];
  /**
   * Optional (unlike its array-typed siblings above, which are required and
   * default to [] via toCourse) purely to avoid forcing every pre-existing
   * hand-built `Course` test fixture across the codebase (many inside
   * src/lib/workflows/, outside this feature's scope) to grow a new
   * property. Every course actually loaded through listCourses/getCourse
   * (i.e. via toCourse below) always gets a concrete, coerced array - never
   * undefined. Callers that read this field should go through
   * coerceWeeklyChecklist (or `?? []`) rather than assuming it is present.
   */
  weeklyChecklist?: WeeklyChecklistItem[];
  /**
   * ISO calendar date ("YYYY-MM-DD") the course's final grades are due, or
   * null when unset. Optional (unlike its required scalar siblings
   * startDate/endDate) for the same reason weeklyChecklist above is optional
   * - see that field's comment - so this doesn't force every pre-existing
   * hand-built Course test fixture across the codebase to grow a new
   * property. Every course actually loaded through listCourses/getCourse
   * always gets a concrete, coerced value (never undefined) via toCourse
   * below. Callers should go through coerceGradesDue (src/lib/grades-due.ts)
   * or `?? null` rather than assuming presence.
   */
  gradesDueDate?: string | null;
  /**
   * Optional 24-hour "HH:MM" clock time paired with gradesDueDate; always
   * null when gradesDueDate is null - a time with no date is meaningless
   * (mirrors the same guard in AssignmentDueCell/WeeklyChecklistCell). See
   * gradesDueDate's comment for why this is optional.
   */
  gradesDueTime?: string | null;
  /**
   * Instructor-authored biography, rendered VERBATIM into the "About Your
   * Instructor" guide document (generate-course-guides,
   * src/lib/workflows/registry/steps.course-guides.ts) - NO LLM anywhere in
   * this path; generating a bio from a bare name would fabricate
   * credentials. The instructor's own decision. Null/blank SKIPS that
   * document entirely rather than stubbing a placeholder - matches
   * Instructor Contact's own skip-when-no-email precedent. Does not
   * duplicate Instructor Contact, which owns the instructor's name, email,
   * and contact guidance - this field (and its three siblings below) is
   * biographical only.
   *
   * Optional (unlike its required scalar siblings elsewhere on this
   * interface) for the same "don't force every pre-existing hand-built
   * Course test fixture across the codebase to grow a property" reason
   * courseKind/weeklyChecklist/gradesDueDate give in their own comments.
   * Every course actually loaded through listCourses/getCourse (i.e. via
   * toCourse below) always gets a concrete `string | null` - never
   * undefined.
   */
  instructorBio?: string | null;
  /** Optional detail rendered alongside instructorBio when present - e.g.
   * "Associate Professor of Computer Science". The About Your Instructor
   * document is gated on instructorBio alone; this field alone never
   * produces a document. See instructorBio's own comment for why this is
   * optional on Course. */
  instructorTitle?: string | null;
  /** Optional detail rendered alongside instructorBio when present - e.g.
   * "Ph.D. in Computer Science, MIT". See instructorBio's own comment for
   * why this is optional on Course. */
  instructorCredentials?: string | null;
  /** Optional detail rendered alongside instructorBio when present - e.g.
   * "Department of Computer Science". See instructorBio's own comment for
   * why this is optional on Course. */
  instructorDepartment?: string | null;
  updatedAt: string;
}

/** The editable fields of a course (create/update). */
export interface CourseInput {
  name: string;
  courseCode?: string | null;
  term?: string | null;
  canvasUrl?: string | null;
  repos?: CourseRepo[];
  githubOrg?: string | null;
  textbook?: string | null;
  syllabusId?: string | null;
  institution?: string | null;
  integrations?: CourseIntegration[];
  roster?: string | null;
  notes?: string | null;
  topics?: string | null;
  csvName?: string | null;
  csvData?: string | null;
  rubricName?: string | null;
  rubricData?: string | null;
  startDate?: string | null;
  description?: string | null;
  weeks?: number | null;
  tests?: number | null;
  lms?: string | null;
  dayTime?: string | null;
  modality?: string | null;
  topicOutline?: string | null;
  syllabusTemplateId?: string | null;
  /** See Course.courseKind's own comment - "coding" | "applied" | null. */
  courseKind?: string | null;
  endDate?: string | null;
  breaks?: string | null;
  assignmentDueRule?: string | null;
  email?: string | null;
  emailClient?: string | null;
  classLengthMinutes?: number | null;
  customTiles?: CourseCustomTile[];
  hiddenTiles?: string[];
  studentRepos?: CourseStudentRepo[];
  weeklyChecklist?: WeeklyChecklistItem[];
  gradesDueDate?: string | null;
  gradesDueTime?: string | null;
  /** See Course.instructorBio's own comment - rendered verbatim, no LLM. */
  instructorBio?: string | null;
  instructorTitle?: string | null;
  instructorCredentials?: string | null;
  instructorDepartment?: string | null;
}

const COLUMNS =
  "id, name, course_code, term, canvas_url, repos, github_org, textbook, syllabus_id, institution, integrations, roster, notes, topics, csv_name, csv_data, rubric_name, rubric_data, start_date, description, weeks, tests, lms, day_time, modality, topic_outline, syllabus_template_id, course_kind, end_date, breaks, assignment_due_rule, email, email_client, class_length_minutes, course_project, materials_files, castletop_files, misc_files, export_files, materials_zip_name, materials_zip_path, materials_zip_size, custom_tiles, hidden_tiles, student_repos, weekly_checklist, grades_due_date, grades_due_time, instructor_bio, instructor_title, instructor_credentials, instructor_department, updated_at";

function table() {
  // Dedicated table name (not "courses") to avoid colliding with a pre-existing,
  // unrelated `courses` table in this database.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from("course_hub");
}

// Shape of a selected row (snake_case, from the DB).
interface CourseRow {
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

function toCourse(r: CourseRow): Course {
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
function toRow(input: CourseInput): Omit<CoursesTable["Insert"], "user_id" | "name"> & { name?: string } {
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

/** List the owner's courses, newest first. */
export async function listCourses(userId: string): Promise<Course[]> {
  const { data, error } = await table()
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[courses] Could not list courses:", error.message);
    return [];
  }
  return ((data ?? []) as CourseRow[]).map(toCourse);
}

/** Fetch one course by id, or null if not found. */
export async function getCourse(userId: string, id: string): Promise<Course | null> {
  const { data, error } = await table()
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[courses] Could not read course:", error.message);
    return null;
  }
  return data ? toCourse(data as CourseRow) : null;
}

/** Create a course. Returns the created row. */
export async function createCourse(userId: string, input: CourseInput): Promise<Course> {
  const row = { user_id: userId, ...toRow(input) } as CoursesTable["Insert"];
  const { data, error } = await table().insert(row).select(COLUMNS).single();
  if (error) {
    throw new Error(`Could not save the course: ${error.message}`);
  }
  return toCourse(data as CourseRow);
}

/** Update a course. Returns the updated row. */
export async function updateCourse(userId: string, id: string, input: CourseInput): Promise<Course> {
  const row = toRow(input) as CoursesTable["Update"];
  const { data, error } = await table()
    .update(row)
    .eq("user_id", userId)
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) {
    throw new Error(`Could not update the course: ${error.message}`);
  }
  return toCourse(data as CourseRow);
}

/**
 * Delete a course. Sweeps and removes this course's task-cell attachment
 * objects from Storage BEFORE the row delete (AC6 item 31,
 * docs/task-cell-attachments-acceptance-criteria.md): the FK cascade removes
 * the attachment ROWS automatically but never touches Storage, so without
 * this sweep every object would orphan the moment the row delete runs -
 * mirrors deleteInstitutionPageAndAttachments. A failed removal throws
 * instead of deleting the row, so the course survives for a retry (AC6 item
 * 32 - materials/misc/Castletop/LMS files share this same gap, unclosed).
 */
export async function deleteCourse(userId: string, id: string): Promise<void> {
  const supabase = createServiceClient();
  const storagePaths = await listTaskAttachmentStoragePathsForCourse(supabase, userId, id);
  await taskAttachmentStorageSweep.remove(supabase, storagePaths);
  const { error } = await table().delete().eq("user_id", userId).eq("id", id);
  if (error) {
    throw new Error(`Could not delete the course: ${error.message}`);
  }
}

/**
 * Count how many course tiles are filed under an institution acronym - used
 * by the institution-removal confirmation (AC1 of the "delete institutions"
 * feature, src/lib/institution-removal.ts) to state the real blast radius
 * before an acronym is hidden. Filters in JS rather than via .eq() at the DB
 * layer because course_hub.institution is NOT normalized on write the way
 * institution_pages.institution is (see toRow's plain clean() above, versus
 * knowledge-base.ts's normalizeInstitution) - the institution field is a
 * freeSolo Autocomplete (AddCourseForm.tsx), so a typed value could be any
 * casing, and an exact-match DB filter would silently undercount.
 */
export async function countCoursesByInstitution(userId: string, institution: string): Promise<number> {
  const code = institution.trim().toUpperCase();
  const { data, error } = await table().select("institution").eq("user_id", userId);
  if (error) {
    throw new Error(`Could not count course tiles: ${error.message}`);
  }
  return ((data ?? []) as Array<{ institution: string | null }>).filter(
    (r) => (r.institution ?? "").trim().toUpperCase() === code
  ).length;
}

/** Update a course's materials zip metadata. */
export async function updateCourseMaterials(
  userId: string,
  id: string,
  fields: {
    materialsZipName: string | null;
    materialsZipPath: string | null;
    materialsZipSize: number | null;
  }
): Promise<void> {
  const { error } = await table()
    .update({
      materials_zip_name: fields.materialsZipName,
      materials_zip_path: fields.materialsZipPath,
      materials_zip_size: fields.materialsZipSize,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course materials: ${error.message}`);
  }
}

/** Update a course's CSV metadata. */
export async function updateCourseCsv(
  userId: string,
  id: string,
  fields: {
    csvName: string | null;
    csvData: string | null;
  }
): Promise<void> {
  const { error } = await table()
    .update({
      csv_name: fields.csvName,
      csv_data: fields.csvData,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course schedule CSV: ${error.message}`);
  }
}

/** Update a course's rubric metadata. */
/**
 * The SOLE writer of the course_project column. It is kept out of CourseInput
 * and out of toRow precisely so that updateCourse can never clobber it; that
 * only holds while this stays the only path that writes it.
 */
export async function updateCourseProject(
  userId: string,
  id: string,
  project: CourseProject
): Promise<void> {
  const { error } = await table()
    .update({
      course_project: project as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course project: ${error.message}`);
  }
}

export async function updateCourseRubric(
  userId: string,
  id: string,
  fields: {
    rubricName: string | null;
    rubricData: string | null;
  }
): Promise<void> {
  const { error } = await table()
    .update({
      rubric_name: fields.rubricName,
      rubric_data: fields.rubricData,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course rubric: ${error.message}`);
  }
}

/** Append a material file to a course's materials list, deduplicating by name. Returns the storage path of any replaced entry, or null if none. */
export async function appendCourseMaterialFile(
  userId: string,
  id: string,
  file: CourseMaterialFile
): Promise<string | null> {
  const { data, error: selectError } = await table()
    .select("materials_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course materials: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).materials_files) ? (data as any).materials_files : [];
  let replacedPath: string | null = null;

  // Remove any existing entry with the same name, capturing its path.
  const filtered = current.filter((x: CourseMaterialFile) => {
    if (x && x.name === file.name) {
      replacedPath = x.path;
      return false;
    }
    return true;
  });

  // Append the new entry.
  const updated = [...filtered, file];

  const { error } = await table()
    .update({
      materials_files: updated,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course materials: ${error.message}`);
  }

  return replacedPath;
}

/** Remove a material file from a course's materials list by path. */
export async function removeCourseMaterialFile(
  userId: string,
  id: string,
  path: string
): Promise<void> {
  const { data, error: selectError } = await table()
    .select("materials_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course materials: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).materials_files) ? (data as any).materials_files : [];
  const filtered = current.filter((x: CourseMaterialFile) => x && x.path !== path);

  const { error } = await table()
    .update({
      materials_files: filtered,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course materials: ${error.message}`);
  }
}

/** Append a Castletop file to a course's Castletop list, deduplicating by name. Returns the storage path of any replaced entry, or null if none. */
export async function appendCourseCastletopFile(
  userId: string,
  id: string,
  file: CourseMaterialFile
): Promise<string | null> {
  const { data, error: selectError } = await table()
    .select("castletop_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course Castletop files: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).castletop_files) ? (data as any).castletop_files : [];
  let replacedPath: string | null = null;

  // Remove any existing entry with the same name, capturing its path.
  const filtered = current.filter((x: CourseMaterialFile) => {
    if (x && x.name === file.name) {
      replacedPath = x.path;
      return false;
    }
    return true;
  });

  // Append the new entry.
  const updated = [...filtered, file];

  const { error } = await table()
    .update({
      castletop_files: updated,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course Castletop files: ${error.message}`);
  }

  return replacedPath;
}

/** Remove a Castletop file from a course's Castletop list by path. */
export async function removeCourseCastletopFile(
  userId: string,
  id: string,
  path: string
): Promise<void> {
  const { data, error: selectError } = await table()
    .select("castletop_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course Castletop files: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).castletop_files) ? (data as any).castletop_files : [];
  const filtered = current.filter((x: CourseMaterialFile) => x && x.path !== path);

  const { error } = await table()
    .update({
      castletop_files: filtered,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course Castletop files: ${error.message}`);
  }
}

/** Append a misc file to a course's misc files list, deduplicating by name. Returns the storage path of any replaced entry, or null if none. */
export async function appendCourseMiscFile(
  userId: string,
  id: string,
  file: CourseMaterialFile
): Promise<string | null> {
  const { data, error: selectError } = await table()
    .select("misc_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course misc files: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).misc_files) ? (data as any).misc_files : [];
  let replacedPath: string | null = null;

  // Remove any existing entry with the same name, capturing its path.
  const filtered = current.filter((x: CourseMaterialFile) => {
    if (x && x.name === file.name) {
      replacedPath = x.path;
      return false;
    }
    return true;
  });

  // Append the new entry.
  const updated = [...filtered, file];

  const { error } = await table()
    .update({
      misc_files: updated,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course misc files: ${error.message}`);
  }

  return replacedPath;
}

/** Remove a misc file from a course's misc files list by path. */
export async function removeCourseMiscFile(
  userId: string,
  id: string,
  path: string
): Promise<void> {
  const { data, error: selectError } = await table()
    .select("misc_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course misc files: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).misc_files) ? (data as any).misc_files : [];
  const filtered = current.filter((x: CourseMaterialFile) => x && x.path !== path);

  const { error } = await table()
    .update({
      misc_files: filtered,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course misc files: ${error.message}`);
  }
}

/** Append an export file to a course's exports list, deduplicating by name. Returns the storage object paths of any replaced entry (its parts, or its single path). */
export async function appendCourseExportFile(
  userId: string,
  id: string,
  file: CourseMaterialFile
): Promise<string[]> {
  const { data, error: selectError } = await table()
    .select("export_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course exports: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).export_files) ? (data as any).export_files : [];
  const replacedPaths: string[] = [];

  // Remove every existing entry with the same name, capturing all object paths
  // (legacy rows may hold duplicates).
  const filtered = current.filter((x: CourseMaterialFile) => {
    if (x && x.name === file.name) {
      replacedPaths.push(...(Array.isArray(x.parts) && x.parts.length > 0 ? x.parts : [x.path]));
      return false;
    }
    return true;
  });

  // Append the new entry.
  const updated = [...filtered, file];

  const { error } = await table()
    .update({
      export_files: updated,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course exports: ${error.message}`);
  }

  return replacedPaths;
}

/** Remove an export file from a course's exports list by path. */
export async function removeCourseExportFile(
  userId: string,
  id: string,
  path: string
): Promise<void> {
  const { data, error: selectError } = await table()
    .select("export_files")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (selectError) {
    throw new Error(`Could not read the course exports: ${selectError.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current = Array.isArray((data as any).export_files) ? (data as any).export_files : [];
  const filtered = current.filter((x: CourseMaterialFile) => x && x.path !== path);

  const { error } = await table()
    .update({
      export_files: filtered,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(`Could not update the course exports: ${error.message}`);
  }
}
