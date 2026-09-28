# A39: the INCREMENTAL GRADING FILL - architecture (round 2)

Subject: what the incremental grading route must become before
`INCREMENTAL_ROUTE_ENABLED` (`src/app/components/grading/incrementalRunPlan.ts:99`)
can be flipped on.

Round 2 of two. Round 1 was committed at `3762538`; its check is
`docs/a39-incremental-fill-architecture-check.md`, committed at `9209616`.
**After this revision the design ships as it stands.** Anything still open is a
residual in section 13 with an owner, an instrument and a step.

## 0. Authority, and what is settled

**The fill is an OWNER DECISION.** The owner was asked whether the incremental
run is a SECOND SURFACE or a FILL of the existing one, and answered: the FILL
(DECISION 17). That is settled and neither round reopened it. The check attacks
none of the shape - "One header, one machine, one mount, `reconcileRun` reused
rather than re-implemented, tier 1 / tier 2 split, and the refusal of both an
`AbortController` and a third `stoppedBy` member are all sound and I attack none
of them" (check, section 0). This revision does not re-argue any of it and does
not re-derive the twelve attacks that found nothing (check, section 5).

**Four rulings arrived with this round and are applied, not weighed:**

| Ruling | What it settles | Applied in |
|---|---|---|
| **RULING 131** | `GradingResults.tsx` IS editable. B1's fix goes there. | section 5.7 |
| **RULING 132** | B3: prefix stability wins during the run; determinism is recovered at the end. | section 6.2 |
| **RULING 133** | B8: `grading.ts` gets a NUMERIC bound derived from 946, and `gradeAction`'s consumption of the header is specified. | sections 9.1, 9.4 |
| **RULING 134** | B5: the fallback divergence is a DEFECT. One behaviour on both routes. | section 6.5 |

**Three of those rulings have a cost the owner would not expect.** They are in
section 16 as consequences, not as reasons to revisit. The largest, by a
distance, is that RULING 132 and RULING 134 TOGETHER force a behaviour change on
the WHOLE-RUN path and a re-capture of W4-1's frozen-literal oracle. That is
section 16 item 7 and it is the single most expensive line in this document.

**Nothing under `src/` or `supabase/` was written by this pass.**
`git status --short` at the start of this pass and at the end of it:

```
(clean)
```

Branch `main`, HEAD `9209616`. My write set is this one document. No `git stash`,
no `git add -A`, no `git checkout --`.

**I RAN NO TEST, NO TYPE CHECK AND NO BUILD.** Every instrument in section 11 is
named with the mutation that should turn it red; **none of those mutations was
applied and none of those instruments was executed by me.** Where I claim a test
would go red, that is a READING claim from the test's own source, cited by line.
I say this again because the check said it too and because two agents today
declined to recommend an instrument they could not run - that restraint was
right, and it is not the same thing as declining to name one.

**No component renders under this repo's vitest** (node env, collects only
`src/**/*.test.ts`). Every claim about what the instructor SEES is a reading
claim. Section 12 lists what therefore needs an owner walk, with an owner, an
instrument and a step.

**One correction to the brief that sent me here.** The brief and the check both
state the check document is 906 lines. Measured:
`wc -l docs/a39-incremental-fill-architecture-check.md` -> **920**;
`@(Get-Content docs/a39-incremental-fill-architecture-check.md).Count` -> **920**.
Both counters agree on 920. The check's own self-measurement at its `:47-48` is
stale by 14 - it was almost certainly taken before its last two sections were
written. Nothing in either document depends on the figure; it is recorded because
a size nobody re-measured is how three of round 1's sizes went stale.

---

## 1. Measurement preamble

Every quantity below names the command that produced it. Sizes are taken from
BOTH counters, because this repo has a recorded 42-line disagreement between
them on one file.

`wc -l <path>` (Bash) and `@(Get-Content <path>).Count` (PowerShell), run
separately, at the head of THIS pass:

| Path | `wc -l` | `@(Get-Content).Count` | Round 1 said |
|---|---|---|---|
| `src/app/actions/grading.ts` | **946** | **946** | 941 - was STALE |
| `src/lib/grade/engine.ts` | **487** | **487** | 476 - was STALE |
| `src/lib/grade/extraction.ts` | **353** | **353** | 311 - was STALE |
| `src/app/components/GradingTab.tsx` | 620 | 620 | 620 |
| `src/app/components/GradingResults.tsx` | 906 | 906 | 906 |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | 728 | 728 | not measured |
| `src/app/components/grading/incrementalRunPlan.ts` | 199 | 199 | 199 |
| `src/app/components/grading/useIncrementalGradingRun.ts` | 192 | 192 | 192 |
| `src/app/actions/grading-incremental.ts` | 141 | 141 | 141 |
| `src/app/api/grade-run-item/route.ts` | 192 | 192 | 192 |
| `src/lib/grade/reconcile.ts` | 106 | 106 | 106 |
| `src/lib/grade/types.ts` | 432 | 432 | 432 |
| `src/lib/grade/prompts.ts` | 386 | 386 | not measured |
| `src/app/page.tsx` | 703 | 703 | 703 |
| `src/app/components/LiveFeedPanel.tsx` | 731 | 731 | not measured |
| `src/app/components/GithubGradingPanel.tsx` | 901 | 901 | not measured |

Test files in or adjacent to the write set, same two commands:

| Path | `wc -l` | `@(Get-Content).Count` |
|---|---|---|
| `src/app/components/grading/incrementalRunPlan.test.ts` | 193 | 193 |
| `src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts` | 393 | 393 |
| `src/app/actions/grading-incremental.test.ts` | 189 | 189 |
| `src/lib/grade/extraction.test.ts` | 330 | 330 |
| `src/lib/grade/reconcile.test.ts` | 217 | 217 |
| `src/app/components/grading-results/gradingResultsHelpers.test.ts` | 561 | 561 |
| `src/app/components/grading-results/gradingResultsHelpersEditState.test.ts` | 520 | 520 |
| `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` | 338 | 338 |

The two counters AGREE on all twenty-four. **The three stale rows are fixed and
the whole of section 9's bound table is re-derived from the new numbers.**

`GradingResults.tsx` is at **906** against the repo's hard ceiling of 1000:
`src/file-size-ceiling.structure.test.ts:41` is `const LIMIT = 1000;`, and
`:114-119` shows the walk is rooted at `path.resolve(repoRoot, "src")` over
`.ts`/`.tsx` only - so this document's own length is out of that gate's scope,
and `docs/` is not measured by it. **This design DOES edit
`GradingResults.tsx`** - RULING 131 - and section 5.7 prices the edit at about
+3 lines there, because the measurable half of the fix is relocated into
`gradingResultsHelpers.ts` (728, the pure-helper home its own header at `:1-8`
names).

This document is **2634** lines on both counters
(`wc -l docs/a39-incremental-fill-architecture.md` -> 2634;
`@(Get-Content docs/a39-incremental-fill-architecture.md).Count` -> 2634), against
round 1's 1256. It is ASCII only with no BOM: first three bytes `23 20 41`
(`head -c 3 ... | od -An -tx1`), and
`LC_ALL=C grep -n '[^ -~]' docs/a39-incremental-fill-architecture.md` REDIRECTED
to a file (never piped) exits 1 with zero lines, with `grep -c 'A'` -> 468 as the
canary proving the instrument reads the file at all. The emoji rule is owned by
`src/lib/no-emojis.test.ts` and was not hand-rolled here; that byte scan is a
BOM/mojibake check, not a substitute for it.

**The document more than doubled, and that is a cost.** The additions are twelve
new requirements, a 46-path owns list where round 1 had 33, a four-part
disposition table with a re-derived id column, a thirteen-row residual register,
an eleven-item consequences section and a thirty-row citation re-pin table. None
of it is restatement of round 1; every section the check left standing is
shortened rather than re-argued, and the twelve attacks that found nothing are
cited rather than re-derived.

**A counting rule this round enforced on itself.** A bare `grep -c` over a
symbol COUNTS PROSE. Everything below that decides something was taken twice by
independent instruments, and every canary was REDIRECTED to a file rather than
piped, because `grep ... | sort; echo $?` reads `sort`'s exit code, not grep's -
I made exactly that mistake once during this pass and caught it because the
canary reported success with zero lines.

---

## 2. The shape

Today there are two objects and two renderers:

- the whole-run object: `state.run`, a `GradingRun` produced by `gradeAction`
  (`src/app/actions/grading.ts:735` onward), rendered at
  `GradingTab.tsx:545-593` with `RubricProvenance` above it at `:547`;
- the incremental object: an inline literal built at `GradingTab.tsx:599-603`
  from `incrementalResults`, rendered at `GradingTab.tsx:597-615` (`:597` is the
  guard, `:598` the element).

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
    - speedGraderUrl (swallowed on failure)
    - entries, tickets (sourceIndex fixed)
              |                                            |
              +----------------------+---------------------+
                                     |
                       useIncrementalGradingRun (client)
                    header + arrivedRef[] + phase + runId
                                     |
                       buildIncrementalRun()   <- PURE, in the plan leaf
                                     |
                  selectDisplayRun(phase, incremental, state.run)
                  selectRunKey(phase, runId)     <- the IDENTITY
                                     |
                          ONE <GradingResults /> mount
                            run={displayRun} runKey={runKey}
```

Four properties define the fill, and each is a construction rather than a
check. The fourth is new in round 2 and is the thing round 1 got wrong.

1. **One header.** Everything that is per-RUN rather than per-ITEM is resolved
   once, server-side, before any ticket is dispatched, and travels as a
   `GradingRunHeader`. Section 4.
2. **One machine.** The hook owns a single `phase`, and the whole-run dispatch
   has exactly ONE door, which resets that phase. Section 5.
3. **One mount.** `GradingTab.tsx` contains exactly one `<GradingResults`
   element, and the GUARD that keeps it exclusive with `LiveFeedPanel.tsx`'s own
   mount over the same edits surface is pinned, not assumed. Sections 5.2, 5.6.
4. **One run IDENTITY, distinct from the run OBJECT.** A row arriving produces a
   new `GradingRun` object and the SAME identity. Section 5.7. Round 1 did not
   have this property and, without it, every arriving row wiped the instructor's
   work on the rows already on screen.

---

## 3. Vocabulary this document introduces

Named here so no brief has to guess a spelling.

| Name | Where | Kind |
|---|---|---|
| `GradingRunHeader` | `src/lib/grade/types.ts` (added) | discriminated union, PURE, client-importable |
| `resolveRunHeader` | `src/lib/grade/run-header.ts` (new) | async, SERVER-ONLY |
| `GradingRunTier2` | `src/lib/grade/types.ts` (added) | interface: `{ fullCreditChecklist: string[]; sampleAnswer: string }` |
| `completeGradingRunHeaderAction` | `src/app/actions/grading-incremental.ts` (added export) | `"use server"` action |
| `IncrementalPhase` | `incrementalRunPlan.ts` (added) | `"idle" \| "running" \| "stopping" \| "stopped" \| "complete" \| "refused"` |
| `unionAreaNames` | **`src/lib/grade/reconcile.ts` (added export)** | PURE. **Moved here in round 2** - it is now the ONE union both routes use (6.5) |
| `buildIncrementalRun` | `incrementalRunPlan.ts` (added) | PURE |
| `selectDisplayRun` | `incrementalRunPlan.ts` (added) | PURE |
| `selectRunKey` | `incrementalRunPlan.ts` (added) | PURE. **New in round 2** (5.7) |
| `describeRunProgress` | `incrementalRunPlan.ts` (added) | PURE, owns the progress and terminal copy |
| `shouldShowEmptyState` | `incrementalRunPlan.ts` (added) | PURE |
| `runResetKey` | **`grading-results/gradingResultsHelpers.ts` (added export)** | PURE. **New in round 2** (5.7) |
| `beginWholeRun` | `useIncrementalGradingRun.ts` (added return) | the ONE whole-run door |

**`unionRubricAreaNames` from round 1 is WITHDRAWN as a name.** Round 1 put the
union in `incrementalRunPlan.ts`, which under RULING 134 would make TWO
implementations of one union - the plan leaf's and `reconcileRun`'s own fallback.
`unionAreaNames` in `reconcile.ts` is the single implementation, called by both.
Section 6.5.

`GradingRunHeader` and `GradingRunTier2` live in `types.ts`, not in
`run-header.ts`, **deliberately**: `types.ts` imports exactly one thing
(`import type { CodeRunResult } from "../code-runner"`, `types.ts:1`) and is
already reached from the client, whereas `run-header.ts` must call
`generateRubric` and therefore reaches `lib/supabase` (section 6.4). Putting the
type beside the function would make every client reader of the type a type-only
import away from a client-boundary violation. Putting it in `types.ts` removes
that hazard by construction. **This remains a reading claim** - `tsc` was not
run - and the premise (`types.ts:1` is type-only) is confirmed, not the
conclusion.

`GradingRunHeader` is a DISCRIMINATED UNION, not a struct with a nullable error,
because RULING 133 requires `gradeAction`'s consumption to be specified and the
refusal branch has to be unrepresentable-if-unhandled:

```
type GradingRunHeader =
  | { readonly kind: "refused"; readonly error: string }
  | { readonly kind: "ok";
      readonly effectiveRubric: string;
      readonly generatedRubric: string | undefined;
      readonly criteriaNames: readonly string[];
      readonly rubricUsed: string;
      readonly rubricFingerprint: string };
```

`rubricUsed` and `rubricFingerprint` are spelled to match what
`stampRubricProvenance` returns (`src/lib/grade/rubric-provenance-stamp.ts:26`).
Section 9.4 states which two of the five `ok` fields `gradeAction` reads and
which three it must NOT.

---

## 4. RESOLUTION 1 - where the missing pieces come from

### 4.1 What is actually missing, re-derived from the tree

`docs/ruling-116.md:13-26` and the build check's B1 list six items. Measured
against the tree, the list is **ten**, and one of the four additions is the most
serious item in this document. **Every citation in this table was re-taken
against HEAD `9209616` by LOCATING the content, never by adding an offset to
round 1's number** - the `grading.ts` column moved by +5 and I got two other
re-pins wrong by arithmetic earlier today, so none of these is arithmetic.

| # | Piece | Whole-run site (RE-PINNED) | Status on the incremental route today |
|---|---|---|---|
| 1 | `RubricProvenance` mount | `GradingTab.tsx:547` | absent - the mount is on the other branch |
| 2 | `rubricUsed` / `rubricFingerprint` | `engine.ts:360` via `stampRubricProvenance` | produced per item, then DISCARDED at `route.ts:187-188`, which returns only `outcome.value.results[0]` |
| 3 | Rubric auto-generation | **`grading.ts:890-892`** | absent. **ZIP PATH ONLY** - see 4.2 |
| 4 | The auto-generated rubric CARD | `GradingTab.tsx:495-532`, reading `state.generatedRubric` | absent, and it is a SEPARATE render site from item 3 |
| 5 | Blank-instructions refusal | **`grading.ts:886-888` (zip), `grading.ts:814-816` (Canvas)** | absent on both |
| 6 | `fullCreditChecklist`, `sampleAnswer` | **`grading.ts:913-914` (zip), `:821-822` (Canvas)** | hardcoded `fullCreditChecklist: []` at `GradingTab.tsx:602`; no `sampleAnswer` |
| 7 | `speedGraderUrl` | **`grading.ts:748`**, `await getSpeedGraderUrl(canvasUrl).catch(() => null)` | absent, so `speedGraderHref` per-row deep links are dead on the incremental Canvas route. **The `.catch` is load-bearing and round 1 dropped it - see 4.4** |
| 8 | `sectionRef` | `GradingTab.tsx:579-582` | absent - so the scroll-into-view effect at `:212-216` and `page.tsx`'s `FilePreviewModal` fallback (`page.tsx:113`, `:697`) both lose their node |
| 9 | **The LLM filename-convention inference, which decides STUDENT NAMES.** | `gradeSubmissions` calls `inferFileNameConvention(rawFileNames, provider)` (`engine.ts:390`, a model call, defined at `rubric.ts:209-212`) and passes the lookup into `groupSubmissionsByStudent` (`engine.ts:391-396`) | `extractStudentEntries` - the function `prepareGradingRunAction` uses at `grading-incremental.ts:91` - calls `groupSubmissionsByStudent(submissions, **undefined**, rawData, zipParents)` (`extraction.ts:149`). **The incremental route derives student names WITHOUT the inference.** |
| 10 | The run-level `state.warnings` region (`GradingTab.tsx:534-543`) | driven from `state` only | the incremental route produces no warnings and none are expected, so this is recorded and NOT filled. See 14.3. |

**Re-pinning method, stated so it is auditable.** Every `grading.ts` row above
came from a content grep, not an offset:
`grep -n "getSpeedGraderUrl" src/app/actions/grading.ts` -> `:9` (import),
`:627`, `:748`; `grep -n "generateRubric" src/app/actions/grading.ts` -> `:4`
(import), `:642`, `:892`;
`grep -n "Please provide assignment instructions" src/app/actions/grading.ts` ->
`:815`, `:887`; `grep -n "No rubric synthesis" src/app/actions/grading.ts` ->
`:817`; `grep -n "extractStudentEntries" src/app/actions/grading.ts` -> `:4`,
`:859`; `grep -n "effectiveRubric" src/app/actions/grading.ts` -> `:640`, `:643`,
`:890`, `:893`, `:903`, `:904`, `:905`, `:912`, `:913`, `:914`. I then opened
`grading.ts:740-929` in full and read the geography rather than trusting the
greps in isolation. **The `engine.ts` and `extraction.ts` citations were VERIFIED
rather than assumed exact** - I opened `engine.ts:280-410` and
`extraction.ts:1-30` and `:126-170`, and every one of round 1's citations into
those two files resolves to what it claims. Section 17 lists the full re-pin
table.

**Why #9 matters more than the other nine.** `result.student` is the React key
and the persisted-edits key: `gradingResultsEditsKey` in
`gradingResultsHelpers.ts` is keyed on it, and `GradingResults.tsx:202` and
`:222` both seed `edits` through `loadGradingResultsEdits(canvasUrl, run,
editsSurface)`. Two routes that derive different student strings from the same
zip therefore produce (a) per-row edits that do not carry between routes, and
(b) a CSV and a Canvas post naming a different student. **The fill must close
#9, and closing it is not optional decoration: it is the only one of the ten
whose failure mode is a wrong grade on a named student.** The check's strongest
attack on this finding - that the incremental route might serve the `embedded`
provider, whose `grading.ts:859` branch deliberately wants NO inference - failed:
`routeGradingRun` (`incrementalRunPlan.ts:123`) returns `"whole-run"` for every
non-gemini provider. Not re-derived here.

### 4.2 The one asymmetry to PRESERVE, not to fix

Rubric auto-generation is **not** dropped relative to the whole-run path in
general. Measured:

```
grep -n "generateRubric" src/app/actions/grading.ts
  -> 4:   (the import)
     642: (a different caller - gradeOneSubmissionAction's own effectiveRubric)
     892: : await generateRubric(assignmentInstructions, provider);
```

`:892` is inside the ZIP Gemini branch (`:885` is the comment `// Gemini path.`).
The Canvas branch at `:817-818` carries its own comment, verbatim: "No rubric
synthesis on the Canvas path: grade with whatever rubric was retrieved from
Canvas (may be empty), using the instructions otherwise." So the whole-run path
itself generates a rubric for a blank-rubric ZIP and does NOT for a
blank-rubric CANVAS run.

**`docs/ruling-116.md:17-20` and the build check's B1 item 2 both state the gap
without that qualification.** The fill must reproduce the asymmetry, not flatten
it: `resolveRunHeader` takes an explicit `synthesizeRubricWhenBlank: boolean`,
`true` from the zip path and `false` from the Canvas path. Flattening it would
make the incremental Canvas route generate a rubric the whole-run Canvas route
does not, which is a NEW divergence introduced while closing an old one.

The check confirmed this correction is genuine (its attack 10). Not re-derived.

### 4.3 Two tiers, and the reason the split exists

The whole point of this feature is that something appears early. So the question
for every run-level piece is not "where does it live" but **"is it on the
critical path to the first row".**

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
| 3. `inferFileNameConvention` + `groupSubmissionsByStudent` | **ONE model call** | item #9. Already on the whole-run critical path at `engine.ts:390`, so this is parity, not a new cost. **ZIP PATH ONLY** - `extractCanvasEntries` does no filename grouping, so the Canvas route pays nothing here |
| 4. Zero-entries check, per-entry wire-budget check | zero | `grading-incremental.ts:95-110`, unchanged |
| 5. `resolveRunHeader` -> `effectiveRubric`, `generatedRubric`, `criteriaNames`, `rubricUsed`, `rubricFingerprint` | **ONE model call, only when the rubric is blank AND the source is a zip** | already on the whole-run critical path at `grading.ts:890-892` |
| 6. `getSpeedGraderUrl(canvasUrl).catch(() => null)` (Canvas only) | zero model calls; ONE Canvas API call | `Promise.all`-ed with `extractCanvasEntries`, replacing `grading-incremental.ts:71`'s bare await, so it adds no serial latency. **The `.catch` is mandatory - 4.4** |
| 7. Build tickets, return | zero | `grading-incremental.ts:112` |

**Critical-path model calls before the first row: at most two** (the filename
inference, and rubric generation on a blank-rubric zip). Both are already paid
by the whole-run path before it grades anybody. The check verified this count
from the code and it holds: `inferFileNameConvention` (`rubric.ts:209-212`) is
one `callLlm`, `generateRubric` one `callLlm` with `maxOutputTokens: 1500`,
`extractRubricCriteria` (`rubric.ts:27`) is pure, `stampRubricProvenance` is
crypto, and `getSpeedGraderUrl` is a Canvas call rather than a model call. Not
re-derived.

So the incremental route's time-to-first-row is `tier 1 + one item`, against the
whole-run path's `tier 1 + N items with an inter-request spacer between each`.
**The spacer's value is a DEFAULT, not a constant**, and round 1 cited it as
though the line held the number: `engine.ts:288-290` reads
`interRequestDelayMs`, set at `engine.ts:202` from `getGeminiInterRequestDelayMs()`,
which is `src/lib/gemini.ts:143` reading
`parsePositiveInt(process.env.GRADE_INTER_REQUEST_DELAY_MS, DEFAULT_INTER_REQUEST_DELAY_MS, 0)`
against `DEFAULT_INTER_REQUEST_DELAY_MS = 1200` at `gemini.ts:67`. **So the
whole-run cost is `tier 1 + N items with a spacer of `GRADE_INTER_REQUEST_DELAY_MS`
between each, defaulting to 1200ms`, and this checkout has no `.env` so the
deployed value is unknown to me.** The leverage argument does not depend on the
number: at a spacer of zero the whole-run path still serialises N model calls
before it renders anything, and the incremental route renders after one.

**Step 5's position relative to step 2 is load-bearing and is a strict
improvement on the whole-run path.** `gradeAction` generates the rubric at
`:890-892` and only then extracts, inside `gradeSubmissions` at `:912` - so a
whole-run blank-rubric zip that is going to be COLLISION-REFUSED pays for
`generateRubric` first. The incremental prep extracts first, so a refused run
pays nothing. That is not a redesign of `gradeAction`; it is recorded as
**RES-FILL-5** in section 13.

**TIER 2 - NON-BLOCKING. Never on the critical path.** `fullCreditChecklist`
and `sampleAnswer` are two model calls that the whole-run path already runs
CONCURRENTLY with grading, inside the same `Promise.all` (`grading.ts:911-915`
for the zip branch, `:819-823` for Canvas). Awaiting them in tier 1 would add
their full latency to time-to-first-row - it would spend the feature's entire
purpose on two panels nobody is waiting for.

So: a second `"use server"` export,
`completeGradingRunHeaderAction(assignmentInstructions, effectiveRubric,
provider)`, returning `GradingRunTier2`. `startReview` fires it WITHOUT awaiting,
immediately after `mode: "incremental"` comes back and immediately before
`runPool`, and merges the result into the displayed run when it lands. **Round 1
left this fire-and-forget with no failure path and no specified storage; section
4.5 fixes both.**

Three consequences of the tier split, all stated rather than discovered later:

- **It takes `effectiveRubric`, not the FormData.** Re-deriving the header
  server-side would call `generateRubric` a second time on the blank-rubric
  path - a double spend. The value round-trips through the client because the
  client is the only thing holding both halves. It is owner-only
  (`requireAppOwner`, matching `grading-incremental.ts:59`) and length-bounded
  the way `route.ts:41`'s `MAX_RUBRIC_CHARS = 20_000` bounds the per-item body.
  The check attacked the wire budget here and found nothing: `generateRubric`'s
  `maxOutputTokens: 1500` puts a generated rubric an order of magnitude under
  20_000 chars. Not re-derived.
- **It is dispatched only after `mode: "incremental"`.** A refused run
  (`mode: "refused"`) must never reach it - RULING 118's rule applies to this
  new spender exactly as it applies to `submitWholeRun`.
- **The two panels appear LATE**, after rows are already on screen
  (`GradingResults.tsx:567` and `:578` are their render gates - verified: `:567`
  is `{run.fullCreditChecklist && run.fullCreditChecklist.length > 0 && (` and
  `:578` is `{run.sampleAnswer && run.sampleAnswer.trim() && (`). That is a
  visible behaviour change and it is owner-walk item 5 in section 12.

**If the owner wants the fill's scope cut, TIER 2 IS THE CUT.** It costs exactly
the full-credit checklist panel (`GradingResults.tsx:567-576`) and the
sample-answer panel (`:578-592`) on incremental runs, and nothing else. Tier 1
is not cuttable: items 1, 3, 5 and 9 are the ones whose absence silently changes
a grade.

### 4.4 Tier 1 step 6 must SWALLOW, and what happens if it does not

`grading.ts:748` is, verbatim:

```
748:      const speedGraderUrl = await getSpeedGraderUrl(canvasUrl).catch(() => null);
```

with the comment above it at `:746-747`: "SpeedGrader base URL for per-student
deep links in the results table. Best-effort: a failure here must not block
grading."

Round 1's tier-1 table said step 6 is `Promise.all`-ed with
`extractCanvasEntries` and said nothing about the `.catch`. **Without it, the
whole route silently demotes.** Traced: a rejection inside the `Promise.all`
rejects `prepareGradingRunAction`'s try block, lands in the catch at
`grading-incremental.ts:117`, fails the `message.startsWith(REFUSAL_MESSAGE_PREFIX)`
test at `:136` (the prefix is `"Refused: "`, `:42`), and returns
`{ mode: "whole-run", reason: message }` at `:139`. `startReview` answers
`mode: "whole-run"` at `useIncrementalGradingRun.ts:148-151` by calling
`submitWholeRun(fd)` and **DISCARDING `prepared.reason`** - it is never read.
So a best-effort deep link failing turns every incremental Canvas run into a
whole-run run, with no message, no log and no instrument.

**Requirement: step 6 is spelled `getSpeedGraderUrl(canvasUrl).catch(() => null)`,
byte-for-byte the same posture as `grading.ts:748`.** F24 in section 11.

### 4.5 Tier 2's failure path and its storage, both specified

Round 1 said "`startReview` fires it WITHOUT awaiting" and "the tier-2 merge is a
`.then` on a promise inside `startReview` that calls `setState`". That is
under-specified in two ways the check named, and both are fixed here.

**(a) Storage: a REF, not state, and the reason is the pool's closure.**
`buildIncrementalRun` is called in the POOL (section 10, and that placement is
well argued and is kept). If tier 2 were held in `useState`, the pool's already-
running closure would rebuild the run from whatever `tier2` value it captured -
so the two panels would **appear when tier 2 lands and disappear on the next
arrival**, repeatedly. The construction:

```
const arrivedRef  = useRef<ArrivedItemResult[]>([]);
const tier2Ref    = useRef<GradingRunTier2 | null>(null);
const tier2StateRef = useRef<"idle" | "pending" | "done" | "failed">("idle");
const runIdRef    = useRef(0);
```

Four refs. `useRef` is ALREADY imported (`useIncrementalGradingRun.ts:19` is
`import { useRef, useState } from "react";`) so the W4-9c react budget is
untouched: the budget forbids a THIRD HOOK KIND, not more calls of the two that
exist. Verified against the harness rather than assumed -
`useIncrementalGradingRun.lifecycle.test.ts:15-42` implements `useState` and
`useRef` over a slot array with a per-call cursor and pins no COUNT, so extra
calls of either are fine as long as they are unconditional and in a stable
order; `vi.mock("react", ...)` at `:44-47` supplies exactly those two, so a
`useEffect`/`useMemo`/`useCallback` would be `undefined` and THROW rather than
fail red.

`arrivedRef` replaces `runPool`'s local `const arrived` at
`useIncrementalGradingRun.ts:93`, because the tier-2 continuation lives in
`startReview`'s scope and cannot see a variable local to `runPool`. It is reset
to `[]` at the top of each run, in the same statement that increments
`runIdRef`.

**(b) Failure path: tier 2 has an observable terminal state, and a rejection
cannot escape.** The dispatch is:

```
tier2StateRef.current = "pending";
void completeGradingRunHeaderAction(assignmentInstructions, header.effectiveRubric, provider)
  .then((t2) => { if (runIdRef.current !== myRunId) return;
                  tier2Ref.current = t2; tier2StateRef.current = "done"; rebuild(); })
  .catch(()  => { if (runIdRef.current !== myRunId) return;
                  tier2StateRef.current = "failed"; rebuild(); });
```

- **The `.catch` is mandatory.** Without it a rejection - `requireAppOwner()` on
  an expired session, a provider 5xx, a transport failure - is an unhandled
  promise rejection that `startReview`'s own `try/catch` at `:171-172` cannot
  see, because it is not awaited, and whose `finally` at `:173-180` has already
  released the lock.
- **`myRunId` guards a late landing.** A tier-2 promise from run N must not
  write into run N+1. This is the same token B1's identity uses (5.7), so the
  two fixes share one construction rather than inventing two.
- **`"failed"` is OBSERVABLE, and that is what makes the failure path testable
  at all.** The two panels simply never arriving is indistinguishable from them
  not having arrived YET. `describeRunProgress` does NOT own this sentence
  (it is per-run-completion copy, not progress), so the surface is one added
  line in the existing error region at `GradingTab.tsx:282-286`, which already
  renders `{state.error || incrementalError}`: on `"failed"` the hook sets
  `incrementalError` to `"The full-credit checklist and sample answer could not
  be generated for this run. The grades are unaffected."` **Grades are
  unaffected and the copy says so**, because tier 2 feeds two panels and nothing
  else.
- `rebuild()` is `setIncrementalRun(buildIncrementalRun({ ... tier2: tier2Ref.current ... }))`
  over `arrivedRef.current` - the same call the pool makes, from the same inputs.

F17 and F18 in section 11. Both failures are render-only; Group A goes green
without them, which is exactly why they are requirements rather than notes.

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

### 5.2 Why the exclusivity requirement cannot be a `formAction(` count - and why a mount count in ONE FILE is not enough either

`docs/a39-wave4-build-check.md` section 6 is right and this design takes it as
binding: RULING 40's requirement was a COUNT of source-text occurrences of
`formAction(`, and satisfying it perfectly is what produced the double table. A
count of dispatch sites is a correlate of exclusivity, not exclusivity.

**Round 1's answer was to make the count's OBJECT be the defect itself - the
number of `<GradingResults` elements in `GradingTab.tsx` - and claimed "that is
not a proxy for exclusivity; it is exclusivity, restated." The check proved that
claim FALSE AT REPO SCOPE, and it is withdrawn.** The claim is true within one
`GradingTab` instance and false for the repo. Measured, with the set taken twice
by independent instruments:

```
grep -rn "<GradingResults" src --include=*.tsx | grep -v "\.test\."
  -> src/app/components/GithubGradingPanel.tsx:852
     src/app/components/grading-results/RubricProvenance.tsx:5   (a COMMENT, not a mount)
     src/app/components/GradingResults.tsx:181                   (the definition)
     src/app/components/GradingTab.tsx:548
     src/app/components/GradingTab.tsx:598
     src/app/components/LiveFeedPanel.tsx:433

grep -rn "import GradingResults" src --include=*.tsx | grep -v "\.test\."
  -> src/app/components/GithubGradingPanel.tsx:18
     src/app/components/GradingTab.tsx:18
     src/app/components/LiveFeedPanel.tsx:22
```

Three importers, four render sites. **The instrument that decides exclusivity is
the EDITS SURFACE, not the element count**, so the set that matters is:

```
grep -rn "editsSurface" src --include=*.tsx | grep -v "\.test\."
  -> src/app/components/GithubGradingPanel.tsx:859   editsSurface="github"
     src/app/components/GradingResults.tsx:124       (the prop declaration)
     src/app/components/GradingResults.tsx:184       (the destructure)
     src/app/components/GradingResults.tsx:202       (a read)
     src/app/components/GradingResults.tsx:222       (a read)
     src/app/components/GradingResults.tsx:236       (a read)
     src/app/components/GradingResults.tsx:237       (a dep array)
     src/app/components/GradingTab.tsx:558           editsSurface="canvas"
     src/app/components/GradingTab.tsx:605           editsSurface="canvas"
     src/app/components/LiveFeedPanel.tsx:442        editsSurface="canvas"
```

**After the fill, exactly TWO render sites in the repo pass
`editsSurface="canvas"`: `GradingTab.tsx`'s one surviving mount and
`LiveFeedPanel.tsx:433/442`.** They are kept apart by ONE discriminant, and
both halves of it live in `GradingTab.tsx`, because `GradingTab` is what mounts
`LiveFeedPanel`:

- the results mount is gated `source !== "livefeed" && ...` (`:545`);
- `LiveFeedPanel` is the middle arm of the ternary at `:296-299`:
  `{source === "github" ? (<GithubGradingPanel />) : source === "livefeed" ? (<LiveFeedPanel ... />) : (<form ...>`.

**Drop the `source !== "livefeed" &&` conjunct while merging the mounts and B2
returns in its original form, with round 1's F5 reporting exactly 1 and green.**
Auto Grade populates `state.run` while `source === "livefeed"` (`:298`, `:309`),
`source` persists to `localStorage` under `ta-grading-source` (`:103-107`,
`:125-128`), so "Auto Grade, then switch source" is reachable - and both tables
would then render over one edits surface, both claiming to be the editable one.
A6 does not help: `autoGradeTransition.wiring.test.ts:183-197`'s span clause is
an EXISTENTIAL over the spans containing `styles.loadingState` and `pending`
(`.some(...)` at `:183`, verified), not a claim about the results mount.

**So the requirement is re-scoped from one file's element count to the REPO's
canvas-surface set, and it has three clauses with three different objects.**
Round 1 shipped a count that sits green at exactly 1 while the defect returns -
the proxy shape this document itself diagnoses in RULING 40. It is not shipped
twice.

- **F5 - the mount count.** Exactly one `<GradingResults` element in
  `GradingTab.tsx`, and it is not inside a `.map(`. Object: the element count in
  one file. This makes the double-table-in-one-component class unrepresentable.
  It says nothing about WHICH run shows and nothing about LiveFeedPanel.
- **F6 - the exclusivity GUARD, at repo scope.** Three sub-clauses, section 5.6.
  Object: the set of `editsSurface="canvas"` render sites in `src/app/**/*.tsx`,
  and the guard text enclosing each. This is what actually enforces exclusivity.
- **F7 - precedence.** `selectDisplayRun` is a total function with a pinned
  truth table. Object: a pure function's input/output map. This decides which
  run shows and says nothing about how many mounts exist.

Neither claim borrows the other's evidence, and the document does not let any
one green be read as covering another.

### 5.3 The single machine

```
IncrementalPhase = "idle" | "running" | "stopping" | "stopped" | "complete" | "refused"

selectDisplayRun(phase, incrementalRun, wholeRun) =
  phase === "idle" ? wholeRun : incrementalRun

selectRunKey(phase, runId) =
  phase === "idle" ? undefined : `incremental-${runId}`
```

Both total over all six phases, with no default branch and no `??` chain. Every
transition is owned by the hook:

| From | Event | To | Also |
|---|---|---|---|
| any | `beginWholeRun(fd)` | `idle` | `incrementalRun = null`, `tier2Ref.current = null`, then `submitWholeRun(fd)` |
| `idle` | `startReview` routes `"incremental"` | `running` | `runIdRef.current += 1`; `arrivedRef.current = []`; `tier2Ref.current = null`; `tier2StateRef.current = "idle"` |
| `running` | `prepared.mode === "refused"` | `refused` | `incrementalError = reason`; nothing else starts |
| `running` | `cancel()` | `stopping` | `cancelledRef.current = true` |
| `running` / `stopping` | pool ends, all tickets arrived | `complete` | **terminal normalisation runs here (6.2)** |
| `stopping` | pool ends, tickets outstanding | `stopped` | **terminal normalisation runs here too** |
| `running` | pool ends, tickets outstanding | `stopped` | reachable only if a worker throws outside its own try |

`incrementalRunning` is KEPT as a derived boolean,
`phase === "running" || phase === "stopping"`. That is not cosmetic: it is what
keeps two existing instruments green without editing them.
`autoGradeTransition.wiring.test.ts:336` anchors the progress region with
`gtSource.indexOf("incrementalRunning &&")` (verified), and
`GradingTab.tsx:456`'s `disabled={pending || incrementalRunning || (source ===
"canvas" && !canvasRetrieved)}` is the Start Review guard. A phase-literal guard
would turn W4-8 red for no gain. The check confirmed this (its attack 7); not
re-derived.

### 5.4 ONE DOOR for the whole-run dispatch, and the cost of it

`selectDisplayRun`'s and `selectRunKey`'s precedence is only sound if every
whole-run dispatch resets the phase. Today there are TWO whole-run dispatch
sites, and only one of them goes through the hook:

- `GradingTab.tsx:178-182` `submitWholeRun`, called by the hook;
- **`GradingTab.tsx:196-208` `handleAutoGrade`, which calls `formAction(fd)`
  directly at `:206`** and never touches the hook.

So Live Feed's Auto Grade is a whole-run dispatch the hook cannot see. **It is
reachable to a stale table**: Auto Grade a row (populating `state.run`), then
change the source selector away from `livefeed`. The results mounts are gated
`source !== "livefeed"`, so the tables only become visible after that switch -
which is exactly the sequence a stale-phase precedence would get wrong. The
check verified the whole reachability chain and accepted it; not re-derived.

**The construction: `beginWholeRun` is the only door.** The hook exposes it; it
resets the phase to `idle`, clears `incrementalRun` and `tier2Ref`, then calls
the injected `submitWholeRun`. `startReview`'s two whole-run branches call it,
and `handleAutoGrade` calls it in place of `formAction(fd)` at `:206`, inside its
existing `startTransition` so `setGradingTarget` stays where A3 requires it.

**The cost, stated plainly: two owned assertions change, and one of them is
RULING 40's own pin.**

- `autoGradeTransition.wiring.test.ts:159-172` (A5) asserts exactly TWO
  `formAction(` occurrences (`:161` is `expect(wholeFileMatches.length).toBe(2)`,
  verified) and, universally, that every one lies strictly inside a
  `startTransition(` paren span. After the fill there is ONE, inside
  `submitWholeRun`. A5 becomes: **exactly one `formAction(` occurrence, and it
  lies strictly inside a `startTransition(` paren span.** Strictly stronger -
  fewer doors, same locality clause - and the direction RULING 40 was already
  travelling.
- `autoGradeTransition.wiring.test.ts:126-136` (A2) asserts `startTransition(`
  appears exactly once in `handleAutoGrade` and `formAction(` exactly once
  strictly inside it. After the fill `handleAutoGrade` contains no `formAction(`
  at all. A2's second clause becomes: **`beginWholeRun(` is called exactly once,
  strictly inside the handler's `startTransition(` span.**

Both changes land in the SAME commit as the code, each with the watched failure
in section 11 (F10, F11). **A brief that keeps A5 at two has not built the
fill** - it has left the second door open. And **the same commit must add F6's
guard pin**, because F10 tightens a count on the very file where B2 showed the
count's object was too narrow.

The rejected alternative, named so a later pass does not "simplify" back to it:
expose `resetIncremental()` and call it from `handleAutoGrade` before its own
`formAction(`. That keeps A5 at two and costs one line, but it is a standing
"remember to call this" obligation at every future dispatch site - precisely the
shape that produced B2. The instrument for it would be a brace-span assertion
that a `resetIncremental(` precedes each `formAction(` in its enclosing function:
weaker, and it does not fire when someone adds a THIRD dispatch site in a new
function.

### 5.5 Three defences, and which is which

- **Construction:** one mount. Two tables inside one `GradingTab` are
  unrepresentable.
- **Guard:** the `source` discriminant, pinned by F6 at repo scope. This is the
  one round 1 left unpinned.
- **Belt:** `beginWholeRun` clears `incrementalRun` BEFORE calling
  `submitWholeRun` - the ordering inverse of today's
  `useIncrementalGradingRun.ts:133-142`. If it were forgotten, the failure would
  be "the older run shows", a single-table defect, not "two tables both claim to
  be the editable one".

The fill eliminates the double-table class. It REDUCES staleness to a precedence
question and answers that question with F7's truth table. It does not claim to
eliminate staleness.

### 5.6 F6 spelled out, because a guard pin is easy to write badly

Three sub-clauses, all source-text over files the wave already owns. The
instrument lives in `autoGradeTransition.wiring.test.ts`, which already reads
`GradingTab.tsx` and `LiveFeedPanel.tsx` (`gtSource`, `lfSource` at `:99-100`).

**F6a - the canvas-surface SET is exactly two files.** Walk
`src/app/**/*.tsx`, excluding `*.test.ts(x)`, and collect every file whose text
contains `editsSurface="canvas"`. Assert the sorted set equals
`["src/app/components/GradingTab.tsx", "src/app/components/LiveFeedPanel.tsx"]`.
**This is the clause that covers the third mount.** A new `editsSurface="canvas"`
render site anywhere in the app turns it red, and whoever adds it then owes a
statement of how it is exclusive with these two. Mutation: add
`editsSurface="canvas"` to `GithubGradingPanel.tsx:859` in place of `"github"`
-> red. (That mutation is also the historically real one - the same comment at
`GradingTab.tsx:554-557` records that `"github"` "otherwise collided with this
one whenever canvasUrl was empty".)

**F6b - `GradingTab.tsx`'s mount is gated on the discriminant, conjunctively.**
Take the single `<GradingResults` match F5 found. Take its innermost enclosing
brace span. Take the GUARD TEXT: the span's text from its opening brace up to
the first `<` character in it. Assert the guard text satisfies A6's own
conjunctive test - `/source !== "livefeed"\s*&&/` or `/&&\s*source !== "livefeed"/`
- and contains no `||`. Borrowing A6's regex pair rather than a presence check
is deliberate: A6's own comment at `:187-189` records why presence is not
enough, since `(source !== "livefeed" || true) && pending &&` contains the
literal and gates nothing.

Using the guard text rather than the whole span is also deliberate, and it is
the round-2 correction to an over-broad version of this clause: the whole span
runs from `:545` to `:593` and includes every prop, so a future prop value
containing `||` would turn the clause red for no reason. Today's guard text is
`source !== "livefeed" && run && run.results.length > 0 && (\n        ` - it
contains no `<` and no `||`. **The constraint this imposes, stated because it is
a real constraint and not a free lunch: the mount's guard must not use a `<`
comparison operator.** It does not today, and `> 0` is the shape the fill keeps.

**F6c - `LiveFeedPanel` is reached only from the `livefeed` arm.** Assert
`GradingTab.tsx` contains exactly one `<LiveFeedPanel` match, and that the last
occurrence of `source === "livefeed"` before that match is separated from it by
text containing no `{` - i.e. the ternary test immediately governs the element.
Mutation: move `<LiveFeedPanel` out of the ternary into an unconditional sibling
-> red.

**What F6 does NOT claim.** It does not prove the two components cannot be
mounted simultaneously by React; it proves the source text still expresses one
`source`-discriminated choice between them. **No test in this repo renders
either component**, so the behavioural claim is an owner-walk claim and lives in
section 12. F6 is the strongest instrument the environment admits, and calling
it exclusivity "restated" - round 1's error - is exactly what this section
refuses to do twice.

### 5.7 RESOLUTION 2b - the run IDENTITY. RULING 131 applied

**This is the design's actual weakest link in round 1 and round 1 did not
mention it.** Round 1's section 8 item 9 said `GradingResults.tsx` is "not
edited" and "the fill needs nothing from it: `banner` and `run` already carry
everything." That is the load-bearing false statement. Opened and confirmed at
`GradingResults.tsx:216-230`:

```
216:  // Re-load editable rows when a new run arrives (adjust-state-on-prop-change).
...
220:  if (run !== prevRun) {
221:    setPrevRun(run);
222:    setEdits(correctUngradedSeeds(run, loadGradingResultsEdits(canvasUrl, run, editsSurface)));
223:    setPostStatus({});
224:    setPostSummary("");
225:    setExpandedBox(null);
226:    setCodeRuns({});
227:    setCodeRunning({});
228:    setCodeOutputStudent(null);
229:    setBrowseFilesFor(null);
230:  }
```

A REFERENCE comparison against `prevRun` (`useState(run)` at `:204`). The fill
makes `run` a new object on every arrival, so on every row that lands this fires
and resets seven pieces of local state: the expanded feedback box the instructor
is typing in (`:225`, `expandedBox` declared `:209`), an open Browse-all-files
panel (`:229`, `:214`), the "Posted to Canvas" receipt (`:223-224`, `:205-206`)
- inviting a double post - and code-run output plus in-flight spinner state
(`:226-228`, `:210-212`). On a 20-submission run that is up to 20 times, every
few seconds. The feature's entire premise is that the instructor works on early
rows while later ones land; built as round 1 specified, they cannot.

`setEdits` at `:222` is the one of the seven with a safety net: `:235-237`
persists on every `edits` change, so it is a reload rather than a loss. The
other six are losses.

**RULING 131 settles that `GradingResults.tsx` IS editable and that the fix goes
there. It asks which of two shapes: a run object STABLE across arrivals, or a
reset conditional on something other than reference inequality. The answer is
the second, and the first is not merely worse - it is unavailable.**

**Why stability is unavailable, as a disproof rather than a preference.** The
run's CONTENT changes on every arrival: a row is added, and under RULING 132 a
column can be too. React re-renders the table because the prop changed. Any
construction that keeps `run` referentially stable across arrivals - mutating one
object in place, memoising on a key that ignores arrivals - also stops the table
from updating, which is the feature. There is no version of "stable object" that
both suppresses the reset and shows the new row. So:

**THE DECISION: the reset becomes conditional on an explicit run IDENTITY. The
identity is a value the producer controls, not the object's reference.**

```
// gradingResultsHelpers.ts (added export, ~+8 lines against 728)
/** The value GradingResults compares to decide a NEW run arrived, as opposed
 *  to the same run one row longer. A caller that can extend a run in place
 *  (GradingTab's incremental fill) passes a runKey that is stable for the life
 *  of that run; a caller that produces one whole object per run passes
 *  undefined and gets today's reference comparison, byte-identical. */
export function runResetKey(runKey: string | undefined, run: unknown): unknown {
  return runKey ?? run;
}
```

```
// GradingResults.tsx (~+3 net)
runKey?: string;                                   // new optional prop, +1 (+~4 doc)
const identity = runResetKey(runKey, run);         // +1
const [prevIdentity, setPrevIdentity] = useState<unknown>(identity);   // replaces :204
if (identity !== prevIdentity) {                   // replaces :220
  setPrevIdentity(identity);                       // replaces :221
  ... the seven resets, UNCHANGED ...
}
```

The seven resets are not touched. Their TRIGGER is.

**What must be true for the seven resets to keep firing when they SHOULD. All
three axes measured, not assumed.**

1. **A new run.** Whole-run path: `runKey` is `undefined`, so `identity === run`,
   and `useActionState` hands `GradingTab` a fresh object per dispatch - fires,
   exactly as today. Incremental path: `runKey` is `"incremental-<runId>"` and
   `runIdRef` increments once per `startReview` that routes incremental (5.3's
   transition table) - fires on a new run, not on an arrival.
   **The obligation this creates on the hook, and it is the coupling between
   RULING 131 and section 5.4's one door:** `beginWholeRun` must set the phase to
   `idle`, because `selectRunKey("idle", n)` is `undefined` and that is what
   hands the whole-run path back its reference comparison. If a whole-run
   dispatch left a non-`idle` phase, the stale `"incremental-<runId>"` key would
   travel with the NEW whole-run object and the resets would NOT fire - a stale
   Posted-to-Canvas badge over a different run's grades. F8's truth table pins
   the `idle -> undefined` row and F11 pins that Auto Grade goes through the
   door.
2. **A new Canvas url.** Today the seven resets do NOT fire when `canvasUrl`
   changes and `run` does not: the guard at `:220` reads `run` only. The
   `:235-237` effect re-PERSISTS `edits` under the new url but the block does not
   re-seed from it. **This construction changes that in neither direction** -
   `runResetKey` ignores `canvasUrl` exactly as `run !== prevRun` did - so
   behaviour on this axis is preserved bit for bit. Whether it SHOULD fire is a
   real, pre-existing question (it means one assignment's edits can be persisted
   under another's url), it is out of this fill's scope, and it is
   **RES-FILL-11**. Naming it is not fixing it and this document does not
   pretend otherwise.
3. **A changed edits surface.** Measured: `editsSurface` is a string LITERAL at
   every render site - `GradingTab.tsx:558` `"canvas"`, `LiveFeedPanel.tsx:442`
   `"canvas"`, `GithubGradingPanel.tsx:859` `"github"` (the grep is in 5.2). It
   cannot change for a mounted instance, so there is nothing for the resets to
   do, and F6a keeps it that way by pinning the set.

**The three callers that do not opt in are unaffected by construction.**
`runKey` is optional; `LiveFeedPanel.tsx:433` and `GithubGradingPanel.tsx:852`
pass nothing, so `runResetKey(undefined, run)` returns `run` and their guard is
the reference comparison they have today. **Neither file is in the write set.**

**Why the measurable half is relocated into `gradingResultsHelpers.ts`.** Nothing
renders here, so a claim about the seven setters firing is not testable. But
"two different run objects carrying the same `runKey` are ONE identity" IS
testable, as a pure function, and that single sentence is the whole fix. The
helper file is 728 lines against 1000, its own header at `:1-8` names it as the
home for exactly this ("everything that GradingResults.tsx used but that touches
no React state, no DOM API, and no clipboard"), and it already has three test
files. F9 carries the truth table plus a one-line wiring pin; owner-walk item 7
carries the behaviour. That is the RELOCATE disposal from
`iteration-caps.md:13-16`, not a weaker check standing in for the criterion.

---

## 6. RESOLUTION 3 - the rubric column set

### 6.1 Where the merge happens: PER ARRIVAL, RECOMPUTED FROM RAW

`GradingTab.tsx:601` is
`rubricAreaNames: incrementalResults[0]?.rubricAreas.map((a) => a.area) ?? []`.
The build check's B3 is right that this is not a union: it is the areas of the
lowest-arrived `sourceIndex`, recomputed on every arrival, because
`mergeArrivedResults` returns a DENSE array (`incrementalRunPlan.ts:160-173`).
`GradingTab.tsx:595-596`'s comment claims "rubricAreaNames here is a union",
which was already false in the tree.

**Decision, unchanged from round 1: the merge happens PER ARRIVAL, recomputed
from the RAW arrived rows every time, and there is therefore no separate
end-of-run merge of already-merged output.** What round 1 got wrong was the
REASON. Section 6.3 replaces it.

```
buildIncrementalRun({ header, speedGraderUrl, totalTicketCount, arrived, phase, tier2 })
  1. rows      = mergeArrivedResults(totalTicketCount, arrived)     // dense, ascending sourceIndex
  2. canonical = canonicalColumns(header, arrived, rows, phase)     // 6.2
  3. projected = reconcileRun(rows, canonical)                      // THE SAME function the
                                                                    // whole-run path calls at
                                                                    // engine.ts:350
  4. return { results: projected.results,
              rubricAreaNames: projected.rubricAreaNames,
              fullCreditChecklist: tier2?.fullCreditChecklist ?? [],
              sampleAnswer:       tier2?.sampleAnswer,
              speedGraderUrl,
              rubricUsed:         header.rubricUsed,
              rubricFingerprint:  header.rubricFingerprint }
```

**`phase` IS read** - by `canonicalColumns`, for the terminal normalisation. That
answers the check's M7: round 1 published `phase` in its vocabulary and then
never used it, which would have left the implementer choosing between an unused
destructured parameter and a signature that contradicts section 3.

### 6.2 `canonicalColumns`: prefix stability during the run, determinism at the end. RULING 132 applied

```
canonicalColumns(header, arrived, rows, phase) =
  header.criteriaNames.length > 0
    ? header.criteriaNames                       // frozen for the whole run
    : isTerminal(phase)                          // phase === "complete" || phase === "stopped"
      ? unionAreaNames(rows)                     // DENSE order - deterministic
      : unionAreaNames(arrived.map((a) => a.result))   // ARRIVAL order - prefix-stable
```

**Branch 1 - `criteriaNames` non-empty.** Return it verbatim and frozen for the
whole run. Columns then cannot change mid-run at all, which is the strongest
available property and costs nothing, because `criteriaNames` comes from
`extractRubricCriteria(effectiveRubric)` - pure and synchronous
(`rubric.ts:27-31`), the same call `gradeStudentEntries` makes at
`engine.ts:208`. Tier 1 makes this the common case, because it fills a blank
rubric on the zip path.

**Branch 2 - `criteriaNames` empty, run in progress. ARRIVAL ORDER.** Round 1
specified "a first-seen union over arrived rows in ascending `sourceIndex` order"
and concluded "a union over a monotonically growing arrival set can only GROW,
never reorder its existing prefix, so an existing column never moves." **That
conclusion is FALSE and is withdrawn.** The arrival SET grows monotonically; the
`sourceIndex` ORDER over it does not. `useIncrementalGradingRun.ts:106` pushes in
COMPLETION order from three concurrent workers (`:119-120` with
`INCREMENTAL_CONCURRENCY = 3` at `incrementalRunPlan.ts:26`) - out-of-order
completion is the entire point of the pool. Under an ascending-`sourceIndex`
sort, row 5 landing first with `[Clarity]` and row 2 landing second with
`[Structure]` gives `[Clarity]` then `[Structure, Clarity]`: the column the
instructor has already read has MOVED. Worse, since dedup is by
`normalizeAreaName` (`prompts.ts:19`, which lowercases and strips
parenthesised point values) while the DISPLAYED name is the first-seen raw
spelling, the header can be RENAMED - `clarity` becoming `Clarity (25%)` after a
row has been read.

**RULING 132: prefix stability wins.** A first-seen union in ARRIVAL order is
prefix-stable by construction: it is an array whose existing entries are never
re-sorted, only appended to. An existing column never moves and never gets
renamed while the run is in progress.

**Branch 3 - `criteriaNames` empty, run terminal. DENSE ORDER.** At `complete`
or `stopped`, the union is recomputed over `rows` - the dense,
ascending-`sourceIndex` projection - and the run is rebuilt once with it. The
column ORDER is then independent of arrival order, which is what determinism
buys and all that it buys: **the SET is arrival-order-independent either way; a
first-seen union over the same rows has the same members whatever order they
arrive in.** Only the order differs, and the order matters for CSV column
reproducibility and for any frozen oracle over the final run.

`isTerminal` excludes `idle` and `refused`, which have no incremental run to
project.

**The instrument, and it is the strongest thing round 2 adds.** Both functions
are pure, so the two-arrival-orders test the check asked for is buildable here
today. **Round 1's claim that this half has "no in-repo instrument" is
WITHDRAWN.** F20 in section 11: feed one arrived set in two different arrival
orders and assert

- (a) the TERMINAL `rubricAreaNames` is deep-equal across the two orders, and
- (b) within each order, each intermediate `rubricAreaNames` is a PREFIX of the
  next.

One mutation per clause, in opposite directions: sort by `sourceIndex` during the
run and (b) goes red; drop the terminal normalisation and (a) goes red. That
discriminates which property was implemented rather than asserting both and
checking neither.

**The cost of RULING 132, stated because the ruling is settled and its cost is
still mine to surface.** The terminal normalisation IS a column reorder under the
reader - exactly once, at the moment the run completes, which is plausibly while
the instructor is entering scores on row 1. The ruling's own failure direction
(owner-walk item 2: "a column appearing, disappearing or reordering after a row
has been read") is therefore triggered once, deliberately, in exchange for never
being triggered during the run. The alternative inside the ruling - never
normalise on screen, and recover determinism only in the CSV export - is
**RES-FILL-7**, with the same F20 instrument and the (a) clause scoped to the
exported header instead of the displayed one. It is not chosen here because the
ruling says the run's own final state is where determinism is recovered, and a
screen that disagrees with its own export is a second divergence.

A related consequence: **a CSV exported MID-RUN carries arrival order; the same
run exported after completion carries dense order.** `buildCsvContent` reads
`run.rubricAreaNames`, so this follows directly. Section 16 item 5.

### 6.3 Why recomputing from RAW is load-bearing - the TRUE mechanism. B4

Round 1's justification was:

> "Applied forward instead, `reconcile.ts:79-84`'s stray-fold would append the
> same stray comments to `overallComment` again on every arrival - a comment
> that grows by one copy per student, on the field an instructor sends to the
> student."

**That is factually wrong and is WITHDRAWN.** Traced through `reconcile.ts:60-87`,
every line opened. After one reconcile against canonical `C1`, every result's
`rubricAreas` is exactly `C1` - `:68-78` builds `reconciled` from `canonical`
alone and `:85` replaces `rubricAreas` with it. On a second reconcile against
`C2` where `C2` is a superset of `C1`, `byNorm` (`:63-67`) is built from `C1`'s
names, every one of which matches at `:72` and is `byNorm.delete`d at `:74`, so
`strays` at `:79` is `[]` and `:81`'s branch never runs. **Nothing is
re-appended. The comment does not grow.** The claim is unreachable under the
monotone growth the design itself guarantees.

**The true mechanism is worse, and it is sharper than the check's replacement
too.** The check proposed that the stray's score is destroyed while "its comment
text stays permanently mis-filed in `overallComment`". Measured, the second half
is also unreachable for the rows this route produces:

```
src/lib/grade/parsing.ts:30-47   toRubricAreaResult(value)
  :42-46   return { area, score: normalizeText(item.score), comment: "" };
```

**`comment` is hardcoded `""` on every model-parsed area** (`parsing.ts:45`,
opened - I did not take this from `reconcile.test.ts:102-108`'s comment, which
says the same thing; the comment agreed with the code, which is not always the
case here). `reconcile.ts:79` folds only strays whose `comment.trim()` is
non-empty. So for a model-parsed row **the stray-fold branch NEVER FIRES AT
ALL**, and the failure is pure, silent loss:

1. First forward reconcile against `C1`: an area the model produced that is not
   in `C1` is dropped from `rubricAreas` entirely - **score and all** - with no
   fold, no log and no trace.
2. Second reconcile against `C2` (the grown union): `:76` pushes
   `{ area: name, score: "", comment: "" }` for that area - a BLANK cell where
   the model had given a real score.
3. Nothing ever recovers it. The loss happened at step 1 and the raw value is
   gone from the object being carried forward.

**That is a strictly stronger argument for recomputing from raw than the one
round 1 gave**, and it is why the DECISION survives its withdrawn rationale. It
also matters that the wrong reason be corrected rather than merely replaced: a
later pass proposing apply-forward would correctly refute "the comment grows",
find no growing comment, and conclude apply-forward is safe.

**The constraint the true mechanism implies, which round 1 never stated.**
`arrived` must hold RAW `GradeResult` rows for the life of the run and must never
be replaced, in whole or in part, by `reconcileRun`'s output. Concretely: the
pool pushes raw rows into `arrivedRef.current`; `buildIncrementalRun` READS it
and returns a new object; **nothing writes projected results back into it.**
Today that is true by accident - `arrived` is a local in `runPool`
(`useIncrementalGradingRun.ts:93`). Under 4.5(a) it becomes a ref with two
readers, which is exactly when an "optimisation" that caches the projection into
it becomes tempting. F21 in section 11 pins it: deep-freeze the arrived array and
its rows before calling `buildIncrementalRun` (ES modules are strict, so a write
throws), and separately assert that two successive calls with different canonical
sets produce the same output as two independent first calls.

### 6.4 The client-boundary blocker this creates, and the instrument that already catches it

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
`"lib/grade/engine.ts -> lib/grade/reconcile.ts -> lib/grade/rubric.ts -> lib/research/rubric-bank.ts -> lib/research/db.ts"`,
the tenth and last entry of `FROZEN_TRAILS` (`:657` is `const FROZEN_TRAILS = [`,
`:676` is `];`).

**The fix is one line, and it is behaviour-identical.** `normalizeAreaName` is
DEFINED at `src/lib/grade/prompts.ts:19`; `rubric.ts:442` merely re-exports it
(`export { buildSystemPrompt, normalizeAreaName, buildSampleAnswerPrompt };`).
`prompts.ts:1-2` imports only `type { ... } from "./types"` and
`{ getBaseFileName } from "./utils"`; `utils.ts:1-3` imports
`type { ... } from "./types"`, `type { CodeRunResult } from "../code-runner"`
(type-only, erased) and `{ getMimeType } from "./constants"`; and
`src/lib/grade/constants.ts` has no import statements at all (its first line is
`const MIME_TYPES: Record<string, string> = {`). So `reconcile.ts:20` becomes
`import { normalizeAreaName } from "./prompts";` and the leaf is genuinely pure.
The check re-opened all four hops and confirmed them (its attack 4); not
re-derived.

**The instrument for the dangerous direction already exists and runs today.**
`src/lib/canvas-client-boundary.runtime-graph.test.ts:16-35` roots a
`walkRuntimeGraph` at every `"use client"` ENTRY POINT in the app and fails on any
transitive value-import edge reaching a forbidden path prefix -
`src/lib/module-graph/client-boundary-policy.ts:18` is
`export const FORBIDDEN_PATH_PREFIXES = ["lib/supabase"];`.
`useIncrementalGradingRun.ts:1` is `"use client"`, so it is one of those roots.
**A brief that imports `reconcileRun` into the plan leaf without changing
`reconcile.ts:20` turns that file RED.** That is F14, and it is the one
instrument in this design I did not have to invent.

### 6.5 RULING 134 applied: ONE column behaviour on BOTH routes

**B5, and it is real.** `reconcile.ts:50-58`, opened:

```
50:  let canonical: string[] = [...criteriaNames];
51:  if (canonical.length === 0) {
52:    let richest: RubricAreaResult[] = [];
53:    for (const result of results) {
54:      const real = result.rubricAreas.filter((a) => a.area && a.area !== "Overall");
55:      if (real.length > richest.length) richest = real;
56:    }
57:    canonical = richest.map((a) => a.area);
58:  }
```

The whole-run path reaches that fallback: `engine.ts:350` is
`reconcileRun(results, criteria.map((c) => c.name))`, empty for an unparseable
rubric. Round 1's step 2 passed a non-empty UNION as `criteriaNames`, so
`canonical.length > 0` at `:61` and the fallback would never run on the
incremental route. Same zip, same rubric, two routes, two column sets:
richest-single-result against union - propagating to the CSV header and to
`recomputeTotal`'s denominator, two of the three downstream readers round 1's
6.6 claimed were "all fixed by the same change". That is the exact class section
4.2 polices, introduced while closing an old one.

**RULING 134: pick one behaviour for both routes. The choice is FORCED, not
preferred, and the forcing agent is RULING 132.**

Consider richest-on-both. On the incremental route, `canonical` would be the
richest ARRIVED row's areas. As rows arrive the richest can change, and a new
richest REPLACES the canonical set wholesale - columns can appear, disappear AND
reorder mid-run. (No data is lost, because every projection is recomputed from
raw; the damage is purely what the reader sees.) That flatly violates RULING
132's prefix stability, and the only way to make it prefix-stable is to use a
union during the run anyway. So richest-on-both is incoherent with RULING 132.

**THE DECISION: the UNION applies on both routes. `reconcileRun`'s
empty-canonical fallback changes from "the richest single result's areas" to "a
first-seen union over all results".** One implementation, one function, called by
both:

```
// reconcile.ts (added export)
/** First-seen union of real area names over `rows` IN THE ORDER GIVEN, deduped
 *  by normalizeAreaName, keeping the first-seen raw spelling, excluding the
 *  empty area and the "Overall" placeholder - the same two exclusions the
 *  richest fallback applied at :54. The CALLER owns the order: the whole-run
 *  path and the incremental route's terminal normalisation pass dense,
 *  ascending-sourceIndex rows; the incremental route passes arrival order while
 *  the run is in progress (6.2). */
export function unionAreaNames(rows: readonly GradeResult[]): string[]

// reconcile.ts:51-58 becomes
if (canonical.length === 0) canonical = unionAreaNames(results);
```

**This is the convergence that makes the two routes provably agree.** At
`complete`, `buildIncrementalRun` calls `unionAreaNames(rows)` over the dense
projection - the same function over the same ordered list the whole-run path
gives it - so for the same rows the two routes produce a byte-identical column
set AND order. There is no residual divergence to record because there is no
divergence.

**The cost, and it is the largest single cost in this document. Section 16 item 7
states it as a consequence; here is the mechanism.**

`reconcile.test.ts:110-146` is W4-1's FROZEN LITERAL, and its fixture is
precisely the unparseable-rubric two-students-disagreeing case:

```
136:    const FROZEN_AREA_NAMES = ["Clarity", "Grammar"];
```

with Bob's `"Structure"` area (score `"6/10"`) DROPPED at `:123-127` and its
absence documented in the literal's own comment. Under the union fallback,
`FROZEN_AREA_NAMES` becomes `["Clarity", "Grammar", "Structure"]`, Bob's row
gains `{ area: "Structure", score: "6/10", comment: "" }` and Alice's gains
`{ area: "Structure", score: "", comment: "" }`. **The frozen literal goes RED,
and `reconcile.ts:14-17`'s own stated invariant - "gradeStudentEntries must
return results byte-identical to what the old inline block produced" - is
DELIBERATELY BROKEN for the no-parseable-criteria case.**

Three obligations follow, and none of them is optional:

1. **The literal is RE-CAPTURED BY RUNNING THE FIXTURE, never hand-written.**
   This repo's recorded hazard is that a re-frozen oracle is a DISARMED oracle.
   The implementer runs
   `npm run test:paths -- src/lib/grade/reconcile.test.ts`, reads the actual
   received value out of the failure output, pastes it, and states the command
   in the commit message. A hand-predicted literal that happens to pass is
   indistinguishable from a literal that was fitted to the implementation.
2. **`reconcile.ts:14-17` and `reconcile.test.ts`'s own header comment are
   rewritten in the same commit** to say that the byte-identity invariant now
   holds for the parseable-criteria case and is deliberately superseded for the
   fallback case, naming this ruling. A frozen literal beside a comment claiming
   an invariant it no longer has is how a silenced guard becomes invisible.
   **RES-FILL-12** carries it.
3. **The instructor-visible effect on the whole-run path is priced**, at 16.7.
   More columns for an unparseable rubric; fewer strays; and one narrow numeric
   effect measured below.

**The numeric effect, measured and stated narrowly rather than dramatically.**
`recomputeTotal` (`gradingResultsHelpers.ts:364-400`, reached from
`GradingResults.tsx:279`) sets `everyHasDenom = false` for any blank or
percent-shaped score (`:384-386`). So a union column that is blank for a student
flips that flag. `:398` is
`const denom = parseDenominator(currentTotal) ?? (everyHasDenom ? denomSum : null);`
- **`currentTotal` takes precedence**, so for a row whose total string already
carries a parseable denominator (`"17/20"`, the normal case) nothing changes.
The effect is confined to a row whose current total has NO parseable denominator:
there, editing a criterion used to yield `earned/denomSum` and will now yield
bare `earned`. Narrow, real, and it only fires on an instructor edit. Owner-walk
item 8.

### 6.6 What the table shows while the union is incomplete

- **`criteriaNames` non-empty (the common case, and the case the fill makes more
  common because tier 1 fills a blank rubric):** the header is the final header
  from the first render. Every arrived row is reconciled against it, so a
  criterion no model mentioned renders as a present, EDITABLE, blank cell -
  `reconcile.ts:76` pushes `{ area: name, score: "", comment: "" }`, exactly as
  the whole-run path does. No column ever appears, disappears or moves.
- **`criteriaNames` empty (blank or unparseable rubric, including a GENERATED
  rubric that does not parse):** the header GROWS in arrival order as students
  arrive, and an existing column never moves or empties, because the union's
  prefix is stable and every row is re-projected from raw against the grown set
  on the same arrival. A column that appears late is immediately populated for
  every already-arrived student who had that area. At completion the order is
  normalised once (6.2), which is the one reorder the design accepts.
- **A transport failure at index 0 no longer blanks the run.**
  `classifyItemFailure` returns `rubricAreas: []` (`incrementalRunPlan.ts:192`),
  which contributes nothing to a union and cannot empty one. Today it sets
  `rubricAreaNames` to `[]` for every student, because `incrementalResults[0]`
  IS that failure row.

The three downstream readers B3 names are all fed from the same
`rubricAreaNames`, so all three are fixed by the same change rather than
separately: the per-criterion cells, `buildCsvContent`, and `recomputeTotal`.
**Under RULING 134 that sentence is now true; under round 1 it was not, because
the fix itself diverged two of the three.**

### 6.7 The frozen import trail, in BOTH directions - and the SECOND edge round 1 missed

`runtime-import-graph.test.ts:674`'s frozen trail must be DELETED when
`reconcile.ts:20` changes, and the deep-equal at **`:703`** (`expect(trails).toEqual(FROZEN_TRAILS)`
- round 1 cited `:709-712`, which is wrong) goes red until it is. So: import
changed without deleting the trail -> red; trail deleted without changing the
import -> red. F15.

**Round 1's claim "There is no way to satisfy one half alone" is WITHDRAWN.** The
check could not establish it without editing source and neither can I; it is a
claim about a test's behaviour under two mutations, neither of which I applied.
What I can state is the two mutations and the direction each should fail in, and
that is what F15 does.

**The second edge, which round 1 did not account for.** Section 9.2 adds
`inferFileNameConvention` to `extraction.ts`, which today does NOT import
`./rubric` - measured: `extraction.ts:1-14` imports `jszip`, `../office-extract`,
`../canvas`, `./types`, `./constants`, `./utils`, `./collisionRefusal`,
`../submission-repo`, `./repo-content`. `FROZEN_TRAILS` is a per-direct-edge
walk rooted at `engine.ts` (`engineViolationTrails`, `:682-698`), and
`./extraction` is one of engine.ts's direct edges (a dynamic import at
`engine.ts:372`).

**The check could not determine the consequence without editing source. I CAN,
from the walker's own code, and the answer is a design CONSTRAINT rather than a
mutation to run.** Read:

- `engineViolationTrails` gives each distinct direct edge its OWN
  `walkRuntimeGraph([resolved], walkOptions)` call (`:692`), and the comment at
  `:679-681` says so: "a fresh, unshadowed walkRuntimeGraph call per direct
  edge." So there is NO visited set shared across direct edges - the check's
  stated uncertainty rests on a mechanism that does not exist.
- Inside ONE walk, `runtime-import-graph.ts:221` declares `const visited = new Set<string>()`
  and `:229-230` returns early on a revisit, so each module's edges are scanned
  at most once per walk. `:246` iterates `scan.edges`, which `scanRuntimeEdges`
  (`:44-46`) builds by walking the TypeScript AST of the file, i.e. **in source
  order**. A forbidden target pushes a violation at `:250-251` carrying the trail
  to its IMPORTER; a non-forbidden target is recursed into at `:253`.
- Therefore the violation reported for `lib/supabase/server` inside the
  `extraction.ts` walk carries the trail of the FIRST path by which `db.ts` was
  reached, in depth-first source order.
- Today that path is `../canvas` (`extraction.ts:8`) onward, and it is already
  frozen at `runtime-import-graph.test.ts:665`:
  `"lib/grade/engine.ts -> lib/grade/extraction.ts -> lib/canvas.ts -> lib/canvas/listings.ts -> lib/canvas/auto-zero.ts -> lib/grade-zeros.ts -> lib/grade.ts -> lib/grade/rubric.ts -> lib/research/rubric-bank.ts -> lib/research/db.ts"`.
  Note that path already visits `lib/grade/rubric.ts`.

**So: a new `import { inferFileNameConvention } from "./rubric";` placed AFTER
`extraction.ts:8`'s `../canvas` import adds NO new trail** - by the time that
edge is processed, `rubric.ts` is already in `visited` and `visit` returns at
`:229`. **Placed BEFORE it, the short path wins, `:665`'s trail string changes to
`"lib/grade/engine.ts -> lib/grade/extraction.ts -> lib/grade/rubric.ts -> lib/research/rubric-bank.ts -> lib/research/db.ts"`,
and the deep-equal at `:703` goes RED.**

**Requirement: `extraction.ts`'s new `./rubric` import is placed after the
`../canvas` import at `:8`.** Its instrument is the existing deep-equal at
`:703`; its mutation is moving the import above `:8`. F15 clause 3. **This is a
reading claim about a traversal I did not run** - it turns on `scan.edges` being
in source order, which I read from `scanRuntimeEdges`'s AST walk rather than
measured - so M2's named mutation stays the wave's FIRST step (section 11's
preamble), and if the walker surprises us the answer arrives before any other
line is written rather than at the gate.

Section 13's **RES-FILL-1** carries the prose at
`runtime-import-graph.test.ts:640-656`, which the build check's M5 already found
wrong in three numbers and which this change makes wrong in a fourth place (the
comment at `:666-673` asserts reconcile.ts imports `./rubric`, and `:644-646`
counts the reconcile edge as "an eleventh direct edge").

---

## 7. RESOLUTION 4 - cancellation and partial runs

### 7.1 The invariant the build check invokes does not apply here, and something else must

B1b cites `engine.ts:293-303`'s documented invariant - "`results[i]` corresponds
to `studentSubmissions[i]` for every i, and
`results.length === studentSubmissions.length`" - achieved by appending explicit
`not-attempted` rows with a `stoppedBy` reason (`engine.ts:310-341`). Opened and
confirmed at those lines.

That invariant is a property of **what `gradeStudentEntries` RETURNS**. The
incremental display run is not that object: it is assembled client-side by
`buildIncrementalRun` from N independent single-entry runs. So the invariant is
not violated, because it does not range over this object. The check verified this
premise correction and accepted it; not re-derived.

What IS true, and is the real defect: **a stopped run and a complete run are
indistinguishable.** The table shows the arrived subset with no marker, and
`incrementalTotal` is never passed to `GradingResults` at all.

### 7.2 The answer: a run-level terminal statement in its OWN region, not the banner

`docs/a39-waves.md` 8.4.3 already ruled the copy: "the end-of-run line is
`Stopped. N of M submissions were graded; the rest were not started.`,
run-level, **not editable and not persisted**". The fill keeps that ruling and
adds the missing half - it must survive after the pool ends, which today it
cannot, because the region at `GradingTab.tsx:472-478` is gated on
`incrementalRunning` and unmounts.

`describeRunProgress(phase, done, total)` owns all of the run-level copy in one
pure function:

| phase | sentence |
|---|---|
| `running` | `N of M submissions graded.` (today's `GradingTab.tsx:475`, unchanged) |
| `stopping` | `Stopping. N of M submissions graded; finishing the ones already in progress.` |
| `stopped` | `Stopped. N of M submissions were graded; the rest were not started.` |
| `complete` | `null` - a complete run needs no line, and the table is the receipt |
| `idle`, `refused` | `null` |

**Round 1 routed the `stopped` sentence through `GradingResults`'s existing
`banner` prop. That is WITHDRAWN, because the channel is gated by the exact
condition the sentence exists to survive.** `banner` is declared at
`GradingResults.tsx:153` and rendered at `:541` (verified: `:540` is the
`<section className={styles.results} ref={sectionRef} tabIndex={-1}>` and `:541`
is `{banner}`), but the MOUNT is gated `source !== "livefeed" && run &&
run.results.length > 0` at `GradingTab.tsx:545`. **Press Stop before the first row
lands - a window section 5.6 itself calls "seconds to tens of seconds" - and
`results.length === 0`, so there is no mount, so there is no banner, so there is
no terminal sentence.** The `stopping` sentence at `:472-478` unmounts with
`incrementalRunning`. The instructor sees a form and nothing else, and owner-walk
item 4 is unreachable in exactly the case it is about.

**THE DECISION: the terminal sentence gets its OWN region in `GradingTab.tsx`, a
sibling of the progress region at `:472-478`, gated on the sentence existing
rather than on any row existing:**

```
{source !== "livefeed" && terminalLine && (
  <p className={styles.emptyState} role="status" aria-live="polite">{terminalLine}</p>
)}
```

where `terminalLine = describeRunProgress(phase, incrementalDone, incrementalTotal)`
for the two terminal phases. Consequences, all of them checked:

- **`GradingResults.tsx` is NOT edited for B7.** Its only edit in this design is
  RULING 131's three lines (5.7). That settles the three-way interaction the
  check flagged as "the first thing the revision has to price": B1 costs about +3
  there with the measurable half relocated to `gradingResultsHelpers.ts`, B7
  costs 0 there, and 906 + 3 = 909 against 1000.
- **The `banner` slot stays as it is**, carrying `GradingTab.tsx:583-590`'s
  `gradingTarget ? <div>Grading <strong>{title}</strong>...</div> : undefined`.
  Round 1 priced "the terminal sentence into the existing `banner` expression" at
  +4 with no shape given; the check's m7 is right that composing into an occupied
  conditional needs a shape. The new region needs none: it composes with nothing.
- **A6 is unaffected.** Verified from its source: `:183`'s `.some(...)` is an
  EXISTENTIAL over the spans containing `source !== "livefeed"`, requiring at
  least one that is conjunctive, `||`-free, and contains BOTH
  `styles.loadingState` and `pending` and not `const handleAutoGrade` (`:190-197`).
  The `pending` region at `:268-280` still satisfies it. The new region contains
  neither `styles.loadingState` nor `pending`, so it cannot become the span that
  satisfies or breaks the clause. (And A6 still goes red if the two regions are
  merged into `pending || incrementalRunning`, because then NO span would carry
  both literals without a `||` - which is what makes 14.2's A6 row a real
  constraint.)
- **W4-8 holds trivially.** The new region sits before the mount, so both
  `indexOf("Stop grading")` and `indexOf("incrementalRunning &&")` still precede
  the first `<GradingResults` (`autoGradeTransition.wiring.test.ts:334-343`).
- **F12's truth table is completed over all six phases.** Round 1's
  `shouldShowEmptyState` named `running`, `stopping`, a null run, and
  "`complete`/`idle` with a zero-result run", leaving **`stopped` and `refused`
  unspecified** - so the zip empty-state sentence's behaviour in precisely the
  stopped-with-zero-rows case was undecided, and that sentence
  (`GradingTab.tsx:489-491`, "No supported submission files were found in the zip
  archive.") says the opposite of the truth there. Specified now:
  `shouldShowEmptyState` is `false` for `running`, `stopping` AND `stopped`, and
  `false` for a null run; `true` only for `idle` and `complete` with a
  zero-result non-null run; `refused` has a null run and is therefore `false` by
  the null clause. So a stopped-at-zero-rows run shows the terminal sentence and
  nothing else - which is the truth.

**The rejected alternative, and why.** Adding a third member to
`NotAttemptedOutcome["stoppedBy"]` (`types.ts:142` is
`readonly stoppedBy: "submission-count-bound" | "run-deadline";`) and emitting a
real not-attempted row per undispatched ticket would make `results.length` equal
the ticket count. Rejected because it spends far more than it buys: it touches
`types.ts:142`, `UNGRADED_NOT_ATTEMPTED_MESSAGES` (`types.ts:193`), the narrowing
at `types.ts:319`, `ungradedDisclosure.ts`, `ungradedRowLabel.ts` and the
postability path - to add rows that carry no grade, cannot be posted, and enter
`buildCsvContent` and the class-trends entry. And it would put a new row-writing
site in a client leaf, next to W4-6a's pin that exactly one source line in the
repo writes `stoppedBy: "run-deadline"`. The check confirmed this refusal is
principled and keeps W4-6a at one line; not re-derived.

**One difference this creates, recorded because it is real and I did not measure
it.** A partial incremental run's `GradingRun` contains only graded rows, where a
deadline-stopped whole run contains not-attempted rows with empty `rubricAreas`.
`engine.ts:296-298`'s own comment says those empty-area rows raise `totalResults`
without raising any area's `resultsWithArea` and "silently switches every counted
class-trends clause off". So a partial incremental run's trends panel is computed
over the graded subset and a partial whole run's is not. I did not run anything
against `class-trends.ts` and I am not claiming which is better. **RES-FILL-4.**

### 7.3 Stop must be visible, and it must NOT abort

`cancel()` today sets `cancelledRef.current = true` and nothing else
(`useIncrementalGradingRun.ts:88-90`). `incrementalRunning` stays true, the button
stays enabled, and pressing Stop produces no visible change for up to
`TOTAL_BUDGET_MS = 50_000` per in-flight item (`route.ts:38`, verified).

**Fixed by the state transition, not by an `AbortController`.** `cancel()` sets
`phase = "stopping"`, which changes the sentence (7.2) and disables the button.
That is a state change in the same render pass as the click.

**And this design REFUSES to add an `AbortController`, against the direction the
build check's M2 implies.** Aborting the in-flight `fetch` cannot stop the
handler's model call - `route.ts:172-175` is already running, and
`src/lib/bounded-race.ts`'s own header says losing a race "does not cancel
`work`". So an abort would DISCARD a result that has already been paid for, which
is strictly worse for the instructor than waiting for it. In-flight items stay,
land, and merge. The check confirmed this refusal is correct on the evidence; not
re-derived.

**The residual cost, with round 1's arithmetic corrected.** The terminal
`stopped` sentence cannot appear until the last in-flight item settles, which is
bounded by `TOTAL_BUDGET_MS` (50s) **times one, not times N, because the in-flight
items settle in parallel - and there are up to `INCREMENTAL_CONCURRENCY = 3` of
them, not 2.** Round 1 wrote "at most `INCREMENTAL_CONCURRENCY - 1 = 2`"; the
`-1` was unjustified. `useIncrementalGradingRun.ts:119-120` starts
`Math.min(3, requests.length)` workers and all three can be awaiting
`postGradeRunItem` at `:105` when `cancel()` fires, because the `cancelledRef`
check is at the TOP of the loop (`:99`). The conclusion is unaffected. The
`stopping` sentence covers that window and says what is happening.
**Owner-walk item 3.**

---

## 8. RESOLUTION 5 - what stays exactly as it is

Named explicitly, because the build check attacked these and none of the attacks
landed, and because a fill is not a rewrite.

**NOT TOUCHED, NOT REDESIGNED, NOT RE-ARGUED:**

1. **The worker pool's shape.** `useIncrementalGradingRun.ts:92-121`: the shared
   cursor claimed with no intervening `await` (`:100-102`), `workerCount =
   Math.min(INCREMENTAL_CONCURRENCY, requests.length)` (`:119`),
   `INCREMENTAL_CONCURRENCY = 3` (`incrementalRunPlan.ts:26`), and the per-item
   `try/catch` that isolates one failure into an ordinary row (`:104-112`). The
   ONE change inside it is that `arrived` moves from a `runPool` local (`:93`) to
   `arrivedRef.current`, for the reason at 4.5(a). The cursor, the worker count
   and the isolation are untouched.
2. **The `sourceIndex` attribution key**, fixed at ticket-build time in source
   order (`grading-incremental.ts:112`), and the client's deliberate IGNORING of
   the server's echoed index - `useIncrementalGradingRun.ts:69` returns
   `{ sourceIndex: request.sourceIndex, ... }`. The build check calls this the
   wave's best decision and it is not reopened. `buildIncrementalRun` consumes
   `arrived` exactly as the pool produces it.
3. **The per-item Route Handler, entirely.** `route.ts` is NOT in this design's
   write set: the guard order (`:132-136`), the CSRF floor before the body is
   parsed (`:142-145`), the untrusted-input validation (`:75-121`),
   `maxDuration = 60` with `TOTAL_BUDGET_MS = 50_000` under it (`:26`, `:38`),
   `MAX_RUBRIC_CHARS = 20_000` (`:41`) and the `raceWithTimeout` wrapper
   (`:172-175`) all stand. The ONE change it would otherwise have needed -
   echoing the rubric provenance stamp it discards at `:187-188` - is made
   unnecessary by putting provenance in the header instead (14.3).
4. **`ITEM_REQUEST_BYTE_BUDGET = UPLOAD_WIRE_BUDGET_BYTES`**
   (`incrementalRunPlan.ts:37`) and `estimateEntryWireBytes` (`:75-81`). Branch A
   of 8.4.3 step S3 stands.
5. **RULING 118's `mode: "refused"` dead end.** `grading-incremental.ts:136-139`
   routes a `"Refused: "`-prefixed message to its own mode, and
   `useIncrementalGradingRun.ts:161-165` answers it by surfacing the reason and
   starting nothing. **Nothing in this design re-routes a refusal into
   `submitWholeRun`, and the new tier-2 spender is dispatched only on
   `mode: "incremental"`.** The prefix sniff (`grading-incremental.ts:42`) is NOT
   extended to the blank-instructions refusal - that one returns
   `mode: "refused"` explicitly, before the `try`, because its message does not
   and should not carry that prefix.
6. **The `startLockRef` run lock** (`useIncrementalGradingRun.ts:79`, `:127-128`,
   released in the `finally` at `:173-180`). The build check's M1 - that the lock
   is dead on the SYNCHRONOUS whole-run branch because the `finally` releases it
   before the function returns - is real and is NOT fixed here. Adding a
   synchronous lock to `beginWholeRun` would reproduce exactly that dead code.
   **RES-FILL-2.**
7. **`reconcileRun`'s per-result projection.** `:60-87` - the `byNorm` map, the
   first-wins normalization, the blank-cell push at `:76`, the stray fold at
   `:79-84` and the two `rubricAreaNames` branches at `:89-103` - is untouched.
   **The ONE logic change is the empty-canonical FALLBACK at `:51-58`, required by
   RULING 134 (6.5), plus the one-line import move at `:20`.** Round 1 claimed
   "the only change to `reconcile.ts` is the one-line import move" and that
   `reconcile.test.ts`'s frozen literal is unaffected; **both halves of that are
   WITHDRAWN** - the fallback changes and the literal must be re-captured.
8. **Extraction's collision-refusal placement.** `extraction.ts:145-148` puts
   `decideCollisionRefusal` strictly before `groupSubmissionsByStudent` at `:149`,
   and the fill's change to that function (section 9.2) inserts the filename
   inference BETWEEN them, so the refusal still fires first. Opened and confirmed.
9. **`GradingResults.tsx`'s seven resets and every other line of it.** The file IS
   edited (RULING 131), but only its reset TRIGGER: three net lines at `:204`,
   `:220-221` plus one optional prop and its doc comment. **Round 1's "not
   edited, and the fill needs nothing from it" is WITHDRAWN as the check's
   load-bearing false statement.**
10. **`LiveFeedPanel.tsx` and `GithubGradingPanel.tsx`.** Not edited. `runKey` is
    optional, so `runResetKey(undefined, run)` gives them today's reference
    comparison bit for bit (5.7). They are in the owns list because F6a reads
    them as source text, not because they change.

---

## 9. The write set

### 9.1 Files, roles, bounds - every bound numeric, every baseline re-measured

| Path | Role | Now | Bound |
|---|---|---|---|
| `src/lib/grade/types.ts` | **edit.** `GradingRunHeader`, `GradingRunTier2` | 432 | `-le 470` |
| `src/lib/grade/run-header.ts` | **new.** `resolveRunHeader`. SERVER-ONLY | 0 | `-le 140` |
| `src/lib/grade/run-header.test.ts` | **new.** F1, F2, F3 | 0 | `-le 300` |
| `src/lib/grade/reconcile.ts` | **edit.** `:20`'s import, and `:51-58`'s fallback becomes `unionAreaNames` (RULING 134); `unionAreaNames` exported | 106 | `-le 140` |
| `src/lib/grade/reconcile.test.ts` | **owned, EXPECTED TO CHANGE.** The frozen literal is RE-CAPTURED BY RUNNING IT (6.5); F20, F23 | 217 | `-le 330` |
| `src/lib/grade/extraction.ts` | **edit.** `extractStudentEntries` gains an optional filename-inference option (item #9). **The new `./rubric` import goes AFTER `:8`'s `../canvas`** (6.7) | 353 | `-le 385` |
| `src/app/actions/grading.ts` | **edit, THE OTHER CALLER.** Its two blank-instructions returns and its `effectiveRubric` block become `resolveRunHeader` calls | **946** | **`-le 941`** (derived in 9.4) |
| `src/app/actions/grading-incremental.ts` | **edit.** tier 1, the header on the result, `completeGradingRunHeaderAction` | 141 | `-le 260` |
| `src/app/actions/grading-incremental.test.ts` | **edit.** F1b, F4, F16, F24 | 189 | `-le 420` |
| `src/app/components/grading/incrementalRunPlan.ts` | **edit.** the six pure functions of section 3 | 199 | `-le 300` |
| `src/app/components/grading/incrementalRunPlan.test.ts` | **edit.** F7, F8, F12, F19, F20, F21, F22 | 193 | `-le 560` |
| `src/app/components/grading/useIncrementalGradingRun.ts` | **edit.** the phase machine, `beginWholeRun`, the four refs, tier-2 kickoff and its `.catch` | 192 | **`-le 300`** |
| `src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts` | **edit.** F4, F16, F17, F18 | 393 | `-le 620` |
| `src/app/components/GradingResults.tsx` | **edit, RULING 131.** The reset trigger only | **906** | **`-le 920`** |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | **edit.** `runResetKey` | 728 | `-le 745` |
| `src/app/components/grading-results/gradingResultsHelpers.test.ts` | **edit.** F9 clause 1 | 561 | `-le 640` |
| `src/app/components/GradingTab.tsx` | **edit, THE CALLER.** one mount, one door, the terminal region | 620 | `-le 620` |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **owned, EXPECTED TO CHANGE.** A2, A5; F5, F6, F9 clause 2, F10, F11, F13, F25 | 393 | `-le 620` |
| `src/lib/module-graph/runtime-import-graph.test.ts` | **owned, EXPECTED TO CHANGE.** the frozen trail at `:674` is deleted; `:640-673`'s prose rewritten (RES-FILL-1) | - | - |

**M4's internal contradiction is fixed.** Round 1 gave
`useIncrementalGradingRun.ts` `-le 300` in this table and then said at its section
10 that it "lands near 250, well under its `-le 560`" - `-le 560` is
`incrementalRunPlan.test.ts`'s bound, one row above. The bound is **`-le 300`**,
stated once, and section 10 does not restate a different number.

`autoGradeTransition.wiring.test.ts` is measured at 393 on both counters
(`wc -l`; `@(Get-Content ...).Count`) and carries six new clauses, hence `-le 620`.

### 9.2 `extractStudentEntries` gains an option rather than a second copy

```
extractStudentEntries(zipBuffer, options?: { inferFileNamesWith?: LlmProvider })
```

When `inferFileNamesWith` is given, it calls `inferFileNameConvention` after the
collision refusal and before `groupSubmissionsByStudent`, and passes the lookup
instead of `undefined`. When it is absent, behaviour is byte-identical to today.
`groupSubmissionsByStudent`'s second parameter is already optional
(`src/lib/grade/utils.ts:452-455`: `inferredLookup?: InferredFileNameLookup`),
so nothing downstream changes shape.

Its two production callers, derived:

```
grep -rn "extractStudentEntries" src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> src/app/actions/grading-incremental.ts:21  (import)
     src/app/actions/grading-incremental.ts:91  (the call the fill changes)
     src/app/actions/grading.ts:4               (import, via the @/lib/grade barrel)
     src/app/actions/grading.ts:859             (the EMBEDDED zip branch)
     src/lib/grade/extraction.ts:135            (the definition)
     src/lib/grade.ts:12                        (the barrel re-export)
```

`grading.ts:859` is the embedded deterministic branch, which correctly wants NO
inference; a trailing optional option leaves it unchanged. The check confirmed
`:859` is that branch and that the behaviour argument is sound; not re-derived.

The rejected alternative was for `prepareGradingRunAction` to compose
`extractSubmissions` + `decideCollisionRefusal` + `inferFileNameConvention` +
`groupSubmissionsByStudent` itself - a second copy of extraction's own
composition, in a different file, which is how the two routes diverged in the
first place.

**Two comments this makes false, both recorded rather than left.**

- `extraction.ts:130-134`, verbatim: "Group a submissions zip into per-student
  entries WITHOUT any LLM call (uses the deterministic filename-convention
  parsing only). Feeds the Embedded Deterministic Engine, which must never depend
  on a model." That contract becomes conditional. **RES-FILL-10.** I searched for
  an instrument pinning it and found none:
  `grep -rn "WITHOUT any LLM\|no LLM call\|never depend on a model" src --include=*.ts`
  returns only comments (the check ran the same search and reached the same
  answer). So the comment is the only statement of the contract, which is exactly
  why rewriting it is an obligation and not housekeeping: the fill must rewrite
  it to say "no LLM call unless `inferFileNamesWith` is passed, which the
  Embedded path never does."
- `reconcile.ts:9-12`'s own header - "Imports only ./types and ./rubric
  (W4-1/W4-2's own constraint, section 3.3 of docs/a39-waves.md) ... reconcileRun
  must stay a pure leaf" - and `docs/a39-waves.md:1651` ("imports only `./types`
  and `./rubric`, **`-le 250`**") both become false with the import move.
  **RES-FILL-9.** Verified at both lines.

**Not consolidated, and recorded rather than done:** `gradeSubmissions`
(`engine.ts:365-423`, re-verified: `:372-375` are the four dynamic imports,
`:377-396` the composition) still hand-composes the same four steps. Making it
call `extractStudentEntries` too would be the right end state and is a refactor
of the engine's own ingestion, with its own oracle. **RES-FILL-3**, and its
premise is now UNDERSTATED rather than wrong: the check found `2f06261` gave
`assignUnclaimedLabel` three call sites, so there are more than two compositions
of overlapping ingestion steps.

### 9.3 The `owns` list, derived - and TWO gate lists, because one of them cannot run yet

Test files that read a write-set file AS SOURCE TEXT, or import one. Commands and
outputs pasted. **Every canary was REDIRECTED to a file, never piped, because
`grep ... | sort; echo $?` reads `sort`'s exit code - I made that exact mistake
during this pass and the canary reported success with zero lines.**

```
# A - source-text readers (now including GradingResults.tsx and grade/extraction,
#     which round 1's pattern omitted)
grep -rlE "GradingTab\.tsx|GradingResults\.tsx|grading-incremental|incrementalRunPlan|useIncrementalGradingRun|grade/reconcile|actions/grading\.ts|grade/extraction" src --include=*.test.ts
  -> 35 files

# A canary
grep -rlE "GradingTabZZZ\.tsx|grade/reconcileZZZ|GradingResultsZZZ\.tsx" src --include=*.test.ts > "$TEMP/canaryA.txt"
  A_CANARY_EXIT=1 ; 0 lines          # fires on real names only

# B - import readers
grep -rlE 'from "\./engine"|from "\./reconcile"|from "@/lib/grade/engine"|from "@/lib/grade/reconcile"|from "\./extraction"|from "@/lib/grade/extraction"|from "\./grading"|from "@/app/actions/grading"|from "\./incrementalRunPlan"|from "\./useIncrementalGradingRun"|from "\./GradingResults"|from "@/app/actions/grading-incremental"' src --include=*.test.ts
  -> src/app/actions/grading-checklist.test.ts
     src/app/actions/grading.budget.test.ts
     src/app/actions/grading.collisionRefusal.test.ts
     src/app/actions/grading.guard.test.ts
     src/app/api/grade-run-item/route.test.ts
     src/app/components/grading/incrementalRunPlan.test.ts
     src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts
     src/lib/grade/collisionRefusal.wiring.test.ts
     src/lib/grade/engine.test.ts
     src/lib/grade/engine.ungraded.test.ts
     src/lib/grade/extraction.test.ts
     src/lib/grade/reconcile.test.ts
     src/lib/grade/rubric-stamp.wiring.test.ts

# B canary
grep -rlE 'from "\./engineZZZ"|from "\./GradingResultsZZZ"' src --include=*.test.ts > "$TEMP/canaryB.txt"
  B_CANARY_EXIT=1 ; 0 lines

# C - extractStudentEntries readers
grep -rln "extractStudentEntries" src --include=*.test.ts
  -> src/app/actions/grading.budget.test.ts
     src/app/actions/grading.collisionRefusal.test.ts
     src/app/actions/grading.guard.test.ts
     src/lib/grade/collisionRefusal.wiring.test.ts
     src/lib/grade/extraction.test.ts
     src/lib/grade/grouping-zip-parents.wiring.test.ts
```

**The BASELINE LIST is the union of A, B and C plus the five structural gates,
`sort -u`'d: 46 paths.** Every one was checked for existence individually with a
per-path `[ -f "$p" ] || echo MISSING` loop over the sorted union; **zero
missing.** M10's derivation error is fixed in three places at once: the prose no
longer says "five outputs" (there are three content-producing greps and three
canaries), it no longer says "three structural gates" (there are five -
`use-server-exports.test.ts`, `file-size-ceiling.structure.test.ts`,
`no-emojis.test.ts`, `source-bytes.structure.test.ts` and
`action-guard-coverage.test.ts`), and `action-guard-coverage.test.ts` is now
JUSTIFIED as a structural gate added by name rather than appearing in the list
from nowhere.

**The 46 paths are enumerated exactly once, in the BASELINE command below**, so
there is no second copy to drift out of step with it.

**TWO lists, because one path does not exist yet and the wrapper REFUSES on a
missing path.** Round 1 published a single 33-path list containing
`src/lib/grade/run-header.test.ts`, which this wave CREATES - and F10/F11 both
explicitly require a PRE-CHANGE baseline run ("run it against today's unchanged
file"). Verified in the wrapper's own source rather than assumed:
`src/tools/vitest-paths/paths-gate.ts:42` pushes
`` `does not exist on disk: ${a}` `` and `src/tools/vitest-paths/cli.ts:36`
returns `{ exitCode: 1, lines: ["PRE-CHECK FAILED", ...pre.problems] }` **before
`deps.runVitest` is ever called at `:43`**. So round 1's single list would have
exited 1 and run NOTHING at the one moment it was most needed. The two lists:

- **BASELINE (46 paths, run BEFORE the wave writes a line):** exactly the list
  above.
- **GATE (47 paths, run at the wave gate):** the same 46 plus
  `src/lib/grade/run-header.test.ts`.

Both spelled with the wrapper, never a raw multi-path `vitest`, which silently
drops any argument it does not match:

```powershell
# BASELINE - all 46 paths above, as one npm run test:paths -- invocation
npm run test:paths -- src/app/actions/action-guard-coverage-github-cohort.test.ts src/app/actions/action-guard-coverage.test.ts src/app/actions/grading-checklist.test.ts src/app/actions/grading-incremental.test.ts src/app/actions/grading-missing-submissions.test.ts src/app/actions/grading-run-mapping.test.ts src/app/actions/grading.budget.test.ts src/app/actions/grading.collisionRefusal.test.ts src/app/actions/grading.guard.test.ts src/app/api/grade-run-item/route.test.ts src/app/components/autoGradeTransition.wiring.test.ts src/app/components/componentStorageKeys.structure.test.ts src/app/components/grading-results/gradingResultsDisplayHelpers.test.ts src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts src/app/components/grading-results/gradingResultsHelpers.test.ts src/app/components/grading-results/gradingResultsHelpersEditState.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/app/components/grading-results/gradingResultsPostOutcome.test.ts src/app/components/grading-results/rubricProvenanceLeaf.test.ts src/app/components/grading-results/sortGradeRows.test.ts src/app/components/grading-results/ungradedDisclosure.test.ts src/app/components/grading-results/ungradedRowLabel.test.ts src/app/components/grading/incrementalRunPlan.test.ts src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts src/app/components/repo-grades/repoGrades.wiring.test.ts src/app/components/repo-grades/repoGradesCellEdits.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/rubricBreakdownPercent.wiring.test.ts src/app/components/ui/modalAdoption.wiring.test.ts src/file-size-ceiling.structure.test.ts src/lib/canvas-client-boundary.runtime-graph.test.ts src/lib/canvas/grades.test.ts src/lib/grade/collisionRefusal.wiring.test.ts src/lib/grade/engine.test.ts src/lib/grade/engine.ungraded.test.ts src/lib/grade/extraction.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts src/lib/grade/postable.test.ts src/lib/grade/reconcile.test.ts src/lib/grade/rubric-stamp.wiring.test.ts src/lib/grade/utils.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/lib/no-emojis.test.ts src/lib/office-edit.test.ts src/lib/use-server-exports.test.ts src/source-bytes.structure.test.ts

# GATE - the same 46 plus the file this wave creates
npm run test:paths -- src/lib/grade/run-header.test.ts <the 46 above>
npm test
npx tsc --noEmit --incremental false
npm run build
```

PASS: every argument reported `COVERED`, exit 0; `npm test` zero failed, exit 0;
`tsc` silent. `npm run build` is run once and the gate is the
`Compiled successfully` LINE, grepped for, not the exit code.

**M3 corrected: `next build` is NOT the only gate that catches a `"use server"`
module exporting a non-async binding, and this design adds an export to one.**
`src/lib/use-server-exports.test.ts` exists for exactly that class and says so in
its own header at `:1-13`, verbatim: "Guard against a build break that neither
`tsc --noEmit` nor `vitest run` can see: a "use server" module may export NOTHING
but async functions ... this test exists so the NEXT instance is caught by
`vitest run`, in seconds, instead of by a failed build." It is IN both lists
above. So the fast instrument for `completeGradingRunHeaderAction` is
`npm run test:paths -- src/lib/use-server-exports.test.ts`, and `npm run build`
is the backstop, not the primary. Round 1 pointed the implementer at the slowest
instrument it had.

**I ran none of these.**

### 9.4 What `gradeAction` does with the header, and where `-le 941` comes from. RULING 133

Round 1's write-set row for `grading.ts` said **"must SHRINK"** with no number
while every other row carried a numeric bound, from a baseline (941) that was
5 lines stale. Both halves are fixed.

**What the header is consumed for, field by field - because the direction of the
line change is not establishable without it, and applying the wrong fields would
double-stamp.**

| `ok` field | `gradeAction` | `prepareGradingRunAction` |
|---|---|---|
| `effectiveRubric` | **READS.** Replaces `:890-892`'s expression; `:903`, `:904`, `:905`, `:912`, `:913`, `:914` keep the identifier they already use | READS - it is the `plan.rubric` every per-item body carries |
| `generatedRubric` | **READS.** Replaces `:893`; returned at `:907` and `:924` unchanged | READS - it feeds the generated-rubric card (item #4) |
| `criteriaNames` | **IGNORES.** `gradeStudentEntries` computes its own at `engine.ts:208` from the rubric it is handed | READS - it is `canonicalColumns`' branch-1 input (6.2) |
| `rubricUsed` | **MUST NOT APPLY** | READS - the header is the only producer on this route |
| `rubricFingerprint` | **MUST NOT APPLY** | READS - same |

**Why `gradeAction` must not apply the provenance pair.** `engine.ts:360` already
spreads `...stampRubricProvenance(rubric)` into the run it returns, and
`gradeAction` then spreads that run at `:919` (`...run`). Applying the header's
pair as well would put two stamps of the same fact into one object with the
spread ORDER silently deciding which wins - and on the Canvas path the header's
`rubricUsed` would be computed from a different string than
`gradeCanvasUrl` stamps with. So: **`gradeAction` destructures exactly two fields
and ignores three.**

**Its instrument is cheap, exists, and can fail.** Measured today:
`grep -c "rubricUsed\|rubricFingerprint" src/app/actions/grading.ts` -> **0**
(exit 1, no match), with the canary `grep -c "rubricUsedZZZ" ...` -> 0 (exit 1)
confirming the instrument fires on real names only. F26: that count stays 0 after
the fill. **A `grep -c` normally counts prose and would be the wrong instrument -
but here 0 is the PASS, so a comment mentioning either name makes it RED, not
green.** It fails closed. The obligation that creates is stated rather than
discovered: **the fill's commit must not mention `rubricUsed` or
`rubricFingerprint` in a comment inside `grading.ts`** - which is easy, because
the reason it must not apply them belongs in `run-header.ts`'s own doc comment,
beside the function that produces them. Mutation: destructure `rubricUsed` from
the header -> the count is non-zero -> red.

**The numeric bound, derived line by line from 946.**

ZIP Gemini branch. Removed: `:886` `if (!assignmentInstructions.trim()) {`,
`:887` the return, `:888` `}`, and `:890-893` the `effectiveRubric` /
`generatedRubric` block - **7 lines.** Added - 3 lines:

```
const header = await resolveRunHeader(assignmentInstructions, rubric, provider, { synthesizeRubricWhenBlank: true });
if (header.kind === "refused") return { run: null, error: header.error };
const { effectiveRubric, generatedRubric } = header;
```

Net **-4**. The two identifiers keep their names, so `:903-905` and `:912-914`
are untouched.

Canvas branch. Removed: `:814` `if (!assignmentInstructions.trim()) {`, `:815`
the return, `:816` `}` - **3 lines.** Added - 2 lines, the same two, with
`synthesizeRubricWhenBlank: false`. `:820-822`'s three `rubric` arguments become
`effectiveRubric`, which on this branch IS `rubric` (4.2), and those are in-place
edits at 0 net. Net **-1**.

**Total -5. 946 - 5 = 941. The bound is `-le 941`**, on BOTH counters, and
shrinking further is allowed.

**A consequence of that arithmetic the owner would not expect, and it is live
before the wave starts.** `docs/a39-waves.md:1038` prices this file at
`-le 945`, and **`docs/BACKLOG.md`'s RES-W-7 names its own failure direction as
"greater than 945 at any wave gate".** The file measures 946 on both counters
today. **So `grading.ts` is already ONE LINE over a gate recorded in the backlog,
before this wave writes anything** - `2f06261` put it there and could not have
known. Consequences: the wave's pre-change baseline must record 946 explicitly so
the 946 is attributable to `2f06261` rather than to the fill; and `-le 941` is
what clears RES-W-7 rather than merely not worsening it. **RES-FILL-8** carries
the reconciliation.

---

## 10. Sizes, ceilings, and where an extraction would cut

`GradingTab.tsx` is **620** on both counters, against the repo's hard 1000 and
against `docs/a39-waves.md` 8.4.4's own `-le 620`.

Estimated delta, derived line by line rather than guessed:

| Change | Lines |
|---|---|
| DELETE the second mount, `GradingTab.tsx:595-615` | **-21** |
| destructure `phase`, `incrementalRun`, `incrementalRunKey`, `beginWholeRun`, tier-2 state from the hook | +4 |
| `displayRun` / `runKey` / `progressLine` / `terminalLine` reads | +4 |
| the terminal-sentence region, a sibling of `:472-478` (7.2) | +5 |
| `runKey={...}` on the one mount | +1 |
| `shouldShowEmptyState(...)` at `:487` | +1 |
| the generated-rubric card reads the merged value instead of `state.generatedRubric` | +1 |
| the scroll effect's dependency becomes the run identity (M6, below) | +2 |
| `handleAutoGrade:206` `formAction(fd)` -> `beginWholeRun(fd)` | 0 |
| **net** | **about -3, landing near 617** |

That is an ESTIMATE and the implementer measures both counters at the gate. It is
under 620, so the wave's own bound needs no change.

**If it lands above 620, the extraction is named and it is not a judgement
call:** `GradingTab.tsx:495-532` - the `state.generatedRubric` `details` card, 38
lines - is a self-contained pure render of one value with no other dependency on
this component's state. It moves to
`src/app/components/grading-results/GeneratedRubricCard.tsx` and the call site is
one line. That cut alone takes the file to about 580. It is NOT done
speculatively: an extraction taken when it is not needed costs a new call site
and a new file for nothing.

New-file and edited-file bounds are in the table at 9.1, all numeric, all from
re-measured baselines.

**The react budget (W4-9c) is unchanged and binding.**
`useIncrementalGradingRun.ts:19` is `import { useRef, useState } from "react";`
and must stay exactly that. The phase is a `useState`; the four refs of 4.5(a)
are `useRef`; the tier-2 merge is a `.then`/`.catch` pair inside `startReview`
that calls `setState`, not an effect. **No `useEffect`, `useCallback` or `useMemo`
is added.** The budget constrains hook KINDS, not call counts - verified against
the harness at `useIncrementalGradingRun.lifecycle.test.ts:15-47`, which
implements `useState` and `useRef` over a slot array with a per-call cursor and
pins no count, while `vi.mock("react", ...)` supplies only those two, so a third
kind is `undefined` and THROWS rather than failing red. That is an unread gate
rather than a red one, which is why the constraint is on kinds.

**And that is why `buildIncrementalRun` is called in the POOL, not in
`GradingTab`'s render body.** Calling it during render would recompute
`reconcileRun` over every arrived row on every keystroke in the instructions
`TextField` (`GradingTab.tsx:399-410`), and the obvious fix - `useMemo` - is
banned by the budget above. Computing it on each arrival and storing the result in
state costs nothing per render and needs no third hook. The check called this
placement well argued; it is unchanged.

**M6: the scroll TRIGGER, not just the scroll NODE.** Opened and confirmed:
`GradingTab.tsx:212-216` is
`useEffect(() => { if (run && resultsRef.current) { resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } }, [run])`
with `run = state.run` at `:174`. One mount does give the incremental route a
`sectionRef` node (`:579-582`), which fixes `page.tsx:697`'s
`fallbackFocusRefs={[resultsSectionFallbackRef, previewFallbackRef]}` path - item
#8's real content. But the effect's dependency is still `state.run`, which never
changes on an incremental run, so the scroll still never fires; and changing the
dependency to `displayRun` would fire it on EVERY arrival, scroll-jacking the
reader up to N times.

**The decision: the dependency becomes the run IDENTITY, reusing 5.7's
construction rather than inventing a second one** -
`}, [runResetKey(runKey, displayRun)])`. The effect then fires at most once per
run. What that means in practice, stated rather than glossed: at the moment an
incremental run's identity first appears, `displayRun.results` is empty, so
`:545`'s guard is false, so `resultsRef.current` is null and the scroll does not
happen - and it will not happen later, because the identity does not change
again. **So the incremental route still does not auto-scroll, which is exactly
what it does today.** No regression, no scroll-jacking, and no new behaviour
invented. Making it scroll on the FIRST ARRIVAL only would need a "has this run
ever had a row" latch whose only enforcer is a render, so it is not proposed.
**RES-FILL-13.**

---

## 11. Requirements, with the instrument and the mutation for each

**I RAN NONE OF THESE AND APPLIED NONE OF THESE MUTATIONS.** My write set is this
document. I could not run them: `npx tsc` and `npm run build` are single-caller
resources, every mutation requires editing production source outside my write
set, and I am one of several agents on this tree. Each row below names what the
implementer must watch go red BEFORE writing the code that makes it green. Where
a row says a test "would go red", that is a reading claim from that test's own
source, cited by line.

**M2's named mutation is the wave's FIRST step, before any other line is
written.** Add `import { inferFileNameConvention } from "./rubric";` to
`extraction.ts` **above** `:8`'s `../canvas` import and run
`npm run test:paths -- src/lib/module-graph/runtime-import-graph.test.ts`,
reading the exit code from the command itself rather than through a pipe. Section
6.7 predicts RED (the extraction trail at `:665` shortens and the deep-equal at
`:703` fails). Then move the import below `:8` and run it again; 6.7 predicts
GREEN. **Both runs are required.** If either prediction is wrong, 6.7's reading of
`walkRuntimeGraph`'s traversal order is wrong and the design owes a
`FROZEN_TRAILS` addition it does not currently carry - which is cheap to learn
first and expensive to learn at the gate.

| id | Requirement | Instrument | Mutation that must turn it RED |
|---|---|---|---|
| **F1** | `resolveRunHeader` generates a rubric when, and only when, the rubric is blank AND `synthesizeRubricWhenBlank` is true; `generatedRubric` is set on exactly that branch | `npm run test:paths -- src/lib/grade/run-header.test.ts`, with `generateRubric` mocked; four cases (blank+zip, blank+canvas, filled+zip, filled+canvas) | make the call unconditional -> the filled-rubric cases see the mock called. Make it always skip -> the blank+zip case's `effectiveRubric` is `""` |
| **F2** | Blank instructions return `{kind:"refused"}` with the message BYTE-IDENTICAL to the string at **`grading.ts:887`** (zip) and **`:815`** (Canvas), `"Please provide assignment instructions."`, and no model call is made | same file; assert the string by equality against a literal in the test, and assert the `generateRubric` mock was not called. **The citation is RE-PINNED: round 1 said `:882`, which `2f06261` moved; `:882` is now inside the embedded zip branch** | change one character of the message -> red. Move the refusal after the generation -> the mock-not-called assertion goes red |
| **F3** | `criteriaNames` is `extractRubricCriteria(effectiveRubric)`, not of the raw rubric | same file: a blank-rubric zip case whose GENERATED rubric parses to two criteria asserts `criteriaNames.length === 2` | read `rubric` instead of `effectiveRubric` -> `[]` |
| **F4** | **Every tier-1 step completes before any ticket is dispatched.** Measured as ORDER at the consumer, not as a not-called assertion inside a module with no call site | `useIncrementalGradingRun.lifecycle.test.ts`: one shared call-log array written by the `prepareGradingRunAction` stub and by the `fetch` stub; assert the prepare entry precedes every fetch entry, and that every fetch body's `rubric` equals the stub's `header.effectiveRubric` and is non-empty | dispatch the pool before awaiting prepare -> the log order inverts. Have the prep return the raw blank rubric -> the body-equality clause goes red |
| **F5** | `GradingTab.tsx` contains **exactly one** `<GradingResults` element, and it is not inside a `.map(`. **Object: one file's element count. It does NOT claim exclusivity - see F6** | `autoGradeTransition.wiring.test.ts`: `[...gtSource.matchAll(/<GradingResults(?=[\s/>])/g)].length === 1`, plus the innermost enclosing brace span of that match contains no `.map(`. The lookahead is copied from `gradingResultsExtraction.wiring.test.ts:315`, which documents why a bare `\b` also matches `<GradingResultsHandle>` | add a second `<GradingResults` anywhere -> 2. Wrap the one mount in a `.map(` -> the span clause goes red |
| **F6** | **The edits-surface exclusivity GUARD, at REPO scope.** Three sub-clauses, spelled in 5.6: (a) the set of files under `src/app/**/*.tsx` containing `editsSurface="canvas"` is exactly `GradingTab.tsx` and `LiveFeedPanel.tsx`; (b) the one `<GradingResults` match's GUARD TEXT satisfies A6's conjunctive `source !== "livefeed"` test and contains no `\|\|`; (c) exactly one `<LiveFeedPanel` in `GradingTab.tsx`, immediately governed by a `source === "livefeed"` ternary test | `autoGradeTransition.wiring.test.ts`, reusing its existing `gtSource`/`lfSource` readers (`:99-100`) and A6's own regex pair (`:190`) | (a) set `GithubGradingPanel.tsx:859` to `editsSurface="canvas"` -> the set has three members. (b) **delete `source !== "livefeed" &&` from the surviving mount's guard -> red; TODAY NOTHING GOES RED ON THAT EDIT, which is the whole finding.** (c) hoist `<LiveFeedPanel` out of the ternary -> red |
| **F7** | `selectDisplayRun` is total over all six phases | `incrementalRunPlan.test.ts`: a truth table over all six phases crossed with (incremental null / non-null) and (whole null / non-null) - twenty-four rows, each asserted by identity against the expected object | return `incrementalRun ?? wholeRun` -> the `idle`-with-a-stale-incremental row goes red. Add a default branch that returns `wholeRun` -> the `refused` row goes red |
| **F8** | `selectRunKey` is total over all six phases, is `undefined` for **exactly** `idle`, and is stable in `runId` | `incrementalRunPlan.test.ts`: six rows, plus `selectRunKey("running", 7) === selectRunKey("complete", 7)` and `selectRunKey("running", 7) !== selectRunKey("running", 8)` | return a key for `idle` too -> the `idle` row goes red, and with it the whole-run path's reference comparison (5.7 obligation 1). Derive the key from the arrived count instead of `runId` -> the phase-stability clause goes red |
| **F9** | **`GradingResults` decides "a new run arrived" from the run IDENTITY, not the run REFERENCE.** Two clauses, two objects | (1) `gradingResultsHelpers.test.ts`: `runResetKey("incremental-7", runA) === runResetKey("incremental-7", runB)` for two DIFFERENT objects, and `runResetKey(undefined, runA) !== runResetKey(undefined, runB)`. (2) `autoGradeTransition.wiring.test.ts` over `GradingResults.tsx` source: `runResetKey(` appears exactly once, and the file contains no `run !== prevRun` | (1) `return run` -> the same-key clause goes red. `return runKey` -> the `undefined` clause collapses two runs to one identity and goes red. (2) revert the guard at `:220` to `run !== prevRun` -> both source clauses go red |
| **F10** | Exactly one `formAction(` occurrence in `GradingTab.tsx`, strictly inside a `startTransition(` paren span | `autoGradeTransition.wiring.test.ts` A5, rewritten from its `:161` `toBe(2)`. **WATCHED: change the assertion to 1 FIRST and run it against today's unchanged file - it must go RED at 2, proving the count is the thing discriminating** | leave `handleAutoGrade:206`'s `formAction(fd)` in place -> 2. Move `submitWholeRun`'s call outside the transition -> the span clause goes red |
| **F11** | `handleAutoGrade` dispatches through `beginWholeRun(`, exactly once, inside its own `startTransition(` span | `autoGradeTransition.wiring.test.ts` A2 (`:126-136`), rewritten. **WATCHED: write it first against today's file and see it go RED on the `beginWholeRun(` presence clause while A3's `setGradingTarget` clause (`:138-150`) stays GREEN** - which proves the handler span is being found rather than the whole assertion failing for want of an anchor | call `beginWholeRun` outside the transition -> the span clause goes red. Call it twice -> the count goes red |
| **F12** | The zip empty-state sentence never renders while a run is in progress OR after it stopped. **Total over all six phases** - round 1 left `stopped` and `refused` unspecified | `incrementalRunPlan.test.ts`: `shouldShowEmptyState(phase, run)` truth table, all six phases crossed with (null run / zero-result run / non-empty run) = eighteen rows. `false` for `running`, `stopping`, `stopped`; `false` for any null run; `true` only for `idle` and `complete` with a zero-result non-null run | return `run !== null && run.results.length === 0` -> the `running`, `stopping` AND `stopped` rows go red. Return `false` for `complete` too -> the genuine empty-zip row goes red and the user loses the only sentence that explains an empty result |
| **F13** | **The terminal `stopped` sentence renders when ZERO rows arrived.** Its channel must not be gated on a row existing | `autoGradeTransition.wiring.test.ts`: the innermost enclosing brace span of the `describeRunProgress`-derived terminal region contains no `results.length` and no `<GradingResults`, and its index precedes the one `<GradingResults` match. Plus F12's `stopped`-with-zero-rows row | route the sentence through `GradingResults`'s `banner` prop (round 1's design) -> the region's span is inside the `run.results.length > 0` mount and the no-`results.length` clause goes red |
| **F14** | No `"use client"` closure reaches `lib/supabase` | **`src/lib/canvas-client-boundary.runtime-graph.test.ts` - it already exists and already runs.** It roots a walk at every `"use client"` entry point (`:16-35`) and fails on a value edge reaching `FORBIDDEN_PATH_PREFIXES` (`client-boundary-policy.ts:18`) | import `@/lib/grade/reconcile` into `incrementalRunPlan.ts` WITHOUT changing `reconcile.ts:20` -> the chain reconcile -> rubric -> rubric-bank -> db (`research/db.ts:64`'s dynamic `import("@/lib/supabase/server")`) enters the closure and it goes red |
| **F15** | The frozen import-graph trail matches the tree, in both directions, **and `extraction.ts`'s new `./rubric` import sits AFTER `:8`'s `../canvas`** | `runtime-import-graph.test.ts`'s deep-equal at **`:703`** (round 1 cited `:709-712`, which is wrong) over `FROZEN_TRAILS` (`:657-676`) | (1) delete `:674`'s trail without changing `reconcile.ts:20` -> red, the trail is still real. (2) Change `reconcile.ts:20` without deleting `:674` -> red, the trail is gone. (3) Move `extraction.ts`'s new `./rubric` import above `:8` -> `:665`'s trail string shortens and the deep-equal goes red. **Round 1's claim "there is no way to satisfy one half alone" is WITHDRAWN - I did not run either mutation and neither did the check** |
| **F16** | Tier 2 is dispatched on `mode: "incremental"` only, and never on `"refused"` or `"whole-run"` | `useIncrementalGradingRun.lifecycle.test.ts`: a `completeGradingRunHeaderAction` stub, asserted called exactly once on the incremental path and zero times on each of the other two. **This is a real seam - the stub IS on the path the code under test calls**, unlike the `mockCallLlm` assertion the build check's B4 found unfalsifiable | hoist the tier-2 call above the mode switch -> the refused and whole-run cases see it called |
| **F17** | **Tier 2 survives every later arrival.** Storage is a ref, not state (4.5a) | `useIncrementalGradingRun.lifecycle.test.ts`: land tier 2 between arrival 1 and arrival 2, then assert the built run still carries `fullCreditChecklist.length > 0` AFTER arrival 2 and after arrival 3 | hold `tier2` in `useState` -> the pool's captured closure rebuilds with the stale value and the post-arrival-2 assertion goes red. (The harness's `useState` at `:25-36` returns the slot's value per call, so a stale capture is reproducible in it) |
| **F18** | **A tier-2 rejection is caught, is observable, and does not stop the run.** The run still reaches `complete` and the instructor is told the two panels will not arrive | `useIncrementalGradingRun.lifecycle.test.ts`: make the tier-2 stub REJECT; assert (a) the pool still completes and every row arrives, (b) `phase === "complete"`, (c) `incrementalError` is non-null and mentions that grades are unaffected | delete the `.catch` -> an unhandled rejection, and (c) goes red because nothing is ever set. Set `phase = "refused"` in the catch -> (b) goes red |
| **F19** | A student whose areas differ from the canonical set gets a present, EDITABLE, blank cell - never a missing one - and a transport failure at index 0 does not empty the header. **Plus M4: a failure row carries the ticket's file list** | `incrementalRunPlan.test.ts`: a fixture of three arrived rows with divergent area names plus one `classifyItemFailure` row at index 0; assert every result's `rubricAreas` length equals `rubricAreaNames` length, for every row; and assert the failure row's `mergedFileCount` and `submittedFiles` equal the ticket's | build `rubricAreaNames` from `arrived[0]` (today's `GradingTab.tsx:601`) -> the failure-at-0 case yields `[]` and the parity assertion goes red. Keep `incrementalRunPlan.ts:195-196`'s hardcoded `mergedFileCount: 0` / `submittedFiles: []` -> the M4 clause goes red |
| **F20** | **Prefix stability during the run, determinism at the end. RULING 132.** Two clauses, and the pair discriminates WHICH property was built | `incrementalRunPlan.test.ts`: one arrived set, fed in two DIFFERENT arrival orders. (a) the TERMINAL `rubricAreaNames` is deep-equal across the two orders; (b) within each order, every intermediate `rubricAreaNames` is a PREFIX of the next. **Both functions are pure, so this is buildable here today - round 1's "no in-repo instrument" for this half is WITHDRAWN** | (a) drop the terminal normalisation -> the two orders end with different column orders -> red. (b) sort by ascending `sourceIndex` during the run -> a later-arriving lower index inserts ahead of a read column -> red. **One mutation per clause, in opposite directions** |
| **F21** | **`buildIncrementalRun` never consumes its own reconciled output.** `arrivedRef` holds RAW rows for the life of the run (6.3) | `incrementalRunPlan.test.ts`: `Object.freeze` the arrived array and each row (ES modules are strict, so a write throws), call `buildIncrementalRun` twice with two different canonical sets, and assert the second call's output deep-equals an independent first call over the same raw rows | write the projection back - `arrived[i].result = projected.results[i]` - inside `buildIncrementalRun` -> the frozen row throws. Feed the previous call's `results` in as `arrived` -> the independence assertion goes red, and the mutated fixture shows the blank cell and lost score 6.3 describes |
| **F22** | `mergeArrivedResults` drops nothing for being out of range, and its duplicate-index behaviour is STATED rather than discovered. **Round 1's F14 required `merged.length === arrived.length` AND a duplicate case, which cannot both hold** | `incrementalRunPlan.test.ts`, two clauses over the sorted-keys construction: (a) for an arrived set containing an index at and above `totalTicketCount`, `merged.length === bySourceIndex.size`; (b) for two arrived rows sharing a `sourceIndex`, `merged.length` is one less than `arrived.length` and `merged[0]` is the LATER-pushed row by identity - **last-wins, which is what `incrementalRunPlan.ts:165`'s bare `set` already does, now written down** | (a) keep the `for (let i = 0; i < totalTicketCount; ...)` loop at `:168` -> the out-of-range row is lost and (a) goes red. (b) change `:165` to a first-wins `if (!has) set` -> the identity assertion goes red. **Both inputs are UNREACHABLE from the pool today** (the cursor is claimed with no intervening `await` at `:100-102`), so these pin a pure function's total behaviour rather than guarding a reachable defect - the honest distinction from B4's refused instrument is that these assertions CAN fail, they merely guard an input the current caller cannot produce, whereas B4's could not fail at all |
| **F23** | **`reconcileRun`'s empty-canonical fallback is a UNION, on BOTH routes. RULING 134** | `reconcile.test.ts`: the frozen literal at `:110-146`, **RE-CAPTURED BY RUNNING `npm run test:paths -- src/lib/grade/reconcile.test.ts` and reading the received value out of the failure output** - never hand-predicted. Expected new values: `FROZEN_AREA_NAMES = ["Clarity","Grammar","Structure"]`, Bob gains `{area:"Structure",score:"6/10",comment:""}`, Alice gains `{area:"Structure",score:"",comment:""}`. Plus a direct `unionAreaNames` unit case | restore `:51-58`'s richest-single-result fallback -> `FROZEN_AREA_NAMES` is back to two and the re-captured literal goes red. **And the FIRST run of this file after the fallback change MUST be red before the literal is touched; a literal updated in the same edit as the implementation is a fitted oracle, which is this repo's recorded disarming failure** |
| **F24** | Tier 1 step 6 SWALLOWS a `getSpeedGraderUrl` failure. A best-effort deep link cannot demote the route (4.4) | `grading-incremental.test.ts`: a `getSpeedGraderUrl` stub that REJECTS, on a Canvas fixture; assert the result is `mode: "incremental"` with `speedGraderUrl === null`, not `mode: "whole-run"` | drop the `.catch(() => null)` -> the rejection lands at `grading-incremental.ts:117`, fails the `"Refused: "` test at `:136` and returns `mode: "whole-run"` at `:139` -> red. **This is the one defect in the design whose symptom is total silence: `startReview` never reads `prepared.reason`** |
| **F25** | The scroll-into-view effect fires at most ONCE per run, not once per arrival (M6) | `autoGradeTransition.wiring.test.ts`: the `scrollIntoView` effect's dependency array contains `runResetKey(` and does NOT contain a bare `displayRun` or `state.run` | set the dependency to `[displayRun]` -> red, and behaviourally the reader is scroll-jacked once per arrival. Leave it `[run]` -> red, and the incremental route keeps a dead effect nobody notices |
| **F26** | `gradeAction` reads exactly two of the header's five `ok` fields and applies NEITHER provenance field (9.4) | `grading.guard.test.ts` or `grading.budget.test.ts` (both already in the gate list and both already read `grading.ts` as source): `grep`-equivalent assertion that `grading.ts` contains zero occurrences of `rubricUsed` and zero of `rubricFingerprint`. **Measured today: 0 and 0.** A 0-expectation makes prose a FALSE POSITIVE rather than a false negative, so the check fails closed - and the fill must therefore not name either field in a `grading.ts` comment | destructure `rubricUsed` from the header in either branch -> non-zero -> red. And the failure this prevents is a double stamp over `engine.ts:360`'s `...stampRubricProvenance(rubric)` with the spread order silently deciding which wins |

**Requirements that deliberately have NO in-repo instrument**, named so no green
is read as covering them: **the eight items in section 12, minus nothing - all
eight are owner-walk items and none has an in-repo instrument.** Round 1 said
"three requirements ... the six visible effects in section 12", three against six
in one sentence; the count is now one number and it matches the table. **A
requirement whose only enforcer would be a render is not proposed here.**

**Round 1 claimed one more thing had no instrument and it was wrong.**
Owner-walk item 2's column-stability half is NOT instrument-less:
`unionAreaNames` and `buildIncrementalRun` are pure, so F20 measures both
prefix stability and terminal determinism today. **That half is MOVED OUT of the
owner walk and into F20**, and item 2's cell-parity half is likewise covered by
F19. What remains for the owner is the one judgement no pure function can make.

**Two instruments I considered and REFUSED to recommend**, because I could not run
them and because each would claim more than it measures:

- A per-item rubric-fingerprint consistency check (the handler echoes
  `rubricFingerprint`, the client compares it with the header's). It cannot fail:
  `buildRunItemRequests` (`incrementalRunPlan.ts:143-152`) builds every body from
  the single `plan.rubric`, so divergence is unreachable. A check whose assertion
  cannot fail is the class the build check's B4 names. The check independently
  confirmed this refusal is principled.
- An end-to-end oracle over `gradeAction` proving the `resolveRunHeader`
  extraction is behaviour-preserving. `gradeAction` needs Canvas, extraction,
  three model seams and Supabase mocked, and I cannot run it to find out whether
  such a harness would be measuring the extraction or the mocks. The extraction's
  behaviour-preservation is therefore argued from the diff - `grading.ts:886-888`
  and `:890-893` become one call with the same branches, `:814-816` becomes the
  same call with `synthesizeRubricWhenBlank: false` - plus F1/F2/F3/F26 on the
  extracted function and the four existing `gradeAction` test files already in the
  gate list. **Round 1 called this the design's weakest link. It is not, and the
  check is right about that:** the extraction replaces seven lines with three at
  two sites, its failure mode is LOUD (a changed refusal string or a missing
  rubric shows up on the first run), and four owned test files cover it. **The
  actual weakest links are the three the environment cannot see at all: B1's
  identity (F9's behavioural half), B2's exclusivity (F6's behavioural half) and
  B3's column movement (owner-walk item 2's judgement half).** Each has a pure
  instrument for the half that is measurable and an owner walk for the half that
  is not, and this document does not let the first stand in for the second.

---

## 12. What needs an owner walk

Nothing renders under this repo's vitest. Each item has an owner, an instrument
and a step. All eight are due in **ONE sitting** - the same run answers seven of
them, and splitting them costs eight runs.

**Round 1 had six items and one of them was doing two jobs. Item 2's
column-stability and cell-parity halves are MOVED OUT to F20 and F19; what is
left of item 2 is the judgement.** Items 7 and 8 are new, from RULING 131 and
RULING 134.

| # | Claim | Owner | Instrument | Direction of failure |
|---|---|---|---|---|
| 1 | Time to the first readable row falls | repo owner | W4-7 (`docs/a39-waves.md` 8.4.5): one real run of at least five submissions on the default provider, timed from the Start Review press to the first actionable row, before and after | the after value not lower than the before value |
| 2 | **The ONE terminal column reorder at run completion is acceptable to a reader.** RULING 132's accepted cost (6.2). The stability and determinism properties themselves are F20's, not this item's | repo owner | one run with a BLANK, UNPARSEABLE rubric and at least five submissions whose feedback uses different area wording; enter a score on row 1 and keep entering while the run finishes; watch the header at the moment the progress region disappears | the reorder losing the reader's place, or a score landing in the wrong column because the header moved under the cursor. **If it does, RES-FILL-7 is the fallback and it is already specified** |
| 3 | Stop is visibly immediate | repo owner | press Stop mid-run; watch the button and the sentence in the same frame, then watch the terminal sentence appear once the in-flight items settle (up to three, bounded by `TOTAL_BUDGET_MS = 50_000` once, not N times - 7.3) | no visible change on the press, or no terminal sentence after in-flight items settle |
| 4 | A stopped run is distinguishable from a complete one, **including when ZERO rows arrived** | repo owner | read the table after a stopped run; count rows against the class. **Then press Stop again on a fresh run BEFORE the first row lands** - the case B7 was unreachable in | the table reading as complete; the count in the sentence disagreeing with the rows; or nothing at all on screen in the zero-row case |
| 5 | The late full-credit checklist and sample answer do not shift the page under the reader | repo owner | scroll to a row, then wait for tier 2 to land | the reader's row moving on screen when the two panels mount (`GradingResults.tsx:567`, `:578`) |
| 6 | `RubricProvenance` shows on an incremental run | repo owner | one incremental run; look for the "Rubric used" region above the table | absent, or reporting a rubric the run did not grade against |
| 7 | **An arriving row does not disturb in-progress work on an earlier row.** RULING 131's behavioural half; F9 pins the guard's SHAPE and only a walk proves the behaviour | repo owner | on a run of at least five submissions: after row 1 lands, expand its feedback box and type; post row 1 to Canvas; run its code; open Browse-all-files. Then WAIT for rows 2 and 3 | the typed text disappearing, the box collapsing, the "Posted to Canvas" receipt vanishing, the code output clearing, or the files panel closing. **Any one of those is B1 not fixed, and no gate in this repo can see it** |
| 8 | **The whole-run path's widened column set for an unparseable rubric is acceptable.** RULING 134's cost (6.5, 16.7) | repo owner | one WHOLE-RUN zip with a blank or unparseable rubric and at least three submissions whose feedback uses different area wording; compare the table against the same run before the change; then edit one criterion on a row whose total carries no denominator | more columns than the instructor wants to read; or the recomputed total's denominator changing on an edit (`gradingResultsHelpers.ts:398`) in a way the instructor did not intend |

**The flag must not flip on a green suite alone. Items 1, 2, 4, 7 and 8 have no
in-repo instrument of any kind** - not a weak one, none - and **item 7 is the one
whose failure destroys work the instructor has already done**, which is the
replacement for round 1's judgement that item 2 was the worst.

---

## 13. Residual register

Each entry names an OWNER, an INSTRUMENT and the STEP that measures it.
**Missing any of the three it is a deletion, and I would call it that.**

**A residual that is not in `docs/BACKLOG.md` does not exist**
(`docs/DEV_LOOP.md` step 0). **This document does not write `docs/BACKLOG.md`** -
my write set is this one file. Until these thirteen are transcribed there as rows,
they do not exist, and I am naming that rather than assuming someone will.
RES-FILL-7 through RES-FILL-13 are new in round 2.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| **RES-FILL-1** | `runtime-import-graph.test.ts:640-656`'s prose is wrong in three numbers (the build check's M5, which I did not re-open), `:644-646` counts the reconcile edge as "an eleventh direct edge", and `:666-673`'s comment asserts `reconcile.ts` imports `./rubric`, which this design makes false | the implementer of the `reconcile.ts:20` change | `awk 'NR>=638&&NR<=677' src/lib/module-graph/runtime-import-graph.test.ts` read against the post-change tree | the same commit that changes `reconcile.ts:20` rewrites both comment blocks. **A stale comment beside a frozen list is how a `9 -> 10` bump becomes indistinguishable from a silenced guard** |
| **RES-FILL-2** | The `startLockRef` lock is dead on the SYNCHRONOUS whole-run path: the `finally` at `useIncrementalGradingRun.ts:173-180` releases it before `startReview` returns, so two same-render calls both dispatch. The fill neither fixes nor worsens it, and `beginWholeRun` deliberately does NOT claim it | the chunk that next owns `useIncrementalGradingRun.ts` | extend W4-9's press-twice case to a `fdWithoutCanvasUrl()` / non-gemini fixture and assert total dispatches is 1 | before any change that makes the whole-run branch reachable without `disabled={pending}` in front of it. **The fill widens this surface by one entry point** (Auto Grade now goes through `beginWholeRun`), whose guard is A7's `disabled={pending}` |
| **RES-FILL-3** | `gradeSubmissions` (`engine.ts:365-423`) still hand-composes `extractSubmissions` + `decideCollisionRefusal` + `inferFileNameConvention` + `groupSubmissionsByStudent`, which `extractStudentEntries` will now also do. **Understated as written: `2f06261` gave `assignUnclaimedLabel` three call sites, so more than two compositions of overlapping ingestion steps exist** | the chunk that next owns `src/lib/grade/engine.ts` | a frozen-literal oracle over `gradeSubmissions`'s returned `results[].student` for a zip whose filenames need inference, captured BEFORE the consolidation | after the fill ships. **Not inside the fill** - consolidating the engine's ingestion under the same commit that changes student-name derivation would leave no oracle that is independent of the change |
| **RES-FILL-4** | A partial incremental run's `GradingRun` holds only graded rows; a deadline-stopped whole run holds not-attempted rows with empty `rubricAreas`, which `engine.ts:296-298` says switches every counted class-trends clause off. Which behaviour the trends panel should have is undecided, and I measured neither | repo owner, then whoever owns `class-trends.ts` | `toClassTrendsEntry` over two fixtures - one partial incremental run, one deadline-stopped whole run - asserting which clauses fire | at the owner walk in section 12, item 4. **Not a blocker on the flag**: both behaviours are defensible and neither loses a grade |
| **RES-FILL-5** | `gradeAction` pays `generateRubric` (`grading.ts:892`) BEFORE extraction runs inside `gradeSubmissions` (`:912`), so a blank-rubric whole-run zip that is going to be collision-refused pays one model call first. The incremental route's tier-1 ordering avoids it; the whole-run route is NOT reordered here | the chunk that next owns `src/app/actions/grading.ts` | `grading.collisionRefusal.test.ts` with a `callLlm` mock, asserting zero calls for a colliding fixture | after the fill. **Reordering `gradeAction` is a behaviour change to the path every provider uses and it does not belong in a wave whose subject is the other path** |
| **RES-FILL-6** | `RULING 57`'s enumeration of "every producer stamps the rubric pair" lives in a COMMENT (`src/lib/grade/rubric-provenance-stamp.ts:1-18`) and in no test. `rubric-stamp.wiring.test.ts` asserts `gradeEntries`'s BEHAVIOUR (`:72-73`), not the call-site set. So this design's new `stampRubricProvenance` caller in `run-header.ts` is unenforced in both directions. Measured today there are six non-test call sites: `grading-run-mapping.ts:42`, `embedded-grader/discussion.ts:498`, `embedded-grader/index.ts:227`, `engine.ts:360`, `:411`, `:466` | the chunk that next adds a `GradingRun` producer | the comment's own command, `grep -rnE "\)\s*:\s*(Promise<)?GradingRun>?\s*\{" src --include=*.ts \| grep -v "\.test\.ts"`, compared against `grep -rn "stampRubricProvenance" src --include=*.ts \| grep -v "\.test\."` | the fill's commit updates the comment by hand and says it did. **A comment is not an enforcer and this document does not treat it as one** |
| **RES-FILL-7** | **RULING 132's loser: determinism is NOT available DURING the run.** A CSV exported mid-run carries arrival order; the same run exported after completion carries dense order. The alternative the ruling rejected - never normalise on screen, recover determinism only in the export - is specified and buildable | repo owner (it is a reader-experience fork), then whoever owns `incrementalRunPlan.ts` | **F20, with clause (a) re-scoped to `buildCsvContent`'s header instead of the displayed one.** Both functions are pure, so the instrument exists either way | at owner-walk item 2. If the single terminal reorder loses the reader's place, move the normalisation out of `canonicalColumns` and into the CSV path and re-point F20(a). **This is a real fork with a real instrument, not a note** |
| **RES-FILL-8** | **`src/app/actions/grading.ts` is 946 on both counters and `docs/BACKLOG.md`'s RES-W-7 names "greater than 945 at any wave gate" as its failure direction. The file is already ONE LINE over a recorded gate, put there by `2f06261`, before this wave writes anything** | the fill's implementer, at the PRE-CHANGE baseline | `wc -l src/app/actions/grading.ts` AND `@(Get-Content src/app/actions/grading.ts).Count`, both recorded BEFORE the first edit | the baseline run records 946 so the overrun is attributable to `2f06261` rather than to the fill, and the fill's `-le 941` (9.4) is what CLEARS RES-W-7 rather than merely not worsening it. **A wave that fails a pre-existing gate at its own gate and cannot say why is how a clean change gets blamed** |
| **RES-FILL-9** | `reconcile.ts:9-12`'s header ("Imports only ./types and ./rubric ... reconcileRun must stay a pure leaf") and `docs/a39-waves.md:1651` ("imports only `./types` and `./rubric`, **`-le 250`**") both become false with the `:20` import move | the implementer of the `reconcile.ts:20` change | both lines read against the post-change tree; `grep -n "only ./types and ./rubric" src/lib/grade/reconcile.ts docs/a39-waves.md` | the same commit rewrites `reconcile.ts:9-12` to name `./prompts` and the reason (6.4), and appends a dated line to `docs/a39-waves.md:1651`. **Same class as RES-FILL-1, in a file that IS in the write set, which round 1 missed** |
| **RES-FILL-10** | `extraction.ts:130-134`'s contract comment - "Group a submissions zip into per-student entries WITHOUT any LLM call ... Feeds the Embedded Deterministic Engine, which must never depend on a model" - becomes conditional under 9.2, and **no test pins it**: `grep -rn "WITHOUT any LLM\|no LLM call\|never depend on a model" src --include=*.ts` returns comments only | the implementer of the `extraction.ts` change | the grep above, plus `grep -n "inferFileNamesWith" src/app/actions/grading.ts` -> 0 occurrences (the Embedded path never passes it) | the same commit rewrites `:130-134` to "no LLM call unless `inferFileNamesWith` is passed, which the Embedded path never does", and the second grep becomes a clause of F19's file. **The comment is the only statement of the contract, which is why this is an obligation and not housekeeping** |
| **RES-FILL-11** | The seven resets in `GradingResults.tsx:220-230` do NOT fire when `canvasUrl` changes and `run` does not, while the effect at `:235-237` DOES re-persist `edits` under the new url - so one assignment's feedback can be written under another's key. **Pre-existing; RULING 131's construction preserves it bit for bit in both directions and does not create it** | the chunk that next owns `GradingResults.tsx`, after an owner ruling on what SHOULD happen | `gradingResultsHelpers.test.ts` over `gradingResultsEditsKey` and `loadGradingResultsEdits` with two urls and one run object, asserting which key is written | after the fill. **Not inside it** - adding `canvasUrl` to the identity would make the seven resets fire on every keystroke in the Canvas URL field, which is a worse defect than the one it fixes, so this needs a decision and not a patch |
| **RES-FILL-12** | **RULING 134 deliberately breaks W4-1's byte-identity invariant** for the no-parseable-criteria case, and `reconcile.ts:14-17` plus `reconcile.test.ts`'s own header still assert it unconditionally | the implementer of the `reconcile.ts:51-58` change | both comment blocks read against the post-change tree, plus the re-captured literal's provenance line naming the command that produced it | the same commit rewrites both to say the invariant holds for the parseable-criteria case and is superseded for the fallback case, naming RULING 134. **A frozen literal beside a comment claiming an invariant it no longer has is how a silenced guard becomes invisible** |
| **RES-FILL-13** | The incremental route still does not auto-scroll to its results, because the identity-keyed effect (section 10, M6) fires while `results` is empty and the node does not exist. **Unchanged from today, deliberately** | the chunk that next owns `GradingTab.tsx` | none in this repo - the only enforcer would be a render. **Named as instrument-less rather than given a proxy** | at owner-walk item 1, as a note. A first-arrival latch is the fix if the owner wants it; it is not proposed because its only enforcer would be a render |

---

## 14. Disposition of every prior requirement

**The id column in 14.4 was re-derived LAST, after every renumbering in section
11 was final.** A sibling artifact failed that gate twice.

### 14.1 This round's check (`docs/a39-incremental-fill-architecture-check.md`)

| Prior | Disposition |
|---|---|
| **B1** (per-arrival run identity destroys the instructor's work) | **ACCEPTED as the design's actual weakest link, and CLOSED by RULING 131** - section 5.7. The reset becomes conditional on an explicit identity; stability is disproved as unavailable. Measurable half -> F9 (a pure `runResetKey`); behavioural half -> owner-walk item 7. Round 1's section 8 item 9 ("not edited ... the fill needs nothing from it") is **WITHDRAWN as false** |
| **B2** (F5's object is one file; the real guard is pinned by nothing) | **ACCEPTED and CLOSED at repo scope** - section 5.2, 5.6. Round 1's claim that the mount count "is not a proxy for exclusivity; it is exclusivity, restated" is **WITHDRAWN**: true within one `GradingTab`, false for the repo. The requirement is re-scoped to the `editsSurface="canvas"` SET plus the guard text plus the `LiveFeedPanel` ternary -> **F6**, three sub-clauses, three objects. F5 survives as the mount count and claims nothing about exclusivity |
| **B3** (the monotonicity claim is false over an unordered stream) | **ACCEPTED and SETTLED by RULING 132** - section 6.2. Prefix stability during the run (arrival order), determinism at the end (dense order, one normalisation). Round 1's "a union over a monotonically growing arrival set ... can only GROW, never reorder its existing prefix" is **WITHDRAWN**. The loser -> **RES-FILL-7**, with its instrument. Round 1's "no in-repo instrument" for the stability half is **WITHDRAWN** -> **F20** |
| **B4** (the load-bearing justification is factually wrong) | **DECISION KEPT, RATIONALE REPLACED** - section 6.3. Round 1's growing-`overallComment` claim is **WITHDRAWN as unreachable**. The true mechanism is sharper than the check's replacement too: `parsing.ts:45` hardcodes `comment: ""` on every model-parsed area, so `reconcile.ts:79`'s stray fold NEVER FIRES for these rows and the stray's SCORE is dropped silently, with the check's "mis-filed comment" half also unreachable. The constraint it implies - `arrivedRef` holds RAW rows, never projected output - is stated and instrumented -> **F21** |
| **B5** (a NEW route divergence in the blank-rubric column set) | **ACCEPTED as a DEFECT and CLOSED on BOTH routes by RULING 134** - section 6.5. `reconcileRun`'s empty-canonical fallback becomes a union; `unionAreaNames` is the ONE implementation both routes call; at `complete` the two routes produce a byte-identical column set AND order. Round 1's `unionRubricAreaNames` in `incrementalRunPlan.ts` is **WITHDRAWN as a name and a location**. Round 1's 8-item-7 claim that `reconcile.test.ts`'s frozen literal is unaffected is **WITHDRAWN** -> **F23**, RE-CAPTURED by running it; **RES-FILL-12** carries the invariant's supersession |
| **B6** (tier 2 has no failure path, no observer, unspecified merge order) | **ACCEPTED and CLOSED** - section 4.5. Storage is a **ref** (`tier2Ref`), with the reason stated (a `useState` would make the panels flicker on every arrival); a `.catch` is mandatory; `tier2StateRef` makes failure OBSERVABLE and the copy says grades are unaffected; `runIdRef` guards a late landing from a previous run -> **F17**, **F18** |
| **B7** (the terminal sentence cannot render in the case it exists for) | **ACCEPTED and CLOSED** - section 7.2. Round 1's `banner` route is **WITHDRAWN**: the channel is gated by `GradingTab.tsx:545`'s `run.results.length > 0`, the exact condition the sentence must survive. The sentence gets its own region, a sibling of `:472-478`. F12's truth table is completed over all six phases (`stopped` and `refused` were unspecified) -> **F12**, **F13**. `GradingResults.tsx` is not edited for this, which settles the check's three-way ceiling interaction |
| **B8** (`grading.ts` granted with no line budget from a stale baseline) | **ACCEPTED and CLOSED by RULING 133** - section 9.4. Baseline re-measured to 946 on both counters; the bound is **`-le 941`**, derived line by line (-4 zip, -1 Canvas); `gradeAction`'s consumption is specified field by field, it reads two of five and applies NEITHER provenance field, with the double-stamp reason and an instrument -> **F26**. The check's extra finding that the file is already over RES-W-7's own `-le 945` -> **RES-FILL-8** |
| **M1** (every `grading.ts` citation past `:623` stale by +5) | **REPAIRED, and RE-PINNED BY LOCATING THE CONTENT, never by adding 5** - section 4.1's method paragraph and section 17's table. Every `engine.ts` and `extraction.ts` citation was VERIFIED by opening it rather than assumed exact, as instructed |
| **M2** (the fill adds a SECOND import-graph edge; F11 accounts for one) | **ACCEPTED, and DETERMINED FROM SOURCE rather than left to a mutation** - section 6.7. `engineViolationTrails` gives each direct edge its own unshadowed walk (`:692`, comment `:679-681`), so the check's "shared visited set" mechanism does not exist; within one walk `visited` (`runtime-import-graph.ts:221`, `:229-230`) means the first path found wins, in AST source order. **Conclusion: the new `./rubric` import must sit AFTER `extraction.ts:8`'s `../canvas`, and then no trail is added.** That is a design constraint -> **F15 clause 3**. The named mutation stays the wave's FIRST step because this is a reading claim about a traversal I did not run. Round 1's "there is no way to satisfy one half alone" is **WITHDRAWN** |
| **M3** (`use-server-exports.test.ts` already catches the class) | **ACCEPTED** - section 9.3. Its header at `:1-13` is quoted; it is in both gate lists; it is now named as the PRIMARY instrument and `npm run build` as the backstop. Round 1's "it is the only gate that catches" is **WITHDRAWN** |
| **M4** (internal contradiction on `useIncrementalGradingRun.ts`'s bound) | **FIXED** - the bound is `-le 300`, stated once in 9.1, and section 10 does not restate a different number |
| **M5** (tier 1 step 6 drops `getSpeedGraderUrl`'s swallow) | **ACCEPTED as a real defect and CLOSED** - section 4.4, with the full silent-demotion trace (`grading-incremental.ts:117` -> `:136` -> `:139`, and `startReview` at `:148-151` never reading `prepared.reason`) -> **F24** |
| **M6** (the scroll NODE without the scroll TRIGGER) | **ACCEPTED and CLOSED** - section 10's last paragraph. The dependency becomes the run IDENTITY, reusing RULING 131's construction, so the effect fires at most once per run and never per arrival. The honest consequence - the incremental route still does not auto-scroll, unchanged from today - is stated -> **F25**, **RES-FILL-13** |
| **M7** (`buildIncrementalRun`'s `phase` is never read) | **FIXED by making it load-bearing rather than deleting it** - `canonicalColumns` reads `phase` to select the terminal normalisation (6.2). Round 1 published the parameter as vocabulary and never used it |
| **M8** (F14 is self-contradictory) | **ACCEPTED and RESTATED** - **F22**. Two clauses with two objects; last-wins is now WRITTEN DOWN as `incrementalRunPlan.ts:165`'s existing behaviour rather than left for the implementer to invent; and the row says plainly that both inputs are unreachable from the pool and why that is not the B4 class |
| **M9** (`1200ms` has no provenance at the line cited) | **ACCEPTED and REPLACED** - section 4.3. The chain is `engine.ts:288-290` -> `:202` -> `gemini.ts:143`'s `parsePositiveInt(process.env.GRADE_INTER_REQUEST_DELAY_MS, DEFAULT_INTER_REQUEST_DELAY_MS, 0)` -> `gemini.ts:67`'s `1200`. It is a DEFAULT an env var overrides and this checkout has no `.env`, so the deployed value is unknown to me. The leverage argument is restated so it does not depend on the number |
| **M10** (9.3's derivation does not produce 9.3's list; the gate refuses on a missing path) | **ACCEPTED and CLOSED** - section 9.3. Three content greps not five, five structural gates not three, `action-guard-coverage.test.ts` justified by name, the union re-derived at 46 paths with GradingResults.tsx and grade/extraction added, every path checked individually for existence (zero missing), and **TWO lists** - a 46-path BASELINE that runs today and a 47-path GATE - because `paths-gate.ts:42` / `cli.ts:36` refuse with exit 1 before `runVitest` is called |
| **m1** (`reconcile.ts:9-12` and `a39-waves.md:1651` become false) | **ACCEPTED** -> **RES-FILL-9**, with both lines verified |
| **m2** (`extraction.ts:130-134`'s contract becomes false, pinned by nothing) | **ACCEPTED** -> **RES-FILL-10**, with the same search the check ran and the same answer |
| **m3** ("at most `INCREMENTAL_CONCURRENCY - 1 = 2` in flight") | **ACCEPTED and CORRECTED** - section 7.3. Up to THREE, because `:119-120` starts `min(3, n)` workers and the `cancelledRef` check is at the TOP of the loop (`:99`). The conclusion is unaffected |
| **m4** ("Both `GradingTab` mounts") | **ACCEPTED and CORRECTED** - section 5.2 and 5.4 now say "the two `<GradingResults` mounts"; there is ONE `<GradingTab` in the tree (`page.tsx:543`) |
| **m5** (the incremental mount is `:598`, `:597` is the guard) | **ACCEPTED and CORRECTED** in sections 2 and 9.4's neighbourhood |
| **m6** (step 6's `Promise.all` reads as a citation of existing structure) | **ACCEPTED and CORRECTED** - section 4.3 step 6 now says it REPLACES `grading-incremental.ts:71`'s bare await, and 4.4 quotes what `:71` actually is |
| **m7** (the `banner` slot is already occupied) | **MOOT and better than corrected** - B7's fix takes the terminal sentence out of `banner` entirely (7.2), so nothing has to compose with `GradingTab.tsx:583-590`'s conditional. Round 1's "+4 with no shape given" is withdrawn along with the route |
| **m8** (three against six; the column-stability half is not instrument-less) | **ACCEPTED and CLOSED** - section 11's closing note carries ONE number that matches section 12's eight rows, and the column-stability half is **MOVED OUT of the owner walk into F20** |
| **The check's finding on the ORCHESTRATOR's brief** (the "refuses to decide the disambiguated label's copy" item belongs to RULING 129, not to this document) | **CONFIRMED AND IGNORED, on the orchestrator's own instruction.** `grep -n "label\|disambigu" docs/a39-incremental-fill-architecture.md` returned zero lines against round 1, and it was never this document's refusal. No disposition is owed because no requirement existed |

### 14.2 The earlier build check (`docs/a39-wave4-build-check.md`), carried forward

| Prior | Disposition |
|---|---|
| **B1** (six dropped outputs) | **KEPT and WIDENED to ten** - section 4.1, every citation RE-PINNED. Its item 2 is **CORRECTED**: rubric generation is a zip-path-only behaviour (4.2), which this round's check independently confirmed |
| **B1b** (no row for an undispatched ticket) | **HANDED OVER, with its premise corrected.** The engine invariant it cites does not range over the client-assembled display run (7.1) - confirmed by this round's check. The real defect is closed by `describeRunProgress` in its own region (7.2), NOT by a third `stoppedBy` member. The class-trends difference is **RES-FILL-4** |
| **B2** (two tables over one edits surface) | **KEPT, and closed by a CONSTRUCTION plus a GUARD PIN** - F5 makes the in-component class unrepresentable; **F6 pins the guard round 1 left unpinned**; F7 decides precedence; one door (5.4) makes the phase reset unforgettable |
| **B3** (columns sampled from one arrived row) | **KEPT entirely, and its disposition CORRECTED.** Round 1's row said all three downstream consequences "fall out of the one fix"; this round's check showed the fix itself diverged two of the three (B5). Under RULING 134 the sentence is now true - section 6.6 says so and names why it was not |
| **B4** (the refusal instrument cannot fail) | **KEPT, and the fill changes its KIND rather than its strength.** Tier 1 puts a real model-call site (`generateRubric`) inside `prepareGradingRunAction`, so `mockCallLlm` becomes reachable and F2's not-called assertion becomes falsifiable. F4 measures the ordering at the consumer |
| **B5** (the refusal re-enters the paying path) | **ALREADY CLOSED by RULING 118** (`grading-incremental.ts:136-139`, `useIncrementalGradingRun.ts:161-165`), re-verified against the tree. The fill's obligation is not to reopen it: the tier-2 spender is dispatched on `mode: "incremental"` only (F16) |
| **M1** (dead lock on the whole-run route) | **HANDED OVER as RES-FILL-2**, with the fill's own widening of that surface stated |
| **M2** (`cancel()` changes no state, aborts nothing) | **SPLIT.** The invisibility half is KEPT and fixed by the phase transition (7.3). The `AbortController` half is **WITHDRAWN, with the reason**, which this round's check confirmed is principled. The residual latency is owner-walk item 3, with the in-flight count corrected to three |
| **M3** (the frozen literal's provenance) | **NO LONGER OUT OF SCOPE.** Round 1 said `reconcile.test.ts` is untouched; **under RULING 134 the frozen literal CHANGES and must be RE-CAPTURED BY RUNNING IT** (F23), and the invariant it oracles is deliberately superseded (RES-FILL-12). That is the largest scope change round 2 makes |
| **M4** (`classifyItemFailure` discards the file list) | **KEPT, and it is a one-line fix inside this write set**: `incrementalRunPlan.ts:195-196` hardcodes `mergedFileCount: 0` and `submittedFiles: []` while `useIncrementalGradingRun.ts:108-111` holds `request.entry`. Pass `request.entry` and carry both, matching `buildUngradedRow`'s posture at `engine.ts:175-176`. Instrument: **F19**'s second clause |
| **M5** (stale import-graph prose) | **HANDED OVER as RES-FILL-1**, and the fill makes two more of its comments false (`:644-646`, `:666-673`), which is why it is carried rather than left |
| **M6** (silent drop / overwrite in the merge) | **KEPT, and RESTATED as F22** after this round's check found round 1's version self-contradictory |
| **m1** (a WATCHED test that restates its sibling) | **NOT IN SCOPE.** Named here so it is not read as withdrawn |
| **m2** (`previewContent` unbounded in the body) | **NOT IN SCOPE.** `route.ts` is not in the write set (section 8 item 3). The build check established the exposure is request bytes, not model spend |
| **m3** (the whole-zip size gated against the per-item budget) | **NOT IN SCOPE, and the fill does not change it.** `routeGradingRun` (`incrementalRunPlan.ts:120-137`) keeps its conservative client-side check; the real gate stays server-side at `grading-incremental.ts:106-110` |
| **m4** (`raceWithTimeout` mocked, so the budget arithmetic is unasserted) | **NOT IN SCOPE.** `route.ts` untouched |

### 14.3 The wave's own pass conditions

| Prior | Disposition |
|---|---|
| **A5** (`formAction(` exactly two, `:161`) | **CHANGED to exactly ONE, strictly inside a transition** - **F10**. A tightening, not a reversal: RULING 40's own direction was fewer doors. **The same commit must add F6**, because F10 tightens a count on the file where B2 showed the count's object was too narrow |
| **A2** (`formAction(` once inside `handleAutoGrade`'s transition, `:126-136`) | **CHANGED to `beginWholeRun(` once inside that transition** - **F11** |
| **A3** (`setGradingTarget` inside the transition, `setCanvasUrl` outside, `:138-150`) | **KEPT VERBATIM**, and it is F11's WATCHED control: A3 staying green while F11's presence clause goes red proves the handler span is being found |
| **A6** (the `pending` loading region's guard span holds no `\|\|`) | **KEPT VERBATIM, and it is a constraint on the fill.** Verified: `:183`'s `.some(...)` is an EXISTENTIAL over the `source !== "livefeed"` spans, requiring at least one that is conjunctive (`:190`), `\|\|`-free (`:193`) and contains both `styles.loadingState` and `pending` (`:194-195`). The `pending` region (`GradingTab.tsx:268-280`) and the progress region (`:472-478`) **must stay separate siblings**; merging them into `pending \|\| incrementalRunning` leaves no span carrying both literals without a `\|\|` and turns A6 red. **B7's new terminal region contains neither literal, so it cannot satisfy or break the clause** (7.2) |
| **A7** (`disabled={pending}` exactly three in `LiveFeedPanel.tsx`) | **KEPT VERBATIM.** That file is not edited, and A7 remains Auto Grade's own double-press guard (RES-FILL-2) |
| **W4-6a / W4-6b** (the `run-deadline` row writer and the deadline form field) | **KEPT VERBATIM, and the fill adds NEITHER.** Refusing the third `stoppedBy` member (7.2) is what keeps W4-6a at exactly one source line. Both greps must return their pasted sets unchanged at the gate, and must be run BEFORE the wave starts so a difference is attributable |
| **W4-8** (Stop and the progress region precede the first `<GradingResults`) | **KEPT VERBATIM and made meaningful.** Keeping `incrementalRunning` as a derived boolean preserves its `indexOf("incrementalRunning &&")` anchor at `:336`, with one mount "the first" is "the only", and B7's terminal region sits before the mount so both `indexOf`s still precede it |
| **W4-9 / W4-9b / W4-9c** | **KEPT.** W4-9b's `action=`-absent clause is untouched; **W4-9c's budget is restated as a constraint on hook KINDS, not call counts**, verified against the harness at `useIncrementalGradingRun.lifecycle.test.ts:15-47` - which is what permits 4.5(a)'s four refs |
| **W2-7 clause 2** (`RubricProvenance` above `GradingResults`) | **KEPT, and strengthened for free.** `rubricProvenanceLeaf.test.ts:93-101` uses a bare `indexOf("<GradingResults")`, so "before the first" becomes "before the only" with one mount, no edit. This round's check confirmed it (its attack 8) |
| **W4-7** (owner-only time to first row) | **KEPT VERBATIM** as owner-walk item 1 |
| **RES-W4C-1** ("a lighter union of what has arrived") | **WITHDRAWN.** Its own text was already false in the tree - `GradingTab.tsx:595-596`'s comment claims a union while `:601` samples `incrementalResults[0]`. Replaced by section 6, which makes it a defect the fill closes rather than a residual anyone accepts. **The enforcer it protected was nothing - it was a note, not a gate** |
| **RES-W-7** (`grading.ts` took a second writer; `-le 945` at every wave gate) | **INHERITED AND NOW BREACHED, BEFORE THIS WAVE.** The file is 946 on both counters. Not this fill's doing (`2f06261`), and the fill's `-le 941` clears it. **RES-FILL-8** carries the attribution so the overrun is not charged to the wave |
| **RES-W-11, RES-W-12, RES-W-14** (`docs/a39-waves.md` section 12) | **KEPT VERBATIM, unchanged and still owner-only.** The fill touches none of their premises, and their sitting is the same sitting as section 12's |

### 14.4 Round 1's requirement ids, remapped

**Re-derived LAST, after section 11's numbering was final.** Every prior F-id
resolves to exactly one of: the same id, a new id, or a withdrawal.

| Round 1 id | Round 2 | What changed |
|---|---|---|
| F1 | **F1** | nothing |
| F2 | **F2** | the pinned line RE-PINNED from `:882` to `:887` (zip) and `:815` (Canvas); the STRING is unchanged and still present at both |
| F3 | **F3** | nothing |
| F4 | **F4** | nothing |
| F5 | **F5**, and its exclusivity CLAIM -> **F6** | F5 keeps the mount count and now claims nothing about exclusivity (B2) |
| F6 (`selectDisplayRun`) | **F7** | renumbered only |
| F7 (`formAction` one) | **F10** | renumbered only |
| F8 (`beginWholeRun`) | **F11** | renumbered only |
| F9 (`shouldShowEmptyState`) | **F12** | EXTENDED to all six phases; `stopped` and `refused` were unspecified (B7) |
| F10 (client boundary) | **F14** | renumbered only |
| F11 (frozen trails) | **F15** | clause 3 ADDED (the `extraction.ts` import order, M2); "no way to satisfy one half alone" WITHDRAWN; the deep-equal RE-PINNED from `:709-712` to `:703` |
| F12 (tier-2 mode) | **F16** | renumbered only |
| F13 (blank cells, failure at 0) | **F19** | the earlier check's M4 clause folded in |
| F14 (`mergeArrivedResults`) | **F22** | RESTATED; the duplicate-index self-contradiction fixed and last-wins written down (M8) |
| - | **F6** | NEW - the exclusivity guard at repo scope (B2) |
| - | **F8** | NEW - `selectRunKey` totality (RULING 131) |
| - | **F9** | NEW - the run identity (RULING 131) |
| - | **F13** | NEW - the terminal sentence at zero rows (B7) |
| - | **F17** | NEW - tier 2 survives a later arrival (B6) |
| - | **F18** | NEW - a tier-2 rejection is caught and observable (B6) |
| - | **F20** | NEW - prefix stability plus terminal determinism (RULING 132) |
| - | **F21** | NEW - never consume reconciled output (B4) |
| - | **F23** | NEW - the union fallback on both routes, literal re-captured (RULING 134) |
| - | **F24** | NEW - `getSpeedGraderUrl` swallow (M5) |
| - | **F25** | NEW - the scroll trigger (M6) |
| - | **F26** | NEW - `gradeAction` applies no provenance field (RULING 133) |

### 14.5 Withdrawn, with the reason and the enforcer each protected

- **The per-item provenance echo.** `route.ts` will NOT echo
  `rubricUsed`/`rubricFingerprint`. Withdrawn because the header carries them
  once, deterministically, present even if every item fails transport - and an
  echo would need the client to pick one of N and would reintroduce an
  arrival-dependent sample, the exact shape of B3. **Enforcer protected: none
  existed.**
- **`state.warnings` on the incremental route** (item #10 of 4.1). Withdrawn: the
  incremental route produces no warnings and the region at
  `GradingTab.tsx:534-543` stays driven from `state` alone. Recorded so a later
  pass does not read its absence as an oversight. **Enforcer protected: none.**
- **A third `stoppedBy` member.** Withdrawn with the full reason at 7.2.
  **Enforcer protected: W4-6a**, which refusing it keeps intact at exactly one
  source line.
- **An `AbortController`.** Withdrawn with the reason at 7.3. **Enforcer
  protected: none;** the build check's M2 named the absence, not a gate.
- **NEW IN ROUND 2 - round 1's claim that the mount count IS exclusivity.**
  Withdrawn at 5.2 as false at repo scope. **Enforcer protected: nothing yet -
  and that is the finding.** Its replacement is F6, which is the first instrument
  in this design that fires on deleting the `source !== "livefeed" &&` conjunct;
  today nothing does.
- **NEW IN ROUND 2 - round 1's apply-forward rationale** (a growing
  `overallComment`). Withdrawn at 6.3 as unreachable, with the sharper true
  mechanism in its place. **Enforcer protected: none** - it was an argument, not
  a gate. The DECISION it argued for survives and gains F21.
- **NEW IN ROUND 2 - round 1's `unionRubricAreaNames` in `incrementalRunPlan.ts`.**
  Withdrawn as a name and a location at 6.5: under RULING 134 it would be the
  second implementation of one union. **Enforcer protected: none;** the
  replacement, `unionAreaNames` in `reconcile.ts`, is called by both routes and
  is covered by F20 and F23.
- **NEW IN ROUND 2 - round 1's `banner` route for the terminal sentence.**
  Withdrawn at 7.2 because the channel is gated by the condition the sentence
  exists to survive. **Enforcer protected: the claim that `GradingResults.tsx` is
  not edited** - which RULING 131 already overrode for a different reason, so
  nothing is lost by dropping it here too.
- **NEW IN ROUND 2 - round 1's "`reconcile.test.ts`'s frozen literal is
  unaffected".** Withdrawn at 6.5 and at section 8 item 7. **Enforcer protected: W4-1's
  byte-identity oracle**, which RULING 134 deliberately supersedes for the
  fallback case - so the enforcer is not deleted, it is re-captured and its scope
  is rewritten (F23, RES-FILL-12). **That distinction is the whole difference
  between a re-freeze and a disarming.**
- **NEW IN ROUND 2 - round 1's "no in-repo instrument" for column stability.**
  Withdrawn at 6.2: both functions are pure. **Enforcer protected: none - it was
  a gap wearing a principle's clothes**, and F20 is the enforcer it should have
  had.
- **NEW IN ROUND 2 - round 1's "there is no way to satisfy one half alone" for
  the frozen trail.** Withdrawn at 6.7: I did not run either mutation and neither
  did the check, so the claim was not mine to make. **Enforcer protected: the
  deep-equal at `:703`, which is unchanged** - only the claim about its behaviour
  under two unrun mutations is withdrawn.

---

## 15. The flag's flip condition

`INCREMENTAL_ROUTE_ENABLED` (`incrementalRunPlan.ts:99`) goes to `true` when
**all three groups** below hold. Not two of three.

**GROUP A - checkable in this repo, by command:**

1. `[...src.matchAll(/<GradingResults(?=[\s/>])/g)].length === 1` for
   `GradingTab.tsx` (F5).
2. **The `editsSurface="canvas"` file set is exactly `GradingTab.tsx` and
   `LiveFeedPanel.tsx`, the surviving mount's guard text is conjunctive on
   `source !== "livefeed"` with no `||`, and `<LiveFeedPanel` is immediately
   governed by the `source === "livefeed"` ternary test (F6).** Round 1 did not
   have this condition and it is the one whose absence lets B2 return green.
3. `grep -c "incrementalResults\[0\]" src/app/components/GradingTab.tsx` -> 0.
4. `grep -c "fullCreditChecklist: \[\]" src/app/components/GradingTab.tsx` -> 0.
5. `[...src.matchAll(/formAction\(/g)].length === 1` for `GradingTab.tsx`, inside
   a `startTransition(` span (F10).
6. `grep -n "normalizeAreaName" src/lib/grade/reconcile.ts` shows the import
   resolving to `./prompts`;
   `grep -c "lib/grade/reconcile.ts -> lib/grade/rubric.ts" src/lib/module-graph/runtime-import-graph.test.ts`
   -> 0; and the `./rubric` import in `extraction.ts` appears at a line number
   GREATER than its `../canvas` import (F14, F15).
7. `grep -n "sectionRef=" src/app/components/GradingTab.tsx` -> exactly one
   occurrence, on the one mount (item #8).
8. `grep -n "inferFileNamesWith\|inferFileNameConvention" src/app/actions/grading-incremental.ts src/lib/grade/extraction.ts`
   shows the inference reached from the incremental prep (item #9), and
   `grep -c "inferFileNamesWith" src/app/actions/grading.ts` -> 0 (the Embedded
   path never passes it, RES-FILL-10).
9. **`grep -c "rubricUsed\|rubricFingerprint" src/app/actions/grading.ts` -> 0
   (F26).**
10. `grep -c "run !== prevRun" src/app/components/GradingResults.tsx` -> 0, and
    `runResetKey(` appears exactly once there (F9 clause 2).
11. F1 through F26 green, each having been WATCHED red first. **F23 in
    particular: `reconcile.test.ts` must be seen RED after the fallback change
    and BEFORE the literal is re-captured, and the re-capture must name the
    command that produced it.**
12. `npm run test:paths -- <the 47-path GATE list>` all `COVERED`, exit 0;
    `npm test` zero failed, exit 0; `npx tsc --noEmit --incremental false`
    silent; `npm run build` prints `Compiled successfully`. **And the 46-path
    BASELINE list was run BEFORE the wave's first edit, with 946 recorded for
    `grading.ts` (RES-FILL-8).**
13. Every 9.1 bound held on BOTH counters, in particular
    `GradingTab.tsx <= 620`, **`grading.ts <= 941`** and
    `GradingResults.tsx <= 920`.
14. `useIncrementalGradingRun.ts`'s `from "react"` import names exactly `useRef`
    and `useState` (W4-9c).
15. W4-6a returns exactly one line and W4-6b exactly five, unchanged, with both
    canaries behaving - and both run BEFORE the wave so a difference is
    attributable.

**GROUP B - not checkable here, and the flag does not flip without it:**

16. **All eight owner-walk items of section 12, performed**, with items 2, 7 and
    8's results stated in words. **Items 1, 2, 4, 7 and 8 have no in-repo
    instrument of any kind. A green Group A says nothing about them, and this
    document forbids reading it as though it did.** Item 7 is the one whose
    failure destroys work the instructor has already done.

**GROUP C - the transcription:**

17. RES-FILL-1 through RES-FILL-13 present as rows in `docs/BACKLOG.md`. A
    residual that is not there does not exist, and the flag flipping on a design
    with thirteen untracked residuals is how the next round inherits a silence.

**How the flag flips, mechanically.** `INCREMENTAL_ROUTE_ENABLED` stays a
module-private constant, not an environment variable, for the reason
`docs/ruling-116.md:55-58` and `incrementalRunPlan.ts:95-97` both give: an env
read lets the default vary by deployment while a shape question is open. The flip
is a one-line source change in the commit that satisfies Group A, gated on Group
B being done first. And `incrementalRunPlan.test.ts` today contains assertions
that the flag is off and that every request routes `"whole-run"` - the check
verified all three exist, at `incrementalRunPlan.test.ts:54`, `:58` and `:77` -
**so those three assertions are part of the flip commit's write set, not
collateral damage to be discovered at the gate.**

---

## 16. Consequences of the fill, and of the four rulings

The decision is settled and the rulings are settled. These are their costs,
stated because a consequence nobody named is a consequence nobody priced. Items
1 to 6 are the fill's own; items 7 to 11 are the rulings'.

1. **Two owned assertions change, and one of them is a ruling's own pin.** A5
   goes from two `formAction(` occurrences to one, and A2 stops mentioning
   `formAction` at all (5.4). RULING 40's pin was chosen to make the double spend
   visible; the fill makes it stricter, but a reader who remembers "exactly two"
   will see the change and must be told it is intentional. **And the same commit
   must add F6**, or it tightens a count on the file where the count's object was
   just shown to be too narrow.

2. **The fill touches `src/app/actions/grading.ts`, the whole-run path.** That was
   not obviously part of "fix the incremental route". It is unavoidable: leaving
   `gradeAction`'s inline rubric-generation and blank-instructions logic in place
   while `prepareGradingRunAction` grows its own copy creates two owners for one
   decision, which is the same class of defect as the two surfaces the fill exists
   to merge. The file is at **946** of 1000, the change takes it to **941**, and
   the blast radius is the 46-path owns list (9.3). There is no end-to-end oracle
   over `gradeAction` for the extraction - only F1/F2/F3/F26 on the extracted
   function plus four existing `gradeAction` test files and a line-by-line diff
   argument. **Round 1 called this the design's weakest link; it is not** (section
   11's closing note), and the three that are weaker are named there.

3. **Student names change on the incremental route, and that is the FIX, not a
   side effect.** Item #9: the incremental route currently derives student names
   without the LLM filename-convention inference that the whole-run Gemini zip
   path uses (`extraction.ts:149` passes `undefined` where `engine.ts:390-396`
   passes a real lookup - both citations re-verified). Closing it means the
   incremental route's student strings will differ from what it produces TODAY -
   which matters because `result.student` is the persisted-edits key
   (`loadGradingResultsEdits`, `GradingResults.tsx:202`, `:222`). Any edits saved
   against an incremental run made with the flag flipped on locally would not be
   found again. The flag is off in every environment, so no shipped run is
   affected; anyone who flipped it by hand has orphaned edits. **The alternative -
   leaving #9 open - is a route that grades the same submission under a different
   student name than the route beside it**, which is the one failure mode in this
   document that puts a wrong name on a real grade. The check adds a narrowing
   worth recording: `2f06261` wired `disambiguateCanvasEntries` at three Canvas
   sites, so the two CANVAS routes now agree on display names and the zip-path
   divergence is the ONLY remaining naming divergence between the routes.

4. **The full-credit checklist and the sample answer arrive LATE on the
   incremental route** (4.3, tier 2), after rows are already on screen, where
   today they arrive with the whole table at once. Visible change to how the page
   settles; owner-walk item 5. It is the price of not putting two model calls on
   the critical path, and tier 2 is the named cut if the owner would rather not
   have it. **New in round 2: if tier 2 FAILS, the instructor now gets a sentence
   saying so and saying grades are unaffected** (4.5b) - round 1 would have given
   them silence and an unhandled promise rejection.

5. **A CSV exported MID-RUN and the same run exported AFTER it completes can
   carry different column ORDERS.** Arrival order during the run, dense order
   after (6.2). Same members either way. This follows directly from RULING 132 and
   is RES-FILL-7's fork if the owner would rather not have it.

6. **Stop still cannot be instant, and up to THREE items are in flight, not two.**
   The button and the sentence change on the press, but the terminal count cannot
   be final until in-flight items settle, bounded by `TOTAL_BUDGET_MS = 50_000`
   (`route.ts:38`) once rather than N times because they settle in parallel. The
   fill refuses to shorten that by aborting, because aborting throws away a grade
   that has already been paid for (7.3).

7. **RULING 132 AND RULING 134 TOGETHER FORCE A BEHAVIOUR CHANGE ON THE WHOLE-RUN
   PATH AND A RE-CAPTURE OF W4-1'S FROZEN ORACLE. This is the largest consequence
   in this document and the owner will not have expected it.** The chain, in four
   steps, each of which is forced by the previous one:
   - RULING 134 says one column behaviour on both routes: union, or
     richest-single-result.
   - Richest-single-result on the incremental route means the canonical set is the
     richest ARRIVED row's areas, which can be REPLACED wholesale as richer rows
     land - columns appearing, disappearing and reordering mid-run. **RULING 132
     forbids exactly that.** So richest-on-both is unavailable.
   - Therefore the union applies on both routes, which means `reconcileRun`'s
     empty-canonical fallback at `reconcile.ts:51-58` changes for the WHOLE-RUN
     path too.
   - `reconcile.test.ts:110-146` is W4-1's frozen literal and its fixture is
     precisely the unparseable-rubric case. It goes RED. It must be re-captured by
     RUNNING the fixture, and `reconcile.ts:14-17`'s own invariant ("byte-identical
     to what the old inline block produced") is deliberately superseded for that
     branch.

   **What the instructor sees on the whole-run path:** for a blank or unparseable
   rubric, MORE columns - the union over all students rather than one student's
   areas - with a blank editable cell wherever a student lacks an area. Fewer
   strays are silently dropped, which is the improvement. And one narrow numeric
   effect, measured: `gradingResultsHelpers.ts:384-386` sets
   `everyHasDenom = false` on a blank score, and `:398` is
   `parseDenominator(currentTotal) ?? (everyHasDenom ? denomSum : null)` - so
   `currentTotal` takes precedence and nothing changes for a row whose total
   already reads `"17/20"`. **The effect is confined to a row whose current total
   carries NO parseable denominator: there, editing a criterion used to produce
   `earned/denomSum` and will now produce bare `earned`.** Owner-walk item 8.

   **The cheapest honest alternative, if the owner does not want to pay this:**
   accept a recorded divergence instead of parity, i.e. union on the incremental
   route and richest on the whole-run route, with a residual naming which route is
   right. RULING 134 explicitly rules that out - "the fallback divergence is a
   DEFECT, not parity" - so it is not proposed, only priced.

8. **RULING 132's terminal normalisation is itself one column reorder under the
   reader**, at run completion, plausibly while the instructor is entering scores
   on row 1 (6.2). The ruling buys never-during-the-run at the price of
   once-at-the-end. Owner-walk item 2; RES-FILL-7 is the fallback and is already
   specified with its instrument.

9. **RULING 131 makes `GradingResults.tsx` a write-set file, which round 1 had
   promised it would not be.** The cost is small in lines (about +3 there, +8 in
   `gradingResultsHelpers.ts`, 906 -> 909 against 1000) and larger in blast
   radius: `GradingResults.tsx` is read as source text by four owned test files
   and imported by three components, and the owns list grew from 33 paths to 46
   partly because of it. **The benefit is that the feature works at all** - built
   as round 1 specified, the instructor cannot type in row 1 while row 2 lands.

10. **RULING 131's construction preserves a pre-existing gap it does not fix.**
    The seven resets do not fire on a `canvasUrl` change with an unchanged run,
    and they did not before either (5.7 axis 2). RES-FILL-11 names it and says
    plainly why patching it inside this fill would be worse: adding `canvasUrl` to
    the identity makes the resets fire on every keystroke in the Canvas URL field.

11. **RULING 133's header shape means one of its two callers ignores three of its
    five fields.** `gradeAction` reads `effectiveRubric` and `generatedRubric` and
    must apply neither provenance field nor `criteriaNames` (9.4). That is not
    waste: the incremental route needs all five because it has no engine to stamp
    for it. But it means the seam is shaped for one caller, and a reader of
    `gradeAction` alone will wonder why three fields exist. The answer belongs in
    `run-header.ts`'s doc comment - and NOT in a `grading.ts` comment, because
    F26's instrument reads 0 as the pass and a comment naming either field turns
    it red.

**Nothing in either round's design work suggested the fill is the wrong call.**
Three things tested it and all three came out in its favour: making
`prepareGradingRunAction` resolve the run header is what turns the build check's
B4 from an unfalsifiable assertion into a real one (14.2); collapsing to one
mount is what turns `rubricProvenanceLeaf.test.ts:93-101` from an accidental pass
into a real claim; and RULING 134's forced convergence is what makes the two
routes provably agree on columns rather than agreeing by coincidence. A second
surface would have preserved all three weaknesses permanently. **The check's own
verdict on the feature-already-exists question stands: every piece the fill
"adds" already exists on the whole-run path, so the fill's job is REACHABILITY,
not capability, and the surface is a layer.**

---

## 17. What I could not determine, and the re-pin table

### 17.1 Stated rather than filled in

- **Every millisecond claim.** No API key, no network (`vitest.setup.ts` throws on
  any real `fetch`). Section 4.3 counts model calls on the critical path because
  that is countable; it does not convert them to time. **And the whole-run
  spacer's deployed value is unknown to me**, because `gemini.ts:143` reads
  `process.env.GRADE_INTER_REQUEST_DELAY_MS` and this checkout has no `.env` -
  1200 is only the default at `gemini.ts:67`. W4-7 owns the time.
- **Everything the instructor sees.** No component renders under this vitest.
  Every rendering claim here is a reading claim and section 12 routes the eight
  that matter to an owner. That includes all three of F6's, F9's and F13's
  behavioural halves: the source-text and pure-function clauses are the strongest
  instruments the environment admits, and they are not the behaviour.
- **Whether `npx tsc --noEmit` and `npm run build` pass on the design.** Not run -
  single-caller resources. Every type-level claim here is a reading claim, chiefly
  that `GradingRunHeader`/`GradingRunTier2` in `types.ts` are reachable from a
  client leaf because `types.ts:1` is a type-only import. **I confirmed the
  premise and not the conclusion**, exactly as the check did.
- **Whether adding `extraction.ts -> ./rubric` produces a new `FROZEN_TRAILS`
  entry.** Section 6.7 DERIVES the answer from `walkRuntimeGraph`'s own code
  (`:221`, `:229-230`, `:246`, `:250-253`) and `engineViolationTrails`'s
  per-direct-edge walks (`:682-698`) and concludes no new trail if the import sits
  after `:8`'s `../canvas`. **That turns on `scan.edges` being in AST source
  order, which I read from `scanRuntimeEdges` (`:44-46`, `:79+`) rather than
  measured.** So M2's named mutation stays the wave's FIRST step, with both
  predictions written down so either can be falsified cheaply.
- **Whether `class-trends.ts` behaves better or worse over a partial run.**
  RES-FILL-4; I read `engine.ts:296-298`'s comment and did not measure the code it
  describes.
- **Whether the re-captured frozen literal in `reconcile.test.ts` will hold
  exactly the three values 6.5 predicts.** I did not run it. The prediction is
  written down precisely so that a MISMATCH is informative rather than
  accommodated, and F23 requires the value to come from the run rather than from
  this document.
- **The exact post-change line counts.** Sections 9.4 and 10's deltas are
  estimates with their derivation shown. The implementer measures both counters at
  the gate.
- **Whether `GradingResults.tsx` at 909 is safe for the NEXT change.** The fill
  adds about three lines, so the question moves rather than resolving. 91 lines of
  headroom is not much and the next feature that needs a column will find that
  out.

### 17.2 Every citation re-pinned in round 2, with how I located it

**No re-pin in this table was computed by adding an offset.** Round 1's
`grading.ts` citations were all stale by +5 after `2f06261`, and an offset is
exactly how two re-pins went wrong elsewhere today.

| Round 1 | Round 2 | How located |
|---|---|---|
| `grading.ts:743` `getSpeedGraderUrl` | **`:748`** | `grep -n "getSpeedGraderUrl" src/app/actions/grading.ts` -> `:9`, `:627`, `:748`; `:748` opened and read with its `.catch` and its comment at `:746-747` |
| `grading.ts:767` `gradeAction` run production | **`:735-925`** region; the Canvas branch opens at `:745` | `grading.ts:740-929` read in full |
| `grading.ts:810` Canvas blank-instructions refusal | **`:814-816`** | `grep -n "Please provide assignment instructions" src/app/actions/grading.ts` -> `:815`, `:887`; the enclosing `if` read at `:814` |
| `grading.ts:812` "No rubric synthesis on the Canvas path" | **`:817-818`** | `grep -n "No rubric synthesis" src/app/actions/grading.ts` -> `:817`; the sentence continues at `:818` |
| `grading.ts:816-817` checklist + sample answer (Canvas) | **`:819-823`**, the `Promise.all`; checklist `:821`, sample answer `:822` | `grep -n "sampleAnswer\|synthesizeFullCreditChecklist" src/app/actions/grading.ts`, then the block opened |
| `grading.ts:854` embedded zip branch | **`:859`** | `grep -n "extractStudentEntries" src/app/actions/grading.ts` -> `:4`, `:859` |
| `grading.ts:882` zip blank-instructions refusal | **`:886-888`** | same grep as the Canvas refusal; `:885` is the `// Gemini path.` comment |
| `grading.ts:885-888` `effectiveRubric` block | **`:890-893`** | `grep -n "effectiveRubric" src/app/actions/grading.ts` -> `:640`, `:643`, `:890`, `:893`, `:903-905`, `:912-914`; `grep -n "generateRubric"` -> `:4`, `:642`, `:892` |
| `grading.ts:907-909` the grading `Promise.all` | **`:911-915`** | the `effectiveRubric` grep above, then the block opened; note `:902-906` is a THIRD site round 1 did not mention, the single-non-zip-file branch |
| `grading.ts:637` the other `generateRubric` caller | **`:642`**, inside `gradeOneSubmissionAction`'s own `effectiveRubric` at `:640-643` | the `generateRubric` grep above |
| `runtime-import-graph.test.ts:709-712` the deep-equal | **`:703`** | `grep -n "expect(trails).toEqual(FROZEN_TRAILS)"` -> `:703` |
| `runtime-import-graph.test.ts:645-657` the stale prose | **`:638-656`**, and `:644-646` is the "eleventh direct edge" sentence | the region read in full; `grep -n "const FROZEN_TRAILS"` -> `:657`, `];` at `:676` |
| `GradingTab.tsx:597` "the incremental mount" | **`:598`** the element; `:597` is the guard | `grep -rn "<GradingResults" src --include=*.tsx`, then `:595-615` opened |
| `GradingResults.tsx:152-153` the `banner` prop | **`:153`** the declaration, `:152` its doc comment, **`:541`** the render | `:140-193` opened |
| `engine.ts` - all citations | **ALL EXACT, VERIFIED NOT ASSUMED** | `engine.ts:280-410` opened: `:288-290` the spacer, `:293-303` the invariant, `:296-298` the class-trends clause, `:310-341` the two not-attempted tails, `:350` `reconcileRun`, `:360` `stampRubricProvenance`, `:365-423` `gradeSubmissions`, `:372-375` its four dynamic imports, `:390` `inferFileNameConvention`, `:391-396` the grouping call |
| `extraction.ts` - all citations | **ALL EXACT, VERIFIED NOT ASSUMED** | `extraction.ts:1-30` and `:126-170` opened: `:1-14` the import block (no `./rubric`), `:130-134` the contract comment, `:135` the definition, `:145-148` the collision refusal, `:149` `groupSubmissionsByStudent(submissions, undefined, rawData, zipParents)`, `:157-169` `extractCanvasEntries` |
| `reconcile.ts` - all citations | **ALL EXACT** | the whole 106-line file opened: `:9-12` the header constraint, `:14-17` the invariant, `:20` the import, `:38-44` the idempotence caveat, `:50-58` the richest fallback, `:60-87` the projection, `:76` the blank push, `:79-84` the stray fold, `:89-103` the two `rubricAreaNames` branches |
| `useIncrementalGradingRun.ts` - all citations | **ALL EXACT** | the whole 192-line file opened: `:1` `"use client"`, `:19` the react import, `:79-80` the two refs, `:88-90` `cancel`, `:92-121` the pool, `:93` the local `arrived`, `:99` the cancel check, `:100-102` the cursor, `:104-112` the isolation, `:106` the push, `:119-120` the worker count, `:127-128` the lock, `:133-136` / `:148-151` / `:161-165` the three branches, `:171-180` the try/catch/finally |
| `incrementalRunPlan.ts` - all citations | **ALL EXACT** | `:24-40` and `:85-199` opened: `:26` `INCREMENTAL_CONCURRENCY = 3`, `:37` the byte budget, `:99` the flag, `:120-137` `routeGradingRun`, `:143-152` `buildRunItemRequests`, `:160-173` `mergeArrivedResults`, `:165` the bare `set`, `:168` the dense loop, `:183-199` `classifyItemFailure`, `:192` `rubricAreas: []`, `:195-196` the hardcoded file list |
| `grading-incremental.ts` - all citations | **ALL EXACT** | `:36-141` opened: `:42` the prefix, `:58-59` the guard, `:71` the bare `await extractCanvasEntries`, `:91` the `extractStudentEntries` call, `:95-110` the two checks, `:112` the tickets, `:117-140` the catch, `:136-139` the refusal routing |
| `autoGradeTransition.wiring.test.ts` - all citations | **ALL EXACT** | `:100-200` and `:300-350` opened: `:99-100` the two source readers, `:103-115` the HANDLER and TXN spans, `:126-136` A2, `:138-150` A3, `:159-172` A5 with `:161`'s `toBe(2)`, `:174-199` A6 with `:183`'s `.some`, `:190` the regex pair, `:193` the `\|\|` clause, `:194-195` the two literals, `:334-343` W4-8 |
| NEW in round 2 | `parsing.ts:30-47`, `:42-46` the hardcoded `comment: ""` | `grep -n "toRubricAreaResult"`, then the function opened. **Not taken from `reconcile.test.ts:102-108`'s comment, which says the same thing** |
| NEW in round 2 | `gradingResultsHelpers.ts:364-400` `recomputeTotal`, `:384-386` the blank-score branch, `:398` the denominator precedence | `grep -n "export function recomputeTotal" -A 22`, then `:386-400` opened |
| NEW in round 2 | `paths-gate.ts:42`, `cli.ts:36`, `cli.ts:43` the refusal-before-run | `grep -n "PRE-CHECK\|problems" src/tools/vitest-paths/*.ts` |
| NEW in round 2 | `runtime-import-graph.ts:217-277` the walker, `:221` `visited`, `:229-230` the early return, `:246` the edge loop, `:250-253` violation-or-recurse; `:44-46` `scanRuntimeEdges`' AST construction | `grep -n "export function walkRuntimeGraph" -A 60` and `-A 40` on `scanRuntimeEdges` |
| NEW in round 2 | `reconcile.test.ts:53-147` the frozen-literal case, `:110-146` the literal, `:136` `FROZEN_AREA_NAMES` | `grep -n "richest\|FROZEN"`, then the case opened |
| NEW in round 2 | `use-server-exports.test.ts:1-13` its own statement of the class it catches | `sed -n '1,20p'` |
| NEW in round 2 | `docs/a39-waves.md:1038` (`grading.ts` `-le 945`), `:1651` (reconcile's import constraint) | `grep -n "le 945" docs/a39-waves.md`; `sed -n '1649,1653p'` |
| NEW in round 2 | `docs/BACKLOG.md`'s RES-W-7, "greater than 945 at any wave gate" | `grep -an "a39" docs/BACKLOG.md` |
| NEW in round 2 | `utils.ts:452-455` `groupSubmissionsByStudent`'s optional second parameter | `grep -n "export function groupSubmissionsByStudent" -A 8` |
| NEW in round 2 | `prompts.ts:19` `normalizeAreaName`'s definition; `rubric.ts:442` its re-export | `sed -n '15,25p' src/lib/grade/prompts.ts`; `sed -n '440,444p' src/lib/grade/rubric.ts` |
| NEW in round 2 | the six non-test `stampRubricProvenance` call sites (RES-FILL-6) | `grep -rn "stampRubricProvenance" src --include=*.ts \| grep -v "\.test\."` |

### 17.3 One place a ruling's premise needed correcting, and one place the check did

Both are reported rather than silently absorbed, per the instruction to refuse a
ruling I can disprove.

- **RULING 131's framing offers "what makes the results object STABLE across
  arrivals" as one of two live options. It is not a live option, and section 5.7
  disproves it rather than declining it**: any construction that keeps `run`
  referentially stable across arrivals also stops the table from showing the new
  row, which is the feature. The ruling's second option is taken and the first is
  shown to be unavailable, which is a stronger answer than choosing between them.
  Nothing else in the ruling is affected.
- **The check's B4 replacement rationale is half unreachable.** It says the
  stray's "comment text stays permanently mis-filed in `overallComment`".
  `parsing.ts:42-46` hardcodes `comment: ""` on every model-parsed area, and
  `reconcile.ts:79` folds only strays whose `comment.trim()` is non-empty, so for
  the rows this route produces the fold never fires and there is no mis-filed
  comment. The command that shows it:
  `grep -n "toRubricAreaResult" -A 18 src/lib/grade/parsing.ts`, reading `:45`.
  The check's other half - the score is destroyed - is correct and is the whole
  mechanism, which makes the argument for recomputing from raw stronger, not
  weaker (6.3).
- **The check's own line count is stale.** It reports itself as 906 lines; both
  counters say 920. Recorded in section 0. Nothing depends on it.




