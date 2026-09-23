# A39: the architecture of the remedy - REVISION 2

Backlog row A39. Revision 2, authored under `docs/a39-rulings.md` (commit
6ccacf4), which rules on `docs/a39-check.md`'s round-1 check of revision 1
(commit c74f276). **This is the LAST revision of this artifact.** The owner
capped every artifact at two rounds today, and the answer that follows round 2
must END the activity. Nothing below is deferred to "the next revision": what
could not be settled is either a residual with five fields (section 11) or a
TERMINATING question (section 12), shaped so every possible answer ships
something.

It consumes `docs/a39-census.md` (66e8104), `docs/a39-research.md` (ecdc5f8),
`docs/a17-discovery.md` section 5 (cb4e446), and
`docs/owner-decisions-2026-09-23.md` DECISION 3 and **DECISION 6** (7c5a75b).
It decides SHAPE: where each seam falls, what is one layer versus two, which
object each requirement binds to, and in what order the waves land. It writes
no code.

**Every quantity below names the command that produced it.** Commands were run
from the repo root on 2026-09-23, through the Bash tool (Git Bash) unless
marked PowerShell. Every absence claim is paired with a canary run through the
same instrument in the same call, and **no absence grep is piped through
`head`** - revision 1 shipped a false absence at its own leverage claim
(RULING 26) and section 3 is rebuilt from re-measured output.
**Nothing renders under vitest here** (`docs/loop/this-repo.md` sections 2 and
6), so every interaction count is a READING claim traced from a control to its
handler, and no pass condition in section 8 is satisfied by a render.

---

## 0. RULING 25 FIRST: the reframe, tested before anything else was revised

The check's strongest point, and the orchestrator's first ruling, is that
**path E may already ship the pool, the pinned rubric and the "Rubric used"
receipt** - in which case wave 4 is a PORT and A39's real problem is
reachability, the disease `docs/a17-discovery.md` measured today. Everything
else waited on this.

I traced path E end to end. **The reframe is PARTLY confirmed, and the part
that fails is the part that would have shrunk A39 the most.** Three separate
answers, each measured:

### 0.1 The pool: YES, and it is a port, priced

```
grep -rn "useRepoGradesBulkGrade" src --include=*.ts --include=*.tsx
grep -rn "useRepoGradesBulkGradeZZZ" src --include=*.ts --include=*.tsx   # canary, exit 1
awk 'NR>=205&&NR<=300' src/app/components/repo-grades/useRepoGradesBulkGrade.ts
awk 'NR>=395&&NR<=489' src/app/components/repo-grades/useRepoGradesBulkGrade.ts
```

Every structural element wave 4 proposed already ships, on path E, in one
file:

| Element | Where, measured |
|---|---|
| bounded-concurrency pool over a shared cursor | `runWorker` at `:466-478`; `Promise.all(Array.from({length: workerCount}, () => runWorker()))` at `:478` |
| the concurrency bound | `BULK_GRADE_CONCURRENCY = 3` at `repoGradesBulkGrade.ts:143` |
| one model call per invocation | `gradeRepoAction(...)` at `:282-291`, one target |
| per-item failure isolation | `.catch((err: unknown) => ({ error: ... }))` at `:291` |
| a run lock that is a `useRef`, not state | `runLockRef` at `:216`, claimed `:228-229`, released in `finally` at `:234-247` |
| `{done, total}` progress | `setProgress` at `:218`, `:476` |
| results per cell as they arrive | `onCellUpdate` at `:273`, `:322` |
| a shared rubric pinned before the pool opens | `establishSharedRubric`, called `:446-460`, reused at `:471` |

**And the thing that matters most, which revision 1 did not know existed:**

```
grep -n "twice\|second\|refus\|lock" src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts
awk 'NR>=1&&NR<=60' src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts
```

`src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts` is a
**shipped harness that drives a React hook with no render**: `vi.hoisted`
slot-based `useState`/`useRef` stubs at `:28-56`, `vi.mock("react", ...)` at
`:58`, one call of the hook standing in for one render (`:13-20`). It already
contains the exact test RULING 29 demands - `:329` "A26b: a second click from
the SAME render, same task, must still be refused", and `:313-314` "the ref
lock refuses it before it ever calls the resolver (resolvesStarted: 1, R-5: 0
for a refused click)".

**Consequence for the design, stated as a shape change and not a note: wave
4's concurrency half is a PORT of a tested, adversarially-reviewed hook,
INCLUDING ITS TEST HARNESS.** The double-press instrument RULING 29 requires is
not a new technique here; it is `useRepoGradesBulkGrade.lifecycle.test.ts`
copied and re-pointed. Section 4.6 specifies it and section 8's wave 4 names
the file to model.

### 0.2 The pinned rubric: PARTLY, and path E's version is the weaker one

`establishSharedRubric` fires **only when the resolved rubric is blank**
(`:459`, `if (resolved.text.trim() === "" && targets.length > 0)`), and it pins
**retrospectively**: targets are graded alone, sequentially, until one succeeds,
and that target's own generated rubric becomes every later target's argument
(`:405-424`, `:446-460`). It pins a rubric STRING. It does not pin a criteria
list, and it does not compute anything before the first model call.

So the property claim 2 asserts - **one rubric AND one ordered criteria list
resolved before ANY submission is graded** - is strictly stronger than what
path E has, and the first graded submission on path E is graded against a
rubric that did not exist when the run started. Claim 2 survives, on narrower
and more honest ground (section 3).

### 0.3 The "Rubric used" receipt: NO. This is where the reframe fails.

The check reads `useRepoGradesBulkGrade.ts:89` as an existing provenance
receipt. Opened, it is not one:

```
awk 'NR>=83&&NR<=92' src/app/components/repo-grades/useRepoGradesBulkGrade.ts
```

```
function describeResolvedRubricForLog(resolved: ResolvedRubric, generatedRubricText: string): string {
  if (resolved.source === "generate") return `Rubric used: ${generatedRubricText}`;
  const identity = resolved.identity ? ` "${resolved.identity}"` : "";
  const failure = resolved.failureReason ? ` - ${resolved.failureReason}` : "";
  return `Rubric source: ${resolved.source}${identity}${failure}`;
}
```

Three facts kill the reframe's third leg:

1. The literal `Rubric used:` is emitted on **one branch of four sources**. Every
   other source emits `Rubric source: ...`. It is not a receipt; it is one
   arm of a log formatter.
2. It is an **ACTIVITY-LOG STRING**, not a field on the run. It is not read
   back from the run, so editing the stored rubric afterwards cannot be
   distinguished from a rubric that was never edited.
3. There is no fingerprint anywhere on any run object:

```
grep -rn "rubricUsed\|rubricFingerprint" src/lib/grade src/app/actions \
  src/lib/github-grading-run-store.ts src/lib/grading-drafts.ts     # exit 1, no output
grep -rn "rubricAreaNames" src/lib/grade src/app/actions \
  src/lib/github-grading-run-store.ts src/lib/grading-drafts.ts | wc -l   # 40 (canary, same instrument)
```

### 0.4 Is path E's capability UNREACHED, in the a17 sense? NO, and I refuse that framing

The reframe's strong form - "a shipped feature reads as absent because its
affordance moved" - does not hold here, and adopting it would have been the
expensive mistake. Measured:

```
grep -rn "repo-grades" src --include=*.ts --include=*.tsx | grep -v "^src/app/components/repo-grades/"
```

- `src/app/page.tsx:19` imports `RepoGradesTab from "./components/repo-grades"`,
  mounted at `:578` on `manualView === "repo-grades"`.
- `src/app/components/manual/manual-rail.ts:88` is a first-class rail
  destination: `{ id: "repo-grades", label: "Repo Grades", description: "Grade
  student GitHub repos and post the results to Canvas" }`, in
  `MANUAL_VIEW_ORDER` at `:117`, with a URL round trip
  (`url-state.test.ts:883-886`, `?tab=manual&manualView=repo-grades`).

**Path E is a named, routed, labelled destination.** Nothing moved and no route
was closed. The reason an instructor with a zip cannot reach the pool is that
`gradeRepoAction`'s per-item unit is a GitHub repo - a CAPABILITY boundary, not
a discovery defect. Calling it reachability would have mis-scoped A39 into a
navigation fix that grades nothing.

### 0.5 What the reframe actually changes

| Wave 4 element | Verdict after the trace |
|---|---|
| pool, shared cursor, worker count, `.catch` isolation, `useRef` lock, `finally` release, `{done,total}` | **PORT.** Named source: `useRepoGradesBulkGrade.ts:216-247,466-478`. Named test harness: `useRepoGradesBulkGrade.lifecycle.test.ts:28-60` |
| per-item transport | **BUILD, and now a Route Handler** (DECISION 6). Path E's is a Server Action; A39's is not (4.1) |
| the per-item unit | **BUILD.** A zip entry / a Canvas ticket. Path E's is a repo name |
| pinning rubric + criteria server-side before call 1 | **BUILD.** Path E pins retrospectively and pins no criteria (0.2) |
| reconciliation as a projection | **BUILD.** Path E has no reconciliation at all |
| cancellation | **BUILD.** Path E has none |
| version provenance on the run | **BUILD.** Nothing anywhere has it (0.3) |
| the double-press refusal instrument | **PORT.** The harness exists and already tests this exact case |

**Net effect: wave 4 gets cheaper and its risk profile drops, and A39 does not
shrink to a reachability item.** The concurrency machinery and its test
technique are copied rather than invented; the transport, the unit, the
pinning, the reconciliation and the provenance are not. Section 8's wave 4 is
re-scoped on that basis and section 12's question 4 asks the owner the one
scope call this leaves.

### 0.6 What held from revision 1, and is not reopened

Per the rulings file: the credential correction (the fast paths are NOT gated
on an owner-only credential - `canvas-credentials.ts:130` is inside
`resolveOwnerEnvCredential`, while `resolveCanvasCredential:189-227` reads the
caller's own stored credential at `:193-196` behind `requireUser()`, so census
verdict bullet 3 at `a39-census.md:569-572` FALLS); all three section 0.1
citation corrections; the mutation at `engine.ts:371`/`:373` and the
divergence argument; `1.2 * 39 = 46.8` from `gemini.ts:67`; the line counts,
with both mandated counters agreeing; both canary claims including the
per-surface-key reasoning; every A17 citation; and the `.docx`-as-zip finding
end to end. None is re-argued below.

### 0.7 Five prior-version measurement errors, corrected

Each was produced by opening the line or re-running the command shown.

| Revision 1 said | Measured now | Command |
|---|---|---|
| `grep -rn "rubricUsed\|rubricFingerprint" src` returns nothing; canary `rubricAreaNames` returns 47 | **30 lines across 6 files**; canary returns **140** | both greps piped to `wc -l`, plus `grep -rn "rubricUsedZZZNoSuchThing\|rubricFingerprintZZZNoSuchThing" src` exit 1 |
| `maxDuration` grep returns 57 lines | **56** | `grep -rn "maxDuration" src --include=*.ts --include=*.tsx \| grep -v "\.test\." \| wc -l`; canary `maxDurationNoSuchThing` exit 1 |
| `file-size-ceiling.structure.test.ts:39` sets `LIMIT = 1000` | **`:41`** | `grep -n "LIMIT" src/file-size-ceiling.structure.test.ts` |
| `client-state-sweep.ts:46` is `DEVICE_PREFERENCE_KEYS` | **`:45`** (`:46` is blank) | `awk 'NR>=43&&NR<=48'` |
| `extraction.ts:31` uses JSZip | `import JSZip` is **`:1`**; `JSZip.loadAsync` is **`:73`** and **`:117`** | `grep -n "JSZip\|loadAsync" src/lib/grade/extraction.ts` |

Four more, from the check, confirmed and applied throughout: research's
"never scheduled ahead of M1 or M2" is M4's bullet at
`docs/a39-research.md:828`, not a section 7.4 (there is none); the census's
crossover sentence is `docs/a39-census.md:364`, "**Six of the nine costed
rows** cross over at N = 5 or below"; `CartridgeDropPanel.tsx`'s Rubric label
is `:406` (`:411` is the `id`); and `SnapshotGradingPanel.tsx`'s policy comment
is `:143-147` with the instructor-instructions discriminator at `:150-157`.

### 0.8 A LIVE CONFLICT with revision 1 and with the check, reported not adopted

Revision 1 measured `src/app/actions/grading.ts` at **905** and the check
verified all 21 counts. Both were right at HEAD. In the working tree today they
are wrong:

```
git show HEAD:src/app/actions/grading.ts | wc -l   -> 905
wc -l < src/app/actions/grading.ts                 -> 917
@(Get-Content src/app/actions/grading.ts).Count    -> 917   (PowerShell)
git diff --stat src/app/actions/grading.ts         -> 1 file changed, 12 insertions(+)
git status --short                                 -> M src/app/actions/grading.ts
                                                      ?? src/app/actions/grading.budget.test.ts
```

**A concurrent chunk (A38's spend cap, on the evidence of the then-untracked
`grading.budget.test.ts`) was adding 12 lines to the one file wave 1 must
edit.** I adopted neither number as the plan's basis. **It landed while this
document was being written.** Re-measured at the end of this pass:

```
git log --oneline -2    -> 837f2e3, 0f52301   (both after the measurement above)
git show HEAD:src/app/actions/grading.ts | wc -l   -> 917
wc -l < src/app/actions/grading.ts                 -> 917
```

**The number is 917. The episode is the point, not the number.** A design
written against 905 and checked against 905 would have handed wave 1 a +20
budget measured against a file that had already grown 12 lines underneath it,
and would have handed it an owns list with no `grading.budget.test.ts` in it
(1.8). Section 5.3's wave-1 row carries the history; RES-A39A-7 is written
around the fact that this file took a second writer inside one session. **The
wave gate is `@(Get-Content).Count` on the real tree at the wave, never a
number in this document** - which was already the rule and is now
load-bearing.

---

## 1. What is actually true in the tree, re-measured

### 1.1 The blocking run

```
sed -n '178,400p' src/lib/grade/engine.ts
grep -n "export async function gradeEntries\|export async function gradeSubmissions\|export async function gradeCanvasUrl\|async function gradeStudentEntries" src/lib/grade/engine.ts
```

- `gradeStudentEntries` declared at `engine.ts:178`; `gradeSubmissions` `:403`;
  `gradeEntries` `:457`; `gradeCanvasUrl` `:473`.
- The loop: `for (let i = 0; i < limitedEntries.length; i += 1)` at `:207`.
- One model call per student: `await gradeSubmission(...)` at `:229`.
- `await sleep(interRequestDelayMs)` at `:278`, guarded at `:277` by
  `interRequestDelayMs > 0 && i < limitedEntries.length - 1 && !nextRefused`.
- Capped by `.slice(0, maxSubmissions)` at `:193`.
- `:332-393` performs CANONICAL-COLUMN RECONCILIATION, which **mutates**
  `result.overallComment` (`:371`) and `result.rubricAreas` (`:373`).
- The run is assembled and returned at **`:395-399`**.

**Correction to revision 1's "single return site".** `:395-399` is the single
return site THAT CARRIES RESULTS. Two more return a `GradingRun` literal, both
empty: `engine.ts:437` (`gradeSubmissions`, no student submissions found) and
`engine.ts:489` (`gradeCanvasUrl`, no students). Verified by
`grep -rn "rubricAreaNames:" src --include=*.ts --include=*.tsx | grep -v "\.test\."`,
canary `rubricAreaNamesZZZ:` exit 1. Section 6.4's stamp is specified against
all three, because a claim that "every run carries the pair" is false on two of
them otherwise.

The attended caller is `gradeAction` (`src/app/actions/grading.ts:705`). Its
Gemini zip branch at `:870-874` runs `gradeSubmissions` alongside
`synthesizeFullCreditChecklist` and `generateSampleAnswer` in one
`Promise.all`, so a zip run is **N + 2 model calls in one Server Action
invocation**, N + 3 when the rubric is synthesized at `:866`. (Those line
numbers are HEAD's; see 0.8.)

The UI gate is `GradingTab.tsx:426`: `source !== "livefeed" && run &&
run.results.length > 0`, where `run` is `state.run` (`:133`), the single return
value of the `useActionState` in `src/app/page.tsx:63`.

### 1.2 The platform ceiling, and the decision that settles it

```
grep -rn "maxDuration" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l   -> 56
grep -rn "maxDurationNoSuchThing" src --include=*.ts --include=*.tsx   # canary, exit 1
```

`src/app/page.tsx` is not among them - the absence the census names is real,
canary firing on the same instrument. This repo has solved the class four
times and written the rule down:

- `src/app/api/course-intel/ask/route.ts:48-59`: `maxDuration` is honoured only
  at the PAGE level, `src/app/page.tsx` is a client component that declares
  none, so **a Server Action reached from it has no declarable ceiling at
  all**; three routes moved off Server Actions for exactly this. Declared at
  `:134`.
- `src/app/api/class-trends-insight/route.ts:30-33`: `maxDuration = 60`,
  "Hobby's hard cap".
- `src/lib/visualizer/selection-coverage.ts:35-59`: move it "onto a Route
  Handler with an explicit `maxDuration`".
- `src/app/actions/grading-submission-grade.ts:51-58`, about a GRADING loop
  specifically: "an unbounded sequential-call loop is exactly what would blow
  through it."

Revision 1 cited only the half of `ask/route.ts` that gives 60s as the Hobby
cap, and treated "Route Handler" and "client pool" as exclusive candidates.
**DECISION 6 settles it: the per-item call is a Route Handler at
`maxDuration = 60`, and the client pool STAYS.** The pool resets the clock per
call; the handler declares each call's ceiling. Section 4 is rebuilt on that.

### 1.3 The precedent that IS the answer

Fully traced in section 0.1 and not repeated. The one addition the trace
produced: there is still no streaming transport to copy instead.

```
grep -rn "text/event-stream\|EventSource" src --include=*.ts --include=*.tsx
#   -> only workflow-triggers' own getEventSource(), unrelated to the browser API
grep -rn "getReader()\|TextDecoderStream" src --include=*.ts --include=*.tsx   # exit 1, no output
grep -rn "ReadableStreamNoSuchThing" src                                        # canary, exit 1
```

`ReadableStream` appears once, at
`src/app/api/lms-export/selection/route.ts:541`, converting a Node zip stream
for download.

### 1.4 The rubric, per surface, and the policy the owner dropped

```
grep -n "localStorage\|useState(\"\")" src/app/components/GradingTab.tsx \
  src/app/components/CartridgeDropPanel.tsx
grep -rn "ta-grading-rubric\|ta-cartridge-rubric\|ta-snap-rubric\|ta-rec-grade-rubric" src
#   -> exit 1, no output
grep -rn "ta-grading-source" src   # canary, exit 0, GradingTab.tsx:74,86
```

- `GradingTab.tsx:79` `assignmentInstructions` and `:80` `rubric` are plain
  `useState("")`. `ta-grading-source` at `:74,:86` proves the file does use
  localStorage, so this is an omission, not an architecture.
- `CartridgeDropPanel.tsx:40,44,48,52` restore `ta-cartridge-course`,
  `-assignment`, `-points`, `-lms`. `:55` declares `rubricText` as plain
  `useState("")` and `:220` runs `setRubricText("")` after every upload.
- `repoGradesUiState.ts:54` `ta-repo-grades-rubric`, restored at `:199`; its
  comment at `:46-53` justifies the key's shape on simplicity and raises no
  sensitivity objection.
- The dropped policy is asserted in exactly two places, both of which become
  false: `RubricInputModal.tsx:28-34` ("the text is handed to the caller via
  onSubmit and NOTHING here persists it ... nothing about it lingers once the
  instructor moves on") and `SnapshotGradingPanel.tsx:143-147` (the same,
  extended to `assignmentText`).

**The line those authors actually drew**, which decides what replaces them:
`SnapshotGradingPanel.tsx:150-157` persists `instructorInstructions` under a
`ta-` key three lines below refusing to persist `rubricText`, with the
discriminator stated verbatim - that field "is not captured or transcribed
material ... and it carries none of the 'unreleased assignment content'
sensitivity RubricInputModal.tsx's U10 note is about."

One mechanism the policy comments do not account for:
`src/lib/client-state-sweep.ts:45` erases localStorage on every change of
signed-in owner by a KEEP-LIST (`DEVICE_PREFERENCE_KEYS = ["ta-theme"]`), so
any new `ta-` key is swept by default. That answers the CROSS-USER half of the
policy's concern and not the "nothing lingers while I am signed in" half
(6.5).

### 1.5 The one per-submission entry point that exists, and its defect

`gradeOneSubmissionAction` (`grading.ts:597-643` at HEAD) has no attended UI
caller (`grep -rn "gradeOneSubmissionAction" src` returns three lines: its
declaration and `steps.grading-singles.ts:3,238`). Two facts decide section 4:

1. It takes `(code, courseId, assignmentId, userId, provider)` and re-fetches
   the submission from Canvas at `:607`. **It cannot receive a zip entry at
   all**, so it is not the seam for path A.
2. `:633-635` computes
   `effectiveRubric = meta.rubricText.trim() ? meta.rubricText : await generateRubric(...)`
   **inside the per-call body**. Called twice for two students of one
   assignment with no Canvas rubric, it can synthesize two different rubrics -
   the exact defect `useRepoGradesBulkGrade.ts:405-424` exists to prevent, and
   the one the new seam must make unrepresentable.

### 1.6 What the browser already receives

`GradeResultBase.submittedFiles: SubmittedFileInfo[]` (`types.ts:241`), and
`SubmittedFileInfo` carries `rawBase64?: string` (`types.ts:124`).
`engine.ts:242` pushes the entry's `submittedFiles` straight onto the result.
**Every submitted file's raw bytes already cross to the browser on every
attended run today.** Routing entry content through the client adds a
direction, not a class of exposure.

### 1.7 No runaway spend from a growing run

```
grep -n "useEffect\|fetch(\|onClick" src/app/components/drafted-grades/ClassTrendsPanel.tsx
```

`ClassTrendsPanel` is mounted by `GradingResults.tsx:607` whenever
`hasTrendableResults`. Its model call (`requestInsight`, at `:93`, POSTing to
`/api/class-trends-insight` at `:98`) is reached only from `onClick` at
`:159`, `:173`, `:196` - never from an effect. **A run whose `results` array
grows 40 times fires zero extra model calls.**

It is also the template for a client-to-Route-Handler call in this repo:
`:98-102` is `fetch(CLASS_TRENDS_INSIGHT_ROUTE, { method: "POST", headers: {
"Content-Type": "application/json" }, body: JSON.stringify(...) })` with the
transport rejection caught at `:103-109`. Section 4.2 copies that shape rather
than inventing one.

### 1.8 The OWNS list: every test that reads an edited file AS SOURCE TEXT

Revision 1's survey covered six names and missed three files. Re-run over
every file any wave edits, output pasted:

```
for n in "GradingTab.tsx" "CartridgeDropPanel.tsx" "GradingResults.tsx" \
         "SnapshotGradingPanel.tsx" "GradingRecordingPanel.tsx" "RubricInputModal.tsx" \
         "LiveFeedPanel.tsx" "actions/grading.ts" "grade/engine.ts" "grade/types.ts" \
         "app/actions.ts" "grading-drafts.ts" "github-grading-run-store.ts"; do
  echo "### $n"; grep -rl "$n" src --include="*.test.ts" | sort; echo; done
```

```
### GradingTab.tsx
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts

### CartridgeDropPanel.tsx
src/lib/course-lms-options.test.ts

### GradingResults.tsx
src/app/components/grading-results/gradingResultsDisplayHelpers.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpers.test.ts
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
src/app/components/grading-results/gradingResultsPostOutcome.test.ts
src/app/components/grading-results/sortGradeRows.test.ts
src/app/components/grading-results/ungradedDisclosure.test.ts
src/app/components/grading-results/ungradedRowLabel.test.ts
src/app/components/repo-grades/repoGrades.wiring.test.ts
src/app/components/repo-grades/repoGradesCellEdits.test.ts
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/app/components/rubricBreakdownPercent.wiring.test.ts
src/app/components/ui/modalAdoption.wiring.test.ts
src/lib/canvas/grades.test.ts
src/lib/grade/postable.test.ts
src/lib/grade/utils.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
src/lib/no-emojis.test.ts

### SnapshotGradingPanel.tsx
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts
src/loop-docs.structure.test.ts

### GradingRecordingPanel.tsx
src/app/actions/grading-submission-grade.test.ts
src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/grading-recording/grading-recording-log.test.ts
src/app/components/grading-recording/grading-rows.test.ts
src/app/components/grading-recording/markLate.wiring.test.ts
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts
src/app/components/module-deck-capture/module-deck-dispatch.test.ts
src/app/components/recording/AddKnowledgePages.test.ts
src/app/components/recording/discussion-capture.test.ts
src/app/components/recording/discussion-knowledge-context.test.ts
src/app/components/recording/runLogRow.test.ts
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/ui/buttonVariant.test.ts
src/lib/recording-launch.test.ts

### RubricInputModal.tsx
src/app/actions/syllabus-upload.rubric-reuse.test.ts
src/app/components/grading-recording/rubric-input.test.ts
src/app/components/ui/buttonVariant.test.ts
src/app/components/ui/modalAdoption.wiring.test.ts
src/lib/syllabus-upload-source.test.ts

### LiveFeedPanel.tsx
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts

### actions/grading.ts
src/app/actions/grading-missing-submissions.test.ts
src/app/actions/grading-run-mapping.test.ts
src/app/actions/grading.budget.test.ts
src/lib/grade/postable.test.ts

### grade/engine.ts
src/app/components/grading-results/ungradedDisclosure.test.ts
src/lib/code-runner.test.ts
src/lib/grade/grouping-zip-parents.wiring.test.ts

### grade/types.ts
src/app/actions/grading-submission-grade.test.ts
src/app/components/grading-recording/copy-feedback.test.ts
src/app/components/grading-results/gradingResultsHelpers.test.ts
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
src/app/components/repo-grades/repoGradePostScore.test.ts
src/app/components/repo-grades/repoGradeScoreDisplay.test.ts
src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts
src/lib/github-grading-run-store.test.ts
src/lib/grading-drafts.test.ts

### app/actions.ts
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
src/lib/module-graph/runtime-import-graph.test.ts

### grading-drafts.ts
src/lib/grade-result-allowlist-coverage.test.ts
src/lib/repo-grading-log.test.ts

### github-grading-run-store.ts
src/lib/github-grading-run-store.test.ts
src/lib/grade-result-allowlist-coverage.test.ts
src/lib/grading-drafts.test.ts
```

**Three files revision 1's list did not contain, each of which would have gone
red on a wave that did not own it:**

- `src/app/actions/grading.budget.test.ts` - new, untracked, names
  `actions/grading.ts` (0.8). Wave 1 edits that file.
- `src/lib/course-lms-options.test.ts` - the ONLY source-text reader of
  `CartridgeDropPanel.tsx`, which wave 2 edits. Revision 1 listed no owner for
  that file at all.
- **`src/lib/grade-result-allowlist-coverage.test.ts`** - reads BOTH
  persistence modules. It is the single most important file in this document
  and section 6.4 turns on it.

`src/loop-docs.structure.test.ts` also reads `SnapshotGradingPanel.tsx`; wave 3
owns it read-only.

**`src/app/components/autoGradeTransition.wiring.test.ts` is the one that
bites**, and it must be in the write set of every wave that edits
`GradingTab.tsx`. It reads the file as source text (`:99`) after stripping
comments and asserts:

- **A5** (`:159-162`): `/formAction\(/` matches **exactly once in the whole
  file**. Note the regex: `action={formAction}` does NOT match it.
- **A6** (`:164-190`): SOME occurrence of the literal `source !== "livefeed"`
  has an innermost enclosing brace span that is a live conjunction, contains
  `pending` and `styles.loadingState`, and **contains no `||` anywhere**. The
  satisfying span today is `GradingTab.tsx:188-200`.
- **A7** (`:192-202`): `disabled={pending}` appears **exactly 3 times** in
  `LiveFeedPanel.tsx`, on three named anchors.

Sections 4.6, 6.6 and 8 discharge each one explicitly, and 4.6 states which
one changes and to what.

### 1.9 The exact-key-set canaries, and the wiring assertions they pair with

DECISION 3 requires the relevant canary be bumped in the same commit as the
key. There are two, each directory-scoped, and **each is TWO separate
mechanisms that revision 1 treated as one** - an exact-SET scan over raw
source, and a WIRING assertion that the key reaches a real
`getItem`/`setItem`. They have different scan scopes, and that is what
RULING 28's third point is about.

| Directory | Exact-set scan | Wiring assertion | Its haystack |
|---|---|---|---|
| `grading-recording/` (path F) | `grading-rows.test.ts:678-687`, regex `/ta-rec-grade-[a-z-]*/g` at `:678` over `combined`; today seven keys | `isWired` at `:697-716`, driven per key by `it.each` at `:718-732` | `combined` = `grading-recording/` non-test files **plus `assessment-shared/`** (`:653-658`) |
| `snapshot-grading/` (path G) | `:196-202`, regex `/(?<![a-zA-Z])ta-snap-[a-z-]*[a-z]/g` at `:188` over `combinedSource`; today four keys. **Its test NAME at `:195` asserts the dropped policy in prose**: "U10 keeps shot bytes and rubric/assignment text out of localStorage" | three `toMatch` blocks at `:211-224` over `strippedCombinedSource` (`:209`) | `SNAPSHOT_GRADING_DIR` non-test files only (`:177-186`) |
| `src/app/components/` root (path A) and `CartridgeDropPanel.tsx` (path H) | **none** | **none** | - |

**And the repo has already solved the cross-directory case, in the same
file.** `snapshot-grading.structure.test.ts:141-174` is a bespoke block written
because `ta-snap-table`'s real `getItem`/`setItem` calls live in
`assessment-shared/useAssessmentRowStore.ts`, which the directory scan cannot
see. Its header at `:142-148` states the exact hazard: "A4d can be unwired with
every other gate green." Its three assertions are the template section 6.3
adopts:

1. the panel declares `const STORAGE_KEY_TABLE = "ta-snap-table"` (`:157-159`);
2. the panel actually CALLS the store with that constant (`:161-166`,
   comment-stripped);
3. the store passes its key parameter through to both `localStorage.getItem`
   and `localStorage.setItem` (`:168-173`).

The comment at `:124-133` is the prose half of the same policy, with the U10
sentence running to `:132`.

**Why per-surface keys rather than one shared key, unchanged and still
correct:** a single `ta-rubric-memory` would match NEITHER directory regex, so
the new storage would be invisible to both canaries and DECISION 3's
"bump the canary in the same commit" would be vacuous.

### 1.10 Line counts, both instruments

PowerShell: `foreach ($f in $files) { "{0}`t{1}" -f @(Get-Content $f).Count, $f }`.
Bash: `wc -l < $f`. The two agree on every row below. (`Measure-Object -Line`
is never used here; on `docs/a39-census.md` it returns 525 against 652 from
both of the above - a 127-line gap.)

| File | `@(Get-Content).Count` | `wc -l` | 1000 minus count |
|---|---|---|---|
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | **990** | 990 | **10** |
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | **970** | 970 | **30** |
| `src/app/actions/grading.ts` (working tree; **905 at HEAD** - see 0.8) | **917** | 917 | **83** |
| `src/app/components/GradingResults.tsx` | 906 | 906 | 94 |
| `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | 822 | 822 | 178 |
| `src/app/components/grading-recording/grading-rows.test.ts` | 733 | 733 | 267 |
| `src/app/components/LiveFeedPanel.tsx` | 719 | 719 | 281 |
| `src/app/page.tsx` | 703 | 703 | 297 |
| `src/app/components/CartridgeDropPanel.tsx` | 544 | 544 | 456 |
| `src/lib/github-grading-run-store.ts` | 501 | 501 | 499 |
| `src/lib/grade/engine.ts` | 498 | 498 | 502 |
| `src/app/components/repo-grades/useRepoGradesBulkGrade.ts` | 489 | 489 | 511 |
| `src/app/components/GradingTab.tsx` | 476 | 476 | 524 |
| `src/lib/grade/types.ts` | 406 | 406 | 594 |
| `src/app/components/grading-recording/RubricInputModal.tsx` | 375 | 375 | 625 |
| `src/lib/grading-drafts.ts` | 370 | 370 | 630 |
| `src/lib/grade-result-allowlist-coverage.test.ts` | 298 | 298 | 702 |
| `src/app/api/class-trends-insight/route.ts` | 187 | 187 | 813 |
| `src/lib/research/rubric-bank.ts` | 120 | 120 | 880 |
| `src/app/actions.ts` | 77 | 77 | 923 |
| `src/lib/grade.ts` | 19 | 19 | 981 |

`src/file-size-ceiling.structure.test.ts:41` sets `LIMIT = 1000`; `:138-144`
fails on `lineCount > limit`, so 1001 is red. Its `ALLOWED_OVERAGE` map
(`:75-92`) holds exactly four entries, all `*.test.ts`, all pre-existing.
**No wave below proposes an overage entry.**

**The top two rows are a hard finding.** Persisting a rubric on paths F and G
lands on panels 10 and 30 lines from the ceiling. **An extraction precedes the
feature on both**, scheduled as the first commit of its own wave (section 8).

---

## 2. The problem restated: the loss is at N = 1, and it is the zip

The census's verdict is that clicks are not the loss, and I accept it: on
interaction count, **six of the NINE costed rows** cross over at N = 5 or below
and four (C, E, B, H) at N <= 2 (`docs/a39-census.md:364`). Nothing below
reduces clicks as an end.

But the census's section 7 lists, under "what I could not measure", **"the cost
of PRODUCING the zip on paths A and H."** With the coordinator's design-for-N=1
rule applied, that unmeasured cost is the largest single item on the first
assignment - the only assignment the instructor evaluates the app on.

An instructor with ONE submission in hand meets this:

- `GradingTab.tsx:234-239`: `<input type="file" accept=".zip,application/zip">`.
  The only intake is a zip.
- `GradingTab.tsx:240`: the entire stated requirement is "Upload a zip archive
  that contains the student submissions."
- `grading.ts:820-821` (HEAD): no file, no grade.
- `engine.ts:403-424`: `gradeSubmissions` opens the buffer with
  `JSZip.loadAsync` (`extraction.ts:117`) and walks it.
- `utils.ts:87-107` `matchStudentFileConvention` needs at least four
  underscore-separated parts (`:95-97`); anything else falls through to
  `leafStemFallback` (`:121-126`), which takes the leading alphanumeric run of
  the stem as the student's identity.

So at N = 1 the app charges two navigation clicks, **constructing a zip around
one file**, naming it to a convention stated nowhere, two pastes, a submit, and
the whole-run wait. The chat charges three pastes and answers after the third.

There is a sharper edge on the same line. `TEXT_EXTENSIONS`
(`src/lib/office-extract.ts:13-52`) contains `"xml"` at `:18`. A `.docx` **is**
a zip. An instructor who renames their submission to `.zip` to satisfy the
input gets a run in which JSZip walks the OOXML parts, `word/document.xml` is
"supported", and `leafStemFallback` names the student `document`. **The app
does not error - it grades the wrong thing and reports success.**

**THE RULING THAT ORDERS THE WAVES: the N = 1 remedy is to stop requiring a
container for a single submission, and it precedes everything else**, including
incremental delivery. `docs/a39-research.md:828` (M4's objection bullet)
reaches the same ordering from the outside view - "It should never be scheduled
ahead of M1 or M2" - which is corroboration, not the argument.

### 2.1 An interaction count measures a path the user has already found

`docs/a17-discovery.md` section 5 establishes a limit that binds every number
in the census. Its class is **an affordance RELOCATED rather than ADDED, with
the user's prior path closed and no instrument able to notice**; it traced one
shipped, fully wired feature that read as ABSENT to the person who built it.
**Its true interaction count is infinity while every instrument in this repo
reports two clicks.**

So the census's crossover table is valid ONLY for a path the instructor has
already found. The chat has **no discovery cost at all**.

Two of that pass's generalisations land on this design:

- **One act, five names** (`a17-discovery.md` 5.1): the "make this again" act is
  spelled `Regenerate`, `Regenerate announcement`, `Redraft`, `Redraft every
  reply` and a computed label across five files, two of them in the same
  12-entry sub-tab strip.
- **The layout precondition is the house default** (5.2): 79 of 82 component
  files with a multiline TextField let it auto-grow, so "an action control
  beneath unbounded content" is the default shape here.

**RULING 31 corrects revision 1's mechanism for the second one, and I accept
the correction in full.**

```
grep -n "minRows\|maxRows" src/app/components/GradingTab.tsx src/app/components/CartridgeDropPanel.tsx
```

```
src/app/components/GradingTab.tsx:297:                minRows={10}
src/app/components/GradingTab.tsx:313:                  minRows={10}
src/app/components/CartridgeDropPanel.tsx:409:            minRows={4}
```

`minRows` is a MINIMUM, so `GradingTab.tsx`'s two fields (`:295-306`,
`:311-322`) are **already ten rows tall when empty**. Restoring a rubric does
not make them tall; it makes them non-empty. Revision 1's stated urgency was
false. The `maxRows` cap is still correct - a restored 40-line rubric grows
them without bound - but the argument is "unbounded growth on a restored
value", not "the fields become tall".

**The real instance of the fold defect is one file over, on a surface wave 2
writes and revision 1 did not cap:**

```
awk 'NR>=402&&NR<=460' src/app/components/CartridgeDropPanel.tsx
```

`multiline minRows={4} fullWidth` at `:407-416` with **no `maxRows`**, and a
`Button` reading "Turn on auto-grading" at `:451-458`, BELOW it. Wave 2
persists a rubric into that field and deletes `setRubricText("")` at `:220`, so
content this design adds pushes a control this design did not add further down.
**Wave 2 caps all THREE fields**, and W2-7 asserts all three.

### 2.2 The naming contract, the placement contract, and an instrument for both

**THE NAMING CONTRACT.** Each act gets ONE name, fixed here so no wave invents
a sixth spelling:

| Act | The one name | Every surface that must use it |
|---|---|---|
| supplying work to be graded | **"Submissions"** | `GradingTab.tsx:232` label (already), the widened copy at `:240`, any later intake surface |
| supplying the scoring criteria | **"Rubric"** | `GradingTab.tsx:310` (already), `CartridgeDropPanel.tsx:406` (already), `RubricInputModal.tsx`'s opener (already), `SnapshotGradingPanel.tsx` |
| starting the run | **"Start Review"** | `GradingTab.tsx:343-356` (already) - **not renamed by any wave** |
| stopping the run | **"Stop grading"** | the new cancel control (4.5) |
| the rubric a run used | **"Rubric used"** | `RubricProvenance.tsx`, matching `useRepoGradesBulkGrade.ts:89`'s existing `Rubric used: ` string rather than inventing a synonym |

**THE PLACEMENT CONTRACT, stated ONCE and binding on every later section.** No
control this design adds may sit below unbounded content. Concretely: **the
progress line, the "Stop grading" control and the "Rubric used" line all render
in `GradingTab.tsx`, ABOVE the `<GradingResults` mount at `:426-427`, in DOM
order.** The results table is the unbounded content here, exactly as the draft
body was in A17.

**RULING 28's first point is accepted, and it is section 6.4 that was wrong,
not the contract.** Revision 1 simultaneously bolded this contract and mounted
`RubricProvenance.tsx` inside `GradingResults.tsx` - which is inside the
results region. The mount moves to `GradingTab.tsx`. `GradingResults.tsx`
leaves wave 2's write set entirely, taking its 18 source-text readers with it.

**THE INSTRUMENT, and its honest limit.** `a17-discovery.md` 5.4's finding is
that "a green suite in this repo is evidence about logic and silence about
findability". True, and not pretended otherwise. What IS buildable is a
source-text ORDERING assertion, and
`autoGradeTransition.wiring.test.ts:167,194` already reasons by `indexOf` over
stripped source. **Every such assertion in this document is stated as a PAIR -
a presence assertion first, then the comparison** - because `indexOf` returns
`-1` for an absent literal and `-1` is less than every index, which is how
revision 1's W2-7 passed by construction (RULING 28). It pins DOM order and a
height cap. **It cannot catch a label the instructor does not recognise, and it
cannot catch a control hidden by CSS.** Those stay with the owner
(RES-A39A-14).

**What this document does NOT design.** The full paste/drop intake primitive of
research M3 is out. Its four correctness traps (research 2.2: synchronous
harvest of `dataTransfer.items` before the first await; the `readEntries()`
drain loop, since Chromium yields 100 of 120 and reports success;
`webkitGetAsEntry().isDirectory` rather than `kind`; and the WCAG 2.2 SC 2.5.7
single-pointer alternative, which **must not be deleted**) all fail only in a
real browser. Wave 1 takes only the part of M3 that is pure, server-side and
testable as a plain `.ts` leaf: accepting a single non-zip file through the
existing `<input type="file">`. The rest is RES-A39A-6.

---

## 3. The leverage claim, rebuilt on measured output

Per `docs/loop/leverage.md`, a claim names a MECHANISM, says what the user does
instead today and what it costs them, and is proven by ONE criterion that goes
RED when the advantage is REMOVED.

**The claim is NOT "the app remembers your rubric."** That is falsified
(research 5.3: Anthropic Projects carry persistent per-project instructions and
uploaded knowledge). DECISION 3 says so itself: "persistence alone is not
leverage ... If the rubric is persisted without recording which version graded
which submission, this decision buys convenience and no leverage at all."

### 3.1 The false absence that sat under this section, corrected

Revision 1 wrote that `grep -rn "rubricUsed\|rubricFingerprint" src` "returns
nothing today (canary: `rubricAreaNames` returns 47 lines)". Both halves were
wrong and neither command had been run. Re-run, unfiltered, never through
`head`:

```
grep -rn "rubricUsed\|rubricFingerprint" src | wc -l                      -> 30
grep -rn "rubricAreaNames" src | wc -l                                    -> 140
grep -rn "rubricUsedZZZNoSuchThing\|rubricFingerprintZZZNoSuchThing" src   # canary, exit 1
```

The 30 lines, by file and by kind:

| File | Lines | What they are |
|---|---|---|
| `src/app/components/repo-grades/useRepoGradesBulkGrade.ts` | 9 (`:118,129,130,160,161,272,296,308,402`) | `RubricAttemptResult.rubricUsed: string \| null` - a **transient hook-internal return value**, consumed at `:160-161` to set `sharedRubric` and discarded. It never reaches a `GradeResult` or a `GradingRun` |
| `src/app/components/repo-grades/useRepoGradesBulkGrade.test.ts` | 5 | fixtures for that return value |
| `src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts` | 7 | source-text fixtures quoting that same shape |
| `src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts` | 2 | a pinned signature string |
| `src/lib/research/rubric-bank.ts` | 2 (`:28`, `:70`) | `export function rubricFingerprint` at `:28`; used at `:70` as `id:` in a `rubric_bank` upsert |
| `src/lib/research/rubric-bank.test.ts` | 5 | its unit test |

**What this changes, and what it does not.** `rubricFingerprint` is a shipped,
tested, durable content hash - which is GOOD for the design (section 5.2
extracts it rather than inventing one) and fatal to the sentence "no comparable
module has this for free". The narrower claim the tree supports is measured
separately and holds:

```
grep -rn "rubricUsed\|rubricFingerprint" src/lib/grade src/app/actions \
  src/lib/github-grading-run-store.ts src/lib/grading-drafts.ts     -> exit 1, no output
grep -rn "rubricAreaNames" src/lib/grade src/app/actions \
  src/lib/github-grading-run-store.ts src/lib/grading-drafts.ts | wc -l   -> 40   (canary)
```

**No run object in this app - not the in-memory `GradingRun`, not either
persisted form - carries the rubric it was graded against or that rubric's
identity.** That is the sentence CLAIM 1 is built on, and it is the one that
was actually measured.

### CLAIM 1 - VERSION PROVENANCE (class: GUARANTEED, earned)

**MECHANISM.** Every `GradingRun` carries `rubricUsed` (the exact text every row
was graded against) and `rubricFingerprint` (its content hash, computed
server-side by `rubricFingerprint`, extracted from
`src/lib/research/rubric-bank.ts:28-30`). Both are stamped at the engine's
result-carrying return site and are **read back from the run, never re-derived
from the store**. Editing the stored rubric afterwards cannot change what a
past run reports.

**WHAT THE USER DOES INSTEAD TODAY.** Puts the rubric in a chat project's
instructions or knowledge. **WHAT IT COSTS THEM:** project instructions can be
edited at any time with no record of what was in force when a given answer was
produced, so the instructor cannot answer "which rubric produced this grade"
for a grade a student is appealing.

**EARNED, not inherited - the argument as it now stands.** The hash function
exists and is reused, not built. What is built is the BINDING of a rubric
identity to a run OBJECT that survives persistence, which the two greps above
show exists nowhere. Path E's `Rubric used:` string is an activity-log line
emitted on one of four branches and never read back (0.3), so it is not this.

**THE REMOVAL TEST** (`src/lib/grade/rubricProvenance.test.ts`, W2-3). STATE THE
DELETION: make `describeRunRubricProvenance(run, store)` read the CURRENT store
instead of `run.rubricUsed`/`run.rubricFingerprint`. TRACE THE ASSERTION: the
test builds a fixture run, mutates the store's rubric text, and asserts the
run's reported fingerprint is unchanged. With the deletion, the observed
fingerprint becomes the store's new one, so the assertion's value changes.

**AND THE HALF THE CHECK FOUND MISSING (RULING 27).** A claim about a DURABLE
record is false if the record does not survive persistence. Section 6.4 binds
the claim to BOTH rebuilders and to the existing allowlist-coverage test, and
W2-4 is its instrument. Without that, this claim ships in memory and quietly
dies at the first reload.

### CLAIM 2 - PER-SUBMISSION ISOLATION UNDER IDENTICAL TERMS (class: SCALE, earned)

**MECHANISM.** One grading run resolves ONE rubric string and ONE ordered
criteria list **before any submission is graded**, and every one of the N model
calls receives that identical pinned text in its own isolated request carrying
exactly one submission.

**WHAT THE USER DOES INSTEAD TODAY.** Attaches forty files to one chat message.
**WHAT IT COSTS THEM:** that is not forty gradings. Submission 20 sits at the
position research 5.1 sources as the worst-served (Liu et al., TACL 2023, arXiv
2307.03172), competing with 39 others for attention.

**EARNED, not inherited - narrowed by the path-E trace (0.2).** The engine
already pins criteria for a batch (`engine.ts:197-198`), and path E already
pins a rubric string for a bulk run. **Neither is what this claims.** Path E's
`establishSharedRubric` fires only on a blank rubric (`:459`), pins
RETROSPECTIVELY from the first target that succeeds, and pins no criteria list;
so on path E the first graded submission is graded against a rubric that did
not exist when the run began. The design's own new seam is the one place the
property could be lost, and the only per-submission entry point in the tree
today loses it (`grading.ts:633-635` regenerates a rubric inside the per-call
body). **Resolution before call 1, of both the rubric and the criteria list, is
the thing being built.**

**THE REMOVAL TEST** (`src/app/components/grading/incrementalRunPlan.test.ts`,
W4-3). STATE THE DELETION: remove `pinned.rubric` from the request
`buildRunItemRequests` constructs, so each item call arrives with an empty
rubric. TRACE THE ASSERTION: the test builds a plan over three tickets and
asserts `new Set(requests.map(r => r.rubric)).size === 1` AND that the single
member is byte-identical to `pinned.rubric` AND that
the same Set test over each request's `criteriaNames` joined on a separator no criterion name can contain. With
the field deleted the observed set is `{""}` - size 1, but the second half's
value changes.

### What I am NOT claiming

Incremental delivery (section 4) removes a DEFICIT; it is not leverage.
Persisting the rubric (section 6) is CLICK-COST, which `leverage.md` struck as
non-categorical - section 6.3 names it as click-cost rather than dressing it up.
Write-back is not claimed at all (research 5.4: community MCP servers document
`grade_submission` against a personal access token).

---

## 4. Seam 1: incremental delivery, which is the same change as survival

### 4.1 The ruling, rewritten under DECISION 6

**A client-driven bounded-concurrency pool over a per-item ROUTE HANDLER at
`maxDuration = 60`.** Revision 1's table made "Route Handler with maxDuration"
and "client pool" mutually exclusive rows. They are not, and the owner has
settled it. The table is rewritten, not annotated:

| Candidate | Delivers row 1 early? | Clock resets per call? | Ceiling declared? | Precedent here |
|---|---|---|---|---|
| One Route Handler for the whole run, `maxDuration = 60` | No - one terminal response | No | Yes | Four instances (1.2) |
| Streamed NDJSON/SSE | Yes | No - one invocation still dies at its cap | Yes | **None** (1.3, with canary) |
| Client pool over a per-item **Server Action** | Yes | Yes | **No** - `ask/route.ts:48-59` says a Server Action reached from `page.tsx` has no declarable ceiling | `useRepoGradesBulkGrade.ts` |
| **Client pool over a per-item ROUTE HANDLER at 60** | **Yes** | **Yes** | **Yes** | pool: `useRepoGradesBulkGrade.ts`; handler: `class-trends-insight/route.ts` |

Only the last has all three. The pool resets the clock; the handler declares
the ceiling.

**What happens when one item does not finish inside 60s, which is the reason
this shape was chosen.** A platform kill produces **no response at all**, not a
worded error - `class-trends-insight/route.ts:39-45` states exactly this: the
kill "cannot be intercepted from in here, so it produces no response at all".
So the handler carries a SOFT budget under the hard one, copied from that file
(`TOTAL_BUDGET_MS = 50_000` at `:47`, with a reserve at `:51`), and returns a
worded 504 of its own. Either way - worded 504 or a dead socket the client's
`.catch` sees - **the failure is ONE row, reported as a failed row, and the
other 39 keep going.** Today's whole-run path loses all 40.

### 4.2 The contract

**`src/lib/grade/reconcile.ts`** - PURE, imports only `./types` and `./rubric`.

```
export function reconcileRun(
  rawResults: readonly GradeResult[],
  criteriaNames: readonly string[]
): { results: GradeResult[]; rubricAreaNames: string[] };
```

Extracted from `engine.ts:332-393` with ONE change of shape: it is a
**PROJECTION, not a mutation**. It reads each row's model-returned areas and
RETURNS new rows; it never writes `result.rubricAreas` (`:373`) or
`result.overallComment` (`:371`) in place. Section 5.1 is why.

**`src/app/actions/grading-incremental.ts`** - new `"use server"` file. New
rather than an addition to `grading.ts` for the ceiling reason in 5.3 and the
concurrent-writer reason in 0.8.

```
export type GradingRunTicket =
  | { kind: "canvas"; canvasUrl: string; userId: number; student: string }
  | { kind: "inline"; entry: StudentSubmissionEntry };

export type PinnedGradingContext = {
  assignmentInstructions: string;
  rubric: string;              // the RESOLVED text, never blank
  rubricFingerprint: string;   // rubricFingerprint(rubric), server-computed
  criteriaNames: string[];     // extractRubricCriteria(rubric).map(c => c.name)
  pointsPossible: number | null;
  provider: LlmProvider;
};

export async function prepareGradingRunAction(
  formData: FormData
): Promise<
  | { mode: "incremental"; pinned: PinnedGradingContext; tickets: GradingRunTicket[];
      generatedRubric?: string; warnings?: string[]; speedGraderUrl?: string | null }
  | { mode: "whole-run"; reason: string }
  | { error: string }
>;
```

`prepareGradingRunAction` stays a **Server Action** - it receives the zip
`FormData` and needs `experimental.serverActions.bodySizeLimit: "10mb"`
(`next.config.ts`), and it is covered by `action-guard-coverage.test.ts`. It
does once, before any grading call, everything the run must not do N times:
`requireUser()`; extract entries (`extractStudentEntries`, `extraction.ts:134`,
for a zip; `extractCanvasEntries`, `:146`, for a URL); resolve the rubric
(`rubric.trim() || await generateRubric(...)`, the same branch
`grading.ts:864-866` runs today); compute `criteriaNames` with
`extractRubricCriteria` (`rubric.ts:27`, pure and synchronous); and compute
`rubricFingerprint`.

**`src/app/api/grade-run-item/route.ts`** - new **Route Handler**, the per-item
call. Modelled line for line on `src/app/api/class-trends-insight/route.ts`:

```
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// body: { ticket: GradingRunTicket; pinned: PinnedGradingContext }
// 200 { results: GradeResult[] } | 4xx/5xx { error: string }
```

It calls `gradeEntries` (`engine.ts:457`) with a **single-element array** and
the pinned rubric. It contains **no `generateRubric` call and no
`fetchCanvasMeta` call** - the constructed prevention of the
`grading.ts:633-635` defect, pinned by W4-4.

The client reaches it exactly as `ClassTrendsPanel.tsx:98-109` reaches its
route: `fetch(GRADE_RUN_ITEM_ROUTE, { method: "POST", headers: {
"Content-Type": "application/json" }, body: JSON.stringify(...) })`, with the
transport rejection caught.

**`src/app/components/grading/incrementalRunPlan.ts`** - PURE, client-safe, no
server imports. Holds `buildRunItemRequests`, `mergeArrivedResults`,
`INCREMENTAL_CONCURRENCY = 3` (matching `BULK_GRADE_CONCURRENCY`,
`repoGradesBulkGrade.ts:143`) and `ITEM_REQUEST_BYTE_BUDGET` (4.4). This leaf
exists so claim 2's removal test has a testable object.

**`src/app/components/grading/useIncrementalGradingRun.ts`** - the pool, PORTED
from `useRepoGradesBulkGrade.ts` per 0.1: a `useRef` run lock
(`:216,228,234-247`), a shared cursor with `INCREMENTAL_CONCURRENCY` workers
(`:466-478`), per-item `.catch` mapping a transport rejection to the same
`{ error }` shape (`:291`), `finally`-released state. It adds cancellation
(4.5), which that hook lacks.

### 4.3 The security surface the Route Handler creates, which is the design's and not a detail

**A Server Action is dispatched by Next through its own id and origin
machinery. A Route Handler is reachable by anything that can reach the
origin.** Everything the action gave for free is re-established explicitly, and
each item below is a line in the handler with an instrument, not a note.

1. **AUTH.** `await requireUser()` from `@/lib/supabase/auth` is the FIRST
   statement of the handler body, before the body is read, returning `401` on
   throw - `class-trends-insight/route.ts:97-99` verbatim. `requireUser`, not
   `requireOwner`: `action-guard-coverage.test.ts:65-68` records that
   `requireOwner` is now a bare alias for `requireUser`, so a comment claiming
   an owner check would be false.
2. **CSRF FLOOR.** The handler **rejects any request whose `content-type` is
   not `application/json`**, with `400`. This is not decoration: a
   cross-origin HTML form cannot produce that header (it is not a
   CORS-safelisted value), and a cross-origin `fetch` that sets it triggers a
   preflight this app answers with no CORS headers. Three routes here already
   read the header this way - `parse-calendar/route.ts:14`,
   `prose/route.ts:20`, `research/route.ts:30`.
3. **INPUT VALIDATION.** `pinned` and `ticket` arrive from the client and are
   spent on model calls, so they are validated as untrusted input, not
   destructured: `rubric` non-empty and length-bounded, `criteriaNames` an
   array of strings, `provider` through `normalizeProvider` (already imported
   by `class-trends-insight/route.ts:4`), `ticket.kind` one of the two
   members, and the whole body rejected with `400` otherwise. A malformed body
   must never reach `gradeEntries`.

**A CORRECTION TO DECISION 6's own wording, reported rather than silently
adopted.** DECISION 6 says "the action-guard coverage test that pins the
guarded surface list is in the write set." Measured, **that test cannot see a
Route Handler at all**:

```
awk 'NR>=118&&NR<=143' src/app/actions/action-guard-coverage.test.ts
```

`collectActionExports` skips every file for which `isUseServerModule(text)` is
false (`:123`). A Route Handler is not a `"use server"` module, so the ratchet
would be green whether or not the new handler has a guard.

So the file IS in wave 4's write set - it binds `prepareGradingRunAction`,
which is a Server Action and is covered - and **W4-10 is the instrument that
actually binds the handler**: a source-text assertion in the route's own test
that the module contains `requireUser(`, that its index is less than the index
of the first `gradeEntries(` occurrence, and that the module contains a
`content-type` check. Presence is asserted before either comparison.

The wider gap is measured and filed, not fixed here:

```
find src/app/api -name "route.ts" | wc -l                                   -> 20
for f in $(find src/app/api -name "route.ts"); do
  grep -q "require\(Owner\|User\|AppOwner\)(" "$f" || echo "UNGUARDED $f"; done
```

12 of 20 route handlers call no guard (cron, webhooks, OAuth callbacks, and
`ai-chat`, `prose`, `research`). A repo-wide route ratchet with a 12-entry
allowlist is a real instrument and a scoping question, not a wave-4 line:
**RES-A39A-17**.

### 4.4 Where the submission content lives, and the budget DECISION 6 moved

- **Canvas (B/C)**: the ticket is `{canvasUrl, userId, student}` - a few dozen
  bytes. The server re-derives the submission, as `grading.ts:607` already
  does. **No content crosses the client.**
- **Zip (A)**: entries can only be produced by opening the archive
  server-side (`extraction.ts:117` uses `JSZip.loadAsync`;
  `office-extract.ts:179` needs `officeparser`, which `next.config.ts` pins as
  a `serverExternalPackages` entry). So `prepareGradingRunAction` returns the
  entries and each item call sends ONE back.

Three measured facts make that acceptable rather than a hidden cost:

1. **Not a new exposure class** - 1.6: every submitted byte already reaches the
   browser on every attended run today.
2. **Linear, not quadratic** - the corpus comes down once and goes back up
   once, split across N calls. The zip is never re-uploaded.
3. A server-side cache keyed by run id, which would remove the upload entirely,
   is **REJECTED on the record**: this deployment has no request-affinity
   guarantee, so an in-memory map is unreliable across invocations, and the
   only durable store is the database this checkout cannot reach. Rejected for
   a reason, not overlooked.

**AND THE CONSEQUENCE OF DECISION 6 THAT THE DECISION DOES NOT MENTION.**
Revision 1 rested the per-item byte budget on
`next.config.ts`'s `experimental.serverActions.bodySizeLimit: "10mb"`. That key
governs **Server Actions only**. Moving the per-item call to a Route Handler
takes the request off that configured budget and onto the platform's own
request-body cap for a serverless function, **which is not declared anywhere in
this repo and which I cannot measure in this checkout** (no deployment, no
network).

I am not guessing it, and the design does not depend on it:

- `ITEM_REQUEST_BYTE_BUDGET` is **the design's own named constant in
  `incrementalRunPlan.ts`**, deliberately conservative and NOT derived from
  `bodySizeLimit`, with the reason in a comment beside it.
- `buildRunItemRequests` measures each request's serialized length, and
  `prepareGradingRunAction` returns `{ mode: "whole-run", reason }` when any
  single entry exceeds it - sending that run down today's existing Server
  Action path, which still has the declared 10 MB.
- **DIRECTION OF FAILURE, stated rather than discovered later: a run in which
  every image-bearing submission fails transport and every text submission
  succeeds, with each failure isolated by the `.catch` into an ordinary failed
  row so the run reports complete.** That is what the budget check exists to
  make impossible, and it is why `mode: "whole-run"` is in the contract rather
  than a later patch.
- The real platform cap is **RES-A39A-3**, owner-measurable, with a step.

### 4.5 Ordering, the not-yet-reached row, and cancellation

**ORDERING.** The pool is unordered by construction, so rows arrive out of
order, and a row moving under the reader's cursor is worse than a late row. So
`prepareGradingRunAction` returns tickets in the source order the engine would
have used, and `mergeArrivedResults(tickets, arrived)` returns the **dense,
`sourceIndex`-ordered projection of the rows that have ARRIVED**. A row never
moves; it only appears. `GradingResults.tsx` already sorts through
`useResultsSort`, so the instructor's own sort is unaffected.

**THE ROW NOT YET REACHED: THERE IS NONE. RULING 30 IS ACCEPTED IN FULL AND
REVISION 1'S "LARGEST REUSE" IS WITHDRAWN.**

Revision 1 proposed rendering a pending row as `UngradedResult` with
`{ kind: "not-attempted", stoppedBy: "run-deadline" }`. Measured, that is the
A31 defect reproduced inside its own fix:

```
awk 'NR==195' src/lib/grade/types.ts
  "run-deadline": "Not graded: this run's time budget ran out before this submission was started.",
awk 'NR>=147&&NR<=160' src/lib/grade/engine.ts
  buildUngradedRow: const strengths = outcome.message;  (:153)
awk 'NR>=48&&NR<=60' src/app/components/grading-results/ungradedDisclosure.ts
```

`strengths` renders in an EDITABLE textarea, and
`ungradedDisclosure.ts:48-60` records that a stale seed written into
`ta-grading-results-edits:${canvasUrl}` "crosses to the other, keyed by bare
student name", with a four-entry `RETIRED_NOT_ATTEMPTED_MESSAGES` allowlist
(`:55-60`) built to clean up the last time this happened. During a live run of
40, up to 39 rows would simultaneously assert the run's time budget ran out, in
a field the instructor can edit, that can outlive the run. **A31 Ruling 1
binds: a sentence may assert only what holds on every caller and every
reachable state.**

**THE RULING: a pending submission produces NO ROW AT ALL.** The accumulator
holds arrived rows only; the run handed to `GradingResults` contains arrived
rows only; **the outstanding count lives in the PROGRESS LINE above the results
region**, which is where 2.2's placement contract already puts it. Zero new
discriminant, zero new copy sheet entry, zero rows that can carry a false
sentence into `ta-grading-results-edits`.

**And this dissolves revision 1's RES-A39-4 rather than carrying it.** Wave 4
is NOT the fifth writer of `stoppedBy: "run-deadline"`; it adds no writer at
all. That is not an assumption - W4-6 asserts it with the same grep A31 named.

Cost, stated: the instructor cannot see WHICH students are outstanding, only
how many. That is a real loss against revision 1's shape and it is accepted,
because the alternative is a false sentence in an editable box. **RES-A39A-19**
carries it with an owner and a step.

**PARTIAL FAILURE.** Per item, isolated, exactly as
`useRepoGradesBulkGrade.ts:272-297`: the handler returns `{ error }` rather
than throwing, and the call site's `.catch` maps a transport rejection onto the
same shape. A failed item becomes a `grading-failed` row carrying
`GRADING_FAILURE_PREFIX` - the member `engine.ts:257-270` already builds. One
failure never aborts the pool.

**CANCELLATION.** A `cancelledRef` checked by `runWorker` at the top of each
iteration, **before it claims the next index**. Four properties:

- It **stops further spend** - each un-started item is one model call not made
  - so it is added without a confirmation and does not trade away the earned
  one (4.9).
- It **keeps every row already graded**, and at most
  `INCREMENTAL_CONCURRENCY - 1` items are in flight when it is pressed; those
  complete and their rows are kept. **This is what makes the end-of-run
  sentence true**: when the last worker exits, every ticket is either arrived
  or never started, with nothing in between.
- The end-of-run line is therefore `"Stopped. N of M submissions were graded;
  the rest were not started."` - run-level, not per row, **not editable and not
  persisted**, and true on every reachable state by the mechanism above.
- It **never leaves the lock held**, released in the same `finally`
  `useRepoGradesBulkGrade.ts:234-247` uses, which that file's header records
  was added because a rejecting fetch once left a run stuck.

Cancel is a transient run control, not a setting, so it carries no `ta-` key.
**Its placement is fixed by 2.2 and is not a wave-level choice**: "Stop
grading" and the progress line render in `GradingTab.tsx` above the
`<GradingResults` mount. W4-8 is the ordering assertion.

### 4.6 THE DISPATCH SEAM, specified as a mechanism (RULING 29)

This is the money defect, and revision 1 stated a constraint where a mechanism
was owed. Measured wiring:

```
grep -n "formAction\|handleAutoGrade\|pending" src/app/components/GradingTab.tsx
awk 'NR>=225&&NR<=250' src/app/components/GradingTab.tsx
awk 'NR>=340&&NR<=360' src/app/components/GradingTab.tsx
awk 'NR>=58&&NR<=70' src/app/page.tsx
```

- `GradingTab.tsx:29-30`: `formAction` and `pending` are **PROPS**. They come
  from `src/app/page.tsx:63`,
  `const [state, formAction, pending] = useActionState(gradeAction, initialState)`.
- `:228`: `<form className={styles.form} action={formAction}>`.
- `:148`: the one `formAction(fd)` call, inside `handleAutoGrade`'s transition.
- `:347`: `disabled={pending || (source === "canvas" && !canvasRetrieved)}`.

Revision 1 kept `action={formAction}` live while saying the run is intercepted
in the hook. Nothing suppresses the whole-run dispatch, and `pending` - owned
by a `useActionState` in a different file - **stays false for an incremental
run, so Start Review is never disabled**. Two presses, two runs, twice the
spend. A26 already shipped a lock in this codebase for that exact class.

**THE SEAM, exactly.**

1. **`action={formAction}` is DELETED from the `<form>` at `:228`.** The form
   no longer auto-dispatches anything. This is the single line that closes the
   double-spend; nothing else in this section works without it.
2. The form gains `onSubmit={handleStartReview}`, whose first statement is
   `event.preventDefault()`.
3. `handleStartReview` reads a `startLockRef` (`useRef(false)`) **before doing
   anything else**; if claimed, it returns. This is the second-press refusal,
   and it is a ref and not state for the reason
   `useRepoGradesBulkGrade.ts:196-208` gives verbatim: a ref's `.current` is
   read live from every render's closure, so the refusal is a property of the
   code rather than of which render is mounted.
4. It builds `const fd = new FormData(event.currentTarget)` - reachable now
   precisely because the dispatch is ours.
5. It calls `routeGradingRun(fd, selectedProvider, pickedFileSize)`, a PURE
   function in `incrementalRunPlan.ts` returning `"incremental" | "whole-run"`
   **synchronously**, from data the client already has: provider
   (`"other"`/`"embedded"` route whole-run, 4.8) and the picked file's `.size`
   against `ITEM_REQUEST_BYTE_BUDGET`.
6. On `"whole-run"` it calls `formAction(fd)` inside a `startTransition`. On
   `"incremental"` it calls `prepareGradingRunAction(fd)` and starts the pool.
7. **The button's disabled expression becomes
   `disabled={pending || incrementalRunning || (source === "canvas" && !canvasRetrieved)}`**,
   where `incrementalRunning` is the hook's own state. This is the visible half
   of the refusal; the ref in step 3 is the real one.

**WHAT THIS DOES TO A5, stated here rather than deferred into the wave.**
`/formAction\(/` now matches **twice** in `GradingTab.tsx`: `handleAutoGrade`'s
call at `:148` and the whole-run fallback in step 6. **A5 changes in wave 4, in
the same commit, to: every `formAction(` occurrence lies strictly inside a
`startTransition(` paren span, and there are exactly two.** That is A5's actual
purpose (A2's own wording is "formAction( is called exactly once ... strictly
inside it") generalised rather than weakened, and it is strictly stronger than
a bare count because it constrains WHERE each call is, not just how many there
are. The reason is recorded in the test file in the same commit.

**A6 is NOT touched.** Its satisfying span is `GradingTab.tsx:188-200`, the
`styles.loadingState` JSX expression container; the button at `:347` and the
new progress region are both outside it. The progress line is a SEPARATE
sibling region and must not be folded into that span, because adding `||`
anywhere inside it fails A6 (`autoGradeTransition.wiring.test.ts:183`).

**THE INSTRUMENT - W4-9 - PRESSES TWICE.** Not an assertion that a flag is set.
Ported from `useRepoGradesBulkGrade.lifecycle.test.ts` (0.1), whose `vi.hoisted`
slot-based `useState`/`useRef` stubs (`:28-56`) and `vi.mock("react", ...)`
(`:58`) already drive exactly this case at `:329` and `:353`. The test calls
`handleStartReview` twice with no tick between, against spies for
`prepareGradingRunAction`, the item fetch and `formAction`, and asserts **the
total dispatch count across all three is 1**. Sabotage to prove it can fail:
delete the `startLockRef` check, watch the count become 2, restore.

### 4.7 What replaces the 1.2s spacer (RULING 31)

Under this design `gradeEntries` is called with a single-element array, so
`engine.ts:277`'s `i < limitedEntries.length - 1` is never true and **the
1200ms sleep never fires** (`DEFAULT_INTER_REQUEST_DELAY_MS = 1200`,
`gemini.ts:67`). Concurrency simultaneously rises from 1 to
`INCREMENTAL_CONCURRENCY = 3`. Deleting a spacer and tripling parallelism in
the same wave is two changes wearing one name, and revision 1 said nothing
about the second.

**What replaces it, in three parts.**

1. **The concurrency bound IS the in-flight control, and it is not new here.**
   Path E has run at `BULK_GRADE_CONCURRENCY = 3` with **no inter-request
   spacing at all** since A26 - `gradeRepoAction` grades one repo, so the
   engine's sleep guard is false there too. That is a measured production
   precedent for exactly this combination, on the same provider, and
   `repoGradesBulkGrade.ts:143`'s own comment is the reason the bound exists.
   `INCREMENTAL_CONCURRENCY` is set to the same 3, in the same shape, for the
   same stated reason.
2. **A rate-limited run must not report itself complete.** This is MAJOR 6's
   real objection and it survives the precedent. `classifyItemFailure(message)`
   is a PURE predicate in `incrementalRunPlan.ts` that separates a
   provider-throttle failure from an ordinary one, modelled on
   `canvas-throttle.ts:31-44`'s two named predicates and
   `code-runner.ts:445-448`'s message form. When **more than one** item fails
   that way, the run's own status line says so instead of leaving 40 ordinary
   failed rows and a complete run.
3. **DIRECTION OF FAILURE, which revision 1 owed and did not state: a run of 40
   in which every item returns a provider rate-limit error, each isolated by
   the `.catch` into an ordinary `grading-failed` row, and the run reported as
   complete.** That is strictly worse than today's all-or-nothing, which at
   least fails visibly. W4-11 is its instrument, over the pure predicate and
   the status line, because nothing here can produce a real 429.

RES-A39A-18 carries what this cannot settle: whether 3 is the right number
against the real provider quota is a production fact.

### 4.8 Why `mode: "whole-run"` stays in the contract forever

Four real states route to it: any single entry over `ITEM_REQUEST_BYTE_BUDGET`
(4.4); `provider === "other"`, which posts a whole base64 archive to an
external engine (`grading.ts:825-827`) and has no per-student decomposition;
`provider === "embedded"`, which grades in-process with no model call
(`grading.ts:832-857`) so incremental delivery buys nothing and `attachCodeRuns`
(`:849`) is already a pooled batch; and a `prepareGradingRunAction` that
returns zero tickets. Keeping the old path reachable is the correct answer for
four enumerated cases, not a hedge - and after 4.6 it is reached by an explicit
call rather than by a form that fires whatever happens.

### 4.9 The two constraints the brief will not let me trade

**PERSISTENCE.** Seam 1 adds no new persisted CONTROL. Cancel is a run action,
progress is derived, the accumulator is run state; nothing here survives a
reload. The constraint bites in seam 2 and is honoured there (6.5).

**THE EARNED CONFIRMATION.** "Start Review" (`GradingTab.tsx:343-356`) is the
single act that commits to N model calls. **It is not removed, not merged into
the file picker, and not made implicit.** Research 6.1 rules that a
confirmation on spend naming the amount is the one that is earned; this design
keeps it and makes it MORE informative rather than cheaper, because
`prepareGradingRunAction` returns `tickets.length` before any grading call is
made. Same one click, carrying a number it does not carry today.

---

## 5. What the seams cost, and the ceiling arithmetic

### 5.1 Why reconciliation must become a projection

`engine.ts:332-393` today MUTATES rows. If the incremental path called that
code after each arrival, it would re-run a mutation over already-mutated rows:

- When `extractRubricCriteria(rubric)` returns criteria, `canonical` is fixed
  before the loop and re-running is idempotent.
- When it returns NOTHING, `canonical` is derived from "the student the model
  gave the most areas" (`:337-344`) and that set **grows as rows arrive**. A row
  reconciled against a 3-name set has already had a stray folded into
  `overallComment` (`:371`) and deleted from `rubricAreas` (`:373`). If that
  stray later becomes canonical, re-running produces a row carrying the text in
  `overallComment` AND a blank column for the same criterion. **Today's
  whole-run output has neither.**

Two defensible fixes. Rejecting one on the record:

- **REJECTED: refuse the incremental path when `criteriaNames` is empty.** Sound
  and cheap, and it makes the divergence unrepresentable. Rejected because it
  silently routes exactly the rubrics that parse worst - the free-text ones an
  instructor is most likely to paste at N = 1 - back onto the blocking path,
  which is the path this row exists to fix.
- **ADOPTED: reconciliation becomes a PROJECTION re-derived from raw on every
  arrival.** `docs/loop/traps-spec.md:88-92` records this repo's own precedent:
  "the tombstone stopped being a RECORD and became a PROJECTION ... Prefer the
  construction that makes the banned state unrepresentable over the assertion
  that it is absent."

Cost: `O(N)` short-string comparisons per arrival, `O(N^2)` over the run, N
capped at `DEFAULT_MAX_SUBMISSIONS = 40` (`gemini.ts:32`). No model call, no
I/O.

**This is a change to a shared function and is NOT trivially revertible.**
`gradeStudentEntries` is reached by `gradeSubmissions` (`:403`), `gradeEntries`
(`:457`) and `gradeCanvasUrl` (`:473`), and through them by
`steps.grading-run.ts`, `steps.grading-draft-flow.ts` and
`steps.grading-cartridge.ts`. **The invariant wave 4 must hold:
`gradeStudentEntries` returns byte-identical results before and after.**

**RULING 28's second point is accepted: revision 1's instrument could not
deliver its own stated direction of failure.** Measured:

```
grep -c "rubricAreas\|canonical\|rubricAreaNames" src/lib/grade/engine.test.ts             -> 0
grep -c "gradeSubmissions\|gradeEntries\|gradeCanvasUrl\|gradeStudentEntries" \
        src/lib/grade/engine.test.ts                                                       -> 16  (canary: the instrument fires on this file)
grep -c "overallComment" src/lib/grade/engine.test.ts                                      -> 8
grep -c "rubricAreas\|canonical\|rubricAreaNames" src/lib/grade/engine.ungraded.test.ts    -> 20
grep -c "overallComment" src/lib/grade/engine.ungraded.test.ts                             -> 6
```

`engine.test.ts` asserts **nothing at all** about the reconciled fields.
`engine.ungraded.test.ts` touches them only structurally -
`toHaveLength(run.rubricAreaNames.length)` (`:120`), `score` is `""`
(`:106,:121`), `toEqual([])` (`:166`),
`map(a => a.area)).toEqual(run.rubricAreaNames)` (`:241`). **Nothing asserts
stray-folding into `overallComment`, the normalized-match renaming, or the
ORDER of reconciled areas.** So those two files are a REGRESSION FLOOR, not the
oracle, and W4-1 says so.

**THE ORACLE, with its capture step, which revision 1 omitted.** This repo's
`guard-before-migration` discipline is to freeze the oracle of the RESOLVED
output **from today's implementation, before the change**, and prove it catches
the worst failure mode. So wave 4's FIRST commit is: run today's
`gradeStudentEntries` over a fixture whose rubric parses to NO criteria and
whose rows disagree on area names (the `:337-344` branch), transcribe its
`results` and `rubricAreaNames` as a **frozen literal** into
`src/lib/grade/reconcile.test.ts`, and prove the literal catches the divergence
by asserting the double-reconcile case (W4-2) fails against it on the mutating
code. Only then does the extraction land. A literal authored by the wave that
writes the new function is a restatement; a literal captured from the old one
is an oracle.

### 5.2 The fingerprint has to move out of `rubric-bank.ts`

`rubricFingerprint` is at `src/lib/research/rubric-bank.ts:28-30` and depends
on `createHash` (`node:crypto`) and `cleanText` (`@/lib/embedded/scaffold`)
only. But the module also imports `getDbClient` and the Supabase `Database`
types (`:16-17`) and uses them at `:47-52,:70`, so importing it into
`engine.ts` would widen the engine's runtime import graph to include a database
client.

**So wave 2 extracts it**: `src/lib/research/rubric-fingerprint.ts` holds the
function, and `rubric-bank.ts` re-exports it so every existing caller -
including its own `id: rubricFingerprint(rubric)` upsert at `:70` and
`rubric-bank.test.ts` - is unchanged. A ten-line move, and
`src/lib/module-graph/runtime-import-graph.test.ts` is the instrument that says
whether the widening was avoided.

**Why the engine and not `grading.ts`**: stamping at the engine covers all five
entry points (zip, Canvas, entries, and the three unattended workflow steps
through them) and costs `src/app/actions/grading.ts` - which has a concurrent
writer (0.8) - nothing at all.

**And it is THREE sites, not one** (1.1): `engine.ts:395-399` (the
result-carrying return) plus the two empty-run returns at `:437` and `:489`,
which stamp `rubricUsed` as the resolved rubric and the fingerprint of it. A
claim that every run carries the pair is false on two returns otherwise.

### 5.3 Per-wave ceiling arithmetic

`LIMIT = 1000`, red at 1001 (`src/file-size-ceiling.structure.test.ts:41,138-144`).
**No overage entry is proposed anywhere below.**

| Wave | File | Before | Est. delta | Est. after | Wave gate |
|---|---|---|---|---|---|
| 1 | `src/app/actions/grading.ts` | **917** (905 earlier in this same session - 0.8) | +20 | 937 | **`-le 945`, re-derived at the wave against the real file** |
| 1 | `src/app/components/GradingTab.tsx` | 476 | +12 | 488 | -le 520 |
| 2 | `src/lib/grade/engine.ts` | 498 | +6 (three stamp sites, 5.2) | 504 | -le 520 |
| 2 | `src/lib/grade/types.ts` | 406 | +6 | 412 | -le 430 |
| 2 | `src/app/components/GradingTab.tsx` | 488 | +36 (memory, `maxRows` on both fields, the `RubricProvenance` mount) | 524 | -le 560 |
| 2 | `src/app/components/CartridgeDropPanel.tsx` | 544 | +16 (memory, and `maxRows` at `:409` - 2.1) | 560 | -le 600 |
| 2 | `src/lib/grading-drafts.ts` | 370 | +4 | 374 | -le 400 |
| 2 | `src/lib/github-grading-run-store.ts` | 501 | +4 | 505 | -le 530 |
| 2 | `src/lib/grade-result-allowlist-coverage.test.ts` | 298 | +40 | 338 | -le 380 |
| 2 | `src/lib/research/rubric-bank.ts` | 120 | -8 | 112 | must not rise |
| **3** | `src/app/components/grading-recording/GradingRecordingPanel.tsx` | **990** | **extraction FIRST, then +10** | **target <= 940** | **`-le 940` at 3a, `-le 955` after 3b** |
| **3** | `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | **970** | **extraction FIRST, then +14** | **target <= 940** | **`-le 940` at 3a, `-le 955` after 3b** |
| 3 | `src/app/components/grading-recording/RubricInputModal.tsx` | 375 | -7 policy +12 | 380 | -le 420 |
| 3 | `src/app/components/grading-recording/grading-rows.test.ts` | 733 | +20 (exact set + an A4d-shaped block) | 753 | -le 790 |
| 3 | `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | 822 | +26 (two keys + two A4d-shaped blocks) | 848 | -le 890 |
| 4 | `src/lib/grade/engine.ts` | 504 | **-45** | 459 | must NOT rise |
| 4 | `src/app/components/GradingTab.tsx` | 524 | +45 | 569 | -le 620 |
| 4 | `src/app/actions.ts` | 77 | +1 | 78 | - |
| 4 | `src/lib/grade.ts` | 19 | +2 | 21 | - |
| 5 | `src/app/components/GradingTab.tsx` | 569 | +10 | 579 | -le 620 |
| 5 | `src/app/components/LiveFeedPanel.tsx` | 719 | +16 | 735 | -le 760 |

**Revision 1's minor 12 is fixed: the post-feature gate is stated, not just
the 3a one.** 3a shrinks both panels to `<= 940`; 3b adds the feature and its
own gate is `-le 955`.

**Four files force structure.**

- **`GradingRecordingPanel.tsx` at 990 and `SnapshotGradingPanel.tsx` at 970.**
  Persisting a rubric on either is impossible without shrinking them first.
  **Wave 3's first commit is the extraction and no feature line lands in it.**
  The extraction target is chosen by that wave against the real file - and the
  940 figure is **provisional**, because this repo's own
  `modulesview-at-ceiling` memory records a dedicated agent sizing an
  extraction against the 1000 limit rather than the feature's additions and
  still leaving the file bigger. The wave re-derives it from what it can
  actually move, and the `+10`/`+14` feature figures are estimates too. What is
  FIXED is the SHAPE: a plain `.ts` leaf, never a `.tsx`, because nothing
  renders under vitest so logic in a `.tsx` cannot be tested at all
  (`docs/loop/this-repo.md` section 2). The directory has shipped examples
  (`useSnapshotKeyboardShortcuts.ts`).
  **AND THE KNOWN TRAP**: `docs/loop/this-repo.md:85-100` records that
  extracting a hook out of `SnapshotGradingPanel.tsx` typechecked and passed
  311 tests and then failed `npm run lint` with two new errors naming
  `handleNextStudentConfirm`, a callback touching none of the moved code -
  React Compiler's `preserve-manual-memoization`, not `exhaustive-deps`. The
  shipped workaround is to keep the ref and its effect declared in the panel
  and pass the ref into the new hook as a parameter. **`npm run lint` is a
  wave-3 gate, baseline 4 warnings / 0 errors** (`this-repo.md:78-83`).
- **`src/app/actions/grading.ts`.** 83 lines of headroom in the working tree,
  95 at HEAD, and a second writer in flight (0.8). Wave 1 may spend 20; waves
  2-5 may spend none - which is why the new action and the route handler go in
  new files. **RES-A39A-7.**
- **`src/app/components/GradingResults.tsx` at 906 takes NO edit in any wave**,
  because 2.2 moved the provenance mount to `GradingTab.tsx`. That removes 18
  source-text readers from wave 2's owns list.

The estimates are estimates. **The wave gate is `@(Get-Content <file>).Count`
on the real tree, never this table.**

---

## 6. Seam 2: the rubric is remembered, scoped, labelled and versioned

DECISION 3 settles the policy: drop it, persist the rubric. It names four
consequences, each with its own subsection.

### 6.1 Consequence 1 - delete the policy WHERE IT IS ASSERTED

Three places, all in wave 3's write set, and **a deletion is not enough - each
gets a replacement**, or the next pass re-derives the old rule from silence:

| Where | What is there now | What replaces it |
|---|---|---|
| `RubricInputModal.tsx:28-34` | "the text is handed to the caller via onSubmit and NOTHING here persists it - no localStorage, no persisted-control key of any kind ... nothing about it lingers once the instructor moves on" | a comment naming `docs/owner-decisions-2026-09-23.md` DECISION 3, the key (`ta-rec-grade-rubric`), the canary that now covers it (`grading-rows.test.ts:678-687`), the A4d-shaped wiring block (6.3), and the one surviving limit: the SHOT BYTES and the transcribed capture still do not persist, which was never the same question |
| `SnapshotGradingPanel.tsx:143-147` | the same, extended to `assignmentText` | the same, naming `ta-snap-rubric` and `ta-snap-assignment`, and preserving the file's own live distinction at `:150-157` (`instructorInstructions` persists because it is "not captured or transcribed material") - which is now the rule for the WHOLE file rather than an exception inside it |
| `snapshot-grading.structure.test.ts:195` and the comment at `:124-133` | the test's own NAME asserts the policy in prose: "U10 keeps shot bytes and rubric/assignment text out of localStorage"; the comment repeats it, running to `:132` | both rewritten to assert only what survives - shot bytes out, rubric and assignment text in - in the same commit as the key |

**DIRECTION OF FAILURE for this consequence:** a grep for the phrase over both
panel directories returning a line that still claims the rubric is not stored,
after wave 3. Instrument:
`grep -rn "persists it\|not persisted\|out of localStorage" src/app/components/grading-recording src/app/components/snapshot-grading`.

### 6.2 Consequence 3 - key it to something the app actually knows

**The defect DECISION 3 names is SILENCE, not reuse.** Reusing a rubric across
assignments is often exactly right; applying it without the instructor being
able to see that it happened is the defect. So the design answers it twice:
with a SCOPE KEY where the app knows one, and with a VISIBLE ORIGIN LABEL
always - including where it does not.

| Path | Scope the app knows at restore time | Key shape | Evidence it is known |
|---|---|---|---|
| A zip / single file | **NOTHING before a file is chosen.** `GradingTab.tsx:445` passes `assignmentName=""` to `GradingResults` with its own note that "no assignment name source of truth exists on this classic zip/canvas path" | `upload:<uploaded file name>` **after** a file is chosen; before that, **NOTHING IS RESTORED** (6.2.1) | the file input at `:234-239` is the only identity the surface ever acquires |
| B/C Canvas | the assignment URL, normalized | `canvas:<normalized url>` | `GradingTab.tsx:77` `canvasUrl` state, set before any retrieve |
| H cartridge | course label + assignment label | `cartridge:<course>\|<assignment>` | `CartridgeDropPanel.tsx:40,44` already restore both |
| E repo-grades | **unchanged**, not re-keyed | `ta-repo-grades-rubric` | RES-A39A-12 |
| F recording / G snapshots | **NOTHING, ever.** `GradingRecordingPanel.tsx:700`'s own copy: "Nothing here is bound to a student record or posted to an LMS" | a single last-used slot, always labelled | that line |

**6.2.1 THE RULING ON PATH A, rewritten under RULING 31.** Revision 1 restored
"the LAST-USED entry" into path A's rubric field before any file was chosen,
guarded by a label no pass condition required to render. Implemented as
written, an instructor opens Grading, last week's rubric is already in the
field, they upload this week's zip, press Start Review, and 40 submissions are
graded against the wrong rubric with every gate green. That is research M2's
own named failure mode - "silent and produces wrong grades that look right" -
reintroduced by the design that quotes it.

**Ruled: on path A, NOTHING is restored until a file is chosen.** The scope key
is `upload:<file name>`; the moment a file is picked, that scope's entry is
restored if it exists, and if it does not, the LAST-USED entry is restored
**with the origin label naming the scope it came from and when**. Cross-scope
reuse is therefore always attached to an act the instructor just performed, and
never present before it. If the field has been edited since restore, nothing is
swapped - overwriting typing is worse than a stale label.

`src/lib/grade/rubric-memory.ts` is a pure leaf holding a MAP from scope key to
`{ rubric, instructions, savedAt }` under one `ta-` key per surface, plus
`describeRubricOrigin(entry, requestedScope)`.

**6.2.2 The Canvas path, which revision 1 specified and no wave built.**
Revision 1 gave B/C a key shape in this table, left it out of the five-key
list, and filed no residual. Two measured facts make restoring there unsafe:

- `GradingTab.tsx:301,317`: `slotProps={{ input: { readOnly: source === "canvas" } }}`
  - on the Canvas path BOTH fields are READ-ONLY, so a restored value is one
  the instructor cannot correct.
- `GradingTab.tsx:308`: `{(source === "zip" || rubric.trim()) && (` - the rubric
  field does not render on Canvas unless `rubric` is non-empty, so restoring
  memory MATERIALISES a field that is not on screen today.

**Ruled: B/C Canvas is WITHDRAWN from seam 2, not deferred.** The Canvas
retrieve writes that field and the instructor cannot edit it; a stored value
would either be overwritten or would shadow the authoritative one, and no
precedence rule can be written without a UX decision about making the field
editable. **Enforcer it protected: none - it was never built.** Reviving it
requires first deciding whether the Canvas rubric field becomes editable, which
is outside this document's write set. This is why there are **four** new keys,
not five.

**Per-surface keys, and the canary each must bump:**

| Surface | Key | Exact-set canary | Wiring assertion |
|---|---|---|---|
| A | `ta-grading-rubric-memory` | **none exists** (1.9) - RES-A39A-11, question Q2 | - |
| H | `ta-cartridge-rubric` | **none exists** (1.9) - RES-A39A-11, question Q2 | - |
| F | `ta-rec-grade-rubric` | `grading-rows.test.ts:678-687` | an A4d-shaped block (6.3), **not** the `it.each` at `:718-732` |
| G | `ta-snap-rubric`, `ta-snap-assignment` | `snapshot-grading.structure.test.ts:196-202` | two A4d-shaped blocks, **not** the `toMatch` set at `:211-224` |

The key literal is spelled `ta-grading-rubric-memory` everywhere in this
document; revision 1 spelled it two ways.

**E is deliberately NOT re-keyed.** Re-scoping the Repo Grades rubric mid-run
would change the rubric a half-graded column is being graded against, and
`repoGradesUiState.ts:46-53` ties the single key to a one-course-at-a-time
assumption this document has not audited. **RES-A39A-12** carries it.

### 6.3 Consequence 2 - the RETRIEVAL interaction, and WHERE THE LEAF LIVES

Arithmetic in the census's own unit (focus + paste = ONE interaction):
re-pasting is **1**; restoring automatically into the field is **0**; picking
from a named library is **1**, which TIES a paste and therefore does not
satisfy the constraint on its own.

**THE RULING: auto-restore into the field, visibly, with no picker.** The field
IS the receipt. Research M2 names the failure mode to design against and says
the move "is only safe WITH the visible label, and a version that pre-selects
without showing what was selected is worse than the status quo. It must not be
softened into a confirmation dialog." A filled textarea plus the origin label
is that label; no confirmation is added and none removed.

**RULING 28's third point and MAJOR 4, both settled by the same choice. I pick:
THE LEAF STAYS in `src/lib/grade/rubric-memory.ts`; THE CANARIES CHANGE.**
Measured, the two mechanisms have different scopes (1.9): the exact-SET scan
reads raw directory source, so it SEES a key literal declared in the panel; the
WIRING assertion requires the `getItem`/`setItem` call inside the directory's
own text, and `src/lib/grade/` is in neither haystack. So:

- Each panel declares the literal itself -
  `const STORAGE_KEY_RUBRIC = "ta-rec-grade-rubric"` and the two `ta-snap-*`
  equivalents - which is what makes the exact-set scans bind. Those lists gain
  the new keys.
- The directory-local wiring lists (`it.each` at `grading-rows.test.ts:718-732`;
  the three `toMatch` blocks at `snapshot-grading.structure.test.ts:211-224`)
  **do NOT gain them**, because they would be unsatisfiable.
- Each new key instead gets a block modelled on
  `snapshot-grading.structure.test.ts:141-174` (the A4d block, written for
  exactly this problem when `ta-snap-table`'s real calls turned out to live in
  `assessment-shared/`): the panel declares the constant; the panel actually
  CALLS `rubric-memory`'s load/save with that constant, comment-stripped; and
  `rubric-memory.ts` passes its key parameter through to both
  `localStorage.getItem` and `localStorage.setItem`.

The alternative - moving the leaf into each surface's directory - would mean
four copies of the same logic (`components/` root, `CartridgeDropPanel`'s
directory, `grading-recording/`, `snapshot-grading/`) and is rejected for that
reason.

**Honest naming, per `leverage.md`'s struck "click cost" row: this is a
click-cost saving of exactly 1 interaction per assignment**, not integration and
not persistence-as-advantage. The leverage is claim 1.

**A named rubric library is WITHDRAWN, not deferred**: at 1 interaction it ties
a paste and fails this document's own metric. **Enforcer it protected: none; it
was never built.** Anyone reviving it owes the out-of-app find cost first
(section 10).

**One mechanic, because it has bitten this repo.** A `localStorage`-seeded
`useState` initializer never shows its restored value on an SSR'd surface; it
needs a mount effect - this repo's `persisted-details-open-hydration` memory,
and `SnapshotGradingPanel.tsx:159-160` says the same in source.

### 6.4 Consequence 4 - version provenance, and the parsers that would drop it

"If the rubric is persisted without recording which version graded which
submission, this decision buys convenience and no leverage at all."

- `GradingRun` gains `rubricUsed?: string` and `rubricFingerprint?: string`,
  stamped at all three engine return sites (5.2).
- `src/app/components/grading-results/RubricProvenance.tsx`, a pure leaf,
  states the fingerprint's short form, the scope it came from and when it was
  saved. **Mounted by `GradingTab.tsx` ABOVE the `<GradingResults` mount at
  `:426-427`** (2.2), not by `GradingResults.tsx`.
- **The property W2-3 asserts: the provenance line reads the RUN, never the
  store.**

**RULING 27: TWO PARSERS REBUILD A `GradingRun` FIELD BY FIELD, AND BOTH DROP
THE PAIR. Revision 1 named one, and named only its test.** Measured:

```
awk 'NR>=161&&NR<=178' src/lib/grading-drafts.ts
awk 'NR>=270&&NR<=290' src/lib/github-grading-run-store.ts
grep -rn "stripGradingRunForDraft" src --include=*.ts | grep -v "\.test\."
```

| Function | File:line | Shape | Effect on a new field |
|---|---|---|---|
| `coerceGradingRun` | `grading-drafts.ts:161-177` | rebuilds, returning exactly `{results, rubricAreaNames, fullCreditChecklist, speedGraderUrl, sampleAnswer}` | **DROPS it silently** |
| `parseGradingRun` | `github-grading-run-store.ts:270-290` | rebuilds, returning the same five | **DROPS it silently** |
| `stripGradingRunForDraft` | `grading-review-rows.ts:90-92` | `{ ...run, results: run.results.map(...) }` | **SPREAD - preserves it** |
| `serializeGithubGradingRun` | `github-grading-run-store.ts:114-121` | `{ ...stripped, results: resultsWithTruncation }` | **SPREAD - preserves it** |

Revision 1's 6.4 said making both fields optional protects them, because the
store "returns `null` when a REQUIRED field is missing". **Optional is not the
question.** Optional stops the parse failing; it does nothing to stop the
field being dropped, and the pair is dropped either way. A claim about a
durable record that ships an in-memory one is false.

**THE RULING, and it is a port rather than an invention.** This repo already
built the enforcer for exactly this class, one level down:

```
awk 'NR>=1&&NR<=70' src/lib/grade-result-allowlist-coverage.test.ts
```

Its header: "three separate modules each hold their own explicit allowlist of
GradeResult fields ... `submissionTruncated` was silently dropped by one of
these once before being caught. This file exists so a FUTURE field gets the
same treatment automatically, on two independent levels" - a **compile-time**
`ALL_GRADE_RESULT_FIELDS` exhaustiveness assertion (`:47-65`, failing
`npx tsc --noEmit`) and a **runtime** sentinel pushed through each function.

**It covers `GradeResult`. There is no sibling for `GradingRun`.** That is the
exact, measured gap, and wave 2 closes it by extending that file with
`ALL_GRADING_RUN_FIELDS` and a run-level sentinel pushed through
`coerceGradingRun` and `parseGradingRun`. Both parsers, their two modules and
that test are in wave 2's write set; `grading-review-rows.ts` is in it
**read-only**, named so a later pass does not "tidy" its spread into a
rebuild.

**W2-4's DIRECTION OF FAILURE: a run-level sentinel whose `rubricUsed` or
`rubricFingerprint` does not survive a round trip through either rebuilder, and
- independently - `npx tsc --noEmit` failing if a field is added to
`GradingRun` without being added to `ALL_GRADING_RUN_FIELDS`.**

### 6.5 The persistence constraint, and the half the sweep does not answer

Four new keys (6.2), each either bumping its directory's exact-set canary or
explicitly recorded as uncovered.

**None is added to `DEVICE_PREFERENCE_KEYS`** (`client-state-sweep.ts:45`).
That is the design: being swept on a change of signed-in owner is correct for
user content, and it answers the cross-user half of the dropped policy's
concern. **It does not answer the other half** - "nothing about it lingers once
the instructor moves on" - because a rubric now survives on this device for as
long as this instructor stays signed in. That is the cost the owner's decision
buys, stated here, carried as RES-A39A-13 and asked once as question Q3.

### 6.6 Path H's ordering defect, which persistence reduces but does not close

`CartridgeDropPanel.tsx:334-341` is the file input; its `onChange` at `:338`
calls `handleFileSelect` (`:161`), which calls `saveCartridgeDrop` (`:210`)
immediately, reading `effective.rubricText`. The rubric box is at `:405-417`,
BELOW it. An instructor reading top to bottom picks the file first and uploads
with an empty rubric.

Persisting means the box is already filled when the file is picked, so the
common case stops failing, and deleting `setRubricText("")` at `:220` means the
second upload keeps it. **It does not close the case where the instructor edits
the rubric after choosing the file.** RES-A39A-2 stays open, narrowed.

---

## 7. Seam 3: the credential is payable, and unreachable from where it is felt

Section 0.6 records that `resolveCanvasCredential` (`canvas-credentials.ts:189`)
reads the caller's own stored credential first (`:193-196`) and falls back to
the owner's env pair only when `identity.role === "owner"` (`:220-225`). The
census's P2 is wrong, and with it the census's third verdict bullet.

The real defect is a ROUTE:

```
grep -rn "account/integrations" src --include=*.tsx --include=*.ts \
  | grep -v "\.test\." | grep -v "^src/app/account"        # 7 lines
grep -rn "account/integrationsZZZ" src                     # canary, exit 1
```

Of the seven, exactly one is a link a user can follow:
`src/app/components/TopBar.tsx:435`. **Nothing on any grading surface routes
there.** An instructor who picks Live Feed and is told "Connect your Canvas
account for this institution in Settings." (`CANVAS_CREDENTIAL_REQUIRED_MESSAGE`,
`canvas-credentials.ts:77`) gets a destination and no way to reach it.

**THE DESIGN.** A pure leaf, `src/lib/canvas-credential-cta.ts`, exporting
`isCanvasCredentialRequired(message)`,
`CANVAS_CREDENTIAL_CTA_HREF = "/account/integrations"` and a label. The
predicate compares **by identity** (`message === CANVAS_CREDENTIAL_REQUIRED_MESSAGE`,
importing the constant), never by a copied literal - the contract the
constant's own doc comment states at `canvas-credentials.ts:70-76`. The callers
are `GradingTab.tsx` (its `state.error` region at `:202-206`) and
`LiveFeedPanel.tsx`.

**CAN THE GATE BE DEFERRED RATHER THAN REMOVED?** Measured answer: **it already
is, and the deferral already works.** `ContentTab.tsx:772` renders the grading
view OUTSIDE the `!loaded` course gate at `:778`, and path A needs no
credential at all - `gradeAction`'s zip branch never calls
`resolveCanvasCredential`. **An instructor who has paid nothing can already
reach a real grade on path A**, which is research M1's requirement, and after
wave 1 they can do it without owning a zip utility.

**What an instructor without the credential can reach, for the copy:** paths A
(zip or, after wave 1, a single file) and H (cartridge drop) in full, including
the grades table, per-row feedback, editing and CSV export. What they cannot
reach: B, C, E, I, and posting grades back. That sentence is true on every
caller, which is the bar A31 ruling 1 sets.

---

## 8. The wave plan

Five waves. Each is independently pushable and independently valuable.

**Disjointness, computed rather than eyeballed.** Waves 1, 2, 4 and 5 all write
`GradingTab.tsx`, so they are sequential:

```
comm -12 <(sort wave1.txt) <(sort wave2.txt)
# -> src/app/components/GradingTab.tsx
#    src/app/components/autoGradeTransition.wiring.test.ts
comm -12 <(sort wave3.txt) <(sort wave4.txt)
# -> (empty)
```

**Waves 3 and 4 are disjoint by exact path and may run concurrently** - wave 3
lives entirely under `src/app/components/grading-recording/` and
`src/app/components/snapshot-grading/`, wave 4 under `src/lib/grade/`,
`src/app/api/`, `src/app/actions/` and `GradingTab.tsx`. Both carry one shared,
invisible resource: `npx tsc --noEmit` has exactly one caller
(`docs/loop/this-repo.md:131-137`), so the two may not typecheck at once.

**Why wave 4 is fourth.** `docs/a39-research.md:828` rules that the streaming
remedy "should never be scheduled ahead of M1 or M2", and section 2 rules the
N = 1 cost is the zip. Delivering row 1 early is worth nothing to an instructor
who abandoned on the first assignment because they had to build a zip. If the
owner disagrees, **waves 3 and 4 can swap freely** - they are disjoint, and
wave 4 depends only on waves 1 and 2.

**Every multi-path gate below uses `npm run test:paths --`**, never a raw
multi-path `vitest run`, which silently drops unmatched arguments and exits 0
(`docs/loop/this-repo.md:28-41`). Single-path conditions use
`npx vitest run <one path>`.

### Wave 1 - one submission needs no zip

Every line is pure server-side or pure routing logic with no browser-only
failure mode.

| Path | New? | Why it is here |
|---|---|---|
| `src/lib/grade/single-file-entry.ts` | new | PURE. `classifyGradingUpload(name): "zip" \| "single" \| "unsupported"` and `buildSingleFileEntry(name, buffer): StudentSubmissionEntry \| null`. Reuses `getFileExtension`, `TEXT_EXTENSIONS`, `DOCUMENT_EXTENSIONS`, `extractTextFromBuffer` (`office-extract.ts:80,13,55,179`), `IMAGE_EXTENSIONS`, `getMimeType` (`grade/constants.ts:41,62`), `toPreviewContent` (`grade/utils.ts:49`). No new dependency |
| `src/lib/grade/single-file-entry.test.ts` | new | the oracle |
| `src/app/actions/grading.ts` | edit | **THE CALLER.** Routes a non-zip upload to `gradeEntries([entry], ...)` (`engine.ts:457`) instead of `gradeSubmissions`. **This file took a concurrent writer inside the session that wrote this document (0.8) - re-measure it and run `git status --short` before estimating** |
| `src/app/components/GradingTab.tsx` | edit | **THE CALLER** of the widened intake. `accept` at `:238`, copy at `:240` |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **owned** | reads `GradingTab.tsx` as source text; A5/A6 (1.8) |
| `src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts`, `.../gradingResultsHelpersEditState.test.ts` | **owned** | same instrument, same file |
| `src/app/actions/grading-missing-submissions.test.ts`, `src/app/actions/grading-run-mapping.test.ts`, **`src/app/actions/grading.budget.test.ts`**, `src/lib/grade/postable.test.ts` | **owned** | name `actions/grading.ts` (1.8) |
| `src/file-size-ceiling.structure.test.ts` | **owned, read-only** | the gate |

**PASS CONDITIONS.**

- **W1-1.** OBJECT: `classifyGradingUpload` over
  `{"a.zip", "essay.docx", "paper.pdf", "notes.txt", "shot.png", "x.exe"}`.
  INSTRUMENT: `npx vitest run src/lib/grade/single-file-entry.test.ts`.
  DIRECTION OF FAILURE: RED if `.docx` classifies as `"zip"` - the live hazard,
  because a `.docx` IS a zip and `JSZip.loadAsync` (`extraction.ts:117`) opens
  it (section 2).
- **W1-2.** OBJECT: `buildSingleFileEntry("essay.docx", buf)`. INSTRUMENT: same.
  DIRECTION OF FAILURE: RED if it returns more than one entry, if the entry's
  `student` is the empty string, or if it routes through
  `groupSubmissionsByStudent`, whose `leafStemFallback` (`utils.ts:121-126`)
  would name the student after the leading alphanumeric run of the stem.
- **W1-3, owner-only.** OBJECT: the interactions from a cold app to a first
  graded single submission, before and after. INSTRUMENT: the census
  walkthrough in a real browser. DIRECTION OF FAILURE: RED if the count does
  not fall, or if any removed interaction reappears after the result. **Nothing
  renders under vitest, so this is not a suite claim** - RES-A39A-1.

### Wave 2 - the rubric is remembered on A and H, and the run records its version

| Path | New? | Why it is here |
|---|---|---|
| `src/lib/research/rubric-fingerprint.ts` | new | the extraction in 5.2 |
| `src/lib/research/rubric-bank.ts` | edit | re-exports it; every existing caller unchanged, including its own `:70` |
| `src/lib/grade/rubric-memory.ts` | new | PURE, client-safe. Scope keys, the map, `describeRubricOrigin` |
| `src/lib/grade/rubric-memory.test.ts` | new | the oracle for scope keying and the label |
| `src/lib/grade/types.ts` | edit | `GradingRun.rubricUsed?`, `rubricFingerprint?` (6.4) |
| `src/lib/grade/engine.ts` | edit | **THE CALLER** of `rubricFingerprint`; stamps at `:395-399`, `:437`, `:489` |
| `src/lib/grade/rubricProvenance.ts` | new | PURE `describeRunRubricProvenance(run)` - reads the RUN, never the store |
| `src/lib/grade/rubricProvenance.test.ts` | new | **W2-3, claim 1's removal test** |
| **`src/lib/grading-drafts.ts`** | **edit** | **`coerceGradingRun:161-177` must carry both fields forward (RULING 27)** |
| **`src/lib/github-grading-run-store.ts`** | **edit** | **`parseGradingRun:270-290` must carry both fields forward (RULING 27)** |
| **`src/lib/grade-result-allowlist-coverage.test.ts`** | **edit, required** | **W2-4. Extended with `ALL_GRADING_RUN_FIELDS` and a run-level sentinel through both rebuilders (6.4)** |
| `src/lib/workflows/grading-review-rows.ts` | **owned, read-only** | `stripGradingRunForDraft:90-92` spreads and so preserves; named so a later pass does not turn it into a rebuild |
| `src/app/components/GradingTab.tsx` | edit | **THE CALLER** of `rubric-memory` on path A; `maxRows` on both fields (`:295-306`, `:311-322`); **mounts `RubricProvenance` above the `<GradingResults` at `:426`** |
| `src/app/components/CartridgeDropPanel.tsx` | edit | **THE CALLER** on path H; delete `setRubricText("")` at `:220`; **`maxRows` at `:409`** (2.1) |
| **`src/lib/course-lms-options.test.ts`** | **owned** | the only source-text reader of `CartridgeDropPanel.tsx` (1.8) |
| `src/app/components/grading-results/RubricProvenance.tsx` | new | the provenance leaf |
| `src/app/components/grading-results/rubricProvenanceLeaf.test.ts` | new | **W2-8**, the literal's spelling |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **owned** | 1.8; **W2-7 lives here** |
| `src/lib/github-grading-run-store.test.ts`, `src/lib/grading-drafts.test.ts`, `src/lib/repo-grading-log.test.ts` | **owned** | read the two persistence modules as source text or by import (1.8) |
| `src/lib/grade/engine.test.ts`, `src/lib/grade/engine.ungraded.test.ts`, `src/app/components/grading-results/ungradedDisclosure.test.ts`, `src/lib/code-runner.test.ts`, `src/lib/grade/grouping-zip-parents.wiring.test.ts` | **owned** | name `grade/engine.ts` (1.8) |
| the nine files naming `grade/types.ts` in 1.8 | **owned** | the type gains two fields |
| `src/lib/module-graph/runtime-import-graph.test.ts` | **owned** | 5.2's instrument |
| `src/file-size-ceiling.structure.test.ts` | **owned, read-only** | the gate |

`src/app/components/GradingResults.tsx` is **NOT in this wave** (2.2), which is
why its 18 source-text readers are absent from this list.

**PASS CONDITIONS.**

- **W2-1, retrieval costs zero AND is never silent.** OBJECT: **the PAIR** -
  the rubric text `loadRubricMemory(scope)` returns, and the string
  `describeRubricOrigin` returns for that same call. INSTRUMENT:
  `npx vitest run src/lib/grade/rubric-memory.test.ts`. DIRECTION OF FAILURE:
  RED if applying a previously used rubric for the SAME scope costs more than
  zero calls; RED if a DIFFERENT scope's entry is returned **with an empty or
  absent origin string**; and **RED if `loadRubricMemory` returns anything at
  all for path A before a file name is supplied** (6.2.1). The label is what
  makes cross-scope reuse legal, so the condition ranges over the pair and
  never over the text alone.
- **W2-2, scope keying never silently crosses assignments.** OBJECT:
  `loadRubricMemory` for scope B after saving under scope A. INSTRUMENT: same.
  DIRECTION OF FAILURE: RED if scope B returns scope A's text without
  `describeRubricOrigin` naming scope A and its `savedAt`.
- **W2-3, THE REMOVAL TEST for claim 1.** OBJECT: the fingerprint a finished run
  reports, before and after the STORE is mutated. INSTRUMENT:
  `npx vitest run src/lib/grade/rubricProvenance.test.ts`. DIRECTION OF
  FAILURE: RED if the run's reported fingerprint changes when the store
  changes. **Sabotage to prove it can fail**: make
  `describeRunRubricProvenance` read the store, watch it go red, restore.
- **W2-4, BOTH rebuilders carry the pair.** OBJECT: a run-level sentinel
  `GradingRun` with distinctive `rubricUsed` and `rubricFingerprint` values,
  pushed through `coerceGradingRun` (`grading-drafts.ts:161`) and through the
  `serializeGithubGradingRun` / `parseStoredGithubGradingRun` round trip.
  INSTRUMENT:
  `npx vitest run src/lib/grade-result-allowlist-coverage.test.ts`, plus
  `npx tsc --noEmit` for the exhaustiveness half. DIRECTION OF FAILURE: RED if
  either sentinel value fails to survive either round trip; **and `tsc` RED if
  a field is added to `GradingRun` without being added to
  `ALL_GRADING_RUN_FIELDS`**. **Sabotage**: delete `rubricUsed` from
  `coerceGradingRun`'s literal, watch it go red, restore.
- **W2-5, the engine did not widen.** OBJECT: `engine.ts`'s runtime import
  closure. INSTRUMENT:
  `npx vitest run src/lib/module-graph/runtime-import-graph.test.ts`.
  DIRECTION OF FAILURE: RED if a Supabase client entered it via the fingerprint
  import (5.2).
- **W2-6, all four keys and both parsers together.** INSTRUMENT:
  `npm run test:paths -- src/lib/grade/rubric-memory.test.ts src/lib/grade/rubricProvenance.test.ts src/lib/grade-result-allowlist-coverage.test.ts src/lib/github-grading-run-store.test.ts src/lib/grading-drafts.test.ts`.
- **W2-7, the convenience did not hide the button it feeds** (2.1, 2.2).
  OBJECT: the stripped source of `GradingTab.tsx` and of
  `CartridgeDropPanel.tsx`. INSTRUMENT: source-text assertions in
  `autoGradeTransition.wiring.test.ts`. Three clauses, **each stated as a
  presence assertion followed by a comparison**:
  1. `id="assignment-instructions"`, `id="rubric"` and `id="cartridge-rubric"`
     are each present, and each carries a `maxRows` prop inside its own
     `<TextField ...>` tag.
  2. `indexOf("<RubricProvenance")` in `GradingTab.tsx` is `>= 0`, **and** it is
     less than `indexOf("<GradingResults")`, which is itself `>= 0`.
  3. `indexOf("<RubricProvenance")` in `GradingResults.tsx` is `-1` - the
     component is mounted by the tab, not by the results region.
  DIRECTION OF FAILURE: RED if any textarea is uncapped after a restored value
  can fill it, RED if either literal is absent, RED if the provenance line
  renders below or inside the results region. **Honest limit: this pins DOM
  order and a height cap, not visibility** - nothing renders (RES-A39A-14).
  Revision 1's version compared an index against a literal that lived in
  another file, so `-1 < anything` made it pass by construction; clause 1 of
  each pair is what closes that.
- **W2-8, the receipt is spelled once.** OBJECT: the source of
  `RubricProvenance.tsx`. INSTRUMENT:
  `npx vitest run src/app/components/grading-results/rubricProvenanceLeaf.test.ts`.
  DIRECTION OF FAILURE: RED if the literal `Rubric used` is absent, or if the
  file contains any of `Rubric applied`, `Rubric source`, `Graded against` -
  2.2's naming contract, and the only thing in this repo that can stop a second
  spelling.

### Wave 3 - the policy is deleted where it is asserted, F and G persist

**Two commits, in this order, and the first is not optional.**

**Commit 3a, the extraction.** `GradingRecordingPanel.tsx` (990) and
`SnapshotGradingPanel.tsx` (970) each shrink to `<= 940` by moving a cohesive
piece into a plain `.ts` leaf in the same directory. GATE:
`@(Get-Content <file>).Count -le 940` for both, plus `npm run lint` at its
4-warning / 0-error baseline (the React Compiler trap, 5.3). **No feature line
lands in 3a.**

**Commit 3b, the feature.**

| Path | New? | Why it is here |
|---|---|---|
| (the two leaves 3a created) | new | carried in |
| `src/app/components/grading-recording/RubricInputModal.tsx` | edit | **DELETE the asserted policy at `:28-34`**, replace per 6.1 |
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | edit | **THE CALLER** - declares `STORAGE_KEY_RUBRIC = "ta-rec-grade-rubric"`, calls `rubric-memory`, passes the restored text into the modal |
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | edit | **DELETE the asserted policy at `:143-147`**, replace per 6.1; **THE CALLER**, declaring both `ta-snap-*` constants |
| `src/lib/grade/rubric-memory.ts` | **owned, read-only** | wave 2 wrote it; wave 3 is a second caller and must not change its shape |
| `src/app/components/grading-recording/grading-rows.test.ts` | **edit, required** | exact set at `:678-687` gains the key; **a new A4d-shaped block**; the `it.each` at `:718-732` is NOT extended (6.3) |
| `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | **edit, required** | exact set at `:196-202` gains two keys; the test NAME at `:195` and the comment at `:124-133` are rewritten; **two new A4d-shaped blocks**; the `toMatch` set at `:211-224` is NOT extended |
| the 17 files naming `GradingRecordingPanel.tsx` and the 4 naming `SnapshotGradingPanel.tsx` in 1.8 | **owned** | source-text readers of both panels, including `src/loop-docs.structure.test.ts` |
| the 5 files naming `RubricInputModal.tsx` in 1.8 | **owned** | same |
| `src/file-size-ceiling.structure.test.ts` | **owned, read-only** | the gate, run before AND after 3a |

**PASS CONDITIONS.**

- **W3-1, the extraction landed first.** OBJECT: both panels' line counts at the
  3a gate. INSTRUMENT: `@(Get-Content <file>).Count` (PowerShell). DIRECTION OF
  FAILURE: **greater than 940 at 3a, or any feature line present in 3a**, or
  greater than 955 after 3b. No `ALLOWED_OVERAGE` entry is acceptable.
- **W3-2, the policy is gone where it was asserted.** OBJECT: the two panel
  directories' source text. INSTRUMENT:
  `grep -rn "persists it\|not persisted\|out of localStorage" src/app/components/grading-recording src/app/components/snapshot-grading`.
  DIRECTION OF FAILURE: RED if any surviving line still tells a reader the
  rubric is deliberately not stored (6.1). The test NAME at
  `snapshot-grading.structure.test.ts:195` is in scope.
- **W3-3, the canaries bind - and this wave CAN satisfy it** (6.3). OBJECT: the
  two exact key sets, and the three new keys' read/write wiring. INSTRUMENT:
  `npm run test:paths -- src/app/components/grading-recording/grading-rows.test.ts src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`.
  DIRECTION OF FAILURE: RED if a new key is present in a panel's source and
  absent from its directory's expected set; **equally RED if a key is added to
  an expected set while its A4d-shaped block cannot find the panel's call or
  `rubric-memory.ts`'s `getItem`/`setItem` pair.** The leaf does NOT move;
  the directory-local wiring lists are NOT extended, because
  `src/lib/grade/` is outside both haystacks (`grading-rows.test.ts:653-658`,
  `snapshot-grading.structure.test.ts:177-186`) and extending them would ship a
  wave whose gate cannot go green.
- **W3-4, lint did not regress.** OBJECT: `npm run lint`. DIRECTION OF FAILURE:
  a fifth warning, or any error (`docs/loop/this-repo.md:78-83`).

### Wave 4 - the run delivers row 1 while row 7 is still running

**Three commits, in this order.** 4a captures the frozen oracle from TODAY's
implementation (5.1); 4b lands the reconciliation projection; 4c lands the
route handler, the pool and the seam. The order is not cosmetic: an oracle
authored after the change is a restatement.

| Path | New? | Why it is here |
|---|---|---|
| `src/lib/grade/reconcile.test.ts` | new, **commit 4a** | the frozen-literal oracle, captured from today's `gradeStudentEntries` output before any extraction |
| `src/lib/grade/reconcile.ts` | new, 4b | PURE `reconcileRun` (4.2, 5.1) |
| `src/lib/grade/engine.ts` | edit, 4b | **THE CALLER**; `:332-393` becomes a call. Must SHRINK |
| `src/lib/grade.ts` | edit, 4b | barrel export of `reconcileRun` |
| `src/app/actions/grading-incremental.ts` | new, 4c | `prepareGradingRunAction` (4.2), a Server Action |
| `src/app/actions/grading-incremental.test.ts` | new, 4c | W4-4 |
| **`src/app/api/grade-run-item/route.ts`** | **new, 4c** | **the per-item Route Handler at `maxDuration = 60` (DECISION 6, 4.1); the guard, the content-type floor and the validation of 4.3** |
| **`src/app/api/grade-run-item/route.test.ts`** | **new, 4c** | **W4-10** |
| `src/app/actions.ts` | edit, 4c | `export * from "./actions/grading-incremental"` |
| `src/app/actions/action-guard-coverage.test.ts` | **owned** | it binds `prepareGradingRunAction`; **it CANNOT see the route handler (4.3)** |
| `src/app/components/grading/incrementalRunPlan.ts` | new, 4c | PURE plan leaf: `buildRunItemRequests`, `mergeArrivedResults`, `routeGradingRun`, `classifyItemFailure`, `INCREMENTAL_CONCURRENCY`, `ITEM_REQUEST_BYTE_BUDGET` |
| `src/app/components/grading/incrementalRunPlan.test.ts` | new, 4c | **W4-3, W4-5, W4-11** |
| `src/app/components/grading/useIncrementalGradingRun.ts` | new, 4c | the pool, PORTED from `useRepoGradesBulkGrade.ts` (0.1); the lock; cancellation |
| `src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts` | new, 4c | **W4-9, the double press.** PORTED from `useRepoGradesBulkGrade.lifecycle.test.ts:28-60` - a fresh copy, never an import from another `*.test.ts` |
| `src/app/components/GradingTab.tsx` | edit, 4c | **THE CALLER.** `action={formAction}` DELETED, `onSubmit` added, the disabled expression widened (4.6) |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **owned, EXPECTED TO CHANGE** | **A5 becomes "exactly two `formAction(`, each strictly inside a `startTransition(` span", in this commit, with the reason recorded (4.6).** A6 and A7 are untouched |
| `src/lib/grade/engine.test.ts`, `src/lib/grade/engine.ungraded.test.ts`, `src/app/components/grading-results/ungradedDisclosure.test.ts`, `src/lib/code-runner.test.ts`, `src/lib/grade/grouping-zip-parents.wiring.test.ts` | **owned** | the byte-identity floor of 5.1 |
| `src/lib/module-graph/runtime-import-graph.test.ts`, `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | **owned** | name `app/actions.ts`; the first sees a new barrel edge |
| `src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts`, `.../gradingResultsHelpersEditState.test.ts` | **owned** | read `GradingTab.tsx` as source text |
| `src/file-size-ceiling.structure.test.ts` | **owned, read-only** | the gate |

**PASS CONDITIONS.**

- **W4-1, the regression FLOOR (not the oracle).** OBJECT: the `GradingRun`
  `gradeStudentEntries` returns for the existing fixtures. INSTRUMENT:
  `npm run test:paths -- src/lib/grade/engine.test.ts src/lib/grade/engine.ungraded.test.ts`.
  DIRECTION OF FAILURE: RED on any change those files can see. **Stated
  honestly, because revision 1 claimed more than this instrument delivers:
  `grep -c "rubricAreas\|canonical\|rubricAreaNames" src/lib/grade/engine.test.ts`
  is 0 against a canary of 16 on the same file, so these two files cannot
  detect a change to stray-folding, renaming or area ORDER.** That is W4-2's
  job, over the oracle, and the two conditions are separate for that reason.
- **W4-2, the frozen oracle and idempotence, which is what makes incremental
  legal.** OBJECT: (a) `reconcileRun(raw, names)` against the literal captured
  in commit 4a from today's implementation; (b)
  `reconcileRun(reconcileRun(raw, names).results, namesGrown)` against
  `reconcileRun(raw, namesGrown)`, with `names` GROWING between the two calls -
  the `engine.ts:337-344` branch. INSTRUMENT:
  `npx vitest run src/lib/grade/reconcile.test.ts`. DIRECTION OF FAILURE: RED
  on any difference in a reconciled row's `rubricAreas` names, their ORDER, or
  `overallComment`. **Proof the oracle can fail, required in commit 4a before
  4b lands: run (b) against the MUTATING implementation and watch it go red.**
- **W4-3, THE REMOVAL TEST for claim 2.** OBJECT: the set of `rubric` strings
  AND the set of `criteriaNames` across `buildRunItemRequests(threeTickets,
  pinned)`. INSTRUMENT:
  `npx vitest run src/app/components/grading/incrementalRunPlan.test.ts`.
  DIRECTION OF FAILURE: RED if either set has more than one member, or if the
  rubric set's one member is not byte-identical to `pinned.rubric`.
  **Sabotage**: delete `pinned.rubric` from the request, watch it go red,
  restore.
- **W4-4, no regeneration in the new seam.** OBJECT: the source text of
  `src/app/actions/grading-incremental.ts` AND of
  `src/app/api/grade-run-item/route.ts`. INSTRUMENT: source-text assertions in
  their tests that neither file contains `generateRubric(` or
  `fetchCanvasMeta(`, with a canary asserting the instrument fires on a fixture
  that does contain them. DIRECTION OF FAILURE: RED the moment either appears -
  the `grading.ts:633-635` defect reappearing. It pins the FACT, not a
  spelling.
- **W4-5, ordering and the dense projection.** OBJECT: `mergeArrivedResults`
  over five tickets with arrivals in order `[2, 0, 1]`. DIRECTION OF FAILURE:
  RED if the returned rows are not in ascending `sourceIndex` order; RED if the
  returned length is anything other than the number ARRIVED; **RED if any
  returned row carries an `ungraded` outcome the caller did not supply** - the
  construction that makes 4.5's banned pending row unrepresentable.
- **W4-6, cancellation costs nothing already paid, and adds no `run-deadline`
  writer.** OBJECT: the accumulator after cancelling with two of five arrived,
  and the source text of the whole repo. DIRECTION OF FAILURE: RED if a graded
  row is discarded; RED if the result set contains any row with
  `ungraded.stoppedBy === "run-deadline"`; and RED if
  `grep -rn "runDeadlineMs\|\"run-deadline\"" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
  returns a writer outside `steps.grading-cartridge.ts`,
  `steps.grading-draft-flow.ts` and `steps.grading-run.ts` **plus the engine's
  own two sites**. This is `docs/backlog.yml` A31's own instrument, and it is
  how this design PROVES it is not the fifth writer rather than filing a
  residual saying it might be.
- **W4-7, owner-only.** OBJECT: wall-clock elapsed from Start Review to the
  first readable row, before and after. INSTRUMENT: the owner, with real keys,
  against a clock. **No API key exists here.** RES-A39A-4.
- **W4-8, the stop control is not buried under its own results** (2.2, 4.5).
  OBJECT: the stripped source of `GradingTab.tsx`. INSTRUMENT: a source-text
  ordering assertion in `autoGradeTransition.wiring.test.ts`, **as a pair**:
  `indexOf("Stop grading")` and the progress region's anchor are each `>= 0`,
  and each is less than `indexOf("<GradingResults")`, which is itself `>= 0`.
  DIRECTION OF FAILURE: RED if either literal is absent, RED if either renders
  below the results region. **Also RED if the stop literal is spelled anything
  other than `Stop grading`** (2.2's naming contract).
- **W4-9, PRESS TWICE** (4.6, RULING 29). OBJECT: the number of dispatches -
  `prepareGradingRunAction` calls plus item fetches plus `formAction` calls -
  after `handleStartReview` is invoked TWICE with no tick between. INSTRUMENT:
  `npx vitest run src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts`,
  using the react-mocking harness of
  `useRepoGradesBulkGrade.lifecycle.test.ts:28-60`. DIRECTION OF FAILURE: RED
  if the total is anything other than **1**. **Not an assertion that a flag is
  set.** **Sabotage**: delete the `startLockRef` check, watch the total become
  2, restore.
- **W4-10, the Route Handler is guarded, and its guard is not assumed from a
  test that cannot see it** (4.3). OBJECT: the source text of
  `src/app/api/grade-run-item/route.ts`. INSTRUMENT:
  `npx vitest run src/app/api/grade-run-item/route.test.ts`. DIRECTION OF
  FAILURE, as three presence-then-comparison pairs: RED if `requireUser(` is
  absent, or if its index is not less than the index of `gradeEntries(`; RED if
  no `content-type` check is present; RED if `export const maxDuration = 60` is
  absent. **A canary in the same file asserts the instrument fires**: the same
  three checks run against a fixture string with the guard removed and are
  expected to fail.
- **W4-11, a rate-limited run does not report itself complete** (4.7). OBJECT:
  `classifyItemFailure` over a throttle message and an ordinary one, and the
  run status line `incrementalRunPlan` derives from a set of outcomes.
  INSTRUMENT:
  `npx vitest run src/app/components/grading/incrementalRunPlan.test.ts`.
  DIRECTION OF FAILURE: RED if forty throttle failures produce the same status
  line as forty ordinary failures. **Nothing here can produce a real 429, so
  this is a pure-predicate claim and is named as one** - RES-A39A-18.

### Wave 5 - the credential has a route, and the receipt reaches Live Feed

**WRITE SET.** `src/lib/canvas-credential-cta.ts` (new, pure),
`src/lib/canvas-credential-cta.test.ts` (new),
`src/app/components/GradingTab.tsx` (**the caller**),
`src/app/components/LiveFeedPanel.tsx` (**the caller**, and the second
`RubricProvenance` mount),
`src/app/components/autoGradeTransition.wiring.test.ts` (**owned** - its A7
pins `disabled={pending}` to exactly 3 occurrences in `LiveFeedPanel.tsx`, and
neither a CTA nor a mounted leaf may become a fourth),
`src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts`
and `.../gradingResultsHelpersEditState.test.ts` (**owned**, they read both
components as source text), `src/file-size-ceiling.structure.test.ts` (owned,
read-only).

**PASS CONDITIONS.**

- **W5-1.** OBJECT: `isCanvasCredentialRequired(CANVAS_CREDENTIAL_REQUIRED_MESSAGE)`
  and `isCanvasCredentialRequired("Some other error.")`. INSTRUMENT:
  `npx vitest run src/lib/canvas-credential-cta.test.ts`, which IMPORTS the
  constant and compares. DIRECTION OF FAILURE: RED if the module holds a copied
  literal, so a drift in `canvas-credentials.ts:77` fails here rather than
  silently.
- **W5-2, owner-only.** OBJECT: whether the link appears and is keyboard
  reachable. INSTRUMENT: the owner, in a browser. RES-A39A-1.
- **W5-3, the receipt is on every surface that renders a run.** OBJECT: the
  stripped source of `LiveFeedPanel.tsx`. INSTRUMENT: a source-text assertion
  in `autoGradeTransition.wiring.test.ts`, as a pair:
  `indexOf("<RubricProvenance")` is `>= 0` and is less than
  `indexOf("<GradingResults")`, which is itself `>= 0`. DIRECTION OF FAILURE:
  RED if the Live Feed surface renders a run with no provenance line - which
  would be claim 1 shipped on one of two surfaces, the reachability gap this
  document exists to avoid creating.

---

## 9. Disposition of revision 1, requirement by requirement

This revision restructured its predecessor, so every prior requirement is
KEPT (with its id), HANDED OVER (naming the receiver and the obligation) or
WITHDRAWN (with the reason and any enforcer it protected). **The id column was
re-derived last, after every pass condition in section 8 and every entry in
section 11 was written.**

### 9.1 Pass conditions

| Revision 1 | Disposition | Revision 2 id |
|---|---|---|
| W1-1 `.docx` never classifies as zip | KEPT verbatim | W1-1 |
| W1-2 single entry, no `groupSubmissionsByStudent` | KEPT verbatim | W1-2 |
| W1-3 owner-only cold count | KEPT verbatim | W1-3 |
| W2-1 "RED if the first is greater than zero" | **REWRITTEN.** Ranges over the PAIR (text + origin label); adds "RED if anything is returned for path A before a file name". RULING 31: as written, the cheapest green was a last-used rubric auto-filling from another assignment | W2-1 |
| W2-2 scope keying | KEPT, `savedAt` added to the label assertion | W2-2 |
| W2-3 removal test for claim 1 | KEPT verbatim | W2-3 |
| W2-4 "a fixture that parsed before returns null after", instrument `github-grading-run-store.test.ts` only | **WITHDRAWN as insufficient and REPLACED.** Optional fields do not survive a field-by-field rebuild; two rebuilders exist and only one was named (RULING 27). **Enforcer it protected: the store's own parse test, which is kept inside the replacement's `test:paths` set** | W2-4 (new object: a run-level sentinel through BOTH rebuilders, plus a `tsc` exhaustiveness half) |
| W2-5 import graph did not widen | KEPT verbatim | W2-5 |
| W2-6 multi-path gate | KEPT, paths widened to five | W2-6 |
| W2-7 `maxRows` on two fields + "Rubric used" index | **REWRITTEN and SPLIT.** The index clause passed by construction (`indexOf` of a literal in another file is -1; RULING 28), and it contradicted 2.2's own contract. Now three presence-then-comparison pairs over three fields | W2-7, and the spelling half becomes W2-8 |
| - | NEW | W2-8 |
| W3-1 extraction first | KEPT, post-3b gate stated (revision 1 left it ungated) | W3-1 |
| W3-2 policy grep | KEPT, the test NAME at `snapshot-grading.structure.test.ts:195` brought into scope | W3-2 |
| W3-3 "the canaries bind" | **REWRITTEN.** As written the wave could not go green: the leaf is in `src/lib/grade/` and both wiring haystacks are directory-scoped (RULING 28). Choice made and stated: **the leaf stays, the canaries change**, with A4d-shaped blocks | W3-3 |
| W3-4 lint baseline | KEPT verbatim | W3-4 |
| W4-1 "byte identity ... RED on any change to names or order or overallComment", instrument `engine.test.ts` + `engine.ungraded.test.ts` + `reconcile.test.ts` | **SPLIT.** Measured, those two engine tests assert nothing about the reconciled fields (0 hits against a canary of 16). The floor and the oracle are now separate conditions with separate instruments | W4-1 (floor), W4-2 (oracle) |
| W4-2 idempotence | KEPT, folded into W4-2 with the capture step 5.1 adds | W4-2 |
| W4-3 removal test for claim 2 | KEPT, `criteriaNames` set added (0.2 narrowed the claim) | W4-3 |
| W4-4 no regeneration in the seam | KEPT, extended to the Route Handler, canary added | W4-4 |
| W4-5 ordering | KEPT, dense-projection and no-injected-`ungraded` clauses added | W4-5 |
| W4-6 cancellation | KEPT, plus the `run-deadline` writer grep that replaces RES-A39-4 | W4-6 |
| W4-7 owner-only timing | KEPT verbatim | W4-7 |
| W4-8 stop control placement | KEPT, presence assertions added to both index comparisons | W4-8 |
| - | NEW (RULING 29) | W4-9 |
| - | NEW (DECISION 6) | W4-10 |
| - | NEW (RULING 31) | W4-11 |
| W5-1 predicate by identity | KEPT verbatim | W5-1 |
| W5-2 owner-only | KEPT verbatim | W5-2 |
| - | NEW | W5-3 |

### 9.2 Structural rulings

| Revision 1 ruled | Disposition |
|---|---|
| The per-item call is a **Server Action** (4.1's table) | **WITHDRAWN by DECISION 6.** Replaced by a Route Handler at `maxDuration = 60`, pool retained. **Enforcer it protected: none.** New obligations created: the guard, the content-type floor, the validation (4.3), all instrumented by W4-10 |
| The per-item byte budget is `serverActions.bodySizeLimit: "10mb"` | **WITHDRAWN.** That key governs Server Actions only; a Route Handler is on an undeclared platform cap. Replaced by `ITEM_REQUEST_BYTE_BUDGET`, a design constant. **Enforcer it protected: the `mode: "whole-run"` escape, which is KEPT and re-pointed at the new constant.** RES-A39A-3 |
| `action={formAction}` stays live and the run is intercepted in the hook | **WITHDRAWN (RULING 29).** Replaced by the seam in 4.6. **Enforcer it protected: A5's exact-once count, which is HANDED OVER to a strictly stronger form** (exactly two, each inside a transition span) in the same commit |
| A pending row is `UngradedResult { stoppedBy: "run-deadline" }`, "the largest reuse in the design" | **WITHDRAWN (RULING 30).** A pending submission produces no row at all. **Enforcer it protected: RES-A39-4's watch for a fifth `run-deadline` writer - now stronger, as W4-6's grep clause proves there is none rather than watching for one.** Cost carried as RES-A39A-19 |
| `RubricProvenance.tsx` is mounted by `GradingResults.tsx` | **WITHDRAWN (RULING 28).** It is inside the results region and contradicted 2.2. Mounted by `GradingTab.tsx` (wave 2) and `LiveFeedPanel.tsx` (wave 5). Consequence: `GradingResults.tsx` leaves every write set |
| B/C Canvas gets a `canvas:<normalized url>` scope key | **WITHDRAWN (6.2.2), not deferred.** Both fields are `readOnly` on that path (`GradingTab.tsx:301,317`) and the rubric field does not render unless non-empty (`:308`); a stored value would be uncorrectable or shadowed. **Enforcer it protected: none - it was never in the key list, no wave built it, and revision 1 filed no residual.** Reviving it requires first deciding whether the Canvas rubric field becomes editable, which is a UX decision outside this write set |
| A named rubric library with a picker | **WITHDRAWN**, carried forward from revision 1 unchanged. **Enforcer it protected: none.** Reviving it requires measuring the out-of-app find cost first |
| Section 11's residual ids `RES-A39-2..18` | **RENUMBERED to `RES-A39A-*`** (RULING 31 / MAJOR 7): the census's `RES-A39-4/5/6/7` mean different things, and `docs/BACKLOG.md` must be able to cite either document unambiguously. Map in 11.1 |

### 9.3 Census residuals, re-dispositioned

| Census id | Disposition | Revision 2 id |
|---|---|---|
| RES-A39-1 (rubric policy) | **DISCHARGED by DECISION 3.** Section 6 carries all four consequences; not carried as an open residual | closed |
| RES-A39-2 (counts are reading claims) | KEPT verbatim | RES-A39A-1 |
| RES-A39-3 (path H two labels + cleared rubric) | PARTLY CLOSED (wave 2 closes the cleared-rubric half), partly kept | RES-A39A-2 |
| RES-A39-4 (zip convention mis-groups) | KEPT, blast radius reduced by wave 1 at N = 1 | RES-A39A-8 |
| RES-A39-5 (no `maxDuration` on the attended run) | **DISCHARGED by DECISION 6**, not by the design's own argument. Revision 1 claimed it "CLOSED BY DESIGN" on the grounds that a 60s Route Handler does not survive N = 40 - true of ONE handler for the whole run, and the wrong frame for a per-item one | closed; the instrument survives as W4-6 |
| RES-A39-6 (rubric bank unreachable on default provider) | WITHDRAWN as a mechanism, KEPT as a fact; `rubricFingerprint` is extracted from it | RES-A39A-5 |
| RES-A39-7 (F/G per-submission cost unmeasured) | KEPT verbatim | RES-A39A-10 |

---

## 10. What I could not determine

Stated rather than filled in, per `docs/loop/this-repo.md` section 6.

- **The Route Handler's request-body cap on this deployment.** DECISION 6 moved
  the per-item call off `serverActions.bodySizeLimit`, and nothing in this repo
  declares what replaces it. No deployment and no network here. The design does
  not depend on the answer (4.4); RES-A39A-3 carries it.
- **Any wall-clock number.** No API key, so model latency is unmeasurable and
  so is whether an attended run of N actually dies in production.
  `1.2 * (N - 1)` is arithmetic on `gemini.ts:67`, not an observation.
- **Whether `INCREMENTAL_CONCURRENCY = 3` is safe against the real provider
  quota.** Path E has run at 3 with no spacing since A26, which is evidence and
  not proof; a real 429 cannot be produced here (`vitest.setup.ts` throws on
  any real fetch). RES-A39A-18.
- **Anything a screen shows.** No component renders under vitest. Every
  interaction count above is a reading claim, and **no pass condition in
  section 8 is satisfied by a render.**
- **Whether any affordance in this design is DISCOVERABLE.** W2-7, W2-8, W4-8
  and W5-3 pin DOM order, a height cap and two label spellings, which is the
  most a source-text test can reach. They cannot tell whether an instructor
  recognises a name, whether CSS hides a control, or whether an existing habit
  was closed. RES-A39A-14.
- **Whether the census's crossover numbers hold for an instructor who has not
  already found each path.** They do not measure discovery and no instrument
  here can (2.1).
- **Whether the four browser-only intake traps in research 2.2 bite.**
  RES-A39A-6.
- **Which specific piece comes out of `GradingRecordingPanel.tsx` and
  `SnapshotGradingPanel.tsx` in commit 3a.** I measured the sizes, the
  requirement, the SHAPE and the React Compiler trap, but I did not read either
  panel line by line, and naming an extraction target I have not read is the
  thing this repo's traps card warns against. **The 940 target and the
  `+10`/`+14` feature figures are all provisional** and the wave re-derives them
  (5.3).
- **The real cost of finding a rubric outside the app.** Paid in a file manager
  or an LMS; nothing here can cite it, and 6.3 declines to build on it.
- **Whether `client-state-sweep.ts` predates the rubric policy comments.** I did
  not run `git log` on either file; the mechanism is cited as it exists today.
- **What the concurrent writer of `src/app/actions/grading.ts` is adding
  (0.8).** I read the line counts and the diffstat, not the diff - it is
  another agent's in-flight work and not in my write set.

---

## 11. Residual register

Every entry names an OWNER, an INSTRUMENT, an OBJECT, a DIRECTION OF FAILURE
and a STEP. **Missing any of the five it is a deletion** - none below is, and
revision 1's RES-A39-13 and RES-A39-15, which the check correctly showed had a
direction of failure that could never transition, are rewritten rather than
re-filed. **A residual that is not in `docs/BACKLOG.md` does not exist**
(`docs/DEV_LOOP.md` step 0), so each is owed an entry there **at disposal, by
whoever lands the next A39 chunk** - `DEV_LOOP.md`'s "Record disposals as they
happen" clause, which revision 1 deferred to "whoever lands the next chunk"
without saying when.

### 11.1 Numbering

Revision 1 reused `RES-A39-4/5/6/7` for residuals the census gives different
meanings. Every id below carries the **`RES-A39A-`** prefix, so a citation of
`RES-A39A-5` in `docs/BACKLOG.md` cannot be confused with the census's
`RES-A39-5`. The census-to-here map is 9.3.

### 11.2 The register

| id | Residual | Owner | Instrument | Object | Direction of failure | Step |
|---|---|---|---|---|---|---|
| RES-A39A-1 | **Every interaction count in the census and in this document is a reading claim.** W1-3, W5-2 route here | **Repo owner**, in a real browser | walk path A cold and count the acts against census section 2 | the act count per path | the owner's count differing from the census tables | the owner verification pass, after wave 1 |
| RES-A39A-2 | **Path H sends `"<course> - <assignment>"` as the assignment description** (`steps.grading-cartridge.ts:95`), so the cheapest path grades against the least information. The cleared-rubric half is closed by wave 2 (6.6) | the chunk whose write set includes `src/lib/workflows/registry/steps.grading-cartridge.ts` - no wave here does | a unit test over the FormData that step builds | the `assignmentInstructions` field the step sends | **RED on today's code** - it must be watched failing before it is fixed | the first chunk that touches cartridge grading |
| RES-A39A-3 | **The Route Handler's request-body cap is undeclared.** DECISION 6 moved the per-item call off `next.config.ts`'s `serverActions.bodySizeLimit: "10mb"`, which governs Server Actions only (4.4) | **Repo owner**, against the deployment; then wave 4's implementer | one real POST to `/api/grade-run-item` with a body at the design constant, and one above it | the largest per-item request body the deployment accepts | **a run in which every image-bearing submission fails transport and every text submission succeeds, with each failure isolated into an ordinary failed row so the run reports complete** | before `ITEM_REQUEST_BYTE_BUDGET` is raised above its conservative initial value; the constant ships with the config value and this residual's id in a comment beside it |
| RES-A39A-4 | **Time-to-first-readable-row cannot be measured here.** No API key | **Repo owner**, with real keys and a clock | one real run of at least five submissions, timed from Start Review | elapsed ms to the first readable row, before and after | unchanged, or total interactions rising to pay for the incremental delivery | the owner verification pass after wave 4 |
| RES-A39A-5 | **The rubric bank is unreachable on the default provider** (readers and writers both gated on `provider === "embedded"`: `grade/rubric.ts:252-256`, `grading.ts:796,848` against the ungated Gemini branch at `:864`). Withdrawn as this row's mechanism; wave 2 takes only `rubricFingerprint` out of it (5.2) | the next chunk proposing server-side rubric memory | the two greps in census 5.4, re-run | the set of `findRubricForTopic` / `rememberRubric` call sites and their enclosing branch | a reader or writer appearing outside an `embedded` branch, meaning the gate moved and census 5.4 is stale | before any design that proposes the bank |
| RES-A39A-6 | **The paste/drop intake primitive (research M3) is not designed here**, only its pure single-file half. Four traps fail only in a browser: synchronous harvest of `dataTransfer.items` before the first await; the `readEntries()` drain loop (Chromium yields 100 of 120 and reports success); `webkitGetAsEntry().isDirectory` rather than `kind`; and the WCAG 2.2 SC 2.5.7 single-pointer alternative, which **must not be deleted** | a later chunk, with **owner verification in a real browser as a required step, not an optional one** | `docs/a39-research.md` 2.2, each trap walked in a browser | a dropped folder of more than 100 files, and each of the four intake kinds | **a dropped folder of 120 files reporting fewer than it contains**, or any kind reachable only by dragging | after wave 1; **never merged into a wave whose other pass conditions are suite-checkable**, because it would borrow their green |
| RES-A39A-7 | **`src/app/actions/grading.ts` grew 12 lines under this document and has 83 left.** 905 when revision 1 measured it and when the round-1 check verified it; **917 now**, from an A38 chunk that landed mid-pass (0.8); wave 1 adds ~20 | wave 1's implementer, then the next chunk needing more than 60 lines there | `@(Get-Content src/app/actions/grading.ts).Count` (PowerShell) AND `git status --short` before the wave starts | that file's line count, and whether another agent is writing it | **greater than 945 at any wave gate**, or a wave-1 diff that also contains lines the wave did not author | at every wave gate from wave 1 onward; wave 1 re-measures BEFORE it estimates, because 905 is no longer the number |
| RES-A39A-8 | **A multi-submission zip not following the four-part convention silently mis-groups students** (`utils.ts:95-97` then `:121-126`), with the UI stating no requirement (`GradingTab.tsx:240`). Wave 1 removes it at N = 1 only | the chunk whose write set includes `src/lib/grade/utils.ts` - no wave here does | a unit test over `groupSubmissionsByStudent` with three non-conforming filenames | the returned entry count | **RED when three files collapse to fewer than three students** - today's behaviour | the first chunk touching ingestion beyond wave 1's single-file path |
| RES-A39A-9 | **A `.docx` renamed to `.zip` grades its own OOXML and reports success.** `TEXT_EXTENSIONS` (`office-extract.ts:13-52`) contains `"xml"` at `:18`; `JSZip.loadAsync` (`extraction.ts:117`) opens a `.docx`; `word/document.xml` is "supported"; `leafStemFallback` names the student `document`. W1-1 stops the app ever CLASSIFYING a `.docx` as a zip; it does not stop a renamed file | wave 1's implementer, then the chunk that owns `extraction.ts` | `npx vitest run src/lib/grade/single-file-entry.test.ts` for the classifier; a zip-magic sniff is NOT designed here | the classification of an uploaded file | **a run whose student column reads `document`** | W1-1 in wave 1; the renamed-file case stays open and is **not** claimed closed |
| RES-A39A-10 | **Per-submission cost on paths F and G is unmeasured** (census 7), so the census's path table is incomplete by two rows. Wave 3 persists a rubric there without changing that | Repo owner, or a chunk that can observe a real capture session | count the acts for one real three-student capture | the per-submission act count on F and G | a crossover being asserted for F or G without that count | whenever F or G is proposed as the fast path |
| RES-A39A-11 | **Two of the four new `ta-` keys are covered by NO exact-key-set canary**: `ta-grading-rubric-memory` (`src/app/components/` root) and `ta-cartridge-rubric` (`CartridgeDropPanel.tsx`). Neither location has one (1.9), and a canary over `src/app/components/` root would scan hundreds of files - a scoping question, not a wave-2 line. **Question Q2 asks the owner to settle it; this residual is what ships under answer (A)** | the chunk that next adds a persisted key outside `grading-recording/`, `snapshot-grading/`, `recording/` and `repo-grades/` | `grep -rln "ta-" src --include=*.structure.test.ts`, re-run, against `grep -rno "ta-[a-z-]*" src/app/components/*.tsx \| sort -u` | the set of persisted keys in the two uncovered locations | **a SIXTH persisted key appearing in either uncovered location** - a transition from the two this wave lands, not a restatement of today's state | measured at the wave-2 gate to establish the baseline count of two, and re-run by the next chunk that adds a key there |
| RES-A39A-12 | **Repo Grades keeps ONE GLOBAL rubric** (`ta-repo-grades-rubric`, `repoGradesUiState.ts:54`), the shape DECISION 3 names as a warning. This design does not re-key it: re-scoping mid-run would change the rubric a half-graded column is being graded against, and `:46-53` ties the single key to a one-course-at-a-time assumption this document has not audited | the chunk whose write set includes `src/app/components/repo-grades/repoGradesUiState.ts` | `repoGradesUiState.ts:46-53` read against `useRepoGradesBulkGrade.ts:446-460`'s shared-rubric prologue | the rubric text a bulk column run resolves | **a column graded with two different rubric texts within one run**, which is what a naive re-key would introduce | before any chunk re-keys that value; **not** inside waves 1-5 |
| RES-A39A-13 | **A persisted rubric lingers on the device for as long as the instructor stays signed in.** `client-state-sweep.ts:45`'s keep-list sweeps it on a change of owner, which answers the cross-user half of the dropped policy and not the other half (6.5). **Question Q3 asks the owner to settle it** | **Repo owner** - it is the cost DECISION 3 buys | `DEVICE_PREFERENCE_KEYS` at `client-state-sweep.ts:45`, plus the four keys in 6.2 | what survives on a shared device between sessions of the same signed-in user | **any of the four keys appearing in `DEVICE_PREFERENCE_KEYS`**, which would make them survive a sign-OUT too and is the opposite, worse failure | stated in the replacement comments wave 3 writes (6.1); escalated once as Q3, never re-raised |
| RES-A39A-14 | **No instrument in this repo can tell whether an affordance is discoverable**, and this design adds five (widened intake copy, restored rubric field, "Rubric used", progress, "Stop grading"). W2-7, W2-8, W4-8 and W5-3 pin DOM order, a height cap and two spellings; they cannot see a label the instructor does not recognise, a control hidden by CSS, or a closed habit | **Repo owner**, and the chunk that next adds a control to a grading surface | the owner opening each surface cold and saying what they looked for first; plus W2-7/W2-8/W4-8/W5-3 as the buildable floor | whether each new affordance is found without being told where it is | **an affordance that is present, wired, gate-green and reported as missing** - the exact A17 outcome | escalate once with wave 2; never re-raised. **Do not let those four pass conditions be read as discoverability coverage** |
| RES-A39A-15 | **"Start Review" sits below auto-growing textareas, and this design caps only the three it writes.** `a17-discovery.md` 5.2's house default is 79 of 82 files. Wave 2 caps `GradingTab.tsx:297,313` and `CartridgeDropPanel.tsx:409`; `ClassTrendsDraftPanel.tsx` and the two panels wave 3 writes are unaudited. **Revision 1's version scoped its own fix out with "in scope only if that wave already writes it" while wave 2 DID write the file - that contradiction is removed: `CartridgeDropPanel.tsx` is capped in wave 2 and asserted by W2-7** | the chunk whose write set includes `GradingRecordingPanel.tsx`, `SnapshotGradingPanel.tsx` or `ClassTrendsDraftPanel.tsx` | `grep -n "multiline" <file>` against `grep -n "maxRows" <file>`, plus the index of the file's primary action control | each grading surface's action control against the content above it | **an action control whose index in source is greater than that of an uncapped multiline field** | in wave 3, as a read-only check over the two panels it writes; elsewhere, at the next chunk touching that file |
| RES-A39A-16 | **The cold navigation cost (two clicks to reach Grading) and the default landing view are untouched.** `useAppNavigation.ts:104` defaults `activeTab` to `"manual"`, `:156-189` to `"course-planning"`. Research M1 wants the first graded result before anything | **Repo owner** - a default landing is a product decision with blast radius far beyond grading | the census's COLD column for path A, re-walked | the act count from a cold profile to the first grade | a cold count that does not fall after wave 1, meaning wave 1's saving is warm-path only | escalate with wave 1's result; do not change a default landing inside a grading row |
| RES-A39A-17 | **`action-guard-coverage.test.ts` cannot see a Route Handler**, because `collectActionExports` skips every file for which `isUseServerModule` is false (`:123`). Measured: `find src/app/api -name "route.ts" \| wc -l` is **20**, of which **12 call no guard**. W4-10 binds the ONE handler this design adds; nothing binds the rest | the chunk that next adds a route handler, or a security chunk | a structural test walking `src/app/api/**/route.ts` and asserting each exported `POST`/`GET` calls a guard, with a 12-entry allowlist that may only SHRINK - the exact ratchet shape `action-guard-coverage.test.ts:41-47` already describes for actions | the set of unguarded route handlers | **a thirteenth unguarded route handler**, or any handler that spends a model call with no guard | before or alongside any later chunk that adds a route handler; **not** inside wave 4, which would be hand-rolling a repo-wide ratchet inside a feature wave |
| RES-A39A-18 | **`INCREMENTAL_CONCURRENCY = 3` with no inter-request spacer is evidence-backed, not proven.** The engine's 1200ms sleep (`gemini.ts:67`) never fires for a single-element call (`engine.ts:277`), and path E has run at 3 with no spacing since A26 - but `vitest.setup.ts` throws on any real fetch, so no 429 can be produced here (4.7) | **Repo owner**, on a real run; then the chunk that owns `gemini.ts` | one real run of 40 on the default provider, with the run's status line read | the count of items failing with a provider-throttle message in one run | **more than one throttle failure in a single run**, which is the signal the bound is wrong for this provider | the owner verification pass after wave 4, together with RES-A39A-4's timing run |
| RES-A39A-19 | **A pending submission produces no row, so the instructor sees how many are outstanding but not WHICH** (4.5). Accepted in exchange for removing a false sentence from an editable, persistable field | the chunk that next designs the incremental run's table, with the owner's judgement on whether it matters | the owner watching one real run of 40 and saying whether the missing names cost anything | what the instructor can name while a run is in flight | **the owner asking mid-run "which students are left" and having no answer on screen** | raised with RES-A39A-4's owner run; **a placeholder row is only acceptable if it carries a sentence true on every reachable state**, which is what A31 Ruling 1 requires and what revision 1's `run-deadline` reuse failed |

---

## 12. Terminating questions for the owner

There is no revision 3. Each question below is shaped so **every possible
answer ends the activity** - each names what ships under each branch, and none
asks what a further round should explore.

**Q1 - does wave 4 ship inside A39, or as its own row?**
The reframe (section 0) shows wave 4's concurrency machinery is a port and its
transport, pinning, reconciliation and provenance are not, so it is smaller
than scoped but still the largest wave. Waves 1-3 and 5 deliver the N = 1
remedy, the rubric memory, the provenance receipt and the credential route
without it.
**(A) SHIP AS FIVE WAVES** - A39 lands complete, wave 4 last, and RES-A39A-3,
-4, -18 and -19 all come due at one owner verification run.
**(B) SHIP WAVES 1, 2, 3, 5 AS A39; wave 4 becomes its own backlog row**,
scoped from section 4 unchanged, and scheduled after the owner has used waves
1-2 on a real assignment - which is also when RES-A39A-4's "before" measurement
can be taken honestly.
**Recommendation: (A).** Waves 3 and 4 are disjoint and can run concurrently
(section 8), so (B) buys sequencing this plan does not need; and the whole-run
kill at N = 40 is the census's cause 1.

**Q2 - the two `ta-` keys with no exact-key-set canary.**
DECISION 3 requires the relevant canary be bumped in the same commit.
`ta-grading-rubric-memory` and `ta-cartridge-rubric` land in two locations that
have none (1.9), and inventing a root-level canary inside a feature wave is the
thing `iteration-caps.md` calls hand-rolling.
**(A) SHIP WITH TWO UNCOVERED KEYS.** Wave 2 lands as written; RES-A39A-11 is
the record, with a direction of failure that transitions on a sixth key. Cost:
two persisted keys no gate will notice drifting.
**(B) SCOPE A ROOT-LEVEL CANARY AS ITS OWN ROW**, over `src/app/components/`
non-recursively plus `CartridgeDropPanel.tsx`, landing before or with wave 2.
Cost: one more row, and a scan whose scope somebody has to decide.
**Recommendation: (A).** This is `iteration-caps.md` disposal (b) - a reduce,
named as one - and the residual's instrument is real either way.

**Q3 - the rubric lingering on this device while you stay signed in.**
`client-state-sweep.ts:45` sweeps every new `ta-` key on a change of signed-in
owner, so the cross-user half of the dropped policy is answered. The other half
- "nothing about it lingers once the instructor moves on" - is not.
**(A) ACCEPT IT.** Ships as designed; wave 3's replacement comments say so in
source, and RES-A39A-13 records it.
**(B) ADD AN EXPLICIT CLEAR.** A "Forget this rubric" control on each surface,
a named extra line in waves 2 and 3, persisting nothing new.
**Recommendation: (A).** It is the cost DECISION 3 buys and it is now visible
in two source comments and one residual; (B) adds a control to four surfaces to
solve a problem the sweep already solves across users.

**Q4 - is the Server Action form of the per-item call needed by anything
else?**
DECISION 6 says this is not settled by it. Measured: `gradeOneSubmissionAction`
(`grading.ts:597-643`) is the only existing per-submission action and its three
references are its declaration and `steps.grading-singles.ts:3,238` - an
unattended workflow step, which is not on this seam.
**(A) NO OTHER CALLER - the per-item call is the Route Handler only.** Ships as
section 4 describes.
**(B) SOMETHING ELSE NEEDS IT** - name it, and wave 4 adds a thin
`"use server"` wrapper around the same body, guarded by `requireUser()`, which
`action-guard-coverage.test.ts` then does cover.
**Recommendation: (A)**, on the measurement above. I raise it only because
DECISION 6 explicitly left it open.

---

## 13. Gates run over this file

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Exit code read from a file rather than a pipe, plus `git status --short`
proving the write set is this file and nothing else, are reported in the
author's hand-off.

