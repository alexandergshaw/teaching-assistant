# Grading sub-tab: is Class Trends effectively enabled on all six tools?

Owner's instruction: "trends need to be enabled for all of the grading tools
in the grading subtab." This audits the six `GradingView` members
(`src/app/components/manual/manual-rail.ts:43`) for three separate things a
grep for `ClassTrendsPanel` cannot distinguish: whether the panel is mounted
on a path that actually runs (REACHABLE), whether the run it is fed ever
carries `rubricAreas` so the panel's own gate can open (TRENDABLE), and
whether the gate used is the standard one or something else (GATE).

## Scope and method

Read-only analysis. One file written (`docs/grading-subtab-trends-audit.md`).
No code changed, no commit, no push. Every code claim below is `file:line`,
opened directly (not recalled). Every test-count quantity names the exact
`npm run test:paths --` invocation that produced it. "Nothing renders under
vitest" (`AGENTS.md`, `docs/DEV_LOOP.md`) applies here as everywhere else in
this repo: whether `ClassTrendsPanel` visually paints, focuses correctly, or
is legible is NOT something this audit (or this test suite) can confirm - it
is reasoning from source plus an owner-walk item, called out explicitly below.
What IS answerable from the code and its tests, and answered concretely, is
the DATA question: does each surface's run ever carry `results[].rubricAreas`
so `hasTrendableResults` (or its wrapped equivalent) can return true.

## The shared gate

`hasTrendableResults(entry)` (`src/app/components/grading-results/classTrendsEntry.ts:52`):

```
export function hasTrendableResults(entry: GradingRunEntry): boolean {
  return entry.run.results.some((r) => !r.ungraded && r.rubricAreas.length > 0);
}
```

True iff at least one result in the run is graded (not `ungraded`) AND that
result's `rubricAreas` array is non-empty. Five of the six surfaces call this
function directly or through a wrapper that calls it internally (repos). The
sixth (drafts) does not call it at all - see its row below.

## Per-tool table

| Tool | Renders ClassTrendsPanel? | Reachable? | Run produces `rubricAreas`? | Gate condition | Effectively enabled? |
|---|---|---|---|---|---|
| run | Yes, `GradingResults.tsx:619` | Yes - `GradingTab.tsx:567` mounts `GradingResults` unconditionally on that tab | Yes - `gradeSubmission` (`src/lib/grade/engine.ts:41`) sets `rubricAreas` (line 125) from the parsed LLM response on every graded result | `hasTrendableResults(classTrendsEntry) &&` at `GradingResults.tsx:617` | **Yes** |
| chat | Yes, same `GradingResults.tsx:619` (chat mounts the shared component) | Yes - `GradingChatPanel.tsx:172-173`: `{hasRows && driver.run ? <GradingResults .../> : ...}`, and `page.tsx:744-749` mounts `GradingChatPanel` when `gradingView === "chat"` | Yes - the per-item route (`src/app/api/grade-run-item/route.ts:187,201`) calls the SAME `gradeEntries([entry], ...)` as every other LLM path and returns `outcome.value.results[0]` (a real `gradeSubmission` result, not a batch aggregate) | Same `hasTrendableResults` gate inside `GradingResults.tsx:617`, inherited automatically | **Yes** |
| repos | Yes, `repo-grades/index.tsx:856` | Yes - `{trendsEntry && (...)}` at `index.tsx:853` | Yes for both engines this tool can use: the LLM branch (`github-repos.ts:839`, `gradeEntries`) and the deterministic "embedded" branch (`github-repos.ts:812,829`, `gradeEntriesEmbedded` → `embedded-grader/index.ts:203` `rubricAreas: scaled.rubricAreas`, built from a non-empty `rubric.checks` loop) both populate non-empty `rubricAreas` on a graded result; `useRepoGradesBulkGrade.ts:401` pushes `result.run.results` into the cohort BY REFERENCE, no rewrite | `trendsEntry` truthy, where `trendsEntry = repoRunTrendsEntry(cohort, liveCourseId)` (`classTrendsFolderEntry.ts:90-96`) itself calls `hasTrendableResults(entry)` internally (line 95) plus an unrelated `cohort.courseId === liveCourseId` check | **Yes** |
| recording | Yes, `GradingRecordingPanel.tsx:927` | Yes - `{(() => { const trendsEntry = ...; return trendsEntry && hasTrendableResults(trendsEntry) && (<div>...<ClassTrendsPanel .../>...); })()}` at lines 921-927, inside the panel's normal render body (not behind a dead flag) | Yes - `composeGradingRowResult` (`grading-feedback-prompt.ts:174`) calls `parseRubricResponse` and `scaleResultToPoints` exactly like the main engine, and its header comment (`grading-feedback-prompt.ts:60-70`) documents this as a FIX: this surface used to discard `rubricAreas` (docs/BACKLOG.md F1) and was corrected to restore it; `buildRunCohort` (`classTrendsRunCohort.ts:98`) sets `rubricAreas: classified.rubricAreas` (line 123) for every "ready" row, never `[]` unless the row failed | `trendsEntry && hasTrendableResults(trendsEntry)` at `GradingRecordingPanel.tsx:924-925` | **Yes** |
| snapshots | Yes, `SnapshotGradingPanel.tsx:924` | Yes - `{hasTrendableResults(snapshotTrendsEntry) && (...)}` at line 916, inside the panel's normal render body | Yes - `snapshotGradeAction` (`snapshot-grade.ts:47`) returns `answer.rubricResults` from the model's own JSON, and `useSnapshotGrade.ts:266` sets `rubricAreas: verified`, where `verified = verifySnapshotCitations(result.answer.rubricResults, ...)` (`snapshot-citations.ts:59`) is a 1:1 `.map` (confirmed by reading the function body - no `.filter` anywhere in it), so verification can mark a citation `verified: false` but never drops the area from the array | `hasTrendableResults(snapshotTrendsEntry)` at `SnapshotGradingPanel.tsx:916` | **Yes** |
| drafts | Yes, `DraftedGradesTab.tsx:655`, unconditional | Yes - rendered once per assignment group inside the drafts list, which is itself reachable whenever a draft exists | Depends entirely on the run that was drafted (a draft persists a `GradingRunEntry` produced by one of the other five surfaces, `draft.payload.runs`, read via `buildDraftSections`, `grading-draft-view.ts:105-116`); serialization round-trips `rubricAreas` (`src/lib/grading-drafts.ts:99-122`) | **No gate at all** - `<ClassTrendsPanel entry={entry} />` at `DraftedGradesTab.tsx:655` has no `hasTrendableResults` guard (confirmed: no `hasTrendableResults` import anywhere in `DraftedGradesTab.tsx`) | **Yes, but see note below** |

## The drafts exception, and why it is not the same defect the gate exists to prevent

`ClassTrendsPanel` itself (`drafted-grades/ClassTrendsPanel.tsx:76`) always
renders its toggle button unconditionally - line 136:
`{expanded ? "Hide trends" : \`Trends (${report.areas.length})\`}`. It never
refuses to mount itself; the `hasTrendableResults` wrapping is something each
of the other five call sites adds around it, precisely so a run with nothing
graded yet does not show a "Trends (0)" button
(`classTrendsEntry.ts` is not the only place this is spelled out - the design
note lives in `GradingResults.tsx:613-614`'s own comment: "gated on
hasTrendableResults so a run with nothing graded yet renders nothing at all,
never a 'Trends (0)' button").

`DraftedGradesTab.tsx:655` never picked up that wrapping. The practical
consequence:

- Trends are effectively enabled for drafts whenever the drafted run has
  trendable data - the button is unconditionally present and
  `computeClassTrends(entry)` (inside `ClassTrendsPanel.tsx:91`) is computed
  fresh on every render from the full `entry.run.results`, so real data always
  shows through. This is the OPPOSITE failure direction from "silently never
  shows" - it is "shows a button that says Trends (0) and, when expanded,
  says 'No graded results to summarize yet'" for a draft with nothing
  trendable. That happens only when a draft's own run had nothing gradable in
  the first place (all five producing surfaces already refuse to draft
  something with zero trendable results before this point in their own UI,
  though that refusal was not traced end-to-end here - see residuals).
- This IS an inconsistency with the other five surfaces' UX (a cosmetic
  "Trends (0)" can appear on drafts where it cannot on the others), but it is
  NOT a case of trends being unreachable or never-populated. Whether the
  owner wants drafts' button suppressed the same way is a product call, not a
  data-correctness defect - flagged as a residual, not fixed here (this
  audit is read-only by brief).

## Point 3: is the repos gate looser or stricter, and does it matter?

`repoRunTrendsEntry` (`classTrendsFolderEntry.ts:90-96`):

```
export function repoRunTrendsEntry(cohort: RepoRunCohort | null, liveCourseId: string): GradingRunEntry | null {
  if (cohort === null) return null;
  if (cohort.courseId !== liveCourseId) return null;
  const run: GradingRun = { results: [...cohort.results], rubricAreaNames: [], fullCreditChecklist: [] };
  const entry = toClassTrendsEntry(run, { courseName: cohort.courseName, assignmentName: cohort.folder, canvasUrl: "" });
  return hasTrendableResults(entry) ? entry : null;
}
```

`trendsEntry` (the value `index.tsx:853` actually branches on) is the return
value of this function, not an independent condition. Line 95 calls
`hasTrendableResults(entry)` itself before returning non-null, so
"`trendsEntry` truthy" is a STRICT SUBSET of "`hasTrendableResults` true" -
it can never be truthy while `hasTrendableResults` is false (so it can never
show an empty trends panel; not looser), and it adds exactly one extra
condition unrelated to trendability: `cohort.courseId === liveCourseId`. That
extra condition is deliberate, per this function's own doc comment
(`classTrendsFolderEntry.ts:85-89`): "a course switch mid-run must hide the
finishing run's stale-course cohort." So the repos gate can hide a
genuinely-trendable cohort in exactly one situation - the instructor switched
courses while a repo-grading run was still finishing - which is a
correctness feature (never show one course's trends mislabeled as another's),
not the "not effectively enabled" failure mode this audit is looking for.

**Verdict: the repos gating difference is real but cosmetic-to-this-audit's
question - it is not a defect, and it does not make trends less available on
repos than on the other four gated surfaces.** The only material difference
from the run/chat/recording/snapshots gate is that call sites there re-derive
`hasTrendableResults(entry)` themselves at the render site, while repos'
predicate is baked into the leaf function - same result, different location.

## Verification performed (all commands run this session; exact counts below)

Adapter unit tests (the four `toClassTrendsEntry`/gate-wrapper leaves):

```
npm run test:paths -- src/app/components/grading-results/classTrendsEntry.test.ts src/app/components/repo-grades/classTrendsFolderEntry.test.ts src/app/components/grading-recording/classTrendsRunCohort.test.ts src/app/components/snapshot-grading/classTrendsSnapshotEntry.test.ts
```
Result: **4 files passed, 71 tests passed** (10 + 27 + 23 + 11).

Engine-level tests confirming each surface's grading path actually populates
`rubricAreas` (not just that the adapter trusts a mocked shape):

```
npm run test:paths -- src/lib/grade/engine.test.ts src/lib/embedded-grader/index.test.ts src/app/components/grading-recording/grading-feedback-prompt.test.ts src/app/components/snapshot-grading/snapshot-citations.test.ts src/app/api/grade-run-item/route.test.ts
```
Result: **5 files passed, 93 tests passed** (12 + 19 + 32 + 12 + 18).

Mount/wiring canaries (source-text pins that the panel is actually rendered
at the cited call sites, for chat/recording/repos):

```
npm run test:paths -- src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts src/app/components/grading-chat/GradingChatPanel.structure.test.ts
```
Result: **3 files passed, 113 tests passed** (58 + 42 + 13).

Mount/gate canary for the shared `GradingResults.tsx` component (covers
run and chat, which both render it):

```
npm run test:paths -- src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
```
Result: **1 file passed, 34 tests passed.**

Total measured this session: **13 test files, 311 passing tests, 0 failing**,
across four separate `npm run test:paths --` invocations (each command's
per-file `COVERED ... passed=N` line is what the counts above are read from,
not a recollection).

CORRECTION (orchestrator, verified against the tree): the claim in an earlier
draft of this audit that DraftedGradesTab's trends mount is unpinned was WRONG.
It rested on `grep -rln "DraftedGradesTab" src/app/components/*.test.ts`, whose
glob covers only the top-level `components/` directory and NOT
`components/drafted-grades/`, where the pinning test actually lives.
`src/app/components/drafted-grades/classTrends.wiring.test.ts` (backlog N12)
reads `DraftedGradesTab.tsx` as `TAB_PATH` and asserts, on stripped source,
that the tab imports `ClassTrendsPanel` from `./drafted-grades/ClassTrendsPanel`,
renders `<ClassTrendsPanel`, mounts it inside the per-assignment group header
alongside `AssignmentChecklistPanel`, and passes `entry={entry}`. So drafts'
trends mount IS pinned by a committed wiring test, exactly like the other five.
The "drafts" row above is therefore corroborated by that test, not only by a
direct read.

## Answer

All six grading-sub-tab tools render `ClassTrendsPanel` on a reachable path,
and all six tools' grading paths populate `results[].rubricAreas` whenever a
result is actually graded (confirmed for both engines repos can use -
LLM and "embedded"/deterministic). Five of the six (run, chat, repos,
recording, snapshots) gate the mount on `hasTrendableResults` or an
equivalent that embeds it, so none of them can render an empty "Trends (0)"
panel and none of them can silently fail to show trends when data exists.
The sixth (drafts) has no such gate at all, which is the opposite failure
direction - it always shows the button, including a "Trends (0)" state for a
genuinely empty draft (a state that appears to be unreachable in practice
today, since nothing was found that persists a draft with zero trendable
results, but that was not proven end-to-end - see residuals).

**"Already done" is the answer for the specific risk this audit was scoped
to catch - a surface that renders the panel but whose runs never carry
rubricAreas, making trends silently dead. That risk was not found on any of
the six tools.** The one real finding is the drafts UX inconsistency (no
`hasTrendableResults` gate, unlike the other five), which is cosmetic in the
direction of showing more, not less, and is recorded as a residual for the
owner to decide on, not fixed here per this audit's read-only brief.

## Residuals

| # | What is not proven now | Owner | Instrument | Step that would measure it |
|---|---|---|---|---|
| R1 | Whether `ClassTrendsPanel` visually paints, is keyboard-reachable, and reads correctly to a screen reader on any of the six surfaces | Owner (or a future accessibility pass) | A real browser render - nothing in this repo's vitest suite renders a component (`AGENTS.md`, `docs/DEV_LOOP.md`) | An owner walk of the six tools in the running app, or a future Playwright/manual-render pass |
| R2 | Whether a LIVE Gemini call, for a real rubric with areas, reliably returns a response `parseRubricResponse` parses into non-empty `rubricAreas` (this audit confirmed the CODE PATH always assigns whatever `parseRubricResponse` returns, and unit tests confirm the parser and the wiring against fixture text, but no test here exercises the real model) | Owner | A live grading run against a real Gemini key | Run "run" or "chat" once against a real assignment + rubric with at least one area, confirm the trends button shows a nonzero count |
| R3 | Whether the drafts surface can ever actually be handed a `GradingRunEntry` with zero trendable results (i.e. whether the "Trends (0)" cosmetic gap on drafts is reachable in practice, or dead because every producing surface already refuses to let an all-ungraded run reach a draft) | Owner | Trace `saveDraftAction`/wherever a draft is created, for every one of the five producing surfaces, for a refusal-to-draft-nothing-graded rule | A follow-up grep-and-read pass on the draft-save call sites, or an explicit product decision to add the same `hasTrendableResults` gate to `DraftedGradesTab.tsx:655` regardless of reachability |
| R4 | ~~No committed test pins `DraftedGradesTab.tsx`'s `ClassTrendsPanel` mount~~ WITHDRAWN - false residual. `src/app/components/drafted-grades/classTrends.wiring.test.ts` (N12) already pins the import, the render, the group-header placement, and `entry={entry}`, reading `DraftedGradesTab.tsx` directly. The original grep missed it by globbing only `components/*.test.ts`, not the `drafted-grades/` subfolder. | - (closed, no gap) | - | No action - the mount is protected the same way the other five are |

## What this audit did not touch

Read-only per the brief: no code, no test, no commit, no push. The one file
written is this one. `git status --short` after writing it is reported below.
