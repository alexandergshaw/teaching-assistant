# Repo Grades rubric picker - acceptance criteria

Requested 2026-08-26: "is it possible on the repo page to implement a rubric
picker that feeds the grading of the assignments? This should be fed by the
live lms connection or the course export in the course row".

## The defect this closes

The Repo Grades view grades against ONE free-text rubric string. That string
comes from a single textarea (`RepoGradesControls.tsx`'s
`repo-grades-rubric`), persisted globally under `ta-repo-grades-rubric`, and
is passed verbatim as `gradeRepoAction`'s third argument by every grading
path on the page (`useRepoGradesGradingActions.handleGradeCell`,
`useRepoGradesBulkGrade`). Blank means "let the model invent one from the
instructions".

The instructor already HAS the real rubric in two places this page can reach
without a single extra request:

1. The live LMS connection - a Canvas course's own rubric list
   (`listRubrics`, `src/lib/canvas-modules/rubrics.ts`, already powering the
   Assignments tab picker in `CourseItemsView.tsx:801-819`), and the rubric
   ATTACHED to a specific assignment (`fetchCanvasMetaAction` ->
   `rubricText`, `src/app/actions/grading.ts:79`).
2. The course row's stored export - `ExportCourseContent.rubrics`
   (`CartridgeRubric[]`), which `useRepoGradesData.ts:447` ALREADY loads for
   this exact page and currently throws away.

Today the only way to use either is to open another surface, copy rubric
text, and paste it into the textarea. That is the friction to remove.

## Vocabulary

- **Rubric source** - where the rubric text came from: `assignment` (the
  mapped Canvas assignment's own attached rubric), `live` (a rubric from the
  course's live Canvas rubric list), `export` (a rubric from the course row's
  stored export), `manual` (typed into the textarea), `generate` (blank -
  today's behaviour, the model derives one).
- **Effective rubric** - the exact string handed to `gradeRepoAction` for a
  given column at the moment a grade call is made.
- **Column** - one folder column in the grid, optionally mapped to a Canvas
  assignment id (`RepoGradeColumn.assignmentId`).

## R1 - Placement and shape

1. The picker lives in `RepoGradesControls.tsx`, in the SAME block as the
   existing instructions/rubric pair - not a modal, not a new tab. Click cost
   is a first-class factor here (standing project rule): choosing a rubric
   must cost one select interaction, never a dialog round trip.
2. It is a single `<select>` labelled "Rubric source", plus the existing
   rubric textarea, which stays on screen at all times.
3. Option order is fixed and source-grouped, never re-sorted per render:
   `Generate from the instructions` (the current default), `Use the mapped
   assignment's rubric`, then each live course rubric by title, then each
   export rubric by title suffixed `(from export)` - the exact labelling
   precedent `buildRepoGradeAssignmentOptions` already set for this page's
   assignment picker - then `Type my own`.
4. The default for a course that has never been touched is
   `Generate from the instructions` with an empty textarea, i.e. byte-for-byte
   today's behaviour. Shipping this feature must not change the grade any
   existing course produces until the instructor picks something.

## R2 - What each source resolves to

5. `generate` resolves to `""`. `gradeRepoAction` already treats blank as
   "generate one" - no new engine, no new branch in the grading action.
6. `manual` resolves to whatever is in the textarea. This is exactly today's
   path.
7. `live` resolves to the chosen course rubric rendered as rubric TEXT by the
   same renderer the rest of the app uses for a Canvas rubric
   (`formatRubric`, `src/lib/canvas/metadata.ts:52`) - never a second,
   divergent formatter.
8. `export` resolves to the chosen `CartridgeRubric` rendered as rubric text
   by a NEW pure function (a cartridge rubric is `{title, criteria:
   {description, points, longDescription, ratings}[]}`, not Canvas's shape).
   That renderer must emit the same line grammar `extractRubricCriteria`
   (`src/lib/grade/rubric.ts:10`) parses - `Area (N pts): description` with
   indented rating lines - so a rubric chosen from an export still produces
   per-area scores downstream instead of collapsing to one number.
9. `assignment` resolves PER COLUMN at grade time: the column's
   `assignmentId` -> `repoGradeAssignmentUrl(course.canvasUrl, id)` ->
   `fetchCanvasMetaAction(url).rubricText`. This is the only per-column
   source; every other source is one rubric for the whole page.
10. A resolved rubric is cached per column for the life of the current course
    selection, so grading a 30-repo column makes ONE meta call, not thirty.
    The cache is keyed by `courseId` + `assignmentId` and is dropped on a
    course switch, matching how `columnPosting` and `cellEdits` already reset.

## R3 - Honesty rules (non-negotiable)

11. An export carries NO rubric-to-assignment association at all
    (`ExportCourseContent.rubrics`' own doc comment states this). An export
    rubric must therefore NEVER be labelled or described as "this
    assignment's rubric". It is a course-level list, offered as such.
12. When the source is `assignment` and the column has no mapped
    `assignmentId`, the effective rubric is `""` and the view says so in the
    existing `role="status"` region before grading proceeds - it must never
    silently fall back to another column's rubric or to a different source.
13. When the source is `assignment` and `fetchCanvasMetaAction` fails or
    returns an empty `rubricText`, the effective rubric is `""` (the model
    generates one), and the failure is recorded in the activity log with the
    column and the reason. A grading run must never be blocked by a rubric
    lookup failure - the page's existing posture is that grading degrades,
    never aborts.
14. The textarea always shows the EFFECTIVE rubric text for the current
    source. For `live`/`export` it is populated and read-only (so what feeds
    grading is exactly what is on screen); for `assignment` it shows a short
    "resolved per column when you grade" note rather than a fabricated
    preview, since there is no single answer; for `manual`/`generate` it is
    editable exactly as today.
15. Switching from `live`/`export` back to `manual` keeps the resolved text in
    the textarea as an editable starting point, and the source becomes
    `manual`. The instructor's edit must never be silently re-overwritten by a
    later re-resolve of the source they just left.

## R4 - The wire (this is the point of the feature)

16. Every grading call on this page - the per-cell `handleGradeCell` AND the
    bulk `useRepoGradesBulkGrade` run - passes the EFFECTIVE rubric for that
    call's column. Two different code paths must not resolve the rubric two
    different ways; both read one shared resolver.
17. `useReadmeInstructions` (the README-over-instructions flag) governs
    INSTRUCTIONS only and is untouched by this feature. A rubric choice and a
    README instructions choice are independent, and both must survive
    together.
18. Reachability: the feature is not done when the resolver is correct. It is
    done when a grade produced from a picked rubric is demonstrably different
    from a generated one - traced from the select element through to the
    `gradeRepoAction` argument. A capability that ships dead with every gate
    green is the failure mode this project has hit before.

## R5 - Persistence

19. The rubric source choice and the chosen rubric's identity persist across
    reload under `ta-` keys, per course (one course's rubric id means nothing
    under another), following `loadFolderSelection`/`persistFolderSelection`'s
    per-course-slice shape exactly.
20. The existing global `ta-repo-grades-rubric` key keeps its current meaning
    (the manual textarea's text) so an instructor who reloads mid-typing loses
    nothing.
21. A persisted rubric id that no longer exists (the export was replaced, the
    Canvas rubric was deleted) degrades to `generate` with a visible note -
    never to a stale rubric, never to a crash. Same "never trust stored data"
    posture as `parseAssignmentMapByCourse` and `loadSelectedRepoIds`.

## R6 - Empty and error states

22. When the course has no live LMS connection, the live options are absent
    and the select says why in its empty state - not an unexplained short
    list. (Precedent: commit 103f0bd, "the assignment picker says why it is
    empty instead of just being empty".)
23. When the course row has no stored export, the export options are absent
    for the same reason and with the same treatment.
24. A live rubric list that PARTIALLY loads (`listRubrics` returns
    `{rubrics, error}` when course-level succeeded and account-level failed,
    or vice versa) still populates the picker with what loaded. Narrow on the
    SUCCESS key, never `"error" in result` - that exact bug has already been
    fixed once on another surface (`CourseItemsView.tsx:284-294`).
25. Loading either list must never block the grid, the scan, or the
    assignment picker.

## R7 - Posting interaction

26. Posting to Canvas already maps `rubricAreas` onto the live assignment's
    OWN criterion ids (`src/lib/canvas/grades.ts:58-93`) and falls back to
    overall grade + comment when names do not match. Grading against an
    export or account-level rubric whose criterion names differ from the
    assignment's attached rubric therefore posts an overall grade with no
    per-criterion breakdown. That is correct and must not be "fixed" by
    fuzzy-matching criterion names - but the log must say the breakdown was
    dropped, so a missing SpeedGrader rubric fill is explained rather than
    mysterious.
27. The existing rule stands unchanged: never post a rubric breakdown that
    contradicts the rescaled total (commit fd12788).

## R8 - Log

28. The activity log records, once per grading call, which rubric source was
    used and which rubric (title or assignment id) - reusing the existing
    `RepoGradeLogEntry.detail` free-text field, no schema change. "Why is this
    score what it is" is the question that log exists to answer, and "which
    rubric did it grade against" is now part of that answer.

## R9 - Non-goals (explicitly out)

29. No rubric EDITING on this page. Picking is not authoring; a rubric author
    already exists elsewhere (`RubricBuilderModal.tsx`).
30. No writing a rubric back to Canvas from this page. The existing guard test
    that `CartridgeRubric` never reaches a Canvas rubric WRITE path
    (`cartridge-import-blackboard.test.ts:926`) stays green, and this feature
    must not add a file to the set that violates it.
31. No per-repo rubric override. The unit is the column.
32. No change to the grading engine, the rescaling rules, or the tier
    vocabulary (`rubric-tiers.ts`).

## R9a - Amendments from the UX pass (these OVERRIDE the items they name)

39. **AC 14 was self-contradictory** - it required the textarea to always show
    the effective rubric AND to stay "editable exactly as today" under
    `generate`, but `generate` resolves to `""`, and today's editable-blank
    box IS the manual path. Resolution, and it is a hard rule: typing in the
    textarea ALWAYS promotes the source to `Type my own`. Without it an
    instructor types a rubric while the source reads "Generate", sees their
    text on screen, grades a whole column, and none of it is ever sent - with
    every gate green.
40. **AC 15 as written destroys typed text with no undo.** When switching to
    a `live`/`export` source would overwrite a non-empty manual rubric, the
    resolved text replaces it AND a `Restore my own rubric text` link-button
    renders until dismissed or used. It renders only on a real collision, so
    it costs zero clicks in the normal case.
41. **The "one role=status region" instruction given to the UX pass was
    wrong.** This page already has eight (`RepoGradesStatusBanners.tsx:94,
    109, 121, 133, 140, 147`; `index.tsx:762, 786`). The real invariant is
    ONE region for ACTION OUTCOMES (`index.tsx:785-789`, fed by
    `setPostSummary`). This feature adds no new live region and routes its
    single announcement channel through an `onAnnounce` prop wired to
    `setPostSummary`, matching `LinkUsernamesPanel` and `RepoGradesLogPanel`.
42. **The control is a plain `<select>` with native `<optgroup>`, not MUI.**
    `CourseItemsView.tsx:801-819` is MUI, but no file in
    `src/app/components/repo-grades/` imports MUI - that folder uses plain
    `<select>`/`<textarea>` inside `page.module.css`'s `.field`. Match the
    surrounding file. `<optgroup>` costs no clicks and is the only thing that
    makes a bare rubric title read as "this one is live in Canvas".
43. **Placement:** between the instructions textarea
    (`RepoGradesControls.tsx:265`) and the rubric textarea (`:266-274`), as
    its own `styles.field`. The control must sit adjacent to the box whose
    editability it governs.
44. **AC 12's per-column ambiguity is solved in the GRID, not the picker.**
    `ColumnHeaderControls` (`RepoGradesGrid.tsx`) gains one `<span>` reusing
    `styles.postReason`, under the assignment select, rendering for EVERY
    source: `Rubric: {title} (from export)` / `Rubric: this assignment's own,
    read when you grade` / `Rubric: no assignment mapped - one will be
    generated`. It reads AC 10's cache and must never fetch on render. This
    is also where AC 26's dropped-breakdown consequence is stated - BEFORE
    the irreversible post, not only in the log afterwards.
45. **Availability trade, taken deliberately:** while a rubric is mid-resolve,
    or while the cache's `resolvedForCourseId !== courseId`, every column's
    Grade button is disabled with the reason shown. This makes "graded against
    the previous course's rubric" structurally impossible rather than merely
    unlikely, and costs nothing in the steady state.
46. **AC 19's persistence is ONE key, not two.**
    `ta-repo-grades-rubric-source`, shaped `Record<courseId, string>` exactly
    like `FOLDER_KEY`, carrying the source AND the chosen rubric's identity in
    a single value. Two separate keys can desync into precisely the
    wrong-rubric failure this feature exists to prevent.
47. **Export rubric identity is its title**, with duplicates disambiguated by
    occurrence index. `CartridgeRubric` has no id at all
    (`cartridge-import-shared.ts:103-106`) and AC 19 never said what its
    identity was. A re-uploaded export whose rubric titles changed therefore
    degrades per AC 21, which is the honest outcome.

## R9b - Amendments from the architect pass (these OVERRIDE the items they name)

48. **AC item 7 as written does not typecheck.** `listRubrics` returns only
    `{id, title, source}` - no criteria. Criteria come from a second call,
    `getRubric`, whose `RubricDetail` is camelCase, while `formatRubric`
    (`src/lib/canvas/metadata.ts:52`) takes Canvas's RAW snake_case shape.
    Corrected rule: `formatRubric` owns the `assignment` source ONLY, where it
    already runs server-side inside `fetchCanvasMetaAction`. `RubricDetail` is
    structurally close to `CartridgeRubric`, so item 8's "a NEW pure function
    for export" becomes ONE renderer with two callers (live-picked and
    export), taking a structural input type that imports neither concrete
    type.
49. **No new server actions.** `listRubricsAction`
    (`src/app/actions/canvas-files-bulk.ts:228`), `getRubricAction` (`:275`)
    and `fetchCanvasMetaAction` (`src/app/actions/grading.ts:79`) all already
    exist, and `course.institution` is the acronym they take.
50. **THE SEAM THAT WOULD HAVE SHIPPED THIS HALF-DEAD.** The bulk path
    receives only a folder string (`RepoGradesGrid.tsx:98`) and
    `useRepoGradesGradingActions` holds no `columns` array - so it CANNOT
    reach `column.assignmentId`. Additionally `useRepoGradesBulkGrade` takes
    `rubric` as a render-time hook parameter (`:136`). Both must change:
    the columns array is threaded in, and `runBulkGrade` becomes
    `(plan, rubric)`. Without both, the picker works for a single cell and
    silently does nothing for "Grade all" - with every gate green. This is
    exactly the reachability failure mode this project has hit before.
    `establishSharedRubric`'s own signature is untouched, so
    `useRepoGradesBulkGrade.test.ts` stays green with no edits.
51. **The rubric textarea must become a DERIVED value.** Items 14 and 20
    conflict while it stays bound to `uiState.rubric`: `index.tsx:101-103`
    would persist the resolved text over the instructor's manual text,
    destroying it silently.
52. **Account-level rubrics can be listed but not readable.**
    `canvas-modules/types.ts:214-218` records that `getRubric` hits
    `/courses/:id/rubrics/:id`, which does not resolve an account rubric's
    id. Item 24 requires account rubrics in the picker and item 21 does not
    cover "listed but unreadable". Required degradation: the option stays
    listed, selecting it surfaces the read failure in the action-outcome
    region, and the effective rubric falls back to `""` (generated) with the
    reason logged - never a silent empty rubric.
53. **File-size budget is binding.** `index.tsx` is 851 lines: the
    implementation brief caps what it may gain (~90 lines of headroom).
    `repoGrades.wiring.test.ts` is 894 and must NOT receive the new guards -
    they go in a new `repoGradesRubricPicker.wiring.test.ts` with its own
    copied and canaried helpers, the precedent being
    `repoGradesSliceA.guards.test.ts:58-65`. `src/app/actions/grading.ts` is
    908; nothing is added there.
54. **Module decomposition** (all pure unless noted):
    `repoGradesRubricText.ts` (the one renderer, item 48),
    `repoGradesRubricSource.ts` (option assembly, ordering, value
    namespacing, stale degradation, empty-state reasons),
    `repoGradesRubricCache.ts` (`repoGradeRubricCacheKey(courseId,
    assignmentId)` plus read/write, extracted so the cross-column-leak bug is
    unit-testable), and the client hook `useRepoGradesRubricSource.ts` owning
    the live load, the restore, the `useRef<Map>` cache, and the ONE shared
    `resolveRubricForColumn(column)` both grading paths call (item 16).
55. **State lives in a per-course localStorage slice** shaped like
    `FOLDER_KEY` (`repoGradesUiState.ts:373-413`), NOT as a new field on
    `RepoGradesUiState` - adding one there breaks six whole-object `toEqual`
    assertions at `repoGradesUiState.test.ts:64-173` and contradicts item 19
    anyway. Cache reset rides the render-phase compare-and-adjust idiom
    (`useRepoGradesGradingActions.ts:147-151`).
56. **The single highest-value test:** round-trip the new renderer's output
    through the real `extractRubricCriteria` (`src/lib/grade/rubric.ts:10`),
    using `formatRubric`'s output as the canary that proves the assertion can
    fail.
57. **Pre-existing bug in a line this work edits, flagged not silently
    fixed:** `useRepoGradesGradingActions.ts:182` calls `gradeRepoAction` with
    six arguments, omitting `useReadmeInstructions` - so the README checkbox
    is honoured by "Grade all" and silently ignored by the per-cell "Grade".
    Fixing it is a one-argument change in a line this feature already
    rewrites; do it, and record it as a separate fact in the shipped entry
    rather than folding it into the picker's own claims.

## R9c - Amendments from the reuse survey (these OVERRIDE the items they name)

58. **This is a PORT AND GENERALIZE, not a build.** Roughly 70% already
    ships on another surface: `useLmsAssignmentPull.ts` +
    `LmsAssignmentPullSection.tsx` + `githubGradingUiState.ts` already have an
    export-rubric picker, a live/export duality, the
    `assignmentId -> repoGradeAssignmentUrl -> fetchCanvasMetaAction().rubricText`
    path, the "an export associates no rubric with an assignment" honesty
    prose, and per-control persistence. Read all three before writing
    anything.
59. **Item 8's "NEW pure function" already exists.** `cartridgeRubricToText`
    (`useLmsAssignmentPull.ts:54`) is module-private, untested, and already
    structurally compatible with BOTH `CartridgeRubric` and `RubricDetail`.
    Extract it, export it, widen its parameter type, and have both surfaces
    import the one copy. Do not write a second renderer.
60. **Item 7's renderer choice is confirmed wrong by a second independent
    pass** (see item 48). `formatRubric` reads snake_case only
    (`src/lib/canvas/metadata.ts:52,58`); `RubricDetail` from
    `getRubricAction` is camelCase. Forcing one through the other produces a
    SILENTLY wrong rubric in which every criterion's detail collapses to its
    own name. `live` and `export` share the one camelCase renderer from item
    59; `formatRubric` stays confined to the `assignment` source, server-side.
61. **Two existing renderers are traps - never reuse either.**
    `serializeRubric` (`submission-archive-sniff.ts:40`) indents every
    criterion line and omits the colon, so `extractRubricCriteria` extracts
    ZERO criteria from its output - precisely the "collapses to one number"
    failure item 8 exists to prevent. The inline renderer at
    `useCourseImportActions.ts:494-502` emits `(5)` with no `pts` unit, so
    every criterion parses back with `points: null`. Both must be named in
    the implementation brief so nobody reaches for them.
62. **Canonical precedent for the live-or-export duality is
    `repoGradesAssignmentSources.ts`**, already on this page: it solved the
    value-namespacing collision (the `export:` prefix plus a non-trusting
    parser), is pure and node-env tested, and encodes its honesty rule as a
    FIELD rather than a re-derived condition. Explicitly NOT
    `useLmsAssignmentPull`, whose duality is a two-mode UI toggle that
    conflicts with the one-select requirement in item 2.
63. **Items the AC over-specifies because they are ALREADY TRUE** - assert
    them, do not build them: item 5 (`github-repos.ts:680` already generates
    on blank), item 24 (already fixed and exported as
    `interpretRubricsResult`), item 26 (already the shipped behaviour at
    `canvas/grades.ts:60-89`), item 28 (no schema change needed; both
    `detail` builders already exist), item 30 (the guard covers two files,
    neither in repo-grades).
64. **A real defect item 28 must now fix.** Both `detail` builders gate their
    `Rubric used:` line on the rubric field being BLANK
    (`useRepoGradesGradingActions.ts:235`, `useRepoGradesBulkGrade.ts:204`).
    With a picked rubric the field is non-blank, so the log would fall silent
    about the rubric at exactly the moment it finally has something worth
    recording. The gate becomes source-aware: log the rubric's SOURCE and
    IDENTITY for every picked source, and keep the existing full-text line
    only for `generate`.

## R9d - Amendments from the data-engineer pass (these OVERRIDE the items they name)

65. **Item 26's conclusion is right but its CAUSAL STORY IS WRONG, and the
    difference matters.** `rubricAreas` are not dropped at post time because
    criterion names fail to match - they are never posted from this page AT
    ALL today, for any source. `resolvePostScore` sets `rescaled: true` for
    every fraction with no `possible === pointsPossible` short-circuit
    (`repoGradePostScore.ts:81-83`), and `gradeRepoAction` never passes
    `pointsPossible` (`github-repos.ts:687`), so every fresh grade is
    fraction-shaped and the breakdown is suppressed by the entry-350a
    rescaling rule before name matching is ever reached. The log must state
    the REAL reason. Do not "fix" this as part of the picker.
66. **`listRubrics` returns titles only - confirmed structurally.**
    `CanvasRubric` is `{id, title, source}`
    (`src/lib/canvas-modules/types.ts:211-219`) and `mapRawRubrics`
    (`rubrics.ts:7-11`) types the raw row as `{id?, title?}` and discards the
    rest. Criteria require a second call, `getRubricAction`
    (`canvas-files-bulk.ts:275-286`).
67. **Three constraints kill the naive live-rubric plan** (this is the third
    independent pass to reach the same place): `getRubric` is COURSE-scoped
    and 404s on account-level rubrics, which `listRubrics` merges into the
    same array (`rubrics.ts:182`); NO action anywhere returns a live rubric's
    TEXT; and `formatRubric` cannot be imported client-side at all
    (`metadata.ts:5` reaches `canvas-core`, which reads Canvas tokens from
    env). Worse, `formatRubric` reads snake_case `long_description` while
    `RubricDetail` is camelCase `longDescription` - structurally assignable,
    so it COMPILES, RUNS, and silently drops every long description. This is
    the single most dangerous trap in the feature.
68. **The zero-points hazard, which must have an explicit guard.** A
    cartridge criterion's `points` defaults to 0 on missing XML
    (`cartridge-import.ts:199`) and is a non-optional `number`, so "absent"
    and "genuinely zero" are indistinguishable. A rubric rendered as
    `(0 pts)` makes `deriveTotalScore` return `""`
    (`parsing.ts:188-190`), so every cell in the column grades to a blank,
    unpostable score. The renderer must detect an all-zero-points rubric and
    the picker must refuse it with a stated reason rather than emitting a
    rubric that silently blanks a whole column.
69. **Only a unit starting with `p` yields non-null points**
    (`rubric.ts:26`), and only non-null points make `buildSystemPrompt` pin
    the scale (`prompts.ts:36-42`). The renderer emits `pts`, never a bare
    number and never `%`.
70. **No database work.** Proven, not asserted - the export and both live
    paths are read-only against existing stores.
71. **Third independent confirmation of the per-cell defect** in item 57:
    `useRepoGradesGradingActions.ts:182` passes six of `gradeRepoAction`'s
    seven arguments, so `useReadmeInstructions` is `undefined` for every
    single-cell grade while the bulk path passes it
    (`useRepoGradesBulkGrade.ts:162`). Item 17's "both must survive together"
    is therefore ALREADY FALSE on the per-cell path. The positional seven-arg
    call is exactly the hazard that threading a new rubric argument will hit -
    prefer widening to an options object over adding an eighth positional.

## R9e - Amendments from the adversarial pass (these OVERRIDE the items they name)

72. **Item 35 IS FALSE for the `assignment` source, and this is the worst
    remaining defect.** The prologue's gate
    (`useRepoGradesBulkGrade.ts:236`) tests the PAGE-LEVEL rubric string, not
    the per-column resolved rubric. Under the `assignment` source the
    page-level string is a note or empty, so one of two things happens: the
    note text gets graded against, or the prologue fires and overrides the
    picked rubric for the entire run with a generated one. The gate must test
    the RESOLVED rubric for the column being graded. Nothing else in this
    document matters if this is wrong.
73. **Item 19 versus item 20 is a wrong-rubric bug, not a style nit.** A
    per-course SOURCE plus a global TEXT key
    (`repoGradesUiState.ts:46-52`, `:215`) means course B restores course A's
    rubric text with nothing on screen saying so. Item 20 is withdrawn: the
    manual rubric text becomes per-course too, sharing the item 46 key's
    per-course slice.
74. **Item 26's logging requirement is unimplementable without changing a
    shared library.** The criterion name match happens inside
    `postCanvasGrades` (`grades.ts:86-96`), which returns only
    `{posted, failures}` - the client cannot learn that a breakdown was
    dropped. Both my earlier artifacts also mis-described that code as an
    all-or-nothing fallback: it actually `continue`s past unmatched areas and
    posts a PARTIAL breakdown, which is the entry-350a defect class. Item 26
    is reduced to what is honestly knowable client-side: state the
    consequence in the column header (item 44) BEFORE the post, and do not
    claim a post-hoc log line the data cannot support.
75. **The embedded (non-LLM) provider is unaddressed and breaks two items.**
    `buildEmbeddedRubric` (`github-repos.ts:670`) silently caps at four
    criteria, and returns an ERROR when zero checks survive (`:672`) - which
    violates item 13's "a grading run must never be blocked by a rubric
    lookup failure". Worse, `:675` writes every non-blank rubric into the
    cross-course rubric bank via `rememberRubric`, so picking a Canvas or
    export rubric would silently pollute a global bank that other courses
    read. Required: the picker's resolved text must NOT be fed to
    `rememberRubric` (that call is for human-authored rubrics typed on this
    page), and the zero-check error must degrade to a generated rubric with a
    stated reason.
76. **The single most likely thing to be half-updated:** the prologue gate
    (`useRepoGradesBulkGrade.ts:236`) and the log's `Rubric used` gate
    (`:204`) are the SAME expression on the SAME variable. Item 64 changes
    one and item 72 changes the other. Updating either alone leaves the
    feature subtly wrong with every test green, so a guard must pin both
    together.
77. **Baseline gaps to close in entry 352 before hand-off:** it does not pin
    the `showRowDependentFields` gate, the per-cell path's missing seventh
    argument at `useRepoGradesGradingActions.ts:182` (which item 17 depends
    on), or the `detail` string's join structure. Add all three.
78. **Numbering:** this document's items run 32, 35-38, 33, 34 because R10
    was inserted before R11. The numbers are stable references now and are
    deliberately NOT renumbered; read them as labels, not as an ordering.

## R9f - Decisions taken during implementation

79. **Item 75's `rememberRubric` concern is DOWNGRADED after reading the
    code, not silently dropped.** The adversarial pass framed feeding a
    picked rubric to `rememberRubric`
    (`src/app/actions/github-repos.ts:675`) as polluting a cross-course
    bank. Reading `src/lib/research/rubric-bank.ts:57-79`: the bank exists
    to collect HUMAN-AUTHORED rubrics for the embedded engine, it upserts by
    content fingerprint with `ignoreDuplicates: true` (so re-banking is
    idempotent), and it requires 40+ characters. A rubric the instructor
    authored in Canvas or shipped in their own course export is exactly the
    kind of rubric the bank is for - arguably better than the typed text it
    already accepts. Decision: leave it. The alternative was widening
    `gradeRepoAction`'s signature across five call sites, two of them in the
    workflow registry, for a risk that reading the code does not support.
    Recorded here so a future reader knows this was considered and decided,
    not missed.
80. **Item 45's disable-while-resolving must be driven by the hook's real
    `resolving` flag, never inferred in the component.** The first
    implementation inferred it from "read-only and the text is empty", which
    lies for a live rubric that legitimately resolves to EMPTY - a Canvas
    rubric with no criteria, or a lookup that degraded to `""` per item 13 -
    leaving the box reading "Resolving this rubric..." forever. The
    heuristic is removed.
81. **The export half shipped dead in the first pass and was caught by
    tracing, not by tests.** `index.tsx` hardcoded `exportRubrics: []`
    because `useRepoGradesData.ts` held the export content internally
    (`:461`) and never returned it - so the `export` source, which is half
    of the original request, had no options to offer while every gate stayed
    green. This is the third time this project has hit that failure class.
    The standing lesson: for any new capability, trace from the CONTROL to
    the CODE before calling it done. A green suite is not evidence of
    reachability.

## R10 - Interaction with the shared-rubric prologue (added after baselining)

35. The bulk path ALREADY has a one-rubric-per-run prologue: when the rubric
    field is blank, `establishSharedRubric`
    (`useRepoGradesBulkGrade.ts:99-115`, called at `:236-248`) grades targets
    one at a time until one succeeds and then reuses that call's returned
    `result.rubric` for the rest of the run. A picked rubric is non-blank, so
    the prologue is SKIPPED entirely - which is the point: the run grades
    against a real, instructor-owned rubric instead of a model-invented one,
    and does so without spending the prologue's sequential setup grade.
36. That also closes an open defect recorded under entry 350: a retry of a
    partial run generates a SECOND rubric, because the established one is
    persisted nowhere the retry can reach. A picked rubric is persisted (R5),
    so a retry reuses the identical text. This must be stated in the shipped
    entry as a real consequence, not claimed as a separate fix.
37. The per-cell Grade path has NO prologue - each blank-field cell grade
    invents its own rubric with its own point total. A picked rubric fixes
    that path too, and the two paths must resolve through one shared resolver
    (R4 item 16) so they can never disagree about which rubric a column uses.
38. When the source is `generate`, both paths must behave exactly as
    baselined in `docs/REGRESSION.md` entry 351 - prologue included. This
    feature adds a source; it does not re-plumb the generated case.

## R11 - Verification

33. Vitest here is node-env and collects only `src/**/*.test.ts` - no
    component is ever rendered. Every decision that matters for correctness
    (source resolution, export-rubric-to-text rendering, persistence parsing,
    stale-id degradation, option assembly and labelling) therefore lives in
    pure modules with real unit tests; the wiring guarantees (the select is
    read by the grade call; the resolve happens on click, never on render) are
    proven by source-reading guards in `repoGrades.wiring.test.ts`, the idiom
    that file already uses, each paired with a canary proving the guard can
    fail.
34. `docs/REGRESSION.md` gains this feature's ACs after it lands, and the
    existing Repo Grades entries must still pass unchanged.
