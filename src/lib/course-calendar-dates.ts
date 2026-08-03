// Shared local-date arithmetic, PLUS the small vocabulary of types
// (CourseEventKind, PlannedEvent, CourseCalendarBlocker) that both
// course-calendar-events.ts (term/meeting/test/due + the overall plan) and
// course-calendar-checklist-events.ts (checklist-specific events) need to
// agree on. This module is the DEPENDENCY ROOT for the course-calendar-*
// split: course-calendar-events.ts's buildCourseEvents calls the checklist
// event builders in course-calendar-checklist-events.ts, so that direction is
// fixed (course-calendar-events.ts -> course-calendar-checklist-events.ts)
// and the reverse is forbidden - see course-calendar-checklist-events.ts's own
// header comment. Anything BOTH siblings need therefore cannot live in either
// one of them (whichever one it lived in, the other would have to import it
// backwards) - it has to live in a module NEITHER of them depends on, which
// is exactly what this file is: it imports nothing from either sibling, and
// both siblings import from it.
//
// That is also why CourseEventKind/PlannedEvent/CourseCalendarBlocker live
// here despite this module's name being about dates: they are the one other
// category of "both sides need this" beyond date arithmetic, and inventing a
// fourth file just for three small type declarations would add an extra
// dependency hop for no real benefit. course-calendar-events.ts re-exports
// all three under their original names (as it already did before this split),
// so no existing call site needs to change its import path.
//
// All date arithmetic below uses plain local Date getters/setters (getDate,
// setDate, getHours, setHours, ...) - never toISOString/UTC methods - the
// same convention src/lib/workflows/registry-helpers.ts's weekDeadline and
// src/lib/assignment-due-rule.ts's dueDateForWeek already use. Parsing a
// course date column via `${raw}T00:00:00` (no "Z") and later reading it back
// through local getters round-trips exactly, regardless of which time zone
// the process itself happens to run in - see steps.assignments-creation.ts
// for the same parsing idiom.

// ── shared types ────────────────────────────────────────────────────────

export type CourseEventKind = "term" | "meeting" | "test" | "due" | "checklist";

export interface PlannedEvent {
  /** Stable identity across re-syncs. See diffPlannedEvents (course-calendar-events.ts). */
  key: string;
  kind: CourseEventKind;
  summary: string;
  description: string;
  /** Local wall-clock ISO (no Z) for timed events. */
  startISO: string;
  endISO: string;
  /** All-day events use date-only ("YYYY-MM-DD") bounds instead. */
  allDay: boolean;
}

export type CourseCalendarBlocker = "missing-dates" | "not-connected";

// ── local date helpers (all local-time - see the module doc comment) ──────

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse a "YYYY-MM-DD" course date column into a local Date. Null for an
 * absent/blank value or a malformed stored string, rather than propagating a
 * silently-wrong Date. */
export function parseCourseDate(raw: string | null | undefined): Date | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const d = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** "YYYY-MM-DD" - the date-only bound all-day PlannedEvents use. */
export function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "YYYY-MM-DDTHH:mm:00", no trailing Z - the wall-clock bound timed
 * PlannedEvents use (see PlannedEvent.startISO/endISO doc). */
export function localDateTime(d: Date): string {
  return `${dateOnly(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
}

/** Local midnight for `d`'s own calendar date. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whether two Dates fall on the exact same local calendar day - used to
 * mark CHECKLIST_DONE_PREFIX on exactly the day a DAILY item was checked in
 * (see course-calendar-checklist-events.ts's buildDailyChecklistEvents),
 * mirroring how buildChecklistEvents already marks exactly the WEEK a
 * recurring item was checked in via sundayOfWeek equality. */
export function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Whether two Dates fall in the exact same local calendar month - the
 * MONTHLY counterpart to isSameCalendarDay above, used to mark
 * CHECKLIST_DONE_PREFIX on exactly the month a MONTHLY item was checked in
 * (see course-calendar-checklist-events.ts's buildMonthlyChecklistEvents). */
export function isSameCalendarMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * The Sunday (local midnight) that begins the calendar week containing `d` -
 * Sunday-anchored (day 0), matching WeeklyChecklistDeadline's own 0=Sunday
 * convention and checklist-deadline.ts's weeklyOccurrenceInstant, NOT the
 * Monday-anchored course-week arithmetic mondayOfStartWeek/mondayOfWeek use
 * below for meetings/tests/due dates. Checklist deadlines are not
 * course-week-numbered - they recur on a real-world weekday - so this
 * intentionally uses a different anchor than the rest of this module.
 * Exported (and re-exported from course-calendar-events.ts, for backward
 * compatibility) so the caller (src/app/actions/course-calendar.ts's targeted
 * single-item sync) can find "this week's" planned checklist event without
 * duplicating the arithmetic.
 */
export function sundayOfWeek(d: Date): Date {
  const start = startOfDay(d);
  return addDays(start, -start.getDay());
}

/** The Monday that begins `start`'s own week - the same arithmetic
 * weekDeadline (registry-helpers.ts) and dueDateForWeek (assignment-due-rule.ts)
 * use, copied rather than imported since neither exposes this intermediate
 * step standalone (test-schedule.ts's docstring notes the same tradeoff for
 * deriveTestWeeks's formula). */
export function mondayOfStartWeek(start: Date): Date {
  const monday0 = new Date(start);
  const day = monday0.getDay();
  monday0.setDate(monday0.getDate() + (day === 0 ? -6 : 1 - day));
  return monday0;
}

/** The Monday that begins week `week` (1-based, clamped to 1). */
export function mondayOfWeek(start: Date, week: number): Date {
  const effectiveWeek = week < 1 ? 1 : week;
  const weekStart = mondayOfStartWeek(start);
  weekStart.setDate(weekStart.getDate() + (effectiveWeek - 1) * 7);
  return weekStart;
}

/** Monday-anchored offset (0-6) for a Date.getDay() value (0=Sun..6=Sat) -
 * e.g. Monday -> 0, Sunday -> 6. Arithmetic equivalent of
 * assignment-due-rule.ts's WEEKDAY_MONDAY_OFFSET table, expressed as a
 * formula since parseDayTime's days are plain Date.getDay() numbers, not
 * Weekday strings. */
export function mondayAnchoredOffset(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/** The calendar date for a given week + Date.getDay() weekday. */
export function dateForWeekday(start: Date, week: number, jsDay: number): Date {
  const weekStart = mondayOfWeek(start, week);
  const d = new Date(weekStart);
  d.setDate(weekStart.getDate() + mondayAnchoredOffset(jsDay));
  return d;
}

/** The earliest weekday (Monday-first) in a non-empty days set - "the class
 * day of that week" for a test event when dayTime parses. */
export function earliestWeekday(days: Set<number>): number {
  let best = -1;
  let bestOffset = 7;
  for (const d of days) {
    const offset = mondayAnchoredOffset(d);
    if (offset < bestOffset) {
      bestOffset = offset;
      best = d;
    }
  }
  return best;
}
