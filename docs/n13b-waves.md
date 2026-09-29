# N13b wave plan (round 1)

Item: `N13b` (`docs/backlog.yml:199-210`, the `- id: 'N13b'` line at `:199`,
`grep -n "id: 'N13b'" docs/backlog.yml`). Area:
grading-run-survival-and-disclosure. Seat: `loop-plan`. This pass decides the
CUT into waves, each wave's write set, the order they land, and the gate for
each - no production code, no test code. A fresh `loop-checker` reads this
before any implementer is dispatched.

Consumes the four settled, checked artifacts (all read in full this pass, not
re-derived): `docs/n13b-acceptance-criteria.md` (AC-1..AC-12, R1-R4, OV-1/OV-2),
`docs/n13b-architecture.md` (the `SubsetIdentity` seam, the numbers/names
type-split, `SUBSET_MIN_STUDENTS=3`, option-X edit set incl. the B1 repo-mount
fix), `docs/n13b-security.md` (L5/L6/L7/L8 leak paths, the whole-Markdown
name-filter, the R5 Wave-1 orchestrator ruling), `docs/n13b-ux.md` (two
distinctly-labeled Copy buttons, the instructor-list sub-section, the three-way
empty state, the R-UX-5 rename).

Every quantity below names the command that produced it. Every `file:line` was
opened this pass before it was cited.

---

## 0. What I measured, and with which command

Line counts, run in PowerShell `@(Get-Content <f>).Count` AND Git-Bash
`wc -l < <f>` (the repo mandates `@(Get-Content).Count`; I ran both because the
two tools disagree by up to 138 elsewhere in this repo - here they AGREE on
every file, so neither number is in doubt):

| File | `@(Get-Content).Count` | `wc -l` |
|---|---|---|
| `src/lib/grade/class-trends.ts` | 355 | 355 |
| `src/lib/grade/class-trends-draft.ts` | 178 | 178 |
| `src/lib/grade/class-trends-insight.ts` | 270 | 270 |
| `src/app/components/drafted-grades/ClassTrendsPanel.tsx` | 212 | 212 |
| `src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx` | 117 | 117 |
| `src/app/components/drafted-grades/classTrendsDraftState.ts` | 58 | 58 |
| `src/app/components/repo-grades/index.tsx` | 930 | 930 |
| `src/app/components/repo-grades/classTrendsFolderEntry.ts` | 113 | 113 |
| `src/app/components/grading-recording/classTrendsRunCohort.ts` | 181 | 181 |
| `src/app/components/grading-results/classTrendsEntry.ts` | 54 | 54 |
| `src/app/components/snapshot-grading/classTrendsSnapshotEntry.ts` | 73 | 73 |

Structural citations confirmed by opening this pass:

- `composeClassTrendsDraft(report, observations, assignmentName)` -
  `class-trends-draft.ts:118-122` (three params, no run identifiers reach it
  today). Opening line interpolates `assignmentName` at `:136` (L8); counted
  clauses read `area.displayArea` via `renderCountedClause` `:80-89` (L7);
  inferred clauses read `observation.concept`/`.reading` via
  `renderInferredClause` `:104-116` (L5/L6). Its only caller (non-test) is
  `ClassTrendsDraftPanel.tsx:46` (`grep -rn composeClassTrendsDraft src
  --include=*.ts --include=*.tsx | grep -v .test.ts`); test callers are
  `class-trends-draft.test.ts` and `classTrendsDraft.wiring.test.ts`.
- `ClassTrendsDraftPanel` receives props `{report, observations,
  assignmentName}` (`ClassTrendsDraftPanel.tsx:31-39`) - it has NO access to
  `entry.run.results` and so cannot see any `.student` value.
- `ClassTrendsPanel` computes `report = computeClassTrends(entry)`
  (`ClassTrendsPanel.tsx:91`), passes `report`/`observations`/`entry.assignmentName`
  to the draft panel (`:203-207`), and reads NO `.student` (confirmed:
  `grep -n "\.student" ClassTrendsPanel.tsx` returns nothing).
- The `.student` ban: `classTrends.wiring.test.ts:128-129`,
  `expect(strippedPanel).not.toMatch(/\.student\b/)` over
  `ClassTrendsPanel.tsx` source. Confirmed by opening.
- `class-trends.ts` reads NO `.student` today
  (`grep -n "\.student\b" src/lib/grade/class-trends.ts` -> empty). So the
  identity work (Wave 1's identifier collection and Wave 2's attribution) is the
  FIRST `.student` read in that module.
- The one source-text test that reads `class-trends.ts` AND bans field reads:
  `classTrendsRunCohort.test.ts:314-334` reads `class-trends.ts`,
  `class-trends-insight.ts`, `class-trends-draft.ts` source and asserts
  `.overallComment` matches (canary) but `.strengths`/`.improvements`/
  `.feedback`/`.sourceIndex` do NOT. It does NOT ban `.student`,
  `.gradedRepo` or `.gradedRef`. So Wave 1/2 reading identity fields keeps it
  green - but it is a source-text reader and is in both waves' sets.
- The not-postable canary-3 roots are SEVEN files
  (`classTrendsDraft.not-postable.test.ts`, roots array opened at
  `:214-233 (roots literal)`): `class-trends-draft.ts`, `classTrendsDraftState.ts`,
  `ClassTrendsDraftPanel.tsx`, `ClassTrendsPanel.tsx`, `classTrendsEntry.ts`,
  `classTrendsRunCohort.ts`, `classTrendsFolderEntry.ts`.
  `FORBIDDEN_PATH_PREFIXES` at `:58` = `["app/actions", "lib/canvas",
  "lib/lms-generation", "lib/llm", "lib/gemini"]` (5 entries).
- The five `<ClassTrendsPanel` mounts
  (`grep -rln '<ClassTrendsPanel' src/app --include=*.tsx`): `DraftedGradesTab.tsx`,
  `grading-recording/GradingRecordingPanel.tsx`, `GradingResults.tsx`,
  `repo-grades/index.tsx`, `snapshot-grading/SnapshotGradingPanel.tsx`. The repo
  mount is `repo-grades/index.tsx:856`:
  `<ClassTrendsPanel entry={trendsEntry} defaultExpanded />`
  (`grep -n '<ClassTrendsPanel' src/app/components/repo-grades/index.tsx`).
- Wave-3 (option Y) collector: `useRepoGradesBulkGrade.ts:401`,
  `runResults.push(...result.run.results)`
  (`grep -n "runResults.push" src/app/components/repo-grades/useRepoGradesBulkGrade.ts`).

---

## 1. The cut in one paragraph

Three waves, all STRICTLY SEQUENTIAL because each shares at least one edited
file with the one before it (proven in section 4). Wave 1 is the standalone
security name-filter (the R5 orchestrator ruling): it closes a LIVE, pre-existing
class-text leak and ships even if everything after it is deferred. Wave 2 is the
subset-count + named-list feature on the four Canvas-family surfaces under
option X, including the B1 repo-mount disclosure fix. Wave 3 is the option-Y repo
roster-identity channel - OWNER-GATED and additive: it ships only if the owner
picks Y, and it blocks nothing. No two waves in this item run concurrently, and
that is not a lost opportunity - the file overlaps forbid it.

---

## 2. Wave table

### Wave 1 - the security name-filter (pre-existing leak; lands FIRST, INDEPENDENT)

**Delivers:** AC-8 for the pre-existing free-text leak (L5 model insight, L6
model output, L7 rubric-area name, L8 assignment name); `n13b-security.md`'s R5
Wave-1 ruling. It is gated ONLY on its own AC-8 oracle, NOT on any later N13b
stage.

**Runtime write set (derived; command in section 4):**

- `src/lib/grade/class-trends.ts` - add scan-only field
  `ClassTrendsReport.knownIdentifiers: readonly string[]`, populated in
  `computeClassTrends` by collecting the run's OWN identifier strings:
  `result.student` for every graded result (on the repo surface this is the
  repo label, closing L4), plus the owner/label segment of
  `gradedRepo`/`gradedRef` where present (L3). This is the first `.student`
  read in this module (measured empty today) and is not banned by any test
  (section 0).
- `src/lib/grade/class-trends-draft.ts` - `composeClassTrendsDraft` scans the
  WHOLE assembled Markdown (the opening line L8 + counted clauses L7 + inferred
  clauses L5/L6) against `report.knownIdentifiers`; a clause carrying any
  identifier is dropped, or the draft is rejected. Pure function, no new import
  (AC-10 stays green). The exact drop-vs-reject choice is the test-author's
  oracle + implementer's; this plan fixes the write set and the wiring, not the
  branch.

**MECHANISM RULING (in-lane for this seat because it decides the WRITE SET and
the disjointness, and the security R5 ruling post-dates the architect pass, so
no earlier seat placed the identifier set):** the run identifiers ride on
`ClassTrendsReport` (a scan-only denylist field), NOT as a new
`composeClassTrendsDraft` parameter and NOT derived in either panel. Reason: the
filter needs the run's `.student` strings; the ONLY place that both holds the
results and may legally read `.student` is layer A (`class-trends.ts`), because
`ClassTrendsDraftPanel` never receives the results and `ClassTrendsPanel` is
under the `.student` ban (`classTrends.wiring.test.ts:128-129`). Threading a new
parameter would force one of those two panels to source the identifiers, and the
panel path trips the ban. Carrying the set on the report keeps `composeClassTrendsDraft`'s
signature unchanged, touches NEITHER panel, and leaves the ban green.
`knownIdentifiers` is scanned against, never interpolated into the Markdown, so
it does not weaken the architect's type-separation invariant (that names never
reach the class composer's RENDER domain) - it is a filter input, not render
content.

**Test write set:**

- `src/lib/grade/class-trends-draft.test.ts` (existing file; ADD the AC-8
  oracle - seed a distinctive marker into `assignmentName`, into a
  `displayArea`, and into a
  hand-built `ClassTrendsInsightObservation.concept`/`.reading`; assert none
  reaches the returned Markdown; proven RED against pre-filter code per the
  test seat's reference-implementation discipline, then GREEN after).
- `src/lib/grade/class-trends.test.ts` (assert `knownIdentifiers` collects the
  run's identifiers, incl. a repo-label `.student` and a `gradedRepo` segment).

**Source-text readers in the set (expected unedited; must stay green):**
`src/app/components/drafted-grades/classTrends.wiring.test.ts` (reads
`class-trends.ts` source; keeps the exports; panel `.student` ban untouched
because the panel is not edited),
`src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts`
(canary-3 root `class-trends-draft.ts`; Wave 1 adds no forbidden import),
`src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts` (reads
`class-trends-draft.ts` source),
`src/app/components/grading-recording/classTrendsRunCohort.test.ts` (reads
`class-trends.ts` + `class-trends-draft.ts` source and bans
`.strengths`/`.improvements`/`.feedback`/`.sourceIndex` - Wave 1 introduces
none).

**Exports and callers:** no NEW export with an external caller. The new field
`knownIdentifiers` is consumed by `composeClassTrendsDraft` in the SAME write
set. `computeClassTrends`' caller (`ClassTrendsPanel`) is unchanged - adding a
field to a returned type does not change its signature. `composeClassTrendsDraft`'s
caller (`ClassTrendsDraftPanel`) is unchanged - signature unchanged under the
mechanism ruling. **Independently gateable: YES.**

**File-size flag:** none. `class-trends.ts` 355 and `class-trends-draft.ts` 178
gain a small filter each; both stay far under 1000.

---

### Wave 2 - subset count + named list, Canvas family, option X (feature core)

**OBLIGATION (round-1 wave-plan check INFO-2), do not let the implementer miss it:**
`knownIdentifiers` (added in Wave 1) MUST stay populated and scanned even when
this wave's `SubsetIdentity.kind === "unavailable"` (the repo surface under
option X). Under `unavailable`, `missedSubset` and `instructorAttribution` are
suppressed - but the class-addressed DRAFT still renders (existing high/low +
inferred clauses) and still needs the name-filter. An implementer who gates
`knownIdentifiers` behind `identity.kind !== "unavailable"` by analogy with
`instructorAttribution` would ship the repo-surface draft with NO name filter,
silently re-opening leak paths L5/L6 (no render, no gate on a real repo run).
R7's repo-shaped AC-8 oracle must exercise the unavailable-identity draft path.


**Delivers:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-9, AC-10, AC-11
(Canvas surfaces), AC-12; the instructor named-list UX (`n13b-ux.md` sections
3-6); the two distinct Copy labels; the three-way empty state; the option-X
repo-mount disclosure (B1). Depends on Wave 1 (shares `class-trends.ts` +
`class-trends-draft.ts`).

**Runtime write set:**

- `src/lib/grade/class-trends.ts` - `SubsetIdentity` type,
  `SUBSET_MIN_STUDENTS = 3`, `AreaTrend.missedSubset`,
  `ClassTrendsReport.instructorAttribution: AreaAttribution[]`, `AreaAttribution`,
  `isSubsetTrend`, identity threading in the accumulation loop; `computeClassTrends`
  gains an optional 2nd arg `identity: SubsetIdentity = { kind: "per-result" }`.
- `src/lib/grade/class-trends-draft.ts` - the numbers-only subset-clause
  renderer reading `AreaTrend.missedSubset`, stating its OWN denominator
  (`missedSubset.denominator`, AC-7) and bypassing `areaFullyCovered` (AC-6);
  the pre-existing high/low `.filter(areaFullyCovered)` at `:144` is unchanged
  (AC-3).
- `src/app/components/drafted-grades/ClassTrendsPanel.tsx` - optional `identity`
  prop (default `{kind:"per-result"}`) into `computeClassTrends`; mount
  `ClassTrendsStudentListPanel` and pass `report.instructorAttribution`. Panel
  STILL reads no `.student` (the ban stays green - `instructorAttribution` is a
  report field).
- `src/app/components/drafted-grades/ClassTrendsStudentListPanel.tsx` (NEW,
  ~70-110 lines per architect) - instructor-facing per-area named list from
  `report.instructorAttribution`, with the "Copy student list" button.
- `src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx` - R-UX-5: rename
  the existing "Copy" button (`:101`) to "Copy class announcement", shipped in
  the SAME wave as the new "Copy student list" button so the two labels never
  coexist as "Copy".
- `src/app/components/repo-grades/classTrendsFolderEntry.ts` - expose the
  `{kind:"unavailable", reason}` identity the repo mount passes.
- `src/app/components/repo-grades/index.tsx` - the repo mount at `:856` PASSES
  `identity={{kind:"unavailable", reason}}` (B1). Required under X, or the panel
  falls back to `per-result` and computes `missedSubset` over distinct repo
  labels - the AC-1/AC-7 violation shipping WRONG with every structural gate
  green.

**Canvas-family mounts and leaves need NO edit** and are NOT in the write set:
`DraftedGradesTab.tsx`, `GradingResults.tsx`, `GradingRecordingPanel.tsx`,
`SnapshotGradingPanel.tsx`, and the leaves `classTrendsEntry.ts`,
`classTrendsRunCohort.ts`, `classTrendsSnapshotEntry.ts`. They call
`ClassTrendsPanel` with the argument omitted, so the default `per-result`
identity keeps them correct (architect section 4.1). AC-12 reachability at those
surfaces is delivered for free by the single `ClassTrendsPanel` change; G6
proves import + mount; the pixels are OV-1/OV-2 owner walks.

**Test write set:**

- `src/lib/grade/class-trends.test.ts` (subset count AC-1..AC-5; `instructorAttribution`
  equals the counted set AC-9; identity basis AC-1/AC-2 under `resolved`).
- `src/lib/grade/class-trends-draft.test.ts` (subset clause AC-6 not gated on
  coverage; AC-7 own denominator).
- `src/app/components/drafted-grades/classTrends.wiring.test.ts` (KEEP the
  `.student` ban `:128-130`; ADD: the panel mounts `ClassTrendsStudentListPanel`
  and passes `instructorAttribution`).
- `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` (ADD
  `ClassTrendsStudentListPanel.tsx` as the EIGHTH canary-3 root; RED if the new
  leaf reaches any `FORBIDDEN_PATH_PREFIXES` entry).
- `src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts` (any Copy
  label assertion updated with the rename - R-UX-5).
- `src/app/components/repo-grades/classTrendsFolderEntry.test.ts` (repo cohort
  exposes the `unavailable` identity).
- `src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts` (the repo
  surface passes the `unavailable` identity into the panel).

**Source-text readers in the set (must stay green):**
`classTrendsRunCohort.test.ts` (the `class-trends.ts` field bans),
`grading-recording/GradingRecordingPanel.wiring.test.ts` (mount unchanged),
`snapshot-grading/snapshot-grading.structure.test.ts`, and any repo-grades
wiring test that `readFileSync`s `index.tsx` or `classTrendsFolderEntry.ts`
source. The implementer re-derives this reader set at the wave gate (treat this
list as a FLOOR, per the N13 disposal ruling: run the grep, open every hit).

**Exports and callers (every new export's caller is in the set):**
`ClassTrendsStudentListPanel` - caller `ClassTrendsPanel` (in set); `SubsetIdentity`
+ `computeClassTrends` 2nd arg - callers `ClassTrendsPanel` (default, in set) and
`repo-grades/index.tsx` (passes `unavailable`, in set); `AreaTrend.missedSubset`
- consumed by the subset renderer in `class-trends-draft.ts` (in set) and the
named-list leaf; `instructorAttribution` - consumed by
`ClassTrendsStudentListPanel` (in set). **Independently gateable: YES.**

**Why the feature is ONE wave, not split:** splitting layer-A/layer-C from the
surface would ship `instructorAttribution` with no reader - dead code with a
green gate, the exact failure the caller rule forbids. The named list's consumer
(the new leaf), the panel that mounts it, and the numbers-only clause's consumer
(`composeClassTrendsDraft`, caller present) all depend on the same
`class-trends.ts` identity threading, so any split would re-edit `class-trends.ts`
in a second wave for no independent gate. Kept whole.

**File-size flag (measure at gate with `@(Get-Content).Count`):**
`repo-grades/index.tsx` is 930 today; +1-3 lines lands it near ~933 - the
CLOSEST edited file to the 1000 ceiling in this item. Still under, but it is the
one to re-measure at the gate. `class-trends.ts` after Waves 1+2 lands ~445
(355 + Wave-1 filter + ~55-75 feature), `class-trends-draft.ts` ~230-250,
`ClassTrendsPanel.tsx` ~230, the new leaf ~70-110 - all far under 1000.

---

### Wave 3 - option Y repo roster-identity channel (OWNER-GATED, additive, NON-BLOCKING)

**Delivers, only if the owner answers Y to the X/Y fork:** AC-11 on the repo
surface (attribution shows the bound roster student), the AC-1/AC-7 identity
basis on the repo path (two repos from one roster student count once; unbound
repos handled explicitly), R3/R7. **Blocks nothing.** Under X this wave never
ships and R3 stays a recorded residual; under Y it is ADDED after Wave 2. The
`SubsetIdentity` seam is identical either way - only the one value the repo mount
passes changes (`unavailable` becomes `resolved`).

**Runtime write set (a FLOOR; the implementer re-derives at dispatch if Y is
chosen):**

- `src/app/components/repo-grades/useRepoGradesBulkGrade.ts` - capture the repo
  full name per result at the collector (`:401`, `runResults.push(...)`).
- `src/app/components/repo-grades/classTrendsFolderEntry.ts` - carry a per-result
  repo id and a `{repoFullName -> RepoBindingSuggestion}` map through
  `RepoRunCohort`. (Also edited by Wave 2 - see the section-4 overlap.)
- `src/app/components/repo-grades/useRepoGradesGradingActions.ts` - thread the map.
- `src/app/components/repo-grades/index.tsx` - repo mount passes
  `identity={{kind:"resolved", keyOf}}`. (Also edited by Wave 2.)

**Test write set (FLOOR):** `repoGradesClassTrends.wiring.test.ts`,
`classTrendsFolderEntry.test.ts`, `useRepoGradesBulkGrade.test.ts`,
`useRepoGradesBulkGrade.lifecycle.test.ts`, `repoGradesBulkGrade.test.ts`.

**Concurrency and cost note:** this wave touches the CONCURRENCY-SENSITIVE bulk
worker (`useRepoGradesBulkGrade.ts`), which is why it is isolated as its own
owner-gated wave rather than folded into Wave 2. **Independently gateable: YES**
(its exported resolver is called at the repo mount, in the set).

**File-size flag:** none of these four is near 1000 (`index.tsx` re-measured at
the gate as under Wave 2's flag; the others are well under).

---

## 3. Ordering: what is strictly ordered, what may run concurrently

- **Wave 1 -> Wave 2 -> Wave 3, strictly ordered.** Each shares an edited file
  with the wave before it (section 4), so none may run concurrently with its
  predecessor.
- **Nothing in this item runs concurrently.** This is not idle sequencing: it
  is forced by the file overlaps. Standing consent for concurrent disjoint work
  does not apply here because there is no disjoint pair.
- **Wave 3 is additionally gated on an OWNER DECISION** (the X/Y fork), not only
  on Wave 2 landing. Under X it is never dispatched.

Why the ordering is necessary, per wave:

- **Wave 1 first** because the R5 ruling mandates it lands FIRST and INDEPENDENTLY
  (it closes a live pre-existing leak and must ship even if the feature defers),
  and because it and Wave 2 both edit `class-trends.ts` and `class-trends-draft.ts`
  - the correctness rule (independent shippable security fix) and the sequencing
  are aligned, not in tension.
- **Wave 2 after Wave 1** because it re-edits the two files Wave 1 touched and
  must be briefed against Wave 1's landed content (the `knownIdentifiers` field
  and the name-scan already present).
- **Wave 3 after Wave 2** because it re-edits `classTrendsFolderEntry.ts` and
  `repo-grades/index.tsx`, rewriting the one-line identity value from
  `unavailable` to `resolved`.

This is the `parallel-disjointness.md` RULING-96 pattern: where a concurrency
consideration and a correctness/caller consideration meet, correctness wins and
disjointness is satisfied by SEQUENCING, with the overlap PRINTED (below) and
the waves marked MUST NOT RUN CONCURRENTLY.

---

## 4. Disjointness computation, both senses (pasted)

### 4.1 Same-path (sense 1)

Runtime write sets:

```
W1 = { src/lib/grade/class-trends.ts,
       src/lib/grade/class-trends-draft.ts }

W2 = { src/lib/grade/class-trends.ts,
       src/lib/grade/class-trends-draft.ts,
       src/app/components/drafted-grades/ClassTrendsPanel.tsx,
       src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx,
       src/app/components/drafted-grades/ClassTrendsStudentListPanel.tsx,   (new)
       src/app/components/repo-grades/classTrendsFolderEntry.ts,
       src/app/components/repo-grades/index.tsx }

W3 = { src/app/components/repo-grades/useRepoGradesBulkGrade.ts,
       src/app/components/repo-grades/classTrendsFolderEntry.ts,
       src/app/components/repo-grades/useRepoGradesGradingActions.ts,
       src/app/components/repo-grades/index.tsx }
```

Intersections (concatenate each pair, `sort | uniq -d`; runtime + the shared
test files):

```
W1 INTERSECT W2 (runtime):
  src/lib/grade/class-trends-draft.ts
  src/lib/grade/class-trends.ts
W1 INTERSECT W2 (tests):
  src/lib/grade/class-trends-draft.test.ts
  src/lib/grade/class-trends.test.ts
  src/app/components/drafted-grades/classTrends.wiring.test.ts
  src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
  src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts
  src/app/components/grading-recording/classTrendsRunCohort.test.ts
  -> NON-EMPTY. W1 and W2 MUST NOT RUN CONCURRENTLY. Sequence W1 then W2.

W2 INTERSECT W3 (runtime):
  src/app/components/repo-grades/classTrendsFolderEntry.ts
  src/app/components/repo-grades/index.tsx
W2 INTERSECT W3 (tests):
  src/app/components/repo-grades/classTrendsFolderEntry.test.ts
  src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts
  -> NON-EMPTY. W2 and W3 MUST NOT RUN CONCURRENTLY. Sequence W2 then W3.

W1 INTERSECT W3 (runtime): {}  (empty)
  -> No runtime overlap, but W3 follows W2 which follows W1, so they are never
     concurrent regardless.
```

Empty output is the only "may run concurrently" pass; every adjacent pair here
is NON-EMPTY. The one empty pair (W1/W3) is still non-concurrent by transitive
ordering. **Conclusion: all three waves are strictly sequential; no concurrent
pair exists in this item.**

Search hygiene: the write-set greps in section 0 were each paired with a canary
- a symbol that must NOT hit (`composeClassTrendsZZZ` / `ClassTrendsNopePanel`,
returned empty) and one that MUST (`class-trends.test.ts` /
`class-trends-draft.test.ts`, both listed). `grep -E`/plain `grep` used
throughout; NO `grep -P` (broken here, exits 0 without checking).

### 4.2 Informational independence (sense 2)

Because all three waves are SEQUENCED and each later wave is re-briefed against
the prior wave's landed output, sense-2 coupling cannot cause the invisible
integration collision the card warns about (that failure is specific to
CONCURRENT waves designing against facts each other is changing). Stated
explicitly anyway, from each side's stated write set:

- **W1 establishes** `report.knownIdentifiers` (a scan-only denylist) and the
  whole-Markdown name-scan in `composeClassTrendsDraft`. **W2 designs against**
  `class-trends.ts` and `class-trends-draft.ts`. W2's new subset clause is
  numbers-only, so W1's name-scan (which runs over the WHOLE Markdown including
  W2's clause) is defense-in-depth on it, not a conflict. W2's
  `instructorAttribution` (names) sits on the report but is never rendered by
  the composer; W1's `knownIdentifiers` is scanned, never rendered - two report
  fields, different roles, compatible. W2 is briefed AFTER W1 lands, so it reads
  the real post-W1 module. No coupling that ordering does not resolve.
- **W2 establishes** the `SubsetIdentity` value the repo mount passes
  (`unavailable`). **W3 changes** it to `resolved`. W3 is sequenced after W2 and
  re-briefed. No coupling that ordering does not resolve.

---

## 5. Gates, per wave

Run from PowerShell. `git status --short` is checked against the wave's exact
write set (runtime + tests); ANY path outside the set is RED, and a
`.claude/worktrees/...` copy edited instead of the real tree is RED (require the
main-checkout `git status --short` as proof). `npx tsc --noEmit` has exactly ONE
caller per wave (it races on `tsconfig.tsbuildinfo`); it is the wave gate's, and
no sibling runs it. No two waves sabotage-verify on the tree at once (moot here -
the waves are sequential). No `git add -A`, no `git stash`; stage explicit paths.

### Wave 1 gate

1. `git status --short` == the Wave 1 write set exactly; no worktree copy.
2. `npx tsc --noEmit` -> no output, exit 0.
3. Multi-file test run (spelled with `test:paths`, never a raw multi-path
   vitest, which silently drops unmatched args):
   `npm run test:paths src/lib/grade/class-trends.test.ts src/lib/grade/class-trends-draft.test.ts src/app/components/drafted-grades/classTrends.wiring.test.ts src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts src/app/components/grading-recording/classTrendsRunCohort.test.ts`
   -> a `COVERED` line for EACH path, all tests passing.
4. The AC-8 oracle in `class-trends-draft.test.ts` was proven RED against
   pre-filter code (reference-implementation discipline) and is GREEN after.
5. `npm run lint` -> exit 0, no NEW warning in the two edited runtime files
   (measured against the same command before the change; do NOT pin an absolute
   count).
   A pass looks like: clean `git status` scoped to the set, empty tsc output,
   all `COVERED`+passing, the oracle green.

### Wave 2 gate

1. `git status --short` == the Wave 2 write set exactly; no worktree copy.
2. `npx tsc --noEmit` -> no output, exit 0.
3. `@(Get-Content src/app/components/repo-grades/index.tsx).Count` -> under 1000
   (re-measure; it is the item's closest-to-ceiling file).
4. `npm run test:paths src/lib/grade/class-trends.test.ts src/lib/grade/class-trends-draft.test.ts src/app/components/drafted-grades/classTrends.wiring.test.ts src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts src/app/components/repo-grades/classTrendsFolderEntry.test.ts src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts src/app/components/grading-recording/classTrendsRunCohort.test.ts`
   -> `COVERED` per path, all passing. This realises the architect's G1
   (name never in class text), G2 (list == count set), G3 (identity basis),
   G4 (clause honesty), G5 (no model on the new leaf, via the 8th
   not-postable root), and G6 (reachability across surfaces).
5. `npm run lint` -> exit 0, no NEW warning in the edited files.
   A pass looks like: clean scoped `git status`, empty tsc, `index.tsx` under
   1000, all `COVERED`+passing.

### Wave 3 gate (only if the owner picks Y)

1. `git status --short` == the (re-derived) Wave 3 write set exactly; no worktree
   copy.
2. `npx tsc --noEmit` -> no output, exit 0.
3. `npm run test:paths src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts src/app/components/repo-grades/classTrendsFolderEntry.test.ts src/app/components/repo-grades/useRepoGradesBulkGrade.test.ts src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts src/app/components/repo-grades/repoGradesBulkGrade.test.ts`
   -> `COVERED` per path, all passing. Realises G3/G4 under a `resolved`
   identity: two results with one roster key count once; a 2-distinct-student
   area does not flag; unbound repos are handled and never collapsed with a
   bound row.
4. `npm run lint` -> exit 0, no new warning in the edited files.

---

## 6. Line-shift obligations

Sequential edits move the line numbers earlier artifacts and briefs pin. These
obligations are real and have been dropped before; the owner named is who must
re-pin, and re-pinning means re-grepping/re-opening the tree, never trusting the
pre-shift number.

- **After Wave 1 lands:** edits to `class-trends.ts` (355 -> larger) and
  `class-trends-draft.ts` (178 -> larger) shift every line the Wave 2 brief and
  the test-author's oracle pin into those files - e.g. `areaFullyCovered`
  `:65-67`, `renderCountedClause` `:80-89`, `composeClassTrendsDraft` `:118`,
  the thresholds at `class-trends.ts:114-115`, and every AC/architect citation
  into these two modules. **Owner of the re-pin:** the orchestrator regenerating
  the Wave 2 implementer brief AND the test-author regenerating the AC-6/AC-7/AC-9
  oracle, both against the post-Wave-1 tree. **Delta:** not fixed until Wave 1
  lands (depends on the filter's final size); the obligation is to re-measure,
  not to carry a number.
- **After Wave 2 lands:** the added EIGHTH root in
  `classTrendsDraft.not-postable.test.ts` shifts its roots array (`:214-233 (roots literal)`
  today), so any doc pinning `:207-233`/`:214-233 (roots literal)` must be re-pinned. Edits to
  `repo-grades/index.tsx` move the repo mount from `:856`, and edits to
  `classTrendsFolderEntry.ts` move its cited lines. **Owner of the re-pin:** the
  test-author (the roots array) and, only if the owner picks Y, the orchestrator
  regenerating the Wave 3 brief against the post-Wave-2 tree.
- **No cross-DOCUMENT stale-citation risk outside N13b:** these edits are inside
  `src/`; no other backlog item's plan pins lines in these files (checked: the
  N13/N13a notes cite `class-trends.ts`/`gemini.ts`/`engine.ts` constants, which
  this item does not move, and N13a is CLOSED at `d5179a92`).

---

## 7. Residual register (owner + instrument + step; missing any one is a deletion)

These are the residuals this cut carries forward or creates. They are handed to
the orchestrator to record under N13b in `docs/BACKLOG.md` at disposal/push (a
residual not in the backlog does not exist - `iteration-caps.md` anti-gaming).
R1-R4 come from the AC doc, R5-R8 from the security doc, R-UX-1..5 from the UX
doc; this plan does not re-author them, it routes them to waves.

- **R1 (AC/arch)** - the instructor named list vs. the name-exclusion enforcers.
  Owner: implementer + test-author. Instrument: `classTrends.wiring.test.ts:128-130`
  (kept), `classTrendsDraft.not-postable.test.ts:214-233` (8th root),
  architect G1/G2. Step: **Wave 2** (the panel `.student` ban is NOT loosened;
  names enter only the new leaf via `instructorAttribution`).
- **R2 (AC)** - owner confirmation of AC-4/AC-5 (deduction on scale-less scores;
  trivial-deduction threshold). Owner: repo owner. Instrument: the AC-4/AC-5
  recommendations. Step: one batched, non-gating question at scope hand-off; a
  "yes" applies the recommended reading and does not move where identity or the
  count live. Non-blocking for Wave 1 and Wave 2's shape.
- **R3 (AC/arch)** - the repo-surface roster-identity channel AND the count's
  identity basis on the repo path (the X/Y fork). Owner: owner (the fork) +
  implementer (the channel under Y). Instrument: `github-repos.ts:619,602-624`,
  `useRepoGradesBulkGrade.ts:401`, `repoGradesRows.ts:119`,
  `repo-student-bindings.ts:47-88`, architect G3/G4. Step: **Wave 3** under Y;
  under X the repo mount ships `{kind:"unavailable", reason}` (Wave 2) and R3
  stays an open follow-up. The `SubsetIdentity` seam is settled either way.
- **R4 (AC)** - confirm the no-model enforcer's current content (AC-10). Owner:
  test-author. Instrument: `classTrendsDraft.not-postable.test.ts`
  (`FORBIDDEN_PATH_PREFIXES` at `:58`; roots at `:214-233 (roots literal)`) and the sabotage
  check `docs/loop/leverage.md:160-167` describes. Step: Wave 2 (confirm the
  guard still bans `lib/llm`/`lib/gemini` and CAN fail; add the 8th root).
  Measured this pass: the guard currently lists all five prefixes at `:58`.
- **R5 (security, extends R1)** - the free-text name-leak channel (L5/L6 model
  insight, L7 rubric name) AND L8 (assignment name). Owner: test-author (oracle)
  + implementer (the filter). Instrument: `class-trends-draft.ts:80-89,104-116,127,136`,
  `class-trends-insight.ts:59-69,234-269`, `prompts.ts:208`. Step: **Wave 1** -
  the pure-function identifier-string denylist over the whole returned Markdown.
- **R6 (security)** - small-class disclosure floor (3 of 3 / 3 of 4), a PRODUCT
  decision. Owner: repo owner. Instrument: `n13b-security.md` section 4's
  arithmetic + AC-2 fixtures at class sizes 4 and 30. Step: one batched,
  non-gating owner question at scope hand-off (same shape as R2). Non-blocking;
  if the owner adopts the "route below-floor subset clauses to the instructor
  list only" recommendation, it lands in Wave 2's subset-clause renderer.
- **R7 (security, extends R3)** - AC-8's oracle coverage on the repo surface.
  Owner: architect + test-author. Instrument: `github-repos.ts:618-619`,
  `repoGradesRows.ts:112-119`. Step: Wave 2's AC-8 oracle runs against a
  repo-shaped fixture, OR AC-8 is explicitly scoped to Canvas and the repo
  privacy oracle is filed with Wave 3 - silence is not acceptable.
- **R8 (security, extends R1)** - the type-level exclusion (BLOCKER-2): the
  refined guard must not be a longer regex. Owner: architect (shape) +
  test-author (proving the excluded state is a compile error). Instrument:
  `classTrends.wiring.test.ts:128-130`, `class-trends-draft.ts:69-72` (the
  existing parameter-type precedent). Step: Wave 2 - satisfied by construction
  (the architect's option (a): names live on `instructorAttribution`, a sibling
  of `areas`, which the class composer's iteration domain cannot reach; the ban
  is KEPT unrefined because the panel is never handed a name).
- **R-UX-1** - extend the wiring-test family for the new section. Owner:
  test-author. Instrument: `classTrends.wiring.test.ts`. Step: Wave 2 (assert
  the distinct Copy label and the shared empty-state branch).
- **R-UX-2** - persist the panel's `expanded` toggle. Owner: whichever seat next
  touches general class-trends UX debt (NOT N13b). Instrument: the `localStorage`
  grep (zero `ta-` hits for this control) + `ClassTrendsPanel.tsx:88`. Step: a
  future item; recorded, not adopted here.
- **R-UX-3** - the shared-state collision between the two Copy controls. Owner:
  architect (settled: the new leaf is a separate component instance with its own
  local state) + test-author. Instrument: `classTrendsDraftState.ts:54-56`. Step:
  Wave 2's oracle exercises both Copy buttons in one render and asserts neither
  status text leaks into the other's block.
- **R-UX-4** - the possible reveal-toggle for screen-share safety. Owner: repo
  owner (product) + implementer if adopted. Instrument: the key
  `ta-class-trends-names-revealed`. Step: one batched non-gating question; the
  UX pass recommends AGAINST adding it. Non-blocking.
- **R-UX-5** - the "Copy" -> "Copy class announcement" rename is a change to
  shipped copy. Owner: the Wave 2 implementer. Instrument:
  `ClassTrendsDraftPanel.tsx:101` and any label assertion in
  `classTrendsDraft.wiring.test.ts`. Step: Wave 2 updates the label and its test
  in the same commit that adds the new button, so the two labels ship together
  and never both read "Copy."

---

## 8. What this pass could NOT determine, stated plainly

- **The drop-vs-reject branch of Wave 1's filter** (drop the offending clause,
  or reject the whole draft) is the test-author's oracle + implementer's call;
  this plan fixes the write set and the AC-8 direction (RED if any run identifier
  reaches the returned Markdown), not the branch.
- **The X/Y fork is the OWNER's** (R3). This plan builds the Canvas family under
  option X and isolates option Y as the additive, owner-gated Wave 3. I do not
  decide the fork; I make the cut correct under either answer.
- **No component renders under vitest here, and there is no API key.** Every
  pixel/legibility/focus claim (OV-1..OV-6) and every real-model claim (whether a
  deployed model actually emits a name into `concept`/`reading`) is routed to
  owner-verification: owner = repo owner, instrument = the deployed app's Trends
  panel on a real graded run, step = the post-deploy owner walk. G1-G6 prove the
  import/mount/arithmetic; they never prove the pixels or the live model.
- **Wave 3's exact write set** is a FLOOR to be re-derived at dispatch (if Y is
  chosen), because Wave 2's edits will have shifted the repo-grades files it
  touches; the four files named are the confirmed core, not a closed set.
