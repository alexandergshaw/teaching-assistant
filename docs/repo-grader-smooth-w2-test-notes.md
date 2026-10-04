# Repo grader smoothing W2 - TDD test notes and oracles (backlog A7)

Status: TEST NOTES ONLY. No production code, no test code. Authored by the
test-notes/oracle seat (Opus) 2026-10-04, to be adversarially checked by a fresh
`loop-checker` before any implementer builds from it. The implementer writes the
tests and the production code from these notes; this file decides WHAT IS
MEASURED and HOW EACH THING FAILS.

Scope governs: `docs/repo-grader-smooth-scope.md` (the W2 bullet in section 4,
plus R2/R3/R5 in section 2 and AC8/AC9 in section 3). W1 shipped and verified
clean (`07d32c99`, the `repoGradesRunPlanLabels` leaf). These notes cover W2
ONLY: a new `repoGradesUiState.ts` leaf pair (2 keys), a single-course default
derivation, a settings `<details>` collapse, and a `LinkUsernamesPanel`
collapse. They do NOT cover W3 (the run bar), W4 (the chip), W5 (persisted
results) or W6 (the secondary surface).

## Instrument limits, binding on every line below

- NO COMPONENT IS RENDERED BY ANY TEST HERE. vitest is node-env and collects
  only `src/**/*.test.ts` (confirmed: `repoGradesUiState.test.ts` stubs a fake
  `window`/`localStorage` because neither exists under plain Node). Every claim
  about a control mounting, a click firing, a reload actually restoring, or any
  markup/focus/keyboard behaviour is therefore a READING CLAIM or an OWNER
  residual, never a vitest pass. Where I say "source-text pin" I mean a test
  that reads a file's text and asserts a fact about it; that is the only wiring
  instrument available and it proves nothing renders correctly.
- Every quantity below names the command that produced it. Line counts are
  `@(Get-Content f).Count` (PowerShell), never `Measure-Object -Line`.
- Tests are network-blocked (`vitest.setup.ts` throws on any real fetch). None
  of the W2 leaves touch the network; no `canvasFetch` mock is needed here.

## Satisfiability - PROVEN, not asserted

Reference implementations of all three W2 leaves were run against the frozen
oracle tables below in an isolated node script (`/tmp/rg-w2-ref.mjs`, node
v-whatever-this-box-has): 24 assertions, 24 pass, 0 fail. The single-course leaf
is a near-copy of the already-shipped `courseToAutoSelect`
(`src/app/components/walkthrough-announcement/walkthrough-run-decisions.ts:54-57`),
so its satisfiability is also established by direct analogy to shipped code. If
an implementer cannot make any oracle row below pass, the row is wrong - bring it
back, do not drop the assertion.

## Measured facts from HEAD

- `index.tsx` is 935 lines (`@(Get-Content src/app/components/repo-grades/index.tsx).Count`,
  run 2026-10-04). Ceiling is `LIMIT = 1000` in
  `src/file-size-ceiling.structure.test.ts`. Headroom = 65. W2's net growth cap
  is +25 (scope), so index.tsx must land at or below 960.
- repo-grades persistence keys today = 16, measured by
  `/"(ta-[a-z0-9-]*)"/g` over `repoGradesUiState.ts` only (node, run
  2026-10-04). All 16 are `const X_KEY = "ta-..."` definitions in that one file;
  the scan finds zero quoted key literals inside comments there, so 16 is exact,
  not a floor. The 16:
  `ta-repo-grades-assignment-map, -bulk-selection-only, -course, -folder,
  -instructions, -link-assignment, -link-source, -log, -org-prefix,
  -readme-instructions, -rubric, -rubric-manual-text, -rubric-source,
  -run-code-scoring, -selected, -sort`.
- The top-level canary `componentStorageKeys.structure.test.ts` is NON-RECURSIVE
  (it scans only files sitting directly in `src/app/components/`, per its own
  RULING-109 header). It does NOT cover `repo-grades/` keys. There is NO
  dedicated exact-set canary for the `repo-grades/` subdirectory today:
  `repoGradesUiState.test.ts` round-trips keys one at a time but never asserts
  the SET, so a key added or renamed there is caught by nothing. W2 adds one.
- `repoGrades.wiring.test.ts` already defines a local comment-strip helper named
  `stripComments` (line 482) and is already classified by the governance gate
  `src/tools/strip-comments-agreement.structure.test.ts`. Reachability
  source-slice pins that need comment-stripping go into THAT existing file and
  reuse THAT helper. No new `*.test.ts` in these notes may contain the literal
  `stripComments`; the new canary needs no comment-stripping at all (it scans
  raw source for quoted `"ta-..."` literals).

## What W2 ships (confirmed against the scope)

1. Two new persisted controls in `repoGradesUiState.ts`, one per disclosure:
   - `ta-repo-grades-settings-open` (R2: the grading-settings `<details>`).
   - `ta-repo-grades-link-open` (R3: the `LinkUsernamesPanel` collapse).
   Both are a tri-state override (never-written / explicitly-open /
   explicitly-closed), stored so that "never written" is DISTINGUISHABLE from
   "explicitly closed" - see Requirement 2.
2. A single-course default: when exactly one course exists and nothing was ever
   written, select it; a written choice is NEVER silently changed (scope R5;
   same family as the walkthrough `courseToAutoSelect` reading R). New pure leaf
   in `repoGradesCoursePicker.ts`, tested in `repoGradesCoursePicker.test.ts`.
3. A tiny pure open-state resolver `effectiveOpen(override, defaultWhenUnset)` so
   that a written collapse state wins over the derived default (Requirement 3).
   The derived default itself (what "configured" / "all bound" means) is argued,
   not pinned - see the residual register.
4. Wiring in `index.tsx` (budget +25 net), `RepoGradesControls.tsx` (settings
   `<details>`) and `LinkUsernamesPanel.tsx` (collapse). Nothing renders under
   vitest, so the wave's only machine checks on these files are the source-text
   reachability pins in Requirement 4 and the size pin.

## The W2 wave-gate command (this exact form, never a raw multi-path vitest)

```
npm run test:paths -- src/app/components/repo-grades/repoGradesUiState.test.ts src/app/components/repo-grades/repoGradesCoursePicker.test.ts src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts src/app/components/repo-grades/repoGrades.wiring.test.ts src/app/components/componentStorageKeys.structure.test.ts src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts src/tools/strip-comments-agreement.structure.test.ts
```

A raw `npx vitest run a b c ...` is forbidden: its filter is a union that
silently drops any argument it does not match and still exits 0. `npm run
test:paths` credits every argument at least one executed passing file or fails.

Every path above pre-exists on HEAD except
`repoGradesStorageKeys.structure.test.ts`, which is created by W2's write set
(verified by `ls`): `repoGradesUiState.test.ts`,
`repoGradesCoursePicker.test.ts`, `repoGrades.wiring.test.ts`,
`componentStorageKeys.structure.test.ts`, `src/file-size-ceiling.structure.test.ts`,
`src/source-bytes.structure.test.ts`, `src/lib/no-emojis.test.ts` and
`src/tools/strip-comments-agreement.structure.test.ts` all exist today (checked
2026-10-04). NO phantom path (the walkthrough round-1 blocker).

Behaviour-preservation note: the rest of the repo-grades suite
(`repoGrades.wiring.linking.test.ts`, `repoGradesSliceA/B.guards.test.ts`, the
rubric/feedback/code-execution/class-trends wiring tests,
`GithubGradingPanel.wiring.test.ts`, `gradingResultsHelpersEditState.test.ts`)
plus `npx tsc --noEmit` (ONE caller only - it races on `tsconfig.tsbuildinfo`)
and `npm run lint` (compared before and after, same command, for the
`preserve-manual-memoization` hazard the scope's R6 names) must also stay green;
they are not in the W2 `test:paths` line because W2 changes none of the
behaviour they pin, but a regression there is still a wave failure.

---

## Requirement 1 - single-course default derivation (scope R5; AC-adjacent)

**Object under comparison:** the return value of the new pure leaf
`courseIdToAutoSelect(courses, storedId)` in `repoGradesCoursePicker.ts`.
**Instrument:** a table-driven frozen-literal oracle in
`repoGradesCoursePicker.test.ts`, every expected value hand-authored below and
NOT recomputed by calling the function under test or any helper that shares its
logic. **Direction of failure:** any row whose actual return differs from the
frozen expected value; in particular a stale written id being re-homed to the
sole course (R8), or a present written id being changed (R6/R7/R10), or the
sole course failing to auto-select on a never-written value (R1/R2).

Signature (mirrors the shipped `courseToAutoSelect` exactly):
`export function courseIdToAutoSelect(courses: readonly { readonly id: string }[], storedId: string | null): string | null`

Contract (reading R - the walkthrough M5 family; never silently change a WRITTEN
value):
- a written id still present in `courses` is returned unchanged (a call-site
  no-op);
- a written id no longer in `courses` (stale) yields `null` - it is NOT
  re-homed to the sole course, because that would silently change which course
  gets graded/posted;
- a never-written value (`null` or `""`) with exactly one course yields that
  course's id;
- a never-written value with zero or many courses yields `null`.

`""` is treated as never-written because repo-grades stores `courseId` as `""`
by default (`repoGradesUiState.ts` `defaultUiState`), so the caller passes
`uiState.courseId || null`.

### Frozen oracle (10 rows; `c1 = {id:"c1"}`, `c2 = {id:"c2"}`)

| row | courses | storedId | expected | why it is in the table |
|---|---|---|---|---|
| R1 | `[c1]` | `null` | `"c1"` | sole course, never written -> auto-select (the whole feature) |
| R2 | `[c1]` | `""` | `"c1"` | `""` is never-written for this view; distinguishes it from a real id |
| R3 | `[c1,c2]` | `null` | `null` | many courses, never written -> change nothing |
| R4 | `[]` | `null` | `null` | zero courses, never written -> change nothing |
| R5 | `[]` | `""` | `null` | zero courses + `""` -> null (guards an empty-list crash) |
| R6 | `[c1]` | `"c1"` | `"c1"` | present written id -> unchanged (NOT nulled) |
| R7 | `[c1,c2]` | `"c1"` | `"c1"` | present written id among many -> unchanged |
| R8 | `[c1]` | `"c2"` | `null` | STALE written id + exactly one course -> null (CONTESTED - reading R) |
| R9 | `[c1,c2]` | `"c9"` | `null` | stale written id + many -> null |
| R10 | `[c1,c2]` | `"c2"` | `"c2"` | present written id in SECOND position -> unchanged (kills "return courses[0].id") |

R8 is the one contested row and the only row that distinguishes reading R from
the "re-home to the sole course" precedent. I adopt reading R because the
sibling walkthrough leaf shipped reading R (`ffaba04f`), and because leaving a
stale id (the picker then shows nothing selected and the instructor re-picks) is
less dangerous than silently moving the grading target. This is the ONE routed
fork; see the checker flag at the end.

---

## Requirement 2 - persistence of the two new collapse keys (scope R2/R3; AC8)

**Object:** the two new keys through `persistRepoGradesUiState` ->
`loadRepoGradesUiState`, and their presence in the frozen repo-grades key set.
**Instrument:** round-trip assertions added to `repoGradesUiState.test.ts`, PLUS
a new exact-set canary `repoGradesStorageKeys.structure.test.ts`.
**Direction of failure:** an explicitly-written collapse state not surviving
reload; a never-written state reading back as a fixed `true`/`false` (which would
make the derived default unable to tell "user chose" from "unset" - the silent
reset); or the key set drifting (a key added/renamed/removed) without the canary
updating.

### The tri-state storage contract (this is the subtle part)

Each override is `boolean | null`:
- `null` = never written -> the resolver uses the derived default (Requirement 3).
- `true` = the instructor explicitly expanded.
- `false` = the instructor explicitly collapsed.

Because `null` and `false` MUST stay distinguishable across reload, the
encoding is:
- persist `null` -> the key is ABSENT (the implementer calls `removeItem(key)`,
  or writes nothing, for a null override - it must NOT write `""`);
- persist `true` -> `"1"`;
- persist `false` -> `"0"`.
Parse: `raw === null ? null : raw === "1"` (so `"0"` and any stray value read as
`false`, and only a genuinely absent key reads as `null`).

Add `settingsOpen: boolean | null` and `linkPanelOpen: boolean | null` to
`RepoGradesUiState`. `defaultUiState()` sets both to `null`.

### Round-trip pins (in `repoGradesUiState.test.ts`; extend the existing suite)

Each is a frozen-literal assertion, not a recomputation:

- P2a: never-written reads as `null`. `loadRepoGradesUiState().settingsOpen` is
  `null` and `.linkPanelOpen` is `null` when nothing is stored. (Fold into the
  existing "returns defaults when nothing is stored" `toEqual`, adding the two
  fields as `null`.)
- P2b: `persist({..., settingsOpen:true, linkPanelOpen:false})` then `load`
  yields `settingsOpen === true` and `linkPanelOpen === false`.
- P2c (THE WORST-FAILURE GUARD): `persist({..., settingsOpen:false})` then
  `load` yields `settingsOpen === false`, NOT `null`. An explicit collapse must
  survive reload as a collapse. State this test in its own `it`, because it is
  the exact pin the most-likely mis-build (writing `""` for both null and false)
  turns red.
- P2d: the raw storage encoding. After `persist({..., settingsOpen:null,
  linkPanelOpen:true})`, `fakeStorage.getItem("ta-repo-grades-settings-open")`
  is `null` (absent) and `fakeStorage.getItem("ta-repo-grades-link-open")` is
  `"1"`. After `persist({..., settingsOpen:false})`,
  `getItem("ta-repo-grades-settings-open")` is `"0"`.
- P2e: SSR-safe (window undefined) load returns both as `null` and persist does
  not throw - fold into the existing SSR tests' `toEqual`.
- P2f: a stray stored value reads as `false`. `setItem("ta-repo-grades-settings-open","nonsense")`
  then `load().settingsOpen === false` (mirrors the existing
  `parseBulkSelectionOnly` "nonsense -> false" test).

Note to the implementer: the existing full-state `toEqual` tests in this file
(there are several) will each need the two new fields added, or they fail on an
unexpected key. That is expected churn, not a new assertion.

### Exact-set key canary - NEW FILE `repoGradesStorageKeys.structure.test.ts`

The top-level `componentStorageKeys.structure.test.ts` is non-recursive and does
not see this subdir (measured above), and `repoGradesUiState.test.ts` is not an
exact-set canary, so a dedicated one is required (the same reason grading-chat
and snapshot-grading each have their own directory-scoped canary).

**Construction (stated so the implementer builds it, not guesses it):** scan the
text of `src/app/components/repo-grades/repoGradesUiState.ts` ONLY, with the
quoted-literal pattern `/"(ta-[a-z0-9-]*)"/g`, collect the distinct matches into
a set, and assert it `toEqual` a frozen sorted literal. This file is the single
authoritative home of every persistence key for this view (its own header says
so), all 16 current keys are `const` definitions there, and the two W2 keys land
there - so a one-file quoted-literal scan yields the exact authoritative set with
no comment-mention noise (the directory-wide quote-free scan, by contrast, also
catches `ta-llm-provider` mentioned in `index.tsx` - measured, 17 tokens over 34
files - which is why the canary is scoped to the one definition file, not the
directory). This scan needs NO comment-stripping, so the file contains no
`stripComments` literal and is not touched by the governance gate.

**The frozen set after W2 is exactly these 18 (sorted):**
```
ta-repo-grades-assignment-map
ta-repo-grades-bulk-selection-only
ta-repo-grades-course
ta-repo-grades-folder
ta-repo-grades-instructions
ta-repo-grades-link-assignment
ta-repo-grades-link-open
ta-repo-grades-link-source
ta-repo-grades-log
ta-repo-grades-org-prefix
ta-repo-grades-readme-instructions
ta-repo-grades-rubric
ta-repo-grades-rubric-manual-text
ta-repo-grades-rubric-source
ta-repo-grades-run-code-scoring
ta-repo-grades-selected
ta-repo-grades-settings-open
ta-repo-grades-sort
```
(the 16 measured on HEAD plus `ta-repo-grades-link-open` and
`ta-repo-grades-settings-open`).

Canary assertions, all required:
- K1: the collected set `toEqual` the frozen 18-literal (the exact-set assertion).
- K2 (population control, so the scan cannot pass vacuously): the collected set
  has more than one key - assert `> 10`, which a file that lost its keys fails.
- K3 (added-key red proof): collecting over `source + '\nconst x = "ta-repo-grades-new-canary";\n'`
  does NOT equal the frozen 18. Proves a 19th key reddens it.
- K4 (removed-key red proof): collecting over
  `source.split('"ta-repo-grades-link-open"').join('"ta-removed"')` does NOT
  equal the frozen 18. Proves a dropped/renamed key reddens it.

An added-key guard that is `not.toEqual` is only meaningful alongside K1 (the
positive exact-set). Both are required; K1 alone would miss a rename that
swaps one key for another of the same count, and K3/K4 alone would miss a count
change K1 catches.

---

## Requirement 3 - the open-state resolver (so a written collapse wins)

**Object:** `effectiveOpen(override, defaultWhenUnset)` in
`repoGradesCoursePicker.ts` (or a sibling pure leaf the architect chooses; it is
one line). **Instrument:** a 4-row frozen oracle in the matching `.test.ts`.
**Direction of failure:** a written override being ignored in favour of the
derived default (a persisted control that silently resets - the worst-failure
the brief names), or the default not applying when the override is unset.

Contract: `effectiveOpen(override, defaultWhenUnset) = override ?? defaultWhenUnset`.

| row | override | defaultWhenUnset | expected | why |
|---|---|---|---|---|
| E1 | `true` | `false` | `true` | explicit open wins |
| E2 | `false` | `true` | `false` | explicit CLOSE wins over a derive-open default (the reset guard) |
| E3 | `null` | `true` | `true` | unset -> derive (first-run open) |
| E4 | `null` | `false` | `false` | unset -> derive (collapsed-when-configured) |

E2 is the load-bearing row: it is the one that goes red if the resolver ever
prefers the default over a written value.

What `defaultWhenUnset` IS (configured-state for settings, all-bound for the link
panel) is computed in the component from runtime signals and is NOT pinned here -
nothing renders, so it is an owner/argued residual (R-W2-3). What IS pinned is
that whatever that default is, a written override overrides it.

---

## Requirement 4 - reachability (a capability shipped dead is the repeated defect)

Nothing renders under vitest, so these are source-text pins added to the already
-classified `repoGrades.wiring.test.ts`, reusing its existing local
`stripComments` helper (line 482) the way W1's pins did. They are ARGUED wiring
claims, not runtime proof; the runtime behaviour is OWNER residual R-W2-1.

**Object:** `index.tsx` source (stripped of comments via the existing helper).
**Instrument / direction:**

- RW4a (single-course default is actually WIRED to the course seed): the
  stripped `index.tsx` imports `courseIdToAutoSelect` from `./repoGradesCoursePicker`
  AND calls it, and the call reads the loaded `courses` and the stored courseId
  and feeds a `setUiState`/course-setter (so the result is applied, not
  computed-and-discarded). Pin the FACT and the data flow, not the spelling:
  assert the stripped source contains a call `courseIdToAutoSelect(` and that
  the same statement/region references both `courses` and `courseId`. Fails if
  the leaf is imported but never called (the exported-but-uncalled trap), or
  called but its result never reaches `setUiState`. This is the "wired to the
  seed, not just computed" guard the brief demands.
- RW4b (settings collapse persistence is read and written): the stripped
  `index.tsx` passes a `settingsOpen` value and an `onSettingsOpenChange`-style
  setter into `RepoGradesControls` (read-on-mount comes free via the existing
  `useState(() => loadRepoGradesUiState())` + the existing
  `useEffect(persistRepoGradesUiState, [uiState])`; the pin is that the control
  is actually handed the value and a setter, so a toggle reaches `uiState`).
  Fails if either the value or the setter prop is absent.
- RW4c (link collapse persistence is read and written): same shape for
  `LinkUsernamesPanel` - it is passed a `linkPanelOpen` value and its setter.
- RW4d (the two new keys are genuinely in load AND persist): add two assertions
  that `repoGradesUiState.ts` source contains `localStorage.getItem` for each of
  `"ta-repo-grades-settings-open"` and `"ta-repo-grades-link-open"` AND a
  `removeItem`/`setItem` write for each. (Belt-and-suspenders over the round-trip
  test, pinning that the key is read on load and written on persist, which is
  what makes read-on-mount / write-on-change true.) These may live in
  `repoGradesStorageKeys.structure.test.ts` or `repoGradesUiState.test.ts`; put
  them where no `stripComments` literal is needed (they do not need stripping -
  the key literals are unambiguous).

Keep these as FACT-and-ordering pins, never exact-spelling: source-text tests
that pinned exact wording have twice forced contorted implementations in this
repo.

---

## Requirement 5 - index.tsx size ceiling (the binding constraint)

**Object:** `@(Get-Content src/app/components/repo-grades/index.tsx).Count`.
**Instrument:** `src/file-size-ceiling.structure.test.ts` (LIMIT = 1000), plus a
manual re-measure at the wave gate. **Direction:** fails if index.tsx exceeds
1000. **W2 budget:** net growth at most +25 over the HEAD 935, i.e. the built
index.tsx must be <= 960. The ceiling test only catches 1000; the +25 (<= 960)
is a wave-gate measurement the implementer and verifier must take by hand with
the PowerShell instrument and state with its command. If W2 would push index.tsx
past ~960, the scope says extract before adding - that is a wave re-cut, routed
to the orchestrator, not a silent overage.

---

## SABOTAGE LEDGER

One mutant per oracle row / pin, each stated so it reds EXACTLY that thing and
is neither red-in-both-directions nor green-in-both. For each I say whether it
discriminates; a mutant that cannot discriminate is called out as such rather
than banked as coverage.

### Single-course leaf (Requirement 1)

| mutant | applied to | expected | discriminates? |
|---|---|---|---|
| S1 `return courses.length >= 1 ? courses[0].id : null` for the never-written branch | leaf | R3 goes RED (many -> would return c1 not null); R1 stays green | YES - kills "auto-select even when ambiguous" |
| S2 drop the `courses.some(...)` guard: `if (storedId) return storedId` | leaf | R8 RED (stale "c2" returned instead of null) and R9 RED | YES - this is the stale-value worst-failure guard |
| S3 re-home stale to sole course: stale branch returns `courses.length===1 ? courses[0].id : null` | leaf | R8 RED (returns "c1" not null) | YES, and ONLY R8 - this is exactly the contested reading R vs precedent; proves R8 is the discriminating row |
| S4 `return courses[courses.length-1].id` in sole branch | leaf | R1/R2 still green (one course), but add nothing - NON-DISCRIMINATING against R1 alone | NO against R1; R10 is the guard instead (a present-stored "always return first/last" mutant: `if(storedId) return courses[0].id` reds R10) |

S4 is recorded as the honest negative: a "wrong index" mutant on the sole-course
branch cannot be distinguished by R1/R2 (one element). R10 (`[c1,c2],"c2"` ->
`"c2"`) is what kills an "always return courses[0].id when a stored id is
present" mutant, so R10 is load-bearing and must stay.

### Collapse persistence (Requirement 2)

| mutant | applied to | expected | discriminates? |
|---|---|---|---|
| S5 encode `false` as `""` instead of `"0"`, parse `""` as `null` | persist/parse | P2c RED (explicit false reads back as null) and P2d RED | YES - the silent-reset worst-failure |
| S6 parse never writes the key for `null` but writes `""` for null | persist | P2d RED (getItem is `""` not null) | YES |
| S7 drop `ta-repo-grades-settings-open` from `persistRepoGradesUiState` entirely | persist | P2b RED (settingsOpen does not round-trip) and RW4d RED | YES |
| S8 add a 19th key `const FOO = "ta-repo-grades-foo"` | source | K1 RED and K3-shape RED | YES - the canary catches an added key |
| S9 rename `ta-repo-grades-link-open` to `ta-repo-grades-link-collapsed` | source | K1 RED and K4 RED | YES - rename caught |
| S10 delete the K1 exact-set assertion, keep K3/K4 | test | NOTHING reds (K3/K4 still pass) - proves K1 is NOT redundant | DIAGNOSTIC: run this to confirm K1 earns its place; a rename that preserves count would slip past K3/K4 alone |

S10 is a test-on-the-test: it demonstrates that K3/K4 (`not.toEqual` guards) do
not subsume K1 (the positive exact-set). If removing K1 reds nothing, K1 is
pulling real weight and must stay.

### Open-state resolver (Requirement 3)

| mutant | applied to | expected | discriminates? |
|---|---|---|---|
| S11 `return defaultWhenUnset` (ignore override) | resolver | E1 RED (true override ignored) and E2 RED | YES - the reset guard |
| S12 `return override === true` (treat null as false, ignore default) | resolver | E3 RED (null+default-true -> false) | YES |
| S13 `return override ?? !defaultWhenUnset` | resolver | E3 and E4 RED | YES |

### Reachability (Requirement 4)

| mutant | applied to | expected | discriminates? |
|---|---|---|---|
| S14 import `courseIdToAutoSelect` but never call it | index.tsx | RW4a RED (call token absent) | YES - the exported-but-uncalled trap |
| S15 call `courseIdToAutoSelect(courses, courseId)` but discard the result (no setUiState) | index.tsx | RW4a RED (result-not-applied clause) | YES - requires the data-flow clause, not just a call token |
| S16 stop passing the `settingsOpen` value prop to RepoGradesControls | index.tsx | RW4b RED | YES |

S15 is why RW4a must assert the result REACHES a setter, not merely that the
function is called - a call whose result is dropped ships the capability dead
with the call-token pin green.

### Size (Requirement 5)

| mutant | applied to | expected | discriminates? |
|---|---|---|---|
| S17 pad index.tsx past 1000 lines | index.tsx | file-size-ceiling test RED | YES (but only at 1000; the +25/<=960 budget is a hand-measurement, not this test) |

---

## Executable here vs argued (labelled; the argued ones are NOT asserted as verified)

EXECUTABLE under vitest on this box (pure functions + source-text reads):
- Requirement 1 oracle (all 10 rows).
- Requirement 2 round-trips P2a-P2f and the K1-K4 canary.
- Requirement 3 resolver oracle (E1-E4).
- Requirement 4 source-text reachability pins RW4a-RW4d.
- Requirement 5 ceiling test (the 1000 line limit only).

ARGUED only (NOT proven by any vitest pass here; routed to the owner):
- That the single-course default ACTUALLY auto-selects in a live browser on
  first load, and that a stale id ACTUALLY leaves the picker unselected rather
  than crashing the view. Source-text says the leaf is wired; the render does
  not run here.
- That a collapse state ACTUALLY survives a real reload (real localStorage),
  and that the `<details>`/collapse markup is keyboard- and screen-reader-usable.
- The derived default policy (what "configured state" and "all rows bound" mean
  for `defaultWhenUnset`).
- The +25/<=960 index.tsx budget (a hand-measurement at the gate, not the 1000
  ceiling test).
- Lint `preserve-manual-memoization` not regressing (scope R6).

---

## RESIDUAL REGISTER (owner, instrument, measuring step - all three, or it is a deletion)

| id | not proven here | owner | instrument | step that measures it |
|---|---|---|---|---|
| R-W2-1 | single-course default and stale-id behaviour in a real browser | repo owner | load the view on a one-course account with cleared storage; confirm the course auto-selects; delete the stored course and confirm the picker shows unselected, not a crash | SMOOTH-BASELINE walk / W3 verify |
| R-W2-2 | a real reload actually restores both collapse states; the disclosure markup is accessible | repo owner | toggle each disclosure, reload, confirm state held; keyboard-operate the `<details>` and the link collapse | W3 verify |
| R-W2-3 | the derived `defaultWhenUnset` policy (configured-state / all-bound) | repo owner / architect (W2 follow-up design) | product decision + a source pin once the signal is named | W2 architect pass, before build if contested |
| R-W2-4 | index.tsx net growth <= 960 (the +25 budget) | wave gate | `@(Get-Content src/app/components/repo-grades/index.tsx).Count` before and after W2 | W2 wave gate; re-cut to an extraction wave if exceeded |
| R-W2-5 | lint does not regress on the hook/prop moves | wave gate | `npm run lint` before vs after, same command | every W2 commit |
| R-W2-6 | T-RULING-1 (the stale+single row) is still formally open for the owner across BOTH this leaf and the walkthrough leaf | repo owner / orchestrator | the single input `courseIdToAutoSelect([{id:"c1"}], "c2")`; decide null (R) or `"c1"` (precedent) | the owner's answer flips R8 and S3 if precedent; one function line + one row |

---

## FLAG FOR THE CHECKER

**The ONE thing most likely to be built wrong:** the tri-state collapse encoding
(Requirement 2). The easy, wrong build stores `"1"` for open and `""` for both
closed-and-never-written, collapsing `null` into `false`. That passes a naive
round-trip of `true`, passes the key canary, passes tsc and lint - and silently
resets the derived default's ability to honour an explicit collapse on reload,
which is the exact "a persisted control that silently resets" worst-failure the
brief names. P2c and P2d exist precisely to red that build; S5/S6 are the
mutants that prove they do. The checker should confirm P2c asserts
`settingsOpen === false` (not merely truthy/falsy) after an explicit-false
persist-then-load, and that P2d pins the raw storage absence for `null`.

**The one routed fork (refuse a ruling I can disprove; I adopt a reading and
say so):** R8 - a stale written courseId with exactly one eligible course. I
adopt reading R (return `null`, never re-home), matching the shipped walkthrough
`courseToAutoSelect` and the "never silently change where grading goes"
principle. The precedent reading (return the sole course id) is defensible for a
single-course account and is what T-RULING-1 leaves open on the walkthrough side.
If the owner picks the precedent, flip exactly R8's expected value (to `"c1"`),
retire S3, and change the one conjunct in the leaf. I did NOT invent a blocking
premise; the build proceeds on reading R now.

**A second, smaller routed consideration:** the scope's R5 says "when exactly
one course exists", not "one GRADEABLE course". The walkthrough precedent
filtered eligibility to Canvas-linked courses; I did NOT add a GitHub-org
eligibility filter here, because the scope names none and repo-grades requires a
GitHub org only to scan, not to select. So `courseIdToAutoSelect` treats
eligibility as "present in the `courses` list index.tsx passes". If the owner
wants auto-select to fire only for a course with a GitHub org, index.tsx should
pre-filter the list before the call (the leaf contract is unchanged); the
discriminating input is a two-course account where only one has an org. Recorded
as a declined option, not built.
