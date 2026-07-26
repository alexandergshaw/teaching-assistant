// Thin Google Calendar REST client (raw fetch, no SDK). Capabilities:
//   - queryFreeBusy / listCalendarEvents: busy intervals + event blocks for the
//     meeting-slot planner (Phase 2). Unchanged by the additions below.
//   - createCalendarEvent: book a slot, optionally with a Google Meet link, on
//     a chosen calendar. Defaults (calendarId "primary", withMeet true)
//     preserve the original meeting-booking behavior exactly.
//   - listCalendars / findCalendarByName: locate a calendar the user owns or
//     can write to by name (e.g. their own "Adjuncting" calendar). Callers
//     MUST treat "not found" as an error, never fall back to "primary".
//   - listEventsByPrivateProps / updateCalendarEvent / deleteCalendarEvent:
//     idempotent sync primitives. Events created with `privateProps` carry an
//     extendedProperties.private tag, so a sync can find, update, or delete
//     only the events it created itself - it never touches the user's own.
//   - resolveCalendarTarget: turns (userId, calendarName) into a writable
//     calendar id, distinguishing "Google not connected" and "calendar not
//     found" (both user-fixable) from a generic API failure.

import { getValidAccessToken } from "./google-credentials";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface BusyInterval {
  start: Date;
  end: Date;
}

/**
 * Return the owner's busy intervals on their primary calendar between two
 * instants. `timeZone` only affects how Google interprets all-day events.
 */
export async function queryFreeBusy(
  accessToken: string,
  timeMinISO: string,
  timeMaxISO: string,
  timeZone: string
): Promise<BusyInterval[]> {
  const response = await fetch(`${CALENDAR_API}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      timeZone,
      items: [{ id: "primary" }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Free/Busy request failed (HTTP ${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    calendars?: { primary?: { busy?: Array<{ start: string; end: string }> } };
  };
  const busy = data.calendars?.primary?.busy ?? [];
  return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

export interface CalendarEventBlock {
  startISO: string;
  endISO: string;
  title: string;
}

/**
 * List the owner's timed events on their primary calendar in a window, so the
 * meeting planner can draw real busy blocks (with titles) behind the open slots.
 * All-day events (no dateTime) and events the owner has marked "free" are skipped
 * so the grid only shows genuine conflicts.
 */
export async function listCalendarEvents(
  accessToken: string,
  timeMinISO: string,
  timeMaxISO: string,
  timeZone: string
): Promise<CalendarEventBlock[]> {
  const params = new URLSearchParams({
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    timeZone,
  });
  const response = await fetch(`${CALENDAR_API}/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google events list failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    items?: Array<{
      summary?: string;
      status?: string;
      transparency?: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
    }>;
  };
  const blocks: CalendarEventBlock[] = [];
  for (const item of data.items ?? []) {
    if (item.status === "cancelled") continue;
    if (item.transparency === "transparent") continue; // shown as "free" on the calendar
    const start = item.start?.dateTime;
    const end = item.end?.dateTime;
    if (!start || !end) continue; // skip all-day (date-only) events
    blocks.push({
      startISO: new Date(start).toISOString(),
      endISO: new Date(end).toISOString(),
      title: item.summary?.trim() || "Busy",
    });
  }
  return blocks;
}

// ── Calendar lookup (find a calendar by name) ────────────────────────────

export interface CalendarSummary {
  id: string;
  summary: string;
  primary: boolean;
}

/** A calendarList entry, before the writable-access filter is applied. */
export interface CalendarListEntry {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
}

/** A read-only shared calendar cannot receive events - surfacing it would only produce a confusing 403 later. */
function isWritableRole(accessRole: string): boolean {
  return accessRole === "owner" || accessRole === "writer";
}

function sameCalendarName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Fetch every calendarList entry (any access role), following nextPageToken so a user with many calendars never loses entries. */
async function fetchCalendarListEntries(accessToken: string): Promise<CalendarListEntry[]> {
  const entries: CalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ maxResults: "250" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`${CALENDAR_API}/users/me/calendarList?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google calendar list failed (HTTP ${response.status}): ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as {
      items?: Array<{ id?: string; summary?: string; primary?: boolean; accessRole?: string }>;
      nextPageToken?: string;
    };
    for (const item of data.items ?? []) {
      if (!item.id) continue;
      entries.push({
        id: item.id,
        summary: item.summary ?? item.id,
        primary: item.primary === true,
        accessRole: item.accessRole ?? "",
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return entries;
}

/** All calendars the user can write to (accessRole "owner" or "writer"). */
export async function listCalendars(accessToken: string): Promise<CalendarSummary[]> {
  const entries = await fetchCalendarListEntries(accessToken);
  return entries
    .filter((e) => isWritableRole(e.accessRole))
    .map((e) => ({ id: e.id, summary: e.summary, primary: e.primary }));
}

/**
 * Pure matcher used by `findCalendarByName`: the writable entry whose summary
 * equals `name` case-insensitively, ignoring leading/trailing whitespace on
 * both sides. Null when no writable entry matches (a non-writable entry with
 * a matching name is deliberately excluded, not returned).
 */
export function pickCalendarByName(entries: CalendarListEntry[], name: string): CalendarSummary | null {
  const match = entries.find((e) => isWritableRole(e.accessRole) && sameCalendarName(e.summary, name));
  return match ? { id: match.id, summary: match.summary, primary: match.primary } : null;
}

/**
 * The calendar whose summary matches `name` (case-insensitive, trimmed).
 * Returns null when absent - callers MUST treat null as an error, never as
 * "use primary" (that would scatter events through the user's own calendar).
 */
export async function findCalendarByName(accessToken: string, name: string): Promise<CalendarSummary | null> {
  const entries = await fetchCalendarListEntries(accessToken);
  return pickCalendarByName(entries, name);
}

// ── Event creation ────────────────────────────────────────────────────────

export interface CreateEventInput {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  timeZone: string;
  /** When present, these people are invited (and emailed) by Google. */
  attendeeEmails?: string[];
  /** Target calendar. Default "primary" - existing callers unchanged. */
  calendarId?: string;
  /** Attach a Google Meet conference. Default TRUE, preserving the existing
   *  meeting-booking behavior exactly. Course sync passes false. */
  withMeet?: boolean;
  /** Opaque tags used for idempotency - see listEventsByPrivateProps. */
  privateProps?: Record<string, string>;
}

export interface CreatedEvent {
  htmlLink: string | null;
  meetLink: string | null;
}

export interface EventBody {
  body: Record<string, unknown>;
  /** "all" only makes sense when there are attendees to notify; a course sync
   *  with none must never email anyone, so it is "none" whenever attendeeEmails is empty. */
  sendUpdates: "all" | "none";
}

/**
 * Pure request-body (and sendUpdates) construction, shared by create and
 * update so a re-sync (update) builds the exact same shape a create would -
 * including extendedProperties - and so the shape is unit-testable without a
 * network call.
 */
export function buildEventBody(input: CreateEventInput): EventBody {
  const attendeeEmails = input.attendeeEmails ?? [];
  const withMeet = input.withMeet !== false;
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startISO, timeZone: input.timeZone },
    end: { dateTime: input.endISO, timeZone: input.timeZone },
    attendees: attendeeEmails.map((email) => ({ email })),
  };
  if (withMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `ta-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  if (input.privateProps) {
    body.extendedProperties = { private: input.privateProps };
  }
  return { body, sendUpdates: attendeeEmails.length > 0 ? "all" : "none" };
}

function toCreatedEvent(data: {
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
}): CreatedEvent {
  const video = data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
  return {
    htmlLink: data.htmlLink ?? null,
    meetLink: data.hangoutLink ?? video?.uri ?? null,
  };
}

/**
 * Create an event on a calendar (default the owner's primary), optionally
 * with a Google Meet conference attached (default true, matching the
 * original always-on behavior), returning the event link and Meet join URL.
 */
export async function createCalendarEvent(
  accessToken: string,
  input: CreateEventInput
): Promise<CreatedEvent> {
  const calendarId = input.calendarId ?? "primary";
  const withMeet = input.withMeet !== false;
  const { body, sendUpdates } = buildEventBody(input);
  const params = new URLSearchParams({ sendUpdates });
  if (withMeet) params.set("conferenceDataVersion", "1");

  const response = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const respBody = await response.text();
    throw new Error(`Google event creation failed (HTTP ${response.status}): ${respBody.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
  };
  return toCreatedEvent(data);
}

// ── Idempotent sync primitives ───────────────────────────────────────────

/**
 * Pure query-string construction for `listEventsByPrivateProps`. Each prop
 * becomes its own `privateExtendedProperty=key=value` parameter (Google ANDs
 * them together, so an event must carry ALL of them to match), and the time
 * bounds are only included when given.
 */
export function buildPrivatePropQuery(
  props: Record<string, string>,
  opts?: { timeMinISO?: string; timeMaxISO?: string }
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(props)) {
    params.append("privateExtendedProperty", `${key}=${value}`);
  }
  params.set("singleEvents", "true");
  params.set("maxResults", "250");
  if (opts?.timeMinISO) params.set("timeMin", opts.timeMinISO);
  if (opts?.timeMaxISO) params.set("timeMax", opts.timeMaxISO);
  return params;
}

/**
 * Events on `calendarId` carrying ALL of the given private properties - the
 * set of events a sync created itself, so it can converge (update/delete)
 * without ever touching the user's own entries. Follows nextPageToken.
 */
export async function listEventsByPrivateProps(
  accessToken: string,
  calendarId: string,
  props: Record<string, string>,
  opts?: { timeMinISO?: string; timeMaxISO?: string }
): Promise<Array<{ id: string; summary: string; startISO: string | null; privateProps: Record<string, string> }>> {
  const results: Array<{ id: string; summary: string; startISO: string | null; privateProps: Record<string, string> }> = [];
  let pageToken: string | undefined;
  do {
    const params = buildPrivatePropQuery(props, opts);
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google tagged events list failed (HTTP ${response.status}): ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as {
      items?: Array<{
        id?: string;
        summary?: string;
        status?: string;
        start?: { dateTime?: string; date?: string };
        extendedProperties?: { private?: Record<string, string> };
      }>;
      nextPageToken?: string;
    };
    for (const item of data.items ?? []) {
      if (!item.id || item.status === "cancelled") continue;
      const startISO = item.start?.dateTime
        ? new Date(item.start.dateTime).toISOString()
        : item.start?.date
          ? new Date(item.start.date).toISOString()
          : null;
      results.push({
        id: item.id,
        summary: item.summary?.trim() || "",
        startISO,
        privateProps: item.extendedProperties?.private ?? {},
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return results;
}

/**
 * Update an event in place (PUT), rebuilding the exact same body shape
 * `createCalendarEvent` would - including extendedProperties.private - so a
 * re-sync converges instead of accumulating drift.
 */
export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  input: CreateEventInput
): Promise<CreatedEvent> {
  const withMeet = input.withMeet !== false;
  const { body, sendUpdates } = buildEventBody(input);
  const params = new URLSearchParams({ sendUpdates });
  if (withMeet) params.set("conferenceDataVersion", "1");

  const response = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${params.toString()}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const respBody = await response.text();
    throw new Error(`Google event update failed (HTTP ${response.status}): ${respBody.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
  };
  return toCreatedEvent(data);
}

/**
 * Delete an event. HTTP 404 and 410 are treated as success - the event is
 * already gone, which is the desired end state (410 is what Google returns
 * for an event that was already deleted).
 */
export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const response = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (response.ok || response.status === 404 || response.status === 410) {
    return;
  }
  const body = await response.text();
  throw new Error(`Google event deletion failed (HTTP ${response.status}): ${body.slice(0, 300)}`);
}

// ── Sync target resolution ───────────────────────────────────────────────

export type CalendarTargetResult =
  | { ok: true; calendarId: string; calendarName: string }
  | { ok: false; reason: "not-connected" | "calendar-not-found"; message: string };

/**
 * Resolve the sync target for a user: a valid access token plus the named
 * calendar. Never falls back to "primary" - a missing calendar is reported so
 * the caller can surface it as a user-fixable problem instead of silently
 * scattering course events through the user's personal calendar.
 */
export async function resolveCalendarTarget(
  userId: string,
  calendarName: string
): Promise<CalendarTargetResult> {
  const token = await getValidAccessToken(userId);
  if (!token) {
    return {
      ok: false,
      reason: "not-connected",
      message: "Google Calendar isn't connected. Connect it under Account > Integrations.",
    };
  }

  const found = await findCalendarByName(token, calendarName);
  if (found) {
    return { ok: true, calendarId: found.id, calendarName: found.summary };
  }

  const writable = await listCalendars(token);
  const names = writable.length > 0 ? writable.map((c) => c.summary).join(", ") : "(none found)";
  return {
    ok: false,
    reason: "calendar-not-found",
    message: `Could not find a Google Calendar named "${calendarName.trim()}". Calendars you can write to: ${names}.`,
  };
}
