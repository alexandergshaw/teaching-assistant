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
// Checking/unchecking an item ALSO fires a bounded-cost calendar write
// (AC7): syncChecklistItemCalendarAction pushes just that item's CURRENT
// WEEK's event, never a full-term resync. That write is fire-and-forget
// relative to the checkbox itself - its failure is surfaced as a separate,
// non-fatal notice (setError), never as a revert of the already-saved local
// check. Renaming, re-timing, or removing an item does NOT trigger an
// immediate calendar write; those are picked up by the next full "Sync
// course calendar" run (src/app/actions/course-calendar.ts), same as any
// other tile edit (AC6).
import { useRef, useState } from "react";
import Checkbox from "@mui/material/Checkbox";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import { updateCourseHubAction, syncChecklistItemCalendarAction } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import { courseToInput } from "@/lib/courses-tab-helpers";
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
}

export function WeeklyChecklistCell({ course, onCourseUpdated, setError }: WeeklyChecklistCellProps) {
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

  const items = coerceWeeklyChecklist(course.weeklyChecklist);
  const nowMs = currentTimeMs();
  const checkedCount = countCheckedWeeklyChecklistItems(items);
  const atCap = items.length >= WEEKLY_CHECKLIST_MAX_ITEMS;

  // Persists `next` optimistically: the parent's course list is updated
  // immediately (so every open row reflects the change right away), and
  // reverted back to the pre-mutation `course` - with the error surfaced -
  // if the save fails.
  const persist = async (next: WeeklyChecklistItem[]) => {
    setSaving(true);
    onCourseUpdated({ ...course, weeklyChecklist: next });
    const r = await updateCourseHubAction(course.id, { ...courseToInput(course), weeklyChecklist: next });
    setSaving(false);
    if ("error" in r) {
      onCourseUpdated(course);
      setError(r.error);
      return;
    }
    onCourseUpdated(r.course);
  };

  const toggle = async (item: WeeklyChecklistItem) => {
    await persist(toggleWeeklyChecklistItem(items, item.id, nowMs));
    // AC7: bounded-cost calendar write - just this item's current week's
    // event, never a full resync. The local check already saved above; a
    // failure here is surfaced separately and never undoes it.
    const result = await syncChecklistItemCalendarAction(course.id, item.id, { nowMs });
    if ("error" in result) {
      setError(`Checklist item saved, but the calendar could not be updated: ${result.error}`);
    }
  };

  const startEditLabel = (item: WeeklyChecklistItem) => {
    setEditingLabelId(item.id);
    setDraftLabel(item.label);
  };

  const commitLabel = (id: string) => {
    setEditingLabelId(null);
    if (draftLabel.trim() === "") return;
    void persist(setWeeklyChecklistItemLabel(items, id, draftLabel));
  };

  const setItemWeekday = (id: string, current: WeeklyChecklistDeadline | null, weekday: number | "") => {
    if (weekday === "") {
      void persist(setWeeklyChecklistItemDeadline(items, id, null));
      return;
    }
    void persist(setWeeklyChecklistItemDeadline(items, id, { weekday, time: current?.time ?? null }));
  };

  const setItemTime = (id: string, current: WeeklyChecklistDeadline | null, time: string) => {
    if (!current) return; // a time with no weekday is meaningless - the field is disabled, but this guards a stale event too
    void persist(setWeeklyChecklistItemDeadline(items, id, { weekday: current.weekday, time: time || null }));
  };

  const addItem = () => {
    const label = newLabel.trim();
    if (label === "" || atCap) return;
    const deadline: WeeklyChecklistDeadline | null =
      newWeekday === "" ? null : { weekday: newWeekday, time: newTime || null };
    setNewLabel("");
    void persist(
      addWeeklyChecklistItem(items, { id: crypto.randomUUID(), label, checked: false, checkedAt: null, deadline })
    );
    newLabelRef.current?.focus();
  };

  return (
    <td style={{ minWidth: 280 }}>
      <div className={styles.courseResourceHead}>
        <span className={styles.courseResourceLabel}>Weekly Checklist</span>
      </div>

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
                        onClick={() => void persist(removeWeeklyChecklistItem(items, item.id))}
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
              <Button
                size="small"
                variant="contained"
                color="error"
                disabled={saving}
                onClick={() => {
                  setResetConfirm(false);
                  void persist(resetAllWeeklyChecklistChecks(items));
                }}
              >
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
