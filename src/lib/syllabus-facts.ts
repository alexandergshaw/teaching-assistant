// Pure mapping from a course row (plus its institution's email/LMS URL) onto
// the facts shape generateCourseSyllabusAction expects. Extracted out of the
// Syllabus cell's "Generate" button so the mapping is unit-testable without a
// component harness. Mirrors the mapping steps.course-setup.materials.ts's
// starter-materials step builds for the same generator call.
import type { Course } from "./supabase/courses";

export interface SyllabusFacts {
  courseName: string;
  courseCode: string;
  term: string;
  description: string;
  dayTime: string;
  startDate: string;
  weeks: string;
  tests: string;
  textbook: string;
  email: string;
  lmsUrl: string;
  institution: string;
}

/** The two facts generateCourseSyllabusAction needs that are not on the
 * course row itself - resolved by the caller from the course's institution
 * fields ("email" and "lmsUrl"). */
export interface SyllabusFactsExtra {
  email: string;
  lmsUrl: string;
}

/** Maps a course row plus its resolved institution facts onto the shape
 * generateCourseSyllabusAction expects. Pure - no I/O. Null numerics (weeks,
 * tests) become "", never the string "null"; blank/null strings stay blank. */
export function buildSyllabusFactsFromCourse(course: Course, extra: SyllabusFactsExtra): SyllabusFacts {
  return {
    courseName: course.name,
    courseCode: course.courseCode ?? "",
    term: course.term ?? "",
    description: course.description ?? "",
    dayTime: course.dayTime ?? "",
    startDate: course.startDate ?? "",
    weeks: course.weeks != null ? String(course.weeks) : "",
    tests: course.tests != null ? String(course.tests) : "",
    textbook: course.textbook ?? "",
    email: extra.email,
    lmsUrl: extra.lmsUrl,
    institution: course.institution ?? "",
  };
}
