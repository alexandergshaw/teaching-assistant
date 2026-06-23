// Availability math: turn the owner's busy intervals into a short list of open
// meeting slots inside their configured working hours. Pure and timezone-aware
// (slots are reckoned in the configured IANA zone via Intl, so they stay correct
// across DST), which keeps it easy to unit-test without any network calls.

import type { BusyInterval } from "./google-calendar";

export interface SchedulingConfig {
  timeZone: string;
  workStartHour: number; // inclusive, local wall-clock hour (0-23)
  workEndHour: number; // exclusive end of the working window
  slotMinutes: number;
  bufferMinutes: number; // gap kept clear before and after each existing event
  lookaheadDays: number; // how many calendar days ahead to scan
  maxSlots: number; // cap on how many options to offer
}

const DEFAULTS: SchedulingConfig = {
  timeZone: "America/Chicago",
  workStartHour: 8,
  workEndHour: 18,
  slotMinutes: 30,
  bufferMinutes: 15,
  lookaheadDays: 10,
  maxSlots: 6,
};

function intFromEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

/** Resolve the scheduling configuration from env vars, falling back to defaults. */
export function getSchedulingConfig(): SchedulingConfig {
  return {
    timeZone: process.env.SCHEDULING_TIMEZONE?.trim() || DEFAULTS.timeZone,
    workStartHour: intFromEnv(process.env.SCHEDULING_WORK_START, DEFAULTS.workStartHour, 0, 23),
    workEndHour: intFromEnv(process.env.SCHEDULING_WORK_END, DEFAULTS.workEndHour, 1, 24),
    slotMinutes: intFromEnv(process.env.SCHEDULING_SLOT_MINUTES, DEFAULTS.slotMinutes, 5, 240),
    bufferMinutes: intFromEnv(process.env.SCHEDULING_BUFFER_MINUTES, DEFAULTS.bufferMinutes, 0, 120),
    lookaheadDays: intFromEnv(process.env.SCHEDULING_LOOKAHEAD_DAYS, DEFAULTS.lookaheadDays, 1, 60),
    maxSlots: intFromEnv(process.env.SCHEDULING_MAX_SLOTS, DEFAULTS.maxSlots, 1, 20),
  };
}

// The wall-clock parts of an instant as seen in a given IANA time zone.
interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  // Intl can emit "24" for midnight in some engines; normalize to 0.
  const hour = Number(map.hour) % 24;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

// Milliseconds the zone is ahead of UTC at the given instant.
function tzOffsetMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - date.getTime();
}

// The UTC instant for a wall-clock time in the given zone. One offset correction
// is accurate for all times except the ~1hr/yr DST-gap edge, which never falls
// inside normal working hours.
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const naiveUTC = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = tzOffsetMs(new Date(naiveUTC), timeZone);
  return new Date(naiveUTC - offset);
}

// Day of week (0=Sun..6=Sat) for a calendar date.
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Compute open slot start times (as ISO UTC strings) within the working window,
 * skipping weekends, anything in the past or sooner than one buffer from now, and
 * any slot that overlaps a busy interval (busy intervals are padded by the
 * buffer on both sides).
 */
export function computeFreeSlots(
  busy: BusyInterval[],
  config: SchedulingConfig,
  now: Date
): string[] {
  const bufferMs = config.bufferMinutes * 60_000;
  const slotMs = config.slotMinutes * 60_000;
  const earliestStart = now.getTime() + bufferMs;
  const slots: string[] = [];

  for (let dayOffset = 0; dayOffset <= config.lookaheadDays; dayOffset++) {
    const dayInstant = new Date(now.getTime() + dayOffset * 86_400_000);
    const { year, month, day } = getZonedParts(dayInstant, config.timeZone);
    const weekday = weekdayOf(year, month, day);
    if (weekday === 0 || weekday === 6) continue; // skip Sun/Sat

    for (
      let minutes = config.workStartHour * 60;
      minutes + config.slotMinutes <= config.workEndHour * 60;
      minutes += config.slotMinutes
    ) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const start = zonedTimeToUtc(year, month, day, hour, minute, config.timeZone);
      const startMs = start.getTime();
      const endMs = startMs + slotMs;

      if (startMs < earliestStart) continue;

      const conflicts = busy.some(
        (b) => startMs < b.end.getTime() + bufferMs && endMs + bufferMs > b.start.getTime()
      );
      if (conflicts) continue;

      slots.push(start.toISOString());
      if (slots.length >= config.maxSlots) return slots;
    }
  }

  return slots;
}

/**
 * Render slot start times for a human-readable reply, e.g.
 * "Tuesday, June 24 at 9:00 AM CDT".
 */
export function formatSlotsForReply(slotsISO: string[], timeZone: string): string[] {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return slotsISO.map((iso) => {
    const parts = formatter.formatToParts(new Date(iso));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const weekday = get("weekday");
    const month = get("month");
    const day = get("day");
    const hour = get("hour");
    const minute = get("minute");
    const dayPeriod = get("dayPeriod");
    const zone = get("timeZoneName");
    return `${weekday}, ${month} ${day} at ${hour}:${minute} ${dayPeriod} ${zone}`;
  });
}
