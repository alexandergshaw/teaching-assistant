"use client";

// Checklist column cell (rendered under the "Checklist" header as of wave
// 2's relabel - AC4/AC5; the file/component/export name and every internal
// symbol deliberately keep "WeeklyChecklist" - see weekly-checklist.ts's own
// AC7 naming note for why renaming those buys nothing and costs a real
// migration/rename risk): an inline, always-visible per-course task list.
// Every item's checkbox, label, and deadline controls render directly in the
// cell body - there is no summary-plus-Popover gating the view. That WAS the
// original shape (748d4ae), but the instructor explicitly overruled it: "I
// don't have to click a button/link to view them." Viewing every item
// (checkbox, label, deadline) now costs zero clicks; only the lower-traffic
// editing affordances (rename, reorder, remove) stay lightweight per-item
// controls rather than a whole extra mode.
//
// Deadline controls are ALWAYS rendered per item, never gated behind a "Set
// deadline" click - native inputs throughout, no new picker dependency
// (@mui/x-date-pickers is not installed), matching AssignmentDueCell.tsx's
// day/time pair elsewhere in this table. AC1 (wave 2): a deadline is now
// EITHER recurring (a day-of-week select, as before) OR one-off (a native
// type="date" field) - a "Schedule" select chooses which, and
// resolveDeadlineForKindChange (weekly-checklist.ts) is what lets flipping
// that selector always leave the item with an immediately-valid (if
// provisional) deadline of the requested kind - see that function's own doc
// comment for exactly what each transition defaults to and why. The
// add-item row carries the identical Schedule/Day-or-Date/Time trio so a
// deadline (recurring OR one-off) can be set in the same pass as creating
// the item: type the label, set the schedule, press Enter in the label
// field - no second trip to find the new item and edit it afterward. After
// adding, the schedule selection is deliberately kept (checklists tend to
// get several items due the same day, or several one-off items on the same
// date) while only the label clears and refocuses, so a same-day batch can
// be typed one after another.
//
// Every mutation persists immediately and optimistically via onCourseUpdated
// (the same full-row-replace callback every cell in this folder uses), and
// reverts to the pre-mutation course - surfacing the error - if the save
// fails.
//
// CALENDAR SYNC: every mutation that could change what is on the calendar
// (add, rename, deadline day/time change, toggle, remove; bulk "Reset all"
// too) calls syncChecklistItemCalendarAction for the affected item(s) AFTER
// the local persist succeeds - never before, and never if the persist
// failed (AC4: a calendar problem must never cost or block local data, and
// the reverse holds too - only a SUCCESSFUL local save is ever followed by a
// calendar push). That action pushes the item's own full set of planned
// occurrences across the whole term, not just the current week - see its
// doc comment in src/app/actions/course-calendar.ts - which is what makes
// add/rename/re-day/re-time/remove reach the calendar at all, not only a
// checkbox toggle (the bug this fixes: previously only the toggle synced
// anything, and only for the current week).
//
// A mutation that could not possibly affect the calendar either before or
// after (e.g. renaming or toggling an item that has never had a deadline)
// never calls the sync action at all - see weekly-checklist.ts's
// checklistDeadlineChangeNeedsCalendarSync.
//
// DEBOUNCE: the day/date/time controls below commit on every onChange (a
// native type="time" input in particular can fire several onChange events
// for one logical edit, e.g. once per hour/minute/AM-PM segment). Pushing a
// fresh calendar write on every one of those would be needless write
// amplification against the same item's SAME occurrences a moment later.
// Deadline changes (setItemKind/setItemWeekday/setItemDate/setItemTime)
// therefore go through a small trailing-edge debounce
// (createDebouncedKeyedScheduler, CALENDAR_SYNC_DEBOUNCE_MS, keyed per item
// id) that collapses a burst of edits to one calendar push, fired once the
// user stops changing that item's deadline. Every OTHER calendar trigger
// here (add, rename-commit, toggle, remove, reset-all) is already a single
// discrete action (a button click, or a text field that only commits on
// blur/Enter) with no burst to collapse, so those push immediately.
import { useEffect, useRef, useState, type ReactNode } from "react";
import Checkbox from "@mui/material/Checkbox";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import { updateCourseHubAction, syncChecklistItemCalendarAction } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import { courseToInput } from "@/lib/courses-tab-helpers";
import { checklistCalendarBlockers, type CourseCalendarBlocker } from "@/lib/course-calendar-events";
import { createDebouncedKeyedScheduler, type DebouncedKeyedScheduler } from "@/lib/debounced-keyed-scheduler";
import {
  coerceWeeklyChecklist,
  countCheckedWeeklyChecklistItems,
  toggleWeeklyChecklistItem,
  addWeeklyChecklistItem,
  removeWeeklyChecklistItem,
  setWeeklyChecklistItemLabel,
  setWeeklyChecklistItemDeadline,
  reorderWeeklyChecklistItem,
  resetAllWeeklyChecklistChecks,
  isWeeklyChecklistItemOverdue,
  isChecklistItemCheckedNow,
  checklistDeadlineKind,
  resolveDeadlineForKindChange,
  buildOneOffChecklistDeadline,
  buildDailyChecklistDeadline,
  buildMonthlyChecklistDeadline,
  WEEKLY_CHECKLIST_MAX_ITEMS,
  WEEKLY_CHECKLIST_WEEKDAY_LABELS,
  type WeeklyChecklistItem,
  type WeeklyChecklistDeadline,
  type ChecklistDeadlineKind,
} from "@/lib/weekly-checklist";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

// A 30-item list (WEEKLY_CHECKLIST_MAX_ITEMS) scrolls WITHIN the cell past
// this height rather than growing the table row without bound - an
// unbounded row would stretch every OTHER column's cells in the same row to
// match, and silently truncating the list to "a few items plus a hidden
// remainder" is exactly the click-to-see-the-rest problem the inline
// redesign exists to remove. Scrolling keeps every item reachable with no
// click (only a scroll, same as any long list) while bounding the row's own
// height.
const ITEM_LIST_MAX_HEIGHT = 260;

// Long enough to swallow a burst of native time-input segment edits (or a
// quick weekday-then-time pick), short enough that the calendar catches up
// within about a second of the user's last edit to that item's deadline.
const CALENDAR_SYNC_DEBOUNCE_MS = 800;

// AC3: the exact wording shown inline in the cell for each blocking
// condition, whenever there is at least one deadlined item (see
// courseCalendarBlockers/hasDeadlinedItem below) - full sentences naming
// what to fix, since this is the one place silence previously stood in for
// an explanation. CourseRow.tsx's own name-cell badge shows a shorter,
// course-general version of the same two conditions (AC9) - these are
// deliberately worded around "checklist deadlines" specifically, since that
// is this cell's own audience.
const CHECKLIST_CALENDAR_BLOCKER_MESSAGES: Record<CourseCalendarBlocker, string> = {
  "missing-dates":
    "This course has no start or end date, so checklist deadlines can't sync to your calendar. Set both dates to enable it.",
  "not-connected":
    "Google Calendar isn't connected, so checklist deadlines won't sync. Connect it under Account > Integrations.",
};

// Impure Date.now() read isolated in this tiny top-level helper (mirrors
// urgencyOf in LiveFeedPanel.tsx) so eslint's react-hooks/purity rule - which
// flags a DIRECT Date.now() call inside a component body - reads clean, while
// the cell still shows "is this overdue right now" without waiting for a
// click, and stamps a toggle's checkedAt with an accurate "now". weekly-checklist.ts
// itself stays a pure module; this is the one place its `now`/`nowMs`
// parameters are actually sourced from the clock.
function currentTimeMs(): number {
  return Date.now();
}

// AC8/AC1: the add row's "Schedule" (recurring vs one-off, now also daily vs
// monthly) selection is a new control, so - per this project's standing
// persist-UI-control-state rule - it persists across reloads, unlike
// newWeekday/newTime/newDate/newDayOfMonth below (which predate that rule,
// or - for newDate/newDayOfMonth - are genuinely transient VALUES, not
// durable preferences; see readStoredNewItemKind's own reasoning). One
// shared key across every course's cell, not scoped per course: this mirrors
// how the Overview window's own hide-completed/search prefs
// (WeeklyChecklistOverviewModal.tsx) are a single global preference rather
// than per-entity, and an instructor's habitual "I mostly add recurring
// items" (or daily, or monthly, or one-off) choice is a personal-workflow
// preference, not something that plausibly differs course to course.
const NEW_ITEM_KIND_KEY = "ta-weekly-checklist-new-item-kind";

/** The add row's own 4-way "Schedule" choice - deliberately a NARROWER type
 * than ChecklistDeadlineKind (which also has "none"): the add row has no
 * explicit "no deadline" option, because nothing commits until "Add" is
 * clicked - see addItem's own comment for why leaving the relevant sub-field
 * blank already means "no deadline," with no third option needed. */
type NewItemDeadlineKind = "recurring" | "daily" | "monthly" | "one-off";
const NEW_ITEM_DEADLINE_KINDS: readonly NewItemDeadlineKind[] = ["recurring", "daily", "monthly", "one-off"];

/** Defensive read (AC8): anything other than one of the four recognized
 * literal strings (missing key, corrupt/stale value from before daily/monthly
 * existed, SSR with no window) falls back to "recurring" - the pre-existing
 * default behavior, so an instructor who never touches the new Schedule
 * control sees no change at all. */
function readStoredNewItemKind(): NewItemDeadlineKind {
  if (typeof window === "undefined") return "recurring";
  const stored = localStorage.getItem(NEW_ITEM_KIND_KEY);
  return (NEW_ITEM_DEADLINE_KINDS as readonly string[]).includes(stored ?? "")
    ? (stored as NewItemDeadlineKind)
    : "recurring";
}

export interface WeeklyChecklistCellProps {
  course: Course;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
  /** null while the page's one-time connection check is still in flight -
   * see useCoursesData.ts. Threaded down (rather than checked per cell) so
   * N course rows never make N redundant connection checks. */
  googleCalendarConnected: boolean | null;
  /** F3: the column's hamburger menu, rendered top-right of the display
   * (non-editing) cell only. Undefined renders nothing - purely additive. */
  menu?: ReactNode;
}

export function WeeklyChecklistCell({ course, onCourseUpdated, setError, googleCalendarConnected, menu }: WeeklyChecklistCellProps) {
  const [saving, setSaving] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [newLabel, setNewLabel] = useState("");
  // Deliberately NOT reset by addItem (see its comment below): checklist
  // items tend to get added in same-day batches, so the schedule picked for
  // one new item is very likely right for the next one too. 4-way
  // (recurring/daily/monthly/one-off), unlike an existing item's 5-way
  // Schedule select - see addItem's own comment for why "no deadline" needs
  // no explicit extra option on the add row.
  const [newDeadlineKind, setNewDeadlineKindState] = useState<NewItemDeadlineKind>(readStoredNewItemKind);
  const [newWeekday, setNewWeekday] = useState<number | "">("");
  // Unlike newDeadlineKind (a durable preference - see NEW_ITEM_KIND_KEY's
  // own comment) newDate/newDayOfMonth are NOT persisted across reloads
  // (AC8's own "defensive fallback" applies here too, just as a decision not
  // to persist rather than a validated read): a date (or a day-of-month tied
  // to "this batch of items") picked in one session is almost always the
  // WRONG value by the next session, so restoring it would actively mislead
  // rather than help - the same reasoning newTime already implicitly relies
  // on by starting blank every mount.
  const [newDate, setNewDate] = useState("");
  const [newDayOfMonth, setNewDayOfMonth] = useState<number | "">("");
  const [newTime, setNewTime] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);

  const setNewDeadlineKind = (kind: NewItemDeadlineKind) => {
    setNewDeadlineKindState(kind);
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(NEW_ITEM_KIND_KEY, kind);
    } catch {
      // Quota exceeded or private-browsing restriction - silently ignore,
      // same precedent as WeeklyChecklistOverviewModal.tsx's writeJSON.
    }
  };
  const newLabelRef = useRef<HTMLInputElement | null>(null);

  // One debounce scheduler per mounted cell (never re-created across
  // re-renders - useState's lazy initializer runs the factory exactly once),
  // keyed per checklist item id so one item's rapid deadline edits can never
  // delay or cancel another item's pending push. Cancelled on unmount so a
  // stray sync never fires for a row that is no longer on screen.
  const [calendarSyncScheduler] = useState<DebouncedKeyedScheduler>(() =>
    createDebouncedKeyedScheduler(CALENDAR_SYNC_DEBOUNCE_MS)
  );
  useEffect(() => {
    return () => calendarSyncScheduler.cancelAll();
  }, [calendarSyncScheduler]);

  const items = coerceWeeklyChecklist(course.weeklyChecklist);
  const nowMs = currentTimeMs();
  // Period-aware (passes nowMs) - see countCheckedWeeklyChecklistItems' own
  // doc comment for why nowMs is optional there at all: this call site DOES
  // pass it, so a daily/monthly item whose period has rolled over correctly
  // stops counting toward "N checked" the moment it stops being DISPLAYED as
  // checked (see the Checkbox/label rendering below, which uses the exact
  // same isChecklistItemCheckedNow answer per item).
  const checkedCount = countCheckedWeeklyChecklistItems(items, nowMs);
  const atCap = items.length >= WEEKLY_CHECKLIST_MAX_ITEMS;

  const hasDeadlinedItem = items.some((item) => item.deadline !== null);
  // AC3: only worth surfacing when something would actually try to sync if
  // it weren't blocked - a checklist with no deadlined items has nothing the
  // calendar could show regardless of dates or connection state.
  //
  // checklistCalendarBlockers, not the more general courseCalendarBlockers
  // wave 1 left this wired to: courseCalendarBlockers also speaks for the
  // always-attempted TERM event (genuinely still blocked by missing dates
  // regardless of the checklist - see that function's own doc comment,
  // unaffected by this wire-up and still what CourseRow.tsx's name-cell
  // badge uses), whereas THIS badge is checklist-specific and must not
  // claim "set both dates" when every deadlined item here is a self-
  // contained one-off that syncs fine without them.
  const calendarBlockers = hasDeadlinedItem
    ? checklistCalendarBlockers(course, items, googleCalendarConnected)
    : [];

  // Persists `next` optimistically: the parent's course list is updated
  // immediately (so every open row reflects the change right away), and
  // reverted back to the pre-mutation `course` - with the error surfaced -
  // if the save fails. Returns whether the save succeeded, so callers can
  // gate a follow-up calendar push on a REAL success (AC4: never push to the
  // calendar on the strength of a save that actually failed and was rolled
  // back).
  const persist = async (next: WeeklyChecklistItem[]): Promise<boolean> => {
    setSaving(true);
    onCourseUpdated({ ...course, weeklyChecklist: next });
    const r = await updateCourseHubAction(course.id, { ...courseToInput(course), weeklyChecklist: next });
    setSaving(false);
    if ("error" in r) {
      onCourseUpdated(course);
      setError(r.error);
      return false;
    }
    onCourseUpdated(r.course);
    return true;
  };

  // The bounded per-item calendar push (AC1/AC2) - fire-and-forget relative
  // to the local save that already completed: a failure here is surfaced as
  // a separate, non-fatal notice, never a revert of the already-saved
  // checklist edit.
  const runItemCalendarSync = async (itemId: string) => {
    // Skip the round trip entirely once the page's one-time connection check
    // already knows Google isn't connected - the AC3 notice above already
    // told the instructor what to fix; a duplicate error toast per edit
    // would be noise, not new information. `null` (still checking) does not
    // skip - it fails open and lets the server give the authoritative answer.
    if (googleCalendarConnected === false) return;
    const result = await syncChecklistItemCalendarAction(course.id, itemId);
    if ("error" in result) {
      setError(`Checklist item saved, but the calendar could not be updated: ${result.error}`);
    }
  };

  const scheduleCalendarSync = (itemId: string) => {
    calendarSyncScheduler.schedule(itemId, () => void runItemCalendarSync(itemId));
  };

  const toggle = async (item: WeeklyChecklistItem) => {
    const ok = await persist(toggleWeeklyChecklistItem(items, item.id, nowMs));
    // Toggling never changes the deadline itself - only worth a push when
    // there IS one (an item with no deadline has nothing on the calendar to
    // update either way). A single checkbox click is a discrete action, not
    // a burst, so this pushes immediately rather than through the debounce.
    if (ok && item.deadline !== null) void runItemCalendarSync(item.id);
  };

  const startEditLabel = (item: WeeklyChecklistItem) => {
    setEditingLabelId(item.id);
    setDraftLabel(item.label);
  };

  const commitLabel = (id: string) => {
    setEditingLabelId(null);
    if (draftLabel.trim() === "") return;
    const item = items.find((i) => i.id === id);
    void persist(setWeeklyChecklistItemLabel(items, id, draftLabel)).then((ok) => {
      // Renaming never changes the deadline either - same "only push when
      // there's a deadline" gate as toggle. commitLabel already only fires
      // on blur/Enter (a single commit point, not a keystroke burst), so
      // this pushes immediately too.
      if (ok && item?.deadline) void runItemCalendarSync(id);
    });
  };

  // weekday is always a concrete day here (never ""/"No deadline") - AC1's
  // "Schedule" select (see setItemKind below) is now the sole way to clear a
  // RECURRING item's deadline down to nothing; this select only ever offers
  // the seven real weekdays.
  const setItemWeekday = (id: string, current: WeeklyChecklistDeadline | null, weekday: number) => {
    const next: WeeklyChecklistDeadline = { weekday, time: current?.time ?? null };
    void persist(setWeeklyChecklistItemDeadline(items, id, next)).then((ok) => {
      // Gaining or changing a recurring deadline always needs a push (create
      // or update). Debounced: a quick weekday-then-time pick collapses into
      // one push instead of two.
      if (ok) scheduleCalendarSync(id);
    });
  };

  const setItemTime = (id: string, current: WeeklyChecklistDeadline | null, time: string) => {
    if (!current) return; // a time with no day/date is meaningless - the field is disabled, but this guards a stale event too
    // Spread (not a hand-built {weekday,time} literal) so a ONE-OFF item's
    // `date` survives a time edit unchanged - the pre-wave-2 version of this
    // function hand-built {weekday,time}, which silently dropped `date` and
    // would have turned a one-off item back into a recurring one the moment
    // its time was touched.
    const next: WeeklyChecklistDeadline = { ...current, time: time || null };
    void persist(setWeeklyChecklistItemDeadline(items, id, next)).then((ok) => {
      // `current` is non-null here (guarded above), so there is always
      // something on the calendar to update - debounced against the
      // native time input's multi-segment onChange bursts.
      if (ok) scheduleCalendarSync(id);
    });
  };

  // AC1: the ONE-OFF counterpart to setItemWeekday - commits a new date for
  // an item already in one-off mode (the date field only renders once
  // checklistDeadlineKind(item.deadline) === "one-off", so `current` is
  // always a real one-off deadline here in practice; the null-guard below is
  // defensive, matching setItemTime's own guard). An invalid or cleared date
  // (buildOneOffChecklistDeadline returns null) clears the deadline entirely
  // rather than leaving a half-valid one-off record - this module's storage
  // shape has no representation for "one-off, no date yet" (see
  // WeeklyChecklistDeadline's own doc comment), so "no valid date" and "no
  // deadline" collapse to the same null, exactly like clearing the Day
  // select already does for a recurring item.
  const setItemDate = (id: string, current: WeeklyChecklistDeadline | null, date: string) => {
    if (!current) return;
    const next = buildOneOffChecklistDeadline(date, current.time);
    void persist(setWeeklyChecklistItemDeadline(items, id, next)).then((ok) => {
      if (ok) scheduleCalendarSync(id);
    });
  };

  // The MONTHLY counterpart to setItemDate - commits a new day-of-month for
  // an item already in monthly mode (the field only renders once
  // checklistDeadlineKind(item.deadline) === "monthly", so `current` is
  // always a real monthly deadline here in practice; the null-guard below is
  // defensive, matching setItemTime's own guard). An out-of-range value
  // (buildMonthlyChecklistDeadline returns null - e.g. the field momentarily
  // cleared to empty while the instructor retypes it) clears the deadline
  // entirely rather than leaving a half-valid monthly record, exactly
  // mirroring setItemDate's own "invalid input clears the deadline" rule
  // above - this module's storage shape has no representation for "monthly,
  // no day yet" either.
  const setItemDayOfMonth = (id: string, current: WeeklyChecklistDeadline | null, dayOfMonth: number) => {
    if (!current) return;
    const next = buildMonthlyChecklistDeadline(dayOfMonth, current.time);
    void persist(setWeeklyChecklistItemDeadline(items, id, next)).then((ok) => {
      if (ok) scheduleCalendarSync(id);
    });
  };

  // AC1 (extended): switches an item between no-deadline/recurring/daily/
  // monthly/one-off - the sole way to clear a deadline now (the Day select
  // below no longer has its own "No deadline" entry). See
  // resolveDeadlineForKindChange's own doc comment (weekly-checklist.ts) for
  // exactly what each transition produces - the short version: it always
  // commits an immediately-valid deadline of the requested kind (never a
  // "half-set, waiting for a second field" limbo), which the day-select,
  // date-field, or day-of-month field revealed right after then lets the
  // instructor refine.
  const setItemKind = (id: string, current: WeeklyChecklistDeadline | null, kind: ChecklistDeadlineKind) => {
    const next = resolveDeadlineForKindChange(current, kind, nowMs);
    void persist(setWeeklyChecklistItemDeadline(items, id, next)).then((ok) => {
      if (ok && (current !== null || next !== null)) scheduleCalendarSync(id);
    });
  };

  const addItem = () => {
    const label = newLabel.trim();
    if (label === "" || atCap) return;
    // AC1 (extended): the add row's Schedule control has no explicit "no
    // deadline" option - see newDeadlineKind's own comment for why: nothing
    // commits until this function runs, so simply leaving the relevant
    // sub-field unset (blank weekday, blank date, blank day-of-month)
    // already means "no deadline," exactly as it did before this control
    // existed - there is no immediate-commit limbo to resolve the way
    // resolveDeadlineForKindChange resolves it for an existing item. DAILY
    // is the one kind with no identifying sub-field at all (only the
    // optional time) - selecting it always commits a real daily deadline
    // immediately, the same "picking this kind IS the commitment" behavior
    // switching an EXISTING item to daily already has via setItemKind/
    // resolveDeadlineForKindChange.
    const deadline: WeeklyChecklistDeadline | null =
      newDeadlineKind === "recurring"
        ? newWeekday === ""
          ? null
          : { weekday: newWeekday, time: newTime || null }
        : newDeadlineKind === "daily"
          ? buildDailyChecklistDeadline(newTime || null)
          : newDeadlineKind === "monthly"
            ? newDayOfMonth === ""
              ? null
              : buildMonthlyChecklistDeadline(newDayOfMonth, newTime || null)
            : newDate
              ? buildOneOffChecklistDeadline(newDate, newTime || null)
              : null;
    const newItemId = crypto.randomUUID();
    setNewLabel("");
    void persist(
      addWeeklyChecklistItem(items, { id: newItemId, label, checked: false, checkedAt: null, deadline })
    ).then((ok) => {
      // AC1: only an add WITH a deadline has anything to push - a brand new
      // item with no deadline can never have an existing calendar entry to
      // clean up either, so this is the one case that safely never calls
      // the sync action at all.
      if (ok && deadline !== null) void runItemCalendarSync(newItemId);
    });
    newLabelRef.current?.focus();
  };

  const removeItem = (item: WeeklyChecklistItem) => {
    void persist(removeWeeklyChecklistItem(items, item.id)).then((ok) => {
      // Only an item that HAD a deadline could have anything on the
      // calendar to clean up.
      if (ok && item.deadline !== null) void runItemCalendarSync(item.id);
    });
  };

  const confirmResetAll = () => {
    setResetConfirm(false);
    // Capture which items this reset will actually change (checked + has a
    // deadline) BEFORE persisting - resetAllWeeklyChecklistChecks itself
    // does not report which items it touched, and only those items' calendar
    // titles can have lost their CHECKLIST_DONE_PREFIX checkmark. Deliberately
    // the RAW item.checked here, not isChecklistItemCheckedNow: this is about
    // which items resetAllWeeklyChecklistChecks (which also operates on the
    // raw flag - see its own doc comment) is about to flip, i.e. calendar-sync
    // relevance, not about what is currently DISPLAYED as checked - a
    // daily/monthly item whose raw flag is still true from an earlier period
    // still needs its stale CHECKLIST_DONE_PREFIX cleared from the calendar
    // even though it already displays as unchecked.
    const affected = items.filter((item) => item.checked && item.deadline !== null).map((item) => item.id);
    void persist(resetAllWeeklyChecklistChecks(items)).then((ok) => {
      if (!ok) return;
      for (const itemId of affected) void runItemCalendarSync(itemId);
    });
  };

  return (
    <td style={{ minWidth: 280 }}>
      <div className={styles.courseResourceHead}>
        {/* AC4/AC5: relabeled from "Weekly Checklist" - see this file's own
            top-of-file comment for why the component/file name and every
            internal symbol still say "WeeklyChecklist". */}
        <span className={styles.courseResourceLabel}>Checklist</span>
      </div>

      {calendarBlockers.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          {calendarBlockers.map((blocker) => (
            <span
              key={blocker}
              className={`${styles.ghBadge} ${styles.ghBadgeWarning}`}
              style={{ display: "inline-block", whiteSpace: "normal", textAlign: "left" }}
            >
              {CHECKLIST_CALENDAR_BLOCKER_MESSAGES[blocker]}
            </span>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <span className={styles.courseResourceEmpty} style={{ marginTop: 8, display: "block" }}>
          No items yet.
        </span>
      ) : (
        <div
          style={{
            maxHeight: ITEM_LIST_MAX_HEIGHT,
            overflowY: "auto",
            marginTop: 8,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {items.map((item, index) => {
            const overdue = isWeeklyChecklistItemOverdue(item, nowMs);
            const itemKind = checklistDeadlineKind(item.deadline);
            // Period-aware (AC: a daily/monthly item's check applies to the
            // CURRENT PERIOD only) - see isChecklistItemCheckedNow's own doc
            // comment. Drives the checkbox and the label's strikethrough
            // below instead of the raw item.checked, or a daily item would
            // keep showing as done forever after its day rolls over.
            const checkedNow = isChecklistItemCheckedNow(item, nowMs);
            return (
              <div key={item.id} style={{ paddingBottom: 8, borderBottom: "1px solid var(--border-color)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <Checkbox
                    size="small"
                    checked={checkedNow}
                    disabled={saving}
                    aria-label={`Mark "${item.label}" done`}
                    sx={{ padding: "2px", marginTop: "1px" }}
                    onChange={() => void toggle(item)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingLabelId === item.id ? (
                      <TextField
                        size="small"
                        fullWidth
                        autoFocus
                        value={draftLabel}
                        onChange={(e) => setDraftLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitLabel(item.id);
                          if (e.key === "Escape") setEditingLabelId(null);
                        }}
                        onBlur={() => commitLabel(item.id)}
                      />
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => startEditLabel(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            startEditLabel(item);
                          }
                        }}
                        title={item.label}
                        style={{
                          cursor: "pointer",
                          textDecoration: checkedNow ? "line-through" : "none",
                          color: checkedNow ? "var(--text-secondary)" : undefined,
                          wordBreak: "break-word",
                        }}
                      >
                        {item.label}
                      </span>
                    )}

                    {overdue && (
                      <div style={{ marginTop: 2 }}>
                        <span style={{ color: "var(--danger)", fontWeight: 600, fontSize: "0.85em" }}>Overdue</span>
                      </div>
                    )}

                    <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <TextField
                        select
                        size="small"
                        label="Schedule"
                        value={itemKind}
                        onChange={(e) =>
                          setItemKind(item.id, item.deadline, e.target.value as ChecklistDeadlineKind)
                        }
                        sx={{ minWidth: 110, flex: "1 1 110px" }}
                      >
                        <MenuItem value="none">No deadline</MenuItem>
                        <MenuItem value="recurring">Weekly</MenuItem>
                        <MenuItem value="daily">Daily</MenuItem>
                        <MenuItem value="monthly">Monthly</MenuItem>
                        <MenuItem value="one-off">One-off</MenuItem>
                      </TextField>
                      {itemKind === "one-off" ? (
                        <TextField
                          size="small"
                          label="Date"
                          type="date"
                          value={item.deadline?.date ?? ""}
                          onChange={(e) => setItemDate(item.id, item.deadline, e.target.value)}
                          slotProps={{ inputLabel: { shrink: true } }}
                          sx={{ minWidth: 130, flex: "1 1 130px" }}
                        />
                      ) : itemKind === "monthly" ? (
                        <TextField
                          size="small"
                          label="Day of month"
                          type="number"
                          // Falls back to 1 defensively (mirrors the Day
                          // select's own "0 while disabled" fallback below) -
                          // in practice always a real 1-31 value here, since
                          // checklistDeadlineKind only reports "monthly" when
                          // dayOfMonth already validated (buildMonthlyChecklistDeadline/
                          // coerceDeadline both enforce this on the way in).
                          value={item.deadline?.dayOfMonth ?? 1}
                          slotProps={{ htmlInput: { min: 1, max: 31 } }}
                          onChange={(e) => setItemDayOfMonth(item.id, item.deadline, Number(e.target.value))}
                          sx={{ minWidth: 130, flex: "1 1 130px" }}
                        />
                      ) : itemKind === "daily" ? (
                        // A daily item needs only the optional Time field
                        // below - no day-of-week or day-of-month control
                        // applies, so this slot renders nothing.
                        null
                      ) : (
                        <TextField
                          select
                          size="small"
                          label="Day"
                          // Falls back to 0 (Sunday) when there is no
                          // deadline yet (kind "none") purely so this select
                          // always has a value matching one of its own
                          // MenuItems while disabled - no blank/placeholder
                          // MenuItem exists anymore (see the Schedule select
                          // above, which now owns "No deadline" outright).
                          // The instant the instructor switches to
                          // "Weekly", resolveDeadlineForKindChange seeds a
                          // real Sunday deadline and this re-enables showing
                          // that same value, not a stale leftover.
                          value={item.deadline?.weekday ?? 0}
                          disabled={!item.deadline}
                          onChange={(e) => setItemWeekday(item.id, item.deadline, Number(e.target.value))}
                          sx={{ minWidth: 110, flex: "1 1 110px" }}
                        >
                          {WEEKLY_CHECKLIST_WEEKDAY_LABELS.map((weekdayLabel, weekday) => (
                            <MenuItem key={weekday} value={weekday}>
                              {weekdayLabel}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                      <TextField
                        size="small"
                        label="Time"
                        type="time"
                        value={item.deadline?.time ?? ""}
                        disabled={!item.deadline}
                        onChange={(e) => setItemTime(item.id, item.deadline, e.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                        sx={{ minWidth: 110, flex: "1 1 110px" }}
                      />
                    </div>

                    <div style={{ marginTop: 4, display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={index === 0 || saving}
                        onClick={() => void persist(reorderWeeklyChecklistItem(items, item.id, "up"))}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        className={styles.linkButton}
                        disabled={index === items.length - 1 || saving}
                        onClick={() => void persist(reorderWeeklyChecklistItem(items, item.id, "down"))}
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        className={styles.linkButton}
                        style={{ color: "var(--danger)" }}
                        disabled={saving}
                        onClick={() => removeItem(item)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
        <TextField
          size="small"
          placeholder="New item…"
          value={newLabel}
          disabled={atCap}
          inputRef={newLabelRef}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addItem();
          }}
          sx={{ flex: "2 1 140px", minWidth: 130 }}
        />
        <TextField
          select
          size="small"
          label="Schedule"
          value={newDeadlineKind}
          disabled={atCap}
          onChange={(e) => setNewDeadlineKind(e.target.value as NewItemDeadlineKind)}
          sx={{ minWidth: 110, flex: "1 1 110px" }}
        >
          <MenuItem value="recurring">Weekly</MenuItem>
          <MenuItem value="daily">Daily</MenuItem>
          <MenuItem value="monthly">Monthly</MenuItem>
          <MenuItem value="one-off">One-off</MenuItem>
        </TextField>
        {newDeadlineKind === "one-off" ? (
          <TextField
            size="small"
            label="Date"
            type="date"
            value={newDate}
            disabled={atCap}
            onChange={(e) => setNewDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 130, flex: "1 1 130px" }}
          />
        ) : newDeadlineKind === "monthly" ? (
          <TextField
            size="small"
            label="Day of month"
            type="number"
            value={newDayOfMonth}
            disabled={atCap}
            slotProps={{ htmlInput: { min: 1, max: 31 } }}
            onChange={(e) => setNewDayOfMonth(e.target.value === "" ? "" : Number(e.target.value))}
            sx={{ minWidth: 130, flex: "1 1 130px" }}
          />
        ) : newDeadlineKind === "daily" ? (
          // Daily needs no day/date/day-of-month sub-field - selecting it
          // already commits a real daily deadline (see addItem's own
          // comment) - so this slot renders nothing and only the Time field
          // below applies.
          null
        ) : (
          <TextField
            select
            size="small"
            label="Day"
            value={newWeekday}
            disabled={atCap}
            onChange={(e) => setNewWeekday(e.target.value === "" ? "" : Number(e.target.value))}
            sx={{ minWidth: 110, flex: "1 1 110px" }}
          >
            <MenuItem value="">No deadline</MenuItem>
            {WEEKLY_CHECKLIST_WEEKDAY_LABELS.map((weekdayLabel, weekday) => (
              <MenuItem key={weekday} value={weekday}>
                {weekdayLabel}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          size="small"
          label="Time"
          type="time"
          value={newTime}
          disabled={
            atCap ||
            (newDeadlineKind === "recurring"
              ? newWeekday === ""
              : newDeadlineKind === "one-off"
                ? newDate === ""
                : newDeadlineKind === "monthly"
                  ? newDayOfMonth === ""
                  : false) // daily: no prerequisite field, Time is always available
          }
          onChange={(e) => setNewTime(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 110, flex: "1 1 110px" }}
        />
        <Button variant="outlined" size="small" disabled={newLabel.trim() === "" || atCap} onClick={addItem}>
          Add
        </Button>
      </div>
      {atCap && (
        <p className={styles.fieldHint} style={{ margin: "4px 0 0" }}>
          Checklist is full ({WEEKLY_CHECKLIST_MAX_ITEMS} items max).
        </p>
      )}

      {checkedCount > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-color)" }}>
          {resetConfirm ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className={styles.fieldHint} style={{ margin: 0 }}>
                Uncheck all {checkedCount} checked item{checkedCount !== 1 ? "s" : ""}?
              </span>
              <Button size="small" variant="contained" color="error" disabled={saving} onClick={confirmResetAll}>
                Confirm reset
              </Button>
              <Button size="small" variant="text" onClick={() => setResetConfirm(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <button type="button" className={styles.linkButton} onClick={() => setResetConfirm(true)}>
              Reset all ({checkedCount} checked)
            </button>
          )}
        </div>
      )}
      {menu && <span className={tableStyles.cellMenu}>{menu}</span>}
    </td>
  );
}
