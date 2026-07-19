// ICS calendar event parser. Tolerant parsing: malformed blocks are skipped
// without throwing. Unfolds long lines (per RFC 5545 3.4: continuation lines
// begin with space or tab), extracts VEVENT blocks, and parses event fields
// (uid, summary, dtstart). Dates use ISO 8601 string format; local times are
// parsed as an approximation (see dtstart comment below).

export interface IcsEvent {
  uid: string;
  summary: string;
  startsAt: string;
  allDay: boolean;
}

/**
 * Parse ICS (iCalendar) text and extract events.
 *
 * Unfolds continuation lines, scans BEGIN:VEVENT..END:VEVENT blocks, and
 * extracts uid, summary, and dtstart. Malformed blocks are skipped without
 * throwing.
 *
 * - DTSTART;VALUE=DATE:YYYYMMDD sets allDay=true, startsAt to UTC midnight.
 * - DTSTART[;TZID=...]:YYYYMMDDTHHMMSS[Z] with Z suffix is UTC; without Z,
 *   parsed as local time (new Date(y,m,d,h,m,s)) - this is an approximation
 *   that does not account for timezone offsets and assumes the local system
 *   timezone. A TZID parameter is noted but not resolved to an offset.
 * - SUMMARY unescapes \\, \, \; and \n.
 * - Missing summary defaults to "(untitled)".
 * - Missing or invalid dtstart causes the event to be skipped.
 */
export function parseIcsEvents(icsText: string): IcsEvent[] {
  // Unfold lines: continuation lines (starting with space or tab) are joined
  // to the previous line.
  const unfolded = unfoldLines(icsText);

  const events: IcsEvent[] = [];
  const lines = unfolded.split(/\r?\n/);

  let inEvent = false;
  let eventLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      eventLines = [];
      continue;
    }

    if (trimmed === "END:VEVENT") {
      if (inEvent) {
        const event = parseEvent(eventLines);
        if (event) {
          events.push(event);
        }
      }
      inEvent = false;
      eventLines.length = 0;
      continue;
    }

    if (inEvent) {
      eventLines.push(line);
    }
  }

  return events;
}

// Unfold continuation lines (RFC 5545 3.4): lines starting with space or tab
// are folded from the previous line.
function unfoldLines(text: string): string {
  // Replace CRLF with LF first, then handle folding.
  let result = text.replace(/\r\n/g, "\n");

  // Continuation line: preceded by LF and starts with space or tab.
  result = result.replace(/\n([ \t])/g, "$1");

  return result;
}

// Parse a single VEVENT block (list of field lines).
function parseEvent(lines: string[]): IcsEvent | null {
  let uid = "";
  let summary = "(untitled)";
  let dtstart: string | null = null;
  let allDay = false;

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const field = line.substring(0, colonIdx);
    const value = line.substring(colonIdx + 1);

    if (field.startsWith("UID")) {
      uid = value.trim();
    } else if (field.startsWith("SUMMARY")) {
      const unescaped = unescapeIcsString(value);
      if (unescaped.trim()) {
        summary = unescaped;
      }
    } else if (field.startsWith("DTSTART")) {
      // Parse DTSTART field. Format can be:
      // - DTSTART;VALUE=DATE:YYYYMMDD (all-day)
      // - DTSTART:YYYYMMDDTHHMMSS (local time, no Z)
      // - DTSTART:YYYYMMDDTHHMMSSZ (UTC)
      // - DTSTART;TZID=...:YYYYMMDDTHHMMSS (local time with timezone id)
      const parsed = parseDtstart(field, value);
      if (parsed) {
        dtstart = parsed.startsAt;
        allDay = parsed.allDay;
      }
    }
  }

  // Skip events without dtstart.
  if (!dtstart) {
    return null;
  }

  // Synthesize a stable UID if missing (summary + startsAt).
  if (!uid) {
    uid = `${summary}-${dtstart}`;
  }

  return {
    uid,
    summary,
    startsAt: dtstart,
    allDay,
  };
}

// Parse DTSTART field. Returns { startsAt, allDay } or null if invalid.
function parseDtstart(field: string, value: string): { startsAt: string; allDay: boolean } | null {
  // Check for VALUE=DATE format (all-day event).
  if (field.includes("VALUE=DATE")) {
    const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})$/);
    if (match) {
      const [, year, month, day] = match;
      const y = parseInt(year, 10);
      const m = parseInt(month, 10);
      const d = parseInt(day, 10);

      // Construct ISO 8601 date at UTC midnight.
      const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      return {
        startsAt: date.toISOString(),
        allDay: true,
      };
    }
    return null;
  }

  // Otherwise, parse YYYYMMDDTHHMMSS[Z] format.
  const datetimeMatch = value.trim().match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!datetimeMatch) {
    return null;
  }

  const [, year, month, day, hour, minute, second, isUtc] = datetimeMatch;
  const y = parseInt(year, 10);
  const mo = parseInt(month, 10);
  const d = parseInt(day, 10);
  const h = parseInt(hour, 10);
  const mi = parseInt(minute, 10);
  const s = parseInt(second, 10);

  if (isUtc === "Z") {
    // UTC time: use Date.UTC().toISOString().
    const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s, 0));
    return {
      startsAt: date.toISOString(),
      allDay: false,
    };
  } else {
    // Local time: construct as new Date(y, mo-1, d, h, mi, s).
    // This is an approximation: it does NOT apply timezone offsets and
    // assumes the local system timezone. The result is converted to ISO
    // string (which reflects the local time as if in the UTC timezone,
    // then offset back to UTC equivalent).
    const date = new Date(y, mo - 1, d, h, mi, s, 0);
    return {
      startsAt: date.toISOString(),
      allDay: false,
    };
  }
}

// Unescape ICS string values. Handles \\, \;, \, and \n escapes per RFC 5545.
function unescapeIcsString(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c) =>
    c === 'n' || c === 'N' ? '\n' : c
  );
}
