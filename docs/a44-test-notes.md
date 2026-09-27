# A44 test notes: instruments, frozen oracles and the sabotage protocol

Seat: `loop-test-author`. Written 2026-09-27. Write set for this pass is exactly
this one file; `git status --short` is in section 12.

This document decides WHAT IS MEASURED and HOW IT FAILS for backlog row A44
(`docs/BACKLOG.md:118` - re-measured this pass, `grep -a -n "A44" docs/BACKLOG.md`
returns `118`, not the `:117` both prior artifacts cite). It does NOT decide the
wave order, the write sets, or the wave count - a separate seat owns
`docs/a44-waves.md` and was live during this pass. Nothing here may be read as a
wave plan.

**Branch this is written against: RULING 87, which I do not re-open.** A44 folds
the immediate folder segment into the existing fallback key as an ADDITIONAL
discriminator (never replacing it), and A44 owns the refusal decision, whose
folder-based amnesty is granted only when the same run's fallback-reaching
population shows 2 or more DISTINCT folder segments. A41's frozen fixture F6
(`docs/a41-test-notes.md:218`, opened this pass) stays REFUSE in isolation. The
false-split regression is accepted explicitly. Every instrument below is written
against that mechanism.

**What I reuse rather than reinvent.** `docs/a41-test-notes.md` section 1.3's
published generator (re-implemented from its spec and calibrated in 0.4 below),
its ground-truth-not-`rows < files` discipline, its F1-F10 fixture ids and their
frozen verdicts, its `error`-channel reachability argument, and its sabotage
mechanics. Where I extend it, I say so.

**Inputs used as facts, each re-measured here:** `docs/a44-scope.md` (commit
`bd7bca0`) sections 0, 2.2, 2.3, 3.3, 4.2, 6; `docs/a44-check.md` (commit
`e8faea4`) B1, B3, B4, B5, M1, M4, and its published appendix harness.
Section 11 records the three places my measurements contradict those documents.

---

## 0. How every number in this document was produced

### 0.1 Executing the REAL modules, import-only diffs recorded in full

No production or test file was mutated. Four real files were copied into the
session scratchpad (OUTSIDE the repository tree, so nothing had to be cleaned up
inside it - see 0.6) and driven with `node --experimental-strip-types`
(`node --version` -> `v22.14.0`). The copies differ from the tree only in import
specifiers, and the diffs are recorded rather than described:

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
utils diff exit=1
$ diff --strip-trailing-cr src/lib/grade/types.ts <S>/g/types.ts
1c1
< import type { CodeRunResult } from "../code-runner";
---
> import type { CodeRunResult } from "./code-runner-stub.ts";
types diff exit=1
$ diff --strip-trailing-cr src/lib/grade/constants.ts <S>/g/constants.ts
constants diff exit=0
$ diff --strip-trailing-cr src/app/components/grading-results/gradingResultsHelpers.ts <S>/g/grh.ts
50c50
< import type { GradeActionState } from "../../actions";
---
> import type { GradeActionState } from "./stub-actions.ts";
grh diff exit=1
```

`code-runner-stub.ts` and `stub-actions.ts` are type-only stand-ins for
type-only imports; both changed specifiers are erased before execution. **No
executable line of `parseSubmissionFileName`, `leafStemFallback`,
`matchStudentFileConvention`, `getBaseFileName`, `groupSubmissionsByStudent`,
`seedEdits`, `mergeStoredRowEdit` or `loadPersistedEdits` differs from the
tree.** `gradingResultsHelpers.ts` has exactly ONE import
(`grep -n 'from "' src/app/components/grading-results/gradingResultsHelpers.ts`
returns one line, `:50`), which is what makes it importable at all.

**CANARY for the diff instrument:** `constants.ts` is byte-identical and exits 0
while the other three exit 1, so exit-1 reports a real difference rather than
always firing.

### 0.2 Two reimplementations, both disclosed, both controlled

**(a) A step classifier.** `parseSubmissionFileName` does not expose which of
its six steps produced an identity, and A44's fold condition is "resolved via
step 5 OR step 6". `matchStudentFileConvention` (`utils.ts:87-107`) is copied
VERBATIM into the harness and cited, never invented, and used ONLY to classify.
Every identity value itself comes from the real `parseSubmissionFileName`.

**(b) A grouping reimplementation, with a calibration control.** The real
`groupSubmissionsByStudent` takes no alternative keyer, so the post-fold state
cannot be produced by calling it. `utils.ts:301-316`'s Map-per-key logic
(first writer wins the display, then `entries.sort` by display at `:319`) is
reimplemented so a different keyer can be driven. **The control: driven with
TODAY's keyer it must reproduce the real function's row count and display list
exactly.** Measured over all 24 frozen fixtures of 1.4:

```
=== CALIBRATION CONTROL: groupMine(todayKey) vs the REAL groupSubmissionsByStudent ===
  calibration mismatches = 0 of 19      (first run, fixtures F1-F10 and G1-G9)
  calibration mismatches = 0 of 24      (after the five fixtures section 3 forced,
                                         G10-G14; G14 is withdrawn from the frozen
                                         table, so 23 CAL-<id> assertions carry
                                         forward into the score of section 4)
```

The control is asserted per fixture, not once in aggregate, so a single
divergence fails by name.

### 0.3 Exit codes, line counts, absence claims

- **Exit codes** were read from the command, never through a pipe. The suite
  baseline was run in PowerShell and its code read from `$LASTEXITCODE`.
- **Line counts** by `wc -l` from Bash, cross-checked with
  `@(Get-Content <file>).Count` in PowerShell where cited.
  `Measure-Object -Line` was not used.
- **Every absence claim below is paired with a canary using the SAME pattern AND
  the SAME filter chain against something present**, and the canary's own count
  is printed. The filter chain is checked separately where it could be the thing
  producing the absence.

| Absence claimed | Instrument and result | Positive canary, same pattern AND same filter |
|---|---|---|
| No workflow caller reads `warnings` | `grep -c "warnings" src/lib/workflows/registry/steps.grading-{cartridge,run,draft-flow}.ts` -> `0`, `0`, `0` | same command for `\.error` -> `6`, `18`, `16` |
| The identity KEY never reaches the results/persistence layer | `grep -rn "studentKey" src/app/components/GradingResults.tsx src/app/components/grading-results/` exits **1** | same command for `result.student` exits 0 and names 4 files |
| No `GradeResult` field carries an identity key | `grep -n "Key\b\|identityKey\|rowKey" src/lib/grade/types.ts` prints no key-bearing field on `GradeResultBase` | `grep -n "^  student: string;"` -> `:213`, `:394` |
| A41's decision leaf does not exist | `grep -rln "resolve to the same student" src/` exits 1 | `grep -rln "leafStemFallback" src/` exits 0 |
| My own census regex finds nothing spurious | `grep -rnE "\[[A-Za-z_][A-Za-z0-9_.]*\.studentZZZ\]" src ... \| grep -v "\.test\." \| grep -vE ":[0-9]+: *(//\|\*\|/\*)"` exits 1 | the same chain without `ZZZ` returns 49 lines, and the `.test.` filter itself removes 8 real lines, so the filter provably fires |

### 0.4 The generator, republished inline, and its calibration

`docs/a41-test-notes.md` 1.3's generator, re-implemented from its spec (the
`rnd()` call ORDER inside a set is not fully published there, so this is a
faithful re-implementation, not a bit-for-bit replay - its absolute counts are
its own). Published in full so no figure below depends on this document:

```ts
const STUDENTS = ["AlvarezMaria","BrownTom","ChenLi","DavisAnn","EvansJo","FordKim",
  "GarciaLuz","HallSam","IvanovNik","JonesPat","KimDae","LopezAna","MurphyDev",
  "NguyenAn","OkaforChi"];
const STEMS = ["essay","Essay Final","Essay Draft","Homework Final","Homework Draft",
  "homework","reflection","Reflection Final","report","Report Draft","paper",
  "Paper Final","lab","Lab Report","midterm"];
const EXTS = ["docx","txt","pdf","md"];
const COMPONENTS = ["backend","frontend","docs","src","tests","api","web","lib"];
const SEED = 20260927;
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// per set: size = 2 + floor(rnd()*5); students drawn WITHOUT replacement from a
// per-set pool; stem, ext, component each drawn independently; a "-resubmit"
// shape reuses the previous file's owner with probability 0.5; duplicate paths
// are dropped and sets left with fewer than 2 distinct paths are skipped.
// content marker per file: "MARKER-<setIndex>-<fileIndex> <trueStudent>"
// path shapes:
//   flat                   = <stem>.<ext>
//   folder[-resubmit]      = <student>/<stem>.<ext>
//   convention[-resubmit]  = <student-lowercased>_2026-09-0<n>_120<i>00_<stem>.<ext>
//   folder-distinct-stems  = <student>/<student>-work.<ext>
//   shared-wrapper-folder  = Submissions/<stem>.<ext>
//   single-student-multi-folder-shared-filename = <component>/config.<ext>
//   nested-bulk-perstudent-folders = bulk.zip/<student>/<stem>.<ext>, with
//                            zipParents[path] = ["bulk.zip"]          [NEW]
//   mixed-perstudent-plus-shared-dropbox = (i<2 ? "Shared" : <student>)
//                            + "/" + <stem>.<ext>                     [NEW]
//   duplicate-folder-name  = (i<2 ? "JohnSmith" : <student>) + "/" + <stem>.<ext>  [NEW]
```

**Calibration against A41's own published baseline** (`docs/a41-test-notes.md`
1.5, opened this pass), stated rather than assumed:

| shape | A41 published sets / harm / refusals / conservative | mine | agreement |
|---|---|---|---|
| `flat` | 19938 / 11472 | 19926 / 11550 | within 0.7% |
| `folder` | 20000 / 12304 | 20000 / 12421 | within 1.0% |
| `convention` | 20000 / 0 | 20000 / 0 | exact |
| `convention-resubmit` | 20000 / 0 | 20000 / 0 | exact |
| `folder-distinct-stems` | 20000 / 0 | 20000 / 0 | exact |
| `folder-resubmit` | 19975 / 9209 / 12110 / **2901 = 14.5%** | 19963 / 9239 / - / **2891 = 14.5%** | within 0.4%, and **14.5% reproduces exactly as a percentage** |

The instrument is therefore calibrated against the very number the row exists to
move. The check's own re-implementation (`docs/a44-check.md` appendix) is a third
independent one and agrees with both.

### 0.5 What the harness produced, in one place

Five scripts, all in the scratchpad, all exit 0: `fixtures.mts` (the frozen
oracle table), `sweep.mts` (eleven shapes), `persist.mts` (the real
seed/merge/load functions over two runs), `attack.mts` (my own attacks on these
instruments), `mutants.mts` (mutant discrimination against the reference), and
`score.mts` (satisfiability). Each is quoted where its output is used.

### 0.6 Scratch cleanup

The harness lived at
`<scratchpad>/a44tn/` - the session scratchpad, OUTSIDE the repository - so no
scratch directory was created inside the tree at any point. `git status --short`
in section 12 is the evidence; the one untracked directory it shows,
`.a44plan/`, belongs to the live sibling authoring `docs/a44-waves.md` and was
neither created nor touched by this pass.

### 0.7 File sizes, measured this pass

| File | `wc -l` | `@(Get-Content).Count` |
|---|---|---|
| `src/lib/grade/utils.ts` | 393 | - |
| `src/lib/grade/utils.test.ts` | 390 | - |
| `src/lib/grade/extraction.ts` | 300 | - |
| `src/lib/grade/engine.ts` | 517 | - |
| `src/app/actions/grading.ts` | 941 | - |
| `src/app/components/GradingResults.tsx` | 906 | - |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | 728 | - |
| `src/app/components/grading-results/ungradedDisclosure.ts` | 196 | - |
| `src/app/actions/grading.budget.test.ts` | 202 (`wc -l`, read this pass) | - |
| `src/lib/workflows/registry/steps.grading-cartridge.test.ts` | 146 | - |
| `src/lib/workflows/registry/steps.grading-run.test.ts` | 200 | - |
| `src/lib/workflows/registry/steps.grading-draft-flow.test.ts` | 147 | - |

`src/file-size-ceiling.structure.test.ts:41` is `const LIMIT = 1000`, read by
`sed -n '41p'`. `grading.ts` has **59 lines** of headroom; `GradingResults.tsx`
has **94**. Both are measurements for whoever plans the waves, not requirements
of mine.

### 0.8 Baseline: the defect is fully live and the suite is green

```
> npm run test:paths -- src/lib/grade/utils.test.ts src/lib/grade/extraction.test.ts
    src/lib/grade/single-file-entry.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts
 Test Files  4 passed (4)
      Tests  59 passed (59)
COVERED src/lib/grade/utils.test.ts files=1 passed=28
COVERED src/lib/grade/extraction.test.ts files=1 passed=9
COVERED src/lib/grade/single-file-entry.test.ts files=1 passed=15
COVERED src/lib/grade/grouping-zip-parents.wiring.test.ts files=1 passed=7
TESTPATHS_EXITCODE=0
```

**59 tests green with three students collapsing into one graded row.** That is
the baseline every red/green claim below is measured against. Any instrument in
this document that names two or more test files is written as
`npm run test:paths -- <p1> <p2> ...`; a raw `vitest run a b` silently drops any
argument it does not match and exits 0, and must not be used.

---

## 1. The ground-truth oracle

### 1.1 `rows < files` is forbidden, and so is its A44-shaped successor

A41 1.1 already disproved `rows < files` (it fires on 80.5% of sets containing
zero harm, because a student's resubmission is a REQUIRED merge pinned at
`src/lib/grade/utils.test.ts:336-351`). A44 adds a second forbidden metric that
looks new and is the same class:

> **FORBIDDEN: "a student's files occupy more rows after than before."** This is
> a comparison between two implementations of the parser. `docs/loop/traps-tests.md`
> records the executed failure: consolidating two implementations turns the test
> that compared them into a tautology. Worse, it is measurably wrong about
> attribution. Measured on `folder-resubmit`:
>
> ```
> shape             sets   splitBefore    splitAfter     splitIntroduced
> folder-resubmit  19963  14817(74.2%)   14817(74.2%)     0(0.0%)
> ```
>
> **74.2% of that shape already has a student spread across two rows TODAY** -
> one student's `Homework Draft.docx` and `Paper Final.pdf` key to `homework`
> and `paper` and always have. An oracle that reports the AFTER number alone
> blames A44 for a pre-existing 74.2%; an oracle that reports only the delta is
> an implementation-to-implementation comparison.

**The resolution used throughout: both counts are frozen as INDEPENDENT ABSOLUTE
LITERALS.** `splitBefore` and `splitAfter` are each asserted against a frozen
integer produced from declared ground truth. The delta is a diagnostic in prose,
never an assertion.

### 1.2 Ground truth, and the three outcomes it distinguishes

A file's TRUE student is not derivable from a flat zip - that is the defect. So
ground truth exists only in a fixture the test author DECLARES, plus a seeded
generator whose per-file owner is known by construction. Files are recovered from
a row by searching `row.content` for each file's unique content marker, never by
name: the headline case has three files with byte-identical names (measured in
1.5).

**Definitions, used verbatim below. Each is computed from the declared owner map
alone - no reference to any implementation of the parser, current or future.**

1. **BLEND (a true cross-student collapse).** A returned row whose files were
   declared to belong to more than one student.
2. **MERGE (a legitimate same-student merge).** A declared student with 2 or
   more files whose files all landed in exactly ONE row. This is the outcome
   `utils.test.ts:336-351` requires and `rows < files` cannot tell from (1).
3. **SPLIT (a false split).** A declared student whose files landed in 2 or more
   distinct rows.

A perfect run has zero BLEND and zero SPLIT. The three are independent: G3 below
has SPLIT with no BLEND, G4 has BLEND with no SPLIT, F2 has MERGE with neither,
and G5 has BLEND in one row while another student is correctly separated.

### 1.3 The soundness subspace, and the mutant I had to rebuild to get it right

My first soundness definition was "a set is UNSOUND when a BLEND survives and
the run is not refused". **Executed, it went RED on F1** - the A14
sanitized-name collision, which is a genuine two-student BLEND on the CONVENTION
branch (step 2) that A41's row explicitly excludes and
`utils.test.ts:326-334` pins as current behaviour. A requirement that forces A44
to fix A14's known-open item is a bad instrument, not a kill I was owed.

**Rebuilt, not strengthened.** The soundness claim is scoped to the FALLBACK
subspace:

> **FALLBACK-CAUSED BLEND:** a returned row in which the files that resolved via
> a stem fallback (step 5 or step 6) were declared to belong to more than one
> student.

F1's two files resolve at step 2 (measured: `step=2 fb=false` for both), so F1
carries no fallback-caused blend and is correctly ALLOW. This is
`docs/loop/traps-spec.md`'s "pass condition narrower than the defect" trap, and
the resolution is not to narrow quietly: F1's survival is residual RES-A44T-1.

### 1.4 THE FROZEN LITERAL ORACLE

Every value produced by driving the REAL `parseSubmissionFileName` /
`groupSubmissionsByStudent` (0.1) plus the calibrated grouping of 0.2(b). These
are the frozen values; **a test must not recompute them from the
implementation.** `DECISION` is the verdict the refusal must reach under
RULING 87's refined mechanism.

| id | Fixture (path -> declared owner) | rowsToday | rowsAfter | fbBlendToday | fbBlendAfter | SPLIT | MERGE | DECISION | Class |
|---|---|---|---|---|---|---|---|---|---|
| F1 | `johnsmith_1001_0_report.docx`->SmithA, `johnsmith_1002_0_report.docx`->SmithB | 1 | 1 | 0 | 0 | 0 | 0 | ALLOW | A14 SURVIVOR, out of scope (RES-A44T-1) |
| F2 | two `janedoe_...` conventions -> JaneDoe | 1 | 1 | 0 | 0 | 0 | 1 | ALLOW | MERGE-REQUIRED |
| F3 | `AlvarezMaria/essay.txt`, `BrownTom/essay.txt`, `ChenLi/essay.txt`, three owners | **1** | **3** | **1** | **0** | 0 | 0 | ALLOW | **THE HEADLINE FIX** |
| F4 | `Homework Final.docx`->A, `Homework Draft.docx`->B | 1 | 1 | 1 | 1 | 0 | 0 | REFUSE | flat, no signal, refusal required |
| F5 | two conventions + `README.txt`, three owners | 3 | 3 | 0 | 0 | 0 | 0 | ALLOW | ALLOW-REQUIRED |
| F6 | `AlvarezMaria/Homework Final.docx`, `AlvarezMaria/Homework Draft.docx`, ONE owner | 1 | 1 | 0 | 0 | 0 | 1 | **REFUSE** | **RULING 87's pinned conservative case** |
| F7 | two per-student `.zip`s, each with its own `zipParents` | 2 | 2 | 0 | 0 | 0 | 0 | ALLOW | step 3, fold must not reach it |
| F8 | F5's two conventions + `ChenLi/reflection.docx` + `DavisAnn/reflection.docx` | 3 | **4** | **1** | **0** | 0 | 0 | ALLOW | mixed, FIXED |
| F9 | `Essay.docx`->A, `essay.docx`->B | 1 | 1 | 1 | 1 | 0 | 0 | REFUSE | case fold |
| F10 | `essay.docx` alone | 1 | 1 | 0 | 0 | 0 | 0 | ALLOW | ALLOW-REQUIRED |
| G1 | `bulk.zip/{AlvarezMaria,BrownTom,ChenLi}/essay.txt`, `zipParents=["bulk.zip"]`, three owners | **1** | **3** | **1** | **0** | 0 | 0 | ALLOW | **GAP-A: today 3 students, 1 row, and A41 refuses NOTHING** |
| G2 | same wrapper, DISTINCT stems, two owners | **1** | **2** | **1** | **0** | 0 | 0 | ALLOW | **GAP-B: the shape A41 proved is never refused, collapsing** |
| G3 | `backend/config.py`, `frontend/config.py`, ONE owner | 1 | **2** | 0 | 0 | **1** | 0 | ALLOW | **THE ACCEPTED FALSE SPLIT, frozen** |
| G4 | `Submissions/essay.docx`->A, `Submissions/essay.pdf`->B | 1 | 1 | 1 | 1 | 0 | 0 | **REFUSE** | **the shape that killed the literal amnesty** |
| G5 | `AlvarezMaria/homework.txt`->A, `BrownTom/homework.txt`->B, `Shared/essay.docx`->C, `Shared/essay.pdf`->D | 2 | 3 | 2 | **1** | 0 | 0 | **ALLOW** | **UNSOUND under RULING 87 - section 2 R2** |
| G6 | `JohnSmith/report.docx`->SmithA, `JohnSmith/report.pdf`->SmithB, `AlvarezMaria/essay.txt`->C | 2 | 2 | 1 | **1** | 0 | 0 | **ALLOW** | **UNSOUND, same class as G5 by a different route** |
| G7 | `src/otherfile.py` alone (`utils.test.ts:366`'s own path) | 1 | 1 | 0 | 0 | 0 | 0 | ALLOW | the fold DOES apply - see section 11 |
| G8 | `Submissions/AlvarezMaria/essay.txt`, `Submissions/BrownTom/essay.txt` | **1** | **2** | **1** | **0** | 0 | 0 | ALLOW | nested folders, immediate parent wins |
| G9 | `essay.txt`->A, `essay.pdf`->B | 1 | 1 | 1 | 1 | 0 | 0 | REFUSE | flat, same stem, different ext |
| G10 | `wrapA/janedoe_..._report.docx`, `wrapB/janedoe_..._report.docx`, ONE owner | 1 | 1 | 0 | 0 | 0 | 1 | ALLOW | **fold-always must not split this** |
| G11 | `Submissions/essay{1,2,3}.txt`, three owners | 3 | 3 | 0 | 0 | 0 | 0 | ALLOW | **folder-alone must not collapse this** |
| G12 | `AlvarezMaria/homework.txt`->A, `BrownTom/homework.txt`->B, `essay.docx`->C, `essay.pdf`->D | 2 | 3 | 2 | **1** | 0 | 0 | **REFUSE** | **a FLAT collision in a foldered run** |
| G13 | `x/_a::b.docx`->A, `x::_a/b.docx`->B | 2 | 2 | 0 | 0 | 0 | 0 | ALLOW | **the separator-injectivity pair** |

**Frozen displays after the fold** (suffix reading, `docs/a44-scope.md`
section 10's recommendation - see R10 for what is and is not pinned about the
spelling):

```
F3  ["essay (AlvarezMaria)","essay (BrownTom)","essay (ChenLi)"]
F8  ["alvarezmaria","browntom","reflection (ChenLi)","reflection (DavisAnn)"]
G1  ["bulk (AlvarezMaria)","bulk (BrownTom)","bulk (ChenLi)"]
G2  ["bulk (AlvarezMaria)","bulk (BrownTom)"]
G3  ["config (backend)","config (frontend)"]        <- see R8's disclosure clause
G5  ["essay","homework (AlvarezMaria)","homework (BrownTom)"]
G8  ["essay (AlvarezMaria)","essay (BrownTom)"]
F6  ["Homework"]   F4 ["Homework"]   F9 ["Essay"]   G7 ["otherfile"]
```

**The full per-path trace for the headline cases, frozen because the
`submittedFiles` names are what make the collapse invisible today:**

```
F3 rowsOut=1 (REAL groupSubmissionsByStudent)
  student="essay" mergedFileCount=3 submittedFiles=["essay.txt","essay.txt","essay.txt"]
  content="File: essay.txt\n\nMARKER-F3-0 AlvarezMaria\n\n---\n\nFile: essay.txt\n\n
           MARKER-F3-1 BrownTom\n\n---\n\nFile: essay.txt\n\nMARKER-F3-2 ChenLi"
G1 rowsOut=1
  student="bulk" mergedFileCount=3 submittedFiles=["essay.txt","essay.txt","essay.txt"]
G2 rowsOut=1
  student="bulk" mergedFileCount=2 submittedFiles=["aessay.txt","bessay.txt"]

  AlvarezMaria/essay.txt            step=6 fb=true folder=AlvarezMaria todayKey="essay" compound="12:alvarezmariaessay"
  bulk.zip/AlvarezMaria/essay.txt   step=5 fb=true folder=AlvarezMaria todayKey="bulk"  compound="12:alvarezmariabulk"
  janedoe_..._project.zip/main.py   step=3 fb=false folder=... todayKey="janedoe" compound="janedoe"
  Submissions/essay.docx            step=6 fb=true folder=Submissions todayKey="essay" compound="11:submissionsessay"
  src/otherfile.py                  step=6 fb=true folder=src      todayKey="otherfile" compound="3:srcotherfile"
```

The `compound` column shows the LENGTH-PREFIXED join
(`String(folder.length) + ":" + folder + baseKey`) rather than a printable
separator. That choice is a requirement, not a preference - R11 proves why with
a constructed collision.

### 1.5 The frozen sweep: eleven shapes, seed 20260927, 20000 sets requested each

**HARM, SPLIT.** `harm` is the FALLBACK-CAUSED BLEND of 1.3.

| shape | sets | harmBefore | harmAfter | splitBefore | splitAfter |
|---|---|---|---|---|---|
| `flat` | 19926 | 11550 | 11550 | 0 | 0 |
| `folder` | 20000 | 12421 | **0** | 0 | 0 |
| `folder-resubmit` | 19963 | 9239 | **0** | 14817 (74.2%) | 14817 (74.2%) |
| `convention` | 20000 | 0 | 0 | 0 | 0 |
| `convention-resubmit` | 20000 | 0 | 0 | 0 | 0 |
| `folder-distinct-stems` | 20000 | 0 | 0 | 0 | 0 |
| `shared-wrapper-folder` | 19926 | 11550 | 11550 | 0 | 0 |
| `single-student-multi-folder-shared-filename` | 19885 | 0 | 0 | **0** | **19440 (97.8%)** |
| `nested-bulk-perstudent-folders` | 20000 | **20000** | **0** | 0 | 0 |
| `mixed-perstudent-plus-shared-dropbox` | 19927 | 12215 | **2728** | 0 | 0 |
| `duplicate-folder-name` | 19927 | 12215 | **2728** | 0 | 0 |

**UNSOUND (fallback-caused harm present AND not refused).**

| shape | A41 today | folded key only | RULING 85 literal | **RULING 87 refined** |
|---|---|---|---|---|
| `flat` | 0 | 0 | 0 | **0** |
| `folder` | 0 | 0 | 0 | **0** |
| `folder-resubmit` | 0 | 0 | 0 | **0** |
| `convention` | 0 | 0 | 0 | **0** |
| `convention-resubmit` | 0 | 0 | 0 | **0** |
| `folder-distinct-stems` | 0 | 0 | 0 | **0** |
| `shared-wrapper-folder` | 0 | 0 | **11550** | **0** |
| `single-student-multi-folder-shared-filename` | 0 | 0 | 0 | **0** |
| `nested-bulk-perstudent-folders` | **20000** | 0 | 0 | **0** |
| `mixed-perstudent-plus-shared-dropbox` | 0 | 0 | 2728 | **2159 (10.8%)** |
| `duplicate-folder-name` | 0 | 0 | 2728 | **2159 (10.8%)** |

**CONSERVATIVE (refused with no fallback-caused harm) - the row's own pass
condition lives in this table.**

| shape | A41 today | folded key only | RULING 85 literal | **RULING 87 refined** |
|---|---|---|---|---|
| `folder-resubmit` | **2891 (14.5%)** | 4939 (24.7%) | 0 | **1278 (6.4%)** |
| `single-student-multi-folder-shared-filename` | 19885 (100.0%) | 9079 (45.7%) | 0 | 445 (2.2%) |
| every other shape above | 0 | 0 | 0 | 0 |

**FALSE SPLIT that is also UNREFUSED under the refined mechanism** - a wrong row
with nothing to warn the instructor:

```
folder-resubmit                              split=14817  splitUnrefused=13857 (69.4% of sets)
single-student-multi-folder-shared-filename   split=19440  splitUnrefused=19440 (97.8% of sets)
```

**Four things this sweep establishes that neither prior artifact measured.**

1. **`nested-bulk-perstudent-folders` is a 100% silent-harm shape TODAY.** All
   20000 sets carry fallback-caused harm and A41's predicate refuses NONE of
   them, because its discriminator requires an empty `zipChain`
   (`docs/a41-test-notes.md` section 4). A44's fold takes it to 0/0. This is the
   check's GAP-A at scale, and it is A44's second primary win.
2. **`duplicate-folder-name` and `mixed-perstudent-plus-shared-dropbox` produce
   IDENTICAL counts on every column**, because they differ only in the shared
   folder's literal name, which no predicate reads. **They are ONE shape wearing
   two labels, and reporting both as two results would inflate the evidence.**
   The required shape list in R2 names one; the other is recorded here as a
   duplicate so nobody re-derives it as new coverage.
3. The `folder-resubmit` SPLIT is 74.2% before AND after - see 1.1.
4. The whole `single-student-...` 97.8% false split is introduced by A44 (before
   0, after 19440) and 100% of it is unrefused. That is the accepted regression,
   quantified as an absolute frozen pair rather than a delta.

---

## 2. Numbered requirements

Each names the object under comparison, the instrument producing each quantity,
and the direction of failure. `X` in a file name means the wave-plan seat names
the file; a requirement binds to the assertion, not the filename.

---

### R1. Every frozen row of 1.4 is reproduced

- **Object:** for each of the 23 fixtures, the six frozen quantities
  (`rowsToday`, `rowsAfter`, `fbBlendAfter`, `SPLIT`, `DECISION`,
  `displaysUnique`) against the frozen literals in 1.4.
- **Instrument, quantity by quantity:** the fixture's `submissions` record and
  `zipParents` record are written as literals in the test.
  `rowsToday` comes from ONE `groupSubmissionsByStudent` call over the
  unmigrated path; `rowsAfter` from ONE call over the migrated path;
  `fbBlendAfter` and `SPLIT` from the declared owner map recovered by content
  MARKER (never by file name); `DECISION` from ONE call to the decision
  function; `displaysUnique` from `new Set(rows.map(r => r.student)).size`.
  Expected values are frozen literals in the test body.
- **Direction of failure:** RED on any difference. Specifically RED when F3, F8,
  G1, G2 or G8 returns fewer rows than its frozen `rowsAfter`; RED when F6 or G4
  is ALLOWED; RED when F1, F2, F5, F7, F10, G10 or G11 is REFUSED; RED when G3's
  SPLIT is not exactly 1; RED when G13's `rowsAfter` is not exactly 2.
- **Why F1 is in the table although it is out of scope:** it is the ONLY fixture
  that catches a decision which pulls convention-branch files into the collision
  set (mutant D-f, section 6.1), and pinning its ALLOW is what stops A44
  silently widening into A14's territory.
- **The calibration control is part of this requirement**, not a preliminary:
  for every fixture, the migration-path grouping driven with TODAY's keyer must
  reproduce the real function's rows exactly. Asserted per fixture (`CAL-<id>`),
  so one divergence fails by name. Without it, `rowsToday` is an unchecked
  reimplementation of the thing under test.
- **Never import this fixture table from another `*.test.ts`.** If two test
  files want it, DUPLICATE it; importing re-runs the other file's `describe`
  blocks under the wrong setup.
- **Runs:** `npm run test:paths -- <the decision leaf's test> <the grouping test>`

---

### R2. THE SOUNDNESS INSTRUMENT - the one that matters most

Zero fallback-caused harm may be silently allowed. This is the requirement A44
exists to satisfy and the requirement RULING 85's literal wording failed.

- **Object:** for every set the generator of 0.4 produces in a named shape, the
  pair (fallback-caused BLEND present after the fold, decision refuses).
- **Instrument:** ground truth from the per-file declared owner, recovered from
  each row by content marker, over ONE `groupSubmissionsByStudent` call on the
  migrated path. The decision from ONE call to the decision function over the
  same `submissions`/`zipParents`. Seed `20260927`, generator duplicated into
  the test file.
- **THE SHAPES IT MUST BE EXERCISED AGAINST, all nine, none optional:**
  `flat`, `folder`, `folder-resubmit`, `convention`, `convention-resubmit`,
  `folder-distinct-stems`, **`shared-wrapper-folder`** (the shape that killed
  RULING 85's literal mechanism - 11550 of 11550 harmful sets silently allowed),
  `single-student-multi-folder-shared-filename`, and
  **`nested-bulk-perstudent-folders`** (100% silent harm today).
- **Direction of failure, first direction:** RED when ANY set in ANY of those
  nine shapes has a fallback-caused blend and is ALLOWED. **The expected count
  is exactly 0 on each shape, frozen, nine zeros - not a rate.**
- **Second direction, same instrument:** RED when any set in `convention`,
  `convention-resubmit` or `folder-distinct-stems` is REFUSED. Expected count
  exactly 0 on each.
- **Third direction, the frozen conservative counts:** `folder-resubmit`
  **1278**, `single-student-multi-folder-shared-filename` **445**, and **0 on the
  other seven**. Asserting the counts as well as the zeros is what stops a
  decision drifting inside the sound region. If `SWEEP_N` is reduced for
  runtime, every count is re-measured in the SAME commit; a stale count is a
  finding.
- **Why R1 is not enough:** R1 is a hand-written list of 23, and a hand-written
  list of 23 is satisfied by an implementation that matches 23 path sets. A
  seeded sweep whose expected values are eleven zeros and two counts is not.

**THE TENTH SHAPE, AND THE MEASURED LIMIT I CANNOT ENGINEER AWAY.**

I built a shape specifically to attack RULING 87's refined amnesty, and it
succeeds:

```
mixed-perstudent-plus-shared-dropbox   19927 sets
  harm after the fold                  2728
  UNSOUND under RULING 87 refined      2159  (10.8% of sets, 79.1% of the harm)
```

Frozen instances: **G5** (a shared drop folder inside an otherwise per-student
zip) and **G6** (two students whose folder names are identical - the A14
sanitized-name collision moved from the file name to the FOLDER name, and A14's
file-name version is a pinned, known-open defect in this tree at
`utils.test.ts:326-334`). Both measured ALLOW with a real cross-student blend in
the row.

**Why it happens, and why it is structural rather than a patchable condition.**
The run gate opens as soon as the run shows 2 or more distinct folders. Once
open, a colliding group sitting inside ONE folder is granted amnesty - and
`{folder F holds exactly two files that collide on stem}` is the SAME INPUT
whether F is one student's own folder (F6) or a folder two students both used
(G5/G6). Nothing in the file paths distinguishes them. This is precisely the
ambiguity `docs/a44-scope.md` 3.2 and 3.4 name; the run gate does not remove it,
it relocates it from "one folder in the run" to "one folder among several".

**A second attempt that changes KIND, measured and reported rather than
proposed.** `docs/loop/iteration-caps.md` cap 1 forbids strengthening the same
mechanism at the second failure, so I did not add a condition to the gate - I
changed what the amnesty requires CORROBORATION from: grant amnesty only when
2 or more DISTINCT folders in the run each carry a collision (if per-student
resubmission is this run's norm, more than one student will show it). Measured,
both mechanisms side by side:

| shape | UNSOUND, RULING 87 | UNSOUND, corroboration variant | CONSERVATIVE, RULING 87 | CONSERVATIVE, corroboration variant |
|---|---|---|---|---|
| `flat` | 0 | 0 | 0 | 0 |
| `folder` | 0 | 0 | 0 | 0 |
| **`folder-resubmit`** | 0 | 0 | **1278 (6.4%)** | **4791 (24.0%)** |
| `convention` | 0 | 0 | 0 | 0 |
| `convention-resubmit` | 0 | 0 | 0 | 0 |
| `folder-distinct-stems` | 0 | 0 | 0 | 0 |
| `shared-wrapper-folder` | 0 | 0 | 0 | 0 |
| `single-student-...` | 0 | 0 | 445 (2.2%) | 7580 (38.1%) |
| `nested-bulk-...` | 0 | 0 | 0 | 0 |
| **`mixed-...-shared-dropbox`** | **2159** | **0** | 0 | 0 |

```
F6 in isolation:      RULING 87 = REFUSE   corroboration variant = REFUSE
G4 (shared wrapper):  RULING 87 = REFUSE   corroboration variant = REFUSE
G5 (mixed dropbox):   RULING 87 = ALLOW    corroboration variant = REFUSE
```

**The corroboration variant reaches ZERO unsound on all ten shapes and keeps F6
REFUSE - and it raises the conservative rate on `folder-resubmit` to 24.0%,
which is WORSE than the 14.5% baseline the row was filed to lower.** So the two
mechanisms are exhaustive of what I may attempt under the cap, and neither does
both. That is the terminating question in section 13. It is a DECISION, not a
defect an implementer can fix, and not a measurement that is still outstanding.

**What the requirement says until it is answered.** Whichever mechanism ships,
this instrument's tenth shape is asserted with an EXACT FROZEN INTEGER, not a
rate and not an inequality:

- under RULING 87 as it stands: `mixed-perstudent-plus-shared-dropbox` unsound
  count is exactly **2159** of 19927, **RED ON ANY CHANGE IN EITHER
  DIRECTION.** A rise is a regression; a FALL means the mechanism changed and
  the change was not measured, and the number is re-frozen in the same commit
  that causes it. This is the `headless.test.ts` exact-set-size idiom this repo
  already uses;
- under the corroboration variant: exactly **0**, and `folder-resubmit`'s
  conservative count re-frozen at **4791**.

**I am not substituting a rate for zero.** An exact integer is strictly
stronger than a rate, it makes the accepted unsoundness visible in the suite
rather than in a document, and it is the only honest form available while a
path-only mechanism is the mechanism.

---

### R3. The row's own pass condition, measured

- **Object:** the conservative refusal count on the `folder-resubmit` shape,
  against the frozen baseline `2891 (14.5%)` for A41's predicate and the frozen
  post-A44 value for the shipped mechanism.
- **Instrument:** the sweep of R2, `folder-resubmit` shape, both predicates run
  over the SAME generated sets in the same process, so the comparison is between
  two decisions over one population rather than two runs.
- **Direction of failure:** RED when the post-A44 conservative count is **not
  below** the frozen pre-A44 count. Under RULING 87 the frozen pair is
  `2891 -> 1278`; under the corroboration variant it is `2891 -> 4791`, which
  FAILS this requirement, and that failure is the cost side of section 13's
  fork rather than a defect.
- **Why this is a requirement and not a note:** it is the row's literal pass
  condition (`docs/BACKLOG.md:118`), nothing in the suite measures a refusal
  rate today, and `docs/a44-check.md`'s named silent-green failure 1 is exactly
  this quantity moving the wrong way with every gate green.
- **Forbidden spelling:** asserting the RATE (`6.4%`). Rates hide a changed
  denominator. Assert both integers.

---

### R4. The false split, as two independent frozen absolutes

- **Object:** on the `single-student-multi-folder-shared-filename` shape, the
  count of sets containing a SPLIT (1.2 definition) before the fold and after
  the fold, against the frozen literals **0** and **19440**; plus the count that
  is SPLIT and UNREFUSED, frozen at **19440**.
- **Instrument:** the declared owner map; two `groupSubmissionsByStudent` calls
  over the same generated sets, one per path; the decision function for the
  refusal half. Same seed, same process.
- **Direction of failure:** RED on any change to either integer. A rise means
  the accepted regression grew; a fall means the mechanism changed and the
  change was not measured.
- **Frozen companion, `folder-resubmit`: splitBefore 14817 and splitAfter
  14817.** Both are asserted. Asserting only the after-value would attribute a
  pre-existing 74.2% to A44 (1.1), and asserting only the delta would make the
  test an implementation-to-implementation comparison.
- **G3 is this shape's frozen single instance**, with its `rowsAfter = 2`,
  `SPLIT = 1`, `DECISION = ALLOW` and its display pair
  `["config (backend)","config (frontend)"]`. The display pair is frozen because
  it is the user-visible face of the accepted regression: two graded rows named
  after DIRECTORIES.

---

### R5. The refusal is EMITTED by the producer, on the DEFAULT path and on all three unattended ones

A pure-function test over a hand-built fixture is necessary and NOT sufficient.
`docs/a44-check.md` established the channel facts and I re-measured all of them.

**Measured facts this requirement rests on:**

- The DEFAULT provider is `gemini`: `src/lib/llm-provider.ts:14`
  (`const DEFAULT_PROVIDER: LlmProvider = "gemini"`) and `:16-20` (`coerce`
  returns `"gemini"` for anything not `"other"`/`"embedded"`).
- The default zip branch is `src/app/actions/grading.ts:905-920`, calling
  `gradeSubmissions` at `:907`. **It returns no `warnings` field at all** (the
  four `warnings` sites in that file are `:699`, `:784`, `:804`, `:875` - all on
  other branches). A refusal delivered as `warnings` is therefore DEAD on the
  default path.
- `gradeAction`'s outer `catch` is `grading.ts:921-924`, returning
  `{ run: null, error: message }` at `:923` with `err.message` VERBATIM, no
  prefix. The precedent is already load-bearing: `src/lib/grade/engine.ts:443`
  throws an ingestion-level `Error` from inside `gradeSubmissions` and its
  message becomes `state.error`.
- `state.error` renders at `src/app/components/GradingTab.tsx:262-266`
  (`role="alert"`); `state.warnings` at `:502-511`.
- All three unattended callers read `.error` and none reads `warnings`:
  cartridge `:108` -> `:110` `errorMsg` -> `:111`
  `lines.push(\`${drop.name}: ${errorMsg}\`)` and
  `finishCartridgeDropAction(..., { error: errorMsg })` at `:114`;
  grading-run `:481` -> `:483-485` and `:549` -> `:551-552`; draft-flow
  `:271` -> `:273-274`. `grep -c "warnings"` is 0 in all three (canary in 0.3).

**R5a - the default (gemini) zip branch.**

- **Object:** the `GradeActionState` that `gradeAction` RETURNS for a real
  colliding zip under `provider=gemini`, against a frozen literal.
- **Instrument:** `gradeAction` imported and driven with a real `FormData`,
  exactly as `src/app/actions/grading.budget.test.ts:88-94,105,129` already
  does. `requireOwner` mocked (`grading.budget.test.ts:19-21` is the precedent -
  auth only). **The MODEL SEAM is `callLlm` from `@/lib/llm`**, imported by
  `src/lib/grade/engine.ts:7` and `src/lib/grade/rubric.ts:1`, so
  `vi.mock("@/lib/llm", ...)` reaches both - including through
  `gradeSubmissions`'s dynamic `await import("./rubric")` at `engine.ts:424` and
  the `inferFileNameConvention` call at `:431`.
  **Do NOT mock `fetch`** - `vitest.setup.ts` throws on any unmocked `fetch`,
  and a sabotage that moves a call onto an unmocked transport must hit that stub
  rather than a live host (a live 401 once made a sabotage check pass here).
  `synthesizeFullCreditChecklist` and `generateSampleAnswer` are mocked (the
  other two members of the `Promise.all` at `grading.ts:906-910`);
  **`gradeSubmissions` is left REAL**, which is the whole point.
- **The zip is real**, built with JSZip in the test.
  `src/lib/grade/extraction.test.ts:166-235` is the precedent, and its own
  comment at `:159-165` records the trap already paid for:
  `generateAsync({type:"nodebuffer"})` returns a Buffer on a shared 8KB pool -
  pass the nodebuffer directly or generate `type: "arraybuffer"`, never
  `.buffer`.
- **The fixture must use `.txt`, not `.docx`.** `extraction.test.ts:173-178`
  records why: `DOCUMENT_EXTENSIONS` routes `.docx` through a real Word parser,
  which rejects plain-string bytes and diverts the file into
  `failedSupportedFiles`, so a `.docx` fixture produces ZERO submissions and the
  test passes for the wrong reason.
- **The fixture shape is proven to be the EMITTED shape**, not invented: a
  folder inside the single top-level zip yields the key `Homework1/<name>` with
  `zipParents` **UNDEFINED**, asserted by the already-landed and already-green
  `extraction.test.ts:189-190`. F3's `AlvarezMaria/essay.txt` is that exact
  shape. For G1's nested case, `extraction.test.ts:207-208` is the landed
  assertion that a real `.zip` entry DOES populate `zipParents`.
- **Direction of failure:**
  1. RED when `result.error` is not EQUAL (by `toBe`, never `toContain`) to the
     frozen refusal string of section 5.
  2. RED when `result.run` is not `null`.
  3. RED when any `callLlm` invocation's request body contains any of the
     fixture files' content MARKERS. **This is the assertion that binds to the
     user-visible harm** - two students' text reaching one model call - rather
     than to a string. It survives a rewording; the equality does not. Both are
     required, for different reasons.
  4. On F3's `.txt` variant (which A44 FIXES rather than refuses), the mirror
     assertions: `result.error` is `null`, `result.run.results` has length 3,
     and the three rows' `student` strings are pairwise distinct. **A test that
     only ever asserts a refusal cannot tell a working fix from a blanket
     refusal.**

**R5b - the embedded branch.**

- **Object:** the returned `GradeActionState` for the same real zip under
  `provider=embedded`, against the SAME frozen literal.
- **Instrument:** as R5a, but `extractStudentEntries` left REAL (so the refusal
  is exercised on `grading.ts:854`'s path) while `buildEmbeddedRubric` and
  `gradeEntriesEmbedded` are mocked, as `grading.budget.test.ts:38-45,113-122`
  already does.
- **Direction of failure:** RED when `result.error` is not equal to the frozen
  string; RED when `gradeEntriesEmbedded` was called at all.

**R5c - the three unattended paths, DRIVEN, not read.**

This is a strict strengthening of A41's R5, which settled for a source-text
wiring check. **It is not needed here, because the steps are already driven by
landed tests.** `src/lib/workflows/registry/steps.grading-cartridge.test.ts:133`
executes `step.run({ maxDrops: 3 }, testHelpers(), () => {})` with `gradeAction`
MOCKED at `:7-13`. The same shape exists for `steps.grading-run.test.ts` and
`steps.grading-draft-flow.test.ts`.

- **Object:** the report LINE each step emits when `gradeAction` returns the
  refusal, against a frozen literal.
- **Instrument:** `vi.mock("@/app/actions")` with `gradeAction` returning
  `{ run: null, error: <the frozen refusal string> }`; `step.run(...)` executed;
  the emitted lines collected.
- **Direction of failure:** RED when the emitted line is not EQUAL to
  `` `${drop.name}: ${frozen}` `` for the cartridge step, to
  `` `Offline grading: ${frozen}` `` for `steps.grading-run.ts:552`, and to
  `` `${row.courseName} - ${row.assignmentName}: ${frozen}` `` for
  `steps.grading-draft-flow.ts:274`. Equality on the WHOLE line, so a template
  change that drops the refusal into a truncated field is caught.
- **This is the "drive the production path" rule applied**: a structural gate
  (no component renders) would have pushed this to a source-text check, and the
  production path was drivable all along.

---

### R6. The refusal must NOT fire where nothing was at risk

- **Object:** the decision function's call count, plus `result.error`, on three
  branches that cannot collapse.
- **Instrument:** the decision function mocked and its call count read;
  `gradeAction` driven three times with the same auth mock. (i) a single non-zip
  upload, `provider=gemini`, a `.txt` named `essay.txt` - `grading.ts:892-903`,
  and `src/lib/grade/single-file-entry.ts` returns at most one entry, so nothing
  can collapse. (ii) `provider=other` - `grading.ts:846-849`. (iii) `canvasUrl`
  set - `grading.ts:740` returns before the zip branch entirely.
- **Direction of failure:** RED when the decision is called on any of the three;
  RED when `result.error` on (i) is non-null.
- **Why it is a requirement:** `src/lib/grade/single-file-entry.test.ts:70-76`
  exists because that path was deliberately kept off the shared fallback. A
  refusal wired into `classifyGradingUpload`'s `"single"` branch would refuse a
  file that was never at risk, and no existing test would catch it.

---

### R7. The identity-key persistence instrument

The requirement's object is **the identity key, not the display string.** A
display is a property of the whole batch; a key is a property of the row.

**Executed proof that today's construction FAILS the corrected object**, against
the REAL `seedEdits` / `mergeStoredRowEdit` / `loadPersistedEdits` (0.1):

```
P1. DISPLAY-KEYED STORAGE. Maria's identity key never changes; a sibling joins.
  run1 rows: [{"key":"12:alvarezmariaessay","display":"essay"}]
  run2 rows: [{"key":"12:alvarezmariaessay","display":"essay (AlvarezMaria)"},
              {"key":"8:browntomessay","display":"essay (BrownTom)"}]
  KEY UNCHANGED = true
  stored blob keys = ["essay"]        recovered keys = ["essay (AlvarezMaria)", ...]
  Maria recovered total = "9.0" strengths = "orig strengths"
  P1 VERDICT: key-unchanged edit survived = false

P2. KEY-KEYED STORAGE, the same two runs, same real mergeStoredRowEdit.
  stored blob keys = ["12:alvarezmariaessay"]
  Maria recovered total = "9.5" strengths = "INSTRUCTOR EDIT ON MARIA"
  P2 VERDICT: key-unchanged edit survived = true
```

- **Object:** the strengths/total recovered for a row whose IDENTITY KEY is
  byte-identical across two runs, against the value the instructor saved.
- **Instrument:** two runs driven through the REAL persistence functions (or
  their successors) - seed run 1, mutate one row's edit, serialise, then load
  against run 2's results. The key-unchanged precondition is asserted first, so
  the test cannot pass by the key having changed too.
- **Direction of failure:** RED when the saved value is not recovered. **Frozen
  literal: `"INSTRUCTOR EDIT ON MARIA"` must come back, not `"orig strengths"`.**
- **P5 IS REQUIRED AND P1 ALONE IS NOT ENOUGH. I broke P1 myself:**

  ```
  P1 sibling sorts AFTER Maria   (BrownTom/essay.txt)
    run1 displays=["essay"] maria index=0
    run2 displays=["essay (AlvarezMaria)","essay (BrownTom)"] maria index=0
    ROW-INDEX KEYING would survive = true    <- P1 does NOT kill the index mutant
  P5 sibling sorts BEFORE Maria  (AAAStudent/essay.txt)
    run1 displays=["essay"] maria index=0
    run2 displays=["essay (AAAStudent)","essay (AlvarezMaria)"] maria index=1
    ROW-INDEX KEYING would survive = false   <- P5 DOES kill it
  ```

  `utils.ts:319` sorts rows by display, so in P1 Maria stays at index 0 and a
  passing-but-wrong implementation that keys edits on the ROW INDEX passes.
  **Both P1 and P5 are required**, and the second exists only because I attacked
  the first.
- **P3, the loss that is already accepted, pinned so it is not confused with
  P1:** for F3, the single pre-fix row's key `"essay"` exists in NO after-row
  (measured: after-keys are `12:alvarezmariaessay`, `8:browntomessay`,
  `6:chenliessay`). An edit saved against a previously-blended row has no
  successor by construction. Assert that the pre-fix key is absent from the
  after-key set, so the boundary between "accepted" and "R7's defect" is a
  test, not a paragraph.
- **P4, the collapse this protects against, against the real `seedEdits`:**

  ```
  rows in run = 3   keys in seedEdits = 1
  surviving strengths = "Li real"   surviving total = "7"
  ```

  Two of three students' seeded feedback is gone before the page opens. RED when
  `Object.keys(seedEdits(run)).length` is not equal to `run.results.length`.

**WHICH OF THE DISPLAY-KEYED SITES THIS COVERS - and the census is WRONG.**

`docs/a44-scope.md` 4.2 and `docs/a44-check.md` M1 independently derived **30**
display-keyed sites in three files, by a regex that ENUMERATES identifier names
(`result|r|entry|student|expandedBox|codeOutputStudent`). Re-derived this pass by
CONSTRUCTION instead - any bracket index whose subscript is an `X.student` or a
bare student-ish identifier, plus the identity comparisons:

```
$ grep -rnE "\[[A-Za-z_][A-Za-z0-9_.]*\.student\]|\[student\]|\[codeOutputStudent\]|\.student ===|=== *codeOutputStudent|\[[A-Za-z_][A-Za-z0-9_]*Student\]" src \
    --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -vE ":[0-9]+: *(//|\*|/\*)"
total=49
  34 src/app/components/GradingResults.tsx
   7 src/app/components/grading-results/gradingResultsHelpers.ts
   2 src/app/components/grading-results/ungradedDisclosure.ts
   (6 in unrelated files; 2 in steps.grading-{run,draft-flow}.ts are
    `const sections: string[] = [gradeResult.student]` - ARRAY LITERALS, false
    positives of my own pattern, named here rather than counted)
```

**43 in the three grading-results files, not 30.** The 13 the enumerating regex
could not see are the `row.student` family, and two of the omissions matter more
than the count:

1. **`gradingResultsHelpers.ts:717,722,725`** are inside
   `fanOutGradingPostResult` (`:703-727`), which keys the post-to-Canvas status
   fan-out on the display string. **It is an exported pure function in a plain
   `.ts` file, so it IS executable** - the post path's collision behaviour is
   testable after all, which both prior artifacts treated as un-testable.
2. **`GradingResults.tsx:427-500`** is the SINGLE-ROW post and run-code path
   (`handlePostOne`), absent from the 30-site census entirely, and it keys post
   status and code-run state on the display string too.

**Coverage, stated site by site rather than as a fraction:**

| Sites | Status |
|---|---|
| `gradingResultsHelpers.ts:287` (`seedEdits`), `:632` (`loadPersistedEdits`), `:597` (`mergeStoredRowEdit`) | **COVERED and EXECUTED** by P1/P2/P4/P5 above |
| `gradingResultsHelpers.ts:503-504` (`buildCsvContent`) | **COVERABLE and REQUIRED**: drive `buildCsvContent` with two rows sharing one display and assert the CSV has two distinct first cells. RED when a row is lost or duplicated |
| `gradingResultsHelpers.ts:717,722,725` (`fanOutGradingPostResult`) | **COVERABLE and REQUIRED**: two attempted rows with distinct `userId` and the SAME `student`; RED when the returned record has fewer than 2 entries, which is one student's Canvas post status silently overwriting another's |
| `ungradedDisclosure.ts:191,193` (`correctUngradedSeeds`) | **COVERABLE and REQUIRED**: same two-row shape; RED when an entry is lost |
| `GradingResults.tsx`, all 34 | **NOT COVERABLE BY ANY TEST IN THIS REPO.** vitest is node-env and collects only `src/**/*.test.ts`; no component is rendered. Includes `:332-395` (bulk post), `:427-500` (single-row post), `:626-627,722-725` (render), `:832,838-839` (expanded box, code output). **These are owner verification, RES-A44T-4** |

Naming a fraction here would be dishonest in both directions: 9 of 43 lines are
executable, but those 9 are the three pure helpers through which every one of
the other 34 gets its data.

---

### R8. The copy: every clause bound to an emitted value, on every path, by EQUALITY

Five false user-facing sentences have shipped in this codebase; two more were
caught in candidates this week - one asserting a student count under the synonym
"submissions", one interpolating a course name where it read as a time.

**What the code actually has at the decision point, measured.** This is the
constraint every clause is bound by.

| Quantity | Available? | Where |
|---|---|---|
| the colliding group's paths | YES | the group's own subset of `Object.keys(submissions)` |
| the group's computed display | YES | `parseSubmissionFileName(...).studentDisplay` |
| **the group's folder segment** | **YES, and constant across the group** | proven by construction: a foldered file's key is length-prefixed and an unfoldered file's is bare, so the two can never collide, and the join is injective (R11). Every collision group is folder-homogeneous. Verified by mutant D-d2 in 6.1 |
| the count of DISTINCT folders in the run's fallback-reaching population | YES | it is the run gate's own input |
| the count of files whose text was READ | YES | `Object.keys(submissions).length` |
| the count of entries in the zip | **NO** | `extraction.ts:83-85` skips unsupported extensions with no counter; `extraction.ts:137`'s destructure discards `attemptedSupportedFiles`/`failedSupportedFiles` |
| the number of STUDENTS | **NO, and it is the defect** | the collapse is precisely the app not knowing this |

**C-A. Bind to paths, keys and folders - never to students or submissions.**
"Submissions" is this app's own synonym for a student's work
(`GradingTab.tsx:322` reads "Upload a zip archive of student submissions"; the
returned type is `StudentSubmissionEntry`), so a count of "submissions" is a
student count wearing a synonym.

**C-B. EQUALITY, never containment.** `toContain` is defeated by four appended
words that keep every required token and invert the meaning - an executed defeat
on record here. Every copy assertion is
`expect(result.error).toBe(<frozen literal>)`.

**C-C. THE A44-SPECIFIC FALSE SENTENCE, and it needs two branches, not one.**
The refusal is now folder-aware, so the actionable instruction depends on WHY
the amnesty was withheld, and a single sentence is false on one of the two
branches:

- **Branch `no-folder-signal`** - the run shows fewer than 2 distinct folders
  among its fallback-reaching files (F6, F4, F9, G4, G9). "Give each student
  their own folder inside the zip" is TRUE and would change the outcome:
  measured, `flat` refuses 11550 of 19926 and `folder` refuses 0 of 20000 after
  the fold.
- **Branch `flat-collision-in-foldered-run`** - the run DOES show 2 or more
  folders and the colliding files are at the top level (G12, frozen REFUSE).
  Here "give each student their own folder" is misleading, because most students
  already have one. The true instruction names the specific top-level files.

**A single sentence covering both is a true-sounding sentence that misleads on
one branch, which is this codebase's exact defect class.** The requirement:
the decision is a DISCRIMINATED UNION with at least these two refusal variants,
and its describe function is an exhaustive `switch` with **no `default`** - the
precedent is `src/lib/submission-zip-intake.ts:93-98` plus `:145-158`. A
`switch` over a discriminated union with no `default` fails
`npx tsc --noEmit` when a variant is added without a case, which makes the
missing-sentence state UNREPRESENTABLE rather than merely asserted absent.

**C-D. The folder name must be labelled as a folder, and quoted.** A sentence
reading `2 files in Submissions resolve to the same name` renders `Submissions`
as if it were a student. This is the A44 form of the "course name interpolated
where it reads as a time" defect. The frozen literal must show the folder name
in quotes AND preceded by the word `folder`, and the assertion is equality over
the whole sentence, so removing the label is caught.

**C-E. No warn-then-proceed sentence.** A sentence that warns while the run
grades anyway manufactures disclosure and the wrong grade still lands. Under
RULING 87 there is no proceeding branch for a refusal, so any such string in the
diff is a finding.

**C-F. No claim that the files belong to one student.** The amnesty does NOT
conclude that; it declines to refuse. `resolve to the same student NAME` is
true; `are the same student` is not.

- **Object:** the emitted `error` string on R5a, R5b and all three R5c report
  lines, on: a `no-folder-signal` fixture (F6's `.txt` variant), a
  `flat-collision-in-foldered-run` fixture (G12), a multi-group fixture (F8's
  shape with two colliding keys), and a >5-path group.
- **Instrument:** `expect(<emitted>).toBe(<frozen literal>)`, one frozen literal
  per fixture, written out in full in the test body.
- **Direction of failure:** RED on any difference, including appended words,
  changed numbers, changed nouns and a dropped `folder` label.
- **Multi-group:** the frozen string must name BOTH groups. A sentence naming
  only the first is a true sentence that misleads.
- **Truncation:** if the path list is capped (the precedent
  `submission-zip-intake.ts:135-141` caps at 5 with `, ...`), a sixth fixture
  with six colliding paths and the truncated string frozen is REQUIRED. An
  uncapped list is also acceptable, but then the requirement is a frozen
  six-path string proving it is uncapped. A cap with no fixture ships an
  untested branch with the suite green.
- **No assertion anywhere that the string EXISTS IN THE SOURCE** of
  `grading.ts`, `engine.ts`, `utils.ts` or the leaf. A retired literal kept as a
  source grep prints lines on correct code forever (`docs/BACKLOG.md:86`, A34),
  and source-text tests that pin wording have twice forced contorted code here.
  Pin the EMITTED value.
- **The DISPLAY string is user-facing copy too, and it gets one frozen
  disclosure assertion, not a spelling pin:** G3's display pair
  `["config (backend)","config (frontend)"]` is frozen. Two graded rows named
  after directories is the visible face of the accepted false split, and freezing
  it puts that fact in the suite where a reader meets it, instead of in a
  document where they do not. See R10 for why the suffix SPELLING is deliberately
  not pinned anywhere else.

---

### R9. The tautological guard at `utils.test.ts:360-375`: REPAIR, with the measurement that makes the repair real

**Decision: KEEP the test, RENAME what it claims, ADD the one fixture row that
makes the renamed claim non-vacuous. Do not delete it and do not re-spell it.**

The finding reproduces. `grouped` is a `Map` on `inferred.key`
(`utils.ts:301,305,308`) and all six return sites of `parseSubmissionFileName`
set `studentKey = studentDisplay.toLowerCase()` (`:116-117`, `:193-194`, `:221`,
`:234-235`, `:247`, `:256` via `leafStemFallback` `:125`) - so distinct keys
imply distinct displays and
`expect(new Set(students).size).toBe(students.length)` at `:373` is true by
construction TODAY.

**What is worth after the repair, measured rather than argued.** A44 breaks the
key-equals-lowercased-display invariant for the first time in this codebase:

```
AlvarezMaria/essay.txt    key="essay"   display="essay"   invariantHolds=true
                          compound="12:alvarezmariaessay" compoundInvariantHolds=FALSE
janedoe_..._report.docx   compound="janedoe"              compoundInvariantHolds=true
Homework Final.docx       compound="homework"             compoundInvariantHolds=true
```

So `:373` stops being a tautology the moment the key fold lands - and it becomes
falsifiable by a state the implementation can actually reach, not only by a
synthetic mutant:

```
F3's paths, key fold ONLY (no display fold):
  displays=["essay","essay","essay"]              :373 holds = FALSE
F3's paths, key fold PLUS display fold:
  displays=["essay (AlvarezMaria)","essay (BrownTom)","essay (ChenLi)"]
                                                  :373 holds = TRUE
```

**The existing fixture is vacuous for the renamed claim, before AND after, and
that is why a fixture row must be added.** Measured on `utils.test.ts:362-370`'s
own four paths:

```
today:            displays=["janedoe","johndoe","marysmith","otherfile"]  unique=true
after the fold:   displays=["janedoe","johndoe","marysmith","otherfile"]  unique=true
```

- **Object:** the guard's stated purpose against what it can detect, plus its
  own falsifiability.
- **Instrument:** (a) rename the `describe` and rewrite the comment at
  `:354-359` to name KEY-TO-DISPLAY INJECTIVITY, with one sentence pointing at
  A44's own instrument for the collapse; (b) add to the existing mixed batch
  TWO per-student-foldered paths sharing one stem, which is the shape that makes
  `:373` falsifiable; (c) change NO existing assertion, so no A14 pin moves.
- **Direction of failure:** the repair is verified by mutant DISP-a (no display
  fold) going RED on `:373` for the added rows, AND by the guard still passing on
  the four original paths.
- **A41's own constraint is honoured, and here is how.**
  `docs/a41-test-notes.md:503` requires that "the F3 fixture NOT be added to
  this describe", to prove the collapse claim was MOVED OUT rather than
  re-spelled. What is added here is not F3: it is two paths with no row-count
  assertion attached, and the collapse claim itself lives in R1/R2 in a
  different file. **Specifically forbidden, unchanged from A41:** adding
  `expect(groups.length).toBe(<n>)` to this `describe`, and adding a second
  uniqueness assertion over `key` instead of `student` - which is the same
  tautology with a different field.
- **A replacement that is a new spelling of the same shape is a blocker, not a
  minor.**
- **Why not delete it:** it is the ONLY enforcer of the key-to-display
  invariant, and `gradingResultsHelpers.ts` keys stored edits on the display
  string (`:287`, `:503`, `:632`) plus the Canvas post fan-out (`:717,722,725`),
  so two rows with one display silently share one edit entry and one grade.
  `docs/loop/iteration-caps.md` disposal (d) requires naming any existing
  enforcer a withdrawal was protecting; there is no other.

---

### R10. Key-to-display injectivity, BOTH directions, and what is deliberately not pinned

- **Object:** for every fixture in 1.4 with `rowsAfter > 1`, the two maps
  key->display and display->key.
- **Instrument:** one `groupSubmissionsByStudent` call on the migrated path;
  `new Set(rows.map(r => r.student)).size` against `rows.length` for one
  direction, and the same over keys for the other.
- **Direction of failure:** RED when two rows share a display (stored edits
  collapse - P4), and RED when two rows share a key (which the `Map` makes
  impossible, so this direction is a construction check, stated as such rather
  than sold as coverage).
- **ALREADY-LANDED ENFORCERS that catch the wrong placement of the display
  fold**, named so a wave does not think it needs new ones:
  `utils.test.ts:128-131` and `:133-136` both assert
  `parseSubmissionFileName("src/main.py").studentDisplay === "main"`, with an
  explicitly empty and an omitted `zipChain`. `src/main.py`'s folder segment is
  `"src"` (measured), so **a display fold applied per-path inside
  `parseSubmissionFileName` turns those two green tests red.** The display fold
  is SET-LEVEL by necessity - it depends on whether another row would share the
  display - and those two pins are what enforce it.
- **WHAT IS NOT PINNED, deliberately: the suffix SPELLING.**
  `docs/a44-scope.md` section 10's fork (suffix `"essay (AlvarezMaria)"` versus
  the folder alone `"AlvarezMaria"`) is unresolved. No requirement in this
  document asserts the suffix form except R8's single G3 disclosure literal,
  which exists to surface the false-split's user-visible face and must be
  re-frozen in the same commit if the fork resolves the other way. Pinning the
  spelling more widely is the over-specification trap this repo has paid for
  twice.

---

### R11. The compound key's injectivity is a CONSTRUCTION, and a printable separator is not one

`docs/a44-scope.md` 2.2 states this as a requirement and explicitly does not
write the instrument. Here it is, and it is executable because I constructed the
collision:

```
x/_a::b.docx   base="_a::b"  folder="x"       sepKey="x::_a::b"   lenKey="1:x_a::b"
x::_a/b.docx   base="b"      folder="x::_a"   sepKey="x::_a::b"   lenKey="5:x::_ab"
SEPARATOR COLLIDES = true    LENGTH-PREFIX COLLIDES = false
```

`leafStemFallback` (`utils.ts:121-126`) returns the WHOLE stem when the anchored
`/^([A-Za-z0-9]+)/` match fails, so a base key can contain any character - A41's
own 13-path table records `"_draft one.docx" -> key="_draft one"`. No printable
string separator is injective against both components.

- **Object:** the keys computed for G13's two paths.
- **Instrument:** two `parseSubmissionFileName`-derived key computations on the
  migrated path; the frozen expectation is that the two keys DIFFER and that the
  set produces 2 rows with no blend.
- **Direction of failure:** RED when G13 produces 1 row. **A tuple key or any
  length-prefixed encoding passes; a `folder + "::" + base` concatenation
  fails.** This makes the collision unrepresentable rather than asserted absent,
  which is what `docs/loop/traps-spec.md` prefers over a patched assertion.
- **Forbidden:** an assertion that the separator string appears in the key. That
  pins a spelling and tells you nothing about injectivity.

---

### R12. The gates, and the two sweeps that bite

- **Object:** the repo's own byte and emoji gates over the new files.
- **Instrument:** `npm run test:paths -- src/lib/no-emojis.test.ts
  src/source-bytes.structure.test.ts`, exit code read from the command.
- **Direction of failure:** RED on any emoji, and on a materialised `\uXXXX`
  escape - the Write/Edit tools materialise such an escape as the LITERAL
  character, and `src/source-bytes.structure.test.ts` owns that scan. Do not
  hand-roll either.
- **The type gate is `npx tsc --noEmit --incremental false`, no file
  arguments, ONE caller** (it races on `tsconfig.tsbuildinfo`). vitest bundles
  rolldown/Oxc, which erases types without reading them, so a green suite is not
  a type check. **Grep the new test diff for `/s` and `/gs` before running it:**
  the dotAll flag passes vitest and FAILS tsc with TS1501, hit twice in one day
  here.
- **Comment stripping, if any test strips comments:** `.split(/\r?\n/)` plus an
  UNANCHORED `/\/\/.*$/` per line, or the
  `/\/\*[\s\S]*?\*\//g` + `/\/\/.*$/gm` pair that
  `src/lib/grade/grouping-zip-parents.wiring.test.ts:34-36` already uses (read
  this pass - it is the unanchored form and it is correct). The anchored
  `/^[ \t]*\/\/.*$/gm` form is trailing-comment-blind and has an executed defeat
  on record here.
- **Every slice needs an anchor-resolves assertion at BOTH ends.** If any
  assertion isolates a region with `indexOf` + `slice`, assert BOTH indices are
  `> -1` and that the end exceeds the start. An unresolved `indexOf` returns -1
  and `slice(start, -1)` silently widens to nearly the whole file - a defect
  already shipped here.
- **The 1000-line ceiling** (`src/file-size-ceiling.structure.test.ts:41`,
  `LIMIT = 1000`) leaves `grading.ts` 59 lines and `GradingResults.tsx` 94. A
  measurement, not a requirement of mine; it is here because a wave that ignores
  it turns the suite red for an unrelated reason and the red gets misattributed
  to A44.

---

## 3. My own attack on these instruments

Required by this seat's brief: write the passing-but-wrong implementation and run
the instrument against it. Eight were built. **Three forced NEW REQUIRED
FIXTURES, one forced a rebuilt requirement, and two mutants were rebuilt rather
than banked.**

| Passing-but-wrong implementation | Killed by | Evidence |
|---|---|---|
| **PW1** Fold only when `zipParents` is absent (round 1's own gate) | **R1 via G1, G2** | Measured: G1 stays 1 row with 3 students blended and A41 refuses nothing. Without G1/G2 this passes every other fixture |
| **PW2** Replace the key with the folder segment | **R1 via G11** | `Submissions/essay{1,2,3}.txt` goes 3 rows -> 1, blending three students. **G11 is the ONLY fixture that catches it** |
| **PW3** Fold the folder on EVERY file, not only stem-fallback ones | **R1 via G10** | `wrapA/janedoe_..._report.docx` + `wrapB/janedoe_..._report.docx` (one student) goes 1 row -> 2. **G10 is the ONLY fixture that catches it**, and I had to construct it |
| **PW4** `folder + "::" + base` instead of a length-prefixed join | **R11 via G13** | `x/_a::b.docx` and `x::_a/b.docx` collide. **G13 is the ONLY fixture that catches it** |
| **PW5** Fold the OUTERMOST path segment | **R1 via G8** | `Submissions/{AlvarezMaria,BrownTom}/essay.txt` goes 2 rows -> 1 |
| **PW6** Key edits on the ROW INDEX rather than the identity key | **R7 via P5 only** | P1's sibling sorts after Maria so her index is 0 in both runs; P5's sorts before her. **P1 alone passes this** |
| **PW7** Compute the refusal correctly and return it as `warnings` | **R5a directions 1-2** | `grading.ts:905-920` returns no `warnings` field, so `result.error` stays null and `result.run` is non-null. A leaf-only unit test passes it |
| **PW8** `expect(result.error).toContain("resolve to the same")` | **C-B** | Four appended words - " but we graded them anyway" - keep every token and invert the meaning |

**TWO MUTANTS REBUILT RATHER THAN BANKED, and one requirement rebuilt. This is
the honest record.**

1. **My first soundness definition flagged F1.** It read "every BLEND must be
   refused", and F1 - the A14 convention-branch collision - is a real BLEND that
   both rows exclude. That is a bad instrument, not a kill I was owed. Rebuilt as
   the FALLBACK-CAUSED BLEND of 1.3 plus RES-A44T-1.
2. **Mutant D-d2, "drop only the shared-one-folder condition from the amnesty",
   SURVIVES the whole fixture table - and it is EQUIVALENT, not a coverage
   gap.** Under the compound key a collision group is folder-homogeneous by
   construction (a foldered file's key is length-prefixed and an unfoldered
   file's is bare, so they cannot collide; and the join is injective), so
   `folders.size === 1` is implied by the key. Adding an assertion to kill it
   would be measuring a redundancy. **Rebuilt as D-d**, which drops the
   NON-NULL condition as well, and which fixture **G12** kills. Reported rather
   than hidden, because a kill count inflated by equivalent mutants is exactly
   the defect class this seat exists to prevent, wearing a number.
3. **My mutant harness itself was wrong on its first run and I repaired it.**
   It computed each mutant's row displays from the REFERENCE key map, so any
   mutant that changed the key produced `undefined` displays and a fabricated
   "duplicate display" kill - F7, and most of K-c/K-d/K-g, were credited as
   kills they had not earned. Repaired to recompute the display map from the
   mutant's own keyer. After the repair, K-b, K-c, K-d and K-g are each killed by
   exactly ONE fixture, which is why G10, G11, G13 exist and why the folder
   case-folding question below is NOT pinned.
4. **Mutant K-g, "do not lowercase the folder segment", is WITHDRAWN, and the
   question behind it becomes RES-A44T-5.** Measured both ways:

   ```
   TWO students in case-variant folders (AlvarezMaria/ and alvarezmaria/)
     LOWERCASED : rows=1 blend=1 split=0
     CASE-EXACT : rows=2 blend=0 split=0
   ONE student in case-variant folders
     LOWERCASED : rows=1 blend=0 split=0
     CASE-EXACT : rows=2 blend=0 split=1
   ```

   Perfectly symmetric: lowercasing is right for one student and wrong for two;
   case-exact is the reverse. **There is no verdict I can justify from the tree,
   so no fixture freezes one, and K-g therefore survives DELIBERATELY.** Saying
   so is the requirement; quietly picking a side and freezing it would be an
   instrument asserting a decision nobody made.

---

## 4. Satisfiability: these requirements can all be met at once

A set of requirements is not a specification until something has passed it.

**Reference implementation, built and run in the scratchpad**, driving the REAL
`parseSubmissionFileName`/`getBaseFileName`/`groupSubmissionsByStudent` and the
REAL `seedEdits`/`mergeStoredRowEdit`/`loadPersistedEdits`:

> **KEY:** compute the identity exactly as today; when the identity resolved via
> step 5 or step 6 AND the file has a non-empty immediate folder segment,
> replace the key with `String(seg.toLowerCase().length) + ":" +
> seg.toLowerCase() + baseKey`.
> **DISPLAY:** the bare display, suffixed ` (<folder segment verbatim>)` only
> when 2 or more rows in the same grouping call would otherwise share it.
> **DECISION:** collect the fallback-reaching files' collision groups on the
> compound key; grant amnesty to a group all of whose files share one non-null
> folder, but only when the run's fallback-reaching population shows 2 or more
> distinct folder segments; REFUSE iff any group survives.
> **STORAGE:** the edits dictionary keyed on the identity key.

Scored against every frozen literal this document hands over, asserted
individually:

```
SATISFIABILITY SCORE: 173 pass / 0 fail  (total 173)
```

The 173 breaks down exactly, so the number is auditable rather than impressive:
23 fixtures times 7 assertions each (the calibration control plus `rowsToday`,
`rowsAfter`, `fbBlendAfter`, `SPLIT`, `DECISION` and `displaysUnique`) = 161,
plus R11's injectivity pair = 163, plus R7's P1 and P5 each asserted three ways
(key-unchanged precondition, display-keyed must LOSE, key-keyed must KEEP) = 169,
plus R9's four falsifiability facts = 173.

**No criterion here is unsatisfiable, and R2's two directions are simultaneously
satisfiable rather than in conflict on the nine required shapes.** The ONE
criterion that no implementation I can write satisfies is R2's tenth shape at
zero WHILE R3 passes - and that is a measured structural limit with a decision
attached (section 13), not an impossible assertion I am handing to an
implementer.

**This is not a design ruling.** The architect may compute any of the four parts
differently; the frozen oracles are unchanged and any mechanism must pass them.

**What satisfiability was NOT proven for:** R5, R6, R8 and the executable half
of R7's helper coverage. Those need test files inside `src/`, outside this
pass's one-file write set. They are labelled ARGUED in section 8 with the landed
precedents that make them constructible.

---

## 5. The frozen refusal string

The wording is the architect's and the owner's to set; section 2's R8 freezes
the BINDINGS, which are the actual requirement. What is frozen HERE is the
instrument's shape:

1. One frozen literal per fixture, written out in full in the test body.
2. `toBe`, never `toContain`, never a regex.
3. The SAME literal asserted on R5a and R5b, so the two provider branches cannot
   drift into two sentences for one condition.
4. A frozen literal for each of the two refusal VARIANTS (`no-folder-signal`,
   `flat-collision-in-foldered-run`), for the multi-group case, and for the
   >5-path case.
5. The whole unattended report LINE asserted by equality on all three callers
   (R5c), not just the inner string.
6. No assertion anywhere that the string exists in any SOURCE file.

A candidate, offered for the architect and owner to overwrite, with the clause
bindings that are the requirement:

> `Refused: 2 files in folder "AlvarezMaria" resolve to the same student name
> "Homework", so they would have been graded together as one row:
> AlvarezMaria/Homework Final.docx, AlvarezMaria/Homework Draft.docx. This
> archive has no other student folders, so the folder name is not enough to tell
> these apart. Put each student's files in their own folder inside the zip, or
> rename each file to studentname_date_time_filename, then upload again. No
> grades were produced.`

| Clause | Bound to | Forbidden alternative and why |
|---|---|---|
| `2 files` | the colliding group's path count | not `Object.keys(submissions).length`; not the zip's entry count, which does not exist |
| `folder "AlvarezMaria"` | the group's folder segment, verbatim, quoted and labelled | not the bare name - it reads as a student (C-D) |
| `resolve to the same student name "Homework"` | `studentDisplay` for that group | not "are the same student" - the app does not know that (C-F) |
| the path list | the group's full paths | NOT `submittedFiles[].name`, which is the bare leaf name and tells the instructor nothing |
| `no other student folders` | the run gate's own distinct-folder count | must not appear on the `flat-collision-in-foldered-run` variant, where it is false |
| `one row` | the counterfactual grouping, singular, per group | not "N submissions" - a student count under a synonym (C-A) |
| the instruction | measured to change the outcome: `flat` 11550 refusals vs `folder` 0 after the fold | must not tell the reader to check a list the unattended callers never show |
| `No grades were produced.` | `result.run === null` | must not appear on any path that does grade (C-E) |

---

## 6. Sabotage protocol

Non-negotiable, and written so an implementer cannot substitute a description for
a result.

### 6.0a Every requirement has a family, and here is the map

Checkable at a glance, because a requirement with no sabotage is a requirement
nobody has watched fail.

| Requirement | Sabotage family and members | A member that discriminates NOTHING |
|---|---|---|
| R1 frozen oracle | M-KEY a-g, M-DECIDE a-g, M-MERGE b, c | M-KEY h (deliberate), M-MERGE a (for the row count) |
| R2 soundness | M-DECIDE c (the headline), M-KEY a, f; M-SWEEP a, b, c, d | M-DECIDE rebuilt member; M-DECIDE g (duplicate of c) |
| R3 the row's pass condition | M-DECIDE c, e, g; M-SWEEP b, c | - |
| R4 false split | M-KEY a, g; M-SWEEP b, c | - |
| R5 emitted by the producer | M-WIRE a-e, g | - |
| R6 must not fire where nothing was at risk | M-WIRE f | - |
| R7 identity-key persistence | M-PERSIST a, b, c | M-PERSIST d (it mutates the test) |
| R8 the copy | M-COPY a-i | M-COPY i at vitest (tsc only) |
| R9 the repaired guard | M-DISPLAY a; M-MERGE b | - |
| R10 key-to-display injectivity | M-DISPLAY a, b | the key direction is a construction check, not coverage |
| R11 key injectivity | M-KEY d | - |
| R12 gates | the gates are their own instrument; M-COPY i is the tsc member | - |

### 6.0 Mechanics

- **Back up by `cp` before mutating and restore by `cp`. NEVER
  `git checkout -- <path>`**: the file may be uncommitted and checkout reverts it
  to the index, destroying the chunk's work. One backup per file, named
  `<file>.a44sab.bak`, deleted only after the restore is verified by
  `diff --strip-trailing-cr <file> <file>.a44sab.bak` exiting 0, with the exit
  code read from the command.
- **No two agents may sabotage-verify on the tree at once.** Confirm no sibling
  is mid-sabotage before starting.
- **Every anchored literal must be proven to occur EXACTLY ONCE in its file
  before it is used as an edit anchor, with the count printed:**
  `grep -c "<literal>" <file>` must print `1`. A measured counter-example from
  this pass: `lines.push(\`${drop.name}: ${errorMsg}\`)` occurs at BOTH
  `steps.grading-cartridge.ts:111` and `:238`, so it is NOT a usable anchor.
- **A mutation must not destroy the anchor the test searches for.** Before
  mutating a file any source-text test reads, check the mutation leaves that
  test's anchors resolvable - otherwise the test can go GREEN on the exact
  mutation it exists to catch.
- **VERBATIM output is required.** For each member, paste the vitest failure
  block INCLUDING the `expected` and `received` values and the test name. A
  sentence saying a test "went red" is not a result. Then paste the post-restore
  green line with its exit code read from the command.
- **State for each member whether you expected it to discriminate.** A mutation
  red in both directions, or green in both, discriminates NOTHING and is worse
  than none because it reads as coverage.
- **A SABOTAGE THAT STAYS GREEN IS A FINDING TO TRACE, NOT A MUTATION TO SWAP
  OUT.** This session found a live tokenizer defect precisely by tracing a
  green sabotage instead of replacing it. Three outcomes are legitimate: the
  test is weak (add the fixture named below), the mutant is equivalent (say so,
  as D-d2 is below), or the PRODUCTION CODE already has a defect that makes the
  mutation a no-op - and the third is the one worth finding. Trace it before
  touching either side.

### 6.1 Family M-KEY - the identity key

Mutate whichever file holds the fold. **Every member must be applied**, and the
fixture named as its killer is the one that must go RED. Discrimination was
pre-verified against the reference implementation this pass (section 3), so a
surviving member means either the implementation diverges from the reference or
the fixture was not written.

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | never fold (return the bare key) | R1 via F3, F8, G1, G2, G3, G5, G8, G12; R2's `folder` and `nested-bulk` zeros | yes, broadly |
| b | fold on EVERY file, dropping the stem-fallback condition | R1 via **G10 only** (rowsAfter 1 -> 2, SPLIT 0 -> 1) | yes, and G10 is the ONLY killer |
| c | replace the key with the folder segment | R1 via **G11 only** (rowsAfter 3 -> 1, blend 0 -> 1) | yes, and G11 is the ONLY killer |
| d | `folder + "::" + base` instead of a length-prefixed join | R11 via **G13 only** (rowsAfter 2 -> 1) | yes, and G13 is the ONLY killer |
| e | fold the OUTERMOST segment instead of the immediate parent | R1 via G1, G2, G8 | yes |
| f | gate the fold on A41's discriminator (empty `zipChain`) | R1 via **G1, G2 only** | yes - this is round 1's own rejected gate, and only the nested fixtures see it |
| g | fold the leaf STEM instead of the folder | R1 via F3, F4, F6, F8, G1, G3, G5, G8, G12 | yes, broadly |
| h | do not lowercase the folder segment | **NOTHING - deliberately.** See section 3 item 4 and RES-A44T-5 | **NO, and that is the finding: the correct verdict depends on an undecided question, so no fixture pins it** |

### 6.2 Family M-DECIDE - the refusal predicate

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | always ALLOW | R1 via F4, F6, F9, G4, G9, G12; R2's first direction on `flat`, `shared-wrapper-folder` | yes |
| b | always REFUSE | R1 via F1, F2, F3, F5, F7, F8, F10, G1, G2, G3, G5, G7, G8, G10, G11, G13; R2's second direction | yes |
| c | drop the run gate (RULING 85's literal amnesty) | R1 via **F6 and G4 only**; R2's `shared-wrapper-folder` zero goes to **11550** | yes, and this is THE most important member here - it is the mechanism RULING 87 exists to replace |
| d | grant amnesty on the run gate alone, dropping BOTH the shared-folder and the non-null condition | R1 via **G12 only** | yes, and G12 is the ONLY killer |
| e | require 3 or more colliding paths | R1 via F4, F6, F9, G4, G9, G12 | yes |
| f | compare full BASE NAMES instead of keys | R1 via F3, F4, F6, F8, G1, G3, G4, G5, G8, G9 | yes, broadly |
| g | set the run gate at 1 or more distinct folders instead of 2 | R1 via F6 and G4 | **yes but it is a DUPLICATE of (c)**: for a set with no folder the amnesty condition already fails, so (c) and (g) are the same predicate. Recorded so nobody counts it as a second kill |
| **REBUILT** | drop ONLY the one-shared-folder condition, keeping non-null | **nothing - EQUIVALENT under the compound key**, see section 3 item 2 | **NO.** Not a coverage gap. Do not add an assertion to kill it |

### 6.3 Family M-DISPLAY - the display fold

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | no display fold at all | R10 / the repaired `utils.test.ts:373` via F3, F8, G1, G2, G3, G5, G8, G12; and R7's P4 (`seedEdits` keys drop below `results.length`) | yes - and it is B2(a)'s state, the one a key-only wave ships |
| b | apply the fold per-path inside `parseSubmissionFileName` | the ALREADY-LANDED `utils.test.ts:128-131` and `:133-136` (`"src/main.py"` -> `"main"`) | yes, via landed pins, so no new test is needed for it |
| c | suffix with the folder LOWERCASED | R8's G3 disclosure literal only | yes, weakly - and note it is a spelling, so it is the one member whose RED is acceptable if the fork resolves differently, in which case the literal is re-frozen in the same commit |

### 6.4 Family M-WIRE - the refusal never reaches a surface

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

### 6.5 Family M-PERSIST - the saved edit

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | key stored edits on the display string (today's behaviour) | R7's P1 AND P5 | yes |
| b | migrate only when the display is UNCHANGED | R7's P1 and P5 | yes - this is the withdrawn round-1 instrument, and it passes its own old test by construction |
| c | key stored edits on the ROW INDEX | R7's **P5 only** | yes, and P5 is the ONLY killer - see section 3 PW6 |
| d | drop the key-unchanged precondition assertion from the test itself | **nothing** | **NO** - it mutates the TEST, not the implementation. Listed so nobody substitutes it: deleting an assertion proves only that the assertion runs |

### 6.6 Family M-MERGE - the collapse itself

Mutate `src/lib/grade/utils.ts`. These exist to prove R1's `rowsToday` column
measures the merge and not a proxy.

| # | Mutation | Expected effect | Discriminates? |
|---|---|---|---|
| a | delete `existing.files.push([filePath, content])` at `utils.ts:315` | `rowsToday` for F3 stays 1; `mergedFileCount` drops to 1 | **NO for the row count** - and saying so is the point: the count alone does not measure the merge, which is why R1 also carries `fbBlend` recovered by content MARKER |
| b | suffix the key at `:308` (`inferred.key + String(grouped.size)`) | F3's `rowsToday` 1 -> 3, and three rows share the display `essay` | yes, and it is the mutation that proves `:373` is falsifiable at all |
| c | key on `filePath` instead of `inferred.key` at `:305,308` | F3's `rowsToday` 1 -> 3, and several of `utils.test.ts`'s 28 A14 pins go red | yes, but NOISY - it breaks the A14 order too, so weaker evidence than (b) |

Every member must be restored by `cp` before the next family runs. `utils.ts` is
read at 50+ sites; a mutation left in place is a repo-wide hazard, and a killed
agent mid-sabotage has already left one here once.

### 6.7 Family M-COPY - the sentence

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | change a number's source: report `Object.keys(submissions).length` where the colliding group's size belongs | R8's equality on R5a | yes |
| b | swap a noun: `files` -> `submissions`, or -> `students` | R8's equality | yes, and C-A is the reason the noun matters |
| c | append a clause the app does not act on (" - check your filenames") | R8's equality | yes, and **ONLY because the assertion is `toBe`**; under `toContain` it survives, which is the C-B proof and the reason equality is mandatory |
| d | drop the word `folder` before the quoted folder name | R8's equality, and specifically its C-D clause | yes - and this is the A44 form of the "course name interpolated where it reads as a time" defect, so it is the most important member here |
| e | emit the `no-folder-signal` sentence on a `flat-collision-in-foldered-run` set | R8's G12 literal | yes, and **G12 is the ONLY fixture that catches it**; a single-sentence refusal passes every other copy assertion |
| f | name only the first colliding group on the multi-group fixture | R8's multi-group literal | yes |
| g | change the sentence on the embedded branch only | R8 via R5b, because the SAME literal is asserted on both branches | yes - this is what stops two branches drifting into two sentences for one condition |
| h | emit the refusal through the unattended report line with the inner string truncated | R5c's three whole-line literals | yes, and only whole-line equality catches it |
| i | add a new refusal variant to the discriminated union with no sentence | **`npx tsc --noEmit --incremental false`, NOT vitest** | yes at tsc, **NO at vitest - state this explicitly**, because a green suite here proves nothing. This is the whole point of C-C's `default`-less switch |

### 6.8 Family M-SWEEP - the sweep's own honesty

The sweep is an instrument and gets sabotaged too, or its zeros are decoration.

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | recover a row's files by NAME instead of by content marker | R2's zeros become meaningless; the F3 trace shows three files all named `essay.txt`, so ownership recovery silently returns one owner | yes - assert in the test that F3's three `submittedFiles` names are identical, so the name-based recovery is provably impossible |
| b | change the seed | every frozen count moves | yes, and it is why the seed is a literal in the test, not an env var |
| c | reduce `SWEEP_N` without re-measuring | the frozen counts | yes - and a stale count is a finding, not a tolerance |
| d | drop `shared-wrapper-folder` from the shape list | nothing in the suite | **NO, and that is the hazard**: the shape list is a hand-written array. Assert its LENGTH and its exact members as a frozen set, the `headless.test.ts` idiom, so removing a shape is a visible test change |

---

## 7. What an implementer must not do

- **Do not import a helper from another `*.test.ts`.** It re-runs that file's
  `describe` blocks under the wrong setup. Duplicate the generator and the
  fixture table.
- **Do not mock `fetch`.** Mock `callLlm` from `@/lib/llm`. `vitest.setup.ts`
  throws on any unmocked `fetch`, and that throw is load-bearing.
- **Do not loosen a structural gate to let a test import an internal.** If a
  gate blocks the import, drive the production path - `gradeAction` for the
  refusal, `step.run` for the unattended lines, `groupSubmissionsByStudent` for
  the grouping. All three are drivable today with landed precedents.
- **Do not assert a rate.** Assert the integers.
- **Do not add an assertion to kill a surviving mutant before tracing why it
  survived.** Section 6.0's third rule.

---

## 8. Executable here versus argued

| Item | Status |
|---|---|
| The frozen oracle 1.4, all 23 fixtures, six columns each | **EXECUTED** over the real parser and grouping, diffs in 0.1 |
| The calibration control, per fixture | **EXECUTED**, 0 mismatches of 24 |
| The eleven-shape sweep 1.5, seed 20260927 | **EXECUTED** |
| The generator's calibration against A41's published baseline | **EXECUTED**, 14.5% reproduced exactly as a percentage |
| RULING 85's literal amnesty is unsound at 11550 of 11550 on `shared-wrapper-folder` | **EXECUTED** |
| RULING 87's refined amnesty is unsound at 2159 of 19927 on `mixed-perstudent-plus-shared-dropbox` | **EXECUTED** |
| The corroboration variant reaches 0 unsound at 24.0% conservative | **EXECUTED** |
| `nested-bulk-perstudent-folders` is 100% silent harm today | **EXECUTED** |
| R7's P1/P2/P4/P5 against the REAL `seedEdits`/`mergeStoredRowEdit`/`loadPersistedEdits` | **EXECUTED** |
| R11's separator collision (G13) | **EXECUTED** |
| R9's four falsifiability facts, including that the landed fixture is vacuous both before and after | **EXECUTED** |
| Mutant discrimination for every member of 6.1, 6.2, 6.3 against the reference | **EXECUTED** |
| Satisfiability, 173/173 | **EXECUTED** |
| Baseline 59 tests green with the defect live | **EXECUTED**, exit code from `$LASTEXITCODE` |
| The corrected 43-site census and the 13 sites the enumerating regex cannot see | **EXECUTED** grep with two canaries, including one on the filter chain |
| The `warnings` absence in the three workflow callers | **EXECUTED** grep with a positive canary |
| The channel facts (`grading.ts:905-920,921-924`, `llm-provider.ts:14,16-20`, `GradingTab.tsx:262-266,502-511`, the three `.error` reads) | **READ**, every `file:line` opened this pass |
| `extraction.test.ts:189-190` and `:207-208`, the emitted-shape facts | **READ**, and both are inside the 59 green tests |
| `steps.grading-cartridge.test.ts:133` executes `step.run` with `gradeAction` mocked | **READ** - this is what makes R5c executable rather than a wiring check |
| **R5a, R5b, R5c, R6 - that driving the producer emits the refusal** | **ARGUED.** Not run: needs test files in `src/`, outside this pass's one-file write set. The argument rests on EXECUTED facts - `grading.budget.test.ts:88-94,105,129` already imports `gradeAction`, drives it with a real `FormData` and asserts the returned `error`; `extraction.test.ts:246-271` already drives a real nested JSZip with nothing mocked; `steps.grading-cartridge.test.ts:133` already executes a step with `gradeAction` mocked. All three are inside the green suite. The specific assertions have NOT been observed passing or failing |
| **R8 - the copy** | **ARGUED.** The bindings table's "not available" rows are READ from `extraction.ts:83-85` and `:137`; none was executed, because `extraction.ts` cannot be imported under `node --experimental-strip-types` (it imports `jszip`, `../canvas`, `../office-extract` by extensionless specifier). The executable version is RES-A44T-3 |
| **R7's helper coverage for `buildCsvContent`, `fanOutGradingPostResult`, `correctUngradedSeeds`** | **ARGUED as tests, EXECUTED as facts**: all three are exported from plain `.ts` files and key on the display string, which I read. I did not drive them |
| What an instructor SEES on screen, and all 34 `GradingResults.tsx` sites | **NOT VERIFIABLE HERE.** vitest is node-env, `include: ["src/**/*.test.ts"]`; no component is rendered by any test in this repo. RES-A44T-4 |
| Whether real instructors' zips take any of these eleven shapes at the assumed frequencies | **NOT VERIFIABLE HERE.** Every rate above is a property of the published generator, not of real uploads. RES-A44T-2 |
| Whether any model call ever populates `inferredLookup` in production | **NOT VERIFIABLE HERE.** No API keys in this checkout; `vitest.setup.ts` throws on real `fetch`. Every instrument assumes the degraded (empty-lookup) case |

---

## 9. What I could not determine

- **Whether the folder segment should be lowercased in the key.** Measured
  symmetric, section 3 item 4. No fixture pins it and mutant K-h therefore
  survives. RES-A44T-5.
- **Whether the display fold should suffix or replace.**
  `docs/a44-scope.md` section 10's fork. R10 pins nothing about the spelling
  except R8's single G3 disclosure literal.
- **Where the decision should live** - in the lib (`gradeSubmissions` /
  `extractStudentEntries`) or in `gradeAction`. R5a/R5b are written to be
  indifferent: both drive `gradeAction` and assert the RETURNED value. If the
  architect places it in the lib, `engine.ts:443`'s existing throw is the
  precedent and its message reaches `state.error` verbatim through
  `grading.ts:921-924`.
- **Whether the refusal fires before or after the model call.**
  `engine.ts:431` calls `inferFileNameConvention` BEFORE
  `groupSubmissionsByStudent` at `:432`, so a refusal computed after grouping has
  already spent one model call on the default path. No requirement here depends
  on the answer, but "zero model spend on a refused zip" is a claim `:431`
  falsifies.
- **Whether a real submissions zip ever produces two students under one folder
  name.** The A14 file-name version of that collision is pinned as current
  behaviour at `utils.test.ts:326-334`, so the CLASS is real in this tree; the
  folder-level frequency is not measurable here. It is the load-bearing input to
  section 13's fork, and RES-A44T-2 owns it.

---

## 10. Residual register

Each names an owner, an instrument, an object with a direction of failure, and a
step. An entry missing any of those is a deletion, and I call it that.

| id | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| RES-A44T-1 | F1 survives: the A14 sanitized-name collision is a real cross-student collapse that this branch ALLOWS by design, because it resolves at step 2 where no version of A44's fold reaches. | the chunk whose write set includes `src/lib/grade/utils.ts:87-119`, or a new backlog row | F1, asserted ALLOW in R1 | F1's emitted verdict. **RED if a later change makes F1 REFUSE without a decision to widen A44's scope**, and equally a finding if A44 is closed while claiming it closed every cross-student collapse. | At the push that reconciles A44. |
| RES-A44T-2 | Every rate in 1.5 is a property of the published generator. The `mixed-perstudent-plus-shared-dropbox` shape's real-world frequency is the load-bearing unknown in section 13's fork, and the shape most likely to occur (two students under one folder name) is the folder-level form of a defect A14 left open. | the repo owner | none available in this checkout - no live uploads, no analytics | Real-world shape frequency. **Not verifiable here at all.** | **Owner-only backlog escalation, not an agent task.** Listed so the fork's cost is not mistaken for a measured probability. |
| RES-A44T-3 | The copy constraint "no quantity equals the zip's entry count" is READ, not executed: `extraction.ts` cannot be imported under `node --experimental-strip-types`. | the wave whose write set includes `src/lib/grade/extraction.test.ts` | an assertion over `extractSubmissions` on a real zip containing one unsupported extension and one unreadable `.docx`: compare `Object.keys(submissions).length`, `attemptedSupportedFiles` and `failedSupportedFiles.length` against the archive's entry count | The three numbers against the entry count. **RED if any equals the entry count**, which would mean R8's binding table is wrong and the sentence may name a total. | The wave that writes the refusal copy, before the string is frozen. |
| RES-A44T-4 | All 34 `GradingResults.tsx` display-keyed sites, including the bulk post fan-out (`:332-395`) and the single-row post path (`:427-500`, absent from the prior census entirely), are reading claims. That newly separated rows render as distinct, independently editable rows (`:635`'s `<tr key={\`${result.student}-matrix\`}>`) is unverified. | the repo owner (browser check) - this environment renders no component | upload a folder-shaped zip with the fix live; inspect the table; edit one row's grade; post one row to Canvas | What is on screen and what Canvas receives. **FAILS if editing one row affects another, if fewer than the expected rows appear, or if two rows' post statuses collide.** | Owner verification, after the display-fold wave lands. Blocks nothing. |
| RES-A44T-5 | Whether the folder segment is lowercased in the key is undecided, measured symmetric (section 3 item 4), so no fixture pins it and mutant K-h survives deliberately. | the architect pass consuming this document | the two frozen case-variant pairs in section 3 item 4, re-run against whichever reading is chosen | The chosen reading's row/blend/split triple. **RED if A44 ships with neither reading pinned by a fixture** - an unpinned case-folding choice is a licence to change it silently, and it changes who shares a graded row. | The architect pass, before the key-fold wave. |
| RES-A44T-6 | `src/app/actions/grading.ts` is at 941 of a 1000-line ceiling (59 lines of headroom) and `GradingResults.tsx` at 906 (94), and both are where this row's wiring goes. | the wave whose write set includes either file | `@(Get-Content <file>).Count` before and after | The count. **RED at 1000 or above.** | The wave gate of whichever wave writes either file. |
| RES-A44T-7 | The 30-site display-keyed census both prior artifacts rely on is short by 13; the corrected count is 43 (section R7). Anything already scoped against 30 is scoped against the wrong set. | the wave plan and architect passes consuming `docs/a44-scope.md` | the construction-based grep in R7, with its two canaries | The site set. **RED if any artifact downstream still says 30**, and a finding if a wave's write set was sized against 30. | Before the storage wave's write set is fixed. |

---

## 11. Corrections to the inputs, measured

Three places where my measurements contradict a document I was told to treat as
fact. Each is stated with the command, not as an opinion.

1. **`docs/a44-scope.md` 2.2 is WRONG about `src/otherfile.py`, and it matters
   because that path is inside the fixture of the guard A44 repairs.** The scope
   says it "reaches step 6 with an empty chain and no folder segment (single path
   component)". Measured:

   ```
   src/otherfile.py   folderSegment = "src"   step=6   fb=true
                      todayKey = "otherfile"  compound = "3:srcotherfile"
                      KEY CHANGES UNDER THE FOLD = true
   ```

   It has two path components and the fold DOES apply. The scope's CONCLUSION
   survives - `utils.test.ts:373`'s assertion is unaffected, because the display
   does not change and the four displays stay unique either way (measured in
   R9) - but its stated reason is false, and `docs/a44-check.md` m5 was right.
   Anyone reasoning from the scope's sentence rather than from the measurement
   will conclude the fold cannot touch a single-folder path, which is wrong.

2. **The 30-site display-keyed census is short by 13.** Section R7 gives the
   corrected instrument, the corrected count (43 in the three grading-results
   files), and the two omissions that change what is testable and what is at
   risk. RES-A44T-7.

3. **`docs/a44-check.md` cites `docs/a41-test-notes.md:213` for F6's frozen
   REFUSE.** Line 213 is F1's row; F6 is at `:218`, which is what
   `docs/a44-scope.md` cites correctly. Trivia, recorded because I opened both.

One thing I checked and did NOT find wrong: every A41 citation the scope makes
(`:218`, `:309`, `:358-359`) is correct, opened this pass.

---

## 12. Gate run and tree state for this pass

```
$ npm run test:paths -- src/lib/grade/utils.test.ts src/lib/grade/extraction.test.ts
    src/lib/grade/single-file-entry.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts
 Test Files  4 passed (4) / Tests  59 passed (59)
TESTPATHS_EXITCODE=0
```

`npx tsc --noEmit` was deliberately NOT run: I wrote no TypeScript into the
tree, `docs/loop/this-repo.md` reserves that command to exactly one caller
because it races on `tsconfig.tsbuildinfo`, and a sibling was live.

**Tree state, read TWICE, because the tree moved under this pass.** Before this
file was written:

```
$ git status --short
 M docs/css-orphans.md
?? .a44plan/
```

And after writing it, the live sibling having finished in between:

```
$ git status --short
 M docs/css-orphans.md
?? docs/a44-test-notes.md
?? docs/a44-waves.md
```

`docs/a44-test-notes.md` is **this pass's only entry, in both readings.** Every
other line is sibling-owned: `docs/css-orphans.md` belongs to another row and was
not touched here; `.a44plan/` was the wave-plan sibling's own scratch directory
and disappeared between the two readings because that sibling removed it, not
because anything here touched it; and **`docs/a44-waves.md` appeared between the
two readings and was written entirely by that sibling - I never created, read or
edited it.** Nothing in this document was derived from it, and if it contradicts
anything here, that is a cross-artifact question for the orchestrator, not
something either pass could have seen.

**Nothing under `src/` was written or mutated by this pass**, and no `git stash`,
`git add -A` or `git checkout --` was run at any point. My harness lived entirely
in the session scratchpad OUTSIDE the repository, so there was no in-tree scratch
directory to remove - verified rather than asserted:

```
$ for d in .a44tn .a44chk .a44rev .a44notes; do ls -d "$d"; done    # each exit=2
$ ls -d docs                                                        # CANARY, exit=0
```

Byte hygiene on the write, beyond the gate above: no BOM
(`head -c 3` is `#`, ` `, `A`; `grep -c` for U+FEFF exits 1), LF line endings
throughout.

---

## 13. The one question, shaped so every answer ends this activity

Not blocking. Everything above ships as it stands under any answer; the frozen
oracles do not move, only which integer R2's tenth shape and R3 are frozen at.

> **RULING 87's refined amnesty is sound on nine measured shapes and UNSOUND on
> a tenth I built to attack it: 2159 of 19927 sets (10.8%) where a real
> cross-student blend is silently allowed. The shape is "two students share one
> folder, in a zip that also has per-student folders" - either a shared drop
> folder, or two students whose folder names are identical, which is the A14
> sanitized-name collision moved from the file name to the folder name, and
> A14's file-name version is PINNED AS CURRENT BEHAVIOUR in this tree
> (`utils.test.ts:326-334`). Frozen instances G5 and G6.**
>
> **I attempted the one further construction the iteration cap allows, changing
> KIND rather than strength: require CORROBORATION - grant folder amnesty only
> when two or more distinct folders in the run each carry a collision. Measured,
> it reaches ZERO unsound on all ten shapes and keeps F6 REFUSE. It also raises
> the conservative refusal rate on `folder-resubmit` from 6.4% to 24.0%, which
> is worse than the 14.5% baseline the row was filed to lower - so it FAILS the
> row's own pass condition (R3) while satisfying the soundness one (R2).**
>
> Neither mechanism does both, and a third attempt on this class is forbidden by
> `docs/loop/iteration-caps.md` cap 1.
>
> Pick ONE. Each ends this activity; these notes ship as they stand with the
> answer applied and everything unresolved recorded as a residual above.
>
> **(1) SHIP RULING 87 AS IT STANDS.** R2's tenth shape is frozen at exactly
> **2159**, RED on any change in either direction, and the number goes in the
> shipping report. R3 passes: 2891 -> 1278, 14.5% -> 6.4%. What you are buying:
> real harm goes to zero on five shapes including two that are 100% silent
> today, the false-refusal rate more than halves, and one constructed shape
> keeps a silent blend at 10.8%. Cost of being wrong: an instructor whose class
> has two same-named student folders, or one shared drop folder, gets a blended
> grade with nothing to warn them - the exact defect class A41 exists to
> prevent, at a smaller rate than RULING 85's literal version but not zero.
>
> **(2) SHIP THE CORROBORATION VARIANT.** R2's tenth shape is frozen at **0**,
> nine shapes plus the tenth all sound. R3 FAILS and is re-frozen at 2891 ->
> 4791 (14.5% -> 24.0%) as a recorded, accepted regression, which means the
> row's stated purpose is not merely partly achieved but reversed. Cost of being
> wrong: instructors hit a false refusal on well-organised folder zips
> two-thirds more often than before A44, and the row filed to fix that made it
> worse - while the harm it also fixes (five shapes to zero) is real and
> unchanged.
>
> **(3) SPLIT: SHIP (1) NOW, FILE THE SOUNDNESS GAP.** R2's tenth shape frozen
> at 2159 with a new backlog row for "a folder is not trusted as a student
> unless something outside the paths corroborates it" - the roster, `studentRepos`,
> or a Canvas user list, none of which the zip path reads today. Cost of being
> wrong: one more row that may never be worked, and 10.8% of that shape stays
> silent until it is.
>
> **My recommendation: (3), and (1) if you want one decision rather than two.**
> The measured asymmetry is that (1)'s failure needs a specific, uncommon input
> (two students under one folder name) while (2)'s failure is the ORDINARY
> folder zip with resubmissions - and a refusal is a strictly better failure
> than a wrong grade, but 24.0% of well-organised uploads being refused is the
> thing this row was filed to stop. (3) keeps the measured win, records the
> measured gap as an exact integer in the suite rather than a sentence in a
> document, and puts the only fix that could reach zero without a rate penalty -
> a signal from outside the file paths - where it belongs. Cost of being wrong
> about (3): the row closes with a known 10.8% on a constructed shape whose real
> frequency nobody here can measure, which is RES-A44T-2 and is honest rather
> than hidden.
