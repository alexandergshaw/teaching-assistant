"use client";

import { useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
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
  const chips = rows.filter((row) => selected.has(row.repo));
  const summary = selectionFilterSummary({ folderScopedCount: rows.length, selectedShownCount: chips.length, showAll });

  return (
    <>
      <div className={styles.gradeSet}>
        <Autocomplete
          multiple
          disableCloseOnSelect
          options={rows}
          value={chips}
          inputValue={text}
          getOptionLabel={(row) => row.repo}
          isOptionEqualToValue={(option, value) => option.repo === value.repo}
          filterOptions={(options, state) => options.filter((row) => rowMatchesQuery(row, state.inputValue)).slice(0, MAX_OPTIONS)}
          onInputChange={(_, value) => setText(value)}
          onChange={(_, _values, reason, details) => {
            if (reason === "clear") onClearSelection();
            else if (details?.option) onToggleRepo(details.option.repo);
          }}
          noOptionsText="No matching repos"
          renderInput={(params) => <TextField {...params} size="small" label="Grade set" placeholder="Add repos to grade (default: all)" slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, "aria-label": "Choose repositories to grade" } }} />}
        />
      </div>
      {summary && (
        <div className={styles.headerFullRow}>
          <span role="status" className={styles.gradeSetStatus}>
            {summary.counterText}
            <Button size="small" onClick={() => onShowAllChange(!showAll)}>{summary.primaryActionLabel}</Button>
            <Button size="small" onClick={onClearSelection}>{summary.secondaryActionLabel}</Button>
          </span>
        </div>
      )}
    </>
  );
}
