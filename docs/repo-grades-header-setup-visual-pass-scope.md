# Repo Grades header + setup region: combined VISUAL/UX pass scope

READ-ONLY scope. No production code is written here. ASCII only (verified:
`LC_ALL=C grep -nc '[^ -~\t]' docs/repo-grades-header-setup-visual-pass-scope.md`
== 0). Behavior-preserving across the whole pass EXCEPT the one explicit
removal in ask (C).

This one scope covers THREE owner asks of 2026-10-11, filed as backlog rows
`REPO-GRADER-TABLE-HEADER-COMPACT` (docs/backlog.yml:55), `REPO-GRADES-RUN-SETUP-FACELIFT`
(:79) and `RUBRIC-GRADER-REDUNDANT-PORTION` (:67). The orchestrator's premise
that all three "touch the same files" is the reason they are scoped together as
ONE wave. That premise is TRUE for (A) and the minimal core of (B); it is FALSE
for (C) and for (B)'s "nested disclosures consistent" clause. See "The scope
conflict" below - it is the load-bearing finding of this document.

---

## 0. Measured facts (every quantity names its command)

Line counts, `@(Get-Content <file>).Count` (PowerShell, the mandated instrument;
`Measure-Object -Line` is forbidden here per docs/loop/this-repo.md section 3):

| File | Lines | In named-four set? |
|---|---|---|
| `src/app/components/repo-grades/index.tsx` | 883 | yes |
| `src/app/components/repo-grades/RepoGradesControls.tsx` | 636 | yes |
| `src/app/components/repo-grades/RepoGradesStickyHeader.tsx` | 89 | yes |
| `src/app/components/repo-grades/repo-grades.module.css` | 985 | yes |
| `src/app/components/repo-grades/RepoGradesRunBar.tsx` | 117 | NO |
| `src/app/components/repo-grades/RepoGradesGrid.tsx` | 651 | NO |
| `src/app/components/repo-grades/RepoGradesFolderPicker.tsx` | 67 | NO |

The CSS ceiling: `repo-grades.module.css` is 985, limit is 1000
(`src/file-size-ceiling.structure.test.ts:41`, `LIMIT = 1000`), headroom = 15
lines. index.tsx at 883 has 117 lines of headroom. This matters for (A)/(B)
which ADD, and is RELIEVED by (C) which deletes - see section 5.

Screenshot for (C): the backlog row (:75) and the task both point to the
session images dir `/images/*.png`. The two PNGs present in this session's
images dir (`1.png`, `2.png`) are a DIFFERENT feature - a "Messaging (9)
Selected Students" modal and a "Success Tracking" table, not the repo/rubric
grader header. So the owner's (C) screenshot is NOT available to me. The (C)
identification below is therefore from the CODE alone; the exact surface the
owner circled is the central unresolved fork and goes to the owner before the
(C) build. This is stated, not worked around (docs/loop/this-repo.md section 6
posture: say plainly what could not be determined).

---

## 1. What the sticky working header actually renders (shared ground for A and C)

`RepoGradesStickyHeader.tsx:63-88` renders, inside `.stickyWorkingHeader`
(the sticky top tier, CSS :31-43), in this DOM order:

1. `runBar` -> `<RepoGradesRunBar>` (RepoGradesStickyHeader.tsx:67), present ONLY
   when `index.tsx:822-832` passes a non-null runBar, i.e. when exactly one
   folder is selected (`currentSelectedFolder !== ALL_FOLDERS`).
2. `statusBanner` (:68) - the grading spinner+count, present only while
   `bulkRunningFolder` (index.tsx:793-803).
3. `folderControl` (:69) -> `<RepoGradesFolderPicker>` (index.tsx:792).
4. `rescanControl` (:70) - the Refresh button (index.tsx:787-791).
5. `gradeSetControl` (:71) -> `<RepoGradesGradeSetTypeahead>` (index.tsx:820).
6. `targetBranchControl` (:72) - the Target-branch `.headerField` (index.tsx:804-819).
7. The built-in Search `.headerField` (RepoGradesStickyHeader.tsx:73-83).

`.stickyWorkingHeader` is `display:flex; flex-wrap:wrap; align-items:center;
gap: var(--space-2) var(--space-3); padding: var(--space-3)` (CSS :37-41).

### Height contributors, ranked (the "which slots add vertical px" the row asks for)

Vertical px in this wrapping flex row come from (a) the tallest item on each
wrapped line, times the number of wrapped lines, plus (b) top+bottom padding
`var(--space-3)`, plus (c) per-line row-gap `var(--space-2)`.

- **The run bar is the single biggest contributor.** `.runBar` is
  `flex: 1 1 100%` (CSS :962) - it always takes a FULL line of its own - and
  inside it `.runBarFolder` is `flex: 1 0 100%` (CSS :981), so the folder name
  is a SECOND full-width sub-line above the rubric/post-reason context and the
  Grade/Post buttons. The run bar alone is >= 2 text rows tall whenever it is
  present (single-folder view, which is exactly the overhaul's target view).
  Removing it (ask C) is therefore also the largest ask-(A) win, which is why
  (A) and (C) are genuinely coupled and not merely co-filed.
- **Each `.headerField` stacks its label ABOVE its input** (`flex-direction:
  column; gap: 2px`, CSS :62-68) - the folder picker, the target-branch field,
  and the search box each spend one extra `--font-size-xs` label line
  (`.headerInputLabel`, CSS :74-79) plus 2px. Three fields => roughly three
  label-lines of vertical cost that an inline-label treatment could reclaim.
- **The folder picker emits up to three hint paragraphs INSIDE the header**
  (`RepoGradesFolderPicker.tsx:54-64`): the always-on "Links open the branch
  recorded..." line in single-folder view, the empty-scan line, and the
  role="alert" drop notice. In single-folder view at least one hint line is
  always present, adding header height.
- **Padding `var(--space-3)` top and bottom** and the per-line row-gap
  `var(--space-2)` are uniform and cheap to tighten.

---

## 2. Ask (A) - REPO-GRADER-TABLE-HEADER-COMPACT

Goal: minimize the sticky working header's vertical footprint so the grid gets
more space, WITHOUT losing any control or the sticky mechanism.

### Compaction levers (the build picks from these; the pixel result is owner-walk)

1. **Remove the run bar (this IS ask C).** Biggest vertical win. Builds the two
   asks as one change. See section 4.
2. **Tighten `.stickyWorkingHeader` box metrics**: `padding: var(--space-3)` ->
   `var(--space-2) var(--space-3)` (less top/bottom), and reduce the row-gap half
   of `gap: var(--space-2) var(--space-3)`. Pure edits, zero net CSS add.
3. **Inline the three `.headerField` labels** instead of stacking them: either
   a compact inline label (label + input on one line) or a visually-hidden
   label with the existing `aria-label` carrying the accessible name (the search
   and target-branch inputs ALREADY carry `aria-label`, RepoGradesStickyHeader.tsx:77
   and index.tsx:810, so collapsing their visible label row loses no accessible
   name). This reclaims ~one text row per field. Treat the folder picker's
   `<label htmlFor>` the same only if its accessible association is preserved.
4. **Relocate the folder picker's always-on branch hint** out of the header
   (e.g. directly above the grid, where index.tsx already renders
   `RepoGradesFolderHint`), so it stops adding a line to the sticky tier. This
   is an info-placement tradeoff, not a deletion - the sentence still renders.

Levers 2 and 3 are the behavior-preserving core and stay strictly inside the
named four files + CSS. Lever 1 is (C) (files outside the four). Lever 4 touches
`RepoGradesFolderPicker.tsx` (outside the four) and is OPTIONAL - flag it.

### (A) must-preserve (pins)

- The ResizeObserver publishing `--rg-working-header-h`
  (RepoGradesStickyHeader.tsx:45-61; pinned by W-A9,
  repoGradesWaveASticky.structure.test.ts:123-126).
- The sticky tiering: `.stickyShell` bounded+scroll (W-A1), `.stickyWorkingHeader`
  sticky/top:0/left:0/z-index:3/opaque (W-A3), `.grid thead th` offset at
  `top: var(--rg-working-header-h)` z-index:2 (W-A4), narrow-width un-stick (W-A5).
  None of these may change value; compaction edits other declarations in the
  same rule blocks.
- Every control still RENDERED FROM the header node: folderControl,
  statusBanner, rescanControl, gradeSetControl, targetBranchControl, search.
  (If lever 1/C removes the run bar, that slot alone goes; the other six stay.)
- The single aria-live region (AC-W4-4, repoGradesWaveASticky.structure.test.ts:262-264;
  AC-3 :203-208). Compaction must not add or move an aria-live.

### (A) forks (recommended readings for the owner/AC seat)

- **A-fork-1: inline-label vs visually-hidden-label.** Inline keeps the caption
  visible (lower learnability cost) but saves less height; visually-hidden saves
  a full row but relies on the existing `aria-label`s. RECOMMEND inline for the
  folder picker (its label names a non-obvious control) and visually-hidden for
  search + target-branch (their placeholders already self-describe). Cost if
  wrong: a later one-line CSS/label flip, no data path touched.
- **A-fork-2: relocate the branch hint (lever 4) or leave it.** RECOMMEND leave
  it in this pass (keeps the write set inside the four + CSS; defer lever 4 to a
  follow-up if the owner still finds the header tall). Cost if wrong: the header
  stays one line taller than it could be.

---

## 3. Ask (B) - REPO-GRADES-RUN-SETUP-FACELIFT

The parent "Run setup" disclosure is `index.tsx:616-701`: a `<details
className={gridStyles.setupRegion}>` whose `open` is
`effectiveOpen(uiState.setupOpen, !allBound)` (:618), with `<summary>Run
setup</summary>` (:627) wrapping `<RepoGradesControls>` (:628) then
`<LinkUsernamesPanel>` (:677). CSS for it: `.setupRegion` (:781-787) and
`.setupRegion > summary` (:789-792, just `cursor:pointer; font-weight:600`).

The nested disclosures named by the owner:
- "Grading settings" - a `<details>` inside `RepoGradesControls.tsx:437-444`
  with an inline-styled `<summary style={{cursor:pointer,fontWeight:600}}>Grading
  settings - {settingsSummary}</summary>` (:445). This file IS in the named four.
- "Link usernames" - a `<details>` inside `LinkUsernamesPanel.tsx` (driven by
  the `linkPanelOpen`/`onLinkPanelOpenChange` props index.tsx:696-697 passes).
  This file is NOT in the named four.

### Facelift plan

1. **Make `<summary>Run setup</summary>` a real disclosure header.** A flex row
   carrying: the label "Run setup", a chevron/indicator that rotates on `[open]`
   (CSS-only: style the summary's marker, or `list-style:none` + a `::after`
   pseudo-element rotated under `.setupRegion[open] > summary::after`), and an
   OPTIONAL one-line collapsed-state summary. index.tsx ALREADY computes a
   bound-summary string - `${confirmedCount} of ${model?.rows.length ?? 0} repos
   bound` (:698, currently passed only to LinkUsernamesPanel as `boundSummary`) -
   which is the natural collapsed summary to reuse rather than invent.
2. **Improve the setup-region surface/spacing/hierarchy.** `.setupRegion`
   already uses `--surface-subtle` + `--card-border` + `--radius-md`; add a
   header rule (padding, a bottom border under the summary when open, a hover
   state) in the app's existing token vocabulary. No new tokens (the file's own
   header comment, CSS :1-19, forbids introducing variables).
3. **Make the nested "Grading settings" summary consistent** with the parent:
   replace the inline `style={{...}}` on RepoGradesControls.tsx:445 with a shared
   class so both summaries read as the same disclosure idiom.

### (B) must-preserve (pins)

- `effectiveOpen(uiState.setupOpen, !allBound)` default-open-when-not-ready
  (index.tsx:618; pinned AC-W4-1/3, repoGradesWaveASticky.structure.test.ts:243-246).
- `ta-repo-grades-setup-open` persistence via the `onToggle` guard
  (index.tsx:619-625; `setupOpen: value`).
- AC-W4-7: the parent `<details className=setupRegion>` still contains BOTH
  `<RepoGradesControls>` then `<LinkUsernamesPanel>`, with
  `<RepoGradesStatusBanners>` AFTER the close (repoGradesWaveASticky.structure.test.ts:248-260).
- The single aria-live (AC-W4-4).

### (B) forks

- **B-fork-1: collapsed-state summary - show it or not.** RECOMMEND show the
  reused bound-summary string when collapsed (gives the closed accordion a
  reason to be closed). Cost if wrong: a one-line JSX removal.
- **B-fork-2 (SCOPE): nested-disclosure consistency reaches LinkUsernamesPanel.tsx.**
  Full visual consistency across "Grading settings" AND "Link usernames"
  requires LinkUsernamesPanel.tsx (outside the four) to adopt the shared summary
  class. RECOMMEND: minimal (B) styles the parent summary + the Grading-settings
  summary (both inside the four + CSS), and the build EITHER adds
  LinkUsernamesPanel.tsx to the write set for full consistency OR defers the
  Link-usernames summary to a follow-up row. This is an owner/orchestrator call,
  not the seat's. Cost if wrong (deferring): the Link-usernames disclosure looks
  slightly different from its two siblings for one release.

---

## 4. Ask (C) - RUBRIC-GRADER-REDUNDANT-PORTION

### What the described portion is, traced to code

The owner's described stack - folder label "assignments/module_06", a "Choose an
assignment..." select, a "Rubric: generated from the instructions when you
grade" note, the "Grade all 7 repos in assignments/module_06" button, "Post 0
grade(s)" - maps to the GRID COLUMN HEADER, `RepoGradesGrid.tsx:380-445`
(`.columnHeader`):

- folder label = `.columnHeaderFolder` inside the sort button (:388).
- "Choose an assignment..." select = :391-402 (`<option value="">Choose an
  assignment...</option>` at :396). This string exists NOWHERE else in the
  header region (`grep -rn "Choose an assignment" src/app/components/repo-grades`
  returns only RepoGradesGrid.tsx:396 and LinkUsernamesPanel.tsx:344).
- rubric note = the `.postReason` span at :411 (`describeColumnRubric` ->
  `"Rubric: generated from the instructions when you grade"`,
  repoGradesRubricSource.ts:437).
- Grade all / Post buttons = :422-444.

The STICKY RUN BAR (`RepoGradesRunBar.tsx:83-115`) renders a near-identical
cluster in the working header directly ABOVE the grid, when one folder is
selected: `.runBarFolder` = the same `column.folder` (:86), two `.postReason`
context lines - the "Posts to X"/"No Canvas assignment chosen for this folder
yet" reason (:87-89) and the SAME rubric note `describeColumnRubric` (:90) - and
the SAME Grade all / Post buttons (:92-114, forwarding to the same
`onGradeColumn`/`onPostColumn` handlers). The run bar has NO assignment select.

So the redundancy is REAL and cross-surface: in single-folder view the user sees
the folder name, the rubric note, and Grade-all/Post TWICE - once in the sticky
run bar and once in the grid's own column header. The grid's `thead th` is
itself sticky (`.grid thead th { position: sticky; top: var(--rg-working-header-h) }`,
CSS :194-203), so the column header's Grade/Post ALREADY stay pinned below the
working header while the body scrolls - which is the very benefit the run bar
(A7 W3) was added to provide. The run bar duplicates a capability the sticky
thead already delivers.

### Candidate verdicts

- **(ii) Remove the "Choose an assignment..." select - REFUSE.** It is the ONLY
  folder->Canvas-assignment mapping control. Its `onChange` ->
  `onAssignmentChange(column.folder, ...)` -> index.tsx `handleAssignmentChange`
  (:419-423) -> `persistAssignmentMapping`, and the mapping is read by the post
  path (`pointsPossible`, `assignmentId` in RepoGradesRunBar.tsx:57-62 and the
  grid's post plan). Removing it orphans the only way to choose which Canvas
  assignment a folder posts to and breaks posting. This is the exact "do NOT
  remove a control something still reads" trap (memory: activity-log removal
  cef512f0 was safe only because nothing read it; this is the opposite).
- **(i) Remove the standalone folder label - weak.** In the grid header the
  folder label is the SORT button's text (`.columnHeaderFolder` inside the
  sort button at :382-390); removing it kills the sort affordance's label. In
  the run bar `.runBarFolder` can be dropped safely, but that alone is a tiny
  de-dup and does not answer "this whole portion is redundant".
- **(iii) Remove the rubric note - partial.** It is duplicated (run bar :90 AND
  grid header :411). Dropping one copy de-dups the note but leaves the larger
  folder/Grade/Post duplication.

### RECOMMENDATION

**Remove the sticky RUN BAR as the redundant copy** - delete
`RepoGradesRunBar.tsx` and its mount, OR, as the more conservative variant,
remove only its read-only context span `.runBarContext` (folder + post-reason +
rubric note, RepoGradesRunBar.tsx:85-91) and keep its Grade/Post buttons.
Rationale:

1. The run bar holds NO unique control (no select; its buttons forward to the
   same handlers the grid column header calls). It is a pure duplicate plus
   read-only context.
2. The grid `thead` is already sticky, so Grade/Post stay pinned WITHOUT the run
   bar - A7 W3's stated benefit survives.
3. Removing the run bar's full-width multi-row block is also the largest ask-(A)
   vertical win, unifying (A) and (C) into one change.
4. It preserves the load-bearing assignment select (which lives only in the grid
   column header, untouched).

Two build variants, owner picks:
- **C1 (remove the whole run bar):** largest header-height win; single-folder
  Grade/Post then lives only in the grid's sticky column header. Reverses A7 W3.
- **C2 (remove only `.runBarContext`, keep the run bar's Grade/Post):** keeps a
  pinned Grade/Post pair at the very top (A7 W3 intent) while deleting the
  duplicated folder/reason/rubric context. Smaller test churn, smaller
  header-height win.

RECOMMEND **C2** as the minimal faithful de-dup if the owner wants the pinned
Grade/Post kept, else **C1**. Cost if wrong: if the owner actually wanted the
GRID column header slimmed (keeping the run bar), the rework is to restore the
run bar and instead gate the grid column header's Grade/Post/rubric off in
single-folder view (variant C3, below) - a moderate rebuild touching
RepoGradesGrid.tsx. If the owner wanted only candidate (iii), the rework is
smaller. Because the real screenshot is absent, this fork MUST be confirmed
with the owner before the (C) build.

- **C3 (not recommended, recorded for completeness):** keep the run bar; in
  single-folder view suppress the grid column header's duplicated Grade/Post/
  rubric/folder, leaving only its assignment select. Touches RepoGradesGrid.tsx,
  adds conditional per-view logic, and does NOT help ask (A) (the tall run bar
  stays). Worse on every axis than C1/C2.

### (C) consumer trace (removal safety)

- `grep -rln "RepoGradesRunBar" src --include=*.tsx | grep -v test` -> only
  `RepoGradesRunBar.tsx` and `RepoGradesStickyHeader.tsx`. No other importer; the
  index.tsx `runBar={...}` object (:822-832) is the only construction site.
- The leaves the run bar uses are NOT orphaned by its deletion: `resolveGradeScope`
  and `repoGradesRunPlan` are both ALSO consumed by RepoGradesGrid.tsx
  (`grep -rln "resolveGradeScope" src/app/components/repo-grades/*.tsx` and the
  same for `repoGradesRunPlan` each return RepoGradesGrid.tsx AND
  RepoGradesRunBar.tsx). The handlers (`handleGradeColumn`, `handlePostColumn`,
  `rubricSource.describeColumn`, `displayedColumns[0]`, `displayedRows`) remain
  used by the grid. So C1/C2 orphan nothing in the value graph.
- CSS freed by C1: `.runBar` (:954-963), `.runBarContext` (:965-973),
  `.runBarContext .postReason` (:975-978), `.runBarFolder` (:980-985) = lines
  949-985, about 37 CSS lines removed. C2 frees about 22 (the context + folder
  classes).

### (C) scope cost - the files it actually touches

NEITHER C1 nor C2 is confined to the four named files:
- RepoGradesRunBar.tsx (delete or edit) - NOT in the four.
- repo-grades.module.css (delete run-bar classes) - in the four.
- index.tsx (delete the runBar prop + object) - in the four.
- RepoGradesStickyHeader.tsx (drop the runBar prop + import + mount) - in the four.
- Tests that pin the run bar IN the header and MUST be rewritten: see section 6.

So (C) spills out of the named four onto RepoGradesRunBar.tsx and a set of
structure/wiring tests. This is the scope conflict.

---

## 5. The scope conflict (the load-bearing finding)

The orchestrator scoped these three asks together "so they build as ONE wave and
do not collide as three serial builds", on the premise that all three touch
`{RepoGradesStickyHeader.tsx, index.tsx, RepoGradesControls.tsx,
repo-grades.module.css}`. Measured against the tree, that premise holds for (A)'s
behavior-preserving core and (B)'s minimal core, and FAILS for:

- **(C)** - the redundant portion lives in RepoGradesRunBar.tsx (run bar) and
  RepoGradesGrid.tsx (grid column header), NOT in the four. Every coherent (C)
  removal edits at least RepoGradesRunBar.tsx (C1/C2) or RepoGradesGrid.tsx (C3),
  plus the 5 structure/wiring tests that pin the run bar.
- **(B)'s "nested disclosures (Grading settings, Link usernames) consistent"
  clause** - full consistency requires LinkUsernamesPanel.tsx, NOT in the four.
- **(A)'s optional lever 4** (relocate the folder hint) - RepoGradesFolderPicker.tsx,
  NOT in the four.

This does NOT block a single wave; it means the single wave's WRITE SET is wider
than four files. The wave must be dispatched with the full write set
(section 7), or (C) must be split into its own build. Recommendation in
section 7. The one thing the build must NOT do is silently assume the four-file
boundary and then have an implementer reach outside it ungated - that is how the
wave gate (`git status --short` vs the assignment) goes red for a correct change.

---

## 6. CSS ceiling and the split plan

- Current: `repo-grades.module.css` = 985 / 1000 (headroom 15,
  `@(Get-Content).Count`; limit `src/file-size-ceiling.structure.test.ts:41`).
- (C) FREES CSS: C1 removes ~37 lines (run-bar classes 949-985), C2 removes ~22.
- (A) is net-neutral-to-negative on CSS (tightening existing declarations;
  an optional `.stickyWorkingHeaderCompact`-style modifier would add ~5-8).
- (B) ADDS CSS: a real summary-header (chevron pseudo-element, open-state
  border, hover, shared nested-summary class) is roughly +20 to +40 lines.

**Build order resolves the ceiling without a split in the likely case:** build
(C) FIRST (frees 22-37 lines), then (A), then (B) into the reclaimed budget.
Net: `985 - 22..37 + 0..8(A) + 20..40(B)` lands at roughly 976-1000 - at or
under the limit if (C) is C1 (-37). The build MUST re-measure
`@(Get-Content repo-grades.module.css).Count` after (A)+(B) land and before the
push; the file-size ceiling test is the gate.

**Split fallback (only if the post-(A)+(B) measurement is >= 1000):** extract the
link/setup CSS family - `.logTitle` (:765-770), `.setupRegion` (:781-792),
`.linkPanel`...`.linkSourceSection` and the `@media` link block (:794-927), about
163 lines - into a new `repo-grades-setup.module.css`, imported by
`LinkUsernamesPanel.tsx` (for the `.link*` classes) and `index.tsx` (for
`.setupRegion`, currently `gridStyles.setupRegion` at index.tsx:617). This is a
clean, self-contained family and frees ~163 lines. It touches LinkUsernamesPanel.tsx
(outside the four), so it is only taken if measurement forces it. Do the split
BEFORE (B)'s additions if it is needed, not after.

---

## 7. The owns file list, the wave, and the gate

### Derived owns set (command + pasted output)

Source-text tests that READ any touched file (so a correct edit can redden them)
were derived with, per repo-grades test:
`grep -rln 'readFileSync\|read("' src/app/components/repo-grades/*.test.ts`
then matching each target filename. Result (the tests that read the files this
pass edits):

- `repoGradesWaveASticky.structure.test.ts` - reads index.tsx, RepoGradesControls.tsx,
  RepoGradesStickyHeader.tsx, repo-grades.module.css, RepoGradesRunBar.tsx.
  Pins the run bar IN the header (W-A7 :106-110, W-A8 :112-121, W-A10 :128-147,
  VH-10(b) :156-161), the sticky mechanism (W-A1..A5, W-A9), STATUS-PROMINENCE
  (AC-2/AC-3 :192-208), W3 rescan (:219-237), W4 setup disclosure (:243-264).
  REWRITTEN by (C) (run-bar pins) and gated-green by (A)/(B).
- `repoGrades.wiring.test.ts` - reads all four + RepoGradesRunBar.tsx +
  RepoGradesGrid.tsx + RepoGradesFolderPicker.tsx; 10 RunBar mentions
  (`grep -rc "RunBar\|runBar"`). REWRITTEN by (C).
- `repoGradesFeedbackAndFiles.wiring.test.ts` - reads all four + RunBar + Grid +
  FolderPicker; 1 RunBar mention. Check/adjust under (C).
- `repoGradesWaveBSearch.structure.test.ts` - reads index.tsx,
  RepoGradesStickyHeader.tsx, RepoGradesGrid.tsx; 1 RunBar mention. Check under (C)/(A).
- `repoGradesWaveCTypeahead.structure.test.ts` - reads index.tsx,
  RepoGradesStickyHeader.tsx, RepoGradesRunBar.tsx, RepoGradesGrid.tsx; 2 RunBar
  mentions. Check under (C).
- `repoGradesSliceA.guards.test.ts` - reads index.tsx, RepoGradesControls.tsx,
  repo-grades.module.css. Gated-green by (A)/(B).
- `repoGradesCodeExecution.wiring.test.ts`, `repoGradesClassTrends.wiring.test.ts`,
  `repoGradesRubricPicker.wiring.test.ts`, `repoGradesResultsPersist.structure.test.ts`,
  `repoGrades.wiring.linking.test.ts` - read index.tsx and/or RepoGradesControls.tsx;
  gated-green (verify they do not pin a touched string).
- `src/file-size-ceiling.structure.test.ts` - unconditional, the CSS ceiling gate.

The build implementer MUST re-derive this set with its own instrument and report
what this list missed (the orchestrator's enumeration is a FLOOR, not the set -
docs/loop/traps-spec.md).

### Proposed ONE wave, write set, build order

Dispatch as ONE implementer wave (the three asks share index.tsx and the CSS, so
they cannot run as disjoint concurrent sub-waves). Write set:

- index.tsx, RepoGradesStickyHeader.tsx, RepoGradesControls.tsx,
  repo-grades.module.css (the four).
- RepoGradesRunBar.tsx (delete or edit - ask C).
- The 5 structure/wiring tests above that pin the run bar (rewrite - ask C).
- IF owner takes B-fork-2 full consistency: LinkUsernamesPanel.tsx.
- IF measurement forces the split: + the new repo-grades-setup.module.css
  (+ LinkUsernamesPanel.tsx import).
- IF owner takes A-lever-4: RepoGradesFolderPicker.tsx.

Build order INSIDE the wave:
1. **(C) first** - remove the run bar / its context; rewrite the run-bar test
   pins. This frees CSS headroom and does the biggest (A) height win.
2. **(A)** - tighten header box metrics + inline labels, on top of the smaller
   header (C) produced.
3. **(B)** - facelift the summary into the reclaimed CSS budget; split only if
   the measurement after this step is >= 1000.
4. Re-measure the CSS, run the gate.

This wave SERIALIZES behind any other in-flight repo-grades/grading build: it
shares `index.tsx`, the CSS module, and the single `npx tsc --noEmit` caller
(one tsc at a time, docs/loop/this-repo.md section 2), and the full test run.

### Wave gate (exact command, multi-path => test:paths)

Because the gate names >= 2 test files, use the wrapper (raw multi-path vitest
silently drops unmatched args, docs/loop/this-repo.md):

```
npm run test:paths src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts src/app/components/repo-grades/repoGrades.wiring.test.ts src/app/components/repo-grades/repoGradesWaveBSearch.structure.test.ts src/app/components/repo-grades/repoGradesWaveCTypeahead.structure.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/repo-grades/repoGradesSliceA.guards.test.ts src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts src/app/components/repo-grades/repoGrades.wiring.linking.test.ts src/app/components/repo-grades/repoGradesRubricPicker.wiring.test.ts src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts src/app/components/repo-grades/repoGradesResultsPersist.structure.test.ts src/file-size-ceiling.structure.test.ts
```

Plus, repo-root, in order: `npx tsc --noEmit` (no output = pass), `npm run lint`
(exit 0, no NEW warning in the files this wave writes - do not pin the count),
`npm run build` (gate on the `Compiled successfully` line, not exit code), and
`git status --short` against the assignment (no `.claude/worktrees` copy edited
instead of the real tree).

---

## 8. Instruments: object / instrument / direction of failure (vitest renders nothing)

No component renders under vitest, so these are source-text / CSS-structure pins.
The real results - header height before/after (A), the facelift look (B), the
de-duplicated render (C) - are OWNER-WALK and are NOT claimed here.

| Ask | Machine-checkable pin (object) | Instrument | RED when |
|---|---|---|---|
| A | `.stickyWorkingHeader` still renders all six (or five, post-C) control slots | repoGradesWaveASticky/Search/Typeahead source-text pins | a control slot stops being rendered from the header node |
| A | `--rg-working-header-h` still published; sticky tiers intact | W-A1..A5, W-A9 | the ResizeObserver/setProperty or any sticky declaration value is dropped |
| A | exactly one aria-live in comment-stripped index.tsx | AC-W4-4 (:262-264) | compaction adds/moves an aria-live |
| B | parent `<details className=setupRegion>` with its summary; both nested components inside; banners after close | AC-W4-7 (:248-260), AC-W4-1/3 (:243-246) | nesting/order/persistence/default-open shape changes |
| B | summary-header structure + shared class present | NEW source-text pin the test-author adds (summary carries the new class/indicator) | the facelift structure regresses to the plain summary |
| C | the redundant element (run bar / `.runBarContext`) is GONE; nothing reads its state | rewritten run-bar pins + a NEW "run bar absent from header" pin; consumer trace in section 4 | the element survives, OR a consumer the removal orphaned breaks |
| C | the assignment select + its onAssignmentChange wiring still present (NOT removed) | existing grid/wiring pins | the load-bearing select is removed by mistake |
| all | repo-grades.module.css < 1000 | `src/file-size-ceiling.structure.test.ts` | the net CSS delta breaches the ceiling |

---

## 9. Triage, leverage, diagnostics (this seat's notes to the AC seat)

- **Leverage claim: NONE owed.** This is a visual/UX pass (compaction, facelift)
  plus one removal - not a new capability a user reaches. Per seats.md
  (Acceptance criteria) a refactor/visual change makes no leverage claim; record
  THAT as the fired trigger. (C) removes a surface; (A)/(B) re-dress existing
  ones.
- **Diagnostics representation: NONE owed, and stated.** No new data path and no
  new failure mode is introduced (DEV_LOOP "Diagnostics representation": a pure
  presentational change may carry none, but the absence must be stated - it is,
  here).
- **Seats that run:** Visual/aesthetic and Accessibility (wave 3) - any layout/
  spacing change and any markup change to the header/summary. User experience -
  the summary affordance and the de-dup change what the user sees/clicks.
  Architect (this pass) - (C) is a SHAPE decision (which surface owns the
  single-folder Grade/Post). Security/Reliability/Data/Operability triage OUT: no
  new egress, no persisted-shape change, no failure mode, no owner config - the
  only persisted keys touched are already-shipped (`ta-repo-grades-setup-open`,
  `ta-repo-grades-target-branch`, `ta-repo-grades-folder`), unchanged.

---

## 10. Residual register and escalations

Each residual names an owner, an instrument, and the step that measures it.

- **RES-1 (owner decision, blocks the (C) build only):** which surface is the
  owner's "redundant portion" and which variant (C1 remove run bar / C2 remove
  run-bar context / C3 slim grid header). Owner decides against the real
  screenshot. Instrument: the owner-walk of the single-folder header after the
  chosen variant. Step: the (C) build. Recommendation on record: C2 (or C1 if
  the pinned Grade/Post is not wanted). This is the fork that cannot be settled
  from code because the owner's screenshot is absent from the session images dir.
- **RES-2 (owner/orchestrator scope decision):** the wave's write set is wider
  than the named four - it necessarily includes RepoGradesRunBar.tsx and the 5
  run-bar test pins (C), and OPTIONALLY LinkUsernamesPanel.tsx (B-fork-2) and
  RepoGradesFolderPicker.tsx (A-lever-4). Decide: one wider wave, or split (C)
  into its own build. Instrument: `git status --short` vs the dispatched
  assignment at the wave gate. Step: wave dispatch. Recommendation: one wider
  wave with the full write set in section 7, built C->A->B.
- **RES-3 (measurement, at the push):** re-measure
  `@(Get-Content repo-grades.module.css).Count` after (A)+(B); if >= 1000, take
  the split in section 6 before the push. Owner: the build implementer.
  Instrument: `src/file-size-ceiling.structure.test.ts`. Step: the wave gate.
- **RES-4 (relocation, B-fork-2 if deferred):** if full nested-disclosure
  consistency is deferred, the Link-usernames summary restyle is owed as a
  follow-up row against LinkUsernamesPanel.tsx. Owner: orchestrator to file the
  row. Instrument: a source-text pin on the shared summary class. Step: a later
  build. (A residual not in docs/BACKLOG.md does not exist - the orchestrator
  must file it if this fork is taken.)

None of RES-1..RES-4 is an agent-startable blocker for THIS read-only scope;
they are decisions and measurements that land at build time.
