"use client";

// RG-SEARCH-STICKY Wave C: the grade-set typeahead. Controls WHICH repos get
// graded by driving the one selection Set owned by index.tsx: it holds no
// selection state of its own (only transient input text) and persists nothing.
// Toggling goes through the single onToggleRepo callback, the same handler the
// grid checkboxes use. When the selection narrows the table it also renders the
// "Showing N of M" counter with Show-all / Clear controls. Browser-safe imports
// only. Keyboard and ARIA behaviour is a reading claim (nothing renders in tests).
import { useState } from "react";
import Button from "@mui/material/Button";
import type { RepoGradeRow } from "./repoGradesRows";
import { rowMatchesQuery } from "./repoGradesSearch";
import { selectionFilterSummary } from "./repoGradesVisibleRows";
import styles from "./repo-grades.module.css";

const MAX_OPTIONS = 50;

export interface RepoGradesGradeSetTypeaheadProps {
  rows: readonly RepoGradeRow[];
  selected: ReadonlySet<string>;
  onToggleRepo: (repo: string) => void;
  onClearSelection: () => void;
  showAll: boolean;
  onShowAllChange: (value: boolean) => void;
}

export default function RepoGradesGradeSetTypeahead({ rows, selected, onToggleRepo, onClearSelection, showAll, onShowAllChange }: RepoGradesGradeSetTypeaheadProps) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const chips = rows.filter((row) => selected.has(row.repo));
  const matches = rows.filter((row) => rowMatchesQuery(row, text)).slice(0, MAX_OPTIONS);
  const summary = selectionFilterSummary({ folderScopedCount: rows.length, selectedShownCount: chips.length, showAll });
  const listId = "repo-grades-grade-set-listbox";

  return (
    <div className={styles.gradeSet}>
      <label className={styles.headerField}>
        <span className={styles.headerInputLabel}>Grade set</span>
        <input
          type="text"
          role="combobox"
          aria-label="Choose repositories to grade"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className={styles.headerInput}
          placeholder="Add repos to grade (default: all)"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "Enter" && matches[0]) {
              e.preventDefault();
              onToggleRepo(matches[0].repo);
            }
          }}
        />
      </label>
      {open && (
        <ul id={listId} role="listbox" aria-multiselectable="true" className={styles.gradeSetList}>
          {matches.length === 0 && <li className={styles.gradeSetOption}>No matching repos</li>}
          {matches.map((row) => (
            <li
              key={row.repo}
              role="option"
              aria-selected={selected.has(row.repo)}
              className={styles.gradeSetOption}
              onMouseDown={(e) => {
                e.preventDefault();
                onToggleRepo(row.repo);
              }}
            >
              {selected.has(row.repo) ? "Selected: " : ""}
              {row.repo}
            </li>
          ))}
        </ul>
      )}
      {chips.map((row) => (
        <span key={row.repo} className={styles.gradeSetChip}>
          {row.repo}
          <button type="button" className={styles.gradeSetChipRemove} aria-label={`Remove ${row.repo} from the grade set`} onClick={() => onToggleRepo(row.repo)}>
            x
          </button>
        </span>
      ))}
      {summary && (
        <span role="status" className={styles.gradeSetStatus}>
          {summary.counterText}
          <Button size="small" onClick={() => onShowAllChange(!showAll)}>
            {summary.primaryActionLabel}
          </Button>
          <Button size="small" onClick={onClearSelection}>
            {summary.secondaryActionLabel}
          </Button>
        </span>
      )}
    </div>
  );
}
