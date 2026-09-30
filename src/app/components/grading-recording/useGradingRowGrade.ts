"use client";

// Grading from a screen recording - the single-row grade path's thin
// composing hook (docs/a38-acceptance-criteria.md AC-1/AC-3/AC-8;
// docs/a38-scope.md section 4.6 "The thin hook composes them").
//
// This repo's vitest is `environment: "node"` and drives no hook (no
// `renderHook`, no `@testing-library/react`), so every behaviour the AC's
// MACHINE instruments bind to had to be pulled OUT of this hook into pure,
// dependency-injected units this file merely composes:
//   - buildSingleSubmission / gradingRowGradeAction  (grading-dispatch.ts)
//   - setGradingRowState / classifyGradingResult      (grading-rows.ts)
//   - createGradeLock                                 (grade-lock.ts)
// This file therefore holds only React state wiring and the `await` - no
// logic a test must reach through it (`useGradingRowGrade.wiring.test.ts`
// pins the composition by reading this file's source, never by driving it).
//
// THE SHARED LOCK: `lock` is held in a `useRef` (one stable instance for
// this hook's whole lifetime) and RETURNED so GradingRecordingPanel.tsx's
// `handleGradeAll` can `acquire()`/`release()` the very same instance - see
// grade-lock.ts's own header for why the per-row and bulk paths must never
// hold it concurrently.
//
// THE FLOW (docs/a38-scope.md section 4.6's numbered steps), per press:
//   1. look the row up by id; return if it is gone.
//   2. checkGradingReadiness(rubricText, 1) - rowCount is 1, this row's own
//      readiness, never the whole table's; refuse BEFORE any acquire.
//   3. lock.acquire() - a silent no-op refusal when already held; an
//      atomic check-and-set that mutates nothing on refusal (grade-lock.ts),
//      so a refused press can never deadlock a later legitimate one
//      (round-2 Ruling 8).
//   4. capture the row's PRIOR state, then write "grading" through
//      markRowState (wave 1's dispatch write; wave 2 upgrades this one call
//      site to beginGradeAttempt so the spend-cap counter increments on
//      dispatch, not on success - out of this wave's charter).
//   5. await gradeCapturedSubmissionsAction([buildSingleSubmission(row)],
//      ...) - a one-element array literal, length 1 by construction, never
//      gradingRows.rawRows (AC-1's stronger form: multiplicity is
//      unrepresentable at the builder itself).
//   6. on "error" in result: report it and restore the PRIOR state; on
//      success: classifyGradingResult(result.results[0]) through
//      applyGradingResult - the exact reuse handleGradeAll already makes
//      of both (GradingRecordingPanel.tsx), so a failure is never rendered
//      as a green "ready" row here either (BLOCKER 3).
//   7. finally: lock.release() - always runs, whichever branch returned.

import { useCallback, useState } from "react";
import { gradeCapturedSubmissionsAction } from "@/app/actions/grading-submission-grade";
import { checkGradingReadiness, buildSingleSubmission } from "./grading-dispatch";
import { classifyGradingResult } from "./grading-rows";
import { createGradeLock, type GradeLock } from "./grade-lock";
import type { GradingRow, GradingRowState } from "./grading-row";
import type { GradingResultInput } from "./grading-rows";
import type { LlmProvider } from "@/lib/llm";
import type { RecordingKnowledgeContext } from "@/lib/recording-launch";

export interface UseGradingRowGradeParams {
  /** The whole (course-scoped) table, read fresh on every press - the same
   *  row lookup handleGradeAll's own submission projection reads off of. */
  rawRows: readonly GradingRow[];
  rubricText: string;
  knowledgeContext: RecordingKnowledgeContext | null;
  provider: LlmProvider;
  /** gradingRows.applyGradingResult (useGradingRows.ts) - the SAME guarded
   *  write handleGradeAll's own success path uses, so an edited row's
   *  scored fields are structurally untouchable here too. */
  applyGradingResult: (id: string, result: GradingResultInput) => void;
  /** gradingRows.markRowState (useGradingRows.ts) - the state-only write
   *  this hook uses for its pre-await dispatch write and its error-outcome
   *  restore. */
  markRowState: (id: string, state: GradingRowState) => void;
}

export interface UseGradingRowGradeReturn {
  /** ONE stable instance for this hook's lifetime - shared with
   *  handleGradeAll (GradingRecordingPanel.tsx) so per-row and bulk grading
   *  can never interleave. */
  lock: GradeLock;
  /** The most recent single-row refusal/error message, or null. Mirrors
   *  the panel's own `gradeError`, kept separate so a per-row failure never
   *  clobbers (or is clobbered by) a bulk-run error message. */
  rowError: string | null;
  gradeRow: (id: string) => Promise<void>;
}

export function useGradingRowGrade({
  rawRows,
  rubricText,
  knowledgeContext,
  provider,
  applyGradingResult,
  markRowState,
}: UseGradingRowGradeParams): UseGradingRowGradeReturn {
  // One stable instance for this hook's whole lifetime - a lazy useState
  // initializer, not a `useRef` lazy-init (this repo's eslint react-hooks/
  // refs rule forbids reading `ref.current` during render; useState's
  // initializer function runs exactly once, on mount, giving the same
  // "created once, stable identity thereafter" guarantee without touching a
  // ref during render).
  const [lock] = useState<GradeLock>(() => createGradeLock());

  const [rowError, setRowError] = useState<string | null>(null);

  const gradeRow = useCallback(
    async (id: string) => {
      const row = rawRows.find((r) => r.id === id);
      if (!row) return;

      // Step 2: this row's OWN readiness (rowCount = 1), never the whole
      // table's - refused BEFORE any acquire, so a refusal never touches
      // the lock at all.
      const readiness = checkGradingReadiness(rubricText, 1);
      if (!readiness.ok) {
        setRowError(readiness.reason);
        return;
      }

      // Step 3: a silent no-op refusal - acquire() mutated nothing.
      if (!lock.acquire()) return;

      setRowError(null);
      const prior = row.state;
      // Step 4: the ONE mutation written BEFORE the await.
      markRowState(id, "grading");
      try {
        // Step 5: a one-element array literal, never rawRows.
        const result = await gradeCapturedSubmissionsAction(
          [buildSingleSubmission(row)],
          rubricText.trim(),
          knowledgeContext?.text,
          provider
        );
        if ("error" in result) {
          setRowError(result.error);
          markRowState(id, prior);
          return;
        }
        const [first] = result.results;
        applyGradingResult(id, classifyGradingResult(first));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not grade this submission.";
        setRowError(message);
        markRowState(id, prior);
      } finally {
        // Step 7: always runs - a claimed lock always releases.
        lock.release();
      }
    },
    [rawRows, rubricText, knowledgeContext, provider, applyGradingResult, markRowState, lock]
  );

  return { lock, rowError, gradeRow };
}
