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
    let cursor = 0;

    // One worker: pulls the next unclaimed target off the shared cursor until
    // none remain. BULK_GRADE_CONCURRENCY workers run this concurrently below,
    // which is what bounds the in-flight request count - see the module
    // header comment for why this shape (over Promise.all) is required.
    const runWorker = async (): Promise<void> => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= targets.length) return;
        const target: BulkGradeTarget = targets[index];

        onCellUpdate(target.repo, target.folder, { grading: true, gradeError: null });
        const result = await gradeRepoAction(target.repo, instructions, rubric, provider, undefined, target.folder, useReadmeInstructions);

        if ("error" in result) {
          onCellUpdate(target.repo, target.folder, { grading: false, gradeError: result.error });
          outcomes.push({ repo: target.repo, folder: target.folder, status: "failed", score: "", detail: result.error });
        } else {
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
          // `detail` on success is the README path actually used, or a
          // missing-README note - never silent about which repos fell back
          // to the typed instructions vs. read a per-folder README (a run
          // that mixed the two without saying so per repo would be
          // unexplainable to the instructor after the fact).
          const detail = result.readmeMissing
            ? "no README found in this folder - graded from the typed instructions instead"
            : result.readmePath
              ? `graded from ${result.readmePath}`
              : "";
          outcomes.push({ repo: target.repo, folder: target.folder, status: "graded", score, detail });
        }

        done += 1;
        setProgress({ done, total: targets.length });
      }
    };

    const workerCount = Math.min(BULK_GRADE_CONCURRENCY, targets.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    onOutcomes(outcomes);
    onAnnounce(bulkGradeSummaryLine(outcomes, plan));
    setRunningFolder(null);
    setProgress(null);
  };

  return { runningFolder, progress, runBulkGrade };
}
