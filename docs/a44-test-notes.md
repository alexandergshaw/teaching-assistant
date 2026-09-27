# A44 test notes: instruments, frozen oracles and the sabotage protocol

Seat: `loop-test-author`. **Round 2, written 2026-09-27.** Round 1 is committed at
`1163a54`. Write set for this pass is exactly this one file; `git status --short`
is in section 13.

This document decides WHAT IS MEASURED and HOW IT FAILS for backlog row A44
(`docs/BACKLOG.md:118`). It does NOT decide the wave order, the wave count or any
write set - `docs/a44-waves.md` owns those and section 12 states only what my
instruments REQUIRE of them. Nothing here may be read as a wave plan.

## What this round applies rather than debates

Three rulings and one disproof arrived between round 1 and now. All four are
transcribed, not re-decided.

- **RULE K** (`docs/a44-architecture.md` section 2). The folded unit is the
  **container-relative directory PATH** - every segment between a file's
  innermost container and its leaf - folded into the identity key at steps 5 and
  6 only, with a length-prefixed encoding applied **TOTALLY at all six return
  sites**. This replaces round 1's immediate-parent segment, which measurably
  left a two-student blend one level down and produced a forgeable key.
- **RULE D** (same section). The display is the file's location in **path
  order**, unconditional, plus a **terminal disambiguation pass inside
  `groupSubmissionsByStudent`, walked in identity-key order**, guaranteeing
  pairwise-distinct labels. Zero of the 43 display-keyed sites change.
- **RULING 93.** The instructor's edit is filed under the **display**, and the
  recovery of the old label is **DELETED**. It requires zero code:
  `loadPersistedEdits` already drops a stored key absent from the current run
  (`src/app/components/grading-results/gradingResultsHelpers.ts:619-635`, its own
  comment at `:614-618`). **Round 1's R7, which specified key-keyed storage, is
  therefore WITHDRAWN** and re-pointed at the display in R7' below - not dropped.
- **The disproof** (`docs/a44-waves.md` 6.4). The architecture's D11 reasoned
  that RULING 87's frozen exact integer survives RULE K because the two folder
  definitions coincide at one directory deep, and said plainly it had not
  verified that. The wave plan constructed a shape where the verdict flips and
  refused to conclude a sign. **Section 1.5 settles it**: both documents are
  right about different things, and the resolution is that the eleven-shape
  sweep's SHAPE LIST, not its predicate, was the blind spot.

## Disposition of every round-1 requirement

Required by `docs/loop/iteration-caps.md` entry gate 3. The checker audits this
table before reading the rest.

| round 1 | Disposition in round 2 |
|---|---|
| R1 frozen oracle, 23 fixtures, six columns | **KEPT and EXTENDED.** Same 23 fixtures, `rowsToday` and `rowsAfter` unchanged on every one (measured, section 1.3). Four fixtures added (K1-K4) and two columns added: the **identity KEY** and MERGE. The display column is re-derived per RULE D. |
| R2 the soundness sweep, nine required shapes | **KEPT and EXTENDED to seventeen.** Section 1.4. The eleven original shapes are all exactly ONE directory deep, which is why they could not see the wave plan's flip; six directed shapes were added and three of them make the instrument fire. |
| R3 the row's own pass condition | **KEPT, and its frozen BASELINE integer is WITHDRAWN as unmeasurable here.** A41's predicate is not in the tree (`grep -rln "resolve to the same student" src` exits 1), so the pre-A44 refusal count cannot be produced by this pass. R3 becomes a construction requirement: both predicates over one population in one process. |
| R4 the false split as two independent absolutes | **KEPT.** Re-derived under RULE K; the discipline (two absolutes, never a delta) is unchanged and is the reason the numbers are comparable at all. |
| R5 the refusal is EMITTED by the producer | **KEPT VERBATIM.** Nothing in RULE K, RULE D or RULING 93 touches the channel. Still ARGUED, not executed - section 9. |
| R6 the refusal must not fire where nothing was at risk | **KEPT VERBATIM.** |
| R7 identity-key persistence | **WITHDRAWN by RULING 93 and RE-POINTED, not ignored.** R7' below is display-keyed: P1' (an unchanged display survives), P3' (the accepted one-time loss, as a test), P4 (unchanged), P5' (unchanged). P2, the key-keyed case, is deleted; its enforcer was nothing that exists. |
| R8 the copy | **KEPT, with one clause re-pointed.** The folder name a refusal quotes is now a container-relative PATH, not a segment, so clause C-D's label becomes `folder "Submissions/AlvarezMaria"`. Every other clause and all of C-A..C-F stand. |
| R9 the tautological guard repair at `utils.test.ts:360-375` | **KEPT, and its mechanism CHANGED.** Round 1 added two foldered paths to make `:373` falsifiable. Under RULE D the existing fixture's own `src/otherfile.py` display moves to `src/otherfile` and `:373` still passes at 4 against 4 (measured), so the repair is now a re-naming plus the two added paths, and `:129-130`/`:133-135` change with it. |
| R10 key-to-display injectivity, both directions | **SUPERSEDED by R15.** Its "the fold is SET-LEVEL by necessity" claim is WITHDRAWN - RULE D's fold is per-FILE and only the terminal pass is set-level. Its "what is NOT pinned: the suffix spelling" clause is also withdrawn: under RULING 93 the display IS the storage label, so the spelling is load-bearing and IS pinned (R15). |
| R11 the compound key's injectivity is a CONSTRUCTION | **KEPT and PROMOTED to R13**, the identity-KEY oracle, which is the highest-value instrument in this document. G13 stays its separator fixture. |
| R12 the gates | **KEPT**, with the `grep -c $'\r'` correction in section 6.0. |
| RES-A44T-1 F1 survives | **KEPT** as RES-A44T-1. |
| RES-A44T-2 real-world frequencies | **KEPT, and still a DELETION** - owner, step, no instrument. |
| RES-A44T-3 the entry-count copy constraint | **KEPT.** |
| RES-A44T-4 the 34 `GradingResults.tsx` sites | **KEPT.** |
| RES-A44T-5 folder case-folding | **KEPT and NARROWED.** RULE K lowercases the whole path in the key and preserves case in the display; the question is now whether two case-variant PATHS should merge. Still symmetric, still unpinned, mutant K-h still survives deliberately. |
| RES-A44T-6 the two near-ceiling files | **WITHDRAWN as a prediction** (architecture D6). Neither file is required to change; the residual had nothing left to trigger on. Replaced by the measurement in section 0.6. |
| RES-A44T-7 the 30-vs-43 census | **KEPT.** 43 stands; this pass did not re-derive it and does not need to - see section 11 item 4. |

---

## 0. How every number in this document was produced

### 0.1 The REAL modules, with the whole import-only diff printed

No production or test file was mutated. Four real files were copied into the
session scratchpad **OUTSIDE the repository** by a committed-to-disk Python
script (no shell heredoc - a doubled escape in a heredoc reaches python as an
octal escape) and driven with `node --experimental-strip-types`
(`node --version` -> `v22.14.0`). Exit codes are read from the command, never
through a pipe:

```
$ diff --strip-trailing-cr src/lib/grade/utils.ts <S>/g/utils.ts
1,3c1,3
< import type { SubmittedFileInfo, InferredFileNameLookup } from "./types";
< import type { CodeRunResult } from "../code-runner";
< import { getMimeType } from "./constants";
---
> import type { SubmittedFileInfo, InferredFileNameLookup } from "./types.ts";
> import type { CodeRunResult } from "./code-runner-stub.ts";
> import { getMimeType } from "./constants.ts";
diff src/lib/grade/utils.ts exit=1
$ diff --strip-trailing-cr src/lib/grade/types.ts <S>/g/types.ts
1c1
< import type { CodeRunResult } from "../code-runner";
---
> import type { CodeRunResult } from "./code-runner-stub.ts";
diff src/lib/grade/types.ts exit=1
$ diff --strip-trailing-cr src/lib/grade/constants.ts <S>/g/constants.ts
diff src/lib/grade/constants.ts exit=0        <- CANARY: the instrument does not always fire
$ diff --strip-trailing-cr src/app/components/grading-results/gradingResultsHelpers.ts <S>/g/grh.ts
50c50
< import type { GradeActionState } from "../../actions";
---
> import type { GradeActionState } from "./actions-stub.ts";
diff .../gradingResultsHelpers.ts exit=1
```

Both changed specifiers are type-only and erased before execution. Canaries that
the real code is what ran, printed by the harness itself:

```
CANARY removeLastExtension('a.b.c') = a.b
CANARY getBaseFileName('a/b/c.txt') = c.txt
CANARY baseline parseSubmissionFileName('src/main.py',undefined,[]).studentDisplay = main
CANARY RULE K  parseSubmissionFileName('src/main.py',undefined,[]).studentDisplay = src/main
CANARY mergeStoredRowEdit({strengths:'X'}, fallback).strengths = X
```

The baseline canary is exactly what `src/lib/grade/utils.test.ts:129-130` asserts
today, opened this pass.

### 0.2 ROUND 1's TWO REIMPLEMENTATIONS ARE BOTH ELIMINATED

Round 1 had to reimplement two things because it could not vary the keyer: a step
classifier, and `groupSubmissionsByStudent`'s Map-per-key grouping. Both are gone.

This pass builds the RULE K variant as a **patch of the real file**
(`g/utils_k.ts`), so:

- **the grouping is the REAL `groupSubmissionsByStudent` on BOTH paths** - the
  baseline's from `g/utils.ts`, the variant's from `g/utils_k.ts`. Round 1's
  per-fixture calibration control existed to check its reimplementation against
  the real function; there is nothing left to calibrate, and the control is
  retired rather than dropped;
- **the step discriminator is a FIELD on the variant's own return**
  (`reachedStemFallback`), which is exactly the export
  `docs/a44-waves.md` 3.3 measures Wave 2 needs. The baseline borrows it, and the
  borrow is sound because **no conditional differs between the two files** - the
  whole diff is printed below and every hunk changes a returned value.

**The variant's whole diff against the import-only baseline**, `exit=1`. This is
evidence about what RULE K costs and does, not an instruction to apply verbatim:

```
127a128,173   the helper block: a44Encode, a44DecodeKey, a44ContainerRelativeDir,
              a44Wrap, a44Fold
184a231       + reachedStemFallback: boolean;   on the return type
193c240   step 1  studentKey: rawInferred.studentDisplay.toLowerCase()
                      -> a44Encode([rawInferred.studentDisplay.toLowerCase()])
196a244   step 1  + reachedStemFallback: false,
204c252   step 2  ...identityFromConventionMatch(leafMatch)
                      -> ...a44Wrap(identityFromConventionMatch(leafMatch))
206a255   step 2  + reachedStemFallback: false,
221c270   step 3  ...identityFromConventionMatch(crossingMatch) -> ...a44Wrap(...)
223a273   step 3  + reachedStemFallback: false,
234c284   step 4  studentKey: baseInferred.studentDisplay.toLowerCase() -> a44Encode([...])
237a288   step 4  + reachedStemFallback: false,
245a297   step 5  + const relDir5 = a44ContainerRelativeDir(filePath, zipChain);
247c299   step 5  ...fallback -> ...a44Fold(fallback, relDir5, false)
249a302   step 5  + reachedStemFallback: true,
254a308   step 6  + const relDir6 = a44ContainerRelativeDir(filePath, zipChain);
256c310   step 6  ...fallback -> ...a44Fold(fallback, relDir6, true)
258a313   step 6  + reachedStemFallback: true,
315a371,386   groupSubmissionsByStudent: + the terminal disambiguation pass,
              key-sorted, with a COLLISION-FREE suffix search (see R15)
```

`a44Fold`, the one function the whole design turns on, in full:

```ts
function a44Fold(
  id: { studentKey: string; studentDisplay: string },
  relDir: string,
  dirFirst: boolean
): { studentKey: string; studentDisplay: string } {
  if (!relDir) return a44Wrap(id);
  return {
    studentKey: a44Encode([relDir.toLowerCase(), id.studentKey]),
    studentDisplay: dirFirst ? `${relDir}/${id.studentDisplay}` : `${id.studentDisplay}/${relDir}`,
  };
}
```

Everything else in `g/utils_k.ts` - `matchStudentFileConvention`,
`leafStemFallback`, `citationFileName`, `extension`, `mergedFileCount`,
`submittedFiles`, the `localeCompare` sort - is the real file's text.

**Twelve mutants are patches of THAT file**, each written by the same script with
a one-anchor replacement that fails loudly if the anchor is not unique:
`PARTIAL` (per-part encoding at steps 5/6 only, steps 1-4 raw), `BARE` (the
dir-less fallback key left un-encoded), `ONEPREF` (one length prefix on the
folder, the base key appended RAW - round 1's own `compound` spelling), `PLAN`
(immediate-parent segment, partial encoding, suffix display, no terminal pass),
`FOLDERALONE`, `FOLDALWAYS`, `NOFOLD`, `SEP` (a printable `::` separator),
`NAIVE` (a counting terminal pass), `NOTERM` (no terminal pass), `ENTRIES` (the
terminal pass walked in Map insertion order).

### 0.3 Exit codes, counters, absence canaries

- **Exit codes** read from the command. `find` exits 0 on no match, so no absence
  claim here uses `find`; `ls -d <path>` is used, which exits 2 when absent, and
  every such block carries a positive canary.
- **Line counts** by `wc -l` from Bash AND `@(Get-Content <path>).Count` from
  PowerShell. `Measure-Object -Line` was not used. The two agree on all ten files
  in section 0.6.
- **No absolute lint warning count appears anywhere in this document.** One
  command produced four different values in one day; R12 states the gate as a
  DELTA condition instead.
- **Every absence claim carries a canary using the same pattern AND the same
  filter chain**, with the canary's own count printed. Six absence claims failed
  on the instrument rather than the pattern in one day, so the filter is checked
  separately wherever it could be the thing producing the absence.

| Absence claimed | Instrument and result | Positive canary, SAME command shape AND SAME filter |
|---|---|---|
| **NO test in this repository asserts a grade identity key** | `grep -rn "studentKey" src --include=*.test.ts --include=*.test.tsx \| grep -v "course-intel"` -> **exit 1** | the same chain on `studentDisplay` -> **11 lines, exit 0** |
| and the FILTER itself provably fires | the same `studentKey` chain **without** `grep -v "course-intel"` -> **37 lines** | so the 37 removed hits are all course-intel's own different `studentKey`, and the exit 1 is the pattern, not the filter |
| no test reads `src/lib/grade/utils.ts` AS SOURCE TEXT | the derivation ranges over **all 210** test files containing `readFileSync(`/`readFile(`/`readdirSync(`, each filtered by content; `grade/utils` appears in **none** of the 8 that name a grade module, `LOOP_EXIT=1` | the same loop prints 8 files naming `grade/types`, `grade/engine.ts`, `grade/extraction.ts`, exit 0 |
| no ceiling ratchet entry names any file in this design | `grep -nE "grade/utils\|grade/extraction\|grade/engine\|GradingResults\|gradingResultsHelpers\|actions/grading\|identityInvariants" src/file-size-ceiling.structure.test.ts` -> **exit 1** | same command for `lms-generation.test.ts` -> `76:`, exit 0 |
| no in-tree scratch directory was created | `ls -d` on each of `.a44r2 .a44tn .a44plan .a44arch scratchpad a44-scratch g h` -> **exit 2 for all eight** | `ls -d docs` -> exit 0 |

### 0.4 `grep -c $'\r'` IS BROKEN HERE, reproduced

Required at the end of every sabotage CYCLE (section 6.0), because the RESTORE is
what breaks line endings. The instrument most people reach for does not work.
Measured on a probe file written with `printf 'a\r\nb\r\nc\r\n'`:

```
$ python -c "... open(f,'rb').read().count(b'\r') ..."
python byte read: CR bytes = 3   total bytes = 9
$ grep -c $'\r' crtest.txt
0
GREPC_EXIT=1                      <- 0 AND exit 1, on a file with THREE real CR bytes
$ tr -dc '\r' < crtest.txt | wc -c
3
TR_EXIT=0
$ powershell: (([IO.File]::ReadAllBytes(f)) | Where-Object { $_ -eq 13 }).Count
3
$ powershell: (Select-String -Path f -Pattern "`r" -AllMatches | Measure-Object).Count
0                                 <- the PowerShell equivalent fails too
```

**Only three instruments work: `tr -dc '\r' < f | wc -c`, a python byte read, or
the PowerShell byte filter.** Any sabotage cycle that reports "no CR" from
`grep -c` or `Select-String` has reported nothing.

### 0.5 Byte hygiene, and a CORRECTION to both sibling artifacts

`docs/a44-architecture.md` (section 14) and `docs/a44-waves.md` (15.3) both state
that `src/source-bytes.structure.test.ts` "walks `src` only" and therefore cannot
see a materialised `\uXXXX` escape in `docs/`. **Measured, that is wrong.**

```
$ grep -n "^const ROOT" src/source-bytes.structure.test.ts
48:const ROOT = process.cwd();
$ grep -n "collect(" src/source-bytes.structure.test.ts | tail -2
69:const FILES = collect(ROOT);
$ sed -n '49,50p' src/source-bytes.structure.test.ts
SKIP_DIRS = {".git","node_modules",".next",".claude","coverage","dist",".vercel"}
TEXT_EXTENSIONS includes ".md"
```

A probe reproducing that exact walk from the repository root:

```
$ node <scratchpad>/probe.mjs "<repo root>"
md files reachable from the repo root = 235
contains docs/a44-architecture.md = true
contains docs/loop/traps-spec.md   = true
PROBE_EXIT=0
```

So **the committed byte gate already covers this document and both siblings'**,
and no hand-rolled scan is needed or wanted. `src/lib/no-emojis.test.ts:254`
(`["src","docs"]`) covers it too. It is
`src/file-size-ceiling.structure.test.ts:115` that walks `src` only
(`path.resolve(repoRoot, "src")`), which is the file both documents were
thinking of.

### 0.6 File sizes, measured this pass by BOTH counters

| File | `wc -l` | `@(Get-Content).Count` |
|---|---|---|
| `src/lib/grade/utils.ts` | 393 | 393 |
| `src/lib/grade/utils.test.ts` | 390 | 390 |
| `src/lib/grade/extraction.ts` | 300 | 300 |
| `src/lib/grade/engine.ts` | 517 | 517 |
| `src/app/actions/grading.ts` | 941 | 941 |
| `src/app/components/GradingResults.tsx` | 906 | 906 |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | 728 | 728 |
| `src/app/components/grading-results/ungradedDisclosure.ts` | 196 | 196 |
| `src/lib/grade/types.ts` | 432 | 432 |
| `src/lib/grade/single-file-entry.test.ts` | 110 | 110 |

`src/file-size-ceiling.structure.test.ts:41` is `const LIMIT = 1000` (read by
`sed -n '41p'`). The RULE K variant is **464** lines against the real file's
**393** (`wc -l`), i.e. about **+71**, which includes Wave 2's
`reachedStemFallback` at all six sites. These are measurements for whoever plans
the waves, not requirements of mine.

### 0.7 BASELINE: the defect is fully live and the suite is green

```
$ npm run test:paths -- src/lib/grade/utils.test.ts src/lib/grade/extraction.test.ts \
    src/lib/grade/single-file-entry.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts \
    src/app/components/grading-results/gradingResultsHelpers.test.ts \
    src/app/components/grading-results/gradingResultsHelpersEditState.test.ts \
    src/app/components/grading-results/ungradedDisclosure.test.ts \
    src/app/components/grading-results/gradingResultsPostOutcome.test.ts \
    src/lib/module-graph/runtime-import-graph.test.ts
TESTPATHS_EXITCODE=0
Test Files  9 passed (9) / Tests  360 passed (360)
COVERED src/lib/grade/utils.test.ts                             files=1 passed=28
COVERED src/lib/grade/extraction.test.ts                        files=1 passed=9
COVERED src/lib/grade/single-file-entry.test.ts                 files=1 passed=15
COVERED src/lib/grade/grouping-zip-parents.wiring.test.ts       files=1 passed=7
COVERED .../gradingResultsHelpers.test.ts                       files=1 passed=45
COVERED .../gradingResultsHelpersEditState.test.ts              files=1 passed=28
COVERED .../ungradedDisclosure.test.ts                          files=1 passed=47
COVERED .../gradingResultsPostOutcome.test.ts                   files=1 passed=7
COVERED src/lib/module-graph/runtime-import-graph.test.ts        files=1 passed=174
```

**360 tests green with three students collapsing into one graded row, and with
ZERO of them asserting an identity key.** That is the baseline every red/green
claim below is measured against. `gradingResultsPostOutcome.test.ts` is
baselined here at **7**, which `docs/a44-waves.md` 5.5 asked for and could not
supply.

Any instrument in this document naming two or more test files is written
`npm run test:paths -- <p1> <p2> ...`. A raw `vitest run a b` silently drops any
argument it does not match and exits 0; it must not be used.

---

## 0.8 THE GENERATOR, REPUBLISHED - AND IT SHOULD LAND IN `src/`

### 0.8a The recommendation, which is a real one

**Put the generator in the tree, as `src/lib/grade/submissionShapeGenerator.ts`,
a plain non-test leaf.** Not as a convenience. Three measured reasons:

1. **Round 1's generator is not in the tree, and that is why nobody could re-run
   the sweep.** `docs/a44-architecture.md` section 11 checked for it at two scopes
   and could not find it; `docs/a44-waves.md` 6.5 turned that into a
   dispatch-blocking prerequisite for Wave 2. One seat's scratchpad became a
   gate on another seat's wave.
2. **Its absolute integers are NOT reproducible from its published spec, and I
   can prove it by having tried.** Round 1 published the shape list and the PRNG
   but not the `rnd()` CALL ORDER inside a set, and said so. My re-implementation
   fixes an order (0.8b) and lands within about 4% of every round-1 column -
   `folder-resubmit` conservative **1255 (6.3%)** against round 1's
   `1278 (6.4%)`, `single-student-...` split **19382 (97.6%)** against `19440
   (97.8%)`, `mixed-...-shared-dropbox` unsound **2254 (11.3%)** against `2159
   (10.8%)` - but not ON any of them. **A frozen integer whose generator lives in
   a scratchpad is not a frozen integer; it is a number nobody can check.**
3. **A plain `.ts` leaf is the only shape that works here.** Two test files need
   it (the invariants file and the refusal file), and
   `docs/loop/traps-tests.md` forbids importing a helper from another
   `*.test.ts` - it re-runs that file's `describe` blocks under the wrong setup.
   `src/lib/count-lines.ts` is the precedent this repo already set for exactly
   this: a plain leaf shared by two structure tests.

**The cost, stated so the plan can price it.** A new leaf under `src/lib/grade/`
is collected by the three whole-tree sweeps and by the client-boundary and
import-graph walkers. It must import NOTHING - not `./types`, not the
`@/lib/grade` barrel - or it moves
`src/lib/module-graph/runtime-import-graph.test.ts:653-663`'s frozen nine-trail
deep-equal. A pure generator needs no imports, so this is satisfiable, and it is
a condition the wave gate can check rather than a hope.

**If the orchestrator declines**, then every integer in section 1.4 must be
re-derived by the implementer inside the test file from the spec in 0.8b, in the
same commit, and **the frozen literals in this document become expectations to
re-measure rather than values to copy.** Say which it is before Wave 2 is
dispatched; do not leave it to the implementer.

### 0.8b The generator, with its call order fully specified

Published in full so that no figure below depends on a scratchpad. Where round 1
left the call order open, this pins it; that is the only difference in kind.

```ts
const STUDENTS = ["AlvarezMaria","BrownTom","ChenLi","DavisAnn","EvansJo","FordKim",
  "GarciaLuz","HallSam","IvanovNik","JonesPat","KimDae","LopezAna","MurphyDev",
  "NguyenAn","OkaforChi"];                                             // 15
const STEMS = ["essay","Essay Final","Essay Draft","Homework Final","Homework Draft",
  "homework","reflection","Reflection Final","report","Report Draft","paper",
  "Paper Final","lab","Lab Report","midterm"];                         // 15
const EXTS = ["docx","txt","pdf","md"];                                // 4
const COMPONENTS = ["backend","frontend","docs","src","tests","api","web","lib"]; // 8
const SEED = 20260927;
const SWEEP_N = 20000;

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

**One `rnd` stream per shape run, created once before set 0.** Per set:

1. `size = 2 + Math.floor(rnd() * 5)`   (2..6)
2. `pool = STUDENTS.slice()`

Then, **per file `i`, in exactly this order**:

1. `rResub = rnd()` - **always drawn, in every shape**, so the stream stays
   aligned across shapes;
2. the owner:
   - `single-student-multi-folder-shared-filename` and `i > 0`: `owners[0]`, **no
     draw**;
   - a shape whose name ends `-resubmit`, `i > 0`, `rResub < 0.5`:
     `owners[i-1]`, **no draw**;
   - otherwise `pool.splice(Math.floor(rnd() * pool.length), 1)[0]` (without
     replacement; `size <= 6` and `|STUDENTS| = 15`, so the pool never empties);
3. `stem = STEMS[Math.floor(rnd() * STEMS.length)]`
4. `ext = EXTS[Math.floor(rnd() * EXTS.length)]`
5. `comp = COMPONENTS[Math.floor(rnd() * COMPONENTS.length)]`

Path shapes. The first eleven are round 1's, unchanged. The last six are new and
section 1.4 says what each is for.

```
flat                        = <stem>.<ext>
folder[-resubmit]           = <owner>/<stem>.<ext>
convention[-resubmit]       = <owner lowercased>_2026-09-0<(i%9)+1>_120<i>00_<stem>.<ext>
folder-distinct-stems       = <owner>/<owner>-work.<ext>
shared-wrapper-folder       = Submissions/<stem>.<ext>
single-student-multi-folder-shared-filename = <comp>/config.<ext>
nested-bulk-perstudent-folders = bulk.zip/<owner>/<stem>.<ext>, zipParents = ["bulk.zip"]
mixed-perstudent-plus-shared-dropbox = (i<2 ? "Shared" : <owner>)/<stem>.<ext>
duplicate-folder-name       = (i<2 ? "JohnSmith" : <owner>)/<stem>.<ext>
--- ADDED in round 2 ---
nested-perstudent-subdirs      = Submissions/<owner>/<comp>/<stem>.<ext>
nested-shared-dropbox-subdirs  = Submissions/(i<2 ? "Shared" : <owner>)/<comp>/<stem>.<ext>
flat-forgery                   = i even: <owner>/<stem>.<ext>
                                 i odd:  " <D>:<dir><baseKey>.<ext>"        (ONE prefix)
flat-forgery-perpart           = i even: <owner>/<stem>.<ext>
                                 i odd:  " <D>:<dir><B>:<baseKey>.<ext>"    (PER-PART)
conv-forgery                   = i even: <owner>/<stem>.<ext>
                                 i odd:  "<D>:<dir><B>:<baseKey>_2026-09-01_120000_x.<ext>"
crossstep-ambiguity            = i even: <owner>.zip/<comp>/<stem>/main.py, zipParents=["<owner>.zip"]
                                 i odd:  <owners[i-1]>/<comp>/<stem>.txt
```

In the three forgery shapes, `dir` is the PREVIOUS file's directory lowercased,
`D` its length, `baseKey` the previous file's leaf stem run through
`leafStemFallback`'s own `/^([A-Za-z0-9]+)/`-then-`.trim()` logic and lowercased,
and `B` its length. **The LEADING SPACE in the two flat forgeries is the lever**:
it defeats the anchored regex, so `.trim()` returns the whole crafted stem as an
identity.

Content marker per file: `<<M<setIndex>-<fileIndex>>> <declaredOwner>`, and a row's
files are recovered by searching `row.content` for that marker - **never by file
name**. The headline fixture has three files with byte-identical names (section
1.3), so name-based recovery is provably impossible, not merely discouraged.

Duplicate paths within a set are dropped; a set left with fewer than 2 distinct
paths is skipped, which is why `sets` is below `SWEEP_N` on some shapes.

### 0.8c Calibration against A41's published baseline

Stated rather than assumed, because a generator that cannot reproduce a published
percentage is measuring something else.

| shape | A41 published | this pass | agreement |
|---|---|---|---|
| `flat` sets / harm | 19938 / 11472 | 19935 / 11520 | within 0.5% |
| `folder` sets / harm | 20000 / 12304 | 20000 / 12379 | within 0.7% |
| `convention` harm | 0 | 0 | exact |
| `convention-resubmit` harm | 0 | 0 | exact |
| `folder-distinct-stems` harm | 0 | 0 | exact |
| `folder-resubmit` sets / harm | 19975 / 9209 | 19972 / 9172 | within 0.5% |

---

## 1. The ground-truth oracle

### 1.1 Two forbidden metrics, and why

`rows < files` was already disproved by A41 1.1 (it fires on 80.5% of sets
containing zero harm, because a student's resubmission is a REQUIRED merge pinned
at `src/lib/grade/utils.test.ts:336-351`). Round 1 added a second, and round 2
adds a third:

> **FORBIDDEN 1: "a student's files occupy more rows after than before."** An
> implementation-to-implementation comparison. Measured on `folder-resubmit`,
> `splitBefore = 14832` and `splitAfter = 14832` - **74.3% of that shape already
> has a student spread across two rows TODAY**, because one student's
> `Homework Draft.docx` and `Paper Final.pdf` key to `homework` and `paper` and
> always have. An oracle reporting the AFTER number alone blames A44 for a
> pre-existing 74.3%; one reporting only the DELTA is the tautology
> `docs/loop/traps-tests.md` records. **Both counts are frozen as INDEPENDENT
> ABSOLUTE LITERALS. The delta is prose, never an assertion.**

> **FORBIDDEN 2, new in round 2: any assertion on the DISPLAY standing in for an
> assertion on the KEY.** Section 3.1 measures a wrong implementation that
> reproduces **every display literal and every row count in this document** and
> is caught only by a key-level instrument. A display-derived oracle cannot see
> the identity, which is the thing A44 changes.

### 1.2 Ground truth, and the three outcomes

Definitions unchanged from round 1, restated because every count below uses them,
and each is computed from the DECLARED owner map alone with no reference to any
implementation of the parser:

1. **BLEND** - a returned row whose files were declared to belong to more than
   one student.
2. **MERGE** - a declared student with 2 or more files whose files all landed in
   exactly ONE row. The outcome `utils.test.ts:336-351` requires.
3. **SPLIT** - a declared student whose files landed in 2 or more distinct rows.
4. **FALLBACK-CAUSED BLEND** (the soundness subspace) - a returned row in which
   the files that resolved via a stem fallback (step 5 or 6) were declared to
   belong to more than one student. Scoped this way because the unscoped version
   goes RED on F1, the A14 sanitized-name collision, which resolves at step 2 and
   which `utils.test.ts:325-334` pins as current behaviour. That was a bad
   instrument, not a kill anybody was owed; F1's survival is RES-A44T-1.

### 1.3 THE FROZEN LITERAL ORACLE - 27 fixtures, and the KEY is a column

Every value produced by driving the REAL `parseSubmissionFileName` and the REAL
`groupSubmissionsByStudent` on both paths (0.1, 0.2). **A test must not recompute
these from the implementation.**

`H1_EXITCODE=0`. **TRANSCRIPTION CHECK FIRST, against the frozen `rowsToday`
column, so a mismatch means my transcribed INPUTS are wrong rather than the
rule:**

```
rowsToday mismatches = 0 of 27
```

One fixture failed this check on its first run and the FIXTURE was corrected, not
the rule: I had guessed K1's `rowsToday` at 1 and it is **2** under the original
three-path form (the forged flat file and the foldered victim do not collide
TODAY, because today's key carries no folder at all). Reported because a
transcription check that is silently adjusted to pass is not a check.

| id | Fixture (path -> declared owner) | rowsToday | rowsAfter | fbBlendAfter | SPLIT | MERGE | DECISION | Class |
|---|---|---|---|---|---|---|---|---|
| F1 | `johnsmith_1001_0_report.docx`->SmithA, `johnsmith_1002_0_report.docx`->SmithB | 1 | 1 | 0 | 0 | 0 | ALLOW | A14 SURVIVOR, out of scope (RES-A44T-1) |
| F2 | `janedoe_2024-01-01_120000_report.docx`, `janedoe_2024-01-02_120000_report.docx` -> JaneDoe | 1 | 1 | 0 | 0 | 1 | ALLOW | MERGE-REQUIRED |
| F3 | `{AlvarezMaria,BrownTom,ChenLi}/essay.txt`, three owners | **1** | **3** | **0** | 0 | 0 | ALLOW | **THE HEADLINE FIX** |
| F4 | `Homework Final.docx`->A, `Homework Draft.docx`->B | 1 | 1 | 1 | 0 | 0 | REFUSE | flat, no signal |
| F5 | `alvarezmaria_...`, `browntom_...` conventions + `README.txt`, three owners | 3 | 3 | 0 | 0 | 0 | ALLOW | ALLOW-REQUIRED |
| F6 | `AlvarezMaria/Homework {Final,Draft}.docx`, ONE owner | 1 | 1 | 0 | 0 | 1 | **REFUSE** | **RULING 87's pinned conservative case** |
| F7 | `janedoe_..._project.zip/main.py`, `johndoe_..._project.zip/main.py`, own chains | 2 | 2 | 0 | 0 | 0 | ALLOW | step 3, the fold must not reach it |
| F8 | F5's two conventions + `ChenLi/reflection.docx` + `DavisAnn/reflection.docx` | 3 | **4** | **0** | 0 | 0 | ALLOW | mixed, FIXED |
| F9 | `Essay.docx`->A, `essay.docx`->B | 1 | 1 | 1 | 0 | 0 | REFUSE | case fold |
| F10 | `essay.docx` alone | 1 | 1 | 0 | 0 | 0 | ALLOW | ALLOW-REQUIRED |
| G1 | `bulk.zip/{AlvarezMaria,BrownTom,ChenLi}/essay.txt`, chain `["bulk.zip"]`, three owners | **1** | **3** | **0** | 0 | 0 | ALLOW | **GAP-A: 3 students, 1 row, A41 refuses nothing** |
| G2 | same wrapper, DISTINCT stems (`aessay.txt`,`bessay.txt`), two owners | **1** | **2** | **0** | 0 | 0 | ALLOW | **GAP-B** |
| G3 | `backend/config.py`, `frontend/config.py`, ONE owner | 1 | **2** | 0 | **1** | 0 | ALLOW | **THE ACCEPTED FALSE SPLIT** |
| G4 | `Submissions/essay.docx`->A, `Submissions/essay.pdf`->B | 1 | 1 | 1 | 0 | 0 | **REFUSE** | the shape that killed the literal amnesty |
| G5 | `{AlvarezMaria,BrownTom}/homework.txt`->A,B, `Shared/essay.{docx,pdf}`->C,D | 2 | 3 | **1** | 0 | 0 | **ALLOW** | **UNSOUND under RULING 87 - R2** |
| G6 | `JohnSmith/report.{docx,pdf}`->SmithA,SmithB, `AlvarezMaria/essay.txt`->C | 2 | 2 | **1** | 0 | 0 | **ALLOW** | **UNSOUND, same class, different route** |
| G7 | `src/otherfile.py` alone (`utils.test.ts:366`'s own path) | 1 | 1 | 0 | 0 | 0 | ALLOW | the fold DOES apply - section 11 |
| G8 | `Submissions/{AlvarezMaria,BrownTom}/essay.txt` | **1** | **2** | **0** | 0 | 0 | ALLOW | **TWO directories deep** |
| G9 | `essay.txt`->A, `essay.pdf`->B | 1 | 1 | 1 | 0 | 0 | REFUSE | flat, same stem |
| G10 | `wrapA/janedoe_..._report.docx`, `wrapB/<same>`, ONE owner | 1 | 1 | 0 | 0 | 1 | ALLOW | **fold-always must not split this** |
| G11 | `Submissions/essay{1,2,3}.txt`, three owners | 3 | 3 | 0 | 0 | 0 | ALLOW | **folder-alone must not collapse this** |
| G12 | `{AlvarezMaria,BrownTom}/homework.txt`->A,B, `essay.{docx,pdf}`->C,D | 2 | 3 | **1** | 0 | 0 | **REFUSE** | a FLAT collision in a foldered run |
| G13 | `x/_a::b.docx`->A, `x::_a/b.docx`->B | 2 | 2 | 0 | 0 | 0 | ALLOW | the separator-injectivity pair |
| **K1** | **the FORGERY FAMILY, four paths** (below) | **3** | **3** | **0** | 0 | 0 | **ALLOW** | **NEW. The identity attack - and the refusal CANNOT see it** |
| **K2** | `Submissions/{AlvarezMaria,BrownTom}/{src/main.py,docs/r.txt}`, two owners | **2** | **4** | **0** | **2** | 0 | ALLOW | **NEW. The two-student code-project BLEND that killed the immediate-parent rule** |
| **K3** | `JaneDoe.zip/src/deep/main.py` (chain `["JaneDoe.zip"]`)->J, `JaneDoe/src/deep.txt`->O | 2 | 2 | 0 | 0 | 0 | ALLOW | **NEW. Cross-step DISPLAY ambiguity - the only family that reaches RULE D** |
| **K4** | K3 + `JaneDoe/src/ deep (2).txt`->T | 3 | 3 | 0 | 0 | 0 | ALLOW | **NEW. The SUFFIX forgery - a counting terminal pass fails it** |

**K1's four paths, spelled out, because the whole point is the exact bytes:**

```
"AlvarezMaria/essay.docx"                            -> AlvarezMaria   (the VICTIM)
" 12:alvarezmariaessay.docx"                         -> ForgerA  (forges a ONE-PREFIX key)
" 12:alvarezmaria5:essay.docx"                       -> ForgerB  (forges a PER-PART key)
"12:alvarezmaria5:essay_2026-09-01_120000_x.docx"    -> ForgerC  (forges through the
                                                                  CONVENTION branch)
```

**K1's DECISION is ALLOW, and that is the point of the fixture rather than a
weakness in it.** Under RULE K the four paths produce three pairwise-distinct
keys among the fallback-reaching files, so there is no colliding group and
nothing for the refusal to refuse - measured, `collidingGroups=0`. **Under a
partial encoding the refusal is equally silent**, because the merge happens at
identity time and the predicate only ever sees the groups the keys produce. So
**no refusal, on any branch, can detect a forged key. Only R13's key literals and
R14's INVARIANT M can.** I had frozen K1 as REFUSE by reasoning rather than
measurement; the verification below caught it, and the corrected value is what
makes the fixture's purpose clear.

**Every DECISION value in the table above is verified rather than transcribed**,
`H12_EXITCODE=0`: 26 of 27 reproduce round 1's frozen column exactly under RULE
K's key and RULE K's container-relative-path folder, and the 27th is K1, where my
own frozen value was wrong and the measurement replaced it:

```
DECISION mismatches against the frozen column = 1 of 27, and the one is K1 (mine)
F4  REFUSE collidingGroups=1 distinctFolderPaths=0    F6  REFUSE 1 / 1
F9  REFUSE 1 / 0    G4  REFUSE 1 / 1    G9  REFUSE 1 / 0    G12 REFUSE 1 / 2
G5  ALLOW  collidingGroups=1 distinctFolderPaths=3    <- the accepted unsound case
G6  ALLOW  collidingGroups=1 distinctFolderPaths=2    <- the same class, other route
K2  ALLOW  0 / 4     K3 ALLOW 0 / 2     K4 ALLOW 0 / 2     K1 ALLOW 0 / 1
```

`rowsAfter` is **3, not 4**, and that is correct and must be frozen as 3:
ForgerB and ForgerC already share one row TODAY (both today-keys are
`12:alvarezmaria5:essay`, one by `.trim()` after the anchored regex fails, one as
`parts[0]` of the convention split), so their merge is pre-existing, INVARIANT M
permits it, and RULE K neither fixes nor worsens it. It is RES-A44T-1's class one
level along.

**FROZEN DISPLAYS under RULE D, all 27, because under RULING 93 the display IS
the storage label and every one of them is therefore load-bearing.** Rows are
returned sorted by `localeCompare` on the display (`utils.ts:319`), so these are
in returned order:

```
F1  ["johnsmith"]                     F2  ["janedoe"]
F3  ["AlvarezMaria/essay","BrownTom/essay","ChenLi/essay"]
F4  ["Homework"]                      F5  ["alvarezmaria","browntom","README"]
F6  ["AlvarezMaria/Homework"]         F7  ["janedoe","johndoe"]
F8  ["alvarezmaria","browntom","ChenLi/reflection","DavisAnn/reflection"]
F9  ["Essay"]                         F10 ["essay"]
G1  ["bulk/AlvarezMaria","bulk/BrownTom","bulk/ChenLi"]
G2  ["bulk/AlvarezMaria","bulk/BrownTom"]
G3  ["backend/config","frontend/config"]
G4  ["Submissions/essay"]
G5  ["AlvarezMaria/homework","BrownTom/homework","Shared/essay"]
G6  ["AlvarezMaria/essay","JohnSmith/report"]
G7  ["src/otherfile"]
G8  ["Submissions/AlvarezMaria/essay","Submissions/BrownTom/essay"]
G9  ["essay"]                         G10 ["janedoe"]
G11 ["Submissions/essay1","Submissions/essay2","Submissions/essay3"]
G12 ["AlvarezMaria/homework","BrownTom/homework","essay"]
G13 ["x::_a/b","x/_a::b"]
K1  ["12:alvarezmaria5:essay","12:alvarezmariaessay","AlvarezMaria/essay"]
K2  ["Submissions/AlvarezMaria/docs/r","Submissions/AlvarezMaria/src/main",
     "Submissions/BrownTom/docs/r","Submissions/BrownTom/src/main"]
K3  ["JaneDoe/src/deep","JaneDoe/src/deep (2)"]
K4  ["JaneDoe/src/deep","JaneDoe/src/deep (2)","JaneDoe/src/deep (3)"]
```

**THE FROZEN IDENTITY KEYS, per path, in fixture order. This is the column round
1 did not have and the column no test in this repository has ever asserted.**

```
F1  ["9:johnsmith","9:johnsmith"]
F2  ["7:janedoe","7:janedoe"]
F3  ["12:alvarezmaria5:essay","8:browntom5:essay","6:chenli5:essay"]
F4  ["8:homework","8:homework"]
F5  ["12:alvarezmaria","8:browntom","6:readme"]
F6  ["12:alvarezmaria8:homework","12:alvarezmaria8:homework"]
F7  ["7:janedoe","7:johndoe"]
F8  ["12:alvarezmaria","8:browntom","6:chenli10:reflection","8:davisann10:reflection"]
F9  ["5:essay","5:essay"]             F10 ["5:essay"]
G1  ["12:alvarezmaria4:bulk","8:browntom4:bulk","6:chenli4:bulk"]
G2  ["12:alvarezmaria4:bulk","8:browntom4:bulk"]
G3  ["7:backend6:config","8:frontend6:config"]
G4  ["11:submissions5:essay","11:submissions5:essay"]
G5  ["12:alvarezmaria8:homework","8:browntom8:homework","6:shared5:essay","6:shared5:essay"]
G6  ["9:johnsmith6:report","9:johnsmith6:report","12:alvarezmaria5:essay"]
G7  ["3:src9:otherfile"]
G8  ["24:submissions/alvarezmaria5:essay","20:submissions/browntom5:essay"]
G9  ["5:essay","5:essay"]             G10 ["7:janedoe","7:janedoe"]
G11 ["11:submissions6:essay1","11:submissions6:essay2","11:submissions6:essay3"]
G12 ["12:alvarezmaria8:homework","8:browntom8:homework","5:essay","5:essay"]
G13 ["1:x5:_a::b","5:x::_a1:b"]
K1  ["12:alvarezmaria5:essay","20:12:alvarezmariaessay",
     "22:12:alvarezmaria5:essay","22:12:alvarezmaria5:essay"]
K2  ["28:submissions/alvarezmaria/src4:main","29:submissions/alvarezmaria/docs1:r",
     "24:submissions/browntom/src4:main","25:submissions/browntom/docs1:r"]
K3  ["8:src/deep7:janedoe","11:janedoe/src4:deep"]
K4  ["8:src/deep7:janedoe","11:janedoe/src4:deep","11:janedoe/src8:deep (2)"]
```

**Row counts in fixture order, so the "all 23 unchanged" claim is checkable at a
glance:** F1 1, F2 1, F3 3, F4 1, F5 3, F6 1, F7 2, F8 4, F9 1, F10 1, G1 3,
G2 2, G3 2, G4 1, G5 3, G6 2, G7 1, G8 2, G9 1, G10 1, G11 3, G12 3, G13 2,
K1 3, K2 4, K3 2, K4 3.

```
RULE K vs FROZEN rowsAfter: mismatches = 0 of 27
INVARIANT D violations under RULE K = 0 of 27
```

**The architecture's section 10.2 dispositions are CONSUMED and CONFIRMED, item
by item, and two things it did not list are added rather than contradicted:**

| architecture 10.2 said | measured this pass |
|---|---|
| all 23 `rowsAfter` UNCHANGED | **CONFIRMED**, 0 mismatches |
| G8 displays -> `["Submissions/AlvarezMaria/essay","Submissions/BrownTom/essay"]` | CONFIRMED |
| F3 -> `["AlvarezMaria/essay",...]` | CONFIRMED |
| F8 -> `["alvarezmaria","browntom","ChenLi/reflection","DavisAnn/reflection"]` | CONFIRMED, and the two CONVENTION rows do stay bare |
| G1/G2 -> `["bulk/AlvarezMaria",...]` | CONFIRMED |
| G3 -> `["backend/config","frontend/config"]` | CONFIRMED |
| G5's first display -> `"Shared/essay"` | CONFIRMED (present in G5's list) |
| F6 -> `["AlvarezMaria/Homework"]`, G7 -> `["src/otherfile"]` | CONFIRMED |
| F4 `["Homework"]`, F9 `["Essay"]` UNCHANGED | CONFIRMED |
| the `compound` key column, all five entries, e.g. `"12:alvarezmariaessay"` -> `"12:alvarezmaria5:essay"`, `"janedoe"` -> `"7:janedoe"` | CONFIRMED |
| **not listed: G11** `["essay1","essay2","essay3"]` -> `["Submissions/essay1",...]` | **ADDED.** Correctly absent from 10.2, which enumerated only the literals round 1 had FROZEN; G11's displays were not among them. Frozen now. |
| **not listed: G13** `["_a::b","b"]` -> `["x::_a/b","x/_a::b"]` | **ADDED**, same reason |
| **not listed: F5, G6, G9, G12** | **ADDED**, same reason |

**`src/lib/grade/utils.test.ts` - the three changing assertions, re-verified by
opening the file this pass:**

- `:128-131`: `parseSubmissionFileName("src/main.py", undefined, [])` with
  `expect(parsed.studentDisplay).toBe("main")` at `:130` -> becomes `"src/main"`.
- `:133-136`: the same path with the chain argument omitted entirely (the
  un-migrated-caller control), `toBe("main")` at `:135` -> becomes `"src/main"`.
- `:366`'s `"src/otherfile.py"` inside the uniqueness fixture yields
  `"src/otherfile"`; **the assertion at `:373` still passes at 4 against 4**
  (measured - see R9).
- The `it()` descriptions at `:128` and `:133` both read "matches today's exact
  leaf-stem output". **They change with the expectations or the file acquires a
  stale comment**, which is a defect class `docs/a44-waves.md` 12.3 already
  catalogues two of in this same file.
- `:192-197` (`keeps citationFileName as the bare leaf ...`) is UNCHANGED and is
  the guard against a naive parentPath-everywhere rewrite. Opened this pass.

### 1.4 THE SWEEP, re-derived - seventeen shapes, seed 20260927

`H6_EXITCODE=0`, `SWEEP_N=20000`. `harmB`/`harmA` are the FALLBACK-CAUSED BLEND
of 1.2 before and after; `invM_K`/`invD_K` are RULE K's own invariant violations.

| shape | sets | harmB | harmA | splitB | splitA | invM_K | invD_K |
|---|---|---|---|---|---|---|---|
| `flat` | 19935 | 11520 | 11520 | 0 | 0 | 0 | 0 |
| `folder` | 20000 | 12379 | **0** | 0 | 0 | 0 | 0 |
| `folder-resubmit` | 19972 | 9172 | **0** | 14832 | 14832 | 0 | 0 |
| `convention` | 20000 | 0 | 0 | 0 | 0 | 0 | 0 |
| `convention-resubmit` | 20000 | 0 | 0 | 0 | 0 | 0 | 0 |
| `folder-distinct-stems` | 20000 | 0 | 0 | 0 | 0 | 0 | 0 |
| `shared-wrapper-folder` | 19935 | 11520 | 11520 | 0 | 0 | 0 | 0 |
| `single-student-multi-folder-shared-filename` | 19858 | 0 | 0 | **0** | **19382** | 0 | 0 |
| `nested-bulk-perstudent-folders` | 20000 | **20000** | **0** | 0 | 0 | 0 | 0 |
| `mixed-perstudent-plus-shared-dropbox` | 19936 | 12186 | **2780** | 0 | 0 | 0 | 0 |
| `duplicate-folder-name` | 19936 | 12186 | **2780** | 0 | 0 | 0 | 0 |
| **`nested-perstudent-subdirs`** | 20000 | 12379 | **0** | 0 | 0 | 0 | 0 |
| **`nested-shared-dropbox-subdirs`** | 19990 | 12354 | **349** | 0 | 0 | 0 | 0 |
| **`flat-forgery`** | 20000 | 4566 | **0** | 0 | 0 | 0 | 0 |
| **`flat-forgery-perpart`** | 20000 | 4566 | **0** | 0 | 0 | 0 | 0 |
| **`conv-forgery`** | 20000 | 4566 | **0** | 0 | 0 | 0 | 0 |
| **`crossstep-ambiguity`** | 20000 | 2956 | **0** | 0 | 0 | 0 | 0 |

**THE REFUSAL, three predicate configurations over the SAME sets.** The
predicate is RULING 87's refined form: collect the fallback-reaching files'
collision groups on the identity key; grant a group amnesty when all its files
share one non-null folder AND the run's fallback-reaching population shows 2 or
more distinct folders; REFUSE iff any group survives.

- **K** = RULE K key + RULE K container-relative PATH folder.
- **IP** = RULE K key + IMMEDIATE-PARENT folder. *The folder term varied alone.*
- **IPF** = immediate-parent key + immediate-parent folder. *Both terms, i.e. the
  rule round 1's integers were computed under.*

| shape | unsK | unsIP | unsIPF | consK | consIPF | dFold | dFull |
|---|---|---|---|---|---|---|---|
| `flat` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `folder` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `folder-resubmit` | 0 | 0 | 0 | **1255** | **1255** | 0 | 0 |
| `convention` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `convention-resubmit` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `folder-distinct-stems` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `shared-wrapper-folder` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `single-student-multi-folder-shared-filename` | 0 | 0 | 0 | **476** | **476** | 0 | 0 |
| `nested-bulk-perstudent-folders` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `mixed-perstudent-plus-shared-dropbox` | **2254** | **2254** | **2254** | 0 | 0 | **0** | **0** |
| `duplicate-folder-name` | **2254** | **2254** | **2254** | 0 | 0 | **0** | **0** |
| `nested-perstudent-subdirs` | **0** | **0** | **2476** | 0 | 0 | 0 | **106** |
| `nested-shared-dropbox-subdirs` | **287** | **277** | **2441** | 0 | 0 | **10** | **33** |
| `flat-forgery` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `flat-forgery-perpart` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `conv-forgery` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `crossstep-ambiguity` | **0** | **0** | **404** | 0 | 0 | 0 | 0 |

Rates, only where a rate claim exists:

```
folder-resubmit                  consK=1255 (6.3%)   splitA=14832 (74.3%)  splitUnrefusedK=13871 (69.5%)
single-student-multi-folder-...  consK= 476 (2.4%)   splitA=19382 (97.6%)  splitUnrefusedK=19382 (97.6%)
mixed-perstudent-plus-shared-dropbox   unsK=2254 (11.3%)  unsIPF=2254 (11.3%)
duplicate-folder-name                  unsK=2254 (11.3%)  unsIPF=2254 (11.3%)
nested-perstudent-subdirs              unsK=   0 (0.0%)   unsIPF=2476 (12.4%)
nested-shared-dropbox-subdirs          unsK= 287 (1.4%)   unsIPF=2441 (12.2%)
crossstep-ambiguity                    unsK=   0 (0.0%)   unsIPF= 404 (2.0%)
```

**THE INSTRUMENTS FIRE ON A KNOWN-BAD RULE, demonstrated BEFORE any zero above is
read as evidence.** INVARIANT M violations by rule, same sets:

| shape | K | PARTIAL | BARE | ONEPREF | PLAN |
|---|---|---|---|---|---|
| the eleven original shapes, and both `nested-*-subdirs` | 0 | 0 | 0 | 0 | 0 |
| `flat-forgery` | **0** | 0 | 0 | **20000** | 0 |
| `flat-forgery-perpart` | **0** | 0 | **20000** | 0 | 0 |
| `conv-forgery` | **0** | **20000** | **20000** | 0 | **20000** |
| `crossstep-ambiguity` | 0 | 0 | 0 | 0 | 0 |

And INVARIANT D plus the order instrument, by rule:

| shape | invD_K | invD_NOTERM | invD_NAIVE | ordDep_K | ordDep_ENTRIES |
|---|---|---|---|---|---|
| every shape except `crossstep-ambiguity` | 0 | 0 | 0 | 0 | 0 |
| `crossstep-ambiguity` | **0** | **156** | **0** | **0** | **156** |

**Four things this sweep establishes, two of them corrections.**

1. **`nested-bulk-perstudent-folders` is a 100% silent-harm shape TODAY** - all
   20000 sets carry fallback-caused harm and A41's predicate refuses none, since
   its discriminator requires an empty `zipChain`. RULE K takes it to 0/0. A44's
   second primary win, unchanged from round 1.
2. **`duplicate-folder-name` and `mixed-perstudent-plus-shared-dropbox` are ONE
   shape wearing two labels** - identical on every column, because they differ
   only in the shared folder's literal name, which no predicate reads. R2 names
   one; the other is recorded here so nobody re-derives it as new coverage.
3. **`flat-forgery` and `flat-forgery-perpart` are NOT one shape**, and that is
   the correction. They differ only in the forged key's construction, and each
   catches a DIFFERENT partial encoding while leaving the other untouched. A
   single forgery shape is a false sense of coverage.
4. **The three zero columns for `NAIVE` and for RULE K on the eleven original
   shapes are NOT evidence of anything**, and section 3 says so rather than
   banking them.

### 1.5 RULING 87's FROZEN INTEGER: the answer, and the resolution of the conflict

The brief asks whether the integer moves and by how much, or why it cannot be
derived. It can be derived, and the answer has three parts.

**(a) RULE K moves it by ZERO on every one of the eleven original shapes.**
`dFold = 0` and `dFull = 0` on all eleven, and `unsK == unsIP == unsIPF` exactly
on each. So the folder definition and the key definition are both irrelevant
there.

**(b) The architecture and the wave plan are BOTH RIGHT, and the blind spot was
the SHAPE LIST, not the predicate.** The architecture's D11 reasoned that the two
folder definitions coincide when every path is one directory deep. Measured,
**every one of the eleven original shapes is exactly one directory deep**, so the
reasoning holds for all of them and `dFold = 0` is its confirmation. The wave
plan's counterexample is **two** directories deep, and no shape in the eleven-shape
list reaches two - which is why the sweep reported no disagreement, and why the
sweep could never have caught the flip. Adding two-deep shapes makes the
disagreement appear at once: `dFull = 106` on `nested-perstudent-subdirs` and
`dFull = 33` on `nested-shared-dropbox-subdirs`, `dFold = 10` on the latter.
**Neither document needs correcting. The instrument does**, and that is this
pass's job, so the correction is here.

**(c) Where the two rules differ, RULE K is dramatically SOUNDER, and the wave
plan's refusal to guess the sign was the right call.** Its proof that
`|folders(RULE K)| >= |folders(immediate parent)|` is correct, and taken alone
that term moves toward unsoundness. But the KEY term moves the other way and
dominates:

```
nested-perstudent-subdirs       unsound  RULE K 0      vs immediate-parent 2476 (12.4%)
nested-shared-dropbox-subdirs   unsound  RULE K 287    vs immediate-parent 2441 (12.2%)
crossstep-ambiguity             unsound  RULE K 0      vs immediate-parent  404 (2.0%)
```

**The overall sign is NEGATIVE - RULE K is strictly sounder wherever the two
differ at all, and identical everywhere else.** On `nested-perstudent-subdirs`
the immediate-parent rule leaves 12.4% of sets with a silent cross-student blend
and RULE K leaves none, because two students sharing a `src/` directory collide
under the immediate parent and cannot under the full path.

**(d) The ABSOLUTE integer this pass measures is 2254 of 19936 (11.3%), not round
1's 2159 of 19927 (10.8%), and the difference is the GENERATOR, not RULE K.** The
attribution is exact rather than argued: within my population
`unsK == unsIPF == 2254`, so the rule contributes zero movement, and the 95-set
gap from round 1 is entirely the `rnd()` call order round 1 did not publish. This
is the whole case for section 0.8a.

**What R2 therefore freezes, and this is the honest form.** Under RULE K:

- the nine original sound shapes at **exactly 0** unsound, nine zeros;
- `mixed-perstudent-plus-shared-dropbox` at **exactly 2254 of 19936**, RED ON ANY
  CHANGE IN EITHER DIRECTION, **and only if the generator of 0.8b is the one that
  ships**; if the generator is re-implemented, this integer is re-measured in the
  same commit and the re-measured value is what is frozen;
- the two added two-deep shapes at **0** and **287**;
- `crossstep-ambiguity` at **0**.

RULING 87's known-unsound shape is therefore still unsound under RULE K at the
same rate, the row's accepted cost is unchanged, and **nothing in Wave 2's
predicate is frozen against a folder definition the implementation will not use**
- which is `docs/a44-waves.md` 6.5's prerequisite, and it is discharged here.

---

## 2. Numbered requirements

Each names the object under comparison, the instrument producing each quantity,
and the DIRECTION of failure. `X` in a filename means the wave-plan seat names
the file; a requirement binds to the assertion, never to the filename.

### R13. THE IDENTITY-KEY ORACLE - the highest-value instrument in this document

Stated first because it closes the sharpest silent green, and because round 1 did
not have it.

- **Object:** for each of the 27 fixtures, the LIST OF IDENTITY KEYS, one per
  path in fixture order, against the frozen literals in 1.3.
- **Instrument:** one `parseSubmissionFileName(path, undefined, chain)` call per
  path on the migrated path; `expect(keys).toEqual(<frozen array>)`. Frozen
  literal arrays in the test body. **Never derived from a display.**
- **Direction of failure:** RED on any difference. Specifically:
  - RED when K1's four keys are not
    `["12:alvarezmaria5:essay","20:12:alvarezmariaessay","22:12:alvarezmaria5:essay","22:12:alvarezmaria5:essay"]`.
    Each of the three forgers fails a DIFFERENT partial encoding: measured,
    `ONEPREF` collides on path 2, `BARE` on path 3, `PARTIAL` and `PLAN` on path 4.
  - RED when G13's two keys are equal (the separator-injectivity pair - a
    printable `::` separator produces `x::_a::b` for BOTH).
  - RED when any step-1..4 key is not length-prefixed - e.g. F2's `7:janedoe`
    rather than `janedoe`. **This is the assertion that makes the encoding TOTAL
    rather than partial**, and it is one `toEqual` per fixture, not a rule.
    Measured, **the KEY column catches the steps-1-to-4-raw encoding on SEVEN of
    the 27 fixtures** - F1, F2, F5, F7, F8, G10 and K1 - because those are the
    fixtures with a step-1..4 resolution. Every one of those seven has an
    identical row count, an identical display array and zero invariant violations
    under that encoding; **the key literal is the only thing that moves.**
- **WHY THIS REQUIREMENT EXISTS, measured.** `NO test in this repository asserts
  a grade identity key` (0.3, exit 1 against 11 hits for the display under the
  same filter). And a partial encoding **changes no display and no row count**:

  ```
  K1, four paths, RULE K vs the PARTIAL encoding
    rows        3            3            IDENTICAL
    displays    ["12:alvarezmaria5:essay","12:alvarezmariaessay","AlvarezMaria/essay"]
                identical under both        DISPLAY LISTS EQUAL = true
    keys        path 4 "22:12:alvarezmaria5:essay"  vs  "12:alvarezmaria5:essay"
    INVARIANT M 0            1            <- the only other thing that sees it
  ```

  So the entire existing suite, plus every display literal and every row count in
  this document, passes a forgeable implementation. **R13 and R14 are the only two
  instruments that do not.**
- **Runs:** `npm run test:paths -- <the identity-invariants test> <the grouping test>`

### R1. Every frozen row of 1.3 is reproduced

- **Object:** for each of the 27 fixtures, eight frozen quantities -
  `rowsToday`, `rowsAfter`, `fbBlendAfter`, `SPLIT`, `MERGE`, `displays`,
  `displaysUnique`, and `seedEdits` slot count. (The KEY column is R13's and the
  DECISION column is R2's, so that each has one owner.)
- **Instrument, quantity by quantity:** the fixture's `submissions` and
  `zipParents` records written as literals in the test. `rowsToday` from ONE
  `groupSubmissionsByStudent` call over the UNMIGRATED path (no `zipParents`
  argument); `rowsAfter` from ONE call over the migrated path; `fbBlendAfter`,
  `SPLIT` and `MERGE` from the declared owner map, recovered by content MARKER
  and **never by file name**; `displaysUnique` from
  `new Set(rows.map(r => r.student)).size === rows.length`; the slot count from
  `Object.keys(seedEdits(run)).length`. Expected values are frozen literals.
- **Direction of failure:** RED on any difference. Specifically RED when F3, F8,
  G1, G2, G8 or K2 returns fewer rows than its frozen `rowsAfter`; RED when
  K1 returns fewer than 3; RED when G3's SPLIT is not exactly 1 or K2's is not
  exactly 2; RED when G13's `rowsAfter` is not exactly 2; RED when K3's or K4's
  displays are not pairwise distinct.
- **`rowsToday` IS PART OF THIS REQUIREMENT, not a preamble.** It is the
  transcription check: a mismatch there means the fixture's inputs are wrong
  rather than the rule, and one fixture failed it on this pass (1.3).
- **Why F1 is in the table although A44 does not fix it:** it is the only fixture
  that catches a decision pulling convention-branch files into the collision set
  (mutant M-DECIDE f), and pinning its ALLOW is what stops A44 silently widening
  into A14's territory.
- **Never import this fixture table from another `*.test.ts`.** If two files want
  it, DUPLICATE it; importing re-runs the other file's `describe` blocks.

### R14. INVARIANT M - monotone refinement, over GENERATED input

- **Object:** for every generated set, the pair of partitions of file paths into
  rows, before and after. For every pair of paths `x`,`y`: if they share a row
  AFTER, they shared a row BEFORE.
- **Instrument:** two `groupSubmissionsByStudent` calls over the same
  `submissions`/`zipParents`, one per path; each file located in a row by its
  content MARKER; the pairwise check over the marker set. Generator of 0.8b, seed
  a literal in the test.
- **THE SHAPES IT MUST BE EXERCISED AGAINST, and the three forgery shapes are not
  optional:** the eleven original shapes, plus `nested-perstudent-subdirs`,
  `nested-shared-dropbox-subdirs`, **`flat-forgery`**,
  **`flat-forgery-perpart`**, **`conv-forgery`**, `crossstep-ambiguity`. Seventeen.
- **Direction of failure:** RED on ANY violation in ANY shape. **Expected count
  is exactly 0 on each of the seventeen - seventeen zeros, not a rate.**
- **The shape list is itself asserted**, as a frozen set with its exact length -
  the `headless.test.ts` exact-set-size idiom - so dropping a shape is a visible
  test change rather than a silent loss of coverage. Measured: dropping any one of
  the three forgery shapes loses the ONLY generated instrument that catches the
  corresponding partial encoding.
- **Why the zeros mean something:** on the three forgery shapes the same
  instrument reports **20000 of 20000** against `ONEPREF`, `BARE`, `PARTIAL` and
  `PLAN` respectively (1.4). A sweep that reported zero for the good rule and zero
  for a rule with exhibited failures would be no evidence at all; that is the
  exact trap the architecture pass hit and rebuilt out of.

### R15. INVARIANT D - display uniqueness, and the terminal pass's GUARANTEE

- **Object:** for every fixture and every generated set, the rows returned by
  `groupSubmissionsByStudent`:
  `new Set(rows.map(r => r.student)).size === rows.length`.
- **Instrument:** one call; the set-size comparison. Plus, on K3 and K4, the
  frozen display arrays of 1.3 by `toEqual`.
- **Direction of failure:** RED on any duplicate. Expected: 0 violations on all
  27 fixtures and on all seventeen sweep shapes.
- **THE SABOTAGE MUST BE THE CROSS-STEP SHAPE (K3/K4), NOT THE FLAT-FORGERY
  FAMILY.** Measured: with the terminal pass removed, the flat-forgery shapes
  report **0** INVARIANT D violations, so a sabotage drawn from that family will
  appear to prove the terminal pass unnecessary. `crossstep-ambiguity` reports
  **156 of 20000** with the pass removed, and K3 reports a violation on two files.
- **NEW AND LOAD-BEARING: a COUNTING terminal pass is not sufficient, and K4 is
  the only thing in any A44 artifact that catches it.** Appending ` (2)`, ` (3)`
  to the second and later claimants of a label does NOT guarantee distinctness,
  because the suffixed label can collide with another row's RAW label. Measured on
  K4:

  ```
  NOTERM  rows=3 displays=["JaneDoe/src/deep","JaneDoe/src/deep","JaneDoe/src/deep (2)"]  INVARIANT_D=false
  NAIVE   rows=3 displays=["JaneDoe/src/deep","JaneDoe/src/deep (2)","JaneDoe/src/deep (2)"] INVARIANT_D=false
  RULE K  rows=3 displays=["JaneDoe/src/deep","JaneDoe/src/deep (2)","JaneDoe/src/deep (3)"] INVARIANT_D=true
  ```

  The third path is `JaneDoe/src/ deep (2).txt` - a LEADING SPACE defeats
  `leafStemFallback`'s anchored `/^([A-Za-z0-9]+)/`, so `.trim()` returns the whole
  stem `deep (2)` as the identity and the raw display is `JaneDoe/src/deep (2)`.
  **The implementation must search for the first UNCLAIMED suffix against the set
  of labels already taken, not count occurrences of a base.** The requirement is
  the frozen K4 display array; the construction is what satisfies it.
- `NAIVE` survives **the entire seventeen-shape generated sweep** (invD_NAIVE = 0
  everywhere) and, measured across all 27 fixtures against the frozen rows, the
  frozen displays, the frozen keys and both invariants, **fails exactly one:
  K4**. That is why K4 is a fixture and not a sweep shape.

### R16. THE TERMINAL PASS'S WALK ORDER - pinned, because the display is the storage label

- **Object:** the map from identity KEY to the SUFFIX the terminal pass assigned
  (`""`, `"2"`, `"3"`, ...), computed twice over the same file set presented in
  two insertion orders.
- **Instrument:** build `submissions` twice, once in `Object.keys` order and once
  reversed; one `groupSubmissionsByStudent` call each; for each path recover its
  row by content MARKER, read the row's label, extract the ` (n)` suffix with
  `/ \((\d+)\)$/`, pair it with that path's identity key, sort, compare the two
  serialisations for equality.
- **Direction of failure:** RED when the two serialisations differ. Expected: 0
  differing sets on every shape.
- **THIS INSTRUMENT WAS REBUILT, and the first version discriminated NOTHING.**
  My first form compared `path -> full label`. Measured, it reports **6483 for
  RULE K and 6483 for ENTRIES on `flat`** - red in both directions, because
  `groupSubmissionsByStudent`'s first-writer-wins display choice within ONE key
  (`utils.ts:301-316`) is insertion-order dependent TODAY and has nothing to do
  with the terminal pass. Comparing the SUFFIX only isolates the pass:

  ```
  shape                      sets       K  ENTRIES   NAIVE  NOTERM
  flat                      19935       0        0       0       0
  folder                    20000       0        0       0       0
  crossstep-ambiguity       20000       0      156       0       0
  ```

  and on K3 as a fixture, the per-file labels:

  ```
  K       orderA main.py -> "JaneDoe/src/deep (2)"   deep.txt -> "JaneDoe/src/deep"
          orderB main.py -> "JaneDoe/src/deep (2)"   deep.txt -> "JaneDoe/src/deep"   IDENTICAL
  ENTRIES orderA main.py -> "JaneDoe/src/deep"       deep.txt -> "JaneDoe/src/deep (2)"
          orderB main.py -> "JaneDoe/src/deep (2)"   deep.txt -> "JaneDoe/src/deep"   DIFFERENT
  ```
- **ON K3 - the TWO-file case - A SORTED DISPLAY-LIST ASSERTION CANNOT SEE THIS,
  measured:** the sorted list is `["JaneDoe/src/deep","JaneDoe/src/deep (2)"]`
  under both insertion orders under BOTH implementations, and `ENTRIES` passes K3's
  row count, its frozen display array, its frozen keys, INVARIANT D and INVARIANT M.
  **R16 is the only instrument that catches it there.**
- **CORRECTION TO MY OWN FIRST CLAIM, measured across all 27 fixtures rather than
  the ten in the grid: `ENTRIES` does NOT survive the whole oracle - it fails K4's
  frozen DISPLAY ARRAY.** With three colliders it produces
  `["JaneDoe/src/deep","JaneDoe/src/deep (2)","JaneDoe/src/deep (2) (2)"]` against
  the frozen `[... " (3)"]`, because it reaches the third file before the second
  has claimed its suffix. So `ENTRIES` is caught by **two** instruments, not one:
  K4's frozen display array, and R16. **R16 is still required**, for two reasons -
  it catches the TWO-file case that K4's extra collider hides, and it is the only
  one that identifies the defect as an ORDER DEPENDENCE rather than as one wrong
  label, which is what tells an implementer to change the walk rather than the
  suffix search. I am stating the over-claim rather than quietly narrowing it,
  because the grid in 3.1 checks only row counts and the two invariants and my
  first reading of it was wrong.
- **Why it matters and is not pedantry:** under RULING 93 the display IS the
  storage label, so which of two rows carries the ` (2)` decides which row an
  instructor's saved feedback lands on, and `Object.entries` order is zip entry
  order.

### R2. THE SOUNDNESS INSTRUMENT

Zero fallback-caused harm may be silently allowed.

- **Object:** for every generated set in a named shape, the pair (fallback-caused
  BLEND present after the fold, decision refuses).
- **Instrument:** ground truth from the per-file declared owner, recovered by
  content MARKER, over ONE `groupSubmissionsByStudent` call on the migrated path;
  the decision from ONE call to the decision function over the same
  `submissions`/`zipParents`; the fallback population from
  `parseSubmissionFileName(...).reachedStemFallback`. Seed a literal.
- **THE SHAPES, all of these, none optional:** `flat`, `folder`,
  `folder-resubmit`, `convention`, `convention-resubmit`,
  `folder-distinct-stems`, **`shared-wrapper-folder`** (the shape that killed
  RULING 85's literal mechanism), `single-student-multi-folder-shared-filename`,
  **`nested-bulk-perstudent-folders`** (100% silent harm today),
  `mixed-perstudent-plus-shared-dropbox`, **`nested-perstudent-subdirs`** and
  **`nested-shared-dropbox-subdirs`** (the two-deep shapes, new, and the ONLY
  ones that can see a folder-definition change), **`crossstep-ambiguity`**.
- **First direction:** RED when any set in any shape carries a fallback-caused
  blend and is ALLOWED, except on the shapes whose frozen unsound count is
  non-zero. Expected: exactly **0** on `flat`, `folder`, `folder-resubmit`,
  `convention`, `convention-resubmit`, `folder-distinct-stems`,
  `shared-wrapper-folder`, `single-student-...`, `nested-bulk-...`,
  `nested-perstudent-subdirs` and `crossstep-ambiguity`.
- **Second direction, same instrument:** RED when any set in `convention`,
  `convention-resubmit` or `folder-distinct-stems` is REFUSED. Exactly 0 each.
- **Third direction, the frozen conservative counts:** `folder-resubmit`
  **1255**, `single-student-...` **476**, and **0 on every other shape**.
- **Fourth direction, the two ACCEPTED non-zero unsound counts, as EXACT FROZEN
  INTEGERS, RED ON ANY CHANGE IN EITHER DIRECTION:**
  `mixed-perstudent-plus-shared-dropbox` **2254 of 19936**, and
  `nested-shared-dropbox-subdirs` **287 of 19990**. A rise is a regression; a
  FALL means the mechanism changed and the change was not measured, and the number
  is re-frozen in the same commit that causes it. This is the `headless.test.ts`
  exact-set-size idiom.
- **Fifth direction, the fixture-level DECISION column of 1.3, all 27 values.**
  RED on any difference. Verified this pass, `H12_EXITCODE=0`: 26 of the 27
  reproduce round 1's frozen column under RULE K's key and RULE K's folder, so
  the refined predicate's fixture-level verdicts survive RULE K intact, and the
  27th was my own wrong K1 value.
- **Every one of those integers is conditional on the generator of 0.8b
  shipping.** If it does not, they are re-measured in the same commit and the
  re-measured values are frozen - see 0.8a. A stale count is a finding, not a
  tolerance.
- **Why R1 is not enough:** a hand-written list of 27 is satisfied by an
  implementation that matches 27 path sets. A seeded sweep whose expected values
  are eleven zeros and four counts is not.

**THE UNSOUND SHAPE, carried forward unchanged in substance.** The run gate opens
as soon as the run shows 2 or more distinct folders; once open, a colliding group
sitting inside ONE folder is granted amnesty - and `{folder F holds exactly two
files that collide on stem}` is the SAME INPUT whether F is one student's own
folder (F6) or a folder two students both used (G5/G6). Nothing in the file paths
distinguishes them. RULE K relocates this from "one folder in the run" to "one
folder-PATH among several"; it does not remove it. The frozen instances are G5
and G6.

**Round 1's corroboration variant is NOT re-measured here and NOT re-proposed.**
It was the second attempt on this class, `docs/loop/iteration-caps.md` cap 1
forbids a third, and round 1's own measurement is that it reaches zero unsound
while raising `folder-resubmit`'s conservative rate above the pre-A44 baseline -
so it fails R3 while satisfying R2. That fork is the orchestrator's and is
recorded as RES-A44T-8, not re-litigated.

### R3. The row's own pass condition - a CONSTRUCTION requirement, not a frozen pair

- **Object:** the conservative refusal count on the `folder-resubmit` shape,
  pre-A44 predicate versus post-A44 predicate.
- **Instrument:** the sweep of R2, `folder-resubmit` shape, **both predicates run
  over the SAME generated sets in the SAME process**, so the comparison is between
  two decisions over one population rather than two runs.
- **Direction of failure:** RED when the post-A44 conservative count is **not
  strictly below** the pre-A44 count.
- **THE PRE-A44 INTEGER IS WITHDRAWN AS UNMEASURABLE BY THIS PASS, and here is
  why rather than a hand-wave.** A41's predicate does not exist in the tree:

  ```
  $ grep -rln "resolve to the same student" src
  exit=1                              (A41's decision leaf: nothing in src/ refuses today)
  $ grep -rln "leafStemFallback" src
  src/lib/grade/single-file-entry.test.ts  src/lib/grade/single-file-entry.ts  src/lib/grade/utils.ts
  exit=0                              (CANARY, same command and same filter: it CAN find a present string)
  ```

  and its definition is not reproduced in any artifact handed to this pass in
  enough detail to implement. Round 1's `2891 (14.5%)` came from its own
  scratchpad. **So R3 cannot be a frozen pair; it is a within-run inequality, and
  the test must implement BOTH predicates.** The post-A44 half IS measured here:
  **1255 of 19972 (6.3%)**.
- **Forbidden spelling:** asserting the RATE. Rates hide a changed denominator.
  Assert both integers and their ordering.
- **Why this is a requirement and not a note:** it is the row's literal pass
  condition (`docs/BACKLOG.md:118`), and nothing in the suite measures a refusal
  rate today.

### R4. The false split, as independent frozen absolutes

- **Object:** on `single-student-multi-folder-shared-filename`, the count of sets
  containing a SPLIT before the fold and after the fold, against **0** and
  **19382**; plus the count that is SPLIT and UNREFUSED, **19382**.
- **Instrument:** the declared owner map; two `groupSubmissionsByStudent` calls
  over the same generated sets, one per path; the decision function for the
  refusal half. Same seed, same process.
- **Direction of failure:** RED on any change to either integer.
- **Frozen companion, `folder-resubmit`: splitBefore 14832 and splitAfter
  14832, splitUnrefused 13871.** Both absolutes asserted. Asserting only the
  after-value attributes a pre-existing 74.3% to A44; asserting only the delta
  makes the test an implementation-to-implementation comparison.
- **G3 and K2 are this class's frozen fixtures.** G3 is one owner across
  `backend/` and `frontend/`, `rowsAfter` 2, SPLIT 1, displays
  `["backend/config","frontend/config"]`. **K2 is new and is the deeper case**:
  two owners each with `src/` and `docs/`, `rowsAfter` 4, **SPLIT 2** - both
  students split, and that is RULING 95's accepted cost applied at depth. The
  display arrays are frozen because two graded rows named after DIRECTORIES are
  the user-visible face of the accepted regression.
- **R2's residual RES-A44T-9 carries the reporting obligation** so this rate is
  recorded as RULING 95's accepted cost, never as a defect to be fixed.

### R7'. PERSISTENCE, RE-POINTED AT THE DISPLAY (RULING 93)

Round 1's R7 asserted the identity key. **WITHDRAWN.** Under RULING 93 storage is
display-keyed with no recovery, so the object is the DISPLAY - and the four
sub-cases survive with their directions intact. All four EXECUTED against the
REAL `seedEdits` / `mergeStoredRowEdit` / `loadPersistedEdits`, `H8_EXITCODE=0`.

**P1' - an unchanged display survives a changed run composition.**

```
run1 displays = ["AlvarezMaria/essay"]
run2 displays = ["AlvarezMaria/essay","BrownTom/essay"]
MARIA'S DISPLAY UNCHANGED = true          <- the precondition, asserted FIRST
stored blob keys = ["AlvarezMaria/essay"]
Maria recovered total="9.5" strengths="INSTRUCTOR EDIT ON MARIA"
P1' VERDICT: display-unchanged edit survived = true
```

- **Object:** the strengths and total recovered for a row whose DISPLAY is
  byte-identical across two runs, against what the instructor saved.
- **Instrument:** two runs through the real persistence functions - seed run 1,
  mutate one row's edit, serialise, load against run 2's results. **The
  display-unchanged precondition is asserted first**, so the test cannot pass by
  the display having changed too.
- **Direction of failure:** RED when the saved value is not recovered. Frozen
  literal: `"INSTRUCTOR EDIT ON MARIA"` must come back, not `"orig strengths"`.
- **THE CONTROL that makes P1' non-vacuous, and it is what RULING 92 withdrew.**
  The collision-triggered fold fails the same test:

  ```
  conditional rule: run1 ["essay"]  run2 ["essay (AlvarezMaria)","essay (BrownTom)"]
  Maria recovered strengths="orig strengths"
  CONTROL VERDICT: edit survived = false
  ```

  So the unconditional fold is what P1' is measuring, and the control proves the
  assertion can fail.

**P3' - the ACCEPTED ONE-TIME LOSS, as a test rather than a paragraph.** This is
L3 in the architecture's section 10, the one user-visible consequence nobody
thought a test could show.

```
pre-A44 displays  = ["essay"]
post-A44 displays = ["AlvarezMaria/essay","BrownTom/essay","ChenLi/essay"]
pre-A44 displays with NO successor = ["essay"]
rows recovering the pre-A44 edit = 0
```

- **Object:** the set of pre-A44 displays that appear in the post-A44 display
  set, and the number of rows recovering an edit stored against a pre-A44
  display.
- **Direction of failure:** RED when the intersection is not empty, and **RED
  when any row recovers the pre-A44 edit.** A NON-ZERO here means a recovery
  path was written, which RULING 93 deleted. This turns "the recovery is
  deleted" from an absence into an assertion.

**P4 - the consumer-side face of INVARIANT D.** Unchanged from round 1.

```
F3 three per-student folders   TODAY   rows=1 seedEdits slots=1 EQUAL=true
F3 three per-student folders   RULE K  rows=3 seedEdits slots=3 EQUAL=true
K3 cross-step ambiguity        RULE K  rows=2 seedEdits slots=2 EQUAL=true
K3 cross-step ambiguity        NOTERM  rows=2 seedEdits slots=1 EQUAL=false
K4 suffix forgery              NAIVE   rows=3 seedEdits slots=2 EQUAL=false
```

RED when `Object.keys(seedEdits(run)).length !== run.results.length`.

**P5' - the ROW-INDEX mutant needs a sibling that sorts BEFORE the edited row.**

```
sibling sorts AFTER  (BrownTom)    run1 idx=0  run2 idx=0  ROW-INDEX KEYING SURVIVES = true
sibling sorts BEFORE (AAAStudent)  run1 idx=0  run2 idx=1  ROW-INDEX KEYING SURVIVES = false
```

`utils.ts:319` sorts rows by display, so P1' alone passes an implementation that
keys edits on the ROW INDEX. **Both cases are required**, and the second exists
only because I attacked the first.

### R17. THE THREE EXECUTABLE DISPLAY-KEYED CONSUMERS, driven

`docs/a44-waves.md`'s MA-1 correction: the most damaging consequence of a display
collision is testable without rendering anything. Executed, `H9_EXITCODE=0`.

| consumer | `file:line` | driven result under RULE K on K3 | under `NOTERM` |
|---|---|---|---|
| `seedEdits` | `gradingResultsHelpers.ts:287` | 2 slots for 2 rows | **1 slot for 2 rows** |
| `buildCsvContent` | `:503-504` | 2 data rows, 2 distinct first cells | 2 data rows, **1 distinct first cell** |
| `fanOutGradingPostResult` | `:717`,`:722`,`:725` | 2 entries; the failed post reports `{"status":"error","message":"Canvas rejected 101"}` | **1 entry, `{"JaneDoe/src/deep":{"status":"posted"}}`** |

- **Object:** for a two-row input whose rows share one display, the entry count
  each consumer returns, and `fanOutGradingPostResult`'s status for the row whose
  Canvas post FAILED.
- **Instrument:** each function imported and called directly - all three are
  exported pure functions in plain `.ts` files. Two attempted rows with distinct
  `userId`, one in `result.failures`.
- **Direction of failure:** RED when `Object.keys(fanOut).length < 2`; RED when
  the failed row's status is not `"error"`; RED when the CSV's distinct first
  cells are fewer than its data rows; RED when `seedEdits`' slot count is below
  the row count.
- **THE USER-VISIBLE HARM, executed and quotable:** *two attempted rows, one
  FAILED at Canvas, one fan-out entry, and its status is `"posted"`.* An
  instructor is told a grade reached Canvas that did not. That is what INVARIANT D
  is protecting, and it is a test rather than an argument.
- `correctUngradedSeeds` (`ungradedDisclosure.ts:191-193`) is the fourth site and
  the same shape applies, but **it is ARGUED, not executed here**:
  `ungradedDisclosure.ts` imports `grade/engine.ts` by extensionless specifier and
  does not load under `node --experimental-strip-types`. It is drivable under
  vitest, where its own test file already exists at 47 tests.

### R5. The refusal is EMITTED by the producer, on the DEFAULT path and all three unattended ones

**Carried forward from round 1 verbatim in substance.** Nothing in RULE K, RULE D
or RULING 93 touches the channel. The measured facts it rests on, each re-checked
against the tree by round 1 and unchanged by this design: the default provider is
`gemini` (`src/lib/llm-provider.ts:14`, `:16-20`); the default zip branch
(`src/app/actions/grading.ts:905-920`, `gradeSubmissions` at `:907`) **returns no
`warnings` field at all**, so a refusal delivered as `warnings` is DEAD there;
`gradeAction`'s outer catch at `:921-924` returns
`{ run: null, error: message }` with `err.message` VERBATIM; `state.error` renders
at `src/app/components/GradingTab.tsx:262-266` with `role="alert"`; all three
unattended callers read `.error` and none reads `warnings`.

- **R5a, the default (gemini) zip branch.** Drive `gradeAction` with a real
  `FormData` (`src/app/actions/grading.budget.test.ts:88-94,105,129` is the
  landed precedent), `requireOwner` mocked, **`callLlm` from `@/lib/llm` mocked -
  never `fetch`** (`vitest.setup.ts` throws on any unmocked `fetch`, and that
  throw is load-bearing: a live 401 once made a sabotage check pass here),
  `gradeSubmissions` left REAL. The zip is real, built with JSZip; **`.txt`, never
  `.docx`** (`extraction.test.ts:173-178` records that `DOCUMENT_EXTENSIONS`
  routes `.docx` through a real Word parser which rejects plain-string bytes, so a
  `.docx` fixture produces ZERO submissions and the test passes for the wrong
  reason); `generateAsync({type:"nodebuffer"})` returns a Buffer on a shared 8KB
  pool, so pass the nodebuffer directly or generate `type:"arraybuffer"`, never
  `.buffer` (`extraction.test.ts:159-165`).
  **Directions:** (1) RED when `result.error` is not EQUAL by `toBe` to the frozen
  refusal string; (2) RED when `result.run` is not `null`; (3) **RED when any
  `callLlm` request body contains any fixture file's content MARKER** - the
  assertion that binds to the harm rather than to a string, and the one that
  survives a rewording; (4) on F3's `.txt` variant, which A44 FIXES rather than
  refuses, the mirror assertions: `error` null, `run.results` length 3, the three
  `student` strings pairwise distinct. **A test that only ever asserts a refusal
  cannot tell a working fix from a blanket refusal.**
- **R5b, the embedded branch.** Same frozen literal; `extractStudentEntries` left
  REAL so the refusal is exercised on `grading.ts:854`'s path;
  `buildEmbeddedRubric` and `gradeEntriesEmbedded` mocked. RED when
  `gradeEntriesEmbedded` was called at all.
- **R5c, the three unattended paths, DRIVEN.**
  `src/lib/workflows/registry/steps.grading-cartridge.test.ts:133` already
  executes `step.run(...)` with `gradeAction` mocked at `:7-13`; the same shape
  exists for `steps.grading-run.test.ts` and `steps.grading-draft-flow.test.ts`.
  RED when the emitted line is not EQUAL to `` `${drop.name}: ${frozen}` ``,
  `` `Offline grading: ${frozen}` `` and
  `` `${row.courseName} - ${row.assignmentName}: ${frozen}` `` respectively.
  Equality on the WHOLE line, so a template change that drops the refusal into a
  truncated field is caught. **This is the "drive the production path" rule
  applied**: a structural gate would have pushed this to a source-text check, and
  the production path was drivable all along.

### R6. The refusal must NOT fire where nothing was at risk

Carried forward verbatim. Decision function mocked and its call count read;
`gradeAction` driven three times: (i) a single non-zip `.txt` upload,
`provider=gemini` (`grading.ts:892-903`; `single-file-entry.ts` returns at most
one entry, so nothing can collapse); (ii) `provider=other` (`:846-849`);
(iii) `canvasUrl` set (`:740` returns before the zip branch). RED when the
decision is called on any of the three; RED when `result.error` on (i) is
non-null. `src/lib/grade/single-file-entry.test.ts:70-76` exists because that
path was deliberately kept off the shared fallback.

### R8. The copy: every clause bound to an emitted value, on every path, by EQUALITY

Carried forward with one clause re-pointed. What the code HAS at the decision
point is unchanged except where RULE K changes it:

| Quantity | Available? | Where |
|---|---|---|
| the colliding group's paths | YES | the group's own subset of `Object.keys(submissions)` |
| the group's computed display | YES | `parseSubmissionFileName(...).studentDisplay` |
| **the group's container-relative directory PATH** | **YES, and constant across the group** | **proven by construction AND measured: under RULE K a key is `a44Encode([dir, stem])` or `a44Encode([stem])`, so equal keys imply equal dir. Verified by mutant M-DECIDE-rebuilt below** |
| the count of DISTINCT directory paths in the fallback-reaching population | YES | the run gate's own input |
| the count of files whose text was READ | YES | `Object.keys(submissions).length` |
| the count of entries in the zip | **NO** | `extraction.ts:83-85` skips unsupported extensions with no counter; `:137`'s destructure discards `attemptedSupportedFiles`/`failedSupportedFiles` |
| the number of STUDENTS | **NO, and that is the defect** | the collapse is precisely the app not knowing this |

- **C-A. Bind to paths, keys and directories - never to students or
  submissions.** "Submissions" is this app's own synonym for a student's work
  (`GradingTab.tsx:322`; the returned type is `StudentSubmissionEntry`), so a
  count of "submissions" is a student count wearing a synonym.
- **C-B. EQUALITY, never containment.** `toContain` is defeated by four appended
  words that keep every required token and invert the meaning - an executed
  defeat on record here. Every copy assertion is `toBe(<frozen literal>)`.
- **C-C. TWO refusal variants, not one sentence.** `no-folder-signal` (fewer than
  2 distinct directory paths among the fallback-reaching files: F4, F6, F9, G4,
  G9) versus `flat-collision-in-foldered-run` (2 or more directories present and
  the colliding files at the top level: G12). "Give each student their own folder"
  is TRUE and outcome-changing on the first (`flat` refuses 11520 of 19935,
  `folder` refuses 0 of 20000 after the fold) and MISLEADING on the second, where
  most students already have one. The decision is a DISCRIMINATED UNION and its
  describe function is an exhaustive `switch` with **no `default`** - precedent
  `src/lib/submission-zip-intake.ts:93-98` and `:145-158`. That makes the
  missing-sentence state UNREPRESENTABLE rather than asserted absent, and it fails
  `npx tsc --noEmit` rather than vitest.
- **C-D, RE-POINTED. The directory must be labelled as a folder, quoted, and it
  is now a PATH.** Under RULE K the group's folder is
  `Submissions/AlvarezMaria`, not `AlvarezMaria` (measured: G8's key decodes to
  `submissions/alvarezmaria`, and `a44ContainerRelativeDir` returns
  `Submissions/AlvarezMaria` with case preserved). A sentence reading
  `2 files in Submissions/AlvarezMaria resolve to the same name` renders a path as
  if it were a student. The frozen literal must show it **in quotes AND preceded
  by the word `folder`**, and the assertion is equality over the whole sentence.
  **The verbatim, case-preserving form comes only from
  `a44ContainerRelativeDir`; the decoded key gives the lowercased form** - which
  is `docs/a44-waves.md` 6.3's condition on whether that helper needs exporting.
- **C-E. No warn-then-proceed sentence.** Under RULING 87 there is no proceeding
  branch for a refusal; any such string in the diff is a finding.
- **C-F. No claim that the files belong to one student.** The amnesty does not
  conclude that; it declines to refuse. `resolve to the same student NAME` is
  true; `are the same student` is not.
- **Object:** the emitted `error` string on R5a, R5b and all three R5c report
  lines, on: a `no-folder-signal` fixture (F6's `.txt` variant), a
  `flat-collision-in-foldered-run` fixture (G12), a multi-group fixture (F8's
  shape with two colliding keys), a >5-path group, and **a TWO-SEGMENT directory
  fixture (G8's shape), which is new and which no round-1 copy fixture covered.**
- **Instrument:** `expect(<emitted>).toBe(<frozen literal>)`, one literal per
  fixture, written out in full in the test body.
- **Direction of failure:** RED on any difference - appended words, changed
  numbers, changed nouns, a dropped `folder` label, **or a directory rendered as
  its last segment where the path is two deep.**
- **Truncation:** if the path list is capped (precedent
  `submission-zip-intake.ts:135-141` caps at 5 with `, ...`), a sixth fixture
  with six colliding paths and the truncated string frozen is REQUIRED. An
  uncapped list is acceptable, but then a frozen six-path string proving it is
  uncapped is required. A cap with no fixture ships an untested branch green.
- **No assertion anywhere that the string EXISTS IN THE SOURCE** of `grading.ts`,
  `engine.ts`, `utils.ts` or the leaf. A retired literal kept as a source grep
  prints lines on correct code forever (`docs/BACKLOG.md:86`, A34), and
  source-text tests that pin wording have twice forced contorted code here. Pin
  the EMITTED value.
- **The DISPLAY is user-facing copy too**, and its disclosure literals are G3's
  `["backend/config","frontend/config"]` and **K2's four-element array** - two
  and then four graded rows named after directories. Frozen in 1.3, not
  duplicated here.

### R9. The guard at `utils.test.ts:360-375`: REPAIR, with the measurement that makes the repair real

**Decision unchanged: KEEP the test, RENAME what it claims, ADD the fixture rows
that make the renamed claim non-vacuous. Do not delete it and do not re-spell
it.** What changed is the mechanism, because RULE D folds inside
`parseSubmissionFileName`.

The finding reproduces. `grouped` is a `Map` on `inferred.key`
(`utils.ts:301,305,308`) and today all six return sites set
`studentKey = studentDisplay.toLowerCase()`, so distinct keys imply distinct
displays and `expect(new Set(students).size).toBe(students.length)` at `:373` is
true by construction TODAY.

**A44 breaks that invariant for the first time in this codebase**, and under
RULE K the key is not a lowercased display at all - `AlvarezMaria/essay.txt`
gives key `12:alvarezmaria5:essay` and display `AlvarezMaria/essay`. So `:373`
becomes falsifiable by a state the implementation can reach. Measured:

```
F3's paths, key fold ONLY (no display fold):  displays=["essay","essay","essay"]  :373 holds = FALSE
F3's paths, RULE K + RULE D:                  displays=["AlvarezMaria/essay",...] :373 holds = TRUE
```

**The existing fixture is vacuous for the renamed claim both before and after,
which is why rows must be added.** Measured on `:362-370`'s own four paths, with
the fold applied:

```
today:        displays=["janedoe","johndoe","marysmith","otherfile"]     unique=true
under RULE D: displays=["janedoe","johndoe","marysmith","src/otherfile"] unique=true (4 of 4)
```

- **Object:** the guard's stated purpose against what it can detect, plus its own
  falsifiability.
- **Instrument:** (a) rename the `describe` at `:360` and rewrite the comment at
  `:354-359` to name KEY-TO-DISPLAY INJECTIVITY, with one sentence pointing at
  A44's own instruments for the collapse; (b) add to the existing mixed batch
  **K3's two paths** - a step-5 and a step-6 file whose raw displays are the same
  string - because that is the shape that makes `:373` falsifiable under RULE D,
  and the two per-student-foldered paths round 1 specified do NOT (RULE D's fold
  is unconditional, so two foldered students never share a display in the first
  place); (c) change NO existing assertion in that `describe`.
- **Direction of failure:** the repair is verified by mutant M-DISPLAY a (no
  terminal pass) going RED on `:373` for the added rows, AND by the guard still
  passing on the four original paths.
- **`:366`'s expectation changes with RULE D.** `src/otherfile.py` yields
  `src/otherfile`, and any assertion in that `describe` naming `otherfile` moves
  in the same commit.
- **A41's own constraint is honoured.** `docs/a41-test-notes.md:503` requires that
  the F3 fixture NOT be added to this `describe`, to prove the collapse claim was
  MOVED OUT rather than re-spelled. K3 is not F3: it is two paths with no
  row-count assertion attached, and the collapse claim lives in R1/R2/R13 in a
  different file. **Specifically forbidden, unchanged:** adding
  `expect(groups.length).toBe(<n>)` to this `describe`, and adding a second
  uniqueness assertion over `key` instead of `student` - the same tautology with a
  different field.
- **Why not delete it:** it is the only landed enforcer of the key-to-display
  invariant, and `gradingResultsHelpers.ts` keys stored edits and the Canvas post
  fan-out on the display string. `docs/loop/iteration-caps.md` disposal (d)
  requires naming any existing enforcer a withdrawal was protecting; there is no
  other.

### R12. The gates, and the sweeps that bite

- **Object:** the repo's own byte, emoji, ceiling and type gates over the new and
  changed files.
- **Instrument:**
  `npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/file-size-ceiling.structure.test.ts`,
  exit code read from the command. **Never hand-roll an emoji or byte scan:**
  `grep -P` here errors and still exits 0, and `src/source-bytes.structure.test.ts`
  owns the materialised-`\uXXXX` scan because Write/Edit land such an escape as
  the literal character.
- **Direction of failure:** RED on any emoji and on any materialised escape.
- **The type gate is `npx tsc --noEmit --incremental false`, no file arguments,
  ONE caller** (it races on `tsconfig.tsbuildinfo`). vitest bundles rolldown/Oxc,
  which erases types without reading them, so a green suite is not a type check.
  **Grep the new test diff for `/s` and `/gs` before running it:** the dotAll flag
  passes vitest and FAILS tsc with TS1501, hit twice in one day here.
- **The lint gate is a DELTA, never a count.** Pass: exit 0, AND the warning list
  contains no entry naming a file in this wave's write set that was absent from
  the SAME command run on the same tree immediately before the change. **No
  absolute count appears in this document**; one command produced four values in
  one day.
- **Comment stripping, if any test strips comments:** `.split(/\r?\n/)` plus an
  UNANCHORED `/\/\/.*$/` per line, or the
  `/\/\*[\s\S]*?\*\//g` + `/\/\/.*$/gm` pair that
  `src/lib/grade/grouping-zip-parents.wiring.test.ts:33-37` already uses - read
  this pass, and it IS the unanchored form. The anchored `/^[ \t]*\/\/.*$/gm`
  form is trailing-comment-blind and has an executed defeat on record here.
- **Every slice needs an anchor-resolves assertion at BOTH ends.** If any
  assertion isolates a region with `indexOf` + `slice`, assert BOTH indices are
  `> -1` and that the end exceeds the start. An unresolved `indexOf` returns -1
  and `slice(start, -1)` silently widens to nearly the whole file - a defect
  already shipped here.
- **The 1000-line ceiling** (`src/file-size-ceiling.structure.test.ts:41`) and
  the measured headroom are in 0.6. A measurement, not a requirement of mine; it
  is here because a wave that ignores it turns the suite red for an unrelated
  reason and the red gets misattributed to A44.

---

## 3. My own attack on these instruments

Required by this seat's brief: write the passing-but-wrong implementation and run
the instrument against it. **Twelve were built as patches of the reference
(0.2). Two instruments were REBUILT rather than credited with a kill, one
requirement was withdrawn, and one fixture was corrected.**

### 3.1 The grid: every rule against every fixture

`H3_EXITCODE=0`. `rN` = row count N against the frozen value; `D` = INVARIANT D
violated; `M` = INVARIANT M violated; `ok` = all three pass.

| fixture | K | PARTIAL | BARE | ONEPREF | PLAN | FOLDERALONE | FOLDALWAYS | NOFOLD | SEP | NAIVE | NOTERM | ENTRIES |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F3 three per-student folders | ok | ok | ok | ok | ok | ok | ok | **r1** | ok | ok | ok | ok |
| G1 shared wrapper zip | ok | ok | ok | ok | ok | ok | ok | **r1** | ok | ok | ok | ok |
| G8 nested two levels | ok | ok | ok | ok | ok | ok | ok | **r1** | ok | ok | ok | ok |
| G10 one student, two wrappers | ok | ok | ok | ok | ok | ok | **r2** | ok | ok | ok | ok | ok |
| G11 three students in ONE folder | ok | ok | ok | ok | ok | **r1M** | ok | ok | ok | ok | ok | ok |
| G13 separator-injectivity pair | ok | ok | ok | ok | ok | ok | ok | ok | **r1M** | ok | ok | ok |
| **K1 forgery family** | ok | **M** | **r2M** | **r2M** | **M** | ok | ok | ok | ok | ok | ok | ok |
| **K2 two students, code projects** | ok | ok | ok | ok | **r2** | ok | ok | **r2** | ok | ok | ok | ok |
| **K3 cross-step ambiguity** | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | **D** | ok |
| **K4 suffix forgery** | ok | ok | ok | ok | ok | **r2M** | ok | ok | ok | **D** | **D** | ok |

**The grid above checks only three of R1/R13/R14/R15's quantities - the frozen row
count, INVARIANT D and INVARIANT M - which is why it is followed by a SECOND
measurement over all 27 fixtures including the frozen DISPLAY arrays and the
frozen KEY arrays.** Reading the grid alone led me to one wrong conclusion about
`ENTRIES`, recorded in 3.3.

**Fixtures failing ANY of {frozen rows, INVARIANT D, INVARIANT M, frozen displays,
frozen KEYS}, over all 27, `H11_EXITCODE=0`:**

```
PARTIAL   7 of 27  ->  F1[KEYS] F2[KEYS] F5[KEYS] F7[KEYS] F8[KEYS] G10[KEYS] K1[invM,KEYS]
NAIVE     1 of 27  ->  K4[invD,displays]
ENTRIES   1 of 27  ->  K4[displays]
```

**Killed by, fixture by fixture:**

```
PARTIAL      F1, F2, F5, F7, F8, G10, K1 - all on the KEY column except K1, which
             also fails INVARIANT M   (and conv-forgery, 20000/20000, in the sweep)
BARE         K1   (rows and INVARIANT M)   (and flat-forgery-perpart, 20000/20000)
ONEPREF      K1   (rows and INVARIANT M)   (and flat-forgery, 20000/20000)
PLAN         K1, K2
FOLDERALONE  G11, K4
FOLDALWAYS   G10
NOFOLD       F3, G1, G8, K2
SEP          G13
NAIVE        K4 ONLY, in 27 fixtures and 17 sweep shapes
NOTERM       K3, K4
ENTRIES      K4's frozen DISPLAY array only, plus R16 - and R16 is the only thing
             that catches it on K3, the two-file case
K            nothing, as required
```

**Four passing-but-wrong implementations are caught by one fixture or one
instrument each, and that is the whole argument for R13, R15 and R16.** `NOFOLD`
is the only mutant a broad fixture set catches; every other one turns on a single
constructed shape or a single column.

### 3.2 THE ARCHITECTURE'S 4.4 IS RIGHT ABOUT THE CONCLUSION AND WRONG ABOUT THE MECHANISM, measured

The architecture states that a partial encoding leaves the un-encoded namespace
forgeable and that RULE K re-encodes steps 1-4 for that reason. **The conclusion
stands. The mechanism is not one forgery but THREE, each defeating a different
partiality, and a single forged path closes only one of them.** This matters
because a test written from the architecture's single example would ship two of
the three open.

```
victim: "AlvarezMaria/essay.docx"   RULE K key = "12:alvarezmaria5:essay"

(a) ONE LENGTH PREFIX on the folder, base key appended RAW   (round 1's own
    `compound` spelling, `String(folder.length)+":"+folder+baseKey`)
    forged by  " 12:alvarezmariaessay.docx"
    ONEPREF: keys collide, rows 3 -> 2, two students merged, INVARIANT M = 1

(b) PER-PART prefixing but the DIR-LESS fallback key left BARE
    forged by  " 12:alvarezmaria5:essay.docx"
    BARE:    keys collide, rows 3 -> 2, INVARIANT M = 2

(c) PER-PART prefixing at steps 5/6 only, steps 1-4 left RAW
    forged by  "12:alvarezmaria5:essay_2026-09-01_120000_x.docx"   <- the CONVENTION branch
    PARTIAL: keys collide, rows STAY 3, DISPLAYS IDENTICAL, INVARIANT M = 1
```

**(c) is the dangerous one and it is the one the architecture's example does not
reach.** The forging path is step 2, the convention branch: `parts[0]` of an
underscore split may contain colons and digits, so a filename can carry a
complete encoded key as its student part. Under (c) the row COUNT does not move
and the DISPLAY LIST is byte-identical to RULE K's, so nothing but a key
assertion or INVARIANT M sees it. That is why K1 carries four paths and why R13
freezes keys per path rather than per row.

### 3.3 TWO INSTRUMENTS REBUILT RATHER THAN BANKED AS KILLS, AND ONE OVER-CLAIM OF MY OWN

1. **THE ORDER INSTRUMENT was red in both directions and I rebuilt it.** Comparing
   `path -> full label` across two insertion orders reports **6483 for RULE K and
   6483 for ENTRIES on `flat`** - identical, so it discriminates NOTHING there. The
   order dependence it was seeing is `groupSubmissionsByStudent`'s pre-existing
   first-writer-wins display choice within ONE key (two files keyed `5:essay` with
   displays `Essay` and `essay`), which is today's behaviour and not the terminal
   pass. Rebuilt to compare `key -> SUFFIX` only: RULE K 0, ENTRIES 156 on
   `crossstep-ambiguity`, both 0 elsewhere. **Had I banked the first version, R16
   would have read as coverage on `flat` and would have proved nothing.**
2. **A NAIVE COUNTING TERMINAL PASS is a real defect, not an equivalent mutant,
   and finding that required constructing a fixture nothing in any A44 artifact
   contains.** My first terminal pass counted occurrences of a base label. It
   survives the 27-fixture oracle minus K4 and the entire seventeen-shape sweep.
   K4 kills it. The reachability argument is executed, not hypothetical: a raw
   display can already END in ` (2)` because a leading space defeats
   `leafStemFallback`'s anchored regex. **The correct construction searches for
   the first unclaimed label; that is R15.**

3. **I OVER-CLAIMED ONCE AND THE FULL MEASUREMENT CAUGHT IT.** I wrote that
   `ENTRIES` survives the whole 27-fixture oracle, on the strength of the
   ten-fixture grid in 3.1 - which checks row counts and the two invariants and
   NOT the frozen display arrays. Measured over all 27 with the display and key
   columns included, `ENTRIES` fails K4's frozen display array
   (`" (2) (2)"` where the frozen value is `" (3)"`). The requirement did not
   change and R16 is still required (it is the only thing that catches the
   two-file case), but the claim did, and **a grid that omits two of an oracle's
   columns is exactly the "instrument that cannot observe what it is being read
   as settling" trap `docs/loop/traps-spec.md` names.** The grid now says which
   columns it checks.

### 3.4 One requirement withdrawn, one mutant withdrawn, one fixture corrected

- **R10's "the display fold is SET-LEVEL by necessity" is WITHDRAWN**, measured
  false: RULE D's fold is a function of the FILE alone, and only the terminal pass
  is set-level. Round 1 inferred set-level-ness from
  `utils.test.ts:128-136`, which it read as pins FORBIDDING a per-path fold. They
  are not pins on the design; they are two assertions that CHANGE, and the
  architecture's 10.2 lists them.
- **Mutant M-KEY h, "do not lowercase the directory path", remains WITHDRAWN and
  survives DELIBERATELY.** Round 1 measured the question symmetric - lowercasing
  is right for one student in case-variant folders and wrong for two, case-exact
  is the reverse - and RULE K does not change that symmetry, only its unit (a path
  rather than a segment). No fixture pins it. Saying so IS the requirement;
  quietly picking a side and freezing it would be an instrument asserting a
  decision nobody made. RES-A44T-5.
- **Mutant M-DECIDE-rebuilt, "drop only the shared-one-folder condition from the
  amnesty", still SURVIVES and is still EQUIVALENT, not a coverage gap.** Under
  RULE K a collision group is folder-homogeneous BY CONSTRUCTION - equal keys
  decode to equal `[dir, stem]` tuples, and the dir-less form is a one-element
  tuple that cannot equal a two-element one. **Do not add an assertion to kill
  it.** G12 kills the version that also drops the non-null condition.
- **THREE of K1's own frozen values were wrong and the instruments corrected all
  three: `rowsToday` from my guessed 1 to the measured 2 (three-path form),
  `fbBlendAfter` from 1 to 0, and `DECISION` from REFUSE to ALLOW.** Every one was
  caught by a check I ran against my own table rather than by reasoning about it,
  and the third is the most instructive: **a forged key is invisible to the
  refusal on every branch**, which is exactly why R13 exists. All three are
  reported rather than quietly adjusted, because a frozen oracle silently edited
  to match a measurement is not frozen.
- **Every other DECISION value reproduces round 1's frozen column**, 26 of 27,
  under RULE K's key and RULE K's folder - verified in 1.3.

---

## 4. Satisfiability: every requirement here can be met at once

A set of failing tests is not a specification until something has passed it.

**The reference implementation is `g/utils_k.ts`** - the RULE K / RULE D patch of
the real file, whose entire diff is printed in 0.2. It is not a sketch: it is a
complete module that the real `groupSubmissionsByStudent` and the real
`seedEdits`/`mergeStoredRowEdit`/`loadPersistedEdits` were driven against.

Scored against every frozen literal this document hands over, asserted
individually and by name, `H10_EXITCODE=0`:

```
SATISFIABILITY SCORE: 279 pass / 0 fail  (total 279)
```

The 279 breaks down so the number is auditable rather than impressive: **27
fixtures times 10 assertions each** (`rowsToday`, `rowsAfter`, `fbBlendAfter`,
`SPLIT`, `MERGE`, `displays`, `KEYS`, `displaysUnique`, `INVARIANT_M`,
`seedEditsSlots`) = 270, plus R7's P1' precondition and its two recovered values
= 273, plus P5's index-moves case = 274, plus P3's empty-intersection and
zero-recovery pair = 276, plus the CSV distinct-first-cells count = 277, plus the
fan-out entry count and the failed row's `"error"` status = 279.

**One assertion failed on the first run and the ORACLE was corrected, not the
implementation:** `K1.fbBlendAfter` measured 0 against my frozen 1, because
K1's two per-part forgers already share a row TODAY and only one of them reaches
the stem fallback. Recorded because a satisfiability score reached by adjusting
expectations until they match is worth nothing.

**The DECISION column is NOT part of the 279**, deliberately: the refusal
predicate is a separate leaf, not part of `utils.ts`, so it is not part of this
reference module. It was verified by its own probe over the same 27 fixtures
(`H12_EXITCODE=0`, 1.3), driven from exactly the three things
`docs/a44-waves.md` 3.3 says Wave 2 needs and nothing else -
`parseSubmissionFileName().studentKey`, `.reachedStemFallback`, and
`a44ContainerRelativeDir`. **That is a BUILDABILITY probe, not an oracle and not a
proposed implementation**, and it establishes one thing: every quantity the
predicate needs is reachable from those three, so R2's frozen counts are
satisfiable without re-implementing the identity algorithm in production code.

**What satisfiability was NOT proven for:** R5, R6, R8 and `correctUngradedSeeds`.
Those need test files inside `src/`, outside this pass's one-file write set. They
are labelled ARGUED in section 8 with the landed precedents that make them
constructible.

**This is not a design ruling.** The implementer may compute any part
differently; the frozen oracles do not move and any mechanism must pass them. The
one thing the reference establishes is that **a mechanism satisfying all of them
simultaneously exists**, including R13, R15 and R16 together - which was not
obvious, since R15 demands a guarantee and R16 demands determinism and the naive
constructions satisfy one each.

---

## 5. The frozen refusal string

The wording is the architect's and the owner's; R8 freezes the BINDINGS, which are
the actual requirement. What is frozen HERE is the instrument's shape:

1. One frozen literal per fixture, written out in full in the test body.
2. `toBe`, never `toContain`, never a regex.
3. The SAME literal asserted on R5a and R5b, so the two provider branches cannot
   drift into two sentences for one condition.
4. A frozen literal for each of the two refusal VARIANTS, for the multi-group
   case, for the >5-path case, and **for a TWO-SEGMENT directory**.
5. The whole unattended report LINE asserted by equality on all three callers.
6. No assertion anywhere that the string exists in any SOURCE file.

A candidate, offered for the architect and owner to overwrite, updated only where
RULE K changes what is available:

> `Refused: 2 files in folder "Submissions/AlvarezMaria" resolve to the same
> student name "Homework", so they would have been graded together as one row:
> Submissions/AlvarezMaria/Homework Final.docx,
> Submissions/AlvarezMaria/Homework Draft.docx. This archive has no other student
> folders, so the folder name is not enough to tell these apart. Put each
> student's files in their own folder inside the zip, or rename each file to
> studentname_date_time_filename, then upload again. No grades were produced.`

| Clause | Bound to | Forbidden alternative and why |
|---|---|---|
| `2 files` | the colliding group's path count | not `Object.keys(submissions).length`; not the zip's entry count, which does not exist |
| `folder "Submissions/AlvarezMaria"` | **`a44ContainerRelativeDir`'s return, verbatim and case-preserving, quoted and labelled** | not the decoded key (lowercased); not the last segment alone, which is a different folder; not the bare name, which reads as a student (C-D) |
| `resolve to the same student name "Homework"` | `studentDisplay` for that group | not "are the same student" - the app does not know that (C-F) |
| the path list | the group's full paths | NOT `submittedFiles[].name`, the bare leaf, which tells the instructor nothing |
| `no other student folders` | the run gate's own distinct-directory count | must not appear on the `flat-collision-in-foldered-run` variant, where it is false |
| `one row` | the counterfactual grouping, singular, per group | not "N submissions" - a student count under a synonym (C-A) |
| the instruction | measured to change the outcome: `flat` 11520 refusals of 19935 versus `folder` 0 of 20000 after the fold | must not tell the reader to check a list the unattended callers never show |
| `No grades were produced.` | `result.run === null` | must not appear on any path that does grade (C-E) |

---

## 6. Sabotage protocol

Non-negotiable, and written so an implementer cannot substitute a description for
a result.

### 6.0 Mechanics

- **Back up by `cp` before mutating and restore by `cp`. NEVER
  `git checkout -- <path>`** - the file may be uncommitted and checkout reverts it
  to the index, destroying the chunk's work. One backup per file, named
  `<file>.a44sab.bak`, deleted only after the restore is verified by
  `diff --strip-trailing-cr <file> <file>.a44sab.bak` exiting 0, with the exit
  code read from the command.
- **AT THE END OF EVERY SABOTAGE CYCLE, verify LINE ENDINGS with a working
  instrument.** The restore is what breaks them. `grep -c $'\r'` **DOES NOT WORK
  HERE** - measured in 0.4, it reports 0 with exit 1 on a file holding three real
  CR bytes, and PowerShell's `Select-String` equivalent also reports 0. Use
  exactly one of: `tr -dc '\r' < <file> | wc -c`, a python byte read
  (`open(f,'rb').read().count(b'\r')`), or the PowerShell byte filter
  (`([IO.File]::ReadAllBytes(f) | Where-Object { $_ -eq 13 }).Count`). Report the
  number, not "clean". The index is LF; never normalise to CRLF.
- **A SABOTAGE THAT STAYS GREEN IS A FINDING TO TRACE, NOT A MUTATION TO SWAP
  OUT.** Three outcomes are legitimate: the test is weak (add the fixture named
  below), the mutant is equivalent (say so, as M-DECIDE-rebuilt is), or **THE
  PRODUCTION CODE ALREADY HAS A DEFECT that makes the mutation a no-op** - and the
  third is the one worth finding. A live tokenizer defect was found in this repo
  precisely by tracing a green sabotage instead of replacing it. Trace it before
  touching either side, and never add an assertion to kill a surviving mutant
  before the trace.
- **State for each member whether you EXPECTED it to discriminate.** A mutation
  red in both directions, or green in both, discriminates NOTHING and is worse
  than none because it reads as coverage. Section 3.3 is the worked example: one
  of my own instruments was red in both directions and was rebuilt.
- **VERBATIM output is required.** For each member, paste the vitest failure block
  INCLUDING the `expected` and `received` values and the test name. A sentence
  saying a test "went red" is not a result. Then paste the post-restore green line
  with its exit code read from the command, then the CR count.
- **Every anchored literal must be proven to occur EXACTLY ONCE in its file before
  it is used as an edit anchor, with the count printed:** `grep -c "<literal>"
  <file>` must print `1`. A measured counter-example: `lines.push(\`${drop.name}:
  ${errorMsg}\`)` occurs at BOTH `steps.grading-cartridge.ts:111` and `:238`, so
  it is NOT a usable anchor.
- **A mutation must not destroy the anchor the test searches for.** Before
  mutating a file any source-text test reads, check the mutation leaves that
  test's anchors resolvable - otherwise the test can go GREEN on the exact
  mutation it exists to catch.
- **No two agents may sabotage-verify on the tree at once.** Confirm no sibling is
  mid-sabotage before starting. `utils.ts` is read at 50+ sites; a mutation left in
  place is a repo-wide hazard, and a killed agent mid-sabotage has already left
  one here once.

### 6.0a Requirement to sabotage family map

| Requirement | Family and members | A member that discriminates NOTHING |
|---|---|---|
| R13 the KEY oracle | M-KEY a, b, c, d, e, f, g; M-ENCODE a, b, c | M-KEY h (deliberate) |
| R1 the frozen oracle | M-KEY a-g, M-DECIDE a-g, M-MERGE b, c | M-KEY h; M-MERGE a for the row count |
| R14 INVARIANT M | M-ENCODE a, b, c; M-KEY c | M-ENCODE d (see below) |
| R15 INVARIANT D | M-DISPLAY a, d | M-DISPLAY b (landed pins catch it) |
| R16 the walk order | M-DISPLAY c | - |
| R2 soundness | M-DECIDE c (the headline), M-KEY a, f; M-SWEEP a, b, c, d | M-DECIDE-rebuilt; M-DECIDE g (duplicate of c) |
| R3 the pass condition | M-DECIDE c, e, g; M-SWEEP b, c | - |
| R4 the false split | M-KEY a, g; M-SWEEP b, c | - |
| R5 emitted by the producer | M-WIRE a-e, g | - |
| R6 must not fire | M-WIRE f | - |
| R7' persistence | M-PERSIST a, b, c | M-PERSIST d (it mutates the TEST) |
| R17 the consumers | M-DISPLAY a | - |
| R8 the copy | M-COPY a-j | M-COPY i at vitest (tsc only) |
| R9 the repaired guard | M-DISPLAY a; M-MERGE b | - |
| R12 gates | the gates are their own instrument; M-COPY i is the tsc member | - |

### 6.1 Family M-ENCODE - the encoding's TOTALITY (new, and the highest value)

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | one length prefix on the directory, base key appended RAW | **R13 via K1 path 2**; R1 via K1 `rowsAfter` 3 -> 2; R14 on `flat-forgery`, 20000 | yes - measured |
| b | leave the DIR-LESS fallback key un-encoded | **R13 via K1 path 3**; R1 via K1 3 -> 2; R14 on `flat-forgery-perpart`, 20000 | yes - measured |
| c | encode at steps 5/6 only, leave steps 1-4 raw | **R13 via K1 path 4 ONLY, and R14 on `conv-forgery`** | **yes, and this is THE most important member in the document: the row count does NOT move, every display is byte-identical, and the whole existing 360-test suite passes it** |
| d | change the encoding's separator from `:` to `#` at all six sites | **NOTHING** | **NO - it is an equivalent relabelling of an injective encoding. Do not add an assertion. Recorded so nobody counts it** |

### 6.2 Family M-KEY - the identity key

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | never fold (bare key) | R1 via F3, F8, G1, G2, G3, G5, G8, G12, K2; R2's `folder` and `nested-bulk` zeros | yes, broadly - measured, `NOFOLD` fails F3, G1, G8, K2 |
| b | fold on EVERY file, dropping the stem-fallback condition | R1 via **G10 only** (`rowsAfter` 1 -> 2) | yes, and G10 is the ONLY killer - measured |
| c | replace the key with the directory path alone | R1 via **G11 and K4 only**; R14 on both | yes - measured, `FOLDERALONE` r1M on G11 and r2M on K4 |
| d | `dir + "::" + base` instead of the length-prefixed join | **R13 and R1 via G13 only** | yes, and G13 is the ONLY killer - measured |
| e | fold only the IMMEDIATE PARENT segment | **R1 via K2 only** (`rowsAfter` 4 -> 2, two students blended) | **yes, and K2 is the ONLY killer. This is the rule RULING 92's predecessor specified, and nothing in round 1's 23 fixtures caught it** |
| f | fold the OUTERMOST segment | R1 via G8, K2 | yes |
| g | fold the leaf STEM instead of the directory | R1 via F3, F4, F6, F8, G1, G3, G5, G8, G12 | yes, broadly |
| h | do not lowercase the directory path in the key | **NOTHING - deliberately.** RES-A44T-5 | **NO, and that is the finding: the correct verdict depends on an undecided question, so no fixture pins it** |

### 6.3 Family M-DISPLAY - RULE D and the terminal pass

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | remove the terminal pass entirely | **R15 via K3 and K4**; R17's three consumers; R14's `crossstep-ambiguity` invD 156 | yes - measured, and it is the state a key-only wave ships |
| b | apply no display fold at all (key folded, display bare) | R9's repaired `:373` for the added rows; R7's P4 | yes |
| c | walk the terminal pass in `Object.entries` order | **R16 on K3 and on `crossstep-ambiguity`; R15's frozen K4 display array** | **yes. On K3 - two files - R16 is the ONLY killer, measured: `ENTRIES` passes K3's rows, displays, keys and both invariants. On K4 the frozen display array catches it too. Both are required; see 3.3** |
| d | count occurrences of a base label instead of searching for an unclaimed suffix | **R15 via K4 ONLY** | **yes, and K4 is the ONLY killer. `NAIVE` fails exactly 1 of 27 fixtures and 0 of 17 sweep shapes - measured** |
| e | put the fold's segments in reverse order at step 6 (`<display>/<dir>`) | R1's frozen display arrays for F3, G1, G8, K2 | yes, and it is a SPELLING member: if RULE D's path order is ever re-decided, these literals are re-frozen in the same commit |

### 6.4 Family M-DECIDE - the refusal predicate

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | always ALLOW | R1 via F4, F6, F9, G4, G9, G12, K1; R2's first direction on `flat`, `shared-wrapper-folder` | yes |
| b | always REFUSE | R1 via F1, F2, F3, F5, F7, F8, F10, G1, G2, G3, G5, G7, G8, G10, G11, G13, K2, K3, K4; R2's second direction | yes |
| c | drop the run gate (RULING 85's literal amnesty) | R1 via **F6 and G4 only**; R2's `shared-wrapper-folder` zero goes to 11520 | yes, and this is THE most important member here - it is the mechanism RULING 87 replaced |
| d | grant amnesty on the run gate alone, dropping BOTH the shared-directory and the non-null conditions | R1 via **G12 only** | yes, and G12 is the ONLY killer |
| e | require 3 or more colliding paths | R1 via F4, F6, F9, G4, G9, G12 | yes |
| f | compare full BASE NAMES instead of keys | R1 via F3, F4, F6, F8, G1, G3, G4, G5, G8, G9 | yes, broadly |
| g | set the run gate at 1 or more distinct directories | R1 via F6 and G4 | **yes but a DUPLICATE of (c)** - for a set with no directory the amnesty already fails, so (c) and (g) are the same predicate. Recorded so nobody counts it as a second kill |
| h | count the folder as the IMMEDIATE PARENT segment rather than the container-relative path | **R2's `nested-shared-dropbox-subdirs` count only** (287 -> 277), and NOTHING on the eleven original shapes | **yes but ONLY on a two-deep shape, and this is the disproof's own instrument. On the eleven original shapes it discriminates nothing at all, measured: dFold = 0 on every one** |
| **REBUILT** | drop ONLY the one-shared-folder condition, keeping non-null | **nothing - EQUIVALENT under RULE K's key** (3.4) | **NO.** Not a coverage gap. Do not add an assertion to kill it |

### 6.5 Family M-WIRE - the refusal never reaches a surface

Mutate `src/app/actions/grading.ts` and/or `src/lib/grade/engine.ts` and/or
`src/lib/grade/extraction.ts`, whichever the wave wired.

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | delete the decision call from the default/gemini path | R5a | yes |
| b | delete it from the embedded path | R5b | yes |
| c | **route the refusal into `warnings` instead of `error` on the default path** | R5a directions 1-2 | yes - **the single most important member in this family**, because `grading.ts:905-920` returns no `warnings` field and a leaf-only unit test passes it |
| d | catch the refusal and continue grading | R5a direction 3 (`callLlm` receives the markers) | yes, and direction 3 is the ONLY one that catches it when the caught error is still returned |
| e | compute the decision and discard the result | R5a and R5b | yes |
| f | wire it into the `"single"` branch as well | R6 (i) | yes |
| g | in `steps.grading-run.ts`, drop `gradeResult.error` from the pushed line | R5c's grading-run literal | yes - and if it does not go red, R5c was scoped to the file rather than to the emitted line, which is the defect |

### 6.6 Family M-PERSIST - the saved edit

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | make the display fold COLLISION-TRIGGERED | **R7's P1'**, measured `edit survived = false` | yes - this is the control in 6.0's sense: it is what RULING 92 withdrew |
| b | add a legacy recovery that maps a pre-A44 display onto a folded one | **R7's P3'**, whose zero-recovery assertion goes to non-zero | yes - and it is the thing RULING 93 DELETED, so a re-appearance is a finding |
| c | key stored edits on the ROW INDEX | R7's **P5' only** | yes, and P5' is the ONLY killer |
| d | drop the display-unchanged precondition assertion from the test itself | **nothing** | **NO** - it mutates the TEST, not the implementation. Listed so nobody substitutes it: deleting an assertion proves only that the assertion runs |

### 6.7 Family M-MERGE - the collapse itself

Mutate `src/lib/grade/utils.ts`. These exist to prove R1's `rowsToday` column
measures the merge and not a proxy.

| # | Mutation | Expected effect | Discriminates? |
|---|---|---|---|
| a | delete `existing.files.push([filePath, content])` at `utils.ts:315` | `rowsToday` for F3 stays 1; `mergedFileCount` drops to 1 | **NO for the row count** - and saying so is the point: the count alone does not measure the merge, which is why R1 also carries `fbBlend` recovered by content MARKER |
| b | suffix the key at `:308` (`inferred.key + String(grouped.size)`) | F3's `rowsToday` 1 -> 3, and three rows share the display `essay` | yes, and it is the mutation that proves `:373` is falsifiable at all |
| c | key on `filePath` instead of `inferred.key` at `:305,308` | F3's `rowsToday` 1 -> 3, and several of `utils.test.ts`'s 28 A14 pins go red | yes, but NOISY - it breaks the A14 order too, so weaker evidence than (b) |

### 6.8 Family M-COPY - the sentence

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | report `Object.keys(submissions).length` where the colliding group's size belongs | R8's equality on R5a | yes |
| b | swap a noun: `files` -> `submissions`, or -> `students` | R8's equality | yes, and C-A is why the noun matters |
| c | append a clause the app does not act on (" - check your filenames") | R8's equality | yes, and **ONLY because the assertion is `toBe`**; under `toContain` it survives, which is the C-B proof |
| d | drop the word `folder` before the quoted directory | R8's equality, its C-D clause | yes - the A44 form of the "course name interpolated where it reads as a time" defect |
| e | emit the `no-folder-signal` sentence on a `flat-collision-in-foldered-run` set | R8's G12 literal | yes, and **G12 is the ONLY fixture that catches it**; a single-sentence refusal passes every other copy assertion |
| f | name only the first colliding group on the multi-group fixture | R8's multi-group literal | yes |
| g | change the sentence on the embedded branch only | R8 via R5b, because the SAME literal is asserted on both branches | yes - this is what stops two branches drifting into two sentences for one condition |
| h | emit the refusal through the unattended report line with the inner string truncated | R5c's three whole-line literals | yes, and only whole-line equality catches it |
| i | add a new refusal variant to the discriminated union with no sentence | **`npx tsc --noEmit --incremental false`, NOT vitest** | yes at tsc, **NO at vitest - state this explicitly**, because a green suite here proves nothing. This is the whole point of C-C's `default`-less switch |
| j | **print the directory's LAST SEGMENT where the container-relative PATH belongs** | **R8's two-segment fixture (G8's shape) ONLY** | **yes, and it is new: every round-1 copy fixture is one directory deep, so all of them pass this mutation** |

### 6.9 Family M-SWEEP - the sweep's own honesty

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | recover a row's files by NAME instead of by content marker | R2's zeros become meaningless - F3's three files are all named `essay.txt`, so ownership recovery silently returns one owner | yes - assert in the test that F3's three `submittedFiles` names are identical, so name-based recovery is provably impossible |
| b | change the seed | every frozen count moves | yes, and it is why the seed is a literal in the test, not an env var |
| c | reduce `SWEEP_N` without re-measuring | the frozen counts | yes - a stale count is a finding, not a tolerance |
| d | drop `shared-wrapper-folder`, or any ONE of the three forgery shapes, from the shape list | **nothing in the suite** | **NO, and that is the hazard**: the shape list is a hand-written array. Assert its LENGTH and its exact members as a frozen set - the `headless.test.ts` idiom - so removing a shape is a visible test change. Measured: each forgery shape is the ONLY generated instrument for its own partial encoding |
| e | change the generator's `rnd()` CALL ORDER without re-measuring | **nothing, and every frozen integer silently becomes wrong** | **NO at the suite level, and it is the reason 0.8a asks for the generator in `src/`.** Measured: my order and round 1's differ, and every sweep integer moves by up to 4% with no rule change at all |

---

## 7. What an implementer must not do

- **Do not import a helper from another `*.test.ts`.** It re-runs that file's
  `describe` blocks under the wrong setup. Duplicate the fixture table, or put the
  generator in a plain `.ts` leaf (0.8a).
- **Do not mock `fetch`.** Mock `callLlm` from `@/lib/llm`. `vitest.setup.ts`
  throws on any unmocked `fetch`, and that throw is load-bearing.
- **Do not loosen a structural gate to let a test import an internal.** If a gate
  blocks the import, drive the production path - `gradeAction` for the refusal,
  `step.run` for the unattended lines, `groupSubmissionsByStudent` for the
  grouping, and the three exported helpers directly for R17. All are drivable
  today with landed precedents, and the gate is usually telling you the test was
  reaching past the seam.
- **Do not assert a rate.** Assert the integers and their ordering.
- **Do not add an assertion to kill a surviving mutant before tracing why it
  survived.** Section 6.0's third rule.
- **Do not derive a key assertion from a display, or a display assertion from a
  key.** Section 3.1 measures an implementation that is correct on one and wrong
  on the other.
- **Do not write `/s` or `/gs` in a regex.** The dotAll flag passes vitest and
  fails `tsc` with TS1501.
- **Do not report "no CR" from `grep -c $'\r'` or `Select-String`.** Section 0.4.

---

## 8. Executable here versus argued

| Item | Status |
|---|---|
| The frozen oracle 1.3, all 27 fixtures, ten columns each, including the KEY column | **EXECUTED** over the real parser and the real grouping on both paths; import-only diffs in 0.1 |
| The transcription check against the frozen `rowsToday` column | **EXECUTED**, 0 mismatches of 27, after one fixture correction |
| The architecture's 10.2 dispositions, item by item | **EXECUTED and CONFIRMED**; two additions, no contradictions |
| The seventeen-shape sweep 1.4, seed 20260927 | **EXECUTED** |
| RULING 87's integer under all three predicate configurations on the same sets | **EXECUTED**: `dFold = dFull = 0` on all eleven original shapes; `dFull = 106` and `33` on the two-deep shapes |
| RULE K is strictly sounder than the immediate parent wherever they differ (12.4% -> 0%, 12.2% -> 1.4%, 2.0% -> 0%) | **EXECUTED** |
| The three forgeries, each defeating a different partiality | **EXECUTED**, and `INVARIANT M` fires 20000/20000 on each against its own bad rule |
| A partial encoding changes NO display and NO row count | **EXECUTED** |
| A naive counting terminal pass yields DUPLICATE displays on K4 | **EXECUTED** |
| The terminal pass's order dependence under `Object.entries`, and the REBUILD of that instrument | **EXECUTED**, 156 of 20000 against 0, after the first form measured 6483 against 6483 |
| Every mutant against all 27 fixtures including the frozen DISPLAY and KEY columns - which corrected one claim of my own | **EXECUTED**, `H11_EXITCODE=0`: PARTIAL fails 7 of 27, NAIVE 1, ENTRIES 1 |
| Every frozen DECISION value under RULE K's key and RULE K's folder | **EXECUTED**, `H12_EXITCODE=0`: 26 of 27 reproduce round 1's frozen column; the 27th was my own K1 value and the measurement replaced it |
| R7' P1'/P3'/P4/P5' against the REAL `seedEdits`/`mergeStoredRowEdit`/`loadPersistedEdits`, plus the collision-triggered CONTROL | **EXECUTED** |
| R17's `seedEdits`, `buildCsvContent`, `fanOutGradingPostResult`, including the failed-post-reported-as-posted inversion | **EXECUTED** |
| Satisfiability, 279/279, against a complete reference module | **EXECUTED** |
| Baseline 360 tests green with the defect live AND with zero key assertions | **EXECUTED**, exit code read from the command |
| `grep -c $'\r'` reports 0 with exit 1 on three real CR bytes; `Select-String` too | **EXECUTED** |
| `src/source-bytes.structure.test.ts` walks the whole repo root, not `src` only | **EXECUTED** (`ROOT = process.cwd()` at `:48`, `collect(ROOT)` at `:69`, plus a 235-file probe) |
| No test in the repository asserts a grade identity key; 11 assert the display under the same filter; 37 hits without the filter | **EXECUTED** grep with two canaries |
| No test reads `src/lib/grade/utils.ts` as source text, derived over all 210 source-text-reading test files | **EXECUTED** with a positive canary |
| Line counts, both counters, ten files | **EXECUTED** |
| The channel facts (`grading.ts:905-920`, `:921-924`, `llm-provider.ts:14,16-20`, `GradingTab.tsx:262-266`, the three `.error` reads) | **READ.** Round 1 opened every one; unchanged by this design and not re-opened this pass, which is stated rather than implied |
| `utils.test.ts:128-136`, `:192-197`, `:352-375` | **READ, re-opened this pass** |
| `grouping-zip-parents.wiring.test.ts:33-37`'s comment stripper is the UNANCHORED form | **READ, opened this pass** |
| **R5a, R5b, R5c, R6 - that driving the producer emits the refusal** | **ARGUED.** Not run: needs test files in `src/`, outside this pass's one-file write set. The argument rests on EXECUTED facts - `grading.budget.test.ts:88-94,105,129` already drives `gradeAction` with a real `FormData`; `extraction.test.ts:246-271` already drives a real nested JSZip; `steps.grading-cartridge.test.ts:133` already executes a step with `gradeAction` mocked. All three are inside the green suite. **The specific assertions have NOT been observed passing or failing** |
| **R8 - the copy** | **ARGUED.** The bindings table's "not available" rows are READ from `extraction.ts:83-85` and `:137`; none was executed, because `extraction.ts` cannot be imported under `node --experimental-strip-types` (it imports `jszip`, `../canvas`, `../office-extract` by extensionless specifier). RES-A44T-3 |
| **`correctUngradedSeeds`** | **ARGUED as a test, EXECUTED as a fact**: it is exported from a plain `.ts` file and keys on the display (`ungradedDisclosure.ts:191-193`), which I read; `ungradedDisclosure.ts` does not load under type stripping, so I did not drive it |
| **A41's pre-A44 refusal baseline for R3** | **NOT DERIVABLE HERE.** A41's decision leaf does not exist in `src/` (exit 1, with a canary) and its predicate is not reproduced in any input to this pass. R3 is therefore a within-run inequality, not a frozen pair |
| What an instructor SEES on screen, and all 34 `GradingResults.tsx` sites; whether `AlvarezMaria/essay` reads better than `essay (AlvarezMaria)`; whether a ` (2)` reads as a disambiguator; whether a four-segment path fits its cell | **NOT VERIFIABLE HERE.** vitest is node-env, `include: ["src/**/*.test.ts"]`; **no component is rendered by any test in this repository.** Every such claim in this document is a READING CLAIM. RES-A44T-4 |
| Whether real instructors' zips take any of these seventeen shapes at the measured frequencies | **NOT VERIFIABLE HERE.** Every rate is a property of the published generator, not of real uploads. RES-A44T-2 |
| Whether any model call ever populates `inferredLookup` in production | **NOT VERIFIABLE HERE.** No API keys; `vitest.setup.ts` throws on real `fetch`. Every instrument assumes the degraded empty-lookup case |

---

## 9. What I could not determine

- **Whether the directory path should be lowercased in the key.** Measured
  symmetric by round 1 and unchanged in kind by RULE K. No fixture pins it and
  mutant M-KEY h therefore survives deliberately. RES-A44T-5.
- **A41's pre-A44 refusal count on `folder-resubmit`.** Its predicate is not in
  the tree and not reproduced in any artifact handed to this pass. R3 is written
  so that this does not block it.
- **Whether round 1's exact integers are recoverable.** They are not, from the
  published spec, and 0.8c is the closest calibration available (within about
  0.5% on five of six A41 columns). This is the measured case for 0.8a rather
  than a gap I can close.
- **Where the decision should live** - in the lib (`gradeSubmissions` /
  `extractStudentEntries`) or in `gradeAction`. R5a/R5b are written to be
  indifferent: both drive `gradeAction` and assert the RETURNED value. If the
  architect places it in the lib, `engine.ts:443`'s existing throw is the
  precedent and its message reaches `state.error` verbatim.
- **Whether the refusal fires before or after the model call.** `engine.ts:431`
  calls `inferFileNameConvention` BEFORE `groupSubmissionsByStudent` at `:432`, so
  a refusal computed after grouping has already spent one model call on the
  default path. No requirement here depends on the answer, but "zero model spend
  on a refused zip" is a claim `:431` falsifies.
- **Whether a real submissions zip ever produces two students under one directory
  path.** The A14 file-name version is pinned as current behaviour at
  `utils.test.ts:325-334`, so the CLASS is real in this tree; the frequency is not
  measurable here, and it is the load-bearing input to RES-A44T-8's fork.
- **Whether any shape exists in which two students' full container-relative paths
  are identical and only something ABOVE the container distinguishes them.** The
  architecture constructed none and neither did I; RULE K would have nothing left
  to use. Not proved impossible, not claimed impossible.

---

## 10. Residual register

Each names an owner, an instrument, an object with a direction of failure, and a
step. An entry missing any of those is a DELETION, and I call it that. **A
residual that is not in `docs/BACKLOG.md` does not exist**, so all ten are written
to be filed there by the orchestrator; this pass did not touch `docs/BACKLOG.md`
or `docs/backlog.yml`.

| id | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| RES-A44T-1 | F1 survives: the A14 sanitized-name collision is a real cross-student collapse this branch ALLOWS by design, because it resolves at step 2 where no version of A44's fold reaches. K1's two per-part forgers are the same class one level along, and their pre-existing merge is frozen into K1's `rowsAfter` of 3. | the chunk whose write set includes `src/lib/grade/utils.ts:87-119`, or a new backlog row | F1 and K1, asserted ALLOW and 3 rows in R1 | F1's verdict and K1's row count. **RED if a later change makes F1 REFUSE without a decision to widen A44's scope**, and equally a finding if A44 is closed while claiming it closed every cross-student collapse. | At the push that reconciles A44. |
| RES-A44T-2 | Every rate in 1.4 is a property of the published generator, not of real uploads. | the repo owner | **none available in this checkout** - no live uploads, no analytics, no network under vitest | real-world shape frequency. **This entry has an owner and a step but NO instrument, so it is a DELETION, not a residual, and I am calling it that.** What is deleted is any claim that the measured rates are probabilities. | Owner-only backlog escalation; not an agent task. |
| RES-A44T-3 | The copy constraint "no quantity equals the zip's entry count" is READ, not executed: `extraction.ts` cannot be imported under `node --experimental-strip-types`. | the wave whose write set includes `src/lib/grade/extraction.test.ts` | an assertion over `extractSubmissions` on a real zip holding one unsupported extension and one unreadable `.docx`: compare `Object.keys(submissions).length`, `attemptedSupportedFiles` and `failedSupportedFiles.length` against the archive's entry count | the three numbers against the entry count. **RED if any equals the entry count**, which would mean R8's binding table is wrong and the sentence may name a total. | The wave that writes the refusal copy, before the string is frozen. |
| RES-A44T-4 | All 34 `GradingResults.tsx` display-keyed sites, the bulk post fan-out (`:332-395`), the single-row post path (`:427-500`), and whether a four-segment display like `Submissions/AlvarezMaria/docs/r` or a ` (2)` suffix renders legibly, are READING CLAIMS. | the repo owner (browser check) - this environment renders no component | upload a folder-shaped zip with the fix live; inspect the table; edit one row's grade; post one row to Canvas | what is on screen and what Canvas receives. **FAILS if editing one row affects another, if fewer than the expected rows appear, if two rows' post statuses collide, or if a two-plus-segment label overflows its cell.** | Owner verification, after the display-fold wave lands. Blocks nothing. |
| RES-A44T-5 | Whether the container-relative path is lowercased in the key is undecided and measured symmetric, so no fixture pins it and mutant M-KEY h survives deliberately. | the architect pass, or the orchestrator by ruling | the two frozen case-variant pairs in round 1's section 3 item 4, re-run against whichever reading is chosen | the chosen reading's row/blend/split triple. **RED if A44 ships with neither reading pinned by a fixture** - an unpinned case-folding choice is a licence to change it silently, and it changes who shares a graded row. | Before the key-fold wave. |
| RES-A44T-7 | The 30-site display-keyed census both early artifacts relied on is short by 13; the corrected count is 43. This pass did not re-derive it and does not need to: RULE D changes zero of them. | the wave plan and architect passes | the construction-based grep in `docs/a44-waves.md` section 9, with its canary | the site set. **RED if any artifact downstream still says 30.** | Before the storage wave's write set is fixed. |
| **RES-A44T-8** | RULING 87's refined amnesty is UNSOUND at **2254 of 19936 (11.3%)** on `mixed-perstudent-plus-shared-dropbox` and **287 of 19990 (1.4%)** on `nested-shared-dropbox-subdirs`, under RULE K, and the one alternative the iteration cap allowed (round 1's corroboration variant) fixes soundness while FAILING R3. Two attempts on this class; a third is forbidden. | the orchestrator, by decision - **this is a product fork, not a defect an implementer can fix** | the two exact frozen integers in R2's fourth direction, which put the accepted unsoundness in the suite rather than in a document | the unsound counts. **RED on any change in either direction without a re-freeze in the same commit.** | The ruling that accepts or rejects the 11.3%, and R2's assertion thereafter. |
| **RES-A44T-9** | L1's false-split rate - `single-student-multi-folder-shared-filename` **19382 of 19858 (97.6%)**, with **100% of it unrefused**, and K2 showing TWO students split at depth - is accepted by RULING 95's criterion (visible split over invisible blend), and no instrument enforces the criterion. | the orchestrator | R4's frozen `splitBefore`/`splitAfter`/`splitUnrefused` absolutes and K2's frozen SPLIT of 2, each quoted with the command | the reported split rate. **RED if a later artifact reports it as a defect to be fixed rather than as RULING 95's accepted cost, and equally if a later change lowers it by reverting the step-5 fold**, which re-opens G1's three-student blend. | Each wave's push, and the test-notes consumer. |
| **RES-A44T-10** | **L2: a terminal-pass ` (n)` suffix is RUN-DEPENDENT**, so an edit saved against it is lost when the batch composition changes. Executed: `["JaneDoe/src/deep","JaneDoe/src/deep (2)"]` becomes `["JaneDoe/src/deep"]` when the other file is removed, and **rows recovering that edit = 0**. | the orchestrator, as an accepted cost; the UX pass for its visibility | the L2 block in R7's harness: the same set run twice with one file removed, comparing `loadPersistedEdits` survival | the recovered edit count. **RED if any artifact asserts display stability without EXCLUDING disambiguated rows.** Measured to affect **156 of 20000** sets on `crossstep-ambiguity` and 0 on every other shape, so it is rare, not absent. | The ruling that accepts L2, and the UX pass. |
| **RES-A44T-11** | **The generator is not in the tree, so every frozen integer in 1.4 is uncheckable by anyone but its author.** Measured: round 1's integers are not reproducible from its published spec, and mine differ by up to 4% with no rule change. | the orchestrator, to rule; the wave that lands `src/lib/grade/submissionShapeGenerator.ts` | the generator itself, as a plain non-test `.ts` leaf importing NOTHING, plus a re-run of R2's and R4's frozen counts in the same commit | the frozen integers against a re-run. **RED if Wave 2 is dispatched while its predicate's oracle is an integer no one in the repository can reproduce.** Section 0.8a. | **Before Wave 2 is dispatched**, not at its gate - a gate cannot see this. |

**RES-A44T-6 is WITHDRAWN, not silently dropped.** It assigned the two
near-ceiling files' ceiling risk to "the wave whose write set includes either
file"; the architecture measures that this design requires no edit to either, and
RULING 93 needs no code, so the residual has nothing left to trigger on. The
enforcer it was protecting was the 1000-line ceiling test, which is landed and
unchanged. The measurements are in 0.6.

---

## 11. Corrections to the inputs, measured

Each stated with its command, not as an opinion. Six, of which two correct both
siblings at once.

1. **`src/source-bytes.structure.test.ts` does NOT walk `src` only.** Both
   `docs/a44-architecture.md` (section 14) and `docs/a44-waves.md` (15.3) say it
   does, and both conclude that a `docs/` file needs a hand-rolled byte scan.
   Measured: `ROOT = process.cwd()` at `:48`, `collect(ROOT)` at `:69`, `.md` in
   `TEXT_EXTENSIONS` at `:50`, and a probe reproducing that walk reaches **235
   `.md` files including `docs/a44-architecture.md`**. The committed gate already
   covers all three A44 documents. `src/file-size-ceiling.structure.test.ts:115`
   is the one that walks `src` only.
2. **The eleven-shape sweep could never have detected the folder-definition flip,
   and neither sibling says why.** Every one of the eleven shapes is exactly one
   directory deep, so `dFold = 0` and `dFull = 0` on all eleven - measured. The
   architecture's D11 reasoning is CORRECT within that list; the wave plan's
   counterexample is correct and lies OUTSIDE it. Neither document is wrong; the
   INSTRUMENT was, and 1.4 fixes it with two two-deep shapes.
3. **The architecture's 4.4 forgery is one of THREE, and the one it exhibits is
   not the dangerous one.** Section 3.2. The forgery that changes no row count and
   no display goes through the CONVENTION branch, which 4.4 does not reach. The
   conclusion - encode totally - is unaffected; the TEST written from it would
   have shipped two partialities open.
4. **The 43-site census is not re-derived here and does not need to be.** Round 1
   corrected 30 to 43; RULE D changes zero of them, and the ground is INVARIANT D
   with an enforcer plus RULING 93. I re-derived only the part my instruments
   touch: the three executable members, driven in R17. Stated so nobody reads the
   absence of a fresh census as agreement with 30.
5. **Round 1's R10 was wrong that the display fold must be SET-LEVEL**, and wrong
   for a specific reason worth recording: it read `utils.test.ts:128-136` as pins
   forbidding a per-path fold. They are not pins on the design; they are two
   assertions that legitimately CHANGE, and reading a landed test as a design
   constraint is how a test starts dictating architecture.
6. **Round 1's `src/otherfile.py` correction still stands and is re-measured.**
   `docs/a44-scope.md` 2.2 says that path has a single component and no folder
   segment. Measured: `a44ContainerRelativeDir("src/otherfile.py", [])` is `"src"`,
   the fold DOES apply, the key becomes `3:src9:otherfile` and the display becomes
   `src/otherfile`. `utils.test.ts:373` still passes at 4 of 4.

---

## 12. What these instruments REQUIRE of the wave plan

Stated as requirements on the plan, not as a plan. This document writes no wave,
no write set and no gate ordering.

1. **A plain non-test `.ts` leaf for the generator**, importing nothing, or an
   explicit ruling that there will not be one plus the re-measurement obligation
   in 0.8a. Two test files need it and cross-test-file imports are forbidden.
   RES-A44T-11 carries it, and it must be settled **before** Wave 2, because a
   predicate frozen against an unreproducible integer is the sharpest silent green
   in this item.
2. **R13, R14, R15 and R16 must all land in the SAME wave as the fold**, because
   each is the only instrument for one passing-but-wrong implementation of it
   (section 3.1), and a fold landing without R16 in particular ships a
   storage-label assignment that depends on zip entry order with every gate green.
3. **The wave that adds `reachedStemFallback` must contain its caller.** I used it
   as the fallback-population discriminator in both R2 and R14; if it lands
   without a reader it is a dead field, which is the same class as a dead export.
   `docs/a44-waves.md` 3.3 already derives that this puts it in Wave 2.
4. **The wave that lands the fold must NOT add any import to `utils.ts`.** RULE K
   needs none - the helpers use only `getBaseFileName`, already in the file - and
   any new import moves
   `src/lib/module-graph/runtime-import-graph.test.ts:653-663`'s frozen nine-trail
   deep-equal.
5. **R17's three consumers are test-only edits** in
   `src/app/components/grading-results/`; no production line there changes. If the
   plan's write set does not carry them, the most damaging consequence of a display
   collision - a failed Canvas post reported as `"posted"` - ships untested.
6. **Every gate naming two or more test files is
   `npm run test:paths -- <p1> <p2> ...`.** A raw multi-path `vitest`/`npm test`
   silently drops any argument it does not match and exits 0.
7. **`utils.test.ts:128`, `:133` and `:366` change, and so do the two `it()`
   descriptions.** A wave that changes the expectations and leaves the
   descriptions saying "matches today's exact leaf-stem output" ships a stale
   comment of exactly the class `docs/a44-waves.md` 12.3 catalogues.

---

## 13. Gate run and tree state for this pass

```
$ npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts \
    src/file-size-ceiling.structure.test.ts src/loop-docs.structure.test.ts
GATE_EXITCODE=0
COVERED src/lib/no-emojis.test.ts                  files=1 passed=18
COVERED src/source-bytes.structure.test.ts         files=1 passed=3
COVERED src/file-size-ceiling.structure.test.ts    files=1 passed=3
COVERED src/loop-docs.structure.test.ts            files=1 passed=30
Test Files  4 passed (4) / Tests  54 passed (54)
```

`src/lib/no-emojis.test.ts:254` walks `["src","docs"]` and
`src/source-bytes.structure.test.ts` walks the whole repository root (section
0.5), so **both** cover this document - which is why no hand-rolled emoji or byte
scan appears anywhere in this pass. `src/file-size-ceiling.structure.test.ts:115`
walks `src` only, which is why a long document is green under it; that is not a
licence for a 1011-line module.

`npx tsc --noEmit` was deliberately NOT run: this pass wrote no TypeScript into
the tree, `docs/loop/this-repo.md` reserves that command to exactly one caller
because it races on `tsconfig.tsbuildinfo`, and no exclusivity could be
established.

**No in-tree scratch directory was created. Verified rather than asserted, exit
codes read from the command, and `find` was not used because it exits 0 on no
match:**

```
$ for d in .a44r2 .a44tn .a44plan .a44arch scratchpad a44-scratch g h; do ls -d "$d"; done
.a44r2 exit=2   .a44tn exit=2   .a44plan exit=2   .a44arch exit=2
scratchpad exit=2   a44-scratch exit=2   g exit=2   h exit=2
$ ls -d docs
docs  exit=0        (CANARY: the same command CAN find a present directory)
```

The whole harness - `copy.py`, `mkvariants.py`, twelve variant modules,
`fixtures.mts`, `attack.mts`, `attack2.mts`, `sweep.mts`, `sweep2.mts`,
`order.mts`, `persist.mts`, `consumers.mts`, `score.mts`, `probe.mjs` - lived in
the session scratchpad OUTSIDE the repository. Every harness exit code was read
from the command on the following line: `H1_EXITCODE=0` (fixtures),
`H2_EXITCODE=0` (attack), `H3_EXITCODE=0` (forgery family and the oracle grid),
`H5/H6_EXITCODE=0` (the sweep), `H7_EXITCODE=0` (the rebuilt order instrument),
`H8_EXITCODE=0` (persistence), `H9_EXITCODE=0` (consumers), `H10_EXITCODE=0`
(satisfiability).

**`git status --short`, read at the start of this pass:**

```
 M docs/css-orphans.md
```

`docs/css-orphans.md` belongs to another row, was already modified before this
pass began, and was not touched here. **Nothing under `src/` was written, staged
or reverted. No `git stash`, no `git add -A`, no `git checkout --` was run at any
point, and `docs/backlog.yml` was neither read nor written.** The reading taken
after this file's last edit is pasted at the end of the hand-off report.

**Stopping point.** This is round 2 of at most two for this activity, per
`AGENTS.md`'s "Two rounds, then ask" and `docs/loop/iteration-caps.md` cap 2.
Everything above ships as it stands. Two things are NOT arguments and are not
capped: RES-A44T-11, which is a step that MEASURES, and RES-A44T-8, which is a
product decision the orchestrator owns and which no revision of this document can
settle. Nothing here blocks Wave 1: R13, R14, R15, R16, R1, R4, R7', R9, R12 and
R17 are all buildable from this document as written, and the reference
implementation scoring 279/279 is the proof that they are jointly satisfiable.
