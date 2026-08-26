// Repo Grades view - AC5 (docs/repo-grades-view-acceptance-criteria.md, items
// 27-32): posting one column's (one Canvas assignment's) worth of grades.
// This is the DANGEROUS half of the feature - it writes to a live gradebook
// through postCanvasGradesAction (src/app/actions/grading.ts:92), which has
// no undo, no audit table and no dry-run - so every decision here is a pure,
// independently-tested function the .tsx only calls and renders, exactly as
// AC6 item 37 requires for anything vitest (node-env, src/**/*.test.ts only,
// no component ever rendered) needs to actually prove.
//
// Three decisions live here, kept deliberately separate because they run at
// different times relative to the network call:
//   - scopeRepoGradeRowsToSelection: BEFORE candidate assembly. Docs
//     repo-grades-posting-and-reflow-acceptance-criteria.md A1: the
//     instructor's checkbox selection (index.tsx's `selected`, a Set of repo
//     full names) must govern which rows a column post even CONSIDERS - a
//     non-empty selection narrows to exactly those repos; an empty selection
//     keeps today's whole-column behaviour. Deliberately separate from
//     postability (below) - a selected repo that turns out not to be
//     postable still flows through to `skipped` with its own reason, rather
//     than silently vanishing as though it had never been selected.
//   - buildRepoGradePostPlan: BEFORE the call. Turns one column's (already
//     selection-scoped) rows into the exact `grades` array
//     postCanvasGradesAction will receive, filtering through
//     repoGradePostability (src/lib/repo-grade-postability.ts) - and ONLY
//     through that predicate, never a second hand-rolled condition, so the
//     button's enabled state (driven by the same plan's `postable.length`)
//     and the actual payload can never disagree (AC5 item 28). This mirrors
//     GradingResults.tsx:301-313's `payload = gradableResults.map(...)`. A3
//     (see repoGradeScoreWasEdited below): a postable row's `rubricAreas` is
//     included only when the instructor has not hand-edited the score away
//     from what gradeRepoAction most recently produced for that cell.
//   - fanOutRepoGradePostResult: AFTER the call resolves. Turns
//     postCanvasGradesAction's `{posted, failures}` (or a whole-request
//     `{error}`) into a per-row status, copying the structure at
//     GradingResults.tsx:336-349: a failure list keyed by userId is turned
//     into a lookup, then every ATTEMPTED row (not every row in the grid -
//     only the ones actually included in this call's payload) is marked
//     "error" with its own message if it appears in that lookup, "posted"
//     otherwise. A whole-request `{error}` marks every attempted row errored
//     with that one message (GradingResults.tsx:326-334).

import { repoGradePostability, type PostabilityInput } from "@/lib/repo-grade-postability";
import { moduleItemContentUrl } from "@/lib/canvas-url";
import type { RepoGradePostStatus, RepoGradeRow } from "./repoGradesRows";
import { getRepoGradeCellEdit, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
// Type-only import (erased at build time - safe from this pure, non-"use
// client" module the same way useRepoGradesData.ts's own header comment
// documents for CanvasAssignmentBrief) - RubricAreaResult is the shape
// gradeRepoAction's GradeResult.rubricAreas carries (src/lib/grade/types.ts),
// re-exported from the src/lib/grade.ts barrel.
import type { RubricAreaResult } from "@/lib/grade";

/**
 * A1 (docs/repo-grades-posting-and-reflow-acceptance-criteria.md): the
 * row-filtering decision behind "the selection governs what gets posted."
 * When `selected` is non-empty, only rows whose `repo` is a member of it are
 * considered for this post attempt at all; when `selected` is empty, every
 * row is considered, matching the pre-existing whole-column behaviour.
 * Generic over any row shape carrying a `repo` field (rather than typed to
 * RepoGradeRow specifically) so it can run BEFORE candidate assembly, on the
 * raw grid rows index.tsx already has - and so a unit test can exercise it
 * with a minimal `{ repo: string }[]` fixture, no full RepoGradeRow shape
 * required. Never mutates `rows`. Deliberately knows nothing about
 * postability: a selected repo whose cell turns out not to be postable still
 * flows through to buildRepoGradePostPlan and lands in `skipped` with its
 * own reason - this function's only job is "is this repo in scope for this
 * post attempt," never "is it postable."
 */
export function scopeRepoGradeRowsToSelection<T extends { repo: string }>(
  rows: readonly T[],
  selected: ReadonlySet<string>
): T[] {
  if (selected.size === 0) return rows.slice();
  return rows.filter((row) => selected.has(row.repo));
}

/**
 * One row's raw inputs for one column's post attempt - everything
 * repoGradePostability needs (PostabilityInput), plus the repo name so the
 * plan/fan-out can key results back to a grid row, plus the comment text
 * (repoGradePostability does not look at the comment - only the score gates
 * postability - but a postable row still carries whatever comment text the
 * instructor typed, so it travels through unchanged to the payload).
 */
export interface RepoGradePostCandidateRow {
  repo: string;
  bindingState: PostabilityInput["bindingState"];
  canvasUserId: PostabilityInput["canvasUserId"];
  folderPresent: boolean;
  score: string;
  comment: string;
  /** A3: the rubric breakdown gradeRepoAction's last successful grading call
   * for this cell returned, or [] when this cell has never been graded (or
   * was graded with no rubric areas). */
  rubricAreas: RubricAreaResult[];
  /** A3: `score` exactly as gradeRepoAction's last successful grading call
   * for this cell produced it (e.g. "18/20"), or null when this cell has
   * never been graded via the "Grade" button. Compared against the CURRENT
   * `score` above by repoGradeScoreWasEdited to decide whether `rubricAreas`
   * is still trustworthy to post. */
  generatedScore: string | null;
}

/** One grade actually going out in this call - the exact shape
 * postCanvasGradesAction's `grades` array element takes
 * (src/app/actions/grading.ts:94-98). `comment` is omitted (not sent as an
 * empty string) when blank, matching postCanvasGrades's own "nothing to
 * post for this student" skip logic for an absent field
 * (src/lib/canvas/grades.ts:83-100) - an empty string would still count as
 * "a comment was provided" there. `rubricAreas` is likewise omitted
 * (never sent as an empty array) whenever there is nothing trustworthy to
 * send - see repoGradeScoreWasEdited. */
export interface RepoGradePostGradeItem {
  userId: number;
  grade: string;
  comment?: string;
  rubricAreas?: Array<{ area: string; score: string; comment: string }>;
}

/**
 * A3 (docs/repo-grades-posting-and-reflow-acceptance-criteria.md): extracts
 * the numeric "earned" portion from a score string in either
 * "earned/possible" form (e.g. "18/20", as gradeRepoAction's totalScore is
 * always shaped - see engine.ts's deriveTotalScore / embedded-grader's own
 * `${earned}/${possible}` construction) or a bare-number form (e.g. "18", as
 * an instructor's hand-typed edit is likely to be). The SAME two-pattern
 * fallback as steps.grading-draft-flow.ts:598-602's `originalGrade` and
 * GradingResults.tsx's own local parseEarnedPoints, duplicated here (neither
 * module exports a standalone version of it) rather than reimplemented from
 * scratch - matching repoGradesRows.ts's naturalCompare precedent for
 * copying a tiny pure helper with a pointer to its source of truth. Returns
 * "" when nothing numeric is found.
 */
function extractEarnedScoreText(scoreText: string): string {
  const fraction = scoreText.match(/(-?\d+(?:\.\d+)?)\s*\/\s*-?\d+/);
  if (fraction) return fraction[1];
  const bare = scoreText.match(/-?\d+(?:\.\d+)?/);
  return bare ? bare[0] : "";
}

/**
 * A3: whether the instructor has hand-edited a cell's score away from what
 * gradeRepoAction most recently produced for it - the precedent at
 * steps.grading-draft-flow.ts:595-625 ("When the reviewer edited the total,
 * the AI's per-criterion breakdown no longer adds up to it - post the total
 * alone rather than a contradictory rubric"), applied here. Compares the
 * EARNED number extracted from each side (via extractEarnedScoreText), not
 * the raw text, so "18/20" (as grading left it) still counts as untouched
 * even though `currentScore` and `generatedScore` are not byte-identical.
 * `generatedScore` null means this cell was never graded via the "Grade"
 * button - there is no rubric this comparison could even be protecting, so
 * that counts as edited too (buildRepoGradePostPlan's caller-side check on
 * `rubricAreas.length > 0` is what actually keeps a never-graded cell from
 * reaching this function with anything to omit in the first place; this
 * still returns `true` defensively rather than assuming that guard is
 * always present upstream).
 */
export function repoGradeScoreWasEdited(currentScore: string, generatedScore: string | null): boolean {
  if (generatedScore === null) return true;
  const current = extractEarnedScoreText(currentScore);
  const generated = extractEarnedScoreText(generatedScore);
  if (current === "" || generated === "") return true;
  return parseFloat(current) !== parseFloat(generated);
}

export interface RepoGradePostPlanItem {
  repo: string;
  userId: number;
  grade: RepoGradePostGradeItem;
}

export interface RepoGradePostPlanSkip {
  repo: string;
  reason: string;
}

export interface RepoGradePostPlan {
  postable: RepoGradePostPlanItem[];
  skipped: RepoGradePostPlanSkip[];
}

/**
 * Assembles one column's candidate rows for buildRepoGradePostPlan below,
 * pairing each grid row's binding state and folder presence (from the
 * derived model in repoGradesRows.ts - never changes without a re-scan) with
 * its CURRENT editable score/comment (from the separate cellEdits state in
 * repoGradesCellEdits.ts, which is what actually changes as the instructor
 * types or grades a cell). This is the ONE place that assembly happens: both
 * a column header's live postable COUNT (RepoGradesGrid.tsx, read-only, for
 * the Post/Re-post button's label and enabled state) and index.tsx's actual
 * post handler (which turns the SAME rows into the real payload) call this
 * function rather than each re-deriving their own candidate list - so the
 * count shown on the button and the rows actually posted can never disagree,
 * the same guarantee AC5 item 28 asks of repoGradePostability itself, one
 * layer further out.
 */
export function repoGradePostCandidateRows(
  rows: readonly RepoGradeRow[],
  edits: RepoGradeCellEditsByRepo,
  folder: string
): RepoGradePostCandidateRow[] {
  return rows.map((row) => {
    const edit = getRepoGradeCellEdit(edits, row.repo, folder);
    return {
      repo: row.repo,
      bindingState: row.binding.state,
      canvasUserId: row.binding.canvasUserId,
      folderPresent: row.cells[folder]?.status === "ungraded",
      score: edit.score,
      comment: edit.comment,
      rubricAreas: edit.rubricAreas,
      generatedScore: edit.generatedScore,
    };
  });
}

/**
 * Builds one column's post plan: every row run through repoGradePostability
 * exactly once, sorted into `postable` (with the numeric userId/score the
 * predicate itself computed - never re-parsed here, so there is exactly one
 * place in the whole feature that turns a score STRING into a score NUMBER)
 * or `skipped` (with that row's own specific reason). `postable.map(p =>
 * p.grade)` is the literal `grades` array to hand postCanvasGradesAction; the
 * enabled state of the column's Post button is `postable.length > 0`, driven
 * by this SAME plan object, so the two can never disagree (AC5 item 28).
 */
export function buildRepoGradePostPlan(
  rows: readonly RepoGradePostCandidateRow[],
  assignmentId: string | null,
  // U12.52 / the fairness fix's other half: the mapped Canvas assignment's
  // own points value, or null when unknown - threaded through to
  // repoGradePostability so a fraction-shaped score (what a fresh AI grade
  // looks like) is scaled onto the assignment's real point total instead of
  // posting an arbitrary generated rubric's raw numerator. Optional, default
  // null, so every existing call site (and this module's own frozen test
  // file, which predates this parameter and calls with exactly two
  // arguments) keeps compiling and keeps behaving identically for bare-number
  // scores, which never consult it at all.
  pointsPossible: number | null = null
): RepoGradePostPlan {
  const postable: RepoGradePostPlanItem[] = [];
  const skipped: RepoGradePostPlanSkip[] = [];
  for (const row of rows) {
    const result = repoGradePostability({
      bindingState: row.bindingState,
      canvasUserId: row.canvasUserId,
      assignmentId,
      folderPresent: row.folderPresent,
      score: row.score,
      pointsPossible,
    });
    if (!result.postable) {
      skipped.push({ repo: row.repo, reason: result.reason });
      continue;
    }
    const trimmedComment = row.comment.trim();
    // A3: only include the rubric breakdown when there IS one and the
    // instructor has not since hand-edited the score away from what
    // produced it - a contradictory rubric is worse than none
    // (steps.grading-draft-flow.ts:595-625's precedent).
    const rubricAreas =
      row.rubricAreas.length > 0 && !repoGradeScoreWasEdited(row.score, row.generatedScore)
        ? row.rubricAreas.map((a) => ({ area: a.area, score: a.score, comment: "" }))
        : undefined;
    postable.push({
      repo: row.repo,
      userId: result.userId,
      grade: {
        userId: result.userId,
        grade: String(result.score),
        ...(trimmedComment ? { comment: trimmedComment } : {}),
        ...(rubricAreas ? { rubricAreas } : {}),
      },
    });
  }
  return { postable, skipped };
}

/** One row's outcome after a post attempt - what a grid cell's post-status
 * fields (RepoGradeCell.postStatus / a companion message) get set to. */
export interface RepoGradePostFanoutResult {
  repo: string;
  postStatus: Extract<RepoGradePostStatus, "posted" | "error">;
  postMessage: string | null;
}

/** The two return shapes postCanvasGradesAction actually produces
 * (src/app/actions/grading.ts:100-102) - declared locally rather than
 * imported so this pure module never imports a "use server" action file
 * (AC6 item 33's boundary is about client code reaching src/lib/github* only
 * through an action, but the same discipline - depend on shapes, not on the
 * action module itself - keeps this file trivially unit-testable with a
 * plain object literal, no server context required). */
export type RepoGradePostActionResult =
  | { posted: number; failures: Array<{ userId: number; error: string }> }
  | { error: string };

/**
 * Fans postCanvasGradesAction's result back out to the specific rows this
 * call attempted (`attempted` - always exactly `plan.postable` from the same
 * buildRepoGradePostPlan call, never the whole grid). Copies
 * GradingResults.tsx:336-349's two-step shape:
 *   1. A whole-request `{error}` (the action itself threw, or requireOwner
 *      rejected, etc.) marks EVERY attempted row "error" with that one
 *      message - none are left "posted" on an unknown outcome.
 *   2. Otherwise, `failures` is turned into a userId -> message Map ONCE,
 *      then every attempted row is looked up by ITS OWN userId: a hit is
 *      "error" with that failure's own message; a miss is "posted". Because
 *      the lookup is keyed by userId and each attempted row supplies its own
 *      userId, one student's failure can never bleed onto a different
 *      student's row - the miss case simply never sees a userId it does not
 *      own.
 * Never mutates `attempted`.
 */
export function fanOutRepoGradePostResult(
  attempted: readonly Pick<RepoGradePostPlanItem, "repo" | "userId">[],
  result: RepoGradePostActionResult
): RepoGradePostFanoutResult[] {
  if ("error" in result) {
    return attempted.map((row) => ({ repo: row.repo, postStatus: "error", postMessage: result.error }));
  }
  const failureByUserId = new Map(result.failures.map((f) => [f.userId, f.error]));
  return attempted.map((row) => {
    const failureMessage = failureByUserId.get(row.userId);
    return failureMessage !== undefined
      ? { repo: row.repo, postStatus: "error", postMessage: failureMessage }
      : { repo: row.repo, postStatus: "posted", postMessage: null };
  });
}

/**
 * Builds the Canvas assignment URL postCanvasGradesAction's `url` parameter
 * needs (it parses `.../courses/<id>/assignments/<id>` via parseCanvasUrl -
 * src/lib/canvas-url.ts:23 - not a bare assignment id) from the course
 * tile's own Canvas course URL plus a mapped assignment id. Reuses
 * moduleItemContentUrl (src/lib/canvas-url.ts:44), the SAME helper the
 * Canvas module-item content-URL problem already solved (see AGENTS memory:
 * canvas-module-item-urls.md) - passing itemType "Assignment" so it builds
 * `<courseUrl base>/assignments/<id>` exactly. Returns null when the course
 * has no parseable `/courses/<id>` URL, or the assignment id is not a
 * plain positive integer (CanvasAssignmentBrief.id is always a stringified
 * numeric id - src/lib/canvas/listings.ts:184 - so a non-numeric value here
 * means the mapping is corrupt, not that the id is merely unfamiliar).
 */
export function repoGradeAssignmentUrl(courseCanvasUrl: string, assignmentId: string): string | null {
  const trimmed = assignmentId.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return moduleItemContentUrl(courseCanvasUrl, "Assignment", Number(trimmed), null);
}
