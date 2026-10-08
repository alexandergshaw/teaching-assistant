# RES-FILL-3 scope: student attribution across the two zip-ingestion compositions

Author seat: loop-seat (Sonnet). Consumer: the checker, then the test-notes seat
and the W1/W2 implementers. Measured at HEAD `08639c02`
(`git rev-parse --short HEAD`). Recon + consolidation plan + oracle design. No
production code and no test code is in this change; the only file written is
this one. No announcement, walkthrough or repo-grades file was read for edit or
touched; `git status --short src` was empty after every probe (see 7.4).

Every quantity below names its instrument. "PROBED" means produced by running the
real production functions in a scratch vitest harness that lives OUTSIDE the repo
tree (session scratchpad, not committed - so it is not openable by the
implementer; section 7.5 says what that means for W1).

---

## 0. Verdict, in the owner's terms

1. **The drift the row fears does not exist today, on the zip path.** Both
   compositions call the SAME attribution function, `groupSubmissionsByStudent`,
   with the SAME four arguments in the SAME order. Measured: across 14 fixtures,
   `gradeSubmissions(...).results[].student` (+ file set) equals
   `extractStudentEntries(zip, { inferFileNamesWith })` row for row on all 14 (and
   on a 15th, 2.4). The two compositions are textually near-identical copies of
   four steps; they CAN diverge (nothing ties them together) but do not.
2. **Three real, current differences exist, none an attribution drift** (section
   3.2): inference is unconditional in the engine and opt-in in extraction (on
   purpose, enforced); zero-entries is a throw in the engine and `[]` in
   extraction (so the engine's diagnostic message is the only copy and no test
   pins it); the engine loads its steps by dynamic import.
3. **The oracle the row asks for does not exist.** No test asserts
   `gradeSubmissions`'s `results[].student` against anything but a length
   (`grep -rn "gradeSubmissions(" src --include=*.test.ts` returns three call sites,
   `collisionRefusal.wiring.test.ts:90,103` and `rubric-stamp.wiring.test.ts:153`;
   the only result assertion is `expect(run.results).toHaveLength(3)` at
   `collisionRefusal.wiring.test.ts:105`, and `rubric-stamp.wiring.test.ts:153` runs
   with extraction mocked to an empty archive). So the item is NOT a no-op: it is
   a guard plus a small refactor.
4. **A finding outranks the item's premise (section 2.4, F15):** an attribution
   path to the WRONG student exists today, behind model inference, shared by both
   inference-enabled routes. If the model's filename inference covers only one of
   two foldered students who submitted the same filename, the other student's
   file is silently merged into the first student's row and graded under the first
   student's name. PROBED: `AlvarezMaria/essay.txt` + `BrownTom/essay.txt`, model
   names only the first as "Maria Alvarez" -> one row "Maria Alvarez" holding BOTH
   files. It is not drift (both routes do it); fixing it is an owner decision and
   is NOT in this item. The oracle freezes it as a labelled characterization row
   so a consolidation cannot change it unnoticed, and so the fix, when ruled, flips
   exactly one named row deliberately.
5. **Recommendation: two waves.** W1 = the frozen oracle (test-only, one new
   file), sabotage-proven against the CURRENT code. W2 = consolidate into one
   helper both callers use. W1 alone delivers the safety net; W2 is the structural
   fix and is small. One fork flagged in 5.4 (one line).

---

## 1. The two paths, located and read at HEAD

`gradeSubmissions` is at `src/lib/grade/engine.ts:392` (`grep -n "export async
function gradeSubmissions" src/lib/grade/engine.ts`). The backlog row cites
`engine.ts:365-423` (and `docs/a39-incremental-fill-architecture.md:1706` repeats
`:365`); at HEAD the declaration is at :392, so those citations are stale by +27
lines. `extractStudentEntries` is at `src/lib/grade/extraction.ts:154`.
File lengths (`wc -l`): engine.ts 514, extraction.ts 505.

| Step | gradeSubmissions (engine.ts) | extractStudentEntries (extraction.ts) |
|---|---|---|
| load | dynamic imports of `./extraction`, `./rubric`, `./utils`, `./collisionRefusal` at :399-402 | static imports at :19, :23, :24 |
| 1 extract | `extractSubmissions(zipBuffer)` :404-405, destructures `submissions, rawData, attemptedSupportedFiles, failedSupportedFiles, zipParents` | `extractSubmissions(zipBuffer)` :158, destructures `submissions, rawData, zipParents` |
| 2 refuse | `describeCollisionRefusal(decideCollisionRefusal(submissions, zipParents), zipParents)`, throw :411-414 | identical call, throw :167-170 |
| 3 infer | `inferFileNameConvention(Object.keys(submissions), provider)` :416-417, ALWAYS | same call :171-173, ONLY when `options.inferFileNamesWith` is set, else `undefined` |
| 4 group | `groupSubmissionsByStudent(submissions, inferredFileNameLookup, rawData, zipParents)` :418-423 | `groupSubmissionsByStudent(submissions, inferredLookup, rawData, zipParents)` :174 |
| 5 zero-entry policy | :424-440 - throws "Found supported files, but could not extract text..." (:429-431) when `attemptedSupportedFiles > 0`, else returns an empty stamped run | none: returns `[]` |
| 6 hand-off | `gradeStudentEntries(studentSubmissions, ...)` :442-449 | returns the entries |

The step-3 question is the only place the four-step order could matter for cost:
both paths refuse BEFORE inferring, so a colliding zip never pays a model call.
That ordering is enforced by executing tests, not by comment:
`collisionRefusal.wiring.test.ts:83-94` (gradeSubmissions, asserts
`mockCallLlm` not called) and `grading-incremental.test.ts:110-127`
(extractStudentEntries via `prepareGradingRunAction`, same assertion).

### 1.1 Where the student identity is derived (one place)

Both paths derive it in exactly one function chain, not in two:

- `parseSubmissionFileName` `src/lib/grade/utils.ts:289-400` - the six-step
  ladder: (1) `inferredLookup.byRaw` :313-322, (2) leaf convention :324-333,
  (3) zip-crossing chain, narrowest first :341-352, (4) `inferredLookup.byBase`
  :357-366, (5) innermost-crossing stem with folded directory :374-384, (6)
  leaf stem with folded directory :392-399. Emits `{ studentKey, studentDisplay }`.
- `inferStudentPrefix` :409-419 maps it to `{ key, display }`.
- `groupSubmissionsByStudent` :452-551 - groups by `key` :465-478, runs the
  terminal unique-label pass in KEY order :504-513 (`assignUnclaimedLabel`
  :433-441), sorts rows by `student.localeCompare` :520, emits `student`
  :544-549.

### 1.2 How that string becomes `results[].student`

`entry.student` is carried unchanged: destructured at `engine.ts:249`, passed to
`gradeSubmission` at :269 which returns `student: studentName` (:141), spread into
the result at :277-278; the not-attempted rows copy `entry.student` at :344 and
:357; the grading-failed row at :297; `buildUngradedRow` :191. `reconcileRun`
returns `{ ...result, rubricAreas, overallComment }` (`reconcile.ts:111`), so it
cannot change `student`. The model never re-attributes: `Student: ${studentName}`
is composed by the engine (:82) from the entry.

### 1.3 What that string keys downstream (correcting the row)

The row says `result.student` is "the React key and the persisted-edits key
(`gradingResultsEditsKey`)". Two corrections, both read:

- `gradingResultsEditsKey(canvasUrl, surface)` (`gradingResultsHelpers.ts:565-572`)
  does NOT contain the student. The student is the INNER key of the persisted map:
  `loadPersistedEdits` iterates `Object.entries(seeded)` and reads
  `parsedRecord[student]` (:643-644). A stored edit is therefore bound to a
  display string.
- The React key is `` `${result.student}-matrix` `` (`GradingResults.tsx:647`) and
  `` `${result.student}-${areaName}` `` (:780).

Consequence: two rows with the same display collapse onto one edits slot and one
React key, which is why the terminal label pass (`utils.ts:504-513`) is
load-bearing and why oracle row F5 (2.1) exists.

---

## 2. Is the drift risk real? Measured, not argued

### 2.1 No divergence in attribution under equal inference (PROBED)

14 fixtures (table in section 4), each driven through the real
`gradeSubmissions` (model seam mocked, real JSZip bytes) and the real
`extractStudentEntries(zip, { inferFileNamesWith: "gemini" })`. Result: students
and sorted file names equal on 14 of 14 (F10: both identical; the 15th, F15, in
2.4). The per-student model prompts also carried only that student's content
sentinels on every graded row. Instrument: scratch harness, output read from its
measurement file; the same fixtures are the oracle table below.

### 2.2 The concrete differences, each measured

| id | Difference | Measured | Attribution drift? |
|---|---|---|---|
| D1 | engine infers always; extraction infers only on opt-in | on the SAME zip, F2: `gradeSubmissions` -> "Ada Lovelace"/"Grace Hopper"; `extractStudentEntries(zip)` (no option) -> `code1, code2, essay1, essay2`. Same for F3, F10, F12 | YES in outcome, BY DESIGN: embedded provider (`grading.ts:859-860`) deliberately calls without the option. Backstop: `grep -c "inferFileNamesWith" src/app/actions/grading.ts` -> `0`. NOTE the backstop is a grep recorded in a comment (`extraction.ts:150-152`), not an executing test: no test asserts the call-site arguments (`grading.budget.test.ts:145` only counts calls) - residual R-6 |
| D2 | zero-entry policy only in the engine | broken `.docx`: `gradeSubmissions` THROWS "Found supported files, but could not extract text from them. Example files: broken.docx..."; `extractStudentEntries` -> `[]`. Unsupported-only and empty archives: engine -> `results: []`, extraction -> `[]`. Zero model calls in all three. The throw text is pinned by NO test (`grep -rn "could not extract text" src` -> only `engine.ts:430`) | no - but it is the engine-only step a naive consolidation silently drops |
| D3 | dynamic vs static module loading | engine.ts:399-402 vs extraction.ts:19,23,24; the dynamic `./extraction` edge is pinned by `runtime-import-graph.test.ts:671-681` (R-16 frozen trails) | no |

Every other step is textually identical. So the honest characterization is:
**two hand-maintained copies of one 4-step composition, currently in sync,
protected by no test that reads the engine's output.** The row's "more than two
compositions" understatement is also confirmed (2.3).

### 2.3 Other overlapping compositions (not attribution derivations; scoped out)

- `grading.ts:929-936` performs steps 1-2 a THIRD time (extract + refusal) before
  `gradeSubmissions` repeats them (`grading.ts:925-928` comment calls it the
  "duplicate parse"). It must stay inference-free (pre-spend), so it cannot call
  the W2 helper as-is. Residual R-2.
- `gradeCanvasUrl` (`engine.ts:473-514`) and `extractCanvasEntries`
  (`extraction.ts:182-194`) duplicate fetch -> `canvasWorkToEntry` loop ->
  `disambiguateCanvasEntries`, same shape of risk on the Canvas path. Residual R-1.
- `assignUnclaimedLabel` has THREE non-test call sites (`grep -n
  "assignUnclaimedLabel" src -r`, excluding tests): `utils.ts:510`,
  `extraction.ts:232`, `useContinuousGradingRun.ts:295` - the last is a
  client-side cross-event label on the chat surface only, so the same zip can
  attribute differently across surfaces for repeated names. No test file names
  `assignUnclaimedLabel` or `takenLabelsRef` (`grep -rln` over `*.test.ts` empty).
  Residual R-5.

### 2.4 F15, a wrong-student path that exists today (PROBED)

`parseSubmissionFileName` step 4 (`utils.ts:357-366`) resolves a file by
`byBase` - the lookup keyed on the raw name's BASE name, kept only when exactly
one inferred item has that base (`rubric.ts:188-195`). Two foldered students who
each submit `essay.txt` share a base name. If the model's reply covers only one of
them, the other file has no `byRaw` hit, falls to step 4, and takes the first
student's inferred name. The collision refusal cannot see it: it is computed WITHOUT
the inferred lookup (`collisionRefusal.ts:32-36`).

PROBED result (grade / extract-with-inference / extract-without):
`[{"s":"Maria Alvarez","f":["essay.txt","essay.txt"]}]` /
`["Maria Alvarez"]` / `["AlvarezMaria/essay","BrownTom/essay"]`. Both
inference-enabled routes do it; the deterministic route does not. This is the
precise failure the item was filed to prevent ("a grade recorded under the wrong
student") already live, behind the model. Owner decision, not this item
(R-4). F15 is frozen as a KNOWN-DEFECT characterization row.

---

## 3. Existing coverage, read (what the oracle must not duplicate)

| Test | Layer | What it pins | Gap relative to the item |
|---|---|---|---|
| `identityInvariants.test.ts` (A44; 107 passed in the gate below) | `groupSubmissionsByStudent` / `parseSubmissionFileName` directly, deterministic ladder (inferred lookup `undefined`, lines 500-531), 27 frozen fixtures + generated sweeps | keys, displays, SPLIT/MERGE, label uniqueness, key-order independence | never reaches either production composition; never the inference branches through the real model-JSON parse |
| `utils.test.ts` | unit, hand-built `byRaw`/`byBase` Maps (`:143-150`) | step precedence | hand-built lookups bypass `parseInferredFileNameLookup` and `normalizeStudentDisplay` |
| `extraction.inference.test.ts:94-113` | `extractStudentEntries`, ONE 4-file fixture | no-option baseline, option -> model names | engine side absent; no partial-inference, duplicate-name, nested, ordering or divergence rows |
| `extraction.test.ts:482-506` | `extractStudentEntries` real nested zip | two per-student zips -> two students | extraction side only |
| `collisionRefusal.wiring.test.ts:46-124` | both producers, refusal | refusal before spend; `toHaveLength(3)` | no student value asserted |
| `grouping-zip-parents.wiring.test.ts:138-148` | SOURCE TEXT of both files | `zipParents` destructured from `extractSubmissions` and forwarded on every `groupSubmissionsByStudent(` call | text, not behaviour; its engine half dies in W2 (section 6) |
| `rubric-stamp.wiring.test.ts:143-161` | `gradeSubmissions` empty branch, extraction MOCKED | rubric stamp on empty | mocks the very seam W2 changes (section 6) |

No existing test compares the output of the two paths against each other, so no
existing test becomes a tautology when they merge. The refactor-disarms-tests
risk instead applies to the NEW oracle: a test written as "gradeSubmissions
students equal extractStudentEntries students" would pass forever after W2 (one
function, compared to itself). The oracle below therefore compares EACH path to a
frozen literal, never one to the other.

---

## 4. The frozen oracle (the deliverable)

### 4.1 Instruments

All rows are driven through the real production functions over real JSZip bytes.
Mocked seams only: `@/lib/llm` `callLlm` (routed on prompt text - the inference
prompt contains "identifying filename naming conventions", `prompts.ts:286`; every
other prompt gets a valid grading JSON), `@/lib/gemini` limits (delay 0, a mutable
max-submissions, output tokens), `@/lib/code-runner` `runSubmittedCode` (null).
Never `fetch`. These are the same mock shapes `engine.test.ts:6-28` and
`collisionRefusal.wiring.test.ts:12-18` already use; both spread the real module
and override, which is what the scratch run did.

Per fixture, up to four assertion kinds. Each names the object compared, the
instrument producing each side, and the direction of failure:

- **P1** Object: ordered rows `{ student, sorted file names }` from
  `gradeSubmissions(...).results` vs frozen literal L. Instrument: real
  `gradeSubmissions`; literal hand-frozen in the test. Red if any student string,
  row count, row order or file set differs. Also `results[i].ungraded` is
  `undefined` for graded rows and `kind: "not-attempted"` where the literal says
  so (anti-vacuity: a run that grades nobody must not pass).
- **P2** Object: for each graded row, the set of content sentinel tokens
  (`S_...`, one unique token per fixture file, authored into the zip) found in the
  prompt sent to the model under `Student: <name>`, vs the literal's sentinel
  set. Instrument: `mockCallLlm.mock.calls` prompt text, student read by
  `/\n\nStudent: ([^\n]*)\n/` (the engine composes it at `engine.ts:82`). Red if
  any sentinel is absent from its student or present under another. This is the
  direct "grade recorded under the wrong student" instrument: it checks CONTENT
  against NAME, not name against name.
- **P3** Object: `extractStudentEntries(zip, { inferFileNamesWith: "gemini" })`
  rows vs the SAME literal L (not vs P1's output). Instrument: real function.
  Red on any difference.
- **P4** Object: `extractStudentEntries(zip)` (no option) student list vs the
  frozen deterministic literal N, and `mockCallLlm` not called. Instrument: real
  function plus the mock's call list. Red if names differ OR the model was called.
  This row freezes divergence D1 so a consolidation that always infers (or never
  does) goes red on the side it broke.
- **P5** (zero-entry rows, section 4.3) Object: `gradeSubmissions` outcome and
  `extractStudentEntries` return vs frozen literals, plus zero model calls.

File names inside a student are compared SORTED: insertion order of
`extractSubmissions`' `submissions` map is a product of `Promise.all` over async
reads (`extraction.ts:74-127`) and was not proven stable; the oracle must not pin
it (R-3).

### 4.2 Fixture table (every value PROBED unless marked)

`->` means "path -> content sentinel". Inference column is the model reply
(`items` of `[rawFileName, studentName, assignmentFileName]`); "none" = inference
call returns `{ ok: false }` (falls back, `rubric.ts:233-235`). Literals are
ordered as `results` come back (sorted by `localeCompare`, `utils.ts:520`).
Names are quoted exactly; whitespace-dirty model values are shown with their
spaces. Use `.txt` for anything not a nested zip's inner file (`.docx` routes
through a real Word parser, `collisionRefusal.wiring.test.ts:38-41`).

| id | Archive | Inference reply | L: rows (student: files; sentinels) | N: no-option students | Axis |
|---|---|---|---|---|---|
| F1 | `Ada Lovelace_2024-01-01_120000_essay.txt`->S_ADA_1, `Ada Lovelace_2024-01-01_120500_notes.txt`->S_ADA_2, `Grace Hopper_2024-01-02_130000_essay.txt`->S_GRACE_1, `Bo_2024-01-03_140000_essay.txt`->S_BO_1, `Adam_2024-01-03_140000_essay.txt`->S_ADAM_1 | none | `Ada Lovelace`: essay.txt,notes.txt; S_ADA_1,S_ADA_2 / `Adam`: essay.txt; S_ADAM_1 / `Bo`: essay.txt; S_BO_1 / `Grace Hopper`: essay.txt; S_GRACE_1 | (same as L; no inference needed) | convention names; ordering where key order differs from display order (keys `12:ada...,12:grace...,2:bo,4:adam` vs display `Ada Lovelace,Adam,Bo,Grace Hopper`) |
| F2 | `essay1-AdaL.txt`->S_ADA_1, `code1-AdaL.txt`->S_ADA_2, `essay2-GraceH.txt`->S_GRACE_1, `code2-GraceH.txt`->S_GRACE_2 | essay1-AdaL:`"  Ada   Lovelace "`/essay1.txt; code1-AdaL:`Ada Lovelace`/code1.txt; essay2-GraceH:`"Grace  Hopper"`/essay2.txt; code2-GraceH:`Grace Hopper`/code2.txt | `Ada Lovelace`: code1.txt,essay1.txt; S_ADA_1,S_ADA_2 / `Grace Hopper`: code2.txt,essay2.txt; S_GRACE_1,S_GRACE_2 | `code1,code2,essay1,essay2` | name-vs-username (token "AdaL" never becomes the name); whitespace normalisation; the item's own fixture |
| F3 | `essay1-AdaL.txt`->S_ADA_1, `code1-AdaL.txt`->S_ADA_2, `essay2-GraceH.txt`->S_GRACE_1 | essay1-AdaL:`Ada Lovelace`/essay1.txt; code1-AdaL:`"   "`/code1.txt (blank name) ; essay2-GraceH absent | `Ada Lovelace`: essay1.txt; S_ADA_1 / `code1`: code1-AdaL.txt; S_ADA_2 / `essay2`: essay2-GraceH.txt; S_GRACE_1 | `code1,essay1,essay2` | MISSING NAME: blank and absent inference fall back per file, so one student splits across two rows (frozen as-is) |
| F4 | same four files as F2 | none | `code1`: code1-AdaL.txt; S_ADA_2 / `code2`: code2-GraceH.txt; S_GRACE_2 / `essay1`: essay1-AdaL.txt; S_ADA_1 / `essay2`: essay2-GraceH.txt; S_GRACE_1 | (same as L) | inference unavailable: both paths degrade identically |
| F5 | `JaneDoe.zip` (nested; inner `src/deep.txt`->S_NESTED), `JaneDoe/src.txt`->S_FLAT | none | `JaneDoe/src`: deep.txt; S_NESTED / `JaneDoe/src (2)`: src.txt; S_FLAT | (same as L) | DUPLICATE DISPLAY across two distinct keys: the terminal label pass (`utils.ts:504-513`); which file gets "(2)" is decided by key order |
| F6 | `AlvarezMaria/essay.txt`->S_ALV, `BrownTom/essay.txt`->S_BRO, `ChenLi/essay.txt`->S_CHEN | none | `AlvarezMaria/essay`: essay.txt; S_ALV / `BrownTom/essay`: essay.txt; S_BRO / `ChenLi/essay`: essay.txt; S_CHEN | (same as L) | foldered students, shared filename (A44 shape, now through both producers) |
| F7 | `janedoe_2024-01-01_120000_project.zip` (inner `main.py`->S_JANE), `johndoe_2024-01-01_130000_project.zip` (inner `main.py`->S_JOHN) | none | `janedoe`: main.py; S_JANE / `johndoe`: main.py; S_JOHN | (same as L) | nested per-student zips with convention names: `zipParents` threaded end to end (step 3) |
| F8 | `bulk.zip` (inner `main.py`->S_B1), `bulk2.zip` (inner `main.py`->S_B2) | none | `bulk`: main.py; S_B1 / `bulk2`: main.py; S_B2 | (same as L) | nested zips, no convention: innermost-crossing stem (step 5) |
| F9 | `essay.txt`->S_ONLY | none | `essay`: essay.txt; S_ONLY | (same as L) | UNLINKED submission: no name signal at all, attributed to the filename stem (frozen as-is) |
| F10 | `essay1-AdaL.txt`->S_X, `code1-AdaM.txt`->S_Y | both mapped to `Ada Lovelace` (essay1.txt, code1.txt) | `Ada Lovelace`: code1.txt,essay1.txt; S_X,S_Y | `code1,essay1` | DUPLICATE NAME from the model: two distinct submitters merge, because the refusal ignores inference (R-4). Characterization row |
| F11 | `Ada Lovelace_..._essay.txt`->S_ADA_1, `Grace Hopper_..._essay.txt`->S_GRACE_1, `Bo_..._essay.txt`->S_BO_1 (dates as F1); engine max-submissions mocked to 2 | none | `Ada Lovelace` (graded; S_ADA_1) / `Bo` (graded; S_BO_1) / `Grace Hopper` (`ungraded.kind: "not-attempted"`, no prompt) | (same as L) | the not-attempted tail keeps attribution and order (`engine.ts:350-368`); `results.length === entries.length` |
| F12 | `Ada Lovelace_2024-01-01_120000_essay.txt`->S_ADA_1 | that raw name -> `Someone Else`/e.txt | `Someone Else`: e.txt; S_ADA_1 | `Ada Lovelace` | priority: model `byRaw` outranks a ground-truth convention match (documented intent, `utils.ts:259-262`). Characterization row |
| F13 | `essay1-AdaL.txt`->S_X, `code1-AdaL.txt`->S_Y | `Ada Lovelace`/e.txt and `ada lovelace`/c.txt | ONE row, student compared LOWER-CASED = `ada lovelace`: c.txt,e.txt; S_X,S_Y | - | case-fold merge of inferred names. RELAXED compare: the surviving display is first-seen and order-dependent (PROBED: `Ada Lovelace` for one key order, `ada lovelace` for the reverse, `probe3`; R-3), so assert count and lower-cased value only |
| F14 | `Ada_2024-01-01_1_e.txt`->S_X, `ada_2024-01-02_1_f.txt`->S_Y | none | ONE row, lower-cased `ada`: e.txt,f.txt; S_X,S_Y | - | case-fold merge of convention names; RELAXED as F13 |
| F15 | `AlvarezMaria/essay.txt`->S_ALV, `BrownTom/essay.txt`->S_BRO | only `AlvarezMaria/essay.txt` -> `Maria Alvarez`/essay.txt | KNOWN-DEFECT characterization: ONE row `Maria Alvarez`: essay.txt,essay.txt; S_ALV,S_BRO | `AlvarezMaria/essay,BrownTom/essay` | the wrong-student path of 2.4. Label the row `KNOWN-DEFECT (R-4)` in the test; its literal is to be flipped in the owner-ruled fix commit, not before |

F1-F14: PROBED together, 46 assertions green on unmutated HEAD code (F1-F14 give
3 assertions each = 42, plus the P4 row for F2, F3, F10, F12 = 4). F15: PROBED in
a separate run (grade, extract-with-inference and extract-without values as
quoted in 2.4); with P1/P2/P3/P4 it adds 4 assertions, which this probe did not
count in a combined run. Where W1's first in-repo run disagrees with any
literal here, STOP and report; do not edit the literal to fit.

### 4.3 Zero-entry rows (P5, PROBED)

| id | Archive | `gradeSubmissions` | `extractStudentEntries(zip)` | model calls |
|---|---|---|---|---|
| Z1 | `broken.docx` ("not a real docx") | rejects, message starts `Found supported files, but could not extract text from them. Example files: broken.docx.` | `[]` | 0 |
| Z2 | `notes.bin` only | resolves, `results: []` | `[]` | 0 |
| Z3 | empty archive | resolves, `results: []` | `[]` | 0 |

Z1 is the only pin the engine's diagnostic message will ever have; assert the
`could not extract text` prefix and `broken.docx`, not the full sentence (the
trap card: pin the fact, not the wording). If W2 moved the throw into the helper
this row would catch a changed or lost message.

### 4.4 Sabotage design (PROBED; each row must catch its mutant)

Method: the mutants were applied to import-rewritten COPIES of `engine.ts`,
`extraction.ts` and `utils.ts` in the scratch area (and, for normalisation, a
`vi.mock` wrapper over `@/lib/grade/prompts`), injected through `vi.mock` of the
real module ids. The repo tree was never mutated (7.4). The oracle in
assertion form (46 tests, F1-F14) was run once per mutant; "red" is the number of
the 46 that failed. Baseline (no mutant): 46 green.

| Mutant (the worst-mis-attribution it models) | Location mutated | Red | Which rows | Discrimination |
|---|---|---|---|---|
| M1 engine drops the inferred lookup (arg 2 -> `undefined`) | `engine.ts:418-423` | 10 | F2, F3, F10, F12, F13: P1+P2 only | engine side only; P3 stays green |
| M2 engine drops `zipParents` (arg 4) | `engine.ts:418-423` | 6 | F5, F7, F8: P1+P2 | engine side only |
| M3 extraction ignores the option (arg 2 -> `undefined`) | `extraction.ts:174` | 5 | F2, F3, F10, F12, F13: P3 only | extraction side only; P1/P2 stay green |
| M4 extraction ALWAYS infers (the consolidation worst case: a shared helper that hard-codes inference on) | `extraction.ts:171-173` | 4 | F2, F3, F10, F12: P4 only | killed ONLY by the no-option rows - the reason P4 exists |
| M5 identity from the WRONG FIELD (model's `assignmentFileName` as the student) | `utils.ts:317` | 15 | F2, F3, F10, F12, F13: P1+P2+P3 | both paths |
| M6 final `localeCompare` sort removed | `utils.ts:520` | 7 | F1, F6, F11: P1 + P3 (+P2 on F11) | both paths; F1 is chosen so key order differs from display order, so the sort is not redundant |
| M7 terminal unique-label pass dropped | `utils.ts:510` | 3 | F5: P1+P2+P3 | both paths; two rows share one display and one React key |
| M8 convention key not case-folded | `utils.ts:116` | 3 | F14: P1+P2+P3 | both paths |
| M9 inferred key not case-folded | `utils.ts:316` | 3 | F13: P1+P2+P3 | both paths |
| M10 `normalizeStudentDisplay` made identity | `prompts.ts:409` | 6 | F2, F3: P1+P2+P3 | both paths; dirty whitespace splits a student, a blank name becomes a student |

All ten were killed; none survived. Mutants deliberately NOT modelled: dropping
`rawData` (affects `rawBase64`, not attribution); swapping refusal and inference
(already killed by `collisionRefusal.wiring.test.ts:83-94` and
`grading-incremental.test.ts:110-127`, by reading - NOT mutated by me); step 4
`byBase` precedence (reached only by F15, which is a characterization row and
will go red under any change to it).

Sabotage-instrument caveat (Opus-seat practice 2): M6 on a fixture where key
order already equals display order would be a survivor from a BAD instrument, not
a coverage gap; F1 was built so it is not. Any W1 revision of F1 must keep
`12:ada lovelace` and `4:adam` and `2:bo` ordered differently from their displays.

---

## 5. Consolidation recommendation

### 5.1 Shape

ONE function in `extraction.ts`, composed of the existing four steps, returning
what the engine needs as well as the entries:

```
ingestZipEntries(zipBuffer, options?: { inferFileNamesWith?: LlmProvider })
  -> Promise<{ entries: StudentSubmissionEntry[];
               attemptedSupportedFiles: number;
               failedSupportedFiles: string[] }>
```

- `extractStudentEntries(zip, options)` becomes `(await ingestZipEntries(zip,
  options)).entries` - same signature, same default (no inference).
- `gradeSubmissions` calls `ingestZipEntries(zipBuffer, { inferFileNamesWith:
  provider })`, keeps its zero-entry policy (D2) in place using the returned
  counters, and hands `entries` to `gradeStudentEntries` unchanged.
- The helper holds the one copy of: extract, refuse-before-infer, infer-if-asked,
  group with `rawData` and `zipParents`. Disagreement on attribution becomes
  unrepresentable because there is one call to `groupSubmissionsByStudent` in
  either file's ingestion.
- Name `ingestZipEntries` is free (`grep -rn "ingestZipEntries\|ZipIngestion" src
  docs` returned nothing). Do NOT return a `GradingRun`: the provenance canary
  matches `): Promise<GradingRun> {` (`rubric-provenance-producers.structure.test.ts:52`)
  and would classify the helper as a new producer.
- Home is `extraction.ts`, not `utils.ts`: it already holds every import the
  helper needs (`inferFileNameConvention` :19, `groupSubmissionsByStudent` :23,
  `describeCollisionRefusal`/`decideCollisionRefusal` :24, types :20-21), so
  **no new import edge is added to any file**; `utils.ts` importing `./rubric`
  would create a cycle and change the module graph.

### 5.2 What does NOT change (and the oracle proves it)

- The attributed string: P1/P3 are the proof; the helper moves the same
  statements, not new logic.
- No persisted key or React key shape changes: no localStorage code is touched,
  `gradingResultsEditsKey` (`gradingResultsHelpers.ts:565`) is not in the write
  set, and `result.student` is byte-identical (P1). The only way a stored edit
  could move is a changed `student` string, which is exactly what the oracle
  freezes.
- Inference gating (D1): `grading.ts:860` still calls `extractStudentEntries(buffer)`
  with no option and stays deterministic; P4 pins it at the function.
- The engine's dynamic `./extraction` edge stays. A real cycle
  `extraction -> canvas -> ... -> grade.ts -> extraction` exists in this repo
  (`runtime-import-graph.test.ts:735-741`); I did NOT establish that the cycle is
  the reason the engine loads `./extraction` dynamically, so W2 must not convert
  it to a static import.

### 5.3 Files touched (W2) and size

| File | Change | Lines now (`wc -l`) | Estimated after |
|---|---|---|---|
| `src/lib/grade/extraction.ts` | add `ingestZipEntries`; `extractStudentEntries` wraps it | 505 | about 525-535 |
| `src/lib/grade/engine.ts` | `gradeSubmissions` calls the helper; drop dynamic imports of `./rubric`, `./utils`, `./collisionRefusal` inside it (engine still imports `./rubric` and `./utils` statically at :23, :25) | 514 | about 495-505 |
| `src/lib/grade/grouping-zip-parents.wiring.test.ts` | replace the engine half (section 6) | 148 | about the same |
| `src/lib/grade/rubric-stamp.wiring.test.ts` | change the `./extraction` mock shape (section 6) | read to :160 | about the same |

All far below the 1000-line wall (`src/file-size-ceiling.structure.test.ts`, and
none is in `ALLOWED_OVERAGE`). No new export from the `src/lib/grade.ts` barrel
(line 12 stays as is).

### 5.4 Forks, recommended reading acted on, one line each

- **Recommended (acted on in the plan):** helper returns the counters, engine
  keeps the zero-entry policy. Alternative B: have `gradeSubmissions` call
  `extractStudentEntries` directly - rejected: it drops the throw at
  `engine.ts:429-431`, which no test pins (D2), i.e. a silent behaviour change.
  Alternative C: stop after W1 (oracle only) - legitimate and cheaper; I recommend
  W2 because the structural fix is small and the oracle makes it safe, but W1 is
  the part with independent value. Reading A is mine, not an owner ruling.

---

## 6. Trip-wires W2 would hit, and the replacement for each (measured)

| Existing test | What breaks | Replacement (frozen, not a deletion) |
|---|---|---|
| `grouping-zip-parents.wiring.test.ts:144-147` (`ENGINE` must match `/groupSubmissionsByStudent\(/` and be wired) | RED: after W2 `engine.ts` has no such call. The extraction half (:139-142) stays green only if the helper keeps the destructure-from-`extractSubmissions` and forwards `zipParents` on every call | Replace the engine half with: `engine.ts` calls `ingestZipEntries(` and contains NO `groupSubmissionsByStudent(` call (so a re-introduced second composition goes red). Pin the fact (one call site owns grouping), not the spelling. The executing enforcer of `zipParents` threading becomes oracle rows F5/F7/F8 (M2 kills them) |
| `rubric-stamp.wiring.test.ts:49-57` mocks `./extraction` with `extractSubmissions` only; test :143-161 drives `gradeSubmissions`' empty branch | RED: `gradeSubmissions` would read `ingestZipEntries` from a mock module that does not define it (vitest throws on a missing mock export). The comment at :42-48 also goes stale | Mock `ingestZipEntries` resolving `{ entries: [], attemptedSupportedFiles: 0, failedSupportedFiles: [] }`; keep `canvasWorkToEntry`/`disambiguateCanvasEntries`. Assertions (:155-160) unchanged |
| `rubric-provenance-producers.structure.test.ts:79-125` | GREEN iff the helper does not return `GradingRun` (5.1) | none needed; `gradeSubmissions` keeps its id and `mixed` disposition |
| `runtime-import-graph.test.ts:671-681` (R-16 frozen trails) | GREEN iff no new import is added to `engine.ts` or `extraction.ts` (5.1). Removing the engine's `./collisionRefusal` edge removes no frozen trail (no trail in the list passes through it, and `./utils` is already a direct static edge with no trail) | MEASURE at W2: this test is in the gate list below |
| `collisionRefusal.wiring.test.ts`, `grading-incremental.test.ts:110-127`, `extraction.inference.test.ts` | GREEN: they drive real code and assert refuse-before-infer and the no-option baseline | none - these are existing executing enforcers the oracle relies on and must not duplicate |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` | reads every `docs/**/*.md`: a raw multi-path test command in a doc turns it red | this document uses only the wrapper form |

---

## 7. Wave plan, gates, sabotage

### 7.1 W1 - the frozen oracle (test-only; no production file)

- Write set (one new file): `src/lib/grade/ingestion-attribution.oracle.test.ts`
  (estimate 300-380 lines; wall is 1000). Legal "no caller" exception: it adds no
  export; stated so the wave gate does not read it as an escape.
- Content: the 15 fixtures of 4.2 + Z1-Z3, assertions P1-P5, the mock set of 4.1.
  No `readFileSync` of source, no import from another `*.test.ts` (duplicate
  helpers; trap card). Name the F15 row `KNOWN-DEFECT (R-4)`.
- Order (guard-before-migration): W1 lands and is sabotage-proven BEFORE W2 starts.
  W2 may not be dispatched on an unproven oracle.
- Sabotage gate: M1-M10 each applied, the named rows must go red and nothing else
  per the "Which rows" column, then restore GREEN. Restore from a `cp` backup, never
  `git checkout --` (memory: that reverts an uncommitted file to the index and
  destroys work). Tree-quiet requirement: in-place mutation of `engine.ts`,
  `extraction.ts` or `utils.ts` makes any sibling's full `npm test` run red for the
  window. If the orchestrator cannot guarantee a quiet window (an announcement wave
  is running concurrently), use the scratch-copy method of 4.4 - proven here with
  zero blast radius - and record which method was used.
- Gate (one `tsc` caller; `npm run lint` pass condition: exit 0 and no NEW warning
  in the new file, measured against the same command before the change):
  `npm run test:paths src/lib/grade/ingestion-attribution.oracle.test.ts
  src/lib/grade/extraction.inference.test.ts src/lib/grade/extraction.test.ts
  src/lib/grade/identityInvariants.test.ts src/lib/grade/utils.test.ts
  src/lib/grade/engine.test.ts src/lib/grade/engine.ungraded.test.ts
  src/lib/grade/collisionRefusal.wiring.test.ts
  src/lib/grade/grouping-zip-parents.wiring.test.ts
  src/lib/grade/rubric-stamp.wiring.test.ts
  src/lib/grade/rubric-provenance-producers.structure.test.ts
  src/lib/module-graph/runtime-import-graph.test.ts
  src/app/actions/grading-incremental.test.ts
  src/app/actions/grading-chat-intake.test.ts
  src/app/actions/grading.collisionRefusal.test.ts
  src/app/actions/grading.budget.test.ts src/app/actions/grading.guard.test.ts
  src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts
  src/lib/no-emojis.test.ts` - one path per argument; every argument must print
  `COVERED`. The pre-change baseline of everything except the new file is quoted
  in 7.3.

### 7.2 W2 - consolidate (after W1 is proven)

- Write set: the four files of 5.3. The caller of the new export is in the same
  wave: `engine.ts` (gradeSubmissions) and `extraction.ts` (extractStudentEntries).
- Pass condition: every oracle row unchanged and GREEN with NO literal edited
  (object: the 15 fixtures' literals; instrument: the W1 file run unmodified;
  failure: any edit to the W1 file in this wave's diff is a defect to be
  explained, since it would mean the consolidation changed attribution).
  `git diff --stat` for W2 must not list the W1 file.
- Re-sabotage after consolidation: M3/M4/M5/M6/M7/M10 equivalents applied to the
  ONE helper must now redden BOTH the P1/P2 and P3 rows (one function), and M4
  (always infer) must still redden P4. Measured separately before and after: the
  per-row discrimination in 4.4 is expected to collapse to "both sides" for the
  engine/extraction mutants, which is the point.
- Gate: the same `npm run test:paths` line as 7.1, plus `npx tsc --noEmit` (no
  output, one caller) and the lint rule above. `grep -n "groupSubmissionsByStudent("
  src/lib/grade/engine.ts` must return nothing; `grep -n "groupSubmissionsByStudent("
  src/lib/grade/extraction.ts` must return exactly one line.

### 7.3 Baseline of the gate list at HEAD (pre-change), measured

`npm run test:paths` over the 19 existing files (all of 7.1 except the new file),
run 2026-10-04 at `08639c02`: `Test Files  19 passed (19)`, `Tests  479 passed
(479)`. Wrapper lines:

```
COVERED src/lib/grade/extraction.inference.test.ts files=1 passed=3
COVERED src/lib/grade/extraction.test.ts files=1 passed=21
COVERED src/lib/grade/identityInvariants.test.ts files=1 passed=107
COVERED src/lib/grade/utils.test.ts files=1 passed=28
COVERED src/lib/grade/engine.test.ts files=1 passed=15
COVERED src/lib/grade/engine.ungraded.test.ts files=1 passed=20
COVERED src/lib/grade/collisionRefusal.wiring.test.ts files=1 passed=6
COVERED src/lib/grade/grouping-zip-parents.wiring.test.ts files=1 passed=7
COVERED src/lib/grade/rubric-stamp.wiring.test.ts files=1 passed=10
COVERED src/lib/grade/rubric-provenance-producers.structure.test.ts files=1 passed=2
COVERED src/lib/module-graph/runtime-import-graph.test.ts files=1 passed=177
COVERED src/app/actions/grading-incremental.test.ts files=1 passed=13
COVERED src/app/actions/grading-chat-intake.test.ts files=1 passed=15
COVERED src/app/actions/grading.collisionRefusal.test.ts files=1 passed=4
COVERED src/app/actions/grading.budget.test.ts files=1 passed=5
COVERED src/app/actions/grading.guard.test.ts files=1 passed=22
COVERED src/file-size-ceiling.structure.test.ts files=1 passed=3
COVERED src/source-bytes.structure.test.ts files=1 passed=3
COVERED src/lib/no-emojis.test.ts files=1 passed=18
```

(`src/tools/vitest-paths/gate-commands.structure.test.ts` was not in that run; see
8 for this document's own gate.)

### 7.4 What I did to the tree

Nothing under `src/`. `git status --short src` after all probes: empty. The
mutants and the probes ran from the session scratchpad through a scratch vitest
config (root = repo, `test.dir` = scratchpad, aliases to the repo's `@`,
`jszip`, `vitest`, `server-only`), so no file was added to or edited in the repo
except this document. `git worktree list` shows the second worktree
`.claude/worktrees/friendly-meninsky-8032bc` at `8bc9c649`; nothing was read from
or edited there.

### 7.5 What the scratchpad probe means for the implementer

The probe files are not committed and the implementer cannot open them. Section
4.2 therefore carries every fixture in full (paths, sentinels, inference replies,
literals). W1's own first run is the confirmation; the sabotage table in 4.4 is
re-derivable from the file layout of 4.4's "Location mutated" column and the
method sentence, but W1 must re-measure its own kill counts rather than quote
mine.

---

## 8. Not determined here, and gates for this document

Not determined (stated rather than filled in):

- Whether `extractSubmissions`' `submissions` insertion order is actually
  nondeterministic across runs. PROBED only the downstream fact: for a
  case-variant merge the surviving display is the first-seen one in map order.
  Whether real archives reorder is unmeasured (R-3).
- Real Gemini behaviour for filename inference. Every inference reply here is a
  hand-authored mock; no key exists in this environment.
- `npm run lint` and `npx tsc --noEmit`: not run (no source change).
- Any UI claim (React key collision rendering, edit restore): reading only; no
  component is rendered by any test here.
- In-place sabotage of the production files: not executed by me, deliberately,
  because an announcement wave is running concurrently (7.1 caveat).

This document's own gates: `src/lib/no-emojis.test.ts` scans `docs/`;
`src/source-bytes.structure.test.ts` requires text-only bytes;
`gate-commands.structure.test.ts` (S8) forbids raw multi-path test commands in
`docs/**/*.md`. Run with `npm run test:paths` over those three paths after this
file was written (a later edit changed two sentences, not any command):
`Test Files  3 passed (3)`, `Tests  49 passed (49)`; `COVERED
src/lib/no-emojis.test.ts files=1 passed=18`, `COVERED
src/source-bytes.structure.test.ts files=1 passed=3`, `COVERED
src/tools/vitest-paths/gate-commands.structure.test.ts files=1 passed=28`.

---

## 9. Disposition (no prior version was restructured)

This is a first scope for the item. What changed relative to the backlog row
(`docs/backlog.yml:931-942`), so the row's owner can reconcile it:

| Row claim | Disposition |
|---|---|
| "engine.ts:365-423" | kept as intent, line numbers corrected to `engine.ts:392-450` |
| "result.student is the React key and the persisted-edits key (gradingResultsEditsKey)" | corrected: student is the inner key of the persisted map (`gradingResultsHelpers.ts:643-644`) and the React key (`GradingResults.tsx:647`); `gradingResultsEditsKey` carries no student (1.3) |
| "the two independently compose the same four steps" | confirmed, with three measured differences (D1-D3) |
| "INSTRUMENT: frozen-literal oracle over results[].student for a zip whose filenames need inference, captured BEFORE any consolidation" | kept and widened: 15 fixtures + 3 zero-entry rows, five assertion kinds, ten sabotaged mutants (section 4) |
| "OWNER: the chunk that next owns engine.ts" | kept: W2 is that chunk; W1 owns one new test file |
| "STEP: after the A39 fill ships" | precondition met per `docs/backlog-unscoped-triage.md:92` (fill waves 1-6 shipped); not re-verified by me against the A39 row |

Suggested `owns` for the row when it is scoped (orchestrator's edit, not mine:
`docs/backlog.yml` is not in my write set): W1 `src/lib/grade/ingestion-attribution.oracle.test.ts`;
W2 `src/lib/grade/extraction.ts`, `src/lib/grade/engine.ts`,
`src/lib/grade/grouping-zip-parents.wiring.test.ts`,
`src/lib/grade/rubric-stamp.wiring.test.ts`. None of these is an announcement,
walkthrough or repo-grades file.

## 10. Residual register

Each entry has an owner, an instrument and the step that will measure it.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-1 | Canvas pair `gradeCanvasUrl` (`engine.ts:473-514`) / `extractCanvasEntries` (`extraction.ts:182-194`) duplicate fetch -> `canvasWorkToEntry` -> `disambiguateCanvasEntries`; no attribution oracle over either | main session: file a backlog row at W2's push | the same frozen-literal design with `../canvas` mocked (pattern: `rubric-stamp.wiring.test.ts:62-65`), one row per `student`/`userId` pairing | after W2 lands |
| R-2 | `grading.ts:929-936` is a third copy of steps 1-2, and the whole-run path parses the zip twice (`grading.ts:925-928`) | the chunk that next owns `src/app/actions/grading.ts` | existing `grading.collisionRefusal.test.ts` (4 passed in 7.3) keeps the refusal executing; a W3 would add a wiring check that the pre-spend refusal and the helper share one predicate | when the double-parse is removed |
| R-3 | merged-group display is first-seen and order-dependent (PROBED, F13/F14 rows relaxed); whether `Promise.all` in `extraction.ts:74-127` ever reorders is unmeasured | owner decision on the display rule, then the chunk next owning `utils.ts` | a probe that shuffles `submissions` key order for F13/F14 inputs and compares displays; today only the lower-cased value is pinned | before any change to display selection |
| R-4 | model-inferred names bypass the collision refusal: F10 (two submitters merge on a duplicate name) and F15 (a foldered student merged into another by step-4 `byBase`) grade under the wrong name | OWNER (product): refuse, warn, or require full inference coverage | F10 and F15 rows are red the moment behaviour changes; the fix commit flips exactly those two literals | an owner ruling; not this item |
| R-5 | `useContinuousGradingRun.ts:295` is a third, client-side attribution layer (cross-event labels); no test names `assignUnclaimedLabel` or `takenLabelsRef` | the chunk next owning `useContinuousGradingRun.ts` | a behavioural test of the hook's label step, or extraction of it to a `.ts` leaf (no component is rendered here) | next change to that hook |
| R-6 | "embedded path stays inference-free" (`grading.ts:860`) is enforced by a grep in a comment (`extraction.ts:150-152`), not an executing test; `grading.budget.test.ts:145` only counts calls | the chunk next owning `grading.ts`, or W1's author if the owner wants it now | a call-site assertion: `extractStudentEntries` called with exactly one argument at `grading.ts:860` (mock `toHaveBeenCalledWith` on one arg) | before the next edit to `grading.ts` |
| R-7 | W1's sabotage proof is by scratch copies (this document) until W1 re-proves in place or by the same method; the claim "10 of 10 killed" is MINE and unreproduced by anyone else | the W1 implementer, checked by the verify seat | re-run of M1-M10 with recorded red counts per mutant | W1's sabotage gate |
