# A44 scope, round 1 adversarial check

Artifact under check: `docs/a44-scope.md`, committed at `3360e59`, **841 lines**
(`@(Get-Content docs\a44-scope.md).Count` = 841; `wc -l docs/a44-scope.md` = 841).
Checker did not author it. Round 1 of at most two.

Write set for this pass: `docs/a44-check.md` only. Nothing under `src/` and no
other `docs/` file was written or mutated. `git status --short` at the end.

---

## 0. How every number below was produced

**(a) Executing the REAL modules, with an import-only diff.** I did not
transcribe logic and I did not stub the text-extraction path. I copied five real
files into an untracked `.a44chk/` directory at the repo root (needed so Node's
ESM resolver finds the real `jszip`/`officeparser`; the session scratchpad is
outside the tree) and changed **nothing but import specifiers**. The diffs, in
full:

```
$ diff extraction.ts.orig extraction.ts        # 7 lines, all specifiers
  "../office-extract" -> "./office-extract.ts"
  "../canvas"         -> "./stub-canvas.ts"     (never called by extractSubmissions)
  "./types"           -> "./types.ts"
  "./constants"       -> "./constants.ts"
  "./utils"           -> "./utils.ts"
  "../submission-repo" -> "./stub-repo.ts"      (never called)
  "./repo-content"    -> "./stub-repo.ts"       (never called)
$ diff utils.ts.orig utils.ts                  # 3 lines, all specifiers
$ diff types.ts.orig types.ts                  # 1 line, type-only specifier
$ diff constants.ts.orig constants.ts          # exit 0, BYTE-IDENTICAL
$ diff office-extract.ts.orig office-extract.ts # exit 0, BYTE-IDENTICAL
$ diff grh.orig grh.ts                         # 1 line:
  50c50 import type { GradeActionState } from "../../actions";
     -> import type { GradeActionState } from "./stub-actions.ts";
```

`grh.ts` is `src/app/components/grading-results/gradingResultsHelpers.ts`. It has
exactly ONE import (`grep -n 'from "' src/app/components/grading-results/gradingResultsHelpers.ts`
returns one line, `:50`, and it is `import type`), so **`seedEdits`,
`mergeStoredRowEdit`, `loadPersistedEdits` and `composeOverallCommentLocal` can
be imported and executed for real** under `node --experimental-strip-types`. The
scope hand-transcribed them instead (its own section 0 admits this is "a
materially weaker guarantee"); that was not necessary, and section 5 below reports
what the real functions do.

All harnesses were driven with `node --experimental-strip-types <file>.mts`,
exit code read from `$?` on the line after the command, never through a pipe.

**(b) Line counts.** `@(Get-Content <file>).Count` in PowerShell, cross-checked
with `wc -l` from Bash. No `Measure-Object -Line` call was made.

**(c) Absence claims.** Every one is paired with a canary using the same pattern
AND the same filter chain against something present, and the canary's own count
is printed.

**(d) Test gates.** `npm run test:paths -- <p1> <p2> ...` only. No raw
multi-path `vitest`/`npm test` was run, and **the scope contains none either**:
`grep -n "vitest run\|npm test" docs/a44-scope.md` exits 1 with
`grep -c "test:paths" docs/a44-scope.md` returning 3 as the canary. That check is
clean - no gate or instrument in this artifact silently drops a path.

**(e) `tsc` was deliberately NOT run.** I wrote no TypeScript. `this-repo.md`
section 2 reserves `npx tsc --noEmit` to exactly one caller because it races on
`tsconfig.tsbuildinfo`, and a sibling is live in `src/app/components/ui/`. There
is nothing of mine for a type gate to measure.

**(f) Scratch directory removed.** `rm -rf .a44chk` (exit 0), confirmed by
`ls -d .a44chk` returning exit 2.

---

## VERDICT: **BUILDABLE IN PART**

| Severity | Count |
|---|---|
| Blockers | 5 |
| Majors | 5 |
| Minors | 5 |

The scope's central structural finding is **CORRECT and reproduces** (section 1
below). Its display-hazard finding is **CORRECT and reproduces against the real
functions**. Its self-found false-split risk is **REAL and much larger than the
scope treats it as**. What is broken is everything that connects those findings
to the row's stated purpose: the mechanism the scope specifies **cannot move the
number the row exists to move**, and the two sections that claim it can require
mutually exclusive readings of a predicate A41 froze.

---

## CONFIRMED SOUND - do not re-litigate

Stated first and briefly, per the brief. These are real and I tried to break them.

1. **"Any folder means identity is provably UNSOUND" - REPRODUCED, with a
   stronger method than the scope used.** Driving the REAL `extractSubmissions`
   (import-only diff above) over real JSZip archives:

   ```
   ### S1 per-student folders, same stem
     AlvarezMaria/essay.txt  zipParents=undefined citation="essay.txt"  todayKey="essay"
     BrownTom/essay.txt      zipParents=undefined citation="essay.txt"  todayKey="essay"
     ChenLi/essay.txt        zipParents=undefined citation="essay.txt"  todayKey="essay"
     ROWS today=1 [essay]
   ### S2 one shared wrapper folder, distinct stems
     Submissions/essay1.txt  zipParents=undefined citation="essay1.txt" todayKey="essay1"
     Submissions/essay2.txt  zipParents=undefined citation="essay2.txt" todayKey="essay2"
     Submissions/essay3.txt  zipParents=undefined citation="essay3.txt" todayKey="essay3"
     ROWS today=3 [essay1, essay2, essay3]
   ```

   Per file, S1 and S2 are the same shape: one folder segment, `zipParents`
   absent. The scope's section 2.1 conclusion holds - a rule that promotes the
   folder to identity unconditionally turns S2's three correct rows into one. The
   compound key is therefore **forced**, not over-engineering. The row's own
   phrasing ("read per-student FOLDERS ... as a first-class identity signal") is
   not implementable as literally written, and the scope is right to say so.

2. **Shape 3 / Shape 6 behave as 2.3 claims.** `Submissions/AlvarezMaria/essay.txt`
   and `CS101_Fall_2026/AlvarezMaria/essay.txt` both fold `alvarezmaria`, because
   the immediate parent is the per-student segment. Measured: 1 row today, 2 rows
   after, for both shapes. No nesting special case is needed.

3. **Section 3.1's invariant is real.** All six return sites of
   `parseSubmissionFileName` do set `studentKey = studentDisplay.toLowerCase()`
   (`utils.ts:193-194, 116-117, 221, 234-235, 247, 256` - all six opened). Key
   uniqueness therefore implies display uniqueness today, by construction.

4. **Section 3.3's data loss reproduces against the REAL `seedEdits`:**

   ```
   === C) seedEdits collapse when 3 rows share one display ===
     rows in run = 3   keys in seedEdits = 1
     surviving strengths = "Li real feedback"   surviving total = 9
   ```

   Two of three students' seeded feedback is gone before the page opens. The
   scope's number (3 rows -> 1 dictionary slot) is right.

5. **Section 5.3's two scenarios reproduce against the REAL
   `loadPersistedEdits`:** scenario A recovers `total = 9.5` and
   `strengths = "INSTRUCTOR EDIT"`; scenario B yields keys
   `["essay (AlvarezMaria)","essay (BrownTom)","essay (ChenLi)"]` with
   `any total === "6"` false. Both as stated.

6. **Every `file:line` in section 0.1's table is correct.** All thirteen
   `wc -l` values match exactly. So do `types.ts:3` (`MAX_NESTED_ZIP_DEPTH = 3`),
   `extraction.ts:65-66/70-74/95/106`, `file-size-ceiling.structure.test.ts:41`
   (`const LIMIT = 1000`), `llm-provider.ts:14` (`DEFAULT_PROVIDER = "gemini"`),
   `engine.ts:431-432`, `extraction.ts:134/138`, `GradingTab.tsx:315`/`:322`,
   `grading.ts:707/740/854/892/903/905/920`, `gradingResultsHelpers.ts:81-86`
   and `:613-618`, `utils.test.ts:326-334/336-351/360-375/373`, and all six of
   section 3.2's addresses. Section 0's disclosure that its own harness hardcoded
   `MAX_NESTED_ZIP_DEPTH = 5` against a real 3 is exactly the right discipline.

7. **The wave-1 gate reproduces exactly.**
   `npm run test:paths -- src/lib/grade/utils.test.ts src/lib/grade/extraction.test.ts src/lib/grade/single-file-entry.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts`
   gives `Test Files 4 passed (4) / Tests 59 passed (59)`, exit 0, with
   `COVERED ... passed=28 / 9 / 15 / 7`.

8. **The sequencing fact is confirmed.** `grep -rln "resolve to the same student" src/`
   exits 1 (canary: `grep -rln "leafStemFallback" src/` exits 0 and returns 3+
   files). A41 exists only as doc commits. Section 8 below says what that means.

9. **F1's unreachability is genuinely STRUCTURAL, not a deprioritisation.** I
   attacked it by putting convention-named files inside per-student folders:

   ```
   AlvarezMaria/alvarezmaria_2026-09-01_120000_essay.txt  reachesFallback=false folded=false
   BrownTom/browntom_2026-09-01_120000_essay.txt          reachesFallback=false folded=false
   ```

   Step 2 matches at the leaf, so the folder is never consulted even when it is
   present. A44's mechanism cannot reach the convention branch under any folder
   arrangement. Section 2.5's claim is sound.

10. **The fork (section 3.4/9) IS terminating.** I checked the one thing that
    would break it: whether branch (2) moves an already-landed pin.
    `utils.test.ts:128-136` asserts
    `parseSubmissionFileName("src/main.py").studentDisplay === "main"` twice, and
    both survive branch (2) because both wordings disambiguate only where 2+ rows
    would collide, and those are single-path calls. Neither branch reopens 2.2,
    3.1-3.3 or section 5. The fork is well-formed. **It is also not the question
    that needs asking** - see "THE QUESTION FOR THE OWNER".

---

## BLOCKERS

### B1. The row's ONE measured purpose cannot be met by this mechanism, and the conservative refusal rate RISES rather than falls. The two sections that claim otherwise require mutually exclusive readings of A41's frozen predicate.

Class: **the artifact's own primary pass condition cannot be reached by the
mechanism the artifact specifies.**
**REPEAT-OF-A41-B3** (`docs/a41-check.md:198`, "T1, the scope's primary
instrument, can never go green under fork answer X"). Same corrective rule:
execute the stated pass condition against the stated mechanism, under every
reading, before shipping the artifact.

Citations under attack:

- The A44 row's pass condition, `docs/BACKLOG.md:117`: "the conservative refusal
  rate for a two-generic-file student folder **must fall** from the measured
  14.5% (2901 of 19,975)".
- `docs/a44-scope.md:242-252` (section 2.2, bullet 3): "Once these files resolve
  via the new step instead of the bare fallback, A41's own decision ... **no
  longer sees them as reaching the fallback at all - the false refusal
  disappears without A41's decision logic itself changing.**"
- `docs/a44-scope.md:296` (section 2.3, row 9): the cross-student shared-folder
  shape is UNFIXED and "**A41's REFUSE remains the fallback**".
- A41's frozen predicate, `docs/a41-test-notes.md:690-692`: "refuse iff two or
  more DISTINCT paths that reach the leaf-stem fallback share a `studentKey`. A
  path reaches the fallback when its `zipChain` is empty and
  `parseSubmissionFileName(p).citationFileName === getBaseFileName(p)`."

**Reading A - the key is folded, `citationFileName` is untouched (what 2.2
actually specifies, and what 2.3 row 9 requires).** `utils.ts:257` sets
`citationFileName: baseName` at step 6, so a foldered file still satisfies A41's
discriminator. A44's compound key therefore does not remove anything from the
refusal population; it only changes what collides. Executed on A41's OWN two
published conservative cases:

```
### S7/F6 one student folder, two generic files (A41 frozen fixture F6)
  AlvarezMaria/Homework Draft.txt  reachesFallback=true  compoundKey="alvarezmaria::homework"
  AlvarezMaria/Homework Final.txt  reachesFallback=true  compoundKey="alvarezmaria::homework"
  A41-REFUSE today=true   A41-REFUSE after-A44=true

### A41 1.5's own measured conservative EXAMPLE
  EvansJo/Homework Draft.txt  compoundKey="evansjo::homework"
  EvansJo/Paper Final.md      compoundKey="evansjo::paper"
  FordKim/Essay Draft.txt     compoundKey="fordkim::essay"
  FordKim/Essay Final.md      compoundKey="fordkim::essay"
  A41-REFUSE today=true   A41-REFUSE after-A44=true
```

This is not a sampling accident, it is **analytic**: a conservative refusal is by
definition a collision with no cross-student harm, so every colliding file in it
belongs to ONE student, so in a per-student-folder zip they all sit in the SAME
folder, so the folder component of the compound key is constant across them and
discriminates nothing. **The compound key can never remove a conservative
refusal from a per-student-folder zip.**

Measured over A41's published generator, re-implemented from its spec (script
published in full in the appendix; `folder-resubmit` is the shape the 14.5% comes
from):

```
shape                 sets   harm         A41 refusals   CONSERVATIVE refusals
flat                 19932   11360->11360  11360->11360   0(0.0%)   -> 0(0.0%)
folder               20000   12177->0      12177->0       0(0.0%)   -> 0(0.0%)
folder-resubmit      19968    9275->0      12190->5008    2915(14.6%) -> 5008(25.1%)
```

My re-implementation reproduces A41's own published baseline to within 1% on every
column it shares (A41 1.5: flat 19938 sets / 11472 harm; folder 20000 / 12304;
folder-resubmit 19975 / 9209 harm / 12110 refuse / **2901 = 14.5%** conservative;
`folder-distinct-stems` 0 of 20000, which mine also gives as 0 of 20000). So the
instrument is calibrated against the number it is being used to move.

**The result: 14.6% -> 25.1%. The conservative refusal count rises from 2915 to
5008 - up 72%.** The mechanism removes all 9275 harmful sets (that is the real and
substantial win) and leaves every no-harm refusal standing, so after A44 **100% of
the remaining refusals on that shape are false ones.** The instructor is wrongly
blocked strictly more often, not less.

**Reading B - foldered files genuinely stop "reaching the leaf-stem fallback", so
A41's predicate no longer counts them (what 2.2's sentence literally asserts).**
Then A41's refusal goes dead on every foldered file, including the shape 2.3 row 9
explicitly hands back to it. Measured on a shared-wrapper-folder shape (one
`Submissions/` folder, distinct owners, generic filenames):

```
shared-wrapper-folder  19932 sets   harm 11360->11360   refuse 11360->11360
                       harm sets NOT refused under reading B: 11360  (57.0%)
```

11,360 sets carrying real cross-student harm would be neither fixed by A44 nor
refused by A41 - the exact silent blended grade A41 exists to prevent, on 57% of
that shape.

**So 2.2 and 2.3 row 9 cannot both hold.** This is `traps-spec.md`'s named class
("a design can state a constraint in bold and then violate it in a later section,
and nobody notices because both halves read as correct") applied to an inherited
predicate rather than to a data structure.

Disposition: **not fixable by a revision of this scope.** Either the row's pass
condition is wrong (A44 buys correctness, not a lower refusal rate) or the
mechanism must also change A41's decision predicate - and A41's decision leaf is
in neither wave's write set, and A41's frozen oracle pins F6 as REFUSE
(`docs/a41-test-notes.md:213`). That is a scope-and-cost question. **Owner
decision** - see the terminating question at the end.

---

### B2. Wave 1 cannot pass the gate the scope itself requires of it, Wave 1 landing alone ships the data loss section 3.3 proves, and Wave 2's write set is Wave 1's file.

Class: **a wave declared independently landable that ships the hazard the same
document proves, with a write set that is named by description rather than by
path.** NEW.

Citations: `docs/a44-scope.md:624-646` (Wave 1), `:647-673` (Wave 2), `:674-685`
(sequencing note, "Wave 1 has value independent of A41"), against `:393-411`
(3.3's executed data loss).

Three linked defects:

**(a) Wave 1's own "Must include" makes Wave 1 red.** Wave 1's write set is
`utils.ts` plus `utils.test.ts`, and it must include the repaired
`utils.test.ts:360-375` guard "with the ADDED display-uniqueness assertion this
document's section 3.4 requires, exercised against a row-4-shaped fixture". Wave 1
changes the KEY only; the display is explicitly Wave 2's. Executed, the row-4
fixture after Wave 1 alone:

```
ROWS after=3  keys=[alvarezmaria::essay, browntom::essay, chenli::essay]
              displays=[essay, essay, essay]
```

`expect(new Set(students).size).toBe(students.length)` is 1 against 3. **Wave 1's
required test fails on Wave 1's required implementation.** The only ways an
implementer resolves that are to omit the fixture (leaving the guard as the
tautology A41 spent a round diagnosing) or to pull the display change into Wave 1
(which is Wave 2's scope). Both are silent.

**(b) Wave 1 landing alone ships the proven data loss.** The scope's sequencing
note says Wave 1 "has value independent of A41" and section 7 says each wave is
"independently landable". Wave 1 alone is precisely section 3.3's state: distinct
keys, colliding displays, `seedEdits` collapsing three students into one slot. The
document proves the hazard and then authorises shipping it.

**(c) Wave 2 has no file of its own.** Wave 2's write set is "wherever
`groupSubmissionsByStudent`'s row output is turned into the `student` field ...
concretely, the file that CALLS Wave 1's new export chain and constructs each
row's `student` display". Measured: the only place a row's `student` field is
constructed is `utils.ts:344` (`student: entry.student`), inside
`groupSubmissionsByStudent` itself - Wave 1's file. Full census:
`grep -rn "groupSubmissionsByStudent" src/ | grep -v "\.test\."` returns two
production call sites, `extraction.ts:138` and `engine.ts:432` (canary: the same
command with `grep -c "\.test\."` returns 46), and neither constructs a display.
Further, 3.4's rule ("fold the folder in **only when 2+ rows in the same grouping
call would otherwise share a display**") is set-level and cannot be evaluated
inside `parseSubmissionFileName`, which sees one path. **So the display change
must live in `utils.ts` too, and the two waves are not disjoint.** No path is
named for Wave 2 anywhere in the document.

Disposition: **fixable in the one revision** for (c) - name the path - but (a) and
(b) require the key and display changes to be ONE wave, which changes the wave
count and the "independently landable" claim. The wave plan must not be dispatched
as written.

---

### B3. The false-split risk is disposed of as a residual whose own step precedes the wave it gates, and it is far larger than the scope's single constructed example suggests: 97.6% of that shape splits, and 55.1% splits SILENTLY with no refusal.

Class: **a precondition recorded as a residual.** NEW.

Citations: `docs/a44-scope.md:304-340` (2.4, the constructed counter-example) and
`:742` (RES-A44-4), whose Step is "**Before Wave 1's implementation**, ideally
inside the test-author's own notes" while its Object says it "FAILS as a residual
if Wave 1 ships without this number ever being measured". A requirement that must
be satisfied before a wave may run is a precondition on that wave, not a residual;
`iteration-caps.md` reserves (c) Residual for "a requirement knowingly not proven
now", measured at a LATER step.

The scope's finding itself is correct and is its best work. It is also
under-measured. I built the shape RES-A44-4 asks for and ran it
(`single-student-multi-folder-shared-filename`: one declared student, files in
component folders, repeated filename):

```
single-student-multi-folder-shared-filename  19858 sets
  ground-truth harm 0->0
  A41 refusals 19858 -> 8912
  false-split sets 19382 (97.6%)
  split AND NOT refused (silently wrong rows) 10946 (55.1%)
```

And on the two constructed instances:

```
### NEW 2.4 false split: one student, backend/ + frontend/, same filename
  ROWS today=1 [config]   ROWS after=2 keys=[backend::config, frontend::config]
  displays=[config, config]        A41-REFUSE today=true  after-A44=false
### NEW 2.4b same project under a wrapper folder
  ROWS today=1 [config]   ROWS after=2 keys=[backend::config, frontend::config]
```

Three things the scope does not say. First, the split rate on its own shape is not
marginal, it is near-total. Second, **today's behaviour on this shape is a
CORRECT merge and post-A41 it is a REFUSAL; after A44 more than half of these
become silently wrong multi-row output with no refusal to catch them** - a strict
downgrade from "wrong but refused" to "wrong and accepted". Third, the two
resulting rows both display `config`, so section 3's hazard fires on them too
(under fork branch (2) the instructor sees two students named `backend` and
`frontend`).

Disposition: **owner decision or measure-before-wave-1.** Either the number is
produced before Wave 1 is dispatched (in which case it is a precondition and
RES-A44-4 must be re-labelled), or the owner accepts an unquantified regression -
which is exactly the shape A41's withdrawn 53.9% figure was faulted for.

---

### B4. The rescoped edits requirement drops the case that actually bites: an UNTOUCHED row loses its saved edit because the display is a function of the whole batch. And the cited fallback policy does not say what the scope says it says.

Class: **a requirement whose object is not determinable from the object it
names**, so the instrument can pass while the defect ships. NEW.

Citations: `docs/a44-scope.md:501-503` (5.2, "No saved edit for a row whose
DISPLAY STRING IS UNCHANGED by this change is orphaned"), `:505-512` (the policy
citation), `:543-560` (5.4's instrument), against the row's own requirement at
`docs/BACKLOG.md:117` ("zero saved instructor edits may be orphaned - proven by
an assertion that executes the display-string keying in the grading-results
helpers").

**(a) The narrowing drops a case, executed.** 3.4's recommended default makes a
row's display depend on WHETHER ANOTHER ROW WOULD SHARE IT. So a row that A44's
mechanism does not touch can still have its display changed - by a sibling
appearing. Run against the REAL `loadPersistedEdits`:

```
=== D) set-dependent display. Row UNCHANGED, but a second file joins the zip ===
  run 1: AlvarezMaria/essay.txt alone -> display "essay" (unique, not disambiguated)
         instructor saves total=9.5, strengths="INSTRUCTOR EDIT ON MARIA"
  run 2: instructor re-uploads with BrownTom/essay.txt added
         -> 2 rows would share "essay", so BOTH are disambiguated
  keys = ["essay (AlvarezMaria)","essay (BrownTom)"]
  Maria's saved edit survived ? false
```

Maria's row was never wrongly blended, was never "a fiction", and her edit is
gone. 5.4's instrument cannot catch this: it seeds an edit under the old display
and asserts it survives when the display is the SAME, which is true by
construction of `loadPersistedEdits`. **Whether a display is "unchanged" is not a
property of the row, so the requirement's object is not identifiable and the
requirement is passable while the real orphaning case is untested.**

**(b) The cited policy does not authorise this.** `gradingResultsHelpers.ts:613-618`,
quoted in full and with its scope stated (which is what `traps-spec.md`'s
2026-09-27 rule requires and the scope does not do):

> "Iterates the seeded (current-run) students, not the stored blob's own keys, so
> a student **who is not in the current run** - a stale entry from a previous
> assignment's run under the same key, or a roster change - is silently dropped
> rather than resurrected as a phantom row (A3 item 13)."

Its two named cases are a student absent from the run and a roster change; its
stated purpose is preventing a PHANTOM ROW. Under A44 the student IS in the run,
with the same file, the same content and the same grade - only the key moved. The
comment describes the mechanism that would drop the edit; it does not state a
policy that dropping an edit for a present student is acceptable. **This is a
mechanism match presented as a policy endorsement.** The narrowing for the
genuinely-blended row (5.1) is legitimate and I am not disputing it; the
narrowing for case (a) is a dropped case.

Disposition: **fixable in the one revision** - restate the requirement's object
as "a row whose identity key is unchanged", which IS a property of the row, and
make the instrument seed under the old display and assert recovery under the new
one for that population. That is a migration, not an orphaning, and it is what
the row asked for.

---

### B5. Section 2.3's Shape-5 verdict is frozen over a class whose instances were never constructed, and one of them collapses THREE students into one row that neither A41 nor A44 catches.

Class: **an enumeration presented as the set - an instrument that provably cannot
see the counter-example.**
**REPEAT-OF-A41-M3** (`docs/a41-check.md:367`). Same corrective rule: derive the
set with an instrument that can see the counter-example, and report what the list
missed. `traps-spec.md` states it as "the orchestrator's enumeration is a FLOOR,
never the set", and `iteration-caps.md` entry gate 3's spirit applies to a table
declared frozen.

Citation: `docs/a44-scope.md:290` (2.3 row 5): "Real nested `.zip` crossing | no
(`zipParents` populated) | untouched - steps 1-3 own this | unchanged | **out of
this rule's reach by construction**", plus 2.2's gate "when one exists and the
file has no populated `zipParents` entry". Row 5's constructed instance is a
per-student zip. The verdict generalises to every `zipParents`-populated file, and
RES-A44-1 tells the architect the table is RED on any row's verdict changing.

The generalisation is false. A wrapper zip containing per-student FOLDERS is
`zipParents`-populated AND folder-bearing, and it is arguably the commonest real
shape (a Canvas bulk download re-zipped, or a zip of a zip). Executed:

```
### GAP-A nested bulk.zip containing per-student FOLDERS
  bulk.zip/AlvarezMaria/essay.txt  zipParents=["bulk.zip"] reachesFallback=false folded=false todayKey="bulk"
  bulk.zip/BrownTom/essay.txt      zipParents=["bulk.zip"] reachesFallback=false folded=false todayKey="bulk"
  bulk.zip/ChenLi/essay.txt        zipParents=["bulk.zip"] reachesFallback=false folded=false todayKey="bulk"
  ROWS today=1 [bulk]   ROWS after=1 keys=[bulk]
  A41-REFUSE today=false   A41-REFUSE after-A44=false

### GAP-B nested bulk.zip, per-student folders, DISTINCT stems
  bulk.zip/AlvarezMaria/aessay.txt  todayKey="bulk"
  bulk.zip/BrownTom/bessay.txt      todayKey="bulk"
  ROWS today=1 [bulk]   ROWS after=1 keys=[bulk]
  A41-REFUSE today=false   A41-REFUSE after-A44=false
```

Every student lands on `utils.ts:245`'s innermost-crossing stem, `"bulk"`. Three
students, one row, one grade, and A41 does not refuse it because its
discriminator requires an empty `zipChain`. GAP-B is worse: it is the shape A41
proved is *never* refused (`folder-distinct-stems`, 0 of 20,000) turning into a
silent 2-into-1 collapse the moment it is wrapped in a zip.

**The gate that creates the gap is A44's own** - the folder segment is orthogonal
to the zip chain, and folding it would fix GAP-A and GAP-B for free. The scope's
"no populated `zipParents` entry" condition is asserted with no justification
beyond "steps 1-3 own this", and steps 1-3 do not own the FOLDER.

Disposition: **fixable in the one revision** - drop the `zipParents` gate (fold
the immediate folder segment whenever the file falls through to a stem fallback,
step 5 or step 6) and re-freeze 2.3 with these two rows in it. But this widens
what A44 changes, so it may instead be an owner call about scope.

---

## MAJORS

### M1. "Six places" is a floor presented as a measured set. There are 30 non-comment display-keyed sites in three files, and the list drops the two that A41's own test-notes named.

**REPEAT-OF-A41-M3** (same class as B5).

Citation: `docs/a44-scope.md:373` ("Six places this repo already assumes displays
are unique across one run - **measured, not inferred**"). All six addresses are
correct - I opened every one. The set is not.

```
$ grep -rnE "\[(result|r|entry)\.student\]|\[student\]|\[expandedBox\.student\]|\[codeOutputStudent\]|\.student === |=== codeOutputStudent" src \
    --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -vE ":[0-9]+: *(//|\*|/\*)" | wc -l
34
$ ... | cut -d: -f1 | sort | uniq -c
  24 src/app/components/GradingResults.tsx
   4 src/app/components/grading-results/gradingResultsHelpers.ts
   2 src/app/components/grading-results/ungradedDisclosure.ts
   (4 more in unrelated files: courses.row.ts, message-reply-prompt.ts,
    offline-identity.ts, message-serialization.ts - different `student`)
CANARY, same pattern without the non-test filter: 3 further matches in *.test.ts
```

**30 sites in the three grading-results files, against six.** Two of the omissions
are named explicitly by A41's own test-notes (`docs/a41-test-notes.md:877-880`:
"`:287` seeds `seeded[result.student]`, **`:503` reads `edits[result.student]`,
`:632` merges `merged[student]`**") - so this is an inherited requirement dropped
without a disposition entry. The omissions also change the risk picture:
`GradingResults.tsx:332-395` keys `refusals[r.student]`, `postStatus[r.student]`
and `fanout[r.student]` on the display string on the **post-to-Canvas** path, and
`:334` filters `postableResults` by it. That is grades reaching real students, not
a React reconciliation nicety. Fixable in the revision: re-derive with an
instrument and report the delta.

### M2. ORCHESTRATOR RULING: this scope again carries the wave plan and the oracle requirements, authored by `loop-seat`, reversing A41's Ruling 70 with no recorded ruling - and the reversal's cost is measured in B2.

**REPEAT-OF-A41-M6** (`docs/a41-check.md:439`).

Citation: `docs/a44-scope.md:607-623`: "`docs/DEV_LOOP.md` assigns oracle
construction to `loop-test-author` and wave sequencing to `loop-plan` (both
Opus-tier ...). **This document was explicitly briefed to include both here, in
one file, unlike A41 which relocated them under Ruling 70.**"

`DEV_LOOP.md:48` and `:50` elevate `loop-plan` and `loop-test-author`, and
`:54-61` gives the reason: a wrong wave order or a weak instrument "does not fail
loudly, it passes". A41's round-1 check ruled this exact arrangement out and the
orchestrator relocated under Ruling 70. A44 reverses that, and the artifact itself
is the only record of the reversal - no ruling is cited, and the seat correctly
flagged that it was told to.

**B2 is precisely the failure the elevation exists to prevent**: a wave order in
which wave 1's own required test cannot pass, a non-disjoint write set, and a wave
2 with no path. This is a ruling, not a seat defect - no revision of the scope
changes who authored it. Disposition: **orchestrator ruling.** Either relocate the
wave plan to `loop-plan` and the oracle requirements to `loop-test-author` as
their own artifacts with their own rounds, or keep them and record the ruling that
reverses Ruling 70, with the reason.

### M3. `GradingResults.tsx` is never measured, the table promises the measurement at a section that does not exist, and the file holding 24 of the 30 keyed sites gets no line budget while sitting 94 lines from the ceiling.

Class: **a file granted no line budget against a cap it is near.** NEW.

Citation: `docs/a44-scope.md:87`: "| `src/app/components/GradingResults.tsx` |
not yet cited by A41; measured here: **see 4.1** | - |". There is no section 4.1.
`grep -n "^#\+ 4" docs/a44-scope.md` returns one line, `:456`, "## 4. The
tautology guard", and `grep -n "906" docs/a44-scope.md` exits 1 - the count
appears nowhere.

Measured: `@(Get-Content src\app\components\GradingResults.tsx).Count` = **906**,
`wc -l` = 906. That is 94 lines of headroom under
`file-size-ceiling.structure.test.ts:41`'s `LIMIT = 1000`. Wave 2's
"Line-ceiling check, required before this wave, not assumed" (`:668-673`) names
`grading.ts` at 941 and `GradingTab.tsx` at 566 and **omits the one file section
3 says holds five of the six hazards** - and which is in no wave's write set at
all, although B4/M1 show the display change has consequences in it. Fixable in
the revision.

### M4. The reachability census cites a command that cannot have produced the result shown, and omits two real `gradeAction` callers.

**REPEAT-OF-A41-M3.**

Citation: `docs/a44-scope.md:591`: "| The three exposed `gradeAction` callers |
`page.tsx:63` (attended), `steps.grading-cartridge.ts:108` ..., `steps.grading-run.ts:549`
... | re-grepped fresh this pass: `grep -rn "gradeAction(" src/ | grep -v "\.test\."`
returns **the identical five lines** A41's check found".

Run verbatim, it returns five lines, and they are not those:

```
src/app/actions/grading.ts:707                      (the DEFINITION, not a caller)
src/lib/workflows/registry/steps.grading-cartridge.ts:108
src/lib/workflows/registry/steps.grading-draft-flow.ts:271
src/lib/workflows/registry/steps.grading-run.ts:481
src/lib/workflows/registry/steps.grading-run.ts:549
```

`page.tsx:63` is real (`useActionState(gradeAction, initialState)`) but it does
NOT contain `gradeAction(`, so the named instrument provably cannot see it -
`grep -rn "gradeAction" src/ | grep -v "\.test\."` is the command that does, and
it returns 16 lines. Two call sites the scope never names,
`steps.grading-run.ts:481` and `steps.grading-draft-flow.ts:271`, are absent from
the table entirely. **The conclusion survives** - A44's reach is a strict subset
of A41's, because
`grep -rn "groupSubmissionsByStudent" src/ | grep -v "\.test\."` gives exactly
two production call sites (`extraction.ts:138`, `engine.ts:432`) and A44
introduces none - but it survives by an instrument that cannot see its own
counter-example. Fixable.

### M5. Three of the six residuals fail `iteration-caps.md`'s own definition, which makes them deletions by that card's rule.

Class: **a residual without an instrument, a direction of failure, or a step.**
**REPEAT-OF-A41-M5** (`docs/a41-check.md:414`) - same corrective rule: every
residual carries owner + instrument + step or it is a deletion, and it is called
that.

- **RES-A44-3** (`:740`): Instrument is "the fork text itself, section 3.4" - a
  paragraph is not an instrument - and the direction of failure is "**Not a
  pass/fail** - a product/UX choice". No direction of failure means nothing can
  fire.
- **RES-A44-5** (`:744`): Instrument is "this document's section 5.1-5.2". A
  document is not an instrument; `iteration-caps.md` calls discharging an
  obligation by citing a document its own named defect class.
- **RES-A44-6** (`:745`): Instrument "**none available in this environment**",
  Step "**Never**, unless the owner has access to real upload logs outside this
  checkout". An instrument of "none" and a step of "never" is the definition of a
  deletion; it should be recorded as an owner-only backlog escalation, not a
  residual with a tripwire that cannot fire.

RES-A44-1, -2 and -4 are well-formed as entries (though -4's severity is B3).
Fixable in the revision.

---

## MINORS

- **m1. RES-A44-1's pass condition ranges over nine rows of a ten-row table.**
  `sed -n '283,302p' docs/a44-scope.md | grep -c "^| "` returns 11, which is the
  header plus **10 data rows**; `:735` says "all **nine** rows of 2.3's table".
  One frozen verdict falls outside the residual's own range. Entry-gate class.
- **m2. The compound key's separator is never named**, only "`folderSegment +
  separator + existingFallbackKey`" (`:238`). `leafStemFallback` (`utils.ts:121-126`)
  returns the whole stem when it does not start with an alphanumeric - A41's own
  13-path table records `"_draft one.docx" -> key="_draft one"` - so keys can
  contain arbitrary characters, and no printable separator is injective against
  both components. The sound fix is the construction rather than the assertion:
  a tuple key, or a length-prefixed join, makes the collision unrepresentable.
  `traps-spec.md` already prefers that shape.
- **m3. The leverage claim cites a path that does not exist.** `:690` cites
  "`docs/grade/engine.ts:113-134`"; `ls docs/grade/engine.ts` exits 2. The
  intended file is `src/lib/grade/engine.ts`, whose `:113-134` is the
  `GradeResult` assembly, which is a plausible referent for the SCALE argument.
  Also worth the architect's eye: `leverage.md:20-26`'s earned-versus-inherited
  test - the typed pre-model grouping key already exists, so what A44 earns is
  its accuracy, not the class.
- **m4. Section 2.4 contains an unresolved self-correction in the prose**:
  "DISTINCT, because both the folder AND (unusually) the stem happen to differ
  too... no: the STEMS are the SAME". The finding is right; the sentence is a
  draft artifact in the paragraph an architect will read most carefully.
- **m5. A claim in Wave 1 is contradicted by Wave 1's own gated file.** `:630-633`
  says a "Read 260-320" spot check "found none of them reach the new step".
  `utils.test.ts:366` is `"src/otherfile.py"` - a foldered file that falls through
  to step 6, so its key changes from `otherfile` to `src::otherfile`. It happens
  not to break its assertion (that `it` asserts only uniqueness), and
  `utils.test.ts:128-136`'s two `"src/main.py"` pins survive because they assert
  `studentDisplay`, not the key. The claim is wrong; the conclusion happens to
  hold. Say which.

---

## WHAT IS DISPATCHABLE AS IT STANDS

- **Section 0, 0.1, 0.2 and section 1** - the instrument, the file sizes and the
  re-verified A41 facts. Reproduced independently, with a stronger method.
- **Section 2.1** - the unsoundness proof for "any folder is identity". This is
  the finding the row's approach turns on and it holds. An architect can build on
  it today.
- **Section 2.5** - F1's structural unreachability. Verified structural.
- **Sections 3.1-3.3** - the display hazard and its executed proof. Reproduced
  against the real `seedEdits`. **The hazard census in 3.2 must be re-derived
  (M1) before anything is scoped against it**, but the hazard itself is real.
- **Section 4** - the tautology-guard ruling, subject to B2(a): the guard can only
  be exercised for a real reason in the wave that changes the display.
- **Section 6.1** - the reachability trace's conclusion, with M4's citations
  repaired.
- **The fork (3.4 / 9)** - well-formed and terminating as written.

## WHAT MUST NOT BE DISPATCHED

- **Section 7's wave plan**, in any form, until B2 is settled - wave 1's required
  test cannot pass its required implementation, and wave 2 has no path.
- **Section 2.2's mechanism as the thing that discharges the row's pass
  condition** (B1). It is a good mechanism for removing cross-student harm and it
  is the wrong mechanism for removing conservative refusals.
- **Section 2.3 as a FROZEN table** (B5) - row 5's verdict is wrong for a real,
  common shape, and RES-A44-1 would hand that error to the architect as a
  tripwire.
- **Section 5.2/5.4's requirement as the discharge of the row's no-orphaned-edits
  clause** (B4).

## THE SILENT-GREEN FAILURE, named explicitly

Built exactly as specified, A44 passes lint, `tsc`, the `Compiled successfully`
line, all 1111 test files and every structure test, and still:

1. ships the row's headline fix while **raising** the false-refusal count it was
   filed to lower (B1) - nothing in the suite measures a refusal rate, so no gate
   can notice;
2. loses two of three students' seeded instructor feedback if Wave 1 lands alone
   (B2), because the one assertion that would catch it is the assertion Wave 1
   cannot make pass, so the likely resolution is to omit it;
3. silently splits one student's multi-folder project into several graded rows on
   55.1% of that shape (B3), with no fixture anywhere covering it;
4. continues to blend three students into one row for any zip-wrapped
   per-student-folder upload (B5), which no current or planned instrument looks at;
5. orphans a saved edit for a row nothing about A44 changed (B4), while 5.4's
   instrument goes green.

Every one of those is invisible to this repo's gates, and points 2 and 4 are
invisible for the additional reason that **no component is rendered by any test
here** - `vitest.config.ts` is `environment: "node"` with
`include: ["src/**/*.test.ts"]`. Section 6.2 and RES-A44-2 correctly label the
render question as a reading claim and owner verification; I found **no place
where the scope credits a rendering claim as tested.** That discipline is clean.

## THE FEATURE-ALREADY-EXISTS CASE, argued at its strongest

It does not hold, and I checked it rather than assuming. The strongest version is:
`utils.ts:216-226` and `:243-251` already read an ANCESTOR (the zip-crossing
chain) as an identity signal, so "read the container as identity" exists and A44
is only widening its input from zip entries to folder entries. That is true as far
as it goes, and it is why B5's fix is cheap. But it is not the feature: the
crossing chain is populated only by `extraction.ts:74` on a real `.zip` entry
(`if (zipChain.length > 0)` at `:95`/`:106`), and `extraction.ts:43-46` states in
its own comment that a folder gets no entry at all. `extraction.test.ts:189-190`
is an already-landed, already-green test asserting exactly that. So the capability
is genuinely absent for folders, not present-but-unreachable.

## SEQUENCING: does either order break the other

A41 is doc-only (`grep -rln "resolve to the same student" src/` exits 1, canary
green). Three facts follow, and the scope's sequencing note (`:674-685`) has two
of them:

- **A44 first, A41 second: the refusal is still needed**, for the two shapes 2.3
  marks UNFIXED plus GAP-A/GAP-B from B5. On my sweep, after A44 the
  `shared-wrapper-folder` shape still carries 11,360 harmful sets of 19,932, all
  of which only a refusal catches.
- **A44 first changes what A41's decision should be.** A41's frozen oracle pins
  F6 REFUSE (`docs/a41-test-notes.md:213`). If A44 lands first and the owner
  wants the 14.5% to fall, A41's predicate must become folder-aware and F6 must be
  re-frozen as ALLOW. **The scope claims the opposite** - that A41's decision logic
  does not change (B1) - and that claim is what makes the two orders look
  interchangeable when they are not.
- **A41 first, A44 second: A44 must edit A41's landed decision leaf**, which is in
  neither A44 wave's write set. Either order, a wave writing the decision leaf is
  required and is unplanned.

---

## STOPPING POINT

**Rulings and design, in that order. Not measurement.**

The measurement is done and it is not ambiguous: the mechanism this scope
specifies removes essentially all cross-student harm from folder-shaped zips
(12,177 of 12,177 sets on the `folder` shape, 9,275 of 9,275 on
`folder-resubmit`) and **cannot** lower the conservative refusal rate the row was
filed to lower, raising it from 14.6% to 25.1% instead. No further round of prose
changes that number, and no revision of this scope can decide whether the row's
stated purpose or the row's chosen mechanism is the thing that gives way.

- **Rulings:** M2 (the Ruling-70 reversal, unrecorded, whose cost is B2), and
  whether A44 may write A41's decision predicate.
- **Design:** B2 (waves), B4 (the requirement's object), B5 (the `zipParents`
  gate), M1 (the census), M3 (the unbudgeted file). All fixable in one revision if
  the two rulings land first.
- **Measurement:** nothing outstanding. B3's number is produced above; what
  remains is a decision about it.

---

## THE QUESTION FOR THE OWNER

Worded so that every answer ends the activity. This is not a stop and nothing
waits on it.

> **A44 was filed to make a false refusal rate fall. Measured against A41's own
> published generator, the mechanism A44's scope specifies cannot make it fall -
> it makes it rise, from 14.6% to 25.1% of sets, because a false refusal is
> always a collision INSIDE one student's own folder and the folder cannot
> discriminate a folder from itself. What the mechanism does do is remove the
> real harm completely: 12,177 of 12,177 cross-student blended sets on the folder
> shape, 9,275 of 9,275 on the resubmit shape, become correct.**
>
> Pick ONE. Each ends this activity; the scope ships as it stands with the answer
> applied and everything else recorded as a residual.
>
> **(1) KEEP THE MECHANISM, RESTATE THE ROW'S PURPOSE.** A44 buys correctness,
> not a lower refusal rate. The row's pass condition becomes "zero cross-student
> blended rows on the folder shape", the 14.5% is recorded as permanent and
> A41-owned, and A44's scope ships with B2/B4/B5/M1/M3 fixed in one revision.
> Cost of being wrong: instructors keep hitting a refusal on well-organised zips
> more often than before, and the row that was supposed to fix that is closed.
>
> **(2) WIDEN A44 TO OWN A41's DECISION.** A44 also makes the refusal
> folder-aware - do not refuse when every colliding file shares one folder
> segment - which takes the 14.5% to near zero and re-freezes A41's fixture F6
> from REFUSE to ALLOW. This adds a wave writing A41's decision leaf, and it
> re-opens A41's frozen oracle, which is why it is your call and not mine. Cost
> of being wrong: A41's refusal gets a second owner and its oracle a second
> author.
>
> **(3) SPLIT: SHIP THE CORRECTNESS HALF NOW, FILE THE REFUSAL HALF.** Answer
> (1) for A44, and a new row for the folder-aware refusal, sequenced after A41
> lands. Cost of being wrong: one more row, and the 14.5% stays until it is
> worked.
>
> **My recommendation: (2).** The 14.5% is the only reason this row exists
> (`docs/BACKLOG.md:117`: "THE MEASURED REASON THIS ROW EXISTS"), and answer (1)
> closes the row while deleting its reason - the exact shape A41's test author
> warned about when recommending this be filed rather than recorded. The
> folder-aware refusal is a one-predicate change over a decision that **has not
> been implemented yet**, so there is no landed leaf to renegotiate today and the
> cost is at its minimum right now. Cost of being wrong about (2): one extra wave
> and one re-frozen oracle row. Cost of being wrong about (1): the row closes
> green, the instructor's experience gets worse on the exact shape the row named,
> and the next reader has no reason left to look.
>
> A second, smaller decision rides with it and any answer closes it: **B3.**
> One student's project with `backend/config.py` and `frontend/config.py` merges
> correctly today; after A44 it splits into two graded rows on 97.6% of that
> shape, and 55.1% of the time with no refusal to catch it. Accept that
> regression as measured, or require the folder fold to apply only when two or
> more folder segments each contain a file that reaches the stem fallback with a
> DIFFERENT stem as well - I have not measured that variant and am not proposing
> it as free.

---

## APPENDIX: the sweep harness, published in full

Run as `node --experimental-strip-types h4.mts` from a directory holding the
import-only-diffed copies of section 0. `reachesFallback` here omits A41's
`zipChain.length === 0` clause because no path in this generator crosses a zip;
the shape harness (whose output is quoted throughout) does include it.

```ts
import { groupSubmissionsByStudent, parseSubmissionFileName, getBaseFileName } from "./utils.ts";

// ---- A41 test-notes 1.3, published generator, re-implemented from its spec ----
const STUDENTS = ["AlvarezMaria","BrownTom","ChenLi","DavisAnn","EvansJo","FordKim","GarciaLuz","HallSam","IvanovNik","JonesPat","KimDae","LopezAna","MurphyDev","NguyenAn","OkaforChi"];
const STEMS = ["essay","Essay Final","Essay Draft","Homework Final","Homework Draft","homework","reflection","Reflection Final","report","Report Draft","paper","Paper Final","lab","Lab Report","midterm"];
const EXTS = ["docx","txt","pdf","md"];
const COMPONENTS = ["backend","frontend","docs","src","tests","api","web","lib"];

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEP = "::";
function reachesFallback(p: string): boolean {
  return parseSubmissionFileName(p).citationFileName === getBaseFileName(p);
}
function folderSegment(p: string): string | null {
  const segs = p.split("/");
  if (segs.length < 2) return null;
  return segs[segs.length - 2];
}
function todayKey(p: string): string { return parseSubmissionFileName(p).studentKey; }
function compoundKey(p: string): string {
  const base = parseSubmissionFileName(p).studentKey;
  if (!reachesFallback(p)) return base;
  const seg = folderSegment(p);
  if (!seg) return base;
  return seg.toLowerCase() + SEP + base;
}
function groupBy(paths: string[], keyer: (p: string) => string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const p of paths) {
    const k = keyer(p);
    const e = m.get(k); if (!e) m.set(k, [p]); else e.push(p);
  }
  return m;
}
function refuses(paths: string[], keyer: (p: string) => string): boolean {
  const counts = new Map<string, number>();
  for (const p of paths) {
    if (!reachesFallback(p)) continue;
    const k = keyer(p);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.values()].some((n) => n >= 2);
}
function refusesReadingB(paths: string[]): boolean {
  const counts = new Map<string, number>();
  for (const p of paths) {
    if (!reachesFallback(p)) continue;
    if (folderSegment(p)) continue; // folded: no longer reaches the bare fallback
    const k = todayKey(p);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.values()].some((n) => n >= 2);
}
function harm(paths: string[], owner: Map<string, string>, keyer: (p: string) => string): boolean {
  for (const [, group] of groupBy(paths, keyer)) {
    const owners = new Set(group.map((p) => owner.get(p)!));
    if (owners.size > 1) return true;
  }
  return false;
}
// FALSE SPLIT: some declared student's files occupy MORE rows after than before.
function falseSplit(paths: string[], owner: Map<string, string>): boolean {
  const before = groupBy(paths, todayKey), after = groupBy(paths, compoundKey);
  const rowsPer = (m: Map<string, string[]>) => {
    const r = new Map<string, Set<string>>();
    for (const [k, group] of m) for (const p of group) {
      const o = owner.get(p)!;
      if (!r.has(o)) r.set(o, new Set());
      r.get(o)!.add(k);
    }
    return r;
  };
  const b = rowsPer(before), a = rowsPer(after);
  for (const [o, set] of a) if (set.size > (b.get(o)?.size ?? 0)) return true;
  return false;
}

type Shape = "shared-wrapper-folder" | "flat" | "folder" | "convention" | "flat-resubmit" | "folder-resubmit" | "convention-resubmit" | "folder-distinct-stems" | "single-student-multi-folder-shared-filename";
function makePath(shape: Shape, student: string, stem: string, ext: string, i: number, n: number, comp: string): string {
  if (shape === "flat" || shape === "flat-resubmit") return stem + "." + ext;
  if (shape === "folder" || shape === "folder-resubmit") return student + "/" + stem + "." + ext;
  if (shape === "shared-wrapper-folder") return "Submissions/" + stem + "." + ext;
  if (shape === "folder-distinct-stems") return student + "/" + student + "-work." + ext;
  if (shape === "single-student-multi-folder-shared-filename") return comp + "/" + stem + "." + ext;
  const d = (n % 9) + 1;
  return student.toLowerCase() + "_2026-09-0" + d + "_120" + i + "00_" + stem + "." + ext;
}
function run(shape: Shape, sets: number) {
  const rnd = mulberry32(20260927);
  let used = 0, harmBefore = 0, refBefore = 0, harmAfter = 0, refAfter = 0;
  let consBefore = 0, consAfter = 0, unsoundBefore = 0, unsoundAfter = 0, splits = 0;
  let unsoundReadingB = 0, silentWrongSplit = 0;
  for (let s = 0; s < sets; s += 1) {
    const size = 2 + Math.floor(rnd() * 5);
    const owner = new Map<string, string>();
    const paths: string[] = [];
    let prevOwner = "";
    const theStudent = STUDENTS[Math.floor(rnd() * STUDENTS.length)];
    const pool = [...STUDENTS];
    for (let i = 0; i < size; i += 1) {
      const pick = Math.floor(rnd() * pool.length);
      let st = pool[pick];
      pool.splice(pick, 1);
      const stem = STEMS[Math.floor(rnd() * STEMS.length)];
      const ext = EXTS[Math.floor(rnd() * EXTS.length)];
      const comp = COMPONENTS[Math.floor(rnd() * COMPONENTS.length)];
      if (shape.endsWith("-resubmit") && prevOwner && rnd() < 0.5) st = prevOwner;
      if (shape === "single-student-multi-folder-shared-filename") st = theStudent;
      prevOwner = st;
      const p = makePath(shape, st, shape === "single-student-multi-folder-shared-filename" ? "config" : stem, ext, i, s, comp);
      if (owner.has(p)) continue;
      owner.set(p, st); paths.push(p);
    }
    if (paths.length < 2) continue;
    used += 1;
    const hb = harm(paths, owner, todayKey), rb = refuses(paths, todayKey);
    const ha = harm(paths, owner, compoundKey), ra = refuses(paths, compoundKey);
    const rbB = refusesReadingB(paths);
    if (ha && !rbB) unsoundReadingB += 1;
    const split = falseSplit(paths, owner);
    if (split && !ra) silentWrongSplit += 1;
    if (hb) harmBefore += 1; if (rb) refBefore += 1;
    if (ha) harmAfter += 1; if (ra) refAfter += 1;
    if (rb && !hb) consBefore += 1;
    if (ra && !ha) consAfter += 1;
    if (hb && !rb) unsoundBefore += 1;
    if (ha && !ra) unsoundAfter += 1;
    if (split) splits += 1;
  }
  const pct = (n: number) => (used ? ((100 * n) / used).toFixed(1) : "0.0");
  console.log([shape.padEnd(44), String(used).padStart(6),
    ("harm " + harmBefore + "->" + harmAfter).padEnd(20),
    ("refuse " + refBefore + "->" + refAfter).padEnd(24),
    ("conserv " + consBefore + "(" + pct(consBefore) + "%)->" + consAfter + "(" + pct(consAfter) + "%)").padEnd(34),
    ("unsound " + unsoundBefore + "->" + unsoundAfter).padEnd(18),
    ("falseSplit " + splits + "(" + pct(splits) + "%)").padEnd(22),
    ("silentWrongSplit " + silentWrongSplit).padEnd(26),
    "harmUnrefusedUnderReadingB " + unsoundReadingB].join(" "));
}
console.log("shape / sets / harm / A41 refusals / CONSERVATIVE / unsound / false-split   (BEFORE -> AFTER A44)");
for (const sh of ["flat","folder","folder-resubmit","shared-wrapper-folder","single-student-multi-folder-shared-filename"] as Shape[]) run(sh, 20000);
```

Full output, exit 0:

```
flat                                          19932 harm 11360->11360  refuse 11360->11360  conserv 0(0.0%)->0(0.0%)          unsound 0->0  falseSplit 0(0.0%)      silentWrongSplit 0      harmUnrefusedUnderReadingB 0
folder                                        20000 harm 12177->0      refuse 12177->0      conserv 0(0.0%)->0(0.0%)          unsound 0->0  falseSplit 0(0.0%)      silentWrongSplit 0      harmUnrefusedUnderReadingB 0
folder-resubmit                               19968 harm  9275->0      refuse 12190->5008   conserv 2915(14.6%)->5008(25.1%)  unsound 0->0  falseSplit 0(0.0%)      silentWrongSplit 0      harmUnrefusedUnderReadingB 0
shared-wrapper-folder                         19932 harm 11360->11360  refuse 11360->11360  conserv 0(0.0%)->0(0.0%)          unsound 0->0  falseSplit 0(0.0%)      silentWrongSplit 0      harmUnrefusedUnderReadingB 11360
single-student-multi-folder-shared-filename   19858 harm     0->0      refuse 19858->8912   conserv 19858(100.0%)->8912(44.9%) unsound 0->0 falseSplit 19382(97.6%) silentWrongSplit 10946  harmUnrefusedUnderReadingB 0
```

**Calibration, stated rather than assumed.** The rnd() call ORDER inside a set is
not fully published in A41's 1.3, so this is a faithful re-implementation of the
spec, not a bit-for-bit replay, and its absolute counts are its own. Against
A41's published baseline it agrees to within 1% on every shared column (flat
19932/11360 against 19938/11472; folder 20000/12177 against 20000/12304;
folder-resubmit 19968/9275/12190/2915 against 19975/9209/12110/2901;
`folder-distinct-stems` 0 of 20000 in both). Crucially, **B1's conclusion does not
depend on the generator at all** - it is analytic, and it reproduces on A41's two
individually published conservative cases (F6 and 1.5's example set), quoted in B1.

---

## Tree state

Read twice, because the tree moved under this pass. Before this file was written,
immediately after `rm -rf .a44chk`:

```
$ git status --short
 M docs/css-orphans.md
 M src/app/components/ui/modalAdoption.wiring.test.ts
 M src/app/components/ui/modalAdoptionScan.ts
?? src/app/components/ui/modalAdoptionSourceScan.ts
```

And after writing it, the live sibling having committed its three files in
between:

```
$ git status --short
 M docs/css-orphans.md
?? docs/a44-check.md
```

`docs/a44-check.md` is **this pass's only entry, in both readings.** Every other
line is sibling-owned: `docs/css-orphans.md` belongs to another row and was not
touched here; `modalAdoption.wiring.test.ts`, `modalAdoptionScan.ts` and
`modalAdoptionSourceScan.ts` belong to the live sibling named in this pass's own
brief and disappeared between the two readings because that sibling committed
them, not because anything here touched them. **Nothing under `src/` was written
or mutated by this pass.** No `git stash`, `git add -A` or `git checkout --` was
run at any point. The only removal was `rm -rf .a44chk` on the untracked
directory this pass itself created (exit 0, absence confirmed by `ls -d .a44chk`
exiting 2).

Hygiene gates over this write:

```
$ npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
Test Files  2 passed (2) / Tests  21 passed (21)
EXITCODE=0
```

This file's own line count is reported in the handback message, measured after
the last edit, not asserted inside the file measuring itself.
