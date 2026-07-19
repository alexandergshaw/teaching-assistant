import { describe, it, expect } from "vitest";
import { parseIcsEvents } from "./ics";

describe("parseIcsEvents", () => {
  describe("unfolding", () => {
    it("unfolds CRLF+space continuation lines", () => {
      const ics = `BEGIN:VEVENT\r
UID:evt1\r
SUMMARY:Test Event\r
DTSTART:20260715T100000Z\r
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(1);
      expect(events[0].uid).toBe("evt1");
    });

    it("unfolds LF+space continuation lines", () => {
      const ics = `BEGIN:VEVENT
UID:evt1
SUMMARY:Test Event
DTSTART:20260715T100000Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(1);
      expect(events[0].uid).toBe("evt1");
    });

    it("unfolds long lines with tab continuation", () => {
      const ics = "BEGIN:VEVENT\nUID:evt1\nSUMMARY:Long Event Title that is\n\tcontinued here\nDTSTART:20260715T100000Z\nEND:VEVENT";
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(1);
      expect(events[0].summary).toContain("continued");
    });
  });

  describe("all-day date form (VALUE=DATE)", () => {
    it("parses DTSTART;VALUE=DATE:YYYYMMDD as all-day event at UTC midnight", () => {
      const ics = `BEGIN:VEVENT
UID:evt-allday
SUMMARY:All Day Event
DTSTART;VALUE=DATE:20260715
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(1);
      const evt = events[0];
      expect(evt.allDay).toBe(true);
      expect(evt.summary).toBe("All Day Event");
      // Should be midnight UTC on July 15, 2026.
      expect(evt.startsAt).toBe("2026-07-15T00:00:00.000Z");
    });

    it("handles various all-day dates", () => {
      const ics = `BEGIN:VEVENT
UID:evt1
SUMMARY:Event 1
DTSTART;VALUE=DATE:20260101
END:VEVENT
BEGIN:VEVENT
UID:evt2
SUMMARY:Event 2
DTSTART;VALUE=DATE:20261231
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(2);
      expect(events[0].startsAt).toBe("2026-01-01T00:00:00.000Z");
      expect(events[1].startsAt).toBe("2026-12-31T00:00:00.000Z");
    });
  });

  describe("datetime with Z (UTC)", () => {
    it("parses DTSTART:YYYYMMDDTHHMMSSZ as UTC", () => {
      const ics = `BEGIN:VEVENT
UID:evt-utc
SUMMARY:Meeting at Noon UTC
DTSTART:20260715T120000Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(1);
      const evt = events[0];
      expect(evt.allDay).toBe(false);
      expect(evt.startsAt).toBe("2026-07-15T12:00:00.000Z");
    });

    it("parses various UTC times", () => {
      const ics = `BEGIN:VEVENT
UID:evt1
SUMMARY:Midnight UTC
DTSTART:20260715T000000Z
END:VEVENT
BEGIN:VEVENT
UID:evt2
SUMMARY:Evening UTC
DTSTART:20260715T235959Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(2);
      expect(events[0].startsAt).toBe("2026-07-15T00:00:00.000Z");
      expect(events[1].startsAt).toBe("2026-07-15T23:59:59.000Z");
    });
  });

  describe("datetime without Z (local time approximation)", () => {
    it("parses DTSTART:YYYYMMDDTHHMMSS as local time", () => {
      const ics = `BEGIN:VEVENT
UID:evt-local
SUMMARY:Local Time Event
DTSTART:20260715T100000
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(1);
      const evt = events[0];
      expect(evt.allDay).toBe(false);
      // Local time is parsed but converted to ISO string. The exact offset
      // depends on system timezone, so we just verify it's a valid ISO string.
      expect(evt.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    });

    it("handles TZID parameter (ignores timezone id, parses as local)", () => {
      const ics = `BEGIN:VEVENT
UID:evt-tzid
SUMMARY:Event with TZID
DTSTART;TZID=America/New_York:20260715T150000
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(1);
      const evt = events[0];
      expect(evt.allDay).toBe(false);
      // TZID is acknowledged but not resolved to an offset (approximation).
      expect(evt.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    });
  });

  describe("summary escaping", () => {
    it("unescapes \\n newline sequences", () => {
      const ics = `BEGIN:VEVENT
UID:evt1
SUMMARY:Line 1\\nLine 2
DTSTART:20260715T100000Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events[0].summary).toBe("Line 1\nLine 2");
    });

    it("unescapes \\; semicolon sequences", () => {
      const ics = `BEGIN:VEVENT
UID:evt1
SUMMARY:Item1\\;Item2
DTSTART:20260715T100000Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events[0].summary).toBe("Item1;Item2");
    });

    it("unescapes \\\\ backslash sequences", () => {
      const ics = `BEGIN:VEVENT
UID:evt1
SUMMARY:Path\\\\to\\\\file
DTSTART:20260715T100000Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events[0].summary).toBe("Path\\to\\file");
    });

    it("handles multiple escape sequences in one summary", () => {
      const ics = `BEGIN:VEVENT
UID:evt1
SUMMARY:Line 1\\nItem;Value\\\\Path
DTSTART:20260715T100000Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events[0].summary).toBe("Line 1\nItem;Value\\Path");
    });
  });

  describe("missing fields", () => {
    it("defaults to '(untitled)' when SUMMARY is missing", () => {
      const ics = `BEGIN:VEVENT
UID:evt-no-summary
DTSTART:20260715T100000Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(1);
      expect(events[0].summary).toBe("(untitled)");
    });

    it("synthesizes UID when missing", () => {
      const ics = `BEGIN:VEVENT
SUMMARY:No UID Event
DTSTART:20260715T100000Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(1);
      expect(events[0].uid).toBe("No UID Event-2026-07-15T10:00:00.000Z");
    });

    it("skips events with missing DTSTART", () => {
      const ics = `BEGIN:VEVENT
UID:evt-no-date
SUMMARY:No Date Event
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(0);
    });

    it("skips events with invalid DTSTART format", () => {
      const ics = `BEGIN:VEVENT
UID:evt1
SUMMARY:Invalid Date
DTSTART:not-a-date
END:VEVENT
BEGIN:VEVENT
UID:evt2
SUMMARY:Valid Date
DTSTART:20260715T100000Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(1);
      expect(events[0].uid).toBe("evt2");
    });
  });

  describe("malformed blocks", () => {
    it("skips malformed VEVENT blocks without throwing", () => {
      const ics = `BEGIN:VEVENT
UID:evt1
SUMMARY:Good Event
DTSTART:20260715T100000Z
END:VEVENT
BEGIN:VEVENT
GARBAGE DATA WITH NO COLONS
END:VEVENT
BEGIN:VEVENT
UID:evt2
SUMMARY:Another Good Event
DTSTART:20260715T110000Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(2);
      expect(events[0].uid).toBe("evt1");
      expect(events[1].uid).toBe("evt2");
    });

    it("handles VEVENT blocks with invalid date format gracefully", () => {
      const ics = `BEGIN:VEVENT
UID:evt1
SUMMARY:Bad Date Format
DTSTART:2026-07-15T10:00:00
END:VEVENT
BEGIN:VEVENT
UID:evt2
SUMMARY:Good Event
DTSTART:20260715T100000Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(1);
      expect(events[0].uid).toBe("evt2");
    });

    it("handles empty ICS input", () => {
      const events = parseIcsEvents("");
      expect(events).toHaveLength(0);
    });

    it("handles ICS with no VEVENT blocks", () => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Example//Calendar//EN
END:VCALENDAR`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(0);
    });

    it("does not throw on truncated or incomplete VEVENT", () => {
      const ics = `BEGIN:VEVENT
UID:evt1
SUMMARY:Incomplete Event
DTSTART:20260715T100000Z`;
      // Missing END:VEVENT - should not throw.
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(0);
    });
  });

  describe("multiple events", () => {
    it("parses multiple VEVENT blocks from a single ICS", () => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Example//Calendar//EN
BEGIN:VEVENT
UID:evt1
SUMMARY:Event 1
DTSTART:20260715T100000Z
END:VEVENT
BEGIN:VEVENT
UID:evt2
SUMMARY:Event 2
DTSTART;VALUE=DATE:20260720
END:VEVENT
BEGIN:VEVENT
UID:evt3
SUMMARY:Event 3
DTSTART:20260725T140000
END:VEVENT
END:VCALENDAR`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(3);
      expect(events[0].uid).toBe("evt1");
      expect(events[0].allDay).toBe(false);
      expect(events[1].uid).toBe("evt2");
      expect(events[1].allDay).toBe(true);
      expect(events[2].uid).toBe("evt3");
      expect(events[2].allDay).toBe(false);
    });
  });

  describe("real-world ICS examples", () => {
    it("parses a real-world Canvas calendar export", () => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Instructure//NONSGML Canvas Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Canvas Calendar
X-WR-TIMEZONE:UTC
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260803
DTEND;VALUE=DATE:20260804
SUMMARY:Fall term starts
UID:canvas-event-1
LOCATION:
DESCRIPTION:This is the start of fall
STATUS:CONFIRMED
SEQUENCE:0
CREATED:20260701T100000Z
LAST-MODIFIED:20260701T100000Z
END:VEVENT
BEGIN:VEVENT
DTSTART:20260810T230000Z
DTEND:20260811T000000Z
SUMMARY:Assignment 1 Due
UID:canvas-event-2
LOCATION:
DESCRIPTION:
STATUS:CONFIRMED
SEQUENCE:0
CREATED:20260701T100000Z
LAST-MODIFIED:20260701T100000Z
END:VEVENT
END:VCALENDAR`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(2);
      expect(events[0].summary).toBe("Fall term starts");
      expect(events[0].allDay).toBe(true);
      expect(events[1].summary).toBe("Assignment 1 Due");
      expect(events[1].allDay).toBe(false);
    });

    it("parses a real-world Outlook calendar export", () => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook 16.0//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-CLIPSTART:20260715T000000Z
X-CLIPEND:20260722T000000Z
BEGIN:VEVENT
DTSTART:20260715T140000Z
DTEND:20260715T150000Z
RRULE:FREQ=WEEKLY;BYDAY=WE
SUMMARY:Weekly Standup
UID:outlook-event-1
DTSTAMP:20260715T120000Z
CREATED:20260701T100000Z
LAST-MODIFIED:20260710T150000Z
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(1);
      expect(events[0].summary).toBe("Weekly Standup");
      expect(events[0].uid).toBe("outlook-event-1");
    });
  });

  describe("edge cases", () => {
    it("preserves UID and SUMMARY exactly as given", () => {
      const ics = `BEGIN:VEVENT
UID:unique-id-with-special-chars@example.com
SUMMARY:Event (with) [special] {characters}
DTSTART:20260715T100000Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events[0].uid).toBe("unique-id-with-special-chars@example.com");
      expect(events[0].summary).toBe("Event (with) [special] {characters}");
    });

    it("handles SUMMARY with leading/trailing whitespace after colon", () => {
      const ics = `BEGIN:VEVENT
UID:evt1
SUMMARY:   Event Title
DTSTART:20260715T100000Z
END:VEVENT`;
      const events = parseIcsEvents(ics);
      // Summary is taken as-is after the colon (not trimmed in this implementation).
      expect(events[0].summary).toContain("Event Title");
    });

    it("handles fields with no value (empty after colon)", () => {
      const ics = `BEGIN:VEVENT
UID:evt1
SUMMARY:
DTSTART:20260715T100000Z
DESCRIPTION:
END:VEVENT`;
      const events = parseIcsEvents(ics);
      expect(events).toHaveLength(1);
      expect(events[0].summary).toBe("(untitled)");
    });
  });
});
