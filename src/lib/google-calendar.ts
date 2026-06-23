// Thin Google Calendar REST client (raw fetch). Two capabilities:
//   - queryFreeBusy: the busy intervals used to compute open meeting slots.
//   - createCalendarEvent: book a slot and attach a Google Meet link (Phase 2).

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

export interface CreateEventInput {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  timeZone: string;
  /** When present, these people are invited (and emailed) by Google. */
  attendeeEmails?: string[];
}

export interface CreatedEvent {
  htmlLink: string | null;
  meetLink: string | null;
}

/**
 * Create an event on the owner's primary calendar with a Google Meet conference
 * attached, returning the event link and the Meet join URL.
 */
export async function createCalendarEvent(
  accessToken: string,
  input: CreateEventInput
): Promise<CreatedEvent> {
  const requestId = `ta-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const response = await fetch(
    `${CALENDAR_API}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startISO, timeZone: input.timeZone },
        end: { dateTime: input.endISO, timeZone: input.timeZone },
        attendees: (input.attendeeEmails ?? []).map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google event creation failed (HTTP ${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
  };
  const video = data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
  return {
    htmlLink: data.htmlLink ?? null,
    meetLink: data.hangoutLink ?? video?.uri ?? null,
  };
}
