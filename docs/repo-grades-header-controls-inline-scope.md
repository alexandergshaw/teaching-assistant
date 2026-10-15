# Scope: put the repo grading table's header controls in line

READ-ONLY scope. No production file is edited by this document. ASCII only
(instrument and canary in section 12). Authored by the UX/scoping seat; a
`loop-checker` reads it before any build.

Owner request, 2026-10-12, verbatim: "the controls for the header of the repo
grading table all need to be in line".

Every `file:line` below was opened in this session. Every quantity names the
command that produced it. Where a claim is arithmetic over declared CSS values
(nothing renders under vitest, `docs/loop/this-repo.md` section 6), it says
"derived" and is an owner-walk item, not a measurement.

---

## 0. Verdicts first (corrections to the brief, then the answer)

### 0a. Four premises in the dispatch brief that the tree does not support

| Premise | Verdict | Evidence (command) |
|---|---|---|
| "`repo-grades.module.css` is 983/1000, headroom ~17" | **WRONG. It is 999. Headroom is 1 line.** 983 was the count right after `3b2aa7a4`; Wave B (`f1a8aaee`) then added 16 lines. | `@(Get-Content src/app/components/repo-grades/repo-grades.module.css).Count` = 999 (disk); `@(git show HEAD:src/app/components/repo-grades/repo-grades.module.css).Count` = 999; `git show <sha>:<file> \| wc -l` for 3b2aa7a4 = 983, f1a8aaee = 999, 4022f857 = 983; `wc -l` on disk = 999; `git ls-files --eol` = `i/lf w/lf`. File is unmodified vs HEAD (`git status --short` shows only `docs/css-orphans.md` as modified, not this file). |
| "an alignment change is likely net-neutral" | **NOT for the design that actually fixes it.** The inline layout needs two new classes and a wrapper. Estimated gross +14 lines (section 5b) before comment condensation. A pure "change a few declarations" pass does not fix the real defects (section 2). | Counted from the CSS in section 4; builder re-measures. |
| "the 1000-line limit is a ceiling the suite enforces on this file" | **Not mechanically.** `src/file-size-ceiling.structure.test.ts` walks only `.ts`/`.tsx` (`listSourceFiles`, `:101-110`, regex `/\.(ts\|tsx)$/` at `:107`). I found no test that bounds a `.css` file's length. The 1000 limit on this stylesheet is the DEV_LOOP convention only, so this scope ADDS a pin (AC-12) rather than trusting the gate. | `grep -n "tsx" src/file-size-ceiling.structure.test.ts`; `grep -rln "\.css" src --include=*.test.ts \| xargs grep -ln "countLines\|LIMIT"` returned no CSS-length gate (hits were unrelated). |
| "the controls strip (`RepoGradesControls.tsx`) is part of the header" | **It is not.** It renders Course and Repo-name-filter inside the collapsible "Run setup" `<details>` (`index.tsx:618` `<details className={gridStyles.setupRegion}`, `:632` `<RepoGradesControls`). It is above the table, not in the table header. Treated as OUT of scope by default (FORK-1). | Opened `RepoGradesControls.tsx:331-381`, `index.tsx:616-703`. |

### 0b. The answer, in five lines

1. **Out of line today:** the sticky working header (`.stickyWorkingHeader`) holds 5 controls
   (Folder select, Refresh, Grade set, Target branch, Search) plus 3 conditional extras
   (grading banner, folder notices, grade-set chips/summary). They are not on one row at
   any common laptop width (derived: needs viewport >= ~1517px), they differ in
   height and font, and three of the extras sit INSIDE a control's stack so they push
   that control's input up off the shared baseline.
2. **Layout:** one control row, every control `height: var(--control-height-md)` (34px),
   bottom-aligned (`flex-end`, kept), fields `flex: 1 1 200px; max-width: 320px`, Refresh in a
   34px centred wrapper at the same 14px size; everything that is not a control (banner, folder
   notices, grade-set chips and "Showing N of M") moves to ONE full-width trailing line.
3. **Responsive:** wrap gracefully; NO horizontal scroll (it would clip the grade-set popup, and
   `repoGradesWaveASticky.structure.test.ts:146-149` forbids `overflow` on the header). At <= 700px
   additionally un-stick the working header, mirroring the thead un-stick already in that media
   block (`repo-grades.module.css:664-666`).
4. **Write set (5 files):** `repo-grades.module.css`, `RepoGradesStickyHeader.tsx`,
   `RepoGradesFolderPicker.tsx`, `RepoGradesGradeSetTypeahead.tsx`, plus ONE new test file.
   `index.tsx`, `RepoGradesControls.tsx` and `RepoGradesGrid.tsx` are NOT in it.
5. **Hard constraint:** the CSS file must END at or below 1000 lines; it starts at 999, so the build
   must pay for itself by condensing named comment blocks (section 5b). Pixel claims are owner-walk.

---

## 1. Measured facts

| Fact | Value | Command |
|---|---|---|
| HEAD | `6977493c` | `git rev-parse --short HEAD` |
| `3b2aa7a4` (the header cleanup) is an ancestor | yes | appears in `git log --oneline -6` |
| `repo-grades.module.css` | 999 | `@(Get-Content <f>).Count` (PowerShell), and `@(git show HEAD:<f>).Count` |
| `index.tsx` | 881 | node line count of file (`split('\n')` less trailing empty), cross-checked `wc -l` = 881 |
| `RepoGradesControls.tsx` | 583 | same |
| `RepoGradesStickyHeader.tsx` | 84 | `wc -l` |
| `RepoGradesFolderPicker.tsx` | 58 | `wc -l` |
| `RepoGradesGradeSetTypeahead.tsx` | 106 | `wc -l` |
| `repoGradesWaveASticky.structure.test.ts` | 294 | `wc -l` |
| Baseline of the pins this scope must keep green | 6 files, 157 tests passed | see 1a |
| Control-height tokens | sm 28 / md 34 / lg 40 px; comment "Every button/input/select in one cluster shares one." | `src/app/globals.css:98-101` |
| Space tokens | space-1 4, space-2 8, space-3 12, space-4 16 | `src/app/globals.css:88-91` |
| Body sets NO font-size (so the 16px UA default reaches `font: inherit` buttons) | zero `font-size` declarations in the `html,body` / `body` rules | `awk 'NR>=335 && NR<=360 && /font-size/' src/app/globals.css \| wc -l` = 0 (rules at `src/app/globals.css:340-358`); `.linkButton { font: inherit }` at `src/app/page.module.css:800-807` |
| MUI Button text-transform | `none` | `src/app/theme.ts:99` |
| Global reset: `* { box-sizing: border-box; padding: 0; margin: 0 }` | yes | `src/app/globals.css:359-362` |
| Tab container width | `min(100%, 96vw)`, max 1640px, 1px border | `src/app/page.module.css:15-21`; card padding `--space-6` (24px) at `:35` |

### 1a. Baseline wrapper run on HEAD (per-argument lines, `npm run test:paths`)

Command: `npm run test:paths -- src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts src/app/components/repo-grades/repoGradesWaveBSearch.structure.test.ts src/app/components/repo-grades/repoGradesWaveCTypeahead.structure.test.ts src/app/components/repo-grades/repoGrades.wiring.test.ts src/app/components/repo-grades/repoGradesSliceA.guards.test.ts src/file-size-ceiling.structure.test.ts`

```
COVERED src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts files=1 passed=26
COVERED src/app/components/repo-grades/repoGradesWaveBSearch.structure.test.ts files=1 passed=12
COVERED src/app/components/repo-grades/repoGradesWaveCTypeahead.structure.test.ts files=1 passed=10
COVERED src/app/components/repo-grades/repoGrades.wiring.test.ts files=1 passed=68
COVERED src/app/components/repo-grades/repoGradesSliceA.guards.test.ts files=1 passed=37
COVERED src/file-size-ceiling.structure.test.ts files=1 passed=4
```

(157 tests, 6 files, all passed.) This is the "green before" for every existing pin named below.

---

## 2. Inventory: every control in the header region, where it renders, in what container

"Header" is read as the sticky working header `.stickyWorkingHeader` (the block that
sticks above the table's column header), because that is where the controls the owner
sees stacked and wrapping live. Two neighbouring regions are inventoried so the boundary is explicit.

### 2a. The sticky working header (IN scope)

Container: `RepoGradesStickyHeader.tsx:63` `<div className={styles.stickyWorkingHeader}>`, CSS
`repo-grades.module.css:31-43`:

```
.stickyWorkingHeader {            /* :31 */
  position: sticky; top: 0; left: 0; z-index: 3;
  background: var(--field-background);
  display: flex;                  /* :37 */
  flex-wrap: wrap;                /* :38 */
  align-items: flex-end;          /* :39 */
  gap: var(--space-1) var(--space-3);   /* :40  row 4px, column 12px */
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-soft);
}
```

Children in DOM order (`RepoGradesStickyHeader.tsx:64-78`), each with its own layout:

| # | Control | Rendered at | Its own container / sizing | Notes |
|---|---|---|---|---|
| 1 | Grading banner (conditional: `bulkRunningFolder`) | slot built at `index.tsx:802-812`, placed `RepoGradesStickyHeader.tsx:64` | `pageStyles.loadingState` = `display:flex; align-items:flex-start; padding: space-3 space-4; border; background` (`page.module.css:105-114`); spinner `margin-top: space-1` (`:125-133`) | A bordered box, far taller than a 34px control, as a flex item |
| 2 | Folder select "Assignment folder to grade" | `RepoGradesFolderPicker.tsx:31-56` | `div.headerField` (column flex, gap 2px, `flex: 0 1 320px`, `:62-68`); contains caption + select, AND conditionally `<p fieldHint>` (`:48-50`) and `<p role="alert">` (`:51-55`) INSIDE the same column | Hints grow the column, so the select rises above the row's bottom line when a hint shows |
| 3 | Refresh (conditional: `course && !missingOrg`) | `index.tsx:796-800`, placed `RepoGradesStickyHeader.tsx:66` | bare `<button className={pageStyles.linkButton}>`: `padding:0; font: inherit` (`page.module.css:800-807`); no wrapper, no height | Text-height box; bottom-aligned so its text sits on the row's bottom edge, ~9px below the text inside a bordered input (derived: input padding 8px + border 1px); font-size inherits the 16px UA default (no `font-size` on body) while inputs are 14px |
| 4 | Grade set typeahead | `RepoGradesGradeSetTypeahead.tsx:37-104` | `div.gradeSet`: `display:flex; flex-wrap:wrap; align-items:center; gap: space-2; position:relative; flex: 0 1 auto` (`:89-97`). Holds the labelled input field (`:38-64`), the popup `ul` (`:65-84`), selected-repo chips (`:85-92`) and the "Showing N of M [Show all] [Clear]" status (`:93-103`) in ONE wrapping flex row | The only container using `align-items: center`; chips and status share the field's stack, so selecting any repo makes this block taller than its siblings and lifts the INPUT off the baseline |
| 5 | Target branch (text) | `index.tsx:813-828` | `label.headerField` + `span.headerInputLabel` caption + `input.headerInput`; `flex: 0 1 320px` | Clean |
| 6 | Search | `RepoGradesStickyHeader.tsx:69-78` | `label.headerField` + `input.headerInput` (no caption, by owner decision; pinned at `repoGradesWaveASticky.structure.test.ts:253`) | Clean; shorter stack by the caption row, correctly bottom-aligned |

Field recipe, `repo-grades.module.css`:

```
.headerInput {   /* :50-60 */
  flex: 0 1 320px;  min-width: 0;
  padding: var(--space-2) var(--space-3);   /* no explicit height */
  border: 1px solid var(--field-border); border-radius: var(--radius-sm);
  font: inherit;  font-size: var(--font-size-md);   /* 14px */
}
.headerField {   /* :62-68 */
  display: flex; flex-direction: column; gap: 2px;
  flex: 0 1 320px;  min-width: 0;
}
.headerField .headerInput { flex: 0 0 auto; }   /* :70-72 overrides :51 */
```

`.headerInput`'s own `flex: 0 1 320px` (`:51`) is DEAD: every `.headerInput` in the tree sits inside a
`.headerField` (`FolderPicker.tsx:31`, `GradeSetTypeahead.tsx:38`, `StickyHeader.tsx:69`,
`index.tsx:814`; instrument: `grep -n "styles.headerField" src/app/components/repo-grades/*.tsx`), and
`:70-72` overrides it with higher specificity.

### 2b. Adjacent regions, inventoried and held OUT of the write set

| Region | Where | Container | Why out |
|---|---|---|---|
| Column header controls (per folder column: sort button, assignment select, rubric line, Grade + Post) | `RepoGradesGrid.tsx:379-447`; CSS `.columnHeader` `:385-393` (column flex, `align-items:flex-start`, `min-width:190px`), `.columnHeaderActions` `:395-399` (flex, wrap, gap 4px) | Inside `<th>`; the previous pass (`3b2aa7a4`) just moved Grade/Post side by side | Already side by side; remaining variance is cross-column and cannot be proven without rendering (FORK-1, R-3) |
| Run-setup strip: Course typeahead + Repo-name filter | `RepoGradesControls.tsx:334-376` | `div.adaptRow` = `display:flex; gap: space-2; flex-wrap:wrap; align-items:flex-end` (`page.module.css:890-895`), inside the `<details>` | Collapsible setup, not the table header; already uses the same bottom-align recipe (FORK-1) |
| Hint paragraphs above the shell | `index.tsx:776-790` (`RepoGradesFolderHint` + "Links open the branch recorded when the repos were scanned.") | block `<p className={pageStyles.fieldHint}>` | Page flow, outside the sticky shell; not controls |

---

## 3. What is NOT in line today (grounded in the CSS above)

The previous pass changed ONE declaration for alignment: `.stickyWorkingHeader` `center -> flex-end`
(`git show 3b2aa7a4 -- src/app/components/repo-grades/repo-grades.module.css`). That aligns the
BOTTOM EDGE OF EACH ITEM'S WHOLE STACK. It is correct only when the bottom edge of the stack IS the
bottom edge of the control. It is not, for four of the six items. Findings, most damaging first:

**F1 - The row cannot fit on one line at common widths (derived).**
Four fields each have a 320px flex-basis (`.headerField :66`; the `.gradeSet` wraps a 320px field,
`:95`, `:66`) plus Refresh plus 4 gaps of 12px. Flex wrapping breaks lines on flex-basis, so the
required inner width is about 4x320 + 4x12 + 52 = 1380px (Refresh width 52px is an unmeasured
estimate of the 7-character "Refresh" at 14-16px). Available shell inner width is `0.96*V - 76`
(derivation: viewport V x 96vw cap `page.module.css:15`; minus 2x24 card padding `:35`, minus 2x1
shell border `repo-grades.module.css:27`, minus 2x12 header padding `:41`, minus 2x1 container
border). Single row needs `0.96V - 76 >= 1380`, so V >= ~1517px. At 1366 and 1280 it wraps to two
rows, with an unequal split. Page-level gutters outside `.card` were NOT measured, so 1517 is a
LOWER BOUND on the viewport needed.

**F2 - Selecting any repo lifts the Grade set input off the baseline.**
`.gradeSet` is one wrapping flex row holding the input field AND the chips AND the status text
(`GradeSetTypeahead.tsx:37-103`). The header bottom-aligns the whole `.gradeSet` block, so once the
chips/status wrap to a second line inside it, the INPUT sits one chip-line higher than Target branch
and Search. Same defect moves the popup: `.gradeSetList` is `position:absolute; top:100%`
(`:133-134`) relative to `.gradeSet` (`:94`), so with chips present it hangs under the CHIPS, not
under the input.

**F3 - Folder notices lift the Folder select.**
The two conditional paragraphs live inside the field's column (`FolderPicker.tsx:48-55`), so when
either shows (empty scan, or the drop alert) the select rises above the row's bottom line.

**F4 - Refresh is neither the control height nor the control font.**
Bare link-button, no height (`page.module.css:800-807`), `font: inherit` from a body that sets no
font-size (`globals.css:350-358`) = 16px against the inputs' 14px (`repo-grades.module.css:59`),
and bottom-aligned to the row edge rather than centred on a 34px band.

**F5 - Input and select have no common height.**
`.headerInput` has padding but no height or line-height (`:50-60`); a native `<select>` and a text
`<input>` with identical padding do not resolve to the same box in every engine. The repo already
has a token for this (`--control-height-md`, `globals.css:98-101`) that this stylesheet does not use
(`grep -n "control-height" src/app/components/repo-grades/repo-grades.module.css` returns nothing).
Whether they differ here, and by how many px, is NOT measured (R-1).

**F6 - The grading banner is a bordered box, not a control.**
It is a flex item in the control row (`StickyHeader.tsx:64`) with `padding: 12px 16px` and a border
(`page.module.css:105-114`), so while a bulk grade runs, the row's height jumps and the controls
re-flow around it.

**F7 - Inconsistent alignment recipes within the one container.** Container `flex-end`
(`:39`); `.gradeSet` `center` (`:92`); `.columnHeader` `flex-start` (`:389`);
`.adaptRow` (setup strip) `flex-end` (`page.module.css:894`). Only the container and the setup strip
use the recipe the previous pass chose.

Not defects (checked): Target branch and Search are correctly bottom-aligned stacks; the `.headerInputLabel`
caption is one consistent recipe (`:74-79`).

---

## 4. Design (exact changes)

### 4a. Principle

One row of CONTROLS, all 34px tall, bottom-aligned on a common line; anything that is not a control
leaves that row. Captions stay stacked above (the owner just re-added the Target-branch caption;
Search stays uncaptioned by his decision, pinned `repoGradesWaveASticky.structure.test.ts:253`).
Reuse the app's own tokens (`--control-height-md`, `--space-*`, `--font-size-md`); no new tokens, no
new colours (so no light/dark contrast change: every colour declaration is untouched).

### 4b. CSS (`repo-grades.module.css`)

| Rule | Change | Net lines |
|---|---|---|
| `.stickyWorkingHeader` (`:31-43`) | `gap: var(--space-1) var(--space-3)` -> `gap: var(--space-2) var(--space-3)` (row gap 8px so a wrapped second row is separated). Keep `flex-wrap: wrap` and `align-items: flex-end` (pinned, `repoGradesWaveASticky.structure.test.ts:251-252`). | 0 |
| `.headerInput` (`:50-60`) | `flex: 0 1 320px` -> `flex: 0 0 auto`; add `height: var(--control-height-md);`; `padding: var(--space-2) var(--space-3)` -> `padding: 0 var(--space-3)`. | +1 |
| `.headerField .headerInput` (`:70-72` + blank) | DELETE (dead once `.headerInput` carries `flex: 0 0 auto`). | -4 |
| `.headerField` (`:62-68`) | `flex: 0 1 320px` -> `flex: 1 1 200px`; add `max-width: 320px;`. | +1 |
| `.gradeSet` (`:89-97`) | becomes the popup anchor for the FIELD only: keep `display:flex; position:relative; min-width:0`; `flex: 0 1 auto` -> `flex: 1 1 200px`; add `max-width: 320px`; DELETE `flex-wrap`, `align-items: center`, `gap` (3 lines). | -2 |
| NEW `.headerAction` | Centres Refresh on the 34px band at the control font size: `display:flex; align-items:center; height: var(--control-height-md); font-size: var(--font-size-md);` | +7 (6 + blank) |
| NEW `.headerFullRow` | The one trailing full-width line: `flex: 0 0 100%; order: 1; display:flex; flex-wrap:wrap; align-items:center; gap: var(--space-1) var(--space-2);` plus a 2-line comment | +11 (8 + comment 2 + blank) |
| `@media (max-width: 700px)` block (`:659-767`) | add `.stickyWorkingHeader { position: static; }` next to the existing thead un-stick (`:664-666`) | +3 |

Gross: +1 +1 -4 -2 +7 +11 +3 = **+17** (builder recounts; do not trust this figure, section 5b).

### 4c. Markup

1. `RepoGradesStickyHeader.tsx:64-68`: wrap two slots, each CONDITIONAL so a falsy slot renders no empty
   flex item (an empty 100%-wide item would add a phantom 8px row gap):
   - `{statusBanner && (<div className={styles.headerFullRow}>{statusBanner}</div>)}`
   - `{rescanControl && (<div className={styles.headerAction}>{rescanControl}</div>)}`
   The literal substrings `{statusBanner}` and `{rescanControl}` remain, so the existing pins
   `repoGradesWaveASticky.structure.test.ts:117,193-195,216` and `repoGradesWaveBSearch.structure.test.ts:86-88`
   stay valid. Update the file-header comment (`:3-10`) to say the trailing line exists.
2. `RepoGradesFolderPicker.tsx:30-57`: return a Fragment. First child `div.headerField` holds ONLY the label
   and select. Second child, rendered only when `folderOptions.length === 0 || folderDropNotice`, is
   `<div className={styles.headerFullRow}>` holding the two existing `<p>`s unchanged (same classes,
   same `role="alert"`). Update the header comment (`:6-9`): the alert now sits on the header's trailing
   line, not stacked under the select (see misleading-finding M2).
3. `RepoGradesGradeSetTypeahead.tsx:36-105`: return a Fragment. First child `div.gradeSet` holds ONLY the
   labelled input field and the `{open && <ul>}` popup (so `top:100%` is under the input, which fixes
   the F2 popup drift). Second child, rendered only when `chips.length > 0 || summary`, is
   `<div className={styles.headerFullRow}>` holding the chips and the `role="status"` summary exactly as
   now. No handler, prop, ARIA attribute, or `onKeyDown` changes.

No change to `index.tsx`: all slots keep their current props and content.

### 4d. Alternatives rejected

| Alternative | Why not |
|---|---|
| Inline captions (caption to the left of each control, one true baseline, no caption row) | Costs ~150px of width per captioned field: pushes the single-row threshold well past F1's already-poor number, and reverses the owner's just-made "re-added a visible Target-branch caption" decision. |
| Horizontal scroll for the header | The grade-set popup is absolutely positioned inside the header; any `overflow` on it clips the popup. `repoGradesWaveASticky.structure.test.ts:146-149` (VH-10a) forbids `overflow` on `.stickyWorkingHeader`, for exactly that reason. |
| `.gradeSet { display: contents }` | The popup's `position:absolute` anchor would fall to the sticky header itself (nearest positioned ancestor), so the list would hang from the header's left edge. Breaks `repoGradesWaveASticky.structure.test.ts:158-164` intent. |
| Move chips INTO the input box (token field) | New component behaviour (focus, backspace-to-remove); out of a layout pass. |
| Delete `.srOnly` (orphan, 17 lines) to buy room | Drags `src/app/components/courses/page-module-css-orphan-classes.test.ts` into the write set: it pins `PINNED_ORPHAN_CEILING = 118` (`:316`) and asserts `PINNED_ORPHAN_CEILING === 120 - totalRecoveredCount` (`:456`), so removing one orphan needs two edits there. Comment condensation costs nothing. |

---

## 5. Responsive behaviour and line budget

### 5a. Behaviour by width (derived from the CSS in 4b; owner walk confirms)

Required single-row inner width with the new sizes: 4x200 + 4x12 + 52 = 900px, so V >= (900+76)/0.96 =
**~1017px** (lower bound; same caveats as F1). Compared with ~1517px today.

| Viewport | Behaviour |
|---|---|
| >= ~1017px | One control row; fields grow equally from 200px up to the 320px cap; leftover space trails to the right |
| ~700px to ~1017px | Wraps gracefully: fields keep >= 200px and break onto a second row; the 8px row gap separates the rows; every control on a row shares the 34px band and the bottom line. No horizontal scroll |
| <= 700px | Same wrap (typically one field per line at phone widths) AND the working header is un-stuck (`position: static`): at ~375px the stacked fields are roughly 4 x 50px + gaps (derived), which would otherwise pin about 40% of the shell's bounded height (`.stickyShell max-height`, `:25`) above the scrolling table. Mirrors the thead un-stick and its WCAG 1.4.10 Reflow rationale already in this file (`:659-666`). The `--rg-working-header-h` variable keeps being published but is unused once the thead is static |

Recommendation: wrap, never scroll (reasons in 4d). Un-stick at <= 700px is FORK-2.

### 5b. The 1000-line budget (the real constraint)

Start: 999. Gross addition +17 (4b). The build MUST end <= 1000 and the new pin AC-12 enforces it.
Pay for it by condensing COMMENT-ONLY blocks (no test reads comment text: the tests that open this file
either strip comments or assert only `.mergeBadgeNotMerged {`, `repoGrades.wiring.test.ts:902,916`).
Named candidates, all opened:

| Block | Lines | Now | Condense to | Frees |
|---|---|---|---|---|
| File preamble comment | `:1-19` | 19 | ~7 (keep: separate-import rationale, no new variables, "table header case deliberately left", AM5 note, no box-shadow literal) | ~12 |
| `.srOnly` comment (rule kept) | `:350-355` | 6 | 2 | 4 |
| AM5 comment in the media block | `:717-721` | 5 | 3 | 2 |
| B2 comment on `.selectHeader` | `:732-737` | 6 | 3 | 3 |

Frees ~21; resulting file about 995 (999 + 17 - 21, derived; headroom ~5). If the builder's measured count is still
> 1000, condense more comments or stop and report - NEVER delete a rule to fit, and never skip AC-12.
The comment at `:735` ("same recipe as .srOnly above") must keep naming `.srOnly` truthfully.

Instrument for the count, quoted in the build report: `@(Get-Content src/app/components/repo-grades/repo-grades.module.css).Count`
(PowerShell). Never `Measure-Object -Line` (`docs/loop/this-repo.md:186-195`).

---

## 6. Write set and coordination

| # | File | Kind | Lines now | Note |
|---|---|---|---|---|
| 1 | `src/app/components/repo-grades/repo-grades.module.css` | edit | 999 | MUST end <= 1000 (AC-12) |
| 2 | `src/app/components/repo-grades/RepoGradesStickyHeader.tsx` | edit | 84 | two conditional wrappers |
| 3 | `src/app/components/repo-grades/RepoGradesFolderPicker.tsx` | edit | 58 | Fragment, notices out of the field |
| 4 | `src/app/components/repo-grades/RepoGradesGradeSetTypeahead.tsx` | edit | 106 | Fragment, chips/status out of the anchor |
| 5 | `src/app/components/repo-grades/repoGradesHeaderInline.structure.test.ts` | NEW | 0 | pins AC-1..AC-12; its own helper copies (no cross-test-file import) |

Every wave includes the file that CALLS each new export: `.headerAction` and `.headerFullRow` are
called by files 2, 3, 4; no new exported symbol exists. Single wave, one implementer (the three TSX edits
and the CSS are mutually dependent; splitting them would ship a class with no caller or a caller with no
class).

Not edited: `index.tsx` (881), `RepoGradesControls.tsx` (583), `RepoGradesGrid.tsx`. Checked mechanically
for tests that this scope touches: `grep -rn "folderDropNotice\|No assignment folders were found" --include=*.test.ts src`
returned nothing; `grep -rn "gradeSetStatus\|gradeSetChip\|\.gradeSet\b" --include=*.test.ts src` returned
nothing. Directory roots canary (`FROZEN_REPO_GRADES_ROOTS`, a hand-frozen list of NON-test basenames,
`repoGradesFeedbackAndFiles.wiring.test.ts:300-362`): this scope adds no non-test root file, so the frozen list is untouched
(a new `*.test.ts` is not a root).

Coordination with the concurrent no-submission scope: its declared write set
(`docs/repo-grades-no-submission-graded-scope.md:326-388`) lists `github-repos.ts`, `grade-zeros.ts`,
`repo-grade-merge-check.ts`, the grading-repos steps, and states "Client hooks are NOT in the production
write set". It does not list `repo-grades.module.css`, `index.tsx`, or `RepoGradesControls.tsx`. So by
file-set the two are disjoint. `repo-grades.module.css` is still the one SHARED-by-nature file in this
directory (any future repo-grades scope that adds a class lands there; it is at 999), so serialize any
second CSS-touching build behind this one. Other untracked docs name these files (8 hits from
`git status --short | grep '^??' | awk '{print $2}' | xargs grep -l "repo-grades.module.css\|RepoGradesStickyHeader\|RepoGradesGradeSetTypeahead\|RepoGradesFolderPicker"`);
they describe changes already in git history (`3b2aa7a4`, `726ceb17`, `b22e257d`, `d230ffcb`) - NOT individually
re-verified as shipped here; the dispatcher re-runs that grep at dispatch time.
Working tree: `git status --short` showed `docs/css-orphans.md` modified (a regenerated doc); running
`page-module-css-orphan-classes.test.ts` rewrites it (defined classes 1331 -> 1333). Stage it only if the
test rewrote it.

---

## 7. Acceptance criteria

Each names the OBJECT compared, the INSTRUMENT, and the DIRECTION of failure. Nothing renders under
vitest, so these are source-text pins; they prove the mechanism is present, not how it looks (AC-OW).

- **AC-1 One control height.** Object: the declared `height` in `.headerInput` vs in `.headerAction`.
  Instrument: `ruleBlock(CSS, ".headerInput")` and `ruleBlock(CSS, ".headerAction")` each match
  `height:\s*(var\(--control-height-(?:sm|md|lg)\))`; the two captured tokens are compared for equality
  and for `=== "var(--control-height-md)"`. Fails if either is absent, a px literal, a different token
  from the other, or not `md`.
- **AC-2 One flex recipe for fields.** Object: `.headerField` and `.gradeSet` blocks. Instrument: capture
  `flex:\s*1 1 (\d+)px` from each; assert equal, `<= 240`, and each block has `max-width:\s*320px`. Fails
  on the old `0 1 320px`, on unequal bases, or on a missing cap.
- **AC-3 Wrap and baseline survive.** Object: `.stickyWorkingHeader` block. Instrument: matches
  `flex-wrap:\s*wrap` and `align-items:\s*flex-end`; no `overflow`. Fails if either is lost, or if
  `overflow` appears.
- **AC-4 `.gradeSet` is a plain anchor.** Object: `.gradeSet` block. Instrument: matches
  `position:\s*relative`; does NOT match `flex-wrap` or `align-items`. Fails if the old wrap/center recipe
  returns.
- **AC-5 Dead override gone.** Object: whole comment-stripped CSS. Instrument: `not.toMatch(/\.headerField\s+\.headerInput/)`
  and `.headerInput` block does not contain `320px`. Fails if the old rule or basis returns.
- **AC-6 Trailing line exists.** Object: `.headerFullRow` block. Instrument: matches `flex:\s*0 0 100%`
  AND `order:\s*1`. Fails if either is dropped (without `order` the notices render before Search).
- **AC-7 Typeahead split.** Object: `RepoGradesGradeSetTypeahead.tsx` comment-stripped source. Instrument by index
  comparison: `indexOf("styles.gradeSetList")` < `indexOf("styles.headerFullRow")`; `indexOf("styles.gradeSetChip")`
  and `indexOf("summary.counterText")` both > `indexOf("styles.headerFullRow")`; the wrapper is guarded by
  `chips.length > 0 || summary`. Fails if chips or status move back inside the anchor, or the wrapper is unconditional.
- **AC-8 Folder notices out of the field.** Object: `RepoGradesFolderPicker.tsx` source. Instrument: the slice
  from `className={styles.headerField}` to the first following `</div>` contains neither `fieldHint` nor
  `role="alert"`; both occur after `styles.headerFullRow`; `folderDropNotice` and `role="alert"` still present.
  Fails if a notice is re-nested in the field, or the alert is dropped.
- **AC-9 Header wrappers conditional.** Object: `RepoGradesStickyHeader.tsx` source. Instrument:
  `/\{statusBanner && \(\s*<div className=\{styles\.headerFullRow\}>\s*\{statusBanner\}/` and
  `/\{rescanControl && \(\s*<div className=\{styles\.headerAction\}>\s*\{rescanControl\}/`. Fails if a wrapper is
  unconditional (phantom flex item) or missing.
- **AC-10 Narrow-width un-stick.** Object: the `@media (max-width: 700px)` block. Instrument: slice CSS from the
  media index; find `.stickyWorkingHeader`; its block matches `position:\s*static`. Fails if absent (sticky
  header pins ~40% of the shell at phone width).
- **AC-11 Existing pins stay green.** Object: the six files in section 1a. Instrument: the same
  `npm run test:paths -- <six paths>` command, per-argument `COVERED` lines, all `passed=` equal to the
  baseline counts 26/12/10/68/37/4 (plus the new file). Fails if any file is uncovered or any count drops.
- **AC-12 Stylesheet ceiling, mechanically.** Object: `repo-grades.module.css`. Instrument: the new test imports
  `countLines` from `src/lib/count-lines.ts:23` (the same Get-Content-matching counter
  `file-size-ceiling.structure.test.ts:5,136` uses) and asserts `<= 1000`. Fails the moment the stylesheet
  exceeds 1000 lines. This closes the "no gate on CSS length" finding in 0a.
- **AC-OW Owner walk (cannot be proven here).** One control row at 1366 and 1280 viewport widths; Folder,
  Grade set, Target branch and Search share top and bottom edges (no stagger) with 0 chips, with chips selected,
  with a folder notice, and during a bulk grade; Refresh text reads on the same line as the input text at the
  same size; the grade-set popup opens directly under the input even with chips present; 700-1017px wraps cleanly
  with no horizontal scroll; <= 700px the header scrolls away; both themes (no colour changed, so this is a
  sanity look only).

Diagnostics representation (DEV_LOOP rule): **none, and that is stated rather than assumed.** This is a
presentational layout change: no new data path and no new failure mode, so there is no diagnostic to add.
Leverage claim: not required (not a new capability). Clicks: 0 added, 0 removed (first use and repeat use
unchanged); the header gets shorter (one row instead of two at >= ~1017px), which is the only
interaction-visible gain. No new key binding; the grade-set `onKeyDown` stays on the native `<input>`
(`GradeSetTypeahead.tsx:56-62`), not routed through MUI `slotProps`, so the `input`-vs-`htmlInput` trap does
not apply. No new persisted state (no `ta-` key). No new copy, no emoji.

---

## 8. Sabotage plan (run by a separate agent AFTER the build, one at a time)

Method: `cp` the file to the scratchpad first, mutate, run the one pin file via
`npm run test:paths -- <file>`, restore FROM THE COPY (never `git checkout --`, which reverts to the index
and destroys uncommitted build work). Only one agent sabotages on the tree at a time.

| Mutant | Edit | Pin that must go red |
|---|---|---|
| M1 | delete `height:` from `.headerInput` | AC-1 |
| M2 | `.headerAction` uses `--control-height-sm` | AC-1 (equality) |
| M3 | `.headerField` flex back to `0 1 320px` | AC-2 and AC-5 |
| M4 | re-add `flex-wrap: wrap` to `.gradeSet` | AC-4 |
| M5 | move the chips `.map` back inside the `.gradeSet` div | AC-7 |
| M6 | move the folder `<p role="alert">` back into the `.headerField` div | AC-8 |
| M7 | drop the `rescanControl &&` guard | AC-9 |
| M8 | delete `order: 1` from `.headerFullRow` | AC-6 |
| M9 | `.stickyWorkingHeader` `align-items: center` | AC-3 AND existing `repoGradesWaveASticky.structure.test.ts:252` |
| M10 | remove `position: static` rule from the media block | AC-10 |
| M11 | add `overflow-x: auto` to `.stickyWorkingHeader` | AC-3 AND existing `:146-149` |
| M12 | append 5 blank CSS lines | AC-12 |

A mutant that stays green is a finding against the pin, not the mutant.

---

## 9. Reading checks the build must also make (no instrument here)

- **M1 misleading: the trailing line separates chips from the input.** Selected repos now render on the
  header's last line rather than beside the input. The "Showing N of M" status sits with them, which is the
  clearest cue; judged acceptable, owner-walk R-1.
- **M2 misleading: the folder drop alert is no longer directly under the select.** `FolderPicker.tsx:8-9`
  says the alert "must sit next to the control that resets it". On a one-row header the trailing line is
  immediately under the whole row; on a wrapped header it can sit a row away from the select. It remains
  `role="alert"`, so assistive tech announces it irrespective of position. Worst of the three because it is
  the only one that touches a stated invariant; judged acceptable and recorded as R-2.
- **M3 misleading: the grading banner now trails the controls** instead of leading them. It stays inside the
  sticky region directly above the column header where the Grade button the user just clicked lives, so
  proximity to the clicked control improves.

Focus order vs visual order (not decided here, handed to the Accessibility seat): the chips' remove buttons and
Show all / Clear stay where they are in the DOM (right after the grade-set input), but `order: 1` draws them
last. A keyboard user tabs input -> chips row -> Target branch -> Search while the eye goes input -> Target
branch -> Search -> chips. See R-2.

---

## 10. Forks (each with my recommended reading, acted on by default; default ON)

- **FORK-1 Scope boundary.** Recommended reading ACTED ON: IN = the sticky working header and its trailing line.
  OUT = the column-header Grade/Post cluster (just reworked in `3b2aa7a4`; remaining variance is cross-column
  vertical position when rubric lines differ and ragged stacking when `Grade all N repos in <folder>` is longer
  than the 190px column floor, `RepoGradesGrid.tsx:379-447`, `repoGradesRunPlan.ts:28-40` - NEITHER provable
  without rendering) and the Run-setup strip (already `flex-end`). Cost if wrong: the owner meant the column
  header, so one follow-on scope after his walk; nothing here is wasted.
- **FORK-2 Un-stick at <= 700px.** Recommended ON (+3 lines, section 5a). Cost if wrong: delete 3 lines and AC-10.
- **FORK-3 Field basis 200px vs 240px.** Recommended 200px: single row from ~1017px instead of ~1183px (derived:
  (4x240+48+52+76)/0.96). Cost: the Grade-set placeholder "Add repos to grade (default: all)" (33 characters)
  may truncate when fields sit near 200-245px (derived estimate, not rendered); the accessible name comes from
  `aria-label` (`GradeSetTypeahead.tsx:43`), so only sighted users see the clipping. Cost if wrong: change one number
  in two rules and AC-2's bound.
- **FORK-4 Banner trailing vs leading.** Recommended trailing (shares `.headerFullRow`, saves a second class, keeps
  the control row from jumping height). Cost if wrong: add a 3-line `.headerLead` class, which the budget can
  absorb only with more comment condensation.

---

## 11. Residual register (nothing here is proven now)

Every row has an owner, an instrument and the step that measures it. A row missing any of the three is a deletion.

| Id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-1 | All pixel/visual claims: single row from ~1017px, shared baseline, input vs select equal height at 34px, Refresh centred at 14px, popup under the input with chips, trailing-line placement reads well, 700-1017px wrap, <= 700px un-stick | Repo owner | AC-OW walk in a real browser at 1366/1280/1024/700/375px, 0 chips and with chips, folder notice, mid bulk grade | Post-ship owner walk |
| R-2 | Focus order differs from visual order for the trailing line (chips remove, Show all, Clear); folder alert no longer adjacent on a wrapped header | Accessibility seat (wave 3 of the build chunk) | Reading the built diff plus a keyboard Tab walk | Build chunk, accessibility pass; if unacceptable the fallback is to give each trailing line its own slot rendered after Search in `RepoGradesStickyHeader.tsx` (needs `index.tsx` in the write set) |
| R-3 | Column-header Grade/Post cross-column vertical alignment and stacking when labels are long (FORK-1) | Repo owner | Owner walk in the "All folders" view with >= 3 folder columns and long folder names | Same walk as R-1; a confirmed defect opens its own scope |
| R-4 | The 1000-line figure and the `lines freed by comment condensation` (~21) are derived, not measured | Build implementer, then verifier | `@(Get-Content src/app/components/repo-grades/repo-grades.module.css).Count` after the edit, plus AC-12 | Build gate and Verify |
| R-5 | The ~1017px / ~1517px thresholds are lower bounds (page-level gutters outside `.card`, and the Refresh width, were not measured) | Repo owner | Same walk: find the first width where the row stays single | Same walk as R-1 |
| R-6 | Light/dark: no colour declaration changes, so no contrast delta is expected; the Refresh text colour (`--accent-ink`) and the field tokens are unchanged | Repo owner | Visual sanity look in both themes during R-1 | Same walk as R-1 |
| R-7 | `.gradeSetList` `min-width: 260px` (`:142`) is wider than a 200px field, so the popup overhangs its input at narrow widths. Pre-existing and cosmetic; left alone | Repo owner | Visual look at ~1020px | Same walk as R-1 |

---

## 12. Reproducibility notes

ASCII-only instrument: `LC_ALL=C grep -c '[^ -~]' docs/repo-grades-header-controls-inline-scope.md` must print 0. Canary
proving the instrument fires: the same command on `src/app/components/repo-grades/RepoGradesGrid.tsx` (which contains the
U+2026 ellipsis at `:372`) must print a non-zero count. Do NOT use `grep -P` (broken here, reports clean without
checking: `docs/loop/this-repo.md`, memory "Emoji scan").

Commands used to produce the figures above, in order: `git log --oneline -6`; `git show 3b2aa7a4 --stat`;
`git show 3b2aa7a4 -- <css> <StickyHeader>`; `@(Get-Content <f>).Count`; `git show <sha>:<f> | wc -l`;
`git ls-files --eol <f>`; `npm run test:paths -- <six paths>`; `grep -n` over the files named in each row.

Files opened in full or in the cited ranges: `RepoGradesStickyHeader.tsx` (all), `RepoGradesFolderPicker.tsx` (all),
`RepoGradesGradeSetTypeahead.tsx` (all), `index.tsx:616-881`, `RepoGradesControls.tsx:296-392`,
`RepoGradesGrid.tsx:330-448,487-540`, `repo-grades.module.css:1-180,185-215,300-330,336-445,600-770,786-800`,
`repoGradesWaveASticky.structure.test.ts:1-290`, `repoGradesWaveCTypeahead.structure.test.ts` (all),
`repoGradesSliceA.guards.test.ts:185-320`, `page.module.css:100-145,255-262,795-825,890-895`, `globals.css:88-101,335-362`,
`theme.ts:58-108`, `file-size-ceiling.structure.test.ts:20-74,100-164`,
`page-module-css-orphan-classes.test.ts:418-458`, `repoGradesRunPlan.ts` (all),
`docs/repo-grades-no-submission-graded-scope.md:326-392`, `docs/repo-grades-table-header-cleanup-scope.md:1-100`.
