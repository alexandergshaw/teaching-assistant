# Adversarial check: docs/a24-scope.md and docs/a32-scope.md

Fresh checker, 2026-09-23. Neither document authored by me. Every citation below
was opened this pass; every quantity names the command that produced it. Write
set is exactly this one file (`git status --short` at the end).

Two housekeeping facts that bound what follows:

- The two line counters were run against every file I cite a size for. They
  disagree by 62 on `SnapshotGradingPanel.tsx`, 67 on
  `WalkthroughAnnouncementPanel.tsx`, 43 on `GradingRecordingPanel.tsx` and 14
  on `classTrendsRunCohort.ts`. No figure below is inherited.
- No component renders under vitest here, so every copy, markup and keyboard
  claim in BOTH scopes is a reading claim. Both documents say so. Neither is
  penalised for it; it is the reason two of the findings below are blockers
  rather than cosmetic.

---

# SECTION A24 - docs/a24-scope.md

## A24 BLOCKER 1 - wave 0's extraction turns a structure test red, and that test is in neither its write set nor its gate

Class: ASSIGNMENT-OMITS-BROKEN-INSTRUMENT. **NEW.**

Wave 0 (section 6) orders: "extract the `useAssessmentRowStore` call and its
directly-associated state (`STORAGE_KEY_TABLE`, the two persistence messages,
`sessionRows`/`sessionRowsRef`/`commitSessionRows`/`sessionPersistError`) into a
new hook mirroring `useGradingRows.ts`'s shipped pattern".

Opened: `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`,
describe block "A4d" beginning at `:150`, whose `panelPath` is
`path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx")` and whose
`panelSource` is that file's own text:

- `:157-158` - asserts `panelSource` matches
  `/const STORAGE_KEY_TABLE = "ta-snap-table";/`
- `:161-165` - asserts the comment-stripped `panelSource` matches
  `/useAssessmentRowStore<SnapshotAssessmentRow>\(\s*STORAGE_KEY_TABLE,\s*snapshotRowCodec/`

Both assertions read the PANEL specifically, not the directory. Moving the key
declaration and the store call into a new hook file makes both fail. Wave 0's
write set is "`SnapshotGradingPanel.tsx`, a new `useSnapshotSessionRows.ts`-shaped
file, and that new file's own test" - `snapshot-grading.structure.test.ts` is
absent, and it is absent from wave 0's gate command too. The scope names that
test file once, in wave 3, and only conditionally ("MUST be in this wave's list
too if a new key is added").

The sharpest part: the scope cites `useGradingRows.ts:171,317` as the precedent
to mirror. That precedent is exactly the shape this test forbids for snapshot
grading. Both facts are in the same document, two sections apart, and the
conflict is not noticed.

Instrument proving the test file runs: I executed it (see blocker 2's run) -
`snapshot-grading.structure.test.ts (62 tests)`, 62 passed.

## A24 BLOCKER 2 - both wave gate commands exit 1 as written, for a reason unrelated to any change

Class: GATE-COMMAND-UNRUNNABLE. **NEW.**

Wave 0's gate:
`npm run test:paths -- src/app/components/snapshot-grading/SnapshotGradingPanel.tsx <new-test-file>`

Wave 3's gate passes `SnapshotGradingPanel.tsx` and `useSnapshotGrade.ts`
alongside two real test files.

These are production source files. `test:paths` credits each argument against
executed TEST files and fails any argument credited none. Measured, not reasoned
- I ran the wave-0 shape:

```
npm run test:paths -- src/app/components/snapshot-grading/SnapshotGradingPanel.tsx src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
```

Output tail:

```
NOT COVERED src/app/components/snapshot-grading/SnapshotGradingPanel.tsx files=0 passed=0
COVERED src/app/components/snapshot-grading/snapshot-grading.structure.test.ts files=1 passed=62
```

Exit code read from a file, not a pipe: **1**.

No test file in `src/app/components/snapshot-grading/` can ever credit that
argument (`ls | grep test` returns 17 files, none named
`SnapshotGradingPanel.*`). So the gate is red before the implementer writes a
line, and the predictable remediation - drop the wrapper, run raw
`npx vitest run <paths>` - reintroduces precisely the silent-drop hazard the
wrapper exists to prevent.

Credit where due: both scopes use `npm run test:paths --` rather than a raw
multi-path `vitest`. A24 got the wrapper right and the arguments wrong.

## A24 BLOCKER 3 - the fork's blocking premise is false: the cited test forbids nothing about assignment text

Class: INSTRUMENT-ASSERTS-LESS-THAN-CITED. **NEW.**

Section 2 states the obvious cheap move "is blocked by an existing, tested,
deliberate rule", citing
`snapshot-grading.structure.test.ts:195` and concluding "Writing a raw or
truncated copy of `assignmentText` into a persisted `SnapshotAssessmentRow` field
would violate a rule this repo already tests for."

Opened `:195-201`. The assertion is:

```
expect(distinctKeys).toEqual([
  "ta-snap-armed-role",
  "ta-snap-auto-grade-armed",
  "ta-snap-grading-instructions",
  "ta-snap-table",
]);
```

`distinctKeys` is built at `:188-189` from
`combinedSource.match(/(?<![a-zA-Z])ta-snap-[a-z-]*[a-z]/g)`. It is an exact set
of **key names**. The U10 sentence the scope quotes is inside the `it()`
DESCRIPTION STRING, not inside any assertion.

Census of the whole test file:
`grep -n "U10\|assignmentText\|rubricText" src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`
returns exactly two lines, `:131` (a comment) and `:195` (the description). Zero
assertions. Canary that the instrument fires on this file:
`grep -c "expect" <same file>` returns **122**.

Two consequences, and the second is worse than the first:

1. Writing `assignmentText` into a row persisted under the EXISTING
   `ta-snap-table` key adds no new `ta-snap-*` literal, so this canary stays
   green. The rule is a documented convention (`useSnapshotShots.ts:13`,
   `SnapshotGradingPanel.tsx:144,157,259`, `SnapshotRubricCaptureReview.tsx:29`,
   `useSnapshotRubricCapture.ts:47`), not a tested one.
2. The scope contradicts itself. Section 2 says "a rule this repo already tests
   for"; R-A24-3 says the opposite - "silently, since no existing test scans for
   it." Both cannot hold. R-A24-3 is the correct one, and it means the real
   hazard is the inverse of the one section 2 describes: nothing stops an
   implementer shipping the cheap fix with every gate green.

## A24 BLOCKER 4 - the fork is largely false, and the alternative is priced with a cost that does not exist

Class: REPEAT-OF-INSTRUMENT-ASSERTS-LESS-THAN-CITED. (Same corrective rule as
blocker 3: open the artifact that would enforce the constraint before declaring
the constraint blocking. Labelling this NEW to buy another round would be
dishonest; it is still a blocker.)

Section 2 concludes the disclosure predicate "cannot be built from any data the
surface stores today without either (a) a new, U10-compliant, per-row identity
marker **with its own persisted key**" and section 4 generalises: "Any new
persisted control this feature adds - a per-session assignment label, ... needs a
`ta-snap-*` key and MUST add that literal string to this exact array in the same
commit". Three measured facts defeat this:

**(i) A per-row field needs no key and no canary bump.** Opened
`src/app/components/snapshot-grading/snapshot-row-serialization.ts:57-114`.
`toWire` enumerates every field explicitly and, in its own header at `:34-44`,
says why: "NEVER spreads `...row` - a spread is exactly the gap that would let a
future field (an identity field, most plausibly) leak into storage silently."
Row fields ride inside the existing `ta-snap-table` envelope. They add zero
`ta-snap-*` literals. Section 4's blanket rule is true for a new instructor-facing
textbox and false for the per-row marker the disclosure predicate actually needs
- and the scope applies the textbox price to both.

**(ii) The data is already in scope at the exact commit point.**
`grep -rn "assignmentText" src/app/components/snapshot-grading/ | grep -v "\.test\."`
shows `useSnapshotGrade.ts:230` (`pastedTextCorpus`), `:241`
(`hasAssignmentText`) and `:290` (the dependency array). The row is committed at
`useSnapshotGrade.ts:272` via
`commitSessionRows(upsertSnapshotRow(sessionRowsRef.current, merged))` - the very
line the scope names as the analogue of `GradingRecordingPanel.tsx:641`.

**(iii) The predicate only needs distinctness, not text.**
`cohortLabelSpread` (`classTrendsRunCohort.ts:178-181`) is
`new Set(cohort.rows.map((r) => r.assessment)).size > 1`. A non-reversible digest
of `assignmentText.trim()` computed at `useSnapshotGrade.ts:272` supplies exactly
that. It stores no assignment text, needs no instructor-facing control, needs no
new `ta-snap-*` key, and requires no canary bump.

So the answer to the question section 2 did not ask is: **yes, a predicate can be
built without storing the text, and the fork as stated is false.** What remains
is a genuine but much smaller design question - a digest lets the line say "more
than one assignment", and cannot NAME them, whereas an instructor-typed label
can. That is a wording trade-off for the architect, not a privacy blocker and not
a "new control with its own key and its own canary bump". The scope's own
"Recommended disposal" (an instructor-typed label) is therefore the EXPENSIVE
branch presented as the minimum.

One honest qualification I will not let the scope be blamed for missing, because
it is a real judgement: a digest is not unconditionally non-reversible - an
attacker holding a candidate assignment text can confirm a match. That is a
design judgement to record, not a rule the repo tests.

## A24 MAJOR 5 - the reuse census is wrong in both directions and the document contradicts itself

Section 1: "fully built and already reused **four** times over" / "**Four**
distinct call sites already share this exact adapter". Section 5: "shared by
**five** call sites before this row starts" and "**five of five**
grading-adjacent surfaces having it".

Re-measured, with the canary:

```
grep -rln "hasTrendableResults" src --include=*.tsx --include=*.ts | grep -v test   -> 5 files, exit 0
grep -rln "hasTrendableResultsXYZNOPE" src --include=*.tsx --include=*.ts           -> exit 1
```

Then I opened each of the five, which the scope did not:

| File | What it actually is |
|---|---|
| `classTrendsRunCohort.ts:17,35` | **COMMENTS ONLY.** `:35` literally reads "`hasTrendableResults` is not imported here at" |
| `classTrendsEntry.ts:52` | the definition |
| `GradingRecordingPanel.tsx:944` | real call site |
| `GradingResults.tsx:605` | real call site |
| `classTrendsFolderEntry.ts:95` | real call site |

**Three production call sites, not four and not five.** "Five of five
grading-adjacent surfaces" is not a measurement of anything - there is no set of
five surfaces here.

Direction of the error is favourable (three of four mounts is still close to
platform, so the leverage conclusion survives), but `leverage.md`'s failure-mode-B
is a COUNTING test, and a counting test fed an uncounted grep is not discharged.
This is also the exact hazard the scope's own section 3 correctly warns about,
applied to a different instrument two sections earlier.

## A24 MAJOR 6 - "`entry={...} defaultExpanded` is its whole call contract" is wrong, and the omission is a decision wave 3 must make

`grep -rn "ClassTrendsPanel" src --include=*.tsx --include=*.ts | grep -v "\.test\."`
returns four mounts, not two:

- `DraftedGradesTab.tsx:655` - `<ClassTrendsPanel entry={entry} />`, **no `defaultExpanded`**
- `GradingRecordingPanel.tsx:946` - `entry={trendsEntry} defaultExpanded`
- `GradingResults.tsx:607` - `entry={classTrendsEntry} defaultExpanded`
- `repo-grades/index.tsx:856` - `entry={trendsEntry} defaultExpanded`

The scope names only the middle two. Opened `ClassTrendsPanel.tsx:76-87`: the
prop is `defaultExpanded?: boolean` (`:86`) defaulted `false` (`:78`), and its
own comment at `:81-85` records that Drafted Grades deliberately omits it to keep
collapsed-by-default behaviour. So "its whole call contract" is a two-of-four
sample presented as the contract, and wave 3 inherits an unstated choice about
whether a screenshot-grading session's blended trends should open expanded.

## A24 MAJOR 7 - wave 0's exit criterion is prose, on the one wave whose entire purpose is a number

Wave 0's gate ends: "confirm it is comfortably under 1000 with room for wave 2."
There is no number.

The number is available, and the scope declined to measure it, saying so openly:
"inherited figure not re-measured by me since that wave already landed." I
measured it:

```
git show --numstat --format="" cbe84e2
  -> 73  1  src/app/components/grading-recording/GradingRecordingPanel.tsx
git show cbe84e2^:src/app/components/grading-recording/GradingRecordingPanel.tsx | wc -l  -> 918
git show cbe84e2:src/app/components/grading-recording/GradingRecordingPanel.tsx  | wc -l  -> 990
```

Net **+72** against the 46 budgeted - the inherited figure is correct, and it
also shows A16 overran its own budget by 57 percent, which the scope cites
without drawing the conclusion. So wave 0's target is knowable: the panel must
land at or below **928** by `@(Get-Content).Count` to leave the measured 72 with
zero margin, and lower to leave any.

**The extraction itself is genuinely required, not over-costed.** Measured this
pass:

```powershell
$f="src/app/components/snapshot-grading/SnapshotGradingPanel.tsx"
@(Get-Content $f).Count                        # 970  <- mandated
(Get-Content $f | Measure-Object -Line).Lines  # 908  <- 62 lower, wrong
```

`wc -l` (Bash) also gives 970. `LIMIT = 1000` at
`src/file-size-ceiling.structure.test.ts:41`;
`grep -n "WalkthroughAnnouncementPanel\|SnapshotGradingPanel" src/file-size-ceiling.structure.test.ts`
exits **1** with a canary (`grep -c "ALLOWED_OVERAGE"` on the same file returns
**2**), so no ratchet entry exists; `isCoveredByRecordingSplitCheck` at `:56-63`
with `COVERED_BY_RECORDING_SPLIT_CHECK` at `:51-54` covers only
`src/app/components/recording/<direct child>` plus `RecordingTab.tsx` and
`TabShell.tsx`, none of which is this file. 30 lines of headroom against a
measured 72. The wave is warranted; only its exit criterion is missing.

## A24 MINOR

- **8.** `classTrendsRunCohort.ts` is **181** lines, not the 182 the scope
  attributes to `wc -l`. Measured: `wc -l` = 181, `@(Get-Content).Count` = 181,
  `Measure-Object -Line` = 167, and `git show --numstat` records it created with
  181 added lines. (`classTrendsRunCohort.test.ts` at 353 is correct.)
- **9.** `SnapshotGradingPanelProps` is at `:79-81`, not `:75-77`. The CLAIM is
  correct - it is `{ active: boolean }` and nothing else, declaration at `:79`,
  sole use at `:83`, `grep -c` returns 2 as stated. The mount is at
  `src/app/components/RecordingTab.tsx:867` (the scope drops the `components/`
  path segment).
- **10.** The "no clearing action" claim withheld its own output and the summary
  is wrong. `grep -in "clear" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`
  returns **13 lines**, including live production code: `clearPerStudentShots()`
  at `:406` and a confirm button reading "Confirm - clear this student's shots"
  at `:773`. The narrower true claim - nothing clears the completed-assessments
  TABLE - holds. "Returns nothing production-relevant ... not reproduced in full
  here" is an absence claim with its evidence suppressed, which this repo's own
  rules do not permit.
- **11.** `SnapshotGradingPanel.tsx:930` carries the quoted sentence; `:931`
  carries a second the scope does not quote - "Reloading clears the shots;
  completed assessments are kept." That sentence bears directly on what a cohort
  means on this surface and should be in section 1.
- **12.** R-A24-6 is not a residual. It self-declares "Owner: none needed.
  Instrument: none. Direction of failure: n/a. Step: n/a." It is a scope-boundary
  sentence formatted as a register entry, inflating the count from five to six.
  R-A24-1 through R-A24-5 each carry a real owner, instrument, object, direction
  and step; those five are sound.

## A24 - verified sound, one line each

Section 2's type citations are all correct as opened: `ClassTrendsEntryMeta` at
`classTrendsEntry.ts:35-39`; `hasTrendableResults` at `:52-54`;
`computeClassTrends` at `ClassTrendsPanel.tsx:91`; `assignmentName` read exactly
once at `:206` and `courseName` never read past the type import;
`RubricAreaResult {area, score, comment}` at `types.ts:39-43`;
`SnapshotRubricAreaEvidence` at `snapshot-row.ts:89-100` with no `comment` field.
`classTrendsRunCohort.ts`'s `toRunCohortEntry` at `:157-164` and
`cohortLabelSpread` at `:178-181` are exact. `GradingRecordingPanel.tsx`'s
`lastRunCohort` state at `:224`, capture at `:641`, resets at `:574,:605,:649`,
mount at `:946`, disclosure at `:950-955`, `useGradingCourses` at `:112,269`,
`selectedCourse` at `:286`, `assessmentId` at `:317`, declaration controls at
`:780` - all exact. R-A24-4's absence check re-measured:
`grep -ac "snapshot.grading.*trend\|snapgrade.*trend\|A24" docs/REGRESSION.md`
returns **0**, exit 1, canary `grep -ac "^## "` returns **389**. The
`ta-snap-*` exact-set at `:195-201` really is an exact set of four (unlike A32's,
below). The no-write-back ceiling comment is at `SnapshotGradingPanel.tsx:5-6`.

## A24 - the silent-green failure

The whole feature can be built, pass `npx tsc --noEmit`, `npm run lint`,
`npm run build`'s compile line, all 20,200 vitest tests and every structure test,
and mount `ClassTrendsPanel` over a `sessionRows` array blending three unrelated
assignments with no disclosure at all - because nothing renders, no test reads
the JSX, and the one instrument the scope believed guarded the privacy rule
guards key names. And in the other direction: an implementer taking the "cheap
move" the scope declared blocked writes `assignmentText` into the persisted row
and every gate stays green (blocker 3).

## A24 - the weakest requirement

Section 2's "`courseName`/`assignmentName` for the panel heading can be satisfied
cheaply (a fixed string like 'Screenshot grading')". Implemented exactly as
written, `ClassTrendsPanel.tsx:206` renders a heading reading "Screenshot
grading" over trends that silently average three assignments - a heading that is
literally true and tells the instructor nothing, on the one surface whose entire
problem is that cohort membership is invisible. The scope correctly notes the
fields are "cosmetic, not functional gates"; that is exactly why a cosmetic
default here is the most likely thing to ship and the most likely to mislead.

## A24 - feature-already-exists, argued at its strongest

Stronger than the scope concludes. The engine (`class-trends.ts`,
`class-trends-insight.ts`, `class-trends-draft.ts`), the panel, the adapter and
the mount gate all exist and are mounted at four sites. The scope says the
identity data "does not exist on this surface at all, and building it is not pure
wiring." Blocker 4 shows that is over-stated: `assignmentText` is in scope at the
commit line, the codec accepts new row fields without a new key, and the
predicate needs only distinctness. With that correction A24 is much closer to
pure reachability + one derived field than to the three-branch design problem
section 2 frames. That reframe changes the wave plan's size materially, which is
why it is a blocker and not a note.

## A24 VERDICT

**NOT BUILDABLE AS WRITTEN.** 4 blockers, 3 major, 5 minor.

Blocker classes: ASSIGNMENT-OMITS-BROKEN-INSTRUMENT (NEW);
GATE-COMMAND-UNRUNNABLE (NEW); INSTRUMENT-ASSERTS-LESS-THAN-CITED (NEW);
REPEAT-OF-INSTRUMENT-ASSERTS-LESS-THAN-CITED.

**Stopping point: DESIGN.** Measurement is complete for everything reachable in
this environment. What remains is a design decision the scope routed to an
architect on a false premise and should now take back: given that a per-row
derived marker is free of both the key and the canary cost, is the disclosure
line worth having in its un-nameable form ("more than one assignment"), or is the
instructor-typed label worth its added control? That is one question, not the
three-branch fork section 2 describes, and the wave plan should be re-cut against
it along with the two gate commands and wave 0's missing 928-line target.

---

# SECTION A32 - docs/a32-scope.md

## A32 BLOCKER 1 - "replicate the sibling's client-side guard exactly" makes a safety statement false at the moment it matters

Class: PRECEDENT-REPLICATED-PAST-ITS-CONTEXT. **NEW.**

The scope's section 5 concludes: "**replicate the sibling's client-side guard
exactly** (treat non-future as immediate, refuse only on `NaN`), so the
walkthrough surface's behavior for a past-dated pick is identical to the surface
that already ships this."

The sibling's behaviour is exactly as described - I opened
`announcements-panel.tsx:234-251` and confirm a past or present pick leaves
`delayedPostAt` undefined and `scheduledLabel` empty, with no error. The scope's
factual reading is correct.

But it also points the new copy at the sibling's LABEL derivation:
"mirroring `willSchedule` / `scheduledLabel` in the sibling,
`announcements-panel.tsx:296,507-513`". Opened those:

- `:296` - `const willSchedule = visibleAt.trim().length > 0;`
- `:507-513` - the button reads "Schedule announcement" / "Scheduling..."
  whenever `willSchedule` is true

So the sibling ALREADY says "Schedule announcement" on a button that posts
immediately, because the label is derived from string length and the post
decision is derived from `when.getTime() > Date.now()`. Two different predicates.
On the sibling that is a cosmetic mismatch, partly redeemed after the fact by the
success copy at `:280-282`, which branches on `scheduledLabel` and so is honest.

On the walkthrough surface it is not cosmetic. `AnnouncementDraftSlot.tsx:221-229`
is an arm-then-confirm CONSEQUENCE statement, wired to the confirm button by
`consequenceId={...wta-post-consequence-${slot.id}}` at `:247`. Its whole job is
to tell the instructor what pressing Confirm will do. Give it a scheduled variant
derived the sibling's way, and the sequence is:

1. Instructor types or pastes a date that is in the past (a typo in the year, a
   date that went stale while the panel sat open, or a wall-clock value that is
   past once read in the browser's own timezone).
2. The consequence line says the post is scheduled, not immediate.
3. Confirm publishes it to every student in the course immediately, and the same
   copy already states the app "cannot recall or delete it afterward."

That is the app stating the opposite of what it is about to do, in the one
control designed to stop exactly that. The `min` attribute
(`announcements-panel.tsx:473`) blocks picking a past time in the native widget
but not typing or pasting one - the scope says so itself at section 5's last
bullet and then recommends the guard that makes the mismatch consequential.

**The correct requirement is the inverse of "replicate exactly":** the label and
the consequence copy must be derived from the SAME predicate as the post decision
(`when.getTime() > Date.now()`), or a non-future value must be refused outright
on this surface. Either is defensible; silently inheriting the sibling's split
predicate is not. Nothing in this repo can catch the wrong version - no component
renders under vitest, and no test reads `AnnouncementDraftSlot.tsx` at all
(`grep -rn "AnnouncementDraftSlot" src --include=*.test.ts` returns only
`walkthrough-announcement.structure.test.ts:163,175,176`, which assert the PANEL
mounts it, never its copy).

This is also the answer to "which single clause is most likely to be implemented
exactly as written and still produce a bad result." It is this one, and the bad
result is publishing to students before it was ready.

## A32 MAJOR 2 - the leverage census is materially wrong, and a counting test was the evidence

Section 7: "of the app's **three** Canvas-announcement-posting surfaces, **two**
already have Canvas-side scheduling today".

Re-measured, with canary:

```
grep -rn "createAnnouncementAction" src --include=*.ts --include=*.tsx | grep -v "\.test\."
grep -rn "createAnnouncementActionXYZNOPE" src --include=*.ts --include=*.tsx   -> exit 1
```

Production call sites of `createAnnouncementAction` (declared
`canvas-inbox.ts:284`): **five**, not one -

- `announcements-panel.tsx:266` (passes `delayedPostAt`)
- `lms-generation-writers.ts:64` (four args, no delay)
- `messaging.ts:293`
- `useTakeAnnouncement.ts:762`
- `steps.announcements.ts:532` - `createAnnouncementAction(course, title, body, inst, postAt)`

Plus the two `createAnnouncementFromMarkdown` sites the scope did census
correctly.

The last one matters most. `src/lib/workflows/registry/steps.announcements.ts:532`
is a workflow step that already passes a delay - so a scheduled Canvas
announcement already fires from an UNATTENDED path in this app. Section 7 builds
its INTEGRATION argument on the novelty of the direction ("here, this app fires
INTO Canvas once, and Canvas executes unattended afterward ... a shape this card's
taxonomy does not describe exactly"). That shape already ships, one directory
over, and the scope did not find it.

Direction of the error is favourable - the "inherited, not earned" conclusion
gets STRONGER, and that conclusion is right. But `leverage.md`'s failure-mode-B
is explicitly a counting procedure, the scope explicitly invoked it, and the
count is wrong by a factor of more than two.

## A32 MAJOR 3 - the load-bearing citation for "extraction required regardless of branch" is about a different file

Section 3: "this file's header comment (`:6-15`) already records **it** as having
spent its 'one available JSX extraction' once before".

Opened `WalkthroughAnnouncementPanel.tsx:1-20`. Lines 6-15 read, in substance: "A
SIBLING to ModuleDeckCapturePanel.tsx, not a mode of it - see that document's
'WHERE IT LIVES' section for the measured reason (**that panel** was already
within ~150 lines of this repo's 1000-line ceiling, with **its** one available
JSX extraction already spent)."

The header records that about `ModuleDeckCapturePanel.tsx`, which measures **843**
by `@(Get-Content).Count` today. It says nothing about the walkthrough panel's own
extraction budget.

Does the conclusion survive? For Branches A and B, yes, on arithmetic alone:

```powershell
$g="src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx"
@(Get-Content $g).Count                        # 985  <- mandated
(Get-Content $g | Measure-Object -Line).Lines  # 918  <- 67 lower, wrong
```

`wc -l` also gives 985. 985+50 = 1035 and 985+61 = 1046, both over the
`LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:41`, with no
`ALLOWED_OVERAGE` entry and no recording-split coverage (both re-verified above
in A24 major 7, same commands, canary included).

For Branch C (985+5 to 985+10 = 990-995) the file stays under the wall, and the
"required regardless of branch" conclusion rests on this misattributed sentence
plus the React Compiler hazard. So **"regardless of which branch" is established
for A and B and not for C**, and the scope states it flatly for all three.

## A32 MAJOR 4 - the mandated extraction is unbounded by the structure test that pins what must stay in the panel

Same class as A24 blocker 1: ASSIGNMENT-OMITS-BROKEN-INSTRUMENT. Graded MAJOR
rather than BLOCKER here because the extraction is ordered as a Wave 0 design
task rather than specified as a concrete move, so no write set is yet wrong -
but the constraint is not recorded anywhere for Wave 0 to design against.

Opened `walkthrough-announcement.structure.test.ts:165-181`, describe block "G2:
the panel actually mounts the multi-draft-slot seam, not just imports it", whose
`panelSource` is `WalkthroughAnnouncementPanel.tsx`'s own text:

- `:175-177` - asserts `panelSource` matches `/<AnnouncementDraftSlot\b/`
- `:179-181` - asserts `panelSource` matches `/useAnnouncementDraftSlots\(/`

The obvious JSX extraction candidate on this panel is the `slots.map` block at
`:899-912` - which contains `<AnnouncementDraftSlot` and is therefore exactly
what `:176` forbids moving. Section 8 lists
`walkthrough-announcement.structure.test.ts` in a write set only "if Branch B is
chosen", for the ta-key canary. The extraction constraint must be stated in
Wave 0's brief or the extraction will be designed and then discovered red.

## A32 MAJOR 5 - no wave in section 8 names a gate command

Wave 1 and Wave 2 list write sets and rationale. Neither names
`npx tsc --noEmit`, `npm run lint`, a `npm run test:paths -- ...` line, or a
post-wave `@(Get-Content ...).Count` re-measure against 1000. Given that section
3's own conclusion is a line-budget conclusion and section 3 also imports the
React Compiler `preserve-manual-memoization` hazard (which is a LINT-only failure
- tsc and the suite stay green), a wave plan with no named lint step and no
post-wave count cannot discharge either.

A24 named commands and got the arguments wrong; A32 named none. The second is not
better.

## A32 MINOR

- **6.** `:117-122` is a SIZE assertion, not an exact set. Opened:
  `expect(distinctKeys.size).toBe(5);`. The five key names
  (`ta-rec-wta-course/module/notes/emoji/resources`) appear only in the `it()`
  DESCRIPTION STRING and are asserted nowhere, so a renamed key passes. The scope
  calls it "an **exact-set** assertion, not a floor" - it is a count assertion.
  This changes Branch B's instruction: bumping 5 to 6 is a gate; "re-enumerate the
  keys in the test's own description string" is documentation, and the scope
  presents both as enforced.
- **7.** "returns **five** lines (`:82,241,242,296,469,480`)" lists six line
  numbers, and the scope's own prose enumerates six items (declaration, two reads,
  `willSchedule`, two JSX usages). Re-measured: `grep -c "visibleAt"` = **6**;
  canary `grep -c "visibleAtXYZNOPE"` = 0, exit 1. The conclusion - no
  `localStorage`, the sibling does not persist - is correct.
- **8.** A third label needs a scheduled variant and is not listed:
  `confirmLabel="Confirm post"` at `AnnouncementDraftSlot.tsx:240`, inside the
  cited `:238-244` range. The scope names only `idleLabel` (`:239`) and
  `loadingLabel` (`:244`). "Confirm post" on a scheduled draft is the label the
  instructor reads immediately before the irrevocable act.
- **9.** The consequence sentence is duplicated across three production files -
  `GeneratedPostSection.tsx:223`, `TakeAnnouncementPanel.tsx:597`,
  `AnnouncementDraftSlot.tsx:224`. Scoping the fix to the walkthrough copy alone
  is CORRECT (the other two surfaces gain no delay - `useTakeAnnouncement.ts:762`
  passes four args), but the scope should say so, because a later reader grepping
  the sentence finds three and cannot tell which one A32 touched.

## A32 - verified sound, and two things it got right that are easy to get wrong

Section 1 and 2 are exact. `createAnnouncementFromMarkdown` at
`announcements.ts:420-427`, six parameters, verbatim as quoted; `delayedPostAt`
consumed at `:436-442` with the `NaN` throw at `:438-440` and
`.toISOString()` at `:441`; `image` at `:434` via
`buildAnnouncementBodyHtmlFromMarkdown`. The walkthrough call at
`walkthrough-announcement.ts:603` passes exactly four arguments; its catch is at
`:605-607`; the panel's error wrapper at `WalkthroughAnnouncementPanel.tsx:650`
is word-for-word as quoted. The sibling at `prompt-announcement-post.ts:18-32`
passes five, and its header comment at `:10-12` names the contrast exactly as the
scope reports. The caller census matches mine line for line, with a working
canary. `AnnouncementBodyImage` at `:283-286`. `SCHEDULING_TIME_ZONES` at
`utils.ts:26-36` with its single consumer at `inbox-panel.tsx:620` - correctly
identified as a name collision and correctly excluded.

Two things it got right that this repo keeps getting wrong:

1. **The rendering file IS in the write set.** The brief's sharpest question -
   whether the wave list contains the file that RENDERS the new capability - has a
   clean answer: `AnnouncementDraftSlot.tsx` appears in Wave 2's write set under
   every branch, and `WalkthroughAnnouncementPanel.tsx` (the file that calls
   `postWalkthroughAnnouncementAction` at `:647`) appears under every branch too.
   The scope found the three-file split by opening the render path rather than
   trusting the panel's name, and said so. That is the rule this repo relearns
   every few weeks, applied correctly and unprompted.
2. **The test that will break in Wave 1 is named and included.** Verified:
   `walkthrough-announcement.test.ts:566-571` is
   `expect(createAnnouncementFromMarkdown).toHaveBeenCalledWith(...)` with exactly
   four arguments. Adding a fifth - even `undefined` - fails it, and the test file
   is in Wave 1's write set.

The `postDraft` +0 estimate for Branch A also holds: `argsRef.current = args` is
refreshed in an effect at `useAnnouncementDraftSlots.ts:178`, so the hook reads
the panel's latest closure at `:332` and the two-argument shape at `:148-151`
genuinely need not change. The panel's own `postDraft` `useCallback` deps
(`:657`, currently `[selectedCourse]`) must gain the new state - worth one line
in the brief, not a finding.

## A32 - the persistence conflict, decided (the scope explicitly left it)

**Rule it Branch A: do not persist the scheduled-visibility value.** Three
reasons, in order of weight:

1. **It compounds blocker 1 into a live hazard.** A persisted wall-clock instant
   is stale by construction. Restore it on tomorrow's reload and the field holds a
   past time; under the guard the scope recommends, that renders as "scheduled"
   and publishes immediately. A persisted stale future timestamp plus a silent
   non-future fallthrough is the single worst combination available on this
   surface. Branch A removes one half of it even if blocker 1 is fixed.
2. **The repo's persist rule and this value are not the same class.** Every key
   this directory persists - `ta-rec-wta-course/module/notes/emoji/resources` at
   `WalkthroughAnnouncementPanel.tsx:97-102` - is a standing value an instructor
   reuses across sessions. A one-shot publication instant is not. The rule exists
   to spare retyping; nothing here is retyped.
3. **The sibling already decided it and the instrument does not move.** Measured:
   six `visibleAt` references, zero `localStorage`. Branch A keeps
   `distinctKeys.size` at 5 and touches no canary.

The scope was right to flag rather than silently decide, and right that the repo
rule and the sibling precedent genuinely conflict. But this is decidable from the
evidence already in the document plus blocker 1, and leaving it open costs a whole
Wave 0 round for an answer that is available now. The one-line justification
section 6 asks for is reason 1.

## A32 - the leverage concession: is it right?

**Yes, and it is the strongest section of the document.** The capability exists
end to end in `createAnnouncementFromMarkdown:420-442`; the walkthrough action
drops it at exactly one line, `walkthrough-announcement.ts:603`; the sibling
one file over already passes it. The concession that A32 "adds zero new
scheduling mechanism to this codebase" is correct and is now UNDERSTATED, given
that `steps.announcements.ts:532` already schedules from an unattended workflow
(major 2). The scope's recommendation - that the criteria document state plainly
the advantage is platform-inherited, so a later reader does not credit A32's diff
with inventing it - is exactly the `AskAiModal.tsx` disposal `leverage.md`
prescribes, reached honestly rather than argued around. Keep it verbatim.

## A32 - the silent-green failure

The feature can be built, pass `npx tsc --noEmit`, `npm run lint`,
`npm run build`'s compile line, all 20,200 vitest tests and every structure test,
and ship with the arm-then-confirm consequence copy telling the instructor their
announcement is scheduled while Canvas publishes it to every student immediately
and irrevocably. Nothing renders under vitest; no test reads
`AnnouncementDraftSlot.tsx`'s copy; the action-layer test at `:566-571` asserts
argument forwarding and says nothing about which predicate drove the label. The
first observer is a student.

## A32 - feature-already-exists, argued at its strongest

The scope argues this itself and argues it correctly (section 7). Strengthened by
major 2: the gap is one omitted argument at one line, on one of seven production
call sites, five of which reach an action that already threads a delay and one of
which does so unattended. There is no version of A32 that is a new capability.
The honest framing - reachability plus a new user-facing control plus the copy
that control makes false - is the one the scope already has.

## A32 VERDICT

**NOT BUILDABLE AS WRITTEN.** 1 blocker, 4 major, 4 minor.

Blocker class: PRECEDENT-REPLICATED-PAST-ITS-CONTEXT (**NEW**).

A32 is the better of the two documents by a clear margin: its measurements are
reproducible, its canaries are real, its caller census matches mine exactly, and
it gets the rendering-file-in-the-write-set rule right without being asked. It
fails on one requirement that would be built exactly as written and publish
something to students early, plus a mandated extraction with no constraint and no
gate commands.

**Stopping point: DESIGN and RULINGS.** Measurement is complete for everything
reachable here. What remains: (a) rule on the label-derivation requirement -
single predicate or outright refusal of a non-future value - which is a ruling,
not a design; (b) Branch A/B/C, for which the cost table is sound once major 3's
misattribution is removed and Branch C's "extraction required" claim is
re-derived; (c) the persistence question, which I have ruled above and which only
needs confirming. The live-Canvas and browser residuals stay owner-only and are
correctly recorded.

---

# Cross-cutting

**Multi-path test commands.** Neither scope uses a raw multi-path `vitest run` or
`npm test --`. A24 uses `npm run test:paths --` in both gates, correctly, and
passes it production source paths, which makes both gates exit 1 (A24 blocker 2,
measured). A32 names no test command in any wave (A32 major 5). No instance of the
silent-drop hazard itself.

**Shared defect class.** A24 blocker 1 and A32 major 4 are the same mechanism with
the same corrective rule: a scope orders an extraction out of a panel that a
`*.structure.test.ts` pins BY THAT PANEL'S OWN SOURCE, without putting the test in
the write set or the constraint in the brief. Both directories have such a test
(`snapshot-grading.structure.test.ts:157-165`,
`walkthrough-announcement.structure.test.ts:175-181`) and both scopes cite the
test file for an unrelated reason in the same document. The corrective rule is
one sentence and covers both: before ordering an extraction, grep the directory's
structure test for assertions whose source handle is the file being extracted
FROM, and put that test in the wave's write set.

**Disposition tables.** A24 states none is owed (`docs/a24-scope.md` is new) -
correct. A32 states the same, verified: no prior `docs/a32-*.md` exists. Neither
restructured a prior artifact, so there is nothing to audit before reading the
round on its own terms.

---

# Verification of this document's own write set

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Output tail:

```
 Test Files  2 passed (2)
      Tests  21 passed (21)
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
```

Exit code, read from a file rather than a pipe (`echo $? > <file>; cat <file>`):
**0**.

`git status --short` at the time of that run:

```
 M docs/css-orphans.md
 M package.json
 M src/tools/backlog/cli.ts
?? src/tools/backlog/round-ledger.ts
```

This document adds exactly one entry, `?? docs/a24-a32-check.md`. The four above
belong to concurrent agents working other rows; none was touched by this check.
No file under `src/`, neither scope, and no backlog file was edited. No source
file was modified to produce any measurement above - every sabotage-shaped claim
in this report is derived from reading the assertion, not from mutating the tree.
