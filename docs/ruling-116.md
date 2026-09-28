# RULING 116: incremental grading route defaulted off (reachability, not a revert)

## What was wrong

At `ceab414`, `routeGradingRun` (`src/app/components/grading/incrementalRunPlan.ts`)
made the incremental grading pool the DEFAULT path for the `gemini` provider -
any request with a Canvas URL, or an in-budget submissions file, routed to
`"incremental"` instead of `"whole-run"`.

The incremental route does not go through `gradeAction`, so relative to the
whole-run path it displaced, it is missing:

- **RubricProvenance.** Exactly one mount in `GradingTab.tsx`, at line 547
  (`import RubricProvenance from "./grading-results/RubricProvenance"` at
  line 21), on the whole-run branch only. A39 wave 2's deliverable is absent
  from the incremental table.
- **Rubric auto-generation.** `src/app/actions/grading.ts:885-887` runs
  `const effectiveRubric = rubric.trim() ? rubric : await generateRubric(assignmentInstructions, provider)`.
  Nothing on the incremental route does this - a blank rubric there grades
  against NO rubric at all.
- **The blank-instructions refusal.** `grading.ts:881` returns "Please
  provide assignment instructions." for an empty instructions field. Not
  enforced on the incremental route.
- Also absent per the check that produced this ruling: `fullCreditChecklist`,
  `sampleAnswer`, `speedGraderUrl`, and `sectionRef` (scroll-into-view /
  modal fallback ref).

All of the above was re-verified directly (grep + read), not taken on faith.

## What this change does, and does not do

This is a **reachability gate**, not a revert and not a redesign. Every line
of the incremental pool - the ticket plan, the concurrency pool, the
ordering guarantees - is untouched and still fully present, reachable the
moment the gate is lifted.

`routeGradingRun` now checks a new module-private constant,
`INCREMENTAL_ROUTE_ENABLED`, before any of its existing logic runs:

```ts
export const INCREMENTAL_ROUTE_ENABLED = false;
...
export function routeGradingRun(fd: FormData, provider: LlmProvider): "whole-run" | "incremental" {
  if (!INCREMENTAL_ROUTE_ENABLED) return "whole-run";
  ... // every existing branch, unchanged
}
```

With the flag `false`, every request - regardless of provider, Canvas URL,
or file size - now routes to `"whole-run"`, the thicker surface that already
carries rubric provenance, rubric auto-generation, and the blank-instructions
refusal.

A module-private constant (not an environment variable) was chosen so
behavior is identical in every environment - local, preview, and production -
while the shape question below is still open. An env-var read would let the
default vary by deployment configuration before the owner has ruled, which
is exactly the kind of silent divergence this fix exists to prevent.

## What is NOT done here, on purpose

The missing pieces (RubricProvenance, rubric auto-generation, the
blank-instructions refusal) are **not** added to the incremental route in
this change. Doing so would pre-empt an owner decision that has not been
made: what the incremental run's `GradingRun` shape should actually be, and
whether these three things belong on that route at all, or whether the
route itself needs to change shape first. That decision is with the owner.

## Verification performed

- Flipped `INCREMENTAL_ROUTE_ENABLED` to `true` and ran
  `incrementalRunPlan.test.ts`: 3 tests went RED as expected (the two
  RULING-116 routing assertions and the "flag is off" assertion), 13 passed.
- Flipped it back to `false`, re-ran: 16/16 green.
- `git diff` on the source file after flipping back shows only the intended
  change (verified against a pre-flip backup taken outside the repo).

## Residual

The shape question - what the incremental route needs before it can safely
be the default - is with the owner. This ruling only stops the regression
from being reachable by default; it does not resolve it.
