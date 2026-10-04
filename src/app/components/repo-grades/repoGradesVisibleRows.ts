// RG-SEARCH-STICKY Wave C: which table-body rows are visible. Pure and
// browser-safe. DISPLAY ONLY: the caller feeds the result to the grid body,
// never to a plan, count or Post gate.
import { rowMatchesQuery } from "./repoGradesSearch";
import type { RepoGradeRow } from "./repoGradesRows";

/**
 * `rows` arrives already folder-scoped. The grade set narrows the body only
 * when it selects a non-empty strict subset of the displayed rows; the search
 * query then intersects (AND) with that.
 */
export function visibleRepoRows(
  rows: readonly RepoGradeRow[],
  query: string,
  gradeSet: ReadonlySet<string>
): RepoGradeRow[] {
  const selectedHere = rows.filter((row) => gradeSet.has(row.repo));
  const narrow = selectedHere.length > 0 && selectedHere.length < rows.length;
  const base = narrow ? selectedHere : rows;
  return base.filter((row) => rowMatchesQuery(row, query));
}

export interface SelectionFilterSummary {
  mode: "filtered" | "override";
  counterText: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
}

/** Null when no selection filter is in play (nothing, or everything, selected). */
export function selectionFilterSummary(input: {
  folderScopedCount: number;
  selectedShownCount: number;
  showAll: boolean;
}): SelectionFilterSummary | null {
  const { folderScopedCount, selectedShownCount, showAll } = input;
  if (selectedShownCount <= 0 || selectedShownCount >= folderScopedCount) return null;
  if (showAll) {
    return {
      mode: "override",
      counterText: `Showing all ${folderScopedCount} repos; ${selectedShownCount} selected for grading`,
      primaryActionLabel: "Filter to selection",
      secondaryActionLabel: "Clear selection",
    };
  }
  return {
    mode: "filtered",
    counterText: `Showing ${selectedShownCount} of ${folderScopedCount} repos (grade-set selection)`,
    primaryActionLabel: "Show all rows",
    secondaryActionLabel: "Clear selection",
  };
}
