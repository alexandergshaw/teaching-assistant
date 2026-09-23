# A24 scope: trends on snapshot grading

Row A24 (`docs/backlog.yml`, `- id: 'A24'`, lines 440-450). Owner ask, routed
out of A16: "this thing needs to live alongside each of the grading tools in
the tools tab. when i run a tool over a series of assignments, that run
should generate trends." A16 built this for the recording-based grading tool
("grading"). This row is the second grading tool in the strip, "snapgrade"
(screenshot grading, `SnapshotGradingPanel.tsx`).

Every citation below was opened this pass. Every count names the command that
produced it. This is a scope document only - no source file was edited to
produce it (`git status --short` at the end proves the write set).

---

## 1. What exists today

**The trends computation and the panel UI are fully built and already reused
four times over** - none of this needs to be written for A24:

- `src/lib/grade/class-trends.ts` (`computeClassTrends`), `class-trends-insight.ts`,
  `class-trends-draft.ts` - the trend engine, unchanged since A16.
- `src/app/components/drafted-grades/ClassTrendsPanel.tsx` - the shared panel.
  `entry={...} defaultExpanded` is its whole call contract (`GradingRecordingPanel.tsx:946`,
  `GradingResults.tsx:607`).
- `src/app/components/grading-results/classTrendsEntry.ts` - `toClassTrendsEntry`
  (builds a `GradingRunEntry` from a `GradingRun` + `{courseName, assignmentName,
  canvasUrl}` meta) and `hasTrendableResults` (the mount gate: true when at
  least one graded result carries a rubric area, `classTrendsEntry.ts:52-54`).
  Measured reuse: `grep -rln "hasTrendableResults" src --include=*.tsx --include=*.ts | grep -v test`
  returns 5 files - `classTrendsRunCohort.ts`, `GradingRecordingPanel.tsx`,
  `classTrendsEntry.ts` itself, `GradingResults.tsx`, `classTrendsFolderEntry.ts`.
  Four distinct call sites already share this exact adapter; a fifth (snapshot
  grading) adds nothing new to the trend engine itself - by `leverage.md`'s
  failure-mode-B test, the trend mechanism is now close to platform
  infrastructure for grading surfaces, not something A24 earns.

**The precedent for a non-LMS, click-triggered surface is
`src/app/components/grading-recording/classTrendsRunCohort.ts`** (182 lines,
`wc -l`), built by A16 wave 2/3 for the recording tool, and it is the
template the architect should work from:

- `buildRunCohort(results, identity, meta)` (`classTrendsRunCohort.ts:98-152`)
  merges a run's raw results onto a per-row identity projection captured AT
  THE CLICK (never re-derived from the live row array - see the file's own
  header, `:12-18`, on why: `rubricAreas` is empty on the pre-grade row memo
  until a grade lands).
- `toRunCohortEntry(cohort)` (`:157-164`) wraps `toClassTrendsEntry`.
- `cohortLabelSpread(cohort)` (`:178-181`) is the disclosure predicate: true
  when the captured rows carry more than one distinct per-row `assessment`
  label (a `Set`, counting `undefined` as its own distinct value).
- The call site, `GradingRecordingPanel.tsx:924-956`: `lastRunCohort` state
  (`:224`) is captured once per `handleGradeAll` run (`:641`) and reset to
  `null` at the start of the next run and on error (`:574`, `:605`, `:649`).
  The panel builds `trendsEntry` once, gates the mount on
  `hasTrendableResults`, and - **the part this row exists to answer** -
  renders a disclosure line, never a block, when `cohortLabelSpread` is true
  (`:950-955`): *"This run graded submissions from more than one assessment
  label - the trends above combine them."*

**`SnapshotGradingPanel.tsx` has none of this, and re-verifying the row's own
instrument confirms it is still true today.** Absence check, run this pass:
`grep -n "assessmentId\|courseScope\|assessmentLabel" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`
returns nothing (exit code 1, checked directly - not piped through `head`).
Canary that the grep engine actually fires on this file:
`grep -c "useState" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`
returns **21**. A16's own row-A24 instrument (`docs/backlog.yml:446`) recorded
the same absence with the same canary count (21) on 2026-09-21; unchanged.

**New finding this pass, beyond what A16's instrument measured: the gap is
structural, not just a missing field.** `SnapshotGradingPanelProps` is
`{ active: boolean }` only (`SnapshotGradingPanel.tsx:75-77`), and its one
mount site, `RecordingTab.tsx:867`, passes only `active`. Canary:
`grep -c "SnapshotGradingPanelProps" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`
returns 2 (declaration + use), proving the file and the grep both fire.
Absence check: `grep -rn "courseId\|selectedCourse\|useGradingCourses" src/app/components/snapshot-grading/*.ts src/app/components/snapshot-grading/*.tsx`
returns nothing (exit 1). Contrast with the tool A16 already shipped trends
for: `GradingRecordingPanel.tsx:112,269,286,317` fetches Canvas courses with
its own `useGradingCourses(active)` hook and derives `selectedCourse` and
`assessmentId` from a real course/assessment picker
(`GradingAssessmentDeclarationControls.tsx`, mounted at `GradingRecordingPanel.tsx:780-783`).
Snapshot grading is, by design, a paste-a-screenshot tool with no Canvas link
back at all (`SnapshotGradingPanel.tsx:4-6`: "A0-2's no-write-back ceiling
still holds: nothing here ever posts a grade anywhere") - it was never given
a course/assignment selector to remove.

**The persisted session is real and already disclosed as cross-session, but
never as cross-assignment.** `SnapshotGradingPanel.tsx:930-931` (re-measured
this pass - A24's instrument cited `:931` for the same string, one line off
from where the block now starts at `:928`; the sentence itself is unchanged):
*"Completed assessments (n) - some may be from an earlier session, restored
on reload."* `sessionRows` is the full persisted table (`useAssessmentRowStore`
call, `SnapshotGradingPanel.tsx:214-222`), one flat array with no grouping,
no run boundary, and no clearing action anywhere in the file (`grep -n "clear"
src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` returns nothing
production-relevant - not reproduced in full here since it is not load-bearing
to this scope, but checked).

**Conclusion for section 1: reframe as partly reachability, partly a real
gap - not a clean instance of either.** The trends *engine and panel* are
100% reachable-not-built-yet, exactly like A16's opening finding. But unlike
A16, the *identity data the panel's heading and disclosure line need* does
not exist on this surface at all, and building it is not pure wiring - see
section 2.

---

## 2. The data the feature needs, and whether it is there

`toClassTrendsEntry(run, meta)` needs `meta: {courseName, assignmentName,
canvasUrl}` (`classTrendsEntry.ts:35-39`). `computeClassTrends` (called at
`ClassTrendsPanel.tsx:91`) only reads `entry.run` - `grep -n "courseName\|entry\."
src/app/components/drafted-grades/ClassTrendsPanel.tsx` shows `courseName`
never appears past the type import and `assignmentName` is read once, at
`:206`, passed to a child heading. **Both fields are cosmetic labels, not
functional gates** - this lowers the bar for what A24 must supply for them,
but does not remove the harder problem below.

**`GradeResult` construction is mechanical and has a precedent to copy.**
`GradeResultBase` (`src/lib/grade/types.ts:212-236`) needs `student,
overallComment, strengths, improvements, resubmitNotice, rubricAreas,
totalScore, feedback, mergedFileCount, submittedFiles`.
`SnapshotAssessmentRow` (`snapshot-row.ts:122-152`, extending
`AssessmentRowCore extends AssessmentFeedback`,
`assessment-row.ts:64-69,84-96`) already carries `totalScore, strengths,
improvements, overallComment, studentName, state, error` directly. Missing
from the row and needing defaults exactly as `classTrendsRunCohort.ts:126,138-139`
already does for the recording surface: `resubmitNotice: ""`,
`mergedFileCount: 0`, `submittedFiles: []`. `rubricAreas` needs a real
conversion, not a default:
`RubricAreaResult { area, score, comment }` (`types.ts:39-43`) vs
`SnapshotRubricAreaEvidence { area, score, quote, shotIndex, source, verified,
... }` (`snapshot-row.ts:89-100`) - there is no `comment` field on the
snapshot shape. **This is a real design decision, not a mechanical mapping**:
whether `comment` becomes `""`, the evidence `quote`, or something else
changes what the trends' per-area commentary reads like. Leave this to the
architect pass; do not default it here.

**The identity fields (`courseName`/`assignmentName`) and the disclosure
predicate are where the real gap is, and it is a privacy constraint, not
just a missing UI control.** The obvious cheap move - snapshot the live
`assignmentText` onto each row at grade time, the same way
`classTrendsRunCohort.ts` snapshots `courseName`/`assessment` at the click -
is blocked by an existing, tested, deliberate rule: **U10 keeps rubric and
assignment TEXT out of `localStorage` entirely**, and `sessionRows` IS
persisted to `localStorage` (`ta-snap-table`, see section 4). Citations:
`useSnapshotShots.ts:13` ("U10: rubric/assignment TEXT is deliberately never
persisted here"), `SnapshotGradingPanel.tsx:144,157,259`, and the canary test
itself names it explicitly -
`snapshot-grading.structure.test.ts:195` ("U10 keeps shot bytes and
rubric/assignment text out of localStorage"). Writing a raw or truncated copy
of `assignmentText` into a persisted `SnapshotAssessmentRow` field would
violate a rule this repo already tests for. A content-free proxy (a hash, or
an instructor-typed short label persisted separately from the pasted text)
would not violate it, but that is a new control with its own key and its own
canary bump (section 4) - not free.

**Net for section 2: `courseName`/`assignmentName` for the panel heading can
be satisfied cheaply (a fixed string like "Screenshot grading", or an
instructor-typed short label) since nothing reads them functionally. The
disclosure predicate (`cohortLabelSpread`'s equivalent) cannot be built from
any data the surface stores today without either (a) a new, U10-compliant,
per-row identity marker with its own persisted key, or (b) treating the
whole persisted session as one undifferentiated cohort with NO disclosure -
which is strictly worse than what A16 shipped for the sibling tool, not just
different.** This is the fork the architect pass must resolve; section 5
argues it is load-bearing for whether the feature is worth shipping as
scoped.

---

## 3. The surface: line budget

Both counters, both commands, run this pass:

```
$f="src/app/components/snapshot-grading/SnapshotGradingPanel.tsx"
@(Get-Content $f).Count            # 970  <- mandated measurement
(Get-Content $f | Measure-Object -Line).Lines   # 908  <- 62 lower, wrong
```

`wc -l src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` (Bash
tool) also gives **970**, agreeing with the mandated PowerShell measurement
and confirming the disagreement is real here too (62 lines apart on this
file, not the 42 `this-repo.md` cites for a different file -
`GradingRecordingPanel.tsx`, measured the same way this pass at 990 vs 947,
a 43-line gap, which is itself different from `this-repo.md`'s stale
964/922 pair - that card is dated 2026-09-13 and the file has grown since).
**Use `@(Get-Content <file>).Count`. Never `Measure-Object -Line`.**

`grep -n "LIMIT\|SnapshotGradingPanel\|ALLOWED_OVERAGE"
src/file-size-ceiling.structure.test.ts` shows `LIMIT = 1000` (`:41`) and no
`SnapshotGradingPanel.tsx` entry in `ALLOWED_OVERAGE` (`:75-90`, four entries,
all `*.test.ts` files, none in `snapshot-grading/`). The recording-split
exclusion does not cover this file either:
`isCoveredByRecordingSplitCheck` (`file-size-ceiling.structure.test.ts:56-62`)
only excludes `src/app/components/recording/<file with no further slash>`
plus two named files; `SnapshotGradingPanel.tsx` lives under
`src/app/components/snapshot-grading/`, a different directory, so it is
checked by the strict repo-wide 1000-line gate with no ratchet.

**970/1000 leaves 30 lines of headroom.** A16 wave 2's own comparable
addition to the sibling surface - the cohort state, the capture at the click,
the gated mount, and the disclosure line, all inside `GradingRecordingPanel.tsx`
- is recorded in the A16 backlog note (`docs/backlog.yml:362`, the "wave 2"
field, inherited figure not re-measured by me since that wave already landed)
as "72 against a 46-line budget." 72 lines is more than double this file's 30
lines of headroom. **Per the row's own instructions: an extraction precedes
the feature here; do not propose an `ALLOWED_OVERAGE` entry.**

**Extraction candidate, not mandated, for the architect to accept or
reject:** the `useAssessmentRowStore` call and its surrounding session-table
state currently sit inline in the panel (`SnapshotGradingPanel.tsx:214-222`),
unlike the sibling grading-recording surface, which already extracted the
identical pattern into its own hook -
`src/app/components/grading-recording/useGradingRows.ts:171,317` wraps
`useAssessmentRowStore<GradingRow>(...)` and exposes `rawRows, rowsRef,
commitRows, persistError`. A `useSnapshotSessionRows.ts`-shaped extraction
mirroring that precedent is a plausible way to find headroom without
inventing a new split pattern, but it is a design choice (what exactly moves,
what stays for lint reasons - see the extraction hazard below) that belongs
to the architect wave, not this scope document.

**One extraction hazard already measured in this repo, on this exact file,
worth citing so the architect does not rediscover it the hard way:**
`this-repo.md:85-100` records that an earlier extraction out of
`SnapshotGradingPanel.tsx` (N14 wave 1, moving a ref-freshness cache) passed
tsc and all tests, then failed lint with 2 new
`preserve-manual-memoization` errors on `handleNextStudentConfirm` - a
callback nowhere near the moved code. The rule is React Compiler reacting to
the whole component's hook count/shape, not `exhaustive-deps`. Any wave that
removes hooks from this panel should expect to re-run lint, not just tsc and
vitest, before calling the wave green.

---

## 4. Persistence of any new control

The directory's persisted-key convention is `ta-snap-*`, and it has its own
exact-set canary, unlike the sibling `grading-recording` surface's separate
`ta-rec-*` canary embedded in `recording-split.structure.test.ts`. Citation:
`src/app/components/snapshot-grading/snapshot-grading.structure.test.ts:176-202`,
describe block "directory-wide ta-snap-* key exact-set canary (this
directory has no canary anywhere else)". It scans every non-test `.ts`/`.tsx`
file in `src/app/components/snapshot-grading/` for the pattern
`/(?<![a-zA-Z])ta-snap-[a-z-]*[a-z]/g` and asserts the distinct set equals
exactly:

```
ta-snap-armed-role
ta-snap-auto-grade-armed
ta-snap-grading-instructions
ta-snap-table
```

(`:196-201`, `keys` built at `:188`, dedup+sort at `:189`.)

**Any new persisted control this feature adds - a per-session assignment
label, a "start new run" marker, an instructor-declared course name, or
anything else reachable from section 2's fork - needs a `ta-snap-*` key and
MUST add that literal string to this exact array in the same commit**, or
the wave fails this canary. There is no other canary anywhere else in the
repo that would catch a new key here (the file's own describe-block title
says so, and it is accurate: `grep -rn "ta-snap" src --include=*.test.ts |
grep -v "snapshot-grading/"` returns nothing this pass).

If the architect chooses the "whole session is the cohort, no new identity
field" reading from section 2, **no new key is needed and this canary does
not move** - worth stating explicitly, since it is the one wave-plan branch
that changes nothing here.

---

## 5. The leverage question, answered concretely

**A24 earns nothing new from the trend engine itself.** Section 1 already
showed the mechanism (SCALE - "the same rubric held constant, run N times" -
and GUARANTEED - layer C makes no model call, per `leverage.md`'s taxonomy)
is shared by five call sites before this row starts. By `leverage.md`'s own
failure-mode-B test ("grep each candidate class's mechanism against every
comparable module... if the count clusters near all of them, the class is
inherited"), five of five grading-adjacent surfaces having it makes it
platform, not something A24 built.

**What A24 could add, if it ships the honest version, is a narrower,
real thing: LIVE-LOOP plus a disclosed cohort boundary on a surface that
currently gives the instructor no signal at all about whether they are
looking at one assignment's worth of trends or three.** That is checkable
against the as-built diff exactly the way `leverage.md`'s removal test
demands: delete `cohortLabelSpread`'s snapshot-grading equivalent, and the
assertion that changes is whether an instructor who graded assignment A
Monday and assignment B Tuesday, in the same persisted session, sees a
warning before trusting a blended trends panel.

**But section 2 already showed that predicate cannot be built for free.**
If the architect picks the "whole persisted session is the cohort, no
identity field, no disclosure" reading, the feature ships *decorative* by
this row's own leverage standard: `hasTrendableResults` would gate a panel
that silently averages together however many unrelated assignments happen to
be sitting in `ta-snap-table` at the time, with less honesty than what A16
already shipped for the sibling tool (which discloses, per
`GradingRecordingPanel.tsx:950-955`, precisely because the owner's row A24
note - `docs/backlog.yml:450` - says mixing is "disclosable on one surface"
only if it is "disclosable on the other," never blindly accepted on either.
**Shipping trends on snapshot grading with no disclosure mechanism is not a
smaller version of A16's feature - it is a regression relative to the bar
A16 set**, and the honest answer, if the identity-field cost is rejected, is
closer to "not much" than to a real leverage claim.

**Recommended disposal, for the architect to accept, reduce, or reject per
`leverage.md`'s own three-way call (never defaulted by an agent):** the
identity-field addition (a single instructor-typed, U10-compliant, non-text
label - e.g. an assignment nickname, not the pasted assignment text itself -
persisted under a new `ta-snap-*` key, captured onto each row at grade time,
and compared with `Set` the same way `cohortLabelSpread` does) is the
smallest change that lets this feature clear its own leverage bar. It is a
real, scoped addition - not "redesign the whole tool" - but it is not free
either, and it is exactly the sort of judgment call `leverage.md`'s negative
example (`AskAiModal.tsx`) says must be made explicitly, not silently
assumed.

---

## 6. Wave plan

**Wave 0 - extraction (precedes the feature, per section 3).** Shrink
`SnapshotGradingPanel.tsx` below its current 970/1000 to create headroom for
wave 2's addition. Candidate: extract the `useAssessmentRowStore` call and
its directly-associated state (`STORAGE_KEY_TABLE`, the two persistence
messages, `sessionRows`/`sessionRowsRef`/`commitSessionRows`/`sessionPersistError`)
into a new hook mirroring `useGradingRows.ts`'s shipped pattern - final shape
decided by the architect pass, not fixed here.
- Write set: `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`
  (the caller - MUST be in this wave's list, since it is the only file that
  invokes the new hook), a new `useSnapshotSessionRows.ts`-shaped file (or
  whatever name the architect picks), and that new file's own test.
- Gate: `npx tsc --noEmit`, `npm run lint` (watch for the
  `preserve-manual-memoization` hazard named in section 3), and
  `npm run test:paths -- src/app/components/snapshot-grading/SnapshotGradingPanel.tsx <new-test-file>`.
  Re-measure `@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count`
  after, and confirm it is comfortably under 1000 with room for wave 2.

**Wave 1 - the architect's fork resolution (design only, no code).** Produce
a short design note (not this document) settling section 2's fork: new
identity field + disclosure, or whole-session-as-cohort with an explicit,
owner-visible decision to ship without disclosure. This wave's output is a
decision record, not a file-list wave.

**Wave 2 - the adapter leaf.** A new pure file,
`src/app/components/snapshot-grading/classTrendsSnapshotEntry.ts` (name
illustrative), mirroring `classTrendsRunCohort.ts`'s shape: a function that
converts `SnapshotAssessmentRow[]` (plus whatever identity fields wave 1
decided on) into a `GradingRunEntry`, and - if wave 1 kept disclosure - a
label-spread predicate over the chosen identity field. Reuses
`toClassTrendsEntry`/`hasTrendableResults` from `classTrendsEntry.ts`
verbatim, never a second copy (the same rule `classTrendsRunCohort.ts:34-38`
states for its own surface).
- Write set: the new adapter file, its own test file
  (`classTrendsRunCohort.test.ts` is 353 lines and is the size precedent to
  budget against, `wc -l src/app/components/grading-recording/classTrendsRunCohort.test.ts`).
  Nothing else - this wave must not touch `SnapshotGradingPanel.tsx`, so it
  can run disjoint from wave 3 only if wave 3 is sequenced after it, since
  wave 3 is the file that calls this wave's export.

**Wave 3 - the mount, in `SnapshotGradingPanel.tsx` (post wave-0
extraction).** Import the new adapter, capture the cohort at grade time (in
`useSnapshotGrade.ts`'s `handleGrade`, `useSnapshotGrade.ts:262-282`, the one
place a grade result is committed via `commitSessionRows(upsertSnapshotRow(...))`
at `:272` - the natural analogue of `GradingRecordingPanel.tsx:641`'s
`setLastRunCohort`), mount `ClassTrendsPanel` gated on
`hasTrendableResults`, and render the disclosure line if wave 1 kept one.
- Write set (**must include the calling file - the rule this repo has been
  bitten by repeatedly, per `AGENTS.md`'s wave-dispatch note and
  `docs/loop/DEV_LOOP.md`'s "every wave includes the file that CALLS each
  new export"**): `SnapshotGradingPanel.tsx` (the mount site and the JSX),
  `useSnapshotGrade.ts` (the capture site, if the cohort is captured inside
  the hook rather than the panel - architect's call), and any new
  `ta-snap-*` persisted key's producer file if wave 1 added one.
  `snapshot-grading.structure.test.ts` MUST be in this wave's list too if a
  new key is added - the canary in section 4 will not update itself.
- Gate: `npx tsc --noEmit`, `npm run lint`,
  `npm run test:paths -- src/app/components/snapshot-grading/SnapshotGradingPanel.tsx src/app/components/snapshot-grading/useSnapshotGrade.ts src/app/components/snapshot-grading/snapshot-grading.structure.test.ts <new adapter test>`,
  and a final `@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count`
  check against 1000.

**Sequencing.** Wave 0 before wave 2/3 (headroom must exist before the
feature grows the file). Wave 1 before wave 2 (the adapter's shape depends on
the fork). Wave 2 before wave 3 (wave 3 calls wave 2's export). Wave 0 and
wave 2 are file-disjoint and could in principle run concurrently, but wave 2
cannot be usefully designed until wave 1 settles the fork, so there is no
real concurrency to claim here - sequence linearly.

---

## 7. Residual register

- **R-A24-1: the `comment` field gap on rubric-area conversion (section 2).**
  Object: `RubricAreaResult.comment` when converting from
  `SnapshotRubricAreaEvidence` (which has `quote`, not `comment`). Owner:
  the architect pass (wave 1). Instrument: a design note deciding the
  mapping, checked by the wave-2 adapter's own unit test asserting the
  chosen value. Direction of failure: if left undecided, an implementer
  defaults it silently (likely to `""`) and the trends panel's per-area
  commentary reads as blank for every snapshot-graded entry - a decision
  made by omission. Step: resolved in wave 1, verified in wave 2's test.

- **R-A24-2: the identity-field / disclosure fork itself (sections 2, 5).**
  Object: whether `cohortLabelSpread`'s equivalent can be computed at all
  for snapshot grading. Owner: the architect pass (wave 1), with the
  three-way leverage call (`leverage.md`) escalated to the product owner if
  the architect judges the added-control cost not worth it. Instrument: the
  wave-1 design note plus, if a new field ships, the wave-2/3 unit and
  canary tests. Direction of failure: shipping wave 3 without resolving this
  ships either dead UI (an unreachable disclosure branch) or a silently
  undisclosed cross-assignment blend - both are findings this row exists to
  prevent, not defects to discover post-ship. Step: before wave 2 starts.

- **R-A24-3: U10 compliance of any new field (section 2, 4).** Object:
  whatever new persisted value wave 1 chooses for identity. Owner: the
  wave-2/3 implementer. Instrument:
  `snapshot-grading.structure.test.ts`'s existing U10-adjacent assertions
  plus a new one if the architect wants it enforced by name (none exists
  yet for a hypothetical new field, since the field does not exist yet).
  Direction of failure: a new field that stores raw or truncated
  `assignmentText`/`rubricText` reintroduces exactly the content-sensitivity
  exposure U10 was written to prevent, silently, since no existing test
  scans for it. Step: wave 1's design note states explicitly what the new
  field's value derivation is (hash, instructor-typed label, or similar) and
  why it does not carry assignment content; checked by the loop-checker on
  that design note before wave 2 starts.

- **R-A24-4: REGRESSION.md baseline.** Object: current snapshot-grading
  session behavior (the "Completed assessments (n)... restored on reload"
  text and what it implies) is not yet recorded.
  `grep -ac "snapshot.grading.*trend\|snapgrade.*trend\|A24" docs/REGRESSION.md`
  returns **0** this pass. Owner: the baseline seat, per `DEV_LOOP.md`'s
  "Baseline" step, before wave 3's hand-off. Instrument: a new
  `docs/REGRESSION.md` entry describing today's no-run-boundary behavior,
  written before wave 3 lands so the diff has something to regress against.
  Direction of failure: without it, a later regression pass has no recorded
  "before" to compare wave 3's "after" to, and a real behavior change (e.g.
  the disclosure line appearing) cannot be distinguished from a regression.
  Step: before wave 3's implementer starts.

- **R-A24-5: every UI/keyboard/rendering claim in this document is a
  reading claim, not an executed one.** Object: the JSX structure, the
  disclosure line's actual rendered text, and the mount gating described in
  sections 1, 3, and 6. Owner: the repo owner, in a real browser, after
  wave 3 ships (nothing in this repo renders a component -
  `docs/loop/this-repo.md` section 2 and section 6). Instrument: a manual
  check against the deployed app. Direction of failure: a source-text
  reading can be correct about what the code says and still wrong about what
  actually paints, focuses, or announces to a screen reader. Step: the next
  owner verification pass after wave 3 ships.

- **R-A24-6: Repo Grades and other grading surfaces are out of this row's
  scope.** Object: `src/app/components/repo-grades/classTrendsFolderEntry.ts`
  already has its own trends adapter (found in section 1's reuse count) and
  is unaffected by anything here. Owner: none needed - this is a scope
  boundary statement, not a debt. Instrument: none. Direction of failure:
  n/a. Step: n/a. (Included per the register's own discipline: stating a
  boundary explicitly rather than leaving a reader to wonder whether it was
  missed.)

---

## Disposition table

This is a new scope document, not a restructuring of a prior one - `docs/a24-scope.md`
did not exist before this pass (`?? docs/a24-scope.md` would be new in
`git status --short`, confirmed below). No prior requirements to disposition.

---

## Verification

`npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts`
was run this pass (not piped for the exit code):

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts > <out> 2>&1; echo $? > <exit-file>
```

Output tail: `Test Files 2 passed (2)`, `Tests 21 passed (21)`,
`COVERED src/lib/no-emojis.test.ts files=1 passed=18`,
`COVERED src/source-bytes.structure.test.ts files=1 passed=3`. Exit code read
from `<exit-file>` (not the pipe): **0**.

`git status --short`, run after the test above, proving the write set:

```
 M docs/a29-architecture-small.md
 M docs/css-orphans.md
?? docs/a24-scope.md
?? docs/a39-research.md
```

Only `docs/a24-scope.md` is this row's write set, matching the brief exactly.
The other three entries belong to concurrent agents working other rows this
pass (A29, A39) and the pre-existing `docs/css-orphans.md` modification
(present in this session's starting `gitStatus` snapshot, not touched here) -
none edited by this scope pass.
