# A24 scope: trends on snapshot grading (round 2)

Row A24 (`docs/backlog.yml`, `- id: 'A24'`). Owner ask, routed out of A16:
"this thing needs to live alongside each of the grading tools in the tools
tab. when i run a tool over a series of assignments, that run should generate
trends." A16 built this for the recording-based grading tool. This row is the
second grading tool in the strip, "snapgrade" (`SnapshotGradingPanel.tsx`).

**This is round 2 of two.** `docs/a24-a32-check.md` returned NOT BUILDABLE on
round 1 with four blockers. Every one of its findings was re-measured here
before being acted on; two of its own citations are corrected below. Under the
owner's "Two rounds, then ask" rule (`AGENTS.md`), the one thing this pass
cannot settle from the code is stated as a QUESTION with a recommendation in
section 6, and the wave plan is buildable around the recommended answer.

Every quantity names the command that produced it. No file under `src/` was
edited to produce this document; `git status --short` at the end proves the
write set. Nothing here renders a component, so every claim about what paints
on screen is a reading claim (`docs/loop/this-repo.md` section 6).

---

## 0. Disposition of round 1

Round 1's requirements, one row each. "Withdrawn" names the measurement that
withdrew it and any enforcer it was protecting.

| Round-1 requirement | Disposition |
|---|---|
| S2: "U10 keeps assignment text out of localStorage" is a rule "this repo already tests for", and it blocks writing `assignmentText` into a persisted row | **WITHDRAWN.** Measured false, section 2. Enforcer it claimed: none exists. The convention survives as R-A24-3, restated with the correct direction of failure. |
| S2: the disclosure predicate "cannot be built from any data the surface stores today without (a) a new per-row identity marker WITH ITS OWN PERSISTED KEY, or (b) no disclosure at all" | **WITHDRAWN.** A per-row field rides inside the existing `ta-snap-table` envelope and adds no `ta-snap-*` literal (section 2). The two-branch fork is replaced by one narrower question, section 6. |
| S4: "Any new persisted control this feature adds ... needs a `ta-snap-*` key and MUST add that literal to this exact array in the same commit" | **KEPT, NARROWED to R-A24-8.** True for a new instructor-facing control. False for a per-row field. Round 1 applied the control price to both. |
| S4: the `ta-snap-*` set at `snapshot-grading.structure.test.ts:195-201` is an exact-set assertion of four key names | **KEPT.** Re-verified verbatim, section 2. |
| S1: "fully built and already reused four times over" / S5: "five call sites" / "five of five grading-adjacent surfaces" | **WITHDRAWN.** Measured: 3 production call sites, section 1. |
| S1: "`entry={...} defaultExpanded` is its whole call contract" | **WITHDRAWN.** Measured: 4 mounts, one without `defaultExpanded`. Becomes a wave-3 decision, section 5. |
| S3/S6 wave 0: extract `STORAGE_KEY_TABLE` + the `useAssessmentRowStore` call into a `useSnapshotSessionRows.ts`, mirroring `useGradingRows.ts:171,317` | **WITHDRAWN.** Two assertions pin both to the panel's OWN source (section 3). Replaced by a constraint plus a numeric target, section 7 wave 0. |
| S6: wave 0 exit criterion "comfortably under 1000 with room for wave 2" | **WITHDRAWN.** Replaced by a number: 928 or below, derived in section 3. |
| S6: both wave gate commands (`npm run test:paths -- <production source paths>`) | **WITHDRAWN.** Both exit 1 as written (section 7). Replaced by gates naming test files, each run green this pass. |
| S3: the 1000-line ceiling applies with no ratchet and no recording-split coverage | **KEPT.** Re-verified, section 3. |
| S2: `GradeResult` field mapping and the `rubricAreas` conversion gap | **KEPT** as R-A24-1. |
| S3: React Compiler `preserve-manual-memoization` hazard on hook removal from this panel | **KEPT**, and now load-bearing: it is one of the two reasons wave 0 prefers a JSX extraction over a hook extraction. |
| R-A24-1 (rubric-area `comment` mapping) | **KEPT**, id unchanged. |
| R-A24-2 (the identity/disclosure fork) | **HANDED OVER to the repo owner** as the section 6 question, with a recommendation. Obligation: answer "name them or not". Everything else is buildable on the recommended answer. |
| R-A24-3 (U10 compliance of a new field) | **KEPT**, id unchanged, direction of failure corrected: there is no enforcer, so the failure is silent by construction rather than "silently, since no existing test scans for it" competing with section 2's opposite claim. |
| R-A24-4 (REGRESSION.md baseline) | **KEPT**, id unchanged, re-measured. |
| R-A24-5 (every UI claim is a reading claim) | **KEPT**, id unchanged. |
| R-A24-6 (repo-grades is out of scope) | **WITHDRAWN as a residual.** It self-declared "Owner: none needed. Instrument: none. Step: n/a", which by `iteration-caps.md` is not a residual. Retained as a plain scope-boundary sentence, section 1. No enforcer protected it. |
| S1: `classTrendsRunCohort.ts` is 182 lines | **WITHDRAWN.** 181 by all three counters, section 3. |
| S1: `SnapshotGradingPanelProps` at `:75-77`; mount at `RecordingTab.tsx:867` | **WITHDRAWN as written, claim KEPT.** Declaration is `:79-81`; mount path is `src/app/components/RecordingTab.tsx:867`. |
| S1: "no clearing action anywhere in the file ... not reproduced in full here" | **WITHDRAWN as written, narrower claim KEPT and now evidenced**, section 1. |

New in this round: R-A24-7 (the serialization key-set instrument round 1 and
the check both missed) and R-A24-8 (the narrowed key rule).

---

## 1. What exists today, re-measured

**The trend engine and panel are built and reused, but by three call sites,
not four or five.**

```
grep -rln "hasTrendableResults" src --include=*.tsx --include=*.ts | grep -v test   -> 5 files
grep -rln "hasTrendableResultsXYZNOPE" src --include=*.tsx --include=*.ts           -> exit 1 (canary)
grep -rn  "hasTrendableResults" src --include=*.tsx --include=*.ts | grep -v "\.test\."
```

Opening each of the five files the first grep named:

| File | What it is |
|---|---|
| `src/app/components/grading-results/classTrendsEntry.ts:52` | the definition |
| `src/app/components/grading-recording/GradingRecordingPanel.tsx:944` | production call site |
| `src/app/components/GradingResults.tsx:605` | production call site |
| `src/app/components/repo-grades/classTrendsFolderEntry.ts:95` | production call site |
| `src/app/components/grading-recording/classTrendsRunCohort.ts:17,35` | COMMENTS ONLY. `:35` reads "`hasTrendableResults` is not imported here at" |

**Three production call sites.** A file-count grep was read as a call-site
count in round 1; `leverage.md`'s failure-mode-B is a counting procedure, so
the corrected denominator is stated here rather than inherited.

**`ClassTrendsPanel` has four mounts, and its call contract is not what round
1 said.**

```
grep -rn "<ClassTrendsPanel" src --include=*.tsx --include=*.ts | grep -v "\.test\."
grep -rn "<ClassTrendsPanelXYZNOPE" src --include=*.tsx   -> exit 1 (canary)
```

- `src/app/components/DraftedGradesTab.tsx:655` - `entry={entry}`, **no `defaultExpanded`**
- `src/app/components/grading-recording/GradingRecordingPanel.tsx:946` - `entry={trendsEntry} defaultExpanded`
- `src/app/components/GradingResults.tsx:607` - `entry={classTrendsEntry} defaultExpanded`
- `src/app/components/repo-grades/index.tsx:856` - `entry={trendsEntry} defaultExpanded`

Three of four pass `defaultExpanded`; Drafted Grades deliberately omits it.
Whether a screenshot-grading session's blended trends open expanded is
therefore a real choice wave 3 must make, not a copied default (section 5).

**The A16 precedent, verified line by line.**
`classTrendsRunCohort.ts` is **181** lines (`@(Get-Content).Count` = 181,
`wc -l` = 181, `Measure-Object -Line` = 167). `buildRunCohort` at `:98-152`
merges raw results onto a per-row identity projection captured at the click;
`toRunCohortEntry` at `:157-164`; `runCohortMeta` at `:169-171`;
`cohortLabelSpread` at `:178-181` is
`new Set(cohort.rows.map((r) => r.assessment)).size > 1`. The disclosure
renders at `GradingRecordingPanel.tsx:950-956`: "This run graded submissions
from more than one assessment label - the trends above combine them."

**The snapshot surface has no course or assessment identity, re-verified.**
`grep -n "assessmentId\|courseScope\|assessmentLabel" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`
returns nothing, exit 1, not piped through `head`. Canary on the same file:
`grep -c "useState"` returns **21**. `SnapshotGradingPanelProps` is
`{ active: boolean }` at `:79-81`, sole use at `:83`
(`grep -c "SnapshotGradingPanelProps"` returns 2), and the one mount is
`src/app/components/RecordingTab.tsx:867`,
`<SnapshotGradingPanel active={active && recView === "snapgrade"} />`.

**The persisted table never shrinks, which is the fact that makes this row
worth doing.** `commitSessionRows` has exactly three production call sites
(`grep -rn "commitSessionRows(" src/app/components/snapshot-grading/*.ts src/app/components/snapshot-grading/*.tsx | grep -v "\.test\."`):
`SnapshotGradingPanel.tsx:685` and `:694` (both edits) and
`useSnapshotGrade.ts:272` (the grade commit). None removes a row. Canary on
the same shape: `grep -rn "removeAssessmentRowXYZNOPE" src/app/components/snapshot-grading/`
exits 1.

Round 1 wrote "no clearing action anywhere in the file ... returns nothing
production-relevant" and suppressed its own output. The full output, since an
absence claim in this repo may not hide its evidence -
`grep -in "clear" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`
returns **14** lines, including live production code at `:406`
(`clearPerStudentShots()`), `:420` (`clearPendingAutoGrade()`), and `:773`
(`confirmLabel="Confirm - clear this student's shots"`). **The narrow claim is
the true one and it is the one that matters: nothing clears the
completed-assessments TABLE.** "Next student" clears shots, not rows - the
panel says so itself at `:421` ("Cleared this student's shots. Assignment and
rubric shots are kept.").

The disclosure the surface already carries is at
`SnapshotGradingPanel.tsx:930-932`, and it is TWO sentences, not one:

> Completed assessments ({sessionRows.length}) - some may be from an earlier
> session, restored on reload. Reloading clears the shots; completed
> assessments are kept.

The second sentence is the one round 1 omitted and it is directly load-bearing:
the table survives everything the instructor can do except clearing site data,
so "how many assignments are in this table" is unbounded, not "one or two".

**Scope boundary, stated so a reader does not wonder whether it was missed:**
`src/app/components/repo-grades/classTrendsFolderEntry.ts` has its own trends
adapter and is untouched by this row. This is a boundary sentence, not a
residual - it has no owner, instrument or step by construction.

---

## 2. The privacy premise round 1 was built on is false

Round 1's section 2 said the cheap move "is blocked by an existing, tested,
deliberate rule", citing `snapshot-grading.structure.test.ts:195`. Opened this
pass, `:195-201`:

```
it("finds exactly the expected ta-snap-* key set (... U10 keeps shot bytes and
    rubric/assignment text out of localStorage)", () => {
  expect(distinctKeys).toEqual([
    "ta-snap-armed-role",
    "ta-snap-auto-grade-armed",
    "ta-snap-grading-instructions",
    "ta-snap-table",
  ]);
});
```

`distinctKeys` is built at `:188-189` from
`combinedSource.match(/(?<![a-zA-Z])ta-snap-[a-z-]*[a-z]/g)`. **The assertion
is an exact set of KEY NAMES. The U10 sentence is inside the `it()` description
string and is asserted nowhere.**

Census of the whole test file:

```
grep -n "U10\|assignmentText\|rubricText" src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
  -> 2 lines: :131 (a comment) and :195 (the it() description). Zero assertions.
grep -c "expect" <same file>   -> 122   (canary: the instrument fires on this file)
```

**U10 is a convention, documented in five places and enforced nowhere.**
The five: `useSnapshotShots.ts:13`, `SnapshotGradingPanel.tsx:143-147` (the
`assignmentText`/`rubricText` useState pair's own comment), `:152-157`,
`SnapshotRubricCaptureReview.tsx:29`, `useSnapshotRubricCapture.ts:47`.

Two consequences, and the second is the dangerous one:

1. Writing `assignmentText` into a row persisted under the EXISTING
   `ta-snap-table` key adds no new `ta-snap-*` literal, so this canary stays
   green. The expensive branch round 1 recommended was priced against a wall
   that is not there.
2. **Nothing stops an implementer taking the cheap-and-wrong version.** An
   implementer who stores raw assignment text on the row ships it green
   through tsc, lint, the build's compile line and all 20,200 tests. That is
   the real hazard on this row and it is the inverse of the one round 1
   described. It is R-A24-3, and section 4 gives it an instrument.

**One guard that does exist, and does NOT block this.**
`snapshot-row-serialization.ts:57` types `toWire`'s parameter as
`NoPostableIdentity<SnapshotAssessmentRow>`. Opened
`src/app/components/assessment-shared/assessment-row.ts:47-58`:
`ForbiddenIdentityKeys` is `userId | user_id | canvasUserId | sisUserId |
loginId | canvasSubmissionId | submissionId | enrollmentId | studentId`. It is
a STUDENT-identity guard, compile-enforced with a type-only fixture at
`no-postable-identity.types.ts`. An assignment-cohort field is not among the
forbidden keys, so this guard neither blocks nor helps here. Stated because it
is the obvious objection to a new row field and it does not hold.

---

## 3. What a per-row cohort field actually costs

Round 1 priced a per-row marker as needing "its own persisted key" and a
canary bump. It needs neither. It does need two things round 1 and the round-1
check BOTH missed.

**(i) The row codec enumerates fields, so a new field must be added by hand in
two places.** `snapshot-row-serialization.ts:57-114` (`toWire`) and `:124-246`
(`fromWire`) each list every field explicitly. The file's own header at
`:34-55` says why, and also states the hazard: the `row as unknown as
SnapshotAssessmentRow` cast at `:60` means **tsc will NOT flag a field added to
the type and forgotten in the codec**. So a cohort field added to
`SnapshotAssessmentRow` and not added to `toWire`/`fromWire` silently fails to
survive a reload, with every gate green.

**(ii) There IS an enforcing instrument for that, and it is an exact key set.**
`snapshot-row-serialization.test.ts:93-113`:

```
expect(Object.keys(result).sort()).toEqual([ ...17 field names... ].sort());
```

and a second exact set at `:379-392` (`actualKeysToDegrade` against
`tableCoveredFields`). Adding an 18th field turns the first red and, depending
on whether the field is in the degrade-excluded set, the second too. Canary
that this file's instrument fires: `grep -c "expect"` returns **49**; the file
is 476 lines by `@(Get-Content).Count`, 441 by `Measure-Object -Line`.

**This is good news, not a cost to avoid.** It is the one place in this
directory where a forgotten cohort field fails loudly. The requirement is that
`snapshot-row-serialization.test.ts` is in the write set of whichever wave adds
the field (R-A24-7), not that the field is avoided.

**(iii) The data is already in scope at the commit point.**
`grep -rn "assignmentText" src/app/components/snapshot-grading/ | grep -v "\.test\."`
shows `useSnapshotGrade.ts:37` (the params type), `:84` (destructured),
`:230` (`pastedTextCorpus`), `:241` (`hasAssignmentText`), `:290` (the
dependency array). The row is built at `:262-271` and committed at `:272`,
`commitSessionRows(upsertSnapshotRow(sessionRowsRef.current, merged))` - the
exact analogue of `GradingRecordingPanel.tsx:641`. `assignmentText` is in
lexical scope at line 272. Opened and read; not inferred.

**(iv) The predicate needs distinctness, not text.** `cohortLabelSpread`
(`classTrendsRunCohort.ts:178-181`) is a `Set` size comparison. A
non-reversible digest of `assignmentText.trim()` supplies exactly that,
stores no assignment text, needs no instructor-facing control, needs no
`ta-snap-*` key, and does not move the canary at `:195-201`.

**Honest qualification, which the owner should see before section 6's
question:** a digest is not unconditionally non-reversible. An attacker who
already holds a candidate assignment text can confirm a match against a stored
digest. That is weaker than storing nothing and stronger than storing text. It
is a design judgement to record (R-A24-3), not a rule this repo tests.

### Line budget, both counters, this pass

```powershell
$f="src/app/components/snapshot-grading/SnapshotGradingPanel.tsx"
@(Get-Content $f).Count                        # 970   <- the mandated instrument
(Get-Content $f | Measure-Object -Line).Lines  # 908   <- 62 lower, wrong
```

`wc -l` (Bash tool) also gives **970**. The two instruments disagree by 62 on
this file, not the 42 `this-repo.md` cites for a different file.

`LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:41`.
`grep -n "SnapshotGradingPanel" src/file-size-ceiling.structure.test.ts` exits
**1**; canary on the same file, `grep -c "ALLOWED_OVERAGE"`, returns **2**. So
no ratchet entry exists. `isCoveredByRecordingSplitCheck` (`:56-63`) with
`COVERED_BY_RECORDING_SPLIT_CHECK` (`:51-54`) covers only
`src/app/components/recording/<direct child>` plus `RecordingTab.tsx` and
`TabShell.tsx`; this file is in a different directory. **30 lines of headroom,
strictly enforced.**

### The number wave 0 must hit

A16's comparable addition to the sibling surface, re-measured rather than
inherited:

```
git show --numstat --format="" cbe84e2   ->  73  1  .../GradingRecordingPanel.tsx
git show cbe84e2^:src/app/components/grading-recording/GradingRecordingPanel.tsx | wc -l   -> 918
git show  cbe84e2:src/app/components/grading-recording/GradingRecordingPanel.tsx | wc -l   -> 990
```

Net **+72** against the 46 lines A16 budgeted - a 1.57x overrun, which is the
only measured estimate-overrun factor this repo has and is used again in
section 7.

**Wave 0's exit criterion: `@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count`
must return 928 or lower.** 1000 - 72 = 928 leaves the measured A16 addition
exactly zero margin; any number below 928 leaves that much margin for the next
feature. The extraction is genuinely required: 30 lines of headroom against a
measured 72.

---

## 4. Persistence and the key canary, narrowed correctly

The directory's key canary is `snapshot-grading.structure.test.ts:176-202`
(describe at `:176`, exact set at `:195-201`), and it is the only gate anywhere
in this repo that can see a key added here:
`grep -rn "ta-snap" src --include=*.test.ts | grep -v "snapshot-grading/"`
returns nothing, exit 1.

Two rules, because round 1 collapsed them into one and mispriced the feature:

- **A new instructor-facing persisted CONTROL** (a typed label, a "start new
  run" marker, a declared course name) needs a `ta-snap-*` key AND that literal
  added to the array at `:196-201` in the same commit, or the wave fails.
  It also needs a mount effect, not a `localStorage`-seeded `useState`
  initializer - see `SnapshotGradingPanel.tsx:159-164`'s own comment, which
  records that a seeded initializer never shows its restored value and React
  only warns on the hydration mismatch.
- **A new FIELD on `SnapshotAssessmentRow`** rides inside the existing
  `ta-snap-table` envelope. It adds no `ta-snap-*` literal, so this canary does
  not move. Its enforcing instrument is
  `snapshot-row-serialization.test.ts:93-113` and `:379-392` instead
  (section 3).

---

## 5. Leverage, re-answered on the corrected count

**The trend mechanism is inherited, not earned.** SCALE and GUARANTEED
(`leverage.md`'s taxonomy) are already carried by three production call sites
and four mounts before this row starts. By failure-mode-B, a mechanism free to
every comparable surface describes the platform. A24 adds zero trend
mechanism.

**What A24 can earn is narrower and real: LIVE-LOOP plus a disclosed cohort
boundary.** The surface's persisted table never shrinks (section 1), so an
instructor who graded assignment A on Monday and assignment B on Tuesday sees
one blended trends panel with nothing telling them so. The removal test, stated
the way `leverage.md` requires - name the deletion, then name the assertion
whose observed value changes:

> **Deletion:** the `cohortSpread` call that gates the disclosure line in
> `SnapshotGradingPanel.tsx`'s JSX.
> **Assertion whose value changes:** a source-text assertion in
> `snapshot-grading.structure.test.ts` that the disclosure paragraph's own
> anchored slice references the spread predicate. With the call deleted, the
> start anchor still resolves and the slice no longer contains the predicate
> name, so the assertion's observed value changes from true to false.

Stated as a pass condition: **object** = the anchored slice of
`SnapshotGradingPanel.tsx` bounded by the disclosure paragraph's own opening
text and its closing tag; **instrument** = `fs.readFileSync` plus
`String.indexOf` in `snapshot-grading.structure.test.ts`, the anchored-slice
idiom that file already runs at `:263-264`, `:322-323`, `:352-353` and
`:364-365` (each pairs a start `indexOf` with an end `indexOf`, asserts both
anchors resolved, then asserts on the slice); **direction of failure** = RED
when the slice does not reference the spread predicate, and RED when either
anchor fails to resolve.

**If the disclosure is dropped, A24 ships decorative by its own standard** -
`hasTrendableResults` gating a panel that silently averages however many
assignments are sitting in `ta-snap-table`, with less honesty than the sibling
tool. That is a regression against the bar A16 set, not a smaller version of
it.

**Wave 3 also inherits an unstated choice**: three of four `ClassTrendsPanel`
mounts pass `defaultExpanded`, Drafted Grades deliberately does not
(`ClassTrendsPanel.tsx:78,81-86`). On a surface whose whole problem is that
cohort membership is invisible, opening expanded shows the blend immediately
and opening collapsed hides it behind a click. Wave 3 must choose and say why;
it is not a copied default.

**A weak default to refuse explicitly.** Round 1 offered "a fixed string like
'Screenshot grading'" for the panel heading. `assignmentName` is read exactly
once, at `ClassTrendsPanel.tsx:206`, and passed to a child heading; `courseName`
is never read past the type import. Implemented as written, the panel renders
a heading reading "Screenshot grading" over trends that average three
assignments - literally true and informationally empty on the one surface whose
problem is exactly that. **Requirement: the heading must carry the same
information the disclosure line carries, or the disclosure line must sit above
the fold of the panel.** Which one is wave 3's call; shipping neither is not.

---

## 6. THE QUESTION FOR THE OWNER

Two rounds have not settled one thing, and it is a product call, not a
measurement. Per `AGENTS.md` "Two rounds, then ask", it goes to the owner
rather than into a third round. Everything else in this document is buildable
on the recommended answer.

> **When screenshot grading has graded more than one assignment into the same
> persisted table, should the trends panel be able to NAME the assignments, or
> is "more than one assignment" enough?**

**What each option costs, measured.**

| | Digest (recommended) | Instructor-typed label |
|---|---|---|
| New instructor control | none | one textbox in a panel with 30 lines of headroom |
| New `ta-snap-*` key | none | one, plus the canary bump at `snapshot-grading.structure.test.ts:196-201` in the same commit, plus a mount effect (section 4) |
| New row field | one, via `toWire`/`fromWire` + the two exact key sets at `snapshot-row-serialization.test.ts:93-113,379-392` | the same, plus the control above |
| Assignment text stored | none | none (the instructor types a nickname) |
| What the line can say | "more than one assignment" | "Homework 3 and Quiz 1" |
| Extra panel lines beyond the digest branch | 0 | the control's JSX plus persistence wiring. The only persisted-textbox precedent in this panel is `INSTRUCTOR_INSTRUCTIONS_KEY`: the restore effect at `SnapshotGradingPanel.tsx:165-181` and the write handler at `:182-193` are **29 lines of wiring** before the TextField itself, and the panel has 30 lines of headroom today |

**Recommendation: the digest.** It clears the leverage bar in section 5 (the
removal test is identical under both), it stores nothing sensitive, it does not
move the key canary, and it does not ask a 970/1000 panel for a new control.
Round 1 recommended the label branch and priced it as the minimum; it is the
expensive branch.

**What it costs to be wrong.** If the owner wants naming, the label branch
needs a second extraction from the panel (the control does not fit in 30 lines
and wave 0's 928 target was sized for the feature, not for the feature plus a
textbox), plus the canary bump, plus the mount effect. That is roughly one
extra wave. Nothing built for the digest branch is wasted: the row field, the
adapter leaf, the spread predicate and the mount are identical; only the
field's VALUE changes from a digest to a typed string.

**Until the owner answers, build the digest.** Section 7 is written against it,
and section 7's wave 1 is where a different answer is absorbed.

---

## 7. Wave plan

Every gate below was RUN this pass and its exit code read from a file, not a
pipe. Round 1's gates passed production source paths to `npm run test:paths`,
which credits arguments against executed TEST files. Measured:

```
npm run test:paths -- src/app/components/snapshot-grading/SnapshotGradingPanel.tsx \
                      src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
```

```
NOT COVERED src/app/components/snapshot-grading/SnapshotGradingPanel.tsx files=0 passed=0
COVERED src/app/components/snapshot-grading/snapshot-grading.structure.test.ts files=1 passed=62
```

Exit code, read from a file: **1**. No test file in that directory can ever
credit that argument. **The tempting fix - dropping the wrapper for a raw
`npx vitest run <paths>` - is forbidden**: raw multi-path vitest silently drops
unmatched arguments and exits 0 (`this-repo.md` section 1). The fix is to name
test files.

The test files that read this panel's source, measured:

```
grep -rln "SnapshotGradingPanel.tsx" src --include=*.test.ts
  -> snapshot-autofire.structure.test.ts, snapshot-grading.structure.test.ts,
     snapshot-role-setrole-callsites.structure.test.ts, src/loop-docs.structure.test.ts
canary: grep -rln "SnapshotGradingPanelXYZNOPE.tsx" src --include=*.test.ts  -> exit 1
```

(`src/loop-docs.structure.test.ts` reads `docs/loop/this-repo.md`, not the
panel; it is excluded from the gates below deliberately.)

### Wave 0 - extraction. Numeric target, and a constraint round 1 did not have.

**Goal:** `@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count`
returns **928 or lower** (derivation in section 3). Currently 970.

**THE CONSTRAINT, and it is what round 1's candidate violated.**
`snapshot-grading.structure.test.ts`'s describe block "A4d" at `:151` reads
`SnapshotGradingPanel.tsx`'s OWN source (`panelPath` `:152`, `panelSource`
`:153`) and asserts:

- `:157-159` - `expect(panelSource).toMatch(/const STORAGE_KEY_TABLE = "ta-snap-table";/)`
- `:161-166` - `expect(stripComments(panelSource)).toMatch(/useAssessmentRowStore<SnapshotAssessmentRow>\(\s*STORAGE_KEY_TABLE,\s*snapshotRowCodec/)`

Both currently satisfied at `SnapshotGradingPanel.tsx:209`
(`const STORAGE_KEY_TABLE = "ta-snap-table";`) and `:219`
(`} = useAssessmentRowStore<SnapshotAssessmentRow>(STORAGE_KEY_TABLE, snapshotRowCodec, {`). The
block's own header at `:141-149` says why it exists: without it, deleting the
`useAssessmentRowStore` call would stop persistence silently with every other
gate green.

**So: `STORAGE_KEY_TABLE`'s declaration and the `useAssessmentRowStore(...)`
call STAY in `SnapshotGradingPanel.tsx`.** Round 1 ordered exactly those two
out, citing `useGradingRows.ts:171,317` as the precedent to mirror - that
precedent is what this test forbids for this directory. Re-pointing the two
assertions at a new hook file is possible but weakens the one instrument that
catches persistence silently stopping, and is not recommended without the
architect saying so in writing.

**Two further constraints on what may move:**

- **Prefer a JSX extraction to a hook extraction.** `this-repo.md:85-100`
  records that moving a ref-freshness cache out of THIS FILE passed tsc and all
  tests and then failed `npm run lint` with 2 React Compiler
  `preserve-manual-memoization` errors on `handleNextStudentConfirm`, a
  callback nowhere near the moved code. Any wave removing hooks from this panel
  must re-run lint, not just tsc and vitest.
- The extraction target is the architect's, subject to the above. Candidates
  visible in the render tree, each range opened and its closing `)}` confirmed
  this pass, none mandated: the pinned-rubric-areas block (`:881-907`, 27
  lines), the completed-assessments block (`:928-945`, 18 lines), and the two
  modal blocks (`:947-957`, 11 lines; `:959-967`, 9 lines). None of the four
  alone reaches 42 lines, so wave 0 needs more than one, or a different target.

**Write set:** `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`,
the new extracted file, and that new file's own test.

**Gate (run this pass, exit 0):**

```
npx tsc --noEmit
npm run lint
npm run test:paths -- src/app/components/snapshot-grading/snapshot-grading.structure.test.ts \
                      src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts \
                      src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts \
                      <the new file's own test>
```

Measured without the new test argument, this pass:
`COVERED ... snapshot-grading.structure.test.ts files=1 passed=62`,
`COVERED ... snapshot-autofire.structure.test.ts files=1 passed=17`,
`COVERED ... snapshot-role-setrole-callsites.structure.test.ts files=1 passed=5`,
exit code read from a file: **0**.

**Exit condition.** Object: `SnapshotGradingPanel.tsx`'s line count.
Instrument: `@(Get-Content <path>).Count` in PowerShell, never
`Measure-Object -Line` (62 lower on this file). Direction of failure: FAIL if
the returned number is greater than 928.

### Wave 1 - absorb the owner's answer. Design only, no code.

If the owner answered "digest", this wave is a one-paragraph confirmation and
the mapping decision in R-A24-1. If the owner answered "name them", this wave
re-cuts waves 2 and 3 for the label branch (new key, canary bump, mount effect,
and a re-sized wave 0 target). Output is a decision record, not a file list.

### Wave 2 - the leaves. Pure, unit-testable, no React.

Two new files under `src/app/components/snapshot-grading/`, names
illustrative:

- `snapshotCohortKey.ts` - one exported pure function turning
  `assignmentText` into the stored cohort marker. It must be a plain `.ts`
  leaf: vitest here is node-env and renders nothing, so logic inline in a
  `.tsx` cannot be tested at all (`this-repo.md` section 2).
- `classTrendsSnapshotEntry.ts` - converts `SnapshotAssessmentRow[]` into a
  `GradingRunEntry` and exposes the spread predicate. It must REUSE
  `toClassTrendsEntry`/`hasTrendableResults` from
  `grading-results/classTrendsEntry.ts`, never a second copy - the same rule
  `classTrendsRunCohort.ts:34-38` states for its own surface. Size precedent:
  `classTrendsRunCohort.ts` is 181 lines and its test is 353
  (`@(Get-Content).Count` on both).

The row field itself lands here too, because the codec and its instrument are
in this wave's write set.

**Write set:** the two new files and their tests,
`src/app/components/snapshot-grading/snapshot-row.ts` (the field on the type),
`src/app/components/snapshot-grading/snapshot-row-serialization.ts`
(`toWire` AND `fromWire`), and
`src/app/components/snapshot-grading/snapshot-row-serialization.test.ts` (the
two exact key sets at `:93-113` and `:379-392` - R-A24-7).

**Gate (run this pass without the two new test files, exit 0):**

```
npx tsc --noEmit
npm run test:paths -- src/app/components/snapshot-grading/snapshot-row-serialization.test.ts \
                      src/app/components/snapshot-grading/snapshot-row.test.ts \
                      src/app/components/snapshot-grading/useSnapshotGrade.wiring.test.ts \
                      src/app/components/snapshot-grading/snapshot-grading.structure.test.ts \
                      <the two new leaf tests>
```

Measured without the two new arguments: `COVERED` on all four
(60 / 66 / 22 / 62 passing), exit code read from a file: **0**.

**Sabotage requirement, not optional.** Because `toWire`'s cast at
`snapshot-row-serialization.ts:60` means tsc will not catch a field added to
the type and forgotten in the codec, the implementer must prove the instrument
fires: delete the new field from `toWire` alone and confirm
`snapshot-row-serialization.test.ts` goes red. Restore from a `cp` backup, not
`git checkout --` (which reverts to the index and destroys uncommitted work in
the same file).

### Wave 3 - the capture and the mount.

Capture the cohort marker at `useSnapshotGrade.ts:262-272`, inside the `merged`
object built at `:262` and committed at `:272` - `assignmentText` is already in
scope there (section 3). Mount `ClassTrendsPanel` gated on
`hasTrendableResults`, decide `defaultExpanded` explicitly (section 5), render
the disclosure line, and satisfy section 5's heading requirement.

**Write set:** `src/app/components/snapshot-grading/useSnapshotGrade.ts` (the
capture), `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` (the
mount and the JSX), and
`src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` (the
new anchored-slice assertion from section 5's removal test). The calling file
is in the list by construction - this repo has shipped a wave whose export had
no caller more than once.

**Gate:**

```
npx tsc --noEmit
npm run lint
npm run test:paths -- src/app/components/snapshot-grading/snapshot-grading.structure.test.ts \
                      src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts \
                      src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts \
                      src/app/components/snapshot-grading/useSnapshotGrade.wiring.test.ts \
                      <the two new leaf tests>
```

Then re-measure the panel:
`@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count`
must return 1000 or lower, and the wave must report the number, not "under the
limit".

**Sequencing.** Wave 0 before wave 3 (headroom before growth). Wave 1 before
wave 2 (the field's value shape depends on the answer). Wave 2 before wave 3
(wave 3 calls wave 2's exports). Wave 0 and wave 2 are file-disjoint and could
run concurrently AFTER wave 1 answers; before that there is no real concurrency
to claim.

---

## 8. Residual register

Each entry names an object, an owner, an instrument, a direction of failure and
the step that will measure it. An entry missing any of those is a deletion and
is not listed as a residual.

- **R-A24-1: the rubric-area `comment` gap.** Object:
  `RubricAreaResult.comment` (`src/lib/grade/types.ts:39-43`) when converting
  from `SnapshotRubricAreaEvidence` (`snapshot-row.ts:89-100`), which carries
  `quote` and has no `comment` field. Owner: the wave-1 architect pass.
  Instrument: the wave-2 adapter's own unit test, asserting the chosen value
  for a fixture row. Direction of failure: FAIL if the adapter emits a value
  the design note did not choose - in particular, a silent `""`, which renders
  every snapshot-graded area's commentary blank. Step: decided in wave 1,
  measured by the wave-2 test.

- **R-A24-2: the naming question.** Object: whether the disclosure line can
  name the assignments. Owner: **the repo owner** (section 6). Instrument: the
  owner's answer; there is no code measurement, which is why it is a question
  and not a round. Direction of failure: if unanswered, wave 2 builds the
  digest branch on the recommendation in section 6, and a later "name them"
  answer costs one extra wave, not a rebuild. Step: asked now, alongside other
  running work; absorbed in wave 1.

- **R-A24-3: U10 has no enforcer.** Object: whether any new persisted value on
  this surface carries assignment or rubric content. Owner: the wave-2
  implementer, checked by the loop-checker on wave 1's design note. Instrument:
  **there is none today** - measured in section 2, 2 grep hits and 0
  assertions against a 122-`expect` canary. The wave-2 design note must state
  the field's exact derivation, and wave 2 must add a source-text assertion in
  `snapshot-grading.structure.test.ts` pinning the cohort field's value to that
  derivation (the file already runs the anchored-slice idiom at `:263-264`,
  `:322-323`, `:352-353`, `:364-365`). Direction of
  failure: without that new assertion, a field storing raw or truncated
  `assignmentText` ships green through every gate this repo has. Step: wave 1
  states the derivation; wave 2 lands the assertion.

- **R-A24-4: REGRESSION.md has no baseline for this area.** Object: today's
  behaviour - the two-sentence completed-assessments disclosure at
  `SnapshotGradingPanel.tsx:930-932`, and the fact that the table never
  shrinks. Owner: the baseline seat, per `DEV_LOOP.md`'s Baseline step.
  Instrument: `grep -ac "snapshot.grading.*trend\|snapgrade.*trend\|A24" docs/REGRESSION.md`
  returns **0** this pass, exit 1; canary `grep -ac "^## "` on the same file
  returns **389**. Direction of failure: without an entry, a later regression
  pass cannot distinguish the disclosure line appearing from a regression.
  Step: before wave 3's implementer starts.

- **R-A24-5: every UI claim here is a reading claim.** Object: the JSX
  structure, the disclosure line's rendered text, the expanded/collapsed
  default, and the mount gating. Owner: the repo owner, in a real browser,
  after wave 3 ships. Instrument: manual check against the deployed app - no
  component renders under vitest (`this-repo.md` sections 2 and 6). Direction
  of failure: a source reading can be right about what the code says and wrong
  about what paints, focuses or announces. Step: the next owner verification
  pass after wave 3.

- **R-A24-7: the row codec's exact key sets.** Object:
  `snapshot-row-serialization.test.ts:93-113` and `:379-392`. Owner: the wave-2
  implementer. Instrument: those two assertions, plus the sabotage step in wave
  2 proving they fire. Direction of failure: a cohort field added to
  `SnapshotAssessmentRow` and forgotten in `toWire`/`fromWire` does not survive
  a reload, and the cast at `snapshot-row-serialization.ts:60` means tsc says
  nothing. Step: wave 2's gate plus its sabotage pass.

- **R-A24-8: the narrowed key rule.** Object: any NEW instructor-facing
  persisted control this feature adds (only reachable if the owner answers
  "name them"). Owner: whichever wave adds it. Instrument: the exact-set
  assertion at `snapshot-grading.structure.test.ts:195-201`, plus the mount
  effect precedent at `SnapshotGradingPanel.tsx:159-164`. Direction of failure:
  a key added without bumping the array turns the canary red (loud, good); a
  `localStorage`-seeded `useState` initializer without a mount effect restores
  nothing visible and React only warns on the hydration mismatch (silent, bad).
  Step: the wave that adds the control, if any.

---

## 9. What this pass could not determine

- Whether the digest's confirmable-match weakness (section 3) matters for this
  owner's threat model. That is a judgement, not a measurement, and it rides
  with the section 6 question.
- Anything about rendered output: markup, focus order, the expanded default's
  actual appearance, or what a screen reader announces. No component renders
  under vitest here.
- Whether the architect's chosen wave-0 extraction will trip the React
  Compiler lint rule. `this-repo.md:85-100` records it happening on this exact
  file; whether it recurs depends on what moves, and only `npm run lint` after
  the move can say.

---

## Verification

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

Exit code, written to a file and then read from that file rather than from a
pipe (`... > <out> 2>&1; echo $? > <exit-file>; cat <exit-file>`): **0**.

Both documents were also byte-scanned directly for non-ASCII content before
that run (a Python read of the raw bytes, counting every byte above 127):
**0 non-ASCII bytes in each**. Three U+2713 characters in a sibling document
turned the emoji gate red for every concurrent agent earlier today, which is
why this is measured rather than assumed.

`git status --short`, run immediately after the gate above and after both
files were written:

```
 M docs/BACKLOG.md
 M docs/a24-scope.md
 M docs/a32-scope.md
 M docs/backlog.yml
 M docs/css-orphans.md
 M src/tools/backlog/yaml-codec.test.ts
 M src/tools/backlog/yaml-codec.ts
```

This pass's write set is exactly `docs/a24-scope.md` and `docs/a32-scope.md`.
The other five entries belong to concurrent agents working other rows; none
was opened for writing here, and no file under `src/` was modified to produce
any measurement in this document.
