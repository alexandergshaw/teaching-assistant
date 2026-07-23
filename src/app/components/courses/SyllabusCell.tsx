"use client";

// The syllabus scalar column's cell editor: pick a saved syllabus, preview/
// download the linked one, pull from LMS/import, or upload a file directly
// (SyllabusUploadControl, from the syllabus-upload feature).
import { useState } from "react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import type { Course } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import { SyllabusUploadControl } from "./SyllabusUploadControl";
import styles from "../../page.module.css";

export interface SyllabusCellProps {
  course: Course;
  syllabi: FinalizedSyllabusMeta[];
  onSave: (rawValue: string) => Promise<boolean | null>;
  onPreview: (course: Course) => void;
  onDownload: (course: Course) => void;
  previewBusy: boolean;
  downloadBusy: boolean;
  canLms: boolean;
  canImport: boolean;
  busy: boolean;
  onFromLms: (course: Course) => void;
  onFromImport: (course: Course) => void;
  onUploaded: (syllabusId: string) => void;
}

export default function SyllabusCell({
  course,
  syllabi,
  onSave,
  onPreview,
  onDownload,
  previewBusy,
  downloadBusy,
  canLms,
  canImport,
  busy,
  onFromLms,
  onFromImport,
  onUploaded,
}: SyllabusCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(course.syllabusId ?? "");
  const [saving, setSaving] = useState(false);

  const syllabusName = course.syllabusId ? syllabi.find((s) => s.id === course.syllabusId)?.name ?? "Linked syllabus" : null;

  const startEdit = () => {
    setDraft(course.syllabusId ?? "");
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
      <td style={{ minWidth: 160 }}>
        <div onClick={startEdit} title="Click to edit" style={{ cursor: "pointer" }}>
          {syllabusName ? (
            <span className={styles.courseResourceValue}>{syllabusName}</span>
          ) : (
            <span className={styles.courseResourceEmpty}>Not linked</span>
          )}
        </div>
        <div className={styles.courseResourceActions}>
          {syllabusName && (
            <>
              <button type="button" className={styles.linkButton} onClick={() => onPreview(course)} disabled={previewBusy}>
                {previewBusy ? "Opening…" : "Preview"}
              </button>
              <button type="button" className={styles.linkButton} onClick={() => onDownload(course)} disabled={downloadBusy}>
                {downloadBusy ? "Downloading…" : "Download"}
              </button>
            </>
          )}
          {canLms && (
            <button type="button" className={styles.linkButton} disabled={busy} onClick={() => onFromLms(course)}>
              {busy ? "Loading..." : "From LMS"}
            </button>
          )}
          {canImport && (
            <button type="button" className={styles.linkButton} disabled={busy} onClick={() => onFromImport(course)}>
              {busy ? "Loading..." : "From import"}
            </button>
          )}
        </div>
      </td>
    );
  }

  return (
    <td data-cell-editing="true" style={{ minWidth: 220 }}>
      <div className={styles.tileEditor}>
        <TextField select size="small" fullWidth value={draft} onChange={(e) => setDraft(e.target.value)}>
          <MenuItem value="">No syllabus linked</MenuItem>
          {syllabi.map((s) => (
            <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
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
        <p className={styles.fieldHint} style={{ margin: "6px 0 0 0" }}>Or upload a file to save and link a new one directly:</p>
        <SyllabusUploadControl
          courseId={course.id}
          onUploaded={(syllabusId) => {
            onUploaded(syllabusId);
            setDraft(syllabusId);
            setEditing(false);
          }}
        />
      </div>
    </td>
  );
}
