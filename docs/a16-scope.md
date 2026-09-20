# A16 scope, revision 3: a grading RUN produces trends, shown with that tool

Seat: SCOPING, revision 3. Authored 2026-09-20.

**Tree state at authoring**, and it moved since revision 2: `git status --short`
returns **nothing** and `git rev-parse --short HEAD` returns **`4bd903e`**.
Revision 2 was written against `d4c32cc` with 15 dirty paths (A11's build).
**A11 has landed** - `git log --oneline -8` shows `5984e08 feat(grading):
snapshot grading fills the Strengths box, and says so when it cannot`. Every
"blocked because A11 holds this directory" clause in revision 2 is therefore
stale and is disposed of below. I edited only this file.

**Measurement instrument for every line count below**, from PowerShell at the
repo root:

```powershell
@(Get-Content <path>).Count
```

`Measure-Object -Line` is never used. Every other quantity names its own
command inline. Where a revision-2 number moved, section 9 says so.

---

## The three owner answers

> **ANSWER 1.** "A series of assignments" means ONE RUN OVER MANY STUDENTS'
> SUBMISSIONS FOR THE SAME ASSIGNMENT. Cross-assignment accumulation is a
> separate future row and is not designed for here.

> **ANSWER 2.** The recording tool's data gap is fixed INSIDE A16. A silent
> "Trends (0)" panel is worse than no panel.

> **ANSWER 3, 2026-09-20.** A RECORDING-TOOL TREND COVERS THE ROWS THAT RUN
> JUST GRADED - not every row carrying the assessment label. "Define the cohort
> from the run, not from the live text field."

All three are in `docs/backlog.yml` row A16's `note` (row id at
`docs/backlog.yml:359`, located by `grep -n "id: 'A16'" docs/backlog.yml`).
Answer 3 is the one that reshapes this revision; it is section 2.2.

---

## 0. Disposition of revision 2, item by item

`iteration-caps.md` entry gate 3: a restructuring round ships a table mapping
each prior requirement to **kept (with its new id)**, **handed over (naming
receiver and obligation)**, or **withdrawn (with reason and any enforcer it
protected)**. Revision 2 failed this by mapping three whole blocks to
"REVISED | Section N", which is not a legal disposition. Every V, S and chunk
id is listed individually below. Nothing is silently dropped.

### 0.1 Chunks

| Rev-2 id | Disposition | Detail |
|---|---|---|
| A16-1 (adapter + prop + mount in `GradingResults.tsx`) | **KEPT as A16-1, SCOPE GROWN** | Now carries the `GradingResults.tsx` extraction *before* its own code (section 4.4, blocker B4) and a required `assignmentName` prop threaded to all three call sites (section 4.3, major M3). |
| A16-2 (recording data fix, H1-H12) | **KEPT as A16-2, SCOPE REDUCED** | H10 withdrawn (0.4). H1-H9, H11, H12 kept. |
| A16-3 (recording cohort + mount + extraction) | **KEPT as A16-3, MECHANISM REPLACED** | The cohort is the run, not the label (section 2.2). |
| A16-4 (snapshot grading, gated on A11) | **KEPT as A16-4, ONE BLOCKER DISCHARGED** | A11 has landed (`git status --short` empty), so the directory-held blocker is gone. The **batch-boundary** blocker stands unchanged and is still the reason A16-4 does not mount a panel (section 2.3). |
| A16-5 (Repo Grades) | **KEPT as A16-5, unchanged** | Deferred for size only. |

### 0.2 Verify conditions V1-V19

**Disposal round correction (blocker B-1).** The "New id" column below is
re-derived from section 7 as it actually stands after this round's edits
(rebuilt LAST, after S1's section-2.2 rewrite and V33's replacement, per the
ruling that disposed this blocker - renumbering before the content settled
would have re-broken it). The round-3 check found 25 of 41 rows citing an id
that names a DIFFERENT requirement in section 7/8 - mostly because section 7
grew past a single flat V1-V19 run into three named groups (A16-1's V1-V15,
A16-2's V16-V24, the wave gate's V25-V28, A16-3's V29-V34) and several rows
below kept their OLD rev-2 number instead of picking up their new one. Every
id below was checked against section 7's current row-by-description, not
copied from the previous draft.

| Rev-2 | Disposition | New id / reason |
|---|---|---|
| V1 mount renders `<ClassTrendsPanel` | **KEPT** | V1. Moves file: the assertion lives in the existing `gradingResultsExtraction.wiring.test.ts`, not a new file (B4). |
| V2 mount is guarded by `hasTrendableResults` | **KEPT** | V2, same file move. |
| V3 adapter emits `student: ""`, no `userId`, length preserved | **WITHDRAWN AND REPLACED** | Reason and the enforcer it would have created: blocker B7. Replaced by **V3 (run-reference identity)**. The `student: ""` half is withdrawn outright; it protected no existing enforcer and would have created one that forbids exactly the field N13b needs. |
| V4 `hasTrendableResults` enumerated product | **KEPT** | V4. |
| V5 `computeClassTrends` before first `fetch(` | **KEPT unchanged** | V5. Existing landed assertion, `classTrends.wiring.test.ts:79-88`. |
| V6 Drafted Grades mount tag unchanged | **KEPT unchanged** | V6. |
| V7 `expanded` seeded from the new prop | **KEPT** | V7. |
| V8 line counts vs 1000 | **KEPT** | **V14** (A16-1's own line-count row; A16-2's parallel line-count row is V23). Corrected: section 7's own V8 is now the panel never reading `.student` (the privacy pin), a different requirement. |
| V9 whole suite | **KEPT** | **V15** (A16-1's own whole-suite row; A16-2's parallel run is V24). Corrected: section 7's own V9 is now layer C's four canary-3 roots plus the new adapter leaf, a different A16-1 requirement. |
| V10 `npx tsc --noEmit` | **KEPT, OWNER NAMED** | **V25**. Major M1: one caller, named in section 6.6. Corrected: V10 in the current section 7 is `assignmentName` reaching the three call sites, an A16-1 requirement, not this one. |
| V11 `composeGradingRowResult` returns scaled areas | **KEPT** | **V16**. Corrected: section 7's V11 is now the per-area score cells routing through the shared helper (`rubricBreakdownPercent.wiring.test.ts`), an A16-1 requirement. |
| V12 `composeFailedGradingRow` returns `[]` | **KEPT** | **V17**. Corrected: section 7's V12 is now the modal-adoption counts (A16-1). |
| V13 action's per-row key set | **KEPT, RESPECIFIED BY SYMBOL** | **V18**. Blocker B5: the rev-2 line numbers were wrong at the edit point. Corrected: section 7's V13 is now `assignmentName` reaching all three call sites (A16-1), a different requirement entirely. |
| V14 `classifyGradingResult` success/failure | **KEPT** | **V19**. Corrected: section 7's V14 is now the line-count row (A16-1). |
| V15 `applyGradingResultToRow` both `userEdited` values | **KEPT** | **V20**. Corrected: section 7's V15 is now the whole-suite row (A16-1). |
| V16 `toWire` 17-key set | **WITHDRAWN AND REPLACED** | H10 is withdrawn (0.4). Replaced by **V21 (the 16-key oracle is UNCHANGED and must stay unchanged)**. Corrected id (section 7's own V16 is now `composeGradingRowResult`'s return, a different requirement). The enforcer it protected - `grading-row-serialization.test.ts:620-637`, `EXPECTED_WIRE_KEYS` - is not weakened. **It is not "strengthened" either: the oracle is byte-identical, so its assertion strength is unchanged.** What changed is that A16-2 creates a new way to break it (S21), which the unchanged oracle is already positioned to catch. |
| V17 `fromWire` legacy/corrupt tolerance | **KEPT, RESTATED** | **V22**. Corrected (section 7's own V17 is now `composeFailedGradingRow`'s return). Now: `fromWire` emits `rubricAreas: []` unconditionally, because `toWire` never writes the key. |
| V18 round trip through the real codec | **WITHDRAWN** | There is nothing to round-trip once the field is not persisted. Enforcer it protected: none existed; it was a new assertion. Its purpose - catching a write side and a read side that each look plausible and disagree - is discharged by V21, which now forbids the write side existing at all. |
| V19 "as V8, V9, V10" for A16-2 | **WITHDRAWN AS WRITTEN** | Major M1: it handed the single-caller `tsc` row to a second concurrent chunk. Replaced by **V23** (line counts plus the structural gates, single-path vitest, A16-2), with `tsc` owned once by the wave gate at **V25** and A16-2's own whole-suite run at **V24**. |

### 0.3 Sabotages S1-S22

**Disposal round correction (blocker B-1), same method as 0.2.** A16-1's own
sabotage table grew from 8 rows to 11 between revisions (the privacy-pin
sabotage, the canary-3-root sabotage, and the dropped-`assignmentName`
sabotage were added), which shifts every A16-2 id below it by +3. The "New
id" column is re-checked against section 8 as it now stands, not carried
forward by the old count.

| Rev-2 | Disposition | New id / reason |
|---|---|---|
| S1 delete the mount tag | **KEPT** | S1. |
| S2 remove the guard | **KEPT** | S2. |
| S3 emit `student: row.studentName` | **WITHDRAWN** | B7. This sabotage's "RED" outcome is the behaviour N13b requires. Replaced by **S3**: the adapter rebuilds `run.results` instead of passing the run by reference. |
| S4 adapter drops ungraded rows | **KEPT, REFRAMED** | S4, now a consequence of S3's reference pin. |
| S5 `hasTrendableResults` returns `results.length > 0` | **KEPT** | S5. |
| S6 move `computeClassTrends` inside `requestInsight` | **KEPT** | S6. |
| S7 hardcode `useState(false)` | **KEPT** | S7. |
| S8 paste 100 filler lines into `GradingResults.tsx` | **KEPT** | **S11**. Corrected: section 8's own S8 is now the privacy-pin sabotage (`entry.run.results[0].student`), added since this item was last numbered. |
| S9 delete `rubricAreas` from the compose return | **KEPT** | **S12**. Corrected: section 8's own S9 is now the canary-3-root sabotage (importing `postCanvasGradesAction` into the adapter leaf). |
| S10 return `parsed.rubricAreas` unscaled | **KEPT** | **S13**. Corrected: section 8's own S10 is now dropping the `assignmentName` prop at `LiveFeedPanel.tsx:430`. |
| S11 failure row carries the last success's areas | **KEPT** | **S14**. |
| S12 revert the action oracle to six keys | **KEPT** | **S15**. |
| S13 add `student` to the action's pushed result | **KEPT** | **S16**. |
| S14 drop areas from the success branch | **KEPT** | **S17**. |
| S15 pass areas through on the failure branch | **KEPT** | **S18**. |
| S16 remove the explicit `rubricAreas:` in `applyGradingResultToRow` | **KEPT** | **S19**. Still the load-bearing one. |
| S17 gate the write behind `!row.userEdited` | **KEPT** | **S20**. |
| S18 add the key to `toWire` without updating the list | **KEPT, DIRECTION PRESERVED, ORACLE UNCHANGED** | **S21**. Now run against the UNCHANGED 16-key oracle: the oracle was never widened, so it cannot have been loosened. |
| S19 remove the key from `toWire` with the list at 17 | **WITHDRAWN** | Unreachable: the list stays at 16 and `toWire` never gains the key. Enforcer it protected: none; it was the second half of a pair whose first half (now S21) survives. No id - a withdrawn-with-no-replacement item gets none. |
| S20 `dropBulk: true` deletes rather than blanks | **KEPT unchanged** | No A16 id - this is not one of A16's own numbered sabotage rows. It is the existing, pre-A16 assertion at `grading-row-serialization.test.ts:644-650`, cited inside V21's RED description, untouched by A16. |
| S21 `fromWire` returns `raw.rubricAreas` unguarded | **KEPT, RESTATED** | **S22**: `fromWire` reads the key at all, instead of emitting `[]`. |
| S22 make `GradingRow.rubricAreas` optional | **WITHDRAWN AND REPLACED** | Major M2: the null result was avoidable. Weakening a required field to optional cannot break a caller - that is a property of the mutation direction, not a finding. Replaced by **S23**, the strengthening direction: delete `rubricAreas` from the production constructor at `src/lib/course-intel/offline-payload.ts`'s `buildGradingRow` and watch `tsc` go red. |

A16-3's own sabotages (S24, S25) are new to this revision - they dispose
blocker B-2 and the S8 mount-removal-test gap respectively (section 8) and do
not correspond to any rev-2 item, so they are not rows in this table.

### 0.4 Rulings, requirements and residuals carried from revisions 1-2

| Rev-2 item | Disposition | Detail |
|---|---|---|
| F1 recording discards `rubricAreas` | **KEPT** | Still true; `composeGradingRowResult` destructures it at `grading-feedback-prompt.ts:148` and does not return it. Chunk A16-2. |
| F2 no cross-assignment surface | **WITHDRAWN as a driver** (rev-2 disposition, unchanged) | Owner answer 1. Handed over as the cross-assignment row, section 1.3. |
| F3 trends already in the Tools tab | **KEPT** | Unchanged. |
| Half 1: widen the panel's prop to `{ run, assignmentName }` | **WITHDRAWN** (rev-2 disposition, unchanged) | Protects `classTrends.wiring.test.ts:68`, `:104-106` and `DraftedGradesTab.tsx:627`, all three still untouched. |
| Half 2 item 1a: layer A disclosed by default | **KEPT** | `defaultExpanded` prop. |
| Half 2 item 1b: **the collapse state is persisted** | **WITHDRAWN, with a batched owner question** | Reason: under the run cohort the recording panel exists only while a run's results are in memory (section 2.2), so a cross-reload toggle has nothing to reopen on that surface. **Enforcer it would have MOVED, named:** the exact seven-key `ta-rec-grade-*` set at `grading-rows.test.ts:508-516`, a walker over `grading-recording/` and `assessment-shared/` (`:480-487`). Withdrawing leaves that set untouched. The owner question rides in section 11 and gates nothing. |
| Half 2 item 2: layer B stays opt-in | **KEPT unchanged** | Verified: `requestInsight` (`ClassTrendsPanel.tsx:82`) is called only from the two Buttons at `:148` and `:185`. Nothing fires it on mount. |
| Half 2 item 3: layer C floor stays N13a's | **KEPT unchanged** | `DEFAULT_CLASS_TRENDS_DRAFT_FLOOR = 5`, `class-trends-draft.ts:18`. |
| H1, H2, H3 | **KEPT** | Section 4.5. |
| H4 (action oracle) | **KEPT, CITATIONS REPLACED BY SYMBOL** | Blocker B5. |
| H5, H6, H7, H8, H9 | **KEPT** | H7's "do not edit `assessment-row.ts`" rationale changes: A11 has landed, so the reason is no longer file contention. The *other* reason - the two surfaces' area types genuinely differ - still holds and is now the only one. |
| **H10 (persist `rubricAreas` through `toWire`/`fromWire`)** | **WITHDRAWN** | Reason, and it follows from answer 3: the cohort is a `useState` id set that does not survive a reload, so no reader of a persisted `rubricAreas` exists. **Enforcer it protected:** none - it *moved* one (the 16-key oracle at `grading-row-serialization.test.ts:620-637`), and withdrawing leaves that enforcer intact at 16 keys. Consequence recorded as RES-A16-13. |
| H11 (read-back tolerance) | **KEPT, RESTATED** | `fromWire` emits `rubricAreas: []`, never reads the key. |
| H12 (the hook forwards the widened alias) | **KEPT** | In `owns` as a caller. |
| Section 4.3's three mount states | **KEPT, REDUCED TO TWO** | Section 4.6. Disposal round, blocker B-5: the middle state ("graded but unscorable") had no predicate of its own and no verify row; dropped rather than given one. |
| The "adapter emits `student: ""`" construction | **WITHDRAWN** | Blocker B7. Replaced by section 4.2. |
| RES-A16-1 (series-of-assignments) | **WITHDRAWN** (rev-2 disposition) | Handed to the cross-assignment row. |
| RES-A16-2 (recording discards areas) | **PROMOTED to A16-2** (rev-2 disposition) | Unchanged. |
| RES-A16-3 (`not-postable` hardcoded roots) | **KEPT and PROMOTED INTO SCOPE** | Blocker B3: `ClassTrendsPanel.tsx` is itself a canary-3 root (`classTrendsDraft.not-postable.test.ts:213-218`) and A16-1 EDITS it, so that file is in `owns` now, not a residual. The *adapter-leaf* half stays a live requirement, in A16-1 and A16-3. |
| RES-A16-4 (nothing renders) | **KEPT** | Section 10. |
| RES-A16-5 (cartridge drop untraced) | **DISCHARGED** (rev-2 measurement) | Out of scope, measured. |
| RES-A16-6 (no REGRESSION baseline) | **KEPT, NUMBER MOVED** | Next entry is now **433**, not 432 - A11 landed entry 432. Section 10. |
| RES-A16-7 (snapshot has no boundary) | **KEPT** | Section 10. Its A11 half is discharged; its boundary half is not. |
| RES-A16-8 (table holds two assessments) | **KEPT, REFRAMED** | Section 10. The run cohort does not remove this; it makes it *disclosable*. |
| RES-A16-9 (edited score vs model areas) | **KEPT** | Section 10. |
| RES-A16-10 (persisting model prose grows storage) | **DISCHARGED by withdrawing H10** | Nothing model-authored is persisted, so there is nothing to measure. |
| RES-A16-11 (four UI walkers unverified) | **KEPT** | Section 10. |
| RES-A16-12 (`preserve-manual-memoization` on extraction) | **KEPT, WIDENED** | Now covers A16-1's extraction as well as A16-3's. Section 10. |
| Section 8 correction 5 (`this-repo.md` says 964) | **KEPT** | Section 9. |
| Section 8 correction 6 (`class-trends-draft.ts` is 228 not 214) | **KEPT** | Section 9. |
| Section 8 correction 8 (`recording-split` false pass) | **KEPT** | Section 9. |
| The claimed L13 "repo precedent" `/\/\/[^\r\n]*/g` | **WITHDRAWN as misquoted** | Section 9, correction 12: the two cited files do not use that form. |
| **Leverage: class SCALE, "EARNED"** | **WITHDRAWN** | Blocker B2. Replaced by an honest click-cost/reachability claim, section 11. |
| Leverage: class GUARANTEED, inherited | **KEPT unchanged** | It was already stated as inherited and as something A16 must not break. |
| The removal test ("delete the `hasTrendableResults` guard") | **WITHDRAWN as not tracing** | Blocker B2. Replaced, section 11. |

---

## 1. Scope after the three answers

### 1.1 What A16 is

**A RUN of a grading tool produces per-rubric-area trends for the submissions
THAT RUN graded, shown with that tool, without navigating anywhere.** The
cohort is defined by the run, never by a filter, a label or any live control.

### 1.2 What A16 is not

Trends spanning several assignments (answer 1). Trends over "every row that
carries label X" (answer 3).

### 1.3 The cross-assignment row, handed over rather than deleted

- `GradingRunEntry` is one assignment (`src/lib/grade/types.ts:329-338`).
- Its only producers are the workflow grade step
  (`src/lib/workflows/registry/steps.grading-run.ts:425,496`) and
  `GradingDraftPayload.runs` (`src/lib/grading-drafts.ts:33`).
- That payload's consumer is `DraftedGradesTab.tsx:606`, which mounts trends
  per group at `:627` - the site trends already occupies.

**Obligation on the receiver of that new row:** decide whether cross-assignment
trends means a new accumulator or a re-grouping of `GradingDraftPayload.runs`,
and whether `class-trends.ts`'s cohort wording survives it. That wording is a
hard constraint: `class-trends.ts:27-32` (`FORBIDDEN_COMPLETENESS_PHRASES`)
and `buildAreaSummary` (`:207`) emitting "Across the N submissions graded so
far" at `:242`.

---

## 2. The run object, per in-scope grading tool

### 2.1 Summary

| Tool | Run object today | Invented? | Where it lives |
|---|---|---|---|
| LMS Grading - zip / canvas | **YES** | No | `GradeActionState.run: GradingRun \| null` (`src/app/actions-types.ts:80-85`), read at `GradingTab.tsx:133`. One submit replaces it wholesale. |
| LMS Grading - livefeed | **YES** | No | `activeRun` (`LiveFeedPanel.tsx:366`), scoped to the open queue item. |
| LMS Grading - github | **YES** | No | the same `run` object at `GithubGradingPanel.tsx:852`. It also **survives a reload**: `src/lib/github-grading-run-store.ts:357` reads it from `localStorage` and `:186-187,:247` parse and carry `rubricAreas` through, so trends work on a restored run. Verified by `grep -n "rubricAreas" src/lib/github-grading-run-store.ts`. |
| **Grading (from a recording)** | **YES - the click** | No | `handleGradeAll`'s own `submissions` array. Section 2.2. |
| **Grading (from screenshots)** | **NO** | **Would be invented** | Section 2.3. |
| Repo Grades | **YES** | No | `runBulkGrade` over `targets` in one folder (`useRepoGradesBulkGrade.ts:168-178`), one shared rubric fixed before the worker pool opens (`:299-318`). |

### 2.2 Grading (from a recording): the cohort is the run, and the label is not the cohort

**Revision 2 defined the cohort as `rawRows.filter(r => r.assessment === assessmentId)`. That is wrong, and owner answer 3 rules it out.** Three measured reasons, each opened:

1. **That is not the set the tool grades.** `handleGradeAll`
   (`GradingRecordingPanel.tsx:537`) builds `submissions` from
   `gradingRows.rawRows` **unfiltered** at `:561-565`, and submits all of them
   against one `rubricText.trim()` at `:566-571`. Every row in the current
   course scope, across every assessment label, is graded together. The
   label-filtered set is a different object from the graded set.
2. **`assessment` is stamped at CAPTURE time, never at grade time.**
   `grep -rn "setAllRows" src` returns exactly one call site in a component:
   `GradingRecordingPanel.tsx:465`, the extraction sync. The stamp happens
   inside it, at `useGradingRows.ts:362`
   (`stampGradingRowsWithAssessment(stampedCourse, previousScoped,
   assessmentScope)`). The panel says this itself at `:810-813`: the label
   "will apply to submissions captured from then on, not to rows already
   recorded."
3. **The control writes state on every keystroke.** The Autocomplete at
   `:798-807` is `freeSolo` with
   `onInputChange={(_, next) => setAssessmentLabel(next)}` at `:801`, and
   `assessmentId = assessmentLabel.trim()` at `:291`. A label-derived cohort
   changes mid-keystroke: capture 30 rows with the label blank, click Grade
   All, then type `E`, and the cohort empties and the panel disappears - the
   silent-empty state answer 2 exists to prevent, reached from the other
   direction, and **uncatchable here because no component is rendered by any
   test** (`docs/loop/this-repo.md` section 2).

**RULING A16-3-1: the cohort is the run.** The object exists in memory already.

- `handleGradeAll`'s `submissions` array (`:561-565`) carries `id` per row.
- The success branch already mints an ISO timestamp and logs
  `rowCount: submissions.length` at `:606`.

**REVISION 3 CORRECTION (disposal round, blocker B-2).** The design below this
line originally stored `lastRunCohort.ids` and resolved them against
`gradingRows.rawRows` at render time. That is the same defect owner answer 3
already ruled out for the label cohort, reintroduced through a different live
control: `gradingRows.rawRows` is `scopedRawRows`
(`useGradingRows.ts:444-447`), which is filtered by `courseScope` - itself
driven by the live Course `TextField` at `GradingRecordingPanel.tsx:755-770`,
`onChange` at `:760`. Changing the course selector after a run would silently
empty or change the resolved cohort, exactly the "empties and the panel
disappears" failure this section's item 3 already uses to reject the label
cohort. **The fix is to snapshot the resolved row data at run time, not to
assert harder against the live array.**

A16-3 adds ONE piece of state to the panel:

```
lastRunCohort: { at: string; rows: readonly GradingRunCohortRow[] } | null
```

set exactly once, inside `handleGradeAll`, on the branch that reached the apply
loop at `:598-603`. **It snapshots the resolved row data at that moment; it
does not store ids to be resolved against a live array later.**
`GradingRunCohortRow` carries exactly the fields the disclosure line (below)
and 4.6's mapping need: `id`, `studentName`, `assessment`, the `state` the
loop just computed via `classifyGradingResult`, and `rubricAreas` when
`state === "ready"`. It is built from `submissions` (`:561-565`) merged with
each iteration's `classified` result inside the same loop at `:598-603` -
`submissions` is itself already a plain array copied out of
`gradingRows.rawRows` once, at call time, so building the snapshot from it
needs no further read of any live array, before or after. (`submissions`
gains one field it does not carry today, `assessment: r.assessment`, needed
only so the snapshot can carry the multi-label predicate below; nothing else
about it changes.) The snapshot is **never** derived from `assessmentLabel`,
`assessmentId`, `gradingRows.rows`, `gradingRows.filterText` or
`gradingRows.sort`, and after this correction it is also never derived from
`gradingRows.rawRows` a second time. That is the pinnable property, and
section 7's V29 pins the setter half and V33 (corrected below) pins the
render half.

**Why a snapshot, not ids resolved later.** Resolving `ids` against any
course-scoped or otherwise live array makes the cohort's contents a function
of a control the instructor can still touch after the run - the Course
select is exactly such a control, and it is not the only one this tree has
(the label was the first one owner answer 3 struck down). Snapshotting the
row data at the moment `handleGradeAll` applies its results makes that whole
class of bad state unrepresentable: nothing the cohort renders afterward
reads any live array, ever, so there is no live control left that can affect
it.

**What happens to a row deleted after the run.** Because the snapshot no
longer resolves against a live array, a row removed by `capture.onRemoveRow`
after the run stays IN the cohort's trend - the run graded it, and the run's
trend reports what the run graded, not what the table currently holds. This
replaces the earlier draft's "ids with no matching row are dropped": that
behaviour depended on the live-array resolution this correction removes, and
"the trend reports what was graded" is the more honest reading of "a RUN
produced trends" (1.1) than "the trend reports what is still in the table."

**What happens to the contamination hazard answer 1 cares about.** It is not
solved by the label and never was: `handleGradeAll` grades two assignments'
rows together against one rubric whatever the label says. So the honest move is
DISCLOSURE, not filtering. A16-3 emits a cohort line above the panel stating
the count, and - when the snapshot's rows carry more than one distinct
`assessment` value (counting `undefined` as one) - stating that the run spanned
more than one label. Pure predicate over the snapshot rows, in the adapter
leaf, unit-testable. `assessment` becomes the DETECTOR of contamination instead
of the definition of the cohort.

**The cohort does not survive a reload**, because `lastRunCohort` is `useState`
(like the existing `logGradingRuns` at `GradingRecordingPanel.tsx:198`). That is
consistent with "trends are an output of a run": after a reload there is no
run, so there is no panel, which is exactly the pre-run state of section 4.6.
It is also what makes H10 unnecessary (0.4) and what creates RES-A16-13.

### 2.3 Grading (from screenshots): still no boundary, and A11's landing does not change that

The A11 blocker is DISCHARGED - `git status --short` is empty. The boundary
blocker is not. Measured on the current tree (read only; this directory is not
in any A16 `owns`):

- `SnapshotAssessmentRow` (`snapshot-row.ts:122-153`) has **no `course` field
  and no `assessment` field**.
- `grep -n "assessment\|course" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`
  returns only `assessment-shared` imports and "assessment" used as a synonym
  for "a graded row". No course picker, no assessment label.
- The table is not a session: `SnapshotGradingPanel.tsx:931` reads "Completed
  assessments (N) - some may be from an earlier session, restored on reload."
- Each grade produces ONE row: `useSnapshotGrade.ts:254-272` resolves a single
  target and upserts it. **There is no batch click** - which is the difference
  from 2.2, where `handleGradeAll` is the boundary.

| Candidate delimiter | Why not |
|---|---|
| A capture session | There is none; `:931` says so. |
| Wall-clock gap between row ids (`mintSnapshotRowId(Date.now())`, `snapshot-row.ts:158-162`) | Infers intent from timing, out of a debugging artefact. |
| Every graded row in the table | The cross-assignment contamination answer 1 put out of scope, arrived at by accident and with no field to detect it. |

**RULING A16-4-1, unchanged in substance:** snapshot grading needs a run
boundary of its own before it gets a panel. Its first requirement is the
boundary, not the mount. **A16 does not mount a trends panel on snapshot
grading before one exists.**

---

## 3. Surfaces, in or out

| # | Surface | Verdict | Measured reason |
|---|---|---|---|
| 1-4 | LMS Grading: zip, canvas, livefeed, github | **IN, A16-1** | `grep -rn "<GradingResults" src --include=*.tsx` returns exactly three render sites: `GradingTab.tsx:427`, `GithubGradingPanel.tsx:852`, `LiveFeedPanel.tsx:430`. `GradingMode = "zip" \| "canvas" \| "livefeed" \| "github"` (`GradingTab.tsx:26`). ONE mount in `GradingResults.tsx` serves all four. Every result carries `rubricAreas` (required on `GradeResultBase`, `types.ts:213`). |
| 5 | Files > Submissions, cartridge drop | **OUT, measured** | `grep -rn "<CartridgeDropPanel" src --include=*.tsx` returns `FilesTab.tsx:852` and `GradingTab.tsx:457`; the panel holds no `GradingRun` and no `GradingResults`, and `:439` says "grades land in Drafts", which already has trends. |
| 6 | Repo Grades | **IN, A16-5** | `RepoGradeCellEdit.rubricAreas: RubricAreaResult[]` (`repoGradesCellEdits.ts:102`). Real run with one shared rubric (`useRepoGradesBulkGrade.ts:299-318`). Deferred for size: `index.tsx` 913, `RepoGradesGrid.tsx` 643. |
| 7 | Workflows > Drafts > Grades | **IN, unchanged** | The existing mount stays. Fan out, do not move. |
| 8 | Grading (from screenshots) | **IN, A16-4, gated on a boundary** | The row carries `rubricAreas` (`snapshot-row.ts:124`). Blocked by 2.3. |
| 9 | Grading (from a recording) | **IN, A16-2 (data) + A16-3 (cohort + mount)** | Run object exists (2.2); the area data does not (4.5). |
| 10 | Workflow grade steps, unattended | **OUT** | Headless. Nobody is looking at a panel during a cron tick, and the output already flows into a draft, which is surface 7. |
| 11 | Discussion / Message replies and the other Recording sub-tabs | **OUT** | They emit replies, not scores. |
| 12 | `src/lib/embedded-grader/` | **OUT** | A library reached through the paths above; no surface of its own. |

**Floor statement.** This enumeration came from
`grep -rn "<GradingResults" src --include=*.tsx`,
`grep -rln "GradingRunEntry" src`,
`grep -rn "rubricAreas" src/app/components/repo-grades/`, and the
`RecordingTab.tsx:592` strip literal. **It is a FLOOR, not the set.** An
identifier-shaped search cannot find a surface that reaches the same data
another way, and its zero looks exactly like a real absence
(`traps-search.md`). Whoever builds re-derives it with their own instrument,
searching by what a grading surface puts ON SCREEN - a per-student score
column, a rubric-area breakdown, a "Grade" button - as well as by type name,
and reports what this missed.

---

## 4. The mechanism

### 4.1 The panel's input: an adapter, and for A16-1 it does not touch results

`ClassTrendsPanel`'s prop stays `entry: GradingRunEntry`. Each surface builds
one through a pure leaf. Withdrawing the rev-1 prop widening protects three
things that currently cost nothing: `classTrends.wiring.test.ts:68`, the same
file's `:104-106`, and `DraftedGradesTab.tsx:627`.

**For A16-1 the adapter passes `run` BY REFERENCE and rewrites nothing:**

```
toClassTrendsEntry(run, { courseName, assignmentName, canvasUrl }) ->
  { courseName, assignmentName, canvasUrl, run }
```

Three reasons, and the third is the one that matters:

1. It is the minimum. `computeClassTrends` reads only `result.rubricAreas`
   (`class-trends.ts:288`) and the graded/ungraded split (`:272-274`).
2. Any per-result rewrite is where an identity mistake would live. Not
   rewriting removes the class.
3. **It keeps A16-1's entry identical in shape to the one already in
   production.** `DraftedGradesTab.tsx:627` hands the same panel an entry whose
   results carry real `student` values and, where postable, `userId`. An
   adapter that stripped or blanked them would make the new mounts diverge from
   the shipped one for no measured benefit - and would break N13b (4.2).

### 4.2 Identity: what actually protects it, and what A16 must NOT pin (blocker B7)

Revision 2 proposed making a name unrepresentable by constructing
`student: ""` on every adapter, pinned by a landed test that goes RED on any
non-empty student. **Withdrawn.** It would ship a test forbidding exactly the
field the next queued item needs, on all four new mounts.

- **N13b's row requires per-student attribution.** `docs/BACKLOG.md:48`: "count
  and name a SUBSET of students who missed the same area". Naming students
  requires `GradeResultBase.student` (`types.ts:189`).
- **Section 6.3 of revision 2 simultaneously claimed** "N13b then enriches
  every mount A16 created with no further placement work". Both halves were
  individually defensible and together they blocked N13b - the contradiction
  class `traps-spec.md` names ("a design can state a constraint in bold and
  then violate it in a later section").

**What actually protects identity here, all three already landed and all three
left untouched by A16:**

| Guard | Where | What it holds |
|---|---|---|
| The panel never reads `.student` | `classTrends.wiring.test.ts:104-106` (`expect(strippedPanel).not.toMatch(/\.student\b/)`) | No name reaches the screen through this panel. **This is the constraint actually doing the work.** |
| The route never reads it either | `route.ts:123-128`; `anonymizeGradeResults` (`class-trends-insight.ts:59-69`) returns `AnonymizedSubmission` carrying only `slot`, `areas`, `overallComment` - **no field capable of holding a name** | No name reaches a model prompt. |
| Layer B is opt-in | `requestInsight` (`ClassTrendsPanel.tsx:82`) is called only from the Buttons at `:148` and `:185`; nothing fires it on mount | The POST that carries `{ entry }` over the wire (`:87-91`) happens only on an explicit click. |

**What A16 DOES pin, per surface:**

- **A16-1:** `entry.run` is the SAME OBJECT as the input run - reference
  identity. V3 pins it, S3 sabotages it. This forbids filtering, reordering,
  truncating or rewriting results, which is a stronger and more useful pin than
  a field ban, and it is the pin that guarantees N13b's enrichment lands
  everywhere at once.
- **A16-3:** the adapter constructs `GradeResult`s from `GradingRow`s, so it
  must emit `student: row.studentName` (required by `GradeResultBase`, and the
  same screen-read label the table already displays) and **no `userId` key**.
  The absence is already structural - `GradingRow` has no `userId` and
  `grading-row.ts:23-26` says posting one is a compile error, not a discipline
  - but TypeScript is structural at runtime too.
  **Four other `GradeResultBase` required fields have no `GradingRow` source
  at all** (disposal round, ruling S-7b): `resubmitNotice`, `feedback`,
  `mergedFileCount`, `submittedFiles` (`types.ts:189-217` enumerates
  `GradeResultBase`; `GradingRow`/`AssessmentRowCore` carry none of the four).
  `resubmitNotice` is not merely absent but carries its own invariant
  (`types.ts:208-212`: "the exact wording and condition every producer used
  before this feature... every producer must say it identically or not at
  all") - and the recording row already bakes it into `overallComment`
  instead of keeping it separate: `composeOverallComment` at
  `grading-feedback-prompt.ts:153` composes `strengths, improvements,
  resubmitNotice` into one string, so a correct adapter emits
  `resubmitNotice: ""` unconditionally (never re-deriving or repeating the
  notice) and lets the baked-in copy stand inside `overallComment`. `feedback`,
  `mergedFileCount` and `submittedFiles` have no recording-surface equivalent
  at all and are emitted at their zero values (`""`, `0`, `[]`).
- **Both:** the adapter leaf is added to `classTrendsDraft.not-postable.test.ts`'s
  canary-3 roots (`:213-218`), so a posting/persisting import inside it goes
  red. `grading-row.ts:23-26`'s ban is on **persisting** a recording row into
  `grading_drafts`/`GradingRunEntry` - "that store is one approved click from
  `post-grades`". The adapter's output is built in render and handed straight
  to the panel; it is never written anywhere, and that root addition is what
  makes the claim checkable instead of conventional.

### 4.3 `assignmentName`: the identifier-shaped absence, and its consequence (major M3)

Revision 2 concluded `GradingResults.tsx` has no assignment name because
`grep -n "assignmentName" src/app/components/GradingTab.tsx` returns nothing.
The grep is correct and the conclusion is wrong: the name is there under other
identifiers. Exactly the false-absence class in `traps-search.md`.

| Call site | Name available | Evidence |
|---|---|---|
| `LiveFeedPanel.tsx:430` | **YES** - `row.title` | in scope at the mount; rendered at `:376` and `:424` ("Grading {row.title}...") |
| `GithubGradingPanel.tsx:852` | **YES** - the grading folder | the folder state at `:210-249`, labelled "Grading folder (applies to every repo in the queue)" at `:647`. The implementer names the exact binding; this is a floor. |
| `GradingTab.tsx:427` | **NO** | `GradingTabProps` (`:28-49`) carries none. `gradingTarget` (`:65-69`, set only at `:147`) is livefeed-only, while this mount is gated on `source !== "livefeed"` at `:426`. |

**RULING A16-1-1: `GradingResults.tsx` gains a REQUIRED `assignmentName: string`
prop.** Required, not optional, so `tsc` forces all three call sites to answer
rather than letting a default silently ship "". All three enter `owns`
(`parallel-disjointness.md` section 2: an assignment must include the file that
calls the new export). The zip/canvas site ships `""` - one named hole, not a
blanket default.

**The consequence revision 2 did not record, and it is user-facing.**
`ClassTrendsPanel.tsx:192` mounts `ClassTrendsDraftPanel` unconditionally
inside the expanded branch, passing `assignmentName={entry.assignmentName}`.
So every new mount also gets layer C, the **student-facing** draft. With
`assignmentName: ""`:

- `class-trends-draft.ts:185` opens the message "A note on this assignment,
  based on the N submissions graded so far:" (`assignmentName || "this assignment"`).
- the name guard `containsForbiddenCompletenessPhrase(assignmentName)` at
  `:176` is vacuous on `""`.

Neither is a defect - the draft composes nothing until its own button is
clicked (`ClassTrendsDraftPanel.tsx:42-48`) and the floor at `:18`/`:154`
refuses below 5 - but shipping a student-addressed draft on four new surfaces
is a product change. Section 11 carries it as a batched owner question with a
recommendation; it gates nothing.

### 4.4 The `GradingResults.tsx` extraction is IN A16-1, before its own code (blocker B4)

`docs/REGRESSION.md` entry 359 (heading at line 34226 by
`grep -an "^## 359" docs/REGRESSION.md`; the debt at lines 34294-34299 by
`grep -an "extract before it adds" docs/REGRESSION.md`) records a standing
debt:

> `GradingResults.tsx` is now 916 lines against the hard 1000-line cap - 84
> lines of headroom [...] The next feature touching this file should extract
> before it adds, not after.

**A16-1 is that feature.** `@(Get-Content src/app/components/GradingResults.tsx).Count`
returns **916** today; the debt is undischarged. The extraction is inside
A16-1, ahead of its own code - exactly what revision 2 already mandated for the
995-line recording panel, applied consistently.

**Two reuse facts revision 2 got wrong, both from
`Get-ChildItem src/app/components/grading-results`:**

1. **`src/app/components/grading-results/` ALREADY EXISTS, with 11 files**
   (`FeedbackExpandModal.tsx` 61, `gradingResultsExtraction.wiring.test.ts` 197,
   `gradingResultsHelpers.test.ts` 963, `gradingResultsHelpers.ts` 673,
   `gradingResultsPostOutcome.test.ts` 103, `icons.tsx` 38,
   `ResultsTableHeaderRow.tsx` 91, `RowFeedbackBoxes.tsx` 159,
   `sortGradeRows.test.ts` 129, `SubmittedFilesPanel.tsx` 145,
   `useResultsSort.ts` 64). A16-1's leaves are additions to an existing
   directory, not `[NEW]` to a new one.
2. **`gradingResultsExtraction.wiring.test.ts` already holds the pattern the
   proposed `classTrendsMount.wiring.test.ts` reinvents.** Its `read()` helper
   is at `:22-24`; `GRADING_RESULTS_SOURCE = read("src/app/components/GradingResults.tsx")`
   at `:26`; and it already runs four detector-plus-canary pairs (canary
   describes at `:38`, `:76`, `:120`, `:162`, each proving the detector returns
   false on a plausible wrong implementation before the real scan at `:55`,
   `:101`, `:137`, `:193`). **A16-1's mount assertions go in that file. No new
   wiring-test file is created.**

`gradingResultsHelpers.test.ts` at 963 lines is 37 from the ceiling; the
extraction must not grow it.

### 4.5 The data fix: every hop the recording tool's rubric areas must cross

Owner answer 2. The repo has twice shipped a field computed and then dropped at
an unpinned hop, so every hop names its pin and its direction of failure. H10
is withdrawn (0.4); the rest stand.

| # | Hop | Where (by symbol) | What must change | The pin | Direction of failure |
|---|---|---|---|---|---|
| H1 | Compose success | `composeGradingRowResult`, `grading-feedback-prompt.ts:145-156` (destructures `rubricAreas` at `:148`, uses it only for `pointsWereDeducted` at `:152`, returns without it at `:155`) | return `rubricAreas` - the `scaleResultToPoints` output, not `parsed.rubricAreas` | new assertion in `grading-feedback-prompt.test.ts` | RED when the returned object omits it, or returns the pre-scaling array |
| H2 | Compose failure | `composeFailedGradingRow`, same file | return `rubricAreas: []` | same file | RED when a failure row carries any area |
| H3 | The interface | `GradingRecordingFeedback`, same file | add `rubricAreas: RubricAreaResult[]`, importing from `@/lib/grade/types` | `npx tsc --noEmit`, wave gate only | RED at every producer that omits it |
| H4 | **The action's frozen oracle** | `grading-submission-grade.test.ts` - the `it(...)` at `:99`, key array at `:112-114`, `not.toHaveProperty("rubricAreas")` at **`:117`** | amend the array to seven keys, delete **only** the `:117` assertion, and rewrite the test title at `:99` and the comment above it with the reason | that test | See B5 below: **respecified by symbol.** |
| H5 | **The hand-copied result interface** | `GradingRecordingResult`, `grading-rows.ts:228-234` (a local duplicate, its own comment at `:223-227` says so) | add `rubricAreas` | new assertion in `grading-rows.test.ts` | **Most likely to be missed**: tsc accepts extra properties on an argument structurally, so the field arrives and is silently ignored. RED when `classifyGradingResult` does not pass areas through on success. |
| H6 | Classify | `classifyGradingResult`, `grading-rows.ts:246-267` | success passes through; failure returns `[]` | same file | RED when a failed row carries areas, or a ready row loses them |
| H7 | **The shared apply, which ENUMERATES** | `applyAssessmentResult`, `assessment-row.ts:172-189` - spread at `:181`, six named fields at `:182-187`, `userEdited` early return at `:177-179` | **Do not edit that file.** Widen `grading-rows.ts`'s own `GradingResultInput` alias into a local extension and have `applyGradingResultToRow` set `rubricAreas` itself, after delegating. | new assertion in `grading-rows.test.ts` | RED when the returned row does not carry the applied areas. **This is the drop hop.** |
| H8 | `userEdited` interaction | `applyGradingResultToRow`, `grading-rows.ts` | `rubricAreas` written UNCONDITIONALLY | same file | Precedent, cited not invented: `useSnapshotGrade.ts:266-272` sets `rubricAreas` outside the shared apply, and `applyAssessmentResult` itself does not gate `state`/`error` (`:177-179`, with the reason in its doc comment at `:165-170`: those describe the ATTEMPT, not the instructor's words). Areas are a machine verdict. RED when an edited row's areas go stale after a re-grade. |
| H9 | The row type | `GradingRow`, `grading-row.ts:114` | add `rubricAreas: RubricAreaResult[]`, **REQUIRED** | `npx tsc --noEmit`, wave gate only | Required for the reason `snapshot-row.ts` already gives for its own areas: an optional field makes the read-side default decorative. RED at all 17 literal constructors (6.3). |
| H11 | Read-back | `fromWire`, `grading-row-serialization.ts:181` | emit `rubricAreas: []` **unconditionally**; never read the key | new assertion in `grading-row-serialization.test.ts` | RED when it reads `raw.rubricAreas`, or throws. `fromWire` "NEVER throws" is that function's own contract at `:175-180`. |
| H12 | The hook | `useGradingRows.ts:380-389` | pure forwarding; imports the widened alias | wave-gate `tsc` | In `owns` as the caller of a changed alias, not because it changes. |

**Why H10 is gone, stated as a ruling.** The cohort is `useState` (2.2), so no
reader of a persisted `rubricAreas` exists. `toWire` does not gain the key,
`EXPECTED_WIRE_KEYS` at `grading-row-serialization.test.ts:620-637` **stays at
16**, and its three assertions (`:639-642`, `:644-650`, `:652-670`) are
untouched. S18 now runs against an oracle that was never widened, which is
strictly stronger evidence than the widen-then-check pair revision 2 proposed.

**What A16-2 deliberately does NOT do:** widen `AssessmentRowCore`,
`AssessmentFeedback`, `AssessmentResultInput` or `applyAssessmentResult` in
`src/app/components/assessment-shared/assessment-row.ts`. **The rev-2 reason
"that file is A11's live work" is now FALSE** - A11 landed. The remaining
reason is sufficient on its own: the two surfaces' area types genuinely differ.
`RubricAreaResult` is `{area, score, comment}` (`types.ts:39-43`);
`SnapshotRubricAreaEvidence` is
`{area, score, quote, shotIndex, source, verified, shotId}`
(`snapshot-row.ts:89-111`). A shared field would have to be one of them or a
third type. Note also that `assessment-shared.structure.test.ts` (53 lines)
would **not** have caught H7: `rubricAreas` is not in its `FORBIDDEN_WORDS` at
`:24-32`. Stated so nobody credits it with a guard it does not have.

### 4.6 The mount, its pre-run state, and the ungraded mapping (major M4)

**Rule.** Every mount is gated on one named pure predicate, exported from the
adapter leaf beside the adapter:

```
hasTrendableResults(entry) === entry.run.results.some(r => !r.ungraded && r.rubricAreas.length > 0)
```

`!r.ungraded` is the same cohort `computeClassTrends` uses -
`gradedResults(entry.run.results)` at `class-trends.ts:272`, defined at
`types.ts:180-182` as `r.ungraded === undefined`.

**Disposal round correction (blocker B-5): dropped, not given its own
predicate.** An earlier draft of this section named THREE mount states -
pre-run, "graded but unscorable", and trends - while the Rule above names
only ONE predicate, and section 7 has no verify row for the middle state.
`hasTrendableResults` cannot distinguish "no graded result yet" from "graded,
but every result has zero areas" - both make the predicate false, and
FALSE renders identically either way under the Rule as stated. Giving the
middle state its own render (a one-line message) would need a second,
separate predicate plus its own verify row, which is new design surface a
disposal round does not add. So the middle state is dropped rather than
given one: `class-trends.ts:266-271`'s "a rubric that parsed no criteria"
condition is real, but A16 renders it the same as pre-run (nothing), not as
a distinct line, until a later item adds the second predicate this would
require.

| State | Condition | What renders |
|---|---|---|
| **Pre-run** (also covers "graded, but every result has zero areas" - see above) | `hasTrendableResults(entry)` is false | **Nothing at all.** No panel, no heading, no zero. Without this gate the shipped panel renders a Button reading `Trends (0)` - `ClassTrendsPanel.tsx:125` interpolates `report.areas.length` into its own label. |
| **Trends** | `hasTrendableResults(entry)` is true | The panel, open by default via `defaultExpanded`, with the cohort line (2.2 for the recording surface). |

**The ungraded mapping, for the two adapters that CONSTRUCT results.** A16-1
does not (4.1), so this binds A16-3 and, later, A16-5.

`AssessmentRowState = "pending" | "grading" | "ready" | "failed"`
(`assessment-row.ts:73`) - **four** members. The mapping is enumerated over the
union, not written case by case:

| `row.state` | Emits | Why |
|---|---|---|
| `"ready"` | `GradedResult` | the run produced a grade |
| `"failed"` | `UngradedResult` with `ungraded: { kind: "grading-failed", sourceIndex, student, message: row.error }` (`types.ts:162-170`) | counted in `ungradedCounts.gradingFailed` (`class-trends.ts:277`), NOT in `totalResults` |
| `"pending"` | `UngradedResult` with `ungraded: { kind: "not-attempted", stoppedBy: "submission-count-bound", sourceIndex, student, message }` (`types.ts:140-160`) | a submitted id whose row never transitioned |
| `"grading"` | as `"pending"` | same |

Cohort ids with no matching row are dropped (2.2).

**Direction of failure, and it is the reason this is a major rather than a
detail.** An adapter that emits every cohort row as a `GradedResult` raises
`totalResults` (`class-trends.ts:273`) without raising any area's
`resultsWithArea`. `buildAreaSummary` (`:207`) then emits "Across the N
submissions graded so far" at `:242` with a wrong N, and
`class-trends-draft.ts:185` interpolates the same `report.totalResults` into a
sentence addressed to STUDENTS. This is the one module whose own header
(`class-trends.ts:17-26`) makes that denominator a hard honesty constraint, and
`FORBIDDEN_COMPLETENESS_PHRASES` at `:27-32` exists for it.

**Where each mount goes:**

| Chunk | File | Position | Measured headroom |
|---|---|---|---|
| A16-1 | `src/app/components/GradingResults.tsx` | above the results table, inside the existing results section | **916, 84 free - and the extraction of 4.4 comes first** |
| A16-3 | `src/app/components/grading-recording/GradingRecordingPanel.tsx` | immediately above `<GradingTable>` at `:969` | **995, 5 free** |
| A16-5 | Repo Grades | per folder column | `index.tsx` 913, `RepoGradesGrid.tsx` 643 |

**A16-3's line budget is a hard blocker.** `LIMIT = 1000` at
`src/file-size-ceiling.structure.test.ts:30`, compared with `lineCount > limit`
at `:129`, so exactly 1000 passes. `ALLOWED_OVERAGE` at **`:64-81`** (four
entries, measured by `cat -n src/file-size-ceiling.structure.test.ts | sed -n
'64,81p'`) contains none of these files. An import plus a gated mount plus the
`lastRunCohort` state lands the panel over 1000. **A16-3 includes an extraction
in the same chunk**, sized against the feature's additions, not against the
wall. `this-repo.md:68-83` records that extracting a hook out of a large
grading panel already failed lint on `preserve-manual-memoization` naming a
callback nobody touched; that account is about `SnapshotGradingPanel.tsx` and
whether it generalises here is unverified (RES-A16-12).

---

## 5. Measured inventory

All by `@(Get-Content <path>).Count`, 2026-09-20, HEAD `4bd903e`, clean tree.

| File | Lines |
|---|---|
| `src/lib/grade/class-trends.ts` | 355 |
| `src/lib/grade/class-trends-insight.ts` | 251 |
| `src/lib/grade/class-trends-draft.ts` | 228 |
| `src/app/api/class-trends-insight/route.ts` | 181 |
| `src/app/components/drafted-grades/ClassTrendsPanel.tsx` | 201 |
| `src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx` | 123 |
| `src/app/components/drafted-grades/classTrends.wiring.test.ts` | 133 |
| `src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts` | 110 |
| `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | 227 |
| `src/app/components/GradingResults.tsx` | **916** |
| `src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts` | 197 |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | 673 |
| `src/app/components/grading-results/gradingResultsHelpers.test.ts` | 963 |
| `src/app/components/rubricBreakdownPercent.wiring.test.ts` | 99 |
| `src/app/components/ui/modalAdoption.wiring.test.ts` | 571 |
| `src/app/components/GradingTab.tsx` | 460 |
| `src/app/components/GithubGradingPanel.tsx` | 889 |
| `src/app/components/LiveFeedPanel.tsx` | 709 |
| `src/app/components/DraftedGradesTab.tsx` | 870 |
| `src/app/components/RecordingTab.tsx` | 917 |
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | **995** |
| `src/app/components/grading-recording/grading-feedback-prompt.ts` | 187 |
| `src/app/components/grading-recording/grading-feedback-prompt.test.ts` | 219 |
| `src/app/components/grading-recording/grading-rows.ts` | 308 |
| `src/app/components/grading-recording/grading-rows.test.ts` | 562 |
| `src/app/components/grading-recording/grading-row.ts` | **413** (was 404 in rev 2) |
| `src/app/components/grading-recording/grading-row-serialization.ts` | 326 |
| `src/app/components/grading-recording/grading-row-serialization.test.ts` | 671 |
| `src/app/components/grading-recording/useGradingRows.ts` | 475 |
| `src/app/actions/grading-submission-grade.ts` | 192 |
| `src/app/actions/grading-submission-grade.test.ts` | 358 |
| `src/app/components/assessment-shared/assessment-row.ts` | **208** (was 186 in rev 2) |
| `src/app/components/assessment-shared/assessment-shared.structure.test.ts` | 53 |
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | 970 |
| `src/app/components/snapshot-grading/snapshot-row.ts` | **606** (was 591 in rev 2) |
| `src/app/components/recording/recording-split.structure.test.ts` | 590 |
| `src/app/components/repo-grades/index.tsx` | 913 |
| `src/app/components/repo-grades/RepoGradesGrid.tsx` | 643 |
| `src/lib/grade/types.ts` | 382 |
| `src/lib/course-intel/offline-payload.ts` | 343 |
| `src/app/components/CartridgeDropPanel.tsx` | 544 |

Three files under `assessment-shared/` and `snapshot-grading/` moved between
revisions (A11's landing). **Cite those two directories by SYMBOL, never by
line** - section 9, correction 10.

---

## 6. Chunking, owns, disjointness

### 6.1 The chunks

| Chunk | What | Depends on |
|---|---|---|
| **A16-1** | Extraction of `GradingResults.tsx` FIRST (4.4), then the adapter leaf, `hasTrendableResults`, the required `assignmentName` prop threaded to three call sites, the `defaultExpanded` prop, and the mount. | nothing |
| **A16-2** | The recording tool's data fix, H1-H9, H11, H12. **No mount, no UI.** | nothing |
| **A16-3** | Recording tool: `lastRunCohort`, the run-cohort adapter, the cohort line, the mount, and the extraction the line budget forces. | A16-1 and A16-2 |
| **A16-4** | Snapshot grading: a run boundary FIRST (2.3), then the mount. | A16-1; a boundary design |
| **A16-5** | Repo Grades: the per-column adapter and mount. | A16-1 |

**A16-1 and A16-2 may run concurrently.** Wave size 2, within
`parallel-disjointness.md`'s cap of 3.

**Informational independence, tested rather than asserted.** The only fact
either could establish for the other is the shape of the retained area data.
A16-2 has no design freedom there: `computeClassTrends` reads
`rubricArea.area` (`class-trends.ts:289`) and `rubricArea.score` (`:303`), and
`scaleResultToPoints` already returns `RubricAreaResult[]`, the existing shared
type at `types.ts:39-43`. A16-2 retains that type unchanged. A16-1 never reads
a `GradingRow`. Neither establishes anything the other assumes.

### 6.2 `owns` for A16-1, DERIVED (blocker B3)

Revision 2's A16-1 `owns` was asserted; A16-2's was derived. Both are derived
here, and the command is in the document rather than only its output.

**Derivation command** - every test that reads, by path, any file A16-1 edits:

```bash
cd /c/Users/alexa/OneDrive/Documents/Projects/teaching-assistant
grep -rln "GradingResults.tsx\|ClassTrendsPanel.tsx" src --include=*.ts --include=*.tsx | sort
```

Canary that the instrument can hit:
`grep -c "GradingResults.tsx" src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts`
returns a non-zero count. Canary that it can miss:
`grep -c "GradingResults.tsx" src/app/components/grading-recording/grading-rows.ts`
returns `0`. Never `grep -P` here - it exits 0 without checking
(`this-repo.md` section 5).

**Re-measured for the disposal round (blocker B-4): the command returns 41
paths**, not 37 - `grep -rln "GradingResults.tsx\|ClassTrendsPanel.tsx" src
--include=*.ts --include=*.tsx | sort | wc -l` prints `41` on this tree. The
subset that ASSERTS (a `*.test.ts` that reads the file as source, or
hardcodes its path in a list) - each opened:

```
src/app/components/GradingResults.tsx
src/app/components/GradingTab.tsx                                       [caller: required assignmentName prop]
src/app/components/LiveFeedPanel.tsx                                    [caller: required assignmentName prop]
src/app/components/grading-results/<extracted leaves>                   [4.4; names decided by the extraction]
src/app/components/grading-results/classTrendsEntry.ts                  [adapter + hasTrendableResults]
src/app/components/grading-results/classTrendsEntry.test.ts             [unit]
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpers.ts             [blocker B-3: the extraction's likely destination - see the sixth missed file below]
src/app/components/grading-results/gradingResultsHelpers.test.ts
src/app/components/grading-results/gradingResultsPostOutcome.test.ts
src/app/components/grading-results/sortGradeRows.test.ts
src/app/components/rubricBreakdownPercent.wiring.test.ts
src/app/components/ui/modalAdoption.wiring.test.ts
src/app/components/drafted-grades/ClassTrendsPanel.tsx                  [defaultExpanded prop only]
src/app/components/drafted-grades/classTrends.wiring.test.ts            [added assertion]
src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
src/lib/grade/postable.test.ts                                          [blocker B-3: reads GradingResults.tsx as source - see the sixth missed file below]
```

**`GithubGradingPanel.tsx` is a caller (4.3) but is NOT one of the 41.**
Blocker B-4: an earlier draft of this table printed it as if it were part of
this command's output; it is not - `grep -n "GradingResults.tsx\|ClassTrendsPanel.tsx"
src/app/components/GithubGradingPanel.tsx` returns nothing, because that file
imports the component as `"./GradingResults"` (no `.tsx`, no literal
`ClassTrendsPanel.tsx`) and renders `<GradingResults` without the `.tsx`
suffix. It is in `owns` regardless, for the independent reason section 4.3
gives (it is a render site needing the new `assignmentName` prop), not
because this floor-grep found it. Stated so the figure and the command that
produced it agree, per `this-repo.md`: every quantity names the command that
produced it.

**The six revision 2 missed, and why each is in, opened and cited:**

| File | Why it is in `owns` |
|---|---|
| `grading-results/gradingResultsExtraction.wiring.test.ts` | `read()` at `:22-24`; `GRADING_RESULTS_SOURCE = read("src/app/components/GradingResults.tsx")` at `:26`. A16-1's extraction moves code out of that source, so its four detectors (`:38`, `:76`, `:120`, `:162`) can all move. It is also the file the mount assertions belong in (4.4). |
| `rubricBreakdownPercent.wiring.test.ts` | reads `GradingResults.tsx` at `:23` and asserts `usesFormatScorePercent(GRADING_RESULTS_SOURCE)` at `:92`. If the extraction moves the per-area score cells into a leaf, that assertion goes red on a correct refactor. |
| `ui/modalAdoption.wiring.test.ts` | hardcodes `"src/app/components/GradingResults.tsx"` in `WAVE5_ADOPTERS` at `:108`, and pins two counts by symbol: `expect(DIALOG_SITES.length).toBe(53)` and `expect(DIALOG_SITES.length - ADOPTING_PATHS.size).toBe(...)`. `DIALOG_SITES` is derived from a walk over all `.tsx` files, so a new `.tsx` leaf in the extraction moves both. |
| `drafted-grades/classTrendsDraft.wiring.test.ts` | reads `ClassTrendsPanel.tsx` as `PANEL_PATH` at `:16` and `panelSource` at `:21`. Never mentioned in revision 2 at all. A16-1 edits that panel. |
| `drafted-grades/classTrendsDraft.not-postable.test.ts` | **`ClassTrendsPanel.tsx` IS one of the four canary-3 roots**, at `:213-218`. Revision 2 excluded it by answering "does A16-1 add a file that layer C reaches?", which is the wrong question: **A16-1 EDITS a root.** It also gains the adapter leaf as a fifth root (4.2). Its `{ timeout: 30000 }` at `:211` is the precedent for L15. |
| `src/lib/grade/postable.test.ts` | Blocker B-3. `:187` reads `GradingResults.tsx` as source; `:190` pins the RELATIVE import literal `'import { checkRowPostability } from "../../lib/grade/postable"'`, and `:201` reads a fixed 1200-character window after `handlePostOne`'s definition. A16-1's extraction (4.4) can move either the import or `handlePostOne` itself out of `GradingResults.tsx`, which turns a post-grades SAFETY test red on a correct refactor. |

`gradingResultsHelpers.ts` (not a test - the leaf itself) is also newly named
above, not just implied by "`<extracted leaves>`": it already exists (4.4
item 1) and is the most likely destination for whatever A16-1's extraction
moves out of `GradingResults.tsx`, so it is an edit target on its own, not
only a file the extraction happens to touch.

Not in `owns`, each with its reason, opened:

- `src/app/components/DraftedGradesTab.tsx` - does not change. `defaultExpanded`
  is optional, so `:627` still compiles and `classTrends.wiring.test.ts:68`
  still passes.
- `src/lib/grade/class-trends.ts`, `class-trends-insight.ts`,
  `class-trends-draft.ts`, `route.ts` - untouched. A16 is placement and
  disclosure, not computation. Anything needing to change there is N13b's.
- `src/app/components/repo-grades/*` - eleven of the 41 hits name
  `GradingResults.tsx` in prose comments only, verified by opening every one:
  none reads it as source or hardcodes its path. A16-5 owns that directory
  later.

### 6.3 `owns` for A16-2, re-derived

```
src/app/components/grading-recording/grading-feedback-prompt.ts
src/app/components/grading-recording/grading-feedback-prompt.test.ts
src/app/components/grading-recording/grading-rows.ts
src/app/components/grading-recording/grading-rows.test.ts
src/app/components/grading-recording/grading-row.ts
src/app/components/grading-recording/grading-row.test.ts
src/app/components/grading-recording/grading-row-serialization.ts
src/app/components/grading-recording/grading-row-serialization.test.ts
src/app/components/grading-recording/grading-capture-sync.ts
src/app/components/grading-recording/grading-capture-sync.test.ts
src/app/components/grading-recording/grading-capture-tombstones.test.ts
src/app/components/grading-recording/grading-recording-log.ts
src/app/components/grading-recording/grading-recording-log.test.ts
src/app/components/grading-recording/grading-roster-match.ts
src/app/components/grading-recording/copy-feedback.test.ts
src/app/components/grading-recording/useGradingRows.ts
src/app/actions/grading-submission-grade.ts
src/app/actions/grading-submission-grade.test.ts
src/lib/course-intel/offline-payload.ts
src/lib/course-intel/offline-assembly.test.ts
src/lib/course-intel/cross-course.test.ts
```

Derivation, re-run 2026-09-20:

```bash
grep -rln "nameMatch:" src --include=*.ts --include=*.tsx | sort   # 17 files
grep -c "nameMatch:" src/app/components/grading-recording/grading-capture-sync.ts   # 1  (canary: must hit)
grep -c "nameMatch:" src/lib/no-emojis.test.ts                                      # 0  (canary: must miss)
```

**The last three entries are the point of this list.** They are outside
`grading-recording/` and construct a `GradingRow` literal, so a required
`rubricAreas` breaks them - **at `tsc` only, never as a red vitest run**, the
failure signature `parallel-disjointness.md` section 2 names.
`offline-payload.ts`'s `buildGradingRow` (`:178-208`, returning the literal at
`:190-207`) is the production constructor among them, verified by opening it.
The other four names in `owns` beyond the 17 (`grading-feedback-prompt.ts` and
its test, `grading-submission-grade.ts` and its test) are edits, not
constructors.

Checked and deliberately excluded: `useGradingRows.wiring.test.ts` reads
`useGradingRows.ts` as source and pins `setAllRows`'s stamping composition at
`:31` and `:36`. A16-2 changes neither `setAllRows` nor the stamps, only a
forwarded type alias, so nothing it pins moves. If the implementer's own
derivation disagrees, it wins.

**This list is a FLOOR.** `nameMatch:` finds literal constructors; it does not
find one that spreads a base object, nor a fixture factory that casts. The
implementer re-derives with its own instrument - and the wave-gate `tsc` run is
the only thing that sees this whole class - and reports what this missed.

### 6.4 `owns` for A16-3, derived (S8: A16-3 had none of its own)

**Derivation command**, same method as 6.2:

```bash
grep -rln "GradingRecordingPanel.tsx" src --include=*.ts --include=*.tsx | sort
```

The subset that ASSERTS (reads the file as source, or hardcodes its path in a
list), each opened:

```
src/app/components/grading-recording/GradingRecordingPanel.tsx
src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts   [PANEL_PATH, :242]
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts       [PANEL_PATH, :37]
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts           [PANEL_PATH, :35 - V29/V33/V34's own file]
src/app/components/grading-recording/markLate.wiring.test.ts                        [read("GradingRecordingPanel.tsx"), :33]
src/app/components/recording/AddKnowledgePages.test.ts                              [GRADING_PANEL_PATH, :237]
src/app/components/recording/runLogRow.test.ts                                      [RUN_BEARING_PANELS, :16 - a repo-wide count of ONE <RunLogRow> per panel]
src/app/components/ui/buttonVariant.test.ts                                         [hardcodes the path with a pinned Button count of 3, :157]
src/app/components/grading-recording/<adapter leaf>.ts                              [names decided at implementation; the run-cohort adapter and hasTrendableResults-equivalent, mirroring classTrendsEntry.ts]
src/app/components/grading-recording/<adapter leaf>.test.ts                         [unit, V30-V33]
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts             [4.2's "Both:" bullet - A16-3's adapter leaf is its own canary-3 root, added to the same file A16-1 already edited (6.2); not caught by this section's own grep since the file names the leaf by import path, not by the literal "GradingRecordingPanel.tsx"]
```

Not in `owns`: `grading-rows.test.ts`, `discussion-knowledge-context.test.ts`,
`ModuleDeckCapturePanel.wiring.test.ts` and `snapshot-autofire.structure.test.ts`
all name `GradingRecordingPanel.tsx` in a prose comment only, verified by
opening each - none reads it as source or hardcodes its path.

**This list is a FLOOR**, same caveat as 6.2/6.3: a `nameMatch:`- or path-style
grep cannot find a walker that reaches the file some other way. The
implementer re-derives.

### 6.5 Disjointness, computed

Write each `owns` list to a file in the scratchpad, then:

```bash
cat a16-1.txt a16-2.txt | sort | uniq -d          # A16-1 x A16-2
```
Required output: *(empty)*. Empty is the only pass. By inspection the two lists
share no path; the implementer runs it and pastes the output rather than
trusting the inspection.

```bash
cat a16-1.txt a16-1.txt | sort | uniq -d          # instrument canary
```
Must print every path in `a16-1.txt`. If it prints nothing, the intersection
instrument is broken and the empty result above means nothing.

**Against the live tree:** `git status --short` returns nothing at HEAD
`4bd903e`, so the rev-2 "x A11's dirty paths" intersections are moot and are
withdrawn. **Re-run `git status --short` immediately before dispatch** -
`parallel-disjointness.md` section 6: "Treating 'we checked disjointness once'
as durable" is a named failure mode.

```bash
cat a16-1.txt a16-2.txt n13b.txt | sort | uniq -d   # A16 x N13b
```
Expected output, **recomputed against the corrected A16-1 list**:
```
src/app/components/drafted-grades/ClassTrendsPanel.tsx
src/app/components/drafted-grades/classTrends.wiring.test.ts
src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
```
Four shared paths, not two - the conclusion is unchanged and now rests on more
evidence. **A16 and N13b MUST BE SEQUENCED.** They also fail the facts test:
N13b redefines `AreaTrend` to carry per-student attribution, which A16's panel
would be designing against while N13b establishes it. A16 first.

**And now that coupling is BENIGN rather than blocking**, because of 4.1/4.2:
A16-1 passes `run` by reference and A16-3 emits a real `student` on every
result, so **N13b enriches every mount A16 created with no further placement
work** - a claim revision 2 made while its own V3 forbade it (blocker B7).

**A16-3's own pairings (disposal round, ruling S-8d - 6.4 gave A16-3 its own
`owns` list; this is what it does and does not intersect with):**

```bash
cat a16-3.txt a16-1.txt | sort | uniq -d          # A16-3 x A16-1
```
Expected, by inspection of 6.2's and 6.4's lists:
```
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
```
One shared path, and it is **not a concurrency hazard**: 6.1 states A16-3
depends on A16-1, so this is a sequential edit to a file A16-1 already
landed, not two agents editing it at once. It exists because 4.2's "Both:"
bullet has A16-3 add its OWN adapter leaf as a SIXTH canary-3 root, in the
same file A16-1 already edited to add its own FIFTH. The implementer runs the
command and confirms no other path is shared before treating the two chunks
as sequenced-but-independent.

```bash
cat a16-3.txt a16-2.txt | sort | uniq -d          # A16-3 x A16-2
```
Expected output: *(empty)*. A16-3 depends on the `GradingRow` shape A16-2
finishes (H1-H12), by inspection of 6.3's list against 6.4's it edits none of
A16-2's owned files - it only reads the widened type A16-2 lands.

### 6.6 Shared resources no file list shows (major M1)

`parallel-disjointness.md` section 5, applied rather than quoted:

- **`npx tsc --noEmit` has exactly ONE caller: the wave gate, run ONCE after
  BOTH A16-1 and A16-2 report.** Neither implementer runs it; both briefs
  forbid it by name. It races on `tsconfig.tsbuildinfo` (`tsconfig.json` sets
  `"incremental": true`; the file is gitignored at `.gitignore:41`). **The
  consequence the briefs must state:** H3 and H9 are a `tsc`-ONLY break class,
  so A16-2's implementer structurally cannot self-check them. The wave gate
  owns that result and attributes any red by path. No private worktree - this
  repo's memory records that junctioning `node_modules` into a throwaway
  worktree empties the real one.
- **No two agents sabotage-verify at once.** A16-1 and A16-2 sequence their
  sabotage passes. During that window every concurrent measurement by a sibling
  is untrustworthy even if the restore is perfect.
- **`git stash` is forbidden in both briefs.** It reverts every sibling's files.
- **`docs/BACKLOG.md` and `docs/REGRESSION.md` are files.** If an implementer
  may write one, the orchestrator may not, in that window.
- **`git status --short` in the MAIN checkout is the only proof a wave landed.**
  `Glob` returns a `.claude/worktrees` copy first.

### 6.7 Directory walkers a by-name grep misses

`grep -rln "readdirSync\|walkTsxFiles\|globSync\|opendirSync" src --include=*.ts`
returns 34 files. The ones that can fire on A16:

| Walker | Fires when | Chunk |
|---|---|---|
| `grading-rows.test.ts:479-562` | the exact seven-key `ta-rec-grade-*` set at `:508-516`, scanned over `grading-recording/` AND `assessment-shared/` (`:480-487`). **A16 adds no persisted key** (0.4 withdrew that requirement), so this does NOT move. Named because revision 2 had it firing. | none |
| `src/file-size-ceiling.structure.test.ts` | any owned file exceeds 1000 (`LIMIT` at `:30`, compared at `:129`; `ALLOWED_OVERAGE` at `:64-81` lists none of these files) | all |
| `src/source-bytes.structure.test.ts` | a `\uXXXX` escape materialises as a literal byte. Write/Edit do this. Do not hand-roll the scan. | all |
| `src/lib/no-emojis.test.ts` | an emoji anywhere, **including in `docs/`**. Do not hand-roll; do not paste a gate's own output (it prints check/cross marks). | all |
| `ui/modalAdoption.wiring.test.ts` | `DIALOG_SITES` walks all `.tsx`; the pins are `DIALOG_SITES.length` and `DIALOG_SITES.length - ADOPTING_PATHS.size`. A16-1's extraction can add a `.tsx`. | **A16-1** |
| `classTrendsDraft.not-postable.test.ts` | the four hardcoded canary-3 roots at `:213-218`, one of which A16-1 edits | **A16-1, A16-3** |
| `assessment-shared.structure.test.ts` | a per-surface word enters `assessment-shared/`. **`rubricAreas` is NOT in `FORBIDDEN_WORDS` (`:24-32`)**, so it would NOT have caught H7. Named so nobody credits it. | A16-2 |
| `src/lib/grade/grade-result-doors.wiring.test.ts` | a file calls `postCanvasGradesAction`, `buildCanvasGradebookCsv`, `buildMoodleGradebookCsv` or `fillGradebookCsv` (`:34-38`). Opened: no A16 file does. Stated because a checker will ask. | none |
| `recording/recording-split.structure.test.ts` | its `ta-rec-*` scan reads `recording/` non-recursively plus `RecordingTab.tsx` (`:258-282`) and cannot see `grading-recording/`. Strip count `toHaveLength(12)` at `:132`, tabpanel count `toHaveLength(11)` at `:187`; `grep -c 'role="tabpanel"' src/app/components/RecordingTab.tsx` returns **11**, agreeing. **No A16 chunk adds a strip entry or a tabpanel.** | none |
| `ui/buttonVariant.test.ts`, `ui/confirmArmButtons.test.ts`, `courses/page-module-css-orphan-classes.test.ts` | a new `.tsx` with a Button, a confirm control, or a new CSS class. A16-1's extraction may add `.tsx` - **unverified; the implementer confirms.** RES-A16-11. | A16-1, A16-3 |

---

## 7. Verify

Each condition names **the object under comparison, the instrument producing
each quantity in it, and the direction of failure**.

**Single path per invocation (L14, repo policy).** A multi-path vitest run
silently drops a path that matches nothing and exits 0, and
`closure-runner.ts:31` reads only the `Tests` line. Every row below is one
`npx vitest run <one path>`.

### A16-1

| # | Object | Instrument | RED when |
|---|---|---|---|
| V1 | `GradingResults.tsx` source text | `npx vitest run src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts` | the file does not import `ClassTrendsPanel` AND does not render `<ClassTrendsPanel`. Detector plus canary, in that file's existing shape (`:38`, `:76`, `:120`, `:162`) - the canary must prove the detector returns false on a dead import and on a local reimplementation. |
| V2 | The mount's guard | same file | the `<ClassTrendsPanel` tag is not preceded by a `hasTrendableResults(` call in the same expression - i.e. the panel can render with zero trendable results |
| V3 | **Run reference identity**: `toClassTrendsEntry(run, meta).run` against `run` | `npx vitest run src/app/components/grading-results/classTrendsEntry.test.ts` | the returned `run` is not the SAME OBJECT (`toBe`, not `toEqual`). Forbids filtering, reordering, truncating or rewriting results - including stripping `student`, which N13b needs. |
| V4 | `hasTrendableResults` over an ENUMERATED PRODUCT of {graded, ungraded} x {areas, no areas} | same file | any cell disagrees with "at least one graded result with at least one area". Enumerated, never a hand-written list of five (`traps-tests.md`, coverage by construction). |
| V5 | `ClassTrendsPanel.tsx` source, comment-stripped | `npx vitest run src/app/components/drafted-grades/classTrends.wiring.test.ts` | `computeClassTrends(` appears at an index AFTER the first `fetch(` - the existing assertion at `:79-88`, which must survive the `defaultExpanded` change |
| V6 | The Drafted Grades mount tag | same file, `:55-69` | the drafts site stops mounting the panel, mounts it outside `local.groupHeader`, or stops passing `entry={entry}`. **Unchanged by A16-1; RED here means A16-1 broke something it does not own.** |
| V7 | The `expanded` initializer in `ClassTrendsPanel.tsx` (`:77`) | same file, new assertion | `useState` is seeded with a literal `false` rather than from the new prop |
| V8 | **The panel never reads `.student`** | same file, `:104-106`, UNCHANGED | the panel gains a `.student` read. A16-1 must not weaken this; it is the constraint actually protecting privacy (4.2). |
| V9 | Layer C's four canary-3 roots plus the new adapter leaf | `npx vitest run src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | any root reaches a forbidden prefix. The roots array at `:213-218` must have gained the adapter leaf. `{ timeout: 30000 }` at `:211` is the precedent for the L15 timeout. |
| V10 | `ClassTrendsPanel.tsx` source as layer C's wiring test reads it | `npx vitest run src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts` | any existing assertion over `panelSource` (`:16`, `:21`) breaks on the `defaultExpanded` change |
| V11 | Per-area score cells still route through the shared helper | `npx vitest run src/app/components/rubricBreakdownPercent.wiring.test.ts` | `usesFormatScorePercent(GRADING_RESULTS_SOURCE)` (`:92`) is false after the extraction moved the cells |
| V12 | Modal-adoption counts | `npx vitest run src/app/components/ui/modalAdoption.wiring.test.ts` | `DIALOG_SITES.length` or `DIALOG_SITES.length - ADOPTING_PATHS.size` disagrees with its pinned value. If the extraction adds a dialog-bearing `.tsx`, the count is bumped **in the same commit** (`traps-tests.md`: every count assertion needs a demonstrated failure mode). |
| V13 | `assignmentName` reaches all three call sites | `npx vitest run src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts` | any of `GradingTab.tsx:427`, `LiveFeedPanel.tsx:430`, `GithubGradingPanel.tsx:852` renders `<GradingResults` without an `assignmentName` prop. tsc also catches it (required prop); this is the source-text half that survives a later loosening. |
| V14 | Line count of every file in `owns` | `@(Get-Content <f>).Count` compared against 1000, plus `npx vitest run src/file-size-ceiling.structure.test.ts` | any owned file exceeds 1000. **`GradingResults.tsx` must come out of A16-1 SMALLER than 916**, which is the extraction's own pass condition (4.4) - a value merely under 1000 is not a pass here. |
| V15 | Whole suite | `npm test` | exit non-zero, or `Test Files`/`Tests` totals fall below the baseline. **Measure that baseline on the pre-change tree at the wave gate**; do not carry `this-repo.md`'s 1017/20200, dated 2026-09-13. |

### A16-2

| # | Object | Instrument | RED when |
|---|---|---|---|
| V16 | `composeGradingRowResult`'s return, on a fixture with two scored areas | `npx vitest run src/app/components/grading-recording/grading-feedback-prompt.test.ts` | `rubricAreas` is absent, empty, or is `parsed.rubricAreas` rather than the `scaleResultToPoints` output |
| V17 | `composeFailedGradingRow`'s return | same file | `rubricAreas` is anything other than `[]` |
| V18 | The action's per-row key set, **by symbol** | `npx vitest run src/app/actions/grading-submission-grade.test.ts` | the key set is not exactly the seven `{id, totalScore, strengths, improvements, overallComment, failed, rubricAreas}`; **or** any of the four surviving identity assertions is gone: `not.toHaveProperty("student")`, `not.toHaveProperty("userId")`, `not.toHaveProperty("feedback")`, `JSON.stringify(result)).not.toContain("userId")`. Only the `not.toHaveProperty("rubricAreas")` assertion is deleted. |
| V19 | `classifyGradingResult` on a success and a failure fixture, both built in the shape the action really emits | `npx vitest run src/app/components/grading-recording/grading-rows.test.ts` | a success drops the areas, or a failure carries any |
| V20 | The row returned by `applyGradingResultToRow`, for `userEdited: false` and `userEdited: true` | same file | the applied areas are absent in either case (H8) |
| V21 | **`toWire`'s key set is STILL EXACTLY 16** | `npx vitest run src/app/components/grading-recording/grading-row-serialization.test.ts` | `EXPECTED_WIRE_KEYS` (`:620-637`) has changed, or `Object.keys(toWire(...))` disagrees with it (`:639-642`), or `dropBulk: true` removes a key rather than blanking a value (`:644-650`), or any forbidden identity key appears (`:652-670`). **The oracle is not amended by A16-2. This row is an anti-change assertion.** |
| V22 | `fromWire` on a legacy row with no `rubricAreas`, on one with a corrupt value, and on one where a `rubricAreas` key was hand-injected into storage | same file, new assertion | it throws, reads the key, or returns anything but `[]` |
| V23 | Line counts of every file in `owns`, plus the structural gates | `@(Get-Content <f>).Count` vs 1000; `npx vitest run src/file-size-ceiling.structure.test.ts`; `npx vitest run src/source-bytes.structure.test.ts`; `npx vitest run src/lib/no-emojis.test.ts` | any exceeds 1000; a control byte appears; an emoji appears |
| V24 | Whole suite | `npm test` | as V15 |

### The wave gate, ONE caller (major M1)

| # | Object | Instrument | RED when |
|---|---|---|---|
| V25 | Types across BOTH chunks | `npx tsc --noEmit`, run **exactly once**, by the wave gate, after both chunks report and neither is mid-sabotage | **any output at all**, exit non-zero. This is the only instrument that sees H3/H9's required-field class across the 17 literal constructors and the three files outside `grading-recording/`. |
| V26 | Lint | `npm run lint` | a **fifth** warning. Baseline is exactly four, in `RecordingTab.tsx:347`, `repoGradesSliceA.guards.test.ts:83`, and two in `canvas-modules/new-quiz.test.ts` (`this-repo.md` section 1). A fifth is a regression, not drift - RES-A16-12. |
| V27 | Build | `npm run build` | the `Compiled successfully` line is absent. **Do not gate on the exit code**; it exits 1 in the env-dependent prerender tail and the page named varies between runs. |
| V28 | The tree | `git status --short` in the MAIN checkout, diffed against each chunk's `owns` | any path outside the assignment, or any path under `.claude/worktrees`. A report is not evidence. |

### A16-3 (specified now so A16-3's brief is not re-derived)

| # | Object | Instrument | RED when |
|---|---|---|---|
| V29 | **`lastRunCohort`'s dependency set**, from `GradingRecordingPanel.tsx` source, comment-stripped | a new source-text assertion in a `grading-recording/*.wiring.test.ts` | the cohort setter's expression mentions `assessmentLabel`, `assessmentId`, `filterText`, `sort`, or `gradingRows.rows`. **This is the assertion that closes blocker B1**, and it pins the FACT, never a spelling. |
| V30 | The cohort resolver over an enumerated product of the four `AssessmentRowState` members x {areas, no areas} x {id present, id removed} | `npx vitest run` on the A16-3 adapter leaf's unit test | any cell disagrees with the table in 4.6; or a removed id produces anything but omission; or a `"failed"` row lands in `gradedResults` |
| V31 | `totalResults` against the cohort | same file | `computeClassTrends(adapter(cohort, rows)).totalResults` is not the count of `"ready"` rows in the cohort. Direction of failure: an inflated N reaches `buildAreaSummary` (`class-trends.ts:207`, emitted at `:242`) and `class-trends-draft.ts:185`, a sentence addressed to students. |
| V32 | The cohort line's multi-label predicate | same file | it does not report "more than one label" when the resolved rows carry two distinct `assessment` values (counting `undefined` as one) |
| V33 | **The trend input is the snapshot, never a render-time array read** (disposes blocker B-2; deletes and replaces the rev-3-draft V33, which mandated the defective read) | source-text assertion in the same `grading-recording/*.wiring.test.ts` as V29, over the adapter/mount call site | the adapter's or the mount's call into it references `gradingRows.rows`, `gradingRows.rawRows` (`useGradingRows.ts:452-455` computes `rows`; `:460` returns `rawRows`, itself `scopedRawRows` at `:444-447`), or any other array read at render time, instead of `lastRunCohort.rows`. A trend that changes when the instructor types in the search box, or changes the Course selector, is wrong, and no gate here would otherwise catch it. |
| V34 | **A16-3's mount renders `ClassTrendsPanel`**, mirroring V1 | same file | `GradingRecordingPanel.tsx` does not import `ClassTrendsPanel` AND does not render `<ClassTrendsPanel` above `<GradingTable>` (`:969`), guarded by the cohort's own trendable-results predicate (4.6). Added per the disposal round (S8): A16-3's verify set otherwise had no row for the mount's own presence, only for the cohort logic behind it. |

**Source-text tests over-specify.** Pin the fact and the ordering; never the
spelling. V1/V2/V5/V6/V7/V13/V29 pin presence, ordering and structural
containment - not prose, not formatting, not an attribute spelling.

**L15 is a CLASS, not one file.** `grading-rows.test.ts` (V19, V20) walks two
directories at `:480-487`, and `classTrendsDraft.not-postable.test.ts` (V9)
walks an import graph. A whole-tree or multi-directory walker can flake red
under vitest's 5s default; a second instance was observed on
`src/lib/recording-files.kinds.test.ts`, which is not a walker at all, so treat
it as a class. **A red on any of these is re-run before it is believed**, and
every new walking test this work adds sets an explicit `timeout`, following
`classTrendsDraft.not-postable.test.ts:211` (`{ timeout: 30000 }`).

---

## 8. Sabotages

**Procedure for every row:** (1) run the named test, record PASS and the exact
`Test Files` / `Tests` counts; (2) apply the mutation to the **IMPLEMENTATION,
never to the test**; (3) re-run, record FAIL and which assertion fired; (4)
restore **from a `cp` backup, never `git checkout --`** - a checkout on an
uncommitted file reverts to the index and destroys the chunk's work; (5)
re-run, record PASS and the SAME counts as step 1. A step-5 count that differs
means the restore was not clean.

**Pipe vitest output through `tr -d '\000'` or use `grep -a` before grepping
it** - vitest output contains NUL bytes, so a plain `grep` prints "Binary file
matches" and a failing run looks like a silent pass.

**No two agents sabotage-verify on this tree at the same time.** A16-1 and
A16-2 sequence their passes.

### A16-1

| # | Mutation (implementation only) | Goes RED in |
|---|---|---|
| S1 | Delete the `<ClassTrendsPanel .../>` line from `GradingResults.tsx` | `gradingResultsExtraction.wiring.test.ts` (V1) |
| S2 | Keep the mount, remove the `hasTrendableResults(...)` guard around it | same file (V2) |
| S3 | In the adapter, return `{ ...meta, run: { ...run, results: [...run.results] } }` instead of `run` by reference | `classTrendsEntry.test.ts` (V3). **The plausible wrong implementation** - a defensive copy that looks careful and silently breaks reference identity, hence N13b's enrichment path. |
| S4 | In the adapter, filter ungraded rows out of `run.results` | same file (V3 again, and the enumerated product in V4 shifts) |
| S5 | Make `hasTrendableResults` return `entry.run.results.length > 0` | same file (V4) |
| S6 | Move `computeClassTrends(...)` inside the `requestInsight` async body in `ClassTrendsPanel.tsx` | `classTrends.wiring.test.ts:79-88` (V5). **The one most likely to be skipped and the one that matters** - it is the only assertion standing between "trends renders" and "trends renders only after a paid model call succeeds". |
| S7 | Hardcode `useState(false)` in `ClassTrendsPanel.tsx`, ignoring `defaultExpanded` | same file (V7) |
| S8 | Add `const n = entry.run.results[0].student;` to `ClassTrendsPanel.tsx` | same file, `:104-106` (V8) - proves the privacy pin still has power after the `defaultExpanded` edit |
| S9 | Add `import { postCanvasGradesAction } from "@/app/actions/grading";` to the new adapter leaf | `classTrendsDraft.not-postable.test.ts` (V9) - proves the leaf really entered the roots array. Without this, V9's root addition is an assertion about code nobody proved is load-bearing. |
| S10 | Drop the `assignmentName` prop from the `<GradingResults` tag at `LiveFeedPanel.tsx:430` | `gradingResultsExtraction.wiring.test.ts` (V13), **and** the wave-gate `tsc` (V25) |
| S11 | Paste 100 filler lines into `GradingResults.tsx` | `src/file-size-ceiling.structure.test.ts` (V14). **Run this BEFORE the extraction**, so the implementer sees where the wall is and that it is real. |

### A16-2, one per hop

| # | Hop | Mutation (implementation only) | Goes RED in |
|---|---|---|---|
| S12 | H1 | Delete `rubricAreas` from `composeGradingRowResult`'s returned object | `grading-feedback-prompt.test.ts` |
| S13 | H1 | Return `parsed.rubricAreas` instead of the `scaleResultToPoints` output (the plausible wrong one: unscaled areas) | same file |
| S14 | H2 | Make `composeFailedGradingRow` return the last success's areas | same file |
| S15 | H4 | Revert the action test's expected key list to the six pre-A16-2 keys | `grading-submission-grade.test.ts`. **Reverse direction**: proves the oracle still has power after being widened, rather than having been loosened into a tautology. |
| S16 | H4 | Add `student: submission.studentName` to the action's pushed result | same file - proves the identity half survived the widening |
| S17 | H5/H6 | Drop `rubricAreas` from `classifyGradingResult`'s success branch | `grading-rows.test.ts` |
| S18 | H6 | Pass the areas through on the FAILURE branch too | same file |
| S19 | **H7, the drop hop** | Remove the explicit `rubricAreas:` line from `applyGradingResultToRow`'s returned object, leaving the delegation to `applyAssessmentResult` alone | same file. **This is the sabotage that proves the repo's twice-paid defect is closed.** |
| S20 | H8 | Gate the `rubricAreas` write behind `!row.userEdited` | same file (the `userEdited: true` half of V20) |
| S21 | H11 | Add `rubricAreas` to `toWire` | `grading-row-serialization.test.ts:639-642`, against the **unchanged** 16-key oracle. Stronger than the rev-2 pair: the oracle was never widened, so it cannot have been loosened. |
| S22 | H11 | Make `fromWire` return `raw.rubricAreas as RubricAreaResult[]` unguarded | same file, V22's garbage fixture |
| S23 | **H9, the required-field class** | Delete the `rubricAreas` line from the production constructor `buildGradingRow` in `src/lib/course-intel/offline-payload.ts` (the returned literal at `:190-207`) | **`npx tsc --noEmit` goes RED**, and no vitest path does. This is major M2's replacement for the rev-2 null result: weakening a required field to optional cannot break a caller - that is a property of the mutation direction, not a finding - while the strengthening direction is a real, observable failure, and it demonstrates the exact class the wave gate exists to catch. **Run at the wave gate, which owns the single `tsc` caller, not by the implementer.** |

### A16-3

| # | Mutation (implementation only) | Goes RED in |
|---|---|---|
| S24 | In the mount or the adapter, resolve the trend against `gradingRows.rawRows` or `gradingRows.rows` by id instead of reading `lastRunCohort.rows` directly | V33. This is the sabotage that proves blocker B-2 is actually closed, not just reworded - it reintroduces the exact live-array read the correction removes. |
| S25 | Delete the `<ClassTrendsPanel .../>` line from `GradingRecordingPanel.tsx` | V34 |

**Fixtures come from the emitted shape.** Every A16-2 fixture is built by
running the real producer - `composeGradingRowResult` over a real
model-response string, the real `gradingRowCodec` - never by hand-writing a
shape no code path emits. A green suite once rested entirely on fixtures whose
value shape nothing produced.

**Network:** `vitest.setup.ts` throws on any unmocked `fetch`. On any path that
would reach an LLM, mock `callLlm`; on a Canvas path, mock `canvasFetch`, not
`fetch` - a live 401 once made a sabotage check pass for the wrong reason.

---

## 9. What contradicts the row, the brief, or this repo's own cards

1. **`grading-row.ts:142` and its surrounding comment block are STALE** on the
   assessment selector: the panel renders one at `GradingRecordingPanel.tsx:798-807`,
   `:310` passes `assessmentId` into `useGradingRows`, and `useGradingRows.ts:362`
   calls the stamp. Correct the comment in A16-2's commit. **But note the
   revision-2 conclusion drawn from this correction was itself wrong**: the
   selector existing does not make the label the cohort (2.2, owner answer 3).
2. **Revision 2 called the label-filtered set "the batch for this tool".** It
   is not the set `handleGradeAll` grades (`GradingRecordingPanel.tsx:561`,
   unfiltered), and it changes on every keystroke (`:801`). Corrected in 2.2.
3. **`grading-submission-grade.test.ts` deliberately asserts the ABSENCE of
   `rubricAreas`**, with the test's own title at `:99` saying "no rubricAreas".
   Owner answer 2 reverses a decision that was written down and pinned. A16-2
   rewrites that title and the comment above it with the new reason rather than
   quietly editing the array.
4. **`applyAssessmentResult` enumerates six fields (`:182-187`) rather than
   spreading.** Any widened result type is silently dropped there. H7 routes
   around it.
5. **`this-repo.md` says `GradingRecordingPanel.tsx` is 964. It is 995**
   (`@(Get-Content).Count`). A five-line-headroom file described as a
   thirty-six-line one. Unfixed in the card across three revisions.
6. **`class-trends-draft.ts` is 228 lines, not the 214 in the A16 row's
   `instrument` field.** Unfixed in the row.
7. **`recording-split.structure.test.ts:219`'s `panelTargets.size === 11`
   passes falsely** - the key array at `:203-216` is the test's own hardcoded
   list, not read from source - and its strip regex at `:131` cannot match a
   key containing a hyphen or a digit. **No A16 chunk adds a strip entry**, so
   neither trap is reachable from here.
8. **Revision 2's `assessment-row.ts` is 186 lines. It is 208**, and
   `applyAssessmentResult` is `:172-189`, not `:150-167`. **`snapshot-row.ts`
   is 606, not 591. `grading-row.ts` is 413, not 404.** All three moved when
   A11 landed. Cite these directories by SYMBOL; they are still moving.
9. **Revision 2's `grading-submission-grade.test.ts` citations were wrong at
   the edit point.** Measured: `not.toHaveProperty("rubricAreas")` is **`:117`**,
   not `:118`; `:118` is `not.toHaveProperty("feedback")`; the identity
   assertions are `:115`, `:116`, `:118`, so a "protected range `:116-120`"
   EXCLUDES `:115`; and `JSON.stringify(result)).not.toContain("userId")` is
   **`:119`**, not `:121`. An implementer told "delete the assertion at `:118`"
   deletes the FEEDBACK assertion and the suite stays green. Respecified by
   symbol in H4 and V18.
10. **Revision 2's REGRESSION baseline instrument matched nothing.**
    `grep -an "class trends" docs/REGRESSION.md` returns **0 matches**;
    `grep -ac "class-trends" docs/REGRESSION.md` returns **20**. Entry 422 is
    at line 42824 (`grep -an "^## 422" docs/REGRESSION.md`) - the right number,
    produced by a command that could not have produced it. Use the hyphenated
    form.
11. **The newest REGRESSION entry is 432, not 431.**
    `grep -an "^## " docs/REGRESSION.md | tail -4` gives 429, 430, 431, **432**
    (A11's, at line 44203). The next is **433**.
12. **Revision 2 misquoted its own L13 precedent.** It claimed
    `src/app/actions/carry-module-pattern.test.ts:639` and
    `currentEventsAssignments.wiring.test.ts:242` use `/\/\/[^\r\n]*/g`. Opened:
    both use `text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")`
    (`carry-module-pattern.test.ts:638-640`,
    `currentEventsAssignments.wiring.test.ts:41-43`). The real difference from
    `classTrends.wiring.test.ts:37-39` is the leading `^[ \t]*` anchor, which
    makes that one trailing-comment-blind. **Use the real precedent form**
    `/\/\/.*$/gm` for new detectors, and keep the caveat: it also eats the `//`
    inside a `http://` literal, so confirm no assertion in a converted file
    depends on a URL. Do not convert `classTrends.wiring.test.ts`'s existing
    helper; add alongside if needed.
13. **Revision 2's `ALLOWED_OVERAGE` citation was RIGHT and the round-2 check's
    correction of it was wrong.** Measured twice, on the working tree and on
    `git show HEAD:src/file-size-ceiling.structure.test.ts`:
    `grep -n "ALLOWED_OVERAGE"` returns `64` in both, and the closing `};` is
    at `:81`. It is `:64-81`, not `:68-85`. Recorded so the next round does not
    "fix" a correct citation.
14. **Revision 2's `route.ts` and `types.ts` citations were one to six lines
    off.** Measured: `requireUser()` is `route.ts:97` (not `:93`);
    `anonymizeGradeResults(...)` is `route.ts:128` (not `:122-127`; `:123-128`
    is the comment plus the call). `GradedResult.userId` is `types.ts:254` (not
    `:252`). `buildAreaSummary` is `class-trends.ts:207` (not `:242`; `:242` is
    the emitted string). All corrected inline above.
15. **`AssessmentRowState` has FOUR members, not three** - `"pending" |
    "grading" | "ready" | "failed"` (`assessment-row.ts:73`). Any enumeration
    over three would leave `"grading"` unmapped. 4.6.
16. **What this environment cannot verify at all, restated so nobody fills it
    in.** No component is rendered by any test (vitest is node-env, collects
    only `src/**/*.test.ts`), so every claim in sections 2.2, 4.3, 4.6 and 11
    about what the instructor SEES - the panel appearing, being open, the
    cohort line being legible, the panel disappearing mid-keystroke - is a
    READING claim. No `.env`, so layer B's route cannot be exercised end to
    end. No live model, no live database, no `gh`. **I ran no
    `npx tsc --noEmit`, no `npm run lint`, no `npm run build` and no
    `npm test`** (all four belong to the wave gate, and `tsc` has exactly one
    caller), and I edited no file except this one.

---

## 10. Residuals

Every entry names an owner, an instrument, and the step that will measure it. An
entry missing any of the three is a deletion, and would be called that.

| ID | Residual | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| **RES-A16-3** | The canary-3 root list at `classTrendsDraft.not-postable.test.ts:213-218` is hardcoded, so any FUTURE component reaching layer C is outside the guard silently. A16-1 and A16-3 each add their own adapter leaf to it (V9), but the list itself stays hand-maintained. | The implementer of the next chunk that adds a file layer C reaches | Read `:213-218`; add the path; sabotage per S9 | Each chunk's sabotage pass; recurring thereafter |
| **RES-A16-4** | No component is rendered by any test. Every claim about what the instructor sees - the panel appearing, `defaultExpanded` actually opening it, the three states of 4.6 rendering distinguishably, the cohort line being legible - is a reading claim. | The repo owner | Opening the app in a browser with real env vars | An owner observation after the push. This environment has no `.env` (`this-repo.md` section 6). |
| **RES-A16-6** | `docs/REGRESSION.md` has no baseline for the new mounts. Entry 422 (line 42824) covers the Drafted Grades site only. | The baseline seat, before hand-off | `grep -a` over `docs/REGRESSION.md`, using the **hyphenated** `class-trends`; read the tail for the next number rather than inferring it from `grep -ac "^## "`, which does not agree with the numbering | A16-1's baseline step, before the implementer starts. Newest is **432**, so the next is **433**. |
| **RES-A16-7** | **Snapshot grading has no run boundary at all** (2.3). A16-4 cannot mount a panel until one exists. A11's landing discharged the file-contention half; this half is untouched. | A16-4's scoping pass | `grep -n "assessment\|course" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` paired with a canary; then a unit test over a cohort predicate once a boundary exists | A16-4's own scoping |
| **RES-A16-8** | The recording table is course-scoped but not assessment-scoped (`useGradingRows.ts:82-115`), so one run can grade two assignments' rows against one rubric. A16-3 DISCLOSES this (2.2's multi-label cohort line) rather than preventing it. Whether the disclosure reads clearly is not checkable here. | The repo owner | An owner observation of a run over a table holding two labelled assessments | After A16-3's push |
| **RES-A16-9** | A row whose `totalScore` the instructor overrode by hand still contributes the MODEL's area scores to the trend (H8), so the trend can disagree with the score on screen. The alternative leaves the row's areas stale, which is worse. A known, chosen trade-off. | The repo owner | Edit one row's score, re-grade, compare the trend line with the visible scores | After A16-3's push |
| **RES-A16-11** | Whether A16-1's extraction trips `ui/buttonVariant.test.ts`, `ui/confirmArmButtons.test.ts` or `courses/page-module-css-orphan-classes.test.ts` is unverified. They scan for `.tsx` components, Buttons and CSS classes; the extraction may add a `.tsx`. | A16-1's implementer | Run each as a single-path `npx vitest run` before and after the diff | A16-1's wave gate |
| **RES-A16-12** | `this-repo.md:68-83` records that extracting a hook out of `SnapshotGradingPanel.tsx` failed lint on `preserve-manual-memoization` naming a callback nobody touched. Whether that generalises to the `GradingResults.tsx` extraction (A16-1) or the `GradingRecordingPanel.tsx` one (A16-3) is unverified. | Each chunk's implementer | `npm run lint`, against the four-warning baseline | Each chunk's wave gate (V26) |
| **RES-A16-13** | **The recording tool's trends do not survive a reload**, because `lastRunCohort` is `useState` and `rubricAreas` is no longer persisted (H10 withdrawn). An instructor who grades, reloads, and sees graded rows with no trends may read that as a bug rather than as "trends are an output of a run". **This is inconsistent across A16-1's own four LMS-grading surfaces**: the github path's run survives a reload today and will keep doing so untouched - `loadStoredGithubGradingRun` (`github-grading-run-store.ts:357`) restores it from `localStorage`, and `:186-187,:247` already carry `rubricAreas` through, so its trends also survive - while the recording surface's do not, and the zip/canvas and livefeed surfaces never had a surviving run to begin with (2.1). The same feature therefore reloads differently depending on which grading tool produced it. Whether that inconsistency, or the recording surface's non-survival specifically, is acceptable is a product judgement this environment cannot make. **Recommendation, acted on now (disposal round, ruling S-7a): ship as specified - no persistence for the recording surface, leaving the cross-surface inconsistency as a known, disclosed gap** rather than blocking A16-3 on reconciling it; the two other surfaces (zip/canvas, livefeed) already behave this way and are unaffected by this feature. | The repo owner | An owner observation: grade a batch on each of the four surfaces, reload each, compare | After A16-3's push. **Named upgrade path if the recommendation is rejected**, so it is scoped rather than open: persist the cohort id set under a new `ta-rec-grade-*` key - which moves the seven-key set at `grading-rows.test.ts:508-516` - and reinstate H10, which moves the 16-key oracle at `grading-row-serialization.test.ts:620-637`. Two named enforcers, both currently untouched. |
| **RES-A16-14** | **`GradingTab.tsx:427` (zip/canvas) has no assignment name to pass** and ships `assignmentName: ""` (4.3), so `class-trends-draft.ts:185` opens the student-facing draft with "A note on this assignment" and the guard at `:176` is vacuous. | A16-1's implementer, escalating to the owner if a source exists | `grep -n "assignmentName\|title\|assignment" src/app/components/GradingTab.tsx src/app/actions-types.ts` paired with a canary; open `GradeActionState` | A16-1's verify. If a name IS reachable from `GradeActionState`, thread it and strike this. |
| **RES-A16-15** | **The surface enumeration in section 3 is a FLOOR** derived from four identifier-shaped searches, and an identifier-shaped zero looks exactly like a real absence (`traps-search.md`). | The implementer of each chunk | Re-derive by what a grading surface puts ON SCREEN - a per-student score column, a rubric-area breakdown, a "Grade" button - not only by type name; report what this list missed | Each chunk's wave gate |
| **RES-A16-16** | **The `owns` lists in 6.2, 6.3 and 6.4 are FLOORS.** 6.3's `nameMatch:` search cannot find a constructor that spreads a base object or a fixture factory that casts; 6.2's and 6.4's path searches cannot find a test that reaches `GradingResults.tsx` or `GradingRecordingPanel.tsx` through a directory walk. | Each chunk's implementer | Their own derivation, plus the wave-gate `tsc` (V25), which is the only instrument that sees the whole required-field class | Each chunk's wave gate, diffing `git status --short` against the assignment |

**Handed over, not residual:** cross-assignment trend accumulation (1.3).
Receiver: a new backlog row. Obligation: decide the accumulator, and whether
`class-trends.ts`'s cohort wording survives it.

---

## 11. Leverage

### 11.1 The claim, stated honestly (blocker B2)

**Revision 2 claimed SCALE and it was INHERITED, not earned. Withdrawn.** The
evidence it gave - `gradeStudentEntries` at `src/lib/grade/engine.ts:113-134` -
is `docs/loop/leverage.md`'s OWN table row for SCALE. Citing the card's example
back at the card proves nothing about this feature.

`leverage.md`'s failure-mode-B test, run rather than quoted: **grep the class's
mechanism against every comparable module.**

```bash
grep -rln "gradeStudentEntries\|gradeEntries(" src --include=*.ts --include=*.tsx | sort   # 14 files
grep -c "gradeStudentEntries" src/lib/grade/engine.ts        # 5   (canary: must hit)
grep -c "gradeStudentEntries" src/lib/no-emojis.test.ts      # 0   (canary: must miss)
```

Every grading action path in this tree already batches: `grading.ts`,
`github.ts`, `github-repos.ts`, `grading-submission-grade.ts`,
`repoGradesCellEdits.ts`, `useRepoGradesGradingActions.ts`. The recording tool
batches through its own `handleGradeAll` (`:561-571`). And
`computeClassTrends` already counts a cohort and already ships
(`DraftedGradesTab.tsx:627`). The denominator clusters at "all of them", which
is `leverage.md`'s own definition of a class the platform provides for free.

**A16's actual advantage is CLICK COST AND REACHABILITY, and `leverage.md`
STRUCK that as a category** (`leverage.md:64`): "Free to any feature with a UI
at all [...] real leverage only when named explicitly as click-cost, never
dressed up as integration or persistence it does not have."

So A16 takes the second of `leverage.md`'s three explicit calls for a feature
of this shape (`:109-121`): **Accept the cost explicitly.**

> **The claim.** A16 earns no categorical advantage over a chat window. Its
> advantage is that a counted, already-built, already-guaranteed artifact
> (`computeClassTrends`, pure and model-free) appears beside the run that
> produced it instead of behind a navigation to Workflows > Drafts > Grades.
> That is a click-cost and reachability saving, nothing more, and this document
> says so rather than letting a later reader credit it with SCALE, CORPUS or
> INTEGRATION it does not have.

That is also the honest framing of the item: `docs/DEV_LOOP.md` step 0.1 and
`traps-spec.md` both say a capability that is already built and merely
unreachable makes reachability the real job. A16 is that job.

**What A16 must NOT break, inherited and worth stating.** The GUARANTEED class
is real here and A16 inherits it: `computeClassTrends` is pure and counted, and
layer B's observations are tagged `kind: "inferred"` with no second variant
(`class-trends-insight.ts:171-185`), so a model's reading can never render as a
counted fact. A16 earns nothing here; its job is not to weaken it. V5/S6 are
that assertion - they keep the counted layer from becoming reachable only after
a paid model call.

### 11.2 The removal test, traced

`leverage.md:141-149`: **state the deletion, then name the assertion whose
observed value changes.** Revision 2's candidate failed this - deleting the
`hasTrendableResults` guard makes the panel show when empty; it does not remove
batch cohesion, so the claimed advantage (SCALE) was unaffected by its own
removal test.

With the claim corrected to reachability, the removal test traces:

- **The deletion:** the `<ClassTrendsPanel .../>` tag in `GradingResults.tsx`.
  Deleting it removes the advantage entirely and exactly - trends still
  compute, still ship, and are once again reachable only by navigating to
  Workflows > Drafts > Grades, which is the pre-A16 world.
- **The assertion whose observed value changes:** V1, in
  `gradingResultsExtraction.wiring.test.ts` - "GradingResults.tsx imports AND
  renders `ClassTrendsPanel`". Observed value PASS before the deletion, FAIL
  after. That is S1.
- **The canary that makes V1 credible:** the detector must also return false
  on a dead import and on a local reimplementation, in the shape that file
  already uses four times (`:38-53`, `:76-99`, `:120-135`, `:162-191`).

**The same removal test for A16-3's mount** (disposal round, ruling S-8c;
A16-1's advantage and A16-3's are the same claim on a second surface, so the
same trace applies):

- **The deletion:** the `<ClassTrendsPanel .../>` tag in
  `GradingRecordingPanel.tsx`, immediately above `<GradingTable>` (`:969`).
  Deleting it removes the advantage on this surface entirely and exactly -
  the recording tool's per-run trends stop being reachable from the recording
  panel at all, once A16-2's data fix ships they are reachable nowhere else
  (2.1 lists no other run object for this surface), so this deletion is a
  stronger regression here than on A16-1's four surfaces, which keep the
  Drafted Grades mount as a fallback.
- **The assertion whose observed value changes:** V34, in
  `GradingRecordingPanel.wiring.test.ts` (6.4) - mirroring V1's "imports AND
  renders `ClassTrendsPanel`". Observed value PASS before the deletion, FAIL
  after. That is S25.

**The honest limit, recorded rather than papered over.** The part of the
advantage that is genuinely about clicks and attention - the panel being
visible without navigating, open by default, beside the results - has **no
buildable removal test here**, because no component is rendered by any test.
That is RES-A16-4, with an owner and a step. `leverage.md:173-178` already
names this limit for the LIVE-LOOP class and requires exactly this disclosure.

### 11.3 Three owner questions, batched, gating nothing

All three are `iteration-caps.md` **(b) Reduce** - scope calls that no number
of revision rounds resolves. A recommendation is attached to each so work does
not wait on an answer.

1. **Does the disclosure state need to persist across reloads?** The repo's
   standing persisted-control rule would say yes. Under the run cohort, three
   of the four surfaces have nothing to reopen after a reload (the github path
   is the exception - its run IS restored from `localStorage`,
   `github-grading-run-store.ts:357`). Persisting it costs a new
   `ta-rec-grade-*` key and moves the frozen seven-key set at
   `grading-rows.test.ts:508-516`. **Recommendation, acted on now: ship
   `defaultExpanded` with no persistence.** Reversible; the enforcer it would
   move is named.
2. **Should the new mounts carry layer C, the student-facing draft?**
   `ClassTrendsPanel.tsx:192` mounts `ClassTrendsDraftPanel` unconditionally,
   so they will, and on the zip/canvas path it will read "A note on this
   assignment" (4.3, RES-A16-14). **Recommendation, acted on now: ship it.** It
   composes nothing until its own button is clicked
   (`ClassTrendsDraftPanel.tsx:42-48`) and the floor at `class-trends-draft.ts:18`
   and `:154` refuses below 5 graded submissions. Suppressing it would need a
   new prop on a file N13b is about to change.
3. **Is A16's leverage claim (click-cost and reachability, section 11.1) the
   right call for a feature this shape, or does it warrant a redesign or a
   rejection instead?** `leverage.md:109-121` requires this be "decided by the
   human who scoped it, never defaulted by the agent writing the criteria" -
   and section 11.1 defaulted to "Accept the cost explicitly" without asking.
   Disposal round, ruling S-6: put to the owner rather than re-argued.
   **Recommendation, acted on now: accept the cost explicitly, as 11.1 already
   states.** A16 ships as a placement/reachability improvement over an
   already-built, already-guaranteed computation - not a new capability - and
   nothing built here forecloses a later redesign if the owner disagrees.
