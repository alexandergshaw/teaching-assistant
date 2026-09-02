// Pure helper for the in-session banner's upcoming-dates strip
// (InSessionBanner.tsx). Decides how urgent ONE already-built
// UpcomingCourseDate is, relative to an explicit reference clock, so the
// banner can mark it with a non-colour cue (a leading dot) in addition to
// the relative word (`formatUpcomingDate`'s "Today"/"Tomorrow") it already
// carries (see docs/aesthetics-pass-acceptance-criteria.md AM9-adjacent
// guidance and this feature's own audit item B9: position first, words
// second, a non-colour mark third, colour last).
//
// Split into its own leaf module rather than added to course-upcoming-dates.ts
// because this is genuinely NEW pure logic (per this feature's hand-off brief)
// and that file is to be edited "only if you must" - this needs no edit there
// at all: an UpcomingCourseDate already carries `date` and `time`, so urgency
// is derivable purely from those two fields plus `now`, with no new data.
//
// Like course-upcoming-dates.ts and courses-in-session.ts, this module NEVER
// reads the clock itself - every function takes an explicit `now: Date` - so
// it stays deterministic and unit-testable with fixed dates. A test scans
// this file's own source for an argument-less Date constructor call or a
// call to Date's own "now" method, the same guard those two modules already
// carry (worded this way, rather than spelled out literally, so this very
// comment does not itself trip that scan).
//
// WHY "today, but the time already passed" counts as overdue (this feature's
// audit item B8, and a deliberate departure from the reasoning
// docs/REGRESSION.md entry 289 recorded for the ORIGINAL "upcoming dates"
// feature - "a deadline that already passed earlier today still shows,
// unmarked, because the banner is date-granular"): that was fine when the
// only signal was the bare date. Once the banner marks urgency at all, a
// grades-due entry timestamped 9:00 AM that is still unmarked at 4:00 PM the
// same day reads as "still pending" when it is not - the exact defect this
// module exists to fix. `formatUpcomingDate` itself is UNCHANGED here: it
// still renders "Today, Mar 10 at 9:00 AM" for that entry regardless of the
// clock, which is correct and remains date-granular in its own right. This
// module supplies the SEPARATE "is this actually overdue" signal the banner
// layers on top, as a prefix and a mark, not a replacement.
export type UpcomingEntryUrgency = "overdue" | "dueToday" | "upcoming";

export interface UpcomingEntryUrgencyInput {
  /** "YYYY-MM-DD" */
  date: string;
  /** 24-hour "HH:MM", or null when the entry carries no specific time. */
  time: string | null;
}

/** "YYYY-MM-DD" for `now`'s own local calendar date - duplicated, not
 * imported, from courses-in-session.ts / course-upcoming-dates.ts's own
 * toDateString, matching this codebase's convention of each deadline-shaped
 * module owning its own copy of this exact helper. */
function toDateString(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "HH:MM" for `now`'s own local clock time, zero-padded so it compares
 * correctly against a stored "HH:MM" string lexicographically - the same
 * zero-padding reasoning `coerceGradesDueTime` documents for a stored time. */
function toClockString(now: Date): string {
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

/**
 * `"overdue"` when `entry.date` is strictly before today, OR `entry.date` is
 * today and `entry.time` is set and has already passed. `"dueToday"` when
 * `entry.date` is today and either carries no time or its time has not yet
 * passed. `"upcoming"` for any date strictly after today.
 */
export function upcomingEntryUrgency(entry: UpcomingEntryUrgencyInput, now: Date): UpcomingEntryUrgency {
  const today = toDateString(now);
  if (entry.date < today) return "overdue";
  if (entry.date > today) return "upcoming";
  if (entry.time !== null && entry.time <= toClockString(now)) return "overdue";
  return "dueToday";
}
