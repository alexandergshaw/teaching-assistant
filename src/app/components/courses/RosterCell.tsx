"use client";

// Roster and Student repos column cells - ported verbatim from the
// row-expansion cards (formerly RowDetailRoster.tsx's RosterSection /
// StudentReposSection): same table editors and view states (stats,
// view/hide preview, copy, From LMS for roster). Only the outer wrapper
// changed, from a card <div> to a table <td>.
//
// 2026-09-01 roster editor UX pass (docs/REGRESSION.md, this feature's own
// entry): the editor used to derive its rows from the saved draft text on
// EVERY keystroke (`rows = rosterToRows(draft)`, written back through
// `rowsToRoster` on every change). That made a row vanish mid-typing the
// instant an un-handled student's name went blank (rowsToRoster's own
// "drop a row with nothing in either field" filter), corrupted any name
// containing "|" (rosterToRows splits on the LAST one), and desynced the
// DOM from React state on a trailing space. The editor now owns its OWN
// row state (`rows`, each with a stable `id` minted once) and serializes
// through `rowsToRoster` exactly once, at Save - `rosterToRows`/
// `rowsToRoster` themselves are UNCHANGED, since REGRESSION 361 pins that
// format as load-bearing for three separate writers.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import type { Course } from "@/lib/supabase/courses";
import {
  rosterStats,
  rosterToRows,
  rowsToRoster,
  rowsToStudentReposText,
  mergeOrgReposIntoStudentRepos,
} from "@/lib/courses-tab-helpers";
import { isValidGithubUsername } from "@/lib/github-usernames";
import { updateEditorRow, removeEditorRow, addEditorRow } from "@/lib/roster-editor-rows";
import { findRosterRowDuplicates, describeRosterDuplicate } from "@/lib/roster-row-checks";
import { parseRosterImportText, formatRosterImportSummary, type RosterImportResult } from "@/lib/roster-import";
import { listOrgReposAction } from "@/app/actions";
import { StudentRepoRoster } from "./StudentRepoRoster";
import { EditableRowList, type EditableRowListColumn } from "./EditableRowList";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";
import rosterEditorStyles from "./RosterEditor.module.css";

interface RosterRow {
  id: string;
  student: string;
  username: string;
}

export interface RosterCellProps {
  course: Course;
  onSave: (rawValue: string) => Promise<boolean | null>;
  canLms: boolean;
  lmsBusy: boolean;
  /** Fetch the LMS roster as a draft string (does not save); null on failure (error is surfaced by the caller). */
  fetchLmsRosterDraft: (course: Course) => Promise<string | null>;
  /** F3: the column's hamburger menu, rendered top-right of the display
   * (non-editing) cell only. Undefined renders nothing - purely additive. */
  menu?: ReactNode;
  /** Template repository picker options for the per-student provisioning
   * panel's settings strip (StudentRepoRoster) - same list RepoCell already
   * uses for the Codebases column's Autocomplete. */
  ownedRepos: string[] | null;
}

function useIdMinter() {
  const counterRef = useRef(0);
  return () => `row-${(counterRef.current += 1)}`;
}

/** role="status" line for a transient one-line message (Copied, a removal
 * announcement, ...) - present and empty in the initial markup, matching
 * the live-region idiom StudentRepoRoster.tsx already uses, and self-clears
 * a few seconds after each write. Kept local to this file (not routed
 * through StudentRepoRoster's own live region) because it concerns entirely
 * different information and is visible even while the roster is collapsed,
 * where StudentRepoRoster is not mounted at all. */
function useTransientNote(clearAfterMs = 4000) {
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), clearAfterMs);
    return () => clearTimeout(t);
  }, [note, clearAfterMs]);
  return [note, setNote] as const;
}

export function RosterCell({ course, onSave, canLms, lmsBusy, fetchLmsRosterDraft, menu, ownedRepos }: RosterCellProps) {
  const mintId = useIdMinter();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [filterSignal, setFilterSignal] = useState(0);
  const [rowSearch, setRowSearch] = useState("");
  const [pendingFocusRowId, setPendingFocusRowId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<RosterImportResult | null>(null);
  const [copyStatus, setCopyStatus] = useState<"" | "copied" | "error">("");
  const [rowNote, setRowNote] = useTransientNote();
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!copyStatus) return;
    const t = setTimeout(() => setCopyStatus(""), 4000);
    return () => clearTimeout(t);
  }, [copyStatus]);

  const seedRows = (text: string) => rosterToRows(text).map((r) => ({ id: mintId(), ...r }));

  const startEdit = () => {
    setRows(seedRows(course.roster ?? ""));
    setImportOpen(false);
    setImportText("");
    setImportPreview(null);
    setEditing(true);
  };

  const pullFromLms = async () => {
    const result = await fetchLmsRosterDraft(course);
    if (result !== null) {
      setRows(seedRows(result));
      setEditing(true);
    }
  };

  const commit = async () => {
    setSaving(true);
    const raw = rowsToRoster(rows.map(({ student, username }) => ({ student, username })));
    const ok = await onSave(raw);
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  const updateRow = (id: string, patch: Partial<RosterRow>) => setRows((prev) => updateEditorRow(prev, id, patch));

  const addRow = () => {
    const id = mintId();
    setRows((prev) => addEditorRow(prev, { id, student: "", username: "" }));
    setPendingFocusRowId(id);
  };

  const removeRow = (id: string) => {
    setRows((prev) => {
      const target = prev.find((r) => r.id === id);
      const label = target ? target.student.trim() || target.username.trim() || "this row" : "this row";
      const { rows: next, focusRowId } = removeEditorRow(prev, id);
      setRowNote(`Removed ${label}'s row.`);
      if (focusRowId) {
        setPendingFocusRowId(focusRowId);
      } else {
        setPendingFocusRowId(null);
        requestAnimationFrame(() => addButtonRef.current?.focus());
      }
      return next;
    });
  };

  const openImportPanel = () => {
    if (!editing) startEdit();
    setImportOpen(true);
    setImportText("");
    setImportPreview(null);
  };

  const applyImport = () => {
    if (!importPreview || importPreview.rows.length === 0) return;
    setRows((prev) => [...prev, ...importPreview.rows.map((r) => ({ id: mintId(), ...r }))]);
    setImportOpen(false);
    setImportText("");
    setImportPreview(null);
  };

  const copyRoster = async () => {
    try {
      await navigator.clipboard.writeText(course.roster ?? "");
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  const duplicates = useMemo(() => findRosterRowDuplicates(rows), [rows]);

  const filteredOrder = useMemo(() => {
    const term = rowSearch.trim().toLowerCase();
    if (!term) return undefined;
    return rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.student.toLowerCase().includes(term) || r.username.toLowerCase().includes(term))
      .map(({ i }) => i);
  }, [rows, rowSearch]);

  const columns: EditableRowListColumn<RosterRow>[] = [
    { key: "student", label: "Student", placeholder: "Smith, John" },
    {
      key: "username",
      label: "GitHub username",
      placeholder: "jsmith-gh",
      width: 150,
      hint: (value) =>
        value.trim() && !isValidGithubUsername(value.trim())
          ? "Not a valid GitHub username - letters, numbers and single hyphens only."
          : null,
    },
  ];

  const hasRoster = Boolean(course.roster && course.roster.trim());
  const stats = hasRoster ? rosterStats(course.roster ?? "") : null;
  const complementCount = stats ? stats.students - stats.withUsernames : 0;

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
          <TextField
            size="small"
            value={rowSearch}
            onChange={(e) => setRowSearch(e.target.value)}
            placeholder="Search students…"
            slotProps={{ htmlInput: { "aria-label": "Search roster rows being edited" } }}
          />
          <EditableRowList<RosterRow>
            rows={rows}
            displayOrder={filteredOrder}
            columns={columns}
            onChangeRow={updateRow}
            onRemoveRow={removeRow}
            labelForRow={(r) => r.student.trim() || r.username.trim()}
            rowExtra={(row, index) => {
              const message = describeRosterDuplicate(row, index, duplicates);
              return message ? <p className={rosterEditorStyles.warningText}>{message}</p> : null;
            }}
            emptyMessage="No students yet."
            focusRowId={pendingFocusRowId}
            onFocusHandled={() => setPendingFocusRowId(null)}
          />
          <p className={styles.fieldHint} role="status" aria-live="polite">
            {rowNote}
          </p>
          <div className={tableStyles.rowSm}>
            <Button ref={addButtonRef} variant="text" size="small" onClick={addRow}>
              Add student
            </Button>
            <Button variant="text" size="small" onClick={openImportPanel}>
              Import list
            </Button>
          </div>
          {importOpen && (
            <div className={tableStyles.stackSm}>
              <TextField
                multiline
                minRows={4}
                size="small"
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  setImportPreview(null);
                }}
                placeholder={'One student per line: "Name | handle", "Name, handle", or "Name" + Tab + "handle"'}
                slotProps={{ htmlInput: { "aria-label": "Paste a student list" } }}
              />
              <div className={tableStyles.rowSm}>
                <Button size="small" variant="outlined" disabled={!importText.trim()} onClick={() => setImportPreview(parseRosterImportText(importText))}>
                  Review
                </Button>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    setImportOpen(false);
                    setImportText("");
                    setImportPreview(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
              {importPreview && (
                <>
                  <p className={styles.fieldHint}>{formatRosterImportSummary(importPreview)}</p>
                  <Button size="small" variant="contained" disabled={importPreview.rows.length === 0} onClick={applyImport}>
                    Add to roster
                  </Button>
                </>
              )}
            </div>
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
      ) : hasRoster && stats ? (
        <>
          <span className={styles.courseResourceValue}>
            {stats.students} student{stats.students === 1 ? "" : "s"}
          </span>{" "}
          {complementCount > 0 ? (
            <button
              type="button"
              className={`${styles.ghBadge} ${styles.ghBadgeWarning} ${rosterEditorStyles.badgeButtonReset}`}
              onClick={() => {
                setExpanded(true);
                setFilterSignal((n) => n + 1);
              }}
            >
              {complementCount} with no GitHub username
            </button>
          ) : (
            <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>all handles present</span>
          )}
          <div className={styles.courseResourceActions}>
            <button type="button" className={styles.linkButton} onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Hide" : "View"}
            </button>
            <button type="button" className={styles.linkButton} onClick={() => void copyRoster()}>
              Copy
            </button>
            {canLms && (
              <button type="button" className={styles.linkButton} disabled={lmsBusy} onClick={() => void pullFromLms()}>
                {lmsBusy ? "Loading…" : "From LMS"}
              </button>
            )}
            <button type="button" className={styles.linkButton} onClick={openImportPanel}>
              Import list
            </button>
          </div>
          <p className={styles.fieldHint} role="status" aria-live="polite">
            {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Could not copy the roster" : ""}
          </p>
          {expanded && <StudentRepoRoster course={course} ownedRepos={ownedRepos} focusUnhandledSignal={filterSignal} />}
        </>
      ) : (
        <>
          <span className={styles.courseResourceEmpty}>Not set</span>
          <div className={styles.courseResourceActions}>
            {canLms && (
              <button type="button" className={styles.linkButton} disabled={lmsBusy} onClick={() => void pullFromLms()}>
                {lmsBusy ? "Loading…" : "From LMS"}
              </button>
            )}
            <button type="button" className={styles.linkButton} onClick={openImportPanel}>
              Import list
            </button>
          </div>
        </>
      )}
      {!editing && menu && <span className={tableStyles.cellMenu}>{menu}</span>}
    </td>
  );
}

interface StudentRepoRow {
  id: string;
  student: string;
  canvasUserId: string;
  repo: string;
}

export interface StudentReposCellProps {
  course: Course;
  onSave: (rawValue: string) => Promise<boolean | null>;
  /** F3: the column's hamburger menu, rendered top-right of the display
   * (non-editing) cell only. Undefined renders nothing - purely additive. */
  menu?: ReactNode;
}

export function StudentReposCell({ course, onSave, menu }: StudentReposCellProps) {
  const mintId = useIdMinter();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<StudentRepoRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [orgPrefix, setOrgPrefix] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullNote, setPullNote] = useState<string | null>(null);
  const [pendingFocusRowId, setPendingFocusRowId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"" | "copied" | "error">("");
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!copyStatus) return;
    const t = setTimeout(() => setCopyStatus(""), 4000);
    return () => clearTimeout(t);
  }, [copyStatus]);

  const startEdit = () => {
    // Reads studentRepos fields directly, WITHOUT a rowsToStudentReposText
    // -> studentReposToRows round trip through "|"-joined text (the format
    // both those helpers stay pinned to, unchanged, per REGRESSION 361) -
    // a student/repo value that itself contains "|" would otherwise be
    // mis-split on seed, same class of defect R1 fixes for the roster
    // editor.
    setRows(
      (course.studentRepos ?? []).map((r) => ({ id: mintId(), student: r.student, canvasUserId: r.canvasUserId ?? "", repo: r.repo }))
    );
    setPullError(null);
    setPullNote(null);
    setEditing(true);
  };

  const commit = async () => {
    setSaving(true);
    const raw = rowsToStudentReposText(rows.map(({ student, canvasUserId, repo }) => ({ student, canvasUserId, repo })));
    const ok = await onSave(raw);
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  const updateRow = (id: string, patch: Partial<StudentRepoRow>) => setRows((prev) => updateEditorRow(prev, id, patch));

  const addRow = () => {
    const id = mintId();
    setRows((prev) => addEditorRow(prev, { id, student: "", canvasUserId: "", repo: "" }));
    setPendingFocusRowId(id);
  };

  const removeRow = (id: string) => {
    setRows((prev) => {
      const { rows: next, focusRowId } = removeEditorRow(prev, id);
      if (focusRowId) {
        setPendingFocusRowId(focusRowId);
      } else {
        setPendingFocusRowId(null);
        requestAnimationFrame(() => addButtonRef.current?.focus());
      }
      return next;
    });
  };

  const githubOrg = (course.githubOrg ?? "").trim();

  const pullFromOrg = async () => {
    if (!githubOrg) return;
    setPulling(true);
    setPullError(null);
    setPullNote(null);
    const result = await listOrgReposAction(githubOrg, orgPrefix.trim() || undefined);
    setPulling(false);
    if ("error" in result) {
      setPullError(result.error);
      return;
    }
    if (result.repos.length === 0) {
      setPullNote(`No repositories found in ${githubOrg}${orgPrefix.trim() ? ` matching "${orgPrefix.trim()}"` : ""}.`);
      return;
    }
    const existingRows = rows.map((r) => ({ student: r.student, canvasUserId: r.canvasUserId || null, repo: r.repo, username: null, email: null }));
    const merged = mergeOrgReposIntoStudentRepos(existingRows, result.repos.map((r) => r.fullName));
    const added = merged.length - existingRows.length;
    const alreadyPresent = result.repos.length - added;
    setRows(merged.map((r) => ({ id: mintId(), student: r.student, canvasUserId: r.canvasUserId ?? "", repo: r.repo })));
    setPullNote(`Added ${added} repo${added === 1 ? "" : "s"}${alreadyPresent > 0 ? ` (${alreadyPresent} already listed)` : ""}.`);
  };

  const columns: EditableRowListColumn<StudentRepoRow>[] = [
    { key: "student", label: "Student", placeholder: "Smith, John" },
    { key: "canvasUserId", label: "Canvas user id", placeholder: "canvas-id", width: 150 },
    { key: "repo", label: "Repo", placeholder: "owner/repo" },
  ];

  const hasRepos = course.studentRepos && course.studentRepos.length > 0;

  const copyStudentRepos = async () => {
    try {
      await navigator.clipboard.writeText(course.studentRepos.map((r) => `${r.student} -> ${r.repo}`).join("\n"));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

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
          <EditableRowList<StudentRepoRow>
            rows={rows}
            columns={columns}
            onChangeRow={updateRow}
            onRemoveRow={removeRow}
            labelForRow={(r) => r.student.trim() || r.repo.trim()}
            emptyMessage="No student repos yet."
            focusRowId={pendingFocusRowId}
            onFocusHandled={() => setPendingFocusRowId(null)}
          />
          <div>
            <Button ref={addButtonRef} variant="text" size="small" onClick={addRow}>
              Add student
            </Button>
          </div>
          <div className={tableStyles.editorRow}>
            <TextField
              size="small"
              value={orgPrefix}
              onChange={(e) => setOrgPrefix(e.target.value)}
              sx={{ flex: 1 }}
              placeholder="Name filter (optional)"
              disabled={!githubOrg}
            />
            <button
              type="button"
              className={styles.linkButton}
              disabled={pulling || !githubOrg}
              title={githubOrg ? undefined : "Set the course's Organization first"}
              onClick={() => void pullFromOrg()}
            >
              {pulling ? "Pulling…" : "Pull repos from org"}
            </button>
          </div>
          {!githubOrg && <p className={styles.fieldHint}>Set the course&apos;s Organization first.</p>}
          {pullError && <p className={`${styles.fieldHint} ${tableStyles.dangerLink}`}>{pullError}</p>}
          {pullNote && !pullError && <p className={styles.fieldHint}>{pullNote}</p>}
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
            <button type="button" className={styles.linkButton} onClick={() => void copyStudentRepos()}>
              Copy
            </button>
          </div>
          <p className={styles.fieldHint} role="status" aria-live="polite">
            {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Could not copy the roster" : ""}
          </p>
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
      {!editing && menu && <span className={tableStyles.cellMenu}>{menu}</span>}
    </td>
  );
}
