// The DEADLINE MODEL for a weekly-checklist item, standalone from the item
// itself: what a deadline IS (WeeklyChecklistDeadline - recurring/weekly,
// one-off, daily, or monthly), how to build/classify/describe one, and the
// occurrence-math that answers "what instant does this deadline's current
// occurrence fall at" (checklistDeadlineInstant and its four per-kind
// helpers). Split out of weekly-checklist.ts (which had grown past this
// project's 1000-line cap) along the seam "a deadline, standalone" vs "a list
// of items and operations on that list" - weekly-checklist.ts owns
// WeeklyChecklistItem and everything that reads/writes a LIST of items
// (coerceWeeklyChecklist, toggle/add/remove/reorder/... and the
// checked/overdue predicates), and imports FROM this module wherever an item
// operation needs to reason about its deadline (isChecklistItemCheckedNow
// needs checklistDeadlineKind; isWeeklyChecklistItemOverdue needs
// checklistDeadlineInstant). This module never imports anything back from
// weekly-checklist.ts - it has no notion of an "item" at all, only a
// "deadline" - so the dependency between the two files is strictly one-way;
// weekly-checklist.ts re-exports every symbol below under its original name,
// so no existing call site needs to change its import path.
//
// A deadline is RECURRING (a day of week + optional time, repeating every
// calendar week - the only shape that existed before this file's non-recurring
// support was added), ONE-OFF (a single "YYYY-MM-DD" calendar date + optional
// time, happening exactly once), DAILY (every calendar day + optional time),
// or MONTHLY (a day of month, 1-31, clamped to the month's real last day, +
// optional time) - see WeeklyChecklistDeadline's own doc comment for the
// shape and why it is designed the way it is, and checklistDeadlineKind for
// the one place that resolves which of the four a given deadline is.
//
// AC7 naming note: this module's exported symbol names
// (WeeklyChecklistDeadline, checklistDeadlineKind, ...) keep the word
// "weekly" only where the pre-existing recurring behavior is meant (see the
// paragraph above) - everything NEW for non-recurring support
// (isOneOffChecklistDeadline, buildOneOffChecklistDeadline,
// buildDailyChecklistDeadline, buildMonthlyChecklistDeadline,
// checklistDeadlineInstant, parseChecklistDeadlineDate,
// normalizeChecklistDate) is deliberately named with "checklist", never
// "weekly checklist", since a one-off/daily/monthly deadline is by definition
// not weekly - baking "weekly" into a name for something that explicitly is
// not would be actively misleading, not just inconsistent. The pre-existing
// "recurring" kind name is NOT renamed to "weekly" even though it is now one
// of four frequencies rather than the only one - every existing caller
// already branches on the literal string "recurring", and renaming it is a
// separate, unrequested relabel effort this module does not take on.
//
// normalizeChecklistDate, normalizeTime, and weekdayOfDateString are
// exported (beyond what lived here originally) purely so
// weekly-checklist.ts's own coerceWeeklyChecklist can validate a raw
// deadline's `date`/`time`/derived-`weekday` fields using the EXACT same
// parsing this module's own build*ChecklistDeadline functions use, instead of
// a second, independently-typed copy that could silently drift out of sync -
// several doc comments below and in weekly-checklist.ts point out exactly
// this "must reject/accept identically on build vs on read" guarantee.
//
// No I/O, no Date.now()/crypto.randomUUID() calls except where `nowMs` is
// supplied by the caller - safe on client or server, fully unit-testable.

/**
 * A checklist item's deadline: either RECURRING (weekly) or ONE-OFF (a
 * single calendar date), distinguished by `date`.
 *
 * Shape decision (AC1): rather than a TypeScript discriminated union (two
 * differently-shaped variants, e.g. `{kind:"recurring", weekday, time} |
 * {kind:"one-off", date, time}`), this keeps ONE object shape and adds a
 * single new OPTIONAL field, `date`, alongside the pre-existing `weekday` -
 * "a nullable date alongside the weekday", one of the two shapes the
 * acceptance criteria itself offered. Two concrete reasons this is the
 * better fit here, not just the more convenient one:
 *
 * 1. Backward compatibility falls out for free. Every payload written
 *    before this change simply never mentions `date` at all. Because `date`
 *    is optional (not just nullable), "the key is absent" and "the key is
 *    explicitly null" are the SAME representation (`undefined`) everywhere
 *    this field is read (isOneOffChecklistDeadline treats both as falsy) -
 *    there are never two competing "this is recurring" encodings to keep in
 *    sync. A discriminated union would need an explicit `kind: "recurring"`
 *    written onto every migrated old row (or a parallel "kind is absent"
 *    special case threaded through every reader) to get the same guarantee.
 * 2. This codebase has TWO concurrently-owned consumers of this exact type
 *    that this wave must not edit: src/lib/weekly-checklist-table-helpers.ts
 *    (owned outright, no exception) and WeeklyChecklistCell.tsx (owned by a
 *    later wave; editable here only if literally required to compile). Both
 *    already read `.weekday` and `.time` unconditionally off a
 *    WeeklyChecklistDeadline, and WeeklyChecklistCell.tsx already constructs
 *    `{weekday, time}` object literals with no `date` key at several call
 *    sites (setItemWeekday/setItemTime/addItem). A discriminated union would
 *    either remove `weekday` from one branch's type (breaking the table
 *    helpers' unconditional `.weekday` read) or force every existing object
 *    literal to learn about a new required `kind`/`date` field (forcing an
 *    edit to the cell this wave is told not to make). Keeping one shape with
 *    an ADDITIONAL optional field means every pre-existing read and
 *    construction site keeps compiling, and keeps meaning "recurring",
 *    completely untouched.
 *
 * weekday uses 0=Sunday..6=Saturday, matching the days_of_week convention
 * already used by workflow_schedules (see
 * supabase/migrations/20260911000000_add_schedule_days_of_week.sql) so the
 * codebase has one weekday encoding rather than two. For a ONE-OFF deadline,
 * weekday is still populated (derived from `date` at construction time - see
 * coerceDeadline/buildOneOffChecklistDeadline) purely so every existing
 * consumer that already reads `.weekday` unconditionally (most notably
 * weekly-checklist-table-helpers.ts's "weekday" sort column) keeps producing
 * a sane, real value without needing to learn that one-off deadlines exist at
 * all; `date` is what actually decides the deadline's meaning wherever this
 * module needs to tell the two kinds apart.
 */
export interface WeeklyChecklistDeadline {
  weekday: number;
  /** Optional 24-hour "HH:MM", zero-padded. null means "by end of day" (no
   * specific time was set, just the day). */
  time: string | null;
  /**
   * Non-null ("YYYY-MM-DD") makes this deadline ONE-OFF: it happens exactly
   * once, on this specific calendar date, instead of recurring every week.
   * Absent (undefined) or null both mean "no one-off date" - i.e. RECURRING,
   * using `weekday` as it always has - and are treated identically
   * everywhere this field is read (see isOneOffChecklistDeadline). Optional
   * specifically so a pre-existing object literal that never mentions this
   * field (every payload stored before this change, and every
   * WeeklyChecklistDeadline literal written elsewhere in this codebase prior
   * to this change) remains valid TypeScript AND remains recurring, with no
   * migration step required - see this interface's own doc comment above for
   * why that guarantee mattered enough to shape the whole design around it.
   */
  date?: string | null;
  /**
   * Present + "daily"/"monthly" is what makes a deadline DAILY or MONTHLY
   * instead of the default weekly recurrence - the same "additional optional
   * field on the one existing shape" move `date` already made for one-off
   * (see this interface's own doc comment for the two concrete reasons that
   * shape was chosen over a discriminated union; both reasons apply again
   * here unchanged - table-helpers.ts and WeeklyChecklistCell.tsx still read
   * `.weekday`/`.time` unconditionally, and every pre-existing payload must
   * keep parsing and keep meaning weekly). Absent, or any value other than
   * exactly "daily"/"monthly", means "no frequency override" - i.e. the
   * pre-existing weekly recurrence, using `weekday` as it always has - see
   * checklistDeadlineKind's own precedence rule for why an UNRECOGNIZED
   * string (e.g. a payload written by a newer build with a frequency this
   * build does not know about yet) degrades to weekly rather than throwing
   * or vanishing from the list.
   *
   * A present `date` WINS over `frequency` unconditionally (checked first,
   * everywhere this module resolves "which kind is this") - a deadline
   * cannot simultaneously be "this one fixed calendar date" and "every day"
   * or "the Nth of every month", so a contradictory payload (both fields
   * set) is resolved in favor of the more specific, single-occurrence
   * meaning rather than left ambiguous.
   */
  frequency?: "daily" | "monthly";
  /**
   * The day of the month (1-31) a MONTHLY deadline falls on, only meaningful
   * when `frequency === "monthly"`. A month that does not HAVE that many
   * days (e.g. 31 in September, 30 or 31 in February) clamps to that month's
   * actual last day rather than rolling into the next month - see
   * checklistDeadlineInstant/daysInChecklistMonth, the single place this
   * clamp is computed, reused by the calendar planner
   * (course-calendar-checklist-events.ts) so the clamp can never be computed
   * two different, possibly-divergent ways.
   */
  dayOfMonth?: number;
}

/** Index = weekday (0=Sunday..6=Saturday) - see WeeklyChecklistDeadline. */
export const WEEKLY_CHECKLIST_WEEKDAY_LABELS: readonly string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/** "9:05" -> "09:05"; rejects an out-of-range, malformed, or non-string time. */
export function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = TIME_PATTERN.exec(raw.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "2026-08-15" -> the same string, or null for anything that is not a real
 * calendar date in exactly that shape - wrong type, wrong format, or a
 * plausible-looking but nonexistent date (e.g. "2026-02-30"). AC2 requires a
 * malformed date never become a DIFFERENT, silently-wrong date: plain
 * `new Date("2026-02-30")` would roll forward into March rather than reject,
 * which is exactly the failure this guards against - the constructed date is
 * read back and compared component-by-component against what was asked for,
 * and any mismatch (i.e. any rollover) is treated as malformed, same as a
 * wrong type or format.
 */
export function normalizeChecklistDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = DATE_PATTERN.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Parses an already-validated "YYYY-MM-DD" (see normalizeChecklistDate) into
 * a local-midnight Date. Exported so the calendar planner
 * (course-calendar-checklist-events.ts's one-off checklist event builder) can
 * build a one-off event's start Date without re-deriving date parsing a
 * second time - mirrors this module's own local-Date convention (see the
 * parseCourseDate idiom in course-calendar-dates.ts), never UTC.
 */
export function parseChecklistDeadlineDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** The weekday (0=Sunday..6=Saturday) an already-validated "YYYY-MM-DD" falls
 * on - used to populate WeeklyChecklistDeadline.weekday for a one-off
 * deadline, so it never needs to be separately supplied (or trusted) on the
 * way in - see coerceDeadline (weekly-checklist.ts) and
 * buildOneOffChecklistDeadline below. */
export function weekdayOfDateString(date: string): number {
  return parseChecklistDeadlineDate(date).getDay();
}

/**
 * Whether `deadline` is ONE-OFF (a single calendar date) rather than
 * recurring (weekly). null (no deadline at all) is never one-off. See
 * WeeklyChecklistDeadline.date's own doc comment for why "absent" and
 * "explicit null" are deliberately the same answer here.
 */
export function isOneOffChecklistDeadline(deadline: WeeklyChecklistDeadline | null): boolean {
  return !!deadline?.date;
}

/**
 * The three states a deadline can be in, from the UI's point of view
 * (wave 2's per-item/add-row "Schedule" control - WeeklyChecklistCell.tsx).
 * This is deliberately NOT how WeeklyChecklistDeadline itself is modeled
 * (see that interface's own doc comment for why a discriminated union was
 * rejected for the STORAGE shape) - `ChecklistDeadlineKind` exists only to
 * answer "which of the two schedule controls (day-of-week vs date) should
 * the UI show right now," a presentation question, not a storage one. Three
 * values rather than two ("recurring"/"one-off") because "no deadline at
 * all" is a real, distinct state the UI needs to render too (an item with no
 * schedule yet).
 *
 * "daily" and "monthly" were added alongside the pre-existing three without
 * renaming "recurring" to "weekly" - that rename is explicitly deferred (see
 * this module's own AC7 naming note at the top of the file) and every
 * existing caller already reads/branches on the literal string "recurring",
 * so introducing a same-meaning-different-name value here would be a second,
 * silent rename smuggled in alongside an unrelated feature.
 */
export type ChecklistDeadlineKind = "none" | "recurring" | "one-off" | "daily" | "monthly";

/**
 * Classifies a deadline for the UI's "Schedule" control. `null` is "none".
 * Otherwise resolved in a fixed precedence, checked in this exact order
 * everywhere this module needs "which kind is this" (checklistDeadlineInstant,
 * isChecklistItemCheckedNow (weekly-checklist.ts), describeWeeklyChecklistDeadline,
 * coerceDeadline (weekly-checklist.ts) all defer to - or independently
 * reproduce - this exact ordering):
 *
 * 1. A present `date` always means ONE-OFF, regardless of `frequency` - see
 *    isOneOffChecklistDeadline and WeeklyChecklistDeadline.frequency's own
 *    doc comment for why a single fixed calendar date outranks a repeating
 *    frequency rather than being ambiguous between the two.
 * 2. Otherwise, a RECOGNIZED `frequency` ("daily" or "monthly" - exactly
 *    those two literal strings) selects that kind.
 * 3. Otherwise (frequency absent, or any OTHER string - e.g. a payload
 *    written by a newer build using a frequency this build does not know
 *    about yet) - RECURRING, the pre-existing weekly behavior. This is what
 *    makes an unrecognized frequency degrade gracefully instead of throwing
 *    or making the item vanish from the list.
 */
export function checklistDeadlineKind(deadline: WeeklyChecklistDeadline | null): ChecklistDeadlineKind {
  if (!deadline) return "none";
  if (isOneOffChecklistDeadline(deadline)) return "one-off";
  if (deadline.frequency === "daily") return "daily";
  if (deadline.frequency === "monthly") return "monthly";
  return "recurring";
}

/**
 * Builds a one-off WeeklyChecklistDeadline for a "YYYY-MM-DD" date + optional
 * time, deriving `weekday` from the date so it can never disagree with it
 * (see the interface's own doc comment for why `weekday` is still populated
 * for a one-off deadline at all). Returns null for an invalid date string,
 * exactly like coerceWeeklyChecklist (weekly-checklist.ts) would reject the
 * same input on read - a caller-constructed deadline and one read back off
 * disk must never disagree about what counts as valid.
 */
export function buildOneOffChecklistDeadline(date: string, time: string | null): WeeklyChecklistDeadline | null {
  const normalizedDate = normalizeChecklistDate(date);
  if (!normalizedDate) return null;
  return { weekday: weekdayOfDateString(normalizedDate), time: normalizeTime(time), date: normalizedDate };
}

/**
 * Builds a DAILY WeeklyChecklistDeadline. Unlike buildOneOffChecklistDeadline
 * (rejects a malformed date) or buildMonthlyChecklistDeadline just below
 * (rejects an out-of-range day of month), there is no input here that could
 * make a daily deadline invalid - `time` already degrades gracefully via
 * normalizeTime (an unparsable time simply becomes "no specific time", never
 * an error) - so this always succeeds and returns a real value, never null.
 * `weekday` is populated with 0 purely to satisfy the interface's own
 * always-present `weekday` field (see WeeklyChecklistDeadline's own doc
 * comment for why every deadline carries one); nothing reads it for a daily
 * deadline - checklistDeadlineKind/checklistDeadlineInstant both check
 * `frequency` before ever looking at `weekday` for this kind.
 */
export function buildDailyChecklistDeadline(time: string | null): WeeklyChecklistDeadline {
  return { weekday: 0, time: normalizeTime(time), frequency: "daily" };
}

/**
 * Builds a MONTHLY WeeklyChecklistDeadline for a requested day-of-month (1-31)
 * + optional time. Returns null for a non-integer or out-of-range day of
 * month, mirroring buildOneOffChecklistDeadline's own "reject at the
 * boundary, exactly like coerceWeeklyChecklist would reject the same input on
 * read" contract (see coerceDeadline's own monthly branch in
 * weekly-checklist.ts, which applies the identical 1-31 integer check).
 * Deliberately does NOT clamp an out-of-range value down to something in
 * range here (e.g. silently turning 35 into 31) - that would hide a typo as
 * a plausible-looking but unintended day. The CLAMPING this feature is
 * actually known for (September 31 -> September 30) is a different thing
 * entirely: it happens at READ time, per calendar month, in
 * checklistDeadlineInstant/daysInChecklistMonth below, because "clamp to the
 * month's last real day" is only answerable once you know WHICH month you
 * are resolving against - at build time, with no month in view yet, 31 is
 * simply a valid day of month (every month has at least a 28th, but no month
 * has fewer than 28 days, so 1-31 is the correct STATIC range to validate
 * here regardless of which month it later resolves against).
 */
export function buildMonthlyChecklistDeadline(dayOfMonth: number, time: string | null): WeeklyChecklistDeadline | null {
  if (typeof dayOfMonth !== "number" || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    return null;
  }
  return { weekday: 0, time: normalizeTime(time), frequency: "monthly", dayOfMonth };
}

/** hour/minute here are already range-checked by normalizeTime. */
function formatClockTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour24 = Number(hourStr);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12raw = hour24 % 12;
  const hour12 = hour12raw === 0 ? 12 : hour12raw;
  return `${hour12}:${minuteStr} ${period}`;
}

const MONTH_LABELS: readonly string[] = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-08-15" -> "Aug 15, 2026". A fixed table (not toLocaleDateString) so
 * this stays deterministic across environments/locales, matching how
 * formatClockTime above builds its own output by hand rather than via a
 * locale-dependent API. */
function formatChecklistDateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${MONTH_LABELS[month - 1]} ${day}, ${year}`;
}

/** Human display for a deadline: "Sundays"/"Sundays at 11:59 PM" for a
 * recurring deadline, "Aug 15, 2026"/"Aug 15, 2026 at 11:59 PM" for a
 * one-off one, "Daily"/"Daily at 5:00 PM" for a daily one, or "Monthly on day
 * 15"/"Monthly on day 15 at 5:00 PM" for a monthly one. null -> "". Branches
 * in the exact same precedence order checklistDeadlineKind resolves kind in
 * (date, then frequency, then the recurring fallback) so this can never
 * describe a deadline as a DIFFERENT kind than checklistDeadlineKind would
 * classify it as - an unrecognized `frequency` therefore falls all the way
 * through to the plain weekday description, matching that function's own
 * "unrecognized frequency degrades to recurring" rule exactly. */
export function describeWeeklyChecklistDeadline(deadline: WeeklyChecklistDeadline | null): string {
  if (!deadline) return "";
  if (deadline.date) {
    const dateLabel = formatChecklistDateLabel(deadline.date);
    return deadline.time ? `${dateLabel} at ${formatClockTime(deadline.time)}` : dateLabel;
  }
  if (deadline.frequency === "daily") {
    return deadline.time ? `Daily at ${formatClockTime(deadline.time)}` : "Daily";
  }
  if (deadline.frequency === "monthly") {
    const day = typeof deadline.dayOfMonth === "number" ? deadline.dayOfMonth : 1;
    return deadline.time ? `Monthly on day ${day} at ${formatClockTime(deadline.time)}` : `Monthly on day ${day}`;
  }
  const day = WEEKLY_CHECKLIST_WEEKDAY_LABELS[deadline.weekday];
  return deadline.time ? `${day}s at ${formatClockTime(deadline.time)}` : `${day}s`;
}

const DAY_MS = 86_400_000;

/**
 * The instant (epoch ms) THIS CALENDAR WEEK's occurrence of `deadline` falls
 * at, for the week containing `nowMs`. Weeks are anchored on Sunday (day 0),
 * matching the 0=Sunday weekday convention directly - unlike
 * assignment-due-rule.ts's dueDateForWeek, this never needs a course start
 * date or Monday-anchoring, because it is not counting course-relative
 * weeks: it only asks "where are we in the current real-world week".
 * A missing time is treated as end of day (23:59:59.999) - "by that day",
 * not "by midnight at its start". Pure: `now` is passed in, never read from
 * the clock internally.
 *
 * RECURRING ONLY - this keeps its pre-existing name and contract unchanged
 * (AC7; every existing caller/test already assumes "weekly occurrence").
 * checklistDeadlineInstant below is the new entry point that also handles a
 * one-off deadline; it delegates to this function for the recurring case
 * rather than duplicating this arithmetic.
 */
export function weeklyOccurrenceInstant(deadline: WeeklyChecklistDeadline, nowMs: number): number {
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday.getTime() - now.getDay() * DAY_MS);
  const occurrence = new Date(startOfWeek.getTime() + deadline.weekday * DAY_MS);
  applyDeadlineTimeOfDay(occurrence, deadline.time);
  return occurrence.getTime();
}

/**
 * The instant (epoch ms) a ONE-OFF deadline's single, fixed occurrence falls
 * at - counterpart to weeklyOccurrenceInstant for the recurring case.
 * Deliberately takes no `nowMs`: a one-off date does not move depending on
 * "where are we in the current week", unlike a recurring one.
 */
function oneOffChecklistDeadlineInstant(deadline: WeeklyChecklistDeadline): number {
  const occurrence = parseChecklistDeadlineDate(deadline.date as string);
  applyDeadlineTimeOfDay(occurrence, deadline.time);
  return occurrence.getTime();
}

/** Applies a deadline's optional `time` (or end-of-day, 23:59:59.999, when
 * absent) to `occurrence` IN PLACE - the one piece of arithmetic
 * weeklyOccurrenceInstant, oneOffChecklistDeadlineInstant, and the daily/
 * monthly instant functions below ALL share, extracted so "what does a
 * missing time mean" is answered in exactly one place rather than four
 * copies that could quietly drift apart. */
function applyDeadlineTimeOfDay(occurrence: Date, time: string | null): void {
  if (time) {
    const [hourStr, minuteStr] = time.split(":");
    occurrence.setHours(Number(hourStr), Number(minuteStr), 0, 0);
  } else {
    occurrence.setHours(23, 59, 59, 999);
  }
}

/** The real number of days in the given local calendar month (monthIndex0:
 * 0=Jan..11=Dec) - "day 0 of next month" is a well-known JS Date idiom for
 * "the last day of this month". Exported so the calendar planner
 * (course-calendar-checklist-events.ts's monthly checklist event builder)
 * reuses this EXACT clamp instead of a second, possibly-divergent
 * implementation of "how many days does September have" - see
 * monthlyOccurrenceInstant below for the other caller. */
export function daysInChecklistMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/**
 * The instant (epoch ms) a DAILY deadline's occurrence falls at for the
 * calendar day containing `nowMs` - "today", in other words. A daily
 * deadline's `weekday`/`date`/`dayOfMonth` are all irrelevant here; only
 * `time` (or end-of-day) matters, applied to today's own date.
 */
function dailyOccurrenceInstant(deadline: WeeklyChecklistDeadline, nowMs: number): number {
  const now = new Date(nowMs);
  const occurrence = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  applyDeadlineTimeOfDay(occurrence, deadline.time);
  return occurrence.getTime();
}

/**
 * The instant (epoch ms) a MONTHLY deadline's occurrence falls at for the
 * calendar month containing `nowMs` - `dayOfMonth` CLAMPED to that month's
 * actual last day via daysInChecklistMonth (AC: September 31 becomes
 * September 30, February 30 becomes February 28/29, never rolling into the
 * following month the way plain `new Date(year, month, 31)` construction
 * would for a 30-day month). A missing/invalid `dayOfMonth` (should never
 * happen for a deadline that actually came from buildMonthlyChecklistDeadline
 * or coerceWeeklyChecklist, both of which validate it - defensive only)
 * falls back to day 1 rather than producing NaN arithmetic.
 */
function monthlyOccurrenceInstant(deadline: WeeklyChecklistDeadline, nowMs: number): number {
  const now = new Date(nowMs);
  const year = now.getFullYear();
  const month = now.getMonth();
  const requestedDay = typeof deadline.dayOfMonth === "number" ? deadline.dayOfMonth : 1;
  const clampedDay = Math.min(requestedDay, daysInChecklistMonth(year, month));
  const occurrence = new Date(year, month, clampedDay);
  applyDeadlineTimeOfDay(occurrence, deadline.time);
  return occurrence.getTime();
}

/**
 * The instant (epoch ms) `deadline`'s relevant occurrence falls at, for ANY
 * kind (AC3) - the single entry point isWeeklyChecklistItemOverdue
 * (weekly-checklist.ts) (and any future caller) uses so "which kind is this,
 * and what does that imply for the relevant instant" is decided in exactly
 * one place. One-off returns its own fixed instant, ignoring `nowMs` entirely
 * (there is no "which week/day/month" for a single date); daily and monthly
 * resolve against "today"/"this month" (both depend on `nowMs`); recurring
 * delegates to weeklyOccurrenceInstant unchanged ("this calendar week").
 * Checked in the same precedence checklistDeadlineKind uses (date wins, then
 * a recognized frequency, then the recurring fallback) rather than calling
 * checklistDeadlineKind itself, purely to avoid a second
 * isOneOffChecklistDeadline check on the hot "is this item overdue" path
 * every render walks - the precedence is identical either way.
 */
export function checklistDeadlineInstant(deadline: WeeklyChecklistDeadline, nowMs: number): number {
  if (isOneOffChecklistDeadline(deadline)) return oneOffChecklistDeadlineInstant(deadline);
  if (deadline.frequency === "daily") return dailyOccurrenceInstant(deadline, nowMs);
  if (deadline.frequency === "monthly") return monthlyOccurrenceInstant(deadline, nowMs);
  return weeklyOccurrenceInstant(deadline, nowMs);
}

/** "YYYY-MM-DD" for `nowMs`'s own local calendar date - the default a
 * one-off deadline seeds itself with when the UI switches an item TO
 * one-off with no prior date to fall back on (see
 * resolveDeadlineForKindChange). Not exported: this is an implementation
 * detail of that one caller, not a general-purpose formatter - unlike
 * parseChecklistDeadlineDate (the inverse direction), which IS exported
 * because course-calendar-checklist-events.ts genuinely needs it. */
function todayDateString(nowMs: number): string {
  const d = new Date(nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Resolves the deadline a checklist item should have immediately after the
 * UI's "Schedule" control (WeeklyChecklistCell.tsx) is switched to `kind` -
 * AC1's none/recurring/one-off choice, for an EXISTING item (the add row
 * uses its own, simpler logic - see addItem's own comment for why: nothing
 * commits until "Add" is clicked, so it never needs a provisional default
 * the way an existing item's immediate-commit edit does). Every mutation in
 * weekly-checklist.ts commits immediately (see that module's own comment),
 * and the "Schedule" control is no exception: switching it does not leave
 * the item in a half-edited limbo waiting for a second field to be filled
 * in, it produces an immediately valid (if provisional) deadline of the
 * requested kind, which the subsequently-revealed day-select or date-field
 * then lets the instructor refine. That is the only way to make "which
 * kind" its own control at all without inventing a second, parallel piece of
 * state to track a pending kind that has not been "confirmed" into an
 * actual deadline yet - a distinction weekly-checklist.ts's
 * persistent-commit design does not otherwise need anywhere else.
 *
 * - kind "none" always returns null, regardless of `current` - this is now
 *   the ONLY way to clear an item's deadline entirely (the day-select no
 *   longer offers its own separate "No deadline" entry - see
 *   WeeklyChecklistCell.tsx's per-item Day select, which only ever lists the
 *   seven real weekdays now that this control owns "no deadline" outright).
 * - Switching to the kind the deadline is ALREADY in (recurring ->
 *   recurring, one-off -> one-off) is a no-op: returns `current` unchanged,
 *   object identity included, so callers can skip a pointless save.
 * - one-off -> recurring reuses the one-off deadline's own DERIVED weekday
 *   (see WeeklyChecklistDeadline's own doc comment for why `weekday` is
 *   always populated even on a one-off deadline) and its time, dropping
 *   only `date` - no data is invented, and the weekday shown afterward is
 *   the exact weekday the one-off date happened to fall on, not a
 *   surprising default.
 * - none -> recurring has nothing to reuse, so it defaults to Sunday
 *   (weekday 0) with no time - the same "just pick something reasonable,
 *   let the instructor refine it" contract the day-select's own first
 *   render already relies on for a brand new item.
 * - recurring -> one-off and none -> one-off both default the date to
 *   TODAY (`nowMs`, caller-supplied so this stays pure/testable - see the
 *   module comment's "no Date.now() except where nowMs is supplied"
 *   contract), carrying over `current.time` when there was one. Today,
 *   not some derived "next occurrence of that weekday," because inventing a
 *   future-date guess the instructor did not ask for is exactly the kind of
 *   silent guess this module avoids elsewhere (see normalizeChecklistDate's
 *   own no-guessing contract) - today is neutral, obviously provisional, and
 *   always a single edit away from being correct via the date field shown
 *   right after.
 * - switching TO "daily" always succeeds immediately (buildDailyChecklistDeadline
 *   never rejects its input - see that function's own doc comment) and
 *   carries `current.time` forward when there was one; there is nothing else
 *   to reuse or invent, since a daily deadline needs only a time.
 * - switching TO "monthly" carries `current.time` forward the same way, and
 *   defaults the day-of-month to `nowMs`'s OWN day-of-month (always a valid
 *   1-31 value, so buildMonthlyChecklistDeadline can never reject it here) -
 *   the same "ground the provisional default in right now, refine via the
 *   field shown right after" philosophy as recurring/one-off's own "default
 *   to today" rule above, applied to a day-of-month instead of a full date.
 * - every "already in kind X" no-op check (recurring/one-off/daily/monthly)
 *   uses checklistDeadlineKind, not a hand-rolled shape test, so a deadline
 *   currently in one of the OTHER new kinds is never mistaken for "already
 *   recurring" the way a looser `!isOneOffChecklistDeadline(current)` check
 *   would (that check is also true for a daily or monthly deadline, which
 *   are NOT recurring and must not be returned unchanged when the instructor
 *   explicitly asked to switch TO recurring).
 */
export function resolveDeadlineForKindChange(
  current: WeeklyChecklistDeadline | null,
  kind: ChecklistDeadlineKind,
  nowMs: number
): WeeklyChecklistDeadline | null {
  if (kind === "none") return null;
  if (kind === "recurring") {
    if (current && checklistDeadlineKind(current) === "recurring") return current; // already recurring
    if (current) return { weekday: current.weekday, time: current.time }; // reuse derived/default weekday + time
    return { weekday: 0, time: null }; // none -> recurring: default Sunday
  }
  if (kind === "daily") {
    if (current && checklistDeadlineKind(current) === "daily") return current; // already daily
    return buildDailyChecklistDeadline(current?.time ?? null);
  }
  if (kind === "monthly") {
    if (current && checklistDeadlineKind(current) === "monthly") return current; // already monthly
    // new Date(nowMs).getDate() is always an integer 1-31 by definition, so
    // buildMonthlyChecklistDeadline can never actually reject it here - see
    // that function's own range check, which only rejects OUT-OF-RANGE or
    // non-integer input.
    return buildMonthlyChecklistDeadline(new Date(nowMs).getDate(), current?.time ?? null)!;
  }
  // kind === "one-off"
  if (current && isOneOffChecklistDeadline(current)) return current; // already one-off
  return buildOneOffChecklistDeadline(todayDateString(nowMs), current?.time ?? null);
}

/**
 * Whether a checklist item mutation should trigger a calendar push, given the
 * item's deadline just before and just after the change. True whenever a
 * deadline exists on EITHER side: gaining a deadline (needs a create), losing
 * one (needs the old occurrences deleted), or keeping a non-null deadline
 * through a rename/re-time/re-day/toggle (needs an update). False only when
 * the deadline was null before AND stays null after - nothing was ever
 * created for that item, so there is nothing to push and nothing to clean
 * up.
 *
 * Pure and side-effect-free: the caller (WeeklyChecklistCell.tsx) uses this
 * to decide whether to invoke the scoped calendar sync action
 * (syncChecklistItemCalendarAction) at all, so adding an item with no
 * deadline, renaming an item that has never had one, or removing one that
 * never had one, never makes a calendar API round trip - there is nothing
 * that call could possibly find to create, update, or delete.
 */
export function checklistDeadlineChangeNeedsCalendarSync(
  before: WeeklyChecklistDeadline | null,
  after: WeeklyChecklistDeadline | null
): boolean {
  return before !== null || after !== null;
}
