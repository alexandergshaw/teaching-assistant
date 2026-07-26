// Pure helpers for the assignment-due-rule scalar column. This is a
// RECURRING rule (a weekday + a time), not per-week dates and not an offset
// - settled by the user, not to be redesigned. Stored as ONE encoded string
// ("sun|23:59") so it round-trips through the existing scalar column/patch
// machinery (course.assignmentDueRule) exactly like topicOutline or
// syllabusTemplateId. Nothing here computes an actual per-week deadline date
// - that is weekDeadline's job (a deliberately separate, later wave); this
// file only encodes, decodes, and describes the rule itself. No Date-of-now,
// no randomness - fully deterministic and safe on client or server.

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
