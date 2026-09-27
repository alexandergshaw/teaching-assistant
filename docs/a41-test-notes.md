# A41 test notes: instruments, frozen oracles and the sabotage protocol

Seat: `loop-test-author`. Written 2026-09-27. Write set for this pass was exactly
this one file; `git status --short` is in section 12.

This document decides WHAT IS MEASURED and HOW IT FAILS for backlog row A41.
It does not decide the mechanism, the wave order or the write sets - a separate
seat owns those, and nothing here may be read as a wave plan.

**Branch this is written against: RULING 69 - A41 REFUSES.** When the parse
collides, the run refuses with a counted, named reason, and identity resolution
is NOT changed. Every instrument below is written against a refusal. No
instrument here requires `groupSubmissionsByStudent`'s output shape to change,
because no wave under this ruling rewrites that function. That is the direct
repair of the withdrawn T1 (`docs/a41-check.md` B3), whose pass state was
unreachable on this branch.

**Withdrawn inputs.** `docs/a41-scope.md` sections 6.5, 6.6 and 7.1 are
withdrawn and are not carried forward. Its sections 1, 2, 3 and 6.1-6.4 are used
as facts, each re-measured here. Its candidate sentence at `:648` ("Read 14
files and grouped them into 9 submissions") is withdrawn per the check's B5 and
is replaced in section 5.

---

## 0. How every number in this document was produced

### 0.1 Executing the real parser over a scratchpad copy

No production or test file was mutated. `src/lib/grade/utils.ts`,
`src/lib/grade/constants.ts` and `src/lib/grade/types.ts` were copied into the
session scratchpad and driven with `node --experimental-strip-types`
(`node --version` -> `v22.14.0`). The copies differ from the real files only in
import specifiers, and the full diff is recorded here rather than described:

```
$ diff --strip-trailing-cr src/lib/grade/utils.ts <scratchpad>/g/utils.ts
1,3c1,3
< import type { SubmittedFileInfo, InferredFileNameLookup } from "./types";
< import type { CodeRunResult } from "../code-runner";
< import { getMimeType } from "./constants";
---
> import type { SubmittedFileInfo, InferredFileNameLookup } from "./types.ts";
> import type { CodeRunResult } from "./code-runner-stub.ts";
> import { getMimeType } from "./constants.ts";
utils diff exit=1

$ diff --strip-trailing-cr src/lib/grade/types.ts <scratchpad>/g/types.ts
1c1
< import type { CodeRunResult } from "../code-runner";
---
> import type { CodeRunResult } from "./code-runner-stub.ts";
types diff exit=1

$ diff --strip-trailing-cr src/lib/grade/constants.ts <scratchpad>/g/constants.ts
constants diff exit=0
```

Two of the three changed lines are `import type` (erased before execution); the
third is the same module under a suffixed specifier. `code-runner-stub.ts` is
`export type CodeRunResult = Record<string, unknown>;` - a type-only stand-in for
a type-only import. **No executable line of `parseSubmissionFileName`,
`leafStemFallback`, `matchStudentFileConvention`, `getBaseFileName` or
`groupSubmissionsByStudent` differs from the tree.**

CANARY for the diff instrument: `constants.ts` is byte-identical and exits 0
while the other two exit 1, so exit-1 reports a real difference rather than
always firing.

### 0.2 Reading, with `file:line`

Every citation below was opened this pass against the current tree. Sizes, by
`@(Get-Content <file>).Count` in PowerShell (`Measure-Object -Line` was not
used):

| File | Lines |
|---|---|
| `src/lib/grade/utils.ts` | 393 |
| `src/lib/grade/utils.test.ts` | 390 |
| `src/lib/grade/extraction.ts` | 300 |
| `src/lib/grade/extraction.test.ts` | 271 |
| `src/lib/grade/engine.ts` | 517 |
| `src/app/actions/grading.ts` | 941 |
| `src/app/actions/grading.budget.test.ts` | 202 |
| `src/app/components/GradingTab.tsx` | 566 |
| `src/lib/submission-zip-intake.ts` | 158 |
| `src/lib/grade/grouping-zip-parents.wiring.test.ts` | 148 |
| `src/lib/workflows/registry/steps.grading-cartridge.ts` | 310 |
| `src/lib/workflows/registry/steps.grading-run.ts` | 701 |
| `src/lib/workflows/registry/steps.grading-draft-flow.ts` | 697 |

### 0.3 Exit codes, read from the command

Every exit code quoted here was read from the command, never through a pipe. The
baseline suite run was executed in PowerShell and its code read from
`$LASTEXITCODE`:

```
> npm run test:paths -- src/lib/grade/utils.test.ts src/lib/grade/extraction.test.ts
    src/lib/grade/single-file-entry.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts
COVERED src/lib/grade/utils.test.ts files=1 passed=28
COVERED src/lib/grade/extraction.test.ts files=1 passed=9
COVERED src/lib/grade/single-file-entry.test.ts files=1 passed=15
COVERED src/lib/grade/grouping-zip-parents.wiring.test.ts files=1 passed=7
Test Files 4 passed (4) / Tests 59 passed (59)
TESTPATHS_EXITCODE=0
```

**59 tests green with the defect fully live.** That reproduces the scope's 6.1
exactly, and it is the baseline every red/green claim below is measured against.

Any instrument in this document that names two or more test files is written as
`npm run test:paths -- <p1> <p2> ...`. A raw `vitest run a b` silently drops any
argument it does not match and exits 0; it must not be used.

### 0.4 Absence claims and their canaries

| Absence claimed | Instrument | Positive canary, same pattern family |
|---|---|---|
| No workflow caller reads `warnings` | `grep -c "warnings" src/lib/workflows/registry/steps.grading-{cartridge,run,draft-flow}.ts` -> `0`, `0`, `0` | `grep -n "state.warnings" src/app/components/GradingTab.tsx` -> `:502`, `:506` (exit 0) |
| `grading.ts` has no fifth `warnings` site | `grep -n "warnings:" src/app/actions/grading.ts` -> `:784`, `:804`, `:875`; plus shorthand `warnings` at `:699` read directly | `grep -n "warningsZZZ:" src/app/actions/grading.ts` exits 1 |

Note the second row against itself: `grep -n "warnings:"` finds THREE sites and
misses `:699`, which uses shorthand. **The enumeration is a floor.** The set is
four, and the fourth was found only by opening `:690-700`. Any wave that touches
this must re-derive with its own instrument rather than trusting this table.

---

## 1. The oracle for the collapse itself

### 1.1 The bad metric, disproved by construction

The check's B2 is correct and this pass reproduces it independently and harder.
`rows < files` is not the collapse: it is ALSO the repo's REQUIRED same-student
multi-file merge, pinned at `src/lib/grade/utils.test.ts:336-351`.

Measured over the real `groupSubmissionsByStudent`, with ground truth carried
per file (generator published in 1.3):

| Generated shape | sets | `rows < files` | GROUND-TRUTH harm sets |
|---|---|---|---|
| Canvas convention, one file each | 20000 | 0 (0.0%) | 0 (0.0%) |
| **Canvas convention WITH resubmissions** | 20000 | **16104 (80.5%)** | **0 (0.0%)** |
| Flat, assignment-named | 19938 | 11472 (57.5%) | 11472 (57.5%) |
| Per-student folders, assignment-named | 20000 | 12304 (61.5%) | 12304 (61.5%) |

**The bad metric fires on 80.5% of sets that contain zero instances of the
defect.** Every one of those 16,104 is a student submitting twice, which this
repo requires to merge. `rows < files` is therefore FORBIDDEN as an oracle here,
in any spelling, including `rows.length !== Object.keys(submissions).length`.

The 80.5% is higher than the check's 35.9% control for a stated reason: the
check's control gave each student exactly one file, so it could not produce a
legitimate merge at all. Resubmissions are precisely what makes the bad metric
fire, so a control without them understates the contamination. Both numbers
point the same way; this one is the honest ceiling.

### 1.2 Ground truth, and what it can and cannot be

A file's TRUE student is not derivable from a flat zip - that is the defect. So
ground truth exists only in a fixture the test author DECLARES, and the oracle
is a frozen literal over declared fixtures plus a seeded generator whose per-file
owner is known by construction. It is never a comparison between two
implementations of the parser: consolidating two implementations turns such a
test into a tautology, which this repo has already shipped once.

**Definition, used verbatim below.** A row has a TRUE CROSS-STUDENT COLLAPSE
when the files merged into it were declared to belong to more than one student.
Files are recovered from a row by searching `row.content` for each fixture file's
unique content marker - not by name, because the headline case has three files
with byte-identical names.

### 1.3 The published generator (closes B2's "not reproducible" half)

The check's B2 also faults the scope for not publishing its stem list. Here is
the whole generator, so any figure above is reproducible without this document:

- Students (15): `AlvarezMaria BrownTom ChenLi DavisAnn EvansJo FordKim
  GarciaLuz HallSam IvanovNik JonesPat KimDae LopezAna MurphyDev NguyenAn
  OkaforChi`
- Stems (15): `essay`, `Essay Final`, `Essay Draft`, `Homework Final`,
  `Homework Draft`, `homework`, `reflection`, `Reflection Final`, `report`,
  `Report Draft`, `paper`, `Paper Final`, `lab`, `Lab Report`, `midterm`
- Extensions (4): `docx txt pdf md`
- Set size: `2 + floor(rnd() * 5)`, i.e. 2 to 6 files
- Content marker per file: `MARKER-<setIndex>-<fileIndex> <trueStudent>`
- PRNG: mulberry32, seed `20260927`, so every figure reproduces bit-for-bit
- Duplicate paths are removed before driving (a real zip cannot hold two
  identical entry names); sets left with fewer than 2 distinct paths are skipped,
  which is why the flat shape reports 19938 rather than 20000
- Path shapes: `flat` = `<stem>.<ext>`; `folder` = `<student>/<stem>.<ext>`;
  `convention` = `<student-lowercased>_2026-09-0<n>_120<i>00_<stem>.<ext>`;
  `-resubmit` variants reuse the previous file's owner with probability 0.5;
  `folder-distinct-stems` = `<student>/<student>-work.<ext>`

**A stated blind spot in this generator, not papered over.** In the `folder`
shape every file has a distinct owner, so that shape never produces one
student's two generically-named files. That case is REAL and is the whole
false-refusal cost, so it is measured by its own shape (`folder-resubmit`, 1.5)
and pinned by frozen fixture F6 (1.4). A sweep is a floor.

### 1.4 THE FROZEN LITERAL ORACLE

Every value in this table was produced by driving the REAL
`groupSubmissionsByStudent` and `parseSubmissionFileName` over the scratchpad
copy of section 0.1. `DECISION` is the verdict a refusal must reach.
`HARM` is ground truth. These are the frozen values; they are not to be
recomputed by the test from the implementation.

| id | Fixture (paths, distinct content each) | rowsOut | HARM | DECISION | Class |
|---|---|---|---|---|---|
| F1 | `johnsmith_1001_0_report.docx`, `johnsmith_1002_0_report.docx` | 1 | **YES** | **ALLOW** | DECLARED SURVIVOR - out of A41 scope |
| F2 | `janedoe_2024-01-01_120000_report.docx`, `janedoe_2024-01-15_090000_report.docx` | 1 | no | ALLOW | ALLOW-REQUIRED |
| F3 | `AlvarezMaria/essay.txt`, `BrownTom/essay.txt`, `ChenLi/essay.txt` | **1** | YES | **REFUSE** | REFUSE-REQUIRED (headline) |
| F4 | `Homework Final.docx`, `Homework Draft.docx` | 1 | YES | REFUSE | REFUSE-REQUIRED |
| F5 | `alvarezmaria_2026-09-01_120000_essay.docx`, `browntom_2026-09-01_130000_essay.docx`, `README.txt` | 3 | no | ALLOW | ALLOW-REQUIRED |
| F6 | `AlvarezMaria/Homework Final.docx`, `AlvarezMaria/Homework Draft.docx` | 1 | no | **REFUSE** | DECLARED CONSERVATIVE |
| F7 | `janedoe_2024-01-01_120000_project.zip/main.py`, `johndoe_2024-01-01_130000_project.zip/main.py`, each with its own `zipParents` chain | 2 | no | ALLOW | ALLOW-REQUIRED |
| F8 | the two F5 convention files PLUS `ChenLi/reflection.docx`, `DavisAnn/reflection.docx` | 3 | YES | REFUSE | REFUSE-REQUIRED (mixed) |
| F9 | `Essay.docx`, `essay.docx` | 1 | YES | REFUSE | REFUSE-REQUIRED (case fold) |
| F10 | `essay.docx` alone | 1 | no | ALLOW | ALLOW-REQUIRED |

Measured detail for F3, frozen in full because it is the headline and because
the `submittedFiles` names are what make it undetectable today:

```
filesIn=3 rowsOut=1
  "AlvarezMaria/essay.txt" -> key="essay" display="essay" citation="essay.txt"
  "BrownTom/essay.txt"     -> key="essay" display="essay" citation="essay.txt"
  "ChenLi/essay.txt"       -> key="essay" display="essay" citation="essay.txt"
ROW student="essay" mergedFileCount=3 submittedFiles=["essay.txt","essay.txt","essay.txt"]
ROW content="File: essay.txt\n\nMaria's essay\n\n---\n\nFile: essay.txt\n\nTom's essay\n\n---\n\nFile: essay.txt\n\nLi's essay"
trueStudents=["AlvarezMaria","BrownTom","ChenLi"]  CROSS_STUDENT=true
```

The `.docx` variant of F3 (`AlvarezMaria/essay.docx` etc.) produces the
byte-identical result with `.docx` in place of `.txt`, reproducing the check's
"confirmed sound" item 1 and the scope's 1.3 row 4.

**F1 is the most important row in this table and it is a scope boundary, not a
bug in the oracle.** `johnsmith_1001_0_report.docx` and
`johnsmith_1002_0_report.docx` are two DIFFERENT students, they collapse into one
row, and the collapse happens on the CONVENTION branch
(`utils.ts:200-208`), not the fallback. A41's own row excludes it ("the A14
sanitized-name collision ... is a related but textually distinct defect ... not
re-litigated or re-filed by A41") and `utils.test.ts:326-334` pins the merge as
current behaviour. So:

> **The soundness requirement below is scoped to harm reachable through the
> FALLBACK. It is NOT "every cross-student collapse is refused." Stating it as a
> universal would silently enlarge A41 to cover A14's known-open item and would
> make F1's frozen ALLOW verdict a failure.**

This is the "pass condition narrower than the defect" trap named in
`docs/loop/traps-spec.md`, and the resolution is not to narrow quietly: F1's
survival is RESIDUAL RES-A41T-1 (section 10), with an owner and an instrument.

**F6 is the measured cost of refusing.** One student, two generically-named
files in their own folder: no harm, and a fallback-collision decision refuses it.
It cannot do otherwise - the data carries no identity signal on that path, so the
decision refuses a set it cannot attribute. That is honest and it is what the
copy in section 5 must therefore not claim.

### 1.5 The false-refusal rate, measured rather than asserted

Same generator, two further shapes:

| shape | sets | GROUND-TRUTH harm | fallback-collision REFUSE | UNSOUND (harm allowed) | CONSERVATIVE (refused, no harm) |
|---|---|---|---|---|---|
| `flat` | 19938 | 11472 | 11472 | **0** | 0 |
| `folder` | 20000 | 12304 | 12304 | **0** | 0 |
| `convention` | 20000 | 0 | 0 | **0** | 0 |
| `convention-resubmit` | 20000 | 0 | 0 | **0** | 0 |
| `folder-resubmit` | 19975 | 9209 | 12110 | **0** | **2901 (14.5% of sets)** |
| `folder-distinct-stems` | 20000 | 0 | 0 | **0** | 0 |

So: a well-organised folder zip whose filenames differ per student is never
refused (`folder-distinct-stems`, 0 of 20000). A folder zip where one student
submits two generically-named files is refused 14.5% of the time with no harm
present. Example, measured:
`["EvansJo/Homework Draft.docx","EvansJo/Paper Final.pdf","FordKim/Essay Draft.docx","FordKim/Essay Final.md"]`.

That 14.5% is the number the owner is buying with RULING 69, and it belongs in
the shipping report.

---

## 2. Numbered requirements

Each names the object under comparison, the instrument producing each quantity,
and the direction of failure. `X` in a file name means the wave plan seat names
the file; the requirement binds to the assertion, not the filename.

---

### R1. The decision's verdict matches the frozen oracle on every row of 1.4

- **Object:** the decision's emitted status for each fixture F1-F10, against the
  frozen `DECISION` column of 1.4.
- **Instrument, quantity by quantity:** the fixture's `submissions` record and
  `zipParents` record are written as literals in the test; the actual verdict
  comes from ONE call to the new decision function; the expected verdict is a
  frozen literal in the test body. The row count in the `rowsOut` column comes
  from one `groupSubmissionsByStudent` call over the same fixture and is asserted
  as a CHARACTERISATION only (see R2).
- **Direction of failure:** RED when any fixture's emitted status differs from
  its frozen verdict. Specifically RED when F3, F4, F8 or F9 is ALLOWED, and RED
  when F1, F2, F5, F7 or F10 is REFUSED, and RED when F6 is ALLOWED.
- **Why F6 is asserted REFUSED rather than left unpinned:** an unpinned
  conservative case is a licence to quietly widen or narrow the decision later.
  Pinning it makes any future change to the false-refusal boundary a visible
  test change.
- **Runs:** `npm run test:paths -- <the decision leaf's test>`

---

### R2. The row count is a CHARACTERISATION, never a pass condition

- **Object:** `groupSubmissionsByStudent`'s returned entry count on F3, against
  the frozen literal `1`.
- **Instrument:** one `groupSubmissionsByStudent` call in the decision leaf's own
  test file (NOT in `src/lib/grade/utils.test.ts` - see below); expected value is
  the frozen literal `1`, with a comment naming it as today's defective
  behaviour under RULING 69.
- **Direction of failure:** RED when the count is anything other than 1.
- **This is the repair of the withdrawn T1.** The withdrawn T1 asserted `3`
  (one row per input file) inside `utils.test.ts`, and under RULING 69 no wave
  rewrites `groupSubmissionsByStudent`, so it would have been red forever. As a
  frozen `1` it is green from the first commit, it documents the defect, and it
  goes red the day somebody changes identity resolution - which is exactly when
  a human should look at A41 again.
- **It must NOT live in `src/lib/grade/utils.test.ts`.** That file's 28 tests are
  the A14 priority-order pins; adding an A41 characterisation there invites a
  later reader to "fix" it. It lives beside the decision.
- **Never import it from another `*.test.ts`.** If the decision leaf's test and
  any other test both want this fixture, DUPLICATE it. Importing a helper from a
  `*.test.ts` re-runs that file's `describe` blocks under the wrong setup.

---

### R3. The generated sweep: soundness over the fallback subspace

- **Object:** for every set the published generator (1.3) produces in the `flat`,
  `folder` and `folder-resubmit` shapes, the pair (ground-truth harm present,
  decision refuses).
- **Instrument:** ground-truth harm comes from the per-file declared owner in the
  generator, recovered from each row by content marker, over one
  `groupSubmissionsByStudent` call. The decision comes from one call to the new
  decision function over the same `submissions` keys. The generator is seeded
  (`20260927`) and lives in the test file, duplicated if another test needs it.
- **Direction of failure:** RED when any set has ground-truth harm and is
  ALLOWED. The expected count of such sets is exactly **0**, frozen.
- **Second direction, same instrument:** RED when any set in the `convention`,
  `convention-resubmit` or `folder-distinct-stems` shapes is REFUSED. Expected
  count exactly **0**, frozen.
- **Frozen counts, all measured in 0.1's harness and reproducible from 1.3:**
  `flat` 19938 sets / 11472 refusals; `folder` 20000 / 12304; `convention`
  20000 / 0; `convention-resubmit` 20000 / 0; `folder-resubmit` 19975 / 12110;
  `folder-distinct-stems` 20000 / 0. Asserting the refusal COUNTS as well as the
  two zero-directions is what stops a decision drifting inside the sound region.
- **Why this requirement exists and R1 is not enough:** R1 is a hand-written list
  of ten, and a hand-written list of ten is defeated by an implementation that
  matches those ten filenames. A seeded 20,000-set sweep whose expected values
  are two zeros and six counts cannot be.
- **Size note:** each shape is 20000 sets of up to 6 files; the harness runs in
  well under a second in node. If the implementer finds it slow under vitest,
  reduce `SWEEP_N` and RE-MEASURE the six frozen counts in the same commit.
  Do not keep a stale count.

---

### R4. The refusal is EMITTED by the producer, on the DEFAULT branch

This is the requirement a pure-function test over a hand-built fixture cannot
satisfy. `docs/a41-check.md` M1 is the reason: a refusal routed through the wrong
channel is dead on the default path with every gate green.

**Measured facts this requirement is built on:**

- The DEFAULT provider is `gemini`: `src/lib/llm-provider.ts:14`
  (`const DEFAULT_PROVIDER: LlmProvider = "gemini"`) and `:16-20` (`coerce`
  returns `"gemini"` for anything that is not `"other"` or `"embedded"`).
- The default zip branch is `src/app/actions/grading.ts:905-920`, calling
  `gradeSubmissions` at `:907`. **That branch returns no `warnings` field at
  all.** So a refusal delivered as `warnings` is unreachable there.
- `gradeAction`'s outer `catch` is at `grading.ts:921-924` and returns
  `{ run: null, error: message }` at `:923`, where `message` is `err.message`
  VERBATIM with no prefix.
- The precedent already in the tree: `src/lib/grade/engine.ts:443` throws an
  ingestion-level `Error` from inside `gradeSubmissions`, and that message
  becomes `state.error`. So the `error` channel is a load-bearing, already-used
  ingestion refusal path on the default branch.
- `state.error` renders at `src/app/components/GradingTab.tsx:262-266`
  (`role="alert"`). `state.warnings` renders at `:502-511`.
- Both unattended zip callers already consume `.error` and nothing reads
  `warnings`: `steps.grading-cartridge.ts:108` -> `:110` `errorMsg` ->
  `:111` `lines.push` and `finishCartridgeDropAction(..., { status: "error",
  error: errorMsg })`; `steps.grading-run.ts:549` -> `:552`
  `lines.push(\`Offline grading: ${gradeResult.error}\`)`. `grep -c "warnings"`
  is 0 in all three workflow registry files (canary in 0.4).

**R4a - the Gemini (default) branch.**

- **Object:** the `GradeActionState` that `gradeAction` RETURNS for a real
  colliding zip under `provider=gemini`, against a frozen literal.
- **Instrument:** `gradeAction` is imported and driven with a real `FormData`,
  exactly as `src/app/actions/grading.budget.test.ts:62,129` already does.
  `requireOwner` is mocked (`grading.budget.test.ts:19-21` is the precedent -
  auth only). **The MODEL SEAM is `callLlm` from `@/lib/llm`**, which is what
  `src/lib/grade/engine.ts:7` and `src/lib/grade/rubric.ts:1` both import;
  `vi.mock("@/lib/llm", ...)` reaches both, including through
  `gradeSubmissions`'s dynamic `await import("./rubric")` at `engine.ts:424`.
  **Do NOT mock `fetch`** - `vitest.setup.ts` replaces `globalThis.fetch` with a
  throwing stub, and a sabotage that moves a call onto an unmocked transport must
  hit that stub rather than a live host. `@/lib/grade`'s
  `synthesizeFullCreditChecklist` and `generateSampleAnswer` are mocked too
  (they are the other two members of the `Promise.all` at `grading.ts:906-910`
  and would otherwise call the model); `gradeSubmissions` is left REAL.
- **The zip is real**, built with JSZip in the test. Precedent and a trap already
  paid for: `src/lib/grade/extraction.test.ts:166-235` builds real archives, and
  its own comment at `:159-165` records that `generateAsync({type:"nodebuffer"})`
  returns a Buffer on a shared 8KB pool - pass the nodebuffer directly or
  generate `type: "arraybuffer"`, never `.buffer`.
- **The fixture must use `.txt`, not `.docx`.**
  `extraction.test.ts:173-178` records why: `DOCUMENT_EXTENSIONS` routes `.docx`
  through a real Word parser, which rejects plain-string bytes and diverts the
  file into `failedSupportedFiles`, so a `.docx` fixture produces ZERO
  submissions and the test would pass for the wrong reason. Use F3's `.txt`
  variant, whose result is frozen in 1.4.
- **The fixture shape is proven to be the EMITTED shape**, not invented: a folder
  inside the single top-level zip yields the key `Homework1/<name>` with
  `zipParents` UNDEFINED, asserted by the already-landed
  `extraction.test.ts:189-190` (part of the 59 green tests in 0.3). F3's
  `AlvarezMaria/essay.txt` is that exact shape.
- **Direction of failure:**
  1. RED when `result.error` is not equal (by `toBe`, not `toContain`) to the
     frozen refusal string of section 5.
  2. RED when `result.run` is not `null`.
  3. RED when any `callLlm` invocation's request body contains any of the three
     fixture files' content markers. **This is the assertion that binds to the
     user-visible harm** - three students' text reaching one model call - rather
     than to a string. It survives a rewording of the refusal; the string
     equality does not, and both are required for different reasons.

**R4b - the embedded branch.**

- **Object:** the `GradeActionState` that `gradeAction` RETURNS for the same real
  zip under `provider=embedded`, against the same frozen literal.
- **Instrument:** as R4a, but `extractStudentEntries` is left REAL (so the
  refusal is exercised on `grading.ts:854`'s path) while `buildEmbeddedRubric`
  and `gradeEntriesEmbedded` are mocked, as `grading.budget.test.ts:38-45,113-122`
  already does.
- **Direction of failure:** RED when `result.error` is not equal to the frozen
  string; RED when `gradeEntriesEmbedded` was called at all (a refusal that
  grades anyway is the failure this closes).

**R4c - the refusal must NOT fire where nothing was at risk.**

- **Object:** the call count of the decision function, plus `result.error`, on
  three branches that cannot collapse.
- **Instrument:** the decision function is mocked and its call count read;
  `gradeAction` is driven three times with the same auth mock.
  (i) single non-zip upload, `provider=gemini`, a `.txt` file named `essay.txt` -
  `grading.ts:892-903`, and `src/lib/grade/single-file-entry.ts` returns at most
  one entry, so nothing can collapse. (ii) `provider=other` -
  `grading.ts:846-849`. (iii) `canvasUrl` set - `grading.ts:740` returns before
  the zip branch entirely.
- **Direction of failure:** RED when the decision is called on any of the three,
  and RED when `result.error` on (i) is non-null.
- **Why this is a requirement and not a nicety:** `docs/a41-scope.md:336-340`
  names it, and the guard at `src/lib/grade/single-file-entry.test.ts:70-76`
  exists because this path was deliberately kept off the shared fallback. A
  refusal wired into `classifyGradingUpload`'s `"single"` branch would refuse a
  file that was never at risk, and no existing test would catch it.

---

### R5. Reachability: the refusal cannot be dead on the default path

R4a is the primary reachability instrument and it EXECUTES. This requirement is
the structural backstop for the one thing R4a cannot see: a later wave adding a
second surface, or moving the refusal onto `warnings`.

**No component is rendered by any test in this repo.** vitest is node-env and
collects only `src/**/*.test.ts`. So the renderer half of reachability - that an
instructor's eye lands on `GradingTab.tsx:262-266` - is NOT testable here and is
owner verification (RES-A41T-4). What IS testable is the channel.

- **Object:** for each of the three exposed `gradeAction` callers, whether the
  refusal's channel is one that caller reads.
- **Instrument, and it is a source-text wiring test** in the style of
  `src/lib/grade/grouping-zip-parents.wiring.test.ts` (148 lines), which is the
  repo's own precedent and which carries four canary tests proving its checks can
  tell hit from miss. The check is: for each of
  `steps.grading-cartridge.ts`, `steps.grading-run.ts`,
  `steps.grading-draft-flow.ts`, the file contains at least one
  `await gradeAction(` call AND the file reads `.error` off that call's result.
- **Direction of failure:** RED when a file containing an `await gradeAction(`
  call does not read `.error` from a `gradeResult`-shaped binding. The expected
  counts today, measured: cartridge `:108` reads `.error` at `:110`; grading-run
  `:549` reads it at `:551-552`; draft-flow `:271` reads it at `:273-274`. (
  `grading-run.ts:481` and `draft-flow.ts:271` are the Canvas-row callers and set
  no `studentSubmissions`, so they are not exposed to the collapse; they are
  included in the sweep anyway because the check is about the CHANNEL, and the
  channel must hold for whatever they grade.)
- **It pins the observed call, never the presence of an identifier.** Asserting
  that the string `error` appears in the file is the shape that has shipped green
  through five sabotages here. The assertion must be scoped to the parens/binding
  of an actual `gradeAction` call, exactly as
  `grouping-zip-parents.wiring.test.ts:59-63` scopes `allCallsForwardZipParents`
  to each call's own argument list.
- **Comment stripping, if the test strips comments:** use
  `.split(/\r?\n/)` plus an UNANCHORED `/\/\/.*$/` per line, or the
  `/\/\*[\s\S]*?\*\//g` + `/\/\/.*$/gm` pair that
  `grouping-zip-parents.wiring.test.ts:34-36` already uses. The anchored
  `/^[ \t]*\/\/.*$/gm` form is trailing-comment-blind and has an executed defeat
  on record in this repo.
- **Do NOT use the `/s` (dotAll) flag.** It passes vitest and FAILS
  `npx tsc --noEmit` with TS1501. Two implementers hit this in one day.
  `[\s\S]` is the form that works, as the existing wiring test shows.
- **CANARY REQUIREMENT, non-negotiable:** the wiring test ships with at least
  three canaries in the style of `grouping-zip-parents.wiring.test.ts:70-135` -
  a hand-written source string that PASSES, one that reads `.error` off an
  unrelated binding and must FAIL, and one with no `gradeAction` call at all that
  must FAIL. Without them the check reports clean without checking.

**Every slice needs an anchor-resolves assertion at BOTH ends.** If any
assertion here uses `indexOf` + `slice` to isolate a region (as
`src/loop-docs.structure.test.ts` does throughout), it must first assert BOTH
indices are `> -1` and that the end index is greater than the start. An
unresolved `indexOf` returns -1 and `slice(start, -1)` silently widens to nearly
the whole file - a defect already shipped here.

---

### R6. The copy: every clause bound to an emitted value, on every path

Five false user-facing sentences have shipped in this codebase and a sixth was
caught in a candidate this week. The scope's own candidate is withdrawn.

**What the code actually has at the decision point, measured.** This is the
constraint every clause is bound by:

| Quantity | Available? | Where |
|---|---|---|
| the paths of the colliding files | YES | `Object.keys(submissions)` |
| the colliding computed key / display | YES | `parseSubmissionFileName(...).studentKey` / `.studentDisplay` |
| the count of files whose TEXT WAS READ | YES | `Object.keys(submissions).length` |
| **the count of entries in the zip** | **NO** | see below |
| the count of skipped unsupported files | **NO** | `extraction.ts:83-85` returns with no counter increment |
| the count of files whose extraction failed | not on the embedded path | `extraction.ts:108,111` fill `failedSupportedFiles`, and `extraction.ts:137` destructures only `{submissions, rawData, zipParents}` - `extractStudentEntries` discards it |
| the number of STUDENTS | **NO, and it is the defect** | the collapse is precisely the app not knowing this |

**So no quantity reachable by any refusal site equals "files in the zip."** The
copy may not say "Read N files" in any spelling. Note also that images enter
`submissions` as the placeholder `[Image file: <name>]` (`extraction.ts:93`), so
"files read" includes images - true, but it means the number is not a count of
text documents either.

**C-A. Bind to paths and keys, never to students or submissions.** "Submissions"
is a synonym for a student's work in this app's own vocabulary
(`GradingTab.tsx:322` reads "Upload a zip archive of student submissions", and
the returned type is `StudentSubmissionEntry`), so a count of "submissions" is a
count of students under a synonym. That is the check's B5 and it is binding here.

**C-B. The instrument asserts the EMITTED string by EQUALITY, not containment.**
`toContain` is defeated by four appended words that keep every required token and
invert the meaning - an executed defeat on record in this repo. Every copy
assertion is `expect(result.error).toBe(<frozen literal>)`.

**C-C. The refusal NAMES something the instructor can do.** Two sentences have
had to be DELETED here rather than made true because "neither named anything the
instructor could do" (`docs/BACKLOG.md:51`, A38). A refusal is the one case where
an instruction is legitimate, because the app did NOT proceed - which is the
inverse of the trap in C-D.

**C-D. No warn-then-proceed sentence.** A sentence that warns while the run
grades anyway manufactures the appearance of disclosure and the wrong grade still
lands. Under RULING 69 there is no proceeding branch, so any such string in the
diff is a finding.

**C-E. Every decision status has a sentence, enforced by tsc.** The precedent is
`src/lib/submission-zip-intake.ts:93-98` (a discriminated union
`ZipIntakeDecision`) plus `:145-158` (`describeZipIntakeDecision`, a `switch`
over that union with one case per status and no `default`). A `switch` over a
discriminated union with no `default` fails `npx tsc --noEmit` when a new member
is added without a case. **That makes the missing-sentence state
unrepresentable, which is stronger than any assertion that it is absent.**
Requirement: the new decision is a discriminated union and its describe function
is an exhaustive `default`-less switch.

**CANDIDATE COPY, offered for the architect and the owner to set, with the
per-clause bindings that are the actual requirement.** The wording may change
freely; the bindings may not.

> `Refused: 3 files in this archive resolve to the same student name "essay", so
> they would have been graded together as one submission: AlvarezMaria/essay.txt,
> BrownTom/essay.txt, ChenLi/essay.txt. Rename each file to
> studentname_date_time_filename, or give each student their own .zip inside the
> archive, then upload again. No grades were produced.`

| Clause | Bound to | Forbidden alternative and why |
|---|---|---|
| `3 files` | the size of one colliding key's path group | not `Object.keys(submissions).length`; not the zip's entry count, which does not exist |
| `resolve to the same student name "essay"` | `parseSubmissionFileName(...).studentDisplay` for that group | not "are the same student" - the app does not know that |
| the path list | the group's full paths from `Object.keys(submissions)` | NOT `submittedFiles[].name`, which is `essay.txt` three times and tells the instructor nothing |
| `one submission` | describes the counterfactual grading, singular, for one group | not "N submissions" as a total - that is a student count under a synonym (C-A) |
| the rename instruction | `utils.ts:68-75`'s documented convention | must not tell the reader to check a list the unattended callers never show |
| `No grades were produced.` | the fact that `result.run === null` | must not appear on any path that does grade (C-D) |

- **Object:** the emitted `error` string on each of R4a and R4b, and on the
  multi-group fixture F8, and on a >5-file group (F11 below).
- **Instrument:** `expect(result.error).toBe(<frozen literal>)`, one frozen
  literal per fixture, written out in full in the test.
- **Direction of failure:** RED on any difference, including appended words,
  changed numbers and changed nouns.
- **F11, the truncation branch.** If the path list is capped (the precedent
  `submission-zip-intake.ts:135-141` caps at 5 with `, ...`), a SIXTH fixture is
  required: six colliding paths, with the truncated string frozen. **An uncapped
  list is also acceptable, but then the requirement is a frozen six-path string
  proving it is uncapped.** What is not acceptable is a cap with no fixture
  exercising it - that branch would ship untested with the suite green.
- **Multi-group, F8:** two colliding keys in one archive. The frozen string must
  name BOTH groups. A sentence that names only the first is a true sentence that
  misleads, which is this codebase's exact defect class.

---

### R7. The gate run, and the two sweeps that bite

- **Object:** the repo's own byte and emoji gates over the new files.
- **Instrument:** `npm run test:paths -- src/lib/no-emojis.test.ts
  src/source-bytes.structure.test.ts`, exit code read from the command.
- **Direction of failure:** RED on any emoji or on a materialised `\uXXXX`
  escape. The Write/Edit tools materialise a `\uXXXX` escape as the LITERAL
  character; `src/source-bytes.structure.test.ts` owns that scan and it must not
  be hand-rolled.
- **The type gate is `npx tsc --noEmit --incremental false`, with NO file
  arguments**, and it has exactly one caller - it races on
  `tsconfig.tsbuildinfo`. vitest bundles rolldown/Oxc, which erases types without
  reading them, so a green suite is not a type check.
- **The 1000-line ceiling** (`src/file-size-ceiling.structure.test.ts:41`,
  `LIMIT = 1000`) leaves `src/app/actions/grading.ts` **59 lines** of headroom at
  941. Any wave adding more than that to it needs an extraction first. This is a
  measurement, not a requirement of mine; it is here because a wave that ignores
  it turns the whole suite red for an unrelated reason and the red gets
  misattributed to A41.

---

## 3. My own attack on these instruments

Required by this seat's brief: write the passing-but-wrong implementation and run
the instrument against it. Six were built; the two that survived forced new
requirements.

| Passing-but-wrong implementation | Killed by | Evidence |
|---|---|---|
| **PW1** Refuse iff the archive's paths match a hardcoded allowlist of F3/F4/F8/F9 | **R3** | Cannot produce 11472 refusals over 19938 seeded `flat` sets. R1 alone does NOT kill it - that is why R3 exists. |
| **PW2** Refuse iff `rows.length < Object.keys(submissions).length` | **R3's second direction** | 16104 refusals on `convention-resubmit` where 0 are required; measured 1.1. R1 alone does NOT kill it: PW2 gets every F1-F10 verdict right except F2 and F5 - and F2 alone is what catches it, so R1's ALLOW list is load-bearing, not decoration. |
| **PW3** Refuse iff ANY file reaches the fallback | **R1 (F5, F10)** | F5's stray `README.txt` reaches the fallback alone (measured: key `readme`, step 6 YES) and F10 is a single file. Both frozen ALLOW. |
| **PW4** Compute the refusal correctly and return it as `warnings` | **R4a directions 1-2** | The Gemini branch (`grading.ts:905-920`) returns no `warnings` field, so `result.error` stays null and `result.run` is non-null. A leaf-only unit test passes this. |
| **PW5** Assert `expect(result.error).toContain("resolve to the same student")` | **C-B** | Four appended words - " but we graded them anyway" - keep every token and invert the meaning. Equality is mandatory. |
| **PW6** Wire the decision only into `grading.ts:854` (embedded) | **R4a** | Embedded is not the default; `llm-provider.ts:14,16-20` make `gemini` the default, so the harm survives on the path an instructor actually uses. R4b alone passes PW6. |

**Two instruments were REBUILT rather than banked, and this is the honest
record:**

- My first soundness requirement read "every fixture with a true cross-student
  collapse must be refused." Executed against the fallback-collision reference
  implementation it went RED on F1 - not because the implementation was wrong,
  but because F1's harm is on the convention branch and A41's row excludes it.
  A requirement that forces A41 to fix A14's known-open item is a bad
  instrument, not a kill I was owed. It was rebuilt as a subspace-scoped
  soundness claim plus RES-A41T-1.
- My first oracle was `rows < files`, inherited from the scope's 6.4. Executed
  against a control with resubmissions it fired on 80.5% of harm-free sets. It
  was rebuilt as the ground-truth oracle in 1.2-1.4, not strengthened.

---

## 4. Satisfiability: these requirements can all be met at once

A set of requirements is not a specification until something has passed it.

**Reference implementation, built and run in the scratchpad** (`sweep.ts`'s
`fallbackCollides`, driving the REAL `parseSubmissionFileName` and
`getBaseFileName` from the section-0.1 copy):

> refuse iff two or more DISTINCT paths that reach the leaf-stem fallback share a
> `studentKey`. A path reaches the fallback when its `zipChain` is empty and
> `parseSubmissionFileName(p).citationFileName === getBaseFileName(p)`.

Scored against every executable requirement in this document:

- **R1:** all ten frozen verdicts reproduced, including F1 ALLOW and F6 REFUSE.
  Measured output in 1.4's table.
- **R2:** F3 gives `rowsOut=1`. Frozen.
- **R3:** 0 unsound and 0 conservative on `flat`, `folder`, `convention`,
  `convention-resubmit`, `folder-distinct-stems`; 0 unsound and 2901
  conservative on `folder-resubmit`. The two zero-directions hold on all six
  shapes; the six refusal counts are the frozen values.

So no criterion here is unsatisfiable, and the two directions of R3 are
simultaneously satisfiable rather than in conflict. **The discriminator
`zipChain empty AND citation === base` was verified step by step** against
thirteen hand-chosen paths, including all three crossing-chain shapes:

```
"AlvarezMaria/essay.docx"                      chain=0 key="essay"        step6=YES
"Homework Final.docx"                          chain=0 key="homework"     step6=YES
"alvarezmaria_2026-09-01_120000_essay.docx"    chain=0 key="alvarezmaria" step6=no
"README.txt"                                   chain=0 key="readme"       step6=YES
"janedoe_2024-01-01_120000_project.zip/main.py" chain=1 key="janedoe"     step6=no
"CS101_Fall_2026_submissions.zip/report.docx"  chain=1 key="cs101"        step6=no
"bulk.zip/essay.docx"                          chain=1 key="bulk"         step6=no
"_draft one.docx"                              chain=0 key="_draft one"   step6=YES
"Essay.docx" / "essay.docx"                    chain=0 key="essay"        step6=YES
"AlvarezMaria/Homework Final.docx" / "...Draft.docx" chain=0 key="homework" step6=YES
```

**This is NOT a design ruling.** The architect may compute the decision any way
it likes; a reference implementation exists only to prove the requirements are
jointly satisfiable. If the architect's mechanism differs, the frozen oracles in
1.4 and R3 are unchanged and it must still pass them.

**What satisfiability was NOT proven for: R4, R5 and R6.** Those require a test
file inside `src/`, and this pass's write set is one `docs/` file. They are
labelled ARGUED in section 9, with the two already-landed precedents that make
them constructible named there.

---

## 5. The frozen refusal string

The string itself is the architect's and the owner's to set (section 6's
candidate is a candidate). What is frozen HERE is the instrument's shape, because
that is what makes a false sentence catchable:

1. One frozen literal per fixture, written out in full in the test body.
2. `toBe`, never `toContain`, never a regex.
3. The same literal asserted on BOTH R4a and R4b, so the two branches cannot
   drift into two different sentences for one condition.
4. A frozen literal for the multi-group case (F8) and for the >5-group case
   (F11).
5. No assertion anywhere that the string EXISTS IN THE SOURCE of
   `grading.ts`, `engine.ts` or the leaf. A retired literal kept as a source
   grep prints lines on correct code forever (`docs/BACKLOG.md:86`, A34), and a
   source-text test that pins wording has twice forced contorted code here.
   Pin the EMITTED value.

---

## 6. Sabotage protocol

Non-negotiable, and written so an implementer cannot substitute a description for
a result.

### 6.0 Mechanics

- **Back up by `cp` before mutating, and restore by `cp`.** NEVER
  `git checkout -- <path>`: the file may be uncommitted and checkout reverts it
  to the index, destroying the chunk's work. One backup per file, named
  `<file>.a41sab.bak`, deleted only after the restore is verified by
  `diff --strip-trailing-cr <file> <file>.a41sab.bak` exiting 0 and then by
  removing the backup.
- **No two agents may sabotage-verify on the tree at once.** Confirm no sibling
  is mid-sabotage before starting.
- **Every anchored literal must be proven to occur EXACTLY ONCE in its file
  before it is used as an edit anchor**, with the count printed:
  `grep -c "<literal>" <file>` must print `1`. A measured counter-example from
  this pass: `lines.push(\`${drop.name}: ${errorMsg}\`)` occurs at BOTH
  `steps.grading-cartridge.ts:111` and `:238`, so it is NOT a usable anchor.
- **A mutation must not destroy the anchor the test searches for.** Before
  applying a mutation to a file a source-text test reads, check that the
  mutation leaves that test's anchors resolvable - otherwise the test can go
  GREEN on the exact mutation it exists to catch.
- **VERBATIM output is required.** For each member, paste the vitest failure
  block including the `expected` and `received` values and the test name. A
  sentence saying a test "went red" is not a result. Then paste the post-restore
  green line with its exit code read from the command.
- **State for each member whether you expected it to discriminate.** A mutation
  that is red in both directions, or green in both, discriminates NOTHING and is
  worse than none because it reads as coverage. If a member cannot
  discriminate, SAY SO rather than dropping it.

### 6.1 Family M-DECIDE - the decision predicate

Mutate the new decision leaf. Every member must be applied; the requirement is
that the named instrument goes RED for EVERY member, not for one.

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | always return the ALLOW status | R1 (F3,F4,F8,F9) and R3 direction 1 | yes |
| b | always return the REFUSE status | R1 (F1,F2,F5,F7,F10) and R3 direction 2 | yes |
| c | drop the case fold (compare `studentDisplay` instead of `studentKey`) | R1 (F9) only | yes, and F9 is the ONLY fixture that catches it |
| d | require 3 or more colliding paths instead of 2 | R1 (F4,F6,F9) and R3's refusal counts | yes |
| e | compare full base names instead of keys | R1 (F4) and R3's refusal counts | yes |
| f | include convention-branch files in the collision set | R1 (F1) only | yes, and F1 is the ONLY fixture that catches it - which is why F1 is in the table despite being out of scope |
| g | count the same path twice (drop the distinct-path guard) | R1 (F10) | yes |

**If any member survives, the requirement set is incomplete - add the fixture
that kills it, and do not simply lengthen the list. A second failure of the same
family changes KIND, not strength** (`docs/loop/iteration-caps.md` cap 1).

### 6.2 Family M-WIRE - the refusal never reaches the surface

Mutate `src/app/actions/grading.ts` and/or `src/lib/grade/engine.ts` and/or
`src/lib/grade/extraction.ts`, whichever the wave wired.

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | delete the decision call from the Gemini/default path | R4a | yes |
| b | delete it from the embedded path | R4b | yes |
| c | route the refusal into `warnings` instead of `error` on the default path | R4a directions 1-2 | yes - and this is the M1 failure mode, so it is the single most important member here |
| d | catch the refusal and continue grading | R4a direction 3 (`callLlm` receives the markers) | yes, and direction 3 is the ONLY one that catches it if the caught error is still returned |
| e | compute the decision and discard the result | R4a and R4b | yes |
| f | wire it into the `"single"` branch as well | R4c (i) | yes |

### 6.3 Family M-MERGE - the collapse itself

Mutate `src/lib/grade/utils.ts`. **Under RULING 69 no wave writes this file**, so
this family exists solely to prove R2's characterisation and the section-7
decision are measuring the merge and not a proxy.

| # | Mutation | Expected effect | Discriminates? |
|---|---|---|---|
| a | delete `existing.files.push([filePath, content])` at `utils.ts:315` | R2's F3 count stays 1; `mergedFileCount` drops to 1 | **NO for R2** - and saying so is the point: R2's count alone does not measure the merge, which is why R1 and R3 carry the oracle |
| b | suffix the key: `grouped.set(inferred.key + String(grouped.size), ...)` at `:308` | R2's F3 count goes 1 -> 3 (RED), and `utils.test.ts:373` goes RED because three rows now share the display `essay` | yes for R2; **and it is the one mutation that falsifies the check's m5 reading of the tautology - see section 7** |
| c | key on `filePath` instead of `inferred.key` at `:304-305` | R2's F3 count goes 1 -> 3 (RED); several of `utils.test.ts`'s 28 A14 pins go RED | yes, but noisy - it breaks the A14 order too, so it is weaker evidence than (b) |
| d | replace `grouped.get(inferred.key)` at `:305` with `undefined` | same as (b) for counts; `utils.test.ts:373` RED | yes |

Every member of M-MERGE must be restored by `cp` before the next family runs.
`utils.ts` is read by `grep -rn "groupSubmissionsByStudent" src/` at 50+ sites; a
mutation left in place is a repo-wide hazard, and a killed agent mid-sabotage has
already left one here once.

### 6.4 Family M-COPY - the sentence

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | change a number's source (report the files-read total where the group size belongs) | R6 equality on R4a | yes |
| b | swap a noun (`files` -> `submissions`, or -> `students`) | R6 equality | yes |
| c | append a clause the app does not act on (" - check your filenames") | R6 equality | yes, and ONLY because the assertion is `toBe`; under `toContain` it survives, which is the C-B proof |
| d | name only the first colliding group on F8 | R6's F8 literal | yes |
| e | add a new decision status with no sentence | **`npx tsc --noEmit --incremental false`, NOT vitest** | yes at tsc, NO at vitest - state this explicitly, because a green suite here proves nothing |

### 6.5 Family M-CANARY - the wiring test's own canaries

The wiring test in R5 must be sabotaged too, or its canaries are decoration.

| # | Mutation | Expected RED on | Discriminates? |
|---|---|---|---|
| a | in `steps.grading-run.ts`, read `.error` off an unrelated binding instead of the `gradeAction` result | the R5 assertion | yes - and if it does not, the check is scoped to the file rather than to the call, which is the defect |
| b | in `steps.grading-cartridge.ts`, delete the `.error` read | the R5 assertion | yes |
| c | weaken the R5 predicate to a bare `source.includes("error")` | the R5 CANARY tests | yes, and this is the member that proves the canaries are load-bearing |

---

## 7. The tautological guard at `utils.test.ts:360-375`: REPAIR, with a correction

**Decision: KEEP the test, RENAME what it claims, and add the one assertion that
can fail. Do not delete it, and do not strengthen it in place.**

The scope's 6.4 finding is correct and reproduces: `grouped` is a `Map` on
`inferred.key` (`utils.ts:301,304-305,308`), and every one of
`parseSubmissionFileName`'s six return sites sets
`studentKey === studentDisplay.toLowerCase()` (`:116-117` via
`identityFromConventionMatch`, `:193-194`, `:221`, `:234-235`, `:247`, `:256` via
`leafStemFallback` `:125`). So distinct keys imply distinct lowercased displays
imply distinct displays, and `expect(new Set(students).size).toBe(students.length)`
at `:373` is true by construction. Measured against that: **0 failures of
`:373`'s own assertion in 119,913 generated sets across the six shapes of
1.5** (counted in the same harness, printed as
`TOTAL sets across all shapes = 119913, total utils.test.ts:373 failures = 0`),
consistent with the analytic proof and with the scope's own 20,000-set run.

**But the check's m5 is right and the scope's 6.6 overstated.** There IS a
mutation inside `groupSubmissionsByStudent` that makes `:373` fail: M-MERGE
member (b), suffixing the key at `:308`, produces three rows all displaying
`essay`. So `:373` is not unfalsifiable; it is a guard on the KEY-TO-DISPLAY
INVARIANT, and it is the only thing in the suite protecting it. That invariant is
load-bearing: `gradingResultsHelpers.ts` keys stored edits on the display string
(`:287` seeds `seeded[result.student]`, `:503` reads `edits[result.student]`,
`:632` merges `merged[student]`), so two rows with one display string silently
share one edit entry and one grade.

**What it is actually worth, stated plainly:** it is a real guard on
key-to-display injectivity and a worthless guard on cross-student collapse. Its
`describe` name and its comment at `:354-359` claim the second. That mismatch is
the whole defect - a reader sees a safety property and stops looking.

- **Object:** the guard's stated purpose against what it can detect.
- **Instrument:** rename the `describe` and rewrite the comment to name
  key-to-display injectivity, and add ONE sentence pointing at A41's own
  instrument for the collapse. No assertion in the existing `it` changes, so no
  A14 pin moves.
- **Direction of failure:** the RENAME is verified by M-MERGE member (b) going
  RED on `:373` (proving the renamed claim is falsifiable) AND by the F3 fixture
  NOT being added to this `describe` (proving the collapse claim was moved out,
  not re-spelled).
- **The replacement must not be a new spelling of the same shape.** Specifically
  forbidden: adding `expect(groups.length).toBe(<n>)` to this `describe`, or
  adding a second uniqueness assertion over `key` instead of `student` - which is
  the same tautology with a different field.

**Why not delete it.** Deleting it removes the only enforcer of the
key-to-display invariant, and `docs/loop/iteration-caps.md` disposal (d) requires
naming any existing enforcer a withdrawal was protecting. There is no other.

---

## 8. Executable here versus argued

| Item | Status |
|---|---|
| The frozen oracle 1.4, all ten fixtures | **EXECUTED** over the real parser, scratchpad copy diff in 0.1 |
| The generated sweep 1.5, six shapes, 120k sets | **EXECUTED**, seed 20260927 |
| `rows < files` fires at 80.5% with zero harm | **EXECUTED** |
| R1, R2, R3 satisfiable by one implementation | **EXECUTED** - reference implementation green on all three |
| The step-6 discriminator over 13 paths | **EXECUTED** |
| Baseline: 59 tests green, exit 0 | **EXECUTED**, exit code read from `$LASTEXITCODE` |
| The three A14 `utils.test.ts` pins that constrain the oracle (`:326-334`, `:336-351`, `:360-375`) | **EXECUTED** as part of the 59 |
| `extraction.test.ts:189-190`'s folder-key-with-no-`zipParents` fact | **EXECUTED** as part of the 59 |
| The `warnings` absence in the three workflow callers | **EXECUTED** grep with a positive canary |
| The four `warnings` sites in `grading.ts` | **READ**, and the grep that found three is recorded as a floor |
| **R4a, R4b, R4c - that a test driving `gradeAction` with a real colliding zip emits the refusal** | **ARGUED.** Not run: it needs a test file in `src/`, outside this pass's one-file write set. The argument rests on two EXECUTED facts - `grading.budget.test.ts:62,129,132` already imports `gradeAction`, drives it with a real `FormData` and asserts the returned `error` string; and `extraction.test.ts:246-271` already drives a real nested JSZip through `extractStudentEntries` with nothing mocked. Both are inside the 59 green tests. The specific assertions above have NOT been observed passing or failing. |
| **R5 - the source-text wiring check** | **ARGUED.** The three `.error` reads at `steps.grading-cartridge.ts:110-111`, `steps.grading-run.ts:551-552` and `steps.grading-draft-flow.ts:273-274` were READ. The predicate that scopes an assertion to a `gradeAction` call's own binding was NOT written or run; `grouping-zip-parents.wiring.test.ts:59-63` is the working precedent for that shape and IS in the 59. |
| **R6 - the copy** | **ARGUED.** The bindings table's "not available" rows are READ from `extraction.ts:83-85`, `:99`, `:108`, `:111`, `:137`; none was executed, because `extraction.ts` cannot be imported under `node --experimental-strip-types` (it imports `jszip`, `../canvas` and `../office-extract` by extensionless specifier). The executable version is an assertion in `extraction.test.ts` over a zip containing one unsupported extension - RES-A41T-3. |
| What an instructor SEES on screen | **NOT VERIFIABLE HERE.** vitest is node-env and collects only `src/**/*.test.ts`; no component is rendered by any test in this repo. Owner verification, RES-A41T-4. |
| Whether real instructors' zips take the folder shape | **NOT VERIFIABLE HERE.** The 14.5% conservative rate is a property of the published generator, not of real uploads. |
| Whether any model call ever populates `inferredLookup` in production | **NOT VERIFIABLE HERE.** No API keys in this checkout; `vitest.setup.ts` throws on real `fetch`. Every instrument above therefore assumes the degraded (empty-lookup) case, which `docs/a41-scope.md` 2.2 shows is observationally identical to `undefined`. |

---

## 9. What I could not determine

- **Whether the refusal should live in the lib (`extractStudentEntries` /
  `gradeSubmissions`) or in `gradeAction`.** R4a/R4b are written to be
  indifferent: both drive `gradeAction` and assert the RETURNED value, so either
  placement passes. That is deliberate, and it is the "drive the production path
  rather than the seam" rule. If the architect places it in the lib, note that
  `engine.ts:443`'s existing throw is the precedent and the message reaches
  `state.error` verbatim through `grading.ts:921-924`.
- **Whether the refusal fires before or after
  `inferFileNameConvention`.** `engine.ts:431` calls it before
  `groupSubmissionsByStudent` at `:432`, so a refusal computed after grouping has
  already spent one model call on the Gemini path. That is a design and cost
  question, not an instrument question, and no requirement here depends on the
  answer. It is worth the architect's attention because "0 model spend on a
  refused zip" is a claim option 1's cost argument makes
  (`docs/a41-scope.md` 4.1) and `:431` would falsify it.
- **The exact frozen string.** Section 5 freezes the instrument's shape; the
  wording is the owner's and the architect's.

---

## 10. Residual register

Each names an owner, an instrument, an object with a direction of failure, and a
step. An entry missing any of those is a deletion.

| id | Residual | Owner | Instrument | Object / direction | Step |
|---|---|---|---|---|---|
| RES-A41T-1 | F1 survives: the A14 sanitized-name collision is a REAL cross-student collapse that this branch's refusal ALLOWS by design, because it happens on the convention branch. A41's row excludes it. | the chunk whose write set includes `src/lib/grade/utils.ts` lines 87-119, or a new backlog row filed for it | the F1 fixture from 1.4, asserted ALLOW in the decision leaf's test | F1's emitted verdict. **RED if a later change makes F1 REFUSE without a decision to widen A41's scope**, and equally a finding if the row is closed while asserting A41 closed every cross-student collapse. | At the push that reconciles A41: either filed as its own row or explicitly withdrawn with a reason. |
| RES-A41T-2 | The 14.5% conservative refusal rate on the `folder-resubmit` shape (2901 of 19975 sets) is the measured cost of RULING 69 and has no user-facing mitigation in this branch. | the repo owner | the published generator in 1.3, `folder-resubmit` shape, seed 20260927 | The conservative count. **FAILS as a residual if A41 ships without this number in the shipping report**, because the owner then bought a cost nobody stated. | The shipping report for A41's chunk. |
| RES-A41T-3 | No quantity available to any refusal site equals the zip's entry count: unsupported extensions are skipped with no counter (`extraction.ts:83-85`) and `extractStudentEntries` discards `attemptedSupportedFiles`/`failedSupportedFiles` (`:137`). Read, not executed. | the wave whose write set includes `src/lib/grade/extraction.test.ts` | an assertion over `extractSubmissions` on a real zip containing one `.pages` entry and one unreadable `.docx`: compare `Object.keys(submissions).length`, `attemptedSupportedFiles` and `failedSupportedFiles.length` against the archive's entry count | The three numbers against the entry count. **RED if any of them equals the entry count**, which would mean the copy constraint in R6 is wrong and the sentence may name a total after all. | The wave that writes the refusal copy, before the string is frozen. |
| RES-A41T-4 | Every claim about what an instructor SEES is a reading claim. That `state.error` at `GradingTab.tsx:262-266` is visible and not collapsed behind a control, and that the refusal is legible in the cartridge drop's own report line, are unverified. | the repo owner (browser check) - this environment renders no component | open the Grading tab with F3's `.txt` zip on the default (gemini) provider and read the screen; then run a cartridge drop with the same zip and read the report | What is on screen and in the report, against R4's frozen string. **FAILS if the refusal is emitted but not visible**, in which case the reachability work is larger than R4/R5 measure. | Owner verification, after the refusal lands. Blocks nothing. |
| RES-A41T-5 | The `folder` sweep shape never produces one student's two generically-named files, so the sweep cannot see the conservative case; it is covered only by the single fixture F6 and by the `folder-resubmit` shape. | the implementer writing R3 | the generator's own shape list; F6 asserted REFUSE in R1 | The generator's coverage. **RED if R3 ships with only `flat` and `folder` shapes**, which would leave the false-refusal boundary unmeasured. | Wave that writes R3. |
| RES-A41T-6 | `src/app/actions/grading.ts` is at 941 of a 1000-line ceiling (`src/file-size-ceiling.structure.test.ts:41`), 59 lines of headroom, and it is where the refusal's caller goes. | the wave whose write set includes `src/app/actions/grading.ts` | `@(Get-Content src/app/actions/grading.ts).Count` before and after | The count. **RED at 1000 or above.** | The wave gate of whichever wave writes that file. |

---

## 11. The one question, shaped so every answer ends this activity

Not blocking. Everything above ships as it stands under either answer.

> **A refusal that cannot attribute a set refuses it.** Measured on the published
> generator: a folder-organised zip where each student submits ONE file is never
> refused (0 of 20,000). A folder-organised zip where a student submits TWO
> generically-named files - `AlvarezMaria/Homework Final.docx` plus
> `AlvarezMaria/Homework Draft.docx` - is refused 14.5% of the time with nothing
> actually wrong, because the app has no way to tell that pair from two different
> students' files. It cannot be fixed inside RULING 69: there is no identity
> signal in the data on that path.
>
> Pick ONE. Both end this activity; neither feeds another round.
>
> **(1) SHIP IT CONSERVATIVE.** The refusal fires on the set it cannot attribute,
> including that 14.5%. The instructor renames two files and re-uploads. The
> refusal text names the exact paths, so they know which two. Nothing else
> changes and RES-A41T-2 is recorded as the cost.
>
> **(2) SHIP IT CONSERVATIVE AND FILE THE FOLDER READER.** Same code, plus a
> separate backlog row for "per-student folders become a real identity signal",
> which would take that 14.5% to near zero for the folder shape specifically.
> That row is not trivially revertible - while it is live, instructor edits save
> under new display strings and a revert silently drops them
> (`gradingResultsHelpers.ts:287,503,632`) - so it is a real second decision, not
> a formality.
>
> **My recommendation: (2).** The refusal is the right thing to ship now and the
> folder reader is the only change that reduces its cost, but it carries a data
> migration hazard that should not ride along inside a bug fix. Cost of being
> wrong about (2): one extra backlog row that may never be worked. Cost of being
> wrong about (1): the 14.5% stays, uninvestigated, and the reason to look is
> gone.

---

## 12. Tree state at the end of this pass

Measured TWICE, because the tree moved under this pass. At the START of the
writing step:

```
$ git status --short
 M docs/BACKLOG.md
 M docs/backlog.yml
 M docs/css-orphans.md
 M src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts
 M src/tools/backlog/backlog-file.structure.test.ts
?? docs/l9-check.md
?? src/app/components/walkthrough-announcement/walkthrough-announcement-timing.structure.test.ts
```

At the END of the pass, after siblings committed their work:

```
$ git status --short
 M docs/css-orphans.md
?? docs/a41-test-notes.md
```

`docs/a41-test-notes.md` is this pass's only entry, in both readings. Every other
line is sibling-owned: `docs/css-orphans.md` belongs to another row, and the five
entries that disappeared between the two readings (`docs/BACKLOG.md`,
`docs/backlog.yml`, `docs/l9-check.md` and the two walkthrough-announcement
structure tests) were committed by concurrent agents, not by this pass.
**Nothing under `src/` was written or mutated by this pass**, and no
`git stash`, `git add -A` or `git checkout --` was run. `docs/backlog.yml` was
never touched.

**Concurrency note on `docs/a41-scope.md`.** A sibling was revising it during
this pass. At the end of this pass `git log --oneline -1 -- docs/a41-scope.md`
still returns `a4312b4`, and `@(Get-Content docs/a41-scope.md).Count` still
returns **936**, so every quotation above is from the committed version the check
audited and none of them moved under me. If the revision lands afterwards, the
citations to its sections 1, 2.2, 2.4, 4.1 and 5 must be re-verified; the
FACTS they carry were independently re-measured here and do not depend on that
file.
