# A44 wave plan: adversarial check, round 1

Seat: `loop-checker`. Subject: `docs/a44-waves.md` (1196 lines by
`wc -l docs/a44-waves.md`), committed `210f6b8`. Written 2026-09-27. I did not
author the subject.

**Write set for this pass is exactly `docs/a44-waves-check.md`.** Section 12
pastes `git status --short`. No `git stash`, no `git add -A`, no
`git checkout --` was run at any point, and nothing under `src/` was written or
mutated. My harness lived entirely in the session scratchpad OUTSIDE the
repository, so there was no in-tree scratch directory to remove - verified
rather than asserted:

```
$ for d in .a44plan .a44chk .a44check .a44wv; do ls -d "$d"; done
.a44plan exit=2   .a44chk exit=2   .a44check exit=2   .a44wv exit=2
$ ls -d docs
docs/   exit=0        (CANARY for the same command: it CAN find a present dir)
```

---

## VERDICT: NOT BUILDABLE as it stands. Wave 1 is NOT safe to dispatch on its own.

7 blockers, 4 majors, 6 minors.

The plan's measurements are, with two exceptions, accurate and reproducible -
I re-derived its disjointness proof, all fourteen line counts, every absence
claim, its whole `test:paths` baseline and its S1/S2/S3 persistence facts, and
they all reproduce exactly. What fails is not the arithmetic. It is that the
three claims the plan is BUILT on - "strictly better, never worse", "the
invariant is restored so the 906-line file stays out", and "a read-only legacy
path recovers the pre-fold blob" - are each refuted by driving the same real
modules on a shape the plan's own fixture sweep does not contain.

**Wave 1 is not independently landable**, and the reason is not the sequencing
(the wave ORDER is right and the file sets really are disjoint). Three blockers
live inside Wave 1's own mechanism, one is Wave 1's gate, and one is a
cross-seat contradiction about Wave 1's storage decision.

---

## 0. How every number here was produced

**(a) Behavioural numbers execute the REAL modules, import-only diffs recorded
in full.** `src/lib/grade/{utils,types,constants}.ts` and
`src/app/components/grading-results/gradingResultsHelpers.ts` were copied by a
committed-to-disk Python script (no shell heredoc) into the session scratchpad
OUTSIDE the repo and driven with `node --experimental-strip-types`
(`node --version` -> `v22.14.0`). Exit codes read from the command:

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
diff exit=0                      (CANARY: the instrument does not always fire)
$ diff --strip-trailing-cr src/app/components/grading-results/gradingResultsHelpers.ts h/grh.ts
50c50
< import type { GradeActionState } from "../../actions";
---
> import type { GradeActionState } from "./actions-stub.ts";
diff exit=1
```

Canaries that the real modules loaded, not stubs:
`removeLastExtension("a.b.c")` -> `a.b`; `getBaseFileName("a/b/c.txt")` ->
`c.txt`; `mergeStoredRowEdit({strengths:"X"}, {strengths:"Y",...}).strengths`
-> `X`. Four harnesses, each run with `> file 2> file` and the exit code read
on the next line: `EXITCODE=0` for h1, h2, h4; `EXITCODE=1` for h3 only, at its
last statement (`buildCsvContent` needs a `rubricAreaNames` field my fixture
omitted), AFTER every figure quoted from h3 had printed.

**(b) Two reimplementations, labelled everywhere their output is quoted.**
`matchStudentFileConvention`, copied VERBATIM from `utils.ts:87-107` because the
real function is module-private and `parseSubmissionFileName` does not expose
which of its six steps fired. And the GROUPING (`utils.ts:301-319`: one `Map`
entry per key, first file's display wins, `sort` by display) for key/display
only. Identity itself is always the real `parseSubmissionFileName`. I confirmed
the grouping reimplementation reproduces the plan's own `today` column on all
seven of its section 7.2 rows before trusting it on anything new.

**(c) Line counts** by `wc -l` from the Bash tool. `Measure-Object -Line` was
not used.

**(d) Exit codes read from the command, never through a pipe.**

**(e) Every absence claim carries a canary at the same command shape and the
same filter**, printed inline.

**(f) Multi-path test runs use `npm run test:paths -- ...` only.** No raw
multi-path `vitest`/`npm test` appears anywhere in this document.

---

## 1. The disposition audit: what the plan says it inherits, checked first

The plan is not a restructuring of a prior artifact of its own kind, so there is
no disposition table to audit. Its section 1 claims five facts from
`docs/a44-scope.md` as handed over and not re-derived. Four are faithfully
carried. The fifth - "30 display-keyed sites across three files" - is wrong, and
that is M1.

---

## BLOCKERS

### BL-1. The binding fold rule splits one student across their own subdirectories, so Wave 1 is measurably WORSE than today on the exact shape step 5 exists to fix

**Class: a no-harm claim asserted over a fixture set that contains no instance
of the shape that refutes it.** NEW.

Citation: `docs/a44-waves.md` section 4.1 - "whenever a file's identity resolves
via step 5 (`:243-251`, the innermost crossing's stem) or step 6 (`:254-259`,
the bare leaf stem), fold that file's own immediate enclosing folder segment
INTO the existing fallback key" - and section 7.1, "**That intermediate state is
strictly better than today's and never worse**, which is what makes Wave 1
independently landable."

Driven against the REAL `parseSubmissionFileName`, the canonical code-project
submission (two students, per-student zips inside a bulk zip, each zip holding
`src/` and `docs/`):

```
bulk.zip/JaneDoe.zip/src/main.py       step=5 folder=src  todayKey="janedoe" -> foldedDisplay="JaneDoe (src)"
bulk.zip/JaneDoe.zip/docs/report.docx  step=5 folder=docs todayKey="janedoe" -> foldedDisplay="JaneDoe (docs)"
bulk.zip/JohnDoe.zip/src/main.py       step=5 folder=src  todayKey="johndoe" -> foldedDisplay="JohnDoe (src)"
bulk.zip/JohnDoe.zip/docs/report.docx  step=5 folder=docs todayKey="johndoe" -> foldedDisplay="JohnDoe (docs)"

TODAY:                      rows=2 -> [janedoe | johndoe]
AFTER WAVE 1 (fold always): rows=4 -> [JaneDoe (src) | JaneDoe (docs) | JohnDoe (src) | JohnDoe (docs)]
ONE STUDENT SPLIT INTO MULTIPLE GRADED ROWS = true
```

Each student is split into two independently graded rows, each holding half
their submission and each scored against the whole rubric. That is a wrong grade
the instructor CAN see (two rows per student), which is better than a silent
blend, but it is unambiguously worse than today, and today's behaviour here is
the thing A14's step 5 was built to produce (`utils.ts:242`, "THE INNERMOST
CROSSING's stem - the per-student zip in the ordinary nested case, and the fix
for the filed bug").

Two more instances of the same rule, same harness:

```
### ATTACK-1: one student's own zip, two subfolders (janedoe.zip/{src,test}/main.py)
    today   rows=1 displays=[janedoe]
    always  rows=2 displays=[janedoe (src) | janedoe (test)]
### ATTACK-2: one student folder, two subfolders (AlvarezMaria/{part1,part2}/essay.txt)
    today   rows=1 displays=[essay]
    always  rows=2 displays=[essay (part1) | essay (part2)]
### ATTACK-1b: zip root, no intervening folder (janedoe.zip/main.py)
    today   rows=1 displays=[janedoe]
    always  rows=1 displays=[janedoe (janedoe.zip)]     <- the zip itself becomes the "folder"
```

Wave 2 does NOT fix any of them: after the fold the split rows have DISTINCT
keys, so there is no collision to adjudicate and the refusal is silent. This is
a permanent regression, not an intermediate state.

**And the rule has no single right answer**, which is why this is a design
blocker rather than a typo. The sibling test notes' frozen fixture **G8**
(`docs/a44-test-notes.md:357`, `Submissions/AlvarezMaria/essay.txt` +
`Submissions/BrownTom/essay.txt`, `rowsAfter` frozen at **2**, "nested folders,
immediate parent wins") requires the IMMEDIATE parent. ATTACK-2 requires the
archive-relative TOP segment. Measured, they are the same syntactic input with
opposite required outputs. The plan states the rule as "**Binding on the
implementer**" without noticing that it is underdetermined.

Note what survives: the plan's REFUSAL of `docs/a44-scope.md` section 8's first
requirement is CORRECT and I confirm it. `grep -rln "resolve to the same
student" src` exits 1 (canary `grep -rln "leafStemFallback" src` exits 0 with 3
hits), and `extraction.ts:137-138` / `engine.ts:427-437` are adjacent lines with
nothing between them, so today's refusal rate is 0% and there is no 14.6% to
raise. What falls is the separate claim the plan builds on top of that -
"strictly better, never worse" - and with it the stated ground for independent
landability.

**Disposition: design.** The folder-segment definition and whether step 5 folds
at all belong to the architect pass, with G8 and ATTACK-2 as the two shapes it
must reconcile. Not fixable by a revision of this plan, because the plan cannot
choose it without re-deciding the mechanism.

---

### BL-2. "Distinct keys implies distinct displays" is restored by nothing, and the unconditional fold CREATES a display collision that is structurally impossible today

**Class: an invariant asserted where the document's own reasoning proves no
construction exists for it.** NEW.

Citation: `docs/a44-waves.md` section 9 - "section 4.3 measures why
`GradingResults.tsx` is not needed (the invariant 'distinct keys implies
distinct displays' is restored inside `groupSubmissionsByStudent`, so all 30
display-keyed sites - including the post-to-Canvas fan-out at
`GradingResults.tsx:332-403` - keep working unchanged)." This sentence is the
SOLE measured reason the 906-line file and the display-keyed census stay out of
every write set.

**Today the invariant holds by construction and A44 is the first thing in this
codebase's history to break it.** `docs/a44-scope.md` 4.1 states it: every one
of `parseSubmissionFileName`'s six return sites sets
`studentKey = studentDisplay.toLowerCase()`, verified at `utils.ts:116, 193,
234` and inside `leafStemFallback` at `:125`. So two rows with different keys
cannot share a display today.

**After the fold, nothing restores it.** The plan's own section 4.1 construction
1 says why: `leafStemFallback` (`utils.ts:121-126`) "can return a stem
containing arbitrary characters, so no printable separator is provably
injective" - which is precisely the argument for a length-prefixed or tuple KEY.
The DISPLAY must be printable, so it necessarily uses the separator the plan
has just declared non-injective. The plan never applies its own argument to the
display.

Measured, REAL `parseSubmissionFileName`, distinct keys and IDENTICAL displays
under the chosen `always` rule:

```
### underscore-leading stem vs a folder-folded twin  (AlvarezMaria/_essay.docx + _essay (AlvarezMaria).docx)
    today        rows=2 displays=[_essay | _essay (AlvarezMaria)]      distinctDisplays=2
    always       rows=2 displays=[_essay (AlvarezMaria) | _essay (AlvarezMaria)]  distinctDisplays=1
### nested-paren ambiguity between two folded rows  (x) (y/_a.docx + y/_a (x).docx)
    today        rows=2 displays=[_a | _a (x)]          distinctDisplays=2
    always       rows=2 displays=[_a (x) (y) | _a (x) (y)]  distinctDisplays=1
```

and the least contrived instance, which needs only a leading space -
`leafStemFallback` calls `.trim()` after the `^([A-Za-z0-9]+)` match fails
(`utils.ts:123-124`), so the WHOLE stem survives:

```
" essay (AlvarezMaria).docx"  display="essay (AlvarezMaria)"  key="essay (alvarezmaria)"   (flat, NOT folded)
"AlvarezMaria/essay.docx"     display="essay" -> post-fold "essay (AlvarezMaria)"          (folded, different key)
SAME DISPLAY AFTER THE UNCONDITIONAL FOLD = true
```

Note the direction: the collision is CREATED by the unconditional fold. `today`
and the collision-triggered rule are both clean on all three shapes. So the
plan's chosen rule is the only one of the three that can manufacture this.

**What breaks when it happens, executed rather than argued**, against the REAL
helpers in the plan's own Wave 1 file:

```
seedEdits: rows in run = 2, keys in seedEdits = 1                 <- one row's feedback gone before the page opens
fanOutGradingPostResult([{student:"essay",userId:101},{student:"essay",userId:202}],
                        {failures:[{userId:101,error:"Canvas rejected 101"}],skipped:[]})
  -> entries=1  {"essay":{"status":"posted"}}                     <- a FAILED Canvas post reported as posted
  control, distinct displays -> entries=2 {"...(AlvarezMaria)":{"status":"error",...},"...(BrownTom)":{"status":"posted"}}
```

`fanOutGradingPostResult` is at
`src/app/components/grading-results/gradingResultsHelpers.ts:703-727`, keying on
`row.student` at `:717`, `:722`, `:725` - an EXPORTED PURE FUNCTION in a plain
`.ts` file, which is to say in Wave 1's own write set and fully testable. The
plan locates the fan-out at `GradingResults.tsx:332-403` and routes it to
owner-only verification (RES-A44W-5). That is the wrong file.

The named enforcer, `utils.test.ts:360-375`, cannot catch this: it asserts
`new Set(students).size === students.length` over ONE four-file fixture
(`:362-373`), so it is a fixture test, not an invariant.

**Disposition: owner decision on scope** (does `GradingResults.tsx` at 906/1000
enter a write set), preceded by an architect ruling on whether the display is
DERIVED from the key by an injective construction rather than assembled
alongside it. Not fixable in one revision of this plan.

---

### BL-3. The legacy read path hands ONE stored edit to EVERY post-fold row, on the plan's own flagship shape

**Class: a recovery measured for presence and never for cardinality or
correctness of attribution.** NEW.

Citation: section 4.3 Fact 3 and section 10 - "one read-only fallback inside
`loadPersistedEdits` (`:619-635`)", with the plan's measurement
`foundByLegacyAwareLoader=true` presented as the success that puts
`gradingResultsHelpers.ts` into Wave 1's write set.

I reproduced the plan's S3 exactly, then asked the question it did not: found by
HOW MANY rows. Against the REAL `seedEdits` / `mergeStoredRowEdit`, with the
plan's own recovery rule (try the row's display, else strip a trailing
` (folder)`):

```
pre-fold stored keys = [essay]                 (today's single BLENDED row)
always   post-fold displays=[essay (AlvarezMaria), essay (BrownTom), essay (ChenLi)]
         foundByTodaysLoader=false  foundByLegacyAwareLoader=true
         ROWS RECEIVING THAT ONE STORED EDIT=3 -> [essay (AlvarezMaria), essay (BrownTom), essay (ChenLi)]
         recoveredFrom={"essay (AlvarezMaria)":"essay","essay (BrownTom)":"essay","essay (ChenLi)":"essay"}
```

The stored edit was written about a row that blended three students. The legacy
path copies it - scores, strengths, improvements - onto all three as if each
were theirs. That is strictly worse than orphaning: an orphaned edit shows empty
fields, this shows a confident wrong grade under the right-looking name. The A44
row's verify clause (`docs/BACKLOG.md:118`, extracted by
`grep -a -o 'zero saved instructor edits may be orphaned[^|]*' docs/BACKLOG.md`)
asks for zero ORPHANED edits, so this passes the clause while defeating its
purpose.

RES-A44W-2 names a DIFFERENT mis-recovery (a stem containing the delimiter) and
does not cover this one, which occurs on the headline fixture rather than on an
adversarial filename.

**And the sibling test notes pin the opposite.** `docs/a44-test-notes.md`'s
**P3**: "for F3, the single pre-fix row's key `"essay"` exists in NO after-row
... An edit saved against a previously-blended row has no successor by
construction. **Assert that the pre-fix key is absent from the after-key set**,
so the boundary between 'accepted' and 'R7's defect' is a test, not a
paragraph." The plan's Fact 3 exists to give that key a successor. The two
documents cite the same backlog clause and cannot both be built.

On measurement the test notes are right and the plan is wrong. The plan's
reading of "zero orphaned" over-reaches - its own section 1 already records
A41's F6/5.1 previously-wrong-collapse case as accepted - and that over-reach is
the only thing putting `gradingResultsHelpers.ts` in Wave 1's write set.

**Disposition: owner decision.** It changes Wave 1's write set, so it is not a
transcription. The question is in section 11.

---

### BL-4. Cross-seat contradiction on storage keying and on the display rule - and it is the orchestrator's, not either seat's

**Class: two live seats split by a ruling, each internally sound, contradicting
on the requirement both were given.** NEW.

Both documents state they were written without sight of the other
(`docs/a44-waves.md` section 14; `docs/a44-test-notes.md` section 12), so
neither could have caught this. Three contradictions, in descending severity:

**(a) Storage key.** `docs/a44-test-notes.md` R7 opens "The requirement's object
is **the identity key, not the display string.**" Its executed pair:

```
P1. DISPLAY-KEYED STORAGE  -> P1 VERDICT: key-unchanged edit survived = false
P2. KEY-KEYED STORAGE      -> P2 VERDICT: key-unchanged edit survived = true
```

and its reference implementation ends "**STORAGE:** the edits dictionary keyed
on the identity key", scored `SATISFIABILITY SCORE: 173 pass / 0 fail`. The
plan keeps storage DISPLAY-keyed and says (section 10) that re-keying requires
the row to carry its identity key, which merges `types.ts` (`:393-415`,
`:212-271`), every `GradeResult` producer, `gradingResultsHelpers.ts`,
`ungradedDisclosure.ts` and `GradingResults.tsx` at 906/1000 into one wave and
sends the ceiling question to the orchestrator. An implementer building R7/P2
literally cannot do it inside Wave 1's write set.

**(b) The display rule, against RULING 88.** The test notes' reference
implementation reads "**DISPLAY:** the bare display, suffixed
` (<folder segment verbatim>)` **only when 2 or more rows in the same grouping
call would otherwise share it**", and their R10 states the fold "is SET-LEVEL by
necessity - it depends on whether another row would share the display". That is
the collision-triggered rule, which RULING 88 has settled against and which the
plan measures as losing an instructor's edit (S2, reproduced below). The
consequence is not cosmetic: the 173/173 score and every frozen display literal
for a foldered row that does NOT collide were computed under the conditional
rule. Concretely, the test notes' **G11** (`Submissions/essay{1,2,3}.txt`,
`rowsAfter` 3) and the `shared-wrapper-folder` shape both change:

```
### shared-wrapper-folder - whole class in ONE folder
    onCollision  rows=2 displays=[essay | report]
    always       rows=2 displays=[essay (Submissions) | report (Submissions)]
```

More importantly, the test notes' R11 "RED when two rows share a display" is
TRIVIALLY satisfied by the conditional rule (that rule folds exactly when
displays would collide) and is a REAL, violable requirement under RULING 88 -
see BL-2. Switching the rule promotes a construction check into a genuine
assertion that the plan's mechanism cannot pass.

**(c) The near-ceiling files.** `docs/a44-test-notes.md` RES-A44T-6 records
`grading.ts` at 941 and `GradingResults.tsx` at 906 "and both are where this
row's wiring goes", assigning the owner to "the wave whose write set includes
either file". The plan asserts no wave writes either.

**Where the two agree, stated so it is not re-litigated:** the A41 fixture
verdicts the plan hands the test author in section 6.2 match the test notes'
frozen table exactly. F3 `rowsOut` 1 -> 3 and REFUSE -> ALLOW
(`docs/a41-test-notes.md:215` vs `docs/a44-test-notes.md:341`); F8 3 -> 4 and
REFUSE -> ALLOW (`:220` vs `:348`); F6, F4 and F9 stay REFUSE (`:218`, `:216`,
`:221` vs `:345`, `:342`, `:347`). Both also independently adopt the
immediate-parent folder segment, which is why BL-1 is a shared blind spot rather
than a disagreement.

**Disposition: rulings.** Do not re-dispatch either seat for (a) or (b); both
are decisions. (c) resolves itself once (a) is decided.

---

### BL-5. Wave 2's predicate cannot be built from what Wave 1 is specified to leave behind, so the two waves are coupled by an ARTEFACT the plan says does not exist

**Class: a downstream wave designed against a fact the upstream wave is
explicitly specified not to expose.** NEW. This is the "one level down" version
of B2, the failure the plan exists to not reproduce.

The plan's own answer to the brief's coupling question is section 6.2: the
coupling is directional and informational, so SEQUENCE. I agree the ORDER is
right, and I confirm Wave 2 does not edit anything Wave 1's correctness depends
on (Wave 1's tests are unit tests over `utils.ts` and the helpers; Wave 2 edits
`extraction.ts` and `engine.ts`, which only CALL them). The defect is the other
direction.

Wave 2's refined predicate needs three things per file: the compound key,
whether the file REACHED the fallback (step 5 or 6), and its folder segment -
the last two because the amnesty is gated on "2 or more DISTINCT folder
segments" in the run's fallback-reaching population.

- `matchStudentFileConvention` is module-private (`utils.ts:87`, no `export`).
- `parseSubmissionFileName` returns exactly
  `{studentKey, studentDisplay, citationFileName, extension}` (`utils.ts:180-185`)
  and does not expose which step fired. This is precisely why BOTH the plan's
  harness and the test notes' harness had to copy that function verbatim.
- The plan's section 3 table says Wave 1's new exports are "**NONE**", and adds
  that "`inferStudentPrefix`'s return shape may gain a field; its only caller is
  `utils.ts:304`, in this wave's own file" - i.e. the field, if it appears, is
  deliberately not reachable from outside.
- Section 4.1 construction 1 leaves the key's REPRESENTATION undecided between a
  length-prefixed join and a tuple: "What is binding is that the construction
  cannot collide, not which of the two is used." So Wave 2 cannot even recover
  "folded" by parsing the key's shape without depending on a choice the plan
  declines to make.

So Wave 2 must either (i) re-implement the identity algorithm in production code
- two implementations of one algorithm, the divergence trap this repo has a
standing rule about - or (ii) edit `src/lib/grade/utils.ts` to add the accessor,
which puts `utils.ts` in BOTH write sets and makes section 6.1's
`sort | uniq -d` non-empty. Section 2's claim that "the key fold is therefore
fully contained in `src/lib/grade/utils.ts`" is exactly what makes Wave 2's
predicate unbuildable, and the plan reads it as a reason the waves are clean.

There is no residual for this.

**Disposition: fixable in one revision** - Wave 1 owes a named export (a
`reachedFallback`/step discriminator plus the folder segment, or a decided key
representation with a documented decoder), Wave 2's brief owes its consumer, and
section 6.1's intersection must be re-run. A revision can do this; nothing here
needs a decision.

---

### BL-6. Wave 1's lint gate cannot pass as written: the pass condition is 4 warnings against a measured 7

**Class: a pass-condition literal quoted from a card instead of measured - the
entry gate `iteration-caps.md` names first.** NEW.

Citation: section 4.5 step 3 - "**`npm run lint`** - pass:
`4 problems (0 errors, 4 warnings)`, exit 0. A fifth warning is this wave's
regression, named, not absorbed."

Measured on the tree this pass:

```
$ npm run lint
LINT_EXIT=0
... 7 problems (0 errors, 7 warnings)
```

The four the card records (`docs/loop/this-repo.md:26` and its
"### The four lint warnings are the baseline" section: `RecordingTab.tsx:347`,
`repoGradesSliceA.guards.test.ts:83`, two in `canvas-modules/new-quiz.test.ts`)
are still there, and three more have landed since, all in
`src/app/components/recording/useDiscussionCapture.wiring.test.ts:188`, `:201`,
`:201`. `docs/loop/this-repo.md` is stale and the plan inherited the staleness
into a hard literal.

Applied as written, Wave 1's gate fails before any code exists; the likely
recovery is an implementer "fixing" three warnings in files outside its write
set, which is the write-set violation the gate is there to prevent. The
"a fifth warning" remedy is off by three.

This is also an internal contradiction three steps wide: step 6 of the same gate
says "The card's 1111/22454 is explicitly a drifting snapshot
(`docs/loop/this-repo.md` section 1); measure, do not quote." Step 3 quotes.

**Disposition: fixable in one revision.** Re-measure and state the command, or
make the condition "0 errors, and no warning naming a file in this wave's write
set".

---

### BL-7. Section 4.4's "whole suite stays green" and section 5.4's "nothing else moves" are green-after claims that the invariant in BL-2 is the only thing supporting

**Class: a silent-green failure named in the wrong place.** REPEAT-OF-BL-2's
mechanism at the level of the GATE rather than the design, and I am labelling it
REPEAT rather than inventing a class: the same corrective rule (construct the
display from the key, or bring the display-keyed consumers into the write set)
closes both.

The specific silent green, stated as the brief requires: A44 can be built
exactly as this plan specifies, and pass `npm run lint`, `npx tsc --noEmit`,
`npm run build`'s `Compiled successfully`, all 358 tests in the plan's named set
and `npm test`, while
(i) splitting a student's own project zip into one graded row per
subdirectory (BL-1 - no fixture in either document covers a step-5 path with an
internal folder, so nothing goes red);
(ii) collapsing two rows onto one display, at which point `seedEdits` silently
drops one row's feedback and `fanOutGradingPostResult` reports a FAILED Canvas
post as "posted" (BL-2 - both measured above, and `utils.test.ts:373` passes
because its own fixture has no such pair); and
(iii) copying one blended row's instructor feedback onto three students (BL-3 -
no test exists for the legacy path at all; it is Wave 1's own new instrument).

I checked the gates for the specific hazard the brief names: **every multi-path
run in this document uses `npm run test:paths --`**, in section 4.5 step 4,
step 5, section 5.5 and section 14. No raw multi-path `vitest`/`npm test`
appears. That part is clean.

**Disposition: closed by BL-2's disposition.** Listed separately because the
plan's own "what could go green and be wrong" reasoning does not name any of the
three.

---

## MAJORS

### MA-1. The display-keyed census is 43, not 30, and the site that matters most is in Wave 1's own file

Citation: `docs/a44-waves.md` section 1, section 4.2's read-coupled table
("holds 24 of the 30 display-keyed sites"), and section 9's near-ceiling
argument ("all 30 display-keyed sites ... keep working unchanged").

Re-derived by CONSTRUCTION rather than by enumerating identifier names:

```
$ grep -rnE "\[[A-Za-z_][A-Za-z0-9_.]*\.student\]|\[student\]|\[codeOutputStudent\]|\.student ===|=== *codeOutputStudent|\[[A-Za-z_][A-Za-z0-9_]*Student\]" src \
    --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -vE ":[0-9]+: *(//|\*|/\*)" | cut -d: -f1 | sort | uniq -c
  34 src/app/components/GradingResults.tsx
   7 src/app/components/grading-results/gradingResultsHelpers.ts
   2 src/app/components/grading-results/ungradedDisclosure.ts
   (6 in unrelated files)
```

34 + 7 + 2 = **43**. The scope's and the check's regex enumerated
`result|r|entry|student|expandedBox|codeOutputStudent` and therefore could not
see the `row.student` family. `docs/a44-test-notes.md` RES-A44T-7 states the
direction of failure as "**RED if any artifact downstream still says 30**"; this
plan says 30 in three places, one of which is the sentence that keeps
`GradingResults.tsx` out of scope.

Two of the thirteen newly visible sites change the work, and only one of them is
covered by BL-2's invariant argument:

- `gradingResultsHelpers.ts:717, 722, 725` inside `fanOutGradingPostResult`
  (`:703-727`) - an exported pure function in a plain `.ts` file, in **Wave 1's
  own write set**, and executable. The plan and the scope both treat the
  post-to-Canvas collision as untestable and route it to owner verification
  (RES-A44W-5). It is testable; I executed it in BL-2.
- `GradingResults.tsx:427-500`, the single-row post path, absent from the 30-site
  census entirely.

**Disposition: fixable in one revision** for the count and the fan-out's
routing; the scope consequence is BL-2's.

### MA-2. "Key unchanged implies display unchanged by construction" is not a construction

Citation: section 4.3 - "`always` ... keeps it, because the display is then a
function of the FILE and 'key unchanged' implies 'display unchanged' by
construction. That is `traps-spec.md`'s own preference ... applied to this
requirement, and it is why this plan makes the unconditional form binding rather
than advisory."

The display is a function of the FIRST FILE IN THE GROUP (`utils.ts:308-309`,
`grouped.set(inferred.key, { student: inferred.display, ... })`, first writer
wins), and the key is lowercased (`utils.ts:125`) while the display is
case-preserving. Measured:

```
always   run1=[Essay (AlvarezMaria)]  run2(order A)=[Essay (AlvarezMaria)]  run2(order B)=[essay (AlvarezMaria)]
         key(run1)=12:AlvarezMaria5:essay   key(run2)=12:AlvarezMaria5:essay   (byte-identical)
```

Two files `AlvarezMaria/Essay.txt` and `AlvarezMaria/essay.txt` share one key;
which display the row gets depends on zip entry order, so an edit saved under
one run's display is lost under another's with the key unchanged. This hazard
exists TODAY too, so it is not a Wave 1 regression - but it removes the word
"construction" from what the plan calls "the single most load-bearing decision
in this plan", and it means S2's protection holds for the common case rather
than by construction.

I reproduced all three of the plan's persistence facts exactly, so this is the
only correction to them:

```
=== S1 (REAL seedEdits) ===
  today   rows=1 displays=[essay] slots=1
  keyOnly rows=3 displays=[essay, essay, essay] slots=1        <- 2 rows lose their seed
  always  rows=3 displays=[essay (AlvarezMaria), ...] slots=3
=== S2 (REAL loadPersistedEdits) ===
  today       ... EDIT SURVIVED=true
  always      identityKeyUnchanged=true (12:AlvarezMaria5:essay) EDIT SURVIVED=true
  onCollision identityKeyUnchanged=true (12:AlvarezMaria5:essay) EDIT SURVIVED=false
=== S3 ===  foundByTodaysLoader=false  foundByLegacyAwareLoader=true       (see BL-3)
```

**Disposition: fixable in one revision** (state it as a protection with a
residual, not a construction), or closed by BL-2's construction if the display
becomes a function of the key.

### MA-3. RES-A44W-4's one in-`src/` stale-citation instance is the wrong address AND cannot go stale, while the one that WILL go stale is invisible to the residual's own instrument

Citation: section 8's last table row and RES-A44W-4's direction of failure -
"**FAILS if a wave's push lands while any citation in `src/` (notably
`ungradedDisclosure.test.ts:146`) still names a moved line.**"

```
$ grep -rnoE 'engine\.ts:[0-9]+' src --include=*.ts --include=*.tsx
src/app/components/grading-results/ungradedDisclosure.test.ts:9:engine.ts:146
src/app/components/grading-results/ungradedDisclosure.test.ts:67:engine.ts:146
src/app/components/grading-results/ungradedDisclosure.ts:152:engine.ts:264
src/app/components/GradingResults.tsx:762:engine.ts:212
src/app/components/repo-grades/RepoGradeCellControl.tsx:424:engine.ts:212
src/lib/grade/class-trends.ts:18:engine.ts:126
src/lib/grade/engine.test.ts:17:engine.ts:142
src/lib/grade/single-file-entry.ts:67:engine.ts:457
exit=0
```

- The citation of `engine.ts:146` lives at `ungradedDisclosure.test.ts:9` and
  `:67`. Line 146 of that file is
  `it("ungraded, not-attempted, submission-count-bound", ...)` - the plan
  confused the CITED line with the CITING line.
- `engine.ts:146` is ABOVE Wave 2's insertion point (`engine.ts:427-437`), so it
  cannot shift.
- `src/lib/grade/single-file-entry.ts:67` cites `engine.ts:457`, which IS below
  the insertion point and WILL shift. It is the only in-`src/` citation that
  will.
- Section 8's pattern (A) is path-qualified, `grade/engine\.ts:(\d+)`, and
  `single-file-entry.ts:67` writes the bare `engine.ts:457`, so the residual's
  stated instrument cannot find it. Pattern (B) covers only the chain documents,
  the two backlog files and `REGRESSION.md` - not `src/`.

Everything else in section 8 reproduces. Pattern (A)'s five counts are exact
once the two chain documents that landed at or after this pass are excluded:

```
$ grep -raoE '<pattern>' docs src --include=*.md --include=*.ts --include=*.tsx --include=*.yml \
    | grep -v 'a44-waves.md' | grep -v 'a44-test-notes.md' | wc -l
utils.ts 13   utils.test.ts 2   extraction.ts 12   engine.ts 35   gradingResultsHelpers.ts 4
```
matching the plan's 13 / 2 / 12 / 35 / 4. And `grep -rnE
'gradingResultsHelpers\.ts:[0-9]+' src` exits 1, so Wave 1 creates no in-`src/`
stale citation of its own; `utils.test.ts:337` cites `utils.ts:70`, above Wave
1's insertion points.

**Disposition: fixable in one revision.** Swap the named instance, and add an
unqualified-basename pattern restricted to `src/`.

### MA-4. `docs/a44-scope.md` section 8's THIRD requirement is neither adopted nor recorded as a divergence, and its own stated failure mode is this plan's silent green

The scope requires: "**Whichever construction discharges section 6's migration
requirement (6.4(a) or 6.4(b)) touches storage, which section 4.2 shows has 30
display-keyed call sites across three files, including the post-to-Canvas
fan-out** - a wave that changes fewer of them ships a partial fix with the same
gates green."

The plan changes ZERO of them (only `loadPersistedEdits`'s internals). Section 7
is titled "Where this plan diverges from the scope, and from R2's citations" and
records only the FIRST requirement's divergence, explicitly adopting "the
scope's SECOND requirement in the same section ... in full" and passing over the
third in silence. The plan's implicit answer is the BL-2 invariant, which does
not hold.

**Disposition: fixable in one revision** (record the divergence and its ground),
but the ground itself is BL-2.

---

## MINORS

- **m1.** Section 5.2: "`groupSubmissionsByStudent` ... is a pure function with
  28 pinned tests in `utils.test.ts`". 28 is the whole file
  (`grep -c "  it(" src/lib/grade/utils.test.ts` -> 28; the 13 top-level
  `describe`s split 9 on `groupSubmissionsByStudent`, 2 on
  `parseSubmissionFileName`, 2 unrelated; by `it()`: 14 / 7 / 7). The exclusion
  still holds on the R2-characterisation ground.
- **m2.** Section 7.3: `grep -nE "^export (function|const|interface|type)"` on
  `gradingResultsHelpers.ts` is stated as 39. Measured with `-c`: **40**.
- **m3.** Section 4.4's "Exactly ONE existing fixture's OUTPUT moves" is true of
  DISPLAYS only. Two fixtures' KEYS move (`src/main.py` at
  `utils.test.ts:129`/`:134`, and `src/otherfile.py` inside `:362-373`), which
  the plan states correctly in section 2 and in its own key column. A wording
  inconsistency, not a measurement error. I reproduced the whole sweep: the
  uniqueness guard's fourth display becomes `otherfile (src)` and `:373` still
  passes 4 against 4; the other group-level fixtures are byte-identical across
  all four modes because each resolves at step 2 or 3.
- **m4.** The plan's terminating question is already answered - RULING 88 is its
  option (1) - and RES-A44W-1 still assigns the same decision to "the architect
  pass, before Wave 1 is dispatched". Transcription.
- **m5.** RES-A44W-3's direction of failure ("**FAILS as a residual if the UX
  pass closes without ruling on it**") is a process condition, not a direction
  of failure on the stated object. The other five residuals carry all five
  parts.
- **m6.** Section 5.2 cites the Gemini branch as `grading.ts:905-907`;
  `docs/a41-scope.md:956` says `:907`. Immaterial; I confirmed `:854`
  (`extractStudentEntries`) and `:907` (`gradeSubmissions`) against the tree.

---

## Verified sound - not re-litigated

One line each, because a clean section should not be padded.

- **Disjointness, sense one: reproduced exactly.** `cat w1 w2 | sort | uniq -d`
  exit 0, no output, for w1 x w2, w1 x siblings and w2 x siblings; the positive
  self-join canary prints the same five paths the plan prints. All eleven
  declared paths' EXISTS/NEW status is correct against the tree.
- **Disjointness, sense two: the ORDER is right.** Wave 2 edits nothing Wave 1's
  correctness depends on, and the plan's reason for not reversing the order
  (Wave 2 first would ship a folder-unaware predicate and rewrite it) is sound.
  The defect is BL-5, in the opposite direction.
- **All fourteen line counts reproduce under `wc -l`**, including the two
  near-ceiling figures (941 and 906) and `LIMIT = 1000` at
  `src/file-size-ceiling.structure.test.ts:41`.
- **Every `utils.ts` and helpers citation I opened is correct**: `:87`, `:107`,
  `:121`, `:126`, `:142`, `:175`, `:176`, `:234`, `:243`, `:251`, `:254`,
  `:259`, `:269`, `:276`, `:290`, `:301`, `:304`, `:309`, `:321`, `:344`; and
  `gradingResultsHelpers.ts:287` (`seedEdits`), `:558`, `:567`
  (`LEGACY_EMPTY_CANVAS_URL_EDITS_KEY`, a real precedent), `:597`, `:619-635`,
  `:641`, `:663`, `:703-727`; and `gradingResultsHelpers.test.ts:302`
  (`expect(seedEdits(run)).toEqual({`).
- **The `test:paths` baseline reproduces exactly**, one command:
  `utils.test.ts passed=28`, `extraction.test.ts 9`,
  `single-file-entry.test.ts 15`, `grouping-zip-parents.wiring.test.ts 7`,
  `gradingResultsHelpers.test.ts 45`, `gradingResultsHelpersEditState.test.ts
  28`, `ungradedDisclosure.test.ts 47`, `runtime-import-graph.test.ts 174`,
  `grading.budget.test.ts 5`; `Test Files 9 passed (9) / Tests 358 passed
  (358)`, exit 0. The plan was right to say `grading.budget.test.ts` must be
  baselined at dispatch rather than quoted.
- **Both frozen source-text tests' conditions are stated correctly.**
  `grouping-zip-parents.wiring.test.ts:60` is exactly
  `/groupSubmissionsByStudent\(([\s\S]*?)\)\s*;/g` with
  `calls.every(call => /\bzipParents\b/.test(call[1]))`, and the file reads only
  `extraction.ts` (`:39`) and `engine.ts` (`:40`) - so Wave 1 is genuinely
  unaffected. `runtime-import-graph.test.ts`'s `FROZEN_TRAILS` has exactly nine
  entries, the companion `it()` asserts every violation
  `.startsWith("lib/supabase")`, and `engine.ts` does import `./types`
  (`:9-22`) and `./utils` (`:24`) STATICALLY, so a leaf importing only those two
  adds zero trails. The plan's stated condition is right.
- **Both refusal-placement exclusions are correct.**
  `llm-content.ts:667`'s `testGeminiAction` does call `extractSubmissions` and
  does take `entries[0]` truncated to 2000 chars (`:674-675`), so a refusal
  inside `extractSubmissions` fires where nothing was at risk - matching
  `docs/a41-test-notes.md:458`'s R4c. `extraction.ts:137-138` and
  `engine.ts:427-437` are the two correct homes and both are in Wave 2's write
  set.
- **`grading.ts` needs no edit for reachability.** `grading.ts:921-923` returns
  `{ run: null, error: message }` with `err.message` verbatim, and
  `GradingTab.tsx:262-266` renders `state.error` with `role="alert"`. The chain
  is inherited, as claimed; the renderer half correctly stays a reading claim.
- **No `ALLOWED_OVERAGE` entry exists for any planned file** (exit 1), with the
  positive canary `lms-generation.test.ts` at `:76` (exit 0).
- **Section 7.3's two stale header comments are both real** and correctly quoted:
  `utils.test.ts:80-84` says "outward-in scan" against `utils.ts:150-152`'s
  "NARROWEST FIRST", and claims "the userId folded into the grouping key" which
  `utils.ts:76-85` CORRECTION 2 withdrew and `utils.test.ts:326-334` pins the
  opposite of. `:119`'s `it()` description carries the same wrong direction.
- **All seven of section 7.2's frozen-oracle rows reproduce**, `today` and
  `always` columns both, including F6 staying collision-true and F4 being
  unchanged by any fold.
- **Every absence claim reproduces with its canary and the right exit code**, and
  the `studentKey` census is exactly the eight hits the plan lists.
- **Every multi-path run in the document uses `npm run test:paths --`.**

---

## 11. The question for the owner, shaped so every answer ends this activity

Not a stop. BL-1, BL-5, BL-6, MA-1 and MA-3 can be settled without you - by the
architect, by a revision, and by a ruling. One thing cannot, because it decides
Wave 1's write set and therefore whether a 906-line file at 94 lines of
headroom enters scope, and because the two live seats measured it and came to
OPPOSITE answers.

> **An instructor's saved feedback on a graded row has to be filed under
> something, and A44 changes the label it is filed under today. Measured this
> pass against the real storage functions, the three available answers fail in
> three different directions, and one of them is worse than losing the
> feedback.**
>
> **What is measured, not argued.** File it under the DISPLAY and add a
> best-effort recovery of the old label, which is what the wave plan proposes:
> a note written about a row that had silently blended three students is copied
> onto all three of them - `ROWS RECEIVING THAT ONE STORED EDIT=3`. Each student
> then shows a confident grade and comments that were never about them. File it
> under the identity KEY, which is what the test notes require: nothing is ever
> mis-attributed, but the row has to CARRY its key, which pulls `types.ts`,
> every producer of a grade result, and `GradingResults.tsx` at 906 of 1000
> lines into one wave, and the line-ceiling question comes to you.
>
> Pick ONE. Each ends this activity; the plan ships as revised with the answer
> applied and everything still unresolved recorded as a residual with an owner
> and an instrument.
>
> **(1) FILE IT UNDER THE IDENTITY KEY. No recovery of pre-A44 feedback.**
> Nothing is ever attributed to the wrong student. Every instructor edit saved
> before A44 ships is lost once, on the first run after the upgrade. One large
> wave spanning identity, persistence and the grade-posting fan-out, and the
> `GradingResults.tsx` ceiling becomes your decision. **Cost of being wrong:**
> one hard-to-review wave, and instructors re-enter feedback once.
>
> **(2) FILE IT UNDER THE DISPLAY, AND DELETE THE RECOVERY.** Two small waves,
> `GradingResults.tsx` and `grading.ts` untouched, no extraction. Pre-A44
> feedback on any folder-shaped upload is lost once, exactly as in (1), and
> nothing is ever mis-attributed because nothing is recovered. **Cost of being
> wrong:** the same one-time loss as (1), and the display remains a label the
> code keys on, so a future label change costs this again.
>
> **(3) FILE IT UNDER THE DISPLAY, AND RECOVER THE OLD LABEL ONLY WHEN THE OLD
> ROW HAS EXACTLY ONE SUCCESSOR.** Feedback survives for a single student's own
> resubmission, and is dropped rather than duplicated wherever a blended row
> split into several. Two waves, as tabled. **Cost of being wrong:** the most
> code for the narrowest gain, and a cardinality rule somebody has to maintain.
>
> **My recommendation: (2).** It is the only answer where no instructor ever
> sees another student's grade under their own name AND no near-ceiling file
> enters a write set, and both halves are measured rather than argued. The
> feedback loss it accepts is the loss (1) also accepts and the wave plan's own
> section 1 already records as accepted for the previously-blended case.
> **Cost of being wrong about (2):** instructors who had edited a
> folder-shaped batch before the upgrade re-enter that batch's feedback once,
> and nothing else.

---

## 12. Stopping point and tree state

**What remains: rulings and design.** In that order.

- **Rulings** (the orchestrator's, not a seat's): BL-4 (a), (b) and (c) - the
  storage key and the display rule that split the two live seats, which no seat
  revision can resolve; and the disposition of section 11's question.
- **Design** (the architect pass): BL-1's folder-segment definition and whether
  step 5 folds at all, reconciling `docs/a44-test-notes.md`'s G8 with ATTACK-2;
  and BL-2's construction question - whether the display is DERIVED from the key
  injectively or the 43 display-keyed consumers enter a write set.
- **One revision** closes BL-5, BL-6, MA-1, MA-3, MA-4 and all six minors.
- **Measurement: nothing outstanding.** Every quantity in the plan that I could
  execute, I executed, and only two did not reproduce (BL-6's lint literal and
  m1/m2's two counts).

Per `AGENTS.md`'s "Two rounds, then ask", this is round 1 of at most two for
this activity.

Hygiene gates over this write, exit code read from the command, not a pipe:

```
$ npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/file-size-ceiling.structure.test.ts
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
COVERED src/file-size-ceiling.structure.test.ts files=1 passed=3
Test Files  3 passed (3) / Tests  24 passed (24)
EXITCODE=0
```

**`git status --short`, read twice, because the tree moved under this pass.** At
the start:

```
 M docs/css-orphans.md
```

And after this file was written, live siblings having landed work in between:

```
 M docs/css-orphans.md
 M src/app/actions/action-guard-coverage.test.ts
 M src/app/actions/deck-source.ts
 M src/app/actions/github.ts
?? docs/a44-waves-check.md
?? src/app/actions/deck-source.test.ts
?? src/app/actions/github.test.ts
```

`docs/a44-waves-check.md` is **this pass's only entry, in both readings.** Every
other line is sibling-owned:

- `docs/css-orphans.md` belongs to another row and was already modified before
  this pass began; it was not touched here.
- the four `src/app/actions/` entries are **the live R4 implementer's**, and they
  appeared between the two readings because that sibling wrote them, not because
  anything here touched them. Nothing under `src/` was written, staged or
  reverted by this pass, and none of those paths is in this pass's write set.
  They are also outside every file this check reads a quantity from, with one
  exception worth naming: a concurrent `src/` write means the `npm run lint`
  figure in BL-6 and the `test:paths` counts above are snapshots of a moving
  tree, so both must be re-measured at each wave's own gate rather than quoted
  from here - which is exactly BL-6's corrective rule applied to my own numbers.
- `docs/a44-waves.md` and `docs/a44-test-notes.md` are both committed
  (`210f6b8` and `1163a54`) and so do not appear; neither was written, staged or
  reverted by this pass.
- `docs/r4-check.md` had not written to the tree at either reading.

**No `git stash`, `git add -A` or `git checkout --` was run at any point.**
