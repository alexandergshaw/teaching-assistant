# RES-FILL-6: enforcing instrument for RULING 57's rubric-provenance stamp

Test-notes seat (loop-test-author). An implementer builds the tests from these
notes; a fresh loop-checker reads them first. This document decides WHAT is
measured, by WHICH instrument, and in WHICH direction it fails. It writes no
test code and touches no file but itself.

Every quantity below names the command that produced it, run in this checkout
on 2026-09-29 from the Bash tool (Git Bash) at the repo root.

---

## 0. TL;DR for the implementer and the checker

- The rule to enforce (RES-FILL-6, backlog.yml:955-966): every function
  producing a `GradingRun` must have rubric provenance
  (`rubricUsed`/`rubricFingerprint`) stamped on the run it returns.
- **The tree has MOVED since the row was filed.** The row names 6 stamp call
  sites and a "new run-header.ts producer". The producer grep today yields
  **nine** return-type matches, not six, and **run-header.ts is not a producer
  at all** (it returns `GradingRunHeader`, not `GradingRun`). Section 2 has the
  measurements.
- **The naive instrument the row sketches - "scan for the return-type pattern
  and assert each matching function's body contains a `stampRubricProvenance`
  call" - is WRONG for this tree.** It produces THREE false positives today,
  because three legitimate producers return an already-stamped run without
  calling the stamp in their own body (Section 4). Shipping it would force
  either a hand-maintained exception list (the very anti-pattern RES-FILL-6 is
  about) or spurious double-stamping (which `run-header.ts:21-30` explicitly
  forbids).
- **No type construction makes the bad state unrepresentable here** (Section 3).
  The producers are spread across files, return the bare type, the branded
  fields are optional (`| undefined`), and `as StampedRubricText` casts are
  permitted in producers. So the fallback the task names applies: a
  source-derived scan plus behavioural checks.
- **The honest design is TWO instruments, not one** (Section 5). No single
  instrument both discovers new producers AND verifies stamping without false
  positives. Instrument A (a source-scan canary) catches "a new producer was
  added"; Instrument B (behavioural drivers over the production path) catches
  "a producer stopped stamping / stamps the wrong text". Neither alone satisfies
  the row's "both directions"; together they do.
- **There is a residual gap I am NOT claiming to close** (Section 9): the
  return-type regex only sees `function`-declaration producers returning bare
  `GradingRun` / `Promise<GradingRun>`. An arrow-function producer, or one
  returning `GradingRun | null` or `Promise<GradingRun | null>`, is invisible to
  it. That gap is named with an owner and a step, not papered over.

---

## 1. What the rule actually is (read from source, not recalled)

RULING 57/58 lives only as a comment at
`src/lib/grade/rubric-provenance-stamp.ts:1-27`. Read against the code it
describes, the invariant it protects is:

> Every rendered `GradingRun` carries a `rubricUsed`/`rubricFingerprint` pair
> that was produced by `stampRubricProvenance` on the EXACT rubric text this run
> was graded against - present (branded) for a non-blank rubric, and `undefined`
> for a blank one - and never a value read back from a different source.

The load-bearing subtlety, which decides the whole instrument: **the stamp does
not have to happen in the producer's own body.** RULING 57 already excludes
`stripGradingRunForDraft` because it "transforms an already-produced run, it
does not produce one" (`rubric-provenance-stamp.ts:9-11`). The same reasoning
applies to any producer that returns a run stamped one hop upstream. So the
faithful reading is "stamped somewhere on the path", not "stamped at the
producer". An instrument that demands a stamp call in the producer body is
STRICTER than the rule and mismeasures it. This is the crux the task flagged
(its point 3), and the tree answers it decisively (Section 4).

---

## 2. Measured facts

### 2.1 The producer set (return-type pattern), non-test

Command (the row's own grep):

```
grep -rnE "\)\s*:\s*(Promise<)?GradingRun>?\s*\{" src --include=*.ts | grep -v "\.test\.ts"
```

Output - **nine** matches:

```
src/app/actions/grading-run-mapping.ts:38:): GradingRun {
src/app/components/grading/incrementalRunPlan.ts:260:export function buildIncrementalRun(params: BuildIncrementalRunParams): GradingRun {
src/lib/embedded-grader/discussion.ts:442:): GradingRun {
src/lib/embedded-grader/index.ts:125:): GradingRun {
src/lib/grade/engine.ts:198:): Promise<GradingRun> {
src/lib/grade/engine.ts:371:): Promise<GradingRun> {
src/lib/grade/engine.ts:437:): Promise<GradingRun> {
src/lib/grade/engine.ts:452:): Promise<GradingRun> {
src/lib/workflows/grading-review-rows.ts:90:export function stripGradingRunForDraft(run: GradingRun): GradingRun {
```

Resolved to function names (each name read from the signature that owns the
matched `): GradingRun {` line):

| # | Path :: function | Match line | Stamps how |
|---|---|---|---|
| 1 | `grading-run-mapping.ts` :: `gradingApiToRun` | :38 | FRESH - `...stampRubricProvenance(rubricText ?? "")` at :42 |
| 2 | `incrementalRunPlan.ts` :: `buildIncrementalRun` | :260 | PASS-THROUGH - passes `header.rubricUsed`/`header.rubricFingerprint` (stamped upstream in `resolveRunHeader`) as `StampedRubricText` at :273-274; no own stamp call |
| 3 | `embedded-grader/discussion.ts` :: `gradeDiscussion` | :442 | FRESH - `...stampRubricProvenance(renderDiscussionRubric(rubric))` at :498 |
| 4 | `embedded-grader/index.ts` :: `gradeEntriesEmbedded` | :125 | FRESH - `...stampRubricProvenance(renderRubricText(rubric))` at :227 |
| 5 | `grade/engine.ts` :: `gradeStudentEntries` | :198 | FRESH - `...stampRubricProvenance(rubric)` at :360 |
| 6 | `grade/engine.ts` :: `gradeSubmissions` | :371 | MIXED - empty-return branch stamps at :411; main branch DELEGATES to `gradeStudentEntries` (:415) |
| 7 | `grade/engine.ts` :: `gradeEntries` | :437 | PASS-THROUGH - body is `return gradeStudentEntries(...)` (:438); no own stamp call |
| 8 | `grade/engine.ts` :: `gradeCanvasUrl` | :452 | MIXED - empty-return branch stamps at :466; main branch DELEGATES to `gradeStudentEntries` (:479) |
| 9 | `workflows/grading-review-rows.ts` :: `stripGradingRunForDraft` | :90 | TRANSFORM - `return { ...run, results: ... }` (:91); preserves the incoming run's pair via `...run`; RULING-57-EXCLUDED |

### 2.2 The stamp call sites, non-test

Command (the row's own grep):

```
grep -rn "stampRubricProvenance" src --include=*.ts | grep -v "\.test\."
```

The lines that are actual CALLS (`stampRubricProvenance(` in code, not an
import, a re-export, a comment, or the definition):

```
src/app/actions/grading-run-mapping.ts:42
src/lib/embedded-grader/discussion.ts:498
src/lib/embedded-grader/index.ts:227
src/lib/grade/engine.ts:360
src/lib/grade/engine.ts:411
src/lib/grade/engine.ts:466
src/lib/grade/run-header.ts:50
```

Seven call sites. Six of them sit inside producers (rows 1,3,4,5, and rows 6/8's
empty branches). The seventh, `run-header.ts:50`, is inside `resolveRunHeader`,
which is NOT a producer (Section 2.4).

The other `stampRubricProvenance` hits from the grep are non-calls and MUST be
excluded by any scan: the definition (`rubric-provenance-stamp.ts:35`), the
barrel re-export (`grade.ts:4`), the import lines (`discussion.ts:16`,
`index.ts:16`, `engine.ts:38`, `run-header.ts:2`), and prose in comments
(`engine.ts:34`, `run-header.ts:26`, `types.ts:334/360/375`). Matching
`stampRubricProvenance(` (with the open paren) over comment-stripped source
excludes the imports/re-exports (no paren) and the comments (stripped); the
DEFINITION line has a paren, so it must be excluded by path.

### 2.3 The RULING 57 comment is itself already stale - direct evidence for the row

`rubric-provenance-stamp.ts:4-8` says the producer grep gives "five hits" and
then lists seven named functions, and its enumeration omits `buildIncrementalRun`
entirely (added by the same A39 fill). So the hand-maintained comment count
(five) disagrees with its own hand-maintained list (seven named) and with the
measured grep (nine). This is exactly the failure RES-FILL-6 describes: a rule
kept as a comment whose count has silently drifted. Do not trust the comment's
"five"; trust the grep, re-run.

### 2.4 run-header.ts is NOT a producer - reconciling the task's wording

The task and the row title both call `run-header.ts` a "new producer". Measured,
it is not one. `resolveRunHeader` returns `Promise<GradingRunHeader>`
(`run-header.ts:37`), and the return-type regex correctly excludes it: after
`GradingRun` the source reads `Header>`, and the pattern's `GradingRun>?\s*\{`
cannot match `Header` (confirmed - `run-header.ts` is absent from the 2.1
output). The comment at `run-header.ts:21-30` says so in words: "It is not a
GradingRun producer - it stamps the pair for a run-level header, not for a
rendered run". Its provenance role is nonetheless enforced by this guard,
because the actual producer that consumes the header - `buildIncrementalRun`
(row 2) - passes the header's pair through and IS in scope. So run-header.ts is
correctly out of scope for a GRADING-RUN-producer guard, and the guard still
covers the run it feeds.

---

## 3. Why a type construction is not feasible here

The seat brief prefers a construction that makes the bad state unrepresentable
over a scan that can be fooled. I checked whether one exists and it does not:

- `rubricUsed`/`rubricFingerprint` are typed `StampedRubricText | undefined`
  (`rubric-provenance-stamp.ts:35-38`, and the fields on `GradingRun` in
  `types.ts`). The `undefined` arm is REQUIRED - a blank-rubric run legitimately
  carries `undefined` for both (`rubric-provenance-stamp.ts:39-41`). So "omit
  the fields" and "set them undefined" are both type-legal, and a producer that
  simply never sets them type-checks.
- The brand `StampedRubricText` is producible three ways: `stampRubricProvenance`,
  `restoreStampedRubricText`, and a raw `as StampedRubricText` cast.
  `buildIncrementalRun` uses the cast at `incrementalRunPlan.ts:273-274`, so
  casts are an accepted producer idiom and cannot be banned without breaking a
  real, correct producer.

Because the producers are spread across files, return the bare `GradingRun`
type, carry optional branded fields, and are permitted to cast, the type system
cannot force a stamp. This is precisely the case the task names as the one where
"a source-derived set-comparison is the fallback". I adopt that fallback, plus
behavioural checks, and say why below.

---

## 4. Why the naive body-scan is WRONG - attack the row's own sketch

The row sketches: scan for the return-type pattern, assert each matching
function's body contains a `stampRubricProvenance` call. Run that check against
TODAY's correct tree and it goes RED on three producers:

- `gradeEntries` (engine.ts:437-439): body is `return gradeStudentEntries(...)`.
  No `stampRubricProvenance` text anywhere in its body. **False positive** - the
  run it returns is correctly stamped by `gradeStudentEntries`, proven green by
  the existing `rubric-stamp.wiring.test.ts:55-74`.
- `buildIncrementalRun` (incrementalRunPlan.ts:260-276): no `stampRubricProvenance`
  text; it passes through the header's already-stamped pair. **False positive.**
- `stripGradingRunForDraft` (grading-review-rows.ts:90-92): no
  `stampRubricProvenance` text; RULING 57 explicitly excludes it. **False
  positive.**

So the naive instrument reports three unstamped producers on a tree where all
three are correct. Its only "fixes" are a hand-maintained exception list (the
anti-pattern RES-FILL-6 exists to kill) or adding spurious stamp calls to
pass-through producers, which double-stamps and is forbidden by
`run-header.ts:21-30`. **The implementer must build this naive check once, run
it, and watch it report those three, as proof of why the shipped design does not
use it.** (This is the seat's "attack your own guard before shipping it"
obligation, discharged against the tempting-but-wrong instrument.)

---

## 5. The design: two instruments

No single instrument both (a) mechanically discovers a NEW producer and
(b) verifies stamping without false-positiving the pass-through producers.
Discovery must be a source scan (behavioural tests cannot enumerate functions
that do not yet have a driver); faithful stamping verification must be
behavioural (source presence mismeasures pass-through). So the guard is a pair,
and each half owns one direction of failure.

### Instrument A - the producer-set canary (source scan)

**What it measures:** the SET of GradingRun producers in `src/`, derived live
from the return-type pattern, compared against a frozen, classified expected
set.

**How (for the implementer):**

1. Import `walkFiles` and `stripComments` from
   `src/app/components/ui/modalAdoptionSourceScan.ts`. This is a plain `.ts`
   leaf (not a `.test.ts`), already imported by other test files, so importing
   it does NOT re-run any describe block. Do NOT hand-roll a comment stripper:
   `stripComments` is the RULING 79 character-scanning tokenizer that handles
   block comments, strings, templates and regex literals and is CRLF-safe by
   construction (it scans char-by-char). The naive `/\/\/.*$/` line idiom is
   trailing-comment-blind and cannot see `/* */`; this file's own comments (both
   RULING 57 and run-header) are block comments, so a naive stripper would let a
   commented `stampRubricProvenance(` or a commented `GradingRun {` leak in.
2. Walk `src` for `*.ts` files, EXCLUDING any name ending `.test.ts`. Read each,
   `stripComments` it.
3. Over the stripped source of each file, run the producer regex as a JS RegExp:
   `/\)\s*:\s*(?:Promise<)?GradingRun>?\s*\{/g`. For each match, resolve the
   owning function name by taking `stripped.slice(0, match.index)` and finding
   the LAST `/function\s+([A-Za-z0-9_$]+)/g` match in it. Emit
   `"<repo-relative-posix-path>::<name>"` (use `toRepoRelativePosix` from the
   same leaf for the path). Exclude `rubric-provenance-stamp.ts` from the walk
   is NOT needed for this scan (it defines no GradingRun producer), but the
   stamp-call scan in Instrument-A-optional below must exclude it.
4. Assert SET EQUALITY, both directions, against the frozen `EXPECTED_PRODUCERS`
   (Section 6): `derived \ expected` must be empty (a NEW producer forces a
   red until it is added and classified) AND `expected \ derived` must be empty
   (a removed/renamed producer forces a red). Use a sorted-array `toEqual`, or
   two `expect([...set]).toEqual([])` difference assertions, so the failure
   message names the offending entry.

**Why the frozen set is NOT the anti-pattern the task warns against.** The
anti-pattern is freezing a filename list AS the producer set, which a new
producer silently bypasses. Here the producer set is DERIVED LIVE from the
pattern every run; the frozen `EXPECTED_PRODUCERS` is a canary the live set is
checked against - the same shape as this repo's endorsed `HEADLESS_SAFE_STEP_TYPES.size`
canary (memory: "Headless count canary"; bump it in the same commit that changes
the set). A new producer changes the live derivation and breaks the canary; it
cannot be added silently. State this explicitly in the test file's header so the
checker does not read the frozen list as the anti-pattern.

**Direction it catches:** a NEW producer added without being classified ->
`derived \ expected` non-empty -> RED. This is direction B of the row.

**What it does NOT catch (state this in the test, do not imply otherwise):** a
producer that STOPS stamping. Deleting a stamp call does not change any
signature, so the derived set is unchanged and the canary stays GREEN. That
direction is Instrument B's job.

### Instrument A-optional - a stamp-call cross-check (source scan, weak)

A cheap addition that raises the cost of the pass-through-vs-miss ambiguity, but
DOES NOT resolve it and MUST NOT be trusted alone: over the same stripped
source, collect the set of files containing a `stampRubricProvenance(` call
(excluding `rubric-provenance-stamp.ts`, the definition), and assert it equals a
frozen `EXPECTED_STAMP_CALLER_FILES` set. This catches an import/call being
removed at the file granularity, and it makes `run-header.ts:50`'s stamp call
enforced against silent removal too. It is explicitly WEAK: it cannot tell a
pass-through producer from a miss, which is why Instrument B exists. If the
implementer finds this second frozen set adds only noise, it may be dropped -
say so - but the primary canary (A) and the behavioural suite (B) are not
optional.

### Instrument B - behavioural drivers over the production path

**What it measures:** for each producer, drive it through the real production
path (mocking only the model/canvas seams, per `vitest.setup.ts`'s network
block) with a KNOWN rubric text, and assert the returned run's
`rubricUsed`/`rubricFingerprint` equal the frozen expectation - which is
`stampRubricProvenance(<known text>)` for a non-blank rubric and `undefined`
for a blank one. This is the ONLY faithful enforcement of stamping, because it
checks the OUTPUT, so it works uniformly for FRESH, PASS-THROUGH and MIXED
producers alike.

**Precedent and seam discipline.** `rubric-stamp.wiring.test.ts:55-74` already
does exactly this for `gradeEntries` (mocking `../llm`'s `callLlm`, `../gemini`,
`../code-runner`). Follow that file's mocking pattern. Do NOT import a helper
from it - duplicate `entry()` and `OK_RESPONSE_TEXT` (memory: "No cross-test-file
imports"; importing from a `*.test.ts` re-runs its describe blocks). For the
Canvas path, mock `../canvas` (the dynamic import in `gradeCanvasUrl`), never the
platform `fetch` (memory + traps-tests: a live 401 once made a sabotage pass).

**The oracle (frozen construction, per producer).** The expected pair is not a
recalled literal; it is CONSTRUCTED at test time from the known input by calling
the production `stampRubricProvenance` / `rubricFingerprint` on the SAME text the
test feeds the producer - this is what `rubric-stamp.wiring.test.ts:72-73`
already does (`expect(run.rubricFingerprint).toBe(rubricFingerprint(rubricText))`).
Guard against the tautology trap: the test must also assert that the text SENT to
the model (or, for pass-through producers, the text on the header/input) is the
SAME text being stamped - `rubric-stamp.wiring.test.ts:66-70` does this via the
mock's captured `contents`. Without that anchor a producer could stamp an
arbitrary string and pass. Carry that anchor into each new driver where a model
seam exists.

Per-producer driver notes:

| Producer | Drive it by | Assert |
|---|---|---|
| `gradeEntries` (engine.ts) | ALREADY COVERED at `rubric-stamp.wiring.test.ts:55-74` - keep it | pair equals `stampRubricProvenance(rubricText)` |
| `gradeStudentEntries` (engine.ts) | same mock set, one non-empty entry, non-blank rubric | pair equals stamp of rubric; sent text contains rubric |
| `gradeStudentEntries` blank-rubric case | same, rubric `""` | both fields `undefined` |
| `gradeSubmissions` (engine.ts) | empty-students path: mock `./extraction` `extractSubmissions` to return no submissions and `attemptedSupportedFiles: 0` -> hits :407-412 | pair equals stamp of rubric (empty branch) |
| `gradeCanvasUrl` (engine.ts) | empty-students path: mock `../canvas` `fetchCanvasWork` to return `{ students: [] }` -> hits :462-467 | pair equals stamp of rubric (empty branch) |
| `gradingApiToRun` (mapping.ts) | pure/sync; pass a `GradingApiResponse` + `rubricText` | pair equals `stampRubricProvenance(rubricText)`; and with `rubricText` omitted, both `undefined` (the `?? ""` path) |
| `gradeDiscussion` (discussion.ts) | mock the model seam this module uses; pass a rubric | pair equals `stampRubricProvenance(renderDiscussionRubric(rubric))` |
| `gradeEntriesEmbedded` (index.ts) | mock the model seam; pass a rubric | pair equals `stampRubricProvenance(renderRubricText(rubric))` |
| `buildIncrementalRun` (incrementalRunPlan.ts) | pure/sync; pass params with a `header` whose `rubricUsed`/`rubricFingerprint` are a known stamped value | run's pair === the header's pair (pass-through proven, not asserted) |
| `stripGradingRunForDraft` (grading-review-rows.ts) | pure/sync; pass a run whose pair is a known stamped value | run's pair SURVIVES the transform unchanged (this is what makes the RULING-57 exclusion safe, and pins it) |

Every one of these is a pure function or a mocked-seam path. **None renders a
component**, so all are executable under this repo's node-env vitest. Confirm the
model seam each embedded grader uses by opening the file before writing the mock
(the discussion/embedded graders may call a different seam than `../llm`); do not
assume it matches engine.ts.

**Direction it catches:** a producer that stops stamping, or stamps the wrong
text -> its driver's asserted pair no longer matches the constructed expectation
-> RED. This is direction A of the row, and it is the direction the row notes was
UNCAUGHT (the wave gate stayed green with all three engine stamps deleted because
nothing executed the producers - `rubric-stamp.wiring.test.ts:3-11` records that
exact history).

---

## 6. The frozen oracle: `EXPECTED_PRODUCERS`

A construction, not a recalled list. It is built by running the Section 2.1
command and classifying each entry. Freeze it as an array the test sorts and
compares the live-derived `path::name` set against. Each entry also carries a
`disposition` and a `coveredBy` pointer, which are the human-maintained metadata
a new producer must be given (the set-equality is over `path::name` only - the
mechanically derivable part - so the metadata cannot itself drift the equality):

```
EXPECTED_PRODUCERS = [
  { id: "src/app/actions/grading-run-mapping.ts::gradingApiToRun",              disposition: "fresh",        coveredBy: "behavioural: gradingApiToRun driver" },
  { id: "src/app/components/grading/incrementalRunPlan.ts::buildIncrementalRun", disposition: "pass-through", coveredBy: "behavioural: buildIncrementalRun driver (header pass-through)" },
  { id: "src/lib/embedded-grader/discussion.ts::gradeDiscussion",               disposition: "fresh",        coveredBy: "behavioural: gradeDiscussion driver" },
  { id: "src/lib/embedded-grader/index.ts::gradeEntriesEmbedded",              disposition: "fresh",        coveredBy: "behavioural: gradeEntriesEmbedded driver" },
  { id: "src/lib/grade/engine.ts::gradeStudentEntries",                        disposition: "fresh",        coveredBy: "behavioural: gradeStudentEntries driver" },
  { id: "src/lib/grade/engine.ts::gradeSubmissions",                           disposition: "mixed",        coveredBy: "behavioural: gradeSubmissions empty-branch driver + delegation" },
  { id: "src/lib/grade/engine.ts::gradeEntries",                               disposition: "pass-through", coveredBy: "behavioural: rubric-stamp.wiring.test.ts:55-74" },
  { id: "src/lib/grade/engine.ts::gradeCanvasUrl",                             disposition: "mixed",        coveredBy: "behavioural: gradeCanvasUrl empty-branch driver + delegation" },
  { id: "src/lib/workflows/grading-review-rows.ts::stripGradingRunForDraft",   disposition: "transform-excluded", coveredBy: "behavioural: stripGradingRunForDraft pair-survives driver" },
]
```

"Stamped" for the canary means only "present in the classified set with a
disposition and a coveredBy". The canary does NOT judge stamping - it judges
that every producer is KNOWN and ROUTED to a behavioural check. The stamping
itself is judged by Instrument B.

The nine entries are the derivation of the 2.1 command; re-run it at
implementation time in case the tree moved again, and reconcile any delta before
freezing.

---

## 7. Sabotages, both directions, with discrimination stated per instrument

Each mutation is applied to production code, the suite is run, then restored.
Use a `cp` backup for restore, never `git checkout --` on an uncommitted file
(memory: "Sabotage restore needs a copy").

### DIRECTION A - a producer stops stamping (row's "a producer could stop stamping")

- **A1 (primary kill).** Delete `...stampRubricProvenance(rubric)` at
  `engine.ts:360`.
  - Instrument A (canary): GREEN - signature unchanged. **Does NOT discriminate**
    (stated so nobody banks it as a kill).
  - Instrument B (`gradeStudentEntries` / `gradeEntries` driver): RED -
    `run.rubricUsed` becomes `undefined`, not the rubric text. **DISCRIMINATES.**
  - Restore -> GREEN.
- **A2 (content, not presence).** Change `engine.ts:360` to
  `...stampRubricProvenance("")` (stamp blank text against a non-blank rubric).
  - Instrument B: RED - pair becomes `undefined` while the driver expects the
    stamp of a non-blank rubric. **DISCRIMINATES**, and proves the driver checks
    the CONTENT, not merely field presence.
  - Instrument A: GREEN. Does not discriminate.
- **A3 (pass-through miss).** In `buildIncrementalRun` (incrementalRunPlan.ts:273),
  replace `header.rubricUsed as StampedRubricText` with
  `"" as StampedRubricText`.
  - Instrument B (`buildIncrementalRun` driver): RED - the run's `rubricUsed` no
    longer equals the header's. **DISCRIMINATES** - and this is a case the naive
    body-scan could never catch, because `buildIncrementalRun` never had a stamp
    call to lose.
  - Instrument A: GREEN. Does not discriminate.

### DIRECTION B - a new producer added without stamping (row's "a new producer be added without stamping")

- **B1 (primary kill).** Add to `src/lib/grade/engine.ts`:
  `export function makeBareRun(): GradingRun { return { results: [], rubricAreaNames: [], fullCreditChecklist: [] }; }`
  - Instrument A (canary): RED - `derived \ expected` gains
    `src/lib/grade/engine.ts::makeBareRun`. **DISCRIMINATES.**
  - Instrument B: GREEN - no driver exists for it. **Does NOT discriminate.**
  - Restore -> GREEN.
- **B2 (attack MY OWN guard - the known regex gap).** Add instead:
  `export const makeBareRun = (): GradingRun => ({ results: [], rubricAreaNames: [], fullCreditChecklist: [] });`
  - Instrument A (canary): GREEN - **THE REGEX MISSES IT.** The pattern requires
    `\{` after the return type and finds `=>` instead, and there is no
    `function <name>` to resolve. **Does NOT discriminate.** This is the residual
    gap of Section 9, demonstrated as a live miss, not argued. The implementer
    MUST run B2 and confirm the canary stays green, and the test header MUST
    state this boundary so no future reader believes the canary is total.
  - Instrument B: GREEN. Does not discriminate.

### The false-positive attack on my own design (must be run, must stay GREEN today)

- **FP1.** With NO mutation, run the full suite against today's tree. Both
  instruments must be GREEN. In particular the three pass-through/transform
  producers (`gradeEntries`, `buildIncrementalRun`, `stripGradingRunForDraft`)
  must NOT be flagged. If any is flagged, the instrument is wrong, not the tree.
- **FP2 (the naive comparator, for contrast only - do not ship it).** Build the
  row's naive body-scan (Section 4) and run it once: it must report exactly those
  three as unstamped. This is the evidence the shipped design deliberately does
  not use a body-scan. Delete it before finishing; it is a demonstration, not a
  test.

A sabotage that is red in both directions, or green in both, discriminates
nothing; every row above names WHICH instrument moves and WHICH does not, and
the "does not discriminate" lines are deliberate, not gaps.

---

## 8. Prove the red tests are satisfiable

The current tree, with all nine producers as measured, must be GREEN under both
instruments (FP1). It is, by construction:

- Instrument A: the frozen `EXPECTED_PRODUCERS` is built FROM the 2.1 derivation,
  so `derived === expected` today by definition.
- Instrument B: every producer's actual output carries the correct pair.
  `gradeEntries` is already proven green (`rubric-stamp.wiring.test.ts` passes in
  the suite today - the implementer confirms with
  `npx vitest run src/lib/grade/rubric-stamp.wiring.test.ts`). The other drivers
  assert the run's pair against `stampRubricProvenance(<same text>)`, which the
  producers produce by the calls measured in 2.1/2.2, or pass through from a
  value that was so produced.

So none of my requirements reports a producer unstamped today - i.e. I found no
real provenance BUG in the current tree; every producer's returned run is
correctly stamped or correctly passes one through. The one thing I found is the
STALE COMMENT (2.3) and the general unenforcedness the row already names. The
implementer should still run FP1 first: if a driver goes red on today's tree,
that is a real bug this guard just surfaced (report it), not a licence to weaken
the assertion.

Building a throwaway reference implementation is not applicable here: the
producers already exist and pass, so "satisfiable" is demonstrated by the tree
itself plus the existing green wiring test, not by a separate reference tree.

---

## 9. Executable here vs argued - and the residual gap

**Executable in this environment (node-env vitest, no render, network blocked):**

- Instrument A (the canary): fully executable. Reads source with `walkFiles` +
  `stripComments`, matches the regex, set-compares. No render, no network.
- Instrument A-optional (stamp-caller file set): fully executable.
- Instrument B (all ten drivers): executable. Each is a pure function or a
  path whose only external seams are the model (`callLlm`/embedded model) and
  Canvas, both mockable. The `gradeEntries` case is already green.
- Every sabotage in Section 7: executable.

**Argued, not executed by me (the implementer verifies):**

- That the discussion/embedded model seams mock cleanly the way `../llm` does -
  I did not open those two graders' model-call lines. The implementer opens them
  before writing the mock.

**RESIDUAL GAP - named, not closed.** The canary's regex only sees
`function`-declaration producers whose return type is bare `GradingRun` or
`Promise<GradingRun>`. It MISSES:

- an arrow-function producer (`const f = (): GradingRun => ({...})` or
  `=> {...}`) - the pattern requires `\{` after the type and `function <name>`
  to resolve a name; demonstrated live by sabotage B2;
- a producer returning `GradingRun | null` or `Promise<GradingRun | null>` -
  after `GradingRun` the source reads ` | null`, which the `>?\s*\{` tail cannot
  match (this is why `selectDisplayRun`, incrementalRunPlan.ts:280, returning
  `GradingRun | null`, is correctly absent from 2.1 - but a FRESH producer of
  that shape would be missed the same way);
- a producer that returns a run via a `StampedRubricText` cast without any stamp
  anywhere (Instrument B catches this only if a driver exists, which requires
  Instrument A to have discovered it first - so a missed discovery is a missed
  stamp check too).

None of these shapes exists in the tree today (all nine producers are
`function` declarations returning bare `GradingRun`/`Promise<GradingRun>`), so
the guard is complete for the CURRENT tree. It is NOT complete for all future
producers. Broadening the regex to also match `=>\s*[({]` and a `| null` tail is
possible but raises false-positive risk (arrow functions returning object
literals are common), so I do not silently fold it in. See the residual register.

---

## 10. Residual register

| # | What | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | Canary misses arrow-function and union-returning (`GradingRun \| null`) producers | the chunk that first adds such a producer, or a follow-up hardening pass | broaden the JS regex in Instrument A to also match `=>\s*[({]` return bodies and a `\| null` tail, then re-run sabotage B2 and confirm it flips to RED; re-run FP1 to confirm no new false positive | run the broadened canary against the tree; B2 must go RED, FP1 must stay GREEN |
| R2 | run-header.ts's `resolveRunHeader` stamp (`run-header.ts:50`) is enforced against removal only by Instrument A-optional's file-set check, not behaviourally | next chunk touching run-header.ts | a behavioural driver over `resolveRunHeader` asserting its `rubricUsed`/`rubricFingerprint` equal `stampRubricProvenance(effectiveRubric)` | drive `resolveRunHeader` with a known rubric; delete `run-header.ts:50` and confirm RED |
| R3 | The RULING 57 comment (`rubric-provenance-stamp.ts:4-8`) says "five hits" and lists seven, omitting `buildIncrementalRun` - stale, and it is what RES-FILL-6 is about | the RES-FILL-6 implementing chunk | manual: update the comment to match the nine measured producers, OR delete the enumeration and point at the new guard test as the enforcer | re-read the comment against the 2.1 command output |
| R4 | Whether Instrument A-optional (stamp-caller file set) earns its place or is noise | the RES-FILL-6 implementer | judgement during implementation | if it adds only a second frozen list with no new discrimination beyond Instrument B, drop it and say so in the test header |

R3 is the piece the row's own STEP assigns to the fill's commit ("updates the
RULING 57 comment by hand"); the enforcing test (Instruments A and B) is the
remaining obligation these notes specify.

---

## 11. Files the implementer will touch

- NEW: a structure/wiring test file under `src/lib/grade/` (suggested
  `rubric-provenance-producers.structure.test.ts` for Instrument A, and either
  the same file or an extension of `rubric-stamp.wiring.test.ts` for Instrument
  B - keep behavioural drivers with the existing wiring test's mocks where it
  reduces duplication, but do NOT import across test files).
- IMPORT ONLY (do not edit): `src/app/components/ui/modalAdoptionSourceScan.ts`
  for `walkFiles`, `stripComments`, `toRepoRelativePosix`.
- Run the multi-file suite with `npm run test:paths <p1> <p2> ...` if more than
  one test file is named (a raw multi-path `vitest`/`npm test` silently drops
  unmatched args); a single file may use `npx vitest run <path>`.
