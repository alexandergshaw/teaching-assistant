# Wave plan: the Tools > Grading sub-tab (row GRAD-SUBTAB)

Round 1 of the WAVE-PLAN activity. This is a NEW activity with its own two rounds.
The architecture activity (`docs/tools-grading-subtab-architecture.md`, checked in
`docs/tools-grading-subtab-architecture-check.md`, verdict BUILDABLE, 0 blockers)
is finished and is NOT reopened here. This plan is BUILT ON that architecture: its
derived edit surface (E1-E7 plus the eleven missed edit points M1-M11), its
instruments I1-I5, and its per-test canary-or-guard calls on T1-T35 are my inputs,
not things I re-derive. Where I found the architecture wrong I would say so and
STOP; I found nothing wrong in it, and the two disagreements it records with the
AC-check (B6.2, and R1's 617-as-absolute) are both correct.

**Write set: this file only.** No file under `src/` or `supabase/` was opened for
writing. Nothing was committed or pushed. `git status --short` at the start of
this pass printed nothing (clean tree, HEAD `d223143`). `d223143` is two commits
past the architecture check's `baf6444`: `67da31b` (docs/loop) landed before the
check, and `d223143` ("docs(grad-subtab): architecture check is clean") IS that
check landing. So the architecture is checked-clean as of the current tree.

**Reasoning-from-reading vs measurement.** Claims tagged [MEASURED] name the
command that produced them, below. Claims tagged [READING] are traced from source
and cannot be verified here because no component is rendered by any test in this
repo. Claims tagged [ADOPTED] are carried from the checked architecture without
re-derivation and cite its section.

---

## 0. Instruments, and the command that produced every quantity

| Quantity | Instrument, with the command |
|---|---|
| Line count, counter A | `wc -l <path>` (Bash tool) |
| Line count, counter B | `@(Get-Content <path>).Count` (PowerShell) |
| Write-set disjointness | `cat <setA> <setB> \| sort \| uniq -d`, output pasted in section 4 |
| Path existence | `for f in ...; do [ -f "$f" ] && echo OK \|\| echo MISSING; done` |
| Backlog / decision citations | `grep -an`, `sed -n`, `awk -F'|'` on the cited docs |
| `"use server"` check | `head -1 <path> \| grep -q "use server"` over the 7 production files |
| Docs gate | `npm run docs:gate` |

Three disciplines, restated because this pass would otherwise repeat measured
failures of this repo:

- **Every quantity below was re-measured on the current tree (`d223143`), not
  recalled** from the architecture or the AC. The architecture's 1.1 size table
  reproduced exactly on both counters (section 1.1), so I cite it as confirmed
  rather than re-paste its censuses.
- **`grep -P` and `grep -c` were used for nothing.** `grep -P` exits 0 without
  checking here; `grep -c` counts prose lines. Symbol facts come from the
  architecture's `src/tools/symbol-count/count.ts` census, already checked clean.
- **Every gate path was confirmed to exist before being written into a gate
  command** (section 3, "brief contamination" corollary from MEMORY).

---

## 1. What this plan cuts, and the honesty boundary of the cut

The architecture cut GRAD-SUBTAB into three waves (its section 9). I ADOPT that
ordering and its grounds. But the three waves are at three different levels of
readiness, and a wave plan that presented all three as dispatchable would be
manufacturing a green gate for two of them:

- **WAVE 1 is fully derived and DISPATCHABLE NOW.** Its 13-path write set is
  derived by the architecture with two named instruments (a 2772-file symbol
  census and a 1166-file source-text scan), and the derivation returned complete
  for production per the check's RULING A ("No production edit point exists in the
  tree that is absent from the surface"). I re-measured every size and every
  hazardous-test line it turns on (sections 1.1, 5). Wave 1 is the body of this
  plan.
- **WAVE 2 is NOT dispatchable as a wave. Its write set was NOT derived.** The
  architecture states this in its own words: "Write set (estimated, not derived -
  wave 2's own derivation is owed when its brief is written)" (its 9.2), and
  section 10.3 files the re-parenting feasibility as undetermined. I carry the six
  frozen canaries it DID pin (section 6 here) as known constraints, but wave 2
  needs its own architect/derivation pass before it becomes a gateable wave. I say
  so rather than pasting an estimated file list into a gate.
- **WAVE 3 is NOT dispatchable, and may not be worth doing.** The architecture
  says its feasibility "is not established" (10.4): row 5 (`DraftedGradesTab`)
  sits in the `workflows` family, so absorbing it crosses the `toolsSection`
  discriminant of `ToolsRailItem` - a different KIND of change from waves 1-2.
  It needs a feasibility pass first.

**This is the cut, stated once:** wave 1 ships the container plus the two
already-in-Tools grading surfaces; wave 2 (after its own derivation) re-parents
Recording's two grading items; wave 3 (after a feasibility pass) may absorb
Drafted Grades. Waves 2 and 3 are SEQUENCED after wave 1 by dependency (section
4.2), so their non-dispatchability today costs the queue nothing - wave 1 must
land first regardless.

### 1.1 Sizes, both counters, re-measured on `d223143`

`wc -l` [MEASURED, Bash] and `@(Get-Content).Count` [MEASURED, PowerShell] agree
on every file. This matters because the 1000-line ceiling
(`src/file-size-ceiling.structure.test.ts:41`, `const LIMIT = 1000` [ADOPTED,
this-repo.md and architecture 1.1]) is the only mechanical size gate, and two
counters disagree by up to 138 elsewhere in this tree.

| Path | `wc -l` | `@(Get-Content).Count` | Agree | Role |
|---|---|---|---|---|
| `src/app/components/manual/manual-rail.ts` | 241 | 241 | yes | wave-1 write |
| `src/app/components/manual/ManualRail.tsx` | 65 | 65 | yes | wave-1 write |
| `src/app/components/content-tab/constants.ts` | 28 | 28 | yes | wave-1 write |
| `src/app/components/ContentTab.tsx` | 895 | 895 | yes | wave-1 write |
| `src/app/url-state.ts` | 417 | 417 | yes | wave-1 write |
| `src/app/components/home/useAppNavigation.ts` | 638 | 638 | yes | wave-1 write |
| `src/app/page.tsx` | 703 | 703 | yes | wave-1 write |
| `src/app/components/GradingTab.tsx` | 617 | 617 | yes | **NOT written** (see 2.3) |
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | 977 | 977 | yes | wave-2, 23 lines under 1000 |
| `src/app/components/RecordingTab.tsx` | 917 | 917 | yes | wave-2, excluded from ceiling |

The largest file wave 1 WRITES is `page.tsx` at 703 - 297 lines under the ceiling.
The architecture estimates wave 1 adds a net handful to `page.tsx` and ~25-40 to
`useAppNavigation.ts` (its RES-ARCH-7); neither approaches 1000. **No wave-1 file
is a ceiling risk.** The two files near an edge (`GradingRecordingPanel.tsx` at
977, 23 under; and whatever wave 2 grows) are wave 2's concern.

---

## 2. The wave table

### 2.1 Wave 1 - the container and the two Tools-rail grading surfaces

**Write set: 13 paths** [ADOPTED, architecture 3.5; every path re-confirmed to
exist on `d223143`]. Seven production + six test files.

Production (7):
```
src/app/components/manual/manual-rail.ts
src/app/components/manual/ManualRail.tsx
src/app/components/content-tab/constants.ts
src/app/components/ContentTab.tsx
src/app/url-state.ts
src/app/components/home/useAppNavigation.ts
src/app/page.tsx
```
Tests (6):
```
src/app/components/manual/manual-rail.test.ts
src/app/components/contentTab.wiring.test.ts
src/app/components/tabs/tab-rails.test.ts
src/app/components/tabs/topLevelTabs.wiring.test.ts
src/app/components/home/useAppNavigation.test.ts
src/app/url-state.test.ts
```

**How the write set was derived** [ADOPTED, architecture 3.1-3.5]: the union of
(a) every file with `codeOccurrences > 0` for each symbol the change touches, from
the 2772-file symbol census; (b) every `*.test.ts` that reads one of the seven
production files AS SOURCE TEXT, from the 1166-file scanner scan run with BOTH a
full-path needle and a basename needle (the full-path needle under-reported, so
the basename run is the floor and both were unioned and hand-vetted). The
architecture check independently re-ran the production-reference search and
returned EMPTY: "No production edit point exists in the tree that is absent from
the surface."

**What each wave-1 addition exports, and where it is called** - the caller rule,
discharged in full. Every NEW export has its caller inside the 13-path write set;
there is no type-only-module exception in play here.

| New/changed export | Declared in | Called by (in write set) | tsc-forced caller? |
|---|---|---|---|
| `GradingView`, `GRADING_VIEWS`, `isGradingView` | `manual-rail.ts` | `url-state.ts` (normalizeGradingView), `useAppNavigation.ts`, `manual-rail.test.ts` | type/value, yes |
| `getInnerNavAriaLabel` | `manual-rail.ts` | `ManualRail.tsx:48` (replaces the hardcoded ternary), `manual-rail.test.ts` (I1) | no - the ternary compiles; named in E2(iii) |
| `INNER_NAV` (module-internal) | `manual-rail.ts` | `getInnerDestinations` + `getInnerNavAriaLabel`, same file | n/a |
| `RETIRED_GRADING_POINTERS`, `GradingPointerTarget` | `manual-rail.ts` | `resolveStateFromDestinationId` (same file), `useAppNavigation.ts` initializer, `manual-rail.test.ts`/`url-state.test.ts` (T3/T8/T30) | no - a lookup table; consumers are E1(x)/E6(v) |
| `getActiveDestinationId` (4th param, required) | `manual-rail.ts` | `ManualRail.tsx:38`, `manual-rail.test.ts` (15 sites) | **yes** |
| `resolveStateFromDestinationId` (5th param + 4th field, required) | `manual-rail.ts` | `page.tsx:506`, `manual-rail.test.ts` (16 sites) | **yes** |
| `ManualRail` props gain required `gradingView` | `ManualRail.tsx` | `page.tsx:501` | **yes** |
| `normalizeGradingView`, `GRADING_VIEW_PARAM`, `GRADING_VIEW_VALUES`, `DEFAULT_GRADING_VIEW` | `url-state.ts` | `parseUrlState`/`buildUrlSearch` (same file), `useAppNavigation.ts`, `url-state.test.ts` | value, yes at the fixture sites (T18/T27) |
| `GRADING_VIEW_KEY = "ta-grading-view"` | `useAppNavigation.ts` | same file (state init + persist effect), `useAppNavigation.test.ts` (T26) | no - a string constant |
| render branch `manualView === "grading"` rendering `<GradingTab>`/`<RepoGradesTab>` | `page.tsx` | it IS the surface; `GradingTab`/`RepoGradesTab` already imported | n/a - renders existing components |

**Independently gateable: YES.** Wave 1 compiles, its whole suite is green, and
its capability is reachable end to end at commit time. The architecture traces all
eleven hops from the chip to the code (its section 8); hop 4's enforcer
(`topLevelTabs.wiring.test.ts:309-320`, the derived `MANUAL_VIEW_ORDER` loop)
already exists, so a chip registered without a render branch turns RED with no new
test. The reading-only halves (what APPEARS, what a screen reader announces, what
a real Back press restores) are NOT gateable here and go to the owner walk
(section 7) - that is a ceiling of the environment, not a gap in the wave.

**Why 13 files in ONE wave** [ADOPTED, architecture 9.1]: six of the seven
production files are tsc-forced by the other edits, and two of the six test files
are tsc-forced by the required `UrlNavState` field (T18, T27). **No proper subset
of this write set compiles.** Splitting it would push a non-compiling
intermediate, which is a broken commit, not a wave. This is why wave 1 is not
itself cut into sub-waves.

### 2.2 Wave 2 - Recording's two grading items (NOT YET DISPATCHABLE)

**Rows 3 and 4:** `GradingRecordingPanel` (`RecordingTab.tsx:857`,
`recView === "grading"`) and `SnapshotGradingPanel` (`:867`, `recView === "snapgrade"`).

**Write set: NOT DERIVED. Do not dispatch from this plan.** [ADOPTED, architecture
9.2/10.3]. The architecture's estimate is `RecordingTab.tsx`,
`recording-split.structure.test.ts`, `manual-rail.ts`, `page.tsx`,
`manual-rail.test.ts` "plus whatever the six canaries force" - explicitly labelled
estimated, not derived. Wave 2 needs its own architect derivation of the write set
(symbol census + source-text scan for the two panels and `recView`) AND a
feasibility finding on whether the two panels can be re-parented out of
`RecordingTab.tsx`'s capture lifecycle (`active={active && recView === "grading"}`
at `:857`). Both are owed before a wave-2 gate can be written. Filed as RES-WAVE-1.

**What is KNOWN about wave 2:** it is a FROZEN-CANARY problem, not a size problem
(section 6). It exports no new nav mechanism the caller rule would gate - it adds
two destinations to the container wave 1 creates and reuses wave 1's `INNER_NAV`
entry and alias table. `RecordingTab.tsx` is 917 [MEASURED] and is EXCLUDED from
the ceiling (`isCoveredByRecordingSplitCheck` names it,
`src/file-size-ceiling.structure.test.ts:51-54` [ADOPTED]); removing two strip
entries SHRINKS it. `GradingRecordingPanel.tsx` at 977 [MEASURED] has 23 lines
against the ceiling and IS checked - wave 2 must not grow it.

### 2.3 Wave 3 - Drafted Grades (NOT YET DISPATCHABLE, may not be worth doing)

**Row 5:** `DraftedGradesTab` (`home/WorkflowsPanel.tsx:77`, `draftsView === "grades"`).

**Write set: NOT DERIVED, and feasibility not established.** [ADOPTED,
architecture 9.3/10.4]. It crosses the `toolsSection` discriminant of
`ToolsRailItem` (`tab-rails.ts:126-128`) - a type change of a different kind from
waves 1-2, which move views inside the `manual` family. It may require
`DraftedGradesTab` to stop being a `draftsView` sub-view, which is a change to
`WorkflowsPanel`'s own nav. A feasibility pass owes the answer before wave 3 is a
wave. Filed as RES-WAVE-2.

### 2.4 GradingTab.tsx is in NO wave's write set - the pinned-path constraint, honoured

The brief required a cut where no wave writes `GradingTab.tsx`, because it is
pinned by path by `autoGradeTransition.wiring.test.ts:16` and by a frozen two-path
`editsSurface="canvas"` set at `:412-417` [ADOPTED, architecture 3.3/T31]. **The
cut honours it, and no wave needs to open the file:**

- Wave 1 moves the `<GradingTab ...>` mount JSX from `ContentTab`'s `grading` prop
  position into the new `page.tsx` `manualView === "grading"` branch. All eight
  props `page.tsx:543-552` passes it are `page.tsx` locals [ADOPTED, architecture
  3.3, check RULING C confirmed], so the move is a relocation WITHIN `page.tsx`;
  `GradingTab.tsx` is never opened. Its 617 lines [MEASURED] are preserved and the
  frozen `editsSurface="canvas"` set is untouched.
- Wave 2 re-parents `GradingRecordingPanel`/`SnapshotGradingPanel`, not
  `GradingTab`, so it does not write `GradingTab.tsx` either.
- Wave 3 touches `DraftedGradesTab`.

**No wave writes `GradingTab.tsx`.** The wave-1 gate enforces this by
`git status --short` (RED if the path appears) rather than by a size bound - the
architecture's R1 correction, adopted (section 3, pass-condition table).

---

## 3. Gates

### 3.1 Wave 1 gate

Run from PowerShell, repo root. Every path below was confirmed present on
`d223143` [MEASURED, path-existence loop over all 12 test paths returned OK for
all 12] - the "brief contamination" corollary from MEMORY: never write a gate
command citing a path that does not exist.

```
git status --short
npx tsc --noEmit --incremental false
npm run lint
npm run test:paths -- src/app/components/manual/manual-rail.test.ts src/app/components/contentTab.wiring.test.ts src/app/components/tabs/tab-rails.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts src/app/components/home/useAppNavigation.test.ts src/app/url-state.test.ts src/app/components/autoGradeTransition.wiring.test.ts src/app/components/componentStorageKeys.structure.test.ts src/file-size-ceiling.structure.test.ts src/lib/client-state-sweep.test.ts src/lib/lms-generation/selection-archive.test.ts src/lib/module-graph/runtime-import-graph.test.ts
npm test
@(Get-Content <each of the 7 production paths>).Count   # and wc -l on each
```

Notes on each command:

- **`git status --short`** is the write-set gate. The multi-path test run uses
  `npm run test:paths -- <paths>`, NEVER a raw multi-path `vitest`/`npm test`,
  which silently drops any argument it does not match (this-repo.md; enforced by
  `src/tools/vitest-paths/gate-commands.structure.test.ts`). The six read-only
  test files (`autoGradeTransition`, `componentStorageKeys`, `file-size-ceiling`,
  `client-state-sweep`, `selection-archive`, `module-graph`) are in the
  `test:paths` list because they assert on wave-1 files and must stay green -
  they are NOT written.
- **`npx tsc --noEmit --incremental false`** carries `--incremental false` because
  the bare form races on `tsconfig.tsbuildinfo` and has ONE caller under
  concurrency (parallel-disjointness.md). This is the command A39 W7's Group A
  also runs, which is why the two must not overlap (section 4.3).
- **`npm run lint`** pass condition: exit 0, and NO NEW warning in the seven files
  this wave writes, measured against the same command before the change - never
  against an absolute count (this-repo.md: the baseline drifted 4 -> 7 -> 8 in one
  hour). Note the exhaustive-deps trap: E6(viii) ADDS `gradingView` to the URL-sync
  effect's dep array, which is what keeps lint green; omitting it is both the "no
  history entry pushed" defect (M6) and a lint failure.
- **`npm run build`** is NOT in the required gate. [MEASURED] no wave-1 production
  file is a `"use server"` module (`head -1 | grep -q "use server"` returned
  not-use-server for all 7), so the build's load-bearing catch - a non-async
  `"use server"` export - cannot apply. Running it as defense-in-depth against
  module-boundary errors is fine; if run, the pass condition is the
  `Compiled successfully` line, NEVER exit 0 (the prerender tail fails with no
  `.env`). I do not make it a gate because the brief reserves the build gate for
  waves touching a `"use server"` module's exports, and this wave does not.

**Pass conditions, each naming object / instrument / direction of failure:**

| Object | Instrument | Direction of failure |
|---|---|---|
| the wave's write set | `git status --short` vs the 13-path list | RED when any other path appears, and specifically RED when `src/app/components/GradingTab.tsx` appears at all |
| type graph | `npx tsc --noEmit --incremental false` | RED (any output) on the tsc-forced edits left undone (E1(ii)/(x), E4(i), E6(i)/(vi), E7(i)/(ii)/(v), T2/T3/T8/T12/T17/T18/T27/T28/T29 tsc errors) |
| lint | `npm run lint` | RED on a NEW warning in a written file; exhaustive-deps RED if E6(viii) omits `gradingView` |
| the 6 written + 6 read-only suites | `npm run test:paths -- <12 paths>`, every arg `COVERED` | RED on any failing assertion; RED (dropped-arg) is impossible because `test:paths` credits each path |
| whole suite | `npm test` | RED on any failure. **Required, not optional:** A39 W7's Group A precondition is `npm test` zero failed, so a half-done wave 1 blocks W7 (section 4.3) |
| `editsSurface="canvas"` set | inside the `test:paths` run (`autoGradeTransition.wiring.test.ts`) | RED when the frozen two-path set gains or loses a member |
| every written production file's size | both counters, before and after | RED above 1000 (largest today `page.tsx` 703). This is a cross-check, NOT a bound pinned to any absolute |
| `GradingTab.tsx`'s size | both counters | RED when the two counters disagree with EACH OTHER. NOT pinned to 617 as an absolute (architecture R1) - "this wave did not write it" is established by `git status --short`; the counters cross-check that |

**Reading-only, NOT gateable here** (routed to section 7, no proxy proposed): the
accessible name of the inner tablist (I2 proves the attribute is fed from the
function, not what AT announces); that the inner nav visibly renders as a nav;
that a real reload and a real Back/Forward restore the selection; that an old
bookmark lands on the new surface in a real browser.

### 3.2 Wave 2 and wave 3 gates - OWED, not written

Neither gate can be written until its write set is derived (section 2.2, 2.3).
When wave 2's brief is authored it MUST include, in its `test:paths` list, the six
frozen canaries of section 6 plus whatever its own source-text scan finds; and it
must not grow `GradingRecordingPanel.tsx` past 1000. Writing either gate now would
cite paths a derivation has not confirmed - the exact failure this plan refuses.

---

## 4. Disjointness, computed in both senses

### 4.1 Within GRAD-SUBTAB: the three waves are SEQUENTIAL, not concurrent

The three waves are ordered by DEPENDENCY, so intra-item disjointness is a
sequencing question, not a simultaneity one (parallel-disjointness.md scopes
disjointness to simultaneity). They are NOT run concurrently:

- **Wave 2 depends on wave 1** and cannot precede it: it adds destinations to the
  `INNER_NAV` container and reuses the `RETIRED_GRADING_POINTERS` alias table that
  wave 1 creates in `manual-rail.ts`. Order reason: establisher-first.
- **Wave 3 depends on wave 1** for the same reason, and is additionally gated on
  its own feasibility pass. Order reason: establisher-first, plus it is the only
  wave whose type change is to a discriminated union rather than a member list, so
  it is last and may be dropped.

Their file sets DO overlap (wave 2 and wave 3 both edit `manual-rail.ts` and
`page.tsx`, which wave 1 also edits). That overlap is HARMLESS precisely because
they never run concurrently - RULING 96 (parallel-disjointness.md:185-217): when a
concurrency rule and a correctness/ordering rule meet, the waves are sequenced and
marked **MUST NOT RUN CONCURRENTLY**. I mark waves 1, 2, 3 of GRAD-SUBTAB
**MUST NOT RUN CONCURRENTLY WITH EACH OTHER**.

### 4.2 The one concurrent candidate is A39, and it is DISJOINT BY PATH

The only other backlog work touching this area is A39 (the incremental grading
run). A39 W6 has LANDED (`de1e84e`); A39 W7 is the flag flip, which is owner-only
(section 4.3). The intersection of wave 1's 13 paths with A39 W6+W7's write sets:

A39 W6 write set [MEASURED, `docs/a39-fill-waves.md:1253-1256`]:
```
src/app/actions/grading-incremental.ts
src/app/actions/grading-incremental.test.ts
src/app/components/grading/useIncrementalGradingRun.ts
src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts
```
A39 W7 write set [MEASURED, `docs/a39-fill-waves.md:1305-1310`]:
```
src/app/components/grading/incrementalRunPlan.ts
src/app/components/grading/incrementalRunPlan.test.ts
```

```
--- cat wave1-13.txt a39-w6w7.txt | sort | uniq -d  (empty is the only pass) ---
--- (nothing above this line = disjoint) ---
wave1 paths: 13 ; a39 W6+W7 paths: 6 ; duplicates: 0
```

**Empty. Wave 1 and A39 are disjoint by exact path.** [ADOPTED and re-confirmed:
the architecture computed the same empty intersection at 9.1; I re-read both A39
write sets on `d223143` and they are unchanged.]

### 4.3 Informational independence, both directions

The file sets are disjoint, but parallel-disjointness.md half two asks whether
either establishes a fact the other designs against. Computed from each side's
STATED write set:

- **Does wave 1 establish a fact A39 designs against?** No. Wave 1 changes nav
  registration, URL state and the retired-pointer migration. A39 works inside the
  grading RUN engine (`grading-incremental.ts`, `useIncrementalGradingRun.ts`,
  `incrementalRunPlan.ts`) and its own lifecycle tests. Wave 1 does not touch
  `GradingTab.tsx` or any grading-engine module, and it does not change the
  `GradingRun` shape or `INCREMENTAL_ROUTE_ENABLED`. A39 assumes nothing about the
  nav path.
- **Does A39 establish a fact wave 1 designs against?** No, at the DATA level. But
  there is a GATE coupling, and it is the one real constraint: A39 W7's Group A
  requires `npm test` zero-failed AND `npx tsc --noEmit --incremental false`
  silent [MEASURED, `docs/a39-fill-waves.md` W7 Group A]. Wave 1 turns roughly a
  dozen assertions RED before repairing them (T1-T3, T5, T6, T8, T9, T10, T12,
  T17, T27-T30), and `npx tsc` has ONE caller under concurrency. So **wave 1's
  build/gate window must not overlap A39 W7's gate window**, and wave 1 must be
  green before W7 is attempted.

**Verdict:** wave 1 is disjoint from A39 in both senses AT THE DATA LEVEL, and may
proceed concurrently with A39 W6 (already landed) with no collision. The GATE
coupling with W7 is a scheduling rule, not a reason to idle: W7 is owner-blocked
anyway (its Group B has no in-repo instrument - "NOT GATEABLE IN THIS REPO"
[MEASURED, `docs/a39-fill-waves.md` W7 heading]), so no agent can attempt W7 in
this checkout. The rule to record for whoever eventually flips W7: do not run W7's
gate while a wave-1 build is mid-flight.

### 4.4 Shared resources with no file-list footprint

- **`npx tsc --noEmit` has ONE caller.** Wave 1 is one implementer, so no
  intra-wave race. Against A39: see 4.3 - do not overlap gate windows.
- **`git stash` and `git add -A` are FORBIDDEN in the wave brief.** Stage the 13
  explicit paths. A repo-wide op sweeps siblings' work (MEMORY:
  no-git-stash-under-concurrency).
- **A stale `.claude/worktrees` copy is returned first by Glob.** A second
  worktree exists at `.claude/worktrees/friendly-meninsky-8032bc` (detached
  `8bc9c64`) [MEASURED, `git worktree list`]. The wave gate's `git status --short`
  in the MAIN checkout is the proof of what was actually touched.
- **`docs/BACKLOG.md` is a shared file.** Wave 1's push edits it (section 5). No
  other agent may write it in that window, and the orchestrator must not either.

---

## 5. Canary-update assignment per hazardous test

The distinction [ADOPTED, architecture 4]: a **CANARY** freezes a fact the change
legitimately alters (update it, and the update lands in the write set of the wave
that causes the red); a **GUARD** tells you the design is wrong (do not touch;
if it goes red, change the design). The rule the brief states: **assign each
canary UPDATE to the wave that causes its red, in that wave's write set, so no
wave lands red.**

All of T1-T35 are turned RED (or tsc-error) BY WAVE 1, so every wave-1 canary
UPDATE belongs in wave 1's write set - and it is, because every test file holding
one is in the 13-path list. The six recording canaries (section 6) are turned red
BY WAVE 2, so their updates belong in wave 2. I re-opened the load-bearing wave-1
hazard lines to confirm the architecture's calls [MEASURED, `sed -n`]:
`contentTab.wiring.test.ts:36` holds `"grading"` in `SELF_HOSTING_VIEWS`;
`:49-60` `extractRenderChain` throws at `indexOf('view === "grading" ? (') === -1`;
`:72` `LMS_VIEWS.length` is 8; `manual-rail.test.ts:34` `getDestinationById("lms-grading")`
is defined; `:56` `getActiveDestinationId("content","new","grading")` is
`"lms-grading"`; `:116-120` resolves `lms-grading` to `contentView === "grading"`;
`:138` `validateLmsViewsCompleteness()` returns zero errors. All match the
architecture exactly.

### 5.1 Wave-1 canary updates (all inside wave-1's write set)

| Test (arch id) | Line | Kind | Update, and which E-edit causes the red | In write set |
|---|---|---|---|---|
| T1 | `manual-rail.test.ts:34` | CANARY | E1(iii) removes `lms-grading`; assert UNDEFINED (removal block modelled on `:336-365`) | yes |
| T2 | `:56` | CANARY + tsc | E1(iii)/E3 make `"grading"` a non-`ContentView`; delete the line, derived loop `:264-268` covers the rest | yes |
| T3 | `:116-120` | CANARY -> ALIAS | id now resolves to `manualView === "grading"`, `gradingView === "run"` (M-pointer instrument) | yes |
| T4 | `:138` | **GUARD** | do not touch - it is the enforcer that forces destination+member to move together (2.2) | n/a |
| T5 | `:142` | CANARY | `LMS_VIEWS` drops `"grading"`: seven names | yes |
| T6 | `:219-228` | CANARY | `getInnerDestinations("content")` drops `lms-grading`: seven ids | yes |
| T7 | `:145-150`, `:256-262`, `:264-268` | **GUARD (derived)** | do not touch - they shrink by one iteration automatically | n/a |
| T8 | `:293-319` (5 its) | CANARY -> REMOVAL+ALIAS | E1(i)/(iii) retire `repo-grades`; rewrite as removal + alias block (M10 instrument) | yes |
| T9 | `contentTab.wiring.test.ts:49-60` | CANARY | E4(i) removes the grading branch; re-anchor on `'view === "announcements" ? ('` (now first branch) | yes |
| T10 | `:72` | CANARY | `LMS_VIEWS.length` 8 -> 7 | yes |
| T11 | `:36` | CANARY (SILENT) | remove `"grading"` from `SELF_HOSTING_VIEWS`; `:73/:74` stay green either way, so it is silent and MUST be named in the brief (loosened-guard corollary) | yes |
| T12 | `tab-rails.test.ts:54-65` | CANARY | `"manual:repo-grades"` at `:61` becomes `"manual:grading"`, same index | yes |
| T13 | `tab-rails.test.ts:66` + `topLevelTabs.wiring.test.ts:349` | CANARY (not triggered) | do NOT touch - both stay 10; the swap keeps `MANUAL_VIEW_ORDER` at 7 [MEASURED: order list has 7 members, `repo-grades` at index 6] | n/a |
| T14 | `tab-rails.test.ts:88-91` | GUARD (derived) | do not touch | n/a |
| T15 | `:92-100` | GUARD (derived) | do not touch (half of AC1, in-tree) | n/a |
| T16 | `:103-108` | GUARD | do not touch (other half of AC1: label uniqueness, stays green as "Repo Grades" leaves and "Grading" arrives) | n/a |
| T17 | `:183-184` | CANARY + tsc | substitute `"grading"`/`"manual:grading"` | yes |
| T18 | `:270-283` DEFAULT_STATE | CANARY + tsc | add the required `gradingView` field (the construction that makes the fixture edit unforgettable) | yes |
| T19 | `:288-301`+`:336` EXPECTED_PARAM_NAMES | CANARY (= I4) | add `"gradingView"` AND add a driving state to `:306-327` (see section on I3/I4 below) | yes |
| T20 | `topLevelTabs.wiring.test.ts:309-320` | **GUARD (derived)** | do not touch and DO NOT write a second one - this IS AC3's instrument, already in tree (hop 4) | n/a |
| T21 | `:274-285` | **GUARD** | do not touch - forces the one-tablist shape | n/a |
| T22 | `:209-226` | **GUARD** | do not touch - forbids a `TabRail`-based inner nav | n/a |
| T23 | `:430-447` | GUARD (fragile, positional) | do not touch, and do NOT insert anything between the first-sync guard and its `replaceState`; E6(vi)'s edit is BEFORE the window and safe | n/a |
| T24 | `useAppNavigation.test.ts:38-62` | GUARD (positional) | do not touch. PLACEMENT RULE: the new `gradingView` state block must go AFTER `tasksView`, never between the `contentView` initializer and `const [workflowsView` | n/a |
| T25 | `:65-75` | GUARD (derived) | do not touch | n/a |
| T26 | `:150-171` KEYS list | CANARY | add `{ constant: "GRADING_VIEW_KEY", value: "ta-grading-view" }` (AC5 persistence instrument, an extension of an existing hand list) | yes |
| T27 | `url-state.test.ts:33-46` DEFAULT_STATE | CANARY + tsc | add the `gradingView` field | yes |
| T28 | `:304` | CANARY | delete `normalizeContentView("grading")` line (returns `"modules"` now); `LMS_VIEWS`-derived loop carries the property | yes |
| T29 | `:460-467`,`:535-540`,`:669-676`,`:758-764`,`:802-808` | CANARY (vehicle substitution ONLY) | replace `"grading"` vehicle with another non-default `ContentView` member (e.g. `"assignments"`). DO NOT delete the cases; `:802-808` is the "no view param renamed" guard (D25c) | yes |
| T30 | `:881-897` | CANARY -> ALIAS | rewrite as the `manualView=repo-grades` retired-pointer test: legacy URL resolves to Grading with `gradingView === "repos"`, canonical value written back (M10 URL-side instrument) | yes |
| T31 | `autoGradeTransition.wiring.test.ts:16`,`:417` | **GUARD** | do not touch - green because wave 1 writes no `.tsx` file; it is the reason the cut avoids `GradingTab.tsx` | n/a (read-only in gate) |
| T32 | `componentStorageKeys.structure.test.ts:235` | **GUARD** | do not touch. Placement constraint: `ta-grading-view` lives in `useAppNavigation.ts` (a subdirectory), and the scan is non-recursive, so it stays green; add no new top-level `src/app/components/` file carrying a `ta-` literal | n/a (read-only in gate) |
| T33 | `client-state-sweep.test.ts:116-124` | **GUARD** | do not touch. Constraint: never add `ta-grading-view` to `DEVICE_PREFERENCE_KEYS` | n/a (read-only in gate) |
| T34 | `file-size-ceiling.structure.test.ts:131-150` | **GUARD** | do not touch - no wave-1 file exceeds 703 | n/a (read-only in gate) |
| T35 | `selection-archive.test.ts` | **UNRESOLVED** | reads `ContentTab.tsx` as source; assertion not opened by the architecture. Carried as RES-ARCH-2; the wave-1 `test:paths` run MUST include it (it does) so the gate settles it before commit | n/a (read-only in gate) |

**New assertions wave 1 AUTHORS** (not canary updates - new instruments the
architecture designed): the AC1 label-equality assertion; the AC2/hop-7/hop-8
round-trip over `GRADING_VIEWS` in `manual-rail.test.ts` (shape of `:264-268`);
I1 (parity of `getInnerDestinations`/`getInnerNavAriaLabel`) in `manual-rail.test.ts`;
I2 (source-text `aria-label={getInnerNavAriaLabel(` present, `"LMS views"` absent)
in `topLevelTabs.wiring.test.ts`; I3 (directional round trip for `gradingView`) in
`url-state.test.ts`; I5 (popstate branch parity + dep-array assertion) in
`useAppNavigation.test.ts`; one new alias case per retired pointer. All land in
files already in the 13-path write set.

**On I3+I4 together** [ADOPTED, architecture 6.2]: each alone is defeatable. I4
(the frozen-oracle extension, = T19) is caught only if the frozen list is
extended; I3 (the directional round trip) does not catch a thirteenth param under
another name. Both are required, and the wave-1 brief must require both, not
present either as the fix.

### 5.2 Wave-2 canary updates (all belong to wave 2, NOT wave 1)

[ADOPTED, architecture 4.2; every line re-confirmed on `d223143`, `sed -n`.] Wave
1 does NOT write `RecordingTab.tsx`, so all six stay GREEN in wave 1. They are
wave 2's cost and go in wave 2's write set (`recording-split.structure.test.ts`)
when its brief is derived. Listed now so wave 1's brief knows not to disturb them:

| Line | Assertion [MEASURED] | Kind |
|---|---|---|
| `:143` | `expect(entries).toHaveLength(12)` on the strip literal | CANARY, wave 2 |
| `:151` | `expect(recordingTabContent).toMatch(/\["grading",\s*"[^"]+"\]/)` | CANARY, wave 2 |
| `:173` | restore chain array includes `"grading"` among eight values | CANARY, wave 2 |
| `:198` | `expect(matches).toHaveLength(11)` on `role="tabpanel"` | CANARY, wave 2 |
| `:230` | `expect(panelTargets.size).toBe(11)` with `id="rec-panel-grading"` | CANARY, wave 2 |
| `:262-263` | `aria-labelledby="rec-tab-grading"` on its panel | CANARY, wave 2 |

Three of these are frozen COUNTS (12 tabs, 11 tabpanels, 11 panel targets) that
move together - wave 2 is a frozen-canary problem, not a size problem.

---

## 6. Line-shift and record obligations

I create NO line-shift obligation myself: my write set is one document that pins
no line in any source file. But the cut creates these, and each names an owner:

- **Wave 1's diff shifts line numbers across all 7 production files.** Any artifact
  pinning a line IN those files by NUMBER is stale after wave 1 lands - including
  this plan, the architecture doc, and any `docs/` cite of `manual-rail.ts` /
  `url-state.ts` / `useAppNavigation.ts` / `page.tsx` / `ContentTab.tsx` line
  numbers. Obligation: re-grep by symbol, never trust a line number, after wave 1.
  Owner: whoever next cites those files. This is why the source-text tests use
  string anchors, not line numbers - and why the two POSITIONAL guards below are
  the real risk.
- **Positional guards T23 and T24 (and RES-ARCH-10)** can go RED from an insertion
  in the WRONG place even though wave 1 is correct: T23 slices a fixed 600 chars
  from the first `isFirstUrlSyncRef.current`; T24 isolates the `contentView`
  initializer between two anchors. The architecture gave the placement rules
  (E6(iii) block after `tasksView`; nothing between the first-sync guard and its
  `replaceState`). Owner: wave-1 implementer must honour them; test-author owns
  RES-ARCH-10 (the fragility itself).
- **`docs/BACKLOG.md:134` (row A40)** carries the owner-verification path "Tools >
  LMS > Grading, scroll to Submissions..." [MEASURED, `grep -an "scroll to Submissions"`].
  Wave 1 DELETES that destination (the `lms-grading` destination becomes Tools >
  Grading). The nav string becomes false. **The A40 row already records this
  obligation itself** (its tail: "If and when its wave 1 ships, this row instrument
  text must be updated to the new destination in the same push"). Owner: backlog
  seat, at the wave-1 push. This is RES-ARCH-5.
- **`docs/BACKLOG.md:159` (the GRAD-SUBTAB home row) is now STALE.** [MEASURED,
  `grep -an "GRAD-SUBTAB"`] It still says "Architecture ... is authored but
  UNCHECKED ... The check is parked" - but `d223143` landed the check clean. Owner:
  backlog seat, at the wave-1 push (or sooner). New: RES-WAVE-3.
- **`docs/BACKLOG.md` line numbers I cite here (A40 at 134, A39 at 157,
  GRAD-SUBTAB at 159) are volatile** - the check already recorded that `baf6444`
  shifted A40 from 133 to 134. Re-grep by row id, do not trust these numbers.

---

## 7. The owner walk (the final non-gateable step)

No component is rendered by any test in this repo; `vitest.setup.ts` throws on real
`fetch`; there is no `.env`. So the entire visible/audible/browser half of this
feature is unverifiable here and is the wave's final step, performed by the owner.
No proxy is proposed for any item. [ADOPTED, architecture section 6 and 10;
AC owner-walk OW1-OW4.]

| id | Item | Owner | Instrument | Step |
|---|---|---|---|---|
| OW-A1 | A chip labelled `Grading` is visibly present in the Tools rail, the inner navigation renders AS a nav, and the inner tablist's ACCESSIBLE NAME is "Grading tools" (not "LMS views") | repo owner | open the app, Tools tab, read the rail and the inner strip with a screen reader | after wave 1 lands, before the row closes |
| OW-A2 | The inner selection visibly persists across a real hard reload, AND survives Back then Forward | repo owner | pick a non-default inner item (Repo Grades), hard-reload; then press Back and Forward and observe | same sitting as OW-A1 |
| OW-A3 | An OLD bookmark / stored pointer lands on the new surface | repo owner | open `?tab=manual&manualView=content&contentView=grading`, `?manualView=repo-grades`, and a session with `ta-content-view=grading` / `ta-manual-view=repo-grades` / `ta-active-tab=grading` in storage | same sitting |
| OW-A4 | The consolidated nav is not cluttered at the landed item count | repo owner | judgement; no instrument exists here | after each wave |

Wave 2 and wave 3 each add their own owner-walk items (the Recording panels
rendering under the new parent; Drafted Grades under Tools) when they are derived.

---

## 8. Residual register

Each row names owner, instrument, and step. A row missing any of the three is a
DELETION (iteration-caps.md:167). **None of these is a row in `docs/BACKLOG.md`
yet** - that file is not in my write set. Until the backlog seat files them (or
folds them into the GRAD-SUBTAB home row at `:159`, which the check's C-R2 says to
reconcile against rather than duplicate) they DO NOT EXIST. I call that plainly.

Carried from the architecture (RES-ARCH-1..10), unchanged - each is still open and
none is discharged by this plan:

| id | Residual (abbreviated) | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-ARCH-1 | Grading chip's rail position is the architect's default (index 6, where `repo-grades` sat) | wave-3 UX seat | exact id list `tab-rails.test.ts:54-65` | wave-3 UX pass on the as-built diff |
| RES-ARCH-2 | `selection-archive.test.ts` reads `ContentTab.tsx` as source; its assertion was not opened | wave-1 implementer | `npm run test:paths -- src/lib/lms-generation/selection-archive.test.ts` (inside the wave-1 gate) | wave-1 gate, before commit |
| RES-ARCH-3 | popstate ladder stays hand-written (I5 catches an omission; the derived-loop construction is declined) | test-author, then a later chunk | I5 today; derived loop + before/after snapshot if built | next chunk adding a FOURTH inner nav |
| RES-ARCH-4 | Whether Library > Files > Submissions should stay a second `CartridgeDropPanel` entry point | wave-3 UX seat | destination enumeration + `ta-cartridge-*` key set | wave-3 UX pass |
| RES-ARCH-5 | `docs/BACKLOG.md` A40 nav path deleted by wave 1 (now at `:134`) | backlog seat | `grep -an "scroll to Submissions" docs/BACKLOG.md` | the push that lands wave 1 |
| RES-ARCH-6 | one `instrumentsReconcile === false` (`normalizeContentView` in `useAppNavigation.test.ts`); `codeOccurrences` half used | test-author | `src/tools/symbol-count/count.ts` re-run | whenever that split decides anything |
| RES-ARCH-7 | `useAppNavigation.ts` (638) grows ~25-40 lines; no ceiling risk but it is the file every nav addition grows | architect, next nav chunk | both counters after wave 1 | extraction owed before it passes 800 |
| RES-ARCH-8 | `docs/loop/traps-spec.md:12-15` states `GradingRecordingPanel.tsx` at 964; measured 977 on both | whoever next edits that card | both counters on that path | next loop-doc pass |
| RES-ARCH-9 | `docs/a39-fill-waves.md` cites `INCREMENTAL_ROUTE_ENABLED` at `:99`; measured `:104` | whoever next opens that plan | `grep -n "export const INCREMENTAL_ROUTE_ENABLED" src/app/components/grading/incrementalRunPlan.ts` | wave-2/W7 brief |
| RES-ARCH-10 | `topLevelTabs.wiring.test.ts:430-447` positional 600-char slice is fragile to an insertion in `useAppNavigation.ts` | test-author | that assertion + a length check on the sliced block | next chunk writing that URL-sync effect |

New this plan (RES-WAVE-*):

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-WAVE-1 | Wave 2's write set is NOT derived, and re-parenting `GradingRecordingPanel`/`SnapshotGradingPanel` out of `RecordingTab.tsx`'s capture lifecycle (`active={active && recView === "grading"}`, `:857`) is undetermined | architect (wave-2 pass) | symbol census + source-text scan for the two panels and `recView`; then a re-parenting feasibility finding | before any wave-2 gate is written, after wave 1 lands |
| RES-WAVE-2 | Wave 3's write set is NOT derived and feasibility is not established: absorbing `DraftedGradesTab` crosses `ToolsRailItem`'s `toolsSection` discriminant (`tab-rails.ts:126-128`) and may force `WorkflowsPanel`'s own nav to change | architect (wave-3 feasibility pass) | the `ToolsRailItem` type + `WorkflowsPanel` nav | after wave 1 (and likely wave 2) land |
| RES-WAVE-3 | `docs/BACKLOG.md:159` (GRAD-SUBTAB home row) is stale: it says the architecture check is "parked/UNCHECKED", but `d223143` landed it clean and BUILDABLE | backlog seat | `grep -an "GRAD-SUBTAB" docs/BACKLOG.md` | the push that lands wave 1, or sooner |

---

## 9. What I could not determine

Stated plainly rather than filled in.

1. **Anything a user sees, hears read aloud, focuses or reaches by keyboard** -
   node-env vitest renders no component. All of section 7 is [READING]/owner-walk.
2. **Wave 2's exact write set and its re-parenting feasibility** - the architecture
   declined to derive it; RES-WAVE-1. I carry only the six known canaries.
3. **Whether wave 3 is feasible at all** - RES-WAVE-2.
4. **RES-ARCH-2's outcome** (does `selection-archive.test.ts` go red on the
   `ContentTab.tsx` grading-branch removal) - the wave-1 gate settles it; it is in
   the gate's `test:paths` list.
5. **The click-cost delta of the consolidation** - measurable, not measured;
   wave-3 UX seat's, counted twice (first use, repeat use).

---

## 10. Two-rounds note

If the fresh `loop-checker` on this plan returns defective a second time, the
question goes to the owner, not a third round (AGENTS.md "Two rounds, then ask").
The one fork I can foresee being escalated is NOT a defect in this plan but a
SCOPE call the owner alone can settle: **does GRAD-SUBTAB ship as wave 1 alone
(the container plus the two already-in-Tools grading surfaces), with waves 2 and 3
filed as their own future items - or does the owner want the Recording and Drafts
surfaces derived and landed before the row is considered done?** Every answer
terminates: "wave 1 is the shippable unit" closes the activity with waves 2/3 as
RES-WAVE-1/2 rows; "all five surfaces" closes it by commissioning the wave-2 and
wave-3 derivation passes as the next activities. This plan is correct under either
answer - it ships wave 1 now and files 2/3 as derivation-owed - so it is NOT a
blocking question and nothing waits on it.

---

## 11. Gates run on this document

**Run:** `npm run docs:gate`. Result in the hand-back report.

**NOT run:** every instrument in sections 3, 5, 7. My write set is one document.
I1-I5 and the new assertions do not exist yet and I did not create them; T1-T35
and the six recording canaries were re-read at their cited lines but none was
executed against a modified tree. No file under `src/` was opened for writing,
nothing was committed, nothing was pushed. `git status --short` is in the
hand-back.
