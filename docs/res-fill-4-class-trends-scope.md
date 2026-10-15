# RES-FILL-4: class-trends denominator, whole-run vs incremental - INVESTIGATION AND RULING

Status: MEASURED NON-DEFECT. Recommend CLOSING RES-FILL-4. No fix is scoped.

HEAD at investigation: `db07b176` (`git rev-parse HEAD`).

The filing said "I measured neither" and asked whether a deadline-stopped WHOLE
run and a partial INCREMENTAL run compute class-trends over different
denominators. They do not. This document is the measurement, the ruling, and
the evidence.

---

## 1. The claim, restated

> engine.ts (~:296-298) switches every counted class-trends clause OFF for
> not-attempted rows with empty rubricAreas. A deadline-stopped WHOLE run holds
> not-attempted rows (empty rubricAreas) -> clauses off. A partial INCREMENTAL
> run holds ONLY graded rows -> the same guard does NOT fire -> clauses stay on.
> So the two run types may compute class-trends over different denominators.

Two load-bearing premises: (a) there is a guard that turns counted class-trends
clauses off when a not-attempted row with empty `rubricAreas` is PRESENT, and
(b) that guard fires for a whole run (rows present) but not for an incremental
run (rows absent). Both are false against HEAD.

---

## 2. Where the counting actually happens, and what the denominator is

The counted ("layer A") class-trends are computed in ONE pure function,
`computeClassTrends` (`src/lib/grade/class-trends.ts:404`). Its first two
statements set the cohort:

- `src/lib/grade/class-trends.ts:420` -
  `const results = gradedResults(entry.run.results);`
- `src/lib/grade/class-trends.ts:421` - `const totalResults = results.length;`

`gradedResults` and the `isUngraded` discriminant it is built on
(`src/lib/grade/types.ts:226-232`) classify a row SOLELY on
`result.ungraded !== undefined` - never on `rubricAreas`, never on `totalScore`,
never on prose (the comment at `types.ts:224-225` states this is the one place
the question is asked). Therefore:

- `totalResults` (the coverage denominator, and the cohort this whole module
  reports on - `class-trends.ts:160-161`) counts ONLY rows with
  `ungraded === undefined`, i.e. graded rows.
- Every not-attempted row is excluded here, BEFORE any area is tallied, because
  a not-attempted row carries `ungraded` set (built at
  `engine.ts:308-333`/`499-530`, `rubricAreas: []`). It can never raise
  `totalResults`, and it never enters the per-area loop (`class-trends.ts:430`),
  so it cannot raise any area's `resultsWithArea` either.

This `gradedResults(...)` call AT LINE 420 is what both the engine comment and
the class-trends comment mean by "class-trends.ts's exclusion". It is present.

### There is no guard that fires on a present not-attempted row

The claim's premise (a) describes a guard that turns clauses off WHEN a
not-attempted row is present. No such guard exists. The only control over
whether a clause is emitted is per-AREA and depends on that area's parsed
scores: `classifyDirection` (`class-trends.ts:288-309`) returns
`insufficient-data` / `no-scale` from `scoredCount` and `percentValues` of the
scores actually collected for that area. A not-attempted row contributes no
area, so it never reaches `classifyDirection` at all. "Empty `rubricAreas`
switches clauses off" is not a code path; it is a mis-reading (see section 5).

---

## 3. The two run shapes produce IDENTICAL class-trends (measured)

### 3.1 Why reconciliation cannot change the answer

Whole-run results pass through `reconcileRun` (`engine.ts:539`); not-attempted
rows are appended BEFORE that call (`engine.ts:499-530`, comment
`engine.ts:482-492`). Incremental results pass through the SAME `reconcileRun`
inside `buildIncrementalRun` (`src/app/components/grading/incrementalRunPlan.ts:313-329`).
`reconcileRun` returns `{ ...result, rubricAreas: reconciled, overallComment }`
(`reconcile.ts:111`): it rewrites `rubricAreas` and `overallComment` only and
PRESERVES `ungraded` via the spread. So reconciliation never reclassifies a row
from ungraded to graded. A not-attempted row stays ungraded and stays excluded
by `gradedResults` regardless of append order or canonical-column state.

Reconciliation of the GRADED rows is also independent of whether the
not-attempted rows are in the array:
- Parseable-criteria case: `canonical = criteriaNames` (`reconcile.ts:83`) and
  each row is mapped independently (`reconcile.ts:88-112`), so a graded row's
  output depends only on its own `rubricAreas` and `canonical`.
- Empty-criteria fallback: `canonical = unionAreaNames(results)`
  (`reconcile.ts:84`), and `unionAreaNames` (`reconcile.ts:43-57`) iterates each
  row's `rubricAreas`. A not-attempted row has `rubricAreas: []`, so it adds
  nothing to the union. `unionAreaNames([graded + not-attempted]) ===
  unionAreaNames([graded])`.

So the M graded rows reconcile to byte-identical content in both shapes, and the
excluded rows differ only in being counted as `ungraded` (whole run) versus
absent (incremental) - neither of which the trends read.

### 3.2 The equivalence, run

A throwaway proof was written at
`src/lib/grade/res-fill-4-equivalence.scratch.test.ts`, run, and DELETED (it is
not in the tree; `git status --short` shows only pre-existing `docs/*-scope.md`
files). It built M=3 graded rows (identical content) plus a 2-row not-attempted
tail for the whole run, passed both shapes through the real `reconcileRun`, and
asserted the `computeClassTrends` reports equal. It covered both the
parseable-criteria case AND the empty-canonical case the comments call the worst
case, AND the real `buildIncrementalRun` assembler. Full source in Appendix A.

Command and result:

```
npm run test:paths -- src/lib/grade/res-fill-4-equivalence.scratch.test.ts \
  src/lib/grade/class-trends.test.ts \
  src/app/components/grading-recording/classTrendsRunCohort.test.ts
```
=> `Test Files 3 passed (3)`, `Tests 72 passed (72)` (scratch 3 at that point;
46 existing class-trends; 23 cohort). After adding the sensitivity case
(Appendix A, section A.2) the scratch file reported `Tests 4 passed (4)`.

Measured equalities per shape (both criteria cases):
- `wholeReport.totalResults === 3` and `incReport.totalResults === 3`.
- `wholeReport.ungraded === { notAttempted: 2, gradingFailed: 0 }`;
  `incReport.ungraded === { notAttempted: 0, gradingFailed: 0 }`.
- `wholeReport.areas`, `.strengths`, `.struggles`, `.summaryLines`,
  `.instructorAttribution` each deep-equal `incReport`'s.

### 3.3 The proof is a real instrument, not a tautology

The scratch file's sensitivity case replaced the not-attempted tail with
GRADED-shaped rows (no `ungraded`) and asserted the whole run then DIVERGES:
`wholeReport.totalResults === 5`, `incReport.totalResults === 3`, and
`wholeReport.areas !== incReport.areas`. It passed. So the equivalence in 3.2
depends on the `ungraded` discriminant - if the tail rows were graded, the
divergence the claim describes would appear and the test would see it. (A direct
production mutation - deleting the `gradedResults(...)` call at
`class-trends.ts:420` - would show the same divergence; that edit was attempted
and correctly blocked by the sandbox, so the discriminant was exercised through
the fixture instead.)

An EXISTING committed test already pins this behaviour independently:
`src/app/components/grading-recording/classTrendsRunCohort.test.ts:168-180`
asserts `computeClassTrends(...).totalResults === 2` for
`[ready, ready, failed]` - the ungraded row is not counted.

---

## 4. The "two run types" cannot both reach production today

`INCREMENTAL_ROUTE_ENABLED = false`
(`src/app/components/grading/incrementalRunPlan.ts:157`), and `routeGradingRun`
returns `"whole-run"` for every input while the flag is off
(`incrementalRunPlan.ts:178-195`, early return at `:179`). So the incremental
grading pool is not reachable by default (RULING 116, cited in that file's
comment at `:142-157`). Even if the premises in section 1 were true - they are
not - the divergence would require two run types that do not co-exist on the
live path. When the incremental route is later enabled, section 3 still holds:
`buildIncrementalRun` reconciles its arrived rows through the same
`reconcileRun`, and `computeClassTrends` applies the same `gradedResults`
exclusion to whatever `run.results` it is handed.

Note on the incremental shape: `mergeArrivedResults`
(`incrementalRunPlan.ts:225-235`) projects only ARRIVED rows and emits no
not-attempted tail at all - a pending ticket "produces NO ROW" (`:212-224`). So a
partial incremental run holds arrived graded rows (and any grading-failed rows),
never the submission-count or deadline not-attempted tail the whole-run engine
appends. This matches the filing's description and changes nothing: both tails
are `ungraded` and both are excluded by `gradedResults`.

---

## 5. Why the claim looked true: the comments are counterfactual, not current

Two comments describe the exact failure the claim names:

- `engine.ts:482-492`: not-attempted rows "MUST land before canonical-column
  reconciliation ... Appended after, an empty-canonical run ... raises
  totalResults without raising any area's resultsWithArea and silently switches
  every counted class-trends clause off."
- `class-trends.ts:408-419`: "INCLUDING it here would raise totalResults without
  raising any area's resultsWithArea and silently suppress every counted
  class-trends clause."

Read in context, both are COUNTERFACTUALS stating what WOULD happen if the
`gradedResults` exclusion (and, in the engine, the append-before-reconcile
order) were removed. The class-trends comment's verb is explicit: "INCLUDING it
here WOULD..." - the module does not include ungraded rows; it calls
`gradedResults` at `:420`. These comments document WHY the exclusion exists, not
a live behaviour. The filing read "would switch clauses off" as a description of
current behaviour.

The claim's citation is also stale: at HEAD, `engine.ts:296-298` is the
`buildUngradedRow` JSDoc (`engine.ts:297` opens `/**`, `:298` reads "Builds a
row that carries NO grade"), not any class-trends guard. The counting and the
exclusion live in `class-trends.ts`, not `engine.ts`.

---

## 6. Ruling

RES-FILL-4 is a NON-DEFECT. A deadline-stopped whole run and a partial
incremental run with the same graded content compute the SAME class-trends over
the SAME denominator (the graded results in hand), because `computeClassTrends`
excludes every ungraded row via `gradedResults` before counting, reconciliation
cannot reclassify a row, and not-attempted rows contribute nothing to the
graded-row reconciliation. Recommend closing RES-FILL-4 with this document as
its `from`. No file:function to change, no write set, no fix oracle.

There is no owner fork here: "what does the denominator mean" is already answered
in the code and its header - the cohort is "the graded results in hand"
(`class-trends.ts:17-26,160-161`), and every emitted string is coverage-qualified
("N of M submissions graded so far", `class-trends.ts:311-346`) precisely so a
partial batch is never promoted into a whole-roster claim. That decision is
settled; this investigation does not reopen it.

---

## 7. Residual register

One observation, deliberately NOT filed as a backlog row because it owes no work:

- OBSERVATION (no owner, no instrument, no step - therefore no row): the stated
  class-trends CONSEQUENCE in the `engine.ts:482-492` comment ("switches every
  counted class-trends clause off") is not reachable while the `gradedResults`
  exclusion sits upstream at `class-trends.ts:420`, regardless of append order.
  The append-before-reconcile ORDER the comment mandates is still genuinely
  load-bearing for the DISPLAY results table (so ungraded rows render canonical
  empty columns rather than a ragged shape), so the ordering must not be changed
  - only the comment's class-trends justification is over-stated. This is a
  documentation nuance with no behavioural effect; it is recorded here for the
  next editor of that comment and is explicitly not work owed. If a future chunk
  edits that comment, it should narrow the class-trends clause to "the
  `gradedResults` exclusion is the primary guard; this ordering additionally
  keeps the display table rectangular."

Nothing else is deferred, relocated, or owed.

---

## Appendix A - the throwaway equivalence proof (run, then deleted)

Placed at `src/lib/grade/res-fill-4-equivalence.scratch.test.ts`, run via
`npm run test:paths`, and removed. Reproduced here so the measurement can be
rebuilt without re-deriving it. It imports only production symbols
(`computeClassTrends`, `reconcileRun`, `buildIncrementalRun`) and builds
fixtures matching the EMITTED GradeResult shape: a graded row has no `ungraded`
field; a not-attempted row carries `ungraded` set with `rubricAreas: []`, as
`engine.ts` `buildUngradedRow` emits.

### A.1 Equivalence cases
For `criteriaNames` in `[["Thesis","Grammar"], []]`:
- whole = `reconcileRun([...3 graded, notAttempted D(3), notAttempted E(4)], criteriaNames).results`
- incremental = `reconcileRun([...3 graded], criteriaNames).results`
- assert `computeClassTrends(wholeEntry)` deep-equals `computeClassTrends(incEntry)`
  across `areas/strengths/struggles/summaryLines/instructorAttribution`, with
  `totalResults === 3` on both and `ungraded` counts `{2,0}` vs `{0,0}`.
Plus one case driving the real `buildIncrementalRun` (phase `"stopped"`,
`criteriaNames: ["Thesis","Grammar"]`, `totalTicketCount: 5`, 3 arrived) and
asserting its report's `areas`/`summaryLines` equal the whole-run report's.

### A.2 Sensitivity case (proves the instrument can fail)
Replace the not-attempted tail with two GRADED-shaped rows (no `ungraded`),
reconcile against `["Thesis","Grammar"]`, and assert the whole run DIVERGES:
`wholeReport.totalResults === 5`, `incReport.totalResults === 3`,
`wholeReport.areas` not equal to `incReport.areas`. Observed: pass (the
divergence appears exactly when the tail stops being `ungraded`).

Measured: `Tests 4 passed (4)` for the scratch file alone
(`npm run test:paths -- src/lib/grade/res-fill-4-equivalence.scratch.test.ts`).
