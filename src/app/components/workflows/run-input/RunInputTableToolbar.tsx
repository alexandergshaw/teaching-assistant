"use client";

// DEFECT 3 split - the run-input table's toolbar: search box, grade stats
// bar, distribution bar, "Uncheck invalid"/"Download CSV" actions, and the
// "showing N of M" search hint. Extracted out of RunInputPrompt.tsx's
// ~585-line `table` branch (MECHANICAL only, no behavior change) - mirrors
// the RuntimeFieldInput.tsx family split (RuntimeFieldInputEntityPickers.tsx
// / RuntimeFieldInputTemplates.tsx). RunInputTableSection.tsx owns the state
// this reads/writes and is the only caller.
import { TextField } from "@mui/material";
import type { GradeStats, GradeDistribution, VisibleTableRow } from "../run-input-table-stats";
import { buildReviewTableCsv } from "../run-input-table-stats";
import type { RunInputColumn } from "./run-input-types";
import styles from "../../../page.module.css";

export interface RunInputTableToolbarProps {
  tableHasGrade: boolean;
  columns: RunInputColumn[];
  selectable?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  tableGradeStats: GradeStats | null;
  tableGradeDist: GradeDistribution | null;
  rows: Array<Record<string, string>>;
  tableDisplay: VisibleTableRow[];
  checked: boolean[];
  onUncheckInvalid: () => void;
  csvCell: (value: string) => string;
}

export function RunInputTableToolbar({
  tableHasGrade,
  columns,
  selectable,
  search,
  onSearchChange,
  tableGradeStats,
  tableGradeDist,
  rows,
  tableDisplay,
  checked,
  onUncheckInvalid,
  csvCell,
}: RunInputTableToolbarProps) {
  return (
    <>
      <h3 className={styles.workflowReviewHeading}>
        {tableHasGrade ? "Grade review" : "Review table"}
      </h3>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
        <TextField
          size="small"
          placeholder="Search rows…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          sx={{ width: 220 }}
        />
        {tableGradeStats && (
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--hint-text)" }}>
            {tableGradeStats.avg !== null
              ? `avg ${tableGradeStats.avg.toFixed(1)} - median ${tableGradeStats.median!.toFixed(1)} - min ${tableGradeStats.min} - max ${tableGradeStats.max}`
              : "no valid grades yet"}
            {tableGradeStats.missing > 0 && ` - ${tableGradeStats.missing} without a grade (comment-only)`}
            {tableGradeStats.invalid > 0 && (
              <span style={{ color: "var(--danger)" }}>
                {` - ${tableGradeStats.invalid} invalid grade(s)`}
              </span>
            )}
          </span>
        )}
        {tableGradeDist && (
          <div
            role="img"
            aria-label={`Grade distribution - ${tableGradeDist.ariaLabel}`}
            title={tableGradeDist.ariaLabel}
            style={{
              display: "flex",
              height: 8,
              width: 140,
              borderRadius: "var(--radius-pill)",
              overflow: "hidden",
              background: "var(--surface-subtle)",
              flex: "none",
            }}
          >
            {tableGradeDist.segments
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.band}
                  style={{
                    width: `${(s.count / tableGradeDist.total) * 100}%`,
                    background: `var(--${s.band})`,
                  }}
                />
              ))}
          </div>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)" }}>
          {tableHasGrade && tableGradeStats && tableGradeStats.invalid > 0 && selectable && (
            <button type="button" className={styles.linkButton} onClick={onUncheckInvalid}>
              Uncheck invalid
            </button>
          )}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              const csv = buildReviewTableCsv(columns, tableDisplay, checked, selectable, csvCell);
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "review-table.csv";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
          >
            Download CSV
          </button>
        </span>
      </div>
      {search.trim() && (
        <p className={styles.fieldHint} style={{ margin: "var(--space-2) 0 0 0" }}>
          Showing {tableDisplay.length} of {rows.length} row(s); selection actions and the CSV export cover only the visible rows.
        </p>
      )}
    </>
  );
}
