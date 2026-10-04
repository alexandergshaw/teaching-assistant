# Repo Grades: sticky working-header + search + grade-set typeahead + auto-filter - scope & AC

Architecture / UX / acceptance-criteria recon for FIVE owner requests on the
Repo Grades view, scoped together because they share one row model, one controls
region, and one sticky stack. This document decides SHAPE and states checkable
criteria; it writes no production or test code.

Owner requests, verbatim:
1. "a search field that allows me to filter the repo table by name/student/etc"
2. "a sticky header that goes with me all the way down the scroll on the repo
   table" - REFINED to: "the new sticky header should contain all controls i
   might need while viewing the grading table or anything else further down."
3. "i should also have a typeahead control at the top of the repo [grades view]
   that controls which repos get graded."
4. "if i am only grading a subset of students on the repo page, the table should
   auto filter down to only those rows."

(Five requests, four features: #2's refinement folds #1 and #3 into the sticky
region as its organizing frame; #4 couples #3's selection to the display.)

**The distinctions that govern the whole document - do not conflate:**
- **Feature 1 (search) is DISPLAY-ONLY AT THE BODY-ROW RENDER LAYER.** It
  hides/shows RENDERED BODY ROWS only; it MUST NOT feed any count, label,
  Post/Grade-disabled state, or plan builder. Never changes which repos a
  Grade/Post run touches - the posture the view already takes for folder scoping
  (index.tsx:391-406; AC U1.3b). This is stricter than it reads: the grid's
  column header AND the run bar INDEPENDENTLY recompute the plan builders off
  their `rows` prop (RepoGradesGrid.tsx:318-325,:349-350;
  RepoGradesRunBar.tsx:59-66,:106), so the `rows` they receive for those plan
  SURFACES must be the FOLDER-SCOPED + selection set (**planRows**), NOT the
  search-filtered set (**bodyRows**). If the search-filtered set reaches them,
  typing a query silently shrinks the "Grade N / Post N" count and can DISABLE
  the Post button (RepoGradesRunBar.tsx:106) while postable rows remain. See the
  bodyRows-vs-planRows split in section 3.5 and AC-F1-3 / F4-2 / F4-3.
- **Feature 3 (typeahead) is RUN-SCOPING.** Changes the grade/post SET - which
  repos are included when Grade/Post fires. That set already exists as
  `selected: Set<string>` (index.tsx:226) and already governs posting
  (`scopeRepoGradeRowsToSelection`, repoGradesPosting.ts:90-96). The typeahead
  DRIVES THAT SAME SET; it is not a parallel store.
- **Feature 4 (auto-filter) is a DISPLAY consequence of the grade set.** When
  `selected` is a non-empty strict subset of the loaded rows, the table auto-
  narrows to those rows. It changes DISPLAY, not the grade set; shown==run is
  preserved on the SELECTION axis (hidden rows are exactly the non-selected
  ones) but NOT on the SEARCH axis (search is display-only and may hide a
  selected/graded row - see AC-F4-3).
- **Feature 2 (sticky working header) is the FRAME the others plug into.** One
  sticky region holds the compact working controls (search, typeahead,
  Grade/Post run controls) plus the table's column header, all traveling
  together - not four separate sticky elements fighting for the top offset.

No prior version of this doc exists, so there is no disposition table to
re-derive.

---

## 0. Measured facts (every quantity names its command)

Line counts via `@(Get-Content <file>).Count` in PowerShell on 2026-10-04 (the
mandated instrument; `Measure-Object -Line` disagrees here and is banned -
`docs/loop/this-repo.md` section 3). Repo-wide ceiling **1000 lines**
(`src/file-size-ceiling.structure.test.ts`, `LIMIT = 1000` at `:41`).

| File | Lines | Ceiling headroom |
|---|---|---|
| `src/app/components/repo-grades/index.tsx` | **960** | **40** - the binding constraint of this whole build |
| `src/app/components/repo-grades/RepoGradesControls.tsx` | 681 | 319 |
| `src/app/components/repo-grades/RepoGradesGrid.tsx` | 641 | 359 |
| `src/app/components/repo-grades/repo-grades.module.css` | 895 | 105 |
| `src/app/components/repo-grades/RepoGradesRunBar.tsx` | 115 | 885 |
| `src/app/components/repo-grades/repoGradesRows.ts` | 520 | 480 |
| `src/app/components/repo-grades/repoGradesPosting.ts` | 483 | 517 |

**index.tsx has 40 lines of headroom, and feature 2's refinement forces a JSX
restructure of index.tsx (relocating the run bar and controls into one sticky
container). This is the single most likely way this build breaks the ceiling.**
The architecture mitigation (section 4.2) is firm, not optional: extract the
sticky region into a NEW `RepoGradesStickyHeader.tsx` component so index.tsx
grows by a handful of lines, not by the header's whole layout. Re-measure
index.tsx with `@(Get-Content).Count` after every sub-wave; if a sub-wave would
cross 1000, extract an existing block FIRST, named in the plan
(`modulesview-at-ceiling`: estimates here run low).

Structural canaries a new file / key / class trips (all measured):
- **R-2 frozen-roots canary**, `repoGradesFeedbackAndFiles.wiring.test.ts:304-353`:
  freezes **35** non-test, non-`.d.ts` `.ts`/`.tsx` basenames in the
  repo-grades directory, as an exact set AND in the `it(...)` title ("exactly
  the 35 frozen basenames", `:348`). Any new leaf reddens it; the list AND the
  "35" must both update in the same change. The SAME test (R-1/R-3/R-4,
  `:356-367`) walks the runtime import graph and fails if any repo-grades file
  reaches a server-only leaf - every new leaf must import **browser-safe
  modules only**.
- **Storage-key exact-set canary**, `repoGradesStorageKeys.structure.test.ts:19-43`:
  `FROZEN_KEYS` is exactly **18** `ta-repo-grades-*` keys. Feature 1 adds one
  (18 -> 19); the `it(...)` title at `:41` ("the frozen 18") is NOT asserted, so
  bump that string to "19" in the same change for honesty - it will not redden on
  its own (AC-F1-4). Feature 3's grade set reuses `ta-repo-grades-selected` (no
  new key). Feature 4's "show all" override is a possible key (fork F4-b).
- **CSS-orphan ratchet**, `courses/page-module-css-orphan-classes.test.ts:36-41`:
  pins the repo-wide TOTAL orphan count (118 as of 2026-10-04,
  `docs/css-orphans.md:19`) and fails only when it RISES. Every new class in
  `repo-grades.module.css` must be referenced via `styles.<name>` dot-notation
  in a file importing that sheet, or it counts as an orphan and the ratchet
  rises.
- No component renders under vitest (`docs/loop/this-repo.md` section 2,6);
  every visual / scroll / focus / keyboard criterion is a reading claim or an
  OWNER BROWSER CHECK. Multi-file gate runs use `npm run test:paths ...`.

---

## 1. Reuse survey (symbol, file:line, what it gives us)

Opened directly; every citation verified.

| Symbol | file:line | What it gives this build |
|---|---|---|
| `selected: Set<string>` + `toggleSelected` | index.tsx:226, :283-289 | THE grade/post set. Repo full names, persisted via `persistSelectedRepoIds`. Feature 3 drives it; feature 4 reads it to decide auto-filter; feature 1 never touches it. |
| `scopeRepoGradeRowsToSelection(rows, selected)` | repoGradesPosting.ts:90-96 | Empty set = all rows, non-empty = only selected. The one "selection governs posting" filter, reused by the run bar + column post plan. |
| `buildBulkGradePlan({rows,folder,selected,selectionOnly})` | repoGradesBulkGrade.ts:74-131 | Grade-run targets. **Honours `selected` ONLY when `selectionOnly` is true** (:81) - the feature-3 asymmetry (fork F3-c). |
| `repoGradePostCandidateRows` / `buildRepoGradePostPlan` | repoGradesPosting.ts:284-303, :315-390 | Post plan + count; both the count and the real payload call these, so shown==run on the post path (AC5 item 28). |
| `persistSelectedRepoIds` / `loadSelectedRepoIds` | repoGradesUiState.ts:267-288 | `ta-repo-grades-selected` already persists the grade set, filtered to valid ids on restore. Features 3/4 need no new key for the set. |
| `displayedRows` / `displayedColumns` | index.tsx:399-418 | The existing folder-scoped DISPLAY stage - the precedent feature 1/4 extend. Already DISPLAY-ONLY (AC U1.3b); grading/posting read `sortedRows`/`selected`, not this. |
| `folderEmptyStateMessage` | index.tsx:415-418 | The precedent for a filter-specific empty state (feature 1/4). |
| `RepoGradesUiState` + load/persist | repoGradesUiState.ts:117-257 | Where feature 1's query belongs: one field, persisted, ~1 line of index.tsx growth. |
| `RepoGradeRow` / `RepoGradeColumn` | repoGradesRows.ts:103-128 | Row model feature 1 searches, feature 3 lists, feature 4 filters. Enumerated in section 3.1. |
| `deriveRepoGradeStudentName` | repoGradesRows.ts:443-457, repoGradeStudentName.ts | SAME first/last derivation the grid cells (RepoGradesGrid.tsx:543,584) and sort use - reuse so search matches the eye. |
| `.gridWrap` / `.grid thead th` | repo-grades.module.css:21-25, :50-57 | Feature 2's subject. Sticky rule exists; `.gridWrap { overflow-x: auto }` is the bug (section 2). |
| `.runBar` + `RepoGradesRunBar.tsx` | repo-grades.module.css:871-896, RepoGradesRunBar.tsx | The W3 sticky run bar (Grade/Post + folder context). Feature 2 RELOCATES it into the one sticky header rather than leaving it a separate sticky strip. |
| TasksGrid `.scrollRegion` | tasks/TasksGrid.module.css:147-164 (`max-height` + `overflow:auto`), header comment :10-14 | The in-repo precedent: a bounded-height scroll box with sticky `thead` inside. Its `calc(100vh - var(--topbar-height,58px) - var(--in-session-banner-height,0px) - 300px)` (:162) is the idiom feature 2 follows for a runtime CSS-var offset. |
| `Typeahead` | `../ui/Typeahead` (RepoGradesControls.tsx:44,363) | Existing SINGLE-select combobox. Multi-select needed for feature 3 - see do-not-reuse. |
| `styles.adaptRow` / `PICKER_FIELD_STYLE` | RepoGradesControls.tsx:301-302,360 | House control-row flex pattern. |

### Do-not-reuse, with justification

- **Do not extend the `orgPrefix` "Repo name filter" for feature 1**
  (RepoGradesControls.tsx:387-405, state index.tsx:737-738). It is not a
  client-side filter: every keystroke re-runs the GitHub org scan
  (`useRepoGradesData(uiState.courseId, uiState.orgPrefix)`, index.tsx:154;
  scanKey embeds orgPrefix) and matches a repo-NAME prefix only. Student name is
  not known at scan time. Feature 1 is a NEW, separate, client-side substring
  box.
- **Do not reuse single-value `Typeahead` unchanged for feature 3.** It is
  single-select; "which repos" is plural. The grade-set control is a multi-add
  combobox (section 3.3); extend `Typeahead` to a multi variant or use MUI
  Autocomplete `multiple` - a plan-level leaf choice, not this control as-is.
- **Do not leave the run bar as a second sticky strip.** Feature 2's refinement
  requires one sticky container; the run bar moves into it (section 2.2).

---

## 2. Feature 2 - the sticky working header (the organizing frame)

### 2.1 Root-cause diagnosis: why the existing sticky does NOT follow the scroll

The rule is correct in isolation: `.grid thead th { position: sticky; top: 0;
background: var(--field-background); z-index: 1 }` (repo-grades.module.css:50-57).

**The offending line is `.gridWrap { overflow-x: auto }` at
`repo-grades.module.css:21-25` (specifically `:22`).**

Mechanism: a sticky element sticks relative to its nearest scroll-container
ancestor. `overflow-x: auto` makes `.gridWrap` a scroll container - and by the
CSS Overflow rule that `visible` on the other axis computes to `auto` when one
axis is `auto`/`scroll`, `.gridWrap` becomes a scroll container on BOTH axes. So
the thead's sticky context is `.gridWrap`, not the viewport. But `.gridWrap` has
**no bounded height**: it grows to the full table height and never scrolls
internally - the page (window) scrolls. Relative to its own full-height
scrollport the thead is always at offset 0 and never needs to stick, so the
entire `.gridWrap` (header included) translates off-screen with the page.

Ancestors checked, none the cause:
- `.tabContainer { overflow: clip }` (page.module.css:14-27) - `clip` does NOT
  establish a scroll container (its own comment :24-26 says so, for the sticky
  tabs); it does not capture the thead.
- `.card` (page.module.css:29-35) - no overflow; not a scroll container.
- Grid renders inside `<TabShell>`/`.card` inside `.tabContainer`
  (TabShell.tsx:26; index.tsx:714-722). The only scroll container between thead
  and viewport is `.gridWrap`.

This is the exact class TasksGrid documents (TasksGrid.module.css:10-14): "a
page-level sticky offset does not reliably engage for the table's OWN header,
which must grow with an unbounded row count." Its fix is a bounded-height
`overflow: auto` box with the sticky header inside.

### 2.2 SHAPE decision: ONE bounded scroll shell, two sticky tiers inside it

This is the load-bearing shape every later wave is built against. State it
plainly, because the CSS forbids the obvious alternatives:

> **A single bounded scroll shell `.stickyShell { max-height: <vh-calc>;
> overflow: auto }` contains, in order: (1) `.stickyWorkingHeader`
> (`position: sticky; top: 0; left: 0; z-index: 3`) holding the compact working
> controls; and (2) the `<table>` whose `thead th` is
> `position: sticky; top: var(--rg-working-header-h); z-index: 2`. Both sticky
> tiers live in the SAME scroll context, so they stack and travel together, and
> the thead's offset explicitly references the header height - nothing fights
> for `top: 0`.**

Why this and not the alternatives - the CSS is not negotiable here:
- **You cannot make the controls page-sticky and the thead viewport-sticky-
  under-them while the table scrolls horizontally.** The thead always sticks to
  its nearest scroll container; the table needs `overflow-x: auto` for its wide
  column set (`min-width: 190px` per column header, :228); `overflow-x: auto`
  re-promotes `overflow-y` to `auto`, so the thead's vertical sticky resolves
  against that box, not the page. The only way the thead and the controls share
  one vertical sticky context is to put BOTH inside ONE bounded scroll box.
- **The control header must be `left: 0`-pinned** because it lives inside a
  box that also scrolls horizontally (for the wide table); without `left: 0` it
  would drift sideways when the owner scrolls right to reach far columns. The
  thead already scrolls horizontally WITH the columns (correct - the labels must
  track their columns), so only the control header needs the left pin.
- The thead background stays opaque (`var(--field-background)`, :53) so rows do
  not show through (TasksGrid constraint (3), :15-16). The control header needs
  its own opaque background for the same reason.

The `max-height` follows TasksGrid's runtime-var idiom
(`calc(100vh - var(--topbar-height,58px) - var(--in-session-banner-height,0px) - <N>)`,
:162) so the shell leaves room for the app chrome. Exact `<N>` is a plan detail;
the AC pins the STRUCTURE (bounded height + overflow + the two sticky tiers +
offset reference), not the literal.

### 2.3 The thead top-offset = control-header height (reliability concern)

The thead's `top` must equal the control header's RENDERED height, which varies
as the search box / typeahead chips / run bar wrap. A fixed value is wrong when
content wraps. Recommended mechanism (consistent with TasksGrid's runtime CSS
vars): the sticky-header component sets a custom property
`--rg-working-header-h` from a `ResizeObserver` on the header element, and the
thead rule reads `top: var(--rg-working-header-h, <token fallback>)`. To bound
the above-fold cost, the control header is itself height-capped: a single
wrapping compact control row; if the chip set (feature 3/4) overflows, it gets
its OWN internal `max-height` + `overflow-y: auto` (page.module.css:1392-1393
precedent) rather than growing the sticky band. **This is a reliability
residual (R6): the offset correctness under wrap, and the above-fold height,
are observable only in a browser - route to the owner walk (AC-F2-4).**

### 2.4 Which controls are IN the sticky header vs stay in the scrolling body (FORK F2-b)

The refinement's tension - "all controls i might need" vs the paramount
scroll/cursor budget - resolves by pinning the WORKING controls (needed while
scrolling the table) and leaving the SETUP controls (needed once, before
grading) in the scrolling body.

Recommended membership (proceeding on this; owner confirms):
- **IN the sticky working header:** the free-text search box (feature 1); the
  grade-set typeahead + its selected chips (feature 3/4); the Grade/Post run
  controls with folder + mapped-assignment + rubric context (today's run bar,
  RepoGradesRunBar.tsx, relocated); and - as tier 2 - the table column header
  (thead), which already carries per-column assignment pickers, per-column
  Grade/Post, and sort.
- **STAYS in the scrolling body (setup, used once):** the course picker, the
  org-prefix repo-name filter + Refresh (a scan control), the folder chooser
  (arguably working, but it re-scopes the whole view and is a per-session pick -
  recommend body; see fork), and the entire "Grading settings" disclosure
  (instructions, rubric source, README toggle, code-scoring toggle -
  RepoGradesControls.tsx:498-677).

Cost if the membership is wrong: moving a control between the two regions is a
JSX move plus a line in the AC membership pin, not a redesign. The folder chooser
is the one genuine judgement call (it is used more than once if the owner hops
folders) - recommend body for v1 to keep the header compact, flag as part of
F2-b.

### 2.5 Interaction notes

- **Run bar only exists in the single-folder view** (index.tsx:772-781,
  `currentSelectedFolder !== ALL_FOLDERS`). In `ALL_FOLDERS` the sticky header
  still holds search + typeahead + thead; the run-bar tier is simply absent, and
  the thead (with its per-column Grade/Post) is the run surface. The
  `--rg-working-header-h` offset must be measured from whatever the header
  actually contains, which the ResizeObserver mechanism handles for free.
- **Narrow width (<=700px):** the existing media query un-sticks the thead
  (`position: static`, :511-513) and card-stacks rows. The new shell and control
  header must follow the same posture at that width - un-stick or cap so the
  sticky header never eats the narrow viewport (AC-F2-5). Reading claim; confirm
  in browser.
- **z-order:** control header 3 > thead 2 > body. (Raises the thead from its
  current 1 to 2; the run bar's old standalone z-index 2 is subsumed into the
  header's 3.)

---

## 3. Features 1, 3, 4 - the search + selection + auto-filter trio

### 3.1 Searchable fields (feature 1), enumerated from the real row model

Cited from `RepoGradeRow` (repoGradesRows.ts:103-128) and `RepoBindingSuggestion`
(repo-student-bindings.ts:47-90).

| Field | Source | In v1? |
|---|---|---|
| Repo full name | `row.repo` (:113) | **Yes** - "name" |
| Student display name | `row.binding.student` (:119; set repo-student-bindings.ts:267) | **Yes** - "student" |
| First name | `deriveRepoGradeStudentName(...).firstName` (:447; cell RepoGradesGrid.tsx:584) | **Yes** |
| Last name | `deriveRepoGradeStudentName(...).lastName` (:451-457; cell :586) | **Yes** |
| Binding-state label | `row.binding.state` (unbound/ambiguous/suggested/confirmed) | **Fork F1-b, recommend Yes** (type "unbound" to find repos needing attention) |
| Folder names | `row.folders` / `Object.keys(row.cells)` (:122-127) | **Fork F1-b, recommend No** (folders are the column axis; the folder chooser already scopes them) |
| GitHub username | NOT a first-class row field (inferred from the repo slug, repo-student-bindings.ts:23; stored `CourseStudentRepo.username` not threaded onto the row) | **Fork F1-b, recommend No**: searching `row.repo` already matches the handle substring |

### 3.2 Feature 1 - search box (DISPLAY-ONLY)

- Single case-insensitive substring box matching the v1 field set.
- **Pure leaf:** `rowMatchesQuery(row, q)` in new `repoGradesSearch.ts`; blank
  `q` matches all; uses `deriveRepoGradeStudentName` for name fields so search
  agrees with the cells.
- **Placement:** inside the sticky working header (section 2.4), as a compact
  field - adds to the header height budget, not a new page band.
- **Persistence:** `searchQuery: string` on `RepoGradesUiState`, new key
  `ta-repo-grades-search` (canary 18 -> 19). Threaded via the existing
  `setUiState((prev) => ({...prev, searchQuery}))` idiom (cheapest index.tsx
  growth).

### 3.3 Feature 3 - grade-set typeahead (RUN-SCOPING)

- **Reuse decision (critical):** the typeahead drives the existing
  `selected: Set<string>` (index.tsx:226) - the SAME set the per-row checkboxes
  toggle and `scopeRepoGradeRowsToSelection` reads. No second source of truth;
  the set is already persisted (`ta-repo-grades-selected`), so no new key.
  Because the run bar/column counts read that same `selected`, shown==run holds
  automatically across the typeahead, the checkboxes, and the run-bar counts.
- **Lists:** each row's repo full name with student display name as secondary
  text (both on `RepoGradeRow`), option set = the current `sortedRows`.
- **Pure leaf:** `toggleRepoInGradeSet(selected, repo): Set<string>` in new
  `repoGradesGradeSet.ts` - returns a new Set, never mutates - shared by the
  checkbox path and the typeahead so one tested reducer backs both.
- **Multi-select combobox** with removable chips for the selected set; a11y
  (reading claims): `role=combobox`, `aria-expanded`, `aria-autocomplete=list`,
  an owned `role=listbox`, and an accessible name on each chip's remove control.
  If MUI Autocomplete `multiple` is used, route key handlers through
  `slotProps.input` (the `htmlInput` trap, `seats.md` UX checker).
- Lives in the sticky working header (section 2.4).

### 3.4 Feature 3 grade-vs-post asymmetry (FORK F3-c)

Posting honours `selected` unconditionally (empty=all, non-empty=subset).
Grading honours it only when `bulkSelectionOnly` is true
(repoGradesBulkGrade.ts:81), default false (repoGradesUiState.ts:69,160). A
grade-set typeahead that drives `selected` would silently NOT control grading by
default. Recommended reading (proceeding, F3-c=X): **a non-empty `selected`
scopes BOTH grade and post** (empty = today's whole-column default), i.e. the
grade-scope expression becomes `selectionOnly: selected.size > 0 ||
bulkSelectionOnly` and the selection label flag becomes
`scopedToSelection: (selected.size > 0 || bulkSelectionOnly) && selected.size > 0`.
This makes grade and post symmetric and the typeahead immediately effective.

**Apply F3-c=X at EVERY grade-plan call site, not only the execution handler.**
Three sites today compute the grade plan or its selection label off
`bulkSelectionOnly` ALONE, and all must move to the expressions above in
lockstep, or the label and the run disagree:
- the grade execution handler (`useRepoGradesGradingActions.ts:784`, the `buildBulkGradePlan` call inside `handleGradeColumn` - NOT index.tsx, which only wires the button to the hook);
- the run bar's `buildBulkGradePlan` call (RepoGradesRunBar.tsx:66) and its
  `scopedToSelection` label flag (RepoGradesRunBar.tsx:70 -
  `bulkSelectionOnly && selected.size > 0`);
- the column header's `buildBulkGradePlan` call (RepoGradesGrid.tsx:350) and its
  `scopedToSelection` flag (RepoGradesGrid.tsx:352 - same bare expression).

If ONLY the handler is changed, then with the mandated "Show all rows" escape
(display un-narrowed, grade set kept) the grid/run bar show "Grade 40 / all"
while the click grades only the N selected - a label asserting "all" over a
subset run, the exact confirm-altering dishonesty F3-c=X must not cause. AC-F3-3
pins the expression at all four sites so the label and the run can never
disagree. Consequence to flag: `bulkSelectionOnly` ("only the checked rows")
becomes redundant when a non-empty set is present - the owner decides whether to
retire it (residual R3). This is the terminating fork F3-c in section 6.

### 3.5 Feature 4 - auto-filter the table to the grade subset (DISPLAY)

- **Rule (one coherent trigger, FORK F4-a, recommended):** when `selected` is a
  non-empty STRICT subset of the loaded (folder-scoped) rows, the table auto-
  narrows to show only the selected rows - regardless of how they were selected
  (typeahead OR per-row checkbox). Empty selection (today's grade-all default)
  OR a selection equal to all rows -> no filter, all rows shown. Preserve that.
- **Two row sets, not one - the load-bearing split (THE feature-1-vs-4 rule):**
  the search query and the auto-filter are DISPLAY narrowings of the RENDERED
  body rows; the grade/post RUN is scoped separately, by the plan builders off
  `selected`. These must be computed as TWO distinct sets with distinct
  consumers, or the search query leaks into the run counts (the round-2
  blocker - the grid and run bar recompute the plan builders off their `rows`
  prop, RepoGradesGrid.tsx:318-325,:349-350 and RepoGradesRunBar.tsx:59-66):
  - **bodyRows** = `visibleRepoRows(folderScoped, query, gradeSet)` - folder
    scoping, then the selection-subset narrow, then the query substring narrow,
    composed by INTERSECTION:
    `bodyRows = folderScoped(rows) -> (selection-subset ? only selected) -> (query ? only rowMatchesQuery)`.
    bodyRows is passed to the grid ONLY to decide which `<tbody>` rows render.
  - **planRows** = the FOLDER-SCOPED rows (NOT query-filtered), passed as the
    `rows` prop the grid's column header and the run bar hand to the plan
    builders; those builders apply the F3-c selection semantics internally
    (`scopeRepoGradeRowsToSelection` / `buildBulkGradePlan` with the F3-c
    `selectionOnly`), so every count, label, disabled gate, plan and the
    execution read FOLDER+SELECTION, never the query.
  A single pure selector `visibleRepoRows(rows, query, gradeSet)` returns
  bodyRows (folder scoping stays the existing upstream stage so the selector
  takes already-folder-scoped rows); planRows is just that folder-scoped stage
  WITHOUT the query/auto-filter narrow. Defining bodyRows as one selector stops
  the search and selection narrows fighting; keeping planRows = folder-scoped
  keeps search out of the run entirely. This means index.tsx hands the grid and
  run bar planRows for their plan surfaces (NOT today's `rows={displayedRows}` at
  index.tsx:775,:911) and bodyRows for the body render - two props, not one.
  AC-F4-1 oracles bodyRows; AC-F1-3 / F4-2 / F4-3 pin the split and sabotage
  feeding bodyRows to a plan surface.
- **Does auto-filter change WHAT GRADES? No.** It is display convenience; the
  grade set is still `selected`. On the SELECTION axis shown==run holds (hidden
  = non-selected = not graded). On the SEARCH axis it does NOT: search is
  display-only and can hide a selected (and therefore graded) row - the same
  display-only behaviour feature 1 and folder scoping already have. Because the
  run counts/labels/disabled gates read planRows (folder+selection), NOT the
  query, a search term NEVER shrinks the "Grade N / Post N" count and NEVER
  disables Post while postable rows remain in the folder+selection set (the
  round-2 face-2 trap, RepoGradesRunBar.tsx:106). The "N of M" counter and the
  clear/show-all affordance below are what keep the hidden-but-graded rows
  honest to the eye.
- **Reversibility / escape hatch (REQUIRED, not optional - a filter with no
  visible clear is a trap):** whenever the auto-filter is active, show a visible
  line "Showing N of M repos (filtered to your grade-set selection)" with TWO
  affordances: **Clear selection** (empties `selected` -> reverts to grade-all
  and shows all) and **Show all rows** (a DISPLAY override that reveals every
  row while KEEPING the grade set, with the selection still indicated so the
  owner knows a subset will still grade). Recommend the "Show all" override be
  EPHEMERAL state (not persisted), justified exactly as cellEdits are ephemeral
  (index.tsx:178-193: "a value surviving a reload would be surprising") - a view
  override tied to a transient selection is the same category. Persistence of
  the override is fork F4-b.
- **Pin it machine-checkably** via the counter/affordance helper (AC-F4-4) and
  the selector oracle (AC-F4-1).

### 3.6 index.tsx budget (trio)

Feature 1: query on `uiState`, one `.filter`/selector call, prop to the header
(~4-8 lines). Feature 3: reuses `selected`/`toggleSelected`, adds the typeahead
child + the F3-c one-expression grade-scope edit (~5-10). Feature 4: the
`visibleRepoRows` selector call replaces the current `displayedRows` filter
expression (net small), plus the counter/affordance (lives in the header
component, not index.tsx). Combined with the feature-2 JSX restructure, this is
the 1000-line risk - mitigated by extracting `RepoGradesStickyHeader.tsx`
(section 2.2 / 4.2).

---

## 4. Wave split and the combined budget

These touch the same files as the shipped repo-grader smoothing waves
(W1/W2/W3) and analysis-only W5. Sequence as this build's OWN waves, disjoint in
TIME from any other repo-grades code work (one agent outside its list reverts a
sibling - `no-git-stash-under-concurrency`).

### 4.1 Recommended split (shell first, then populate)

The feature-2 refinement makes the sticky SHELL the frame everything plugs into.
Land the shell first with today's controls, then populate it.

- **Wave A - the sticky shell + thead (structural root fix).** New
  `RepoGradesStickyHeader.tsx` container; move the run bar into it; `.gridWrap`
  becomes the bounded `.stickyShell` (max-height + overflow); thead gains the
  `top: var(--rg-working-header-h)` offset and z-index 2; the ResizeObserver
  sets the var. CSS-and-wiring only, no new search/selection logic. Independently
  verifiable: the owner can confirm "header sticks all the way down" with just
  the run bar + thead present. Touches `repo-grades.module.css`, index.tsx (JSX
  relocate), new `RepoGradesStickyHeader.tsx` (+1 R-2 root).
- **Wave B - feature 1 (search), populates the header.** `repoGradesSearch.ts`
  + test, `ta-repo-grades-search` key (canary 18 -> 19), the search box in the
  sticky header, the query stage in the display selector.
- **Wave C - features 3 + 4 (typeahead + auto-filter), populate the header.**
  `repoGradesGradeSet.ts` + test (`toggleRepoInGradeSet`), the bodyRows selector
  `visibleRepoRows` + its test, the multi-select typeahead + chips in the sticky
  header, the F3-c=X grade-scope edit at ALL grade-plan sites (handler, run bar
  :66/:70, grid :350/:352), the planRows-vs-bodyRows prop split so the search
  query stays out of the run counts (edits index.tsx, RepoGradesGrid.tsx,
  RepoGradesRunBar.tsx AND useRepoGradesGradingActions.ts:784 - the real grade
  execution site, the 4th F3-c=X site; plan surfaces take folder-scoped planRows,
  `<tbody>` takes bodyRows), the "N of M" counter + clear/show-all affordance. Features 3
  and 4 are one wave: feature 4 is the display consequence of feature 3's
  selection and shares the selector.

Why this split and not "sticky is fully independent": the sticky fix as a bare
thead fix WOULD be independent, but the refinement makes the sticky header
CONTAIN search + typeahead, so the shell must land first as the frame and B/C
populate it. A and B/C still share index.tsx and the R-2 roots list, so they run
serially, not concurrently.

### 4.2 The 1000-line mitigation (firm)

index.tsx is at 960. Extract the sticky region into `RepoGradesStickyHeader.tsx`
in Wave A so index.tsx grows by the child mount + props, not the header's
layout. Re-measure with `@(Get-Content).Count` after each wave; if a wave would
cross 1000, extract an existing block first (the status-banner props block or
the rubric-source prop fan-out are candidates), named in the plan.

### 4.3 Gate per sub-wave (the wave gate must include these)

PowerShell; multi-path form uses the wrapper:

```
npx tsc --noEmit
npm run lint      # pass = exit 0 and NO NEW warning in files this wave writes
npm run test:paths src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts src/app/components/courses/page-module-css-orphan-classes.test.ts src/app/components/repo-grades/repoGradesSearch.test.ts src/app/components/repo-grades/repoGradesGradeSet.test.ts src/app/components/repo-grades/repoGradesVisibleRows.test.ts
git status --short   # vs the wave's explicit file list; no .claude/worktrees copy edited
```

- R-2 roots canary: required on every sub-wave adding a file (A adds
  `RepoGradesStickyHeader.tsx`; B adds `repoGradesSearch.ts`; C adds
  `repoGradesGradeSet.ts` and the display-selector leaf + a possible
  `RepoGradesGradeSetTypeahead.tsx`). Each updates `FROZEN_REPO_GRADES_ROOTS`
  AND the "35" count in the same change (35 -> up to 40; up to 5 new non-test
  roots: RepoGradesStickyHeader, repoGradesSearch, repoGradesGradeSet,
  repoGradesVisibleRows, and the optional RepoGradesGradeSetTypeahead). Every new leaf must
  be browser-safe (R-1/R-3/R-4).
- Storage-key canary: required on Wave B (new key), and on Wave C if F4-b adds
  a "show all" key.
- CSS-orphan ratchet: required on A and C (new classes).
- 1000-line ceiling: re-measure index.tsx every wave.

---

## 5. Acceptance criteria (object, instrument, direction of failure)

Machine-checkable AC are source/structure pins and pure-function oracles
(nothing renders). Visual/scroll/keyboard AC are OWNER BROWSER CHECKS, labelled.

### Leverage claim

This is bug-fix + UX-ergonomics on an existing capability. Features 1, 2, 4 are
ergonomics (a display filter, a CSS sticky fix, a display auto-narrow) with no
categorical advantage over a chat - record that as the fired trigger. Feature
3's advantage is **click-cost / scroll-cost** (per `docs/loop/leverage.md`,
real but NOT categorical, and must be named as click-cost): on a large org the
owner today builds a grade subset only via per-row checkboxes down a long
scroll; a typeahead adds a repo to the grade set in a keystroke or two without
scrolling, and feature 4 then collapses the table to just those rows. **No
removal test is buildable here** - the advantage is clicks/scroll and no
component renders (`leverage.md` LIVE-LOOP/click-cost limit); record residual
R4, do not fabricate one. The checkable core is the MECHANISM pin (AC-F3-2: the
typeahead feeds the same `selected` the plan builders read).

### Feature 1 (search) - machine-checkable
- **AC-F1-1 (predicate pure):** OBJECT `rowMatchesQuery(row,q)`. INSTRUMENT
  frozen-literal oracle covering match on repo/student/first/last, blank query
  (all), non-match. FAIL any oracle row's boolean differs.
- **AC-F1-2 (names agree with cells):** OBJECT the first/last values searched vs
  rendered. INSTRUMENT wiring test that `repoGradesSearch.ts` calls
  `deriveRepoGradeStudentName`. FAIL a second hand-rolled split (N5 item 16).
- **AC-F1-3 (DISPLAY-ONLY AT THE BODY-ROW LAYER):** OBJECT the `rows` prop fed
  to the grid's column header and the run bar (which recompute
  `buildBulkGradePlan` / `buildRepoGradePostPlan` off it) vs the rows fed to the
  `<tbody>` render. INSTRUMENT wiring test that the plan-surface `rows` prop is
  planRows (folder-scoped, NOT query-filtered) and the query reaches ONLY the
  bodyRows render path; grading/posting still scope off `selected`. FAIL the
  query reaching any plan builder's input - the sabotage: feeding the
  search-filtered set (bodyRows / `visibleRepoRows` output) to the grid's or run
  bar's `rows` prop must RED this test.
- **AC-F1-4 (persistence):** OBJECT `ta-repo-grades-search`. INSTRUMENT
  storage-key canary `FROZEN_KEYS` = 19 including it, + a round-trip test. The
  `it(...)` TITLE at `repoGradesStorageKeys.structure.test.ts:41` hardcodes "the
  frozen 18" but asserts only the ARRAY, so it will NOT redden on its own - bump
  the title string to "19" in the SAME change as the array, for honesty. FAIL
  K1 red or round-trip loses the value.

### Feature 2 (sticky working header) - machine-checkable (CSS/source structure)
- **AC-F2-1 (bounded scroll shell):** OBJECT `.stickyShell`/`.gridWrap`.
  INSTRUMENT source test that it declares `max-height` AND `overflow`
  (auto/scroll) - bounded, not today's unbounded `overflow-x: auto` alone. FAIL
  the current buggy state (overflow-x:auto, no max-height).
- **AC-F2-2 (one container, two sticky tiers):** OBJECT the sticky header
  container and the thead. INSTRUMENT source test that `.stickyWorkingHeader`
  has `position: sticky; top: 0` and the thead has `position: sticky; top:
  var(--rg-working-header-h...)` - i.e. the thead offset REFERENCES the header
  height, not a bare `top: 0`. FAIL the thead's top is a literal 0 (would
  overlap the header) or the header is not sticky.
- **AC-F2-2b (control membership):** OBJECT the children of
  `RepoGradesStickyHeader.tsx`. INSTRUMENT wiring test (reading source) that the
  search box, the grade-set typeahead, and the run controls render INSIDE the
  sticky container, and that the course picker / org-prefix / "Grading settings"
  disclosure render OUTSIDE it (in the scrolling body). FAIL a working control
  left in the body, or a setup control pinned in the header (the fork-F2-b
  membership, once the owner confirms it).
- **AC-F2-3 (opaque + z-order):** OBJECT header/thead backgrounds and z-index.
  INSTRUMENT source pin: both have an opaque background token; z-index header 3
  > thead 2. FAIL transparent background or inverted z-order.
- **AC-F2-5 (narrow-width posture):** OBJECT the `@media (max-width:700px)` block
  (:506-614). INSTRUMENT source pin that the new shell/header un-stick or cap at
  that width consistent with the existing thead un-stick (:511-513). FAIL the
  sticky header can eat the narrow viewport. (Reading claim.)

### Feature 2 - owner browser check
- **AC-F2-4 (BROWSER):** with a long roster, the working header (search +
  typeahead + run controls + column header) stays visible and USABLE at the top
  while the rows scroll all the way down; the column header sits directly under
  the controls with no overlap and no hidden rows (the `--rg-working-header-h`
  offset is correct even as controls wrap); the horizontal scrollbar still
  reaches the far columns; the header does not eat an unreasonable share of the
  viewport; and all of this holds in BOTH light and dark themes and at narrow
  width. This is the load-bearing check and cannot be machine-verified here.

### Feature 3 (grade-set typeahead) - machine-checkable
- **AC-F3-1 (reducer pure):** OBJECT `toggleRepoInGradeSet(selected,repo)`.
  INSTRUMENT frozen oracle: add absent -> present; toggle present -> removed;
  input Set never mutated (frozen-copy assert). FAIL any row differs or input
  mutated.
- **AC-F3-2 (one source of truth - the reuse pin):** OBJECT the Set the
  typeahead writes vs the checkboxes write vs the plan builders read. INSTRUMENT
  wiring test that the typeahead handler and the checkbox both call the SAME
  reducer/`setSelected` + `persistSelectedRepoIds`, and the run bar receives
  that same `selected`. FAIL a second state var, a second key, or the run bar
  reading a different set (shown!=run).
- **AC-F3-3 (grade honours a non-empty set at EVERY site - F3-c=X):** OBJECT the
  `selectionOnly` expression AND the `scopedToSelection` label flag at ALL FOUR
  grade-plan sites: the execution handler (`useRepoGradesGradingActions.ts:784`,
  the buildBulkGradePlan inside handleGradeColumn - THE site that decides which
  repos actually grade), RepoGradesRunBar.tsx:66 + :70, and RepoGradesGrid.tsx:350
  + :352. INSTRUMENT
  wiring test that every site computes `selectionOnly: selected.size > 0 ||
  bulkSelectionOnly` (not bare `bulkSelectionOnly`) and `scopedToSelection`
  reflects the same, + a `buildBulkGradePlan` test that a non-empty set +
  `selectionOnly:true` targets exactly those repos. FAIL a non-empty grade set
  ignored by grading at the handler, OR any count/label site still reading bare
  `bulkSelectionOnly` (which would let the grid/run bar label "all" while the run
  grades only the selected subset under "Show all rows").
- **AC-F3-4 (none-selected preserves default):** OBJECT empty-`selected`
  grade/post. INSTRUMENT existing posting tests + `buildBulkGradePlan` empty-set
  test targeting the whole column. FAIL empty set stops grading/posting all.

### Feature 4 (auto-filter) - machine-checkable
- **AC-F4-1 (display selector pure):** OBJECT `visibleRepoRows(rows, query,
  gradeSet)` in a new leaf. INSTRUMENT frozen oracle covering: empty gradeSet ->
  all rows; non-empty strict subset -> only those rows; subset + query ->
  intersection; query matching none -> empty; gradeSet == all rows -> all rows
  (not a strict subset, no narrow). FAIL any oracle row differs. (Axes - query,
  gradeSet membership, subset-vs-equal - come from section 3.5, a different
  source than the generator.)
- **AC-F4-2 (one body derivation, planRows kept query-free):** OBJECT the
  bodyRows passed to the grid's `<tbody>` vs the planRows passed to its plan
  surfaces and the run bar. INSTRUMENT wiring test that index.tsx derives
  bodyRows through the single `visibleRepoRows(folderScoped, query, gradeSet)`
  selector (not two ad-hoc body filters) AND that the `rows` prop the grid/run
  bar hand to the plan builders is the folder-scoped set, NOT that query-filtered
  selector output. FAIL a second independent body-filter path (search and
  selection fighting), OR a plan surface fed the query-filtered bodyRows.
- **AC-F4-3 (shown==run on the SELECTION axis; display-only on the SEARCH
  axis):** OBJECT the grade/post run set (planRows + `selected`) vs the displayed
  bodyRows. INSTRUMENT wiring test that the auto-filter and the search read for
  DISPLAY only (they shape bodyRows) and do not alter `selected`, and that the
  plan builders at the grid, the run bar AND the execution handler read planRows
  (folder-scoped) + `selected`, never `visibleRepoRows`'s bodyRows output. FAIL
  auto-filter or search mutating the grade set, or any plan builder reading the
  search-filtered display set - the sabotage: swap a plan surface's `rows` to the
  bodyRows selector output and the test must RED.
- **AC-F4-4 (escape hatch present):** OBJECT the "N of M" + clear/show-all
  affordance. INSTRUMENT a pure helper returning the counter string + the two
  action labels, pinned by a frozen-literal test, + a wiring test that the
  affordance renders whenever the auto-filter is active. FAIL the filter can be
  active with no visible counter or no clear/show-all control (the trap).

### Feature 4 - owner browser check
- **AC-F4-5 (BROWSER):** selecting a subset (via typeahead or checkbox) collapses
  the table to those rows; the "Showing N of M" line and Clear/Show-all controls
  are visible; "Show all" reveals every row while keeping the grade set; "Clear
  selection" reverts to all rows + grade-all; a search while a subset is selected
  shows the intersection. No render test can observe this.

---

## 6. Forks for the owner (recommend-and-proceed; none gates the build)

Each is shaped so EVERY answer terminates the activity (AGENTS "two rounds then
ask"): the build proceeds on the recommended reading, recorded as the agent's
reading (not an owner ruling), and the answer is applied as transcription.

- **F1-b (searchable fields):** recommend repo + student + first + last + binding
  state; exclude folder-name and a dedicated username match from v1. Cost if
  wrong: one line in `rowMatchesQuery` + its oracle.
- **F2-b (sticky-header control membership):** recommend IN = search, typeahead +
  chips, Grade/Post run controls, column header; OUT (scrolling body) = course
  picker, org-prefix + Refresh, folder chooser, the full Grading-settings
  disclosure. The folder chooser is the one genuine judgement call - recommend
  body for a compact header. Cost if wrong: a JSX move + a line in the AC-F2-2b
  membership pin.
- **F2-a (thead offset mechanism):** recommend a ResizeObserver-set
  `--rg-working-header-h` with a token fallback and a height-capped header;
  route the rendered-height correctness to the owner walk. Alternative (a fixed
  token offset) only if the walk shows the observer is overkill. Cost: a CSS var
  vs a literal.
- **F3-a (replace vs augment checkboxes):** recommend AUGMENT - keep per-row
  checkboxes AND add the typeahead over the same set.
- **F3-b (none-selected semantics):** recommend PRESERVE today's exactly (empty
  set = whole column, grade and post). Do not invert a default without an ask.
- **F3-c (grade-vs-post asymmetry - THE terminating question):** this build
  produces one of two shapes:
  - **(X, recommended)** a non-empty grade set scopes BOTH grade and post
    (empty = whole column), applied at EVERY grade-plan site (execution handler,
    run bar :66/:70, column header :350/:352) so no count or label disagrees
    with the run (section 3.4); grade and post symmetric, typeahead immediately
    effective, `bulkSelectionOnly` becomes a candidate to retire (R3); OR
  - **(Y)** grading stays gated behind the explicit `bulkSelectionOnly` toggle;
    the typeahead then affects grading only when that toggle is on, and the AC
    must say so plainly.
  Proceeding on (X). The answer sets AC-F3-3/F3-4 wording and nothing else
  reopens.
- **F4-a (auto-filter trigger):** recommend ONE rule - any non-empty grade set
  that is a strict subset auto-narrows, regardless of selection source; empty or
  all-selected -> no filter. Cost if wrong: a condition in `visibleRepoRows`.
- **F4-b ("show all" override persistence):** recommend the Show-all display
  override be EPHEMERAL (not persisted), like cellEdits. If the owner wants it
  to survive reload, it becomes a new `ta-` key (canary 19 -> 20). Recommend
  ephemeral; proceeding on that.

---

## 7. owns - file list (planned edits/creates + the scanners that read them)

```
# edited/created (planned):
src/app/components/repo-grades/index.tsx                        # EDIT - relocate controls into sticky header child; display selector (bodyRows vs planRows props); NOTE grade-scope execution is NOT here (see the hook below) (budget: sec 4.2)
src/app/components/repo-grades/useRepoGradesGradingActions.ts   # EDIT (Wave C) - F3-c=X at the REAL grade-execution site: buildBulkGradePlan :784 selectionOnly: selected.size>0 || bulkSelectionOnly (this is the 4th F3-c site; it owns which repos actually grade)
src/app/components/repo-grades/RepoGradesStickyHeader.tsx        # NEW  - the one sticky working-header container (Wave A; new R-2 root)
src/app/components/repo-grades/RepoGradesControls.tsx            # EDIT - split working vs setup controls (F2-b)
src/app/components/repo-grades/RepoGradesRunBar.tsx              # EDIT/MOVE - run controls now a tier inside the sticky header; `rows` prop = planRows (folder-scoped, not query); F3-c=X at :66/:70
src/app/components/repo-grades/RepoGradesGrid.tsx                # EDIT - plan surfaces read planRows (not the query-filtered set), `<tbody>` renders bodyRows; F3-c=X at :350/:352 (Wave C)
src/app/components/repo-grades/repo-grades.module.css           # EDIT - .stickyShell/.stickyWorkingHeader; thead offset; search/typeahead/chip/counter classes; narrow-width block
src/app/components/repo-grades/repoGradesUiState.ts             # EDIT - searchQuery field + ta-repo-grades-search (Wave B); possible show-all key (F4-b)
src/app/components/repo-grades/repoGradesBulkGrade.ts           # POSSIBLE EDIT - F3-c grade-scope rule if applied in the leaf
src/app/components/repo-grades/repoGradesSearch.ts              # NEW leaf - rowMatchesQuery (Wave B)
src/app/components/repo-grades/repoGradesSearch.test.ts         # NEW test
src/app/components/repo-grades/repoGradesGradeSet.ts            # NEW leaf - toggleRepoInGradeSet (Wave C)
src/app/components/repo-grades/repoGradesGradeSet.test.ts       # NEW test
src/app/components/repo-grades/repoGradesVisibleRows.ts         # NEW leaf - visibleRepoRows(rows,query,gradeSet) (Wave C)
src/app/components/repo-grades/repoGradesVisibleRows.test.ts    # NEW test
src/app/components/repo-grades/RepoGradesGradeSetTypeahead.tsx  # NEW (optional, if the typeahead is split out; new R-2 root)
```

Scanners that read the above AS SOURCE TEXT and go red unless updated same-change:

```
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts  # R-2 frozen roots (35 -> up to 40) + runtime-graph (new leaves must be browser-safe)
src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts    # FROZEN_KEYS 18 -> 19 (search); -> 20 if F4-b adds a key
src/app/components/courses/page-module-css-orphan-classes.test.ts         # CSS-orphan ratchet: new classes must be referenced via styles.<name>
src/file-size-ceiling.structure.test.ts                                   # 1000-line ceiling - index.tsx at 960 is the risk; re-measure each wave
```

---

## 8. Residual register (owner, instrument, step)

Each names an owner, an instrument, and the step that measures it. A residual
not in `docs/BACKLOG.md` does not exist - the orchestrator adds these at
disposal.

- **R1 (shown==run across all filters; bodyRows vs planRows):** OWNER
  implementer of Wave C. INSTRUMENT AC-F1-3 + AC-F3-2 + AC-F3-3 + AC-F4-2 +
  AC-F4-3. STEP verify the typeahead, checkboxes, run-bar counts, grid column
  counts and auto-filter all reflect one `selected`; the grid/run bar plan
  surfaces read planRows (folder+selection); and no plan builder reads the
  search-filtered bodyRows. (= those ACs; not a deletion.)
- **R2 (F3-c semantics applied):** OWNER owner answers F3-c; implementer applies.
  INSTRUMENT AC-F3-3/F3-4. STEP the answer sets the `selectionOnly` expression +
  AC wording at Wave C.
- **R3 (`bulkSelectionOnly` fate under reading X):** OWNER owner. INSTRUMENT a
  follow-up scope note. STEP if F3-c = X, decide whether to retire
  `bulkSelectionOnly` (repoGradesUiState.ts:69); until then it stays, harmless.
  Product decision; escalate with F3-c.
- **R4 (no removal test for feature 3's click-cost leverage):** OWNER test seat
  records; owner accepts. INSTRUMENT none buildable (no render; advantage is
  clicks/scroll - `leverage.md` limit). STEP record in BACKLOG as "click-cost
  advantage, removal test not buildable in this env; owner walk AC-F3-5/AC-F4-5
  is the only evidence." A stated limit, not a deletion.
- **R5 (all visual/scroll/keyboard behaviour):** OWNER owner (browser).
  INSTRUMENT AC-F2-4, AC-F4-5, AC-F3 keyboard. STEP owner exercises each
  post-deploy. Unverifiable here by construction (`this-repo.md` section 6).
- **R6 (sticky-header offset correctness + above-fold height under wrap):** OWNER
  owner (browser) + Wave A implementer. INSTRUMENT AC-F2-4 walk; AC-F2-2 pins
  only that the offset REFERENCES the header height, not that the rendered value
  is right. STEP the ResizeObserver mechanism (section 2.3) is implemented in
  Wave A; the owner confirms no rows hide behind the header and the band is not
  too tall. Nothing in vitest can measure a rendered height.
