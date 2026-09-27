# A44 scope, revision 1 - A44 now owns A41's refusal decision too

Backlog row A44 (`docs/BACKLOG.md:117`, `grep -a "A44" docs/BACKLOG.md`). Round 1
of this document (commit `3360e59`) was checked at `docs/a44-check.md` (commit
`e8faea4`): 5 blockers, 5 majors, 5 minors, two orchestrator rulings (85, 86).
**This is the ONE revision available before any unresolved question goes to the
owner** (`AGENTS.md`, "Two rounds, then ask"; `docs/loop/iteration-caps.md`).

Seat: `loop-seat`. Round 1 written 2026-09-27; this revision also 2026-09-27.
Write set for this pass is exactly `docs/a44-scope.md` - section 14's
`git status --short` is the evidence, and it names the live sibling this pass
observed and did not touch.

## Disposition of the round-1 check's findings

Required by `iteration-caps.md`'s entry gate 3 ("every restructuring round
ships a disposition table... the checker audits that table before reading the
new round on its own terms").

| Finding | Disposition | Where in this revision |
|---|---|---|
| RULING 85 (orchestrator) - A44 owns A41's decision too | **APPLIED, with a measured correction to its literal mechanism.** The literal text ("do not refuse when every colliding file shares one folder segment") is measured UNSOUND - it silently allows 100% of a realistic harmful shape. A refined, folder-aware-but-run-gated mechanism is substituted, proven sound on every shape measured, at a smaller (but still real) reduction in the false-refusal rate. F6's specific re-freeze to ALLOW is NOT carried out by the refined mechanism; this exact tension is the terminating question. | Section 3 |
| RULING 86 (orchestrator) - the wave plan and oracle/instrument specs are relocated | **APPLIED.** Section 7 (waves with write sets) is deleted. Section 6.4 (the migration instrument) is reduced to a one-paragraph requirement. No oracle, sabotage protocol, write set or wave order is written here. | Section 8 |
| B1 - the row's purpose is unreachable by the mechanism, and the two sections requiring it need mutually exclusive readings | **RESOLVED by RULING 85 as refined in section 3.** The mechanism now folder-aware in BOTH the key and the decision; the two readings collapse into one, stated once. | Section 3 |
| B2 - Wave 1 fails its own required test, ships the data-loss it proves, Wave 2 has no file | **MOOT under Ruling 86.** No wave plan is authored in this document to fail its own test. Handed over: whoever writes the wave plan owes the requirement stated in section 8 (the key-fold and display-fold changes cannot land in a wave that cannot exercise both). | Section 8 |
| B3 - the false-split risk is a mislabelled residual and is far larger than treated, and worse under the new refusal mechanism | **DECIDED, not residualized.** Accepted explicitly with its measured size, including the ADDITIONAL cost Ruling 85 introduces. A tested narrowing was attempted and REJECTED because it defeats the row's own primary fix on the realistic case (measured). | Section 2.4 |
| B4 - the edits requirement drops the case that bites, and the cited policy doesn't say what was claimed | **FIXED.** Requirement's object restated to the row's identity KEY, a per-row fact, not "display unchanged," a batch-dependent one. Executed proof (real functions) that the current default still fails it; executed proof that a key-keyed construction satisfies it. Instrument/file details relocated per Ruling 86. | Section 6 |
| B5 - Shape-5's verdict is frozen over unconstructed instances, one of which collapses 3 students into 1 row nothing catches | **FIXED.** The `zipParents`-populated gate is dropped; folding now applies to any file resolved via a stem-based step (5 or 6), not only step 6. Two new rows added to the per-shape table, measured. | Section 2.2, 2.3 |
| M1 - "six places" is a floor; 30 non-comment sites in three files, dropping two A41 named | **FIXED.** Re-derived fresh this pass with my own command; 30 confirmed (34 total minus 4 unrelated), matching the check's count exactly, with the post-to-Canvas fan-out sites cited. | Section 4.2 |
| M2 - orchestrator ruling on seat elevation | see RULING 86 | |
| M3 - `GradingResults.tsx` never measured, cites a section that doesn't exist, gets no line budget near the ceiling | **FIXED.** Measured (906/1000, both counters). No line budget is assigned here (Ruling 86 - that is the wave plan's job); the fact is stated for whoever builds it. | Section 4.2 |
| M4 - the reachability census cites a command that cannot have produced its own result | **FIXED.** Re-run with the correct command; the five-line/sixteen-line distinction is stated exactly as measured. | Section 7 |
| M5 - three residuals fail `iteration-caps.md`'s own definition | **FIXED.** RES-A44-3 relabelled a decision (section 3.4/10, not a residual); RES-A44-5 discharged by section 6's restated requirement; RES-A44-6 reclassified as an owner-only backlog escalation, not a residual with no instrument. | Section 11 |
| m1 - RES-A44-1's range covers 9 of a 10-row table | **FIXED.** Range restated as "every row of the now-twelve-row table." | Section 11 |
| m2 - the compound key's separator is unproven injective | **FIXED, as a requirement, not an instrument.** Recommend a tuple key or length-prefixed join; not written as a test here (Ruling 86). | Section 2.2 |
| m3 - the leverage citation path doesn't exist | **FIXED.** `src/lib/grade/engine.ts:113-134`, re-verified. | Section 9 |
| m4 - 2.4's prose contains an unresolved self-correction | **FIXED.** Rewritten. | Section 2.4 |
| m5 - the Wave-1 spot-check claim is contradicted by its own gated file | **MOOT under Ruling 86.** No wave plan claims a spot check here. The underlying fact (`utils.test.ts:366`'s `"src/otherfile.py"` now folds under the corrected condition) is stated as a fact in section 2.2 instead. | Section 2.2 |

---

## 0. The instrument, stated first so every number below is checkable

**(a) Executing the REAL modules, import-only diff, adopting the check's
harness method over round 1's hand-transcription.** `src/lib/grade/utils.ts`,
`types.ts` and `constants.ts` were copied into an untracked `.a44rev/`
directory at the repo root and driven with `node --experimental-strip-types`
(`node --version`: `v22.14.0`). The diffs, in full:

```
$ diff --strip-trailing-cr src/lib/grade/utils.ts .a44rev/utils.ts
1,3c1,3
< import type { SubmittedFileInfo, InferredFileNameLookup } from "./types";
< import type { CodeRunResult } from "../code-runner";
< import { getMimeType } from "./constants";
---
> import type { SubmittedFileInfo, InferredFileNameLookup } from "./types.ts";
> import type { CodeRunResult } from "./code-runner-stub.ts";
> import { getMimeType } from "./constants.ts";
utils diff exit=1
$ diff --strip-trailing-cr src/lib/grade/types.ts .a44rev/types.ts
1c1
< import type { CodeRunResult } from "../code-runner";
---
> import type { CodeRunResult } from "./code-runner-stub.ts";
types diff exit=1
$ diff --strip-trailing-cr src/lib/grade/constants.ts .a44rev/constants.ts
constants diff exit=0
```

`code-runner-stub.ts` is a type-only stand-in for a type-only import
(`export type CodeRunResult = Record<string, unknown>;`); every executable
line of `parseSubmissionFileName`, `leafStemFallback`,
`matchStudentFileConvention`, `getBaseFileName` and `groupSubmissionsByStudent`
is byte-identical to the tree.

**(b) `gradingResultsHelpers.ts` also imported for real, not hand-transcribed
(a strictly stronger guarantee than round 1's).** The file has exactly one
import: `grep -n 'from "' src/app/components/grading-results/gradingResultsHelpers.ts`
returns one line, `:50`, and it is `import type { GradeActionState } from
"../../actions"`. Copied with that one specifier redirected to a type-only
stub; diff exit=1, one line, the import only. `seedEdits`, `mergeStoredRowEdit`
and `loadPersistedEdits` are therefore executed for real in section 6, not
retyped by hand.

**(c) A local reimplementation, used ONLY to classify which of
`parseSubmissionFileName`'s six steps produced a given file's identity** (the
real function does not expose this). It is `matchStudentFileConvention`
(`utils.ts:87-107`), copied verbatim into the harness and cited, never
invented. Everywhere the real `parseSubmissionFileName`/`studentKey` is used
for the actual identity computation.

**(d) Line counts.** `@(Get-Content <file>).Count` in PowerShell, cross-checked
with `wc -l` from Bash; both agreed on every file measured. `Measure-Object
-Line` was not used.

**(e) Exit codes** were read from the command, never through a pipe.

**(f) Scratch directory removed before this document was finalized:**
`rm -rf .a44rev` (verified by `ls -d .a44rev` exiting 2, section 14).

### 0.1 File sizes, re-verified fresh this pass, no drift from the check's own numbers

| File | `wc -l` | `@(Get-Content).Count` |
|---|---|---|
| `src/lib/grade/utils.ts` | 393 | 393 (cross-checked via PowerShell for `GradingResults.tsx` below; the others use `wc -l` only, per this pass's own primary shell) |
| `src/lib/grade/extraction.ts` | 300 | - |
| `src/lib/grade/engine.ts` | 517 | - |
| `src/app/actions/grading.ts` | 941 | - |
| `src/app/components/GradingTab.tsx` | 566 | - |
| `src/app/components/GradingResults.tsx` | 906 | **906** (PowerShell `@(Get-Content $f).Count`, run this pass) |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | 728 | - |
| `src/app/components/grading-results/FilesCell.tsx` | 103 | - |
| `src/lib/grade/utils.test.ts` | 390 | - |
| `src/lib/grade/extraction.test.ts` | 271 | - |
| `src/lib/grade/single-file-entry.ts` | 133 | - |
| `src/lib/submission-zip-intake.ts` | 158 | - |
| `src/file-size-ceiling.structure.test.ts` | 151 (`LIMIT = 1000` at `:41`, re-verified by `sed -n '41p'`) | - |

Every figure matches both round 1 and the check exactly - nothing in this
layer has moved.

### 0.2 Concurrency, re-checked at the start of this pass

```
$ git status --short
 M docs/css-orphans.md
 M src/app/actions/action-guard-coverage.test.ts
```

`docs/css-orphans.md` belongs to another row, unchanged from round 1's own
note. `src/app/actions/action-guard-coverage.test.ts` is the live sibling
named in this pass's own brief (an auth-guard instrument under
`src/app/actions/` and `src/lib/supabase/`). Neither intersects this pass's
write set (`docs/a44-scope.md` only) or anything this document treats as
load-bearing evidence. No `git stash`, `git add -A` or `git checkout --` was
run.

---

## 1. Confirmed sound, not re-litigated

Per the check's own list, re-verified rather than assumed carried-forward:

1. **"Any folder is identity" is unsound** (section 2.1) - Shape 1 and Shape 2
   are structurally identical per file; a rule that promotes the folder
   unconditionally turns Shape 2's three correct rows into one.
2. **The nesting shapes (3/6) need no special case** - a file's immediate
   parent is already the per-student segment regardless of how many wrapper
   levels sit above it.
3. **F1 (the A14 sanitized-name collision) is structurally unreachable by
   this row's mechanism**, not merely deprioritized - it resolves on the
   convention branch (step 2), which no version of A44's mechanism touches.
4. **The display hazard and its executed proof** (section 4 below) - three
   rows sharing one display collapse `seedEdits`'s dictionary to one slot,
   reproduced against the real function.
5. **The tautology guard's repair is this feature's primary regression
   test**, not a pre-existing hygiene assertion it happens to inherit.
6. **The fork at 3.4 (display wording) is well-formed and terminating.**

---

## 2. The identity rule

### 2.1 Why "any folder is identity" is unsound - unchanged from round 1

Section 0's shape table (round 1, re-verified, not repeated here) proves a
shared wrapper folder and a set of per-student folders are indistinguishable
per file. Any mechanism must discriminate by more than "a folder exists."

### 2.2 The candidate rule - B5's fix applied: the `zipParents` gate is dropped

**Still offered as a candidate mechanism, not a design ruling** - the
architect may implement this differently; what is frozen is the per-shape
table in 2.3, not this mechanism.

> **Compute each file's identity key exactly as today (steps 1-4 of
> `parseSubmissionFileName` untouched). Whenever a file's identity is instead
> resolved by step 5 (the innermost crossing's stem) OR step 6 (the bare
> leaf-stem fallback) - collectively, "resolved via stem fallback" - fold that
> file's own immediate enclosing folder segment into the key as an ADDITIONAL
> discriminator: `key = folderSegment + separator + existingFallbackKey`,
> never `key = folderSegment` alone, and never gated on whether `zipParents`
> is populated for that file.**

**What changed from round 1, and why.** Round 1 gated the fold on "the file
has no populated `zipParents` entry" - i.e. it excluded every file that
crossed a real zip boundary, even when that crossing did not itself resolve
identity (step 5: the crossing's own name failed the convention check, so the
file falls through to a stem fallback anyway). The check's B5 found this gate
unjustified and constructed the counter-example: a bulk-download `.zip`
re-zipped, containing per-student folders. Measured, with the real functions,
against BOTH gates:

```
### GAP-A: bulk.zip containing per-student FOLDERS (zipParents POPULATED)
  bulk.zip/AlvarezMaria/essay.txt  fallback(step5/6)=true folder=AlvarezMaria
  bulk.zip/BrownTom/essay.txt      fallback(step5/6)=true folder=BrownTom
  bulk.zip/ChenLi/essay.txt        fallback(step5/6)=true folder=ChenLi

  UNDER ROUND 1's GATE (zipParents populated -> excluded): all three key
  identically to "bulk" (step 5's crossing-stem fallback) -> 1 row, 3 students
  blended, exactly the harm this row exists to remove, LEFT UNFIXED.

  UNDER THIS REVISION's GATE (fold whenever step 5 or 6 fires, regardless of
  zipParents): compound keys "alvarezmaria::bulk", "browntom::bulk",
  "chenli::bulk" - three DISTINCT keys -> three rows, FIXED. (Row count
  follows directly from `groupSubmissionsByStudent`'s own Map-per-key grouping,
  `utils.ts:301,305,308` - unchanged, already-verified logic; three distinct
  keys are, by construction of a `Map`, three distinct entries.)

### GAP-B: same shape, distinct stems (a41 test-notes' own
  `folder-distinct-stems`, wrapped in one more zip layer)
  bulk.zip/AlvarezMaria/aessay.txt  folder=AlvarezMaria
  bulk.zip/BrownTom/bessay.txt      folder=BrownTom
  Compound keys "alvarezmaria::bulk", "browntom::bulk" - distinct either way,
  because the STEMS already differ; this row was never actually AT RISK, and
  this revision's gate does not change that (no regression on this shape).
```

**One boundary re-verified, not widened past what the check asked for.** A
crossing that DOES resolve via step 3 (the crossing's own name matches the
convention - e.g. `janedoe_2024-01-01_120000_project.zip/main.py`) never
reaches step 5 or 6 at all, so the fold never applies to it; A41's frozen
fixture F7 (two per-student `.zip`s, each self-identifying by convention) is
untouched by this change, confirmed by re-tracing `matchStudentFileConvention`
against `"janedoe_2024-01-01_120000_project.zip"` (four underscore-separated
parts, matches).

**m5's underlying fact, kept as a fact rather than a wave spot-check claim.**
`utils.test.ts:366`'s `"src/otherfile.py"` fixture reaches step 6 with an empty
chain and no folder segment (single path component) - the fold does not apply
to it either way, so this pinned test is unaffected by this revision.

**m2's separator concern, stated as a requirement, not an instrument (Ruling
86).** `leafStemFallback` (`utils.ts:121-126`) can return a stem containing
arbitrary characters when the regex's anchored alphanumeric-prefix match fails
(A41's own 13-path table records `"_draft one.docx" -> key="_draft one"`), so
no printable string separator is provably injective against both components.
**Requirement for whoever builds this: use a construction that makes the
collision unrepresentable** - a tuple key, or a length-prefixed join - rather
than a string-concatenation assertion. This document does not write that
instrument.

### 2.3 The per-shape table, re-frozen with two new rows (B5) and F6 flagged (RULING 85, see section 3)

| Shape | Compound key result | Row count | Verdict |
|---|---|---|---|
| 1. Per-student folders, distinct content, same stem | 3 distinct (folder differs) | 3 | **FIXED** (was 1) |
| 2. One wrapper folder, distinct stems | 3 distinct (stem differs) | 3 | unchanged, correct |
| 3. Wrapper > per-student subfolder | 2 distinct (immediate folder differs) | 2 | correct, unaffected by nesting depth |
| 4. Folder literally named `submissions`, distinct stems | 3 distinct (stem differs) | 3 | unchanged, correct |
| 5. Real nested `.zip` crossing that ITSELF resolves by convention (step 3) | untouched - steps 1-3 own this | unchanged | out of this rule's reach, confirmed re-traced |
| 5a. **NEW (B5, GAP-A): nested `.zip` whose entries fall to step 5, containing per-student FOLDERS** | 3 distinct (folder differs) | 3 | **NEWLY FIXED this revision** - was silently 1 row under round 1's `zipParents` gate |
| 5b. **NEW (B5, GAP-B): same as 5a, distinct stems** | 3/2 distinct either way | unchanged | was never at risk; confirmed unaffected |
| 6. Two folder levels, per-student at the inner level | 2 distinct | 2 | correct |
| 7. One folder, two generic files, one real student (A41's F6) | 1 (folder AND stem agree) | 1 | correct by design - **its REFUSAL verdict is section 3's subject, not this table's; see the terminating question** |
| A41's flat headline (no folder at all) | unchanged - no folder to fold | 1 | **UNFIXED, correctly so** - no identity signal exists |
| Two different students, one shared folder, colliding generic filenames | 1 (folder gives no signal) | 1 | **UNFIXED, correctly so** - the mechanism cannot discriminate a per-student folder from a shared one by structure alone (this is exactly section 3's finding) |
| A14 sanitized-name collision (F1) | untouched - resolved at step 2 | unchanged | **out of scope**, section 2.5 |

### 2.4 The false-split risk (B3) - measured, decided, not residualized

The check's B3 found round 1's own residual understated this risk and
mislabelled it. Re-measured this pass with the real functions, same generator
(`single-student-multi-folder-shared-filename`: one declared student, files
spread across component folders like `backend/`, `frontend/`, all sharing one
filename, e.g. `config.py`):

```
single-student-multi-folder-shared-filename   19858 sets
  ground-truth harm: 0 -> 0 (this shape is never actually cross-student)
  false-split sets: 19382 (97.6%)
```

**One attempted narrowing, measured and REJECTED.** The check suggested,
without measuring it, restricting the fold to sets whose fallback population
shows 2+ distinct folders EACH containing a file with a DIFFERENT stem -
reasoning that a genuine per-student-folder upload should show assignment-name
variety, while one student's own component folders repeat the same filename.
Measured (script published in section 14's appendix note; the fold-condition
check is `distinctFolders>=2 AND distinctStemKeys>=2` over the whole set):

```
                                              sets    harm(before->after)   falseSplit
folder (the row's OWN primary fixed shape)   20000   12177 -> 761           0.0%
single-student-multi-folder-shared-filename  19858       0 ->   0           0.0%
```

**This narrowing eliminates the false-split risk completely, and in doing so
destroys 94% of A44's own primary fix.** The realistic case for the `folder`
shape - every student naming their submission after the SAME assignment,
which is the ordinary case, not an edge case - has exactly ONE distinct stem
across the whole set, so `distinctStemKeys>=2` fails and the fold never
applies: 11,416 of 12,177 previously-fixed harmful sets go back to being
blended. **Rejected.** No other untested narrowing is proposed as free, per
the brief's own measurement discipline.

**Decision (not a residual): ACCEPT the false-split regression, with its
measured size, including the size it grows to under section 3's mechanism.**
Under the refusal mechanism this revision recommends (section 3.3), the
fraction of these false splits that go completely unrefused is **97.6%
(19,382 of 19,858)** - the same population as the split rate itself, because
the SAME folder-sharing signal that grants refusal-amnesty for a real
per-student upload also fires on every split in this shape by construction
(a single student's own component folders always collide on both folder-count
and filename). This is WORSE than round 1's own unrefined mechanism, which the
check measured at 55.1% unrefused - Ruling 85's fold-based refusal amnesty
makes more of this shape's splits invisible, not fewer. **Both numbers belong
in the shipping report**: this row fixes 12,177/12,177 and 9,275/9,275 sets of
real cross-student harm on the shapes it targets, and in exchange it makes a
single student's own multi-folder project split into several graded rows
97.6% of the time, invisibly 97.6% of the time, on the shape most likely to
occur when a non-Canvas coding project is uploaded to the multi-student
control by mistake.

### 2.5 F1 (the A14 convention-branch collision) - unchanged, still out of scope

`johnsmith_1001_0_report.docx` / `johnsmith_1002_0_report.docx` resolve on the
convention branch (step 2), which no version of this mechanism touches -
re-confirmed this pass by re-tracing `matchStudentFileConvention` against both
names (4 parts, both non-empty halves, matches). Not re-filed here.

---

## 3. RULING 85 - the refusal predicate becomes folder-aware too

### 3.1 Why folding the key alone raises the false-refusal rate (B1)

The check's argument needs no measurement to confirm and is repeated here
because everything downstream depends on it: **a conservative refusal is, by
definition, a collision with no cross-student harm - so every colliding file
in it belongs to ONE student, so in a per-student-folder zip they all sit in
the SAME folder, so the folder component of a compound key is CONSTANT across
them.** Folding the key alone (2.2) therefore cannot remove a conservative
refusal, because if A41's decision predicate is left as "refuse iff 2+
fallback-reaching files share a key" and the key it reads is now the compound
key, two files sharing one folder (a real F6-shape single-student duplicate)
still share their compound key and still collide. Measured against the
published generator (re-implemented from `docs/a41-test-notes.md` section 1.3,
calibrated to within 1% of its published baseline on every shared column -
`folder-resubmit`: mine 19968/9275/12190 against published 19975/9209/12110):

```
folder-resubmit   sets=19968  CONSERVATIVE: today(unfolded)=2915(14.6%)  folded-key-only=5008(25.1%)
```

**The rate rises, exactly as the check found: 14.6% -> 25.1%.** This is why
Ruling 85 widens A44 to own the decision predicate too, not only the key.

### 3.2 The literal mechanism Ruling 85 describes is measurably UNSOUND

Ruling 85's own text: "the refusal becomes folder-aware... do not refuse when
every colliding file shares one folder segment." Implemented literally -
refuse iff 2+ fallback-reaching files share a compound key, UNLESS every file
in that colliding group shares one identical, non-null folder segment, in
which case allow - and measured against the same generator plus a new shape
built to attack it (`shared-wrapper-folder`: every file in ONE common wrapper
folder, filenames independent, so two different real students occasionally
collide on a shared generic stem purely by chance):

```
shape                    sets    harm(before->after)   CONSERVATIVE   UNSOUND (harm allowed)
folder-resubmit          19968   9275 -> 0              0 (0.0%)       0
shared-wrapper-folder    19932   11360 -> 11360          0 (0.0%)       11360  <- ALL of it
```

**Every single one of the 11,360 real cross-student harmful sets on the
shared-wrapper-folder shape - a wrapper folder used by an entire class,
exactly what a naive "Upload ZIP" workflow produces when an instructor does
NOT organize by per-student subfolder - becomes silently unrefused.** The
literal mechanism cannot distinguish "these two files share a folder because
one student put them there" from "these two files share a folder because
EVERYONE'S files are in it and two of them happened to collide" - the two
shapes are IDENTICAL from the file paths alone. **This mechanism, applied
literally, reintroduces the exact defect A41 was filed to prevent, on a
realistic shape, at 100% of that shape.** It is not fixable by patching the
condition; the ambiguity is structural. Ruling 85's INTENT (own the decision,
lower the rate) is sound; this specific wording is not, and must not ship
as written.

### 3.3 The refined mechanism: run-gated trust, measured sound on every shape tested

**Refinement: only grant folder-based amnesty when the SAME run's
fallback-reaching population shows 2+ DISTINCT folder segments elsewhere** -
i.e. only when the zip demonstrably uses per-student folders as a structural
convention, not when the whole run shares one wrapper. A run with only one
folder (or none) among its fallback-reaching files never gets the amnesty, no
matter how the collision inside it looks.

```
shape                    sets    harm(before->after)   CONSERVATIVE          UNSOUND
flat                     19932   11360 -> 11360         0 (0.0%)             0
folder                   20000   12177 -> 0              0 (0.0%)             0
folder-resubmit          19968    9275 -> 0              1272 (6.4%)          0
shared-wrapper-folder    19932   11360 -> 11360          0 (0.0%)             0   <- fully protected
folder-distinct-stems    20000       0 -> 0              0 (0.0%)             0
```

**This achieves a real, substantial reduction (14.6% -> 6.4%, a 56% relative
fall) with ZERO new unsoundness on every shape measured, including the exact
shape (3.2) that broke the literal mechanism.** It does not reach "near zero"
- see 3.4 for exactly which population it cannot reach and why, since that
is the honest remainder rather than a rounding error.

**GAP-A/B (section 2.2/2.3) are unaffected by which refusal reading is
chosen** - their fix is entirely in the KEY fold (distinct compound keys, no
collision to adjudicate), confirmed by re-running both readings against the
GAP-A/B fixtures: refusal is `false` under every reading, because there is
nothing left to refuse once the row split is correct.

### 3.4 The unresolved tension: F6 in isolation

Ruling 85 explicitly directs: "A41's frozen fixture F6 is re-frozen from
REFUSE to ALLOW." F6 (`docs/a41-test-notes.md:218`) is exactly two files,
`AlvarezMaria/Homework Final.docx` and `AlvarezMaria/Homework Draft.docx`, and
nothing else in the run. Measured against BOTH mechanisms:

```
F6 in isolation:  folderAware(literal, 3.2's UNSOUND version) = ALLOW (matches Ruling 85)
                  folderAware(refined, run-gated, 3.3's SOUND version) = REFUSE (does NOT)
```

**This is not a bug in the refinement; it is the same structural ambiguity
section 3.2 names, viewed from the other side.** An isolated two-file,
one-folder run is MECHANICALLY IDENTICAL whether it is "one student's own
duplicate" (F6) or "two different students, one shared folder, one coincidence
of naming" (the shape section 2.3's own table already marks UNFIXED,
correctly, two rows above F6). Nothing in the file paths of an isolated F6 run
distinguishes it from that other, harmful shape. The run-gate that protects
`shared-wrapper-folder` (3.3) necessarily also withholds amnesty from an
isolated F6, because from the mechanism's point of view they are the same
input. Granting F6 amnesty requires trusting a SINGLE folder with no
corroborating structure elsewhere in the run - which is exactly what section
3.2 measured as unsound at 100% of a realistic shape.

**So Ruling 85's specific F6 instruction and its own soundness goal are in
direct, measured tension, and no revision of this document resolves it - it
is the STOPPING POINT.** See the terminating question at the end.

### 3.5 What this means for A41's own artifacts - handed over, not authored here

A41's frozen oracle (`docs/a41-test-notes.md` section 1.4) currently pins F6's
`DECISION` column to `REFUSE` and R1's direction of failure to "RED... when F6
is ALLOWED" (`docs/a41-test-notes.md:309`). Whichever answer the terminating
question receives, **A41's own test-notes must be revised to match** - this
document does not revise them (they are `loop-test-author`'s artifact, not
this seat's), but states precisely what changes: under the refined (3.3)
mechanism, F6 stays REFUSE and NOTHING in A41's oracle changes; under the
literal (3.2) mechanism, F6 flips to ALLOW and R3's `folder-resubmit`
frozen refusal count (`docs/a41-test-notes.md:358-359`, currently 12110) must
be re-frozen to reflect the new predicate. Either way, A41's decision leaf -
not yet implemented (`grep -rln "resolve to the same student" src/` still
exits 1, re-verified this pass) - is now jointly owned by A41 and A44's
mechanisms, and whichever chunk writes it owes both.

---

## 4. The display-string hazard - unchanged from round 1, re-verified

### 4.1 Why key uniqueness alone is not enough

Every one of `parseSubmissionFileName`'s six return sites sets
`studentKey = studentDisplay.toLowerCase()` (`utils.ts:116-117, 193-194, 221,
234-235, 247, 256`, re-verified this pass, unchanged addresses). The
compound-key rule breaks this invariant for the first time in this codebase's
history.

### 4.2 The census of display-keyed sites - re-derived fresh (M1's fix)

Round 1's "six places" was a floor. Re-derived this pass with my own command,
matching the check's independent derivation exactly:

```
$ grep -rnE "\[(result|r|entry)\.student\]|\[student\]|\[expandedBox\.student\]|\[codeOutputStudent\]|\.student === |=== codeOutputStudent" src \
    --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -vE ":[0-9]+: *(//|\*|/\*)" | wc -l
34
$ ... | cut -d: -f1 | sort | uniq -c
  24 src/app/components/GradingResults.tsx
   4 src/app/components/grading-results/gradingResultsHelpers.ts
   2 src/app/components/grading-results/ungradedDisclosure.ts
   1 src/app/components/message-replies/message-serialization.ts   (different `student`, unrelated)
   1 src/lib/course-intel/offline-identity.ts                       (different `student`, unrelated)
   1 src/lib/message-reply-prompt.ts                                (different `student`, unrelated)
   1 src/lib/supabase/courses.row.ts                                (different `student`, unrelated)
```

**30 sites across the three grading-results files.** Two of them are the
post-to-Canvas fan-out, keyed on the display string, previously uncensused:
`GradingResults.tsx:332` (`refusals[r.student]`), `:334`
(`postableResults = gradableResults.filter((r) => !refusals[r.student])`),
`:336,339,346,364,377-378,383,393-395,403` all read or write the same
display-keyed dictionaries on the path that actually posts a grade to Canvas -
not a React reconciliation nicety, a real grade reaching a real student under
whichever display string this run assigned. `GradingResults.tsx` itself is
**906 lines** (0.1), 94 under the 1000-line ceiling - a fact stated for
whoever builds this; no line budget is assigned to any wave here (Ruling 86).

### 4.3 Executed proof, against the real functions

Unchanged from round 1, re-run this pass against the real, import-only-diffed
`gradingResultsHelpers.ts` (section 0(b)):

```
distinct rows: 3, all with student="essay"
distinct keys in seedEdits() output: 1
surviving strengths: only the LAST row's seed survives
```

---

## 5. The tautology guard - unchanged from round 1

`utils.test.ts:360-375`'s guard is latent insurance under A41 (which never
changes `groupSubmissionsByStudent`'s output) and becomes this feature's
PRIMARY regression test the moment A44's mechanism lands, because it is
exactly the assertion that would catch a fold that disambiguates the KEY but
forgets the DISPLAY.

---

## 6. The saved-edit migration requirement (B4's fix)

### 6.1 Why "display unchanged" is the wrong object

Round 1's requirement (5.2) protected "a row whose display string is
unchanged." The check's B4 found the case that bites: 3.4's recommended
default folds the DISPLAY only when 2+ rows in the SAME batch would share it -
a batch-dependent fact. A row's own KEY (the compound key from 2.2) is folded
unconditionally whenever that file resolves via stem fallback and has a
folder - independent of the batch. **These two facts can disagree**, and when
they do, a row whose own file never moved can still lose its display, and
with it, its edit.

**Corrected object: a row whose IDENTITY KEY is unchanged from the run under
which the edit was saved** - a per-file fact, computable without knowing the
rest of the batch (unlike "would this display collide"). Restated this way,
the requirement's OBJECT is always determinable from the row alone.

### 6.2 Executed proof that the current default still fails the corrected object

Against the real `seedEdits`/`loadPersistedEdits` (section 0(b)):

```
Run 1: AlvarezMaria/essay.txt ALONE. Compound key = "alvarezmaria::essay".
       Display (3.4's default, nothing to collide with) = "essay".
       Instructor saves strengths = "INSTRUCTOR EDIT ON MARIA".
Run 2: BrownTom/essay.txt joins. Maria's compound key is UNCHANGED
       ("alvarezmaria::essay" both times - her own file did not move).
       But her DISPLAY changes to "essay (AlvarezMaria)" because 3.4's rule
       now sees a collision to avoid.
Recovered strengths for "essay (AlvarezMaria)": "orig strengths"
Did Maria's key-unchanged edit survive? false
```

**The current default (display-keyed storage, collision-triggered fold) fails
the corrected requirement, even though it happens to satisfy round 1's
narrower one.** This is not F6/5.1's already-accepted "previously-wrong
collapse" case - Maria's row was never wrong; her own file's identity never
changed; only a sibling's arrival did.

### 6.3 Executed proof that a key-keyed construction satisfies it

A companion harness (not the real function - the real storage layer is
display-keyed today) re-implements the same seed/merge logic keyed on the
compound key instead of the display string, over the same two runs:

```
Recovered strengths under key-based storage: "INSTRUCTOR EDIT ON MARIA"
Survived? true
```

**This is the construction `traps-spec.md` prefers over a patched
assertion**: making the bad state unrepresentable (storage bound to the
stable object) rather than asserting it is absent. It is offered as PROOF the
requirement is satisfiable, not as a decision - see 6.4.

### 6.4 What this requires of the architect - one paragraph, per Ruling 86

Whoever designs Wave 2 must choose between two constructions, both proven
satisfiable above: **(a)** key persisted edits on the row's stable identity
key rather than its display string, which makes 6.1's whole problem class
unrepresentable, at the cost of touching every one of section 4.2's 30
display-keyed sites' storage layer; or **(b)** keep display-string storage
and add an explicit migration step that, on load, also matches a stored edit
whose OLD display corresponds to the SAME identity key under the new run's
mapping, even when the display text itself changed. Either discharges 6.1's
requirement; which one is the architect's design decision, not this
document's. This document does not name the file, the test, or the write set
for either.

---

## 7. Reachability - M4's citation fix

**The instrument that actually produces the caller count, corrected:**

```
$ grep -rn "gradeAction(" src/ | grep -v "\.test\."
src/app/actions/grading.ts:707                                  (the DEFINITION, not a caller)
src/lib/workflows/registry/steps.grading-cartridge.ts:108
src/lib/workflows/registry/steps.grading-draft-flow.ts:271
src/lib/workflows/registry/steps.grading-run.ts:481
src/lib/workflows/registry/steps.grading-run.ts:549
```

`page.tsx:63` calls `gradeAction` through `useActionState(gradeAction, ...)`,
which does NOT contain the literal substring `gradeAction(` - the instrument
named above provably cannot see it. `grep -rn "gradeAction" src/ | grep -v
"\.test\."` (no trailing paren) returns **16** lines and does include it. Round
1 cited the first command but described the second command's result. **The
conclusion survives**: A44's own reach is a strict subset of A41's, because
`groupSubmissionsByStudent`'s only two production call sites
(`extraction.ts:138`, `engine.ts:432`) are unchanged and A44 introduces no new
one - but it survives by the correct instrument, not the one named.

Everything else in round 1's reachability trace (the hop-by-hop table, the
Gemini-default finding, the reading-claim discipline for section 4.2's
render question) is unchanged and re-verified.

---

## 8. What this scope requires of the wave plan and test author (RULING 86 - not written here)

Per Ruling 86, oracle construction belongs to `loop-test-author` and wave
sequencing to `loop-plan`, each in their own artifact and their own round -
not in this document. What this scope's own analysis fixes as a REQUIREMENT
on those artifacts, so it does not have to be re-derived there:

- **The key fold (2.2) and the decision predicate (3.3) are now ONE change,
  not two.** A wave that lands the key fold without also landing the
  folder-aware refusal ships the 14.6% -> 25.1% regression measured in
  section 3.1, live, with every existing gate green. Whoever plans this must
  land both in the same wave, or land the refusal first with the key fold as
  its own immediately-following wave with no intervening ship.
- **The display fold (3.4/9, this document's fork) must land in the SAME
  wave as the key fold**, per this document's own tautology guard (section
  5) - a key-only wave makes `utils.test.ts:373` fail on its own required
  row-4 fixture, which is section 4/5's whole point.
- **Whichever construction discharges section 6's migration requirement
  (6.4(a) or 6.4(b)) touches storage, which section 4.2 shows has 30
  display-keyed call sites across three files, including the post-to-Canvas
  fan-out** - a wave that changes fewer of them ships a partial fix with the
  same gates green.
- **`GradingResults.tsx` is 906/1000 lines (0.1, 4.2) and holds 24 of the 30
  display-keyed sites** - re-check the ceiling before this wave, not after.
- **A41's decision leaf is not yet implemented** (section 3.5) and is now
  jointly owed by whichever chunk builds A41's refusal - the wave plan must
  name which chunk writes it, because under Ruling 85 there is no version of
  this row that ships without it.
- **Gate every wave on `git status --short` against its own assignment**, per
  `docs/loop/this-repo.md` section 7.

This document does not decide the mechanism's exact file, the write sets, or
the wave order; that is the plan seat's own artifact.

---

## 9. Leverage - unchanged from round 1, citation fixed (m3)

**GUARANTEED class claim**, per `docs/loop/leverage.md`: the SCALE guarantee
`src/lib/grade/engine.ts:113-134` already gives (one rubric applied
identically across a batch, the `GradeResult` assembly) is worthless if the
batch itself is wrong before the model ever sees it. A44's mechanism
guarantees that a zip whose folders name distinct students produces one
graded row per folder-identified student, by construction of the grouping
key - a chat window has no zip-ingestion step and no typed grouping key to get
right or wrong in the first place.

**Removal test:** delete the fallthrough step from `utils.ts` and 2.3's
row-1/5a fixtures go from 3 rows back to 1.

---

## 10. Fork summary (unchanged from round 1)

Only one genuine fork remains from round 1, restated here as the index the
brief asks for; it is independent of section 3's terminating question and can
be answered on its own schedule:

> **Display wording when the new folder step disambiguates a group: fold the
> folder in as a suffix (`"essay (AlvarezMaria)"`) or replace the display with
> the folder alone (`"AlvarezMaria"`)?** My recommendation remains (1) -
> suffix - because it is a strict superset of information for the rows it
> touches and leaves every untouched row exactly as it is today (a
> precondition of section 6's migration requirement, whichever construction
> is chosen).

---

## 11. Residual register (M5's fixes applied)

| id | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| RES-A44-1 | The compound-key mechanism (2.2) and the refusal mechanism (3.3) are candidates, not design rulings. | the architect pass consuming this scope | the frozen per-shape table, section 2.3 (now twelve rows) | The architect's chosen mechanism's output on EVERY row of section 2.3's table. RED on any row's verdict changing without a stated reason. | The architect pass, before any wave. |
| RES-A44-2 | Whether newly-separated rows render as distinct, independently-editable table rows in the browser (section 4, `GradingResults.tsx:635`'s `<tr key>`). | the repo owner (browser check) - this environment renders no component | upload a real folder-shaped zip with the fix live; inspect the DOM | What is on screen against section 4's requirement. FAILS if editing one row's grade visibly affects another, or fewer than the expected row count appears. | Owner verification, after the display-fold wave lands. Blocks nothing. |
| RES-A44-6 | Whether real instructors' zips exhibit the shapes this document constructs (folder, shared-wrapper-folder, single-student-multi-folder) at the frequencies assumed, rather than as structural hypotheses. | the repo owner | none available in this environment (no live uploads, no analytics) | Real-world shape frequency. Not verifiable here at all, per `docs/loop/this-repo.md` section 6. | **Reclassified from a residual to an owner-only backlog escalation** (M5's fix) - an instrument of "none" and a step of "never" is a deletion dressed as a residual; this is listed so it is not forgotten, not so it is picked up by an agent. |

**RES-A44-3 (round 1) is withdrawn as a residual and decided instead** - the
display-wording fork (section 10) rides alongside other work per this
project's own standing rule; it is not blocking and not a "requirement
knowingly not proven now," so it does not meet `iteration-caps.md`'s own
definition of a residual. **RES-A44-5 (round 1) is discharged** by section
6.1's restated requirement, which is now the row's own stated object rather
than a gap between the row's wording and the scope.

---

## 12. What I could not determine

- **Whether real instructors' zips take the shapes this document constructs**
  at the frequencies assumed. RES-A44-6.
- **What the table actually looks like on screen** after the display fold
  lands - RES-A44-2. No component is rendered by any test in this repo.
- **Whether A41 will have landed before A44 is implemented** - moot in one
  sense (section 3.5: A41's decision leaf does not exist yet either way) but
  live in another: whoever writes it now owes BOTH rows' requirements at once.
- **Which reading of Ruling 85 the owner wants** - section 3.4's terminating
  question. This is not a "could not determine from the tree" item; it is a
  genuine, measured trade-off with no third answer that avoids it.

---

## 13. Corrections to the A44 backlog row itself

None found beyond what round 1 already stated. One addition: the row's
pass condition ("the conservative refusal rate... must fall from the measured
14.5%") is **partially, not fully, achievable** under the mechanism this
document can defend as sound - see section 3.3's 6.4% figure and section 3.4's
terminating question for the remainder.

---

## 14. Gate run and tree state for this pass

```
$ npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
Test Files  2 passed (2) / Tests  21 passed (21)
EXITCODE=0

$ npm run test:paths -- src/lib/grade/utils.test.ts src/lib/grade/extraction.test.ts src/lib/grade/single-file-entry.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts
COVERED src/lib/grade/utils.test.ts files=1 passed=28
COVERED src/lib/grade/extraction.test.ts files=1 passed=9
COVERED src/lib/grade/single-file-entry.test.ts files=1 passed=15
COVERED src/lib/grade/grouping-zip-parents.wiring.test.ts files=1 passed=7
Test Files  4 passed (4) / Tests  59 passed (59)
EXITCODE=0
```

Both unchanged from round 1 and the check - nothing under `src/` was touched
by this pass.

**Appendix note on the false-split narrowing (section 2.4).** The attempted
narrowing's sweep script lived at `.a44rev/sweep2.mts` inside the scratch
directory below, and is not reproduced inline here (`traps-spec.md`'s own
discipline is to publish a generator whose RATE is quoted as a claim; the
narrowing's rates ARE quoted in 2.4, and the script differs from the appendix
generator in section 3 only by its fold-condition, which is stated in 2.4's
own prose in full: `distinctFolders>=2 AND distinctStemKeys>=2` over the
run's fallback-reaching population).

Scratch directory used for every harness in this pass, removed before this
document was finalized:

```
$ rm -rf .a44rev
$ ls -d .a44rev
<exit 2 - confirmed absent>
```

**Final `git status --short`:**

```
 M docs/css-orphans.md
 M src/app/actions/action-guard-coverage.test.ts
?? docs/a44-scope.md
```

`docs/a44-scope.md` is this pass's only entry. `docs/css-orphans.md` belongs
to another row, untouched here. `src/app/actions/action-guard-coverage.test.ts`
is the live sibling named in this pass's own brief, untouched here - no
`git stash`, `git add -A` or `git checkout --` was run at any point, and
nothing under `src/lib/supabase/` or `src/app/actions/` was read for any
purpose other than this note.

---

## THE QUESTION FOR THE OWNER

Worded so every answer ends this activity. Not a stop; section 2.4's
narrowing was tested and rejected in the same pass, and everything else in
this document is finished regardless of the answer.

> **Ruling 85 directs A41's frozen fixture F6 to be re-frozen from REFUSE to
> ALLOW. Measured this pass: the ONLY mechanism that does this (fold whenever
> colliding fallback files share one folder, unconditionally) also silently
> allows 100% of a realistic, measured shape - 11,360 of 11,360 sets where a
> whole class shares one wrapper folder and two different students' files
> collide by coincidence - which is the exact defect A41 exists to prevent.
> A refined mechanism (only trust the folder when the SAME run shows 2+
> distinct folders elsewhere) protects that shape completely (0 unsound,
> measured) and still lowers the conservative-refusal rate substantially
> (14.6% -> 6.4%, measured) - but does not flip an ISOLATED F6 (a zip
> containing only that one student's two files) to ALLOW, because nothing in
> that shape's file paths distinguishes it from the harmful one above; they
> are mechanically identical inputs.**
>
> Pick ONE. Each ends this activity; the scope ships as it stands with the
> answer applied.
>
> **(1) SHIP THE REFINED MECHANISM.** F6 in isolation stays REFUSE - Ruling
> 85's specific fixture instruction is NOT carried out. The conservative rate
> falls from 14.6% to 6.4% (measured), and the shared-wrapper-folder shape
> stays fully protected (measured). Cost of being wrong: the row's stated
> purpose is only partly achieved.
>
> **(2) SHIP THE LITERAL MECHANISM.** F6 re-freezes to ALLOW exactly as
> Ruling 85 states; the conservative rate falls to ~0%. The
> shared-wrapper-folder shape's 11,360 harmful sets become silently allowed -
> a new, measured regression of the exact class A41 was filed to prevent.
> Cost of being wrong: an instructor whose class shares one dropbox folder
> gets a silently blended grade with nothing to warn them, on a shape that
> needs no folder discipline at all to trigger.
>
> **(3) NARROW FURTHER, IN A NEW ROUND.** Neither mechanism measured here
> resolves the tension; a third construction might (for example, trusting the
> folder only when it is also the file's OWN declared roster-derived
> identifier, if such a signal exists elsewhere in the upload - not measured,
> not proposed as free). Costs a new round on this exact class, which
> `iteration-caps.md` caps at two attempts per class before it goes to
> disposal; this would be attempt two.
>
> **My recommendation: (1).** The measured cost of (2) is larger and more
> dangerous than the measured shortfall of (1): (2) reintroduces a live,
> silent, cross-student grading defect on a shape that requires NO folder
> discipline to occur (any class-wide dropbox folder), while (1) merely fails
> to close as much of a false-refusal population that is already a strictly
> better failure mode than a wrong grade (a refusal is visible, reversible,
> and named; a silently blended grade is none of those). Cost of being wrong
> about (1): the row's own pass condition is not fully met, and that is a
> visible, honest number in the shipping report, not a hidden defect.
