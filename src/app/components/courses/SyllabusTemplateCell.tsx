"use client";

// The syllabus-template scalar column's cell editor: choose which saved
// syllabus template course.syllabusTemplateId points to. Modelled on the
// SELECT half of SyllabusCell.tsx - read state showing the resolved name,
// click to edit, TextField select over the list plus a "No template"
// option, Save/Cancel. The chosen template id is what the Syllabus cell's
// "Generate" button passes to generateCourseSyllabusAction. The edit state
// also offers an "Upload a template" control (idiom copied from
// SyllabusUploadControl.tsx: useRef file input, busy flag, readFileBase64,
// "error" in result narrowing) so a new .docx can be added without leaving
// the Courses table. A successful upload only sets the pending draft
// selection - Save still persists it, same as every other cell here.
import { useRef, useState } from "react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import type { Course } from "@/lib/supabase/courses";
import type { SyllabusTemplateMeta } from "@/lib/supabase/syllabus-templates";
import { createSyllabusTemplateAction } from "@/app/actions";
import { readFileBase64, templateNameFromFileName } from "@/lib/courses-tab-helpers";
import styles from "../../page.module.css";

export interface SyllabusTemplateCellProps {
  course: Course;
  templates: SyllabusTemplateMeta[];
  onSave: (rawValue: string) => Promise<boolean | null>;
  onTemplateCreated: (template: SyllabusTemplateMeta) => void;
}

export default function SyllabusTemplateCell({ course, templates, onSave, onTemplateCreated }: SyllabusTemplateCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(course.syllabusTemplateId ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const templateName = templates.find((t) => t.id === course.syllabusTemplateId)?.name ?? "Not set";

  const startEdit = () => {
    setDraft(course.syllabusTemplateId ?? "");
    setUploadError(null);
    setEditing(true);
  };

  const commit = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploading(true);

    try {
      const base64 = await readFileBase64(file);
      const name = templateNameFromFileName(file.name);
      const result = await createSyllabusTemplateAction(name, file.name, base64);

      if ("error" in result) {
        setUploadError(result.error);
      } else {
        onTemplateCreated(result.template);
        setDraft(result.template.id);
        setUploadError(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
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
        <p className={styles.fieldHint} style={{ margin: "6px 0 0 0" }}>Or upload a new .docx to add it to the library and select it here:</p>
        <button
          type="button"
          className={styles.linkButton}
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? "Uploading..." : "Upload a template"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ display: "none" }}
        />
        {uploadError && (
          <p className={styles.fieldHint} style={{ margin: "6px 0 0 0", color: "var(--danger)" }}>{uploadError}</p>
        )}
        <div className={styles.tileEditorActions}>
          <Button variant="contained" size="small" disabled={saving || uploading} onClick={() => void commit()}>
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
