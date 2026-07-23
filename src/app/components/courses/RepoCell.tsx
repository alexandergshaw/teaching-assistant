"use client";

// Codebases column cell - ported from the row-expansion "Codebases" card
// (formerly RowDetailRepos): an autocomplete add row plus a free-text
// owner/repo#branch-per-line textarea. Saving triggers the same background
// topic-extraction side effect the tile save path used (see
// useInlineFieldSave). The editor is moved verbatim; the compact display is
// new - a count plus the first repo, truncated, instead of the full list of
// links the card used to show.
import { useState } from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Autocomplete from "@mui/material/Autocomplete";
import type { Course } from "@/lib/supabase/courses";
import { reposToText } from "@/lib/courses-tab-helpers";
import { truncateForCell } from "@/lib/courses-table-helpers";
import styles from "../../page.module.css";

export interface RepoCellProps {
  course: Course;
  ownedRepos: string[] | null;
  onSave: (rawValue: string) => Promise<boolean | null>;
}

export default function RepoCell({ course, ownedRepos, onSave }: RepoCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [addSel, setAddSel] = useState("");
  const [addBranch, setAddBranch] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(reposToText(course));
    setAddSel("");
    setAddBranch("");
    setEditing(true);
  };

  const commit = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  if (editing) {
    return (
      <td data-cell-editing="true" style={{ minWidth: 260 }}>
        <div className={styles.tileEditor}>
          <Autocomplete
            freeSolo
            options={ownedRepos ?? []}
            value={addSel}
            onInputChange={(_, v) => setAddSel(v)}
            sx={{ width: "100%" }}
            renderInput={(params) => <TextField {...params} size="small" label="Add repository" placeholder="owner/name" />}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
            <TextField
              size="small"
              label="Branch (optional)"
              placeholder="main"
              value={addBranch}
              onChange={(e) => setAddBranch(e.target.value)}
              sx={{ width: "160px" }}
            />
            <Button
              variant="outlined"
              size="small"
              disabled={!/^[^/\s]+\/[^/\s]+$/.test(addSel.trim())}
              onClick={() => {
                const newLine = `${addSel.trim()}${addBranch.trim() ? `#${addBranch.trim()}` : ""}`;
                setDraft((prev) => (prev.trim() ? `${prev}\n${newLine}` : newLine));
                setAddSel("");
                setAddBranch("");
              }}
            >
              Add
            </Button>
          </div>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={3}
            placeholder="owner/repo#branch"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            sx={{ marginTop: 2 }}
          />
          <p className={styles.fieldHint} style={{ margin: 0 }}>One repository per line: owner/repo or owner/repo#branch.</p>
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

  return (
    <td style={{ minWidth: 220 }}>
      <div className={styles.courseResourceHead}>
        <span className={styles.courseResourceLabel}>Codebase{course.repos.length !== 1 ? "s" : ""}</span>
        <button type="button" className={styles.linkButton} onClick={startEdit}>
          Edit
        </button>
      </div>
      {course.repos.length > 0 ? (
        <span className={styles.courseResourceValue}>
          {course.repos.length} codebase{course.repos.length !== 1 ? "s" : ""} - {truncateForCell(course.repos[0].repo, 40)}
        </span>
      ) : (
        <span className={styles.courseResourceEmpty}>Not set</span>
      )}
    </td>
  );
}
