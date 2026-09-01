// Grading from a screen recording - turns one
// extractGradingSubmissionsAction result into the distinct, visible notices
// GradingRecordingPanel.tsx shows (docs/grading-via-recording-acceptance-
// criteria.md R1a and item 6: "surface the no-submission and unreadable
// outcomes the extraction action already distinguishes... an unreadable run
// must never look like a quiet success").
//
// extractGradingSubmissionsAction (src/app/actions/grading-submission-
// extract.ts) already collapses a batch's raw model output into exactly
// three distinguishable outcomes (see that file's own header): a hard
// `{ error }`, a CONFIRMED-EMPTY success (`confirmedEmpty: true`), and an
// ordinary success that may also report `skippedUnnamed > 0` (R3: a
// submission whose name could not be read, skipped rather than guessed).
// This file is the one place that turns those three into user-facing text -
// kept out of the panel component itself so it is unit-testable at all
// (vitest here is node-env and renders no component).
//
// A single extraction batch can legitimately produce MORE THAN ONE of these
// at once - an ordinary success that both skipped an unnamed submission AND
// added new ones - so this returns an ARRAY, never a single notice, and the
// panel is expected to show every one of them, not just the first.

export type GradingExtractionOutcomeKind = "error" | "confirmed-empty" | "skipped-unnamed" | "added";

export interface GradingExtractionOutcome {
  kind: GradingExtractionOutcomeKind;
  text: string;
}

/** R1a: styled and announced with the SAME urgency as a hard error - an
 *  unreadable run (submissions were visible but no name could be read) must
 *  never look like the same quiet confirmation a clean batch gets. Mirrors
 *  RubricInputModal's own "a suspiciously-short extraction gets the same
 *  danger styling as a hard error" rule (rubric-input.ts's RubricUploadNotice
 *  "warning" kind), applied here to "skipped-unnamed". */
export function isDangerNotice(kind: GradingExtractionOutcomeKind): boolean {
  return kind === "error" || kind === "skipped-unnamed";
}

export type ExtractionActionResult =
  | { error: string }
  | { submissions: unknown[]; confirmedEmpty: boolean; skippedUnnamed: number };

/**
 * `addedCount` is `mergeExtractedSubmissions`'s own `addedCount` for this
 * batch (grading-submission-merge.ts) - passed in rather than re-derived
 * here, since only the caller (which actually ran the merge) has it.
 */
export function describeExtractionOutcome(
  result: ExtractionActionResult,
  addedCount: number
): GradingExtractionOutcome[] {
  if ("error" in result) {
    // Outcome 3 (grading-submission-extract.ts's own numbering): nothing
    // usable AND no confirmation - the loudest of the three, a hard error.
    return [{ kind: "error", text: result.error }];
  }

  const notices: GradingExtractionOutcome[] = [];

  if (result.confirmedEmpty) {
    // Outcome 1: a real "nothing here" the model actually confirmed -
    // rendered as an honest, positive finding, never a silent non-event.
    notices.push({
      kind: "confirmed-empty",
      text: "The model looked at that part of the screen and confirmed there was nothing to grade there yet - keep scrolling to the next submission.",
    });
  }

  if (result.skippedUnnamed > 0) {
    // Outcome 2: real submission text was visible, but no readable name -
    // R3 skips it entirely rather than guessing. Must read as loud, not as
    // "0 submissions found".
    notices.push({
      kind: "skipped-unnamed",
      text: `${result.skippedUnnamed} submission${result.skippedUnnamed === 1 ? "" : "s"} ${result.skippedUnnamed === 1 ? "was" : "were"} visible but could not be attributed to a readable name, so ${result.skippedUnnamed === 1 ? "it was" : "they were"} skipped rather than guessed. Scroll back so the student's name is visible on screen.`,
    });
  }

  if (addedCount > 0) {
    notices.push({
      kind: "added",
      text: `${addedCount} new submission${addedCount === 1 ? "" : "s"} found.`,
    });
  }

  return notices;
}
