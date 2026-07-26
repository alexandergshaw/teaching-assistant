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

export type CourseEventKind = "term" | "meeting" | "test" | "due";

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

// The four key shapes buildCourseEvents ever produces (see the "key" line in
// each branch above). Anything else - including "" - is not a key this sync
// recognizes as its own, even though the caller only ever found it via a
// taCourseId query (see diffPlannedEvents's untagged-event guard below).
const RECOGNIZED_KEY_PATTERN = /^(term|meeting-w\d+-d[0-6]|test-\d+|due-w\d+)$/;

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
