# A41 scope: a non-conforming zip silently merges several students into one graded row

Backlog row A41 (`docs/backlog.yml`, `- id: 'A41'`), kind `bug`, area
`grading-run-survival-and-disclosure`. This document scopes the defect. It does
NOT choose a remedy - section 4 costs three and picks none, because that choice
belongs to the architect pass and, where noted, to the owner.

Seat: `loop-seat`. Written 2026-09-27. Write set for this pass was exactly this
one file; `git status --short` at the end of section 10 is the evidence.

---

## 0. The instrument, stated first so every number below is checkable

Two instruments produced everything in this document.

**(a) Reading, with `file:line`.** Every citation was opened this pass with the
Read tool against the real tree, not inherited from A41's own `instrument`
field. Section 9 lists three places where the row's citations had MOVED or
where its text no longer matches the tree.

**(b) Executing the real parser.** `src/lib/grade/utils.ts` was COPIED into the
scratchpad and driven directly, so no claim below rests on a hand-transcribed
regex. The copy differs from the real file in exactly one line:

```
$ diff --strip-trailing-cr src/lib/grade/utils.ts <scratchpad>/utils.ts
3c3
< import { getMimeType } from "./constants";
---
> import { getMimeType } from "./constants.ts";
diff exit=1
```

The `.ts` suffix is needed only so `node --experimental-strip-types` can resolve
the specifier; `src/lib/grade/constants.ts` has no imports of its own
(`grep -n "^import" src/lib/grade/constants.ts` exits 1), so nothing else had to
be copied. CANARY for that diff: appending one line to the copy made the same
command still exit 1, and the printed hunk grew - so the command does report
differences rather than always exiting 1.

Everything in sections 1 and 6 was then produced by
`node --experimental-strip-types <script>.ts` importing that copy. Node here is
`v22.14.0` (`node --version`). There is no `tsx`, `ts-node`, `esbuild` or `swc`
binary in `node_modules/.bin` (`ls node_modules/.bin/ | grep -iE "^(tsx|ts-node|esbuild|swc)"`
exits 1), which is why type-stripping was used rather than a transpiler.

**What this instrument does NOT cover.** It executes `parseSubmissionFileName`
and `groupSubmissionsByStudent` for real. It renders nothing. Per
`docs/loop/this-repo.md` section 2, no component is rendered by any test in this
repo and there is no jsdom, so every claim in section 3 about what an instructor
SEES is labelled a READING CLAIM and is not settled here.

Line counts in this document were produced by `@(Get-Content <file>).Count` in
PowerShell, per `docs/loop/this-repo.md` section 3. `Measure-Object -Line` was
not used. On this file itself the two instruments AGREE:
`@(Get-Content docs/a41-scope.md).Count` and `wc -l < docs/a41-scope.md` both
returned 894 before the corrections in 2.1 were applied.

### 0.1 FOUR of the files cited below were under concurrent edit during this pass

`git status --short` at the end of the pass shows `src/lib/grade/engine.ts`,
`src/lib/grade.ts`, `src/app/actions/grading.ts` and `src/lib/grade/types.ts`
all modified by sibling agents, plus a new `src/lib/grade/rubric-provenance-stamp.ts`.
None of that is this pass's work; this pass's only write was `docs/a41-scope.md`.

Consequences, stated rather than papered over:

- **Two citations MOVED while this document was being written** and were
  corrected: `src/lib/grade/engine.ts` (section 2.1, 2-line shift) and
  `src/lib/grade.ts` (`:12` to `:14`). Both corrections carry the before and
  after.
- **Every other citation was RE-VERIFIED at the end of the pass** and was
  unmoved: `src/lib/grade/utils.ts` `:87`, `:95`, `:121`, `:176`, `:290`, `:315`;
  `src/lib/grade/extraction.ts:138`; `src/lib/grade/rubric.ts:131`, `:209`;
  `src/app/components/GradingTab.tsx:322`, `:455`, `:513`;
  `src/app/actions/grading.ts:707`, `:854`, `:907`, size still 941.
- **`src/lib/grade/engine.ts` and `src/app/actions/grading.ts` appear in this
  document's own wave plan (7.1).** A consumer must recompute disjointness
  against whatever those siblings land, because a write set that intersects an
  in-flight change is the one failure `docs/loop/parallel-disjointness.md`
  exists to prevent. This scope cannot settle that; it is RES-A41-9.

---

## 1. The exact collapse rule

### 1.1 The code path, read this pass

| What | Address |
|---|---|
| `matchStudentFileConvention` | `src/lib/grade/utils.ts:87-107` |
| the four-part requirement | `:90` (`const parts = name.split("_")`) and `:95-97` (`if (parts.length < 4) return null`) |
| the non-empty check on both halves | `:102-104` |
| `identityFromConventionMatch` | `:112-119` - key is `studentPart.toLowerCase()` |
| `leafStemFallback` | `:121-126`, regex `/^([A-Za-z0-9]+)/` at `:123` against the extension-stripped stem |
| `parseSubmissionFileName`, six-step priority order | `:176-260` - step 1 `byRaw` `:188-198`, step 2 leaf convention `:200-208`, step 3 crossing chain innermost-first `:210-226`, step 4 `byBase` `:228-239`, step 5 innermost crossing stem `:241-251` (guarded by `zipChain.length > 0` at `:243`), step 6 `leafStemFallback` `:253-259` |
| `inferStudentPrefix` | `:269-279` - thin wrapper, returns `{key, display}` |
| `groupSubmissionsByStudent` | `:290-350`; the `Map` at `:301`, keyed at `:304-305` on `inferred.key`, merged at `:307-316` |
| the merge with no distinct-identity check | `:315` - `existing.files.push([filePath, content])`, reached from `:305`'s `grouped.get(inferred.key)` hit |

Line 305 to line 316 contains no comparison of the colliding files' contents,
paths, or any second identity signal. Read in one window this pass; there is no
disambiguation branch to miss.

Measured size: `@(Get-Content src/lib/grade/utils.ts).Count` = **393**.

### 1.2 The general rule, stated precisely

A file's identity key is computed by the FIRST of the six steps that produces
one. When steps 1 through 5 all decline - which is the ordinary case for a flat
zip with no per-file model inference, see section 2 - the key is:

> **lowercase( the longest prefix of the file's base name, after its last
> extension is removed, consisting only of characters in `[A-Za-z0-9]`, anchored
> at position 0 ). If that prefix is empty, the whole stem is used instead; if
> THAT is empty, the literal string `unknown`.**

Two files therefore collapse onto one row if and only if their base-name stems
share that leading run, case-insensitively. Consequences worth stating flatly,
because each one is a different mistake an instructor can make:

- **A directory prefix is invisible.** `getBaseFileName` (`:34-38`) strips it
  before the regex ever runs, and a FOLDER is not a zip crossing, so
  `zipParents` is empty for it (`src/lib/grade/extraction.ts:95,106` write
  `zipParents[fullName]` only `if (zipChain.length > 0)`, and `zipChain` grows
  only at `:74`, on a nested `.zip` entry). Per-student FOLDERS provide no
  identity at all.
- **The run stops at the first character outside `[A-Za-z0-9]`.** A space, a
  hyphen, an underscore, a period or a parenthesis all terminate it.
- **Digits do NOT terminate it.** This is where the census's example failed.
- **Case is folded, so `Essay.docx` and `essay.docx` collide.**

### 1.3 Executed, over realistic sets

Driven through the copied `groupSubmissionsByStudent` with DISTINCT content per
file, so a merge cannot be excused as de-duplication. Columns are files in,
per-file `studentKey`, rows out.

| Set | Files in | Per-file key | Rows out | Verdict |
|---|---|---|---|---|
| The census's own example | `essay1.docx`, `essay2.docx`, `essay3.docx` | `essay1`, `essay2`, `essay3` | 3 | **no collapse** |
| A41's corrected example | `Homework Final.docx`, `Homework Draft.docx` | `homework`, `homework` | 1 (`Homework`, mergedFileCount 2) | COLLAPSE |
| Three students, assignment-named files | `Essay Rough Draft.docx`, `Essay Final Version.docx`, `Essay-Smith.docx` | `essay` x3 | 1 (`Essay`, 3) | COLLAPSE |
| **Per-student FOLDERS in one flat zip** | `AlvarezMaria/essay.docx`, `BrownTom/essay.docx`, `ChenLi/essay.docx` | `essay` x3 | **1 (`essay`, 3)** | **COLLAPSE** |
| Control: the supported convention | `alvarezmaria_20260901_1200_essay.docx`, `browntom_20260901_1300_essay.docx` | `alvarezmaria`, `browntom` | 2 | no collapse |
| Separator sensitivity | `Essay_Smith.docx`, `Essay-Smith.docx`, `Essay Smith.docx`, `EssaySmith.docx` | `essay`, `essay`, `essay`, `essaysmith` | 2 | COLLAPSE (3 into 1) |
| Three-part underscore name | `maria_alvarez_essay.docx`, `tom_brown_essay.docx` | `maria`, `tom` | 2 | no collapse |
| Case folding | `Essay.docx`, `essay.docx`, `ESSAY.pdf` | `essay` x3 | 1 | COLLAPSE |
| Leading non-alphanumeric | `_draft one.docx`, `_draft two.docx` | `_draft one`, `_draft two` | 2 | no collapse |

**The set an instructor plausibly produces is row 4, and it is worse than the
one A41 records.** Three students, each in their own folder, each file named
after the assignment. That is what a zip assembled by hand - or exported by a
tool that groups by folder rather than by filename - looks like, and it produces
ONE row named `essay` holding three people's work. Row 4 supersedes A41's own
`Homework Final` / `Homework Draft` example as the headline case; A41's example
is real and is kept, but it needs two students to have named their files
differently, while row 4 needs them to have named them the SAME, which is far
more likely.

Note also row 9: the regex is anchored (`/^(...)/`), so a leading underscore
makes it fail entirely and `leafStemFallback` falls back to the WHOLE stem at
`:124` (`match?.[1] ?? stem`). That branch is safer than the matching one. It is
recorded because a remedy that "fixes the regex" must not assume the fallback is
uniformly bad.

### 1.4 What a collapse produces downstream

Driven on row 4's set:

```
rows: 1
row.student: "essay"
row.mergedFileCount: 3
Files column would list: ["essay.docx","essay.docx","essay.docx"]
merged content handed to the model:
File: essay.docx

Maria's essay

---

File: essay.docx

Tom's essay

---

File: essay.docx

Li's essay
```

So one model call grades three students' work as one submission, against one
rubric, and returns one score and one feedback body. The row's display string
is also the key the instructor's own edits and the CSV export are stored under -
`src/app/components/grading-results/gradingResultsHelpers.ts:287` seeds
`seeded[result.student]`, `:503` reads `edits[result.student]`, `:632` merges
`merged[student]`. A collapse is therefore not only a wrong grade; it is a wrong
grade under a key that cannot be split apart afterwards.

---

## 2. Every reachable path

### 2.1 The census, with its canary

```
$ grep -rn "groupSubmissionsByStudent" src/
```
returns 56 lines. After removing `*.test.ts` files and the barrel re-export
(`src/lib/grade.ts:14` at the end of this pass; it was `:12` when first measured,
because that file was ALSO being edited by a concurrent agent - re-grep rather
than trusting either number), the CALL sites are exactly two:

| # | Call site | `inferredLookup` argument | `zipParents` argument |
|---|---|---|---|
| 1 | `src/lib/grade/extraction.ts:138` (inside `extractStudentEntries`, `:134-139`) | literal **`undefined`** | threaded |
| 2 | `src/lib/grade/engine.ts:432-437` (inside `gradeSubmissions`, `:416-465`) | `inferredFileNameLookup` from `inferFileNameConvention` at `:431` | threaded |

**A live-tree warning about the second row's addresses.** `src/lib/grade/engine.ts`
was being edited by a concurrent agent DURING this pass: it was
`gradeSubmissions` at `:414`, the call at `:430-435` and
`inferFileNameConvention` at `:429` when first opened, and `:416`, `:432-437` and
`:431` when re-measured at the end (`grep -n "groupSubmissionsByStudent|export async function gradeSubmissions|inferFileNameConvention" src/lib/grade/engine.ts`;
`@(Get-Content src/lib/grade/engine.ts).Count` = 517 at both readings). The table
above carries the LATER measurement. Any consumer of this document must re-run
that grep rather than trusting the numbers, and must treat every other
`engine.ts` address below as carrying the same 2-line uncertainty.
`src/lib/grade/extraction.ts:138` was re-verified unchanged at the end of the
pass (`sed -n '138p'` returns the `groupSubmissionsByStudent(submissions, undefined, rawData, zipParents)`
line).

CANARY for that search: `grep -rn "export function groupSubmissionsByStudent" src/`
returns `src/lib/grade/utils.ts:290` and exits 0, so the command fires and the
pattern is valid; `grep -rn "groupSubmissionsByStudentZZZ" src/` exits 1, so an
empty result from this instrument is a real absence.

### 2.2 **A41's row is wrong that there is only one call site, and the second one does NOT save the Gemini path**

A41's `instrument` field says "the real production call site,
`src/lib/grade/extraction.ts:138`, calls `groupSubmissionsByStudent(...)` with
`inferredLookup` hard-coded to `undefined` - confirmed by
`grep -n "groupSubmissionsByStudent" src/lib/grade/extraction.ts`, one call". That
grep is correct about that FILE and the row then generalises it to the whole app.
It is not the only production call site. `engine.ts:432` is the Gemini path and it
DOES pass a lookup.

This matters, and it matters in the direction that makes the defect worse rather
than better, for three reasons, all read this pass:

1. **`inferFileNameConvention` returns an EMPTY lookup on every failure.**
   `src/lib/grade/rubric.ts:209-241`: `:218-220` returns `fallback` when there
   are no file names, `:233-235` returns `fallback` when `result.ok` is false,
   `:238-240` returns `fallback` on any throw. `parseInferredFileNameLookup`
   (`:131-201`) returns `empty` when no JSON object can be extracted (`:140-143`),
   when `items` is not an array (`:154-156`), and skips any item whose
   `rawFileName` was not in the requested set (`:171-173`) or whose
   `studentName`/`assignmentFileName` normalises to empty (`:175-177`).
2. **An empty lookup is observationally identical to `undefined` for the two
   steps it feeds.** Steps 1 and 4 are `inferredLookup?.byRaw.get(...)` (`:190`)
   and `inferredLookup?.byBase.get(baseName)` (`:231`); a `Map` with no entries
   returns `undefined` from both. Executed: driving the copied function with
   `{ byRaw: new Map(), byBase: new Map() }` over A41's two-file example returns
   **1 row**, the same as with `undefined`.
3. So the Gemini path is protected only when a model call succeeds AND returns
   parseable JSON AND names a distinct student for each file. **Every one of
   those is unverifiable in this environment** - `docs/loop/this-repo.md` section
   6, no API keys; and `vitest.setup.ts` throws on real `fetch`. Treat the
   Gemini path as CARRYING the defect with a model-shaped mitigation in front of
   it, never as fixed.

### 2.3 The full reachable set, traced to the surface

`extractStudentEntries` has exactly one production caller
(`grep -rn "extractStudentEntries" src/`, excluding tests and the barrel):
`src/app/actions/grading.ts:854`. `gradeSubmissions` has exactly one
(`grep -rn "gradeSubmissions\b" src/`): `src/app/actions/grading.ts:907`. Both
sit inside `gradeAction`, declared at `src/app/actions/grading.ts:707`
(established with `awk 'NR<=910 && /^export async function/'` over that file).

`gradeAction` has **five** production callers
(`grep -rn "gradeAction" src/ | grep -v "\.test\."`):

| # | Caller | Attended? | Which branch of `gradeAction` |
|---|---|---|---|
| A | `src/app/page.tsx:63` (`useActionState(gradeAction, ...)`), form in `GradingTab.tsx:294-445` | **attended** | `embedded` -> `:854`; `gemini` -> `:907` |
| H | `src/lib/workflows/registry/steps.grading-cartridge.ts:108` | **unattended** | same |
| I1 | `src/lib/workflows/registry/steps.grading-run.ts:481` | **unattended** | same |
| I2 | `src/lib/workflows/registry/steps.grading-run.ts:549` | **unattended** | same |
| I3 | `src/lib/workflows/registry/steps.grading-draft-flow.ts:271` | **unattended** | same |

**This is the single most consequential correction to A41's remedy space.**
A41's note says the defect "is shared by path A (Upload ZIP) and path H
(cartridge drop) - both call the same `groupSubmissionsByStudent` through
`extraction.ts:138` - so a remedy scoped to only one UI surface leaves the other
exposed". Measured, it is worse on both axes: there are FIVE callers not two,
and FOUR of the five have no human present at the moment of grading. A remedy
built on asking the instructor to confirm something is structurally
unavailable on four fifths of the call sites. Section 4 costs that.

Two branches of `gradeAction` do NOT reach this parser and are recorded so a
remedy is not over-scoped:

- `provider === "other"` (`:846-849`) hands the base64 zip to
  `gradeZipViaEngine`, an external Deterministic Grading API; identity is
  decided outside this repo.
- The Canvas branch (`:814-819`, `gradeCanvasUrl`) and
  `canvasWorkToEntry` (`src/lib/grade/extraction.ts:166-300`) take identity from
  `work.student` at `:290` - a Canvas API field, never a filename. Path B/C/I's
  Canvas runs are not exposed.

### 2.4 `single-file-entry.ts`: it AVOIDS the hazard, deliberately, and introduces no second one

`src/lib/grade/single-file-entry.ts` (133 lines,
`@(Get-Content).Count`) landed this week for A39 wave 1. Checked directly:

- `studentLabelFromFileName` (`:57-63`) takes the **whole stem**, trimmed
  (`:60-62`), falling back to the literal `Uploaded submission`. It does NOT
  call `leafStemFallback` and does not apply `/^([A-Za-z0-9]+)/`.
- Its own header comment says so and names this defect as the reason
  (`:47-56`): "their fallback (`leafStemFallback`) would name this student after
  the leading alphanumeric run of the stem - exactly the 'document' failure mode
  W1-1/W1-2 exist to keep out of this path."
- `buildSingleFileEntry` returns at most ONE entry (`:72-133`), and its caller
  `src/app/actions/grading.ts:892-903` wraps it in a one-element array for
  `gradeEntries`. One entry cannot collapse with anything.
- It is guarded: `src/lib/grade/single-file-entry.test.ts:70-76` asserts
  `buildSingleFileEntry("Jordan Lee - reflection.txt", ...)` yields student
  `"Jordan Lee - reflection"` - which is exactly the string `leafStemFallback`
  would have truncated to `Jordan`. That assertion goes red if this path is ever
  routed through the shared fallback.

**Verdict: avoids it, and the avoidance is load-bearing rather than incidental.**
One caveat, not a new hazard but a boundary a remedy must respect: because the
single-file path never groups, a remedy that adds a refusal or a disclosure to
the ZIP path must not be wired into `classifyGradingUpload`'s `"single"` branch,
or it will refuse a file that was never at risk. The branch to guard is
`grading.ts:905-910` (and `:853-878` for `embedded`), not `:892-903`.

### 2.5 An existing convention counter, and why reusing it as-is is a trap

`src/lib/submission-archive-sniff.ts` already counts convention conformance over
zip entries: `countCanvasPattern` at `:97-102` with `const canvasPattern = /_\d+_\d+_/`
at `:98`, and a majority rule at `:176`
(`canvasCount > files.length / 2`). `sniffSubmissionArchive` (`:277-356`) already
opens the zip client-side and collects every entry (`:307-310`).

Its one production caller is `src/app/components/CartridgeDropPanel.tsx:221`
(`grep -rn "sniffSubmissionArchive\|sniffEntries" src/ | grep -v "\.test\."`). The
main Upload ZIP surface does not sniff at all.

**The two instruments DISAGREE, and the disagreement falls on the real Canvas
convention.** Executed, comparing `/_\d+_\d+_/` against what
`parseSubmissionFileName` actually does with the same name (detected by whether
`citationFileName` differs from the base name, which is true exactly when the
convention branch at `:200-208` fired):

| name | sniffer says Canvas | parser says conventional | |
|---|---|---|---|
| `janedoe_2024-01-01_120000_report.docx` | **false** | **true** | DISAGREE |
| `janedoe_20240101_120000_report.docx` | true | true | agree |
| `CS101_Fall_2026_submissions.zip` | false | true | DISAGREE |
| `my_essay_final_draft.docx` | false | true | DISAGREE |
| `Homework Final.docx` | false | false | agree |
| `smith_1001_0_report.docx` | true | true | agree |
| `a_b_c_d` | false | true | DISAGREE |
| `week_one_two_three.pdf` | false | true | DISAGREE |

**5 disagreements of 8.** The first row is decisive: the hyphenated date in the
real Canvas bulk-download convention - the one `utils.ts:68-75`'s own comment
documents, and the one every fixture in `utils.test.ts` uses - is not `\d+`, so
the sniffer classifies a genuine Canvas export as NOT Canvas. Any remedy that
predicts the parser's behaviour by calling the sniffer would tell the instructor
their correct zip is malformed, which is a new false sentence (section 5).

**What IS reusable, and it is the shape rather than the regex:**
`src/lib/submission-zip-intake.ts` (158 lines) is the precedent for a pure,
JSZip-free leaf that makes a refuse-or-accept DECISION over
`ArchiveEntryMeta[]` and has a separate `describeZipIntakeDecision` for the
sentence. `submission-archive-sniff.ts:358-378`'s own comment states the
division of labour explicitly. A conformance decision belongs in a leaf of that
shape, computed from `parseSubmissionFileName` itself so it cannot drift from
the parser, never from a second regex.

---

## 3. What the instructor currently sees

**Every claim in this section is a READING CLAIM.** No component is rendered by
any test here (`docs/loop/this-repo.md` sections 2 and 6), so none of it was
observed on screen.

### 3.1 The statement of the requirement, re-measured, and A41's quote is stale

A41 says: "`GradingTab.tsx:240` is the UI's entire statement of the input
requirement: 'Upload a zip archive that contains the student submissions,'
naming no naming convention at all", and its `instrument` field says
`GradingTab.tsx:240` was "quoted verbatim, read directly".

Re-measured this pass. `GradingTab.tsx:240` is now the closing `>` of the
"Grade from" `TextField` (`:233-245`). The sentence has MOVED and its TEXT HAS
CHANGED:

```
$ grep -rn "Upload a zip archive" src/
src/app/actions/grading.ts:895:        return { run: null, error: "Could not read that submission file. Upload a zip archive instead." };
src/app/components/GradingTab.tsx:322:              <p>Upload a zip archive of student submissions, or a single student&apos;s file (a document, text file, or image) to grade it on its own.</p>
```

CANARY: `grep -rn "zip archive" src/app/components/GradingTab.tsx` returns
`:322` and `:458` and exits 0; `grep -rn "Upload a zip archivZZZ" src/` exits 1.

So the current sentence, at `src/app/components/GradingTab.tsx:322`, verbatim, is:

> Upload a zip archive of student submissions, or a single student's file (a
> document, text file, or image) to grade it on its own.

It was rewritten by A39 wave 1 to cover the single-file path. **A41's
substantive claim survives its stale citation and is confirmed: this is still
the whole statement of the input requirement, and it still names no naming
convention.** Verified by reading the surrounding block `:311-324` - the
`<input type="file">` at `:315-321` and this one `<p>` are the entire field -
and by the grep above returning no other candidate.

### 3.2 Is there anything at all that would let an instructor notice?

Four candidate signals, each traced.

| Candidate | Where | Verdict |
|---|---|---|
| A count of graded rows | nowhere on this surface | **ABSENT.** `grep -rn "results.length" src/app/components/*.tsx src/app/components/grading-results/*.tsx` returns 11 lines; on the zip surface they are only GATES - `GradingTab.tsx:455` (`=== 0`, the empty state) and `:513` (`> 0`, render the table). No line renders the number. The one place a count IS rendered is `DraftedGradesTab.tsx:646` (`{results.length} student{...}`), a different, later surface reached after drafts are saved. |
| `mergedFileCount` | computed at `utils.ts:346` for every row, carried in `StudentSubmissionEntry` | **COMPUTED AND NEVER RENDERED.** `grep -rn "mergedFileCount" src/ --include=*.tsx` exits 1. It is read by 50 `.ts` files (`grep -rln "mergedFileCount" src/`) and by zero `.tsx` files. The exact number that would expose a collapse is already in the data at the UI boundary and is thrown away. |
| The Files column | `src/app/components/grading-results/FilesCell.tsx:39-92`, mounted at `GradingResults.tsx:742` | **PRESENT BUT AMBIGUOUS.** It lists every `submittedFiles[].name`, so the collapsed row DOES show three entries. But `citationFileName` for a fallback-keyed file is the bare base name (`utils.ts:257`), so row 4 of section 1.3 lists `essay.docx` three times - and `utils.test.ts:336-351` documents the legitimate shape that looks identical: one student's two dated resubmissions land in one row with `mergedFileCount` 2. A multi-file row is normal. **This is the only signal that exists, and it cannot distinguish one student with three files from three students merged.** |
| A warning or error | `GradingTab.tsx:262-266` (`state.error`), `:455-461` (empty state), `:504-510` (`state.warnings`) | **NONE FIRES.** `state.warnings` is populated only on the `embedded` branch, from `builtRubric.warnings` (`grading.ts:875`) - rubric warnings, not ingestion warnings. The empty state at `:458` fires only when `results.length === 0`; a collapse returns 1 or more rows, so it is never reached. `gradeAction` returns no error: nothing in the path throws. |

**The answer to the crux question is: no.** The only thing distinguishing a
correctly-parsed roster from a collapsed one is a table shorter than the class,
and the app never states how long it should have been. The instructor is not
given a count, a name list, or a warning. The one number that would settle it
(`mergedFileCount`) is computed and discarded at the component boundary.

Reading claims in this subsection that a browser check would settle, and which
are therefore also residuals (section 7.2): that `:322` is visible rather than
collapsed behind a control, and that the Files column renders the repeated names
rather than de-duplicating them in the DOM.

---

## 4. The remedy space: three options, argued and costed, NONE chosen

The three are A41's own (1) REFUSE, (2) DISCLOSE, (3) SUPPORT THE CONVENTION.
Costs below are measured, not asserted. **This section deliberately reaches no
recommendation.** Section 4.5 names the one fork that is the owner's rather than
the architect's.

### 4.0 The cost unit, measured

`docs/a39-census.md` section "Path A - Upload ZIP" counts path A at
**COLD = 6, WARM = 4** countable acts (A2, A3, A5, A6, A7, A8 cold; A5-A8 warm),
per submission = 0. Path H is **WARM = 3** (H5, H6, H7), per submission 0, waits
0, and that census calls it "the cheapest path in the app by every measure this
census can take". The census's rank table puts re-pasting the rubric at
"1 of the 4 warm interactions on path A (25%), 1 of 3 on path H (33%)" and ranks
it the single most valuable removal.

**So one added confirmation click on path A costs 4 -> 5 warm acts, a 25%
increase - numerically the same weight the census assigned to the top-ranked
thing worth REMOVING.** On path H it is 3 -> 4, a 33% increase. Note the
census's own path A citations are stale in the same way A41's were (it cites
`GradingTab.tsx:343-356` for "Start Review", which is now at `:420-444`); the
COUNTS are what is reused here, not its addresses.

### 4.1 Option 1: REFUSE the zip

**Mechanism.** A pure leaf over the zip's entry names, shaped like
`decideZipIntake` (`src/lib/submission-zip-intake.ts`), computing each entry's
key with `parseSubmissionFileName` itself and refusing when two or more entries
with distinct paths share a key - or, in the looser form A41 describes, when a
fraction of entries fail the convention.

**Cost.** Lowest interaction cost of the three: 0 added acts on a good zip, and
on a bad zip the run does not start, so no model spend. Works identically on all
five callers, because a refusal is a return value, not a dialog - the four
unattended callers already handle a `{ run: null, error }` return
(`grading.ts:822-823` is the existing precedent shape). Smallest write set.

**Failure mode, and it is the serious one.** A refusal is a hard stop with no
override. A zip that would have parsed correctly except for one stray file - a
`README.txt`, an instructor's `rubric.docx`, a `.DS_Store`-adjacent artefact -
is refused wholesale, and the instructor's only recourse is to re-export or
rename by hand, outside the app. The looser "meaningful fraction" form trades
that for a threshold nobody can justify: with the folder shape from section 1.3
row 4, **100%** of entries fail the convention and yet the instructor's zip is
perfectly well-organised, just organised by folder. A fraction-based refusal
fires hardest on the most reasonable input. Second failure mode: refusing is
the one option that makes the app strictly WORSE than a chat window for the
affected instructor, which is the axis `docs/loop/leverage.md` exists to protect.

### 4.2 Option 2: DISCLOSE the parse result before grading

**Mechanism.** Compute the grouping before any model call, show the instructor
the student list and the count, and require a confirmation. `extraction.ts:134-139`
(`extractStudentEntries`) already produces exactly this, deterministically and
with no model call - its own doc comment at `:129-133` says so. The data needed
is already computed.

**Cost.** +1 act on path A (4 -> 5 warm, +25%) and on the attended surface only.
The confirmation is a modal or an inline gate; `docs/loop/this-repo.md` and the
repo's own `modalAdoption.wiring.test.ts` pinned counts (referenced at
`FilesCell.tsx:8-13`) mean a new dialog site moves a pinned structural count, so
the write set is larger than option 1's. It also adds a round trip: the zip must
be parsed, shown, and then graded, which on the `gemini` branch means the file
is read twice or held across a confirmation.

**Failure mode, and it is structural.** **Four of the five callers have no
instructor present** (section 2.3). `steps.grading-cartridge.ts:108`,
`steps.grading-run.ts:481` and `:549`, and
`steps.grading-draft-flow.ts:271` all call `gradeAction` inside an unattended
workflow tick. Path H's own census row H9 says "No wait at all - the workflow
runs unattended; grades land in Drafts and as a CSV". So a confirmation gate
either (a) covers only path A, leaving the four unattended callers exposed -
which is exactly the "a remedy scoped to only one UI surface leaves the other
exposed" failure A41's note warns about, restated at four times the scale; or
(b) blocks the unattended runs, which turns a silent wrong grade into a silently
stalled workflow. Neither is obviously better than the other and the scope does
not choose. Second failure mode: a disclosure the instructor clicks through
without reading is a confirmation that CREATES the appearance of verification
while changing nothing - and it costs 25% more interaction to do so.

### 4.3 Option 3: SUPPORT the simple convention

**Mechanism.** Treat the real-world shapes as first-class rather than routing
them through a fallback designed for a different problem. Two sub-shapes, and
they differ in difficulty:

- **One file per student, filename is the student's name.** Detectable only by
  the ABSENCE of collisions, which is not a positive signal; the current code
  already handles it correctly by accident, since distinct names give distinct
  keys.
- **Per-student FOLDERS** (section 1.3 row 4). This one has a real, available
  signal: the directory prefix that `getBaseFileName` (`utils.ts:34-38`)
  currently discards. The information is present in the `submissions` keys and
  is being thrown away, not absent.

**Cost.** Highest of the three, and the only one that changes identity
resolution rather than gating it. It touches `parseSubmissionFileName`'s priority
order, which is BINDING per the A14 rulings recorded in the function's own
doc comment (`utils.ts:142-175`), and `utils.test.ts` has 28 tests pinned to
that order (measured in section 6). A new step between 5 and 6, or a directory
signal in step 6, must not out-rank the crossing chain (A14 ruling M2, cited at
`:228-230`) and must not resurrect the withdrawn `parts[1]` fold (A14 rulings v2
CORRECTION 2, `:68-86` and `utils.test.ts:318-352`).

**Failure mode.** It is the only option that can make a run silently wrong in a
NEW way. A directory signal splits one student's own two folders into two rows,
which produces two UI-identical rows each carrying its own contradictory grade -
precisely the harm `utils.ts:80-85` says CORRECTION 2 withdrew the `parts[1]`
fold to avoid, and which `utils.test.ts:336-351` now pins as a required
behaviour. It also does nothing for section 1.3 rows 2, 3, 6 and 8 (flat zips,
no folders), so it is a partial fix that could be mistaken for a complete one -
the most dangerous property any of the three has, because after shipping it the
collapse still exists and the reason to look for it is gone.

### 4.4 What is common to all three, and must not be scoped away

Whichever is chosen, `mergedFileCount` is computed at `utils.ts:346` and rendered
nowhere (section 3.2). Surfacing it is orthogonal to all three options, costs
**zero** added interactions, and is the only change that improves the
instructor's ability to notice a collapse without changing identity resolution
or adding a gate. It is not a remedy - it does not prevent the wrong grade - and
it must not be allowed to stand in for one. It is recorded here so the architect
pass can dispose of it explicitly rather than by omission.

### 4.5 The fork that is the owner's, not the architect's

The three options are not on one axis. Options 1 and 2 keep today's identity
algorithm and add a gate in front of it; option 3 changes the algorithm. Those
have different blast radii and different failure modes, and the choice between
"gate it" and "fix it" turns on a product judgement this scope cannot make:
**is an instructor better served by a run that refuses, or a run that proceeds
with a disclosed roster?** Stated as a terminating question because A41's note
already forbids this document from choosing:

> A41 produces either (X) a GATE - the run refuses or requires confirmation when
> the parse collides, identity resolution untouched; or (Y) a PARSER CHANGE -
> per-student folders become a first-class identity signal, no new gate. Which?

Answer X and options 1 and 2 are the space, with the unattended-caller problem
(4.2) as the sub-decision. Answer Y and option 3 is the space, with the
resubmission-splitting hazard (4.3) as the sub-decision. Either answer ends this
activity; neither feeds another scoping round.

---

## 5. The copy rule, and why it binds harder here than usual

The governing rule is `docs/a31-rulings.md:18`, RULING 1: a user-facing sentence
may assert only what holds on EVERY caller and EVERY reachable state. This
codebase has shipped and corrected **five** false user-facing sentences; the
fifth is recorded at `docs/a32-build-rulings.md:19-36` (RULING 64), and it was
inside a `role="status"` live region - "so after scheduling, the instructor and a
screen reader are both told students can see it now". The same ruling records
why it happened: "**An enumeration of strings to change is a FLOOR, not the
set**", because a wave copied a sibling's labels verbatim and missed a sixth
string that no enumeration named.

Four constraints follow, and they are constraints on the remedy, not suggestions.

**C1. The sentence must be true on all five callers, four of which nobody
reads.** Copy written for path A is also emitted by
`steps.grading-cartridge.ts:108`, `steps.grading-run.ts:481` and `:549`, and
`steps.grading-draft-flow.ts:271`. A sentence phrased as an instruction to the
reader ("check your filenames", "confirm the list below") is false on four of
five call sites, because there is no reader and no list is shown. This is the
same class of defect as the two sentences that had to be DELETED rather than made
true (`docs/BACKLOG.md:51`, A38: "neither named anything the instructor could
do").

**C2. A sentence that warns while the app proceeds is worse than silence, and
this is the specific trap A41's brief names.** "Some filenames do not follow the
expected convention - check your filenames" attached to a run that grades anyway
manufactures the appearance of disclosure. The instructor now has a reason to
believe they were told about the problem, and the wrong grade still lands. If the
app proceeds, the sentence must state a FACT about what it did
("N files produced M students"), never an instruction the app did not act on.

**C3. No sentence may assert a student count is authoritative.** A41's note
already rules this and section 2.2 proves why it is sharper than the note knew:
on the Gemini path the count depends on an unverifiable model call that degrades
silently to the empty lookup. So "Found 12 students" is false whenever a
collapse occurred - it found 12 KEYS. Wording must bind to the observable
(files, keys, rows), not to students.

**C4. The instrument must assert the EMITTED string, never the source text that
spells it.** `docs/BACKLOG.md:86` records this for A34's sentence, with the
reason: "a retired literal kept as a correction allowlist makes a file grep
print lines on correct code forever". And RULING 64's disposal is the shape to
copy: "branch it, and the instrument asserts BOTH branches - not just that the
scheduled wording exists."

**One sentence this scope is willing to propose as a candidate**, offered to the
test author and architect as a starting point rather than as settled copy,
because it is a bare fact with no instruction and no claim about students:

> Read 14 files and grouped them into 9 submissions.

It survives C1 (true unattended, where it becomes a log or report line rather
than a screen sentence), C2 (states only what happened), C3 (says
"submissions", not "students", and does not assert authority) and is checkable
under C4 (assert the composed string against a computed expectation from the
same two numbers). It is deliberately NOT a warning, because whether the app
warns depends on the 4.5 fork.

---

## 6. Could a test have caught it, and why the existing ones did not

### 6.1 What passes today

```
$ npm run test:paths -- src/lib/grade/utils.test.ts src/lib/grade/extraction.test.ts src/lib/grade/single-file-entry.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts
COVERED src/lib/grade/utils.test.ts files=1 passed=28
COVERED src/lib/grade/extraction.test.ts files=1 passed=9
COVERED src/lib/grade/single-file-entry.test.ts files=1 passed=15
COVERED src/lib/grade/grouping-zip-parents.wiring.test.ts files=1 passed=7
Test Files  4 passed (4) / Tests  59 passed (59)
TEST:PATHS EXIT=0
```

59 tests, all green, with the defect fully live.

### 6.2 What they assert

`utils.test.ts` (390 lines, `@(Get-Content).Count`) has 28 tests. The grouping
ones are organised as one `describe` per A14 shape:

| `describe` | Address | Asserts |
|---|---|---|
| nested per-student zips | `:160-197` | 2 rows for 4 files; no cross-contamination of content; leaf citation names |
| convention leaf under a folder | `:199-208` | 2 rows |
| bulk-download wrapper, flat Canvas leaves | `:210-226` | 3 rows, leaf beats wrapper |
| crossing with no match anywhere | `:228-250` | identity from the crossing |
| two matching crossings, narrowest wins | `:260-293` | 2 rows, not `CS101` |
| multi-layer wrapper | `:295-316` | 2 rows |
| sanitized-name collision is known-open | `:324-352` | **1 row is CORRECT** here, twice |
| **no two rows share a `student` string** | **`:360-375`** | `new Set(students).size === students.length` at `:373` |
| flat Canvas download control | `:377-389` | exact returned object |

### 6.3 The honest answer, and it is the sentence the brief asked for

**A fixture that uses the convention can never catch a violation of the
convention, and every positive-identity fixture in this file uses it.** Measured:
of 39 distinct filename literals in `utils.test.ts`, 20 reach step 6 with an
empty chain - but in every grouping fixture except one, the test SUPPLIES a
`zipParents` chain whose crossing rescues the file at step 3 or step 5. The one
grouping fixture key that genuinely reaches `leafStemFallback` with no chain is
`"src/otherfile.py"` at `:366`, and it is the only non-conventional file in its
set, so it has nothing to collide WITH. **There is no fixture anywhere in this
file containing two or more distinct-content files that both reach step 6.** The
code path A41 describes is exercised by zero grouping assertions.

That is the first half. The second half is worse and is the reason this went
unnoticed rather than merely untested.

### 6.4 The one general guard is a TAUTOLOGY, and the collapse SATISFIES it

`:360-375` is the only test in the file that asserts a safety property rather
than a specific shape, and its comment (`:354-359`) states the harm it means to
prevent: two rows that "look like duplicates of each other (or, worse, one
silently overwrite the other in anything keyed on the display string, as
`GradingResults.tsx` does)". Its assertion, `:373`:

```
expect(new Set(students).size).toBe(students.length);
```

`grouped` is a `Map` keyed on `inferred.key` (`utils.ts:301,304-305`), and
`inferred.key` is `display.toLowerCase()` (`:117`, `:125`, `:193`, `:234`).
Distinct keys therefore imply distinct lowercased displays, which imply distinct
displays. **The property is guaranteed by construction and the assertion cannot
fail.** Worse, the collapse makes it MORE true: fewer rows means fewer chances
to collide.

Executed, to avoid resting that on an argument. 20,000 generated filename sets
(2 to 6 files each, drawn from 15 realistic stems x 4 extensions x 4 directory
prefixes, distinct content per file) driven through the copied
`groupSubmissionsByStudent`:

```
sets driven through the REAL groupSubmissionsByStudent: 20000
sets where utils.test.ts:373's uniqueness assertion FAILS: 0
sets where rows < files (the A41 collapse): 10777 (53.9% of sets)
worst collapse: 6 files -> 1 rows; ["AlvarezMaria/Homework Draft.pdf",
  "Homework1/Homework Final.docx","BrownTom/Homework Draft.docx",
  "Homework1/homework.txt","AlvarezMaria/Homework Final.txt","Homework Final.py"]
```

**Zero failures in 20,000 sets while 53.9% of those same sets collapsed.** The
one assertion aimed at this class of harm is satisfied by the defect that causes
it. That is the useful finding: the gap is not "no test covers the fallback", it
is "the test that was written to cover this harm binds to a property the harm
cannot violate".

### 6.5 What a test would have to assert instead

Three properties, in order of strength. The object of comparison, the instrument
producing each quantity, and the direction of failure are named for each,
because that is what makes them pass conditions rather than intentions.

| # | Object under comparison | Instrument per quantity | Direction of failure |
|---|---|---|---|
| T1 | the returned entry COUNT against the number of distinct-content input files | both from one `groupSubmissionsByStudent` call in `src/lib/grade/utils.test.ts`; expected value is `Object.keys(submissions).length`, computed from the fixture, not written as a literal | **RED when the returned count is LOWER than the input count** for a fixture of three distinct-content files sharing a leading alphanumeric run and nothing else. Today's measured behaviour is 1 against 3, so this goes red on current code and must be watched doing so before it is trusted. |
| T2 | the set of input contents against the union of contents across all returned rows, partitioned | both from the same call; the partition is checked by asserting no row's `content` contains a marker planted in a different file | **RED when any row's `content` contains a marker planted in a file that is not in that row's `submittedFiles`.** This is the property `:182-190` already checks for the nested-zip shape; it has never been run against a fallback-keyed fixture. |
| T3 | the count of input files whose identity came from step 6 against zero, on any fixture representing a supported input | the parser itself, exposed or inferred as in section 2.5 (`citationFileName !== baseName` distinguishes the convention branch) | **RED when a supported shape resolves via the fallback**, which is a structural version of T1 that does not need a colliding fixture to fire. Weakest of the three and listed last, because it asserts a mechanism rather than an outcome. |

T1 is `RES-A39-4`'s own instrument, carried forward with A41's correction
(a genuinely colliding fixture, not the census's `essay1/2/3`). **A note the
test author needs:** T1's fixture must NOT be three files sharing an identical
base name under different folders alone, because `utils.test.ts:336-351` pins
the opposite behaviour for a same-student resubmission - the fixture has to be
three files whose collision is provably across different students, which in a
flat zip is expressible only by content, not by name. That is the honest reason
T1 could not simply have been written earlier: the fixture needs a distinctness
signal the data format does not carry.

### 6.6 Anti-tautology check the test author must run

Because the existing guard failed this way, any new assertion owes the same
check: state the mutation, then say which observed value changes. For T1 the
mutation is to delete the `existing.files.push` branch at `utils.ts:315` and
insert a suffixed key instead; if T1's observed count does not change, T1 is not
measuring the merge. For the uniqueness assertion at `:373` there is NO such
mutation inside `groupSubmissionsByStudent` - which is the proof it is a
tautology rather than a weak test, and the reason strengthening it is not one of
the available disposals.

---

## 7. Wave plan and residual register

### 7.1 Wave plan

Shape-dependent: waves 2 and 3 differ by the 4.5 fork, so both branches are
given. Every list contains the file that CALLS or RENDERS the change. Sizes are
`@(Get-Content <file>).Count`, measured this pass, with the 1000-line ceiling
from `src/file-size-ceiling.structure.test.ts:41` (`grep -n "LIMIT = 1000"`).
No file named here has an `ALLOWED_OVERAGE` entry
(`grep -n "grading.ts\|GradingTab\|GradingResults\|grade/utils" src/file-size-ceiling.structure.test.ts`
exits 1, canary: the same grep for `grading.tsZZZ` also exits 1), so all of them
must stay strictly under 1000.

**Wave 1 - the failing test, shape-independent. Lands first, red, on both
branches of the fork.**

| Path | Now | Role |
|---|---|---|
| `src/lib/grade/utils.test.ts` | 390 | T1 and T2 from 6.5 added. This file both declares and exercises the change; no separate caller is needed because the assertions ARE the caller of the exported function. |

Nothing in wave 1 is revertible-sensitive and nothing else may be in its write
set. This wave is expected to END RED, and the wave gate must record that rather
than treating it as a failure.

**Wave 2X (fork answer X - GATE).**

| Path | Now | Role |
|---|---|---|
| `src/lib/grade/submission-identity-collisions.ts` | new, est. 90-130 | NEW pure leaf, shaped on `src/lib/submission-zip-intake.ts` (158): takes the same `submissions` keys plus `zipParents`, computes each key with `parseSubmissionFileName`, returns the collision decision AND the numbers a sentence needs. Imports no JSZip. |
| `src/lib/grade/submission-identity-collisions.test.ts` | new | its own guard |
| `src/lib/grade/extraction.ts` | 300 | **the CALLER.** `extractStudentEntries` at `:134-139` is where the decision is computed. |
| `src/lib/grade/engine.ts` | 517 | **the SECOND CALLER.** `gradeSubmissions` at `:416-465` - re-measure, this file moved during this pass (see 2.1); without this the Gemini branch ships the new leaf dead. |

**Wave 3X (fork answer X - the surface and the sentence).**

| Path | Now | Role |
|---|---|---|
| `src/app/actions/grading.ts` | **941** | **the CALLER of the decision**, at `:853-878` (`embedded`) and `:905-910` (`gemini`), and the single point all five `gradeAction` callers pass through. **59 lines of headroom.** Any addition here larger than that needs an extraction first, and this wave must measure before and after. |
| `src/app/components/GradingTab.tsx` | 566 | **the RENDERER**: `state.error` at `:262-266`, `state.warnings` at `:504-510`, and the requirement sentence at `:322`. |
| `src/app/actions/grading.<name>.test.ts` | new or existing | asserts the EMITTED string per C4, never the source text. |

**Wave 2Y (fork answer Y - PARSER CHANGE).**

| Path | Now | Role |
|---|---|---|
| `src/lib/grade/utils.ts` | 393 | `parseSubmissionFileName` `:176-260`, `leafStemFallback` `:121-126`. The A14 priority order at `:142-175` is binding and this wave must state which step it inserts at and why it does not out-rank the crossing chain. |
| `src/lib/grade/utils.test.ts` | 390 | **the CALLER**; also where the existing 28 pinned tests are re-judged. |
| `src/lib/grade/extraction.ts` | 300 | only if directory information must be threaded rather than recovered from the existing keys. Named conditionally on purpose; the wave must decide and the gate must match. |

**Wave 3Y** = wave 3X's disclosure-of-numbers half only (section 4.4), with no
gate. Same file list minus the decision leaf.

**Not trivially revertible, on either branch:** any change to
`parseSubmissionFileName`'s priority order (wave 2Y) alters identity for every
past run's re-render, and `gradingResultsHelpers.ts:287,503,632` key stored edits
on the display string - so a shipped identity change silently orphans saved
edits. Wave 2X and 3X are revertible; wave 2Y is not. That asymmetry is an input
to the 4.5 fork and is recorded here rather than left for the architect to
rediscover.

**Gate for every wave:** `git status --short` against the list above, plus the
`.claude/worktrees` check (`docs/loop/this-repo.md` section 7 - `Glob` returns
the worktree copy FIRST). `npx tsc --noEmit` has exactly one caller and it is the
wave gate.

### 7.2 Residual register

Each entry names an owner, an instrument, an object, a direction of failure and a
step. An entry missing any of those is a deletion, so none is written without
all five.

| id | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| RES-A41-1 | The collapse itself is unremedied by this document; only measured. | the chunk whose write set includes `src/lib/grade/utils.ts` or `src/app/actions/grading.ts` | T1, section 6.5: `npm run test:paths -- src/lib/grade/utils.test.ts` | Returned entry count against distinct-content input count. **RED when the count is lower.** Today 1 against 3. | Wave 1, before any remedy wave. |
| RES-A41-2 | The Gemini path's mitigation is a model call that degrades to the empty lookup on any failure (section 2.2), and no test drives that degradation. | the same chunk | a unit test over `parseInferredFileNameLookup` (`src/lib/grade/rubric.ts:131-201`) handing it unparseable output, plus T1 driven with `{byRaw: new Map(), byBase: new Map()}` | The returned lookup's entry count, and the row count under it. **RED when a degraded lookup produces a different row count than `undefined` does** - i.e. red if anyone ever makes the two paths diverge without saying so. | Wave 2X or 2Y, whichever lands. |
| RES-A41-3 | `mergedFileCount` is computed (`utils.ts:346`) and rendered by zero `.tsx` files. Orthogonal to all three remedies; must be disposed of explicitly, not by omission. | the architect pass consuming this scope | `grep -rn "mergedFileCount" src/ --include=*.tsx` | The count of `.tsx` files reading it. **Currently 0 (exit 1). FAILS as a residual the moment the architect pass closes without ruling on it.** | The architect pass, before wave 3. |
| RES-A41-4 | The 4.5 fork (gate versus parser change) is unanswered, and options 1/2/3 cannot be narrowed without it. | the repo owner | the terminating question in section 4.5 | The answer. **Failure direction: a wave that picks a branch without the answer**, which is how a scope becomes a decision nobody made. | Before wave 2, asked alongside other work per the never-stall rule, never as a gate. |
| RES-A41-5 | Whether option 2's confirmation should block or bypass the four unattended callers (section 4.2). | the architect pass, escalating to the owner if it is a product call | the caller census in 2.3: `grep -rn "gradeAction" src/ \| grep -v "\.test\."` | The count of unattended callers, currently 4 of 5. **RED when a remedy ships whose behaviour on those four is unstated.** | Wave 2X, only if the fork answers X. |
| RES-A41-6 | Every claim in section 3 is a reading claim. `GradingTab.tsx:322` being visible rather than collapsed behind a control, and the Files column rendering repeated names rather than de-duplicating them, are unverified. | the repo owner (browser check) - this environment renders no component (`docs/loop/this-repo.md` sections 2 and 6) | opening the Grading tab with a deliberately colliding zip | What is on screen against section 3.2's table. **FAILS if a signal exists that section 3.2 says is absent** - in which case the remedy is smaller than scoped. | Owner verification, any time; it narrows the remedy but blocks nothing. |
| RES-A41-7 | `src/lib/submission-archive-sniff.ts:97-102`'s `/_\d+_\d+_/` disagrees with the parser on 5 of 8 measured names, including the real Canvas convention. Unfixed here, and A41 does not own it. | the next chunk whose write set includes `src/lib/submission-archive-sniff.ts` | the 8-case comparison in 2.5, re-run | The two instruments' verdicts per name. **RED when the sniffer reports not-Canvas for a name the parser resolves via the convention branch.** Today 5 of 8. | Whichever comes first: a remedy that wants to reuse the sniffer's counter, or the next change to that file. Explicitly NOT a wave of A41. |
| RES-A41-8 | A41's row text carries three claims this pass found stale or wrong (section 9). The row itself is not corrected by this document - `docs/backlog.yml` was outside this pass's write set. | the orchestrator, at reconciliation | section 9's table, each line re-measured | The row's `instrument` and `note` fields against section 9. **FAILS if the row is closed while still asserting `GradingTab.tsx:240` and a single call site**, which would teach the next session a wrong address and a wrong scale. | The push that reconciles A41. |
| RES-A41-9 | `src/lib/grade/engine.ts` and `src/app/actions/grading.ts` are in this scope's wave plan (7.1) AND were under concurrent edit during this pass (section 0.1). Disjointness against those siblings is not computed here. | the orchestrator, before dispatching wave 2X or 2Y | `git status --short` plus the exact-path intersection (`sort \| uniq -d`) that `docs/loop/parallel-disjointness.md` mandates, run against whatever the siblings land | This scope's wave write sets against the siblings' write sets. **RED on any non-empty intersection**; empty is the only pass. | Before wave 2, not at the wave gate - by then the collision has already happened. |

### 7.3 Disposition of A41's own stated requirements

A41's `note` and `instrument` fields, and `RES-A39-4` which A41 carries forward,
are the prior version of this requirement set. Every item is disposed of below so
none is silently dropped.

| Prior requirement (source) | Disposition |
|---|---|
| Correct the census's `essay1/2/3` example (A41 `instrument`) | **KEPT**, re-executed independently: section 1.3 row 1, 3 rows out, no collapse. Confirmed. |
| `Homework Final` / `Homework Draft` collapses to `homework` (A41 `instrument`) | **KEPT and confirmed**, section 1.3 row 2. Demoted from headline example in favour of row 4, which is more likely and worse. |
| The fallthrough is reached in practice, not theory (A41 `instrument`) | **KEPT**, and strengthened: section 2.2 shows it is reached on the Gemini path too whenever the model call degrades. |
| The scope must name BOTH path A and path H or say why only one (A41 `note`) | **HANDED OVER, enlarged.** Section 2.3 names all FIVE callers. Receiver: the architect pass. Obligation: a remedy must state its behaviour on the four unattended callers (RES-A41-5). |
| The remedy space is three options, none preferred (A41 `note`) | **KEPT**, section 4, all three costed, none chosen. The fork between them is escalated as RES-A41-4 rather than decided. |
| A user-facing sentence may assert only what holds everywhere (A41 `note`, citing A31 ruling 1) | **KEPT**, section 5, with the four constraints restated against the measured five-caller census and the fifth false sentence at `docs/a32-build-rulings.md:19-36`. |
| A disclosure must not claim a student count is authoritative while `inferredLookup` is unpopulated (A41 `note`) | **KEPT and sharpened** as C3, section 5. Section 2.2 shows the condition is broader than the note stated: the Gemini path degrades into it silently. |
| The A14 sanitized-name collision (`utils.ts:76-85`) is NOT in scope (A41 `note`) | **KEPT as out of scope.** Not re-litigated. Recorded in section 4.3 only as a constraint on option 3 (`utils.test.ts:324-352` pins today's behaviour and a remedy must not break it). |
| RES-A39-4's instrument: a unit test over `groupSubmissionsByStudent` asserting entry count for three files sharing a leading run | **KEPT**, as T1 (section 6.5) and RES-A41-1, with one correction A41 did not make: the fixture needs cross-student distinctness expressible only by CONTENT, because `utils.test.ts:336-351` pins the same-student multi-file shape to one row. |
| RES-A39-4's direction of failure: RED when three distinct files collapse to fewer than three entries | **KEPT verbatim** as T1's direction. |
| "Whether the returned table's row count is what an instructor actually sees remains a reading claim" (A41 `note`) | **KEPT**, as RES-A41-6, with the owner named and a browser check as the instrument. |
| Nothing | **WITHDRAWN: none.** No prior requirement was dropped by this pass. |

---

## 8. Leverage

Not applicable and recorded rather than skipped. `docs/loop/seats.md`
("Acceptance criteria") rules that a bug fix makes no leverage claim; A41's
`kind` is `bug`. **Fired trigger: bug fix, no capability added.** The relevant
observation is the inverse one, and it belongs in section 4.1's failure-mode
argument rather than in a claim: a refusal makes the app strictly worse than a
chat window for the instructor it refuses, which is the axis
`docs/loop/leverage.md` protects.

---

## 9. Corrections to A41's row, each re-measured this pass

| A41 says | Measured 2026-09-27 | Severity |
|---|---|---|
| "`GradingTab.tsx:240` is the UI's entire statement of the input requirement: 'Upload a zip archive that contains the student submissions'", quoted verbatim per its `instrument` | The line has MOVED to `:322` and the TEXT HAS CHANGED to "Upload a zip archive of student submissions, or a single student's file (a document, text file, or image) to grade it on its own." (`grep -rn "Upload a zip archive" src/`). A39 wave 1 rewrote it. `:240` is now the closing `>` of the "Grade from" `TextField` (`:233-245`). | **The citation is stale and the quote is not in the tree.** The row's substantive claim - no naming convention is named - still holds, verified against `:311-324`. |
| "the real production call site, `src/lib/grade/extraction.ts:138` ... one call" - generalised to the only call site | There are TWO call sites. `src/lib/grade/engine.ts:432-437` passes a real lookup from `inferFileNameConvention`. And there are FIVE callers of `gradeAction`, four unattended (section 2.3). | **Materially wrong about scale, in the direction that makes the remedy space smaller than A41 assumed.** The row's `undefined` claim about `extraction.ts:138` itself is correct. |
| "this defect is shared by path A (Upload ZIP) and path H (cartridge drop)" | Also `steps.grading-run.ts:481`, `:549` and `steps.grading-draft-flow.ts:271`. | **Undercounts by three.** Each of the three is unattended, which is what breaks remedy option 2. |
| "the collapsing behaviour was additionally executed with `node -e` against the real regex and function logic COPIED VERBATIM from source" | Independently re-executed here against the real file rather than a copy of its logic (section 0). Every collapse claim in A41 reproduced. | **No correction.** A41's executed findings hold. |

---

## 10. What I could not determine

- **Whether any model call actually populates `inferredLookup` in production.**
  No API keys in this checkout (`docs/loop/this-repo.md` section 6), and
  `vitest.setup.ts` throws on real `fetch`. Section 2.2's degradation analysis is
  read from the code; the RATE at which it degrades is unknowable here. Do not
  let a remedy rest on an assumed success rate.
- **What an instructor sees on screen.** Section 3 is entirely reading claims;
  RES-A41-6 routes it to owner verification.
- **Whether real instructors' zips take the folder shape.** Section 1.3 row 4 is
  argued as plausible from the code's own blindness to directories, not measured
  against real uploads, which this environment cannot see. The argument for its
  priority over A41's example is about likelihood and is a judgement, labelled
  as one.
- **Whether a sixth caller of `gradeAction` exists outside `src/`.** The census
  in 2.3 covers `src/` only. `grep -rn "gradeAction" src/` is the whole
  instrument; anything reaching the action from outside `src/` would not appear.

### Gate run for this pass

```
$ npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Result and `git status --short` are recorded in the handback report for this
pass rather than here, because they describe the state after this file was
written and cannot be quoted from inside it without being stale.
