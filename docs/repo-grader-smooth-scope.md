# Repo grader smoothing - recon and scope (backlog A7 pass, RULING X-1)

Status: SCOPE ONLY. No production code. Authored by the recon + scope seat
(Sonnet), 2026-10-04, to be adversarially checked before any build.

Owner request, verbatim: "the repo grader ... need[s] to be far more smoother
and easier and less clicks to use."

Owner addendum (second paramount dimension, co-equal with click count):
minimize SCROLL DISTANCE and CURSOR TRAVEL to set up a run, not just clicks.

Constraint carried from the owner and the repo: make it smoother and cheaper
WITHOUT dropping any confirm or guard. Click cost is first-class but is never
traded against a confirmation step.

Instrument limits, stated once and binding on every number below: no component
is rendered by any test here, there is no `.env`, and I ran NO tests, tsc,
lint or browser. File line counts come from `@(Get-Content f).Count` /
`wc -l`; click counts are counted by reading the code; layout pixel figures are
ARITHMETIC FROM CSS TOKENS and are labelled ESTIMATE. Nothing here was measured
in a rendered page.

---

## 0. Which surface, and what already exists

"Repo grader" maps to TWO mounted surfaces. Both are real.

- PRIMARY: Repo Grades (`RepoGradesTab`, mounted at `src/app/page.tsx:629-630`
  when `gradingView === "repos"`). It is a grid of repos by folder, with Grade
  all and Post to Canvas per column. It lives in
  `src/app/components/repo-grades/` and is the surface that writes to a live
  gradebook. This is the owner's "repo grader".
- SECONDARY: GithubGradingPanel (`src/app/components/GradingTab.tsx:325-326`,
  reached via Grade from > GitHub Repo). It is a queue-and-grade-all surface
  with NO Canvas writeback. It passes `canvasUrl=""` at
  `GithubGradingPanel.tsx:854`, and posting in `GradingResults.tsx` is gated on
  Canvas user ids.

BACKLOG A7 ALREADY EXISTS for this exact view (`docs/BACKLOG.md:172`,
unscoped). It carries "RULING X-1 ... the acceptance number: count
interactions per graded repo before and after, setup separately from steady
state". It says an earlier UX overhaul shipped
(`docs/repo-grades-ux-overhaul-acceptance-criteria.md`, 2182 lines), so this is
a SECOND overhaul and must not re-litigate that doc's settled decisions. THIS
SCOPE IS THE A7 PASS, with the owner's new clicks, scroll and cursor
dimension. Counts below follow RULING X-1: setup counted separately from steady
state.

### Staleness findings from the tree

- `src/app/components/repo-grades/index.tsx:171-175` says graded edits are not
  persisted because "GradingResults.tsx's edits/postStatus does not persist
  these either". That is FALSE for edits: `GradingResults.tsx:209-249` persists
  them via `persistGradingResultsEdits`. Only `postStatus` is React state. That
  comment is not a ruling and must not block the persisted-results fork (F3).
- `index.tsx:706-711` says the shell gives gap 28px and padding 36px. The CSS
  says `.card { gap: var(--space-6); padding: var(--space-6) }`
  (`src/app/page.module.css:29-36`), and `--space-6` is 24px
  (`src/app/globals.css:93`). This scope uses the CSS values.

---

## 1. CURRENT FLOW, click by click

### Counting convention

- One click is one pointer activation, including OK on `window.confirm`.
- A select or Typeahead is 2 clicks (open, then choose). The 2-click Typeahead
  count comes from reading MUI Autocomplete's default behaviour
  (`src/app/components/ui/Typeahead.tsx` has no `openOnFocus`); it is
  unverified at runtime (residual R8).
- Typing is not counted. Scroll is counted separately (section 1b).
- Clicks to navigate TO the view are NOT counted or measured (residual R9).
- Starting state: the course has a GitHub org and a Canvas link, and the wanted
  folder is present in the repos.

### Controls (Repo Grades), in DOM order

Citations are `file:line`, all opened. "Class" separates required-for-safety
clicks from incidental ones.

| # | Control | file:line | Clicks | Persists (ta- key) | Class |
|---|---|---|---|---|---|
| 1 | Course Typeahead | `repo-grades/RepoGradesControls.tsx:338-354` | 2 | `ta-repo-grades-course` (`repoGradesUiState.ts:21`) | incidental first time (could default when exactly one course exists); 0 on return |
| 2 | Repo filter and Refresh | `RepoGradesControls.tsx:366-377` | 0 (optional) | `ta-repo-grades-org-prefix` | the scan auto-runs on course or prefix change (`useRepoGradesData.ts:288-313`), so Refresh is not on the path |
| 3 | Assignment folder select | `RepoGradesControls.tsx:389-403` | 2 | `ta-repo-grades-folder`, per course (`repoGradesUiState.ts:109`) | incidental. Persisted `""` resolves to the first folder (`repoGradesFolderSelection.ts:182`), so 0 when the first folder is wanted. Display scoping only. |
| 4 | Sort select | `RepoGradesControls.tsx:443-468` | 0 | `ta-repo-grades-sort` | duplicates the header sort buttons (`RepoGradesGrid.tsx:132-138,369`) |
| 5 | README checkbox | `RepoGradesControls.tsx:478-485` | 0 (default on, `repoGradesUiState.ts:148`) | `ta-repo-grades-readme-instructions` | incidental |
| 6 | Only-checked-rows checkbox | `RepoGradesControls.tsx:491-498` | 0 (default off) | `ta-repo-grades-bulk-selection-only` | incidental |
| 7 | Score-code-execution checkbox and 4-line hint | `RepoGradesControls.tsx:511-524` | 0 (default off) | `ta-repo-grades-run-code-scoring` | incidental |
| 8 | Instructions textarea | `RepoGradesControls.tsx:532-537` | 1 focus (only if no README) | `ta-repo-grades-instructions` | incidental |
| 9 | Rubric source select | `RepoGradesControls.tsx:560-582` | 0 (default `generate`) | `ta-repo-grades-rubric-source`, per course | incidental |
| 10 | Rubric textarea | `RepoGradesControls.tsx:618-628` | 0 | `ta-repo-grades-rubric-manual-text`, per course | incidental |
| 11 | Link panel, source radios | `repo-grades/LinkUsernamesPanel.tsx:268-287` | 0 (default roster, `repoGradesUiState.ts:147`) | `ta-repo-grades-link-source` | incidental |
| 12 | "Apply usernames from the course table" | `repo-grades/LinkUsernamesRosterSection.tsx:145-154` | 1 | binding persists to the course row, not localStorage | the review step (see below) |
| 13 | "Confirm all N suggested bindings" and `window.confirm` | `LinkUsernamesPanel.tsx:415-428`, confirm at `:218` | 1 + 1 | n/a | REQUIRED FOR SAFETY. The binding decides which student a post lands on. |
| 14 | Per-row Confirm binding / unbound Bind | `repo-grades/RepoBindingControl.tsx:78-88`, `:178-202` | 1 / 2+1 | n/a | exception path |
| 15 | Per-column Canvas assignment select | `RepoGradesGrid.tsx:375-386` | 2 | `ta-repo-grades-assignment-map`, per course and folder (`repoGradesUiState.ts:45`) | incidental first time per folder |
| 16 | Grade all | `RepoGradesGrid.tsx:416-427`, handler `useRepoGradesGradingActions.ts:783-807` | 1, NO confirm | n/a | the run control |
| 17 | Post N grade(s) | `RepoGradesGrid.tsx:428-438` | 1 | n/a | required |
| 18 | Post confirm | `useRepoGradesGradingActions.ts:522` (`window.confirm`) | 1 | n/a | REQUIRED FOR SAFETY. The only guard before `postCanvasGradesAction` at `:554`. |
| 19 | Per-cell Grade; per-cell Post | `repo-grades/RepoGradeCellControl.tsx:567-597` | Grade 1; first post 2 (arm, then "Confirm post", `:587-592`), retry or re-post 1 | n/a | the per-cell first-post arm is a safety guard |

### GUARDS TO PRESERVE (all must survive every wave)

- Post confirm: `window.confirm` at `useRepoGradesGradingActions.ts:522`, the
  only guard before the bulk `postCanvasGradesAction` call at `:554`.
- Per-cell first-post arm: `RepoGradeCellControl.tsx:587-592` (arm, then
  "Confirm post"; retry or re-post stays one click by prior ruling at
  `:247-256`).
- Confirm-all-bindings dialog: `LinkUsernamesPanel.tsx:218`.
- Clear-log confirm: `repo-grades/RepoGradesLogPanel.tsx:132`.
- The disabled Post state when a column has no mapped assignment
  (`RepoGradesGrid.tsx:432`).
- The rubric-description span above Grade and Post
  (`RepoGradesGrid.tsx:395-405`), so the instructor sees the rubric BEFORE the
  irreversible click.
- The only two `postCanvasGradesAction` call sites
  (`useRepoGradesGradingActions.ts:554,674`).

Not a guard to preserve, but a discrepancy to report: Grade all has NO confirm
and spends one model call per repo. The earlier overhaul's U8.35 said a per-repo
model spend must not be reachable by one stray click, and "a stated count plus
a confirm" satisfies it
(`docs/repo-grades-ux-overhaul-acceptance-criteria.md:218-224,451-476`). The
shipped button states a count and has no confirm. The owner's DECISION 2
(`docs/owner-decisions-2026-09-23.md:41`) chose "confirm above N" for A38, a
different surface. THIS SCOPE NEITHER ADDS NOR REMOVES ANY CONFIRM (residual
R3).

### Clicks per path (RULING X-1: setup separate from steady state)

- P1, first time, first folder is the wanted one: course 2 + bind 3 (Apply,
  Confirm all, OK) + folder 0 + mapping 2 + Grade all 1 + Post 1 + confirm 1 =
  10. If another folder is wanted, +2 = 12.
- P2, returning, same course, folder and mapping, bindings already confirmed:
  Grade all 1 + Post 1 + confirm 1 = 3. This is the floor: lower means dropping
  the post confirm.
- P3, returning, new week's folder: folder 2 + mapping 2 + 3 = 7.
- P4, steady state per graded repo, bulk path: 3 / N clicks (0.1 at N = 30),
  plus 1 focus click per hand-edited score. Per-repo path: Grade 1, then first
  post 2 (arm, then confirm).

Of the 10 on P1, the 3 binding clicks and 2 of the 3 final clicks are
safety-required. The incidental clicks are course 2, mapping 2, and folder 2
when needed.

FINDING: clicks are already within 1-2 of the floor. The earlier Repo Grades
overhaul persisted 16 `ta-repo-grades-*` keys
(`grep -c '^const [A-Z_]+ = "ta-' repoGradesUiState.ts` returns 16). The
remaining cost is scroll, cursor travel and lost state.

### GithubGradingPanel clicks (reading only, no run)

On a first run:

- Source select 2 (persisted at `GradingTab.tsx:111,133`).
- Import from org: org Typeahead 2 + Import 1
  (`GithubGradingPanel.tsx:516-541`).
- Grading folder: Scan folders 1 + pick 2 (`:661-670`).
- Pull the instructions from an LMS assignment: roughly 5
  (`github-grading/LmsAssignmentPullSection.tsx`, not counted control by
  control).
- Grade all 1 (`:744`).

About 14-15 first time and unchanged for new work.

What persists: the queue (`ta-github-grading-queue`, `:53`), the grading folder,
the LMS course and assignment (`github-grading/githubGradingUiState.ts:38-43`)
and the last run (`src/lib/github-grading-run-store.ts`). What does NOT persist
(plain `useState`, `GithubGradingPanel.tsx:106-120`): `instructions`, `rubric`,
`selectedOrg`, `orgPrefix`, `workflowFile`, `rubricRepo`. That violates the
persist-every-control rule. After a reload the instructor must re-pull to refill
instructions and rubric. A returning run is roughly 2 clicks (re-pull, then
Grade all).

---

## 1b. SCROLL and CURSOR cost (owner's co-equal dimension)

Instrument limit: no component renders here, so the numbers below are
arithmetic from tokens, labelled ESTIMATE. The measuring instrument is the
DevTools snippet in AC5. The app chrome above the tab card (top bar and manual
rail) was not measured.

### Repo Grades DOM order

Source: `index.tsx:715-932`, `RepoGradesControls.tsx:334-644`. Everything below
sits above the Grade control:

1. TabHeader, about 101px (22px h1 plus 14px subtitle plus padding).
2. Course.
3. Repo filter.
4. Folder (+30px hint once a folder is chosen, `RepoGradesControls.tsx:411-413`).
5. Sort.
6. README checkbox.
7. Only-checked checkbox plus hint.
8. Code-scoring checkbox plus hint (4 or so lines at 14px/1.55).
9. Instructions textarea.
10. Rubric source (+ hints).
11. Rubric textarea.
12. Status banners (0 when clean).
13. LinkUsernamesPanel (`index.tsx:791`), rendered unconditionally whenever a
    course is set.
14. The "no confirmed rows" banner, when it applies.
15. The grid.

The Grade all button is inside the grid's `<thead>` column header, stacked under
the sort button, the assignment select and the rubric line
(`RepoGradesGrid.tsx:366-427`).

### Hard floors, both read from the CSS

- Two textareas at `min-height: 220px` (`page.module.css:229-230`), the
  instructions field and the rubric field: 440px, both above Grade all.
- 10 inter-block gaps x 24px = 240px (`page.module.css:34`).

### ESTIMATE (not rendered)

The sum of the fields, gaps and the link panel puts the top of Grade all about
1,900-2,000px below the tab card's top edge (card padding 24 + the 11 blocks
above at about 1,230 + 240 of gaps + link panel about 375). That is about 2
screens down on a 1080p display, before any app chrome. Assumptions: input
40px, label 17px, link panel about 350px. None of these were measured.

### Cursor path, common first run (estimates, same basis)

- Course (top, about y 150) to folder (about y 330) to the instructions block to
  the Grade button (about y 2000): roughly 1,850px of vertical travel plus 2-3
  scroll bursts.
- Inside the header cluster, select to Grade to Post are stacked within about
  100px (`RepoGradesGrid.tsx:366-438`). That is already tight.
- The native confirm opens at the window's top-centre, so the cursor travels
  from the grid back to the dialog.
- After Grade all, a graded cell stacks a score field, 3 feedback boxes
  (`grading-results/RowFeedbackBoxes.tsx:150` `minRows={2}`), a rubric
  breakdown, a code-run block and actions. Estimated 300-400px per graded row,
  so about 9,000-12,000px to review 30 rows. Post is back up in the column
  header, so reviewing means scrolling down and then back up to Post.

### Sticky header, reading claim only

The `<thead>` carries `position: sticky; top: 0`
(`repo-grades/repo-grades.module.css:50-57`), but `.gridWrap` has
`overflow-x: auto` (`:21-25`). That makes it the scroll container for sticky, so
the header is expected NOT to stick to the page. Not verified in a browser
(residual R2).

### GithubGradingPanel DOM order

Add repo, org import, queue table (30 rows at about 55px each, so about
1,700px), workflow file, setup-tests, grading folder, LMS pull, instructions
(3 rows), reference repo, rubric (8 rows), then Grade all at
`GithubGradingPanel.tsx:744`. "Run all tests" sits at the queue header (`:554`),
far from Grade all. Estimated: Grade all is well over 2,500px below the
add-repo control on a 30-student queue.

---

## 2. WHERE THE CLICKS AND SCROLL GO, and the reducing mechanism (no confirm removed)

### Repo Grades

R1. A single Run bar directly under the header (course, folder, mapped
assignment name and rubric line, Grade all, Post N). It reuses the SAME handlers
(`onGradeColumn(folder)`, `onPostColumn(column, pointsPossible)`), so the confirm
at `useRepoGradesGradingActions.ts:522` stays the only post path.
- Labels and counts come from ONE pure leaf extracted from
  `RepoGradesGrid.tsx:314-357`, so the bar and the column header can never
  disagree (U8.33's "number shown equals number run").
- It shows only when one folder is selected. With "All folders" it shows a
  reason and the column-header buttons remain.
- It keeps the rubric and code-scoring disclosure visible before Grade and Post
  (the AC-44 guard).
- Sticky if the scroll root allows; optional (R2).
- Effect: Grade, Post, course and folder are co-located, so the cursor path is
  about one row.

R2. Collapse the grading-inputs block (README, only-checked, code-scoring and
hint, instructions, rubric source, rubric textarea) into one `<details>`
"Grading settings".
- The summary line always states the live state, for example "Instructions: each
  folder's README (fallback: none) | Rubric: generated | Code scoring: off". It
  must not hide the code-scoring "changes scores" fact, and must show an
  empty-fallback warning.
- Open state persists (`ta-repo-grades-settings-open`).
- Default: collapsed once the controls are in a configured state, expanded on
  first run.
- Saves about 700px above Run (the 440px textareas plus checkbox and hint
  blocks).

R3. Link panel collapses to a one-line summary ("N of N repos bound") when every
row is confirmed. It is expanded whenever any row is unconfirmed or none are
bound. A disclosure click overrides it, persisted
(`ta-repo-grades-link-open`). The "Apply then Confirm all then confirm OK"
two-step and its dialog are UNCHANGED. Merging Apply into Confirm all would drop
the instructor's review of the suggested rows before the confirm, which is the
"honest two-step" the panel is built around (`LinkUsernamesPanel.tsx:12-26`), so
it stays.

R4. Group the cheap pickers on one row. Course, repo filter and Refresh, folder
and sort go in one wrapping flex row. Reuse the house `.adaptRow` / `.ghActions`
classes already in `page.module.css`. Add no new classes there (it is on the
1000-line overage ratchet, so growth fails).

R5. Default the course when exactly one exists. Saves 2 clicks on first run for
single-course instructors.

R6. Mapping suggestion chip (fork F2): one click on a name-matched assignment
instead of 2.

R7. Graded-row density (fork F4): feedback boxes collapsed behind a disclosure
inside `RepoGradeCellControl`, with the score always visible and editable. This
reduces the 30-row review scroll.

R8. Persist graded results across reload (fork F3). Today reload discards every
graded score and comment (`cellEdits` is ephemeral, `index.tsx:171-175`), so a
returning instructor re-spends model calls and clicks. The design MUST also
persist a "posted" marker. Posting is neither reversible nor idempotent
(`RepoGradesGrid.tsx:24-27` says so), and `postStatus` is React state only.
Restoring scores without it would let "Post N" re-post already-posted rows.

### GithubGradingPanel

Persist `instructions`, `rubric`, `selectedOrg`, `orgPrefix` and `workflowFile`,
with keys in `github-grading/githubGradingUiState.ts`, NOT the top-level panel
file (see section 5). Put a Run row (Grade all and Run all tests) directly under
the queue header. Wrap the instructions and rubric inputs in a persisted-open
`<details>`. Collapse a long queue to a scroll-limited list.

---

## 3. ACCEPTANCE CRITERIA

Tags: M = MACHINE (provable under vitest by reading source or a pure function),
O = OWNER-verified (nothing renders). Each criterion names object, instrument
and direction of failure. Clicks (AC4) and scroll/cursor (AC5-AC7) are CO-EQUAL
per the owner.

- AC1 (M), preservation. Object: the guards listed in section 1. Instrument: a
  source-reading guard plus `repoGrades.wiring.test.ts:443` (the confirm
  sentence) and a `postCanvasGradesAction` call-site count, expected 2
  (`useRepoGradesGradingActions.ts:554,674`; counted by reading). Fails if the
  count rises or falls, if `window.confirm(` no longer precedes `:554`, or if the
  `:522` sentence changes. (Appending an assignment-name sentence after the
  pinned substring is allowed and is a safety add.)
- AC2 (M), count parity. Object: Run bar Grade and Post labels versus the column
  header. Instrument: a frozen-literal oracle over the leaf for selected,
  `bulkSelectionOnly`, `scanTruncated`, zero-target and already-attempted
  states. The expected strings are `Grade all N repos in X`,
  `Grade N selected repos in X`, `Nothing to grade in X`, `Re-post N grade(s)`
  and so on. Fails on any mismatch between the two surfaces.
- AC3 (M), one handler. Object: the bar's click wiring. Instrument: a source
  guard that the bar calls only `onGradeColumn` and `onPostColumn` and no
  `postCanvasGradesAction`. Fails otherwise.
- AC4 (O), clicks. Object: paths P1-P4. Instrument: owner counts clicks on the
  convention in section 1. Targets:
  - P2 = 3 (no regression, floor).
  - P3 = 7 down to 6 if F2 = chip.
  - P1 = 10 down to 9 if F2 = chip, down to 8 if also single-course.
  - Fails if any count rises. Also reported as a number: every safety click in
    section 1 is still present.
- AC5 (O), scroll, co-equal. Object: bounding rects of Course, Folder, Grade all
  and Post. Instrument: a DevTools snippet at `scrollY = 0`, recording
  `innerHeight`:

  ```
  [...document.querySelectorAll('button')].filter(b=>/^(Grade|Nothing to grade|Post|Re-post)/.test(b.textContent.trim())).map(b=>[b.textContent.trim(),Math.round(b.getBoundingClientRect().top)])
  ```

  and the same with `getBoundingClientRect()` on `#repo-grades-course` and
  `#repo-grades-folder`. Target: all four with `rect.bottom` at or below 0.8 x
  `innerHeight`, for `innerHeight` 720 or more. Baseline estimate to beat: about
  1,900-2,000px. Fails if any exceeds the threshold, on either 1366x768 or
  1920x1080.
- AC6 (O), cursor. Object: the centres of Course, Folder, Grade all and Post.
  Instrument: the same snippet. Target: all four within one horizontal band of at
  most 140px height and 900px width at 1920 wide. Fails above either bound.
- AC7 (O), Post after review. Object: Post reachability while rows are graded.
  Instrument: scroll to the last row, then check Post is on screen without
  scrolling up. Fails if it requires scrolling up (this needs the sticky bar
  working, R1/R2).
- AC8 (M), persistence. Object: each new key. Instrument:
  `repoGradesUiState.test.ts` extended for round-trip and default. Fails on a
  missing or defaulted-wrong key. For R8: a restored cell keeps its
  `generatedScore` and `generatedComment` (so the A13 post guard still works) and
  a previously posted cell reads "Re-post", not "Post".
- AC9 (M), state telegraphed. Object: the Settings and Link summary lines.
  Instrument: a pure formatter with a frozen-literal oracle covering README-on
  with an empty fallback, code scoring on, and rubric source variants. Fails if
  the formatter omits any of those facts.
- AC10 (M), collision. Object: `GradingResults` mounting in
  `GithubGradingPanel.tsx`. Instrument:
  `git diff -U0 -- src/app/components/GithubGradingPanel.tsx` shows no hunk in
  the `<GradingResults ... editsSurface="github" ...>` JSX (`:852-886`), plus
  `gradingResultsHelpers.ts` has an empty diff and
  `gradingResultsHelpersEditState.test.ts` is green. Fails otherwise.

Leverage claim: this is a UX smoothing of an existing capability, so no new
claim fires. The AC seat should record the fired trigger. A removal test is not
buildable here for clicks, scroll or attention (residual R1, same instrument as
AC5).

---

## 4. WAVES (leaf, then wiring, then surface; each wave includes the caller of every new export)

Repo Grades waves are SEQUENTIAL. They share `RepoGradesGrid.tsx`,
`RepoGradesControls.tsx`, `index.tsx` and `repo-grades.module.css`. The
orchestrator must compute the path intersections with `sort | uniq -d`; the
scope seat did not.

- W1: run-plan leaf and its caller. NEW `repo-grades/repoGradesRunPlan.ts` and
  `.test.ts`, extracted from `RepoGradesGrid.tsx:314-357`. EDIT
  `RepoGradesGrid.tsx` (the caller) and `repoGrades.wiring.test.ts:696-712`,
  which pins the extracted Post and Re-post source text. Update the pins to
  follow the fact, not the spelling. Behaviour-preserving.
- W2: persistence, derivation and the two disclosures. `repoGradesUiState.ts`
  (+2 keys) and its test, a new layout-state leaf, the single-course default in
  `repoGradesCoursePicker.ts`, `RepoGradesControls.tsx` (settings `<details>`),
  `LinkUsernamesPanel.tsx` (collapse), `index.tsx` (props, budget no more than
  +25 net), `repo-grades.module.css`.
- W3: surface. NEW `RepoGradesRunBar.tsx`, the `RepoGradesControls.tsx` row
  regroup, the `index.tsx` mount, CSS and the sticky bar.
- W4 (if F2 = chip): a pure assignment-suggestion leaf, plus its caller in
  `RepoGradesGrid.tsx` and the bar. Applies only on click, through the existing
  `handleAssignmentChange` (`index.tsx:413-430`) and its "assignment-mapped" log.
- W5 (if F3 = yes): a data-seat pass FIRST (residual R4), then a persisted
  cell-edits store, and a restore branch in `index.tsx`. Requires an extraction
  out of `index.tsx` first (see ceiling below).
- W6 (secondary surface, disjoint from W1-W5 by path): `GithubGradingPanel.tsx`,
  `github-grading/githubGradingUiState.ts` and its test (the new keys go here),
  and a new `github-grading/` component extracting the queue table. The
  extraction comes before any addition.

### 1000-line ceiling

All counts from `@(Get-Content f).Count`. Limit is `LIMIT = 1000` in
`src/file-size-ceiling.structure.test.ts`.

| File | Lines | Headroom |
|---|---|---|
| `repo-grades/index.tsx` | 935 | 65 |
| `GithubGradingPanel.tsx` | 901 | 99 |
| `repo-grades/repo-grades.module.css` | 864 | 136 |
| `repo-grades/useRepoGradesRubricSource.ts` | 832 | 168 |
| `repo-grades/useRepoGradesGradingActions.ts` | 825 | 175 |
| `repo-grades/RepoGradeCellControl.tsx` | 651 | 349 |
| `repo-grades/RepoGradesControls.tsx` | 647 | 353 |
| `repo-grades/RepoGradesGrid.tsx` | 643 | 357 |

- `index.tsx` has 65 lines of headroom and A7 already rules the overhaul "cannot
  be additive". If W2 or W3 would take it past about 960, extract first.
- Extraction risk: `docs/loop/this-repo.md:101-116` records that removing hooks
  from a panel can fail lint on a callback you never touched (React Compiler
  `preserve-manual-memoization`). It passes `tsc` and the tests and fails only
  `npm run lint`. Compare lint before and after every wave.

### Wave-gate commands

The pre-push gate runs no vitest (`docs/loop/this-repo.md:30-40`). Quote the
wrapper's per-argument lines from `npm run test:paths <p1> <p2> ...` over:
`repoGrades.wiring.test.ts`, `repoGrades.wiring.linking.test.ts`,
`repoGradesSliceA.guards.test.ts`, `repoGradesSliceB.guards.test.ts`,
`repoGradesRubricPicker.wiring.test.ts`,
`repoGradesFeedbackAndFiles.wiring.test.ts`,
`repoGradesCodeExecution.wiring.test.ts`,
`repoGradesClassTrends.wiring.test.ts`, `repoGradesUiState.test.ts`,
`GithubGradingPanel.wiring.test.ts`,
`gradingResultsHelpersEditState.test.ts`,
`src/app/components/componentStorageKeys.structure.test.ts`,
`src/file-size-ceiling.structure.test.ts`,
`src/source-bytes.structure.test.ts`, `src/lib/no-emojis.test.ts`. Plus
`npx tsc --noEmit` (one caller only) and `npm run lint`, compared before and
after against the same command, not a literal.

---

## 5. COLLISION NOTE (shared files, sequencing)

- Do NOT edit `src/app/components/grading-results/gradingResultsHelpers.ts` or
  `src/app/components/GradingResults.tsx`. `GithubGradingPanel.tsx:859` passes
  `editsSurface="github"`, and `gradingResultsEditsKey` is at
  `gradingResultsHelpers.ts:565`. W6 keeps that JSX byte-identical (AC10). The
  new Repo Grades persisted-results store must use its OWN key, not
  `gradingResultsEditsKey`.
- Do NOT edit `repo-grades/repoGradesPosting.ts`.
  `github-grading/useLmsAssignmentPull.ts:32` imports `repoGradeAssignmentUrl`
  from it.
- A29 W3 is path-disjoint. The tree shows A29 changes in
  `src/app/actions/bulk-course-message*`, `src/app/components/CanvasTab.tsx` and
  `src/app/components/bulk-course-message/` (from `git status --short`). The
  sibling grading-chat and walkthrough scopes' file sets are unknown to this
  scope. This scope writes none of `GradingTab.tsx`, `page.tsx` or
  `manual/manual-rail.ts`.
- Avoid `src/app/page.module.css`. It is shared, huge, and on the overage
  ratchet. This scope reuses existing classes there and adds new ones only in
  `repo-grades.module.css`.
- Storage canary. `src/app/components/componentStorageKeys.structure.test.ts` is
  a non-recursive exact-set canary over the top level of `src/app/components/`.
  A new `ta-` literal in `GithubGradingPanel.tsx` itself would redden it, which
  is why W6 puts keys in `github-grading/`. Keys in `repo-grades/` are covered by
  `repoGradesUiState.test.ts`, which is not an exact-set canary.
- Shared resources: `tsc` has one caller, `docs/BACKLOG.md` has one writer at a
  time, and `.claude/worktrees` copies must not be edited.

---

## 6. OPEN FORKS (each terminating: the answer ends the activity)

- F1: Scope the secondary surface? Options: (a) W1-W5 on Repo Grades only; (b)
  also W6 on GithubGradingPanel. Recommend (b), because it is disjoint and small.
  If (a), W6 is filed as a separate backlog row and this item ships W1-W5.
- F2: Assignment mapping. Options: (a) status quo, 2 clicks; (b) a one-click
  suggestion chip, 1 click, still instructor-applied; (c) auto-apply a name
  match, 0 clicks. `docs/repo-grades-view-acceptance-criteria.md:224-227` (AC5
  item 25) says the mapping is "explicit and instructor-set - never inferred".
  That is an acceptance criterion, not an owner ruling, and a grep of
  `owner-decisions-2026-09-23.md` and `-09-27.md` found no decision on it.
  Recommend (b). If (c), the Post confirm should also name the assignment. In all
  cases ship W4 as the chosen option and record the others as declined.
- F3: Persist graded results across reload (W5). Options: yes (with the posted
  marker) or no. Recommend yes, because reload currently discards the model spend
  and forces re-grading. The data pass is owed first (R4). If no, the scope ships
  without W5 and the reload cost stays documented.
- F4: Graded-row density. Options: (a) feedback boxes collapsed by default behind
  a disclosure with a persisted "expand all"; (b) always expanded as today.
  Recommend (a), because reviewing 30 rows is the largest scroll cost. It changes
  `RepoGradeCellControl.tsx` only, not the shared
  `grading-results/RowFeedbackBoxes.tsx` (shared with `GradingResults`).

Not a fork, escalated as an item: the Grade-all confirm discrepancy (R3). This
scope neither adds nor removes any confirm.

---

## 7. RESIDUAL REGISTER

Each entry names an owner, an instrument and the step that will measure it.

| Id | Not proven now | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | Scroll, cursor and click numbers are estimates or read-only, no render | owner | the DevTools snippet in AC5, run at `scrollY = 0` before W2 and after W3 | baseline before W2, verify after W3 |
| R2 | Sticky header does not stick (gridWrap scroll container); whether a sticky Run bar works | owner | browser scroll test | W3 verify |
| R3 | Grade all has no confirm, versus U8.35 and the A38 "confirm above N" decision | orchestrator | diff of `handleGradeColumn` and a ruling on whether A7's pass owns it | A7 scope |
| R4 | Size of persisted `cellEdits` (feedback text; `submittedFiles` with `rawBase64` must be dropped) vs the localStorage quota | data seat | byte length of a realistic 30-row JSON | W5 data pass, before build |
| R5 | The eight wiring and guard tests were not opened beyond the lines cited. Which others pin text in `RepoGradesGrid`, `RepoGradesControls`, `index.tsx` or `LinkUsernamesPanel` is unclassified | test seat | grep and open each; classify per wave | test notes |
| R6 | Lint `preserve-manual-memoization` regressions from hook moves | wave gate | `npm run lint` before vs after | every wave |
| R7 | GithubGradingPanel queue-row px, LMS-pull click count and per-graded-row px unmeasured | owner | the snippet plus `getBoundingClientRect` on a 30-row queue | W6 baseline |
| R8 | Typeahead is 2 clicks only if click-open works as read | owner | click it | AC4 count |
| R9 | Clicks to navigate to the view not counted | owner | count from app start | A7 pass |

### Things this scope could not determine

Any real layout position, the app chrome height above the tab card, runtime
Typeahead behaviour, and the contents of the sibling grading-chat and
walkthrough scopes.
