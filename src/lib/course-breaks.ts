// Pure helpers for the course_hub.breaks column. The column stays a plain
// free-text string - other consumers (course-facts.ts's renderCourseFacts,
// which feeds generated-artifact prompts; course-calendar-events.ts, which
// notes breaks are recorded but deliberately not applied to calendar events)
// read it as a string, and existing courses hold arbitrary prose typed by
// hand. This module does not change that; it defines a CANONICAL line format
// BreaksCell.tsx's date-range builder writes, plus a LENIENT parser so a
// course whose breaks were typed as prose before this existed still loads,
// still displays, and can still be edited without silently losing anything.
//
// Canonical format, one break per line:
//   "YYYY-MM-DD..YYYY-MM-DD" or "YYYY-MM-DD..YYYY-MM-DD | Label"
// ".." separates start/end (distinct from the "-" inside an ISO date, so it
// can never be confused with one), and " | " introduces an optional
// free-text label - the same pipe-delimited-list convention this codebase
// already uses for integrations/roster/studentRepos (courses-tab-helpers.ts).
//
// Parsing is ALL-OR-NOTHING for the whole stored value: every non-blank line
// must match the canonical pattern (and satisfy start <= end) for the value
// to be treated as structured; a single line that doesn't match - free prose
// typed by hand, e.g. "Week 8 - Spring Break" - falls the WHOLE value back to
// raw-text mode (parseCourseBreaks returns null). A partial parse (keep the
// lines that happen to match, silently drop the ones that don't) would risk
// quietly discarding a break the instructor is relying on; all-or-nothing
// never does that. BreaksCell.tsx uses the null/non-null distinction to
// decide whether to show the structured date-range builder or fall back to a
// plain textarea seeded with the untouched raw text.
//
// No I/O, no Date.now() calls - safe on client or server, fully
// unit-testable.

export interface CourseBreakRange {
  /** "YYYY-MM-DD" */
  start: string;
  /** "YYYY-MM-DD", always >= start for a range returned by parseCourseBreaks. */
  end: string;
  /** Optional free-text label, e.g. "Thanksgiving". "" when unset. */
  label: string;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LINE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})(?:\s*\|\s*(.*))?$/;

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  // Date normalizes an out-of-range day/month (e.g. Feb 30 -> Mar 2) rather
  // than throwing, so a genuinely invalid calendar date is caught by
  // checking the round-trip, not by range-checking month/day up front.
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/** Validates a "YYYY-MM-DD" calendar date (the shape a native
 * `<input type="date">` produces). Returns the string unchanged on success,
 * null otherwise. Duplicated (not imported) from grades-due.ts, matching
 * this codebase's convention of each deadline-shaped module owning its own
 * copy of small date validators. */
export function coerceCalendarDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const match = DATE_PATTERN.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCalendarDate(year, month, day)) return null;
  return trimmed;
}

function parseLine(line: string): CourseBreakRange | null {
  const match = LINE_PATTERN.exec(line.trim());
  if (!match) return null;
  const start = coerceCalendarDate(match[1]);
  const end = coerceCalendarDate(match[2]);
  if (!start || !end) return null;
  if (end < start) return null;
  return { start, end, label: (match[3] ?? "").trim() };
}

/**
 * Lenient, ALL-OR-NOTHING parse of a stored breaks string into structured
 * ranges - see the module comment. "" / null / undefined -> [] (no breaks -
 * a genuinely empty course has nothing to fall back to raw text for, so this
 * is "structured" too, not a parse failure). Any non-blank line that fails
 * to parse -> null (the WHOLE value is treated as unstructured free text).
 */
export function parseCourseBreaks(raw: string | null | undefined): CourseBreakRange[] | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return [];
  const lines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const out: CourseBreakRange[] = [];
  for (const line of lines) {
    const range = parseLine(line);
    if (!range) return null;
    out.push(range);
  }
  return out;
}

/** Inverse of parseCourseBreaks: serializes structured ranges back to the
 * canonical stored string, one per line. [] -> "". */
export function serializeCourseBreaks(ranges: CourseBreakRange[]): string {
  return ranges
    .map((r) => {
      const label = r.label.trim();
      return label ? `${r.start}..${r.end} | ${label}` : `${r.start}..${r.end}`;
    })
    .join("\n");
}

export interface CourseBreakValidationIssue {
  /** 1-based index of the offending range, for a human-readable "Break N ..." message. */
  index: number;
  message: string;
}

/**
 * Validates a draft list of break ranges (AC-B3):
 *  - end must not precede start (equal is fine - a single-day break);
 *  - each break must fall within [termStart, termEnd] when both are set,
 *    inclusive - a break landing exactly on the term boundary is fine;
 *  - no two breaks may overlap - touching at a shared boundary day (one
 *    break's end equals another's start) counts as overlapping, since that
 *    calendar day cannot belong to two different breaks at once.
 * Returns [] when every range is valid. Skips the term-boundary check
 * entirely when termStart or termEnd is null/absent (AC-B3: "when both are
 * set"). An inverted range (end < start) is reported once and excluded from
 * the term/overlap checks below it, since "does this nonsensical range fall
 * within the term" has no useful answer.
 */
export function validateCourseBreaks(
  ranges: CourseBreakRange[],
  termStart: string | null | undefined,
  termEnd: string | null | undefined
): CourseBreakValidationIssue[] {
  const issues: CourseBreakValidationIssue[] = [];
  const invalid = new Set<number>();

  ranges.forEach((r, i) => {
    if (r.end < r.start) {
      issues.push({ index: i + 1, message: `Break ${i + 1} ends before it starts.` });
      invalid.add(i);
      return;
    }
    // "when both are set" (AC-B3): a course with only one of startDate/endDate
    // set has no complete term window to check against, so the check is
    // skipped entirely rather than checking whichever single side happens to
    // be present.
    if (termStart && termEnd && (r.start < termStart || r.end > termEnd)) {
      issues.push({ index: i + 1, message: `Break ${i + 1} falls outside the term.` });
    }
  });

  for (let i = 0; i < ranges.length; i++) {
    if (invalid.has(i)) continue;
    for (let j = i + 1; j < ranges.length; j++) {
      if (invalid.has(j)) continue;
      const a = ranges[i];
      const b = ranges[j];
      if (a.start <= b.end && b.start <= a.end) {
        issues.push({ index: j + 1, message: `Break ${j + 1} overlaps break ${i + 1}.` });
      }
    }
  }

  return issues;
}

function formatDisplayDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Compact, human-readable summary for the cell's collapsed (non-editing)
 * view, e.g. "Nov 27 - Nov 29 (Thanksgiving); Mar 9 - Mar 13", joined with
 * "; ". Falls back to the raw text unchanged when it does not parse as
 * structured ranges (see parseCourseBreaks) - the collapsed view must never
 * hide legacy free text just because it isn't in the new format. "" for
 * "" / null / undefined.
 */
export function describeCourseBreaks(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return "";
  const parsed = parseCourseBreaks(trimmed);
  if (parsed === null) return trimmed;
  return parsed
    .map((r) => {
      const range =
        r.start === r.end ? formatDisplayDate(r.start) : `${formatDisplayDate(r.start)} - ${formatDisplayDate(r.end)}`;
      return r.label ? `${range} (${r.label})` : range;
    })
    .join("; ");
}
