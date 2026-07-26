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
 * tests) become "", never the string "null"; blank/null strings stay blank.
 * `email`/`lmsUrl` are trimmed here so every caller gets the same behavior
 * without remembering to trim institution values itself - config fields
 * routinely carry trailing whitespace (see canvas-core.ts's token trim for
 * the same reason). Trimming is idempotent, so a caller that already trims
 * before calling this is unaffected. */
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
    email: extra.email.trim(),
    lmsUrl: extra.lmsUrl.trim(),
    institution: course.institution ?? "",
  };
}

export interface SyllabusTemplateResolution {
  templateId: string;
  source: "course" | "institution" | "none";
}

/** Resolve which syllabus template a course should use: the per-course
 * column first, then the institution's "syllabusTemplate" field. Both
 * candidates are trimmed; a whitespace-only course value falls through to
 * the institution field rather than winning. Returns templateId "" and
 * source "none" when neither is set. Pure - no I/O.
 *
 * The single home for this precedence rule - shared by the starter-materials
 * step (steps.course-setup.materials.ts) and the generate-syllabus step
 * (steps.syllabus.ts) so it cannot drift between the two call sites. */
export function resolveSyllabusTemplateId(
  courseTemplateId: string | null | undefined,
  institutionFields: Array<{ id: string; value: string }>
): SyllabusTemplateResolution {
  const course = (courseTemplateId ?? "").trim();
  if (course) {
    return { templateId: course, source: "course" };
  }

  const institution = (
    institutionFields.find((f) => f.id === "syllabusTemplate")?.value ?? ""
  ).trim();
  if (institution) {
    return { templateId: institution, source: "institution" };
  }

  return { templateId: "", source: "none" };
}
