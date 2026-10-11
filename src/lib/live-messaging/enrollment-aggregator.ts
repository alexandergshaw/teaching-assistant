/**
 * L2 - enrollment-row aggregator (LIVE-LMS-STUDENT-MESSAGING W1,
 * docs/live-lms-student-messaging-scope.md sections 2, 5 and 6).
 *
 * Fans out across one institution's courses and assembles table rows where
 * EACH ROW IS A (student, course, section) ENROLLMENT: a student in two courses
 * is two rows; a student in two sections of one course is two rows.
 *
 * Orchestration only. The L1 readers are INJECTED (EnrollmentReaders), so the
 * tests mock them and the production caller (W3) binds the real Canvas readers:
 *   listCourses -> listActiveTeacherCourses/listCoursesByTerm (needs termName)
 *   listRoster -> listings.listCourseRoster
 *   listGrades -> listings.listStudentGradeSummaries
 *   listMissing -> listCourseSubmissionGrid rows reduced by countMissingByUser
 *   listSections -> canvas/sections.listCourseSectionAssignments
 *
 * PER-COURSE ERROR PARTITION. One failing course never aborts the aggregation
 * or blanks the others:
 *   - roster failure          -> the course is "failed" and yields no rows;
 *   - grades/missing/sections -> the course is "partial": its rows are still
 *     emitted with null for the field(s) that could not be read, and the
 *     failed reader(s) are named in `degraded`.
 * Every course appears exactly once in `courses` with its status so a partition
 * failure is visible rather than silent. Error text is carried as the thrown
 * message only; callers scrub before logging (no student data is in it).
 */

import { mapWithConcurrency } from "../canvas-modules/fetch-helpers";
import { parseCanvasName } from "./template-substitution";

export interface LiveCourse {
  readonly id: string;
  readonly name: string;
  readonly termName: string | null;
}

export interface LiveRosterEntry {
  readonly id: string;
  readonly name: string;
  readonly sortableName: string;
}

export interface LiveGradeEntry {
  readonly userId: string;
  readonly currentScore: number | null;
}

export interface LiveSectionEntry {
  readonly userId: string;
  readonly sectionId: string;
  readonly sectionName: string;
}

/** Missing-assignment count per Canvas user id (string). */
export type MissingCounts = Readonly<Record<string, number>>;

export interface EnrollmentReaders {
  listCourses(institution: string): Promise<LiveCourse[]>;
  listRoster(institution: string, courseId: string): Promise<LiveRosterEntry[]>;
  listGrades(institution: string, courseId: string): Promise<LiveGradeEntry[]>;
  listMissing(institution: string, courseId: string): Promise<MissingCounts>;
  listSections(institution: string, courseId: string): Promise<LiveSectionEntry[]>;
}

export interface EnrollmentRow {
  /** Stable selection key: institution:course:section:user. */
  readonly key: string;
  readonly institution: string;
  readonly courseId: string;
  readonly course: string;
  readonly term: string | null;
  readonly sectionId: string | null;
  /** "" when the enrollment's section could not be read or named. */
  readonly section: string;
  readonly userId: string;
  readonly name: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Canvas current_score, or null when absent or the grade read failed. */
  readonly grade: number | null;
  /** Canvas-reported missing count, or null when the read failed. */
  readonly missingCount: number | null;
}

export type CourseStatus =
  | { readonly courseId: string; readonly course: string; readonly kind: "ok" }
  | {
      readonly courseId: string;
      readonly course: string;
      readonly kind: "partial";
      readonly degraded: readonly ("grades" | "missing" | "sections")[];
      readonly errors: readonly string[];
    }
  | { readonly courseId: string; readonly course: string; readonly kind: "failed"; readonly error: string };

export interface AggregateResult {
  readonly rows: readonly EnrollmentRow[];
  readonly courses: readonly CourseStatus[];
  /** Set when the course list itself could not be read (no courses, no rows). */
  readonly listError: string | null;
}

const DEFAULT_COURSE_CONCURRENCY = 3;

/** Counts Canvas's own `missing === true` per user id. Excused work is not
 * re-derived: `missing` is read verbatim, as submissions-grid.ts requires. */
export function countMissingByUser(
  rows: ReadonlyArray<{ readonly userId: number | string; readonly missing: boolean }>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const id = String(r.userId);
    counts[id] = (counts[id] ?? 0) + (r.missing === true ? 1 : 0);
  }
  return counts;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await p };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

async function aggregateCourse(
  readers: EnrollmentReaders,
  institution: string,
  course: LiveCourse
): Promise<{ rows: EnrollmentRow[]; status: CourseStatus }> {
  const [roster, grades, missing, sections] = await Promise.all([
    settle(readers.listRoster(institution, course.id)),
    settle(readers.listGrades(institution, course.id)),
    settle(readers.listMissing(institution, course.id)),
    settle(readers.listSections(institution, course.id)),
  ]);

  if (!roster.ok) {
    return { rows: [], status: { courseId: course.id, course: course.name, kind: "failed", error: roster.error } };
  }

  const degraded: ("grades" | "missing" | "sections")[] = [];
  const errors: string[] = [];
  if (!grades.ok) {
    degraded.push("grades");
    errors.push(grades.error);
  }
  if (!missing.ok) {
    degraded.push("missing");
    errors.push(missing.error);
  }
  if (!sections.ok) {
    degraded.push("sections");
    errors.push(sections.error);
  }

  const gradeByUser = new Map<string, number | null>();
  if (grades.ok) for (const g of grades.value) gradeByUser.set(g.userId, g.currentScore);
  const sectionsByUser = new Map<string, LiveSectionEntry[]>();
  if (sections.ok) {
    for (const s of sections.value) {
      const list = sectionsByUser.get(s.userId) ?? [];
      list.push(s);
      sectionsByUser.set(s.userId, list);
    }
  }

  const rows: EnrollmentRow[] = [];
  for (const student of roster.value) {
    const { firstName, lastName } = parseCanvasName(student.sortableName, student.name);
    const missingCount = missing.ok ? (missing.value[student.id] ?? 0) : null;
    const grade = grades.ok ? (gradeByUser.get(student.id) ?? null) : null;
    const studentSections = sectionsByUser.get(student.id);
    const base = {
      institution,
      courseId: course.id,
      course: course.name,
      term: course.termName,
      userId: student.id,
      name: student.name,
      firstName,
      lastName,
      grade,
      missingCount,
    };
    if (studentSections && studentSections.length > 0) {
      for (const sec of studentSections) {
        rows.push({
          ...base,
          key: `${institution}:${course.id}:${sec.sectionId}:${student.id}`,
          sectionId: sec.sectionId,
          section: sec.sectionName,
        });
      }
    } else {
      rows.push({ ...base, key: `${institution}:${course.id}::${student.id}`, sectionId: null, section: "" });
    }
  }

  const status: CourseStatus =
    degraded.length > 0
      ? { courseId: course.id, course: course.name, kind: "partial", degraded, errors }
      : { courseId: course.id, course: course.name, kind: "ok" };
  return { rows, status };
}

/**
 * Aggregates one institution's enrollments. Never throws for a reader failure:
 * a course-list failure returns { rows: [], courses: [], listError }, and a
 * per-course failure is partitioned as described in the file header.
 */
export async function aggregateEnrollments(
  readers: EnrollmentReaders,
  institution: string,
  options: { concurrency?: number } = {}
): Promise<AggregateResult> {
  const listed = await settle(readers.listCourses(institution));
  if (!listed.ok) return { rows: [], courses: [], listError: listed.error };

  const results = await mapWithConcurrency(
    [...listed.value],
    options.concurrency ?? DEFAULT_COURSE_CONCURRENCY,
    async (course) => {
      try {
        return await aggregateCourse(readers, institution, course);
      } catch (err) {
        // Defensive: aggregateCourse settles every reader, but a bug in the
        // mapping itself must still not abort the other courses.
        return {
          rows: [] as EnrollmentRow[],
          status: { courseId: course.id, course: course.name, kind: "failed", error: messageOf(err) } as CourseStatus,
        };
      }
    }
  );

  return {
    rows: results.flatMap((r) => r.rows),
    courses: results.map((r) => r.status),
    listError: null,
  };
}
