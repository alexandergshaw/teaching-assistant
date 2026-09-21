# A23 - test notes and oracle (the instruments, and how each fails)

**Row:** `docs/backlog.yml:429` (`id: 'A23'`), `kind: 'bug'` at `:438`.
**Seat:** test notes and oracle (`loop-test-author`). **Date:** 2026-09-21.
**Consumes:** `docs/a23-criteria.md` at `c458f7a` (round 3, disposal) and
`docs/a23-architecture.md` at `182ecc6` (the delta). The SHAPE is settled and
this document does not redesign it: a transitive runtime-import-graph walk from
a tree-derived root set, under a capability predicate on the RESOLVED path, with
edge extraction by `ts.createSourceFile`.
**Write scope:** exactly one path, `docs/a23-test-notes.md`. `git status --short`
before and after this pass returned `M docs/css-orphans.md` only - dirty from
work outside this loop and not touched here.
**Tree:** every quantity below was produced by a command stated at its point of
use, run in this checkout at session HEAD `182ecc6`
(`git log --oneline -1`). Nothing here is quoted from another document without
being labelled as quoted.
**Every `docs/a23-architecture.md:<n>` cite below is pinned to `182ecc6` and was
opened there.** A disposal round on that document is in flight concurrently with
this pass (three majors: the policy lists' home, a canary assertion restated as
`.some()` over `resolved` rather than `trail`, and a four-versus-ten probe
count), so those line numbers will shift. Re-resolve them by heading, not by
number, once it lands. The canary restatement in particular touches R-5c below,
which is written against `resolved` for exactly that reason.

---

## 0. What this document is, and the two things it refuses to be

It is the fixture set, the frozen oracles, the numbered requirements with their
failure directions, the sabotage design, and the landing order. It is NOT a
second architecture pass and NOT the test code - `loop-implementer` writes the
code from here.

**Leverage line - FIRED AND DECLINED.** `docs/backlog.yml:438` carries
`kind: 'bug'`; `seats.md:70-75` rules that a bug fix makes no leverage claim.
Trigger fired: bug fix. There is therefore **no removal test** to build, and
inventing one would describe the app rather than this work.

**NO COMPONENT IS RENDERED BY ANY TEST HERE.** Every requirement below is a
property of a string, a file list, or a module graph. None needs a render, and
none is written as though a green suite proved anything about markup.

---

## 1. Re-derivation owed to me, and three conflicts I am reporting rather than adopting

`docs/a23-criteria.md:237-243` (Ruling Y3) obliges this seat to re-derive
sections 2.3 and 6 from its own run and report every cell those tables got
wrong. `docs/a23-architecture.md:1205-1231` (Ruling M2) relocates the
23-construct list here. Doing both turned up three conflicts. I measured each
and adopt no value silently.

### 1.1 `unresolvable` is ZERO in the grading-results closure today, not 1

My dispatch brief states, under obligation O-1, that "a computed import measures
`residue=1` in the grading-results closure today". **Measured, that is false.**

```
node --experimental-strip-types <sandbox>/harness.ts      # PART 2 / PART 3
SITE 2+3 grading-results (dir + GradingResults.tsx + types.ts)
  roots=13 nodes=93 162ms violations=0 unresolvable=0 unallowed=0
whole-src non-test files=1560 parse+scan=1415ms UNCLASSIFIABLE import sites=0
```

`residue=1` is a **sabotage row**, not a tree measurement: it is line S14 of
`docs/a23-architecture.md:669` ("computed import() -> RESIDUE, must be reported
residue=1 want=residue OK"), where the computed specifier is INJECTED. The
architecture's own tree figures agree with mine - `residue=0` at
`docs/a23-architecture.md:744,756` and `import sites=0` at `:779`.

**Why this matters, and it is not pedantry.** If `unresolvable` were really 1
today, then "assert `unresolvable` is empty over the closure" would be a
requirement the tree could not satisfy, and the honest response would be to
change the requirement. It is 0, so the requirement is satisfiable - **but it
also means that assertion is GREEN in both directions against the mutation it
appears to guard** (section 5, M5). The discriminating instrument for
`unresolvable` is the residue FIXTURE, not the closure assertion. O-1 is
discharged with both stated, because only the pair is honest.

### 1.2 The architecture's 0 / 19 / 22 / 20 scoreboard does NOT reproduce

The 23-construct list "appears nowhere" (`docs/a23-architecture.md:1207`), so
its scoreboard cannot be re-derived - which is exactly why Ruling M2 relocated
it here. I built the product from construction rather than reconstructing a list
I cannot see, and the numbers differ:

| Extractor | architecture 3.2 (46 fixtures, list unavailable) | this document (132 fixtures, section 3) |
|---|---|---|
| AST classifier | 0 | **0** |
| `valueImportSpecifiers` | 19 | **51** |
| guard 1 line classifier | 22 | **72** |
| unconditional sweep | 20 | **78** |

Command: `node --experimental-strip-types <sandbox>/harness.ts`, PART 1.

The AST column reproduces. The other three do not, and their **relative order
changes**: the architecture has the sweep (20) better than guard 1 (22); mine
has the sweep worst (78 against 72), because my product includes the two
false-positive constructs (a banned specifier in a comment and inside a string)
that only the raw-source sweep fails, and weights the wrap/separator axis more
heavily.

**No requirement here rests on either scoreboard.** `docs/a23-architecture.md:1226-1231`
already rules that the only claim section 3.2 supports is that
`valueImportSpecifiers` fails AC-2(c) and AC-4 - both of which my run confirms
independently and per construct (construct `09-default-plus-inline-type`: 8 of 8
fixtures wrong; every single-quoted fixture of every construct wrong). The
scoreboard's role is the step-1 RED COUNT (section 6), where the number that
matters is the one produced by the table as landed, not by either document.

### 1.3 Z3's "two runtime edges into `types.ts`" is right - for the closure, not for `src/`

`docs/a23-architecture.md:412-421` reports 2 runtime edges into
`src/lib/grade/types.ts`. Measured over the whole of `src/` I get **13**. Both
are true of different objects, and the architecture's is the one Ruling Z3
actually needs:

```
node --experimental-strip-types <sandbox>/probe2.ts
Z3.closure_nodes=93
Z3.runtime_edges_into_types_within_closure=2
Z3.who=src/app/components/grading-results/ungradedDisclosure.ts|src/lib/grade/class-trends.ts
# and, whole-src (<sandbox>/rebuilds.ts (e)):
RUNTIME edges into types.ts = 13
files with any textual from-clause naming it = 143
```

The two files the architecture names are exactly the two in the closure.
**Ruling Z3 stands, and its ground is now measured twice.** I record the 13 so
nobody later reads "2" as a whole-tree fact and concludes the file is barely
used - it is reached by 13 runtime edges across `src/` and named in 143 files.

---

## 2. The reference implementation: proof the red tests are satisfiable

`loop-test-author.md:90-98` requires this. A set of failing tests is not a
specification until something has passed it.

**Where.** A throwaway tree at `.vercel/a23ref/` - `.vercel` is gitignored
(`git check-ignore -v .vercel` -> `.gitignore:38`) AND is in
`src/source-bytes.structure.test.ts:38`'s `SKIP_DIRS`, so a sandbox there cannot
be collected by the repo-root byte walker. (A prior row's sandbox at `.a21ref`
WAS collected by that gate.) **`node_modules` was never junctioned, symlinked or
touched**; measured before and after: `ls node_modules | wc -l` -> `447` both
times, `@(Get-ChildItem node_modules -Force).Count` -> `450`, and
`@(Get-ChildItem node_modules -Force | Where-Object { $_.Attributes -band
[IO.FileAttributes]::ReparsePoint }).Count` -> `0`. Torn down with
`rm -rf .vercel/a23ref` and proved: `ls -a .vercel` -> `./ ../` only, then
`rmdir .vercel`; `git status --short` -> `M docs/css-orphans.md`, unchanged.

**What was built.** `runtime-import-graph.ts` implementing
`docs/a23-architecture.md:820-876`'s seam verbatim - `scanRuntimeEdges`,
`classifySpecifier` with the five buckets, `walkRuntimeGraph` with
`WalkOptions`/`Violation`/`Unallowed`/`WalkResult`, `directRuntimeSpecifiers`,
`directoryRoots` - plus the 25-construct fixture table and four harnesses.
Loaded `typescript` exactly as the architecture specifies,
`createRequire(import.meta.url)("typescript")`, which resolved 5.9.3 from inside
the sandbox.

**Result. Every requirement in section 4 is satisfiable by one implementation,
and it is green on all of them simultaneously.**

```
node --experimental-strip-types <sandbox>/probe.ts
R2.rg_root_count=32
R2.rg_roots_match_frozen=true
RG.violations=0  RG.unresolvable=0  RG.unallowed=0  RG.nodes=149
GR.violations=0  GR.unresolvable=0  GR.unallowed=0  GR.nodes=93
CANARY.barrel_violations_gt0=true   CANARY.barrel_violations=4
CANARY.barrel_unallowed_gt0=true    CANARY.barrel_unallowed=6
CANARY.barrel_trail_names_supabase_server=true
CANARY.owner_violations_gt0=true    CANARY.owner_names_async_hooks=true
XP.fixtures=132  XP.ast_disagreements=0
```

Every one of those figures matches `docs/a23-architecture.md`'s shipping-config
delta (`:753-758`, `:1131-1150`) to the digit: `roots=32 nodes=149`,
`roots=13 nodes=93`, `violations=4 nodes=74 unallowed=6` for the barrel,
`violations=2 nodes=3` for owner-context. Nothing in the design was found
unbuildable, and **I changed no criterion.**

**The seam also typechecks under `--strict`:**

```
npx tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler \
  --target es2022 --allowImportingTsExtensions <sandbox>/runtime-import-graph.ts <sandbox>/fixtures.ts
(no output, exit 0)
```

**This form is safe to run alongside the wave gate and the plain form is not.**
`tsc` with explicit file arguments does not read `tsconfig.json`, so it never
writes `tsconfig.tsbuildinfo`. Measured: `md5sum tsconfig.tsbuildinfo` was
`febba08198005975b2191ed3d852ca81` immediately before and immediately after that
command. The bare `npx tsc --noEmit` still has exactly one caller, the wave gate.

**What the reference run does NOT prove, stated rather than glossed.** It ran
under `node --experimental-strip-types`, not under vitest. It therefore does not
discharge RES-A23-12 (whether `typescript` loads under vitest's transform) and
does not measure the walk's cost under vitest. Both stay residuals (section 8).

---

## 3. The frozen oracles, as CONSTRUCTIONS

Four oracles. Each says how the set is built, and each construction was executed
against this tree.

### O-A. The construct cross-product (obligation O-3)

**Construction.** `FIXTURES = CONSTRUCTS x SEPARATORS x QUOTES`, filtered by a
per-construct applicability rule. It is a product, not a hand-written list, so
it cannot silently miss a cell - `traps-tests.md:24-29`.

- **`SEPARATORS` (4):** `inline` (one line, single spaces - the control);
  `brace-wrap` (a newline just inside `{` and just inside `}`); `from-wrap` (a
  newline between the `from` token and the specifier); `tab` (a TAB, not a
  space, between `from` and the specifier). This is AC-1's axis, and
  `docs/a23-criteria.md:315-325` already records WHY it is not "multi-line": the
  tab case is a single line and still escapes.
- **`QUOTES` (2):** `"` and `'`.
- **Applicability:** `brace-wrap` applies only to a construct that has braces;
  `from-wrap` and `tab` only to a construct that has a literal `from` token;
  both quote styles only to a construct whose specifier sits in a swappable
  quote. A construct with none of those gets exactly one fixture.
- **The specifier is always `@/lib/grade`**, the barrel every chartered guard
  names.

**`want` is the ground truth about the MODULE GRAPH, not about any guard:**
`edge` = a real runtime edge at that specifier; `erased` = erased by the
TypeScript transform, so no edge; `residue` = the specifier is not a string
literal, so the extractor must REPORT it as unclassifiable and emit no edge;
`none` = the text is not an import at all.

**THE 25 CONSTRUCTS.** Fixture counts are `n`; the last four columns are
per-construct disagreement counts for the AST extractor, `valueImportSpecifiers`
(duplicated verbatim from `classTrendsDraft.not-postable.test.ts:98`), guard 1's
line classifier (`repoGradesFeedbackAndFiles.wiring.test.ts:295-301`) and the
OPTION (b) unconditional sweep. Produced by
`node --experimental-strip-types <sandbox>/harness.ts`, PART 1.

| id | construct | want | n | ast | vis | g1 | sweep |
|---|---|---|---|---|---|---|---|
| 01 | `import { x } from S` | edge | 8 | 0 | 4 | 6 | 4 |
| 02 | `import D from S` | edge | 6 | 0 | 3 | 4 | 4 |
| 03 | `import * as N from S` | edge | 6 | 0 | 3 | 4 | 4 |
| 04 | `import type { X } from S` | erased | 8 | 0 | 0 | 0 | 4 |
| 05 | `import type D from S` | erased | 6 | 0 | 0 | 0 | 2 |
| 06 | `import { type X } from S` | erased | 8 | 0 | 0 | 2 | 4 |
| 07 | `import { type X, type Y } from S` | erased | 8 | 0 | 0 | 2 | 4 |
| 08 | `import { type X, y } from S` (MIXED) | edge | 8 | 0 | 4 | 6 | 4 |
| 09 | `import D, { type X } from S` (DEFAULT + inline type) | edge | 8 | 0 | **8** | 6 | 4 |
| 10 | `import D, * as N from S` | edge | 6 | 0 | 3 | 4 | 4 |
| 11 | `import {} from S` (empty braces) | edge | 8 | 0 | 4 | 6 | 4 |
| 12 | `import S;` (bare side-effect) | edge | 2 | 0 | 2 | 2 | 2 |
| 13 | `export * from S` | edge | 6 | 0 | 3 | 6 | 4 |
| 14 | `export * as N from S` | edge | 6 | 0 | 3 | 6 | 4 |
| 15 | `export { x } from S` | edge | 8 | 0 | 4 | **8** | 4 |
| 16 | `export type { X } from S` | erased | 8 | 0 | 0 | 0 | 4 |
| 17 | `export { type X } from S` | erased | 8 | 0 | 0 | 0 | 4 |
| 18 | `require(S)` | edge | 2 | 0 | 2 | 2 | 2 |
| 19 | `await import(S)` | edge | 2 | 0 | 2 | 2 | 2 |
| 20 | `dynamic(() => import(S))` | edge | 2 | 0 | 2 | 2 | 2 |
| 21 | ``await import(`S`)`` - no-substitution template | edge | 1 | 0 | 1 | 1 | 1 |
| 22 | `await import(pathVar)` - computed | **residue** | 1 | 0 | 1 | 1 | 1 |
| 23 | `// import { x } from S;` - in a COMMENT | none | 2 | 0 | 0 | 0 | **2** |
| 24 | `const m = 'never import from "S" here';` - in a STRING | none | 2 | 0 | 0 | 0 | **2** |
| 25 | `.tsx`: `return <div>{require(S)}</div>;` | edge | 2 | 0 | 2 | 2 | 2 |

**`XP.fixtures = 132`, and that number is itself an assertion** (R-6c): deleting
a construct or an applicability rule changes it. The per-construct `n` column is
the frozen breakdown, so a wrong total names the construct that moved.

Constructs 12, 13, 15, 18, 19, 20 are the five that got `VALUE_IMPORT_PATTERN`
withdrawn under Ruling U3 plus the bare side-effect import the measurement added
(AC-3, AC-6). Construct 09 is AC-2(c)'s default-binding trap. Constructs 04-07,
16, 17 are AC-2(a)'s permitted set. Constructs 23 and 24 are the false-positive
direction and are the two the raw-source sweep fails - which is what
`classTrendsEntry.ts:28` and RES-A22-1 exist to work around today, and what the
parser makes unnecessary.

**AC-11's six regression canaries map onto this table**, so nothing currently
caught is dropped: P1 -> `01/inline/{double,single}`; P4 -> `08/inline/*`;
P5 -> `09/inline/*`; H1 -> `01/inline/double`; H6 -> `01/brace-wrap/double`;
H10 -> `15/inline/double`.

**AC-8's direction labels fall out of the table mechanically**, and this is the
construction that discharges the row's "state WHICH DIRECTION each frozen
fixture pins" without anyone hand-labelling 132 rows: a fixture is a **POSITIVE
CONTROL** (expected RED at landing step 1) iff `valueImportSpecifiers`
disagrees with its `want`, and a **REGRESSION CANARY** (expected GREEN
throughout) otherwise. Measured split: **51 positive controls, 81 regression
canaries.** Nothing in this table is adopted with its currently-observed value
as its expectation; `want` is derived from the language, not from any guard.

### O-B. The repo-grades root set - HAND-FROZEN (obligation O-2)

**Construction.** The 32 non-test, non-`.d.ts` `.ts`/`.tsx` basenames of
`src/app/components/repo-grades/`, transcribed as a literal array at 182ecc6 and
compared against `directoryRoots(dir)` with both sides sorted.
`ls src/app/components/repo-grades/ | grep -E '\.(ts|tsx)$' | grep -v '\.test\.'
| grep -v '\.d\.ts$' | wc -l` -> `32`.

```
LinkUsernamesPanel.tsx  LinkUsernamesRosterSection.tsx  RepoBindingControl.tsx
RepoGradeCellControl.tsx  RepoGradesControls.tsx  RepoGradesGrid.tsx
RepoGradesLogPanel.tsx  RepoGradesStatusBanners.tsx  index.tsx
linkRepoUsernames.ts  repoGradePostScore.ts  repoGradeScoreDisplay.ts
repoGradeStudentName.ts  repoGradeTreeLink.ts  repoGradesAssignmentMapping.ts
repoGradesAssignmentSources.ts  repoGradesBindingConfirm.ts  repoGradesBulkGrade.ts
repoGradesCellEdits.ts  repoGradesCoursePicker.ts  repoGradesFolderSelection.ts
repoGradesLog.ts  repoGradesPosting.ts  repoGradesRows.ts  repoGradesRubricCache.ts
repoGradesRubricSource.ts  repoGradesUiState.ts  rosterUsernameOverlay.ts
useRepoGradesBulkGrade.ts  useRepoGradesData.ts  useRepoGradesGradingActions.ts
useRepoGradesRubricSource.ts
```

**It must be a LITERAL, not a second `readdirSync`.** A `directoryRoots` vs
`readdirSync` comparison is circular and discharges nothing: both go to zero
together. The non-circular form this repo already ships is
`gradingResultsHelpersWiring.test.ts:136-167`, which compares a `readdirSync`
against the hand-written `CLIENT_FILES` literal at `:62-80`; and the
guards-the-guard precedent is `canvas-client-boundary.transitive.test.ts:170-177`
("finds the client entry points at all", commented "if the directive scan broke,
the walk below would start from nothing and pass vacuously forever").

**Maintenance contract, and it is deliberate:** adding a file to either guarded
directory reds this assertion until the literal is updated in the same commit.
That is the `headless.test.ts` count-canary discipline, not a defect.

### O-C. The grading-results root set - HAND-FROZEN (13)

Same construction: the 11 local non-test files, plus A22's computed non-local
consumer `../GradingResults.tsx`, plus `src/lib/grade/types.ts` as a NAMED root
(Ruling Z3). Frozen literal:

```
./FeedbackExpandModal.tsx  ./FilesCell.tsx  ./ResultsTableHeaderRow.tsx
./RowFeedbackBoxes.tsx  ./SubmittedFilesPanel.tsx  ./classTrendsEntry.ts
./gradingResultsHelpers.ts  ./icons.tsx  ./ungradedDisclosure.ts
./ungradedRowLabel.ts  ./useResultsSort.ts
../GradingResults.tsx
../../../lib/grade/types.ts
```

The 11 local names are exactly the `./`-prefixed entries of `CLIENT_FILES`
(`gradingResultsHelpersWiring.test.ts:62-80`), so A22's existing sweep at
`:136-167` is KEPT and this literal is its successor rather than a second copy.

**This root set has a trap the repo-grades one does not, and I measured it.**
With `directoryRoots` returning `[]`, the grading-results closure is **still 93
nodes**, because `GradingResults.tsx` transitively reaches all eleven local
files - so a vacuous root set is INVISIBLE here, where in repo-grades it drops
the closure from 149 nodes to 0. The frozen-list assertion is the only thing
that sees it in either directory, and in grading-results it is the only thing
that sees it at all.

### O-D. The three policy lists - FROZEN LITERALS, plus disjointness

`ALLOWED_BARE_SPECIFIERS` (14 entries), `FORBIDDEN_BARE_SPECIFIERS` (3) and
`BROWSER_SAFE_MODULES` (1) are asserted as frozen literal arrays, exactly as
written at `docs/a23-architecture.md:475-492`, plus
`ALLOWED_BARE_SPECIFIERS` and `FORBIDDEN_BARE_SPECIFIERS` asserted DISJOINT as
raw arrays. The one-entry `BROWSER_SAFE_MODULES` freeze is RES-A23-15's
instrument: widening it becomes a deliberate, reviewed edit rather than a silent
one. Compare raw literals, never coerced or validated values -
`coercion-changes-set-membership` is a recorded defect in this repo.

**Note for the implementer, from a concurrent edit:** `docs/a23-architecture.md`
is being revised at the time of writing, and one of the corrections is the HOME
of these policy lists. Take the lists' CONTENTS from the architecture as it
stands when you build, and the freeze-plus-disjointness requirement from here.

---

## 4. The requirements

Each names the **object**, the **instrument** producing each quantity, and the
**DIRECTION of failure**. `[LEAF]` = `src/lib/module-graph/runtime-import-graph.test.ts`.
`[G1]` = `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts`.
`[G2]` = `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`.

### R-1 - Both real closures carry ZERO violations `[G1] [G2] [LEAF]`

- **Object.** `walkRuntimeGraph(roots, OPTIONS).violations` over the repo-grades
  root set (O-B) and over the grading-results root set (O-C), against the
  unmodified tree.
- **Instrument.** `npx vitest run <G1> <G2>` after the fix. Measured now by the
  reference implementation: `RG.violations=0`, `GR.violations=0`.
- **Direction.** Non-empty. A violation on the real tree fails AC-12(a) and the
  fix must not ship. Equally: this assertion is the one a vacuous root set makes
  meaningless, which is why R-2 exists.

### R-2 - Each guard file asserts its DERIVED root set against a HAND-FROZEN literal `[G1] [G2]`

- **Object.** `directoryRoots(dir)` mapped to basenames and sorted, against
  oracle O-B (32 names) in `[G1]` and oracle O-C's local half (11 names) in
  `[G2]`; plus, in `[G2]`, the assertion that the full root array contains
  `../GradingResults.tsx` and `../../../lib/grade/types.ts` by name.
- **Instrument.** `toEqual` on two sorted string arrays, one of them a literal in
  the test file. NOT a second `readdirSync`.
- **Direction.** The derived set is SHORTER than the literal (the vacuous-pass
  direction, which R-1 cannot see) or LONGER (a file was added without updating
  the literal). Both red.
- **This is obligation O-2 and it is the row's single highest-value assertion.**
  Section 5's M1 measures the exact silent-green blocker B-2 named: with
  `directoryRoots` returning `[]`, `RG.violations=0` stays GREEN, both planted
  canaries stay GREEN, and 32 files go unguarded. Only R-2 goes red.

### R-3 - `unallowed` is EMPTY over each closure `[G1] [G2] [LEAF]`

- **Object.** `WalkResult.unallowed` over each of the two root sets.
- **Instrument.** `expect(result.unallowed).toEqual([])` - assert the ARRAY, not
  its length, so the failure message names the specifier and the trail.
  Measured now: `RG.unallowed=0`, `GR.unallowed=0`.
- **Direction.** Non-empty: a literal specifier reached either closure that is
  neither a walked module, nor a `.css` asset, nor on `ALLOWED_BARE_SPECIFIERS`.
  This is the fail-CLOSED default Ruling Z1 bought, and `@mui/material/Dialog`
  arriving transitively is the expected shape of a future red (RES-A23-14).
- **It also catches a mis-wired walk, measured.** With `srcRoot` set to the repo
  root instead of `src/`, `unallowed` goes 0 -> 23 and `nodes` goes 149 -> 45,
  because every `@/`-alias specifier resolves to `missing`. So R-3 doubles as the
  control proving the walk resolved anything at all.
- **What it does NOT catch: see section 5, M6.** Deleting the `unallowed` bucket
  entirely leaves this assertion GREEN, because there is nothing unallowed today.
  R-5b is the instrument that kills that one.

### R-4 - `unresolvable` is EMPTY over each closure `[G1] [G2] [LEAF]`

- **Object.** `WalkResult.unresolvable` over each of the two root sets.
- **Instrument.** `expect(result.unresolvable).toEqual([])`. Measured now:
  `RG.unresolvable=0`, `GR.unresolvable=0`, and whole-`src` `import sites=0`
  across 1560 files - so this is satisfiable and RES-A23-1's computed-specifier
  narrowing stops being a hand-wave.
- **Direction.** Non-empty: a computed (non-literal) import or require specifier
  entered a guarded closure and the guard REPORTS it rather than skipping it.
- **Honest limit, stated because O-1 asks for a direction and this one has a
  weak one: this assertion is GREEN in both directions against M5** (section 5).
  The instrument that discriminates the "silently drop non-literals" mutation is
  fixture `22-computed-specifier` in R-6, not this assertion. Both are required;
  neither alone is coverage.

### R-5 - Each guard file carries a PLANTED POSITIVE, and it asserts three things `[G1] [G2]`

Ruling Z2 (`docs/a23-architecture.md:1111-1166`). The canary calls
`walkRuntimeGraph` with **the same options object the real assertion uses** and
only the root set replaced - `src/lib/grade.ts`, the barrel both guards' headers
name (`repoGradesFeedbackAndFiles.wiring.test.ts:246-256`,
`gradingResultsHelpersWiring.test.ts:49-61`).

- **R-5a. `violations.length > 0`.** Measured 4 today. **Assert `> 0`, never
  `=== 4`** - the count is a property of an unrelated part of the tree, and the
  architecture already measured it moving 5 -> 4 when the prefix widened.
- **R-5b. `unallowed.length > 0`.** Measured 6 today (first is
  `node:crypto`). **This clause is NOT in the architecture's Z2 table and I am
  adding it**, because section 5's M6 measures that without it, deleting the
  entire `unallowed` bucket - the pre-Z1 hole, the founding defect of this row's
  replacement - survives every other assertion in this document.
- **R-5c. The trail names the hazard.** At least one violation's `resolved` path
  contains `lib/supabase/server`. Measured `true`. **Assert the trail, not just
  the count** - section 5's M11 measures a mutation that keeps `violations > 0`
  while losing the supabase trail entirely, and only this clause sees it.
- **Direction.** Any of the three false: the detector has stopped
  discriminating, and every green in R-1/R-3/R-4 is vacuous.
- **Optional second canary**, cheap and measured (`nodes=3`, 3ms):
  `src/lib/supabase/owner-context.ts`, the only file in `src/` that imports
  `node:async_hooks` (the X4 path). `violations > 0` and one violation's
  specifier is exactly `node:async_hooks`. Both measured `true`.

### R-6 - The cross-product `[LEAF]`

- **R-6a. Every fixture's AST verdict matches its `want`.** Object: for each of
  the 132 fixtures, `scanRuntimeEdges(source, fileName)`. Pass: for
  `want=edge`, `edges` contains the specifier and `unresolvable` is empty; for
  `want=erased` and `want=none`, neither; for `want=residue`, `unresolvable` is
  non-empty and `edges` does not contain the specifier. Instrument: `it.each`
  over the generated table. Direction: any disagreement. Measured: **0 of 132**.
- **R-6b. Each fixture carries its direction label** (positive control /
  regression canary), per O-A's mechanical rule. Direction: an unlabelled
  fixture, or one labelled from its currently-observed value rather than from
  `want` (AC-8's failure direction).
- **R-6c. `fixtures.length === 132`,** with the per-construct `n` column of O-A
  frozen alongside. Direction: any other number - a construct or an
  applicability rule was deleted, and the `n` column names which. This is the
  count assertion `traps-tests.md:31-35` requires, and its demonstrated failure
  mode is section 5's M1-style deletion applied to the table.
- **Do not import the fixture table from another `*.test.ts`.** It lives in
  `[LEAF]` and is consumed there. `traps-tests.md:46-50`.

### R-7 - A `.tsx` source is parsed as TSX `[LEAF]`

- **Object.** `scanRuntimeEdges(src, "fixture.tsx").edges` where `src` is
  `export function C() { return <div>{require("@/lib/grade")}</div>; }`.
- **Instrument.** Fixture `25-require-inside-jsx-tsx`, scanned with a `.tsx`
  file name.
- **Direction.** Empty. Measured: TSX -> `["@/lib/grade"]`, TS -> `[]`. The edge
  is LOST when the script kind is wrong, silently, in the permissive direction -
  and both guarded directories are full of `.tsx` files.
- **This requirement exists because a mutant survived.** See section 5, M7.

### R-8 - The forbidden-path prefix has a `/` BOUNDARY `[LEAF]`

- **Object.** `walkRuntimeGraph([src/lib/grade.ts], { ...OPTIONS,
  forbiddenPathPrefixes: ["lib/canvas"], browserSafeModules: [] })`, a
  configuration chosen because `src/lib/` really does contain both
  `canvas.ts`/`canvas-core.ts` AND a `canvas/` directory
  (`ls src/lib | grep ^canvas` -> 28 entries).
- **Instrument.** Three booleans from one walk. Measured today:
  `sibling lib/canvas.ts flagged = false`; `sibling lib/canvas-core.ts flagged =
  false`; `something inside lib/canvas/ flagged = true`.
- **Direction.** A SIBLING is flagged (the barrel-file defect
  `classTrendsDraft.not-postable.test.ts:46-53` records in its own header, naming
  `canvas-modules.ts` vs `canvas-modules/`), or nothing inside the directory is.
- **This is a REBUILT mutant, not a bad one banked as a kill.** See section 5, M9:
  under the shipping prefix `lib/supabase` this cannot be measured at all,
  because `src/lib/` has no `supabase*` sibling file - `ls src/lib | grep
  ^supabase` returns the directory only.

### R-9 - A `"use server"` module is a WALL `[LEAF]`

- **Object.** `walkRuntimeGraph` over each real root set with
  `treatUseServerAsWall: true`, and the directive read from the PARSED prologue
  rather than a text slice.
- **Instrument.** R-1's own numbers are the enforcer. Measured with the wall
  removed: repo-grades `violations=0 -> 105`, `nodes=149 -> 454`;
  grading-results `violations=0 -> 105`, `nodes=93 -> 418`.
- **Direction.** The closures explode. This is the 339-false-positive incident
  (`canvas-client-boundary.transitive.test.ts:34-37`) and the architecture's own
  39-violation reproduction (`docs/a23-architecture.md:792-800`), measured a
  third time here.
- **Note the divergence from the other in-repo walker:**
  `classTrendsDraft.not-postable.test.ts:117-118` explicitly has NO wall. Do not
  copy that walker's control flow; copy `canvas-client-boundary`'s.

### R-10 - The three policy lists are frozen, and two of them are disjoint `[LEAF]`

- **Object.** `ALLOWED_BARE_SPECIFIERS`, `FORBIDDEN_BARE_SPECIFIERS`,
  `BROWSER_SAFE_MODULES` as raw exported literal arrays (oracle O-D).
- **Instrument.** `toEqual` against literals in the test, plus an intersection
  over the two specifier lists asserted empty.
- **Direction.** A list changed without the test changing; or a specifier
  appears on both lists, letting the diagnostic contradict the allow list.
- **No executed sabotage - see section 5.** This is a structural freeze, and its
  honest description is that it makes a silent widening impossible, not that it
  detects a bad entry.

### R-11 - The leaf is not reachable from a client bundle `[LEAF]`

- **Object.** Every non-test file under `src/` whose PARSED edges name the
  leaf's specifier.
- **Instrument.** A whole-`src` parsed sweep in the leaf's own test, asserting
  every importer's path ends in `.test.ts`. Measured today: **0 files of 1560**
  name it, which is the correct pre-landing value and becomes 3 after the wave.
- **Direction.** A non-test importer appears. The leaf pulls in `typescript` and
  `node:fs`; a value import from a client file is a real build hazard.
- **Cost, measured, because this sweep is the expensive part of the row:** a
  whole-`src` parse of 1560 non-test files takes **1415ms and 1385ms** on two
  consecutive runs here, under node. The architecture measured 1800/1847ms and
  its checker 1929ms for the same sweep; I adopt none of the four silently - the
  conclusion is identical under all of them, a 15-21x margin against the
  `{ timeout: 30000 }` both precedent walkers carry. **Carry that timeout on this
  sweep and on both directory walks.**

### R-12 (GATE, not a test) - Both guard files in ONE commit

- **Object.** The wave's file set. **Instrument.** `git status --short` at the
  wave gate against the assignment, plus `git diff --name-only`.
- **Direction.** Exactly one of `[G1]`/`[G2]` touched. AC-10; also forced by the
  one-wave plan at `docs/a23-architecture.md:1050-1074`.

### R-13 (GATE, not a test) - The pre-existing gates hold

- `npx tsc --noEmit` (no output, exit 0) - **one caller, the wave gate.**
  **Grep the diff for the dotAll `/s` flag before running it**: it passes vitest
  and fails tsc with TS1501, and it has been hit twice in one day here by two
  implementers. Nothing in these notes needs it.
- `npm run lint` - `4 problems (0 errors, 4 warnings)` is the baseline.
- `npx vitest run` - the full suite. The pre-fix figures at `c458f7a` quoted in
  `docs/a23-criteria.md:628-630` are `Test Files 1092` / `Tests 21761`;
  **I did not re-measure those and they are quoted, not measured here.**
  Re-measure at the gate.
- Line budget: `@(Get-Content <file>).Count` at the gate, never
  `Measure-Object -Line`. Baselines measured both ways and agreeing:
  `[G1]` 305, `[G2]` 241 (`wc -l` and `@(Get-Content).Count` both).

---

## 5. The sabotage pass - every mutant, including the two I rebuilt and the one that survives

**Method.** Each mutation was applied to a COPY of the reference implementation
(`cp`-backup, never `git checkout --`, which reverts to the index and destroys
uncommitted work), the compact assertion probe re-run, and the file restored.
Restore verified by re-running the probe and byte-comparing its output to the
baseline: `restore OK: probe output identical to baseline`.

Command: `node --experimental-strip-types <sandbox>/mutants.ts` and
`<sandbox>/rebuilds2.ts`.

| Mutant | Mutation | Result | Killed by | Discriminates? |
|---|---|---|---|---|
| **M1** | `directoryRoots` returns `[]` | `R2.rg_roots_match_frozen` true -> **false**; `RG.violations` 0 (green both ways); `RG.nodes` 149 -> 0; both canaries green | **R-2 only** | YES - and it is the ONLY mutant R-2 catches and nothing else does |
| **M2** | `srcRoot` = repo root, not `src/` | `unallowed` 0 -> **23**; `nodes` 149 -> 45 | **R-3** | YES |
| **M3** | `clauseIsErased` ignores the DEFAULT binding | 8 fixtures red, all `09-default-plus-inline-type` | **R-6a** | YES - this is AC-2(c) |
| **M4** | `clauseIsErased` uses `.some` not `.every` | 8 fixtures red, all `08-mixed-inline-type-and-value`; `RG.nodes` 149 -> 127; `RG.violations` stays 0 | **R-6a only** | YES - note the real-tree assertion does NOT see it |
| **M5** | non-literal specifiers silently dropped (the pre-Z1 `continue`) | 1 fixture red (`22-computed-specifier`); **both closures unchanged** | **R-6a only** | YES via the fixture; **R-4 is green in BOTH directions and discriminates NOTHING here** |
| **M6** | the whole `unallowed` bucket removed | closures unchanged (`unallowed` 0 -> 0); `CANARY.barrel_unallowed` **6 -> 0** | **R-5b only** | YES via R-5b; **R-3 is green in BOTH directions.** Without R-5b this mutant SURVIVES the entire suite |
| **M7** | `ScriptKind` always TS, never TSX | **SURVIVED everything**: 0 fixture disagreements, identical node counts, identical canaries | nothing, as first written | **NO - bad mutant. REBUILT, see below** |
| **M8** | the `"use server"` wall removed | `RG.violations` 0 -> **105**, `nodes` 149 -> 454; `GR.violations` 0 -> **105** | **R-1, R-9** | YES |
| **M9** | `isForbiddenPath` drops the `/` boundary | **SURVIVED everything** under the shipping `lib/supabase` prefix | nothing, as first written | **NO - bad mutant. REBUILT, see below** |
| **M10** | `browserSafeModules` ignored | `RG.violations` 0 -> **1** (`index.tsx -> useRepoGradesData.ts -> SupabaseProvider.tsx` value-imports `@/lib/supabase/client`) | **R-1** | YES |
| **M11** | the forbidden-path check removed entirely | `barrel violations` 4 -> **2** (still `> 0`!); `barrel_trail_names_supabase_server` true -> **false** | **R-5c only** | YES via the trail clause; **R-5a alone is green in both directions** |
| **M12** | the walk never recurses (direct-only, the instance 4-6 weakness) | `barrel violations` 4 -> **0**; `RG.nodes` 149 -> 32 | **R-5a** | YES |

### The two rebuilt mutants, reported explicitly

`loop-test-author.md:100-107`: a surviving mutant may be a bad instrument rather
than a kill I am owed. Both of these were rebuilt, not banked, and not answered
by adding an assertion until the original died.

**M7 was a bad mutant because it mutated a property the WALK cannot see.** A
whole-tree walk parses `.tsx` files whose imports are all at the top of the file,
where TS-kind and TSX-kind parsing agree - so the mutation produced no observable
difference over 149 + 93 nodes. Rebuilt as a UNIT fixture on `scanRuntimeEdges`
with a JSX expression container around the import site. Measured across four
candidate shapes; exactly one discriminates:

```
                  TSX                TS                 differ
generic-arrow     [grade,headers]    [grade,headers]    false
jsx-with-call     [@/lib/grade]      []                 TRUE
jsx-then-import   [@/lib/grade]      [@/lib/grade]      false
jsx-lt-gt-text    [@/lib/grade]      [@/lib/grade]      false
```

The rebuilt mutant then **kills**: `TSX.edges_when_tsx` goes
`["@/lib/grade"] -> []`. It is now fixture `25` and requirement R-7.

**M9 was a bad mutant because its premise is absent from this tree.**
`ls src/lib | grep ^supabase` returns `supabase` - the directory, with no
sibling file - so under `forbiddenPathPrefixes: ["lib/supabase"]` a boundary-less
`startsWith` cannot differ from a boundary-ed one on any real path. Rebuilt as a
CONFIGURATION oracle on `lib/canvas`, which the repo's own walker header already
names as the instance behind the rule
(`classTrendsDraft.not-postable.test.ts:46-53`, "Same mechanism `lib/canvas` (no
slash) exists to avoid for `canvas-modules.ts` vs `canvas-modules/`"). The
rebuilt mutant **kills two-sidedly**: the sibling `src/lib/canvas.ts` goes
`false -> true` AND, because the walk then stops at the sibling,
`inside lib/canvas/` goes `true -> false`. It is requirement R-8.

### Requirements with NO executed sabotage, said plainly

- **R-10** (frozen policy lists, disjointness). A mutation of a frozen literal is
  detected by definition; there is no interesting mutant, and claiming a kill
  would be inflating the count. Its honest value is that it makes a silent
  widening unrepresentable, not that it detects anything.
- **R-11** (leaf not client-reachable). Measured at 0 importers today, so the
  assertion has no positive control until the wave lands. **Residual RES-T-3.**
- **R-12, R-13** are gate rows, not tests.

### I attacked my own instrument set, and here is what got through

The passing-but-wrong implementation I could not kill with the architecture's
specified assertions alone is **M6 plus M5 together**: an implementation that
drops every non-literal specifier and deletes the `unallowed` bucket is GREEN on
both real closures, GREEN on `unresolvable`, GREEN on `unallowed`, GREEN on
violations, and GREEN on the Z2 canary **as the architecture specifies it**
(`violations.length > 0` plus the trail). That is the Z1 hole reinstated, inside
the replacement for a guard withdrawn for exactly that, with every gate green.
It is caught only by the two additions this section produced: **R-5b** (the
canary asserts `unallowed.length > 0`) and **fixture 22** (R-6a). Neither was in
my inputs. If a checker removes one, say which mutant comes back.

---

## 6. Landing order - what makes AC-7 dischargeable (obligation O-4)

**The measured fact AC-7 rests on, re-measured here rather than quoted:**

```
npx vitest run src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts \
               src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
Test Files  2 passed (2)
Tests  52 passed (52)
Duration 1.31s
```

Both guard files read FIXED sources - guard 1 from four module-level constants,
guard 2 from `readFileSync` of the real `types.ts` - and **neither takes a
fixture**, so neither can record a pre-fix RED. `docs/a23-criteria.md:518-523`
requires the red to be observed "inside the suite that will carry the fixtures
forward"; under this shape that suite is `[LEAF]`, not the two guard files, and
`docs/a23-architecture.md:1103-1109` relocates AC-7 there as an
`iteration-caps.md` disposal (a). **This section is the receiver's obligation
discharged.**

**The order. Step 1's red is the whole point of the ordering; do not merge it
into step 2.**

0. Commit and re-run the architecture's probes (RES-A23-13) before touching any
   guard file. A number that does not reproduce means the design rests on a
   measurement that is not real.
1. **Land `[LEAF]`'s fixture table and its assertions with `valueImportSpecifiers`
   - duplicated verbatim, never imported from another `*.test.ts` - as the
   extractor.** Run `npx vitest run src/lib/module-graph/runtime-import-graph.test.ts`
   and **RECORD THE RED**. Expected, measured against this table:
   **51 of 132 fixtures fail**, spread over exactly these 17 constructs:
   `01, 02, 03, 08, 09, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 25`
   (per-construct counts in O-A's `vis` column). The 8 constructs that must be
   GREEN at step 1 are `04, 05, 06, 07, 16, 17, 23, 24` - those are the
   regression canaries, and any of them red means the table is wrong, not the
   extractor.
   **The recorded evidence is the failing-test LIST, not the number.** If your
   table differs from O-A, re-derive the count from your table; do not carry 51
   forward as a frozen expectation.
2. Land `runtime-import-graph.ts`; re-point `[LEAF]` at `scanRuntimeEdges`.
   Re-run; record GREEN (**expected 0 disagreements**). R-7, R-8, R-9, R-10,
   R-11 land here too.
3. Re-point both guard files at the leaf, in ONE commit. Each lands its own
   R-2 frozen root set, its own R-1/R-3/R-4 assertions and its own R-5 canary
   with all three clauses. Record `npx vitest run <G1> <G2>` green against the
   unmodified tree (AC-12(a)).
4. Wave gate: R-12 and R-13.

**Direction of failure for AC-7 itself:** the fix lands and every fixture is
green at the moment it lands. That is the state Ruling U3 shipped in, and
`traps-tests.md:8` rules a test is not evidence until you have watched it fail.

---

## 7. Executable here versus argued

**EXECUTED in this pass** (all by `node --experimental-strip-types` against a
sandbox reference implementation, commands in sections 2-5): the 132-fixture
cross-product against four extractors; both real closures' violations, residue
and unallowed; both root-set derivations against their frozen literals; both
planted-positive canaries with all three clauses; twelve mutants plus two
rebuilds with restore verification; the whole-`src` residue count and parse
ceiling, twice; the `.tsx` script-kind discrimination; the prefix-boundary pair;
the wrong-`srcRoot` control; the Z3 closure edge count; the pre-fix guard-file
colour under vitest; the seam's strict typecheck.

**ARGUED, NOT VERIFIED - do not read any of these as measured:**

- **That the shipped tests will behave as the reference did under VITEST.** The
  reference ran under node. vitest transforms modules through vite, and the leaf
  loads an 8 MB CJS `typescript` bundle via `createRequire`. The mechanism is
  argued sound (`createRequire` bypasses vite's pipeline) and it is RES-A23-12.
- **The walk's cost under vitest.** My 1385-1415ms whole-`src` figure is node
  wall time. vitest adds transform and setup; the architecture's 3.5%-of-suite
  estimate is not re-derived here.
- **That `next build` still compiles after the change.** RES-A23-5; no `.env` in
  this checkout, so the build gate is the `Compiled successfully` line and never
  the exit code (`this-repo.md:52-54`). Nothing here changes runtime code, but
  that is a reading claim.
- **That R-11's sweep will find exactly three importers after the wave.** Zero
  today is measured; three is predicted.
- **Anything about markup, focus or keyboard behaviour.** Nothing in this row
  touches a surface, and no test here could see it if it did.

---

## 8. Residual register

Every entry carries an owner, an instrument and a step. An entry missing one of
the three is a deletion and I would call it that; none is. New ids are prefixed
`RES-T-` to avoid colliding with the `RES-A23-n` sequence the criteria and the
architecture share, whose retired ids (3, 6) stay retired.

| Id | Residual | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| RES-T-1 | **The architecture's 0/19/22/20 scoreboard is not reproducible and my 0/51/72/78 replaces it for a different fixture set (section 1.2).** Anyone citing either must name the table. | Orchestrator, at the backlog reconciliation | `node docs/a23/a23-shape-probe.mjs` (once RES-A23-13 commits it) against `[LEAF]`'s landed table; compare construct lists, not totals | A23's push |
| RES-T-2 | **My brief's `residue=1` claim is false against the tree (section 1.1).** If it came from a document rather than the brief, that document needs the same correction. | Orchestrator | `node --experimental-strip-types` over the grading-results closure, or the committed `a23-reach.mjs`; both give 0 | A23's backlog reconciliation |
| RES-T-3 | **R-11 has no positive control until the wave lands** - zero files name the leaf today, so the assertion cannot be watched failing first. | Implementer, wave step 2 | after step 3, temporarily point a non-test file at the leaf in memory and confirm the sweep reds; or accept the post-wave count of 3 as the control | Wave step 3 |
| RES-T-4 | **R-10 has no executed sabotage** (section 5). A frozen-literal freeze prevents a silent widening; it detects nothing about whether an entry is CORRECT. `BROWSER_SAFE_MODULES` having one entry and no minimality test is RES-A23-15's substance. | Repo owner, at review | read the diff of any commit that changes one of the three lists | Every future wave that touches either directory |
| RES-T-5 | **R-2's frozen root lists go stale by design.** Adding a file to either guarded directory reds the guard until the literal is updated in the same commit. That is the intended contract and it is also friction. | Repo owner | the failing assertion names the added file | The next row that adds a file to either directory |
| RES-A23-12 | Unchanged from the architecture: whether `typescript` loads under vitest at all is UNMEASURED; the `createRequire` form is measured working under node, here and there. | Implementer | `npx vitest run src/lib/module-graph/runtime-import-graph.test.ts` with each form | Wave step 2 |
| RES-A23-13 | Unchanged: the architecture's ten probes are not committed, so its quantities are not re-runnable from the repo. **My own probes are not committed either**, for the same reason - this pass owns one path - and this document states every command and every input needed to rebuild them. | Implementer (wave step 0) | commit the probes to `docs/a23/`, re-run, diff against the architecture's sections and this document's section 2 | Wave step 0 |

**None of these exist until they are in `docs/BACKLOG.md`** (`DEV_LOOP.md:79-84`).
`docs/backlog.yml` is the orchestrator's file and this seat may not write it.

---

## 9. What I could not determine

- **Whether the architecture's 23-construct list, had it existed, would agree
  with mine.** I built the product from construction rather than guessing at a
  list I cannot read. Constructs 11, 14, 21, 24 and 25 may be additions; 22, 23
  and the four separators are almost certainly shared. Unknowable without the
  probe (RES-A23-13).
- **Whether any of this behaves identically under vitest.** Section 7.
- **Whether `unallowed` will stay empty as the two closures drift.** It is empty
  today across 149 and 93 nodes; RES-A23-14 already owns the friction.
- **Whether the guards ever let a real defect through historically.** I measured
  the working tree only, like both documents before me. I did not walk the
  history and I am not claiming the guards have never been decorative.
- **Whether the surviving-mutant accounting is complete.** Twelve mutants plus
  two rebuilds is not an exhaustive mutation of a 160-line module. The two that
  matter - M5 and M6, the buckets - are covered; I did not mutate the memo
  ordering, the cycle behaviour, or `classifySpecifier`'s four-candidate
  resolution loop, and a checker should ask for those.
