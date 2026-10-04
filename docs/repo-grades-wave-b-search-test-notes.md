# Repo Grades - Wave B (SEARCH box, feature 1) - test notes

Backlog RG-SEARCH-STICKY, Wave B. Scope: `docs/repo-grades-search-sticky-scope.md`
(feature 1 / AC-F1-*, and the bodyRows-vs-planRows display-only contract from the
round-2 revision). Wave A (the sticky SHELL) SHIPped at `5e64b01d`
(`docs/repo-grades-wave-a-sticky-shell-test-notes.md`). Wave B populates the shell
with the search field.

Authoring seat: test-notes / oracle (Opus). This file is NOTES for the Wave B
implementer and the loop-checker; it writes no production and no test code. Every
quantity below names the command that produced it, measured on the LIVE tree on
2026-10-04. Several brief/scope figures are STALE (the tree moved under a
concurrently-landed feature) - section 0.1 records the corrections, which are
load-bearing.

---

## 0. Measured facts (every quantity names its command)

Line counts via `@(Get-Content <file>).Count` in PowerShell on 2026-10-04 (the
mandated instrument; `Measure-Object -Line` is banned here -
`docs/loop/this-repo.md`):

| File | Lines (measured now) | Note |
|---|---|---|
| `src/app/components/repo-grades/index.tsx` | **996** | **4 lines under the 1000 ceiling - the dominant constraint of this wave** |
| `src/app/components/repo-grades/RepoGradesGrid.tsx` | 641 | the two-prop (bodyRows/rows) split lands here |
| `src/app/components/repo-grades/RepoGradesStickyHeader.tsx` | 54 | the search field mounts here (Wave A's shell) |
| `src/app/components/repo-grades/RepoGradesRunBar.tsx` | 115 | UNCHANGED this wave |
| `src/app/components/repo-grades/repoGradesUiState.ts` | 640 | +`searchQuery` field + `ta-repo-grades-search` key |
| `src/app/components/repo-grades/repo-grades.module.css` | 910 | only if a new search class is added (prefer reuse) |

### 0.1 THE BRIEF'S CANARY NUMBERS ARE STALE - use the measured values

Between the scope/brief authoring and now, the GRADER-WORKFLOW-OVERHAUL feature
landed (`ab2d3238 feat(grader-ux): M1 read-only latest-result card...`). It added
`repoGradesResultsStore.ts`, a new key `ta-repo-grades-cells`, the import
`describeRestoredRepoGradeCells` at `index.tsx:79`, and grew index.tsx. This moved
every canary the brief cited. **Measure, do not recall** - the live obligations:

| Canary | Brief said | MEASURED live | Wave B obligation | Command |
|---|---|---|---|---|
| Storage keys (`repoGradesStorageKeys.structure.test.ts`) | 18 -> 19 | **19** (title "the frozen 19", `:42`) | **19 -> 20** | `Select-String repoGradesUiState.ts '"(ta-[a-z0-9-]+)"'` -> 19 distinct |
| R-2 frozen roots (`repoGradesFeedbackAndFiles.wiring.test.ts`) | 36 -> 37 | **37** (title "the 37 frozen basenames", `:352`; `repoGradesResultsStore.ts` at `:337`) | **37 -> 38** | dir root count = 37 |
| index.tsx ceiling | "965 now" / Wave A "960" | **996** | stay < 1000 (extract first) | `@(Get-Content index.tsx).Count` |
| CSS-orphan ratchet | 118 | **118** (`PINNED_ORPHAN_CEILING`, `page-module-css-orphan-classes.test.ts:316`) | stay <= 118 | as cited |

**COLLISION the brief did not list:** GRADER-WORKFLOW-OVERHAUL shares
`index.tsx`, `repoGradesUiState.ts`, and the two canary files with this wave. It
is already on HEAD (`ab2d3238`), so there is no live concurrency with it - but the
implementer must build against the CURRENT tree (19 keys / 37 roots / 996 lines),
not the brief's figures, or the canary bumps will be wrong and the gate will red.
The brief's own collision list (W5-persist, Wave C, RG-NAME-COLUMNS) still holds;
all serialize disjoint in TIME from Wave B.

Nothing renders under vitest (node-env, collects only `src/**/*.test.ts` -
`docs/loop/this-repo.md` section 2/6). Every placement / scroll / "the count on
screen did not shrink" behaviour is a SOURCE/CSS-text pin (a proxy) or an OWNER
browser check - never a render assertion. Tests are network-blocked
(`vitest.setup.ts` throws on real fetch); this wave touches no Canvas path, so no
`canvasFetch` mock is needed.

---

## 1. Wave B scope boundary (what IS and is NOT in this wave)

IN:
- NEW pure leaf `repoGradesSearch.ts` exporting `rowMatchesQuery(row, query)`
  (section 3). One new non-test R-2 root (37 -> 38).
- NEW persisted field `searchQuery: string` on `RepoGradesUiState`, key
  `ta-repo-grades-search` (storage canary 19 -> 20). Lives in
  `repoGradesUiState.ts` (so the single-file scan sees it).
- A search INPUT in the sticky working header (`RepoGradesStickyHeader`), wired to
  the persisted `searchQuery` (value binds to it, onChange updates it) - and
  available in BOTH the single-folder and ALL_FOLDERS views (section 5).
- The **two-prop grid split** that makes the display-only contract real: the grid
  gains a `bodyRows` input used ONLY by the `<tbody>` render; its plan surfaces
  (the column header) keep reading `rows` (folder-scoped, query-free). index.tsx
  feeds the grid `rows={displayedRows}` (plan) + `bodyRows={...query-filtered...}`
  (body); the run bar keeps `rows: displayedRows` (query-free) - unchanged from
  Wave A (section 4). This IS in Wave B because the first wave to introduce a body
  query is the first wave that CAN leak it into the plan surfaces, and the whole
  point of the contract is that it must not.

OUT (and a Wave B change here reds a scope-boundary pin or the git gate):
- NO typeahead, NO grade-set, NO auto-filter (Wave C). No `repoGradesGradeSet.ts`,
  no `visibleRepoRows`/`repoGradesVisibleRows.ts`, no `planRows` identifier
  (see the forward-compat decision, section 7).
- NO F3-c grade-scope change. `useRepoGradesGradingActions.ts:784`,
  `RepoGradesGrid.tsx`'s and the run bar's grade-plan expressions stay bare
  `selectionOnly: bulkSelectionOnly` (Wave C's F3-c=X owns them). Those files'
  grade-plan lines are OUT of Wave B's write set; `git status --short` is their
  primary guard.
- NO change to any plan count / label / Post-or-Grade-disabled logic. The query
  reaches ONLY the tbody.

---

## 2. Executable here vs argued-only (be honest about the instrument)

EXECUTABLE (machine-checkable in vitest, node-env, no render):
- The frozen leaf oracle for `rowMatchesQuery` (section 3). Proven satisfiable AND
  discriminating against 8 mutants in a throwaway reference tree (section 3.3).
- The AC-F1-2 source pin: `repoGradesSearch.ts` imports and calls
  `deriveRepoGradeStudentName` (section 3.4).
- The persistence round-trip: `loadRepoGradesUiState`/`persistRepoGradesUiState`
  carry `searchQuery` under `ta-repo-grades-search`, default `""` (section 6).
- The display-only SOURCE pins (section 4): the grid's two-prop split, index.tsx's
  query-free plan inputs, the run bar's `rows: displayedRows`, and the
  `displayedRows` definition staying query-free.
- The search-input placement/wiring SOURCE pins (section 5).
- The canary bumps (section 6): storage keys 19 -> 20, R-2 roots 37 -> 38, the
  retirement of W-A10's `bodyRows` ban, orphan ratchet, index.tsx ceiling.

ARGUED ONLY / mechanism proxy (labelled as such wherever it appears):
- That typing a query **on screen** never shrinks "Grade N / Post N" and never
  disables Post while postable rows remain. The plan builders compute at render,
  and nothing renders here. The machine proxy is the section-4 wiring pins (plan
  surfaces receive the query-free `displayedRows`); the real check is OWNER
  AC-F1-3 (browser). This is the round-2 blocker - section 4 is the load-bearing
  half.
- That the search box appears and is usable in the sticky header in BOTH folder
  views and survives reload ON SCREEN. OWNER AC-F2-4/AC-F1-* browser walk; the
  structural + persistence pins are the proxy.

---

## 3. The frozen leaf oracle - `rowMatchesQuery(row, query)` (AC-F1-1)

### 3.1 Contract (the CONSTRUCTION, not re-derived from the implementation)

`rowMatchesQuery(row: RepoGradeRow, query: string): boolean` - a case-insensitive
substring match of the trimmed query against a FIXED set of five searchable
fields. The field set is fixed by the scope (section 3.1, F1-b recommended) and is
the construction the oracle freezes:

1. `row.repo`
2. `row.binding.student` (may be null - treated as the empty string, never a crash)
3. the DERIVED first name: `deriveRepoGradeStudentName(row.binding.student,
   row.binding.studentSortable).firstName`
4. the DERIVED last name: same call, `.lastName`
5. `row.binding.state` (the enum word: `confirmed`/`suggested`/`ambiguous`/`unbound`)

Rules the oracle pins:
- `query.trim() === ""` (empty OR whitespace-only) -> return `true` for every row
  (no narrow).
- otherwise lowercase both sides; a row matches iff ANY of the five fields
  contains the trimmed, lowercased query as a substring.
- a query matching none of the five fields -> `false`.

**Why fields 3-4 must use `deriveRepoGradeStudentName` (AC-F1-2, "names agree with
the eye"):** the grid's First/Last name cells render exactly that derivation
(`RepoGradesGrid.tsx:543`, `deriveRepoGradeStudentName(row.binding.student,
row.binding.studentSortable)`). A hand-rolled second split would let search find a
name the cell does not show, or miss one it does (N5 item 16 / the
`roster-text-vs-studentRepos` and `markdown-renderers-differ` class of divergence).
The oracle's row C below (a null `student` whose name exists only via
`studentSortable`) forces the implementation to call the real derivation WITH the
`studentSortable` argument - a `derive(student)` that drops the second argument
reds (section 3.3, `mut_nosortable`).

**Binding-state field (field 5) agrees with the eye:** `RepoBindingControl.tsx`
renders the capitalized label of the state ("Confirmed"/"Suggested"/"Ambiguous -
N matches"/"Unbound", `:49/:75/:133/:175`). A case-insensitive match against the
raw enum word equals a case-insensitive match against that label for all four
words a user would type ("unbound", etc.). CAVEAT: "ambiguous" matches both, but
the trailing "- N matches" text of the Ambiguous label is not in field 5; a search
for "matches" would not find it. That is acceptable for v1 (the binding words are
the search target, per scope F1-b); stated so the checker does not read it as a
gap.

### 3.2 The frozen oracle table (hand-authored fixtures -> expected boolean)

Five fixtures. The implementer builds them with a local `mkRow` helper in the test
(do NOT import a helper from another `*.test.ts` - duplicate it); the VALUES below
are frozen literals, not computed from the implementation. Only the fields
`rowMatchesQuery` reads need realistic values; the rest of `RepoGradeRow` can be
dummy (`htmlUrl:""`, `defaultBranch:"main"`, `folders:null`, `folderError:null`,
`cells:{}`) and the rest of `RepoBindingSuggestion` (`canvasUserId`, `candidates:[]`,
`derivedHandle:null`) dummy too.

| id | repo | binding.student | binding.studentSortable | binding.state | derived first/last (for reference) |
|---|---|---|---|---|---|
| A | `octo-org/algorithms-alice` | `null` | (absent) | `unbound` | `""` / `""` (source none) |
| B | `octo-org/hw-r2` | `Jane Doe` | (absent) | `suggested` | `Jane` / `Doe` (derived) |
| C | `octo-org/proj-x` | `null` | `Nakamoto, Satoshi` | `confirmed` | `Satoshi` / `Nakamoto` (canvas) |
| D | `octo-org/zeta` | `null` | (absent) | `ambiguous` | `""` / `""` (source none) |
| E | `octo-org/grp` | `Bobby Tables` | `Tables, Bob` | `suggested` | `Bob` / `Tables` (canvas) |

Expected `rowMatchesQuery(row, query)` (1 = true, 0 = false). Each query isolates a
field or behaviour; the "isolates" column names what a single mismatch would catch:

| query | A | B | C | D | E | isolates |
|---|---|---|---|---|---|---|
| `""` | 1 | 1 | 1 | 1 | 1 | empty -> all (no narrow) |
| `"   "` (spaces) | 1 | 1 | 1 | 1 | 1 | whitespace-only -> all (the TRIM) |
| `alice` | 1 | 0 | 0 | 0 | 0 | repo field |
| `octo-org` | 1 | 1 | 1 | 1 | 1 | repo substring across all |
| `jane` | 0 | 1 | 0 | 0 | 0 | student / first |
| `DOE` | 0 | 1 | 0 | 0 | 0 | case-insensitivity |
| `nakamoto` | 0 | 0 | 1 | 0 | 0 | derived LAST via sortable, student null |
| `satoshi` | 0 | 0 | 1 | 0 | 0 | derived FIRST via sortable, student null |
| `unbound` | 1 | 0 | 0 | 0 | 0 | state field |
| `confirmed` | 0 | 0 | 1 | 0 | 0 | state field |
| `ambiguous` | 0 | 0 | 0 | 1 | 0 | state field |
| `bobby` | 0 | 0 | 0 | 0 | 1 | student field ONLY (first is "Bob", not "bobby") |
| `zzznomatch` | 0 | 0 | 0 | 0 | 0 | universal non-match -> false |

The test asserts `rowMatchesQuery(fixture, query) === expected` for every cell (65
assertions). The axes (which fields, which behaviours) come from the scope's field
table - a DIFFERENT source than any generator - so no branch is tautological.

### 3.3 Proof of satisfiability AND discrimination (practice #1 and the sabotages)

I ran a throwaway reference `rowMatchesQuery` (mirroring the real
`deriveRepoGradeStudentName` semantics from `repoGradeStudentName.ts:70-127`)
against this oracle and against eight mutants, in the scratchpad (node, not the
repo). Measured results:

| Implementation | Oracle failures | Verdict |
|---|---|---|
| correct | **0** | satisfiable - the red oracle CAN be made green |
| drop the trim (whitespace runs substring) | 5 | killed (the `"   "` row) |
| drop derived first/last fields | 2 | killed (`nakamoto`, `satoshi` on C) |
| call `derive(student)` WITHOUT `studentSortable` (AC-F1-2) | 2 | killed (`nakamoto`, `satoshi` on C) |
| drop the state field | 3 | killed (`unbound`/`confirmed`/`ambiguous`) |
| drop the repo field | 6 | killed |
| drop the student field | 1 | killed (`bobby` on E) |
| drop case-folding | 5 | killed (`DOE`) |
| invert the result | 65 | killed |

Every mutant reds; the correct one passes clean. The DIRECTION of failure is
stated per mutant above. **The student-field mutant is a single-point kill** (only
`bobby`/E) - the checker should confirm row E and the `bobby` query are not dropped
or weakened, because they are the SOLE discriminator for field 2. (The reference
script and mutant run are reproducible; they are notes-validation, not repo code.)

### 3.4 AC-F1-2 source pin (names-agree-with-cells, belt to the oracle's braces)

- OBJECT: `repoGradesSearch.ts`'s name derivation.
- INSTRUMENT: over `withoutLineComments(SEARCH_SOURCE)` assert
  `/import\s*\{[^}]*deriveRepoGradeStudentName[^}]*\}\s*from\s*["']\.\/repoGradeStudentName["']/`
  AND that the identifier `deriveRepoGradeStudentName` is actually CALLED
  (`/deriveRepoGradeStudentName\s*\(/`). An import alone is not a call.
- DIRECTION: fails if the leaf hand-rolls a `split`/`indexOf(",")` of its own
  instead of the shared derivation.
- SABOTAGE: replace the call with a local `student.split(" ")` -> this pin reds,
  AND the oracle's `mut_nosortable`/`mut_noderived` rows red. DISCRIMINATES.

---

## 4. The display-only contract (AC-F1-3) - THE pin most likely to be built loose

**FLAGGED, per the brief: this is the one to build tight.** It is the round-1/
round-2 blocker and the whole reason Wave B is not "just add a text box".

### 4.1 Why a naive pin passes vacuously

The grid ALREADY hands `rows={rows}` to `<ColumnHeaderControls>`
(`RepoGradesGrid.tsx:511`) and the run bar object ALREADY carries `rows:
displayedRows` (`index.tsx:903`). So:
- A bare `expect(GRID).toMatch(/rows=\{rows\}/)` passes TODAY, on code that has not
  built the split at all.
- A build that keeps the grid single-prop and simply filters the `rows` it passes
  (`rows={displayedRows.filter(rowMatchesQuery...)}`) would feed the query to BOTH
  the tbody AND the plan surfaces - the exact leak - while any "the grid has a rows
  prop" check stays green.

The query currently has ONE entry point into the grid (`rows`), used in TWO places
(`<tbody>` map at `:534`; `<ColumnHeaderControls rows={rows}>` at `:511`, which
runs `scopeRepoGradeRowsToSelection` / `buildBulkGradePlan` / `buildRepoGradePostPlan`
at `:318-325,:350`). The ONLY correct shape is a structural split: a second input
for the body. Therefore the pin must be a PAIR - the grid-internal split AND the
index-level wiring - or it does not measure the contract.

### 4.2 Grid-internal split (`RepoGradesGrid.tsx`)

Recommended shape (minimal churn): ADD a `bodyRows: RepoGradeRow[]` prop; the
`<tbody>` maps `bodyRows`; the column header KEEPS `rows={rows}` (unchanged). The
empty-state (`rows.length === 0` at `:469`) is an implementer call (section 8,
R-SEARCH-EMPTY) - keep the "no repos at all" branch, and consider a distinct
"no rows match your search" branch when `rows` is non-empty but `bodyRows` is empty.

- OBJECT: the grid's body-render input vs its plan-surface input.
- INSTRUMENT (over `withoutLineComments(GRID_SOURCE)`):
  - props destructure contains BOTH `rows` and `bodyRows`.
  - the tbody maps the body input: `/<tbody[^>]*>\s*\{\s*bodyRows\.map\(/`.
  - the column header reads the plan input: slice from `<ColumnHeaderControls` to
    the next `/>`; assert the slice matches `/rows=\{rows\}/` AND does NOT match
    `/rows=\{bodyRows\}/`.
- DIRECTION: fails if the tbody still maps `rows` (search would not filter the
  body), or if the column header is fed `bodyRows` (the leak into the plan).
- SABOTAGE L (the leak): change `<ColumnHeaderControls rows={rows}>` to
  `rows={bodyRows}` -> the `rows={rows}` positive pin reds AND the negative catches
  `rows={bodyRows}`. DISCRIMINATES - this is literally feeding the query-filtered
  set to a plan surface, which the brief requires to RED.
- SABOTAGE D (search dead): change the tbody `bodyRows.map` to `rows.map` -> the
  tbody pin reds. DISCRIMINATES (the "safe but wrong" direction).

### 4.3 Index wiring - plan inputs stay query-free (`index.tsx`)

This closes the aliasing hole: even with the grid split, index.tsx must not pass
the query-filtered set into the grid's `rows` (plan) prop or the run bar's `rows`.

- OBJECT: the `<RepoGradesGrid>` props, the run bar props object, and the
  `displayedRows` definition.
- INSTRUMENT (over `withoutLineComments(INDEX_SOURCE)`):
  - Grid element: slice from `<RepoGradesGrid` to the next `/>`. Assert it matches
    `/rows=\{displayedRows\}/` AND `/bodyRows=\{/` AND does NOT match
    `/\brows=\{bodyRows\}/`.
  - Run bar object: assert INDEX matches `/rows:\s*displayedRows/` (the W-A10
    assertion, which stays valid) AND does NOT match `/rows:\s*bodyRows/`.
  - `displayedRows` stays query-free BY CONSTRUCTION: slice from
    `const displayedRows =` to the next `;`; assert the slice does NOT contain
    `rowMatchesQuery` or `searchQuery`. (This is the authoritative "planRows is
    query-free" pin - the plan surfaces read `displayedRows`, and `displayedRows`
    provably never sees the query.)
  - `bodyRows` carries the query: assert INDEX matches `/const bodyRows =/`, and
    the slice from `const bodyRows =` to the next `;` contains BOTH `rowMatchesQuery`
    and `displayedRows` (the body set is the folder-scoped set narrowed by the
    query).
  - reachability: `/import\s*\{[^}]*rowMatchesQuery[^}]*\}\s*from\s*["']\.\/repoGradesSearch["']/`.
- DIRECTION: fails if a plan surface (grid `rows=` or run bar `rows:`) is fed the
  query-filtered set, or if `displayedRows` itself gains the query, or if the body
  set is not query-filtered.
- SABOTAGE (the index-level leak, the brief's required RED): change the grid's
  `rows={displayedRows}` to `rows={bodyRows}`, OR the run bar object's
  `rows: displayedRows` to `rows: bodyRows` -> reds. DISCRIMINATES.

### 4.4 Honest limit (residual R-DISPLAY)

Sections 4.2-4.3 are SOURCE pins. They RED on the specific leak sabotages and
prove the structure, but they do NOT prove the on-screen count is unchanged -
nothing renders. "Typing a query never shrinks Grade N / Post N and never disables
Post while postable rows remain" holds BY CONSTRUCTION (the run bar and column
header plan builders receive `displayedRows`, proven query-free by 4.3; the query
reaches only the tbody via `bodyRows`). The OWNER confirms on screen (AC-F1-3
browser). Recorded as a residual, not a deletion.

---

## 5. Search input placement + wiring (AC-F1 persistence + sticky placement)

Recommended shape (also the cheapest for the index.tsx ceiling - section 6, W-B-CEIL):
`RepoGradesStickyHeader` gains two scalar props `searchQuery: string` and
`onSearchChange: (value: string) => void`, and renders the search `<input>` (or an
existing house control) INSIDE the `.stickyWorkingHeader` tier. index.tsx passes
`searchQuery={uiState.searchQuery}` and
`onSearchChange={(v) => setUiState((prev) => ({ ...prev, searchQuery: v }))}`. A
`ReactNode` slot is an acceptable alternative - re-anchor the pins below on
whichever file renders the input.

**ALL_FOLDERS availability.** Wave A renders `.stickyWorkingHeader` only when
`runBar !== null` (`RepoGradesStickyHeader.tsx:46`). Search must be present in the
ALL_FOLDERS view too (scope 2.5). So the working-header tier must render whenever a
search field is present, not solely when the run bar is. This is a RENDER
behaviour; the structural proxy is below, the real check is OWNER (R-ALLFOLDERS).

- OBJECT: the search input, its value binding, and its home tier.
- INSTRUMENT (over `withoutLineComments(HEADER_SOURCE)` - or the file that renders
  the input):
  - placement/ordering: `styles.stickyWorkingHeader` resolves (> -1) and the search
    input's anchor (an `aria-label` naming search, e.g. matching
    `/aria-label=["'][^"']*(search|filter)[^"']*["']/i`, OR a `<input` whose
    `value=` is the search prop) appears AFTER `styles.stickyWorkingHeader` in
    source order and before `{children}`.
  - value binding (persist-ui-control-state): the input's `value` is the
    `searchQuery` prop (`/value=\{\s*searchQuery\s*\}/` or `props.searchQuery`) and
    its change handler calls `onSearchChange(` .
  - the working-header tier is NOT gated solely on `runBar`: assert the render
    condition for `.stickyWorkingHeader` references the search prop (e.g.
    `hasHeader` / the guard includes `searchQuery`/`onSearchChange`), so the tier
    renders without a run bar. (Reading claim - label it; OWNER R-ALLFOLDERS.)
  - index side: `<RepoGradesStickyHeader` element contains
    `/searchQuery=\{\s*uiState\.searchQuery\s*\}/` and an `onSearchChange=` whose
    body sets `searchQuery` on `uiState` (`/searchQuery:/` within the handler).
- DIRECTION: fails if the input is hardcoded (`value=""`) instead of bound (control
  would not reflect the persisted value), if it is outside the sticky tier, or if
  the tier only ever renders with a run bar.
- SABOTAGE: hardcode `value=""` on the input -> the value-binding pin reds; move the
  input before `styles.stickyWorkingHeader` -> the ordering pin reds. Both
  DISCRIMINATE (in source; label the placement one a proxy).
- NOTE (UX htmlInput trap, `seats.md`): a plain search box needs no onKeyDown, so
  the MUI `slotProps.input` vs `htmlInput` trap does not bite here; if an
  Enter-to-act handler is ever added it must route through `slotProps.input`.
  The input needs an accessible name (`aria-label`) - reading claim, OWNER.

---

## 6. Canary / gate obligations (each a named gate member, live numbers)

### W-B-KEYS - storage keys 19 -> 20, SAME commit, title bumped
In `repoGradesUiState.ts` add `const SEARCH_KEY = "ta-repo-grades-search";`, the
`searchQuery` field (default `""`), its load (`localStorage.getItem(SEARCH_KEY) ?? ""`)
and its persist (`localStorage.setItem(SEARCH_KEY, state.searchQuery)`). Then in
`repoGradesStorageKeys.structure.test.ts`, SAME commit:
- add `"ta-repo-grades-search"` to `FROZEN_KEYS` in sorted position (it sorts
  AFTER `ta-repo-grades-run-code-scoring` and BEFORE `ta-repo-grades-selected`);
- bump the `it(...)` title at `:42` from "the frozen 19" to "...20" (prose, asserted
  only via the array equality K1 - but leaving it stale is a dishonesty the loop
  treats as a defect, same rule Wave A followed).
- Direction/discriminate: adding the key WITHOUT updating `FROZEN_KEYS` reds K1
  (`collectKeys` returns 20, array has 19). K3 (adds a canary) and K4 (renames a
  key) stay green by construction.

### W-B-ROOTS - R-2 frozen roots 37 -> 38, SAME commit, title bumped
`repoGradesSearch.ts` is a NEW non-test root. In
`repoGradesFeedbackAndFiles.wiring.test.ts`, SAME commit:
- add `"repoGradesSearch.ts"` to `FROZEN_REPO_GRADES_ROOTS` (`:304-347`, sorted);
- bump the comment "37 non-test..." (`:303`) and the `it(...)` title "names exactly
  the 37 frozen basenames" (`:352`) to 38;
- the leaf must pass the client-boundary closure walk (`R-1/R-3/R-4`): browser-safe
  imports ONLY. `repoGradesSearch.ts` imports `deriveRepoGradeStudentName` from
  `./repoGradeStudentName` (browser-safe) and types from `./repoGradesRows` -
  no `"use server"` leaf, no server-only module. (ResizeObserver etc. not needed.)
- Direction/discriminate: adding the file without the array red R-2
  (directoryRoots returns 38, array 37); a server-only import reds R-1/R-3/R-4.
  Gate-mandatory.

### W-B-ACONF - retire W-A10's `bodyRows` ban (SAME commit)
`repoGradesWaveASticky.structure.test.ts:116-126` (W-A10) asserts index.tsx,
`RepoGradesStickyHeader.tsx` and `RepoGradesRunBar.tsx` contain NONE of
`["visibleRepoRows", "bodyRows", "planRows"]`. Wave B legitimately introduces
`bodyRows` in index.tsx (and the grid). The Wave A notes explicitly scoped this
pin as temporary and expected its retirement. SAME commit, the MINIMAL change:
- for `index.tsx`, remove `"bodyRows"` from the banned set (keep `"visibleRepoRows"`
  and `"planRows"` banned - those are still Wave C and Wave B introduces neither);
- KEEP the full ban for `RepoGradesStickyHeader.tsx` and `RepoGradesRunBar.tsx`
  (Wave B adds no row-split identifier to either - the sticky header gets scalar
  search props, the run bar file is untouched);
- KEEP lines `:117-120` verbatim (run bar `selectionOnly: bulkSelectionOnly`,
  `scopedToSelection: ...`, the `rows: displayedRows` match) - those stay TRUE in
  Wave B and double as the run-bar half of the display-only contract.
- Direction/discriminate: if Wave B does NOT retire the `bodyRows` ban, W-A10 reds
  (index.tsx now contains `bodyRows`). If Wave B wrongly adds `visibleRepoRows`/
  `planRows`, the still-active ban reds. Gate-mandatory.
- The grid (`RepoGradesGrid.tsx`) is NOT in W-A10's file loop, so its `bodyRows` is
  unaffected.

### W-B-CEIL - index.tsx stays < 1000 (EXTRACTION LIKELY REQUIRED)
`src/file-size-ceiling.structure.test.ts` (`LIMIT = 1000`, `:41`). index.tsx is at
**996** (`@(Get-Content).Count`) - only 4 lines of headroom. Wave B's minimal
additions (import `rowMatchesQuery`; `const bodyRows = ...`; grid `bodyRows={...}`;
`searchQuery`/`onSearchChange` on the sticky header) are ~6-7 lines NET even with
the input rendered inside `RepoGradesStickyHeader`. **This crosses 1000.** The
implementer MUST extract a block from index.tsx in the SAME wave FIRST, then add
the search wiring, and RE-MEASURE with `@(Get-Content).Count`. Candidates (scope
4.2 / `modulesview-at-ceiling`): the status-banner props block, or the
rubric-source prop fan-out. This is FORK W-B-EXTRACT (section 9) - recommend-and-
proceed; the ceiling is non-negotiable, the choice of block is not. Gate-mandatory.

### W-B-ORPHAN - CSS-orphan ratchet stays <= 118
`page-module-css-orphan-classes.test.ts` (`PINNED_ORPHAN_CEILING = 118`, `:316`).
PREFER REUSE for the search box styling (the house control pattern - e.g.
`styles.adaptRow` / `PICKER_FIELD_STYLE` from `RepoGradesControls.tsx:301-302,360`,
or an inline style) so NO new class is added. If a new class IS added to
`repo-grades.module.css`, it must be referenced via `styles.<name>` in a file that
imports the sheet, or the ratchet rises to 119 and reds. Direction/discriminate: a
defined-but-unreferenced class raises the count -> red; reference it -> 118 ->
green. Gate-mandatory IF any class is added.

### W-B-PERSIST - persistence round-trip (EXECUTABLE)
In `repoGradesUiState.test.ts` (the existing file that stubs localStorage - do NOT
import its helpers into another test): add that
`persistRepoGradesUiState({...state, searchQuery: "jane"})` then
`loadRepoGradesUiState()` yields `searchQuery === "jane"`, and that
`defaultUiState().searchQuery === ""` / a cleared store loads `""`. Direction: a
missing read or write of `SEARCH_KEY` loses the value across reload. SABOTAGE: drop
the `localStorage.setItem(SEARCH_KEY, ...)` line -> the round-trip reds.
DISCRIMINATES.

---

## 7. Forward-compat decision (bodyRows / planRows) - STATED, keep it so Wave C extends cleanly

**DECISION: Wave B adds exactly ONE new non-test leaf, `repoGradesSearch.ts`
(`rowMatchesQuery`), and derives `bodyRows` as a THIN inline filter in index.tsx:
`const bodyRows = displayedRows.filter((row) => rowMatchesQuery(row, uiState.searchQuery));`.
Wave B does NOT create `repoGradesVisibleRows.ts` and does NOT introduce the
`visibleRepoRows(rows, query, gradeSet)` selector or a `planRows` identifier.**

Rationale:
- The live R-2 obligation is +1 root in Wave B (37 -> 38), matching exactly one new
  leaf - consistent with the brief's own "one new leaf" expectation. Creating
  `repoGradesVisibleRows.ts` now would be +2 (38 -> 39) and would ship a selector
  with a vestigial `gradeSet` parameter Wave B cannot meaningfully test (no grade
  set exists until Wave C).
- The grid's **prop surface is the stable contract Wave C inherits**: `rows`
  (plan / folder-scoped) + `bodyRows` (body / display). Wave C keeps BOTH props
  and only changes HOW `bodyRows` is COMPUTED - from
  `displayedRows.filter(rowMatchesQuery)` to
  `visibleRepoRows(displayedRows, query, gradeSet)` (adding the gradeSet
  intersection). No grid-prop churn between B and C; the run bar and plan-surface
  wiring (reading `displayedRows`) is untouched by C's change.
- So Wave C's AC-F4-2 ("bodyRows derived through the single `visibleRepoRows`
  selector, not two ad-hoc filters") is satisfied by C REPLACING B's one inline
  filter with the one selector call. Wave B's single inline filter is intentional
  and temporary; the Wave C test author should expect to supersede it, not treat
  it as a second body-filter path.

What Wave C must do to the pins here: re-point section 4.3's `const bodyRows =`
slice from `rowMatchesQuery` to `visibleRepoRows`, and add the gradeSet axis to the
oracle. The grid split pins (4.2) and the run-bar/displayedRows pins (4.3) carry
over unchanged.

---

## 8. Residual register (owner, instrument, step)

Each names an owner, an instrument, and the measuring step. A residual not in
`docs/BACKLOG.md` does not exist - the orchestrator adds these at disposal.

- **R-DISPLAY (on-screen counts unaffected by the query):** OWNER (browser) +
  Wave B implementer. INSTRUMENT section-4 source pins (proxy); AC-F1-3 owner walk.
  STEP owner types a query on a long roster and confirms "Grade N / Post N" and the
  Post-disabled state do not change while rows remain in the folder set. Nothing in
  vitest renders a plan surface. Not a deletion - a named owner step.
- **R-ALLFOLDERS (search present in the ALL_FOLDERS view):** OWNER (browser).
  INSTRUMENT the section-5 "tier not gated solely on runBar" source proxy. STEP
  owner selects ALL_FOLDERS and confirms the search box is present and filters the
  body.
- **R-SEARCH-EMPTY (empty-result UX):** OWNER (browser) + implementer. INSTRUMENT
  none machine here (no render). STEP decide/confirm what shows when a query
  matches no rows but the folder set is non-empty (recommend a "no repositories
  match your search" line, distinct from the "no repos at all" empty state). Scope
  did not require a machine pin; flagged so it is not silently dropped.
- **R-SEARCH-RELOAD (value survives reload ON SCREEN):** OWNER (browser).
  INSTRUMENT W-B-PERSIST (round-trip, executable) + the section-5 value-binding pin
  (proxy). STEP owner types a query, reloads, confirms it is still in the box.
- **R-A11Y-SEARCH (accessible name / keyboard):** OWNER (browser). INSTRUMENT a
  reading claim (aria-label pin, section 5). STEP owner confirms the box is
  reachable and named. No component renders here.

---

## 9. Gate command + forks

### Gate (PowerShell; multi-path uses the wrapper - never a raw multi-path vitest)
```
npx tsc --noEmit
npm run lint
npm run test:paths -- src/app/components/repo-grades/repoGradesSearch.test.ts src/app/components/repo-grades/repoGradesWaveBSearch.structure.test.ts src/app/components/repo-grades/repoGradesUiState.test.ts src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts src/app/components/courses/page-module-css-orphan-classes.test.ts src/file-size-ceiling.structure.test.ts
git status --short
```
- `repoGradesSearch.test.ts` - the frozen leaf oracle (section 3) + AC-F1-2 source
  pin. (Name is a suggestion; it must NOT contain the forbidden comment-strip
  literal in name or body - name the source stripper `withoutLineComments`, the
  CRLF-safe UNANCHORED form; CSS is not read here.)
- `repoGradesWaveBSearch.structure.test.ts` - the display-only pins (section 4) +
  search placement/wiring (section 5). (Suggested name; same literal ban.)
- `repoGradesUiState.test.ts` - add the searchQuery round-trip (W-B-PERSIST).
- `repoGradesStorageKeys.structure.test.ts` - keys 19 -> 20 (W-B-KEYS).
- `repoGradesFeedbackAndFiles.wiring.test.ts` - R-2 roots 37 -> 38 (W-B-ROOTS).
- `repoGradesWaveASticky.structure.test.ts` - W-A10 `bodyRows` ban retired (W-B-ACONF).
- `page-module-css-orphan-classes.test.ts` - orphan ratchet (W-B-ORPHAN).
- `file-size-ceiling.structure.test.ts` - index.tsx < 1000 (W-B-CEIL).
- `tsc`: do NOT use the dotAll `/s` flag in any slice regex (passes vitest, FAILS
  tsc TS1501). No emojis, LF in new test files, no cross-`*.test.ts` imports
  (duplicate helpers). Use `withoutLineComments` (unanchored `/\/\/.*$/` per line
  over `.split(/\r?\n/)`), never a `stripComments` literal.
- `git status --short`: must match the Wave B file list exactly - no
  `.claude/worktrees` copy edited; `useRepoGradesGradingActions.ts` and the grade-
  plan lines of `RepoGradesGrid.tsx`/`RepoGradesRunBar.tsx` UNCHANGED (Wave C).

### Wave B write set (expected `git status --short`)
```
# new:
src/app/components/repo-grades/repoGradesSearch.ts
src/app/components/repo-grades/repoGradesSearch.test.ts
src/app/components/repo-grades/repoGradesWaveBSearch.structure.test.ts
# edited:
src/app/components/repo-grades/index.tsx                 # bodyRows filter; grid bodyRows prop; sticky-header search props; an EXTRACTION to stay < 1000
src/app/components/repo-grades/RepoGradesGrid.tsx         # + bodyRows prop; tbody maps bodyRows; column header keeps rows={rows}
src/app/components/repo-grades/RepoGradesStickyHeader.tsx # + searchQuery/onSearchChange; render the input in .stickyWorkingHeader; tier not gated solely on runBar
src/app/components/repo-grades/repoGradesUiState.ts       # + searchQuery field + ta-repo-grades-search key
src/app/components/repo-grades/repoGradesUiState.test.ts  # + searchQuery round-trip
src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts     # 19 -> 20
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts   # 37 -> 38
src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts     # retire W-A10 bodyRows ban for index.tsx
# edited ONLY IF a new CSS class is added (prefer reuse):
src/app/components/repo-grades/repo-grades.module.css
# + whichever block the extraction (W-B-CEIL) moves out of index.tsx
```

### Forks (recommend-and-proceed; none gates the build)
- **FORK W-B-EXTRACT (index.tsx ceiling):** index.tsx is at 996; Wave B's wiring
  crosses 1000. RECOMMEND extracting the status-banner props block (or the
  rubric-source prop fan-out) into its existing component/a local const in the same
  wave, and rendering the search input inside `RepoGradesStickyHeader` (scalar
  props) to minimise index.tsx growth. COST if the wrong block is chosen: a
  different JSX move, same line budget. The ceiling itself does not move. I could
  not determine the final line count without building (I author notes only) - the
  implementer MUST re-measure (W-B-CEIL) and the checker should confirm it on the
  built diff.
- **FORK W-B-STALE-CANARY (measurement correction, not a product fork):** the brief
  said storage 18 -> 19 and roots 36 -> 37; the LIVE tree is 19 and 37
  (GRADER-WORKFLOW-OVERHAUL landed between brief and build). I adopt the MEASURED
  values: Wave B is storage **19 -> 20** and roots **37 -> 38**. Surfaced for the
  checker/orchestrator so the brief's figures are not re-applied; neither value was
  adopted silently.
- **FORK W-B-STATE-LABEL (binding-state searchable token):** I match the raw enum
  word (`unbound`/etc.), which equals the displayed label case-insensitively for
  all four words. The Ambiguous label's trailing "- N matches" text is not
  searchable. RECOMMEND keeping it this way (scope F1-b). COST if wrong: one field
  in `rowMatchesQuery` + two oracle rows.

---

## 10. Reference-implementation satisfiability (honest limit)

The brief restricts this seat to NOTES, so I did NOT build a throwaway REPO tree
scoring the source/structure pins green (that needs both production and test code).
Satisfiability is established two ways, and the limit is stated plainly:
1. The frozen leaf oracle (section 3) WAS run green against a throwaway reference
   `rowMatchesQuery` (0/65 failures) and proven to discriminate against 8 mutants
   (section 3.3) in the scratchpad. The novel instrument of this wave is thereby
   proven satisfiable AND discriminating by measurement, not argument.
2. Every SOURCE/structure pin shape (import+call reachability, `ruleBlock`-style
   slices with both anchors resolved, element-slice prop pins, ordering-with-
   resolved-anchors, canary array+title bumps) is a SHIPPED-AND-PASSING shape in
   this repo - the Wave A pins (`repoGradesWaveASticky.structure.test.ts`) and the
   W3 sticky pins use the identical constructions on real green code.

What I could NOT determine here: the final index.tsx line count after the required
extraction (W-B-CEIL / FORK W-B-EXTRACT) - it depends on which block is moved. The
implementer re-measures; the checker confirms the RED->GREEN of the new pins on a
reference shape and the ceiling on the built diff, since I could not.
