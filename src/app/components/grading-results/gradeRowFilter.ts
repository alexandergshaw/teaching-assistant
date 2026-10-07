import type { GradeRow } from "./gradingResultsHelpers";

// Local substring-filter predicate. DELIBERATELY not imported from
// recording/discussion-table-view: that import would extend the
// grading-results client-bundle closure into recording leaves. The normalize
// mirrors recording's normalizeForMatch (discussion-capture.ts) so match
// semantics are identical: lowercase, drop apostrophes, fold every other
// non-alphanumeric to a space, collapse runs, trim.
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The match-field haystack: the result values, not the instructor's edits.
export const GRADE_ROW_HAYSTACK = (row: GradeRow): string[] => [
  row.student,
  row.totalScore,
  row.overallComment,
  row.strengths,
  row.improvements,
  row.resubmitNotice,
];

export function filterGradeRowsForTable(
  rows: ReadonlyArray<GradeRow>,
  query: string,
): GradeRow[] {
  const normalizedQuery = normalizeForMatch(query);
  // Empty/whitespace query returns the input array BY REFERENCE, not a copy.
  if (!normalizedQuery) {
    return rows as GradeRow[];
  }
  return rows.filter((row) =>
    GRADE_ROW_HAYSTACK(row).some((field) => normalizeForMatch(field).includes(normalizedQuery)),
  );
}
