# A39: the INCREMENTAL GRADING FILL - the wave plan

Subject: `docs/a39-incremental-fill-architecture.md` (2634 lines, committed at
`59f3aac`), round 2 of two, final. That document has 26 requirements F1-F26, a
46-path owns list and roughly 19 files, and **no build sequence**. An implementer
read it in full, found no wave cut, and stopped rather than improvising one.
Neither the design nor its 920-line adversarial check noticed the gap, so neither
is authority on it.

**The design is authoritative on WHAT. This document is authoritative on ORDER
and BOUNDARY, and on nothing else.** Four rulings are settled inside it and are
not reopened here: RULING 131 (`GradingResults.tsx` IS editable), RULING 132
(prefix stability during the run, determinism at completion), RULING 133 (a
numeric line bound on `grading.ts`), RULING 134 (the column union on both
routes). No cut below requires re-deciding any of them.

**Write set of this pass: this one document.** `git status --short` at the START
of this pass:

```
 M docs/BACKLOG.md
 M docs/backlog.yml
 M src/tools/backlog/backlog-file.structure.test.ts
```

and at the END:

```
(clean)
```

The difference is NOT my doing. Those three files belonged to the concurrent
backlog seat and landed as a commit during this pass; I was instructed to stay
out of all three and did. Nothing under `src/`, `supabase/` or
`docs/a39-incremental-fill-architecture.md` was written, edited or reverted here.
No `git stash`, no `git add -A`, no `git checkout --`.

**I RAN NO TEST, NO TYPE CHECK AND NO BUILD.** Every "would go red" below is a
READING claim from the instrument's own source, cited by line. Every mutation
named is the design's; I invented none.

---

## 1. Measurement preamble

Every quantity names the command that produced it. Sizes are taken from BOTH
counters, because this repo has a recorded disagreement between them of 15 to 138
lines across 13 files (`docs/loop/this-repo.md:5-12`).

`wc -l <path>` (Bash) and `@(Get-Content <path>).Count` (PowerShell), run
separately at the head of this pass:

| Path | `wc -l` | `@(Get-Content).Count` | Design 9.1 says |
|---|---|---|---|
| `src/lib/grade/types.ts` | 432 | 432 | 432 |
| `src/lib/grade/reconcile.ts` | 106 | 106 | 106 |
| `src/lib/grade/reconcile.test.ts` | 217 | 217 | 217 |
| `src/lib/grade/extraction.ts` | 353 | 353 | 353 |
| `src/app/actions/grading.ts` | **946** | **946** | 946 |
| `src/app/actions/grading-incremental.ts` | 141 | 141 | 141 |
| `src/app/actions/grading-incremental.test.ts` | 189 | 189 | 189 |
| `src/app/components/grading/incrementalRunPlan.ts` | 199 | 199 | 199 |
| `src/app/components/grading/incrementalRunPlan.test.ts` | 193 | 193 | 193 |
| `src/app/components/grading/useIncrementalGradingRun.ts` | 192 | 192 | 192 |
| `src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts` | 393 | 393 | 393 |
| `src/app/components/GradingResults.tsx` | **906** | **906** | 906 |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | 728 | 728 | 728 |
| `src/app/components/grading-results/gradingResultsHelpers.test.ts` | 561 | 561 | 561 |
| `src/app/components/GradingTab.tsx` | 620 | 620 | 620 |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **349** | **349** | **393 - WRONG** |
| `src/lib/module-graph/runtime-import-graph.test.ts` | 772 | 772 | not bounded |
| `src/lib/grade/prompts.ts` | 386 | 386 | 386 |
| `src/lib/grade/engine.ts` | 487 | 487 | 487 |
| `src/app/actions/grading.guard.test.ts` | 413 | 413 | not measured |
| `src/app/actions/grading.budget.test.ts` | 202 | 202 | not measured |
| `src/app/actions/grading.collisionRefusal.test.ts` | 132 | 132 | not measured |
| `src/app/actions/grading-checklist.test.ts` | 82 | 82 | not measured |
| `src/lib/grade/extraction.test.ts` | 330 | 330 | 330 |

The two counters AGREE on all twenty-four.

### 1.1 One design quantity I can disprove, reported and not silently adopted

**`src/app/components/autoGradeTransition.wiring.test.ts` is 349 lines on both
counters, not 393.** The design's 9.1 row states 393 and adds, explicitly,
"measured at 393 on both counters (`wc -l`; `@(Get-Content ...).Count`) and
carries six new clauses, hence `-le 620`." 393 is the measured size of
`useIncrementalGradingRun.lifecycle.test.ts`, the row four lines above it in the
same table; the figure was carried across.

I adopt neither number as a bound by inheritance. What I do:

- The design's per-line citations INTO that file are all exact and were verified
  by opening, so nothing built on them is affected. `:159` opens A5 and `:161` is
  `expect(wholeFileMatches.length).toBe(2)`; `:99-100` are the two source
  readers; W4-8's block runs `:333-343` with `indexOf("incrementalRunning &&")`
  at `:336`. Commands: `sed -n '159,172p'`, `sed -n '98,101p'`,
  `sed -n '330,345p'` on that file.
- The design's `-le 620` still HOLDS as the item's final ceiling - it is simply
  more generous than the design thought: headroom is 271 lines, not 227.
- **RES-P-1** carries the correction with an owner and a step, and W3's
  pre-change baseline records 349 so the delta is attributable.

### 1.2 One design premise I can disprove, and it moves a requirement's host file

**F26's instrument cannot be built where the design puts it.** F26 reads: "`grading.guard.test.ts` or `grading.budget.test.ts` (both already in the gate
list and **both already read `grading.ts` as source**)". Measured:

```
for f in grading.guard.test.ts grading.budget.test.ts grading.collisionRefusal.test.ts \
         grading-checklist.test.ts grading-missing-submissions.test.ts \
         grading-run-mapping.test.ts postable.test.ts \
         action-guard-coverage-github-cohort.test.ts ; do
  grep -c "readFileSync\|node:fs\|from \"fs\"" <that file> ; done
  -> grading.guard.test.ts                        0
     grading.budget.test.ts                       0
     grading.collisionRefusal.test.ts             0
     grading-checklist.test.ts                    0
     grading-missing-submissions.test.ts          0
     grading-run-mapping.test.ts                  0
     src/lib/grade/postable.test.ts               2
     action-guard-coverage-github-cohort.test.ts  3

canary: grep -c "readFileSyncZZZ" src/app/actions/grading.guard.test.ts  -> 0
```

Neither named host reads any file at all. The two files in the 46-path baseline
that DO read `grading.ts` as source text are `src/lib/grade/postable.test.ts`
(`:172-173` is `readStripped("src/app/actions/grading.ts")`) and
`src/app/actions/action-guard-coverage-github-cohort.test.ts`.

**RULED, as a write-set decision and not a design change: F26's assertion lands
in `src/app/actions/grading.guard.test.ts`, which becomes a source-text reader
for the first time** - it gains `readFileSync`, the zero-count assertion and its
canary, about +14 lines. Two reasons, both load-bearing:

- It keeps the design's own named host and its owns list unchanged. Moving F26
  into `postable.test.ts` would put a rubric-provenance assertion inside a
  postability file and would change the owns list the design derived.
- `postable.test.ts` reads through `readStripped`, which STRIPS COMMENTS. F26's
  pass condition is a count of ZERO, so a comment naming `rubricUsed` must make
  it RED - the design says so explicitly ("the fill must therefore not name
  either field in a `grading.ts` comment"). A stripping host would silently
  delete that obligation. A plain `readFileSync` host fails closed.

**RES-P-2** carries it. The baseline the instrument needs is already measured:
`grep -c "rubricUsed\|rubricFingerprint" src/app/actions/grading.ts` -> **0**,
exit 1, with `grep -c "rubricUsedZZZ" ...` -> 0, exit 1, as the canary proving it
fires on real names only.

### 1.3 The counting rule this pass enforced on itself, with three caught instances

A bare `grep -c` over a symbol COUNTS PROSE. Everything below that decides a
boundary was taken twice or opened. It caught six false positives, three of them
in my own derivation and three in the design's:

| Hit | What it really is |
|---|---|
| `src/lib/code-runner.test.ts` matched `grade/engine.ts` | `:174` is a COMMENT. Not a reader. Dropped from W1's set |
| `src/lib/decks/deck-source.test.ts` matched `gradingResultsHelpers` | `:106` is a COMMENT citing a different test file. Dropped from W3's set |
| `src/app/components/GithubGradingPanel.wiring.test.ts` matched `gradingResultsHelpers` | `:11` and `:75` are COMMENTS; the file reads `GithubGradingPanel.tsx`, not the helper (`:24-28`). Dropped from W3's set |
| `src/lib/canvas/grades.test.ts` matched `GradingResults.tsx` (in the design's 46) | `:5` is a COMMENT |
| `src/lib/office-edit.test.ts` matched `grade/extraction` (in the design's 46) | `:12` is a COMMENT |
| `src/lib/grade/utils.test.ts` matched `GradingResults.tsx` (in the design's 46) | `:362` is a COMMENT |

**The distinction that matters: over-inclusion in a GATE list is harmless, and
over-inclusion in a DISJOINTNESS set manufactures a false coupling between two
waves that are actually independent** (`docs/a39-waves.md` 9.3's own lesson). So
the three prose-only hits are pruned from the intersected sets in section 5 and
the design's 46-path list is left exactly as it is, because every path in it is a
real test file that will report `COVERED`.

A counter-example proving the pruning is not indiscriminate:
`src/app/components/grading-results/gradingResultsHelpersEditState.test.ts:27` is
`import { disambiguateCanvasEntries } from "../../../lib/grade/extraction";` - a
GENUINE import reader of W4's file, kept.

### 1.4 Two readers the design's owns list misses

My per-file derivation against the design's pasted 46-path baseline:

```
comm -23 <my wave-set test files, sort -u> <(sort -u <the design's 46>)
  -> src/app/actions/grading-submission-grade.test.ts
     src/lib/grade-result-allowlist-coverage.test.ts
     src/lib/grade/run-header.test.ts        (expected: the 47-path GATE list has it)
     + the three prose-only hits of 1.3, dropped
comm -13 (the same, other direction)
  -> src/file-size-ceiling.structure.test.ts
     src/lib/no-emojis.test.ts
     src/lib/use-server-exports.test.ts
     src/source-bytes.structure.test.ts      (the four repo-wide gates, filtered)
```

The design's pattern A alternation is
`GradingTab\.tsx|GradingResults\.tsx|grading-incremental|incrementalRunPlan|useIncrementalGradingRun|grade/reconcile|actions/grading\.ts|grade/extraction`
- it has no alternative for `grade/types`, which RULING 133 put in the write set.
So two real readers of `types.ts` are in no list:

- `src/app/actions/grading-submission-grade.test.ts` - imports
  `UNGRADED_NOT_ATTEMPTED_MESSAGES` from `@/lib/grade/types` at `:30`, and `:126`
  is `expect(Object.keys(result.results[0]).sort()).toEqual(...)`, an EXACT KEY
  SET over a `GradeResult`.
- `src/lib/grade-result-allowlist-coverage.test.ts` - its header states it
  enumerates every key of `GradeResult` and fails `npx tsc --noEmit` if a field
  is added without being listed.

Both are READ-ONLY for this design and both stay green, because the fill adds
**no field to `GradeResult` or `GradingRun`** - `GradingRunHeader` and
`GradingRunTier2` are new interfaces, and `run.fullCreditChecklist` /
`run.sampleAnswer` already exist on `GradingRun` (`GradingResults.tsx:567`,
`:578` read them today). **Direction of failure, which is why they are in the
gate: RED if an implementer puts a header or tier-2 field onto `GradeResult` or
`GradingRun` instead of into a new interface.** That is a reachable mistake and
these two are the only things that would catch it.

`src/lib/grade/types.ts`'s other 26 source-text readers are NOT in any wave set.
The derivation: a type-only declaration adds no value, no runtime edge and no
behaviour, so no behavioural assertion can move. The two exceptions above are in,
because their OBJECT is a type's key set rather than a behaviour. Command that
produced the 28:
`grep -rl "grade/types" src --include="*.test.ts"` plus
`grep -rlE 'from "\./types"' src/lib/grade --include="*.test.ts"`, `sort -u`.

---

## 2. Dependency derivation, from the design's sections 4, 5 and 9.4

The implementer that stopped offered "types, a new `run-header.ts` and its test
(F1/F2/F3), plus two call-site edits in `grading.ts` (F26 and its bound)" as a
natural first slice. **That is treated as input and it is very nearly right; it
is not the first slice, and it is not the only root.** Verified against the tree.

### 2.1 What `resolveRunHeader` needs, and what needs it

`run-header.ts` must call, per design section 3 and 4.3:

```
grep -n "export function extractRubricCriteria\|export async function inferFileNameConvention\|export async function generateRubric" src/lib/grade/rubric.ts
  -> 27:  export function extractRubricCriteria(
     209: export async function inferFileNameConvention(
     243: export async function generateRubric(
grep -n "export function stampRubricProvenance" src/lib/grade/rubric-provenance-stamp.ts
  -> 26
```

All three of its callees exist today and none is in this item's write set. Its
only write-set dependency is `GradingRunHeader` in `types.ts`, which the same
wave adds. **So the header-resolution unit depends on nothing else in the item -
confirmed.**

Its consumers, both stated by the design: `gradeAction` (9.4's field table -
reads two of five, applies neither provenance field) and
`prepareGradingRunAction` (reads all five). `gradeAction` is in `grading.ts`,
which the same wave edits. So the header unit is closed.

### 2.2 But there are THREE independent roots, not one

The design's own content shows two more units that depend on nothing in the item:

**Root B - `reconcile.ts`.** RULING 134's fallback change and 6.4's one-line
import move need nothing from the header. `unionAreaNames(rows: readonly
GradeResult[])` uses `GradeResult`, which `types.ts` already exports. Verified:
`grep -n "^import" src/lib/grade/reconcile.ts` -> `:19` `import type {
GradeResult, RubricAreaResult } from "./types";`, `:20` `import {
normalizeAreaName } from "./rubric";`. The richest fallback is at `:50-58`
exactly as cited, opened.

**Root C - `extraction.ts`.** The filename-inference option needs only
`inferFileNameConvention` from `./rubric` and `groupSubmissionsByStudent`'s
already-optional second parameter. Verified: `sed -n '128,152p'
src/lib/grade/extraction.ts` shows `:135` the definition,
`extractStudentEntries(zipBuffer: ArrayBuffer)` single-parameter, `:145-148` the
collision refusal, `:149`
`groupSubmissionsByStudent(submissions, undefined, rawData, zipParents)`. And
`sed -n '1,14p'` shows the import block with `../canvas` at `:8` and no
`./rubric`.

**Root C does NOT become its own wave, and the reason is the rule this repo has
broken before.** An optional parameter nobody passes is a dead capability: the
design's own 9.2 says behaviour is byte-identical when the option is absent, so
a wave that only widens `extractStudentEntries` ships a feature with no caller
and a green gate. Its passer is `grading-incremental.ts:91`, so Root C lands in
the tier-1 wave that passes it.

### 2.3 The direction that fixes the order

Reading the design's section 5.7 obligation 1 together with 5.4: `selectRunKey`
is only sound if `beginWholeRun` resets the phase to `idle`, because
`selectRunKey("idle", n)` is `undefined` and that is what hands the whole-run
path back its reference comparison. So the one door, the phase machine, the
identity key and the one mount are a single construction and cannot be separated
- section 4 wave 5 states each edge.

And reading 9.4 against 4.3: `prepareGradingRunAction` cannot resolve a header
that does not exist, and `buildIncrementalRun` cannot consume a `GradingRunHeader`
that does not exist. So the header unit precedes both.

**Conclusion: the header unit is a root but not the first wave.** The
`reconcile.ts` unit goes first, for two reasons neither the design nor the
stopped implementer could have weighed:

1. The design's FIRST-STEP mutation (M2, section 11's preamble) is an experiment
   whose answer decides the content of `runtime-import-graph.test.ts` - the file
   the `reconcile.ts` wave WRITES. Learning the answer before that file is edited
   means one edit instead of two.
2. `runtime-import-graph.test.ts` is written by exactly one wave and read by five
   (section 5). A writer that lands before its readers is the ordering that keeps
   a reader's gate from failing for someone else's reason.

---

## 3. The wave table

Seven waves. Format follows `docs/a39-waves.md` section 4.

| # | Name | Requirements | What it EXPORTS | Where that export is CALLED, in the SAME wave | Independently gateable? |
|---|---|---|---|---|---|
| **W1** | The column union, and the leaf becomes pure | F15, F23; RES-FILL-1, RES-FILL-9, RES-FILL-12. **Owns the M2 first-step mutation (S0) and the frozen-oracle re-capture** | `unionAreaNames` (`src/lib/grade/reconcile.ts`) | `reconcile.ts`'s own empty-canonical fallback at `:51-58`, same commit. That call is the whole of RULING 134 | **YES.** And it is the only wave whose behaviour change is USER-VISIBLE on landing - it changes the whole-run path |
| **W2** | The run header, and its whole-run caller | F1, F2, F3, F26. **Clears `grading.ts`'s pre-existing overrun** | `resolveRunHeader` (`src/lib/grade/run-header.ts`, new); `GradingRunHeader` (`types.ts`) | `src/app/actions/grading.ts` calls `resolveRunHeader` at BOTH sites (zip `:886-893`, Canvas `:814-816`), same commit. `GradingRunHeader` is consumed by `run-header.ts`'s own signature and by `gradeAction`'s destructure | **YES.** No type-only exception claimed |
| **W3** | The run IDENTITY (RULING 131) | F9 (both clauses) | `runResetKey` (`grading-results/gradingResultsHelpers.ts`) | `src/app/components/GradingResults.tsx`'s reset guard, same commit, through the EXISTING import statement at `:39` | **YES.** A no-op for all three mounts by construction: `runResetKey(undefined, run)` returns `run` |
| **W4** | Tier 1: the prep resolves the run | Design item #9, F24; RES-FILL-10 | `extractStudentEntries`'s new optional `inferFileNamesWith`; the header on `prepareGradingRunAction`'s result | `grading-incremental.ts:91` passes the option, same commit. `prepareGradingRunAction` already has its caller | **YES with ONE stated qualification** - see 3.2 |
| **W5** | One machine, one mount, one door | F4, F5, F6, F7, F8, F10, F11, F12, F13, F14, F19, F20, F21, F22, F25. **Six ordered steps, ONE commit** | the six pure plan-leaf functions, `IncrementalPhase`, `GradingRunTier2`, `beginWholeRun` | the hook calls `buildIncrementalRun`/`canonicalColumns`; `GradingTab.tsx` calls `selectDisplayRun`, `selectRunKey`, `describeRunProgress`, `shouldShowEmptyState` and `beginWholeRun` - all same commit | **YES at call-site level. NOT user-reachable** - the flag is off; see 3.3 |
| **W6** | Tier 2, the non-blocking half | F16, F17, F18 | `completeGradingRunHeaderAction` (`grading-incremental.ts`) | the hook's `startReview` fires it, same commit | **YES.** This is the design's own named cut (4.3): drop W6 and the cost is exactly two panels |
| **W7** | The flag flip | design section 15, Groups A + B + C | nothing - it changes one constant | n/a | **NO. Not gateable in this repo** - see 3.4 |

### 3.1 W5 cannot be cut, and here is the disproof rather than the caution

Four attempts, each refused by a fact in the design:

- **Land the plan leaf alone.** Every one of its six functions' callers is the
  hook or `GradingTab.tsx`. A pure library with no caller is the shape
  `docs/a39-waves.md` 4.1 refuses and this repo has shipped twice.
- **Land the mount merge without the precedence functions.** Deleting
  `GradingTab.tsx:595-615` leaves one mount that must choose between
  `state.run` and the incremental run. That choice IS `selectDisplayRun`; there
  is no intermediate state.
- **Land `selectRunKey` without `beginWholeRun`.** Design 5.7 obligation 1: a
  whole-run dispatch that left a non-`idle` phase carries a stale
  `"incremental-<runId>"` key onto the NEW whole-run object, and the seven resets
  do not fire - a stale Posted-to-Canvas badge over a different run's grades. The
  door is what makes the key sound.
- **Land `buildIncrementalRun` without the mount.** Its output would go into
  `setIncrementalRun` with no reader, while `GradingTab` still built the inline
  literal at `:599-603`. Two builders, one of them dead.

So W5 is one commit with six ordered steps. **The steps are not separately
committable** - each intermediate state leaves an export without its caller - and
that is stated so nobody "improves" the plan by splitting them.

### 3.2 W4's one qualification, stated rather than hidden

W4 constructs the tier-1 ORDER (design 4.3's seven steps) but the design's
instrument for it, F4, lives in
`useIncrementalGradingRun.lifecycle.test.ts` - W5's file - because F4 measures
"ORDER at the consumer, not as a not-called assertion inside a module with no
call site". I do not move it and I do not invent a substitute.

What W4 DOES have, in its own wave, falsifiable: **F24**
(`grading-incremental.test.ts`, a rejecting `getSpeedGraderUrl` stub must yield
`mode: "incremental"` with `speedGraderUrl === null`, not `mode: "whole-run"`)
and the design's Group A item 8 greps for the inference's reachability.

Also: the header field on `prepareGradingRunAction`'s result has no reader until
W5. Under `INCREMENTAL_ROUTE_ENABLED === false` nothing on this route is
user-reachable at all, so this is not a new dead-surface class - it is the route's
existing condition, discharged by W7. **RES-P-9** carries the F4 gap.

### 3.3 What "gateable" means for W4, W5 and W6, and what it does not

`src/app/components/grading/incrementalRunPlan.ts:99` is
`export const INCREMENTAL_ROUTE_ENABLED = false;` (opened, `sed -n '95,100p'`),
and `incrementalRunPlan.test.ts` pins it off at `:54` with two
`routeGradingRun -> "whole-run"` cases at `:58` and `:77` (all three opened). So
for W4, W5 and W6 there are two different questions and this plan keeps them
apart:

- **CALL-SITE completeness** - every export has an in-repo caller in its own
  wave. This is the rule that stops a dead export, and all three waves satisfy
  it.
- **USER reachability** - an instructor can reach the code. For the whole
  incremental route that is false today and stays false until W7. It is not
  something W4, W5 or W6 can or should claim.

**A green gate on W5 therefore means "the construction is in place and its pure
and source-text properties hold". It does not mean the feature works.** Design
section 11's closing note names the three weakest links - F6's, F9's and F13's
behavioural halves - and all three are owner-walk items. W7 is where that is
settled.

### 3.4 Why W7 is not gateable here, and where it goes instead

Design section 12 lists eight owner-walk items and states that items 1, 2, 4, 7
and 8 have **no in-repo instrument of any kind**. The environment reasons are
fixed: vitest is node-env and collects only `src/**/*.test.ts`, so no component
renders, and there is no `.env` and no network. Item 7 - "an arriving row does
not disturb in-progress work on an earlier row" - is the one whose failure
destroys work the instructor has already done, and nothing in this repo can see
it.

**So W7 is routed to owner-verification, with an owner, an instrument and a step,
and this plan proposes no proxy for any of the five.** A wave whose only evidence
would be a render is not a wave.

W7's own write set is small and real: the one-line constant at
`incrementalRunPlan.ts:99` and the three assertions at
`incrementalRunPlan.test.ts:54`, `:58`, `:77`, which are part of the flip
commit's write set rather than collateral damage discovered at the gate (design
15's last paragraph).

---

## 4. Per-wave detail: write set, bounds, gate, changed lines

Standing gate form, from `docs/loop/this-repo.md` section 1 and
`docs/a39-waves.md` section 5. Every wave runs all of it.

| Gate | Command | Passing looks like |
|---|---|---|
| Named tests | `npm run test:paths -- <p1> <p2> ...` | `COVERED` for EVERY argument, exit 0. A `NOT COVERED` line is a failure even when the suite is green. Never a raw multi-path `vitest`/`npm test` - it silently drops any argument it does not match |
| Full suite | `npm test` | zero failed, exit 0. **Do not pin the file or test count** - every wave here adds test files, so the count rises by design |
| Typecheck | `npx tsc --noEmit --incremental false` | no output at all, exit 0. `--incremental false` is mandatory: `tsconfig.json` sets `"incremental": true` and two callers race on `tsconfig.tsbuildinfo` |
| Lint | `npm run lint` | exit 0, and **no NEW warning in the files this wave writes**, measured against the same command run before the change. Never an absolute count - the baseline read 4, 7 and 8 on three different days |
| Ceiling | `@(Get-Content <file>).Count` AND `wc -l < <file>` | both agree, both at or under the wave's bound. `src/file-size-ceiling.structure.test.ts:41` is `const LIMIT = 1000;` and `:140` compares `lineCount > limit`, so 1000 exactly PASSES and 1001 is RED. `ALLOWED_OVERAGE` (`:75-92`) has four entries and **none of them is in this item's write set**, so no ratchet applies here |
| Tree | `git status --short` in the MAIN checkout | exactly the wave's assignment, nothing else. `.claude/worktrees` holds a copy `Glob` returns FIRST; a report is not evidence |
| Build | `npm run build` | **W2 and W6 only** (they touch a `"use server"` module's exports). The gate is the `Compiled successfully` LINE, grepped for, NOT the exit code - the prerender tail always fails for want of `.env`. The FAST instrument is `npx vitest run src/lib/use-server-exports.test.ts`; the build is the backstop |

Three repo-wide gates run on every wave because they walk directories and collect
new files automatically: `src/file-size-ceiling.structure.test.ts`,
`src/lib/no-emojis.test.ts` (`roots = ["src", "docs"]` at `:254` - it scans
`docs/`, so it is also the gate over THIS file) and
`src/source-bytes.structure.test.ts` (it calls `collect(ROOT)` over the whole
repo with `.md` in `TEXT_EXTENSIONS` at `:50`, so it too reads this file).

**Which path list, at which moment.** `npm run test:paths` REFUSES with exit 1
and runs NOTHING if any argument is absent (`paths-gate.ts:42`, `cli.ts:36`,
before `deps.runVitest` at `:43`). Measured: all 46 paths of the design's
BASELINE list exist, none duplicated, and `src/lib/grade/run-header.test.ts` does
NOT exist.

```
sed -n '1797p' docs/a39-incremental-fill-architecture.md | tr ' ' '\n' | grep '^src/'
  -> 46 lines; per-path [ -f ] loop: zero missing; sort -u: 46
[ -f src/lib/grade/run-header.test.ts ]  -> NO
```

So:

- **The 46-path BASELINE list runs ONCE, before W1's first edit**, as the item's
  pre-change baseline. It is the only list that can run at that moment.
- **W1's own gate uses the 46-path list too**, because `run-header.test.ts` still
  does not exist when W1 gates.
- **The 47-path GATE list becomes legal from W2's gate onward**, because W2 is
  the wave that creates the 47th path.
- Between those, each wave runs its OWN derived list (below) plus `npm test`.
  The 47-path list is run in full at W7, which is where design 15 Group A item 12
  puts it.

---

### W1 - The column union, and the leaf becomes pure

**GOAL: RULING 134's one column behaviour on both routes, and `reconcile.ts`
becomes importable from a client leaf. Nothing about the incremental route lands
here.**

**Write set:**

| Path | Role | Now | Bound |
|---|---|---|---|
| `src/lib/grade/reconcile.ts` | **edit.** `:20`'s import becomes `./prompts`; `:51-58`'s richest fallback becomes `unionAreaNames(results)`; `unionAreaNames` exported; `:9-12`'s header rewritten (RES-FILL-9) | 106 | `-le 140` (design) |
| `src/lib/grade/reconcile.test.ts` | **owned, EXPECTED TO CHANGE.** The frozen literal is RE-CAPTURED BY RUNNING IT; a direct `unionAreaNames` case; the `:118-124` comment rewritten (RES-FILL-12) | 217 | `-le 330` (design) |
| `src/lib/module-graph/runtime-import-graph.test.ts` | **owned, EXPECTED TO CHANGE.** `:674`'s trail deleted; `:638-656`'s prose rewritten (RES-FILL-1) | 772 | **`-le 800` (MINE** - the design bounds this file at nothing; derived from 772 plus a prose rewrite. RES-P-7) |
| `src/lib/grade/extraction.ts` | **S0 ONLY: mutated and RESTORED, net zero.** It is in the write set because S0 touches it, and `git status --short` must show it clean at the gate | 353 | unchanged at 353 |

**Owned read-only, with each one's direction of failure:**

| Path | Direction of failure |
|---|---|
| `src/lib/grade/engine.ungraded.test.ts` | `:120` is `expect(row.rubricAreas).toHaveLength(run.rubricAreaNames.length)` and `:241` is `expect(failed.rubricAreas.map((a) => a.area)).toEqual(run.rubricAreaNames)` - RELATIVE parity, not literals. RED if the union produces a name `reconcile.ts:76` does not push into every row. `grep -c "rubricAreas\|canonical\|rubricAreaNames"` -> 20 |
| `src/lib/grade/engine.test.ts` | `grep -c "rubricAreas\|canonical\|rubricAreaNames"` -> **0**, against a canary of 16 for `gradeSubmissions\|gradeEntries\|gradeCanvasUrl\|gradeStudentEntries`. It CANNOT see a column change, and is in the gate as a floor only |
| `src/app/api/grade-run-item/route.test.ts`, `src/lib/grade/collisionRefusal.wiring.test.ts`, `src/lib/grade/rubric-stamp.wiring.test.ts` | import `./engine`, so they execute the changed projection. RED if the fallback throws or reshapes a row |
| `src/app/components/grading-results/ungradedDisclosure.test.ts`, `src/lib/grade/grouping-zip-parents.wiring.test.ts` | source-text readers of `grade/engine.ts` |
| `src/lib/canvas-client-boundary.runtime-graph.test.ts` | F14's instrument, a FLOOR in this wave: no client leaf imports `reconcile` yet. It goes live in W5 |
| `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`, `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` | the two PLANTED POSITIVES over the `src/lib/grade.ts` barrel (`violations.length > 0`). RED if the import move somehow REMOVED the barrel's supabase reach - it cannot, since the barrel re-exports `rubric.ts` directly, but a silently disarmed canary in two other files is what this row exists to prevent |

**STEP S0 - THE M2 MUTATION. IT RUNS BEFORE THE FIRST LINE OF W1'S OWN EDIT, AND
BEFORE ANY OTHER LINE OF CODE IN THE WHOLE ITEM.**

Design section 11's preamble requires it, and W1 owns it because W1 is the wave
whose write set holds the file whose CONTENT the answer decides.

1. `cp src/lib/grade/extraction.ts <backup>` - a copy, never `git checkout --`,
   which reverts to the index and destroys uncommitted work.
2. Add `import { inferFileNameConvention } from "./rubric";` to `extraction.ts`
   **ABOVE** `:8`'s `../canvas` import.
3. `npx vitest run src/lib/module-graph/runtime-import-graph.test.ts` - a single
   path, so a bare `vitest run` is legitimate. Read the exit code from the
   command, never through a pipe. **Design 6.7 predicts RED**: `:665`'s trail
   string shortens to
   `"lib/grade/engine.ts -> lib/grade/rubric.ts -> lib/research/rubric-bank.ts -> lib/research/db.ts"`
   and the deep-equal at `:703` (`expect(trails).toEqual(FROZEN_TRAILS)`, opened)
   fails.
4. Move the import BELOW `:8`. Run it again. **Design 6.7 predicts GREEN.**
5. Restore `extraction.ts` from the backup. Prove it with `git status --short`.
6. **Record both outcomes in the commit message.**

**Both runs are required, and the reason is what happens if the prediction is
wrong.** Design 6.7 derives the answer from `walkRuntimeGraph`'s own code and
states plainly that it "turns on `scan.edges` being in AST source order, which I
read from `scanRuntimeEdges` rather than measured". If the walker surprises us, a
`FROZEN_TRAILS` ADDITION is owed - and W1 is the wave that can land it in the
same edit as the `:674` deletion. Learned at W4's gate instead, it reopens a file
W1 has already closed.

**STEP S1 - the import move, and the frozen oracle seen RED before it is
touched.** The order inside this step is not negotiable:

1. Change `reconcile.ts:51-58` to `if (canonical.length === 0) canonical = unionAreaNames(results);`
   and add `unionAreaNames`. Change `:20` to `import { normalizeAreaName } from "./prompts";`.
2. **Run `npx vitest run src/lib/grade/reconcile.test.ts` and WATCH IT GO RED,
   BEFORE THE LITERAL IS TOUCHED.** The literal is reachable: the case at `:53`
   drives `gradeEntries` from `./engine` with `@/lib/llm`'s `callLlm` mocked
   (`:21-23`), so it runs offline. `:136` is `const FROZEN_AREA_NAMES = ["Clarity", "Grammar"];`
   and the fixture is exactly the unparseable-rubric two-students-disagreeing
   case. Opened and confirmed.
3. RE-CAPTURE the literal by reading the RECEIVED value out of the failure
   output. Paste it. **State the command in the commit message.**
4. Design 6.5 predicts `FROZEN_AREA_NAMES = ["Clarity","Grammar","Structure"]`,
   Bob gaining `{area:"Structure",score:"6/10",comment:""}` and Alice gaining
   `{area:"Structure",score:"",comment:""}`. **A MISMATCH IS INFORMATIVE AND MUST
   BE REPORTED, NOT ACCOMMODATED.** The prediction is written down so a
   difference is a finding.

**PRICE OF DOING IT IN ONE EDIT INSTEAD: a literal updated in the same edit as
the implementation is a fitted oracle, which is indistinguishable from a
hand-predicted one that happens to pass. This repo's recorded disarming failure
is exactly that, and it is why the RED run is a step and not a note.**

**STEP S2 - the three comment obligations, in the same commit.** Each is a
statement that becomes FALSE, and a frozen list beside a comment claiming an
invariant it no longer has is how a silenced guard becomes invisible:

- `reconcile.ts:9-12` says "Imports only ./types and ./rubric ... reconcileRun
  must stay a pure leaf". Rewrite to name `./prompts` and the reason (design
  6.4). **RES-FILL-9.**
- `reconcile.ts:14-17` and `reconcile.test.ts`'s header both assert W4-1's
  byte-identity invariant unconditionally. Rewrite both to say it holds for the
  parseable-criteria case and is deliberately superseded for the fallback case,
  naming RULING 134. `reconcile.test.ts:118-124` is Bob's own inline comment
  explaining why `"Structure"` is absent - it becomes false and is rewritten
  too. **RES-FILL-12.**
- `runtime-import-graph.test.ts:638-656` is wrong in three numbers already and
  `:644-646` calls the reconcile edge "an eleventh direct edge". Rewrite both
  blocks. **RES-FILL-1.**

`docs/a39-waves.md:1651`'s `-le 250` claim also becomes false. **This plan does
not write that file**; RES-FILL-9's step says the same commit appends a dated
line there, and I flag that as a fourth write-set path W1's brief must either
grant or decline in writing.

**Changed lines, derived:**

| Piece | Lines |
|---|---|
| `reconcile.ts`: `:51-58` (8) becomes 1 | -7 |
| `reconcile.ts`: `unionAreaNames` body plus its 8-line doc comment | +18 |
| `reconcile.ts`: `:9-12` and `:14-17` rewritten | +2 |
| `reconcile.ts`: `:20` in place | 0 (1 touched) |
| **`reconcile.ts` net: 106 -> about 119**, against `-le 140` | **+13** |
| `reconcile.test.ts`: two area entries in `FROZEN_RESULTS`, one per row | +2 |
| `reconcile.test.ts`: `:118-124` and the header rewritten, plus a provenance line naming the re-capture command | +4 |
| `reconcile.test.ts`: a direct `unionAreaNames` case | +28 |
| **`reconcile.test.ts` net: 217 -> about 251**, against `-le 330` | **+34** |
| `runtime-import-graph.test.ts`: delete `:674`, rewrite the prose | +2 (772 -> about 774) |
| **DERIVED-TEST REPAIR TERM** | **+0 to +10** |
| **Total touched** | **about 65 to 75** |

**The repair term, named rather than reserved.** `reconcile.test.ts` already mocks
`../gemini`, `../llm` and `../code-runner` (`:14-27`), so the new case needs no
new mock. The one real exposure is `engine.ungraded.test.ts:120` / `:241`, whose
parity assertions are relative and hold under `reconcile.ts:76`'s blank-cell
push. If they move, it is a finding about the union, not a mock repair. The term
is small HERE; it is not small in W2 and W4, and it is priced there.

**Gate:**

```powershell
npm run test:paths -- src/lib/grade/reconcile.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/lib/grade/engine.test.ts src/lib/grade/engine.ungraded.test.ts src/app/api/grade-run-item/route.test.ts src/lib/grade/collisionRefusal.wiring.test.ts src/lib/grade/rubric-stamp.wiring.test.ts src/app/components/grading-results/ungradedDisclosure.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts src/lib/canvas-client-boundary.runtime-graph.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
npm test
npx tsc --noEmit --incremental false
npm run lint
@(Get-Content src/lib/grade/reconcile.ts).Count
@(Get-Content src/lib/grade/reconcile.test.ts).Count
@(Get-Content src/lib/module-graph/runtime-import-graph.test.ts).Count
git status --short
```
```
wc -l < src/lib/grade/reconcile.ts
wc -l < src/lib/grade/reconcile.test.ts
wc -l < src/lib/module-graph/runtime-import-graph.test.ts
```

PASS: every argument `COVERED`, exit 0; `npm test` zero failed; `tsc` silent;
lint exit 0 with no new warning in the three written files; `reconcile.ts <= 140`,
`reconcile.test.ts <= 330`, `runtime-import-graph.test.ts <= 800`, all on BOTH
counters; `git status --short` shows exactly the three written files and
**`extraction.ts` ABSENT**, which is S0's restore proof.

---

### W2 - The run header, and its whole-run caller

**GOAL: RULING 133. One owner for the blank-instructions refusal and the
effective rubric, and `grading.ts` back under its recorded gate.**

**Write set:**

| Path | Role | Now | Bound |
|---|---|---|---|
| `src/lib/grade/types.ts` | **edit.** `GradingRunHeader` only. `GradingRunTier2` lands in W5, with its first consumer | 432 | **`-le 460` (MINE**, a per-wave floor under the design's item-wide `-le 470`) |
| `src/lib/grade/run-header.ts` | **new.** `resolveRunHeader`, SERVER-ONLY | 0 | `-le 140` (design) |
| `src/lib/grade/run-header.test.ts` | **new.** F1, F2, F3 | 0 | `-le 300` (design) |
| `src/app/actions/grading.ts` | **edit, THE CALLER.** Both blank-instructions returns and the `effectiveRubric` block become `resolveRunHeader` calls | **946** | **`-le 941`** (design 9.4, RULING 133) |
| `src/app/actions/grading.guard.test.ts` | **owned, EXPECTED TO CHANGE.** F26's host; it becomes a source-text reader (1.2) | 413 | `-le 440` (MINE) |
| `src/lib/grade/rubric-provenance-stamp.ts` | **edit, COMMENT ONLY.** `:1-18` enumerates every `stampRubricProvenance` caller; `run-header.ts` makes it seven. RES-FILL-6's step | - | comment only |

**Owned read-only:** `grading.budget.test.ts`, `grading.collisionRefusal.test.ts`,
`grading-checklist.test.ts` (all import `./grading`);
`action-guard-coverage.test.ts` and `action-guard-coverage-github-cohort.test.ts`
(the `"use server"` export ratchet); `grading-missing-submissions.test.ts`,
`grading-run-mapping.test.ts`, `src/lib/grade/postable.test.ts` (source-text
readers of `actions/grading.ts`); `src/lib/grade-result-allowlist-coverage.test.ts`
and `src/app/actions/grading-submission-grade.test.ts` (the two key-set gates of
1.4 - **RED if the header's fields are put on `GradeResult` or `GradingRun`
instead of a new interface**); `src/lib/grade/rubric-stamp.wiring.test.ts` (it
asserts `gradeEntries`'s stamping BEHAVIOUR at `:72-73`, not the call-site set,
so a seventh caller is invisible to it - which is exactly why RES-FILL-6's
comment update is an obligation and not housekeeping);
`src/lib/use-server-exports.test.ts`; `src/lib/module-graph/runtime-import-graph.test.ts`
(its R-9 block at `:392-401` uses `src/lib/grade/types.ts` as a walk root and
asserts more than 50 violations with the `"use server"` wall removed - a
type-only addition adds no value edge, so **RED only if the addition somehow
removed the closure's supabase reach**).

**RULED: `run-header.ts` gets NO `src/lib/grade.ts` barrel re-export, and
`grading.ts` imports it by deep path.** Three reasons, and the third is the
expensive one:

1. `docs/a39-waves.md` 10.1 already wrestled a barrel line with no importer in
   any wave and carried it as RES-W-15. Declining the line here removes the
   residual instead of inheriting it.
2. `run-header.ts` is SERVER-ONLY (it reaches `generateRubric` and thence
   `lib/supabase`). The `grade.ts` barrel has 52 importers, some client-reachable.
3. **`src/app/actions/grading.guard.test.ts:93-104` is an EXHAUSTIVE FACTORY MOCK
   of `@/lib/grade` listing exactly ten exports** (opened). A barrel import of
   `resolveRunHeader` would be `undefined` inside that file and every case in it
   would throw. A deep-path import leaves the factory untouched.

**The mock-repair term, measured and mechanistic - this is the term the prior
plan lacked.** `grading.ts:4` imports `generateRubric` from `@/lib/grade`, and
`grading.guard.test.ts:93-104`'s factory stubs it. After W2, `generateRubric` is
called by `run-header.ts` from `./rubric`, which that factory does NOT cover, and
`grading.guard.test.ts` mocks neither `@/lib/llm` nor `@/lib/grade/rubric`
(`grep -n "vi.mock("` over it returns sixteen mocks, none of them those two).
So any case in that file reaching the zip-Gemini branch with a BLANK rubric would
call the real `generateRubric` -> `callLlm` -> the `fetch` stub in
`vitest.setup.ts`, which throws.

**That failure is LOUD, not silent, which is why it is priced rather than
feared:** the fix is one added `vi.mock("@/lib/grade/run-header", ...)`, about
+8 lines. The Canvas path is already safe -
`grading.guard.test.ts:271` sets `rubricText: ""` but the Canvas branch passes
`synthesizeRubricWhenBlank: false`, so `resolveRunHeader` runs
`extractRubricCriteria` (pure, `rubric.ts:27`) and `stampRubricProvenance`
(crypto) and makes no model call. **Term: +0 to +12.**

**Two implementation hazards this wave's brief must carry, neither of which is a
design change:**

- **Do NOT destructure `generatedRubric` on the Canvas branch.** It is unused
  there and `@typescript-eslint/no-unused-vars` is an error in this repo. Design
  9.4's Canvas arithmetic is "+2 lines, the same two" - the `resolveRunHeader`
  call and the refusal return - with `:820-822`'s three `rubric` arguments edited
  in place to `effectiveRubric` at 0 net.
- **Do NOT name `rubricUsed` or `rubricFingerprint` in a `grading.ts` comment.**
  F26's pass is a count of ZERO over an UNSTRIPPED read, so a comment turns it
  RED. The reason `gradeAction` must not apply them belongs in `run-header.ts`'s
  doc comment (design 16 item 11).

**Changed lines, derived:**

| Piece | Lines |
|---|---|
| `types.ts`: the 9-line discriminated union plus a 6-line doc comment | +15 (432 -> 447) |
| `run-header.ts`: new | +100 to +140 |
| `run-header.test.ts`: F1's four cases, F2's two strings plus the not-called assertion, F3 | +200 to +300 |
| `grading.ts` zip: remove `:886-888` (3) and `:890-893` (4); add 3 | -4 |
| `grading.ts` Canvas: remove `:814-816` (3); add 2; `:820-822` in place | -1 |
| **`grading.ts` net: 946 -> 941** on both counters, 18 lines touched | **-5** |
| `grading.guard.test.ts`: F26's reader, assertion and canary | +14 |
| `rubric-provenance-stamp.ts`: the caller enumeration | +2 |
| **MOCK-REPAIR TERM** (the factory-mock gap above) | **+0 to +12** |
| **Total touched** | **about 340 to 490** |

Every removed and added line above was verified by opening: `sed -n '812,824p'`
and `sed -n '884,896p' src/app/actions/grading.ts` show the Canvas refusal at
`:814-816`, the "No rubric synthesis on the Canvas path" comment at `:817-818`,
the `Promise.all` at `:819-823`, the `// Gemini path.` comment at `:885`, the zip
refusal at `:886-888` and the `effectiveRubric`/`generatedRubric` block at
`:890-893`.

**THIS IS THE WAVE THAT CLEARS THE OVERRUN.** `src/app/actions/grading.ts` is
**946 on both counters today**, against `docs/a39-waves.md:1038`'s `-le 945` and
`docs/BACKLOG.md`'s RES-W-7, whose stated failure direction is "greater than 945
at any wave gate". **The file is already ONE LINE over a recorded gate before
this item writes anything**; `2f06261` put it there and could not have known.
Consequences, and all three are obligations:

- **W1's gate inherits the overrun and it is not W1's fault.** W1 does not touch
  `grading.ts`, so W1's brief states the 946 explicitly and attributes it to
  `2f06261`. The same applies to any wave gating before W2.
- **The item's pre-change baseline records 946 on both counters, before W1's
  first edit**, so the number is attributable rather than discovered.
- **`-le 941` CLEARS RES-W-7 rather than merely not worsening it.** RES-FILL-8
  carries the reconciliation, and it is owed to `docs/BACKLOG.md`, which this
  plan does not write.

**Gate:**

```powershell
npm run test:paths -- src/lib/grade/run-header.test.ts src/app/actions/grading.guard.test.ts src/app/actions/grading.budget.test.ts src/app/actions/grading.collisionRefusal.test.ts src/app/actions/grading-checklist.test.ts src/app/actions/action-guard-coverage.test.ts src/app/actions/action-guard-coverage-github-cohort.test.ts src/app/actions/grading-missing-submissions.test.ts src/app/actions/grading-run-mapping.test.ts src/app/actions/grading-submission-grade.test.ts src/lib/grade/postable.test.ts src/lib/grade-result-allowlist-coverage.test.ts src/lib/grade/rubric-stamp.wiring.test.ts src/lib/use-server-exports.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
npm test
npx tsc --noEmit --incremental false
npm run lint
npm run build
@(Get-Content src/app/actions/grading.ts).Count
@(Get-Content src/lib/grade/types.ts).Count
@(Get-Content src/lib/grade/run-header.ts).Count
@(Get-Content src/lib/grade/run-header.test.ts).Count
@(Get-Content src/app/actions/grading.guard.test.ts).Count
git status --short
```
```
wc -l < src/app/actions/grading.ts
```

PASS: every argument `COVERED`, exit 0; `npm test` zero failed; `tsc` silent;
lint exit 0 with no new warning in the written files; `npm run build` prints
`Compiled successfully` (grep for the line, do NOT `&&` on it - the prerender
tail exits 1 for want of `.env` and the page it names varies between runs);
**`grading.ts` at or under 941 on BOTH counters**; F26's count still 0.

**WATCHED, and the wave does not land without it:** write F26's assertion FIRST,
against the unchanged `grading.ts`, and see it PASS at 0. Then apply the design's
named mutation - destructure `rubricUsed` from the header in either branch - and
see it go RED. A zero-expectation that has never been seen red is a check nobody
has proven discriminates.

---

### W3 - The run IDENTITY (RULING 131)

**GOAL: `GradingResults` distinguishes "a new run" from "the same run, one row
longer". Behaviour on landing: none, for any existing caller.**

**Write set:**

| Path | Role | Now | Bound |
|---|---|---|---|
| `src/app/components/grading-results/gradingResultsHelpers.ts` | **edit.** `runResetKey` exported | 728 | `-le 745` (design) |
| `src/app/components/grading-results/gradingResultsHelpers.test.ts` | **edit.** F9 clause 1 | 561 | `-le 640` (design) |
| `src/app/components/GradingResults.tsx` | **edit, RULING 131.** The reset TRIGGER only; the seven resets are untouched | **906** | **`-le 920`** (design) |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **owned, EXPECTED TO CHANGE.** F9 clause 2 | **349** (not 393) | `-le 400` (MINE, a per-wave floor under the design's `-le 620`) |

**`GradingResults.tsx` AFTER THIS WAVE: 909 lines, on both counters, against the
repo ceiling of 1000 and the design's `-le 920`.** Derived from the design's 5.7
block: +1 for the `runKey?: string;` prop declaration and about +4 for its doc
comment, +1 for `const identity = runResetKey(runKey, run);`, and three in-place
replacements at `:204`, `:220` and `:221` at 0 net - the design prices it at
"about +3 net". 906 + 3 = 909, leaving 91 lines of headroom.
`src/file-size-ceiling.structure.test.ts`'s `ALLOWED_OVERAGE` (`:75-92`, four
entries, opened) does NOT list this file, so no ratchet pins it at 906 and the
growth is legal.

**A fact that makes this wave cheaper than it looks.** `GradingResults.tsx:39`
already ends an import block with `} from "./grading-results/gradingResultsHelpers";`
- so `runResetKey` joins an EXISTING import statement and the module graph does
not change at all. No new edge, nothing for
`runtime-import-graph.test.ts` or `canvas-client-boundary.runtime-graph.test.ts`
to see.

**Owned read-only:** the source-text and import readers of `GradingResults.tsx`
and `gradingResultsHelpers` - `gradingResultsDisplayHelpers.test.ts`,
`gradingResultsExtraction.wiring.test.ts`,
`gradingResultsHelpersEditState.test.ts`, `gradingResultsHelpersWiring.test.ts`,
`gradingResultsPostOutcome.test.ts`, `rubricProvenanceLeaf.test.ts`,
`sortGradeRows.test.ts`, `ungradedDisclosure.test.ts`, `ungradedRowLabel.test.ts`,
`repoGrades.wiring.test.ts`, `repoGradesCellEdits.test.ts`,
`repoGradesFeedbackAndFiles.wiring.test.ts`, `rubricBreakdownPercent.wiring.test.ts`,
`modalAdoption.wiring.test.ts`, `canvas/grades.test.ts`, `grade/extraction.test.ts`,
`grade/postable.test.ts`, `grade/utils.test.ts`,
`canvas-client-boundary.runtime-graph.test.ts`,
`module-graph/runtime-import-graph.test.ts`. Three of those are prose-only
matches (1.3) and are kept in the GATE because a superset gate costs runtime, not
correctness - they are pruned only from the intersected sets in section 5.

**WATCHED failures, both from the design's F9 row:**

- F9 clause 1, in `gradingResultsHelpers.test.ts`: `runResetKey("incremental-7", runA) === runResetKey("incremental-7", runB)`
  for two DIFFERENT objects, and `runResetKey(undefined, runA) !== runResetKey(undefined, runB)`.
  Mutations: `return run` makes the same-key clause red; `return runKey` collapses
  two whole-run runs to one identity and makes the `undefined` clause red. **Both
  mutations must be applied and both reds seen.**
- F9 clause 2, in `autoGradeTransition.wiring.test.ts` over `GradingResults.tsx`
  source: `runResetKey(` appears exactly once, and the file contains no
  `run !== prevRun`. **Write it FIRST against today's unchanged file and see BOTH
  clauses go red** - `runResetKey(` at 0 and `run !== prevRun` present at `:220`.
  That is what proves the assertion is reading the file it claims to.

**A constraint on how clause 2 is written, from the harness's own source.**
`autoGradeTransition.wiring.test.ts:99-100` is
`const gtSource = stripComments(readFileSync(GRADING_TAB_PATH, "utf8"));` and
`lfSource = stripComments(...)`. Both existing readers STRIP COMMENTS, and
neither reads `GradingResults.tsx`. So clause 2 adds a THIRD reader for that
file. **It must strip comments too**, or the `run !== prevRun` clause can be
satisfied or broken by a comment; and the existing `stripComments` helper is
already in the file, so this costs one line, not a new helper.

**Changed lines, derived:**

| Piece | Lines |
|---|---|
| `gradingResultsHelpers.ts`: `runResetKey` plus its 5-line doc comment (the design's own block) | +8 (728 -> 736) |
| `gradingResultsHelpers.test.ts`: F9 clause 1, four assertions plus two mutation notes | +22 (561 -> about 583) |
| `GradingResults.tsx`: 7 lines touched, 3 net | +3 (906 -> **909**) |
| `autoGradeTransition.wiring.test.ts`: the third source reader plus F9 clause 2 | +16 (349 -> about 365) |
| **MOCK-REPAIR TERM** | **+0.** `runResetKey` is pure and clause 2 is source-text. Nothing in this wave executes a mocked module |
| **Total touched** | **about 53** |

**Gate:**

```powershell
npm run test:paths -- src/app/components/grading-results/gradingResultsHelpers.test.ts src/app/components/autoGradeTransition.wiring.test.ts src/app/components/grading-results/gradingResultsDisplayHelpers.test.ts src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts src/app/components/grading-results/gradingResultsHelpersEditState.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/app/components/grading-results/gradingResultsPostOutcome.test.ts src/app/components/grading-results/rubricProvenanceLeaf.test.ts src/app/components/grading-results/sortGradeRows.test.ts src/app/components/grading-results/ungradedDisclosure.test.ts src/app/components/grading-results/ungradedRowLabel.test.ts src/app/components/repo-grades/repoGrades.wiring.test.ts src/app/components/repo-grades/repoGradesCellEdits.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/rubricBreakdownPercent.wiring.test.ts src/app/components/ui/modalAdoption.wiring.test.ts src/lib/canvas/grades.test.ts src/lib/grade/extraction.test.ts src/lib/grade/postable.test.ts src/lib/grade/utils.test.ts src/lib/canvas-client-boundary.runtime-graph.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
npm test
npx tsc --noEmit --incremental false
npm run lint
@(Get-Content src/app/components/GradingResults.tsx).Count
@(Get-Content src/app/components/grading-results/gradingResultsHelpers.ts).Count
@(Get-Content src/app/components/grading-results/gradingResultsHelpers.test.ts).Count
@(Get-Content src/app/components/autoGradeTransition.wiring.test.ts).Count
git status --short
```
```
wc -l < src/app/components/GradingResults.tsx
```

PASS: every argument `COVERED`, exit 0; `npm test` zero failed; `tsc` silent;
**`GradingResults.tsx` at 909 and at or under 920 on BOTH counters**;
`gradingResultsHelpers.ts <= 745`; `autoGradeTransition.wiring.test.ts <= 400`.

**What this wave does NOT prove.** Design owner-walk item 7 - "an arriving row
does not disturb in-progress work on an earlier row" - is the behavioural half,
and nothing in this repo can see it. F9 pins the guard's SHAPE. The behaviour is
W7's Group B.

---

### W4 - Tier 1: the prep resolves the run

**GOAL: the incremental route derives student names the way the route beside it
does, and a best-effort deep link can no longer demote the whole route.**

**Write set:**

| Path | Role | Now | Bound |
|---|---|---|---|
| `src/app/actions/grading-incremental.ts` | **edit.** Tier 1's seven steps in order; the header on the result | 141 | **`-le 200` (MINE**, under the design's item-wide `-le 260`) |
| `src/app/actions/grading-incremental.test.ts` | **edit.** F24, the tier-1 cases | 189 | **`-le 300` (MINE**, under `-le 420`) |
| `src/lib/grade/extraction.ts` | **edit.** The optional `inferFileNamesWith`; the new `./rubric` import **AFTER `:8`'s `../canvas`**; `:130-134`'s contract comment rewritten (RES-FILL-10) | 353 | `-le 385` (design) |
| `src/lib/grade/extraction.test.ts` | **owned, EXPECTED TO CHANGE.** The inference case | 330 | `-le 380` (MINE) |

**Owned read-only:** `grading.guard.test.ts`, `grading.budget.test.ts`,
`grading.collisionRefusal.test.ts`, `collisionRefusal.wiring.test.ts`,
`grouping-zip-parents.wiring.test.ts` (all real readers of
`extractStudentEntries` or `extraction.ts`); `action-guard-coverage.test.ts` and
`action-guard-coverage-github-cohort.test.ts`;
`gradingResultsHelpersEditState.test.ts` (`:27` imports
`disambiguateCanvasEntries` from `lib/grade/extraction` - a genuine reader);
`useIncrementalGradingRun.lifecycle.test.ts` (source-text reader of
`grading-incremental`); `src/lib/module-graph/runtime-import-graph.test.ts`
(**F15 clause 3's instrument: the deep-equal at `:703` over `FROZEN_TRAILS`, and
the constraint is that the new `./rubric` import sits at a line number GREATER
than `:8`'s `../canvas`. Verified `:665` is exactly the trail design 6.7
predicts shortening**); `src/lib/office-edit.test.ts` (prose-only, kept in the
gate).

**The order inside `extractStudentEntries` is preserved and it is load-bearing.**
`extraction.ts:145-148` puts `decideCollisionRefusal` strictly before
`groupSubmissionsByStudent` at `:149`; the inference is inserted BETWEEN them, so
the refusal still fires first and a colliding zip pays no model call. Opened and
confirmed.

**The mock-repair term, measured - and the measurement made it SMALLER than
feared, while surfacing something worse.** `grading-incremental.test.ts:13-16`
mocks `@/lib/llm` as `{ ...actual, callLlm: vi.fn() }`, so `callLlm` resolves
`undefined`. Tier 1 now calls `inferFileNameConvention` on every zip case. Read
its body at `rubric.ts:209-240`: it wraps the call in `try { ... } catch { return
fallback; }` and returns `fallback` on `!result.ok`. `undefined.ok` throws, the
catch absorbs it, and the fallback is an empty lookup. **So all eight existing
`it(` blocks in that file stay GREEN with no repair** (`grep -c "  it("` -> 8).

**What that same reading exposes is a gap in the design, not in the wave.**
`inferFileNameConvention` fails SILENTLY to an empty lookup, which is exactly the
state design item #9 exists to fix. So a broken or unmocked inference is
indistinguishable from a working one at the level of any assertion the design
names. **Design item #9 has NO F-number in section 11's table, and its only
in-repo evidence is the Group A item 8 REACHABILITY greps plus
`extraction.test.ts`.** For the one finding in the whole design whose failure
mode is a wrong grade on a named student, reachability is not effect. I do not
invent an instrument for it - **RES-P-3** routes it with an owner and a step.

What IS repaired here: **F24 needs a Canvas fixture, and there is none today.**
Every existing case sets `studentSubmissions` (the zip path,
`grading-incremental.test.ts:34-45`). `getSpeedGraderUrl` is defined at
`src/lib/canvas/metadata.ts:239` and reached through `@/lib/canvas`, which that
file does not mock. So F24 costs a new `vi.mock` block plus a Canvas `FormData`
fixture. **Term: +15 to +25 lines.**

**Changed lines, derived:**

| Piece | Lines |
|---|---|
| `grading-incremental.ts`: blank-instructions refusal before the `try` | +3 |
| `grading-incremental.ts`: `resolveRunHeader` plus the `kind === "refused"` branch | +3 |
| `grading-incremental.ts`: the header onto the returned `plan` | +2 |
| `grading-incremental.ts`: `inferFileNamesWith` at `:91` | +1 |
| `grading-incremental.ts`: `:71`'s bare `await extractCanvasEntries` becomes a `Promise.all` with `getSpeedGraderUrl(canvasUrl).catch(() => null)`, plus `speedGraderUrl` onto the plan | +3 |
| **`grading-incremental.ts` net: 141 -> about 153**, against `-le 200` | **+12** |
| `grading-incremental.test.ts`: F24 plus the tier-1 cases | +65 |
| `extraction.ts`: import (1), option signature (4), the inference call (5), `:130-134` rewritten (2) | +12 (353 -> about 365) |
| `extraction.test.ts`: the inference case | +25 (330 -> about 355) |
| **MOCK-REPAIR / NEW-FIXTURE TERM** (F24's Canvas mock and fixture) | **+15 to +25** |
| **Total touched** | **about 130 to 140** |

**F24's watched failure, from the design's own row.** Stub `getSpeedGraderUrl` to
REJECT on a Canvas fixture. **Without the `.catch(() => null)`**, the rejection
lands at `grading-incremental.ts:117`, fails the
`message.startsWith(REFUSAL_MESSAGE_PREFIX)` test at `:136` (the prefix is
`"Refused: "`, `:42`) and returns `{ mode: "whole-run" }` at `:139` - and
`startReview` answers `mode: "whole-run"` by calling `submitWholeRun(fd)` and
never reading `prepared.reason`. **This is the one defect in the design whose
symptom is total silence**, so the red must be seen before the `.catch` is added.
The spelling is byte-for-byte `grading.ts:748`'s, opened:
`const speedGraderUrl = await getSpeedGraderUrl(canvasUrl).catch(() => null);`
with its comment at `:746-747`.

**Gate:**

```powershell
npm run test:paths -- src/app/actions/grading-incremental.test.ts src/lib/grade/extraction.test.ts src/lib/grade/collisionRefusal.wiring.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts src/app/actions/grading.guard.test.ts src/app/actions/grading.budget.test.ts src/app/actions/grading.collisionRefusal.test.ts src/app/actions/action-guard-coverage.test.ts src/app/actions/action-guard-coverage-github-cohort.test.ts src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts src/app/components/grading-results/gradingResultsHelpersEditState.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/lib/office-edit.test.ts src/lib/use-server-exports.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
npm test
npx tsc --noEmit --incremental false
npm run lint
@(Get-Content src/app/actions/grading-incremental.ts).Count
@(Get-Content src/lib/grade/extraction.ts).Count
git status --short
```

Plus the two reachability greps design section 15 Group A item 8 names, run at
the gate and pasted:

```
grep -n "inferFileNamesWith\|inferFileNameConvention" src/app/actions/grading-incremental.ts src/lib/grade/extraction.ts
grep -c "inferFileNamesWith" src/app/actions/grading.ts     # must be 0 - the Embedded path never passes it
grep -n "import.*from \"./rubric\"" src/lib/grade/extraction.ts   # the line number must be GREATER than :8
```

PASS: every argument `COVERED`, exit 0; `npm test` zero failed; `tsc` silent;
`grading-incremental.ts <= 200`, `extraction.ts <= 385`, both counters; the
`./rubric` import below `:8`; `grep -c "inferFileNamesWith" src/app/actions/grading.ts`
-> 0.

---

### W5 - One machine, one mount, one door. ONE COMMIT, SIX ORDERED STEPS

**GOAL: two objects and two renderers become one object and one mount, with one
phase, one door and one identity. This is the irreducible core (3.1).**

**Write set:**

| Path | Role | Now | Bound |
|---|---|---|---|
| `src/lib/grade/types.ts` | **edit.** `GradingRunTier2`, landing with its first consumer | 447 after W2 | `-le 470` (design) |
| `src/app/components/grading/incrementalRunPlan.ts` | **edit.** Six pure functions plus `IncrementalPhase` and `isTerminal` | 199 | `-le 300` (design) - **TIGHT, see below** |
| `src/app/components/grading/incrementalRunPlan.test.ts` | **edit.** F7, F8, F12, F19, F20, F21, F22 | 193 | `-le 560` (design) |
| `src/app/components/grading/useIncrementalGradingRun.ts` | **edit.** The phase machine, `beginWholeRun`, `arrivedRef`, `runIdRef`, `rebuild()` | 192 | **`-le 280` (MINE**, under the design's `-le 300`) |
| `src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts` | **edit.** F4 and the phase cases | 393 | **`-le 560` (MINE**, under `-le 620`) |
| `src/app/components/GradingTab.tsx` | **edit, THE CALLER.** One mount, one door, the terminal region, the empty-state call, `runKey`, the scroll dependency | 620 | `-le 620` (design) |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **owned, EXPECTED TO CHANGE.** A2 and A5 rewritten; F5, F6, F10, F11, F13, F25 | about 365 after W3 | `-le 620` (design) |

**NOT in the write set, stated because it would be a reasonable guess:**
`src/app/api/grade-run-item/route.ts`. Design section 8 item 3 keeps the whole
Route Handler untouched - its guard order, CSRF floor, `maxDuration`,
`TOTAL_BUDGET_MS` and `MAX_RUBRIC_CHARS` all stand, and the one change it would
have needed (echoing the provenance stamp it discards at `:187-188`) is made
unnecessary by putting provenance in the header.

**`incrementalRunPlan.ts`'s bound is the tightest number in this plan, and the
design names no cut for it.** Derived: `IncrementalPhase` (2), `isTerminal` (2),
`selectDisplayRun` (3), `selectRunKey` (3), `canonicalColumns` (10),
`buildIncrementalRun` (25), `describeRunProgress` (14), `shouldShowEmptyState`
(8), doc comments (about 25) - about +92, landing near **291 against `-le 300`.
Nine lines of headroom.** The design has an explicit posture for `GradingTab.tsx`
("if it lands above 620, the extraction is named and it is not a judgement call")
and no analogue here. Supplying one is a boundary decision, so:

**RULED, and NOT done speculatively: if `incrementalRunPlan.ts` exceeds 300 on
either counter at W5's gate, `describeRunProgress` and `shouldShowEmptyState`
move together into `src/app/components/grading/runProgressCopy.ts` with their own
test file, and `incrementalRunPlan.ts` re-exports neither** - `GradingTab.tsx`
imports the copy leaf directly, which keeps F12's and F13's instruments pointed
at one file. That cut is about -22 from the leaf and it is the right cut because
the two copy functions share no input with the other four. **An extraction taken
when it is not needed costs a new call site and a new file for nothing**, so it
is conditional. **RES-P-4** carries it.

**THE SIX STEPS. One commit. Each step's position is forced by the step before
it.**

**S1 - the pure leaf, with its own tests, watched red first.** Add
`IncrementalPhase`, `isTerminal`, `canonicalColumns`, `buildIncrementalRun`,
`selectDisplayRun`, `selectRunKey`, and `GradingRunTier2` in `types.ts`.
`buildIncrementalRun` takes `tier2` and is called with `null` until W6 - which is
not a dead parameter: it IS read as `tier2?.fullCreditChecklist ?? []`, and that
reproduces today's hardcoded `fullCreditChecklist: []` at `GradingTab.tsx:602`
exactly. F7 (24 rows), F8 (6 rows plus two stability clauses), F19, F20, F21,
F22 land here with the design's mutations, each seen red.

**F20 is the strongest thing in this step and it discriminates.** One arrived set
fed in two different arrival orders: (a) the TERMINAL `rubricAreaNames` deep-equal
across the two orders; (b) within each order, each intermediate
`rubricAreaNames` a PREFIX of the next. **One mutation per clause, in opposite
directions** - sort by `sourceIndex` during the run and (b) goes red; drop the
terminal normalisation and (a) goes red. Asserting both and checking neither is
the failure this shape avoids.

**F21 requires `arrivedRef` to hold RAW rows for the life of the run.**
`Object.freeze` the arrived array and each row (ES modules are strict, so a write
throws), call `buildIncrementalRun` twice with two different canonical sets, and
assert the second call's output deep-equals an independent first call. Design 6.3
traced the real mechanism: `parsing.ts:45` hardcodes `comment: ""` on every
model-parsed area, so `reconcile.ts:79`'s stray fold NEVER FIRES for these rows
and the loss is pure and silent - a dropped score, then a blank cell.

**S2 - the phase machine and the refs.** Replace the ad-hoc booleans with one
`phase` `useState`; add `arrivedRef` and `runIdRef`; keep `incrementalRunning` as
a DERIVED boolean `phase === "running" || phase === "stopping"`.

**Keeping that boolean is not cosmetic and I verified why.**
`autoGradeTransition.wiring.test.ts:336` is
`const progressIdx = gtSource.indexOf("incrementalRunning &&")` inside W4-8's
block at `:333-343` (opened), and `GradingTab.tsx:456`'s
`disabled={pending || incrementalRunning || ...}` is the Start Review guard. A
phase-literal guard turns W4-8 red for no gain.

**And the hook KEEPS returning `incrementalResults`.** Measured:
`grep -c "incrementalResults" src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts`
-> 3, at `:357` (the test name), `:376` and `:377`
(`expect(midRun.incrementalResults.length).toBe(1)` and `[0].student`). Removing
the field turns that case red for nothing; design Group A item 3 bans only the
`incrementalResults[0]` SAMPLE in `GradingTab.tsx`, not the field on the hook.
**This single reading is the whole of W5's derived-test repair term** - it is the
term the prior plan lacked, and here it is +0 if the field is kept and about +10
if it is not.

**The react budget is a constraint on hook KINDS, not counts.** The harness at
`useIncrementalGradingRun.lifecycle.test.ts:15-47` implements `useState` and
`useRef` over ONE shared slot array with a per-call cursor, and
`vi.mock("react", ...)` at `:44-47` supplies exactly those two - so a
`useEffect`, `useMemo` or `useCallback` would be `undefined` and THROW rather
than fail red. **That is an unread gate, not a red one**, which is why the
constraint is: `useIncrementalGradingRun.ts:19` stays exactly
`import { useRef, useState } from "react";`. The slot cursor advances across both
hooks positionally, so every new call must be UNCONDITIONAL and in a stable
order.

**S3 - ONE DOOR.** `beginWholeRun` resets the phase to `idle`, clears
`incrementalRun`, then calls the injected `submitWholeRun`.
`GradingTab.tsx:196-208`'s `handleAutoGrade` calls it in place of
`formAction(fd)` at `:206`, inside its existing `startTransition` so A3's
`setGradingTarget` stays put. Measured today:
`grep -n "formAction(" src/app/components/GradingTab.tsx` -> `:177` (a COMMENT
predicting the count), `:180`, `:206`. After S3: one.

**F10 and F11 are WATCHED and the order of watching is the point.** Change A5's
`:161` `expect(wholeFileMatches.length).toBe(2)` to 1 FIRST, against today's
unchanged file, and see it go RED at 2. Rewrite A2's second clause to
`beginWholeRun(` FIRST and see it go red on the presence clause **while A3's
`setGradingTarget` clause at `:138-150` stays GREEN** - that is what proves the
handler span is being found rather than the whole assertion failing for want of
an anchor.

**S4 - ONE MOUNT, and the guard pinned at repo scope.** Delete
`GradingTab.tsx:595-615` (-21). The surviving mount takes
`run={displayRun} runKey={runKey}`.

**S4 is where F6 lands, and F6 is the requirement whose absence lets the whole
defect return green.** Measured today, the set F6a pins:

```
grep -rn 'editsSurface' src --include=*.tsx | grep -v "\.test\."
  -> GithubGradingPanel.tsx:859   editsSurface="github"
     GradingResults.tsx:124 (declaration), :184 (destructure), :202, :222, :236 (reads), :237 (dep array)
     GradingTab.tsx:558            editsSurface="canvas"
     GradingTab.tsx:605            editsSurface="canvas"
     LiveFeedPanel.tsx:442         editsSurface="canvas"
```

After S4 exactly two files pass `editsSurface="canvas"`. **The mutation F6b
requires seeing red is: delete `source !== "livefeed" &&` from the surviving
mount's guard. TODAY NOTHING GOES RED ON THAT EDIT, and that is the whole
finding.**

**One correction to the design's pasted evidence, reported because it is
measured.** Design 5.2's `grep -rn "<GradingResults" src --include=*.tsx` output
lists six lines. Re-run here it returns SEVEN: it also matches
`src/app/components/LiveFeedPanel.tsx:143`,
`const resultsHandle = useRef<GradingResultsHandle>(null);`. Nothing built on it
is affected - F5's regex is `/<GradingResults(?=[\s/>])/g`, and the lookahead
exists precisely to exclude `<GradingResultsHandle>` - but the pasted set was
incomplete and F5's clause must be written with the lookahead, not a bare `\b`.

**S5 - the run-level copy, in its OWN region.** `describeRunProgress` and
`shouldShowEmptyState`, plus the terminal region as a sibling of
`GradingTab.tsx:472-478`, gated on the SENTENCE existing rather than on a row
existing. F12 (18 rows, total over all six phases) and F13 land here.

**S5 comes after S4 because F13's clause is positional**: the terminal region's
innermost enclosing brace span must contain no `results.length` and no
`<GradingResults`, and its index must PRECEDE the one `<GradingResults` match.
"The one match" does not exist until S4.

**Three things S5 must not break, each verified:** A6's `.some(...)` at `:183` is
an EXISTENTIAL over the `source !== "livefeed"` spans requiring at least one that
is conjunctive, `||`-free and carries both `styles.loadingState` and `pending` -
so the `pending` region at `:268-280` and the progress region at `:472-478` must
stay SEPARATE siblings, and the new terminal region carries neither literal so it
can neither satisfy nor break the clause. W4-8's two `indexOf`s must still
precede the mount. And W2-7 clause 2 (`rubricProvenanceLeaf.test.ts:93-101`, a
bare `indexOf("<GradingResults")`) is strengthened for free: "before the first"
becomes "before the only".

**S6 - the scroll trigger.** `GradingTab.tsx:212-216`'s dependency becomes
`[runResetKey(runKey, displayRun)]`, reusing W3's construction rather than
inventing a second one. F25 pins it. **The honest consequence, stated rather than
glossed: the incremental route still does not auto-scroll**, because at the
moment an incremental run's identity first appears `displayRun.results` is empty,
`:545`'s guard is false and `resultsRef.current` is null. That is exactly what it
does today. **RES-FILL-13.**

**`GradingTab.tsx` AFTER THIS WAVE: about 617, against `-le 620`.** Derived from
the design's section 10 table: -21 for the deleted mount, +4 destructure, +4
`displayRun`/`runKey`/`progressLine`/`terminalLine`, +5 terminal region, +1
`runKey={...}`, +1 `shouldShowEmptyState(...)`, +1 the generated-rubric read, +2
the scroll dependency, 0 for `handleAutoGrade`. **If it lands above 620 the
extraction is named and is not a judgement call:** `GradingTab.tsx:495-532`, the
`state.generatedRubric` `details` card, 38 lines, moves to
`src/app/components/grading-results/GeneratedRubricCard.tsx` and the call site is
one line, taking the file to about 580.

**Changed lines, derived:**

| Piece | Lines |
|---|---|
| `incrementalRunPlan.ts`: the eight additions above | +92 (199 -> about 291) |
| `incrementalRunPlan.test.ts`: F7, F8, F12, F19, F20, F21, F22 | +330 (193 -> about 523) |
| `useIncrementalGradingRun.ts`: phase, two refs, `beginWholeRun`, the transition table, `rebuild()`, the terminal normalisation | +70 (192 -> about 262) |
| `useIncrementalGradingRun.lifecycle.test.ts`: F4 plus the phase cases | +130 (393 -> about 523) |
| `GradingTab.tsx`: 24 lines touched, about -3 net | -3 (620 -> about **617**) |
| `autoGradeTransition.wiring.test.ts`: F5 (15), F6 three sub-clauses (50), F10 and F11 rewrites (4), F13 (20), F25 (12) | +101 (about 365 -> about 466) |
| `types.ts`: `GradingRunTier2` | +4 (447 -> 451) |
| **DERIVED-TEST REPAIR TERM** | **+0**, on the ruling above that the hook keeps `incrementalResults`; **+10** if it does not |
| **Total touched** | **about 750** |

**That is the largest wave in this plan by a distance, and it is deliberate.**
Section 3.1 disproves each of the four ways to make it smaller. The precedent is
`docs/a39-waves.md` 8.4.3, which shipped a new Route Handler, a new action, a new
plan leaf, a new hook, a `GradingTab.tsx` edit and four new test files as ONE
commit with five ordered steps, for the same reason: "Splitting 4c is the defect,
not the caution."

**Gate:**

```powershell
npm run test:paths -- src/app/components/grading/incrementalRunPlan.test.ts src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts src/app/components/autoGradeTransition.wiring.test.ts src/app/actions/grading-incremental.test.ts src/app/components/componentStorageKeys.structure.test.ts src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts src/app/components/grading-results/gradingResultsHelpersEditState.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/app/components/grading-results/rubricProvenanceLeaf.test.ts src/lib/canvas-client-boundary.runtime-graph.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/lib/grade-result-allowlist-coverage.test.ts src/app/actions/grading-submission-grade.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
npm test
npx tsc --noEmit --incremental false
npm run lint
@(Get-Content src/app/components/GradingTab.tsx).Count
@(Get-Content src/app/components/grading/incrementalRunPlan.ts).Count
@(Get-Content src/app/components/grading/incrementalRunPlan.test.ts).Count
@(Get-Content src/app/components/grading/useIncrementalGradingRun.ts).Count
@(Get-Content src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts).Count
@(Get-Content src/app/components/autoGradeTransition.wiring.test.ts).Count
git status --short
```
```
wc -l < src/app/components/GradingTab.tsx
wc -l < src/app/components/grading/incrementalRunPlan.ts
```

Plus these, from design section 15 Group A, run at the gate and pasted:

```
grep -c "incrementalResults\[0\]" src/app/components/GradingTab.tsx      # 0
grep -c "fullCreditChecklist: \[\]" src/app/components/GradingTab.tsx    # 0
grep -n "sectionRef=" src/app/components/GradingTab.tsx                  # exactly one, on the one mount
grep -n "normalizeAreaName" src/lib/grade/reconcile.ts                   # resolves to ./prompts (W1's)
grep -n "from \"react\"" src/app/components/grading/useIncrementalGradingRun.ts  # exactly useRef, useState
```

PASS: every argument `COVERED`, exit 0; `npm test` zero failed; `tsc` silent;
lint exit 0 with no new warning in the written files; **`GradingTab.tsx <= 620`
and `incrementalRunPlan.ts <= 300`, both counters** - and if the leaf exceeds
300, RES-P-4's conditional extraction lands in the same commit;
`canvas-client-boundary.runtime-graph.test.ts` GREEN, which is F14 going live -
it roots a walk at every `"use client"` entry point (`:16-35`) and
`useIncrementalGradingRun.ts:1` is `"use client"`, so **without W1's `:20` import
move this file is RED here**.

---

### W6 - Tier 2, the non-blocking half

**GOAL: the full-credit checklist and the sample answer arrive without ever
sitting on the critical path to row 1.**

**This is the design's own named cut.** Design 4.3: "If the owner wants the
fill's scope cut, TIER 2 IS THE CUT. It costs exactly the full-credit checklist
panel (`GradingResults.tsx:567-576`) and the sample-answer panel (`:578-592`) on
incremental runs, and nothing else." Making it a separate wave is what makes that
sentence executable. **Drop W6 and the incremental route shows what it shows
today** - W5 passes `tier2: null`, which yields `fullCreditChecklist: []`,
identical to `GradingTab.tsx:602` now. So W6 is purely additive and W5 is not a
regression without it.

**Write set:**

| Path | Role | Bound |
|---|---|---|
| `src/app/actions/grading-incremental.ts` | **edit.** `completeGradingRunHeaderAction`, a second `"use server"` export | `-le 260` (design) |
| `src/app/actions/grading-incremental.test.ts` | **edit.** The tier-2 action's own cases | `-le 420` (design) |
| `src/app/components/grading/useIncrementalGradingRun.ts` | **edit.** `tier2Ref`, `tier2StateRef`, the dispatch, the `.then`/`.catch` pair | `-le 300` (design) |
| `src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts` | **edit.** F16, F17, F18 | `-le 620` (design) |

**Owned read-only:** `action-guard-coverage.test.ts`,
`action-guard-coverage-github-cohort.test.ts`, `grading.guard.test.ts`,
`src/lib/use-server-exports.test.ts`, `src/lib/module-graph/runtime-import-graph.test.ts`,
`src/lib/grade-result-allowlist-coverage.test.ts`.

**The fast instrument for the new `"use server"` export is
`npx vitest run src/lib/use-server-exports.test.ts`, and `npm run build` is the
backstop, not the primary.** That file's header at `:1-13` states the class it
catches: "a build break that neither `tsc --noEmit` nor `vitest run` can see: a
`"use server"` module may export NOTHING but async functions ... this test exists
so the NEXT instance is caught by `vitest run`, in seconds, instead of by a
failed build."

**The three requirements, each with the design's mutation:**

- **F16** - tier 2 is dispatched on `mode: "incremental"` ONLY. Stub the action;
  assert called exactly once on the incremental path and zero times on each of
  `"refused"` and `"whole-run"`. Mutation: hoist the call above the mode switch.
  This is a real seam - the stub IS on the path the code under test calls.
- **F17** - tier 2 SURVIVES every later arrival, because storage is a REF.
  Mutation: hold it in `useState` and the pool's captured closure rebuilds with
  the stale value, so the post-arrival-2 assertion goes red. The harness's
  `useState` at `:25-36` returns the slot's value per call, so a stale capture is
  reproducible in it.
- **F18** - a rejection is CAUGHT, is OBSERVABLE, and does not stop the run.
  Assert (a) every row still arrives, (b) `phase === "complete"`, (c)
  `incrementalError` is non-null and says grades are unaffected. Mutations:
  delete the `.catch` and (c) goes red on an unhandled rejection; set
  `phase = "refused"` in the catch and (b) goes red.

**`myRunId` guards a late landing** - a tier-2 promise from run N must not write
into run N+1 - and it is the SAME token W5's identity uses, so the two fixes
share one construction.

**Changed lines: about +40 production, +90 test, mock-repair term +0** (the action
stub is new, not a repair). **Total about 130.**

**Gate:** as W5's form, over
`npm run test:paths -- src/app/actions/grading-incremental.test.ts src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts src/app/actions/action-guard-coverage.test.ts src/app/actions/action-guard-coverage-github-cohort.test.ts src/app/actions/grading.guard.test.ts src/lib/use-server-exports.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/lib/grade-result-allowlist-coverage.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts`,
then `npm test`, `npx tsc --noEmit --incremental false`, `npm run lint`,
`npm run build` (the `Compiled successfully` LINE), both counters on the two
edited source files, `git status --short`.

---

### W7 - The flag flip. NOT GATEABLE IN THIS REPO

**Write set:** `src/app/components/grading/incrementalRunPlan.ts:99`
(`export const INCREMENTAL_ROUTE_ENABLED = false;` becomes `true`) and
`src/app/components/grading/incrementalRunPlan.test.ts`'s three flag-off
assertions at `:54`, `:58` and `:77`, all opened and confirmed. Those three
assertions are part of this commit's write set, not collateral damage to be
discovered at the gate.

**The flip requires all three of the design's groups. Not two of three.**

- **GROUP A** - the fifteen conditions of design section 15, including
  `npm run test:paths -- <the 47-path GATE list>` all `COVERED`, `npm test` zero
  failed, `npx tsc --noEmit --incremental false` silent, `npm run build` printing
  `Compiled successfully`, every 9.1 bound held on BOTH counters, and F1 through
  F26 green **each having been WATCHED red first**.
- **GROUP B** - all eight owner-walk items of design section 12, performed in ONE
  sitting. **Items 1, 2, 4, 7 and 8 have no in-repo instrument of any kind.**
  This plan proposes no proxy for any of them. Item 7 is the one whose failure
  destroys work the instructor has already done.
- **GROUP C** - RES-FILL-1 through RES-FILL-13 present as rows in
  `docs/BACKLOG.md`. **This plan does not write that file**; a concurrent seat
  owns it. Until they are rows there they do not exist.

**So W7 is routed to owner-verification, with the three fields the loop
requires:**

| Item | Owner | Instrument | Step |
|---|---|---|---|
| Group A | the implementer of W7 | the fifteen commands of design section 15, run in the flip commit | at the flip commit, pasted |
| Group B, all eight | **the repo owner** | design section 12's per-item instrument (one real run of at least five submissions, per item) | ONE sitting before the flip; items 2, 7 and 8's results stated in words |
| Group C | the backlog seat | `grep -an "RES-FILL" docs/BACKLOG.md` -> 13 rows | before the flip commit |

**A green Group A says nothing about Group B, and this plan forbids reading it as
though it did.**

---

## 5. Disjointness, computed in BOTH senses

### 5.1 Half one - exact path, computed not eyeballed

Each wave's set is its edits PLUS the tests asserting on the behaviour it
changes, derived in section 1 and pruned of the three prose-only hits of 1.3. The
four repo-wide READ-ONLY gates are filtered out of the intersection because **no
wave WRITES them** (`file-size-ceiling`, `no-emojis`, `source-bytes`,
`use-server-exports`); they are section 5.3's business instead.

```
for a in w1 w2 w3 w4 w5 w6 w7; do
  for b in w1 w2 w3 w4 w5 w6 w7; do
    if [ "$a" \< "$b" ]; then echo "--- $a vs $b ---"; comm -12 <(sort -u $a.txt) <(sort -u $b.txt); fi
  done
done
```

Canary on the same instrument, same session:
`comm -12 <(sort -u w1.txt) <(sort -u w1.txt) | wc -l` -> **15** (a set
intersected with itself is non-empty, so `comm -12` is doing its job).

**Output, pasted:**

```
--- w1 vs w2 ---
src/lib/grade/rubric-stamp.wiring.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w1 vs w3 ---
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
src/app/components/grading-results/ungradedDisclosure.test.ts
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/lib/canvas-client-boundary.runtime-graph.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w1 vs w4 ---
src/lib/grade/collisionRefusal.wiring.test.ts
src/lib/grade/extraction.ts
src/lib/grade/grouping-zip-parents.wiring.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w1 vs w5 ---
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
src/lib/canvas-client-boundary.runtime-graph.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w1 vs w6 ---
src/lib/module-graph/runtime-import-graph.test.ts
--- w1 vs w7 ---
--- w2 vs w3 ---
src/lib/grade/postable.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w2 vs w4 ---
src/app/actions/action-guard-coverage-github-cohort.test.ts
src/app/actions/action-guard-coverage.test.ts
src/app/actions/grading.budget.test.ts
src/app/actions/grading.collisionRefusal.test.ts
src/app/actions/grading.guard.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w2 vs w5 ---
src/app/actions/grading-submission-grade.test.ts
src/lib/grade-result-allowlist-coverage.test.ts
src/lib/grade/types.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w2 vs w6 ---
src/app/actions/action-guard-coverage-github-cohort.test.ts
src/app/actions/action-guard-coverage.test.ts
src/app/actions/grading.guard.test.ts
src/lib/grade-result-allowlist-coverage.test.ts
src/lib/grade/types.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w2 vs w7 ---
--- w3 vs w4 ---
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
src/lib/grade/extraction.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w3 vs w5 ---
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
src/app/components/grading-results/rubricProvenanceLeaf.test.ts
src/lib/canvas-client-boundary.runtime-graph.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w3 vs w6 ---
src/lib/module-graph/runtime-import-graph.test.ts
--- w3 vs w7 ---
--- w4 vs w5 ---
src/app/actions/grading-incremental.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w4 vs w6 ---
src/app/actions/action-guard-coverage-github-cohort.test.ts
src/app/actions/action-guard-coverage.test.ts
src/app/actions/grading-incremental.test.ts
src/app/actions/grading-incremental.ts
src/app/actions/grading.guard.test.ts
src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w4 vs w7 ---
src/app/actions/grading-incremental.test.ts
src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts
--- w5 vs w6 ---
src/app/actions/grading-incremental.test.ts
src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts
src/app/components/grading/useIncrementalGradingRun.ts
src/lib/grade-result-allowlist-coverage.test.ts
src/lib/grade/types.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w5 vs w7 ---
src/app/actions/grading-incremental.test.ts
src/app/components/grading/incrementalRunPlan.test.ts
src/app/components/grading/incrementalRunPlan.ts
src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts
--- w6 vs w7 ---
src/app/actions/grading-incremental.test.ts
src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts
```

**Three pairs are EMPTY, and empty is the only pass: `w1/w7`, `w2/w7`, `w3/w7`.
Every one of the three is already dependency-ordered** - W7 is the flip and
requires all six predecessors. **So NO PAIR OF WAVES THAT COULD RUN CONCURRENTLY
HAS AN EMPTY INTERSECTION.**

**RULED: NO CONCURRENCY LICENCE. THIS ITEM IS FULLY SEQUENTIAL, SEVEN WAVES DEEP.**

I would rather grant a licence than not - standing consent covers disjoint work
and idle sequencing costs the queue - and the computation above refuses one. The
three structural reasons, each visible in the output:

- `src/lib/module-graph/runtime-import-graph.test.ts` is WRITTEN by W1 and read
  by W2, W3, W4, W5 and W6. One writer, five readers.
- `src/lib/grade/types.ts`, `src/app/components/GradingTab.tsx`,
  `src/app/components/autoGradeTransition.wiring.test.ts`,
  `src/app/actions/grading-incremental.ts`,
  `src/app/components/grading/useIncrementalGradingRun.ts` and
  `.../incrementalRunPlan.ts` are each written by two or more waves.
- The incremental route's four waves all converge on
  `useIncrementalGradingRun.lifecycle.test.ts`.

### 5.2 The one pair where a licence is arguable, with its tripwire, NOT recommended

**`w2 vs w3` shares exactly two paths and BOTH are read-only on BOTH sides.**
W2 and W3 are also informationally independent (the header unit versus the
identity unit, no shared fact). Verified by opening rather than assumed:

- `src/lib/grade/postable.test.ts` `readStripped`s both files, at `:172-173`
  (`src/app/actions/grading.ts`, inside a case named `postGradingDraftAction`)
  and at `:186-198` (`GradingResults.tsx`, cases named `handlePostGrades` and
  `handlePostOne`). W2 edits `grading.ts`'s zip and Canvas grading branches, not
  `postGradingDraftAction`; W3 edits `GradingResults.tsx`'s reset trigger, not
  either post handler.
- `src/lib/module-graph/runtime-import-graph.test.ts` - read-only on both sides.
  W2 adds a type-only declaration (no value edge); W3 adds a name to
  `GradingResults.tsx:39`'s EXISTING import statement (no new edge at all). Its
  R-9 block at `:392-401` uses both files as walk roots and asserts more than 50
  violations with the wall removed, so neither edit can lower it.

**Recommendation: SEQUENCE THEM.** The intersection is not empty, and empty is
the only pass. `docs/a39-waves.md` 4.3 set the precedent on the structurally
identical one-file case and refused it for the right reason -
`docs/loop/parallel-disjointness.md` section 6's last failure mode is
parallelising because you can. Here it buys minutes on two waves of 340-490 and
53 changed lines, and the cost of being wrong is a sibling's red gate
misattributed. **An orchestrator MAY run W2 and W3 concurrently if and only if
W2's brief pins `postGradingDraftAction` in place and W3's brief pins
`handlePostGrades` and `handlePostOne` in place.** That is the whole tripwire.

### 5.3 Half two - informational independence, and the shared things no file list shows

> List the facts each wave must assume to start. Who establishes each fact?

| Wave | Facts it designs against | Established by | Independent? |
|---|---|---|---|
| **W1** | `reconcile.ts:20`/`:50-58`; `runtime-import-graph.test.ts:665`/`:674`/`:703`; `parsing.ts:45`'s hardcoded `comment: ""`; `reconcile.test.ts:136`'s literal | all pre-existing at `59f3aac` | **Yes - it is the root** |
| **W2** | `grading.ts:814-816`, `:817-818`, `:886-888`, `:890-893`; `types.ts:1` type-only; `rubric.ts:27`/`:243`; `grading.guard.test.ts:93-104`'s factory mock | all pre-existing | **Yes.** It does NOT design against anything W1 changes: `reconcile.ts` is not on `gradeAction`'s path to the header |
| **W3** | `GradingResults.tsx:204`, `:216-230`, `:235-237`, `:39`; `gradingResultsHelpers.ts:1-8` | all pre-existing | **Yes** |
| **W4** | `grading-incremental.ts:71`, `:91`, `:112`, `:42`, `:117-139`; `extraction.ts:8`, `:135`, `:145-149`; `utils.ts:452-455`; **`resolveRunHeader`'s signature**; **W1's S0 answer** | `resolveRunHeader` is W2's; S0's answer is W1's | **NO. Coupled to W1 and W2** |
| **W5** | `unionAreaNames`; `reconcile.ts` being client-importable; `GradingRunHeader`; `runResetKey`; the header on the prep result; `autoGradeTransition.wiring.test.ts:161` and `:336`; `GradingTab.tsx:545`, `:558`, `:595-615`, `:206`, `:212-216`, `:472-478` | W1, W2, W3, W4 | **NO. Coupled to all four** |
| **W6** | `tier2Ref`'s slot, `rebuild()`, `runIdRef` | W5 | **NO** |
| **W7** | F1-F26 green; the eight owner-walk results | W1-W6 and the owner | **NO** |

**The crossing that no file list shows, and it is the dangerous kind.** W4 adds
`extraction.ts -> ./rubric` and DESIGNS AGAINST the fact that
`runtime-import-graph.test.ts:665`'s trail reaches `rubric.ts` the long way,
through `../canvas`. **W1 is chartered to change that very file** - it deletes
`:674` and rewrites `:638-656`'s prose. Their file-path intersection on
`extraction.ts` is real too (W1's S0 mutates and restores it), but the
informational half would bind even if S0 did not exist. This is
`docs/loop/parallel-disjointness.md`'s second sense exactly: invisible until
integration, and the one that gets missed. **W1 before W4, and W1's S0 result is
an input to W4's brief.**

**Shared resources that no file list shows**, each binding on every wave:

| Resource | Rule |
|---|---|
| `npx tsc --noEmit` | **Exactly ONE caller per window.** `tsconfig.json` sets `"incremental": true` and every run writes `tsconfig.tsbuildinfo` at the repo root (gitignored). Every gate above passes `--incremental false`, which removes the race; the one-owner rule is the belt to that brace. Since this item is fully sequential, the only sharing is with work OUTSIDE this item |
| Sabotage verification | **No two agents sabotage-verify at once.** W1's S0 and S1, W2's F26 watched red, W3's two F9 mutations, W5's F10/F11/F20 mutations and W6's F18 mutation all mutate the shared tree and restore. Each brief states that its sabotage window is reported as started and finished. **Restore by `cp` backup, NEVER `git checkout --`** on an uncommitted file - that reverts to the index and destroys the chunk's work |
| `git stash` | **Forbidden in every brief.** One agent's stash reverts every sibling's files |
| `git add -A` | **Forbidden in every brief. Every wave stages EXPLICIT PATHS.** A repo-wide add has pushed an implementer's unverified mid-flight work to main here |
| `.claude/worktrees` | A stale copy is returned FIRST by `Glob`. An agent can edit the copy, pass every gate and change nothing real. **`git status --short` in the MAIN checkout is required proof on every wave** |
| `src/file-size-ceiling.structure.test.ts` | Walks all of `src/`. A sibling that grows any file past 1000 turns THIS wave's gate red. Read the failure message before assuming it is yours. **And W1's gate inherits `grading.ts` at 946 against the backlog's recorded `-le 945` until W2 lands** |
| `src/lib/no-emojis.test.ts` | `roots = ["src", "docs"]` at `:254` - **it scans `docs/`, so it is the gate over THIS file too**. It owns the ONE authorized exception (`CHECKLIST_DONE_PREFIX`). **Never hand-roll an emoji scan**: `grep -P` is broken here and exits 0 without checking |
| `src/source-bytes.structure.test.ts` | `collect(ROOT)` over the whole repo with `.md` in `TEXT_EXTENSIONS` (`:50`), so it reads this file. A single materialised NUL makes a file grep as binary and drop silently out of every source-text test while passing tsc, eslint, vitest and the build |
| **`src/tools/vitest-paths/gate-commands.structure.test.ts`** | **A gate over THIS document that no other plan in this repo has had to name.** Its S8 block (`:206-279`) freezes the EXACT set of raw multi-path test commands in `docs/**/*.md` at 15 hits in 8 files, and `rawMulti` (`:43-45`) filters `family !== "wrapper"`. **So every gate in this plan may use `npm run test:paths -- ...` freely, and a single raw `npx vitest run a b` anywhere in it turns that test RED.** Verify with `npx vitest run src/tools/vitest-paths/gate-commands.structure.test.ts` - a single path, so a bare `vitest run` is legitimate. Note that file also reads `docs/BACKLOG.md` and `docs/backlog.yml` through `parseBacklogYaml`, so a red there may belong to the concurrent backlog seat and not to this document |
| `npm test` | Walks all of `src/`. **A sibling's red test turns THIS wave's gate red.** Read the failing file's path before assuming it is yours. It is worth more than it costs because it is the only thing ranging over readers no wave enumerated - and section 1.4 shows this design's own enumeration missed two |
| `docs/BACKLOG.md`, `docs/backlog.yml`, `src/tools/backlog/backlog-file.structure.test.ts` | Held by a concurrent seat during this pass. **Group C's thirteen RES-FILL rows are owed there and no wave in this plan writes them** |

**Cap check:** every slot holds exactly 1 item. The cap is 2-3.

---

## 6. Ordering: what makes each edge necessary

Derived from the stated write sets, never from size.

| Edge | Why |
|---|---|
| **W1 first, before any other line of code in the item** | Its step S0 is the design's M2 mutation, which section 11's preamble requires before anything else, and whose answer decides the content of `runtime-import-graph.test.ts` - a file W1 WRITES. Learned later it reopens a closed file |
| W1 before W2, W3, W4, W5, W6 | W1 is the sole WRITER of `runtime-import-graph.test.ts` and all five READ it (5.1). A writer before its readers is what keeps a reader's gate from failing for someone else's reason |
| W1 before W5 | `canonicalColumns` calls `unionAreaNames`, which W1 exports; and `buildIncrementalRun` calls `reconcileRun` from a `"use client"` closure, which is RED in `canvas-client-boundary.runtime-graph.test.ts` until W1 moves `reconcile.ts:20` to `./prompts`. F14 |
| W1 before W4 | The informational crossing of 5.3: W4 designs against `:665`'s trail shape, which W1 is chartered to change |
| W2 before W4 | `prepareGradingRunAction` calls `resolveRunHeader`, which W2 creates |
| W2 before W5 | `buildIncrementalRun` consumes `GradingRunHeader`, which W2 creates |
| W3 before W5 | `GradingTab.tsx` passes `runKey` and its scroll effect calls `runResetKey`, both W3's. They also both write `autoGradeTransition.wiring.test.ts`, so ordering them gives the orchestrator ONE re-pin instead of two |
| W4 before W5 | W5's F4 asserts every fetch body's `rubric` equals the stub header's `effectiveRubric`, which is only true once the prep returns the header; and the hook reads `prepared.header` |
| W5 before W6 | W6's merge writes `tier2Ref` and calls `rebuild()`, both created by W5 |
| W6 before W7 | Group A requires F1-F26 green, and F16-F18 are W6's |
| **W2 and W3 are informationally independent but NOT file-disjoint** | 5.2. Sequenced, with the tripwire under which a licence would be legal |

**The dispatch schedule:**

| Slot | Item | Cap 2-3? | `tsc` owner in the window |
|---|---|---|---|
| 1 | W1 (S0 then S1-S2) | 1 | W1 |
| 2 | W2 | 1 | W2 |
| 3 | W3 | 1 | W3 |
| 4 | W4 | 1 | W4 |
| 5 | W5 (S1-S6) | 1 | W5 |
| 6 | W6 | 1 | W6 |
| 7 | W7 - **blocked on Group B, the owner walk** | 1 | W7 |

**The honest cost of a fully sequential item: seven gate runs, and `npm test`
alone is measured at roughly 107 seconds** (`docs/loop/this-repo.md` section 1;
re-measure rather than quoting it). That is the price of the couplings in 5.1 and
it is not reducible by wishing. **The queue should not idle on it** - this item
occupies one slot at a time and the standing rule that disjoint BACKLOG items run
concurrently is untouched.

---

## 7. Line-shift obligations this plan creates, with the delta and the owner

**Two are real, both between my own waves, and both would manufacture a stale
citation in a file nobody touched.**

**OBLIGATION 1 - W2 shifts every `grading.ts` citation at or after `:814`.**
The Canvas branch loses 1 line at `:814-816`, so `:817` onward shifts by -1; the
zip branch then loses 4 more, so `:894` onward shifts by -5 cumulatively. The
affected citations the design carries, all verified present today: `:814-816`,
`:817-818`, `:819-823`, `:859`, `:886-888`, `:890-893`, `:902-906`, `:911-915`,
`:919`, `:924`.

- **Owner: the orchestrator, before W4 is dispatched.**
- **Method: LOCATE the content. Never subtract.** The design records that round
  1's `grading.ts` citations were ALL stale by +5 after `2f06261` and that two
  re-pins in that very pass went wrong from arithmetic. The commands are the
  design's own: `grep -n "Please provide assignment instructions"`,
  `grep -n "extractStudentEntries"`, `grep -n "effectiveRubric"`,
  `grep -n "generateRubric"`, `grep -n "getSpeedGraderUrl"` on
  `src/app/actions/grading.ts`.
- **W2's own commit message records the post-change line of each.** The design
  document is NOT re-pinned - it is final at round 2, and re-pinning it would be
  editing a finished artifact.

**OBLIGATION 2 - W3 shifts `autoGradeTransition.wiring.test.ts`, and W5's brief
pins two of the moved lines.** W3 adds about +16 lines (a third source reader
plus F9 clause 2). If any of that lands above `:159`, then A5's
`expect(wholeFileMatches.length).toBe(2)` moves off `:161` and W4-8's block moves
off `:333-343`. W5's F10 must rewrite the first and W5's S5 must not break the
second.

- **Owner: the orchestrator, before W5 is dispatched.**
- **Method:** `grep -n "expect(wholeFileMatches.length).toBe(2)"` and
  `grep -n "incrementalRunning &&"` on the post-W3 tree. Delta unknown in
  advance and irrelevant - the anchors are unique text and must be located.
- **Mitigation available to W3 at zero cost: append F9 clause 2 BELOW the
  existing W4-8 block** rather than inserting it near the top. Then no existing
  line in the file moves and Obligation 2 discharges itself. **W3's brief should
  say so**, because the cheapest way to pay a line-shift obligation is not to
  create it.

**Three shifts that create NO obligation, stated so nobody looks for one.** W1's
`reconcile.ts` grows by about +13, and nothing outside it pins a
`reconcile.ts` line except `docs/a39-waves.md:1651` (prose, RES-FILL-9, already
owed). W5 shifts `GradingTab.tsx` heavily and no other wave pins a
`GradingTab.tsx` line. W3 grows `GradingResults.tsx` by +3 and the only external
pins into it are design owner-walk item 5's `:567` and `:578`, which sit far
below the `:204-230` edit and move by exactly +3 - an owner-walk step that says
"look for the full-credit checklist panel" does not depend on the number.

---

## 8. Every export, and the wave that calls it

Restated as one table, because a wave that ships an export whose caller is in a
later wave is this repo's most repeated structural failure and a wave table that
buries the answer is how it recurs.

| Export | Declared in | Called in | Same wave? |
|---|---|---|---|
| `unionAreaNames` | W1 | `reconcile.ts`'s own empty-canonical fallback at `:51-58` | **YES** |
| `resolveRunHeader` | W2 | `src/app/actions/grading.ts`, both branches | **YES** |
| `GradingRunHeader` | W2 | `run-header.ts`'s own return type and `gradeAction`'s destructure | **YES** |
| `runResetKey` | W3 | `GradingResults.tsx`'s reset guard, via the existing import at `:39` | **YES** |
| `extractStudentEntries`'s `inferFileNamesWith` option | W4 | `grading-incremental.ts:91` | **YES** |
| the header on `prepareGradingRunAction`'s result | W4 | **nothing until W5** | **NO - and it is priced, see 3.2 and below** |
| `IncrementalPhase`, `isTerminal`, `canonicalColumns`, `buildIncrementalRun`, `selectDisplayRun`, `selectRunKey` | W5 | the hook and `GradingTab.tsx` | **YES** |
| `describeRunProgress`, `shouldShowEmptyState` | W5 (step S5) | `GradingTab.tsx`'s terminal region and empty-state guard | **YES** |
| `GradingRunTier2` | W5 | `buildIncrementalRun`'s parameter type, same wave | **YES** |
| `beginWholeRun` | W5 | `GradingTab.tsx`'s `handleAutoGrade` and `startReview`'s two whole-run branches | **YES** |
| `completeGradingRunHeaderAction` | W6 | the hook's `startReview` | **YES** |

**One row is NOT same-wave, and this plan does not wave its own rule.** W4's
`prepareGradingRunAction` returns a `header` field that nothing reads until W5.
The three things that make that different from a dead export, each checkable:

1. **It is not an export.** It is an added field on an existing action's existing
   return, and that action already has its only caller
   (`useIncrementalGradingRun.ts`'s `startReview`).
2. **No user can reach it either way.**
   `incrementalRunPlan.ts:99`'s `INCREMENTAL_ROUTE_ENABLED` is `false` and
   `routeGradingRun` returns `"whole-run"` for every request, pinned at
   `incrementalRunPlan.test.ts:54`, `:58` and `:77`. So W4 ships nothing
   reachable, with or without the field.
3. **The alternative is worse.** Deferring the field to W5 means W4's tier-1 work
   lands with `resolveRunHeader` called and its result discarded, which is a
   wasted model call on a live code path rather than an unread field.

**NO TYPE-ONLY-MODULE EXCEPTION IS CLAIMED ANYWHERE IN THIS PLAN.**
`GradingRunTier2` was the one candidate and it is avoided by landing it in W5
with `buildIncrementalRun`'s signature, its first consumer - which is why
`types.ts` is written by two waves. That costs nothing, because W2 and W5 are
sequential for four other reasons (section 6).

**And one export this plan DECLINES to create**, so the decision is recorded
rather than inherited: `run-header.ts` gets no `src/lib/grade.ts` barrel line.
Reasons in W2's section. **RES-P-10.**

---

## 9. Residual register

Each entry names an **OWNER**, an **INSTRUMENT** and the **STEP** that measures
it. **Missing any of the three it is a deletion, and I would call it that.** None
below is. These eleven are this plan's own; the design's thirteen RES-FILL
entries are unchanged and are Group C's business.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| **RES-P-1** | `autoGradeTransition.wiring.test.ts` is **349** on both counters, not the design 9.1 row's 393 (which is the `lifecycle.test.ts` row's figure, carried across). `-le 620` still holds; the headroom is 271, not 227 | W3's implementer | `wc -l` AND `@(Get-Content ...).Count` on that path | at W3's PRE-CHANGE baseline, recorded before the first edit so the delta is attributable. **The design's per-line citations into that file are all exact and nothing built on them changes** |
| **RES-P-2** | F26's two named host files read NO file. `grep -c "readFileSync\|node:fs\|from \"fs\""` -> 0 for `grading.guard.test.ts` and `grading.budget.test.ts`; the two baseline files that DO read `grading.ts` as source are `postable.test.ts` and `action-guard-coverage-github-cohort.test.ts` | W2's implementer | the grep above plus its `readFileSyncZZZ` canary (0, exit 1) | W2 adds the reader to `grading.guard.test.ts` with a plain `readFileSync`, NOT a comment-stripping one, because F26's pass is a count of ZERO and a comment must make it RED |
| **RES-P-3** | **Design item #9 - the LLM filename inference, the one finding whose failure mode is a wrong grade on a named student - has NO F-row in section 11 and no mutation-backed instrument.** Its only in-repo evidence is the Group A item 8 reachability greps plus `extraction.test.ts`. And `inferFileNameConvention` (`rubric.ts:209-240`) fails SILENTLY to an empty lookup via its own try/catch, so a broken inference is indistinguishable from a working one | **the test-author seat, BEFORE W4 is dispatched** | none exists today; I invented none | the test seat either supplies an instrument that proves the derived student NAME changes, or records item #9's effect as owner-verification with a step. **Reachability is not effect, and W4's gate can only prove reachability** |
| **RES-P-4** | `incrementalRunPlan.ts`'s `-le 300` leaves about 9 lines against a derived landing of 291, and the design names no extraction for this file where it names one for `GradingTab.tsx` | W5's implementer | both counters at W5's gate | if it exceeds 300 on either counter, `describeRunProgress` and `shouldShowEmptyState` move together into `src/app/components/grading/runProgressCopy.ts` with its own test file, in the SAME commit. **Not speculatively** - an extraction taken when it is not needed costs a call site and a file for nothing |
| **RES-P-5** | W2 shifts every `grading.ts` citation at or after `:814` by -1 then -5 | the orchestrator | the design's own content greps, listed in section 7 | re-pin W4's brief from the post-W2 tree by LOCATING content. **Never by subtracting** - the design records two re-pins that went wrong that way in one pass |
| **RES-P-6** | W3 shifts `autoGradeTransition.wiring.test.ts`, where W5's brief pins `:161`'s `toBe(2)` and `:333-343`'s W4-8 block | the orchestrator | `grep -n "expect(wholeFileMatches.length).toBe(2)"` and `grep -n "incrementalRunning &&"` on the post-W3 tree | re-pin W5's brief before dispatch. **Cheaper mitigation, which W3's brief should carry: append F9 clause 2 BELOW the existing W4-8 block and nothing moves at all** |
| **RES-P-7** | `src/lib/module-graph/runtime-import-graph.test.ts` is 772 on both counters and the design bounds it at nothing, while W1 edits it | W1's implementer | both counters at W1's gate | the bound is `-le 800`, mine, derived from 772 plus a prose rewrite of `:638-656` |
| **RES-P-8** | Six prose-only grep hits found (1.3): three in my own derivation, three in the design's 46-path pattern. A bare symbol grep counts prose, and in a DISJOINTNESS set a prose-only hit manufactures a false coupling | whoever next derives an owns list over this area | open every hit; never trust a `grep -l` that decides a boundary | at the next owns-list derivation. The six are enumerated in 1.3 with the line that proved each one |
| **RES-P-9** | W4 constructs tier 1's ordering but its instrument, F4, lives in W5's `useIncrementalGradingRun.lifecycle.test.ts`, by the design's own choice ("ORDER at the consumer") | W5's implementer | F4 exactly as the design writes it | at W5's gate. **W4's gate does not claim tier-1 ordering** and its brief says so |
| **RES-P-10** | `run-header.ts` gets NO `src/lib/grade.ts` barrel re-export - my ruling, for the three reasons in W2's section, the third being that `grading.guard.test.ts:93-104` is an exhaustive factory mock of that barrel | the chunk that next needs a second `resolveRunHeader` caller | `grep -n "run-header" src/lib/grade.ts` -> 0 | if a second caller appears. **Not a dead export withheld; a barrel line declined so it cannot become one** |
| **RES-P-11** | **No concurrency licence: the item is fully sequential, seven gate runs deep**, and its wall-clock is their sum | the orchestrator | section 5.1's pasted intersection and its `comm -12` self-canary of 15 | **re-intersect if ANY wave's write set changes.** A write-set correction that is not re-intersected is how a licence outlives the set it was computed over - and here the risk runs the other way: a correction could make a pair empty and nobody would notice the licence was available |

---

## 10. What in the design resists being cut, and what I could not determine

### 10.1 Two requirements that genuinely cannot be separated

**`selectRunKey` and `beginWholeRun`.** Design 5.7 obligation 1 is a proof, not a
preference: `selectRunKey("idle", n)` must be `undefined`, and the only thing
that guarantees the phase IS `idle` on a whole-run dispatch is the one door. A
wave that landed the key without the door would ship a stale
`"incremental-<runId>"` travelling with a NEW whole-run object, the seven resets
NOT firing, and a Posted-to-Canvas badge over a different run's grades - with F8
green, because F8 measures a pure function. **They are one requirement wearing
two F-numbers, and splitting them badly is worse than not splitting them.**

**The one mount and `selectDisplayRun`.** There is no intermediate state. Deleting
the second mount forces a precedence decision in the same edit.

### 10.2 One thing the design leaves open that a cut cannot close

**F6's, F9's and F13's behavioural halves** - the design names these as the three
weakest links and routes each to an owner walk. No cut helps: the environment
renders no component. This plan does not propose a proxy for any of them and does
not let their source-text halves stand in for them.

### 10.3 Stated rather than filled in

- **Whether `npx tsc --noEmit` and `npm run build` pass on any wave.** Not run -
  single-caller resources, and a concurrent seat was live on this tree. Every
  type-level claim here is a reading claim.
- **Whether any instrument actually goes red under its named mutation.** Every
  mutation requires editing production source outside my write set. Where I say a
  test would go red, I cite that test's own source and name the mutation the
  DESIGN specified; I specified none.
- **Whether `incrementalRunPlan.ts` lands at 291 or over 300.** My derivation is
  a sum of function sizes, shown in W5's section. RES-P-4 is the contingency and
  the implementer measures.
- **Whether the re-captured frozen literal holds the three values design 6.5
  predicts.** Not run. F23 requires the value come from the RUN, and the
  prediction is written down precisely so a mismatch is informative rather than
  accommodated.
- **Every millisecond claim.** No API key, no network; `vitest.setup.ts` throws
  on any real `fetch`. W4-7 (owner-walk item 1) owns the time to first row.
- **Whether W2's mock-repair term is 0 or 12.** It depends on whether any case in
  `grading.guard.test.ts` reaches the zip-Gemini branch with a blank rubric, and
  I did not run it to find out. The mechanism is traced in W2's section and the
  failure is LOUD, which is why the range is acceptable.

---

## 11. Gates run over this document

`src/lib/no-emojis.test.ts` (`roots = ["src","docs"]`, `:254`),
`src/source-bytes.structure.test.ts` (`collect(ROOT)` with `.md` in
`TEXT_EXTENSIONS`, `:50`) and
`src/tools/vitest-paths/gate-commands.structure.test.ts` S8 (`:206-279`) all read
this file. **This document contains no emoji, no non-ASCII arrow glyph, and no
raw multi-path `vitest`/`npm test` command: every gate naming two or more test
paths is spelled `npm run test:paths -- <p1> <p2> ...`, and the only bare
`npx vitest run` invocations are single-path, which is legitimate.**
Verify with `npx vitest run src/tools/vitest-paths/gate-commands.structure.test.ts`
and `npx vitest run src/lib/no-emojis.test.ts` - single paths, both. The emoji
rule is owned by that test and was not hand-rolled here; `grep -P` is broken in
this environment and exits 0 without checking.
