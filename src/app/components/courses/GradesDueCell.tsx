"use client";

// The grades-due scalar columns' cell editor: a single CALENDAR DATE (native
// type="date") plus an optional clock time (native type="time") - a one-off
// term deadline for when final grades must be submitted, NOT a recurring
// weekly rule (that shape belongs to AssignmentDueCell.tsx's
// assignment_due_rule). Modelled on AssignmentDueCell.tsx's read/edit shape
// (click to view, click to edit a day/time-shaped pair, Save/Cancel, plus a
// Clear affordance) but with a native date field standing in for
// AssignmentDueCell's weekday select, matching AddCourseForm.tsx's existing
// native type="date" input rather than adding a picker dependency
// (@mui/x-date-pickers is not installed).
//
// Saved through the LMS-cell two-value pattern (see LmsCell.tsx): the date
// is the cell's primary onSave value, the time rides along as `extra` so
// both columns save in the same round trip. Clearing the date also clears
// the time - a time with no date is meaningless (same guard
// AssignmentDueCell/WeeklyChecklistCell apply to their own day/time pairs).
import { useState, type ReactNode } from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import type { Course, CourseInput } from "@/lib/supabase/courses";
import { coerceGradesDueDate, coerceGradesDueTime, describeGradesDue } from "@/lib/grades-due";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

export interface GradesDueCellProps {
  course: Course;
  onSave: (rawValue: string, extra?: Partial<CourseInput>) => Promise<boolean | null>;
  /** F3: the column's hamburger menu, rendered top-right of the display
   * (non-editing) cell only. Undefined renders nothing - purely additive. */
  menu?: ReactNode;
}

export default function GradesDueCell({ course, onSave, menu }: GradesDueCellProps) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);

  const description = describeGradesDue(course.gradesDueDate, course.gradesDueTime);

  const startEdit = () => {
    setDate(coerceGradesDueDate(course.gradesDueDate) ?? "");
    setTime(coerceGradesDueTime(course.gradesDueTime) ?? "");
    setEditing(true);
  };

  const save = async (rawDate: string, rawTime: string) => {
    setSaving(true);
    // A time with no date is meaningless - clearing the date clears the time
    // too, regardless of what is still sitting in the time field.
    const ok = await onSave(rawDate, { gradesDueTime: rawDate ? rawTime || null : null });
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  const commit = () => save(date, time);
  const clear = () => save("", "");

  if (!editing) {
    return (
      <td onClick={startEdit} title="Click to edit" className={tableStyles.clickToEdit} style={{ minWidth: 170 }}>
        <span className={description ? styles.courseResourceValue : styles.courseResourceEmpty}>
          {description || "Not set"}
        </span>
        {menu && <span className={tableStyles.cellMenu}>{menu}</span>}
      </td>
    );
  }

  return (
    <td data-cell-editing="true" style={{ minWidth: 220 }}>
      <div className={styles.tileEditor}>
        <TextField
          size="small"
          fullWidth
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          fullWidth
          label="Time (optional)"
          type="time"
          value={time}
          disabled={!date}
          onChange={(e) => setTime(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <div className={styles.tileEditorActions}>
          <Button variant="contained" size="small" disabled={saving} onClick={() => void commit()}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="text" size="small" disabled={saving} onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button variant="text" size="small" disabled={saving} onClick={() => void clear()}>
            Clear
          </Button>
        </div>
      </div>
    </td>
  );
}
