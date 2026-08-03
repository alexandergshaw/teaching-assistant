// Pure course -> Google Calendar event planner. No Google, no I/O, no
// Date.now() - every date is derived from the course row alone, so the same
// course always produces the same plan. That determinism is what makes a
// re-sync's diff (diffPlannedEvents below) meaningful: comparing "what should
// exist" against "what the calendar already has tagged for this course" only
// makes sense if "what should exist" is stable and reproducible.
//
// This module owns the "what would we write" half of the sync, for the
// TERM/MEETING/TEST/DUE event kinds plus the overall plan ASSEMBLY
// (buildCourseEvents) and the DIFF (diffPlannedEvents). The Google-facing
// "how do we write it" half (auth, HTTP, resolving the target calendar,
// applying the diff, counting untagged events) lives entirely in
// src/app/actions/course-calendar.ts, which is the only caller.
//
// Two sibling modules this file depends on (see each one's own header
// comment for the full rationale):
//   - course-calendar-dates.ts: the shared local-date arithmetic (parseCourseDate,
//     addDays, dateOnly, ...) and the small type vocabulary
//     (CourseEventKind/PlannedEvent/CourseCalendarBlocker) both this file and
//     course-calendar-checklist-events.ts need - it depends on neither of
//     them, so both can safely depend on it.
//   - course-calendar-checklist-events.ts: everything CHECKLIST-specific
//     (building the four kinds of checklist event, recognizing a checklist
//     event's key against a specific item, the checklist-scoped blocker).
//     buildCourseEvents' own checklist section below calls straight into it.
// The dependency only ever points THIS file -> those two, never back (see
// course-calendar-checklist-events.ts's header comment for exactly why the
// reverse would create a cycle) - every symbol that used to live directly in
// this file is re-exported below under its original name, so no existing
// call site needs to change its import path.
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
import { coerceWeeklyChecklist, type WeeklyChecklistItem } from "@/lib/weekly-checklist";
import { checklistDeadlineKind } from "@/lib/checklist-deadline";
import {
  addDays,
  dateForWeekday,
  dateOnly,
  earliestWeekday,
  localDateTime,
  mondayOfWeek,
  parseCourseDate,
  startOfDay,
  type CourseCalendarBlocker,
  type PlannedEvent,
} from "@/lib/course-calendar-dates";
import {
  buildChecklistEvents,
  buildDailyChecklistEvents,
  buildMonthlyChecklistEvents,
  buildOneOffChecklistEvents,
  CHECKLIST_KEY_SUFFIX_PATTERN,
  isChecklistEventKeyForItem,
} from "@/lib/course-calendar-checklist-events";

// Re-exported for backward compatibility - every symbol below used to be
// defined directly in this file; see this module's own header comment for
// why they moved and why the dependency only ever points this file -> the
// two sibling modules, never back.
export type { CourseEventKind, PlannedEvent, CourseCalendarBlocker } from "@/lib/course-calendar-dates";
export { sundayOfWeek } from "@/lib/course-calendar-dates";
export { CHECKLIST_DONE_PREFIX, isChecklistEventKeyForItem, checklistCalendarBlockers } from "@/lib/course-calendar-checklist-events";

export interface BuildCourseEventsInput {
  course: Course;
  /**
   * Injected so the module stays pure and testable. Originally accepted for
   * API stability "if a later wave adds" a use for it - this IS that later
   * wave: a DAILY checklist item's fan-out is bounded to the CURRENT
   * real-world calendar week (see course-calendar-checklist-events.ts's
   * buildDailyChecklistEvents), and "current" has to mean something, so
   * `today` is what answers "current, as of when". Every test in this file
   * and course-calendar-events.frequency.test.ts passes `today` explicitly
   * for determinism. When omitted (every existing production caller -
   * course-calendar.ts's syncOneCourseCalendar/findAllChecklistItemEvents -
   * predates the daily-checklist feature and was never updated to pass it;
   * that file is outside this wave's brief), buildCourseEvents falls back to
   * the real clock (see currentRealDate) ONLY when a daily item actually
   * exists, so every other course - the overwhelming majority, with no daily
   * items at all - never touches Date.now() and stays exactly as
   * pure/deterministic as before.
   */
  today?: Date;
}

export interface BuildCourseEventsResult {
  events: PlannedEvent[];
  notes: string[];
}

/** Real current time, isolated in this one tiny helper (mirrors
 * currentTimeMs() in WeeklyChecklistCell.tsx / WeeklyChecklistOverviewModal.tsx
 * - the same "isolate the one place `now` is actually read from the clock"
 * idiom used everywhere else in this app) - used ONLY as buildCourseEvents'
 * fallback for `today` when the caller does not supply one and a daily
 * checklist item actually needs it. See BuildCourseEventsInput.today's own
 * doc comment for why production still needs a real "now" here even though
 * the rest of this module stays a pure function of the course row alone. */
function currentRealDate(): Date {
  return new Date();
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

  // ── checklist: split by kind (AC3/AC4/AC5, extended for daily/monthly) -
  // a ONE-OFF item gets exactly one event, unconditionally (never needs the
  // term bound - see buildOneOffChecklistEvents, course-calendar-checklist-events.ts);
  // a RECURRING item keeps the weekly expansion, bounded by the tile's term
  // dates exactly as before (see buildChecklistEvents); a DAILY item is
  // bounded to the CURRENT real-world week AND the tile's term dates (see
  // buildDailyChecklistEvents - this is the "at most 7 events" bound); a
  // MONTHLY item fans out across the WHOLE term like a recurring item does
  // (see buildMonthlyChecklistEvents). checklistDeadlineKind
  // (checklist-deadline.ts) is the single source of truth for "which of the
  // four kinds is this deadline" - reused here rather than re-deriving the
  // same date-wins/frequency precedence a second time, which could otherwise
  // drift from checklistDeadlineKind's own answer. Every branch is gated on
  // "are there any items of THAT kind at all" independently (unlike
  // term/meeting/test/due above, which always apply) so a course missing one
  // or more kinds entirely never gets a spurious "skipped" note for a kind it
  // doesn't even have.
  const deadlinedChecklistItems = coerceWeeklyChecklist(course.weeklyChecklist).filter((item) => item.deadline !== null);
  const oneOffChecklistItems: WeeklyChecklistItem[] = [];
  const dailyChecklistItems: WeeklyChecklistItem[] = [];
  const monthlyChecklistItems: WeeklyChecklistItem[] = [];
  const recurringChecklistItems: WeeklyChecklistItem[] = [];
  for (const item of deadlinedChecklistItems) {
    switch (checklistDeadlineKind(item.deadline)) {
      case "one-off":
        oneOffChecklistItems.push(item);
        break;
      case "daily":
        dailyChecklistItems.push(item);
        break;
      case "monthly":
        monthlyChecklistItems.push(item);
        break;
      default:
        // "recurring" (including an unrecognized `frequency`, which degrades
        // to recurring per checklistDeadlineKind's own precedence rule) -
        // "none" is unreachable here since deadlinedChecklistItems already
        // filtered out every item with no deadline at all.
        recurringChecklistItems.push(item);
        break;
    }
  }

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
  if (dailyChecklistItems.length > 0) {
    if (!startDate || !endDate) {
      notes.push("no start date or end date set - daily checklist events were skipped");
    } else {
      // Computed lazily, only once a daily item genuinely exists - see
      // BuildCourseEventsInput.today's own doc comment for why this is the
      // ONE place in this otherwise-pure module that may read the real
      // clock, and why it only does so when actually needed.
      const today = startOfDay(input.today ?? currentRealDate());
      events.push(...buildDailyChecklistEvents(dailyChecklistItems, today, startDate, endDate, label));
    }
  }
  if (monthlyChecklistItems.length > 0) {
    if (!startDate || !endDate) {
      notes.push("no start date or end date set - monthly checklist events were skipped");
    } else {
      events.push(...buildMonthlyChecklistEvents(monthlyChecklistItems, startDate, endDate, label));
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
 * Every currently-planned checklist event belonging to exactly one item
 * (`itemId`) - every occurrence buildCourseEvents' checklist section would
 * produce for that item across the WHOLE course term (RECURRING: every
 * calendar week; ONE-OFF: its single event - see isChecklistEventKeyForItem,
 * course-calendar-checklist-events.ts), not just the current week. This is
 * what the scoped per-item calendar sync
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
 * removed), or a RECURRING/DAILY/MONTHLY item on a course with no start/end
 * date, all simply flow through buildCourseEvents' own empty checklist
 * output for that item - nothing is special-cased for any of them, which is
 * exactly what lets the caller's diff clean up a removed item's, a cleared
 * deadline's, or a now-unbounded course's stale events down to nothing. A
 * ONE-OFF item, unlike the other three kinds, still flows through even when
 * the course has no start/end date (AC5) - see buildOneOffChecklistEvents. A
 * DAILY item, unlike the other three, is bounded to the CURRENT real-world
 * week regardless (see buildDailyChecklistEvents) - "every occurrence" for a
 * daily item therefore means "every occurrence of the current week", not the
 * whole term, which is exactly the instructor's own bound.
 *
 * This function stays in this file rather than moving to
 * course-calendar-checklist-events.ts (even though it is checklist-scoped)
 * precisely BECAUSE it calls buildCourseEvents - moving it would have made it
 * the other half of the exact import cycle this split's dependency direction
 * forbids (see this module's own header comment, and
 * course-calendar-checklist-events.ts's).
 *
 * `today` is optional and passed straight through to buildCourseEvents,
 * purely for test determinism (see BuildCourseEventsInput.today's own doc
 * comment) - the one production caller
 * (src/app/actions/course-calendar.ts's syncChecklistItemCalendarAction)
 * never supplies it, so it falls back to the real clock exactly like a
 * direct buildCourseEvents call would.
 */
export function findAllChecklistItemEvents(course: Course, itemId: string, today?: Date): PlannedEvent[] {
  const { events } = buildCourseEvents({ course, today });
  return events.filter((e) => e.kind === "checklist" && isChecklistEventKeyForItem(e.key, itemId));
}

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
 * blocked" answer does not change. checklistCalendarBlockers
 * (course-calendar-checklist-events.ts) is the NARROWER, checklist-scoped
 * counterpart AC5 asks for; see its own doc comment for why it is a separate
 * function rather than a change to this one's behavior.
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

// The eight key shapes buildCourseEvents ever produces (see the "key" line
// in each branch above, and in course-calendar-checklist-events.ts's four
// build*ChecklistEvents functions) - checklist-.+-w\d+ for a RECURRING item's
// weekly expansion, checklist-.+-once for a ONE-OFF item's single event
// (AC4), checklist-.+-d\d{4}-\d{2}-\d{2} for a DAILY item's current-week
// occurrence, checklist-.+-m\d+ for a MONTHLY item's monthly expansion.
// Anything else - including "" - is not a key this sync recognizes as its
// own, even though the caller only ever found it via a taCourseId query (see
// diffPlannedEvents's untagged-event guard below). Every checklist
// alternative uses `.+` (not a stricter id shape) because item.id is a
// caller-supplied string (crypto.randomUUID() in practice, but coerceWeeklyChecklist
// accepts any non-empty string) that may itself contain dashes; the pattern
// is anchored, so the greedy `.+` still only ever matches up to the final
// recognized suffix - it is validation-only and never used to extract the id
// back out (isChecklistEventKeyForItem, course-calendar-checklist-events.ts,
// is what actually recovers "does this key belong to itemId").
//
// The checklist suffix alternatives (once/w\d+/m\d+/d\d{4}-\d{2}-\d{2}) are
// spliced in from CHECKLIST_KEY_SUFFIX_PATTERN
// (course-calendar-checklist-events.ts) rather than hand-copied here a second
// time - see that constant's own doc comment for why a single shared source
// of truth for "what does a checklist key look like" is the highest-value
// guard in this entire course-calendar-* split (a key this pattern stops
// recognizing is a key diffPlannedEvents stops cleaning up, i.e. an event
// ORPHANED forever in a real Google Calendar). Composed via `new RegExp` from
// a template string rather than a regex literal so the fragment can be
// spliced in; the resulting pattern source is byte-for-byte identical to a
// hand-written literal covering the same eight shapes.
const RECOGNIZED_KEY_PATTERN = new RegExp(
  `^(term|meeting-w\\d+-d[0-6]|test-\\d+|due-w\\d+|checklist-.+-(${CHECKLIST_KEY_SUFFIX_PATTERN}))$`
);

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
