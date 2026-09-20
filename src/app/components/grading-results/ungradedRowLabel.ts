// RES-5 (docs/a12-a13-scope.md, Ruling U1): classifyRow's six-state output
// already reaches the tbody as `data-ungraded-state` (A12/A13), but that
// attribute is invisible - it carries no rendered text and no visible
// styling hook fires on it. Ruling U1 relocated the fix here: a VISIBLE
// treatment plus a FROZEN VISIBLE-LABEL LITERAL, asserted as a rendered text
// node, because colour alone cannot carry the distinction (fails for
// colour-blind readers) and cannot be asserted by any test in this repo
// (vitest is node-env; no component is ever rendered).
//
// Design decision, stated rather than left implicit: the five non-postable
// states do NOT collapse into one interchangeable marker. "Not attempted"
// (the run stopped before reaching this submission) and "grading failed"
// (the run reached it and errored) mean different things to the instructor
// and call for different next actions, so each state gets its own literal.
// What they DO share is a common "Not posted" prefix - the same vocabulary
// GradingResults.tsx already uses for describeSkippedStatus's fallback - so
// the family reads as one visual/textual category (this row is not an
// ordinary graded row) while the suffix carries the state-specific reason.
// "postable" (an ordinary graded row) maps to null: no label, no marker -
// that is what keeps a postable row indistinguishable from what it already
// looked like before this chunk.
//
// Pure leaf: no React, no I/O, no module-scope mutable cache
// (src/lib/client-state-sweep.registry.test.ts would catch one).

import type { RowDisclosureState } from "./ungradedDisclosure";

export const UNGRADED_ROW_LABEL: Record<RowDisclosureState, string | null> = {
  postable: null,
  refused: "Not posted - needs review before posting",
  rescued: "Not posted - scored by hand, review separately",
  "grading-failed": "Not posted - grading failed",
  "not-attempted-count-bound": "Not posted - not graded (run limit reached)",
  "not-attempted-run-deadline": "Not posted - not graded (time limit reached)",
};

/**
 * The visible label text for a row's classified state, or null for an
 * ordinary postable row (no marker, no label).
 */
export function describeUngradedRowLabel(state: RowDisclosureState): string | null {
  return UNGRADED_ROW_LABEL[state];
}
