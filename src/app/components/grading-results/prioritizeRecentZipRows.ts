import type { GradeRow } from "./gradingResultsHelpers";
/** Stable partition by exact trusted admission indices; never infer identity from names. */
export function prioritizeRecentZipRows(rows: readonly GradeRow[], indices: ReadonlySet<number> | undefined, sourceIndex: (row: GradeRow) => number | undefined): GradeRow[] {
  if (!indices?.size) return [...rows];
  const recent: GradeRow[] = [], earlier: GradeRow[] = [];
  for (const row of rows) { const index = sourceIndex(row); if (index !== undefined && indices.has(index)) recent.push(row); else earlier.push(row); }
  return [...recent, ...earlier];
}
