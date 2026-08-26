# Repo Grades - UX / visual overhaul, and folder choice as a first-class control

Status: acceptance criteria + architect pass + UX pass. NO CODE YET. Every
section below is peer sabotage-checked before an implementer sees it.

## 0. What exists today (observed, not assumed) - REVISION 2

Read on 2026-08-26 against commit e5fb549. Revision 1 of this section made
four claims that were wrong or overstated; they are corrected here and listed
as rejected at the end of section 2.

- The view renders, top to bottom: `TabHeader`, then `RepoGradesControls`,
  then `RepoGradesStatusBanners`, then `LinkUsernamesPanel` (406 lines,
  rendered for any chosen course), then a conditional banner, then a
  visually-hidden live region, then `RepoGradesGrid`, then
  `RepoGradesLogPanel`. index.tsx:511-656.
- `RepoGradesControls` renders up to seven stacked full-width fields, but the
  count is CONDITIONAL: the repo-name filter is gated on `showOrgPrefixFilter`
  (index.tsx:526) and five of the seven on `showRowDependentFields`
  (index.tsx:530). The fully-populated state - a course with a scanned org and
  at least one row - is seven: Course, Repo name filter + Refresh, Sort,
  README checkbox, "Only the checked rows" checkbox, Instructions textarea,
  Rubric textarea. Any density measurement must pin which state it measures.
- ASSIGNMENT FOLDERS ARE TABLE COLUMNS, one per distinct folder. The union is
  built by `buildRepoGradeColumns` (repoGradesRows.ts:120-131) via
  `buildRepoGradeGridModel` (repoGradesRows.ts:180-195); the grid actually
  renders `columnsWithMapping`, which is
  `applyRepoGradeAssignmentMapping(model.columns, assignmentMapping)`
  (index.tsx:255). The distinction between those two arrays is load-bearing -
  see U9.41.
- **There are TWO ways to grade a folder today, not one.** (a) The per-column
  "Grade all" button in that folder's header (RepoGradesGrid.tsx:163-172),
  reachable only by scrolling the table horizontally to that column; and
  (b) the per-cell "Grade" button (RepoGradeCellControl.tsx:111-120 via
  RepoGradesGrid.tsx:279-288), which grades that folder for one repo
  (useRepoGradesGradingActions.ts:177). Both are inside the table. Neither is
  in the control stack, and neither names its folder in its label. That is the
  defect behind "I should be able to choose which assignment folder I want
  graded from this view" - the capability is reachable but buried, and it has
  two entry points that disagree with each other (U9.38).
- A column header carries three controls stacked in one `<th>`: the folder
  name, a Canvas assignment `<select>`, "Grade all", and "Post N grade(s)"
  (RepoGradesGrid.tsx:149-183). `thead th` is `position: sticky; top: 0`
  (repo-grades.module.css:33-40), so the header survives vertical scrolling.
- A body cell renders the score input, comment input, Grade and Post controls
  ONLY when its status is `ungraded`; `missing-folder` and `scan-error` cells
  render plain status text with no controls (RepoGradesGrid.tsx:279-291).
- **Every result this view produces is invisible to a sighted user.**
  `postSummary` is the single sink for bulk-grade summaries, "nothing to
  grade", "nothing is postable", post outcomes, retry results, truncation
  warnings and every panel's `onAnnounce`, and it renders only into
  `gridStyles.srOnly` (index.tsx:614-616), which is `clip-path: inset(50%)` at
  1x1px (repo-grades.module.css:177-187).
- **`rubricAreas` is captured on every grading call, held per cell, and posted
  to the live Canvas gradebook** (repoGradesPosting.ts:250-261) **and rendered
  by nothing.** The generated rubric (github-repos.ts:680) is discarded.
- **The view renders a REDUNDANT NESTED `.tabContainer`.** page.tsx:385-387
  renders `<TabShell><RepoGradesTab /></TabShell>`, and TabShell.tsx:26
  supplies `.card` (`gap: 28px; padding: 36px`, page.module.css:29-36) - so
  this view ALREADY has its padding. page.tsx:238 also already wraps every
  tab panel in `.tabContainer`. index.tsx:512 then renders a SECOND
  `.tabContainer` inside both, re-applying `border: 1px solid
  var(--card-border)`, `border-radius: 24px`, `box-shadow: var(--shadow-lg)`
  and `background: var(--card-background)` - a card frame drawn inside a card
  - and, critically, `gap: 0` (page.module.css:14-27), which is what actually
  destroys the vertical rhythm between the header, controls, panels, grid and
  log. **The value of deleting it is the RHYTHM, not the width.** `.card`
  (page.module.css:29-36) has no border, no radius, no shadow and no
  background - it is `gap: 28px; padding: 36px` only - so removing the nested
  container reclaims just 2px of horizontal chrome. What it restores is
  `.card`'s `gap: 28px` between the header, controls, banners, link panel,
  grid and log, which is currently `gap: 0`. Two earlier drafts of this bullet
  overstated it: one claimed the inner container overflows and is clipped
  (false - `width: min(100%, 96vw)` cannot exceed 100% of its containing
  block), the other claimed 124px of horizontal chrome (false - 122px of that
  is `.page` and `.card` padding, which every tab in the app pays). U0c is
  still the right first move and still one line; the argument for it is the
  vertical rhythm.
  **The fix is to DELETE the inner `.tabContainer`, not to add `.card`.**
  Nothing anywhere resets a nested `.tabContainer` - page.module.css:14 is its
  only definition.
- This shape is NOT unique to Repo Grades: `artifact-design/index.tsx:90` and
  `ppt-design/index.tsx:463` each render a bare `styles.tabContainer` inside
  their own `<TabShell>` (page.tsx:379-381, 373-375). Three views share the
  defect. Fixing the other two is out of scope here but should be raised.
- The instructor's exported log for "Introduction to Computer Science"
  (2026-08-26T16:41:48Z) contains one entry: `usernames-linked`, "matched 0,
  added 11, 11 without a Canvas user id." **What that does and does not
  prove:** it proves the course-table roster link ran and wrote 11 rows with
  no Canvas user id. It does NOT prove nothing else ever happened - the log is
  capped at 500 entries with oldest-dropped (repoGradesLog.ts:98,116,133),
  is clearable behind a confirm (RepoGradesLogPanel.tsx:91,119), and is
  swapped wholesale on course switch (index.tsx:398-403). What is safely
  readable: a failed scan IS logged (index.tsx:468) and no such entry is
  present, so either the scan succeeded, no org is configured, or the log was
  cleared. Those are three states with three different next actions.

## 1. Scope - REVISION 2

Revision 1's scope section forbade behavior changes while six criteria
mandated them. This is the correction.

IN scope:
- The view's information architecture, control layout, visual presentation,
  and the grid's density and horizontal load.
- Making "which assignment folder am I grading" an explicit, named, persisted,
  per-course choice made from the view's own controls.
- Making the view's OUTPUT visible: run results, progress, and the grades and
  rubric areas it already computes and posts but never displays.
- Honest, specific empty/blocked/partial states.
- **The specific behavior fixes enumerated in U9, deliberately and with
  reasons given.** These ARE behavior changes, and this document is the
  "raise" that authorizes them: a confirm-binding path that degrades the
  instructor's rows (U9.36/36), a grading path that ignores its own toggle
  (U9.38), an uncancellable spend (U9.40), and a mapping filter that can erase
  saved data once folder scoping exists (U9.41). Reorganizing the controls
  around these without fixing them would be a facade over a broken mechanism.

OUT of scope:
- The Canvas posting payload's shape, the grading engine's prompt
  construction, the log format, and the binding DERIVATION algorithm
  (repo-student-bindings.ts's tier logic). **Correction:** an earlier draft
  said U9's binding fixes change "which candidates are OFFERED". That phrasing
  was wrong - what is offered comes from `suggestRepoStudentBindings`, so
  changing it means either editing the tier logic (out of scope) or
  re-deriving binding state in a second place (the drift hazard this document
  forbids elsewhere). The fixes are confined to the CONFIRM PATH -
  RepoBindingControl.tsx:68 and index.tsx:326-334. See U9.36's scope note.
- Any behavior change not listed in U9. Those must still be raised, not made.

## 2. Acceptance criteria - REVISION 2

### How these are verified - read this before writing any criterion off as passed

**The app cannot be run locally.** There is no `.env`, so the dev server
cannot boot (recorded at docs/repo-grades-view-acceptance-criteria.md:280).
vitest here is node-env and collects only `src/**/*.test.ts`, so no `.tsx` is
ever rendered and no component is ever exercised
(RepoGradesGrid.tsx:11-16). REGRESSION.md entry 270's Limits record that the
reflow was verified by reading CSS only; entry 349's record that no bulk run
has ever executed against a real org.

Therefore "observable by a person using the view" is NOT a verification
method available to this project. Every criterion below names how it is
actually checked: **[SRC]** by reading the source, **[CSS]** by reading the
stylesheet, **[TEST]** by a node-env unit test, or **[OWNER]** meaning only
the repo owner can confirm it on the deployed site. A criterion marked
[OWNER] is not a gate on the push; it is a known limit to be recorded.

### U0 - The resting state (the criterion revision 1 was missing entirely)

0a. **On first open of a course whose scan returned folders, the view is
    already scoped to one folder** - the persisted choice if there is one,
    otherwise the first folder in natural order. The instructor must not have
    to discover and operate a control to get the improved view. [SRC]
0b. **"All folders" is an available choice, not the default.** [SRC]
0c. **index.tsx no longer renders its own `.tabContainer`.** The view already
    receives `.card` from `TabShell` (page.tsx:385-387) and `.tabContainer`
    from page.tsx:238; its own nested third container is what applies
    `gap: 0` and redraws a card frame inside a card. Deleting that wrapper is
    the change - adding `.card` would make it worse. [SRC]
0d. On first open with no course chosen, the view states what to do and shows
    no empty grid frame. [SRC]

*Rationale: without U0, an implementer can satisfy every other criterion and
ship today's flush-to-the-edge wide table with one extra `<select>` added to
it. U0c is the single highest value-per-risk change in this work item.*

### U1 - Folder choice is a first-class control

1. The view has a folder control in its own control surface, not in a table
   header, naming every assignment folder in the scanned org. [SRC]
2. Every action that acts on a folder names that folder in its label, and the
   label is derived from the RUN PLAN, not from the folder name alone - so it
   is not "all repos" when `scanTruncated` is set
   (RepoGradesStatusBanners.tsx:113-118) or when `bulkSelectionOnly` scopes
   the run to checked rows (repoGradesBulkGrade.ts:80). [SRC]
3. Choosing a folder scopes the grid's DISPLAYED columns to that folder plus
   the identity columns. **This supersedes item 15 of
   docs/repo-grades-view-acceptance-criteria.md** ("the grid's columns are the
   union of every repo's folders"), which remains true of the MODEL and of the
   all-folders view; only the displayed set is scoped. [SRC]
3b. **Rows scope with columns.** In single-folder mode the grid shows the
   repos that have that folder, plus a stated count of those that do not and
   those whose scan failed - it does not render 27 of 30 rows reading "No
   folder". [SRC] *(This was left open by the architect pass; it is decided
   here.)*
4. The folder control shows TWO per-folder numbers plus ONE scan-wide number:
   how many scanned repos contain the folder, how many do not, and - once for
   the whole scan, not per folder - how many repos could not be determined
   because their tree fetch failed. A repo with `folders === null` yields
   `scan-error` for EVERY column (repoGradesRows.ts:108-112), so the unknown
   count is a per-scan constant; presenting it per folder would imply it
   varies. `scan-error` must never be counted as absent -
   repoGradesRows.ts:53-56 and repoGradesBulkGrade.ts:107-110 both forbid that
   conflation and REGRESSION.md entry 243 check 3 pins it. [TEST]
5. The folder choice persists across reload, per course. [TEST]
6. A persisted folder absent from the current successful scan is dropped back
   to "All folders". [TEST]
6b. The drop is EXPLAINED where the folder control is - the instructor is told
   the previously chosen folder is no longer present. It is not silent.
   (Revision 1 said "dropped silently... with no explanation", which is
   self-contradictory; this is the resolution.) [SRC]
6c. The drop is written back to storage, so the stale folder cannot resurrect
   when that folder reappears in a later scan - the same write-back
   `filterRepoGradeAssignmentMapping` performs at index.tsx:253. [TEST]
6d. A folder is NOT dropped merely because a scan is in flight or failed.
   `model` is null in both states (useRepoGradesData.ts:286-289,
   index.tsx:147), and the org-prefix filter is undebounced
   (RepoGradesControls.tsx:145-152), so a keystroke-triggered rescan must not
   erase the choice. [TEST]
7. **Reaching a graded folder must not cost more clicks than today.** Today,
   from a chosen course: pick the assignment in the column's select (2),
   "Grade all" (1), "Post N grade(s)" (1), confirm (1) = 5 clicks plus one
   horizontal scroll. The new path must reach 5 or fewer for a folder whose
   assignment mapping is already saved. If it cannot, that is reported, not
   shipped quietly. [SRC]
7b. **U1.7 does NOT forbid adding a confirmation.** Today's "Grade all" has NO
   confirm (`handleGradeColumn` calls `void runBulkGrade(plan)` with none,
   unlike `handlePostColumn` which confirms at
   useRepoGradesGradingActions.ts:296). U8.35 requires a spend of one model
   call per repo not be reachable by a single stray click. Where U1.7 and
   U8.35 meet, U8.35 wins: the standing house rule is that click cost is
   first-class but is never traded against a confirmation step. [SRC]

### U2 - The control surface has hierarchy

8. Controls are grouped by the question they answer: what am I looking at
   (course, repo filter, folder), how is it graded (instructions, rubric,
   README toggle), how is the list presented (sort, selection scope). [SRC]
9. A collapsed section states what is inside it AND whether it currently holds
   a non-default value. Note `useReadmeInstructions` defaults to TRUE
   (repoGradesUiState.ts:112), so a naive truthiness badge would mark the
   default as modified. [SRC]
9b. **A collapsed grading section always states the EFFECTIVE grading source
   in words** - "grading from each folder's README", "grading from typed
   instructions", or "NO INSTRUCTIONS SET". With instructions empty and the
   README toggle off, `gradeRepoAction` does not error: it substitutes
   `Evaluate the repository "<name>"` (github-repos.ts:665), generates a
   rubric from that placeholder (:680), and returns real numeric scores that
   become postable. Collapsing the controls must never hide that state. [SRC]
9c. A bulk run cannot start from the NO INSTRUCTIONS SET state without an
   explicit acknowledgement naming what will be graded against. [SRC]
10. The instructions and rubric textareas do not occupy the top of the view.
    Their state is readable without expanding them. [SRC]
11. `LinkUsernamesPanel` remains rendered when the org scan failed or the org
    is unset - the current gate on `course` alone must not be tightened. But
    its PLACEMENT between the controls and the grid is not protected; moving
    it is permitted and is required if the grid would otherwise stay below the
    fold. [SRC]

### U3 - The grid carries less

12. At HALF-SCREEN WIDTH on a 1440px display (720px), with a single folder
    chosen, a body cell's score is readable without horizontal scrolling. The
    bar is inherited from
    docs/repo-grades-posting-and-reflow-acceptance-criteria.md:75-81, which
    names the three min-width floors (220/190/170px) that put the current
    table's floor near 1350px. [CSS]
13. In single-folder mode the column header does not carry three controls. The
    assignment mapping and post action move to the view's surface. [SRC]
13b. **The relocated post control keeps the count correct - it is not
    currently wrong.** An earlier draft of this document claimed the header's
    "Post N grade(s)" count disagreed with what posts. That is STALE:
    RepoGradesGrid.tsx:131 calls `scopeRepoGradeRowsToSelection(rows,
    selected)` before `repoGradePostCandidateRows` and
    `buildRepoGradePostPlan` (:132-133), with `selected` threaded from
    index.tsx:623. The count IS selection-scoped today. What is stale is the
    11-line comment at useRepoGradesGradingActions.ts:251-261, which still
    describes the old behaviour. The relocation must preserve the scoping and
    the comment should be corrected - do NOT "fix" a number that is already
    right. [TEST]
14. The 700px reflow keeps working, AND the relocated controls are re-covered
    by width rules. repo-grades.module.css:439-444 constrains
    `.columnHeader select, .columnHeader button`, which goes dead when those
    controls move; :459-463 constrains `#repo-grades-course, #repo-grades-sort`
    BY ELEMENT ID, so new controls get no rule. Every ARIA role the reflow
    depends on stays present. [CSS]
15. The identity columns stay visible while folder columns scroll, or the
    design removes the need to scroll them out of view. [CSS]

### U4 - Blocked and empty states are specific

16. The view states which of grading and posting the instructor is blocked on,
    with counts. Grading requires no binding; posting does. [SRC]
17. The instructor's state is named. Split into its parts, each independently
    checkable: [SRC]
    17a. states how many repos have a username but no Canvas user id.
         **DO NOT use `rosterOverlay.withoutCanvasId` for this.** An earlier
         draft of this document, and the architect pass, both said to reuse
         it. That is WRONG and would report zero in exactly the state this
         criterion exists for: `withoutCanvasId` is a DELTA metric counting
         only rows the overlay would CHANGE this render
         (rosterUsernameOverlay.ts:127-130, 144-147). Once the instructor
         presses "Apply usernames from the course table" - which the attached
         log shows they did - the usernames are stored, `existingUsername` is
         non-blank, neither `matched` nor `added` increments, and
         `withoutCanvasId` collapses to 0. The correct source is a fresh
         derivation over `effectiveStudentRepos`: rows with a non-blank
         `username` and a non-numeric `canvasUserId`. `hasNumericCanvasId`
         (rosterUsernameOverlay.ts:70-72) is already the right predicate and
         needs exporting alongside a counting function;
    17b. states those repos can be graded now;
    17c. states posting needs the Canvas ids;
    17d. names the action that supplies them - and that action is NOT
         "Confirm all suggested bindings", which degrades those rows (U9.36);
    17e. the statement does not disappear once the usernames are applied.
         Today it lives inside the `!rosterHasNothing` branch
         (LinkUsernamesRosterSection.tsx:68-72,100-104,124-131), so applying
         the usernames replaces the honest count with "No GitHub usernames
         from the course table roster are available to link right now" - the
         truth vanishes exactly when it becomes true.
18. The empty state distinguishes "the org has no repos" from "your filter
    excluded them all" and offers to clear the filter when one is set. NOTE
    this is a prop-contract change: `RepoGradesGridProps`
    (RepoGradesGrid.tsx:41-82) receives neither `orgPrefix` nor a clear
    callback today. [SRC]
19. The states `RepoGradesStatusBanners` owns are covered too:
    `missingInstitution` (index.tsx:507, banner at :61-68 - the scan runs,
    grading works, the roster never loads, posting is impossible forever),
    `missingOrg`, `coursesLoading`/`coursesError`, `scanTruncated`,
    `rateLimitMessage`, and `assignmentsError` with a saved mapping (which
    index.tsx:244 deliberately withholds, so "you never mapped one" and "your
    mapping exists but we withheld it" currently look identical). [SRC]
19d. **The Canvas assignment picker never renders empty with no explanation.**
    REPORTED BY THE OWNER, 2026-08-26: "the assignments drop down on the repo
    grade view doesn't actually populate. i can't choose anything from there."
    Traced and confirmed - it is a SILENT failure, not a slow load:
    `assignmentsKey` is null unless the course has BOTH a non-blank
    `institution` AND a `canvasUrl` from which `parseCanvasCourseId`
    (src/lib/canvas-url.ts) can extract `/courses/<digits>`
    (useRepoGradesData.ts:292-294, 330). When it is null the effect returns
    at its first line (:334), so `assignments` stays `[]` (:353),
    `assignmentsLoading` is FALSE (:355, because it is defined as
    `assignmentsKey !== null && !matches`) and `assignmentsError` is NULL
    (:354). RepoGradesStatusBanners only speaks when one of those two is set
    (:101-111), so nothing renders. The picker shows "Choose an
    assignment..." with zero options, forever, with no spinner and no error.
    **There is no banner for a missing or unparseable `canvasUrl` at all** -
    index.tsx:507-508 computes only `missingInstitution` and `missingOrg`.
    Required: the view distinguishes, in words, (a) no institution set,
    (b) no Canvas URL set, (c) a Canvas URL that carries no `/courses/<id>`,
    (d) the list genuinely loading, (e) a load that failed, and (f) a course
    that really has no assignments. Each names the field to fix and where.
    Note (a)'s existing banner is also misleading: it says only that the
    Canvas ROSTER cannot be loaded (RepoGradesStatusBanners.tsx:60-65) while
    the same gate silently empties the assignment picker too. [SRC]
19e. The same gate govers the roster, so whenever 19d's blocked state is
    live, `RepoBindingControl`'s student picker reads "No roster loaded"
    (RepoBindingControl.tsx:117) and posting is unreachable. The view states
    that ONCE, naming both consequences, rather than leaving the instructor
    to discover them in two different controls. [SRC]
19b. No copy hard-codes a spatial reference that regrouping invalidates -
    "Choose a course tile above" (RepoGradesStatusBanners.tsx:57) is the
    existing example. [SRC]
19c. No state renders the grid area as a bare blank region. [SRC]

### U5 - Long runs report honestly

20. **The view has a VISIBLE status surface.** This is the criterion revision 1
    lacked, and without it every "the view states X" criterion above has no
    home. It renders `postSummary` and bulk progress, and it is not the
    existing `srOnly` div. [SRC]
20b. Bulk progress names the folder, the done count and the total, and remains
    visible without keeping a table header on screen. Today `bulkProgress` has
    exactly one renderer in the entire app - the column header button label
    (RepoGradesGrid.tsx:143-146) - which U3.13 removes. [SRC]
21. A run's outcome is summarized on that visible surface: graded, failed,
    skipped, with counts. [SRC]
21b. Two consecutive identical messages still announce. Today seven producers
    write one string, so a repeated message produces no DOM change and no
    re-announcement. [SRC]
22. These controls are disabled during a bulk run, each stating why - the list
    is enumerated so the implementer does not define their own gate: the
    course select, the repo-name filter and Refresh (which replaces `model`
    mid-run), the folder control, the README toggle, and the instructions and
    rubric textareas (read per-call at useRepoGradesBulkGrade.ts:116, so
    editing mid-run silently changes what later repos are graded against).
    [SRC]
22b. The second-run refusal is stated, not silent.
    useRepoGradesBulkGrade.ts:93 currently returns with no message. [SRC]

### U6 - It looks like the rest of the app

23. Every colour, radius, shadow and focus ring comes from a token in
    globals.css:2-181. Spacing and font sizes must come from the de facto
    scales documented at WorkflowPanel.module.css:24-39 - **there are no
    spacing or font-size tokens in this codebase**, so the original wording
    ("already a token") was unsatisfiable as stated. [CSS]
24. No emoji. Checked by src/lib/no-emojis.test.ts. [TEST]
25. Density, measured concretely rather than by feel: with a course chosen and
    rows present, the vertical distance from the top of the view to the first
    grid row decreases. The metric counts EVERYTHING in that span, including
    `LinkUsernamesPanel` - which contains zero `styles.field` blocks, so
    revision 1's "count the field blocks" metric exempted the largest
    consumer and was satisfiable by wrapping seven fields in one `<details>`.
    [CSS]
26. Restated as inspectable facts rather than "reads as one surface":
    26a. the view has exactly one container frame, not three (same as
         U0c); [SRC]
    26b. **DECIDED BY THE OWNER, 2026-08-26: the table shell follows
         `tasks/TasksGrid.module.css`, NOT `courses/CoursesTable.module.css`
         - "tasksgrid, it's a wide matrix."** This resolves the contradiction
         between an earlier draft of this criterion and section 2b. It means
         the grid KEEPS no-zebra and sentence-case headers, which TasksGrid
         records as deliberate divergences from CoursesTable
         (tasks/TasksGrid.module.css:291-295 - zebra collides with
         hover/focus/crosshair states; :313-315 - all-caps destroys the
         word-shape scanning a wide header row depends on). What converges is
         the shell mechanics: a bounded `max-height` scroller with
         `overflow: auto` so the sticky header actually engages (today
         `.gridWrap` has no height, so `position: sticky; top: 0` is inert -
         section 6), and a frozen identity column. [CSS]
    26c. one badge family, not two - today `.ghBadge*` (borderless,
         page.module.css:1414-1483) and the binding badges (bordered,
         repo-grades.module.css:60-143) coexist in one view; [CSS]
    26d. the panels below the grid share one surface treatment. [CSS]
27. **Actions look like actions.** Primary and destructive actions do not use
    `.linkButton` (page.module.css:665-672: no background, no border,
    `padding: 0`), under which "Post 30 grades to the live gradebook" is
    typographically identical to "Refresh" at a hit target of roughly 17-20px,
    below WCAG 2.2 SC 2.5.8's 24x24 minimum. **There is no
    `.linkButton:disabled` rule anywhere**, so a disabled action renders
    identically to an enabled one - which makes U5.22 literally
    unimplementable on that primitive. Use `.submitButton`
    (page.module.css:390-405) or `.ccBtn` (:5353) for primary actions;
    whatever is used must have a visible disabled state. [CSS]

### U7 - Nothing regresses

28. Every persisted value still persists, plus the new folder choice. [TEST]
29. Keyboard: every control tab-reachable, visible focus, none
    pointer-only. [SRC]
30. ARIA survives: the `role="status" aria-live="polite"` region, the table
    roles the reflow needs, and per-control accessible names - including the
    ones missing today: RepoGradesGrid.tsx:163-172 and :173-182 give "Grade
    all" and "Post N grade(s)" no accessible name naming their folder, while
    the assignment select beside them does (:152). [SRC]
30b. `.fieldHint` text is associated with its control via `aria-describedby`.
    No hint in this view is associated today. [SRC]
31. The wiring guards in repoGrades.wiring.test.ts still pass. **Two are
    expected to be pushed at, and that is a finding to REPORT, not an edit to
    make quietly:** :440-447 asserts against a fixed 400-character window over
    the selection restore branch (the file itself records at :541-548 that
    this pattern already went red once when a comment grew), and :507-543
    asserts `ColumnHeaderControls`' imports, props and call sites, which U3.13
    relocates. [TEST]
32. `npm run lint`, `npx tsc --noEmit`, and the compile line of `npm run
    build` pass. No file created or modified exceeds 1000 lines. [TEST]

### U8 - Cost and concurrency of the new entry point

*(Restored. These criteria were written in revision 1 and then destroyed by
the revision-2 splice of sections 0-2, while sections 1, 3, 4 and 5 went on
citing them. Renumbered to continue from U7's item 32.)*

33. The folder-scoped grade control states, before it runs, how many repos the
    run will cover and how many it will skip as already graded. The number
    shown and the number actually run can never disagree - both come from
    `buildBulkGradePlan`, never a separate count. NOTE this has no
    architectural home yet: `buildBulkGradePlan` is built at CLICK time only
    (useRepoGradesGradingActions.ts:494-495), so showing the counts before the
    click needs a render-time plan over `withLiveScores(rows, cellEdits)`, and
    the click must reuse that plan rather than recompute it - two invocations
    over state that can change between them IS the disagreement this criterion
    forbids. [TEST]
34. The folder-scoped grade control is disabled while ANY bulk run is in
    flight, including one started elsewhere, and says why. REGRESSION.md:33103
    records that a second grading entry point needs its own disable. [SRC]
35. A run that spends a model call per repo is not reachable by a single stray
    click from a resting state. Where this meets U1.7's click budget, this
    wins (U1.7b). It is satisfied by a stated count plus a confirm, or by a
    disabled action with a stated reason - see U9.38 for why a pre-run
    acknowledgement alone does NOT satisfy it. [SRC]

### U9 - Defects found during the survey, in the instructor's own state

*(Restored, renumbered. Section 1 authorizes exactly these as the in-scope
behavior changes; nothing outside this list may be changed without a fresh
raise.)*

36. **"Confirm binding" must never degrade a row.** A suggested row whose
    candidate carries an empty `canvasUserId` - EVERY row produced by the
    course-table roster link, since `overlayRosterUsernames` pushes rows with
    `canvasUserId: null` by construction (rosterUsernameOverlay.ts:144-147) -
    can be confirmed today. Doing so writes a binding with `canvasUserId: ""`,
    and repo-student-bindings.ts:156-178 re-derives that row as **unbound**,
    so it loses its suggestion AND its confirm button and ends further from
    postable than before the click. RepoBindingControl.tsx:68 passes the empty
    id with no guard.
    **Scope note:** the fix must be in the CONFIRM PATH
    (RepoBindingControl.tsx:68 and index.tsx:326-334), not in the tier logic.
    Changing which candidates `suggestRepoStudentBindings` emits would require
    editing repo-student-bindings.ts:103-118, which Section 1 puts OUT of
    scope, or re-deriving binding state in a second place - the
    "second definition that can drift" hazard this document forbids
    elsewhere. Section 1's phrase "which candidates are OFFERED" was
    imprecise; this is the precise version. [TEST]
37. **"Confirm all suggested" must not do 36 to every row at once.** The batch
    path (index.tsx:326-350) builds its payload from each row's top candidate
    with the same missing guard, so in the instructor's current state one
    click degrades all 11 rows. It must exclude non-confirmable candidates and
    state how many it excluded and why. [TEST]
38. **The per-cell "Grade" button must honour the README toggle.**
    `handleGradeCell` calls `gradeRepoAction` with six arguments
    (useRepoGradesGradingActions.ts:177), omitting the seventh
    `useReadmeInstructions` flag the bulk path passes
    (useRepoGradesBulkGrade.ts:116). The toggle defaults ON, so today the
    per-cell button grades against the instructions textarea while that
    textarea's label reads "fallback - used only for a repo whose folder has
    no README" (RepoGradesControls.tsx:203-205). Both paths must pass the
    flag, and a test must pin the argument list - the existing guard only
    asserts `gradeRepoAction(` appears inside the handler
    (repoGrades.wiring.test.ts:283-288), which is why this shipped. [TEST]
38b. **The fabricated-instructions state must be unreachable, not merely
    warned about.** With no effective instructions, `gradeRepoAction`
    substitutes `Evaluate the repository "<name>"` (github-repos.ts:665),
    generates a rubric from that placeholder (:680) and returns real postable
    scores. This fires from the DEFAULT configuration, per repo, mid-run: the
    README toggle defaults on, and a repo whose folder has no README falls
    back to the same empty textarea (github-repos.ts:655-665). A pre-run
    acknowledgement therefore cannot catch it. The grade action is DISABLED
    while the effective grading source is nothing, with the reason stated
    inline; and the per-repo README fallback is surfaced in the results, which
    the log already carries (useRepoGradesBulkGrade.ts:143-147). Note the
    embedded provider is the exception - it errors properly
    (github-repos.ts:671-673). [SRC]
39. **A cell reports which instructions graded it.** The bulk path records
    README provenance in the log; the single-cell path records the provider
    instead and never reads `readmePath`/`readmeMissing`. After 38, both
    report both. [TEST]
40. **A bulk run can be cancelled, or the UI says plainly that it cannot.**
    There is no `AbortController` and no cancel control; the only protection
    is a silent refusal to start a second run
    (useRepoGradesBulkGrade.ts:93). A 30-repo run started by mistake costs 30
    model calls. If cancel ships, note the in-repo precedents cancel
    SEQUENTIAL loops - this is a concurrent worker pool, so the flag must be
    checked at the top of the worker's loop and the UI must not promise an
    instant stop. The silent second-run refusal becomes a stated one. [SRC]
41. **Folder scoping must not erase Canvas assignment mappings.** Settled by
    section 5: never filter on write, filter on read. Delete the write-back at
    index.tsx:253, hold the raw stored slice, and apply
    `filterRepoGradeAssignmentMapping` as a read-time projection against the
    FULL column set. [TEST]

### U10 - The output side (the half Section 1 puts in scope and no criterion demanded)

*(New. Section 1's IN list includes "the grades and rubric areas it already
computes and posts but never displays", and Section 0 and the UX pass both
call this the reframed centre of gravity - but U0-U9 contained no criterion
requiring any of it, so an implementer could satisfy everything and render no
rubric at all.)*

42. After a run, the view shows a review surface for the chosen folder
    covering: the score distribution, the failures, the repos missing the
    folder, and the outliers. Its figures act as filters over the same table -
    not a second row renderer (settled in section 6). [SRC]
43. Any graded cell can reveal its `rubricAreas` breakdown without leaving the
    view. `GradingResults.tsx:469-470` and `DraftedGradesTab.tsx:632-671`
    already render this breakdown; read both before designing it. [SRC]
44. The rubric that produced a score is retrievable. `gradeRepoAction` returns
    it (github-repos.ts:688) and both callers currently discard it at the
    destructure. Because `generateRubric` runs PER CALL when the rubric
    textarea is blank (:680), the surface must say whether one rubric or N
    distinct rubrics were used. [TEST]
45. Graded results survive a reload and a course switch. `cellEdits` is
    ephemeral today, so a 30-call run is lost to F5 - and
    `buildBulkGradePlan`'s already-graded skip
    (repoGradesBulkGrade.ts:121), the only thing preventing a full re-spend,
    is defeated with it. Persisted per course, with the un-restorable states
    (`grading`, `postStatus: "posting"`) unrepresentable in the stored type.
    [TEST]

### U11 - Focus, and the live regions nobody counted

46. Controls in this view have a visible focus indicator.
    `repo-grades.module.css` contains **zero** `:focus`, `:focus-visible` or
    `outline` rules across its 694 lines, so every control there falls back to
    UA default while the rest of the app replaces it
    (page.module.css:234-235). U6.23's "focus ring comes from a token" is
    vacuously true when no focus rule exists. [CSS]
47. The live-region inventory is correct before anything is changed. This view
    renders SIX, not one: index.tsx:614 and :602, plus
    RepoGradesStatusBanners.tsx:75, :90, :102, :114 and :121. U7.30 protects
    "the" region; an implementer following it would protect one of six. Any
    consolidation must account for all of them. [SRC]

### Correction to the verification tags

The `[OWNER]` tag was defined and then used zero times across 53 tags, and
several tags claim a method that cannot deliver:

- **U6.25 is [OWNER], not [CSS].** A pixel distance to the first grid row
  cannot be read out of a stylesheet - the span includes the content-sized
  406-line LinkUsernamesPanel. Revision 1's "count the field blocks" metric
  was at least statically decidable; this replaced it with one that is not.
- **U1.4 is [TEST] only for the census FUNCTION; what the control renders is
  [OWNER].** Node-env vitest collects only `src/**/*.test.ts` and renders no
  component.
- **U1.6c/U1.6d are [SRC], not [TEST]** - they legislate a render-phase branch
  inside a `.tsx`, reachable only by a source-reading wiring guard.
- **U7.32 is a GATE, not a test** - lint, tsc, the build compile line and the
  1000-line cap are four separate command-line checks. No per-file line-cap
  test covers repo-grades today.
- **U7.29's "visible focus" is [CSS]** (see U11.46), not [SRC].
- **U5.21b is [OWNER]** - whether a screen reader re-announces a repeated
  string cannot be established by reading source.


### U12 - Percentages, one rubric per run, and readable comments

Reported by the owner 2026-08-26 with an exported log as evidence: "the
grader applied inconsistent totals to each of the assignments. i don't need
totals. i need percentages with clearly viewable and copyable comments."

**The evidence.** Two bulk runs over the same folder ("assignments") with the
same README instructions, eleven repos each. Denominators varied both within
a single run and between runs for the same repo: 100, 400, 40 and 16 in run
one; 100, 400 and 40 in run two. Same repo, run one to run two:
`350/400 -> 100/100`, `13/16 -> 37/40`, `40/40 -> 400/400`.

**The cause, verified at src/app/actions/github-repos.ts:680:**

    const effectiveRubric = rubric.trim() || (await generateRubric(
      `${instructions}\n\n${digest.text}`, provider));

With the rubric textarea blank - its default - a rubric is generated PER
CALL, from a prompt containing `digest.text`, that repo's OWN content. Every
student is therefore graded against a different rubric derived from their own
submission, and each generated rubric invents its own point total. This was
predicted by the data engineering pass (section 5, "keep rubricText per cell,
not per run") before the owner reported it.

**Normalizing the display makes scores COMPARABLE, not CONSISTENT.** In
percentage terms the same log still shows real run-to-run variance: one repo
moved 100% to 85%, two moved 87.5% to 100%. Both halves are needed.

48. **Scores display as percentages, never as raw totals.** A cell, the log,
    and any summary show `87.5%`, not `350/400`. `totalScore` is a STRING
    shaped "earned/possible" (grade/types.ts:29), so this is a parse plus a
    format, pinned by repoGradeScoreDisplay.test.ts. A score that cannot be
    parsed passes through unchanged rather than being blanked - losing a
    visible score to a parser failure is worse than showing the raw string.
    [TEST]
49. **The view says when a run used more than one scale.** The instructor had
    to export a log and read it by eye to notice. After a run, the view
    reports how many distinct denominators it saw and names the cause. [TEST]
50. **ONE RUBRIC PER RUN, not one per repo.** This is the root cause and the
    only fix that makes grading fair - today a weak submission can generate an
    easy rubric for itself, because the rubric is generated from that repo's
    own content. When the rubric field is blank, generate ONCE for the run and
    reuse it for every repo in that run. The generated rubric must be visible
    and retrievable (U10.44), because a rubric nobody can read cannot be
    audited or corrected.
    **Scope note:** this changes `gradeRepoAction`'s behaviour and therefore
    needs its own raise beyond U9's authorized list. It is raised here.
    Grading against per-repo rubrics is not a presentation defect; it is a
    fairness defect, and the owner's log is the evidence. [TEST]
51. **The AI's comment is readable and copyable.** `overallComment` currently
    renders into `.commentInput`, a single-line `<input type="text">` in a
    cell with a 170px floor (repo-grades.module.css:230, 239-247) - a
    paragraph in a one-line box. It must be readable in full without
    truncation, selectable, and copyable in one action. `feedback`
    (grade/types.ts:30) is a second, longer field the client currently never
    reads at all; surface it too or state why not. [SRC]
52. **Percentages and posting must not disagree.** `repoGradesPosting.ts`
    sends a score to the live Canvas gradebook. Changing the DISPLAY to a
    percentage must not change what is POSTED unless that is deliberate and
    stated - Canvas assignments carry their own points-possible, and posting a
    percentage into a 40-point assignment would silently mis-grade. Whatever
    is decided, the cell must make clear which number will reach Canvas. [TEST]

### Rejected in revision 1 - do not reinstate

- "Choosing a folder to grade is already possible and is already the ONLY way
  to do it." False - the per-cell Grade button is a second path, as this
  document's own U9.38 states.
- "A score input, a comment input, a Grade button and a Post button in every
  body cell." Only for `ungraded` cells.
- "Nothing else has ever happened in this course." An inference from a capped,
  clearable log, not an observation.
- A scope section forbidding behavior changes while six criteria mandate them.
- "Observable by a person using the view" as the verification model. The app
  cannot run locally and no component is ever rendered by a test.
- U1.6 as a single criterion reading "dropped silently... with no
  explanation".
- "Reuse `.linkButton`" - see U6.27.
- Density measured by counting `styles.field` blocks.

## Loop bookkeeping

- Step 4 (area baseline) is **SKIPPED**: `docs/REGRESSION.md` already
  documents this code area in entries 243, 270, 333, 344, 345, 347, 348 and
  349, covering the grid, posting, the reflow, the activity log, the folder
  argument reaching the grader, the link-usernames panel, the roster
  username overlay, and the bulk grade path. Per the conditional rule, no
  new baseline is written; the existing entries are the pre-existing
  behavior this work must not break, and U7 points at them.

## 2b. Reuse survey (loop step 2)

Vetted existing code the implementation MUST use instead of inventing a
parallel mechanism. Items marked VERIFIED were read first-hand by me; items
marked SURVEYED come from the design-language survey with file:line
citations and must be confirmed by the implementer before use.

### WITHDRAWN: this section's original root-cause claim was wrong

Revision 1 of this survey claimed the view never receives `.card` and that
adding `TabShell`/`.card` was the highest-value fix. **That was false**, and
it was asserted as first-hand VERIFIED. The components were read in
isolation; the composition at page.tsx:385-387 was never opened. The view
already gets `.card`; the defect is a redundant nested `.tabContainer` that
must be DELETED (see section 0). Following the original prescription would
have added a fourth nested card frame - a regression presented as the single
highest-value change in the work item.

The lesson is the standing one in this project: verify reachability and
composition, not just the correctness of each piece. The text below is kept
only so the withdrawn claim is not silently rewritten out of history.

### Prior art for U1 that this survey missed entirely

`GithubGradingPanel.tsx:569-600` is a SHIPPED folder-scoping control, and it
was not in the original reuse list:

- a `freeSolo` MUI `Autocomplete` over scanned `folderOptions`, with a "Scan
  folders" button (`scanFolders()`, :193-215) that derives candidates via
  `assignmentFoldersFromTree` - the SAME `src/lib/repo-assignment-folders.ts`
  function Repo Grades builds its columns from;
- **blank means "grade the whole repo"** - which is exactly the "All folders"
  sentinel U1.1 needs, and which a non-freeSolo `Typeahead` cannot express
  because `""` there already means "cleared";
- a persisted `gradingFolder` (:170) and a `lastGradedFolder` captured at
  grade time (:182-186, :327) so the report names the folder actually run -
  U5.20/21 already solved once;
- a plain-text description line built by `describeGradingFolder(
  normalizeGradingFolder(folder))` from `src/lib/github-grading-folder.ts:39,
  63` - U1.2 already solved, in a lib module, with its own AC doc at
  docs/folder-scoped-grading-completeness-acceptance-criteria.md;
- a count line, `Found N folder(s) in "<repo>"` (:210-214).

This must be read and reused or deliberately diverged from with a reason,
before any new folder control is designed.

### Further reuse the original survey missed (from the peer check)

- **Confirm convention** (for U8.35 / U9.40): there is no `ConfirmDialog`
  helper; the house convention is `window.confirm`, ~25 call sites, three of
  them already in this view (useRepoGradesGradingActions.ts:296,
  RepoGradesLogPanel.tsx:91, LinkUsernamesPanel.tsx:206) with wording pinned
  by repoGrades.wiring.test.ts:307-310, 585-588. There is also a shared
  two-click arming helper, `content-tab/modules/confirmArming.ts`
  (`selectionSignature`:20, `isConfirmArmed`:26), used at ~14 sites - and the
  merge path uses that arming rather than a confirm for its destructive step,
  which is the closer precedent for an expensive fan-out.
  The house irreversibility string is the literal "This cannot be undone."
- **Consequence tiers** (built for exactly U8.35's question):
  `content-tab/modules/bulkBarGroups.ts:133` defines
  `ConsequenceTier = "read-only" | "reversible-write" | "fan-out-write" |
  "destructive"`, with `consequenceTag`:488 and a build-failing audit at
  :715-716 if a group can reach `fan-out-write`/`destructive` without a tag.
  A folder-scoped grade run IS a fan-out-write.
- **Column scoping prior art** (for U1.3): `courses/CoursesTable.tsx` has
  persisted column visibility and reorder (`visibleColumns`:216,
  `columnOrder`:219, `toggleColumn`:269, Columns menu :504-542) and a frozen
  first column (`CoursesTable.module.css:132-135`). `tasks/TaskColumnMenu.tsx`
  plus `src/lib/course-tasks-view-column-filters.ts` and
  `course-tasks-view-columns.ts` (`parseTaskColumnSet`:79, with versioning
  :42-49) are a complete persisted column-set model with validation.
- **Persistence precedents** (for U1.5/U1.6): `repoGradesUiState.ts:132-175`
  (`parseLinkSource`, `parseUseReadmeInstructions`, `parseSort`) is the
  never-trust-stored-data validator idiom for a new field, and
  `loadSelectedRepoIds(validRepoIds)`:220-232 is U1.6 almost verbatim - a
  persisted value filtered against currently-valid ids on restore so a stale
  one cannot resurrect.
- **Empty states**: `.emptyState` (page.module.css:438-441) is the app-wide
  class with 29 call sites, INCLUDING this view's own RepoGradesGrid.tsx:208
  and RepoGradesStatusBanners.tsx:57. `RepoFoldersSection.tsx:299-301` is an
  existing folder-list empty state with cause-and-next-action wording - the
  U4.18 idiom.
- **Long-run progress**: `workflows/RunProgressSidebar.tsx` with
  `run-progress-sidebar.ts` (`countSettledSteps`:30,
  `describeRunProgressAnnouncement`:80, "Step N of M: name" at :94) is the
  app's real long-run progress panel, with persisted collapse. This view
  already threads `progress: {done,total}` - U5.20 is mostly RE-SITING that,
  not adding a bar.

### Corrections to the original reuse list (from the peer check)

- **`.bulkBar` is WITHDRAWN.** page.module.css:4802 names it the "Course
  Content selection toolbar"; its head is navy with "{n} files selected".
  This view's bulk grade is deliberately NOT selection-gated
  (repoGradesBulkGrade.ts's header), and `bulkSelectionOnly` is a separate
  independent control, so a navy selection bar would either sit permanently
  and misrepresent itself or hide the primary action behind selecting rows,
  failing U1.7.
- **`.adaptPanelStep` is OPTIONAL and should probably not be used.** The
  cited exemplar (SyllabusMode.tsx:147-153) is the one numbered-wizard
  consumer out of sixteen; the other fifteen omit the step pill. This view is
  not a wizard.
- **Converging on `CoursesTable`'s table shell is the WRONG precedent.**
  `tasks/TasksGrid.module.css:291-295` and :313-315 record deliberate
  divergences from CoursesTable for a wide matrix - no zebra (it collides
  with hover/focus states) and sentence-case headers (all-caps destroys word
  shape in a wide header row). TasksGrid, not CoursesTable, is this grid's
  analogue. Also: repo-grades already HAS sticky headers
  (repo-grades.module.css:33-40), so that was never a divergence.
- **Cross-feature CSS module imports do not exist in this codebase.**
  `WorkflowPanel.module.css:1-10` states the rule: restate values rather than
  depend on an unrelated feature's styling. So `.summaryBar` and the progress
  bar classes can only be COPIED into repo-grades.module.css - which is not
  covered by the CSS guard. Closing that gap is a one-line addition of a
  third entry to `STYLESHEETS` in
  courses/page-module-css-classes.test.ts:37-46, and should be done.
- **`Typeahead`'s `hint` does not satisfy U1.4.** `ui/Typeahead.tsx:63-72`
  renders `hint` only inside `renderOption` - the OPEN dropdown. The closed
  input shows the label alone (:56). U1.4 requires the counts be readable
  before grading, i.e. at rest.
- **The cancel precedent does not transfer cleanly.**
  `useCopilotAgents.ts`/`useMergePullRequests.ts` cancel SEQUENTIAL loops, so
  at most one call is in flight. `useRepoGradesBulkGrade.ts:104-157` is a
  concurrent worker pool, so a `useRef` flag leaks up to
  `BULK_GRADE_CONCURRENCY` already-billed model calls after the click. The
  check must go at the top of the worker's loop, and the UI must not promise
  an instant stop.
- **The radius tokens are effectively dead.** `--radius-sm|md|lg|xl` appear
  in 5 places across 2 files app-wide; every surface this work must match
  uses literal radii. Mandating the tokens works AGAINST U6.26.

### The original root-cause section (WITHDRAWN - see above)

`repo-grades/index.tsx:512` renders `styles.tabContainer` and puts its
children directly inside it. `.tabContainer` (page.module.css:14-27) sets
`gap: 0` and **no padding at all**; the padding and rhythm every other tab
has come from `.card` (page.module.css:29-36: `gap: 28px; padding: 36px`),
which `TabShell.tsx:26` wraps around its children and which this view never
renders. Every other top-level tab either uses `TabShell` or nests `.card`
inside `.tabContainer`.

So the Repo Grades view is the only tab in the app whose contents are flush
against the container's rounded edge with zero vertical separation between
the header, the controls, the banners, the link panel, the grid and the log.
This is a one-line structural omission, not a styling opinion, and it is the
most likely single cause of the instructor's reaction. Fixing it is the
highest value-per-risk change in this work item and must not be lost inside
a larger redesign.

### Reuse list

- **Layout shell**: `TabShell.tsx:10-33` (VERIFIED) - or `.card`
  (page.module.css:29) directly. Do not hand-roll padding.
- **Titled panel**: `.adaptPanel` / `.adaptPanelHeader` / `.adaptPanelTitle` /
  `.adaptPanelStep` / `.adaptPanelSubtitle` (page.module.css:759-804),
  markup shape at `course-planning/SyllabusMode.tsx:147-153` (SURVEYED).
  This is the app's canonical grouped-controls panel and is what section
  grouping (U2.8) should be built from.
- **Disclosure**: native `<details>` + `.adaptDisclosure` /
  `.adaptDisclosureBody` (page.module.css:702-742), 14+ existing call sites
  (SURVEYED). Gives `aria-expanded` semantics for free via `<summary>` and
  already has the chevron. Use this for U2.9 rather than
  `workflows/DisclosureToggle.tsx`, which is all-inline-style.
- **Two/three column field grid**: `.adaptFieldGrid2` / `.adaptFieldGrid3`
  (page.module.css:807-826) (SURVEYED) - the density lever for U6.25.
- **Long-list picker**: `ui/Typeahead.tsx:13-34` (SURVEYED), the app-wide
  filtered combobox with `options: {value,label,hint}[]`. The `hint` line is
  exactly where a folder's "present in 12 of 30 repos" count belongs (U1.4).
  Use this rather than a bare `<select>` once folder counts are shown.
- **Bulk action bar**: `.bulkBar` / `.bulkBarHead` / `.bulkCount` / `.bulkRow`
  (page.module.css:4802-4926), example `files/BulkSelectionBar.tsx:48-64`
  (SURVEYED). The view has row selection and a bulk run and currently uses
  none of this.
- **Summary strip**: `tasks/TasksGrid.module.css:111-124` `.summaryBar` /
  `.summaryFigure` (SURVEYED) - the house "N total, M outstanding" line,
  which is the right form for U4.16/U4.17's counts.
- **Badges**: `.ghBadge` + `.ghBadgeSuccess|Danger|Warning|Accent|Neutral`
  (page.module.css:1414-1483) (SURVEYED). NOTE a real conflict: this view
  already has its OWN bordered badge family for bindings
  (repo-grades.module.css:60-143). Two badge systems in one view is a defect
  the overhaul should resolve, but resolving it means changing the binding
  badges' appearance, which entry 243 of REGRESSION.md describes. Raise
  before changing.
- **Cancel for a long run**: `bulk-repo/hooks/useCopilotAgents.ts:44,62,102`
  and `useMergePullRequests.ts:61,122` (SURVEYED) - a `useRef(false)` cancel
  flag checked inside the worker loop, with an outlined error-coloured
  Cancel button beside the primary action
  (`CopilotAgentsSection.tsx:80-84`). This is the proven in-repo answer to
  U9.40; do not invent an AbortController scheme.
- **Progress bar**: `tasks/TasksGrid.module.css:461-479` `.progressText` /
  `.progressBarTrack` / `.progressBarFill` (SURVEYED) - the only real
  progress bar in the app, for U5.20.
- **Busy-label idiom**: swap the label to a present participle and disable
  the button; no spinner. Already used throughout this view (VERIFIED at
  RepoGradesGrid.tsx:146,181).
- **Table shell**: `courses/CoursesTable.module.css:78-138` (SURVEYED) -
  sticky uppercase headers on an accent tint, zebra striping, a
  `max-height` scroller. Five tables in the app share this; repo-grades
  diverges from all of them (repo-grades.module.css:18-42: no zebra, no row
  hover, plain non-uppercase headers, and `border-collapse: collapse` where
  every sibling uses `separate` + `border-spacing: 0`). Converging is a
  large part of "looks like the rest of the app" (U6.26).
- **Actions**: `.submitButton` (page.module.css:390), `.downloadButton`
  (:1714), `.ccBtn` (:5353) all exist and are unused here - every action in
  this view is currently a bare `.linkButton`, including the two most
  consequential ones (Grade all, Post N grades) which sit as text links
  inside a table header cell (SURVEYED). The primary action of a view
  should not be a text link.
- **Checkbox label**: there is NO shared class for a checkbox's inline
  label, which is why `RepoGradesControls.tsx:83-92` carries an inline
  style object (VERIFIED). A real class is needed; it belongs in
  repo-grades.module.css unless a second consumer appears.
- **Tokens**: every colour, radius and shadow must come from
  `globals.css:2-181`. Note there is NO spacing scale and NO font-size
  scale token set - the de facto scales are literal values documented at
  `WorkflowPanel.module.css:24-39`. U6.23 must be read against the de facto
  scale, not against non-existent tokens.
- **CSS guard**: `courses/page-module-css-classes.test.ts:37-46` asserts
  every `styles.X` reference resolves to a real class in page.module.css.
  It deliberately does NOT cover repo-grades.module.css
  (repo-grades.module.css:1-10). Any new page.module.css reference is
  covered automatically; new repo-grades.module.css classes are not.

### Correction this survey forces on U6.23

U6.23 as written ("no new spacing value that is not already a token") is
unsatisfiable as literally stated, because there are no spacing or
font-size tokens in this codebase. It must be restated as: every spacing and
font-size value used must already appear in the de facto scale documented at
WorkflowPanel.module.css:24-39 and used across page.module.css. Colours,
radii, shadows and focus rings DO have real tokens and the original wording
holds for them.

## 3. Architect pass (loop step 1b) - REVISION 2 - PARTLY SUPERSEDED BY SECTION 5

> **STOP. Read section 5 before acting on anything below.** Section 5
> overturns four of this section's instructions, and because it appears LATER
> in the file, a top-to-bottom reader would otherwise follow the wrong one.
> The four:
>
> 1. **"Reuse `rosterOverlay.withoutCanvasId`" for U4.17 - WRONG.** It is a
>    delta metric that reads ZERO in the instructor's actual state. U4.17a is
>    correct; this section is not.
> 2. **"The census can only come from the rows" - WRONG.** It comes from
>    `buildRepoGradeColumns`'s own input. And the "unknown" count is a
>    per-scan constant, not a per-folder number.
> 3. **The rejection of "a new pure module taking columns as input" -
>    REOPENED.** Its sole stated reason was the census claim in (2), which is
>    false. That module is required (section 5's extraction list).
> 4. **"Keep the srOnly region and mark the visible surface `aria-hidden`" -
>    WRONG.** It is an ARIA inversion. Put `role="status"` on the VISIBLE
>    node.
>
> Also superseded: the +80/+140 line estimate (section 5 says +200/+300), and
> the "two named values plus a guard test" protection (section 5: never filter
> on write, filter on read, plus a branded nominal type).


Revision 1 was rejected by the peer sabotage check on 2026-08-26 with three
independently blocking findings. The diagnosis survived; the prescription did
not. Revision 1's rejected claims are recorded at the end of this section so
the same mistakes are not re-proposed later.

### The structural problem (unchanged from revision 1 - this part held)

The view's real defect is that FOLDER is currently a column-space concept,
not a state concept. Everything that acts on a folder (grade, map to a Canvas
assignment, post) is therefore expressed as a control physically located in
that folder's column header, and the header is the only place it can be
expressed, because nothing in React state says "the instructor is working on
this folder".

The overhaul is therefore not primarily a CSS job. It is: introduce a
selected-folder concept, derive the grid and the view's actions from it, and
let the layout follow.

### Where the folder census lives

AC U1.4 requires each folder option to show how many repos actually contain
it. That number CANNOT come from the column list: `RepoGradeColumn` is
`{ folder: string; assignmentId: string | null }` (repoGradesRows.ts:85-92),
built as a de-duplicated Set union (repoGradesRows.ts:120-131) that carries
no census at all. It can only come from the rows, via
`row.cells[folder].status` (repoGradesRows.ts:108-112).

And it is a THREE-way count, not two. The status union is
`"ungraded" | "missing-folder" | "scan-error"`, where `scan-error` means
presence is UNKNOWN, not absent. Collapsing scan-error into "does not have
it" is the exact conflation `repoGradesRows.ts:56` and
`repoGradesBulkGrade.ts:107-110` both go out of their way to forbid. The
folder option must therefore carry three numbers - present, absent, unknown -
and the UI must not report unknown as absent.

**Decision: fold the census into `buildRepoGradeColumns` in
repoGradesRows.ts**, computed in the single pass that already walks every
repo's folder list, rather than in a new module that would need a second
O(rows x columns) walk and would become a second definition of "what folders
exist" that can drift from the first. `repoGradesRows.ts` is already pure,
already imports no React, and already has a 233-line test file. Extend
`RepoGradeColumn` with the census; do not create a parallel type.

### Folder selection needs a real restore branch, with write-back

Revision 1 claimed folder resolution was purely derivable every render and
called a state-plus-restore-branch an "architectural failure". That was
wrong, for two independent reasons, and the rule is now inverted:

1. **Write-back is the point, not boilerplate.** A pure derivation resolves a
   stale folder to "All folders" for DISPLAY only and never writes storage,
   so `ta-`-persisted state keeps the stale folder forever and it resurrects
   the moment that folder reappears in a later scan - which AC U1.6
   explicitly forbids. The two existing restore branches write the filtered
   value back for exactly this reason: `index.tsx:201`
   `persistSelectedRepoIds(restored)` and `index.tsx:253`
   `if (filtered !== stored) persistAssignmentMapping(...)`.
2. **`model` is null for most of the view's life, so there is nothing to
   derive from.** `scan` is null while loading AND on error
   (useRepoGradesData.ts:286-289), so `model` is null (index.tsx:147) and
   `columns` is `[]`, which makes EVERY persisted folder look stale. Worse,
   `scanKey` includes the prefix filter (useRepoGradesData.ts:259) and that
   filter is fed by an undebounced `onChange` (RepoGradesControls.tsx:145-152
   into index.tsx:527) - so every keystroke in the repo-name filter re-keys
   the scan, nulls `model`, and would snap the folder control back to "All
   folders" once per character. Combined with write-back, typing one
   character would ERASE the persisted folder.

**Decision: folder selection uses the same keyed compare-and-adjust restore
branch, gated on readiness, with write-back**, that `selected`
(index.tsx:197-202) and `assignmentMapping` (index.tsx:248-254) already use.
The readiness gate must require a SUCCESSFUL scan, not merely a non-null
`model` - a folder must not be dropped because a scan is in flight or failed.
State is what carries the value across the windows when its derivation input
is unavailable; that is the whole reason those branches exist.

### Persistence is per course, not global

Every field of `RepoGradesUiState` is global - one flat key per field
(repoGradesUiState.ts:80-101, 193-210). A folder name is not global. The
file states the rule itself at repoGradesUiState.ts:38-40: one course's
"week-1" folder means nothing to another course's Canvas assignment list,
which is why `loadAssignmentMapping` and `loadRepoGradeLog` are both keyed by
`courseId` (repoGradesUiState.ts:284, 331).

**Decision: the selected folder is persisted PER COURSE**, keyed the way the
assignment mapping and the log already are. Revision 1's "put it in
RepoGradesUiState and do NOT introduce a second persistence mechanism" is
withdrawn - it would have made "remember the folder per course" require
breaking the seam it declared inviolable, and it would have made a
course switch silently blank the folder in a way that reads as a bug.

### Column scoping: the destructive ordering, and the guard it needs

Scoping is applied at the LAST possible point, to what the grid renders. It
must NEVER reach the array feeding `mappingKey` (index.tsx:245-246), the
mapping restore, or `filterRepoGradeAssignmentMapping` (index.tsx:251).

The hazard is concrete and silent. With a one-folder column set,
`filterRepoGradeAssignmentMapping` (repoGradesAssignmentMapping.ts:103-113)
drops every other folder's entry, and index.tsx:253 then WRITES that loss to
localStorage. Every Canvas assignment mapping in the course would be erased
by a routine folder change, and it would only become visible after a reload.
This is the setting the codebase itself calls the one "most able to send a
whole column's grades to the wrong place" (index.tsx:261-263).

**Decision: two separately named values, never one reused variable** - the
full column set and the displayed column set - with the difference stated at
every use site, PLUS a guard test that fails if the scoped set reaches the
mapping filter. A prose instruction is not sufficient protection for a silent
data loss; revision 1 gave only the prose.

**Open question the implementer must not decide alone: do ROWS scope with
columns?** Scoping columns alone leaves 27 of 30 rows reading "No folder"
(RepoGradesGrid.tsx:290) directly beneath a control that just said the folder
is present in 3 of 30. That is incoherent, but hiding rows changes what the
selection checkboxes and the post plan cover. This must be decided in the UX
pass and stated, not left to the implementation.

### Where progress and results actually render

Revision 1 listed four seams and missed this one entirely, and it is load
bearing for AC U5.20/21 and every "the view states..." criterion:

- `postSummary` - the single announcement channel every handler writes to,
  and what both panels' `onAnnounce` feeds - renders into
  `gridStyles.srOnly` (index.tsx:614-616), which is `clip-path: inset(50%)`
  at 1x1px (repo-grades.module.css:177-187). **It is invisible to a sighted
  user.** Every AC that says "the view states X" currently has no visible
  home at all.
- `bulkProgress` has exactly ONE renderer in the entire app: the column
  header button's label (RepoGradesGrid.tsx:143-146). AC U3.13 removes that
  header. Implement the column scoping without adding a visible progress
  surface and bulk-run progress disappears completely.

**Decision: the view gains ONE visible status surface** that renders
`postSummary` and bulk progress together, positioned so it does not scroll
out of view during a run. The existing `role="status" aria-live="polite"`
region stays exactly as it is - AC U7.30 protects it - and the new surface is
visual only, with `aria-hidden` where it would otherwise double-announce.
Do not make the existing srOnly region visible; do not add a second live
region.

### Binding the folder to a run in flight

`bulkRunningFolder` lives in `useRepoGradesBulkGrade` (:87) and
`runBulkGrade` closes over a plan frozen at click time (:90-98). Nothing
couples it to the folder selection. Today, changing the folder mid-run would
let the run continue invisibly against a hidden column while the new
surface's button names a different folder, and the second-run guard
(`if (runningFolder !== null) return`, useRepoGradesBulkGrade.ts:93) is a
SILENT refusal - the next Grade click would do nothing, with no message.

**Decision: `selectedFolder` and `bulkRunningFolder` are explicitly coupled.**
The folder control and the grade control are disabled while a run is in
flight, each stating why (AC U5.22), and the silent refusal is replaced by a
stated one. This satisfies the standing warning in REGRESSION.md:33103 that a
second grading entry point needs its own disable.

### Folder name collisions

`buildRepoGradeColumns` adds raw strings to a Set (repoGradesRows.ts:126) -
case SENSITIVE - while `naturalCompare` sorts with `sensitivity: "base"`
(repoGradesRows.ts:41) - case INSENSITIVE. `Module-3` and `module-3` are
therefore two distinct columns whose sort keys tie, and folder names are raw
unnormalized top-level directory segments
(repo-assignment-folders.ts:44-56).

**Decision: the folder option list applies NO normalization.** Options are
keyed by the exact raw folder string, because that string is also the
assignment-mapping key (repoGradesAssignmentMapping.ts:85) and the value
`buildBulkGradePlan` matches on. Normalizing for display would collapse two
real columns into one option that maps ambiguously to two mappings. This
codebase has a recorded repeat failure in exactly this shape - adding
coercion to a membership test changes set membership - so the rule is: raw
keys, and if two options render identically, that is a display problem to
solve with adjacent detail, never by merging them.

### What this deliberately does not abstract

- Do not build a generic "scoped table" abstraction. There is one caller.
- Do not unify the post path and the grade path. They differ in whether a
  binding is required, and collapsing them would hide exactly the distinction
  U4.16 requires the UI to state.
- Do NOT unify the two GRADING paths by accident either. They already
  disagree today - the bulk path passes `useReadmeInstructions` as
  `gradeRepoAction`'s 7th argument (useRepoGradesBulkGrade.ts:116) and the
  single-cell path does not (useRepoGradesGradingActions.ts:177). U9.38
  requires fixing that disagreement deliberately, in favour of passing the
  flag on BOTH paths. An implementer moving both actions onto a new surface
  will otherwise unify them incidentally and freeze whichever behaviour they
  happened to wire.
- Do not extract a design-system component library out of this change.

### Reuse the count that already exists

AC U4.17's "N repos have a username but no Canvas user id" does not need
computing. `rosterOverlay.withoutCanvasId` already exists
(rosterUsernameOverlay.ts:35, 88, 130, 147), already has tests
(rosterUsernameOverlay.test.ts:88-112), and is already threaded into
index.tsx and down to LinkUsernamesPanel (index.tsx:584). Use it.

### Failure modes to design for

- Zero folders found. The folder control must render something coherent.
- One folder found. The control must not look broken, and "All folders" must
  not be pointless noise.
- Many folders (20+). Counts in the option list are why a plain `<select>`
  may not suffice; `ui/Typeahead.tsx` supports a per-option hint line.
- A long folder name, or two differing only by case or a suffix. Never
  truncate to ambiguity; never merge (see above).
- The scan failed, or is in flight. Options are unknown - say so, and do NOT
  drop the persisted folder.
- A bulk run in flight when the folder changes.
- A course switch while a folder is selected.

### Size, and a guard that will break

Revision 1 named one split and stopped. The realistic delta to index.tsx is
+80 to +140 lines (derivation wiring, the scoped-columns pair, ~25-35 prop
lines replacing the current 23-line block at index.tsx:519-541, the
folder-scoped grade/post handlers moved off the column header, the
consolidated blocked-state computation, the U4.17 count wiring, and the new
visible status surface) - landing index.tsx at roughly 740-800 against a cap
of 1000, at this file's comment-to-code ratio. Under the cap, but plan the
extraction against the additions, not against the ceiling.

Two specific items revision 1 missed:

- **`RepoGradesControls.tsx`'s fate must be decided.** Only index.tsx:48
  imports it, so replacing it is safe - but it exports `parseSortValue`,
  which is real logic living in a `.tsx` file, and therefore untestable by
  construction under this repo's node-env vitest config. Move it to a `.ts`
  module and test it, or state why not.
- **`repoGrades.wiring.test.ts:440-447` asserts against a fixed 400-character
  window** (`indexSource.slice(restoreIdx, restoreIdx + 400)`) over the
  selection restore branch, and the file itself records at :541-548 that this
  pattern already went red once when a comment grew. The folder restore
  branch lands next to it. Any insertion that pushes
  `persistSelectedRepoIds(restored)` past offset 400 fails a test AC U7.30
  says must pass unmodified, with no behavioural change. Expect this, and
  treat it as the finding U7.30 asks for rather than quietly widening the
  window.

### Rejected in revision 1 - do not re-propose

- A new pure module for folder derivation taking `columns` as input. It
  cannot produce the census AC U1.4 needs; the census lives in the rows.
- "Folder resolution is pure, needs no state, no effect and no restore
  branch; a useState/useEffect pair is an architectural failure." False -
  it breaks U1.6 (no write-back means stale folders resurrect) and breaks
  during every scan window, including every keystroke in the prefix filter.
- `selectedFolder` as a global field of `RepoGradesUiState`.
- Column scoping protected by prose alone, with no guard test.
## 4. UX pass (loop step 1c) - REVISION 2 - PARTLY SUPERSEDED BY SECTION 6

> **STOP. Read section 6 before acting on anything below.** Section 6
> overturns five of this section's claims, and appears LATER in the file:
>
> 1. **"The sticky header keeps a folder's controls on screen" - FALSE.** The
>    rule is inert: `.gridWrap` has no height, so it never scrolls vertically
>    and `top: 0` never engages. This section's entire click-cost baseline was
>    built on it.
> 2. **The click arithmetic - WRONG, and inverted.** The assignment mapping is
>    ALREADY restored with zero clicks today, so the steady state is 3 clicks,
>    not 5. This section's proposal is +2 in every scenario. The target is a
>    ZERO-click steady state.
> 3. **"Fix the post count bug when relocating the button" - THERE IS NO
>    BUG.** `RepoGradesGrid.tsx:131` already scopes to the selection. This
>    section mistook a stale code comment for live behaviour.
> 4. **"Reuse `rosterOverlay.withoutCanvasId`" - WRONG**, same as section 3's
>    version. See U4.17a.
> 5. **"AC U2.11 keeps LinkUsernamesPanel between the controls and the grid" -
>    MISREADS U2.11**, which says the opposite: its placement is not
>    protected, and moving it is REQUIRED if the grid would otherwise stay
>    below the fold.
>
> Also superseded: the pre-run acknowledgement (U9.38b disables the action
> instead), and the blanket withdrawal of `.linkButton` (tertiary text actions
> stay; add a `:disabled` rule and a 24x24 hit area).


Revision 1 was rejected by the peer sabotage check on 2026-08-26. It was
wrong on a point of fact, its central click-cost argument was unchecked and
turned out to be inverted, and it missed the defect that best explains the
instructor's reaction. Revision 1's rejected claims are listed at the end so
they are not re-proposed.

### THE FINDING THAT REFRAMES THIS WORK: the view's output side does not exist

Two independent reviewers found this separately, which is why it leads now.

**Every result this view produces is invisible.** `postSummary` is the single
sink for all of it - bulk-grade summaries
(useRepoGradesBulkGrade.ts:160), "nothing to grade"
(useRepoGradesGradingActions.ts:498), "nothing is postable in this column
yet" (:273), post results (:372), single-cell retry results (:461),
truncation warnings (:218), and every `onAnnounce` from LinkUsernamesPanel,
LinkUsernamesRosterSection and RepoGradesLogPanel. It is rendered in exactly
one place: index.tsx:614-616, a `<div className={gridStyles.srOnly}>`, which
is `clip-path: inset(50%)` at 1x1px (repo-grades.module.css:177-187).

A sighted instructor who clicks "Grade all" on an already-graded column sees
nothing happen at all. Same for "nothing is postable". That is the "holy
shit", and no amount of control reorganization touches it.

Secondary defect in the same region: seven producers write one string, so two
consecutive identical messages produce no DOM change and therefore no
re-announcement. The live region is broken for repeats even for the screen
reader users it was built for.

**And the grades themselves are never shown.** `rubricAreas` is captured on
every grading call (useRepoGradesGradingActions.ts:192,
useRepoGradesBulkGrade.ts:129), persisted per cell, and POSTED to the live
Canvas gradebook (repoGradesPosting.ts:250-261) - and is rendered by nothing.
No component in the repo-grades folder reads it. The generated rubric
(github-repos.ts:680) is likewise discarded. So the instructor writes
per-area rubric scores and an AI comment into 30 students' permanent grades
having seen a number in a 56px box and a paragraph clipped inside a
single-line `<input type="text">` (repo-grades.module.css:230, 239-247).

**Therefore the overhaul's centre of gravity moves.** Revision 1 proposed
rearranging the INPUT side of a screen whose OUTPUT side does not exist.
The view needs a REVIEW SURFACE: after a bulk run, one place that shows the
rubric that was used, the score distribution, the outliers, the failures and
the per-area breakdown for any student - BEFORE the irreversible post. The
folder control is still required (the instructor asked for it), but it is no
longer the largest thing wrong here.

### Corrections of fact from revision 1

- **"Two horizontal hunts" was false.** `ColumnHeaderControls`
  (RepoGradesGrid.tsx:149-183) renders the folder name, the assignment
  `<select>`, "Grade all" and "Post N grade(s)" STACKED IN ONE
  `.columnHeader` flex column inside a single `<th>`, and
  repo-grades.module.css:33-40 makes `thead th` `position: sticky; top: 0`.
  There is ONE hunt, after which all of that folder's controls are together
  and stay on screen. The buried-ness is real; the doubled cost was invented.
- **"Type instructions into a textarea below the fold" was false as a
  description of the default path.** `useReadmeInstructions` defaults to TRUE
  (repoGradesUiState.ts:112) and `instructions` persists.

### The click path, counted properly

Course already chosen (`courseId` persists). Grade folder `module-3` across
the org and post it.

TODAY: pick assignment in the column's select (2), "Grade all" (1), "Post N
grade(s)" (1), window.confirm OK (useRepoGradesGradingActions.ts:296) (1) =
**5 clicks plus one horizontal scroll gesture.**

REVISION 1'S PROPOSAL: pick folder (2), pick assignment (2), grade (1), post
(1), confirm (1) = **7 clicks, no scroll.**

**Net +2 clicks to remove one scroll gesture, growing linearly per folder
graded** - two folders is 9 clicks + 2 scrolls today versus 13 proposed. That
fails AC U1.7 and the standing rule that fewest interactions wins. Revision 1
asserted "must not cost more clicks than today" and never checked.

**The resolution is not to abandon the folder control** - the instructor
asked for it and buried-in-a-table is a real defect - **but the folder
control must EARN its two clicks by removing more than a scroll gesture.**
It earns them if choosing a folder also carries the assignment mapping for
that folder (so the assignment select is pre-set from the persisted mapping
rather than re-picked, saving 2), and if grade and post for the chosen folder
are adjacent to it. Then: pick folder (2), grade (1), post (1), confirm (1) =
5 clicks, equal to today, with no horizontal scrolling and every action
naming its folder. Any design that does not reach parity must be reported,
not shipped quietly.

### The grading configuration can silently fabricate postable scores

With the instructions textarea empty and the README toggle off,
`gradeRepoAction` does NOT error. github-repos.ts:665:
`effectiveInstructions.trim() || \`Evaluate the repository "${digest.fullName}".\``
It substitutes a placeholder, generates a rubric from that placeholder
(:680), grades against it, and returns a real numeric score. That score lands
in the cell, makes the row postable, and can be written to a live gradebook
that has no undo, no audit table and no dry run (index.tsx:14-17).

Thirty fabricated-but-plausible scores, and nothing looks wrong.

Revision 1's remedy - "the grade will be weak, say so before the run" - was
advisory prose with no matching acceptance criterion, so no implementer would
have built it. It also misdiagnosed the failure as visible weakness rather
than an invented rubric.

**This is why the disclosure decision from revision 1 is now constrained:**
instructions and rubric may be collapsed ONLY if the collapsed header states
the effective grading source in words ("grading from each folder's README",
or "grading from typed instructions", or - the dangerous one - "NO
INSTRUCTIONS SET"), and a run cannot start from the no-instructions state
without an explicit acknowledgement. Note the existing asymmetry: confirming
bindings is gated behind window.confirm (LinkUsernamesPanel.tsx:206) and
clearing a LOCAL log is too, while bulk-grading 30 repos at real per-call
cost has no confirmation at all.

### The instructor's actual state, and the button that makes it worse

Their log reads `matched 0, added 11, 11 without a Canvas user id`. On that
screen right now:

- `tierStoredUsername` (repo-student-bindings.ts:103-119) emits a candidate
  with `canvasUserId: ""`, a single candidate at the winning tier, so the row
  renders as **suggested**.
- 11 rows therefore show "Suggested" plus "Confirm binding"
  (RepoBindingControl.tsx:56-77), and LinkUsernamesPanel.tsx:377-389 offers
  **"Confirm all 11 suggested bindings"** behind a window.confirm that warns
  about the live gradebook.
- index.tsx:326-334 builds that payload with no numeric filter, and neither
  `confirmSuggestedBindings` (useRepoGradesData.ts:541-567) nor
  `acceptBinding` (:421-436) guards. The write stores a row whose `repo`
  matches, so rule (a) fires on the next render and
  repo-student-bindings.ts:156-175 - present-but-non-numeric is unbound, not
  confirmed - flips all 11 rows to **unbound**.

**The most prominent action on the instructor's screen, in the exact state
they are in, moves every row backwards.** AC U4.17 asks the view to name the
one action that resolves the state; revision 1 would have pointed at this
button.

**And the one sentence that tells the truth disappears exactly when it
becomes true.** LinkUsernamesRosterSection.tsx:124-131 says "N of those
students have no Canvas user id on file... cannot be posted to Canvas
until..." - but it lives inside the `!rosterHasNothing` branch (:68-72,
:100-104). Once the instructor APPLIES the usernames, which their log shows
they did, `matched`/`added` fall to 0, `rosterHasNothing` becomes true, and
that sentence is replaced by "No GitHub usernames from the course table
roster are available to link right now." The honest count vanishes at the
moment it matters. Reuse `rosterOverlay.withoutCanvasId`, which already
exists and is already threaded to the panel (index.tsx:584).

### States every surface must design for - corrected list

Revision 1's list, plus the states it missed:

- **`missingInstitution`** (index.tsx:507, banner at
  RepoGradesStatusBanners.tsx:60-65). Distinct from `missingOrg`: the scan
  runs, grading works, the roster never loads, posting is impossible
  forever. This is the cleanest demonstration of the grade-versus-post split
  AC U4.16 demands, and revision 1 omitted it.
- **`coursesLoading` / `coursesError`** (RepoGradesControls.tsx:127,
  134-138). With `coursesError`, the whole view is a disabled select and a
  red line.
- **`scanTruncated`** (RepoGradesStatusBanners.tsx:113-118). This makes
  revision 1's own proposed copy FALSE: "Grade all repos in module-3" over a
  knowingly incomplete repo listing silently omits students. Copy asserting
  totality must be state-aware.
- **`rateLimitMessage`** (:120-124).
- **`assignmentsError` with a saved mapping.** index.tsx:244 gates the
  mapping restore on `!assignmentsLoading && !assignmentsError`, so a failed
  assignment list means the persisted mapping is deliberately never restored
  - every column shows an unset picker and "Post 0 grade(s)". "You never
  mapped one" and "your mapping exists but we withheld it" are different
  problems with different next actions and currently the same screen.
- **Course switched mid-bulk-run.** `bulkRunningFolder` disables only the
  "Grade all" buttons (RepoGradesGrid.tsx:166). The course select, sort,
  textareas, checkboxes, row checkboxes, per-cell Grade/Post, binding
  controls and Confirm-all all stay live; switching course resets `cellEdits`
  (index.tsx:398-403) while in-flight workers keep writing into the new
  course's state. AC U5.22 names no control; this one must be named.
- **Narrow width.** Revision 1 had no width dimension at all despite
  repo-grades.module.css:347-464 reflowing the entire grid at 700px. Note
  `.grid thead tr` is deliberately NOT hidden there (:339-345), so the mobile
  grid opens with N stacked `.columnHeader` blocks - 3N controls - before the
  first repo card. Folder scoping fixes this incidentally; say so, so it gets
  verified.

### The reflow will break unless the moved controls are re-covered

AC U3.14 promises the 700px reflow keeps working. Its width containment is
hard-coded to selectors this redesign dissolves:

- repo-grades.module.css:439-444 constrains `.columnHeader select,
  .columnHeader button` to `max-width: 100%`. AC U3.13 moves the assignment
  select and post button OUT of the column header, so the rule goes dead and
  the relocated controls inherit nothing.
- :459-463 constrains `#repo-grades-course, #repo-grades-sort` **by element
  id**, with a comment noting those controls carry no className. A new folder
  select, a relocated assignment select and any disclosure button get no rule
  and can force horizontal overflow at 375px. That comment already cites
  stale line numbers from a previous refactor; this is the second.

### Visual defects revision 1 never named

1. **No padding, no vertical rhythm, and a card inside a card.**
   index.tsx:512 roots the view in `styles.tabContainer`, which is `gap: 0`
   with NO padding (page.module.css:14-27) - and page.tsx:238 already wraps
   the tab area in that same class, so this is a shadowed 24px-radius card
   nested inside an identical one. `.field` carries no margin. The field
   blocks stack with 0px between them, flush to the border. VERIFY the
   nesting claim before acting on it; the padding claim is verified.
2. **Mixed idioms in one column of controls.** The two textareas get 18px
   radius and custom border/background (page.module.css:133-138, 199-206);
   the course and sort selects and the org-prefix input
   (RepoGradesControls.tsx:145-152, inline style only, no className) are raw
   browser chrome. `.textInput` (page.module.css:212-226) exists and is
   unused here.
3. **440px of textarea before anything.** `.field textarea` is
   `min-height: 220px`, twice. The grid starts below two panels and roughly
   900px of chrome - and AC U2.11 keeps the 400-line LinkUsernamesPanel
   between the controls and the grid, so the grid stays below the fold even
   after the overhaul unless that placement is revisited.
4. **The AI's comment lives in a single-line input** 170px wide, beside a
   56px score box (repo-grades.module.css:230, 239-247).
5. **Five different surface treatments.** `.logPanel`/`.linkPanel` use
   `--card-border` on `--surface-subtle`; `.gridWrap` uses `--field-border`;
   `.banner` is warning-toned. AC U6.26 names the symptom; the mechanism is
   to pick one panel treatment (`.adaptPanel` or the quiet-surface recipe)
   and apply it to all of them.
6. **This view has no buttons - it has fifteen hyperlinks.** Every action
   uses `.linkButton` (page.module.css:665-672: no background, no border,
   `padding: 0`), so "Post 30 grades to the live gradebook" is
   typographically identical to "Refresh", at a hit target of roughly 17-20px
   - under WCAG 2.2 SC 2.5.8's 24x24 minimum. **And there is no
   `.linkButton:disabled` rule anywhere**, so because `color` is
   author-specified the UA's `GrayText` default never applies and a disabled
   "Post 0 grade(s)" renders pixel-identical to an enabled one. AC U5.22
   ("disabled while it runs, and the disabled state says why") is literally
   unimplementable on this primitive. Revision 1 told the implementer to
   reuse `.linkButton`. That instruction is WITHDRAWN: primary and
   destructive actions use `.submitButton` (page.module.css:390-405) or the
   compact `.ccBtn` (:5353); `.linkButton` is for tertiary actions only, and
   whatever is used must have a visible disabled state.

### Is a table the right form once a folder is chosen?

Once one folder is selected the "matrix" is a list of 30 rows with one score
each, rendered through a `<table>` whose per-column `min-width` floors
(repo-grades.module.css:63, 192, 217) exist purely to serve the multi-column
case that scoping just eliminated.

The instructor's job after a bulk run is not to read 30 numbers in a column;
it is to find the four the model got wrong. A table gives every row equal
weight. A scored list can surface "3 scores below 50%", "2 grading failures",
"6 repos missing this folder" and collapse the uneventful majority - and it
solves the comment-in-a-56px-box problem for free. The 700px reflow already
IS a card list (:374-382), so the mobile layout is arguably the better
desktop layout.

**Decision to put to the owner rather than take unilaterally:** the honest
recommendation is that the scored review list becomes the PRIMARY form for a
single chosen folder and the table remains available for the all-folders
view. That is a larger change than "overhaul the layout" and it is out of
revision 1's stated scope, so it is raised here explicitly instead of being
smuggled in or silently dropped.

### Accessibility - additions to revision 1

- **Unlabelled buttons in the header.** RepoGradesGrid.tsx:152 gives the
  assignment select an `aria-label` naming its folder; :163-172 and :173-182
  give "Grade all" and "Post N grade(s)" nothing. A screen reader user tabbing
  the header row hears N identical "Grade all" buttons. AC U1.2 fixes the
  grade label as copy; the post button stays anonymous unless named here.
- **`.fieldHint` is never associated with its control.** No `aria-describedby`
  anywhere - RepoGradesControls.tsx:199 and every hint in LinkUsernamesPanel
  and LinkUsernamesRosterSection are orphan `<p>` siblings.
- **The live region's real failure is repetition, not chattiness.** Revision 1
  asked it to announce less. It should announce reliably - identical
  consecutive messages currently do not re-announce at all.
- **`CHECKBOX_LABEL_STYLE` was misdiagnosed.** It is not only overriding
  `.field label`'s caption treatment, it is carrying layout
  (`display:flex; align-items:center; gap:8`), and both labels simultaneously
  wrap their input AND set `htmlFor` to it (RepoGradesControls.tsx:179-198).
  The fix must be named, not left to the implementer: add a `.checkboxField`
  class in repo-grades.module.css. Do NOT change `.field label` globally -
  that is a page-wide change AC U6.23 does not permit.
- **Colour-only signalling is currently avoided** (`.postStatusPosted` /
  `.postStatusError` pair colour with distinct text,
  repo-grades.module.css:280-300). Any consolidation of per-cell status into
  a compact summary is exactly where that pairing gets dropped. Constraint:
  it must not be.

### Copy - corrected

- **"Grade all repos in module-3" must be derived from the PLAN, not the
  folder name.** It is false when `scanTruncated` is set, and false when
  `bulkSelectionOnly` is on with rows checked, where the run covers the
  selection rather than all repos (repoGradesBulkGrade.ts:80).
- **"11 repos have a username but no Canvas user id"** already exists nearly
  verbatim at LinkUsernamesRosterSection.tsx:126-130. It is not new copy; it
  is copy that is being HIDDEN (see above).
- **RepoGradesGrid.tsx:208** - "No repositories matched this org (and prefix
  filter, if set)." The parenthetical hedge is the tell: the component knows
  whether a filter is set and refuses to say. AC U4.18 requires the split.
- **index.tsx:601-607** - the 42-word conditional banner explaining that a
  workflow step's mechanism is available here. It is warning-toned, says
  nothing actionable, and exists largely to keep a step name greppable
  (index.tsx:71-86). It is scar tissue from the correction that produced
  commit ddb1db6. Replace it with the actionable count from U4.17, and keep
  the step label searchable in a comment rather than in the UI.
- **`CELL_STATUS_TEXT`** (RepoGradesGrid.tsx:84-88) prints "Unknown - scan
  failed" in the cell while the per-repo error is ALSO printed in the repo
  cell (:267). Duplicated failure reporting.
- **"Only the checked rows"** has no object. It governs bulk GRADING only;
  posting always scopes to the selection
  (useRepoGradesGradingActions.ts:264). Two different selection semantics
  under one ambiguous label.

### A known-wrong number is being relocated

useRepoGradesGradingActions.ts:251-261 documents in code that the column
header's "Post N grade(s)" count is computed from unscoped rows while the
post itself is selection-scoped, so the visible count can disagree with what
posts. AC U3.13 moves that button to the view surface - which is the moment
to fix it, not to carry it across.

### Rejected in revision 1 - do not re-propose

- "Two horizontal hunts through a wide table." False; the controls are
  stacked in one sticky header cell.
- "Type instructions into a textarea" as part of the default path. False;
  the README toggle defaults on and instructions persist.
- "This must not cost more clicks than today" asserted without counting. The
  proposal was +2.
- "Reuse `.linkButton`." It has no disabled state and fails the minimum hit
  target; it is what makes every action in this view look like a hyperlink.
- Treating the `role="status"` region as a working channel that should
  announce less. It is invisible to sighted users and does not re-announce
  repeats.
- Collapsing instructions and rubric behind a disclosure with no statement of
  the effective grading source. That hides the configuration that silently
  fabricates postable scores.

## 5. Data engineering pass (loop step 1d) and architect revision 3

Section 3 revision 2 was rejected on re-check. The data engineering pass (a
delegated peer-class agent, run concurrently with the architect and UX passes)
and that re-check were produced independently and CONVERGED on the same
correction to the folder write-back, which is why that one is treated as
settled rather than as a proposal.

### Settled: the folder write-back must not fire on a filtered scan

Revision 2 said the folder restore branch writes back whenever a successful
scan lacks the persisted folder. That destroys the instructor's choice during
ordinary use:

1. `module-3` is selected and persisted.
2. The instructor types one character into the repo-name filter.
3. That scan settles SUCCESSFULLY with a narrower column set.
4. The gate is open, so the branch drops to "All folders" and writes it back.
5. The instructor clears the filter. `module-3` is gone from storage forever.

The rule: **the folder may be dropped-and-persisted only when it is absent
from an UNFILTERED scan of the current course** (`orgPrefix.trim() === ""`).
A folder missing from a prefixed scan is hidden, not gone. This also means
**AC U1.6 is wrong as written** - it names "prefix filter changed" as a drop
reason. U1.6 is amended by this section.

Paired with it: **debounce the prefix input at 300-400ms.** It is not a
polish item. `scanKey` embeds the trimmed prefix
(useRepoGradesData.ts:259) and the `cancelled` flag (:281-283) discards the
RESULT, never the REQUEST, so typing "module" against a 30-repo org fires six
full org scans - roughly 270 GitHub requests to use one result.

### Settled: revision 2's readiness gate was a tautology

"Require a SUCCESSFUL scan, not merely a non-null `model`" is a distinction
without a difference. `scan = scanMatches ? scanResult.data : null`
(useRepoGradesData.ts:287) and `data` is null on error (:276), so
`model !== null` IS "a settled scan that succeeded" (index.tsx:147). There is
no third state. The prescription added nothing and invited an implementer to
invent a redundant extra condition.

### Settled: a SECOND restore branch, keyed on courseId

Revision 2 specified one branch keyed on the scan. That leaves the previous
course's folder displayed under the new course - and if the new course's org
is unset or its scan errors, the scan-keyed gate never opens and the stale
folder stays on screen indefinitely, on an enabled control that will act on
it. The folder needs a courseId-keyed branch folded into the existing
render-phase block at index.tsx:398-403, which is exactly where
`loadRepoGradeLog(uiState.courseId)` already lives. Both branches must be
specified, along with which wins when both fire in one render.

### Settled: never filter on write; filter on read

This replaces revision 2's "two separately named values plus a guard test",
which lowers the probability of erasing every assignment mapping without
removing it. Delete the write-back at index.tsx:253, hold the raw stored
slice in state, and apply `filterRepoGradeAssignmentMapping` as a read-time
projection where `columnsWithMapping` is built (index.tsx:255), against the
FULL column set. The write-back has no upside - re-reading a stale entry
costs nothing, because the read-time filter drops it on every restore - and a
silent, unrecoverable downside. It also dissolves the
`!assignmentsLoading && !assignmentsError` gate (index.tsx:244) and with it
the "your mapping exists but we withheld it" state.

Where a guard is still wanted, a source-text assertion is the WEAKEST option
available and this repo has been burned by it before
(repoGrades.wiring.test.ts:541-548), and it fails open if the implementer
names the variables differently. Brand the full column set with a nominal
type so `tsc` rejects the scoped array at the call site - a compile-time
guard, about three lines, that cannot fail open and cannot go red because a
comment grew. Note the guard file's own governing rule at :17-23: a
structural assertion without a canary is worthless.

### Settled: the same argument applies to the selection write-back

`ta-repo-grades-selected` is a FLAT key while repo ids belong to one course,
so switching courses filters the previous course's ids out and
`persistSelectedRepoIds(restored)` (index.tsx:201) writes the empty result -
permanently erasing that course's selection. Removing that write-back fixes
it, but repoGrades.wiring.test.ts:446 asserts the call is present.
**Report under U7.31; do not quietly edit the guard.**

### Corrected: decision (e) on the status surface was an ARIA inversion

Revision 2 said keep the srOnly live region and mark the new visible surface
`aria-hidden`. That is backwards. The canonical form is `role="status"
aria-live="polite"` ON THE VISIBLE element, with no duplicate. A live-region
announcement is transient and unreviewable; `aria-hidden` on the visible copy
removes it from the accessibility tree, so a screen-reader user who is also
sighted - low vision with magnification, braille display, SR as reading
support - can see the summary but cannot navigate to it or re-read it.
U7.30's "the `role="status"` region survives" is satisfied by moving the role
onto the visible node: same role, same properties, same `postSummary` source.

The instruction was also dangerous for progress specifically: `bulkProgress`
is NOT currently announced at all - `useRepoGradesBulkGrade.ts:160` calls
`onAnnounce` only after `Promise.all` resolves - so hiding it would remove
its only accessible form rather than prevent a double-announce.

### Corrected: the mid-run corruption vector is the COURSE SELECT

Revision 2 coupled `selectedFolder` to `bulkRunningFolder`. But the plan and
every grading parameter are frozen at click time
(useRepoGradesBulkGrade.ts:86-98), so the folder control is comparatively
harmless. The course select is what corrupts data: a switch mid-run resets
`cellEdits` (index.tsx:398-403) while in-flight workers keep calling
`onCellUpdate`, writing course A's scores into course B's state - and on
completion `buildLogEntry` stamps `courseId: uiState.courseId`, the CURRENT
one, so course A's grading outcomes are persisted into course B's log under
course B's id. U5.22's enumerated disable list is correct to name the course
select first.

### Corrected: the census, twice over

- It does NOT have to come from the rows. `buildRepoGradeColumns` receives
  every repo's folder list already (repoGradesRows.ts:120-122) and walks it
  at :124-127; `buildCell` derives status from nothing but `folders`
  (:108-112). Computing it from `row.cells` would add a second full
  O(rows x columns) pass for no benefit.
- The "unknown" count is a PER-SCAN scalar, not a per-folder number. A repo
  with `folders === null` contributes to no folder's present-count and its
  unknown-ness applies to every column identically. U1.4 corrected.
- Consequence revision 2 missed: its own rejection of "a new pure module
  taking columns as input" was justified solely by "it cannot produce the
  census". Once the census is IN `RepoGradeColumn`, that reason evaporates
  and the ban must be reopened - which matters, because that module is what
  keeps folder resolution testable under node-env vitest and keeps index.tsx
  under the cap.

### Corrected: `parseSortValue` is testable where it is

Revision 2 claimed logic in a `.tsx` is "untestable by construction" here.
False. `vitest.config.ts`'s `include: ["src/**/*.test.ts"]` constrains which
files are COLLECTED, not what they may IMPORT. Four existing precedents
import a pure function straight out of a `.tsx` from a `.test.ts`:
LecturePlanPreviewModal.test.ts:3, courses/CoursesTable.gate.test.ts:65,
workflows/builder/InputBindingRow.options-select.test.ts:23, and
tasks/TaskColumnMenu.focus.test.ts:29. The house answer is "write the test",
not "move the file".

### New, and unowned by any section: U8.33 has no architectural home

`buildBulkGradePlan` is built at CLICK time only
(useRepoGradesGradingActions.ts:494-495). To show "will cover N, skip M"
BEFORE the click, the plan must be built during render, every render, over
`withLiveScores(rows, cellEdits)`. That is a second invocation over state
that can change between the two - which is exactly the disagreement U8.33
forbids. Decide where the render-time plan lives and how the click reuses it
rather than recomputing.

### New: raw folder names are used as plain object keys

Decision (g) correctly forbids normalizing folder names. It did not address
that those raw strings index plain `{}` objects: `applyRepoGradeAssignmentMapping`
does `mapping[column.folder] ?? null` (repoGradesAssignmentMapping.ts:85) on
an object from `JSON.parse`. A repo with a top-level `toString/` or
`constructor/` directory yields an inherited function - non-nullish, so `??`
does not catch it - which then flows onward as a Canvas assignment id. Use
`Map` or `Object.create(null)` for the census map and the mapping lookup.

### New: "All folders" has no safe sentinel

Because folder strings are raw and unconstrained, every in-band sentinel
("", "*", "__all__") can collide with a real top-level directory. `null` is
the only safe in-memory form, and localStorage stores strings, so the
persisted encoding needs an out-of-band form. Decide it explicitly.

### Storage design

| Key | Shape | Written by | Notes |
|---|---|---|---|
| `ta-repo-grades-folder` (NEW, the 13th) | `Record<courseId, string>` | folder control onChange; drop-write only on an unfiltered scan | absent/"" = All folders. No migration - absent key, absent slice and "" all read as the correct default. Must no-op on a blank courseId, as `loadAssignmentMapping`:285 and `persistAssignmentMapping`:293 both do. |
| `ta-repo-grades-cells` (NEW, the 14th) | `Record<courseId, Record<repo, Record<folder, PersistedCellEdit>>>` | every grading resolution and post fan-out | `grading` omitted from the type and `postStatus` narrowed to exclude "posting", so the un-restorable states are UNREPRESENTABLE rather than sanitized on read. Per-cell `at`, 500-cell cap evicting oldest, never filtered against the current scan. |
| `ta-repo-grades-assignment-map` | unchanged | `handleAssignmentChange` only | write-back at index.tsx:253 deleted |
| `ta-repo-grades-selected` | unchanged | `toggleSelected` only | write-back at index.tsx:201 deleted (report the guard break) |

Do NOT fold the folder into `ta-repo-grades-assignment-map`: that blob
accepts a course slice only if `isStringRecord(mapping)`
(repoGradesUiState.ts:255-261, applied at :271), so a nested object makes the
WHOLE slice fail validation and be dropped, erasing every mapping for that
course. And never add a `version` key to any existing blob -
`parseAssignmentMapByCourse` (:270-272) and `parseLogByCourse` (:318-320)
treat every top-level key as a courseId.

### Why persisting cellEdits is required, not preferred

`buildBulkGradePlan` skips a cell whose score is non-empty
(repoGradesBulkGrade.ts:121) - the "never re-spend a model call on work
already done" guarantee. That guarantee is DEFEATED BY A RELOAD today: the
scores vanish, the plan sees every cell ungraded, and one click re-spends the
entire run. The existing justification for non-persistence (index.tsx:375-403,
"a typed but un-posted score surviving a reload would be surprising") was
written when a cell was graded one click at a time. A bulk run is up to N
model calls with no cancel.

Cost: roughly 1-2KB per graded cell, so 30-60KB per folder. Count it against
the same origin quota as the log, which at its 500-entry cap is 137-227KB per
course and 1.4-2.3MB across ten courses in one key - against roughly 5MB
shared with about a hundred other `ta-` keys in this app. Every persist
swallows its throw (repoGradesUiState.ts:205-209, 238-240, 298-300, 346-348),
so a quota exception means the only durable record of live-gradebook writes
silently stops being written.

### The review surface needs no server change

`gradeRepoAction` RETURNS the generated rubric (github-repos.ts:688); the
client drops it, along with `feedback` and the structured truncation flags, at
two destructure sites (useRepoGradesGradingActions.ts:186-216,
useRepoGradesBulkGrade.ts:122-148). The work is to stop discarding four
fields.

Keep `rubricText` PER CELL, not per run: with the rubric textarea blank,
`generateRubric` runs per call (github-repos.ts:680), so thirty repos are
graded against thirty DIFFERENT machine-generated rubrics. One run-level
field would hide that. The review surface should compare them and say "one
rubric" or "N distinct rubrics" - the single most valuable thing it can show.

### Raised, not taken: the scan costs twice what it needs to

`loadOrgRepoTreesAction` calls `getRepoTree` with no ref
(actions/repo-grades.ts:72), so `getRepoTreeWithMeta` issues a full
`GET /repos/{owner}/{repo}` purely to learn the default branch
(github.files.ts:33) - which the org listing already returned as
`defaultBranch` (github.repos.ts:90) and the fetcher interface then discards
by narrowing to `Pick<GithubRepo, "fullName" | "htmlUrl">`
(repo-grade-tree-scan.ts:154). A 30-repo org costs 61 requests, 30 of them
avoidable. About a six-line fix threading `defaultBranch` through as `ref`;
it halves the scan's request count and its wall clock against the 60s Vercel
Hobby cap. Out of scope for a UX overhaul, worth its own work item.

### Extractions to plan now, not at the cap

Revision 2 estimated +80 to +140 lines on index.tsx (657 today), landing
740-800. That scoped revision 1's proposal. Revision 2 and this section add a
second restore branch, the coupling and disable states, a visible status
surface with progress, per-course load/persist wiring, the render-time plan
for U8.33, and possibly cancel. Against this file's real comment-to-code
ratio - the selection restore branch is 6 lines of code under 35 lines of
comment (index.tsx:162-202) - the honest range is +200 to +300, landing
860-960. Under the cap with no margin, in a file already split once at it.
Name the extractions now: `useRepoGradesFolderSelection.ts` (state, both
restore branches, per-course persistence, the full/scoped column pair),
`repoGradesFolderSelection.ts` (pure, node-env testable - the module revision
2's stale rejection currently forbids), and `RepoGradesStatusSurface.tsx`.

### Row scoping: decided here, not punted

Revision 2 handed "do rows scope with columns?" to the UX pass. It is not a
UX question alone - it determines what `selected` covers and what feeds
`buildBulkGradePlan`. It is also already answered by the code:
`buildBulkGradePlan` internally skips `missing-folder`
(repoGradesBulkGrade.ts:95-98) and `scan-error` (:107-110) rows, so **row
scoping is DISPLAY-ONLY** and the plan can keep reading the full row list
with no behaviour change. AC U1.3b stands.

### Still undecided, and an implementer cannot avoid inventing them

Which branch wins when the scan-keyed and courseId-keyed restores fire in one
render; what the folder control shows during that window; the "All folders"
sentinel encoding; whether cancel ships (U9.40 is absent from every architect
revision so far); and `RepoGradesControls.tsx`'s fate.

## 6. UX revision 3 - corrections from the re-check

Section 4 revision 2 was rejected on re-check. It fixed revision 1's errors
and introduced three of its own.

### Settled: the sticky header is INERT - my "correction of fact" was wrong

Revision 2 rebutted revision 1 by claiming `thead th` is
`position: sticky; top: 0` (repo-grades.module.css:33-40) so a folder's
controls "stay on screen". **The rule exists and does nothing.** `.gridWrap`
is `overflow-x: auto` with NO height and NO max-height
(repo-grades.module.css:12-16). `overflow-x: auto` with `overflow-y: visible`
computes overflow-y to `auto`, so `.gridWrap` is the nearest scrollport in
both axes - and because its height is content-derived it never scrolls
vertically, so `top: 0` never engages. Scroll the PAGE and the header leaves
with everything else.

The working form is already in the repo: `courses/CoursesTable.module.css:87-88`
is `max-height: calc(...)` plus `overflow: auto`, which is why that table's
sticky header actually sticks.

Two consequences revision 2 got wrong as a result:
- Its whole "one hunt, not two" baseline rests on an inert mechanism.
- **Nothing is `position: sticky; left: 0`**, so scrolling right drops the
  Select / Repo / Binding columns entirely - the exact loss AC U3.15 forbids,
  and the direct cost of the "one hunt" revision 2 was defending.
  `CoursesTable.module.css`'s `.stickyName` is the in-repo answer and is
  cited nowhere in this document.
- During a bulk run the ONLY progress indicator is the button label
  (RepoGradesGrid.tsx:146), which lives in that folder's `<th>` and scrolls
  out sideways the moment the instructor looks at another column.

### Settled: the click model, corrected a second time - the target is a ZERO-click steady state

Revision 2 claimed parity was reachable "if choosing a folder also carries
the assignment mapping, saving 2 clicks." **That saving already exists and is
not the folder control's to claim.** index.tsx:242-255 restores
`ta-repo-grades-assignment-map` for the course,
`applyRepoGradeAssignmentMapping` (repoGradesAssignmentMapping.ts:79-87)
writes it onto every column, and RepoGradesGrid.tsx:151-155 binds
`value={column.assignmentId ?? ""}`. On the second and every later use of a
folder the assignment select is ALREADY pre-set with zero clicks.

So revision 2 charged today's baseline two clicks it does not cost, then
booked the same mechanism as its own gain. Recounted, course already chosen:

| scenario | today | revision 2 | delta |
|---|---|---|---|
| first-ever use of a folder | 5 + 1 scroll | 7 | +2 |
| second use, mapping saved | **3** + 1 scroll | 5 | +2 |
| three cached folders in a row | **9** | 15 | +6 |

Parity is reached in NO case, and it fails worst in the steady state the
instructor actually lives in. The parity math also omitted the
acknowledgement gate revision 2 mandates 26 lines later, plus U8.35's confirm
and U9.40's cancel-or-warn.

**The requirement, restated:** the folder choice persists (U1.5), so the
steady state must cost ZERO clicks. The persisted folder drives a named
resting primary action - "Grade all 30 repos in module-3", "Post N to
<assignment>" - so the steady path is grade + post + confirm = 3, matching
today, and the picker is paid for only when the folder actually CHANGES.
A design where the instructor re-operates a picker on every visit is a
regression however well it reads.

### Settled: the review surface has prior art, and revision 2 specified it from scratch

`GradingResults.tsx` (950 lines) already renders `rubricAreas` as a per-area
matrix, sorts by per-area score (:469-470), supports per-area comment editing
and a post path. `DraftedGradesTab.tsx:632-671` renders the same breakdown
with an empty-state branch. `RepoGradeCellControl.tsx`'s own header comment
already cites `GradingResults.tsx:781-832` and :363-390 as its idiom source,
so the precedent is one hop away. Read both before designing anything.

Corollary correction: the claim that `rubricAreas` "is rendered by nothing"
is false repo-wide. Only the qualified form is true - no component under
`repo-grades/` reads it.

### Settled: the table stays primary; a review panel goes above it

Revision 2 punted the table-versus-list question to the owner. That is
handing back the request - what form the view takes once a folder is chosen
IS the overhaul. Decided here, against a replacement list:

- The <=700px reflow already produces a card list from the SAME markup
  (repo-grades.module.css:374-382), so a desktop list is a third rendering of
  the same rows to keep in sync, and the explicit ARIA roles that reflow
  depends on (RepoGradesGrid.tsx:222-249) are load-bearing under U7.30.
- The binding column has no list equivalent - `RepoBindingControl` renders
  four distinct shapes including a full roster `<select>` (:45-139).
- The real complaint is that outliers do not surface, which is a
  summary-and-sort problem, not a container problem. `sort` already offers
  "Needs attention first" (RepoGradesControls.tsx:170).
- The frozen identity column that makes a wide table readable already exists
  in-repo (`CoursesTable.module.css` `.stickyName`).

Concretely: a summary strip - "30 graded, 2 failed, 6 missing this folder, 3
below 50%" - whose figures act as FILTERS over the same table, plus a row
expander revealing `rubricAreas`. Review requirement satisfied, no second row
renderer.

### Corrected: the fabricated-score path fires from the DEFAULT state, so a pre-run gate cannot catch it

Revision 2 framed the trigger as "instructions empty AND the README toggle
off". The toggle defaults ON (repoGradesUiState.ts:112), and with it on, a
folder with no README sets `readmeMissing` and falls straight back to the
same empty textarea (github-repos.ts:655-665). So the fabrication is
reachable from the default configuration, PER REPO, MID-RUN - and
useRepoGradesBulkGrade.ts:143-147 logs the fallback and grades anyway.

At click time, instructions may be non-empty and the README missing only for
repo 17. **The gate must be per-repo and at-result, not pre-run.**

The pre-run acknowledgement revision 2 mandated would also become a nag: it
fires on a condition that is the default for a new course, on every run,
before the thing that actually causes fabrication is knowable. An instructor
who sees it three times clicks through it the fourth. Better: make the state
unreachable - disable the grade action while the effective grading source is
"nothing", with the reason stated inline in the collapsed disclosure header,
and surface the per-repo fallback in the results, which the log already
carries. A blocked button with a stated reason costs zero clicks; a modal
costs one every time, and this document is already over budget.

One more correction: the fabrication is provider-conditional.
`provider === "embedded"` DOES error out (github-repos.ts:671-673).

### Corrected: withdrawing `.linkButton` entirely was an over-correction

The finding stands - no `:disabled` rule exists in page.module.css,
login.module.css or repo-grades.module.css, and the hit target is under the
24x24 minimum (measured at ~21.6px, not the "17-20px" revision 2 asserted;
`font: inherit` inside `.grid`'s 0.9rem at 1.5 line-height). There are
exactly 15 call sites in this view.

But this view legitimately needs tertiary text actions: "Refresh"
(RepoGradesControls.tsx:153), "Download CSV / JSON / Clear log"
(RepoGradesLogPanel.tsx:112-120), and per-candidate "Bind to this student"
(RepoBindingControl.tsx:87-96). Turning fifteen of those into pill buttons
inside table cells is worse than today. The instruction is:
**add a `.linkButton:disabled` rule and a 24x24 hit area** (padding plus a
compensating negative margin), and promote only the four consequential
actions - Grade all, Post N, Confirm all suggested, Apply usernames - to
`.submitButton` or `.ccBtn`, both of which already have `:disabled` rules
(page.module.css:428, :5374).

### Corrected: "every result is invisible" was an over-claim

`postSummary` really is rendered only at index.tsx:614-616 inside `srOnly`,
but what flows through it is the AGGREGATE one-liner, not every result. Bulk
and single-cell scores land in the visible score input
(useRepoGradesBulkGrade.ts:124-137, useRepoGradesGradingActions.ts:186-195);
per-cell grade failures render with `role="alert"`
(RepoGradeCellControl.tsx:135-139); post status renders (:140-148); the log
panel renders "N event(s) - X graded, Y posted, Z failed"
(RepoGradesLogPanel.tsx:105-109).

Two early returns also behave differently: `handlePostColumn`'s "nothing
postable" DOES write log entries (useRepoGradesGradingActions.ts:278-288);
`handleGradeColumn`'s "nothing to grade" (:496-499) writes none and is the
genuinely silent path.

This matters because the honest problem is PLACEMENT AND PROMINENCE - which
points at promoting the summary the log already computes - not "the output
side does not exist", which points at building a new subsystem.

### States still missing after revision 2's corrected list

- **`model === null`** (index.tsx:618): the grid is not rendered AT ALL - not
  even its own empty state, which only fires on `rows.length === 0`
  (RepoGradesGrid.tsx:207-209). With a course chosen and the scan loading or
  failed, the grid region is a bare blank gap. **AC U4.19c is violated by the
  current code.**
- **`showRowDependentFields === false`** (index.tsx:530): sort, both
  checkboxes and both textareas all UNMOUNT together when the scan returns
  zero rows - while the persisted `instructions` value stays live and still
  governs the next run. U2.9's rule about collapsed sections has no answer
  for controls that are ABSENT rather than collapsed.
- **`roster.length === 0`** in the unbound picker
  (RepoBindingControl.tsx:115-117): "No roster loaded", select disabled. In
  the `missingInstitution` state this is every unbound row, and nothing
  connects the two.
- **Zero-target bulk run**: useRepoGradesBulkGrade.ts:96-98 sets
  `runningFolder` to `targets[0]?.folder ?? null`, i.e. null, so the busy
  state never engages and the run "completes" invisibly. This is the concrete
  mechanism behind "clicked it and nothing happened".
- **`confirmResult !== null && !confirmError`** (LinkUsernamesPanel.tsx:399-403)
  is deliberately OUTSIDE the `suggestedCount > 0` gate, with a comment
  explaining that a successful confirm-all is what drives that count to 0.
  Moving that button into a bulk bar without preserving the split would
  unmount the result in the very commit that produces it.

### Narrow width, quantified

The nested-card defect costs real width: `.page` 48px + outer border 2 +
`.card` 72 + inner border 2 = **124px of horizontal chrome**, leaving roughly
251px of content at a 375px viewport. That is the largest narrow-width defect
in the view. Also: `.field textarea { min-height: 220px }` is NOT relaxed in
the 700px query, so 440px of textarea survives at 375px; and
`#repo-grades-org-prefix` is missing from the id rule at
repo-grades.module.css:459-463, which covers only course and sort.

### What is still not an overhaul

Ship revision 2 exactly and the instructor still lands on: the ten stacked
conditional paragraphs of RepoGradesStatusBanners.tsx:56-124, untouched; then
the 406-line LinkUsernamesPanel, untouched and still between the controls and
the grid. Revision 2 spotted this itself and then did not act on it.

Two decisions this document still owes:
- **LinkUsernamesPanel collapses to a one-line status with a count once
  anything is bound**, and expands only in the blocked state - a condition
  already computed as `noConfirmedRows` (index.tsx:509).
- **The ten status paragraphs consolidate** into one surface with the counts
  U4 requires.

## 7. Sequencing - three slices, in dependency order

The final consistency check's blocking delivery finding: this document
mandates a multi-week item and contained no phase split, no dependency
ordering and no statement of what ships first. Per this project's
group-per-push rule, it needs groups. Each slice below is independently
shippable and independently regression-testable.

### Slice A - make the view answer back

Highest value, lowest risk, no new persisted state, and no unmade decision
blocks it.

- **U0c** - delete the nested `.tabContainer` (index.tsx:512). One line.
  Restores `.card`'s `gap: 28px` between every section.
- **U5.20 / 20b / 21** - the visible status surface, with `role="status"`
  moved onto the VISIBLE node (section 5's ruling, not section 3's).
- **U6.27** plus a `.linkButton:disabled` rule and a 24x24 hit area, and
  promoting only the four consequential actions to `.submitButton`/`.ccBtn`.
- **U9.36 / 37** - the confirm-binding guard. This is the instructor's
  CURRENT state: 11 rows sitting one click away from going backwards.
- **U11.46** - focus rules, which the file has none of.

Why first: it fixes "I clicked it and nothing happened"; it is a
PREREQUISITE for Slice B, because U3.13 deletes `bulkProgress`'s only
renderer (RepoGradesGrid.tsx:143-146); and it touches no persistence, so
nothing can be silently erased by getting it wrong.

### Slice B - the mechanism the instructor actually asked for

- the census inside `buildRepoGradeColumns`;
- `repoGradesFolderSelection.ts` (pure) and
  `useRepoGradesFolderSelection.ts`;
- U0a / U0b, U1.1 through U1.6d, U1.3b;
- U3.13 / 14 / 15;
- U9.41's read-time filter plus the branded nominal type;
- U8.33 / 34 / 35.

Ships behind Slice A's status surface, which is why the ordering matters.

### Slice C - the output side

- U10.42 through 45 (review surface, rubric retrieval, persisting
  `cellEdits`);
- U9.38 / 38b / 39, and U9.40 (cancel);
- U4's state consolidation;
- the two decisions section 6 owes, once written as criteria:
  LinkUsernamesPanel collapsing to a one-line status, and consolidating the
  ten status paragraphs.

### If only one slice ships: A

It is the only slice that is all upside, needs no unresolved decision, and
directly answers the instructor's reaction.

## 8. Decisions still owed before Slice B or C can start

Slice A is unblocked. These block B and C, and an implementer would otherwise
invent them:

1. **Which restore branch wins** when the scan-keyed and courseId-keyed
   branches fire in the same render, and what the folder control shows during
   the scan window.
2. **The "All folders" persisted encoding.** Section 5 decides this three
   incompatible ways - out-of-band required, then `""` in the storage table,
   then listed as undecided.
3. **U0a versus U1.6 tiebreak.** A stale persisted folder lands in a state
   U0a says is the first folder and U1.6 says is "All folders", which U0b
   says is not a default.
4. **May the wiring guards be edited?** Three will go red (the 400-char
   window if the selection write-back is deleted, and the two
   `ColumnHeaderControls` assertions when U3.13 relocates the post control).
   U7.31 says report, not edit - but never says whether red blocks the push,
   and U7.32's gate does not run vitest.
5. ~~CoursesTable or TasksGrid as the table shell.~~ **RESOLVED by the owner,
   2026-08-26: TasksGrid - "tasksgrid, it's a wide matrix."** No zebra,
   sentence-case headers; what converges is the shell mechanics (a bounded
   `max-height` scroller so the sticky header actually engages, and a frozen
   identity column). See U6.26b.
6. **What happens at 720px** - move the 700px breakpoint, lower the
   220/190/170 min-width floors, or restate U3.12.
7. **How U8.35's confirm, U2.9c's acknowledgement and U9.38b's disable
   compose.** If 38b disables the action, 2.9c's acknowledgement can never
   fire. U2.9c should probably be deleted.
8. **Is the selection write-back at index.tsx:201 deleted?** Section 5 says
   yes, section 1 forbids it, U7.28 arguably forbids it, and a wiring guard
   asserts it is present. Four sections disagree about one line.
9. **Does cancel ship** (U9.40 allows "or say plainly that it cannot") - a
   roughly 150-line swing.

## 9. Known-inaccurate claims in this document, corrected

Kept visible rather than rewritten out, because each was asserted confidently
and acted on before being caught.

- **The view lacks `.card`.** FALSE - page.tsx:385-387 wraps it in TabShell.
  The defect is a redundant nested `.tabContainer`; the fix is deletion.
- **The nesting costs 124px of horizontal chrome.** FALSE - `.card` has no
  border or radius; deletion reclaims 2px. The value is the restored
  `gap: 28px`.
- **The inner container overflows and is clipped.** FALSE - `min(100%, 96vw)`
  cannot exceed its containing block.
- **Two horizontal hunts through the table.** FALSE - the controls are
  stacked in one header cell.
- **The sticky header keeps them on screen.** FALSE - the rule is inert.
- **Today's path costs 5 clicks.** FALSE - the assignment mapping is already
  restored, so the steady state is 3, and the proposal was +2.
- **`rosterOverlay.withoutCanvasId` gives U4.17's count.** FALSE - it is a
  delta metric reading zero in exactly the state the criterion exists for.
- **The header post count disagrees with what posts.** FALSE - already
  scoped; the code comment describing otherwise is stale.
- **`rubricAreas` is rendered by nothing.** FALSE repo-wide - true only
  within `repo-grades/`. GradingResults.tsx and DraftedGradesTab.tsx render
  it.
- **The generated rubric is discarded by the server.** FALSE - the action
  returns it; the client drops it at two destructures.
- **Logic in a `.tsx` is untestable here.** FALSE - four existing tests
  import pure functions straight out of `.tsx` files.
- **`.field textarea` is not relaxed at narrow width.** FALSE - it drops to
  180px at 600px.
- **The view renders six live regions.** UNDERCOUNT - fourteen, once
  `role="alert"` is included.
- **53 verification tags.** UNDERCOUNT - 69.
