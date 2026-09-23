# N13b scope: naming a subset of students in the class-trends draft

Row: `docs/backlog.yml`, `- id: 'N13b'` (grep -n "id: 'N13b'" docs/backlog.yml
returns line 151). Read in full this pass. This is the first `n13b-scope.md`
in `docs/` (`ls docs | grep -i n13` returns nothing) - there is no prior
version of this document, so the disposition-table requirement for a
restructuring does not apply here. Nothing below restructures a prior scope;
everything is a fresh finding against the tree, measured 2026-09-23.

Every quantity in this document was produced by a command shown next to it.
Every code claim is a `file:line` I opened this pass. Where the backlog row's
own `instrument:` line cites a stale location, I say so and give the
re-measured one - the same discipline the row itself uses on earlier rows
(N15-rubric-picture, class-trends-draft.ts's own header).

**Correction to the row's own instrument line.** The row cites
`src/lib/gemini.ts:25,124-125`. Re-measured this pass with
`grep -n "DEFAULT_GEMINI_MODEL\|DEFAULT_MAX_SUBMISSIONS\|getGeminiMaxSubmissions" src/lib/gemini.ts`:
`DEFAULT_GEMINI_MODEL` is at line 1, `DEFAULT_MAX_SUBMISSIONS = 40` is at
line 32, and `getGeminiMaxSubmissions()` is at lines 129-132, not 124-125.
The value the row's own note text quotes (40, not 5) is the current one and
matches `class-trends-draft.ts`'s own corrected header (see section 2). This
does not change the design; it is recorded because the row's stated
instrument should not be repeated as-is by a later reader.

---

## 1. What the draft says today

Traced end to end, code that composes it to the surface that renders it:

- **Layer A (counted, no model call).** `computeClassTrends`
  (`src/lib/grade/class-trends.ts:255-352`) folds `entry.run.results` into
  one `AreaTrend` per rubric area. Its one-sentence-per-area summary is built
  by `buildAreaSummary` (`class-trends.ts:207-242`): `"Across the ${N}
  submissions graded so far, ${M} of ${N} submissions graded so far covered
  \"${area}\"; ${direction text}.${unscored text}"`. `direction text` is one
  of five fixed strings keyed off `AreaTrendDirection` (`class-trends.ts:207-228`):
  "scores were consistently high (all >= 70%)", "...consistently low (all <=
  60%)", "scores were mixed", "no stated percentage scale...", or "scores
  could not be parsed...". This sentence is rendered directly, one per `<li>`,
  by `ClassTrendsPanel.tsx:150-158` (`{area.summary}`) - no further
  composition happens between layer A and the screen for this half of the
  panel.
- **Layer B (model-inferred, opt-in).** `ClassTrendsPanel.tsx:97-133`
  (`requestInsight`) POSTs the entry to `/api/class-trends-insight` and
  renders `observation.concept` / `observation.reading` verbatim
  (`ClassTrendsPanel.tsx:186-190`), each one prefixed in the UI with "AI
  reading of the submissions graded so far - a model's inference, not a
  counted fact" (`ClassTrendsPanel.tsx:174-176`).
- **Layer C (the actual "draft," composed, copyable).**
  `composeClassTrendsDraft` (`src/lib/grade/class-trends-draft.ts:162-227`)
  builds one Markdown string: an unconditional opening line
  (`class-trends-draft.ts:180`, `"A note on ${assignmentName}, based on the
  ${report.totalResults} submissions graded so far:"`), zero or more counted
  clauses from `renderCountedClause` (`class-trends-draft.ts:124-133`) -
  `"Something that's going well: ${area.displayArea}."` for `direction ===
  "high"`, `"An area that could use more attention: ${area.displayArea}."`
  for `"low"`, nothing for any other direction - zero or more inferred
  clauses from `renderInferredClause` (`class-trends-draft.ts:148-153`), and
  a fixed closer, `"Thanks for your continued effort on this."`
  (`class-trends-draft.ts:220`). `ClassTrendsDraftPanel.tsx:96-100` renders
  this Markdown (via `markdownToHtml`) and offers a single "Copy" button
  (`ClassTrendsDraftPanel.tsx:101-109`) - there is no post/send action
  anywhere in this component (confirmed by
  `classTrendsDraft.not-postable.test.ts`, section 5 below).

**Why this evidence matters, not just context.** `docs/loop/leverage.md`'s
GUARANTEED row and this row's own note both cite REGRESSION 423: this
composer is deliberately a pure function with no model call, so every string
it can ever emit is one of the fixed templates above. That is exactly why the
row's premise holds: on any class where scores are mixed (which
`classifyDirection`, `class-trends.ts:184-202`, treats as "not every
percent-scale value on the same side of 70/60") the ONLY clause that can fire
per area is the coverage-disclosure opening line and the closer - nothing in
the current template has a third clause shape to fall back to. There is no
sentence today that can say anything about a subset.

---

## 2. Whether per-student data survives to the point the draft is composed

**It survives up to the boundary of layer A, and is discarded inside layer
A's own fold - not before it.** This is measured, not inferred, at three
levels:

**a. Identity exists on every `GradeResult` and is explicitly protected on
the way in.** `GradeResultBase.student: string` (`src/lib/grade/types.ts:213`)
sits on every result; `GradedResult` additionally carries `readonly userId?:
number` (`types.ts:277-280`), "the Canvas id that enables write-back." All
four adapters that build the `GradingRunEntry` `ClassTrendsPanel` receives
pass `results` through by reference or by an unmodified spread, and one of
them says so in as many words:

  - `src/app/components/grading-results/classTrendsEntry.ts:1-14` (the
    adapter used by `GradingResults.tsx`, i.e. the zip/canvas/livefeed/github
    LMS Grading path): "the entry identical in shape to the one
    DraftedGradesTab.tsx already hands the panel (real `student`, and
    `userId` where postable) - stripping or blanking either would break
    N13b's per-student attribution before it is even built." `toClassTrendsEntry`
    (`classTrendsEntry.ts:38-40`) does exactly this: `return { ...meta, run
    };` - `run` is carried by reference (`entry.run === run`, per the file's
    own header), no per-result rewrite.
  - `src/app/components/grading-recording/classTrendsRunCohort.ts:159`:
    `results: cohort.rows.map((r) => r.result)` - each `r.result` is a
    `GradingRecordingResult` built with `student` set from the matched
    `identity.studentName` (`classTrendsRunCohort.ts:113,118,130,143`),
    never fabricated (`:109`, "omitted, never emitted with an invented
    student").
  - `src/app/components/repo-grades/classTrendsFolderEntry.ts:93`: `const run:
    GradingRun = { results: [...cohort.results], ... }` - a shallow copy of
    the array, not of each result, so each `GradeResult`'s own `.student`
    field is untouched.
  - `DraftedGradesTab.tsx:655` mounts `ClassTrendsPanel` directly against
    `entry`, the same `GradingRunEntry` the grading engine itself produced -
    no adapter, nothing to strip.

**b. Layer A never reads it.** `grep -c "\.student\b" src/lib/grade/class-trends.ts`
returns `0`. The fold that would need to read it is
`computeClassTrends`'s inner loop, `class-trends.ts:282-303`:

```
for (const result of results) {
  ...
  for (const rubricArea of result.rubricAreas) {
    ...
    accumulator.rawScores.push(rubricArea.score);
  }
}
```

`AreaAccumulator` (`class-trends.ts:245-248`) is `{ displayArea: string;
rawScores: string[] }` - a plain array of score strings with no parallel
array or field carrying which result (student) each score came from. The
loop reads `result.rubricAreas` only; `result.student` is in scope at every
iteration and is never referenced. This is the exact point identity is
dropped: not upstream, not by the adapters, but by this one data structure's
shape.

**c. What carrying it would cost.** `AreaAccumulator.rawScores: string[]`
would need to become something like `perScore: { student: string; userId?:
number; score: string }[]` (or a parallel array), and `AreaTrend` would need
an analogous field instead of (or alongside) the anonymous `percentValues:
number[]` / `rawValues: number[]` it exposes today (`class-trends.ts:144,146`).
That is a real, if small, shape change to a pure, already-tested module (17
tests reference `class-trends.ts` today per its own test file - not
separately counted this pass since it is not load-bearing to the design
question). The harder cost is not the type change, it is EVERYTHING
downstream of `AreaTrend` that currently assumes it is anonymous:
`buildAreaSummary` (`class-trends.ts:207-242`), every caller of
`report.areas`/`report.strengths`/`report.struggles`, and - the load-bearing
one - `renderCountedClause` (`class-trends-draft.ts:124-133`), which is
documented as "the ONLY function in this module allowed to turn an AreaTrend
into draft text" and is explicitly typed to read only `.displayArea` and
`.direction`, "NEVER... any number of any kind." Handing it a field that
CAN carry a name changes what that guarantee is protecting against, which is
exactly why section 3 and section 4 below matter: the type change alone does
not answer whether that name may reach the same clause a class-wide message
sends.

**d. Privacy precedents checked, not assumed.** Two were named to check
against, and neither transfers as a blanket rule the way the row's phrasing
could be read:

- **The "assignment text in localStorage" rule is narrower than "assignment
  text," and does not bind this feature today.** The tested rule is
  `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts:131-132,195`:
  "unlike rubric/assignment text, which U10 still keeps out of localStorage
  for the same sensitivity reason as before" - this is a rule about ONE
  surface (snapshot-grading's own `ta-snap-*` key set), not a repo-wide ban.
  Measured counter-example in a sibling surface: Repo Grades DOES persist
  rubric text to localStorage today - `repoGradesUiState.test.ts:107-121`
  round-trips `rubric: "5 pts: has a README"` through
  `persistRepoGradeManualRubricText`/`loadRepoGradeManualRubricText`. So the
  precedent is "this one surface chose not to," not "this repo forbids it."
  It does not bind class-trends either way, and it is moot here regardless:
  `grep -n "localStorage" src/app/components/drafted-grades/ClassTrendsPanel.tsx
  src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx` returns
  nothing - this feature has no localStorage persistence today (confirmed
  again in section 5).
- **`NoPostableIdentity` forbids a named, specific set of keys - not
  `student`.** `src/app/components/assessment-shared/assessment-row.ts:47-58`:
  `ForbiddenIdentityKeys = "userId" | "user_id" | "canvasUserId" |
  "sisUserId" | "loginId" | "canvasSubmissionId" | "submissionId" |
  "enrollmentId" | "studentId"`. `student` (the field `GradeResultBase`
  actually carries, `types.ts:213`) is NOT on that list, and `GradeResult`
  is not a row type this guard is applied to at all - `NoPostableIdentity`
  gates `assessment-shared`'s own row types (`GradingRow`,
  `SnapshotAssessmentRow`), a different family built for a different
  purpose (serializing a row to `postCanvasGrades`, `assessment-row.ts:11-19`).
  Applying this guard's literal type to `class-trends.ts` would be a category
  error - it exists to stop a POSTABLE row from smuggling a Canvas write-back
  id through a generic mutator, not to police whether a display string may
  contain a name. It is real, precise precedent for "name what the guard
  forbids before assuming it applies," and what it forbids does not reach
  this feature's `student: string` field. The actual constraint on THIS
  feature is the one `classTrendsDraft.not-postable.test.ts` already
  enforces (section 5): layer C may not import a posting/model capability,
  regardless of what data it holds.

**Conclusion for this section:** the row's premise is correct - per-student
attribution does not exist today because layer A discards it - but the
premise that a "guard" stands in the way is not: no privacy guard here
currently forbids naming a student string in a rendered clause. The
constraint that DOES bind is disclosure surface, not a type guard: see
section 4.

---

## 3. The disclosure rule, checked against four states

**A sentence naming a subset may assert only what holds on every caller and
every reachable state.** Checked against the four named states, using the
"3 or more" absolute threshold the owner set (row note, verbatim: "any trend
where three or more students missed points on the same sections"):

| State | What a hypothetical subset sentence could honestly say |
|---|---|
| **Subset of one** | Nothing. One student missing points never satisfies "three or more" - this state cannot render a subset clause at all under the owner's own threshold. A design that rendered anything here would be inventing a lower bar the owner did not set. |
| **Subset of all** | Everyone in the graded set missed points on this area. This ALSO trivially satisfies "three or more" whenever the graded set is >=3. It coexists with, and can fire alongside, the EXISTING `classifyDirection` "low" signal (`class-trends.ts:184-202`), which requires literally the same condition when every score is percent-scale and <= 60%. Whether both a "consistently low" clause and a "3+ missed points" clause should both render for the same area - one from the stricter existing signal, one from the new looser one - is not decided by the row's note and is not decided here; flagged as an open design question in section 6/7's residual register, not defaulted. |
| **A tie at the boundary (exactly 2, or exactly 3)** | The threshold is an absolute count with no fractional comparison, so there is no boundary ambiguity the way a fraction-of-class threshold would create (the row's note explicitly closes that door: "not a fraction of the class"). Exactly 2 renders nothing; exactly 3 renders the clause. The only "tie" that can occur is 3+ students each having missed a DIFFERENT single point value (a 9.5/10 next to a 0/10) counting equally toward the same subset - whether a trivial deduction (19.5/20) should count at all is Question (b) below, still open. |
| **A run with not-attempted or grading-failed rows** | Per the row's ORCHESTRATOR RULING (quoted in the row's own note): the subset clause is NOT gated on `areaFullyCovered` (`class-trends-draft.ts:109-121`, `resultsWithArea === report.totalResults`) the way the existing high/low clause is. A subset clause must therefore state ITS OWN denominator drawn from `AreaTrend.resultsWithArea` (`class-trends.ts:132`), e.g. "4 of the 8 submissions that included this section," never inheriting the opening line's `report.totalResults` (`class-trends-draft.ts:180`). `ClassTrendsReport.ungraded` (`class-trends.ts:158-164`, counts of `notAttempted`/`gradingFailed`) is available on the same report object today and is never folded into `totalResults` or any area's count - a subset sentence stating its own `resultsWithArea`-based denominator is consistent with that existing invariant and does not need a new field to do so. |

**Two questions the row's note names as open and this pass leaves open,
because defaulting either is exactly the "implementer's safe-looking silent
default" the check round on the parent item (N13) already flagged:**

- **(a) What counts as a "deduction" when a score is unparseable or has no
  stated scale.** `parseScoreValue` (`class-trends.ts:73-99`) returns
  `"unscored"` for blank/prose/ranges, and `"raw-number"` for a bare number
  with `ParsedScore`'s own doc comment stating the scale is unknown
  ("could be out of 10, out of 100, or anything else,"
  `class-trends.ts:52-56`). Requirement 4 (cited by the row, and enforced
  today at `class-trends.ts:182-187`) forbids inventing a denominator - so a
  raw-number score cannot be classified "missed points" or "did not miss
  points" without guessing a scale the string never stated, and an
  unscored/unparseable score cannot either. Recommendation, not a decision:
  treat both as NOT counted toward the subset (the same "refuse to invent"
  posture requirement 4 already takes for high/low classification), and say
  so explicitly in the rendered denominator language rather than silently
  shrinking the count.
- **(b) Whether a trivial deduction (e.g. 19.5/20) counts.** Under a literal
  "any deduction" reading it does. Recommendation, not a decision: count it,
  because the owner's own words ("MISSED POINTS is any deduction, not the
  existing low-score rule") explicitly reject the existing threshold-based
  reading as the wrong one to reuse here, and a hand-picked minimum-deduction
  floor would be exactly the kind of undocumented threshold this row exists
  to replace with a stated, derived one. Flagged for the owner to confirm,
  not defaulted silently.

---

## 4. Whether naming students is even wanted here - argued, not assumed

**The row's own note already argues this, and the argument holds up against
the current tree, so it is not a live open question - but it is worth tracing
concretely rather than taking on faith, because the mechanism it depends on
is real and checkable today.**

**Where the draft's output can go, measured:** `ClassTrendsDraftPanel.tsx`'s
only user action on a composed draft is `handleCopy`
(`ClassTrendsDraftPanel.tsx:47-54`), which calls `writeClipboardText` and
nothing else - there is no post/send/save call anywhere in this component or
its dependencies. `classTrendsDraft.not-postable.test.ts` (canary 3,
`:207-230`) proves this by import-graph walk, not by reading intent: it
asserts ZERO reachable value-imports of `app/actions`, `lib/canvas*`,
`lib/lms-generation`, `lib/llm*`, or `lib/gemini*` from layer C's seven root
files (`class-trends-draft.ts`, `classTrendsDraftState.ts`,
`ClassTrendsDraftPanel.tsx`, `ClassTrendsPanel.tsx`, `classTrendsEntry.ts`,
`classTrendsRunCohort.ts`, `classTrendsFolderEntry.ts`). So the ONLY place
this draft's text goes, mechanically, is the user's clipboard - the
instructor pastes it themselves into whatever they choose: a Canvas
announcement (class-addressed, student-visible to the whole roster), a DM to
one student, or nowhere.

**That is exactly why the row's split is load-bearing, not optional.** The
CURRENT single markdown string produced by `composeClassTrendsDraft` is
already written as class-addressed prose - its opening line
(`class-trends-draft.ts:180`) and its closer ("Thanks for your continued
effort on this.") read as one message meant for the whole class, and nothing
in `ClassTrendsDraftPanel.tsx` labels it otherwise. If per-student
attribution were added to THIS SAME string, an instructor who pastes it
verbatim into a Canvas announcement - the shape the panel's own copy button
is built for - would be pasting student names into a class-wide,
student-visible surface with no code-level barrier stopping them, because
the guard this feature has (`classTrendsDraft.not-postable.test.ts`) checks
capability (can this code post to Canvas or call a model), not content (does
this string contain a name). Nothing in the current design checks the
content of the composed markdown for a name before it is copyable.

**Conclusion, matching the row's note:** naming students is wanted, but only
in a second, separately-rendered, instructor-facing artifact - never folded
into the one markdown string `ClassTrendsDraftPanel.tsx`'s Copy button
exposes today. The class-addressed clause and the per-student list are two
different outputs with two different readers, and the existing not-postable
guard is the right PLACE to add a new, content-level check (a scan of the
class-addressed markdown for any string that also appears in the run's
`.student` list) - but that check does not exist today and is not proven by
anything in this pass; it is a residual (section 6).

---

## 5. Surface, ceiling, and persistence

**Surface: `ClassTrendsPanel.tsx` (layer A + B host) and
`ClassTrendsDraftPanel.tsx` (layer C, the draft/copy UI) render the current
feature.** Both are mounted from four call sites, each a `<ClassTrendsPanel
.../>` JSX tag (`grep -rn "<ClassTrendsPanel" src --include=*.tsx`, four
matches, zero others):

- `src/app/components/DraftedGradesTab.tsx:655`
- `src/app/components/grading-recording/GradingRecordingPanel.tsx:946`
- `src/app/components/GradingResults.tsx:607`
- `src/app/components/repo-grades/index.tsx:856`

A new per-student-list output needs a home in the SAME panel tree (most
likely a new sibling component mounted from `ClassTrendsPanel.tsx`, next to
`ClassTrendsDraftPanel`) so it appears at all four call sites without a
fifth wiring change, or an explicit, argued decision to omit it from one
surface (e.g. Repo Grades, given the identity caveat below).

**Line cost, both counters, this pass:**

```
Bash:       wc -l < <file>
PowerShell: @(Get-Content <file>).Count   (mandated)
PowerShell: (Get-Content <file> | Measure-Object -Line).Lines   (disagrees, do not use)
```

| File | wc -l | Get-Content.Count | Measure-Object.Lines | Gap |
|---|---|---|---|---|
| `src/lib/grade/class-trends.ts` | 355 | 355 | 323 | 32 |
| `src/lib/grade/class-trends-draft.ts` | 228 | 228 | 209 | 19 |
| `src/lib/grade/class-trends-insight.ts` | 270 | 270 | 247 | 23 |
| `src/app/components/drafted-grades/ClassTrendsPanel.tsx` | 212 | 212 | 197 | 15 |
| `src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx` | 123 | 123 | 112 | 11 |
| `src/lib/grade/engine.ts` | 498 | 498 | 463 | 35 |
| `src/lib/grade/types.ts` | 406 | 406 | 378 | 28 |

`wc -l` and `@(Get-Content).Count` agree on all seven files (as
`docs/loop/this-repo.md` predicts); `Measure-Object -Line` under-counts by
11-35 here, inside the card's documented 15-138 range. Use the
`@(Get-Content).Count` / `wc -l` figures above as the ceiling-relevant
number.

**Ceiling:** `src/file-size-ceiling.structure.test.ts`'s limit is 1000 lines
repo-wide (`grep -n "LIMIT = 1000" src/file-size-ceiling.structure.test.ts`
- re-confirmed this pass, matches `this-repo.md`'s own re-measurement).
`grep -n "class-trends\|ClassTrendsPanel\|ClassTrendsDraftPanel" src/file-size-ceiling.structure.test.ts`
returns nothing - none of these seven files is in the `ALLOWED_OVERAGE`
ratchet list, so none is currently pinned near the wall. The largest of the
seven, `engine.ts` at 498 lines, has roughly 500 lines of headroom before
the ceiling binds. This item does not need a pre-emptive split.

**Persistence / `ta-` keys / exact-set canaries touched:**

- **No `localStorage` and no `ta-` key anywhere in this feature today.**
  `grep -n "localStorage" src/app/components/drafted-grades/ClassTrendsPanel.tsx
  src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx` returns
  nothing (confirmed twice, sections 2d and here). A new per-student-list
  panel that adds no persistence of its own introduces no new canary here.
- **The exact-set canary that DOES bind:** `classTrendsDraft.not-postable.test.ts`'s
  canary 3 (`:207-230`) walks import edges from a FIXED list of seven root
  files. It is a walker, not a name list - a new leaf file imported (by
  value) from one of the seven existing roots is automatically covered with
  no test edit needed. But a new component mounted as a SIBLING JSX tag
  directly from `ClassTrendsPanel.tsx` (rather than imported and called from
  inside one of the seven roots) still counts as reachable via
  `ClassTrendsPanel.tsx`'s own import graph as long as `ClassTrendsPanel.tsx`
  itself imports it - so the practical rule for the wave plan is: any new
  per-student-list module must be VALUE-IMPORTED by `ClassTrendsPanel.tsx`
  (already a root) or by another of the seven roots, not merely rendered via
  some indirect registration, or canary 3 silently does not walk it.
  `FORBIDDEN_PATH_PREFIXES` itself (`classTrendsDraft.not-postable.test.ts:47`,
  5 entries: `app/actions`, `lib/canvas`, `lib/lms-generation`, `lib/llm`,
  `lib/gemini`) needs no change unless a new capability class is introduced;
  none is proposed here.

---

## 6. Wave plan

Each wave's file list contains the file that CALLS or RENDERS the change,
per `docs/DEV_LOOP.md`'s own rule.

**Wave 1 - layer A: subset signal, attribution-carrying shape.**
- `src/lib/grade/class-trends.ts` (add per-score attribution to
  `AreaAccumulator`/`AreaTrend`; add the subset classification alongside
  `AreaTrendDirection`, per an owner ruling on questions (a) and (b) in
  section 3)
- `src/lib/grade/class-trends.test.ts` (exists; the module's own test file -
  every existing case asserting `AreaTrend` shape must still pass with the
  new field present and unused by old callers)
- `src/app/components/drafted-grades/classTrends.wiring.test.ts` (asserts
  facts about `class-trends.ts`'s shape read as source text; a new exported
  type/field is exactly the kind of change this suite is built to catch a
  regression against)

**Wave 2 - layer C: the class-addressed clause's own guard, plus the new
per-student output.** Depends on wave 1's shape landing first.
- `src/lib/grade/class-trends-draft.ts` (the class-addressed clause must
  gain a content check against the run's own student list, per section 4 -
  not just continue reading `.displayArea`/`.direction`)
- A new module for the per-student list (name TBD by the architect pass this
  scope does not run - e.g. `src/lib/grade/class-trends-subset.ts`), pure,
  no model call, same discipline as `class-trends-draft.ts`
- `src/app/components/drafted-grades/ClassTrendsPanel.tsx` (mounts the new
  per-student-list component; this is the file the reachability rule in
  `docs/DEV_LOOP.md` requires in this wave's list, since it is the CALLER)
- A new component for rendering the per-student list (e.g.
  `ClassTrendsSubsetPanel.tsx`), mounted from `ClassTrendsPanel.tsx`
- `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts`
  (canary 3's root list, `:207-230`, must add the new module/component paths
  if either is not transitively reached by an existing root - see section 5)

**Wave 3 - the four surfaces, verified against real entries.** No new files;
verification only, against the four mount sites already listed in section 5
(`DraftedGradesTab.tsx:655`, `GradingRecordingPanel.tsx:946`,
`GradingResults.tsx:607`, `repo-grades/index.tsx:856`) plus the three entry
adapters named in section 2a (`classTrendsEntry.ts`,
`classTrendsRunCohort.ts`, `classTrendsFolderEntry.ts`), because each is a
distinct path that must still hand `class-trends.ts` a `.student` string
that means what the per-student list claims it means (see the Repo Grades
caveat in the residual register below).

**Not scoped by this pass, and should not be defaulted by an implementer:**
architecture for the new module/component's exact shape and naming, the
oracle for the content-level not-postable check in section 4, and the
disposal of the two open questions in section 3.

---

## 7. Residual register

| # | What is not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | Whether both the existing "consistently low" clause and a new "3+ missed points" clause should render for the same area when the subset happens to be the whole graded set (section 3, "subset of all" row) | N13b architect pass | Reading `class-trends-draft.ts`'s `countedClauses` composition (`:193-198`) against a fixed report fixture where one area is both `direction: "low"` and subset-eligible | Architect pass decides and records the rule; test-author pass adds a fixture asserting the decided behavior |
| R2 | What counts as a "deduction" for an unscored or raw-number (no stated scale) score - section 3, question (a) | Owner (product decision on how strict "any deduction" should read against ambiguous data) | `parseScoreValue`'s three-way classification (`class-trends.ts:73-99`) already types the ambiguity; no new instrument needed, only a ruling | Recorded as an explicit constant/comment in `class-trends.ts` once ruled, with a test pinning the chosen behavior for each `ParsedScore` kind |
| R3 | Whether a trivial deduction (e.g. 19.5/20) counts toward the subset - section 3, question (b) | Owner | Same as R2 | Same as R2 |
| R4 | Whether the class-addressed clause needs a content-level scan (not just a capability-import guard) to prevent a name leaking into the copy-to-clipboard string - section 4 | N13b test-author pass | A new oracle: build a run fixture where a rubric area's `displayArea` or an inferred observation's text happens to literally contain a student's name string, and assert the composed markdown never contains it | Test-author designs the oracle; implementer builds the check inside `class-trends-draft.ts` (or a wrapper) from it |
| R5 | On Repo Grades, whether a per-student attribution should show the repo (today's `GradeResult.student`, `src/app/actions/github-repos.ts:618-619`, `label?.trim() \|\| digest.fullName`) or the roster-bound student via `RepoGradeRow.binding` (`src/app/components/repo-grades/repoGradesRows.ts`, binding built by `buildRepoGradeRows`) - RES-W3-4, inherited verbatim from the row's own note, owed by A16 Wave 3 (`docs/a16-wave3-scope.md`) and restated here because N13b's attribution feature is the first consumer that would actually surface the wrong name if this is left unresolved | N13b scoping seat (per the row's own note) - this document discharges the "instrument" half of that obligation; the decision itself is still open | `grep -n "student:" src/app/actions/github-repos.ts` (confirms `:618`, repo full name, not roster student) plus a criterion naming which name a Repo Grades attribution row must show | Wave 3 above (verification against the Repo Grades entry adapter) is the step; it cannot close until an owner or architect ruling picks a name source |
| R6 | Whether `ClassTrendsInsightObservation`'s free-text `concept`/`reading` (layer B, model-inferred) can ever be attributed to a specific student the way layer A's counted subset can - `anonymizeGradeResults` (`class-trends-insight.ts:60-63`) strips `GradeResult.student` before the model ever sees it, by design, so layer B structurally CANNOT name a student today | N13b architect pass | Reading `anonymizeGradeResults`'s doc comment (`class-trends-insight.ts:24-36`): "never handing the name to the model in the first place is strictly stronger" | Out of scope for this row unless the architect pass decides layer B needs a parallel change; recorded so a later reader does not assume layer B already supports naming |

**What this environment cannot verify at all**, per `docs/loop/this-repo.md`
section 6 and repeated here rather than guessed at: whether the rendered
per-student list or the class-addressed clause reads as this app's voice,
whether the two-clause interaction (R1) is visually confusing to an
instructor, and any claim about markup, focus order, or keyboard behavior on
either new component - no component is ever rendered by any test in this
repo, so every UI claim above is a READING claim, not a rendering one, and is
labeled as such throughout.

---

## 8. The leverage question, answered against the mechanism

**Not claiming:** memory (this feature persists nothing new - section 5) or
LMS write-back (layer C is proven, by import-graph walk, to reach no posting
capability - section 4). Both were falsified elsewhere today per this task's
own instruction and neither is asserted here.

**What could survive, argued concretely rather than asserted:**

- **SCALE, already earned, not newly earned by this row.**
  `gradeStudentEntries` (`src/lib/grade/engine.ts:113-134`) already pins one
  rubric/criteria pair and loops it over every student in the batch, capped
  at `DEFAULT_MAX_SUBMISSIONS = 40` (`gemini.ts:32`). N13b does not build
  this; it is inherited from the grading run the trends feature already
  reports on. Naming it as N13b's OWN advantage would be exactly the
  inherited-class error `leverage.md`'s failure mode B warns against.
- **GUARANTEED, plausibly newly earned IF built as scoped - but not proven,
  because nothing is built yet.** The concrete, checkable claim would be:
  "the subset count (>=3 students missed points on the same area) is
  computed in TypeScript from typed `AreaTrend`/per-score data, and no model
  is ever asked to count or estimate it." This is the same shape as the
  two shipped GUARANTEED instances `leverage.md` already names - REGRESSION
  423's "layer C makes no model call at all" and `course-intel/ask`'s
  pre-computed `concernSet` receipt (`src/app/api/course-intel/ask/route.ts:773-871`).
  The reason a chat window cannot do this: a chat re-reads each pasted
  submission independently (no batch object exists to count across), and
  even if all 40 were pasted into one long conversation, nothing downstream
  of a chat's prose answer can distinguish "the model correctly counted 3"
  from "the model said a plausible-sounding 3" - there is no typed structure
  to check its count against, the same argument `leverage.md`'s "What a
  failing/passing answer looks like" section makes generically. A removal
  test for this, once built, is concrete: delete the `>=3` comparison inside
  the new subset-classification function and assert the previously-rendered
  subset clause disappears from a fixture with exactly 3 qualifying
  students - if the clause still renders, the guarantee was never real.
  **This is not proven today** - the subset-counting code is exactly what
  wave 1 (section 6) has not yet built - so this is a claim about what the
  built diff MUST be checked against at Verify, not a claim already earned.
- **The honest concession the task asked for, if this is not built as
  scoped.** If the eventual implementation instead asks a model to eyeball
  "which students struggled" from the anonymized submissions (routing around
  layer A's counted `AreaTrend` data the way `docs/loop/leverage.md`'s
  negative example warns against for a different feature), the row's real
  advantage collapses to click-cost only ("the instructor doesn't have to
  scroll the grading table themselves and manually tally which of 30 rows
  scored low on the same area") - real, but thin, and must be stated as such
  rather than dressed up as GUARANTEED. This scope recommends the counted
  path (extending `AreaTrend`, never asking a model to count) precisely
  because it is the only version of this feature that keeps the claim above
  true; an implementer who reaches for a model call to shortcut the subset
  logic is, without noticing it, downgrading this row from a real mechanism
  to click-cost only, and that downgrade needs a human decision, not a
  silent implementation choice.

---

## Gates run this pass

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Per-argument coverage line and exit code captured to a file (this tool's own
sandbox does not reliably surface a raw exit code through a piped shell, per
this repo's own documented `| tail; echo $?` trap - read from a file
instead):

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts > /tmp/n13b-gate.txt 2>&1; echo $? > /tmp/n13b-gate-exit.txt
```

Results below (section 9) are read from those two files, not recalled.

`git status --short` at the end of this pass: expected to show exactly one
new, untracked file, `docs/n13b-scope.md`, and nothing else - no file under
`docs/a39-*`, `docs/a3-*`, `docs/a4-*`, `docs/a24-*`, `docs/a32-*`,
`docs/g4-scope.md`, `docs/backlog.yml`, `docs/BACKLOG.md`,
`src/tools/backlog/*`, or anything under `src/` was opened for write by this
pass (only `Read`/`grep`/`sed`/`wc` were used against the tree).
