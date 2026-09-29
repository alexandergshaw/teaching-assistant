# N13b security / privacy pass

Area: grading-run-survival-and-disclosure. Kind: feature (security/privacy
wave). Source row: `docs/backlog.yml:199-209` (the `- id: 'N13b'` line is at
`:199`, `grep -n "id: 'N13b'" docs/backlog.yml` re-measured this pass). Seat:
`loop-seat` (security). This is round 1 of the security activity; a fresh
`loop-checker` reads this before any implementer consumes it. Read this pass:
`docs/n13b-acceptance-criteria.md` (AC-8, AC-9, AC-10, R1, R3, R4, out-of-lane),
`docs/backlog.yml:199-209`, and the code cited below - every citation in this
document was opened this pass; none is inherited from either doc without being
re-checked against the tree.

There is no prior `docs/n13b-security.md` (`ls docs | grep -i n13b` returns
only `n13b-acceptance-criteria.md` and `n13b-scope.md`), so no disposition
table applies - nothing here restructures a prior security artifact.

## 0. Scope of this pass

The row's own hazard, verbatim from `docs/backlog.yml:209`: "A CLASS
ANNOUNCEMENT NAMING STUDENTS IS A PRIVACY DEFECT... that distinction needs an
oracle that FAILS if a student name can reach the class-addressed text." AC-8
is the criterion this pass is measured against. This document threat-models
that hazard concretely (leak-path enumeration, AC-8 oracle sufficiency,
small-class disclosure, AC-10's no-model constraint as a security property),
then covers the seat's standard topics (egress, prompt injection, XSS,
server-action hardening) to the extent they are live on this feature's actual
code paths. Mechanism (where identity enters `AreaTrend`, the type shape of
the refined name ban) is explicitly the architect's and test seat's, per
AC-8's own note and Residual R1 - this pass states the constraint the
mechanism must satisfy, not the mechanism.

## 1. The real data flow, traced through code (not the doc)

Identity enters the pipeline at `GradeResultBase.student` (`src/lib/grade/
types.ts:213`), present on every `GradeResult` - both `GradedResult`
(`:277-280`) and `UngradedResult` (`:290-293`). Two more identity-bearing
fields exist beside it: `GradedResult.userId?: number` (`types.ts:278`), and
`canvasUserId?: number` on the two `UngradedOutcome` members,
`NotAttemptedOutcome` (`:157`, with `.student` duplicated at `:152`, "byte-
identical to the row's own `student` field") and `GradingFailedOutcome`
(`:165-166`). This matches AC-8's stated set.

`computeClassTrends` (`class-trends.ts:259-355`) is layer A. Its first line,
`:272`, is `const results = gradedResults(entry.run.results);` -
`gradedResults` (`types.ts:204-206`) filters to `GradedResult` only, so
`UngradedResult.student`/`.canvasUserId` never reach this module at all
**today**. Layer A folds `result.rubricAreas` into `AreaTrend` objects that
carry only counts, parsed values and a `summary` string built by
`buildAreaSummary` (`:207-242`) from `resultsWithArea`, `totalResults`,
`direction` and `unscoredCount` - never from `.student`. The type's own doc
comment at `:150-152` states `summary` "carries no student name," which is
true today because nothing in `buildAreaSummary`'s inputs can carry one - see
Finding MINOR-1 for why that guarantee is a comment, not a construction, and
will need to become one the moment identity is threaded into a new field.

Layer C, `composeClassTrendsDraft` (`class-trends-draft.ts:118-178`), is the
function whose **return value is the class-addressed text** - the Markdown an
instructor copies and sends to the whole class via `ClassTrendsDraftPanel.tsx`
(`:89-102`, `Copy` button; `:93` renders it with
`dangerouslySetInnerHTML={{ __html: markdownToHtml(state.markdown) }}`). This
app never itself posts or emails it - `classTrendsDraft.not-postable.test.ts`
(confirmed by running it this pass, see section 5) proves layer C imports
nothing under `app/actions`, `lib/canvas*`, `lib/lms-generation`, `lib/llm`, or
`lib/gemini`. So the class-addressed disclosure surface, precisely, is: **the
string `composeClassTrendsDraft` returns with `status: "ok"`.** Everything
else in `ClassTrendsPanel.tsx` (the counted-trends list at `:143-155`, the AI-
reading list at `:178-200`) is instructor-facing grading-tool UI, never copied
or sent anywhere by this app - that boundary is composition-time, not
component-time, which is why the existing whole-panel `.student` ban
(`classTrends.wiring.test.ts:128-130`) is broader than the hazard: it forbids a
read the instructor-facing per-student list (AC-9) will need to make in the
same file or a sibling the panel renders, which is exactly Residual R1's
collision.

Two functions are the only ones allowed to build a clause for that string:
`renderCountedClause` (`class-trends-draft.ts:69-89`, reads only
`area.displayArea`/`area.direction`) and `renderInferredClause`
(`:104-116`, reads only `observation.concept`/`observation.reading`). Neither
reads `.student`, `.userId`, or `.canvasUserId` - confirmed by reading both
function bodies in full. **But `displayArea` and `concept`/`reading` are all
free text authored by something other than layer A's arithmetic** - `
displayArea` is the instructor's own rubric wording (`class-trends.ts:298`,
`accumulator.displayArea = rubricArea.area.trim() || normalized`), and
`concept`/`reading` are a model's output (`class-trends-insight.ts:200-204`).
Section 2 enumerates what can ride in on that free text.

## 2. Leak paths enumerated

Each path is checked against the REAL code, not assumed. "Class-reachable
today" means the path currently has a way into `composeClassTrendsDraft`'s
output; "class-reachable after N13b" means it becomes live once identity is
threaded into `AreaTrend` per R1/R3, which is undecided (architect's call) and
therefore a probable path, not a proven one.

| # | Path | Mechanism | Status |
|---|---|---|---|
| L1 | `GradeResult.student` / `.userId` direct read | A future per-area accumulator (R1's mechanism) threads `.student` alongside `percentValues` so AC-9's named list can exist; if that same structure - not a separate instructor-only one - is what `renderCountedClause` receives, a name reaches layer C directly. | Not reachable today (layer A never threads identity in); reachable after N13b unless the architect keeps the class composer's parameter type free of any identity field (see BLOCKER-2). |
| L2 | `UngradedOutcome.student` / `.canvasUserId` | `gradedResults()` (`types.ts:204-206`) strips these before layer A ever runs (`class-trends.ts:272`). | Not reachable today. Would only become reachable if a future change folds ungraded rows into the counted path without re-deriving this exclusion - `class-trends.ts:260-271`'s own comment already warns against exactly this for a different reason (false completeness), so any change here is doubly guarded, but the guard is prose, not a type. |
| L3 | `GradeResult.gradedRepo` / `.gradedRef` (GitHub `owner/repo`, often literally a username) | Neither `computeClassTrends` nor `class-trends-draft.ts` reads these fields today. | Not reachable today. **Not in AC-8's stated identifier set at all** - see MAJOR-3. If the architect's per-student attribution mechanism is shared across the Canvas and Repo Grades surfaces (as R3 already requires for the count/denominator), the same sharing could carry `gradedRepo` into whatever structure feeds the class composer. |
| L4 | `label?.trim() \|\| digest.fullName` written into `GradeResult.student` on the Repo Grades path (`src/app/actions/github-repos.ts:618-619`) | This is the SAME field as L1 (`.student`), but on this surface it holds a repo label/GitHub full name, not the roster student (AC-11's own finding). | Same reachability as L1 - if L1 is closed by construction (never handing the class composer anything with a `.student`-shaped field), L4 is closed for free; if L1 is closed only by convention, L4 is a second, independently-worded way to violate it. |
| L5 | Free-text rubric `comment` / `overallComment` containing a name | The FIRST grading pass's own prompt tells the model "Using the student's name is strictly prohibited" (`src/lib/grade/prompts.ts:208`) - **prompt-only, no code check**. `anonymizeGradeResults` (`class-trends-insight.ts:59-69`) strips the `.student` FIELD but copies `rubricArea.comment` and `result.overallComment` VERBATIM into the layer-B prompt (`renderSubmission`, `:129-140`). If a name survives into that text (student self-reference, e.g. quoting their own submission text back, or a model disobeying the instruction), it is now inside the model's INPUT with no field for a filter to key on. | **Live today**, and not exercised by any test - see BLOCKER-1. |
| L6 | Layer B model OUTPUT (`concept`/`reading`) echoing a name from L5's input, or inventing one despite `CLASS_TRENDS_INSIGHT_INSTRUCTIONS` rule 4 ("You were not given any student's name and must not invent one," `class-trends-insight.ts:116` - **prompt-only**) | `parseClassTrendsInsightResponse` (`:234-269`) filters candidates ONLY for `containsForbiddenCompletenessPhrase` (`:256-258`) - no name check. `renderInferredClause` (`class-trends-draft.ts:104-116`) filters ONLY `isLikelySingularSubmissionClaim` (`:99-102`, itself documented as "BEST-EFFORT, NOT A CLOSURE... a model can route around it") - no name check. The surviving text is concatenated straight into `bodyLines` (`:152`) and joined into the returned Markdown (`:164`). | **Live today**, and not exercised by any test - see BLOCKER-1. This is the sharpest path: it requires no code change and no N13b feature at all to exist; N13b's AC-8 is the first criterion that would even ask the question. |
| L7 | A rubric area *name* itself naming a student (e.g. a peer-review rubric criterion titled after the reviewed student) | `renderCountedClause` interpolates `area.displayArea` with **zero** name-based filtering - only `containsForbiddenCompletenessPhrase` is checked, and only on the whole assembled clause/markdown (`class-trends-draft.ts:146,170`), which screens for "the class"/"all students"/etc., never for a proper name. | Live today, narrower than L5/L6 (requires an unusual rubric), but the oracle has no reason to exclude it once it is looking for names in free text at all. |
| L8 | The assignment TITLE (`assignmentName`) itself naming a student (e.g. "Makeup exam - Sarah Chen") | `assignmentName` is interpolated into the class-addressed OPENING LINE at `class-trends-draft.ts:136`, ALWAYS present when status is ok. Its only filter is `containsForbiddenCompletenessPhrase(assignmentName)` at `:127` (a completeness-phrase check, NOT a name check), and the code's own comment at `:123` says it is "instructor-typed and unfiltered by any earlier layer." Source: `entry.assignmentName` (`ClassTrendsPanel.tsx:206` -> `ClassTrendsDraftPanel.tsx:46` -> `composeClassTrendsDraft`). | **Live today** (round-1 check BLOCKER-A). Independent of N13b - the opening line exists now. Neither BLOCKER-1's fix (in `renderInferredClause`) nor MAJOR-1's (over `displayArea`) touches the opening line, so it must be enumerated explicitly or the AC-8 oracle will not seed it. |
| L8 | Small-class / near-exhaustion disclosure ("3 of 3", "3 of 4") | No identifier of any kind reaches the text; the COUNT and its own honest denominator (AC-7) are what disclose. Covered fully in section 4. | Structural, not a code defect - a product-level tension between AC-2 (absolute threshold, any class size) and AC-7 (denominator honesty). |
| L9 | Ordering (slot number / array order) correlating with roster order | Checked directly: `anonymizeGradeResults` assigns `slot = index + 1` over `gradedResults(entry.run.results)` (`class-trends-insight.ts:59-63`), and slot labels appear only inside the layer-B PROMPT (`renderSubmission`, `:129-140`) and the INSTRUCTOR-facing insight list (`ClassTrendsPanel.tsx:178-200`) - never in `composeClassTrendsDraft`'s output, which contains no slot numbers at all (confirmed by reading `renderCountedClause`/`renderInferredClause` in full: neither reads or emits any positional field). | **Checked, not reachable.** No ordering signal exists on the class-addressed side today. |
| L10 | An at-mention / tagging mechanism resolving to a real student | Grepped for a mention feature reachable from this pipeline; none exists on the class-trends/draft path (the app's only "@"-typeahead is the unrelated chat institution typeahead per this repo's own history). | **Checked, not applicable.** Flagged only because the brief named it as a class of leak to rule out explicitly, not to leave unchecked. |
| L11 | Initials, or any other reduced-but-still-identifying label, standing in for a name in a small class | No code path constructs initials today. | Not reachable today; recorded because a future "anonymize by initials" shortcut would not satisfy AC-8 in a class small enough that initials are unique - same failure mode as L8, and the same recommendation (section 4) covers it. |

## 3. Does AC-8's oracle cover every leak path found?

AC-8's stated object is "the CLASS-addressed announcement text, versus the set
of student identifiers present in the run (`GradeResult.student`;
`GradedResult.userId` (`types.ts:278`); and `canvasUserId`
(`types.ts:157,166`))" and its instrument is "seeding graded results with
distinctive student names/ids and asserting none of them appear anywhere in
the class-addressed output."

**No - it covers L1/L2/L4 (typed identifier fields) but not L3, L5, L6,
L7, or L8 (BLOCKER-A)**, because all four of those are strings that carry a name incidentally,
never through a field the oracle's stated identifier set names:

- L3 (`gradedRepo`/`gradedRef`) is a different field than any AC-8 lists.
- L5/L6 (free text in `comment`/`overallComment`/model `concept`/`reading`)
  are not fields on `GradeResult` at all in the sense AC-8 means "identifier" -
  they are prose that MAY happen to contain a name. A test that seeds
  `GradeResult.student` with a distinctive marker and asserts the marker is
  absent from the output will not exercise `renderInferredClause` at all
  unless the test ALSO seeds a `ClassTrendsInsightObservation` (the
  composer's second argument) with that marker in `concept`/`reading` - and
  today NOTHING in `composeClassTrendsDraft` would stop that marker reaching
  the output, because `renderInferredClause` has no name filter (section 2,
  L6). **An implementer who satisfies AC-8 literally as written - seed
  `.student`/`.userId`/`.canvasUserId`, assert absence - can ship with L5/L6
  wide open and pass the checker's stated oracle**, because the oracle's
  identifier set never touches the parameter that carries the risk.
- L7 (a rubric area name containing a proper name) is `displayArea`, again not
  one of AC-8's three named fields.

**The checker's own note about the regex evasion is confirmed, and reproduces
past the exact form the checker flagged.** Measured this pass:

```
node -e '
const re = /\.student\b/;
const cases = [".student", ".students", ".studentId", ".studentName",
  "result[\"student\"]", "const {student} = result",
  "const {student: name} = result"];
for (const c of cases) console.log(JSON.stringify(c), "->", re.test(c));
'
```
Output: `.student -> true`; every other case -> **false**. `\b` requires a
transition between a word character and a non-word character; "student"
followed immediately by another word character ("s", "I", "N") never
produces that transition, so `.students`, `.studentId`, `.studentName` all
evade `classTrends.wiring.test.ts:129`'s `expect(strippedPanel).not.toMatch(
/\.student\b/)`. Bracket access and destructuring evade it for the same
underlying reason: it is a source-text pattern match, not a semantic one. This
guard passes today (measured: `npx vitest run src/app/components/drafted-grades/classTrends.wiring.test.ts` -> `Test Files 1 passed (1)`, `Tests 13 passed (13)`), which is correct against today's code - the finding is about
what happens when R1's planned "refinement" of this same guard lands, if it
keeps the same regex shape.

**Recommendation: the oracle must scan for names as CONTENT, not as field
access, and it must scan every value that reaches `composeClassTrendsDraft`'s
return, not one file's source text.** Concretely, three things the test seat's
oracle needs beyond AC-8's current wording:

1. Seed a distinctive marker into `comment`/`overallComment` on a `GradeResult`
   AND into a hand-built `ClassTrendsInsightObservation.concept`/`.reading`
   passed directly to `composeClassTrendsDraft` - not only into `.student`/
   `.userId`/`.canvasUserId` - and assert the marker is absent from the
   returned Markdown in both cases. This is exactly the reference-implementation
   discipline `seats.md`'s Test seat section already mandates (build it, run
   it red, prove the assertion can fail); today it WOULD fail, which is the
   point - the oracle needs to be built to be red against current code before
   any fix lands, so the fix is checked against a real failing test rather
   than against a described one.
2. Whatever new field the architect adds to carry identity for AC-9's list
   must be excluded by the CLASS composer's own parameter TYPE, not merely
   absent from today's `AreaTrend` - the guard needs to be a compile error,
   the same way `renderCountedClause(observation.reading)` is already a
   compile error today because its parameter type is `AreaTrend`
   (`class-trends-draft.ts:69-72`'s own doc comment states this explicitly as
   the reason that function is safe). A regex over rendered source text is the
   wrong INSTRUMENT for a compile-time property; the type system already is
   one and is not being used for this yet.
3. The oracle must be run against BOTH surfaces' identity shapes (Canvas
   `.student` = roster name; Repo Grades `.student` = repo label per L4/
   `github-repos.ts:619`) - a fixture built only from Canvas-shaped data would
   pass while a repo-shaped leak ships, since the string content differs but
   the field is identical.

**CORRECTIVE RULE (round-1 check BLOCKER-A), derive the set, do not recall it:**
the free-text leak set MUST be derived from the three inputs
`composeClassTrendsDraft` interpolates into its returned Markdown - the opening
line (`assignmentName`, L8), the counted clauses (`displayArea`, L7), and the
inferred clauses (`concept`/`reading`, L5/L6) - not assembled from memory. The
name-filter the AC-8 oracle enforces must therefore scan the WHOLE returned
Markdown (or, equivalently, each of those three inputs), NOT only the two clause
renderers. A filter scoped to `renderCountedClause`/`renderInferredClause` alone
leaves the opening line open, which is exactly how L8 was almost missed.

## 4. Small-class disclosure

AC-2 sets the threshold as an **absolute** count (`missedStudentCount >= 3`,
independent of class size - `docs/n13b-acceptance-criteria.md`'s own AC-2, and
the owner's verbatim quote at `docs/backlog.yml:209`, "three or more students
... an absolute count, not a fraction of the class"). AC-7 requires every
clause to state its OWN honest denominator, never `totalResults`. Composing
those two rules with a small class produces near-total or total disclosure
with **zero names printed**:

- A class with exactly 3 graded results, all 3 missing an area: the clause's
  own honest denominator (AC-7) would read "3 of the 3 submissions that
  included this section" - which is not "some students," it is **everyone
  graded so far**, stated as a fact addressed to the whole class.
- A class with 4 graded results, 3 missing: "3 of the 4..." - the ONE student
  excluded can identify themselves as the exception, and by process of
  elimination in a real classroom (where students generally know their
  classmates), the "3" resolve to "everyone but me," which is a materially
  different disclosure than the aggregate designed by AC-1/AC-2 for a class of
  30, even though both pass identical criteria.

**This is not the same clause as N13a's removed draft floor**, and the two
must not be conflated: `docs/backlog.yml:197`'s note records that the owner
deliberately removed `DEFAULT_CLASS_TRENDS_DRAFT_FLOOR` (a gate on whether to
draft AT ALL below 5 total graded submissions), accepting that a small run can
still produce the unconditional opening line ("based on the N submissions
graded so far") for a tiny N. That line carries no per-area fact and singles
out no subset. AC-7's per-clause denominator is a NEW, more granular
disclosure the owner has not yet been asked about, and the removed-floor
precedent should not be read as already answering it.

**Recommendation (stated, not decided - this is a product call, same shape as
AC-4/AC-5 in the acceptance-criteria doc):** route a subset clause to the
INSTRUCTOR-facing list only, never into the class-addressed text, when its own
denominator (AC-7's basis) falls below a floor - e.g., when fewer than 5 or 6
results carried the area, "3 of 3" and "3 of 4" both stay off the class text
while "3 of 12" or "3 of 30" render normally. This reuses the two-output split
AC-8 already mandates rather than inventing a third mechanism, and it resolves
the AC-2/AC-7 tension without touching either rule's own wording. Two
alternatives exist and are named so the owner has real options, not one
proposal dressed as the only one: (a) keep the clause in the class text but
round/bucket the denominator language below the floor ("a few students," no
exact count) - weaker, because AC-7 exists specifically to forbid an
unstated/rounded basis, so this would need AC-7 re-opened; (b) do nothing
beyond name-stripping and accept the disclosure as the cost of the owner's
"any deduction, three or more, no exceptions" rule - defensible only if the
owner says so explicitly, given the row's own words describe the CURRENT
absence of any subset signal as the defect, not disclosure risk.

This is filed as Residual R6 (section 7) - an owner call, not something this
pass or a test can settle.

## 5. AC-10 confirmed, and why it is also a security property here

Measured this pass, not recalled: `grep -n "FORBIDDEN_PATH_PREFIXES"
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` ->
`:58: const FORBIDDEN_PATH_PREFIXES = ["app/actions", "lib/canvas",
"lib/lms-generation", "lib/llm", "lib/gemini"];` - both `lib/llm` and
`lib/gemini` are present today, closing the gap `docs/loop/leverage.md:160-167`
records (the guard originally shipped without them). Executed this pass:
`npx vitest run src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` -> `Test Files 1 passed (1)`, `Tests 5 passed (5)`. Canary 3 (`:207-242`) walks all seven of layer C's own root
files - `class-trends-draft.ts`, `classTrendsDraftState.ts`,
`ClassTrendsDraftPanel.tsx`, `ClassTrendsPanel.tsx`, `classTrendsEntry.ts`,
`classTrendsRunCohort.ts`, `classTrendsFolderEntry.ts` - and asserts zero
forbidden imports across all of them.

I checked whether this walker is vulnerable to the shared-`visited`-set
soundness gap `docs/loop/traps-spec.md` records elsewhere in this repo (a
walk that shares one `visited` set across multiple roots can mask a
violation reachable only through a second, already-visited edge). It is NOT
vulnerable for THIS test's specific claim: `walkForForbiddenImports`
(`:119-148`) checks `isForbiddenPath` on every edge examined, unconditionally,
the moment that edge is walked (`:132-135`), before the `visited` gate is ever
consulted for the edge's target - the `visited` set only prevents re-scanning
a node's own outgoing edges twice, and any forbidden edge from a shared
dependency is recorded into the single shared `violations` array on whichever
root's traversal reaches it first. Canary 3's claim is a UNION ("do these
seven roots collectively reach anything forbidden"), not a per-root
attribution claim, so the union is correct regardless of traversal order. This
is stated explicitly so a checker does not have to re-derive it: the general
class of defect is real elsewhere in this repo, and I checked for it here
specifically rather than assuming either "it's the same bug" or "it can't
recur here."

**Why AC-10 is a security property, not only a provenance one:** every leak
path in section 2 that is NOT already live today (L1-L4) is closed by the
signal staying arithmetic - a `>= 3` comparison over typed, parsed
`ParsedScore` values (`class-trends.ts:60-106`) cannot itself "decide" to
name a student any more than `classifyDirection` can today. The two paths
that ARE live (L5, L6) are exactly the two that already go through a model.
Reintroducing generation for the SUBSET/threshold signal would not add a
third leak path so much as promote L1-L4 into the same category as L5/L6 -
free text with no typed field to filter on - which is strictly worse than
today's arithmetic-only signal, because a typed count can be tested
exhaustively (AC-2's own fixtures do this at class sizes 4 and 30) and a
model's phrasing cannot be.

**None of this pass's recommendations need a model.** Stated loudly, per the
brief: the fixes in BLOCKER-1/2 and MAJOR-1/3 are a code-level filter over
free text the run already carries (reusing the SAME "run's own known
identifier strings" the app already has in hand - `.student` values and any
`gradedRepo` owner segment - as a denylist to scan model output against,
exactly the class of defense-in-depth `isLikelySingularSubmissionClaim`
already is for a different phrase), and a type-level exclusion at
`composeClassTrendsDraft`'s parameter boundary. If any future design for
these findings is proposed that requires a NEW model call, that proposal
contradicts AC-10 and must be argued explicitly to the owner, never shipped
quietly - this pass finds no reason it would be necessary.

## 6. Ranked findings

**BLOCKER-1 - layer B's model-authored `concept`/`reading` text has no
code-level name filter before it can compose into the class-addressed
draft.**
- Attack: a submission's free text (or the FIRST grading model's own
  feedback, itself only prompt-instructed not to use a name -
  `prompts.ts:208` - not code-enforced) contains a name; `anonymizeGradeResults`
  (`class-trends-insight.ts:59-69`) copies `comment`/`overallComment`
  verbatim (only the `.student` FIELD is stripped); the layer-B model, itself
  only prompt-instructed not to invent or repeat a name
  (`class-trends-insight.ts:116`, rule 4), may echo it into `concept`/
  `reading`; `parseClassTrendsInsightResponse` (`:234-269`) filters only
  forbidden-completeness phrases; `renderInferredClause`
  (`class-trends-draft.ts:104-116`) filters only the singular-submission
  phrase; the name reaches `composeClassTrendsDraft`'s returned Markdown and
  is rendered to the whole class via `ClassTrendsDraftPanel.tsx:93`.
- Fix: add a code-level filter, in `renderInferredClause` or upstream in
  `parseClassTrendsInsightResponse`, that drops any observation whose
  `concept`/`reading` contains any of the run's own known identifier strings
  (`.student` values, and the label segment of `.gradedRepo` on the Repo
  Grades surface) - the same defense-in-depth shape as
  `isLikelySingularSubmissionClaim`, and a pure function, no model needed.
  This is pre-existing (not introduced by N13b) but AC-8 is the first
  criterion that makes it in-scope to fix, since it is the first time this
  repo has stated "a student name can never reach the class-addressed text"
  as a testable requirement.

**BLOCKER-2 - the whole-panel `.student` ban is a regex over source text and
is evadable; R1's planned refinement of this exact guard must not carry the
evasion forward.**
- Attack: the architect's undecided mechanism for AC-9's named list
  introduces a field or a destructuring pattern that carries a student name
  without matching `/\.student\b/` - `.students`, `.studentId`,
  `.studentName`, `result["student"]`, or `const { student } = result`, all
  measured this pass (section 3) to evade the current pattern - inside
  `ClassTrendsPanel.tsx` or whatever sibling file R1 refines the guard to
  cover, and the guard reports clean while the class-addressed composer
  receives a name-bearing value.
- Fix: do not strengthen the regex (this repo's own `seats.md` names that
  move as the wrong one - "RELOCATE/ESCALATE/CONSTRUCTION," never "the same
  mechanism, longer"). Construct the exclusion at the TYPE level: whatever
  new structure carries per-student identity for AC-9 must never be a type
  `composeClassTrendsDraft` (or `renderCountedClause`/`renderInferredClause`)
  can accept as an argument - mirroring how `renderCountedClause`'s own
  parameter type (`AreaTrend`, no name field) already makes
  `renderCountedClause(observation.reading)` a compile error today
  (`class-trends-draft.ts:69-72`'s doc comment states this as the reason it
  is safe). This is architect + test-seat work per R1; this finding states
  the constraint the construction must satisfy.

**MAJOR-1 - `displayArea` (an instructor-authored rubric name) and
`comment`/`overallComment` (free text) are filtered only for forbidden-
completeness phrases, never for names, anywhere in layer A or layer C.**
- Attack: L7 in section 2 - an unusually worded rubric area name containing a
  student's name renders directly via `renderCountedClause`
  (`class-trends-draft.ts:80-89`) with no name check at all, only the
  completeness-phrase check applied to the assembled clause/markdown
  (`:146,170`).
- Fix: the same identifier-string filter recommended for BLOCKER-1 should run
  over `displayArea` too, before it is accepted into a clause - one shared
  function, not two.

**MAJOR-2 - small-class disclosure by exhaustion (L8/L11), a product-level
tension between AC-2 and AC-7.**
- Covered in full in section 4. Recommendation given; decision is the
  owner's; filed as Residual R6.

**MAJOR-3 - AC-8's stated identifier set omits `gradedRepo`/`gradedRef`
(L3), and the repo surface's `.student` carries a different KIND of identity
than the Canvas surface's (L4).**
- Attack: if the architect's per-student attribution mechanism (R1/R3) is
  shared across surfaces, as R3 already requires for the count's identity
  basis, a repo-surface leak could ship because a test fixture built only
  from Canvas-shaped data never exercises it.
- Fix: extend AC-8's oracle to run against a Repo-Grades-shaped fixture too
  (recommendation 3, section 3), or explicitly scope AC-8 to the Canvas
  surface and file the repo-surface privacy oracle as its own row - stated,
  not decided, since this is the same "which seat owns it" question R3
  already routes to the architect.

**MINOR-1 - `AreaTrend.summary`'s "carries no student name" (`class-
trends.ts:150-152`) is a doc comment, not a construction.**
- Currently true because nothing in `buildAreaSummary`'s inputs can carry a
  name - not because anything would stop it if a future field could. Flagged
  so the architect does not thread a new identity-bearing field through
  `buildAreaSummary` by accident once one exists on `AreaTrend`.

**MINOR-2 - confirmed clean, no action: the class-addressed draft renders
through the hardened Markdown renderer.**
`ClassTrendsDraftPanel.tsx:93` calls `markdownToHtml` from `src/lib/
markdown.ts` (confirmed via `src/lib/markdown.test.ts`'s own header, "Regression
coverage for a link/attribute-injection hole in markdownToHtml," and its
suite of `javascript:`/`data:`/`VBScript:`/attribute-injection cases) - not
`markdown-lite.ts`, the other renderer in this repo, which per this repo's own
history has no bold/italic/code/list support and was not hardened the same
way. No XSS defect found on this path this pass.

**MINOR-3 - confirmed clean, no action: this route is not a new server-action
or egress surface beyond what already exists.**
`src/app/api/class-trends-insight/route.ts` gates on `requireUser()` (`:97`,
matching the precedent at `course-intel/ask/route.ts:70-71` this route's own
comment cites), declares `maxDuration = 60` matching the Hobby platform cap,
and runs a self-imposed wall-clock budget (`TOTAL_BUDGET_MS = 50_000`,
`:47`) under that cap - the same shape `docs/loop/seats.md`'s Reliability
section asks for. `parseGradingRunEntry` (`:72-87`) does minimal but present
structural validation of the posted body before reading `.run.results`. This
route is pre-existing, not introduced by N13b, and nothing in N13b's stated
scope adds a new route or a new egress target - the risk this pass is
concerned with is what the EXISTING route's model call can smuggle into the
existing class-addressed composer (BLOCKER-1), not a new attack surface at the
transport level.

## 7. Residual register (owner + instrument + step; each owed a backlog entry)

I may write only this file; these are handed to the orchestrator to record in
`docs/BACKLOG.md` under N13b at disposal/push. Numbered to extend, not
duplicate, the acceptance-criteria doc's R1-R4 - each states which one it
extends.

- **R5 (extends R1) - layer B's free-text name-leak channel (BLOCKER-1) and
  the rubric-area-name channel (MAJOR-1).** Owner: architect (the filter's
  shape/reuse point) + test seat (the oracle). Instrument:
  `class-trends-insight.ts:59-69,109-117,234-269`,
  `class-trends-draft.ts:80-89,99-116`, `prompts.ts:208`. Step: the test
  seat's AC-8 oracle must include a case that seeds a distinctive marker into
  a hand-built `ClassTrendsInsightObservation` and into `displayArea`,
  proves it RED against current code (reference-implementation discipline,
  `seats.md`'s Test seat section), then the architect decides where the
  identifier-string filter lives (reusing the `isLikelySingularSubmissionClaim`
  pattern) and the fix ships in the same wave as AC-8/AC-9.

  ORCHESTRATOR RULING 2026-09-29 (checker informational (i), and extending R5
  to cover L8 assignmentName): L5/L6 (model insight) and L8 (assignmentName) are
  LIVE, PRE-EXISTING class-addressed name leaks that do NOT depend on N13b
  existing. The name-filter fix (a pure-function identifier-string denylist over
  the WHOLE returned Markdown - opening line + counted + inferred clauses, per
  the section-3 corrective rule) is therefore designated N13b's WAVE 1: it lands
  FIRST and independently, gated only on its own oracle, NOT on the per-student
  attribution UI (AC-9) or the identity seam (R1/R3). If N13b's later stages
  (the named instructor list, the repo identity channel) slip or are deferred,
  this security fix still ships. The coupling to N13b is delivery machinery
  only; the fix is not conditional on the new feature. The wave-plan seat must
  cut it as the first, standalone wave.
- **R6 - small-class disclosure floor (MAJOR-2), a product decision.** Owner:
  repo owner. Instrument: section 4's worked arithmetic (3 of 3, 3 of 4) plus
  AC-2's existing test fixtures at class sizes 4 and 30. Step: one batched,
  non-gating owner question at scope hand-off, same step-shape as AC-4/AC-5's
  R2 in the acceptance-criteria doc - recommending "route below-floor subset
  clauses to the instructor-only list" (section 4), with the two named
  alternatives given as real options.
- **R7 (extends R3) - AC-8's oracle coverage on the Repo Grades surface
  (MAJOR-3).** Owner: architect + test seat. Instrument: `github-repos.ts:
  618-619`, `repo-grades/repoGradesRows.ts:112-119`. Step: R3's own architect
  pass states, alongside the count/denominator identity basis it already
  owns, whether AC-8's privacy oracle is proven against a Repo-Grades-shaped
  fixture in the same wave or is explicitly scoped to Canvas and filed
  separately - either is acceptable, silence is not.
- **R8 - the type-level construction BLOCKER-2 asks for.** Owner: architect
  (shape) + test seat (proving the construction actually makes the excluded
  state a compile error, not merely undocumented). Instrument:
  `classTrends.wiring.test.ts:128-130` (the guard R1 already plans to
  refine), `class-trends-draft.ts:69-72` (the existing precedent for a
  parameter-type exclusion). Step: the same architect pass and test-seat
  oracle R1 already owns; this residual is the acceptance condition on that
  work - the refined guard must not be a longer or better-anchored regex.

## 8. What is machine-checkable here versus a reading or owner-verification claim

**Machine-checkable today, with a real instrument:**
- The regex-evasion claim (section 3) - reproduced with `node -e`, the exact
  command given, re-runnable by the checker.
- AC-10's current state - `grep -n` plus an EXECUTED test
  (`classTrendsDraft.not-postable.test.ts`, 5/5 passing, command given).
- The whole-panel guard's current pass state - EXECUTED
  (`classTrends.wiring.test.ts`, 13/13 passing, command given).
- The walker's soundness for its stated (union) claim - read in full, reasoned
  from the code, not merely asserted.
- L1-L4, L9, L10's current non-reachability - read in full against the real
  function bodies, not inferred from a doc.
- BLOCKER-1/BLOCKER-2/MAJOR-1's underlying defect (missing filter, evadable
  regex) is machine-checkable BY CONSTRUCTION once a test exists - none does
  yet, which is the finding.

**Reading claims, not executed here (no component renders under vitest,
per `docs/loop/this-repo.md` section 6):**
- Whether the two outputs (class draft vs instructor list) render as visually
  distinct enough that an instructor would not paste the wrong one - this is
  already OV-2 in the acceptance-criteria doc; this pass adds no new OV item,
  but names the security angle explicitly: a UI that reads as one block
  invites copying the wrong one, which is a real channel for L1-L7 that no
  code guard closes.

**Cannot be verified in this environment at all (`docs/loop/this-repo.md`
section 6):**
- Whether a REAL deployed model, given real submission text, actually
  produces a name in `concept`/`reading` in practice, and how often. No
  `.env`, no live `GEMINI_API_KEY` here - every LLM path in this repo is
  exercised through mocks. This pass proves the CODE has no structural guard
  against L5/L6 (BLOCKER-1); it cannot measure the real-world frequency of
  either path firing. That is exactly why the fix is a code-level filter
  rather than "trust the prompt more" - the prompt-only defenses already in
  place (`prompts.ts:208`, `class-trends-insight.ts:116`) are unverifiable
  here by construction, and a defense that cannot be tested locally is not a
  defense this loop can certify.

## 9. Out of lane (deliberately not decided here)

- The exact shape of the type-level construction BLOCKER-2/R8 asks for -
  architect.
- Where per-student identity enters `AreaTrend` (a new field, a parallel
  structure) - architect, per the acceptance-criteria doc's own out-of-lane
  list, unchanged by this pass.
- The frozen oracle and sabotage mutants for AC-8 itself - test seat, per R5/
  R8's step above.
- Whether R6's floor recommendation is adopted, and at what number - owner.
