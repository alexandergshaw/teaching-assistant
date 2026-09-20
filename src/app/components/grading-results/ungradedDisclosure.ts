// A12/A13 (docs/a12-a13-scope.md): the row a grading run did NOT grade, or
// graded but the instructor must not post from this table, needs a
// disclosure that is CORRECT and DISTINGUISHABLE from an ordinary graded
// row. This leaf is the mechanism: a total classification (classifyRow), the
// frozen copy such a row shows (UNGRADED_DISCLOSURE_COPY), a fallback for a
// blank Canvas skip reason (describeSkippedStatus), and the two functions
// that correct a stale "Re-run to grade the rest" sentence already sitting
// in a persisted or freshly-seeded edit (correctUngradedFeedbackSeed,
// correctUngradedSeeds).
//
// Pure leaf: no React, no I/O, no module-scope mutable cache
// (src/lib/client-state-sweep.registry.test.ts would catch one). Value-
// imports isUngraded (and the NotAttemptedOutcome type) from
// "@/lib/grade/types" ONLY - never the "@/lib/grade" barrel or any other
// submodule, which transitively drags server-only code into this "use
// client" surface's bundle (gradingResultsHelpers.ts's own header comment
// names the chain). checkRowPostability is imported by RELATIVE path, not
// the "@/lib/grade" alias, exactly as GradingResults.tsx already does for
// the same reason (that file's own comment at its import site) - the guard
// this file's sibling test enforces (gradingResultsHelpers.test.ts's
// "grading-results client files stay client-bundle-safe") bans the alias
// prefix outright, even for a safe submodule, and postable.ts's own header
// says it imports nothing outside its own directory's types.
import { isUngraded, type NotAttemptedOutcome } from "@/lib/grade/types";
import { checkRowPostability } from "../../../lib/grade/postable";
import {
  applyFeedbackFieldEdit,
  parseEarnedPoints,
  type GradeRow,
  type GradingRun,
  type RowEdit,
} from "./gradingResultsHelpers";

type StoppedBy = NotAttemptedOutcome["stoppedBy"];

// AC-3a: no member may contain the substring "Re-run" - re-derived from
// `grep -n "Re-run" src/lib/grade/engine.ts` (":307" and ":320", both
// banned) rather than one quoted phrase, so a future engine sentence
// containing "Re-run" anywhere still trips this set. AC-3c ties
// correctUngradedFeedbackSeed's replacement text to these SAME two members
// by construction, not by a second, independently authored copy. Neither
// literal states the run's specific count or deadline (N7: no typed channel
// carries one into classifyRow's signature, and a per-run number would
// defeat the frozen-literal shape a human can review once).
export const UNGRADED_DISCLOSURE_COPY: Record<StoppedBy, string> = {
  "submission-count-bound":
    "Not graded: this run stopped before reaching this submission because of the run's submission limit. Grading again without changing the queue will grade the same students again, not this one - remove the students who already have a grade from the queue first.",
  "run-deadline":
    "Not graded: this run's time budget ran out before this submission could be started. Grading again without changing the queue will start from the same point again, not this one - remove the students who already have a grade from the queue first.",
};

// AC-2: a rescued row (the tool produced no grade, but the instructor has
// since typed a real score into the total field) is neither an ordinary
// graded row nor an ordinary ungraded row - it needs its own disclosure,
// stating plainly that the table's own posting mechanism will not send it.
const RESCUED_ROW_MESSAGE =
  "The tool did not grade this submission, but a score has been entered for it by hand. This row cannot be posted from this table with the others - review and post it separately.";

export type RowDisclosureState =
  | "postable"
  | "refused"
  | "rescued"
  | "grading-failed"
  | "not-attempted-count-bound"
  | "not-attempted-run-deadline";

export interface RowDisclosure {
  readonly state: RowDisclosureState;
  readonly message: string;
}

// AC-7/G1b: the only member of NotAttemptedOutcome's two-member `stoppedBy`
// union this leaf does not have a named branch for is a compile error, not a
// silent fallthrough - types.ts:137-138 says a third reason is added to that
// union, never a new independent field, so this switch is where a third
// member is caught.
function notAttemptedMessage(stoppedBy: StoppedBy): string {
  switch (stoppedBy) {
    case "submission-count-bound":
      return UNGRADED_DISCLOSURE_COPY["submission-count-bound"];
    case "run-deadline":
      return UNGRADED_DISCLOSURE_COPY["run-deadline"];
    default: {
      const exhaustive: never = stoppedBy;
      return exhaustive;
    }
  }
}

/**
 * AC-1/AC-2: classifies one row into exactly one of six states - the five
 * outcomes AC-1 enumerates (postable, refused, grading-failed, and the two
 * not-attempted stoppedBy members) plus AC-2's rescued state, which takes
 * priority over the plain not-attempted/grading-failed classification
 * whenever the instructor has typed a real score into an ungraded row.
 * G2: computed from `result`/`edit` fields the app itself produced, never
 * parsed out of prose.
 */
export function classifyRow(result: GradeRow, edit: RowEdit): RowDisclosure {
  if (isUngraded(result)) {
    if (parseEarnedPoints(edit.total).trim() !== "") {
      return { state: "rescued", message: RESCUED_ROW_MESSAGE };
    }
    if (result.ungraded.kind === "grading-failed") {
      return { state: "grading-failed", message: result.ungraded.message };
    }
    return {
      state:
        result.ungraded.stoppedBy === "run-deadline"
          ? "not-attempted-run-deadline"
          : "not-attempted-count-bound",
      message: notAttemptedMessage(result.ungraded.stoppedBy),
    };
  }
  const check = checkRowPostability({
    producer: result,
    submittedScore: parseEarnedPoints(edit.total),
    submittedComment: edit.overall,
  });
  return check.postable ? { state: "postable", message: "" } : { state: "refused", message: check.reason };
}

/**
 * AC-4/B1/G3: the "skipped" post-status arm's text. Round 1 of this scope
 * shipped a hardcoded literal here regardless of `message` (GradingResults.tsx
 * discarded the real skip reason); this function is what makes the fallback
 * EXECUTABLE and testable outside a rendered component. Never returns an
 * empty string: a blank or whitespace-only `message` (Canvas's own skip
 * reason can be blank) falls back to the same literal round 1 always showed,
 * and a real reason is returned exactly as given, never a substitute.
 */
export function describeSkippedStatus(message?: string): string {
  if (message !== undefined && message.trim().length > 0) return message;
  return "Not posted - no grade or comment to send";
}

/**
 * AC-6/AC-3c/G5: corrects ONE row's stored/seeded `strengths` when, and only
 * when, it is either the engine's own not-attempted message or one of this
 * leaf's own frozen not-attempted literals - never a typed edit, and never a
 * `grading-failed` row (that row's `strengths` is a real per-submission
 * diagnostic, engine.ts:264, not a false instruction). Idempotent: applying
 * this twice in a row leaves `edit` unchanged the second time, because the
 * corrected value is itself one of the two literals the condition already
 * matches. Recomputes `overall` via applyFeedbackFieldEdit (the leaf's only
 * writer of that field) so the two never disagree.
 */
export function correctUngradedFeedbackSeed(result: GradeRow, edit: RowEdit): RowEdit {
  if (!isUngraded(result) || result.ungraded.kind !== "not-attempted") return edit;
  const engineMessage = result.ungraded.message;
  const isCorrectableStrengths =
    edit.strengths === engineMessage ||
    edit.strengths === UNGRADED_DISCLOSURE_COPY["submission-count-bound"] ||
    edit.strengths === UNGRADED_DISCLOSURE_COPY["run-deadline"];
  if (!isCorrectableStrengths) return edit;
  return applyFeedbackFieldEdit(edit, "strengths", notAttemptedMessage(result.ungraded.stoppedBy));
}

/**
 * AC-9 (Ruling U2): the per-run wiring `correctUngradedFeedbackSeed` needs to
 * actually reach the screen. Maps it over every row in `run.results`; a row
 * with no entry yet in `edits` is left absent (nothing to correct), and every
 * row this chunk's condition does not match is returned byte-identical
 * (same reference) to the input `edits[result.student]`.
 */
export function correctUngradedSeeds(
  run: GradingRun,
  edits: Record<string, RowEdit>
): Record<string, RowEdit> {
  const next: Record<string, RowEdit> = { ...edits };
  for (const result of run.results) {
    const current = next[result.student];
    if (current === undefined) continue;
    next[result.student] = correctUngradedFeedbackSeed(result, current);
  }
  return next;
}
