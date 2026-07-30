// Pure domain model + defensive coercion for the course_hub.weekly_checklist
// jsonb column: an ordered list of checklist items. Each item carries a
// stable id, a label, an optional deadline, and a checked flag. A deadline is
// EITHER recurring (a day of week + optional time, repeating every calendar
// week - the only shape that existed before this file's non-recurring
// support was added) OR one-off (a single "YYYY-MM-DD" calendar date +
// optional time, happening exactly once) - see WeeklyChecklistDeadline's own
// doc comment for the shape and why it is designed the way it is, and
// isOneOffChecklistDeadline for the one place that distinguishes them.
//
// AC7 naming note: this module, its exported symbol names
// (WeeklyChecklistItem, WeeklyChecklistDeadline, coerceWeeklyChecklist, ...),
// and the weekly_checklist jsonb column itself all keep the word "weekly" -
// renaming any of those is a separate, unrequested migration/relabel effort
// (the instructor's "relabel to checklist" ask is a user-facing string
// change, owned by a later wave) that buys nothing on its own. Everything NEW
// introduced for non-recurring support (isOneOffChecklistDeadline,
// buildOneOffChecklistDeadline, checklistDeadlineInstant,
// parseChecklistDeadlineDate, normalizeChecklistDate) is deliberately named
// with "checklist", never "weekly checklist", since a one-off deadline is by
// definition not weekly - baking "weekly" into a name for something that
// explicitly is not would be actively misleading, not just inconsistent.
//
// Checked state is PERSISTENT, not auto-reset week to week (or, for a
// one-off item, ever reset at all - there is exactly one occurrence, so
// nothing to reset it FOR). An item ticked off stays ticked off until either
// the instructor unchecks it by hand or runs resetAllWeeklyChecklistChecks
// (the cell's explicit "Reset all" action) - there is no implicit clearing
// anywhere in this module. That is also why nothing here depends on the
// course's current week (src/lib/week-numbering.ts's currentCourseWeek):
// checked state does not compare against "which course-week is it", and
// overdue only needs to know what day THIS CALENDAR WEEK it is (recurring) or
// what the single stored date is (one-off) - see weeklyOccurrenceInstant and
// checklistDeadlineInstant.
//
// No I/O, no Date.now()/crypto.randomUUID() calls except where `now`/`id`
// are supplied by the caller - safe on client or server, fully
// unit-testable.

/**
 * A checklist item's deadline: either RECURRING (weekly) or ONE-OFF (a
 * single calendar date), distinguished by `date`.
 *
 * Shape decision (AC1): rather than a TypeScript discriminated union (two
 * differently-shaped variants, e.g. `{kind:"recurring", weekday, time} |
 * {kind:"one-off", date, time}`), this keeps ONE object shape and adds a
 * single new OPTIONAL field, `date`, alongside the pre-existing `weekday` -
 * "a nullable date alongside the weekday", one of the two shapes the
 * acceptance criteria itself offered. Two concrete reasons this is the
 * better fit here, not just the more convenient one:
 *
 * 1. Backward compatibility falls out for free. Every payload written
 *    before this change simply never mentions `date` at all. Because `date`
 *    is optional (not just nullable), "the key is absent" and "the key is
 *    explicitly null" are the SAME representation (`undefined`) everywhere
 *    this field is read (isOneOffChecklistDeadline treats both as falsy) -
 *    there are never two competing "this is recurring" encodings to keep in
 *    sync. A discriminated union would need an explicit `kind: "recurring"`
 *    written onto every migrated old row (or a parallel "kind is absent"
 *    special case threaded through every reader) to get the same guarantee.
 * 2. This codebase has TWO concurrently-owned consumers of this exact type
 *    that this wave must not edit: src/lib/weekly-checklist-table-helpers.ts
 *    (owned outright, no exception) and WeeklyChecklistCell.tsx (owned by a
 *    later wave; editable here only if literally required to compile). Both
 *    already read `.weekday` and `.time` unconditionally off a
 *    WeeklyChecklistDeadline, and WeeklyChecklistCell.tsx already constructs
 *    `{weekday, time}` object literals with no `date` key at several call
 *    sites (setItemWeekday/setItemTime/addItem). A discriminated union would
 *    either remove `weekday` from one branch's type (breaking the table
 *    helpers' unconditional `.weekday` read) or force every existing object
 *    literal to learn about a new required `kind`/`date` field (forcing an
 *    edit to the cell this wave is told not to make). Keeping one shape with
 *    an ADDITIONAL optional field means every pre-existing read and
 *    construction site keeps compiling, and keeps meaning "recurring",
 *    completely untouched.
 *
 * weekday uses 0=Sunday..6=Saturday, matching the days_of_week convention
 * already used by workflow_schedules (see
 * supabase/migrations/20260911000000_add_schedule_days_of_week.sql) so the
 * codebase has one weekday encoding rather than two. For a ONE-OFF deadline,
 * weekday is still populated (derived from `date` at construction time - see
 * coerceDeadline/buildOneOffChecklistDeadline) purely so every existing
 * consumer that already reads `.weekday` unconditionally (most notably
 * weekly-checklist-table-helpers.ts's "weekday" sort column) keeps producing
 * a sane, real value without needing to learn that one-off deadlines exist at
 * all; `date` is what actually decides the deadline's meaning wherever this
 * module needs to tell the two kinds apart.
 */
export interface WeeklyChecklistDeadline {
  weekday: number;
  /** Optional 24-hour "HH:MM", zero-padded. null means "by end of day" (no
   * specific time was set, just the day). */
  time: string | null;
  /**
   * Non-null ("YYYY-MM-DD") makes this deadline ONE-OFF: it happens exactly
   * once, on this specific calendar date, instead of recurring every week.
   * Absent (undefined) or null both mean "no one-off date" - i.e. RECURRING,
   * using `weekday` as it always has - and are treated identically
   * everywhere this field is read (see isOneOffChecklistDeadline). Optional
   * specifically so a pre-existing object literal that never mentions this
   * field (every payload stored before this change, and every
   * WeeklyChecklistDeadline literal written elsewhere in this codebase prior
   * to this change) remains valid TypeScript AND remains recurring, with no
   * migration step required - see this interface's own doc comment above for
   * why that guarantee mattered enough to shape the whole design around it.
   */
  date?: string | null;
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

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "2026-08-15" -> the same string, or null for anything that is not a real
 * calendar date in exactly that shape - wrong type, wrong format, or a
 * plausible-looking but nonexistent date (e.g. "2026-02-30"). AC2 requires a
 * malformed date never become a DIFFERENT, silently-wrong date: plain
 * `new Date("2026-02-30")` would roll forward into March rather than reject,
 * which is exactly the failure this guards against - the constructed date is
 * read back and compared component-by-component against what was asked for,
 * and any mismatch (i.e. any rollover) is treated as malformed, same as a
 * wrong type or format.
 */
function normalizeChecklistDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = DATE_PATTERN.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Parses an already-validated "YYYY-MM-DD" (see normalizeChecklistDate) into
 * a local-midnight Date. Exported so the calendar planner
 * (course-calendar-events.ts's one-off checklist event builder) can build a
 * one-off event's start Date without re-deriving date parsing a second time -
 * mirrors this module's own local-Date convention (see the parseCourseDate
 * idiom in course-calendar-events.ts), never UTC.
 */
export function parseChecklistDeadlineDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** The weekday (0=Sunday..6=Saturday) an already-validated "YYYY-MM-DD" falls
 * on - used to populate WeeklyChecklistDeadline.weekday for a one-off
 * deadline, so it never needs to be separately supplied (or trusted) on the
 * way in - see coerceDeadline and buildOneOffChecklistDeadline. */
function weekdayOfDateString(date: string): number {
  return parseChecklistDeadlineDate(date).getDay();
}

/**
 * Whether `deadline` is ONE-OFF (a single calendar date) rather than
 * recurring (weekly). null (no deadline at all) is never one-off. See
 * WeeklyChecklistDeadline.date's own doc comment for why "absent" and
 * "explicit null" are deliberately the same answer here.
 */
export function isOneOffChecklistDeadline(deadline: WeeklyChecklistDeadline | null): boolean {
  return !!deadline?.date;
}

/**
 * The three states a deadline can be in, from the UI's point of view
 * (wave 2's per-item/add-row "Schedule" control - WeeklyChecklistCell.tsx).
 * This is deliberately NOT how WeeklyChecklistDeadline itself is modeled
 * (see that interface's own doc comment for why a discriminated union was
 * rejected for the STORAGE shape) - `ChecklistDeadlineKind` exists only to
 * answer "which of the two schedule controls (day-of-week vs date) should
 * the UI show right now," a presentation question, not a storage one. Three
 * values rather than two ("recurring"/"one-off") because "no deadline at
 * all" is a real, distinct state the UI needs to render too (an item with no
 * schedule yet).
 */
export type ChecklistDeadlineKind = "none" | "recurring" | "one-off";

/** Classifies a deadline for the UI's "Schedule" control. Pure derivation of
 * isOneOffChecklistDeadline - see that function for the recurring/one-off
 * split; `null` is the third state, "none", that isOneOffChecklistDeadline
 * alone cannot distinguish from "recurring" (both are `false`). */
export function checklistDeadlineKind(deadline: WeeklyChecklistDeadline | null): ChecklistDeadlineKind {
  if (!deadline) return "none";
  return isOneOffChecklistDeadline(deadline) ? "one-off" : "recurring";
}

/**
 * Builds a one-off WeeklyChecklistDeadline for a "YYYY-MM-DD" date + optional
 * time, deriving `weekday` from the date so it can never disagree with it
 * (see the interface's own doc comment for why `weekday` is still populated
 * for a one-off deadline at all). Returns null for an invalid date string,
 * exactly like coerceWeeklyChecklist would reject the same input on read - a
 * caller-constructed deadline and one read back off disk must never disagree
 * about what counts as valid.
 */
export function buildOneOffChecklistDeadline(date: string, time: string | null): WeeklyChecklistDeadline | null {
  const normalizedDate = normalizeChecklistDate(date);
  if (!normalizedDate) return null;
  return { weekday: weekdayOfDateString(normalizedDate), time: normalizeTime(time), date: normalizedDate };
}

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
 */
function coerceDeadline(raw: unknown): WeeklyChecklistDeadline | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const date = normalizeChecklistDate(obj.date);
  if (date) {
    return { weekday: weekdayOfDateString(date), time: normalizeTime(obj.time), date };
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

/** hour/minute here are already range-checked by normalizeTime. */
function formatClockTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour24 = Number(hourStr);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12raw = hour24 % 12;
  const hour12 = hour12raw === 0 ? 12 : hour12raw;
  return `${hour12}:${minuteStr} ${period}`;
}

const MONTH_LABELS: readonly string[] = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-08-15" -> "Aug 15, 2026". A fixed table (not toLocaleDateString) so
 * this stays deterministic across environments/locales, matching how
 * formatClockTime above builds its own output by hand rather than via a
 * locale-dependent API. */
function formatChecklistDateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${MONTH_LABELS[month - 1]} ${day}, ${year}`;
}

/** Human display for a deadline: "Sundays"/"Sundays at 11:59 PM" for a
 * recurring deadline, or "Aug 15, 2026"/"Aug 15, 2026 at 11:59 PM" for a
 * one-off one. null -> "". */
export function describeWeeklyChecklistDeadline(deadline: WeeklyChecklistDeadline | null): string {
  if (!deadline) return "";
  if (deadline.date) {
    const dateLabel = formatChecklistDateLabel(deadline.date);
    return deadline.time ? `${dateLabel} at ${formatClockTime(deadline.time)}` : dateLabel;
  }
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
 *
 * RECURRING ONLY - this keeps its pre-existing name and contract unchanged
 * (AC7; every existing caller/test already assumes "weekly occurrence").
 * checklistDeadlineInstant below is the new entry point that also handles a
 * one-off deadline; it delegates to this function for the recurring case
 * rather than duplicating this arithmetic.
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
 * The instant (epoch ms) a ONE-OFF deadline's single, fixed occurrence falls
 * at - counterpart to weeklyOccurrenceInstant for the recurring case.
 * Deliberately takes no `nowMs`: a one-off date does not move depending on
 * "where are we in the current week", unlike a recurring one.
 */
function oneOffChecklistDeadlineInstant(deadline: WeeklyChecklistDeadline): number {
  const occurrence = parseChecklistDeadlineDate(deadline.date as string);
  if (deadline.time) {
    const [hourStr, minuteStr] = deadline.time.split(":");
    occurrence.setHours(Number(hourStr), Number(minuteStr), 0, 0);
  } else {
    occurrence.setHours(23, 59, 59, 999);
  }
  return occurrence.getTime();
}

/**
 * The instant (epoch ms) `deadline`'s relevant occurrence falls at, for
 * EITHER kind (AC3) - the single entry point isWeeklyChecklistItemOverdue
 * (and any future caller) uses so "which kind is this, and what does that
 * imply for the relevant instant" is decided in exactly one place. Recurring
 * delegates to weeklyOccurrenceInstant unchanged (dependent on `nowMs`,
 * "this calendar week"); one-off returns its own fixed instant, ignoring
 * `nowMs` entirely (there is no "which week" for a single date).
 */
export function checklistDeadlineInstant(deadline: WeeklyChecklistDeadline, nowMs: number): number {
  return isOneOffChecklistDeadline(deadline) ? oneOffChecklistDeadlineInstant(deadline) : weeklyOccurrenceInstant(deadline, nowMs);
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
  if (item.checked || !item.deadline) return false;
  return checklistDeadlineInstant(item.deadline, nowMs) <= nowMs;
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

/** "YYYY-MM-DD" for `nowMs`'s own local calendar date - the default a
 * one-off deadline seeds itself with when the UI switches an item TO
 * one-off with no prior date to fall back on (see
 * resolveDeadlineForKindChange). Not exported: this is an implementation
 * detail of that one caller, not a general-purpose formatter - unlike
 * parseChecklistDeadlineDate (the inverse direction), which IS exported
 * because course-calendar-events.ts genuinely needs it. */
function todayDateString(nowMs: number): string {
  const d = new Date(nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Resolves the deadline a checklist item should have immediately after the
 * UI's "Schedule" control (WeeklyChecklistCell.tsx) is switched to `kind` -
 * AC1's none/recurring/one-off choice, for an EXISTING item (the add row
 * uses its own, simpler logic - see addItem's own comment for why: nothing
 * commits until "Add" is clicked, so it never needs a provisional default
 * the way an existing item's immediate-commit edit does). Every mutation in
 * this module commits immediately (see the module comment), and the
 * "Schedule" control is no exception: switching it does not leave the item
 * in a half-edited limbo waiting for a second field to be filled in, it
 * produces an immediately valid (if provisional) deadline of the requested
 * kind, which the subsequently-revealed day-select or date-field then lets
 * the instructor refine. That is the only way to make "which kind" its own
 * control at all without inventing a second, parallel piece of state to
 * track a pending kind that has not been "confirmed" into an actual
 * deadline yet - a distinction this module's persistent-commit design (see
 * the module comment) does not otherwise need anywhere else.
 *
 * - kind "none" always returns null, regardless of `current` - this is now
 *   the ONLY way to clear an item's deadline entirely (the day-select no
 *   longer offers its own separate "No deadline" entry - see
 *   WeeklyChecklistCell.tsx's per-item Day select, which only ever lists the
 *   seven real weekdays now that this control owns "no deadline" outright).
 * - Switching to the kind the deadline is ALREADY in (recurring ->
 *   recurring, one-off -> one-off) is a no-op: returns `current` unchanged,
 *   object identity included, so callers can skip a pointless save.
 * - one-off -> recurring reuses the one-off deadline's own DERIVED weekday
 *   (see WeeklyChecklistDeadline's own doc comment for why `weekday` is
 *   always populated even on a one-off deadline) and its time, dropping
 *   only `date` - no data is invented, and the weekday shown afterward is
 *   the exact weekday the one-off date happened to fall on, not a
 *   surprising default.
 * - none -> recurring has nothing to reuse, so it defaults to Sunday
 *   (weekday 0) with no time - the same "just pick something reasonable,
 *   let the instructor refine it" contract the day-select's own first
 *   render already relies on for a brand new item.
 * - recurring -> one-off and none -> one-off both default the date to
 *   TODAY (`nowMs`, caller-supplied so this stays pure/testable - see the
 *   module comment's "no Date.now() except where nowMs is supplied"
 *   contract), carrying over `current.time` when there was one. Today,
 *   not some derived "next occurrence of that weekday," because inventing a
 *   future-date guess the instructor did not ask for is exactly the kind of
 *   silent guess this module avoids elsewhere (see normalizeChecklistDate's
 *   own no-guessing contract) - today is neutral, obviously provisional, and
 *   always a single edit away from being correct via the date field shown
 *   right after.
 */
export function resolveDeadlineForKindChange(
  current: WeeklyChecklistDeadline | null,
  kind: ChecklistDeadlineKind,
  nowMs: number
): WeeklyChecklistDeadline | null {
  if (kind === "none") return null;
  if (kind === "recurring") {
    if (current && !isOneOffChecklistDeadline(current)) return current; // already recurring
    if (current) return { weekday: current.weekday, time: current.time }; // one-off -> recurring: reuse derived weekday/time
    return { weekday: 0, time: null }; // none -> recurring: default Sunday
  }
  // kind === "one-off"
  if (current && isOneOffChecklistDeadline(current)) return current; // already one-off
  return buildOneOffChecklistDeadline(todayDateString(nowMs), current?.time ?? null);
}

export function setWeeklyChecklistItemDeadline(
  items: WeeklyChecklistItem[],
  id: string,
  deadline: WeeklyChecklistDeadline | null
): WeeklyChecklistItem[] {
  return items.map((item) => (item.id === id ? { ...item, deadline } : item));
}

/**
 * Whether a checklist item mutation should trigger a calendar push, given the
 * item's deadline just before and just after the change. True whenever a
 * deadline exists on EITHER side: gaining a deadline (needs a create), losing
 * one (needs the old occurrences deleted), or keeping a non-null deadline
 * through a rename/re-time/re-day/toggle (needs an update). False only when
 * the deadline was null before AND stays null after - nothing was ever
 * created for that item, so there is nothing to push and nothing to clean
 * up.
 *
 * Pure and side-effect-free: the caller (WeeklyChecklistCell.tsx) uses this
 * to decide whether to invoke the scoped calendar sync action
 * (syncChecklistItemCalendarAction) at all, so adding an item with no
 * deadline, renaming an item that has never had one, or removing one that
 * never had one, never makes a calendar API round trip - there is nothing
 * that call could possibly find to create, update, or delete.
 */
export function checklistDeadlineChangeNeedsCalendarSync(
  before: WeeklyChecklistDeadline | null,
  after: WeeklyChecklistDeadline | null
): boolean {
  return before !== null || after !== null;
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
