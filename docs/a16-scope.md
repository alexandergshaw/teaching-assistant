# A16 scope, revision 2: a grading run's batch produces trends, shown with that tool

Seat: SCOPING, revision 2. Authored 2026-09-20 against the working tree at
`main`, HEAD `d4c32cc`, dirty with 15 paths (`git status --short`): 11 under
`src/app/components/snapshot-grading/`, 2 under
`src/app/components/assessment-shared/`, `src/lib/grade/prompts.ts`, and the
untracked `src/lib/grade/prompts-praise-routing.test.ts`. That is A11's build,
under adversarial verification while this was written.

Revision 2 exists because the owner answered two forks. Both are recorded in
`docs/backlog.yml` row A16's `note` (row starts at `docs/backlog.yml:363`), and
both change the shape of the item rather than refining it.

> **ANSWER 1.** "A series of assignments" means ONE RUN OVER MANY STUDENTS'
> SUBMISSIONS FOR THE SAME ASSIGNMENT. Cross-assignment accumulation is a
> separate future row and is not designed for here.

> **ANSWER 2.** The recording tool's data gap is fixed INSIDE A16. A silent
> "Trends (0)" panel is worse than no panel, so the result that feeds it gets
> widened rather than one of the two strip grading tools shipping without
> trends.

**Measurement instrument for every line count below**, from PowerShell at the
repo root:

```powershell
@(Get-Content <path>).Count
```

`Measure-Object -Line` is never used. Every other quantity names its own
command inline. Nothing in this document is carried from revision 1 unmeasured;
where a number moved, it is called out in section 9.

---

## 0. Disposition of revision 1

Every requirement, finding and ruling of the round-1 artifact, mapped. Nothing
is silently dropped.

| Round-1 item | Disposition | Detail |
|---|---|---|
| **F1** - the recording tool discards `rubricAreas` | **KEPT and PROMOTED** | Re-measured: `composeGradingRowResult` destructures `rubricAreas` at `grading-feedback-prompt.ts:148`, uses it only for `pointsWereDeducted` at `:152`, and does not return it (`:155`). Owner answer 2 makes fixing this in-scope work (chunk A16-2), not a blocker. |
| **F2** - no interactive surface runs over a series of ASSIGNMENTS | **WITHDRAWN as a scoping driver** | Owner answer 1 removes the reading F2 answered. The measurement stands and is the stated reason a separate cross-assignment row should exist (section 1.3); it no longer shapes any chunk here. Nothing enforced it, so nothing is unprotected by withdrawing it. |
| **F3** - trends is already in the Tools tab | **KEPT, not re-derived** | Confirmed by the brief. `tab-sections.ts:40` `manual: "Tools"`. The ask is to stop trends being a DESTINATION, not to move it. |
| Section 1a/1b/1c inventory and line counts | **KEPT, re-measured** | See section 5. One number moved; see section 9. |
| Section 1d table's "series of assignments?" column | **WITHDRAWN** | Superseded by owner answer 1. Replaced by section 2, which asks a different and now-load-bearing question: what delimits a batch. |
| **Half 1: widen the panel's prop to `{ run, assignmentName }`** | **WITHDRAWN and REPLACED** | Replaced by: each surface builds a `GradingRunEntry` through a pure adapter leaf, and the panel's prop is UNCHANGED. Reason in section 4.1. This withdrawal protects three enforcers the round-1 plan would have had to move: `classTrends.wiring.test.ts:68` (the `entry={entry}` pin), the same file's `:104-106` no-student pin, and `DraftedGradesTab.tsx:627`. All three now stay untouched. |
| **Half 2 item 1:** layer A disclosed by default, collapse state persisted | **KEPT, REVISED in mechanism** | Default-open arrives as a new optional `defaultExpanded` prop so the Drafted Grades mount is unchanged. The persistence requirement is KEPT (the repo's standing persisted-control rule) and now names the enforcer it must satisfy: the exact seven-key set at `grading-rows.test.ts:510-518`, which is a directory walker over `grading-recording/` and `assessment-shared/`. |
| **Half 2 item 2:** layer B stays opt-in | **KEPT unchanged** | `/api/class-trends-insight` is a budgeted model call behind `requireUser()` (`route.ts:93`). Not fired by a run. |
| **Half 2 item 3:** layer C unchanged, floor question stays with N13a | **KEPT unchanged** | `DEFAULT_CLASS_TRENDS_DRAFT_FLOOR = 5` at `class-trends-draft.ts:18`. A16 does not touch it. |
| Section 3 surface table | **REVISED** | Three rows change on measurement: cartridge drop is now OUT with a measured reason (discharging RES-A16-5), snapshot grading gains a newly measured blocker of its own, and Repo Grades gains the strongest run object of the three. See section 3. |
| **Section 4: FAN OUT, do not move** | **KEPT, not re-derived** | Confirmed by the brief. `docs/REGRESSION.md` entry 422 at line 42824 (`grep -an "class trends" docs/REGRESSION.md`) baselines the Drafted Grades mount. |
| **Section 5: panel inside each tool, no new strip entry** | **KEPT, not re-derived** | Confirmed by the brief, first reason being that a 13th tab is a destination. The strip counts remain the second reason and are re-measured in section 6.4. |
| Chunking A16-1 .. A16-4 | **REVISED** | Renumbered and rescoped; see section 6. |
| `owns` for A16-1 | **REVISED** | Section 6.1. |
| V1-V7 | **REVISED** | Section 7. |
| S1-S6 | **REVISED** | Section 8. |
| **RES-A16-1** (series-of-assignments unsatisfied) | **WITHDRAWN by owner answer 1** | It was marked withdrawable on exactly this answer. It protected no enforcer. It is replaced by a new backlog row proposal (section 1.3), which is a HAND-OVER, not a deletion. |
| **RES-A16-2** (recording discards `rubricAreas`) | **PROMOTED into scope** | No longer a residual; it is chunk A16-2, with its own verify and sabotages. |
| **RES-A16-3** (`classTrendsDraft.not-postable.test.ts` hardcoded roots) | **KEPT, re-cited** | Roots are the four-file list at `classTrendsDraft.not-postable.test.ts:213-218`. Section 10, RES-A16-3. |
| **RES-A16-4** (no component is rendered by any test) | **KEPT** | Section 10. |
| **RES-A16-5** (cartridge drop untraced) | **DISCHARGED by measurement** | `grep -rn "<CartridgeDropPanel" src --include=*.tsx` returns `FilesTab.tsx:852` and `GradingTab.tsx:457`; `grep -n "Grading\|grade\|results" src/app/components/CartridgeDropPanel.tsx` finds no `GradingRun`, no `GradingResults`, and `:439` says "grades land in Drafts". It is an upload/trigger panel whose trends surface is Drafted Grades, which already has trends. OUT of A16, measured, not assumed. |
| **RES-A16-6** (no REGRESSION baseline for the new mount) | **KEPT, number updated** | `grep -an "^## " docs/REGRESSION.md \| tail -4` gives entries 428, 429, 430, 431. Next is **432**. Revision 1 said 431 was newest; it is 431 and the next is 432, so the number is unchanged in substance and re-measured here. |
| Section 7: N13b FOLLOWED, N13a IGNORED | **KEPT, not re-derived** | Confirmed by the brief. |
| Section 8 corrections 1-8 | **KEPT** | Re-measured in section 9, with four new ones added. |

---

## 1. Scope after the two answers

### 1.1 What A16 now is

A run of a grading tool over a batch of student submissions FOR ONE ASSIGNMENT
produces per-rubric-area trends for that batch, shown with that tool, without
navigating anywhere.

### 1.2 What A16 is now explicitly not

Trends spanning several assignments. Under answer 1 that is out of scope and
this document designs nothing for it.

### 1.3 The cross-assignment row, handed over rather than deleted

The measurement that produced revision 1's F2 is still true and still useful, so
it is handed to a new backlog row rather than discarded:

- `GradingRunEntry` is one assignment (`src/lib/grade/types.ts:329-337`; the doc
  comment at `:320-321` says "One assignment's grading run in workflow
  context").
- The only `GradingRunEntry[]` producers are the workflow grade step
  (`src/lib/workflows/registry/steps.grading-run.ts:425,496`) and
  `GradingDraftPayload.runs` (`src/lib/grading-drafts.ts:33`).
- `GradingDraftPayload.runs`' consumer is `DraftedGradesTab.tsx:606`, which
  mounts trends per group at `:627` - the site trends already occupies.

**Obligation on the receiver of that new row:** decide whether cross-assignment
trends means a new accumulator or a re-grouping of `GradingDraftPayload.runs`,
and whether `class-trends.ts`'s cohort wording survives it. That wording is a
hard constraint: `class-trends.ts:17-26` states the cohort is "the graded
results in hand" of one run, `FORBIDDEN_COMPLETENESS_PHRASES` at `:27-32`
enforces it, and `buildAreaSummary` at `:242` emits "the N submissions graded so
far". A panel spanning several assignments while keeping those strings would
describe a different denominator than its own prose claims.

---

## 2. The run object, per in-scope grading tool

This is the substantive half. For each tool: is there a batch boundary in the
tree today, or is one being invented?

### 2.1 Summary

| Tool | Batch boundary today | Invented? | Where the boundary lives |
|---|---|---|---|
| LMS Grading - zip / canvas | **YES** | No | `GradeActionState.run: GradingRun \| null` (`src/app/actions-types.ts:80-85`), read at `GradingTab.tsx:133`. One submit replaces it wholesale. |
| LMS Grading - livefeed | **YES** | No | `activeRun` (`LiveFeedPanel.tsx:366`) - the run scoped to the currently open queue item. One queue item is one assignment; `startSequence` (`:355-363`) iterates assignments, grading each as its own run. |
| LMS Grading - github | **YES** | No | the same `run` object, mounted at `GithubGradingPanel.tsx:852`. |
| **Grading (from a recording)** | **YES - and revision 1 was wrong about this** | No | TWO independent boundaries exist: the click, and a persisted per-row assessment label. See 2.2. |
| **Grading (from screenshots)** | **NO** | **Would be invented** | See 2.3. This is the one place the item can go wrong. |
| Repo Grades | **YES** | No | `runBulkGrade` over `targets` in ONE folder (`useRepoGradesBulkGrade.ts:168-178`), with one shared rubric established for the whole run before the worker pool opens (`:299-318`). A folder column is one assignment across N repos. |

### 2.2 Grading (from a recording): the boundary exists, and revision 1 missed it

Revision 1 said this tool has "no run object at all". That is wrong in two ways,
and both corrections came from opening files rather than from a doc.

**Boundary A - the click.** `handleGradeAll` (`GradingRecordingPanel.tsx:537`)
grades `gradingRows.rawRows` - the WHOLE unfiltered table - in ONE
`gradeCapturedSubmissionsAction` call (`:566-571`), then applies every returned
result in one loop (`:598-602`). A run already has a record: `setLogGradingRuns`
appends a `GradingRecordingLogGradingRun` (`grading-recording-log.ts:141-149`:
`{ at, rowCount, blocked, reason, error, graded, failed }`) at `:544`, `:574`,
`:604` and `:611`. That record is aggregate counts only - it carries no row
membership - and it is `useState`, not persisted (`GradingRecordingPanel.tsx:198`).

**Boundary B - the assessment label, and this is the important one.**
`grading-row.ts:156-169` states, in bold prose, that "the panel has no
assessment selector of any kind today" and that "nothing currently calls
`stampGradingRowsWithAssessment` with a real value". **That comment is STALE.**
Measured:

- `GradingRecordingPanel.tsx:791-807` renders an Autocomplete labelled
  "Assessment (your own label - e.g. Essay 2, Week 3 discussion)", bound to
  `assessmentLabel`, persisted under `ta-rec-grade-assessment`
  (`:273-285`), trimmed into `assessmentId` at `:291`.
- `GradingRecordingPanel.tsx:310` calls `useGradingRows(courseId, assessmentId)`.
- `useGradingRows.ts:293` derives `assessmentScope`, and `:362` calls
  `stampGradingRowsWithAssessment(stampedCourse, previousScoped, assessmentScope)`
  inside `setAllRows`.
- `stampGradingRowsWithAssessment` (`grading-row.ts:356-366`) stamps
  `assessment` onto every row it does not already recognise by id, and never
  overwrites an already-attributed row's value.
- `assessment` is in the persisted wire key set
  (`grading-row-serialization.test.ts:633`).

So every captured row carries the assessment it was captured under, and that
survives a reload. **The batch for this tool is therefore not invented: it is
the set of rows in the current course scope whose `assessment` equals the
currently-typed `assessmentId`.** Rows captured with no label form an
UNATTRIBUTED bucket (`assessment: undefined`), which the panel at `:809-813`
already tells the instructor about.

**The hazard this leaves, and it is real.** `useGradingRows.ts:78-115` states
that `rows`/`rawRows`/`totalCount` are filtered to COURSE only, deliberately -
assessment is an attribution axis, not a display filter. So the visible table
CAN hold two assignments' rows at once. A trend computed over the whole table
would then silently mix two assignments' rubric areas - the exact
cross-assignment contamination answer 1 put out of scope. The `assessment` field
is what makes this detectable rather than silent.

**Ruling for A16-3:** the recording tool's trend cohort is
`rawRows.filter(r => r.assessment === assessmentId)` when `assessmentId !== ""`,
and `rawRows.filter(r => r.assessment === undefined)` when it is "" - never
`rawRows` unqualified. The panel states its cohort in one line above the counted
list. Both branches are a pure predicate in a leaf, unit-testable; neither is a
component behaviour.

### 2.3 Grading (from screenshots): there is no boundary, and one would have to be invented

Measured on the current (A11-dirty) tree, read only:

- `SnapshotAssessmentRow` (`snapshot-row.ts:122-153`) extends `AssessmentRowCore`
  and adds `shotReports`, `rubricAreas`, `missingRoles`,
  `instructionLikeContent`, `instructionLikeContentQuote`, `imageFallbackNote`,
  `evidenceDropped`, `strengthsNotice`. **No `course` field. No `assessment`
  field.** `createEmptySnapshotRow` (`:163-180`) confirms the full construction.
- `grep -n "assessment\|course" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`
  returns only imports of `assessment-shared` helpers and the word "assessment"
  used as a synonym for "a graded row". There is no course picker and no
  assessment label.
- The table is `ta-snap-table` (`SnapshotGradingPanel.tsx:209`) and is not a
  session: `:931` reads "Completed assessments (N) - some may be from an earlier
  session, restored on reload." The variable named `sessionRows` is not a
  session.
- Each grade produces ONE row, not a batch: `useSnapshotGrade.ts:254-272`
  resolves a single target row and upserts it.
- The only timestamp available is inside the row id -
  `mintSnapshotRowId(Date.now())` yields `snap-row-<epochMs>-<counter>`
  (`snapshot-row.ts:158-162`). Parsing a batch out of an id substring would be
  inventing a boundary out of a debugging artefact.

**Conclusion: for this tool the batch boundary does not exist and every
candidate delimiter is an invention.** The three candidates and why each is
rejected as a first move:

| Candidate delimiter | Why not now |
|---|---|
| A capture session | There is none - the table explicitly survives reloads and says so at `:931`. |
| Wall-clock gap between row ids | Infers intent from timing. An instructor who grades three students, takes lunch, grades three more has one assignment and two clusters. |
| Every graded row in the table | This is the round-1 default. It is the cross-assignment contamination of 2.2 with no `assessment` field to detect it. Under answer 1 that is precisely the out-of-scope thing, arrived at by accident. |

**Ruling: the honest move is to give this tool the SAME assessment label the
recording tool already has, and only then mount trends.** That is real work, it
touches a directory A11 holds, and it is not a line item inside a placement
chunk. It becomes chunk A16-4, sequenced after A11's verification clears, and
its first requirement is the label, not the panel. **A16 does not mount a trends
panel on snapshot grading before that label exists** - doing so would be the
"quietly mixes two assignments" failure, shipping green.

---

## 3. Surfaces, in or out

| # | Surface | Verdict | Measured reason |
|---|---|---|---|
| 1-4 | LMS Grading: zip, canvas, livefeed, github | **IN, chunk A16-1** | `grep -rn "<GradingResults" src --include=*.tsx` returns exactly three non-definition render sites: `GradingTab.tsx:427`, `GithubGradingPanel.tsx:852`, `LiveFeedPanel.tsx:430`. `GradingMode = "zip" \| "canvas" \| "livefeed" \| "github"` (`GradingTab.tsx:26`); zip and canvas both flow through `GradingTab.tsx:427`. ONE mount in `GradingResults.tsx` serves all four. Every result carries `rubricAreas` (required on `GradeResultBase`, `types.ts:213`). |
| 5 | Files > Submissions, cartridge drop | **OUT, measured** | See section 0, RES-A16-5. No `GradingRun`, no `GradingResults`; its grades land in Drafts, which already has trends. |
| 6 | Repo Grades | **IN, chunk A16-5** | `RepoGradeCellEdit.rubricAreas: RubricAreaResult[]` (`repoGradesCellEdits.ts:102`), set only by a grading call. Real run with a shared rubric (`useRepoGradesBulkGrade.ts:299-318`). Deferred only for size: `index.tsx` is 913 lines and `RepoGradesGrid.tsx` is 643. |
| 7 | Workflows > Drafts > Grades | **IN, unchanged** | The existing mount stays. Fan out, do not move. |
| 8 | Grading (from screenshots) | **IN, chunk A16-4, gated** | Row carries `rubricAreas` (`snapshot-row.ts:124`, with `area` at `:90` and `score` at `:91`). Blocked twice: no batch boundary (2.3) and the directory is held by A11. |
| 9 | Grading (from a recording) | **IN, chunks A16-2 (data) + A16-3 (mount)** | Boundary exists (2.2); data does not (section 4.2). |
| 10 | Workflow grade steps, unattended | **OUT** | Headless. No instructor is looking at a panel during a cron tick, and the output already flows into a draft, which is surface 7. |
| 11 | Discussion replies / Message replies / other Recording sub-tabs | **OUT** | They emit replies, not scores. |
| 12 | `src/lib/embedded-grader/` | **OUT** | A library reached through the paths above; no surface of its own. |

**Floor statement.** This enumeration came from
`grep -rn "<GradingResults" src --include=*.tsx`,
`grep -rln "GradingRunEntry" src`,
`grep -rn "rubricAreas" src/app/components/repo-grades/`, the
`MANUAL_VIEW_ORDER` list and the `RecordingTab.tsx:592` strip literal. **It is a
FLOOR, not the set.** An identifier-shaped search cannot find a surface that
reaches the same data another way. Whoever builds re-derives it with their own
instrument, searches by what a grading surface puts ON SCREEN (a per-student
score column, a rubric-area breakdown, a "Grade" button) as well as by type
name, and reports what this missed.

---

## 4. The mechanism

### 4.1 The panel's input: an adapter, not a prop change

Revision 1 proposed widening `ClassTrendsPanel`'s prop from
`entry: GradingRunEntry` to `{ run, assignmentName }`. **Withdrawn.** Measured
reasons:

1. `GradingResults.tsx` does not have an `assignmentName` to pass
   (`GradingResultsProps`, `:92-128`, carries `run` and `canvasUrl` and no
   assignment name; `grep -n "assignmentName" src/app/components/GradingTab.tsx`
   returns nothing). So the widened prop would have needed a value that does not
   exist at the first mount site anyway.
2. Changing the prop moves three pins that currently cost nothing:
   `classTrends.wiring.test.ts:68` (`/entry=\{entry\}/` on the Drafted Grades
   mount tag), the no-student pin at `:104-106`, and `DraftedGradesTab.tsx:627`
   itself - which would then have to enter `owns` as the caller of a changed
   export.
3. Widening it makes A16-1, A16-3 and A16-5 all depend on one contract change,
   which by `parallel-disjointness.md` section 3 forces either a separate
   contract wave or full sequencing.

**Replacement.** Each surface builds a `GradingRunEntry` through a pure adapter
leaf and mounts `<ClassTrendsPanel entry={...} />`. `ClassTrendsPanel.tsx`'s
prop, `class-trends.ts`, `DraftedGradesTab.tsx` and all three pins are
untouched.

**The identity hazard this creates, and the construction that removes it.**
`GradeResultBase` requires `student: string` (`types.ts:189`), and
`GradedResult` allows an optional `userId` (`types.ts:252`). `grading-row.ts`'s
header (`:23-26`) forbids these rows ever being persisted into a
`GradingRunEntry`, because that store "is one approved click from post-grades".
The panel also POSTs `{ entry }` to `/api/class-trends-insight`
(`ClassTrendsPanel.tsx:87-91`), so a name placed in a synthesised entry leaves
the browser even though the route anonymises before prompting
(`route.ts:122-131`).

Rather than assert the name is absent, make it unrepresentable:

> **Every adapter emits results with `student: ""` and no `userId` key at all,
> and the adapter's output is never persisted.** `computeClassTrends` never
> reads `.student` (`class-trends.ts:259-320`), and `anonymizeGradeResults` is
> the only function in the route that touches it (`route.ts:122-127`). Nothing
> downstream needs a name.

That is pinned by a unit test on the adapter itself (V3 / S3 below), not by a
convention.

The route's own validator accepts a minimal entry: `parseGradingRunEntry`
(`route.ts:72-87`) needs only `run.results` to be an array, and defaults
`courseName`, `assignmentName`, `canvasUrl`, `rubricAreaNames` and
`fullCreditChecklist`. `composeClassTrendsDraft` handles an empty assignment
name: `assignmentName || "this assignment"` (`class-trends-draft.ts:185`). So
`assignmentName: ""` is safe at the `GradingResults` mount, and the recording
tool passes its real `assessmentId`.

### 4.2 The data fix: every hop the recording tool's rubric areas must cross

This is owner answer 2. The repo has twice shipped a field computed and then
dropped at an unpinned hop, so every hop below names its pin and its sabotage.

Where it is lost today: `composeGradingRowResult`
(`grading-feedback-prompt.ts:145-156`) destructures `rubricAreas` out of
`scaleResultToPoints` at `:148`, uses it only in `pointsWereDeducted` at `:152`,
and returns four strings plus `failed` at `:155`.

| # | Hop | File and line | What must change | The pin | Direction of failure |
|---|---|---|---|---|---|
| H1 | Compose success | `grading-feedback-prompt.ts:145-156` | return `rubricAreas` (the `scaleResultToPoints` output, not `parsed.rubricAreas`) | new assertion in `grading-feedback-prompt.test.ts` | RED when the returned object omits `rubricAreas`, or returns the pre-scaling array |
| H2 | Compose failure | `grading-feedback-prompt.ts:178-187` | return `rubricAreas: []` | same file | RED when a failure row carries any area |
| H3 | The interface | `grading-feedback-prompt.ts:47-58` | add `rubricAreas: RubricAreaResult[]`, importing the type from `@/lib/grade/types` | `npx tsc --noEmit` | RED at every producer that omits it |
| H4 | **The action's frozen key-set oracle** | `grading-submission-grade.test.ts:99-118` | the oracle asserts exactly `{id, totalScore, strengths, improvements, overallComment, failed}` at `:112-114` AND `not.toHaveProperty("rubricAreas")` at `:118`, with the test's own title saying "no rubricAreas" | that test | This oracle ENCODES A DECISION owner answer 2 reverses. It must be amended to seven keys and its comment rewritten with the reason, in the same commit. The `student` / `userId` / `feedback` assertions at `:116-120` and the `JSON.stringify(result)).not.toContain("userId")` at `:121` are NOT relaxed. |
| H5 | **The hand-copied result interface** | `grading-rows.ts:228-234` | `GradingRecordingResult` is a LOCAL DUPLICATE of the action's per-row shape, declared rather than imported (its own comment at `:223-227` says so). It must gain `rubricAreas`. | new assertion in `grading-rows.test.ts` | **The hop most likely to be missed**, because it is a hand-copied interface and tsc will not complain: extra properties on an argument are accepted structurally, so the field arrives and is silently ignored. RED when `classifyGradingResult` does not pass areas through on success. |
| H6 | Classify | `grading-rows.ts:246-267` | success branch passes `rubricAreas` through; failure branch returns `[]` alongside the blanked feedback fields | same file | RED when a failed row carries areas, or a ready row loses them |
| H7 | **The shared apply, which ENUMERATES rather than spreads** | `assessment-row.ts:150-167` | `applyAssessmentResult` copies exactly six named fields at `:159-165`. A widened `AssessmentResultInput` would still be DROPPED here. **Do not edit this file** - it is A11's. Instead widen `grading-rows.ts`'s own `GradingResultInput` alias (`:130`) into a local extension and have `applyGradingResultToRow` (`:155-157`) set `rubricAreas` itself, after delegating. | new assertion in `grading-rows.test.ts` | RED when the row that comes back does not carry the applied areas. This is the drop hop; it is also the one that keeps A16-2 out of A11's file. |
| H8 | `userEdited` interaction | `grading-rows.ts:155-157` | `rubricAreas` is written UNCONDITIONALLY, not gated by `userEdited` | same file | Precedent, cited not invented: `useSnapshotGrade.ts:266-272` sets `rubricAreas: verified` outside the shared apply, and `applyRosterMatchToRow` (`grading-rows.ts:164-169`) is explicitly not gated by `userEdited` because it is a machine verdict, not instructor text. RED when an edited row's areas go stale after a re-grade. |
| H9 | The row type | `grading-row.ts:114-...` | add `rubricAreas: RubricAreaResult[]`, REQUIRED not optional | `npx tsc --noEmit` | Required is right for the reason `snapshot-row.ts:135-141` already gives: an optional field makes the wire enumeration and the read-side default decorative. RED at all 17 literal constructors (section 6.2). |
| H10 | **The persisted wire** | `grading-row-serialization.ts:126` (`toWire`) and `:181` (`fromWire`) | add `rubricAreas`, with `opts.dropBulk ? [] : r.rubricAreas` | `grading-row-serialization.test.ts:620-641` - the frozen 16-key oracle, hand-written in `toWire`'s declaration order and explicitly NOT derived from the codec | RED the moment `toWire` gains a key the list does not have. This is the intended behaviour: the test's own comment at `:608-614` says a new key is "the moment to stop and ask whether the new field belongs in the instructor's browser storage at all". A16-2 answers yes, with the dropBulk precedent at `snapshot-row-serialization.ts:85`, and updates the list to 17 keys and the title from 16 to 17. |
| H11 | Read-back tolerance | `grading-row-serialization.ts:181` | a legacy row with no `rubricAreas`, or with a corrupt one, reads back as `[]` and never throws | new assertion in `grading-row-serialization.test.ts` | RED when garbage reaches the row. `fromWire` "NEVER throws" is that function's own stated contract at `:175-180`. |
| H12 | The hook | `useGradingRows.ts:380-389` | pure forwarding of `GradingResultInput`; no logic change, but it imports the widened type | `npx tsc --noEmit` | In `owns` because it is the caller of the changed alias, not because it changes. |

**What A16-2 deliberately does NOT do:** widen `AssessmentRowCore`,
`AssessmentFeedback`, `AssessmentResultInput` or `applyAssessmentResult` in
`src/app/components/assessment-shared/assessment-row.ts`. Two reasons, both
checkable: that file is A11's live work, and the two surfaces' area types are
genuinely different - `RubricAreaResult` is `{area, score, comment}`
(`types.ts:39-43`) while `SnapshotRubricAreaEvidence` is
`{area, score, quote, shotIndex, source, verified, shotId}`
(`snapshot-row.ts:89-111`). A shared field would have to be one of them or a
third type. It stays per-surface, which is what
`assessment-shared.structure.test.ts` (53 lines) exists to enforce in spirit -
although note its `FORBIDDEN_WORDS` list at `:24-32` does NOT contain
`rubricAreas`, so that test would NOT have caught the mistake. Stated so nobody
credits it with a guard it does not have.

### 4.3 The mount, and the pre-run state

The owner rejected a panel that says "Trends (0)" forever. Rather than make that
unlikely, make it unrepresentable.

**Rule.** Every mount is gated on a single named pure predicate, exported from
the adapter leaf beside the adapter itself:

```
hasTrendableResults(entry) === entry.run.results.some(r => !r.ungraded && r.rubricAreas.length > 0)
```

`!r.ungraded` is the same cohort `computeClassTrends` uses -
`gradedResults(entry.run.results)` at `class-trends.ts:272`, defined at
`types.ts:180`.

**Three states, all explicit:**

| State | Condition | What renders |
|---|---|---|
| **Pre-run** | no graded result with any area | **Nothing at all.** No panel, no heading, no zero. The tool's own empty state already says there is nothing graded. |
| **Graded but unscorable** | at least one graded result, but every one has `rubricAreas.length === 0` | **One line, not a panel:** that the run produced no per-area scores, so there is nothing to trend. This is a real condition - `class-trends.ts:266-271` describes it (a rubric that parsed no criteria) - and hiding it silently is the other half of the failure mode. |
| **Trends** | the predicate is true | The panel, **open by default** via the new `defaultExpanded` prop, with a cohort line naming what it covers. |

**Where each mount goes:**

| Chunk | File | Position | Headroom |
|---|---|---|---|
| A16-1 | `src/app/components/GradingResults.tsx` | above the results table, inside the existing results section | 916 lines, 84 free |
| A16-3 | `src/app/components/grading-recording/GradingRecordingPanel.tsx` | immediately above `<GradingTable>` at `:969` | **995 lines, 5 free** |
| A16-5 | Repo Grades | per folder column | `index.tsx` 913, `RepoGradesGrid.tsx` 643 |

**A16-3's line budget is a hard blocker and must be stated as one.** The ceiling
is `LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:30`, compared with
`lineCount > limit` at `:129`, so exactly 1000 passes. `ALLOWED_OVERAGE`
(`:64-81`, four entries) contains none of these files. An import plus a gated
four-line mount lands `GradingRecordingPanel.tsx` at exactly 1000 with zero
headroom, which is not a shippable position. **A16-3 therefore includes an
extraction in the same chunk**, sized against the feature's additions rather
than against the wall. Note also `this-repo.md:68-83`: extracting a hook out of
a large grading panel has already failed lint on `preserve-manual-memoization`
for a callback nobody touched - that card's account is about
`SnapshotGradingPanel.tsx`, and whether it generalises to
`GradingRecordingPanel.tsx` is unverified here.

**A pinned defect the mount must avoid.** `GradingRecordingPanel.tsx:970` passes
`rows={gradingRows.rows}` to `GradingTable` - the SORTED AND FILTERED array
(`useGradingRows.ts:198`). The trends panel must read `rawRows` (`:211`), then
apply the assessment-cohort filter of 2.2. A trend that changes when the
instructor types in the search box is wrong, and no gate in this repo would
catch it.

---

## 5. Measured inventory

All by `@(Get-Content <path>).Count`, 2026-09-20.

| File | Lines |
|---|---|
| `src/lib/grade/class-trends.ts` | 355 |
| `src/lib/grade/class-trends-insight.ts` | 251 |
| `src/lib/grade/class-trends-draft.ts` | 228 |
| `src/app/api/class-trends-insight/route.ts` | 181 |
| `src/app/components/drafted-grades/ClassTrendsPanel.tsx` | 201 |
| `src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx` | 123 |
| `src/app/components/drafted-grades/classTrends.wiring.test.ts` | 133 |
| `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | 227 |
| `src/app/components/GradingResults.tsx` | 916 |
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
| `src/app/components/grading-recording/grading-row.ts` | 404 |
| `src/app/components/grading-recording/grading-row-serialization.ts` | 326 |
| `src/app/components/grading-recording/grading-row-serialization.test.ts` | 671 |
| `src/app/components/grading-recording/useGradingRows.ts` | 475 |
| `src/app/actions/grading-submission-grade.ts` | 192 |
| `src/app/actions/grading-submission-grade.test.ts` | 358 |
| `src/app/components/assessment-shared/assessment-row.ts` | 186 |
| `src/app/components/assessment-shared/assessment-shared.structure.test.ts` | 53 |
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | 970 |
| `src/app/components/snapshot-grading/snapshot-row.ts` | 591 |
| `src/app/components/recording/recording-split.structure.test.ts` | 590 |
| `src/app/components/repo-grades/index.tsx` | 913 |
| `src/app/components/repo-grades/RepoGradesGrid.tsx` | 643 |
| `src/lib/grade/types.ts` | 382 |
| `src/app/components/CartridgeDropPanel.tsx` | 544 |

---

## 6. Chunking, owns, disjointness

### 6.1 The chunks

| Chunk | What | Depends on |
|---|---|---|
| **A16-1** | Adapter leaf + `defaultExpanded` prop + mount in `GradingResults.tsx`. Serves zip, canvas, livefeed, github. No data change anywhere. | nothing |
| **A16-2** | The recording tool's data fix, H1-H12. **No mount, no UI.** | nothing |
| **A16-3** | Recording tool: the cohort predicate, the mount, and the extraction the line budget forces. | A16-1 and A16-2 |
| **A16-4** | Snapshot grading: the assessment label FIRST, then the mount. | A11 verification clearing; A16-1 |
| **A16-5** | Repo Grades: the per-column adapter and mount. | A16-1 |

**A16-1 and A16-2 may run concurrently.** Wave size 2, within the cap.

**They are informationally independent, and here is the test rather than the
assertion.** The only fact either could establish for the other is the shape of
the retained area data. A16-2 has no design freedom there: `computeClassTrends`
reads `rubricArea.area` (`class-trends.ts:288`) and `rubricArea.score`
(`:303`), and the value `scaleResultToPoints` already returns is
`RubricAreaResult[]`, the existing shared type at `types.ts:39-43`. A16-2
retains that type unchanged. A16-1 never reads a `GradingRow`. Neither
establishes anything the other assumes.

### 6.2 owns

**A16-1:**

```
src/app/components/grading-results/classTrendsEntry.ts                 [NEW - adapter + hasTrendableResults]
src/app/components/grading-results/classTrendsEntry.test.ts            [NEW - unit]
src/app/components/grading-results/classTrendsMount.wiring.test.ts     [NEW - reachability]
src/app/components/GradingResults.tsx
src/app/components/drafted-grades/ClassTrendsPanel.tsx                 [defaultExpanded prop only]
src/app/components/drafted-grades/classTrends.wiring.test.ts           [one added assertion]
```

Not in owns, each with its reason:

- `src/app/components/DraftedGradesTab.tsx` - **does not change.** The prop name
  is unchanged and `defaultExpanded` is optional, so `:627` still compiles and
  `classTrends.wiring.test.ts:68` still passes. This was the round-1 risk and
  the adapter design removes it.
- `src/lib/grade/class-trends.ts`, `class-trends-insight.ts`,
  `class-trends-draft.ts`, `route.ts` - untouched. A16 is placement and
  disclosure, not computation. Anything needing to change there is N13b's.
- `classTrendsDraft.not-postable.test.ts` - its canary-3 roots
  (`:213-218`) are a hardcoded four-file list. A16-1 adds no new file that layer
  C reaches, so it does not move. See RES-A16-3 for when it does.

**A16-2** (the file set is edits PLUS every caller and every test asserting the
changed behaviour):

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

**The last three are the point of this list.** They are outside
`grading-recording/` and they construct a `GradingRow` literal, so a required
`rubricAreas` breaks them - at `tsc` only, never as a red vitest run, which is
the failure signature `parallel-disjointness.md` section 2 names. Derived
mechanically:

```bash
grep -rln "nameMatch:" src --include=*.ts --include=*.tsx | sort
```

Output: 17 files, listed above. Canary that the instrument works:
`grep -c "nameMatch:" src/app/components/grading-recording/grading-capture-sync.ts`
returns `1` (must hit). Canary for absence:
`grep -rc "nameMatch:" src/lib/no-emojis.test.ts` returns `0` (must miss).
`offline-payload.ts:190-196` is the production constructor among them, verified
by opening it.

**This list is a FLOOR.** `nameMatch:` finds literal constructors; it does not
find a constructor that spreads a base object, nor a fixture factory that casts.
The implementer re-derives with their own instrument - including a `tsc` run,
which is the only thing that sees this whole class - and reports what this
missed.

### 6.3 Disjointness, computed

Files written to scratch, then:

```bash
# A16-1 owns x A16-2 owns. Empty is the only pass.
cat a16-1.txt a16-2.txt | sort | uniq -d
```
Expected and required output: *(empty)*. By inspection the two lists share no
path; the implementer runs this and pastes the output rather than trusting the
inspection.

```bash
# A16-1 owns x the live A11 work (git status --short). Empty is the only pass.
cat a16-1.txt a11-dirty.txt | sort | uniq -d
```
Expected: *(empty)*.

```bash
# A16-2 owns x the live A11 work. Empty is the only pass.
cat a16-2.txt a11-dirty.txt | sort | uniq -d
```
Expected: *(empty)*. This is the check the H7 ruling exists to make pass:
`src/app/components/assessment-shared/assessment-row.ts` is dirty and A16-2
deliberately does not touch it. **If an implementer finds it cannot avoid that
file, it must STOP and report a sequencing constraint rather than edit it.**

```bash
# A16-1 + A16-2 owns x N13b's file set. Empty is the only pass.
cat a16-1.txt a16-2.txt n13b.txt | sort | uniq -d
```
Expected output:
```
src/app/components/drafted-grades/ClassTrendsPanel.tsx
src/app/components/drafted-grades/classTrends.wiring.test.ts
```
**A16 and N13b MUST BE SEQUENCED** - they share two files and, worse, N13b
redefines `AreaTrend` to carry per-student attribution, which A16's panel would
be designing against while N13b establishes it. Informational coupling, invisible
to any file check. A16 first; N13b then enriches every mount A16 created with no
further placement work.

Instrument canary for the intersection itself: `cat a16-1.txt a16-1.txt | sort |
uniq -d` must print every path in the file. Never `grep -P` here; it exits 0
without checking.

### 6.4 Shared enforcers, including the directory walkers a by-name grep misses

`grep -rln "readdirSync\|walkTsxFiles\|globSync\|opendirSync" src --include=*.ts`
returns 34 files. The ones that can fire on A16:

| Walker | Fires when | Chunk affected |
|---|---|---|
| `src/app/components/grading-recording/grading-rows.test.ts:479-562` | **The exact seven-key `ta-rec-grade-*` set at `:510-518`**, scanned over `grading-recording/` AND `assessment-shared/` (`:482-487`). Adding a persisted collapse key for the trends panel makes this RED until the key is added here AND has both a `localStorage` read and write wired to it (`isWired`, `:526-546`). | **A16-3** |
| `src/file-size-ceiling.structure.test.ts` | any owned file exceeds 1000 | all |
| `src/source-bytes.structure.test.ts` | a `\uXXXX` escape materialises as a literal byte | all |
| `src/lib/no-emojis.test.ts` | an emoji anywhere, including in `docs/` | all |
| `src/app/components/assessment-shared/assessment-shared.structure.test.ts` | a per-surface word enters `assessment-shared/`. **`rubricAreas` is NOT in its `FORBIDDEN_WORDS` (`:24-32`), so it would NOT have caught H7.** Named so nobody credits it. | A16-2 |
| `src/lib/grade/grade-result-doors.wiring.test.ts` | a file calls `postCanvasGradesAction`, `buildCanvasGradebookCsv`, `buildMoodleGradebookCsv` or `fillGradebookCsv` (`:34-38`). Opened and checked: **no A16 file does**, so it does not fire. Stated because a checker will ask. | none |
| `src/app/components/recording/recording-split.structure.test.ts` | its `ta-rec-*` scan reads `src/app/components/recording/` non-recursively plus `RecordingTab.tsx` (`:258-282`) - it cannot see `grading-recording/` or `snapshot-grading/`. Its strip count is `toHaveLength(12)` at `:132` and its tabpanel count `toHaveLength(11)` at `:187`; `grep -c 'role="tabpanel"' src/app/components/RecordingTab.tsx` returns **11**, agreeing. **No A16 chunk adds a strip entry or a tabpanel, so none of these move.** | none |
| `src/app/components/ui/buttonVariant.test.ts`, `confirmArmButtons.test.ts`, `modalAdoptionScan.ts`, `courses/page-module-css-orphan-classes.test.ts` | a new `.tsx` with a Button, a confirm control, or a new CSS class. A16-1's new files are `.ts` leaves plus tests, so these should not fire - **unverified, the implementer confirms.** | A16-1, A16-3 |

---

## 7. Verify

Each condition names the object under comparison, the instrument producing each
quantity in it, and the direction of failure. **Single path per invocation
(L14):** a multi-path vitest run silently drops a path that matches nothing and
exits 0, and `closure-runner.ts:31` reads only the `Tests` line. If they are
batched for speed, a human reads the collected file count and says so.

### A16-1

| # | Object | Instrument | RED when |
|---|---|---|---|
| V1 | `GradingResults.tsx` source text, comment-stripped | `npx vitest run src/app/components/grading-results/classTrendsMount.wiring.test.ts` | the file does not import `ClassTrendsPanel` and does not render `<ClassTrendsPanel` |
| V2 | The mount's guard | same file | the `<ClassTrendsPanel` tag is not preceded by a call to `hasTrendableResults` in the same expression - i.e. the panel can render with zero trendable results |
| V3 | The adapter's output, on a fixture built from a real `GradingRun` shape | `npx vitest run src/app/components/grading-results/classTrendsEntry.test.ts` | any emitted result has a non-empty `student`, or carries a `userId` key, or the entry's `run.results` length differs from the input's |
| V4 | `hasTrendableResults` over an enumerated product of {graded, ungraded} x {areas, no areas} | same file | any cell disagrees with "at least one graded result with at least one area". Enumerated, not a hand-written list of five - `traps-tests.md`'s coverage-by-construction rule |
| V5 | `ClassTrendsPanel.tsx` source text, comment-stripped | `npx vitest run src/app/components/drafted-grades/classTrends.wiring.test.ts` | `computeClassTrends(` appears at an index AFTER the first `fetch(` - the existing assertion at `:79-88`, which must survive the `defaultExpanded` change |
| V6 | The Drafted Grades mount tag | same file, `:55-69` | the drafts site stops mounting the panel, mounts it outside `local.groupHeader`, or stops passing `entry={entry}`. **Unchanged by A16-1; RED here means A16-1 broke something it does not own.** |
| V7 | The `expanded` initializer in `ClassTrendsPanel.tsx` | same file, new assertion | `useState` is seeded with a literal `false` rather than from the new prop |
| V8 | Line count of every file in `owns` | `@(Get-Content <f>).Count` compared against 1000, plus `npx vitest run src/file-size-ceiling.structure.test.ts` | any owned file exceeds 1000 |
| V9 | Whole suite | `npm test` | exit non-zero, or `Test Files` / `Tests` totals fall below the pre-change baseline. **Measure that baseline on the pre-change tree at the wave gate; do not carry `this-repo.md`'s 1017/20200, which is dated 2026-09-13.** |
| V10 | Types | `npx tsc --noEmit` - **exactly one caller, the wave gate** (`tsconfig.tsbuildinfo` race) | any output at all |

### A16-2

| # | Object | Instrument | RED when |
|---|---|---|---|
| V11 | `composeGradingRowResult`'s return, on a fixture with two scored areas | `npx vitest run src/app/components/grading-recording/grading-feedback-prompt.test.ts` | `rubricAreas` is absent, empty, or is `parsed.rubricAreas` rather than the `scaleResultToPoints` output |
| V12 | `composeFailedGradingRow`'s return | same file | `rubricAreas` is anything other than `[]` |
| V13 | The action's per-row key set | `npx vitest run src/app/actions/grading-submission-grade.test.ts` | the key set is not exactly the seven `{id, totalScore, strengths, improvements, overallComment, failed, rubricAreas}`, or the row gains `student`, `userId` or `feedback`, or `JSON.stringify(result)` contains `userId`. **The identity half of this oracle is not relaxed; only the rubricAreas half is reversed, with the reason written into the test's comment.** |
| V14 | `classifyGradingResult`'s output on a success fixture and a failure fixture, both built in the shape the action really emits | `npx vitest run src/app/components/grading-recording/grading-rows.test.ts` | a success drops the areas, or a failure carries any |
| V15 | The row returned by `applyGradingResultToRow`, for `userEdited: false` and `userEdited: true` | same file | the applied areas are absent in either case (H8: not gated by `userEdited`) |
| V16 | `toWire`'s exact key set, from the REAL codec against a hand-written oracle | `npx vitest run src/app/components/grading-recording/grading-row-serialization.test.ts` | the key list is not exactly 17, in `toWire`'s declaration order, with the count in the test title matching; or `dropBulk: true` removes a key rather than blanking a value; or any forbidden identity key appears (`:652-670`, unchanged) |
| V17 | `fromWire` on a legacy row with no `rubricAreas`, and on one with a corrupt value | same file | it throws, or returns anything but `[]` |
| V18 | **Round trip through the real codec**: a row with two areas, serialized and deserialized | same file | the restored row's areas differ from the original's. This is the one that catches a write-side and read-side that are each individually plausible and disagree. |
| V19 | Line counts, whole suite, types | as V8, V9, V10 | as V8, V9, V10 |

**stripComments form (L13).** The existing helper at `classTrends.wiring.test.ts:37-38`
uses the ANCHORED form `/^[ \t]*\/\/.*$/gm`, which is trailing-comment-blind - an
assertion can match text sitting inside a trailing `// comment` and pass falsely.
**Every NEW source-text assertion uses the CR-tolerant unanchored form**
`/\/\/[^\r\n]*/g`. Repo precedent: `src/app/actions/carry-module-pattern.test.ts:639`
and `src/app/components/content-tab/modules/currentEventsAssignments.wiring.test.ts:242`.
**Caveat, flagged not decided:** unanchored stripping also eats the `//` inside
any `http://` literal. The implementer confirms no assertion in a file being
converted depends on a URL; if one does, add the new helper alongside rather than
converting the existing one.

**L15.** V8's `file-size-ceiling.structure.test.ts` and V16/V17's file are not
the flaky class, but `grading-rows.test.ts` (V14, V15) **is** a directory walker
over two directories (`:482-483`). A whole-tree or multi-directory walker can
flake red under vitest's 5s default - a second instance was observed on
`src/lib/recording-files.kinds.test.ts`, so treat it as a class, not one file. A
red there is re-run before it is believed, and the chunk sets an explicit
`timeout` on any new walking test it adds, following the precedent already in
`classTrendsDraft.not-postable.test.ts:211` (`{ timeout: 30000 }`).

**Source-text tests over-specify.** Pin the fact and the ordering; never the
spelling. V1/V2/V5/V6/V7 pin presence, ordering and structural containment - not
prose, not formatting, not a particular attribute spelling.

---

## 8. Sabotages

**Procedure for every row, both directions:** (1) run the named test, record
PASS and the exact `Test Files` / `Tests` counts; (2) apply the mutation to the
IMPLEMENTATION, never to the test; (3) re-run, record FAIL and which assertion
fired; (4) restore **from a `cp` backup, never `git checkout --`** - a checkout
on an uncommitted file reverts to the index and destroys the chunk's work; (5)
re-run, record PASS and the SAME counts as step 1. A step-5 count that differs
from step 1 means the restore was not clean.

**No two agents sabotage-verify on this tree at the same time.** During the
window, every concurrent measurement by a sibling is untrustworthy even if the
restore is perfect. A16-1 and A16-2 sequence their sabotage passes, or one gets
a private worktree.

### A16-1

| # | Mutation (implementation only) | File that goes RED |
|---|---|---|
| S1 | Delete the `<ClassTrendsPanel .../>` line from `GradingResults.tsx` | `src/app/components/grading-results/classTrendsMount.wiring.test.ts` |
| S2 | Keep the mount but remove the `hasTrendableResults(...)` guard from around it | same file |
| S3 | In the adapter, emit `student: row.studentName` instead of `student: ""` | `src/app/components/grading-results/classTrendsEntry.test.ts` |
| S4 | In the adapter, return an entry whose `run.results` drops ungraded rows | same file (the length assertion in V3) |
| S5 | Make `hasTrendableResults` return `entry.run.results.length > 0` | same file (the V4 product) |
| S6 | Move `computeClassTrends(...)` inside the `requestInsight` async body in `ClassTrendsPanel.tsx` | `src/app/components/drafted-grades/classTrends.wiring.test.ts:79-88` |
| S7 | Hardcode `useState(false)` in `ClassTrendsPanel.tsx`, ignoring `defaultExpanded` | same file, the V7 assertion |
| S8 | Paste 100 filler lines into `GradingResults.tsx` (916 + 100 = 1016) | `src/file-size-ceiling.structure.test.ts` |

**S6 is the one most likely to be skipped and it is the one that matters** - it
is the only assertion standing between "trends renders" and "trends renders only
after a paid model call succeeds". **S8 is not decoration**: `GradingResults.tsx`
has 84 lines of headroom and this chunk writes into it; run S8 BEFORE the mount
is written, so the implementer knows the wall is real and where it is.

### A16-2, one per hop

| # | Hop | Mutation (implementation only) | File that goes RED |
|---|---|---|---|
| S9 | H1 | Delete `rubricAreas` from `composeGradingRowResult`'s returned object | `grading-recording/grading-feedback-prompt.test.ts` |
| S10 | H1 | Return `parsed.rubricAreas` instead of the `scaleResultToPoints` output (the plausible wrong one - unscaled areas) | same file |
| S11 | H2 | Make `composeFailedGradingRow` return the last success's areas | same file |
| S12 | H4 | Revert the action test's expected key list to the six pre-A16-2 keys | `src/app/actions/grading-submission-grade.test.ts` - **and this is the reverse direction**: it proves the oracle still has power after being widened, rather than having been loosened into a tautology |
| S13 | H4 | Add `student: submission.studentName` to the action's pushed result | same file - proves the identity half of the oracle survived the widening |
| S14 | H5/H6 | Drop `rubricAreas` from `classifyGradingResult`'s success branch | `grading-recording/grading-rows.test.ts` |
| S15 | H6 | Pass the areas through on the FAILURE branch too | same file |
| S16 | **H7 - the drop hop** | Remove the explicit `rubricAreas:` line from `applyGradingResultToRow`'s returned object, leaving the delegation to `applyAssessmentResult` alone | same file. **This is the sabotage that proves the repo's twice-paid defect is closed.** Without it, H7 is an assertion about code nobody proved is load-bearing. |
| S17 | H8 | Gate the `rubricAreas` write behind `!row.userEdited` | same file (the `userEdited: true` half of V15) |
| S18 | H10 | Add `rubricAreas` to `toWire` WITHOUT updating the frozen key list | `grading-row-serialization.test.ts:638-641` - the ADD direction |
| S19 | H10 | Remove `rubricAreas` from `toWire` WITH the key list at 17 | same file - the DROP direction. Both directions are required; one alone proves only that the two agree, not that either is right. |
| S20 | H10 | Make `dropBulk: true` DELETE the key rather than blank the value | same file, `:644-651` |
| S21 | H11 | Make `fromWire` return `raw.rubricAreas as RubricAreaResult[]` unguarded | `grading-row-serialization.test.ts`, the V17 garbage fixture |
| S22 | H9 | Make `GradingRow.rubricAreas` optional | `npx tsc --noEmit` stays GREEN and every runtime test stays green - **this sabotage is expected NOT to go red, and that is the finding.** It is why H9 specifies REQUIRED on construction grounds (`snapshot-row.ts:135-141`) rather than on a guard that does not exist. Record the null result; do not report it as a pass. |

**Fixtures come from the emitted shape.** Every A16-2 fixture is built by running
the real producer (`composeGradingRowResult` on a real model-response string, the
real `gradingRowCodec`), never by hand-writing a shape no code path emits. A green
suite once rested entirely on fixtures whose value shape nothing produced.

---

## 9. What contradicts the row, the brief, or this repo's own cards

1. **`grading-row.ts:156-169` is STALE and says the opposite of the tree.** It
   states the recording panel "has no assessment selector of any kind today" and
   that "nothing currently calls `stampGradingRowsWithAssessment` with a real
   value". Both are false: `GradingRecordingPanel.tsx:791-807` renders the
   selector, `:310` passes `assessmentId` into `useGradingRows`, and
   `useGradingRows.ts:362` calls the stamp. **This is the single most
   consequential correction in the revision** - it is the difference between
   inventing a batch boundary for the recording tool and using one that already
   ships and already persists. It is also a textbook instance of "brief from the
   tree, not the doc", with the doc being an in-code comment. The comment should
   be corrected in A16-2's commit.

2. **Revision 1 said the recording tool has "no run object at all".** Wrong twice
   over: the click is a real batch (`handleGradeAll`, `:537-571`) and a per-run
   log record already exists (`GradingRecordingLogGradingRun`,
   `grading-recording-log.ts:141-149`). Corrected in 2.2.

3. **`src/app/actions/grading-submission-grade.test.ts:105,118` deliberately
   asserts the ABSENCE of `rubricAreas`**, with the test's own title saying "no
   rubricAreas". Owner answer 2 reverses a decision that was written down and
   pinned, not one that was merely never made. A16-2 must rewrite that comment
   with the new reason rather than quietly editing the array.

4. **`assessment-row.ts`'s `applyAssessmentResult` enumerates its six fields
   (`:159-165`) rather than spreading.** Any widened result type is silently
   dropped there. This is the hop the repo has twice lost a field at, and it is
   in A11's live file - which is why H7 routes around it instead of through it.

5. **`this-repo.md` says `GradingRecordingPanel.tsx` is 964. It is 995**
   (`@(Get-Content).Count`). A five-line-headroom file described as a
   thirty-six-line one. Unchanged from revision 1 and still unfixed in the card.

6. **`class-trends-draft.ts` is 228 lines, not the 214 in the A16 row's
   `instrument` field.** Unchanged from revision 1 and still unfixed in the row.

7. **The round-1 claim that the panel's "true minimum input is
   `{ run, assignmentName }`" was right about the data and wrong about the
   design.** `GradingResults.tsx` has no `assignmentName` to give it
   (`GradingResultsProps`, `:92-128`), so the widened prop would have had a hole
   at its first consumer. Section 4.1.

8. **`recording-split.structure.test.ts:219`'s `panelTargets.size === 11` passes
   falsely** - the key array at `:203-216` is the test's own hardcoded list, not
   read from source - and its strip regex at `:131`
   (`/\["[a-z]+",\s*"[^"]+"\]/g`) cannot match a key containing a hyphen or a
   digit. Unchanged from revision 1. **No A16 chunk adds a strip entry**, so
   neither trap is reachable from here; recorded so the next scoping pass does
   not rediscover it.

9. **What this environment cannot verify at all, restated so nobody fills it
   in.** No component is rendered by any test (vitest is node-env, collects only
   `src/**/*.test.ts`), so every claim in sections 4.3 and 2 about what the
   instructor SEES - the panel appearing, being open, the cohort line being
   legible beside the results table - is a READING claim. No `.env`, so layer
   B's route cannot be exercised end to end. No live model, so no claim about
   what the AI reading says. No live database. I ran no `npx tsc --noEmit` and
   no `npm test` (both are the wave gate's, and `tsc` has exactly one caller),
   and I edited no file except this one.

---

## 10. Residuals

Every entry names an owner, an instrument, and the step that will measure it. An
entry missing any of the three would be a deletion, and would be called that.

| ID | Residual | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| **RES-A16-3** | `classTrendsDraft.not-postable.test.ts`'s canary-3 roots are a hardcoded four-file list (`:213-218`). Any chunk that adds a component reaching layer C leaves it outside the guard, silently. A16-1's adapter is an ANCESTOR of the panel, not a descendant, so the walk does not cover it - a posting import added to the adapter would be invisible to this guard. | The implementer of the first chunk that adds such a file - A16-1 for the adapter | Read `:213-218`; add the new path to the roots array; sabotage by adding `import { callLlm } from "@/lib/llm"` to the new file and watching canary 3 go red (the prefix list at `:58` already bans `lib/llm` and `lib/gemini`) | A16-1's sabotage pass |
| **RES-A16-4** | No component is rendered by any test in this repo. Every claim about what the instructor sees - the panel appearing, `defaultExpanded` actually opening it, the three pre-run states of 4.3 rendering distinguishably, the cohort line being legible - is a reading claim. | The repo owner | Opening the app in a browser with real env vars | An owner observation after the push. This environment has no `.env` and cannot do it (`docs/loop/this-repo.md` section 6). |
| **RES-A16-6** | `docs/REGRESSION.md` has no baseline for the new mounts. Entry 422 (line 42824) covers the Drafted Grades site only. | The baseline seat, before hand-off | `grep -a` over `docs/REGRESSION.md`; read the tail for the next number rather than inferring it from `grep -ac "^## "`, which does not agree with the entry numbering | The baseline step of A16-1, before the implementer starts. Newest entry is **431** (`grep -an "^## " docs/REGRESSION.md \| tail -4`), so the next is 432. |
| **RES-A16-7** | **Snapshot grading has no assessment boundary at all** (2.3). Until it gets one, a trends panel there would silently mix two assignments, which is exactly what owner answer 1 put out of scope. | A16-4's scoping pass | `grep -n "assessment\|course" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`; then a unit test over a cohort predicate once a label field exists on `SnapshotAssessmentRow` | A16-4's own scoping, after A11's verification clears the directory |
| **RES-A16-8** | The recording tool's table is course-scoped but NOT assessment-scoped (`useGradingRows.ts:98-115`), so it can hold two assignments' rows at once. A16-3's cohort predicate handles it; whether the resulting cohort line reads clearly to an instructor is not something this environment can check. | The repo owner | An owner observation of a table holding two labelled assessments | After A16-3's push |
| **RES-A16-9** | **H8's consequence:** a row whose `totalScore` the instructor overrode by hand still contributes the MODEL's area scores to the trend, so the trend can disagree with the score on screen. The alternative (gating areas behind `userEdited`) leaves the row's areas stale instead, which is worse. Recorded as a known, chosen trade-off rather than an unnoticed one. | The repo owner | An owner observation: edit one row's score, re-grade, compare the trend line with the visible scores | After A16-3's push |
| **RES-A16-10** | **`rubricAreas` carries `comment` (`types.ts:42`), which is model-authored prose.** Persisting it per row grows `ta-rec-grade-table` materially, and quota failure is a live condition on the sibling surface (`SnapshotGradingPanel.tsx:211-212`'s two storage-full messages). H10 mitigates with the `dropBulk` precedent (`snapshot-row-serialization.ts:85`), but the real payload size is unmeasured here. | A16-2's implementer | Serialize a 30-row table with areas through the real `gradingRowCodec` and measure `JSON.stringify(...).length` against the same table without them | A16-2's own verify, before the wire change is considered done |
| **RES-A16-11** | Whether A16-1's new `.ts` leaves and tests trip the four UI-scanning walkers (`buttonVariant.test.ts`, `confirmArmButtons.test.ts`, `modalAdoptionScan.ts`, `page-module-css-orphan-classes.test.ts`) is unverified. They scan for `.tsx` components, Buttons and CSS classes; A16-1 adds `.ts` leaves plus one prop to an existing `.tsx`. | A16-1's implementer | Run each of the four as a single-path `npx vitest run` before and after the diff | A16-1's wave gate |
| **RES-A16-12** | `this-repo.md:68-83` records that extracting a hook out of `SnapshotGradingPanel.tsx` failed lint on `preserve-manual-memoization` naming a callback nobody touched. Whether that generalises to `GradingRecordingPanel.tsx`'s extraction (which A16-3's line budget forces) is unverified. | A16-3's implementer | `npm run lint`, comparing against the four-warning baseline (`RecordingTab.tsx:347`, `repoGradesSliceA.guards.test.ts:83`, two in `canvas-modules/new-quiz.test.ts`) | A16-3's wave gate. A fifth warning is a regression, not drift. |

**Handed over, not residual:** cross-assignment trend accumulation (section
1.3). Receiver: a new backlog row. Obligation: decide the accumulator and
whether `class-trends.ts`'s cohort wording survives it.

---

## 11. Leverage

Named because `docs/DEV_LOOP.md`'s Criteria step requires a mechanism, not a
benefit, and because a checker will ask.

**Class: SCALE, and it is EARNED, not inherited.** `gradeStudentEntries`
(`src/lib/grade/engine.ts:113-134`) pins one `rubric`/`criteria` pair (`:130-131`)
and loops it over every student in the batch (`:134`). Repo Grades goes further
and establishes ONE rubric for the whole run before its worker pool opens
(`useRepoGradesBulkGrade.ts:299-318`), for a measured reason recorded there: the
owner's own log showed denominators of 100, 400, 40 and 16 across eleven students
in a single run when each worker generated its own. A chat window re-grades each
paste independently; nothing holds a batch together as one unit, and nothing can
then say "six of nine students lost points on the same rubric area" because
nothing knows the nine are one cohort.

**Class: GUARANTEED, inherited from layer A and worth stating for what A16 must
not break.** `computeClassTrends` is pure and counted; layer B's observations are
tagged `kind: "inferred"` with no second variant
(`class-trends-insight.ts:171-185`), so a model's reading can never render as a
counted fact. A16 is placement, so it EARNS nothing here - it inherits it, and its
job is to not weaken it. V5/S6 are the assertion that it did not: they keep the
counted layer from becoming reachable only after a paid model call.

**Removal test.** State the deletion, then trace the assertion. Deleting the
`hasTrendableResults(...)` guard at the mount removes the thing that makes this a
run OUTPUT rather than a destination - and S2's observed value changes, from PASS
to FAIL, on exactly that deletion. That is a removal test. **No removal test is
buildable for the click-cost half** (the panel being visible without navigating),
because no component is rendered by any test here; that is RES-A16-4, with an
owner and a step.
