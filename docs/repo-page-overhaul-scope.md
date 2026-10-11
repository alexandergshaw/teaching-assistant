# Scope (UMBRELLA): the Repo Grades page click-distance and scroll-distance overhaul

Owner request, 2026-10-11, verbatim: "the repo page overall needs a click
distance and scroll distance overhaul."

This is the UMBRELLA for the Repo Grades view
(`src/app/components/repo-grades/`). It CONSUMES two moves the owner already
asked for and that are ALREADY SCOPED + CHECKING - they are this overhaul's
concrete FIRST moves and are NOT re-planned here:

- **W1 = REPO-GRADES-MODULE-PICKER-HEADER** (`docs/repo-grades-module-picker-header-scope.md`):
  move the "Assignment folder to grade" picker into the sticky working header.
- **W2 = REPO-GRADES-STATUS-PROMINENCE** (`docs/repo-grades-status-prominence-scope.md`):
  a prominent sticky spinner + count banner in the working header during a run.

Beyond W1/W2 this scope adds **W3** (promote the re-scan control into the
sticky header) and **W4** (collapse the setup stack so the grid rises). Each
wave is independently shippable. `REPO-GRADING-REMOVE-ACTIVITY-LOG` shipped at
`cef512f0`; the baseline below is HEAD + the two scoped moves' expected state.

This is `loop-architect` output; a `loop-checker` reads it before any build.
Every quantity names the command that produced it; every `file:line` was opened.
This scope is read-only and may be written now.

**Class (leverage).** This is a CLICK-COST / SCROLL-COST UX change - the STRUCK
class in `docs/loop/leverage.md` ("Click cost ... real and worth counting ...
not a categorical advantage over a chat"). No categorical leverage claim is made
and none is earned; the removal test for every move is an OWNER WALK, because no
component renders under vitest and clicks/scroll/attention are exactly what the
suite cannot observe (`docs/loop/leverage.md` "Honest limit"; `seats.md` Test
seat). Stated once here; repeated per wave only where the wave needs it.

**Diagnostics representation (DEV_LOOP b907ff8e).** NONE per move, and justified:
every move is a PRESENTATIONAL relocation / collapse of an existing control, with
no new data path and no new failure mode. The grading diagnostics seam
(`timeGradingAction`, both grading hooks) is untouched by every wave. Any wave
that later turns out to add a failure mode states and owns a diagnostic then; as
scoped, none does.

---

## 1. The view, and what has ALREADY shipped (so this does not redo it)

**The view.** `RepoGradesTab`, default export of
`src/app/components/repo-grades/index.tsx` (`TabHeader` title "Repo Grades",
`index.tsx:596-600`), mounted in `page.tsx`'s `<TabShell>` which supplies the
`.card` wrapper (`index.tsx:586-594`).

**DOM render order today** (each item below is a direct flex child of `.card`,
because `index.tsx` returns a fragment and `RepoGradesControls` /
`RepoGradesStatusBanners` ALSO return fragments, so their blocks flatten into
`.card` and each takes the `.card` gap - this flattening is load-bearing for
the scroll baseline, section 2):

1. `TabHeader` - eyebrow + h1 + subtitle (`index.tsx:596-600`). Static.
2. `RepoGradesControls` (`index.tsx:602-642`) - flattens into two blocks:
   - `.adaptRow` of the cheap pickers: Course `Typeahead`, Repo name filter +
     Refresh, Folder, Sort (`RepoGradesControls.tsx:360-496`); each field
     `flex: 1 1 220px` (`PICKER_FIELD_STYLE`, `:302`).
   - the `<details>` "Grading settings" disclosure (`:498-678`): README /
     selection-only / code-scoring checkboxes, instructions textarea,
     rubric-source `<select>`, rubric textarea.
3. `RepoGradesStatusBanners` (`index.tsx:644-660`) - up to ~9 stacked loading /
   error / empty paragraphs (`RepoGradesStatusBanners.tsx:74-151`), each a
   separate `.card` child; zero when a course has loaded cleanly.
4. `LinkUsernamesPanel` (`index.tsx:674-697`, gated on `course`) - a `<details>`
   disclosure (source toggle, roster/live section, Confirm-all).
5. `noConfirmedRows` banner paragraph (`index.tsx:706-712`).
6. `postSummary` region - the view's SINGLE `role="status" aria-live="polite"`
   region (`index.tsx:730-734`).
7. `trendsEntry` panel - the last Grade-all run's class trends, `defaultExpanded`
   (`index.tsx:740-749`).
8. `RepoGradesFolderHint` - named counts, single-folder only (`index.tsx:752-759`).
9. `RepoGradesStickyHeader` (`index.tsx:763-815`) - the bounded scroll shell
   `.stickyShell` (`max-height: calc(100vh - topbar 58px - banner - 120px)`,
   `repo-grades.module.css:24-29`) enclosing:
   - `.stickyWorkingHeader` (sticky `top:0 z-index:3`,
     `repo-grades.module.css:31-43`): the single-folder run bar (Grade/Post),
     the grade-set typeahead, the Search box (`RepoGradesStickyHeader.tsx:53-68`).
   - the `RepoGradesGrid` table, whose `<thead>` sticks at
     `top: var(--rg-working-header-h)` below the working header
     (`repo-grades.module.css:194-203`), each column header carrying its own
     Canvas-assignment `<select>` + Grade + Post + sort button
     (`RepoGradesGrid.tsx:380-447`).
10. Discard-saved-results button, at the very bottom, below the shell
    (`index.tsx:817-825`).

**Already shipped - do NOT re-plan:**

| Prior work | What it did | Cite |
|---|---|---|
| A7 W2 | Single-course auto-select; "Grading settings" and Link-usernames made persisted `<details>` disclosures via `effectiveOpen` | `index.tsx:155-158,640-641,693-694`; `RepoGradesControls.tsx:498-507`; `LinkUsernamesPanel.tsx:254-260` |
| A7 W3 | The sticky run bar (single-folder Grade/Post) relocated into the working header, forwarding the SAME confirmed handlers as the column header | `RepoGradesRunBar.tsx:1-15,83-115`; `repo-grades.module.css:934-971` |
| A7 W3 R4 | The four cheap pickers grouped into ONE wrapping `.adaptRow` | `RepoGradesControls.tsx:359-496`; pinned `repoGrades.wiring.test.ts:873-883` (W3-R7) |
| RG-SEARCH-STICKY A | The one bounded sticky scroll shell; thead re-pins below the working header via a ResizeObserver-published `--rg-working-header-h` | `RepoGradesStickyHeader.tsx:33-49`; `repo-grades.module.css:21-43,194-203` |
| RG-SEARCH-STICKY B | The Search box in the working header (narrows the table body only) | `RepoGradesStickyHeader.tsx:57-67`; `index.tsx:766,398` |
| RG-SEARCH-STICKY C | The grade-set typeahead in the working header (drives the one selection Set) | `RepoGradesGradeSetTypeahead.tsx`; `index.tsx:765` |

**Consequence for this overhaul.** The HIGH-frequency controls are already in
the sticky header (search, grade-set, single-folder Grade/Post) or will be after
W1 (folder) and W2 (status). What remains above the grid and is NOT yet in the
header is the SETUP stack (items 1-8). The overhaul's remaining value is (a)
putting the one mid-work control still in setup into the header (W3), and (b)
shrinking the setup stack so the grid rises (W4). This is a deliberately SMALLER
remaining surface than "overhaul" might imply, because A7 + RG-SEARCH-STICKY +
W1 + W2 already carry most of the load; stated plainly rather than padded with
speculative waves (`docs/loop/leverage.md` negative example - do not dress a
thin remainder as more than it is).

---

## 2. Measured baseline: per-task click / cursor / scroll cost

No component renders under vitest (`docs/loop/this-repo.md` section 6), so every
number below is an ESTIMATE from code + CSS-token arithmetic, labelled as such.
Click counts are counted from the code paths; scroll figures use the measured
tokens below. Tokens (`grep -nE -- "--space-[0-9]+|--font-size-|--topbar-height" src/app/globals.css`):
`--space-2 = 8px`, `--space-3 = 12px`, `--space-6 = 24px`; `--font-size-3xl = 28px`
(h1), `--topbar-height = 58px`. The `.card` wrapper gaps its children by
`var(--space-6) = 24px` and pads `24px` (`src/app/page.module.css:29-36`,
`.card`).

**Measured correction (refuse a ruling I can disprove).** `index.tsx:593` says
the shell is "`.card` (gap: 28px; padding: 36px)". The code is
`gap: var(--space-6); padding: var(--space-6)` = **24px / 24px**
(`src/app/page.module.css:34-35` + the token table). The comment is stale; the
arithmetic below uses the measured 24px. Non-blocking; recorded as RES-7.

### 2a. Scroll distance from the view top to the grid (estimate)

Each above-grid block costs its own height plus one 24px `.card` gap. Steady
state (course chosen, repos bound, no errors, settings + link collapsed, no run
yet):

| Block | Est. height | Note |
|---|---|---|
| TabHeader | ~100px | eyebrow + 28px h1 + subtitle |
| gap | 24px | |
| picker `.adaptRow` | ~62px | label ~16px + input ~37px + gap 8px (one row at wide width) |
| gap | 24px | |
| "Grading settings" collapsed summary | ~24px | one line |
| gap | 24px | |
| Link-usernames collapsed summary | ~44px | h3 (16px) + hint |
| gap | 24px | |
| **Total above grid, steady state** | **~350px** | grid top sits ~350px below the view top |

After a Grade-all run the stack ALSO carries `postSummary` (~40px + gap) and the
`trendsEntry` panel expanded (label + `ClassTrendsPanel`, ~220px + gap), pushing
the grid top to **~670px** below the view top (estimate). The single-folder view
adds `RepoGradesFolderHint` (~24px + gap) when some repos lack the folder.

Worst offender: the grid - the primary work surface - sits a third to two-thirds
of a screen below the view top, and that distance GROWS after the first run
(trends) rather than shrinking. This is the scroll lever W4 targets.

### 2b. Per-task interaction cost (estimate; first use / repeat)

Scroll is reported relative to where the cursor already is for a REPEAT of the
task (the number that decides whether a feature is used twice - `seats.md` UX).

| Task | Clicks (first / repeat) | Cursor / scroll today | After W1-W4 |
|---|---|---|---|
| **Set up a grade run** (course + instructions/rubric) | ~4 / ~2 | pick Course (top), expand "Grading settings" (1 click), type instructions, pick rubric source (1); at the top of the view, ~0 scroll initially | unchanged; W4 adds one expand-setup click but keeps the grid near the top afterward |
| **Switch folder** | 1 / 1 | TODAY: scroll UP ~350px to the picker row, 1 click, scroll back; the picker is in `RepoGradesControls`, far above the shell | **W1**: 1 click in the sticky header, ~0 scroll |
| **Grade one folder** (single-folder) | ~3 / ~2 | folder (header post-W1) + map Canvas assignment (grid thead `<select>`, sticky) + Grade (run bar, header). Status is only the button LABEL today | **W2**: status is a prominent sticky banner, visible while scrolling |
| **Grade all folders** (ALL_FOLDERS) | ~2N / ~2N for N folders | no run bar in this view; per-column Grade in the sticky thead (reachable). Status per column = button label only | **W2** covers both start paths (the banner binds view-level `bulkRunningFolder`) |
| **Post grades** | 1 (single) / N (all) | single-folder Post in the run bar (header); all-folders Post per column in the sticky thead | unchanged (already reachable) |
| **Link usernames** | ~4 / ~3 | scroll to the Link panel (above grid), expand (1), choose source (0-1), pick assignment + Link (live) or Apply (roster) (1-2), Confirm all (1) + `window.confirm` | W4 collapses it into the unified setup region (one extra expand click; done once per course) |
| **Search / filter** | type / type | Search box + grade-set typeahead, both in the sticky header, ~0 scroll | unchanged (RG-SEARCH-STICKY) |

**Worst offenders today, ranked:**

1. **Switch folder** costs a ~350px scroll-up-and-back because the picker is in
   the setup stack, not the header - the single clearest click/scroll waste, and
   exactly W1's target.
2. **The grid sits ~350-670px below the view top** and that distance grows after
   a run - W4's target.
3. **Grade status is invisible during a run** except as a small button label -
   W2's target.
4. **Re-scanning repos** (to pick up new pushes mid-grading) requires a
   scroll-up to the Refresh button buried in the repo-filter block
   (`RepoGradesControls.tsx:400-402`) - W3's target.

These four map one-to-one onto W1 (switch folder), W2 (status), W3 (re-scan),
W4 (grid rises). Nothing else in the view clears the bar for a dedicated wave;
the remaining candidates are owner forks, recorded as residuals (section 10),
not planned waves.

---

## 3. The shape decisions every later wave is built against

**(a) The surface the user reaches is the `.stickyWorkingHeader` div, and that
is a LAYER.** W1, W2 and W3 each add a control/indicator as a node prop threaded
from `index.tsx` into `RepoGradesStickyHeader` and rendered inside
`.stickyWorkingHeader` - the SAME mechanism as the existing `gradeSetControl`
(`RepoGradesStickyHeader.tsx:24,55`). There is no "library with no surface" gap:
for each move, name the node, the div that renders it, and the prop that carries
it. The header is `display:flex; flex-wrap:wrap` (`repo-grades.module.css:37-38`)
and the thead's sticky offset auto-adjusts to header growth via the
ResizeObserver (`RepoGradesStickyHeader.tsx:33-49`), so adding controls cannot
break column alignment or the thead offset.

**(b) The scroll lever is COLLAPSE, not relocation.** Every control cannot live
in the sticky header - it would grow the header until it eats the grid it sits
above (the header is INSIDE the bounded shell). So the setup controls that are
touched ONCE (Course, instructions, rubric, link) stay out of the header and
instead COLLAPSE (W4), reusing the persisted-disclosure idiom A7 established
(`effectiveOpen`, `settingsOpen`/`linkPanelOpen`). The mid-work control (re-scan)
goes INTO the header (W3). The dividing test: a control touched while looking at
the grid goes in the header; a control touched only during setup collapses.

**(c) Guards that CONSTRAIN these waves (do not fight them; update them WITH the
feature that loosens them).** Two source-text guards pin the current shape:

- **W3-R7** (`repoGrades.wiring.test.ts:873-883`): asserts the `htmlFor` of
  `repo-grades-course`, `repo-grades-org-prefix`, `repo-grades-folder`,
  `repo-grades-sort` all sit inside `RepoGradesControls`'s `.adaptRow`, before
  the first `<details>`. W1 removes `repo-grades-folder`; W4 moves the row
  inside a parent disclosure. BOTH must edit this guard in the same commit that
  loosens it (`traps-spec.md`: never ship a loosened guard without the feature).
- **A-6 trends pin** (`repoGradesClassTrends.wiring.test.ts:583-589`): asserts
  EXACTLY ONE `ClassTrendsPanel`, mounted with `defaultExpanded` and NO value.
  This forecloses "default-collapse the trends panel" as a quiet change - it is
  a guarded behaviour, so collapsing trends is an owner fork (RES-4), not a
  planned wave.

**(d) RES-6 - CLOSED (2026-10-11, verified by check a53e5e25).** This finding
anticipated that W1's write set omitted `repoGrades.wiring.test.ts` and would red
W3-R7 by removing `repo-grades-folder` from `RepoGradesControls`. W1 SHIPPED at
`b22e257d` and handled it: the current W3-R7 (`repoGrades.wiring.test.ts:873-883`)
loops only THREE ids (`repo-grades-course`, `repo-grades-org-prefix`,
`repo-grades-sort`), and a NEW W3-R7b (`:885-899`) asserts `repo-grades-folder`
MOVED to `RepoGradesFolderPicker.tsx` via the `folderControl` slot (that file is in
`FROZEN_REPO_GRADES_ROOTS`). RES-6 is discharged, not a live routing item. (Any
section below still describing W3-R7 as a "four id" loop is stale wording from the
pre-W1 draft; the real guard is three ids + W3-R7b.)

---

## 4. The wave plan

Four waves, all SERIALIZED on `index.tsx` (every wave edits it - section 6), each
rebased onto the prior wave's commit, all after the `REPO-GRADING-REMOVE-ACTIVITY-LOG`
commit (`cef512f0`, shipped). Order: W1 -> W2 -> W3 -> W4 (W1/W2 order between
themselves is the orchestrator's; both are "serialize"). Re-measure line counts
against each prior commit before building.

### W1 = REPO-GRADES-MODULE-PICKER-HEADER (CONSUMED - not re-planned)

**Change:** move the "Assignment folder to grade" picker from
`RepoGradesControls` into the sticky working header, wired to the same
`handleFolderChange` / `currentSelectedFolder` and the same
`persistFolderSelection` -> `ta-repo-grades-folder`.
**Saving (estimate):** switch-folder drops from ~350px scroll-up-and-back + 1
click to 1 click, ~0 scroll - the single largest click/scroll waste in the view.
**Write set + AC + instruments:** `docs/repo-grades-module-picker-header-scope.md`
sections 8-9. SHIPPED `b22e257d` (RES-6 handled in-wave: W3-R7 reduced to three
ids + new W3-R7b for the moved folder id).

### W2 = REPO-GRADES-STATUS-PROMINENCE (CONSUMED - not re-planned)

**Change:** a prominent sticky spinner + count banner (`Grading <done> of
<total> in <folder>...`) in the working header while a bulk run is in progress,
bound to view-level `bulkRunningFolder` / `bulkProgress`, covering BOTH the
single-folder and ALL_FOLDERS start paths; visual-only (no second aria-live
region).
**Saving (estimate):** grade status becomes visible-while-scrolling instead of a
small button label; 0 clicks saved, attention cost removed (the owner's
"prominence" ask).
**Write set + AC + instruments:** `docs/repo-grades-status-prominence-scope.md`
sections 4-5, 8.

### W3 (NEW): promote the re-scan control into the sticky working header

**Concrete change.** The Refresh button currently lives next to the repo-name
filter in `RepoGradesControls` (`RepoGradesControls.tsx:400-402`), reachable only
by scrolling up to the setup stack. Move the re-scan control into
`.stickyWorkingHeader` as a node prop (mirroring `gradeSetControl` /
`folderControl`): a small browser-safe leaf (recommended
`RepoGradesRescanControl.tsx`, or built inline in `index.tsx` to avoid a new
directory-root - RES-5) that renders a button driven by the existing
`scanLoading` + `reloadScan()` already in `index.tsx` (passed today as
`onRefreshScan`, `index.tsx:611-612`). The repo-name filter TEXT field stays in
setup (it is a setup control); only the Refresh/Re-scan BUTTON moves. The button
keeps its `scanLoading` -> "Scanning..." busy label (`RepoGradesControls.tsx:401`).

**Reachability pin (do not ship visible-but-dead).** The relocated button's
`onClick` is `reloadScan` and its disabled state is `scanLoading` - the SAME two
expressions it is bound to today (`RepoGradesControls.tsx:400`). AC-W3-2 is the
executable form.

**Saving (estimate):** re-scan drops from a ~350px scroll-up + 1 click to 1 click,
~0 scroll, for a mid-grading action (picking up new student pushes).

**Write set (recommended inline, no new file):**
- `index.tsx` - build the re-scan node and pass it to `RepoGradesStickyHeader`;
  remove `onRefreshScan` from the `RepoGradesControls` call.
- `RepoGradesStickyHeader.tsx` - add `rescanControl?: ReactNode` + render inside
  `.stickyWorkingHeader`.
- `RepoGradesControls.tsx` - remove the Refresh button (and its
  `scanLoading`/`onRefreshScan` props) from the repo-filter block.
- `repo-grades.module.css` - only if a header button class is added; default
  reuses `pageStyles.linkButton`/`.headerField` - then NOT edited.
- Tests: `repoGradesWaveASticky.structure.test.ts` (add the AC-W3-1/2 pins);
  `repoGrades.wiring.test.ts` only if the Refresh assertion there moves (W3-R7
  does NOT pin Refresh, so it is untouched by W3).

**AC (embedded).** Each names object, instrument, direction.
- **AC-W3-1 (the re-scan control is ON the header surface).**
  `RepoGradesStickyHeader.tsx` accepts and renders a `rescanControl` node inside
  `.stickyWorkingHeader`, and `index.tsx` passes it. Object: the header source +
  the index mount; instrument: a source-text pin in
  `repoGradesWaveASticky.structure.test.ts`; direction: RED if the prop/render is
  absent or index does not pass it.
- **AC-W3-2 (wired to the same scan action - not dead).** In `index.tsx` the
  node's click is `reloadScan` (or an `onRefreshScan` that is `() => reloadScan()`)
  and its disabled/busy reads `scanLoading`. Object: index + leaf source;
  instrument: source-text pin; direction: RED if bound to a different value or a
  static button.
- **AC-W3-3 (gone from its old home, orphan-clean).**
  `RepoGradesControls.tsx` no longer renders the Refresh button; `npx tsc --noEmit`
  exit 0 and `npm run lint` exit 0 (no dangling `onRefreshScan`/`scanLoading`
  prop, no now-unused import). Object: Controls source + typed program;
  instrument: structure pin + tsc + eslint; direction: nonzero exit / RED pin.
- **AC-W3-4 (sticky mechanism untouched).**
  `repoGradesWaveASticky.structure.test.ts` W-A1..W-A5, W-A8 (header order),
  VH-10(a) (no `overflow` on `.stickyWorkingHeader`) stay green. Direction: RED
  if the move reorders the header, adds an overflow, or weakens the shell.
- **AC-W3-5 (persist nothing new; house rules).** No new `ta-` key
  (`repoGradesStorageKeys.structure.test.ts` unchanged); no emoji/non-ASCII
  (`src/lib/no-emojis.test.ts`); `index.tsx` under 1000
  (`src/file-size-ceiling.structure.test.ts`). Direction: RED on any.
- **AC-W3-6 (owner walk).** The re-scan button is visible in the sticky header,
  re-scans on click, stays visible while the grid scrolls, both themes, narrow
  reflow acceptable. Instrument: owner walk (RES-1).

**Sequencing.** After W1/W2 (shared `index.tsx` + `RepoGradesStickyHeader.tsx`).
Does NOT touch W3-R7.

### W4 (NEW): collapse the setup stack so the grid rises

**Concrete change.** Unify the always-visible setup (the picker `.adaptRow`:
Course, repo-filter text, Sort - folder having left in W1) and the two A7
disclosures ("Grading settings", Link usernames) under ONE top-level,
persisted, default-collapsed-WHEN-READY "Run setup" region above the grid. The
region defaults OPEN until the view is in steady grading state (a course is
chosen AND at least one binding is confirmed - reuse the existing `confirmedCount`
/ `allBound` signals, `index.tsx:577-578`) and collapses after, reusing the
`effectiveOpen` idiom and a NEW persisted key `ta-repo-grades-setup-open`
(persist-UI-control-state rule). The two existing disclosures remain nested
inside it (their own `settingsOpen`/`linkPanelOpen` state is unchanged). Every
control inside is preserved; only its default visibility and grouping change.

**Why this and not more header relocation.** The header is inside the bounded
shell; growing it eats the grid. Collapsing setup is the only lever that raises
the grid without shrinking it (section 3b). Sort stays reachable mid-work via the
sticky thead column-header sort buttons (`RepoGradesGrid.tsx:382-390,502-508`),
so collapsing the Sort `<select>` costs nothing mid-work.

**Saving (estimate):** steady-state above-grid height drops from ~350px to ~1
summary line + transient status (~80px), raising the grid top by ~270px; after a
run the trends panel still sits above the grid unless RES-4 is taken, so W4's
headline saving is the steady-state ~270px. Click cost: +1 expand click to reach
setup, paid once per course (setup is low-frequency); the scroll saving is
persistent.

**Write set (ORCHESTRATOR RULING 2026-10-11, post-check a53e5e25):** the parent
"Run setup" `<details>` lives in `index.tsx` and WRAPS BOTH `<RepoGradesControls>`
AND `<LinkUsernamesPanel>` (they are siblings rendered at index.tsx, so only an
index-level wrapper can contain both - per AC-W4-1). W4 therefore does NOT
restructure `RepoGradesControls.tsx` and does NOT touch the W3-R7 ids (they stay
"before the first `<details>`" inside Controls, exactly where W1 left them).
- `index.tsx` - render the new top-level parent `<details>` whose children are
  `<RepoGradesControls>` and `<LinkUsernamesPanel>`; resolve its open state via
  `effectiveOpen(uiState.setupOpen, !allBound)`. REUSE the EXACT shipped
  `settingsOpen`/`linkPanelOpen` idiom (initializer `loadRepoGradesUiState()` at
  index.tsx:108 + `effectiveOpen`) - NOT a mount effect. (The persisted-details-open
  hydration gotcha does NOT apply here: RepoGradesTab is conditionally mounted on
  client nav state, not SSR'd always-mounted, and the two already-shipped persisted
  disclosures use this same initializer path and do not flash on reload. A
  mount-effect would DIVERGE from the proven in-tree idiom.)
- `repoGradesUiState.ts` - add `setupOpen` to `RepoGradesUiState` + its
  load/persist, keyed `ta-repo-grades-setup-open`.
- `repo-grades.module.css` - one container class for the setup region (reuse the
  existing disclosure/`.linkPanel` surface language, not a new idiom).
- Tests/canaries: `repoGradesStorageKeys.structure.test.ts`
  (`FROZEN_KEYS` + `"ta-repo-grades-setup-open"`, count 19 -> 20, SAME commit); a
  new or extended structure pin in a repo-grades structure test for the parent
  disclosure's wiring (incl. AC-W4-7 membership). W4 does NOT edit
  `repoGrades.wiring.test.ts` (W3-R7 is unchanged under this ruling).

**AC (embedded).**
- **AC-W4-1 (the setup region exists and is persisted).** `index.tsx` renders a
  top-level disclosure whose open state is `effectiveOpen(uiState.setupOpen, ...)`
  and whose toggle writes `uiState.setupOpen`; `ta-repo-grades-setup-open` is in
  `repoGradesUiState.ts` and in `FROZEN_KEYS`. Object: index + uiState + the
  storage canary; instrument: source-text pin + `repoGradesStorageKeys.structure.test.ts`;
  direction: RED if the key is missing from the frozen list (same commit) or the
  toggle does not persist.
- **AC-W4-2 (every setup control preserved inside - nothing dropped).** The
  Course `Typeahead` (`repo-grades-course`), repo-filter, Sort
  (`repo-grades-sort`), the three checkboxes (`repo-grades-use-readme`,
  `repo-grades-bulk-selection-only`, `repo-grades-run-code-scoring`), the
  instructions textarea, the rubric-source `<select>` and rubric textarea all
  still render. Object: Controls source; instrument: the EXISTING (unchanged)
  W3-R7 three-id loop + W3-R7b (folder) + the A7 W2 checkbox pins
  (`repoGrades.wiring.test.ts:885-891`); direction: RED
  if any control is dropped or the confirm/guard checkboxes vanish.
- **AC-W4-3 (default-open logic is READY-gated, not always-collapsed).** The
  region defaults open when `!allBound` (setup incomplete) and collapsed once
  `allBound`. Object: index source; instrument: source-text pin that the
  fallback expression references `allBound` (or `confirmedCount`/`model.rows`);
  direction: RED if it defaults collapsed unconditionally (which would hide the
  Course picker before a course is chosen - the "cannot start" failure).
- **AC-W4-4 (the single aria-live region is untouched).** `index.tsx` still has
  exactly one `aria-live` attribute, the `postSummary` region at `:730-734`
  (comment-stripped count = 1, the W2 oracle). Object: comment-stripped index;
  instrument: structure assertion; direction: RED if a second appears or the
  existing one is removed.
- **AC-W4-5 (grid/sticky mechanism untouched).**
  `repoGradesWaveASticky.structure.test.ts` and the W1/W2/W3 header pins stay
  green; `tsc`/`lint` exit 0; `index.tsx` under 1000
  (re-measure - it was 828 pre-W1, `@(Get-Content).Count`); no emoji/non-ASCII.
- **AC-W4-6 (owner walk).** With a course chosen and bound, the grid sits near
  the top of the view; setup collapses to one summary line; expanding it reveals
  every setup control; both themes; narrow reflow. Instrument: owner walk (RES-2).
- **AC-W4-7 (BOTH components nested inside the parent - closes the check a53e5e25
  blocker).** The new parent `<details>` must CONTAIN both `<RepoGradesControls>`
  AND `<LinkUsernamesPanel>`, so the Link-usernames panel collapses with setup
  (its ~44px scroll saving is a stated goal; a wrapper around only Controls
  silently half-ships it and passes every other instrument). Object: index source;
  instrument: a source-text/structure pin that the parent `<details>` opening tag
  appears before the `<RepoGradesControls` JSX and its closing `</details>` appears
  after the `<LinkUsernamesPanel` JSX (both mounts lie between the parent's open and
  close); direction: RED if either component renders outside the parent disclosure.
  (This instrument is the ONLY machine-checkable guard against the half-ship - no
  component renders under vitest, so the owner walk is the only other witness.)

**Sequencing.** Last, after W1/W2/W3 (shared `index.tsx`). W4 wraps at the
`index.tsx` level only; it does NOT edit `RepoGradesControls.tsx` or W3-R7. Adds
the one new `ta-` key.

---

## 5. Consumption of the two scoped moves (NOT a disposition table)

This umbrella authors nothing new for W1/W2; it consumes them. No prior version
of THIS artifact exists, so there is no disposition table to re-derive.

| This umbrella | Scoped item | Treatment |
|---|---|---|
| W1 | REPO-GRADES-MODULE-PICKER-HEADER (`docs/repo-grades-module-picker-header-scope.md`) | Consumed verbatim as first move. SHIPPED `b22e257d` (RES-6 closed in-wave). Not re-planned. |
| W2 | REPO-GRADES-STATUS-PROMINENCE (`docs/repo-grades-status-prominence-scope.md`) | Consumed verbatim as second move. SHIPPED `d230ffcb`. Not re-planned. |

---

## 6. Collision / sequencing map (exact paths)

All four waves edit `index.tsx` -> every pair COLLIDES -> all SERIALIZE; never
two concurrent. Measured against each item's write set.

| Path | W1 (module-picker) | W2 (status) | W3 (re-scan) | W4 (collapse setup) | Verdict |
|---|---|---|---|---|---|
| `index.tsx` | YES | YES | YES | YES | SERIALIZE all four |
| `RepoGradesStickyHeader.tsx` | YES | YES | YES | no | serialize W1/W2/W3 |
| `RepoGradesControls.tsx` | YES (remove folder) | no | YES (remove Refresh) | no (W4 wraps at index level - RULING) | serialize W1/W3 |
| `repo-grades.module.css` | maybe | maybe | maybe | YES (setup class) | serialize if touched |
| `repoGradesUiState.ts` | no | no | no | YES (new key) | W4 only |
| `repoGrades.wiring.test.ts` (W3-R7) | YES (RES-6 closed b22e257d) | no | no | no (W4 does not touch W3-R7 - RULING) | W1 only |
| `repoGradesWaveASticky.structure.test.ts` | YES | YES | YES | maybe | serialize |
| `repoGradesStorageKeys.structure.test.ts` | no | no | no | YES (19->20) | W4 only |
| `repoGradesFeedbackAndFiles.wiring.test.ts` (FROZEN_REPO_GRADES_ROOTS) | YES (39->40, new folder leaf) | no | no (inline) | no (no new root) | W1 only, unless W3 adds a leaf (RES-5) |
| `useRepoGradesBulkGrade.ts` / `useRepoGradesGradingActions.ts` | no | no | no | no | clean - no wave edits the hooks |
| `RepoGradesGrid.tsx` / `RepoGradesRunBar.tsx` | W1 maybe | no | no | no | per W1 scope |

**Build order.** 1) `REPO-GRADING-REMOVE-ACTIVITY-LOG` (shipped `cef512f0`).
2) W1. 3) W2. 4) W3. 5) W4. Each re-baselines onto the prior commit and
re-measures line counts (`@(Get-Content <file>).Count`). The gate for every wave:
`git status --short` against that wave's write set, confirming nothing outside it
was touched and no `.claude/worktrees` copy was edited instead of the real tree
(`stale-worktree-shadows-glob`). Multi-path test runs use
`npm run test:paths -- <p1> <p2> ...`, never a raw multi-path `vitest`
(`test-paths-wrapper`). `npx tsc --noEmit` has ONE caller - no two waves
sabotage-verify concurrently.

---

## 7. Leverage and diagnostics (umbrella-level)

**Leverage.** STRUCK class (click-cost / scroll-cost). No categorical claim; the
batch-grading SCALE advantage (`src/lib/grade/engine.ts:186`) already exists and
is untouched. Every wave's removal test is an OWNER WALK (clicks/scroll/attention
are unobservable under vitest - `docs/loop/leverage.md` "Honest limit"). Trigger
recorded per wave.

**Diagnostics.** NONE per wave, justified: each wave is a presentational
relocation/collapse with no new data path and no new failure mode; the
`timeGradingAction` seam and both grading hooks are untouched by W3/W4 (and by
W2; W1 touches neither hook). A pure presentational change legitimately carries
no diagnostic (DEV_LOOP b907ff8e); stated, not assumed.

---

## 8. Confirms and guards preserved (PARAMOUNT - enumerated, with citations)

No wave may drop any of these. None of W3/W4 touches the code paths that hold
them, and the AC above pin the ones at risk.

- **Grade-all count guard.** The Grade / "Grade all" button label is derived
  from the REAL plan (`buildBulkGradePlan` -> `repoGradesRunPlanLabels`), never a
  bare "all" (`RepoGradesRunBar.tsx:66-81`; `RepoGradesGrid.tsx:356-373`). No
  wave edits these; W2's banner is additive and reads `bulkProgress`, not a new
  count. Preserved.
- **Confirm-all bindings guard.** `window.confirm(...)` in
  `LinkUsernamesPanel.tsx:228-231`, labelled from
  `confirmableSummary.confirmable` (the exact count sent). W4 collapses the panel
  but does not edit this handler; pinned by `repoGrades.wiring.test.ts:885-891`
  and the W2 scope. Preserved.
- **Discard-saved-results confirm.** `window.confirm(...)` in
  `index.tsx:513`. Untouched by every wave. Preserved.
- **Single aria-live region.** The one `role="status" aria-live="polite"` region
  (`index.tsx:730-734`); W2 adds a VISUAL-ONLY banner (no second region), W4
  pins the count stays at 1 (AC-W4-4). Preserved.
- **Per-cell post, grade-set selection, Search / sticky header, A7 smoothing.**
  No wave edits `RepoGradeCellControl.tsx`, the selection Set wiring
  (`index.tsx:274-278`), `RepoGradesGradeSetTypeahead.tsx`, the Search box, or the
  run bar's handlers. W3 adds a header control alongside them; W4 collapses
  setup around them. Preserved; AC-W3-4/AC-W4-5 pin the sticky mechanism green.

---

## 9. The `owns` file list (tests that read my edit targets AS SOURCE TEXT)

Derived with (run in the repo root):

```
grep -rln 'index.tsx\|RepoGradesStickyHeader\|RepoGradesControls\|stickyWorkingHeader\|repo-grades.module.css\|readFileSync' src/app/components/repo-grades/*.test.ts | sort
```

Output (18 files):

```
src/app/components/repo-grades/classTrendsFolderEntry.test.ts
src/app/components/repo-grades/repoGrades.wiring.linking.test.ts
src/app/components/repo-grades/repoGrades.wiring.test.ts
src/app/components/repo-grades/repoGradesCellEdits.test.ts
src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts
src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/app/components/repo-grades/repoGradesResultsPersist.structure.test.ts
src/app/components/repo-grades/repoGradesRubricPicker.wiring.test.ts
src/app/components/repo-grades/repoGradesSearch.test.ts
src/app/components/repo-grades/repoGradesSliceA.guards.test.ts
src/app/components/repo-grades/repoGradesSliceB.guards.test.ts
src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts
src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts
src/app/components/repo-grades/repoGradesWaveBSearch.structure.test.ts
src/app/components/repo-grades/repoGradesWaveCTypeahead.structure.test.ts
src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts
src/app/components/repo-grades/useRepoGradesRubricSource.test.ts
```

This list is a FLOOR (`traps-spec.md`): each wave's implementer re-derives the
set against the then-current tree and reports what it missed, then runs the full
`npm test` as the regression instrument. The ones that read a wave's edit targets
BY PATH and carry pins a wave can trip (verified by opening them):

- `repoGrades.wiring.test.ts` - reads `index.tsx`, `RepoGradesControls.tsx`,
  `RepoGradesStickyHeader.tsx`, `RepoGradesRunBar.tsx`, `repo-grades.module.css`;
  holds **W3-R7** (`:873-883`, the four-picker-in-`.adaptRow` pin that W1 and W4
  must update) and the A7 W2 confirm/checkbox pins (`:885-891`).
- `repoGradesWaveASticky.structure.test.ts` - reads `index.tsx`,
  `RepoGradesStickyHeader.tsx`, the CSS; holds the shell/header/thead pins
  (W-A1..W-A10, VH-10) every header-touching wave must keep green and add to.
- `repoGradesStorageKeys.structure.test.ts` - the `FROZEN_KEYS` set W4's new key
  must be added to IN THE SAME COMMIT (`:24` holds `ta-repo-grades-folder`,
  `:38` `ta-repo-grades-sort`).
- `repoGradesClassTrends.wiring.test.ts` - the **A-6** `defaultExpanded` pin
  (`:583-589`) that forecloses collapsing the trends panel without owner intent
  (RES-4).
- `repoGradesFeedbackAndFiles.wiring.test.ts` - `FROZEN_REPO_GRADES_ROOTS`; W1
  bumps it for the new folder leaf; W3 only if it adds a leaf (RES-5).

---

## 10. Residual register (owner, instrument, step)

Per DEV_LOOP a residual not in `docs/BACKLOG.md` does not exist; the orchestrator
files these at disposal / push.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-1 | **W3 owner walk (AC-W3-6).** The re-scan button is visible in the sticky header, re-scans, stays visible on scroll, both themes, narrow reflow. Not verifiable under vitest. | Repo owner | Manual: open Repo Grades, grade, click Re-scan while scrolled | Owner walk post-W3 |
| RES-2 | **W4 owner walk (AC-W4-6).** Grid sits near the top once bound; setup collapses to one line; expand reveals every control; both themes; narrow reflow. | Repo owner | Manual | Owner walk post-W4 |
| RES-3 | **W3 header-crowding is a visual/UX call.** Adding re-scan to a header that already holds folder, status, grade-set, search (+ single-folder run bar) may crowd; the control's exact placement, order, and label ("Refresh" vs "Re-scan") and whether to ship W3 at all vs leave re-scan in the collapsed setup (W4). | Repo owner + Visual/UX seat (wave 3) | Visual/UX pass against the as-built diff (open both theme token definitions per `seats.md` Visual checker); owner walk | At the W3 visual/UX pass; owner may descope W3 |
| RES-4 | **Collapsing the post-run trends panel is an OWNER FORK, not a planned wave.** It is guarded `defaultExpanded` (`repoGradesClassTrends.wiring.test.ts:583-589`); collapsing it (to keep the grid near the top after a run) means editing that guard and switching the mount to a persisted open state - a behaviour change the owner may not want. | Repo owner | `repoGradesClassTrends.wiring.test.ts` A-6 | Owner decides before any wave touches trends |
| RES-5 | **W3 new-file vs inline.** Recommended inline in `index.tsx` (no directory-root bump). If a `RepoGradesRescanControl.tsx` leaf is preferred (consistency with W1's folder leaf), `FROZEN_REPO_GRADES_ROOTS` must bump in the same commit (`gate-must-include-directory-canary`). | Repo owner / implementer | `@(Get-Content index.tsx).Count`; `repoGradesFeedbackAndFiles.wiring.test.ts` | At W3 build |
| RES-6 | **W1 write-set gap (cross-scope FINDING, section 3d).** `docs/repo-grades-module-picker-header-scope.md` section 9 omits `repoGrades.wiring.test.ts`; its W3-R7 pin (`:873-883`) asserts `repo-grades-folder` sits in `RepoGradesControls`'s `.adaptRow`, which W1's AC-2 removes - W1 reds W3-R7 as written. W1 must add that file to its write set and drop `repo-grades-folder` from the `:878` id loop. | Orchestrator (route to W1 + W1's checker) | `npm run test:paths -- src/app/components/repo-grades/repoGrades.wiring.test.ts` after W1 | Before/at W1 build; W1's `loop-checker` should also catch it |
| RES-7 | **Stale comment.** `index.tsx:593` says `.card` is "gap: 28px; padding: 36px"; measured `var(--space-6)` = 24px/24px (`src/app/page.module.css:34-35`; `globals.css:93`). Non-blocking; fix opportunistically when a wave edits `index.tsx`. | Implementer (any `index.tsx`-editing wave) | `grep -n "space-6" src/app/globals.css`; read `.card` | Opportunistic |
| RES-8 | **Shell max-height is a tuning knob, not a planned change.** `.stickyShell` subtracts a fixed `120px` (`repo-grades.module.css:25`) for the above-grid stack; after W4 raises the grid, that subtraction could shrink so more rows show per screen. A visual-seat call, not scoped here. | Repo owner / Visual seat | Owner walk; `repoGradesWaveASticky.structure.test.ts` W-A1 (still bounded) | Owner decision after W4 ships |

---

## 11. What I could not determine in this environment

- Every owner walk (RES-1, RES-2, the real click/scroll/prominence): no component
  renders under vitest (`docs/loop/this-repo.md` section 6). All section-2
  figures are code/CSS-token ESTIMATES, labelled as such; the pixel heights
  assume one-row-wide layout and default fonts and will differ on the real
  surface.
- Whether W1/W2 will edit `index.tsx` / `RepoGradesControls.tsx` FURTHER before
  they commit: not knowable until their commits land. Re-measure line counts and
  re-open the cited line numbers against each prior wave's commit before building
  the next (the two scoped scopes say the same of themselves).
- Whether the owner wants W3 at all, or trends collapsed (RES-3, RES-4): product
  decisions, surfaced, not defaulted.

---

## 12. House rules

- No emojis / non-ASCII anywhere (this doc is ASCII; `src/lib/no-emojis.test.ts`
  scans `docs/`).
- 1000-line ceiling: `index.tsx` measured **828**
  (`@(Get-Content src/app/components/repo-grades/index.tsx).Count`, 2026-10-11,
  pre-W1); W1 moves props not markup, W3 adds a node build (~a dozen lines), W4
  adds a wrapper - re-measure against each prior commit; budget an extraction
  into a leaf if any wave approaches the ceiling.
  `RepoGradesControls.tsx` = **681**, SHRINKS under W1/W3.
  `RepoGradesStickyHeader.tsx` = **73**, gains one prop per header-touching wave.
  `repo-grades.module.css` = **970** - NEAR the ceiling; any CSS a wave adds must
  be minimal (reuse existing classes) or the file needs a split first (measure
  before editing).
- persist-UI-control-state: W4's one new control state (`setupOpen`) persists to
  `ta-repo-grades-setup-open` and joins `FROZEN_KEYS` in the same commit; W1/W2/W3
  add no persisted state (W1 preserves `ta-repo-grades-folder`).
- Reuse the app's visual language: the header control recipe
  (`.headerField`/`.headerInput`, `repo-grades.module.css:50-87`), the disclosure
  idiom (`<details>` + `effectiveOpen`), the `.linkPanel`/subtle-surface family
  for the setup container. No new visual idiom is introduced by any wave.
