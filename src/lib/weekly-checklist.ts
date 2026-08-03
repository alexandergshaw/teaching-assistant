// Pure domain model + defensive coercion for the course_hub.weekly_checklist
// jsonb column: an ordered list of checklist items (WeeklyChecklistItem) and
// every operation on that list - coercing untrusted jsonb into a real item
// array, toggling/adding/removing/reordering items, and the
// checked/overdue/summary predicates a caller needs to render or count them.
//
// The DEADLINE a single item carries - what kind it is, how to build one, how
// to describe it, and the occurrence-math for "when is it due right now" -
// lives in ./checklist-deadline.ts instead (split out when this file grew
// past this project's 1000-line cap): the seam is "a deadline, standalone"
// vs "a list of items and operations on that list". This file imports FROM
// checklist-deadline.ts (isChecklistItemCheckedNow needs checklistDeadlineKind
// to tell a daily/monthly item's period-scoped check apart from a
// recurring/one-off item's persistent one; isWeeklyChecklistItemOverdue needs
// checklistDeadlineInstant) and re-exports every symbol that used to live
// here under its original name, so no existing call site (this app has many -
// WeeklyChecklistCell.tsx, WeeklyChecklistOverviewModal.tsx,
// course-calendar-events.ts, weekly-checklist-table-helpers.ts, and more)
// needs to change its import path. checklist-deadline.ts never imports
// anything back from this file, so the dependency is strictly one-way.
//
// Checked state is PERSISTENT for a RECURRING or ONE-OFF item, not auto-reset
// week to week (or, for a one-off item, ever reset at all - there is exactly
// one occurrence, so nothing to reset it FOR). An item ticked off stays
// ticked off until either the instructor unchecks it by hand or runs
// resetAllWeeklyChecklistChecks (the cell's explicit "Reset all" action) -
// there is no implicit MUTATION-based clearing anywhere in this module. A
// DAILY or MONTHLY item's check is different by explicit instructor decision:
// it applies to the CURRENT PERIOD only, reading back as unchecked once the
// calendar day/month rolls over - but this is answered entirely at READ TIME
// (isChecklistItemCheckedNow), never by writing/clearing the stored
// checked/checkedAt fields, so "there is no implicit clearing anywhere in
// this module" remains literally true: nothing here ever mutates a row to
// make it look unchecked, it simply answers "is this currently checked"
// differently depending on `nowMs`. That is also why nothing here depends on
// the course's current week (src/lib/week-numbering.ts's currentCourseWeek):
// checked state does not compare against "which course-week is it", and
// overdue only needs to know what day THIS CALENDAR WEEK/DAY/MONTH it is
// (recurring/daily/monthly) or what the single stored date is (one-off) -
// see checklist-deadline.ts's own weeklyOccurrenceInstant and
// checklistDeadlineInstant.
//
// No I/O, no Date.now()/crypto.randomUUID() calls except where `now`/`id`
// are supplied by the caller - safe on client or server, fully
// unit-testable.

import {
  checklistDeadlineKind,
  checklistDeadlineInstant,
  normalizeChecklistDate,
  normalizeTime,
  weekdayOfDateString,
  type WeeklyChecklistDeadline,
} from "./checklist-deadline";

// Re-exported for backward compatibility - every symbol below used to be
// defined in this file; see this module's own header comment and
// ./checklist-deadline.ts's header comment for why they moved and why the
// dependency only ever points this file -> checklist-deadline.ts, never back.
export {
  type WeeklyChecklistDeadline,
  type ChecklistDeadlineKind,
  WEEKLY_CHECKLIST_WEEKDAY_LABELS,
  parseChecklistDeadlineDate,
  isOneOffChecklistDeadline,
  checklistDeadlineKind,
  buildOneOffChecklistDeadline,
  buildDailyChecklistDeadline,
  buildMonthlyChecklistDeadline,
  describeWeeklyChecklistDeadline,
  weeklyOccurrenceInstant,
  daysInChecklistMonth,
  checklistDeadlineInstant,
  resolveDeadlineForKindChange,
  checklistDeadlineChangeNeedsCalendarSync,
} from "./checklist-deadline";

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
   * (course-calendar-checklist-events.ts's checklist events) mark the
   * checkmark on exactly the calendar week the item was checked IN, rather
   * than on every week's occurrence.
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

/**
 * Defensive per-field coercion for one deadline value (AC2). A `date` field
 * is checked FIRST: when it normalizes to a real calendar date, the deadline
 * is treated as ONE-OFF and `weekday` is DERIVED from that date, never
 * trusted from the raw input - a one-off deadline's raw `weekday` (if any)
 * is simply ignored rather than cross-checked, so the two can never silently
 * disagree. When `date` is absent entirely (every payload written before
 * this change - AC2's migration guarantee) OR present but malformed, the
 * deadline falls back to RECURRING and is validated exactly as before: a
 * malformed `date` is dropped (nulled) while a valid `weekday` survives,
 * mirroring how a malformed `time` is already dropped while `weekday`
 * survives just below - never propagated as some OTHER, wrong date. Only
 * when weekday is ALSO missing/invalid in that fallback path does the whole
 * deadline become null, same as before this change.
 *
 * `frequency` is checked next, AFTER `date` (matching checklistDeadlineKind's
 * own "date wins" precedence exactly, rather than a second, possibly
 * divergent copy of that rule): a recognized "daily" always survives (there
 * is no invalid daily payload - see buildDailyChecklistDeadline); a
 * recognized "monthly" survives only when `dayOfMonth` is ALSO a valid
 * integer 1-31, otherwise it degrades to RECURRING below - exactly like an
 * UNRECOGNIZED frequency string does - rather than nulling out the whole
 * deadline, mirroring how a malformed `date`/`time` already degrades to a
 * still-usable deadline instead of discarding it. Either way, the raw
 * `frequency`/`dayOfMonth` values are never blindly copied through (this
 * function always builds a fresh object) - a garbage or unrecognized
 * frequency is silently dropped on read rather than round-tripped forever.
 *
 * normalizeChecklistDate/normalizeTime/weekdayOfDateString are imported from
 * checklist-deadline.ts rather than reimplemented here, so a raw payload is
 * validated using the EXACT same rules buildOneOffChecklistDeadline (etc.)
 * would apply to caller-constructed input - see that module's own header
 * comment for why this sharing exists.
 */
function coerceDeadline(raw: unknown): WeeklyChecklistDeadline | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const date = normalizeChecklistDate(obj.date);
  if (date) {
    return { weekday: weekdayOfDateString(date), time: normalizeTime(obj.time), date };
  }

  if (obj.frequency === "daily") {
    return { weekday: 0, time: normalizeTime(obj.time), frequency: "daily" };
  }

  if (obj.frequency === "monthly") {
    const dayOfMonth = obj.dayOfMonth;
    if (typeof dayOfMonth === "number" && Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31) {
      return { weekday: 0, time: normalizeTime(obj.time), frequency: "monthly", dayOfMonth };
    }
    // Malformed dayOfMonth alongside a recognized "monthly" frequency: fall
    // through to the weekday-based recurring read below, same as an
    // unrecognized frequency string would - see this function's own doc
    // comment above.
  }

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

function isSameLocalDay(aMs: number, bMs: number): boolean {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isSameLocalMonth(aMs: number, bMs: number): boolean {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * Whether `item` should currently be treated as checked, for DISPLAY or
 * COUNTING purposes - the instructor's first decision (see this module's own
 * "daily/monthly" additions): a DAILY or MONTHLY item's check applies to the
 * CURRENT PERIOD only, reverting to unchecked once the calendar day/month
 * rolls over, while a WEEKLY or ONE-OFF item's check is unchanged and stays
 * persistent (see the module comment's "no implicit clearing" invariant,
 * which still holds literally: this function never writes anything).
 *
 * Deliberately a READ-TIME computation, not a mutation: `item.checked`/
 * `item.checkedAt` in the STORED row are never touched, so a daily item that
 * "expires" needs no write path, no migration, and no background job - the
 * very next time this function is called (the next render, the next sync)
 * with a later `nowMs`, it simply answers differently. This is also why the
 * distinction matters for CALLERS: everywhere a checklist item's checked
 * state is DISPLAYED or COUNTED (the checkbox itself, the "N checked"
 * summary, the Overview window's Done/Open badge, sort order) must call this
 * function rather than read `item.checked` directly, or a daily/monthly item
 * would keep showing as done forever - see toggleWeeklyChecklistItem,
 * countCheckedWeeklyChecklistItems, countOpenWeeklyChecklistItems,
 * isWeeklyChecklistItemOverdue (all in this file) and
 * buildWeeklyChecklistOverviewRows (weekly-checklist-table-helpers.ts).
 *
 * `item.checkedAt == null` (missing entirely, or explicitly null - covers
 * both a row written before checkedAt existed and the ordinary "never
 * checked" case, though the latter is already handled by the `!item.checked`
 * guard above it) is treated as checked-and-never-expiring rather than
 * checked-and-already-expired: a legacy row with no timestamp has no period
 * to compare `nowMs` against, and silently unchecking it would look
 * indistinguishable from data loss to the instructor, not a feature.
 */
export function isChecklistItemCheckedNow(item: WeeklyChecklistItem, nowMs: number): boolean {
  if (!item.checked) return false;
  if (item.checkedAt == null) return true;
  const kind = checklistDeadlineKind(item.deadline);
  if (kind === "daily") return isSameLocalDay(item.checkedAt, nowMs);
  if (kind === "monthly") return isSameLocalMonth(item.checkedAt, nowMs);
  return true; // none / recurring / one-off: persistent, exactly as before this feature
}

/**
 * An item is overdue when it has a deadline, is still unchecked, and that
 * deadline's relevant occurrence has already passed (AC3):
 * - RECURRING: this week's occurrence, exactly as before.
 * - ONE-OFF: its single date+time. Once that date has passed, an unchecked
 *   one-off item stays overdue indefinitely (there is no "next week" to
 *   silently roll it into, unlike a recurring deadline) - it keeps
 *   demanding attention until the instructor actually acts on it (checks it,
 *   or edits/removes the deadline), never silently resolving itself.
 *
 * Checked state is PERSISTENT (see the module comment), so a checked item is
 * NEVER overdue, for either kind - an item ticked off in week 3 must not
 * start screaming "overdue" again in week 4 just because the calendar rolled
 * past its weekday, and a one-off item ticked off before or after its date
 * must not start screaming either. This is also this module's deliberate
 * answer to "what happens to a one-off item after it's checked AND past its
 * date" (AC3): it behaves exactly like any other completed checklist item -
 * it stops being overdue and stays visible, checked, in the list until the
 * instructor removes it or runs resetAllWeeklyChecklistChecks - it neither
 * nags forever (checked already means never-overdue, unconditionally) nor
 * vanishes (nothing in this module ever removes an item on its own; removal
 * is always an explicit, separate action - see removeWeeklyChecklistItem).
 * resetAllWeeklyChecklistChecks is the only, explicit, deliberate way to
 * bring a past check back into play.
 */
export function isWeeklyChecklistItemOverdue(item: WeeklyChecklistItem, nowMs: number): boolean {
  if (isChecklistItemCheckedNow(item, nowMs) || !item.deadline) return false;
  return checklistDeadlineInstant(item.deadline, nowMs) <= nowMs;
}

/** Whether `item` counts as checked FOR COUNTING PURPOSES, given an optional
 * `nowMs` - see countOpenWeeklyChecklistItems/countCheckedWeeklyChecklistItems'
 * own doc comments for why `nowMs` is optional here specifically (unlike
 * every other time-dependent function in this module). */
function isCheckedForCounting(item: WeeklyChecklistItem, nowMs: number | undefined): boolean {
  return nowMs === undefined ? item.checked : isChecklistItemCheckedNow(item, nowMs);
}

/**
 * Count of items NOT currently checked - a "how much is left" signal used to
 * sort the column. `nowMs` is OPTIONAL, unlike every other time-dependent
 * function in this module: this function predates the daily/monthly feature
 * as a genuinely time-independent (raw `item.checked`) count, and at least
 * one existing caller (courses-table-helpers.ts's own "weeklyChecklist" sort
 * column) is DELIBERATELY, by its own doc comment, a pure/time-independent
 * function of the course - it must keep compiling AND keep its exact
 * pre-existing meaning with a single argument. A caller that DOES pass
 * `nowMs` (WeeklyChecklistCell.tsx) gets the period-aware count instead, via
 * isChecklistItemCheckedNow - see isCheckedForCounting just above. Still
 * pure either way: the same (items, nowMs) pair always produces the same
 * count, and nothing here ever reads Date.now() itself.
 */
export function countOpenWeeklyChecklistItems(items: WeeklyChecklistItem[], nowMs?: number): number {
  return items.reduce((n, item) => n + (isCheckedForCounting(item, nowMs) ? 0 : 1), 0);
}

/** Count of items that resetAllWeeklyChecklistChecks would actually change -
 * used by the cell's confirm affordance ("Uncheck N items?") and to decide
 * whether the reset control should be disabled (nothing checked = nothing to
 * reset, so no-op offers are never shown). `nowMs` is optional - see
 * countOpenWeeklyChecklistItems' own doc comment for the identical
 * rationale. */
export function countCheckedWeeklyChecklistItems(items: WeeklyChecklistItem[], nowMs?: number): number {
  return items.reduce((n, item) => n + (isCheckedForCounting(item, nowMs) ? 1 : 0), 0);
}

/**
 * Flips the item's checked state as DISPLAYED (see isChecklistItemCheckedNow),
 * not its raw stored flag - the distinction only matters for a daily/monthly
 * item whose period has already rolled over: its RAW `checked` may still be
 * `true` from an earlier period (deliberately never auto-cleared - see the
 * module comment), even though it is currently DISPLAYED as unchecked. A
 * checkbox click always means "flip what I can see," so this negates
 * isChecklistItemCheckedNow's answer, not the raw flag - clicking a
 * visually-unchecked-but-stale-raw-checked daily box correctly CHECKS it
 * (stamping a fresh `nowMs`) rather than perversely unchecking an already
 * (visually) unchecked item. For every kind that existed before this
 * feature (weekly, one-off, no deadline) isChecklistItemCheckedNow always
 * equals the raw `checked` flag exactly, so this is 100% behavior-preserving
 * for every pre-existing caller/test - the divergence is new, and exists
 * only for daily/monthly.
 *
 * Either way, checkedAt is stamped/cleared in the same step so it never
 * drifts out of sync with checked: flipping to checked stamps `nowMs`;
 * flipping to unchecked clears it back to null. `nowMs` is caller-supplied
 * (not read from the clock here) so this stays pure and testable - see
 * currentTimeMs() in WeeklyChecklistCell.tsx for the one place it is
 * actually sourced from Date.now().
 */
export function toggleWeeklyChecklistItem(
  items: WeeklyChecklistItem[],
  id: string,
  nowMs: number
): WeeklyChecklistItem[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    const checked = !isChecklistItemCheckedNow(item, nowMs);
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
