"use client";

// Roster and Student repos column cells - ported verbatim from the
// row-expansion cards (formerly RowDetailRoster.tsx's RosterSection /
// StudentReposSection): same table editors and view states (stats,
// view/hide preview, copy, From LMS for roster). Only the outer wrapper
// changed, from a card <div> to a table <td>.
import { useState } from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import type { Course } from "@/lib/supabase/courses";
import {
  rosterStats,
  rosterToRows,
  rowsToRoster,
  studentReposToRows,
  rowsToStudentReposText,
} from "@/lib/courses-tab-helpers";
import styles from "../../page.module.css";

export interface RosterCellProps {
  course: Course;
  onSave: (rawValue: string) => Promise<boolean | null>;
  canLms: boolean;
  lmsBusy: boolean;
  /** Fetch the LMS roster as a draft string (does not save); null on failure (error is surfaced by the caller). */
  fetchLmsRosterDraft: (course: Course) => Promise<string | null>;
}

export function RosterCell({ course, onSave, canLms, lmsBusy, fetchLmsRosterDraft }: RosterCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const startEdit = () => {
    setDraft(course.roster ?? "");
    setEditing(true);
  };

  const pullFromLms = async () => {
    const result = await fetchLmsRosterDraft(course);
    if (result !== null) {
      setDraft(result);
      setEditing(true);
    }
  };

  const commit = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  const rows = rosterToRows(draft);
  const setRows = (next: Array<{ student: string; username: string }>) => setDraft(rowsToRoster(next));
  const updateRow = (i: number, patch: Partial<{ student: string; username: string }>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const hasRoster = Boolean(course.roster && course.roster.trim());
  const stats = hasRoster ? rosterStats(course.roster ?? "") : null;

  return (
    <td style={{ minWidth: 220 }}>
      <div className={styles.courseResourceHead}>
        <span className={styles.courseResourceLabel}>Roster</span>
        {!editing && (
          <button type="button" className={styles.linkButton} onClick={startEdit}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className={styles.tileEditor}>
          <div style={{ display: "flex", gap: 6 }}>
            <span className={styles.ghMeta} style={{ flex: 1 }}>Student</span>
            <span className={styles.ghMeta} style={{ width: 150 }}>GitHub username</span>
            <span style={{ width: 24 }} />
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <TextField size="small" value={r.student} onChange={(e) => updateRow(i, { student: e.target.value })} sx={{ flex: 1 }} placeholder="Smith, John" />
                <TextField size="small" value={r.username} onChange={(e) => updateRow(i, { username: e.target.value })} sx={{ width: 150 }} placeholder="jsmith-gh" />
                <button type="button" className={styles.linkButton} title="Remove student" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} style={{ width: 24, color: "var(--danger)" }}>
                  x
                </button>
              </div>
            ))}
            {rows.length === 0 && <p className={styles.fieldHint} style={{ margin: 0 }}>No students yet.</p>}
          </div>
          <div>
            <Button variant="text" size="small" onClick={() => setRows([...rows, { student: "New student", username: "" }])}>
              Add student
            </Button>
          </div>
          <div className={styles.tileEditorActions}>
            <Button variant="contained" size="small" disabled={saving} onClick={() => void commit()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="text" size="small" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : hasRoster && stats ? (
        <>
          <span className={styles.courseResourceValue}>
            {stats.students} students{stats.withUsernames > 0 ? ` - ${stats.withUsernames} with GitHub usernames` : ""}
          </span>
          <div className={styles.courseResourceActions}>
            <button type="button" className={styles.linkButton} onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Hide" : "View"}
            </button>
            <button type="button" className={styles.linkButton} onClick={() => void navigator.clipboard.writeText(course.roster ?? "")}>
              Copy
            </button>
            {canLms && (
              <button type="button" className={styles.linkButton} disabled={lmsBusy} onClick={() => void pullFromLms()}>
                {lmsBusy ? "Loading..." : "From LMS"}
              </button>
            )}
          </div>
          {expanded && (
            <div className={styles.rosterPreview}>
              {(course.roster ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <span className={styles.courseResourceEmpty}>Not set</span>
          {canLms && (
            <div className={styles.courseResourceActions}>
              <button type="button" className={styles.linkButton} disabled={lmsBusy} onClick={() => void pullFromLms()}>
                {lmsBusy ? "Loading..." : "From LMS"}
              </button>
            </div>
          )}
        </>
      )}
    </td>
  );
}

export interface StudentReposCellProps {
  course: Course;
  onSave: (rawValue: string) => Promise<boolean | null>;
}

export function StudentReposCell({ course, onSave }: StudentReposCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const startEdit = () => {
    setDraft(rowsToStudentReposText((course.studentRepos ?? []).map((r) => ({ student: r.student, canvasUserId: r.canvasUserId ?? "", repo: r.repo }))));
    setEditing(true);
  };

  const commit = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  const rows = studentReposToRows(draft);
  const setRows = (next: Array<{ student: string; canvasUserId: string; repo: string }>) => setDraft(rowsToStudentReposText(next));
  const updateRow = (i: number, patch: Partial<{ student: string; canvasUserId: string; repo: string }>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const hasRepos = course.studentRepos && course.studentRepos.length > 0;

  return (
    <td style={{ minWidth: 220 }}>
      <div className={styles.courseResourceHead}>
        <span className={styles.courseResourceLabel}>Student repos</span>
        {!editing && (
          <button type="button" className={styles.linkButton} onClick={startEdit}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className={styles.tileEditor}>
          <div style={{ display: "flex", gap: 6 }}>
            <span className={styles.ghMeta} style={{ flex: 1 }}>Student</span>
            <span className={styles.ghMeta} style={{ width: 150 }}>Canvas user id</span>
            <span className={styles.ghMeta} style={{ flex: 1 }}>Repo</span>
            <span style={{ width: 24 }} />
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <TextField size="small" value={r.student} onChange={(e) => updateRow(i, { student: e.target.value })} sx={{ flex: 1 }} placeholder="Smith, John" />
                <TextField size="small" value={r.canvasUserId} onChange={(e) => updateRow(i, { canvasUserId: e.target.value })} sx={{ width: 150 }} placeholder="canvas-id" />
                <TextField size="small" value={r.repo} onChange={(e) => updateRow(i, { repo: e.target.value })} sx={{ flex: 1 }} placeholder="owner/repo" />
                <button type="button" className={styles.linkButton} title="Remove student" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} style={{ width: 24, color: "var(--danger)" }}>
                  x
                </button>
              </div>
            ))}
            {rows.length === 0 && <p className={styles.fieldHint} style={{ margin: 0 }}>No student repos yet.</p>}
          </div>
          <div>
            <Button variant="text" size="small" onClick={() => setRows([...rows, { student: "New student", canvasUserId: "", repo: "" }])}>
              Add student
            </Button>
          </div>
          <div className={styles.tileEditorActions}>
            <Button variant="contained" size="small" disabled={saving} onClick={() => void commit()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="text" size="small" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : hasRepos ? (
        <>
          <span className={styles.courseResourceValue}>
            {course.studentRepos.length} student{course.studentRepos.length > 1 ? "s" : ""} with repo{course.studentRepos.length > 1 ? "s" : ""}
          </span>
          <div className={styles.courseResourceActions}>
            <button type="button" className={styles.linkButton} onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Hide" : "View"}
            </button>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => void navigator.clipboard.writeText(course.studentRepos.map((r) => `${r.student} -> ${r.repo}`).join("\n"))}
            >
              Copy
            </button>
          </div>
          {expanded && (
            <div className={styles.rosterPreview}>
              {course.studentRepos.map((r, i) => (
                <div key={i}>{`${r.student} -> ${r.repo}`}</div>
              ))}
            </div>
          )}
        </>
      ) : (
        <span className={styles.courseResourceEmpty}>No student repos yet</span>
      )}
    </td>
  );
}
