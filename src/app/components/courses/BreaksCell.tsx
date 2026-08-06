"use client";

// The breaks column's cell editor: a structured date-range builder (native
// type="date" start/end pickers, an optional label, add/remove rows) that
// writes the canonical "start..end | label" line format (see
// src/lib/course-breaks.ts) - built for as-few-clicks-as-possible entry
// through real date pickers plus validation, replacing hand-typed free text
// as the PRIMARY path while never breaking a course whose breaks column
// already holds prose: any stored value that does not parse cleanly into
// structured ranges falls back to a plain multiline textarea seeded with the
// untouched raw text (never blanked) - the same "kind=multiline" shape
// EditableCell already used for this column before this cell replaced it.
//
// Validation (AC-B3) runs on every draft change and BLOCKS Save while any
// issue is outstanding: end-before-start, outside-the-term (only checked
// when the course has both startDate and endDate set), and overlapping
// breaks. Save is blocked rather than allowed-with-a-warning because these
// values feed generated-artifact prompts (course-facts.ts's
// renderCourseFacts) and any future structured consumer; an inverted or
// overlapping range has no sensible interpretation there, and a "saved with
// a warning" state would still require the instructor to come back and fix
// it - blocking catches the mistake at the moment it is easiest to fix,
// while the picker is still open.
//
// Keyboard-reachable commit: Enter in any row field commits the whole cell
// (mirrors WeeklyChecklistCell's Enter-to-add), Escape cancels - no mouse
// trip to a separate Save button is required to finish editing.
import { useState, type KeyboardEvent, type ReactNode } from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import type { Course } from "@/lib/supabase/courses";
import {
  parseCourseBreaks,
  serializeCourseBreaks,
  validateCourseBreaks,
  describeCourseBreaks,
  type CourseBreakRange,
} from "@/lib/course-breaks";
import { truncateForCell } from "@/lib/courses-table-helpers";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

export interface BreaksCellProps {
  course: Course;
  onSave: (rawValue: string) => Promise<boolean | null>;
  /** F3: the column's hamburger menu, rendered top-right of the display
   * (non-editing) cell only. Undefined renders nothing - purely additive. */
  menu?: ReactNode;
}

function blankRange(): CourseBreakRange {
  return { start: "", end: "", label: "" };
}

export default function BreaksCell({ course, onSave, menu }: BreaksCellProps) {
  const [editing, setEditing] = useState(false);
  // Structured mode: rows is an array (never null while editing structured).
  // Raw fallback mode: rows is null, rawText holds the freeform text.
  const [rows, setRows] = useState<CourseBreakRange[] | null>(null);
  const [rawText, setRawText] = useState("");
  const [saving, setSaving] = useState(false);

  const description = describeCourseBreaks(course.breaks);

  const startEdit = () => {
    const parsed = parseCourseBreaks(course.breaks);
    if (parsed === null) {
      // Legacy free text that does not parse as structured ranges - fall
      // back to editing it as-is, verbatim, never blanked.
      setRows(null);
      setRawText(course.breaks ?? "");
    } else {
      // Seed one blank row immediately when there are none yet, so adding
      // the FIRST break never needs an extra "Add break" click.
      setRows(parsed.length > 0 ? parsed : [blankRange()]);
    }
    setEditing(true);
  };

  const completeRows = (rows ?? []).filter((r) => r.start && r.end);
  const hasIncompleteRow = (rows ?? []).some((r) => (r.start && !r.end) || (!r.start && r.end));
  const issues = rows ? validateCourseBreaks(completeRows, course.startDate, course.endDate) : [];
  const canSave = rows ? issues.length === 0 && !hasIncompleteRow : true;

  const commit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const value = rows ? serializeCourseBreaks(completeRows) : rawText;
    const ok = await onSave(value);
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  const cancel = () => setEditing(false);

  const updateRow = (index: number, patch: Partial<CourseBreakRange>) => {
    setRows((current) => (current ?? []).map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((current) => [...(current ?? []), blankRange()]);
  const removeRow = (index: number) => setRows((current) => (current ?? []).filter((_, i) => i !== index));

  const onRowKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    }
    if (e.key === "Escape") cancel();
  };

  const switchToRawText = () => {
    setRawText(serializeCourseBreaks(completeRows));
    setRows(null);
  };

  if (!editing) {
    return (
      <td onClick={startEdit} title="Click to edit" style={{ cursor: "pointer" }}>
        {description ? (
          <span className={styles.courseResourceValue}>{truncateForCell(description, 60)}</span>
        ) : (
          <span className={styles.courseResourceEmpty}>None</span>
        )}
        {menu && <span className={tableStyles.cellMenu}>{menu}</span>}
      </td>
    );
  }

  return (
    <td data-cell-editing="true" style={{ minWidth: 320 }}>
      <div className={styles.tileEditor}>
        {rows ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <TextField
                    size="small"
                    label="Start"
                    type="date"
                    value={r.start}
                    onChange={(e) => updateRow(i, { start: e.target.value })}
                    onKeyDown={onRowKeyDown}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ minWidth: 140, flex: "1 1 140px" }}
                  />
                  <TextField
                    size="small"
                    label="End"
                    type="date"
                    value={r.end}
                    onChange={(e) => updateRow(i, { end: e.target.value })}
                    onKeyDown={onRowKeyDown}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ minWidth: 140, flex: "1 1 140px" }}
                  />
                  <Button
                    variant="text"
                    size="small"
                    disabled={!r.start}
                    title="Set the end date to match the start date (single-day break)"
                    onClick={() => updateRow(i, { end: r.start })}
                  >
                    Same day
                  </Button>
                  <TextField
                    size="small"
                    label="Label (optional)"
                    value={r.label}
                    onChange={(e) => updateRow(i, { label: e.target.value })}
                    onKeyDown={onRowKeyDown}
                    sx={{ minWidth: 140, flex: "2 1 140px" }}
                  />
                  <Button
                    variant="text"
                    size="small"
                    style={{ color: "var(--danger)" }}
                    disabled={rows.length <= 1}
                    onClick={() => removeRow(i)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <button type="button" className={styles.linkButton} onClick={addRow}>
                Add break
              </button>
            </div>
            {issues.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {issues.map((issue, i) => (
                  <p key={i} className={styles.fieldHint} style={{ margin: "2px 0", color: "var(--danger)" }}>
                    {issue.message}
                  </p>
                ))}
              </div>
            )}
            {hasIncompleteRow && issues.length === 0 && (
              <p className={styles.fieldHint} style={{ margin: "8px 0 0" }}>
                Every break needs both a start and an end date.
              </p>
            )}
            <p className={styles.fieldHint} style={{ margin: "8px 0 0" }}>
              <button type="button" className={styles.linkButton} onClick={switchToRawText}>
                Edit as plain text instead
              </button>
            </p>
          </>
        ) : (
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={3}
            autoFocus
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Week 8 - Spring Break; Nov 27-29 - Thanksgiving"
          />
        )}
        <div className={styles.tileEditorActions}>
          <Button variant="contained" size="small" disabled={saving || !canSave} onClick={() => void commit()}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="text" size="small" disabled={saving} onClick={cancel}>
            Cancel
          </Button>
        </div>
      </div>
    </td>
  );
}
