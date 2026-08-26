"use client";

// Repo Grades view - "grade this whole column" bulk run (the sibling half of
// repoGradesBulkGrade.ts, whose header comment documents the instructor's own
// framing of the request and the RULE that no binding is ever consulted).
// That module owns every DECISION a bulk run needs (which repos are in
// scope, why one was skipped, the summary line); this hook owns the awaiting
// - a bounded-concurrency worker pool over gradeRepoAction, the ONLY network
// call this hook makes, called exactly the way index.tsx's own handleGradeCell
// already calls it per cell (see that function's header comment for why
// `rubricAreas`/`generatedScore` are set only by a grading call, never by a
// hand-edit) so a bulk-graded cell and a one-off-graded cell are
// indistinguishable to every downstream consumer (posting, the activity log,
// repoGradeScoreWasEdited).
//
// Why a worker pool and not Promise.all(plan.targets.map(...)): fanning out
// every target at once would multiply the GitHub-ingest and model rate-limit
// pressure BULK_GRADE_CONCURRENCY exists to bound (see that constant's own
// comment in repoGradesBulkGrade.ts) - a large org could otherwise throw
// dozens of simultaneous ingest+grade calls at both APIs at once. A simple
// cursor over the target list, with BULK_GRADE_CONCURRENCY workers each
// pulling the next index when they finish, keeps at most that many requests
// in flight without pulling in an external dependency.
//
// Why one repo's failure never aborts the run: each worker catches nothing
// itself (gradeRepoAction never throws - it returns `{ error }` on failure,
// exactly like handleGradeCell's own success/failure branch), writes the
// per-cell failure state, records an outcome, and moves on to the next index.
// That per-target isolation is the whole reason this is a pool over a shared
// cursor rather than one `Promise.all` that a single rejection could take
// down.
//
// NO useEffect here. runBulkGrade only ever runs from a real onClick (a
// sibling's button in RepoGradesControls.tsx / RepoGradesGrid.tsx) - every
// setState below happens either synchronously in response to that click or
// after an awaited gradeRepoAction call resolves, so eslint's
// react-hooks/set-state-in-effect rule (AGENTS memory:
// set-state-in-effect-idiom.md) never applies to this file.
import { useState } from "react";
import { gradeRepoAction } from "@/app/actions";
import type { LlmProvider } from "@/lib/llm";
import type { RepoGradeCellEdit } from "./repoGradesCellEdits";
import {
  bulkGradeSummaryLine,
  BULK_GRADE_CONCURRENCY,
  type BulkGradeOutcome,
  type BulkGradePlan,
  type BulkGradeTarget,
} from "./repoGradesBulkGrade";

export interface UseRepoGradesBulkGradeParams {
  /** Grading provider, from the view's existing useLlmProvider(). */
  provider: LlmProvider;
  instructions: string;
  rubric: string;
  useReadmeInstructions: boolean;
  /** Writes one cell's edit - index.tsx's setCellEdits wrapper. Called with
   * the same field shape handleGradeCell already writes. */
  onCellUpdate: (repo: string, folder: string, patch: Partial<RepoGradeCellEdit>) => void;
  /** Appends activity-log entries - index.tsx's recordLog/buildLogEntry pair. */
  onOutcomes: (outcomes: readonly BulkGradeOutcome[]) => void;
  /** One line into the view's EXISTING role="status" region. Never add a
   * second. */
  onAnnounce: (message: string) => void;
}

export interface RubricAttemptResult {
  rubricUsed: string | null;
}

/**
 * Pure retry algorithm behind the U12.50 sequential rubric-setup prologue
 * below, pulled out of the hook so it can be unit-tested without rendering
 * (this project's vitest runs in the "node" environment with no jsdom/
 * @testing-library/react - see vitest.config.ts and the precedent in
 * caption-studio-wiring.structure.test.ts).
 *
 * Tries `targets` one at a time, in order, via `attempt`, until `attempt`
 * returns a non-null `rubricUsed` or every target has been tried once. A
 * failed attempt (`rubricUsed: null` - gradeRepoAction never throws, it
 * returns `{ error }`, see gradeOneTarget below) must not stop the retry:
 * stopping after a single failed attempt is exactly the bug this function
 * exists to prevent, because the caller would then hand every remaining
 * target the still-blank `rubric`, and gradeRepoAction generates its own
 * rubric per repo whenever it receives one - silently reverting the whole
 * rest of the run to the per-repo-rubric unfairness U12.50 exists to remove.
 * If every target fails, `sharedRubric` in the return value is simply the
 * original `rubric` unchanged (still blank) and `consumed` is
 * `targets.length` - the caller must treat that as "no rubric could be
 * established" and must not loop again itself.
 *
 * `onAttempted` fires exactly once per target this function tries, in order,
 * so a caller wiring this into `done`/`setProgress` state gets one increment
 * per completed target with no double counting and no skipped counts.
 * `consumed` tells the caller how many leading targets this function already
 * graded, so its own worker pool can resume at that offset rather than
 * re-grading any of them.
 */
export async function establishSharedRubric(
  targets: readonly BulkGradeTarget[],
  rubric: string,
  attempt: (target: BulkGradeTarget) => Promise<RubricAttemptResult>,
  onAttempted: () => void,
): Promise<{ sharedRubric: string; consumed: number }> {
  let sharedRubric = rubric;
  let consumed = 0;
  while (consumed < targets.length && sharedRubric.trim() === "") {
    const target = targets[consumed];
    consumed += 1;
    const { rubricUsed } = await attempt(target);
    if (rubricUsed !== null) sharedRubric = rubricUsed;
    onAttempted();
  }
  return { sharedRubric, consumed };
}

export interface UseRepoGradesBulkGradeResult {
  /** The folder currently being bulk-graded, or null. Only ONE bulk run at a
   * time across the whole view. */
  runningFolder: string | null;
  /** "7 of 24" style progress for the running folder, or null. */
  progress: { done: number; total: number } | null;
  runBulkGrade: (plan: BulkGradePlan) => Promise<void>;
}

/**
 * Grades every target in `plan` with at most BULK_GRADE_CONCURRENCY requests
 * in flight, then reports once via onOutcomes/onAnnounce. Refuses to start a
 * second run while one is already in progress (see `runningFolder` below) -
 * returns immediately rather than queueing or replacing it, because two
 * concurrent fan-outs would multiply exactly the GitHub- and model-rate-limit
 * pressure BULK_GRADE_CONCURRENCY exists to bound; the instructor can start a
 * second column's run once the first finishes.
 */
export function useRepoGradesBulkGrade(params: UseRepoGradesBulkGradeParams): UseRepoGradesBulkGradeResult {
  const { provider, instructions, rubric, useReadmeInstructions, onCellUpdate, onOutcomes, onAnnounce } = params;
  const [runningFolder, setRunningFolder] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const runBulkGrade = async (plan: BulkGradePlan): Promise<void> => {
    // Guard against a second concurrent run - see this function's own header
    // comment above for why this is a refusal, not a queue.
    if (runningFolder !== null) return;

    const targets = plan.targets;
    const folder = targets[0]?.folder ?? null;
    setRunningFolder(folder);
    setProgress({ done: 0, total: targets.length });

    const outcomes: BulkGradeOutcome[] = [];
    let done = 0;

    /** One target's grading call, applied to cell state/outcomes exactly the
     * same way regardless of whether it ran as the sequential rubric-setup
     * step below or inside a pool worker - factored out so those two call
     * sites cannot drift apart on what a graded/failed outcome actually
     * writes. `rubricArg` is whatever this target's OWN gradeRepoAction call
     * should receive - see runBulkGrade's own header note on `sharedRubric`
     * for why that is not always the instructor's raw `rubric` field. */
    const gradeOneTarget = async (target: BulkGradeTarget, rubricArg: string): Promise<{ rubricUsed: string | null }> => {
      onCellUpdate(target.repo, target.folder, { grading: true, gradeError: null });
      const result = await gradeRepoAction(target.repo, instructions, rubricArg, provider, undefined, target.folder, useReadmeInstructions);

      if ("error" in result) {
        onCellUpdate(target.repo, target.folder, { grading: false, gradeError: result.error });
        outcomes.push({ repo: target.repo, folder: target.folder, status: "failed", score: "", detail: result.error });
        return { rubricUsed: null };
      }

      const first = result.run.results[0];
      const score = first?.totalScore ?? "";
      onCellUpdate(target.repo, target.folder, {
        grading: false,
        gradeError: null,
        score,
        comment: first?.overallComment ?? "",
        rubricAreas: first?.rubricAreas ?? [],
        // Set at the SAME time as `score`, matching index.tsx's
        // handleGradeCell exactly - this is the field that later tells a
        // hand-edited score apart from an untouched one (that file's own
        // header comment on the field explains why), so a bulk-graded
        // row must set it too or it will misreport as "edited" the
        // moment it is graded.
        generatedScore: first?.totalScore ?? null,
      });
      // `detail` on success names the README path actually used (or a
      // missing-README fallback note - never silent about which repos fell
      // back to the typed instructions vs. read a per-folder README), plus
      // U12.50's capture of `result.rubric`/`first.feedback` (see
      // useRepoGradesGradingActions.ts's handleGradeCell for why the log's
      // free-text `detail` is where both land: neither is discarded, and
      // there is no per-cell UI slot for either without extending
      // RepoGradeCellEdit, out of this wave's file set). The rubric is only
      // worth naming here when it was GENERATED (rubricArg came from
      // `sharedRubric` below, not the instructor's own typed field) - an
      // instructor-typed rubric is already visible in the textarea and
      // repeating it on every one of a run's graded cells would bloat the
      // log for no new information.
      const readmeNote = result.readmeMissing
        ? "no README found in this folder - graded from the typed instructions instead"
        : result.readmePath
          ? `graded from ${result.readmePath}`
          : "";
      const rubricNote = rubric.trim() === "" ? `Rubric used: ${result.rubric}` : "";
      const feedbackNote = first?.feedback && first.feedback !== first?.overallComment ? `Feedback: ${first.feedback}` : "";
      const detail = [readmeNote, rubricNote, feedbackNote].filter((part) => part !== "").join(" | ");
      outcomes.push({ repo: target.repo, folder: target.folder, status: "graded", score, detail });
      return { rubricUsed: result.rubric };
    };

    // U12.50 fairness fix (the reason this whole feature exists per
    // github-repos.ts:680's header comment): when the rubric field is blank,
    // gradeRepoAction generates one PER REPO, fed that repo's own content -
    // so a run's students could each be graded against a different invented
    // point total (the owner's own log: denominators of 100, 400, 40 and 16
    // across eleven students in one run). The honest fix is to establish ONE
    // rubric for the whole run BEFORE the worker pool opens, not to let
    // BULK_GRADE_CONCURRENCY workers each race their own generation the
    // instant the pool starts (they would each see the shared rubric still
    // unset and each generate their own, reproducing the exact bug this
    // exists to close). Targets are therefore graded alone, sequentially,
    // ahead of the pool, via establishSharedRubric above - which keeps trying
    // the next target rather than giving up after one failure, because a
    // single failed grade (GitHub rate limit, a transient network error, one
    // repo missing the folder) must not revert the rest of the run back to
    // per-repo rubrics either. gradeRepoAction's own return carries the
    // effectiveRubric it used, so once one succeeds, every remaining target
    // reuses that EXACT text as its own `rubric` argument, never triggering
    // gradeRepoAction's `rubric.trim() || generateRubric(...)` branch again
    // for the rest of this run. When the instructor DID type a rubric,
    // `sharedRubric` is simply that text from the start and nothing here
    // changes - every target already agreed on one rubric with no setup
    // needed.
    let sharedRubric = rubric;
    let cursor = 0;
    if (rubric.trim() === "" && targets.length > 0) {
      const prologue = await establishSharedRubric(
        targets,
        rubric,
        (target) => gradeOneTarget(target, rubric),
        () => {
          done += 1;
          setProgress({ done, total: targets.length });
        },
      );
      sharedRubric = prologue.sharedRubric;
      cursor = prologue.consumed;
    }

    // One worker: pulls the next unclaimed target off the shared cursor until
    // none remain. BULK_GRADE_CONCURRENCY workers run this concurrently below,
    // which is what bounds the in-flight request count - see the module
    // header comment for why this shape (over Promise.all) is required.
    const runWorker = async (): Promise<void> => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= targets.length) return;
        await gradeOneTarget(targets[index], sharedRubric);
        done += 1;
        setProgress({ done, total: targets.length });
      }
    };

    const workerCount = Math.min(BULK_GRADE_CONCURRENCY, Math.max(targets.length - cursor, 0));
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    onOutcomes(outcomes);
    onAnnounce(bulkGradeSummaryLine(outcomes, plan));
    setRunningFolder(null);
    setProgress(null);
  };

  return { runningFolder, progress, runBulkGrade };
}
