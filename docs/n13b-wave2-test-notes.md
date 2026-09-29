# N13b Wave 2 test notes and frozen oracles (feature core, option X)

Seat: `loop-test-author`. Round 1 of 2 (`docs/AGENTS.md` "Two rounds, then
ask") - REVISED 2026-09-29 to apply the round-1 check's accepted findings. A
fresh `loop-checker` gates this before any implementer writes test code. This
document decides WHAT IS MEASURED and HOW IT FAILS for Wave 2 of N13b - the
subset count + instructor named list under option X. It authors no production
code and no test code; it authors the notes an implementer (`loop-implementer`)
writes tests from, plus the frozen oracles and the sabotage design.

**What this revision changed (targeted; the checker validated the rest as sound
and it is NOT reopened):** (1) BLOCKER - R-T2 PROMOTED to requirement per
ORCHESTRATOR RULING 2026-09-29 (`docs/n13b-waves.md` R8, `docs/n13b-architecture.md`
section 2/AC-8): W2-11 is now a COMPILE-ERROR `@ts-expect-error` proof against
the narrowed `Omit<ClassTrendsReport, "instructorAttribution">` composer param
(the old source-text token scan was self-contradictory - the Omit signature
names the token - and is retired to optional body-only W2-11b); section 3, W2-11,
W2-11b, and the R-T2 residual rewritten. (2) INFO-2 - the R-UX-1 gap filled:
NEW W2-18 (distinct Copy labels) and W2-19 (three-way empty-state branch). (3)
Minor: INFO-1 (W2-17 cross-file binding caveat), INFO-3 (per-result key is
userId-or-index, not `.student`), INFO-4 (load-bearing substring coordination).
UNCHANGED and NOT reopened: W2-1..W2-9 arithmetic oracles, the INFO-2
`knownIdentifiers` guard W2-7/W2-13, W2-10, W2-12, W2-14..W2-17, the
satisfiability proof (section 1), and the hygiene notes.

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

**What the reference could NOT prove (stated plainly):** it is pure TypeScript
with an inline composer, so it does not exercise the SOURCE-TEXT / AST wiring
requirements (W2-14..W2-19), the COMPILE-TIME privacy exclusion (W2-11, which
needs the real narrowed composer signature and a `tsc` run) or the optional
body-only scan (W2-11b) - those depend on the real files existing and are
ARGUED against the current tree, not executed here. See section 2.

---

## 2. What is executable here vs what is only argued

Per `docs/loop/this-repo.md` section 6 and MEMORY: vitest here is node-env and
renders NO component. Nothing below that names a rendered pixel, focus order or
contrast is machine-checkable; those are owner-verification (OV) items.

**Executable here (proven satisfiable in section 1, and the implementer runs
them for real against `class-trends.ts`/`class-trends-draft.ts`):** W2-1..W2-10,
W2-12, W2-13. (W2-11 moved to compile-time - see below - and W2-11b is an
optional source-text scan.)

**Argued against the tree, not executed by me (the implementer's test code is
what executes them; I reason they discriminate from the current source):**
W2-11 (the COMPILE-TIME `@ts-expect-error` exclusion - its direction-of-failure
is a `tsc` TS2578, not a vitest assertion; it needs the real narrowed composer
signature, which does not exist yet, so it is RED-by-construction and argued),
W2-11b (the optional body-only source scan), W2-14 (panel mounts leaf +
`.student` ban), W2-15 (leaf reads the attribution content), W2-16 (8th canary-3
root), W2-17 (B1 repo-mount identity), W2-18 (distinct Copy labels), W2-19
(three-way empty-state branch, source-text half). I argue each one's
discrimination; I do not execute them.

**OV only (route to owner walk, never asserted machine-checkable):** the two
Copy buttons read as visually distinct (OV-2/OV-5), tab order and focus of the
new leaf's controls (OV-4), light/dark legibility (OV-6), and that the named
list actually appears on screen for a real run (OV-2). These are already
recorded in `docs/n13b-ux.md` section 8 and `docs/n13b-acceptance-criteria.md`
OV-1/OV-2; this pass adds none and relocates nothing to a machine check that
cannot honestly be one.

---

## 3. The privacy boundary: the compile-time name exclusion is now REQUIRED (ORCHESTRATOR RULING 2026-09-29)

Round 1 of this pass found that "type separation" was only PARTIAL under the
composer's original signature: `composeClassTrendsDraft(report:
ClassTrendsReport, ...)` (`class-trends-draft.ts:132-136`, opened) receives the
whole report, and Wave 2 puts the names on
`ClassTrendsReport.instructorAttribution` (architecture 4.3) - a SIBLING field
of the type the composer already receives. So `report.instructorAttribution`
was reachable inside the composer; reading it was NOT a compile error, and
AC-8's "strongest form" / security R8 part (b) ("the excluded state must be a
compile error") were NOT achieved by the original shape.

The orchestrator ruled on that finding (2026-09-29, recorded in
`docs/n13b-waves.md` R8 and `docs/n13b-architecture.md` section 2 / AC-8):
PROMOTE R-T2 into Wave 2. The composer's first parameter is NARROWED to
`Omit<ClassTrendsReport, "instructorAttribution">` (or a dedicated
`ClassTrendsDraftInput`), so ANY read of a name inside the composer is a
compile error. The sole non-test caller (`ClassTrendsDraftPanel.tsx:46`,
opened) passes a full `ClassTrendsReport`, assignable to the Omit view by
structural subtyping, so the caller is unaffected and `.length` stays 3 (W2-12
unchanged). Nothing the composer needs lives on that field - the subset CLAUSE
the class draft renders is computed from `AreaTrend.missedSubset` (numbers
only).

So the privacy boundary for the NEW subset path now rests on a compile-time
instrument, plus one runtime instrument for defense-in-depth, plus one optional
text tripwire:

1. **W2-11 (compile-time, PRIMARY, load-bearing):** with the composer's first
   parameter narrowed, `report.instructorAttribution` inside a
   composeClassTrendsDraft-typed context does NOT type-check. Proven by a
   `@ts-expect-error` assertion that goes RED (a `tsc` TS2578
   "unused '@ts-expect-error' directive" error, failing the type gate) the
   moment the parameter is widened back to full `ClassTrendsReport`. This is the
   "make the bad state unrepresentable" form the seat brief demands - not a
   denylist over source text.
2. **W2-10 (runtime, defense-in-depth):** a name placed on
   `report.instructorAttribution` never appears in the returned Markdown.
   Proven to discriminate the "composer renders `instructorAttribution`"
   mutation (section 1, S-PRIV-LEAK RED). Kept as-is: it catches a leak through
   any indirection the type system cannot see (e.g. a cast to `any`), which the
   compile-time assertion alone does not. The seeded name MUST NOT also be in
   `knownIdentifiers`, or Wave 1's substring filter masks the leak and the
   oracle passes on the broken code too (the "privacy oracle that can't fail"
   trap - see W2-10's construction).
3. **W2-11b (source-text, OPTIONAL belt-and-braces):** a BODY-ONLY scan of the
   composer (its function body, EXCLUDING its signature) never contains the
   token `instructorAttribution`. See W2-11b's construction for why a
   whole-source scan is now WRONG.

**The self-contradiction round 1 surfaced, and why the instrument changed.**
Once the parameter is `Omit<ClassTrendsReport, "instructorAttribution">`, the
composer's SIGNATURE itself contains the literal token `instructorAttribution`
(inside the `Omit<...>`). A pure "the token never appears in the composer's
source" scan (the original W2-11) would therefore FALSE-POSITIVE on the very
fix that closes the hole - the guard would go RED on correct code. That is
exactly the "instrument that does not measure what it claims" class this seat
exists to prevent. The compile-error assertion is immune to it (it measures
type-reachability, not text), which is why it is now the primary instrument and
the whole-source token scan is retired in favor of the body-only optional
W2-11b.

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
score)])`.

DISTINCT-STUDENT KEY, corrected per architecture 4.1 (`class-trends.ts` around
:194-197, opened): under the DEFAULT `per-result` identity the distinct-student
key is `userId != null ? "u:" + userId : "i:" + index`, NOT the `.student`
string. So one graded result IS one distinct student (AC-1, Canvas invariant) -
but distinctness is STRUCTURAL (each result is its own key by userId-or-index),
NOT derived from distinct `.student` VALUES. Consequence for these fixtures: the
count is over results, so N results on an area give N distinct keys even if two
share a `.student` string; the `.student` string is only the source of the
displayed name (W2-6's `displayName`), never the dedup key. The implementer's
per-result fixtures may therefore leave `userId` unset (distinct by index) or
set distinct `userId`s; either yields distinct keys. Only the `resolved` path
(W2-5) collapses two results to one key, and only via its explicit `keyOf`.

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

Instrument for W2-8..W2-10, W2-11b, W2-12, W2-13 (single file, runtime):
`npm run test:paths src/lib/grade/class-trends-draft.test.ts`. W2-11 lives in
the SAME file but its direction-of-failure is the `tsc` type gate (the
`@ts-expect-error` becoming an unused-directive error), NOT the vitest run - see
W2-11's Instrument row.
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
- COORDINATION (INFO-4): the substrings `"3 of 3"`, the connective `" of "`, and
  the noun `"students"` are LOAD-BEARING here - this is the frozen-copy-literal
  exception where the exact spelling IS the fact under test. The UX/implementer
  MUST render the class-draft subset clause with that exact `"<N> of <M>
  students"` shape, and the instructor named-list line (W2-19 / UX section 3,
  `"<DisplayArea> - <N> students missed points: ..."`) MUST use the SAME
  `"students"` noun for the SAME count, so the two counted outputs read as one
  fact. If the UX changes this wording, W2-9 and W2-19's substrings change in the
  same commit - they are not independent spellings.

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

**W2-11 - PRIVACY (compile-time, PRIMARY): a name is UNREACHABLE through the
composer's input type (AC-8 / security R8 part (b); ORCHESTRATOR RULING
2026-09-29, promoting R-T2 into Wave 2).**
- Object: whether `instructorAttribution` is a property of
  `composeClassTrendsDraft`'s first parameter type - i.e. whether reading it
  inside a composer-typed context type-checks.
- Instrument: `tsc` (the pre-push type gate), triggered from the `.test.ts`
  file under `src/` (`class-trends-draft.test.ts`) so the assertion is in the
  compiled set. The vitest run of that file is incidental; the direction-of-
  failure signal is the tsc error, NOT a runtime `expect`.
- Direction: RED (a `tsc` TS2578 "unused '@ts-expect-error' directive" error,
  failing the type gate) if the parameter is widened back to `ClassTrendsReport`
  (or otherwise made to carry `instructorAttribution`); GREEN (the directive is
  used, tsc clean, vitest passes) under the
  `Omit<ClassTrendsReport, "instructorAttribution">` parameter.
- Construction (pins the FACT, tolerates the spelling of the param type):
  reference the composer's ACTUAL first-parameter type via
  `Parameters<typeof composeClassTrendsDraft>[0]` - which resolves to the Omit
  view whether the implementer writes an inline `Omit<...>` or a named
  `ClassTrendsDraftInput` alias - and attempt to read the banned field under the
  directive:
  ```
  const draftInput = {} as Parameters<typeof composeClassTrendsDraft>[0];
  // @ts-expect-error instructorAttribution must be unreachable via the composer
  // input type (AC-8 / R8 part b): reading it here MUST be a compile error, so
  // this directive MUST be "used".
  void draftInput.instructorAttribution;
  ```
  When the parameter omits the field, `draftInput.instructorAttribution` is a
  property-does-not-exist error, the directive is consumed, tsc is clean and
  vitest passes. When the parameter is the full report, the read compiles, the
  directive is UNUSED, and tsc emits TS2578 - the type gate goes RED. This is
  RED-by-construction today (the narrowed type does not exist yet), the same
  honest footing as every other Wave-2 assertion (section 0).
- Sabotage: widen the composer's first parameter back to `ClassTrendsReport`.
  RED (TS2578 at the directive; the type gate fails). GREEN on restore.
  **Discriminates** - and it discriminates the EXACT hardening the ruling
  requires, at the type level, which no source-text scan can.
- Attack on my own guard (argued, since the narrowed type is not in the tree
  yet): a naive version pinning `Parameters<...>[0]` to a hand-named type would
  break if the implementer renames the alias, and a whole-source token scan
  would break because the `Omit<..., "instructorAttribution">` signature NAMES
  the token (section 3's self-contradiction). `Parameters<typeof
  composeClassTrendsDraft>[0]` + the compile-error read avoids both, and the
  `Parameters<...>` form drives the REAL exported signature (seat practice 3:
  drive the production path, do not reach past the seam).
- HONEST LIMIT: this is a compile-time property-reachability guard. It does NOT
  catch a leak that first casts the value to `any`/`ClassTrendsReport` inside
  the body - that indirection is caught by W2-10 (runtime). The two together
  are the enforcement; neither alone is.

**W2-11b - PRIVACY (source-text, OPTIONAL belt-and-braces): the composer BODY
never names `instructorAttribution`.**
- Object: the comment-stripped BODY of `composeClassTrendsDraft` (its statements
  between the `{` that opens the function and its matching close), EXCLUDING the
  signature, versus the token `instructorAttribution`.
- Direction: RED if `instructorAttribution` appears in the body (not the
  signature, not comments).
- Construction (ANCHOR-RESOLVES AT BOTH ENDS, per the slice trap): DUPLICATE the
  `stripComments` helper from `classTrends.wiring.test.ts:37-39` verbatim (split
  + UNANCHORED `/\/\/.*$/` + block-comment `/\/\*[\s\S]*?\*\//g`) - do NOT
  import it, do NOT use the anchored trailing-comment-blind form. Read
  `class-trends-draft.ts`, strip. Locate the signature start
  `sigIdx = stripped.indexOf("export function composeClassTrendsDraft(")` and
  assert `sigIdx > -1`; find the body-opening brace - the first `{` AFTER the
  return-type close `)` that follows `sigIdx` - and assert THAT anchor resolved
  (`> -1`); find the END - the next top-level `export function` after the body
  open, or end-of-string - and assert the end anchor resolved (NEVER
  `slice(start, -1)` on an unresolved index, the widened-slice trap). Slice
  body-open..end and assert the BODY slice does not contain
  `instructorAttribution`.
- Sabotage: add `const names = report.instructorAttribution;` to the composer
  BODY. RED. GREEN on restore. **Discriminates.**
- WHY OPTIONAL, and why NOT the primary: a whole-source scan is now WRONG (the
  `Omit<..., "instructorAttribution">` signature names the token, so it
  false-positives on the fix - section 3). A body-only scan avoids that but
  needs the fragile signature/body slice above; W2-11 (compile-time) measures
  the same property with NO slice and is immune to spelling. Ship W2-11b only if
  the implementer wants the extra text-level tripwire; W2-11 is the requirement.

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
  a named binding DECLARED within `index.tsx` (e.g. `const identity = { kind:
  "unavailable", reason };`), the test must resolve that binding within
  `index.tsx` and assert the same `kind` - so pin the FACT (the mount receives an
  `unavailable`-kinded identity), tolerating either spelling. A coarse
  `INDEX_SOURCE.includes('"unavailable"')` is FORBIDDEN as the sole check: it
  passes even when the literal is unconnected to the mount (a vacuous guard); the
  attribute-to-value tie is what discriminates.
- INFO-1 (cross-file binding caveat, stated so the implementer does not ship a
  vacuous guard): if the identity is IMPORTED from another module (e.g.
  `classTrendsFolderEntry.ts`) rather than inlined or declared in `index.tsx`,
  then resolving the binding WITHIN `index.tsx` reaches only the `import`
  statement, not the object literal - the `kind: "unavailable"` value lives in
  the OTHER file, and this AST test cannot tie attribute-to-value from
  `index.tsx` alone. Two acceptable resolutions, and the implementer MUST pick
  one, never leave it ambiguous: (a) PREFERRED and PRIMARY - inline the identity
  at the mount (`identity={{ kind: "unavailable", reason }}`) or declare it as a
  `const` in `index.tsx`, so the tie resolves in one file; (b) if the value is
  genuinely defined cross-file, the test must FOLLOW the import to the defining
  module and assert the `kind: "unavailable"` string literal THERE, tied to the
  exported binding the mount's attribute references - a bare
  `INDEX_SOURCE.includes` remains forbidden. The primary inline construction
  above stands as the expected shape; (b) is the fallback only if the architect
  moves the literal out of `index.tsx`.
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

**W2-18 - INFO-2 / R-UX-1(a): the two Copy controls carry DISTINCT labels -
"Copy class announcement" (the renamed existing button) and "Copy student list"
(the new instructor-list button) - and never both read "Copy".** Files:
`src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts` (the
renamed existing button, over `ClassTrendsDraftPanel.tsx`) and
`src/app/components/drafted-grades/classTrends.wiring.test.ts` (the new button,
over `ClassTrendsStudentListPanel.tsx`).
- Object: the two Copy button label strings, versus each other and versus the
  bare "Copy" both read today.
- Instrument (TWO test files -> `test:paths`, never a raw multi-path vitest):
  `npm run test:paths src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts src/app/components/drafted-grades/classTrends.wiring.test.ts`.
- Direction: RED if `ClassTrendsDraftPanel.tsx` does not contain the exact label
  `Copy class announcement` (the R-UX-5 rename did not land), OR the new leaf
  does not contain the exact label `Copy student list`, OR the two label strings
  are equal.
- Construction (FROZEN-COPY-LITERAL exception - the labels ARE the fact under
  test, so the exact spelling is pinned on purpose): in
  `classTrendsDraft.wiring.test.ts`, over the already-read `strippedDraftPanel`,
  assert `strippedDraftPanel.includes("Copy class announcement")`. NOTE the
  ready-branch button today renders the child text `Copy` split across lines
  (`ClassTrendsDraftPanel.tsx:100-102`, opened: `>` on 100, `Copy` on 101,
  `</Button>` on 102), so `>Copy<` is NOT a contiguous substring and the
  existing `:92` `not.toContain(">Copy<")` passes VACUOUSLY - do NOT reuse that
  idiom to prove the rename; assert the POSITIVE full literal
  `"Copy class announcement"` instead, which only the renamed button produces.
  In `classTrends.wiring.test.ts`, over the leaf's stripped source (already read
  for W2-15), assert `leafSource.includes("Copy student list")`. Then assert the
  two literals differ (`"Copy class announcement" !== "Copy student list"`,
  stated as the FACT that no two Copy buttons share a label).
- Sabotage A: skip the rename (leave the child text `Copy` in the draft panel).
  RED (the `"Copy class announcement"` literal is absent). GREEN on restore.
  **Discriminates.**
- Sabotage B: label the new leaf button `Copy` (or `Copy list`). RED (the
  `"Copy student list"` literal is absent). GREEN on restore. **Discriminates.**
- Attack on my own guard: a version asserting only that both files contain the
  token `"Copy"` would pass on TWO identical bare "Copy" buttons - the exact
  ambiguity R-UX-5 exists to forbid. Pinning the two FULL distinct literals is
  what makes "never both read Copy" enforceable; the shared prefix is not
  asserted.
- OV BOUNDARY: that the two buttons READ as visually distinct on screen and are
  spatially separated (the AC-8 direction: the class-announcement control sits
  far from the names) is OV-2/OV-5 (`docs/n13b-ux.md` section 8) - source-text
  proves the LABELS differ, never the pixels or the layout distance.
- R-UX-5 coordination: the rename and the new button ship in the SAME commit
  (R-UX-5, `docs/n13b-waves.md:626-631`); this requirement goes RED if either is
  missing, so it is the machine enforcement of "the two labels never both read
  Copy."

**W2-19 - INFO-2 / R-UX-1(b): the three-way empty-state branch renders the right
control in each state (source-text half; the render itself is OV).** File:
`src/app/components/drafted-grades/classTrends.wiring.test.ts` (reads the leaf
`ClassTrendsStudentListPanel.tsx` and the panel `ClassTrendsPanel.tsx` stripped
sources).
- The three states (from `docs/n13b-ux.md` section 4, lines 278-302):
  1. `report.areas.length === 0`: the new section renders NOTHING - it shares the
     panel's EXISTING `report.areas.length === 0 ? <no-results> : <sections>`
     conditional (`ClassTrendsPanel.tsx:143`), so only ONE empty message shows.
  2. areas exist but `instructorAttribution.length === 0` (no area cleared the
     `>= 3` subset threshold): a `styles.fieldHint` line, NO heading, NO Copy
     button.
  3. `instructorAttribution.length > 0`: heading + per-area lines + the
     "Copy student list" button.
- Object / Instrument: the leaf's and panel's comment-stripped sources; single
  file, `npm run test:paths src/app/components/drafted-grades/classTrends.wiring.test.ts`.
- Direction: RED if (A) the leaf renders the "Copy student list" button
  UNCONDITIONALLY (no emptiness branch on its attribution prop -> a heading with
  nothing under it, the exact defect UX section 4 warns of), OR (B) the leaf
  mount appears inside the panel's areas-EMPTY arm (-> two stacked empty
  messages in state 1).
- Construction (A) - STATE 2 vs 3, leaf owns the branch (it receives
  `instructorAttribution` and renders the button, UX section 3 line 216-217).
  The HONEST machine-checkable pair, and its limit:
  (i) PRIMARY: assert the leaf's stripped source contains an emptiness test on
  its attribution prop - a match for
  `/instructorAttribution\b[\s\S]{0,60}\.length|\.length\s*===\s*0|\.length\s*>\s*0/`
  (pin the FACT that an emptiness branch EXISTS; tolerate the prop being
  destructured/renamed and the `=== 0` vs `> 0` vs `?`/`&&` spelling). (ii)
  SUPPORT (best-effort slice, model on `classTrendsDraft.wiring.test.ts:82-93`):
  `emptyIdx = leafSource.search(<the length-test regex>)`, assert `emptyIdx > -1`;
  find the arm boundary after it (the next `:` / `)` / `return` that closes the
  empty arm) and assert THAT anchor resolved (`> -1`, never `slice(start, -1)`);
  assert the empty-arm slice contains NEITHER `"Copy student list"` NOR a
  per-student `.map(`. (iii) assert the leaf DOES contain `"Copy student list"`
  and a `.map(` somewhere (state 3 renders them).
- Construction (B) - STATE 1, panel gates the mount: over the panel's stripped
  source, locate `report.areas.length === 0` and assert `> -1`; slice the EMPTY
  consequent (from the `?` after that test to its matching `:`, both anchors
  asserted to resolve) and assert it does NOT contain `ClassTrendsStudentListPanel`
  (the leaf is mounted only in the non-empty arm). The panel's areas-empty
  consequent is a single short `<span>` today (`ClassTrendsPanel.tsx:143-144`,
  opened), so this slice is robust.
- Sabotage A (state 2/3): make the leaf render its heading + "Copy student list"
  button UNCONDITIONALLY, deleting the emptiness branch entirely. RED - the
  length-test anchor (i) no longer matches AND the (ii) slice `emptyIdx > -1`
  fails; both go RED (anchor ABSENCE -> RED, the safe direction, never a
  false-GREEN). GREEN on restore. **Discriminates** the "no branch at all" defect
  - the one UX section 4 actually warns of.
- Sabotage B (state 1): move the `<ClassTrendsStudentListPanel` mount into the
  panel's areas-empty consequent (or mount it unconditionally). RED (the
  empty-consequent slice now contains `ClassTrendsStudentListPanel`). GREEN on
  restore. **Discriminates.**
- ATTACK ON MY OWN GUARD, and the honest limit I will NOT overclaim: (i)+(iii)
  discriminate the "unconditional render, no branch" defect (Sabotage A). But an
  impl that KEEPS an emptiness branch yet routes the button into the WRONG arm -
  or that has a STRAY unused `instructorAttribution.length` reference while
  rendering the button unconditionally - can defeat (ii)'s heuristic arm-slice
  and pass (i). So (ii) is SUPPORT, not load-bearing, and W2-19 does NOT claim to
  prove the button sits in the CORRECT arm. That "right control in the right
  state" fact is a RENDER fact and is OV (below). Asserting merely that the leaf
  "references `instructorAttribution`" would measure NOTHING (the prop is
  referenced either way); (i) is the minimum that ties "an emptiness branch
  exists" to the RED-on-deletion behaviour, and I keep it as the primary.
- OV BOUNDARY (per the seat rule: no requirement whose only honest enforcer is a
  render): that each state ACTUALLY renders the right control on screen, that the
  button sits in the non-empty arm, that exactly ONE empty message shows in state
  1, and that the state-2 fieldHint reads as this app's voice, are OV (route to
  OV-SUBSET-1 / `docs/n13b-ux.md` section 8). The exact empty-state PROSE is UX's
  to own and is NOT pinned here (source-text over-specification trap); only the
  existence of the emptiness branch, the button/list presence, and the panel
  mount-gating are asserted machine-side.

### Multi-file gate command

The Wave 2 gate runs all the above executable + argued files in ONE credited
run (`docs/n13b-waves.md` section 5, Wave 2 gate step 4), spelled with
`test:paths` so no path is silently dropped:

```
npm run test:paths src/lib/grade/class-trends.test.ts src/lib/grade/class-trends-draft.test.ts src/app/components/drafted-grades/classTrends.wiring.test.ts src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts src/app/components/repo-grades/classTrendsFolderEntry.test.ts src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts src/app/components/grading-recording/classTrendsRunCohort.test.ts
```

Expect a `COVERED` line per path, all passing. `classTrendsRunCohort.test.ts`
is in the set as a REGRESSION reader (its field bans must stay green). W2-18 and
W2-19 land in `classTrends.wiring.test.ts` / `classTrendsDraft.wiring.test.ts`,
both already in this set. W2-11's direction-of-failure is the SEPARATE `tsc`
type gate (the `@ts-expect-error` unused-directive error), NOT this vitest run -
a green vitest sweep here does NOT prove W2-11; the type gate must run and pass
too.

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
| W2-11 | widen composer 1st param back to full `ClassTrendsReport` | W2-11 (tsc TS2578 unused-directive) | yes | yes | argued (compile-time) |
| W2-11b | composer BODY reads `instructorAttribution` | W2-11b | yes | yes | argued (optional) |
| W2-12 | add 4th param to composer | W2-12 | yes | yes | argued |
| W2-13 | INFO-2 gate (end-to-end) | W2-13 | yes | yes | argued (same mutation as W2-7) |
| W2-14A | delete leaf mount from panel | W2-14 | yes | yes | argued |
| W2-15 | leaf ignores its prop | W2-15 | yes | yes | argued |
| W2-16A | leaf imports `@/lib/gemini` | W2-16 | yes | yes | argued |
| W2-16B | remove leaf from `roots` | W2-16 | yes | yes | argued |
| W2-17A | delete `identity=` from mount | W2-17 | yes | yes | argued |
| W2-17B | pass `kind:"per-result"` | W2-17 | yes | yes | argued |
| W2-18A | skip the R-UX-5 rename (leave bare "Copy") | W2-18 | yes | yes | argued |
| W2-18B | label new leaf button "Copy" not "Copy student list" | W2-18 | yes | yes | argued |
| W2-19A | leaf renders heading+button unconditionally | W2-19 | yes | yes | argued |
| W2-19B | mount leaf in panel's areas-empty arm | W2-19 | yes | yes | argued |

No sabotage above is RED-in-both-directions or GREEN-in-both-directions. Two
places I explicitly bound a guard's honesty: (1) the naive privacy oracle that
seeds the marker into `knownIdentifiers` too (W2-10's construction note) passes
on correct AND broken code because Wave 1's filter masks the leak - it measures
nothing and must not be written; and (2) W2-19's sub-assertion (ii) (the leaf
empty-arm slice) is SUPPORT, not load-bearing - it can be defeated by a stray
`instructorAttribution.length` reference, so W2-19 discriminates the "no branch
at all" defect (via (i), Sabotage A) but does NOT claim to prove the button sits
in the correct arm; that render fact is OV-SUBSET-1. Both rows in the table
above for W2-19 (A/B) discriminate the DEFECT they name; the honest limit is on
the CLAIM, not the discrimination.

---

## 6. Residual register (owner + instrument + step; missing any one is a deletion)

Handed to the orchestrator to record under N13b in `docs/BACKLOG.md` at
disposal/push (a residual not in the backlog does not exist -
`iteration-caps.md` anti-gaming).

- **R-T2 (extends R8 / BLOCKER-2) - PROMOTED to requirement W2-11 (compile-error
  form) by ORCHESTRATOR RULING 2026-09-29.** No longer a deferred residual: the
  compile-time name exclusion is now REQUIRED in Wave 2. The architect narrows
  `composeClassTrendsDraft`'s first parameter to
  `Omit<ClassTrendsReport, "instructorAttribution">` (or a `ClassTrendsDraftInput`)
  and the test-author proves the excluded read is a `tsc` error via the
  `@ts-expect-error` assertion of W2-11 (section 4, Group B). Instrument:
  `class-trends-draft.ts:132-136` (the composer signature, narrowed),
  `class-trends-draft.ts:69-72` (the existing parameter-type-exclusion precedent
  for `renderCountedClause`). Step: LANDS IN WAVE 2 as W2-11; W2-10 (runtime) is
  retained defense-in-depth and W2-11b (body-only source scan) is the optional
  tripwire. Recorded here as PROMOTED so the register shows the ruling was
  applied, not silently dropped.
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
- **R-UX-1 (from the wave plan) - DISCHARGED into W2-18 + W2-19.** The wave plan
  (`docs/n13b-waves.md:610-612`) assigned the test-author to author, for Wave 2,
  (a) the two distinct Copy labels and (b) the three-way empty-state branch.
  Both are now authored: (a) is W2-18 (distinct Copy labels, source-text), (b) is
  W2-19 (three-way empty state, source-text half; the render is OV-SUBSET-1).
  Owner: test-author (done, this pass) + implementer (writes the tests). The
  purely visual halves (buttons read as distinct, exactly one empty message
  shows, contrast/legibility) remain OV under OV-SUBSET-1. No residual work
  remains under R-UX-1 beyond the implementer executing W2-18/W2-19 and the OV
  walk; recorded here so the discharge is visible, not assumed.

---

## 7. What this pass could NOT determine, stated plainly

- Whether option X or Y ships on the repo surface is the OWNER's fork
  (architecture section 5). This pass authors Wave 2 under X; W2-5 tests the
  `resolved` seam so that if Y is later chosen the dedup is already proven.
- No component renders under vitest and there is no API key. Every pixel /
  focus / legibility / real-model claim (OV-SUBSET-1, OV-2/4/5/6) is an owner
  walk. W2-14..W2-19 prove import/mount/attribute/label/branch wiring by
  source-text; they never prove the screen (W2-18's distinctness and W2-19's
  actual per-state render are OV-SUBSET-1).
- R-T2 is RESOLVED, not open: the ORCHESTRATOR RULING 2026-09-29 adopted the
  compile-time exclusion, so the composer's first-parameter type is now the
  architect's decided shape (`Omit<ClassTrendsReport, "instructorAttribution">`
  or `ClassTrendsDraftInput`) and W2-11 proves it as a `tsc` error. What this
  pass still cannot execute is W2-11 itself - the narrowed type does not exist in
  the tree yet, so W2-11 is RED-by-construction and argued, not run by me; the
  implementer runs it against the real narrowed signature. W2-10 (runtime) +
  W2-11b (optional body scan) remain as defense-in-depth; W2-11's honest limit
  (it does not catch an in-body cast to `any`) is stated in its HONEST LIMIT row.
- The exact subset-clause prose and the leaf's JSX layout are UX +
  implementer's; this pass pins the FACTS (own denominator, "students" noun,
  name-free, name-consuming leaf) and the frozen numeric oracles, never the
  spelling - except the load-bearing substrings `"3 of 3"` / `"students"`
  (W2-9) and the seeded markers (W2-10/W2-13), where the exact text IS the
  fact under test.
