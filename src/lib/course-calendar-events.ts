// Pure course -> Google Calendar event planner. No Google, no I/O, no
// Date.now() - every date is derived from the course row alone, so the same
// course always produces the same plan. That determinism is what makes a
// re-sync's diff (diffPlannedEvents below) meaningful: comparing "what should
// exist" against "what the calendar already has tagged for this course" only
// makes sense if "what should exist" is stable and reproducible.
//
// This module owns the "what would we write" half of the sync. The
// Google-facing "how do we write it" half (auth, HTTP, resolving the target
// calendar, applying the diff, counting untagged events) lives entirely in
// src/app/actions/course-calendar.ts, which is the only caller.
//
// All date arithmetic below uses plain local Date getters/setters (getDate,
// setDate, getHours, setHours, ...) - never toISOString/UTC methods - the
// same convention src/lib/workflows/registry-helpers.ts's weekDeadline and
// src/lib/assignment-due-rule.ts's dueDateForWeek already use. Parsing a
// course date column via `${raw}T00:00:00` (no "Z") and later reading it back
// through local getters round-trips exactly, regardless of which time zone
// the process itself happens to run in - see steps.assignments-creation.ts
// for the same parsing idiom.

import type { Course } from "@/lib/supabase/courses";
import { parseAssignmentDueRule, dueDateForWeek } from "@/lib/assignment-due-rule";
import { deriveTestWeeks } from "@/lib/test-schedule";
import { parseDayTime } from "@/lib/workflows/registry-helpers";
import {
  coerceWeeklyChecklist,
  isOneOffChecklistDeadline,
  parseChecklistDeadlineDate,
  type WeeklyChecklistItem,
} from "@/lib/weekly-checklist";

export type CourseEventKind = "term" | "meeting" | "test" | "due" | "checklist";

// AUTHORIZED EXCEPTION to AGENTS.md's "no emojis in the codebase" rule: the
// instructor explicitly and repeatedly asked for an emoji check mark on the
// calendar event for a checked weekly-checklist week, with the conflict
// spelled out to them (see the PR/session that introduced this constant).
// U+2705 WHITE HEAVY CHECK MARK is permitted ONLY as the value of this one
// constant, used solely as the checklist event title prefix for the week an
// item was checked in - see buildChecklistEvents below. It must not appear
// anywhere else (comments, UI copy, test names, other strings): the no-emoji
// rule still governs the rest of this file and the rest of the codebase. Do
// not "fix" this away in a future emoji lint sweep.
export const CHECKLIST_DONE_PREFIX = "✅ ";

export interface PlannedEvent {
  /** Stable identity across re-syncs. See diffPlannedEvents. */
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

export interface BuildCourseEventsInput {
  course: Course;
  /** Injected so the module stays pure and testable. Not used to filter
   * events in this wave (there is no "only sync upcoming occurrences" rule
   * yet) - accepted now for API stability if a later wave adds one. */
  today?: Date;
}

export interface BuildCourseEventsResult {
  events: PlannedEvent[];
  notes: string[];
}

// ── local date helpers (all local-time - see the module doc comment) ───────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse a "YYYY-MM-DD" course date column into a local Date. Null for an
 * absent/blank value or a malformed stored string, rather than propagating a
 * silently-wrong Date. */
function parseCourseDate(raw: string | null | undefined): Date | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const d = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** "YYYY-MM-DD" - the date-only bound all-day PlannedEvents use. */
function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "YYYY-MM-DDTHH:mm:00", no trailing Z - the wall-clock bound timed
 * PlannedEvents use (see PlannedEvent.startISO/endISO doc). */
function localDateTime(d: Date): string {
  return `${dateOnly(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
}

/** Local midnight for `d`'s own calendar date. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * The Sunday (local midnight) that begins the calendar week containing `d` -
 * Sunday-anchored (day 0), matching WeeklyChecklistDeadline's own 0=Sunday
 * convention and weekly-checklist.ts's weeklyOccurrenceInstant, NOT the
 * Monday-anchored course-week arithmetic mondayOfStartWeek/mondayOfWeek use
 * above for meetings/tests/due dates. Checklist deadlines are not
 * course-week-numbered - they recur on a real-world weekday - so this
 * intentionally uses a different anchor than the rest of the file. Exported
 * so the caller (src/app/actions/course-calendar.ts's targeted single-item
 * sync) can find "this week's" planned checklist event without duplicating
 * the arithmetic.
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
function mondayOfStartWeek(start: Date): Date {
  const monday0 = new Date(start);
  const day = monday0.getDay();
  monday0.setDate(monday0.getDate() + (day === 0 ? -6 : 1 - day));
  return monday0;
}

/** The Monday that begins week `week` (1-based, clamped to 1). */
function mondayOfWeek(start: Date, week: number): Date {
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
function mondayAnchoredOffset(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/** The calendar date for a given week + Date.getDay() weekday. */
function dateForWeekday(start: Date, week: number, jsDay: number): Date {
  const weekStart = mondayOfWeek(start, week);
  const d = new Date(weekStart);
  d.setDate(weekStart.getDate() + mondayAnchoredOffset(jsDay));
  return d;
}

/** The earliest weekday (Monday-first) in a non-empty days set - "the class
 * day of that week" for a test event when dayTime parses. */
function earliestWeekday(days: Set<number>): number {
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

/** A usable weeks count (positive integer), or null when unset/invalid. */
function validWeeks(weeks: number | null): number | null {
  if (typeof weeks !== "number" || !Number.isFinite(weeks)) return null;
  const n = Math.floor(weeks);
  return n > 0 ? n : null;
}

/** A usable class-length-in-minutes, or null when unset/invalid. classLengthMinutes
 * is never defaulted (see Course's own doc comment) - a missing or
 * non-positive value must skip meetings, never invent a duration. */
function validClassLength(minutes: number | null): number | null {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return null;
  return minutes > 0 ? minutes : null;
}

function courseLabel(course: Course): string {
  return course.courseCode?.trim() || course.name;
}

const TEST_DERIVED_DESCRIPTION =
  "Estimated: tests are spaced evenly across the term. Adjust as needed.";

/**
 * One PlannedEvent per (RECURRING checklist item with a deadline) x (calendar
 * week the item's weekday falls on), bounded by [boundStart, boundEnd]
 * inclusive - AC3: expanded up front, never stored as a recurring rule, so a
 * course that ended months ago stops producing occurrences instead of
 * reminding forever. The bound is the course's own startDate/endDate (NOT
 * startDate+weeks, unlike meeting/test/due above) - see buildCourseEvents's
 * call site for why. A ONE-OFF item never reaches this function at all - see
 * buildCourseEvents' checklist section, which routes one-off items to
 * buildOneOffChecklistEvents instead; the `isOneOffChecklistDeadline` guard
 * below is only a defensive backstop against a future caller passing mixed
 * input, not the primary gate.
 *
 * Weeks are enumerated Sunday-anchored (sundayOfWeek), starting from the
 * Sunday of boundStart's own week, stepping by 7 days; an occurrence is only
 * emitted when its actual calendar date falls within the bound - the first
 * and last weeks may therefore contribute zero or one occurrence depending on
 * where the deadline's weekday lands relative to term start/end. weekIndex
 * (0-based, counting every stepped week regardless of whether it produced an
 * occurrence) makes each item's per-week key stable across re-syncs: renaming
 * or re-timing the SAME weekday leaves keys (and therefore Google event ids)
 * untouched, so diffPlannedEvents updates in place rather than
 * delete+recreate. Changing the weekday shifts every occurrence's date and
 * therefore which weeks actually produce an event, so old keys fall out of
 * `planned` and get cleaned up as deletes on the next sync (AC6).
 *
 * AC4: the CHECKLIST_DONE_PREFIX is applied to exactly the occurrence whose
 * OWN week (its sundayOfWeek) matches the Sunday-anchored week containing
 * item.checkedAt - i.e. "the week it was checked in", never every week.
 */
function buildChecklistEvents(
  items: WeeklyChecklistItem[],
  boundStart: Date,
  boundEnd: Date,
  label: string
): PlannedEvent[] {
  const events: PlannedEvent[] = [];
  const start = startOfDay(boundStart);
  const end = startOfDay(boundEnd);

  for (const item of items) {
    const deadline = item.deadline;
    if (!deadline) continue; // AC2: only items WITH a deadline reach the calendar
    if (isOneOffChecklistDeadline(deadline)) continue; // defensive backstop - see doc comment above

    const checkedWeekStart =
      item.checked && item.checkedAt != null ? sundayOfWeek(new Date(item.checkedAt)).getTime() : null;

    let weekStart = sundayOfWeek(start);
    let weekIndex = 0;
    while (weekStart.getTime() <= end.getTime()) {
      const occurrenceDay = addDays(weekStart, deadline.weekday);
      if (occurrenceDay.getTime() > end.getTime()) break;
      if (occurrenceDay.getTime() >= start.getTime()) {
        const prefix = checkedWeekStart === weekStart.getTime() ? CHECKLIST_DONE_PREFIX : "";
        const summary = `${prefix}${label} - ${item.label}`;
        const key = `checklist-${item.id}-w${weekIndex}`;
        if (deadline.time) {
          const [hourStr, minuteStr] = deadline.time.split(":");
          const eventStart = new Date(occurrenceDay);
          eventStart.setHours(Number(hourStr), Number(minuteStr), 0, 0);
          const eventEnd = new Date(eventStart.getTime() + 30 * 60_000);
          events.push({
            key,
            kind: "checklist",
            summary,
            description: `Weekly checklist item for ${label}.`,
            startISO: localDateTime(eventStart),
            endISO: localDateTime(eventEnd),
            allDay: false,
          });
        } else {
          events.push({
            key,
            kind: "checklist",
            summary,
            description: `Weekly checklist item for ${label}.`,
            startISO: dateOnly(occurrenceDay),
            endISO: dateOnly(addDays(occurrenceDay, 1)), // all-day end is exclusive here too
            allDay: true,
          });
        }
      }
      weekStart = addDays(weekStart, 7);
      weekIndex += 1;
    }
  }

  return events;
}

/**
 * One PlannedEvent per ONE-OFF checklist item - the AC4 counterpart to
 * buildChecklistEvents' weekly expansion. Never bounded by [boundStart,
 * boundEnd]: a one-off item's single occurrence is fully determined by its
 * own `deadline.date`, so (AC5) this is safe - and required - to call even
 * when the course has no start/end date set at all; buildCourseEvents' own
 * checklist section calls this unconditionally, independent of whether the
 * term-bound branch below it runs.
 *
 * The key ("checklist-<id>-once") deliberately never contains a week index,
 * unlike buildChecklistEvents' "checklist-<id>-w<N>" - there is only ever one
 * occurrence, forever, so there is nothing to index. isRecognizedEventKey and
 * isChecklistEventKeyForItem both know this exact shape (see their own doc
 * comments) - together they are what makes diffPlannedEvents correctly clean
 * up an item's OLD recurring events when it is switched to one-off (the old
 * "-w<N>" keys stop appearing in `planned` and fall out as deletes) and vice
 * versa (the old "-once" key falls out the same way when switched back).
 *
 * AC6: the CHECKLIST_DONE_PREFIX is applied whenever the item is simply
 * `checked` - unlike the recurring case, there is no "which week was it
 * checked in" question to answer here, because there is only this ONE
 * occurrence for the item's entire lifetime. checkedAt's own timestamp is
 * irrelevant to the prefix for a one-off item (it still stamps/clears
 * normally - see toggleWeeklyChecklistItem - it is just never consulted here).
 */
function buildOneOffChecklistEvents(items: WeeklyChecklistItem[], label: string): PlannedEvent[] {
  const events: PlannedEvent[] = [];

  for (const item of items) {
    const deadline = item.deadline;
    if (!deadline || !deadline.date) continue; // defensive - see buildChecklistEvents' own backstop comment

    const occurrenceDay = parseChecklistDeadlineDate(deadline.date);
    const prefix = item.checked ? CHECKLIST_DONE_PREFIX : "";
    const summary = `${prefix}${label} - ${item.label}`;
    const key = `checklist-${item.id}-once`;

    if (deadline.time) {
      const [hourStr, minuteStr] = deadline.time.split(":");
      const eventStart = new Date(occurrenceDay);
      eventStart.setHours(Number(hourStr), Number(minuteStr), 0, 0);
      const eventEnd = new Date(eventStart.getTime() + 30 * 60_000);
      events.push({
        key,
        kind: "checklist",
        summary,
        description: `Checklist item for ${label}.`,
        startISO: localDateTime(eventStart),
        endISO: localDateTime(eventEnd),
        allDay: false,
      });
    } else {
      events.push({
        key,
        kind: "checklist",
        summary,
        description: `Checklist item for ${label}.`,
        startISO: dateOnly(occurrenceDay),
        endISO: dateOnly(addDays(occurrenceDay, 1)), // all-day end is exclusive here too
        allDay: true,
      });
    }
  }

  return events;
}

/**
 * Build the full set of calendar events a course tile implies, plus a note
 * for every kind of event that could not be built (rather than guessing at
 * missing data) - see the AC's per-kind rules for exactly what each note
 * covers. Events are returned sorted by startISO then key, so the same course
 * always produces the same order and a diff against a prior sync is
 * deterministic.
 */
export function buildCourseEvents(input: BuildCourseEventsInput): BuildCourseEventsResult {
  const { course } = input;
  const events: PlannedEvent[] = [];
  const notes: string[] = [];
  const label = courseLabel(course);

  const startDate = parseCourseDate(course.startDate);
  const endDate = parseCourseDate(course.endDate);
  const weeks = validWeeks(course.weeks);
  const dayTime = course.dayTime ? parseDayTime(course.dayTime) : null;

  // ── term: one all-day event spanning startDate -> endDate ────────────────
  if (!startDate || !endDate) {
    notes.push("no start date or end date set - the term event was skipped");
  } else {
    events.push({
      key: "term",
      kind: "term",
      summary: `${label} - term`,
      description: `Term dates for ${label}.`,
      // Google all-day `end` is EXCLUSIVE - add one day so the last day of
      // the term is actually included, instead of silently dropped.
      startISO: dateOnly(startDate),
      endISO: dateOnly(addDays(endDate, 1)),
      allDay: true,
    });
  }

  // ── meeting: one event per class session ─────────────────────────────────
  const hasStartAndWeeks = !!startDate && !!weeks;
  const classLength = validClassLength(course.classLengthMinutes);
  if (!hasStartAndWeeks) {
    notes.push("no start date or number of weeks set - class meetings skipped");
  }
  if (classLength === null) {
    // Exact wording relied on elsewhere - do not invent a default duration.
    notes.push("no class length set - class meetings skipped");
  }
  if (!dayTime) {
    notes.push("could not parse dayTime - class meetings skipped");
  }
  if (startDate && weeks && classLength !== null && dayTime) {
    for (let week = 1; week <= weeks; week += 1) {
      for (const jsDay of dayTime.days) {
        const day = dateForWeekday(startDate, week, jsDay);
        const start = new Date(day);
        start.setHours(dayTime.hour, dayTime.minute, 0, 0);
        const end = new Date(start.getTime() + classLength * 60_000);
        events.push({
          key: `meeting-w${week}-d${jsDay}`,
          kind: "meeting",
          summary: label,
          description: `Class meeting, Week ${week}.`,
          startISO: localDateTime(start),
          endISO: localDateTime(end),
          allDay: false,
        });
      }
    }
  }

  // ── test: deriveTestWeeks(weeks, tests), one all-day event per test ───────
  if (!hasStartAndWeeks) {
    notes.push("no start date or number of weeks set - test events skipped");
  }
  if (startDate && weeks) {
    const testWeeks = deriveTestWeeks(weeks, course.tests ?? 0);
    testWeeks.forEach((week, i) => {
      const testNumber = i + 1;
      const day = dayTime
        ? dateForWeekday(startDate, week, earliestWeekday(dayTime.days))
        : mondayOfWeek(startDate, week);
      events.push({
        key: `test-${testNumber}`,
        kind: "test",
        summary: `${label} - Test ${testNumber}`,
        // The user has no stored per-test date (Course.tests is only a
        // count) - the description must say this is derived, not authored.
        description: TEST_DERIVED_DESCRIPTION,
        startISO: dateOnly(day),
        endISO: dateOnly(addDays(day, 1)), // all-day end is exclusive here too
        allDay: true,
      });
    });
  }

  // ── due: dueDateForWeek(start, week, rule), one timed event per week ─────
  const rule = parseAssignmentDueRule(course.assignmentDueRule);
  if (!rule) {
    notes.push("no assignment due rule set - weekly due-date events skipped");
  }
  if (!hasStartAndWeeks) {
    notes.push("no start date or number of weeks set - weekly due-date events skipped");
  }
  if (rule && startDate && weeks) {
    for (let week = 1; week <= weeks; week += 1) {
      const due = dueDateForWeek(startDate, week, rule);
      const end = new Date(due.getTime() + 30 * 60_000);
      events.push({
        key: `due-w${week}`,
        kind: "due",
        summary: `${label} - Week ${week} assignment due`,
        description: `Assignment due date for Week ${week}.`,
        startISO: localDateTime(due),
        endISO: localDateTime(end),
        allDay: false,
      });
    }
  }

  // ── checklist: split by kind (AC3/AC4/AC5) - a ONE-OFF item gets exactly
  // one event, unconditionally (never needs the term bound - see
  // buildOneOffChecklistEvents); a RECURRING item keeps the weekly
  // expansion, bounded by the tile's term dates exactly as before (see
  // buildChecklistEvents). Both branches are gated on "are there any items of
  // THAT kind at all" independently (unlike term/meeting/test/due above,
  // which always apply) so a course with only one-off items - or only
  // recurring ones, or neither - never gets a spurious "skipped" note for a
  // kind it doesn't even have.
  const deadlinedChecklistItems = coerceWeeklyChecklist(course.weeklyChecklist).filter((item) => item.deadline !== null);
  const oneOffChecklistItems = deadlinedChecklistItems.filter((item) => isOneOffChecklistDeadline(item.deadline));
  const recurringChecklistItems = deadlinedChecklistItems.filter((item) => !isOneOffChecklistDeadline(item.deadline));

  if (oneOffChecklistItems.length > 0) {
    // AC5: no start/end date gate here at all - a one-off item is
    // self-contained and syncs regardless of the term dates.
    events.push(...buildOneOffChecklistEvents(oneOffChecklistItems, label));
  }
  if (recurringChecklistItems.length > 0) {
    if (!startDate || !endDate) {
      notes.push("no start date or end date set - weekly checklist events were skipped");
    } else {
      events.push(...buildChecklistEvents(recurringChecklistItems, startDate, endDate, label));
    }
  }

  // ── breaks: annotation only, never applied to calendar events ────────────
  if (course.breaks && course.breaks.trim()) {
    notes.push("breaks are recorded on the tile but are not applied to calendar events");
  }

  events.sort((a, b) => {
    if (a.startISO !== b.startISO) return a.startISO < b.startISO ? -1 : 1;
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    return 0;
  });

  return { events, notes };
}

/**
 * Whether `key` is one of buildCourseEvents' checklist keys belonging to
 * exactly `itemId` - either RECURRING ("checklist-<id>-w<N>") or ONE-OFF
 * ("checklist-<id>-once"). Exported so both findAllChecklistItemEvents (the
 * planned side, below) and the scoped per-item sync action's existing-event
 * filter (src/app/actions/course-calendar.ts's syncChecklistItemCalendarAction)
 * agree on exactly one definition of "belongs to this item", rather than two
 * independent guesses that could drift apart - the same rationale
 * isRecognizedEventKey already documents for itself.
 *
 * Matches by PREFIX + SUFFIX SHAPE rather than embedding `itemId` into a
 * regex (item ids are caller-supplied strings that may contain characters a
 * regex would need escaping for): `key` must start with
 * "checklist-<itemId>-", and everything after that prefix must be exactly
 * "once" or "w<digits>" - nothing else. This is what lets an item id that
 * itself contains dashes (a UUID, or one ending in something that looks like
 * a suffix) never falsely match another item's key: e.g. itemId "abc" is a
 * literal string-prefix of the key "checklist-abc-def-w0" (which actually
 * belongs to item "abc-def"), but that key's remainder ("def-w0") satisfies
 * neither shape, so it is correctly rejected instead of being mistaken for
 * item "abc"'s own event. AC4: this is exactly what lets a recurring item
 * switched to one-off (or back) get its old, no-longer-owned keys correctly
 * recognized as "still belongs to this item" so diffPlannedEvents can clean
 * them up, while never reaching into a DIFFERENT item's keys to do it.
 */
export function isChecklistEventKeyForItem(key: string, itemId: string): boolean {
  const prefix = `checklist-${itemId}-`;
  if (!key.startsWith(prefix)) return false;
  const suffix = key.slice(prefix.length);
  return suffix === "once" || /^w\d+$/.test(suffix);
}

/**
 * Every currently-planned checklist event belonging to exactly one item
 * (`itemId`) - every occurrence buildCourseEvents' checklist section would
 * produce for that item across the WHOLE course term (RECURRING: every
 * calendar week; ONE-OFF: its single event - see isChecklistEventKeyForItem),
 * not just the current week. This is what the scoped per-item calendar sync
 * (src/app/actions/course-calendar.ts's syncChecklistItemCalendarAction)
 * diffs against instead of running syncCourseCalendarAction's course-wide
 * diff: bounded to this one item's own occurrences (typically at most the
 * course's own week count, or exactly one for a one-off item) rather than
 * every event kind for every item, and covering ALL of the item's occurrences
 * (not only the current one) so a rename, a re-time, or a switch between
 * recurring and one-off reaches every occurrence it touches, not just this
 * week's.
 *
 * This supersedes the narrower findCurrentWeekChecklistEvent this module
 * used to export: syncing only the current week's occurrence meant a
 * checkbox toggle reached the calendar immediately but adding an item,
 * giving one a deadline, renaming it, or re-timing it did not - exactly the
 * reported "checklist events don't show up" bug, since nothing else ever ran
 * the full course-wide sync that would have caught them.
 *
 * Reuses buildCourseEvents wholesale (rather than re-deriving the
 * start/end-date bound arithmetic, or the one-off "no bound needed" rule, a
 * second time) and filters its "checklist" output down via
 * isChecklistEventKeyForItem. An item with no deadline, or one no longer
 * present in the course's weeklyChecklist at all (e.g. because it was just
 * removed), or a RECURRING item on a course with no start/end date, all
 * simply flow through buildCourseEvents' own empty checklist output for that
 * item - nothing is special-cased for any of them, which is exactly what
 * lets the caller's diff clean up a removed item's, a cleared deadline's, or
 * a now-unbounded course's stale events down to nothing. A ONE-OFF item,
 * unlike a recurring one, still flows through even when the course has no
 * start/end date (AC5) - see buildOneOffChecklistEvents.
 */
export function findAllChecklistItemEvents(course: Course, itemId: string): PlannedEvent[] {
  const { events } = buildCourseEvents({ course });
  return events.filter((e) => e.kind === "checklist" && isChecklistEventKeyForItem(e.key, itemId));
}

export type CourseCalendarBlocker = "missing-dates" | "not-connected";

/**
 * Which conditions currently block this course's calendar events from
 * reaching Google Calendar: both the always-attempted term event (see
 * buildCourseEvents' "term" section above) and, when the course has any
 * deadlined weekly-checklist items, its checklist events too. Pure -
 * `course.startDate`/`endDate` are read directly and
 * `googleCalendarConnected` is caller-supplied - so this can be called
 * straight from the courses table UI to surface the SAME two conditions
 * buildCourseEvents already silently notes ("no start date or end date set -
 * the term event was skipped", and a sync that never runs because Google
 * isn't connected) directly in the row, rather than only inside a sync
 * report an instructor may never open. `googleCalendarConnected: null`
 * (the page's one-time connection check has not resolved yet - see
 * useCoursesData.ts) reads as "not blocked" rather than flashing a
 * false-positive warning while that check is still in flight.
 *
 * Deliberately UNCHANGED by the one-off deadline feature (AC5): the term
 * event this function also speaks for is still unconditionally blocked by
 * missing dates regardless of what the checklist contains, so this
 * function's own general "is anything about this course's calendar sync
 * blocked" answer does not change. checklistCalendarBlockers below is the
 * NARROWER, checklist-scoped counterpart AC5 asks for; see its own doc
 * comment for why it is a separate function rather than a change to this
 * one's behavior.
 */
export function courseCalendarBlockers(
  course: Course,
  googleCalendarConnected: boolean | null
): CourseCalendarBlocker[] {
  const blockers: CourseCalendarBlocker[] = [];
  if (!course.startDate || !course.endDate) blockers.push("missing-dates");
  if (googleCalendarConnected === false) blockers.push("not-connected");
  return blockers;
}

/**
 * AC5: narrower than courseCalendarBlockers above - reports "missing-dates"
 * only when at least one of `items` actually NEEDS the tile's term bound to
 * sync, i.e. a RECURRING deadlined item (see buildChecklistEvents' own
 * missing-dates gate). A course whose deadlined checklist items are ALL
 * one-off is never blocked by missing dates for checklist purposes: a
 * one-off item is self-contained and syncs regardless (buildOneOffChecklistEvents),
 * so telling the instructor "set both dates to enable it" would be false in
 * that case - exactly the over-claim AC5 calls out.
 *
 * courseCalendarBlockers itself is intentionally left unchanged rather than
 * having this logic folded into it (see that function's own doc comment):
 * the term event it also answers for is unconditionally blocked by missing
 * dates no matter what the checklist contains, so narrowing ITS answer would
 * make it wrong about the term event instead. This function exists
 * specifically for a caller that wants the answer scoped to "are checklist
 * deadlines specifically blocked" - WeeklyChecklistCell.tsx's own badge is
 * exactly that caller, but wiring the cell over to this function is left to
 * whichever wave owns that file's UI (this wave's brief is the data layer,
 * not that cell's rendering) - this function is exported, tested, and ready
 * for that swap.
 *
 * `items` is caller-supplied (already coerceWeeklyChecklist'd) rather than
 * re-derived from `course.weeklyChecklist` here, matching how
 * WeeklyChecklistCell.tsx already computes its own `items` once per render
 * and would pass the same value it already has.
 */
export function checklistCalendarBlockers(
  course: Course,
  items: WeeklyChecklistItem[],
  googleCalendarConnected: boolean | null
): CourseCalendarBlocker[] {
  const blockers: CourseCalendarBlocker[] = [];
  const needsTermBound = items.some((item) => item.deadline !== null && !isOneOffChecklistDeadline(item.deadline));
  if (needsTermBound && (!course.startDate || !course.endDate)) blockers.push("missing-dates");
  if (googleCalendarConnected === false) blockers.push("not-connected");
  return blockers;
}

// ── AC2: stable keys and the idempotency contract ───────────────────────────

export interface ExistingEvent {
  id: string;
  key: string;
}

export interface EventDiff {
  toCreate: PlannedEvent[];
  toUpdate: Array<{ id: string; event: PlannedEvent }>;
  toDelete: string[]; // event ids
}

// The six key shapes buildCourseEvents ever produces (see the "key" line in
// each branch above) - checklist-.+-w\d+ for a RECURRING item's weekly
// expansion, checklist-.+-once for a ONE-OFF item's single event (AC4).
// Anything else - including "" - is not a key this sync recognizes as its
// own, even though the caller only ever found it via a taCourseId query (see
// diffPlannedEvents's untagged-event guard below). Both checklist
// alternatives use `.+` (not a stricter id shape) because item.id is a
// caller-supplied string (crypto.randomUUID() in practice, but coerceWeeklyChecklist
// accepts any non-empty string) that may itself contain dashes; the pattern
// is anchored, so the greedy `.+` still only ever matches up to the final
// "-w<digits>" or "-once" suffix - it is validation-only and never used to
// extract the id back out (isChecklistEventKeyForItem, above, is what
// actually recovers "does this key belong to itemId").
const RECOGNIZED_KEY_PATTERN = /^(term|meeting-w\d+-d[0-6]|test-\d+|due-w\d+|checklist-.+-w\d+|checklist-.+-once)$/;

/**
 * Whether `key` matches one of buildCourseEvents's own key shapes. Exported
 * so the server action (src/app/actions/course-calendar.ts) can apply this
 * exact same "missing or unrecognised" test when it counts skippedUntagged -
 * a single shared definition, rather than two independent guesses that could
 * drift apart.
 */
export function isRecognizedEventKey(key: string): boolean {
  return RECOGNIZED_KEY_PATTERN.test(key);
}

/**
 * Pure diff between what should exist (`planned`) and what the calendar
 * currently has tagged for this course (`existing`), keyed by the stable
 * `key` every PlannedEvent carries.
 *
 * - a planned key with no existing match -> create.
 * - a key present in both -> update unconditionally (an update is idempotent,
 *   so comparing every field first is not worth it).
 * - an existing (recognized) key with no planned match -> delete - this is
 *   how a shortened term or a removed due rule cleans up after itself.
 * - an existing entry whose key is missing ("") or fails
 *   isRecognizedEventKey -> left alone entirely: never created, updated, or
 *   deleted. This is the untagged-event guard - even though every `existing`
 *   entry already passed the caller's taCourseId query, a key this module
 *   does not recognize must never be treated as "safe to delete." That would
 *   be exactly the failure the whole private-property design exists to
 *   prevent. The caller is expected to count these (skippedUntagged); this
 *   function only guarantees they never appear in toDelete or toUpdate.
 * - duplicate keys within `existing` are tolerated: the first occurrence
 *   (input order) is the canonical event (the create/update target); every
 *   later duplicate is queued for deletion, so a re-sync converges on exactly
 *   one event per key.
 */
export function diffPlannedEvents(planned: PlannedEvent[], existing: ExistingEvent[]): EventDiff {
  const plannedByKey = new Map(planned.map((e) => [e.key, e]));
  const claimedKeys = new Set<string>();
  const toUpdate: Array<{ id: string; event: PlannedEvent }> = [];
  const toDelete: string[] = [];

  for (const ev of existing) {
    if (!isRecognizedEventKey(ev.key)) continue; // missing/unrecognised - leave alone entirely

    if (claimedKeys.has(ev.key)) {
      toDelete.push(ev.id); // duplicate - keep the first, delete the rest
      continue;
    }
    claimedKeys.add(ev.key);

    const plannedEvent = plannedByKey.get(ev.key);
    if (plannedEvent) {
      toUpdate.push({ id: ev.id, event: plannedEvent });
    } else {
      toDelete.push(ev.id); // recognized but no longer planned - cleans itself up
    }
  }

  const toCreate = planned.filter((p) => !claimedKeys.has(p.key));

  return { toCreate, toUpdate, toDelete };
}
