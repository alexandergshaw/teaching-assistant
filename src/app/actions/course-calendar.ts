"use server";

// Push a course tile's dates onto the user's own Google Calendar (default
// "Adjuncting"), idempotently. This is the Google-facing "how do we write it"
// half of the sync - the "what would we write" half (dates, notes, the diff
// against what is already on the calendar) is entirely pure and lives in
// src/lib/course-calendar-events.ts.
//
// The governing constraint: the target calendar holds the user's OWN other
// events too, so every event this writes carries taCourseId/taKind/taKey
// private properties, and the sync finds its own events by querying
// taCourseId alone - see resolveCalendarTarget/listEventsByPrivateProps in
// src/lib/google-calendar.ts and diffPlannedEvents's untagged-event guard in
// course-calendar-events.ts. It never wipes or rebuilds the calendar, and an
// untagged event is always left alone and merely counted.
//
// Three entry points share the same underlying mechanism (buildCourseEvents
// + diffPlannedEvents + isRecognizedEventKey - never a second planner):
//   - syncCourseCalendarAction: one course, every event kind (term, meeting,
//     test, due, checklist) - the full diff.
//   - syncAllCoursesCalendarAction: every course the owner has, each course
//     isolated so one bad course cannot abort the rest - see
//     syncOneCourseCalendar, the shared implementation both this and
//     syncCourseCalendarAction call.
//   - syncChecklistItemCalendarAction: one checklist item's own occurrences
//     across the whole term, scoped small enough to run after every relevant
//     checklist edit (add, rename, re-day/re-time, toggle, remove) instead of
//     only when a full sync happens to run.

import { requireOwner } from "@/lib/supabase/auth";
import { listCourses } from "@/lib/supabase/courses";
import type { Course } from "@/lib/supabase/courses";
import { getValidAccessToken } from "@/lib/google-credentials";
import { getSchedulingConfig } from "@/lib/scheduling";
import {
  resolveCalendarTarget,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listEventsByPrivateProps,
  type CreateEventInput,
  type CalendarTargetResult,
} from "@/lib/google-calendar";
import {
  buildCourseEvents,
  diffPlannedEvents,
  isRecognizedEventKey,
  findAllChecklistItemEvents,
  type ExistingEvent,
  type PlannedEvent,
} from "@/lib/course-calendar-events";

const DEFAULT_CALENDAR_NAME = "Adjuncting";
const NOT_CONNECTED_MESSAGE = "Google Calendar isn't connected. Connect it under Account > Integrations.";
// A sync that half succeeds must say so precisely, but a failure per event
// (of possibly hundreds) must not flood the report - keep the first several
// verbatim and fold the rest into one "+N more" line.
const MAX_FAILURE_NOTES = 10;

export interface SyncCourseCalendarResult {
  created: number;
  updated: number;
  deleted: number;
  skippedUntagged: number;
  calendarName: string;
  notes: string[];
}

/**
 * PlannedEvent -> the wire shape createCalendarEvent/updateCalendarEvent
 * expect. All-day PlannedEvents carry date-only ("YYYY-MM-DD") bounds (see
 * course-calendar-events.ts); google-calendar.ts's CreateEventInput has no
 * date-only mode (its buildEventBody always emits a `dateTime` + `timeZone`
 * pair, never Google's `date`-only all-day shape), so an all-day plan is
 * bridged to a local-midnight-to-local-midnight timed span in the sync's
 * configured time zone instead. This still blocks exactly the calendar dates
 * the plan intends (including the end-exclusive day the plan already added);
 * only the wire encoding differs from a native Google all-day event.
 */
function toCreateEventInput(
  event: PlannedEvent,
  courseId: string,
  calendarId: string,
  timeZone: string
): CreateEventInput {
  return {
    summary: event.summary,
    description: event.description,
    startISO: event.allDay ? `${event.startISO}T00:00:00` : event.startISO,
    endISO: event.allDay ? `${event.endISO}T00:00:00` : event.endISO,
    timeZone,
    calendarId,
    withMeet: false,
    privateProps: {
      taCourseId: courseId,
      taKind: event.kind,
      taKey: event.key,
    },
  };
}

/** Push a failure note, capping the LIST at MAX_FAILURE_NOTES and tallying
 * the rest so the caller can append one "+N more" line. */
function recordFailure(notes: string[], overflow: { count: number }, note: string): void {
  if (notes.length < MAX_FAILURE_NOTES) {
    notes.push(note);
  } else {
    overflow.count += 1;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}

/**
 * The shared implementation behind both syncCourseCalendarAction (one
 * course) and syncAllCoursesCalendarAction (every course, isolated per
 * course) - extracted so the two entry points can never drift into two
 * different diff/apply implementations. Takes an already-resolved calendar
 * target and token so the all-courses caller can resolve them ONCE (Google
 * Calendar connection is a per-USER setting, not per-course, so re-resolving
 * it for every course in a term would be N redundant lookups for the same
 * answer) rather than once per course.
 */
async function syncOneCourseCalendar(
  token: string,
  target: { calendarId: string; calendarName: string },
  tile: Course,
  opts?: { dryRun?: boolean }
): Promise<SyncCourseCalendarResult> {
  const { events: planned, notes } = buildCourseEvents({ course: tile });

  const rawExisting = await listEventsByPrivateProps(token, target.calendarId, {
    taCourseId: tile.id,
  });

  let skippedUntagged = 0;
  const existing: ExistingEvent[] = [];
  for (const raw of rawExisting) {
    const key = raw.privateProps.taKey ?? "";
    if (!key || !isRecognizedEventKey(key)) {
      skippedUntagged += 1;
      continue;
    }
    existing.push({ id: raw.id, key });
  }

  const diff = diffPlannedEvents(planned, existing);

  if (opts?.dryRun === true) {
    return {
      created: diff.toCreate.length,
      updated: diff.toUpdate.length,
      deleted: diff.toDelete.length,
      skippedUntagged,
      calendarName: target.calendarName,
      notes: [...notes, "Dry run - no events were created, updated, or deleted."],
    };
  }

  const timeZone = getSchedulingConfig().timeZone;
  let created = 0;
  let updated = 0;
  let deleted = 0;
  const failureNotes: string[] = [];
  const overflow = { count: 0 };

  // Catch per event and keep going - a shortened term or a mid-run API
  // hiccup must not orphan everything else the sync already created.
  for (const event of diff.toCreate) {
    try {
      await createCalendarEvent(token, toCreateEventInput(event, tile.id, target.calendarId, timeZone));
      created += 1;
    } catch (err) {
      recordFailure(
        failureNotes,
        overflow,
        `create "${event.summary}" (${event.key}) failed: ${errorMessage(err)}`
      );
    }
  }

  for (const { id, event } of diff.toUpdate) {
    try {
      await updateCalendarEvent(token, target.calendarId, id, toCreateEventInput(event, tile.id, target.calendarId, timeZone));
      updated += 1;
    } catch (err) {
      recordFailure(
        failureNotes,
        overflow,
        `update "${event.summary}" (${event.key}) failed: ${errorMessage(err)}`
      );
    }
  }

  for (const id of diff.toDelete) {
    try {
      await deleteCalendarEvent(token, target.calendarId, id);
      deleted += 1;
    } catch (err) {
      recordFailure(failureNotes, overflow, `delete event ${id} failed: ${errorMessage(err)}`);
    }
  }

  if (overflow.count > 0) {
    failureNotes.push(`+${overflow.count} more`);
  }

  return {
    created,
    updated,
    deleted,
    skippedUntagged,
    calendarName: target.calendarName,
    notes: [...notes, ...failureNotes],
  };
}

export async function syncCourseCalendarAction(
  courseId: string,
  opts?: { calendarName?: string; dryRun?: boolean }
): Promise<SyncCourseCalendarResult | { error: string }> {
  try {
    const user = await requireOwner();

    const trimmedCourseId = courseId.trim();
    if (!trimmedCourseId) {
      return { error: "Choose a course." };
    }

    const courses = await listCourses(user.id);
    const tile = courses.find((c) => c.id === trimmedCourseId);
    if (!tile) {
      return { error: "Course not found." };
    }

    const calendarName = opts?.calendarName?.trim() || DEFAULT_CALENDAR_NAME;
    const target = await resolveCalendarTarget(user.id, calendarName);
    if (!target.ok) {
      return { error: target.message };
    }

    // resolveCalendarTarget already validated a token exists; it does not
    // expose it back to the caller, so it is fetched again here for the
    // Calendar API calls below.
    const token = await getValidAccessToken(user.id);
    if (!token) {
      return { error: NOT_CONNECTED_MESSAGE };
    }

    return await syncOneCourseCalendar(token, target, tile, { dryRun: opts?.dryRun });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sync the course calendar." };
  }
}

export type SyncAllCoursesCourseOutcome =
  | { courseId: string; courseName: string; outcome: "synced"; created: number; updated: number; deleted: number; notes: string[] }
  | { courseId: string; courseName: string; outcome: "skipped"; notes: string[] }
  | { courseId: string; courseName: string; outcome: "error"; error: string };

export interface SyncAllCoursesCalendarResult {
  calendarName: string;
  perCourse: SyncAllCoursesCourseOutcome[];
}

/**
 * AC8: run the SAME per-course sync (syncOneCourseCalendar - buildCourseEvents
 * + diffPlannedEvents + isRecognizedEventKey, never a second planner) across
 * every course the owner has, instead of requiring courseId-by-courseId
 * calls the instructor has no built-in reason to ever make for more than one
 * course at a time. This is the direct fix for "give me a running event from
 * the start to the end date for each course in the course table" - the term
 * event syncOneCourseCalendar already produces for every course was never
 * missing; nothing was ever calling the sync for more than one course, or
 * for any course an instructor had not manually picked.
 *
 * The calendar target and access token are resolved ONCE up front (a Google
 * connection problem is a per-USER condition, not a per-course one, so
 * re-discovering "not connected" once per course would be pure waste and
 * would flood the result with N copies of the same top-level error) and a
 * failure here aborts the whole run with a single {error} - there is nothing
 * per-course to isolate yet at that point.
 *
 * AC8's per-course isolation starts only once the shared target/token are in
 * hand: each course's own syncOneCourseCalendar call is wrapped in its own
 * try/catch, so a single course with a malformed date, a Canvas-unrelated
 * data issue, or a mid-run Google API failure produces one "error" entry and
 * the loop moves on - it can never abort the rest of the term's courses.
 * (syncOneCourseCalendar itself already catches per-EVENT failures inside
 * its own create/update/delete loops; this outer try/catch is a second,
 * coarser safety net for anything that fails before or between those loops,
 * e.g. buildCourseEvents throwing on a truly malformed row, or the
 * course-scoped listEventsByPrivateProps call itself failing.)
 *
 * A course is reported "skipped" (not "synced") when the diff produced
 * nothing to create/update/delete - either because buildCourseEvents itself
 * has a note explaining why (most commonly "no start date or end date set -
 * the term event was skipped", AC9's other visibility half), or because the
 * course's calendar entries were already fully up to date. Either way,
 * `notes` carries the explanation so the caller can show WHY, not just that
 * nothing happened.
 *
 * AC10: running this alongside/after/before syncCourseCalendarAction or a
 * repeat of itself never double-creates anything - every course's diff is
 * computed against that SAME course's own taCourseId-tagged existing events
 * via the identical diffPlannedEvents/isRecognizedEventKey ownership
 * mechanism syncCourseCalendarAction already uses, so two runs (in either
 * order, from either entry point) converge to the same idempotent result a
 * single full sync would.
 */
export async function syncAllCoursesCalendarAction(
  opts?: { calendarName?: string }
): Promise<SyncAllCoursesCalendarResult | { error: string }> {
  try {
    const user = await requireOwner();
    const courses = await listCourses(user.id);

    const calendarName = opts?.calendarName?.trim() || DEFAULT_CALENDAR_NAME;
    const target: CalendarTargetResult = await resolveCalendarTarget(user.id, calendarName);
    if (!target.ok) {
      return { error: target.message };
    }

    const token = await getValidAccessToken(user.id);
    if (!token) {
      return { error: NOT_CONNECTED_MESSAGE };
    }

    const perCourse: SyncAllCoursesCourseOutcome[] = [];
    for (const tile of courses) {
      try {
        const result = await syncOneCourseCalendar(token, target, tile);
        const totalOps = result.created + result.updated + result.deleted;
        if (totalOps === 0) {
          perCourse.push({
            courseId: tile.id,
            courseName: tile.name,
            outcome: "skipped",
            notes: result.notes.length > 0 ? result.notes : ["nothing to sync"],
          });
        } else {
          perCourse.push({
            courseId: tile.id,
            courseName: tile.name,
            outcome: "synced",
            created: result.created,
            updated: result.updated,
            deleted: result.deleted,
            notes: result.notes,
          });
        }
      } catch (err) {
        perCourse.push({ courseId: tile.id, courseName: tile.name, outcome: "error", error: errorMessage(err) });
      }
    }

    return { calendarName: target.calendarName, perCourse };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sync the course calendars." };
  }
}

export interface SyncChecklistItemResult {
  /** True when at least one calendar write (create, update, or delete)
   * actually happened. False is not an error - it means this item currently
   * has nothing to push AND nothing stale to clean up (see `reason`). */
  synced: boolean;
  reason?: "nothing-to-sync";
}

/**
 * AC1/AC2's bounded-cost calendar write: push (create/update) or clean up
 * (delete) every calendar event that belongs to exactly ONE checklist item
 * (`itemId`) - every calendar-week occurrence buildChecklistEvents would
 * produce for it across the WHOLE course term - rather than re-running
 * syncCourseCalendarAction's full diff over every event kind the course has
 * ever planned.
 *
 * This supersedes the earlier "current week only" version of this action:
 * that shape meant a checkbox toggle synced immediately but an add, a
 * rename, a re-time/re-day, or a deadline being added/cleared did not reach
 * the calendar until the instructor separately ran a full "Sync course
 * calendar" - which nothing in the UI ever prompted them to discover or run.
 * The fix is for every checklist mutation that could affect the calendar
 * (add, rename, re-day/re-time, toggle, remove - see
 * WeeklyChecklistCell.tsx) to call this SAME bounded per-item action every
 * time, covering that item's own full set of occurrences - never a
 * course-wide resync, but never silently "only this week" either.
 *
 * Bounded/scoped means: the Google list query is restricted to taCourseId +
 * taKind "checklist" (so it never even fetches term/meeting/test/due
 * events), and the response is further filtered in-memory down to keys
 * carrying THIS item's own "checklist-<itemId>-w" prefix before it ever
 * reaches diffPlannedEvents - another item's checklist event may come back
 * in the same page of results, but it is discarded before the diff, so it is
 * never created, updated, or deleted by this call. That is the
 * untagged-event guard's own "never touch what you don't recognize as
 * yours" contract applied one level tighter (yours AND this specific item's).
 *
 * Always resolves the calendar target and lists existing tagged events -
 * even when the item currently has no deadline - because "currently has no
 * deadline" does not mean "never had one": an item whose deadline was just
 * cleared, or that was just removed from the checklist entirely, still needs
 * its old occurrences deleted, and the only way to know whether any exist is
 * to ask. The caller is expected to skip calling this action at all when a
 * mutation could not possibly have touched the calendar either before or
 * after (see weekly-checklist.ts's checklistDeadlineChangeNeedsCalendarSync)
 * - that is where "editing an item that never had a deadline costs nothing"
 * actually comes from; this action itself is simply correct (a safe, cheap
 * no-op reporting {synced:false}) if called anyway.
 *
 * Unlike syncCourseCalendarAction/syncAllCoursesCalendarAction, a failure
 * partway through this action's own create/update/delete batch is NOT caught
 * per-event and continued past - this action's batch is already bounded to
 * one item's own occurrences (typically at most the course's week count), so
 * failing the whole call on the first error is an acceptable, simpler trade
 * than the partial-success bookkeeping the much-larger course-wide syncs
 * need. A stale result left behind by an aborted batch self-corrects on that
 * item's next edit, or the next full sync.
 */
export async function syncChecklistItemCalendarAction(
  courseId: string,
  itemId: string,
  opts?: { calendarName?: string }
): Promise<SyncChecklistItemResult | { error: string }> {
  try {
    const user = await requireOwner();

    const trimmedCourseId = courseId.trim();
    if (!trimmedCourseId) {
      return { error: "Choose a course." };
    }
    const trimmedItemId = itemId.trim();
    if (!trimmedItemId) {
      return { error: "Choose a checklist item." };
    }

    const courses = await listCourses(user.id);
    const tile = courses.find((c) => c.id === trimmedCourseId);
    if (!tile) {
      return { error: "Course not found." };
    }

    const planned = findAllChecklistItemEvents(tile, trimmedItemId);

    const calendarName = opts?.calendarName?.trim() || DEFAULT_CALENDAR_NAME;
    const target = await resolveCalendarTarget(user.id, calendarName);
    if (!target.ok) {
      return { error: target.message };
    }

    const token = await getValidAccessToken(user.id);
    if (!token) {
      return { error: NOT_CONNECTED_MESSAGE };
    }

    const rawExisting = await listEventsByPrivateProps(token, target.calendarId, {
      taCourseId: tile.id,
      taKind: "checklist",
    });
    const prefix = `checklist-${trimmedItemId}-w`;
    const existing: ExistingEvent[] = [];
    for (const raw of rawExisting) {
      const key = raw.privateProps.taKey ?? "";
      if (key.startsWith(prefix) && isRecognizedEventKey(key)) {
        existing.push({ id: raw.id, key });
      }
    }

    const diff = diffPlannedEvents(planned, existing);
    if (diff.toCreate.length === 0 && diff.toUpdate.length === 0 && diff.toDelete.length === 0) {
      return { synced: false, reason: "nothing-to-sync" };
    }

    const timeZone = getSchedulingConfig().timeZone;

    for (const event of diff.toCreate) {
      await createCalendarEvent(token, toCreateEventInput(event, tile.id, target.calendarId, timeZone));
    }
    for (const { id, event } of diff.toUpdate) {
      await updateCalendarEvent(
        token,
        target.calendarId,
        id,
        toCreateEventInput(event, tile.id, target.calendarId, timeZone)
      );
    }
    for (const id of diff.toDelete) {
      await deleteCalendarEvent(token, target.calendarId, id);
    }

    return { synced: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sync the checklist item to the calendar." };
  }
}
