// Repo Grades view - AC5 (docs/repo-grades-view-acceptance-criteria.md, items
// 27-32): posting one column's (one Canvas assignment's) worth of grades.
// This is the DANGEROUS half of the feature - it writes to a live gradebook
// through postCanvasGradesAction (src/app/actions/grading.ts:92), which has
// no undo, no audit table and no dry-run - so every decision here is a pure,
// independently-tested function the .tsx only calls and renders, exactly as
// AC6 item 37 requires for anything vitest (node-env, src/**/*.test.ts only,
// no component ever rendered) needs to actually prove.
//
// Two decisions live here, kept deliberately separate because they run at
// different times relative to the network call:
//   - buildRepoGradePostPlan: BEFORE the call. Turns one column's rows into
//     the exact `grades` array postCanvasGradesAction will receive, filtering
//     through repoGradePostability (src/lib/repo-grade-postability.ts) - and
//     ONLY through that predicate, never a second hand-rolled condition, so
//     the button's enabled state (driven by the same plan's `postable.length`)
//     and the actual payload can never disagree (AC5 item 28). This mirrors
//     GradingResults.tsx:301-313's `payload = gradableResults.map(...)`.
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
}

/** One grade actually going out in this call - the exact shape
 * postCanvasGradesAction's `grades` array element takes
 * (src/app/actions/grading.ts:94-98). `comment` is omitted (not sent as an
 * empty string) when blank, matching postCanvasGrades's own "nothing to
 * post for this student" skip logic for an absent field
 * (src/lib/canvas/grades.ts:83-100) - an empty string would still count as
 * "a comment was provided" there. */
export interface RepoGradePostGradeItem {
  userId: number;
  grade: string;
  comment?: string;
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
  assignmentId: string | null
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
    });
    if (!result.postable) {
      skipped.push({ repo: row.repo, reason: result.reason });
      continue;
    }
    const trimmedComment = row.comment.trim();
    postable.push({
      repo: row.repo,
      userId: result.userId,
      grade: {
        userId: result.userId,
        grade: String(result.score),
        ...(trimmedComment ? { comment: trimmedComment } : {}),
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
