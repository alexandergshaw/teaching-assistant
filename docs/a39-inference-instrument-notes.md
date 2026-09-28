# A39 RES-P-3: the filename-inference instrument

Settles **RES-P-3** of `docs/a39-fill-waves.md:1702`, which routed design item #9
- the LLM filename inference - to this seat "BEFORE W4 is dispatched" with the
note "none exists today; I invented none".

**Write set of this pass: this one document.** Nothing under `src/`, `supabase/`
or any other `docs/` file was written, edited or reverted. No `git stash`, no
`git add -A`, no `git checkout --`. I did not touch
`docs/r2-overtightening-audit.md`.

`git status --short` at the START of this pass:

```
 M src/app/actions/submission-repo.test.ts
 M src/tools/symbol-count/count.test.ts
?? docs/ruling-137.md
?? src/app/actions/submission-repo.guard.test.ts
```

and at the END:

```
 M src/tools/symbol-count/count.test.ts
 M src/tools/symbol-count/count.ts
?? docs/a39-inference-instrument-notes.md
```

**The only line in either listing that is mine is this document.** The rest is a
concurrent seat's: the `submission-repo` pair and `docs/ruling-137.md` landed as a
commit during this pass, and `src/tools/symbol-count/` gained 177 insertions
across two files while I ran (`git diff --stat -- src/tools/symbol-count/`). I
opened `count.ts` and `count.test.ts` READ-ONLY, with `sed -n` and `grep`, to
learn the counter's contract before driving it; I wrote to neither, and I wrote to
nothing under `src/` at all.

**Consequence worth stating rather than hiding:** the counter's own source changed
underneath my measurements. Every count in section 2 was taken against the
working-tree copy as of this pass. If that seat changed the classifier, the counts
are attributable to a version that no longer exists - so section 2's numbers name
the instrument AND this caveat, and any of them that later decides something
should be re-taken.

---

## 0. THE ANSWER, before the argument

1. **An effect assertion IS constructible here, and I have executed the
   production code that proves it discriminates.** It is a DIFFERENTIAL over the
   derived student-name set, against two frozen literals, driven through the real
   `inferFileNameConvention` with `callLlm` mocked. Section 3.
2. **The silent fallback should NOT stay silent - and that is a PRODUCTION
   CHANGE, which I do not design.** It is named as its own item in section 7. It
   is **not** a blocker for W4, because the instrument in section 3 does not
   depend on it.
3. **W4's brief requirements are in section 8**, including two bound raises, one
   new test file, and a repair W4's own plan does not price.

**And one thing I was not asked for, which I found while measuring and which
changes W4's cost.** `docs/a39-fill-waves.md:910-911` states that "all eight
existing `it(` blocks in that file stay GREEN with no repair". **That is wrong for
two of them.** `src/app/actions/grading-incremental.test.ts:91` and `:163` are
`expect(mockCallLlm).not.toHaveBeenCalled()` on NON-colliding zip fixtures, and
after W4 the inference calls `callLlm` on exactly those paths. EXECUTED, section
6.3: a bare `vi.fn()` returning `undefined` still records **invocations=1**. The
try/catch absorbs the throw; it does not un-call the mock. Section 8 item R4
carries the repair, and the repair is worth more than the cost - those two
assertions become the EXECUTED reachability proof the design only greps for.

---

## 1. What I could run and what I could not

**I ran no `npm test`, no `npx tsc`, no `npm run lint`, no `npm run build`, and
I added no test file to the tree.** The gates stay unrun by me, deliberately: a
`tsc` run has one legal caller in this repo and a concurrent seat is working.

**What I DID execute, and it is the load-bearing evidence in this document.** I
drove this repo's OWN production functions - `inferFileNameConvention`,
`parseInferredFileNameLookup` (transitively), `extractSubmissions`,
`extractStudentEntries`, `groupSubmissionsByStudent`, `parseSubmissionFileName`,
`decideCollisionRefusal`, `normalizeStudentDisplay` - from a driver in the
session scratchpad, under `node --experimental-strip-types` with a resolver hook
supplying the `@/` alias, extensionless relative resolution, and three module
stubs (`../llm`, `./repo-content`, `next/headers`). The repo tree was read only.

Exact command shape, run from the repo root:

```
node --experimental-strip-types --import <scratchpad>/register.mjs <scratchpad>/traceN.mts
```

**What that is and is not.** It is a real execution of the real functions on real
zip bytes, so every literal in section 4 is MEASURED rather than predicted. It is
NOT a vitest run: it does not exercise `vitest.setup.ts`'s fetch trap, `vi.mock`
hoisting, or vitest's own module resolution. So the FROZEN VALUES are verified
and the MOCKING MECHANICS are argued. That split is stated per-claim in section 9
and I do not blur it.

Three agents this session declined to recommend an instrument they could not
run. I could run the part that decides whether the instrument discriminates, so
I ran it; I could not run the part that decides whether vitest will host it, so I
say so.

---

## 2. Measurement preamble

Every quantity names the command. Counts that decide anything come from
`src/tools/symbol-count/count.ts` (RULING 135's two instruments - an AST walk and
the compiler's own scanner), driven from the scratchpad over all **2765** `.ts`
and `.tsx` files under `src/`, never from `grep -c`.

| Symbol | callCount | declCount | comment | naive grep LINES | instruments reconcile | test files containing the text |
|---|---|---|---|---|---|---|
| `inferFileNameConvention` | **1** | 3 | 1 | 5 across 3 files | true on all 3 | **0** |
| `parseInferredFileNameLookup` | **1** | 1 | 0 | 2 in 1 file | true | **0** |
| `normalizeStudentDisplay` | **1** | 2 | 0 | 3 across 2 files | false on `prompts.ts` (its own name inside a string) | **0** |
| `extractStudentEntries` | **6** | 6 | 10 | 34 across 10 files | **false on 4 of 10** | 6 (4 calls) |

**Where the counter agreed with my reading and where it did not.** It agreed on
which FILES contain each symbol - my earlier `grep -rn` found the same 3 files for
`inferFileNameConvention`. It DISAGREED on the per-file call count in exactly the
way RULING 135 predicts: `grep -c` reports 3 lines in `engine.ts`, and the AST
walk reports **1 call, 1 declaration and 1 comment occurrence** there. The single
real call site is `src/lib/grade/engine.ts:390`. I do not restate the grep number
anywhere below.

**One counter disagreement I am reporting rather than adopting.** For
`extractStudentEntries` the two instruments did NOT reconcile on 4 of 10 files
(`grading.ts`, `extraction.test.ts`, `extraction.ts`,
`collisionRefusal.wiring.test.ts`) - the tool's own header calls a mismatch "a
real disagreement to surface, not paper over". Nothing in this document rests on
that symbol's per-file split. The three symbols I DO reason from
(`inferFileNameConvention`, `parseInferredFileNameLookup`, and
`normalizeStudentDisplay` in `rubric.ts`) reconciled `true` on every file.

Sizes, both counters, run at the head of this pass:

| Path | `wc -l` | `@(Get-Content).Count` |
|---|---|---|
| `src/lib/grade/rubric.ts` | 443 | 443 |
| `src/lib/grade/extraction.ts` | 353 | 353 |
| `src/lib/grade/extraction.test.ts` | 330 | 330 |
| `src/app/actions/grading-incremental.test.ts` | 189 | 189 |
| `src/lib/grade/utils.test.ts` | 393 | 393 |

Both counters agree on all five.

### 2.1 Owner decisions checked FIRST, per the brief

`docs/owner-decisions-2026-09-23.md` and `docs/owner-decisions-2026-09-27.md`,
both read in full for the relevant decisions.

**DECISION 17** (`owner-decisions-2026-09-27.md`) is the governing one: "the
incremental route produces the SAME `GradingRun` the whole-run path does ... One
table, one state machine." That is an affirmative instruction that the two routes
must AGREE on derivation, which is exactly what item #9 closes. It does not
mention the filename inference by name and it says nothing about observability of
a failed inference.

`grep -niE "silent|fallback|observab|inferFileName|filename inference"` over both
decision files returns nine hits, every one about a different subject (A29's
refusal, A38's press, A40's disclosure caption, DECISION 14's CSS fallback
expressions, A43's slide-count refusal).

**So: no owner decision forecloses either branch of question 2, and DECISION 17
positively supports the requirement in section 3.** Nothing in this document
overrides a decision, and nothing in it needs one to proceed.

---

## 3. Question 1: what can be asserted about the inference's EFFECT

### 3.1 The mechanism, read from source

`inferFileNameConvention` (`src/lib/grade/rubric.ts:209-241`) returns an
`InferredFileNameLookup` - two `Map`s, `byRaw` and `byBase` - and returns the
EMPTY pair on three distinct conditions: an empty input list (`:218-220`),
`!result.ok` (`:233-235`), and any throw (`:238-240`).

The lookup's only consumer is `parseSubmissionFileName`
(`src/lib/grade/utils.ts:289-400`), a six-step priority ladder. The lookup is
consulted at exactly two steps: `byRaw` at step 1 (`:313-322`, keyed on the FULL
file path) and `byBase` at step 4 (`:357-366`, keyed on the base name). Steps 2,
3, 5 and 6 are deterministic. `groupSubmissionsByStudent` (`utils.ts:452`) groups
on `parseSubmissionFileName`'s `studentKey` and labels rows with its
`studentDisplay`.

**Therefore an EMPTY lookup and NO lookup take identical paths through the
ladder.** That is the defect RES-P-3 named, and it is also the hinge of the
instrument: it means the difference between a working inference and a silently
failed one is EXACTLY the difference between passing a real lookup and passing
`undefined`, which is an OBSERVABLE at the row level.

### 3.2 Why "mock and assert the names are right" is not enough, and what is

A test that mocks `callLlm` with a valid convention and asserts the names come
out right is a happy-path test. It goes red on a silent failure only if the
expected names are UNREACHABLE by any deterministic path - and nothing in that
formulation guarantees it.

So the instrument is a **DIFFERENTIAL against two frozen literals**, and its
construction carries the guarantee:

- **Condition A**: the inference active, `callLlm` mocked to return a valid
  convention. Expected row set: a frozen literal `A_NAMES`.
- **Condition B**: the inference absent (the option not passed - today's
  behaviour). Expected row set: a frozen literal `B_NAMES`.
- **The construction that makes A unreachable without the model**: every token in
  `A_NAMES` that distinguishes it from `B_NAMES` appears NOWHERE in the fixture's
  file paths or file bodies. So no deterministic transform of the fixture can
  produce `A_NAMES`; the only provenance is the mocked response.
- **Plus a live inequality** `A !== B_NAMES`, which is what goes red when the
  inference silently fails and A collapses onto B.

Both halves are needed and they are not redundant. The frozen literal says WHAT
the names must be; the inequality says the INFERENCE is why. A literal alone
could in principle be satisfied by a coincidence; an inequality alone could be
satisfied by garbage.

### 3.3 Is `parseInferredFileNameLookup` directly testable? NO - and that is fine

**It is not exported.** `src/lib/grade/rubric.ts:131` is
`function parseInferredFileNameLookup(` with no `export`, and the counter confirms
1 declaration, 1 call, **0 test files containing the text**. `rubric.ts:442-443`
re-export `buildSystemPrompt`, `normalizeAreaName`, `buildSampleAnswerPrompt` and
the `RubricCriterion` type; the parse function is not among them.

**It does not need to be, and adding an export would be the wrong move** - it is
exactly the "drive the production path instead of working around the gate" case
(seats.md, practice 3). `inferFileNameConvention` IS exported, and driving it with
`callLlm` mocked exercises `parseInferredFileNameLookup` in full, including
`extractJsonObject`'s fence stripping (`rubric.ts:120-128`), the
`requestedSet.has` filter (`:171-173`), the studentDisplay/citationFileName
non-empty filter (`:175-177`), and the `byBase` single-candidate rule
(`:188-195`). **EXECUTED, section 4.2**: a fenced-JSON response produced a
4-entry `byRaw` and a 4-entry `byBase` through the real parse.

So the answer to "is it directly testable" is: **no, and the instrument reaches
it through its real caller, which makes the test more faithful rather than less.**
I am not proposing an export and I am not proposing a gate exception.

---

## 4. The frozen oracle, as a CONSTRUCTION, with its executed evidence

### 4.1 How the set is built

The fixture is built by a rule, not chosen by taste. Four constraints, each with
the failure it prevents:

| Constraint | Failure it prevents |
|---|---|
| **C1.** Four files at the zip ROOT, no folders, no nested zips | `parseSubmissionFileName` step 5 (innermost crossing) and RULE D's folder fold are both off the path, so condition B's names come from exactly one step (6) and are hand-traceable |
| **C2.** No filename has 4 or more `_`-separated parts | `matchStudentFileConvention` (`utils.ts:87-107`) returns `null`, so step 2 does not pre-empt the inference. A Canvas-convention filename would make the inference add nothing and the differential would be empty by construction |
| **C3.** Each filename's leading `[A-Za-z0-9]+` run is DISTINCT across the four | `leafStemFallback` (`utils.ts:121-126`) gives four distinct identities, so `decideCollisionRefusal` returns `ok` and condition B does not throw. **This is the constraint most likely to be broken by a careless fixture edit** - four files whose stems collide are a REFUSAL, not a comparison |
| **C4.** The distinguishing tokens of `A_NAMES` appear in NO fixture path and NO fixture body | makes `A_NAMES` unreachable by any deterministic transform. This is what stops a passing-but-wrong implementation that hand-rolls a filename regex |

The fixture that satisfies all four:

```
essay1-AdaL.txt      "an essay about sorting"
code1-AdaL.txt       "def sort(x): pass"
essay2-GraceH.txt    "an essay about compilers"
code2-GraceH.txt     "def compile(x): pass"
```

The frozen model response - the value the mocked `callLlm` resolves as `text`.
It is wrapped in a Markdown JSON code fence, because a real Gemini reply usually
is and `extractJsonObject` (`rubric.ts:120-128`) is the code that strips it. The
fence is described rather than pasted here, so this document does not nest one
fence inside another; the test's own literal carries the three backticks plus
`json`, a newline, the object below, a newline, and three backticks:

    {"items":[
     {"rawFileName":"essay1-AdaL.txt","studentName":"  Ada   Lovelace ","assignmentFileName":"essay1.txt"},
     {"rawFileName":"code1-AdaL.txt","studentName":"Ada Lovelace","assignmentFileName":"code1.txt"},
     {"rawFileName":"essay2-GraceH.txt","studentName":"Grace  Hopper","assignmentFileName":"essay2.txt"},
     {"rawFileName":"code2-GraceH.txt","studentName":"Grace Hopper","assignmentFileName":"code2.txt"}
    ]}

The two whitespace-dirty `studentName` values are deliberate and buy a second
discriminator for free - see 4.3.

**C4, checked as a construction rather than asserted.** `"Lovelace"` and
`"Hopper"` are the distinguishing tokens. EXECUTED: joining all four paths and
all four bodies and testing `.includes("Lovelace")` -> **false**; `"Hopper"` ->
**false**. The test must carry this as an assertion, not a comment (requirement
**I5**), so a future fixture edit that puts a surname into a filename fails loudly
instead of quietly making I1 unfalsifiable.

### 4.2 The frozen literals, MEASURED against the production code

Driven through the real functions as described in section 1.

**`extractSubmissions` on the real flat JSZip:**

```
submission KEYS: ["essay1-AdaL.txt","code1-AdaL.txt","essay2-GraceH.txt","code2-GraceH.txt"]
zipParents:      {}
```

**`decideCollisionRefusal(submissions, {})`** (the predicate
`extractStudentEntries` runs at `extraction.ts:145`, computed with NO lookup by
construction):

```
{"status":"ok"}   describeCollisionRefusal -> null
```

**C3 holds. Condition B does not throw.** This was the single largest risk in the
fixture design and it is now measured, not argued.

**Condition B - `extractStudentEntries(buf)`, no option, today's real
production function:**

```
B_NAMES = ["code1","code2","essay1","essay2"]
B_FILES = [["code1-AdaL.txt"],["code2-GraceH.txt"],["essay1-AdaL.txt"],["essay2-GraceH.txt"]]
```

**Condition A - the real `inferFileNameConvention(rawFileNames, "gemini")` with
`callLlm` stubbed to resolve the fenced frozen response, then the real
`groupSubmissionsByStudent`:**

```
callLlm invocations: 1   prompt carried the fixture's raw filenames: true
byRaw:  4 entries, e.g. "essay1-AdaL.txt" -> {studentDisplay:"Ada Lovelace", citationFileName:"essay1.txt"}
byBase: 4 entries (base name equals raw name for root-level files)
A_NAMES           = ["Ada Lovelace","Grace Hopper"]
A_FILES (sorted)  = [["code1.txt","essay1.txt"],["code2.txt","essay2.txt"]]
A_MERGEDFILECOUNT = [2,2]
```

**The effect is unmistakable and it is the filed defect in miniature: four rows
named after assignment parts become two rows named after students, and each row's
citation names change from the raw upload names to the assignment names.**

### 4.3 Three things the fixture discriminates for free

- **`normalizeStudentDisplay` gets its first executed coverage anywhere.**
  Measured: callCount 1, reached only from `parseInferredFileNameLookup`, **0
  test files**. EXECUTED: if the normalizer were removed and raw model strings
  used verbatim, `groupSubmissionsByStudent` returns **four** rows
  `["  Ada   Lovelace ","Ada Lovelace","Grace  Hopper","Grace Hopper"]` instead of
  two. So `A_NAMES` having length 2 is itself an assertion over the normalizer.
- **`citationFileName` is a SECOND, independent observable of the same fact.**
  Under A it is `essay1.txt`; under B it is `essay1-AdaL.txt`. It matters because
  it is threaded by a DIFFERENT code path: `groupSubmissionsByStudent` calls
  `parseSubmissionFileName` again at `utils.ts:525` and `:531` for merged content
  and `submittedFiles`, separately from the grouping call at `:466`. An
  implementer who threads the lookup into one and not the other makes exactly one
  of the two assertions red - which is why both are required and neither is
  redundant (see 5.2, passing-but-wrong #2).
- **`extractJsonObject`'s fence handling is exercised**, because the frozen
  response is fenced. EXECUTED: the parse produced 4 entries from the fenced form.

---

## 5. The requirements

**I1 through I5 are NEW ids outside the design's F1-F26 space**, because the
design has no F-row for item #9 and inventing an F-number would imply a row in
its section 11 table that does not exist. W4's brief adds them.

### 5.1 The verify rows

Each names three things: the OBJECT under comparison, the INSTRUMENT producing
each quantity, and the DIRECTION of failure.

| # | OBJECT | INSTRUMENT | DIRECTION OF FAILURE |
|---|---|---|---|
| **I1** | the sorted `student` strings and the sorted `submittedFiles[].name` per row, from `extractStudentEntries(zip, { inferFileNamesWith: "gemini" })` on the 4.1 fixture | a NEW file `src/lib/grade/extraction.inference.test.ts`, mocking `../llm`'s `callLlm` only. Three assertions: `toEqual(A_NAMES)`; `toEqual(A_FILES)`; `not.toEqual(B_NAMES)` | **RED when the inference produces an empty lookup for any reason** - a discarded parse, a discarded `ok` branch, a lookup computed and not threaded through. RED when the names come out right but the citation names do not. GREEN only when a real lookup reaches BOTH `parseSubmissionFileName` call sites |
| **I2** | the same two quantities from `extractStudentEntries(zip)` with **no** option, on the **same** fixture | the same new file. `toEqual(B_NAMES)`; `toEqual(B_FILES)` | **RED if the deterministic ladder changes**, which is the signal that I1's frozen `A_NAMES` and the inequality need re-deriving. This is the anchor that keeps I1's inequality meaningful - without it, `not.toEqual(B_NAMES)` is a comparison against a literal nobody re-checks |
| **I3** | `result.plan.tickets.map(t => t.entry.student)` from `prepareGradingRunAction(formData)` - the SERVER ACTION the route actually calls | `src/app/actions/grading-incremental.test.ts` (W4's own file; it already mocks `@/lib/llm`). `toEqual(A_NAMES)` | **RED if `grading-incremental.ts:91` does not pass `inferFileNamesWith`.** This is the requirement the design discharges with a grep. Direction is user-facing: the names the instructor sees on the incremental route |
| **I4** | `mockCallLlm.mock.calls.length` from `prepareGradingRunAction`, on two fixtures | the same file, the FOUR existing assertions at `:75`, `:91`, `:128`, `:163`, repaired: **`:75` stays `not.toHaveBeenCalled()`** (colliding zip - the refusal precedes the inference); **`:128` stays** (Canvas path - `extractCanvasEntries` does no filename grouping); **`:91` and `:163` become `toHaveBeenCalledTimes(1)`** | **RED if the inference moves BEFORE the collision refusal** (`:75` goes red - a colliding zip must pay no model call) and **RED if the inference is never reached on the zip path** (`:91`/`:163` go red). Both directions, from one instrument |
| **I5** | the fixture itself: the four paths and four bodies joined | the same new file. `expect(joined).not.toContain("Lovelace")` and `not.toContain("Hopper")` | **RED if a future fixture edit puts a distinguishing token into a filename or body**, which would make I1 satisfiable without the model. This is C4 as an executed guard rather than a comment |

**Instrument for I1, I2, I5 and I3, I4 together** (two or more test files, so
`test:paths`, never a raw multi-path `vitest`):

```
npm run test:paths -- src/lib/grade/extraction.inference.test.ts src/app/actions/grading-incremental.test.ts src/lib/grade/extraction.test.ts src/lib/grade/utils.test.ts
```

PASS: `COVERED` for every argument, exit 0. A `NOT COVERED` line is a failure
even when the suite is green.

### 5.2 I ATTACKED MY OWN GUARD. Three passing-but-wrong implementations

Per the seat brief, I wrote the wrong implementation first and ran my instrument
against it in my head against the source ladder, using the executed values.

- **#1 - a hand-rolled deterministic regex instead of the model call.** An
  implementer splits `essay1-AdaL.txt` on `-` and uses the second part. Output:
  `["AdaL","GraceH"]`. **I1 goes RED** (not `A_NAMES`), because `"Lovelace"` and
  `"Hopper"` are not recoverable from the fixture - C4, executed. **My
  instrument catches it.**
- **#2 - the lookup threaded into the content loop but not the grouping.** An
  implementer passes the lookup to `parseSubmissionFileName` at `utils.ts:525`
  and `:531` but leaves `:466` on `undefined` (or, in W4's own edit, passes the
  lookup only to the second and third arguments). Output: names stay
  `B_NAMES`, citation names become `A_FILES`. **I1's names assertion goes RED and
  its files assertion goes GREEN.** The instrument catches it BECAUSE both are
  asserted separately. Had I asserted only the names, I would have missed the
  reverse case; had I asserted only the files, I would have missed this one.
  **This is why 4.3's "second independent observable" is a requirement and not a
  bonus.**
- **#3 - the inference called BEFORE the collision refusal.** Names are correct;
  a colliding zip now pays a model call it did not before. **I1, I2, I3 and I5
  all stay GREEN.** Only **I4 at `:75`** catches it. So I4 is not housekeeping -
  it is the only instrument for an ordering property W4 changes the meaning of.
  I would have shipped a hole without it, and the hole is a spend defect RULING
  118 exists to prevent.

**#4 - the one my instrument does NOT catch, stated rather than papered over.**
An implementer passes `inferFileNamesWith` on the incremental route AND also on
`grading.ts:859`'s embedded branch, which must never make a model call. I1-I5 are
all green. The existing enforcement is the design's
`grep -c "inferFileNamesWith" src/app/actions/grading.ts` -> 0 (Group A item 8,
RES-FILL-10), which is a GREP, not a test. I am not inventing a substitute in
this document - section 10 records it as a residual with the honest note that the
grep is the whole instrument.

---

## 6. Sabotage design

**I ran none of these as source mutations** - my write set is one document and
mutating `src/` is forbidden here. What I DID do is execute the production code in
each mutation's RESULTING STATE, which is stronger than predicting from a read:
every mutation below that produces the empty fallback produces a state I have
measured the output of.

### 6.1 The mutations

| id | Mutation | Call still happens? | Expected on I1/I2/I3 | Discriminates? |
|---|---|---|---|---|
| **M1** | `src/lib/grade/rubric.ts:237`: `return parseInferredFileNameLookup(result.text.trim(), rawFileNames);` -> `return fallback;` | **YES** - `callLlm` at `:223` is untouched | **I1 RED** (names and files and the inequality, all three). **I3 RED.** I2 GREEN, I4 GREEN, I5 GREEN | **YES.** This is the exact mutation the brief demanded: the inference silently fails while the call still happens |
| **M2** | `src/lib/grade/extraction.ts`, W4's new branch: compute the lookup, then pass `undefined` to `groupSubmissionsByStudent` anyway | **YES** | **I1 RED. I3 RED.** I4 GREEN | **YES**, and it is a DIFFERENT object from M1 - the caller's threading, not the library. It is also the literal shape of the defect item #9 exists to fix (`extraction.ts:149` passes `undefined` today) |
| **M3** | `src/app/actions/grading-incremental.ts:91`: drop the `inferFileNamesWith` option | **NO** - and that is the point | **I3 RED. I4 RED at `:91` and `:163`** (`toHaveBeenCalledTimes(1)` becomes 0). I1, I2, I5 GREEN | **YES**, on a third object: the production caller. Two instruments fire, which is the cross-check that I3 and I4 are not measuring the same thing by accident |
| **M4** | Move W4's inference call ABOVE `extraction.ts:145`'s `decideCollisionRefusal` | YES | **I4 RED at `:75`.** Everything else GREEN | **YES** - and it is the ONLY mutation in this table that I1, I2 and I3 all survive. See 5.2 #3 |
| **C-CTRL** | `src/lib/grade/rubric.ts:218`: `if (rawFileNames.length === 0)` -> `if (rawFileNames.length < 0)` | YES | **ALL GREEN. THIS MUTANT MUST SURVIVE.** | **NO, deliberately.** A no-op for any non-empty file set. If it goes red, the instrument is coupled to something it should not be reading, and the suite is over-fitted rather than sensitive. `iteration-caps.md`'s "what is never traded away" requires a mutant that must survive; this is it |

Every row restores GREEN on restore-from-copy. **Restore with a `cp` backup, never
`git checkout --`** - on an uncommitted file that reverts to the index and
destroys the wave's work.

### 6.2 TWO MUTANTS I REBUILT RATHER THAN BANKED AS KILLS

Reported explicitly, because a kill count inflated by bad mutants is the exact
defect class this seat exists to prevent, wearing a number.

- **REBUILT: "delete the `try`/`catch` in `inferFileNameConvention`"** was my
  first candidate for the silent-failure mutant. **It is a bad mutant for this
  instrument.** With `callLlm` mocked to resolve a valid `{ok:true,text}`,
  nothing inside the `try` throws, so the mutation is invisible and I1 stays
  GREEN in both directions. Green-both-ways discriminates nothing. Rebuilt as
  M1, which attacks the parse hand-off instead of the error handling.
- **REBUILT, and DOWNGRADED rather than deleted: `rubric.ts:233`
  `if (!result.ok)` -> `if (result.ok)`.** This one DOES go red on I1. But it is
  an **EQUIVALENT MUTANT to M1** - both produce the empty fallback with the call
  intact, so killing one kills both and banking them as two kills would
  overstate the instrument's reach by one. It is recorded here as a variant of
  M1, not as a fifth kill. **Honest count: FOUR discriminating mutants (M1-M4)
  over three distinct objects, plus one control that must survive.**

### 6.3 The state every "empty fallback" mutation lands in, EXECUTED

This is the measurement that makes M1 and M2 predictions rather than guesses.
Driven through the real `inferFileNameConvention` with three stub behaviours:

```
EMPTY LOOKUP passed to groupSubmissionsByStudent -> ["code1","code2","essay1","essay2"]  equals B_NAMES: true
UNDEFINED LOOKUP                                 -> ["code1","code2","essay1","essay2"]
callLlm resolves {ok:false,status:500}: invocations=1  byRaw.size=0 byBase.size=0  names == B_NAMES: true
callLlm resolves undefined (a bare vi.fn()): invocations=1  byRaw.size=0 byBase.size=0  names == B_NAMES: true
```

**Three facts follow, and all three are measured:**

1. **An empty lookup is byte-identical to no lookup at the row level.** That is
   RES-P-3's premise, confirmed by execution rather than by reading.
2. **A silently failed inference lands exactly on `B_NAMES`**, so I1's frozen
   literal and its inequality both go red. M1 and M2 are not predictions.
3. **`callLlm` is INVOKED on every one of those paths - invocations=1.** So a
   reachability assertion (`expect(mockCallLlm).toHaveBeenCalled()`) stays GREEN
   under M1 and M2. **That is the proof that I1 is not "merely adding a mock":
   the assertion the design already has would survive the mutation the design's
   own weakest finding needs caught.**

---

## 7. Question 2: should the silent fallback stay silent?

**No. And it is a PRODUCTION CHANGE, so I do not design it here.**

### 7.1 The finding

`inferFileNameConvention` collapses four distinguishable facts into one value:

| Real situation | Returned |
|---|---|
| the model found no convention | empty maps |
| the model returned unparseable text | empty maps |
| `callLlm` returned `ok: false` (a dead key, a 429, a 500) | empty maps |
| the call threw (network, abort, a bug) | empty maps |

At runtime, **the instructor cannot tell a working inference from a dead one.**
The grade still posts, under a name derived from a filename stem, and nothing
anywhere says the inference did not run. The test in section 3 can tell them
apart only because it controls the mock; the user has no such handle.

### 7.2 Why the existing try/catch's justification does not extend to this

The try/catch is defensible and I am not proposing removing it. Its argument is
**do not abort a batch for one bad filename** - a whole-run zip of forty
submissions must not fail because the inference did. That argument is about NOT
THROWING. It says nothing about collapsing the outcome into one indistinguishable
value. A discriminated return - `{ kind: "inferred", lookup } | { kind:
"unavailable", reason }` - with every caller continuing on `unavailable` preserves
the no-abort guarantee completely. **The two properties are separable, and they
have been conflated.**

### 7.3 Why it is a separate item and NOT a W4 blocker

**It is not a blocker.** The section 3 instrument discriminates TODAY, against
the code as it stands, because it compares the EFFECT (rows and names) rather
than interrogating the inference's health. W4 can proceed on the strength of
I1-I5 with the fallback unchanged. Saying otherwise would block a wave for a
defect the wave does not create.

**It is a separate item because its blast radius is not W4's.** Changing
`inferFileNameConvention`'s return type touches `rubric.ts`, `types.ts`
(`InferredFileNameLookup`), the `src/lib/grade.ts` barrel line, and
**`src/lib/grade/engine.ts:390` - the whole-run path that is LIVE in production
today**, which the whole A39 fill deliberately does not modify. And if the signal
is to reach the instructor rather than only a log, it needs a field on
`GradingRun`, which is gated by two exact-key-set tests
(`src/lib/grade-result-allowlist-coverage.test.ts` and
`src/app/actions/grading-submission-grade.test.ts:126`, both in W2's owned
read-only list for exactly this reason). That is a design decision about a
user-visible disclosure, not a test-note decision.

**I DO NOT DESIGN IT.** I name it, I say what it must decide, and I stop:

> **NEW ITEM (proposed): "the filename inference reports whether it ran."** Make
> `inferFileNameConvention`'s outcome distinguishable from "no convention found",
> on both routes, without introducing an abort. Open questions it must settle,
> none of which I answer: whether the signal is observability-only (a log row on
> the existing convention) or user-visible (a field, and therefore a migration
> and a disclosure); whether `engine.ts:390`'s whole-run caller changes in the
> same item or a later one; and whether a failed inference should change
> BEHAVIOUR at all (for instance refusing rather than grading under stem-derived
> names), which is a product call and belongs to the owner, not to a seat.
> Recorded in section 10 as **RES-I-1**.

**One thing I will say, because it is measurement and not design:** the
observability-only variant is entirely invisible to every test in this repo
(nothing renders, and there is no log assertion convention I found on this path),
so it would ship with an owner-verification instrument and nothing else. The
user-visible variant is testable. That asymmetry should be on the table when the
item is scoped, and it is the reason I do not think this is a trivial follow-up.

---

## 8. Question 3: what wave 4's brief must require

Concrete, in the brief's own terms. R1-R6 are obligations on the brief, not
requirement ids.

**R1 - a NEW test file, not an addition to `extraction.test.ts`.**
`src/lib/grade/extraction.inference.test.ts`, hosting I1, I2 and I5. Bound
`-le 200`. Two reasons and the second is the decisive one:

- `extraction.test.ts` is 330 on both counters against W4's own `-le 380`. I1+I2+I5
  plus a `../llm` mock block, the fixture builder and their comments is about +65,
  landing near 395. **That busts the bound**, and raising a bound to fit an
  instrument is the wrong direction of accommodation.
- **`vi.mock` is module-scoped and hoisted.** Adding `vi.mock("../llm", ...)` to
  `extraction.test.ts` changes the module environment for all of its existing
  describe blocks. Measured: the counter finds `inferFileNameConvention` in **0**
  test files, so none of them should notice - but "should not notice" is exactly
  the claim that costs a wave. A new file has zero blast radius on those 330
  lines.

The specifier must be **`"../llm"`**, matching `rubric.ts:1`'s own
(`import { callLlm, type LlmProvider } from "../llm";`) and matching
`reconcile.test.ts`'s existing successful mock of the same module from the same
directory. **Never `vi.mock("fetch")` or `vi.stubGlobal("fetch", ...)`** -
`vitest.setup.ts` throws on any real fetch and that throw is load-bearing; the
model seam here is `callLlm`.

**R2 - the new file is added to every path list from W4's gate onward.** W4's
`test:paths` line gains it; the design's 47-path GATE list becomes 48 at W7
(design section 15 Group A item 12). `npm run test:paths` refuses with exit 1 and
runs nothing if any argument is absent (`paths-gate.ts:42`, `cli.ts:36`), so the
new path must not be added to any list that runs BEFORE the file exists. The three
repo-wide gates need no change - they walk directories and collect new files
automatically.

**R3 - `grading-incremental.test.ts`'s bound rises from `-le 300` to `-le 360`.**
I3 plus I4's repairs and their comment rewrites are about +45 on top of the plan's
own +65 and +15-to-25, landing near 325. `-le 300` is the wave plan's own
per-wave floor, not the design's; the design's item-wide bound is `-le 420`
(`docs/a39-fill-waves.md:879`), so `-le 360` stays inside it. **This is a plan
bound adjustment, not a design change**, and the brief should say so in those
words.

**R4 - THE REPAIR THE PLAN DOES NOT PRICE, and it must not be a deletion.**
`docs/a39-fill-waves.md:910-911` says all eight existing `it(` blocks stay green
with no repair. Measured (6.3): a bare `vi.fn()` resolving `undefined` still
records **invocations=1**, so:

| Line | Fixture | After W4 | Required repair |
|---|---|---|---|
| `:75` | colliding zip (`Homework Final.txt` / `Homework Draft.txt`) | **stays GREEN** - the refusal throws at `extraction.ts:145`, before the inference | **keep `not.toHaveBeenCalled()` verbatim.** It becomes LOAD-BEARING for the first time and is M4's only killer |
| `:91` | `AlvarezMaria/essay.txt`, `BrownTom/essay.txt` | **GOES RED** | `toHaveBeenCalledTimes(1)` |
| `:128` | Canvas path, `extractCanvasEntries` throws on the blocked fetch before any zip work | **stays GREEN** - the Canvas route does no filename grouping (design 4.1: "ZIP PATH ONLY") | keep `not.toHaveBeenCalled()`. It is now a real "the Canvas route pays nothing" assertion |
| `:163` | oversized entry; the budget loop runs AFTER `extractStudentEntries` | **GOES RED** | `toHaveBeenCalledTimes(1)` |

**The brief must forbid deleting `:91` and `:163`.** Deleting them is the cheap
repair and it destroys I4's negative half. Converting them to positive counts
turns the design's Group A item 8 GREP into an EXECUTED reachability assertion,
which is strictly better evidence than the grep it replaces. The grep stays as a
backstop.

**R5 - two comment rewrites, in the same commit, each a statement that becomes
false.** A frozen assertion beside a comment claiming an invariant it no longer
has is how a silenced guard becomes invisible.

- `grading-incremental.test.ts:49-58` - the RULING 118 note reading "asserting
  mockCallLlm was never called here is NECESSARY AND NOT SUFFICIENT - this module
  has no model-call site at all". **After W4 the module HAS one**, transitively
  through `extractStudentEntries`, so the assertion at `:75` becomes sufficient
  and load-bearing. Rewrite it to say that, and to say that `:91`/`:163` are now
  positive counts and why.
- `extraction.ts:130-134` - already RES-FILL-10's obligation. My addition: the
  rewrite must ALSO name the new test file as the contract's executed enforcer,
  because RES-FILL-10 correctly measured that no test pins the current comment
  and the new file is the first thing that pins any part of it.

**R6 - the watched-red order, non-negotiable.** Write I1 and I3 FIRST, against
the UNCHANGED `extraction.ts` and `grading-incremental.ts`, and **watch them go
RED** - at that point the names are `B_NAMES` and I1's `toEqual(A_NAMES)` fails.
Then implement. A frozen literal that has never been seen red is a check nobody
has proven discriminates, and this repo has shipped that shape.

Order inside the wave: I2 can and should be written and seen GREEN before
anything changes, since it pins today's behaviour. If I2 is not green before the
edit, the fixture is wrong and nothing built on it is trustworthy.

---

## 9. Executable here versus ARGUED

Split honestly, per the seat brief. "Executed" below means I ran the production
code and read the output; it does not mean I ran vitest.

**EXECUTED (section 1's harness), values in section 4.2 and 6.3:**

- `extractSubmissions` yields exactly the four expected keys and `zipParents: {}`.
- `decideCollisionRefusal` returns `{status:"ok"}` on the fixture. C3 holds.
- `extractStudentEntries(buf)` with no option yields `B_NAMES` and `B_FILES`.
- `inferFileNameConvention` with a stubbed `callLlm` yields a 4-entry `byRaw` and
  4-entry `byBase` through the real `parseInferredFileNameLookup`, from a FENCED
  response.
- `groupSubmissionsByStudent` with that lookup yields `A_NAMES`, `A_FILES`,
  `mergedFileCount [2,2]`.
- An empty lookup, an `undefined` lookup, `{ok:false}`, and a stub resolving
  `undefined` ALL yield `B_NAMES`, and all three of the latter record
  `invocations=1`.
- `normalizeStudentDisplay("  Ada   Lovelace ") === "Ada Lovelace"`, and removing
  it yields four rows instead of two.
- C4: `"Lovelace"` and `"Hopper"` appear in no fixture path or body.
- Every symbol count in section 2, via RULING 135's two instruments.
- Both line counters on all five files in section 2.

**ARGUED, not verified - and I will not assert any of these as measured:**

- **That vitest will host the new file's `vi.mock("../llm", ...)` without
  disturbing anything.** Argued from `reconcile.test.ts` mocking `../llm` and
  `grading-incremental.test.ts` mocking `@/lib/llm` from the same tree, plus the
  measured zero test-file occurrences of the symbol. I did not run vitest.
- **That `@/lib/llm` and `../llm` resolve to the same module for `vi.mock`
  purposes.** Argued from `grading-incremental.test.ts` already relying on it
  (it mocks `@/lib/llm` and reaches `callLlm` through `../llm` chains). Read,
  not run. If it turns out false, the new file's mock specifier is the one thing
  to change and I3's host already uses the working form.
- **Every RED and GREEN in section 6.** I ran no source mutation. What is
  executed is the STATE each mutation lands in; the inference from state to
  verdict is a reading of the assertions I specify.
- **The line-cost estimates in R1 and R3** (+65, +45). Derived from the assertion
  and fixture content, not from a written file.
- **That `:128` stays green after W4.** Argued from `extractCanvasEntries` doing
  no filename grouping (design 4.1's table) and from the fetch trap throwing
  before the zip branch is reachable. Not run.
- **Anything about markup, focus, keyboard behaviour or what the instructor
  sees.** No component is rendered by any test here. Item #9's user-visible
  half - that the two routes' tables show the same names - stays an
  owner-verification item; nothing in this document changes that.

---

## 10. Residual register

Owner, instrument, and the step that will measure it. Any row missing one of the
three is a deletion and would be called that.

| id | What | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| **RES-I-1** | The silent fallback (section 7): "the model call failed" and "the model found no convention" are one value. A real grade can post under a stem-derived name with no signal anywhere | **the repo owner**, as a scoping decision - it is a production change with a live-path blast radius and a possible user-visible disclosure | **none exists today and I designed none.** The section 3 instrument does NOT cover it: I1 discriminates a failed inference in the TEST because it controls the mock, which is not the same as the product discriminating it at runtime | a NEW scoped item. Not W4, not A39. Section 7.3 lists the three questions it must settle |
| **RES-I-2** | Passing-but-wrong #4 (5.2): an implementer could pass `inferFileNamesWith` on `grading.ts:859`'s EMBEDDED branch, which must never make a model call. I1-I5 are all green under that mistake | the implementer of W4, then W4's verifier | `grep -c "inferFileNamesWith" src/app/actions/grading.ts` -> 0, with a canary (`grep -c "inferFileNamesWithZZZ"` -> 0, exit 1) proving the grep fires on the real name. **This is a GREP, not a test, and it is the whole instrument** | W4's gate, pasted. Already the design's Group A item 8 and RES-FILL-10; recorded here because I could not build a test for it and will not claim I did |
| **RES-I-3** | Item #9's user-visible half: that the two routes' tables show the SAME names for the same zip | **the repo owner** | none in this repo - no component renders and the flag is off. A two-route walk with the flag flipped locally | W7's owner walk (design section 12). Unchanged by this document; restated so it is not mistaken for closed by I1-I5 |
| **RES-I-4** | The symbol counter's two instruments do NOT reconcile on 4 of 10 files for `extractStudentEntries` (section 2). Nothing here rests on it, but the tool's own header calls a mismatch a real disagreement | whoever next needs a per-file split for that symbol | `countSymbolOccurrences`'s `instrumentsReconcile` field, already false on those four | the next pass that needs that number. Reported, not investigated |

**RES-P-3 itself is DISCHARGED by this document**, in the terms it set: it asked
the test seat to "either supply an instrument that proves the derived student NAME
changes, or record item #9's effect as owner-verification with a step." I supplied
the instrument (I1-I5, four discriminating mutants, one surviving control), and I
separately kept the user-visible half as owner verification (RES-I-3), because
the two are different claims and only one of them is buildable here.

---

## 11. What I could NOT determine

Stated plainly, because a seat that reports only what it settled is not
reporting.

1. **Whether vitest hosts the new file cleanly.** Section 9's first two argued
   rows. I did not run vitest and I will not claim the mock mechanics as
   verified. The failure mode if I am wrong is loud (a module resolution error or
   a real-fetch throw), not silent, which is why I consider the residual
   acceptable rather than blocking.
2. **Whether `resolveRunHeader` (W2's new module, which does not exist yet) makes
   a `callLlm` call on I3's fixture.** With a non-blank `rubric` on the form data
   the rubric-synthesis branch should not fire, and `extractRubricCriteria`
   (`rubric.ts:27`) is pure - but I cannot read a file that has not been written.
   **The mitigation is built into I3 and I4 rather than left to hope**: the
   mocked `callLlm` must DISPATCH on whether the prompt text contains the
   fixture's own raw filenames (a property the test owns) and return
   `{ok:false,status:500,body:"unexpected prompt"}` otherwise. Do NOT dispatch on
   any wording from `buildFileNameConventionPrompt` - that is source-text
   over-specification and this repo has twice had assertions force contorted
   implementations. EXECUTED: the prompt does carry the raw filenames
   (`prompt carried the fixture's raw filenames: true`). This also makes I4's
   `toHaveBeenCalledTimes(1)` robust: if W2 adds a second call, the count must be
   re-derived, and the brief should say the number is a MEASURED value to
   re-take at W4's gate, not a constant to defend.
3. **Whether `Object.keys` ordering from `extractSubmissions` is stable enough to
   pin unsorted arrays.** It was my JSZip insertion order in every run, but I did
   not vary it. **Every array assertion in I1-I3 must therefore be `.sort()`ed**,
   which is what section 4.2's measured `A_FILES` already reflects. A row's
   `mergedFileCount` is order-independent and can be asserted bare.
4. **Whether `docs/a39-waves.md` or `docs/BACKLOG.md` need lines for R1's new
   path or R3's bound raise.** I do not write those files and I did not check
   their current text for a claim my requirements falsify. The brief consuming
   this document should check, the way W1's brief was made to check
   `docs/a39-waves.md:1651`.
5. **Whether the four paths in my opening `git status --short` have since
   changed.** They are a concurrent seat's and I did not re-check them at the end
   of the pass, because re-reading them proves nothing about my own write set -
   the claim I stand behind is that this document is the only file I wrote.
