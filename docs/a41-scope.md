# A41 scope: a non-conforming zip silently merges several students into one graded row

Backlog row A41 (`docs/backlog.yml`, `- id: 'A41'`), kind `bug`, area
`grading-run-survival-and-disclosure`. Round 1 of this document (commit
`a4312b4`) was checked at `docs/a41-check.md` (commit `f3aa292`): 5 blockers, 7
majors, 7 minors, one orchestrator ruling (M6). **This is Revision 1 - the one
revision available before any unresolved question goes to the owner**
(`AGENTS.md`, "Two rounds, then ask"; `docs/loop/iteration-caps.md`). Three
rulings from the orchestrator are applied here rather than re-derived; each is
named at the site it touches and summarized in the table below.

Seat: `loop-seat`. Round 1 written 2026-09-27; this revision also 2026-09-27.
Write set for this pass is exactly `docs/a41-scope.md` - `git status --short`
at the end of section 10 is the evidence, and section 0.1 lists the concurrent
sibling activity this pass observed and did not touch.

## Disposition of the round-1 check's findings

| Finding | Disposition | Where in this revision |
|---|---|---|
| RULING 69 (orchestrator) - the 4.5 fork | **ANSWERED: REFUSE** (branch X; the CONFIRM alternative is deleted from that branch). "Read the folders" (branch Y / option 3) is filed as a separate backlog row, out of A41's scope. | Section 4 rewritten; RES-A41-10 |
| RULING 70 (orchestrator) - 6.5/6.6/7.1 belong to elevated seats | **RELOCATED.** Sections 6.5, 6.6 and 7.1 deleted; each replaced by a one-paragraph statement of what this scope requires of the receiving seat. No oracle, sabotage protocol, write-set or wave order is written here. | Section 6.5, Section 7.1 |
| RULING 71 (orchestrator) - the 53.9% figure | **WITHDRAWN**, not repaired in place. Replaced with a published, reproducible ground-truth generator run fresh this pass, reporting a TRUE cross-student rate instead of `rows < files`. | Section 6.4 |
| B1 - the caller census counts callers of the entry point, not of the defect | **FIXED.** Re-derived against the current tree: 3 exposed callers, not 5; 1 unattended, not 4. | Section 2.3, 4.1, C1, RES-A41-5, section 9 note |
| B2 | see RULING 71 | |
| B3 - T1 is unsatisfiable under branch X as round 1 wrote it | **RESOLVED by RULING 69 + RULING 70.** T1 no longer needs to be shape-independent - branch X is the only branch now, and the corrected object of comparison (the new refusal leaf's decision, not `groupSubmissionsByStudent`'s row count) is stated as a requirement, not written as an oracle. | Section 6.5's replacement paragraph |
| B4 - the fork's branches did not span the remedy space | **MOOT under RULING 69.** The fork is answered, so the wording defect in round 1's question cannot recur; "the question for the owner" section is removed rather than repaired. | Section 4.5 |
| B5 - the candidate sentence violates C3 and miscounts its numerator | **FIXED.** The disclosure-shaped candidate is withdrawn (its remedy was never chosen). A new candidate bound to the REFUSE remedy is offered and checked against C1-C4. | Section 5 |
| M1 - `state.warnings` populated on 4 sites; the Gemini zip branch populates none | **FIXED** in the reading-claims table. Also noted: the chosen remedy sidesteps this specific gap by routing through `state.error` (populated on every path), but the wave that builds it must not be allowed to reach for `warnings` instead. | Section 3.2, Section 4.1 |
| M2 - duplicate `FilesCell` keys; 3.2 asserted as fact what RES-A41-6 called unverified | **FIXED.** Relabelled a reading claim; the duplicate-key fact is now inside RES-A41-6's own failure direction. | Section 3.2, RES-A41-6 |
| M3 - the absence instrument was case-sensitive and missed `gradableResults`/`postableResults` | **FIXED.** Re-run case-insensitively; `GradingResults.tsx:306`'s Canvas-`userId` gate is cited as the real reason the zip-path conclusion still holds. | Section 3.2 |
| M4 - the revertibility asymmetry rested on a mechanism that does not exist | **FIXED.** Corrected to the real mechanism: `loadPersistedEdits` silently degrading a non-matching student key to the seeded fallback. | Section 4.3 |
| M5 - the disposition table said "WITHDRAWN: none" while silently changing RES-A41-1's owner and dropping its tripwire | **FIXED.** The owner change is now stated explicitly and the tripwire is restored. | Section 7.2, 7.3 |
| M6 - orchestrator ruling: seat elevation | see RULING 70 | |
| M7 - "5 of 8" disagreements carried a one-row argument | **FIXED.** Split by direction: 1 of 8 supports the false-sentence risk; the other 4 are a different, already out-of-scope defect. | Section 2.5 |
| m1 - the document's own line count did not reproduce | **FIXED** by not restating a self-count inline; see section 0. | Section 0 |
| m2 - the `ALLOWED_OVERAGE` canary pointed the wrong way | **FIXED.** Positive canary substituted and re-verified this pass. | Section 7.1 |
| m3 - a sixth `gradeAction` caller was determinable in one command | **FIXED. Closed:** no sixth caller exists. | Section 10 |
| m4 - drift (not error) on four counts | **RE-MEASURED** this pass; current numbers used throughout. | Sections 2.1, 3.2 |
| m5 - section 6.6's universal was false as literally written | **MOOT:** 6.6 is relocated per Ruling 70; the corrected framing is folded into 6.5's replacement paragraph. | Section 6.5 |
| m6 - "read by 50 `.ts` files" overstated what the grep measures | **FIXED.** | Section 3.2 |
| m7 - section 2.5's table compared the sniffer's regex, not the sniffer's gated output | **FIXED.** | Section 2.5 |

---

## 0. The instrument, stated first so every number below is checkable

Two instruments produced everything in this document, unchanged in kind from
round 1.

**(a) Reading, with `file:line`.** Every citation in this revision was
re-opened this pass with the Read/Grep tools against the real tree, not
inherited from round 1's numbers where this pass could re-measure directly.

**(b) Executing the real parser.** Same method as round 1, re-run this pass:
`src/lib/grade/utils.ts` and `src/lib/grade/constants.ts` copied into the
scratchpad, driven with `node --experimental-strip-types` (`node --version`:
`v22.14.0`). The copy differs from the real file in exactly one line:

```
$ diff --strip-trailing-cr src/lib/grade/utils.ts <scratchpad>/g/utils.ts
3c3
< import { getMimeType } from "./constants";
---
> import { getMimeType } from "./constants.ts";
diff exit=1
```

CANARY, re-run: `grep -n "^import" src/lib/grade/constants.ts` exits 1 (that
file imports nothing of its own), so no further file needed copying.

**What this instrument does NOT cover.** Unchanged from round 1: it executes
`parseSubmissionFileName` and `groupSubmissionsByStudent` for real; it renders
nothing. Per `docs/loop/this-repo.md` section 2, no component is rendered by
any test in this repo and there is no jsdom, so every claim in section 3 about
what an instructor SEES is a READING CLAIM, not settled here.

Line counts, where stated, are produced by `@(Get-Content <file>).Count` in
PowerShell, per `docs/loop/this-repo.md` section 3, cross-checked with `wc -l`.
`Measure-Object -Line` is never used as a measurement.

**On m1 - this document's own line count is deliberately not quoted inline.**
Round 1 stated "894" for itself and the committed file was 936 by both
counters: a self-referential number the writing process cannot measure
accurately before its own last edit lands. This revision does not repeat that
mistake. Its final line count is reported in the handback for this pass (the
`SubagentHandback` message), measured with `@(Get-Content
docs/a41-scope.md).Count` and `wc -l < docs/a41-scope.md` AFTER the last edit -
never asserted inside the file it is measuring.

### 0.1 Concurrent sibling activity during this pass, and why it does not block this write

`git status --short`, re-run just before this section was written:

```
 M docs/BACKLOG.md
 M docs/backlog.yml
 M docs/css-orphans.md
 M src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts
?? src/app/components/walkthrough-announcement/walkthrough-announcement-timing.structure.test.ts
```

None of these intersect this pass's write set (`docs/a41-scope.md` only, per
this pass's own brief) or any file this document treats as load-bearing
evidence - the `walkthrough-announcement*` files are unrelated to grading, and
`docs/BACKLOG.md`/`docs/backlog.yml` are explicitly outside this pass's write
set by instruction (not touched here). Earlier in this same pass, before those
siblings' commits landed, `git status --short` showed a different set
(`docs/css-orphans.md` plus two `snapshot-grading` files) - consistent with
this repo's auto-commit hook moving the tree between reads, not with anything
this pass wrote. **This snapshot is stale by the time it is read; the
orchestrator must re-run it before dispatching any wave against the files this
scope names** (RES-A41-9, unchanged).

Two live siblings named in this pass's own brief were checked for and not
found: a test-notes artifact and a wave-plan artifact for A41, wherever
`loop-test-author` and `loop-plan` land them. `ls docs/a41-*.md` returns only
`a41-check.md` and this file. Per Ruling 70, this pass creates and edits
neither.

---

## 1. The exact collapse rule

### 1.1 The code path, re-verified this pass

| What | Address |
|---|---|
| `matchStudentFileConvention` | `src/lib/grade/utils.ts:87-107` |
| the four-part requirement | `:90` (`const parts = name.split("_")`) and `:95-97` (`if (parts.length < 4) return null`) |
| the non-empty check on both halves | `:102-104` |
| `identityFromConventionMatch` | `:112-119` - key is `studentPart.toLowerCase()` |
| `leafStemFallback` | `:121-126`, regex `/^([A-Za-z0-9]+)/` at `:123` against the extension-stripped stem |
| `parseSubmissionFileName`, six-step priority order | `:176-260` - step 1 `byRaw` `:188-198`, step 2 leaf convention `:200-208`, step 3 crossing chain innermost-first `:210-226`, step 4 `byBase` `:228-239`, step 5 innermost crossing stem `:241-251` (guarded by `zipChain.length > 0` at `:243`), step 6 `leafStemFallback` `:253-259` |
| `inferStudentPrefix` | `:269-278` - thin wrapper, returns `{key, display}` |
| `groupSubmissionsByStudent` | `:290-350`; the `Map` at `:301`, keyed at `:304-305` on `inferred.key`, merged at `:307-316` |
| the merge with no distinct-identity check | `:315` - `existing.files.push([filePath, content])`, reached from `:305`'s `grouped.get(inferred.key)` hit |

Line 305 to line 316 contains no comparison of the colliding files' contents,
paths, or any second identity signal. Read in one window this pass; there is no
disambiguation branch to miss.

Measured size: `@(Get-Content src/lib/grade/utils.ts).Count` = **393**, same as
round 1 - this file has not moved during either pass.

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
- **Digits do NOT terminate it.**
- **Case is folded, so `Essay.docx` and `essay.docx` collide.**

### 1.3 Executed, over realistic sets

Re-executed this pass through the copied `groupSubmissionsByStudent`, with
DISTINCT content per file so a merge cannot be excused as de-duplication.
Reproduced byte-identical to round 1's table (this pass's own
`headline.ts` run against the same fixture, section 0's instrument):

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
after the assignment - what a zip assembled by hand, or exported by a tool that
groups by folder rather than by filename, looks like. It produces ONE row
named `essay` holding three people's work. Row 4 supersedes A41's own
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

Re-executed this pass on row 4's set, reproducing round 1 exactly:

```
rows: 1
row.student: "essay"
row.mergedFileCount: 3
Files column would list: ["essay.docx","essay.docx","essay.docx"]
```

One model call grades three students' work as one submission, against one
rubric, and returns one score and one feedback body. The row's display string
is also the key the instructor's own edits and the CSV export are stored under -
`src/app/components/grading-results/gradingResultsHelpers.ts:287` seeds
`seeded[result.student]`, `:503` reads `edits[result.student]`, `:632` merges
`merged[student]` (all re-verified this pass, unchanged addresses). A collapse
is therefore not only a wrong grade; it is a wrong grade under a key that
cannot be split apart afterwards.

---

## 2. Every reachable path

### 2.1 The census, with its canary

```
$ grep -rn "groupSubmissionsByStudent" src/
```
returns **54** lines this pass (round 1 measured 56; round-1's own check
re-measured 54 too - a DRIFT from sibling edits between round 1 and its check,
not an error; this pass's number matches the check's). After removing
`*.test.ts` files and the barrel re-export (`src/lib/grade.ts:14`, unchanged
address this pass), the CALL sites are exactly two:

| # | Call site | `inferredLookup` argument | `zipParents` argument |
|---|---|---|---|
| 1 | `src/lib/grade/extraction.ts:138` (inside `extractStudentEntries`, `:134-139`) | literal **`undefined`** | threaded |
| 2 | `src/lib/grade/engine.ts:432` (inside `gradeSubmissions`, `:416-465`) | `inferredFileNameLookup` from `inferFileNameConvention` at `:431` | threaded |

Both addresses re-verified this pass and unmoved from round 1's check
(`grep -n "groupSubmissionsByStudent\|export async function gradeSubmissions\|inferFileNameConvention" src/lib/grade/engine.ts`;
`@(Get-Content src/lib/grade/engine.ts).Count` = 517).
`src/lib/grade/extraction.ts:138` re-verified unchanged
(`sed -n '138p' src/lib/grade/extraction.ts` returns
`groupSubmissionsByStudent(submissions, undefined, rawData, zipParents)`).

CANARY for that search: `grep -rn "export function groupSubmissionsByStudent" src/`
returns `src/lib/grade/utils.ts:290` and exits 0; `grep -rn
"groupSubmissionsByStudentZZZ" src/` exits 1, so an empty result from this
instrument is a real absence.

### 2.2 A41's row is wrong that there is only one call site, and the second one does NOT save the Gemini path

Unchanged from round 1 - confirmed sound by the check and re-spot-checked this
pass (`extraction.ts:83`, `:108`, `:111`; `rubric.ts:209-241`,
`parseInferredFileNameLookup` at `:131-201`).

A41's `instrument` field says "the real production call site,
`src/lib/grade/extraction.ts:138`, calls `groupSubmissionsByStudent(...)` with
`inferredLookup` hard-coded to `undefined` ... one call". That is correct about
that FILE and wrong generalised to the whole app: `engine.ts:432` is the Gemini
path and it DOES pass a lookup. This matters in the direction that makes the
defect worse, for three reasons:

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
   returns `undefined` from both. Re-executed this pass: driving the copied
   function with `{ byRaw: new Map(), byBase: new Map() }` over A41's two-file
   example returns **1 row**, the same as with `undefined`.
3. So the Gemini path is protected only when a model call succeeds AND returns
   parseable JSON AND names a distinct student for each file. **Every one of
   those is unverifiable in this environment** - no API keys, and
   `vitest.setup.ts` throws on real `fetch`. Treat the Gemini path as CARRYING
   the defect with a model-shaped mitigation in front of it, never as fixed.

### 2.3 The full reachable set, re-derived (this section is B1's fix)

Round 1's own table here was wrong on both the count of exposed callers and the
attendedness of the ones it did name. Re-derived from the tree, this pass.

`gradeAction` (declared `src/app/actions/grading.ts:707`) has **five**
production invocation sites, re-measured (`grep -rn "gradeAction(" src/ | grep
-v "\.test\."`, current tree):

| # | Caller | Sets `studentSubmissions`? | Sets `canvasUrl`? |
|---|---|---|---|
| A | `src/app/page.tsx:63` (`useActionState(gradeAction, ...)`), form in `GradingTab.tsx:296-324` | only when the "zip" source is chosen (the field the form itself renders) | only when the "Canvas URL" source is chosen |
| H | `src/lib/workflows/registry/steps.grading-cartridge.ts:108` | **yes**, unconditionally (`:88-92` builds `zipFile` from `takeResult.zipBase64`; `:94` sets `studentSubmissions`) | no |
| I1 | `src/lib/workflows/registry/steps.grading-run.ts:481` | **no** | **yes** (`:429-430`: `for (const row of plan) { if (row.offline) continue; }` - LMS rows only; `:462` sets `formData.set("canvasUrl", row.canvasUrl ?? "")`) |
| I2 | `src/lib/workflows/registry/steps.grading-run.ts:549` | **yes**, from `zips[0]` (`:420` builds `zips` from `values.submissionsZip`; `:526` `if (zips.length > 0)`; `:538` `formData.set("studentSubmissions", zips[0])`) | no |
| I3 | `src/lib/workflows/registry/steps.grading-draft-flow.ts:271` | **no** | **yes**, same pattern as I1 |

**Only THREE of the five reach the collapsing parser at all: A, H and I2.**
`gradeAction` opens with `if (canvasUrl) { ... }` at `:740`, and that whole
block returns before either zip branch (`:846`/`:853`) runs - re-verified this
pass by reading `:707-846` in one window. I1 and I3 set `canvasUrl` and never
set `studentSubmissions`, so they take the Canvas branch and never call
`extractStudentEntries` or `gradeSubmissions`. **Round 1's section 2.3 table
assigned I1 and I3 the branches "`embedded` -> `:854`; `gemini` -> `:907`" while
also stating, correctly, that the Canvas branch is "not exposed" - those two
statements could not both hold, and the corrected table above resolves the
contradiction by removing I1 and I3 from the exposed set entirely.**

Two branches of `gradeAction` do NOT reach this parser, unchanged from round 1:

- `provider === "other"` (`:846-849`) hands the base64 zip to
  `gradeZipViaEngine`, an external Deterministic Grading API; identity is
  decided outside this repo.
- The Canvas branch (`:763-819`, `gradeCanvasUrl`) and `canvasWorkToEntry`
  (`src/lib/grade/extraction.ts:166-300`) take identity from `work.student` -
  a Canvas API field, never a filename.

**Attendedness of the three exposed callers, reclassified from
`src/lib/workflows/headless.ts` rather than from "a workflow step exists" -**
this is the second half of B1's fix, and it also inverts round 1's conclusion:

| Exposed caller | Step type | Classification, and why |
|---|---|---|
| A, `page.tsx:63` | - | **Attended.** A browser form; no dispute. |
| H, `steps.grading-cartridge.ts:108` | `grade-cartridge-submissions` | **Genuinely unattended.** In `HEADLESS_SAFE_STEP_TYPES` (`headless.ts:84`). |
| I2, `steps.grading-run.ts:549` | `grade-submissions` (declared `steps.grading-run.ts:368`) | **Not headless-safe; a human interacts with this step.** In `ALWAYS_INTERACTIVE_STEP_TYPES` (`headless.ts:350`), whose own comment at `headless.ts:348-349` says why: "sets requireInput to review and approve grades before they post to the LMS." Its `submissionsZip` input is `type: "uploads"` (`steps.grading-run.ts:379-383`), and `headless.ts:356-358`'s comment for the sibling `extract-pptx-slides` step states the same input type "needs a live uploaded File ... only exists inside a browser upload widget and cannot be supplied by a schedule/trigger binding" - so I2 cannot be triggered by a schedule/trigger binding at all, whether or not a human is watching at the exact instant `gradeAction` runs. |

**So a confirmation gate is unavailable on exactly ONE of the three exposed
callers (H), not four of five as round 1 concluded.** Round 1's sentence at its
own `:299-301` - "there are FIVE callers not two, and FOUR of the five have no
human present at the moment of grading" - does not hold on either number.

**Why this correction matters less than it looks, and why it still had to be
made.** Under Ruling 69 (section 4.1), the chosen remedy is REFUSE, which is a
return value, not a dialog, and needs no human present on any caller - so the
corrected attendedness split does not change which remedy applies. It still had
to be fixed, because a wrong census that happens not to change today's decision
still teaches the next reader a wrong number, and RES-A41-5 (section 7.2) was
built entirely on the wrong split.

### 2.4 `single-file-entry.ts`: it AVOIDS the hazard, deliberately, and introduces no second one

Unchanged from round 1, re-verified this pass (`133` lines,
`@(Get-Content src/lib/grade/single-file-entry.ts).Count`).

- `studentLabelFromFileName` (`:57-63`) takes the **whole stem**, trimmed,
  falling back to the literal `Uploaded submission`. It does NOT call
  `leafStemFallback` and does not apply `/^([A-Za-z0-9]+)/`.
- Its own header comment (`:47-56`) names this defect as the reason: "their
  fallback (`leafStemFallback`) would name this student after the leading
  alphanumeric run of the stem - exactly the 'document' failure mode ...".
- `buildSingleFileEntry` returns at most ONE entry, wrapped in a one-element
  array by its caller `src/app/actions/grading.ts:892-903`. One entry cannot
  collapse with anything.
- Guarded: `src/lib/grade/single-file-entry.test.ts:71-73` asserts
  `buildSingleFileEntry("Jordan Lee - reflection.txt", ...)` yields student
  `"Jordan Lee - reflection"` - exactly the string `leafStemFallback` would
  have truncated to `Jordan`.

**Verdict: avoids it, and the avoidance is load-bearing rather than
incidental.** One caveat, not a new hazard but a boundary a remedy must
respect: a remedy that adds a refusal to the ZIP path must not be wired into
`classifyGradingUpload`'s `"single"` branch, or it will refuse a file that was
never at risk. The branch to guard is `grading.ts:905-910` (Gemini) and
`:853-878` (embedded), not `:892-903`.

### 2.5 An existing convention counter, and why reusing it as-is is a trap (M7 fix applied)

`src/lib/submission-archive-sniff.ts` already counts convention conformance
over zip entries: `countCanvasPattern` at `:97-102` with `const canvasPattern =
/_\d+_\d+_/` at `:98`, gated by a majority rule at `:176`
(`canvasCount > files.length / 2`). Its one production caller is
`src/app/components/CartridgeDropPanel.tsx:221`
(`grep -rn "sniffSubmissionArchive\|sniffEntries" src/ | grep -v "\.test\."`,
re-run this pass, unchanged). The main Upload ZIP surface does not sniff at
all.

**Round 1's own table compared the sniffer's raw REGEX against a citation-based
proxy for "the parser says conventional."** Re-executed this pass with the
real functions (`countCanvasPattern`'s own regex, and `citationFileName !==
getBaseFileName(name)` as the parser-conventional test, both imported from the
copied module):

| name | sniffer says Canvas | parser says conventional | |
|---|---|---|---|
| `janedoe_2024-01-01_120000_report.docx` | false | true | DISAGREE |
| `janedoe_20240101_120000_report.docx` | true | true | agree |
| `CS101_Fall_2026_submissions.zip` | false | true | DISAGREE |
| `my_essay_final_draft.docx` | false | true | DISAGREE |
| `Homework Final.docx` | false | false | agree |
| `smith_1001_0_report.docx` | true | true | agree |
| `a_b_c_d` | false | true | DISAGREE |
| `week_one_two_three.pdf` | false | true | DISAGREE |

**5 disagreements of 8, all in the SAME boolean direction (sniffer says
not-Canvas, parser's four-part check says conventional) - but M7's finding
survives because the direction of the BOOLEAN is not the direction of the
ARGUMENT.** Only row 1 is a genuine Canvas bulk-download name (the hyphenated
date `2024-01-01` in the real convention documented at `utils.ts:68-75`'s own
comment, and used by every fixture in `utils.test.ts`) that the sniffer wrongly
calls not-Canvas - a sniffer FALSE NEGATIVE on a real positive. Rows 3, 4, 7 and
8 are NOT genuine Canvas exports; they are ordinary titles (`CS101_Fall_2026...`,
`my_essay_final_draft...`, `a_b_c_d`, `week_one_two_three...`) that happen to
have four underscore-separated parts, so `matchStudentFileConvention`'s own
syntactic check (parts.length >= 4, both halves non-empty) fires on them - the
sniffer is arguably RIGHT to call these not-Canvas, and it is the PARSER's
four-part check that over-accepts. That over-acceptance is the A14 rulings'
known-open sanitized-name-collision item (`utils.ts:76-85`), which A41 does not
re-litigate.

**So exactly 1 of 8 supports the false-sentence risk this section exists to
warn about** - "a remedy that predicts the parser's behaviour by calling the
sniffer would tell the instructor their correct zip is malformed" - and it is
decisive on its own: a real Canvas export is exactly the zip a remedy must
never refuse or flag. The other 4 are a real but separate finding, recorded as
RES-A41-7 (section 7.2), not folded into this argument.

**What IS reusable, and it is the shape rather than the regex:**
`src/lib/submission-zip-intake.ts` (158 lines,
`@(Get-Content).Count`, re-verified this pass) is the precedent for a pure,
JSZip-free leaf (`decideZipIntake` at `:112`, `describeZipIntakeDecision` at
`:145`) that makes a refuse-or-accept DECISION over archive entries and has a
separate function for the sentence. `submission-archive-sniff.ts:358-378`'s
own comment (re-verified this pass, unmoved) states the division of labour
explicitly: this repo already has ONE JSZip-importing module and delegates the
decision to a pure leaf. A conformance decision for A41 belongs in a leaf of
that shape, computed from `parseSubmissionFileName` itself so it cannot drift
from the parser - never from a second regex.

---

## 3. What the instructor currently sees

**Every claim in this section is a READING CLAIM.** No component is rendered by
any test here, so none of it was observed on screen.

### 3.1 The statement of the requirement

Re-measured this pass, unchanged from round 1's own correction:

```
$ grep -rn "Upload a zip archive" src/
src/app/actions/grading.ts:895:        return { run: null, error: "Could not read that submission file. Upload a zip archive instead." };
src/app/components/GradingTab.tsx:322:              <p>Upload a zip archive of student submissions, or a single student&apos;s file (a document, text file, or image) to grade it on its own.</p>
```

CANARY: `grep -rn "zip archive" src/app/components/GradingTab.tsx` returns
`:322` and `:458` and exits 0; `grep -rn "Upload a zip archivZZZ" src/` exits 1.

The current sentence, `GradingTab.tsx:322` verbatim:

> Upload a zip archive of student submissions, or a single student's file (a
> document, text file, or image) to grade it on its own.

This is still the whole statement of the input requirement (verified against
the surrounding `:296-324` block - the `<input type="file">` at `:315-321` and
this one `<p>` are the entire field), and it still names no naming convention.

### 3.2 Is there anything at all that would let an instructor notice? (M1, M2, M3, m6 fixes applied)

Four candidate signals, each re-traced this pass.

| Candidate | Where | Verdict |
|---|---|---|
| A count of graded rows | nowhere on this surface | **ABSENT.** `grep -rn "results.length" src/app/components/*.tsx src/app/components/grading-results/*.tsx` returns **10** lines this pass (round 1 measured 11; a DRIFT the check already caught). Case-INSENSITIVE (`grep -rni`, fixing M3's case-sensitivity gap): **19** lines. The 9 extra are `gradableResults.length`/`postableResults.length` in `GradingResults.tsx` (`:306`, `:309`, `:313`, `:336`, `:342-343`, `:383`, `:403`, `:547`), including `:547`'s `` `Post ${gradableResults.length} grade(s) to Canvas` `` - a rendered count, on the results surface. **The conclusion still holds, but for a reason the case-sensitive instrument cannot see:** `canvasGradable` (`:306`) is `gradableResults.length > 0`, and `gradableResults` (`:300-303`) is `run.results.filter((r) => typeof r.userId === "number")` - a Canvas user id, which the zip path never has. So on the zip surface `gradableResults.length` is always 0 and that whole Post-grades section renders nothing. The one place a count IS rendered unconditionally is `DraftedGradesTab.tsx:646` (`` {results.length} student{...} ``), a different, later surface reached after drafts are saved. |
| `mergedFileCount` | computed at `utils.ts:346` for every row, carried in `StudentSubmissionEntry` | **COMPUTED AND NEVER RENDERED.** `grep -rn "mergedFileCount" src/ --include=*.tsx` exits 1. It is referenced in **49** `.ts` files (`grep -rln "mergedFileCount" src/ | wc -l`, re-run this pass; round 1 said 50, a one-file drift) and zero `.tsx` files - and that 49 includes the identifier's own definition site (`types.ts`) and its own test files, so it overstates "readers" (m6's fix): it is not a count of distinct consumers, just of files containing the string. The exact number that would expose a collapse is computed at the UI boundary and thrown away regardless. |
| The Files column | `src/app/components/grading-results/FilesCell.tsx:41`, mounted at `GradingResults.tsx:742` | **A READING CLAIM, not a fact, and this is M2's fix.** `FilesCell.tsx:40-46` maps `result.submittedFiles` directly into `<li>` elements, so IF it renders as written, the collapsed row would show three entries. But every `<li>` is keyed `` `${result.student}-file-name-${file.name}` `` (`:41`) - measured on the scope's own headline set (`row.student = "essay"`, `submittedFiles = ["essay.docx","essay.docx","essay.docx"]`), all three keys are the byte-identical string `essay-file-name-essay.docx`. React's own documented behaviour on duplicate keys is a console warning plus undefined reconciliation identity across re-renders and reorders - not necessarily a dropped element on a single first paint, but this environment cannot execute React reconciliation to settle which happens here (no jsdom, no rendered component, per section 0). And even if all three DO render, `utils.test.ts:336-351` (kept, section 6.2) pins the legitimate shape that looks IDENTICAL: one student's two dated resubmissions land in one row with `mergedFileCount` 2 and the SAME repeated-name Files list. **A multi-file row is normal, and this candidate cannot distinguish one student with three files from three students merged, whether or not it renders as written.** This claim and the duplicate key itself are both folded into RES-A41-6 below, not asserted as settled fact. |
| A warning or error | `GradingTab.tsx:262-266` (`state.error`), `:455-460` (empty state), `:502-511` (`state.warnings`) | **NONE FIRES TODAY, and M1's fix widens why.** `state.warnings` is populated at FOUR sites in `src/app/actions/grading.ts`, not one: `:693-699` (the `provider === "other"` Deterministic Grading API path - out of A41's scope, section 2.3), `:784` (Canvas discussion, `embedded`), `:804` (Canvas, `embedded`), `:875` (zip, `embedded`). **The Gemini zip branch (`:907`) populates none of the four** - its return at `:900-903`/`:907-912` carries no `warnings` field at all. So on the DEFAULT provider (`embedded`) a collapse would populate `warnings` only with rubric warnings (`builtRubric.warnings`, `:875`), not an ingestion warning about the collapse itself - nothing computes or writes an ingestion-collision warning today, on any provider. The empty state at `:455-460` fires only when `run.results.length === 0`; a collapse returns 1 or more rows, so it is never reached. `gradeAction` returns no error on a collapse: nothing in the path throws. |

**The answer to the crux question is: no.** The only thing distinguishing a
correctly-parsed roster from a collapsed one is a table shorter than the class,
and the app never states how long it should have been.

---

## 4. The remedy: REFUSE (Ruling 69), with the other two disposed of explicitly

Round 1 costed three options and chose none, escalating the choice as a fork
(round 1's section 4.5). The round-1 check (B4) found the fork's branches did
not span the remedy space and could not be answered safely as worded. The
orchestrator has since ruled:

> **RULING 69.** A41 REFUSES the run when the parse collides, with a counted,
> named reason. "Read the folders" (the parser-change option) is filed as a
> separate backlog row and is out of A41's scope. Reasons: refusal is the only
> branch that closes the harm on every measured shape and every caller; the
> cost of being wrong is a visible complaint one revert away, versus a wrong
> grade nobody sees.

This section now argues the chosen remedy, records the rejected alternative and
its reasons, and hands the deferred one to a separate row rather than costing
all three as open options.

### 4.0 The cost unit, re-verified this pass

`docs/a39-census.md` "Path A - Upload ZIP" counts path A at **COLD = 6, WARM =
4** countable acts (`:171-173`), per submission = 0. Path H is **WARM = 3**
(`:331-333`), per submission 0, waits 0, "the cheapest path in the app by every
measure this census can take." The census's rank table (`:579`) puts
re-pasting the rubric at "1 of the 4 warm interactions on path A (25%), 1 of 3
on path H (33%)" and ranks it the single most valuable removal. All three
citations re-opened this pass and unchanged from round 1.

### 4.1 CHOSEN: REFUSE the zip

**Mechanism.** A pure leaf over the zip's entry names, shaped like
`decideZipIntake` (`src/lib/submission-zip-intake.ts:112`), computing each
entry's key with `parseSubmissionFileName` itself and refusing when two or more
entries with distinct paths share a key.

**Cost.** Lowest of the three: 0 added acts on a good zip, and on a bad zip the
run does not start, so no model spend. Works identically on all three exposed
callers (A, H, I2 - section 2.3), because a refusal is a return value, not a
dialog - the existing `{ run: null, error }` shape at `grading.ts:823` is
already the return type every caller handles (H's own code at
`steps.grading-cartridge.ts` reads `gradeResult.error` and logs it; I2's at
`steps.grading-run.ts` does the same). **Attendedness is irrelevant to this
remedy** - unlike option 2 below, REFUSE needs no human present anywhere, which
is why B1's corrected caller census (section 2.3) changes this document's
accuracy but not its recommendation.

**A structural plus, found this pass and not anticipated by round 1's costing:**
the existing precedent return shape reaches the reader through `state.error`
(`GradingTab.tsx:262-266`), which - unlike `state.warnings` - is populated
identically regardless of provider, because it is the FIRST thing `gradeAction`
can return on any branch, before the `embedded`/`gemini` split. M1 found that a
disclosure routed through `warnings` is dead on the Gemini zip path by default;
a refusal computed once, ahead of both `extractStudentEntries` (`:854`) and
`gradeSubmissions` (`:907`), and returned through `error`, does not inherit
that gap. **Requirement, not mechanism:** whichever seat builds this must
compute the collision decision somewhere reachable from BOTH call sites - a
leaf wired into only one of them ships the other silently unrefused, the exact
shape M1 found already shipped once in this codebase's `warnings` channel.

**Failure mode, and it is the serious one.** A refusal is a hard stop with no
override: a zip that would have parsed correctly except for one stray file - a
`README.txt`, an instructor's `rubric.docx` - is refused wholesale, and the
instructor's only recourse is to re-export or rename by hand, outside the app.
This makes the app strictly WORSE than a chat window for the affected
instructor on exactly that input, which is the axis `docs/loop/leverage.md`
protects (section 8). The orchestrator's ruling weighs this against the
alternative's failure mode (4.2) and judges it the cheaper wrong-guess: a
blocked instructor complains and reverts; a wrongly-graded one usually never
finds out.

### 4.2 REJECTED: DISCLOSE and proceed

**Mechanism.** Compute the grouping before any model call, show the instructor
the student list and count, require a confirmation, then grade whatever they
confirm. `extraction.ts:134-139` already produces exactly this data,
deterministically, with no model call.

**Why rejected, stated rather than left open.** Under the CORRECTED caller
census (section 2.3), a confirmation gate is unavailable on exactly one of the
three exposed callers (H, the cartridge drop - genuinely unattended), not four
of five as round 1 believed. Even fully corrected, this option has a defect
REFUSE does not share: **it does not close the harm on the callers where it CAN
run.** An instructor who confirms without reading still gets the wrong grade -
the confirmation manufactures the appearance of verification while changing
nothing, which is the scope's own C2 (section 5) named as a trap before this
option existed as a candidate. REFUSE closes the harm unconditionally; DISCLOSE
closes it only if the reader actually reads. That asymmetry, not the corrected
caller count, is why Ruling 69 did not choose it.

**Cost, for the record.** +1 act on path A (4 -> 5 warm, +25%, the same weight
the census assigned to the single highest-ranked removal candidate) and on the
attended surface only; on H it would need its own non-interactive fallback,
which this remedy no longer needs to design because it was not chosen.

### 4.3 OUT OF SCOPE, FILED SEPARATELY: support the folder/simple convention

**Mechanism, for the receiving row.** Per-student folders become a first-class
identity signal - the directory prefix `getBaseFileName` (`utils.ts:34-38`)
currently discards - rather than being routed through a fallback built for a
different failure mode.

**Why this is A41's own founding example's remedy and still isn't A41's to
build.** It fixes the folder shape (section 1.3 row 4) with no gate and no
added clicks, but it does nothing for section 1.3 rows 2, 3, 6 and 8 (flat
zips, no folders) - including A41's own `Homework Final`/`Homework Draft`
example - so it is a partial fix that could be mistaken for a complete one,
which is exactly why RULING 69 keeps it separate rather than letting it stand
in for a remedy to the whole defect.

**The corrected revertibility finding (M4's fix).** Round 1 claimed "any change
to `parseSubmissionFileName`'s priority order alters identity for every past
run's re-render" - re-checked this pass, and nothing re-parses a stored run:
`grep -rn "parseSubmissionFileName\|inferStudentPrefix" src/ --include=*.ts
--include=*.tsx | grep -v "\.test\." | grep -v "grade/utils.ts"` returns
**4** hits this pass (round 1's check found 3; the fourth is
`src/lib/grade.ts:14`'s barrel re-export, a genuine code line, not a comment,
but one that re-exports the function without calling it) - the other three are
comments (`code-run-selection.ts:12`, `grade/prompts.ts:226`,
`grade/single-file-entry.ts:50`). A saved run carries its already-resolved
`student` strings; no re-render re-derives them. **The real mechanism is
different, and it is what makes this option genuinely harder to revert than
REFUSE:** a display-string change means a NEW run's rows no longer match edits
stored under the OLD strings, and `gradingResultsHelpers.ts:619-635`
(`loadPersistedEdits`) iterates the seeded CURRENT-run students and reads
`parsedRecord[student]` - a non-matching entry silently degrades to the seeded
fallback (its own comment at `:614-618` calls that drop deliberate). So a
revert does not restore old edits automatically; they are silently orphaned the
moment identity resolution changes, which REFUSE - identity resolution
untouched - never risks.

**It also touches the A14-binding priority order** (`utils.ts:142-175`, 28
pinned tests in `utils.test.ts`) and must not resurrect the withdrawn
`parts[1]` fold (A14 rulings v2 CORRECTION 2) or out-rank the crossing chain
(A14 ruling M2) - constraints for whoever scopes that row, not repeated here as
a requirement A41 owes.

**Disposition: filed as a separate backlog row (RES-A41-10), out of A41's
scope**, per Ruling 69.

### 4.4 Common to whichever remedy exists: `mergedFileCount`, unchanged

`mergedFileCount` is computed at `utils.ts:346` and rendered nowhere (section
3.2). Surfacing it is orthogonal to REFUSE, DISCLOSE, or the folder option -
costs **zero** added interactions and is the only change that improves the
instructor's ability to notice a collapse without changing identity resolution
or adding a gate. It is not a remedy - it does not prevent the wrong grade -
and must not stand in for one. RES-A41-3 (section 7.2), unchanged.

### 4.5 The fork (closed by Ruling 69)

Round 1's section 4.5 escalated a fork ("A41 produces either (X) a GATE ... or
(Y) a PARSER CHANGE ... Which?"). The round-1 check (B4) found the fork's
wording did not span the remedy space. Ruling 69 answers it: **X, and
specifically REFUSE within X.** There is nothing left to escalate here; section
4.1-4.3 above record the choice and its reasons rather than reopening the
question.

---

## 5. The copy rule, and the candidate sentence (B5 fix)

The governing rule is `docs/a31-rulings.md:18`, RULING 1: a user-facing sentence
may assert only what holds on EVERY caller and EVERY reachable state. This
codebase has shipped and corrected **five** false user-facing sentences; the
fifth is recorded at `docs/a32-build-rulings.md:19-36` (RULING 64). Four
constraints follow, unchanged from round 1 and re-verified sound by the check:

**C1. The sentence must be true on all three EXPOSED callers** (corrected from
round 1's "five callers, four of which nobody reads" per B1/section 2.3):
`page.tsx` (attended), `steps.grading-cartridge.ts:108` (unattended - its
return value is logged, not shown live), `steps.grading-run.ts:549` (a human
interacts with this step, but not necessarily at the instant grading runs). A
sentence must read as true whether shown live or read later in a log line.

**C2. A sentence that warns while the app proceeds is worse than silence.**
Moot for the CHOSEN remedy - REFUSE does not proceed - but still binds any
future disclosure sentence built on `mergedFileCount` (section 4.4, RES-A41-3):
if the app ever proceeds after showing something, the sentence must state a
FACT about what it did, never an instruction the app did not act on.

**C3. No sentence may assert a student count is authoritative.** In this app's
own vocabulary a submission is one student's work
(`src/app/components/GradingTab.tsx:322`'s own copy: "a zip archive of student
submissions"; the returned type is `StudentSubmissionEntry`). Wording must bind
to the observable (files, keys, rows), not to students.

**C4. The instrument must assert the EMITTED string, never the source text that
spells it.**

**Round 1's one candidate is withdrawn, not repaired - it was built for the
DISCLOSE remedy (option 2), which Ruling 69 did not choose, and it violated C3
and miscounted its own numerator besides** (`"Read 14 files and grouped them
into 9 submissions"` - "submissions" asserts a student count under a synonym,
and "Read 14 files" is not the entry count because
`src/lib/grade/extraction.ts:83` silently skips unsupported extensions and
`:108`/`:111` divert extraction failures into `failedSupportedFiles`, which
`extractStudentEntries` at `:137-138` destructures and discards - re-verified
this pass, both defects reproduce).

**One candidate for the CHOSEN remedy**, offered to the test author and
architect as a starting point, not settled copy, because REFUSE's own leaf does
not exist yet and C4 cannot be checked against emitted code that has not been
written:

> Two files - `essay.docx` and `essay.docx` - resolved to the same identity key
> ("essay") and were not graded. Give each student's file a distinct name (or a
> distinct folder plus a distinct name), then re-run.

Checked against C1-C4: **C1** - a bare fact plus a generic remedy, true
whether read live (A) or in a later log line (H, I2), since it does not assume
a screen is currently in front of anyone. **C2** - the run does not proceed, so
"were not graded" is literally true, not a manufactured appearance of caution.
**C3** - "two files" is a file count; "essay" is a key; no student count is
asserted. **C4** - cannot be verified against real emitted code in this pass,
because the refusal leaf is not built; this is explicitly a starting candidate,
not a frozen literal, and the test author's instrument must assert the EMITTED
string once the leaf exists, never this draft.

**A residual for whoever eventually builds RES-A41-3's `mergedFileCount`
surfacing (section 4.4):** the same entry-count trap B5 found (numerator is
"files that yielded extractable text," not "files in the zip") applies to any
future sentence built from `mergedFileCount`/`Object.keys(submissions).length`
too. Not this candidate's problem (it counts colliding files directly from the
collision leaf's own input, not from the whole-zip entry count), but worth
naming once so it is not rediscovered from scratch.

---

## 6. Could a test have caught it, and why the existing ones did not

### 6.1 What passes today

Re-run this pass, exit code read directly (never through a pipe):

```
$ npm run test:paths -- src/lib/grade/utils.test.ts src/lib/grade/extraction.test.ts src/lib/grade/single-file-entry.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts
COVERED src/lib/grade/utils.test.ts files=1 passed=28
COVERED src/lib/grade/extraction.test.ts files=1 passed=9
COVERED src/lib/grade/single-file-entry.test.ts files=1 passed=15
COVERED src/lib/grade/grouping-zip-parents.wiring.test.ts files=1 passed=7
Test Files  4 passed (4) / Tests  59 passed (59)
EXIT=0
```

59 tests, all green, with the defect fully live. Numbers unchanged from round
1 (this file set has not moved).

### 6.2 What they assert

`utils.test.ts` (**390** lines, `@(Get-Content).Count`, unchanged) has 28
tests. The grouping ones are one `describe` per A14 shape:

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
convention, and every positive-identity fixture in this file uses it.**
Re-verified this pass by reading all 390 lines: of the grouping fixtures, the
only key that reaches step 6 (`leafStemFallback`) with an empty chain and
nothing to collide with is `"src/otherfile.py"` at `:366`. **There is no
fixture anywhere in this file containing two or more distinct-content files
that both reach step 6.** The code path A41 describes is exercised by zero
grouping assertions.

### 6.4 The one general guard is a TAUTOLOGY, and the collapse SATISFIES it (RULING 71 applied - the 53.9% figure is withdrawn)

`:360-375` is the only test asserting a safety property rather than a specific
shape; its comment (`:354-359`) states the harm it means to prevent: two rows
that "look like duplicates of each other (or, worse, one silently overwrite the
other ... as `GradingResults.tsx` does)." Its assertion, `:373`:

```
expect(new Set(students).size).toBe(students.length);
```

`grouped` is a `Map` keyed on `inferred.key` (`utils.ts:301,304-305`), and
`inferred.key` is `display.toLowerCase()` at every return site of
`parseSubmissionFileName` (`:117`, `:125`, `:193`, `:234`). Distinct keys
therefore imply distinct lowercased displays, which imply distinct displays.
**The property is guaranteed by construction and the assertion cannot fail.**
Worse, the collapse makes it MORE true: fewer rows means fewer chances to
collide.

**Round 1 executed this over 20,000 sets and reported "53.9% of sets collapsed"
as the executed proof of harm. The round-1 check (B2) found that metric -
`rows < files` - fires on the app's own REQUIRED same-student multi-file merge
(`utils.test.ts:336-351`) just as readily as on a real cross-student collapse,
and the generator's stem list was undisclosed, so the number did not
reproduce. Per RULING 71, that figure is withdrawn rather than repaired in
place.** This revision replaces it with a fresh, published, reproducible
ground-truth run.

**The generator, in full** (`ground-truth.ts`, run against the scratchpad copy
of the real `groupSubmissionsByStudent` with `node --experimental-strip-types`):

```ts
import { groupSubmissionsByStudent } from "./utils.ts";

// Seeded LCG (numerical-recipes constants), published so this run reproduces.
let state = 20260927;
function rnd(): number {
  state = (Math.imul(1103515245, state) + 12345) >>> 0;
  return state / 4294967296;
}
function randInt(lo: number, hi: number): number {
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

// Published stem list - 15 realistic assignment-title stems.
const STEMS = [
  "essay", "homework", "assignment", "report", "reflection", "response",
  "worksheet", "lab", "project", "quiz", "draft", "summary", "analysis",
  "review", "outline",
];
const EXTENSIONS = [".docx", ".pdf", ".txt", ".py"];
// Published folder-name pool - distinct per true student, unrelated to the
// stem the student happens to pick.
const FOLDER_NAMES = [
  "AlvarezMaria", "BrownTom", "ChenLi", "DavisAnn", "EvansJoe", "FosterKim",
  "GarciaLuis", "HallSue", "IrwinBen", "JonesAmy", "KimSora", "LeeJordan",
  "MartinRoy", "NguyenPhi", "OwensJan",
];

function studentKey(i: number): string { return `student${i}`; }
type Shape = "control" | "folder";

function runHarness(shape: Shape, n: number) {
  let rowsLessThanFiles = 0;
  let trueCrossStudentCollapse = 0;
  let uniquenessFailures = 0;

  for (let s = 0; s < n; s++) {
    const numStudents = randInt(2, 4);
    const filesPerStudent: number[] = [];
    let totalFiles = 0;
    for (let k = 0; k < numStudents; k++) {
      const f = rnd() < 0.25 ? 2 : 1; // occasional same-student resubmission
      filesPerStudent.push(f);
      totalFiles += f;
    }
    if (totalFiles < 2 || totalFiles > 6) { s--; continue; }

    const submissions: Record<string, string> = {};
    const zipParents: Record<string, string[]> = {};

    for (let k = 0; k < numStudents; k++) {
      for (let f = 0; f < filesPerStudent[k]; f++) {
        const ext = EXTENSIONS[randInt(0, EXTENSIONS.length - 1)];
        const stem = STEMS[randInt(0, STEMS.length - 1)];
        let path: string;
        if (shape === "control") {
          const yyyymmdd = `2026${String(randInt(1, 12)).padStart(2, "0")}${String(randInt(1, 28)).padStart(2, "0")}`;
          const hhmmss = `${String(randInt(0, 23)).padStart(2, "0")}${String(randInt(0, 59)).padStart(2, "0")}${String(randInt(0, 59)).padStart(2, "0")}`;
          path = `${studentKey(k)}_${yyyymmdd}_${hhmmss}_${stem}${f > 0 ? `_v${f}` : ""}${ext}`;
        } else {
          const folder = FOLDER_NAMES[k % FOLDER_NAMES.length] + (f > 0 ? `_${f}` : "");
          path = `${folder}/${stem}${ext}`;
        }
        // Distinct content per file, tagged with the TRUE student id.
        submissions[path] = `STUDENT_${k}_FILE_${f}_MARKER_${s}_${path}`;
      }
    }

    const rows = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
    if (rows.length < totalFiles) rowsLessThanFiles++;

    // Ground truth read back out of the merged content itself, not by
    // reverse-mapping submittedFiles[].name (the parser's own possibly-
    // collided citation name).
    let crossStudentInThisSet = false;
    for (const row of rows) {
      const trueStudentsInRow = new Set<number>();
      const re = /STUDENT_(\d+)_FILE/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(row.content)) !== null) trueStudentsInRow.add(Number(m[1]));
      if (trueStudentsInRow.size > 1) crossStudentInThisSet = true;
    }
    if (crossStudentInThisSet) trueCrossStudentCollapse++;

    const students = rows.map((r) => r.student);
    if (new Set(students).size !== students.length) uniquenessFailures++;
  }

  console.log(`${shape.toUpperCase()} n=${n} rowsLessThanFiles=${rowsLessThanFiles} trueCrossStudentCollapse=${trueCrossStudentCollapse} uniquenessFailures=${uniquenessFailures}`);
}

runHarness("control", 20000);
runHarness("folder", 20000);
```

**Canaries, run before trusting the 20,000-set output** (same file, same
imports, small fixtures):

```
POSITIVE canary (two students, same stem "essay", different folders):
  rows: 1, distinct TRUE students merged into that one row: 2
NEGATIVE canary (two students, convention-conforming names):
  rows: 2 (no collapse) - the harness does not fire where there is none
```

**Executed output, this pass:**

```
CONTROL  n=20000  rowsLessThanFiles=11164 (55.8%)  trueCrossStudentCollapse=0 (0.0%)      uniquenessFailures=0
FOLDER   n=20000  rowsLessThanFiles=6221 (31.1%)    trueCrossStudentCollapse=5574 (27.9%)  uniquenessFailures=0
```

**Reading this correctly, per Ruling 71's requirement:** `rows < files` fires on
55.8% of CONTROL sets and 0% of them are a true cross-student collapse - every
one of those is the app's own required same-student multi-file merge, exactly
what B2 found wrong with the withdrawn metric. On the FOLDER shape, **27.9% of
sets contain a TRUE cross-student collapse** - a real defect, ground-truthed by
planting a distinct marker per true student and reading it back out of the
merged content, not inferred from the row count. `uniquenessFailures=0` across
both 20,000-set runs (40,000 total, zero failures) reproduces the tautology
finding above WITHOUT resting on the withdrawn number - the property utils.
test.ts:373 asserts cannot be made to fail by this generator either, consistent
with it being guaranteed by construction rather than merely untested. This
generator's own numbers (27.9%/0.0%) are not expected to match the round-1
check's own re-derived control numbers (35.9%/81.6%) - the stem lists, folder
names and per-set student counts differ by construction, and reproducibility
is about THIS run being re-runnable from the script above, not about two
independently-designed generators agreeing on a point estimate. Both agree on
the only claim that matters here: the withdrawn metric conflates a required
behaviour with the defect, and a ground-truthed metric does not.

### 6.5 What this scope requires of the test author (RULING 70 - not written here)

Per Ruling 70, the oracle, its fixture, and the anti-tautology/sabotage
protocol belong to `loop-test-author`, in their own artifact and their own
round - not in this document. What this scope's own analysis (6.1-6.4 above)
already fixes as a REQUIREMENT on that artifact, so it does not have to be
re-derived there: **(a)** the fixture cannot be a same-student multi-file merge
- `utils.test.ts:336-351` pins that shape to ONE row, so a cross-student
collision fixture is expressible only by planting distinct CONTENT per file in
a flat zip, never by name alone (section 6.3); **(b)** the oracle cannot be
`utils.test.ts:373`'s uniqueness-of-display-string property again - section
6.4's fresh 40,000-set run found zero ways to fail it, consistent with it being
guaranteed by the code's own construction, so strengthening it is not an
available disposal; **(c)** because Ruling 69 chose REFUSE with identity
resolution untouched, the object under comparison is NOT
`groupSubmissionsByStudent`'s row count - that stays exactly as collapsing as
it is today, by design - it is the NEW refusal leaf's decision (does it refuse,
and what counted, named reason does it report) over the same cross-student-by-
content fixture. This document does not write that oracle, its object of
comparison beyond what is stated here, or its sabotage/mutation protocol.

---

## 7. Wave plan and residual register

### 7.1 What this scope requires of the wave plan (RULING 70 - not written here)

Per Ruling 70, write sets and wave ordering belong to `loop-plan`, in its own
artifact and its own round - not here. What this scope's own analysis fixes as
a REQUIREMENT on that artifact:

- **The write set must reach BOTH of `gradeAction`'s two zip-reaching
  branches** - `src/app/actions/grading.ts:854` (embedded, calling
  `extractStudentEntries`) and `:907` (Gemini, calling `gradeSubmissions`) - or
  the collision decision ships live on one provider and dead on the other,
  which is exactly M1's finding about `state.warnings` being populated on some
  branches and not others (section 3.2, section 4.1). A wave that wires only
  one of the two is not a smaller working version of this fix; it is a fix
  that silently doesn't apply to the default provider on the default surface.
- **Every file the plan names must be checked against the 1000-line ceiling**
  (`src/file-size-ceiling.structure.test.ts:41`, `LIMIT = 1000`, re-verified
  this pass) **before** and after the wave, not assumed safe from today's size
  alone. Re-verified this pass, with the correct positive canary (m2's fix -
  round 1's own canary, "the same grep for `grading.tsZZZ` also exits 1,"
  proved nothing, since a nonsense string exiting 1 is not evidence the
  instrument can detect a real entry):
  ```
  $ grep -n "grading.ts\|GradingTab\|GradingResults\|grade/utils" src/file-size-ceiling.structure.test.ts
  exit=1   (no ALLOWED_OVERAGE entry for any of the four named files)
  $ grep -n "lms-generation.test.ts" src/file-size-ceiling.structure.test.ts
  :76      exit=0   (POSITIVE canary: the instrument DOES detect a real entry when one exists)
  ```
  `src/app/actions/grading.ts` is **941** lines this pass (unchanged from
  round 1's check) - 59 lines of headroom under the ceiling. Any addition
  larger than that needs an extraction first.
- **Gate every wave on `git status --short` against its own assignment**, plus
  a check that no `.claude/worktrees` copy was edited instead of the real tree
  (`docs/loop/this-repo.md` section 7). `npx tsc --noEmit` has exactly one
  caller in this repo's concurrency model and it is the wave gate.
- **RES-A41-9 (section 7.2) must be re-run immediately before dispatch, not
  read from this document** - the sibling file set changes hourly (section
  0.1).

This document does not decide whether the refusal is one new leaf or where
exactly it is called from beyond the two call sites named above; that shape
decision, the file list, and the wave order are the plan seat's own artifact.

### 7.2 Residual register

Each entry names an owner, an instrument, an object, a direction of failure and
a step. An entry missing any of those is a deletion, so none is written
without all five.

| id | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| RES-A41-1 | The collapse itself is unremedied by this document; only measured and, this revision, resolved to a chosen remedy (REFUSE) that a later chunk must still build. **Owner and tripwire corrected this revision (M5's fix) - see disposition note below.** | the chunk whose write set includes `src/lib/grade/utils.ts` or `src/app/actions/grading.ts` | T1 (per section 6.5's requirement, once the test author writes it): `npm run test:paths -- src/lib/grade/utils.test.ts` plus the new refusal leaf's own test | Returned refusal decision against a fixture of three distinct-content, cross-student files sharing a leading run. **RED when the leaf does not refuse.** | Wave 1 of whatever the plan seat lands, before any remedy wave, **no later than the next change to `groupSubmissionsByStudent` or `matchStudentFileConvention`** (restored from A41's own row text, dropped without note in round 1 - M5). |
| RES-A41-2 | The Gemini path's mitigation is a model call that degrades to the empty lookup on any failure (section 2.2), and no test drives that degradation. | the same chunk | a unit test over `parseInferredFileNameLookup` (`src/lib/grade/rubric.ts:131-201`) handing it unparseable output, plus the equivalent of round-1's T1 driven with `{byRaw: new Map(), byBase: new Map()}` | The returned lookup's entry count, and the row count under it. **RED when a degraded lookup produces a different outcome than `undefined` does.** | Whichever wave wires the Gemini call site (`grading.ts:907`). |
| RES-A41-3 | `mergedFileCount` is computed (`utils.ts:346`) and rendered by zero `.tsx` files. Orthogonal to the chosen remedy; must be disposed of explicitly, not by omission. | the architect pass consuming this scope | `grep -rn "mergedFileCount" src/ --include=*.tsx` | The count of `.tsx` files reading it. **Currently 0 (exit 1). FAILS as a residual the moment the architect pass closes without ruling on it.** | The architect pass, before the remedy wave. |
| RES-A41-4 | ~~The 4.5 fork.~~ **ANSWERED by RULING 69 (2026-09-27): REFUSE.** No longer a residual; recorded here only so a reader of round 1 does not go looking for an open question that no longer exists. | - | - | - | Discharged this revision. |
| RES-A41-5 | ~~Whether option 2's confirmation should block or bypass the four unattended callers.~~ **WITHDRAWN.** Option 2 (DISCLOSE) was not chosen (Ruling 69); REFUSE needs no human present on any caller, so this question does not arise. No enforcer (test) existed for this residual, so nothing is orphaned by withdrawing it. | - | - | - | Withdrawn this revision. |
| RES-A41-6 | Every claim in section 3 is a reading claim. `GradingTab.tsx:322` being visible rather than collapsed behind a control, and **whether the Files column actually renders three duplicate-keyed `<li>` elements or reconciles them away** (`FilesCell.tsx:41`'s `` `${result.student}-file-name-${file.name}` `` key, byte-identical across the headline set's three files - M2's addition), are both unverified. | the repo owner (browser check) - this environment renders no component | opening the Grading tab with a deliberately colliding zip, inspecting the DOM for the Files column's actual child count | What is on screen against section 3.2's table. **FAILS if a signal exists that section 3.2 says is absent, OR if the duplicate-keyed Files column renders fewer than 3 items where the parser returned 3** - in which case the remedy's urgency, not just its shape, is under-scoped. | Owner verification, any time; narrows the remedy's urgency but blocks nothing. |
| RES-A41-7 | `src/lib/submission-archive-sniff.ts:97-102`'s `/_\d+_\d+_/` disagrees with the parser on 5 of 8 measured names (section 2.5), but **only 1 of the 5 supports the "tells the instructor their correct zip is malformed" risk** (M7's fix); the other 4 are the parser's own known-open over-acceptance (A14). Unfixed here, and A41 does not own either half. | the next chunk whose write set includes `src/lib/submission-archive-sniff.ts` | the 8-case comparison in section 2.5, re-run | The two instruments' verdicts per name, split by direction. **RED when the sniffer reports not-Canvas for a name the parser resolves via the genuine convention branch on a real Canvas name** (today: row 1 of 8). | Whichever comes first: a remedy that wants to reuse the sniffer, or the next change to that file. Explicitly NOT a wave of A41. |
| RES-A41-8 | A41's own backlog-row text carries stale citations (section 9). Not corrected here - `docs/backlog.yml`/`docs/BACKLOG.md` are outside this pass's write set. | the orchestrator, at reconciliation | section 9, re-measured | The row's `instrument` and `note` fields against section 9. **FAILS if the row is closed while still asserting `GradingTab.tsx:240` and "one call site,"** which would teach the next session a wrong address and a wrong scale. | The push that reconciles A41. |
| RES-A41-9 | `src/lib/grade/engine.ts` and `src/app/actions/grading.ts` are named by this scope's requirements (section 7.1) and are the kind of file a concurrent chunk could be editing at dispatch time. Disjointness is not computed here - only a snapshot, already stale (section 0.1). | the orchestrator, before dispatching the remedy wave | `git status --short` plus the exact-path intersection (`sort \| uniq -d`) `docs/loop/parallel-disjointness.md` mandates, run against whatever the siblings land AT DISPATCH TIME | This scope's implied write set against the siblings' write sets. **RED on any non-empty intersection**; empty is the only pass. | Before dispatch, not at the wave gate - by then the collision has already happened. |
| RES-A41-10 | The folder/simple-convention remedy (section 4.3, round 1's option 3 / branch Y) is real, fixes A41's own founding example, and is explicitly out of A41's scope per Ruling 69. It is not yet a row in `docs/BACKLOG.md`. | the orchestrator, at this chunk's reconciliation | append a new row to `docs/BACKLOG.md` citing this scope's section 4.3 (mechanism, cost, the two failure modes: partial-fix-mistaken-for-complete, and the non-trivial revertibility via `loadPersistedEdits`'s silent fallback) | The new row's existence. **FAILS if this chunk closes without that row existing** - which would silently drop a real, filed-for finding exactly the way M5 found round 1 already almost did once. | This chunk's push. |

### 7.3 Disposition of prior requirements (M5's fix - re-derived by parsing, not memory)

A41's `note`/`instrument` fields, `RES-A39-4`, and round 1's own stated
requirements are all prior versions of this requirement set. Every item is
disposed of below; **counts re-derived by reading this table row by row against
both round 1's text and this revision's own changes**, not carried forward by
memory (round 1's own claim of "WITHDRAWN: none" was wrong by exactly the two
items marked WITHDRAWN below - M5).

| Prior requirement (source) | Disposition |
|---|---|
| Correct the census's `essay1/2/3` example (A41 `instrument`) | **KEPT**, re-executed independently this pass: section 1.3 row 1, 3 rows out, no collapse. |
| `Homework Final` / `Homework Draft` collapses to `homework` (A41 `instrument`) | **KEPT and confirmed**, section 1.3 row 2. Demoted from headline example in favour of row 4. |
| The fallthrough is reached in practice, not theory (A41 `instrument`) | **KEPT**, section 2.2. |
| The scope must name BOTH path A and path H or say why only one (A41 `note`) | **HANDED OVER, corrected.** Round 1 enlarged this to "all FIVE callers... four of five unattended" - itself wrong (B1). This revision's section 2.3 names three EXPOSED callers (A, H, I2) and corrects attendedness to one of three unattended. Receiver: the architect/plan pass. Obligation: build against the corrected census, not round 1's. |
| The remedy space is three options, none preferred (A41 `note`, round 1's own framing) | **SUPERSEDED by RULING 69.** One is chosen (REFUSE, section 4.1), one is rejected with reasons (DISCLOSE, section 4.2), one is filed separately (folder support, section 4.3, RES-A41-10). No longer "none preferred." |
| A user-facing sentence may assert only what holds everywhere (A41 `note`, citing A31 ruling 1) | **KEPT**, section 5, re-stated against the corrected three-caller census. |
| A disclosure must not claim a student count is authoritative while `inferredLookup` is unpopulated (A41 `note`) | **KEPT and sharpened** as C3, section 5. |
| The A14 sanitized-name collision (`utils.ts:76-85`) is NOT in scope (A41 `note`) | **KEPT as out of scope.** Also now the explanation for 4 of the 8 sniffer disagreements (section 2.5, M7). |
| RES-A39-4's instrument: a unit test over `groupSubmissionsByStudent` asserting entry count for three files sharing a leading run | **HANDED OVER, corrected.** Carried forward from round 1 as "T1"; this revision's B3/Ruling-69 fix changes what T1 must measure (the refusal leaf's decision, not the row count, since identity resolution is untouched by the chosen remedy - section 6.5). Receiver: `loop-test-author`. |
| RES-A39-4's direction of failure: RED when three distinct files collapse to fewer than three entries | **SUPERSEDED**, same reason as above - the row count is UNCHANGED BY DESIGN under REFUSE; see section 6.5. |
| "Whether the returned table's row count is what an instructor actually sees remains a reading claim" (A41 `note`) | **KEPT**, as RES-A41-6, with the duplicate-key finding (M2) added to its failure direction this revision. |
| The disposition table itself (round 1's own, this table's predecessor) | **WITHDRAWN, its "WITHDRAWN: none" line specifically.** Round 1's table asserted nothing was dropped while (a) silently narrowing RES-A41-1's owner from `GradingTab.tsx` to `grading.ts` with no note, and (b) silently dropping RES-A41-1's tripwire ("no later than the next change to `groupSubmissionsByStudent` or `matchStudentFileConvention`"). Both are restored/noted in RES-A41-1 above (M5). The owner narrowing itself is **KEPT** as correct in substance (`GradingTab.tsx` calls nothing this residual is about; `grading.ts` does), just no longer silent. |

---

## 8. Leverage

Not applicable and recorded rather than skipped. `docs/loop/seats.md`
("Acceptance criteria") rules that a bug fix makes no leverage claim; A41's
`kind` is `bug`. **Fired trigger: bug fix, no capability added.** Unchanged
from round 1. The relevant observation is the inverse one, and it belongs in
section 4.1's failure-mode argument rather than in a claim: a refusal makes the
app strictly worse than a chat window for the instructor it refuses, which is
the axis `docs/loop/leverage.md` protects - and it is exactly the cost the
orchestrator's ruling weighed against the alternative's cost in choosing REFUSE
anyway.

---

## 9. Corrections to A41's row, each re-measured this pass

Unchanged from round 1 - re-verified, still accurate, and the check's own
"confirmed sound" list (#7) already independently verified these once.

| A41 says | Measured 2026-09-27 | Severity |
|---|---|---|
| "`GradingTab.tsx:240` is the UI's entire statement of the input requirement... quoted verbatim" | The line has MOVED to `:322` and the TEXT HAS CHANGED (A39 wave 1 rewrote it to cover the single-file path). Re-verified this pass, unmoved since round 1's check. | **The citation is stale.** The substantive claim - no naming convention is named - still holds. |
| "the real production call site, `extraction.ts:138`... one call" - generalised to the only call site | There are TWO call sites (`engine.ts:432` also, passing a real lookup). And `gradeAction` has FIVE invocation sites, of which THREE reach this parser at all (section 2.3, this revision's own correction to a defect round 1's first draft introduced, not one in A41's original row text). | **Materially wrong about scale**, in the direction that makes the remedy space smaller than A41 assumed. The `extraction.ts:138` `undefined` claim itself is correct. |
| "this defect is shared by path A (Upload ZIP) and path H (cartridge drop)" | True as far as it goes. This revision's section 2.3 adds: of `gradeAction`'s five total invocation sites, only path A, path H, and ONE workflow site (`steps.grading-run.ts:549`) actually reach the collapsing parser; two others (`steps.grading-run.ts:481`, `steps.grading-draft-flow.ts:271`) route through the Canvas branch and never do. | **Correct but incomplete** - not itself corrected by this row, since A41's original text never claimed a specific total count; round 1's OWN elaboration of this point (not A41's) is what needed fixing, and section 2.3 above is that fix. |
| "the collapsing behaviour was additionally executed with `node -e` against the real regex and function logic COPIED VERBATIM from source" | Independently re-executed again this pass against the real file. Every collapse claim in A41 reproduces. | **No correction.** |

---

## 10. What I could not determine

- **Whether any model call actually populates `inferredLookup` in production.**
  No API keys in this checkout, and `vitest.setup.ts` throws on real `fetch`.
  Section 2.2's degradation analysis is read from the code; the RATE at which
  it degrades is unknowable here. Do not let a remedy rest on an assumed
  success rate.
- **What an instructor sees on screen**, including whether the Files column's
  duplicate-keyed `<li>` elements all render. Section 3 is entirely reading
  claims; RES-A41-6 routes both to owner verification.
- **Whether real instructors' zips take the folder shape.** Section 1.3 row 4
  is argued as plausible from the code's own blindness to directories, not
  measured against real uploads.
- **Whether a sixth caller of `gradeAction` exists outside `src/`. CLOSED this
  revision (m3's fix), not merely re-asked:**
  ```
  $ grep -rl "gradeAction" src/ docs/ memory/ | wc -l
  27   (round 1's check measured 26 - a one-file drift; docs/a41-check.md and
        docs/BACKLOG.md themselves mention the identifier, which inflates this
        count beyond production call sites - section 2.3's own `gradeAction(`
        grep, filtered to actual invocations, remains the authoritative one)
  $ grep -rl "gradeAction" public/ | wc -l
  0
  $ grep -rl "gradeAction" supabase/ | wc -l
  0
  $ ls -d */
  docs/  memory/  node_modules/  public/  src/  supabase/
  ```
  `public/` and `supabase/` are the only other top-level directories besides
  `node_modules/`, and both are empty of the identifier. **There is no sixth
  caller.**

### Gate run for this pass, exit codes read directly (never through a pipe)

```
$ npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
Test Files  2 passed (2) / Tests  21 passed (21)
EXIT=0
```

`git status --short` for this pass, and this document's own final line count,
are recorded in the `SubagentHandback` report for this pass rather than here,
because both describe state after this file was written and cannot be quoted
from inside it without being stale (unchanged practice from round 1, and the
direct fix for m1).

## Nothing further goes to the owner from this revision

Every blocker and major the check raised disposes within this revision (table
at the top). The two items the check itself classified as *rulings* (M6, the
4.5 fork) are both resolved by the orchestrator's own Rulings 69/70, not by
another round of this document. The one item classified *measurement* (B2) is
resolved by a fresh, published, reproducible generator (section 6.4), not by a
scope question. No fork, cost question, or design gap remains that this
revision found and could not close - **this is a statement, not a question**:
if the orchestrator or a future checker finds one this revision missed, that
finding goes through the normal round-2-then-ask path on ITS OWN merits, not
as an extension of this one.
