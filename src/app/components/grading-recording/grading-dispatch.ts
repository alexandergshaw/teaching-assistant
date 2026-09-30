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
