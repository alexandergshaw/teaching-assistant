// Pure helper for RunInputTable.tsx's per-row selection checkbox aria-label
// (A2 of the workflows/lecture UX audit) - every checkbox in that table used
// to render with no accessible name at all, so a screen reader announced
// "checkbox, unchecked" with no idea whose row it toggles, on the table used
// to approve grades before they post to Canvas.
//
// Kept pure (columns + one row in, a label string out) so it is
// unit-testable with frozen literals - vitest.config.ts is node-env only.
import type { RunInputColumn } from "./run-input-types";

/** A short human-identifying label for one row, in preference order:
 * (1) a column literally named "student" (the common case for every
 *     grade-review table - see steps.grading-run.ts/steps.grading-draft-
 *     flow.ts's own `columns` arrays), when it has a value;
 * (2) the first non-link column with a value (a `link` column like
 *     "Submission" holds a URL, not an identifying label, so it is skipped);
 * (3) the row's own 1-based position, so a checkbox is NEVER left unlabeled
 *     even for a table shape this function does not specifically recognize.
 */
export function describeRunInputRow(
  columns: RunInputColumn[],
  row: Record<string, string>,
  rowIndex: number
): string {
  const studentCol = columns.find((c) => c.key === "student");
  const studentVal = studentCol ? (row[studentCol.key] ?? "").trim() : "";
  if (studentVal) return studentVal;

  const firstLabeled = columns.find((c) => !c.link && (row[c.key] ?? "").trim());
  if (firstLabeled) return (row[firstLabeled.key] ?? "").trim();

  return `row ${rowIndex + 1}`;
}
