// Types for the owner's "course hub" -- one row per course that bundles its
// associated resources (GitHub codebase, linked finalized syllabus, textbook,
// Canvas URL). See src/lib/supabase/courses.ts for the module map.
//
// ZERO runtime code lives here on purpose: a careless value-import of `Course`
// from this file can never drag `./server`/`next/headers` into a client
// bundle, because there is nothing here to import but type declarations.

import type { CourseProject } from "@/lib/course-project";
import type { WeeklyChecklistItem } from "@/lib/weekly-checklist";
import type { RepoModulePairing } from "@/lib/repo-module-pairing";
import type { ExportModuleAdditions } from "@/lib/export-module-additions";

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
   * loaded through listCourses/getCourse (i.e. via toCourse in
   * courses.row.ts) always gets a concrete `string | null` - never
   * undefined. Callers should go through courseKindOrNull
   * (@/lib/course-kind) or `?? null` rather than
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
  /** The course-long project. Dedicated-writer-only - see courses.row.ts's
   * toRow comment. */
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
   * (i.e. via toCourse in courses.row.ts) always gets a concrete, coerced
   * array - never undefined. Callers that read this field should go through
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
   * always gets a concrete, coerced value (never undefined) via toCourse in
   * courses.row.ts. Callers should go through coerceGradesDue
   * (src/lib/grades-due.ts) or `?? null` rather than assuming presence.
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
   * toCourse in courses.row.ts) always gets a concrete `string | null` -
   * never undefined.
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
  /**
   * Durable repo-to-module associations
   * (docs/durable-repo-module-associations-acceptance-criteria.md): which
   * repo/branch is paired with this course, and which folder/file paths in
   * it are bound to which modules - `{ v: 1, repoRef, branch, associations:
   * [{ path, kind, moduleId, boundAt }] }`. Dedicated-writer-only (see
   * courses.row.ts's toRow comment) - written by updateCourseRepoPairing
   * behind setCourseRepoPairingAction, never by updateCourse.
   *
   * Optional (unlike courseProject just above, which is required and always
   * a concrete value) for the SAME reason courseKind/weeklyChecklist/
   * gradesDueDate are optional - see any of their own comments - so adding
   * this column does not force every pre-existing hand-built Course test
   * fixture across the codebase to grow a new property. Every course
   * actually loaded through listCourses/getCourse (i.e. via toCourse in
   * courses.row.ts) always gets a concrete, coerced value - never undefined.
   * Callers should go through coerceRepoModulePairing
   * (@/lib/repo-module-pairing) or `?? emptyRepoModulePairing()` rather than
   * assuming presence.
   */
  repoModulePairing?: RepoModulePairing;
  /**
   * Instructor-added items for modules on an export-only course
   * (docs/export-module-additions-acceptance-criteria.md): an addition
   * targets THE EXPORT, never Canvas - `{ v: 1, additions: [{ id, moduleRef,
   * title, type, body?, addedAt }] }`, `moduleRef` a CartridgeModule
   * identifier. Dedicated-writer-only (see courses.row.ts's toRow comment) -
   * written by updateCourseExportModuleAdditions behind
   * setCourseExportModuleAdditionsAction, never by updateCourse.
   *
   * Optional (unlike courseProject above, which is required and always a
   * concrete value) for the SAME reason courseKind/weeklyChecklist/
   * gradesDueDate/repoModulePairing are optional - see any of their own
   * comments - so adding this column does not force every pre-existing
   * hand-built Course test fixture across the codebase to grow a new
   * property. Every course actually loaded through listCourses/getCourse
   * (i.e. via toCourse in courses.row.ts) always gets a concrete, coerced
   * value - never undefined. Callers should go through
   * coerceExportModuleAdditions (@/lib/export-module-additions) or `?? emptyExportModuleAdditions()`
   * rather than assuming presence.
   */
  exportModuleAdditions?: ExportModuleAdditions;
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
