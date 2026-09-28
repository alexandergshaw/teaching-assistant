# RULING 129: two students with the same display name no longer get each other's Canvas grades

Closes `docs/a46-canvas-collision-scope.md`'s residual R2 (shape 5: two
distinct Canvas students whose display names happen to be equal). This is a
correctness fix on a live path, not a hypothetical.

## The defect, as found

Canvas hands the app an authoritative numeric identity (`userId`) alongside a
merely decorative display string (`student`) that Canvas does not guarantee
is unique - two enrolments can share a `sortable_name`/`display_name`, or two
submissions whose `user_id` was not a number both fall back to the literal
`"Unknown student"` (`src/lib/canvas/submissions.ts:111-115`).

`extractCanvasEntries` (`src/lib/grade/extraction.ts`) preserved both rows -
it is a positional array push, never a group-by. The collision was absorbed
one layer later, in `seedEdits` (`src/app/components/grading-results/
gradingResultsHelpers.ts`), which keys a `Record<string, RowEdit>` on the bare
`student` display. Two results sharing a display left ONE slot, holding the
SECOND result's score and comment. `GradingResults.tsx`'s payload builder then
paired each row's own correct `userId` with that one shared, last-writer-wins
`RowEdit` - so one student's PUT to Canvas carried a grade computed from the
other student's submission.

The zip path never has this problem, because its identity key is *derived
from* the display (lower-cased), so two surviving rows can never share one.
Its own terminal pass (`groupSubmissionsByStudent` in `src/lib/grade/utils.ts`)
guarantees pairwise-distinct displays for the case where two DIFFERENT
identity keys coincidentally fold to the same raw display. The Canvas path
never inherited that pass, because it never needed a key-fold to begin with -
identity and display are two independent fields there.

## What this change does

1. **Extracted `assignUnclaimedLabel`** (`src/lib/grade/utils.ts`) out of
   `groupSubmissionsByStudent`'s own terminal disambiguation loop - the exact
   same "first unclaimed label against a `takenLabels` set, never a counted
   suffix" mechanism, now a named, independently-callable pure function.
   `groupSubmissionsByStudent`'s own behavior is unchanged: the loop now
   calls the extracted function instead of duplicating the `while` loop
   inline. The zip path's own oracle
   (`src/lib/grade/identityInvariants.test.ts:505`'s
   `expect(new Set(displays).size).toBe(displays.length)`, run across 27
   frozen fixtures and 16 generated shapes x 20000 sets each) is unchanged
   and still green - see the gates section below.

2. **A new pure export, `disambiguateCanvasEntries`** (`src/lib/grade/
   extraction.ts`), reusing `assignUnclaimedLabel`. Given an array of
   `StudentSubmissionEntry`, it returns an array whose `student` values are
   pairwise distinct, walked in entry-array order (a function of the entries
   alone), touching nothing but `student` - `userId` and every other field
   pass through unchanged. The first entry holding a given display keeps it
   unchanged; a later entry sharing that display gets the first unclaimed
   `"<display> (2)"`, `"<display> (3)"`, etc.

3. **Wired into all three non-test call sites of `canvasWorkToEntry`**
   (verified by a brace-matched parse, not `grep -c` - see
   `docs/a46-canvas-collision-scope.md` section 10.3 for why the naive count
   is 4.3x wrong):
   - `extractCanvasEntries` (`src/lib/grade/extraction.ts`) - the incremental
     route's entry-build step.
   - `gradeCanvasUrl` (`src/lib/grade/engine.ts`) - the whole-run Canvas path.
     This one is NOT behind `INCREMENTAL_ROUTE_ENABLED` and is the path a
     Canvas grading run takes today, so it was the live half of the defect.
   - `gradeOneSubmissionAction` (`src/app/actions/grading.ts`) - a single
     submission, which cannot collide with anything by itself. Wired anyway,
     as a no-op on a one-element array, so a later caller here that grows to
     build several entries at once cannot forget the disambiguation.

## What this change deliberately does NOT do

- **No refusal was added.** A refusal is the right response when the app
  genuinely cannot tell two students apart (that is what the zip path's
  `collisionRefusal.ts` is for). Canvas always can, via `userId` - refusing a
  run because two real students in a course happen to share a display name
  would be a regression, not a fix.
- **`seedEdits` was not re-keyed.** It still keys on `student`. The fix runs
  one layer upstream, at Canvas entry-build time, so two results sharing a
  display should never reach `seedEdits` in the first place once the three
  call sites above are wired to `disambiguateCanvasEntries`. Re-keying would
  have cost a second stored-edit-loss migration of the kind RULING 93 already
  accounted for once, for a fix the defect does not require.
- **The Canvas fetch layer does not dedupe.** Two same-named submissions are
  two real students and must stay two rows; `disambiguateCanvasEntries` only
  relabels, it never drops an entry (see the entry-count positive control in
  `src/lib/grade/extraction.test.ts`).
- **What the disambiguated label SAYS was not decided here.** `"Smith, John
  (2)"` is honest about distinctness but does not tell the instructor which
  John is which, even though Canvas holds a real discriminator (`userId`) the
  zip path never had. That is a UX/copy decision the scope document
  (`docs/a46-canvas-collision-scope.md`, RES-A46R2-6) left to the owner or a
  UX seat; this change reuses the zip path's existing wording rather than
  inventing new copy.
- **`GradingResults.tsx` was not touched.** Nothing in this fix needs it - the
  payload builder (`:346-356`) still reads `edit = edits[r.student]`, but
  because `r.student` is now guaranteed distinct per Canvas run, `edits` never
  collapses two rows onto one slot for this defect's shape. Verifying the
  actual outgoing PUT payload end-to-end would require rendering or invoking
  that component, which nothing in this repo's test setup can do (`vitest`
  is node-env and collects only `src/**/*.test.ts`; no component is ever
  mounted) - see "What remains unproven" below.

## What this change does NOT protect against - state plainly, not hedged

**If two Canvas submissions can ever share the same `userId`** - the same
human enrolled twice, a re-enrolment, or a pagination boundary that serves one
submission twice mid-walk - then disambiguating the DISPLAY makes the
collision LOOK handled while the underlying double-PUT does not go away: two
PUTs to one `userId` still overwrite, the second silently winning. This
change does not detect or prevent that case; it only prevents the
DIFFERENT-userId, SAME-display collision (two distinct students who happen to
share a name).

`docs/a46-canvas-collision-scope.md` names this as RES-A46R2-2 and states it
requires either a live Canvas + token (this checkout has neither and the test
setup blocks all real network calls) or a mocked-`canvasFetch` test against
`fetchAssignment`'s pagination handling. The pagination half is buildable
here and is NOT part of this write set - it touches `src/lib/canvas/
submissions.ts` and its own test file, neither of which is in this ruling's
assignment. It is left as an explicit residual, owned by whoever next touches
`fetchAssignment`, rather than silently assumed safe by this change.

## Proof

### RED before / GREEN after, on the real defect

Temporarily mutated `disambiguateCanvasEntries` to `return entries.slice();`
(the unclaimed-label loop entirely removed) and re-ran the affected tests:

```
FAIL src/lib/grade/extraction.test.ts > disambiguateCanvasEntries (RULING 129)
  > makes two Canvas entries sharing a display pairwise distinct...
  AssertionError: expected 1 to be 2

FAIL src/lib/grade/extraction.test.ts > disambiguateCanvasEntries (RULING 129)
  > three entries sharing one display each get a distinct, first-unclaimed label...
  AssertionError: expected [ 'Smith, John', 'Smith, John', ... ] to deeply equal
  [ 'Smith, John', 'Smith, John (2)', 'Smith, John (3)' ]

FAIL src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
  > RULING 129 ... > GREEN: run through the real fix ...
  AssertionError: expected 1 to be 2

Test Files  2 failed (2)
     Tests  3 failed | 43 passed (46)
vitest exited 1
```

Restored the real implementation (verified byte-identical to the pre-mutation
file via `diff` against a `cp` backup taken outside the repo) and re-ran the
full targeted set: 12 files, 299 tests, all green, exit 0 (see the Gates
section). This is the required mutation proof (brief item 4) and doubles as
the RED/GREEN demonstration (brief item 1): with the unclaimed-label loop
gone, the pipeline behaves exactly as it did before this ruling landed.

### The nearest reachable seam toward the post payload

`GradingResults.tsx` is out of this write set and nothing in this repo's test
setup renders a component, so the actual outgoing Canvas PUT payload cannot be
exercised end to end here. The closest reachable seam is `seedEdits`
(`src/app/components/grading-results/gradingResultsHelpers.ts`), which is the
exact function that absorbed the collision (section 3.2/3.3 of
`docs/a46-canvas-collision-scope.md`). `gradingResultsHelpersEditState.test.ts`
now proves:

- **Without the fix** (raw, still-collided Canvas-style results fed directly
  to `seedEdits`): one slot for two results - the defect, characterized
  directly.
- **With the fix** (the same two same-display, different-`userId` inputs
  routed through `disambiguateCanvasEntries` before becoming results): two
  `seedEdits` slots, `"Smith, John"` and `"Smith, John (2)"`, each carrying
  its OWN score (`18/20` and `12/20` respectively) - not the collapsed,
  last-writer-wins value.

What remains unproven: that `GradingResults.tsx`'s payload builder
(`:346-356`, `edits[r.student]` paired with `r.userId`) actually consumes
these now-distinct `edits` keys correctly at render/interaction time, and
that the two rows do not collide via a different mechanism inside that
component (e.g. the duplicate-React-key concern `docs/a46-canvas-collision-
scope.md` section 3.4 already flagged as unverifiable in this repo). That
remains an owner/browser check, per that scope document's RES-A46R2-5.

### Positive controls

- **Zip path unchanged**: `src/lib/grade/identityInvariants.test.ts` (107
  tests, including the pairwise-distinctness oracle at `:505` across 27 frozen
  fixtures and 16 generated shapes x 20000 sets each) is untouched and green.
- **Single Canvas submission unchanged**: `extraction.test.ts`'s
  `disambiguateCanvasEntries` positive control asserts a one-entry array is
  returned exactly as given.
- **Two differently-named Canvas submissions unchanged**: a second positive
  control asserts two entries with distinct displays come back unchanged and
  `===` their inputs (not merely `toEqual`) - a disambiguator that renames
  when it does not need to would fail this.

## Gates

- `npx tsc --noEmit --incremental false` - exit 0.
- `npm run lint` - exit 0, 7 pre-existing warnings (0 errors), all in files
  this ruling did not touch.
- `npm run build` - reached `Compiled successfully in 20.0s` and
  `Finished TypeScript in 67s`; the subsequent static-page prerender failure
  (`/account/integrations`, missing Supabase env vars) is the expected,
  env-dependent tail this checkout cannot pass without a `.env` - not part of
  this gate's pass condition.
- Targeted set via `npm run test:paths --`: `src/lib/grade/utils.test.ts`,
  `src/lib/grade/extraction.test.ts`, `src/lib/grade/engine.test.ts`,
  `src/lib/grade/engine.ungraded.test.ts`,
  `src/lib/grade/grouping-zip-parents.wiring.test.ts`,
  `src/lib/grade/identityInvariants.test.ts`,
  `src/lib/grade/collisionRefusal.test.ts`,
  `src/lib/grade/collisionRefusal.wiring.test.ts`,
  `src/app/components/grading-results/gradingResultsHelpersEditState.test.ts`,
  `src/app/actions/grading.guard.test.ts`, `src/lib/no-emojis.test.ts`,
  `src/file-size-ceiling.structure.test.ts` - 12 files, 299 tests, all
  passed, exit 0.
- Full suite (`npm test`, redirected to a file and read back): 1160 files
  passed (1160), 23232 tests passed (23232), exit 0. Baseline at the start of
  this pass was 1160 files / 23202 tests; the +30 tests are this ruling's 6
  new tests plus concurrent work landing elsewhere in the tree during this
  session (auto-commit), not a discrepancy in this ruling's own count.
- File sizes, both `wc -l` and PowerShell `@(Get-Content).Count`, agreeing on
  all seven touched files: `src/lib/grade/utils.ts` 594, `src/lib/grade/
  extraction.ts` 353, `src/lib/grade/engine.ts` 487, `src/app/actions/
  grading.ts` 946 (closest to the 1000 ceiling; this ruling added five lines
  to it), `src/lib/grade.ts` 26, `src/lib/grade/extraction.test.ts` 330,
  `src/app/components/grading-results/gradingResultsHelpersEditState.test.ts`
  520.
