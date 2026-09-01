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
import { useRef, useState, type ReactNode } from "react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import type { Course } from "@/lib/supabase/courses";
import type { SyllabusTemplateMeta } from "@/lib/supabase/syllabus-templates";
import { createSyllabusTemplateAction } from "@/app/actions";
import { readFileBase64, templateNameFromFileName } from "@/lib/courses-tab-helpers";
import { checkFileWireBudget } from "@/lib/upload-budget";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

export interface SyllabusTemplateCellProps {
  course: Course;
  templates: SyllabusTemplateMeta[];
  onSave: (rawValue: string) => Promise<boolean | null>;
  onTemplateCreated: (template: SyllabusTemplateMeta) => void;
  /** F3: the column's hamburger menu, rendered top-right of the display
   * (non-editing) cell only. Undefined renders nothing - purely additive. */
  menu?: ReactNode;
}

export default function SyllabusTemplateCell({ course, templates, onSave, onTemplateCreated, menu }: SyllabusTemplateCellProps) {
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

    // Reset unconditionally, before anything below can fail - not only on
    // success. A browser only fires "change" when the input's value differs
    // from its last value, so resetting on success alone leaves a same-file
    // retry silent after any failure and the button appears dead.
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setUploadError(null);

    // Client-side, before a single byte is read, and worded to match the
    // server action's own check (src/app/actions/syllabus-templates.ts) so
    // the two can never disagree.
    if (!/\.docx$/i.test(file.name)) {
      setUploadError("The template must be a Word .docx file.");
      return;
    }

    // Client-side, before any bytes are read: this is the fix for the
    // reported crash. A file whose base64 encoding would exceed the
    // platform's request-body cap never reaches the server action at all -
    // the action's promise rejects instead of resolving to {error}, which
    // is what rendered the raw framework string. Refusing here, in FILE
    // bytes (what the user's file manager shows), catches it in the browser
    // instead.
    const sizeCheck = checkFileWireBudget(file.size, "That template");
    if (!sizeCheck.ok) {
      setUploadError(sizeCheck.error ?? "That template is too large to upload.");
      return;
    }

    setUploading(true);

    let base64: string;
    try {
      base64 = await readFileBase64(file);
    } catch (err) {
      // A local FileReader failure (e.g. a corrupt file) never touched the
      // network, so it gets its own message rather than the transport
      // wording below.
      setUploadError(err instanceof Error ? err.message : "Could not read the file.");
      setUploading(false);
      return;
    }

    try {
      const name = templateNameFromFileName(file.name);
      const result = await createSyllabusTemplateAction(name, file.name, base64);

      if ("error" in result) {
        setUploadError(result.error);
      } else {
        onTemplateCreated(result.template);
        setDraft(result.template.id);
        setUploadError(null);
      }
    } catch (err) {
      // The action itself always resolves to {error} on failure (see
      // syllabus-templates.ts) - a REJECTED promise here means the request
      // never reached that code at all, typically the platform turning away
      // an over-budget request the pre-flight above didn't catch. Say that
      // plainly instead of rendering the raw, production-masked framework
      // string ("An error occurred in the Server Components render..."),
      // while still keeping the underlying message visible.
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(`The upload did not reach the server (${msg}). Check your connection and try again.`);
    } finally {
      setUploading(false);
    }
  };

  if (!editing) {
    return (
      <td style={{ minWidth: 200 }}>
        <div onClick={startEdit} title="Click to edit" className={tableStyles.clickToEdit}>
          <span className={course.syllabusTemplateId ? styles.courseResourceValue : styles.courseResourceEmpty}>
            {templateName}
          </span>
        </div>
        {menu && <span className={tableStyles.cellMenu}>{menu}</span>}
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
        <p className={`${styles.fieldHint} ${tableStyles.mt1Only}`}>Or upload a new .docx to add it to the library and select it here:</p>
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
          className={tableStyles.hiddenInput}
        />
        {uploadError && (
          <p className={`${styles.fieldHint} ${tableStyles.mt1Only} ${tableStyles.dangerLink}`}>{uploadError}</p>
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
