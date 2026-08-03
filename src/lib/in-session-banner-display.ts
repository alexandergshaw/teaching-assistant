// Pure display-shaping helpers for InSessionBanner.tsx. Kept in their own
// module rather than added to courses-in-session.ts: that module's "which
// courses count as in session" logic and its 15 tests are a shipped
// contract (see its own header comment) that must not change, so any NEW
// pure logic the banner needs - how many chips to show, which course a
// focus-target id actually resolves to - lives here instead of risking a
// diff against that file.

export const MAX_VISIBLE_IN_SESSION_COURSES = 6;

export interface DisplayedCourses<T> {
  visible: T[];
  overflowCount: number;
}

/**
 * Caps how many in-session courses the banner renders as individual chips,
 * so a long roster degrades to a calm "+N more" note instead of wrapping
 * into a multi-row wall of chips - the banner should look deliberate at one
 * course and at a dozen alike. Preserves the given order; never mutates
 * `courses`.
 */
export function limitDisplayedCourses<T>(
  courses: T[],
  max: number = MAX_VISIBLE_IN_SESSION_COURSES
): DisplayedCourses<T> {
  if (max < 0) throw new RangeError("max must be >= 0");
  if (courses.length <= max) return { visible: courses, overflowCount: 0 };
  return { visible: courses.slice(0, max), overflowCount: courses.length - max };
}

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
