# A downloadable log for "Generate & associate rubric"

Entry 332 shipped the rubric bulk action: one point-agnostic spec, materialised
as one Canvas rubric per distinct point total, associated to every eligible
selected item. It writes to a live course - it CREATES rubrics and ATTACHES
them - and its entire durable record is a one-line note.

## The gap, precisely

The per-item detail already exists in the browser and is deliberately
discarded. `useBulkItemActions.ts:672` calls `summarizeRubricGenerateOutcomes`
on `result.result.outcomes` - a `RubricTargetOutcome[]` carrying, per item, its
own status and reason - and keeps only the COUNTS
(`BulkRubricGenerateReport`), which become a sentence via
`describeRubricGenerateNote`. So the instructor is told "12 updated, 3 already
had one, 2 failed" and can never find out WHICH two failed, or why.

**The orphans are the sharper half.** `BulkRubricGenerateReport.orphans` are
rubrics that were CREATED in Canvas and then not associated - real objects left
behind in the course. Entry 332's own C3 finding was about not destroying
instructor work; an orphan is work this feature created and then abandoned, and
once the note clears, nothing in the app knows which rubrics they were.

## Acceptance criteria

### B1 - what is recorded

1. One entry per TARGET the run considered, not per success: the item, its
   outcome, the reason for anything that is not a plain success, and the rubric
   id and point total when one was involved.
2. **Reuse the reasons that already exist.** `RubricTargetOutcome` and
   `OrphanRubric` already carry them, and `summarizeRubricGenerateOutcomes` is
   already the one function that decides which bucket an outcome falls in
   (entry 332 records that a bug there "silently degrades the instructor-facing
   report"). The log is built from the SAME outcomes, never from a second
   classification - two spellings of "what happened" is how they drift.
3. Every orphan rubric appears in the log, by id, with enough to find it in
   Canvas. This is the one entry an instructor may need to act on.
4. The three failure kinds entry 332 fought to keep distinct - a whole-action
   error, a generation failure (no Canvas write attempted at all), and per-item
   failures - must stay distinct in the log. Collapsing them re-creates the
   defect that entry closed.

### B2 - it must survive the note

5. Persisted per course under a `ta-` key, restored on reload, capped, and
   validated on read - the posture entry 333 established for the Repo Grades
   log and `parseRepoGradeLogEntries` implements. A record that dies with the
   note it replaces has not solved anything.
6. Appended across runs, newest last, oldest dropped at the cap. A second run
   must not erase the first: the orphans from run one are still uncleaned.

### B3 - downloadable

7. CSV and JSON, via `escapeCsvValue` (`src/lib/course-tasks-view-csv.ts`) and
   `triggerFileDownload` (`src/app/components/course-planning/utils.ts`) -
   never a hand-rolled escaper or object-URL dance (REGRESSION 267 check 4).
   A rubric criterion description routinely contains commas and quotes.
8. Clearing is behind a confirm naming the count, as entry 333's panel does -
   localStorage is the only store, so clearing destroys the only copy.

### B4 - where it lives, and the limitation to state rather than hide

9. It renders with the control that produced it, in the items bulk-bar area.
   That means it is only visible while items are selected - a real
   discoverability limit, accepted here because the alternative (a new
   top-level surface, or a 17th-group-style catalog entry with its own audit
   and count-pinned tests) is a larger change than this record justifies.
   **Say so in the regression entry rather than implying it is always
   reachable.**
10. Do NOT add a bulk-bar catalog control for this. `bulkBarGroupCatalog.ts`
    carries an eight-invariant audit and exact group/control count tests; a
    post-run affordance attached to the action's own result is the smaller and
    more honest change.

### B5 - out of scope

Cleaning up orphan rubrics. The log NAMES them so the instructor can act; a
delete path into live Canvas rubrics is its own chunk with its own
consequence-tier decision, and must not be smuggled in behind a logging change.

### B6 - gates

`npx eslint` clean on touched paths; `npx tsc --noEmit` clean; full `vitest
run` green from the baseline measured at dispatch; `npx next build` reaching
"Compiled successfully" and "Finished TypeScript". Every decision pure and
tested - vitest is node-env here and renders nothing.
