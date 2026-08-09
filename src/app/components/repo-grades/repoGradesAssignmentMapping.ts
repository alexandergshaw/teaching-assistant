// Repo Grades view - AC5 items 25-26 (docs/repo-grades-view-acceptance-criteria.md):
// the per-column-to-Canvas-assignment mapping. Each grid COLUMN (an assignment
// folder name, union'd across every scanned repo - see repoGradesRows.ts's
// buildRepoGradeColumns) maps to exactly one Canvas assignment, chosen
// EXPLICITLY by the instructor from the listCourseAssignmentsAction picker -
// never inferred from the folder's name resembling an assignment title, since
// a wrong inference here would post a real grade to the wrong Canvas
// assignment with no undo (see repoGradePostability's module header and this
// feature's non-goals list: "No grade undo, no audit table, no dry-run").
//
// Pure, no I/O - mirrors repoGradesRows.ts's split between "decide" (here,
// and in repo-student-bindings.ts) and "render" (RepoGradesGrid.tsx), which
// is required rather than stylistic because vitest is node-env and collects
// only src/**/*.test.ts (AC6 item 37): nothing in a .tsx file is ever
// exercised by a real test.
//
// The mapping is persisted per course (task 1 of the wave brief) as a single
// JSON blob keyed by course id, then by column folder name, under the
// `ta-repo-grades-assignment-map` key (see repoGradesUiState.ts's
// loadAssignmentMapping/persistAssignmentMapping, which own the actual
// localStorage read/write - this module only owns the pure shape and the
// restore-time filtering).
//
// The filtering rule (task 1): "FILTER it on restore against both the
// current columns and the current assignment list, so a renamed folder or a
// deleted assignment cannot leave a stale mapping pointing at the wrong
// thing." Two independent failure modes are guarded here:
//   - A folder that no longer appears among the current scan's columns (the
//     instructor renamed or removed an assignment folder in GitHub) - its
//     mapping entry is meaningless now, since there is no column left to
//     apply it to.
//   - An assignment id that no longer appears in the course's current Canvas
//     assignment list (the assignment was deleted, or the mapping was
//     carried over from a different course entirely) - keeping it would let
//     the postability predicate treat the column as "mapped" when the
//     mapped id is actually dangling, silently failing at post time instead
//     of being visibly unmapped beforehand.

import type { RepoGradeColumn } from "./repoGradesRows";

/** folder name -> Canvas assignment id (string, matching CanvasAssignmentBrief.id
 * - src/lib/canvas/listings.ts:171 stringifies the numeric Canvas id). */
export type RepoGradeAssignmentMap = Readonly<Record<string, string>>;

export const EMPTY_REPO_GRADE_ASSIGNMENT_MAP: RepoGradeAssignmentMap = {};

/**
 * Sets (or, when `assignmentId` is null/blank, clears) one column's mapping.
 * Never mutates `mapping`. Used by the picker's onChange handler - "Choose an
 * assignment..." (the blank option) clears the mapping rather than mapping to
 * an empty string, so a cleared column reads as genuinely unmapped to
 * `repoGradePostability` (which treats a blank/whitespace assignmentId as
 * "no mapping" - src/lib/repo-grade-postability.ts:53-56).
 */
export function setRepoGradeAssignmentMapping(
  mapping: RepoGradeAssignmentMap,
  folder: string,
  assignmentId: string | null
): RepoGradeAssignmentMap {
  const trimmed = (assignmentId ?? "").trim();
  if (!trimmed) {
    if (!(folder in mapping)) return mapping;
    const next = { ...mapping };
    delete next[folder];
    return next;
  }
  if (mapping[folder] === trimmed) return mapping;
  return { ...mapping, [folder]: trimmed };
}

/**
 * Overlays a mapping onto a fresh set of columns (buildRepoGradeColumns
 * always sets `assignmentId: null` - repoGradesRows.ts:118 - since deciding
 * the mapping is explicitly this wave's job, not that pure model-building
 * function's). Returns a NEW array; never mutates `columns`. A folder absent
 * from `mapping` keeps `assignmentId: null`, which is exactly the "not
 * postable, says so" state AC5 item 25 requires for an unmapped column.
 */
export function applyRepoGradeAssignmentMapping(
  columns: readonly RepoGradeColumn[],
  mapping: RepoGradeAssignmentMap
): RepoGradeColumn[] {
  return columns.map((column) => ({
    ...column,
    assignmentId: mapping[column.folder] ?? null,
  }));
}

/**
 * The restore-time filter task 1 requires: drops any entry whose folder is
 * not among `columns`, or whose assignment id is not among `assignments` -
 * either condition alone is enough to drop the entry (a stale folder always
 * gets discarded even if the assignment id still happens to exist in Canvas,
 * because there is no live column to attach it to; a stale assignment id
 * always gets discarded even if the folder still exists, because the mapped
 * assignment is gone). Pure, order-independent, never mutates `mapping`.
 */
export function filterRepoGradeAssignmentMapping(
  mapping: RepoGradeAssignmentMap,
  columns: readonly Pick<RepoGradeColumn, "folder">[],
  assignments: readonly { id: string }[]
): RepoGradeAssignmentMap {
  const validFolders = new Set(columns.map((c) => c.folder));
  const validAssignmentIds = new Set(assignments.map((a) => a.id));
  const next: Record<string, string> = {};
  let changed = false;
  for (const [folder, assignmentId] of Object.entries(mapping)) {
    if (validFolders.has(folder) && validAssignmentIds.has(assignmentId)) {
      next[folder] = assignmentId;
    } else {
      changed = true;
    }
  }
  // Returning the SAME reference when nothing was dropped lets a caller skip
  // a redundant localStorage write (see repoGradesUiState.ts's
  // persistAssignmentMapping call sites in index.tsx) - a cheap, optional
  // optimization, not a correctness requirement, since persisting an
  // identical value is harmless.
  return changed ? next : mapping;
}
