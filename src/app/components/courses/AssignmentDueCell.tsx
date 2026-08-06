"use client";

// The assignment-due-rule scalar column's cell editor: a RECURRING rule
// (weekday + time), encoded as one string ("sun|23:59") via
// formatAssignmentDueRule/parseAssignmentDueRule. EditableCell has no
// composite kind (two fields, not one), so this is a small dedicated cell -
// modelled on SyllabusTemplateCell.tsx's read/edit shape: read state shows
// the resolved human description, click to edit, a weekday select + a time
// field, Save/Cancel, plus a Clear affordance that saves "" to remove the
// rule entirely.
import { useState, type ReactNode } from "react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import type { Course } from "@/lib/supabase/courses";
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  parseAssignmentDueRule,
  formatAssignmentDueRule,
  describeAssignmentDueRule,
  type Weekday,
} from "@/lib/assignment-due-rule";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

export interface AssignmentDueCellProps {
  course: Course;
  onSave: (rawValue: string) => Promise<boolean | null>;
  /** F3: the column's hamburger menu, rendered top-right of the display
   * (non-editing) cell only. Undefined renders nothing - purely additive. */
  menu?: ReactNode;
}

// The deadline wiring's existing hardcoded default (Sunday 23:59 - see
// weekDeadline in src/lib/workflows/registry-helpers.ts). Seeding the editor
// with the same default means turning the rule "on" for the first time is a
// no-op relative to today's behavior.
const DEFAULT_DAY: Weekday = "sun";
const DEFAULT_TIME = "23:59";

export default function AssignmentDueCell({ course, onSave, menu }: AssignmentDueCellProps) {
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState<Weekday>(DEFAULT_DAY);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [saving, setSaving] = useState(false);

  const description = describeAssignmentDueRule(course.assignmentDueRule);

  const startEdit = () => {
    const parsed = parseAssignmentDueRule(course.assignmentDueRule);
    setDay(parsed?.day ?? DEFAULT_DAY);
    setTime(parsed?.time ?? DEFAULT_TIME);
    setEditing(true);
  };

  const save = async (rawValue: string) => {
    setSaving(true);
    const ok = await onSave(rawValue);
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  const commit = () => save(formatAssignmentDueRule(day, time));
  const clear = () => save("");

  if (!editing) {
    return (
      <td onClick={startEdit} title="Click to edit" style={{ cursor: "pointer", minWidth: 170 }}>
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
        <TextField select size="small" fullWidth label="Day" value={day} onChange={(e) => setDay(e.target.value as Weekday)}>
          {WEEKDAYS.map((d) => (
            <MenuItem key={d} value={d}>{WEEKDAY_LABELS[d]}</MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          fullWidth
          label="Time"
          type="time"
          value={time}
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
