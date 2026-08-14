// Pure display-shaping helpers for InSessionBanner.tsx. Kept in their own
// module rather than added to courses-in-session.ts: that module's "which
// courses count as in session" logic and its 15 tests are frozen - a
// decision recorded HERE (courses-in-session.ts's own header comment makes
// no such claim about itself; verified by reading it) - so any NEW pure
// logic the banner needs - which course a focus-target id actually resolves
// to - lives here instead of risking a diff against that file.
//
// This module used to also own a display cap (limitDisplayedCourses,
// MAX_VISIBLE_IN_SESSION_COURSES) for the chip row. The banner no longer
// caps anything - it renders every course and every upcoming date inside a
// single horizontally-scrolling strip instead of truncating past a fixed
// count (see InSessionBanner.tsx) - so that helper was deleted rather than
// left as dead exported code with no caller.

/**
 * Resolves which (if any) of `courses` a focus-target id actually names -
 * the single source of truth for turning a possibly-stale id (a banner
 * click's course, or a cross-route "focusCourse" URL param) into a real
 * course before anything acts on it, rather than trusting the id blindly.
 * Returns null both when the id is null and when it names no course in the
 * given list.
 */
export function resolveFocusedCourse<T extends { id: string }>(
  courses: T[],
  focusCourseId: string | null
): T | null {
  if (!focusCourseId) return null;
  return courses.find((c) => c.id === focusCourseId) ?? null;
}
