# A16 wave 2, as-built verification of `cbe84e2`

I did not build this. I read `docs/a16-plan.md` sections 5.4, 5.5, 5.5.1, 5.5.2
and 9.3, `docs/a16-rulings.md`, the shipped diff and the four source files as
they now stand, then executed the nine sabotages the plan names and attacked
the result independently.

**Headline.** All nine sabotages go red, and every one of them is killed by the
assertion the plan names for it - no mutant here is wearing a kill it did not
earn. The builder's own P21 disclosure is accurate, and I reproduced the weak
form to prove it. **Seven fresh mutations survive every gate in this repo**
(`npx tsc --noEmit` exit 0, `npm run lint` at the 4-warning baseline,
`npm test` 22066/22066), and three of them reproduce, in a form no shipped
instrument can see, exactly the failures this row spent the day closing: the
panel never rendering, the disclosure line never appearing correctly, and a
live control's value landing in the wrong entry-meta field.

---

## 0. What this verification CANNOT establish

Stated first, because several of the findings below are bounded by it.

- **No component is rendered by any test in this repo.** vitest is
  `environment: "node"` and collects only `src/**/*.test.ts`
  (`docs/loop/this-repo.md` section 2). So **that the trends panel appears
  beside the run, that `defaultExpanded` opens it, that the disclosure line is
  legible, and that either vanishes on reload are READING CLAIMS.** I did not
  execute them and nothing in this row does. Every "the panel renders / does
  not render" statement below is a statement about the source expression that
  controls it, not an observation of a DOM.
- **`handleGradeAll` is executed by nothing.** The panel is imported only by
  `RecordingTab.tsx` (a `.tsx`), and `.test.tsx` is not collected. Every claim
  about capture timing, the three clear branches, and the argument passed to
  `buildRunCohort` rests entirely on the source-text pins in
  `GradingRecordingPanel.wiring.test.ts`. That is the plan's own ruling 19
  position and it is correct; it is also the reason the survivors in section 5
  exist.
- **No live database, no API keys, no network.** `gradeCapturedSubmissionsAction`
  was never invoked. That the action's `results` array really arrives carrying
  the `id` the join needs is a TYPE-and-source claim (section 6), not a measured
  round trip.
- **I did not exercise `ClassTrendsPanel` itself.** Its behaviour on a
  non-trendable entry is read from `ClassTrendsPanel.tsx:136`, not observed.

---

## 1. Measurements

Every number names the command that produced it. Run from the repo root on
2026-09-21 at `cbe84e2`, working tree clean apart from the exempt
`docs/css-orphans.md`.

| Quantity | Value | Command |
|---|---|---|
| `GradingRecordingPanel.tsx` | **990** | `@(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count` |
| same, second instrument | **990** | `wc -l src/app/components/grading-recording/GradingRecordingPanel.tsx` |
| ceiling headroom | **10** | `LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:30`, compared `lineCount > limit` at `:129`; `grep -c "GradingRecordingPanel" src/file-size-ceiling.structure.test.ts` returns **0**, so no `ALLOWED_OVERAGE` entry covers it |
| panel at `a0cdb71` (pre-wave-1) | 966 | `git show a0cdb71:<panel> \| wc -l` |
| panel at `61b229f` (post-wave-1) | **918** | `git show 61b229f:<panel> \| wc -l` |
| wave 2's net addition to the panel | **+72** | 990 - 918, both from the command above |
| panel comment lines now | **339** | `grep -c "^\s*\(//\|/\*\|\*\|{/\*\)" <panel>` |
| panel comment lines at `61b229f` | **305** | same command over `git show 61b229f:<panel>` |
| `classTrendsRunCohort.ts` | 181 | `@(Get-Content ...).Count` |
| `classTrendsRunCohort.test.ts` | 284 | `@(Get-Content ...).Count` |
| `GradingRecordingPanel.wiring.test.ts` | 577 | `@(Get-Content ...).Count` |
| the four wave-2 test files | **4 files / 93 tests passed** | `npx vitest run <the four paths> 2>&1 \| tr -d '\000'` |
| `classTrendsRunCohort.test.ts` alone | 22 tests | same, one path |
| `GradingRecordingPanel.wiring.test.ts` alone | 49 tests | same, one path |
| whole suite | **1095 files / 22066 tests passed** | `npm test` |
| typecheck | **no output, exit 0** | `npx tsc --noEmit` |
| lint | **4 problems, 0 errors, 4 warnings** | `npm run lint` |
| build | `Compiled successfully in 17.3s`, then exit 1 in the prerender tail as documented | `npm run build 2>&1 \| Select-String "Compiled successfully"` |
| `  return (` at 2-space indent in the panel | exactly **1**, at `:694` | `grep -n "^  return (" <panel>` |
| `://` anywhere in the panel | **0** | `grep -c "://" <panel>`; canary `grep -c "styles\." <panel>` returns **18**, so the instrument fires and the zero is real |

**Restore integrity.** Every mutation was applied to a `cp` backup pair in the
session scratchpad and restored from it - never `git checkout --`. After all
work, each of the four touched source files is byte-identical to `HEAD`:

```
git show HEAD:<path> | sha1sum   vs   sha1sum < <path>      -> OK on all four
git status --short                                          ->  M docs/css-orphans.md
```

and the four-file run returns the same **4 files / 93 tests** it returned
before any mutation, which is the plan's own step-5 check that the restore was
clean.

---

## 2. The nine sabotages: verdicts and attribution

Procedure per row: mutate the IMPLEMENTATION only, run
`npx vitest run` over the four wave-2 test paths piped through `tr -d '\000'`,
record which assertion fired, restore from the `cp` backup. **P16 is run three
times, once per branch**, because the plan's whole claim for that row is that
deleting exactly one clear is detectable - a single run would only have proved
that deleting one of three is detectable, which is a weaker statement.

| # | Mutation applied | Result | Assertion that fired | Is that the assertion the plan names? |
|---|---|---|---|---|
| **P13** | `buildRunCohort(result.results, ...)` -> `buildRunCohort(gradingRows.rawRows, ...)`, panel `:641` | **RED**, 1 failed / 92 passed | wiring > "GradingRecordingPanel.tsx's buildRunCohort call passes THIS RUN'S results (B1, closes P13)" > *"the first argument is result.results, never gradingRows.rawRows or gradingRows.rows"* | **Yes** - 9.3's "THE FIRST ARGUMENT IS THIS RUN'S RESULTS" row, and nothing else fired |
| **P14** | `const student = match.studentName` -> `const student = ""`, leaf `:113` | **RED**, 4 failed / 89 passed | leaf > "the positive identity row" > *"every emitted result's student equals the identity row's studentName, on a distinctive value"* | **Yes** - 9.3's "THE POSITIVE IDENTITY ROW". See the collateral note below |
| **P15** | identity projection `assessment: r.assessment` -> `assessment: assessmentId`, panel `:592` | **RED**, 1 failed / 92 passed | wiring > *"the per-row assessment property reads r.assessment, never assessmentId or assessmentLabel"* | **Yes** - 9.3's "THE PROJECTION NAMES `assessment`" row |
| **P16a** | delete `setLastRunCohort(null)` from the `if (!readiness.ok)` block, panel `:574` | **RED**, 1 failed / 92 passed | wiring > *"the readiness refusal (which returns BEFORE the run starts) clears lastRunCohort"* | **Yes**, and specifically the readiness branch's own row |
| **P16b** | delete it from the `if ("error" in result)` block, panel `:605` | **RED**, 1 failed / 92 passed | wiring > *"the \"error\" in result branch clears lastRunCohort"* | **Yes**, that branch's own row |
| **P16c** | delete it from the `catch`, panel `:649` | **RED**, 1 failed / 92 passed | wiring > *"the catch branch clears lastRunCohort"* | **Yes**, that branch's own row. The three kills are disjoint - branch attribution is real, not a count |
| **P17** | delete the `buildRunCohort` call and inline the whole merge in the handler | **RED**, 3 failed / 90 passed | wiring > *"calls buildRunCohort( inside handleGradeAll's own body - not merely imported"* (plus the first-argument and meta-provenance rows, which lose their subject) | **Yes** - 9.3's "THE LEAF IS CALLED (B1)" row |
| **P18** | delete `hasTrendableResults(trendsEntry) &&` from the mount, panel `:944` | **RED**, 1 failed / 92 passed | wiring > *"the tag is not reachable unless hasTrendableResults(...) is true, over the comment-stripped source"* | **Yes** - 9.3's "THE MOUNT IS GATED (M3)" row |
| **P19** | `ungraded.kind: "grading-failed"` -> `"not-attempted"`, leaf `:142` region | **RED**, 2 failed / 91 passed | leaf > *"never emits a not-attempted row for any input this row source can produce"* (and the message row) | **Yes** - 9.3's "THE ROW-STATE MAPPING, RE-DERIVED" row |
| **P20** | delete the disclosure `<p>` block entirely, panel `:952-956` | **RED**, 3 failed / 90 passed | wiring > *"the render body references cohortLabelSpread at all - deleting the line entirely must fail this"* | **Yes** - 9.3's "THE DISCLOSURE LINE EXISTS (B-A)" row. This is the one revision 5 left open and it is genuinely closed |
| **P21** | `byId.get(result.id)` -> `identity[sourceIndex]`, leaf `:107` | **RED**, 1 failed / 92 passed | leaf > *"attributes each result to its own student even when the two arrays are in different orders"* | **Yes** - 9.3's "THE JOIN KEY IS BY `id`, NOT POSITIONAL" row, and it is the only assertion that fired |

**Collateral on P14, stated rather than hidden.** P14 fired four assertions,
not one. Three of them - both JOIN KEY cells and the PER-ROW `assessment` cell -
are collateral, because each of those tests builds its oracle as
`new Map(cohort.rows.map((r) => [r.result.student, ...]))`. Blanking `student`
collapses that map, so a student-projection mutation looks like a join failure.
The plan-named assertion did fire on its own terms
(`expected '' to be 'Zzyzx Distinctive Name'`), so P14's kill is attributable -
but the JOIN KEY row is **not independent of the identity projection**, and if
those two ever have to be diagnosed apart, the join tests will point at the
wrong defect first. Recorded as RES-V-4, not as a failure.

---

## 3. The builder's P21 disclosure, independently confirmed

The commit message claims P21 initially could not kill because every fixture row
carried identical content, and that the fixture was strengthened. **Confirmed,
by reproducing the weak form.**

I reverted the fixture at `classTrendsRunCohort.test.ts:60` to the shape the
comment says was tried first -
`[readyResult("s2"), readyResult("s1")]` with no `totalScore` overrides, and the
two assertions adjusted to the fixture's single shared score of `"9"` - and
applied P21 at the same time:

```
npx vitest run src/app/components/grading-recording/classTrendsRunCohort.test.ts
-> Test Files 1 passed (1) / Tests 22 passed (22)
```

**A positional join passes the entire leaf test file under the weak fixture.**
The strengthened fixture is load-bearing, the DO-NOT-SIMPLIFY comment at
`:51-59` is earned, and the builder's disclosure is accurate rather than
decorative.

The strengthened fixture also buys coverage nobody claimed: **N9**, blanking
`totalScore: classified.totalScore` at leaf `:124`, is killed by that same
assertion and by nothing else. Without the override it would have survived.

### 3.1 Other fixtures audited for the same weakness

I checked every fixture in the two new test files for indistinguishable rows.

| Fixture | Rows distinguishable? | Can it detect a mis-ordering? | Verdict |
|---|---|---|---|
| JOIN KEY, different orders (`:60-64`) | yes, after the fix - distinct `totalScore` AND distinct `studentName` | yes, demonstrated | sound |
| JOIN KEY, length mismatch (`:73-74`) | yes - one id has no identity row | n/a, it is an omission test | sound |
| PER-ROW `assessment` (`:84-88`) | the two `results` are content-identical, but the two IDENTITY rows differ in BOTH `studentName` and `assessment` | yes - a cross-row label attribution moves "Essay 1" onto Grace Hopper and fails | sound; the arrays are same-ordered so it cannot see P21, but P21 has its own row |
| ROW-STATE MAPPING, mixed (`:148-152`) | yes - one ready, one failed | yes | sound |
| `totalResults` (`:171-176`) | two identical ready rows plus one failed | no, but the assertion is a COUNT and is order-insensitive by construction | sound for what it asserts |
| `cohortLabelSpread` four cells (`:237-255`) | all four inputs distinct | n/a | sound |
| **`runCohortMeta` `it.each` (`:208-219`)** | **no - cells 1 and 4 are BYTE-IDENTICAL inputs** | n/a | **see below** |

**One real finding, minor.** The `runCohortMeta` `it.each` is presented as
9.3's four-cell enumeration
`{assignmentName is ""; is a label; rows carry a DIFFERENT single label; rows
carry undefined}`. Measured, it is three distinct inputs and one duplicate:
cell 1 (labelled `"empty capture"`) and cell 4 (labelled `"rows carry
undefined"`) are the same object, confirmed by comparing the two source lines
with the leading label stripped - equal. And cell 1 does **not** test the empty
capture at all: the cohort built at `:214` hardcodes
`assignmentName: "Essay 2"` in every cell. The genuine empty-capture cell is the
separate `it` at `:221-228`, which does exist and does assert `""`. So the
coverage the plan asked for is all present; the `it.each`'s own four-ness is
one cell short of what its labels claim. Recorded as RES-V-5.

---

## 4. Reachability: from a control the instructor clicks to the new code

This repo has shipped a capability dead with every gate green twice, so this is
traced by opening every hop.

1. `src/app/components/RecordingTab.tsx:592` - the sub-tab strip array carries
   `["grading", "Grading (from a recording)"]` and maps it to a real `<button
   role="tab">`. A clickable control.
2. `RecordingTab.tsx:856-857` - `<div role="tabpanel" id="rec-panel-grading" ...>`
   renders `<GradingRecordingPanel active={active && recView === "grading"} />`.
   The panel is the only import of that module (`grep -rn
   "grading-recording/GradingRecordingPanel\"" src/app --include=*.tsx` returns
   exactly this one line).
3. `GradingRecordingPanel.tsx:869` - `<Button ... onClick={() => void
   handleGradeAll()}>` with the label `"Grade submissions"` at `:871`.
   A second clickable control, the one the brief calls Grade All.
4. `:563` `handleGradeAll` -> `:592` the identity projection -> `:593-598`
   `gradeCapturedSubmissionsAction(...)` -> `:640` `const meta = {...}` ->
   `:641` `setLastRunCohort(buildRunCohort(result.results, identity, meta))`.
5. `:941` the render body builds `trendsEntry` from `lastRunCohort`; `:944` the
   `hasTrendableResults` gate; `:946` `<ClassTrendsPanel entry={trendsEntry}
   defaultExpanded />`; `:952` the disclosure guard.
6. The join key is real: `gradeCapturedSubmissionsAction`
   (`src/app/actions/grading-submission-grade.ts:127-133`) returns
   `{ results: Array<{ id: string } & GradingRecordingFeedback> }`, and every
   `results.push` at `:176`, `:178`, `:180`, `:184` and `:192` spreads
   `{ id: submission.id, ... }`. The ids the leaf joins on are genuinely there,
   and `submissions` and `identity` are both projected from the same
   `gradingRows.rawRows` at `:586` and `:592`, so the id spaces coincide by
   construction.

**Reachability holds.** The leaf is not dead, the mount is not orphaned, and
`buildRunCohort`'s first argument really does carry joinable ids. The one hop I
cannot execute is step 5 - nothing renders.

Two consequences of the real path that the plan does not discuss, neither a
defect:

- `getGeminiMaxSubmissions()` caps a run (`:147`), and the overflow rows are
  pushed as `composeFailedGradingRow(...)` at `:191-197`. They therefore enter
  the cohort as `UngradedResult`s and are excluded from `totalResults`. Correct,
  and it means a run of 7 over a cap of 5 still yields a cohort of 7 rows whose
  `cohortLabelSpread` sees every label. No action.
- `onClearTable` and `onRemoveRow` do not clear `lastRunCohort`. After "Clear
  table" the trends panel keeps showing the previous run's trends over rows that
  are no longer on screen. That is arguably correct under 5.5's "tied to what
  this run covered" rule and it matches `GithubGradingPanel`'s precedent, but it
  is a user-visible state the plan never ruled on. Recorded as RES-V-6, not
  claimed as a defect.

---

## 5. FRESH ATTACK: mutations the shipped instruments do not kill

This is the section the brief asked for most. Twelve fresh mutations were
designed and executed; **nine survive the four wave-2 test files, seven survive
every gate in this repo.**

The seven full survivors were then applied **simultaneously** and the entire
repo was re-gated:

```
npx tsc --noEmit                 -> no output, exit 0
npm run lint                     -> 4 problems (0 errors, 4 warnings)   [the baseline]
npm test                         -> Test Files 1095 passed / Tests 22066 passed
```

Identical to the clean tree on all three. Nothing in this repository can tell
the shipped code from that tree.

| # | Mutation | Site | 4 wave-2 files | `tsc` | `npm run lint` | Verdict |
|---|---|---|---|---|---|---|
| **N1** | `hasTrendableResults(trendsEntry) &&` -> `!hasTrendableResults(trendsEntry) &&` | panel `:944` | 93/93 green | exit 0 | 4 warnings | **SURVIVES EVERYTHING** |
| **N2** | `cohortLabelSpread(lastRunCohort) &&` -> `!cohortLabelSpread(lastRunCohort) &&` | panel `:952` | 93/93 green | exit 0 | 4 warnings | **SURVIVES EVERYTHING** |
| **N4** | `const meta = { courseName: selectedCourse?.name ?? "", assignmentName: assessmentId }` -> the two VALUES transposed | panel `:640` | 93/93 green | exit 0 | 4 warnings | **SURVIVES EVERYTHING** |
| **N6** | `strengths: classified.strengths, improvements: classified.improvements` -> the two swapped | leaf `:120-121` | 93/93 green | exit 0 | 4 warnings | **SURVIVES EVERYTHING** |
| **N7** | `feedback: classified.overallComment` -> `feedback: ""` | leaf `:125` | 93/93 green | exit 0 | 4 warnings | **SURVIVES EVERYTHING** |
| **N10** | `overallComment: classified.overallComment` -> `overallComment: ""` | leaf `:119` | 93/93 green | exit 0 | 4 warnings | **SURVIVES EVERYTHING** |
| **N11** | drop `defaultExpanded` from the mount | panel `:946` | 93/93 green | exit 0 | 4 warnings | **SURVIVES EVERYTHING**, but 9.5 already declares this a reading claim - not a new hole |
| N3 | `lastRunCohort ? toRunCohortEntry(lastRunCohort) : null` -> the ternary INVERTED | panel `:941` | 93/93 green | **KILLS**: `TS2345: Argument of type 'null' is not assignable to parameter of type 'RunCohort'` at `(941,69)` | - | survives every TEST; the type gate is the only thing that catches it |
| N5 | `sourceIndex,` -> `sourceIndex: 0,` | leaf `:142` | 93/93 green | exit 0 | **5th warning** (`'sourceIndex' is defined but never used`) | survives every test; only the warning COUNT sees it, and warnings do not fail the gate |
| N8 | remove `selectedCourse, assessmentId` from the `useCallback` deps | panel `:653` | 93/93 green | exit 0 | **5th warning** (`react-hooks/exhaustive-deps`) | see the honest note below |
| N9 | `totalScore: classified.totalScore` -> `""` | leaf `:124` | **KILLED** by the strengthened JOIN KEY fixture | - | - |
| N12 | `rubricAreas: classified.rubricAreas` -> `[]` | leaf `:123` | **KILLED**, 2 failed | - | - |

### 5.1 The three that matter, and why each is one of the five failures again

**N1 - the panel renders exactly when it must not, and never when it must.**
`classTrendsMountIsGated`'s regex is
`/hasTrendableResults\([^)]*\)\s*&&([\s\S]{0,400})/`
(`GradingRecordingPanel.wiring.test.ts:474`). A leading `!` is outside the
match, so the detector reports the mount as gated while the gate is inverted.
The user-visible consequence is the exact one P18's rationale names: with the
gate inverted, the mount is reachable only when `hasTrendableResults` is false,
and `ClassTrendsPanel.tsx:136` renders its collapsed label as
`` `Trends (${report.areas.length})` `` - so the instructor gets a
`Trends (0)` button after every run that produced nothing, and nothing at all
after a run that produced real trends. **This is failure mode 1 of the five,
in the one shape the shipped detector is blind to.** It is a two-character edit.

**N2 - the disclosure line appears exactly when there is nothing to disclose.**
The disclosure pin (`:534-551`) collects the guard's free identifiers and checks
them against a whitelist. A `!` is not an identifier, so
`lastRunCohort && !cohortLabelSpread(lastRunCohort)` passes the whitelist
unchanged. The line then renders *"This run graded submissions from more than
one assessment label - the trends above combine them"* on every single-label run
and stays silent on the multi-label run it exists for. **This is failure mode 3
in a third form**: ruling 20 closed "every row carries the same label", P20
closed "the line was never written", and "the line is written and inverted"
is open. It is a one-character edit.

**N4 - a live control's value reaches the wrong entry-meta field.**
`metaBindingCapturesProvenance` (`:357-365`) checks only that the `const meta`
initialiser MENTIONS `assessmentId`/`assessmentLabel` and MENTIONS
`selectedCourse`, and that `meta` is passed to `buildRunCohort`. It never checks
which value lands in which key. `runCohortMeta`'s `it.each` then checks only
that the leaf passes `cohort.courseName` and `cohort.assignmentName` through
unchanged - which it faithfully does, with the wrong contents. Transposing the
two values puts the course name into `assignmentName` - which reaches
student-addressed copy at `class-trends-draft.ts:185` and the model prompt at
`class-trends-insight.ts:154` - and the half-typed assessment label into
`courseName`. **This is failure mode 5** (a live control's value reaching the
entry meta) surviving a pin written specifically to stop it, because the pin
is a MENTION test and the defect is a BINDING error.

### 5.2 The four content-mapping survivors

N6, N7, N10 and N5 all live in `buildRunCohort`'s ready/failed branches and all
survive because **no assertion in the leaf's test reads those fields at all**.
The leaf's test asserts `student`, `assessment`, `rubricAreas`, `totalScore`
(incidentally, via the strengthened join fixture), `ungraded.kind`,
`ungraded.message`, and the absence of `userId`. It never reads
`overallComment`, `strengths`, `improvements`, `feedback` or
`ungraded.sourceIndex`.

Their blast radius is smaller than N1/N2/N4's and should be stated honestly:
`computeClassTrends` reads `rubricAreas`, so the counted trends are unaffected
by all four. The exposure is whatever downstream consumer of the entry reads a
`GradeResult`'s prose fields - which on this surface is `ClassTrendsPanel` and
its draft panel. **I did not trace every one of those reads**, so I am claiming
the instrument gap (certain, measured) and not a user-visible defect (unproven).
N6 in particular - strengths and improvements silently swapped - is the kind of
transposition that reads as plausible output and would be hard to notice.

### 5.3 N8, stated precisely rather than as a scare

Removing `selectedCourse, assessmentId` from `handleGradeAll`'s dependency array
**is not a live defect today**, and I checked rather than assumed:
`useGradingRows.ts:500-519` returns a bare object literal with no `useMemo`
wrapper, so `gradingRows` is a new reference on every render, so the
`useCallback` deps always differ, so the callback is rebuilt every render and
nothing can go stale. The dependency addition in this diff is therefore
correctness-neutral at HEAD.

It is a LATENT hazard rather than nothing: the moment `useGradingRows` memoizes
its return - an ordinary performance change - the omission would silently
restore the stale-capture bug that 5.5's entire provenance rule exists to
prevent, and the only thing that would notice is a lint WARNING, on a gate that
exits 0 with warnings. Recorded as RES-V-3.

### 5.4 What the fresh attack shows about the instrument design

The pattern across N1, N2 and N4 is one shape: **every wave-2 source-text pin
asks whether an identifier is PRESENT, and none asks what the expression MEANS.**
A whitelist of free identifiers is immune to renaming and to one-hop leaks - the
two attacks it was designed for - and completely blind to negation and to
transposition, because neither introduces an identifier. That is not a
criticism of choosing source text; source text is the only wiring instrument
this repo has. It is a statement about where the remaining risk sits, and it
sits in the handful of operators (`!`, and the order of two same-typed values)
that a name-based detector cannot represent.

---

## 6. Detector integrity: what the pins actually match

Checked directly, since the brief asks whether an assertion is satisfiable by a
comment now that the file carries long hinge comments at exactly the pinned
sites.

**The wave-2 pins are NOT comment-satisfiable. Proven, not asserted.** I deleted
the entire gated mount block (`:940-958`) and replaced it with a JSX comment
containing the same text verbatim - the const, the guard, the tag and the
disclosure guard. Result:
`npx vitest run .../GradingRecordingPanel.wiring.test.ts` -> **10 failed / 39
passed**. `stripComments` is load-bearing and ruling 15 is discharged.

The two regions were also verified sound by replicating the helpers over the
real file:

- `HANDLE_GRADE_ALL_BODY` is 2386 characters, ends at the handler's own closing
  brace (`...setLastRunCohort(null);\n    } finally {\n      setGradingBusy(false);\n    }\n  }`),
  and contains no `<GradingTable`, no `<ClassTrendsPanel` and no
  `cohortLabelSpread` - so `extractBalanced` does not over-run into the render
  body. **The test file canaries that `renderBody` excludes the handler
  (`:203-213`) but never canaries the converse.** The converse holds today; it
  is unguarded. RES-V-7.
- `RENDER_BODY` is 8171 characters and contains no `buildRunCohort`.
- `stripComments`'s `line.replace(/\/\/.*$/, "")` would truncate real code if
  the panel ever contained `//` inside a string literal. It does not:
  `grep -c "://" <panel>` returns 0 against a firing canary
  (`grep -c "styles\." <panel>` returns 18), and `grep -n '"[^"]*//' <panel>`
  returns nothing. Latent, not live. RES-V-8.
- `renderBody`'s marker `/^  return \(/m` has exactly one match in the panel,
  at `:694`. Sound today.

### 6.1 An INHERITED pin in the same file IS comment-satisfiable

Not wave 2's, but it is thirty lines above wave 2's pins in the same file and it
guards the same class of failure, so it belongs in this report.

`GradingRecordingPanel.wiring.test.ts:85-113` - wave 1's W1-G3 caller guard,
`importsAndRendersGradingCaptureSettings` plus the ten-prop binding check - runs
over the RAW `source` constant (`:36`), not `STRIPPED_SOURCE`. I wrapped the
entire live `<GradingCaptureSettings ... />` element (`:767-778`) in a JSX
comment, so that nothing renders it:

```
npx vitest run .../GradingRecordingPanel.wiring.test.ts  -> Tests 49 passed (49)
npx tsc --noEmit                                         -> exit 0
npx eslint <panel>                                       -> 6 warnings, 0 errors
```

**Wave 1's "an extracted leaf with no caller ships dead" guard is defeated by
commenting out the caller**, with tests and typecheck both green. Only the
eslint warning count moves (three newly-unused locals: `setCourseId`,
`setAssessmentLabel`, `assessmentOptions`), and warnings do not fail
`npm run lint`. The fix is one word - run those three `it`s over
`STRIPPED_SOURCE`, which already exists in the file at `:156`. Recorded as
RES-V-2. I did not apply it: this is a verification, and the file is wave 1's.

### 6.2 Two pins confirmed load-bearing rather than decorative

- **The sixth root in `classTrendsDraft.not-postable.test.ts`.** The plan's P12
  exists because a root addition nobody proved is an assertion about code nobody
  checked. Ran it: adding `import { callLlm } from "@/lib/llm";` to the cohort
  leaf turns canary 3 red and the violation message names
  `src/app/components/grading-recording/classTrendsRunCohort.ts` by path. The
  walk genuinely reaches the new root. (Note in passing: `docs/loop/seats.md`'s
  worked case says that file bans "`app/actions`, `lib/canvas` and
  `lib/lms-generation` - not `lib/llm`". Measured at
  `classTrendsDraft.not-postable.test.ts:58`, `FORBIDDEN_PATH_PREFIXES` is five
  entries and **does** include `lib/llm` and `lib/gemini`. That seat card is
  stale; not this row's problem, but do not act on it.)
- **The `snapshot-autofire.structure.test.ts` re-pin.** The citation was moved
  from `:517-529` to `:532-544`. Verified by hand, because the plan is right
  that a citation in a comment can never go red:
  `sed -n '528,548p' <panel> | cat -n` shows `useEffect(() => {` at absolute
  line **532** and its dependency array `}, [pendingFrames, extracting,
  runExtraction]);` at absolute line **544**. The re-pin is correct.

---

## 7. A measured budget breach, with no gate behind it

Not a correctness defect. It is a stated pass condition that no instrument
checks, so it went unremarked.

- Plan 5.4 budgets wave 2's panel additions at **33-46 lines**, with two hinge
  comments accounting for 16-22 of that.
- Plan 5.3 reserves a margin of **20** lines on this file, priced as two
  `preserve-manual-memoization` workarounds of roughly 8 lines each, because
  `docs/loop/this-repo.md` section 1 records extracting a hook out of the
  sibling panel failing lint on a callback nobody touched.
- Wave 1 delivered **918** against a target of `<= 934`, i.e. 16 lines better
  than required.
- **Wave 2 added 72 net lines** (990 - 918). Against the 46-line budget that is
  **+26**; against the slack-adjusted room of 62 (1000 - 918 - 20) it is **+10**.
- **The reserved margin is now 10, not 20.** One workaround still fits; the two
  the margin was priced for do not.
- The overshoot is almost entirely comment: panel comment lines rose 305 -> 339,
  **+34** of the +72, against a budgeted 16-22 for both hinge comments together.

Nothing catches this. 9.3 inherits 9.2's rows minus `<= 934`, and 9.2's only
size row is `file-size-ceiling.structure.test.ts` green without editing
`ALLOWED_OVERAGE` - which passes comfortably at 990 of 1000. The comment-count
FLOOR row also passes, since comments rose. So the one budget wave 3 inherits is
unmeasured by construction.

Plan 5.6's contingency named exactly this lever first: *"Trim wave 2's additions
to the measured shortfall - the addition table's range is 33-46, and its two
hinge comments are 16-22 of that. Shortening them is a real, bounded lever."*
It was available and was not used. Recorded as RES-V-1; the scope decision is
the owner's, and **any fix proposed for the survivors in section 5 must fit
inside 10 lines** or trade against the hinge comments.

---

## 8. Things I checked that are CORRECT - do not re-litigate

Stated so a later round does not spend itself re-deriving them.

- The cohort is built from `result.results`, never the pre-grade array, and the
  pin that enforces it kills P13 on its own. Failure mode 1's primary form is
  closed.
- The leaf is called from inside `handleGradeAll`'s own comment-stripped body,
  and P17 kills. Failure mode 2 is closed.
- The identity projection reads `r.assessment` per row, and P15 kills. The
  "every row gets the one in-scope label" half of failure mode 3 is closed.
- The disclosure line EXISTS and P20 kills. The "the line was never written"
  half of failure mode 3 is closed.
- All three non-success branches clear the cohort, each attributable to its own
  branch. Failure mode 4 is closed.
- The join is by `id`; a length mismatch omits rather than fabricating a
  student; `userId` is never emitted; no `not-attempted` row is reachable;
  `totalResults` counts only ready rows; `cohortLabelSpread` counts `undefined`
  as one distinct value across all four cells.
- Wave 2 declares no second trendable predicate, no second meta type and no
  re-export; the panel imports `hasTrendableResults` directly from
  `../grading-results/classTrendsEntry` and the test asserts the negative
  import too.
- The whitelist is genuinely scoped to the trends-entry const's own initialiser,
  and its own canary at `:432-440` proves the one-hop `const leaked =
  assessmentLabel` is invisible to it BY CONSTRUCTION rather than by accident.
- `npx tsc --noEmit` exit 0, `npm run lint` 4/0/4 at baseline, `npm test`
  1095/22066, `npm run build` `Compiled successfully`.
- No `/s` (dotAll) regex was introduced, which would pass vitest and fail
  `tsc` with TS1501. `npx tsc --noEmit` exit 0 is the primary evidence. Read
  directly as a second instrument: the wiring test's regex literals are listed
  by `grep -n "/[gimsuy]*\.test(\|= /.*/[gimsuy]*[;)]\|exec(" <file>` (23
  lines), and the only flags anywhere in them are `/m` at `:185` and `/g` at
  `:410`. The leaf and the leaf's test carry none. The one hit from a
  flag-hunting grep over those three files is
  `classTrendsRunCohort.ts:14`, a comment line, not a regex.

---

## 9. Residual register

Every entry names an owner, an instrument and the step that will measure it. An
entry missing any of the three is a deletion and I would call it that.

| ID | Residual | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| **RES-V-1** | Wave 2 added 72 net panel lines against a 46-line budget, halving 5.3's 20-line margin to 10. Nothing gates a wave's own addition count | **The orchestrator**, as a scope decision before wave 3 is dispatched | `git show 61b229f:<panel> \| wc -l` against `@(Get-Content <panel>).Count`, differenced; and `grep -c "^\s*\(//\|/\*\|\*\|{/\*\)" <panel>` for the comment share | **Wave 3's scoping pass**, which 3.5 already requires and which inherits the reduced margin |
| **RES-V-2** | Wave 1's W1-G3 caller guard (`GradingRecordingPanel.wiring.test.ts:85-113`) runs over raw `source`, so commenting out the live `<GradingCaptureSettings />` element leaves all 49 tests green and `tsc` exit 0 | **A `loop-implementer`**, one-line change: pass `STRIPPED_SOURCE` (already declared at `:156`) instead of `source` to those three `it`s | re-run the comment-out probe in section 6.1; the three `it`s must go red | The next wave that writes `GradingRecordingPanel.wiring.test.ts` - which is wave 3, since A16-5 touches this panel |
| **RES-V-3** | `handleGradeAll`'s dep array is correctness-neutral only because `useGradingRows.ts:500` returns an unmemoized object literal. Memoizing that hook later silently restores the stale-capture bug 5.5 exists to prevent, detectable only as a lint WARNING on a gate that exits 0 with warnings | **The orchestrator**, as a note on the A16 backlog row | `npx eslint <panel>` warning count against the 4-warning repo baseline from `npm run lint` | The first wave that adds a `useMemo` to `useGradingRows.ts`'s return |
| **RES-V-4** | The JOIN KEY and PER-ROW `assessment` assertions build their oracle as `Map(rows.map((r) => [r.result.student, ...]))`, so they are not independent of the student projection - P14 fires all three | **A `loop-test-author`**, if the coupling ever has to be diagnosed apart | re-run P14 (`const student = ""`) and count how many `it`s fire | Any later round that has to localise a join-versus-projection defect |
| **RES-V-5** | `runCohortMeta`'s `it.each` (`classTrendsRunCohort.test.ts:208-219`) is three distinct inputs, not four: cells 1 and 4 are byte-identical, and cell 1's `"empty capture"` label is wrong because `:214` hardcodes `assignmentName: "Essay 2"` in every cell. The real empty-capture cell is the separate `it` at `:221-228` | **A `loop-implementer`**, one fixture edit | compare the two `it.each` rows with the label stripped; they must differ | The next wave that writes `classTrendsRunCohort.test.ts` |
| **RES-V-6** | `onClearTable`/`onRemoveRow` do not clear `lastRunCohort`, so the trends panel outlives the rows it describes. Arguably correct under 5.5's "tied to what this run covered", but never ruled on | **The owner**, as a product decision - it is a rendered-behaviour question and nothing here renders | none available in this environment; it needs a browser | An owner verification, or wave 3's UX pass if one runs |
| **RES-V-7** | `GradingRecordingPanel.wiring.test.ts:203-213` canaries that `renderBody` excludes the handler body, but nothing canaries that `handleGradeAllBody` excludes the render body. It does today (2386 chars, no `<GradingTable`), unguarded | **A `loop-implementer`**, one canary `it` mirroring `:203-213` | assert `HANDLE_GRADE_ALL_BODY` does not match `/<GradingTable/` | The next wave that writes this test file |
| **RES-V-8** | `stripComments` truncates any line containing `//` inside a string literal. The panel has none today (`grep -c "://"` returns 0 against a firing canary), so every region pin silently depends on that staying true | **A `loop-implementer`**, one canary | `grep -c "://" <panel>` must stay 0, paired with a firing canary | Any wave that adds a URL literal to this panel |

---

## 10. Findings requiring a decision, ranked

Not residuals - these are the ones where something is wrong now and someone must
choose.

1. **N1, N2 and N4 survive every gate**, and each reproduces one of the five
   failures this row fought. All three are one- or two-character edits at sites
   the plan itself identifies as load-bearing. The shipped instruments test for
   the PRESENCE of identifiers and cannot see negation or transposition.
   A fix exists for all three and is cheap - assert the guard expression's exact
   shape rather than its identifier set, and assert which key each captured
   value lands in - but **the panel has 10 lines of headroom** (section 7), and
   the fixes are test-side, so they cost the panel nothing. This is the highest
   value item in the report.
2. **RES-V-2**, the inherited raw-source caller pin, is a live hole in exactly
   the guard class this repo has shipped dead twice. One word.
3. **RES-V-1**, the halved margin, needs an owner decision before wave 3 is
   scoped, because wave 3 writes this same file.

---

## 11. What I could not determine

- **Whether the trends panel actually appears** beside a run, whether
  `defaultExpanded` opens it, whether the disclosure line reads as disclosure
  rather than as an error, and whether either vanishes on reload. Nothing
  renders.
- **Whether N6, N7 and N10 produce a user-visible defect** or merely an
  instrument gap. I proved the instrument gap by measurement; I did not trace
  every consumer of a `GradeResult`'s prose fields down to a rendered surface,
  so I am not claiming the defect.
- **Whether `gradeCapturedSubmissionsAction` behaves as typed against a real
  model.** No `.env`, no keys, network blocked by `vitest.setup.ts`. The id
  contract is read from the action's source and its return type, not exercised.
- **Whether any of the seven survivors would be caught by a gate outside this
  repo** - a code review, a Vercel preview, a real grading run. I only measured
  what this checkout can run.
- One small discrepancy I noticed and did not chase: `docs/loop/this-repo.md`
  section 1 lists the second lint warning at `repoGradesSliceA.guards.test.ts:83`;
  `npm run lint` today reports `:84:10`. Plan 9.2 already caught this and says
  so. No action.
