import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./google-credentials", () => ({
  getValidAccessToken: vi.fn(),
}));

import { getValidAccessToken } from "./google-credentials";
import {
  buildPrivatePropQuery,
  buildEventBody,
  pickCalendarByName,
  findCalendarByName,
  listCalendars,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listEventsByPrivateProps,
  resolveCalendarTarget,
  type CalendarListEntry,
  type CreateEventInput,
} from "./google-calendar";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── buildPrivatePropQuery (pure) ──────────────────────────────────────────

describe("buildPrivatePropQuery", () => {
  it("encodes a single prop as privateExtendedProperty=key%3Dvalue", () => {
    const params = buildPrivatePropQuery({ app: "teaching-assistant" });
    expect(params.toString()).toContain("privateExtendedProperty=app%3Dteaching-assistant");
  });

  it("produces one parameter per prop when multiple are given", () => {
    const params = buildPrivatePropQuery({ app: "teaching-assistant", kind: "course-session" });
    expect(params.getAll("privateExtendedProperty")).toEqual([
      "app=teaching-assistant",
      "kind=course-session",
    ]);
  });

  it("always includes singleEvents and maxResults", () => {
    const params = buildPrivatePropQuery({});
    expect(params.get("singleEvents")).toBe("true");
    expect(params.get("maxResults")).toBe("250");
  });

  it("omits time bounds when not given", () => {
    const params = buildPrivatePropQuery({ app: "teaching-assistant" });
    expect(params.has("timeMin")).toBe(false);
    expect(params.has("timeMax")).toBe(false);
  });

  it("includes time bounds only when given", () => {
    const params = buildPrivatePropQuery(
      { app: "teaching-assistant" },
      { timeMinISO: "2026-08-01T00:00:00.000Z", timeMaxISO: "2026-12-01T00:00:00.000Z" }
    );
    expect(params.get("timeMin")).toBe("2026-08-01T00:00:00.000Z");
    expect(params.get("timeMax")).toBe("2026-12-01T00:00:00.000Z");
  });
});

// ── buildEventBody (pure) ─────────────────────────────────────────────────

describe("buildEventBody", () => {
  const base: CreateEventInput = {
    summary: "Lecture: Week 3",
    startISO: "2026-08-10T15:00:00.000Z",
    endISO: "2026-08-10T16:00:00.000Z",
    timeZone: "America/Chicago",
  };

  it("includes conferenceData by default (withMeet omitted)", () => {
    const { body } = buildEventBody(base);
    expect(body.conferenceData).toBeDefined();
    const conferenceData = body.conferenceData as {
      createRequest: { conferenceSolutionKey: { type: string } };
    };
    expect(conferenceData.createRequest.conferenceSolutionKey).toEqual({ type: "hangoutsMeet" });
  });

  it("omits conferenceData entirely when withMeet is false", () => {
    const { body } = buildEventBody({ ...base, withMeet: false });
    expect("conferenceData" in body).toBe(false);
  });

  it("includes extendedProperties.private only when privateProps is given", () => {
    const withProps = buildEventBody({ ...base, privateProps: { app: "teaching-assistant" } }).body;
    expect(withProps.extendedProperties).toEqual({ private: { app: "teaching-assistant" } });

    const withoutProps = buildEventBody(base).body;
    expect("extendedProperties" in withoutProps).toBe(false);
  });

  it("sets sendUpdates to none when there are no attendees", () => {
    expect(buildEventBody(base).sendUpdates).toBe("none");
    expect(buildEventBody({ ...base, attendeeEmails: [] }).sendUpdates).toBe("none");
  });

  it("sets sendUpdates to all when there is at least one attendee", () => {
    expect(buildEventBody({ ...base, attendeeEmails: ["student@example.com"] }).sendUpdates).toBe("all");
  });

  it("maps attendeeEmails to Google's {email} shape", () => {
    const { body } = buildEventBody({ ...base, attendeeEmails: ["a@example.com", "b@example.com"] });
    expect(body.attendees).toEqual([{ email: "a@example.com" }, { email: "b@example.com" }]);
  });
});

// ── pickCalendarByName (pure) ─────────────────────────────────────────────

describe("pickCalendarByName", () => {
  const entries: CalendarListEntry[] = [
    { id: "cal-1", summary: "Adjuncting", primary: false, accessRole: "owner" },
    { id: "cal-2", summary: "Personal", primary: true, accessRole: "owner" },
    { id: "cal-3", summary: "Shared read-only", primary: false, accessRole: "reader" },
  ];

  it("matches case-insensitively", () => {
    expect(pickCalendarByName(entries, "ADJUNCTING")?.id).toBe("cal-1");
  });

  it("trims whitespace before matching", () => {
    expect(pickCalendarByName(entries, "  Adjuncting  ")?.id).toBe("cal-1");
  });

  it("returns null when nothing matches", () => {
    expect(pickCalendarByName(entries, "Nonexistent")).toBeNull();
  });

  it("excludes non-writable (reader) entries even when the name matches", () => {
    expect(pickCalendarByName(entries, "Shared read-only")).toBeNull();
  });
});

// ── findCalendarByName / listCalendars (fetch-mocked) ─────────────────────

describe("findCalendarByName", () => {
  it("returns the matching writable calendar", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          items: [
            { id: "cal-1", summary: "Adjuncting", primary: false, accessRole: "owner" },
            { id: "cal-2", summary: "Personal", primary: true, accessRole: "owner" },
          ],
        })
      )
    );
    const found = await findCalendarByName("token-abc", "adjuncting");
    expect(found).toEqual({ id: "cal-1", summary: "Adjuncting", primary: false });
  });

  it("returns null when no writable calendar matches", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ items: [{ id: "cal-2", summary: "Personal", primary: true, accessRole: "owner" }] })
      )
    );
    expect(await findCalendarByName("token-abc", "Adjuncting")).toBeNull();
  });

  it("follows nextPageToken instead of truncating the calendar list", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        items: [{ id: "cal-2", summary: "Personal", primary: true, accessRole: "owner" }],
        nextPageToken: "page-2",
      })
    );
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        items: [{ id: "cal-1", summary: "Adjuncting", primary: false, accessRole: "owner" }],
      })
    );
    const found = await findCalendarByName("token-abc", "Adjuncting");
    expect(found).toEqual({ id: "cal-1", summary: "Adjuncting", primary: false });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondCallUrl = String(fetchSpy.mock.calls[1][0]);
    expect(secondCallUrl).toContain("pageToken=page-2");
  });

  it("throws with the Google error message shape on a non-OK response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(findCalendarByName("token-abc", "Adjuncting")).rejects.toThrow(
      /Google calendar list failed \(HTTP 500\)/
    );
  });
});

describe("listCalendars", () => {
  it("excludes read-only shared calendars", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          items: [
            { id: "cal-1", summary: "Adjuncting", primary: false, accessRole: "owner" },
            { id: "cal-3", summary: "Shared read-only", primary: false, accessRole: "reader" },
          ],
        })
      )
    );
    const calendars = await listCalendars("token-abc");
    expect(calendars).toEqual([{ id: "cal-1", summary: "Adjuncting", primary: false }]);
  });
});

// ── createCalendarEvent (fetch-mocked) ────────────────────────────────────

describe("createCalendarEvent", () => {
  const input: CreateEventInput = {
    summary: "Video call with student",
    description: "Scheduled from the inbox.",
    startISO: "2026-08-10T15:00:00.000Z",
    endISO: "2026-08-10T15:30:00.000Z",
    timeZone: "America/Chicago",
  };

  it("preserves the existing default: calendars/primary, Meet attached, conferenceDataVersion=1", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ htmlLink: "https://cal/x", hangoutLink: "https://meet/x" }));
    await createCalendarEvent("token-abc", { ...input, attendeeEmails: ["student@example.com"] });
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/calendars/primary/events?");
    expect(String(url)).toContain("conferenceDataVersion=1");
    expect(String(url)).toContain("sendUpdates=all");
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.conferenceData).toBeDefined();
  });

  it("with no attendees, sendUpdates is none (a no-op vs. today: there was never anyone to notify)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({}));
    await createCalendarEvent("token-abc", input);
    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("sendUpdates=none");
  });

  it("honors calendarId, withMeet:false, and privateProps for course sync", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({}));
    await createCalendarEvent("token-abc", {
      ...input,
      calendarId: "abc@group.calendar.google.com",
      withMeet: false,
      privateProps: { app: "teaching-assistant", hubCourseId: "course-1" },
    });
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain(encodeURIComponent("abc@group.calendar.google.com"));
    expect(String(url)).not.toContain("conferenceDataVersion");
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.conferenceData).toBeUndefined();
    expect(body.extendedProperties).toEqual({
      private: { app: "teaching-assistant", hubCourseId: "course-1" },
    });
  });

  it("throws the existing error message shape on failure", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("bad request", { status: 400 }));
    await expect(createCalendarEvent("token-abc", input)).rejects.toThrow(
      /Google event creation failed \(HTTP 400\)/
    );
  });
});

// ── updateCalendarEvent (fetch-mocked) ────────────────────────────────────

describe("updateCalendarEvent", () => {
  it("PUTs to the event id on the given calendar with the same body shape createCalendarEvent builds", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ htmlLink: "https://cal/x" }));
    await updateCalendarEvent("token-abc", "abc@group.calendar.google.com", "event-1", {
      summary: "Lecture: Week 4",
      startISO: "2026-08-17T15:00:00.000Z",
      endISO: "2026-08-17T16:00:00.000Z",
      timeZone: "America/Chicago",
      withMeet: false,
      privateProps: { app: "teaching-assistant" },
    });
    const [url, opts] = fetchSpy.mock.calls[0];
    expect((opts as RequestInit).method).toBe("PUT");
    expect(String(url)).toContain(
      `/calendars/${encodeURIComponent("abc@group.calendar.google.com")}/events/event-1`
    );
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.extendedProperties).toEqual({ private: { app: "teaching-assistant" } });
    expect(body.conferenceData).toBeUndefined();
  });

  it("throws the update error message shape on failure", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("conflict", { status: 409 }));
    await expect(
      updateCalendarEvent("token-abc", "primary", "event-1", {
        summary: "x",
        startISO: "2026-08-17T15:00:00.000Z",
        endISO: "2026-08-17T16:00:00.000Z",
        timeZone: "America/Chicago",
      })
    ).rejects.toThrow(/Google event update failed \(HTTP 409\)/);
  });
});

// ── deleteCalendarEvent (fetch-mocked) ────────────────────────────────────

describe("deleteCalendarEvent", () => {
  it("resolves on a normal successful response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteCalendarEvent("token-abc", "primary", "event-1")).resolves.toBeUndefined();
  });

  it("treats HTTP 404 as success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("gone", { status: 404 }));
    await expect(deleteCalendarEvent("token-abc", "primary", "event-1")).resolves.toBeUndefined();
  });

  it("treats HTTP 410 as success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("gone", { status: 410 }));
    await expect(deleteCalendarEvent("token-abc", "primary", "event-1")).resolves.toBeUndefined();
  });

  it("throws on any other failure status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("server error", { status: 500 }));
    await expect(deleteCalendarEvent("token-abc", "primary", "event-1")).rejects.toThrow(
      /Google event deletion failed \(HTTP 500\)/
    );
  });
});

// ── listEventsByPrivateProps (fetch-mocked) ───────────────────────────────

describe("listEventsByPrivateProps", () => {
  it("filters cancelled events, maps dateTime/date, and follows nextPageToken", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: "evt-1",
            summary: "Lecture: Week 1",
            status: "confirmed",
            start: { dateTime: "2026-08-03T15:00:00.000Z" },
            extendedProperties: { private: { app: "teaching-assistant", hubCourseId: "course-1" } },
          },
        ],
        nextPageToken: "page-2",
      })
    );
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: "evt-2",
            summary: "Lecture: Week 2",
            status: "cancelled",
            start: { dateTime: "2026-08-10T15:00:00.000Z" },
          },
          {
            id: "evt-3",
            summary: "Lecture: Week 3",
            status: "confirmed",
            start: { date: "2026-08-17" },
            extendedProperties: { private: { app: "teaching-assistant", hubCourseId: "course-1" } },
          },
        ],
      })
    );
    const events = await listEventsByPrivateProps("token-abc", "abc@group.calendar.google.com", {
      app: "teaching-assistant",
      hubCourseId: "course-1",
    });
    expect(events.map((e) => e.id)).toEqual(["evt-1", "evt-3"]);
    expect(events[0].startISO).toBe("2026-08-03T15:00:00.000Z");
    expect(events[1].startISO).toBe(new Date("2026-08-17").toISOString());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondUrl = String(fetchSpy.mock.calls[1][0]);
    expect(secondUrl).toContain("pageToken=page-2");
  });
});

// ── resolveCalendarTarget (fetch-mocked + google-credentials mocked) ──────

describe("resolveCalendarTarget", () => {
  it("returns not-connected (and never calls the Calendar API) when there is no valid access token", async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue(null);
    const fetchSpy = vi.spyOn(global, "fetch");
    const result = await resolveCalendarTarget("user-1", "Adjuncting");
    expect(result).toEqual({
      ok: false,
      reason: "not-connected",
      message: "Google Calendar isn't connected. Connect it under Account > Integrations.",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns ok with the calendar id when the named calendar is found (case/whitespace tolerant)", async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue("token-abc");
    vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          items: [{ id: "cal-1", summary: "Adjuncting", primary: false, accessRole: "owner" }],
        })
      )
    );
    const result = await resolveCalendarTarget("user-1", " adjuncting ");
    expect(result).toEqual({ ok: true, calendarId: "cal-1", calendarName: "Adjuncting" });
  });

  it("returns calendar-not-found listing the writable calendars it did find, and never falls back to primary", async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue("token-abc");
    vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          items: [
            { id: "cal-2", summary: "Work", primary: true, accessRole: "owner" },
            { id: "cal-3", summary: "Personal", primary: false, accessRole: "owner" },
          ],
        })
      )
    );
    const result = await resolveCalendarTarget("user-1", "Adjuncting");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a calendar-not-found result");
    expect(result.reason).toBe("calendar-not-found");
    expect(result.message).toContain("Adjuncting");
    expect(result.message).toContain("Work");
    expect(result.message).toContain("Personal");
    expect(result.message.toLowerCase()).not.toContain("primary");
  });
});
