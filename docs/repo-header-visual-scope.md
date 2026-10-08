# REPO-HEADER-VISUAL - UX + architecture scope and recon

Backlog row: `docs/backlog.yml:1148-1159` (id `REPO-HEADER-VISUAL`, filed from the
owner's request of 2026-10-05). Authored at HEAD `ebf32aea`
(`git log -1 --format=%H`). Seat: UX (primary) + architecture (layout and
structure). Data, admin, security and reliability passes are N/A for this item:
a look-and-feel change to one stylesheet and two components that adds no
persisted key (VH-6), no network call, no server action and no new failure mode.

The owner's words, verbatim: "the header of the repo table on the repo grade
page needs a visual overhaul. it works well functionally, but doesn't look
good."

This is a scope and a plan. It builds nothing. Every quantity below names the
instrument that produced it; the instruments are listed in section 11.

---

## 0. Read this first

1. **What I measured the look with, and what that is worth.** The real page
   cannot render in this checkout: there is no `.env` (`ls -a` returns only
   `next-env.d.ts`), the root layout wraps every route in `SupabaseProvider`
   (`src/app/layout.tsx:157`), and `createBrowserClient` takes the env vars
   directly (`src/lib/supabase/client.ts:56-58`). So the "current header" numbers
   in this document come from a STATIC HARNESS I built in the scratchpad: the
   REAL `globals.css` and the REAL `repo-grades.module.css` copied verbatim and
   served on `127.0.0.1`, with the DOM transcribed from the TSX (file:line cited
   inline in the harness) and the two MUI buttons approximated. Treat harness
   numbers as "real CSS, approximate MUI, approximate fonts", not as the app.
   Section 8 gives the path to a real-component preview.
2. **Nothing renders under vitest.** `docs/loop/this-repo.md` section 6. Every
   machine criterion below is a source or CSS-text pin proving a mechanism is
   present, never that it paints.
3. **Ambiguity in "the header", and the reading I took** - section 1.
4. **The "two badge systems" defect does not exist where the backlog row sends
   you** - section 3, item V9. I looked, and I report what I found.

---

## 1. What "the header of the repo table" is, and the reading taken

At HEAD the region between the controls form and the table body is ONE sticky
stack, two tiers, inside ONE bounded scroll shell
(`RepoGradesStickyHeader.tsx:63-81`, mounted at `index.tsx:919-971`):

- **Tier 1, the working header** (`.stickyWorkingHeader`): the run bar (folder
  name, mapped assignment, rubric line, Grade and Post buttons), the grade-set
  typeahead (input, chips, "Showing N of M", Show all / Clear) and the search
  input.
- **Tier 2, the column-header row** (`<thead>`, `RepoGradesGrid.tsx:497-541`):
  Select, Repo, First name, Last name, Binding, and one `ColumnHeaderControls`
  stack per folder column (sort button, Canvas assignment select, rubric line,
  Grade button, Post button - `RepoGradesGrid.tsx:381-445`).

Two other readings are possible: the controls form ABOVE the table
(`RepoGradesControls.tsx:360-496`, the course / filter / folder / sort row and
the "Grading settings" disclosure), or the table's whole frame. **Recommended
reading, acted on in this scope: tiers 1 and 2 and the seam between them.** The
controls form is not "the header of the table" in the DOM or on screen (it
scrolls away; the table header is the part that stays), and it already uses the
app's own `.adaptRow` / `.field` vocabulary (`RepoGradesControls.tsx:51,360`).
If the owner meant the controls form, that is a separate row and costs a new
scope, not a revision of this one - see fork F1 (section 9).

---

## 2. Inventory: the header region as built at HEAD

### 2.1 DOM, in render order (single-folder view; `runBar` is null in the all-folders view - `index.tsx:924`)

```
<div class=stickyShell ref=shellRef>                        RepoGradesStickyHeader.tsx:64
  {hasHeader &&                                             :65  (hasHeader is true whenever onSearchChange is a function, :43)
  <div class=stickyWorkingHeader ref=headerRef>             :66
    <RepoGradesRunBar>                                      :67  (RepoGradesRunBar.tsx:83-116)
      <div class=runBar role=group>                          RunBar:84
        <span class=runBarContext>                           :85
          <span class=runBarFolder>                          :86
          <span class=postReason> "Posts to ..."             :87-89
          <span class=postReason> rubric line                :90
        <Button contained small> Grade ...                   :92-103
        <Button contained small> Post ...                    :104-114
    {gradeSetControl}                                       :68  (RepoGradesGradeSetTypeahead.tsx:75-139)
      <div style=WRAP_STYLE>                                 Typeahead:75   flex, wrap, gap-2, position:relative
        <input role=combobox style=INPUT_STYLE>              :76-99
        {open && <ul role=listbox style=LIST_STYLE>}         :100-119  (li style=OPTION_STYLE :102,:108)
        {chips.map -> <span style=CHIP_STYLE> + <button>x}   :120-127
        {summary && <span role=status style=STATUS_STYLE>    :128-138  (two MUI <Button size=small>)
    <input type=search style=SEARCH_INPUT_STYLE>            :69-76
  </div>
  {children}  ->  <div class=gridWrap><table class=grid>    RepoGradesGrid.tsx:487-488
    <thead><tr> <th class=selectHeader> ... <th>x4 sortable  :497-508
       <th> <div class=columnHeader>                          :512-537 / :381
         <button class=sortHeaderButton><span class=columnHeaderFolder>   :382-390
         <select>                                             :391-402
         <span class=postReason> rubric                       :411
         {codeScoringDisclosure && <span class=postReason>}   :416-421
         <Button contained small> Grade                       :422-433
         <Button contained small> Post                        :434-444
```

Single-folder view: Grade and Post exist TWICE in the sticky stack (run bar and
the folder column header), by design (`RepoGradesRunBar.tsx:3-9` says both call
the same confirmed handlers). That duplication is functional and is not touched
here - fork F2.

### 2.2 Class map (every class the region uses, with the rule that governs it)

| Class / element | Defined | What it sets today |
|---|---|---|
| `.stickyShell` | `repo-grades.module.css:24-27` | `max-height: calc(100vh - topbar - banner - 120px)` (harness: 542px at 720px viewport), `overflow: auto`. No border, no radius. |
| `.stickyWorkingHeader` | `:29-35` | `position: sticky; top: 0; left: 0; z-index: 3; background: var(--field-background)`. **No padding, no border, no gap, not a flex container.** |
| `.runBar` | `:886-898` | `position: sticky; top: 0; z-index: 2; display:flex; flex-wrap; align-items:center; gap: space-2 space-3; padding: space-2 space-3; background: field-background; border: 1px solid card-border; border-radius: radius-md`. |
| `.runBarContext` | `:900-905` | column flex, `flex: 1 1 240px`. |
| `.runBarFolder` | `:907-910` | weight 600, `--text-primary`; inherits 14px/16px body size. |
| `.postReason` | `:436-440` | `--text-muted`, `--font-size-xs`, italic. Shared with per-cell reasons. |
| inputs (grade-set + search) | inline, `RepoGradesStickyHeader.tsx:16-25` and `RepoGradesGradeSetTypeahead.tsx:17-26` | two byte-identical style objects: `width:100%; maxWidth:320; padding space-2 space-3; 1px field-border; radius-sm; field-background; text-primary; font: inherit`. |
| chips, listbox, option, status | inline, `Typeahead:27-36, 37-52, 53, 54` | `CHIP_STYLE` radius-sm + field-border; `LIST_STYLE` absolute, z-index 5, maxHeight 240, minWidth 260; `OPTION_STYLE` padding only; no hover, no selected style. |
| `.gridWrap` | `:37-40` | `1px solid card-border; radius-md`. Not a scroll container (pinned, W-A2). |
| `.grid`, `.grid th/td` | `:42-55` | `border-collapse: collapse`; cell padding `space-2 space-3`; `vertical-align: top`; `border-bottom: 1px solid border-soft`. |
| `.grid thead th` | `:65-72` and `:526-528` (narrow) | `position: sticky; top: var(--rg-working-header-h, 0px); background: var(--field-background); color: text-secondary; weight 600; z-index: 2`; static at <=700px. |
| `.columnHeader` | `:238-245` | column flex, `gap: space-1`, `min-width: 190px`, weight 600. |
| `.columnHeaderFolder` | `:247-249` | `--font-size-lg`. |
| `.columnHeader select` | `:288-296` | `radius-xs`, `field-border`, 400 weight, md size. |
| `.sortHeaderButton` | `:256-269` | reset button, 600, inherits color. |

### 2.3 The functional sticky mechanism (MUST be preserved)

- `--rg-working-header-h` is set on the shell from `header.offsetHeight` on
  mount and on every `ResizeObserver` tick (`RepoGradesStickyHeader.tsx:53-60`),
  and removed when no header renders (`:49-52`). `offsetHeight` includes padding
  and border, so adding either to the header keeps the thead offset exact with no
  JS change.
- `.grid thead th` consumes it at `top: var(--rg-working-header-h, 0px)`
  (`repo-grades.module.css:67`).
- Stacking: header `z-index: 3` (`:33`), thead `z-index: 2` (`:71`), run bar
  `z-index: 2` (`:889`, nested inside the header, so inert - the header is the
  sticky element that matters), listbox `z-index: 5` (`Typeahead:41`) inside the
  header's own stacking context. Consequence for any restyle: **do not give the
  header `overflow: hidden/auto/clip`** - it would clip the typeahead popup, which
  deliberately hangs below the header (`top: 100%`, `Typeahead:39`).
- At <=700px only the thead un-sticks (`:521-528`); the header stays sticky at
  every width. Pinned by W-A5 (`repoGradesWaveASticky.structure.test.ts:81-85`).

---

## 3. What "doesn't look good", named

Evidence classes: **H** = harness-measured (real CSS, approximate MUI;
`getBoundingClientRect` / `getComputedStyle` via the Browser pane at 1280x720,
dpr 1); **R** = read from the cited line; **C** = computed by hand from token
hex values (no contrast tool exists here - section 11); **U** = unverified,
to be settled in the preview step.

**V1 - The header is a pile of strips, not one header (R, H).** Three
unrelated treatments stack with nothing joining them: the run bar is a bordered
rounded box (`:886-898`), then a bare flex row of input + chips + counter
(`Typeahead:75`), then a bare input (`StickyHeader:69`). The wrapper that holds
them has no padding, border, gap or layout (`:29-35`). Harness: the three
children are separated by exactly 0px (`gapRunBarToTypeahead = 0`,
`gapBetweenInputs = 0`) - the two inputs sit flush against each other and the
run bar's bottom border touches the first input's top edge.

**V2 - Box inside a box, and misaligned left edges (R, H).** The run bar draws
its own frame (`:894-897`) inside the header, so its text starts 13px in
(1px border + `space-3` padding) while both inputs start at 0. In the harness
screenshot the "module-3" title and the inputs have visibly different left edges.
Neither aligns with the table's own cell padding (`space-3` = 12px,
`:50`).

**V3 - Two inputs that look identical, stacked (R, H).** The grade-set input and
the search input are the same 320px box (`StickyHeader:16-25` vs
`Typeahead:17-26`, identical declarations). They differ only by placeholder
text, which disappears once typed into. They do different jobs: search narrows
the DISPLAY (`index.tsx` `bodyRows`), the grade-set picks what RUNS. The page
above labels every control with the micro-label idiom (`.field label`,
`page.module.css:154-160`); these two have no label at all.

**V4 - Three input vocabularies on one page (R, H).** Controls row: MUI
`TextField size="small"` at 0.9rem (`theme.ts:102-104`) and native `.field`
inputs at `--font-size-lg` 16px with `space-3 space-4` padding
(`page.module.css:296-316`). Header: inline inputs at inherited 16px with
`space-2 space-3` padding. Table body: 14px (`--font-size-md`, `:45`). The
header inputs are the only ones that are 16px text but dense-padded, and they
cannot take `::placeholder`, `:hover` or a focus border-colour because they are
inline styles.

**V5 - Inline-style header internals have no interaction states (R).** The
typeahead listbox options have no hover, no active and no selected style
(`Typeahead:53,102,108`); selection is shown only by a literal "Selected: "
text prefix (`:114`). Chips are 8px-radius boxes with a bare letter "x" button
(`:27-36,:123-125`) - a third chip look beside the app's pill chip
(`TasksGrid.module.css:42-53`) and the app's pill badge. The popup has no
elevation (`:37-52`, no `box-shadow`).

**V6 - Weak hierarchy: the consequential controls are not distinct (R, H).**
Grade and Post are identical contained-primary buttons
(`RunBar:92-114`), so the irreversible Canvas write looks the same as the local
AI run. The run bar's folder name is the only emphasis and it is body-size
(`.runBarFolder` has no `font-size`, `:907-910`), while the SAME folder name in
the column header is `--font-size-lg` (`:247-249`). Three lines of `.postReason`
(italic, `--text-muted`) stack under it.

**V7 - Meta text is below readable contrast (C).** `.postReason` is 12px italic
`--text-muted` (`:436-440`). `#94a3b8` on `#ffffff` computes to about 2.6:1
light; dark `#64748b` on `#1e293b` about 3.1:1 (hex from `globals.css:24,293,26,295`),
both under the 4.5:1 normal-text threshold. The same pairing exists app-wide
for helper text, so this is a house debt rather than a header invention - but in
the header it is the only explanation of what Post will do. `--text-secondary`
computes to about 7.6:1 light on white (`#475569`, `globals.css:23`).

**V8 - The sticky stack is tall and the column header floats (H, R).** Harness
heights: working header 149px (run bar 71 + grade-set row 39 + search 39),
column-header row 159px, total 308px of a 542px shell, so 57% of the scroll
region is permanently chrome at 720px viewport height. The plain column labels
(Select, Repo, First name...) are `vertical-align: top` (`:48-55`), so in the 159px
row they sit at the top with ~110px of empty space below them, detached from the
data. The Grade and Post buttons in the column header stretch the full 190px+
column width (column flex default `align-items: stretch`, `:238-245`).

**V9 - "Two badge systems in one view": checked, and it is not where the
backlog row says (R, measured).** The prior doc says "this view already has its
OWN bordered badge family ... Two badge systems in one view is a defect"
(`docs/repo-grades-ux-overhaul-acceptance-criteria.md:876-882`), comparing the
app's `.ghBadge*` family (`page.module.css:1589-1655`) with the view's
`.bindingBadge*` family (`repo-grades.module.css:108-144`). At HEAD:
`grep -c ghBadge` over `src/app/components/repo-grades` returns 0 files - the view
renders NO `.ghBadge`. It renders four `.bindingBadge*` spans in one component
(`RepoBindingControl.tsx:49,75,133,175`). So there is one badge family in the
view, and it DIVERGES from the app's primitive (bordered, per-state 1px border
colour, vs borderless tinted). Two consequences: (a) it is in the Binding column
BODY, not the header, so it is out of this scope; (b) the prior doc recorded
that restyling it touches `docs/REGRESSION.md` entry 243 and must be "raised
before changing". The only badge-like objects INSIDE the header region are the
grade-set chips (V5), which are a third look. Disposition: chips are fixed in
W1; the binding badges are residual R7 and need an owner call.

**V10 - Frame and seam (R, U).** The frame (`1px card-border`, `radius-md`) is
on `.gridWrap` (`:37-40`), which sits BELOW the header inside the shell
(`StickyHeader:79`), so the header floats above the framed table. `.gridWrap`
cannot clip (it must not scroll or be `overflow: hidden`-able without breaking
the sticky shell, W-A2 `repoGradesWaveASticky.structure.test.ts:59-62`), so the
sticky thead's square opaque corners are not clipped to the rounded border
(U). And `.grid` is `border-collapse: collapse` (`:44`): in Chrome a collapsed
table's cell borders do not travel with a sticky `<th>`, so the hairline under the
column header can vanish once rows scroll beneath it (U - a known browser
behaviour I did not reproduce here).

**Does it read as one coherent header?** No. Of V1-V10, V1, V2, V3, V8 and V10
are exactly the "pile of strips" answer; V4-V7 are what keeps each strip from
looking designed. V9 is out of region.

---

## 4. The app's visual language - what to reuse (and what not to)

All tokens exist; none is introduced. Theme values from `src/app/globals.css`
(light line / dark line):

| Need | Reuse | Cited at |
|---|---|---|
| Spacing scale | `--space-1..4` (4, 8, 12, 16px) | `globals.css:88-91` |
| Radius | `--radius-sm` 8px (inputs, MUI buttons), `--radius-md` 12px (frames/panels), `--radius-pill` (chips) | `:110-111,117`; MUI buttons radius 8 at `theme.ts:99` |
| Frame border | `--card-border` (what `.gridWrap` uses today) | `:21,290`; `repo-grades.module.css:38` |
| Dividers | `--border-soft` (row dividers, table cells) | `:63,296` |
| Input border | `--field-border` | `:25,294` |
| Surfaces | `--field-background` (current header and thead), `--surface-subtle` (quiet panels: `.logPanel :636-642`, `.linkPanel :726-735`, `.statusBanner :225-233`) | `:26,295,64,297` |
| Text | `--text-primary`, `--text-secondary` (thead, meta), `--text-muted` (placeholders only) | `:22-24` |
| Type scale | `--font-size-2xs` micro-label idiom (700, 0.06em, uppercase, secondary); `-xs`; `-md` default UI; `-lg` for a panel title | `:71-76`; idiom pinned at `page.module.css:154-160`, `:5277-5284` |
| Accent tint | `--accent-surface`, `--accent-border-soft` (chip tint; `.linkSourceButtonActive` already uses `--accent-surface`, `repo-grades.module.css:844-848`) | `globals.css:185-186` |
| Elevation (popup only) | `--shadow-md` (used by `.bulkBar`, `page.module.css:5225`). NOT `--shadow-lg` with `--radius-xl`: `definesCardFrame` forbids that pair in this sheet (`repoGradesSliceA.guards.test.ts:214-218,248-250`) | `globals.css:161-162` |
| Focus | global `:focus-visible` ring (`globals.css:390-393`); `border-color: var(--accent)` on input focus (`page.module.css:339-341`) | - |

Precedent idioms to MIRROR (values copied; CSS Modules hash per file and the repo
uses no `composes:` - `grep composes: src --include=*.css` returns 0 - so a class
cannot be shared across modules, only its values):

- **One bordered bar with hairline-divided rows**: `.bulkBar` (`page.module.css:5219-5227`,
  `1px card-border`, `radius-md`) + `.bulkRow` (`:5265-5271`, `space-2 space-3`
  padding, `gap: space-2`, wrap) + `.bulkRow + .bulkRow { border-top: 1px solid var(--card-border) }`
  (`:5273-5275`). This is the house answer to "several rows of controls that read as
  one bar".
- **Toolbar row**: `.toolbar` (`TasksGrid.module.css:30`, flex wrap, `gap: space-2`,
  centre) and `.toolbarDivider` (`:32`, 1px `border-soft`).
- **Filter chip + remove**: `.filterChip` (`TasksGrid.module.css:42-53`: pill,
  `color-mix(accent 10%, field-background)` fill, `color-mix(accent 30%, field-border)`
  border, xs, 500) and `.filterChipRemove` (`:57-71`: 18px circle, transparent, hover tint).
- **Counter line**: `.summaryBar`/`.summaryFigure` (`TasksGrid.module.css:84-94`).
- **Input**: the `.field` input recipe (`page.module.css:296-342`) for border,
  radius, placeholder colour (`--text-muted`, `:318-326`) and focus border-colour.
  Its 12/16px padding and `--font-size-lg` are NOT reused - too tall for a sticky
  header; match the MUI small field instead (`theme.ts:102-104`, 0.9rem ~ md).
- **Table header**: `CoursesTable.module.css:124-138` tints the header
  (`color-mix(field-background 90%, accent 10%)`) and uppercases it. **Do not
  uppercase here**: sentence-case is a recorded owner decision (U26b,
  `repo-grades.module.css:57-64`). A tint would also fail W-A4's literal
  `background: var(` pin unless routed through a custom property - offered as a
  preview option P3 only.

Do NOT reuse: `.bulkBarHead`'s navy (`page.module.css:5229-5239`) - it is a
selection-mode signal; `.ghBadge*` for chips (they are status badges); `.field`
itself in this header (its `input` rule is 16px with 12/16px padding).

---

## 5. The proposed overhaul

### 5.1 Target look, in words

ONE framed object: header and table share a single 1px `--card-border` frame
(radius-md) on the scroll shell. Inside it, the sticky header is a flat surface
with `space-3` padding (its left edge aligns with the table's cell padding) and
two rows separated by `space-2`: **row 1** - folder title (`--font-size-lg`, 600)
on the left with its two meta lines beneath it side by side, Grade and Post
right-aligned as a group; **row 2** - the grade-set input, then the search input,
then chips and the counter, all one compact toolbar row that wraps on narrow
widths. A 1px `--border-soft` hairline closes the header. The column-header row
below is bottom-aligned with content-width buttons, so plain column labels sit
next to the data instead of floating at the top of a tall row. The run bar loses
its own box. Chips become the app's pill chips; the listbox gains elevation,
hover and selected styling.

No emoji, no new colour, no new token, no uppercase, no new font size.

### 5.2 Class by class (CSS in `src/app/components/repo-grades/repo-grades.module.css`)

| # | Selector (existing line) | Change | Why / issue closed | Pin it must not break |
|---|---|---|---|---|
| 1 | `.stickyShell` (`:24-27`) | ADD `border: 1px solid var(--card-border); border-radius: var(--radius-md);`. Keep `max-height`, `overflow: auto`. | One frame for header + table (V10, V1). `overflow:auto` also clips the thead corners to the radius (V10). | W-A1 (`:42-46`): max-height + overflow present. |
| 2 | `.gridWrap` (`:37-40`) | REMOVE `border` and `border-radius` (frame moved to #1). KEEP the rule (it is referenced at `RepoGradesGrid.tsx:487`, and W-A2 requires `.gridWrap` to exist and not scroll). | Avoid a double frame (V10). | W-A2 (`:59-62`). Orphan: still referenced, no delta. |
| 3 | `.stickyWorkingHeader` (`:29-35`) | KEEP `position: sticky; top: 0; left: 0; z-index: 3; background: var(--field-background)`. ADD `display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-3); border-bottom: 1px solid var(--border-soft);`. NO overflow. | Makes the wrapper a real layout owner: gap, alignment, one hairline (V1, V2, V3). `offsetHeight` includes the padding, so `--rg-working-header-h` stays exact (`StickyHeader:54`). | W-A3 (`:64-71`): sticky, top 0, left 0, z-index 3, `background: var(`. Wave B `:103`: the opening tag must stay `<div className={styles.stickyWorkingHeader}`. |
| 4 | `.runBar` (`:886-898`) | KEEP `position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap`. REMOVE `padding`, `background`, `border`, `border-radius`. ADD `flex: 1 1 100%` so it occupies row 1 of the header's flex layout. | Kills the box-in-box (V2). | W3-R4 (`repoGrades.wiring.test.ts:957-968`): the literal selector `.runBar {` must exist, with `position: sticky` and `top:`. |
| 5 | `.runBarContext` (`:900-905`) | ADD `flex-direction: row; flex-wrap: wrap; align-items: baseline; column-gap: var(--space-3);` KEEP `flex: 1 1 240px; min-width: 0`. | Folder title on its own line, the two meta lines side by side: one line saved (V8). | none |
| 6 | `.runBarFolder` (`:907-910`) | ADD `flex: 1 0 100%; font-size: var(--font-size-lg);` KEEP weight and colour. | Matches `.columnHeaderFolder` (`:247-249`) so the same name reads at one size (V6). | none |
| 7 | NEW descendant `.runBarContext .postReason` | `font-style: normal; color: var(--text-secondary);` (no new class name; uses the existing `postReason`, so it is NOT an orphan candidate). | Meta text from ~2.6:1 to ~7.6:1 (V7, computed C). Scoped, so per-cell reasons (`RepoGradeCellControl.tsx`) are untouched. | none |
| 8 | NEW `.headerInput` | `flex: 0 1 320px; min-width: 0; padding: var(--space-2) var(--space-3); border: 1px solid var(--field-border); border-radius: var(--radius-sm); background: var(--field-background); color: var(--text-primary); font: inherit; font-size: var(--font-size-md);` plus `.headerInput::placeholder { color: var(--text-muted) }` and `.headerInput:focus { border-color: var(--accent) }`. Applied to BOTH inputs. | One input recipe (V3, V4): matches MUI small (0.9rem), takes placeholder and focus states. | Wave B `:94-98`: value, `onSearchChange(`, `aria-label` containing "search" stay on the input. |
| 9 | NEW `.gradeSet` | `display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); position: relative; flex: 0 1 auto; min-width: 0;` (replaces `WRAP_STYLE`). `position: relative` is the listbox's anchor - keep. | Inline -> class so the header can lay it out (V1). | Wave C pin B (`:65-73`): no `useState<Set`, no `"ta-`, no `localStorage` in the file. |
| 10 | NEW `.gradeSetChip` / `.gradeSetChipRemove` | values mirrored from `TasksGrid.module.css:42-53` and `:57-71` (pill, accent tint, 18px circle remove). | Chips match the app's chip (V5). | none |
| 11 | NEW `.gradeSetList` / `.gradeSetOption` | list: values of `LIST_STYLE` (`Typeahead:37-52`) KEPT (absolute, `top:100%`, `left:0`, `z-index:5`, `max-height:240px`, `min-width:260px`, scroll) ADD `box-shadow: var(--shadow-md)`. option: `padding` of `OPTION_STYLE`, `cursor: pointer`, `.gradeSetOption:hover { background: var(--accent-surface) }`, `.gradeSetOption[aria-selected="true"] { font-weight: 600 }`. | Popup elevation, hover, selected (V5). The keyboard story is unchanged (Enter picks `matches[0]`, `Typeahead:92-98`); hover is a mouse affordance only. | `max-height` stays on the scroll block (W-A2 `:48-57` requires every `overflow: auto/scroll` block to have `max-height`). |
| 12 | NEW `.gradeSetStatus` | `display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-md); color: var(--text-secondary);` | Counter reads as secondary text (V6). | Wave C `:95-100`: `summary &&`, both action labels stay. |
| 13 | `.grid thead th` (`:65-72`) | KEEP `position: sticky; top: var(--rg-working-header-h, 0px); background: var(--field-background); z-index: 2`. ADD `vertical-align: bottom;` and (hypothesis U) `box-shadow: inset 0 -1px 0 var(--border-soft);` for a hairline that survives `border-collapse: collapse`. | Labels sit next to the data; seam under the sticky row (V8, V10). | W-A4 (`:73-79`) and W-A5 (`:81-85`, the SECOND `.grid thead th` block at `:526-528` must keep `position: static`). |
| 14 | `.columnHeader` (`:238-245`) | ADD `align-items: flex-start;` and `.columnHeader select { align-self: stretch }`. | Buttons size to their label instead of stretching the whole column (V8). | none |

Estimated class additions: 7 new classes (`headerInput`, `gradeSet`,
`gradeSetChip`, `gradeSetChipRemove`, `gradeSetList`, `gradeSetOption`,
`gradeSetStatus`). Estimated CSS growth: about 70 added, about 12 removed lines;
`repo-grades.module.css` is 910 lines now, so about 970 after. CSS is NOT
covered by the size gate (`file-size-ceiling.structure.test.ts:106` matches
`.ts`/`.tsx` only) but DEV_LOOP's 1000-line rule applies in spirit - the
wave must re-measure.

### 5.3 TSX changes (minimal, className swaps - no markup structure change)

- `RepoGradesStickyHeader.tsx`: delete `SEARCH_INPUT_STYLE` (`:15-25`) and its
  stale comment (`:15` says a new class would move the exact orphan ratchet; that
  is only true of an UNREFERENCED class - section 7); `style={...}` ->
  `className={styles.headerInput}` on the one input (`:71`). No element added,
  removed or reordered, so W-A8 (`:100-109`) and Wave B `:84-92` hold.
- `RepoGradesGradeSetTypeahead.tsx`: delete the six inline style constants
  (`:16-54`); add `import styles from "./repo-grades.module.css";` (this file
  imports no stylesheet today; `RunBar` and `StickyHeader` already do, so the
  runtime-import closure is unchanged); swap each `style=` for the matching
  class (`:75,83,101,102,108,121,129`); add `className` to the chip remove
  `<button>` (`:123`). `role`, `aria-*`, handlers and the `x` text untouched.
- `RepoGradesRunBar.tsx`: NO change by default (the `.runBar` wrapper keeps its
  `<div className={styles.runBar}`, which W3-R3 slices from at
  `repoGrades.wiring.test.ts:940-945`).
- **A DOM wrapper is not needed.** If one is added later (e.g. around the two
  buttons), W3-R3 slices from `<div className={styles.runBar}` to the FIRST
  `</div>` and counts exactly 2 `<Button`: a wrapper `<div>` placed BEFORE the
  buttons would close that slice early and read 0. A `<span>` wrapper, or a
  `<div>` that CONTAINS both buttons, is safe.

### 5.4 What is NOT changed (so nobody re-litigates it)

`index.tsx` (998 lines, `@(Get-Content ...).Count`, 2 under the ceiling - it
must not be touched; no prop changes are needed), `RepoGradesControls.tsx`,
`RepoGradesGrid.tsx`, every handler, every `aria-*`, the persisted state and
all storage keys, the Grade / Post / Show all / Clear / Refresh behaviour, the
duplicate Grade/Post in the column header (F2), the binding badges (R7), the
thead letter case (U26b), and the 700px breakpoint block.

### 5.5 Preview-time options (taste, decided on screenshots, not by the owner up front)

- **P1 - visible labels** for the two inputs (micro-label idiom). Costs a
  `<span>` or `<label>` per input in two files and about 14px of height or an
  inline label. Add only if the two inputs still read as the same control after
  the gap and the side-by-side layout.
- **P2 - Grade/Post hierarchy**: keep both `contained` (default), or make one
  `outlined`. It must change in BOTH places (`RunBar:92-114`,
  `Grid:422-444`) or the two surfaces disagree. W3-R3 counts `<Button` only, so
  a prop change passes, which is exactly why this needs eyes.
- **P3 - thead tint** (`CoursesTable.module.css:132` idiom) via a custom
  property (`--rg-thead-bg: color-mix(...)`, `background: var(--rg-thead-bg)`)
  so W-A4's literal `background: var(` pin still matches. Default: no tint.

---

## 6. Machine-checkable acceptance criteria

Nothing renders under vitest; each of these proves a mechanism, and says so.
Gate form: one `npm run test:paths <p1> <p2> ...` with ONE path per argument,
quoting the wrapper's per-argument `COVERED` / `NOT COVERED` lines
(`docs/loop/this-repo.md` section 1). **Baseline measured 2026-10-05 at HEAD:
10 of 10 arguments COVERED, 198 tests passed** (command in section 11).

| Id | Object compared | Instrument | Pass | Direction of failure |
|---|---|---|---|---|
| VH-1 sticky mechanism kept | `.stickyWorkingHeader` and `.grid thead th` rule blocks, and the narrow un-stick | `repoGradesWaveASticky.structure.test.ts` W-A3, W-A4, W-A5, W-A1, W-A2 (11 tests) | all pass | any red, or `NOT COVERED` |
| VH-2 DOM order / placement | header-file source order shell, header, run bar, input, children; run bar still mounted in the header only | W-A6..W-A9; `repoGradesWaveBSearch.structure.test.ts` (12); `repoGradesWaveCTypeahead.structure.test.ts` (11) | all pass | reorder, removal, or a second run-bar mount reds |
| VH-3 no control removed | count of `<input`, `<button`, `<select`, `<Button` per file before vs after | `Select-String`/`grep -c` over the four TSX files; baseline (lines matching): StickyHeader input 1; RunBar Button 2; Typeahead input 1, button 1, Button 2; Grid input 1, button 2, select 2, Button 2. Plus W3-R3 (`wiring.test.ts:940-955`, exactly 2 `<Button` in the run-bar slice) | after >= before for every cell; W3-R3 green | any decrease |
| VH-4 orphan ratchet | total orphan count vs the pin | `page-module-css-orphan-classes.test.ts:419-437` asserts `toBe(PINNED_ORPHAN_CEILING)`; pin is **118** (`:316`); `docs/css-orphans.md:19` `Total: 118 ... of 1246 defined across 31 stylesheets`; repo-grades sheet `1 orphan of 68 defined` (`.srOnly`, `docs/css-orphans.md:42-46`) | after the wave: total still 118 (delta 0), repo-grades orphans still exactly `.srOnly`, defined 68 -> 75 (7 new classes, all referenced) | EITHER direction: a defined-but-unreferenced class raises it (pin must NOT be raised); a dropped reference raises it; a removed-class fall requires lowering the pin in the same commit |
| VH-5 every new class is referenced | each of the 7 new names appears as `styles.<name>` in comment-stripped TSX, and every `styles.x` resolves | the ratchet above plus `page-module-css-classes.test.ts` (10 tests) | both green | a class only named in a comment (the scanner strips comments, `page-module-css-orphan-classes.test.ts:187-189`) counts as orphan |
| VH-6 canaries untouched | `FROZEN_REPO_GRADES_ROOTS` literal and the storage-key set | `repoGradesFeedbackAndFiles.wiring.test.ts` (31) and `repoGradesStorageKeys.structure.test.ts` (5), with `git diff --stat` showing NO added or removed non-test file in `src/app/components/repo-grades/` and NO added `"ta-` string | green; diff names only the files in section 7 | a new root file, a new `ta-` key |
| VH-7 frame/card guard | the sheet defines no card frame (shell radius + `--shadow-lg`) | `repoGradesSliceA.guards.test.ts:248-250` (37 tests) | green | adding `--shadow-lg` with `--radius-xl` to a rule |
| VH-8 size | line counts | `@(Get-Content <file>).Count` on `repo-grades.module.css` (910 now), the three touched TSX, and `file-size-ceiling.structure.test.ts` (3) | CSS <= 1000; ceiling test green; `index.tsx` NOT in `git diff --name-only` | any file over 1000; `index.tsx` modified |
| VH-9 types/lint/bytes | tsc, eslint, emoji and byte scans | `npx tsc --noEmit` (no output); `npm run lint` (exit 0, no NEW warning in the touched files vs a pre-change run - do NOT pin the count, `this-repo.md` section 1); `no-emojis.test.ts`, `source-bytes.structure.test.ts` via `test:paths` | clean | any output / new warning in touched files |
| VH-10 NEW pins (test seat to author, proposed) | (a) `.stickyWorkingHeader` block contains no `overflow`; (b) both inputs carry `styles.headerInput` (reachability, one per file); (c) `.gradeSetList` keeps `z-index`/`max-height`; (d) the chip remove `<button>` keeps its `aria-label` | extend `repoGradesWaveASticky.structure.test.ts` (an existing file; adds no non-test root) | green AND sabotage: delete the class from one input / add `overflow: hidden` to the header => the pin reds | a pin that stays green under that mutation is vacuous |

**The LOOK itself has NO machine criterion.** It is validated by the Browser
pane, section 8, and the owner walk.

---

## 7. Wave plan and the orphan-ratchet delta

**ONE wave, W1, CSS-first.** Disjoint from sibling GRADING-CHAT-VISUAL by file
set: this wave writes only
`src/app/components/repo-grades/repo-grades.module.css`,
`RepoGradesStickyHeader.tsx`, `RepoGradesGradeSetTypeahead.tsx`, and (test seat)
`repoGradesWaveASticky.structure.test.ts`. It does NOT write `page.module.css`.
`RepoGradesRunBar.tsx` joins the write set only if option P2 is taken (then
`RepoGradesGrid.tsx` too, same commit). Every wave file list includes the file
that CALLS each new class: the two TSX files are the callers of all 7.

**Shared resources not visible in that file list** (`docs/loop/parallel-disjointness.md`
idea): (1) the orphan pin `PINNED_ORPHAN_CEILING` and the regenerated
`docs/css-orphans.md` - the ratchet test rewrites that doc on every run
(`page-module-css-orphan-classes.test.ts:459-527`), and `git status --short`
already shows it modified in this tree before this wave; if the sibling's work
changes the orphan count, whichever lands second must re-measure; (2)
`npx tsc --noEmit` has one caller at a time; (3) `docs/BACKLOG.md` /
`docs/backlog.yml` belong to the orchestrator.

**Orphan-ratchet delta (explicit): 0.** Total stays 118. The 7 new classes are
defined AND referenced by `styles.<name>` in the two TSX files, so none is an
orphan; the one existing repo-grades orphan (`.srOnly`) is unchanged. The delta
is NOT zero if (a) any of the 7 is defined and not wired, (b) an inline-style
removal is done but the class swap is not, (c) `.gridWrap`, `.runBarContext`,
`.runBarFolder` or `.postReason` lose their `styles.` reference. Note the
`StickyHeader.tsx:15` comment ("no new CSS class: the orphan ratchet is exact")
is wrong as a rule: the ratchet moves only for UNREFERENCED classes
(`page-module-css-orphan-classes.test.ts:419-437`). Remove that comment with the
constant.

**Rollback:** `git revert` of the one commit; no persisted shape, no migration.

---

## 8. Validation path: build, preview, screenshot, iterate, show

1. **Path A - real components (preferred, UNVERIFIED that it boots here).**
   `.claude/launch.json` already defines a `dev` server on port 3000. The root
   layout needs `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` to construct its client;
   supply local placeholder values on the command line (not a `.env` file, no real
   credentials). A throwaway fixture route under a PUBLIC prefix avoids the auth
   gate: `PUBLIC_PATH_PREFIXES` includes `"/login"` (`src/lib/access.ts:319`) and
   `isPublicPath` returns before any session logic (`src/lib/supabase/proxy.ts:249`),
   so e.g. `src/app/login/rg-preview/page.tsx` can mount `RepoGradesStickyHeader`
   + `RepoGradesGrid` with fixture rows. I did not create it (this is a scope, and
   it must be deleted and never staged - gate it with `git status --short`).
   Whether the providers tolerate an unreachable placeholder Supabase URL is NOT
   known; budget a short spike as W1 step 0.
2. **Path B - static harness (fallback, built and used for this scope).**
   Copy `src/app/globals.css` and `repo-grades.module.css` verbatim into a scratch
   directory, transcribe the DOM from the TSX (section 2.1), serve it on
   `127.0.0.1`, open it in the Browser pane in a NEW tab (a `file://` page
   renders as a static snapshot and refuses page tools). Fidelity caveat: MUI
   buttons and fonts are approximated, so this proves layout, spacing, alignment
   and theme behaviour, not exact pixels.
3. **Procedure.** (a) Screenshot BEFORE at 1280x720 in light and dark, with the
   shell scrolled 0 and about 140px, and measure with `getBoundingClientRect`:
   header height, thead height, gap between the two inputs, left-edge x of the
   title vs the inputs vs the first checkbox, `getComputedStyle` of the header
   `background` in both themes. Baseline (harness): header 149px, thead 159px,
   gaps 0, shell max-height 542px. (b) Apply W1. (c) Screenshot AFTER, same
   states, plus 375px wide (the narrow block at `:521-629` and a sticky header
   that is NOT un-stuck at that width - R4) and with 0, 1 and 8 chips (chip row
   wrap) and the popup open (clipping, z-order over the thead). (d) Iterate on P1
   to P3. (e) Show the owner the before/after pair; the owner walk confirms taste.
4. **Estimated, not measured:** the new working header lands near 110px
   (padding 12+12, row 1 about 40, gap 8, row 2 about 36) against 149px today. If
   the preview shows it is NOT shorter than 149px, that is a finding, not a pass.

---

## 9. Forks, shaped so any answer terminates this activity

- **F1 - which "header".** This scope builds tiers 1 and 2 (recommended, section
  1). If the owner meant the controls form above the table, W1 still ships as
  written and the controls form becomes its own row with its own scope. Reading
  acted on in this scope: tiers 1 and 2. Cost of being wrong: W1 is not wasted
  (it is still the sticky header); the controls restyle is a separate wave.
- **F2 - duplicate Grade/Post in the column header (single-folder view).**
  Function-visible; the owner said functionality is fine, so W1 does not touch
  it. Collapsing the duplicate would save roughly 85px of sticky height
  (estimate: the Grade + Post + gap + rubric line of the column-header stack, from
  the harness's 159px; not measured as a removal). Recommended: leave it, file as a
  separate row if the owner wants it. Either answer ends this activity.
- **F3 - binding badge family vs `.ghBadge`.** Out of the header region (V9) and
  gated by REGRESSION entry 243. Recommended: leave. Either answer ends this
  activity.

---

## 10. Residual register

| Id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | The look is good (taste, hierarchy, density) | owner | Browser-pane before/after screenshots, light + dark, 1280 and 375 wide; owner walk | W1 preview step 8.3(d)-(e), then owner walk |
| R2 | Path A (real-component preview) boots with placeholder env | W1 implementer | `preview_start` `dev` + fixture route under `/login/` | W1 step 0 spike; fall back to Path B and record that |
| R3 | thead corners are clipped by the new shell radius (V10) | W1 implementer | screenshot of the top-left and top-right corner while scrolled | W1 preview |
| R4 | At <=700px the header stays sticky and may exceed a third of the viewport | owner decision, measured by W1 implementer | header `offsetHeight` at 375 wide vs viewport height; if large, consider un-sticking at <=700px (a function change, precedent `TasksGrid.module.css` per `repo-grades.module.css:488-494`) | W1 preview; a decision, not an auto-fix |
| R5 | Hairline under sticky thead survives `border-collapse: collapse` (the inset `box-shadow` hypothesis, class-13) | W1 implementer | screenshot with rows scrolled under the header | W1 preview |
| R6 | Contrast figures in V7 are hand-computed | W1 verifier | no contrast tool in this repo; recompute from the two theme definitions of `--text-secondary`, `--text-muted`, `--field-background` (`globals.css:22-26,291-295`) | verify step |
| R7 | Binding badges diverge from `.ghBadge*` (V9) | owner (touches REGRESSION entry 243) | `grep -c ghBadge src/app/components/repo-grades` (0 today) | only if the owner opens it |
| R8 | Duplicate Grade/Post (F2) | owner | n/a until chosen | only if the owner opens it |
| R9 | Shared ratchet pin / `docs/css-orphans.md` with the sibling item | orchestrator | `page-module-css-orphan-classes.test.ts` total vs 118 after each lands | the later of the two pushes |
| R10 | Harness approximates MUI Button and fonts | W1 implementer | Path A, or accept Path B's caveat in the report | W1 preview |
| R11 | Keyboard, focus and ARIA of the restyled typeahead are reading claims; no component renders under vitest | verify seat + owner walk | VH-10(d) pin plus manual Tab/Escape/Enter pass | verify step, owner walk |

---

## 11. Measurement log: the command behind every quantity

- Line counts: `@(Get-Content <file>).Count` (PowerShell): `index.tsx` 998,
  `repo-grades.module.css` 910, `RepoGradesStickyHeader.tsx` 82,
  `RepoGradesRunBar.tsx` 117, `RepoGradesGradeSetTypeahead.tsx` 141,
  `RepoGradesGrid.tsx` 651, `page.module.css` 7034. (`wc -l` agreed on the six
  repo-grades files.)
- Orphan ratchet: pin 118 from `page-module-css-orphan-classes.test.ts:316`; total
  `118 of 1246 defined across 31 stylesheets` from `docs/css-orphans.md:19`
  (written by the test, header date 2026-10-05); repo-grades `1 orphan of 68`
  from `docs/css-orphans.md:42-46`.
- Baseline gate, 2026-10-05, PowerShell: `npm run test:paths` with these ten
  arguments, one path per argument -
  `src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts`,
  `.../repoGradesWaveBSearch.structure.test.ts`,
  `.../repoGradesWaveCTypeahead.structure.test.ts`,
  `.../repoGrades.wiring.test.ts`, `.../repoGradesSliceA.guards.test.ts`,
  `.../repoGradesFeedbackAndFiles.wiring.test.ts`,
  `.../repoGradesStorageKeys.structure.test.ts`,
  `src/app/components/courses/page-module-css-orphan-classes.test.ts`,
  `src/app/components/courses/page-module-css-classes.test.ts`,
  `src/file-size-ceiling.structure.test.ts`. Result: `Test Files 10 passed (10)`,
  `Tests 198 passed (198)`, and a `COVERED` line for each of the ten (11, 12, 11,
  69, 37, 31, 5, 9, 10, 3 passing assertions). Running it regenerated
  `docs/css-orphans.md` (already modified in the tree).
- This document: `npm run docs:gate` (PowerShell, 2026-10-05) - `COVERED`
  `no-emojis.test.ts` 18, `source-bytes.structure.test.ts` 3,
  `gate-commands.structure.test.ts` 28, `Tests 49 passed (49)`; byte scan of this
  file: 0 non-ASCII, 0 NUL; `@(Get-Content docs/repo-header-visual-scope.md).Count`
  584.
- Control counts per file: `grep -c '<input'` (etc.) over the four TSX files,
  lines matching, not occurrences.
- Harness numbers (V1, V2, V8, section 8.3): `getBoundingClientRect` and
  `getComputedStyle` via the Browser pane `javascript_tool` on
  `http://127.0.0.1:8765/current.html` (scratchpad, python `http.server`, since
  stopped), viewport 1280x720, dpr 1: header 149, run bar 71, grade-set row 39,
  search 39, thead 159, inter-element gaps 0, header background
  `rgb(255, 255, 255)`, shell max-height 542px, `.grid` `border-collapse: collapse`.
- Contrast (V7): hand arithmetic from the hex values in `globals.css`; no tool.
- Badge claim (V9): Grep `ghBadge` over `src/app/components/repo-grades` (0
  matches) and over `ClassTrendsPanel`/`RowFeedbackBoxes`/`FeedbackExpandModal`
  (0 matches); `Grep 'bindingBadge|Badge'` over `*.tsx` there returns the four
  `RepoBindingControl.tsx` lines only.

## 12. What I could not determine

- Whether the real page, with real MUI and real fonts, looks as the harness does.
- Whether Path A boots (section 8.1).
- Whether `border-collapse: collapse` loses the sticky-th hairline in the target
  browser (V10, R5) and whether the shell radius clips the thead corners (R3).
- Real contrast, real shell height at the owner's actual viewport, and the
  owner's taste (R1). The owner's viewport is unknown; harness was 1280x720.
- Whether the sibling GRADING-CHAT-VISUAL touches `page.module.css` or anything
  that moves the orphan count (R9); I stayed out of its files and cannot see its
  write set.
