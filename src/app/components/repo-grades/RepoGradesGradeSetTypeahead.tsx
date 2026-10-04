"use client";

// RG-SEARCH-STICKY Wave C: the grade-set typeahead. Controls WHICH repos get
// graded by driving the one selection Set owned by index.tsx: it holds no
// selection state of its own (only transient input text) and persists nothing.
// Toggling goes through the single onToggleRepo callback, the same handler the
// grid checkboxes use. When the selection narrows the table it also renders the
// "Showing N of M" counter with Show-all / Clear controls. Browser-safe imports
// only. Keyboard and ARIA behaviour is a reading claim (nothing renders in tests).
import { useState, type CSSProperties } from "react";
import Button from "@mui/material/Button";
import type { RepoGradeRow } from "./repoGradesRows";
import { rowMatchesQuery } from "./repoGradesSearch";
import { selectionFilterSummary } from "./repoGradesVisibleRows";

const WRAP_STYLE: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)", position: "relative" };
const INPUT_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: 320,
  padding: "var(--space-2) var(--space-3)",
  border: "1px solid var(--field-border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--field-background)",
  color: "var(--text-primary)",
  font: "inherit",
};
const CHIP_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-1)",
  padding: "2px var(--space-2)",
  border: "1px solid var(--field-border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--field-background)",
  color: "var(--text-primary)",
};
const LIST_STYLE: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  zIndex: 5,
  maxHeight: 240,
  overflowY: "auto",
  margin: 0,
  padding: 0,
  listStyle: "none",
  minWidth: 260,
  border: "1px solid var(--field-border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--field-background)",
  color: "var(--text-primary)",
};
const OPTION_STYLE: CSSProperties = { padding: "var(--space-2) var(--space-3)", cursor: "pointer" };
const STATUS_STYLE: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "var(--space-2)" };
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
    <div style={WRAP_STYLE}>
      <input
        type="text"
        role="combobox"
        aria-label="Choose repositories to grade"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        style={INPUT_STYLE}
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
      {open && (
        <ul id={listId} role="listbox" aria-multiselectable="true" style={LIST_STYLE}>
          {matches.length === 0 && <li style={OPTION_STYLE}>No matching repos</li>}
          {matches.map((row) => (
            <li
              key={row.repo}
              role="option"
              aria-selected={selected.has(row.repo)}
              style={OPTION_STYLE}
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
        <span key={row.repo} style={CHIP_STYLE}>
          {row.repo}
          <button type="button" aria-label={`Remove ${row.repo} from the grade set`} onClick={() => onToggleRepo(row.repo)}>
            x
          </button>
        </span>
      ))}
      {summary && (
        <span role="status" style={STATUS_STYLE}>
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
