"use client";

// The Courses-table cell for the course-long project.
//
// This is the ONLY place a project can be edited or cleared by hand - the
// kickoff workflow's step deliberately never clears one, so that a run which
// simply leaves its box empty cannot wipe a plan the whole term depends on.

import { useState, type ReactNode } from "react";
import { Button, TextField, CircularProgress } from "@mui/material";
import {
  generateCourseProjectAction,
  setCourseProjectAction,
} from "@/app/actions";
import { getStoredProvider } from "@/lib/llm-provider";
import { renderCourseFacts } from "@/lib/course-facts";
import {
  coerceCourseProject,
  describeProject,
  emptyCourseProject,
  hasProject,
  renderProjectBrief,
} from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

export function ProjectCell({
  course,
  onCourseUpdated,
  setError,
  onPreview,
  menu,
}: {
  course: Course;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
  /** Opens the shared document window on the project brief. */
  onPreview: (course: Course, name: string, text: string) => void;
  /** F3: the column's hamburger menu, rendered top-right of the display
   * (non-editing) cell only. Undefined renders nothing - purely additive. */
  menu?: ReactNode;
}) {
  const project = course.courseProject;
  const [editing, setEditing] = useState(false);
  const [definition, setDefinition] = useState(project.definition);
  const [busy, setBusy] = useState<"generate" | "clear" | null>(null);

  const weeks = course.weeks;

  const save = async (next: Parameters<typeof setCourseProjectAction>[1]) => {
    const result = await setCourseProjectAction(course.id, next);
    if ("error" in result) {
      setError(result.error);
      return false;
    }
    onCourseUpdated({ ...course, courseProject: coerceCourseProject(next) });
    return true;
  };

  const handleGenerate = async () => {
    const text = definition.trim();
    if (!text) return;
    setBusy("generate");
    setError(null);
    const generated = await generateCourseProjectAction(
      text,
      renderCourseFacts(course),
      weeks ?? 0,
      (course.csvData ?? course.topicOutline ?? "").trim(),
      getStoredProvider()
    );
    if ("error" in generated) {
      setBusy(null);
      setError(generated.error);
      return;
    }
    const ok = await save({
      mode: "course-long",
      name: generated.name,
      definition: text,
      brief: generated.brief,
      briefFileName: "",
      milestones: generated.milestones,
      // Preserve whatever toolset is already committed (project.tools) - this
      // control edits/regenerates the PROJECT's subject and milestones, not
      // the separate tool commitment (ensureCourseTools), so a "Rebuild plan"
      // click must not silently wipe it and force it to be re-chosen.
      tools: project.tools,
      generatedAt: new Date().toISOString(),
    });
    setBusy(null);
    if (ok) setEditing(false);
  };

  const handleClear = async () => {
    setBusy("clear");
    setError(null);
    await save(emptyCourseProject());
    setBusy(null);
    setDefinition("");
    setEditing(false);
  };

  const set = hasProject(project);

  return (
    <td>
      <div className={styles.courseResourceHead}>
        <span className={styles.courseResourceLabel}>Course project</span>
        <span className={set ? styles.courseResourceValue : styles.courseResourceEmpty}>
          {describeProject(project)}
        </span>
      </div>

      <div className={`${tableStyles.rowStart} ${tableStyles.mt1}`}>
        <button type="button" className={styles.linkButton} onClick={() => setEditing((v) => !v)}>
          {editing ? "Close" : set ? "Edit" : "Set up"}
        </button>
        {set && (
          <button
            type="button"
            className={styles.linkButton}
            onClick={() =>
              onPreview(
                course,
                `${course.name} - course project`,
                project.brief.trim() || renderProjectBrief(project)
              )
            }
          >
            Preview
          </button>
        )}
      </div>

      {editing && (
        <div className={`${tableStyles.stackXs} ${tableStyles.mt2}`}>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            label="Course project"
            placeholder="The one project the whole course builds toward"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            disabled={busy !== null}
          />
          <div className={tableStyles.rowSm}>
            <Button
              size="small"
              variant="contained"
              sx={{ textTransform: "none" }}
              disabled={busy !== null || definition.trim() === "" || !weeks}
              // Without a week count there is no defensible number of
              // milestones, so the button explains itself rather than failing.
              title={
                !weeks
                  ? "Set the course's week count first - milestones are placed one per week."
                  : definition.trim() === ""
                    ? "Describe the project first."
                    : undefined
              }
              onClick={() => void handleGenerate()}
            >
              {set ? "Rebuild plan" : "Generate plan"}
            </Button>
            {set && (
              <button
                type="button"
                className={`${styles.linkButton} ${tableStyles.dangerLink}`}
                disabled={busy !== null}
                onClick={() => void handleClear()}
              >
                Clear project
              </button>
            )}
            {busy !== null && (
              <>
                <CircularProgress size={16} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                  {busy === "generate" ? "Generating..." : "Clearing..."}
                </span>
              </>
            )}
          </div>
          {!weeks && (
            <p className={styles.fieldHint}>
              Set the course&apos;s week count first - milestones are placed one per week.
            </p>
          )}
        </div>
      )}
      {menu && <span className={tableStyles.cellMenu}>{menu}</span>}
    </td>
  );
}
