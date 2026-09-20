// N15c (scratchpad/n15c-design-v3.md, Ruling D1 - the reframe). Both prior
// design passes on this feature failed the same acceptance-criteria bar:
// nothing could observe whether an auto-grade fires, or fires when it must
// not, because the decision lived inside a React component this repo's
// vitest (node-env, renders nothing - docs/loop/this-repo.md) cannot render.
//
// This is the fix: the WHOLE decision is a pure, total function, mirroring
// this repo's own decideStopGuard (src/tools/backlog/stop-guard.ts)
// precedent exactly. useSnapshotAutoGrade.ts (the "use client" wrapper) does
// exactly two things - gather the five inputs, and EXECUTE the decision via
// planAutoGradeStep below - and contains no independent copy of any of
// decideAutoGrade's conditions.

import { isGradeEligible, type GradeEligibilityInputs } from "./snapshot-row";
import { countSubmissionArrivals } from "./snapshot-shot";
import type { SnapshotShot } from "./snapshot-shot";

export type AutoGradeNoFireReason =
  | "not-armed"
  | "no-arrivals"
  | "in-flight"
  | "not-eligible"
  | "needs-confirmation";

export type DecideAutoGradeResult = { fire: true } | { fire: false; reason: AutoGradeNoFireReason };

export interface DecideAutoGradeInput {
  armed: boolean;
  /** The RAW added-shot list a handler just built (nulls included for a
   *  bailed-out add) - countSubmissionArrivals is composed INTERNALLY here,
   *  not pre-computed by the caller, so a sabotage that weakens the count is
   *  caught by executing THIS function directly. */
  addedShots: readonly (SnapshotShot | null)[];
  inFlight: boolean;
  confirmedThisLoad: boolean;
  /** Composed internally via isGradeEligible - same reasoning as
   *  addedShots above. */
  eligibility: GradeEligibilityInputs;
}

/**
 * The order matters and is deliberate: armed, then an actual arrival, then
 * not already mid-flight, then the shared eligibility gate (Ruling C2 - the
 * SAME predicate the Grade button's disabled prop consumes), then the
 * once-per-load confirmation (Ruling C4). Checking eligibility before
 * confirmation means a would-be-fireable arrival that is not yet eligible
 * (e.g. rubric parse pending) never prompts a confirmation dialog for
 * nothing.
 */
export function decideAutoGrade(input: DecideAutoGradeInput): DecideAutoGradeResult {
  if (!input.armed) return { fire: false, reason: "not-armed" };
  if (countSubmissionArrivals(input.addedShots) <= 0) return { fire: false, reason: "no-arrivals" };
  if (input.inFlight) return { fire: false, reason: "in-flight" };
  if (!isGradeEligible(input.eligibility)) return { fire: false, reason: "not-eligible" };
  if (!input.confirmedThisLoad) return { fire: false, reason: "needs-confirmation" };
  return { fire: true };
}

// ---------------------------------------------------------------------------
// D1 instruction 2 (the check's own ten instructions, overriding the design
// wherever they conflict): EXTRACT THE DISPATCH, not just the decision. This
// second pure leaf is what makes "the decision is computed and thrown away",
// "the return after a no-fire decision is deleted", and "the queue-drain
// body is deleted" unit-testable in a node-env suite - decideAutoGrade alone
// cannot catch any of those three, since all three are about what the
// CALLER does with an already-correct decision, not about the decision
// itself.
// ---------------------------------------------------------------------------

export type AutoGradeStepKind = "fire" | "queue" | "confirm" | "none";

export interface AutoGradeQueueState {
  /** The shot list the fired (or queued, or confirm-pending) call would
   *  actually grade - see shotsIncludingArrivals (snapshot-shot.ts). Handed
   *  through unchanged; this function decides ONLY the kind of step, never
   *  recomputes this array. */
  shotsForGrade: SnapshotShot[];
}

export interface PlanAutoGradeStep {
  kind: AutoGradeStepKind;
  shotsForGrade: SnapshotShot[];
}

/**
 * Maps a decision to the ONE dispatch action the caller must take:
 *  - fire: call handleGrade now.
 *  - queue: a genuine arrival was rejected only because another grade is
 *    already in flight (D3) - append it, never drop it.
 *  - confirm: everything else is satisfied, but this session's one-time
 *    confirmation (Ruling C4) has not happened yet - ask, then fire only on
 *    a true answer.
 *  - none: nothing to do (not armed, nothing arrived, or not eligible - a
 *    rejection with no "settle" event to retry on, so it is NOT queued).
 */
export function planAutoGradeStep(
  decision: DecideAutoGradeResult,
  queueState: AutoGradeQueueState
): PlanAutoGradeStep {
  if (decision.fire) return { kind: "fire", shotsForGrade: queueState.shotsForGrade };
  if (decision.reason === "in-flight") return { kind: "queue", shotsForGrade: queueState.shotsForGrade };
  if (decision.reason === "needs-confirmation") return { kind: "confirm", shotsForGrade: queueState.shotsForGrade };
  return { kind: "none", shotsForGrade: queueState.shotsForGrade };
}
