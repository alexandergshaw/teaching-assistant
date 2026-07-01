/**
 * Deterministic academic-calendar / syllabus parser for the Embedded
 * Deterministic Engine. It scans the text for dated lines (ISO, US numeric, and
 * month-name dates), uses the rest of the line as the event title, and classifies
 * the type from keywords. No model call; identical text yields identical events.
 *
 * It handles the common case of a line or table row that pairs a date with a
 * label; free-form prose where the date and its subject are far apart is out of
 * reach and is simply skipped.
 */

import type {
  CalendarEventType,
  ParsedCalendarEvent,
  ParsedCalendarResult,
} from "@/lib/calendar-events";

export interface CalendarParseOptions {
  schoolHint?: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_ALT = Object.keys(MONTHS).join("|");

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The first 20xx year mentioned anywhere, used when a date omits its year. */
function defaultYear(text: string): number | null {
  const m = /\b(20\d{2})\b/.exec(text);
  return m ? Number(m[1]) : null;
}

interface DateHit {
  date: string;
  /** Last day of a range (inclusive), present only when the line states one. */
  endDate?: string;
  start: number;
  end: number;
}

// Separators accepted between the two ends of a date range.
const RANGE_SEP = "\\s*(?:-|\\u2013|\\u2014|to|through)\\s*";

/** Add one year to an ISO date (for ranges that wrap the year, Dec 20 - Jan 5). */
function bumpYear(iso: string): string {
  return `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`;
}

/**
 * Find the first date or date range in a line, returning ISO value(s) and the
 * character span. Range patterns are matched alongside single-date patterns; at
 * the same position the longer (range) match wins, so "Mar 9-13" becomes one
 * ranged event rather than a single date with "-13" left in the title.
 */
function findDate(line: string, fallbackYear: number | null): DateHit | null {
  type Candidate = { re: RegExp; build: (m: RegExpExecArray) => { date: string | null; endDate?: string | null } };

  const candidates: Candidate[] = [
    // ISO range: 2026-10-10 to 2026-10-14.
    {
      re: new RegExp(`\\b(\\d{4})-(\\d{1,2})-(\\d{1,2})${RANGE_SEP}(\\d{4})-(\\d{1,2})-(\\d{1,2})\\b`, "i"),
      build: (m) => ({ date: isoDate(+m[1], +m[2], +m[3]), endDate: isoDate(+m[4], +m[5], +m[6]) }),
    },
    // Cross-month range: Nov 25 - Nov 27 / Dec 20 to Jan 5.
    {
      re: new RegExp(
        `\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?${RANGE_SEP}(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`,
        "i"
      ),
      build: (m) => {
        const year = m[5] ? +m[5] : fallbackYear ?? NaN;
        return {
          date: isoDate(year, MONTHS[m[1].toLowerCase()], +m[2]),
          endDate: isoDate(year, MONTHS[m[3].toLowerCase()], +m[4]),
        };
      },
    },
    // Same-month range: Mar 9-13.
    {
      re: new RegExp(
        `\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?${RANGE_SEP}(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`,
        "i"
      ),
      build: (m) => {
        const year = m[4] ? +m[4] : fallbackYear ?? NaN;
        const month = MONTHS[m[1].toLowerCase()];
        return { date: isoDate(year, month, +m[2]), endDate: isoDate(year, month, +m[3]) };
      },
    },
    // Numeric range: 10/10 - 10/14.
    {
      re: new RegExp(`\\b(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?${RANGE_SEP}(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?\\b`, "i"),
      build: (m) => {
        const year1 = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : fallbackYear ?? NaN;
        const year2 = m[6] ? (m[6].length === 2 ? 2000 + +m[6] : +m[6]) : year1;
        return { date: isoDate(year1, +m[1], +m[2]), endDate: isoDate(year2, +m[4], +m[5]) };
      },
    },
    // Single dates.
    { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, build: (m) => ({ date: isoDate(+m[1], +m[2], +m[3]) }) },
    {
      re: new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, "i"),
      build: (m) => ({ date: isoDate(m[3] ? +m[3] : fallbackYear ?? NaN, MONTHS[m[1].toLowerCase()], +m[2]) }),
    },
    {
      re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?(?:,?\\s*(\\d{4}))?\\b`, "i"),
      build: (m) => ({ date: isoDate(m[3] ? +m[3] : fallbackYear ?? NaN, MONTHS[m[2].toLowerCase()], +m[1]) }),
    },
    {
      re: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/,
      build: (m) => {
        const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : fallbackYear ?? NaN;
        return { date: isoDate(year, +m[1], +m[2]) };
      },
    },
  ];

  let best: DateHit | null = null;
  for (const { re, build } of candidates) {
    const m = re.exec(line);
    if (!m || m.index === undefined) continue;
    const built = build(m);
    if (!built.date) continue;
    let endDate = built.endDate ?? undefined;
    if (endDate && endDate < built.date) {
      // A wrap like "Dec 20 - Jan 5" with one inferred year spans into the next.
      endDate = bumpYear(endDate);
    }
    if (endDate === built.date) endDate = undefined;
    const hit: DateHit = {
      date: built.date,
      ...(endDate ? { endDate } : {}),
      start: m.index,
      end: m.index + m[0].length,
    };
    // Earliest position wins; at the same position the longer (range) match wins.
    if (!best || hit.start < best.start || (hit.start === best.start && hit.end > best.end)) {
      best = hit;
    }
  }
  return best;
}

const TYPE_RULES: Array<{ re: RegExp; type: CalendarEventType }> = [
  { re: /\bfinals?\s*week\b|\bexam\s*week\b/i, type: "finals_week" },
  { re: /\b(?:midterm|final\s*exam|exam|test)\b/i, type: "exam" },
  { re: /\bquiz(?:zes)?\b/i, type: "quiz" },
  { re: /\b(?:homework|assignment|problem\s*set|pset|project|paper|lab|essay)\b/i, type: "assignment" },
  { re: /\b(?:review\s*session|recitation|review)\b/i, type: "review_session" },
  { re: /\b(?:classes\s*begin|first\s*day|term\s*start|semester\s*start)\b/i, type: "term_start" },
  { re: /\b(?:classes\s*end|last\s*day|term\s*end|semester\s*end)\b/i, type: "term_end" },
  // Named holidays win over the generic "no class" / break signal, since a line
  // like "Labor Day holiday, no class" is a holiday, not a multi-day break.
  { re: /\b(?:holiday|thanksgiving|memorial\s*day|labor\s*day|observed)\b/i, type: "holiday" },
  { re: /\b(?:break|recess|reading\s*week|no\s*class(?:es)?)\b/i, type: "break" },
  { re: /\b(?:lecture|topic)\b/i, type: "lecture" },
];

function classify(title: string): CalendarEventType {
  for (const { re, type } of TYPE_RULES) {
    if (re.test(title)) return type;
  }
  return "other";
}

function cleanTitle(line: string, hit: DateHit): string {
  const withoutDate = (line.slice(0, hit.start) + " " + line.slice(hit.end)).trim();
  return withoutDate
    .replace(/^[\s\-–—:.|\t]+/, "")
    .replace(/[\s\-–—:.|\t]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function labeledValue(text: string, label: RegExp): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const m = label.exec(line.trim());
    if (m && m[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

/** Parse structured calendar events from raw syllabus / calendar text. */
export function parseCalendarEmbedded(text: string, options: CalendarParseOptions = {}): ParsedCalendarResult {
  if (!text.trim()) return { events: [] };

  const fallbackYear = defaultYear(text);
  const events: ParsedCalendarEvent[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const hit = findDate(line, fallbackYear);
    if (!hit) continue;
    const title = cleanTitle(line, hit);
    if (!title) continue;
    const type = classify(title);
    const key = `${type}|${hit.date}|${hit.endDate ?? ""}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({
      title: title.slice(0, 200),
      date: hit.date,
      ...(hit.endDate ? { endDate: hit.endDate } : {}),
      type,
    });
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    school: labeledValue(text, /^(?:school|university|institution)\s*[:\-]\s*(.+)$/i) ?? options.schoolHint,
    courseName: labeledValue(text, /^course(?:\s*(?:name|title))?\s*[:\-]\s*(.+)$/i),
    term: labeledValue(text, /^(?:term|semester|quarter)\s*[:\-]\s*(.+)$/i),
    events,
  };
}
