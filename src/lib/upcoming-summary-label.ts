// Pure helper for the in-session banner's TOGGLE row (InSessionBanner.tsx).
// This feature's audit item B6: the toggle used to carry a bare count -
// "Upcoming 2" - which cannot distinguish "two dates a fortnight out" from
// "one due in ninety minutes" without expanding the strip below it. Since
// `upcomingCourseDates` (course-upcoming-dates.ts) already returns its list
// SORTED with the soonest entry first (see that module's own AC6 sort-key
// comment), the single most urgent item is always `upcoming[0]` - this module
// just shapes that entry plus a remainder count into the three display parts
// the toggle renders, so the collapsed row can answer "should I expand?"
// without the instructor ever opening the strip.
//
// Kept in its own leaf module, not inlined in InSessionBanner.tsx, because
// vitest here is node-env and collects only src/**/*.test.ts - no component is
// ever rendered under test (see docs/aesthetics-pass-acceptance-criteria.md
// section 5's "Limits" and this feature's own hand-off brief) - so any new
// behaviour that needs a test that can actually fail has to live in a plain
// function, not JSX.
//
// No I/O, no clock read of its own - `now` is threaded through to
// `formatUpcomingDate` exactly as InSessionBanner already does for every
// other date it renders.

import { formatUpcomingDate, type UpcomingCourseDate } from "./course-upcoming-dates";

export interface UpcomingSummary {
  /** The soonest entry's own label, verbatim (e.g. "Grades due", "Class
   * starts", or an instructor's own checklist wording) - never rephrased,
   * matching how the expanded strip already treats this same text. */
  label: string;
  /** `formatUpcomingDate` output for the soonest entry - "Today, Mar 10 at
   * 5:00 PM" and the like. */
  dateText: string;
  /** How many OTHER upcoming entries exist beyond the one summarized here.
   * Zero when `upcoming` had exactly one entry. */
  moreCount: number;
}

/**
 * Summarizes `upcoming` (assumed already sorted soonest-first, as
 * `upcomingCourseDates` always returns it) down to its single soonest entry
 * plus a remainder count, for the toggle's collapsed row. Returns null for an
 * empty list - the toggle simply omits this segment then, exactly as it
 * already omits the "in session" segment when there are no courses in
 * session.
 */
export function summarizeUpcoming(upcoming: UpcomingCourseDate[], now: Date): UpcomingSummary | null {
  if (upcoming.length === 0) return null;
  const [soonest, ...rest] = upcoming;
  return {
    label: soonest.label,
    dateText: formatUpcomingDate(soonest.date, soonest.time, now),
    moreCount: rest.length,
  };
}
