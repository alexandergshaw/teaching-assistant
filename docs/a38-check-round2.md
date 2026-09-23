# A38 - adversarial check, ROUND 2

Fresh checker. I did not author `docs/a38-scope.md`. Target: revision 2 at
commit `02c1f7e`. Revision 1 is `6c1fbed` (`git log --oneline -- docs/a38-scope.md`
returns exactly those two). Rulings read: `docs/a38-rulings.md` (5c99c43).

Everything below was re-measured in this checkout on 2026-09-23. Every
quantity names the command that produced it. No absence grep here is piped
through `head` or through a second filtering grep.

**VERDICT: NOT BUILDABLE AS WRITTEN.** 6 blockers, 8 majors, 8 minors.

---

## 0. Disposition-table audit, done BEFORE reading revision 2 on its own terms

`iteration-caps.md` entry gate 3 requires each prior requirement to map to
*kept (with id)* / *handed over* / *withdrawn*. Four rows fail the "with id"
half.

```
grep -n "^#\{1,3\} " docs/a38-scope.md
```

returns headings `0, 1, 2, 2.1-2.4, 3, 3.1-3.5, 4, 4.1-4.5, 5, 5.1-5.3,
6, 6.1-6.5, 7, 7.1-7.3, 8, 9, 10, 11, 12, 13`. **There is no section 1.1,
1.2, 1.3 or 1.4 in revision 2.** Yet the disposition table at `:32-35` marks
all four KEPT:

| `:32` | `§1.1 bound proof - KEPT, confirmed.` |
| `:33` | `§1.2 caller census - KEPT, confirmed.` |
| `:34` | `§1.3 canary - KEPT.` |
| `:35` | `§1.4 dead badge - KEPT, confirmed with a positive control. Grep count CORRECTED: 8 hits, not 4` |

And the body still points at one of them, twice:

```
grep -n "1\.4" docs/a38-scope.md
35:| §1.4 dead badge | KEPT, ...
511:"grading"`, which §1.4's badge reuse already makes true. That is three new
527:   `AssessmentStateBadge` warning badge reads `Grading` (§1.4).
```

`:511` is the derivation that discharges B3 - the reason "this row is busy"
is NOT a prop. Its cited evidence does not exist in the shipping document.
See M-1.

I checked the underlying claim myself so as not to overstate: the badge IS
real. `src/app/components/assessment-shared/AssessmentStateBadge.tsx:25`
reads `grading: { label: "Grading", variant: "ghBadgeWarning" }`, and
`GradingTableRow.tsx:152` renders it. So the FACT holds; the CITATION is
dangling. That is why M-1 is a major and not a blocker.

Residual register diff, rev 1 -> rev 2: RES-A38-1 withdrawn (built, ruling 2),
RES-A38-3 withdrawn (false absence), RES-A38-2/-4/-5/-6 carried, RES-A38-7
new. Every one is accounted for in the table. **Nothing was silently dropped
from the residual register.** That half is clean.

---

## 1. THE WAVE-0 EXTRACTION - the whole budget rests on it

### 1.1 The two greps, re-run verbatim

```
grep -rn "composeCaptureLiveSentence\|useThrottledLiveSentence\|previewRef\|statusRow\|visuallyHidden\|throttledLiveSentence\|stalled" src --include=*.test.ts | grep -i "grading\|panel"
# no output, exit 1
grep -rn "AddKnowledgePages" src --include=*.test.ts | grep -i grading
# src/app/components/recording/AddKnowledgePages.test.ts:275,282,283
```

Both reproduce exactly as the seat reports them. I then re-ran the absence
grep **without** the second filter (see M-3) and read every one of the 56
surviving hits. None pins `GradingRecordingPanel.tsx` lines 879-931.
`captureLiveRegion.test.ts:80` pins the HOOK's own file as source text, not
the panel; `useDiscussionCapture.wiring.test.ts:142` pins the hook's return
tuple, which wave 0 does not touch; `institutionTriggerWiring.test.ts:180`
pins the chat window's own live region.

I also checked every test that reads the panel as source text, which is a
larger set than the seat's ten-row table covers:

```
grep -rln "GradingRecordingPanel.tsx" src --include=*.test.ts | sort
# 17 files
```

Seven of the seventeen are not in the seat's table
(`discussion-capture.test.ts`, `discussion-knowledge-context.test.ts`,
`GradingRecordingPanel.assessment.test.ts`, `grading-recording-log.test.ts`,
`snapshot-autofire.structure.test.ts`, `recording-launch.test.ts`, the two
`module-deck-capture` files). I opened each mention. All seven are COMMENT
references naming the panel as a precedent, not pins on it. The only one that
scans the panel's text is `GradingRecordingPanel.assessment.test.ts:37`, whose
subject is the assessment selector.

`GradingRecordingPanel.wiring.test.ts`'s two free-identifier whitelists are
scoped to the trends-entry const's own initialiser (`:510-518`) and to the
disclosure guard (`:612-629`), not to the whole render body - `:493-501`'s own
canary proves that deliberately. So removing identifiers from the render body
cannot break them. Fence 1's reading is correct.

**The absence claim for lines 879-931 is TRUE.** I could not break it.

### 1.2 The panel, counted with both instruments

```powershell
PS> $f="src/app/components/grading-recording/GradingRecordingPanel.tsx"
PS> @(Get-Content $f).Count            # 990   <- the mandated measurement
PS> (Get-Content $f | Measure-Object -Line).Lines   # 947   <- 43 lower, wrong
```

990 is right. (`this-repo.md` records a 42-line gap on an earlier 964-line
version of this same file; today the gap is 43.)

### 1.3 Is 74 the real extractable count? NO - the document asserts both 74 and 63

This is B-5 and it is the finding that matters most, because ruling 1 made
wave 0 the precondition for the whole feature.

`§2.3`'s move table (`:167-175`) lists **`the two live-sentence consts and
their comment | 682-692 (11)`** as leaving the panel. Line 692 is:

```
sed -n '692p' src/app/components/grading-recording/GradingRecordingPanel.tsx
  const throttledLiveSentence = useThrottledLiveSentence(captureLiveSentence);
```

`useThrottledLiveSentence` is a React hook - `captureLiveRegion.ts:47-62`
declares it with `useState`, `useRef` and `useEffect`.

`§2.4` (`:192-200`), one screen later, says:

> "Wave 0 is a pure move ... The hooks stay in the panel, exactly as
> `GradingCaptureSettings.tsx` did (`GradingRecordingPanel.tsx:116-122`: 'No
> hook moved with it')."

Both cannot hold. The consequences are not cosmetic:

- **If the hook moves** (§2.3's branch): TOTAL OUT 74, NET -62, projected 928.
  §2.4's "pure move / no hook moved" is false, and `this-repo.md` section 1's
  measured hazard applies - extracting a hook out of a large panel here failed
  `npm run lint` on React Compiler's `preserve-manual-memoization` against a
  callback the wave never touched, while tsc and all 311 tests stayed green.
- **If the hook stays** (§2.4's branch): lines 682-692 do not move. TOTAL OUT
  63, NET -51, projected **939, not 928** - and the panel needs
  `throttledLiveSentence` as one more prop.

I verified every other row of the move table and the rest is sound:

```
grep -n "fmt(" GradingRecordingPanel.tsx      # 188 (def), 900 (only call)
grep -n "visuallyHidden" GradingRecordingPanel.tsx   # 77 (import), 911 (only use)
grep -n "previewRef" GradingRecordingPanel.tsx       # 201, 887(comment), 891
grep -n "controls\." GradingRecordingPanel.tsx       # 742..915, many outside the block
```

`fmt` is 188-192, exactly 5 lines, one call site. `visuallyHidden` has exactly
one use. `controls` and `styles` stay (used at 748, 788, 813, 854 and
elsewhere), so the new file needs its own imports - a cost the seat correctly
puts on the new file, not the panel.

The block 879-931 is 53 lines (`931 - 879 + 1`), split 40 + 13 exactly as the
table says. That arithmetic is right.

**Actual headroom.** Under §2.4's branch the panel lands at ~939, leaving 61
lines to the 1000 wall (`LIMIT = 1000`, `file-size-ceiling.structure.test.ts:41`;
the failure text makes 1000 legal and 1001 red, so +61). §6.3 budgets wave 1
at ~38 and §6.4's wave 2 at ~6, total 44. It fits, with 17 spare - but see
M-5, because the document states three different numbers for what the feature
needs, and §6.3's 38 omits at least the `gradingLocked` derivation and
understates a 7-argument hook call at 6 lines.

### 1.4 One small undercount, in the seat's favour

The import block is 72-77, not `73-77`. Line 72 is the first line of the CC12
comment (`// CC12: the status column moves out of aria-hidden; a throttled,
visually`). Extracting 73-77 orphans it. 6 lines, not 5. Minor only because it
makes the projection conservative.

---

## 2. THE CAP'S N - the justification is false exactly where the feature lives

§5.2 sets `N = gradingRows.totalCount` and glosses it:

> "When the table's total per-row attempts reach the row count, per-row
> grading on this table has spent at least as much as a full re-run would
> have."

**A bulk press does not grade `totalCount` rows.** Measured, in the action:

```
sed -n '146,152p' src/app/actions/grading-submission-grade.ts
    const maxSubmissions = getGeminiMaxSubmissions();
    ...
    const toGrade = submissions.slice(0, maxSubmissions);
    const overflow = submissions.slice(maxSubmissions);
grep -n "DEFAULT_MAX_SUBMISSIONS" src/lib/gemini.ts
32:const DEFAULT_MAX_SUBMISSIONS = 40;
```

One bulk press spends `min(totalCount, maxSubmissions)` model calls - and the
seat writes that sentence itself, six lines above setting N to `totalCount`
(`:646-648`). So N exceeds one bulk press's spend by exactly
`totalCount - maxSubmissions`, and that quantity is positive **precisely in
the overflow case A38 exists for** (§4.1: "When the table is already past the
bound, that is the remedy"). On a 200-row table the confirm first appears
after 200 per-row calls, against a full re-run's 40 - five times the quantity
the cap claims to restore. The cap is loosest where the risk is highest, and
it loosens monotonically as the table grows. See B-4.

Two further things I checked:

- **`totalCount` is course-scoped and mutable.**
  `grep -n "totalCount" src/app/components/grading-recording/useGradingRows.ts`
  gives `:502  totalCount: scopedRawRows.length`, and `:102` states
  "`rawRows`/`totalCount` stay scoped to COURSE ONLY". So N changes when the
  instructor changes the course selector, while `gradeAttempts` is per-row and
  persisted. Switching to a larger course silently raises the cap.
- **P-13 cannot detect any of this.** Its direction of failure is "RED when N
  does not move with the row count" - which the defective N satisfies by
  construction. P-13 is designed to pass on the very shape that is wrong.

---

## 3. THE B2 SHAPE RULING - broken on three reachable states, and self-contradictory on placement

The claim (`:382-393`):

> "THE OFFER BELONGS TO THE SURFACE THAT RENDERS THE CONTROL ... It is then
> true on every reachable state by construction rather than by argument."

The copy it protects (`:921`): *"Grade this row on its own to get past the run
limit."*

### 3.1 Counterexamples where the control's own condition holds and the sentence does not

§4.4's eligible set (`:489-493`) offers the control on `pending`, `failed` and
`ready`. So, with a rubric present:

1. **A `pending` row.** Never run, never hit any limit. The control renders
   (label `Grade`) and the offer renders with it. The sentence is false.
2. **A `ready` row.** Graded successfully. The control renders (`Re-grade`).
   False.
3. **A `failed` row that did not overflow.** `failed` has four producers in
   the action, and only one is the bound:
   `grading-submission-grade.ts:180` (`describeLlmFailure`), `:182`
   (`describeEmptyLlmText`), `:188` (the catch), `:196-208` (the overflow
   loop). A row that failed because the model errored gets the identical
   control, the identical condition, and an offer promising to get it "past
   the run limit" that never existed.

The eligibility predicate `gradingRowGradeAction(row, rubricPresent)` returns
`{ gradeable, label }` (§6.2, `:714`) and carries no information about WHY a
row failed. So the condition that renders the control cannot entail the
sentence. "True by construction" is false; it is still true only by argument,
and the argument does not hold.

A fourth, weaker case: §4.4's disabled reason 3 renders the control
**disabled** while the lock is held elsewhere. An offer beside a control that
cannot be pressed is an offer that does not work. This also contradicts §4.3's
"The control is offered only on a row that pressing it will actually grade".

### 3.2 The placement is unsatisfiable against its own pass condition

- §4.2 (`:389-391`): the offer is "adjacent to the control, inside the same
  condition that decides whether the control renders".
- P-9 (`:986-991`): "a source-text assertion that the offer literal appears
  only inside the same conditional expression as the control's tag".
- §7.3 (`:912-915`): "the message is `row.error` in the Status cell
  (`GradingTableRow.tsx:157`) and the control is in the Actions cell".

Measured, `sed -n '150,175p' src/app/components/grading-recording/GradingTableRow.tsx`:
`:151` opens a `<td>` holding the badge and, at `:157`,
`{row.state === "failed" && row.error && <p className={rowStyles.rowErrorText}>{row.error}</p>}`;
that `<td>` closes at `:158`. A second `<td>` at `:159` holds the score. A
third `<td>` at `:168` opens, and `:172` is the right-docked action cluster
where §4.4 puts the control.

Two different `<td>` elements cannot sit inside one conditional expression.
Either §7.3's placement is wrong, or §4.2's shape ruling and P-9 are
unsatisfiable. The document ships both.

### 3.3 The `rubricText` persistence claim - correct conclusion, falsified evidence

The claim is TRUE. Measured:

```
grep -n "rubricText\|localStorage" src/app/components/grading-recording/GradingRecordingPanel.tsx
```

`:383  const [rubricText, setRubricText] = useState("");` - and no
`localStorage` read or write anywhere near it. `STORAGE_KEY_COURSE` at `:172`
with its guarded initializer at `:270-274` and best-effort setter at
`:275-284` is a real, shipped shape to copy. Good.

But the document prints that grep's output as **one line**. The real output is
**13 lines**, including `:273`, `:278`, `:301`, `:306` (four real
`window.localStorage` calls), `:564`, `:595`, `:653`, `:665`, `:680`, `:803`,
`:807`, `:808`. In a section whose own closing lesson (`:437-439`,
`:1149-1154`) is "never truncate the grep that proves an absence", the
evidence for the absence is truncated. See M-2.

**The 7-key canary is confirmed at 7.** `grading-rows.test.ts:679-687`
asserts `toEqual` over exactly `ta-rec-grade-{assessment, course,
declarations, dismissed, filter, sort, table}`, over a `readdirSync` walk of
`grading-recording/` and `assessment-shared/` (`:651-658`), with two
non-vacuity canaries at `:660-668`. `ta-rec-grade-rubric` matches its
`/ta-rec-grade-[a-z-]*/g` pattern and sorts between `filter` and `sort`, so
7 -> 8 is right. `recording-split.structure.test.ts`'s own `ta-rec-*`
exact-set (`:344-...`) walks only `src/app/components/recording/`
(`:279`), so the new key is out of its reach; the seat's omission of that file
from §6.5 is harmless.

---

## 4. B4's PURE MUTATOR - hazard confirmed, fix sound, one instrument weak

**The hazard is real, at the cited lines.**
`src/app/components/assessment-shared/assessment-row.ts:172` opens
`applyAssessmentResult`; `:177-178` is the `userEdited` early return; `:180-188`
writes `totalScore`, `strengths`, `improvements`, `overallComment`, `state`,
`error` on an unedited row. `grading-rows.ts:175-178`'s
`applyGradingResultToRow` then sets `rubricAreas` unconditionally. Routing an
in-flight `state: "grading"` through that chain would blank a graded row's
feedback, and `handleGradeAll`'s `{ error }` branch
(`GradingRecordingPanel.tsx:600-608`) returns without applying any result, so
the blanking is permanent. The seat's reading is exact.

**`setGradingRowState(row, state) => ({ ...row, state })` is genuinely pure
and state-only** as specified, and it is the right fix.

**P-7 is a real instrument for the defect it names, but its "nothing else
changed" clause is a tautology against the specified implementation.** A
one-line spread cannot change another field; asserting that it does not is an
oracle computed from the thing it checks - the class
`grading-row-serialization.test.ts:703-706` warns about in its own comment.
P-7's power comes entirely from driving the REAL hook end to end, so that
routing through `applyGradingResult` is what fails it. The stated instrument
("collect every mutator call") reads as a spy on WHICH function was called,
which is strictly weaker. See m-7.

**And there is a hole P-7 cannot see, which is B-2.** §5.1 (`:640-642`):

> "It is incremented on every ATTEMPT, including a failed one ... That means
> it is written on the error path too - see §6.2's mutator."

§6.2's mutator is `setGradingRowState(row, state)`. It has no slot for a
count, and §6.4 never gives it one. The only writer the design names for
`gradeAttempts` is `classifyGradingResult` -> `applyGradingResultToRow`
(§5.1, §6.4) - and `classifyGradingResult` runs only over `result.results`,
which does not exist when the action returns `{ error }`. The seat states this
itself at `:736-738`. So the spend cap is not incremented on the failure path
its own text requires, and `gradeAttempts` is not in P-7's watched field list
either. No pass condition covers it.

---

## 5. B5's SPELLING - both readings confirmed; the prohibition is overstated; the control is right

**`:148` confirmed.** `grep -n "function countPrimaries" src/app/components/ui/buttonVariant.test.ts`
-> `148`. Its body (`:149-156`) skips any tag matching none of
`variant="contained"`, `variantFor\(`, `idleVariant="contained"`, then excludes
`color="error"`/`color="warning"`. The live gate is at `:229-236`, and `:236`
is `expect(actual).toEqual(FROZEN_PRIMARY_SITES)`. All exact.

**`:218` confirmed, but it does not "demand `variantFor(`".** Read in full,
`:211-219` is the *frozen ternary canary*: it bans the literal
`? "contained" : "outlined"` across section 4 and asserts `offenders` is
empty. `"spell a state-dependent primary as variantFor(...)"` is its FAILURE
MESSAGE - a remediation hint, not an assertion. So the "conflict" the seat and
ruling 3/B5 describe is narrower than stated: it exists only for a design that
needs a state-dependent MUI primary, and it is not a ban at all. The map's own
comment at `:159-162` says:

> "Adding a second filled button anywhere moves one of these numbers - bump it
> deliberately, in the same commit, with the reason."

`FROZEN_PRIMARY_SITES` is a ratchet you update with a reason, not a wall. The
seat treats it as an absolute prohibition (`:247-249`, "turning `:233-236`'s
`toEqual` red") and lets that drive the control's shape. See M-7.

**Does the resulting control meet the UI standard? YES - and the seat
understates its own case.** `pageStyles.linkButton` is not "unstyled": it is a
real class at `src/app/page.module.css:800`, with `:hover` at `:809` and
`:disabled` at `:817`. And the precedent is byte-exact:

```
sed -n '566,576p' src/app/components/repo-grades/RepoGradeCellControl.tsx
      <div className={styles.cellActions}>
        <button
          type="button"
          className={pageStyles.linkButton}
          disabled={edit.grading}
          onClick={() => { onGrade(); }}
        >
          {edit.grading ? "Grading…" : "Grade"}
        </button>
```

That is the same feature - a per-row Grade button with a `Grading…` disabled
label - already shipped on the sibling surface. **There is no conflict between
the lint gate and the UI standard here.** The control reuses the app's own
visual language for exactly this control. This is not a finding for the
orchestrator; the design outcome is correct, only the reasoning that reached
it is.

**The two stale comments are real.**
`GradingTableRow.tsx:271-274` ("`FROZEN_PRIMARY_SITES` pins this file's
primary-button count at 0") and `GradingTable.tsx:198-202` both cite a map
neither is a key in - I read `:163-209` in full and the only
`grading-recording` keys are `GradingRecordingPanel.tsx: 3`,
`LegibilityProbeModal.tsx: 2`, `RubricInputModal.tsx: 1`. The seat is right,
including on why they pass (`:234`, `if (n > 0 || rel in FROZEN_PRIMARY_SITES)`).

---

## 6. B6 AND THE HEAD-TRUNCATION SWEEP

**Both citations confirmed, untruncated:**

```
grep -rn "fnv1aHash" src/ --include=*.ts --include=*.tsx
...
src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx:57:import { fnv1aHash } from "@/lib/lms-generation/generation-diag";
src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx:610:      fnv1aHash(ctx.materialsText),
head -1 src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx
"use client";
```

17 hits total, no truncation. `fnv1aHash` IS imported and called from a
shipped `"use client"` panel. Withdrawing RES-A38-3 is right.

```
grep -rn "0x811c9dc5" src --include=*.ts --include=*.tsx
src/lib/client-state-sweep.ts:77:  let hash = 0x811c9dc5;
src/lib/lms-generation/generation-diag.ts:46:  let hash = 0x811c9dc5;
```

Two. Correct.

### The sweep for the same defect elsewhere in revision 2 - three hits

**(a) `:426-427`, the canary quantity is wrong.** The document says
`grep -rln "redactSensitiveText" src/ --include=*.ts --include=*.tsx`
"returns four files". Measured:

```
grep -rln "redactSensitiveText" src/ --include=*.ts --include=*.tsx | wc -l
12
grep -rln "redactSensitiveText" src/ --include=*.ts --include=*.tsx | grep -vc test
9
```

Twelve, or nine excluding tests. Neither is four. The canary still fires, so
the conclusion stands - but this is an unmeasured number in a document whose
opening rule is that every quantity names its command. M-4.

**(b) `:147`, the absence grep is filtered through a second grep.** The
instrument is `grep -rn ... | grep -i "grading\|panel"`. The unfiltered grep
returns **56** lines; the filter discards **all 56**. A `| grep -i` over an
absence proof is the same mechanism as a `| head`: it can drop a real hit
whose path and line text happen to contain neither word. The canary at `:149`
proves only that ONE known-surviving file survives the filter; it does not
prove the filter is lossless. I re-ran it unfiltered and read all 56, so the
conclusion survives - but it survived because I checked, not because the
instrument was sound. M-3.

**(c) `:351-352`, output presented as complete when it is not.** Covered in
section 3.3. M-2.

**(d) `:448-451`, the cost-disclosure canary is a different instrument.** The
absence grep is
`grep -rn "model call\|API call\|one call per\|costs one\|will spend" src/app/components --include=*.tsx`
(I reproduce its one hit, `courses/AskAiModal.tsx:23`, exactly). Its canary is
`grep -rc "model call" src/lib/grade/*.ts | grep -v ":0"` - a different
directory, a different pattern, and no `--include`. I confirm it returns 7
files, but 7 hits in `src/lib/grade/*.ts` say nothing about whether the
five-alternation pattern fires over `src/app/components/**/*.tsx`. M-8.

**No `| head` remains anywhere in revision 2.** `grep -n "| head" docs/a38-scope.md`
returns nothing outside the `:417` narrative about revision 1's own defect.

---

## 7. THE LOCK'S FOURTH BRANCH - the count is right, the design deadlocks

**I counted the non-success exits myself.**
`sed -n '563,653p' src/app/components/grading-recording/GradingRecordingPanel.tsx`
gives exactly three today, each clearing the cohort:

1. `:565-576` the readiness refusal - `setLastRunCohort(null); return;`
2. `:600-608` the `"error" in result` branch - same
3. `:648-653` the catch - `setLastRunCohort(null)` then `finally`

**The wiring test pins three, positively, and is blind to a fourth.**
`GradingRecordingPanel.wiring.test.ts:348-366`: three `it` blocks at `:349`,
`:355`, `:361`, each locating its branch by regex
(`readinessRefusalBody` at `:325-328`, `errorResultBranchBody` at `:330-333`,
`catchBranchBody` at `:335-338`) and asserting
`toMatch(/setLastRunCohort\(null\)/)` inside it. No count assertion anywhere;
the helper canary at `:341-345` only asserts each of the three is findable. So
a fourth non-clearing exit is invisible, and **a new fourth pin would fail
today**, because no lock exists. The seat is right on every part of this, and
the file genuinely must be OWNED in wave 1.

**But the four-line lock as specified deadlocks the surface.** §4.5 (`:597-601`):

```
if (gradingLockRef.current) return;   <- a new exit that returns BEFORE any run
gradingLockRef.current = true;        <- the claim
gradingLockRef.current = false;       <- in the existing finally
```

plus "the lock refusal clears `lastRunCohort` too - four lines".

The claim is released "in the existing `finally`" (§4.5, `:578`: "released in
`finally`"). `handleGradeAll`'s readiness refusal returns at `:575` - **before
`try {` at `:579`**. The document never says where the claim goes relative to
`checkGradingReadiness` at `:564`, and the literal reading of its own snippet
(three consecutive lines, the refusal first) puts the claim at the top. Then:

> Press "Grade submissions" with no rubric -> `checkGradingReadiness` refuses
> -> `return` -> the lock stays claimed for the life of the component. Every
> per-row button and the bulk button refuse silently, forever, with no
> message (§4.5: "A refused press is a silent no-op").

Nothing catches it. P-4 drives two `gradeRow` calls. P-5 drives
`handleGradeAll` during a row grade. Neither exercises "a readiness refusal,
then any press". This is the silent-green failure of the whole design: it
would pass lint, tsc, `next build`, every structure test and the entire §6.5
gate, and the feature would be dead on the second click. See B-1.

---

## 8. RESIDUALS, SILENT DROPS, AND THE TWO LOOP CARDS

**Residual register: complete** (section 0 above). No unowned deletion there.

**Findings outside the register with no owner, instrument or step**, which
`iteration-caps.md` calls a deletion:

- §3.3 / §13.5's three stale comments: `GradingTableRow.tsx:271-274`,
  `GradingTable.tsx:198-202`, `src/lib/gemini.ts:57-58`. All three confirmed
  real. None filed.
- §4.5's finding that the PRECEDENT surface has no lock at all
  (`useRepoGradesGradingActions.ts`'s `handleGradeCell` protected only by
  `disabled={edit.grading}`) - a real concurrency hole in shipped code, noted
  and dropped.

These are minors, but they are the shape the caps card names. m-5.

**The two loop cards: the decision was right, the citation is wrong.** The
document says (`:18-20`) "Both were corrected at 5c99c43 (ruling 5)."
Measured:

```
git show --stat --oneline 5c99c43
 docs/a38-rulings.md | 103 +++...
 docs/loop/seats.md  |  18 +++...
git show --stat --oneline 6c1fbed
 docs/a38-scope.md     | 974 +++...
 docs/loop/leverage.md |   4 +-
 docs/loop/seats.md    |   2 +-
```

`5c99c43` never touched `leverage.md`; it was corrected at `6c1fbed`, the
scope's own commit. I checked the substance rather than the hash:
`leverage.md`'s SCALE row now reads `DEFAULT_MAX_SUBMISSIONS = 40
(src/lib/gemini.ts:32, measured 2026-09-23)`, and `seats.md:123-135` now
carries the repaired passage in full, parsing correctly.
`grep -rn "cap of 5\|5 submissions" docs/loop/ docs/DEV_LOOP.md` returns
nothing. **Not re-escalating was correct.** m-1.

---

## 9. THE FEATURE-ALREADY-EXISTS CASE, argued at its strongest

The strongest version: `RepoGradeCellControl.tsx:567-576` already ships a
per-row `Grade` button with a `Grading…` disabled label, driven by
`useRepoGradesGradingActions.ts`'s `handleGradeCell`. If that path were
surface-agnostic, A38 would be a wiring job, not a feature.

It is not. `handleGradeCell` is bound to the Repo Grades cell model
(`edit.grading`, `cell.status`, `resolveRubricForColumn`), and
`useRepoGradesGradingActions.ts:263`'s `if (cell.status !== "ungraded")
return;` would exclude exactly the `failed` overflow rows A38 exists for.
Nothing in `grading-recording/` grades one row:
`grep -rn "GradingRecordingPanel.tsx" src --include=*.test.ts` surfaces no
single-row path, and `handleGradeAll` is the only caller of
`gradeCapturedSubmissionsAction`.

**The case is WEAK.** The seat's verdict is right, and I am not manufacturing
a reframe.

---

## 10. THE WEAKEST REQUIREMENT

**§4.2's shape ruling** (`:382-393`). It is the single clause most likely to
be implemented exactly as written and still produce a bad result: an
implementer binds the offer to the control's render condition, P-9 goes green
over the source text, and the shipped table tells every pending and every
successfully-graded row to "get past the run limit" it never hit. The
requirement is self-certifying - its instrument checks co-location, not truth -
and nothing renders a component here, so the owner is the first reader who
will ever see the sentence next to the wrong row.

---

## 11. GATE AND INSTRUMENT HYGIENE

- **No raw multi-path `vitest`/`npm test` anywhere in revision 2.** §6.5's
  verify gate is `npm run test:paths -- <36 paths>`. All 36 paths exist -
  I tested each with `[ -f ... ]` and none is missing, so none would be
  silently dropped.
- The seat's claim that
  `npx vitest run src/tools/vitest-paths/gate-commands.structure.test.ts`
  "exits 0, 28 passed, with this file present" **reproduces exactly**: `Tests
  28 passed (28)`, exit code `0` read from `/tmp/gatecmd.exit`, not from a
  pipe.
- **P-0's instrument cannot detect wave 0's documented failure mode.** P-0
  names "the full §6.5 gate ... green with no test edited in wave 0". The
  measured way a hook extraction from a big panel fails in this repo is
  `npm run lint` (React Compiler `preserve-manual-memoization`,
  `this-repo.md` section 1), which no test path runs. M-6.
- Fence 4's three pins re-measured and confirmed:
  `submission-kind-callsites.structure.test.ts:96-113` and `:122-129`;
  `markLate.wiring.test.ts:88-90` (the 1400-character window after `"D23c.
  Records THAT the work was late"`) and `:92-98` (no `new Date()`, no
  `Date.now(`). `grading-row-serialization.test.ts:707-731` is a 19-entry
  ordered array asserted at `:735` and `:740` - 19 -> 21 is right.
  `confirmArmButtons.test.ts:197-209` walks every `.tsx` under
  `src/app/components`. All accurate.
- `grep -rln "readdirSync\|readdir(" src --include=*.test.ts | sort | wc -l`
  returns **39**. Correct.
- `grep -rn "Math.floor(seconds / 60)" src/ --include=*.ts --include=*.tsx | grep -v test`
  returns exactly the four cited lines. Correct.
- `grep -rn "ungradedDisclosure" src/ --include=*.ts --include=*.tsx` yields
  exactly four non-test hits (`DraftedGradesTab.tsx:74`,
  `ungradedRowLabel.ts:26`, `GradingResults.tsx:66`,
  `src/lib/grade/types.ts:179`). Correct.

---

## 12. FINDINGS

### BLOCKERS - 6

**B-1. The lock is claimed outside the scope that releases it; a readiness
refusal deadlocks the surface for the session.** §4.5, `:578`, `:594-610`,
against `GradingRecordingPanel.tsx:564-579`. No pass condition reaches it.
Class: **resource claimed before an early return that the release path does
not cover**. **NEW.**

**B-2. Ruling 2's spend cap has no writer on the error path §5.1 requires.**
`:640-642` says the attempt count "is written on the error path too - see
§6.2's mutator"; §6.2's mutator is `setGradingRowState(row, state)`, which is
state-only, and the only named writer (`classifyGradingResult`) never runs when
the action returns `{ error }` - which `:736-738` states. Failed calls cost a
model call each; the cap undercounts them and no P- condition notices.
Class: **a requirement whose named mechanism cannot implement it**. **NEW.**

**B-3. The offer sentence is still false on reachable states, and its
placement is unsatisfiable against its own instrument.** Section 3 above:
`pending`, `ready` and non-overflow `failed` rows all render the control; and
§7.3's Status-cell placement cannot satisfy §4.2/P-9's "same conditional
expression as the control's tag". Class: **a sentence asserted true on every
reachable state that is false on a reachable state**.
**REPEAT-OF-B2** (revision 1's "the offer sentence is FALSE after a reload").
The seat changed the binding but not the property being claimed; the same
corrective rule - prove the rendering condition ENTAILS the sentence - fixes
both. Per `iteration-caps.md`'s routing table this class goes to disposal now.

**B-4. `N = gradingRows.totalCount` is not what one bulk press spends at
most, and is wrong in the direction that matters.** §5.2 (`:652-658`) against
`grading-submission-grade.ts:146,151` and `gemini.ts:32`. N exceeds a bulk
press's `min(totalCount, 40)` by `totalCount - 40` exactly in the overflow
case A38 exists for; N is also course-scoped and moves with the course
selector; P-13 passes on the defective shape by construction.
Class: **a bound derived from a quantity that does not bound the thing it
claims to bound**. **NEW.**

**B-5. §2.3 and §2.4 contradict on whether a hook leaves the panel, and the
whole budget rests on which one holds.** `:170` moves `682-692`, which
includes `useThrottledLiveSentence` at `GradingRecordingPanel.tsx:692`; `:197`
says "The hooks stay in the panel". 74 / -62 / ~928 is only the first branch's
arithmetic; the second branch is 63 / -51 / ~939, and needs a tenth prop.
Class: **two incompatible statements of the same quantity, with the decision
gate built on the favourable one**. **NEW.**

**B-6. The assertion B1 was raised about survives, uncorrected, at
`grading-submission-grade.ts:200-205`.** That comment sits INSIDE the overflow
loop, directly above the emitted string, and reads "this action's sole
production caller always resubmits the whole table, so there is no control
that grades this row on its own." §7.2 scopes the correction to "the HEADER at
`:58-63`" and names nothing else. P-3 tests the emitted string, not comments.
Class: **a false assertion at instruction authority in an owned file**.
**REPEAT-OF-B1** - I am labelling this a repeat rather than minting a class,
because the corrective rule that discharges B1 (correct this file's claim that
no per-row control exists) is the same rule that fixes this, and the
anti-gaming rule forbids relabelling to buy a round.

### MAJORS - 8

**M-1.** Disposition table marks §1.1/§1.2/§1.3/§1.4 KEPT; revision 2 contains
no such sections, and `:511`/`:527` cite §1.4 as the evidence discharging B3.
Entry gate 3 requires "kept (with id)". NEW.

**M-2.** `:351-352` prints a 13-line grep as a one-line output, as the
evidence for an absence, in the section that teaches the opposite.
REPEAT-OF-B6.

**M-3.** `:147`'s absence grep is filtered through `| grep -i "grading\|panel"`,
which discards all 56 real hits; its canary proves only that one known file
survives. Same mechanism as `| head`. REPEAT-OF-B6. (Conclusion re-measured
and upheld.)

**M-4.** `:426-427`: "returns four files" for `redactSensitiveText`; measured
12 (9 non-test). NEW.

**M-5.** Three different numbers for what wave 1 costs - `~38` (§6.3's TOTAL,
`:750`), `~45` (§2.3, `:181`), `~50` (§6.1's gate, `:706`) - and that number
decides whether the feature ships or waits under ruling 1.
**REPEAT-OF ruling 4's "+9 cap vs RED at 1001"** - the same corrective rule
(state the budget once and derive every other mention from it) fixes both.

**M-6.** P-0's instrument is the §6.5 test gate; the documented failure mode
of this exact extraction is a lint error no test path runs. NEW.

**M-7.** §3.3 treats `FROZEN_PRIMARY_SITES` as an absolute ban and lets that
dictate the control's shape; `buttonVariant.test.ts:159-162` says to bump it
deliberately in the same commit, and `:218` recommends `variantFor` in a
failure message rather than demanding it. The chosen control is nonetheless
correct (see section 5) - the reasoning is not. NEW.

**M-8.** `:450-451`'s canary for the cost-disclosure absence uses a different
directory, pattern and include from the grep it certifies. NEW.

### MINORS - 8

- **m-1.** `:19` - "Both were corrected at 5c99c43"; `leverage.md` was
  corrected at `6c1fbed`. The decision not to re-escalate is right.
- **m-2.** `:250` - `sectionFourTsxFiles()` is at `buttonVariant.test.ts:115-123`,
  not `:130-139`; `SECTION_4_DIRS` is at `:96`, not `:118-126`; `countPrimaries`
  ends at `:156`, not `:157`.
- **m-3.** `:1145` - the "cap of 5" text is at `gemini.ts:57`; `:58` holds the
  parenthetical.
- **m-4.** `:168` - the import block is `72-77` (6 lines); extracting `73-77`
  orphans the comment's first line.
- **m-5.** Four findings with no owner, instrument or step: three stale
  comments and the precedent surface's missing lock.
- **m-6.** `:461-463` ("offered only on a row that pressing it will actually
  grade") contradicts `:528-530` (disabled reason 3 renders the control while
  the lock is held elsewhere).
- **m-7.** P-7's "nothing else changed" clause is a tautology against the
  specified `{ ...row, state }`; its stated instrument ("collect every mutator
  call") is a spy on call identity, not on values.
- **m-8.** `:894-898` cites the header assertion as `:58-63`; the quoted
  sentence spans `:60-63`.

### CONFIRMED SOUND - not to be re-litigated

Fence 1 (`:186-191`, `:206-209`, and every pin listed at `:210-213`), fence 4's
three gates, fence 5's 7-key exact set, the `EXPECTED_WIRE_KEYS` 19 and its
two assertion sites, the `maxSubmissions >= 1` proof, the caller census, the
walker count of 39, the `fmt` duplication count of 4, the `ungradedDisclosure`
count of 4, the `0x811c9dc5` count of 2, the B6 withdrawal, the three
cohort-clearing branches and the wiring test's blindness to a fourth, the
`AssessmentStateBadge` "Grading" label, the B4 hazard at
`assessment-row.ts:173-189`, the choice of a `pageStyles.linkButton` control,
and the WEAK verdict on feature-already-exists.

---

## 13. VERDICT AND STOPPING POINT

**NOT BUILDABLE AS WRITTEN. 6 blockers, 8 majors, 8 minors.**

Two blockers are REPEATs (B-3 of B2, B-6 of B1) and one major is a REPEAT of
ruling 4's own minor (M-5). Under `iteration-caps.md`'s routing those three
classes go to disposal now rather than to another revision.

**Stopping point: RULINGS, then DESIGN.**

Two things are the orchestrator's and no revision of the seat's document
resolves them:

1. **Ruling 2 mandated a mechanism that cannot meet its own purpose.** It
   directs the cap to ride "the same wire the digest does" - the
   `classifyGradingResult` -> `applyGradingResultToRow` chain. That chain runs
   only on a successful action return. A spend cap that cannot count failed
   calls does not cap spend, and a failed call costs the same as a successful
   one. B-2 is unresolvable without reopening how the count is written.
2. **Ruling 1 created a gate with no threshold.** It requires the feature's
   budget to be measured against the post-extraction count and says the
   feature waits if the extraction cannot find the lines, but names no
   pass/fail number. The seat filled the gap with three different numbers
   (M-5). The orchestrator owes one.

A third is smaller but also the orchestrator's: **ruling 3's B5 overstates the
button gate.** `countPrimaries` counts `variantFor(` into a map whose own
comment says to bump it deliberately, and the sibling canary recommends rather
than demands that spelling. The seat inherited the overstatement (M-7). The
design outcome is still right, so this needs a correction to the ruling's
wording, not to the design.

Everything else - B-1, B-3, B-4, B-5 and all eight majors - is DESIGN, and the
seat can settle each by measurement it has not yet taken.
