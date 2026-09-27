# A44 architecture: identity and display

Seat: `loop-architect`. Written 2026-09-27. Subject: the two design questions
`docs/a44-waves-check.md` (committed `313edbb`) returned as BL-1 and BL-2, which
no revision of a wave plan can settle.

**Write set for this pass is exactly `docs/a44-architecture.md`.** Nothing under
`src/` was written, staged or reverted. No `git stash`, no `git add -A`, no
`git checkout --` was run at any point. My harness lived entirely in the session
scratchpad OUTSIDE the repository; section 12 proves there is no in-tree scratch
directory rather than asserting it.

**What this document does NOT contain, deliberately.** No wave plan, no write
sets, no oracles, no sabotage protocol, no gate commands. Section 9 states what
this design REQUIRES of the plan seat, the test-notes seat and the implementer,
in one paragraph each. Those seats own the rest.

---

## 0. How every number here was produced

**(a) Behavioural numbers execute the REAL modules.**
`src/lib/grade/{utils,types,constants}.ts` and
`src/app/components/grading-results/gradingResultsHelpers.ts` were copied by a
committed-to-disk Python script (no shell heredoc) into the session scratchpad
OUTSIDE the repo and driven with `node --experimental-strip-types`
(`node --version` -> `v22.14.0`). The copies carry import-only edits. Exit codes
read from the command, never through a pipe:

```
$ diff --strip-trailing-cr src/lib/grade/utils.ts h/utils.ts
1,3c1,3
< import type { SubmittedFileInfo, InferredFileNameLookup } from "./types";
< import type { CodeRunResult } from "../code-runner";
< import { getMimeType } from "./constants";
---
> import type { SubmittedFileInfo, InferredFileNameLookup } from "./types.ts";
> import type { CodeRunResult } from "./code-runner-stub.ts";
> import { getMimeType } from "./constants.ts";
diff exit=1
$ diff --strip-trailing-cr src/lib/grade/types.ts h/types.ts
1c1
< import type { CodeRunResult } from "../code-runner";
---
> import type { CodeRunResult } from "./code-runner-stub.ts";
diff exit=1
$ diff --strip-trailing-cr src/lib/grade/constants.ts h/constants.ts
diff exit=0                     (CANARY: the instrument does not always fire)
$ diff --strip-trailing-cr src/app/components/grading-results/gradingResultsHelpers.ts h/grh.ts
50c50
< import type { GradeActionState } from "../../actions";
---
> import type { GradeActionState } from "./actions-stub.ts";
diff exit=1
```

**(b) The proposed rule is a SECOND copy, `h/utils_a44.ts`, and its whole diff
against the import-only baseline is printed in section 3.** Every `A44` column
in every table below is that file's real output, not a transcription. It is 462
lines by `wc -l h/utils_a44.ts`, against 393 for the real `utils.ts`, i.e. the
rule costs about +69 lines in a file 607 lines under the ceiling.

Canaries that the real modules loaded and not stubs:
`removeLastExtension("a.b.c")` -> `a.b`; `getBaseFileName("a/b/c.txt")` ->
`c.txt`; `mergeStoredRowEdit({strengths:"X"}, {strengths:"Y",...}).strengths` ->
`X`; baseline `parseSubmissionFileName("src/main.py", undefined, [])` ->
`main`, which is exactly what `src/lib/grade/utils.test.ts:131-132` asserts.
Three harnesses, each run with `> file 2> file` and the exit code read on the
next line: `H1_EXITCODE=0`, `H2_EXITCODE=0`, `H3_EXITCODE=0`.

**(c) Two reimplementations, labelled everywhere their output is quoted.** The
step discriminator (which of the six branches fired), because
`matchStudentFileConvention` is module-private at `src/lib/grade/utils.ts:87`
and `parseSubmissionFileName` does not expose the step; and the PLAN's rule
(`docs/a44-waves.md` section 4.1 plus `docs/a44-test-notes.md:364-376`), because
it is not in the tree. Identity itself is always the real function. I validated
the step discriminator against `docs/a44-test-notes.md:378-382`'s own frozen
`step=` column (F3 step 6, G1 step 5, the convention zip step 3, `src/otherfile.py`
step 6) before trusting it on anything new.

**(d) Line counts by `wc -l` from the Bash tool AND by `@(Get-Content).Count`
from PowerShell. `Measure-Object -Line` was not used.** The two agree on all
eight files quoted here:

```
wc -l                                              @(Get-Content).Count
393  src/lib/grade/utils.ts                          393
390  src/lib/grade/utils.test.ts                     390
906  src/app/components/GradingResults.tsx           906
728  src/app/components/grading-results/gradingResultsHelpers.ts   728
300  src/lib/grade/extraction.ts                     300
517  src/lib/grade/engine.ts                         517
941  src/app/actions/grading.ts                      941
432  src/lib/grade/types.ts                          432
```

`LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:41`, and no
`ALLOWED_OVERAGE` entry names any file in this design (the four entries at
`:76-91` are `lms-generation.test.ts`, `lms-generation-refine.test.ts`,
`registry-helpers.assembleLectureFiles.test.ts`,
`bulkBarGroups.test.ts`).

**(e) No absolute lint warning count is pinned anywhere in this document.**
`docs/loop/this-repo.md`'s figure moved three times in one day and BL-6 is a
direct consequence; a design pass has no business quoting it.

**(f) THE TRAP THAT SHAPED SECTION 5, applied to my own numbers.**
`docs/loop/traps-spec.md`'s newest entry: *when a count appears to settle a
question, ask whether the instrument can even observe the thing it is being read
as settling.* My first sweep (40000 random path sets, seed 20260927) reported
**0 violations of both invariants for MY rule - and also 0 for the PLAN's rule,
whose collisions the check had already exhibited on fixtures.** A canary that
does not fire means the sweep is not evidence. I rebuilt it as a DIRECTED
adversarial sweep (section 5.3) in which the same two instruments fire 10267 and
9733 times out of 20000 against the plan's rule and 0 and 0 against mine. The
first sweep's zeros are reported nowhere in this document as support for
anything.

---

## 1. What was handed to me, and what I am not reopening

Settled, carried without re-derivation:

- **RULING 87.** The refusal grants amnesty only when the run shows two or more
  distinct folders elsewhere; its known-unsound shape is frozen as an exact
  integer and the real fix is filed as its own row. Section 9 states the one
  thing my rule changes about its INPUT, and section 11 states what I could not
  measure about its frozen integer.
- **RULING 92.** RULING 88 ("the display fold is unconditional") is WITHDRAWN.
  The display rule is mine to design. I accept the withdrawal and section 7
  records why the measurement behind it is right.
- **RULING 93.** An instructor's saved edit is filed under the DISPLAY, and the
  best-effort recovery of the old label is DELETED. **The test notes' R7
  requirement that storage be keyed on the identity key is therefore withdrawn**
  - see the disposition table at section 8, rows D5 and D6, so the affected
  test-notes requirements can be re-pointed rather than silently ignored.

One fact about RULING 93 that makes it cheaper than it looks, measured rather
than argued: `loadPersistedEdits`
(`src/app/components/grading-results/gradingResultsHelpers.ts:619-635`) already
iterates `Object.entries(seeded)` - the CURRENT run's displays - and reads
`parsedRecord[student]`, so a stored key absent from the current run is already
dropped. Its own comment at `:614-618` says so: *"a student who is not in the
current run ... is silently dropped rather than resurrected as a phantom row (A3
item 13)"*. **RULING 93 is implemented by writing no code at all.** Deleting the
recovery means not adding it.

---

## 2. THE TWO RULES

Stated as rules, not as a menu. Both are binding on the implementer. Both are
reachable from inputs `parseSubmissionFileName` and `groupSubmissionsByStudent`
already receive - no caller's signature changes, and nothing needs a value the
object cannot get.

### RULE K - identity

> **Define the CONTAINER-RELATIVE DIRECTORY PATH of a file as the path segments
> between its innermost container and its own leaf name, where the innermost
> container is the last entry of `zipChain` when the chain is non-empty and the
> archive root otherwise. It is `""` when the file sits directly in its
> container.**
>
> **At steps 5 and 6 of `parseSubmissionFileName` - and at NO other step - when
> the container-relative directory path is non-empty, the identity key becomes
> the length-prefixed join of that path lowercased and today's stem-fallback
> key. When it is empty, the key is the length-prefixed join of today's
> stem-fallback key alone. Steps 1, 2, 3 and 4 keep today's identity unchanged
> in substance, and are re-encoded under the same length-prefixed join so that
> the encoding is total.**

The encoding is `parts.map(p => p.length + ":" + p).join("")` and it is
uniquely decodable, so it is injective on tuples of any arity. The design
requires `utils.ts` to export the decoder.

Three things RULE K is deliberately NOT:

- **Not the immediate parent segment.** That is the plan's and the test notes'
  rule, and section 4.2 measures it leaving a two-student BLEND in place on a
  shape RULE K fixes.
- **Not the folder alone.** Discarding the leaf stem MERGES students who are
  separate today - `docs/a44-test-notes.md:360`'s G11 exists to forbid exactly
  that, and section 4.3 measures a second instance the frozen set does not
  contain.
- **Not a run-relative segment** (strip the run's common prefix, take the first
  remaining segment). Section 4.5 measures why: it is the only candidate that
  fixes ATTACK-2, and it buys that by making a file's identity depend on which
  OTHER files are in the run, which under RULING 93 is an edit-loss mechanism.

### RULE D - display

> **The display is the file's location, not a claim about which of its segments
> is the student.** At step 6 it is `<container-relative dir>/<today's display>`;
> at step 5 it is `<today's display>/<container-relative dir>` - in both cases
> PATH ORDER, with the innermost container's own name where the path puts it.
> When the container-relative directory path is empty the display is today's,
> unchanged. The fold is UNCONDITIONAL: it does not depend on whether any other
> row would share the label.
>
> **And `groupSubmissionsByStudent` ends with a TERMINAL DISAMBIGUATION PASS
> that guarantees the returned rows' `student` strings are pairwise distinct**,
> walked in identity-key order and appending ` (2)`, ` (3)`, ... to the second
> and later claimants of a label. Key order, not `Object.entries` order, so the
> assignment is a function of the FILE SET alone.

RULE D is the answer to BL-2's question - *derive the display from the key,
restore the derived-key invariant some other way, or accept collisions and make
every consumer collision-safe*. It is the middle one, and the reason it is not
the first is that the key is lowercased
(`src/lib/grade/utils.ts:125`) and the display is case-preserving, so a display
derived from the key would show `alvarezmaria` where the folder says
`AlvarezMaria`. The reason it is not the third is section 6: the third costs 43
call sites across three files including one at 906 lines, and buys nothing that
a nine-line terminal pass in the function that already owns the whole set does
not buy by checking.

**Why unconditional rather than collision-triggered.** Under RULING 93 the
display IS the storage label, so display stability across runs is edit survival.
Measured with the REAL `loadPersistedEdits`, reproducing `docs/a44-waves.md`'s
S2: under the unconditional rule an edit saved in one run survives a run whose
file set has changed (`identityKeyUnchanged=true ... EDIT SURVIVED=true`); under
the collision-triggered rule it does not (`EDIT SURVIVED=false`), because adding
a second student changes the first student's label from `essay` to
`essay (AlvarezMaria)`. The conditional rule also makes the uniqueness invariant
TRIVIALLY true - it folds exactly when labels would collide - so it cannot be
tested. Unconditional makes the invariant violable, which is why it can be an
instrument at all.

---

## 3. The whole diff the rule requires, printed

`diff --strip-trailing-cr h/utils.ts h/utils_a44.ts`, `exit=1`. This is the
proposed change, in the scratchpad, against the import-only baseline. It is
evidence, not an instruction to apply verbatim.

```
175a176,217
> function a44Wrap(id: { studentKey: string; studentDisplay: string }) {
>   return { studentKey: a44Encode([id.studentKey]), studentDisplay: id.studentDisplay };
> }
> function a44Encode(parts: string[]): string {
>   return parts.map((p) => `${p.length}:${p}`).join("");
> }
> export function a44DecodeKey(key: string): string[] | null { ... }
> export function a44ContainerRelativeDir(filePath: string, zipChain: string[]): string {
>   const normalized = filePath.replace(/\\/g, "/");
>   let rest = normalized;
>   if (zipChain.length > 0) {
>     const innermost = zipChain[zipChain.length - 1].replace(/\\/g, "/");
>     if (normalized.startsWith(`${innermost}/`)) rest = normalized.slice(innermost.length + 1);
>     else rest = getBaseFileName(normalized);
>   }
>   const cut = rest.lastIndexOf("/");
>   return cut < 0 ? "" : rest.slice(0, cut);
> }
193c235   studentKey: rawInferred.studentDisplay.toLowerCase()      -> a44Encode([...])
204c246   ...identityFromConventionMatch(leafMatch)                 -> ...a44Wrap(...)
221c263   ...identityFromConventionMatch(crossingMatch)             -> ...a44Wrap(...)
234c276   studentKey: baseInferred.studentDisplay.toLowerCase()     -> a44Encode([...])
245a288   step 5: + const relDir5 = a44ContainerRelativeDir(filePath, zipChain);
247c290   step 5: ...fallback -> encoded key + `${display}/${relDir5}` display
254a301   step 6: + const relDir6 = a44ContainerRelativeDir(filePath, zipChain);
256c303   step 6: ...fallback -> encoded key + `${relDir6}/${display}` display
315a366   groupSubmissionsByStudent: + the terminal disambiguation pass, key-sorted
```

Everything else in the file - `matchStudentFileConvention`,
`leafStemFallback`, `citationFileName`, `extension`, `mergedFileCount`, the
`localeCompare` sort, `submittedFiles`, `buildCodeExecutionNote` - is the real
file's text.

**Why the load-bearing premise of RULE K holds: a per-student FOLDER inside the
uploaded zip reaches step 6, not step 5.** `src/lib/grade/extraction.ts:118`
starts the walk with `collectFromZip(zip, 0, "", [])` - empty `parentPath`, empty
chain - and `:95`/`:106` write `zipParents[fullName]` only `if (zipChain.length > 0)`.
The file's own comment at `:43-44` says it: *"A file that never crossed a zip
boundary (a flat Canvas entry, or a folder inside the single top-level zip) has
no key here at all"*. So `Submissions/AlvarezMaria/essay.txt` inside `batch.zip`
arrives as that exact path with no chain. This is a code-read claim about
`extraction.ts`; every identity number below is executed.

---

## 4. The shapes, including every shape that refuted a previous answer

All columns executed. `today` is the real baseline copy, `PLAN` is the labelled
reimplementation of the plan's/test-notes' rule, `A44` is `h/utils_a44.ts`.

### 4.1 The shapes A44 exists to fix

| shape | today | PLAN | A44 |
|---|---|---|---|
| F3 `{AlvarezMaria,BrownTom,ChenLi}/essay.txt` | **1 row, 3 students blended** | 3 | **3** `AlvarezMaria/essay`, `BrownTom/essay`, `ChenLi/essay` |
| G8 `Submissions/{AlvarezMaria,BrownTom}/essay.txt` | **1 row, 2 blended** | 2 | **2** `Submissions/AlvarezMaria/essay`, `Submissions/BrownTom/essay` |
| G1 `bulk.zip/{3 folders}/essay.txt`, chain `["bulk.zip"]` | **1 row, 3 blended** | 3 | **3** `bulk/AlvarezMaria`, `bulk/BrownTom`, `bulk/ChenLi` |
| G2 same wrapper, distinct stems | **1 row, 2 blended** | 2 | **2** |

### 4.2 THE SHAPE THAT SEPARATES RULE K FROM THE PLAN'S RULE

Two students, each with their own folder, each folder holding `src/` and
`docs/`. This is the ordinary code-project batch and it is in no frozen set in
either sibling artifact.

```
Submissions/AlvarezMaria/src/main.py   today key="main"  PLAN key="3:srcmain"   A44 key="28:submissions/alvarezmaria/src4:main"
Submissions/AlvarezMaria/docs/r.txt    today key="r"     PLAN key="4:docsr"     A44 key="29:submissions/alvarezmaria/docs1:r"
Submissions/BrownTom/src/main.py       today key="main"  PLAN key="3:srcmain"   A44 key="24:submissions/browntom/src4:main"
Submissions/BrownTom/docs/r.txt        today key="r"     PLAN key="4:docsr"     A44 key="25:submissions/browntom/docs1:r"

TODAY rows=2 ["main#2","r#2"]   <- Alvarez's main.py MERGED with Brown's main.py
PLAN  rows=2                    <- SAME MERGE. The immediate parent is "src" for both students.
A44   rows=4 ["Submissions/AlvarezMaria/docs/r","Submissions/AlvarezMaria/src/main",
              "Submissions/BrownTom/docs/r","Submissions/BrownTom/src/main"]   <- no merge
```

The plan's rule is not wrong here in the sense of a regression - it reproduces
today - but it leaves A44's own headline harm class in place one directory level
down, and nothing in either sibling artifact says so. RULE K fixes it, at the
cost of two rows per student instead of one. That cost is the class
`docs/a44-test-notes.md:352` already froze as **THE ACCEPTED FALSE SPLIT**
(G3, `backend/config.py` + `frontend/config.py`, one owner, `rowsAfter` 2).

### 4.3 The shared-wrapper folder - and a second instance G11 does not cover

`docs/a44-test-notes.md:360`'s G11 forbids folder-alone identity because it
would collapse three students in one folder. Executed, G11 holds under RULE K
(3 rows in, 3 rows out). Here is a second instance of the same forbidding, which
G11's distinct-numbered stems do not reach:

```
Submissions/alvarez-essay.txt   today key="alvarez"   A44 key="11:submissions7:alvarez"
Submissions/brown-essay.txt     today key="brown"     A44 key="11:submissions5:brown"
TODAY rows=2 ["alvarez","brown"]      A44 rows=2 ["Submissions/alvarez","Submissions/brown"]
```

`leafStemFallback`'s `^([A-Za-z0-9]+)` truncation at the hyphen
(`src/lib/grade/utils.ts:123-124`) is the ONLY discriminator these two students
have. A folder-alone key destroys it and blends them; RULE K keeps it because
the stem stays in the key. And the same shape with one stem and two extensions
(`docs/a44-test-notes.md:353`'s G4, `Submissions/essay.docx` +
`Submissions/essay.pdf`) is genuinely undecidable and stays one row under RULE
K, which is what leaves RULING 87's refusal something to refuse.

### 4.4 The adversarial leading-space filename - BL-2's own attack

`leafStemFallback` calls `.trim()` after the `^([A-Za-z0-9]+)` match fails
(`src/lib/grade/utils.ts:123-124`), so a leading space lets the WHOLE stem
survive as an identity. That is the lever BL-2 used. Driven against the real
`seedEdits` and the real `fanOutGradingPostResult`:

```
files: " essay (AlvarezMaria).docx"  and  "AlvarezMaria/essay.docx"

TODAY     displays=["essay","essay (AlvarezMaria)"]
          rows=2  seedEdits slots=2  fanOut entries=2
PLAN      displays=["essay (AlvarezMaria)","essay (AlvarezMaria)"]
          rows=2  seedEdits slots=1  fanOut entries=1
          fanOut={"essay (AlvarezMaria)":{"status":"posted"}}   <- the FAILED post reported as posted
A44       displays=["AlvarezMaria/essay","essay (AlvarezMaria)"]
          rows=2  seedEdits slots=2  fanOut entries=2
          fanOut={"AlvarezMaria/essay":{"status":"error","message":"Canvas rejected 101"},
                  "essay (AlvarezMaria)":{"status":"posted"}}
```

RULE D closes this by construction rather than by checking: a leaf base name can
never contain `/` (`getBaseFileName` splits on it and returns the last segment,
`src/lib/grade/utils.ts:34-38`), so a flat file's display can never contain `/`
and can never forge a foldered row's display. The same lever also forges the
PLAN's compound KEY, which is strictly worse than a display collision because it
merges two students into one row:

```
flat file " 12:alvarezmariaessay.docx"  -> today/PLAN key="12:alvarezmariaessay"
"AlvarezMaria/essay.docx"               -> PLAN compound key="12:alvarezmariaessay"
PLAN KEYS COLLIDE (two students merged into one row) = true
PLAN rows=1 grouping={"12:alvarezmariaessay":[" 12:alvarezmariaessay.docx","AlvarezMaria/essay.docx"]}

A44 keys "20:12:alvarezmariaessay" vs "12:alvarezmaria5:essay"   COLLIDE = false
A44 rows=2 displays=["12:alvarezmariaessay","AlvarezMaria/essay"]
```

This is why RULE K re-encodes steps 1-4 as well. A partial encoding leaves the
un-encoded namespace forgeable; a total one does not. `docs/a44-test-notes.md`'s
G13 (`x/_a::b.docx` + `x::_a/b.docx`) tests the separator between the two
components and passes under both rules; the shape above tests the boundary
between the folded and un-folded namespaces and only the total encoding survives
it.

### 4.5 One student's legitimate resubmission

| shape | today | A44 | verdict |
|---|---|---|---|
| F2/G10 two convention files, one student, two dates | 1 | **1** `janedoe` | step 2, untouched by the fold |
| F6 `AlvarezMaria/Homework {Final,Draft}.docx`, one owner | 1 | **1** `AlvarezMaria/Homework` | not split; the shared stem keeps them together |
| ATTACK-2 `AlvarezMaria/{part1,part2}/essay.txt`, one owner | **1, correct** | **2** `AlvarezMaria/part1/essay`, `AlvarezMaria/part2/essay` | **SPLIT. Section 10, limitation L1.** |

ATTACK-2 is why I rejected the run-relative candidate rather than adopting it.
It is the only candidate that fixes ATTACK-2: strip the run's longest common
directory prefix (`AlvarezMaria`) and the two files' remaining first segments are
`part1` and `part2` - which still differ, so in fact **it does not fix ATTACK-2
either.** What it does fix is section 4.2, where the common prefix is
`Submissions` and the first remaining segments are the two student names. RULE K
fixes section 4.2 too, without making a file's identity depend on the run's
composition. Since the run-relative rule buys nothing RULE K does not have and
costs the S2 edit loss, it is refused.

### 4.6 Where RULE K is neutral, checked so it is not re-litigated

BL-1's flagship refutation - a code project inside per-student zips - was aimed
at a fold that reaches step 5 via the immediate parent. RULE K also folds at
step 5, and BL-1's measurement of the cost reproduces exactly:

```
JaneDoe.zip/{src,docs} + JohnDoe.zip/{src,docs}, chains ["JaneDoe.zip"] / ["JohnDoe.zip"]
TODAY rows=2 ["JaneDoe#2","JohnDoe#2"]       <- correct today
A44   rows=4 ["JaneDoe/docs","JaneDoe/src","JohnDoe/docs","JohnDoe/src"]
```

**I am keeping the step-5 fold, and the reason is a measured trade, not a
preference.** Removing it would keep this shape at 2 correct rows - and would
leave G1's three-student blend (section 4.1) unfixed, because G1 and this shape
are the SAME syntactic input with opposite identity roles: a zip plus one
subfolder, where in G1 the zip is a shared wrapper and the folder is the student,
and here the zip is the student and the folder is a subdirectory. No per-file
rule can tell them apart. The criterion I am applying is the one already frozen
in this design at `docs/a44-test-notes.md:352`: **prefer a visible split over an
invisible blend.** A split shows the instructor two rows whose labels both
contain the student's own name, which is recoverable; a blend shows one row with
a confident grade computed from two students' work, which is not. Section 10
names the cost as L1 rather than leaving it to be found.

Neutral, executed, no change:

```
F7  per-student zips matching the convention (step 3)        2 rows -> 2 rows
G10 convention leaf under two wrappers, one student (step 2) 1 row  -> 1 row
F4  "Homework {Final,Draft}.docx" flat, no dir               1 row  -> 1 row  REFUSE
F9  "Essay.docx" + "essay.docx" flat                         1 row  -> 1 row  REFUSE
ATTACK-1b janedoe.zip/main.py, relDir=""                     1 row  -> 1 row, display unchanged
    (the PLAN produced "janedoe (janedoe.zip)" here; RULE K does not fold an empty relDir)
utils.test.ts:361-375's own four-file fixture                4 rows -> 4 rows, 4 distinct
```

---

## 5. THE INVARIANTS

Two, both stated as something a test can execute over arbitrary input rather
than over a fixture, and both violable.

### 5.1 INVARIANT M - monotone refinement

> **For any `submissions`/`zipParents` pair, the partition of file paths into
> rows after A44 is a REFINEMENT of the partition before. For every pair of
> paths `x`, `y`: if `x` and `y` share a row after, they shared a row before.
> Equivalently: A44 may SPLIT a row, and may never MERGE two rows.**

This is the invariant that carries A44's whole safety claim, and it is the one
that kills the folder-alone variants (section 4.3) - those merge, so they fail
it. It holds for RULE K by construction: the step-6 and step-5 keys are a
function of today's key plus the container-relative dir, and the encoding is
injective, so two paths with different pre-A44 keys always get different post-A44
keys. The encoding being TOTAL is what makes the proof hold; the partial
encoding the plan proposed fails it, measured, at section 4.4.

**What breaks if it does not hold:** exactly A44's own bug, re-introduced. Two
students in one row, one grade, one set of feedback, and nothing in the UI that
distinguishes it from a correct row - `docs/a41-test-notes.md:229-231` is the
frozen trace of that state, where three students' files all report
`key="essay" display="essay" citation="essay.txt"`.

### 5.2 INVARIANT D - display uniqueness within a run

> **For any input, the rows returned by `groupSubmissionsByStudent` have
> pairwise-distinct `student` strings:
> `new Set(rows.map(r => r.student)).size === rows.length`.**

This is not new language. `src/lib/grade/utils.test.ts:352-358` already states
it as the reason it matters: *"groupSubmissionsByStudent's returned rows must
never let two DIFFERENT keys collapse onto the same displayed `student` string -
that would let two independently-graded rows look like duplicates of each other
(or, worse, one silently overwrite the other in anything keyed on the display
string, as GradingResults.tsx does...)"*. What exists today is a FIXTURE test of
it at `:361-375`, over one four-file input. RULE D makes it an invariant with an
enforcer.

**What breaks if it does not hold, naming the specific consumers among the 43.**
Both executed above at section 4.4, against the real functions in the real file:

- `seedEdits` (`src/app/components/grading-results/gradingResultsHelpers.ts:280-298`,
  `seeded[result.student] = {` at `:287`) returns **one slot for two rows**.
  One student's entire seeded feedback - total, overall, strengths, improvements,
  rubric areas - is gone before the page opens.
- `fanOutGradingPostResult` (`:703-727`, keying `next[row.student]` at `:717`,
  `:722`, `:725`) returns **one entry for two attempts, and reports a FAILED
  Canvas post as `{"status":"posted"}`.** An instructor is told a grade reached
  Canvas that did not.
- `loadPersistedEdits` (`:619-635`) merges into `merged[student]`, so the
  surviving row's stored edit is applied to whichever row wins and the other row
  silently inherits it.
- `correctUngradedFeedbackSeed`'s caller
  (`src/app/components/grading-results/ungradedDisclosure.ts:191-193`,
  `next[result.student]`) writes one row's ungraded-disclosure correction over
  the other's.

`fanOutGradingPostResult` is an **exported pure function in a plain `.ts`
file**, which is the check's MA-1 correction and it matters here: the most
damaging consequence of a display collision is testable without rendering
anything. `docs/a44-waves.md` locates this fan-out at
`GradingResults.tsx:332-403` and routes it to owner-only verification. That is
the wrong file.

### 5.3 The instruments fire, demonstrated before the zeros are quoted

Directed adversarial sweep, seed 20260927, 20000 sets, each set containing one
foldered path and a flat companion crafted from it (a leading space defeats
`leafStemFallback`'s regex, so the whole crafted stem survives):

```
PLAN rule: INVARIANT M violations = 10267   INVARIANT D violations = 9733
A44  rule: INVARIANT M violations =     0   INVARIANT D violations =     0

CANARY, a PLAN M violation: ["BrownTom/config.pdf"," 8:browntomconfig.pdf"]
CANARY, a PLAN M violation: ["a::b/main.pdf"," 4:a::bmain.txt"]
CANARY, a PLAN D violation: [["1:xessay","essay (x)"],["essay (x)","essay (x)"]]
CANARY, a PLAN D violation: [["4:a::bmain","main (a::b)"],["main (a::b)","main (a::b)"]]

(and: today's own derived-key invariant was asserted on every one of the 20000
 sets and never violated - the harness throws if it is, and did not. This
 independently confirms docs/a44-scope.md 4.1's construction claim, that every
 return site of parseSubmissionFileName sets studentKey = studentDisplay
 lowercased, verified in the tree at utils.ts:116, 125, 193, 234.)
```

**The terminal pass is not decoration, and it is not vacuous.** Removed, the
directed sweep above still reports 0 INVARIANT D violations for RULE K - so the
flat-forgery family does not reach RULE D at all. The shape that does is a
cross-step ambiguity, where a step-5 display and a step-6 display construct the
same path string from different components:

```
"JaneDoe.zip/src/deep/main.py" (chain ["JaneDoe.zip"])  key="8:src/deep7:janedoe"  display="JaneDoe/src/deep"
"JaneDoe/src/deep.txt"                                   key="11:janedoe/src4:deep" display="JaneDoe/src/deep"
distinct keys=2  distinct displays=1  -> WITHOUT the terminal pass, an INVARIANT D violation

WITH the terminal pass:
  rows=2 displays=["JaneDoe/src/deep","JaneDoe/src/deep (2)"] distinct=2
  seedEdits slots=2 (rows=2)
  fanOut entries=2 {"JaneDoe/src/deep":{"status":"error",...},"JaneDoe/src/deep (2)":{"status":"posted"}}
```

And it is order-independent, which is what makes it safe to key storage on:

```
orderA=["JaneDoe/src/deep#1","JaneDoe/src/deep (2)#1"]
orderB=["JaneDoe/src/deep#1","JaneDoe/src/deep (2)#1"]
IDENTICAL=true
```

---

## 6. Why ZERO of the 43 display-keyed sites change

I re-derived the census myself, by construction rather than by enumerating
identifier names, and reproduce the check's 43 against the three artifacts' 30:

```
$ grep -rnE "\[[A-Za-z_][A-Za-z0-9_.]*\.student\]|\[student\]|\[codeOutputStudent\]|\.student ===|=== *codeOutputStudent|\[[A-Za-z_][A-Za-z0-9_]*Student\]" src \
    --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -vE ":[0-9]+: *(//|\*|/\*)" | cut -d: -f1 | sort | uniq -c
  34 src/app/components/GradingResults.tsx
   7 src/app/components/grading-results/gradingResultsHelpers.ts
   2 src/app/components/grading-results/ungradedDisclosure.ts
   (6 in unrelated files: message-serialization.ts, offline-identity.ts,
    message-reply-prompt.ts, courses.row.ts, two workflow step files)
exit=0
CANARY, same command, one clause only: 37 lines, so the instrument reads .tsx.
```

34 + 7 + 2 = **43**. Every one of them keys on the DISPLAY. Under RULE D the
display is unique within a run and remains a printable string, so all 43 keep
working with no edit - and the reason is now INVARIANT D with an enforcer, not
an assertion that a separator is injective.

**Two things I checked because RULE D puts a `/` in the display for the first
time.** A `/` is safe in a JSON object key, in a `localStorage` value, and in a
CSV cell that is always quoted (`escapeCsvCell`,
`src/app/components/grading-results/gradingResultsHelpers.ts:475-478`, wraps
every value in `"` unconditionally). The two places a `/` would break something
are a download filename and a URL. Neither receives the display:

```
$ grep -rnE "\.student" src --include=*.ts --include=*.tsx | grep -v "\.test\." \
    | grep -iE "encodeURI|download|filename|file_name|href|slug|path|url|\.csv|sanitiz"
src/lib/canvas/submissions.ts:178:    const sanitized = work.student.toLowerCase().replace(/[^a-z0-9]/g, "") || "student";
src/lib/roster-row-checks.ts:74:  const suffix = repoSlug(row.student.trim() || row.username.trim()) || "student";
exit=0   (CANARY for the same command without the second filter: 453 lines)
```

`submissions.ts:178` is `work.student` on a `CanvasStudentWork`, a Canvas API
object and not a grouped row, and it strips every non-alphanumeric anyway.
`roster-row-checks.ts:74` is a roster row `{student, username}`, a different
object. The grading surface's own two download paths take neither:
`GradingResults.tsx:520` calls `buildDownloadFilename(name, extension)` on the
submitted FILE's name (`gradingResultsHelpers.ts:471-473`), and `:532` uses the
constant `"grading-results.csv"`.

**And the identity key never leaves `utils.ts`**, which is what makes RULE K's
re-encoding free:

```
$ grep -rn "studentKey" src --include=*.ts --include=*.tsx
  -> src/lib/grade/utils.ts:114, 116, 121, 125, 181, 193, 234, 276
  -> and src/lib/course-intel/{engagement,offline-assembly,offline-signals}.ts
     plus their tests, which is a DIFFERENT studentKey (course-intel's roster
     identity, `readonly studentKey: string | null` at offline-signals.ts:72)
exit=0
```

Nothing outside `src/lib/grade/utils.ts` reads the grade identity key, including
through the `src/lib/grade.ts:14` barrel, which re-exports
`inferStudentPrefix` but has no consumer of its `.key`.

**Consequence for scope, stated for the plan seat rather than decided here:**
`src/app/components/GradingResults.tsx` (906 lines, 94 of headroom) and
`src/app/actions/grading.ts` (941) are not required by this design to change,
and neither is `src/lib/grade/types.ts`, because RULING 93 leaves storage keyed
on the display and so the row never has to carry its key. `gradingResultsHelpers.ts`
is not required to change either, for the reason in section 1: RULING 93 is
satisfied by the code that is already there.

---

## 7. RULING 92 and RULING 93 - accepted, with one correction to the framing

I was invited to disprove either. I cannot, and section 5.3 is my own
re-derivation of the measurement behind RULING 92: the plan's unconditional fold
manufactures a display collision 9733 times in 20000 directed sets, and the
consequences at `seedEdits` and `fanOutGradingPostResult` are executed, not
argued. RULING 92's withdrawal of "unconditional" as a RULING is right, and the
design it hands back is RULE D - which is still unconditional in the FOLD and
adds the thing RULING 88 was missing, a terminal enforcer.

RULING 93 is right for the reason given and for one more I measured: it costs no
code (section 1), which keeps both near-ceiling files out of every write set on
a construction rather than on an optimistic reading of "zero orphaned".

**One correction, offered because the brief asks for it and it changes how the
residual should be written, not the verdict.** BL-1's class is *"a no-harm claim
asserted over a fixture set that contains no instance of the shape that refutes
it."* That is exactly right about `docs/a44-waves.md`'s "strictly better than
today and never worse". It is NOT right as applied to the sibling test notes:
`docs/a44-test-notes.md:439` measures a shape named
`single-student-multi-folder-shared-filename` at `splitBefore 0 -> splitAfter
19440 (97.8%)`, and `:469-470` calls it *"the accepted regression"* with 100% of
it unrefused. **ATTACK-2's shape was measured, by the seat whose oracle BL-1
says lacks it, and accepted.** So the open question was never "does anybody know
about this split" - it was "is a 97.8% false-split rate on that shape
acceptable", which is a judgement nobody had written down. Section 10's L1
writes it down.

---

## 8. Disposition of every prior design requirement

Each prior requirement is KEPT, HANDED OVER, or WITHDRAWN. The id column was
re-derived last, after all renumbering.

| id | Prior requirement, with its source | Disposition |
|---|---|---|
| D1 | `docs/a44-waves.md` 4.1: fold the file's own IMMEDIATE ENCLOSING FOLDER segment into the key at step 5 or 6 | **WITHDRAWN.** Replaced by RULE K's container-relative directory PATH. Reason: section 4.2 measures the immediate parent leaving a two-student blend in place. Enforcer it protected: none existed. |
| D2 | `docs/a44-waves.md` 4.1 construction 1: the key's representation is left undecided between a length-prefixed join and a tuple, "what is binding is that the construction cannot collide" | **KEPT and DECIDED.** RULE K fixes it as the length-prefixed join, applied TOTALLY (all six return sites), and requires an exported decoder. Section 4.4 measures why a partial encoding is not enough - it was, in fact, collidable. |
| D3 | `docs/a44-waves.md` 4.3: the display is suffixed ` (<folder>)`, and "key unchanged implies display unchanged BY CONSTRUCTION" | **WITHDRAWN as to the spelling, KEPT as to the goal.** RULE D achieves display stability across runs (the goal) by the unconditional fold, and achieves within-run uniqueness by the terminal pass rather than by a construction claim the check refuted (its MA-2). |
| D4 | `docs/a44-waves.md` 4.3 Fact 3 / section 10: a read-only legacy fallback inside `loadPersistedEdits` recovers the pre-fold label | **WITHDRAWN by RULING 93**, which this document transcribes rather than re-decides. Enforcer it protected: the A44 row's "zero saved instructor edits may be orphaned" clause (`docs/BACKLOG.md:118`). Replacement named: `loadPersistedEdits`'s existing drop-unknown-keys behaviour at `gradingResultsHelpers.ts:614-635`, plus L3 in section 10 for the one-time loss. |
| D5 | `docs/a44-test-notes.md` R7: "The requirement's object is the identity key, not the display string", with P1/P2 executed and a 173/0 reference implementation keyed on the identity key | **WITHDRAWN by RULING 93.** Storage stays display-keyed with no recovery. **Every R7 requirement, the P1/P2 pair, and the 173/0 score's storage clause must be re-pointed at the display**, not ignored. Handed to: the test-notes seat. |
| D6 | `docs/a44-test-notes.md` RES-A44T-6: `grading.ts` at 941 and `GradingResults.tsx` at 906 "are where this row's wiring goes", owner assigned to the wave whose write set includes either | **WITHDRAWN as a prediction.** Section 6 measures that this design requires no edit to either, and that the identity key never leaves `utils.ts`. The residual's owner assignment has nothing left to trigger on. |
| D7 | `docs/a44-test-notes.md` R10: the fold "is SET-LEVEL by necessity - it depends on whether another row would share the display" | **WITHDRAWN.** Measured, the collision-triggered form loses an instructor's edit whenever the run's composition changes (S2, `EDIT SURVIVED=false`), and makes INVARIANT D untestable. What IS set-level is the terminal pass, which is a different thing: it adjusts a label AFTER identity is fixed, and never changes which files share a row. |
| D8 | `docs/a44-test-notes.md` R11: "RED when two rows share a display" | **KEPT, and promoted.** Under D7's rule it was trivially satisfied; under RULE D it is INVARIANT D, violable and with a demonstrated violating shape (section 5.3). This is the one prior requirement my design makes STRONGER rather than weaker. |
| D9 | `docs/a44-scope.md` section 8, third requirement: whichever construction discharges the migration requirement "touches storage, which has 30 display-keyed call sites across three files ... a wave that changes fewer of them ships a partial fix with the same gates green" | **WITHDRAWN, with its ground stated rather than passed over in silence** (which is the check's MA-4). The count is 43, not 30 (section 6). This design changes ZERO of them, and the ground is INVARIANT D with an enforcer plus RULING 93's no-recovery, not an assertion that they are unaffected. |
| D10 | `docs/a44-scope.md` section 8, first requirement: raise today's refusal rate | **KEPT as refused.** The check confirmed the plan's refusal of it is correct (today's rate is 0%, so there is no 14.6% to raise) and I did not re-derive it. |
| D11 | RULING 87: amnesty only when the run shows 2 or more distinct folders elsewhere, its unsound shape frozen as an exact integer | **KEPT.** RULE K changes what "a folder" means for this predicate - the container-relative PATH, not one segment. On every fixture in either frozen set the two definitions give the same folder SET, because every fixture's dir is one segment deep except G8, where both give two distinct values. Section 11 states what I could not verify about the frozen integer. |

---

## 9. What this design REQUIRES of each downstream seat

**Of the wave-plan seat.** This design requires `src/lib/grade/utils.ts` to grow
by about 69 lines (393 measured, 462 in the harness variant, both `wc -l`), and
requires that file to be the only home of the identity change - the encoder, the
container-relative-dir helper, both fallback return sites, the four re-encoded
return sites, and the terminal pass are all inside it. It requires **three new
exports from that file, and this is the answer to BL-5**: the key decoder, the
container-relative-dir helper, and a `reachedStemFallback` discriminator on
`parseSubmissionFileName`'s return, because a decoded key's ARITY distinguishes
foldered from un-foldered but cannot distinguish a convention match from a
dir-less fallback, and RULING 87's amnesty predicate needs exactly that
distinction. Without those three, a later wave must re-implement the identity
algorithm in production code, which is the divergence this repo has a standing
rule against. The plan must re-run its own write-set intersection after adding
them, and must not assume `gradingResultsHelpers.ts`, `GradingResults.tsx`,
`grading.ts` or `types.ts` are in any write set on this design's account -
section 6 measures that none of them is required, and section 1 measures that
RULING 93 needs no code.

**Of the test-notes seat.** This design requires two invariant instruments, not
two fixture tests: INVARIANT M and INVARIANT D as stated at section 5.1 and
5.2, each over generated input rather than over a frozen set, because a fixture
test of INVARIANT D is what exists today at
`src/lib/grade/utils.test.ts:361-375` and it is exactly what fails to catch the
collision. It requires the sabotage for INVARIANT D to be the CROSS-STEP shape
at section 5.3 and not the flat-forgery family, which the sweep shows does not
reach RULE D at all - a sabotage drawn from the wrong family will appear to
prove the terminal pass is unnecessary. It requires the frozen displays at
`docs/a44-test-notes.md:364-376` to be re-derived under RULE D (section 10.2
lists which change), R7's storage clause to be re-pointed per disposition row
D5, and the eleven-shape sweep to be re-run under RULE K, since I could not
(section 11). Any instrument it writes that names two or more test files must
be spelled `npm run test:paths <p1> <p2> ...`, never a raw multi-path
`vitest`/`npm test`, which silently drops unmatched arguments.

**Of the implementer.** This design requires the encoding to be applied at ALL
SIX return sites of `parseSubmissionFileName` in the same change, because a
partial encoding is measurably forgeable (section 4.4) and a half-applied one is
worse than none. It requires the terminal pass to walk in identity-KEY order,
not `Object.entries` order and not display order, or the ` (2)` suffix attaches
to a different student between runs and RULING 93's storage silently loses
edits - section 5.3's order-independence check is the thing to reproduce. It
requires `citationFileName`, `extension`, `mergedFileCount`, `submittedFiles`
and the `localeCompare` row sort to be left alone; `utils.test.ts:192-197` pins
the citation name staying a bare leaf and is the guard against a naive
parentPath-everywhere rewrite.

---

## 10. What this design CANNOT do

Named here rather than left to be found, because A44's own history is two
artifacts each claiming no harm over a set that contained no instance of the
shape that refuted it.

### 10.1 The limitations

**L1 - ONE STUDENT'S OWN SUBDIRECTORIES ARE SPLIT INTO SEVERAL GRADED ROWS, AND
THIS IS A REGRESSION, NOT AN UNFIXED BUG.** Executed: `AlvarezMaria/part1/essay.txt`
+ `AlvarezMaria/part2/essay.txt`, one owner, goes from **1 correct row today** to
**2 rows each holding half the work and each scored against the whole rubric.**
Same for a code project inside a per-student zip (section 4.6, 2 rows -> 4). The
sibling test notes measure this shape at **97.8% of sets, 100% of them
unrefused** (`docs/a44-test-notes.md:439`). I cannot fix it and I can prove
nobody can fix it from the path alone: `Submissions/AlvarezMaria/essay.txt` +
`Submissions/BrownTom/essay.txt` (two students, must split) and
`AlvarezMaria/part1/essay.txt` + `AlvarezMaria/part2/essay.txt` (one student,
must not) are the same syntactic input with opposite required outputs, at every
candidate depth, under every candidate rule including the run-relative one
(section 4.5). The judgement I am making, explicitly: **a visible split is
preferable to an invisible blend**, because each split row's label contains the
student's own folder name and an instructor can see and correct it, whereas a
blended row shows one confident grade computed from two students' work under a
name that looks right. That judgement is what `docs/a44-test-notes.md:352`'s G3
already froze; L1 is the same judgement applied at greater depth and at step 5.

**L2 - A DISPLAY THAT IS DISAMBIGUATED BY THE TERMINAL PASS IS NOT STABLE ACROSS
RUNS.** A row whose label needed a ` (2)` gets it because another row claimed the
same label; remove that other file from the batch and the suffix disappears, and
under RULING 93 the edit saved against `X (2)` is lost. RULE D is run-independent
for every row the terminal pass does not touch, which is the overwhelming
majority, and section 5.3 shows the pass requires a cross-step path ambiguity to
fire at all. I am not fixing L2 because fixing it means either a stable
tie-break the display cannot carry, or storage keyed on something other than the
display, which RULING 93 settled.

**L3 - EVERY PRE-A44 INSTRUCTOR EDIT ON A FOLDER-SHAPED UPLOAD IS LOST ONCE.**
This is RULING 93's accepted cost, not a defect of my rule, and I record it
because it is the one user-visible consequence of this design that no test will
ever show. It is a reading claim about what the instructor sees: empty feedback
fields on the first run after the upgrade, for batches whose rows were
folder-derived.

**L4 - A14's SANITIZED-NAME COLLISION IS UNTOUCHED.** Two students whose first
underscore-separated part is identical still merge, at step 2, and INVARIANT M
permits it because it is today's behaviour.
`src/lib/grade/utils.test.ts:325-334` pins it as a known-open merge and
`docs/a44-test-notes.md`'s F1 records it as the declared survivor. RULE K cannot
reach it: step 2 never consults a folder.

**L5 - EVERY CLAIM HERE ABOUT WHAT THE INSTRUCTOR SEES IS A READING CLAIM.** No
component is rendered by any test in this repository. That `AlvarezMaria/essay`
reads better than `essay (AlvarezMaria)` in a table of rows, that a ` (2)` suffix
is legible as a disambiguator rather than as part of a filename, and that a
long `Submissions/AlvarezMaria/src/main` label does not overflow its cell are
all unverified by anything I ran. L5 is why the display shape belongs in a UX
pass's residual (R3 below) and not in a test's pass condition.

### 10.2 Which frozen fixtures change verdict

Every artifact downstream reads these, so each is named with the line that
freezes it. **A frozen oracle may be changed, never silently.**

**`docs/a44-test-notes.md` - the `rowsAfter` column is UNCHANGED for all 23
fixtures.** Every one of the 23 was driven through the real baseline and the
variant, in one run, `H4_EXITCODE=0`:

```
TRANSCRIPTION CHECK: rowsToday mismatches = 0
    (checked FIRST and against the frozen rowsToday column, so a mismatch here
     would mean my transcribed inputs are wrong rather than the rule)
RULE K vs FROZEN rowsAfter:  mismatches = 0
INVARIANT D violations across all 23 fixtures = 0
```

Row counts, in fixture order: F1 1, F2 1, F3 3, F4 1, F5 3, F6 1, F7 2, F8 4,
F9 1, F10 1, G1 3, G2 2, G3 2, G4 1, G5 3, G6 2, G7 1, G8 2, G9 1, G10 1, G11 3,
G12 3, G13 2 - identical to `:341-362`. **The rows column survives RULE K
intact.** What changes is the display column, and only the display column:

| what | frozen at | changes to | why |
|---|---|---|---|
| G8's class label "nested folders, immediate parent wins" | `:357` | "the whole container-relative path wins" | RULE K; the row COUNT is unaffected |
| G8's displays `["essay (AlvarezMaria)","essay (BrownTom)"]` | `:375` | `["Submissions/AlvarezMaria/essay","Submissions/BrownTom/essay"]` | RULE D, and the path is two segments deep |
| F3's displays `["essay (AlvarezMaria)",...]` | `:369` | `["AlvarezMaria/essay","BrownTom/essay","ChenLi/essay"]` | RULE D's spelling |
| F8's displays `["alvarezmaria","browntom","reflection (ChenLi)","reflection (DavisAnn)"]` | `:370` | `["alvarezmaria","browntom","ChenLi/reflection","DavisAnn/reflection"]` | RULE D's spelling; the two CONVENTION rows stay bare, correctly |
| G1/G2's displays `["bulk (AlvarezMaria)",...]` | `:371-372` | `["bulk/AlvarezMaria",...]` | RULE D at step 5, path order |
| G3's displays `["config (backend)","config (frontend)"]` | `:373` | `["backend/config","frontend/config"]` | RULE D's spelling |
| G5's first display `"essay"` | `:374` | `"Shared/essay"` | the fold is UNCONDITIONAL; the `Shared` row did not collide, so the conditional rule left it bare |
| F6's display `["Homework"]` | `:376` | `["AlvarezMaria/Homework"]` | same - a single foldered row now folds |
| G7's display `["otherfile"]` | `:376` | `["src/otherfile"]` | same |
| the `compound` key column | `:378-382` | all five entries; e.g. `"12:alvarezmariaessay"` -> `"12:alvarezmaria5:essay"`, and `"janedoe"` -> `"7:janedoe"` | RULE K's TOTAL length-prefixed encoding, including the step-3 row |
| F4's `["Homework"]`, F9's `["Essay"]` | `:376` | UNCHANGED | flat, no directory, no fold |

**`docs/a41-test-notes.md` - `rowsOut` and `DECISION` are unchanged** (they
describe today), but the per-path trace at `:229-231` pins
`key="essay" display="essay"` for all three F3 paths, and the display half of
that becomes `AlvarezMaria/essay` / `BrownTom/essay` / `ChenLi/essay` once A44
ships. A41's F3 1 -> 3 and F8 3 -> 4, with F4/F6/F9 staying REFUSE, are exactly
what `docs/a44-waves-check.md` BL-4 records both siblings agreeing on, and RULE
K reproduces all five.

**`src/lib/grade/utils.test.ts` - exactly three existing assertions change, and
none of them is a row count.** I enumerated every fixture in the file:

- `:128-131`, `parseSubmissionFileName("src/main.py", undefined, [])` with
  `expect(parsed.studentDisplay).toBe("main")` at `:130`, becomes `"src/main"`.
- `:133-136`, the same path with the chain argument omitted entirely (the
  un-migrated-caller control), `expect(...).toBe("main")` at `:135`, becomes
  `"src/main"`.
- `:366`'s `"src/otherfile.py"` inside the uniqueness fixture yields
  `"src/otherfile"`. **The assertion at `:373`
  (`expect(new Set(students).size).toBe(students.length)`) itself still
  passes** - 4 rows, 4 distinct displays, executed.
- Everything at `:160-353` resolves at step 2 or step 3 and is byte-identical,
  including all four A14 crossing-chain controls, the multi-layer wrapper, the
  `CS101_Fall_2026_submissions.zip` narrowest-first shape, and both
  sanitized-name-collision cases.

Two of those three are `it()` descriptions that say "matches today's exact
leaf-stem output"; the description as well as the expectation needs rewriting,
or the file acquires a stale comment of exactly the kind
`docs/a44-waves.md` 7.3 already catalogues two of in this same file.

---

## 11. What I could not determine

**The eleven-shape sweep at `docs/a44-test-notes.md:427-439` cannot be re-run
under RULE K, by me or by anyone, because its generator is not in the tree.**

Checked at two scopes, because an absence claim that only covers `src` does not
answer "is it anywhere":

```
$ grep -rln "single-student-multi-folder-shared-filename|nested-bulk-perstudent-folders" src
No files found
(CANARY, same tool and same path: "groupSubmissionsByStudent" -> matches)

$ grep -rln "single-student-multi-folder-shared-filename\|nested-bulk-perstudent-folders" . \
    --include=*.ts --include=*.tsx --include=*.py --include=*.js
exit=1
$ same command, same filters, pattern "groupSubmissionsByStudent"
./.claude/worktrees/friendly-meninsky-8032bc/src/lib/grade.ts
./src/lib/grade/engine.ts
./src/lib/grade/extraction.test.ts            canary exit=0
```

That canary also surfaces the known hazard that a stale
`.claude/worktrees` copy is returned alongside the real tree. **Every path this
document reads or measures is an explicit path under the repository root; no
`Glob` result was used to choose a file**, so nothing here was measured against
the worktree copy.

It lived in that seat's scratchpad. This matters for exactly one number: RULING
87's frozen exact integer, and the `UNSOUND` column's `2159 (10.8%)` for
`mixed-perstudent-plus-shared-dropbox` / `duplicate-folder-name`. My reasoning is
that RULE K and the immediate-parent rule give the same folder SET whenever every
path in a shape is one directory deep, which is what the shape definitions at
`docs/a41-test-notes.md:190-199` describe (`folder` = `<student>/<stem>.<ext>`) -
so the integer should hold. **I did not verify that the a44 generator's five
additional shapes are all one deep, and I am not adopting either value
silently.** The test-notes seat owns re-running it; R1 below carries it.

**One thing that is a genuine design residual rather than a measurement gap.**
RULE K fixes section 4.2's blend by using the whole container-relative path. If a
future shape appears where two students' full paths are identical and only
something ABOVE the container distinguishes them, RULE K has nothing left to use
- the innermost container is where its information ends by definition. I
constructed no such shape and do not believe one exists inside a single uploaded
archive, but I have not proved it and am not claiming it.

---

## 12. Residual register

Each entry names an owner, an instrument, and the step that will measure it.
Anything missing one of the three is a deletion and is called one.
**A residual that is not in `docs/BACKLOG.md` does not exist**, so all five are
written to be filed there by the orchestrator; I did not touch
`docs/BACKLOG.md` or `docs/backlog.yml`.

| id | Residual | Owner | Instrument | Step that measures it | Direction of failure |
|---|---|---|---|---|---|
| R1 | RULING 87's frozen exact integer and the `UNSOUND` 10.8% were computed under the immediate-parent rule; RULE K's folder is the container-relative path | test-notes seat | the eleven-shape sweep, rebuilt (its generator is not in the tree - section 11) | the A44 test-notes revision, before any refusal predicate is built | FAILS if the refusal ships with a frozen integer derived under a folder definition the implementation does not use |
| R2 | L1's 97.8% false-split rate on `single-student-multi-folder-shared-filename` is accepted by a judgement (visible split over invisible blend) that no instrument enforces | orchestrator | the sweep's `splitAfter` / `splitUnrefused` columns for that shape, quoted with the command | the same test-notes revision | FAILS if a later artifact reports the split rate as a defect to be fixed rather than as the accepted cost of RULE K, or silently lowers it by reverting the step-5 fold and re-opening G1's blend |
| R3 | RULE D's spelling - path order, `/` separator, ` (2)` suffix - is unverified against any rendered row (L5) | UX pass | a reading of `GradingResults.tsx`'s row label render path plus the CSV header, naming the cell and its width constraint | the post-code UX pass on the as-built diff | FAILS if the UX pass closes without naming the element that renders `row.student` and whether a two-segment path fits it |
| R4 | L2: a terminal-pass ` (2)` suffix is run-dependent, so an edit saved against it is lost when the batch composition changes | test-notes seat | the cross-step shape at section 5.3, run twice with one file removed, comparing `loadPersistedEdits`'s survival | the A44 test-notes revision | FAILS if the notes assert display stability without excluding disambiguated rows |
| R5 | L3: every pre-A44 edit on a folder-shaped upload is lost once, and nothing in the suite can show it | orchestrator | none exists, and that is the point - this is a reading claim about the first run after the upgrade | the release note for the wave that lands RULE K | **This entry has an owner and a measuring step but NO instrument. It is therefore a DELETION, not a residual, and I am calling it that.** What is being deleted is any promise that pre-A44 feedback survives. RULING 93 accepted it; R5 records that nothing will ever detect it |
| R6 | `docs/loop/leverage.md`'s SCALE row cites `src/lib/grade/engine.ts:113-134` for `gradeStudentEntries`, which is at `:186`; the range no longer resolves | orchestrator | `grep -n "function gradeStudentEntries" src/lib/grade/engine.ts`, compared to the range the card prints | whenever the card is next edited, and before any seat quotes that row again | FAILS if a later artifact repeats the `:113-134` range, which is how a stale citation becomes load-bearing |

---

## 13. The leverage question

`docs/loop/leverage.md`'s trigger fired: this is feature work and the card
requires the question be asked. The three-way call is the owner's and I am not
defaulting it.

**A44 makes no NEW leverage claim.** It repairs the instrument an existing claim
already rests on. The SCALE claim - one rubric/criteria pair pinned and looped
over a whole batch - is worth nothing if the batch's rows are not the batch's
students, and today, measured, three students in three folders become one row
with one grade (`docs/a41-test-notes.md:229-231`). That is the repair.

**A stale citation found on the way, reported rather than propagated.**
`docs/loop/leverage.md`'s SCALE row cites `src/lib/grade/engine.ts:113-134` for
`gradeStudentEntries`. Opened: `engine.ts:113` is
`const resubmitNotice = pointsWereDeducted(...)` inside a score-composition
function, and `gradeStudentEntries` is declared at `engine.ts:186`
(`grep -n "function gradeStudentEntries" src/lib/grade/engine.ts`). The card's
line range no longer resolves. I am not citing it, and R6 below files the
repair; the leverage CLASS itself is unaffected, since the batch loop is real
and reachable - `engine.ts:432` calls `groupSubmissionsByStudent` with the
`zipParents` map, which is the call this design changes the behaviour of.

**One mechanism in this design is newly EARNED, and it is GUARANTEED-class:**
INVARIANT M, a property the code holds over arbitrary input regardless of what
any model inferred - including when `inferredLookup` is absent entirely, which is
the deterministic engine's normal case. The mechanism is the total length-prefixed
encoding plus the terminal pass, both new code, both in
`src/lib/grade/utils.ts`. It is not inherited: today's tree has no such
invariant, only the fixture test at `src/lib/grade/utils.test.ts:361-375`. What a
chat cannot do: a chat asked to grade a pasted batch has no partition at all, so
it cannot hold a guarantee about one, and nothing downstream of its prose can
tell a row that is one student from a row that is three.

---

## 14. Stopping point and tree state

Per `AGENTS.md`'s "Two rounds, then ask", this is the artifact of round 1 of at
most two for this activity. Both design questions are answered as rules; nothing
in sections 2 through 6 is left as a menu. Section 11 is the only thing I could
not settle, it is a measurement another seat owns, and every possible answer to
it leaves RULE K and RULE D standing.

**Hygiene gates over this write, exit code read from the command, not a pipe.
Spelled `npm run test:paths --`, never a raw multi-path run:**

```
$ npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts \
    src/file-size-ceiling.structure.test.ts src/loop-docs.structure.test.ts
COVERED src/lib/no-emojis.test.ts                  files=1 passed=18
COVERED src/source-bytes.structure.test.ts         files=1 passed=3
COVERED src/file-size-ceiling.structure.test.ts    files=1 passed=3
COVERED src/loop-docs.structure.test.ts            files=1 passed=30
Test Files  4 passed (4) / Tests  54 passed (54)
GATE_EXITCODE=0
```

This document is 1084 lines by `wc -l docs/a44-architecture.md`; the 1000-line
ceiling walks `src` only (`src/file-size-ceiling.structure.test.ts:115`,
`path.resolve(repoRoot, "src")`), which is why that gate is green over a longer
file - stated so nobody reads the pass as a licence for a 1011-line module.

**No in-tree scratch directory was created. Verified rather than asserted, exit
codes read from the command:**

```
$ for d in .a44arch .a44 scratchpad a44-scratch h; do ls -d "$d"; done
.a44arch exit=2   .a44 exit=2   scratchpad exit=2   a44-scratch exit=2   h exit=2
$ ls -d docs
docs/  exit=0     (CANARY for the same command: it CAN find a present dir)
$ ls docs/a44-architecture.md
exit=2 BEFORE this pass wrote it; ls docs/a44-scope.md exit=0 as the canary
```

**`git status --short`, read TWICE, because the tree moved under this pass.** At
the start:

```
 M docs/css-orphans.md
 M src/app/actions/action-guard-coverage.test.ts
 M src/app/actions/deck-source.ts
 M src/app/actions/github.ts
?? src/app/actions/deck-source.test.ts
?? src/app/actions/github.test.ts
```

After this file was written:

```
 M docs/BACKLOG.md
 M docs/backlog.yml
 M docs/css-orphans.md
?? docs/a44-architecture.md
```

And a third reading, taken after the final hygiene gate, because the second was
already stale by the time it was written down:

```
 M docs/css-orphans.md
?? docs/a44-architecture.md
```

`docs/a44-architecture.md` is **this pass's only entry, in all three readings.**
Every other line is sibling-owned:

- The six `src/app/actions/` entries present at the first reading are the live
  auth-guard wave's and are **gone from the second**, which means that sibling's
  work was committed between the two readings, by something other than this
  pass. Nothing under `src/` was written, staged or reverted here. One
  consequence worth naming rather than hiding: a concurrent `src/` write means
  every count in section 0(d) and section 6 is a snapshot of a moving tree, so
  each must be re-measured at its consuming seat's own gate rather than quoted
  from here.
- `docs/BACKLOG.md` and `docs/backlog.yml` appeared between the two readings and
  are **not mine**. I read `docs/BACKLOG.md` nowhere and wrote it nowhere;
  `docs/backlog.yml` was not read, written or staged by this pass, per the
  brief's instruction not to touch it. The residual register at section 12 is
  therefore written to be FILED by the orchestrator, not filed by me - and until
  it is filed, every entry in it does not exist.
- `docs/css-orphans.md` belongs to another row and was already modified before
  this pass began; it was not touched here.
- `docs/g5-*` had not written to the tree at either reading.

**No `git stash`, `git add -A` or `git checkout --` was run at any point.**

**The files this design's change would OWN, derived rather than recalled.** The
command and its output:

```
$ grep -rn "grade/utils|\"\./utils\"|utils\.ts" src --include=*.test.ts \
    | grep -iE "readFileSync|readFile\(|read\(|join\(|URL\("
exit=1        (NO test reads src/lib/grade/utils.ts as SOURCE TEXT)
$ same command with GradingResults.tsx in place of utils
gradingResultsExtraction.wiring.test.ts:26, gradingResultsHelpersWiring.test.ts:137,140
exit=0        (CANARY: the instrument CAN find a source-text reader)
```

So `utils.ts` has no source-text reader of its own, and
`src/lib/grade/grouping-zip-parents.wiring.test.ts` - which does read source text
- reads only `extraction.ts` (`:39`) and `engine.ts` (`:40`), neither of which
this design edits. What DOES cover `utils.ts` is the three whole-tree walkers,
each confirmed to recurse all of `src`:
`src/file-size-ceiling.structure.test.ts` (`:102` `readdirSync`, `:115`
`path.resolve(repoRoot, "src")`), `src/source-bytes.structure.test.ts` (`:57`
`readdirSync`), and `src/lib/no-emojis.test.ts` (`:241` `readdirSync`, `:254`
`["src","docs"]`). The behavioural owners are
`src/lib/grade/utils.test.ts`, `src/lib/grade/extraction.test.ts`,
`src/lib/grade/single-file-entry.test.ts` and
`src/lib/grade/grouping-zip-parents.wiring.test.ts` - the four files that name
`groupSubmissionsByStudent`. The plan seat owns turning this list into write
sets and gate commands; per section 9, a run naming two or more of them is
spelled `npm run test:paths <p1> <p2> ...`.
