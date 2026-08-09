"use client";

// Repo Grades view - AC4 (docs/repo-grades-view-acceptance-criteria.md, items
// 19-24). Rows are student repos, columns are assignment folders (item 19).
// Every decision this component needs (which columns exist, how a repo's
// cells are classified, sort order, binding suggestions) was already made by
// pure, independently-tested functions in repoGradesRows.ts - this file only
// renders what they returned. That split is required, not stylistic: vitest
// is node-env and collects only src/**/*.test.ts (AC6 item 37), so nothing in
// this file is ever exercised by a real test; repoGrades.wiring.test.ts reads
// it as text to confirm the pieces that DO need a behavioral guarantee
// (binding acceptance never firing outside a click) are actually wired the
// way repoGradesRows.test.ts assumes they will be used.
//
// Score/comment/post-status cells are intentionally inert this wave (task 5
// of the wave brief: "leave hooks for the next wave... but do not build
// them") - each cell shows its status as text, with no input and no posting
// affordance yet.
import RepoBindingControl from "./RepoBindingControl";
import type { RepoBindingRosterEntry } from "@/lib/repo-student-bindings";
import type { RepoGradeCellStatus, RepoGradeColumn, RepoGradeRow } from "./repoGradesRows";
import styles from "./repo-grades.module.css";
import pageStyles from "../../page.module.css";

export interface RepoGradesGridProps {
  columns: RepoGradeColumn[];
  rows: RepoGradeRow[];
  roster: RepoBindingRosterEntry[];
  selected: ReadonlySet<string>;
  onToggleSelected: (repo: string) => void;
  onAcceptBinding: (
    repo: string,
    canvasUserId: string,
    student: string,
    username: string | null
  ) => Promise<{ ok: true } | { error: string }>;
}

const CELL_STATUS_TEXT: Record<RepoGradeCellStatus, string> = {
  "missing-folder": "No folder",
  "scan-error": "Unknown - scan failed",
  ungraded: "Not graded yet",
};

function CellStatus({ status }: { status: RepoGradeCellStatus }) {
  const className =
    status === "missing-folder"
      ? styles.cellMissing
      : status === "scan-error"
        ? styles.cellScanError
        : styles.cellUngraded;
  return <span className={className}>{CELL_STATUS_TEXT[status]}</span>;
}

export default function RepoGradesGrid({ columns, rows, roster, selected, onToggleSelected, onAcceptBinding }: RepoGradesGridProps) {
  if (rows.length === 0) {
    return <p className={pageStyles.emptyState}>No repositories matched this org (and prefix filter, if set).</p>;
  }

  return (
    <div className={styles.gridWrap}>
      <table className={styles.grid} role="table">
        <thead>
          <tr>
            <th scope="col" className={styles.selectHeader}>
              <span className={pageStyles.fieldHint}>Select</span>
            </th>
            <th scope="col">Repo</th>
            <th scope="col">Binding</th>
            {columns.map((column) => (
              <th scope="col" key={column.folder}>
                {column.folder}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.repo}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Select ${row.repo}`}
                  checked={selected.has(row.repo)}
                  onChange={() => onToggleSelected(row.repo)}
                />
              </td>
              <td>
                <a href={row.htmlUrl} target="_blank" rel="noopener noreferrer" className={styles.repoLink}>
                  {row.repo}
                </a>
                {row.folderError && <div className={pageStyles.error}>{row.folderError}</div>}
              </td>
              <td>
                <RepoBindingControl row={row} roster={roster} onAcceptBinding={onAcceptBinding} />
              </td>
              {columns.map((column) => (
                <td key={column.folder}>
                  <CellStatus status={row.cells[column.folder].status} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
