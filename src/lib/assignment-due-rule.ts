// Pure helpers for the assignment-due-rule scalar column. This is a
// RECURRING rule (a weekday + a time), not per-week dates and not an offset
// - settled by the user, not to be redesigned. Stored as ONE encoded string
// ("sun|23:59") so it round-trips through the existing scalar column/patch
// machinery (course.assignmentDueRule) exactly like topicOutline or
// syllabusTemplateId. Encoding/decoding/describing the rule itself is fully
// deterministic and safe on client or server (no Date-of-now, no
// randomness); dueDateForWeek below is the single bridge from a rule to an
// actual per-week deadline date. weekDeadline (src/lib/workflows/
// registry-helpers.ts) delegates to it, defaulting to the Sunday 23:59 rule
// so callers that pass no rule keep the historical behavior; its three
// callers now pass each course's own rule through.

export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export const WEEKDAYS: readonly Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

export interface AssignmentDueRule {
  day: Weekday;
  /** 24-hour "HH:MM", always zero-padded (e.g. "09:05", "23:59"). */
  time: string;
}

const WEEKDAY_SET: ReadonlySet<string> = new Set(WEEKDAYS);

// Exactly 1-2 digit hour (single-digit hours like "9:05" are the only
// formatting slack accepted) and exactly 2-digit minute; range-checked below.
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/** "9:05" -> "09:05"; rejects an out-of-range or malformed time. */
function normalizeTime(raw: string): string | null {
  const match = TIME_PATTERN.exec(raw.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** "sun|23:59" -> { day: "sun", time: "23:59" }. Returns null for
 * blank/malformed input - never throws. */
export function parseAssignmentDueRule(raw: string | null | undefined): AssignmentDueRule | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  const sep = trimmed.indexOf("|");
  if (sep === -1) return null;

  const dayPart = trimmed.slice(0, sep).trim().toLowerCase();
  if (!WEEKDAY_SET.has(dayPart)) return null;

  const time = normalizeTime(trimmed.slice(sep + 1));
  if (time === null) return null;

  return { day: dayPart as Weekday, time };
}

/** Inverse. Returns "" for an invalid day or time. */
export function formatAssignmentDueRule(day: Weekday, time: string): string {
  if (!WEEKDAY_SET.has(day)) return "";
  const normalized = normalizeTime(time);
  if (normalized === null) return "";
  return `${day}|${normalized}`;
}

/** hour/minute here are already range-checked - time always comes from
 * parseAssignmentDueRule's normalized "HH:MM". */
function formatClockTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour24 = Number(hourStr);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12raw = hour24 % 12;
  const hour12 = hour12raw === 0 ? 12 : hour12raw;
  return `${hour12}:${minuteStr} ${period}`;
}

/** Human display for the cell + summaries, e.g. "Sundays at 11:59 PM".
 * Returns "" when the rule is absent/invalid. */
export function describeAssignmentDueRule(raw: string | null | undefined): string {
  const parsed = parseAssignmentDueRule(raw);
  if (!parsed) return "";
  return `${WEEKDAY_LABELS[parsed.day]}s at ${formatClockTime(parsed.time)}`;
}

// Offset (in days) from the Monday that begins a Monday-anchored week to the
// rule's weekday - sun ends the week it began (Monday-anchored), so it is 6
// days after that Monday, not 0.
const WEEKDAY_MONDAY_OFFSET: Record<Weekday, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/** The concrete deadline instant for week N under a recurring rule. `start`
 * anchors the term the same way weekDeadline (src/lib/workflows/registry-helpers.ts)
 * does: week 1 is the week containing `start`, weeks are Monday-anchored.
 * `dueDateForWeek(start, n, { day: "sun", time: "23:59" })` is guaranteed to
 * equal `weekDeadline(start, n)` for every n and every start weekday - that
 * equivalence is what lets the rule be adopted without silently changing any
 * existing course's deadlines (see assignment-due-rule.test.ts).
 *
 * `week` values below 1 clamp to week 1 - there is no "week 0" or negative
 * week to compute a real deadline for, and clamping (rather than
 * extrapolating backward past the term's start) keeps the result inside the
 * term.
 *
 * Pure: no Date.now(), no randomness. */
export function dueDateForWeek(start: Date, week: number, rule: AssignmentDueRule): Date {
  const effectiveWeek = week < 1 ? 1 : week;

  // Step 1: the Monday of start's week - copied verbatim from weekDeadline.
  const monday0 = new Date(start);
  const day = monday0.getDay();
  monday0.setDate(monday0.getDate() + (day === 0 ? -6 : 1 - day));

  // Step 2: the Monday that begins week `effectiveWeek`.
  const weekStart = new Date(monday0);
  weekStart.setDate(monday0.getDate() + (effectiveWeek - 1) * 7);

  // Step 3: offset onto the rule's weekday.
  const due = new Date(weekStart);
  due.setDate(weekStart.getDate() + WEEKDAY_MONDAY_OFFSET[rule.day]);

  // Step 4: the rule's time, in local time - seconds/ms zeroed, matching
  // weekDeadline's setHours call.
  const [hourStr, minuteStr] = rule.time.split(":");
  due.setHours(Number(hourStr), Number(minuteStr), 0, 0);

  return due;
}
