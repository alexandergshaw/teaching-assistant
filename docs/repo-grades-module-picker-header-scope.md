# Scope: put the repo-grading module picker on the table header

Owner request, 2026-10-11, verbatim: "on the repo grading page, the module
picker needs to be on the table header."

This is a presentational RELOCATION of one existing control. It adds no user
capability and no new data path, so there is no leverage claim and no new
diagnostic (sections 6 and 7 state and justify both absences). It is one wave,
one implementer, one commit (section 9), and its BUILD must SEQUENCE AFTER the
REPO-GRADING-REMOVE-ACTIVITY-LOG removal commits, because the two share three
files (section 5). The SCOPE here is read-only and may be written now.

Every quantity below names the command that produced it. Every `file:line` was
opened. This scope is `loop-architect` output; a `loop-checker` reads it before
any build.

---

## 1. Locating "the repo grading page" and "the module picker"

**The page** is the Repo Grades view, `RepoGradesTab`, the default export of
`src/app/components/repo-grades/index.tsx` (the file renders `TabHeader`
title "Repo Grades", `index.tsx:596-600`). It is mounted inside `page.tsx`'s
`<TabShell>` (noted in the `index.tsx:586-594` comment).

**"The module picker" is not a literal code symbol - it is resolved, with
evidence, to the "Assignment folder to grade" picker.** A grep of
`src/app/components/repo-grades/` for `module`, `modulePicker`, `ModulePicker`,
`moduleId`, and a Canvas-module select returned ONLY CSS-module imports
(`styles from "./repo-grades.module.css"`) and prose comments - there is NO
control in this view named a module picker and NO Canvas-module selector here
at all. The owner's phrase therefore names a control by its everyday role, not
its code identifier. Resolution, with the three facts that fix it:

- The assignment folders students organise their work into are literally named
  like modules: `repoGradesFolderSelection.ts:93`'s own worked example is
  `"Module-3"` / `"module-3"`, and the repo-name filter placeholder is
  `"e.g. module"` (`RepoGradesControls.tsx:398`).
- The "Assignment folder to grade" picker is THE page-level control that
  chooses which unit of work (which folder/module) the table shows and grades.
  Its origin quote is in `repoGradesFolderSelection.ts:1-6`: "i should be able
  to choose which assignment folder i want graded ... i want to select a folder
  from the repo in the drop down to grade."
- It is the ONE such picker not already on the header. The other page-level
  pickers are Course (a `Typeahead`), Sort, and Rubric source
  (`RepoGradesControls.tsx:362-379,468-494,594-616`); none is a module/folder
  selector. The per-column Canvas-assignment `<select>` is already inside the
  table header (`RepoGradesGrid.tsx:391-402`).

**Candidate disambiguation (the brief asked for this).**

| Candidate | Location today | Is it "the module picker"? |
|---|---|---|
| **"Assignment folder to grade" `<select>`** | `RepoGradesControls.tsx:411-448` (`id="repo-grades-folder"`), mounted via `index.tsx:602-642` | **YES - the target. Page-level, folder/module-named, not yet on the header.** |
| Per-column Canvas-assignment `<select>` | `RepoGradesGrid.tsx:391-402` | No - already in the `<thead>`, and it is per-column, not a module picker. |
| Course `Typeahead` | `RepoGradesControls.tsx:362-379` | No - selects the course, not a module. |
| Sort `<select>` | `RepoGradesControls.tsx:468-494` | No. |
| Rubric-source `<select>` | `RepoGradesControls.tsx:594-616` | No. |

If the owner meant a different control, this is a one-message redirect (RES-1);
the folder picker is the overwhelmingly most likely referent and the build
proceeds on it.

### The control-id sweep (root cause of the round-1 blocker)

A grep for the WORD "module" finds no code - but it also misses every test that
pins the control by its own id. Round 1 did exactly that and missed a test that
reds on the move. The sweep MUST also grep the entire repo-grades test suite for
the moved control's own id and prop names as SOURCE-TEXT assertions:
`repo-grades-folder`, `folderOptions`, `folderCensus`, `folderDropNotice`,
`onSelectedFolderChange`, `selectedFolder`. Re-swept
(`grep -n` over `src/app/components/repo-grades/*.test.ts`):

- `repoGrades.wiring.test.ts:878` - test "W3-R7" loops
  `["repo-grades-course","repo-grades-org-prefix","repo-grades-folder","repo-grades-sort"]`
  and asserts each `htmlFor="${id}"` sits inside `.adaptRow` and before
  `<details>` IN `RepoGradesControls.tsx`. This pins the folder picker's OLD
  home and REDS on the move - it is the blocker, now in the write set (sections
  5, 8/AC-2b, 9).
- `repoGrades.wiring.linking.test.ts:224,236-267` - `selectedFolder` here is
  `RepoGradesGridProps.selectedFolder` (the GRID's row-link prop) and
  `buildRepoGradeRowLinkHref(..., selectedFolder)`. The grid still receives
  `selectedFolder={currentSelectedFolder}` unchanged (`index.tsx:785`), so these
  are UNAFFECTED by moving the picker. Not in the write set.
- `repoGradeTreeLink.test.ts:43,88-89` - `selectedFolder` as an argument to the
  pure tree-link function. Unrelated to the picker. Not in the write set.
- `repoGradesStorageKeys.structure.test.ts:24` - `"ta-repo-grades-folder"`, the
  persistence key, which is KEPT. Not in the write set (no key churn).

So `repoGrades.wiring.test.ts` is the ONLY additional test; no second old-home
pin hides. The delta-checker should still confirm this independently.

### Where the folder picker renders TODAY and what it controls

- Rendered in `RepoGradesControls.tsx:411-448`, inside the stacked controls
  panel ABOVE the table (`index.tsx` renders `<RepoGradesControls .../>` at
  `:602-642`, then banners, the link panel, then the grid). It is NOT in the
  sticky header and does NOT travel with the scrolled table.
- It is gated on `showRowDependentFields` = `!!model && model.rows.length > 0`
  (`index.tsx:613`, consumed `RepoGradesControls.tsx:411`).
- It controls which folder/module column(s) the grid shows and grades: the
  selection flows to `currentSelectedFolder` (`index.tsx:345`), which scopes
  `displayedColumns`/`displayedRows` (`index.tsx:388-406`) and the grid
  (`index.tsx:785`).

### State, handler, persistence (the wiring that must be preserved)

- State: `const [selectedFolder, setSelectedFolder]` (`index.tsx:341`); the
  rendered value is the pure re-derivation `currentSelectedFolder =
  resolveSelectedFolder(folderCensus.options, selectedFolder)` (`:345`).
- Handler: `handleFolderChange` (`index.tsx:374-378`) -> `setSelectedFolder` +
  `setFolderDropNotice(null)` + `persistFolderSelection(courseId, value)`.
- Persistence: `persistFolderSelection`/`loadFolderSelection`
  (`repoGradesUiState.ts:411-426`), keyed per-course under
  `FOLDER_KEY = "ta-repo-grades-folder"` (`repoGradesUiState.ts:111`). This key
  is in the storage-keys canary (`repoGradesStorageKeys.structure.test.ts:24`).
- Props currently passed into `RepoGradesControls` for this control
  (`index.tsx:616-620`): `folderOptions={folderCensus.options}`,
  `folderCensus={{ scannedRepos, unknownRepos }}`,
  `selectedFolder={currentSelectedFolder}`,
  `onSelectedFolderChange={handleFolderChange}`,
  `folderDropNotice={folderDropNotice}`.

### The table header (both senses) - and the measured sticky mechanism

"The table header" is ambiguous in this view and the distinction is the whole
shape decision (section 2):

- **The sticky working-header tier** `.stickyWorkingHeader`
  (`repo-grades.module.css:31-43`): a non-semantic `<div>` bar rendered by
  `RepoGradesStickyHeader.tsx:53-69`, `position: sticky; top: 0; z-index: 3`,
  a `display: flex; flex-wrap: wrap` row that ALREADY holds the relocated run
  bar, the grade-set typeahead, and the Search box
  (`RepoGradesStickyHeader.tsx:55-67`). It is a styled header bar, not a `th`.
- **The semantic `<thead>` column-header row** in `RepoGradesGrid.tsx:497-541`:
  real `<th scope="col">` cells, one fixed set (Select, Repo, First name, Last
  name, Binding) plus one per folder column, each carrying `aria-sort` and a
  sort button. Sticky at `top: var(--rg-working-header-h)` with `z-index: 2`
  (`repoGradesWaveASticky.structure.test.ts:85-91` pins this).
- The two tiers share one bounded scroll shell `.stickyShell`
  (`RepoGradesStickyHeader.tsx:52`), and the thead's sticky offset
  `--rg-working-header-h` is PUBLISHED from the working header's measured
  `offsetHeight` by a `ResizeObserver` (`RepoGradesStickyHeader.tsx:33-49`), so
  the thead automatically re-pins below the working header whenever that
  header's height changes.

---

## 2. The shape decision: which "table header", and the layer the user reaches

**Decision: the picker goes INTO the sticky working-header tier
(`.stickyWorkingHeader`), NOT into the semantic `<thead>`.** The surface the
user reaches is that header bar - the same bar that already carries Search and
the grade-set typeahead and travels with the scrolled table. This is the layer
the user reaches, and it is where it reaches them.

Why this reading of "on the table header" and not the `<thead>`:

- **(a) Reachable with the sticky header.** The working-header tier is sticky
  (`top: 0; z-index: 3`). A folder picker placed there is visible and operable
  without scrolling back up a long table - which is the owner's evident intent
  (the minimize-clicks / minimize-scroll-distance pattern this project favours)
  and why the Search box and grade-set typeahead already live there.
- **(b) Does NOT break column alignment / sort / sticky offset.** The picker
  lives OUTSIDE the `<table>`, in the working-header `<div>`. It adds NO `<th>`,
  so the thead's `<th>` count, column alignment, per-column sort buttons and
  `aria-sort` are untouched. Because the thead's own sticky offset is the
  ResizeObserver-published `--rg-working-header-h`
  (`RepoGradesStickyHeader.tsx:41-47`), a picker that grows the working header
  (e.g. onto a second wrapped line) auto-adjusts the thead's `top` - no manual
  offset to break. Putting the picker INSIDE a `<th>` is the rejected reading:
  it is page-level (it chooses which columns exist), so it fits no single
  column cell, and injecting an interactive multi-option control into one `<th>`
  would distort that column's width and the sticky header layout.
- **(c) Preserves behaviour + persistence.** The picker keeps the exact value
  (`currentSelectedFolder`), handler (`handleFolderChange`) and persistence
  (`persistFolderSelection` / `ta-repo-grades-folder`); only its mount point
  moves. Its existing visibility gate (`model && model.rows.length > 0`) is
  preserved so no new state or behaviour is introduced.

**THE SURFACE IS A LAYER - stated explicitly.** The user reaches the picker on
the `.stickyWorkingHeader` div, rendered by `RepoGradesStickyHeader.tsx`,
through a node prop `folderControl` threaded from `index.tsx`. That node is a
browser-safe leaf component `RepoGradesFolderPicker.tsx` (section 3). There is
no "library with no surface" gap: the control, the div that renders it, and the
prop that carries it are all named.

---

## 3. The seam, the extraction, and the reachability pin

### 3a. Recommended shape: a dedicated leaf, passed as a node prop

Mirror the EXISTING precedent `RepoGradesGradeSetTypeahead.tsx` (a browser-safe
header-control leaf passed to the sticky header as `gradeSetControl?: ReactNode`
at `RepoGradesStickyHeader.tsx:24,55`). Concretely:

1. **New file `src/app/components/repo-grades/RepoGradesFolderPicker.tsx`**
   (`"use client"`, browser-safe leaf). Props are EXACTLY the five the folder
   block consumes today:
   `folderOptions: FolderOption[]`,
   `folderCensus: { scannedRepos: number; unknownRepos: number }`,
   `selectedFolder: string`,
   `onSelectedFolderChange: (value: string) => void`,
   `folderDropNotice: string | null`.
   It renders the label, the `<select>` (options: `ALL_FOLDERS` then
   `folderOptions.map` through `describeFolderOption(option, folderCensus)` -
   the identical option list as today, `RepoGradesControls.tsx:422-427`), the
   `selectedFolder !== ALL_FOLDERS` branch-recorded hint
   (`RepoGradesControls.tsx:436-438`), the `folderOptions.length === 0` empty
   hint (`:439-441`), and the `folderDropNotice` alert (`:442-446`). These four
   messages travel WITH the control (the drop notice is `role="alert"` and must
   sit next to the control that resets it). The `<select>` keeps
   `id="repo-grades-folder"` and its `<label htmlFor="repo-grades-folder">`, so
   the moved id is positively present in the new home (AC-2b depends on this).
   Imports only browser-safe leaves: `ALL_FOLDERS`, `describeFolderOption`, type
   `FolderOption` from `./repoGradesFolderSelection`, and BOTH CSS modules (NIT-1):
   `page.module.css` for the hint classes the block uses today (`styles.fieldHint`
   / `styles.error`, `RepoGradesControls.tsx:437,443`) and `repo-grades.module.css`
   for the header-bar idiom (`.headerField` / `.headerInput` / `.headerInputLabel`);
   both are browser-safe, and `RepoGradeCellControl.tsx:126-127` is the
   in-directory precedent for a leaf importing both. No server import, no new
   `@mui` import beyond what the chosen control element needs (the visual/UX seat
   finalises the element; see 3c).
2. **`RepoGradesStickyHeader.tsx`**: add `folderControl?: ReactNode;` to
   `RepoGradesStickyHeaderProps` (mirroring `gradeSetControl?: ReactNode` at
   `:24`) and render `{folderControl}` inside `.stickyWorkingHeader`
   (`:54-67`), alongside the run bar / grade-set / Search. Exact order within
   the row is the visual/UX seat's call; the architect pins only that it is
   inside that div.
3. **`index.tsx`**: remove the five folder props from the
   `<RepoGradesControls .../>` call (`:616-620`); add
   `folderControl={model && model.rows.length > 0 ? <RepoGradesFolderPicker
   folderOptions={folderCensus.options} folderCensus={{ scannedRepos:
   folderCensus.scannedRepos, unknownRepos: folderCensus.unknownRepos }}
   selectedFolder={currentSelectedFolder}
   onSelectedFolderChange={handleFolderChange}
   folderDropNotice={folderDropNotice} /> : null}` to the
   `<RepoGradesStickyHeader .../>` call (`:763-777`); import
   `RepoGradesFolderPicker`. The `model && model.rows.length > 0` ternary
   reproduces the `showRowDependentFields` gate that wrapped the block before,
   so visibility is unchanged.
4. **`RepoGradesControls.tsx`**: delete the folder `<div>` block (`:411-448`)
   and the five folder props from `RepoGradesControlsProps` (`:234-248`) and
   the destructure (`:318-322`). The component shrinks and keeps every other
   control.

### 3b. The reachability pin (don't ship visible-but-dead)

The move is correct ONLY if the relocated control still drives the same state.
Pin, by construction: `RepoGradesFolderPicker`'s `<select>` `value` is
`selectedFolder` and its `onChange` calls `onSelectedFolderChange(value)`; in
`index.tsx` those props are bound to `currentSelectedFolder` and
`handleFolderChange` - the SAME two expressions the control was bound to before
the move (`index.tsx:618-619`). `handleFolderChange` is NOT edited, so
persistence (`persistFolderSelection` -> `ta-repo-grades-folder`) is preserved.
No new storage key is added or removed. AC-2/AC-3/AC-5 below are the executable
form of this pin.

### 3c. Styling posture (handed to wave 3, with a stated default)

The header bar's established control recipe is `.headerField` +
`.headerInputLabel` + `.headerInput` (`repo-grades.module.css:50-87`), used by
the Search box and the grade-set typeahead. DEFAULT the architect recommends:
render the folder control as a labeled `.headerField` with a native `<select>`
carrying `.headerInput`, matching the bar's own idiom and avoiding MUI
`TextField` sizing drift inside the flex bar (the current block uses an MUI
`TextField select`, `RepoGradesControls.tsx:414-428`). This is a visual/aesthetic
and UX decision (wave 3): the Visual seat reconciles density, the select's
native-arrow styling, and the two hint lines against the header's compact row;
the UX seat owns the label copy ("Assignment folder to grade" is long for a
header - it may shorten to "Folder" with the full text as the accessible name)
and confirms no keyboard-handler collision (there is none: the repo-grades view
binds no `window`-level key handler; the `useRecorder.ts` `r`/`p`/`m` layer is
view-gated elsewhere). The architect does NOT fix copy or exact classes here.

### 3d. Inline fallback (named, not chosen)

If the owner prefers no new file, the folder node can be built INLINE in
`index.tsx` and passed to `folderControl` (the way `gradeSetControl` is built
inline at `index.tsx:765`). Tradeoff: it moves roughly 40 lines of presentational
markup INTO `index.tsx` (the most ceiling-pressured file in the directory) and
denies the structure test a stable component anchor, but it avoids the new file
and the directory-root canary bump (section 5). Recommended shape is 3a; this
is the fallback.

---

## 4. Measured baseline (mid-removal working tree)

All measured on the CURRENT working tree, which already holds the uncommitted
REPO-GRADING-REMOVE-ACTIVITY-LOG edits (section 5 proves this):

- `index.tsx` = 828 lines (`@(Get-Content ...\index.tsx).Count` = 828). Far
  below the 1000 ceiling. The recommended shape (3a) moves props, not markup,
  into `index.tsx`, so it stays well clear.
- `RepoGradesControls.tsx` = 681 lines (same command). SHRINKS (loses the
  folder block + props).
- `RepoGradesStickyHeader.tsx` = 73 lines (same command). Gains one prop + one
  render line.
- Non-test, non-`.d.ts` `.ts`/`.tsx` roots in the directory = 39
  (`Get-ChildItem <dir> -File | Where-Object { ($_.Name -like "*.ts" -or
  -like "*.tsx") -and not "*.test.ts*" -and not "*.d.ts" }` -> `.Count` = 39).
  The recommended shape adds `RepoGradesFolderPicker.tsx` -> 40.
- `RepoGradesLogPanel.tsx` and `repoGradesLog.ts` do NOT exist
  (`Test-Path` = False for both) - the removal's deletes are already applied in
  the tree.

**These numbers are the PENDING, UNCOMMITTED post-removal state and MUST be
re-measured against the removal's commit at build time** (the removal may edit
these files further before it commits). Name the command again then; do not
carry these figures forward as settled.

---

## 5. Sequencing: this build waits for the removal's commit

**Measured conflict, resolved.** The brief states REPO-GRADING-REMOVE-ACTIVITY-
LOG is "building right now" and that this build must sequence after it. The
working tree CONFIRMS it is mid-flight and UNCOMMITTED: `git status --short`
shows `D RepoGradesLogPanel.tsx`, `D repoGradesLog.ts`, `D repoGradesLog.test.ts`
and `M` on `index.tsx`, `repo-grades.module.css`,
`repoGradesFeedbackAndFiles.wiring.test.ts`, `repoGradesStorageKeys.structure.
test.ts`, `repoGrades.wiring.test.ts`, `repoGrades.wiring.linking.test.ts`,
`repoGradesUiState.ts`, `repoGradesUiState.test.ts`, `useRepoGradesBulkGrade.ts`,
`useRepoGradesBulkGrade.lifecycle.test.ts`, `useRepoGradesGradingActions.ts`,
`repoGradesRubricPicker.wiring.test.ts` - exactly the removal's write set
(docs/repo-grading-remove-activity-log-scope.md section 7) - while `git log`'s
HEAD is `9b878358` (a backlog-filing commit), NOT a `feat(...)` commit for the
removal. So there is no contradiction between the brief and the tree: the tree
is showing the removal in progress. My section-4 measurements reflect that
in-progress state, not a committed baseline, which is exactly why they must be
re-measured at build time.

**Write-set intersection with the removal (exact paths):**

| Path | In removal write set? | In this write set? | Collision |
|---|---|---|---|
| `index.tsx` | YES (M) | YES (edit props) | YES |
| `repo-grades.module.css` | YES (M) | MAYBE (only if a new header-select class is added; default reuses existing classes) | YES if touched |
| `repoGradesFeedbackAndFiles.wiring.test.ts` | YES (M, 41->39) | YES (39->40 for the new leaf) | YES - and a DEPENDENCY: start from the removal's 39 |
| `repoGrades.wiring.test.ts` | YES (M) | YES (W3-R7 update, AC-2b) | YES - start from the removal's version |
| every other removal path | YES | no | no |
| `RepoGradesStickyHeader.tsx`, `RepoGradesControls.tsx`, `RepoGradesFolderPicker.tsx` (new), `repoGradesWaveASticky.structure.test.ts` | no | YES | no |

**Rule: do NOT start this build until the removal COMMITS, then re-baseline
onto that commit.** Running concurrently would mean editing another agent's
uncommitted, unverified, mid-flight `index.tsx` /
`repoGradesFeedbackAndFiles.wiring.test.ts` / `repoGrades.wiring.test.ts`, and a shared-file `git status`
gate cannot distinguish the two agents' edits (the
`no-git-stash-under-concurrency` and `wave-gate-git-status` hazards). After the
removal commits: re-measure section 4, re-open `index.tsx:602-642` and the
sticky-header mount (`:763-777`) at their post-removal line numbers (the
removal shifts them), and start from `FROZEN_REPO_GRADES_ROOTS` = 39.

If, by build time, the removal has NOT committed and is blocking, that is an
orchestrator sequencing matter, not a reason to build on the dirty tree.

---

## 6. Leverage

N/A. This is a presentational relocation of an existing control, not a new
capability a user reaches (DEV_LOOP "Criteria": no leverage claim on a refactor
or a move). Trigger recorded; no claim, no removal test.

---

## 7. Diagnostics representation (DEV_LOOP b907ff8e)

NONE, and the absence is justified, not assumed. This move adds no new data
path and no new failure mode:

- The picker drives the identical state (`currentSelectedFolder`) through the
  identical handler (`handleFolderChange`) and the identical persistence
  (`persistFolderSelection` -> `ta-repo-grades-folder`). Nothing new is
  computed, fetched, or stored.
- The app's diagnostics seam is `timeGradingAction`
  (`../grading/gradingActionSeam`), wrapping the grade/post calls in the two
  grading hooks - wholly independent of the folder picker and untouched here.
- The one failure-mode question - does relocating into the sticky header create
  a new failure? - is NO: the folder-drop notice, the empty hint and the
  scan-dependent visibility gate move WITH the control, persistence is
  unchanged, and the thead's sticky offset auto-adjusts to any header height
  change via the existing ResizeObserver (`RepoGradesStickyHeader.tsx:33-49`).

A pure presentational change with no new data path legitimately carries no
diagnostic; this is that case.

---

## 8. ACCEPTANCE CRITERIA

No component is rendered by any test here (`vitest` is node-env, collects only
`src/**/*.test.ts`), so the lived "the picker is visibly on the sticky header
and travels with scroll, alignment intact" check is an owner walk (AC-7);
everything else is machine-checkable by source-text pins, `tsc`, and the
directory-root canary. Each pass condition names the object under comparison,
the instrument, and the direction of failure.

- **AC-1 (the picker is ON the header surface).** `RepoGradesStickyHeader.tsx`
  accepts and renders a `folderControl` node inside `.stickyWorkingHeader`, and
  `index.tsx` passes the folder picker to `<RepoGradesStickyHeader>` via
  `folderControl=`. Object: the sticky-header component source + the index.tsx
  mount; instrument: a source-text structure test (added to
  `repoGradesWaveASticky.structure.test.ts`) asserting
  `RepoGradesStickyHeaderProps` carries `folderControl` AND
  `.stickyWorkingHeader` renders `{folderControl}` AND `index.tsx` passes
  `folderControl=` WITHIN the `<RepoGradesStickyHeader ...>` tag. NIT-2: the
  index.tsx assertion must be ANCHORED to the `<RepoGradesStickyHeader` JSX
  region (slice from that tag's open to its matching close, as `mountSlice()` in
  `repoGrades.wiring.test.ts:810-820` already does for `runBar={`, then search
  WITHIN that slice), never a file-wide `[\s\S]*` match - else a stray
  `folderControl=` elsewhere in the file passes it. Direction: RED if the prop
  or render is absent, or if index.tsx does not pass it inside the mount.
- **AC-2 (the picker is GONE from its old home).** `RepoGradesControls.tsx`
  contains no `repo-grades-folder` and no "Assignment folder to grade" select.
  Object: `RepoGradesControls.tsx` source; instrument: same structure test,
  `expect(CONTROLS).not.toMatch(/repo-grades-folder/)`; direction: RED if the
  folder block was left behind (a duplicate control) or only partly removed.
- **AC-2b (the OLD-HOME test is updated to pin the MOVE, not left to red).**
  `repoGrades.wiring.test.ts` test "W3-R7" (`:873-883`) today loops
  `["repo-grades-course","repo-grades-org-prefix","repo-grades-folder","repo-grades-sort"]`
  and asserts each `htmlFor="${id}"` sits inside `.adaptRow` before `<details>`
  in `RepoGradesControls.tsx`; after the move
  `controlsText.indexOf('htmlFor="repo-grades-folder"')` is -1 and the test REDS.
  It MUST be updated in the same commit: (1) DROP `"repo-grades-folder"` from the
  id loop so it covers only the three pickers that remain in the controls row
  (course, repo-filter, sort), and retitle accordingly; (2) ADD a POSITIVE
  move-pin - assert `repo-grades-folder`'s `htmlFor`/`id` is ABSENT from
  `RepoGradesControls.tsx` AND PRESENT in the header leaf `RepoGradesFolderPicker.tsx`,
  reached through index.tsx's `folderControl=` slot on `<RepoGradesStickyHeader>`
  (the AC-1 anchored slice must contain `<RepoGradesFolderPicker`). Object: the
  controls source, the leaf source, and the index.tsx mount; instrument: the
  updated W3-R7; direction: RED if the picker is still in the controls row, OR if
  it was DELETED rather than moved (absent from both the controls row and the
  header leaf). This positive pin is what stops a silent deletion passing as a
  move.
- **AC-3 (wired to the SAME handler and state - not visible-but-dead).** In
  `index.tsx` the folder node's `onSelectedFolderChange` is `handleFolderChange`
  and its `selectedFolder` is `currentSelectedFolder`; `RepoGradesFolderPicker`'s
  `<select>` `onChange` forwards to `onSelectedFolderChange`. Object: index.tsx
  + the leaf source; instrument: structure test pinning
  `onSelectedFolderChange={handleFolderChange}` and
  `selectedFolder={currentSelectedFolder}` in the folder node, and the leaf's
  `onChange` -> `onSelectedFolderChange`; direction: RED if the move dropped the
  binding to the live handler/value.
- **AC-4 (orphan-clean - tsc + lint).** `npx tsc --noEmit` exits 0 and
  `npm run lint` exits 0. Object: the typed program + unused-symbol lint;
  instrument: `tsc` and eslint; direction: nonzero exit on a dangling
  `folderOptions`/`folderCensus`/`selectedFolder`/`onSelectedFolderChange`/
  `folderDropNotice` prop left on `RepoGradesControlsProps`, a missing import of
  `RepoGradesFolderPicker`, or a now-unused import in `RepoGradesControls.tsx`.
- **AC-5 (persistence preserved, no key churn).**
  `grep -n "ta-repo-grades-folder" src/app/components/repo-grades/repoGradesUiState.ts`
  still resolves, `handleFolderChange` still calls `persistFolderSelection`, and
  the storage-keys canary (`repoGradesStorageKeys.structure.test.ts`) is NOT in
  this write set and still passes unchanged. Object: the storage key set vs the
  canary's frozen list; instrument: that structure test (run in the gate) plus
  the grep; direction: RED if a key was added or removed, or `handleFolderChange`
  stopped persisting.
- **AC-6 (directory-root canary flipped IN THE SAME COMMIT).** With the new leaf
  `RepoGradesFolderPicker.tsx` added, `repoGradesFeedbackAndFiles.wiring.test.ts`
  passes with `FROZEN_REPO_GRADES_ROOTS` listing `"RepoGradesFolderPicker.tsx"`
  and its count updated 39 -> 40 (title "...exactly the 40 frozen basenames").
  Object: `directoryRoots(repo-grades)` vs the frozen list; instrument: that
  test; direction: RED if the new root is not added to the frozen list in the
  same commit. (Omit this AC entirely if the inline fallback 3d is chosen -
  then no new root exists.)
- **AC-7 (owner walk - not machine-checkable here).** With a course selected
  and a folder-scoped view, the Repo Grades page shows the folder/module picker
  in the sticky header bar (with Search and the grade-set typeahead); scrolling
  the table keeps it visible; changing it re-scopes the grid exactly as before;
  column alignment, per-column sort and the sticky column-header offset are
  intact; both light and dark themes read correctly; narrow-width reflow is
  acceptable. Object: the rendered view; instrument: owner walk (no component is
  rendered by any test); recorded as RES-3.
- **AC-8 (sticky mechanism untouched).** `repoGradesWaveASticky.structure.test.ts`
  W-A1..W-A5 and VH-10 pins stay green - the `.stickyShell`/`.stickyWorkingHeader`/
  thead-offset/ResizeObserver mechanism is not weakened by the move. Object:
  those CSS rules and the publish effect; instrument: that test; direction: RED
  if the move altered the shell bounding, the `--rg-working-header-h` offset, or
  the working-header stickiness.

---

## 9. Minimal write set and the wave gate

Recommended shape (3a). Nothing OUTSIDE
`src/app/components/repo-grades/` is touched.

Add (1 file):
- `src/app/components/repo-grades/RepoGradesFolderPicker.tsx` (new browser-safe
  leaf).

Edit - production (3-4 files):
- `src/app/components/repo-grades/index.tsx` (move props; import the leaf) -
  re-measure against the removal's commit.
- `src/app/components/repo-grades/RepoGradesStickyHeader.tsx` (add
  `folderControl?: ReactNode` + render).
- `src/app/components/repo-grades/RepoGradesControls.tsx` (remove the folder
  block + its 5 props).
- `src/app/components/repo-grades/repo-grades.module.css` ONLY if a header-select
  class is added; default reuses `.headerField`/`.headerInput` and this file is
  NOT edited. (Collision with the removal if touched - section 5.)

Edit - tests/canaries (3 files):
- `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts`
  (`FROZEN_REPO_GRADES_ROOTS` 39 -> 40, add `"RepoGradesFolderPicker.tsx"`,
  update the count in the `it(...)` title). SAME COMMIT as the new file.
  Collision with the removal (M) - start from the removal's 39.
- `src/app/components/repo-grades/repoGrades.wiring.test.ts` (update test "W3-R7"
  per AC-2b: drop `"repo-grades-folder"` from the id loop, retitle to the three
  remaining controls-row pickers, add the positive move-pin). This is the ROUND-1
  BLOCKER - without it the full `npm test` goes RED on an unplanned failure and an
  implementer repairing it in situ trips this scope's own `git status` wave gate.
  Collision with the removal (M) - start from the removal's version.
- `src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts` (add
  the AC-1/AC-2/AC-3/AC-8 source-text pins). NOT edited by the removal - no
  collision. A new dedicated `*.structure.test.ts` is also acceptable (test
  files are excluded from the frozen-roots list, so a new test file does not
  bump any canary) but must NOT import helpers from another `*.test.ts`
  (that re-runs its describe blocks - `no-cross-test-file-imports`).

House rules: no emojis / non-ASCII (`src/lib/no-emojis.test.ts` is the gate); no
file approaches the 1000-line ceiling (index.tsx is 828 and gains only props;
`RepoGradesControls.tsx` shrinks; the new leaf is small); persist-UI-control-
state is preserved, not added (the picker already persists to
`ta-repo-grades-folder`); UI/UX professional + minimal, reusing the header
bar's own `.headerField`/`.headerInput` language.

### Wave gate (exact commands)
- `npx tsc --noEmit` (AC-4) - it has ONE caller; no concurrent sabotage-verify.
- `npm run lint` (AC-4).
- Targeted test run (AC-1, AC-2, AC-2b, AC-3, AC-5, AC-6, AC-8), multi-path via
  the wrapper so no path is silently dropped:
  `npm run test:paths -- src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts src/app/components/repo-grades/repoGrades.wiring.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts`
- Full `npm test` (the move touches shared view files; the whole suite is the
  regression instrument) - expect no net change beyond the new leaf's pins, the
  frozen-roots bump, and the W3-R7 update (AC-2b). W3-R7 is an EDITED pin, not an
  unplanned red; if the full suite shows any OTHER repo-grades test reddening,
  a second old-home pin was missed - stop and re-sweep (section 1).
- `git status --short` against this write set, confirming no file outside it was
  touched and no `.claude/worktrees` copy was edited instead of the real tree
  (`stale-worktree-shadows-glob` - the same stale-copy trap that made this
  scope's first `Glob` list the already-deleted log files).

---

## 10. One wave

One wave, one implementer, one commit. The new leaf, the three prop moves, the
frozen-roots bump, the W3-R7 update (AC-2b) and the structure pins are mutually
dependent: adding the file without bumping the frozen list reds the
directory-root canary; moving the props without the leaf breaks `tsc`; moving the
folder block without updating W3-R7 reds the full suite; they MUST land together.
There is no disjoint
second item inside this scope and no sequencing benefit within it. The one
sequencing constraint is external and already stated: the whole wave waits for
the REPO-GRADING-REMOVE-ACTIVITY-LOG commit (section 5).

---

## 11. Residual register

Each entry names an owner, an instrument, and the step that measures it. Per
DEV_LOOP, a residual not in `docs/BACKLOG.md` does not exist - the orchestrator
files these at disposal / push.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-1 | **"Module picker" is resolved, not literal.** It is mapped to the "Assignment folder to grade" picker with the evidence in section 1 (no Canvas-module control exists in this view). If the owner meant another control, redirect in one message. | Repo owner | `grep -rn "module" src/app/components/repo-grades` (returns only CSS-module imports + prose) | Owner confirms or redirects before/at build start |
| RES-2 | **Build sequences after the removal commit.** The removal is uncommitted in the working tree (section 5); the shared files `index.tsx`, `repoGradesFeedbackAndFiles.wiring.test.ts` (and `repo-grades.module.css` if touched) collide. Do not build concurrently. | Orchestrator | `git log --oneline` shows a `feat(REPO-GRADING-REMOVE-ACTIVITY-LOG ...)` commit; then re-measure section 4 | Gate before dispatching this build; re-baseline onto the commit |
| RES-3 | **Owner walk (AC-7).** The sticky render, the picker's on-scroll visibility, alignment intact, both themes, narrow-width reflow - not verifiable here (no component renders under vitest). | Repo owner | Manual: open Repo Grades, select a course + folder, scroll | Owner walk post-ship |
| RES-4 | **Visual/UX wave (3).** Exact header control element (recommended: native `<select>` + `.headerField`/`.headerInput`), label copy (long "Assignment folder to grade" vs short "Folder" + accessible name), density of the two hint lines and the drop alert in the compact flex row, and the control's order within the bar. | Visual + UX seats (wave 3) | Visual/UX/accessibility passes against the as-built diff | Follow-up design seats after build |
| RES-5 | **Inline fallback (3d) not chosen.** If the owner forbids a new file, the folder node is built inline in `index.tsx` instead; AC-6 is then dropped and `index.tsx` grows ~40 lines (still < 1000). | Repo owner | `@(Get-Content index.tsx).Count` after the inline build | Owner rules only if they object to the new leaf |

---

## 12. What I could not determine in this environment

- AC-7 / RES-3 (the rendered sticky header, on-scroll visibility, theme and
  narrow-width behaviour): no component is rendered by vitest here. Owner walk
  only.
- Whether the removal will edit `index.tsx` /
  `repoGradesFeedbackAndFiles.wiring.test.ts` FURTHER before it commits: not
  knowable from the dirty tree; section 4's figures must be re-measured at build
  time against the removal's commit.
