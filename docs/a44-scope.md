# A44 scope: read per-student folders as a first-class identity signal

Backlog row A44 (`docs/BACKLOG.md:117`, `grep -a "A44" docs/BACKLOG.md`), kind
`feature`, area `one-upload-per-student-grading`. Filed 2026-09-27 under
RULING 69, as the sequel A41's own scope promised to file separately
(`docs/a41-scope.md` section 4.3, "OUT OF SCOPE, FILED SEPARATELY") rather than
building into A41's REFUSE remedy.

**Prior-scope check, run first per the brief:**

```
$ ls docs/a44-*.md
ls: cannot access 'docs/a44-*.md': No such file or directory
LS_EXIT=2
$ git log --oneline -3 -- docs/a44-scope.md
LOG_EXIT=0, no output
```

No prior scope exists. **This is a fresh scope, not a restructuring** - no
disposition table is required or included.

Seat: `loop-seat`. Written 2026-09-27. Write set for this pass is exactly
`docs/a44-scope.md` - `git status --short` at the end of section 13 is the
evidence.

---

## 0. The instrument, stated first so every number below is checkable

**(a) Reading, with `file:line`.** Every citation below was opened fresh this
pass against the current tree with Read/Grep, not inherited from A41's
documents. Where a citation matches an A41 document's own citation exactly,
that is stated as "re-verified, no drift," not assumed.

**(b) Executing the real parser and the real edit-persistence functions.**
Two separate scratchpad harnesses, both run from this session's scratchpad
directory or a throwaway untracked directory inside the repo (deleted before
this document was finalized - `git status --short` in section 13 shows it
gone), never touching a production or test file:

- A **path-shape harness** exercising `extractSubmissions`'s
  `collectFromZip` inner function against seven real zips built with the
  real `jszip` package (the same dependency `src/lib/grade/extraction.ts:1`
  imports, version `3.10.1` per `node -e
  "console.log(require('jszip/package.json').version)"`). The three
  load-bearing lines - the `fullName` construction, the `extension === "zip"`
  recursion guard, and the `zipParents[fullName] = zipChain` write - are
  copied character-for-character from `src/lib/grade/extraction.ts:65-66,
  70-74, 95/106` (quoted directly from the file via `sed -n` immediately
  before writing the copy, not from memory). Text-extraction itself
  (`DOCUMENT_EXTENSIONS`/`TEXT_EXTENSIONS`, real Word-doc parsing) was
  replaced with a trivial "any non-zip extension is supported" stand-in,
  because this harness measures **path shape**, not text extraction - an
  intentional, stated divergence from A41's import-only-diff method, not a
  byte-identical copy. One discrepancy caught and corrected: the harness
  hardcoded `MAX_NESTED_ZIP_DEPTH = 5`; the real constant
  (`src/lib/grade/types.ts:3`) is **3**. This did not affect any result below
  - no tested shape nests more than one zip deep - but the harness value is
    wrong and is named here rather than silently left in a deleted file.
- An **edit-persistence harness** exercising `seedEdits`, `mergeStoredRowEdit`,
  `loadPersistedEdits` and `composeOverallCommentLocal`, hand-transcribed from
  `src/app/components/grading-results/gradingResultsHelpers.ts:81-86,
  280-296, 594-611, 613-633` with type annotations erased (quoted directly via
  `sed -n` immediately before transcribing, then cross-read line-by-line
  against the transcription - not an automated diff the way A41 recorded for
  `utils.ts`, because these functions have no import-only difference to diff;
  the logic itself was retyped by hand and checked by eye against the quoted
  source). This is a materially weaker guarantee than A41's diff method and is
  named as such rather than dressed up as one.

**(c) Line counts.** `@(Get-Content <file>).Count` in PowerShell, cross-checked
with `wc -l` from the Bash tool. Both agreed on every file measured (see the
table below); no `Measure-Object -Line` call was made.

**(d) Exit codes** were read directly from `$?`/`echo $?` immediately after
each command, never through a pipe.

### 0.1 File sizes, both instruments, no drift from A41's own numbers

| File | `@(Get-Content).Count` | `wc -l` |
|---|---|---|
| `src/lib/grade/utils.ts` | 393 | 393 |
| `src/lib/grade/extraction.ts` | 300 | 300 |
| `src/lib/grade/engine.ts` | 517 | 517 |
| `src/app/actions/grading.ts` | 941 | 941 |
| `src/app/components/GradingTab.tsx` | 566 | 566 |
| `src/app/components/GradingResults.tsx` | not yet cited by A41; measured here: see 4.1 | - |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | 728 | 728 |
| `src/app/components/grading-results/FilesCell.tsx` | 103 | 103 |
| `src/lib/grade/utils.test.ts` | 390 | 390 |
| `src/lib/grade/extraction.test.ts` | 271 (A41's own count) - re-measured here: 271 | 271 |
| `src/lib/grade/single-file-entry.ts` | 133 | 133 |
| `src/lib/submission-zip-intake.ts` | 158 | 158 |
| `src/file-size-ceiling.structure.test.ts` | 151 | 151 |

**Every one of these matches A41's own scope/test-notes numbers exactly.**
Nothing in the ingestion or grading-results layer has moved since A41's
documents were written (last A41 commit `d754264`). This matters: it means
every citation below to `utils.ts`, `extraction.ts`, `grading.ts` and
`GradingTab.tsx` carries forward without re-deriving the mechanism, per the
brief's own instruction that the groundwork is already done.

**A44's own commit `git log --oneline --all | grep -i a41` search this pass
confirms A41 has NOT been implemented yet** - only four commits exist for it,
all `docs(a41)`:

```
d754264 docs(a41): revision - the refusal rides a channel that is already alive everywhere
fb64c17 docs(a41): test notes - the bad metric is worse than the check said...
f3aa292 docs(a41): check - the collapse is real, the number measuring it is not...
a4312b4 docs(a41): scope - a worse collapse than the row described...
```

No implementer wave, no decision leaf, no refusal string exists in `src/` yet
(`grep -rln "resolve to the same student" src/` exits 1). **This is a
sequencing fact for section 8, not a blocker for this scope**: A44's own
row-correctness improvement (fewer true collapses) is real independent of
whether A41 has shipped; A44's *measured purpose* as stated in the backlog row
(reducing A41's 14.5% conservative-refusal rate) is only observable once A41's
refusal exists to be reduced.

### 0.2 The measured shape table (harness (b), path-shape)

Executed output, this pass, against real JSZip-built archives:

```
Shape 1: per-student folders (flat)
  AlvarezMaria/essay.txt   zipParents=undefined
  BrownTom/essay.txt       zipParents=undefined
  ChenLi/essay.txt         zipParents=undefined

Shape 2: one top-level wrapper folder, files inside it
  Submissions/essay1.txt   zipParents=undefined
  Submissions/essay2.txt   zipParents=undefined
  Submissions/essay3.txt   zipParents=undefined

Shape 3: wrapper folder containing per-student subfolders
  Submissions/AlvarezMaria/essay.txt   zipParents=undefined
  Submissions/BrownTom/essay.txt       zipParents=undefined

Shape 4: folder named 'submissions' (lowercase, generic), flat files inside
  submissions/essay1.txt   zipParents=undefined
  submissions/essay2.txt   zipParents=undefined

Shape 5: nested per-student .zip crossing (a REAL zip, not a folder)
  AlvarezMaria.zip/essay.txt   zipParents=["AlvarezMaria.zip"]
  BrownTom.zip/essay.txt       zipParents=["BrownTom.zip"]

Shape 6: two folder levels - wrapper > per-student > file
  CS101_Fall_2026/AlvarezMaria/essay.txt   zipParents=undefined
  CS101_Fall_2026/BrownTom/essay.txt       zipParents=undefined

Shape 7: one student folder, two generic files inside (A41's F6)
  AlvarezMaria/Homework Draft.docx   zipParents=undefined
  AlvarezMaria/Homework Final.docx   zipParents=undefined
```

**The single most important fact this table establishes: Shape 1 and Shape 2
are structurally IDENTICAL per file.** Both produce
`"<one-folder-segment>/<filename>"` with `zipParents` undefined. Nothing in
one file's own path distinguishes "this folder names a student" (Shape 1)
from "this folder is a single wrapper shared by everyone" (Shape 2). Shape 4
proves the folder's literal NAME carries no information either -
`"submissions"` (generic, lowercase) produces the identical shape to
`"Submissions"` (Shape 2) and to `"AlvarezMaria"` (Shape 1). **Any identity
rule that decides per-file, using only that file's own path, cannot tell
these apart - this is a structural fact, not a design gap to close.**

---

## 1. Facts already established (A41), re-verified fresh, not re-derived

Each citation below was re-opened this pass, not copied from A41's text.

- **The collapse mechanism.** `getBaseFileName` (`utils.ts:34-38`) strips the
  directory before `matchStudentFileConvention` (`:87-107`) or
  `leafStemFallback` (`:121-126`) ever run. `groupSubmissionsByStudent`
  (`:290-350`) merges at `:315` (`existing.files.push([filePath, content])`)
  with no second identity signal. Confirmed unchanged, same line numbers as
  A41's citations.
- **Folders give zero identity today, and a real test already proves it.**
  `extraction.ts:44` ("a folder inside the single top-level zip has no key
  here at all") and `extraction.ts:95,106` write `zipParents[fullName]` only
  `if (zipChain.length > 0)`, and `zipChain` only grows on a nested `.zip`
  entry (`:74`). The ALREADY-LANDED test
  `extraction.test.ts:167-190` (part of the 59-test green baseline, re-run
  fresh this pass, see section 0) builds a real folder
  (`outer.folder("Homework1")!.file(...)`) and asserts
  `zipParents["Homework1/janedoe_2024-01-01_120000_report.txt"]` is
  `undefined` (`:190`). This is not a reading claim - it is an executing test,
  already in the suite, that this scope's mechanism must not turn red for the
  wrong reason (see section 3).
- **The collapse reproduces byte-identical.** Three students each submitting
  `essay.docx` in their own folder collapse to one row, `student: "essay"`,
  `mergedFileCount: 3`. Re-confirmed via harness (b) this pass - Shape 1 above
  is the exact input; `groupSubmissionsByStudent` (unchanged, `utils.ts`) still
  produces this because both `AlvarezMaria/essay.txt` and `BrownTom/essay.txt`
  strip to the identical fallback key `"essay"`.
- **A folder zip with one file per student is never refused; a folder zip
  with one student's two generic files is refused 14.5% of the time.** Both
  numbers are A41 test-notes' own published, seeded-generator figures
  (`docs/a41-test-notes.md` section 1.5, `folder-distinct-stems`: 0 of 20000;
  `folder-resubmit`: 2901 of 19975). **Not re-run here** - re-running A41's
  generator is A41's own instrument, not A44's; A44 reuses the published
  numbers by citation rather than inventing a second, possibly-divergent run
  of the same generator (the exact trap the brief warns against: "no absolute
  rate is quotable here without publishing its generator inline" - the
  generator is already published at `docs/a41-test-notes.md:174-201`, and
  citing it is the correct discipline, not re-running it under a different
  seed).

---

## 2. The identity rule

### 2.1 Why "any folder is identity" is unsound - measured, not asserted

Section 0.2's shape table proves Shape 1 and Shape 2 are indistinguishable
per-file. A rule that unconditionally promotes "the enclosing folder segment"
to identity would take Shape 2 - three files with three genuinely DIFFERENT
names (`essay1.txt`, `essay2.txt`, `essay3.txt`) that TODAY correctly produce
three rows via the existing per-file stem fallback - and merge them into ONE
row keyed on the shared wrapper folder `"Submissions"`. **That is a NEW false
collapse this row does not have today**, introduced by the very fix meant to
reduce false collapses. Any mechanism must not do this, and no name-based
special case ("skip folders literally named `submissions`") is a sound fix -
Shape 4 proves the literal name carries no signal; the next real zip might
call its wrapper folder `Files`, `Drop`, `Class`, or anything else.

### 2.2 The candidate rule (a candidate mechanism, not a design ruling)

Offered the way A41's test-notes section 4 offered its reference
implementation - "not a design ruling... a reference implementation exists
only to prove the requirements are jointly satisfiable." The architect may
implement this differently; the frozen requirement is the per-shape table in
2.3, not this specific mechanism.

> **Compute each file's identity key exactly as today (steps 1-3 of
> `parseSubmissionFileName` untouched: `byRaw`, the leaf convention match, the
> real zip-crossing chain). Only when a file falls through ALL THREE of those
> - which is exactly the population that reaches `byBase`/the leaf-stem
> fallback today - fold that file's own immediate enclosing folder segment
> (the path component directly before its base name, when one exists and the
> file has no populated `zipParents` entry) into the key as an ADDITIONAL
> discriminator: `key = folderSegment + separator + existingFallbackKey`,
> never `key = folderSegment` alone.**

This is a **compound key**, not a folder-replaces-stem key. The distinction is
the entire fix for 2.1's regression:

- **Shape 2** (essay1/essay2/essay3, one shared wrapper folder): compound
  keys are `("Submissions","essay1")`, `("Submissions","essay2")`,
  `("Submissions","essay3")` - three DISTINCT compound keys, because the
  STEMS already differ. Three rows, unchanged from today. The folder adds
  nothing here and breaks nothing.
- **Shape 1 / row 4's headline** (essay.docx in three different folders):
  compound keys are `("AlvarezMaria","essay")`, `("BrownTom","essay")`,
  `("ChenLi","essay")` - three DISTINCT compound keys, because the FOLDER
  differs even though the stem does not. Three rows - **this is the fix**.
- **Shape 7 / A41's F6** (one folder, two generic files, same student):
  compound keys are `("AlvarezMaria","homework")`,
  `("AlvarezMaria","homework")` - the SAME compound key, because both folder
  AND stem agree. One row - matches today's coincidentally-correct behaviour,
  now correct BY DESIGN instead of by luck (today it merges only because
  `"Homework Final"` and `"Homework Draft"` happen to share the alnum-prefix
  `"homework"`; the compound key confirms the merge independently via the
  shared folder). **This is the case A41's own decision (once built) currently
  refuses 14.5% of the time on this generator's `folder-resubmit` shape - see
  section 0.1's sequencing note - because A41's own fallback-collision leaf
  cannot tell a coincidental stem match from a real identity. Once these files
  resolve via the new step instead of the bare fallback, A41's own decision (a
  literal read of A41 test-notes section 4's reference implementation, "refuse
  iff two or more distinct paths that reach the leaf-stem fallback share a
  studentKey") no longer sees them as reaching the fallback at all - the false
  refusal disappears without A41's decision logic itself changing.**
- **Shape 3 / Shape 6** (nested: wrapper folder containing per-student
  subfolders, one or two levels deep): the file's IMMEDIATE parent is already
  the per-student segment (`AlvarezMaria`, not `Submissions` or
  `CS101_Fall_2026`), because "immediate enclosing folder" means the LAST
  segment before the filename, not the first. Compound keys differ by folder;
  correct rows result with no special-casing for nesting depth.

### 2.3 The per-shape table this rule is frozen against

| Shape | Folder-bearing? | Compound key result | Row count | Verdict |
|---|---|---|---|---|
| 1. Per-student folders, distinct content, same stem | yes | 3 distinct (folder differs) | 3 | **FIXED** (was 1, wrongly merged) |
| 2. One wrapper folder, distinct stems | yes (uniform) | 3 distinct (stem differs) | 3 | unchanged, correct |
| 3. Wrapper > per-student subfolder | yes (2 levels) | 2 distinct (immediate folder differs) | 2 | correct, unaffected by nesting |
| 4. Folder literally named `submissions`, distinct stems | yes | 3 distinct (stem differs) | 3 | unchanged, correct - proves no name-based rule was needed |
| 5. Real nested `.zip` crossing | no (`zipParents` populated) | untouched - steps 1-3 own this | unchanged | out of this rule's reach by construction |
| 6. Two folder levels, per-student at the inner level | yes | 2 distinct (immediate folder differs) | 2 | correct |
| 7. One folder, two generic files, one real student (A41's F6) | yes (uniform) | 1 (folder AND stem agree) | 1 | correct by design, not by stem-coincidence |
| A41's own flat headline (`Homework Final.docx` + `Homework Draft.docx`, no folder at all) | **no** | unchanged - no folder to fold in | 1 (still collapsed) | **UNFIXED, and correctly so** - no identity signal exists in flat data; A41's REFUSE remains the only remedy here |
| Two different students, one shared folder, colliding generic filenames (no per-student subfolder) | yes (uniform) | 1 (folder AND stem agree, but the files are NOT the same student) | 1 (still collapsed) | **UNFIXED, and correctly so** - the folder gives no discriminating signal when it is shared by genuinely different people with colliding names; A41's REFUSE remains the fallback |
| A14 sanitized-name collision (`johnsmith_1001_0_report.docx` + `johnsmith_1002_0_report.docx`, F1 in A41 test-notes) | no | untouched - resolved at step 2 (convention leaf match), never reaches this rule | unchanged, 1 (pinned ALLOW, `utils.test.ts:326-334`) | **explicitly out of scope, see 2.5** |

**Which shapes this rule refuses (via A41's REFUSE, once built): exactly the
two rows above marked UNFIXED.** A44 does not remove A41's refusal and does
not shrink its remit below "no identity signal exists in the data" - it
shrinks the POPULATION that reaches that state, which is the row's own stated
measurable purpose (the 14.5% falling).

### 2.4 A genuinely new risk, found by construction, not assumed away

**Counter-example, constructed to attack the compound-key rule rather than
confirm it:** a single student submits ONE project as a raw zip (no naming
convention, uploaded to the multi-student "Upload ZIP" control by mistake or
by a project structure that happens to have component subfolders), containing
`backend/config.py` and `frontend/config.py`. Compound keys are
`("backend","config")` and `("frontend","config")` - DISTINCT, because both
the folder AND (unusually) the stem happen to differ too... no: the STEMS are
the SAME (`config`) and only the FOLDER differs. Compound key: two distinct
keys, **because the folder differs** - exactly the row-4 mechanism, but here
it is WRONG: this is one student's one project, and it should merge into ONE
row exactly as it does TODAY (today, with no folder awareness, both files
already share stem `"config"` and merge correctly into one row). **The
compound-key rule converts a correctly-merging single-student submission into
a wrongly-split two-row submission whenever a project's own internal folder
names differ while a filename repeats across them.**

This is not hypothetical hand-wringing: it is a real, constructed
counter-example, checked against 2.3's own table to confirm it is a genuinely
NEW failure class (row 4's fix relies on exactly the same folder-differs
signal that causes this regression - they cannot be told apart from the zip's
structure alone, because "per-student folders" and "one student's own
component folders" are the same shape: several folders, each containing
same-or-different-stem files, with no external signal saying which folder
belongs to which real person).

**Disposition: residual, not a blocker to this scope, and not something this
rule can resolve today.** No number exists for how often this shape occurs in
practice, and inventing one would violate the brief's own "no unmeasured
number" rule. See RES-A44-4 (section 10) - owner: whoever writes the
test-author's sweep for this row; instrument: extend A41's own published
generator (`docs/a41-test-notes.md` section 1.3) with a new
`single-student-multi-folder-shared-filename` shape and measure the FALSE
SPLIT rate the same way A41 measured the false REFUSE rate, before this rule
ships unconditionally.

### 2.5 F1 (the A14 convention-branch collision): deliberately NOT closed by A44

`johnsmith_1001_0_report.docx` and `johnsmith_1002_0_report.docx` (two
different students, same sanitized name, different Canvas-style second part)
collapse via the CONVENTION branch (`matchStudentFileConvention`, step 2 of
`parseSubmissionFileName`), not via any folder or fallback signal.
`utils.test.ts:326-334` pins the merge as current, intentional behaviour (the
withdrawn M3 ruling's replacement test). **A44's own mechanism, per 2.2, never
touches step 1 or step 2 - it only applies to files that already fall through
to the fallback population - so F1 is structurally unreachable by this row's
change, not merely unaddressed by choice.**

**Stated limit, as the brief requires:** A44 does not close the A14
sanitized-name collision. It remains a known-open item, tracked wherever A41
and A14 already track it, and is not re-filed here.

---

## 3. The display-string hazard - a hard requirement, not a nicety

### 3.1 Why key uniqueness alone is not enough

Every one of `parseSubmissionFileName`'s six return sites sets
`studentKey = studentDisplay.toLowerCase()` (`utils.ts:116-117, 193-194, 221,
234-235, 247, 256`, re-verified this pass, unchanged addresses). **Key
uniqueness and display uniqueness are the SAME fact today, by construction.**
The compound-key rule in 2.2 breaks this invariant for the first time in this
codebase's history: two rows can now have DIFFERENT keys
(`("AlvarezMaria","essay")` vs `("BrownTom","essay")`) while their naive
DISPLAY strings - if display is computed the way it is today, from the stem
alone - remain the IDENTICAL string `"essay"` for all three of row 4's rows.

### 3.2 Six places this repo already assumes displays are unique across one run - measured, not inferred

Each grep re-run fresh this pass against the current tree:

| Site | What it does with `result.student` | Hazard if 2+ rows share it |
|---|---|---|
| `gradingResultsHelpers.ts:287` (`seedEdits`) | `seeded[result.student] = {...}` inside a loop over `run.results` | **Later rows silently overwrite earlier ones in the same dictionary slot** - proven by execution, see 3.3 |
| `GradingResults.tsx:635` | `<tr key={\`${result.student}-matrix\`}>` | React receives duplicate keys for the table's own row identity - a reconciliation hazard this environment cannot render to confirm (see section 7) |
| `GradingResults.tsx:768` | `<td key={\`${result.student}-${areaName}\`}>` | Same hazard, per rubric-area cell |
| `GradingResults.tsx:838` | `run.results.find((r) => r.student === codeOutputStudent)` | Resolves to the FIRST matching row only - a click on the second or third duplicate-displayed row's "view code output" would show the first row's data |
| `GradingResults.tsx:830-833` (`edits[expandedBox.student]`) | Reads/writes the feedback-box edit state keyed by display string | Two rows share one edit slot in the open feedback-box editor, not just in storage |
| `FilesCell.tsx:41` | `<li key={\`${result.student}-file-name-${file.name}\`}>` | Already found by A41 (M2) for one row's OWN duplicate filenames; the same key shape ALSO collides ACROSS rows once displays collide |

**Every one of these is dead code on the zip path today**, because 3.1
guarantees display uniqueness by construction. A44's own mechanism (2.2) is
the first change in this codebase to make key-uniqueness-without-display-
uniqueness a reachable state. **This is exactly the kind of requirement the
brief demands an executing instrument for, not a residual** - it is a
correctness property of the fix itself, not a separate concern.

### 3.3 Executed proof, against the real functions

Harness (b) from section 0, run this pass (verbatim console output):

```
=== Scenario C (candidate mechanism WITHOUT display disambiguation - the hazard) ===
distinct rows in run.results: 3
distinct keys in seedEdits() output: 1 (all 3 rows silently share ONE dictionary slot)
surviving strengths text: Li's real feedback (only the LAST row's seed survives;
  Maria's and Tom's are gone from the edits map before any instructor even opens the page)
```

This is `seedEdits` (the real function, hand-transcribed per section 0's
caveat) run on a 3-row `GradingRun` whose three `student` fields are all
`"essay"` - exactly what 2.2's fix produces if the DISPLAY string is not
disambiguated alongside the KEY. **The instructor loses two of three
students' seeded feedback before ever opening the page**, from a mechanism
that never runs today (3.1) and is switched on by A44's own change.

### 3.4 The requirement, and a recommended default (not a ruling)

**Requirement: display strings must remain unique across one
`GradingRun.results` array after this change**, provable the same way
`utils.test.ts:373` already (uselessly, today) proves it, and load-bearing for
the first time once this change lands - see section 4.

**Recommended default**, offered to the architect and UX pass as a starting
point, not settled: fold the folder segment into the DISPLAY string **only
when 2+ rows in the same grouping call would otherwise share a display**,
leaving every row whose display is already unique (F6/Shape 7, the whole
convention branch, any already-distinct-stem case) with its display
UNCHANGED. This is also the only choice that satisfies section 5's edit-
migration requirement without redefining what "unchanged" means.

**Fork, worded so every answer ends this activity - not blocking, rides
alongside section 8's dispatch:**

> When the new folder step splits a group that used to display one string
> into several rows, what should each row's display string be?
>
> **(1) Prefix with the folder, only where disambiguation is needed.**
> `"essay (AlvarezMaria)"`, `"essay (BrownTom)"`, `"essay (ChenLi)"`. Keeps the
> assignment-name context; adds length to a table cell used elsewhere for
> sorting and CSV export.
>
> **(2) Use the folder name alone wherever the folder discriminated the
> row.** `"AlvarezMaria"`, `"BrownTom"`, `"ChenLi"`. Shorter, and it is
> usually the actual name/identifier the instructor set up when creating the
> per-student folders, but it drops the assignment-name context that F1-style
> rows (unaffected by this change) still show.
>
> **My recommendation: (1).** It preserves the pre-existing display for every
> row this change does not touch (a strict requirement, section 3.4), and for
> the rows it does touch, it is a strict superset of information rather than
> a replacement - an instructor who is used to seeing "essay" still sees
> "essay" in the string. Cost of being wrong about (1): a slightly longer
> table cell. Cost of being wrong about (2): the same information the
> assignment-name column already had to be reconstructed by the reader when
> it briefly wasn't shown - never a functional loss, since `mergedFileCount`
> and the Files column still show the real filenames underneath.

---

## 4. The tautology guard - what it is worth for A44 specifically

A41's test-notes (section 7) already ruled: **keep** `utils.test.ts:360-375`,
rename its claim to key-to-display injectivity, do not delete it - there is no
other enforcer of that invariant, and `iteration-caps.md`'s disposal (d)
requires naming the enforcer a deletion would remove.

**What A44 adds to that ruling, re-derived independently this pass rather than
inherited:** A41 never changes `groupSubmissionsByStudent`'s output shape at
all (Ruling 69 - identity resolution untouched), so for A41 this guard's
protection was purely LATENT - insurance against a future change, never
exercised by anything A41 itself built. **A44 is that future change.**
Section 3's finding (3.1-3.3) is exactly the failure this guard exists to
catch: a mutation of A44's own candidate mechanism that disambiguates the KEY
(2.2) but forgets to disambiguate the DISPLAY (3.4) is precisely the mutation
that would make `utils.test.ts:373`'s repaired assertion (`new
Set(students).size === students.length`, evaluated over the real
`groupSubmissionsByStudent` output rather than the edits layer) go RED for the
first time in this test file's history for a REAL reason, not a constructed
one.

**This is an ARGUED claim, not an EXECUTED one** (per this-repo.md's
discipline) - no implementation of 2.2 exists yet, so no mutation of it can be
run. It is stated here as the single most important requirement the receiving
test-author's notes must carry forward: **the repaired guard is this
feature's primary regression test, not a pre-existing hygiene assertion it
happens to inherit.**

---

## 5. The saved-edit migration requirement, precisely scoped

### 5.1 The imprecise version, and why it cannot be satisfied

"No saved edit is orphaned" cannot be a universal requirement: A row-4-shape
group was WRONGLY collapsed before this change (one row blending three
students' work into one grade). Any edit an instructor saved against that row
was an edit against a **wrong, blended submission that never should have
existed as one row**. There is no correct migration target for it among the
three new, correctly-separated rows - assigning it to any one of them would
silently hand one student an edit meant for a mixture of three. **Preserving
that specific edit is not possible and should not be attempted.**

### 5.2 The precise requirement

**No saved edit for a row whose DISPLAY STRING IS UNCHANGED by this change is
orphaned.** This is exactly the population section 3.4's recommended default
protects (F6/Shape 7, the convention branch, every already-distinct-stem
case) - every row this change does not touch keeps exactly the storage key it
had before.

**For a row whose display string changes because a previously-wrong collapse
was correctly split, the old edit becoming unreachable is the SAME, ALREADY-
ACCEPTED policy this codebase already implements for any other run-to-run
identity drift** - `gradingResultsHelpers.ts:613-618`'s own comment on
`loadPersistedEdits`: "a student who is not in the current run - a stale
entry from a previous assignment's run under the same key, or a roster
change - is silently dropped rather than resurrected as a phantom row (A3 item
13)." A44 does not need a new migration mechanism for this case; it needs to
not be held to a standard ("never orphan anything") that the codebase has
never held itself to and that is not achievable for a row that used to be
wrong.

### 5.3 Executed proof, against the real functions, both halves

Harness (b), section 0, executed this pass:

```
=== Scenario A (F6 shape, display unchanged) ===
recovered['Homework'].total = 9.5 (expect 9.5, the saved edit)
recovered['Homework'].strengths = INSTRUCTOR EDIT (expect INSTRUCTOR EDIT)

=== Scenario B (row-4 shape, previously-wrong collapse split into 3) ===
recovered['essay (AlvarezMaria)'].total = 8 (seeded from the NEW run's own totalScore - the old '6' edit is NOT here)
recovered['essay (BrownTom)'].total = 7 (seeded from the NEW run's own totalScore - the old '6' edit is NOT here)
recovered['essay (ChenLi)'].total = 9 (seeded from the NEW run's own totalScore - the old '6' edit is NOT here)
Old edit under 'essay' ever appears among the 3 new totals? false
```

Scenario A proves the requirement's POSITIVE half against the real
`loadPersistedEdits`: a row whose display does not change keeps its edit
across a re-run, using the exact production merge logic. Scenario B proves
the requirement's NEGATIVE half is the correct, already-designed-for outcome,
not a defect: the stale edit under the old blended display is absent from
every one of the three new rows, matching `loadPersistedEdits`'s own stated
policy rather than contradicting it.

### 5.4 Requirement statement for the receiving test-author/implementer

- **Object:** `loadPersistedEdits(rawJson, newRun)[display]` for every row
  whose `display` is unchanged by 2.2/3.4's mechanism, against the same row's
  pre-change saved edit.
- **Instrument:** a unit test in (or beside) `gradingResultsHelpers.test.ts`
  (create if absent - `grep -rl "gradingResultsHelpers.test" src/` should be
  re-checked by whoever builds this, not assumed from this document) that
  seeds an edit under the OLD run's display, then calls the REAL
  `loadPersistedEdits` with the NEW run (post-A44) using the SAME display, and
  asserts every edited field survives.
- **Direction of failure:** RED when any row whose display the architect's own
  mechanism does NOT change loses a field of its saved edit. This is the
  concrete, executing form of the requirement - not "no edit is ever
  orphaned," which section 5.1 shows is unsatisfiable and should not be
  written as a requirement anyone can pass.
- **Companion, not a pass/fail gate:** a second test confirming the row-4
  shape's stale edit is ABSENT from every new row, citing
  `gradingResultsHelpers.ts:613-618`'s own comment as the reason this is
  accepted behaviour, not a defect - so a future reader does not "fix" it by
  inventing a phantom-row resurrection.

---

## 6. Reachability - traced fresh, re-verified against the current tree

**Every claim in this section about what an instructor SEES is a READING
CLAIM.** Per `docs/loop/this-repo.md` section 6/2: no component is rendered by
any test in this repo, there is no jsdom, and nothing here was observed on
screen.

### 6.1 From the upload control to the parser

| Hop | Address | Re-verified this pass |
|---|---|---|
| The upload control | `GradingTab.tsx:315-322` (`<input type="file">` plus the one `<p>` naming the requirement) | unchanged from A41's citation, `grep -rn "zip archive" src/app/components/GradingTab.tsx` still returns `:322` and one more line |
| `gradeAction` | `grading.ts:707` | unchanged |
| The Canvas short-circuit | `grading.ts:740` (`if (canvasUrl) { ... }`) | unchanged, re-grepped |
| The single-file branch (never at risk - `buildSingleFileEntry` returns at most one entry) | `grading.ts:892-903` | unchanged, re-grepped this pass at exactly these lines |
| The zip branch, embedded (default-adjacent) | `grading.ts:854` -> `extractStudentEntries` (`extraction.ts:134-139`) -> `groupSubmissionsByStudent` (`extraction.ts:138`, `inferredLookup` hard-coded `undefined`) | unchanged |
| The zip branch, Gemini (**the actual default provider** - `llm-provider.ts:14`) | `grading.ts:905-920` -> `gradeSubmissions` (`engine.ts:432`) -> `groupSubmissionsByStudent`, `inferredLookup` from `inferFileNameConvention` | unchanged |
| The three exposed `gradeAction` callers | `page.tsx:63` (attended), `steps.grading-cartridge.ts:108` (unattended, `HEADLESS_SAFE_STEP_TYPES`), `steps.grading-run.ts:549` (`ALWAYS_INTERACTIVE_STEP_TYPES`) | re-grepped fresh this pass: `grep -rn "gradeAction(" src/ | grep -v "\.test\."` returns the identical five lines A41's check found, with the identical two non-exposed Canvas-only sites |

**A44's own reach is a strict subset of A41's already-traced reach**: A44
touches only `parseSubmissionFileName`'s fallthrough population inside
`groupSubmissionsByStudent`, called from the exact same two call sites A41
already traced (`extraction.ts:138`, `engine.ts:432`). No new call site is
introduced. This is the reachability argument for the PARSER change; the
DISPLAY/UI half of reachability is 6.2 below.

### 6.2 The half this environment cannot verify

- **Whether three newly-separated rows actually render as three distinct,
  independently-editable table rows**, given `GradingResults.tsx:635`'s
  `<tr key={...}>` depends on display uniqueness (section 3). Owner
  verification - RES-A44-2.
- **Whether the recommended display wording (3.4's fork) reads well in the
  actual table**, including column width and CSV export
  (`gradingResultsHelpers.ts`'s `buildCsvContent`, which writes
  `result.student` as the first CSV column - a longer display string changes
  that column's content, not its shape). Owner verification.

---

## 7. Waves with write sets

Each wave is independently landable and gated on `git status --short` against
its own list, plus a check that no `.claude/worktrees` copy was edited
instead of the real tree, per `docs/loop/this-repo.md` section 7. **Note on
seat elevation**: `docs/DEV_LOOP.md` assigns oracle construction to
`loop-test-author` and wave sequencing to `loop-plan` (both Opus-tier,
per the standing rule that a weak instrument or a wrong wave order fails
silently and is caught too late by a checker). This document was explicitly
briefed to include both here, in one file, unlike A41 which relocated them
under Ruling 70. The write sets below are offered as REQUIREMENTS for those
elevated seats to build the frozen oracle and sabotage protocol against - the
per-shape table in 2.3, the display-uniqueness requirement in 3.4, and the
edit-migration requirement in 5.4 are the frozen parts; the exact test file
layout and sabotage members are not written here, matching A41's own
disposition of that boundary.

### Wave 1 - the identity mechanism (parser only)

- **Write set:** `src/lib/grade/utils.ts` (the new fallthrough step,
  inserted per 2.2, gated on an empty `zipParents` entry for the file - never
  touching steps 1-3), plus its test file `src/lib/grade/utils.test.ts` (new
  fixtures for 2.3's table; **must not delete or weaken any of the 28 existing
  pinned tests** - section 2.5 and the "Read 260-320" spot check this pass
  found none of them reach the new step).
- **Must include:** the repaired `utils.test.ts:360-375` guard (section 4) -
  renamed per A41 test-notes section 7, with the ADDED display-uniqueness
  assertion this document's section 3.4 requires, exercised against a row-4-
  shaped fixture (the first fixture in this file's history that can make the
  renamed guard fail for a real reason).
- **Must NOT do:** touch `identityFromConventionMatch`, `matchStudentFileConvention`,
  or the crossing-chain loop (`utils.ts:216-226`) - per 2.5, F1 and the whole
  convention branch are out of scope and any wave that touches them has
  exceeded this row.
- **Gate:** `npm run test:paths -- src/lib/grade/utils.test.ts
  src/lib/grade/extraction.test.ts src/lib/grade/single-file-entry.test.ts
  src/lib/grade/grouping-zip-parents.wiring.test.ts` must stay green (this
  pass's own fresh re-run: 59/59, exit 0, section 0) - a red result here means
  the new step reached a fixture it was never meant to touch.

### Wave 2 - the display and edits layer (the caller side of the fix)

- **Write set:** wherever `groupSubmissionsByStudent`'s row output is turned
  into the `student` field consumed by `GradingResults.tsx` and
  `gradingResultsHelpers.ts` - concretely, the file that CALLS Wave 1's new
  export chain and constructs each row's `student` display (per section 3.4's
  fork answer). Plus `gradingResultsHelpers.ts` itself is NOT touched unless
  the fork's answer requires changing how `seedEdits`/`loadPersistedEdits`
  read `result.student` - under the recommended default (3.4, option 1),
  neither function needs to change: they already key on whatever string
  `result.student` holds, and the fix is entirely upstream of them.
- **Must include:** section 5.4's migration test (a NEW test file, since
  `gradingResultsHelpers.ts`'s existing tests are not this document's write
  set to name without checking - the wave that builds this must re-derive
  where `gradingResultsHelpers.ts`'s own tests live before choosing a file).
- **Must NOT do:** ship without wave 1 - this wave has nothing to consume
  otherwise, and shipping it first would be dead code with the gate green
  (`docs/loop/traps-spec.md`'s "assignment must include the file that CALLS
  the new export," read in the other direction: the caller has nothing to
  call yet).
- **Line-ceiling check, required before this wave, not assumed:**
  `src/app/actions/grading.ts` is 941/1000 (59 lines of headroom, section
  0.1) and `GradingTab.tsx` is 566/1000 (plenty). Neither file is in either
  wave's write set as scoped above, so this is a pre-check, not a live
  constraint - re-run it if the architect's mechanism ends up touching either
  file.

### Sequencing note (not a wave, a dependency)

**Wave 1 has value independent of A41.** It reduces true collapses in
`groupSubmissionsByStudent`'s own output regardless of whether A41's refusal
exists. **Wave 2's edit-safety requirement (section 5) also does not depend
on A41.** The ONE thing that depends on A41 landing first is the row's own
measured-purpose claim (the 14.5% falling) - that specific number cannot be
re-measured in production until A41's decision exists to be reduced. This is
a note for whoever chunks the backlog, not a blocker for either wave.

---

## 8. Leverage

**Fired trigger: this row is `kind: feature`, and it builds a capability an
instructor reaches (correct per-student grading for a zip shape that currently
grades wrong), so `docs/DEV_LOOP.md`'s Criteria step requires a leverage
claim** - unlike A41 (`kind: bug`), which correctly claimed none.

**The mechanism, named per `docs/loop/leverage.md`'s one rule:** this is a
**GUARANTEED** class claim, of the "output property the code holds regardless
of what the model returns" kind - specifically, the SCALE guarantee
`docs/grade/engine.ts:113-134` already gives (one rubric, applied identically
across a batch) is worthless if the BATCH ITSELF is wrong before the model
ever sees it. A44's mechanism guarantees that a zip whose folders name
distinct students produces one graded row per folder-identified student,
**by construction of the grouping key**, not by hoping the model notices three
people's work pasted into one prompt. A chat window has no zip-ingestion step
at all - an instructor pasting three students' essays into one chat message
gets exactly the same blended-grade failure this row fixes, with no
possibility of a structural fix, because there is no typed grouping key for a
chat to get right or wrong in the first place.

**Removal test** (per `docs/loop/leverage.md`'s "state the deletion, then
trace the assertion"): delete the new fallthrough step from `utils.ts`
(Wave 1) and the frozen per-shape table's row-4 fixture (2.3) goes from 3 rows
to 1 - the exact assertion this document's own 2.3 table freezes. **This is
the removal test's home**, to be built by the receiving test-author against
the real, landed mechanism rather than against this document's candidate.

---

## 9. Fork summary (repeated from section 3.4, batched per the brief)

Only one genuine fork was found. It is stated in full at 3.4; repeated here
only as the index the brief asks for:

> **Display wording when the new folder step disambiguates a group: fold the
> folder in as a suffix (1) or replace the display with the folder alone
> (2)?** My recommendation is (1). Both answers end this activity - neither
> changes 2.2's identity rule, 3.1-3.3's hazard finding, or 5's migration
> requirement, all of which hold regardless of which wording wins.

---

## 10. Residual register

Each names an owner, an instrument, an object with a direction of failure,
and a step. An entry missing any of those is a deletion, per
`iteration-caps.md`.

| id | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| RES-A44-1 | The compound-key mechanism (2.2) is a candidate, not a design ruling; the architect may implement it differently. | the architect pass consuming this scope | the frozen per-shape table, section 2.3 | The architect's chosen mechanism's output on all nine rows of 2.3's table. **RED on any row's verdict changing without a stated reason.** | The architect pass, before any wave. |
| RES-A44-2 | Whether three newly-separated rows render as three distinct, independently-editable table rows in the browser (section 6.2), given `GradingResults.tsx:635`'s `<tr key>` depends on display uniqueness. | the repo owner (browser check) - this environment renders no component | upload a real folder-shaped zip (section 0.2's Shape 1) with the fix live, inspect the DOM for three distinct `<tr>` elements and independently edit each one's grade | What is on screen against section 3's requirement. **FAILS if editing one row's grade visibly affects another, or if fewer than 3 rows appear.** | Owner verification, after Wave 2 lands. Blocks nothing. |
| RES-A44-3 | The display-string fork (section 3.4/9) is unresolved; both answers are buildable, and this document ships with a recommendation, not a decision. | the orchestrator or the owner | the fork text itself, section 3.4 | Which of the two wordings ships. **Not a pass/fail - a product/UX choice.** | Before Wave 2's implementation, not before Wave 1's. |
| RES-A44-4 | The compound-key mechanism can newly SPLIT a correctly-merging single-student, multi-folder, shared-filename submission (section 2.4's constructed counter-example) - a false-split risk with no measured rate. | whoever writes the test-author's sweep for this row | extend A41's published generator (`docs/a41-test-notes.md` section 1.3) with a `single-student-multi-folder-shared-filename` shape; measure the false-split rate the same way A41 measured the false-refuse rate | The new shape's false-split count. **FAILS as a residual if Wave 1 ships without this number ever being measured**, because the cost of the fix would then be unstated the same way A41's own withdrawn 53.9% figure once was. | Before Wave 1's implementation, ideally inside the test-author's own notes. |
| RES-A44-5 | Section 5's migration requirement is precisely scoped to "unchanged displays keep their edits" (5.2) rather than "no edit is ever orphaned" - a scope narrower than the backlog row's own plain-language framing ("no saved edit is orphaned"). | the orchestrator, at reconciliation | this document's section 5.1-5.2 | The backlog row's own wording against the precise requirement actually built. **FAILS if the row is closed while still asserting the plain-language, unsatisfiable version**, teaching the next reader a promise the codebase cannot keep. | The push that reconciles A44. |
| RES-A44-6 | Whether real instructors' zips exhibit Shape 3/6 (nested wrapper + per-student subfolders) as often as Shape 1 (flat per-student folders) is not measured - both are argued as plausible shapes, not counted against real uploads. | the repo owner | none available in this environment (no live uploads, no analytics) | Real-world shape frequency. **Not verifiable here at all**, per `docs/loop/this-repo.md` section 6. | Never, unless the owner has access to real upload logs outside this checkout. |

---

## 11. What I could not determine

- **Whether real instructors' zips take Shape 1, Shape 3/6, or something this
  table did not construct.** Every shape in section 0.2 was built by hand to
  test the rule against a structural hypothesis, not sampled from real
  uploads. RES-A44-6.
- **What the table actually looks like on screen** after Wave 2 lands -
  section 6.2, RES-A44-2. No component is rendered by any test in this repo.
- **The exact false-split rate for section 2.4's counter-example shape.**
  RES-A44-4 - no generator run exists for it yet, and inventing a number here
  would violate the brief's own measurement discipline.
- **Whether A41 will have landed by the time A44 is implemented.** Section
  0.1's sequencing note states what does and does not depend on the answer;
  the answer itself is an orchestrator chunking decision, not something this
  scope can determine from the tree.

---

## 12. Corrections to the A44 backlog row itself

None found. The row's three measured facts (0 of 20,000 folder-distinct-stem
refusals; 2901 of 19,975 folder-resubmit refusals; the three named risks) all
re-verified against A41's cited source documents without needing correction.
One clarification, not a correction: the row's phrase "make that a requirement
with an executing instrument - not a residual" (for the no-orphaned-edits
risk) is honoured by narrowing the requirement's SCOPE (section 5.2) rather
than by writing an unsatisfiable universal requirement and calling it done -
see RES-A44-5 for why this narrowing itself is recorded rather than silent.

---

## 13. Gate run and tree state for this pass

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

Both scratchpad harnesses (section 0) were built inside a throwaway,
untracked `.a44-scratch/` directory at the repo root (needed so Node's ESM
resolver could find the real `jszip` package - the session scratchpad
directory is outside the repo tree and cannot resolve it) and were deleted
before this document was finalized:

```
$ rm -rf .a44-scratch
```

**Final `git status --short`, re-run after this file was written** (this
pass's own line is the LAST one; the tree moved twice under this pass, once
before the scratch dirs existed and once after they were removed - both
snapshots below are real, in order):

```
 M docs/css-orphans.md
 M src/app/components/ui/modalAdoption.wiring.test.ts
 M src/app/components/ui/modalAdoptionScan.ts
```
then, moments later, after a sibling committed the `ui` files and another
sibling's edit landed:
```
 M docs/css-orphans.md
 M docs/r2-scope.md
?? docs/a44-scope.md
```

**`docs/a44-scope.md` is this pass's only entry, in every reading.** Every
other line across both snapshots is sibling-owned: `docs/css-orphans.md`
belongs to another row (unchanged from A41's own concurrency note, still
modified, never touched here); the `modalAdoption` files and `docs/r2-scope.md`
belong to concurrent agents on other rows (`docs/r2-scope.md`'s own live
sibling was flagged in this task's own brief). **None of these intersect this
pass's write set (`docs/a44-scope.md` only) or any file this document treats
as load-bearing evidence.** No `git stash`, `git add -A`, or
`git checkout --` was run at any point in this pass - only `rm -rf` on the
untracked `.a44-scratch/` directory this pass itself created.

**This document's own final line count is deliberately not quoted inline.**
A41's round-1 scope stated a self-count that stopped matching the committed
file by the time its last edit landed (m1, `docs/a41-check.md`) - a
self-referential number the writing process cannot measure accurately before
its own last edit. This document's line count, by both `wc -l` and
`@(Get-Content docs/a44-scope.md).Count`, is reported in the
`SubagentHandback` message for this pass, measured AFTER the last edit -
never asserted inside the file it is measuring.
