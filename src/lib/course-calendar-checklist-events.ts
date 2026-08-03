// Everything CHECKLIST-SPECIFIC about the course calendar plan: building the
// four kinds of checklist PlannedEvent (recurring/weekly, one-off, daily,
// monthly), recognizing a checklist event's key against a specific item, and
// the checklist-scoped calendar blocker. Split out of course-calendar-events.ts
// (which had grown past this project's 1000-line cap) along the seam
// "everything about the checklist half of the plan" vs "everything about the
// rest of the plan (term/meeting/test/due), the overall assembly, and the
// diff".
//
// DEPENDENCY DIRECTION (see course-calendar-events.ts's own header comment
// for the full picture, and course-calendar-dates.ts's for why the shared
// types live there): course-calendar-events.ts's buildCourseEvents calls the
// four build*ChecklistEvents functions below, so THIS module must never
// import anything from course-calendar-events.ts, or the two files would
// import each other and neither could load first. Everything both files need
// (the date arithmetic, and the PlannedEvent/CourseEventKind/
// CourseCalendarBlocker vocabulary) lives in course-calendar-dates.ts instead,
// which depends on neither of them.
//
// Two functions that are checklist-scoped but do NOT live here, worth calling
// out explicitly since it may look like an inconsistency at first glance:
//   - findAllChecklistItemEvents calls buildCourseEvents itself (reusing the
//     whole plan rather than re-deriving the start/end-date bound arithmetic
//     a second time - see its own doc comment in course-calendar-events.ts).
//     Moving it here would have made IT the other half of the cycle this
//     module's header comment above forbids, so it stays in
//     course-calendar-events.ts even though it is checklist-scoped.
//   - isRecognizedEventKey (which recognizes non-checklist keys too - term,
//     meeting, test, due) also stays in course-calendar-events.ts, but reads
//     the checklist key SUFFIX shapes from CHECKLIST_KEY_SUFFIX_PATTERN below
//     instead of a second, hand-copied regex fragment. This is the single
//     highest-risk part of this split: if the two definitions ever drifted, a
//     key isRecognizedEventKey stops recognizing is a key diffPlannedEvents
//     (course-calendar-events.ts) stops cleaning up, i.e. an event ORPHANED
//     forever in a real Google Calendar. Sharing one exported pattern fragment
//     - rather than hand-copying the checklist alternatives into both files -
//     is what makes that drift structurally impossible instead of just
//     "unlikely if everyone remembers."
//
// All date arithmetic below uses course-calendar-dates.ts's local-time
// helpers - never toISOString/UTC methods - matching the rest of the
// course-calendar-* split.

import type { Course } from "@/lib/supabase/courses";
import type { WeeklyChecklistItem } from "@/lib/weekly-checklist";
import {
  checklistDeadlineKind,
  daysInChecklistMonth,
  isOneOffChecklistDeadline,
  parseChecklistDeadlineDate,
} from "@/lib/checklist-deadline";
import {
  addDays,
  dateOnly,
  isSameCalendarDay,
  isSameCalendarMonth,
  localDateTime,
  startOfDay,
  sundayOfWeek,
  type CourseCalendarBlocker,
  type PlannedEvent,
} from "@/lib/course-calendar-dates";

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

/**
 * The four suffix shapes a checklist item's key can end in, after its
 * "checklist-<id>-" prefix - "once" (one-off, buildOneOffChecklistEvents),
 * "w<N>" (recurring weekly index, buildChecklistEvents), "m<N>" (monthly
 * index, buildMonthlyChecklistEvents), or "d<YYYY-MM-DD>" (daily occurrence
 * date, buildDailyChecklistEvents) - see each function's own "key:" line.
 * Exported as a regex-source FRAGMENT (not a full anchored pattern) so both
 * isChecklistEventKeyForItem below AND course-calendar-events.ts's own
 * RECOGNIZED_KEY_PATTERN test against this exact same definition, rather than
 * two independently-typed copies that could silently drift apart - see this
 * module's own header comment for why that drift is this split's single
 * highest-risk failure mode.
 */
export const CHECKLIST_KEY_SUFFIX_PATTERN = "once|w\\d+|m\\d+|d\\d{4}-\\d{2}-\\d{2}";

const CHECKLIST_KEY_SUFFIX_REGEX = new RegExp(`^(${CHECKLIST_KEY_SUFFIX_PATTERN})$`);

/**
 * One PlannedEvent per (RECURRING checklist item with a deadline) x (calendar
 * week the item's weekday falls on), bounded by [boundStart, boundEnd]
 * inclusive - AC3: expanded up front, never stored as a recurring rule, so a
 * course that ended months ago stops producing occurrences instead of
 * reminding forever. The bound is the course's own startDate/endDate (NOT
 * startDate+weeks, unlike meeting/test/due in course-calendar-events.ts) -
 * see buildCourseEvents' call site for why. A ONE-OFF item never reaches this
 * function at all - see buildCourseEvents' checklist section, which routes
 * one-off items to buildOneOffChecklistEvents instead; the
 * `checklistDeadlineKind` guard below is only a defensive backstop against a
 * future caller passing mixed input, not the primary gate.
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
export function buildChecklistEvents(
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
    // Defensive backstop - see doc comment above. Checks the FULL kind, not
    // just isOneOffChecklistDeadline, now that daily/monthly exist too: the
    // caller (buildCourseEvents) partitions items by checklistDeadlineKind
    // before calling this function, so in practice only "recurring" items
    // ever reach here, but this guard stays complete against a future caller
    // passing mixed input.
    if (checklistDeadlineKind(deadline) !== "recurring") continue;

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
 * One PlannedEvent per (DAILY checklist item with a deadline) x (day within
 * the CURRENT real-world calendar week) - the instructor's explicit second
 * decision (see course-calendar-events.ts's own import-time context: the
 * failing contract this wave implements against): a daily item's fan-out is
 * bounded to at most 7 events, never expanded across the WHOLE term the way a
 * RECURRING item is (buildChecklistEvents above) - a 16-week course must not
 * put ~112 events per item onto a real calendar. Also bounded by the course's
 * own [boundStart, boundEnd] term dates, same as a recurring item, so a daily
 * item never produces an event before the course starts or after it ends
 * even when "today" falls inside the term.
 *
 * "Current week" is Sunday-anchored (sundayOfWeek), matching this file's own
 * weekly-checklist convention throughout, and is centered on `today` - NOT
 * on boundStart - so a daily item added mid-term correctly reaches only
 * THIS week's 7 dates, never the term's first week. All 7 days of the week
 * are considered (not just "today onward") - a daily item is meant to show
 * the whole current week's checklist, including days already past, exactly
 * like "current week" reads literally.
 *
 * Keyed by the literal occurrence DATE (`checklist-<id>-d<YYYY-MM-DD>`),
 * unlike buildChecklistEvents' term-relative weekIndex: a daily item's 7-day
 * window itself SHIFTS every time "today" advances (there is no fixed,
 * term-relative "Nth day" the way a recurring item has a fixed "Nth week"),
 * so a date-keyed event is what lets a re-sync on a later day do the right
 * thing automatically: (1) UPDATE a date still inside the new window (same
 * key, unchanged), (2) DELETE a date that rolled OUT of the window (its old
 * key no longer appears in the fresh `planned` output, so diffPlannedEvents
 * cleans it up exactly like a removed item's stale keys always have), and
 * (3) CREATE a date that newly entered the window. No separate counter is
 * needed to disambiguate occurrences the way weekIndex does for a recurring
 * item, because two different real calendar dates can never collide - the
 * date itself already IS a stable, unique identity.
 *
 * The "done" checkmark marks exactly the calendar DAY the item was checked
 * in (mirrors buildChecklistEvents' own "exactly the week it was checked in"
 * rule, at day instead of week granularity) - not "is it checked right now"
 * (isChecklistItemCheckedNow), which depends on the CURRENT date rather than
 * a given occurrence's own date and would incorrectly show the SAME answer
 * on every day's title instead of only the one day it actually happened on.
 */
export function buildDailyChecklistEvents(
  items: WeeklyChecklistItem[],
  today: Date,
  boundStart: Date,
  boundEnd: Date,
  label: string
): PlannedEvent[] {
  const events: PlannedEvent[] = [];
  const weekStart = sundayOfWeek(today);
  const start = startOfDay(boundStart);
  const end = startOfDay(boundEnd);

  for (const item of items) {
    const deadline = item.deadline;
    if (!deadline) continue;
    if (checklistDeadlineKind(deadline) !== "daily") continue; // defensive backstop - see buildChecklistEvents' own comment

    for (let offset = 0; offset < 7; offset += 1) {
      const day = addDays(weekStart, offset);
      if (day.getTime() < start.getTime() || day.getTime() > end.getTime()) continue;

      const isCheckedDay =
        item.checked && item.checkedAt != null && isSameCalendarDay(new Date(item.checkedAt), day);
      const prefix = isCheckedDay ? CHECKLIST_DONE_PREFIX : "";
      const summary = `${prefix}${label} - ${item.label}`;
      const key = `checklist-${item.id}-d${dateOnly(day)}`;

      if (deadline.time) {
        const [hourStr, minuteStr] = deadline.time.split(":");
        const eventStart = new Date(day);
        eventStart.setHours(Number(hourStr), Number(minuteStr), 0, 0);
        const eventEnd = new Date(eventStart.getTime() + 30 * 60_000);
        events.push({
          key,
          kind: "checklist",
          summary,
          description: `Daily checklist item for ${label}.`,
          startISO: localDateTime(eventStart),
          endISO: localDateTime(eventEnd),
          allDay: false,
        });
      } else {
        events.push({
          key,
          kind: "checklist",
          summary,
          description: `Daily checklist item for ${label}.`,
          startISO: dateOnly(day),
          endISO: dateOnly(addDays(day, 1)), // all-day end is exclusive here too
          allDay: true,
        });
      }
    }
  }

  return events;
}

/**
 * One PlannedEvent per (MONTHLY checklist item with a deadline) x (calendar
 * month overlapping [boundStart, boundEnd]) - the MONTHLY counterpart to
 * buildChecklistEvents' weekly expansion. Unlike a daily item (see
 * buildDailyChecklistEvents above), a monthly item has no runaway-event-count
 * problem - about 4 occurrences over a typical term - so it fans out across
 * the WHOLE term exactly like a recurring weekly item does, never bounded to
 * a rolling window.
 *
 * monthIndex (0-based, counting every calendar month from boundStart's own
 * month) plays the same role weekIndex plays in buildChecklistEvents: a
 * given month's key stays stable across a dayOfMonth (re-time) edit, because
 * WHICH month is month N never changes, only where within that month the
 * occurrence falls - so re-timing the day of month is an UPDATE, not a
 * delete+recreate. The occurrence date within each month applies
 * daysInChecklistMonth's clamp (the SAME clamp checklist-deadline.ts's own
 * monthlyOccurrenceInstant uses, imported rather than reimplemented, so the
 * two can never compute a different answer for "what day does this resolve
 * to") - September 31 correctly becomes September 30 rather than rolling
 * into October.
 *
 * The "done" checkmark marks exactly the calendar MONTH the item was checked
 * in, the monthly counterpart to buildDailyChecklistEvents' per-day marking
 * and buildChecklistEvents' per-week marking above.
 */
export function buildMonthlyChecklistEvents(items: WeeklyChecklistItem[], boundStart: Date, boundEnd: Date, label: string): PlannedEvent[] {
  const events: PlannedEvent[] = [];
  const start = startOfDay(boundStart);
  const end = startOfDay(boundEnd);

  for (const item of items) {
    const deadline = item.deadline;
    if (!deadline) continue;
    if (checklistDeadlineKind(deadline) !== "monthly") continue; // defensive backstop - see buildChecklistEvents' own comment
    const requestedDay = typeof deadline.dayOfMonth === "number" ? deadline.dayOfMonth : 1;

    let monthIndex = 0;
    let monthCursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (monthCursor.getTime() <= end.getTime()) {
      const year = monthCursor.getFullYear();
      const month = monthCursor.getMonth();
      const clampedDay = Math.min(requestedDay, daysInChecklistMonth(year, month));
      const occurrenceDay = new Date(year, month, clampedDay);

      if (occurrenceDay.getTime() >= start.getTime() && occurrenceDay.getTime() <= end.getTime()) {
        const isCheckedMonth =
          item.checked && item.checkedAt != null && isSameCalendarMonth(new Date(item.checkedAt), occurrenceDay);
        const prefix = isCheckedMonth ? CHECKLIST_DONE_PREFIX : "";
        const summary = `${prefix}${label} - ${item.label}`;
        const key = `checklist-${item.id}-m${monthIndex}`;

        if (deadline.time) {
          const [hourStr, minuteStr] = deadline.time.split(":");
          const eventStart = new Date(occurrenceDay);
          eventStart.setHours(Number(hourStr), Number(minuteStr), 0, 0);
          const eventEnd = new Date(eventStart.getTime() + 30 * 60_000);
          events.push({
            key,
            kind: "checklist",
            summary,
            description: `Monthly checklist item for ${label}.`,
            startISO: localDateTime(eventStart),
            endISO: localDateTime(eventEnd),
            allDay: false,
          });
        } else {
          events.push({
            key,
            kind: "checklist",
            summary,
            description: `Monthly checklist item for ${label}.`,
            startISO: dateOnly(occurrenceDay),
            endISO: dateOnly(addDays(occurrenceDay, 1)), // all-day end is exclusive here too
            allDay: true,
          });
        }
      }

      monthIndex += 1;
      monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
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
 * checklist section (course-calendar-events.ts) calls this unconditionally,
 * independent of whether the term-bound branch below it runs.
 *
 * The key ("checklist-<id>-once") deliberately never contains a week index,
 * unlike buildChecklistEvents' "checklist-<id>-w<N>" - there is only ever one
 * occurrence, forever, so there is nothing to index. isRecognizedEventKey
 * (course-calendar-events.ts) and isChecklistEventKeyForItem both know this
 * exact shape (see CHECKLIST_KEY_SUFFIX_PATTERN's own doc comment) - together
 * they are what makes diffPlannedEvents correctly clean up an item's OLD
 * recurring events when it is switched to one-off (the old "-w<N>" keys stop
 * appearing in `planned` and fall out as deletes) and vice versa (the old
 * "-once" key falls out the same way when switched back).
 *
 * AC6: the CHECKLIST_DONE_PREFIX is applied whenever the item is simply
 * `checked` - unlike the recurring case, there is no "which week was it
 * checked in" question to answer here, because there is only this ONE
 * occurrence for the item's entire lifetime. checkedAt's own timestamp is
 * irrelevant to the prefix for a one-off item (it still stamps/clears
 * normally - see toggleWeeklyChecklistItem, weekly-checklist.ts - it is just
 * never consulted here).
 */
export function buildOneOffChecklistEvents(items: WeeklyChecklistItem[], label: string): PlannedEvent[] {
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
 * Whether `key` is one of buildCourseEvents' checklist keys belonging to
 * exactly `itemId` - RECURRING ("checklist-<id>-w<N>"), ONE-OFF
 * ("checklist-<id>-once"), DAILY ("checklist-<id>-d<YYYY-MM-DD>"), or
 * MONTHLY ("checklist-<id>-m<N>"). Exported so both findAllChecklistItemEvents
 * (course-calendar-events.ts) and the scoped per-item sync action's existing-
 * event filter (src/app/actions/course-calendar.ts's
 * syncChecklistItemCalendarAction) agree on exactly one definition of
 * "belongs to this item", rather than two independent guesses that could
 * drift apart - the same rationale CHECKLIST_KEY_SUFFIX_PATTERN already
 * documents for itself.
 *
 * Matches by PREFIX + SUFFIX SHAPE rather than embedding `itemId` into a
 * regex (item ids are caller-supplied strings that may contain characters a
 * regex would need escaping for): `key` must start with
 * "checklist-<itemId>-", and everything after that prefix must be exactly
 * one of the four recognized suffix shapes - nothing else (that shared suffix
 * definition is CHECKLIST_KEY_SUFFIX_PATTERN above). This is what lets an
 * item id that itself contains dashes (a UUID, or one ending in something
 * that looks like a suffix) never falsely match another item's key: e.g.
 * itemId "abc" is a literal string-prefix of the key "checklist-abc-def-w0"
 * (which actually belongs to item "abc-def"), but that key's remainder
 * ("def-w0") satisfies none of the four shapes, so it is correctly rejected
 * instead of being mistaken for item "abc"'s own event. AC4: this is exactly
 * what lets an item switched between kinds (recurring <-> one-off <-> daily
 * <-> monthly, in any direction) get its OLD kind's now-stale keys correctly
 * recognized as "still belongs to this item" so diffPlannedEvents can clean
 * them up, while never reaching into a DIFFERENT item's keys to do it.
 */
export function isChecklistEventKeyForItem(key: string, itemId: string): boolean {
  const prefix = `checklist-${itemId}-`;
  if (!key.startsWith(prefix)) return false;
  const suffix = key.slice(prefix.length);
  return CHECKLIST_KEY_SUFFIX_REGEX.test(suffix);
}

/**
 * AC5: narrower than courseCalendarBlockers (course-calendar-events.ts) -
 * reports "missing-dates" only when at least one of `items` actually NEEDS
 * the tile's term bound to sync, i.e. a RECURRING, DAILY, or MONTHLY
 * deadlined item (see buildChecklistEvents'/buildDailyChecklistEvents'/
 * buildMonthlyChecklistEvents' own missing-dates gates in
 * course-calendar-events.ts's buildCourseEvents - all three require
 * [startDate, endDate], unlike a one-off item). A course whose deadlined
 * checklist items are ALL one-off is never blocked by missing dates for
 * checklist purposes: a one-off item is self-contained and syncs regardless
 * (buildOneOffChecklistEvents above), so telling the instructor "set both
 * dates to enable it" would be false in that case - exactly the over-claim
 * AC5 calls out. `!isOneOffChecklistDeadline` already captures "recurring,
 * daily, or monthly" correctly with no further change needed here: those are
 * exactly the three kinds that are NOT one-off.
 *
 * courseCalendarBlockers itself is intentionally left unchanged rather than
 * having this logic folded into it (see that function's own doc comment):
 * the term event it also answers for is unconditionally blocked by missing
 * dates no matter what the checklist contains, so narrowing ITS answer would
 * make it wrong about the term event instead. This function exists
 * specifically for a caller that wants the answer scoped to "are checklist
 * deadlines specifically blocked" - WeeklyChecklistCell.tsx's own badge is
 * exactly that caller, and is already wired to this function (via the
 * re-export in course-calendar-events.ts): it computes `calendarBlockers`
 * only when the checklist actually has a deadlined item, calling this
 * function rather than the broader courseCalendarBlockers.
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
