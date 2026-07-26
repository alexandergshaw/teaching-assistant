"use client";

// The syllabus-template scalar column's cell editor: choose which saved
// syllabus template course.syllabusTemplateId points to. Modelled on the
// SELECT half of SyllabusCell.tsx - read state showing the resolved name,
// click to edit, TextField select over the list plus a "No template"
// option, Save/Cancel. The chosen template id is what the Syllabus cell's
// "Generate" button passes to generateCourseSyllabusAction.
import { useState } from "react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import type { Course } from "@/lib/supabase/courses";
import type { SyllabusTemplateMeta } from "@/lib/supabase/syllabus-templates";
import styles from "../../page.module.css";

export interface SyllabusTemplateCellProps {
  course: Course;
  templates: SyllabusTemplateMeta[];
  onSave: (rawValue: string) => Promise<boolean | null>;
}

export default function SyllabusTemplateCell({ course, templates, onSave }: SyllabusTemplateCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(course.syllabusTemplateId ?? "");
  const [saving, setSaving] = useState(false);

  const templateName = templates.find((t) => t.id === course.syllabusTemplateId)?.name ?? "Not set";

  const startEdit = () => {
    setDraft(course.syllabusTemplateId ?? "");
    setEditing(true);
  };

  const commit = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  if (!editing) {
    return (
      <td style={{ minWidth: 200 }}>
        <div onClick={startEdit} title="Click to edit" style={{ cursor: "pointer" }}>
          <span className={course.syllabusTemplateId ? styles.courseResourceValue : styles.courseResourceEmpty}>
            {templateName}
          </span>
        </div>
      </td>
    );
  }

  return (
    <td data-cell-editing="true" style={{ minWidth: 220 }}>
      <div className={styles.tileEditor}>
        <TextField select size="small" fullWidth value={draft} onChange={(e) => setDraft(e.target.value)}>
          <MenuItem value="">No template</MenuItem>
          {templates.map((t) => (
            <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
          ))}
        </TextField>
        <div className={styles.tileEditorActions}>
          <Button variant="contained" size="small" disabled={saving} onClick={() => void commit()}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="text" size="small" disabled={saving} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </td>
  );
}
