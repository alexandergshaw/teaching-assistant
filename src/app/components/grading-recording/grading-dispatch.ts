// Grading from a screen recording - the "may this table be graded right
// now" decision (docs/grading-via-recording-acceptance-criteria.md item 5:
// "the rubric is required before grading, not before capturing... grading
// without one must be refused with a clear message, never attempted").
//
// Pure, so this rule is unit-testable even though vitest here is node-env
// and renders no component - GradingRecordingPanel.tsx calls this once, on
// the "Grade submissions" click, and refuses to call
// gradeCapturedSubmissionsAction at all when it reports not-ok.
//
// A38 wave 1 (docs/a38-scope.md section 4.6 Unit 1, section 4.4) adds two
// more pure leaves here, for the identical reason: this repo's vitest is
// node-env and drives no hook, so the single-row submission builder and the
// per-row grade eligibility decision both have to be plain, node-callable
// functions rather than logic inlined into useGradingRowGrade.ts.

import type { GradingRow } from "./grading-row";
import type { GradingSubmissionKind } from "@/lib/grade/submission-kind";

export const MISSING_RUBRIC_MESSAGE =
  "Add a rubric before grading - paste or upload one above, then try again. You can keep capturing submissions without one; only grading needs it.";

export const NO_SUBMISSIONS_TO_GRADE_MESSAGE = "Nothing to grade yet - capture at least one submission first.";

export interface GradingReadiness {
  ok: boolean;
  /** The refusal message to show, or null when `ok`. */
  reason: string | null;
}

/**
 * `rowCount` is the UNFILTERED row count (useGradingRows's `totalCount`),
 * never the filtered/displayed array length - a search box that happens to
 * match nothing must not make a table with real submissions look empty to
 * this check.
 */
export function checkGradingReadiness(rubricText: string, rowCount: number): GradingReadiness {
  if (rowCount === 0) return { ok: false, reason: NO_SUBMISSIONS_TO_GRADE_MESSAGE };
  if (!rubricText.trim()) return { ok: false, reason: MISSING_RUBRIC_MESSAGE };
  return { ok: true, reason: null };
}

// ---------------------------------------------------------------------------
// Unit 1 (docs/a38-scope.md section 4.6) - the single-row submission
// builder. Its return type IS a single submission object, not an array, so
// "sends more than one row" is unrepresentable at the builder itself
// (AC-1's stronger form) - the one place multiplicity is introduced is the
// hook's own call site, which wraps this return value in a one-element
// array literal: `gradeCapturedSubmissionsAction([buildSingleSubmission(row)], ...)`.
//
// The shape mirrors gradeCapturedSubmissionsAction's own `submissions`
// element type (grading-submission-grade.ts) exactly - the same four
// fields handleGradeAll already projects from every row
// (GradingRecordingPanel.tsx's `submissions = gradingRows.rawRows.map(...)`).
// ---------------------------------------------------------------------------

export interface SingleGradingSubmission {
  id: string;
  studentName: string;
  submissionText: string;
  submissionKind: GradingSubmissionKind;
}

export function buildSingleSubmission(row: GradingRow): SingleGradingSubmission {
  return {
    id: row.id,
    studentName: row.studentName,
    submissionText: row.submissionText,
    submissionKind: row.submissionKind,
  };
}

// ---------------------------------------------------------------------------
// The per-row grade control's eligibility (docs/a38-scope.md section 4.4).
// `row.state` already carries the whole eligibility decision - no new row
// field is needed. `failed` MUST be eligible: it is where a bound-overflow
// row lands (docs/a38-acceptance-criteria.md AC-5), and excluding it is
// exactly the defect this feature exists to fix.
//
// `rubricPresent` is threaded in rather than read off any row, because a
// row has no way to see `rubricText` (panel state) itself. When it is
// false the caller does not render the control at all (section 4.4,
// disabled reason 1) - `gradeable` still reports false here so a caller
// that ignores that convention degrades safely rather than offering a
// dead click.
// ---------------------------------------------------------------------------

export interface GradingRowGradeEligibility {
  gradeable: boolean;
  label: string;
}

export function gradingRowGradeAction(row: GradingRow, rubricPresent: boolean): GradingRowGradeEligibility {
  if (row.state === "grading") return { gradeable: false, label: "Grading…" };
  return { gradeable: rubricPresent, label: row.state === "pending" ? "Grade" : "Re-grade" };
}

// ---------------------------------------------------------------------------
// A38 wave 2 (docs/a38-acceptance-criteria.md AC-3; docs/a38-wave-plan.md
// section 6, Unit 2): the spend-cap counter and the confirm-above-N
// threshold. Both pure, dependency-free leaves - this repo's vitest drives
// no hook, so the AC-3 MACHINE instrument (increments on DISPATCH, survives
// an error outcome, N = min not totalCount) has to be satisfiable by calling
// these directly, never by driving useGradingRowGrade.
// ---------------------------------------------------------------------------

/**
 * The ONE increment primitive: `count` is the row's PRIOR `gradeAttempts`
 * (absent normalizes to 0, mirroring `sumGradeAttempts`'s own `?? 0`).
 * Never decrements and never resets - there is no "refund" entry point
 * anywhere in this feature (round-2 Ruling 6): a dispatch that later errors
 * or fails still spent a model call, so it still counts.
 */
export function recordGradeDispatch(count?: number): number {
  return (count ?? 0) + 1;
}

/**
 * The single-row grade path's ONE pre-await mutation (docs/a38-scope.md
 * section 4.6 Unit 2). Composes the state write wave 1 already made
 * ("grading") with the attempt-count increment, so the count rises the
 * moment a grade is DISPATCHED - before the grade action's own await, not
 * after its result comes back - which is what makes a failing row still
 * count toward N (AC-3's anti-Ruling-6 requirement). grading-rows.ts's
 * `setGradingRowState` is the one production entry point that calls this
 * (see that function's own header for why the call lives there rather than
 * at every dispatch call site individually), and every OTHER state
 * transition (the error-outcome restore in particular) is a plain spread
 * that leaves `gradeAttempts` untouched - nothing in this feature ever
 * refunds it.
 */
export function beginGradeAttempt(row: GradingRow): GradingRow {
  return { ...row, state: "grading", gradeAttempts: recordGradeDispatch(row.gradeAttempts) };
}

/**
 * AC-3 / round-2 Ruling 9: N = min(totalCount, maxSubmissions), NEVER
 * `totalCount` alone (docs/a38-scope.md:652 is stale on this point - see
 * docs/a38-wave-plan.md section 2's conflict note). `effectiveBound` is
 * `null` before the server-only bound has been fetched at least once
 * (getEffectiveGradeBoundAction, grading-submission-grade.ts) - in that
 * window this returns `totalCount` itself, which keeps the confirm from
 * ever firing EARLIER than it should (a threshold of `totalCount` is the
 * loosest possible one), never earlier than the moment a real bound is
 * known.
 */
export function computeGradeConfirmThreshold(totalCount: number, effectiveBound: number | null): number {
  return Math.min(totalCount, effectiveBound ?? totalCount);
}

/**
 * The running total of grade DISPATCHES across the whole table - every
 * row's own `gradeAttempts`, summed (absent normalizes to 0). This is what
 * the confirm-above-N decision compares against N, per OQ-1's adopted
 * reading (per-row path only counts toward this decision's CONFIRM gate,
 * but every dispatch anywhere - including a bulk grade-all press - still
 * increments the underlying per-row counter this sums, per the wave plan's
 * "grade-all still sends rawRows, now also incrementing attempts on
 * dispatch" invariant).
 */
export function sumGradeAttempts(rows: ReadonlyArray<GradingRow>): number {
  return rows.reduce((sum, r) => sum + (r.gradeAttempts ?? 0), 0);
}

/**
 * DECISION 2 (docs/owner-decisions-2026-09-23.md): "confirm above N" - at or
 * above N, not merely past it, so the Nth dispatch itself is the one that
 * requires confirmation rather than letting it through for free and gating
 * only the (N+1)th.
 */
export function requiresGradeConfirm(totalAttempts: number, n: number): boolean {
  return totalAttempts >= n;
}
