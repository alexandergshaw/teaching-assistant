# Repo-grader smoothing W3 SURFACE - test notes

Seat: `loop-test-author` (Opus), 2026-10-04. Backlog row A7 (Priority 4: the
scroll-distance / cursor-travel cut for the Repo Grades view, co-equal paramount
with click count). RULING X-1 governs the acceptance number: interactions per
graded repo, setup counted separately from steady state. Constraint carried from
the owner and the scope: smoother and cheaper WITHOUT dropping any confirm or
guard - click cost is never traded against a confirmation step.

Consumer: a `loop-implementer` writes the production + test code from these
notes; a fresh `loop-checker` reads them first. I author notes only - no
production or test code.

W1 (run-plan label leaf `repoGradesRunPlan.ts`, 07d32c99) and W2 (persistence +
single-course default + two disclosures, 3beaf19b, verify SHIP a21acaa0) have
both shipped and verified. This is W3.

## 0. What governs, and every quantity's command

`docs/repo-grader-smooth-scope.md` governs the surface boundary, the guards, the
mechanisms (R1 run bar, R4 picker regroup) and the acceptance criteria (AC1-AC10).
I diverge from it nowhere; where the scope leaves a choice open (sticky placement,
where course/folder pickers live, where the plan counts are computed) I ROUTE it
as a fork in section 3 and give an instrument that measures the result WHICHEVER
way it resolves, rather than adopting a value silently.

Every quantity below names its command, measured in THIS checkout at HEAD
(`@(Get-Content <f>).Count` in PowerShell - the mandated instrument; `Measure-Object
-Line` reads 42 low on one file in this repo):

| File | Lines | Role in W3 |
|---|---|---|
| `src/app/components/repo-grades/index.tsx` | 948 | mounts the run bar; the BINDING size constraint (ceiling 1000) |
| `src/app/components/repo-grades/RepoGradesGrid.tsx` | 641 | holds `ColumnHeaderControls` (the reference pattern the run bar lifts); W3 should NOT need to touch it - see section 3 fork C |
| `src/app/components/repo-grades/RepoGradesControls.tsx` | 675 | R4 picker regroup, if done here |
| `src/app/components/repo-grades/repo-grades.module.css` | 864 | new sticky class (headroom 136 to the 1000 ceiling; it is on NO page.module.css guard - see section 7 trap 2) |

- `src/file-size-ceiling.structure.test.ts` has `LIMIT = 1000` (line 41) and
  covers every `src/**/*.tsx|ts`. index.tsx at 948 has 52 lines of hard headroom.
- The R-2 frozen-roots canary (`repoGradesFeedbackAndFiles.wiring.test.ts:304-352`)
  lists **34** basenames today and asserts `directoryRoots(repo-grades)` equals
  them exactly (`:346` says "the 34 frozen basenames"). A NEW `RepoGradesRunBar.tsx`
  makes it 35 - the bump is a REQ (section 5 W3-R6), same commit as the file.
- The 18-key storage canary (`repoGradesStorageKeys.structure.test.ts`) scans
  `repoGradesUiState.ts` only. W3 adds NO `ta-` key (the run bar is derived /
  display-only, shown only when one folder is selected), so this canary stays at
  18 and is NOT touched - included in the gate (section 9) to PROVE no stray key
  slipped in.
- The CSS-orphan ratchet (`page-module-css-orphan-classes.test.ts`) is pinned at
  `PINNED_ORPHAN_CEILING = 118` with BOTH `toBeLessThanOrEqual` AND `toBe`. It
  auto-discovers every `*.module.css` under `src/`. A new sticky class that is
  REFERENCED via `styles.<name>` adds to `defined` AND `referenced`, so the orphan
  count stays 118. A new class DEFINED-but-never-APPLIED raises it to 119 and reds
  the gate - which is the ratchet doing exactly the job W3-F-STICKY needs it to.
  This test also REGENERATES `docs/css-orphans.md` (it writes it); that file is
  dirty in the working tree now, so coordinate - the regeneration is expected.

## 1. The hard constraint on every instrument here

NOTHING renders under vitest (node-env; it collects only `src/**/*.test.ts`, never
mounts a component). Every firm pin below is a **source-text / CSS-structure** pin
or a **pure-function** pin. A green suite proves the MECHANISM is in the source:
the run bar exists and is mounted, carries a specific sticky class whose own rule
has `position: sticky` + a `top`, groups Grade and Post, and routes clicks through
the existing confirmed handlers. It NEVER proves a pixel moved, a bar stuck, focus
landed, or the scroll shortened. Every distance/position/click criterion (AC4,
AC5, AC6, AC7) is therefore an OWNER criterion, routed to the SMOOTH-BASELINE walk
(`docs/run-setup-baseline-walk.md` section 5, the DevTools snippet in scope AC5).
I did NOT invent a vitest pixel pin for any distance (scope's instruction; residual
R1/R2).

## 2. W3 cut decision - ONE wave, W4/W5/W6 stay OUT

**Decision: W3 is a single wave. No W3b.** The scope's wave list keeps the
assignment-suggestion chip (W4, fork F2), the persisted graded-results store (W5,
fork F3) and the GithubGradingPanel surface (W6) as separate LATER waves. W3's own
write set - `RepoGradesRunBar.tsx` (new), `index.tsx` (mount), `RepoGradesControls.tsx`
(R4 regroup), `repo-grades.module.css` (sticky class), plus the two structure tests
- is shared/sequential by file (Repo Grades waves share index/Controls/css and are
SEQUENTIAL per the scope and the backlog row). Splitting into W3b buys zero
parallelism and costs a push. The three W3 deliverables - the run bar (R1), the
sticky behaviour, and the picker regroup (R4) - all land together.

**Explicitly NOT in W3** (record as out-of-scope, not dropped):
- W4 assignment-suggestion chip (fork F2). Separate wave.
- W5 persisted graded cell-edits across reload (fork F3). Needs a data-seat pass
  first (residual R4). Separate wave.
- W6 GithubGradingPanel run row + persistence. Path-disjoint; separate wave/row.
- The Grade-all confirm discrepancy (`RG-GRADEALL-CONFIRM`, backlog row, OWNER).
  **W3 neither adds nor removes any confirm.** It is a separate owner item; the
  one interaction with W3 is sequencing (both edit shared Repo Grades files), not
  behaviour. Pinned as a non-regression below (W3-R5), never touched as a feature.

## 3. Routed forks - name the conflict, adopt neither value silently

Three choices the scope leaves open. None blocks the firm pins; each gets an
instrument that measures the result either way.

### FORK A - sticky placement: top vs bottom (the loosest pin; flagged in section 6)

The scope R1 puts the run bar "directly under the header" and calls sticky
"optional (R2)" - it does NOT pick `top` vs `bottom`. Scope DOM order ("under the
header") and the grid `<thead>`'s own `top: 0` idiom both point to **sticky-top**.
AC7 (Post reachable after scrolling through graded rows) is satisfied by a
sticky-top bar that stays pinned to the viewport top as rows scroll under it.

- **Recommended reading (acted on in the firm pin):** `position: sticky; top: 0`
  (or a small token offset), sticky-TOP. If the owner/architect wants sticky-bottom
  the only change is the `top`/`bottom` property in the one class rule; W3-F-STICKY's
  slice pin asserts `position: sticky` + a vertical offset (`top:` OR `bottom:`), so
  it measures either placement.
- **Terminating question (owner/orchestrator):** the run-bar Start-of-run scroll cut
  is achieved by (a) a sticky-TOP bar [recommended, built], or (b) sticky-bottom.
  Either answer ends it.

### FORK B - where the course/folder PICKERS live (R1 vs R4 overlap)

R1 lists the run bar's contents as "course, folder, mapped assignment name and
rubric line, Grade all, Post N". R4 separately says "group the cheap pickers
(course, repo filter + Refresh, folder, sort) on one wrapping flex row". These can
be read two ways: the run bar DUPLICATES course/folder as its own pickers, OR the
run bar shows the folder/assignment as CONTEXT LABELS while the actual pickers are
the R4-regrouped high row (the existing `#repo-grades-course` / `#repo-grades-folder`
controls in `RepoGradesControls.tsx`).

- **Why it matters for the instrument:** AC5/AC6 (owner) run `getBoundingClientRect`
  on the ids `#repo-grades-course` and `#repo-grades-folder`. Those ids are the
  EXISTING pickers in `RepoGradesControls.tsx:359,413`. The mechanism that satisfies
  AC5 is moving those existing pickers UP (R4), NOT minting duplicate course/folder
  controls in the run bar (which would create a second `#repo-grades-course` - an
  invalid duplicate id, and the snippet's `querySelector` would read only the first).
- **Recommended reading:** the EXISTING pickers stay the single source (one id each),
  R4 raises them; the run bar carries the RUN controls (mapped-assignment name,
  rubric line, Grade, Post) + the folder NAME as read-only context. No duplicate ids.
- **Terminating question (owner/orchestrator/architect):** does the run bar (a) show
  course/folder as read-only context with the real pickers in the R4 row [recommended],
  or (b) host its own course/folder pickers? If (b), the implementer must give the
  run bar's pickers DISTINCT ids and the AC5 owner snippet must be told which id to
  measure. Either ends it.
- **Firm pins are unaffected:** the run bar exists, is sticky, groups Grade/Post, and
  routes clicks through the confirmed handlers regardless of A or B.

### FORK C - where the run bar's plan COUNTS are computed (AC2 count parity)

The run bar's Grade/Post labels must never disagree with the grid column header's
(AC2). W1 already guarantees the LABEL FORMATTING is shared: both call
`repoGradesRunPlanLabels` (the pure leaf, frozen-literal oracle in
`repoGradesRunPlan.test.ts`). The remaining risk is the INPUTS: `gradeTargetCount`
(`buildBulkGradePlan(...).targets.length`), `postableCount`
(`buildRepoGradePostPlan(...).postable.length`), `scopedToSelection`, `scanTruncated`,
`alreadyAttempted`, and `pointsPossible` (`pointsPossibleForColumn`, currently a
NON-exported local in `RepoGradesGrid.tsx:74`).

- **Recommended reading:** the run bar RECOMPUTES the counts inline from the SAME
  pure functions the grid uses (`buildBulkGradePlan`, `repoGradePostCandidateRows`,
  `buildRepoGradePostPlan`, `scopeRepoGradeRowsToSelection`), and recomputes the
  3-line `pointsPossibleForColumn` inline. This adds ZERO new coupling and ZERO new
  root file and does NOT edit the grid. The duplication is 3 lines; divergence is
  caught by W3-R2 (both surfaces feed the leaf from the same builders).
- **Alternative (architect may prefer):** extract `pointsPossibleForColumn` into a
  shared pure module so both surfaces import one copy. COST: a grid edit (remove the
  local) OR a new root file (another R-2 bump 35->36) OR editing `repoGradesPosting.ts`
  (which the scope says NOT to edit for collision reasons). If this path is chosen, the
  new/edited file joins the write set and the gate.
- **Terminating question (architect):** recompute inline [recommended, no new coupling]
  or extract-and-share? Either ends it; the AC2 instrument (W3-R2) is identical either
  way - it asserts the run bar feeds `repoGradesRunPlanLabels` from the same plan
  builders, not that the counts live in any one place.

## 4. Executable here vs argued-only

**Executable now (machine, this environment):** W3-R1 (mount + browser-safe
closure), W3-R2 (label parity via shared leaf + same builders), W3-R3 (Grade/Post
grouped + click wiring + no direct post action), W3-R4 (sticky class slice +
applied + orphan-referenced), W3-R5 (guards/confirm non-regression + the
postCanvasGradesAction count extended to the run bar), W3-R6 (R-2 bump + ceiling),
W3-R7 (R4 regroup containment proxy).

**Argued only, NOT asserted as verified:** that the bar actually STICKS at runtime
(an ancestor `overflow` on `TabShell`/`page.tsx` could defeat `position: sticky`,
unverifiable here - scope residual R2), that any pixel distance fell (AC5), that the
cursor band tightened (AC6), that Post is reachable without scrolling up (AC7), that
the pickers sit on one visual row (AC6), and the click counts (AC4, RULING X-1).
These are OWNER claims, routed in section 8. The source/CSS pins are proxies for
"the mechanism is present," never proof the pixel moved. Labelled argued wherever
they appear.

## 5. Numbered requirements - object, instrument, direction, sabotage

Governance for ALL pins below:
- New/changed source-text pins go into the EXISTING
  `src/app/components/repo-grades/repoGrades.wiring.test.ts`, reusing its own
  `stripComments` helper at `:482-484` (the UNANCHORED CRLF-safe
  `.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,"")` form - NOT the
  trailing-comment-blind anchored `/^[ \t]*\/\/.*$/gm`; no `/s` dotAll flag). That
  file is ALREADY classified in `strip-comments-agreement.structure.test.ts:379`,
  so adding pins there needs NO classification move. Do NOT create a new `*.test.ts`
  that mentions the literal `stripComments` (it would red the agreement gate
  repo-wide until classified). The R-2 bump goes in `repoGradesFeedbackAndFiles.wiring.test.ts`.
- CSS-structure pins strip CSS comments with `.replace(/\/\*[\s\S]*?\*\//g,"")` (the
  form the orphan test itself uses at `:87`), then slice by anchor.
- Every sabotage is a NAMED mutation of PRODUCTION source (never the test), applied
  with a `cp` backup and restored FROM THE COPY (never `git checkout --` on an
  uncommitted file - it reverts to the index and destroys the chunk's work). One
  `npx tsc --noEmit` caller at a time; no two sabotage runs on the tree concurrently.
- Anchor discipline: every `indexOf`/slice asserts BOTH ends resolve (`> -1`) BEFORE
  comparing. An unresolved `indexOf` + `slice(start, -1)` silently widens to nearly
  the whole file (the "slice instrument that silently widened" defect class). No
  sabotage may DESTROY the anchor it searches for - the intended mutation keeps the
  anchor and changes the fact.

Let `RUN_BAR_SOURCE = readFileSync(".../RepoGradesRunBar.tsx")`,
`CSS = readFileSync(".../repo-grades.module.css")`, `INDEX = readFileSync(".../index.tsx")`.

### W3-R1 (AC mount) - the run bar exists, is mounted, imports only browser-safe modules

- **Object:** `RepoGradesRunBar.tsx` and its mount in `index.tsx`.
- **Instrument (source-text, in `repoGrades.wiring.test.ts`):**
  1. `INDEX` imports the component: `/import RepoGradesRunBar from "\.\/RepoGradesRunBar"/`
     over stripped source.
  2. `INDEX` renders it: `/<RepoGradesRunBar\b/` over stripped source.
  3. The mount is GATED on a single folder being selected (scope R1: "shows only when
     one folder is selected"): the `<RepoGradesRunBar` JSX sits inside a conditional
     referencing `currentSelectedFolder !== ALL_FOLDERS` (slice the render region from
     the `<RepoGradesRunBar` tag back to the nearest preceding `{` guard and assert it
     contains `currentSelectedFolder` and `ALL_FOLDERS`; assert both anchors resolve).
  4. Client-boundary closure stays clean: this is ALREADY enforced by the R-1/R-3/R-4
     walk in `repoGradesFeedbackAndFiles.wiring.test.ts:354-367` once the new root is in
     the frozen set (W3-R6) - it asserts `result.violations/unallowed/unresolvable` are
     all `[]` over `directoryRoots(repo-grades)`. The run bar must import only the same
     browser-safe leaves the grid already imports (`repoGradesRunPlan`,
     `repoGradesPosting`, `repoGradesBulkGrade`, `repoGradesCellEdits`,
     `repoGradesFolderSelection`, MUI `Button`) and no `*Action` server module.
- **Direction of failure:** RED if the component is imported-not-rendered (dead mount),
  rendered unconditionally (not folder-gated), or reaches a server-only leaf.
- **Sabotage:** delete the `<RepoGradesRunBar ... />` JSX from `index.tsx` (leave the
  import). Expect RED on pin 2 (rendered). Restore -> GREEN. **Discriminates** the
  mount. Second sabotage (gate): remove the `currentSelectedFolder !== ALL_FOLDERS`
  guard so the bar mounts always -> RED on pin 3. **Discriminates** the folder gate.
- **Note:** pins 1-3 are NECESSARY-not-sufficient for "the bar is on screen" - that it
  actually paints is argued (nothing renders). Say so in the pin comment.

### W3-R2 (AC2 count parity) - run bar and column header share ONE label source and ONE set of plan builders

- **Object:** the label wiring in `RepoGradesRunBar.tsx` vs `RepoGradesGrid.tsx`'s
  `ColumnHeaderControls`.
- **Instrument (source-text):**
  1. The run bar derives its labels from the shared leaf: assert `RUN_BAR_SOURCE`
     imports `repoGradesRunPlanLabels` from `./repoGradesRunPlan` AND consumes both
     returned fields - `/[:\s]gradeLabel\b/` and `/[:\s]postLabel\b/` present, mirroring
     the grid's own consume pins (`repoGrades.wiring.test.ts:725-733`).
  2. The run bar feeds that leaf inputs from the SAME pure builders the grid uses:
     `RUN_BAR_SOURCE` contains `buildBulkGradePlan(` (for `gradeTargetCount`),
     `buildRepoGradePostPlan(` and `repoGradePostCandidateRows(` (for `postableCount`),
     and `scopeRepoGradeRowsToSelection(` (the selection scoping). These are the exact
     functions `ColumnHeaderControls` calls (`RepoGradesGrid.tsx:318-363`).
  3. The run bar does NOT re-inline a label literal: over stripped `RUN_BAR_SOURCE`,
     `not.toContain('alreadyAttempted ? "Re-post" : "Post"')` and
     `not.toContain("Nothing to grade in")` (the formatting lives in the leaf, pinned by
     W1's oracle - re-inlining would fork it).
- **The authority for the label STRINGS is W1's frozen-literal oracle**
  (`repoGradesRunPlan.test.ts`, 15 rows). I do NOT re-freeze the label strings in a new
  oracle here - a second copy could drift from W1's and become a self-comparison
  tautology. The run bar INHERITS W1's oracle by consuming the leaf. True simultaneous
  runtime parity (same number on both surfaces at once) is argued/OWNER (nothing renders).
- **Direction of failure:** RED if the run bar hand-formats a label instead of calling
  the leaf, or computes a count from anything other than the shared builders.
- **Sabotage:** in `RepoGradesRunBar.tsx`, replace the `repoGradesRunPlanLabels(...)`
  call's `postLabel` consumption with an inline `` `Post ${postableCount} grade(s)` ``
  literal (the pre-W1 shape). Expect RED on pin 1 (postLabel no longer consumed) and/or
  pin 3 (if the inlined ternary appears). Restore -> GREEN. **Discriminates** the
  shared-leaf wiring. Second sabotage: change the run bar's `buildBulkGradePlan` input
  from `selected`/`bulkSelectionOnly` to a hard-coded `selectionOnly: false` -> this does
  NOT red any source pin (the call is still present), so I state plainly: **this does not
  discriminate at the source level.** Runtime count parity under selection is an OWNER
  check (section 8, RW3-2). The source pins prove the same functions are called, not that
  identical arguments flow - that is the honest limit of a no-render instrument, declared.

### W3-R3 (AC3 one handler + grouping) - Grade and Post live in ONE run-bar wrapper, wired only to onGradeColumn/onPostColumn

- **Object:** the run bar's action row.
- **Instrument (source-text, slice-bound):**
  1. GROUPING: slice the single run-row wrapper by its own anchors over stripped
     `RUN_BAR_SOURCE` - the wrapper element that holds the Grade control - and assert
     BOTH the Grade button and the Post button fall inside that ONE slice. Bound the
     slice at BOTH ends (the wrapper's opening tag to its matching close or the next
     sibling anchor) and assert both anchors resolve. (Model: the walkthrough W3-R2
     one-run-row slice; the exact "slice widened to whole file" guard.)
  2. CLICK WIRING: the Grade button's `onClick` reaches `onGradeColumn(` and the Post
     button's reaches `onPostColumn(` - and the run bar calls NEITHER `postCanvasGradesAction`
     NOR `gradeRepoAction` directly: `not.toContain("postCanvasGradesAction(")` and
     `not.toContain("gradeRepoAction(")` over `RUN_BAR_SOURCE`. (AC3 + AC1: the run bar
     is a plain forward of the two confirmed handlers, exactly as the column header is.)
  3. `index.tsx` passes the real handlers to the run bar: `INDEX` contains
     `onGradeColumn={handleGradeColumn}` and `onPostColumn={handlePostColumn}` reaching
     the `<RepoGradesRunBar` mount (they already reach `<RepoGradesGrid`; assert the
     run-bar mount slice contains both prop spellings).
- **Direction of failure:** RED if either button is outside the run-row wrapper, if a
  button's onClick does not reach the correct handler, or if the run bar calls a grading
  / posting action itself.
- **Sabotage:** move the Post `<Button>` out of the run-row wrapper into its own sibling
  `<div>`. Expect RED on pin 1 (Post index not within the wrapper slice), both anchors
  still resolving. Restore -> GREEN. **Discriminates** the grouping. Second sabotage:
  change the Post button's `onClick` to call `postCanvasGradesAction(` directly (the exact
  guard-bypass this exists to catch). Expect RED on pin 2. Restore -> GREEN.
  **Discriminates** - and this is also caught by W3-R5's count pin.

### W3-R4 (sticky mechanism) - the run bar carries a SPECIFIC class whose OWN rule has position:sticky + an offset, and that class is applied and orphan-referenced

THIS IS THE LOOSEST PIN - see section 6. The naive `expect(CSS).toMatch(/position:\s*sticky/)`
PASSES on the existing `.grid thead th` rule (`repo-grades.module.css:50-57`) and would
ship a non-sticky run bar green. The robust three-part construction:

- **Object:** a new class (call it `.runBar` - the implementer picks the exact name; the
  pin captures whatever name is used) in `repo-grades.module.css`, the run-bar element in
  `RepoGradesRunBar.tsx`, and the orphan ratchet.
- **Instrument:**
  1. COMPONENT APPLIES THE CLASS: resolve the run-bar element by a stable anchor (the
     wrapper holding the Grade control, i.e. the same wrapper W3-R3 slices) and assert it
     carries a specific class token, e.g. `className={styles.runBar}` or
     `` className={`...${styles.runBar}...`} `` - capture the exact local name after
     `styles.`. Call it `STICKY_CLASS`.
  2. THE CLASS'S OWN RULE IS STICKY: in `CSS`, find `.${STICKY_CLASS} {` (assert `> -1`),
     slice from there to its matching closing `}` (assert the close `> -1`), and assert
     the SLICE contains `position: sticky` (allowing whitespace: `/position:\s*sticky/`)
     AND a vertical offset (`/\btop:/` OR `/\bbottom:/`, to measure either FORK A
     placement). Do NOT match `position: sticky` anywhere else in the file.
  3. ORPHAN RATCHET FORCES THE REFERENCE: `page-module-css-orphan-classes.test.ts` must
     stay at 118. Because pin 1 references `styles.STICKY_CLASS`, the class is counted as
     referenced and the count holds. A class defined-but-unapplied raises it to 119 and
     reds that gate independently.
- **Direction of failure:** RED if the sticky class is not applied to the run-bar wrapper
  (pin 1), its rule lacks `position: sticky` or an offset (pin 2), or it is defined but
  unreferenced (pin 3 / orphan gate rises to 119).
- **Sabotage (three, one per the brief's named mutations):**
  - Change the class's rule `position: sticky` -> `position: static` in the CSS. Expect
    RED on pin 2 (CSS slice). Restore -> GREEN. **Discriminates** sticky-removed.
  - Remove `styles.runBar` from the run-bar wrapper (apply it to nothing, or to a
    non-run-bar element). Expect RED on pin 1 (component) AND the orphan ratchet rises to
    119 (pin 3). Restore -> GREEN. **Discriminates** class-applied-to-wrong-element.
  - Delete the offset (`top:`/`bottom:`) line from the class rule. Expect RED on pin 2's
    offset assertion. Restore -> GREEN. **Discriminates** the offset.
- **This is a MECHANISM PROXY, argued, not proof the bar sticks.** `position: sticky`
  only works if no ancestor clips with `overflow` and the element has room - neither
  checkable here (scope residual R2). The REAL test is OWNER AC7 (section 8). Say so in
  the pin's own comment.

### W3-R5 (AC1 guards + confirm non-regression) - no confirm or guard dropped; the run bar adds no new post path

- **Object:** the Post confirm, the two `postCanvasGradesAction` call sites, and the
  W2/W1 guards.
- **Instrument:**
  1. EXTEND the existing count pin (`repoGrades.wiring.test.ts:740-745`) to cover the new
     surface: add `expect(countCalls(runBarSource)).toBe(0)` alongside the existing
     `hookSource == 2`, `gridSource == 0`, `runPlanSource == 0`. (The confirm itself lives
     in `useRepoGradesGradingActions.ts:522` inside `handlePostColumn`, UNCHANGED - W3 does
     NOT edit that file; the run bar inherits the confirm by calling `onPostColumn`.)
  2. The existing confirm-wording pin (`:439-446`) and the two-call-site pin stay green
     untouched (W3 edits neither the hook nor the confirm sentence).
  3. The W2 collapse/confirm pins (`:844-878`) stay green: the run bar does not remove the
     settings `<details>`, the LinkUsernamesPanel collapse, the confirm-all `window.confirm`,
     or the bulk-selection checkbox.
- **Direction of failure:** RED if the run bar calls `postCanvasGradesAction` (count rises
  above 0 on the new surface, or the hook count moves off 2), if the confirm sentence
  changes, or if any W2 guard pin breaks.
- **Sabotage:** already covered by W3-R3's second sabotage (run bar calling
  `postCanvasGradesAction` directly -> count pin RED, `runBarSource != 0`). **Discriminates.**
  Appending an assignment-name sentence AFTER the pinned confirm substring is allowed and is
  a safety add (scope AC1) - the pin uses `toContain` on the frozen substring, so a suffix
  does not red it.

### W3-R6 (R-2 frozen roots + ceiling) - the new root is registered; index.tsx stays under the ceiling

- **Object:** `repoGradesFeedbackAndFiles.wiring.test.ts`'s `FROZEN_REPO_GRADES_ROOTS`
  and `@(Get-Content index.tsx).Count`.
- **Instrument (two, distinct):**
  1. R-2 BUMP, SAME COMMIT: add `"RepoGradesRunBar.tsx"` to `FROZEN_REPO_GRADES_ROOTS`
     (`:304-343`) - the list grows 34 -> 35 - and update the `it(...)` title at `:346`
     ("the 34 frozen basenames" -> 35). This is the exact lesson the backlog records
     (`assignment-must-include-the-wiring-file`, generalized: a wave that ADDS a non-test
     `.ts/.tsx` to a directory MUST bump that directory's frozen-roots canary in the SAME
     commit). W1 left main RED by missing this; do not repeat it.
  2. CEILING (machine): `src/file-size-ceiling.structure.test.ts` (`LIMIT = 1000`) must
     stay green - no W3 file may exceed 1000. index.tsx is 948; the mount + props add is
     estimated +12 to +25.
  3. INTERIM CAP (hand-measured gate step, NOT a vitest assert): `@(Get-Content
     src/app/components/repo-grades/index.tsx).Count <= 960` (the cap W2 held at, 948).
     If the mount push past 960, EXTRACT FIRST - see the size plan in section 7 trap 1.
- **Direction of failure:** RED if R-2 is not bumped with the file (the canary goes RED:
  derived set has 35, frozen list has 34), if any file exceeds 1000 (ceiling), or (gate
  step) if index.tsx exceeds 960 without an extraction.
- **Sabotage:** add the new root file WITHOUT bumping `FROZEN_REPO_GRADES_ROOTS` -> R-2
  canary RED (`directoryRoots` returns 35, frozen is 34). Restore (add the entry) ->
  GREEN. **Discriminates** - this IS the canary's job, and it is bidirectional (bump
  without the file also reds: frozen 35 vs derived 34).

### W3-R7 (R4 picker regroup) - the cheap pickers are wrapped in ONE container, reusing an existing shared class

- **Object:** `RepoGradesControls.tsx` and `page.module.css` (NOT edited - reuse only).
- **Instrument (source-text containment proxy, in `repoGrades.wiring.test.ts`):** over
  stripped `RepoGradesControls.tsx`, assert the course field (`htmlFor="repo-grades-course"`),
  the repo-filter field (`htmlFor="repo-grades-org-prefix"`), the folder field
  (`htmlFor="repo-grades-folder"`) and the sort field (`htmlFor="repo-grades-sort"`) all
  fall inside ONE wrapper slice that opens with an EXISTING shared class
  (`className={pageStyles.adaptRow}` or `className={pageStyles.ghActions}` - the scope names
  `.adaptRow`/`.ghActions`; the implementer picks; the pin captures the class used and
  asserts it is one the file ALREADY references or that already exists in `page.module.css`,
  so NO new class is added to the ratcheted `page.module.css`). Bound the slice at both ends;
  assert all four `htmlFor` anchors resolve and sit inside it.
- **Direction of failure:** RED if the four pickers are not inside one container, or if the
  container uses a NEW `page.module.css` class (which would need the page-module ratchet
  bumped - the scope forbids growing `page.module.css`).
- **Sabotage:** move the sort field's `<div className={styles.field}>` OUTSIDE the regroup
  wrapper (leave it after the wrapper's close). Expect RED (sort's `htmlFor` index not
  within the wrapper slice). Restore -> GREEN. **Discriminates** the grouping.
- **HONEST LIMIT (argued):** this is a CONTAINMENT proxy. "They render on ONE visual row"
  depends on the flex class behaving and the viewport width - OWNER AC6 (section 8). A green
  containment pin does not prove a single row. Declared.

## 6. The ONE pin most likely to be built loose - flag for the checker

**W3-R4 (sticky).** The failure is `expect(CSS).toMatch(/position:\s*sticky/)`: it passes
on the pre-existing `.grid thead th` rule (`repo-grades.module.css:50-57`) and passes even
when the run bar's own class is never sticky, or the class is defined but never applied -
the "test that could not fail" / "slice that silently widened" class, and it ships a
non-sticky bar green. The robust construction in W3-R4 defeats all three: (1) resolve the
run-bar element and capture its SPECIFIC class, (2) slice THAT class's own rule block (both
anchors resolving) and assert `position: sticky` + an offset INSIDE the slice only, (3) let
the orphan ratchet force the class to be referenced. Checker: verify the CSS slice is
bounded at BOTH ends and does not fall back to matching `position: sticky` file-wide, and
that the component pin captures the exact same class the CSS slice reads.

## 7. Instrument traps specific to this wave

**Trap 1 - index.tsx size / what moves OUT if the mount pushes past 960.** index.tsx is 948.
The run bar as a SEPARATE component that absorbs its own plan computation (FORK C recommended
reading) keeps index.tsx's addition to just the mount JSX + a handful of props it ALREADY has
in scope (`displayedColumns[0]`/the selected column, `sortedRows`, `selected`, `cellEdits`,
`assignments`, `uiState.bulkSelectionOnly`, `scan?.truncated`, `handleGradeColumn`,
`handlePostColumn`) - estimated +12 to +25, landing ~960-973, under the 1000 ceiling. If it
lands over the 960 interim cap, the lowest-risk extraction target is the status/announcement
region (`index.tsx:841-894`: the `postSummary` `role="status"` block, the trends block, and
the folder-count `<p>`) into a small presentational child. CAUTION: a SECOND new component
file is a SECOND R-2 bump (35 -> 36) AND a new client-boundary closure member - prefer
reaching <=1000 with ONLY the one mandated new root (`RepoGradesRunBar.tsx`). The hard gate is
the 1000 ceiling (machine); <=960 is a recommended gate step the architect may trade off, but
the ceiling is non-negotiable.

**Trap 2 - `repo-grades.module.css` is NOT on the `page.module.css` guard, but IS on the
orphan ratchet.** Its own header (`:1-19`) says it is a separate import so
`page-module-css-classes.test.ts`'s scope is unaffected - so growing it does NOT trip that
guard. But `page-module-css-orphan-classes.test.ts` auto-discovers EVERY `*.module.css` under
`src/`, so the new sticky class is subject to the 118 ratchet (W3-R4 pin 3). Do NOT touch the
7034-line `page.module.css` (scope collision note); R4's regroup reuses EXISTING page classes.

**Trap 3 - the owner's AC5/AC7 snippet depends on the run-bar button TEXT prefixes, which W1's
oracle freezes.** The scope AC5 snippet filters buttons by
`/^(Grade|Nothing to grade|Post|Re-post)/`. The run bar's buttons match this automatically
BECAUSE they consume `repoGradesRunPlanLabels` (W1), whose outputs start with exactly those
prefixes (frozen in `repoGradesRunPlan.test.ts`). So the machine oracle (W1) and the owner
instrument (AC5 snippet) are wired to the same label source - W3-R2 keeping the run bar on the
leaf is also what keeps the owner's snippet able to find the button. Note this for the owner
walk; do not let the implementer hand-format a run-bar label (it would also hide it from the
snippet).

**Trap 4 - comment-stripping governance.** Put every new comment-stripped source pin in the
ALREADY-CLASSIFIED `repoGrades.wiring.test.ts`, reusing its `stripComments` (`:482`). Never
create a new `*.test.ts` mentioning the literal `stripComments` (it reds
`strip-comments-agreement.structure.test.ts` repo-wide until classified). No `/s` dotAll flag
(passes vitest, fails tsc TS1501 - use `[\s\S]`). No emojis in `docs/` or source (scanned). LF.

**Trap 5 - sabotage restore.** `cp`-backup the mutated production file; restore from the copy.
`git checkout --` on an uncommitted file reverts to the index and destroys the chunk's work.
One `npx tsc --noEmit` caller at a time; no two sabotage runs on the tree at once. A sabotage
must KEEP the anchor it searches for and change only the fact (W3-R1/R3/R4 all respect this).

## 8. Residual register - owner / instrument / step (numeric + runtime, all argued)

Missing any of owner + instrument + step, a residual is a deletion. These are the criteria NO
pin here can measure.

| ID | What is not proven by any machine pin | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| RW3-1 (AC5, scroll, co-equal) | `rect.bottom` of Course, Folder, Grade, Post all `<= 0.8 x innerHeight` (~614px at 768) at `scrollY=0`, on 1366x768 AND 1920x1080; baseline to beat ~1900-2000px | repo owner | scope AC5 DevTools snippet (`getBoundingClientRect` on `#repo-grades-course`, `#repo-grades-folder`, and the Grade/Post buttons filtered by text prefix) | SMOOTH-BASELINE walk (`docs/run-setup-baseline-walk.md` section 5): baseline before build, verify after W3. Proposal until ratified. |
| RW3-2 (AC2 runtime parity) | The run bar and the column header show the SAME Grade/Post numbers at the same moment, incl. under a selection | repo owner | open the one-folder view, read both; W3-R2 is the machine PROXY (same leaf + same builders) | SMOOTH-BASELINE walk / the W3 verify |
| RW3-3 (AC6, cursor, co-equal) | Centres of Course, Folder, Grade, Post within one band `<= 140px` tall and `<= 900px` wide at 1920 | repo owner | the AC5/AC6 snippet | SMOOTH-BASELINE walk. Depends on FORK B (which element is `#repo-grades-course`). |
| RW3-4 (AC7, sticky works) | Post is on screen after scrolling to the last graded row without scrolling up - i.e. the bar actually STICKS (no ancestor `overflow` clip on TabShell/page.tsx) | repo owner | browser scroll test | W3 verify; scope residual R2. W3-R4 proves the sticky CSS is present, not that it sticks. |
| RW3-5 (AC4 / RULING X-1) | Click counts per graded repo do not rise (P2=3 floor, P1/P3 unchanged or lower); every safety click still present | repo owner | count clicks on the scope section 1 convention, setup separate from steady state | SMOOTH-BASELINE walk / W3 verify. Argued; R8 (Typeahead 2-click) still unverified. |
| RW3-6 (FORK A) | sticky-top vs sticky-bottom placement | owner / orchestrator | the fork decision (section 3) | before the implementer fixes the offset property |
| RW3-7 (FORK B) | run bar shows course/folder as context vs hosts its own pickers (and thus which element the AC5 snippet measures) | owner / orchestrator / architect | the fork decision (section 3) | before the implementer builds the run bar's left side |
| RW3-8 (FORK C) | recompute plan counts inline vs extract `pointsPossibleForColumn` to share | architect | the fork decision (section 3) | before the implementer writes the run bar's count derivation; if extract, the write set + gate gain a file |
| RW3-9 (RG-GRADEALL-CONFIRM) | Whether Grade-all should gain a confirm | repo owner | separate backlog row (OWNER) | NOT W3. W3 neither adds nor removes it (W3-R5 pins non-regression). |

## 9. The gate command (explicit paths, every one produced-or-pre-existing)

Two or more files -> `npm run test:paths -- <p1> <p2> ...` ONLY (a raw multi-path
`vitest`/`npm test` silently drops any argument it does not match and exits 0; `--json`
eats the next path). Every path below was confirmed to exist in this checkout by `ls`.

```
npm run test:paths -- \
  src/app/components/repo-grades/repoGrades.wiring.test.ts \
  src/app/components/repo-grades/repoGrades.wiring.linking.test.ts \
  src/app/components/repo-grades/repoGradesSliceA.guards.test.ts \
  src/app/components/repo-grades/repoGradesSliceB.guards.test.ts \
  src/app/components/repo-grades/repoGradesRubricPicker.wiring.test.ts \
  src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts \
  src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts \
  src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts \
  src/app/components/repo-grades/repoGradesUiState.test.ts \
  src/app/components/repo-grades/repoGradesRunPlan.test.ts \
  src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts \
  src/app/components/componentStorageKeys.structure.test.ts \
  src/app/components/courses/page-module-css-orphan-classes.test.ts \
  src/file-size-ceiling.structure.test.ts \
  src/source-bytes.structure.test.ts \
  src/lib/no-emojis.test.ts \
  src/tools/strip-comments-agreement.structure.test.ts
```

Why each is included (no phantom path):
- `repoGrades.wiring.test.ts` - HOSTS the new W3 pins (R1/R2/R3/R5/R7) and the extended
  postCanvasGradesAction count; carries the W1 leaf pins and W2 collapse/confirm pins that must
  stay green.
- `repoGradesFeedbackAndFiles.wiring.test.ts` - the R-2 frozen-roots canary (34 -> 35, same
  commit) AND the client-boundary closure walk (the new root must reach zero server-only leaves).
  REQUIRED because W3 adds a root file - this is the exact test W1's gate omitted and left main
  red; it is non-negotiable in this gate.
- `repoGradesRunPlan.test.ts` - the W1 frozen-literal label oracle, the authority for the strings
  the run bar inherits; confirm still green (W3 does not change the leaf).
- `repoGradesStorageKeys.structure.test.ts` - 18-key exact-set canary; W3 adds NO key, so this
  proves no stray `ta-` literal slipped into `repoGradesUiState.ts`.
- `componentStorageKeys.structure.test.ts` - non-recursive top-level `ta-` canary (scope gate
  list); a stray key in a top-level component file reds it.
- `page-module-css-orphan-classes.test.ts` - REQUIRED because W3 adds a CSS class; the 118 ratchet
  forces the sticky class to be referenced. Regenerates `docs/css-orphans.md` (coordinate -
  already dirty in the tree).
- `src/file-size-ceiling.structure.test.ts` - the 1000 ceiling over all W3 files.
- `src/source-bytes.structure.test.ts`, `src/lib/no-emojis.test.ts` - escape-materialization and
  emoji canaries (scope gate list; new files are scanned).
- `strip-comments-agreement.structure.test.ts` - because W3 adds pins to a classified test; proves
  the classification set is still exact (no new unclassified mentioner).
- the remaining repo-grades guard/slice suites (`linking`, `SliceA`, `SliceB`, `RubricPicker`,
  `CodeExecution`, `ClassTrends`, `UiState`) - behaviour-preservation: W3 edits index/Controls/css,
  so re-run every suite that reads them.

Separately, outside the wrapper:
- HAND-MEASURE: `@(Get-Content src/app/components/repo-grades/index.tsx).Count` must be `<= 1000`
  (ceiling, also machine-checked) and `<= 960` (interim cap, gate step - extract first if over).
- `npx tsc --noEmit` ONCE (one caller; no `/s` flags - grep the test diff for `/s`/`/gs` before
  the type gate), and `npm run lint` BEFORE and AFTER against the SAME command (compare, not a
  literal) - the `preserve-manual-memoization` hazard (scope residual R6): moving hooks/JSX can
  fail lint on a callback never touched while tsc and the tests pass.
- Gate the wave on `git status --short` against the W3 write set, and confirm no
  `.claude/worktrees` copy was edited instead of the real tree (Glob returns the stale copy first).

## 10. Satisfiability

I did NOT stand up a throwaway tree. Every firm pin is a containment/slice/consume pin whose
satisfying source is a LIFT of the already-green `ColumnHeaderControls`
(`RepoGradesGrid.tsx:268-439`) - it already computes `buildBulkGradePlan`,
`buildRepoGradePostPlan`, `scopeRepoGradeRowsToSelection`, `pointsPossibleForColumn` and consumes
`repoGradesRunPlanLabels` exactly as W3-R2/R3 require, and that code is green against HEAD today.
The only genuinely new construction is: (a) a top-level sticky CSS class (W3-R4) - trivially
constructible, the file already has a working `position: sticky` rule to model; (b) the mount +
props in index.tsx (W3-R1/R6) - the props all exist in index.tsx's scope today; (c) the R4
containment regroup (W3-R7) - a wrapper around four existing fields reusing an existing class.
No novel algorithm. Satisfiability risk is concentrated in TWO places, both called out: (1)
index.tsx staying `<= 1000` (and ideally `<= 960`) while adding the mount - hand-measured gate,
trap 1; (2) the sticky-class slice resolving at BOTH ends and not falling back to the file-wide
`position: sticky` match - W3-R4 / section 6. If either cannot be satisfied, that is a finding for
the orchestrator, not a pin to quietly drop.
