# A28 scope: two "graded" counts on one Repo Grades screen

Backlog row A28 (`docs/backlog.yml:484`, `kind: 'bug'` at `:493`). Author:
architecture seat, 2026-09-21, against HEAD `5fc1978`. No source file differs
between `3366654` (A26/A27) and that HEAD: `git diff --stat 3366654 HEAD` lists
only `docs/BACKLOG.md`, `docs/a29-ac.md` and `docs/backlog.yml`.

---

## 0. Verdict

**A26/A27 did NOT resolve A28. The defect still exists and was reproduced by
running the real handler.** One case still disagrees: a repo whose model call
fails but whose grading action still returns a normal result. The status line
counts it as graded and the trends label does not. When EVERY repo fails that
way, the status line reads "Bulk grading finished: 3 graded." for a run that
graded nothing. That breaks the summary function's own RULE 5
(`repoGradesBulkGrade.ts:161-168`).

The two other failure kinds already agree after A26/A27: a returned `{ error }`
and a rejected call both come out as "failed". A26/A27 fixed rejection. They
never touched the case above.

**The row's recommended fix is in the wrong place, and the tree shows it** (see
section 3). The status line already reports graded and failed separately. The
function that builds it cannot see a model failure, because its input type has
no field that carries one. The miscount happens one step earlier, at
`useRepoGradesBulkGrade.ts:376`, which labels every success-shaped return
`status: "graded"`. The fix is a pure classifier in the existing leaf and one
changed line at that call site. The status line text and the trends label stay
as they are.

A sandbox copy of that exact design was run against the same eight cases. It
brings every label-bearing case into agreement, and it keeps the shared-rubric
prologue unchanged (section 2.3).

---

## 1. The question, and how it was answered

The object compared is the pair of strings the view renders after one "Grade
all" run:

- **Status line.** `index.tsx:843-846` renders `{postSummary}` in the single
  `role="status"` region. `postSummary` is written by `setPostSummary`, which
  the bulk hook receives as `onAnnounce` (`useRepoGradesGradingActions.ts:739`).
  The hook calls `onAnnounce(bulkGradeSummaryLine(outcomes, plan))`
  (`useRepoGradesBulkGrade.ts:459`).
- **Trends label.** `index.tsx:853-857` renders
  `repoRunTrendsLabel(trendsEntry)` (`classTrendsFolderEntry.ts:109-113`) above
  `<ClassTrendsPanel entry={trendsEntry} />`. `trendsEntry` is
  `repoRunTrendsEntry(lastRunCohort, courseId)`
  (`useRepoGradesGradingActions.ts:792`), and `lastRunCohort` is set from
  `runBulkGrade`'s return value (`:784-787`).
- **A third count, the same one as the label.** Inside the panel, each area
  summary interpolates `totalResults` ("Across the N submissions graded so
  far", `class-trends.ts:242`), and
  `totalResults = gradedResults(entry.run.results).length` (`:272-273`). The
  label uses the same `gradedResults` count (`classTrendsFolderEntry.ts:110`),
  so the label and the panel agree by construction. Measured:
  `panelTotalResults` equals the label's number in every case below.

**What the instructor literally sees is a READING claim.** No component is
rendered by any test here (`docs/loop/this-repo.md` section 2). The
measurements below capture the exact values those two JSX expressions render:
the argument passed to `setPostSummary`, and `repoRunTrendsLabel` applied to
the `trendsEntry` the hook returns on the next render. They do not capture
pixels, layout or whether both lines are on screen together. `index.tsx:843`
and `:853` are consecutive siblings in source, so both are visible after a run
that produced trends. That is also a reading claim.

---

## 2. Measurements

### 2.1 The harness

- Sandbox, not committed:
  `<scratchpad>/a28/measure.a28.test.ts` with config
  `<scratchpad>/a28/vitest.a28.config.ts`. Here `<scratchpad>` is
  `C:/Users/alexa/AppData/Local/Temp/claude/C--Users-alexa-OneDrive-Documents-Projects-teaching-assistant/e8e96e62-aa3d-4508-b28a-354d4d297572/scratchpad`.
- The harness is copied from
  `src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts:28-62`:
  a stand-in `useState`/`useRef` and a stubbed `gradeRepoAction`.
- It drives `useRepoGradesGradingActions(...).handleGradeColumn("week-1")`,
  which is the function the Grade all button reaches. It then takes a fresh
  "render" and reads `trendsEntry`.
- The model-failed fixture copies the field list of `engine.ts:146-171`
  (`buildUngradedRow`) with the `grading-failed` outcome built at
  `engine.ts:256-268`, and its message starts with `GRADING_FAILURE_PREFIX`
  (`types.ts:11`). A real engine emitting that shape is pinned by
  `src/lib/grade/engine.ungraded.test.ts:223-255`.
- Command, run from the repo root:
  `npx vitest run --config <scratchpad>/a28/vitest.a28.config.ts`. Result:
  `Tests 18 passed (18)`, covering both files in 2.3. Each case appends one
  JSON line to `results.jsonl`, because vitest's console output did not reach
  the captured stdout here.
- **Canary.** The one-repo all-success case asserts that the label is non-null
  and that the status line is exactly `Bulk grading finished: 1 graded.`. It
  passed, so the harness does see both surfaces.

### 2.2 HEAD (`5fc1978`, identical source to `3366654`)

| Case | Per-repo behaviour of the stubbed `gradeRepoAction` | Status line (rendered text) | Status-line graded count | Trends label count | Agree? |
|---|---|---|---|---|---|
| M1 | a ok, b ok, c ok | `Bulk grading finished: 3 graded.` | 3 | 3 | yes |
| M2 | b returns `{ error }` | `Bulk grading finished: 2 graded, 1 failed.` | 2 | 2 | yes |
| M3 | b REJECTS (`Failed to fetch`) | `Bulk grading finished: 2 graded, 1 failed.` | 2 | 2 | yes |
| **M4** | b's model call fails, result still returned (`grading-failed` row) | `Bulk grading finished: 3 graded.` | **3** | **2** | **NO** |
| **M5** | a ok, b `{error}`, c rejects, d model-fails, e no-submission, f graded with zero rubric areas, g ok | `Bulk grading finished: 4 graded, 2 failed, 1 had nothing submitted.` | **4** | **3** | **NO** |
| **M6** | all three model-fail | `Bulk grading finished: 3 graded.` | **3** | no label (`trendsEntry` null) | contradicts RULE 5: nothing was graded |
| **M7** | rubric source `generate` (blank text), a model-fails in the prologue, b and c ok | `Bulk grading finished: 3 graded.` | **3** | **2** | **NO** |
| M8 | a ok, b graded with zero rubric areas | `Bulk grading finished: 2 graded.` | 2 | 2 | yes |

Other values measured in the same run, all from `results.jsonl`:

- **Activity log.** In M4 the model-failed repo is logged `o/b:grade-succeeded`;
  in M6 all three are. The log panel's own "N graded" summary
  (`RepoGradesLogPanel.tsx:149`, from `summarizeRepoGradeLog`,
  `repoGradesLog.ts:192-201`) is therefore a third place a model failure
  counts as graded.
- **Cell state.** The model-failed repo's cell is left with `score: ""` and
  `gradeError: null` in M4, M5 (o/d), M6 and M7 (o/a). By reading
  `RepoGradeCellControl.tsx:575` and `:633-635`, it shows an empty score and a
  "Grade" button, with no error line.
- **Rubric arguments, M7.** o/a received `""` and o/b and o/c each received
  the rubric o/a's response returned. So a model-failed prologue attempt
  still establishes the shared rubric today.

### 2.3 The proposed design, run in the sandbox

`fixedLeaf.ts` and `fixedHook.ts` in the same scratchpad directory are copies
of `repoGradesBulkGrade.ts` and `useRepoGradesBulkGrade.ts`. They carry exactly
the change in section 6, and a second copy of the harness
(`measureFixed.a28.test.ts`) mocks
`@/app/components/repo-grades/useRepoGradesBulkGrade` to load them. That the
mock actually took effect is shown by the M4 output changing between the two
tables.

| Case | Status line after the change | Graded count | Label count | Agree? | Rubric arguments |
|---|---|---|---|---|---|
| M1 | `Bulk grading finished: 3 graded.` | 3 | 3 | yes | unchanged |
| M2 | `Bulk grading finished: 2 graded, 1 failed.` | 2 | 2 | yes | unchanged |
| M3 | `Bulk grading finished: 2 graded, 1 failed.` | 2 | 2 | yes | unchanged |
| M4 | `Bulk grading finished: 2 graded, 1 failed.` | 2 | 2 | yes | unchanged |
| M5 | `Bulk grading finished: 3 graded, 3 failed, 1 had nothing submitted.` | 3 | 3 | yes | unchanged |
| M6 | `Nothing was graded - 3 failed.` | 0 | no label | yes (RULE 5 holds) | unchanged |
| M7 | `Bulk grading finished: 2 graded, 1 failed.` | 2 | 2 | yes | o/a=`""`, o/b and o/c = the rubric o/a returned. **Prologue unchanged** |
| M8 | `Bulk grading finished: 2 graded.` | 2 | 2 | yes | unchanged |

The log kinds after the change: in M4 o/b becomes `grade-failed`; in M6 all
three are `grade-failed`; in M7 o/a is `grade-failed`.

---

## 3. Rulings in the brief and the row that the tree disagrees with

Neither value has been adopted silently. Each point names what disagrees and
what this document does about it.

1. **"The trends label counts only results that carry rubric areas"** (the
   brief, and the row's `instrument` field). Measured false. The label counts
   `gradedResults(entry.run.results)` (`classTrendsFolderEntry.ts:110`), which
   excludes only rows with `ungraded` set (`types.ts:179-181`). The rubric-area
   condition is the GATE on whether any trends show at all
   (`hasTrendableResults`, `classTrendsEntry.ts:52-54`), not the count. M8
   shows it: one graded repo with zero areas beside one with areas gives a
   label count of 2. **This does not change A28's shape.** The status line and
   the label agree whenever the gate is open, because both count "graded,
   not ungraded".
2. **"The fix belongs to the status line - probably stating graded and failed
   separately"** (the row's `note`). The status line ALREADY states them
   separately: `bulkGradeSummaryLine` counts `graded`, `failed`,
   `no-submission` and skipped as four separate parts
   (`repoGradesBulkGrade.ts:170-184`), and M2/M3 show `2 graded, 1 failed`.
   Its input, `BulkGradeOutcome` (`:144-159`), carries no field that
   distinguishes a model failure. The only one that could is `status`, and
   the caller sets it to the literal `"graded"`
   (`useRepoGradesBulkGrade.ts:376`). No change inside the summary function can
   fix a value it never receives. **The requirement binds to the outcome
   classification, not to the status line.** The summary function and its
   text are unchanged by this design.
3. **"The older status line counts attempts"** (the row). This is imprecise.
   It counts outcomes whose `status === "graded"`. Attempts that return
   `{ error }` or reject are already counted as failed (M2, M3). Only the
   success-shaped model failure is miscounted.
4. **RES-W3V-3's proposed instrument** (`docs/a16-wave3-verify.md:495`: "A unit
   test driving `bulkGradeSummaryLine` and `repoRunTrendsLabel` over one outcome
   set"). This is rejected as the instrument. It would hand-build the
   `BulkGradeOutcome` list, and building that list is exactly the step that is
   wrong. Such a test compares two values computed in the test, which is the
   recorded class the brief warns about. Section 7 drives the handler instead.
5. **The verification's reading at `docs/a16-wave3-verify.md:307-325` is
   confirmed at current addresses.**
   - `engine.ts:248-270`: a throw inside grading becomes a `grading-failed`
     row.
   - `github-repos.ts:837-840`: that run returns as success.
   - `useRepoGradesBulkGrade.ts:376` records it as `status: "graded"`.
   - `:379` pushes the ungraded row into the run's results.

   Its cite `useRepoGradesBulkGrade.ts:303` is now `:303-304` (where `first` and
   `score` are read), and `:306` is inside the `onCellUpdate` literal. Those
   addresses moved when A26/A27 landed, and the substance holds.

---

## 4. Leverage

The trigger fired: this is a backlog item. There is no claim to make. The row
is `kind: 'bug'` (`docs/backlog.yml:493`), and `DEV_LOOP.md`, "The loop /
Criteria", exempts a bug fix from the leverage claim. No class from
`docs/loop/leverage.md` is claimed, and no removal test is owed.

---

## 5. What the instructor sees (reading claim, from the values in 2.2 and 2.3)

**Today (M4).** A Grade all run over three repos, where one repo's model call
fails:

- The status region reads `Bulk grading finished: 3 graded.`
- Directly below it: `Trends for "week-1" from the last Grade all run,
  covering the 2 repos it graded.`, and the panel's area summaries say "2
  submissions graded so far".
- The failed repo's cell shows an empty score and a Grade button, with no
  error text.
- The activity log records it as "Graded".

**Today (M6)**, where every model call fails: `Bulk grading finished: 3
graded.`, no trends, three empty cells.

**After the change (M4).** The status region reads `Bulk grading finished: 2
graded, 1 failed.` beside `covering the 2 repos it graded.`, and the log
records the failed repo as a grading failure whose detail begins "This
submission could not be graded: ".

**After the change (M6).** The status region reads `Nothing was graded - 3
failed.`

**Unchanged, and deliberately so:** the cell still shows no error line for a
model failure. That is the same as the per-cell Grade button does today. Making
them differ is out of scope (RR-1).

---

## 6. The shape

### 6.1 What changes

1. **`repoGradesBulkGrade.ts` gains one pure export**, `bulkGradeOutcomeFromRun`.
   This is the file that already owns "every DECISION a bulk run needs" (its
   header at `:6-17`) and the summary line the classification feeds.
2. **`useRepoGradesBulkGrade.ts:376` changes from a literal to a call.** It is
   the one line in the tree that turns a success-shaped return into an
   outcome.

   Before:
   ```ts
   outcomes.push({ repo: target.repo, folder: target.folder, status: "graded", score, detail });
   ```
   After:
   ```ts
   outcomes.push(bulkGradeOutcomeFromRun(target, result.run.results, detail));
   ```
3. **Stale comments corrected in the same edit** (these are comments that
   become false):
   - `useRepoGradesBulkGrade.ts:12-14` says a bulk-graded and a one-off-graded
     cell are "indistinguishable to every downstream consumer (posting, the
     activity log, ...)". After this change, a MODEL-FAILED repo is logged
     `grade-failed` by the bulk path and `grade-succeeded` by the per-cell path
     (`useRepoGradesGradingActions.ts:432-438`) until RR-1 lands. The comment
     must say so and name RR-1.
   - `BulkGradeOutcome`'s `status` doc (`repoGradesBulkGrade.ts:144-152`) must
     say that `"failed"` now includes a returned run whose result is ungraded.

**Nothing else changes.** In particular: `bulkGradeSummaryLine`, the summary
text, `classTrendsFolderEntry.ts`, the cell patch at
`useRepoGradesBulkGrade.ts:305-349`, the `runResults` push at `:379`, the
return `{ rubricUsed: result.rubric }` at `:380`, `handleBulkOutcomes`'s kind
mapping (`useRepoGradesGradingActions.ts:725`), and `index.tsx`.

### 6.2 Which layer the user reaches, and how

The user reaches the Grade all button, whose handler is
`handleGradeColumn` (`useRepoGradesGradingActions.ts:764`). The chain from
there:

- `runBulkGrade` (`:784`) runs `gradeBulkPlan` and then `gradeOneTarget`,
  whose changed line is `:376`.
- The outcome reaches `bulkGradeSummaryLine` (`:459`), then `onAnnounce`,
  which is `setPostSummary` (`useRepoGradesGradingActions.ts:739`), and is
  rendered at `index.tsx:845`.
- The same outcome reaches `onOutcomes`, which is `handleBulkOutcomes` (log
  kind mapping at `:725`), and then the log panel (`index.tsx:920`,
  `RepoGradesLogPanel.tsx:149`).

No new surface is needed. The wave contains the caller of the new export,
`useRepoGradesBulkGrade.ts`.

### 6.3 Why here, and the alternatives rejected

| Alternative | Rejected because |
|---|---|
| Change `bulkGradeSummaryLine` (the row's suggestion) | Its input cannot carry the fact (section 3.2). |
| Add `if (isUngraded(first)) { ...; return ... }` inside `gradeOneTarget` | Turns `repoGradesClassTrends.wiring.test.ts` A-1 RED, because it pins `countIfStatements(gradeOneTarget) === 2` (`:162-170`). That rule exists so the `runResults` push cannot be skipped conditionally. Loosening it to fit is forbidden. It would also invite the wrong return value (`rubricUsed: null`, copied from the error branch), which changes the prologue (MU-4). |
| Make the label count outcomes instead of results | `classTrendsFolderEntry.ts` is barred from reaching `repoGradesBulkGrade` at all (`:19-28`: it would reach `@/lib/canvas-url` through `repoGradesPosting`, which is banned by its canary-3 root). It would also move the correct count to match the wrong one. |
| Filter ungraded rows out of `runResults` | The label's count already excludes them (`gradedResults`), so this changes nothing visible. It violates the cohort-by-reference rule (`classTrendsFolderEntry.ts:39-41`) and trips A-1. |
| A new file for the classifier | Every new non-test `.ts` in this directory must be added to `FROZEN_REPO_GRADES_ROOTS` (`repoGradesFeedbackAndFiles.wiring.test.ts:293-329`, "exactly the 33 frozen basenames"). An existing leaf avoids that edit and that risk. |
| Also fix the per-cell path and the cell's error line | This is a real defect of the same class, but not a count on this screen, and it changes what a cell shows. That is a UX decision the bulk and per-cell paths must make together. It is routed as RR-1, not folded in. |

### 6.4 Precondition this design relies on, checked

The classifier reads `results[0]`, and the label counts ALL of `results`. The
two are equal only if each repo contributes exactly one result. Opened:

- **LLM path.** `github-repos.ts:837-838` calls `gradeEntries([entry], ...)`
  with one entry, and `engine.ts:238-270` pushes exactly one result per index,
  either graded or `grading-failed`.
- **Embedded path.** `github-repos.ts:818` passes `entries = [one entry]` to
  `gradeEntriesEmbedded` (`src/lib/embedded-grader/index.ts:119`), which
  returns `entries.map(...)`, one per entry.

So the precondition holds on both engines by reading. It is not
machine-pinned; the tests mock `gradeRepoAction`. If a future change returns
several results per repo, R-1 below still catches any disagreement in the
cases it runs, but not in cases it does not.

---

## 7. The contract

In `src/app/components/repo-grades/repoGradesBulkGrade.ts`, at the top-level
imports:

```ts
import { isUngraded, type GradeResult } from "@/lib/grade/types";

/**
 * The ONE decision that turns a success-shaped gradeRepoAction return into a
 * BulkGradeOutcome. "graded" iff the run's first result exists and is not
 * ungraded (types.ts isUngraded - never a totalScore or prose test).
 */
export function bulkGradeOutcomeFromRun(
  target: BulkGradeTarget,
  results: readonly GradeResult[],
  successDetail: string,
): BulkGradeOutcome;
```

The rules, all four required:

- **(a)** When `results[0]` is `undefined`, return `status: "failed"`,
  `score: ""`, and `detail` set to
  `"Grading returned no result for this folder."`, joined with `" | "` to
  `successDetail` when `successDetail !== ""`.
- **(b)** When `isUngraded(results[0])`, return `status: "failed"`,
  `score: ""`, and `detail` set to `results[0].ungraded.message`, joined the
  same way to `successDetail`. The join keeps the rubric note that
  `useRepoGradesBulkGrade.ts:350-362` says must never be discarded, and
  `ungraded.message` already carries `GRADING_FAILURE_PREFIX`. This covers
  both `grading-failed` and `not-attempted`.
- **(c)** Otherwise, return `status: "graded"`, `score: results[0].totalScore`
  and `detail: successDetail`. This is byte-identical to today's literal at
  `:376` (the same `score` expression without the `?? ""`, which is now
  unreachable).
- **(d)** `repo` and `folder` come from `target`, never from the result.

**Client-bundle safety.** `@/lib/grade/types` is already a value import inside
this directory's walked closure: `classTrendsFolderEntry.ts:29` imports
`gradedResults` from it, and `repoGradesFeedbackAndFiles.wiring.test.ts`
R-1/R-3/R-4 pass today. So adding it here adds no new reachable module. The
wave gate re-runs that walk.

---

## 8. Instruments and mutants

### 8.1 Tests (written FIRST; T-1 must be RED on HEAD before any source edit)

**T-1: the agreement table.** Add a new `describe` block to
`src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts`,
reusing that file's own harness (no cross-test import).

- It drives `handleGradeColumn` for cases M1-M8 of section 2 through the
  file's `makeParams` with `rows` overridden, and captures:
  - `announceCalls.at(-1)`, which is what `setPostSummary` received, the
    value `index.tsx:845` renders;
  - `repoRunTrendsLabel(render.trendsEntry)` from a fresh `useTestRender()`
    after the run, the value `index.tsx:855` renders.
- The model-failed fixture is typed `GradeResult` (so `tsc` holds its shape
  to the union) and carries `ungraded: { kind: "grading-failed", ... }` with a
  `GRADING_FAILURE_PREFIX` message.
- Two regexes produce the numbers, neither with the `/s` flag:
  - status: `/(\d+) graded/`, or 0 when the line starts with
    `Nothing was graded`;
  - label: `/covering the (\d+) repos? it graded/`.
- It also pins the eight status lines as a **frozen literal oracle**, taken
  from the "after the change" column of 2.3. It does not recompute them.

**T-2: the classifier, by value.** Add to
`src/app/components/repo-grades/repoGradesBulkGrade.test.ts`:
`bulkGradeOutcomeFromRun` over

- an empty `results`;
- a `grading-failed` row;
- a `not-attempted` row;
- a graded row;
- `successDetail` both `""` and non-empty.

Each expected outcome is written as a literal.

### 8.2 Requirements (pass conditions)

| Id | Object under comparison | Instrument for each quantity | Fails (direction) |
|---|---|---|---|
| R-1 | Per case M1-M8 with a non-null `trendsEntry`: the status-line graded count against the label count | Status: the regex over `announceCalls.at(-1)` from `handleGradeColumn`. Label: the regex over `repoRunTrendsLabel(useTestRender().trendsEntry)` | RED if the two numbers differ in ANY such case. RED also if `trendsEntry` is non-null and the status line starts `Nothing was graded`. The condition ranges over the whole table, not one row |
| R-2 | The status line per case, against the frozen literal in 2.3 | String equality on `announceCalls.at(-1)` | RED on any difference. Catches MU-3, which R-1 alone passes |
| R-3 | M6: a run in which every model call failed | `announceCalls.at(-1)` | RED unless exactly `Nothing was graded - 3 failed.` (RULE 5, `repoGradesBulkGrade.ts:161-168`, enforced at the handler for the first time) |
| R-4 | M7 (blank resolved rubric): the prologue's shared rubric survives a model-failed first attempt | `gradeRepoActionMock.mock.calls`: the count, and argument index 2 for o/b and o/c | RED unless there are exactly 3 calls AND o/b and o/c each receive the rubric string o/a's stub returned. Catches MU-4 |
| R-5 | M4: the logged kind and detail for the model-failed repo | `recordLogCalls` entry for `o/b` | RED unless `kind === "grade-failed"` AND `detail.startsWith(GRADING_FAILURE_PREFIX)` |
| R-6 | The classifier's four rules (7a-7d) | T-2, by value | RED on any field mismatch |
| R-7 | The scope boundary: M4's cell state for o/b | `cellEditsState["o/b"]["week-1"]` | RED if `gradeError` is non-null or `score` is non-empty. This keeps the bulk and per-cell cells identical until RR-1 decides otherwise, and stops an implementer from exceeding the brief |
| R-8 | Existing structural pins stay green: A-1 (2 ifs in `gradeOneTarget`, a direct push), `runResults` referenced exactly 3 times (`repoGradesClassTrends.wiring.test.ts:259-260`), the 33 frozen roots, the five-field `onCellUpdate` pin (`repoGradesFeedbackAndFiles.wiring.test.ts:250-261`), the four log-kind literals (`repoGrades.wiring.test.ts:788-792`) | `npm run test:paths` over the owns list (section 9): every argument `COVERED` | RED on any failure or any `NOT COVERED` line. The pass count may only rise from the baseline in 9.3 |

### 8.3 Mutants (the test seat owes the sabotage run; the expected verdict for each)

| Mutant | Change | Expected |
|---|---|---|
| MU-1 | Restore the literal `status: "graded"` at the call site. This is HEAD. | R-1 RED on M4/M5/M7. R-2 RED. R-3 RED. R-5 RED. Already measured in 2.2 |
| MU-2 | The classifier ignores `isUngraded` and returns "graded" when `results[0]` exists | Same as MU-1 |
| MU-3 | The classifier returns `status: "no-submission"` for an ungraded row | R-1 GREEN (status `2 graded, 1 had nothing submitted` beside label 2). **R-2 RED.** This is why R-2 exists |
| MU-4 | Instead of the classifier, an early `if (isUngraded(first)) return { rubricUsed: null }` | A-1 RED (3 ifs). R-4 RED: o/b receives `""` and generates its own rubric |
| MU-5 | The classifier drops `successDetail` on failure | T-2 RED |
| MU-6 | The classifier reads `results.at(-1)` | T-2 GREEN on one-element inputs. The test seat must add a two-element input (graded first, ungraded second) so rule 7c's "first" is pinned; expected RED |

---

## 9. Write set and `owns`

### 9.1 Write set (the wave's `git status --short` must show exactly these)

```
M src/app/components/repo-grades/repoGradesBulkGrade.ts
M src/app/components/repo-grades/useRepoGradesBulkGrade.ts
M src/app/components/repo-grades/repoGradesBulkGrade.test.ts
M src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts
```

`useRepoGradesBulkGrade.ts` is the caller of the new export, so the wave is
not dead code. Sizes, measured with `@(Get-Content <file>).Count` from
PowerShell at HEAD, with an estimate after the change:

| File | Lines at HEAD | Estimated after |
|---|---|---|
| `repoGradesBulkGrade.ts` | 185 | ~215 |
| `useRepoGradesBulkGrade.ts` | 467 | ~472 (one line changes, and the comment is corrected) |
| `repoGradesBulkGrade.test.ts` | 232 | ~290 |
| `useRepoGradesBulkGrade.lifecycle.test.ts` | 395 | ~520 |

None is near the 1000-line ceiling.

### 9.2 Tests that read the edited files, derived by command

The command, run from the repo root in Git Bash:

```
for f in useRepoGradesBulkGrade repoGradesBulkGrade useRepoGradesGradingActions; do echo "== $f"; grep -rln --include=*.test.ts "$f" src | sort; done
```

Output, pasted:

```
== useRepoGradesBulkGrade
src/app/components/recording/useTakeAnnouncement.test.ts
src/app/components/repo-grades/repoGrades.wiring.test.ts
src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts
src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/app/components/repo-grades/repoGradesRubricPicker.wiring.test.ts
src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts
src/app/components/repo-grades/useRepoGradesBulkGrade.test.ts
== repoGradesBulkGrade
src/app/components/repo-grades/repoGradesBulkGrade.test.ts
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/app/components/repo-grades/repoGradesFolderSelection.test.ts
src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts
src/app/components/repo-grades/useRepoGradesBulkGrade.test.ts
== useRepoGradesGradingActions
src/app/components/repo-grades/repoGrades.wiring.linking.test.ts
src/app/components/repo-grades/repoGrades.wiring.test.ts
src/app/components/repo-grades/repoGradesCellEdits.test.ts
src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts
src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/app/components/repo-grades/repoGradesRubricPicker.wiring.test.ts
src/app/components/repo-grades/repoGradesSliceA.guards.test.ts
src/app/components/repo-grades/repoGradesSliceB.guards.test.ts
src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts
```

The third name, `useRepoGradesGradingActions`, is included because the new
test drives that file. The file itself is NOT edited.

**Classification.** Two entries in that output mention a name only in a
comment, so they are checked-safe:

- `useTakeAnnouncement.test.ts:5` mentions `useRepoGradesBulkGrade.test.ts`
  in a comment;
- `repoGradesFolderSelection.test.ts:63` mentions `repoGradesBulkGrade.ts` in
  a comment.

The following read an edited file as SOURCE TEXT. They are adopted as run-only
readers, and each assertion that touches the change was opened:

- `repoGradesClassTrends.wiring.test.ts`: A-1 and the `runResults` count;
- `repoGradesFeedbackAndFiles.wiring.test.ts`: the `gradeOneTarget`
  five-field slice from `const gradeOneTarget = async` to `// U12.50`, the
  frozen roots, and the runtime-graph walk;
- `repoGradesCodeExecution.wiring.test.ts:40` and
  `repoGradesRubricPicker.wiring.test.ts:54`: `bulkGradeSource`;
- `repoGrades.wiring.test.ts`.

The design keeps every one of those pinned strings. The `gradeOneTarget` body
still contains every five-field literal, the two `if`s, and one push.

Repo-wide readers that read every file under `src/`:

- `src/file-size-ceiling.structure.test.ts`
- `src/source-bytes.structure.test.ts`
- `src/lib/no-emojis.test.ts`

Checked-safe by reading: `classTrendsDraft.not-postable.test.ts` roots at
`classTrendsFolderEntry.ts` (`:232`), which does not import either edited
file.

### 9.3 The gate (PowerShell, repo root)

```
npm run test:paths -- src/app/components/repo-grades/repoGradesBulkGrade.test.ts src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts src/app/components/repo-grades/useRepoGradesBulkGrade.test.ts src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts src/app/components/repo-grades/repoGradesRubricPicker.wiring.test.ts src/app/components/repo-grades/repoGrades.wiring.test.ts src/app/components/repo-grades/classTrendsFolderEntry.test.ts src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts
```

**Baseline.** The first nine paths were measured at HEAD by this seat with the
same wrapper:

- summary: `Test Files 9 passed (9)`, `Tests 252 passed (252)`;
- per file:
  - `repoGradesBulkGrade.test.ts` 17
  - `useRepoGradesBulkGrade.lifecycle.test.ts` 7
  - `useRepoGradesBulkGrade.test.ts` 5
  - `repoGradesClassTrends.wiring.test.ts` 42
  - `repoGradesFeedbackAndFiles.wiring.test.ts` 31
  - `repoGradesCodeExecution.wiring.test.ts` 40
  - `repoGradesRubricPicker.wiring.test.ts` 29
  - `repoGrades.wiring.test.ts` 54
  - `classTrendsFolderEntry.test.ts` 27

The three repo-wide files were not in that run, so their baseline is owed at
the wave gate.

**Then:**

- `npx tsc --noEmit`: the single caller, no output;
- `npm run lint`;
- `git status --short` against 9.1;
- a check that no `.claude/worktrees/friendly-meninsky-8032bc` copy was edited.

---

## 10. Waves

There is one wave, because the write set is four files in one directory.

1. Write T-1 and T-2. Run the gate and record T-1 RED on HEAD. The expected
   failures are M4, M5 and M7 on R-1, every changed literal on R-2, M6 on R-3,
   and M4 on R-5. T-2 fails to import until the export exists.
2. Add the classifier, change `:376`, and correct the two comments.
3. Run the gate. Every row in 8.2 must be green.

The sabotage pass (8.3) comes after that, by the test seat, with a copy-backup
restore, never `git checkout --`.

This change is trivially revertible: no migration, no persisted-key shape,
and no shared function changed.

---

## 11. Seat triage (the trigger that fired)

| Seat | Runs? | Trigger |
|---|---|---|
| Acceptance criteria | yes | never triaged out |
| Architect | this document | more than two existing files touched |
| User experience | yes, small | visible copy changes on two surfaces: the status line in M4/M6/M7, and the log entry kind. It owes a ruling on whether "failed" is the right word for a model failure, where the alternative is a fifth bucket. **This design recommends "failed"**: the cell carries "This submission could not be graded", which is a failure in the instructor's terms, and a fifth bucket would add a word the per-cell path does not have |
| Data / storage | out | the activity log is persisted per course (`loadRepoGradeLog`, `repoGrades.wiring.test.ts:798`), but no shape changes. A different `kind` value from the existing union is written |
| Security, Reliability, Operability, Visual | out | no new egress, resource, configuration or layout |
| Accessibility | out | the same single `role="status"` region, and one message per run as today |
| Baseline | yes | `grep -a "Bulk grading finished" docs/REGRESSION.md` returned nothing (exit 1). The only mention of the status line is entry 434's `onAnnounce(bulkGradeSummaryLine(outcomes, plan))` (`docs/REGRESSION.md:44464`). The model-failed classification is not baselined (RR-2) |
| Test seat | yes | never triaged out. Section 8 fixes what it must measure |

---

## 12. Disposition of prior requirements

| Prior requirement | Disposition |
|---|---|
| RES-W3V-3 (`docs/a16-wave3-verify.md:495`): "the label's count and the status line's graded count disagree when a model call fails" | **Kept** as R-1, R-2, R-3 and R-5. **Its named instrument is withdrawn**, because a hand-built outcome set compares test-computed values (section 3.4). The replacement drives the handler. Its owner line said "the repo owner (a wording decision)". No wording decision is needed: the existing wording is correct once the input is. The "failed" versus a-fifth-bucket question goes to the UX seat (section 11) |
| A28 row `note`: "make the status line say graded and failed separately" | **Withdrawn**, because the status line already does (section 3.2). No enforcer is lost; the summary function's own tests in `repoGradesBulkGrade.test.ts` (`describe("bulkGradeSummaryLine"`, `:156`) are unchanged |
| RULE 5 (`repoGradesBulkGrade.ts:161-168`): nothing graded must read as nothing graded | **Kept.** Enforced today only over hand-built outcomes (`repoGradesBulkGrade.test.ts:156-230`). This design adds R-3, which enforces it at the handler |
| U12.50 one-rubric-per-run (`useRepoGradesBulkGrade.ts:383-402`) | **Kept**, and pinned for the model-failed-first-attempt case by R-4, which is new |

---

## 13. Residual register

Each entry names an owner, an instrument and a step. None is in
`docs/BACKLOG.md` yet: this seat's write set is this document alone, so the
orchestrator must append RR-1 to RR-3 at disposal. Until then they are
deletions with extra steps (`DEV_LOOP.md` step 0).

| Id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| RR-1 | The per-cell Grade button has the same misclassification. `handleGradeCell` logs `grade-succeeded` for a model-failed result (`useRepoGradesGradingActions.ts:432-438`). In BOTH paths the cell of a model-failed repo shows no error line (`gradeError: null`; `RepoGradeCellControl.tsx:633-635`). After A28, the bulk and per-cell logs differ for that case (section 6.1.3) | Orchestrator: append a new backlog row. Then a UX and architect scope, because it changes what a cell shows in two paths | A lifecycle test driving `handleGradeCell` with a `grading-failed` result, asserting the log kind and `gradeError` | The scope of that new row, sequenced after A28's push |
| RR-2 | `docs/REGRESSION.md` has no baseline of "a model-failed repo is counted graded by the bulk status line" (section 11, Baseline) | Baseline seat | `grep -a` over `docs/REGRESSION.md`, then an appended entry with the M1-M8 values from 2.2 | Before hand-off to the implementer (`DEV_LOOP.md`, "Baseline") |
| RR-3 | The rendered adjacency of the status line and the label, and the literal text on screen, are reading claims | Owner (needs a browser and a live key) | A real Grade all run on a column where one repo's model call fails | The owner-only list at the push. Escalate once |

---

## 14. What I could not determine

- **Whether a real model failure reaches `engine.ts:248` as a throw** inside
  `gradeRepoAction`, rather than as an outer `{ error }`. That depends on live
  provider behaviour. There are no keys here (`docs/loop/this-repo.md`
  section 6). The design holds either way: the `{ error }` path already
  agrees (M2).
- **How often an instructor actually hits M4.** It is not measurable here.
- **Anything about the screen** beyond the strings in 2.2 and 2.3. No
  component renders under vitest.

---

## 15. Tree state at hand-off

Produced by `git status --short`, run after writing this file. The output is
reported in the seat's final message, not here, because this file cannot
contain its own post-write state.

The only change this seat made to the working tree is this file. The sandbox
copies live under the session scratchpad, not the repo. `docs/css-orphans.md`
(modified before this seat started) and `docs/a29-ac.md` (committed at `5fc1978`, then shown modified by a concurrent writer during this pass) were not
touched.
