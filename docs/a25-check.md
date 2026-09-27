# A25 scope check, round 1

Subject: `docs/a25-scope.md` at commit b26e072 (`git log --all --oneline --
docs/a25-scope.md` returns exactly one commit, b26e072; `git log --oneline
b26e072..HEAD -- docs/a25-scope.md` is empty and `git status --short
docs/a25-scope.md` is empty, so the working-tree copy under check IS the
committed one).

Fresh checker. I did not author the scope. Every quantity below names the
command that produced it, run from the Bash tool in this checkout on
2026-09-27 unless stated otherwise. Where the scope's own citation was correct
at b26e072 and has since drifted, I say so with both measurements.

**Snapshot warning.** `src/app/components/grading-recording/GradingRecordingPanel.tsx`
is being edited by a concurrent agent (`git status --short` at the start of
this pass lists it modified). Any citation of that file below is a snapshot;
re-check before relying on it. My load-bearing findings do not rest on it.

Verdict and counts are in section 10.

---

## 1. What is sound, stated once and not padded

These verified exactly as written, at b26e072 and (except where noted) at
HEAD. I am not re-litigating them.

- **Half A of the central claim holds.** `computeClassTrends` takes exactly
  one entry: `grep -n "export function computeClassTrends"
  src/lib/grade/class-trends.ts` returns `259:export function
  computeClassTrends(entry: GradingRunEntry): ClassTrendsReport`. Canary:
  `grep -n "export function computeClassTrendsZZZ" src/lib/grade/class-trends.ts`
  exits 1, so the pattern is discriminating rather than matching everything.
  I widened the absence search beyond the scope's one pattern and it still
  holds: `grep -rn "Array<GradingRunEntry" src | wc -l` returns 0,
  `grep -rn "readonly GradingRunEntry" src | wc -l` returns 0,
  `grep -rn "ClassTrendsReport\[\]\|Array<ClassTrendsReport" src` exits 1, and
  `grep -rn "GradingRun\[\]" src --include=*.ts --include=*.tsx | grep -v
  "GradingRunEntry"` returns only two unrelated `GradingRecordingLogGradingRun`
  hits. The scope's 8 hits for `GradingRunEntry\[\]` reproduce exactly (8, at
  `actions/grading.ts:282` today / `:280` at b26e072, `grading-drafts.ts:33`,
  `grading-review-rows.ts:95,109,154`, `steps.grading-cartridge.ts:45`,
  `steps.grading-draft-flow.ts:224`, `steps.grading-run.ts:426`).
- **Half B holds, with canaries.** `listPendingGradingDrafts`
  (`src/lib/grading-drafts.ts:248` today, `:242` at b26e072) carries
  `.eq("status", "pending")`; `markGradingDraftReviewed` does not delete;
  `deleteGradingDraft`'s only caller is `deleteGradingDraftAction`
  (`src/app/actions/grading.ts:422-430` at b26e072, which is what the scope
  cited). `grep -rn "reviewed" src/app/components/drafted-grades/*.tsx` exits 1,
  and the canary `grep -rln "entry" src/app/components/drafted-grades/*.tsx |
  wc -l` returns 3, proving the glob resolves and the negative is real.
- **Line counts.** `wc -l src/app/components/DraftedGradesTab.tsx` returns 898
  and PowerShell `@(Get-Content 'src/app/components/DraftedGradesTab.tsx').Count`
  returns 898. `wc -l src/app/components/RecordingTab.tsx` returns 917 and
  `@(Get-Content 'src/app/components/RecordingTab.tsx').Count` returns 917.
  Both unchanged since b26e072 (`git show b26e072:<path> | wc -l` returns 898
  and 917). For the record, the forbidden instrument disagrees by 44 and 55
  here: `(Get-Content <path> | Measure-Object -Line).Lines` returns 854 and 862.
  The scope used the right instruments and got the right numbers.
- `class-trends.ts` 355, `class-trends-insight.ts` 270, `class-trends-draft.ts`
  228, `classTrendsRunCohort.ts` 181, `classTrendsFolderEntry.ts` 113,
  `classTrendsEntry.ts` 54 (one `wc -l` over all six). All six exact.
- `LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:41`
  (`grep -n "LIMIT = 1000"`). Exact.
- `Course.id` at `src/lib/supabase/courses.types.ts:63` and `term` at `:65`.
  Exact.
- The identity DROP POINT is real and the scope located it correctly.
  `steps.grading-run.ts:397-408` declares `PlanRow` with `courseId: string`,
  `:200` and `:223` populate it from `tile.id`, `:533` reads
  `tileMap.get(offlineRow.courseId)` - and the two `runs.push({...})` sites
  (`:497-505` online, `:554-560` offline) copy `courseName`,
  `assignmentName`, `canvasUrl`, `institution`, `assignmentId`,
  `pointsPossible`, `offline` and never `courseId`.
  `grep -n "courseId" src/lib/grade/types.ts` exits 1; canary
  `grep -c "courseName" src/lib/grade/types.ts` returns 1.
- The `grading_drafts` schema section is accurate, including the honest
  "4 files, all read" (`grep -rln "grading_drafts" supabase/migrations/`
  returns 4; the fourth, `20261004000000_generated_artifacts.sql`, mentions the
  table only in a comment and alters nothing - I opened it).
- `stripGradeResultForDraft` keeps `rubricAreas` (`grading-review-rows.ts:59`),
  so the raw material genuinely survives into the stored payload. The
  over-fetch concern in 2.3 is real.
- The persistence absence (section 4) is TRUE. All four of its commands
  reproduce: `grep -rn "ta-rec-"
  src/app/components/recording/recording-split.structure.test.ts | wc -l`
  returns 90; `grep -rln "ta-drafts" src/app/components/drafted-grades/` exits
  1; `find src/app/components/drafted-grades -name "*.test.ts" | xargs grep -l
  "ta-drafts"` exits 1 (and the `find` is NOT vacuous - it returns 6 files, so
  the xargs actually ran); `grep -rl "ta-drafts" src --include=*.test.ts` exits
  1. My own decisive control: `grep -rln "ta-drafts" src` returns
  `DraftedGradesTab.tsx` and `home/useAppNavigation.ts`, so the literal string
  is greppable and the negatives are not spelling artefacts.
- No disposition table is owed. Confirmed: no prior version exists.
- The scope's own closing gate used `npm run test:paths --`, not a raw
  multi-path `vitest run`. Correct, and no gate or instrument anywhere in the
  document passes two or more paths to a bare runner.

---

## 2. BLOCKER 1 - section 2.4's blocking premise is false. The rule is invented, and live code contradicts it.

Section 2.4 is titled "The privacy rule that constrains the obvious cheap fix"
and states the foreclosure is "by existing precedent, not by a new rule this
scope invents". Both citations were opened. Neither forecloses what the scope
says it forecloses, and a third piece of live code contradicts the derived rule
outright.

**Citation 1, `src/app/components/repo-grades/index.tsx:170-176`.** The quote
is verbatim and the lines are right (`grep -n "never persisted to localStorage"
src/app/components/repo-grades/index.tsx` returns `171`; the comment opens at
`170`). But read what it is about and why: it governs **per-cell edited,
un-posted scores**, and the stated reason is "a typed but un-posted score
surviving a reload would be **surprising**". That is a UI-staleness rationale,
not a privacy or data-minimization rule, and its object is un-posted instructor
input - not a computed aggregate over already-reviewed runs, which is what the
cheap fix would cache. The precedent does not reach the target.

**Citation 2, `accommodations.structure.test.ts:83-93`.** The scope calls this
"a structure-test canary". Open it. The test at `:83` is titled "the
data-access module (src/lib/accommodations.ts) never references localStorage or
sessionStorage" and its own body says, in the source:

    // Negative search - needs a canary to mean anything (this-repo.md's
    // standing rule). NOT performed against this file in this build wave:
    // src/lib/accommodations.ts belongs to Wave 1 (data layer) and this
    // wave's brief forbids editing Wave 1 files, even temporarily for a
    // canary.

So the instrument the scope names as a canary is an explicitly un-canaried
negative search, and the file says so. Its scope is one file - `LIB_SOURCE`,
i.e. `src/lib/accommodations.ts` - and one effect block in one panel
(`:96`, which is the test that actually carries the "Ruling N4-L" label). The
scope attributes to N4-L a general rule, "in-memory only for anything that is
student/grading data rather than UI chrome". `grep -rn "N4-L" src docs` returns
three hits: `accommodations.structure.test.ts:96`,
`AccommodationsPanel.tsx:235` ("Roster (in-memory only - Ruling N4-L"), and
`docs/a25-scope.md:233` itself. The ruling as it exists in the tree is about a
ROSTER in one panel. The generalisation is the scope's own.

**The contradiction that settles it.** The derived rule the scope states "for
the implementer" is that "anything that is graded content rather than a UI
preference - must be re-fetched from Supabase on each view, never cached into
`localStorage`". The app already does the opposite, deliberately, today.
`grep -rn "ta-rec-grade" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
returns `ta-rec-grade-table` declared at
`src/app/components/grading-recording/useGradingRows.ts:187`, with its
localStorage read/write in
`src/app/components/assessment-shared/useAssessmentRowStore.ts`. That key holds
the grading table, and the user-facing quota-degradation message the app ships
for it names its contents exactly (`useGradingRows.ts:196-197`):

    "There was not enough room to also save submission text, so only student
    names, roster matches, scores and feedback were saved."

Student names, scores and feedback, persisted to `localStorage` on purpose,
with a documented reduced-write policy. That is the same class of data the
scope says precedent forbids persisting, persisted by a live surface.

**And an owner decision already settled the direction, before b26e072.**
`git show b26e072:docs/owner-decisions-2026-09-23.md | grep -n "^## "` shows
DECISION 3 was present when the scope was written: "A39: DROP the rubric
non-persistence policy - the owner chose: drop it", with the explicit note that
"the stated policy must be deleted where it is asserted, not merely
contradicted elsewhere". The scope never cites the decisions file
(`grep -n "owner-decision\|DECISION" docs/a25-scope.md` exits 1). Later the
same day the owner went further - DECISION 10, added after b26e072 by fae3035:
"A stored rubric persists on the instructor's own device. Accepted... it is the
same class of data the app already persists there under other keys."

This is the same defect the sibling A24 check found and that b26e072's own
commit message records against A24 ("the privacy rule it says forbids the cheap
fix asserts only a four-key list"). A25 repeats the mechanism with different
citations.

**Why it is a blocker and not a note.** 2.4 is a constraint stated "for the
implementer", and it is the only thing in the document that rules out the
cheapest version of the feature. If it is wrong, an architect wave inherits a
prohibition that has no author and no enforcer, and the caching question was
never actually asked.

---

## 3. BLOCKER 2 - the recommended gate makes the feature unreachable in exactly the state it exists for. Every gate stays green.

This is the silent-green failure, and it is the one the brief asks for by name.

Wave 2 says the panel is "gated on `effectiveCourseFilter !== "all"` (`:368`)
so the panel appears once a specific course is selected", and section 3.1 sells
Candidate 1 partly because that reuse costs "zero new persisted keys".

Trace `effectiveCourseFilter` in the host. All four facts are from
`grep -n` / `sed -n` on `src/app/components/DraftedGradesTab.tsx` at HEAD
(unchanged since b26e072):

1. `:151` and `:173` - `drafts` is loaded by `listPendingGradingDrafts`, the
   PENDING-ONLY list. There is no other loader in the file.
2. `:362` - `const courseNames = collectCourseNames(drafts || []);`
3. `:368` - `const effectiveCourseFilter = resolveEffectiveCourseFilter(courseFilter, courseNames);`
4. `:486` - the course `<MenuItem>` options are exactly `courseNames`, plus a
   hardcoded `"all"` at `:485`.

And `resolveEffectiveCourseFilter`'s own doc comment, in the file the scope
cites (`src/lib/grading-draft-view.ts:71-76`), states the consequence in
words:

    Falls back to "all" when the persisted course filter no longer matches any
    loaded draft (e.g. that draft was reviewed and left the pending list)

So: `effectiveCourseFilter` can be non-"all" only for a course that has at
least one **pending** draft at that moment. A25's subject is a term of
**reviewed** runs. A course whose graded runs have all been reviewed - the
normal, and eventually the only, end state of the review workflow, and the only
state in which a term trend has anything to show - contributes no name to
`courseNames`, so it is not even selectable in the dropdown, so
`effectiveCourseFilter` is forced to `"all"`, so the panel never renders.

The failure mode is worse than "sometimes hidden": the panel would appear only
while an UNREVIEWED draft happens to exist for that course, and would
disappear the moment the instructor finishes reviewing it. The history becomes
visible exactly when it is least wanted and invisible exactly when it is the
point.

Nothing in this repo can catch it. `docs/loop/this-repo.md` section 2: no
component is rendered by any test. tsc, lint, `next build`, vitest and every
structure test pass on a panel that is mounted behind a condition that is
always false in steady state. `git status --short` passes. The wave gate
passes. The only instrument that fires is an owner opening a browser - which
is R-A25-1, whose direction of failure is written as "Fails if the gated panel
does not appear when a course is selected". Under this design the course
cannot be selected, so even the residual is pointed at the wrong event.

This also makes the placement itself suspect independently of the gate:
Drafted Grades is, by construction, the pending-drafts surface. A term-history
panel is a reviewed-drafts surface. Section 3.1 chose the host on line
headroom and gate strictness and never asked whether the host's own data
population is the one the feature reads.

**This is the weakest requirement in the document** on the brief's own
question: the single clause most likely to be implemented exactly as written
and still produce a bad result. Implemented verbatim, it produces a feature
nobody can reach.

---

## 4. BLOCKER 3 - the identity fork is stated as exhaustive and omits the option already implemented on the recommended surface

Section 2.2 opens "There is no stable course identifier on a stored run",
presents exactly two options, and recommends Option A (raw `courseName` string
equality) with the collision hazard pushed to residual R-A25-2.

A stable course identifier IS recoverable from a stored `GradingRunEntry`
today, at zero type cost, by a function the app already applies to that exact
field on that exact surface.

- `GradingRunEntry` carries `canvasUrl: string`
  (`src/lib/grade/types.ts:362-371` at HEAD).
- `src/lib/canvas-url.ts:87` exports
  `parseCanvasCourseId(url: string): string | null`.
- The recommended host already does it, to a `GradingRunEntry`:
  `src/app/components/DraftedGradesTab.tsx:390`, inside `submissionTarget`:
  `const courseId = parseCanvasCourseId(entry.canvasUrl);`
- So does the workflow step the scope cites as the drop point:
  `steps.grading-run.ts:676`,
  `const courseId = parseCanvasCourseId(entry.canvasUrl ?? "");`
- `grep -rn "parseCanvasCourseId" src --include=*.ts --include=*.tsx | grep -v
  "\.test\."` returns 80-odd non-test call sites across the app, so this is the
  app's ordinary way of getting a course id out of a stored URL.

Call it Option C: group by `parseCanvasCourseId(entry.canvasUrl)`, falling back
to `courseName` only for entries where that returns null. Its honest limit,
which I measured rather than assumed: the OFFLINE push site
(`steps.grading-run.ts:554-560`) sets `canvasUrl: ""` and `offline: true`, and
`parseCanvasCourseId("")` is null, so offline runs get no id this way - which
is precisely where `courseId: tile.id` was dropped (`:223`). So Option C covers
the online majority for free and leaves a named, typed-distinguishable
(`offline?: boolean`) remainder. That is a materially different and cheaper
third branch than either option the scope offers, and the architect wave was
handed a two-way fork.

**Worse, the app's own documented identity rule says not to do Option A.**
`src/lib/course-canvas-url-match.ts:1-7` opens: "Matches on
parseCanvasCourseId(url) AND host, **never raw string equality**", and its
matching rule at `:180` reads "COURSE ID must match on both sides
(parseCanvasCourseId), full stop." The scope characterises `courseName` string
equality as "the SAME mechanism the Drafted Grades course filter already uses",
therefore "consistent with precedent". The repo has a dedicated module whose
whole purpose is the opposite ruling on the same question, and the scope does
not mention it.

**And R-A25-2 is not a residual.** Its Instrument column is "A real instance of
two same-named courses or a renamed course, reported by the owner" - an event,
not an instrument. Its Step column is "Only if/when reported - not before". A
step that is "when someone notices" is not a step, and
`docs/loop/iteration-caps.md` is explicit: "A residual without an owner, an
instrument and a step is a deletion. Call it that." The failure it defers is
silent (two sections of one course merged, or a term's history split at a
rename) and lands in a reading an instructor uses to talk to a class about
grades. Deferring a silent grade-adjacent failure to "if reported" is deferring
it to never.

---

## 5. BLOCKER 4 - the named instrument for Option A's precedent produces no output

Section 2.2 writes: "`grep -rn "entry.courseName ===" src/lib/grading-draft-view.ts`
shows `gradeMatchesFilters` (`grading-draft-view.ts:44`) and
`collectCourseNames` (`:53-60`) both key on the raw string."

Run it:

    grep -rn "entry.courseName ===" src/lib/grading-draft-view.ts
    -> no output, exit 1

At b26e072 as well: `git show b26e072:src/lib/grading-draft-view.ts | grep -n
"entry.courseName ==="` exits 1, and
`git log --oneline b26e072..HEAD -- src/lib/grading-draft-view.ts` is empty, so
the file has not changed and the command produced nothing on the day it was
cited. Canary that the file and pattern style are fine:
`grep -rn "entry.courseName" src/lib/grading-draft-view.ts` returns lines 45,
48, 57, 66.

What is actually there (`grep -n "^export function"
src/lib/grading-draft-view.ts`): `gradeMatchesFilters` begins at `:35`, not
`:44`, and its comparison is `!==`, at `:48`. `collectCourseNames` is `:53-62`
and does `names.add(entry.courseName)` at `:57` - it COLLECTS, it never
compares, so "both key on the raw string" is not what that function does.

The substance survives by luck: `courseName` string inequality at `:48` is
real, so the conclusion happens to be true. That is exactly the failure shape
this repo has recorded four times - an instrument that reports the right answer
without having checked. Entry gate 1 of `iteration-caps.md` binds here: a
citation attributed to a command that does not produce it is an unmeasured
claim, and this one is load-bearing for the Option A recommendation.

For completeness, `grep -rn "courseName ===" src --include=*.ts --include=*.tsx
| grep -v "\.test\."` repo-wide returns two hits, neither a course-identity
comparison (`api/class-trends-insight/route.ts:78` is a `typeof` guard,
`repoGradesLog.ts:163` a null check). Canary: the same grep for
`courseNameZZZ ===` returns 0. So the scope's "nowhere else" claim about
`courseName` equality is true; only its cited proof is not.

---

## 6. BLOCKER 5 - R-A25-6's removal test cannot fail for the reason it claims

R-A25-6's instrument: "A pure-function test on the new reducer: feed it two
`GradingRunEntry` fixtures for the same course with contrasting scores in one
area across two assignments, assert the term report reflects BOTH (not just the
latest) - deleting the multi-row read (feeding it only the latest entry) must
make that assertion fail".

Apply `docs/loop/leverage.md`'s own check, verbatim: "Name the exact line or
call you would delete to remove the advantage, then say which assertion's
observed value changes as a result."

The claimed advantage is the CORPUS read-back: the multi-row query
(`listReviewedGradingDrafts` in `src/lib/grading-drafts.ts`) and the action
wrapping it (`src/app/actions/grading.ts`). Delete either and the pure reducer
in `src/lib/grade/class-trends-history.ts` is untouched: handed two fixtures it
still folds two fixtures, and the assertion's observed value does not change.
The parenthetical "feeding it only the latest entry" is a change to the TEST's
input, not a deletion of production code - so the test is red only when the
test is rewritten, which no deletion of the feature causes.

`leverage.md` names this failure by name: "another asserted a pure function's
return value while leaving the routing that reaches it unguarded" is one of the
three of four candidates it records as looking like removal tests and not being
ones. A residual whose instrument cannot fire is the deletion class again, and
here it is the instrument for the document's central leverage claim.

A buildable alternative exists and should be named instead: a wiring/structure
assertion that the new panel's fetch path calls the multi-row action, plus a
`FORBIDDEN`-style prefix ban of the sort
`src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts`
already implements in the same directory - the instrument
`leverage.md` records as sabotage-proven. That is a different KIND of
instrument, which is what the caps card requires at the second attempt.

---

## 7. MAJOR findings

**M1 - the reuse survey missed the closest comparable subsystem in the tree,
and it changes the design.** Section 1 says it "traced exhaustively" and
concludes "there is no accumulator to make reachable". `grep -n
"course-intel\|concern\|engagement\|submissions-grid" docs/a25-scope.md`
returns only two incidental uses of the English word "concern" (`:321`,
`:322`). The scope never looked at `src/lib/course-intel/`.

What is there (all from `wc -l`, `grep -n "export function"` and reading the
headers):

- `src/lib/canvas/submissions-grid.ts` (264 lines), whose header opens
  "Course-wide submission grid: every submission in a course, in ONE paginated
  read, independent of assignment count."
- `src/lib/course-intel/types.ts:189`: `byAssignmentId: Readonly<Record<string,
  StudentSubmissionFact>>` on a per-student record - a cross-assignment
  structure.
- `src/lib/course-intel/engagement.ts:435` exports
  `computeEngagementSet(args: ComputeEngagementArgs): EngagementSet`, 906
  lines, which reduces ACROSS assignments; `types.ts:555` documents a rendered
  fact "3 of 7 assignments missing" built in code - a cross-assignment
  aggregate with a stated denominator, which is precisely the shape section 5
  proposes to build.
- `src/lib/course-intel/concern.ts` (277 lines) is a pure, no-model-call
  reducer over typed numbers - the GUARANTEED shape section 5 claims A25 would
  originate.
- It is reachable: `src/app/components/course-intel/index.tsx` and
  `grep -rln "course-intel" src/app --include=*.tsx | grep -v
  "src/app/components/course-intel/"` returns `src/app/page.tsx`.
- And it keys on a STABLE course id: `course-intel/canvas-readers.ts:57` passes
  `canvasCourseId` through, resolved by `parseCanvasCourseId` at
  `api/course-intel/ask/route.ts:525`.

I am not claiming A25 already exists - `grep -rln "trend\|Trend"
src/lib/course-intel/` returns nothing, and Canvas carries no rubric-area
breakdown from this app's grading, so rubric-area term trends genuinely are
absent. **The strongest version of the already-exists argument, stated plainly
as the brief asks:** a cross-assignment, course-scoped reducer with stated
denominators, no model call, a stable course id and a live surface already
exists in this tree. A25 as scoped builds a second one, over a weaker join key,
on a pending-drafts surface, without ever comparing itself to the first. At
minimum the architect wave needs that comparison; at most, the honest shape is
an additional signal inside the existing subsystem rather than a new one.

This is also why B3 matters more than it looks: the identity problem the scope
solves with string matching is a problem the comparable subsystem does not
have.

**M2 - three "measured this pass" gate line numbers are `this-repo.md`'s stale
figures, quoted verbatim.** Section 3.1 says of Candidate 2 "Measured this
pass, NOT inherited from A16's note", then gives the recording-split counts as
12 at `:132`, 11 at `:187`, and `panelTargets.size === 11` at `:219`. Actual
(`grep -n "toHaveLength(12)\|toHaveLength(11)\|panelTargets.size).toBe(11)"
src/app/components/recording/recording-split.structure.test.ts`): `143`, `198`,
`230`. The same at b26e072 (`git show b26e072:<path> | grep -n ...` returns
143, 198, 230) and the file is unchanged since
(`git log --oneline b26e072..HEAD -- <path>` is empty). `132`, `187` and `219`
are exactly the three numbers `docs/loop/this-repo.md` section 3 prints. So the
paragraph that announces re-measurement inherited three numbers unmeasured, all
three wrong by 11. `iteration-caps.md` entry gate 1, and the card itself warns
about this ("An A8 checker caught a seat citing this card's own 64 as a
measured quantity").

**M3 - the wrong instrument is named as binding Candidate 2.** Section 3.1
computes RecordingTab.tsx's "83 lines of headroom ... Against the 1000-line
ceiling" and, in section 3.1's Candidate 1 paragraph, attributes that ceiling
to `src/file-size-ceiling.structure.test.ts:41`. RecordingTab.tsx is
DELIBERATELY EXEMPT from that test: `grep -n "RecordingTab"
src/file-size-ceiling.structure.test.ts` returns `:52`, inside
`COVERED_BY_RECORDING_SPLIT_CHECK`, whose comment says re-failing these paths
"would be a duplicate report". The gate that actually binds it is
`recording-split.structure.test.ts:58-64` ("should keep RecordingTab.tsx under
1000 lines", via `countLines`). The number survives (917 either way, since
`count-lines.ts` matches `@(Get-Content).Count`), but an architect told to
check the wrong file will conclude the file is uncovered.

**M4 - section 4 contradicts an owner decision that existed at b26e072.**
Section 4 concludes "a new key added under `drafted-grades/` today has no
canary to bump, and also gets none for free - if the architect wants one, it
must be written new, not 'bumped.'" DECISION 3, present in
`git show b26e072:docs/owner-decisions-2026-09-23.md` at `:99-100`, reads:
"Every new control persists under a `ta-` prefixed key, and the relevant
exact-key-set canary tests **must be bumped in the same commit**." That is an
obligation; the scope renders it as the architect's preference. The
subsequently-added DECISION 9 (fae3035) supplies the transition rule for
exactly this case - "when a SIXTH key lands in that directory, the exact-set
canary is written then, covering all of them... Without that clause this is a
permanent hole rather than a deferral" - and the scope's silence on the
obligation is what makes the arithmetic in m1 below matter.

**M5 - Wave 1 does not contain the caller of its own new export, and the scope
claims every wave does.** Section 6's preamble: "every wave below deliberately
includes the file that CALLS or RENDERS the new export". Wave 1's list is
`src/lib/grade/class-trends-history.ts` (new reducer),
`src/lib/grading-drafts.ts` (new list function),
`src/app/actions/grading.ts` (new action). The action calls the list function,
so that export is covered. Nothing in Wave 1 calls the REDUCER - its only
caller is Wave 2's panel. `docs/loop/seats.md:160-164` states the rule and its
single exception: "every wave's file list must include the file that calls each
new export... The one legal exception is a type-only module, which emits no
runtime code". A pure reducer is not type-only. Wave 1 as listed ships dead
code with every gate green, and `seats.md:173` makes this the checker's
literal question ("Name the wave that does not"): Wave 1.

**M6 - the leverage claim's CORPUS half does not survive the corrected
baseline, and the scope misdiagnoses why it is thin.** `docs/a39-research.md`
section 5.3 is explicit: "a chat CAN remember a rubric... The row's premise
that 'a chat cannot remember a rubric' is false for any Projects user, and a
leverage claim built on it would fail a check. **What survives is narrower and
worth more: provenance.**" Section 5.2 puts unattended runs as the only
advantage the research could not weaken; 5.1 recasts scale as per-submission
isolation under identical terms; 5.4 reduces LMS write-back to cost, not
capability.

The scope gets half of this right - it acknowledges the falsification and
re-points CORPUS at "the app's memory is populated automatically by the
instructor's own ordinary use... with no separate re-entry step". But that is
REMOVED SETUP, which `leverage.md`'s own negative example classifies as the
thin, click-cost branch, not as CORPUS earned. The scope then declares the
claim "real once N13b exists, thin before it" and routes the whole thinness to
N13b's absence. That diagnosis is wrong in a way that misdirects the AC seat:
N13b enriches the per-area SIGNAL; it does nothing to convert removed-setup
into a categorical advantage. The half that genuinely survives is the one the
scope states second and then does not build the claim on - a counted aggregate
over typed `rubricAreas` with a stated denominator and no model call, which is
GUARANTEED, and which is adjacent to the research's surviving word,
provenance. Waiting for N13b is therefore the wrong remedy for the stated
problem.

**M7, M8, M9 - three more residuals with no instrument or no owner. Same class
as B3's R-A25-2; I name it once so nobody relabels it to buy a round.**

- R-A25-4 (data minimization): Owner is "Wave 1 implementer OR a follow-up
  security pass" - two owners is no owner. Instrument is "a server-side JSON
  projection ... OR an explicit acceptance of the over-fetch" - both of those
  are REMEDIES. Nothing measures whether either happened, so the residual
  cannot fire.
- R-A25-5 (is a coarse trend worth reading): Owner "Repo owner / AC seat".
  Instrument is "the N13b row itself (`docs/backlog.yml:150-160`)" - a backlog
  row is a document, not an instrument, and no test in this repo reads
  `docs/`.
- R-A25-7 (UI reachability): Instrument is "Reading claims only", and the
  direction of failure is "Fails if a reading-only claim is presented as
  verified rather than labeled as a reading claim". That silently changes the
  OBJECT from the panel's reachability to the wording of a later document. It
  also duplicates R-A25-1, which the row itself admits ("folds into R-A25-1").

Of the seven residuals, one (R-A25-1) fully satisfies
`iteration-caps.md`'s owner/instrument/object/direction/step, and R-A25-3 does
apart from a conditional step. Five do not.

---

## 8. MINOR findings

**m1 - "DraftedGradesTab's own three" is four.** Section 4 lists
`ta-drafts-search`, `ta-drafts-sort`, `ta-drafts-course` "all confirmed live at
`DraftedGradesTab.tsx:118,122,126`" - those three line numbers are correct
(`grep -n '"ta-drafts' src/app/components/DraftedGradesTab.tsx` returns 68,
118, 122, 126, 340, 346, 352). The missed one is
`ta-drafts-collapsed` at `:68` (`const COLLAPSED_DRAFTS_KEY =
"ta-drafts-collapsed"`). This matters because of M4: under DECISION 9's
transition rule the trigger is a SIXTH key in the directory, and the count the
architect would reason from is four, not three, so one new control puts the
surface one key from the trigger rather than two.

**m2 - section 2.3's over-fetch list omits the identifier.** It says the strip
"keeps every result's `overallComment`, `strengths`, `improvements`,
`feedback`, and `rubricAreas`". `grading-review-rows.ts:47-62` shows the shared
allowlist also keeps `student` (`:48`), `resubmitNotice` (`:58`), `totalScore`
(`:60`) and `mergedFileCount` (`:62`). `student` is the one that turns 2.3 from
a memory-footprint note into an actual data-minimization finding, and it is the
one left out of the list R-A25-4 is written against.

**m3 - the section 4 canary validates a different pattern in a different
directory.** `grep -rn "ta-rec-" <recording-split test> | wc -l -> 90` proves
that grep style finds `ta-rec-` keys where they exist. It does not exercise the
`--include=*.test.ts` filter or the `ta-drafts` spelling that the three
negatives depend on. The conclusion is correct (I ran `grep -rln "ta-drafts"
src`, two hits), but the control shown is not aimed at the command it is
controlling. Also, the canary line is the one command in the document piped
through `wc -l`, which discards grep's exit status; the three negatives
correctly are not.

**m4 - the scope's own section-0 discipline now applies to the scope.**
`GradingRunEntry` was at `types.ts:353` at b26e072 (correct as written) and is
at `:362` at HEAD, moved by 8a977b1. Same for `grading-drafts.ts`
(`listPendingGradingDrafts` 242 -> 248, `markGradingDraftReviewed` 330 -> 337,
`deleteGradingDraft` 361 -> 368) and `actions/grading.ts` (414 -> 416,
422 -> 424, 428 -> 430, 558 -> 560), and for the A25 row itself
(`docs/backlog.yml:451` -> `:457`). None of these is a defect in the artifact;
I record them because a revision that re-cites without re-measuring will now
be wrong, and because section 0's whole point was that this happens within
days here.

---

## 9. Silent-green summary, and what no instrument here can see

Built exactly as scoped, A25 can pass `npx tsc --noEmit`, `npm run lint`,
`npm run build`'s compile line, `npm test` and every `*.structure.test.ts`
while being:

1. **invisible** - the `effectiveCourseFilter !== "all"` gate is false in
   steady state (section 3);
2. **wrong when visible** - two same-named course sections merged into one
   trend, or a term split at a course rename, under Option A (section 4); and
3. **half dead in Wave 1** - a reducer with no caller until Wave 2 lands
   (M5).

None of the three is observable by anything in this repo, because nothing
renders and no test reads `docs/`. The only three instruments that could see
any of it are: a wiring/structure assertion that the panel is mounted
unconditionally or on a population that includes reviewed drafts; a
pure-function test over two entries whose `courseName` collides and whose
`canvasUrl` differs; and an owner in a browser. The scope proposes none of the
first two.

A fixture hazard worth stating for the test seat, since it is the shape this
repo has shipped before: if the reducer's fixtures give every
`GradingRunEntry` a populated `canvasUrl` and a distinct `courseName`, they do
not match what the offline producer emits (`steps.grading-run.ts:554-560`
emits `canvasUrl: ""`, `assignmentName: "Offline submission"` for every
offline row), and a green suite would prove nothing about the real grouping
input.

---

## 10. Verdict

**NOT BUILDABLE AS WRITTEN.**

Counts: **5 BLOCKER, 9 MAJOR, 4 MINOR.**

### Blockers, with class and NEW / REPEAT

| # | Finding | Defect class | NEW or REPEAT |
|---|---|---|---|
| B1 | Section 2.4's privacy foreclosure is invented, not inherited; two precedents are narrower than claimed and a live key persists the same data class | A blocking premise resting on a precedent narrower than the artifact claims | **REPEAT-OF "blocking premise narrower than claimed"** - the A24 scope checked in the same commit b26e072 carries this class, and this is the second instance of the same corrective rule (open the rule, state what it forbids, and check whether another live surface already does the thing) |
| B2 | The recommended gate is computed from the pending-only draft list, so the panel never renders in the state the feature exists for | A capability gated on a value derived from the wrong population, dead with every gate green | **NEW** (related to but not the same rule as "reachability": here the wiring exists and the CONDITION is always false, so the corrective rule is "state the population each gating value is derived from", not "include the calling file") |
| B3 | The identity fork is presented as exhaustive and omits Option C (`parseCanvasCourseId(entry.canvasUrl)`), while the repo's own identity module forbids the recommended raw string equality | A fork stated as exhaustive that omits the option the tree already implements | **NEW** |
| B4 | `grep -rn "entry.courseName ===" src/lib/grading-draft-view.ts` produces no output; the claim's named instrument does not produce the named result, and two of three line numbers are wrong | A citation or quantity attributed to a command that does not produce it | **NEW** in this artifact; shares its corrective rule with M2, so B4 and M2 are ONE class and must be disposed together |
| B5 | R-A25-6's removal test is unchanged by the deletion it is supposed to detect | An instrument whose assertion cannot fail for the reason claimed | **NEW** |

R-A25-2's missing step and instrument (inside B3) plus M7/M8/M9 are one
further class - **"a residual without an owner, an instrument and a step"** -
with five instances. Under `iteration-caps.md`'s anti-gaming rule these are
one class, not five, and the corrective rule is the same for all of them.

### Stopping point

**Rulings, then design.** In that order, and the split matters:

- **B1, B3 and M4 are rulings, not seat work.** All three turn on what an
  existing rule or decision actually binds - DECISION 3 and DECISION 10 on
  persistence, `course-canvas-url-match.ts` on course identity, DECISION 9 on
  the canary. `iteration-caps.md`'s routing table says when the stopping point
  is *rulings*, the orchestrator rules and does NOT re-dispatch the author.
  A seat revision cannot settle whether an owner decision supersedes a
  precedent the seat read.
- **B2, B5, M1, M5 and M6 are design**, and they are what a round-2 revision
  should carry.
- **B4, M2 and the residual-register class are measurement**, repairable
  mechanically.

### For the owner, as ONE terminating question

Only one thing here is genuinely the owner's, and it should be shaped so every
answer ends the activity rather than feeding a round 3:

> **A25's stored-grading-drafts design duplicates a cross-assignment reducer
> this app already has** (`src/lib/course-intel/`: `computeEngagementSet`,
> `concern.ts`, the course-wide submissions grid), which already keys on a
> stable Canvas course id, already renders stated denominators, and is already
> reachable from the course page - but which carries no rubric-area breakdown,
> because Canvas does not hold this app's rubric areas. So the fork is:
> **(A)** build A25 as its own layer over stored grading drafts, keyed by
> `parseCanvasCourseId(entry.canvasUrl)` with offline runs named as a gap, on a
> surface that is NOT the pending-drafts tab; or **(B)** add rubric-area
> history as an additional signal inside the existing course-intel subsystem,
> reusing its course id, its denominators and its surface.
> **Recommendation: (A)**, because rubric areas only exist in this app's own
> grading runs and course-intel reads Canvas, so (B) means teaching a
> live-Canvas reader to read a Supabase draft table - a bigger seam than a new
> reducer. **Cost of being wrong about (A):** a second trend subsystem whose
> per-course grouping can disagree with the first one's, on a surface the
> instructor reaches differently.

That question does not depend on B1, B2, B4, B5 or M2, all of which are
settled by ruling or by measurement without it, so it rides alongside rather
than gating anything.

---

## Verification of this check's own write set

    git status --short

The only path this check's authoring touched is `docs/a25-check.md` (new,
untracked before this commit). Every other path in `git status --short`
belongs to the concurrently running agents named in this checker's brief and
was neither written nor relied upon here; the three panels the brief named as
being edited concurrently
(`GradingRecordingPanel.tsx`, `AnnouncementDraftSlot.tsx` and siblings) are
cited nowhere in a load-bearing finding, and the one snapshot citation of
`GradingRecordingPanel.tsx` is flagged as such at the top of this document.

## Closing gate

Command run (multi-path, via the wrapper, exit code read from the command and
not from a pipe; output redirected to a file rather than piped through `cat`
or `head`):

    npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts

ASCII check on this file:

    tr -d -c '\000' < docs/a25-check.md | wc -c

Results are recorded in the checker's report to its caller.
