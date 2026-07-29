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

import { requireOwner } from "@/lib/supabase/auth";
import { listCourses } from "@/lib/supabase/courses";
import { getValidAccessToken } from "@/lib/google-credentials";
import { getSchedulingConfig } from "@/lib/scheduling";
import {
  resolveCalendarTarget,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listEventsByPrivateProps,
  type CreateEventInput,
} from "@/lib/google-calendar";
import {
  buildCourseEvents,
  diffPlannedEvents,
  isRecognizedEventKey,
  findCurrentWeekChecklistEvent,
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

    const { events: planned, notes } = buildCourseEvents({ course: tile });

    // resolveCalendarTarget already validated a token exists; it does not
    // expose it back to the caller, so it is fetched again here for the
    // Calendar API calls below.
    const token = await getValidAccessToken(user.id);
    if (!token) {
      return { error: NOT_CONNECTED_MESSAGE };
    }

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
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sync the course calendar." };
  }
}

export interface SyncChecklistItemResult {
  /** True when a calendar write (create or update) actually happened. False
   * is not an error - it means there is currently nothing to push for this
   * item this week (no deadline, or the current week falls outside the
   * course's term bounds); see `reason`. */
  synced: boolean;
  reason?: "not-planned-this-week";
}

/**
 * AC7's bounded-cost calendar write: push (create or update) exactly the ONE
 * calendar event that corresponds to `itemId`'s occurrence in the CURRENT
 * week, rather than re-running syncCourseCalendarAction's full diff over
 * every event the course has ever planned. Called right after a checklist
 * checkbox toggle persists locally (WeeklyChecklistCell.tsx) - a failure here
 * must never be treated as "the check didn't save": the caller already
 * persisted the checked state before calling this, and is expected to surface
 * a returned {error} as a non-fatal, separate notice rather than reverting
 * the checkbox.
 *
 * Never deletes. An item whose deadline was cleared, or whose current week
 * has no planned occurrence, is simply left alone here - any calendar entry
 * that needs cleaning up as a result is picked up by the next full
 * syncCourseCalendarAction (AC6), exactly like a rename or a re-timed
 * deadline already is.
 */
export async function syncChecklistItemCalendarAction(
  courseId: string,
  itemId: string,
  opts?: { calendarName?: string; nowMs?: number }
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

    const { events: planned } = buildCourseEvents({ course: tile });
    const nowMs = opts?.nowMs ?? Date.now();
    const targetEvent = findCurrentWeekChecklistEvent(planned, trimmedItemId, nowMs);
    if (!targetEvent) {
      return { synced: false, reason: "not-planned-this-week" };
    }

    const calendarName = opts?.calendarName?.trim() || DEFAULT_CALENDAR_NAME;
    const target = await resolveCalendarTarget(user.id, calendarName);
    if (!target.ok) {
      return { error: target.message };
    }

    const token = await getValidAccessToken(user.id);
    if (!token) {
      return { error: NOT_CONNECTED_MESSAGE };
    }

    const timeZone = getSchedulingConfig().timeZone;
    const existing = await listEventsByPrivateProps(token, target.calendarId, {
      taCourseId: tile.id,
      taKey: targetEvent.key,
    });
    const match = existing[0];

    if (match) {
      await updateCalendarEvent(
        token,
        target.calendarId,
        match.id,
        toCreateEventInput(targetEvent, tile.id, target.calendarId, timeZone)
      );
    } else {
      await createCalendarEvent(token, toCreateEventInput(targetEvent, tile.id, target.calendarId, timeZone));
    }

    return { synced: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not sync the checklist item to the calendar." };
  }
}
