# A44 wave plan

Seat: `loop-plan` (elevated per RULING 86, `docs/DEV_LOOP.md:48`). Round 1 of at
most two for this activity. Written 2026-09-27.

**Write set for this pass is exactly `docs/a44-waves.md`.** Section 14 pastes
`git status --short` and separates this pass's entry from the sibling-owned ones.
No `git stash`, no `git add -A`, no `git checkout --` was run at any point, and
nothing under `src/` was written or mutated.

**Inputs, in the order the brief named them.** `docs/a44-scope.md` (committed
`bd7bca0`) - its "what this requires of the wave plan" statements (section 8) are
this document's brief, and section 7 below records where this plan DIVERGES from
one of them and why. `docs/a44-check.md` (`e8faea4`), especially B2, which is the
wave-disjointness failure this document exists to not reproduce.
`docs/a41-scope.md` sections 4.1 and 7.1; `docs/a41-test-notes.md` sections 1.4,
2 (R1-R6) and 5. Then `docs/DEV_LOOP.md`, `docs/loop/traps-spec.md`,
`docs/loop/iteration-caps.md`, `docs/loop/parallel-disjointness.md`,
`docs/loop/this-repo.md`.

**This document does NOT contain oracles, instruments, fixtures, expected
literals or a sabotage protocol.** `docs/a44-test-notes.md` is being authored
concurrently by `loop-test-author` and is not read, created or edited here.
Section 11 lists what that artifact owes and stops there. Where a measurement
below happens to exercise a shape, it is evidence for a WAVE BOUNDARY, never a
proposed test.

---

## 0. How every number in this document was produced

**(a) Line counts: both mandated counters, on every file named.** `wc -l` from
the Bash tool and `@(Get-Content <file>).Count` from PowerShell, run this pass.
`Measure-Object -Line` was not used. The two agreed on all fourteen files:

| File | `wc -l` | `@(Get-Content).Count` |
|---|---|---|
| `src/app/actions/grading.ts` | 941 | 941 |
| `src/lib/grade/utils.ts` | 393 | 393 |
| `src/lib/grade/utils.test.ts` | 390 | 390 |
| `src/app/components/GradingResults.tsx` | 906 | 906 |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | 728 | 728 |
| `src/app/components/grading-results/ungradedDisclosure.ts` | 196 | 196 |
| `src/lib/grade/extraction.ts` | 300 | 300 |
| `src/lib/grade/engine.ts` | 517 | 517 |
| `src/app/components/GradingTab.tsx` | 566 | 566 |
| `src/lib/submission-zip-intake.ts` | 158 | 158 |
| `src/lib/grade/single-file-entry.ts` | 133 | 133 |
| `src/lib/grade/grouping-zip-parents.wiring.test.ts` | 148 | 148 |
| `src/lib/grade/extraction.test.ts` | 271 | 271 |
| `src/file-size-ceiling.structure.test.ts` | 151 | 151 |

`src/lib/module-graph/runtime-import-graph.test.ts` is 709 (`wc -l`).
`LIMIT = 1000` is at `src/file-size-ceiling.structure.test.ts:41`
(`grep -n "LIMIT = 1000" src/file-size-ceiling.structure.test.ts` -> `41:`).
**This document does not state its own line count**; it is reported in the
handback, measured after the last edit.

**(b) Behavioural numbers execute the REAL modules, with an import-only diff.**
`src/lib/grade/utils.ts`, `types.ts`, `constants.ts` and
`src/app/components/grading-results/gradingResultsHelpers.ts` were copied into an
untracked `.a44plan/` directory at the repo root by a committed-to-disk Python
script (no shell heredoc), and driven with `node --experimental-strip-types`
(`node --version` -> `v22.14.0`). The diffs, in full, exit codes read from the
command:

```
$ diff --strip-trailing-cr src/lib/grade/utils.ts .a44plan/utils.ts
1,3c1,3
< import type { SubmittedFileInfo, InferredFileNameLookup } from "./types";
< import type { CodeRunResult } from "../code-runner";
< import { getMimeType } from "./constants";
---
> import type { SubmittedFileInfo, InferredFileNameLookup } from "./types.ts";
> import type { CodeRunResult } from "./code-runner-stub.ts";
> import { getMimeType } from "./constants.ts";
utils diff exit=1
$ diff --strip-trailing-cr src/lib/grade/types.ts .a44plan/types.ts
1c1
< import type { CodeRunResult } from "../code-runner";
---
> import type { CodeRunResult } from "./code-runner-stub.ts";
types diff exit=1
$ diff --strip-trailing-cr src/lib/grade/constants.ts .a44plan/constants.ts
constants diff exit=0
$ diff --strip-trailing-cr src/app/components/grading-results/gradingResultsHelpers.ts .a44plan/grh.ts
50c50
< import type { GradeActionState } from "../../actions";
---
> import type { GradeActionState } from "./actions-stub.ts";
grh diff exit=1
```

So `parseSubmissionFileName`, `getBaseFileName`, `removeLastExtension`,
`seedEdits`, `mergeStoredRowEdit` and `loadPersistedEdits` are the REAL
functions, byte-identical below their import lines. A canary proves the real
module is loaded rather than a stub: `removeLastExtension("a.b.c")` returned
`a.b`.

**(c) Two things in the harness are local reimplementations, and are labelled as
such wherever their output is quoted.** First, `matchStudentFileConvention`,
copied VERBATIM from `utils.ts:87-107`, because the real function is
module-private and `parseSubmissionFileName` does not expose which of its six
steps fired - it is the only way to tell step 3 (a crossing matched the
convention) from steps 5 and 6 (a stem fallback). Second, the GROUPING
(`utils.ts:301-319`: one `Map` entry per key, the first file's display wins,
`sort` by display) is replicated for key/display only; content assembly
(`:321-349`) is not replicated and no claim here depends on it. Identity itself
is always the real `parseSubmissionFileName`.

**(d) Exit codes are read from the command, never through a pipe.** All three
harnesses were re-run with `> file 2> file` and the exit code read on the next
line: `EXITCODE=0` for each.

**(e) Every absence claim carries a canary using the same pattern AND the same
filter.** Each is printed inline where the claim is made.

**(f) Multi-path test runs use `npm run test:paths -- <p1> <p2> ...` only.** No
raw multi-path `vitest`/`npm test` appears anywhere in this document, including
in the gates it specifies.

**(g) `npx tsc --noEmit` was deliberately NOT run by this pass.** It has exactly
one caller in this repo's concurrency model (`docs/loop/this-repo.md` section 2:
it races on `tsconfig.tsbuildinfo`), that caller is the wave gate, and this pass
wrote no TypeScript for a type gate to measure.

**(h) Scratch directory removed before this document was finalised.**

```
$ rm -rf .a44plan
rm exit=0
$ ls -d .a44plan
ls: cannot access '.a44plan': No such file or directory
ls exit=2   (confirmed absent)
```

---

## 1. The settled inputs this plan does not reopen

**RULING 87.** The folder name becomes an identity signal - a compound key
FOLDED ONTO the existing fallback key, never replacing it - and A44 owns the
refusal decision that A41 had held. The refusal is folder-aware only in its
REFINED form: amnesty from refusal is granted only when the same run's
fallback-reaching population shows two or more DISTINCT folder segments
elsewhere. A41's frozen fixture F6 stays REFUSE in isolation. The false-split
regression (`docs/a44-scope.md` 2.4: 97.6% of the
`single-student-multi-folder-shared-filename` shape) is accepted explicitly.

**Facts handed over by the scope and not re-derived here**, per the brief: the
real harm goes to zero on the folder shape (12,177 of 12,177 blended sets,
`docs/a44-scope.md` 3.3); the false-refusal reduction is 14.6% to 6.4% (same
table); there are 30 display-keyed sites across three files including a
post-to-Canvas fan-out (`docs/a44-scope.md` 4.2); `GradingResults.tsx` is 906 of
1000 lines and holds 24 of those 30.

---

## 2. The one structural fact that decides the cut

This is the fact the previous plan got wrong, and the check found it as B2(c)
(`docs/a44-check.md:296`): the plan cut a "key wave" and a "display wave" and
they were the same file.

**Re-derived this pass with my own instrument, against the current tree:**

```
$ grep -rn "studentKey" src --include=*.ts --include=*.tsx
  ... 40 hits under src/lib/course-intel/ (a DIFFERENT `studentKey`, unrelated)
  src/lib/grade/utils.ts:114,116,121,125,181,193,234,276    <- the only grade-side hits
exit=0
$ grep -rn "inferStudentPrefix" src --include=*.ts --include=*.tsx
src/lib/grade/utils.ts:269      (the definition)
src/lib/grade/utils.ts:304      (the only call)
src/lib/grade.ts:14             (a re-export by name, no call)
exit=0
$ grep -rn "parseSubmissionFileName" src --include=*.ts --include=*.tsx
  src/lib/grade/utils.ts:176,274,324,330          (definition + three in-file calls)
  src/lib/grade/utils.test.ts (7 call sites)
  src/lib/grade.ts:14                              (re-export by name)
  src/lib/code-run-selection.ts:12, src/lib/grade/prompts.ts:226,
  src/lib/grade/single-file-entry.ts:50, grouping-zip-parents.wiring.test.ts:2   (all COMMENTS)
exit=0
$ grep -rn "studentKeyZZZ" src --include=*.ts --include=*.tsx
exit=1                                             (CANARY, same command, same filter: misses)
```

So:

1. **The identity KEY has exactly one reader outside its own file: nobody.**
   `parseSubmissionFileName(...).studentKey` is consumed only at
   `utils.ts:276` (inside `inferStudentPrefix`), which is consumed only at
   `utils.ts:304` (inside `groupSubmissionsByStudent`). `src/lib/grade.ts:14`
   re-exports both by name without calling either. **The key fold is therefore
   fully contained in `src/lib/grade/utils.ts`.**
2. **A row's DISPLAY is constructed in exactly one place**, `utils.ts:344`
   (`student: entry.student`, sourced from `:309`'s `student: inferred.display`)
   - the same file. And the "fold the display when rows would otherwise collide"
   rule is SET-LEVEL: it cannot be evaluated inside `parseSubmissionFileName`,
   which sees one path. So it must live in `groupSubmissionsByStudent`.

**Therefore the key fold and the display fold are ONE change in ONE file, and
this plan makes them ONE WAVE.** They are not two waves pretending to be
separable, which is precisely what B2(c) caught.

**A consequence that decides where each half goes, measured.** If the display
fold is placed inside `parseSubmissionFileName` rather than inside
`groupSubmissionsByStudent`, it breaks two landed A14 pins.
`utils.test.ts:128-136` asserts
`parseSubmissionFileName("src/main.py").studentDisplay === "main"` twice, and
`src/main.py` reaches step 6 with the folder segment `src`. Measured against the
real function:

```
parseSubmissionFileName("src/main.py", undefined, [])        display="main" todayKey="main" foldedKeyWouldBe="3:src4:main"
parseSubmissionFileName("src/main.py", undefined, undefined) display="main" todayKey="main" foldedKeyWouldBe="3:src4:main"
```

The KEY may be folded there without touching either assertion (neither asserts
`studentKey`, and the `studentKey` census above shows no test does). The DISPLAY
may not. **Binding on the implementer: the key fold goes in
`parseSubmissionFileName`; the display fold goes in
`groupSubmissionsByStudent`.** That placement is what keeps `utils.test.ts:130`
and `:135` green, and it is also what lets Wave 2's refusal leaf read the
compound key off the same function every other consumer reads.

---

## 3. The wave table

Two waves. Sequenced, not concurrent - section 6.2 computes why.

| # | Wave | Production files written | Test files written | New exports | Where those exports are called | Independently landable AND green? |
|---|---|---|---|---|---|---|
| 1 | **Identity: the folder becomes a discriminator, and the display follows it per-file** | `src/lib/grade/utils.ts`, `src/app/components/grading-results/gradingResultsHelpers.ts` | `src/lib/grade/utils.test.ts`, `src/app/components/grading-results/gradingResultsHelpersEditState.test.ts`, NEW `src/app/components/grading-results/gradingResultsEditsIdentity.test.ts` | **NONE.** Both changes are internal to already-exported functions (`parseSubmissionFileName`, `groupSubmissionsByStudent`, `loadPersistedEdits`). `inferStudentPrefix`'s return shape may gain a field; its only caller is `utils.ts:304`, in this wave's own file. | n/a - no new export. Every changed function's callers are either in this wave's write set or unchanged in signature. | **YES.** Section 4.4. |
| 2 | **The refusal, in its refined folder-aware form** | NEW `src/lib/grade/collisionRefusal.ts`, `src/lib/grade/extraction.ts`, `src/lib/grade/engine.ts` | NEW `src/lib/grade/collisionRefusal.test.ts`, NEW `src/lib/grade/collisionRefusal.wiring.test.ts`, NEW `src/app/actions/grading.collisionRefusal.test.ts` | the decision function exported from `collisionRefusal.ts` | `src/lib/grade/extraction.ts:137-138` (`extractStudentEntries`, the embedded branch) and `src/lib/grade/engine.ts:427-437` (`gradeSubmissions`, the Gemini branch) - **both in this wave's write set.** | **YES.** Section 5.4. |

**The three NEW `collisionRefusal*` paths and `gradingResultsEditsIdentity.test.ts`
are RESERVED, not named.** The architect may rename the leaf; the test author may
rename or split the test files. What this plan fixes is that the paths exist, are
counted in the disjointness computation, and do not collide - a rename is a
one-line change to section 6.1's input and must be re-intersected before
dispatch. Confirmed against the tree this pass:

```
NEW      src/app/components/grading-results/gradingResultsEditsIdentity.test.ts
NEW      src/lib/grade/collisionRefusal.ts
NEW      src/lib/grade/collisionRefusal.test.ts
NEW      src/lib/grade/collisionRefusal.wiring.test.ts
NEW      src/app/actions/grading.collisionRefusal.test.ts
EXISTS   src/lib/grade/utils.ts
EXISTS   src/lib/grade/utils.test.ts
EXISTS   src/app/components/grading-results/gradingResultsHelpers.ts
EXISTS   src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
EXISTS   src/lib/grade/extraction.ts
EXISTS   src/lib/grade/engine.ts
```

**No wave writes `src/app/actions/grading.ts` (941 of 1000) or
`src/app/components/GradingResults.tsx` (906 of 1000).** Sections 5.2 and 9 give
the measured reasons, and section 10 names the single decision that would drag
both in - at which point the ceiling question stops being mine.

---

## 4. Wave 1 in detail

### 4.1 What it changes

- `src/lib/grade/utils.ts`: inside `parseSubmissionFileName`, whenever a file's
  identity resolves via step 5 (`:243-251`, the innermost crossing's stem) or
  step 6 (`:254-259`, the bare leaf stem), fold that file's own immediate
  enclosing folder segment INTO the existing fallback key as an additional
  discriminator. Inside `groupSubmissionsByStudent` (`:290-350`), give every row
  whose key was folded a display that names the folder.
- `src/app/components/grading-results/gradingResultsHelpers.ts`: a READ-ONLY
  legacy path in `loadPersistedEdits` (`:619-635`), so an edit stored under a
  row's PRE-FOLD display is still found. Section 4.3 measures why this is in
  this wave rather than a later one.

**Two constructions this wave is bound to, both forced by measurement rather
than preference:**

1. **The compound key must make the collision unrepresentable, not assert it
   away.** `docs/a44-scope.md` 2.2 (m2's fix) shows `leafStemFallback`
   (`utils.ts:121-126`) can return a stem containing arbitrary characters, so no
   printable separator is provably injective. The harness used a
   length-prefixed join (`"3:src4:main"` above) purely to have SOMETHING
   injective while measuring; a tuple key is equally acceptable. What is binding
   is that the construction cannot collide, not which of the two is used.
2. **The display fold must be UNCONDITIONAL on collision - a function of the
   file alone, never of the batch.** This is the section-4.3 measurement and it
   is the single most load-bearing decision in this plan.

### 4.2 Write set, derived with a stated command

An item's file set is the files it edits PLUS the tests asserting on the
behaviour it changes, INCLUDING tests that read those files as source text
(`docs/loop/parallel-disjointness.md` section 2).

```
$ grep -rlnE "grade/utils|from \"\./utils\"|from \"\.\./grade/utils\"" src
  ... 21 hits in unrelated directories (content-tab/utils.ts, ppt-design, etc.)
  src/lib/grade/engine.ts
  src/lib/grade/extraction.ts
  src/lib/grade/prompts.ts
  src/lib/grade/single-file-entry.ts
  src/lib/grade/utils.test.ts
  src/lib/grade.ts
  src/lib/code-run-selection.ts
exit=0
$ grep -rlnE "grade/utilsZZZ" src
exit=1                                   (CANARY, same pattern shape, same filter: misses)

$ grep -rlnE "readFileSync\(|readFile\(" src --include=*.test.ts \
    | xargs grep -lE "grade/(utils|extraction|engine)"
src/app/components/grading-results/ungradedDisclosure.test.ts
src/lib/grade/grouping-zip-parents.wiring.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
exit=0
$ grep -rlnE "grade/extraction" src        (CANARY for the same filter chain: must HIT)
src/lib/grade/grouping-zip-parents.wiring.test.ts
src/lib/grade.ts
src/lib/module-graph/runtime-import-graph.test.ts
src/lib/office-edit.test.ts
exit=0

$ grep -rn "loadGradingResultsEdits\|loadPersistedEdits\|seedEdits\|persistGradingResultsEdits\|mergeStoredRowEdit" \
    src --include=*.ts --include=*.tsx | grep -v "gradingResultsHelpers.ts:"
  src/app/components/grading-results/gradingResultsHelpers.test.ts        (7 hits)
  src/app/components/grading-results/gradingResultsHelpersEditState.test.ts (24 hits)
  src/app/components/grading-results/ungradedDisclosure.test.ts:539,542
  src/app/components/GradingResults.tsx:29,30,79,199,202,218,222,233,236
exit=0
$ grep -rn "loadGradingResultsEditsZZZ" src
exit=1                                   (CANARY: misses)
```

**WRITTEN by Wave 1 (5 paths):**

```
src/lib/grade/utils.ts
src/lib/grade/utils.test.ts
src/app/components/grading-results/gradingResultsHelpers.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
src/app/components/grading-results/gradingResultsEditsIdentity.test.ts    (NEW)
```

**READ-COUPLED, not written - no other agent may edit these in Wave 1's
window, and every one of them is in Wave 1's gate:**

| Path | Why it is coupled | Measured verdict |
|---|---|---|
| `src/lib/grade/extraction.test.ts` | drives `extractStudentEntries` over real archive bytes (`:246-271`) | its fixture resolves at step 3 (convention crossings); rows=2, displays `[janedoe, johndoe]` under all four modes. UNAFFECTED. |
| `src/lib/grade/single-file-entry.test.ts` | named in this feature's area | `grep -nE "parseSubmissionFileName\|groupSubmissionsByStudent\|inferStudentPrefix\|leafStemFallback" src/lib/grade/single-file-entry.ts` returns two COMMENT lines (`:50`, `:52`), exit 0, and no code line. UNAFFECTED. |
| `src/lib/grade/grouping-zip-parents.wiring.test.ts` | source-text test over `extraction.ts` and `engine.ts` | Wave 1 edits neither. UNAFFECTED. |
| `src/app/components/grading-results/gradingResultsHelpers.test.ts` | asserts `seedEdits(run)` with an exact `toEqual` (`:302`) | Wave 1 does not change `seedEdits`. UNAFFECTED, and this is the assertion that goes red if an implementer "fixes" the collapse inside `seedEdits` instead of inside the display rule. |
| `src/app/components/grading-results/ungradedDisclosure.test.ts` | `:539-542` asserts BOTH `loadGradingResultsEdits` call sites in `GradingResults.tsx` are wrapped in `correctUngradedSeeds` | Wave 1 changes `loadPersistedEdits`'s internals, not `loadGradingResultsEdits`'s call shape. UNAFFECTED. |
| `src/app/components/GradingResults.tsx` | holds 24 of the 30 display-keyed sites | NOT written. Section 4.3's invariant is what keeps it out; section 10 names what would drag it in. |
| `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts`, `src/file-size-ceiling.structure.test.ts` | directory sweeps: they collect any file this wave ADDS, automatically (`docs/loop/parallel-disjointness.md` section 6) | in the gate. |

### 4.3 Why the display fold must be per-file, and why the storage layer is in THIS wave

The check proved two separate data-loss facts. Both reproduce here against the
REAL `seedEdits` and `loadPersistedEdits`.

**Fact 1 - the key fold ALONE loses instructor feedback inside a single run.**
Driving A41's F3 fixture (`docs/a41-test-notes.md:215`) through the real
`seedEdits`:

```
=== S1: the within-run collapse a KEY-ONLY wave ships, against the REAL seedEdits ===
  today      rows=1 displays=[essay] seedEdits slots=1
  keyOnly    rows=3 displays=[essay, essay, essay] seedEdits slots=1  <-- 2 ROW(S) LOSE THEIR SEED
  always     rows=3 displays=[essay (AlvarezMaria), essay (BrownTom), essay (ChenLi)] seedEdits slots=3
```

This is the check's B2(a) and B2(b) in one line. It is also why the key fold and
the display fold are one wave and not two.

**Fact 2 - a CONDITIONAL display fold orphans an edit on a row whose identity
key never moved.** This is the case `docs/a44-scope.md` 6.1 restates as the
requirement's correct object. Run 1 holds `AlvarezMaria/essay.txt` alone and an
instructor edit is saved; run 2 adds `BrownTom/essay.txt`:

```
=== S2: a row whose IDENTITY KEY never changed, with a sibling arriving in run 2 ===
  today        run1 display="essay"                 run2 display="essay"                 EDIT SURVIVED=true
  onCollision  run1 display="essay"                 run2 display="essay (AlvarezMaria)"  identityKeyUnchanged=true (12:alvarezmaria5:essay)  EDIT SURVIVED=false
  always       run1 display="essay (AlvarezMaria)"  run2 display="essay (AlvarezMaria)"  identityKeyUnchanged=true (12:alvarezmaria5:essay)  EDIT SURVIVED=true
```

**`onCollision` is `docs/a44-scope.md` 3.4's recommended default, and it is the
rule that loses the edit.** `always` - the same suffix, applied to every row
whose key was folded, regardless of what else is in the batch - keeps it,
because the display is then a function of the FILE and "key unchanged" implies
"display unchanged" by construction. That is `traps-spec.md`'s own preference
("prefer the construction that makes the banned state unrepresentable over the
assertion that it is absent") applied to this requirement, and it is why this
plan makes the unconditional form binding rather than advisory.

**Fact 3 - either display rule orphans the PRE-FOLD blob once, and a read-only
legacy path recovers it.** A blob stored under today's displays, read by a
post-fold run:

```
=== S3: the ONE-TIME rollout read - a blob stored under TODAY's displays, read by a post-fold run ===
  always       post-fold displays=[essay (AlvarezMaria), essay (BrownTom), essay (ChenLi)]  foundByTodaysLoader=false  foundByLegacyAwareLoader=true
  onCollision  post-fold displays=[essay (AlvarezMaria), essay (BrownTom), essay (ChenLi)]  foundByTodaysLoader=false  foundByLegacyAwareLoader=true
```

`foundByLegacyAwareLoader` is a HARNESS REIMPLEMENTATION, labelled as such: it
tries the row's own display, then the pre-fold display recovered from it, and
merges through the real `mergeStoredRowEdit`. It is evidence that the wave's
write set must include the storage layer - not a proposed test and not a
proposed implementation.

**The consequence for the write set.** The A44 row's own verify clause
(`docs/BACKLOG.md:118`, extracted by parsing the row rather than grepping it)
reads: "zero saved instructor edits may be orphaned - proven by an assertion
that executes the display-string keying in the grading-results helpers, not by
reading the source". `foundByTodaysLoader=false` is a non-zero orphaning.
**So `gradingResultsHelpers.ts` is in Wave 1's write set, not a later wave's.**
This is the brief's point 5 discharged: there is no released intermediate state
that loses an instructor edit, and it does NOT force a larger single wave -
it forces one more file in this one.

**What the legacy path needs from the display wording, and it is an argument
rather than a measurement.** Recovering the pre-fold display from the post-fold
display requires the post-fold display to CONTAIN it. The suffix form
(`"essay (AlvarezMaria)"`) does; replacing the display with the folder alone
(`"AlvarezMaria"`, `docs/a44-scope.md` section 10's branch 2) does not, and
under that wording the legacy path would need the row to CARRY its pre-fold
display or its identity key - a change to `StudentSubmissionEntry`
(`src/lib/grade/types.ts:393-415`) and `GradeResultBase` (`:212-271`) and every
producer of a `GradeResult`. **This plan is built on the suffix form**, which is
also the scope's own recommendation. Section 10 prices the alternative.

### 4.4 Red before, green after - stated per assertion, honestly

The brief asks what is red before this wave and green after it. Three of the
assertions this wave needs are NOT of that shape, and saying so is the point:
a protection that is green on both sides is still a real requirement, and the
thing that proves it can fail is the sabotage, not the before-state.

| Assertion class | Before Wave 1 | After Wave 1 | Measured |
|---|---|---|---|
| Per-student folders produce one row per folder (A41's F3 shape) | **RED** - rows=1, displays `[essay]` | GREEN - rows=3, 3 distinct displays | h1, `today` vs `always` |
| A zip-wrapped per-student-folder upload produces one row per folder (the check's GAP-A, `docs/a44-check.md:487`) | **RED** - rows=1, key `bulk` | GREEN - rows=3, displays `[bulk (AlvarezMaria), bulk (BrownTom), bulk (ChenLi)]` | h1 |
| No two returned rows share a `student` string (`utils.test.ts:360-375`) | GREEN, but as the TAUTOLOGY A41 diagnosed - the folder shape yields one row, so uniqueness is free | GREEN, and load-bearing for the first time | h1: `keyOnly` gives rows=3 distinctDisplays=1, so this assertion is RED against a key-only implementation. That is the sabotage, not the before-state. |
| A key-unchanged row keeps its saved edit across runs | GREEN (`today`: EDIT SURVIVED=true) | GREEN (`always`: true) | S2. It is RED against the CONDITIONAL-fold implementation (`onCollision`: false). A protection, not a fix. |
| A pre-fold saved edit survives the first post-fold run | not applicable - nothing to migrate | GREEN | S3. RED against a Wave 1 implementation without the legacy read path (`foundByTodaysLoader=false`). |

**Does the whole suite stay green after Wave 1?** Measured, not asserted. Every
fixture literal in the two test files that drive the changed functions was run
through the real `parseSubmissionFileName` under all four modes. **Exactly ONE
existing fixture's OUTPUT moves, and its assertion still passes:**

```
### utils.test.ts:362-370 THE UNIQUENESS GUARD fixture      (asserted at :371-373)
    today                        rows=4 displays=[janedoe, johndoe, marysmith, otherfile]       distinctDisplays=4
    keyOnly                      rows=4 displays=[janedoe, johndoe, marysmith, otherfile]       distinctDisplays=4
    keyPlusDisplayAlways         rows=4 displays=[janedoe, johndoe, marysmith, otherfile (src)] distinctDisplays=4
    keyPlusDisplayOnCollision    rows=4 displays=[janedoe, johndoe, marysmith, otherfile]       distinctDisplays=4
```

`"src/otherfile.py"` reaches step 6 with the folder segment `src`, so its display
becomes `otherfile (src)`. `:373` asserts only
`new Set(students).size === students.length`, which is 4 against 4. Green.

The other eleven fixtures are byte-identical across all four modes, because each
resolves at step 2 or step 3 (the convention branch) and the fold never applies
there: `utils.test.ts:161-174`, `:201-204`, `:212-221`, `:230-235`, `:241-246`,
`:262-275`, `:297-312`, `:326-329`, `:343-346`, `:379`, and
`extraction.test.ts:248-259`. In particular `utils.test.ts:380-389`'s exact
`toEqual` over the whole returned row object is untouched (display stays
`janedoe`) - which is also why **no wave may add a REQUIRED field to
`groupSubmissionsByStudent`'s returned entry without editing
`utils.test.ts` in the same wave**; `toEqual` treats an always-present new
field as a mismatch.

### 4.5 Gate for Wave 1

Every step's pass condition is stated. Read exit codes from the command.

1. **`git status --short`** in the main checkout. Pass: exactly the 5 assigned
   paths, plus whichever sibling-owned entries were present at dispatch and
   recorded in the brief. Any other path is a failure, including anything under
   `.claude/worktrees` (`docs/loop/this-repo.md` section 7 - `Glob` returns the
   worktree copy FIRST, so a report is not evidence).
2. **`npx tsc --noEmit`** - this wave is the single caller. Pass: no output at
   all, exit 0.
3. **`npm run lint`** - pass: `4 problems (0 errors, 4 warnings)`, exit 0. A
   fifth warning is this wave's regression, named, not absorbed.
4. **The named set**, one command, never a raw multi-path vitest:
   ```
   npm run test:paths -- src/lib/grade/utils.test.ts src/lib/grade/extraction.test.ts src/lib/grade/single-file-entry.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts src/app/components/grading-results/gradingResultsHelpers.test.ts src/app/components/grading-results/gradingResultsHelpersEditState.test.ts src/app/components/grading-results/ungradedDisclosure.test.ts src/app/components/grading-results/gradingResultsEditsIdentity.test.ts
   ```
   Pass: a `COVERED` line for EVERY argument, 0 failed, exit 0. The measured
   pre-wave baseline for the first seven of those paths, run this pass:
   ```
   COVERED src/lib/grade/utils.test.ts files=1 passed=28
   COVERED src/lib/grade/extraction.test.ts files=1 passed=9
   COVERED src/lib/grade/single-file-entry.test.ts files=1 passed=15
   COVERED src/lib/grade/grouping-zip-parents.wiring.test.ts files=1 passed=7
   COVERED src/app/components/grading-results/gradingResultsHelpers.test.ts files=1 passed=45
   COVERED src/app/components/grading-results/gradingResultsHelpersEditState.test.ts files=1 passed=28
   COVERED src/app/components/grading-results/ungradedDisclosure.test.ts files=1 passed=47
   (with src/lib/module-graph/runtime-import-graph.test.ts as the eighth: files=1 passed=174)
   Test Files  8 passed (8) / Tests  353 passed (353)
   EXITCODE=0
   ```
   A `NOT COVERED` line on the new file means the new test file exists and
   matched nothing - which is the failure mode a raw `vitest run` hides
   (`docs/loop/this-repo.md` section 1).
5. **Hygiene and ceiling sweeps**, one command:
   ```
   npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/file-size-ceiling.structure.test.ts
   ```
   Measured pre-wave: `COVERED ... passed=18 / 3 / 3`,
   `Test Files 3 passed (3) / Tests 24 passed (24)`, `EXITCODE=0`. Never
   hand-roll an emoji or byte scan - `grep -P` here exits 0 without checking.
6. **`npm test`** - pass: 0 failed, and the file/test counts at or above the run
   taken on the same tree immediately before the wave. The card's
   1111/22454 is explicitly a drifting snapshot
   (`docs/loop/this-repo.md` section 1); measure, do not quote.
7. **`npm run build`** - pass: the line `Compiled successfully` is present.
   The exit code is 1 by design (no `.env` in this checkout) and must not be
   `&&`-chained. This is the ONLY gate that catches a `"use server"` file
   exporting a non-async binding; Wave 1 touches no such file, and the gate runs
   anyway.
8. **Line counts**, both counters, on every written file: each strictly under
   1000. Projected: `utils.ts` 393 + the fold, `gradingResultsHelpers.ts`
   728 + the legacy path, `utils.test.ts` 390 + fixtures. None of the three has
   an `ALLOWED_OVERAGE` entry:
   ```
   $ grep -nE "grade/utils|grade/extraction|grade/engine|GradingResults|gradingResultsHelpers|actions/grading" src/file-size-ceiling.structure.test.ts
   exit=1        (no ratchet entry for any of them - they must stay under 1000)
   $ grep -nE "lms-generation.test.ts" src/file-size-ceiling.structure.test.ts
   76:  "src/app/actions/lms-generation.test.ts": {
   exit=0        (POSITIVE CANARY: the same command DOES find a real entry)
   ```

---

## 5. Wave 2 in detail

### 5.1 What it changes

A new pure leaf computing the refined refusal decision of RULING 87 over a run's
`submissions` keys and `zipParents`, shaped like `decideZipIntake`
(`src/lib/submission-zip-intake.ts:112`), plus its two call sites. The refusal
is delivered by THROWING, which is the mechanism `engine.ts:443` already uses for
an ingestion-level refusal on the same branch.

### 5.2 Where it is called, and why that is exactly two places

`docs/a41-scope.md:955-962` requires the write set to reach BOTH of
`gradeAction`'s zip-reaching branches - `src/app/actions/grading.ts:854`
(embedded, `extractStudentEntries`) and `:905-907` (Gemini, `gradeSubmissions`)
- "or the collision decision ships live on one provider and dead on the other."
Census re-derived this pass:

```
$ grep -rn "extractSubmissions" src --include=*.ts --include=*.tsx
src/app/actions/llm-content.ts:667    <- testGeminiAction, a DIAGNOSTIC that takes only the first file
src/lib/grade/engine.ts:423,428       <- gradeSubmissions (the Gemini zip branch)
src/lib/grade/extraction.ts:33,137    <- the definition, and extractStudentEntries (the embedded branch)
src/lib/grade.ts:12                   <- barrel re-export
  (remaining hits are extraction.test.ts and grouping-zip-parents.wiring.test.ts)
exit=0
$ grep -rn "groupSubmissionsByStudent" src --include=*.ts --include=*.tsx | grep -v "\.test\."
src/lib/grade/engine.ts:425,432
src/lib/grade/extraction.ts:11,138
src/lib/grade/utils.ts:290
src/lib/grade.ts:14
exit=0
```

**Three placements are available and two of them are wrong, measured:**

- **Inside `extractSubmissions`** (one edit, both branches reached) - WRONG.
  `src/app/actions/llm-content.ts:667`'s `testGeminiAction` also calls it, and
  that action deliberately grades nothing (`:669-676`: it takes `entries[0]`
  and truncates to 2000 chars). A refusal there fires where nothing was at
  risk, which is precisely what `docs/a41-test-notes.md` R4c
  (`:458-475`) forbids.
- **Inside `groupSubmissionsByStudent`** (one edit, both branches reached) -
  WRONG. It is a pure function with 28 pinned tests in `utils.test.ts`, and
  `docs/a41-test-notes.md` R2 (`:318-338`) freezes its F3 row count as a
  CHARACTERISATION that must be READ, not thrown.
- **Inside `extractStudentEntries` (`extraction.ts:137-138`) and
  `gradeSubmissions` (`engine.ts:427-437`)** - CORRECT, and it is two edits
  because those are two files. Both are in this wave's write set.

**`src/app/actions/grading.ts` needs no edit, and that is a measured finding,
not an omission.** The refusal throws; `gradeAction`'s outer catch at
`grading.ts:921-924` returns `{ run: null, error: message }` with `err.message`
VERBATIM at `:923`; `state.error` renders at `GradingTab.tsx:262-266` with
`role="alert"`; and all three exposed unattended callers already read `.error`
(`docs/a41-test-notes.md:396-401`, re-verified as a citation, not re-derived).
So the reachability chain is INHERITED from a landed path rather than built,
which is what keeps the 941-of-1000 file out of every write set. **The
reachability claim about the RENDERER remains a reading claim** - no component is
rendered by any test here - and is RES-A44W-5.

**`src/lib/grade.ts` needs no edit either**: both call sites are inside
`src/lib/grade/`, so the leaf needs no barrel export, which also keeps it clear
of the barrel's client-bundle hazard documented at
`gradingResultsHelpers.ts:58-80`.

### 5.3 Write set, with the two source-text tests that can turn it red

**WRITTEN by Wave 2 (6 paths):**

```
src/lib/grade/collisionRefusal.ts                          (NEW)
src/lib/grade/collisionRefusal.test.ts                     (NEW)
src/lib/grade/collisionRefusal.wiring.test.ts              (NEW)
src/lib/grade/extraction.ts
src/lib/grade/engine.ts
src/app/actions/grading.collisionRefusal.test.ts           (NEW)
```

**READ-COUPLED, not written - two of these are frozen source-text assertions
over the files this wave edits, and each has a stated condition:**

| Path | What it pins | Condition for Wave 2 to stay green |
|---|---|---|
| `src/lib/grade/grouping-zip-parents.wiring.test.ts` | `:48-63`: every file must destructure `zipParents` from an `await extractSubmissions(` call AND **every** `groupSubmissionsByStudent(...)` call in the file must forward it - the regex is `/groupSubmissionsByStudent\(([\s\S]*?)\)\s*;/g` | the inserted refusal call must not add a second `groupSubmissionsByStudent(` call and must not remove `zipParents` from either existing argument list. Inserting a separate statement between the destructure and the group call does not match that regex at all. |
| `src/lib/module-graph/runtime-import-graph.test.ts` | `:653-663`: a FROZEN deep-equal list of exactly NINE import trails from `lib/grade/engine.ts` to `lib/supabase`, computed by walking each of engine.ts's DIRECT edges independently (`:669-685`) | the new leaf's import closure must reach nothing under `lib/supabase`. `engine.ts` already imports `./types` (`:9-22`) and `./utils` (`:24`) statically and neither appears as a first hop in the frozen list, so a leaf importing only those two adds zero trails. A leaf that imports the `@/lib/grade` barrel, `../canvas`, or `./rubric` grows the list and the deep-equal goes RED. |
| `src/app/actions/grading.budget.test.ts` | mocks `extractStudentEntries` (`:27`, `:110`) | the mock replaces the function the refusal lives inside, so the refusal never runs there. Unaffected - and this is also why this wave cannot rely on that file to prove reachability. |
| `src/lib/grade/extraction.test.ts` | `:246-271` drives `extractStudentEntries` end to end on real bytes | its fixture's two files resolve at step 3, keys `janedoe`/`johndoe`, no fallback-reaching collision, so the refusal must not fire. Measured: rows=2, distinct. |
| the three sweeps in 4.2 | they collect the four new files automatically | in the gate. |

### 5.4 Red before, green after

- **RED before**: every assertion in `collisionRefusal.test.ts` and
  `collisionRefusal.wiring.test.ts` - the module does not exist, so the import
  fails. `grading.collisionRefusal.test.ts` is red because `gradeAction`
  returns a graded run for a colliding zip instead of a refusal.
- **GREEN after**: those three files pass, and nothing else moves. The nine
  frozen import trails are unchanged (5.3's condition), the wiring detector's
  two checks still hold (5.3's condition), and no fixture in the existing suite
  presents a fallback-reaching collision that the refusal would newly reject -
  measured across all sixteen shapes in section 4.4 and section 7.2.
- **The absence claim this wave rests on**, with its canary at the same command
  shape and the same filter:
  ```
  $ grep -rln "resolve to the same student" src
  exit=1                       (A41's own decision-leaf instrument: nothing in src/ refuses today)
  $ grep -rln "leafStemFallback" src
  src/lib/grade/single-file-entry.test.ts
  src/lib/grade/single-file-entry.ts
  src/lib/grade/utils.ts
  exit=0                       (CANARY, same command, same filter: it CAN find a present string)
  ```
  Read directly rather than inferred: `extraction.ts:137-138` is two lines
  (`extractSubmissions` then `return groupSubmissionsByStudent(...)`) with
  nothing between them, and `engine.ts:427-437` likewise. **A41 exists only as
  documents; there is no decision leaf in `src/`.** Section 7.1 is the
  consequence.

### 5.5 Gate for Wave 2

Identical in shape to 4.5, with these substitutions:

- step 1: exactly the 6 assigned paths.
- step 4:
  ```
  npm run test:paths -- src/lib/grade/collisionRefusal.test.ts src/lib/grade/collisionRefusal.wiring.test.ts src/app/actions/grading.collisionRefusal.test.ts src/lib/grade/extraction.test.ts src/lib/grade/utils.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/app/actions/grading.budget.test.ts
  ```
  Pass: a `COVERED` line for every argument, 0 failed, exit 0. Measured
  pre-wave for the five that exist today: `utils.test.ts passed=28`,
  `extraction.test.ts passed=9`, `grouping-zip-parents.wiring.test.ts passed=7`,
  `runtime-import-graph.test.ts passed=174`; `grading.budget.test.ts` was not in
  the run above and must be baselined at dispatch rather than quoted from here.
- step 8: the new leaf and all three new test files strictly under 1000 by both
  counters; `extraction.ts` (300) and `engine.ts` (517) likewise. Neither has an
  `ALLOWED_OVERAGE` entry (4.5's grep, exit 1, with its positive canary).

---

## 6. Disjointness, proven in BOTH senses

### 6.1 Sense one: exact path, computed mechanically

```
$ cat w1.txt w2.txt | sort | uniq -d
(no output)
exit=0                                 <- EMPTY is the only pass

$ cat w1.txt siblings.txt | sort | uniq -d
(no output)
exit=0
$ cat w2.txt siblings.txt | sort | uniq -d
(no output)
exit=0

$ cat w1.txt w1.txt | sort | uniq -d   <- POSITIVE CANARY: the same command DOES print duplicates
src/app/components/grading-results/gradingResultsEditsIdentity.test.ts
src/app/components/grading-results/gradingResultsHelpers.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
src/lib/grade/utils.test.ts
src/lib/grade/utils.ts
exit=0
```

`w1.txt` is section 4.2's five written paths; `w2.txt` is section 5.3's six;
`siblings.txt` is `docs/a44-test-notes.md`, `docs/r4-scope.md`,
`docs/css-orphans.md`, `docs/a44-waves.md`. The read-coupled lists in 4.2 and
5.3 DO intersect (`grouping-zip-parents.wiring.test.ts`,
`extraction.test.ts`, `utils.test.ts` and the three sweeps appear in both), and
that is stated rather than hidden: it is another reason the two waves are
SEQUENCED, since a read-coupled file that one wave's gate must observe green is
not safe to have a sibling changing underneath it.

### 6.2 Sense two: informational independence, computed from each side's STATED write set

| Fact | Who establishes it | Who designs against it |
|---|---|---|
| the six-step identity priority order (`utils.ts:142-175`) | A14, LANDED | both waves |
| **what a file's identity KEY is - specifically whether the folder segment is folded into it** | **WAVE 1** | **WAVE 2** - the refusal counts fallback-reaching files that SHARE A KEY, and the refined amnesty counts DISTINCT FOLDER SEGMENTS in the same run. Both quantities are defined by Wave 1's fold. |
| the refusal's channel (`error`), the catch at `grading.ts:921-924`, the two zip branches at `:854` and `:905-907` | LANDED | Wave 2 |
| the display-keyed storage contract (`seedEdits` keys on `result.student`, `gradingResultsHelpers.ts:287`) | LANDED | Wave 1 |
| the 1000-line ceiling (`LIMIT = 1000` at `file-size-ceiling.structure.test.ts:41`) | LANDED | both |

**Wave 2 designs against a fact Wave 1 establishes. They are COUPLED,
directionally.** Per `docs/loop/parallel-disjointness.md` section 3 the options
are sequence, merge, or extract the shared contract; the coupling is
DIRECTIONAL rather than mutual, so **SEQUENCE: Wave 1 lands, then Wave 2 is
briefed with Wave 1's landed output.** They must NOT be dispatched
concurrently even though their file sets are disjoint - that is exactly the
second failure the card says passes every file-level check and is invisible
until integration.

**Why this ordering and not the reverse, said explicitly:** with Wave 2 first,
the refusal would have to ship A41's folder-UNAWARE predicate (nothing else is
computable before the fold exists) and then be rewritten by Wave 1 - two
versions of one predicate and two versions of its frozen oracle. With Wave 1
first, the refusal is written once, in the only form RULING 87 sanctions.

**A third item is coupled and is not a wave of this item.**
`docs/a44-test-notes.md` is being authored concurrently and establishes the
oracle both waves' tests are built from, while designing against this document's
wave boundaries. That is a MUTUAL coupling between two live seats, created by
RULING 86's split, and it cannot be resolved by a file-set check. What the test
author must be re-briefed with, concretely, before either wave is dispatched:

- the display fold is **per-file and unconditional**, not collision-triggered
  (section 4.3) - which changes what the display column of any frozen table says
  for a non-colliding foldered row;
- A41 F3's `rowsOut` moves from the frozen **1** to **3**, and its `DECISION`
  from **REFUSE** to **ALLOW** (no fallback-reaching collision survives the
  fold); F8's `rowsOut` moves from **3** to **4** and its `DECISION` from
  **REFUSE** to **ALLOW**; F6 stays **REFUSE** per RULING 87; F4 and F9 stay
  **REFUSE** because no folder exists to fold (section 7.2 measures all of
  these);
- Wave 1 is ONE wave containing both folds AND the storage layer's legacy read
  path, so an instrument that assumes a key-only intermediate state has no
  state to bind to;
- the decision leaf's reserved path and its exactly two call sites.

### 6.3 Shared resources no file list shows

- **`npx tsc --noEmit` has exactly one caller**: the wave gate. Forbidden to
  every other concurrent agent in that window.
- **No two agents sabotage-verify on this tree at once.** Each wave's sabotage
  pass (the test author's protocol, not this document's) mutates shared files;
  every sibling measurement taken during that window is untrustworthy.
- **`git stash` reverts every sibling's files; `git add -A` stages them.**
  Forbidden in both waves' briefs. Each wave stages its own explicit paths.
- **`docs/BACKLOG.md` is a file like any other.** If a wave's brief lets it
  write the backlog, the orchestrator must not write the backlog in that window.
- **A stale `.claude/worktrees` copy is returned FIRST by `Glob`**, so
  `git status --short` in the main checkout is the only proof of what changed.

---

## 7. Where this plan diverges from the scope, and from R2's citations

### 7.1 `docs/a44-scope.md` section 8's first requirement does not hold against the tree, and I am not adopting it silently

The scope requires:

> "**The key fold (2.2) and the decision predicate (3.3) are now ONE change, not
> two.** A wave that lands the key fold without also landing the folder-aware
> refusal ships the 14.6% -> 25.1% regression measured in section 3.1, live,
> with every existing gate green. Whoever plans this must land both in the same
> wave, or land the refusal first with the key fold as its own
> immediately-following wave with no intervening ship."

**The measurement it rests on is real; the conclusion does not transfer to this
tree.** The 14.6% and the 25.1% are both rates of a predicate that DOES NOT
EXIST IN `src/`. Section 5.4's absence claim, with its canary, plus a direct
read of the only two places the predicate could sit (`extraction.ts:137-138`
and `engine.ts:427-437`, adjacent lines with nothing between them), establish
that today's conservative refusal rate is **0%, because nothing refuses**.
So a key-fold wave landing alone cannot RAISE a false-refusal rate from 14.6%
to 25.1%; there is no 14.6% in production to raise. What Wave 1 alone ships is:
the folder shapes fixed, and the flat shapes silently blended exactly as they
are today (measured: A41's F4 is unchanged under all four modes, section 7.2).
**That intermediate state is strictly better than today's and never worse**,
which is what makes Wave 1 independently landable.

The scope's requirement and this plan disagree, and neither value is adopted
silently: **the scope's number is correct about the mechanism and wrong about the
baseline; this plan adopts two waves and the conflict is recorded here for the
checker to rule on.** The scope's SECOND requirement in the same section - that
the display fold land in the same wave as the key fold - is adopted in full and
is section 4.3's Fact 1.

### 7.2 The frozen-oracle rows this plan moves, measured so the test author does not re-derive them

Not a proposed oracle. These are the rows whose FROZEN values change, which is a
sequencing fact.

```
### A41 F3 (a41-test-notes.md:215)
    today    rows=1 displays=[essay]                                                  fallbackKeyCollisionPresent=true
    always   rows=3 displays=[essay (AlvarezMaria) | essay (BrownTom) | essay (ChenLi)] fallbackKeyCollisionPresent=false
### A41 F6 (a41-test-notes.md:218)
    today    rows=1 displays=[Homework]                 collision=true
    always   rows=1 displays=[Homework (AlvarezMaria)]   collision=true   <- stays REFUSE per RULING 87
### A41 F4 (a41-test-notes.md:216) - FLAT, no folder at all
    today    rows=1 displays=[Homework] fallbackKeyCollisionPresent=true
    always   rows=1 displays=[Homework] fallbackKeyCollisionPresent=true   <- UNCHANGED by any fold
### A41 F8 (a41-test-notes.md:220) - mixed
    today    rows=3 displays=[alvarezmaria | browntom | reflection]                                   collision=true
    always   rows=4 displays=[alvarezmaria | browntom | reflection (ChenLi) | reflection (DavisAnn)]  collision=false
### GAP-A (a44-check.md:487) - bulk.zip containing per-student FOLDERS
    today    rows=1 displays=[bulk]                                              collision-irrelevant
    always   rows=3 displays=[bulk (AlvarezMaria) | bulk (BrownTom) | bulk (ChenLi)]
### B3's false split (a44-check.md:382) - ONE student, backend/ + frontend/, same filename
    today    rows=1 displays=[config]                              collision=true
    always   rows=2 displays=[config (backend) | config (frontend)] collision=false
### shared-wrapper-folder (a44-scope.md 3.2) - whole class in ONE folder
    today    rows=2 displays=[essay | report]                             collision=true
    always   rows=2 displays=[essay (Submissions) | report (Submissions)] collision=true
```

Two consequences worth stating plainly, because neither is in the scope:

- **The unconditional fold slightly MITIGATES B3's invisibility.** The check
  (`docs/a44-check.md:394`) noted the two false-split rows both display
  `config`; under the fold they display `config (backend)` and
  `config (frontend)`, so the split is at least legible. The split RATE is
  unchanged - it is a key-level fact, and the scope's accepted 97.6% stands.
- **The unconditional fold decorates displays with a NON-identifying folder
  name in the shared-wrapper case** (`essay (Submissions)`). Where the run's
  fallback keys collide, Wave 2 refuses and nobody sees it. Where they do not
  (A41's shapes 2 and 4, "unchanged, correct"), a correct row's display gains a
  meaningless suffix. That is a cosmetic regression on a correct shape and it is
  the price of Fact 2 in section 4.3. RES-A44W-3.

### 7.3 A stale header comment in each wave's own file, and who owns correcting it

The brief names one. I found two, and cannot determine with certainty which was
meant, so both are assigned.

**Primary - `src/lib/grade/utils.test.ts:80-84`, a claim the code contradicts
twice**, verbatim from the tree:

```
// a shared filename stem ("main", "report"). Fixed per the binding rulings
// in scratchpad/a14-rulings.md: leaf-first, then an outward-in scan of the
// WHOLE zip-crossing chain extraction.ts now threads through, ground truth
// (a crossing match) outranking a byBase guess, and the userId folded into
// the grouping key so sanitized-name collisions do not merge.
```

- "an **outward-in** scan" is the direction the code explicitly does NOT take.
  `utils.ts:150-152`: "THE CROSSING CHAIN, scanned NARROWEST FIRST (A14 rulings
  v2 CORRECTION 1 - this scanned outward-in, outermost first, before, and that
  was wrong)". The same wrong direction survives in an `it()` description at
  `utils.test.ts:119`.
- "the userId folded into the grouping key so sanitized-name collisions do not
  merge" was WITHDRAWN. `utils.ts:76-85` records CORRECTION 2 withdrawing it,
  and `utils.test.ts:324-334` pins the OPPOSITE as current behaviour ("merges
  two different students' files into one row"). A reader of the header would
  conclude A44's fold is a second such fold and that the first one worked.

**Owner: Wave 1**, which writes that file.

**Secondary - `src/app/components/grading-results/gradingResultsHelpers.ts:16-25`,
an "Owns:" list that understates the file.** The list names the type aliases,
the sort model, the editable-row model, numeric parsing, `formatFeedback` and
CSV export. `grep -nE "^export (function|const|interface|type)"` on that file
returns 39 exported names (exit 0), including the whole persistence group the
header does not mention: `gradingResultsEditsKey` (`:558`), `mergeStoredRowEdit`
(`:597`), `loadPersistedEdits` (`:619`), `loadGradingResultsEdits` (`:641`),
`persistGradingResultsEdits` (`:663`). Wave 1 adds behaviour to exactly that
unmentioned group, so **Owner: Wave 1**, and the correction is one sentence.

### 7.4 R2/R4's citations into a file Wave 2 edits

`docs/r2-scope.md:290` and `docs/r2-check.md:60,63` pin
`src/lib/grade/extraction.ts:202` and `:210` as hops in a PAT-reaching closure
trace. Wave 2 inserts at roughly `extraction.ts:137`, which shifts both. Section
8 carries the obligation. On the other axis the two items are clean:

```
$ grep -nE "requireOwner|requireUser|requireAppOwner" src/lib/grade/utils.ts src/lib/grade/utils.test.ts src/lib/grade/extraction.ts src/lib/grade/engine.ts src/app/components/grading-results/gradingResultsHelpers.ts src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
exit=1                 (none of R2/R4's universe's symbols appear in any file this plan writes)
$ grep -nE "requireOwner" src/app/actions/grading.ts | head -3
14:import { requireOwner } from "@/lib/supabase/auth";
37:    const user = await requireOwner();
54:    await requireOwner();
exit=0                 (POSITIVE CANARY, same command: a file that IS in R2's universe)
```

R4's own wave, per its backlog row, is one site in
`src/app/actions/deck-source.ts` plus bookkeeping - no intersection. **But sets
change as work proceeds**, so the intersection must be RE-RUN at dispatch time
against whatever R2/R4 actually land, not read from this document.

---

## 8. Line-shift obligations this plan creates

Every wave here inserts lines above existing ones, so every `file:line` citation
below the insertion point goes stale. The delta itself cannot be computed before
the code is written; what CAN be computed, and is, is the SIZE and LOCATION of
the obligation. Two instruments, because a bare basename over-counts (this repo
holds several files named `utils.ts`, `engine.ts` and `extraction.ts`).

**(A) Path-qualified citations, repo-wide, unambiguous.** Pattern shown with
each count.

| Edited file | pattern | total citations elsewhere |
|---|---|---|
| `src/lib/grade/utils.ts` | `grade/utils\.ts:(\d+)` | 13 |
| `src/lib/grade/utils.test.ts` | `grade/utils\.test\.ts:(\d+)` | 2 |
| `src/lib/grade/extraction.ts` | `grade/extraction\.ts:(\d+)` | 12 |
| `src/lib/grade/engine.ts` | `grade/engine\.ts:(\d+)` | 35 |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | `grading-results/gradingResultsHelpers\.ts:(\d+)` | 4 |

**(B) All citations inside the A41/A44 chain documents plus the two backlog
files plus `docs/REGRESSION.md`**, where a bare basename unambiguously means the
grade module in the chain documents:

| Edited file | a41-scope | a41-test-notes | a41-check | a44-scope | a44-check | chain subtotal | BACKLOG.md / backlog.yml / REGRESSION.md |
|---|---|---|---|---|---|---|---|
| `utils.ts` | 6 | 4 | 2 | 4 | 6 | **22** | 4 / 4 / 1 |
| `utils.test.ts` | 2 | 4 | 2 | 3 | 4 | **15** | 0 / 0 / 0 |
| `extraction.ts` | 5 | 4 | 5 | 1 | 5 | **20** | 5 / 5 / 0 |
| `engine.ts` | 1 | 4 | 1 | 2 | 3 | **11** | 14 / 14 / 7 |
| `gradingResultsHelpers.ts` | 2 | 1 | 2 | 0 | 2 | **7** | 5 / 5 / 0 |

**The bare-name counts in the last column are an UPPER BOUND**, because
`docs/BACKLOG.md`, `docs/backlog.yml` and `docs/REGRESSION.md` cite several
same-named files (`content-tab/utils.ts`, other `engine.ts` files). Whoever
re-pins must check those individually rather than trusting the count.

**Who re-pins, per artifact:**

| Artifact | Owner | When |
|---|---|---|
| `docs/a44-test-notes.md` (not yet in the tree) | `loop-test-author`, the live sibling | as part of authoring, so it never ships a stale citation - and re-checked after each wave lands |
| `docs/a44-scope.md`, `docs/a44-check.md`, `docs/a41-*.md` | **nobody re-pins them, deliberately.** They are a dated record of a decision, not a live index; `traps-spec.md`'s rule is "brief from the tree, not from the doc". | n/a - but any LATER brief quoting a line from them must re-open it against the tree first |
| `docs/BACKLOG.md` and `docs/backlog.yml` rows A41, A44, R2, R4 | the orchestrator, at reconciliation | the push that lands each wave |
| `docs/REGRESSION.md`'s 7 `engine.ts:` citations | the baseline/regression seat for this group | the group's single regression pass; use `grep -a` on that file |
| `docs/r2-scope.md:290`, `docs/r2-check.md:60,63` (`extraction.ts:202`, `:210`) | the orchestrator, at reconciliation, or R4's own seat if it is still live | after Wave 2 lands - section 7.4 |
| `src/lib/module-graph/runtime-import-graph.test.ts:653-663` | **nothing to re-pin**: the frozen list is by MODULE PATH, not by line, so a line insertion cannot stale it. Only a new import can. | n/a |
| `src/app/components/grading-results/ungradedDisclosure.test.ts:146` (`engine.ts:146`) | Wave 2's implementer, if the insertion moves it | Wave 2's gate - this one is a citation inside `src/`, so a stale value ships in code |

---

## 9. Ceilings: measured, and no extraction is planned

`LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:41`, repo-wide over
all of `src/`. No file this plan writes has an `ALLOWED_OVERAGE` entry (4.5's
grep, exit 1, with its positive canary), so each must stay strictly under 1000.

| File | today (both counters) | wave | headroom |
|---|---|---|---|
| `src/lib/grade/utils.ts` | 393 | 1 | 607 |
| `src/lib/grade/utils.test.ts` | 390 | 1 | 610 |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | 728 | 1 | 272 |
| `src/lib/grade/extraction.ts` | 300 | 2 | 700 |
| `src/lib/grade/engine.ts` | 517 | 2 | 483 |
| four new files | 0 | 1 and 2 | 1000 each |

**`src/app/actions/grading.ts` (941, 59 of headroom) and
`src/app/components/GradingResults.tsx` (906, 94 of headroom) are in NO wave's
write set.** Section 5.2 measures why `grading.ts` is not needed (the refusal
inherits a landed catch-and-render path) and section 4.3 measures why
`GradingResults.tsx` is not needed (the invariant "distinct keys implies
distinct displays" is restored inside `groupSubmissionsByStudent`, so all 30
display-keyed sites - including the post-to-Canvas fan-out at
`GradingResults.tsx:332-403` - keep working unchanged).

**No extraction is proposed here, by construction.** The orchestrator rules
extractions, and the brief is explicit that a wave needing to edit a
near-ceiling file must say so and stop. **No wave in this plan needs to.**
Section 10 names the single decision that would change that, and if that
decision goes the other way this plan stops and hands the ceiling question over
rather than planning the extraction itself.

**The condition under which `GradingResults.tsx` re-enters scope**, so it is not
discovered later: if any future display rule can produce two rows with the same
`student` string, the 30 display-keyed sites are live again. The enforcer is
`utils.test.ts:360-375`, which is exactly why `docs/a44-scope.md` section 5 calls
it this feature's primary regression test rather than inherited hygiene.

---

## 10. Review size, and the one decision that would collapse the two waves into one

**Wave 1 is reviewable.** Two production files. In `utils.ts`, a fold inside
`parseSubmissionFileName`'s steps 5-6 plus a display rule inside
`groupSubmissionsByStudent` - one cohesive mechanism, and section 2 proves it
cannot be split without splitting a function. In `gradingResultsHelpers.ts`, one
read-only fallback inside `loadPersistedEdits` (`:619-635`), following the
already-shipped precedent of `LEGACY_EMPTY_CANVAS_URL_EDITS_KEY` at `:562-567`.
The diff touches identity resolution AND persistence, which the brief flags as
the reason to consider splitting - and section 4.3 measures that splitting them
releases a state that loses instructor edits. **It is one unit because the data
loss says so, not because it is convenient.**

**Wave 2 is reviewable.** One new pure leaf, plus three to six lines at each of
two call sites. It is not splittable either: a decision leaf without its two
callers is dead code with a green gate, which is the failure
`traps-spec.md` names and which this repo has shipped twice this week.

**The decision that changes all of this** is the display wording, and it is the
architect's under RES-A44-1 (`docs/a44-scope.md` section 11). This plan is built
on **unconditional suffix**, which is the scope's own recommended wording
(section 10) applied unconditionally rather than on collision. If instead the
display folds only on collision, or replaces the display with the folder alone,
then by section 4.3's Fact 2 and 4.3's closing paragraph the persistence work
can no longer be a read-only fallback: the row must CARRY its identity key or
its pre-fold display, which means `src/lib/grade/types.ts` (`:393-415` and
`:212-271`), every producer of a `GradeResult`,
`gradingResultsHelpers.ts`, `GradingResults.tsx` (906 of 1000) and
`ungradedDisclosure.ts` all land in ONE wave together, and
`GradingResults.tsx`'s ceiling becomes a live question. **At that point this plan
stops and the ceiling question goes to the orchestrator** rather than my
proposing an extraction.

---

## 11. What `docs/a44-test-notes.md` owes - reference only, not authored here

Listed so no wave assumes an instrument exists. This document creates none of
them and names no fixture, expected literal or sabotage.

1. The repair of `utils.test.ts:360-375` from a tautology into this feature's
   primary regression test, exercised on a folder-shaped fixture. Section 4.4
   measures that it is RED against a key-only implementation
   (rows=3, distinctDisplays=1) - which is the sabotage it must survive.
2. The assertion the A44 row's own verify clause demands: one that EXECUTES the
   display-string keying in the grading-results helpers and shows zero orphaned
   edits across a run change. Section 4.3's S2 and S3 are the two populations.
3. A re-freeze of `docs/a41-test-notes.md` section 1.4's oracle for F3, F6, F4,
   F8 and F9, and of R2's frozen `rowsOut = 1` characterisation - section 7.2
   measures every one of those rows so they need not be re-derived.
4. The decision leaf's own oracle and the refined predicate's sweep, including
   the amnesty condition, and R4a/R4b/R4c's driven-`gradeAction` instruments
   (`docs/a41-test-notes.md:373-475`), which must be re-based onto A44's
   predicate.
5. The channel wiring test A41's R5 specifies (`:479-533`), with its three
   mandatory canaries, no `/s` flag (TS1501), and an anchor-resolves assertion
   at both ends of any `indexOf`/`slice` region.
6. A separator/collision instrument for the compound key that binds to the
   CONSTRUCTION rather than to a string assertion (`docs/a44-scope.md` 2.2, m2).

---

## 12. Residual register

Each carries an owner, an instrument and the step that will measure it. Missing
any of the three it is a deletion, and would be called that.

| id | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| RES-A44W-1 | The display WORDING is the architect's (RES-A44-1), and this plan's wave count depends on it. | the architect pass consuming `docs/a44-scope.md` | section 7.2's fixture sweep, re-run against the chosen rule, plus section 4.3's S2 | The chosen rule's display for a foldered row that does NOT collide in its batch. **RED if the display is not a function of the file alone** - at which point section 10's single-wave costing applies. | The architect pass, before Wave 1 is dispatched. |
| RES-A44W-2 | The legacy read path recovers the pre-fold display by inspecting the post-fold one. `leafStemFallback` (`utils.ts:121-126`) can return a stem containing arbitrary characters - `docs/a41-scope.md`'s own 13-path table records `"_draft one.docx" -> key="_draft one"` - so a stem that itself contains the suffix delimiter can mis-recover, and in the worst case recover a DIFFERENT row's stored edit. | Wave 1's implementer, from the test author's instrument | an assertion over the real `loadPersistedEdits` with a stem containing the delimiter, alongside the S3 population | The recovered edit's identity. **RED when a row recovers an edit stored for a different row.** | Wave 1's test step, before Wave 1's gate. |
| RES-A44W-3 | The unconditional fold gives a correct, non-colliding row in a shared wrapper folder a meaningless display suffix (measured: `essay (Submissions)`, section 7.2). Cosmetic, on a shape the fold does not otherwise touch. | the follow-up UX pass on the as-built diff | section 7.2's `shared-wrapper-folder` row, re-run against the built code | The display of a row in a single-folder run with distinct stems. **FAILS as a residual if the UX pass closes without ruling on it.** | The follow-up UX pass, after Wave 1 lands. |
| RES-A44W-4 | Line-shift re-pinning. Section 8's two tables are the size; the delta is not computable until the code exists. | per artifact, section 8's table | the two patterns in section 8, re-run after each wave | Each cited line against the post-wave file. **FAILS if a wave's push lands while any citation in `src/` (notably `ungradedDisclosure.test.ts:146`) still names a moved line.** | Each wave's push. |
| RES-A44W-5 | Whether newly-separated rows render as distinct, independently-editable rows, and whether the refusal's `state.error` actually lands in the instructor's eye at `GradingTab.tsx:262-266`. Carried forward from RES-A44-2; **no component is rendered by any test in this repo** and there is no API key, so neither is verifiable here. | the repo owner (browser check) | upload a real folder-shaped zip with Wave 1 live, then a real flat colliding zip with Wave 2 live; inspect the DOM | What is on screen. **FAILS if editing one row's grade visibly affects another, if fewer than the expected row count appears, or if the refusal text does not appear.** | Owner verification, after each wave. Blocks nothing. |
| RES-A44W-6 | The two live seats (`loop-plan` and `loop-test-author`) are MUTUALLY coupled by RULING 86's split and no file check can detect it (section 6.2). | the orchestrator | section 6.2's four-item re-brief list, delivered to whichever seat finishes second | The test notes' assumptions against this plan's boundaries. **RED if the test notes assume a key-only intermediate state, a collision-triggered display, or a decision leaf outside `src/lib/grade/`.** | Before either wave is dispatched. |

---

## 13. What I could not determine

- **Which of the two stale header comments the brief meant** (section 7.3). Both
  are measured and both are assigned to Wave 1, so nothing is dropped either way.
- **The exact line delta each wave inserts**, and therefore the exact re-pinning
  edits. Section 8 gives the size and location of the obligation and its owners;
  the delta is knowable only from the written diff.
- **Whether `docs/a44-test-notes.md`'s author will choose instrument file paths
  matching this plan's reserved ones.** Section 3 states the reservation and
  section 6.1 states that a rename must be re-intersected before dispatch.
- **Whether real instructor zips take these shapes at the assumed frequencies**
  (the scope's RES-A44-6). Not verifiable in this environment at all.

---

## 14. Tree state for this pass

Hygiene gates over this write, exit code read from the command:

```
$ npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/file-size-ceiling.structure.test.ts
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
COVERED src/file-size-ceiling.structure.test.ts files=1 passed=3
Test Files  3 passed (3) / Tests  24 passed (24)
EXITCODE=0
```

Scratch directory removed and its absence confirmed (section 0(h)).

**`git status --short`, read twice, because the tree moved under this pass.**
At the start, and again immediately after the scratch directory was removed:

```
 M docs/css-orphans.md
```

And after this file was written, the `loop-test-author` sibling having landed its
own artifact in between:

```
 M docs/css-orphans.md
?? docs/a44-test-notes.md
?? docs/a44-waves.md
```

`docs/a44-waves.md` is **this pass's only entry, in both readings.** Every other
line is sibling-owned. `docs/css-orphans.md` belongs to another row and was
already modified before this pass began; it was not touched here.
**`docs/a44-test-notes.md` is the live `loop-test-author` sibling's artifact. It
appeared between the two readings because that sibling wrote it, not because
anything here touched it - it was never read, opened, created or edited by this
pass, and it is not in this pass's write set.** It is now in the tree, which
means section 6.2's RES-A44W-6 re-brief is immediately actionable: whichever
seat the orchestrator reads second must be reconciled against the other, and
this document was authored with no knowledge of that file's contents.
`docs/r4-scope.md` had not written to the tree at either reading. **No
`git stash`, `git add -A` or `git checkout --` was run at any point, and nothing
under `src/` was written or mutated** - the only removal was `rm -rf .a44plan` on
the untracked directory this pass itself created.

---

## THE ONE QUESTION, shaped so every answer ends this activity

Not a stop. Both waves are fully specified under answer (1), which is what this
document is built on and what the scope itself recommends; the other two answers
change the wave COUNT and the ceiling exposure, which is why they cannot be
settled by another round of this document.

> **A44 must change how a graded row is LABELLED, and the rule chosen decides
> whether this is two reviewable waves or one large one. Measured this pass
> against the real storage functions: if a row's label is folded only when two
> rows would otherwise collide (the scope's own default), then an instructor's
> saved feedback on a row whose identity never changed is SILENTLY LOST the next
> time a classmate's file joins the upload - EDIT SURVIVED=false. If the label
> is folded whenever the folder was used as the identity signal, regardless of
> what else is in the upload, that loss is impossible by construction - EDIT
> SURVIVED=true - at the cost that a correct row inside a single shared folder
> gains a meaningless suffix (`essay (Submissions)`).**
>
> Pick ONE. Each ends this activity; the plan ships as it stands with the answer
> applied and everything unresolved recorded in section 12.
>
> **(1) ALWAYS NAME THE FOLDER when the folder decided the identity.** Two waves
> exactly as tabled in section 3. Five files in Wave 1, six in Wave 2,
> `grading.ts` (941 of 1000) and `GradingResults.tsx` (906 of 1000) untouched, no
> extraction needed. Cost of being wrong: some correct rows carry a suffix that
> names a folder every student shared, which is noise on screen and nothing more.
>
> **(2) NAME THE FOLDER ONLY WHEN TWO ROWS WOULD COLLIDE** (the scope's section
> 3.4 default). The row must then carry its identity key so storage can follow
> it, which merges Wave 1 with the whole consumer layer: `types.ts`, every
> `GradeResult` producer, `gradingResultsHelpers.ts`, `ungradedDisclosure.ts` and
> `GradingResults.tsx` at 906 of 1000 - and the ceiling question comes to you.
> Cost of being wrong: one large, hard-to-review wave over identity resolution
> AND persistence AND the post-to-Canvas fan-out, for a cosmetic gain.
>
> **(3) REPLACE THE LABEL WITH THE FOLDER NAME ALONE** (`AlvarezMaria` instead of
> `essay (AlvarezMaria)`). This is the cleanest label on screen and it has the
> same structural cost as (2): the pre-fold label becomes unrecoverable from the
> row, so the row must carry it, so the consumer layer merges into one wave.
> Cost of being wrong: as (2), plus the label stops naming the assignment.
>
> **My recommendation: (1).** It is the only one of the three where no released
> intermediate state loses an instructor edit AND no near-ceiling file is
> touched, and both of those are measured rather than argued. Its cost is a
> cosmetic suffix on a shape the refusal usually refuses anyway; the cost of
> being wrong about (2) or (3) is a single wave spanning identity, persistence
> and the grade-posting fan-out, which is the review size this plan exists to
> avoid.
