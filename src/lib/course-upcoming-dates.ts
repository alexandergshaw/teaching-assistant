// Pure helpers computing the second half of the sticky "courses in session"
// banner (InSessionBanner.tsx): upcoming ONE-OFF dates for courses whose term
// is under way, plus the single start date for courses about to begin.
// Nothing here touches the DOM or the clock - InSessionBanner is the only
// caller allowed to turn "now" into a Date (see the "never reads the clock"
// section below).
//
// WHAT COUNTS AS A "ONE-OFF DATE" (AC4) AND WHAT DOES NOT, AND WHY:
//   - dayTime is a RECURRING weekly meeting time, not a single date.
//   - assignmentDueRule is a RECURRING weekly rule ("sun|23:59" - see
//     assignment-due-rule.ts), not a single occurrence.
//   - a weeklyChecklist item's deadline is included ONLY when
//     checklistDeadlineKind resolves it to "one-off" - "recurring", "daily"
//     and "monthly" all repeat, so none of them is the single upcoming date
//     the user asked for.
//   - tests / weeks / courseProject are COUNTS and week-numbers, never
//     stored calendar dates - there is nothing date-shaped to read.
//   - startDate is excluded for an UNDER-WAY course: it is already in the
//     past for a course whose term has begun (coursesUnderWay only admits a
//     course once its startDate <= today), so it can never be "upcoming"
//     there. It only ever appears for a STARTING-SOON course, and there it
//     is the ONLY thing that course contributes (AC5) - see
//     coursesStartingSoon and startingSoonEntriesForCourse.
//   Several of the excluded fields are not even on CourseUpcomingCandidate,
//   so the type itself enforces this list rather than relying on every call
//   site to remember to skip them.
//
// WHY coursesUnderWay EXISTS, AND WHY IT IS A SUPERSET OF coursesInSession:
//   coursesInSession (courses-in-session.ts) hides a course entirely while it
//   is on a structured break - correct for "is class meeting today", wrong
//   for "does this course still have upcoming deadlines". Sourcing deadlines
//   from coursesInSession would make a course vanish from the banner for the
//   whole length of its break, taking its grades-due date, its end date and
//   its checklist items with it - and would even suppress a break's OWN
//   "starts today" entry, the one day the break rule is the entire reason
//   that entry exists. coursesUnderWay answers a different, broader question
//   ("has this course's term begun and not yet ended") and deliberately
//   ignores breaks, so it can never lose a course's deadlines to the same
//   break that hides its chip.
//
//   Being a superset requires coursesUnderWay's startDate membership check to
//   compare RAW, exactly like coursesInSession's own does - not run through
//   coerceGradesDueDate the way every other date in this module is. That is
//   deliberate, not an oversight: coursesInSession is a frozen file this
//   module may only import from, never edit, and it compares
//   course.startDate raw. A malformed startDate like "2026-02-30" sorts
//   lexicographically INSIDE a plausible range as a plain string, so
//   coursesInSession's raw comparison already admits that course; coercing
//   the same comparison here would reject it instead, and the "superset"
//   claim above would be false for exactly that row (round-3 finding 1 -
//   round-2 finding 8 coerced it "for consistency" and broke precisely this).
//   endDate has no matching constraint: coursesInSession's own endDate check
//   can only ever EXCLUDE a course, never admit one it wouldn't otherwise -
//   so degrading a malformed endDate to "open-ended" here (coerced, unlike
//   startDate) can only relax coursesUnderWay's filter, never shrink it below
//   coursesInSession.
//
// HORIZON ARITHMETIC IS CALENDAR-DAY, NOT EPOCH-MS (AC6):
//   The horizon's end date is computed as `new Date(y, m, d + horizonDays)`,
//   re-read back through the same local getFullYear/getMonth/getDate
//   formatter used everywhere else in this module - never
//   `referenceDate.getTime() + horizonDays * 86400000` and never string
//   concatenation. Epoch-ms arithmetic is off by a day across a
//   daylight-saving transition (a 23- or 25-hour local day breaks the "one
//   day = 86400000 ms" assumption), and naive string concatenation is wrong
//   across a month or year boundary. The Date constructor's (year, month,
//   day) form resolves an out-of-range day by walking the real calendar (and
//   re-resolving DST at the landed date), so it gets both cases right for
//   free. The window CHECK itself stays lexicographic string comparison on
//   "YYYY-MM-DD", exactly matching courses-in-session.ts.
//
// SORT KEY (AC6): date ascending, then time ascending with a MISSING time
//   sorting AFTER any present time on the same date ("by end of day" reads as
//   later than any specific time), then course name, then kind (plain string
//   compare), then course id, then label, then the source checklist item id
//   (round-1 SHOULD-FIX 3 - two distinct checklist items sharing every other
//   field still need a decided order). Every tiebreaker after "date" only
//   exists to make the order fully deterministic - two entries that are
//   otherwise equal in date/time need a decided answer, never whatever order
//   Array.prototype.sort happens to leave them in. courseName is normalized
//   to "" (never null) at the point each entry is built, so this comparator
//   only ever compares strings - see underWayEntriesForCourse.
//
// THE MODULE NEVER READS THE CLOCK: every function takes an explicit
//   referenceDate, exactly like courses-in-session.ts. A test scans this
//   file's own source for an argument-less Date constructor call or a call
//   to Date's own "now" method - InSessionBanner is the sole owner of "now"
//   (including the midnight-rollover timer, AC11).
//
// MONTH/WEEKDAY NAMES ARE FIXED TABLES, NOT toLocaleDateString (AC7): this
//   mirrors checklist-deadline.ts's own MONTH_LABELS/formatChecklistDateLabel
//   for the same reason stated there - deterministic output across
//   environments/locales, which this module's own tests (and every other
//   locale-sensitive test in this codebase) rely on.
//
// ABOUT-TO-BEGIN COURSES CONTRIBUTE ONLY THEIR START DATE (AC5): a direct
//   instruction from the user, not an oversight - surfacing a not-yet-started
//   course's grades-due date or checklist items would be announcing
//   deadlines for a course that has not met yet. If a course is (impossibly)
//   handed to this module in BOTH lists at once, the starting-soon rule wins
//   outright and its under-way contributions are dropped entirely - see
//   upcomingCourseDates.
//
// No I/O - safe on client or server, fully unit-testable.

import { parseCourseBreaks } from "./course-breaks";
import { coerceGradesDue, coerceGradesDueDate, coerceGradesDueTime } from "./grades-due";
import { checklistDeadlineKind, isChecklistItemCheckedNow, type WeeklyChecklistItem } from "./weekly-checklist";
import type { CourseSessionCandidate } from "./courses-in-session";

export const UPCOMING_HORIZON_DAYS = 14;

export type UpcomingDateKind = "class-start" | "grades-due" | "class-end" | "break-start" | "checklist";

export interface UpcomingCourseDate {
  courseId: string;
  courseName: string;
  kind: UpcomingDateKind;
  label: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** 24-hour "HH:MM", or null when this date carries no specific time. */
  time: string | null;
  /** The originating weekly-checklist item's own id, carried through ONLY
   * for kind "checklist" (undefined for every other kind, which has no such
   * source id). Two different checklist items on one course can otherwise
   * share a label, a one-off date and a time - an ordinary shape for an
   * instructor running two sections off one course row - and without this
   * field the dedupe key and sort tiebreak would treat them as the same
   * entry and silently drop one (SHOULD-FIX 3). */
  sourceId?: string;
}

/** The subset of a course's fields this module needs beyond
 * CourseSessionCandidate - all optional, matching Course's own fields in
 * courses.types.ts (see that file's comments on gradesDueDate/weeklyChecklist
 * for why they are optional there: every course actually loaded through
 * listCourses/getCourse gets a concrete value, but hand-built test fixtures
 * elsewhere in this codebase predate these columns). */
export interface CourseUpcomingCandidate extends CourseSessionCandidate {
  gradesDueDate?: string | null;
  gradesDueTime?: string | null;
  weeklyChecklist?: WeeklyChecklistItem[];
}

/** "YYYY-MM-DD" for `referenceDate`'s own local calendar date. Duplicated
 * (not imported) from courses-in-session.ts's own toDateString - that file
 * is off limits and not exported, matching this codebase's convention of
 * each deadline-shaped module owning its own copy of small date helpers. */
function toDateString(referenceDate: Date): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const day = String(referenceDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** `referenceDate` plus `days` CALENDAR days, as "YYYY-MM-DD" - see the
 * module comment's "horizon arithmetic" section for why this goes through
 * the Date constructor's own day-overflow handling rather than epoch-ms
 * addition or string concatenation. */
function addCalendarDays(referenceDate: Date, days: number): string {
  const shifted = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() + days);
  return toDateString(shifted);
}

/** Cheap defense against a hostile/malformed array entry (e.g. `[null]`, or
 * `{}` where an array was expected) reaching this module - a compile-time
 * `T extends CourseSessionCandidate` constraint promises nothing about data
 * read back from storage. InSessionBanner renders on every route (TopBar.tsx
 * mounts it unconditionally), so an uncaught throw here takes down the whole
 * app shell rather than degrading to this module's documented "contributes
 * nothing" behaviour for bad input. Deliberately not a schema validator -
 * just enough to make a `.startDate`/`.id` read safe. */
function isNonNullObject(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

/**
 * Courses whose TERM is running (AC2): `startDate` is set and <= today, and
 * `endDate` is null or >= today. Breaks are deliberately IGNORED - see the
 * module comment for why this must stay a strict superset of
 * coursesInSession rather than reuse it.
 *
 * `startDate` is compared RAW here, exactly like coursesInSession's own
 * membership test - never coerced, even though every other date this module
 * reads is validated before use. This is required, not an inconsistency:
 * coursesInSession (frozen, import-only) also compares course.startDate raw,
 * so a malformed value like "2026-02-30" already sorts lexicographically
 * inside a plausible range there and gets admitted. Coercing startDate only
 * here would reject that same course, falsifying the superset guarantee this
 * selector exists to provide (round-3 finding 1 - round-2 finding 8 coerced
 * it "for consistency" and broke exactly this; see the module header for the
 * full reasoning). Nothing malformed reaches the banner from this path
 * regardless: an under-way course never emits its own start date (see
 * underWayEntriesForCourse) - only coursesStartingSoon's own emit site
 * (startingSoonEntriesForCourse) ever turns a startDate into a rendered
 * entry, and that path coerces it (round-1 BLOCKER 1).
 *
 * `endDate`, unlike `startDate`, IS run through `coerceGradesDueDate` before
 * comparison. This cannot break the superset the same way: a malformed
 * `endDate` degrades to "no end date" (open-ended) rather than either
 * wrongly ending the course or trusting an unreliable value to keep it
 * running, so coercing it can only ever ADMIT a course, never reject one
 * coursesInSession would otherwise accept - the same "malformed contributes
 * nothing/changes nothing" rule this module applies everywhere else, never a
 * guess.
 */
export function coursesUnderWay<T extends CourseSessionCandidate>(courses: T[], referenceDate: Date): T[] {
  const today = toDateString(referenceDate);
  return courses.filter((course) => {
    if (!isNonNullObject(course)) return false;
    if (!course.startDate) return false;
    if (course.startDate > today) return false;
    const endDate = coerceGradesDueDate(course.endDate);
    if (endDate && endDate < today) return false;
    return true;
  });
}

/**
 * Courses whose `startDate` is STRICTLY after today and no later than today
 * plus `horizonDays` - "about to begin" (AC3). A course starting exactly
 * today is already in session, not starting soon. A course whose `endDate`
 * precedes its `startDate` is excluded too: that combination is a stale,
 * copied-forward row, and coursesInSession already treats it as long over -
 * announcing it as "about to begin" here would be a second, contradictory
 * claim about the exact same row.
 *
 * `startDate` must be ALREADY CANONICAL to be accepted here -
 * `coerceGradesDueDate` has to return it byte-for-byte unchanged, not merely
 * non-null. That is a stricter gate than every other date this module
 * coerces, and it exists for one reason: coursesInSession (frozen,
 * imported-only) compares course.startDate RAW, so this set has to stay
 * disjoint from it over the same input list - a course cannot be
 * simultaneously already meeting and not yet begun. coerceGradesDueDate's
 * only transformation is trimming whitespace, so a startDate like
 * " 2026-03-16" (a leading space or tab) was the one shape that used to slip
 * through: as a raw string it sorts BELOW any digit, so coursesInSession's
 * raw `course.startDate > today` gate is false and the course is admitted as
 * IN SESSION, while coercion trims that same value to "2026-03-16" - strictly
 * future and inside the horizon - so accepting anything coercion merely
 * succeeded on (rather than left untouched) admitted the course here too,
 * manufacturing exactly the overlap disjointness forbids. Requiring an exact
 * match closes that gap: coercion can then only ever SHRINK this set relative
 * to a raw comparison (rejecting, for example, an impossible calendar date
 * that a raw comparison would have let sort into the window), never GROW it -
 * and that direction is what actually makes the disjointness claim true, not
 * merely asserted. (startingSoonEntriesForCourse, this selector's own emit
 * site, does not re-check the exact-match condition itself - it relies on
 * this filter having already run, per this module's documented
 * "underWay/startingSoon are expected to already be exactly what these
 * selectors would produce" contract; InSessionBanner always calls this filter
 * first, so a non-canonical startDate never reaches that emit site in
 * practice.)
 *
 * `endDate` has no matching constraint and is coerced on its own terms before
 * comparison to the (now-canonical) `startDate`, because the comparisons
 * below (and the horizon check) are lexicographic string comparisons, and a
 * malformed value can sort INSIDE a plausible window as a plain string (e.g.
 * "2026-13-01", a full timestamp, or "2026-02-30") the same way an
 * unvalidated gradesDueDate or checklist date could (round-1 BLOCKER 1).
 * Comparing a raw `endDate` against an already-coerced `startDate` used to
 * let the malformed-endDate rule flip on the SHAPE of the garbage instead of
 * applying consistently (round-3 finding 2) - coercing both sides fixes that,
 * and coercing endDate can never grow this set the way coercing startDate
 * could: it only ever relaxes the stale-row exclusion above, the same
 * "malformed degrades to open-ended" rule coursesUnderWay applies to its own
 * endDate check.
 *
 * This is deliberately NOT the same rule `coursesUnderWay` applies to its own
 * `startDate` membership check above: `coursesUnderWay` compares raw and
 * never coerces at all, because it must match coursesInSession's RAW
 * `startDate` comparison exactly to stay a strict superset of it (round-3
 * finding 1). This selector cannot simply copy that - a bare raw comparison
 * would let an impossible date like "2026-02-30" sort into the horizon window
 * and be announced as a real upcoming start - so it coerces AND requires the
 * coerced result to equal the input. That combination gets both properties at
 * once: a malformed or impossible startDate still contributes nothing
 * (round-1 BLOCKER 1's guarantee), and a startDate that coercion would
 * silently reformat is rejected before it can disagree with coursesInSession's
 * raw comparison in the one direction that actually matters here - growing
 * this set into overlap with it.
 */
export function coursesStartingSoon<T extends CourseSessionCandidate>(
  courses: T[],
  referenceDate: Date,
  horizonDays: number = UPCOMING_HORIZON_DAYS
): T[] {
  const today = toDateString(referenceDate);
  const horizonEnd = addCalendarDays(referenceDate, horizonDays);
  return courses.filter((course) => {
    if (!isNonNullObject(course)) return false;
    const startDate = coerceGradesDueDate(course.startDate);
    // Not just `!startDate` (non-null) - `startDate !== course.startDate`
    // rejects a value coercion had to CHANGE to validate (in practice, only
    // whitespace-padding, since coerceGradesDueDate never reformats a value
    // that already matches the date pattern). See the doc comment above for
    // why an exact match, not mere coercion success, is what keeps this set
    // disjoint from coursesInSession's raw comparison.
    if (!startDate || startDate !== course.startDate) return false;
    if (startDate <= today) return false;
    if (startDate > horizonEnd) return false;
    const endDate = coerceGradesDueDate(course.endDate);
    if (endDate && endDate < startDate) return false;
    return true;
  });
}

/** The break-start entry's label carries the break's own label when it has
 * one (AC4); an unlabelled range still gets a non-empty label rather than
 * an empty string reaching the banner. */
function breakStartLabel(rangeLabel: string): string {
  const trimmed = rangeLabel.trim();
  return trimmed ? `${trimmed} starts` : "Break starts";
}

/**
 * The under-way contributions for ONE course: grades-due, class-end,
 * break-start (one per structured break range) and each one-off,
 * not-yet-checked checklist item (AC4). Every date is validated before it
 * can become an entry - a malformed value contributes nothing, rather than
 * an entry the horizon filter would later have to catch (a malformed string
 * can sort INSIDE a plausible window, e.g. "2026-02-30", so the window check
 * alone is not enough - see the module comment).
 */
function underWayEntriesForCourse(course: CourseUpcomingCandidate, referenceDate: Date): UpcomingCourseDate[] {
  const entries: UpcomingCourseDate[] = [];
  // course_hub.name is a nullable text column, and the compile-time
  // CourseSessionCandidate.name: string cannot stop a legacy/hand-edited row
  // from actually carrying null - normalized to "" once, here, rather than
  // inside compareEntries, so a null name can never reach the comparator
  // (where `null < "Alpha"` and `"Alpha" < null` are BOTH false, breaking the
  // total order - SHOULD-FIX 5) or the JSX.
  const courseName = course.name ?? "";

  const gradesDue = coerceGradesDue(course.gradesDueDate, course.gradesDueTime);
  if (gradesDue.date) {
    entries.push({
      courseId: course.id,
      courseName,
      kind: "grades-due",
      label: "Grades due",
      date: gradesDue.date,
      time: gradesDue.time,
    });
  }

  const endDate = coerceGradesDueDate(course.endDate);
  if (endDate) {
    entries.push({
      courseId: course.id,
      courseName,
      kind: "class-end",
      label: "Class ends",
      date: endDate,
      time: null,
    });
  }

  // parseCourseBreaks is ALL-OR-NOTHING (course-breaks.ts): null means the
  // stored text failed to parse as structured ranges, so nothing is emitted
  // for breaks at all rather than guessing at free text.
  const breakRanges = parseCourseBreaks(course.breaks);
  if (breakRanges) {
    for (const range of breakRanges) {
      entries.push({
        courseId: course.id,
        courseName,
        kind: "break-start",
        label: breakStartLabel(range.label),
        date: range.start,
        time: null,
      });
    }
  }

  const nowMs = referenceDate.getTime();
  // A malformed weeklyChecklist (not an array at all, e.g. `{}` off a
  // hand-edited row) degrades to "no checklist entries" rather than throwing
  // on the `for...of` below - Array.isArray is the same defensive shape
  // coerceWeeklyChecklist itself uses on read (weekly-checklist.ts).
  const checklist = Array.isArray(course.weeklyChecklist) ? course.weeklyChecklist : [];
  for (const item of checklist) {
    // A non-object item (e.g. `null`) in an otherwise-real array is skipped,
    // not thrown on - same "bad row degrades, does not crash the app shell"
    // reasoning as isNonNullObject above.
    if (!isNonNullObject(item)) continue;
    if (!item.deadline || checklistDeadlineKind(item.deadline) !== "one-off") continue;
    // isChecklistItemCheckedNow, not a bare item.checked - a checked item
    // must stop nagging, and this is the one helper every other display and
    // count site in the app is required to use for that (AC4).
    if (isChecklistItemCheckedNow(item, nowMs)) continue;
    const date = coerceGradesDueDate(item.deadline.date);
    if (!date) continue;
    entries.push({
      courseId: course.id,
      courseName,
      kind: "checklist",
      // The instructor's own words, verbatim - never rephrased (AC4).
      label: item.label,
      date,
      // coerceGradesDueTime, not the raw string - it reaches compareTimeForSort
      // (lexicographic) and formatClockTime (Number()) same as a grades-due
      // time, so it needs the same zero-padding and range check: an unpadded
      // "9:05" sorts AFTER "17:00" as a plain string, and "25:99" would
      // otherwise render as a mangled clock instead of degrading to no time.
      time: coerceGradesDueTime(item.deadline.time),
      // Carried through to the dedupe key and sort tiebreak so two distinct
      // checklist items on one course that happen to share a label, date and
      // time are never merged into one entry (SHOULD-FIX 3).
      sourceId: item.id,
    });
  }

  return entries;
}

/** The starting-soon contribution for ONE course: exactly its start date,
 * and nothing else (AC5) - not grades due, not the end date, not breaks, not
 * checklist items, even when those fields are set and fall inside the
 * horizon. `startDate` is run through `coerceGradesDueDate` before it
 * becomes an entry - it is the one date this module used to copy verbatim,
 * but it is exactly as untrusted as gradesDueDate/endDate/a checklist date,
 * and a malformed value (an out-of-range month, an impossible day, a
 * timestamp-shaped string) would otherwise reach formatUpcomingDate and
 * render "Invalid Date"/"undefined" straight into the banner (BLOCKER 1). */
function startingSoonEntriesForCourse(course: CourseUpcomingCandidate): UpcomingCourseDate[] {
  const startDate = coerceGradesDueDate(course.startDate);
  if (!startDate) return [];
  return [
    {
      courseId: course.id,
      // Normalized the same way as underWayEntriesForCourse - see that
      // function's comment (SHOULD-FIX 5).
      courseName: course.name ?? "",
      kind: "class-start",
      label: "Class starts",
      date: startDate,
      time: null,
    },
  ];
}

/** Missing sorts AFTER any present time on the same date - "by end of day"
 * reads as later than any specific time (AC6). */
function compareTimeForSort(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** Full AC6 sort key: date, time (missing last), course name, kind, course
 * id, label, then the source checklist item id (SHOULD-FIX 3) - deep enough
 * that no two distinct entries can tie, so nothing is ever left to
 * Array.prototype.sort's stability. courseName is assumed already normalized
 * to "" rather than null by the caller (see underWayEntriesForCourse's
 * comment) - this comparator only ever sees strings, never a null that would
 * make `a < b` and `b < a` both false and break the total order. */
function compareEntries(a: UpcomingCourseDate, b: UpcomingCourseDate): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const timeCmp = compareTimeForSort(a.time, b.time);
  if (timeCmp !== 0) return timeCmp;
  if (a.courseName !== b.courseName) return a.courseName < b.courseName ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.courseId !== b.courseId) return a.courseId < b.courseId ? -1 : 1;
  if (a.label !== b.label) return a.label < b.label ? -1 : 1;
  const aSourceId = a.sourceId ?? "";
  const bSourceId = b.sourceId ?? "";
  if (aSourceId !== bSourceId) return aSourceId < bSourceId ? -1 : 1;
  return 0;
}

/** JSON-encodes the identity fields rather than joining them with a plain
 * delimiter - a checklist label is the instructor's own free text (AC4) and
 * could itself contain any delimiter character picked here, which would let
 * two genuinely different entries collide into the same dedupe key.
 * sourceId is included (null for the kinds that have none) so two distinct
 * checklist items sharing every other field never collapse into one entry
 * (SHOULD-FIX 3) - dedupe is meant to catch the SAME course listed twice
 * upstream, never two different checklist items that happen to read alike. */
function entryDedupeKey(entry: UpcomingCourseDate): string {
  return JSON.stringify([entry.courseId, entry.kind, entry.label, entry.date, entry.time, entry.sourceId ?? null]);
}

/**
 * Builds the full, sorted, deduped upcoming-dates list for the banner's
 * disclosure (AC4-AC6). `underWay`/`startingSoon` are expected to already be
 * exactly what coursesUnderWay/coursesStartingSoon above would produce - this
 * function does not re-derive membership, only turns each given course into
 * its date contributions, concatenates them, filters by the horizon window
 * once, dedupes, then sorts once.
 *
 * When a course id appears in BOTH lists, the starting-soon rule wins
 * outright (AC5): its under-way contributions are skipped entirely rather
 * than merged in alongside the class-start entry, so one banner entry can
 * never simultaneously claim "starting soon" and "grades due".
 */
export function upcomingCourseDates(
  underWay: CourseUpcomingCandidate[],
  startingSoon: CourseUpcomingCandidate[],
  referenceDate: Date,
  horizonDays: number = UPCOMING_HORIZON_DAYS
): UpcomingCourseDate[] {
  const today = toDateString(referenceDate);
  const horizonEnd = addCalendarDays(referenceDate, horizonDays);
  // Both lists are filtered through isNonNullObject before any `.id`/field
  // read - underWay/startingSoon are documented as "already exactly what
  // coursesUnderWay/coursesStartingSoon would produce", but this function is
  // itself exported, so a caller handing it a hostile shape directly (e.g.
  // `[null]`) must degrade to "contributes nothing" rather than throw
  // (SHOULD-FIX 6).
  const startingSoonIds = new Set(startingSoon.filter(isNonNullObject).map((course) => course.id));

  const raw: UpcomingCourseDate[] = [];
  for (const course of underWay) {
    if (!isNonNullObject(course)) continue;
    if (startingSoonIds.has(course.id)) continue;
    raw.push(...underWayEntriesForCourse(course, referenceDate));
  }
  for (const course of startingSoon) {
    if (!isNonNullObject(course)) continue;
    raw.push(...startingSoonEntriesForCourse(course));
  }

  const inWindow = raw.filter((entry) => entry.date >= today && entry.date <= horizonEnd);

  const seen = new Set<string>();
  const deduped: UpcomingCourseDate[] = [];
  for (const entry of inWindow) {
    const key = entryDedupeKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  return deduped.sort(compareEntries);
}

const MONTH_LABELS: readonly string[] = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAY_LABELS: readonly string[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** hour/minute here are already range-checked upstream, for every entry kind
 * that can carry a time: grades-due goes through coerceGradesDue, and a
 * checklist deadline's time goes through coerceGradesDueTime directly in
 * underWayEntriesForCourse (this was NOT true before SHOULD-FIX 4 - the
 * checklist time used to reach here raw, and this comment's claim was false
 * for that caller). Duplicated (not imported) from grades-due.ts, matching
 * this codebase's convention of each deadline-shaped module owning its own
 * copy of this exact helper (see grades-due.ts:85-88's own comment). */
function formatClockTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour24 = Number(hourStr);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12raw = hour24 % 12;
  const hour12 = hour12raw === 0 ? 12 : hour12raw;
  return `${hour12}:${minuteStr} ${period}`;
}

/**
 * Human display for one upcoming entry (AC7), e.g. "Today, Mar 10",
 * "Tomorrow, Mar 11", "Sun, Mar 15", each optionally with " at 5:00 PM"
 * appended - matching the output shape describeGradesDue (grades-due.ts)
 * already produces. Relative AND absolute are both always present
 * deliberately: relative-only ("Today") is an accessibility problem for
 * anyone doing the mental math, and a bare micro format ("3d") is actively
 * harmful to screen readers (see the research note in the feature brief).
 *
 * Parses `date` by splitting the "YYYY-MM-DD" string and constructing a
 * LOCAL `new Date(y, m - 1, d)` - never `new Date(dateString)`, which parses
 * as UTC and can land on the wrong local day.
 *
 * The year is appended ONLY when it differs from referenceDate's own year -
 * over a 14-day horizon that is only ever possible right at a Dec 31/Jan 1
 * boundary, but without it an entry read in late December for an early-
 * January deadline would render "Wed, Jan 3" with nothing distinguishing it
 * from the Jan 3 a year earlier. Appending it unconditionally would instead
 * make every ordinary row noisier for no reason (finding 13).
 */
export function formatUpcomingDate(date: string, time: string | null, referenceDate: Date): string {
  const [year, month, day] = date.split("-").map(Number);
  const absolute =
    year === referenceDate.getFullYear() ? `${MONTH_LABELS[month - 1]} ${day}` : `${MONTH_LABELS[month - 1]} ${day}, ${year}`;

  const today = toDateString(referenceDate);
  const tomorrow = addCalendarDays(referenceDate, 1);

  let prefix: string;
  if (date === today) {
    prefix = `Today, ${absolute}`;
  } else if (date === tomorrow) {
    prefix = `Tomorrow, ${absolute}`;
  } else {
    const weekday = new Date(year, month - 1, day).getDay();
    prefix = `${WEEKDAY_LABELS[weekday]}, ${absolute}`;
  }

  return time ? `${prefix} at ${formatClockTime(time)}` : prefix;
}
