// Pure helper for the "courses in session" banner shown directly below the
// app header (TopBar.tsx / InSessionBanner.tsx). Decides which courses count
// as currently in session purely from data already on the course table
// (start_date, end_date, breaks - see src/lib/supabase/courses.ts) plus a
// reference date supplied by the caller. Never reads the clock itself (no
// `new Date()` with no argument, no Date.now()) so this stays deterministic
// and fully unit-testable with fixed dates - the caller (InSessionBanner)
// is the one place that turns "now" into a value.
//
// Edge-case decisions (documented here because AC1 asks for them explicitly):
//  - Missing startDate -> never in session. A course whose start date was
//    never set has no confirmed basis for "it has begun", so it can't be
//    "in session" no matter what endDate says.
//  - Missing endDate -> treated as open-ended. Once startDate has arrived,
//    the course stays in session indefinitely (no upper bound to check).
//    This matches how the rest of the app already treats a null endDate as
//    "not yet decided" rather than "already over".
//  - Both missing -> never in session (falls straight out of the missing-
//    startDate rule above; nothing else to check).
//  - Boundary dates: start/end are INCLUSIVE, per AC1 ("today falls between
//    its start and end dates inclusive") - a course that starts today or
//    ends today counts as in session today.
//  - start === end (a one-day course/intensive): still covered by the same
//    inclusive rule, no special case needed - start <= today <= end holds
//    when all three are equal.
//  - A break period covering today takes the course OUT of session - the
//    whole point of a recorded break is that class isn't meeting that day -
//    but ONLY when `breaks` parses as STRUCTURED date ranges via
//    parseCourseBreaks (course-breaks.ts). That parser is lenient and
//    ALL-OR-NOTHING: legacy free text like "Week 8 - Spring Break" makes it
//    return null (no reliable dates to check), and this module follows
//    courses-table-helpers.ts's own precedent for that case (its breaks sort
//    case treats unparsed free text the same as "no breaks set") by simply
//    not treating unstructured breaks text as a break for this purpose,
//    rather than guessing at a format nothing else in the codebase parses.
//
// All date comparisons are done as "YYYY-MM-DD" calendar-date strings, never
// via Date-object range math. startDate/endDate/break dates are already
// stored in that shape (the native <input type="date"> format - see
// course-breaks.ts), and comparing same-shaped ISO strings lexicographically
// is exactly equivalent to calendar-date comparison, with no timezone
// conversion risk the way subtracting two Date objects would have.

import { parseCourseBreaks } from "./course-breaks";

/** The subset of a course's fields this module needs. `Course` (from
 * src/lib/supabase/courses.ts) satisfies this directly, so callers can pass
 * full Course objects with no mapping step. */
export interface CourseSessionCandidate {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  breaks: string | null;
}

/** "YYYY-MM-DD" for `referenceDate`'s own local calendar date - mirrors
 * weekly-checklist.ts's todayDateString, the same local-date formatting this
 * codebase already uses elsewhere to compare against stored date strings. */
function toDateString(referenceDate: Date): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const day = String(referenceDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** True when `today` ("YYYY-MM-DD") falls inside one of `breaks`'s
 * structured ranges (inclusive). False for unstructured/free-text breaks or
 * no breaks at all - see the module comment for why. */
function isOnBreak(breaks: string | null, today: string): boolean {
  const ranges = parseCourseBreaks(breaks);
  if (!ranges) return false;
  return ranges.some((r) => r.start <= today && today <= r.end);
}

/**
 * Filters `courses` down to the ones in session on `referenceDate`, in the
 * same order they were given. See the module comment for exactly how each
 * edge case (missing start/end, boundary dates, breaks) is handled.
 */
export function coursesInSession<T extends CourseSessionCandidate>(
  courses: T[],
  referenceDate: Date
): T[] {
  const today = toDateString(referenceDate);
  return courses.filter((course) => {
    if (!course.startDate) return false;
    if (course.startDate > today) return false;
    if (course.endDate && course.endDate < today) return false;
    if (isOnBreak(course.breaks, today)) return false;
    return true;
  });
}
