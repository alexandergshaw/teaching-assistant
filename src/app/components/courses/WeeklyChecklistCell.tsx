"use client";

// Weekly Checklist column cell: a per-course recurring task list. Modelled on
// MiscFilesCell's collapsed-summary-plus-Popover shape (AC4 - a dense table
// cannot render every item's full editor inline on every row), with the
// two-step destructive-confirm affordance ScheduleCell.tsx uses for
// CSV/rubric removal reused here for "Reset all".
//
// Every mutation persists immediately and optimistically via onCourseUpdated
// (the same full-row-replace callback every cell in this folder uses), and
// reverts to the pre-mutation course - surfacing the error - if the save
// fails. There is no separate "edit mode": the Popover body IS the editor,
// consistent with the four asks (toggle, read label, set/change deadline,
// add) plus remove.
import { useState } from "react";
import Checkbox from "@mui/material/Checkbox";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Popover from "@mui/material/Popover";
import { updateCourseHubAction } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import { courseToInput } from "@/lib/courses-tab-helpers";
import {
  coerceWeeklyChecklist,
  describeWeeklyChecklistDeadline,
  summarizeWeeklyChecklist,
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
} from "@/lib/weekly-checklist";
import styles from "../../page.module.css";

const POPOVER_BODY_STYLE: React.CSSProperties = { padding: 16, width: 380, maxWidth: "90vw" };

// Impure Date.now() read isolated in this tiny top-level helper (mirrors
// urgencyOf in LiveFeedPanel.tsx) so eslint's react-hooks/purity rule - which
// flags a DIRECT Date.now() call inside a component body - reads clean, while
// the cell still shows "is this overdue right now" without waiting for a
// click. weekly-checklist.ts itself stays a pure module; this is the one
// place its `now` parameter is actually sourced from the clock.
function currentTimeMs(): number {
  return Date.now();
}

export interface WeeklyChecklistCellProps {
  course: Course;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
}

export function WeeklyChecklistCell({ course, onCourseUpdated, setError }: WeeklyChecklistCellProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [draftWeekday, setDraftWeekday] = useState(0);
  const [draftTime, setDraftTime] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);

  const items = coerceWeeklyChecklist(course.weeklyChecklist);
  const nowMs = currentTimeMs();
  const summary = summarizeWeeklyChecklist(items, nowMs);
  const checkedCount = countCheckedWeeklyChecklistItems(items);

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

  const closePopover = () => {
    setAnchorEl(null);
    setEditingLabelId(null);
    setEditingDeadlineId(null);
    setNewLabel("");
    setResetConfirm(false);
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

  const startEditDeadline = (item: WeeklyChecklistItem) => {
    setEditingDeadlineId(item.id);
    setDraftWeekday(item.deadline?.weekday ?? 0);
    setDraftTime(item.deadline?.time ?? "");
  };

  const commitDeadline = (id: string) => {
    setEditingDeadlineId(null);
    void persist(setWeeklyChecklistItemDeadline(items, id, { weekday: draftWeekday, time: draftTime || null }));
  };

  const clearDeadline = (id: string) => {
    setEditingDeadlineId(null);
    void persist(setWeeklyChecklistItemDeadline(items, id, null));
  };

  const addItem = () => {
    const label = newLabel.trim();
    if (label === "" || items.length >= WEEKLY_CHECKLIST_MAX_ITEMS) return;
    setNewLabel("");
    void persist(addWeeklyChecklistItem(items, { id: crypto.randomUUID(), label, checked: false, deadline: null }));
  };

  const summaryText = summary.total === 0 ? "No items yet" : `${summary.doneCount}/${summary.total} done`;

  return (
    <td style={{ minWidth: 220 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        <span className={summary.total > 0 ? styles.courseResourceValue : styles.courseResourceEmpty}>
          {summaryText}
        </span>
        {summary.overdueCount > 0 && (
          <span style={{ color: "var(--danger)", fontSize: "0.85em", fontWeight: 600 }}>
            {summary.overdueCount} overdue
          </span>
        )}
        <button type="button" className={styles.linkButton} onClick={(e) => setAnchorEl(e.currentTarget)}>
          {summary.total > 0 ? "Manage" : "Add items"}
        </button>
      </div>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={closePopover}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <div style={POPOVER_BODY_STYLE}>
          <div className={styles.courseResourceHead}>
            <span className={styles.courseResourceLabel}>Weekly Checklist</span>
          </div>

          {items.length === 0 ? (
            <span className={styles.courseResourceEmpty} style={{ marginTop: 8, display: "block" }}>
              No items yet.
            </span>
          ) : (
            <div style={{ marginTop: 12 }}>
              {items.map((item, index) => {
                const overdue = isWeeklyChecklistItemOverdue(item, nowMs);
                return (
                  <div
                    key={item.id}
                    style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--border-color)" }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                      <Checkbox
                        size="small"
                        checked={item.checked}
                        disabled={saving}
                        sx={{ padding: "2px", marginTop: "1px" }}
                        onChange={() => void persist(toggleWeeklyChecklistItem(items, item.id))}
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
                            title="Click to edit"
                            style={{
                              cursor: "pointer",
                              textDecoration: item.checked ? "line-through" : "none",
                              color: item.checked ? "var(--text-secondary)" : undefined,
                            }}
                          >
                            {item.label}
                          </span>
                        )}

                        <div style={{ marginTop: 4, fontSize: "0.85em" }}>
                          {editingDeadlineId === item.id ? (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                              <TextField
                                select
                                size="small"
                                label="Day"
                                value={draftWeekday}
                                onChange={(e) => setDraftWeekday(Number(e.target.value))}
                                sx={{ minWidth: 130 }}
                              >
                                {WEEKLY_CHECKLIST_WEEKDAY_LABELS.map((label, weekday) => (
                                  <MenuItem key={weekday} value={weekday}>
                                    {label}
                                  </MenuItem>
                                ))}
                              </TextField>
                              <TextField
                                size="small"
                                label="Time (optional)"
                                type="time"
                                value={draftTime}
                                onChange={(e) => setDraftTime(e.target.value)}
                                slotProps={{ inputLabel: { shrink: true } }}
                                sx={{ minWidth: 130 }}
                              />
                              <Button size="small" variant="contained" onClick={() => commitDeadline(item.id)}>
                                Save
                              </Button>
                              <Button size="small" variant="text" onClick={() => setEditingDeadlineId(null)}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span className={item.deadline ? styles.courseResourceValue : styles.courseResourceEmpty}>
                                {item.deadline ? describeWeeklyChecklistDeadline(item.deadline) : "No deadline"}
                              </span>
                              {overdue && (
                                <span style={{ color: "var(--danger)", fontWeight: 600 }}>Overdue</span>
                              )}
                              <button type="button" className={styles.linkButton} onClick={() => startEditDeadline(item)}>
                                {item.deadline ? "Change" : "Set deadline"}
                              </button>
                              {item.deadline && (
                                <button type="button" className={styles.linkButton} onClick={() => clearDeadline(item.id)}>
                                  Clear
                                </button>
                              )}
                            </div>
                          )}
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

          <div style={{ marginTop: 12, display: "flex", gap: 6, alignItems: "center" }}>
            <TextField
              size="small"
              fullWidth
              placeholder="New item…"
              value={newLabel}
              disabled={items.length >= WEEKLY_CHECKLIST_MAX_ITEMS}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addItem();
              }}
            />
            <Button
              variant="outlined"
              size="small"
              disabled={newLabel.trim() === "" || items.length >= WEEKLY_CHECKLIST_MAX_ITEMS}
              onClick={addItem}
            >
              Add
            </Button>
          </div>
          {items.length >= WEEKLY_CHECKLIST_MAX_ITEMS && (
            <p className={styles.fieldHint} style={{ margin: "4px 0 0" }}>
              Checklist is full ({WEEKLY_CHECKLIST_MAX_ITEMS} items max).
            </p>
          )}

          {checkedCount > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border-color)" }}>
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
        </div>
      </Popover>
    </td>
  );
}
