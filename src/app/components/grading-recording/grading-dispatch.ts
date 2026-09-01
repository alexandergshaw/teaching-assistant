// Grading from a screen recording - the "may this table be graded right
// now" decision (docs/grading-via-recording-acceptance-criteria.md item 5:
// "the rubric is required before grading, not before capturing... grading
// without one must be refused with a clear message, never attempted").
//
// Pure, so this rule is unit-testable even though vitest here is node-env
// and renders no component - GradingRecordingPanel.tsx calls this once, on
// the "Grade submissions" click, and refuses to call
// gradeCapturedSubmissionsAction at all when it reports not-ok.

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
