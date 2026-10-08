# RG-SEARCH-STICKY Wave C - TDD test notes

Test-author seat. Wave C is the final wave: the grade-set typeahead (feature 3),
the auto-filter (feature 4), the F3-c=X grade-scope decision at every grade-plan
site, and the "N of M" clear/show-all affordance. These are the notes an
implementer writes tests FROM; they are not test code and not production code.

Scope authority: `docs/repo-grades-search-sticky-scope.md` (sections 3.3-3.6,
4.1 Wave C, 5 AC-F3-*/F4-*, 6 forks F3-c/F4-a/F4-b, 8 residuals). This document
RE-GROUNDS every line reference against the tree at HEAD (Wave A + Wave B have
shipped since the scope was written, so several scope line refs have moved - the
corrections are called out inline). Every quantity names its command.

> **Nothing renders under vitest** (node-env, `src/**/*.test.ts` only,
> network blocked by `vitest.setup.ts`). Every Wave C assertion is over a PURE
> FUNCTION or is a SOURCE-TEXT structure pin. The typeahead's markup, focus,
> keyboard story, the sticky scroll, and the on-screen counter are OWNER BROWSER
> CHECKS (residual R5 / AC-F3 keyboard / AC-F4-5) - do not fake any of them with
> a green test.

---

## 0. Measured facts (each names its command, taken 2026-10-04 at HEAD)

| Fact | Value | Command |
|---|---|---|
| `index.tsx` line count | **995** / 1000 | `@(Get-Content src/app/components/repo-grades/index.tsx).Count` |
| `selected: Set<string>` | `index.tsx:222` | `grep -n "const \[selected" index.tsx` |
| `toggleSelected` | `index.tsx:279-285` | read |
| `displayedRows` (folder-scoped = **planRows**) | `index.tsx:399-402` | read |
| `bodyRows` (inline tbody filter Wave C SWAPS) | `index.tsx:405` | read |
| `buildBulkGradePlan({rows,folder,selected,selectionOnly})` | `repoGradesBulkGrade.ts:74-131`; honours `selected` only when `selectionOnly` (`:81`) | read |
| `scopeRepoGradeRowsToSelection` (empty set = all) | `repoGradesPosting.ts:90-96` | read |
| `rowMatchesQuery(row,query)` (Wave B leaf) | `repoGradesSearch.ts:11-17` | read |
| `deriveRepoGradeStudentName` | `repoGradeStudentName.ts:114-127` | read |
| `RepoGradeRow` (`.repo`, `.binding.student`, `.binding.state`, `.binding.studentSortable`) | `repoGradesRows.ts:112-128`; binding `repo-student-bindings.ts:50,56,69` | read |
| `FROZEN_REPO_GRADES_ROOTS` | **38** basenames; title "exactly the 38 frozen basenames" | `repoGradesFeedbackAndFiles.wiring.test.ts:304-358` |
| `FROZEN_KEYS` | **20** keys; title "exactly the frozen 20"; `ta-repo-grades-search` + `ta-repo-grades-selected` ALREADY present | `repoGradesStorageKeys.structure.test.ts:19-45` |
| CSS-orphan ratchet total | 118, rises-only | `courses/page-module-css-orphan-classes.test.ts:36-41` |

### Four grade-plan sites (F3-c=X targets), re-grounded

| Site | file:line (HEAD) | Current expression | Scope said |
|---|---|---|---|
| Grade EXECUTION handler | `useRepoGradesGradingActions.ts:784` | `...selectionOnly: bulkSelectionOnly` inside `handleGradeColumn` | `:784` - MATCHES |
| Run-bar plan | `RepoGradesRunBar.tsx:66` | `...selectionOnly: bulkSelectionOnly` | `:66` - MATCHES |
| Run-bar label | `RepoGradesRunBar.tsx:70` | `scopedToSelection: bulkSelectionOnly && selected.size > 0` | `:70` - MATCHES |
| Grid column plan | `RepoGradesGrid.tsx:356` | `...selectionOnly: bulkSelectionOnly` | scope said `:350` - **MOVED to :356** |
| Grid column label | `RepoGradesGrid.tsx:358` | `const scopedToSelection = bulkSelectionOnly && selected.size > 0;` | scope said `:352` - **MOVED to :358** |

Command: `grep -n "buildBulkGradePlan\|scopedToSelection\|selectionOnly" <file>`.

---

## 1. The retarget obligations - READ FIRST. Three shipped pins across three files actively FORBID Wave C's change.

This is the single most important section. Wave C changes source text that three
already-green pins assert by exact string, in three files
(`repoGradesWaveASticky.structure.test.ts`, `repoGradesWaveBSearch.structure.test.ts`,
`repoGrades.wiring.test.ts`). If the implementer does not retarget them IN THE
SAME COMMIT, either main goes red or - worse - the change cannot be made at all. This is the repo's most-repeated silent-ship class
(`gate-must-include-directory-canary`) and a live instance of the
"guard that bans the owner's own wording" trap.

### 1a. `repoGradesWaveASticky.structure.test.ts:116-131` (W-A10) forbids F3-c=X verbatim AND bans `visibleRepoRows` in index.tsx

`:116-131` is ONE `it` block, titled "W-A10: Wave A leaves the run bar plan
inputs and Wave C identifiers alone". Wave C reverses two facts inside it. Both
parts of this block are retargeted in the Wave C commit; do them together.

**Part 1 - the F3-c=X expression pins (`:117-119`).** Measured (`grep -n`):
```
:117  expect(RUNBAR).toContain("selectionOnly: bulkSelectionOnly");
:118  expect(RUNBAR).toContain("scopedToSelection: bulkSelectionOnly && selected.size > 0");
:119  expect(RUNBAR).not.toContain("selected.size > 0 || bulkSelectionOnly");
```
Line `:119` is a NEGATIVE pin whose banned string is *exactly* the F3-c=X
expression the scope mandates (`docs/...scope.md:342`). Wave A froze the
pre-F3-c behaviour on purpose; Wave C deliberately REVERSES that fact. So these
three assertions must be **inverted** in the Wave C commit:
- the run-bar must now CONTAIN the F3-c grade-scope decision (the helper call of
  section 4, or the bare `selected.size > 0 || bulkSelectionOnly` expression);
- it must NOT contain the bare `selectionOnly: bulkSelectionOnly`.
- `:120` (`expect(INDEX).toMatch(/rows:\s*displayedRows/)`) stays TRUE - keep it.

**Part 2 - the W-A10 banned-identifier loop (`:121-131`).** Measured:
```
:123  for (const [name, src, banned] of [
:124    ["index.tsx", INDEX, ["visibleRepoRows", "planRows"]],
:125    ["RepoGradesStickyHeader.tsx", HEADER, ["visibleRepoRows", "bodyRows", "planRows"]],
:126    ["RepoGradesRunBar.tsx", RUNBAR, ["visibleRepoRows", "bodyRows", "planRows"]],
```
Wave C's feature-4 edit adds `visibleRepoRows` to `index.tsx` (the
`bodyRows = visibleRepoRows(...)` call, section 3), so `:124` goes RED. SURGICAL
fix - this is the SAME precedent the comment at `:121-122` already set when Wave B
retired the `bodyRows` ban for index.tsx only:
- remove ONLY `"visibleRepoRows"` from the index.tsx banned array at `:124`,
  leaving `["index.tsx", INDEX, ["planRows"]]`;
- KEEP the `"planRows"` ban for index.tsx (Wave C keeps the variable named
  `displayedRows`, never introduces a literal `planRows` identifier - so this
  ban stays legitimately satisfiable and must not be dropped);
- KEEP the FULL ban on the `RepoGradesStickyHeader.tsx` and `RepoGradesRunBar.tsx`
  entries (`:125-126`) unchanged - `visibleRepoRows` belongs only in index.tsx
  and the new leaf, never in those two. Do NOT gut W-A10 by emptying the loop.

The checker must confirm the retarget is honest on BOTH parts: the NEW pin
asserts F3-c=X is PRESENT and the pre-F3-c expression ABSENT, and the loop still
bans `planRows` in index.tsx and the full set in the header/run bar - not merely
that the failing assertions were deleted.

### 1b. `repoGradesWaveBSearch.structure.test.ts:70-79` pins the body line Wave C rewrites

Wave B pinned (measured):
```
:70  it("bodyRows is the folder-scoped set narrowed by the query", ...)
:72    expect(def).toContain("rowMatchesQuery");   // def = slice(INDEX,"const bodyRows =",";")
:73    expect(def).toContain("displayedRows");
:74    expect(def).toContain("searchQuery");
:77  it("rowMatchesQuery is imported from ./repoGradesSearch", ...)   // asserts INDEX imports it
```
Wave C replaces `index.tsx:405`
`const bodyRows = displayedRows.filter((row) => rowMatchesQuery(row, uiState.searchQuery));`
with a single call to the new selector (section 3):
`const bodyRows = visibleRepoRows(displayedRows, uiState.searchQuery, selected);`.
After that edit: the `bodyRows` def no longer contains `rowMatchesQuery` (it
moves INTO `repoGradesVisibleRows.ts`), and `index.tsx` imports `visibleRepoRows`
instead of `rowMatchesQuery`. So `:72` and `:77` go RED. Retarget in the same
commit:
- `:72` -> `expect(def).toContain("visibleRepoRows")` (the def still contains
  `displayedRows` and `searchQuery`, keep `:73`/`:74`);
- `:77` -> `visibleRepoRows` imported from `./repoGradesVisibleRows`, and
  `rowMatchesQuery` imported by `repoGradesVisibleRows.ts` (not index). The FACT
  these protect - the query reaches ONLY the body, never a plan surface - is
  preserved; it now flows through `visibleRepoRows`.
- `:64-68` ("displayedRows is query-free by construction") stays TRUE -
  `displayedRows` is unchanged. Keep it. This is the load-bearing planRows pin.

### 1c. Canary bumps, same commit (the directory-canary rule)

- **`FROZEN_REPO_GRADES_ROOTS` 38 -> 41**: Wave C adds THREE non-test roots -
  `repoGradesGradeSet.ts`, `repoGradesVisibleRows.ts`, and
  `RepoGradesGradeSetTypeahead.tsx` (the typeahead MUST be its own file, not
  inline: index.tsx is at 995/1000, and a multi-select combobox with chips
  cannot fit the 5-line headroom - see section 5). Bump the array AND the title
  number ("38 frozen basenames", `:354`) in the same change. New-leaf `.test.ts`
  files do NOT count (the canary excludes test files - confirmed by the
  `.ts`/`.tsx` non-test filter). Each new leaf must import browser-safe modules
  only (R-1/R-3/R-4 runtime-graph walk, `:362-374`): `repoGradesGradeSet.ts`
  imports nothing but types; `repoGradesVisibleRows.ts` imports `rowMatchesQuery`
  from `./repoGradesSearch` (already browser-safe) and the `RepoGradeRow` type.
- **`FROZEN_KEYS` stays 20.** `ta-repo-grades-search` shipped in Wave B; the
  grade set reuses `ta-repo-grades-selected`. Wave C adds NO key under the
  recommended ephemeral show-all (F4-b). The gate still RUNS this canary to
  prove no accidental key. It moves to 21 ONLY if the owner chooses persisted
  show-all (then bump array + title together). The scope's "18 -> 19" is stale
  (pre-Wave-B).
- **CSS-orphan ratchet:** Wave A/B styled their controls with INLINE house-token
  objects (`SEARCH_INPUT_STYLE`, `RepoGradesStickyHeader.tsx:16-25`) precisely so
  the exact orphan ratchet never moves. Wave C's typeahead / chip / counter
  SHOULD follow the same inline pattern. If a new `repo-grades.module.css` class
  is added instead, it MUST be referenced via `styles.<name>` in a file importing
  the sheet, or the ratchet rises and reds. Run the ratchet on this wave either
  way.

### 1d. `repoGrades.wiring.test.ts:610-620` pins the `toggleSelected` body that section 5 extracts

Measured (`grep -n`, `:610-620`): the guard reads `toggleSelected`'s body
(`body = indexSource.slice(defIdx, defIdx + 400)` from the anchor
`const toggleSelected = (repo: string) => {`) and asserts:
```
:614  expect(body).toContain("const next = new Set(selected)");
:615  expect(body).toContain("setSelected(next)");
:616  expect(body).toContain("persistSelectedRepoIds(next)");
:619  expect(body).not.toContain("setSelected((prev)");
```
Section 5 extracts the `new Set(selected)` toggle into `toggleRepoInGradeSet`
(AC-F3-2 single-source), so after Wave C the body reads
`const next = toggleRepoInGradeSet(selected, repo); setSelected(next);
persistSelectedRepoIds(next);`. That turns ONLY `:614` RED. SURGICAL fix:
- retarget `:614` to `expect(body).toContain("toggleRepoInGradeSet(selected, repo)")`;
- LEAVE `:615`, `:616`, `:619` unchanged - they stay green (the body still does
  `setSelected(next)` + `persistSelectedRepoIds(next)` and still has no
  `setSelected((prev)` form). These three are the mount-time-race /
  pure-updater protection from AC4 items 23-24 (`index.tsx:265-285`); preserve
  them, and the leaf's T3/T4 immutability oracle (section 5) now carries the
  "`new Set`, never mutate" guarantee that `:614`'s literal used to.

This is a THIRD shipped pin the wave reddens, and it sits in a file the scope's
gate command omits - see section 7's gate (fixed to include it).

---

## 2. The three pure leaves Wave C introduces

All browser-safe, no React, no I/O - each is its own `.test.ts`'s specification.

1. `repoGradesGradeSet.ts` - exports `toggleRepoInGradeSet(selected, repo)` AND
   `resolveGradeScope(selected, bulkSelectionOnly)` (section 4). One new root.
2. `repoGradesVisibleRows.ts` - exports `visibleRepoRows(rows, query, gradeSet)`
   (section 3). One new root.
3. The selection-filter-summary helper (section 5). HOME:
   `repoGradesVisibleRows.ts` (same display concern, NO extra root - fixed here,
   not optional, so the roots count is a clean 41).

Plus one NEW COMPONENT root (not a pure leaf, not unit-testable here):
`RepoGradesGradeSetTypeahead.tsx` (section 5). Root accounting: 2 pure-function
leaves + 1 typeahead component = 3 new non-test roots, so
`FROZEN_REPO_GRADES_ROOTS` goes 38 -> 41 (section 1c).

Putting `resolveGradeScope` in a leaf is deliberate: it turns "four sites must
compute the same expression" (a drift-prone, over-specifying source-text pin)
into "four sites call one tested function" - a CONSTRUCTION where disagreement
between the run and the label is unrepresentable. See section 4.

---

## 3. visibleRepoRows - the auto-filter selector (feature 4) [AC-F4-1]

### Signature and rule

`visibleRepoRows(rows: readonly RepoGradeRow[], query: string, gradeSet: ReadonlySet<string>): RepoGradeRow[]`

- `rows` arrives ALREADY folder-scoped (it is `displayedRows`). The selector
  never knows about folders.
- `gradeSet` is the live `selected` Set of repo full names (keyed on `row.repo`,
  exactly as `scopeRepoGradeRowsToSelection` keys).
- Composition, by INTERSECTION (AND), in this order:
  1. `selectedHere = rows.filter(r => gradeSet.has(r.repo))`
  2. `narrow = selectedHere.length > 0 && selectedHere.length < rows.length`
  3. `base = narrow ? selectedHere : rows`
  4. `return base.filter(r => rowMatchesQuery(r, query))`  (reuse the Wave B leaf)

### Why the `> 0 && < rows.length` guard, not "strict subset of loaded rows"

The scope (3.5 / F4-a) says "a non-empty STRICT subset of the loaded rows". The
construction above refines that to the INTERSECTION with the displayed rows, for
a reason the scope leaves implicit: `selected` can hold repos from OTHER folders
(the set is not folder-scoped). Keying the narrow off `selectedHere` (the
selected-AND-displayed slice) means:
- a selection entirely in another folder (`selectedHere` empty) does NOT blank
  the current folder - it shows all rows;
- a selection covering every displayed row (`selectedHere.length == rows.length`)
  does NOT narrow (nothing to hide);
- a partial selection narrows to just the displayed-and-selected rows.

**This is a recommended reading, proceeding on it (residual R-F4a).** It matches
F4-a's intent and is the only construction that stays sane across folder hops.
Cost if the owner wants literal set-subset semantics instead: one line in the
`narrow` predicate + its oracle rows. Flag, do not block.

### FROZEN ORACLE (construction, not enumeration)

Axes come from scope section 3.5, a DIFFERENT source than the generator:
`{query ∈ (blank | matches-some | matches-none)} x {gradeSet membership ∈
(empty | strict-subset-here | equals-all-here | off-folder | partial-off-folder)}`.
The generator is a fixed 3-row table; expected ids are written by hand from the
rule above - the two do not share a source, so no branch is unreachable
(`seats.md` "axes from a different source than the generator").

Fixture rows (construct via the real shape; `binding.student`/`.state` set so
`rowMatchesQuery` behaves):
```
A = { repo: "org/a", binding: { student: "Ada Lovelace",  state: "confirmed", ... } }
B = { repo: "org/b", binding: { student: "Bob Jones",     state: "unbound",   ... } }
C = { repo: "org/c", binding: { student: "Cy Young",      state: "confirmed", ... } }
rows = [A, B, C]
```

| # | query | gradeSet | expected visible ids | catches |
|---|---|---|---|---|
| V1 | `""` | `{}` | `[a,b,c]` | empty set must show all |
| V2 | `""` | `{a,c}` | `[a,c]` | subset narrows |
| V3 | `"ada"` | `{a,c}` | `[a]` | query AND subset intersect |
| V4 | `"zzz"` | `{a,c}` | `[]` | no match inside subset |
| **V5** | `"bob"` | `{a,c}` | `[]` | **THE AND-vs-OR discriminator**: b matches the query but is NOT selected, so it stays hidden. An OR (union) impl returns the subset plus the query match = `[a,b,c]` (the query-only mutant S-V2, by contrast, returns `[b]`). |
| V6 | `""` | `{a,b,c}` | `[a,b,c]` | gradeSet == all rows is NOT a strict subset -> no narrow |
| V7 | `"cy"` | `{a,b,c}` | `[c]` | all-selected + query -> query only |
| V8 | `""` | `{x,y}` | `[a,b,c]` | selection entirely off-folder -> `selectedHere` empty -> no narrow |
| V9 | `""` | `{a,x}` | `[a]` | partial off-folder -> narrow to the displayed-selected (a) |
| V10 | `"jones"` | `{}` | `[b]` | empty set + query -> query only (parity with Wave B body) |

Order is not asserted beyond input order preservation (rows come back in `rows`
order); pin the SET of ids and that order is preserved, never the object spelling.

### Sabotages for visibleRepoRows (each named; all proven to discriminate)

| Sabotage (wrong impl) | Dies on row | Discriminates? |
|---|---|---|
| S-V1 `OR` instead of `AND` (union of subset and query matches) | V5 (`[a,b,c]` vs `[]`) | YES |
| S-V2 selection ignored (query only) | V2 (`[a,b,c]` vs `[a,c]`) | YES |
| S-V3 query ignored (selection only) | V3 (`[a,c]` vs `[a]`) | YES |
| S-V4 drop the `> 0` guard (`narrow = selectedHere.length < rows.length`) | V8 (`[]` vs `[a,b,c]`) | YES |
| S-V5 drop the `< rows.length` guard (narrow even when all selected) | V6 - still `[a,b,c]`? No: narrows to all-3, same result; so V6 does NOT catch it. **Caught by V9?** no. This mutant is BENIGN for output - see note. | **NO - see note** |

Note on S-V5: dropping only the `< rows.length` guard changes nothing
observable, because when `selectedHere == rows` the narrowed base equals `rows`.
It is therefore NOT a discriminating sabotage and must NOT be banked as a kill.
Report it as a rebuilt/discarded mutant (`seats.md` practice 2): the honest
sabotage for the upper guard is S-V4 (the lower guard), which DOES discriminate.
Stating this is the point - a sabotage green in both directions reads as coverage
and measures nothing.

All of S-V1..S-V4 were executed against the frozen table in the reference run
(section 8); each failed >=1 row. S-V5 passed every row, which is why it is
reported as non-discriminating rather than as a gap to patch.

---

## 4. The grade-scope decision at four sites (feature 3, F3-c=X) [AC-F3-3]

### The fact to make unrepresentable

Under F3-c=X a non-empty `selected` scopes BOTH grade and post. The hazard
(scope 3.4): if only the execution handler changes and the LABEL sites keep the
bare `bulkSelectionOnly`, the grid/run-bar show "Grade 40 / all" while the click
grades only the N selected - a confirm-altering lie. The scope's remedy is "pin
the same expression at all four sites". A source-text pin of the same boolean
string at four places is drift-prone and over-specifies (`source-text-tests-overspecify`).

### PRIMARY instrument - a shared pure helper (recommended CONSTRUCTION)

`resolveGradeScope(selected: ReadonlySet<string>, bulkSelectionOnly: boolean):
{ selectionOnly: boolean; scopedToSelection: boolean }` in `repoGradesGradeSet.ts`:
```
selectionOnly    = selected.size > 0 || bulkSelectionOnly
scopedToSelection = selectionOnly && selected.size > 0        // == selected.size > 0
```
All FOUR sites call it; the two label sites READ `.scopedToSelection` off the
SAME returned object they build the plan from. Then the run and the label at a
site cannot disagree - the disagreement the scope fears is unrepresentable, not
merely tested-against.

**FROZEN ORACLE for `resolveGradeScope` (full truth table - 2 bools x the
size>0 partition = complete):**

| # | selected.size | bulkSelectionOnly | selectionOnly | scopedToSelection | catches |
|---|---|---|---|---|---|
| G1 | 0 | false | false | false | default: empty set + toggle off -> grade-all |
| G2 | 0 | true | true | false | toggle on, nothing selected -> run=all, label NOT "scoped" (empty set => `scopeRepoGradeRowsToSelection` returns all) |
| G3 | 2 | false | true | true | **F3-c=X core**: non-empty selection scopes grade even with the toggle OFF |
| G4 | 2 | true | true | true | both on |

Sabotages:

| Sabotage | Dies on | Discriminates? |
|---|---|---|
| S-G1 bare `bulkSelectionOnly` (the pre-F3-c bug) | G3 (`selectionOnly` false vs true) | YES |
| S-G2 `scopedToSelection = selectionOnly` (drop `&& size>0`) | G2 (`true` vs `false`) - would falsely claim "scoped" when only the toggle is on and nothing is selected | YES |
| S-G3 `selectionOnly = selected.size > 0` (drop `|| bulkSelectionOnly`) | G2 (`false` vs `true`) - toggle-on-empty would stop scoping-to-all... caught, discriminates | YES |

### Source-text wiring pin (accompanies the helper)

A structure test (new `repoGradesWaveCTypeahead.structure.test.ts`, using the
duplicated `withoutLineComments`/`slice` idiom - see section 7) asserts the FACT
"every grade-plan site routes through the one decision", NOT a boolean spelling:
- `useRepoGradesGradingActions.ts`, `RepoGradesRunBar.tsx`, `RepoGradesGrid.tsx`
  each `import { resolveGradeScope }` from `./repoGradesGradeSet` and call it;
- none of the four sites still contains the bare `selectionOnly: bulkSelectionOnly`
  nor the bare `scopedToSelection: bulkSelectionOnly && selected.size > 0`.
This is also the retarget of `repoGradesWaveASticky.structure.test.ts:117-119`
(section 1a) - do both in one place so the pin is not split across two files
asserting contradictory things.

### FALLBACK instrument (if the implementer declines the helper)

Pin, per site, that `selectionOnly` is fed `selected.size > 0 || bulkSelectionOnly`
and `scopedToSelection` the equivalent, AND that `repoGradesBulkGrade`'s existing
tests still pass. This is weaker (four strings can drift) and over-specifies the
spelling; recommend the helper. Either way, `repoGradesWaveASticky:117-119` must
be retargeted.

### The execution-path FACT (do not test by importing the hook)

`handleGradeColumn` (`useRepoGradesGradingActions.ts:784`) is inside a hook that
is never rendered here. Do NOT import it to "drive" grading - there is no render.
The faithful production-path check is the helper oracle (G1-G4) PLUS
`repoGradesBulkGrade.test.ts`'s existing coverage, which already pins the
behaviour the handler relies on (measured):
- `:102` selectionOnly true + subset -> targets that subset (AC-F3 subset);
- `:121` selectionOnly true + NOTHING checked -> whole column (AC-F3-4, empty-set);
- `:130` selectionOnly false + non-empty selection -> whole column.
No new `buildBulkGradePlan` test is needed; cite these. If any is absent on
re-grep, add it - but grep first (`grep -n "selectionOnly true\|NOTHING checked"
repoGradesBulkGrade.test.ts`).

---

## 5. toggleRepoInGradeSet - the Set reducer the typeahead and checkbox share [AC-F3-1]

### Signature

`toggleRepoInGradeSet(selected: ReadonlySet<string>, repo: string): Set<string>`
- returns a NEW Set (never mutates the input);
- adds `repo` if absent, removes it if present.

This is the SAME toggle the checkbox path already does inline at
`index.tsx:280-283` (`const next = new Set(selected); if (next.has(repo))
next.delete... else next.add...`). Wave C extracts that body into the leaf and
has BOTH the checkbox handler and the typeahead call it, so one tested reducer
backs both (AC-F3-2 "one source of truth").

### FROZEN ORACLE

| # | input set | repo | expected result | also assert |
|---|---|---|---|---|
| T1 | `{a}` | `b` | `{a,b}` | add absent |
| T2 | `{a}` | `a` | `{}` | remove present |
| T3 | `{a}` (frozen copy) | `b` | - | INPUT unchanged == `{a}` (snapshot taken before the call) |
| T4 | `{a}` | `b` | - | `result !== input` (a new Set object) |

Sabotages:

| Sabotage | Dies on | Discriminates? |
|---|---|---|
| S-T1 mutate input in place (`selected.add/delete`; return it) | T3 (input mutated) and T4 (same object) | YES |
| S-T2 always add (never delete) | T2 (`{a}` vs `{}`) | YES |
| S-T3 always delete (never add) | T1 (`{a}` vs `{a,b}`) | YES |

T3/T4 are the load-bearing immutability pins: capture `Array.from(input).sort()`
BEFORE the call and compare after; assert `result !== input` by reference. This
is why the reducer exists as a leaf rather than inline - the checkbox path's
`const next = new Set(selected)` purity (documented at `index.tsx:265-285`) is now
enforced by a test, not just a comment.

### AC-F3-2 wiring (source-text) - named files and anchored slices

The typeahead's home file is **`RepoGradesGradeSetTypeahead.tsx`** (resolved, not
optional - section 1c/2; a new component root, mounted in the sticky working
header). The instrument is THREE anchored slices, so it cannot be written
vacuously or against the wrong file. The new structure test
(`repoGradesWaveCTypeahead.structure.test.ts`) reads:

- **A (index.tsx, the single toggle source).** `slice(INDEX,
  "const toggleSelected = (repo: string) => {", "};")` CONTAINS
  `toggleRepoInGradeSet(selected, repo)` and `setSelected(next)` and
  `persistSelectedRepoIds(next)`. This is the SAME assertion as the
  `repoGrades.wiring.test.ts:614` retarget (section 1d) - one FACT, do not
  duplicate the file-read; cite it from both.
- **B (RepoGradesGradeSetTypeahead.tsx, no second source of truth).** The
  component takes the selection and a single toggle callback as PROPS and owns
  neither. Assert: `slice(HOME, "export default function RepoGradesGradeSetTypeahead(",
  ")")` (the props) names the selection prop (recommend `selected`) and one
  toggle callback (recommend `onToggleRepo`); and the file contains NO
  `useState(` for a selection set and NO `"ta-"` string literal (it must not
  persist its own set). FAIL: the component holding a second `selected` state or
  key.
- **C (index.tsx, both surfaces share the one handler).** `slice(INDEX,
  "<RepoGradesGradeSetTypeahead", "/>")` references `toggleSelected` (as its
  toggle prop) and `selected` (as its selection prop); AND the grid element
  already passes the SAME identifier - `onToggleSelected={toggleSelected}`
  (measured `index.tsx:942`). So the checkbox path and the typeahead path
  resolve to one `toggleSelected`, which (slice A) calls the one reducer.

FAIL overall: a second state var, a second `ta-` key, or a typeahead toggle prop
bound to anything other than the `toggleSelected` that the checkbox uses - any of
which makes shown != run. The run bar / grid receive that SAME `selected`
(`repoGradesWaveASticky.structure.test.ts:120` keeps `rows: displayedRows`; the
grade set flows through unchanged). Reading claim on the rendered chips - the
keyboard/ARIA of the combobox is R5 (owner browser).

---

## 6. The "N of M" clear/show-all affordance [AC-F4-4]

A filter with no visible clear is a trap, so the counter+affordance is REQUIRED,
not optional. The only machine-checkable part is a PURE helper; its render and
click behaviour are AC-F4-5 (owner browser).

### Signature (recommended home: `repoGradesVisibleRows.ts`)

`selectionFilterSummary(input: { folderScopedCount: number; selectedShownCount:
number; showAll: boolean }): SelectionFilterSummary | null`
- `folderScopedCount` = `displayedRows.length` (M);
- `selectedShownCount` = count of `displayedRows` whose repo is in `selected`
  (= `selectedHere.length` from section 3 - the SAME intersection, so the
  counter can never claim a different N than the auto-filter shows);
- `showAll` = the ephemeral display override (F4-b, recommended NOT persisted -
  justified like `cellEdits` are ephemeral, `index.tsx:178-193`; proceeding on
  ephemeral, residual R-F4b).
- returns `null` when NOT a subset (`selectedShownCount == 0` or `== folderScopedCount`):
  no selection filter in play, no affordance.

### FROZEN ORACLE (frozen COPY literals - the spelling IS the fact here)

Per the seat rule, a frozen copy literal is the one place spelling is pinned.
These strings are the RECOMMENDED copy; the Wave-3 UX follow-up may revise them,
in which case the literal moves in the SAME change (it is a copy pin, not an
over-specified implementation spelling). The LOAD-BEARING facts are the numbers
N and M and the presence of both actions - a counter that lies about N or M is
the dangerous bug.

| # | folderScopedCount | selectedShownCount | showAll | expected |
|---|---|---|---|---|
| F1 | 3 | 0 | false | `null` (no subset) |
| F2 | 3 | 3 | false | `null` (all selected, nothing to narrow) |
| F3 | 3 | 2 | false | `{ mode:"filtered", counterText:"Showing 2 of 3 repos (grade-set selection)", primaryActionLabel:"Show all rows", secondaryActionLabel:"Clear selection" }` |
| F4 | 3 | 2 | true | `{ mode:"override", counterText:"Showing all 3 repos; 2 selected for grading", primaryActionLabel:"Filter to selection", secondaryActionLabel:"Clear selection" }` |

Sabotages:

| Sabotage | Dies on | Discriminates? |
|---|---|---|
| S-F1 counter uses `folderScopedCount` for both ("Showing 3 of 3") | F3 (text mismatch) | YES |
| S-F2 return the summary when `selectedShownCount == 0` (drop the subset guard) | F1 (`{...}` vs `null`) | YES |
| S-F3 return the summary when all selected (drop `< folderScopedCount`) | F2 (`{...}` vs `null`) | YES |
| S-F4 drop `showAll` branch (always "filtered") | F4 (wrong mode + labels) | YES |

### AC-F4-4 wiring

Source-text: the affordance element renders whenever `selectionFilterSummary(...)`
is non-null (i.e. when the auto-filter is active OR show-all overrides a live
subset), and BOTH action labels are present. FAIL: the filter can narrow the body
with no counter or no clear/show-all control. Reading claim on the actual
rendering - AC-F4-5 owner walk confirms the clicks.

### A deliberate scope note (do not "fix" it with a test)

The counter describes the SELECTION dimension only; when a search query is ALSO
active the body is further narrowed and fewer than N rows render. That is
honest - the search box is itself visible and self-explanatory - and it is why
`selectionFilterSummary` does NOT take the query. Do not add a query-aware
counter; it would couple two independent narrowings. Residual R-F4c (owner may
revisit the copy if the double-narrow confuses in the walk).

---

## 7. Test-file mechanics (hard constraints for the implementer)

- **New test files:** `repoGradesGradeSet.test.ts`, `repoGradesVisibleRows.test.ts`,
  and one structure test `repoGradesWaveCTypeahead.structure.test.ts` (source pins
  + the F3-c retargets of section 1/4).
- **Duplicate, never import, the structure-test helpers.** Copy
  `withoutLineComments` and `slice` from `repoGradesWaveBSearch.structure.test.ts:12-27`
  into the new structure test. Importing them re-runs that file's describe blocks
  (`no-cross-test-file-imports`). Use these EXACT forms - `withoutLineComments`
  is the non-enumerated name required by the repo, and its comment regex is the
  CRLF-safe UNANCHORED `/\/\/.*$/` after `.split(/\r?\n/)`; do NOT rename it to
  `stripComments` and do NOT write that literal anywhere in a new `*.test.ts`
  (it reddens `strip-comments-agreement.structure.test.ts` repo-wide).
- **Fixtures from the emitted shape.** Build `RepoGradeRow` fixtures with real
  `.repo` / `.binding.student` / `.binding.state` fields (section 3) - do not
  invent a shape `buildRepoGradeRows` never emits (`fixtures-must-match-emitted-shape`).
- **No `/s` (dotAll) regex** - passes vitest, fails tsc (TS1501).
- **No real fetch** - these leaves touch no network; nothing to mock. If any test
  ever reaches a Canvas path, mock `canvasFetch`, never `fetch`.
- **Anchors must resolve at BOTH ends.** Every `slice(src, start, end)` in the
  structure test inherits Wave B's both-ends assertion (`:23-25`) - keep it; a
  slice whose end anchor is missing silently widens to the rest of the file.

### Gate (PowerShell; multi-path form uses the wrapper - `test-paths-wrapper`)

```
npx tsc --noEmit
npm run lint      # exit 0 AND no NEW warning in files this wave writes
npm run test:paths src/app/components/repo-grades/repoGradesGradeSet.test.ts src/app/components/repo-grades/repoGradesVisibleRows.test.ts src/app/components/repo-grades/repoGradesWaveCTypeahead.structure.test.ts src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts src/app/components/repo-grades/repoGradesWaveBSearch.structure.test.ts src/app/components/repo-grades/repoGrades.wiring.test.ts src/app/components/repo-grades/repoGradesBulkGrade.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts src/app/components/courses/page-module-css-orphan-classes.test.ts
@(Get-Content src/app/components/repo-grades/index.tsx).Count   # must stay <= 1000
git status --short   # vs the Wave C file list; no .claude/worktrees copy edited
```
The ten paths above are every test the wave's edits touch. The three SHIPPED
pins Wave C retargets are all in the gate so the retarget is proven green, not
just the new files:
- `repoGradesWaveASticky.structure.test.ts` (W-A10 :117-119 + :124, section 1a),
- `repoGradesWaveBSearch.structure.test.ts` (:72/:77, section 1b),
- `repoGrades.wiring.test.ts` (:614, section 1d) - **this one the scope's gate
  omitted; its red would otherwise ship silent to main (BLOCKER 2b).**
`repoGrades.wiring.test.ts` must ALSO be listed in the A-W... Wave C VERIFY gate,
for the same reason. `test:paths` fails unless every argument is credited a
passing file (`test-paths-wrapper`); do not use a raw multi-path
`vitest`/`npm test`.

---

## 8. Executable here vs argued only

**Executable (a vitest run can pass/fail it):**
- V1-V10 `visibleRepoRows` oracle; S-V1..S-V4 sabotages (S-V5 reported
  non-discriminating).
- G1-G4 `resolveGradeScope` oracle; S-G1..S-G3 sabotages.
- T1-T4 `toggleRepoInGradeSet` oracle; S-T1..S-T3 sabotages.
- F1-F4 `selectionFilterSummary` oracle; S-F1..S-F4 sabotages.
- All source-text pins and retargets (sections 1, 4, 5, 6 wiring) - these are
  structure tests reading files, which DO run here.
- The three canaries + orphan ratchet + 1000-line ceiling.

**Argued only / OWNER BROWSER CHECK (no render here - do NOT fake with a green test):**
- The typeahead's markup, `role=combobox`/`aria-expanded`/`aria-autocomplete`,
  owned listbox, chip remove-button accessible name, and all keyboard behaviour
  (AC-F3 keyboard, R5). Reading claim only.
- The sticky scroll, the `--rg-working-header-h` offset under wrap, the header's
  above-fold height, both themes, narrow width (AC-F2-4, R6) - unchanged by
  Wave C's logic but re-exercised because Wave C adds controls to the header.
- The on-screen "Showing N of M" line and the Clear / Show-all CLICKS
  (AC-F4-5) - the helper's strings are pinned; that they render and the buttons
  act is the walk.
- Feature 3's leverage is click-cost/scroll-cost; **no removal test is buildable**
  (no component renders; `leverage.md` click-cost limit). Residual R4 - record,
  do not fabricate. The checkable core is AC-F3-2 (the typeahead feeds the same
  `selected` the plan builders read).

---

## 9. Reference-implementation proof (seat practice 1) and rebuilt mutants (practice 2)

A standalone reference implementation of all four leaves was run against every
frozen oracle row in this document. Command: `node wavec-ref.mjs` in the session
scratchpad (`.../scratchpad/wavec-ref.mjs`), final line **`28 passed, 0 failed`**.
That 28 reconciles exactly against section 8's executable list as
**22 oracle rows + 6 mutant-discrimination checks**:
- 22 oracle rows satisfiable (0 failures): V1-V10 (10) + G1-G4 (4) + T1-T4 (4) +
  F1-F4 (4) = 22 - the same 22 enumerated in section 8;
- 6 passing-but-wrong mutants each caught by >=1 oracle row: S-V1 (OR), S-V2
  (selection-ignored), S-V3 (query-ignored), S-V4 (no `>0` guard), S-G1 (bare
  `bulkSelectionOnly`), S-F1 (lying counter).

The red tests this document specifies are therefore satisfiable by a real
implementation - they are a spec, not a contradiction - and the oracle
discriminates against the six most likely wrong implementations.

**Rebuilt / discarded mutant (practice 2):** S-V5 (dropping only the upper
`< rows.length` guard) was built and found NON-DISCRIMINATING - it changes no
output, because when every displayed row is selected the narrowed base already
equals `rows`. It is reported here, NOT banked as a kill. The honest guard
sabotage for that line is S-V4 (the lower `> 0` guard), which discriminates on
V8. Counting S-V5 as coverage would be exactly the "instrument that does not
measure what it claims, wearing a number" this seat exists to prevent.

---

## 10. Residual register (owner, instrument, step)

Each names an owner, an instrument, and a measuring step. A residual missing any
of the three is a deletion - the orchestrator adds these to `docs/BACKLOG.md` at
disposal.

- **R-F4a (intersection vs literal-subset auto-filter rule):** OWNER owner;
  INSTRUMENT the `narrow` predicate + V8/V9 oracle rows; STEP if the owner wants
  literal set-subset semantics (blank the current folder when the whole selection
  is elsewhere), flip the predicate and V8/V9. Proceeding on intersection.
- **R-F4b (show-all override persistence):** OWNER owner; INSTRUMENT `FROZEN_KEYS`
  (stays 20 if ephemeral, 21 if persisted); STEP if persisted, add a `ta-` key +
  bump the canary. Proceeding on ephemeral.
- **R-F4c (selection counter is selection-only, ignores query double-narrow):**
  OWNER owner (walk); INSTRUMENT AC-F4-5; STEP owner judges in the browser whether
  the double-narrow confuses; copy revisable.
- **R3 (`bulkSelectionOnly` fate under F3-c=X):** OWNER owner; INSTRUMENT a
  follow-up scope note; STEP once the helper makes a non-empty set always scope,
  `bulkSelectionOnly` is redundant when a set is present - decide whether to
  retire `repoGradesUiState.ts`'s flag. Harmless until then. (Scope R3.)
- **R4 (no removal test for feature 3's click-cost leverage):** OWNER test seat
  records, owner accepts; INSTRUMENT none buildable (no render; advantage is
  clicks/scroll); STEP AC-F3-2 mechanism pin is the only machine evidence; the
  owner walk (AC-F3-5/F4-5) is the rest. A stated limit, not a deletion. (Scope R4.)
- **R5 (all typeahead/sticky/keyboard/scroll behaviour):** OWNER owner (browser);
  INSTRUMENT AC-F2-4 / AC-F4-5 / AC-F3 keyboard; STEP owner exercises post-deploy.
  Unverifiable here by construction. (Scope R5/R6.)
