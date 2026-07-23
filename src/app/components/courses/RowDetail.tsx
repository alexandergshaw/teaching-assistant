"use client";

// Hosts the structural (non-scalar) editors for one expanded course row:
// codebases, roster, student repos, integrations, description, schedule of
// topics, rubric, materials, and LMS exports. Ported from the tile system's
// per-field cases - same actions, same validation, same copy.
import { useState } from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import type { Course } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import { integrationsToText } from "@/lib/courses-tab-helpers";
import type { TableEditableField } from "@/lib/courses-table-helpers";
import type { UseCourseImportActionsReturn } from "./useCourseImportActions";
import RowDetailRepos from "./RowDetailRepos";
import { RosterSection, StudentReposSection } from "./RowDetailRoster";
import RowDetailSchedule from "./RowDetailSchedule";
import RowDetailFiles from "./RowDetailFiles";
import styles from "../../page.module.css";

export interface RowDetailProps {
  course: Course;
  ownedRepos: string[] | null;
  syllabi: FinalizedSyllabusMeta[];
  saveField: (course: Course, field: TableEditableField, rawValue: string) => Promise<Course | null>;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
  onPreviewCsv: (name: string, csv: string) => void;
  onPreviewRubric: (name: string, rubric: string) => void;
  imports: UseCourseImportActionsReturn;
}

/** A small inline text/multiline editor for a single field, shared by
 * Description and Integrations (each just differ in copy/parsing). */
function TextFieldSection({
  label,
  value,
  emptyLabel,
  placeholder,
  hint,
  onSave,
}: {
  label: string;
  value: string;
  emptyLabel: string;
  placeholder?: string;
  hint?: string;
  onSave: (rawValue: string) => Promise<boolean | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  return (
    <div className={styles.courseResource}>
      <div className={styles.courseResourceHead}>
        <span className={styles.courseResourceLabel}>{label}</span>
        {!editing && (
          <button type="button" className={styles.linkButton} onClick={startEdit}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className={styles.tileEditor}>
          <TextField size="small" fullWidth multiline minRows={3} placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          {hint && <p className={styles.fieldHint} style={{ margin: 0 }}>{hint}</p>}
          <div className={styles.tileEditorActions}>
            <Button variant="contained" size="small" disabled={saving} onClick={() => void commit()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="text" size="small" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : value ? (
        <span className={styles.courseResourceValue}>{value}</span>
      ) : (
        <span className={styles.courseResourceEmpty}>{emptyLabel}</span>
      )}
    </div>
  );
}

export default function RowDetail({
  course,
  ownedRepos,
  saveField,
  onCourseUpdated,
  setError,
  onPreviewCsv,
  onPreviewRubric,
  imports,
}: RowDetailProps) {
  const busy = (field: string) => imports.busyKey === `${course.id}:${field}`;
  const lms = imports.canLms(course);
  const importable = imports.canImport(course);

  return (
    <div className={styles.courseResources} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <RowDetailRepos course={course} ownedRepos={ownedRepos} onSave={(v) => saveField(course, "repos", v).then((result) => result !== null)} />

      <RosterSection
        course={course}
        onSave={(v) => saveField(course, "roster", v).then((result) => result !== null)}
        canLms={lms}
        lmsBusy={busy("roster")}
        fetchLmsRosterDraft={imports.fetchLmsRosterDraft}
      />

      <StudentReposSection course={course} onSave={(v) => saveField(course, "studentRepos", v).then((result) => result !== null)} />

      <TextFieldSection
        label={`Integration${course.integrations.length !== 1 ? "s" : ""}`}
        value={integrationsToText(course)}
        emptyLabel="None"
        placeholder="Cengage | https://..."
        hint="One per line: Name | link (link optional)."
        onSave={(v) => saveField(course, "integrations", v).then((result) => result !== null)}
      />

      <TextFieldSection
        label="Description"
        value={course.description ?? ""}
        emptyLabel="Not set"
        onSave={(v) => saveField(course, "description", v).then((result) => result !== null)}
      />

      <RowDetailSchedule
        course={course}
        onCourseUpdated={onCourseUpdated}
        setError={setError}
        onPreviewCsv={onPreviewCsv}
        onPreviewRubric={onPreviewRubric}
        canLms={lms}
        canImport={importable}
        csvBusy={busy("csv")}
        rubricBusy={busy("rubric")}
        onCsvFromLms={imports.handleLmsCsv}
        onCsvFromImport={imports.handleImportCsv}
        onRubricFromLms={imports.handleLmsRubric}
        onRubricFromImport={imports.handleImportRubric}
      />

      <RowDetailFiles
        course={course}
        onCourseUpdated={onCourseUpdated}
        setError={setError}
        canLms={lms}
        exportBusy={busy("lmsExports")}
        onExportFromLms={imports.handleLmsExport}
      />
    </div>
  );
}
