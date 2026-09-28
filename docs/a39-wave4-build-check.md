# A39 wave 4 build check: concurrent, incremental grading

Fresh adversarial check by an agent that did not build this. Subject: the
uncommitted A39 wave 4 write set (waves 4a/4b/4c), plus the RULING 108
remediation that landed inside it. No prior artifact covers this:
`docs/a39-build-check.md` is titled "wave 2 and wave 3a-i, as built" and
contains two total matches for `wave 4|reconcile|incremental`
(`grep -c "wave 4\|reconcile\|incremental" docs/a39-build-check.md` -> `2`),
neither about this wave's files.

**Snapshot note.** The write set was uncommitted when this check began; it was
auto-committed mid-pass as `ceab414` ("feat(a39,a46,a40): concurrent incremental
grading, the owner-only guard it needed, and the reorder"). Every line citation
and every count below was taken before that commit and re-confirmed after it
(`wc -l src/lib/grade/engine.ts` -> 476, `GradingTab.tsx` -> 620, unchanged).
Nothing was reverted. `ceab414` also carries the A40 reorder work, which is NOT
under check here.

**Nothing under `src/` or `supabase/` was written, and no sabotage was applied.**
Two implementers were live on `CartridgeDropPanel.tsx`,
`CartridgeDropPanel.reorder.test.ts` and `componentStorageKeys.structure.test.ts`
during this pass; per the brief's own escape, mutations are NAMED rather than
applied. `npx tsc` and `npm run build` were NOT run (single-caller resources).
Every type-level claim below is a reading claim and says so.

**No component renders under this repo's vitest** (node env, collects only
`src/**/*.test.ts`). Every claim about the rendered incremental table, the
progress region, the Stop button and the double-table state is a READING claim.
The green suite reported below proves nothing about markup, focus or keyboard
behaviour.

---

## Verdict

**DEFECTIVE.**

| Severity | Count |
|---|---|
| BLOCKER | 5 |
| MAJOR | 6 |
| MINOR | 4 |

The mechanism the owner asked for is built and the attribution key is chosen
correctly: `sourceIndex` is fixed at ticket-build time, the pool's cursor claim
is atomic, and the hook deliberately ignores the server's echoed index. I could
not break attribution by interleaving, and I tried six ways.

What is wrong is everything AROUND the pool. Wave 4c makes the incremental route
the DEFAULT for the Gemini provider - the only provider this app grades with by
default (`DEFAULT_PROVIDER` at `src/lib/llm.ts:24`) - and that route renders a
DIFFERENT, thinner results surface that silently omits six things the whole-run
route produced, refuses one input the whole-run route refuses, generates no
rubric where the whole-run route generates one, and can render simultaneously
with the old surface showing a stale run. None of this is visible to any gate,
because no component renders here and the source-text wiring tests only assert
that the dropped strings still exist SOMEWHERE in the file - which they do, in
the now-secondary branch.

---

## 0. Write set, verified against the tree

`git status --short` at the start of this pass:

```
 M src/app/actions.ts
 M src/app/actions/action-guard-coverage.test.ts
 M src/app/components/CartridgeDropPanel.tsx          <- NOT this wave (live implementer)
 M src/app/components/GradingTab.tsx
 M src/app/components/autoGradeTransition.wiring.test.ts
 M src/lib/grade.ts
 M src/lib/grade/engine.ts
 M src/lib/module-graph/runtime-import-graph.test.ts
?? src/app/actions/action-guard-coverage-github-cohort.test.ts
?? src/app/actions/grading-incremental.test.ts
?? src/app/actions/grading-incremental.ts
?? src/app/api/grade-run-item/
?? src/app/components/CartridgeDropPanel.reorder.test.ts   <- NOT this wave
?? src/app/components/componentStorageKeys.structure.test.ts <- NOT this wave
?? src/app/components/grading/
?? src/lib/grade/reconcile.test.ts
?? src/lib/grade/reconcile.ts
```

**Two paths in the tree are NOT in the write set the brief gave me:**
`src/app/actions/action-guard-coverage.test.ts` (modified) and
`src/app/actions/action-guard-coverage-github-cohort.test.ts` (new). The brief
mentioned the new file only as the place where `GITHUB_FILES` now lists
`grading-incremental.ts`. In fact `action-guard-coverage.test.ts` lost 308 lines
- the entire `describe("R2 wave 0: GitHub-PAT cohort defaults to owner-only
(RULING 83)")` block plus `githubReachingActionFiles()`, `SRC_ROOT`,
`GITHUB_FILES`, `GITHUB_NOT_OWNER_ONLY` and
`GITHUB_FILES_PENDING_ENUMERATION` - to the new file. That is a relocation of
the repo's only live-closure privilege instrument, attributed in the new file's
header to RULING 101 rather than to RULING 108. **I audited the move before
reading the rest** (section 7). It is faithful and green; but it was not
declared to me, and a relocation of a safety instrument is exactly the shape
that hides a dropped assertion.

### Line counts, both counters

`wc -l` (Bash) and `@(Get-Content <path>).Count` (PowerShell) AGREE on every
file below - no 42-line disagreement here.

| Path | HEAD | Working tree |
|---|---|---|
| `src/lib/grade/engine.ts` | 527 | 476 |
| `src/app/components/GradingTab.tsx` | 566 | 620 |
| `src/app/actions/action-guard-coverage.test.ts` | 955 | 647 |
| `src/lib/grade/reconcile.ts` | - | 106 |
| `src/lib/grade/reconcile.test.ts` | - | 217 |
| `src/app/actions/grading-incremental.ts` | - | 116 |
| `src/app/actions/grading-incremental.test.ts` | - | 155 |
| `src/app/api/grade-run-item/route.ts` | - | 192 |
| `src/app/api/grade-run-item/route.test.ts` | - | 264 |
| `src/app/components/grading/incrementalRunPlan.ts` | - | 174 |
| `src/app/components/grading/incrementalRunPlan.test.ts` | - | 183 |
| `src/app/components/grading/useIncrementalGradingRun.ts` | - | 179 |
| `src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts` | - | 304 |
| `src/app/actions/action-guard-coverage-github-cohort.test.ts` | - | 420 |

HEAD values from `git show HEAD:<path> | wc -l`. The wave's claimed
`527 -> 476` and `566 -> 620` both hold exactly.

### Test runs

Both runs via `npm run test:paths -- <paths>`, exit code read from the command
(`$LASTEXITCODE`), and vitest's own counts read from its summary line.

Run 1 (the wave's own files plus the two touched instruments):
`Test Files 8 passed (8)`, `Tests 249 passed (249)`, `EXITCODE=0`.

Run 2 (structural gates and the engine's own suite):
`Test Files 7 passed (7)`, `Tests 107 passed (107)`, `EXITCODE=0` - covering
`action-guard-coverage.test.ts` (15), `engine.test.ts` (11),
`no-emojis.test.ts` (18), `file-size-ceiling.structure.test.ts` (3),
`source-bytes.structure.test.ts` (3), `gradingResultsHelpersWiring.test.ts`
(23), `gradingResultsExtraction.wiring.test.ts` (34).

The wave is GREEN. That is the problem, not the evidence.

---

## 1. BLOCKERS

### B1. The incremental route is the new default and drops six of the whole-run route's outputs

**Class: silent narrowing of a replaced default path. NEW.**

`GradingTab.tsx`'s form now dispatches through `startReview`, and
`routeGradingRun` (`incrementalRunPlan.ts:97-112`) returns `"incremental"` for
provider `gemini` whenever there is a Canvas URL or a file under the wire
budget. Gemini is the default provider. So the ordinary zip/Canvas grading run
now renders the NEW mount (`GradingTab.tsx:595-615`) and not the old one
(`:545-591`), because `state.run` stays null - `formAction` is never dispatched
on that route.

Compare the two mounts and `gradeAction`'s Gemini branch
(`src/app/actions/grading.ts:879-920`). The incremental route loses:

1. **`<RubricProvenance run={run} />`** (`GradingTab.tsx:547`). This is A39 wave
   2's entire shipped deliverable. The incremental run object is
   `{results, rubricAreaNames, fullCreditChecklist: []}` - no `rubricUsed`, no
   `rubricFingerprint`. Both fields are OPTIONAL on `GradingRun`
   (`src/lib/grade/types.ts:366-367`), so this is a reading claim that tsc
   cannot catch, and it is why nothing turns red. `gradeEntries` DOES stamp the
   pair per item, but `route.ts:187-188` returns only `outcome.value.results[0]`
   and discards the stamp.
2. **Rubric auto-generation.** `grading.ts:884-887`:
   `effectiveRubric = rubric.trim() ? rubric : await generateRubric(...)`, and
   `generatedRubric` drives the "Rubric was auto-generated from assignment
   instructions" card. `prepareGradingRunAction` reads `rubric` at
   `grading-incremental.ts:53` and passes it through untouched. **A user who
   leaves the rubric blank now grades against an empty rubric** where the
   whole-run route generated one. This is not a corner case - it is the
   blank-rubric flow, and it is also the precondition for B3.
3. **The blank-instructions refusal.** `grading.ts:880-882` returns
   `"Please provide assignment instructions."`. The incremental route has no
   equivalent; it grades with empty instructions.
4. **`fullCreditChecklist`** (`synthesizeFullCreditChecklist`) and
   **`sampleAnswer`** (`generateSampleAnswer`), both in `grading.ts:906-910`.
   The incremental mount hardcodes `fullCreditChecklist: []`.
5. **`speedGraderUrl`** (`grading.ts:743`), which the per-row SpeedGrader deep
   links are built from. Absent on the incremental Canvas route.
6. **`sectionRef`** (`GradingTab.tsx:576-579`). One DOM node, two readers:
   `resultsRef` (the scroll-into-view effect at `:212-217`) and
   `resultsSectionFallbackRef` (page.tsx's FilePreviewModal fallback, per
   REGRESSION.md entry 287 check 6). The incremental mount passes neither, so
   the results no longer scroll into view and the preview-modal fallback ref is
   never populated.

**Same class, separate instance - B1b, the not-attempted rows.** `engine.ts`
documents its own invariant in the comment at `:300-312`: "`results[i]`
corresponds to `studentSubmissions[i]` for every i, and
`results.length === studentSubmissions.length`", achieved by appending explicit
`kind: "not-attempted"` rows with a `stoppedBy` reason. `mergeArrivedResults`
(`incrementalRunPlan.ts:135-148`) emits NO row for an undispatched ticket, by
design ("a row never moves, it only appears"). That is right for a RUNNING
table and wrong for a FINISHED one: after `cancel()`, or after the pool ends,
the table shows only the arrived subset with no marker that anyone is missing,
and `incrementalTotal` is not passed to `GradingResults` at all. A cancelled
run's table is indistinguishable from a complete one.

**Why no gate catches any of this.** `autoGradeTransition.wiring.test.ts`'s W5
block asserts `lfSource`/`gtSource` still CONTAIN `<RubricProvenance` - true,
in the now-secondary branch. W4-8 asserts "Stop grading" precedes the FIRST
`<GradingResults` match - true, because the first match is the old mount. Every
assertion is a source-text presence check over a file whose two branches it
cannot tell apart.

**Named mutation that reverses the wave's purpose and stays green:** delete the
whole `{source !== "livefeed" && run && run.results.length > 0 && (...)}` block
at `GradingTab.tsx:545-591` entirely. Every test in run 1 and run 2 still
passes, including A5 (`formAction(` count), A6, W4-8 and W4-9b - because
`formAction(` occurrences and the `<form>` tag are untouched.

---

### B2. Two results tables can render at once, over one shared edits surface

**Class: two coexisting state machines over one surface. NEW.**

`state` and `pending` arrive as PROPS (`GradingTab.tsx:60,61,83,84`) - the
`useActionState` lives in `page.tsx`, so `state.run` persists until the next
`formAction` dispatch and there is no reset path. `incrementalResults` is
cleared only at `useIncrementalGradingRun.ts:139`, which is AFTER the whole-run
early return at `:133-136`.

Two reachable sequences, both giving two full tables stacked:

- Whole-run run first (e.g. provider `other`, or an oversize zip, or any
  `mode:"whole-run"` fallback) -> `state.run` populated. Then a Gemini
  incremental run -> `state.run` is NOT cleared, so `:545` renders the OLD run
  AND `:595` renders the new one.
- Incremental run first -> `incrementalResults` populated. Then any whole-run
  route (provider switch, oversize file, a collision refusal falling back) ->
  `incrementalResults` is NOT cleared, so the stale incremental table stays
  under the new whole-run table.

Both mounts pass `editsSurface="canvas"`. `GradingTab.tsx:551-559`'s own comment
says the two existing mounts share that surface only because they are "mutually
exclusive in the UI" - the exact precondition this wave breaks. Edits keyed by
`result.student` in `gradingResultsEditsKey` now collide across two runs.

Reading claim (no render here). Nothing in the suite can see it: no test
constructs both states.

---

### B3. The incremental table's column set is sampled from one arrived row, not derived

**Class: a projection keyed on an arrival-dependent sample. NEW.**

`GradingTab.tsx:599`:

```
rubricAreaNames: incrementalResults[0]?.rubricAreas.map((a) => a.area) ?? [],
```

RES-W4C-1 describes this as "a lighter union of what has arrived". **It is not a
union.** It is the areas of the lowest-`sourceIndex` ARRIVED row, recomputed on
every arrival, because `mergeArrivedResults` returns a DENSE array. Three
consequences, all reachable:

1. **Columns change mid-run.** Row 3 arrives first -> header is row 3's areas.
   Row 0 arrives later -> header silently becomes row 0's areas and every cell
   re-keys.
2. **Per-criterion scores vanish for any student whose area names differ.**
   Cells are keyed by NAME (`GradingResults.tsx:750-751`,
   `areaMap.get(areaName)`), so nothing lands in the wrong column - it lands
   nowhere. The cell renders only `if (area && areaEdit)`, so those criteria are
   blank AND non-editable, and `buildCsvContent`
   (`gradingResultsHelpers.ts:488-518`) iterates the same header, so they are
   absent from the export too. The whole-run route pinned every student to ONE
   canonical set derived from the richest row; the incremental route reconciles
   each item against its OWN areas (see below) and then drops everyone but row 0.
3. **`recomputeTotal` re-totals against the wrong set.** `GradingResults.tsx:279`
   calls `recomputeTotal(areas, run.rubricAreaNames, row.total)`, and
   `recomputeTotal` (`gradingResultsHelpers.ts:364-394`) sums ONLY the named
   areas. A student outside the header contributes nothing, so an edit produces
   a wrong total silently.
4. **A transport failure at index 0 blanks every rubric column for the whole
   run.** `classifyItemFailure` sets `rubricAreas: []`
   (`incrementalRunPlan.ts:167`), so `incrementalResults[0].rubricAreas` is `[]`
   and `rubricAreaNames` is `[]` for every student.

**The precondition, and why it is the default rather than a corner case.** Per
item, `route.ts:173` calls `gradeEntries([entry], ...)`, and `gradeStudentEntries`
calls `reconcileRun(results, criteria.map(c => c.name))` (`engine.ts:351`). When
the rubric DOES parse to criteria, every item is pinned to the same canonical
set and this defect does not arise. When it does not, `reconcileRun`'s fallback
(`reconcile.ts:51-58`) sets canonical to "the richest single result's own areas"
- and with one entry per call, that is THAT STUDENT'S OWN AREAS. Combined with
B1 item 2 (no rubric is generated on this route), the blank-rubric flow hits
this branch on every run. `reconcile.test.ts`'s own frozen-literal fixture is
built on exactly that branch, so the wave knows the branch exists.

RES-W4C-1 therefore mis-states both the mechanism and the consequence. A
residual whose text does not describe the code cannot be triaged by its owner.

---

### B4. The refusal-before-spend instrument cannot fail

**Class: a check whose assertion cannot fail. REPEAT-OF "a check whose assertion
cannot fail"** (named in `docs/loop/iteration-caps.md` as an already-seen class;
routing it as a repeat is the honest call, and it means the second attempt must
change KIND, not strengthen the mock).

`grading-incremental.test.ts:65` and `:81`:
`expect(mockCallLlm).not.toHaveBeenCalled()`, presented as "THE OBJECT of
W-A46-1 ... this is what proves it fired before, not merely that it returned the
right message."

There is no model-call site in the module under test. Derived, not asserted:

```
$ grep -n "callLlm\|gradeEntries\|gradeSubmissions\|generateRubric\|generateSampleAnswer\|synthesizeFullCredit" src/app/actions/grading-incremental.ts
39: * first gradeEntries/gradeSubmissions call - just done ONCE, up front,
```

One hit, in a comment. So `prepareGradingRunAction` cannot call `callLlm` under
ANY mutation of its refusal logic, and the assertion is unfalsifiable.

The brief I was given states the file has "an anti-vacuity companion showing
the mock CAN be called". **That is not so.** The companion at `:68-82` asserts
`expect(mockCallLlm).not.toHaveBeenCalled()` as well. Both the positive case and
the companion assert the same negative; NO test in this file ever calls the mock.
The companion is an anti-vacuity control for the REFUSAL (it proves the fixture
discriminates collision from non-collision, which it does), not for the mock.

The mock is also a bystander in the narrower sense: `@/lib/llm`'s `callLlm` is
not on any path `prepareGradingRunAction` reaches. It is not a routed-around
`fetch` - `vitest.setup.ts`'s throw is intact and nothing here reaches it - it is
simply an assertion about a module the code under test never touches.

**No mutation of `grading-incremental.ts` turns this assertion red.** The
mutation it is advertised against (move the refusal after ticket building) is
caught by the `result.mode` assertion at `:57`, which is the real instrument.

---

### B5. The refusal is disposed of by re-running the path that pays

**Class: a refusal whose handler re-enters the spending path. NEW.**

A46's stated point is that the collision refusal fires before a model call is
paid for. It does, inside `prepareGradingRunAction`. Then
`useIncrementalGradingRun.ts:148-152` responds to `mode:"whole-run"` - which
`grading-incremental.ts:107-115` returns for EVERY thrown error, collision
refusal included - by calling `submitWholeRun(fd)`, i.e. the full `gradeAction`.

`gradeAction`'s Gemini zip branch then pays, in order:

- `generateRubric(assignmentInstructions, provider)` at `grading.ts:884-887`
  when the rubric is blank - a model call BEFORE extraction runs at all;
- `Promise.all([gradeSubmissions(...), synthesizeFullCreditChecklist(...),
  generateSampleAnswer(...)])` at `:905-909`. `gradeSubmissions` throws the
  collision refusal, but the other two promises are ALREADY DISPATCHED and
  `Promise.all` rejecting does not cancel them. Both are `callLlm` calls
  (`src/lib/grade/rubric.ts:403-412` for `generateSampleAnswer`).

So the shipped user path runs the refusal twice: once free, once paid, with two
to three model calls attached. The wave's headline claim is true of the action in
isolation and false end to end. **This is a design finding, not an instrument
one** - it is not fixed by B4's fix, and B4's fix is not fixed by this one.

The instrument that would catch it does not exist: no test drives
`useIncrementalGradingRun`'s `mode:"whole-run"` branch against a `submitWholeRun`
that itself has a model seam. The lifecycle test's own whole-run cases
(`:191-213`) assert only that `fetchMock` was not called.

---

## 2. MAJOR

### M1. The run lock is dead code on the whole-run route, and W4-9's instrument never visits it

`startReview` (`useIncrementalGradingRun.ts:123-168`): the lock is claimed at
`:127-128`, and the whole-run branch at `:132-136` runs `routeGradingRun`,
`submitWholeRun(fd)` and `return` with **no `await` anywhere on the path**. The
`finally` at `:160-167` therefore releases the lock synchronously, before the
function returns to its caller. Two same-task calls each pass the check and each
dispatch. Reading claim; I did not apply the mutation.

W4-9's instrument (`useIncrementalGradingRun.lifecycle.test.ts:122-147`) drives
`fdWithCanvasUrl()` with provider `gemini`, i.e. only the INCREMENTAL route,
where the lock is held across the `await` at `:144` and genuinely works. The
whole-run route is exercised once, with a single call (`:215-226`). So the
instrument's stated object ("total dispatches after TWO calls from the SAME
render") is asserted only on the route where it holds.

Practical harm is limited: `disabled={pending || incrementalRunning}`
(`GradingTab.tsx:456`) catches two real clicks in separate tasks once React has
re-rendered. The finding is that the claim is broader than the measurement.

### M2. `cancel()` changes no state and aborts nothing

`useIncrementalGradingRun.ts:88-90` sets `cancelledRef.current = true` and
nothing else. No `AbortController` is created anywhere in the wave (`fetch` at
`:60-64` has no `signal`). Consequences, all reading claims:

- `incrementalRunning` stays true, so the progress region and the "Stop grading"
  button stay mounted and enabled, and `incrementalDone` keeps climbing as the
  in-flight items land - up to `TOTAL_BUDGET_MS = 50_000` each. Pressing Stop
  produces no visible change.
- Start Review stays disabled for that whole window.
- After the pool ends, see B1b: nothing records that the run was cancelled.

The cancellation test (`:230-264`) asserts only that no FOURTH fetch is issued.

### M3. The frozen literal's provenance is self-contradictory, so it cannot discharge W4-1

`reconcile.test.ts`'s header says the literal was "captured from TODAY's
gradeStudentEntries"; the in-body note at `:95-100` says it was captured
"against the implementation on today's tree, immediately after wave 4b's
extraction landed". W4-1's invariant is that results are byte-identical BEFORE
AND AFTER the extraction. A literal frozen from the POST-extraction
implementation encodes whatever the extraction changed and is green by
construction. The two statements cannot both be true.

The literal is structurally the right shape - it is captured through
`gradeEntries` (`engine.ts`), not through `reconcileRun`, so it is a black-box
oracle over the consumer rather than a restatement of the extracted function,
and the two documented hand-guess corrections are honest evidence of measurement
against SOMETHING. What is missing is which implementation.

I settled the underlying question independently, by reading the diff line by
line. The extraction's only semantic differences are: (a) in-place mutation of
`result.rubricAreas`/`result.overallComment` replaced by
`{...result, rubricAreas, overallComment}` (`reconcile.ts:85`) - unobservable,
because `results` in `gradeStudentEntries` is a local array with no external
alias between the loop and the `return` at `engine.ts:353`; (b) the
empty-canonical union branch now iterates `reconciledResults`
(`reconcile.ts:95`) instead of `results`, and those are the same array in that
branch. The extraction IS behaviour-preserving. The oracle happens to be right;
as documented it does not prove it.

### M4. `classifyItemFailure` discards the student's file list, which its caller holds

`incrementalRunPlan.ts:170-171` hardcodes `mergedFileCount: 0` and
`submittedFiles: []`. The caller at `useIncrementalGradingRun.ts:108-111` has
`request.entry` in hand and passes only `request.entry.student`. `engine.ts`'s
own failure row goes through `buildUngradedRow({student, mergedFileCount,
submittedFiles, gradedRepo, gradedRef}, ...)` (`:265-282`) and PRESERVES them.
So a transport failure renders a row reporting the student submitted no files -
a factual misstatement about the submission, on the surface an instructor uses
to decide whether to chase them. Asserted nowhere;
`incrementalRunPlan.test.ts:153-162` checks only `ungraded` and `student`.

### M5. R-16's frozen-trail comment is wrong in three numbers

The tenth trail is REAL - `engine.ts` imports `{ reconcileRun } from
"./reconcile"` (a value import, so a runtime edge), `reconcile.ts:20` imports
`{ normalizeAreaName } from "./rubric"` (also a value import), and R-16 walks
each direct edge with its OWN fresh `walkRuntimeGraph` call
(`runtime-import-graph.test.ts:690-706`), so the shared-`visited` early-return
hazard does not apply and the per-edge walk is the right attribution method. The
deep-equal at `:709-712` passes with the tenth trail present, measured: run 1,
`runtime-import-graph.test.ts (174 tests)`, all passing. So the count was not
bumped to silence a guard.

The PROSE around it is now stale in three places (`:645-657`):

- "added an **eleventh** direct edge's own independent walk" - `../reconcile` is
  a fifth direct edge, not an eleventh; the sentence conflates trails with edges.
- "engine.ts's **fourth** relevant direct edge today, `../research/rubric-fingerprint`"
  - unchanged from before the wave, now the fifth.
- "this exact mutation raised the list from **9 to 10** trails and failed the
  deep-equal" - with ten frozen trails the same mutation now raises it to
  eleven. The record of the mutation the instrument was PROVEN against is
  numerically wrong, which is exactly the reading that makes a `9 -> 10` bump
  indistinguishable from a silenced guard.

### M6. `mergeArrivedResults` silently drops out-of-range indices and silently overwrites duplicates

`incrementalRunPlan.ts:139-147` builds a `Map` (last write wins on a duplicate
key) and then iterates `for (let i = 0; i < totalTicketCount; i += 1)`. So:

- a duplicate `sourceIndex` silently discards one result while `doneCount` still
  counts both;
- any `sourceIndex >= totalTicketCount` silently disappears.

Neither is reachable today (`grading-incremental.ts:102` builds indices with
`entries.map((entry, sourceIndex) => ...)`, dense and equal to array position,
and `useIncrementalGradingRun.ts:69` re-keys the success path on
`request.sourceIndex` rather than the server's echo, so the server cannot inject
a bad index). Neither is asserted either - no test checks
`merged.length === arrived.length`, and the four `mergeArrivedResults` cases
(`incrementalRunPlan.test.ts:123-149`) all use dense in-range indices.

**This is the sibling of the gap the implementer found (attack 8).** Named
mutation that reverses the wave's purpose and passes everything:

> In `grading-incremental.ts:102`, change
> `entries.map((entry, sourceIndex) => ({ sourceIndex, entry }))` to filter
> first and keep the ORIGINAL index -
> `entries.map((e, i) => ({ sourceIndex: i, entry: e })).filter(t => shouldGrade(t.entry))`.
> This is a realistic near-term change: the whole-run Canvas path already does
> "everything that came back is already graded" (`grading.ts:750-755`). Tickets
> then carry sparse indices while `totalTicketCount = requests.length` shrinks,
> and every result above the new length is silently dropped from the table with
> `incrementalDone` reporting them complete. All 249 tests in run 1 stay green,
> because `grading-incremental.test.ts:99-115` only ever exercises unfiltered
> fixtures.

The construction that removes the class rather than testing for it: iterate the
map's sorted keys instead of `0..totalTicketCount`, and assert
`merged.length === arrived.length`.

---

## 3. MINOR

- **m1.** `incrementalRunPlan.test.ts:137-145` is labelled WATCHED but is a
  restatement of `:123-128`: it computes `byArrivalOrder` from the fixture and
  asserts `not.toEqual`. A mutation returning `[]`, or reverse-arrival order,
  also satisfies it. It cannot distinguish the mutation from other wrong answers.
- **m2.** `isSubmittedFileInfo` (`route.ts:59-66`) puts no length bound on
  `previewContent`, and `estimateEntryWireBytes`
  (`incrementalRunPlan.ts:75-81`) counts only `content` and `rawBase64`. So the
  per-item cap at `route.ts:105` does not bound the request body. I checked
  whether this reaches the prompt: it does not -
  `buildSubmittedFileNamesBlock` (`src/lib/grade/prompts.ts:241-254`) uses only
  base file NAMES, and `grep -n previewContent src/lib/grade/*.ts` shows no
  producer-side prompt use. So the exposure is request bytes, not model spend.
- **m3.** `routeGradingRun:110` gates `wireBytesForFile(file.size)` - the WHOLE
  ZIP - against the PER-ITEM budget. A zip decompresses, so a small archive can
  extract to entries far over the per-item budget; the real gate is
  `grading-incremental.ts:96-100`, server-side. Conservative in the direction
  that matters, but the comment at `:93-95` presents the client check as the
  file-path equivalent of the server check, and it is not the same object.
- **m4.** `route.test.ts` mocks `raceWithTimeout`, so the soft-budget arithmetic
  at `route.ts:163-164` (`Math.max(1_000, remainingMs - MODEL_WAIT_RESERVE_MS)`)
  is never asserted. Check 3 asserts only `TOTAL_BUDGET_MS < maxDuration * 1000`
  by regex over source text.

---

## 4. Attacks that found nothing

Listed because a clean section is evidence and a check with no attempted attacks
is not a check.

**Determinism (attack 1) - six attempted breaks, none landed.**

1. *Out-of-order merge.* `mergeArrivedResults` sorts by `sourceIndex`, not
   arrival; asserted at `incrementalRunPlan.test.ts:123-128`. Holds.
2. *The server echoing a wrong index.* `route.ts:188` echoes `sourceIndex`, but
   `postGradeRunItem` (`useIncrementalGradingRun.ts:69`) returns
   `{ sourceIndex: request.sourceIndex, ... }` and IGNORES the echo. A
   compromised or buggy handler cannot misattribute. This is the single best
   decision in the wave and it is not credited anywhere in the wave's own notes.
3. *A retry after partial failure.* There is no retry path -
   `useIncrementalGradingRun.ts:104-112` catches once and converts to a row.
   Nothing re-enqueues.
4. *A cancelled item whose response arrives late.* The `await` at `:105`
   precedes the cancel check at `:99`, so a late arrival is pushed with its own
   `request.sourceIndex` and merged correctly. Consistent with W4-6
   ("cancellation costs nothing already paid").
5. *Two students collapsing to one key.* Keys are array positions, not names;
   A44's collision refusal fires inside `extractStudentEntries` before any
   ticket exists, verified executably by `grading-incremental.test.ts:49-66`
   (the `result.mode` half - see B4 for the half that is vacuous).
6. *A re-run reusing a stale map.* `arrived`, `cursor` and `doneCount` are all
   locals of `runPool` (`:93-95`), allocated per call. No module- or ref-level
   accumulator exists.

**Concurrency (attack 2) - the port is faithful on every point I checked.**
The cursor claim at `:100-102` reads and increments with no intervening `await`,
so two workers cannot claim the same index in a single-threaded event loop.
Worker count is `Math.min(INCREMENTAL_CONCURRENCY, requests.length)` (`:119`),
so a 1-ticket run opens 1 worker. A per-item throw is caught inside the loop
(`:107`), so one failure neither kills the pool nor leaks a slot. The lock is
released in a `finally` on every exit (`:160-167`). One residual hazard I could
not reach: a throw from OUTSIDE the inner `try` (i.e. from `setIncrementalDone`
or `mergeArrivedResults` at `:113-115`) would reject `Promise.all` early and let
the `finally` release the lock while sibling workers are still running, allowing
two pools to write the same state. I judged it unreachable in practice (neither
callee throws) and did not raise it as a finding; the construction that removes
it is to wrap the whole loop body.

**Refusal seam (attack 3), the parts that hold.** `vitest.setup.ts`'s
fetch-throw is intact and nothing in the wave routes around it: the only
`fetch(` in the wave is `useIncrementalGradingRun.ts:60`, and the lifecycle test
replaces it with `vi.stubGlobal("fetch", fetchMock)`. `route.test.ts` mocks
`gradeEntries` - which IS the real seam for that file, since `route.ts:173` calls
it directly - and exercises the real `POST` against a plain fake request, with
proper single-mutation negative controls (F1, F1b, F2, F3) plus a canary proving
the base fixture passes all three. That file is the strongest instrument in the
wave.

**`"use server"` legality (attack 6) - clean, by reading; the compiler was not
run.** `grep -n "^export" src/app/actions/grading-incremental.ts` returns exactly
two lines: `export type PrepareGradingRunResult` (`:30`) and
`export async function prepareGradingRunAction` (`:48`). No `export const`, no
`export {`, no type RE-export. `export type` declarations in `"use server"`
modules have broad shipped precedent here - 38 files under `src/app/actions/`
are `"use server"` and contain a top-level `export type`/`export interface`
(derived by matching `^export type|^export interface` then testing each file's
first line for `use server`). `src/app/actions.ts:49`'s
`export * from "./actions/grading-incremental"` follows the same shape as its 46
siblings.

**Reconciliation extraction (attack 4) - behaviour-preserving.** See M3 for the
oracle's provenance problem and for the line-by-line argument that the
extraction itself is sound. `engine.test.ts` (11 tests) and
`gradingResultsHelpersWiring.test.ts` (23 tests, including R-5's planted
positive that would go red if the barrel's supabase reach were removed) both
pass.

**The tenth import-graph trail (attack 5) - real, measured.** See M5; only the
prose is wrong.

**Design call 7(a) - SOUND.** `routeGradingRun` pooling only `gemini` is
correct and complete: `LlmProvider` has exactly three members
(`src/lib/llm.ts:22`, `"gemini" | "other" | "embedded"`), `normalizeProvider`
(`:27-31`) cannot produce a fourth, and neither other member makes a per-student
model call - `"other"` posts one synthesized zip to the Grading API
(`gradeZipViaEngine`) and `"embedded"` grades in process
(`gradeEntriesEmbedded`, `grading.ts:870`). Neither has the
sequential-loop-plus-`sleep(1200)` felt loss this wave exists to fix.

**Design call 7(b) - the residual is REAL but misfiled.** See B3. The mechanism
is not "a lighter union" and the consequence is not lighter columns; it is
silent loss of per-criterion scores from the table, the CSV and the recomputed
total, and it is the default outcome for a blank-rubric run. A visible defect,
not an acceptable residual.

**The Route Handler's guard - not a privilege downgrade.** `route.ts:133` calls
`requireUser()`. That matches the existing posture rather than widening it:
`gradeAction` calls `requireOwner()` (`grading.ts:735`), which
`src/lib/supabase/auth.ts:451` shows delegating to `requireUser()`. And the
route does NOT reach the owner's GitHub PAT: `engine.ts`'s dynamic imports of
`./extraction` are at `:372` (inside `gradeSubmissions`) and `:454` (inside
`gradeCanvasUrl`); `gradeEntries` -> `gradeStudentEntries` reaches neither. Worth
recording because no instrument can see this file -
`githubReachingActionFiles()` skips anything that is not a `"use server"`
module, and a Route Handler never is one, as `route.test.ts`'s own header
states. `runSubmittedCode` (`src/lib/code-runner.ts:557`) is network-backed, not
a local exec, so the client-authored `submittedFiles` array is not a local
code-execution surface.

**RULING 108 - sound, and its stated residual is closed.** The guard is
`requireAppOwner()` (`grading-incremental.ts:49`),
`"actions/grading-incremental.ts"` is in `GITHUB_FILES`
(`action-guard-coverage-github-cohort.test.ts`, with a stated reason), and the
test's own mock now provides `requireAppOwner` and asserts it was called once
while `requireUser` was not (`grading-incremental.test.ts:84-95`) - the residual
the ruling flagged for "the next wave". The ruling's self-correction about
`requireOwner()` not being owner-only is accurate against
`src/lib/supabase/auth.ts:451`.

---

## 5. The disposition table audit (restructuring)

The wave restructured two things. Both audited before reading the new round.

**`engine.ts` -> `reconcile.ts`.** Every branch of the old inline block is
present in the new one, one for one: canonical-from-criteria, the
richest-result fallback, the `normalizeAreaName` map with first-wins, the
canonical rename, the blank fill, the stray fold into `overallComment`, and both
`rubricAreaNames` branches. Nothing withdrawn. One behavioural difference
(mutation -> copy), unobservable, argued in M3.

**`action-guard-coverage.test.ts` -> `action-guard-coverage-github-cohort.test.ts`.**
All four tests of the moved `describe` block are present and pass (run 1,
`action-guard-coverage-github-cohort.test.ts (4 tests)`), and the source file
still passes its remaining 15 (run 2). `GITHUB_FILES`,
`GITHUB_NOT_OWNER_ONLY` (9 entries) and `GITHUB_FILES_PENDING_ENUMERATION`
(1 entry, `actions/llm-content.ts`) all carried over with their reason text.
`grep -n "GITHUB_FILES\|walkRuntimeGraph\|SRC_ROOT\|githubReaching"
src/app/actions/action-guard-coverage.test.ts` returns nothing (exit 1), so no
dangling reference was left behind. `collectActionExports` and
`collectCandidateFiles` are duplicated rather than imported, which is correct
for this repo (importing a helper from another `*.test.ts` re-runs its describe
blocks). Nothing dropped.

---

## 6. The single weakest requirement

Not a blocker on its own, but the clause most likely to be implemented exactly
as written and still produce a bad result: **RULING 40's "one call site for both
whole-run routes, so A5's `formAction(` count stays at exactly two."**

The requirement is about a COUNT of source-text occurrences. It was satisfied
perfectly - `autoGradeTransition.wiring.test.ts`'s rewritten A5 now asserts
exactly two `formAction(` occurrences, both inside a `startTransition(` paren
span, and it passes. And satisfying it is what produced B2: routing both
whole-run cases through one `submitWholeRun` means the hook hands the SAME
`FormData` to `gradeAction` after already having populated
`incrementalResults`, with nothing in the requirement obliging either state to
be cleared. A requirement phrased as a source-text count cannot express "and the
two surfaces are mutually exclusive", which is the property
`GradingTab.tsx:551-559`'s own comment says the shared edits surface depends on.

---

## 7. Stopping point

**Design**, and one item of **rulings**.

- **Design.** B1, B2, B3 and B5 are all shape questions about the same seam:
  what the incremental route's result object IS, and whether it is a second
  surface or a fill of the existing one. No seat revision resolves them
  independently, and fixing them one at a time will reintroduce the others - the
  same `GradingRun` has to carry the provenance stamp, a run-level canonical
  column set resolved once in `prepareGradingRunAction`, the not-attempted tail,
  and a single mount that the whole-run path also writes into.
- **Rulings.** RES-W4C-1 as filed does not describe the code (B3). A residual is
  triaged from its text, so it needs re-filing before its owner can rule on it.
  RULING 40's shape (a source-text count standing in for an exclusivity
  property) is the second ruling item - see section 6.
- **Measurement** is NOT the stopping point for B4: the fix there must change
  kind, not strength. Asserting harder on `mockCallLlm` inside a module with no
  model-call site cannot work; the claim has to be measured at the consumer
  (`useIncrementalGradingRun`'s `mode:"whole-run"` branch against a
  `submitWholeRun` that has a model seam), which is also the only place B5 is
  observable.

## 8. What I did NOT check, and why

- **`npx tsc --noEmit` and `npm run build`.** Single-caller resources, another
  implementer live. Every type-level claim above (chiefly that `rubricUsed` /
  `rubricFingerprint` / `speedGraderUrl` / `sampleAnswer` being optional is what
  lets B1's thin run object compile) is a reading claim from
  `src/lib/grade/types.ts:347-368`.
- **Any sabotage on the tree.** Two implementers live; the brief's escape taken.
  The mutations in B1 and M6 are NAMED with the exact edit and the exact
  green-suite consequence, not applied. M1, M2, B2 and B3 are reasoned from
  source with line citations and are explicitly reading claims.
- **Anything rendered.** No component renders under this vitest. B1's six
  dropped props, B2's two stacked tables, B3's blank non-editable cells, M2's
  unresponsive Stop button and W4-8's control placement are ALL reading claims.
  A green suite says nothing about any of them.
- **`CartridgeDropPanel.tsx`, `CartridgeDropPanel.reorder.test.ts`,
  `componentStorageKeys.structure.test.ts`.** Not this wave; a live implementer
  owns them.
- **The full suite.** I ran 15 test files (356 tests) chosen for reachability
  from this diff, not `npm test`. A consumer of `reconcileRun` or `GradingRun`
  outside those files could still be affected; the barrel re-export at
  `src/lib/grade.ts:18-21` is additive, so no existing importer changes.
- **W4-7 (owner-only wall-clock elapsed).** Owner-only by construction; this
  environment has no live key and cannot measure it. The wave's leverage claim -
  that results arrive per student instead of after everyone - is proven as a
  STATE claim by `useIncrementalGradingRun.lifecycle.test.ts:268-292` (one row
  present while the second ticket is unresolved) and is NOT proven as a
  wall-clock claim by anything here.
