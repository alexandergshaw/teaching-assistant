"use client";

// The LMS scalar column's cell editor: select (Canvas/Blackboard/Not set) +
// a searchable picker of the institution's connected LMS courses. Ported
// from CoursesTab's tileLmsEditor.
import { useEffect, useState } from "react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import { listCoursesAction } from "@/app/actions";
import type { Course, CourseInput } from "@/lib/supabase/courses";
import { useInstitutionSelection } from "@/lib/institutions";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import Typeahead from "../ui/Typeahead";
import styles from "../../page.module.css";

export interface LmsCellProps {
  course: Course;
  onSave: (rawValue: string, extra?: Partial<CourseInput>) => Promise<boolean | null>;
}

export default function LmsCell({ course, onSave }: LmsCellProps) {
  const { active: activeInstitution } = useInstitutionSelection();
  const [editing, setEditing] = useState(false);
  const [lmsDraft, setLmsDraft] = useState(course.lms ?? "");
  const [canvasUrlDraft, setCanvasUrlDraft] = useState<string | null>(null);
  const [opts, setOpts] = useState<Array<{ url: string; name: string }> | null>(null);
  const [optsError, setOptsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const institution = course.institution || activeInstitution;

  useEffect(() => {
    if (!editing || !institution) return;
    let cancelled = false;
    (async () => {
      const result = await listCoursesAction(institution);
      if (cancelled) return;
      if ("error" in result) {
        setOptsError(result.error);
        setOpts([]);
        return;
      }
      setOpts(result.courses.map((c) => ({ url: `/courses/${c.id}`, name: c.name })));
      setOptsError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, institution]);

  const startEdit = () => {
    setLmsDraft(course.lms ?? "");
    setCanvasUrlDraft(null);
    setOpts(null);
    setOptsError(null);
    setEditing(true);
  };

  const commit = async () => {
    setSaving(true);
    const ok = await onSave(lmsDraft, canvasUrlDraft !== null ? { canvasUrl: canvasUrlDraft || null } : {});
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  if (!editing) {
    return (
      <td onClick={startEdit} title="Click to edit" style={{ cursor: "pointer" }}>
        {course.lms ? (
          <>
            <span className={styles.courseResourceValue}>{course.lms === "canvas" ? "Canvas" : course.lms === "blackboard" ? "Blackboard" : course.lms}</span>
            {course.canvasUrl && (
              course.canvasUrl.startsWith("http") ? (
                <a className={styles.courseResourceValue} href={course.canvasUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "block" }}>
                  Open LMS course
                </a>
              ) : (
                <span className={styles.courseResourceValue} style={{ display: "block" }}>Course {parseCanvasCourseId(course.canvasUrl)} linked</span>
              )
            )}
          </>
        ) : (
          <span className={styles.courseResourceEmpty}>Not set</span>
        )}
      </td>
    );
  }

  const typeaheadOpts = (opts ?? []).map((opt) => ({ value: opt.url, label: opt.name }));
  const rawUrl = canvasUrlDraft ?? (course.canvasUrl ?? "");
  const currentId = rawUrl ? parseCanvasCourseId(rawUrl) : null;
  const matched = currentId ? typeaheadOpts.find((opt) => opt.value === `/courses/${currentId}`) : undefined;
  const currentUrl = matched ? matched.value : rawUrl;
  if (currentUrl && !matched && !typeaheadOpts.some((opt) => opt.value === currentUrl)) {
    typeaheadOpts.push({ value: currentUrl, label: currentUrl });
  }

  return (
    <td data-cell-editing="true" style={{ minWidth: 220 }}>
      <div className={styles.tileEditor}>
        <TextField select size="small" fullWidth value={lmsDraft} onChange={(e) => setLmsDraft(e.target.value)}>
          <MenuItem value="">Not set</MenuItem>
          <MenuItem value="canvas">Canvas</MenuItem>
          <MenuItem value="blackboard">Blackboard</MenuItem>
        </TextField>
        <p className={styles.fieldHint} style={{ margin: "6px 0 0 0" }}>LMS course (optional)</p>
        {institution ? (
          <>
            <Typeahead
              options={typeaheadOpts}
              value={currentUrl}
              onChange={setCanvasUrlDraft}
              placeholder={opts === null ? "Loading courses..." : "Choose a connected course..."}
              loading={opts === null}
              noOptionsText="No connected courses"
            />
            {optsError && <p className={styles.fieldHint} style={{ color: "var(--danger)", margin: "6px 0 0 0" }}>{optsError}</p>}
          </>
        ) : (
          <p className={styles.fieldHint}>Add an institution to pick a connected course.</p>
        )}
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
