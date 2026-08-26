// Repo Grades view - "grade this whole column" bulk run. The instructor's
// own framing of the request this module exists to satisfy: "I should just
// be able to grade what's in a selected assignment dir against the readme
// instructions for all of an org's repos without needing to associate these
// to students." Grading (gradeRepoAction, called per cell by index.tsx's
// handleGradeCell) already needs only a repo and a folder - the binding
// (student association) is a POSTING concern, not a grading one. Today the
// grid only exposes grading one cell per click; this module is every
// DECISION a "grade this whole column" run needs to make before and after
// the actual network calls. The sibling useRepoGradesBulkGrade hook owns the
// awaiting (calling gradeRepoAction with this module's concurrency bound);
// this module owns nothing that touches the network, React state, or the
// clock, matching repoGradesRows.ts / repoGradesPosting.ts's split - vitest
// here is node-env and collects only src/**/*.test.ts, so nothing rendered
// is ever exercised by a test, which is exactly why these decisions have to
// live in a plain function a test can import rather than inline in a
// component.
//
// NO BINDING IS EVER CONSULTED HERE. This module never reads `row.binding`,
// anywhere. Grading a repo's folder against the README needs a repo name and
// a folder name and nothing else - the whole point of the instructor's
// request above is that a bulk grading run must not be gated on, or even
// look at, whether a repo has been matched to a student yet. If a future
// change to this file starts filtering targets on binding state, it has
// silently reintroduced the exact friction the instructor was describing -
// don't do that.
//
// `rows` here is expected to be the grid's rows with each cell's LIVE state
// merged in - repoGradesRows.ts's own header comment documents that
// buildRepoGradeRows always produces a cell with score "" and postStatus
// "idle" (it has no memory of a grading call), and that the real, changing
// per-cell state lives separately in repoGradesCellEdits.ts's
// RepoGradeCellEditsByRepo. This module takes RepoGradeRow rather than a
// second, edits-aware row shape so the caller (the hook) does the one merge
// it already needs for other purposes and hands this module a single
// consistent view; buildBulkGradePlan reads `cell.score` purely as "does
// this cell already have a score" signal (see rule 2 in RULES below), never
// as anything to post - posting is repoGradesPosting.ts's job, not this
// module's.

import type { RepoGradeRow } from "./repoGradesRows";
import { scopeRepoGradeRowsToSelection } from "./repoGradesPosting";

export interface BulkGradeTarget {
  repo: string;
  folder: string;
}

export interface BulkGradePlan {
  /** Repos whose cell for this folder will actually be graded, in grid order. */
  targets: BulkGradeTarget[];
  /** Repos skipped, each with a human reason - never silently dropped. */
  skipped: Array<{ repo: string; reason: string }>;
}

/**
 * Which repos a "grade this whole column" run will touch. `selectionOnly`
 * scopes to the checked rows the same way the posting plan does
 * (scopeRepoGradeRowsToSelection, reused verbatim rather than reimplemented,
 * so the two "which rows are in scope for this run" decisions in the feature
 * can never drift apart) - with nothing checked it means the whole column.
 * When `selectionOnly` is false, the selection Set is ignored entirely: this
 * is the default "grade the whole column regardless of what happens to be
 * checked" behaviour, distinct from "selectionOnly with nothing checked",
 * which happens to produce the same result (the whole column) for a
 * different reason (docs' own framing: "with nothing checked it means the
 * whole column").
 *
 * Grid order is preserved in `targets` - the instructor watches this run
 * against the table in front of them, so a target list that reordered rows
 * would make that impossible to follow.
 */
export function buildBulkGradePlan(input: {
  rows: readonly RepoGradeRow[];
  folder: string;
  selected: ReadonlySet<string>;
  selectionOnly: boolean;
}): BulkGradePlan {
  const { rows, folder, selected, selectionOnly } = input;
  const scoped = selectionOnly ? scopeRepoGradeRowsToSelection(rows, selected) : rows.slice();

  const targets: BulkGradeTarget[] = [];
  const skipped: Array<{ repo: string; reason: string }> = [];

  for (const row of scoped) {
    const cell = row.cells[folder];

    // RULE 1a: a row with no entry for this column's folder at all (should
    // not happen for a folder actually present in the grid model - see
    // repoGradesRows.ts's buildRepoGradeRows, which gives every row an entry
    // for every column - but this function's `folder` argument is caller
    // supplied, so a stale or mistyped folder name must still be handled
    // explicitly rather than crashing on `cell.status`) is treated exactly
    // like "missing-folder" below: there is nothing to grade.
    if (!cell || cell.status === "missing-folder") {
      skipped.push({ repo: row.repo, reason: `no "${folder}" folder in this repo` });
      continue;
    }

    // RULE 1b: this repo's tree fetch failed, so whether the folder even
    // exists is unknown (repoGradesRows.ts's RepoGradeCellStatus comment:
    // "scan-error" must never be conflated with "missing-folder"). Grading
    // needs the folder's actual contents from GitHub, so an unknown-presence
    // repo cannot be graded either - but the reason told to the instructor
    // must say so precisely, not just "no folder", so a stale scan is
    // obviously distinguishable from a genuinely absent folder.
    if (cell.status === "scan-error") {
      skipped.push({ repo: row.repo, reason: "repo scan failed - folder presence unknown" });
      continue;
    }

    // cell.status === "ungraded" is the only remaining member of
    // RepoGradeCellStatus at this point.

    // RULE 1c: a cell that already carries a score is skipped, never
    // re-graded - a bulk run must not silently re-spend model calls on work
    // already done, and must not overwrite a score the instructor may have
    // hand-edited after the fact. See this file's header comment for why
    // `cell.score` (rather than something derived from `row.binding`, which
    // this module never reads) is the right signal here.
    if (cell.score !== "") {
      skipped.push({ repo: row.repo, reason: "already graded" });
      continue;
    }

    targets.push({ repo: row.repo, folder });
  }

  return { targets, skipped };
}

/**
 * How many requests may be in flight at once during a bulk run. This fans
 * out model calls, each of which also ingests a repo folder from GitHub -
 * the existing org scan (scanOrgRepoTrees, src/lib/repo-grade-tree-scan.ts)
 * already bounds its own concurrency for the identical reason (rate limits
 * on both the GitHub side and the model side, plus wall-clock for a large
 * org). Three is a deliberate compromise between wall-clock and both rate
 * limits - lower than the scan's own DEFAULT_TREE_SCAN_CONCURRENCY (5)
 * because a grading call is heavier than a tree fetch.
 */
export const BULK_GRADE_CONCURRENCY = 3;

export interface BulkGradeOutcome {
  repo: string;
  folder: string;
  status: "graded" | "failed";
  /** The score exactly as produced, e.g. "18/20"; "" for a failure. */
  score: string;
  /** Error text for a failure, or the README path actually used on success. */
  detail: string;
}

/**
 * One line for the view's existing aria-live region when the run finishes.
 * RULE 5: this must never claim a total that includes the skipped rows as
 * done, and a run where nothing was actually GRADED - whether because
 * everything was skipped, or every attempted grade failed - must read as
 * "nothing was graded", never as a success, regardless of how many rows the
 * run otherwise touched.
 */
export function bulkGradeSummaryLine(outcomes: readonly BulkGradeOutcome[], plan: BulkGradePlan): string {
  const graded = outcomes.filter((outcome) => outcome.status === "graded").length;
  const failed = outcomes.filter((outcome) => outcome.status === "failed").length;
  const skipped = plan.skipped.length;

  const parts: string[] = [];
  if (graded > 0) parts.push(`${graded} graded`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (skipped > 0) parts.push(`${skipped} skipped`);

  if (graded === 0) {
    return parts.length > 0 ? `Nothing was graded - ${parts.join(", ")}.` : "Nothing was graded.";
  }
  return `Bulk grading finished: ${parts.join(", ")}.`;
}
