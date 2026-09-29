# N13b acceptance criteria

Area: grading-run-survival-and-disclosure. Kind: feature. Source row:
`docs/backlog.yml:199-210` (parsed as one single-quoted note, not grepped).
Seat: `loop-ac`. This is the acceptance-criteria round only - no mechanism, no
oracle construction, no wave plan. A fresh `loop-checker` reads this before any
consumer acts on it.

## The owner's words (the thing everything below is measured against)

- Verbatim, 2026-09-15: "make the draft more worthwhile. even in a class of 9
  where 4 students miss the same area of the homework in a way that doesn't meet
  the current criteria for drafting an announcement, it's still worth sending
  out an announcement or contacting those 4 students individually".
- Verbatim, threshold, 2026-09-15: "honestly, i want any trend where three or
  more students missed points on the same sections called out".
- The row's own gloss the owner set and must not be re-opened: THREE OR MORE
  STUDENTS is an ABSOLUTE COUNT (3 of 4 and 3 of 30 both qualify); "MISSED
  POINTS" is ANY DEDUCTION, not the existing low-score (<=60) rule; the subset
  call is ADDITIVE to the existing high/low direction, not a replacement.

When a criterion below and the owner's sentence diverge, the sentence wins.

## Why the current feature says nothing (measured, not recalled)

`classifyDirection` (`src/lib/grade/class-trends.ts:184-205`) reads
"consistently" literally: an area is "low" only when EVERY percent value is
`<= LOW_PERCENT_THRESHOLD` (`:200`, `LOW_PERCENT_THRESHOLD = 60` at `:115`), and
"high" only when every value is `>= HIGH_PERCENT_THRESHOLD` (`:196`,
`HIGH_PERCENT_THRESHOLD = 70` at `:114`). 4 of 9 low is neither, so it renders
`mixed` and no clause. On top of that, `composeClassTrendsDraft` filters every
counted clause through `areaFullyCovered` (`class-trends-draft.ts:144`, gate at
`:65-67`), which requires `resultsWithArea === report.totalResults`. So even a
real subset pattern is suppressed unless every graded result covered the area.
Both are why the modal output today is the opening sentence and nothing else.

---

## Leverage claim (feature-work trigger fired; one paragraph + one criterion)

Class: **GUARANTEED**, compounding **ATTRIBUTION**
(`docs/loop/leverage.md:44,43`). The subset call-out is a COUNTED fact the code
holds regardless of any model - the count of distinct students who missed points
on one area is computed in TypeScript from typed, parsed per-area scores
(`ParsedScore`, `class-trends.ts:60-63`), and layer C makes no model call
(REGRESSION 423; enforcer `classTrendsDraft.not-postable.test.ts`). It NAMES the
exact students to the instructor by construction (identity is already carried on
every result: `GradeResult.student`, `types.ts:213`), and it makes a student
name in the class-addressed announcement a caught/unrepresentable state rather
than a hope. What the instructor does instead today: pastes the grades into a
chat and asks "which students struggled with section X". The chat returns
plausible prose that (a) is not a real count tied to a stated denominator - it
can say "several students" with no number behind it - and (b) has nothing
stopping it from naming a student inside a draft the instructor will send to the
whole class. This feature earns both: the count is arithmetic over typed data,
and the class/instructor name split is enforced by code, not by prompt wording.

**Leverage removal criterion: AC-8** (the privacy oracle). It goes RED when the
name-safety construction is removed. The second leg (counted, not generated) is
protected by the existing no-model enforcer named in AC-10; verifying that
enforcer's current content is relocated to the test seat (see Residuals R4).

---

## Criteria

Each names three things: the OBJECT under comparison, the INSTRUMENT that
produces each quantity, and the DIRECTION of failure. Instruments are node-env
vitest unit tests over pure functions and source-text wiring tests - **no
component is rendered by any test in this repo**, so every rendering/keyboard
claim is called out as an owner-verification item, never asserted machine-checkable.

### Settled by the owner or by orchestrator ruling - encoded as fixed criteria

**AC-1 - the subset signal exists as a counted, per-area quantity, counted over
DISTINCT STUDENTS.**
- Object: for each rubric area, the count of DISTINCT STUDENTS who missed points
  on that area, versus the count re-derived from the run's parsed per-area
  scores. The count is over students, not submissions: the owner's rule is
  "THREE OR MORE STUDENTS," so the numerator's identity basis is the student, not
  the graded row. On the Canvas path these coincide (one submission per student),
  but on the Repo Grades surface (AC-12) they can diverge:
  `GradeResult.student = label?.trim() || digest.fullName`
  (`github-repos.ts:619`) is the REPO, not the roster student, so two repos owned
  by one student, or unbound repos, can turn 2 students into 3 submissions.
  Deduplicating submissions to roster students for the COUNT is relocated to the
  architect (see Residual R3).
- Instrument: a unit test over the layer-A compute path
  (`src/lib/grade/class-trends.test.ts`) feeding a hand-built `GradingRunEntry`.
- Direction: RED if the exposed missed-points count for an area differs from the
  number of DISTINCT STUDENTS whose parsed score for that area established a
  deduction (per AC-4). On the repo surface, RED if two submissions from one
  roster student are counted as two toward the threshold.

**AC-2 - threshold is an absolute count of three or more DISTINCT STUDENTS.**
- Object: whether an area is flagged as a subset trend, versus the predicate
  `missedStudentCount >= 3` (an integer count of distinct students per AC-1,
  independent of class size). Because the count is over students, not
  submissions, a repo-surface run where 2 roster students produced 3 submissions
  on the area must NOT flag (2 < 3), and this is the divergence AC-1 names and R3
  routes to the architect.
- Instrument: unit test with fixtures at a distinct-student count of 2 and of 3
  in a class of 4 and in a class of 30.
- Direction: RED if a 2-student area is flagged, or if a 3-student area is not
  flagged at any class size (3 of 4 and 3 of 30 must both flag), or if a
  submission count of 3 arising from 2 distinct students flags.

**AC-3 - "missed points" is any deduction, and the change is additive.**
- Object: (i) whether a graded result scored below its area maximum but above
  the existing low band (e.g. 80%) counts toward missed-points; (ii) the
  existing `classifyDirection` high/low/mixed output on the same run.
- Instrument: unit test with an 80% result in an area, asserting it counts
  toward the subset AND that `strengths`/`struggles`/`direction`
  (`class-trends.ts:351-352,338`) are unchanged from today for the same input.
- Direction: RED if an 80% result does not count toward missed-points, OR if any
  existing high/low/mixed classification changes value.

**AC-6 - the subset clause is NOT gated on full coverage** (orchestrator ruling
2026-09-15, restated in the row; do not re-open).
- Object: presence of the subset clause, versus the area's coverage state
  (`resultsWithArea` versus `report.totalResults`).
- Instrument: unit test on `composeClassTrendsDraft` (or its successor) with an
  area whose `missedCount >= 3` while `resultsWithArea < totalResults`.
- Direction: RED if the subset clause is suppressed because
  `resultsWithArea !== totalResults`. (This is deliberately the opposite gate
  from `areaFullyCovered`, which still governs the pre-existing high/low
  clauses; AC-3 keeps those unchanged.)

**AC-7 - every subset clause states its OWN denominator, over the same
population as its numerator** (orchestrator ruling 2026-09-15, extended
2026-09-29; the honesty half of AC-6, not optional).
- Object: the denominator number rendered in a subset clause, versus the count
  that clause was actually computed from (its own basis - the students who had
  this area, NOT `report.totalResults`).
- IDENTITY BASIS (orchestrator ruling 2026-09-29, transcription of the accepted
  B1 decision - see the ruling note under AC-2): the rendered ratio's two terms
  MUST share one population. AC-1 counts the numerator over DISTINCT STUDENTS, so
  the denominator is counted over distinct students on the same surface, never
  over submissions. On the Canvas path (one submission per student) student and
  submission counts coincide; on the repo surface they can diverge
  (`github-repos.ts:619`), so a clause reading "3 of 8" whose 3 is students and
  whose 8 is submissions is FORBIDDEN - a ratio mixing populations. The
  submission-to-roster-student dedup for the denominator is relocated to the
  architect via R3(b) alongside the numerator's, since both terms share the basis.
- Instrument: unit test constructing a run where a clause's basis differs from
  `totalResults`, asserting the rendered clause carries its own basis, does not
  interpolate `totalResults`, and counts its denominator over the SAME identity
  population as the numerator.
- Direction: RED if a subset clause states `totalResults` (or any number other
  than its own computed basis) as its denominator, OR if the denominator's
  identity basis differs from the numerator's (e.g. a student numerator paired
  with a submission denominator on the repo surface).

**AC-8 - two outputs, and a student name can never reach the class-addressed
text** (owner named two actions; privacy defect is the row's explicit hazard;
also the leverage removal criterion).
- Object: the CLASS-addressed announcement text, versus the set of student
  identifiers present in the run (`GradeResult.student`; `GradedResult.userId`
  (`types.ts:278`), the Canvas id that graded rows carry - and the feature counts
  GRADED rows; and `canvasUserId` (`types.ts:157,166`), which sits only on the
  UNGRADED outcome rows). All three are potential student identifiers the privacy
  oracle must keep off the class-addressed path.
- Instrument: unit test over the class-text composer, seeding graded results
  with distinctive student names/ids and asserting none of them appear anywhere
  in the class-addressed output. A second, INSTRUCTOR-facing per-student output
  exists and is a separate value from the class text.
- Direction: RED if any run student identifier appears in the class-addressed
  text, OR if only one combined output exists (no instructor/class split).
- Note: the strongest form - names structurally unable to reach the class text
  (a type/value the class composer cannot receive a name through, in the spirit
  of the layer-B anonymiser at `class-trends-insight.ts:40-69`) - is a
  construction the architect and test seat own; AC-8 states the observable pass
  condition, not that construction.

**AC-9 - the named list and the count come from the same source.**
- Object: the instructor-facing per-student list for an area, versus the set of
  students that AC-1 counted as missing points on that area.
- Instrument: unit test asserting the named list for an area equals exactly the
  missed-points set (same members, same cardinality as the AC-2 count).
- Direction: RED if a named student is not in the missed-points set, or if the
  list length differs from the count that drove the >=3 flag. (Prevents a
  feature that counts one set and names another - the misattribution class
  `docs/loop/leverage.md:43` exists to forbid.)

**AC-10 - no model generation; the signal stays a counted fact** (hard
constraint inherited from N11 / REGRESSION 423; the fix is more counted signal
in layer A, never generation).
- Object: the set of module imports on the counted-subset + layer-C path,
  versus the forbidden prefixes (`lib/llm`, `lib/gemini`, `app/actions`,
  `lib/canvas`, `lib/lms-generation`).
- Instrument: the existing `classTrendsDraft.not-postable.test.ts` transitive-
  import guard (its current coverage of `lib/llm`/`lib/gemini` is per
  `docs/loop/leverage.md:160-167`; confirming it today is Residual R4).
- Direction: RED if the counted-subset or draft path imports any forbidden
  prefix. Anyone concluding generation is unavoidable must argue it explicitly
  in the architect pass, never smuggle it in.

### Recommendations the row demands (state, do not decide silently)

**AC-4 - what counts as a deduction on an unparseable or scale-less score.**
- RECOMMENDATION: a result counts toward missed-points for an area **only when
  its parsed score is `percent`-kind** (`ParsedScore.kind === "percent"`,
  `class-trends.ts:60-63,84-96`) **and strictly below that scale's maximum**
  (`< 100` for a `%` value; `numerator < denominator` for an `N/M` value).
  A `raw-number` score (a bare "8", no stated scale) and an `unscored` score are
  **UNKNOWN**: excluded from BOTH the numerator (not counted as missed) AND the
  denominator (not counted as "not missed"), and the clause discloses their
  presence.
- REASONING: the module already refuses to invent a denominator (requirement 4,
  `parseScoreValue` returns `unscored`; `classifyDirection` returns `no-scale`
  at `:188-192`; the header rationale at `class-trends.ts:44-58`). Counting an
  UNKNOWN as "missed" invents friction; counting it as "not missed" invents
  agreement - the exact silent promotion the row warns must not happen. A bare
  raw number cannot establish a deduction because nothing states its maximum.
  Whether to convert raw numbers via a known per-criterion maximum
  (`RubricCriterion.points`, `types.ts:462`, or `pointsPossible`,
  `types.ts:417`) is an architect question flagged, not decided here.
- Object/instrument/direction, if adopted: object = whether an unscored/
  raw-number result counts, versus the "UNKNOWN, excluded, disclosed" rule;
  instrument = unit test with one `%`, one bare-number, one `N/A` result in an
  area; direction = RED if an unscored/raw-number result is counted as missed OR
  silently counted as not-missed (i.e. swells or shrinks the denominator).

**AC-5 - whether a trivial deduction (19.5/20 = 97.5%) counts.**
- RECOMMENDATION: **yes - any deduction strictly greater than zero counts** (a
  percent value `< 100`, or `numerator < denominator`). Default threshold =
  "any deduction". An optional instructor-tunable minimum-deduction threshold is
  flagged to the owner as a possible refinement, defaulting to zero.
- REASONING: the owner said "any deduction" in the same breath as rejecting the
  low-score rule, and warned against silently narrowing it ("the real reason the
  current feature renders nothing useful: it was looking for failure, and the
  owner wants to see FRICTION"). Defaulting to a nonzero minimum would be a guard
  forbidding what the owner asked for - the failure mode this seat exists to
  prevent. The size of each deduction can still be conveyed in the per-student
  list so a trivial pattern reads as trivial without being hidden.
- Object/instrument/direction, if adopted: object = whether a 19.5/20 result
  counts, versus "counts (deduction > 0)"; instrument = unit test with three
  97.5% results in one area; direction = RED if a sub-maximum percent result is
  excluded solely for being close to the maximum.

**AC-11 - which name a Repo Grades attribution shows** (RES-W3-4, owed here by
A16 wave 3, `docs/backlog.yml` N13b note).
- RECOMMENDATION: on the Repo Grades surface, the instructor-facing per-student
  attribution shows the **bound roster student** (`RepoGradeRow.binding`,
  `src/app/components/repo-grades/repoGradesRows.ts:119`) when a binding exists,
  falling back to the repo label only when it does not.
- REASONING: on the repo path `GradeResult.student` is set to
  `label?.trim() || digest.fullName` (`src/app/actions/github-repos.ts:619`) -
  the repo's own name, not the roster student. Naming the repo to an instructor
  who asked "which students missed this" defeats the attribution. Invisible
  today only because the panel never reads `.student` and layer B anonymises;
  N13b's per-student output is the first thing that would surface it.
- Object/instrument/direction, if adopted: object = the name shown for a bound
  repo row, versus the roster student in its binding; instrument = unit test
  over the repo-grades attribution mapping with a bound row; direction = RED if
  a bound repo row's attribution shows the repo label/`digest.fullName` instead
  of the bound roster student.

### Reachability

**AC-12 - both outputs are reachable; no library ships without a surface.**
- Object: whether the counted-subset value and the instructor-facing named list
  are rendered on the surfaces that mount the class-trends UI, versus existing
  only in `src/lib/grade`.
- Instrument: a source-text wiring test in the `classTrends*.wiring.test.ts`
  family (5 mount surfaces measured by
  `grep -rln '<ClassTrendsPanel' src/app --include=*.tsx`: `DraftedGradesTab.tsx`,
  `grading-recording/GradingRecordingPanel.tsx`, `GradingResults.tsx`,
  `repo-grades/index.tsx`, `snapshot-grading/SnapshotGradingPanel.tsx`).
- Direction: RED if the subset/named-list capability exists in `src/lib/grade`
  but no surface renders it. (Reading claim only for what the user SEES on
  screen - see owner-verification items; a green wiring test proves the import
  and mount exist, never the pixels.)

---

## Satisfiability and collisions found while writing these

Every criterion above is satisfiable by an implementation I can describe, with
ONE reconciliation flagged (it does not make any criterion unsatisfiable; it
routes work to the right seat):

- **AC-8 / AC-9 collide with three existing name-exclusion enforcers.** The
  feature must NAME students to the instructor (AC-9), but today:
  `class-trends.ts:150-152` documents `AreaTrend.summary` as carrying no student
  name; `class-trends-insight.ts:36-39,57` declares the anonymiser the ONLY
  place `.student` is read; and `classTrends.wiring.test.ts:128-130` asserts
  `ClassTrendsPanel.tsx` contains NO `.student` read at all
  (`expect(strippedPanel).not.toMatch(/\.student\b/)`). A named instructor list
  cannot coexist with a whole-panel `.student` ban. The feature stays
  satisfiable only if that ban is REFINED to forbid names on the CLASS-addressed
  path while allowing them on the instructor path - a loosened guard, which this
  repo ships only together with the feature that needs it. Deciding the shape of
  that refinement (and whether names enter in layer A, in the panel, or in a new
  instructor-only leaf) is architect + test-seat work, recorded as R1. AC-8 is
  what keeps the refinement honest: loosening the name ban must not let a name
  reach the class text.

Nothing here demands three distinct outputs from paths that render identically,
demands byte-identical output forever, or fails in a direction that rewards
discarding the thing under test - the specific unsatisfiable shapes this seat
has shipped before.

---

## Reuse survey (vetted existing code the build should reuse, not rebuild)

Kept short and factual - a full reuse/layout pass belongs to the architect
running in the same wave; this is only the list the criteria lean on.

- `ParsedScore` + `parseScoreValue` (`class-trends.ts:60-106`) - the existing
  percent / raw-number / unscored parse; AC-4 is written in its terms, reuse it
  rather than re-parsing scores.
- `computeClassTrends` / `AreaTrend` / `ClassTrendsReport`
  (`class-trends.ts:124-174,259-355`) - layer A already groups by normalized
  area, counts `resultsWithArea`, and excludes ungraded rows
  (`gradedResults`, `:272`). The subset count is a NEW per-area quantity added
  here; `percentValues` is anonymous (`:144`) so identity must be threaded in
  separately (architect).
- Identity sources: `GradeResult.student` (`types.ts:213`), `GradedResult.userId`
  (`:278`), `UngradedResult.userId?: never` (`:291`), `NotAttemptedOutcome`/
  `GradingFailedOutcome.canvasUserId` (`:157,166`). Attribution enters from
  these; AC-8/AC-9 are stated against them.
- `containsForbiddenCompletenessPhrase` (`class-trends.ts:37-40`) - the shared
  no-completeness-phrase check; reuse it, do not re-derive the phrase list.
- `composeClassTrendsDraft` + `areaFullyCovered` + `renderCountedClause`
  (`class-trends-draft.ts:65-89,118-178`) - layer C's pure composer; the subset
  clause is added here and must bypass `areaFullyCovered` (AC-6).
- `ClassTrendsInsightObservation.kind: "inferred"` discriminator
  (`class-trends-insight.ts:200-204`) and the anonymiser
  (`anonymizeGradeResults`, `:59-69`) - the model path stays untouched; the
  subset signal is counted, not inferred (AC-10).
- Surface + wiring precedent: `ClassTrendsPanel.tsx`,
  `ClassTrendsDraftPanel.tsx`, `classTrendsDraftState.ts`, and the
  `classTrends*.wiring.test.ts` / `classTrendsDraft.not-postable.test.ts`
  family - the existing reachability and no-post guards AC-12/AC-10 extend.
- Repo binding: `RepoGradeRow.binding`
  (`repo-grades/repoGradesRows.ts:119`) - the roster student AC-11 wants.

---

## Owner-verification items (nothing in this suite renders a component)

These cannot be machine-checked here; each needs the owner, an instrument, and a
step:

- **OV-1**: the class-addressed draft, read on screen after a real run, names no
  student and reads as this app's voice. Owner: repo owner. Instrument: open a
  graded run's Trends panel in the deployed app. Step: post-deploy owner walk.
- **OV-2**: the instructor-facing per-student list is visible, legible, and
  clearly distinct from the class draft (not merged into one block). Owner: repo
  owner. Instrument: same panel. Step: post-deploy owner walk.

---

## Residual register (owner + instrument + step; each is owed a backlog entry)

I may write only this file, so these are handed to the orchestrator to record in
`docs/BACKLOG.md` under N13b at disposal/push - a residual not in the backlog
does not exist (`iteration-caps.md` anti-gaming). Each has all three parts:

- **R1 - reconcile per-student names with the three existing name-exclusion
  enforcers.** Owner: architect (shape) + test seat (refined oracle).
  Instrument: `class-trends.ts:150-152`, `class-trends-insight.ts:36-39,57`,
  `classTrends.wiring.test.ts:128-130`. Step: the architect pass and the test
  seat's oracle for AC-8/AC-9; the loosened name ban ships in the same wave as
  the named list.
- **R2 - owner confirmation of AC-4 and AC-5** (deduction definition on
  scale-less scores; trivial-deduction threshold). Owner: repo owner.
  Instrument: the recommendations above. Step: one batched, non-gating question
  at scope hand-off; a "yes" ends the item, the recommendation is applied.
- **R3 - AC-11 / RES-W3-4 implementation, AND the count's identity basis on the
  repo surface** (repo attribution shows the bound roster student; the AC-1/AC-2
  count deduplicates submissions to distinct roster students). Owner: architect +
  implementer. Instrument: `github-repos.ts:619` (`GradeResult.student` is the
  repo, not the roster student), `repo-grades/repoGradesRows.ts:119`
  (`RepoGradeRow.binding`). Step: the architect pass decides (a) does the binding
  reach the attribution NAME surface, and what shows when unbound; and (b) what
  identity the >=3-student COUNT is taken over on the repo path, so two repos from
  one roster student count once and unbound repos are handled explicitly. The
  count's numerator (AC-1), the clause DENOMINATOR (AC-7), and the displayed
  name (AC-11) all share this basis, so all three are decided here rather than
  in the criteria; the architect must dedup the denominator's submissions to
  distinct roster students on the repo path exactly as it does the numerator's,
  so the rendered ratio never pairs a student count with a submission count.
- **R4 - confirm the no-model enforcer's current content** (AC-10). Owner: test
  seat. Instrument: `classTrendsDraft.not-postable.test.ts` and the sabotage
  check `docs/loop/leverage.md:160-167` describes. Step: the test seat verifies
  the guard still bans `lib/llm`/`lib/gemini` and can fail on a reintroduced
  import.

---

## Out of lane (deliberately not decided here)

- The mechanism that carries per-student identity from `GradeResult.student`
  into a per-area subset (new field on `AreaTrend`? a parallel structure? where
  the name/class split is enforced by type) - architect.
- Whether raw-number scores are converted to percents via a known per-criterion
  maximum - architect.
- The frozen oracle, the removal-test construction for AC-8, sabotage mutants,
  and proving the red tests satisfiable with a reference implementation - test
  seat.
- Global-invariant accounting (e.g. every numeric floor/cap versus every other)
  - the plan.
