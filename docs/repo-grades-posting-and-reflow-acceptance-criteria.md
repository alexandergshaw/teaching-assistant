# Repo Grades: honest grade posting, and a grid that reflows at half width

Two changes to the Repo Grades view (`src/app/components/repo-grades/`).

## The headline finding: posting to the live LMS ALREADY WORKS

A full reuse survey found grade posting to Canvas implemented end to end in this
view, not missing:

- `postCanvasGradesAction(url, grades)` - `src/app/actions/grading.ts:92`, bulk,
  delegating to `postCanvasGrades` (`src/lib/canvas/grades.ts:22`) which PUTs
  `/api/v1/courses/<id>/assignments/<id>/submissions/<userId>` and never throws
  on one student's failure.
- The decision layer is `repoGradesPosting.ts` in full:
  `repoGradePostCandidateRows` (`:95`), `buildRepoGradePostPlan` (`:123`),
  `fanOutRepoGradePostResult` (`:191`), `repoGradeAssignmentUrl` (`:221`).
- The execution layer is `index.tsx:275-329` `handlePostColumn`, with a confirm
  dialog, per-cell `"posting"/"posted"/"error"` status, and an aria-live summary.
- Repo-to-Canvas-student identity mapping exists too:
  `suggestRepoStudentBindings` (`src/lib/repo-student-bindings.ts:213`), a
  four-state binder (`confirmed`/`suggested`/`ambiguous`/`unbound`) with an
  explicit accept path that writes `Course.studentRepos`.
- Postability is gated by `src/lib/repo-grade-postability.ts:38`.

So this chunk does NOT build posting. It closes the real gaps the survey found,
the most serious of which is a genuine defect.

## Acceptance criteria - A, posting

A1. **THE SELECTION MUST GOVERN WHAT GETS POSTED.** Today `selected`
(`index.tsx:106`) gates NOTHING on the posting path: `handlePostColumn` posts
every postable row in the column (`:277`), ignoring the checkboxes entirely.
That is a live surprise on a no-undo write to a real gradebook - the instructor
ticks four students and the app grades-and-posts thirty. When a selection
exists, post only the selected rows. When no selection exists, keep today's
"whole column" behaviour, and say which of the two is about to happen in the
confirm dialog.

A2. **THE CONFIRM DIALOG MUST NAME WHAT IT IS ABOUT TO DO.** It already says
"Post N grade(s) to Canvas? This writes to the live gradebook." It must also make
the scope unambiguous (selected rows vs the whole column) so A1's two modes are
never confused. Keep the existing wording as the base - it is deliberately
byte-identical to `GradingResults.tsx:293-295`.

A3. **RUBRIC DETAIL MUST STOP BEING SILENTLY DISCARDED.** `gradeRepoAction`
returns `rubricAreas: RubricAreaResult[]` on every result, and
`handleGradeCell` (`index.tsx:254-262`) throws them away, keeping only
`totalScore` and `overallComment`. Meanwhile `postCanvasGrades` (`:86-96`)
already supports `rubricAreas` and `GradingResults.tsx:308-311` already sends
them. So this view posts a bare number where every other path posts a populated
rubric. Carry `rubricAreas` through and include them in the payload.
IMPORTANT: follow the precedent at
`src/lib/workflows/registry/steps.grading-draft-flow.ts:595-625` - when the
instructor has EDITED the total score by hand, the rubric breakdown that no
longer sums to it must NOT be posted alongside it. A contradictory rubric is
worse than none.

A4. **A PARTIAL FAILURE MUST BE RETRYABLE WITHOUT RE-POSTING THE SUCCESSES.**
Today a column post that half-fails leaves per-cell errors and no way to retry
just those. Add a per-row post/retry affordance, mirroring
`GradingResults.tsx:363-390` `handlePostOne` (one-element array, only that row's
status touched). Re-posting an already-posted row must be a deliberate act, not
a side effect of retrying its neighbour.

A5. **NOTHING ABOUT THE EXISTING WRITE PATH REGRESSES.** `postCanvasGradesAction`,
`postCanvasGrades`, `repoGradeAssignmentUrl` and `suggestRepoStudentBindings` are
NOT to be modified. Note `repoGradeAssignmentUrl` has a second consumer -
`src/app/components/github-grading/useLmsAssignmentPull.ts:263` - so changing its
signature would break another view. `repoGrades.wiring.test.ts` asserts the
grading and posting actions are only ever click-gated and never called from a
`useEffect`; that must stay true.

## Acceptance criteria - B, reflow at half width

B1. **NO HORIZONTAL SCROLLING OF THE GRID AT HALF-SCREEN WIDTH.** Today the answer
to narrow width is explicitly to scroll: `.gridWrap { overflow-x: auto }`
(`repo-grades.module.css:13`), `.grid th, .grid td { white-space: nowrap }`
(`:30`), plus three `min-width` floors - `.bindingCell` 220px (`:66`),
`.columnHeader` 190px (`:196`), `.cellControl` 170px (`:220`). With four
assignment columns the table cannot go below roughly 1350px. The view must
instead REFLOW so the content is usable in a half-width window.

B2. **THE WHOLE VIEW, NOT ONLY THE TABLE.** The course `<select>`
(`index.tsx:345`) and sort `<select>` (`:387`) carry no width rule at all and
size intrinsically off their longest option, so a long course name alone can
force overflow. Every control in the view must be checked and constrained. The
org-prefix row (`:368-380`) is already fluid and is the in-file model.

B3. **PICK ONE REFLOW STRATEGY AND APPLY IT CONSISTENTLY.** Two in-repo
precedents, both documented:
`page.module.css:1880-1893` (`.libRow` - shed lower-priority columns) and
`:1956-1965` (`.automationRunsRow` - collapse to stacked cards). Choose the one
that suits a dense per-student-per-assignment grid, justify the choice in a CSS
comment, and do not mix both. Whatever is chosen, the repo name and its binding
state must remain visible - they are what identifies whose grade is being
written.

B4. **STICKY HEADERS MUST UN-STICK WHEN THEY STOP HELPING.** `.grid thead th` is
`position: sticky` (`:33-40`). Follow the accessibility precedent at
`TasksGrid.module.css:947-966`, which un-sticks at narrow width and cites WCAG
2.2 SC 1.4.10 Reflow as the reason.

B5. **ESTABLISH THE BREAKPOINT, DO NOT ADD A FOURTEENTH AD-HOC ONE.**
`page.module.css` already carries 13 distinct width breakpoints with only
`600px` and `880px` repeating, and `globals.css` defines NO width breakpoints at
all. Reuse an existing value rather than inventing a new one, and comment why
that value. Use `@media`, not container queries: the app has no split-pane or
sub-viewport layout mode (verified - there is no half-screen pane anywhere), so
"half screen" means a half-width browser window, which `@media` measures
correctly. Container queries would be a first for this codebase and are not
warranted here.

B6. **NO REGRESSION IN THE FULL-WIDTH LAYOUT.** At normal width the grid must look
and behave exactly as it does today.

## Cross-cutting

X1. Pure logic (which rows a post will target, the payload built from a
selection, the rubric-vs-edited-total decision) is unit-tested with in-memory
fixtures and no `vi.mock`.

X2. NO EMOJIS. `repo-grades.module.css` is at 249 lines against this repo's
1000-line-per-CSS-module convention, so there is room; keep new CSS there rather
than in `page.module.css`. Note
`src/app/components/courses/page-module-css-classes.test.ts` asserts every
`pageStyles.*` class referenced actually exists in `page.module.css` - it will
fail on a typo'd class name.

## Limits (state, do not paper over)

- vitest is node-env and renders no component, so NOTHING here proves the reflow
  actually happens, that a checkbox is reachable, or that a header un-sticks.
  All of B is verified by reading CSS, not by test.
- Canvas is never exercised; posting correctness is proven at the plan/payload
  level only.
- Points-possible anchoring (re-basing a score against the assignment's
  `pointsPossible`, which `CanvasAssignmentBrief` already carries and this view
  loads but ignores) is NOT in this chunk - flagged as a follow-up rather than
  silently skipped.
