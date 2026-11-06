// RG-SEARCH-STICKY Wave B: the search box's row predicate. A pure,
// browser-safe leaf. Each case-insensitive term can match any of these
// fields: the repo name, the bound student, the DERIVED
// first and last name (the SAME derivation the grid's name cells render, so
// search can never find a name the cell does not show), and the binding state.
// A blank or whitespace-only query matches every row. DISPLAY ONLY: the caller
// uses it to narrow the table body, never a plan, count or Post gate.
import { deriveRepoGradeStudentName } from "./repoGradeStudentName";
import type { RepoGradeRow } from "./repoGradesRows";

export function rowMatchesQuery(row: RepoGradeRow, query: string): boolean {
  if (!query.trim()) return true;
  const { firstName, lastName } = deriveRepoGradeStudentName(row.binding.student, row.binding.studentSortable);
  const fields = [row.repo, row.binding.student ?? "", firstName, lastName, row.binding.state];
  return matchesRepoGradeQuery(query, fields);
}

export function matchesRepoGradeQuery(query: string, fields: readonly (string | null)[]): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const searchable = fields.join(" ").toLowerCase();
  return terms.every((term) => searchable.includes(term));
}
