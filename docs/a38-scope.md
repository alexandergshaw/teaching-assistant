# A38 - scope and design: grade ONE submission on the recording grader

Architecture seat, 2026-09-23. Subject: backlog row A38. This document decides
SHAPE. It writes no production code and no test code.

Every quantity below names the command that produced it. Commands were run
from the repo root; PowerShell commands are marked `PS>`, the rest are Git
Bash. `git status --short` at the start and end of this pass showed only the
other agents' files (`docs/css-orphans.md`, `package.json`,
`src/tools/backlog/*`) - nothing in my write set was touched.

**There is no prior version of this artifact**, so there is no disposition
table to carry. `ls docs/ | grep -i "a3[0-9]"` returns `a29-*`, `a31-rulings.md`
and `a31-scope.md` only - no `a38-*` existed before this file.

---

## 0. The leverage question, answered

`docs/loop/leverage.md` requires the call, and the call is the human's.
A38 builds a capability a user reaches, so the trigger FIRES and a claim is
owed.

**Class: SCALE, and the claim is about the UNIT the scale is applied at.**
The mechanism already in the tree is `gradeCapturedSubmissionsAction`
(`src/app/actions/grading-submission-grade.ts:131`), which pins ONE
`systemPrompt` built from the rubric (`:154`) and loops it over every
submission (`:157-194`) so criteria cannot drift between students. A chat
re-grades each paste independently and nothing holds the batch together.
A38 does not earn that class - **it INHERITS it**, and the honest claim is
narrower:

> Today the only unit this surface can apply that pinned rubric to is THE
> WHOLE TABLE. An instructor whose row 41 came back ungraded because the run
> reached its bound, or whose one row failed on a transport error, must
> re-send all 60 - paying 60 model calls to fix one - or leave it ungraded.
> A38 makes the unit one row while keeping the rubric the same single
> `rubricText` the bulk press reads, so a one-row grade is comparable with
> the rows beside it rather than a fresh, unrelated conversation.

**What the user does instead today, and what it costs:** re-press
"Grade submissions", which rebuilds the list from `gradingRows.rawRows`
(`GradingRecordingPanel.tsx:580-585`) - N model calls to grade 1. On a table
of 60 with a bound of 40 the overflow rows cannot be fixed by that press at
all: the same 60 are sent, the same first 40 are taken
(`grading-submission-grade.ts:151-152`), and the same 20 come back with the
same not-graded message.

**Honest limits on this claim, stated rather than hidden:**

- The class is INHERITED, not earned. The rubric pinning, the per-submission
  isolation and the bound all pre-date A38.
- **The saving is click cost and spend, and `leverage.md`'s struck-class
  table rules click cost "real and worth counting, but not a categorical
  advantage over a chat".** So this claim must be read as the "Accept the
  cost explicitly" disposal in that card's three-way call, NOT as a redesign
  claiming a new mechanism.
- **THE REMOVAL TEST IS BUILDABLE HERE, and that is what makes the claim
  worth stating at all.** The advantage is removed by deleting the row-scoped
  submission projection and letting the single-row path send
  `gradingRows.rawRows`. See §7, P-1: the assertion is over the ARRAY LENGTH
  the action receives on a single-row press, which a node-env test can
  observe. It fails on removal, not merely on breakage.

**The call belongs to the owner.** My recommendation is **Accept the cost
explicitly**: ship it, and record in the criteria that the advantage is
click cost and spend at a smaller unit, inheriting SCALE rather than earning
it. Do not let a later reader credit A38 with integration or persistence it
does not have.

---

## 1. Measured facts this design rests on

Every line below was produced by the command shown and the cited file was
opened.

| Fact | Value | Command |
|---|---|---|
| `GradingRecordingPanel.tsx` | **990 lines** | `PS> @(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count` |
| The repo-wide ceiling | `LIMIT = 1000` (`src/file-size-ceiling.structure.test.ts:41`) | `sed -n '41p' src/file-size-ceiling.structure.test.ts` |
| Panel in `ALLOWED_OVERAGE`? | **NO** | `grep -n "grading" src/file-size-ceiling.structure.test.ts` - no `ALLOWED_OVERAGE` entry matches |
| `useRepoGradesGradingActions.ts` | 825 lines | same `PS>` form |
| `GradingTableRow.tsx` | 329 lines | same |
| `GradingTable.tsx` | 289 lines | same |
| `grading-dispatch.ts` | 32 lines | same |
| `grading-rows.ts` | 394 lines | same |
| `grading-row.ts` | 456 lines | same |
| `grading-row-serialization.ts` | 361 lines | same |
| `grading-row-serialization.test.ts` | 765 lines | same |
| `grading-rows.test.ts` | 733 lines | same |
| `GradingRecordingPanel.wiring.test.ts` | 685 lines | same |

**THE PANEL HAS TEN LINES OF HEADROOM.** That single number drives the whole
shape below. It is not an estimate; it is `@(Get-Content).Count`, the
instrument `docs/loop/this-repo.md` section 3 mandates and the same one
`count-lines.ts` implements.

### 1.1 The bound, re-measured - and a conflict with two loop cards

```
grep -n "DEFAULT_MAX_SUBMISSIONS" src/lib/gemini.ts
32:const DEFAULT_MAX_SUBMISSIONS = 40;
```

`docs/loop/leverage.md:41` and `docs/loop/seats.md:126-128` both state
`DEFAULT_MAX_SUBMISSIONS = 5` at `src/lib/gemini.ts:25`. **Both are stale.**
The value is 40 and the line is 32. `src/lib/gemini.ts:58` also still reads
"at the default cap of 5 submissions per run (DEFAULT_MAX_SUBMISSIONS)" - a
stale comment inside the file that defines the constant. I adopt neither
remembered value; I use 40, measured. Reported in §12.

`getGeminiMaxSubmissions()` (`src/lib/gemini.ts:129-134`) calls
`parsePositiveInt(process.env.GRADE_MAX_SUBMISSIONS, DEFAULT_MAX_SUBMISSIONS)`
with **no `min` argument**, so `min = 1`
(`sed -n '/function parsePositiveInt/,/^}/p' src/lib/gemini.ts`), and any
parsed value below 1 falls back to 40. **Therefore `maxSubmissions >= 1` on
every reachable state.** That proof is load-bearing for §5 and §6.

### 1.2 The caller census, re-run rather than inherited

```
grep -rn "gradeCapturedSubmissionsAction" src/ --include=*.ts --include=*.tsx
```

Exactly one production call site: `GradingRecordingPanel.tsx:593`, inside
`handleGradeAll` (`:563`). Every other hit is that action's own test file, a
doc comment, or the import at `:105`. A34's census holds.

### 1.3 A canary before the absence

```
grep -rn "onGradeRow\|onGradeOne\|gradeOneRow\|handleGradeRow" src/app/components/grading-recording/
# no output, exit 1
grep -rn "onMarkLate" src/app/components/grading-recording/ | head -3
# 3 lines: GradingRecordingPanel.tsx:971, GradingTable.tsx:102, GradingTable.tsx:124
```

The instrument fires on a prop of the same shape, so the empty result is a
real absence: **no per-row grade control exists on this surface today.**

### 1.4 The dead state, found by measurement

`AssessmentRowState` is `"pending" | "grading" | "ready" | "failed"`
(`src/app/components/assessment-shared/assessment-row.ts:73`), and
`AssessmentStateBadge.tsx` ships a `grading: { label: "Grading", variant:
"ghBadgeWarning" }` entry.

```
grep -rn '"grading"' src/app/components/grading-recording/ | grep -v test
```

Four hits, and **none of them WRITES the state**: `grading-recording-log.ts:281`
(a switch case), `grading-row-serialization.ts:89,131,226` (which *downgrades*
it to `"pending"` on load), and three `view: "grading"` launch-event strings
in the panel and `RubricInputModal.tsx`. The bulk path goes
`pending -> ready|failed` directly (`classifyGradingResult`,
`grading-rows.ts:274-301`, which returns only `"failed"` or `"ready"`).

**So the "Grading" badge is shipped, styled, serialization-aware, and dead.**
A38 is the first writer. This is the single largest reuse win in this design
and it means the answer to "what does the instructor see while one row is
grading" needs no new vocabulary at all.

---

## 2. THE SHAPE, and the four fences that force it

### 2.1 Fence 1 - `handleGradeAll`'s binding text is FROZEN by a source-text test

`GradingRecordingPanel.wiring.test.ts:186-191`:

```ts
function handleGradeAllBody(strippedSource: string): string {
  const marker = "const handleGradeAll = useCallback(async () => {";
  const idx = strippedSource.indexOf(marker);
  if (idx === -1) return "";
  return extractBalanced(strippedSource, idx + marker.length - 1);
}
```

If that literal is not found, the region is `""` and the canary at `:206-209`
fails, taking every pin built on `HANDLE_GRADE_ALL_BODY` with it. The pins
that ride on it, each opened:

- `:259` - `buildRunCohort(` must appear in the handler body.
- `:283` - the first argument must be `result.results`.
- `:314` - the identity projection's assessment property must read
  `r.assessment` (so **the projection at `:592` cannot be moved into a leaf**).
- `:349/:355/:361` - all three non-success branches must clear `lastRunCohort`.
- `:399/:447` - the `meta` const's key/value binding.
- `:208` - the body must contain `checkGradingReadiness`.

**CONSEQUENCE, and it is the decisive one: `handleGradeAll` may not be
renamed, may not gain a parameter, and its identity projection may not be
extracted.** The obvious refactor - parameterise `handleGradeAll(rowIds?)` -
turns roughly fifteen assertions red for a change that is behaviourally
correct. That is exactly the class the brief names: a test that greps a
string it does not own.

Adding a LINE inside the handler is safe: every pin above is a positive
`toMatch`/`toContain` over the balanced body, and the two free-identifier
whitelists (`:505-520`, `:612-637`) run over `RENDER_BODY`, not the handler.

### 2.2 Fence 2 - the panel has ten lines

See §1. Any addition of more than nine lines fails
`src/file-size-ceiling.structure.test.ts`, which is a hard gate with no
`ALLOWED_OVERAGE` entry for this file.

### 2.3 Fence 3 - the primary-button count is an EXACT-SET assertion

`src/app/components/ui/buttonVariant.test.ts`: `countStaticContainedPrimaries`
counts `variant="contained"` tags (excluding `color="error"`/`color="warning"`),
then `if (n > 0 || rel in FROZEN_PRIMARY_SITES) actual[rel] = n;` and
`expect(actual).toEqual(FROZEN_PRIMARY_SITES)`.

`GradingTableRow.tsx` and `GradingTable.tsx` are **NOT keys in that map**
(read the map in full at `buttonVariant.test.ts:39-83`). Both files' own
comments claim otherwise - `GradingTableRow.tsx:271-274` says
"FROZEN_PRIMARY_SITES pins this file's primary-button count at 0" and
`GradingTable.tsx:198-202` says it "pins GradingTable.tsx at its current
primary-button count". **Both comments are stale**; the files pass only
because `n === 0` keeps them out of `actual`. The live rule is: a contained
primary in either file ADDS A KEY and turns the test red.

**CONSEQUENCE: the per-row Grade control must not be a contained primary.**
That is also what the house rule wants (`message-replies` M14: "no row
control is contained while idle") and what the sibling precedent does.

### 2.4 Fence 4 - two exact-set structure gates over the whole tree

- `submission-kind-callsites.structure.test.ts:96-113` asserts
  `expect(hits).toEqual([...9 paths])` for
  `/\bsuggestedSubmissionKind\b|\bsubmissionKindCue\b/` across every non-test
  `.ts`/`.tsx` under `src/`, and `:122-129` the same for
  `submissionKindLabel`/`SUBMISSION_KIND_LABELS`/`SUBMISSION_KIND_PROMPT_LABELS`
  over three paths. **Any NEW file referencing any of those five identifiers
  turns this red.** The new hook must reference only `submissionKind` (the
  confirmed kind), which is in neither matcher.
- `markLate.wiring.test.ts:92-98` asserts `GradingTableRow.tsx` contains no
  `new Date()` and no `Date.now(`. **The per-row handler may not timestamp
  anything inside the row component.** It does not need to - the run-log
  timestamp belongs in the hook, beside the existing
  `blockedGradingRun(new Date().toISOString(), ...)` calls.
  `markLate.wiring.test.ts:88-90` also slices 1400 characters forward from the
  literal `"D23c. Records THAT the work was late"` and asserts no
  `row.submissionTimeStatus ===` inside it; new markup placed after that
  comment enters that window, so it must not contain that comparison.

### 2.5 The resulting shape

Three layers, and **THE SURFACE IS THE THIRD** - it is named, it is in wave 1,
and every export below names the file that calls it.

```
LAYER 1  grading-dispatch.ts            gradingRowGradeAction(row, rubricText)
         (pure, node-testable)          -> { gradeable, label, reason }
                 |  called by
                 v
LAYER 2  useGradingRowGrade.ts          useGradingRowGrade(params)
         (new client hook)              -> { gradeRow, busyRowId, locked }
                 |  called by
                 v
LAYER 3  GradingRecordingPanel.tsx  ->  GradingTable.tsx  ->  GradingTableRow.tsx
         (hook call + 2 props)          (2 props through)     (THE BUTTON)
```

`handleGradeAll` is **not touched except for two added lines** (the lock claim
and its release), and the single-row handler is a SEPARATE binding in a
separate file. They are not two predicates for one question: both call the
same `classifyGradingResult` (`grading-rows.ts:274`), the same
`gradingRows.applyGradingResult`, the same `gradeCapturedSubmissionsAction`,
and the same `checkGradingReadiness` - see §3.

---

## 3. THE REUSE LIST

Every `file:line` below was opened. Nothing here is re-implemented.

| Symbol | `file:line` | What it gives A38 |
|---|---|---|
| `gradeCapturedSubmissionsAction` | `src/app/actions/grading-submission-grade.ts:131` | The grading call, unchanged. A one-element `submissions` array is a legal argument today; nothing in the action assumes a plural batch. |
| `classifyGradingResult` | `src/app/components/grading-recording/grading-rows.ts:274` | **The A30 precedent, literally.** The one place a `failed: boolean` becomes `state: "failed"` + a stripped `error`. The single-row path calls it; there is no second classifier. |
| `applyGradingResultToRow` | `grading-rows.ts:175` | The `userEdited` refusal (`:158-162`) applies to a single-row grade for free - a mis-press can never overwrite typed feedback. |
| `useGradingRows().applyGradingResult` | `useGradingRows.ts:239,397-403` | Writes one row by id, already a no-op when the id is gone. |
| `checkGradingReadiness` | `grading-dispatch.ts:28` | **Reused with `rowCount = 1`, not duplicated.** Its own doc comment (`:22-27`) already scopes `rowCount` as "the UNFILTERED row count"; one row is a legal count, and the refusal messages come out byte-identical to the bulk path's. |
| `AssessmentStateBadge` | `src/app/components/assessment-shared/AssessmentStateBadge.tsx` | The `"Grading"` warning badge, shipped and dead (§1.4). A38 is its first writer. |
| `blockedGradingRun` / `erroredGradingRun` / `completedGradingRun` | `grading-recording-log.ts:157,161,165` | All three take `rowCount`; a single-row run logs `rowCount: 1`. **No new log factory is needed.** |
| `GRADING_FAILURE_PREFIX` | re-exported `grading-rows.ts:241-242`, defined `src/lib/grade/types.ts` | Already the one copy of the literal. |
| `UNGRADED_NOT_ATTEMPTED_MESSAGES` | `src/lib/grade/types.ts:193-195` | Read, **never edited** - see §6. |
| The bare-button idiom | `src/app/components/repo-grades/RepoGradeCellControl.tsx:567-576` | `<button type="button" className={pageStyles.linkButton} disabled={edit.grading}>{edit.grading ? "Grading…" : "Grade"}</button>` - no confirm, no arming, not a contained primary. |
| The one-row-no-confirm rule | `useRepoGradesGradingActions.ts:626-630` | This repo's own shipped sentence: "No confirm dialog, by design: this app treats click cost as a first-class factor and a single, already-scoped row is a deliberate enough act on its own." |
| The ref-lock idiom | `useRepoGradesBulkGrade.ts:216` (`const runLockRef = useRef(false)`), claimed `:230-231`, header rationale `:203-215` | The A26 shape: a live `.current` read, not captured render state. |
| `styles.fieldHint` / `rowStyles.rowErrorText` | `GradingTableRow.tsx:157,246` | Existing row-level text treatments; no new CSS class. |

### 3.1 DO-NOT-REUSE, with justification per entry

| Not reused | Why |
|---|---|
| `handleGradeCell`'s eligibility guard - `if (cell.status !== "ungraded") return;` (`useRepoGradesGradingActions.ts:263`) | **Copying this verbatim breaks the feature.** A bound-overflow row on this surface comes back `failed: true` -> `classifyGradingResult` -> `state: "failed"`. An "only if never graded" guard excludes exactly the rows A38 exists for. See §4. |
| `useRepoGradesBulkGrade`'s worker pool / `BULK_GRADE_CONCURRENCY` | A stream-shaped primitive for a one-item run. One press is one call. |
| A second run-log factory | The three existing ones already carry `rowCount`. |
| A second `role="status"` live region | `seats.md`'s User-experience checker question and `useRepoGradesGradingActionsParams.setPostSummary`'s own doc ("Never add a second"). The panel already has two regions (`GradingRecordingPanel.tsx:746`, `:911`); A38 adds none. |
| `ConfirmArmButtons` (`src/app/components/ui/ConfirmArmButtons.tsx`) | See §4.4 - nothing is destroyed by this press that is not reproducible by pressing it again, and typed feedback is structurally protected. |
| Extracting the panel's run-log collection block to buy line headroom | `GradingRecordingPanel.wiring.test.ts:57,61,71` read those exact lines out of the panel's own source. Moving them turns three assertions red for no behaviour change. |
| Extracting the local `fmt()` (`GradingRecordingPanel.tsx:188-192`) | It is duplicated four times (`grep -rn "Math.floor(seconds / 60)" src/ --include=*.ts --include=*.tsx \| grep -v test` returns `GradingRecordingPanel.tsx:189`, `LegibilityProbeModal.tsx:123`, `ModuleDeckCapturePanel.tsx:118`, `WalkthroughAnnouncementPanel.tsx:121`). A genuine finding, but a four-panel refactor is not this row's charter. Filed as **RES-A38-4**. |

---

## 4. THE FIVE, SETTLED

### 4.1 THE BOUND

**Q: does a single-row grade count against the same submission limit?**

**A: yes, mechanically - and it is trivially under it, which is INTENDED, not
an accident.** Proof, not assertion: `gradeCapturedSubmissionsAction` reads
`getGeminiMaxSubmissions()` at `:146` and applies `submissions.slice(0,
maxSubmissions)` at `:151`. §1.1 proves `maxSubmissions >= 1` on every
reachable state, because `parsePositiveInt`'s `min` defaults to 1 and any
lower parsed value falls back to 40. **A one-element array is therefore never
in the overflow slice.**

That is the bound working as designed, at a smaller unit. The bound's own
stated purpose (`grading-submission-grade.ts:50-57`) is Vercel Hobby's 60s
function cap against "an unbounded sequential-call loop". One call is one
submission's latency - exactly what the cap tolerates.

**Q: what happens when the table is already past the bound?**

**A: that is the remedy, and it is the whole feature.** Rows past index
`maxSubmissions - 1` come back through the overflow loop (`:196-208`) with
`composeFailedGradingRow(...)`, so `classifyGradingResult` sets `state:
"failed"` and puts the message in `error`. Pressing that row's own Grade
sends one submission, which is under the bound, so it grades. **This is the
first time in this surface's history that the not-graded message names
something that works.**

**THE ACCIDENT WORTH GUARDING, named rather than glossed.** The bound is
per-INVOCATION, not per-table or per-session. Forty per-row presses grade
forty rows with no aggregate cap at all, and the 60s cap never binds because
each press is its own invocation. **A per-row button removes, by construction,
the only thing that today caps what one screen can spend.**

I am NOT proposing a client-side counter as the guard. A counter in component
state is defeated by a reload, and a guard the user can clear by pressing F5
is a false green - the class this repo has shipped before. The honest remedy
is **disclosure at the unit of spend** (§4.3) plus **serialisation** (§4.5),
which makes the spend visible and paced rather than invisible and parallel.
The residual is filed (**RES-A38-1**) with an owner, an instrument and a step.

### 4.2 THE RUBRIC

**The Repo Grades hazard does not exist here, and saying so is half the
answer.** Repo Grades has a rubric RESOLVER (`resolveRubricForColumn`, an
async fetch) which is why A26's race was possible. This surface has no
resolver: the rubric is one piece of component state, `rubricText`
(`GradingRecordingPanel.tsx:383`), read synchronously at press time
(`:596`, `rubricText.trim()`). The single-row path reads the SAME state, the
SAME way, at ITS press time. **There is no second source and nothing to
resolve, so two rows can never disagree because of a fetch.**

**The hazard that DOES exist, and which A38 widens:** the instructor can edit
the rubric between presses. This is already live today - grade all, edit the
rubric, grade all again, and any `userEdited` row keeps its old-rubric
feedback because `applyGradingResultToRow` refuses to overwrite it
(`grading-rows.ts:158-162`). A38 makes the divergence per-row and much easier
to reach, and **nothing on screen would say so**, which is precisely the
condition the row forbids.

**RULING: disclose, never prevent - and bind the disclosure to the ROW,
because the row is the only object that can produce the quantity.** A
panel-level "the rubric changed" flag is a proxy: it cannot survive a reload,
cannot name WHICH rows, and cannot see a row graded in an earlier session.
`docs/a31-rulings.md` RULING 4 is explicit that an instrument must be able to
produce the quantity it fails on.

Design:

- `GradingRow` gains `gradedRubricDigest?: string` - optional for the same
  stated reason `assessment` and `submissionTimeStatus` are optional
  (`grading-row.ts:180-187`): the type is already shipped and every existing
  literal must keep compiling.
- `GradingResultInput` (`grading-rows.ts:141`) gains the same field, and
  `classifyGradingResult` takes it as a SECOND PARAMETER. One writer, both
  paths, no second predicate - the A30 shape.
- `applyGradingResultToRow` passes it through beside `rubricAreas`
  (`grading-rows.ts:175-178`). It is a machine fact about the attempt, so it
  is **not** gated by `userEdited`, exactly like `state`/`error`/`rubricAreas`.
- It **is** persisted: `toWire` (`grading-row-serialization.ts:129`)
  enumerates keys explicitly and gains a twentieth. A non-persisted digest
  would make the row show no warning after a reload while the divergence is
  still real - a false green.
- `GradingTableRow.tsx` renders one `styles.fieldHint` line when
  `row.gradedRubricDigest` is present and differs from the current rubric's
  digest. Copy (NOT frozen as a literal - `a31-rulings.md` RULING 1's closing
  instruction): *"Graded against an earlier rubric."*

**Digest function.** `fnv1aHash` already exists
(`src/lib/lms-generation/generation-diag.ts:45`), is a dependency-free pure
leaf, and its own doc comment states its purpose is exactly this
("let a human confirm ... these two prompts were byte-identical"). **But it
has never been imported from a client component** (`grep -rn
"generation-diag" src/ ...` shows five importers, all under `src/app/actions`
or `src/app/api`), and this repo has a recorded client-bundle-guard class.
**RULING: do not import it across that boundary on a guess.** Wave 2 declares
a local `gradingRubricDigest(text: string): string` in `grading-rows.ts`
using the same FNV-1a body, and **RES-A38-3** files the consolidation with an
owner and an instrument. Two copies of an eight-line pure hash, one of them
newly written with the duplication recorded, is cheaper and safer than a
client-bundle regression `next build` is the only gate for.

**THE OWNER FORK, stated rather than defaulted.** Wave 2 is a persisted-shape
change (one optional field, one wire key, one classifier argument, four test
files). If the owner wants A38 smaller, the legitimate REDUCE is: ship wave 1
only, and accept in the criteria that a per-row grade can silently produce an
incomparable table. **Silence is the illegal answer; an explicit reduction is
not.** I recommend shipping wave 2 - the requirement is one of the five the
row says must be settled, and the surface it protects is a grade a student
may appeal. I have scoped it as its own wave so the owner can take the reduce
without touching wave 1.

### 4.3 COST DISCLOSURE

**The unit that costs money is one model call per press**
(`grading-submission-grade.ts:28-48`: "one LLM call PER SUBMISSION, in a
sequential loop").

**Measured: this app has no cost-disclosure copy anywhere.**

```
grep -rn "model call\|API call\|one call per\|costs one\|will spend" src/app/components --include=*.tsx
# one hit, and it is a CODE COMMENT: courses/AskAiModal.tsx:23
grep -rc "model call" src/lib/grade/*.ts | grep -v ":0"
# 7 files - the instrument fires, so the absence above is real
```

The nearest precedent is a count-bearing LABEL:
`RepoGradesGrid.tsx:355` renders `Grade all ${gradeTargetCount} repos in
${column.folder}`.

**RULING: A38's disclosure is STRUCTURAL, not a new sentence, and that is the
stronger answer.** The control is offered only on a row that pressing it will
actually grade (§4.4's eligible set), and it is rendered INSIDE that row's own
Actions cell, one cell from the student's name. So "what will this press
spend" is answered by where the button is: this one submission. The
accessible name makes the unit explicit for a screen-reader user:
`aria-label={`Grade ${row.studentName}'s submission on its own`}`.

**What A38 does NOT fix, and why I am not pretending otherwise.** The BULK
press still discloses no count. It cannot honestly gain one yet: the number
that would be true is the number the action will GRADE, which is
`min(rowCount, maxSubmissions)`, and `maxSubmissions` is read from
`process.env` **on the server** (`getGeminiMaxSubmissions`,
`src/lib/gemini.ts:129`) with no client reader anywhere. A label saying
"Grade 60 submissions" under a bound of 40 would be a new false sentence -
precisely the A31 RULING 1 failure. Filed as **RES-A38-2** with the
server-boundary question named, not as a copy edit.

### 4.4 WHERE THE BUTTON LIVES, WHAT IT LOOKS LIKE DISABLED, AND WHETHER THE
ROW ALREADY KNOWS

**Does the row already carry enough state? YES, for the whole decision.**
`GradingRow.state` (`grading-row.ts:115`, via `AssessmentRowCore`) is the
four-member union, and `rubricText` is panel state the panel already reads
for `canGrade` (`GradingRecordingPanel.tsx:680`). **No new row field is needed
for eligibility** - only for the rubric provenance in §4.2, which is a
different question.

**Placement.** Inside `GradingTableRow.tsx`'s existing right-docked action
cluster (`:172`, `<div className={`${styles.ghActions} ${rowStyles.rowActions}`}>`),
as the FIRST control in it, before Remove and Mark late. First because it is
the constructive action and Remove is the destructive one; the cluster's own
convention already pushes destructive actions later. No new column, no new
CSS class, no change to `GRADING_TABLE_COLUMN_COUNT`.

**The eligible set.** `gradingRowGradeAction(row, rubricText)` in
`grading-dispatch.ts` returns one of:

| `row.state` | Offered? | Visible label |
|---|---|---|
| `pending` | yes | `Grade` |
| `failed` | yes | `Re-grade` |
| `ready` | yes | `Re-grade` |
| `grading` | no - it is the one in flight | (the button is the busy one, see below) |

`ready` and `failed` say `Re-grade` so a press is not misread as a first
grade. **`failed` MUST be in the set** - it is the state a bound-overflow row
lands in, and excluding it (the Repo Grades guard, §3.1) would make the
feature miss the case it exists for. `ready` is in the set because the row's
own note names "a rubric edit can be tested on one submission", which is only
reachable on an already-graded row.

**Disabled states, and what each one says.** Three distinct reasons, never
collapsed into one silent grey button:

1. **No rubric** (`rubricText.trim() === ""`). The button is not rendered at
   all. The panel already states the reason once, globally
   (`GradingRecordingPanel.tsx:874-876`, "Add a rubric to grade."), and N
   disabled buttons each repeating it is noise. This matches the surface's own
   "no dead controls" rule (`GradingTable.tsx:148-152`,
   `GradingTableRow.tsx:216-231`).
2. **This row is grading.** `disabled`, label `Grading…`, and
   `row.state === "grading"` lights the shipped `AssessmentStateBadge` warning
   badge (§1.4). Two independent signals in the same row, no new copy.
3. **Another row or the bulk run is grading** (the lock is held elsewhere).
   `disabled`, label unchanged. The instructor can see which row IS grading
   from its badge and its own `Grading…`, so a disabled sibling needs no
   explanation of its own.

**No confirm step, and the reason is measured rather than preferred.**

- The sibling precedent has none: `RepoGradeCellControl.tsx:567-576` is a bare
  button.
- This repo has already written the rule down for a single scoped row:
  `useRepoGradesGradingActions.ts:626-630`.
- The one thing a mis-press could destroy is protected by construction:
  `applyGradingResultToRow` refuses to overwrite a `userEdited` row's four
  scored fields (`grading-rows.ts:158-162`). Typed feedback survives.
- What remains at risk is a machine result on an UNEDITED row, and this
  surface has already ruled on that exact trade in its own words
  (`GradingTableRow.tsx:120-122`): "re-reading a machine-graded row off a
  fresh capture costs nothing to redo, feedback the instructor typed by hand
  does."

So the answer to the owner's "weigh whether it needs one at all" is: **no**,
and the `Re-grade` label carries the only warning that is warranted.

**CLICK COUNT.** First use: 1 (the row's own button). Repeat use: 1. Today's
only route to grading one row is 1 press that grades all N, which does not
achieve it at all for an overflow row - so the honest comparison is 1 click
versus *no available sequence*.

**Every claim in this subsection about the button appearing, its label, its
disabled state, its placement in DOM order and its accessible name is a
READING CLAIM.** `vitest.config.ts` is `environment: "node"` and collects only
`src/**/*.test.ts`; **no component is rendered by any test in this repo**.
Routed to owner verification as **RES-A38-5**. Do not let any wiring test's
green be read as evidence that the button is on screen.

### 4.5 CONCURRENCY

**Does the A26 lock cover it? NO - and the reason matters.** A26's
`runLockRef` lives inside `useRepoGradesBulkGrade.ts:216`, a hook this surface
does not use. Read in full, `handleGradeCell`
(`useRepoGradesGradingActions.ts:257-459`) claims NO lock; its only protection
is `disabled={edit.grading}` on the DOM node. **So even on the sibling
surface, per-cell presses can interleave with each other and with a bulk
run.** A38 must not inherit that by copying the precedent's silence.

On this surface the bulk path's own guard is weaker still:
`gradingBusy` (`GradingRecordingPanel.tsx:561`) is captured render state, the
exact shape A26's header (`useRepoGradesBulkGrade.ts:203-215`) proves is not
a real refusal. It happens to work today because MUI's `loading` prop disables
the button and there is exactly one button. **A per-row button multiplies the
click surface and that accident stops holding.**

**RULING: ONE ref lock, claimed by BOTH paths, released in `finally`.**

- `useGradingRowGrade` owns `const gradingLockRef = useRef(false)` and returns
  it. `handleGradeAll` claims and releases the SAME ref - the two added lines
  §2.1 proves are safe.
- **Per-row presses may NOT interleave with each other.** The measured reason,
  not a preference: the action paces its own calls with
  `getGeminiInterRequestDelayMs()` (default `1200` ms,
  `src/lib/gemini.ts:67`) between submissions
  (`grading-submission-grade.ts:191-193`). Two concurrent invocations defeat
  the delay the pacing exists for, against the provider rate limit it was
  written for.
- **Per-row presses may NOT interleave with a bulk run**, in either order.
  A bulk run rebuilds the whole table's results and would overwrite a
  concurrently-graded row's fresh result with a stale one.
- A refused press is a **silent no-op**, not an error. The button that was
  pressed is already `disabled` when the lock is held, so the refusal is only
  reachable from a programmatic or double-fire path, and an error message for
  a state the user cannot see is worse than nothing. The lock is the
  correctness guarantee; the `disabled` attribute is the visible one.

**What the instructor sees while one row is grading:** that row's badge reads
`Grading` (the shipped, previously-dead `ghBadgeWarning` badge), that row's
button reads `Grading…` and is disabled, every other row's Grade button is
disabled, and the panel's "Grade submissions" button is disabled. No new live
region, no new copy, no spinner component.

---

## 5. THE COPY THAT WAS DELETED

**Exactly ONE sentence changes, and it is A34's, not A31's.**

### 5.1 A31's sentence does NOT change, and the write set enforces that

`UNGRADED_NOT_ATTEMPTED_MESSAGES` (`src/lib/grade/types.ts:193-195`) is read
by the five ENGINE entry points (`src/lib/grade/engine.ts`) *and*, since A34,
by `grading-submission-grade.ts:205`. A38 makes an action available on ONE of
those consumers. `docs/a31-rulings.md` RULING 1: **a sentence may assert only
what holds on every caller and every reachable state.** Adding an offer to the
shared literal would assert on five callers that still have no remedy.

**`src/lib/grade/types.ts` is NOT in A38's write set.** Neither are
`ungradedDisclosure.ts`, `GradingResults.tsx` or `DraftedGradesTab.tsx` - the
A31 disclosure machinery serves the zip/Canvas/repo surfaces, and the recording
panel never reaches it (`grep -rn "ungradedDisclosure" src/ --include=*.ts
--include=*.tsx` returns four non-test hits, none of them in
`grading-recording/`).

### 5.2 A34's sentence changes, and here is why it is true on every path

The composed string at `grading-submission-grade.ts:196-207`:

```ts
`${UNGRADED_NOT_ATTEMPTED_MESSAGES["submission-count-bound"]} This run's limit was ${maxSubmissions} submissions.`
```

It gains a third sentence offering the row's own control. The offer holds
because all four of these hold, each measured:

1. **The branch has exactly one production caller** - §1.2's census, re-run.
   So "the caller has a per-row control" is a statement about every caller.
2. **The row that receives this message is always in a state the control is
   offered on.** `composeFailedGradingRow` sets `failed: true` ->
   `classifyGradingResult` (`grading-rows.ts:275-291`) -> `state: "failed"`,
   which is in §4.4's eligible set.
3. **The offered action always succeeds at getting past the bound.** §1.1
   proves `maxSubmissions >= 1` on every reachable state, so a one-element
   array is never in the overflow slice. There is no environment value that
   makes this offer false.
4. **The message and the control are co-located.** The message renders as
   `row.error` in the Status cell (`GradingTableRow.tsx:157`); the button
   renders in the Actions cell of the same `<tr>`. A row filtered out of the
   table hides both together, so the sentence is never readable while the
   control is not.

**Do NOT freeze the wording as a test literal.** `a31-rulings.md` RULING 1
closes with exactly that instruction, and A31's own first replacement was
false. The guard asserts a PROPERTY of the emitted string (§7, P-3), never its
spelling.

The file's header comment at `:58-63` also states the false claim in English
("It does NOT tell the instructor to retry the row on its own: ... there is no
control that grades a subset"). **That comment goes stale at this diff** and is
corrected in the same wave. This is the fifth stale comment this pass found
(see §12); leaving it would hand the next reader a wrong fact at instruction
authority.

---

## 6. WRITE SET AND WAVE PLAN

The two waves INTERSECT on three files, so **they run SEQUENTIALLY, one
implementer, wave 1 landing before wave 2 starts.** This is not a parallel
fan-out and must not be dispatched as one. Intersection, computed rather than
eyeballed:

```
comm -12 <(printf '%s\n' <wave1 paths> | sort) <(printf '%s\n' <wave2 paths> | sort)
-> GradingRecordingPanel.tsx
   GradingTableRow.tsx
   useGradingRowGrade.ts
```

### Wave 1 - the single-row grade path, end to end

Caller-complete by construction: every new export is called inside this wave.

| Path | Change | Est. lines after |
|---|---|---|
| `src/app/components/grading-recording/grading-dispatch.ts` | NEW export `gradingRowGradeAction(row, rubricText): { gradeable: boolean; label: "Grade" \| "Re-grade"; reason: string \| null }`. `checkGradingReadiness` unchanged. | 32 -> ~62 |
| `src/app/components/grading-recording/useGradingRowGrade.ts` | **NEW.** Owns `gradingLockRef`, `busyRowId`, and `gradeRow(id)`. Calls `gradingRowGradeAction`, `checkGradingReadiness(rubricText, 1)`, `gradeCapturedSubmissionsAction`, `classifyGradingResult`, `applyGradingResult`, and the three run-log factories. | NEW, ~170 |
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | Calls the hook (1 import + 1 multi-arg call line), threads `gradingLockRef` into `handleGradeAll` (2 lines), passes 2 props to `<GradingTable>`. **HARD CAP: +9 lines.** Reasoning lives in the hook's own header, per the precedent this file already set for `GradingCaptureSettings` (`:114-122`). | 990 -> **<= 999** |
| `src/app/components/grading-recording/GradingTable.tsx` | 2 props declared and forwarded to each `<GradingTableRow>`. | 289 -> ~297 |
| `src/app/components/grading-recording/GradingTableRow.tsx` | The button, first in the existing `.rowActions` cluster. No `new Date()`, no `Date.now(`, no `variant="contained"`. | 329 -> ~350 |
| `src/app/components/grading-recording/grading-dispatch.test.ts` | Tests for the new predicate. | 28 -> ~120 |
| `src/app/components/grading-recording/useGradingRowGrade.wiring.test.ts` | **NEW.** The lock, the array length, the classifier reuse, the prop chain. | NEW, ~200 |

**Checked-safe in wave 1** (read, expected to need no edit; if one goes red the
implementer stops and reports rather than loosening it):
`GradingRecordingPanel.wiring.test.ts`, `markLate.wiring.test.ts`,
`submission-kind-callsites.structure.test.ts`, `buttonVariant.test.ts`,
`confirmArmButtons.test.ts`, `src/file-size-ceiling.structure.test.ts`.

### Wave 2 - rubric provenance

| Path | Change |
|---|---|
| `grading-row.ts` | `gradedRubricDigest?: string` on `GradingRow`, with the doc comment stating why it is optional. |
| `grading-rows.ts` | `gradingRubricDigest(text)` (local FNV-1a, see §4.2); `GradingResultInput` gains the field; `classifyGradingResult` gains a second parameter; `applyGradingResultToRow` passes it through. |
| `grading-row-serialization.ts` | `toWire`/`fromWire` gain the twentieth key. |
| `GradingRecordingPanel.tsx` | The bulk `classifyGradingResult` call at `:619` passes the digest. **1 line changed, 0 added.** |
| `useGradingRowGrade.ts` | The single-row call passes the digest. |
| `GradingTableRow.tsx` | The "Graded against an earlier rubric." hint. |
| `grading-rows.test.ts` | The classifier's new argument. |
| `grading-row-serialization.test.ts` | `EXPECTED_WIRE_KEYS` **19 -> 20**, an ordered exact-array pin at `:707-731` asserted at `:735` and `:740`. |
| `grading-row.test.ts` | Row-literal fixtures. |

**Wave 2 changes a PERSISTED shape**, so `seats.md`'s Data/storage trigger
fires: an 8-hex-character digest per row against
`useAssessmentRowStore`'s existing reduced/full storage-full fallback
(`useGradingRows.ts:196-198`). That seat must state the byte figure rather
than assert it is small.

### 6.1 The `owns` list, derived mechanically

Command, and its full output pasted:

```
grep -rln "GradingRecordingPanel.tsx\|GradingTable.tsx\|GradingTableRow.tsx\|grading-submission-grade.ts\|grading-dispatch\|grading-rows" src --include=*.test.ts | sort
```

```
src/app/actions/grading-submission-grade.test.ts
src/app/components/assessment-shared/assessment-row.test.ts
src/app/components/course-intel/courseIntelOfflineTables.test.ts
src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/grading-recording/classTrendsRunCohort.test.ts
src/app/components/grading-recording/copy-feedback.test.ts
src/app/components/grading-recording/grading-capture-tombstones.test.ts
src/app/components/grading-recording/grading-dispatch.test.ts
src/app/components/grading-recording/grading-feedback-prompt.test.ts
src/app/components/grading-recording/grading-recording-log.test.ts
src/app/components/grading-recording/grading-row-serialization.test.ts
src/app/components/grading-recording/grading-row.test.ts
src/app/components/grading-recording/grading-rows.test.ts
src/app/components/grading-recording/markLate.wiring.test.ts
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/grading-recording/useGradingRows.wiring.test.ts
src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts
src/app/components/module-deck-capture/module-deck-dispatch.test.ts
src/app/components/recording/AddKnowledgePages.test.ts
src/app/components/recording/discussion-capture.test.ts
src/app/components/recording/discussion-knowledge-context.test.ts
src/app/components/recording/runLogRow.test.ts
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/ui/buttonVariant.test.ts
src/app/components/ui/confirmArmButtons.test.ts
src/lib/recording-launch.test.ts
```

**Several of these READ an edited file AS SOURCE TEXT without owning the
symbol they grep**, which is the recorded way a correct change goes red. The
verify gate runs all 28:

```
npm run test:paths -- src/app/actions/grading-submission-grade.test.ts src/app/components/assessment-shared/assessment-row.test.ts src/app/components/course-intel/courseIntelOfflineTables.test.ts src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts src/app/components/grading-recording/classTrendsRunCohort.test.ts src/app/components/grading-recording/copy-feedback.test.ts src/app/components/grading-recording/grading-capture-tombstones.test.ts src/app/components/grading-recording/grading-dispatch.test.ts src/app/components/grading-recording/grading-feedback-prompt.test.ts src/app/components/grading-recording/grading-recording-log.test.ts src/app/components/grading-recording/grading-row-serialization.test.ts src/app/components/grading-recording/grading-row.test.ts src/app/components/grading-recording/grading-rows.test.ts src/app/components/grading-recording/markLate.wiring.test.ts src/app/components/grading-recording/submission-kind-callsites.structure.test.ts src/app/components/grading-recording/useGradingRows.wiring.test.ts src/app/components/grading-recording/useGradingRowGrade.wiring.test.ts src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts src/app/components/module-deck-capture/module-deck-dispatch.test.ts src/app/components/recording/AddKnowledgePages.test.ts src/app/components/recording/discussion-capture.test.ts src/app/components/recording/discussion-knowledge-context.test.ts src/app/components/recording/runLogRow.test.ts src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts src/app/components/ui/buttonVariant.test.ts src/app/components/ui/confirmArmButtons.test.ts src/lib/recording-launch.test.ts src/file-size-ceiling.structure.test.ts
```

`npm run test:paths`, never a raw multi-path `vitest`/`npm test` - that form
silently drops any argument it does not match and exits 0
(`docs/loop/this-repo.md` section 1).

Typecheck, when needed, is `npx tsc --noEmit --incremental false` - never the
bare form (it races on `tsconfig.tsbuildinfo`) and never with file arguments.

---

## 7. PASS CONDITIONS

Each names the OBJECT under comparison, the INSTRUMENT producing each
quantity, and the DIRECTION of failure.

**P-1 (the removal test for §0's leverage claim).**
OBJECT: the `submissions` array `gradeCapturedSubmissionsAction` receives on a
single-row press. INSTRUMENT: a `vi.fn()` mock of the action in
`useGradingRowGrade.wiring.test.ts`, reading `mock.calls[0][0].length` and
`mock.calls[0][0][0].id`. DIRECTION: RED when the length is not 1, or when the
id is not the pressed row's. This fails on REMOVAL (delete the row-scoped
projection and send `rawRows`), not merely on breakage.

**P-2 (one classifier, not two).**
OBJECT: the `GradingResultInput` the single-row path writes. INSTRUMENT: drive
the hook with a `failed: true` result and compare the object handed to
`applyGradingResult` against `classifyGradingResult(sameResult)` called
directly. DIRECTION: RED when they differ - which is what a second, private
predicate would produce. Do NOT assert this by grepping
`useGradingRowGrade.ts` for the identifier; a source-text pin passes on a file
that imports the classifier and then ignores it.

**P-3 (the A34 sentence, over the EMITTED value).**
OBJECT: the string `composeFailedGradingRow` receives in
`gradeCapturedSubmissionsAction`'s overflow loop, captured by driving the real
action with `getGeminiMaxSubmissions` mocked low
(`grading-submission-grade.test.ts:287` already does exactly this at 3).
DIRECTION: RED when the emitted string contains `Re-run` or `queue`, or when
it does NOT name the row's own control. **Never a grep over the file's source
text** - `a31-rulings.md` RULING 4 records that a retired literal kept as a
correction allowlist makes a file grep print lines on correct code forever.

**P-4 (the lock is a live ref read, not captured state).**
OBJECT: the second `gradeRow` call's return while the first is in flight.
INSTRUMENT: a deferred-promise mock of the action; call `gradeRow("a")`, then
`gradeRow("b")` before resolving. DIRECTION: RED when the action was called
twice. **SABOTAGE PROOF REQUIRED before this is trusted:** replace the ref
with a `useState` flag and watch this go green - if it does, the test is
reading the mock, not the lock, and must be rebuilt.

**P-5 (the bulk path shares the lock).**
OBJECT: the action's call count when `handleGradeAll` runs while `gradeRow` is
in flight. DIRECTION: RED when both run.

**P-6 (`failed` rows are eligible).**
OBJECT: `gradingRowGradeAction({ ...row, state: "failed" }, "a rubric").gradeable`.
DIRECTION: RED when false. This is the assertion that catches a copy of Repo
Grades' `status !== "ungraded"` guard.

**P-7 (the row goes to `"grading"` and comes back).**
OBJECT: the sequence of `state` values written for the pressed row.
INSTRUMENT: collect every `applyGradingResult` call. DIRECTION: RED when
`"grading"` never appears, or when it is still the final value after the
action resolves or rejects.

**P-8 (the panel stays under the ceiling).**
OBJECT: `GradingRecordingPanel.tsx`'s line count. INSTRUMENT:
`src/file-size-ceiling.structure.test.ts` (`countLines`), cross-checked with
`PS> @(Get-Content ...).Count`. DIRECTION: RED at 1001. **This gate must be
run at the END of wave 1, not inferred from the estimate in §6.**

**P-9 (wave 2 - the digest reaches the row and survives a round trip).**
OBJECT: `fromWire(toWire(row)).gradedRubricDigest`. DIRECTION: RED when it is
lost, and `EXPECTED_WIRE_KEYS` must go 19 -> 20 in the SAME commit.

**NOT COVERABLE HERE, and stated rather than papered over:** that the button
renders, that its label reads `Grade`/`Re-grade`/`Grading…`, that it is
disabled when the lock is held, that the `Grading` badge is visible, that the
hint line wraps legibly, and that focus behaves. `vitest.config.ts` is
node-env and **no component is rendered by any test in this repo**. No
requirement in this document may name a render as its enforcer. -> RES-A38-5.

---

## 8. WHAT IS NOT TRIVIALLY REVERTIBLE

- **Wave 2's wire key.** Once rows are persisted with
  `gradedRubricDigest`, reverting the field leaves the key in stored JSON.
  `fromWire` must tolerate an unknown key (it already does - it reads
  enumerated keys, it does not reject extras), so the revert is safe, but the
  stored data is not cleaned. Say so in the criteria.
- **`classifyGradingResult`'s second parameter** is a shared-function signature
  change with two production callers and one test file. Revertible, but not
  in one file.
- Everything in wave 1 is trivially revertible: one new file, one new export,
  and additive props.

---

## 9. RESIDUAL REGISTER

Each entry names an OWNER, an INSTRUMENT and the STEP that will measure it.
**None of these exists until it is in `docs/BACKLOG.md`.** Other agents are
writing `src/tools/backlog/` and I was told to touch only this document, so
the orchestrator must carry these across at A38's disposal. An entry that
stays only here is a deletion with extra steps.

**RES-A38-1 - the bound is per-invocation, so a per-row button removes the
only cap on what one screen can spend.**
OWNER: the repo owner, because the remedy is a product decision (a
session-level cap, a spend readout, or accepting it) and a client-side
counter is a false guard. INSTRUMENT: count `callLlm` invocations across N
per-row presses in `grading-submission-grade.test.ts` against
`getGeminiMaxSubmissions` mocked low, and confirm no aggregate refusal fires.
DIRECTION: the count grows without bound. STEP: the A38 verify pass, reported
to the owner as a named finding, not silently closed.

**RES-A38-2 - the bulk press still discloses no count, and cannot honestly
gain one.**
OWNER: the next chunk whose write set includes `src/lib/gemini.ts` or
`GradingRecordingPanel.tsx`. INSTRUMENT: `grep -rn "getGeminiMaxSubmissions"
src --include=*.ts --include=*.tsx` - today every caller is server-side; the
residual is discharged when a client-reachable reader of the effective bound
exists. DIRECTION: a label asserting a graded count while `maxSubmissions <
rowCount` is a new false sentence under `a31-rulings.md` RULING 1. STEP: that
chunk, and no later than the next change to the bulk button's label.

**RES-A38-3 - `fnv1aHash` is duplicated by wave 2's local digest.**
OWNER: the next chunk whose write set includes
`src/lib/lms-generation/generation-diag.ts` or `grading-rows.ts`. INSTRUMENT:
`grep -rn "0x811c9dc5" src --include=*.ts` - one hit today
(`generation-diag.ts:46`), two after wave 2. DIRECTION: a third copy, or the
two drifting. STEP: that chunk. **The consolidation must not be done by
importing `generation-diag.ts` into a client component on a guess** - `next
build` is the only gate for a client-bundle regression of that kind, and this
checkout's build fails in the prerender tail for unrelated env reasons.

**RES-A38-4 - `fmt()` is duplicated in four panels.**
OWNER: the next chunk whose write set includes two or more of
`GradingRecordingPanel.tsx`, `LegibilityProbeModal.tsx`,
`ModuleDeckCapturePanel.tsx`, `WalkthroughAnnouncementPanel.tsx`.
INSTRUMENT: `grep -rn "Math.floor(seconds / 60)" src/ --include=*.ts
--include=*.tsx | grep -v test` - four hits today. DIRECTION: a fifth copy.
STEP: that chunk. Explicitly NOT A38's charter.

**RES-A38-5 - every UI claim in §4.4 is a reading claim.**
OWNER: the repo owner, in a real browser. INSTRUMENT: a capture session with
`GRADE_MAX_SUBMISSIONS` set below the row count so at least one row lands in
`failed` with the overflow message, then pressing that row's own control.
DIRECTION: the button is absent, mislabelled, not disabled while another row
grades, the `Grading` badge does not appear, or the overflow sentence's offer
does not match the control's actual label. STEP: the owner-verification pass,
batched with A31's RES-A31-4 and A36's, which need the same browser session.

**RES-A38-6 - the panel is at 990 of 1000 and A38 spends up to nine of the
remaining ten.**
OWNER: the next chunk whose write set includes `GradingRecordingPanel.tsx`.
INSTRUMENT: `PS> @(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count`.
DIRECTION: any addition at all fails `src/file-size-ceiling.structure.test.ts`.
STEP: that chunk owes an extraction BEFORE its own code - and §3.1 records
which candidate blocks are fenced by source-text pins, so it is not a free
choice.

---

## 10. TRIAGE - which seats run, with the trigger that fired

| Seat | Runs? | Trigger |
|---|---|---|
| Acceptance criteria | YES | Always. Never triaged out. |
| Architect + reuse | RAN | This document. |
| Data / storage | **YES, wave 2 only** | A persisted shape changes: `EXPECTED_WIRE_KEYS` 19 -> 20 against `useAssessmentRowStore`'s storage-full fallback. Triaged OUT of wave 1, which persists nothing new. |
| User experience | YES | A new control the user clicks. |
| Visual / aesthetic | YES | New markup in an existing row cluster. |
| Accessibility | YES | New markup, a new focus stop per row, a disabled state. Must state that every finding is a reading claim. |
| Security | **NO** | Trigger not fired: no new server action, no new egress, no new credential path, no new model-authored text reaching the DOM. `gradeCapturedSubmissionsAction` is unchanged except for one message string. Recorded so the verifier can rule on it against the built diff. |
| Reliability | YES | A lock, an in-flight call, a resource (the lock) that must be released on every exit - A27's exact class. |
| Operability / admin | **NO** | Trigger not fired: nothing new to configure, audit, revoke or delete. `GRADE_MAX_SUBMISSIONS` already exists and A38 adds no knob. |
| External-facts research | **NO** | Trigger not fired: nothing here rests on a library's behaviour outside this repo. |
| Baseline | YES | `grep -a "per-row Grade" docs/REGRESSION.md` must be run first; if the recording panel's grading path has no current-behaviour entry, the baseline runs BEFORE hand-off. |
| Test seat | YES | Always. Owns §7's oracles and the P-4 sabotage. |

---

## 11. WHAT I COULD NOT DETERMINE

- **Whether the button, its label, its disabled state, its placement or its
  keyboard reachability are correct.** No component is rendered by any test
  here. -> RES-A38-5.
- **Whether a real model call under a real bound behaves as traced.** No
  `.env` in this checkout and no API keys; every LLM path is exercised through
  mocks (`docs/loop/this-repo.md` section 6).
- **Whether `next build` accepts the new client hook's import graph.** The
  build gate fails in this checkout's prerender tail for unrelated env
  reasons; the check is the `Compiled successfully` line, and it must be read
  at the wave gate rather than inferred here.
- **The exact byte cost of the persisted digest against a real full-table
  localStorage value.** Wave 2's data seat must measure it, not assert it.

---

## 12. BACK TO THE OWNER

1. **The rubric fork (§4.2).** Wave 2 is a persisted-shape change. Ship it, or
   reduce A38 to wave 1 and record in the criteria that a per-row grade can
   produce a silently incomparable table. My recommendation is ship. Either
   way the decision must be written down; silence is the illegal answer.
2. **RES-A38-1 - the aggregate spend cap this feature removes by
   construction.** This is a product decision, not an implementation gap.
3. **Two loop cards carry a stale measured quantity.**
   `docs/loop/leverage.md:41` and `docs/loop/seats.md:126-128` both state
   `DEFAULT_MAX_SUBMISSIONS = 5` at `src/lib/gemini.ts:25`. Measured today:
   **40, at line 32.** `seats.md`'s numeric-collision checker question (a
   privacy floor of 5 against "a grading cap that defaults to 5") rests on
   that figure, so the collision it describes may no longer exist. I did not
   edit either card - they are outside my write set.
4. **Five stale comments found in passing, none fixed by me.**
   `src/lib/gemini.ts:58` ("the default cap of 5 submissions per run");
   `GradingTableRow.tsx:271-274` and `GradingTable.tsx:198-202` (both claim
   `FROZEN_PRIMARY_SITES` pins them, and neither file is a key in that map);
   `grading-row.ts:376-380` (says nothing calls
   `stampGradingRowsWithAssessment` with a real value - the panel does, and
   the field's own doc comment 200 lines earlier says so);
   `grading-submission-grade.ts:58-63` (goes stale at this diff, and wave 1
   corrects it).
