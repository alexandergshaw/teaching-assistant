# A39: the INCREMENTAL GRADING FILL - architecture

Subject: what the incremental grading route must become before
`INCREMENTAL_ROUTE_ENABLED` (`src/app/components/grading/incrementalRunPlan.ts:99`)
can be flipped on.

## 0. Authority, and what is settled

**The fill is an OWNER DECISION.** The owner was asked whether the incremental
run is a SECOND SURFACE or a FILL of the existing one, and answered: the FILL.
That decision is settled and this document does not reopen it. Four of the five
blockers in `docs/a39-wave4-build-check.md` (B1, B2, B3, B5) are the same
question, and the fill answers all four at once: **one `GradingRun`, one state
machine, one mount, populated progressively.**

What remains mine, and what section 15 is for: the CONSEQUENCES of that
decision. Two of them the owner will not have expected, and one of them is an
identity hazard the build check did not find. They are stated as consequences
with costs, not as reasons to revisit the fork.

**Nothing under `src/` or `supabase/` was written by this pass.**
`git status --short` at the start and at the end of this pass:

```
 M src/lib/course-files.ts
 M src/lib/supabase/course-task-attachments.ts
```

Both belong to a live implementer and were not touched here. Branch `main`.

**I RAN NO TEST, NO TYPE CHECK AND NO BUILD.** My write set is this one
document. Every instrument named in section 11 is named with the mutation that
should turn it red; none of those mutations was applied and none of those
instruments was executed by me. Where I claim a test would go red, that is a
READING claim from the test's own source, cited by line.

**No component renders under this repo's vitest** (node env, collects only
`src/**/*.test.ts`). Every claim about what the instructor SEES in this
document is a reading claim. Section 12 lists what therefore needs an owner
walk, with an owner, an instrument and a step.

---

## 1. Measurement preamble

Every quantity below names the command that produced it. Sizes are taken from
BOTH counters, because this repo has a recorded 42-line disagreement between
them on one file.

`wc -l <path>` (Bash) and `@(Get-Content <path>).Count` (PowerShell), run
separately, at the head of this pass:

| Path | `wc -l` | `@(Get-Content).Count` |
|---|---|---|
| `src/app/components/GradingTab.tsx` | 620 | 620 |
| `src/app/components/grading/incrementalRunPlan.ts` | 199 | 199 |
| `src/app/components/grading/useIncrementalGradingRun.ts` | 192 | 192 |
| `src/app/actions/grading-incremental.ts` | 141 | 141 |
| `src/app/api/grade-run-item/route.ts` | 192 | 192 |
| `src/lib/grade/reconcile.ts` | 106 | 106 |
| `src/lib/grade/engine.ts` | 476 | 476 |
| `src/app/actions/grading.ts` | 941 | 941 |
| `src/lib/grade/types.ts` | 432 | 432 |
| `src/lib/grade/extraction.ts` | 311 | 311 |
| `src/app/components/GradingResults.tsx` | 906 | 906 |
| `src/app/page.tsx` | 703 | 703 |

The two counters AGREE on all twelve.

**Three of these differ from `docs/a39-wave4-build-check.md`'s table**, because
RULING 116 landed after that check: `incrementalRunPlan.ts` 174 -> 199,
`useIncrementalGradingRun.ts` 179 -> 192, `grading-incremental.ts` 116 -> 141.
`GradingTab.tsx` is unchanged at 620. The build check's line citations into the
first three are therefore stale by up to +25 and every citation in this
document was re-taken against the working tree, not copied from it.

`GradingResults.tsx` is at **906** against the repo's hard ceiling of 1000:
`src/file-size-ceiling.structure.test.ts:41` is `const LIMIT = 1000;`, and
`:114-119` shows the walk is rooted at `path.resolve(repoRoot, "src")` over
`.ts`/`.tsx` only - so this document's own length is out of that gate's scope,
and `docs/` is not measured by it. **This design adds nothing to
`GradingResults.tsx`** - see section 8 item 9.

This document is **1256** lines on both counters
(`wc -l docs/a39-incremental-fill-architecture.md` -> 1256;
`@(Get-Content docs/a39-incremental-fill-architecture.md).Count` -> 1256), ASCII
only and with no BOM (first three bytes `23 20 41`, verified with
`[IO.File]::ReadAllBytes`). The emoji rule is owned by
`src/lib/no-emojis.test.ts` and was not hand-rolled here; the byte scan above is
a BOM/mojibake check, not a substitute for it.

---

## 2. The shape

Today there are two objects and two renderers:

- the whole-run object: `state.run`, a `GradingRun` produced by `gradeAction`
  (`src/app/actions/grading.ts:767` onward), rendered at
  `GradingTab.tsx:545-593` with `RubricProvenance` above it at `:547`;
- the incremental object: an inline literal built at `GradingTab.tsx:599-603`
  from `incrementalResults`, rendered at `GradingTab.tsx:597-615`.

The fill replaces both with one object assembled by one pure function, and one
mount.

```
                    ONE RUN HEADER                    ONE ROW STREAM
                (resolved once, server)            (per item, server)
  prepareGradingRunAction                     POST /api/grade-run-item
    - refusals (free, first)                    - one entry -> one GradeResult
    - effectiveRubric (+ generated)             - unchanged from today
    - criteriaNames                             - echoes sourceIndex; the
    - rubricUsed / rubricFingerprint              client ignores the echo
    - speedGraderUrl
    - entries, tickets (sourceIndex fixed)
              |                                            |
              +----------------------+---------------------+
                                     |
                       useIncrementalGradingRun (client)
                         header + arrived[] + phase
                                     |
                       buildIncrementalRun()   <- PURE, in the plan leaf
                                     |
                       selectDisplayRun(phase, incremental, state.run)
                                     |
                          ONE <GradingResults /> mount
```

Three properties define the fill, and each is a construction rather than a
check:

1. **One header.** Everything that is per-RUN rather than per-ITEM is resolved
   once, server-side, before any ticket is dispatched, and travels as a
   `GradingRunHeader`. Section 4.
2. **One machine.** The hook owns a single `phase`, and the whole-run dispatch
   has exactly ONE door, which resets that phase. Section 5.
3. **One mount.** `GradingTab.tsx` contains exactly one `<GradingResults`
   element, fed by one total function. Two stacked tables become
   unrepresentable, not merely untested. Section 5.

---

## 3. Vocabulary this document introduces

Named here so no brief has to guess a spelling.

| Name | Where | Kind |
|---|---|---|
| `GradingRunHeader` | `src/lib/grade/types.ts` (added) | interface, PURE, client-importable |
| `resolveRunHeader` | `src/lib/grade/run-header.ts` (new) | async, SERVER-ONLY |
| `GradingRunTier2` | `src/lib/grade/types.ts` (added) | interface: `{ fullCreditChecklist: string[]; sampleAnswer: string }` |
| `completeGradingRunHeaderAction` | `src/app/actions/grading-incremental.ts` (added export) | `"use server"` action |
| `IncrementalPhase` | `incrementalRunPlan.ts` (added) | `"idle" \| "running" \| "stopping" \| "stopped" \| "complete" \| "refused"` |
| `unionRubricAreaNames` | `incrementalRunPlan.ts` (added) | PURE |
| `buildIncrementalRun` | `incrementalRunPlan.ts` (added) | PURE |
| `selectDisplayRun` | `incrementalRunPlan.ts` (added) | PURE |
| `describeRunProgress` | `incrementalRunPlan.ts` (added) | PURE, owns the progress and terminal copy |
| `shouldShowEmptyState` | `incrementalRunPlan.ts` (added) | PURE |
| `beginWholeRun` | `useIncrementalGradingRun.ts` (added return) | the ONE whole-run door |

`GradingRunHeader` and `GradingRunTier2` live in `types.ts`, not in
`run-header.ts`, **deliberately**: `types.ts` imports exactly one thing
(`import type { CodeRunResult } from "../code-runner"`, `types.ts:1`) and is
already reached from the client, whereas `run-header.ts` must call
`generateRubric` and therefore reaches `lib/supabase` (section 6.2). Putting
the type beside the function would make every client reader of the type a
type-only import away from a client-boundary violation. Putting it in `types.ts`
removes that hazard by construction.

---

## 4. RESOLUTION 1 - where the missing pieces come from

### 4.1 What is actually missing, re-derived from the tree

`docs/ruling-116.md:13-26` and the build check's B1 list six items. Measured
against the tree, the list is **eight**, and one of the two additions is the
most serious item in this document.

| # | Piece | Whole-run site | Status on the incremental route today |
|---|---|---|---|
| 1 | `RubricProvenance` mount | `GradingTab.tsx:547` | absent - the mount is on the other branch |
| 2 | `rubricUsed` / `rubricFingerprint` | `engine.ts:360` via `stampRubricProvenance` | produced per item, then DISCARDED at `route.ts:187-188`, which returns only `outcome.value.results[0]` |
| 3 | Rubric auto-generation | `grading.ts:885-888` | absent. **ZIP PATH ONLY** - see 4.2 |
| 4 | The auto-generated rubric CARD | `GradingTab.tsx:495-532`, reading `state.generatedRubric` | absent, and it is a SEPARATE render site from item 3 |
| 5 | Blank-instructions refusal | `grading.ts:882` (zip), `grading.ts:810` (Canvas) | absent on both |
| 6 | `fullCreditChecklist`, `sampleAnswer` | `grading.ts:908-909` (zip), `:816-817` (Canvas) | hardcoded `fullCreditChecklist: []` at `GradingTab.tsx:602`; no `sampleAnswer` |
| 7 | `speedGraderUrl` | `grading.ts:743` | absent, so `speedGraderHref` per-row deep links are dead on the incremental Canvas route |
| 8 | `sectionRef` | `GradingTab.tsx:579-582` | absent - so the scroll-into-view effect at `:212-216` and `page.tsx`'s `FilePreviewModal` fallback (`page.tsx:113`, `:697`) both lose their node |

**And the two the build check did not name:**

| # | Piece | Evidence |
|---|---|---|
| 9 | **The LLM filename-convention inference, which decides STUDENT NAMES.** | `gradeSubmissions` calls `inferFileNameConvention(rawFileNames, provider)` (`engine.ts:390`, a model call, defined at `rubric.ts:209-212`) and passes the lookup into `groupSubmissionsByStudent` (`engine.ts:391-396`). `extractStudentEntries` - the function `prepareGradingRunAction` uses at `grading-incremental.ts:91` - calls `groupSubmissionsByStudent(submissions, **undefined**, rawData, zipParents)` (`extraction.ts:149`). **The incremental route derives student names WITHOUT the inference.** |
| 10 | The run-level `state.warnings` region (`GradingTab.tsx:534-543`) | driven from `state` only; the incremental route produces no warnings and none are expected, so this is recorded and NOT filled. See 14.3. |

**Why #9 matters more than the other nine.** `result.student` is the React key
and the persisted-edits key: `gradingResultsEditsKey` in
`gradingResultsHelpers.ts` is keyed on it, and `GradingResults.tsx:202` and
`:222` both seed `edits` through `loadGradingResultsEdits(canvasUrl, run,
editsSurface)`. Two routes that derive different student strings from the same
zip therefore produce (a) per-row edits that do not carry between routes, and
(b) a CSV and a Canvas post naming a different student. This repo's own
recorded failure mode is that the student string is a live key across keyed
state. **The fill must close #9, and closing it is not optional decoration: it
is the only one of the ten whose failure mode is a wrong grade on a named
student.**

### 4.2 The one asymmetry to PRESERVE, not to fix

Rubric auto-generation is **not** dropped relative to the whole-run path in
general. Measured:

```
grep -n "generateRubric" src/app/actions/grading.ts
  -> 4:  (the import)
     637: (a different caller - the snapshot/draft path)
     885: const effectiveRubric = rubric.trim() ? rubric : await generateRubric(...)
```

`:885` is inside the ZIP branch. The Canvas Gemini branch at `:812` carries its
own comment: "No rubric synthesis on the Canvas path: grade with whatever
rubric was retrieved from Canvas (may be empty)". So the whole-run path itself
generates a rubric for a blank-rubric ZIP and does NOT for a blank-rubric
CANVAS run.

**`docs/ruling-116.md:17-20` and the build check's B1 item 2 both state the gap
without that qualification.** The fill must reproduce the asymmetry, not
flatten it: `resolveRunHeader` takes an explicit
`synthesizeRubricWhenBlank: boolean`, `true` from the zip path and `false` from
the Canvas path. Flattening it would make the incremental Canvas route generate
a rubric the whole-run Canvas route does not, which is a NEW divergence
introduced while closing an old one.

### 4.3 Two tiers, and the reason the split exists

The whole point of this feature is that something appears early. So the
question for every run-level piece is not "where does it live" but **"is it on
the critical path to the first row".**

`docs/a39-waves.md` 8.4.5 (W4-7) makes elapsed-time-to-first-row an owner-only
measurement, because there is no key and nothing renders here. So this document
does not state a millisecond figure. **It states the cost in MODEL CALLS ON THE
CRITICAL PATH, which IS countable from source**, and leaves the millisecond
question to W4-7.

**TIER 1 - BLOCKING. Resolved inside `prepareGradingRunAction` before one
ticket is dispatched.** In this order, and the order is the requirement:

| Step | Cost | Why it is here |
|---|---|---|
| 1. Blank-instructions refusal | zero | free, and it must precede everything that spends |
| 2. `extractSubmissions` + A44's collision refusal | zero model calls | `extraction.ts:145-148`; free, and it must precede the inference |
| 3. `inferFileNameConvention` + `groupSubmissionsByStudent` | **ONE model call** | item #9. Already on the whole-run critical path at `engine.ts:390`, so this is parity, not a new cost |
| 4. Zero-entries check, per-entry wire-budget check | zero | `grading-incremental.ts:95-110`, unchanged |
| 5. `resolveRunHeader` -> `effectiveRubric`, `generatedRubric`, `criteriaNames`, `rubricUsed`, `rubricFingerprint` | **ONE model call, only when the rubric is blank AND the source is a zip** | already on the whole-run critical path at `grading.ts:885` |
| 6. `getSpeedGraderUrl` (Canvas only) | zero model calls; ONE Canvas API call | **`Promise.all`-ed with `extractCanvasEntries`** at `grading-incremental.ts:71`, so it adds no serial latency at all |
| 7. Build tickets, return | zero | `grading-incremental.ts:112` |

**Critical-path model calls before the first row: at most two** (the filename
inference, and rubric generation on a blank-rubric zip). Both are already paid
by the whole-run path before it grades anybody. So the incremental route's
time-to-first-row is `tier 1 + one item`, against the whole-run path's
`tier 1 + N items with a 1200ms spacer between each` (`engine.ts:288-290`). The
leverage claim survives tier 1 intact, and that is the whole reason tier 1 is
allowed to block.

**Step 5's position relative to step 2 is load-bearing and is a strict
improvement on the whole-run path.** `gradeAction` generates the rubric at
`:885` and only then extracts, inside `gradeSubmissions` at `:907` - so a
whole-run blank-rubric zip that is going to be COLLISION-REFUSED pays for
`generateRubric` first. The incremental prep extracts first, so a refused run
pays nothing. That is not a redesign of `gradeAction`; it is recorded as
**RES-FILL-5** in section 13.

**TIER 2 - NON-BLOCKING. Never on the critical path.** `fullCreditChecklist`
and `sampleAnswer` are two model calls that the whole-run path already runs
CONCURRENTLY with grading, inside the same `Promise.all`
(`grading.ts:907-909`). Awaiting them in tier 1 would add their full latency to
time-to-first-row - it would spend the feature's entire purpose on two panels
nobody is waiting for.

So: a second `"use server"` export,
`completeGradingRunHeaderAction(assignmentInstructions, effectiveRubric,
provider)`, returning `GradingRunTier2`. `startReview` fires it WITHOUT
awaiting, immediately after `mode: "incremental"` comes back and immediately
before `runPool`, and merges the result into the displayed run when it lands.

Three consequences, all stated rather than discovered later:

- **It takes `effectiveRubric`, not the FormData.** Re-deriving the header
  server-side would call `generateRubric` a second time on the blank-rubric
  path - a double spend. The value round-trips through the client because the
  client is the only thing holding both halves. It is owner-only
  (`requireAppOwner`, matching `grading-incremental.ts:59`) and length-bounded
  the way `route.ts:41` bounds `MAX_RUBRIC_CHARS`.
- **It is dispatched only after `mode: "incremental"`.** A refused run
  (`mode: "refused"`) must never reach it - RULING 118's rule applies to this
  new spender exactly as it applies to `submitWholeRun`.
- **The two panels appear LATE**, after rows are already on screen
  (`GradingResults.tsx:567` and `:578` are their render gates). That is a
  visible behaviour change and it is owner-walk item 5 in section 12.

**If the owner wants the fill's scope cut, TIER 2 IS THE CUT.** It costs
exactly the full-credit checklist panel (`GradingResults.tsx:567-576`) and the
sample-answer panel (`:578-592`) on incremental runs, and nothing else. Tier 1
is not cuttable: items 1, 3, 5 and 9 are the ones whose absence silently
changes a grade.

---

## 5. RESOLUTION 2 - the two state machines become one

### 5.1 What makes today's defect structural

`state` and `pending` are PROPS (`GradingTab.tsx:60-61`, `:83-84`), from
`page.tsx:63`'s `const [state, formAction, pending] = useActionState(gradeAction,
initialState)`. **`useActionState` has no reset API**, so `state.run` persists
until the next dispatch and `GradingTab.tsx:545`'s guard stays true forever
after one whole-run run. Meanwhile `incrementalResults` is cleared at
`useIncrementalGradingRun.ts:139` - which is AFTER the whole-run early return at
`:133-136`, so the whole-run branch never clears it.

Both orderings render both tables, both passing `editsSurface="canvas"`
(`GradingTab.tsx:558` and `:605`), which is the exact precondition
`GradingTab.tsx:551-557`'s own comment says that shared key depends on:
"mutually exclusive in the UI".

### 5.2 Why the exclusivity requirement cannot be a `formAction(` count

`docs/a39-wave4-build-check.md` section 6 is right and this design takes it as
binding: RULING 40's requirement was a COUNT of source-text occurrences of
`formAction(`, and satisfying it perfectly is what produced the double table.
A count of dispatch sites is a correlate of exclusivity, not exclusivity.

**The fill's answer is to make the count's OBJECT be the defect itself.** The
defect is "two tables render". So the pinned object is the number of
`<GradingResults` elements in `GradingTab.tsx`, which must be **exactly one**.
A single JSX element that is not inside a `.map(` cannot render twice in one
pass. That is not a proxy for exclusivity; it is exclusivity, restated.

Two instruments, two different objects, because one cannot do both jobs:

- **F5 (section 11): exactly one `<GradingResults` element in
  `GradingTab.tsx`, and it is not inside a `.map(`.** This makes the
  double-table class unrepresentable. It says nothing about WHICH run shows.
- **F6: `selectDisplayRun` is a total function with a pinned truth table.**
  This decides which run shows. It says nothing about how many mounts exist.

Neither claim borrows the other's evidence, and the document does not let F5's
green be read as covering F6.

### 5.3 The single machine

```
IncrementalPhase = "idle" | "running" | "stopping" | "stopped" | "complete" | "refused"

selectDisplayRun(phase, incrementalRun, wholeRun) =
  phase === "idle" ? wholeRun : incrementalRun
```

Total over all six phases, with no default branch and no `??` chain. Every
transition is owned by the hook:

| From | Event | To | Also |
|---|---|---|---|
| any | `beginWholeRun(fd)` | `idle` | `incrementalRun = null`, then `submitWholeRun(fd)` |
| `idle` | `startReview` routes `"incremental"` | `running` | `arrived` reset (a fresh local per `runPool` call, as today at `useIncrementalGradingRun.ts:93-95`) |
| `running` | `prepared.mode === "refused"` | `refused` | `incrementalError = reason`; nothing else starts |
| `running` | `cancel()` | `stopping` | `cancelledRef.current = true` |
| `running` / `stopping` | pool ends, all tickets arrived | `complete` | |
| `stopping` | pool ends, tickets outstanding | `stopped` | |
| `running` | pool ends, tickets outstanding | `stopped` | reachable only if a worker throws outside its own try |

`incrementalRunning` is KEPT as a derived boolean,
`phase === "running" || phase === "stopping"`. That is not cosmetic: it is what
keeps two existing instruments green without editing them.
`autoGradeTransition.wiring.test.ts:336` anchors the progress region with
`gtSource.indexOf("incrementalRunning &&")`, and `GradingTab.tsx:456`'s
`disabled={pending || incrementalRunning || ...}` is the Start Review guard. A
phase-literal guard would turn W4-8 red for no gain.

### 5.4 ONE DOOR for the whole-run dispatch, and the cost of it

`selectDisplayRun`'s precedence is only sound if every whole-run dispatch
resets the phase. Today there are TWO whole-run dispatch sites, and only one of
them goes through the hook:

- `GradingTab.tsx:178-182` `submitWholeRun`, called by the hook;
- **`GradingTab.tsx:196-208` `handleAutoGrade`, which calls `formAction(fd)`
  directly at `:206`** and never touches the hook.

So Live Feed's Auto Grade is a whole-run dispatch the hook cannot see. **It is
reachable to a stale table**: Auto Grade a row (populating `state.run`), then
change the source selector away from `livefeed` (`GradingTab.tsx:125-128`,
persisted in `localStorage` under `ta-grading-source`). Both `GradingTab`
mounts are gated `source !== "livefeed"`, so the tables only become visible
after that switch - which is exactly the sequence a stale-phase precedence
would get wrong.

**The construction: `beginWholeRun` is the only door.** The hook exposes it; it
resets the phase and clears the incremental run, then calls the injected
`submitWholeRun`. `startReview`'s two whole-run branches call it, and
`handleAutoGrade` calls it in place of `formAction(fd)` at `:206`, inside its
existing `startTransition` so `setGradingTarget` stays where A3 requires it.

**The cost, stated plainly: two owned assertions change, and one of them is
RULING 40's own pin.**

- `autoGradeTransition.wiring.test.ts:159-172` (A5) asserts exactly TWO
  `formAction(` occurrences. After the fill there is ONE, inside
  `submitWholeRun`. A5 becomes: **exactly one `formAction(` occurrence, and it
  lies strictly inside a `startTransition(` paren span.** That is strictly
  stronger - fewer doors, same locality clause - and it is the direction RULING
  40 was already travelling.
- `autoGradeTransition.wiring.test.ts:126` (A2) asserts `formAction(` is called
  exactly once inside `handleAutoGrade`'s transition. After the fill
  `handleAutoGrade` contains no `formAction(` at all. A2's second clause
  becomes: **`beginWholeRun(` is called exactly once, strictly inside the
  handler's `startTransition(` span.**

Both changes land in the SAME commit as the code, each with the watched failure
in section 11 (F7, F8). **A brief that keeps A5 at two has not built the fill** -
it has left the second door open.

The rejected alternative, named so a later pass does not "simplify" back to it:
expose `resetIncremental()` and call it from `handleAutoGrade` before its own
`formAction(`. That keeps A5 at two and costs one line, but it is a standing
"remember to call this" obligation at every future dispatch site - which is
precisely the shape that produced B2 in the first place. The instrument for it
would be a brace-span assertion that a `resetIncremental(` precedes each
`formAction(` in its enclosing function: weaker, and it does not fire when
someone adds a THIRD dispatch site in a new function.

### 5.5 Two defences, and which is which

- **Construction:** one mount. Two tables are unrepresentable.
- **Belt:** `beginWholeRun` clears `incrementalRun` BEFORE calling
  `submitWholeRun` - the ordering inverse of today's
  `useIncrementalGradingRun.ts:133-142`. If it were forgotten, the failure
  would be "the older run shows", a single-table defect, not "two tables both
  claim to be the editable one".

The fill eliminates the double-table class. It REDUCES staleness to a
precedence question and answers that question with F6's truth table. It does
not claim to eliminate staleness.

### 5.6 The empty-state flash, which no gate can see

`GradingTab.tsx:487-493` renders "No supported submission files were found in
the zip archive." whenever `run && run.results.length === 0`. Under the fill,
`displayRun` during a running incremental run with zero arrivals is a
`GradingRun` with `results: []`. **That sentence would appear, in place of the
results, for the whole interval before the first row lands** - which on a real
run is seconds to tens of seconds, and it says the opposite of the truth.

Nothing in this repo can see it: nothing renders. So the gate has to be a pure
function with a truth table, `shouldShowEmptyState(phase, displayRun)`, which
is `false` for `"running"` and `"stopping"` and for any phase whose run is
null. F9 in section 11.

---

## 6. RESOLUTION 3 - the rubric-column union

### 6.1 Where the merge happens: PER ARRIVAL, RECOMPUTED FROM RAW

`GradingTab.tsx:601` is
`rubricAreaNames: incrementalResults[0]?.rubricAreas.map((a) => a.area) ?? []`.
The build check's B3 is right that this is not a union: it is the areas of the
lowest-arrived `sourceIndex`, recomputed on every arrival, because
`mergeArrivedResults` returns a DENSE array (`incrementalRunPlan.ts:167-172`).

**Decision: the merge happens PER ARRIVAL, recomputed from the RAW arrived rows
every time, and there is therefore no separate end-of-run merge at all.**

```
buildIncrementalRun({ header, speedGraderUrl, totalTicketCount, arrived, phase, tier2 })
  1. rows      = mergeArrivedResults(totalTicketCount, arrived)     // dense, ordered
  2. canonical = unionRubricAreaNames(header, arrived)
  3. projected = reconcileRun(rows, canonical)                      // THE SAME function
                                                                    // the whole-run path
                                                                    // calls at engine.ts:350
  4. return { results: projected.results,
              rubricAreaNames: projected.rubricAreaNames,
              fullCreditChecklist: tier2?.fullCreditChecklist ?? [],
              sampleAnswer:       tier2?.sampleAnswer,
              speedGraderUrl,
              rubricUsed:         header.rubricUsed,
              rubricFingerprint:  header.rubricFingerprint }
```

`unionRubricAreaNames(header, arrived)`:

- if `header.criteriaNames.length > 0`, return it **verbatim and frozen for the
  whole run**. Columns then cannot change mid-run at all, which is the
  strongest available property and costs nothing, because `criteriaNames` comes
  from `extractRubricCriteria(effectiveRubric)` - pure and synchronous
  (`rubric.ts:27-31`), the same call `gradeStudentEntries` makes at
  `engine.ts:208`;
- otherwise, a first-seen union over arrived rows in ascending `sourceIndex`
  order, deduped with `normalizeAreaName`, excluding the empty area and the
  `"Overall"` placeholder - the same exclusions `reconcileRun` itself applies at
  `reconcile.ts:54`. A union over a monotonically growing arrival set can only
  GROW, never reorder its existing prefix, so an existing column never moves.

**Why recomputing from RAW is the load-bearing word.** `reconcile.ts:41-44`
states its own constraint: reconciliation is idempotent under a STABLE
canonical set, and "it is NOT claimed to be commutative across a GROWING
canonical set - reconciling once against the final set is the only supported
call shape". Recomputing from the raw arrived rows means every recomputation is
a FIRST reconcile against the current set, never a second reconcile over
already-reconciled output. Applied forward instead, `reconcile.ts:79-84`'s
stray-fold would append the same stray comments to `overallComment` again on
every arrival - a comment that grows by one copy per student, on the field an
instructor sends to the student.

### 6.2 The blocker this creates, and the instrument that already catches it

Calling `reconcileRun` from the client requires importing
`@/lib/grade/reconcile` into a `"use client"` closure. **Today that would put
`lib/supabase/server` in the browser bundle.**

Measured chain, every hop opened:

```
reconcile.ts:20   import { normalizeAreaName } from "./rubric";
rubric.ts:1-2     import { callLlm } from "../llm";
                  import { findRubricForTopic } from "../research/rubric-bank";
research/db.ts:64 clientPromise = import("@/lib/supabase/server")      <- a VALUE import
```

And the repo has already frozen that exact chain as a violation:
`src/lib/module-graph/runtime-import-graph.test.ts:674` is the literal
`"lib/grade/engine.ts -> lib/grade/reconcile.ts -> lib/grade/rubric.ts -> lib/research/rubric-bank.ts -> lib/research/db.ts"`.

**The fix is one line, and it is behaviour-identical.** `normalizeAreaName` is
DEFINED at `src/lib/grade/prompts.ts:19`; `rubric.ts:442` merely re-exports it.
`prompts.ts:1-2` imports only `type { ... } from "./types"` and
`{ getBaseFileName } from "./utils"`; `utils.ts:1-3` imports
`type { ... } from "./types"`, `type { CodeRunResult } from "../code-runner"`
(type-only, erased) and `{ getMimeType } from "./constants"`; and
`src/lib/grade/constants.ts` has **no import statements at all** (verified: its
first line is `const MIME_TYPES: Record<string, string> = {`). So
`reconcile.ts:20` becomes `import { normalizeAreaName } from "./prompts";` and
the leaf is genuinely pure.

**The instrument for the dangerous direction already exists and runs today.**
`src/lib/canvas-client-boundary.runtime-graph.test.ts:16-35` roots a
`walkRuntimeGraph` at every `"use client"` ENTRY POINT in the app and fails on
any transitive value-import edge reaching a forbidden path prefix -
`src/lib/module-graph/client-boundary-policy.ts:18` is
`export const FORBIDDEN_PATH_PREFIXES = ["lib/supabase"];`.
`useIncrementalGradingRun.ts:1` is `"use client"`, so it is one of those roots.
**A brief that imports `reconcileRun` into the plan leaf without changing
`reconcile.ts:20` turns that file RED.** That is F10, and it is the one
instrument in this design I did not have to invent.

**The opposite direction is covered too, in the same commit.**
`runtime-import-graph.test.ts:674`'s frozen trail must be DELETED when the
import changes, and its deep-equal at `:709-712` (per the build check's M5,
which I did not re-open) goes red until it is. So: import changed without
deleting the trail -> red; trail deleted without changing the import -> red.
Both halves, one instrument. F11.

Section 13's **RES-FILL-1** carries the prose at
`runtime-import-graph.test.ts:645-657`, which the build check's M5 already
found wrong in three numbers and which this change makes wrong in a fourth
place (the comment at `:666-673` asserts reconcile.ts imports `./rubric`).

### 6.3 What the table shows while the union is incomplete

- **`criteriaNames` non-empty (the common case, and the case the fill makes
  more common because tier 1 fills a blank rubric):** the header is the final
  header from the first render. Every arrived row is reconciled against it, so
  a criterion no model mentioned renders as a present, EDITABLE, blank cell -
  `reconcile.ts:76` pushes `{ area: name, score: "", comment: "" }`, exactly as
  the whole-run path does. No column ever appears or disappears.
- **`criteriaNames` empty (blank or unparseable rubric, including a GENERATED
  rubric that does not parse):** the header grows as students arrive. An
  existing column never moves or empties, because the union's prefix is stable
  and every row is re-projected from raw against the grown set on the same
  arrival. A column that appears late is immediately populated for every
  already-arrived student who had that area.
- **A transport failure at index 0 no longer blanks the run.**
  `classifyItemFailure` returns `rubricAreas: []`
  (`incrementalRunPlan.ts:192`), which contributes nothing to a union and
  cannot empty one. Today it sets `rubricAreaNames` to `[]` for every student,
  because `incrementalResults[0]` IS that failure row.

The three downstream readers B3 names are all fed from the same
`rubricAreaNames`, so all three are fixed by the same change rather than
separately: the per-criterion cells, `buildCsvContent`, and `recomputeTotal`
(reached from `GradingResults.tsx:279`).

---

## 7. RESOLUTION 4 - cancellation and partial runs

### 7.1 The invariant the build check invokes does not apply here, and something else must

B1b cites `engine.ts:293-341`'s documented invariant - "`results[i]`
corresponds to `studentSubmissions[i]` for every i, and
`results.length === studentSubmissions.length`" - achieved by appending explicit
`not-attempted` rows with a `stoppedBy` reason.

That invariant is a property of **what `gradeStudentEntries` RETURNS**. The
incremental display run is not that object: it is assembled client-side by
`buildIncrementalRun` from N independent single-entry runs. So the invariant is
not violated, because it does not range over this object. Saying otherwise
would be the kind of claim that survives a round because nobody re-reads the
source.

What IS true, and is the real defect: **a stopped run and a complete run are
indistinguishable.** The table shows the arrived subset with no marker, and
`incrementalTotal` is never passed to `GradingResults` at all.

### 7.2 The answer: a run-level terminal statement, NOT a third `stoppedBy` member

`docs/a39-waves.md` 8.4.3 already ruled the copy: "the end-of-run line is
`Stopped. N of M submissions were graded; the rest were not started.`,
run-level, **not editable and not persisted**". The fill keeps that ruling and
adds the missing half - it must survive after the pool ends, which today it
cannot, because the region at `GradingTab.tsx:472-478` is gated on
`incrementalRunning` and unmounts.

So `describeRunProgress(phase, done, total)` owns all of the run-level copy in
one pure function:

| phase | sentence |
|---|---|
| `running` | `N of M submissions graded.` (today's `GradingTab.tsx:475`, unchanged) |
| `stopping` | `Stopping. N of M submissions graded; finishing the ones already in progress.` |
| `stopped` | `Stopped. N of M submissions were graded; the rest were not started.` |
| `complete` | `null` - a complete run needs no line, and the table is the receipt |
| `idle`, `refused` | `null` |

The `stopped` and `complete` sentences render through `GradingResults`'s
existing **`banner?: ReactNode`** prop (declared at
`GradingResults.tsx:152-153`, rendered at `:541`), which `GradingTab.tsx:583-590`
already uses. **No new prop, no new region, and `GradingResults.tsx` is not
edited** - which matters, because it is at 906 of 1000.

**The rejected alternative, and why.** Adding a third member to
`NotAttemptedOutcome["stoppedBy"]` (`types.ts:142` is
`readonly stoppedBy: "submission-count-bound" | "run-deadline";`) and emitting
a real not-attempted row per undispatched ticket would make `results.length`
equal the ticket count. It is rejected because it spends far more than it buys:
it touches `types.ts:142`, `UNGRADED_NOT_ATTEMPTED_MESSAGES` (`types.ts:193`),
the narrowing at `types.ts:319`, `ungradedDisclosure.ts`, `ungradedRowLabel.ts`
and the postability path - to add rows that carry no grade, cannot be posted,
and enter `buildCsvContent` and the class-trends entry. And it would put a new
row-writing site in a client leaf, next to W4-6a's pin that exactly one source
line in the repo writes `stoppedBy: "run-deadline"`.

**One difference this creates, recorded because it is real and I did not
measure it.** A partial incremental run's `GradingRun` contains only graded
rows, where a deadline-stopped whole run contains not-attempted rows with empty
`rubricAreas`. `engine.ts:296-298`'s own comment says those empty-area rows
raise `totalResults` without raising any area's `resultsWithArea` and
"silently switches every counted class-trends clause off". So a partial
incremental run's trends panel is computed over the graded subset and a partial
whole run's is not. I did not run anything against `class-trends.ts` and I am
not claiming which is better. **RES-FILL-4.**

### 7.3 Stop must be visible, and it must NOT abort

`cancel()` today sets `cancelledRef.current = true` and nothing else
(`useIncrementalGradingRun.ts:88-90`). `incrementalRunning` stays true, the
button stays enabled, and pressing Stop produces no visible change for up to
`TOTAL_BUDGET_MS = 50_000` per in-flight item (`route.ts:38`).

**Fixed by the state transition, not by an `AbortController`.** `cancel()` sets
`phase = "stopping"`, which changes the sentence (7.2) and disables the button.
That is a state change in the same render pass as the click.

**And this design REFUSES to add an `AbortController`, against the direction
the build check's M2 implies.** The reason: aborting the in-flight `fetch`
cannot stop the handler's model call - `route.ts:172-175` is already running,
and `src/lib/bounded-race.ts`'s own header (quoted in `docs/a39-waves.md`
8.4.3) says losing a race "does not cancel `work`". So an abort would DISCARD a
result that has already been paid for, which is strictly worse for the
instructor than waiting for it. In-flight items stay, land, and merge.

**The residual cost, stated rather than hidden:** the terminal `stopped`
sentence cannot appear until the last in-flight item settles, which is bounded
by `TOTAL_BUDGET_MS` (50s) times one, not times N, because at most
`INCREMENTAL_CONCURRENCY - 1 = 2` items are in flight and they settle in
parallel. The `stopping` sentence covers that window and says what is
happening. **Owner-walk item 3.**

---

## 8. RESOLUTION 5 - what stays exactly as it is

Named explicitly, because the build check attacked these and none of the
attacks landed, and because a fill is not a rewrite.

**NOT TOUCHED, NOT REDESIGNED, NOT RE-ARGUED:**

1. **The worker pool.** `useIncrementalGradingRun.ts:92-121`: the shared cursor
   claimed with no intervening `await` (`:100-102`), `workerCount =
   Math.min(INCREMENTAL_CONCURRENCY, requests.length)` (`:119`),
   `INCREMENTAL_CONCURRENCY = 3` (`incrementalRunPlan.ts:26`), and the per-item
   `try/catch` that isolates one failure into an ordinary row (`:104-112`).
2. **The `sourceIndex` attribution key**, fixed at ticket-build time in source
   order (`grading-incremental.ts:112`), and the client's deliberate
   IGNORING of the server's echoed index -
   `useIncrementalGradingRun.ts:69` returns
   `{ sourceIndex: request.sourceIndex, ... }`. The build check calls this the
   wave's best decision and it is not reopened. `buildIncrementalRun` consumes
   `arrived` exactly as the pool produces it.
3. **The per-item Route Handler, entirely.** `route.ts` is NOT in this design's
   write set: the guard order (`:132-136`), the CSRF floor before the body is
   parsed (`:142-145`), the untrusted-input validation (`:75-121`),
   `maxDuration = 60` with `TOTAL_BUDGET_MS = 50_000` under it (`:26`, `:38`),
   and the `raceWithTimeout` wrapper (`:172-175`) all stand. The ONE change it
   would otherwise have needed - echoing the rubric provenance stamp it
   discards at `:187-188` - is made unnecessary by putting provenance in the
   header instead (section 9.1).
4. **`ITEM_REQUEST_BYTE_BUDGET = UPLOAD_WIRE_BUDGET_BYTES`**
   (`incrementalRunPlan.ts:37`) and `estimateEntryWireBytes` (`:75-81`).
   Branch A of 8.4.3 step S3 stands.
5. **RULING 118's `mode: "refused"` dead end.** `grading-incremental.ts:136-139`
   routes a `"Refused: "`-prefixed message to its own mode, and
   `useIncrementalGradingRun.ts:161-165` answers it by surfacing the reason and
   starting nothing. **Nothing in this design re-routes a refusal into
   `submitWholeRun`, and the new tier-2 spender is dispatched only on
   `mode: "incremental"`.** The prefix sniff (`grading-incremental.ts:42`) is
   NOT extended to the blank-instructions refusal - that one returns
   `mode: "refused"` explicitly, before the `try`, because its message does not
   and should not carry that prefix.
6. **The `startLockRef` run lock** (`useIncrementalGradingRun.ts:79`,
   `:127-128`, released in the `finally` at `:173-180`). The build check's M1 -
   that the lock is dead on the SYNCHRONOUS whole-run branch because the
   `finally` releases it before the function returns - is real and is NOT fixed
   here. Adding a synchronous lock to `beginWholeRun` would reproduce exactly
   that dead code. **RES-FILL-2.**
7. **`reconcileRun`'s logic.** The only change to `reconcile.ts` is the
   one-line import move at `:20`. Its branches, its fallback at `:50-58`, its
   first-wins normalization and its two `rubricAreaNames` branches are
   untouched, so `reconcile.test.ts`'s frozen literal is unaffected.
8. **Extraction's collision-refusal placement.** `extraction.ts:145-148` puts
   `decideCollisionRefusal` strictly before `groupSubmissionsByStudent` at
   `:149`, and the fill's change to that function (section 9.2) inserts the
   filename inference BETWEEN them, so the refusal still fires first.
9. **`GradingResults.tsx`.** Not edited. At 906 lines it has 94 to the ceiling,
   and the fill needs nothing from it: `banner` and `run` already carry
   everything.

---

## 9. The write set

### 9.1 Files, roles, and why each is here

| Path | Role | Delta |
|---|---|---|
| `src/lib/grade/types.ts` | **edit.** `GradingRunHeader`, `GradingRunTier2` | +~25 |
| `src/lib/grade/run-header.ts` | **new.** `resolveRunHeader`. SERVER-ONLY | `-le 140` |
| `src/lib/grade/run-header.test.ts` | **new.** F1, F2, F3 | `-le 300` |
| `src/lib/grade/reconcile.ts` | **edit, ONE LINE.** `:20` imports `./prompts` | 0 |
| `src/lib/grade/extraction.ts` | **edit.** `extractStudentEntries` gains an optional filename-inference option (item #9) | +~20 |
| `src/app/actions/grading.ts` | **edit, THE OTHER CALLER.** Its two blank-instructions returns and its `effectiveRubric` block become `resolveRunHeader` calls | **must SHRINK** |
| `src/app/actions/grading-incremental.ts` | **edit.** tier 1, the header on the result, `completeGradingRunHeaderAction` | `-le 260` |
| `src/app/actions/grading-incremental.test.ts` | **edit.** F1b, F4, F12 | `-le 420` |
| `src/app/components/grading/incrementalRunPlan.ts` | **edit.** the five pure functions of section 3 | `-le 300` |
| `src/app/components/grading/incrementalRunPlan.test.ts` | **edit.** F6, F9, F13, F14 | `-le 560` |
| `src/app/components/grading/useIncrementalGradingRun.ts` | **edit.** the phase machine, `beginWholeRun`, tier-2 kickoff | `-le 300` |
| `src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts` | **edit.** F4, F12 | `-le 760` |
| `src/app/components/GradingTab.tsx` | **edit, THE CALLER.** one mount, one door | `-le 620` |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **owned, EXPECTED TO CHANGE.** A2, A5; F5, F7, F8 | - |
| `src/lib/module-graph/runtime-import-graph.test.ts` | **owned, EXPECTED TO CHANGE.** the frozen trail at `:674` | - |

### 9.2 `extractStudentEntries` gains an option rather than a second copy

```
extractStudentEntries(zipBuffer, options?: { inferFileNamesWith?: LlmProvider })
```

When `inferFileNamesWith` is given, it calls `inferFileNameConvention` after
the collision refusal and before `groupSubmissionsByStudent`, and passes the
lookup instead of `undefined`. When it is absent, behaviour is byte-identical
to today.

Its two production callers, derived:

```
grep -rn "extractStudentEntries" src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> src/app/actions/grading-incremental.ts:21  (import)
     src/app/actions/grading-incremental.ts:91  (the call the fill changes)
     src/app/actions/grading.ts:4               (import, via the @/lib/grade barrel)
     src/app/actions/grading.ts:854             (the EMBEDDED zip branch)
     src/lib/grade/extraction.ts:135            (the definition)
     src/lib/grade.ts:12                        (the barrel re-export)
```

`grading.ts:854` is the embedded deterministic branch, which correctly wants NO
inference; a trailing optional option leaves it unchanged. The rejected
alternative was for `prepareGradingRunAction` to compose `extractSubmissions` +
`decideCollisionRefusal` + `inferFileNameConvention` +
`groupSubmissionsByStudent` itself - a second copy of extraction's own
composition, in a different file, which is how the two routes diverged in the
first place.

**Not consolidated, and recorded rather than done:** `gradeSubmissions`
(`engine.ts:365-423`) still hand-composes the same four steps. Making it call
`extractStudentEntries` too would be the right end state and is a refactor of
the engine's own ingestion, with its own oracle. **RES-FILL-3.**

### 9.3 The `owns` list, derived

Test files that read a write-set file AS SOURCE TEXT. Command and output
pasted; the canary's exit code is read from the grep itself, never through a
pipe:

```
grep -rlE "GradingTab\.tsx|grading-incremental|incrementalRunPlan|useIncrementalGradingRun|grade/reconcile|actions/grading\.ts" src --include=*.test.ts | sort
  -> src/app/actions/action-guard-coverage-github-cohort.test.ts
     src/app/actions/grading-incremental.test.ts
     src/app/actions/grading-missing-submissions.test.ts
     src/app/actions/grading-run-mapping.test.ts
     src/app/actions/grading.budget.test.ts
     src/app/actions/grading.guard.test.ts
     src/app/components/autoGradeTransition.wiring.test.ts
     src/app/components/componentStorageKeys.structure.test.ts
     src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
     src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
     src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
     src/app/components/grading-results/rubricProvenanceLeaf.test.ts
     src/app/components/grading/incrementalRunPlan.test.ts
     src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts
     src/lib/canvas-client-boundary.runtime-graph.test.ts
     src/lib/grade/postable.test.ts
     src/lib/grade/reconcile.test.ts
     src/lib/module-graph/runtime-import-graph.test.ts

grep -rlE "GradingTabZZZ\.tsx|grade/reconcileZZZ" src --include=*.test.ts > /tmp/canary.txt
  CANARY_EXIT=1, 0 lines                                  # the instrument fires on real names only
```

Test files that read them BY IMPORT (not found by the source-text instrument,
which is why the second command exists):

```
grep -rlE 'from "\./engine"|from "\./reconcile"|from "@/lib/grade/engine"|from "@/lib/grade/reconcile"' src --include=*.test.ts | sort
  -> src/app/api/grade-run-item/route.test.ts
     src/lib/grade/collisionRefusal.wiring.test.ts
     src/lib/grade/engine.test.ts
     src/lib/grade/engine.ungraded.test.ts
     src/lib/grade/reconcile.test.ts
     src/lib/grade/rubric-stamp.wiring.test.ts
  canary 'from "\./engineZZZ"' -> CANARY_EXIT=1

grep -rlE 'from "\./grading"|from "@/app/actions/grading"' src --include=*.test.ts | sort
  -> src/app/actions/grading-checklist.test.ts
     src/app/actions/grading.budget.test.ts
     src/app/actions/grading.collisionRefusal.test.ts
     src/app/actions/grading.guard.test.ts

grep -rln "extractStudentEntries" src --include=*.test.ts
  -> src/app/actions/grading.budget.test.ts
     src/app/actions/grading.collisionRefusal.test.ts
     src/app/actions/grading.guard.test.ts
     src/lib/grade/collisionRefusal.wiring.test.ts
     src/lib/grade/extraction.test.ts
     src/lib/grade/grouping-zip-parents.wiring.test.ts
```

**The gate's `test:paths` list is the UNION of all five outputs plus the three
structural gates.** Spelled with the wrapper, never a raw multi-path `vitest`,
which silently drops any argument it does not match:

```powershell
npm run test:paths -- src/lib/grade/run-header.test.ts src/lib/grade/reconcile.test.ts src/lib/grade/engine.test.ts src/lib/grade/engine.ungraded.test.ts src/lib/grade/extraction.test.ts src/lib/grade/collisionRefusal.wiring.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts src/lib/grade/rubric-stamp.wiring.test.ts src/lib/grade/postable.test.ts src/app/actions/grading-incremental.test.ts src/app/actions/grading.budget.test.ts src/app/actions/grading.guard.test.ts src/app/actions/grading.collisionRefusal.test.ts src/app/actions/grading-checklist.test.ts src/app/actions/grading-missing-submissions.test.ts src/app/actions/grading-run-mapping.test.ts src/app/actions/action-guard-coverage.test.ts src/app/actions/action-guard-coverage-github-cohort.test.ts src/app/api/grade-run-item/route.test.ts src/app/components/autoGradeTransition.wiring.test.ts src/app/components/componentStorageKeys.structure.test.ts src/app/components/grading/incrementalRunPlan.test.ts src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts src/app/components/grading-results/gradingResultsHelpersEditState.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/app/components/grading-results/rubricProvenanceLeaf.test.ts src/lib/canvas-client-boundary.runtime-graph.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/lib/use-server-exports.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
npm test
npx tsc --noEmit --incremental false
```

PASS: every argument reported `COVERED`, exit 0; `npm test` zero failed, exit 0;
`tsc` silent. `npm run build` is run once and the gate is the
`Compiled successfully` LINE, grepped for, not the exit code - it is the only
gate that catches a `"use server"` module exporting a non-async binding, and
this design adds an export to one.

**I ran none of these.**

### 9.4 Two owned tests that the fill makes stronger for free

- `src/app/components/grading-results/rubricProvenanceLeaf.test.ts:93-101`
  (W2-7 clause 2) asserts `<RubricProvenance` appears in `GradingTab.tsx`
  strictly before `<GradingResults`. Today it passes because the FIRST
  `<GradingResults` happens to be the whole-run one; the incremental mount at
  `:597` has no provenance above it and the test cannot see that. With one
  mount, "before the first" and "before the only" are the same statement, and
  the test becomes a real claim. No edit needed.
- `src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts:315`
  uses `.exec` (FIRST match per file) to assert `assignmentName=` reaches
  `GradingTab.tsx`'s `<GradingResults`. Collapsing two mounts to one leaves it
  green, and removes the second, unchecked mount it could never see.

---

## 10. Sizes, ceilings, and where an extraction would cut

`GradingTab.tsx` is **620** on both counters, against the repo's hard 1000 and
against `docs/a39-waves.md` 8.4.4's own `-le 620`.

Estimated delta, derived line by line rather than guessed:

| Change | Lines |
|---|---|
| DELETE the second mount, `GradingTab.tsx:595-615` | **-21** |
| destructure `phase`, `incrementalRun`, `beginWholeRun`, tier-2 from the hook | +4 |
| `displayRun` / `progressLine` reads | +3 |
| the terminal sentence into the existing `banner` expression | +4 |
| `shouldShowEmptyState(...)` at `:487` | +1 |
| the generated-rubric card reads the merged value instead of `state.generatedRubric` | +1 |
| `handleAutoGrade:206` `formAction(fd)` -> `beginWholeRun(fd)` | 0 |
| **net** | **about -8, landing near 612** |

That is an ESTIMATE and the implementer measures both counters at the gate. It
is under 620, so the wave's own bound needs no change.

**If it lands above 620, the extraction is named and it is not a judgement
call:** `GradingTab.tsx:495-532` - the `state.generatedRubric` `details` card,
38 lines - is a self-contained pure render of one value with no other
dependency on this component's state. It moves to
`src/app/components/grading-results/GeneratedRubricCard.tsx` and the call site
is one line. That cut alone takes the file to about 575. It is NOT done
speculatively: an extraction taken when it is not needed costs a new call site
and a new file for nothing.

New-file bounds are in the table at 9.1. `incrementalRunPlan.ts` at 199 plus
five pure functions lands near 270 against its existing `-le 300`;
`useIncrementalGradingRun.ts` at 192 plus the phase machine lands near 250,
well under its `-le 560`. `src/lib/grade/run-header.ts` is bounded at 140
because it holds one function whose whole body is the four lines it replaces at
`grading.ts:882-888` plus the stamp and the criteria call.

**The react budget (W4-9c) is unchanged and binding.**
`useIncrementalGradingRun.ts:19` is `import { useRef, useState } from "react";`
and must stay exactly that. The phase is a `useState`; the tier-2 merge is a
`.then` on a promise inside `startReview` that calls `setState`, not an effect.
**No `useEffect`, `useCallback` or `useMemo` is added** - the lifecycle
harness's `vi.mock("react", ...)` supplies exactly two hooks, and a third makes
it THROW rather than fail red, which is an unread gate rather than a red one.

**And that is why `buildIncrementalRun` is called in the POOL, not in
`GradingTab`'s render body.** Calling it during render would recompute
`reconcileRun` over every arrived row on every keystroke in the instructions
`TextField` (`GradingTab.tsx:399-410`), and the obvious fix - `useMemo` - is
banned by the budget above. Computing it on each arrival and storing the result
in state costs nothing per render and needs no third hook.

---

## 11. Requirements, with the instrument and the mutation for each

**I RAN NONE OF THESE AND APPLIED NONE OF THESE MUTATIONS.** My write set is
this document. Each row names what the implementer must watch go red BEFORE
writing the code that makes it green.

| id | Requirement | Instrument | Mutation that must turn it RED |
|---|---|---|---|
| **F1** | `resolveRunHeader` generates a rubric when, and only when, the rubric is blank AND `synthesizeRubricWhenBlank` is true; `generatedRubric` is set on exactly that branch | `npm run test:paths -- src/lib/grade/run-header.test.ts`, with `generateRubric` mocked; four cases (blank+zip, blank+canvas, filled+zip, filled+canvas) | make the call unconditional -> the filled-rubric cases see the mock called. Make it always skip -> the blank+zip case's `effectiveRubric` is `""` |
| **F2** | Blank instructions return `{kind:"refused"}` with the message BYTE-IDENTICAL to `grading.ts:882`'s `"Please provide assignment instructions."`, and no model call is made | same file; assert the string by equality, and assert the `generateRubric` mock was not called | change one character of the message -> red. Move the refusal after the generation -> the mock-not-called assertion goes red |
| **F3** | `criteriaNames` is `extractRubricCriteria(effectiveRubric)`, not of the raw rubric | same file: a blank-rubric zip case whose GENERATED rubric parses to two criteria asserts `criteriaNames.length === 2` | read `rubric` instead of `effectiveRubric` -> `[]` |
| **F4** | **Every tier-1 step completes before any ticket is dispatched.** Measured as ORDER at the consumer, not as a not-called assertion inside a module with no call site | `useIncrementalGradingRun.lifecycle.test.ts`: one shared call-log array written by the `prepareGradingRunAction` stub and by the `fetch` stub; assert the prepare entry precedes every fetch entry, and that every fetch body's `rubric` equals the stub's `header.effectiveRubric` and is non-empty | dispatch the pool before awaiting prepare -> the log order inverts. Have the prep return the raw blank rubric -> the body-equality clause goes red |
| **F5** | `GradingTab.tsx` contains **exactly one** `<GradingResults` element, and it is not inside a `.map(` | `autoGradeTransition.wiring.test.ts`: `[...gtSource.matchAll(/<GradingResults(?=[\s/>])/g)].length === 1`, plus the innermost enclosing brace span of that match contains no `.map(`. The lookahead is copied from `gradingResultsExtraction.wiring.test.ts:315`, which documents why a bare `\b` also matches `<GradingResultsHandle>` | add a second `<GradingResults` anywhere -> 2. Wrap the one mount in a `.map(` -> the span clause goes red |
| **F6** | `selectDisplayRun` is total over all six phases | `incrementalRunPlan.test.ts`: a truth table over all six phases crossed with (incremental null / non-null) and (whole null / non-null) - twenty-four rows, each asserted by identity against the expected object | return `incrementalRun ?? wholeRun` -> the `idle`-with-a-stale-incremental row goes red. Add a default branch that returns `wholeRun` -> the `refused` row goes red |
| **F7** | Exactly one `formAction(` occurrence in `GradingTab.tsx`, strictly inside a `startTransition(` paren span | `autoGradeTransition.wiring.test.ts` A5, rewritten. **WATCHED: change the assertion to 1 FIRST and run it against today's unchanged file - it must go RED at 2, proving the count is the thing discriminating** | leave `handleAutoGrade:206`'s `formAction(fd)` in place -> 2. Move `submitWholeRun`'s call outside the transition -> the span clause goes red |
| **F8** | `handleAutoGrade` dispatches through `beginWholeRun(`, exactly once, inside its own `startTransition(` span | `autoGradeTransition.wiring.test.ts` A2, rewritten. **WATCHED: write it first against today's file and see it go RED on the `beginWholeRun(` presence clause while A3's `setGradingTarget` clause stays GREEN** - which proves the handler span is being found rather than the whole assertion failing for want of an anchor | call `beginWholeRun` outside the transition -> the span clause goes red. Call it twice -> the count goes red |
| **F9** | The zip empty-state sentence never renders while a run is in progress | `incrementalRunPlan.test.ts`: `shouldShowEmptyState(phase, run)` truth table; false for `running` and `stopping`, false for a null run, true for `complete`/`idle` with a zero-result run | return `run !== null && run.results.length === 0` -> the `running` rows go red |
| **F10** | No `"use client"` closure reaches `lib/supabase` | **`src/lib/canvas-client-boundary.runtime-graph.test.ts` - it already exists and already runs.** It roots a walk at every `"use client"` entry point (`:16-35`) and fails on a value edge reaching `FORBIDDEN_PATH_PREFIXES` (`client-boundary-policy.ts:18`) | import `@/lib/grade/reconcile` into `incrementalRunPlan.ts` WITHOUT changing `reconcile.ts:20` -> the chain `reconcile -> rubric -> rubric-bank -> db (db.ts:64's dynamic `import("@/lib/supabase/server")`)` enters the closure and it goes red |
| **F11** | The frozen import-graph trail matches the tree in BOTH directions | `runtime-import-graph.test.ts`'s deep-equal over `FROZEN_TRAILS` | delete `:674`'s trail without changing `reconcile.ts:20` -> red (the trail is still real). Change `reconcile.ts:20` without deleting `:674` -> red (the trail is gone). **There is no way to satisfy one half alone** |
| **F12** | Tier 2 is dispatched on `mode: "incremental"` only, and never on `"refused"` or `"whole-run"` | `useIncrementalGradingRun.lifecycle.test.ts`: a `completeGradingRunHeaderAction` stub, asserted called exactly once on the incremental path and zero times on each of the other two. **This is a real seam - the stub IS on the path the code under test calls**, unlike the `mockCallLlm` assertion the build check's B4 found unfalsifiable | hoist the tier-2 call above the mode switch -> the refused and whole-run cases see it called |
| **F13** | A student whose areas differ from the union gets a present, editable, blank cell - never a missing one - and a transport failure at index 0 does not empty the header | `incrementalRunPlan.test.ts`: a fixture of three arrived rows with divergent area names plus one `classifyItemFailure` row at index 0; assert every result's `rubricAreas` length equals `rubricAreaNames` length, for every row | build `rubricAreaNames` from `arrived[0]` (today's `GradingTab.tsx:601`) -> the failure-at-0 case yields `[]` and the parity assertion goes red |
| **F14** | `mergeArrivedResults` drops nothing and overwrites nothing silently | `incrementalRunPlan.test.ts`: iterate the map's SORTED KEYS instead of `0..totalTicketCount`, and assert `merged.length === arrived.length`; cases for a duplicate index and for an index at and above `totalTicketCount` | keep the `for (let i = 0; i < totalTicketCount; ...)` loop at `incrementalRunPlan.ts:168` -> the out-of-range case loses a row and the length assertion goes red. This is the build check's M6, and the construction removes the class rather than testing for it |

**Three requirements that deliberately have NO in-repo instrument**, named so no
green is read as covering them: the six visible effects in section 12. A
requirement whose only enforcer would be a render is not proposed here.

**Two instruments I considered and REFUSED to recommend**, because I could not
run them and because each would claim more than it measures:

- A per-item rubric-fingerprint consistency check (the handler echoes
  `rubricFingerprint`, the client compares it with the header's). It cannot
  fail: `buildRunItemRequests` (`incrementalRunPlan.ts:143-152`) builds every
  body from the single `plan.rubric`, so divergence is unreachable. A check
  whose assertion cannot fail is the class the build check's B4 names.
- An end-to-end oracle over `gradeAction` proving the `resolveRunHeader`
  extraction is behaviour-preserving. `gradeAction` needs Canvas, extraction,
  three model seams and Supabase mocked, and I cannot run it to find out
  whether such a harness would be measuring the extraction or the mocks. **The
  extraction's behaviour-preservation is therefore argued from the diff -
  `grading.ts:882` and `:885-888` become one call with the same branches, and
  `:810` becomes the same call with `synthesizeRubricWhenBlank: false` - plus
  F1/F2/F3 on the extracted function. There is no end-to-end oracle and this
  document does not pretend one exists.** This is the weakest point in the
  design and it is named as such.

---

## 12. What needs an owner walk

Nothing renders under this repo's vitest. Each item has an owner, an instrument
and a step. All six are due in **ONE sitting** - the same run answers them, and
splitting them costs six runs.

| # | Claim | Owner | Instrument | Direction of failure |
|---|---|---|---|---|
| 1 | Time to the first readable row falls | repo owner | W4-7 (`docs/a39-waves.md` 8.4.5): one real run of at least five submissions on the default provider, timed from the Start Review press to the first actionable row, before and after | the after value not lower than the before value |
| 2 | Columns do not change under the reader, and cells are filled | repo owner | one run with a BLANK rubric and at least five submissions whose feedback uses different area wording; watch the header while rows land | a column appearing, disappearing or reordering after a row has been read; any blank non-editable cell |
| 3 | Stop is visibly immediate | repo owner | press Stop mid-run; watch the button and the sentence in the same frame, then watch the terminal sentence appear | no visible change on the press, or no terminal sentence after in-flight items settle |
| 4 | A stopped run is distinguishable from a complete one | repo owner | read the table after a stopped run; count rows against the class | the table reading as complete, or the count in the sentence disagreeing with the rows |
| 5 | The late full-credit checklist and sample answer do not shift the page under the reader | repo owner | scroll to a row, then wait for tier 2 to land | the reader's row moving on screen when the two panels mount |
| 6 | `RubricProvenance` shows on an incremental run | repo owner | one incremental run; look for the "Rubric used" region above the table | absent, or reporting a rubric the run did not grade against |

**The flag must not flip on a green suite alone. Items 1, 2 and 4 have no
in-repo instrument of any kind** - not a weak one, none - and item 2 is the one
whose failure silently changes a grade.

---

## 13. Residual register

Each entry names an OWNER, an INSTRUMENT and the STEP that measures it.
**Missing any of the three it is a deletion, and I would call it that.**

**A residual that is not in `docs/BACKLOG.md` does not exist**
(`docs/DEV_LOOP.md` step 0). **This document does not write
`docs/BACKLOG.md`** - my write set is this one file. Until these six are
transcribed there as rows, they do not exist, and I am naming that rather than
assuming someone will.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| **RES-FILL-1** | `runtime-import-graph.test.ts:645-657`'s prose is wrong in three numbers (the build check's M5, which I did not re-open), and `:666-673`'s comment asserts `reconcile.ts` imports `./rubric`, which this design makes false | the implementer of the `reconcile.ts:20` change | `awk 'NR>=645&&NR<=675' src/lib/module-graph/runtime-import-graph.test.ts` read against the post-change tree | the same commit that changes `reconcile.ts:20` rewrites both comment blocks. **A stale comment beside a frozen list is how a `9 -> 10` bump becomes indistinguishable from a silenced guard** |
| **RES-FILL-2** | The `startLockRef` lock is dead on the SYNCHRONOUS whole-run path: the `finally` at `useIncrementalGradingRun.ts:173-180` releases it before `startReview` returns, so two same-render calls both dispatch. The fill neither fixes nor worsens it, and `beginWholeRun` deliberately does NOT claim it. W4-9's instrument (`lifecycle.test.ts`, per the build check's M1) visits only the incremental route | the chunk that next owns `useIncrementalGradingRun.ts` | extend W4-9's press-twice case to a `fdWithoutCanvasUrl()` / non-gemini fixture and assert total dispatches is 1 | before any change that makes the whole-run branch reachable without `disabled={pending}` in front of it. **The fill widens this surface by one entry point** (Auto Grade now goes through `beginWholeRun`), whose guard is A7's `disabled={pending}` |
| **RES-FILL-3** | `gradeSubmissions` (`engine.ts:365-423`) still hand-composes `extractSubmissions` + `decideCollisionRefusal` + `inferFileNameConvention` + `groupSubmissionsByStudent`, which `extractStudentEntries` will now also do. Two compositions of the same four steps is how divergence #9 happened | the chunk that next owns `src/lib/grade/engine.ts` | a frozen-literal oracle over `gradeSubmissions`'s returned `results[].student` for a zip whose filenames need inference, captured BEFORE the consolidation | after the fill ships. **Not inside the fill** - consolidating the engine's ingestion under the same commit that changes student-name derivation would leave no oracle that is independent of the change |
| **RES-FILL-4** | A partial incremental run's `GradingRun` holds only graded rows; a deadline-stopped whole run holds not-attempted rows with empty `rubricAreas`, which `engine.ts:296-298` says switches every counted class-trends clause off. Which behaviour the trends panel should have is undecided, and I measured neither | repo owner, then whoever owns `class-trends.ts` | `toClassTrendsEntry` over two fixtures - one partial incremental run, one deadline-stopped whole run - asserting which clauses fire | at the owner walk in section 12, item 4. **Not a blocker on the flag**: both behaviours are defensible and neither loses a grade |
| **RES-FILL-5** | `gradeAction` pays `generateRubric` (`grading.ts:885`) BEFORE extraction runs inside `gradeSubmissions` (`:907`), so a blank-rubric whole-run zip that is going to be collision-refused pays one model call first. The incremental route's tier-1 ordering avoids it; the whole-run route is NOT reordered here | the chunk that next owns `src/app/actions/grading.ts` | `grading.collisionRefusal.test.ts` with a `callLlm` mock, asserting zero calls for a colliding fixture | after the fill. **Reordering `gradeAction` is a behaviour change to the path every provider uses and it does not belong in a wave whose subject is the other path** |
| **RES-FILL-6** | `RULING 57`'s enumeration of "every producer stamps the rubric pair" lives in a COMMENT (`src/lib/grade/rubric-provenance-stamp.ts:1-18`) and in no test. `rubric-stamp.wiring.test.ts` asserts `gradeEntries`'s BEHAVIOUR (`:72-73`), not the call-site set. So this design's new `stampRubricProvenance` caller in `run-header.ts` is unenforced in both directions | the chunk that next adds a `GradingRun` producer | the comment's own command, `grep -rnE "\)\s*:\s*(Promise<)?GradingRun>?\s*\{" src --include=*.ts \| grep -v "\.test\.ts"`, compared against the `stampRubricProvenance` call sites | the fill's commit updates the comment by hand and says it did. **A comment is not an enforcer and this document does not treat it as one** |

---

## 14. Disposition of every prior requirement

### 14.1 The build check's findings

| Prior | Disposition |
|---|---|
| **B1** (six dropped outputs) | **KEPT and WIDENED to ten** - section 4.1. Items 1-8 are its six plus the generated-rubric CARD as a separate render site and the `rubricUsed`/`rubricFingerprint` discard at `route.ts:187-188`. Items 9 and 10 are NEW. Its item 2 is **CORRECTED**: rubric generation is a zip-path-only behaviour (4.2) |
| **B1b** (no row for an undispatched ticket) | **HANDED OVER, with its premise corrected.** The engine invariant it cites does not range over the client-assembled display run (7.1). The real defect - a stopped run indistinguishable from a complete one - is closed by `describeRunProgress` through the existing `banner` prop (7.2), NOT by a third `stoppedBy` member. The class-trends difference becomes RES-FILL-4 |
| **B2** (two tables over one edits surface) | **KEPT, and closed by construction** - F5 makes it unrepresentable; F6 decides precedence; one door (5.4) makes the phase reset unforgettable |
| **B3** (columns sampled from one arrived row) | **KEPT entirely.** Resolved by a run-level `criteriaNames` plus a growing union plus `reconcileRun` recomputed from raw (section 6). All three of its downstream consequences fall out of the one fix |
| **B4** (the refusal instrument cannot fail) | **KEPT, and the fill changes its KIND rather than its strength**, which is what the build check's section 7 demanded. Tier 1 puts a real model-call site (`generateRubric`) inside `prepareGradingRunAction`, so `mockCallLlm` becomes reachable and F2's not-called assertion becomes falsifiable. F4 measures the ordering at the consumer |
| **B5** (the refusal re-enters the paying path) | **ALREADY CLOSED by RULING 118** (`grading-incremental.ts:117-140`, `useIncrementalGradingRun.ts:161-165`), re-verified against the tree. The fill's obligation is not to reopen it: the tier-2 spender is dispatched on `mode: "incremental"` only (F12) |
| **M1** (dead lock on the whole-run route) | **HANDED OVER as RES-FILL-2**, with the fill's own widening of that surface stated |
| **M2** (`cancel()` changes no state, aborts nothing) | **SPLIT.** The invisibility half is KEPT and fixed by the phase transition (7.3). The `AbortController` half is **WITHDRAWN, with the reason**: an abort discards work already paid for and cannot stop the handler's model call. The residual latency is named and becomes owner-walk item 3 |
| **M3** (the frozen literal's provenance) | **NOT IN SCOPE.** `reconcile.test.ts` is untouched except that its subject gains a one-line import change with no behavioural effect. The build check settled the underlying question by reading the diff; nothing here disturbs it |
| **M4** (`classifyItemFailure` discards the file list) | **KEPT, and it is a one-line fix inside this write set**: `incrementalRunPlan.ts:195-196` hardcodes `mergedFileCount: 0` and `submittedFiles: []` while `useIncrementalGradingRun.ts:108-111` holds `request.entry`. Pass `request.entry` and carry both, matching `buildUngradedRow`'s own posture at `engine.ts:175-176`. Instrument: the F13 fixture asserts a failure row's `mergedFileCount` and `submittedFiles` equal the ticket's |
| **M5** (stale import-graph prose) | **HANDED OVER as RES-FILL-1**, and the fill makes one more of its comments false, which is why it is carried rather than left |
| **M6** (silent drop / overwrite in the merge) | **KEPT, and the construction removes the class** - F14 |
| **m1** (a WATCHED test that restates its sibling) | **NOT IN SCOPE.** Named here so it is not read as withdrawn |
| **m2** (`previewContent` unbounded in the body) | **NOT IN SCOPE.** `route.ts` is not in the write set (section 8 item 3). The build check established the exposure is request bytes, not model spend |
| **m3** (the whole-zip size gated against the per-item budget) | **NOT IN SCOPE, and the fill does not change it.** `routeGradingRun` (`incrementalRunPlan.ts:120-137`) keeps its conservative client-side check; the real gate stays server-side at `grading-incremental.ts:106-110` |
| **m4** (`raceWithTimeout` mocked, so the budget arithmetic is unasserted) | **NOT IN SCOPE.** `route.ts` untouched |

### 14.2 The wave's own pass conditions

| Prior | Disposition |
|---|---|
| **A5** (`formAction(` exactly two) | **CHANGED to exactly ONE, strictly inside a transition** - F7. A tightening, not a reversal: RULING 40's own direction was fewer doors |
| **A2** (`formAction(` once inside `handleAutoGrade`'s transition) | **CHANGED to `beginWholeRun(` once inside that transition** - F8 |
| **A6** (the `pending` loading region's guard span holds no `\|\|`) | **KEPT VERBATIM, and it is a constraint on the fill.** `autoGradeTransition.wiring.test.ts:183` is `!spanText.includes("||")`. The `pending` region (`GradingTab.tsx:268-280`) and the progress region (`:472-478`) **must stay separate siblings**. A brief that merges them into `pending \|\| incrementalRunning` turns A6 red |
| **A7** (`disabled={pending}` exactly three in `LiveFeedPanel.tsx`) | **KEPT VERBATIM.** That file is not touched, and A7 remains Auto Grade's own double-press guard (RES-FILL-2) |
| **W4-6a / W4-6b** (the `run-deadline` row writer and the deadline form field) | **KEPT VERBATIM, and the fill adds NEITHER.** Refusing the third `stoppedBy` member (7.2) is what keeps W4-6a at exactly one source line. Both greps must return their pasted sets unchanged at the gate, and must be run BEFORE the wave starts so a difference is attributable |
| **W4-8** (Stop and the progress region precede the first `<GradingResults`) | **KEPT VERBATIM and made meaningful.** Keeping `incrementalRunning` as a derived boolean preserves its `indexOf("incrementalRunning &&")` anchor at `:336`, and with one mount "the first" is "the only" |
| **W4-9 / W4-9b / W4-9c** | **KEPT.** W4-9b's `action=`-absent clause is untouched; W4-9c's two-hook budget is re-stated as binding in section 10 |
| **W2-7 clause 2** (`RubricProvenance` above `GradingResults`) | **KEPT, and strengthened for free** - 9.4 |
| **W4-7** (owner-only time to first row) | **KEPT VERBATIM** as owner-walk item 1 |
| **RES-W4C-1** ("a lighter union of what has arrived") | **WITHDRAWN.** The build check established it describes neither the mechanism nor the consequence, and a residual is triaged from its text. It is replaced by section 6, which makes it a defect the fill closes rather than a residual anyone accepts. **The enforcer it protected was nothing - it was a note, not a gate** |
| **RES-W-11, RES-W-12, RES-W-14** (`docs/a39-waves.md` section 12) | **KEPT VERBATIM, unchanged and still owner-only.** The fill touches none of their premises, and their sitting is the same sitting as section 12's |

### 14.3 Withdrawn with the reason stated

- **The per-item provenance echo.** `route.ts` will NOT echo
  `rubricUsed`/`rubricFingerprint`. Withdrawn because the header carries them
  once, deterministically, present even if every item fails transport - and an
  echo would need the client to pick one of N and would reintroduce an
  arrival-dependent sample, the exact shape of B3. Enforcer protected: none
  existed.
- **`state.warnings` on the incremental route** (item #10 of 4.1). Withdrawn:
  the incremental route produces no warnings and the region at
  `GradingTab.tsx:534-543` stays driven from `state` alone. Recorded so a later
  pass does not read its absence as an oversight.
- **A third `stoppedBy` member.** Withdrawn with the full reason at 7.2.
  Enforcer protected: W4-6a, which refusing it keeps intact.
- **An `AbortController`.** Withdrawn with the reason at 7.3. Enforcer
  protected: none; the build check's M2 named the absence, not a gate.

---

## 15. The flag's flip condition

`INCREMENTAL_ROUTE_ENABLED` (`incrementalRunPlan.ts:99`) goes to `true` when
**all three groups** below hold. Not two of three.

**GROUP A - checkable in this repo, by command:**

1. `[...src.matchAll(/<GradingResults(?=[\s/>])/g)].length === 1` for
   `GradingTab.tsx` (F5).
2. `grep -c "incrementalResults\[0\]" src/app/components/GradingTab.tsx` -> 0.
3. `grep -c "fullCreditChecklist: \[\]" src/app/components/GradingTab.tsx` -> 0.
4. `[...src.matchAll(/formAction\(/g)].length === 1` for `GradingTab.tsx`, each
   inside a `startTransition(` span (F7).
5. `grep -n "normalizeAreaName" src/lib/grade/reconcile.ts` shows the import
   resolving to `./prompts`, and
   `grep -c "lib/grade/reconcile.ts -> lib/grade/rubric.ts" src/lib/module-graph/runtime-import-graph.test.ts`
   -> 0 (F10, F11).
6. `grep -n "sectionRef=" src/app/components/GradingTab.tsx` -> exactly one
   occurrence, on the one mount (item #8).
7. `grep -n "inferFileNamesWith\|inferFileNameConvention" src/app/actions/grading-incremental.ts src/lib/grade/extraction.ts`
   shows the inference reached from the incremental prep (item #9).
8. F1 through F14 green, each having been WATCHED red first.
9. `npm run test:paths -- <the 9.3 list>` all `COVERED`, exit 0; `npm test`
   zero failed, exit 0; `npx tsc --noEmit --incremental false` silent;
   `npm run build` prints `Compiled successfully`.
10. `GradingTab.tsx <= 620` and every new file at or under its 9.1 bound, on
    BOTH counters.
11. `useIncrementalGradingRun.ts`'s `from "react"` import names exactly `useRef`
    and `useState` (W4-9c).
12. W4-6a returns exactly one line and W4-6b exactly five, unchanged, with both
    canaries behaving.

**GROUP B - not checkable here, and the flag does not flip without it:**

13. Owner-walk items 1, 2, 3, 4 and 6 of section 12, performed, with item 2's
    result stated in words. **Items 1, 2 and 4 have no in-repo instrument of
    any kind. A green Group A says nothing about them, and this document
    forbids reading it as though it did.**

**GROUP C - the transcription:**

14. RES-FILL-1 through RES-FILL-6 present as rows in `docs/BACKLOG.md`. A
    residual that is not there does not exist, and the flag flipping on a
    design with six untracked residuals is how the next round inherits a
    silence.

**How the flag flips, mechanically.** `INCREMENTAL_ROUTE_ENABLED` stays a
module-private constant, not an environment variable, for the reason
`docs/ruling-116.md:55-58` already gives: an env read lets the default vary by
deployment while a shape question is open. The flip is a one-line source change
in the commit that satisfies Group A, gated on Group B being done first. And
`incrementalRunPlan.test.ts` today contains assertions that the flag is off and
that every request routes `"whole-run"` (per `docs/ruling-116.md:71-74`: three
tests go red when it is flipped) - **those three assertions are part of the
flip commit's write set, not collateral damage to be discovered at the gate.**

---

## 16. Consequences of the fill the owner may not expect

The decision is settled. These are its costs, stated because a consequence
nobody named is a consequence nobody priced.

1. **Two owned assertions change, and one of them is a ruling's own pin.** A5
   goes from two `formAction(` occurrences to one, and A2 stops mentioning
   `formAction` at all (5.4). RULING 40's pin was chosen to make the double
   spend visible; the fill makes it stricter, but a reader who remembers
   "exactly two" will see the change and must be told it is intentional.

2. **The fill touches `src/app/actions/grading.ts`, the whole-run path.** That
   was not obviously part of "fix the incremental route". It is unavoidable:
   leaving `gradeAction`'s inline rubric-generation and blank-instructions
   logic in place while `prepareGradingRunAction` grows its own copy creates
   two owners for one decision, which is the same class of defect as the two
   surfaces the fill exists to merge. The file is at **941** of 1000 and the
   change SHRINKS it, but the blast radius is seven owned test files (9.3) and
   there is **no end-to-end oracle over `gradeAction`** for the extraction -
   only the four-case unit test on the extracted function plus a line-by-line
   diff argument (section 11's second refused instrument). **That is the
   weakest link in this design.**

3. **Student names change on the incremental route, and that is the FIX, not a
   side effect.** Item #9: the incremental route currently derives student names
   without the LLM filename-convention inference that the whole-run Gemini zip
   path uses (`extraction.ts:149` passes `undefined` where `engine.ts:390-396`
   passes a real lookup). Closing it means the incremental route's student
   strings will differ from what it produces TODAY - which matters because
   `result.student` is the persisted-edits key
   (`loadGradingResultsEdits`, `GradingResults.tsx:202`, `:222`). Any edits
   saved against an incremental run made with the flag flipped on locally
   would not be found again after this change. The flag is off in every
   environment, so no shipped run is affected; but anyone who flipped it by
   hand has orphaned edits. **The alternative - leaving #9 open - is a route
   that grades the same submission under a different student name than the
   route beside it, which is the one failure mode in this document that puts a
   wrong name on a real grade.**

4. **The full-credit checklist and the sample answer arrive LATE on the
   incremental route** (4.3, tier 2), after rows are already on screen, where
   today they arrive with the whole table at once. That is a visible change to
   how the page settles and it is owner-walk item 5. It is the price of not
   putting two model calls on the critical path, and tier 2 is the named cut if
   the owner would rather not have it.

5. **Stop still cannot be instant.** The button and the sentence change on the
   press, but the terminal count cannot be final until in-flight items settle,
   bounded by `TOTAL_BUDGET_MS = 50_000` (`route.ts:38`) for at most two
   parallel items. The fill refuses to shorten that by aborting, because
   aborting throws away a grade that has already been paid for (7.3).

6. **A partial run's class-trends behaviour differs from a deadline-stopped
   whole run's**, in a direction I did not measure (RES-FILL-4).

**Nothing in the design work suggested the fill is the wrong call.** Two things
tested it and both came out in its favour: making `prepareGradingRunAction`
resolve the run header is what turns the build check's B4 from an unfalsifiable
assertion into a real one (14.1), and collapsing to one mount is what turns the
existing `rubricProvenanceLeaf.test.ts:93-101` from an accidental pass into a
real claim (9.4). A second surface would have preserved both weaknesses
permanently, exactly as the decision's own reasoning predicted.

---

## 17. What I could not determine

Stated rather than filled in.

- **Every millisecond claim.** No API key, no network
  (`vitest.setup.ts` throws on any real `fetch`). Section 4.3 counts model
  calls on the critical path because that is countable; it does not convert
  them to time. W4-7 owns the time.
- **Everything the instructor sees.** No component renders under this vitest.
  Every rendering claim in this document is a reading claim and section 12
  routes the six that matter to an owner.
- **Whether `npx tsc --noEmit` and `npm run build` pass on the design.** Not
  run - single-caller resources with a live implementer on the tree. Every
  type-level claim here is a reading claim, chiefly that
  `GradingRunHeader`/`GradingRunTier2` in `types.ts` are reachable from a
  client leaf because `types.ts:1` is a type-only import.
- **Whether `class-trends.ts` behaves better or worse over a partial run.**
  RES-FILL-4; I read `engine.ts:296-298`'s comment and did not measure the
  code it describes.
- **The exact post-change line counts.** Section 10's deltas are estimates with
  their derivation shown. The implementer measures both counters at the gate.
- **Whether `GradingResults.tsx` at 906 is safe for the NEXT change.** The fill
  adds nothing to it, so the question is deferred rather than answered. 94
  lines of headroom is not much and the next feature that needs a column will
  find that out.
