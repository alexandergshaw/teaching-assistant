# RES-FILL-3 W1 test notes: the frozen attribution ORACLE

Test-author seat (loop-test-author, Opus). Consumer: the checker, then the W1
implementer. Built from the SHIP-checked scope `docs/res-fill-3-scope.md` and
re-grounded against the tree at HEAD `4f84f4dd` (`git rev-parse --short HEAD`).
The scope was authored at `08639c02`; between that commit and `4f84f4dd` the
concurrent announcement wave advanced HEAD, but the three grading-ingestion
source files are byte-stable (`wc -l`: `extraction.ts` 505, `engine.ts` 514,
unchanged from the scope's 5.3 table), and every `file:line` the scope cites
re-resolved here (grounding table in section 1). Disjointness from the
announcement wave therefore holds: this wave touches only grading-ingestion
files.

## What W1 is, and what it is NOT

W1 produces **one new test file**, `src/lib/grade/ingestion-attribution.oracle.test.ts`,
and nothing else. No production code. No edit to any existing test. No
announcement, walkthrough or repo-grades file is read for edit or touched.

W1 is the **guard-before-migration oracle**: it freezes the student-attribution
output of BOTH ingestion paths - `gradeSubmissions` (`engine.ts:392`) and
`extractStudentEntries` (`extraction.ts:154`) - against **frozen literals hand-
written into the test**. It is GREEN at HEAD because it characterizes the
CURRENT behaviour, known defects included. W2 (the `ingestZipEntries`
consolidation) is a LATER wave; W2 must not edit a single W1 literal, and the
oracle is the net that proves W2 did not move attribution.

**The one rule that makes this oracle not a tautology:** each path is compared
to a frozen literal, NEVER one path to the other. After W2 merges the two
compositions into one helper, a "`gradeSubmissions` students equal
`extractStudentEntries` students" assertion would compare one function to itself
and pass forever (the refactor-disarms-tests trap, `traps-tests.md:35-40`;
memory `refactor-disarms-tests`). Section 9 below executes that attack against
this instrument to prove the literal-oracle form survives it and the path-vs-
path form does not.

**Nothing renders under vitest.** vitest here is node-env and collects only
`src/**/*.test.ts`; this is pure-function oracle testing over real JSZip bytes
with the model seam mocked. Every assertion in these notes is executable. The
argued-only claims are quarantined in section 11.

---

## 1. Grounding: every scope `file:line` re-verified at HEAD `4f84f4dd`

Opened and confirmed (the loop rule: measure, do not recall; open every
`file:line` you cite):

| Fact | Address at HEAD | Confirmed reads |
|---|---|---|
| `gradeSubmissions` declared | `engine.ts:392` | `export async function gradeSubmissions(` |
| engine compose: extract / refuse / infer / group | `engine.ts:404-405 / 411-414 / 416-417 / 418-423` | all four steps present, in that order |
| engine zero-entry policy (D2 throw + empty-run return) | `engine.ts:424-440` | throw `Found supported files, but could not extract text...` at `:429-431`; empty stamped run at `:434-439` |
| `extractStudentEntries` declared | `extraction.ts:154` | `export async function extractStudentEntries(` |
| extraction compose `:158-174` | refuse `:167-170`, infer-if-asked `:171-173`, group `:174` | opt-in ternary at `:171-173` |
| `groupSubmissionsByStudent` | `utils.ts:452-551` | groups by key `:465-478`; terminal label pass `:504-513`; `localeCompare` sort `:520`; emits `student` `:544-549` |
| `parseSubmissionFileName` six-step ladder | `utils.ts:289-400` | byRaw `:313-322`, leaf conv `:324-333`, crossing chain `:341-352`, byBase `:357-366`, innermost stem `:374-384`, leaf stem `:392-399` |
| `inferStudentPrefix` | `utils.ts:409-419` | maps parsed to `{key, display}` |
| byBase step (F15 mechanism) | `utils.ts:357-366` | `inferredLookup?.byBase.get(baseName)` |
| D1: engine infers unconditionally | `engine.ts:416-417` | `inferFileNameConvention(rawFileNames, provider)`, no guard |
| D1: extraction infers opt-in | `extraction.ts:171-173` | `options?.inferFileNamesWith ? ... : undefined` |
| carry-through unchanged; `reconcile` cannot change `student` | `reconcile.ts:111` | `return { ...result, rubricAreas: reconciled, overallComment }` - no `student` key |
| engine composes `Student: <name>` (P2 instrument source) | `engine.ts:82` | `...\n\nStudent: ${studentName}${fileListBlock}\n\nSubmission:...` |
| inference prompt sentinel (routes the `callLlm` mock) | `prompts.ts:286` | `You are identifying filename naming conventions for student submissions.` |
| `normalizeStudentDisplay` (M10 target) | `prompts.ts:409` | `value.trim().replace(/\s+/g, " ")` |
| convention key case-fold (M8 target) | `utils.ts:116` | `studentKey: match.studentPart.toLowerCase()` |
| inferred key case-fold (M9 target) | `utils.ts:316` | `a44Encode([rawInferred.studentDisplay.toLowerCase()])` |
| wrong-field source (M5 target) | `utils.ts:317` | `studentDisplay: rawInferred.studentDisplay` |
| `assignUnclaimedLabel` call (M7 target) | `utils.ts:510` | `assignUnclaimedLabel(group.student, takenLabels)` |

**P2 instrument soundness (verified, not assumed).** Every graded fixture uses
files whose base names contain `.` (`essay.txt`, `code1.txt`, `main.py`, ...),
so `buildSubmittedFileNamesBlock` (`prompts.ts:270-283`) returns a block that
begins with `\n\n`. The engine composes `Student: ${studentName}` immediately
followed by that block (`engine.ts:82`), so a `\n` always sits right after the
name. The extractor `/\n\nStudent: ([^\n]*)\n/` therefore captures exactly the
normalized display and stops at that newline. A display never contains a
newline because `normalizeStudentDisplay` collapses all whitespace runs to a
single space (`prompts.ts:409`). The P2 instrument is sound for every fixture
here; a fixture whose files had extensionless names would break it, and this
oracle has none.

---

## 2. The one BLOCKER from the scope check, applied in these notes

The scope labels ONLY F15 as `KNOWN-DEFECT (R-4)`. F10 is the SAME defect class
and the scope tagged it merely "Characterization row" - the identical tag it
gave F12, which is INTENDED behaviour. This conflation is corrected here, per
the checker's ruling (applied in-notes, no new scope round):

- **F10 and F15 both carry the label `KNOWN-DEFECT (R-4)`, identically.** Both
  are the wrong-student-merge class the item was filed to prevent: two
  **distinct submitters** collapse into one row under a single model-inferred
  name, both inference-enabled routes do it, and both slip past the collision
  refusal because the refusal is computed WITHOUT the inferred lookup
  (`collisionRefusal.ts:32-36`, read via the scope 2.4). F10's mechanism is a
  model `byRaw` reply that maps two different usernames to one display
  (`utils.ts:313-322`); F15's is step-4 `byBase` (`utils.ts:357-366`) inheriting
  the one inferred student's name for the uninferred sibling. Different rung of
  the ladder, same user-visible outcome: a grade recorded under the wrong
  student.
- **F12 is tagged distinctly: `characterization of INTENDED behaviour`.** F12 is
  a SINGLE student whose model `byRaw` name outranks a convention match
  (documented intent; the scope cites `utils.ts:255-262`, the step-1 byRaw-priority read against step-2). It is not a merge of
  two submitters and it is not a defect; it is the byRaw-over-convention
  priority working as designed.

Why this matters downstream: the GRADE-INFER-MERGE fix (the filed backlog row
that resolves R-4) must flip F10 **and** F15 deliberately and leave F12
untouched. If F10 wears the same tag as F12, a future reader cannot tell the
intended R-4 flip from a regression. The label is a comment/`describe`-name
concern only - it changes no literal and no assertion. The frozen literal for
F10 and F15 stays exactly as the current (defective) code produces it.

### NOTE B, applied: F10 and F15 are both in the mutant sweep

The scope's 46-assertion sabotage run covered F1-F14 only; F15's assertions were
probed in a separate run. **The W1 implementer must run EVERY mutant M1-M10
against the FULL fixture set F1-F15 + Z1-Z3 in one sweep** and record the red
count per mutant. F10 and F15 are killable - M4 (always-infer) reddens
F15's no-option P4 row (F15's reliable, order-INDEPENDENT banked kill), and M5
(wrong-field) reddens F10's byRaw-sourced rows. M5/F15 is NOT banked: F15 is a
one-row merge of a byRaw file (AlvarezMaria/essay.txt) and a byBase file
(BrownTom/essay.txt); M5 mutates only the byRaw display (`utils.ts:317`), the
byBase display comes from `utils.ts:361` which M5 does not touch, and the merged
row's display is the FIRST-SEEN file's (`utils.ts:470`) in `Object.entries`
order, which is not proven stable (R-3). So M5/F15 is order-dependent (a
coin-flip), mirroring the relaxation already applied to F13/F14. Expected
consequence of including F15: M4's red count rises from 4 to 5 (F15's P4 joins
F2/F3/F10/F12). MEASURED in the W1 sweep: exactly 5. The implementer measures the exact counts; a
mutant that does NOT redden the rows section 8 predicts is a STOP-and-report,
not a quietly-accepted survivor (see section 10, sabotage-instrument caveats).

---

## 3. Instruments (the mock set)

Driven through the real production functions over real JSZip bytes. Mocked seams
ONLY (the same shapes `engine.test.ts:6-28` and
`collisionRefusal.wiring.test.ts:12-18` already use - spread the real module,
override the seam):

- `@/lib/llm` `callLlm`: **routed on prompt text.** A prompt containing
  `identifying filename naming conventions` (the inference prompt,
  `prompts.ts:286`) returns that fixture's inference reply. Every other prompt
  (a grading call) returns a valid grading JSON. The routing string is the
  stable sentinel; do not route on anything the fixture controls.
- `@/lib/gemini` limits: delay 0, a **mutable** max-submissions (F11 sets it to
  2), output tokens as the real default.
- `@/lib/code-runner` `runSubmittedCode`: returns null.
- **Never mock `fetch`.** `vitest.setup.ts` throws on any unmocked real fetch;
  the zip path makes no network call, so nothing here needs it. (Memory
  `tests-are-network-blocked`: a live 401 once made a sabotage check pass. There
  is no Canvas path in W1, so there is no `canvasFetch` to mock either.)

Content sentinels (`S_...`) are unique per fixture file, authored into each
file's text content. They are what the P2 instrument reads out of the model
prompt - CONTENT checked against NAME, which is the direct "graded under the
wrong student" test, not a name-against-name tautology.

---

## 4. The five assertion kinds

Each names the object compared, the instrument producing each side, and the
direction of failure.

- **P1 - engine rows vs frozen literal.** Object: the ordered list of
  `{ student, sorted file names }` from `gradeSubmissions(...).results`. Instrument:
  real `gradeSubmissions` (model seam mocked); literal `L` hand-frozen in the
  test. RED if any student string, row count, row order, or per-row file set
  differs. **Anti-vacuity (mandatory):** also assert `results[i].ungraded` is
  `undefined` for every graded row and `ungraded.kind === "not-attempted"` on
  the exact rows the literal marks so (F11). A run that grades nobody must not
  pass P1.
- **P2 - content sentinels vs name.** Object: for each graded row, the set of
  sentinel tokens found in the prompt text sent to the model under that row's
  `Student: <name>`. Instrument: `mockCallLlm.mock.calls` prompt text, student
  read by `/\n\nStudent: ([^\n]*)\n/` (`engine.ts:82`); literal = that fixture's
  per-student sentinel set. RED if any sentinel is absent from its student's
  prompt OR appears under a different student's prompt.
- **P3 - extraction (with inference) rows vs the SAME literal `L`.** Object:
  `extractStudentEntries(zip, { inferFileNamesWith: "gemini" })` rows. Instrument:
  real function; compared to the SAME `L` as P1 - **not** to P1's output. RED on
  any difference. (Same literal, independent instrument: this is what keeps P1
  and P3 from collapsing into a path-vs-path comparison.)
- **P4 - no-option extraction vs deterministic literal `N`, and no model call.**
  Object: `extractStudentEntries(zip)` (no option) student list plus the model
  call count. Instrument: real function + `mockCallLlm` call list; literal `N`.
  RED if names differ from `N` OR the model was called. This freezes divergence
  D1 so a consolidation that always infers (or never does) goes red on the side
  it broke. Present only on fixtures where inference is load-bearing (section 7).
- **P5 - zero-entry outcomes vs frozen literals, and no model call.** Object:
  `gradeSubmissions` outcome (throw text prefix, or empty stamped run) and
  `extractStudentEntries(zip)` return, plus model call count. Instrument: real
  functions + mock call list; literals in section 6.2. RED if the outcome, the
  message prefix, or the call count differs.

File names inside a student are compared **sorted**. Insertion order of
`extractSubmissions`' `submissions` map is a product of `Promise.all` over async
reads (`extraction.ts:74-127`) and was not proven stable; the oracle must not
pin it (R-3).

---

## 5. The frozen oracle, as a CONSTRUCTION

Every fixture is BUILT, not asserted into existence. The construction is: author
a JSZip archive with the exact entry paths below, each file's body containing
its sentinel token; stand up the mock set of section 3 with this fixture's
inference reply; drive the real function(s); compare to the frozen literal. The
set of fixtures is enumerated (F1-F15, Z1-Z3), each exercising a named axis, so
coverage is a property of the enumerated product of {path shape} x {inference
reply} x {assertion kind}, not of a hand-picked happy path.

The literals below are transcribed from the scope's PROBED table (4.2/4.3) at
`08639c02`, with the section-2 labels applied. **Authority order if anything
disagrees:** W1's first in-repo green run is final; a disagreement between a
literal here and the scope is a transcription error whose tie-breaker is the
scope's PROBED value; and a disagreement between the literal and the RUNNING
code at HEAD is a STOP-and-report (do NOT edit the literal to fit - memory
`guard-before-migration`: freeze the resolved output and prove it fires; the
literal is the oracle, the code is the thing under test).

### 5.1 Notation

`path -> S_TOKEN` means the archive entry at `path` holds content carrying
sentinel `S_TOKEN`. Inference reply is the mocked `callLlm` answer for that
fixture: a list of `[rawFileName, studentName, assignmentFileName]` items, or
`none` (the inference call returns `{ ok: false }`, so attribution falls back,
`rubric.ts:233-235`). `L` = engine/with-inference literal (P1=P3). `N` = no-
option deterministic literal (P4). Rows in `L` are ordered as `results` come
back (sorted by `localeCompare`, `utils.ts:520`). Names are quoted EXACTLY,
dirty whitespace shown. Use `.txt` for anything not a nested zip's inner file.

---

## 6. Fixtures

### 6.1 The fifteen attribution fixtures

| id | Label | Archive (path -> sentinel) | Inference reply | `L`: rows (student: sorted files; sentinels) | `N`: no-option students | Axis / why it discriminates |
|---|---|---|---|---|---|---|
| F1 | - | `Ada Lovelace_2024-01-01_120000_essay.txt`->S_ADA_1, `Ada Lovelace_2024-01-01_120500_notes.txt`->S_ADA_2, `Grace Hopper_2024-01-02_130000_essay.txt`->S_GRACE_1, `Bo_2024-01-03_140000_essay.txt`->S_BO_1, `Adam_2024-01-03_140000_essay.txt`->S_ADAM_1 | none | `Ada Lovelace`: essay.txt,notes.txt; S_ADA_1,S_ADA_2 / `Adam`: essay.txt; S_ADAM_1 / `Bo`: essay.txt; S_BO_1 / `Grace Hopper`: essay.txt; S_GRACE_1 | same as L | convention names; KEY order (`12:ada...,12:grace...,2:bo,4:adam`) differs from DISPLAY order (`Ada Lovelace,Adam,Bo,Grace Hopper`), so M6 (sort removed) is not redundant here |
| F2 | - | `essay1-AdaL.txt`->S_ADA_1, `code1-AdaL.txt`->S_ADA_2, `essay2-GraceH.txt`->S_GRACE_1, `code2-GraceH.txt`->S_GRACE_2 | essay1-AdaL:`"  Ada   Lovelace "`/essay1.txt; code1-AdaL:`Ada Lovelace`/code1.txt; essay2-GraceH:`"Grace  Hopper"`/essay2.txt; code2-GraceH:`Grace Hopper`/code2.txt | `Ada Lovelace`: code1.txt,essay1.txt; S_ADA_1,S_ADA_2 / `Grace Hopper`: code2.txt,essay2.txt; S_GRACE_1,S_GRACE_2 | `code1,code2,essay1,essay2` | name-vs-username (token `AdaL` never becomes the name); whitespace normalisation (M10); the item's own fixture |
| F3 | - | `essay1-AdaL.txt`->S_ADA_1, `code1-AdaL.txt`->S_ADA_2, `essay2-GraceH.txt`->S_GRACE_1 | essay1-AdaL:`Ada Lovelace`/essay1.txt; code1-AdaL:`"   "`/code1.txt (blank name); essay2-GraceH absent from reply | `Ada Lovelace`: essay1.txt; S_ADA_1 / `code1`: code1-AdaL.txt; S_ADA_2 / `essay2`: essay2-GraceH.txt; S_GRACE_1 | `code1,essay1,essay2` | MISSING NAME: blank and absent inference fall back per file, so one student splits across rows (frozen as-is) |
| F4 | - | same four files as F2 | none | `code1`: code1-AdaL.txt; S_ADA_2 / `code2`: code2-GraceH.txt; S_GRACE_2 / `essay1`: essay1-AdaL.txt; S_ADA_1 / `essay2`: essay2-GraceH.txt; S_GRACE_1 | same as L | inference unavailable: both paths degrade identically |
| F5 | - | `JaneDoe.zip` (nested; inner `src/deep.txt`->S_NESTED), `JaneDoe/src.txt`->S_FLAT | none | `JaneDoe/src`: deep.txt; S_NESTED / `JaneDoe/src (2)`: src.txt; S_FLAT | same as L | DUPLICATE DISPLAY across two distinct keys: the terminal label pass (M7); which file gets `(2)` is key-order-decided |
| F6 | - | `AlvarezMaria/essay.txt`->S_ALV, `BrownTom/essay.txt`->S_BRO, `ChenLi/essay.txt`->S_CHEN | none | `AlvarezMaria/essay`: essay.txt; S_ALV / `BrownTom/essay`: essay.txt; S_BRO / `ChenLi/essay`: essay.txt; S_CHEN | same as L | foldered students, shared filename, deterministic (A44 shape, now through both producers) |
| F7 | - | `janedoe_2024-01-01_120000_project.zip` (inner `main.py`->S_JANE), `johndoe_2024-01-01_130000_project.zip` (inner `main.py`->S_JOHN) | none | `janedoe`: main.py; S_JANE / `johndoe`: main.py; S_JOHN | same as L | nested per-student zips, convention names; `zipParents` threaded end to end (M2) |
| F8 | - | `bulk.zip` (inner `main.py`->S_B1), `bulk2.zip` (inner `main.py`->S_B2) | none | `bulk`: main.py; S_B1 / `bulk2`: main.py; S_B2 | same as L | nested zips, no convention: innermost-crossing stem (M2) |
| F9 | - | `essay.txt`->S_ONLY | none | `essay`: essay.txt; S_ONLY | same as L | UNLINKED submission: no name signal, attributed to filename stem (frozen as-is) |
| F10 | **KNOWN-DEFECT (R-4)** | `essay1-AdaL.txt`->S_X, `code1-AdaM.txt`->S_Y | both mapped to `Ada Lovelace` (essay1.txt, code1.txt) | `Ada Lovelace`: code1.txt,essay1.txt; S_X,S_Y | `code1,essay1` | WRONG-STUDENT MERGE: two distinct submitters (AdaL, AdaM) collapse under one model name because the refusal ignores inference. Same class as F15. Literal flipped only by the owner-ruled R-4 fix |
| F11 | - | `Ada Lovelace_..._essay.txt`->S_ADA_1, `Grace Hopper_..._essay.txt`->S_GRACE_1, `Bo_..._essay.txt`->S_BO_1 (dates as F1); engine max-submissions mocked to 2 | none | `Ada Lovelace` (graded; S_ADA_1) / `Bo` (graded; S_BO_1) / `Grace Hopper` (`ungraded.kind: "not-attempted"`, NO prompt) | same as L | the not-attempted tail keeps attribution and order (`engine.ts:350-368`); assert `results.length === entries.length` and the P1 anti-vacuity clause |
| F12 | **characterization of INTENDED behaviour** | `Ada Lovelace_2024-01-01_120000_essay.txt`->S_ADA_1 | that raw name -> `Someone Else`/e.txt | `Someone Else`: e.txt; S_ADA_1 | `Ada Lovelace` | PRIORITY (intended): model `byRaw` outranks a ground-truth convention match (`utils.ts:255-262`). ONE student, not a merge. NOT R-4 |
| F13 | - | `essay1-AdaL.txt`->S_X, `code1-AdaL.txt`->S_Y | `Ada Lovelace`/e.txt and `ada lovelace`/c.txt | ONE row, compared LOWER-CASED = `ada lovelace`: c.txt,e.txt; S_X,S_Y | - | case-fold merge of inferred names (M9). RELAXED: surviving display is first-seen/order-dependent (R-3), so assert row COUNT and LOWER-CASED value only |
| F14 | - | `Ada_2024-01-01_1_e.txt`->S_X, `ada_2024-01-02_1_f.txt`->S_Y | none | ONE row, lower-cased `ada`: e.txt,f.txt; S_X,S_Y | - | case-fold merge of convention names (M8). RELAXED as F13 |
| F15 | **KNOWN-DEFECT (R-4)** | `AlvarezMaria/essay.txt`->S_ALV, `BrownTom/essay.txt`->S_BRO | only `AlvarezMaria/essay.txt` -> `Maria Alvarez`/essay.txt | ONE row `Maria Alvarez`: essay.txt,essay.txt; S_ALV,S_BRO | `AlvarezMaria/essay,BrownTom/essay` | WRONG-STUDENT MERGE via step-4 `byBase`: BrownTom's uninferred file inherits the one inferred student's name. Same class as F10. Literal flipped only by the owner-ruled R-4 fix |

### 6.2 The three zero-entry fixtures (P5)

| id | Archive | `gradeSubmissions` outcome | `extractStudentEntries(zip)` | model calls |
|---|---|---|---|---|
| Z1 | `broken.docx` (bytes that are not a real docx) | THROWS; message starts `Found supported files, but could not extract text from them.` and contains `broken.docx` | `[]` | 0 |
| Z2 | `notes.bin` only | resolves, `results: []` | `[]` | 0 |
| Z3 | empty archive | resolves, `results: []` | `[]` | 0 |

Z1 pins only the PREFIX `could not extract text` and the substring `broken.docx`
- never the whole sentence (trap card `traps-tests.md:63-66`: pin the fact, not
the wording). This throw text has NO other pin in the suite
(`grep -rn "could not extract text" src` -> only `engine.ts:430`), so if W2
moved the throw into the helper, Z1 is the row that catches a changed or lost
message. Use a real Word parser path for `.docx`
(`collisionRefusal.wiring.test.ts:38-41`); `.bin` is an unsupported extension.

### 6.3 Per-fixture assertion inventory

What each fixture asserts, so the implementer knows the shape before writing and
can reconcile the run's count. Build these and let the RUN produce the total; do
NOT hard-code an aggregate count as a frozen number (a frozen total is a count
that cannot fail - `traps-tests.md:30-33` - and the per-fixture literals are
already the frozen oracle).

| Fixture | P1 | P2 | P3 | P4 | P5 |
|---|---|---|---|---|---|
| F1,F4,F5,F6,F7,F8,F9 | yes | yes | yes | - | - |
| F2,F3,F10,F12,F15 | yes | yes | yes | yes | - |
| F11 | yes (+ not-attempted tail) | yes | yes | - | - |
| F13,F14 | yes (relaxed: count + lower-cased) | yes | yes (relaxed) | - | - |
| Z1,Z2,Z3 | - | - | - | - | yes |

The scope's F1-F14 run counted 46 assertions (42 = 14x3 for P1/P2/P3, + 4 P4 on
F2/F3/F10/F12). Adding F15 (P1+P2+P3+P4 = 4) raises the attribution total to 50;
Z1-Z3 add their P5 assertions on top. These are the implementer's EXPECTED
shape, not a frozen target - the authority is the green run, and a count that
comes out lower means a fixture silently did not assert, which is itself a
defect to report.

---

## 7. Why P4 exists only where it does

P4 (no-option, no model call) discriminates only on fixtures where inference is
LOAD-BEARING - i.e. where `N` differs from `L`. Those are F2, F3, F10, F12, F15.
On F1/F4/F6/F7/F8/F9/F11 the inference reply is `none` (or inference changes
nothing), so `N == L` and a P4 there would add nothing on the NAMES clause: with
reply `none`, an always-inferring extractor still falls back to the same names.
(A P4 there would still redden under M4 via its no-model-call clause, because
the always-inferring no-option path DOES call the model even on a `none`
fixture; the placement decision stands because the divergent fixtures already
kill M4 on both clauses and the "none" fixtures would only duplicate the
call-count clause.)
Putting P4 only on the divergent fixtures is deliberate - it is the ONLY
instrument that kills M4, and it kills it precisely because on those fixtures
`N != L` and the model call count flips from 0 to >0. F13/F14 have no `N` (the
case-fold merge is relaxed and order-dependent), so no P4.

---

## 8. Numbered requirements

Each requirement names the object, the instrument, and the direction of failure,
and each carries a sabotage mutant that must go RED and then GREEN on restore,
with an explicit statement of whether it discriminates.

**R1 - Engine attribution is frozen per fixture.**
Object: `gradeSubmissions(...).results` rows `{student, sorted files}` for F1-F15.
Instrument: real `gradeSubmissions`, model seam mocked, vs literal `L` (P1).
Direction: RED on any student/order/count/file-set difference.
Sabotage: **M5** (wrong field, `utils.ts:317`) reddens P1 on F2/F3/F10/F12/F13
(F15 is order-dependent under M5, not banked - see section 2/NOTE B). GREEN on
restore. Discriminates: YES - both paths, strongest single
mutant.

**R2 - Extraction-with-inference matches the SAME literal, independently.**
Object: `extractStudentEntries(zip, {inferFileNamesWith:"gemini"})` rows vs the
same `L` (P3). Instrument: real function.
Direction: RED on any difference.
Sabotage: **M3** (extraction ignores the option, `extraction.ts:174` arg2 ->
`undefined`) reddens P3 on F2/F3/F10/F12/F13 while P1/P2 stay GREEN.
Discriminates: YES - extraction side only; this is the pair that makes the
oracle a two-sided freeze rather than a path-vs-path tautology (section 9).

**R3 - Content reaches the right name (the direct wrong-student instrument).**
Object: per-graded-row sentinel set in the model prompt under `Student: <name>`
(P2). Instrument: `mockCallLlm.mock.calls` text + the `engine.ts:82` regex.
Direction: RED if a sentinel is missing from its student or present under
another.
Sabotage: **M5** reddens P2 on the byRaw fixtures; **M1** (engine drops inferred
lookup, `engine.ts:418-423` arg2 -> `undefined`) reddens P1+P2 on
F2/F3/F10/F12/F13/F15. GREEN on restore. Discriminates: YES - engine side (P3 stays
green under M1).

**R4 - D1 is frozen: engine infers, extraction opts in.**
Object: `extractStudentEntries(zip)` no-option student list vs `N`, and
`mockCallLlm` not called, on F2/F3/F10/F12/F15 (P4).
Instrument: real function + mock call list.
Direction: RED if names != `N` OR the model was called.
Sabotage: **M4** (extraction ALWAYS infers, `extraction.ts:171-173` - the
consolidation worst case, a shared helper that hard-codes inference on) reddens
P4 ONLY, on F2/F3/F10/F12 (+F15 per NOTE B). GREEN on restore. Discriminates:
YES, and UNIQUELY - P4 is the only kind M4 kills; this is the reason P4 exists.

**R5 - `zipParents` threading is frozen.**
Object: nested-zip attribution rows for F5/F7/F8 (P1/P2/P3).
Instrument: real functions.
Direction: RED if a nested file's student changes.
Sabotage: **M2** (engine drops `zipParents`, `engine.ts:418-423` arg4) reddens
F5/F7/F8 P1+P2; engine side only. GREEN on restore. Discriminates: YES.

**R6 - The `localeCompare` final sort is frozen.**
Object: row ORDER for F1/F6/F11 (P1, + P3).
Instrument: real functions.
Direction: RED if rows come back in a different order.
Sabotage: **M6** (sort removed, `utils.ts:520`) reddens F1/F6/F11. GREEN on
restore. Discriminates: YES - **but only because F1's key order differs from its
display order.** A fixture whose key order already equals display order would
leave M6 a survivor from a BAD instrument, not a coverage gap (Opus-seat
practice 2). F1 is constructed so keys `12:ada lovelace, 12:grace hopper, 2:bo,
4:adam` sort differently from displays `Ada Lovelace, Adam, Bo, Grace Hopper`.
**Any revision of F1 must preserve that key-vs-display mismatch** or R6 silently
stops discriminating.

**R7 - The terminal unique-label pass is frozen.**
Object: F5's two rows sharing a raw display, disambiguated to `JaneDoe/src` and
`JaneDoe/src (2)` (P1/P2/P3).
Instrument: real functions.
Direction: RED if the two rows collapse to one display (and thus one React key /
one edits slot - scope 1.3).
Sabotage: **M7** (label pass dropped, `utils.ts:510`) reddens F5. GREEN on
restore. Discriminates: YES.

**R8 - Convention-key case-folding is frozen.**
Object: F14's single lower-cased `ada` row (P1/P2/P3, relaxed to count + lower-
cased value).
Instrument: real functions.
Direction: RED if `Ada` and `ada` stop merging.
Sabotage: **M8** (convention key not case-folded, `utils.ts:116`) reddens F14.
GREEN on restore. Discriminates: YES.

**R9 - Inferred-key case-folding is frozen.**
Object: F13's single lower-cased `ada lovelace` row (relaxed).
Instrument: real functions.
Direction: RED if the two inferred spellings stop merging.
Sabotage: **M9** (inferred key not case-folded, `utils.ts:316`) reddens F13.
GREEN on restore. Discriminates: YES.

**R10 - Display normalisation is frozen.**
Object: F2/F3 rows where dirty whitespace / blank names are normalised
(P1/P2/P3).
Instrument: real functions.
Direction: RED if `"  Ada   Lovelace "` stops collapsing to `Ada Lovelace`, or a
blank name stops falling back.
Sabotage: **M10** (`normalizeStudentDisplay` made identity, `prompts.ts:409`)
reddens F2/F3. GREEN on restore. Discriminates: YES.

**R11 - Zero-entry policy (D2) is frozen, including the engine's only message
pin.**
Object: Z1 throw-prefix + `broken.docx`; Z2/Z3 empty `results`; all three
extraction `[]` and 0 model calls (P5).
Instrument: real functions + mock call list.
Direction: RED if the engine stops throwing on Z1 (or the message loses
`could not extract text` / `broken.docx`), if Z2/Z3 stop resolving empty, or if
any model call fires.
Sabotage: no M1-M10 targets this directly; the discriminating mutant is
**dropping the zero-entry block** (`engine.ts:424-440`) or **moving the throw
into a would-be helper** - which is exactly the W2 change this row guards. The
implementer should confirm R11 by temporarily short-circuiting the throw at
`engine.ts:429` and watching Z1 go RED, then restore. Discriminates: YES - and
it is the only guard on a message that nothing else pins.

### Requirements that are NOT pinned, and why (deletions named as such)

- **Merged-group display selection under reordering** (F13/F14): the surviving
  display is first-seen and order-dependent (R-3, PROBED by the scope). Pinning
  the exact surviving spelling would freeze an unproven order. Pinned: row COUNT
  and lower-cased value. Not pinned: which spelling wins. This is a deliberate
  non-requirement, recorded as residual R-3, not an omission.
- **`submissions` map insertion order** (file order within a student before
  sorting): not proven stable (`extraction.ts:74-127` `Promise.all`), so files
  are compared SORTED everywhere (R-3).
- **Real Gemini inference behaviour**: every inference reply is a hand-authored
  mock; no key exists here. Pinned: that the mocked reply flows through
  correctly. Not pinned: what Gemini actually returns (argued, section 11).

---

## 9. Attack my own guard (executed reasoning, before hand-off)

The instrument's single most important property is that it does NOT become a
tautology when W2 merges the two compositions. I attacked it two ways.

**Attack A - the path-vs-path tautology.** Suppose a lazy implementer wrote R2
as `expect(gradeStudents).toEqual(extractStudents)` instead of comparing each to
`L`. Apply **M5** (wrong field) - it corrupts attribution identically on BOTH
paths. The path-vs-path assertion stays GREEN (both wrong the same way); the
defect ships. Now apply M5 to the FROZEN-LITERAL form (R1 P1 vs `L`, R2 P3 vs
`L`): P1 goes RED (engine output != `L`) AND P3 goes RED (extraction output !=
`L`). The literal form kills what the self-comparison cannot. This is why
sections 4 and 8 forbid P1-vs-P3 comparison and require both against `L`. After
W2 (one helper), M5 reddens both P1 and P3 from the single mutated function -
still a kill, because neither reads the other.

**Attack B - a mutant that destroys its own anchor.** A tempting M7 variant
would mutate the label pass so the row display becomes an empty string. Then an
assertion that located F5's row by searching for `JaneDoe/src` would find
neither row and could pass vacuously (nothing to compare). Guard: P1 compares
the ENTIRE ordered row list to `L` by structural equality, not by locating a row
by its display substring. An empty-display mutant changes the row list and goes
RED on the list comparison. The oracle must assert the whole `results` array
against `L`, never "find the row whose student contains X" - the latter is the
anchor-destroying-mutant failure this repo has shipped. (Recorded in the brief:
a sabotage that destroys the anchor the test searches for goes GREEN on the
exact mutation it exists to catch.)

**Attack C - a sabotage that passes because the model was never called.** If a
mutant made `gradeSubmissions` return early with `results: []`, P1's structural
compare to a non-empty `L` goes RED (length mismatch), and the anti-vacuity
clause (`ungraded === undefined` on graded rows) has nothing to check against an
empty list - the length check fires first. Confirmed the empty-run path cannot
masquerade as a pass on any non-zero-entry fixture.

---

## 10. The ten mutants, full-sweep expectation

Applied to import-rewritten COPIES of `engine.ts`/`extraction.ts`/`utils.ts` in
the scratch area (and a `vi.mock` wrapper over `@/lib/grade/prompts` for M10),
injected via `vi.mock` of the real module ids. **The repo tree is never
mutated.** Restore from a `cp` backup, NEVER `git checkout --` (memory
`sabotage-restore-needs-a-copy`: `git checkout --` on an uncommitted file reverts
to the index and destroys the chunk's work; and a `--root` sandbox does not
redirect a cwd-resolving test). An announcement wave is running concurrently, so
the scratch-copy method is MANDATORY here - in-place mutation of these three
files would redden a sibling's `npm test` for the window (scope 7.1 caveat).
Record which method was used.

Method used in the W1 sweep (measured): each production file was cp-backed-up, mutated in place for one vitest run of the oracle, then restored from the backup and confirmed byte-identical (Buffer compare); working-tree files are CRLF, so multi-line anchors were CRLF-adjusted. R11 was confirmed by short-circuiting the engine.ts throw: Z1 went RED (1 red).

Run EVERY mutant against the FULL fixture set F1-F15 + Z1-Z3 (NOTE B). Expected
red rows (the implementer measures the exact counts and reports them; the
scope's F1-F14-only counts are shown as `(scope)` where they differ from the
full-sweep expectation):

| Mutant | Location | Expected RED rows (full sweep) | Discrimination |
|---|---|---|---|
| M1 engine drops inferred lookup (arg2 -> undefined) | `engine.ts:418-423` | F2,F3,F10,F12,F13,F15: P1+P2 (MEASURED 12 red) | engine only; P3 green |
| M2 engine drops `zipParents` (arg4) | `engine.ts:418-423` | F5,F7,F8: P1+P2 (MEASURED 6 red) | engine only |
| M3 extraction ignores option (arg2 -> undefined) | `extraction.ts:174` | F2,F3,F10,F12,F13,F15: P3 (MEASURED 6 red) | extraction only; P1/P2 green |
| M4 extraction ALWAYS infers | `extraction.ts:171-173` | F2,F3,F10,F12,**F15**: P4 (scope: F2,F3,F10,F12) (MEASURED 5 red) | killed ONLY by P4 - the reason P4 exists; F15's banked, order-independent kill |
| M5 identity from WRONG FIELD | `utils.ts:317` | F2,F3,F10,F12,F13: P1+P2+P3 (MEASURED 18 red, which includes F15 P1/P2/P3 on this run; F15 is order-dependent, NOT banked) | both paths; strongest |
| M6 final sort removed | `utils.ts:520` | F1,F6,F11: P1+P3 (+P2 on F11) (MEASURED 7 red) | both paths; F1 key!=display |
| M7 label pass dropped | `utils.ts:510` | F5: P1+P2+P3 (MEASURED 3 red) | both paths |
| M8 convention key not case-folded | `utils.ts:116` | F14: P1+P3 (MEASURED 2 red; P2 stays green by design: relaxed rows key the sentinel map on the lower-cased name, so the unmerged split still unions to the same set) | both paths |
| M9 inferred key not case-folded | `utils.ts:316` | F13: P1+P3 (+F15 P1+P2+P3, deterministic: the byBase key is case-folded) (MEASURED 5 red; F13 P2 green for the same relaxed reason as F14) | both paths |
| M10 `normalizeStudentDisplay` identity | `prompts.ts:409` | F2,F3: P1+P2+P3 (MEASURED 6 red) | both paths |

**Coherence check (done here, as instructed).** M4 kills ONLY the no-option P4
rows - verified by its location (`extraction.ts:171-173` is the opt-in ternary;
flipping it to always-infer changes exactly the no-option call's behaviour and
nothing P1/P2/P3 reads). M5 kills the widest set (byRaw-sourced rows on both
paths) because `utils.ts:317` is the shared identity source both compositions
reach through `groupSubmissionsByStudent`. M3 is extraction-side only because
`extraction.ts:174` is only in the extraction path. The three claims the task
asked me to verify (M4 no-option only; M5 widest; M3 extraction-side) are
coherent with the located code.

**Sabotage-instrument caveats (Opus-seat practice 2 - a survivor may be a BAD
mutant, not a coverage gap).** (1) M6 on a fixture with key order == display
order is a bad-instrument survivor; F1 is built to avoid it (R6). (2) A mutant
that is RED in both the mutated and the restored state, or GREEN in both,
discriminates nothing and must be REBUILT and reported, never banked as a kill.
(3) If F10 does NOT redden under M5, or F15's P4 does NOT redden under M4, do
not add assertions to force a kill - STOP and report, because it means either
the fixture or the mutant is wrong. F15 NOT reddening under M5 is EXPECTED and
is NOT a fixture/mutant fault: the merged row's display is first-seen
(`utils.ts:470`) and order-dependent (R-3), and the byBase display
(`utils.ts:361`) is untouched by M5; F15's banked kill is M4/P4. The same
relaxation applies to F13/F14. The mutants NOT modelled and why: dropping
`rawData` (affects `rawBase64`, not attribution); swapping refuse/infer order
(already killed by `collisionRefusal.wiring.test.ts:83-94` and
`grading-incremental.test.ts:110-127` by reading, not mutated here); step-4
`byBase` precedence (reached only by F15, a characterization row that flips under
any change to it).

---

## 11. Executable here vs argued-only

**Executable (every assertion in sections 4-10):** all P1-P5 over real JSZip
bytes with the model seam mocked; all ten mutants via scratch copies; the Z1
message-prefix pin. These RUN and can be watched fail.

**Argued-only (labelled as argued, NOT asserted as verified):**

- Real Gemini filename-inference behaviour - every inference reply is a mock;
  no key exists in this environment.
- Whether `extractSubmissions`' `submissions` insertion order is actually
  nondeterministic across real archives - PROBED only the downstream fact
  (merged display is first-seen in map order); R-3.
- Any UI consequence: that two rows sharing a display collide on one React key
  (`GradingResults.tsx:647`) and one edits slot (scope 1.3) - **reading claim
  only; no component is rendered by any test here** (`traps-tests.md:68-72`; the
  seat ceiling). F5 freezes the two-row DATA; it does not and cannot prove the
  render.
- The scope's "10 of 10 mutants killed" from its scratch harness (R-7) - that
  was the scope author's run, unreproduced by anyone. W1's own sabotage sweep is
  what discharges it.

---

## 12. Gate

Run exactly this, one path per argument (never a raw multi-path `vitest`/`npm
test` - it silently drops any argument it does not match, `traps-tests.md:82-95`;
memory `test-paths-wrapper`). Every argument must print `COVERED`:

```
npm run test:paths src/lib/grade/ingestion-attribution.oracle.test.ts src/lib/grade/extraction.inference.test.ts src/lib/grade/extraction.test.ts src/lib/grade/identityInvariants.test.ts src/lib/grade/utils.test.ts src/lib/grade/engine.test.ts src/lib/grade/engine.ungraded.test.ts src/lib/grade/collisionRefusal.wiring.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts src/lib/grade/rubric-stamp.wiring.test.ts src/lib/grade/rubric-provenance-producers.structure.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/app/actions/grading-incremental.test.ts src/app/actions/grading-chat-intake.test.ts src/app/actions/grading.collisionRefusal.test.ts src/app/actions/grading.budget.test.ts src/app/actions/grading.guard.test.ts src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts
```

Plus `npx tsc --noEmit` (ONE caller; it races on `tsconfig.tsbuildinfo`, so no
sibling may run it concurrently) and `npm run lint` (pass = exit 0 and no NEW
warning in the new file vs the same command before the change). Pre-change
baseline of the 19 existing files at `08639c02`: `Test Files 19 passed (19)`,
`Tests 479 passed (479)` (scope 7.3); re-baseline at the actual W1 HEAD since it
moved.

Watch for the tsc traps before the type gate: no `/s` (dotAll) regex flag -
passes vitest, fails tsc TS1501 (memory `regex-s-flag-fails-tsc`); and no
`\uXXXX` escape written through the editor, which materializes as the literal
character (memory `write-tool-materializes-escapes`, owned by
`src/source-bytes.structure.test.ts`, in the gate above).

Structural-gate reminders baked into the gate list: `source-bytes` requires
text-only bytes; `no-emojis` scans `src/` and `docs/`; the provenance canary
`rubric-provenance-producers.structure.test.ts` stays GREEN because the new file
adds no `): Promise<GradingRun> {` producer; `runtime-import-graph.test.ts` stays
GREEN because the new test file adds no import edge to `engine.ts`/`extraction.ts`.
Do NOT name a comment-strip helper `stripComments` or mention that literal (it
reddens the repo-wide agreement gate); this oracle needs no comment-stripping at
all. Do NOT import a helper from another `*.test.ts` - duplicate it
(`traps-tests.md:46-50`; memory `no-cross-test-file-imports`).

**GREEN-at-HEAD is the pass.** The oracle characterizes CURRENT behaviour, known
defects (F10/F15) included. A RED row on the first in-repo run means the literal
disagrees with reality: STOP and report, do not edit the literal to fit. This is
the guard-before-migration order - freeze the resolved output, prove it fires
under sabotage, THEN W2 converts (memory `guard-before-migration`).

**Satisfiability (Opus-seat practice 1).** There is no "red tests must be proven
satisfiable" step to perform separately here, because the reference
implementation IS the production code at HEAD: the oracle is designed to PASS
against it. The satisfiability proof is therefore the first green in-repo run
itself. The scope's scratch-harness green (46 of 46 on F1-F14, F15 separate) is
evidence it is satisfiable but is the scope author's unreproduced claim (R-7);
W1's run is the reproduction.

---

## 13. Residual register

Each has an owner, an instrument, and the step that will measure it.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-3 | Merged-group display is first-seen/order-dependent; F13/F14 relaxed to count + lower-cased; `Promise.all` reorder unproven | owner decision on the display rule, then the chunk next owning `utils.ts` | a probe shuffling `submissions` key order for F13/F14 and comparing displays | before any change to display selection |
| R-4 | Model-inferred names bypass the collision refusal: F10 (duplicate model name) and F15 (step-4 `byBase` inheritance) grade under the wrong student. BOTH now labelled `KNOWN-DEFECT (R-4)` in the oracle | OWNER (product): refuse, warn, or require full inference coverage | F10 and F15 P1/P2 go RED the moment behaviour changes; the fix commit flips exactly those two literals, nothing else | an owner ruling (GRADE-INFER-MERGE); not this item |
| R-7 | The "10 of 10 mutants killed" proof is the scope author's scratch run, unreproduced | the W1 implementer, checked by the verify seat | the M1-M10 sweep of section 10 with recorded per-mutant red counts over F1-F15 | W1's sabotage gate |
| R-3-order (F1) | R6 discriminates only while F1's key order differs from its display order | the chunk next revising F1 | re-confirm keys `12:ada lovelace,12:grace hopper,2:bo,4:adam` sort differently from displays | any edit to F1 |

Residuals R-1 (Canvas pair), R-2 (`grading.ts` third copy), R-5
(`useContinuousGradingRun.ts` client labels), R-6 (embedded-path inference-free
backstop is a comment grep) are W2+ / other-chunk concerns carried in the scope's
section 10; they are out of W1's write set and are not re-owned here.

---

## 14. Implementer checklist (build-from, not advisory)

1. One new file only: `src/lib/grade/ingestion-attribution.oracle.test.ts`. Adds
   no export (legal "no caller" exception; state it so the wave gate does not
   read it as an escape). Estimate 300-380 lines; wall 1000.
2. Mock set exactly as section 3. Never `fetch`. Route `callLlm` on the
   `identifying filename naming conventions` sentinel.
3. Build F1-F15 + Z1-Z3 as section 6 constructions; assertions per section 6.3.
   Compare whole `results` arrays to `L` (not located rows). Files sorted.
4. Label F10 and F15 `KNOWN-DEFECT (R-4)` and F12
   `characterization of INTENDED behaviour` in their `describe`/`it` names or a
   leading comment on the row.
5. First run must be GREEN at HEAD. A RED row = STOP and report.
6. Sabotage sweep: M1-M10 over scratch copies (cp-backup restore), FULL fixture
   set incl. F10+F15, record per-mutant red counts, confirm restore GREEN.
   Confirm R11 by short-circuiting the `engine.ts:429` throw and watching Z1 RED.
7. Gate per section 12. Do not edit any literal to make a row pass.
