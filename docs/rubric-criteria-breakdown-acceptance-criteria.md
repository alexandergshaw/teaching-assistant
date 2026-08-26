# Per-criterion score and percentage breakdown - acceptance criteria

Requested 2026-08-26, verbatim: "if a rubric is supplied, there should be a
score/percentage breakdown of how much of each criteria to award each
student".

## VERDICT: partly exists. Two different jobs, not one.

**Job A - a dead capability on Repo Grades.** `rubricAreas` is written onto
every cell by both grading paths (`useRepoGradesGradingActions.ts:263`) and
read back by exactly three non-test files: the type declaration, the
post-plan builder, and comments. ZERO `.tsx` files read it.
`RepoGradeCellControl.tsx:91` already receives the whole `edit` object
(`RepoGradesGrid.tsx:413`), so `edit.rubricAreas` is in scope and simply
never rendered. Plumbing 100 percent, display 0 percent.

**Job B - the percentage, which is genuinely absent everywhere.** A
breakdown DOES already render on two other surfaces:
`GradingResults.tsx:489-500` and `:665-686` (one editable column per area,
sortable, CSV-exported via `gradingResultsHelpers.ts:162-191`), and
`DraftedGradesTab.tsx:632-654` (name, score, comment, preview/edit). But
every one of them shows the raw `"8/10"` string verbatim. No per-criterion
percentage exists anywhere in the app; the only percentage helper
(`repoGradeScoreDisplay.ts:89`) is applied to the total.

## B1 - Where the denominator comes from (get this wrong and it is confidently wrong)

1. The percentage is computed from the area's OWN `score` string and nothing
   else. `"8/10"` yields 80 percent.
2. It must NOT be sourced from `extractRubricCriteria`'s declared points.
   Three independent reasons, all verified:
   - `scaleResultToPoints` (`parsing.ts:224`) rescales every area's numerator
     AND denominator, so a rubric declaring `(10 pts)` graded against a
     20-point Canvas assignment leaves areas shaped `"2/5"`. Matching back to
     the declared points would produce a WRONG denominator that looks
     authoritative.
   - AI-generated rubrics are percent-based by construction
     (`rubric.ts:196`), so `points` is `null` for every criterion.
   - `extractRubricCriteria` has exactly ONE consumer today
     (`engine.ts:105` -> `buildSystemPrompt`), where the points become prompt
     text and are then discarded. It has never been matched back to results,
     and this is not the change that should make it load-bearing.
3. When the score string does not parse as a fraction, show the raw string
   and NO percentage. Never `NaN%`, never a fabricated denominator.
   `engine.ts:212` emits `""` for an area routinely, so this is a common
   path, not an edge case.

## B2 - Reuse, do not reinvent

4. `parseScoreFraction` / `scorePercentValue` / `formatScorePercent`
   (`repoGradeScoreDisplay.ts:50-93`) already exist, are tested, and are in
   the right folder. Use them.
5. `RepoGradeCellControl.tsx:127` already establishes the idiom: show a
   percent ONLY when it parses. Follow it.
6. There are already THREE near-identical copies of the earned-only score
   regex in this codebase. Do not add a fourth - consolidate onto the
   existing helper or leave them alone, but do not grow the family.
7. There is no progress bar, meter, or `LinearProgress` anywhere in `src/`.
   The app's visual language for a score is a muted `tabular-nums` string.
   Match it. Do not introduce bars.

## B3 - The posting promise, which currently cannot be kept

8. Breakdowns NEVER post to SpeedGrader from Repo Grades today, for any
   rubric. Verified chain: `gradeRepoAction` omits `pointsPossible`
   (`github-repos.ts:687`), so every fresh grade is fraction-shaped;
   `resolvePostScore` marks every fraction `rescaled: true` with no
   short-circuit (`repoGradePostScore.ts:81-83`); `repoGradesPosting.ts:285-288`
   suppresses the breakdown before criterion-name matching is ever reached.
9. Making the breakdown VISIBLE creates a reasonable expectation that it
   reaches the gradebook. It does not. A truthful one-line statement must sit
   with the breakdown.
10. That statement MUST be driven by an exported predicate SHARED with
    `buildRepoGradePostPlan`. Duplicating its three-clause condition inside a
    `.tsx` is the single likeliest way to ship a lie that silently drifts out
    of sync with the real posting rule.
11. Do NOT "fix" this by loosening the suppression. That re-opens
    `docs/REGRESSION.md` entry 350a - a silent 68-point gradebook error with
    no undo. Making breakdowns actually post is a separate, larger change and
    is explicitly OUT of scope here.

## B4 - A live bug found during research, fixed as part of this work

12. Hand-retyping a score from `"13/16"` to a bare `"13"` defeats BOTH
    suppression gates and posts raw, unscaled areas to the live gradebook.
    This is a real defect on the current code, independent of the breakdown.
    Fix it and record it separately in the shipped entry rather than folding
    it into this feature's claims.

## B5 - Totals and areas already disagree, four ways

13. Each of these exists today and must be either fixed or explicitly
    baselined before the breakdown makes them visible - a breakdown that
    contradicts the total on screen is worse than no breakdown:
    - `updateEdit` edits the total without touching the areas.
    - `recomputeTotal` (`gradingResultsHelpers.ts:148`) keeps the OLD
      denominator.
    - `parseScoreValue` takes the first number, so `"85%"` contributes 85.
    - `postStatus` is never cleared on edit, so a row can read "posted" while
      the numbers have since drifted.

## B6 - Scope

14. Job A (render the existing breakdown on Repo Grades) and Job B (add the
    percentage to all three surfaces) ship together, because a breakdown
    without a percentage is the thing the instructor already has and called
    missing.
15. All posting behaviour is unchanged by this work.

## B7 - Verification

16. vitest is node-env, collects only `src/**/*.test.ts`, and NEVER renders a
    component. The specific trap named by the research: the percent helper
    gets exhaustively unit-tested while the `.tsx` still never mentions
    `edit.rubricAreas` - which is LITERALLY the current state of this field.
    So a source-reading guard proving the component reads `rubricAreas`, with
    a canary, is mandatory, not optional.
17. Fixtures must include a blank score, a non-fraction score, and a percent
    string - not only `"8/10"` - or the parse-failure branch is never
    exercised and `NaN%` ships.

## Sequencing

Begins after the three-feedback-box chunk pushes; both touch
`GradingResults.tsx` and the grading result type. A BASELINE entry goes into
`docs/REGRESSION.md` first, covering B5's four disagreements and B3's
suppression chain, in the shape of entries 352 and 354.
