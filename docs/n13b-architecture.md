# N13b architecture and design pass (round 1)

Item: `N13b` (`docs/backlog.yml:199-210`). Area: grading-run-survival-and-disclosure.
Consumes the settled acceptance criteria at `docs/n13b-acceptance-criteria.md`
(AC-1..AC-12, R1..R4, OV-1/OV-2). Seat: `loop-architect`. This pass decides
SHAPE only - no production code, no test code. A fresh `loop-checker` gates this
before any implementer or test-author consumes it.

This is a NEW artifact, not a restructuring of a prior architecture pass, so
there is no disposition table to re-derive (my brief requires one only when a
prior version is restructured; none exists - `ls docs/n13b-arch*` returns only
this file, written this turn).

Every quantity below names the command that produced it. Every file:line was
opened before it was cited.

---

## 0. What I measured, and with which command

- Line counts, PowerShell `@(Get-Content <path>).Count` (the repo-sanctioned
  counter; MEMORY "size files with @(Get-Content).Count, never
  Measure-Object -Line"):
  - `src/lib/grade/class-trends.ts` = 355
  - `src/lib/grade/class-trends-draft.ts` = 178
  - `src/lib/grade/class-trends-insight.ts` = 270
  - `src/app/components/drafted-grades/ClassTrendsPanel.tsx` = 212
  - `src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx` = 117
  - `src/app/components/repo-grades/classTrendsFolderEntry.ts` = 113
  - `src/app/components/grading-results/classTrendsEntry.ts` = 54
  - `src/app/components/grading-recording/classTrendsRunCohort.ts` = 181
- Mount surfaces, from the AC's own instrument
  `grep -rln '<ClassTrendsPanel' src/app --include=*.tsx` (AC-12): five -
  `DraftedGradesTab.tsx`, `grading-recording/GradingRecordingPanel.tsx`,
  `GradingResults.tsx`, `repo-grades/index.tsx`,
  `snapshot-grading/SnapshotGradingPanel.tsx`. The repo mount is at
  `src/app/components/repo-grades/index.tsx:856`
  (`grep -n '<ClassTrendsPanel' src/app/components/repo-grades/index.tsx`).
- Source-text readers and importers of the edited modules: the two greps in
  section 6, output pasted there.

---

## 1. The shape in one paragraph (so the rest reads as detail, not surprise)

The subset signal is COUNTED in layer A (`class-trends.ts`), which today drops
identity: `AreaTrend.percentValues` is an anonymous `number[]`
(`class-trends.ts:144`). The fix threads a per-result DISTINCT-STUDENT identity
into the layer-A accumulation and emits TWO new, TYPE-SEPARATED products: (i)
numbers-only per area, on `AreaTrend` (`missedSubset: {studentCount,
denominator, unknownExcludedCount} | null`), which the class-addressed draft
renders name-free; and (ii) a top-level `ClassTrendsReport.instructorAttribution`
carrying the NAMED per-area list, which ONLY a new instructor-facing leaf reads.
Identity per result is supplied by a resolver argument whose DEFAULT (Canvas
family: one graded result = one distinct student) requires no surface change,
and whose repo-surface value is the single knob the R3 fork turns. The existing
whole-panel `.student` ban (`classTrends.wiring.test.ts:128-130`) stays intact
and UNREFINED because names never enter `ClassTrendsPanel.tsx`; they enter the
new leaf through a field that is not spelled `.student`.

---

## 2. Decision 1 (R1): the name-exclusion collision - RECOMMENDATION (a), a new instructor leaf

### The collision, measured

- `classTrends.wiring.test.ts:128-130` asserts `ClassTrendsPanel.tsx` (comment-
  stripped) contains NO `.student` read:
  `expect(strippedPanel).not.toMatch(/\.student\b/)` (opened; the regex is a
  literal `.student` with a trailing `\b` word boundary).
- AC-9 requires an instructor-facing per-area NAMED list.
- `class-trends.ts:150-152` documents `AreaTrend.summary` as carrying no student
  name; `class-trends-insight.ts:57-58` declares `anonymizeGradeResults` the ONLY
  reader of `.student` before a prompt, at INPUT not output (`:36-39`).

### Ruling: option (a) - a new instructor-only leaf; the panel `.student` ban is KEPT, not refined

Add `src/app/components/drafted-grades/ClassTrendsStudentListPanel.tsx`, a sibling
of `ClassTrendsDraftPanel.tsx`. `ClassTrendsPanel.tsx` mounts it (below the
counted-trends list, above/beside the draft panel - exact placement is UX's, OV-2)
and passes it `report.instructorAttribution` (section 4). The names are consumed
inside that leaf.

Why (a) over (b): the checker's own note (AC "Satisfiability" section) records
that (a) "leaves the existing guard intact - the stronger outcome." Under (a)
the `.student` ban on `ClassTrendsPanel.tsx` remains TRUE by construction, not
loosened: the panel reads `report.instructorAttribution`, a field of type
`AreaAttribution[]` (section 4), never the token `.student`. A loosened guard
ships only with the feature that needs it (my brief); here NO loosening of that
particular guard is needed, so none is done.

### The two structural guarantees this rests on (both are new gates - see section 5)

1. Names must not reach the CLASS-addressed text (AC-8). This is guaranteed by
   TYPE, not by scanning output: `composeClassTrendsDraft`
   (`class-trends-draft.ts:118-122`) iterates `report.areas` and reads only
   `AreaTrend` fields. The names live on `ClassTrendsReport.instructorAttribution`
   - a SIBLING of `areas`, never inside an `AreaTrend` - so the composer's
   existing iteration domain cannot reach a name. The subset CLAUSE the class
   draft renders is computed from `AreaTrend.missedSubset` (numbers only). This
   is the "strongest form" AC-8's note points at: the class composer is not
   handed a channel a name can travel through.
2. The instructor leaf is a NEW file that layer C reaches, so it MUST become a
   root in `classTrendsDraft.not-postable.test.ts` (AC-10 / R4). Its current
   canary-3 roots are seven files (`classTrendsDraft.not-postable.test.ts:207-233`,
   opened); `ClassTrendsStudentListPanel.tsx` is the eighth. Without adding it,
   the leaf could import a posting/model capability and every gate would stay
   green - the exact failure that test's header (`:5-20`) exists to catch.

### `.student` sub-hazard, stated so no one dodges a guard with a spelling

The new field is `instructorAttribution`, accessed in the leaf as
`item.displayName` / `attribution.students[i].displayName` (section 4). It is NOT
named `.student*`. I am NOT relying on `/\.student\b/` failing to match a
near-miss like `.students`; the design keeps the token `.student` out of BOTH
the panel and the leaf entirely. The leaf reads `displayName`, a name the
anonymiser-style ban is not written against and does not need to be, because the
leaf is instructor-facing by construction.

---

## 3. Decision 3: raw-number to percent conversion (AC-4) - RULING: NO conversion

### Measured facts

- `parseScoreValue` (`class-trends.ts:77-106`, opened) yields `percent` (a real
  0-100 scale: an explicit `%` or an `N/M` fraction), `raw-number` (a bare "8",
  no stated scale), or `unscored`.
- `RubricAreaResult` (`types.ts:39-43`, opened) is `{ area: string; score:
  string; comment: string }`. The per-result area score is a STRING with no
  maximum attached.
- `RubricCriterion` (`types.ts:459-463 (points:462)`, opened) is `{ name: string; points:
  number | null }` - part of the rubric DEFINITION, a structure `computeClassTrends`
  never receives. `computeClassTrends(entry)` reads only
  `entry.run.results[].rubricAreas[]` (`class-trends.ts:288-303`, opened), i.e.
  `RubricAreaResult[]`.

### Ruling

A `raw-number` score is UNKNOWN: excluded from BOTH the subset numerator (not
counted as missed) AND the denominator (not counted as not-missed), and its
presence is disclosed (`AreaTrend.missedSubset.unknownExcludedCount`, plus the
existing `unscoredCount` at `class-trends.ts:142`). This is exactly AC-4's
recommendation, and I do NOT introduce a `RubricCriterion.points` /
`pointsPossible` conversion. Two independent reasons, either sufficient:

1. Reachability: the criterion maxima are not on `computeClassTrends`' input.
   Converting would require threading the rubric DEFINITION into layer A - a new
   input the module has never taken - AND joining a `RubricAreaResult` to a
   `RubricCriterion` by area name. `normalizeAreaName`-vs-criterion-title is a
   fuzzy join; a mismatch would assign a wrong denominator.
2. Principle: the module's whole documented stance is that it refuses to invent
   a denominator (`class-trends.ts:44-58`, and `classifyDirection` returns
   `no-scale` rather than guess, `:188-192`, opened). A bare "8" states no
   maximum; promoting it to a percent by a guessed or fuzzily-joined maximum is
   the "silent promotion" the row (`backlog.yml:209`) and AC-4 warn against.

R2 already routes owner confirmation of AC-4/AC-5 as a non-gating batched
question; this ruling is the recommended reading to apply on a "yes", and it does
not depend on the answer to proceed with the shape (a "no" narrows what counts as
missed but does not move where identity or the count live).

---

## 4. Decision 4: where the subset is COUNTED and where attribution enters (AC-6, AC-9, AC-10) plus the identity seam (R3)

### 4.1 Identity enters layer A through a resolver argument; the count is layer A's

Today `computeClassTrends` (`class-trends.ts:259-355`, opened) accumulates per
area only `rawScores: string[]` (`AreaAccumulator`, `:245-248`) - identity is
dropped although `result.student`/`result.userId` are in scope in the loop
(`:282`). The design adds identity at that loop.

New second argument (optional), the seam every surface is built against:

```
type SubsetIdentity =
  | { kind: "per-result" }                               // DEFAULT
  | { kind: "resolved"; keyOf: (result, index) => { key: string; displayName: string } | null }
  | { kind: "unavailable"; reason: string };
```

`computeClassTrends(entry, identity: SubsetIdentity = { kind: "per-result" })`.

- `per-result` (Canvas family: Drafted Grades, LMS Grading results, recording,
  snapshot): each graded result IS one distinct student (one submission per
  student is the platform invariant the AC states, AC-1). Distinct-student key =
  `userId != null ? "u:" + userId : "i:" + index` (`GradedResult.userId`,
  `types.ts:278`, opened); `displayName = result.student` (`types.ts:213`,
  opened). No dedup occurs because keys are already 1:1 with results.
- `resolved` (repo family, option Y): `keyOf` maps each result to a roster
  identity; two results with the same `key` collapse to one distinct student.
- `unavailable` (repo family, option X): the subset is SUPPRESSED for this run -
  `missedSubset = null` for every area and `instructorAttribution = []` - and the
  `reason` is surfaced so the instructor is told why, never silently miscounted.

The DEFAULT is `per-result`, so the four Canvas-family run-cohort leaves
(`classTrendsEntry.ts` = 54 lines, `classTrendsRunCohort.ts` = 181,
`classTrendsSnapshotEntry.ts`, and Drafted Grades' direct mount) need NO change:
they call the panel exactly as now, and the panel calls `computeClassTrends(entry)`
with the argument omitted.

### 4.2 What layer A counts (AC-1, AC-2, AC-6, AC-7)

Per area, over the DISTINCT identity keys derived above:

- numerator `studentCount` = count of distinct keys whose parsed score for the
  area is `percent`-kind AND strictly below the scale maximum (`< 100` for `%`;
  `numerator < denominator` for `N/M`) - AC-3, AC-5. A key that missed points on
  the area under two spellings counts once (the existing per-result dedup at
  `class-trends.ts:287-293` handles one result; the identity key handles across
  results).
- denominator `denominator` = count of distinct keys that HAD this area with a
  `percent`-kind (known) score. This is the SAME identity population as the
  numerator (AC-7). UNKNOWN scores (`raw-number`/`unscored`, Decision 3) are in
  neither term; their distinct-key count is `unknownExcludedCount` (disclosed).
- `AreaTrend.missedSubset = { studentCount, denominator, unknownExcludedCount }`
  or `null` when `identity.kind === "unavailable"`.

Threshold: `SUBSET_MIN_STUDENTS = 3`, a new constant beside `HIGH_PERCENT_THRESHOLD`
/`LOW_PERCENT_THRESHOLD` (`class-trends.ts:114-115`). The `>= 3` predicate lives
in ONE place, a helper `isSubsetTrend(area) => area.missedSubset != null &&
area.missedSubset.studentCount >= SUBSET_MIN_STUDENTS`. AC-2's fixtures (2 and 3
distinct students, class of 4 and 30) test this helper and the count. Not gated on
`areaFullyCovered` (AC-6): the count is computed unconditionally in layer A; the
coverage gate lives only in layer C and only on the pre-existing high/low clauses
(section 4.4).

### 4.3 The named list (AC-9, AC-10)

`ClassTrendsReport.instructorAttribution: AreaAttribution[]`, where

```
interface AreaAttribution {
  area: string;          // normalized key, matches AreaTrend.area
  displayArea: string;
  students: { displayName: string; deductionLabel: string }[];
}
```

`students` is exactly the set of distinct keys `studentCount` counted for that
area (same members, same cardinality - AC-9), each with its `displayName` and a
`deductionLabel` conveying deduction size (AC-5: a trivial 19.5/20 still counts
and reads as trivial). Produced by the SAME layer-A pass as the count, from the
same distinct-key set, so the list and the count cannot diverge. No model call:
this is arithmetic and string assembly over typed, parsed data (AC-10). Only
populated when `identity.kind !== "unavailable"`.

### 4.4 How BOTH outputs reach the surface (the surface is a layer)

- Class-addressed clause (numbers, name-free): a NEW renderer in
  `class-trends-draft.ts`, alongside `renderCountedClause` (`:80-89`, opened),
  reads `AreaTrend.missedSubset` for areas where `isSubsetTrend` holds. It states
  its OWN denominator from `missedSubset.denominator` (AC-7), NEVER
  `report.totalResults`, and is NOT filtered through `areaFullyCovered`
  (`:65-67`, opened) - the existing `.filter(areaFullyCovered)` at `:144` stays
  on the high/low `countedClauses` path only (AC-3 keeps those unchanged; AC-6
  is the deliberately-opposite gate). Exact prose is UX + test-author's; the
  clause noun must track the identity basis ("students" where the count is truly
  over students) and must not combine with a `FORBIDDEN_COMPLETENESS_PHRASE`
  (`class-trends.ts:27-32`) - reuse `containsForbiddenCompletenessPhrase`
  (`:37-40`), the last-resort check at `class-trends-draft.ts:170` already covers
  the assembled markdown.
- Instructor named list: `ClassTrendsPanel.tsx` passes `report.instructorAttribution`
  as a prop to the new `ClassTrendsStudentListPanel.tsx` leaf (section 2). The
  panel never reads `.student`.

Both are rendered from the same `report` the panel already computes in
`useMemo` (`ClassTrendsPanel.tsx:91`, opened), so no second compute path and no
network are introduced.

---

## 5. R3: the repo-surface identity basis - the fork, and why the shape does not block on it

### 5.1 The measured join gap (this is the shape finding)

On the repo surface the roster identity is NOT reachable from what the trends
cohort carries, and the join key needed to reach it is discarded before the
cohort is built:

- `GradeResult.student = label?.trim() || digest.fullName` (`github-repos.ts:619`,
  opened via `repoDigestToEmbeddedEntry` `:602-624`) - the repo's display name,
  not the roster student.
- The roster binding is `RepoGradeRow.binding: RepoBindingSuggestion`
  (`repoGradesRows.ts:119`, opened), keyed by repo FULL NAME
  (`RepoBindingSuggestion.repo`, `repo-student-bindings.ts:48-49`, opened). It is
  grid state in `useRepoGradesGradingActions.ts` / `index.tsx`, NOT on any
  `GradeResult`.
- The repo full name (`target.repo` / the action's returned `fullName`) IS known
  at grade time, but is DISCARDED at `runResults.push(...result.run.results)`
  (`useRepoGradesBulkGrade.ts:401`, opened). `RepoRunCohort.results` is
  `readonly GradeResult[]` by reference (`classTrendsFolderEntry.ts:38-50`,
  opened) and `repoRunTrendsEntry` builds `{ results: [...cohort.results], ... }`
  (`:90-96`) - no binding, no repo full name.
- `GradeResult.gradedRepo` (`types.ts:250`) is NOT set on the repo bulk path:
  `repoDigestToEmbeddedEntry` (`github-repos.ts:602-624`) does not set it, and
  `grep -rn gradedRepo src/app/actions/github-repos.ts` returns no assignment in
  `gradeRepoAction`. It is populated only on the Canvas GitHub-URL extraction
  path (`extraction.ts:287`, seen in the grep). So even `gradedRepo` is not a
  usable join key here.

Consequence: with no roster identity and no repo-full-name channel on the cohort,
the ONLY per-result identity reachable in layer A on the repo path is
`GradeResult.student` = the repo label. Counting distinct repo labels as distinct
students would count two repos owned by one roster student as two (and count each
unbound repo as a student) - a DIRECT violation of AC-1 ("RED if two submissions
from one roster student are counted as two") and AC-7 (student numerator paired
with a submission-population denominator).

### 5.2 The fork (a genuine product fork; both branches ship something)

- Option X (recommended): the repo surface passes `identity = { kind:
  "unavailable", reason }` to the panel. Layer A suppresses `missedSubset`
  (null) and `instructorAttribution` ([]) for repo runs and the panel discloses
  why; the repo mount still renders the EXISTING counted high/low trends,
  unchanged. The subset feature ships CORRECT on the four Canvas-family surfaces
  now. The roster-identity channel is R3, a bounded repo-surface follow-up.
- Option Y: build the channel now - capture repo full name per result at the
  bulk-grade collector (`useRepoGradesBulkGrade.ts` near `:401`), carry a
  per-result repo id plus a `{ repoFullName -> RepoBindingSuggestion }` map
  through `RepoRunCohort` (`classTrendsFolderEntry.ts`) and
  `useRepoGradesGradingActions.ts` / `index.tsx`, and pass `identity = { kind:
  "resolved", keyOf }` where `keyOf` maps a result to its binding's roster key
  (confirmed: `RepoBindingSuggestion.canvasUserId`; suggested: the single
  candidate; unbound: an own-repo key with `displayName` = the label, counted as
  one distinct unknown, never collapsed with a bound row). This touches the
  concurrency-sensitive worker and four more files.

### 5.3 Why the shape does NOT block on the fork (displacement discipline)

The `SubsetIdentity` seam (section 4.1) is the SAME under both branches; only the
value the repo surface passes differs (`unavailable` vs `resolved`). Layer A and
the four Canvas-family surfaces are identical either way and are not blocked. So
the terminating question to the owner is narrow: "ship the repo-grades subset
signal now (Y, more plumbing through the bulk-grade worker) or defer it as
disclosed-unavailable (X, repo-grades keeps only the existing trends)". Whatever
the answer, the wave for layer A + the Canvas surfaces proceeds; the answer
picks the repo surface's one-line resolver value and either schedules Y or leaves
R3 as a residual. I record X as my recommended reading; it is not an owner ruling.

---

## 6. `owns` file list, derived by command (output pasted)

Command A - test files that read the edited modules AS SOURCE TEXT (these can go
RED on a correct change; `grep -rln "class-trends\|ClassTrends\|classTrends" src
--include="*.test.ts"`, filtered to the ones whose `readFileSync`/import actually
targets an edited module):

```
src/app/components/drafted-grades/classTrends.wiring.test.ts        (the .student ban :128-130; adds the new leaf's wiring)
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts (add the new leaf as canary-3 root :207-233)
src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts
src/app/components/drafted-grades/classTrendsDraftState.test.ts
src/app/components/grading-recording/classTrendsRunCohort.test.ts
src/app/components/grading-results/classTrendsEntry.test.ts
src/app/components/repo-grades/classTrendsFolderEntry.test.ts
src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts
src/app/components/snapshot-grading/classTrendsSnapshotEntry.test.ts
src/lib/grade/class-trends.test.ts
src/lib/grade/class-trends-draft.test.ts
```

Command B - value/type importers, `grep -rln 'from "@/lib/grade/class-trends"\|
from "./class-trends"\|from "@/lib/grade/class-trends-draft"\|ClassTrendsPanel\|
classTrendsFolderEntry\|classTrendsEntry\|classTrendsRunCohort' src --include=*.ts
--include=*.tsx | grep -v .test.ts` (non-test importers; the ones the design
edits or that mount the panel):

```
src/app/components/DraftedGradesTab.tsx                 (mount surface; no edit if default identity used)
src/app/components/GradingResults.tsx                   (mount surface; no edit)
src/app/components/drafted-grades/ClassTrendsPanel.tsx  (EDIT: identity prop, mount new leaf)
src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx
src/app/components/drafted-grades/classTrendsDraftState.ts
src/app/components/grading-recording/GradingRecordingPanel.tsx     (mount surface; no edit)
src/app/components/grading-recording/classTrendsRunCohort.ts
src/app/components/grading-results/classTrendsEntry.ts
src/app/components/repo-grades/classTrendsFolderEntry.ts (EDIT under X: pass {kind:"unavailable"})
src/app/components/repo-grades/index.tsx                 (EDIT under X: repo mount :856 passes identity={kind:"unavailable"})
src/app/components/repo-grades/useRepoGradesGradingActions.ts        (EDIT only under Y)
src/app/components/snapshot-grading/SnapshotGradingPanel.tsx         (mount surface; no edit)
src/app/components/snapshot-grading/classTrendsSnapshotEntry.ts
src/lib/grade/class-trends-draft.ts   (EDIT: numbers-only subset clause)
src/lib/grade/class-trends-insight.ts (no edit; layer B untouched, AC-10)
```

### Files the design EDITS (shipping shape, option X)

1. `src/lib/grade/class-trends.ts` (355 -> ~+55..75): `SubsetIdentity`,
   `SUBSET_MIN_STUDENTS`, `AreaTrend.missedSubset`, `ClassTrendsReport.instructorAttribution`,
   `AreaAttribution`, `isSubsetTrend`, identity threading in the accumulation
   loop. Lands near ~420-430 lines - well under the 1000-line ceiling.
2. `src/lib/grade/class-trends-draft.ts` (178 -> ~+25..40): the numbers-only,
   non-`areaFullyCovered` subset clause renderer. ~215 lines.
3. `src/app/components/drafted-grades/ClassTrendsPanel.tsx` (212 -> ~+10..20):
   optional `identity` prop (default `{kind:"per-result"}`) into
   `computeClassTrends`; mount `ClassTrendsStudentListPanel`. ~230 lines.
4. `src/app/components/drafted-grades/ClassTrendsStudentListPanel.tsx` (NEW,
   ~70..110): instructor-facing per-area named list from
   `report.instructorAttribution`.
5. `src/app/components/repo-grades/classTrendsFolderEntry.ts` (113 -> ~+10):
   under X, expose the `{kind:"unavailable", reason}` identity the repo mount
   passes; under Y this file (plus `useRepoGradesBulkGrade.ts`,
   `useRepoGradesGradingActions.ts`, `index.tsx`) grows to build the resolver.
6. `src/app/components/repo-grades/index.tsx` (930 -> ~+1..3, `wc -l` basis):
   the repo mount at `:856` (`<ClassTrendsPanel entry={trendsEntry} defaultExpanded />`)
   must PASS `identity={{kind:"unavailable", reason}}` (sourced from
   `classTrendsFolderEntry.ts`). REQUIRED under X - without it the panel falls
   back to the default `{kind:"per-result"}` identity and computes `missedSubset`
   over distinct `GradeResult.student` = distinct repo labels, which is exactly
   the AC-1/AC-7 violation option X exists to prevent, shipping WRONG with every
   structural gate green (no gate checks identity basis on a real repo run, and
   vitest renders nothing). Round-1 check B1. Stays far under the 1000 ceiling.

No edited file approaches the 1000-line ceiling. `class-trends.ts` at ~430 is the
largest and has ~570 lines of headroom (`@(Get-Content).Count` basis above).

### Tests the design REQUIRES (author: test-author -> implementer)

- Add `ClassTrendsStudentListPanel.tsx` as an eighth canary-3 root in
  `classTrendsDraft.not-postable.test.ts` (`:207-233`). Direction: RED if the new
  leaf reaches `app/actions`/`lib/canvas`/`lib/lms-generation`/`lib/llm`/
  `lib/gemini` (`FORBIDDEN_PATH_PREFIXES`, `:58`).
- `classTrends.wiring.test.ts`: keep `:128-130` (`.student` ban on the panel);
  ADD a wiring assertion that the panel mounts `ClassTrendsStudentListPanel` and
  passes `instructorAttribution`, and that the new leaf reads no forbidden
  posting/model import (covered by the not-postable root).

---

## 7. Gates and instruments this design introduces (object / instrument / direction)

Any instrument naming two or more test files is spelled
`npm run test:paths <p1> <p2> ...` (never a raw multi-path `vitest`; MEMORY
"Multi-path runs use test:paths").

- G1 (AC-8, name never reaches class text). Object: the markdown returned by
  `composeClassTrendsDraft` for a run seeded with distinctive names/ids, versus
  the set of `student`/`userId`/`canvasUserId` in the run. Instrument (test-author
  owns the oracle): a unit test over `class-trends-draft.ts`, run via
  `npm run test:paths src/lib/grade/class-trends-draft.test.ts`. Direction: RED
  if any seeded identifier appears in the markdown, OR if `composeClassTrendsDraft`
  reads `report.instructorAttribution`.
- G2 (AC-9, list == count set). Object: `instructorAttribution[area].students`
  membership and length, versus `AreaTrend.missedSubset.studentCount` and the
  distinct-key set layer A counted. Instrument:
  `npm run test:paths src/lib/grade/class-trends.test.ts`. Direction: RED if a
  named student is not in the counted set, or lengths differ.
- G3 (AC-1/AC-2 identity basis). Object: `studentCount` for an area under a
  `resolved` identity where two results share a key, versus the deduped count.
  Instrument: same layer-A unit test. Direction: RED if two results with one key
  count as two, or a 3-distinct-student area at class size 4 or 30 fails to flag,
  or a 2-student area flags.
- G4 (AC-6/AC-7 clause honesty). Object: presence of the subset clause when
  `resultsWithArea < totalResults`, and the denominator it prints. Instrument:
  `npm run test:paths src/lib/grade/class-trends-draft.test.ts`. Direction: RED
  if the subset clause is suppressed by `areaFullyCovered`, or prints
  `totalResults` (or any number other than `missedSubset.denominator`), or pairs
  a student numerator with a non-student denominator.
- G5 (AC-10 no model on the new leaf). Object: the transitive value-import set of
  the eight canary-3 roots. Instrument:
  `npm run test:paths src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts`.
  Direction: RED if any root reaches a forbidden prefix (`:58`).
- G6 (AC-12 reachability across surfaces). Object: whether the subset/named-list
  capability is mounted on the surfaces, versus existing only in `src/lib/grade`.
  Instrument: the `classTrends*.wiring.test.ts` family, run via
  `npm run test:paths src/app/components/drafted-grades/classTrends.wiring.test.ts src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts`.
  Direction: RED if the named list exists in `src/lib/grade` but no surface
  renders it. This is a source-text (import + mount) claim only; nothing renders
  a component here, so OV-1/OV-2 remain owner walks.

---

## 8. Reuse survey (what the build reuses, not rebuilds)

- The two-renderer construction (counted layer A + inferred layer B), kept whole:
  `computeClassTrends`/`AreaTrend`/`ClassTrendsReport` (`class-trends.ts:124-355`)
  is extended, not replaced; `class-trends-insight.ts` (270 lines) is NOT touched
  (AC-10 - layer B stays model-only and the subset is counted, not inferred).
- `parseScoreValue`/`ParsedScore` (`class-trends.ts:60-106`): the subset count is
  written in its terms (AC-4), reused, not re-parsed.
- `containsForbiddenCompletenessPhrase` + `FORBIDDEN_COMPLETENESS_PHRASES`
  (`class-trends.ts:27-40`): the class subset clause reuses the existing phrase
  check; the last-resort markdown check at `class-trends-draft.ts:170` already
  guards the assembled draft.
- `composeClassTrendsDraft` + `areaFullyCovered` + `renderCountedClause`
  (`class-trends-draft.ts:65-178`): the subset clause is ADDED beside
  `renderCountedClause`; `areaFullyCovered`'s existing use on high/low is
  unchanged (AC-3), and the subset path deliberately bypasses it (AC-6).
- The anonymiser `anonymizeGradeResults` (`class-trends-insight.ts:59-69`): the
  ONLY `.student` reader on the model path; untouched. The instructor named list
  is a SEPARATE, counted path that never feeds the model.
- `hasTrendableResults`/`toClassTrendsEntry` (`classTrendsFolderEntry.ts:30,90-96`)
  and the four run-cohort leaves: reused as-is; the default identity means no
  change to the Canvas-family leaves.
- `RepoBindingSuggestion`/`suggestRepoStudentBindings`
  (`repo-student-bindings.ts:47-88,282-289`) and `RepoGradeRow.binding`
  (`repoGradesRows.ts:119`): the roster source option Y (R3) reuses, not rebuilds.
- The panel-mount + wiring precedent (`classTrends.wiring.test.ts`,
  `classTrendsDraft.not-postable.test.ts`): extended with one new leaf root and
  one new mount assertion.

---

## 9. Leverage (the AC's claim, re-checked against this shape)

The AC's leverage claim (GUARANTEED / compounding ATTRIBUTION; removal criterion
AC-8) is PRESERVED by this shape, and I make no new claim:

- Counted, not generated: the subset count and the named list are arithmetic and
  string assembly over parsed `ParsedScore` values and identity keys in layer A;
  no model call is added (AC-10), and the new leaf becomes a canary-3 root so a
  reintroduced model import goes RED.
- Name/class split enforced by TYPE: numbers live on `AreaTrend.missedSubset`
  (read by the class composer), names live on `ClassTrendsReport.instructorAttribution`
  (read only by the instructor leaf), and the class composer's iteration domain
  (`report.areas`) structurally cannot reach a name. AC-8 is the removal
  criterion; G1 is its instrument.

---

## 10. Residual register (owner + instrument + step; each owed a backlog entry)

A residual not in `docs/BACKLOG.md` does not exist (`iteration-caps.md`
anti-gaming); these are handed to the orchestrator to record under N13b.

- R1 (from the AC, DISCHARGED by this pass into a build task). Owner: implementer
  + test-author. Instrument: `classTrends.wiring.test.ts:128-130` (kept),
  `classTrendsDraft.not-postable.test.ts:207-233` (add the new leaf root),
  G1/G2 (section 7). Step: build the new instructor leaf and the numbers/names
  type split; the panel `.student` ban is NOT loosened.
- R2 (from the AC, unchanged). Owner: repo owner. Instrument: AC-4/AC-5
  recommendations. Step: one batched non-gating question at scope hand-off; a
  "yes" applies Decision 3 (no raw-number conversion; UNKNOWN excluded and
  disclosed). The shape proceeds regardless.
- R3 - the repo-surface roster identity channel (the fork of section 5). Owner:
  architect (this pass fixed the SEAM: `SubsetIdentity`) + implementer (the
  channel, option Y). Instrument: `github-repos.ts:619` and `:602-624`
  (`student` is the repo label; `gradedRepo` unset on this path),
  `useRepoGradesBulkGrade.ts:401` (repo full name discarded at
  `runResults.push`), `repoGradesRows.ts:119` + `repo-student-bindings.ts:47-88`
  (the binding), G3/G4 under a `resolved` identity. Step: the OWNER answers the
  X/Y fork (terminating question); under Y, capture repo full name per result and
  build `keyOf` from bindings; under X, the repo mount passes `{kind:"unavailable",
  reason}` and R3 stays open as the follow-up. Layer A + the four Canvas surfaces
  ship either way.
- R4 (from the AC, confirmation + one addition). Owner: test-author. Instrument:
  `classTrendsDraft.not-postable.test.ts` (`FORBIDDEN_PATH_PREFIXES` at `:58`,
  canary 3 at `:207-233`) and the sabotage check `docs/loop/leverage.md:160-167`
  describes. Step: confirm the guard still bans `lib/llm`/`lib/gemini` and CAN
  fail, AND add `ClassTrendsStudentListPanel.tsx` as the eighth root before it
  ships.

---

## 11. What this pass could NOT determine (stated plainly)

- Nothing renders a component under vitest here (`docs/loop/this-repo.md` section
  6; MEMORY headless-count / "no component is ever rendered"). So every claim
  about the instructor list being VISIBLE, legible and distinct from the class
  draft is a reading claim - it is OV-2, an owner walk, not machine-checkable. G6
  proves the import and mount exist, never the pixels.
- Whether the owner wants the repo-grades subset now (Y) or deferred (X) is the
  section-5 fork; I recommend X and do not decide it. The shape does not block on
  it.
- The exact class-clause prose and the instructor list's layout are UX +
  test-author's; this pass fixes the TYPES they render from
  (`missedSubset`/`instructorAttribution`) and the honesty gates (G1, G4), not
  the wording.
