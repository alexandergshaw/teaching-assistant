# N13b Wave 2 test notes and frozen oracles (feature core, option X)

Seat: `loop-test-author`. Round 1 of 2 (`docs/AGENTS.md` "Two rounds, then
ask"). A fresh `loop-checker` gates this before any implementer writes test
code. This document decides WHAT IS MEASURED and HOW IT FAILS for Wave 2 of
N13b - the subset count + instructor named list under option X. It authors no
production code and no test code; it authors the notes an implementer
(`loop-implementer`) writes tests from, plus the frozen oracles and the
sabotage design.

Consumes, read in full this pass and re-pinned against the POST-WAVE-1 tree
(commit `e1befd23`): `docs/n13b-acceptance-criteria.md` (AC-1..AC-12, R1-R4),
`docs/n13b-architecture.md` (the `SubsetIdentity` seam, the numbers/names
type split, `SUBSET_MIN_STUDENTS=3`, the new leaf, the B1 repo-mount fix),
`docs/n13b-ux.md` (the two Copy buttons, the instructor sub-section, the
three-way empty state), `docs/n13b-waves.md` Wave 2 (incl. the INFO-2
OBLIGATION), `docs/n13b-security.md` (L5-L8, BLOCKER-2/R8 type exclusion,
R7 repo-shaped oracle).

---

## 0. What I measured, and with which command (post-Wave-1 tree)

Line counts, Git-Bash `wc -l < <f>` (cross-checked; the design docs' numbers
predate Wave 1 and are stale - these are current):

| File | current `wc -l` | design-doc figure (stale) |
|---|---|---|
| `src/lib/grade/class-trends.ts` | 386 | 355 |
| `src/lib/grade/class-trends-draft.ts` | 225 | 178 |
| `src/app/components/drafted-grades/ClassTrendsPanel.tsx` | 212 | 212 |
| `src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx` | 117 | 117 |
| `src/app/components/repo-grades/index.tsx` | 930 | 930 |
| `src/app/components/repo-grades/classTrendsFolderEntry.ts` | 113 | 113 |
| `src/app/components/drafted-grades/classTrendsDraftState.ts` | 58 | 58 |

Structural facts opened this pass (each cited where used below):

- Wave 1 already landed: `ClassTrendsReport.knownIdentifiers: readonly
  string[]` exists (`class-trends.ts:174-181`), populated by
  `collectKnownIdentifiers` (`:193-204`) from `result.student` + the owner
  segment of `gradedRepo` (`:199-201`), unconditionally in `computeClassTrends`
  (`:384`). `composeClassTrendsDraft` is 3-param (`class-trends-draft.ts:132-136`)
  and already scans the whole assembled Markdown against `knownIdentifiers` via
  `carriesKnownIdentifier` (`:110-116`), with per-clause and last-resort scans
  (`:174-186`, `:217-222`).
- The subset feature does NOT exist yet: `grep -rn "instructorAttribution\|
  missedSubset\|SubsetIdentity\|isSubsetTrend\|SUBSET_MIN" src --include=*.ts
  --include=*.tsx` returns NOTHING. So every Wave-2 assertion naming those
  symbols is RED-BY-CONSTRUCTION (the file will not even compile under `tsc`)
  until the feature lands - the strongest form of "can fail," and the same
  honest footing Wave 1's W1-7/W1-8 stood on.
- `computeClassTrends(entry)` is 1-arg today (`class-trends.ts:289`); Wave 2
  adds the optional 2nd arg `identity: SubsetIdentity = { kind: "per-result" }`.
- The `.student` ban lives at `classTrends.wiring.test.ts:128-129`
  (`expect(strippedPanel).not.toMatch(/\.student\b/)`), over a comment-stripped
  read of `ClassTrendsPanel.tsx`. Its `stripComments` (`:37-39`) is the
  split + UNANCHORED `/\/\/.*$/` form (trailing-comment-safe) - the form to
  duplicate for any new source scan.
- The not-postable canary-3 roots are SEVEN, literal array at
  `classTrendsDraft.not-postable.test.ts:214-233`; `FORBIDDEN_PATH_PREFIXES`
  = `["app/actions","lib/canvas","lib/lms-generation","lib/llm","lib/gemini"]`
  at `:58`.
- The repo mount is `repo-grades/index.tsx:856`
  (`<ClassTrendsPanel entry={trendsEntry} defaultExpanded />`), gated on
  `trendsEntry &&` (`:854`).
- The repo mount's existing AST wiring guard, `repoGradesClassTrends.wiring.
  test.ts:583-590` (A-6), reads the mount's `entry`/`defaultExpanded`
  attributes with `.find(...)` - NOT an exact-attribute-set assertion - so
  ADDING an `identity=` attribute to the mount does not break A-6 (verified by
  opening; the `.find` for `entry` and `defaultExpanded` still resolve). A NEW
  assertion is therefore needed for B1, not a modification of A-6.
- `class-trends-draft.test.ts:88` pins `composeClassTrendsDraft.length === 3`;
  the subset clause must NOT add a 4th parameter (it reads `report.areas[].
  missedSubset`, already in hand).
- `classTrendsRunCohort.test.ts:314-334` bans `.strengths`/`.improvements`/
  `.feedback`/`.sourceIndex` reads across `class-trends.ts` +
  `class-trends-insight.ts` + `class-trends-draft.ts` combined, and does NOT
  ban `.student`/`.missedSubset`/`.instructorAttribution`. Wave 2's identity
  threading and attribution building MUST NOT read any of the four banned
  fields, or this pre-existing test goes RED (an easy accidental break).

---

## 1. Satisfiability proof (seat practice 1): reference impl, run green, sabotages run red

A set of failing tests is not a specification until something has passed it. I
built a standalone reference implementation of the layer-A subset counting
(`computeClassTrends` with `SubsetIdentity`/`missedSubset`/`instructorAttribution`/
`isSubsetTrend`/`SUBSET_MIN_STUDENTS`) and the numbers-only draft subset clause,
in an isolated tree
(`<scratch>/ref/subset.test.ts`), with the pure-function oracles below inlined,
and ran it under vitest:

```
Test Files  1 passed (1)
Tests  12 passed (12)
```

So AC-1..AC-7, AC-9, AC-5, the resolved-identity dedup, the privacy runtime
oracle, and INFO-2 are all satisfiable by ONE implementation. Then I applied
four named mutations to that same reference and re-ran; each turned the
intended assertion(s) RED and nothing else masked it:

| Sabotage on the reference | Result | Discriminates? |
|---|---|---|
| INFO-2: gate `knownIdentifiers` behind `identity.kind !== "unavailable"` | 1 failed \| 11 passed | YES (W2-7) |
| Dedup: resolved `keyOf` replaced with per-index key | 1 failed \| 11 passed | YES (W2-5) |
| Privacy: subset clause renders `instructorAttribution` names | 3 failed \| 9 passed | YES (W2-10; collateral RED on W2-8/W2-9 spelling, expected) |
| AC-4: count an unknown score into the denominator | 1 failed \| 11 passed | YES (W2-4) |

The reference is a THROWAWAY satisfiability witness, not the design; the
implementer writes the real code against the real `class-trends.ts`. What it
proves is that the red tests below are not contradictory or impossible.

**What the reference could NOT prove (stated plainly):** it is pure TypeScript,
so it does not exercise the SOURCE-TEXT / AST wiring requirements (W2-14..W2-17)
or the static privacy scan (W2-11) - those depend on the real files existing
and are ARGUED against the current tree, not executed here. See section 2.

---

## 2. What is executable here vs what is only argued

Per `docs/loop/this-repo.md` section 6 and MEMORY: vitest here is node-env and
renders NO component. Nothing below that names a rendered pixel, focus order or
contrast is machine-checkable; those are owner-verification (OV) items.

**Executable here (proven satisfiable in section 1, and the implementer runs
them for real against `class-trends.ts`/`class-trends-draft.ts`):** W2-1..W2-13.

**Argued against the tree, not executed by me (the implementer's test code is
what executes them; I reason they discriminate from the current source):**
W2-14 (panel mounts leaf + `.student` ban), W2-15 (leaf reads the attribution
content), W2-16 (8th canary-3 root), W2-17 (B1 repo-mount identity). W2-11 (the
static "composer never reads `instructorAttribution`" source scan) is a
source-text check the implementer runs; I argue its discrimination, I do not
execute it.

**OV only (route to owner walk, never asserted machine-checkable):** the two
Copy buttons read as visually distinct (OV-2/OV-5), tab order and focus of the
new leaf's controls (OV-4), light/dark legibility (OV-6), and that the named
list actually appears on screen for a real run (OV-2). These are already
recorded in `docs/n13b-ux.md` section 8 and `docs/n13b-acceptance-criteria.md`
OV-1/OV-2; this pass adds none and relocates nothing to a machine check that
cannot honestly be one.

---

## 3. The load-bearing privacy finding: "type separation" is PARTIAL, not a compile error

The brief asks me to "prove the class clause cannot read names (type
separation)." Measured against the architecture's chosen shape, it CANNOT be
proven, and I will not assert it:

- `composeClassTrendsDraft(report, observations, assignmentName)` receives
  `report: ClassTrendsReport` (`class-trends-draft.ts:132-136`).
- Wave 2 puts the names on `ClassTrendsReport.instructorAttribution`
  (architecture 4.3) - a FIELD OF THE TYPE THE COMPOSER ALREADY RECEIVES.
- Therefore `report.instructorAttribution` is reachable inside
  `composeClassTrendsDraft`. Reading it is NOT a compile error. The
  architecture's "the composer's iteration domain (`report.areas`) cannot
  reach a name" (architecture section 2) is a DISCIPLINE claim about what the
  code happens to iterate, not a TYPE guarantee. AC-8's "strongest form" (a
  type the class composer cannot receive a name through) and the security
  doc's BLOCKER-2/R8 ("the excluded state must be a compile error") are NOT
  achieved by option (a) as designed.

So the privacy boundary for the NEW subset path rests on TWO instruments, both
of which I make discriminating below, plus one residual:

1. **W2-10 (runtime, load-bearing):** a name placed on
   `report.instructorAttribution` never appears in the returned Markdown.
   Proven to discriminate the "composer renders `instructorAttribution`"
   mutation (section 1, S-PRIV-LEAK RED). The seeded name MUST NOT also be in
   `knownIdentifiers`, or Wave 1's substring filter masks the leak and the
   oracle passes on the broken code too (the "privacy oracle that can't fail"
   trap - see W2-10's construction).
2. **W2-11 (static backstop):** `composeClassTrendsDraft`'s comment-stripped
   source never contains the token `instructorAttribution`.
3. **Residual R-T2 (extends R8/BLOCKER-2):** the true strongest form is to
   NARROW the composer's parameter to a type that omits `instructorAttribution`
   (e.g. pass `Omit<ClassTrendsReport, "instructorAttribution">`, or a distinct
   `ClassTrendsDraftInput`), making a name read a compile error. Owner:
   architect (shape) + test-author (prove it is a compile error). This is a
   real hardening the current shape leaves on the table; W2-10 + W2-11 are the
   enforcement until it lands. Recorded, not silently adopted.

---

## 4. Requirements

Each names the OBJECT under comparison, the INSTRUMENT (with its exact
command; two or more files -> `npm run test:paths`, never a raw multi-path
`vitest`), and the DIRECTION of failure, then a frozen oracle CONSTRUCTION and
a NAMED sabotage stating whether it discriminates. No cross-`*.test.ts`
imports: every fixture helper is duplicated into the file that uses it. No
`/s` dotAll (fails `tsc` TS1501).

Every layer-A assertion asserts POSITIVELY on a non-null `missedSubset` -
`expect(area.missedSubset).not.toBeNull()` THEN read `.studentCount` - never
`area.missedSubset?.studentCount` with a `.not.toBe(n)`, which passes vacuously
when the field is null (the vacuous-pass trap; proven avoided in section 1's
reference).

### Group A - layer A, `src/lib/grade/class-trends.test.ts`

Instrument for W2-1..W2-7 (single file):
`npm run test:paths src/lib/grade/class-trends.test.ts`.
Fixture builder: DUPLICATE the existing `makeResult`/`makeEntry` in that file
(`class-trends.test.ts:22-53`); they already build `GradeResult`/
`GradingRunEntry`. A per-area result is `makeResult(name, [makeRubricArea(area,
score)])`. Distinct students come from distinct `student` values on the
per-result (default) identity - one graded result IS one distinct student
(AC-1, Canvas invariant).

**W2-1 - `missedSubset.studentCount` counts DISTINCT STUDENTS who missed points
(AC-1).**
- Object: `AreaTrend.missedSubset.studentCount` for an area, versus the number
  of distinct students whose parsed area score established a deduction.
- Direction: RED if the count differs from the distinct-student deduction
  count, or if `missedSubset` is null on a Canvas (per-result) run.
- Frozen oracle: 4 results on area "Thesis" - `["50%","40%","55%","100%"]`.
  Expected `{ studentCount: 3, denominator: 4, unknownExcludedCount: 0 }`.
  (100% is not-missed but IS a known percent -> in the denominator, not the
  numerator.)
- Sabotage: in the accumulation, push into the numerator on `parsed.kind ===
  "percent"` regardless of `< 100`. RED (`studentCount` becomes 4). GREEN on
  restore. **Discriminates.**

**W2-2 - the threshold is an ABSOLUTE count of >= 3 distinct students
(AC-2), via `isSubsetTrend`.**
- Object: `isSubsetTrend(area)` versus `missedSubset.studentCount >= 3`, at
  class sizes 4 and 30.
- Direction: RED if a 2-distinct-student area flags, or a 3-distinct-student
  area fails to flag at ANY class size.
- Frozen oracle, THREE constructions (all with distinct student names):
  - class of 4, 3 missed: `["50%","40%","55%","100%"]` -> `studentCount 3`,
    `denominator 4`, `isSubsetTrend true`.
  - class of 30, 3 missed: 3x `"50%"` + 27x `"100%"` -> `studentCount 3`,
    `denominator 30`, `isSubsetTrend true` (3 of 30 flags exactly as 3 of 4).
  - 2 missed: `["50%","40%","100%","100%"]` -> `studentCount 2`,
    `isSubsetTrend false`.
- Sabotage A: `SUBSET_MIN_STUDENTS = 2`. RED (the 2-student case flags). GREEN
  on restore. **Discriminates.**
- Sabotage B: make the threshold a FRACTION (`studentCount / totalResults >=
  0.5`). RED (the 3-of-30 case, ratio 0.1, fails to flag). GREEN on restore.
  **Discriminates** - and this is the sabotage that proves "absolute, not a
  fraction" (the owner's own words, `backlog.yml:209`); a fixed-count-only
  suite would let a fraction impl pass, so the 3-of-30 case is not optional.

**W2-3 - "missed points" is ANY deduction, and high/low direction is UNCHANGED
(AC-3, additive).**
- Object: (i) whether an 80% result counts toward `studentCount`; (ii) the
  `direction` on the same area.
- Direction: RED if an 80% result does not count toward `studentCount`, OR if
  `direction` changes value from what today's `classifyDirection` produces.
- Frozen oracle: area "Thesis" = `["80%","80%","80%"]`. Expected
  `studentCount 3` (all < 100) AND `direction "high"` (all >= 70). The SAME
  three results are both a strength (`report.strengths` contains this area) and
  a subset trend - that is the additive property, pinned as a frozen literal.
- Sabotage: subset numerator only counts scores below `LOW_PERCENT_THRESHOLD`
  (60) - i.e. re-uses the old low-score rule. RED (`studentCount` becomes 0;
  80 > 60). GREEN on restore. **Discriminates** - this is exactly the "looking
  for failure, not friction" defect the owner named.
- Regression half (AC-3): the EXISTING `class-trends.test.ts` direction tests
  (`:190-253`, high/low/mixed/no-scale) must stay GREEN unchanged - the
  clean-pass idiom. Do not edit them; adding the subset must not perturb any.

**W2-4 - unknown-scale scores are excluded from BOTH terms and DISCLOSED
(AC-4).**
- Object: `studentCount`, `denominator`, `unknownExcludedCount` versus the rule
  "a `raw-number` or `unscored` score is in NEITHER term; a percent < 100 is in
  both; a percent == 100 is in the denominator only."
- Direction: RED if an unknown score is counted as missed (swells numerator),
  OR silently counted as not-missed (swells denominator), OR not disclosed.
- Frozen oracle: area "Thesis" over 4 distinct students =
  `["50%","100%","8","N/A"]`. Expected `{ studentCount: 1, denominator: 2,
  unknownExcludedCount: 2 }`.
- Sabotage: on the `else` branch (raw-number/unscored), `denominator++` instead
  of `unknownExcludedCount++`. RED (`denominator` becomes 4). GREEN on restore.
  **Discriminates** (proven, section 1 S-AC4).

**W2-5 - identity basis: a `resolved` identity DEDUPES two results sharing one
roster key (AC-1/AC-2 identity basis, the seam Wave 3 will wire).**
- Object: `studentCount` under `identity = { kind: "resolved", keyOf }` where
  two of three results map to one key, versus the deduped count (2).
- Direction: RED if the two same-key results count as two (studentCount 3, and
  the area flags), i.e. the count is over results not distinct keys.
- Frozen oracle: three results `A("repo-a","Thesis","50%")`,
  `A("repo-b","Thesis","40%")`, `A("repo-c","Thesis","55%")`; `keyOf` maps
  repo-a and repo-b to `{key:"ada"}`, repo-c to `{key:"ben"}`. Expected
  `studentCount 2`, `isSubsetTrend false`. This is a UNIT test of the seam:
  Wave 2 implements all three `SubsetIdentity` kinds in layer A; only the repo
  surface's WIRING to pass `resolved` is deferred to Wave 3, so the dedup logic
  is testable now by passing a `resolved` identity directly.
- Sabotage: in the `resolved` branch, ignore `keyOf` and key by array index.
  RED (studentCount 3). GREEN on restore. **Discriminates** (proven, section 1
  S-DEDUP).

**W2-6 - the named list EQUALS the counted set (AC-9).**
- Object: `report.instructorAttribution[area].students` (their `displayName`
  set and length) versus the distinct students `missedSubset.studentCount`
  counted for that area.
- Direction: RED if a named student is not in the missed set, or the list
  length differs from `studentCount`.
- Frozen oracle: 4 distinct students on "Thesis" =
  `[Ada Lovelace 50%, Ben Franklin 40%, Cara Diaz 55%, Dan Ek 100%]`. Expected
  `instructorAttribution` for "thesis" has `students.displayName` ==
  `{Ada Lovelace, Ben Franklin, Cara Diaz}` (sorted-compare) AND
  `students.length === missedSubset.studentCount` (3). Dan Ek (100%, not
  missed) is absent.
- Sabotage: build `students` from ALL keys with the area (the denominator set)
  instead of the missed set. RED (Dan Ek appears; length 4 != 3). GREEN on
  restore. **Discriminates** - this is the exact misattribution class
  (`leverage.md:43`) the feature exists to forbid: count one set, name another.

**W2-7 - INFO-2: under `unavailable` identity, `missedSubset`/
`instructorAttribution` are suppressed but `knownIdentifiers` STAYS populated.**
- Object: on `computeClassTrends(entry, { kind: "unavailable", reason })`:
  (i) every area's `missedSubset`; (ii) `instructorAttribution`;
  (iii) `knownIdentifiers`.
- Direction: RED if `missedSubset` is non-null under `unavailable`, OR
  `instructorAttribution` is non-empty, OR `knownIdentifiers` is empty / missing
  a run student's name.
- Frozen oracle: two results, students `["Zbrinqua Qwelford","S2"]`, area
  "Thesis" `["50%","40%"]`, identity `unavailable`. Expected: `areas[0].
  missedSubset === null`, `instructorAttribution === []`, and
  `knownIdentifiers` CONTAINS `"Zbrinqua Qwelford"`.
- Sabotage: gate `collectKnownIdentifiers` behind `identity.kind !==
  "unavailable"` (the exact mistake the wave plan's INFO-2 OBLIGATION warns of
  - re-opening the leak by analogy with `instructorAttribution`). RED
  (`knownIdentifiers` empty under `unavailable`). GREEN on restore.
  **Discriminates** (proven, section 1 S-INFO2-GATE). This is the single most
  important layer-A guard in the wave.

### Group B - layer C draft, `src/lib/grade/class-trends-draft.test.ts`

Instrument for W2-8..W2-12 (single file):
`npm run test:paths src/lib/grade/class-trends-draft.test.ts`.
The existing `makeArea`/`makeReport` (`class-trends-draft.test.ts:15-52`) must
be EXTENDED (same commit) to set the new REQUIRED fields: `makeArea` defaults
`missedSubset: overrides.missedSubset ?? null`; `makeReport` defaults
`instructorAttribution: [] `. This is a satisfiability obligation - adding
required fields to `AreaTrend`/`ClassTrendsReport` breaks every existing
fixture until the builders set them; the implementer updates the builders in
the same commit and the pre-existing draft tests stay green.

**W2-8 - the subset clause renders even when `resultsWithArea < totalResults`
(AC-6, the opposite gate from high/low), including the mixed-direction
motivating case.**
- Object: presence of a subset clause in the returned Markdown for an area
  where `isSubsetTrend` holds, versus the area's coverage state and direction.
- Direction: RED if the subset clause is suppressed because
  `resultsWithArea !== totalResults` (i.e. it was routed through
  `areaFullyCovered`, `class-trends-draft.ts:65-67`), OR suppressed because the
  area's `direction` is not high/low.
- Frozen oracle, TWO constructions:
  - Partial coverage: an area with `missedSubset {studentCount:3,
    denominator:3, unknownExcludedCount:0}`, `resultsWithArea 3`,
    `totalResults 5`, `direction "mixed"`. Expected `status "ok"` and the
    Markdown contains the area's `displayArea`. (`areaFullyCovered` is false
    here; the high/low path would drop it; the subset path must not.)
  - THE MOTIVATING CASE (owner's "class of 9, 4 miss the same area"): 9
    results on one area, 4 at `"50%"` and 5 at `"100%"` -> `direction "mixed"`,
    `missedSubset.studentCount 4`, fully covered. Expected `status "ok"`, the
    subset clause present. This is the case the current feature renders NOTHING
    for (`classifyDirection` -> mixed -> no clause); pin that Wave 2 fixes it.
- Sabotage: run the subset clauses through `.filter(areaFullyCovered)` (copy
  the high/low path's gate). RED (partial-coverage case drops the clause -> the
  draft is `empty`). GREEN on restore. **Discriminates.** Attack on my own
  guard: I do NOT assert the clause is absent when coverage is full (that would
  pass vacuously); I assert PRESENCE under partial coverage, which only a
  correctly-ungated renderer produces.

**W2-9 - the subset clause states its OWN denominator, never `totalResults`
(AC-7).**
- Object: the denominator printed in the subset clause versus
  `missedSubset.denominator`.
- Direction: RED if the clause prints `report.totalResults` (or any number
  other than `missedSubset.denominator`) as its denominator, OR pairs a
  student numerator with a non-student denominator.
- Frozen oracle: reuse W2-8's partial-coverage construction (`studentCount 3`,
  `denominator 3`, `totalResults 5`). Expected the Markdown contains the exact
  substring `"3 of 3"` (the area's own basis) and does NOT contain `"3 of 5"`.
- Sabotage: interpolate `report.totalResults` as the denominator. RED (Markdown
  reads "3 of 5", missing "3 of 3"). GREEN on restore. **Discriminates.**
  Note the noun: the clause must read "N of M students" (the identity basis is
  distinct students), never "submissions" - pin "students" in the frozen
  substring so a submission-noun regression is caught.

**W2-10 - PRIVACY (runtime, load-bearing): a name on
`report.instructorAttribution` never reaches the returned Markdown.**
- Object: the Markdown returned by `composeClassTrendsDraft` versus a
  distinctive name placed on `report.instructorAttribution` that is NOT in
  `report.knownIdentifiers`.
- Direction: RED if the seeded name appears anywhere in the returned Markdown.
- Frozen oracle CONSTRUCTION (the "can't-fail" trap is defused here):
  build a report that fires a subset clause (one area, `missedSubset
  {studentCount:3, denominator:3}`, `direction "mixed"`), set
  `report.instructorAttribution = [{ area, displayArea, students: [{
  displayName: "Zzxq Marker", deductionLabel: "x" }] }]`, and set
  `knownIdentifiers: []` (CRUCIAL: the marker must be absent from
  `knownIdentifiers`, or Wave 1's `carriesKnownIdentifier` filter would drop
  the leaking clause and the test would pass on BOTH correct and broken code).
  Assert `status === "ok"` and `markdown` does NOT contain `"Zzxq Marker"`.
- Sabotage: make the subset clause renderer read
  `report.instructorAttribution[...].students[].displayName` into its text.
  RED (the marker appears). GREEN on restore. **Discriminates** (proven,
  section 1 S-PRIV-LEAK - the privacy assertion goes RED; the correct
  numbers-only renderer never touches the names field). Attack on my own guard:
  a naive version seeding the marker into `knownIdentifiers` too would pass
  even on the broken renderer (filtered by Wave 1) - that version measures
  NOTHING and is banned by this construction.

**W2-11 - PRIVACY (static backstop): `composeClassTrendsDraft` never reads
`instructorAttribution`.**
- Object: the comment-stripped source of `class-trends-draft.ts` versus the
  token `instructorAttribution`.
- Direction: RED if `instructorAttribution` appears in the composer's
  code (not comments).
- Construction: DUPLICATE the `stripComments` helper from
  `classTrends.wiring.test.ts:37-39` verbatim (split + UNANCHORED `/\/\/.*$/`,
  block-comment `/\/\*[\s\S]*?\*\//g`) - do NOT import it (no cross-test-file
  imports) and do NOT use the anchored trailing-comment-blind form. Read
  `class-trends-draft.ts`, strip, assert `not.toContain("instructorAttribution")`.
- Sabotage: add `const names = report.instructorAttribution;` to the composer.
  RED. GREEN on restore. **Discriminates.** Caveat (honest): this is a
  source-text guard, weaker than the compile-time exclusion R-T2 recommends; it
  catches the field being NAMED, not every conceivable indirection. Paired with
  W2-10 (runtime) it is sufficient for this wave; R-T2 is the durable fix.

**W2-12 - the composer signature stays 3-param (the subset clause reads
`report`, not a new channel).**
- Object: `composeClassTrendsDraft.length`.
- Direction: RED if it is not 3.
- Construction: the existing assertion at `class-trends-draft.test.ts:88`
  (`expect(composeClassTrendsDraft.length).toBe(3)`) - KEEP it, do not weaken.
- Sabotage: add a 4th param (e.g. `subsetIdentity`) to the composer. RED. GREEN
  on restore. **Discriminates.** Rationale: names/numbers must flow through the
  typed `report`, not a side channel that bypasses the report's structure.

**W2-13 - INFO-2 END-TO-END through the real production sequence, repo-shaped
(AC-8 on the `unavailable` path; R7).**
- Object: the Markdown from `composeClassTrendsDraft(report, [observation],
  assignmentName)` where `report = computeClassTrends(entry, { kind:
  "unavailable", reason })` and a run student's name is echoed by the
  observation, versus that name.
- Direction: RED if the name survives to the Markdown on the `unavailable`
  path.
- Frozen oracle: DUPLICATE the `makeRunEntry`/`makeGradedResultForRun` helpers
  already in this file (`class-trends-draft.test.ts:379-413`, added by Wave 1's
  W1-8) so there is no cross-file import. Build a run whose graded student is
  `SEED = "Zbrinqua Qwelford"` (already the file's marker, `:262`), compute
  with `identity = { kind: "unavailable", reason }`, then compose with an
  observation whose `reading` is `` `echoing ${SEED} verbatim` ``. Assert the
  Markdown does not contain `SEED`. Because `SEED` is a run student it IS in
  `knownIdentifiers` (when correctly populated), so Wave 1's filter drops the
  clause.
- Sabotage: the SAME INFO-2 gate as W2-7 (`collectKnownIdentifiers` gated on
  `identity.kind !== "unavailable"`). RED end-to-end (empty denylist -> the
  name is not filtered -> it reaches the Markdown). GREEN on restore.
  **Discriminates.** This is the belt to W2-7's braces: W2-7 proves
  `knownIdentifiers` stays populated at layer A; W2-13 proves the DRAFT is
  actually filtered on the repo/`unavailable` path, which is the leak the wave
  plan says an implementer will silently re-open.

### Group C - source-text / AST wiring (argued, not executed by me)

**W2-14 - AC-12/G6: `ClassTrendsPanel` mounts `ClassTrendsStudentListPanel`
and passes `instructorAttribution`; the `.student` ban STAYS.** File:
`src/app/components/drafted-grades/classTrends.wiring.test.ts`.
- Object: the comment-stripped source of `ClassTrendsPanel.tsx`.
- Direction: RED if the panel does not import + render
  `<ClassTrendsStudentListPanel`, OR does not pass an
  `instructorAttribution={...}` prop to it, OR if `/\.student\b/` matches (the
  ban regressed).
- Construction: ADD to the existing file (which already reads a comment-stripped
  `ClassTrendsPanel.tsx`): (i) `strippedPanel` matches
  `/import\s+ClassTrendsStudentListPanel\s+from/`; (ii) `strippedPanel` matches
  `/<ClassTrendsStudentListPanel\b/`; (iii) the opening tag slice from
  `<ClassTrendsStudentListPanel` to its `>` matches `/instructorAttribution=/`
  (pin the FACT that the names field is handed to the leaf, not the exact prop
  spelling elsewhere). KEEP `:128-129` (`not.toMatch(/\.student\b/)`)
  unchanged - the ban holds because names enter the LEAF via
  `instructorAttribution`, never the panel via `.student` (architecture 2).
- Sabotage A: delete the `<ClassTrendsStudentListPanel` mount from the panel.
  RED ((ii)/(iii)). GREEN on restore. **Discriminates.**
- Sabotage B: make the panel read `report.instructorAttribution[0].students[0].
  displayName` inline (bypassing the leaf) - this would NOT trip the `.student`
  ban (it is `.students`, `\b`-evadable per security doc section 3), and IS the
  BLOCKER-2 evasion. It DOES trip (iii) only if the mount is also removed;
  standing alone it is NOT caught by this wiring test. STATED HONESTLY: the
  `.student` regex does not catch `.students`; W2-14 is a mount/reachability
  guard, NOT a name-leak guard for the panel. The name-leak guard is W2-10
  (runtime, on the composer). Do not claim W2-14 closes BLOCKER-2.

**W2-15 - the new leaf is REACHABLE and reads the attribution CONTENT
(named-list content, source-checkable half).** File: extend
`classTrends.wiring.test.ts` with a comment-stripped read of
`ClassTrendsStudentListPanel.tsx`.
- Object: the leaf's stripped source.
- Direction: RED if the leaf does not consume its `instructorAttribution` prop
  (i.e. never references the prop name) or never renders a per-student name.
- Construction: assert the leaf's stripped source (a) references
  `instructorAttribution` (its prop) and (b) references `displayName` (the
  field it must show) and (c) iterates (`.map(`). Pin the FACTS (the leaf reads
  the names it must show and maps over them), NOT the JSX spelling.
- Sabotage: replace the leaf body with a static `<div>No data</div>` ignoring
  the prop. RED ((a)/(b)). GREEN on restore. **Discriminates.**
- BOUNDARY (per the brief): the CONTENT of `instructorAttribution` (right
  members, right cardinality, right `displayName`s) is W2-6 (pure function,
  executed). W2-15 proves only that the leaf CONSUMES that content. That the
  names are VISIBLE, legible and clearly distinct from the class draft is OV-2
  (owner walk) - NOT machine-checkable here, and not asserted as such.

**W2-16 - AC-10/G5: `ClassTrendsStudentListPanel.tsx` is the EIGHTH canary-3
root and reaches nothing forbidden.** File:
`src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts`.
- Object: (i) the `roots` array (`:214-233`) membership; (ii) the transitive
  value-import closure of the new leaf versus `FORBIDDEN_PATH_PREFIXES` (`:58`).
- Direction: RED if the leaf is NOT in `roots`, OR the walk finds a forbidden
  import reachable from the leaf.
- Construction: ADD `join(SRC, "app/components/drafted-grades/
  ClassTrendsStudentListPanel.tsx")` to the `roots` literal (making 8), AND add
  an EXPLICIT membership + existence assertion so "forgot to add the root" is
  itself RED: `expect(roots.map(toPosix)).toContain("src/app/components/
  drafted-grades/ClassTrendsStudentListPanel.tsx")` and
  `expect(statSync(theLeaf).isFile()).toBe(true)`. The existing canary 1/2a/2b
  already prove the walker discriminates a real forbidden import, so the leaf's
  clean walk is meaningful.
- Sabotage A (guard exists): make the leaf `import { gradeWithGemini } from
  "@/lib/gemini"` and reference it. RED (walk finds the violation). GREEN on
  restore. **Discriminates.**
- Sabotage B (guard is wired): remove the leaf from `roots`. RED (the explicit
  membership assertion). GREEN on restore. **Discriminates** - this is the
  count-canary discipline; without it, a leaf added to the feature but not to
  `roots` would ship with the model-import guard silently not covering it (the
  exact "assignment must include the wiring file" class).

**W2-17 - B1: the repo mount passes `identity` with `kind: "unavailable"`.**
File: `src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts`
(TS-AST based; ADD an assertion - do NOT modify A-6, which uses `.find` and
stays green with the extra attribute).
- Object: the single `<ClassTrendsPanel>` element in `index.tsx`: whether it
  carries an `identity` JSX attribute whose value carries `kind: "unavailable"`.
- Direction: RED if the mount has NO `identity` attribute (falls back to the
  default `per-result`, computing `missedSubset` over distinct repo labels -
  the AC-1/AC-7 violation shipping WRONG with every other gate green), OR its
  `kind` resolves to anything other than `"unavailable"`.
- Construction (AST, reuse the file's own `findJsxSelfClosing`/`isIdent`
  helpers, `:501-524`): locate the one `ClassTrendsPanel` element; find its
  `identity` `JsxAttribute`; require its initializer to be a `JsxExpression`
  wrapping an `ObjectLiteralExpression` (inline) whose `kind` property is the
  string literal `"unavailable"`. If the implementer sources the identity from
  a named binding/import instead of inlining, the test must resolve that binding
  within `index.tsx` and assert the same `kind` - so pin the FACT (the mount
  receives an `unavailable`-kinded identity), tolerating either spelling. A
  coarse `INDEX_SOURCE.includes('"unavailable"')` is FORBIDDEN as the sole
  check: it passes even when the literal is unconnected to the mount (a vacuous
  guard); the attribute-to-value tie is what discriminates.
- Sabotage A: delete the `identity=` attribute from the mount. RED (no
  attribute). GREEN on restore. **Discriminates.**
- Sabotage B: change the passed kind to `"per-result"`. RED (`kind` mismatch).
  GREEN on restore. **Discriminates** - this is the one that catches the silent
  wrong-basis ship, the whole point of option X's B1.
- NOTE for the implementer: keep the identity type-only where
  `classTrendsFolderEntry.ts` is involved - it is a canary-3 root
  (`not-postable.test.ts:232`) with an exact value-import constraint (its own
  header); a `{ kind: "unavailable", reason }` object literal and a `type
  SubsetIdentity` import add no forbidden VALUE import, so the not-postable
  guard stays green. Re-derive that file's reader set at the wave gate.

### Multi-file gate command

The Wave 2 gate runs all the above executable + argued files in ONE credited
run (`docs/n13b-waves.md` section 5, Wave 2 gate step 4), spelled with
`test:paths` so no path is silently dropped:

```
npm run test:paths src/lib/grade/class-trends.test.ts src/lib/grade/class-trends-draft.test.ts src/app/components/drafted-grades/classTrends.wiring.test.ts src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts src/app/components/repo-grades/classTrendsFolderEntry.test.ts src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts src/app/components/grading-recording/classTrendsRunCohort.test.ts
```

Expect a `COVERED` line per path, all passing. `classTrendsRunCohort.test.ts`
is in the set as a REGRESSION reader (its field bans must stay green).

---

## 5. Sabotage summary (one mutation per requirement; RED one way, GREEN the other)

| Req | Mutation | RED on | GREEN on restore | Discriminates | Proven by me |
|---|---|---|---|---|---|
| W2-1 | numerator counts every percent, ignore `<100` | W2-1 | yes | yes | reference variant |
| W2-2A | `SUBSET_MIN_STUDENTS=2` | W2-2 (2-student) | yes | yes | argued |
| W2-2B | threshold as a fraction of class | W2-2 (3-of-30) | yes | yes | argued |
| W2-3 | numerator uses old low-score (`<=60`) rule | W2-3 | yes | yes | argued |
| W2-4 | unknown score `denominator++` | W2-4 | yes | yes | RUN (S-AC4) |
| W2-5 | resolved branch keys by index | W2-5 | yes | yes | RUN (S-DEDUP) |
| W2-6 | `students` built from denominator set | W2-6 | yes | yes | argued |
| W2-7 | gate `knownIdentifiers` on identity kind | W2-7 | yes | yes | RUN (S-INFO2) |
| W2-8 | subset clauses `.filter(areaFullyCovered)` | W2-8 | yes | yes | argued (ref shows presence) |
| W2-9 | denominator = `totalResults` | W2-9 | yes | yes | argued |
| W2-10 | subset clause renders attribution names | W2-10 | yes | yes | RUN (S-PRIV-LEAK) |
| W2-11 | composer reads `instructorAttribution` | W2-11 | yes | yes | argued |
| W2-12 | add 4th param to composer | W2-12 | yes | yes | argued |
| W2-13 | INFO-2 gate (end-to-end) | W2-13 | yes | yes | argued (same mutation as W2-7) |
| W2-14A | delete leaf mount from panel | W2-14 | yes | yes | argued |
| W2-15 | leaf ignores its prop | W2-15 | yes | yes | argued |
| W2-16A | leaf imports `@/lib/gemini` | W2-16 | yes | yes | argued |
| W2-16B | remove leaf from `roots` | W2-16 | yes | yes | argued |
| W2-17A | delete `identity=` from mount | W2-17 | yes | yes | argued |
| W2-17B | pass `kind:"per-result"` | W2-17 | yes | yes | argued |

No sabotage above is RED-in-both-directions or GREEN-in-both-directions. The
one place I explicitly REFUSE a guard as non-discriminating is the naive
privacy oracle that seeds the marker into `knownIdentifiers` too (W2-10's
construction note): it passes on correct AND broken code because Wave 1's
filter masks the leak - it measures nothing and must not be written.

---

## 6. Residual register (owner + instrument + step; missing any one is a deletion)

Handed to the orchestrator to record under N13b in `docs/BACKLOG.md` at
disposal/push (a residual not in the backlog does not exist -
`iteration-caps.md` anti-gaming).

- **R-T2 (extends R8 / BLOCKER-2) - the compile-time name exclusion the current
  shape leaves undone.** Owner: architect (narrow `composeClassTrendsDraft`'s
  parameter to omit `instructorAttribution`, e.g. `Omit<ClassTrendsReport,
  "instructorAttribution">` or a `ClassTrendsDraftInput`) + test-author (prove
  the excluded read is a `tsc` error, not merely absent). Instrument:
  `class-trends-draft.ts:132-136` (the composer signature),
  `class-trends-draft.ts:69-72` (the existing parameter-type-exclusion
  precedent for `renderCountedClause`). Step: a follow-up hardening; until it
  lands, W2-10 (runtime) + W2-11 (static) are the enforcement. NOT a blocker on
  Wave 2 shipping - it is the strongest form, not the only form.
- **OV-SUBSET-1 (this wave's OV, extends OV-2) - the class-addressed subset
  clause reads name-free and as this app's voice on a real run, and the
  instructor named list is visible, legible and clearly distinct from the class
  draft.** Owner: repo owner. Instrument: the deployed Trends panel on a run
  with an area 3+ students missed. Step: post-deploy owner walk. (No component
  renders under vitest; W2-6 proves the DATA, W2-14/W2-15 prove REACHABILITY,
  this proves the PIXELS.)
- **R7 status (from the plan) - DISCHARGED into W2-13.** The repo-shaped AC-8
  oracle is authored here as W2-13 (INFO-2 end-to-end on the `unavailable`
  path). The remaining repo-surface privacy question under option Y (a
  `resolved` identity that surfaces real roster names) rides with Wave 3; W2-5
  proves the dedup arithmetic now, but the Y-path privacy oracle over a real
  binding is filed with Wave 3, not this wave. Owner: test-author (Wave 3).
  Instrument: `github-repos.ts:619`, `repoGradesRows.ts:119`. Step: Wave 3.
- **R-UX-3 (from the UX doc) - the two Copy controls must be independent
  component instances.** Owner: architect (settled: the new leaf is a separate
  component with its own local state) + test-author. Instrument:
  `classTrendsDraftState.ts:54-56` (`copy-settled` mutates whatever state it is
  given). Step: because no component renders here, the "clicking one Copy does
  not flip the other's status text" property is OV-4 (owner walk), NOT
  machine-checkable. The MACHINE-checkable half is a source-text assertion that
  the leaf holds its OWN `useState` (or the class-draft panel's state is not
  passed into the leaf) - flag to the implementer; I do not over-specify the
  state shape here. Recorded so it is not mistaken for covered by a unit test.

---

## 7. What this pass could NOT determine, stated plainly

- Whether option X or Y ships on the repo surface is the OWNER's fork
  (architecture section 5). This pass authors Wave 2 under X; W2-5 tests the
  `resolved` seam so that if Y is later chosen the dedup is already proven.
- No component renders under vitest and there is no API key. Every pixel /
  focus / legibility / real-model claim (OV-SUBSET-1, OV-2/4/5/6) is an owner
  walk. W2-14..W2-17 prove import/mount/attribute wiring; they never prove the
  screen.
- Whether the architect adopts R-T2's compile-time exclusion. I recommend it
  and record the residual; I do not decide the composer's parameter type (the
  architect's lane). Until then the runtime + static privacy pair is the
  enforcement, and I state its limit (W2-11 catches the field being named, not
  every indirection).
- The exact subset-clause prose and the leaf's JSX layout are UX +
  implementer's; this pass pins the FACTS (own denominator, "students" noun,
  name-free, name-consuming leaf) and the frozen numeric oracles, never the
  spelling - except the load-bearing substrings `"3 of 3"` / `"students"`
  (W2-9) and the seeded markers (W2-10/W2-13), where the exact text IS the
  fact under test.
