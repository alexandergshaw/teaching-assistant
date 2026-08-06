"use client";

// The syllabus scalar column's cell editor: pick a saved syllabus, preview/
// download the linked one, pull from LMS/import, upload a file directly
// (SyllabusUploadControl, from the syllabus-upload feature), or generate one
// from the course's chosen syllabus template (the Generate button, which
// reuses generateCourseSyllabusAction - see steps.course-setup.materials.ts's
// starter-materials step for the reference flow this mirrors).
import { useState, type ReactNode } from "react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import type { Course } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import { generateCourseSyllabusAction, createFinalizedSyllabusAction } from "@/app/actions";
import { getStoredProvider } from "@/lib/llm-provider";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { buildSyllabusFactsFromCourse } from "@/lib/syllabus-facts";
import { loadInstitutionFields, type InstitutionField } from "@/lib/institution-fields";
import { useSupabase } from "@/context/SupabaseProvider";
import { SyllabusUploadControl } from "./SyllabusUploadControl";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

/** Describes which facts were blank so the generated syllabus's degraded
 * sections (left as the template's original text) are surfaced to the user
 * rather than silently producing a thinner document. */
function describeGeneratedNote(blankLabels: string[]): string {
  if (blankLabels.length === 0) return "Generated.";
  const joined =
    blankLabels.length === 1
      ? blankLabels[0]
      : `${blankLabels.slice(0, -1).join(", ")} and ${blankLabels[blankLabels.length - 1]}`;
  const verb = blankLabels.length === 1 ? "was" : "were";
  const sections = blankLabels.length === 1 ? "that section" : "those sections";
  return `Generated. ${joined} ${verb} not set for this institution, so ${sections} kept the template's original text.`;
}

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
  /** F3: the column's hamburger menu, rendered top-right of the display
   * (non-editing) cell only. Undefined renders nothing - purely additive. */
  menu?: ReactNode;
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
  menu,
}: SyllabusCellProps) {
  const { supabase, user } = useSupabase();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(course.syllabusId ?? "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateNote, setGenerateNote] = useState<string | null>(null);

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

  const handleGenerate = async () => {
    const templateId = course.syllabusTemplateId;
    if (!user || !templateId) return;
    setGenerating(true);
    setGenerateError(null);
    setGenerateNote(null);
    try {
      let instFields: InstitutionField[] = [];
      try {
        instFields = await loadInstitutionFields(supabase, user.id, course.institution ?? "");
      } catch {
        instFields = [];
      }
      const email = instFields.find((f) => f.id === "email")?.value ?? "";
      const lmsUrl = instFields.find((f) => f.id === "lmsUrl")?.value ?? "";
      const blanks: string[] = [];
      if (!email.trim()) blanks.push("Instructor email");
      if (!lmsUrl.trim()) blanks.push("LMS URL");

      const facts = buildSyllabusFactsFromCourse(course, { email, lmsUrl });
      const result = await generateCourseSyllabusAction(templateId, facts, getStoredProvider());
      if ("error" in result) {
        setGenerateError(result.error);
        return;
      }

      const fileName = buildWorkflowFileName({ course, artifact: "Syllabus", ext: "docx" });
      const saved = await createFinalizedSyllabusAction(result.name, fileName, result.base64, course.courseCode ?? undefined);
      if ("error" in saved) {
        setGenerateError(saved.error);
        return;
      }

      const linked = await onSave(saved.syllabus.id);
      if (linked === false || linked === null) {
        setGenerateError("Generated the syllabus, but could not link it to the course.");
        return;
      }
      onUploaded(saved.syllabus.id);
      setGenerateNote(describeGeneratedNote(blanks));
    } finally {
      setGenerating(false);
    }
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
          <button
            type="button"
            className={styles.linkButton}
            disabled={generating || !course.syllabusTemplateId}
            title={course.syllabusTemplateId ? undefined : "Choose a syllabus template for this course first"}
            onClick={() => void handleGenerate()}
          >
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>
        {!course.syllabusTemplateId && (
          <p className={styles.fieldHint} style={{ margin: "4px 0 0 0" }}>Choose a syllabus template for this course first.</p>
        )}
        {generateError && (
          <p className={styles.fieldHint} style={{ margin: "4px 0 0 0", color: "var(--danger)" }}>{generateError}</p>
        )}
        {generateNote && !generateError && (
          <p className={styles.fieldHint} style={{ margin: "4px 0 0 0" }}>{generateNote}</p>
        )}
        {menu && <span className={tableStyles.cellMenu}>{menu}</span>}
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
