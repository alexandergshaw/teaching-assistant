# A38 - orchestrator rulings, round 2, 2026-09-23

The round-2 check of `docs/a38-scope.md` returned NOT BUILDABLE AS WRITTEN:
6 blockers, 8 majors, 8 minors. **Two of the six land on my round-1 rulings and
no seat revision can resolve them** - they are Rulings 6 and 7 below. The rest
go back to the seat as design it can settle by measurement.

Not reopened - the check re-measured and confirmed: both section 2.3 greps, the
capture-status absence (re-run unfiltered across all 56 hits, which is the right
way to prove an absence), the panel at 990 by the mandated counter and 947 by the
other, B4's hazard at `assessment-row.ts:173-189`, the `fnv1aHash` import at
`WalkthroughAnnouncementPanel.tsx:57` and its call at `:610`, the three
cohort-clearing branches, the 7-key canary, and `EXPECTED_WIRE_KEYS` at 19. It
also judged the feature-already-exists case WEAK, which is right.

## RULING 6 - MY RULING 2 NAMED A MECHANISM THAT CANNOT COUNT THE THING IT CAPS

I ruled the aggregate-spend cap be built on the digest's wire, because section
4.2 had already established a per-row field that survives a reload. The check
found the hole: **that wire only runs on SUCCESS.** The only named writer is
`classifyGradingResult`, which never runs when the action returns `{ error }` -
which the scope states itself at `:736-738`.

A failed call still costs a model call. So the cap as I ruled it counts exactly
the presses that worked and is blind to the presses that burned money and
returned nothing - which is the failure mode a spend cap exists for, because a
row that fails is the row an instructor presses again.

**Ruling 2 is AMENDED, not withdrawn.** The cap is still built and still rides a
persisted per-row count. What changes is where the count is written: **the
attempt is recorded when the call is DISPATCHED, not when it is classified.** A
count incremented before the await is the only one that survives an error, a
timeout, and a navigation away mid-call. It also changes the field's meaning
from "successful grades" to "model calls spent", which is the quantity a spend
cap is actually about - and the scope must say so at the field, because a name
like `gradeAttempts` reads either way.

Recording the reasoning error for the same reason I recorded the denylist one in
A29: I reasoned from "4.2 already persists something, so reuse it" without
asking WHEN that something is written. Reuse is the right instinct and the wrong
question - the question is whether the existing mechanism fires on the paths the
new requirement cares about, and here it fires on precisely the complement.

## RULING 7 - MY RULING 1 CREATED A GATE WITH NO THRESHOLD

I ruled that an extraction wave precedes the feature and the feature's budget is
measured against the post-extraction count, with the feature waiting if the
extraction falls short. **I never said short of WHAT.** The seat filled the gap
with three different numbers - `~38` at `:750`, `~45` at `:181`, `~50` at `:706` -
which is a repeat of the same defect Ruling 4 already flagged in round 1, where
the cap and the ceiling disagreed by one on the number the whole shape turned on.

A gate whose threshold is unstated is not a gate; it is a place where whoever
runs it picks a number, and three passes picked three. **Ruled: the threshold is
ONE number, derived and stated once in the scope, and every later mention cites
that one place rather than restating it.** Derive it as the measured post-
extraction count plus the re-costed feature addition against the hard limit of
1000 (red at 1001), and show the arithmetic. If the three existing estimates
disagree because they measure different things, say what each measures - that is
a real answer and it may dissolve the conflict.

## RULING 8 - B-1 IS THE FINDING OF THE PASS. A silent-green deadlock.

The lock releases in `finally`, but `handleGradeAll`'s readiness refusal returns
at `GradingRecordingPanel.tsx:575`, BEFORE the `try {` at `:579` - and the
scope's own three-line snippet claims the lock above that return. One press of
"Grade submissions" with no rubric claims the ref for the life of the component,
and section 4.5 makes the subsequent refusal a SILENT no-op.

**Every gate stays green.** Lint, tsc, `next build`, every structure test and the
whole section 6.5 gate pass, and the feature is dead on the second click. P-4 and
P-5 both miss it. This is the exact class this project keeps rediscovering - a
capability that ships dead with the suite green - and it is worth noting that it
arrives here through a LOCK, which is machinery added for safety.

Ruled: the claim moves inside the `try`, or the refusal path releases explicitly.
The scope picks one and says why, and the instrument is a test that presses twice
with the second press expected to WORK - not a test that asserts the lock is
claimed, which is what P-4 does and why it cannot see this.

## RULING 9 - B-4: N is wrong in the direction that matters

The cap's N was set to `totalCount`, but a bulk press spends
`min(totalCount, maxSubmissions)` with `DEFAULT_MAX_SUBMISSIONS = 40`
(`gemini.ts:32`) - which the scope writes six lines above setting N. So N exceeds
one bulk press by `totalCount - 40` **exactly in the overflow case A38 exists
for**: on 200 rows the confirm first appears after 200 calls against a re-run's
40. `totalCount` is also course-scoped, so N moves with the course selector.

Ruled: N is derived from what one press can actually spend, which is the min, and
the scope states the course-scoping behaviour explicitly rather than inheriting
it. P-13 passes on this by construction today and must be re-shaped to fail.

## RULING 10 - B-3 and B-6 go back, and B-3 is a REPEAT

- **B-3** - the offer sentence is still false on reachable states. `failed` has
  four producers in `grading-submission-grade.ts` (`:180`, `:182`, `:188`,
  `:196-208`) and only one is the bound, so the sentence about getting past the
  run limit renders on never-run rows, successfully-graded rows and LLM-failure
  rows. This is the third round in this family where a sentence shipped true of
  one producer and false of the others. The rule from A31 Ruling 1 binds: a
  sentence may assert only what holds on EVERY caller and EVERY reachable state.
  And the split placement - message in the Status cell at `GradingTableRow.tsx:157`,
  control in the Actions cell at `:172` - cannot satisfy both the shape ruling and
  P-9's "same conditional expression". Resolve it; do not carry both.
- **B-6** - the same false assertion sits uncorrected at
  `grading-submission-grade.ts:200-205`, INSIDE the overflow loop, while section
  7.2 scopes the fix to the header at `:58-63`. Fix both or say why one stays.
- **B-5** - the wave-0 budget contradicts itself: section 2.3 moves lines
  `682-692`, which include a hook at `:692`, and section 2.4 says the hooks stay.
  The two branches give ~928 and ~939, and the second needs a tenth prop. Pick
  one, and if the hook moves, the measured `preserve-manual-memoization` lint
  hazard in `this-repo.md` section 1 applies.

## RULING 11 - my Ruling 3's B5 was WRONGLY REASONED, and the check is right

I said the live gate bans the one spelling the sibling canary recommends, so the
design would turn the build red on the spelling an implementer is steered toward.
That is wrong. `:218` does not demand `variantFor(` - it bans the
`? "contained" : "outlined"` literal and merely RECOMMENDS `variantFor` in a
failure message. `FROZEN_PRIMARY_SITES` is a ratchet its own comment at
`:159-162` says to bump deliberately, not a wall.

And my implied worry that a plain button would be a worse control is also wrong:
`pageStyles.linkButton` is styled (`page.module.css:800/:809/:817`) and
`RepoGradeCellControl.tsx:567-576` ALREADY SHIPS THIS EXACT CONTROL, which makes
it the app's existing visual language rather than a retreat from it.

**The seat's chosen design stands; only the reasoning that reached it changes.**
I am recording this rather than quietly correcting it, because a ruling that
reaches a right answer through a false premise will be cited later for the
premise - and the premise here was "a lint gate has dictated a worse control",
which is the kind of claim that gets reused.
