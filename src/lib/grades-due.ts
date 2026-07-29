// Pure helpers for the course_hub.grades_due_date / grades_due_time columns:
// a single CALENDAR DATE (nullable) plus an optional clock time - when final
// grades are due for the course. This is deliberately NOT modeled like
// assignment-due-rule.ts's RECURRING day-of-week rule: a grades deadline
// falls on one specific date, it does not repeat every week the way an
// assignment deadline does.
//
// Stored as two plain scalar columns (grades_due_date date, grades_due_time
// text) rather than one encoded string: a real calendar date benefits from
// staying a native, directly comparable value (unlike assignment_due_rule's
// single "day|time" string, which exists specifically to let a RECURRING
// rule round-trip as one opaque value), and two independent columns let a
// malformed read degrade field-by-field (see coerceGradesDue) rather than
// one bad half poisoning the other.
//
// No I/O, no Date.now() calls - safe on client or server, fully
// unit-testable. Every function here treats its input as untrusted (matches
// this codebase's convention of validating persisted content defensively on
// read, e.g. weekly-checklist.ts's coerceWeeklyChecklist) even though a
// Postgres `date` column cannot itself store an invalid calendar date - this
// is defense in depth against a hand-edited row, and gives the Courses tab
// one place that guarantees a malformed value degrades to empty rather than
// crashing.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
// Exactly 1-2 digit hour (single-digit hours like "9:05" are the only
// formatting slack accepted) and exactly 2-digit minute; range-checked
// below. Mirrors assignment-due-rule.ts's TIME_PATTERN.
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  // Date normalizes an out-of-range day/month (e.g. Feb 30 -> Mar 2) rather
  // than throwing, so a genuinely invalid calendar date is caught by
  // checking the round-trip, not by range-checking month/day up front.
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/** Validates a "YYYY-MM-DD" calendar date (the shape a native
 * `<input type="date">` produces), rejecting malformed strings and
 * out-of-range calendar dates (e.g. "2026-02-30"). Returns the trimmed
 * string unchanged (never reformatted) on success, null otherwise. */
export function coerceGradesDueDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const match = DATE_PATTERN.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCalendarDate(year, month, day)) return null;
  return trimmed;
}

/** "9:05" -> "09:05"; rejects an out-of-range, malformed, or non-string time.
 * Mirrors assignment-due-rule.ts's normalizeTime. */
export function coerceGradesDueTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = TIME_PATTERN.exec(raw.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export interface GradesDue {
  date: string | null;
  time: string | null;
}

/**
 * Combined defensive read: coerces the date, then the time - but only when a
 * valid date is present. A time with no date is meaningless (mirrors the "a
 * time with no weekday is meaningless" guard AssignmentDueCell.tsx and
 * WeeklyChecklistCell.tsx apply to their own day/time pairs), so a missing or
 * malformed date always yields both date and time null, regardless of what
 * the raw time value was.
 */
export function coerceGradesDue(rawDate: unknown, rawTime: unknown): GradesDue {
  const date = coerceGradesDueDate(rawDate);
  return { date, time: date ? coerceGradesDueTime(rawTime) : null };
}

/** hour/minute here are already range-checked - time always comes from
 * coerceGradesDueTime's normalized "HH:MM". Duplicated (not imported) from
 * assignment-due-rule.ts/weekly-checklist.ts, matching this codebase's
 * existing convention of each deadline-shaped module owning its own copy. */
function formatClockTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour24 = Number(hourStr);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12raw = hour24 % 12;
  const hour12 = hour12raw === 0 ? 12 : hour12raw;
  return `${hour12}:${minuteStr} ${period}`;
}

/**
 * Human display for the cell, e.g. "Dec 15, 2026" or "Dec 15, 2026 at 5:00
 * PM". Returns "" when date is absent/invalid. Parsed with an explicit
 * T00:00:00 local-time suffix (matching CourseRow.tsx's existing
 * startDate/endDate display) so the date does not shift a day under UTC
 * parsing.
 */
export function describeGradesDue(date: string | null | undefined, time: string | null | undefined): string {
  const validDate = coerceGradesDueDate(date);
  if (!validDate) return "";
  const parsed = new Date(`${validDate}T00:00:00`);
  const dateStr = parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const validTime = coerceGradesDueTime(time);
  return validTime ? `${dateStr} at ${formatClockTime(validTime)}` : dateStr;
}
