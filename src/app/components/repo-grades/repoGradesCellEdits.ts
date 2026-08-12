// Repo Grades view - AC4 items 20-21 (docs/repo-grades-view-acceptance-criteria.md):
// the local, in-memory editable state one grid cell carries once grading
// starts - a score, a comment, whether an AI grading call is in flight (and
// its error, if any), and this cell's own post status/message. This is
// deliberately SEPARATE from RepoGradeCell (repoGradesRows.ts) - that type is
// re-derived from the org scan on every render (buildRepoGradeGridModel is
// pure and has no memory of an edit a user just typed), while this state is
// genuinely stateful UI memory that must survive across re-derivations of the
// grid model (e.g. the instructor re-sorting the grid, or the selection Set
// changing) without losing an in-progress edit.
//
// Keyed two levels deep (repo, then folder) rather than by a single composite
// string key - a nested Record makes the "one repo's other folders, and every
// other repo entirely, are untouched by an edit to one cell" guarantee
// visible directly in the data shape rather than relying on a key-collision
// argument, and it is what the sabotage check for this module actually pins:
// editing (repoA, week-1) must never mutate (repoA, week-2) or (repoB,
// week-1).
//
// Pure, no I/O, no React - the .tsx (RepoGradeCellControl.tsx) only calls
// getRepoGradeCellEdit to read and setRepoGradeCellEdit to write, exactly the
// "decide here, render there" split AC6 item 37 requires.

import type { RepoGradePostStatus } from "./repoGradesRows";
// Type-only import (erased at build time - safe from a "use client"-adjacent
// module the same way useRepoGradesData.ts's own header comment documents
// for CanvasAssignmentBrief) - RubricAreaResult is the shape
// gradeRepoAction's GradeResult.rubricAreas carries (src/lib/grade/types.ts),
// re-exported from the src/lib/grade.ts barrel.
import type { RubricAreaResult } from "@/lib/grade";

export interface RepoGradeCellEdit {
  /** Raw, editable score text - typed directly, or seeded by a grading call. */
  score: string;
  /** Raw, editable comment text - same two sources as `score`. */
  comment: string;
  /** True only while an on-demand gradeRepoAction call for this exact cell is
   * in flight - never true on render, matching REGRESSION entries 98 and 101
   * (per-item LLM billing must be an explicit action, never a render side
   * effect). */
  grading: boolean;
  /** The grading call's own error message, or null. Cleared on the next
   * grading attempt or on a successful grade. */
  gradeError: string | null;
  /** This cell's own post status - "idle" until this SPECIFIC cell has been
   * included in a column post attempt at least once. Distinct from a whole
   * column's aggregate posting state (index.tsx's columnPosting), which
   * governs the column's Post/Re-post button's busy state. */
  postStatus: RepoGradePostStatus;
  /** Set only when postStatus is "error" - that failure's own message
   * (fanOutRepoGradePostResult in repoGradesPosting.ts is what produces it). */
  postMessage: string | null;
  /** AC "posting and reflow" A3: the rubric breakdown gradeRepoAction's last
   * successful grading call for this cell returned - [] until this cell has
   * been graded. Set ONLY by a grading call (index.tsx's handleGradeCell),
   * never by a score/comment edit, so it always reflects "what the AI most
   * recently produced," independent of anything the instructor later types.
   * Carried through to the post payload by repoGradesPosting.ts's
   * buildRepoGradePostPlan, gated by `generatedScore` below. */
  rubricAreas: RubricAreaResult[];
  /** AC "posting and reflow" A3: `score` exactly as gradeRepoAction's last
   * successful grading call for this cell produced it (e.g. "18/20") - null
   * until this cell has been graded. Set at the SAME time as `rubricAreas`
   * (and never by onScoreChange), which is what lets a later hand-edit of
   * `score` be told apart from the AI's original output: compare the two via
   * repoGradesPosting.ts's repoGradeScoreWasEdited before trusting
   * `rubricAreas` enough to post it. */
  generatedScore: string | null;
}

/** The state a cell that has never been touched (no grading call, no post
 * attempt, no typed edit) reads as. Exported so both this module's default
 * lookup and its tests share one definition of "untouched". */
export function defaultRepoGradeCellEdit(): RepoGradeCellEdit {
  return {
    score: "",
    comment: "",
    grading: false,
    gradeError: null,
    postStatus: "idle",
    postMessage: null,
    rubricAreas: [],
    generatedScore: null,
  };
}

export type RepoGradeCellEditsByRepo = Readonly<Record<string, Readonly<Record<string, RepoGradeCellEdit>>>>;

export const EMPTY_REPO_GRADE_CELL_EDITS: RepoGradeCellEditsByRepo = {};

/** Reads one cell's edit state, defaulting to `defaultRepoGradeCellEdit()`
 * when this exact (repo, folder) pair has never been written. Never throws -
 * a lookup miss is the normal, expected case for the vast majority of cells
 * in a large grid that no one has interacted with yet. */
export function getRepoGradeCellEdit(edits: RepoGradeCellEditsByRepo, repo: string, folder: string): RepoGradeCellEdit {
  return edits[repo]?.[folder] ?? defaultRepoGradeCellEdit();
}

/**
 * Returns a NEW edits object with exactly one (repo, folder) cell patched -
 * starting from its current value (or the default, if untouched) merged with
 * `patch` - and every other repo's entry, and every OTHER folder under this
 * same repo, carried over UNCHANGED (same object references, so a caller
 * diffing old vs new only sees the one cell that actually changed). Never
 * mutates `edits`.
 */
export function setRepoGradeCellEdit(
  edits: RepoGradeCellEditsByRepo,
  repo: string,
  folder: string,
  patch: Partial<RepoGradeCellEdit>
): RepoGradeCellEditsByRepo {
  const current = getRepoGradeCellEdit(edits, repo, folder);
  return {
    ...edits,
    [repo]: {
      ...(edits[repo] ?? {}),
      [folder]: { ...current, ...patch },
    },
  };
}
