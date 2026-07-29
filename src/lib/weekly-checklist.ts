// Pure domain model + defensive coercion for the course_hub.weekly_checklist
// jsonb column: an ordered list of recurring weekly checklist items. Each
// item carries a stable id, a label, an optional weekly deadline (a day of
// week + optional time - NOT a date, since a weekly deadline recurs every
// week rather than falling on one calendar date), and a checked flag.
//
// Checked state is PERSISTENT, not auto-reset week to week. An item ticked
// off stays ticked off until either the instructor unchecks it by hand or
// runs resetAllWeeklyChecklistChecks (the cell's explicit "Reset all"
// action) - there is no implicit clearing anywhere in this module. That is
// also why nothing here depends on the course's current week
// (src/lib/week-numbering.ts's currentCourseWeek): checked state does not
// compare against "which course-week is it", and overdue only needs to know
// what day THIS CALENDAR WEEK it is - see weeklyOccurrenceInstant.
//
// No I/O, no Date.now()/crypto.randomUUID() calls except where `now`/`id`
// are supplied by the caller - safe on client or server, fully
// unit-testable.

/**
 * A recurring weekly deadline: a day of the week plus an optional clock
 * time. weekday uses 0=Sunday..6=Saturday, matching the days_of_week
 * convention already used by workflow_schedules (see
 * supabase/migrations/20260911000000_add_schedule_days_of_week.sql) so the
 * codebase has one weekday encoding rather than two.
 */
export interface WeeklyChecklistDeadline {
  weekday: number;
  /** Optional 24-hour "HH:MM", zero-padded. null means "by end of day" (no
   * specific time was set, just the day). */
  time: string | null;
}

export interface WeeklyChecklistItem {
  id: string;
  label: string;
  /** Persistent - see the module comment. Never reset automatically. */
  checked: boolean;
  /**
   * Epoch ms of the most recent unchecked -> checked transition (see
   * toggleWeeklyChecklistItem); null whenever `checked` is false, including a
   * payload written before this field existed (coerceWeeklyChecklist forces
   * this pairing on read, defensively, regardless of what raw.checkedAt
   * says). This is what lets the calendar planner
   * (course-calendar-events.ts's checklist events) mark the checkmark on
   * exactly the calendar week the item was checked IN, rather than on every
   * week's occurrence.
   */
  checkedAt: number | null;
  deadline: WeeklyChecklistDeadline | null;
}

// More than this stops being a weekly checklist and starts being a project
// plan; it also keeps the collapsed-cell summary and the expanded editor
// readable inside a dense table.
export const WEEKLY_CHECKLIST_MAX_ITEMS = 30;
// Long enough for a real task description, short enough to stay scannable
// in a table cell - matches MAX_NAME in src/lib/course-project.ts.
export const WEEKLY_CHECKLIST_MAX_LABEL_LENGTH = 200;

/** Index = weekday (0=Sunday..6=Saturday) - see WeeklyChecklistDeadline. */
export const WEEKLY_CHECKLIST_WEEKDAY_LABELS: readonly string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/** "9:05" -> "09:05"; rejects an out-of-range, malformed, or non-string time. */
function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = TIME_PATTERN.exec(raw.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function coerceDeadline(raw: unknown): WeeklyChecklistDeadline | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const weekday = obj.weekday;
  if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return null;
  }
  return { weekday, time: normalizeTime(obj.time) };
}

/** A finite number, or null for anything else (missing, wrong type, NaN,
 * Infinity) - never throws, never coerces a string number. */
function coerceCheckedAt(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/**
 * Defensive coercion for the weekly_checklist jsonb column (or any other
 * untrusted source, e.g. a hand-edited row): never throws.
 * - Non-array input -> [].
 * - Each entry that is not an object, or is missing a non-empty string id,
 *   or is missing a string label, is DROPPED (not defaulted) - a garbage
 *   entry must disappear rather than turn into a blank item nobody added.
 * - label is trimmed and capped at WEEKLY_CHECKLIST_MAX_LABEL_LENGTH; an
 *   entry whose label is empty after trimming is dropped too, since a
 *   checklist item with no text is not usable.
 * - checked defaults to false for anything that is not literally `true`.
 * - checkedAt is coerced to a finite number, but ONLY kept when checked is
 *   true - an unchecked item always reads back with checkedAt: null,
 *   regardless of what raw.checkedAt says (a hand-edited or pre-this-field
 *   payload must never resurrect a stale timestamp the calendar planner
 *   would misread as "checked this week"). Absent on a pre-existing payload
 *   -> null, same as any other malformed value.
 * - deadline is coerced field-by-field and falls back to null (no deadline)
 *   rather than propagating a malformed shape.
 * - The list is capped at WEEKLY_CHECKLIST_MAX_ITEMS, keeping the earliest
 *   entries - a payload that grew past the cap loses its tail, not an
 *   arbitrary subset.
 */
export function coerceWeeklyChecklist(raw: unknown): WeeklyChecklistItem[] {
  if (!Array.isArray(raw)) return [];

  const out: WeeklyChecklistItem[] = [];
  for (const entry of raw) {
    if (out.length >= WEEKLY_CHECKLIST_MAX_ITEMS) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    if (typeof obj.id !== "string" || obj.id.trim() === "") continue;
    if (typeof obj.label !== "string") continue;
    const label = obj.label.trim().slice(0, WEEKLY_CHECKLIST_MAX_LABEL_LENGTH);
    if (label === "") continue;
    const checked = obj.checked === true;
    out.push({
      id: obj.id,
      label,
      checked,
      checkedAt: checked ? coerceCheckedAt(obj.checkedAt) : null,
      deadline: coerceDeadline(obj.deadline),
    });
  }
  return out;
}

/** hour/minute here are already range-checked by normalizeTime. */
function formatClockTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour24 = Number(hourStr);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12raw = hour24 % 12;
  const hour12 = hour12raw === 0 ? 12 : hour12raw;
  return `${hour12}:${minuteStr} ${period}`;
}

/** Human display for a deadline, e.g. "Sundays" or "Sundays at 11:59 PM".
 * null -> "". */
export function describeWeeklyChecklistDeadline(deadline: WeeklyChecklistDeadline | null): string {
  if (!deadline) return "";
  const day = WEEKLY_CHECKLIST_WEEKDAY_LABELS[deadline.weekday];
  return deadline.time ? `${day}s at ${formatClockTime(deadline.time)}` : `${day}s`;
}

const DAY_MS = 86_400_000;

/**
 * The instant (epoch ms) THIS CALENDAR WEEK's occurrence of `deadline` falls
 * at, for the week containing `nowMs`. Weeks are anchored on Sunday (day 0),
 * matching the 0=Sunday weekday convention directly - unlike
 * assignment-due-rule.ts's dueDateForWeek, this never needs a course start
 * date or Monday-anchoring, because it is not counting course-relative
 * weeks: it only asks "where are we in the current real-world week".
 * A missing time is treated as end of day (23:59:59.999) - "by that day",
 * not "by midnight at its start". Pure: `now` is passed in, never read from
 * the clock internally.
 */
export function weeklyOccurrenceInstant(deadline: WeeklyChecklistDeadline, nowMs: number): number {
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday.getTime() - now.getDay() * DAY_MS);
  const occurrence = new Date(startOfWeek.getTime() + deadline.weekday * DAY_MS);
  if (deadline.time) {
    const [hourStr, minuteStr] = deadline.time.split(":");
    occurrence.setHours(Number(hourStr), Number(minuteStr), 0, 0);
  } else {
    occurrence.setHours(23, 59, 59, 999);
  }
  return occurrence.getTime();
}

/**
 * An item is overdue when it has a deadline, is still unchecked, and this
 * week's occurrence of that deadline has already passed. Checked state is
 * PERSISTENT (see the module comment), so a checked item is NEVER overdue -
 * an item ticked off in week 3 must not start screaming "overdue" again in
 * week 4 just because the calendar rolled past its weekday.
 * resetAllWeeklyChecklistChecks is the only, explicit, deliberate way to
 * bring a past check back into play.
 */
export function isWeeklyChecklistItemOverdue(item: WeeklyChecklistItem, nowMs: number): boolean {
  if (item.checked || !item.deadline) return false;
  return weeklyOccurrenceInstant(item.deadline, nowMs) <= nowMs;
}

export interface WeeklyChecklistSummary {
  total: number;
  doneCount: number;
  overdueCount: number;
}

/** Collapsed-cell summary: how many items exist, how many are checked, and
 * how many are overdue right now. */
export function summarizeWeeklyChecklist(items: WeeklyChecklistItem[], nowMs: number): WeeklyChecklistSummary {
  let doneCount = 0;
  let overdueCount = 0;
  for (const item of items) {
    if (item.checked) doneCount++;
    if (isWeeklyChecklistItemOverdue(item, nowMs)) overdueCount++;
  }
  return { total: items.length, doneCount, overdueCount };
}

/** Count of items NOT checked - a stable (time-independent) "how much is
 * left" signal used to sort the column. */
export function countOpenWeeklyChecklistItems(items: WeeklyChecklistItem[]): number {
  return items.reduce((n, item) => n + (item.checked ? 0 : 1), 0);
}

/** Count of items that resetAllWeeklyChecklistChecks would actually change -
 * used by the cell's confirm affordance ("Uncheck N items?") and to decide
 * whether the reset control should be disabled (nothing checked = nothing to
 * reset, so no-op offers are never shown). */
export function countCheckedWeeklyChecklistItems(items: WeeklyChecklistItem[]): number {
  return items.reduce((n, item) => n + (item.checked ? 1 : 0), 0);
}

/**
 * Flips the checked flag of the matching item, stamping (or clearing)
 * checkedAt in the same step so it never drifts out of sync with checked:
 * unchecked -> checked stamps `nowMs`; checked -> unchecked clears it back to
 * null. `nowMs` is caller-supplied (not read from the clock here) so this
 * stays pure and testable - see currentTimeMs() in WeeklyChecklistCell.tsx
 * for the one place it is actually sourced from Date.now().
 */
export function toggleWeeklyChecklistItem(
  items: WeeklyChecklistItem[],
  id: string,
  nowMs: number
): WeeklyChecklistItem[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    const checked = !item.checked;
    return { ...item, checked, checkedAt: checked ? nowMs : null };
  });
}

/** Appends `newItem`. No-op (returns `items` unchanged) once the list is at
 * WEEKLY_CHECKLIST_MAX_ITEMS - callers should disable their "Add" affordance
 * at the cap rather than rely on this silently dropping the add. */
export function addWeeklyChecklistItem(
  items: WeeklyChecklistItem[],
  newItem: WeeklyChecklistItem
): WeeklyChecklistItem[] {
  if (items.length >= WEEKLY_CHECKLIST_MAX_ITEMS) return items;
  return [...items, newItem];
}

export function removeWeeklyChecklistItem(items: WeeklyChecklistItem[], id: string): WeeklyChecklistItem[] {
  return items.filter((item) => item.id !== id);
}

export function setWeeklyChecklistItemLabel(
  items: WeeklyChecklistItem[],
  id: string,
  label: string
): WeeklyChecklistItem[] {
  const trimmed = label.trim().slice(0, WEEKLY_CHECKLIST_MAX_LABEL_LENGTH);
  return items.map((item) => (item.id === id ? { ...item, label: trimmed } : item));
}

export function setWeeklyChecklistItemDeadline(
  items: WeeklyChecklistItem[],
  id: string,
  deadline: WeeklyChecklistDeadline | null
): WeeklyChecklistItem[] {
  return items.map((item) => (item.id === id ? { ...item, deadline } : item));
}

/**
 * Move item `id` one position earlier ("up") or later ("down") in the
 * ordered list, swapping with its immediate neighbor. Returns the array
 * unchanged when `id` is absent or already at that edge.
 */
export function reorderWeeklyChecklistItem(
  items: WeeklyChecklistItem[],
  id: string,
  direction: "up" | "down"
): WeeklyChecklistItem[] {
  const from = items.findIndex((item) => item.id === id);
  if (from === -1) return items;
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * Sets every item's checked flag to false. This is the ONLY way checked
 * state ever changes in bulk, and it only ever runs when the caller (the
 * cell's "Reset all" control, after its own confirm step) explicitly invokes
 * it - there is no automatic/implicit reset anywhere in this module. Scoped
 * to exactly the list passed in, so applying this to one course's items can
 * never affect another course's cell.
 */
export function resetAllWeeklyChecklistChecks(items: WeeklyChecklistItem[]): WeeklyChecklistItem[] {
  // A true no-op (same array reference) when nothing is checked - callers
  // can use this to skip an unnecessary save, and it mirrors the cell's own
  // rule of never offering/running a no-op reset.
  if (!items.some((item) => item.checked)) return items;
  // checkedAt is cleared alongside checked (AC5): a reset that left a stale
  // timestamp behind would make the calendar planner think some past week is
  // still "the week it was checked in" once the item is checked again.
  return items.map((item) => (item.checked ? { ...item, checked: false, checkedAt: null } : item));
}
