"use client";

// Weekly Checklist column cell: an inline, always-visible per-course
// recurring task list. Every item's checkbox, label, and deadline controls
// render directly in the cell body - there is no summary-plus-Popover
// gating the view. That WAS the original shape (748d4ae), but the
// instructor explicitly overruled it: "I don't have to click a button/link
// to view them." Viewing every item (checkbox, label, deadline) now costs
// zero clicks; only the lower-traffic editing affordances (rename, reorder,
// remove) stay lightweight per-item controls rather than a whole extra mode.
//
// Deadline controls (a weekday select + a native type="time" input) are
// ALWAYS rendered per item, never gated behind a "Set deadline" click - the
// instructor asked for exactly the day/time pair AssignmentDueCell.tsx
// already uses elsewhere in this table, not a new picker dependency
// (@mui/x-date-pickers is not installed). The add-item row carries the
// identical pair so a deadline can be set in the same pass as creating the
// item: type the label, pick a day, pick a time, press Enter in the label
// field - no second trip to find the new item and edit it afterward. After
// adding, the day/time selection is deliberately kept (checklists tend to
// get several items due the same day) while only the label clears and
// refocuses, so a same-day batch can be typed one after another.
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
// DEBOUNCE: the day/time controls below commit on every onChange (a native
// type="time" input in particular can fire several onChange events for one
// logical edit, e.g. once per hour/minute/AM-PM segment). Pushing a fresh
// calendar write on every one of those would be needless write amplification
// against the same item's SAME occurrences a moment later. Deadline changes
// (setItemWeekday/setItemTime) therefore go through a small trailing-edge
// debounce (createDebouncedKeyedScheduler, CALENDAR_SYNC_DEBOUNCE_MS, keyed
// per item id) that collapses a burst of edits to one calendar push, fired
// once the user stops changing that item's deadline. Every OTHER calendar
// trigger here (add, rename-commit, toggle, remove, reset-all) is already a
// single discrete action (a button click, or a text field that only commits
// on blur/Enter) with no burst to collapse, so those push immediately.
import { useEffect, useRef, useState } from "react";
import Checkbox from "@mui/material/Checkbox";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import { updateCourseHubAction, syncChecklistItemCalendarAction } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import { courseToInput } from "@/lib/courses-tab-helpers";
import { courseCalendarBlockers, type CourseCalendarBlocker } from "@/lib/course-calendar-events";
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
  WEEKLY_CHECKLIST_MAX_ITEMS,
  WEEKLY_CHECKLIST_WEEKDAY_LABELS,
  type WeeklyChecklistItem,
  type WeeklyChecklistDeadline,
} from "@/lib/weekly-checklist";
import styles from "../../page.module.css";

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

export interface WeeklyChecklistCellProps {
  course: Course;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
  /** null while the page's one-time connection check is still in flight -
   * see useCoursesData.ts. Threaded down (rather than checked per cell) so
   * N course rows never make N redundant connection checks. */
  googleCalendarConnected: boolean | null;
}

export function WeeklyChecklistCell({ course, onCourseUpdated, setError, googleCalendarConnected }: WeeklyChecklistCellProps) {
  const [saving, setSaving] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [newLabel, setNewLabel] = useState("");
  // Deliberately NOT reset by addItem (see its comment below): checklist
  // items tend to get added in same-day batches, so the day/time picked for
  // one new item is very likely right for the next one too.
  const [newWeekday, setNewWeekday] = useState<number | "">("");
  const [newTime, setNewTime] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
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
  const checkedCount = countCheckedWeeklyChecklistItems(items);
  const atCap = items.length >= WEEKLY_CHECKLIST_MAX_ITEMS;

  const hasDeadlinedItem = items.some((item) => item.deadline !== null);
  // AC3: only worth surfacing when something would actually try to sync if
  // it weren't blocked - a checklist with no deadlined items has nothing the
  // calendar could show regardless of dates or connection state.
  const calendarBlockers = hasDeadlinedItem ? courseCalendarBlockers(course, googleCalendarConnected) : [];

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

  const setItemWeekday = (id: string, current: WeeklyChecklistDeadline | null, weekday: number | "") => {
    const next: WeeklyChecklistDeadline | null = weekday === "" ? null : { weekday, time: current?.time ?? null };
    void persist(setWeeklyChecklistItemDeadline(items, id, next)).then((ok) => {
      // Covers gaining, losing, or changing a deadline - every case but
      // "stayed null" needs a push (create, delete-cleanup, or update
      // respectively). Debounced: a quick weekday-then-time pick collapses
      // into one push instead of two.
      if (ok && (current !== null || next !== null)) scheduleCalendarSync(id);
    });
  };

  const setItemTime = (id: string, current: WeeklyChecklistDeadline | null, time: string) => {
    if (!current) return; // a time with no weekday is meaningless - the field is disabled, but this guards a stale event too
    void persist(setWeeklyChecklistItemDeadline(items, id, { weekday: current.weekday, time: time || null })).then(
      (ok) => {
        // `current` is non-null here (guarded above), so there is always
        // something on the calendar to update - debounced against the
        // native time input's multi-segment onChange bursts.
        if (ok) scheduleCalendarSync(id);
      }
    );
  };

  const addItem = () => {
    const label = newLabel.trim();
    if (label === "" || atCap) return;
    const deadline: WeeklyChecklistDeadline | null =
      newWeekday === "" ? null : { weekday: newWeekday, time: newTime || null };
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
    // titles can have lost their CHECKLIST_DONE_PREFIX checkmark.
    const affected = items.filter((item) => item.checked && item.deadline !== null).map((item) => item.id);
    void persist(resetAllWeeklyChecklistChecks(items)).then((ok) => {
      if (!ok) return;
      for (const itemId of affected) void runItemCalendarSync(itemId);
    });
  };

  return (
    <td style={{ minWidth: 280 }}>
      <div className={styles.courseResourceHead}>
        <span className={styles.courseResourceLabel}>Weekly Checklist</span>
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
            return (
              <div key={item.id} style={{ paddingBottom: 8, borderBottom: "1px solid var(--border-color)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <Checkbox
                    size="small"
                    checked={item.checked}
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
                          textDecoration: item.checked ? "line-through" : "none",
                          color: item.checked ? "var(--text-secondary)" : undefined,
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
                        label="Day"
                        value={item.deadline?.weekday ?? ""}
                        onChange={(e) =>
                          setItemWeekday(item.id, item.deadline, e.target.value === "" ? "" : Number(e.target.value))
                        }
                        sx={{ minWidth: 110, flex: "1 1 110px" }}
                      >
                        <MenuItem value="">No deadline</MenuItem>
                        {WEEKLY_CHECKLIST_WEEKDAY_LABELS.map((weekdayLabel, weekday) => (
                          <MenuItem key={weekday} value={weekday}>
                            {weekdayLabel}
                          </MenuItem>
                        ))}
                      </TextField>
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
        <TextField
          size="small"
          label="Time"
          type="time"
          value={newTime}
          disabled={atCap || newWeekday === ""}
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
    </td>
  );
}
