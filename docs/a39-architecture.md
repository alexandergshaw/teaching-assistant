# A39: the architecture of the remedy

Backlog row A39. This document consumes `docs/a39-census.md` (commit 66e8104),
`docs/a39-research.md` (commit ecdc5f8), `docs/owner-decisions-2026-09-23.md`
DECISION 3 (commit d8819a0) and `docs/a17-discovery.md` section 5 (commit
cb4e446), and decides SHAPE: where each seam falls, what is
one layer versus two, which object each requirement binds to, and in what order
the waves land. It writes no code.

**Every quantity below names the command that produced it.** Commands were run
from the repo root on 2026-09-23, through the Bash tool (Git Bash) unless
marked PowerShell. Every absence claim is paired with a canary run through the
same instrument in the same call, and no absence grep is piped through `head`.
**Nothing renders under vitest here** (`docs/loop/this-repo.md` sections 2 and
6), so every interaction count is a READING claim traced from a control to its
handler, and no pass condition in section 8 is satisfied by a render.

---

## 0. Five things that changed between the brief and this document

My brief handed me three design targets from the census. Re-measuring the tree
disagreed with the census on two of them, the research pass falsified a premise
under the third, the owner settled the fork I was told to design both branches
of, and a sibling pass limited what the census's numbers can be used for. All
five are resolved in place rather than appended as caveats, because each moves
the shape.

| # | What the brief/census said | What the tree, the research or the owner says | Consequence for the design |
|---|---|---|---|
| 1 | The fast paths "are gated on a credential the instructor cannot set" (`canvas-credentials.ts:130`), owner-only, "an instructor cannot pay this from inside the app at all" | **FALSE.** `:130` is the OWNER-ONLY FALLBACK branch. `resolveCanvasCredential` (`canvas-credentials.ts:189-227`) tries the CALLER'S OWN STORED CREDENTIAL FIRST (`:193-196`), and there is a full in-app UI to set it (`src/app/account/integrations/LmsCredentialSection.tsx:196` calling `saveLmsCredentialAction`, `src/app/account/integrations/lms-actions.ts:259`) | Target 3 stops being "defer an unpayable gate" and becomes "the gate is payable and unreachable from where it is felt" - a ROUTE, not a deferral. Section 7 |
| 2 | "A chat can never remember a rubric" (brief); census 5.1 treats memory as the app's categorical advantage | **FALSE** - `docs/a39-research.md` 5.3, sourced to Anthropic Projects. Also false: "a chat cannot write grades back" (research 5.4, a community Canvas MCP server documenting `grade_submission`) | The leverage claim cannot rest on memory or on write-back. It rests on **per-submission isolation under identical terms** (research 5.1) and **version provenance** (research 5.3). Section 3 |
| 3 | Design both branches of the rubric non-persistence policy; RES-A39-1 is escalated and not a gate | **SETTLED.** `docs/owner-decisions-2026-09-23.md` DECISION 3: **drop the policy, persist the rubric.** With four named consequences: delete the policy where it is ASSERTED, specify RETRIEVAL not just storage, do not copy the global-value shape, and record WHICH VERSION graded which submission | No fork. Section 6 is single-branch, and it now writes the two files that assert the policy. RES-A39-1 is discharged, not carried |
| 4 | (not in the brief) | **Design for N = 1** - the coordinator's rule. The chat's cost is fixed and this app's is marginal, so the curves cross; an instructor who loses on their first assignment never reaches the N where batching pays | Changes the WAVE ORDER from what the census's ranking implies, and surfaces a cost the census listed as unmeasured. Section 2 |
| 5 | The census's crossover table is the comparison: "six of seven paths already beat the chat" | **Valid only for a path the instructor has already FOUND.** `docs/a17-discovery.md` section 5 traced a shipped, fully wired feature reported as ABSENT - its true interaction count is infinity while every instrument in this repo reports two clicks. The chat's discovery cost is zero | The design owes a naming contract, a placement contract and an instrument for both, and must say what nothing here can catch. Sections 2.1, 2.2, W2-7, W4-8, RES-A39-17, RES-A39-18 |

### 0.1 Three census citations that do not resolve

Measured by opening each line. Small, and stated because a citation nobody
opened is how this repo has been misled before.

| Census says | At that line I actually found | Correct citation |
|---|---|---|
| section 6 item 1: `engine.ts:206` sequential loop | `:206` is a comment; the `for` is at `:207` | `engine.ts:207` (the census's own section 2.1 gets this right) |
| section 6 item 1: `engine.ts:277` 1.2s sleep | `:277` is the `if (interRequestDelayMs > 0 ...)` guard; `await sleep(...)` is at `:278` | `engine.ts:278` (2.1 right again) |
| section 6 item 1: `GradingTab.tsx:365` renders nothing until `run.results.length > 0` | `:365` is `{testState.error && ...}`. The results gate is `:426`; the empty state is `:368` | `GradingTab.tsx:426` |

The census's section 2.1 is correct throughout; only its section 6 summary
drifted. The FINDING is unaffected - I re-derived it from `:207`, `:229`, `:278`
and `:426` directly rather than inheriting it.

---

## 1. What is actually true in the tree, re-measured

Every row was produced by opening the cited line in this checkout today.
Nothing below cites the census or the research for a fact about this tree.

### 1.1 The blocking run

```
sed -n '178,400p' src/lib/grade/engine.ts
```

- `gradeStudentEntries` declared at `engine.ts:178`.
- The loop: `for (let i = 0; i < limitedEntries.length; i += 1)` at `:207`.
- One model call per student: `await gradeSubmission(...)` at `:229`.
- `await sleep(interRequestDelayMs)` at `:278`.
- Capped by `.slice(0, maxSubmissions)` at `:193`.
- **The whole `GradingRun` is assembled and returned once, at `:395-399`.**
- Between the loop and that return, `:332-393` performs CANONICAL-COLUMN
  RECONCILIATION, which **mutates** `result.rubricAreas` (`:373`) and
  `result.overallComment` (`:371`) on every row. Section 5.1 turns on this.

The attended caller is `gradeAction` (`src/app/actions/grading.ts:705`). Its
Gemini zip branch at `:870-874` runs `gradeSubmissions` alongside
`synthesizeFullCreditChecklist` and `generateSampleAnswer` in one
`Promise.all`, so a zip run is **N + 2 model calls in one Server Action
invocation**, N + 3 when the rubric is synthesized at `:866`.

The UI gate is `GradingTab.tsx:426`: `source !== "livefeed" && run &&
run.results.length > 0`, where `run` is `state.run` (`:133`), the single return
value of the `useActionState` in `src/app/page.tsx`.

### 1.2 The platform ceiling, and this repo's own established remedy

```
grep -rn "maxDuration" src --include=*.ts --include=*.tsx | grep -v "\.test\."
grep -rn "maxDurationNoSuchThing" src --include=*.ts --include=*.tsx   # canary, exit 1, no output
```

57 lines. `src/app/page.tsx` is not among them - the absence the census names
is real, with the canary firing on the same instrument in the same call. What
the output also shows, and the census did not use, is that **this repo has
solved this class four times and written the rule down**:

- `src/app/api/course-intel/ask/route.ts:48-59`: "`maxDuration` only at the
  PAGE level, and src/app/page.tsx ... makes the deployment FAIL TO BUILD
  there. So `maxDuration` below is 60"; declared at `:134`.
- `src/app/api/class-trends-insight/route.ts:30-33`: `maxDuration = 60`,
  "Hobby's hard cap".
- `src/lib/visualizer/selection-coverage.ts:35-59`: move it "onto a Route
  Handler with an explicit `maxDuration`".
- `src/app/actions/grading-submission-grade.ts:51-58`, about a GRADING loop
  specifically: "this repo's production deployment is Vercel Hobby with a 60s
  function cap, and an unbounded sequential-call loop is exactly what would
  blow through it."

**A Route Handler with `maxDuration = 60` does not save a run of N students.**
It raises the ceiling from an undeclared default to sixty seconds, and the same
all-or-nothing kill happens at sixty. At `1.2 * (N - 1)` seconds of deliberate
sleep alone (`gemini.ts:67`, `DEFAULT_INTER_REQUEST_DELAY_MS`), N = 40 spends
46.8s sleeping before one model latency is counted. Section 4 says what the
answer is instead.

### 1.3 The precedent that IS the answer, already shipped on a sibling surface

```
grep -n "for (\|gradeRepoAction\|runWorker\|establishSharedRubric" \
  src/app/components/repo-grades/useRepoGradesBulkGrade.ts
```

`src/app/components/repo-grades/useRepoGradesBulkGrade.ts` (489 lines,
`@(Get-Content).Count`, PowerShell) is a **client-side bounded-concurrency
worker pool over a per-item Server Action**:

- `BULK_GRADE_CONCURRENCY = 3` (`repoGradesBulkGrade.ts:143`).
- `runWorker` at `:466-475` pulls the next index off a shared cursor;
  `await Promise.all(Array.from({ length: workerCount }, () => runWorker()))`
  at `:478`.
- **One `gradeRepoAction` call per repo** at `:282-291`, so no single function
  invocation spans more than one model call and the platform clock resets on
  every one.
- **Per-target failure isolation**: `.catch(...)` at `:291` maps a transport
  rejection onto the same `{ error }` shape; the module header at `:32-43`
  states why a pool over a shared cursor is required rather than `Promise.all`.
- **A run lock in a `useRef`** at `:216`, claimed at `:228-229`, released in a
  `finally` at `:234-247` covering the rubric fetch AND the pool.
- **`establishSharedRubric`** at `:449-460`: with a blank rubric, ONE target is
  graded alone first and its effective rubric is reused verbatim by every later
  target (`:446`, `:458`, `:471`). `:405-424` records why - the owner's own log
  of "denominators of 100, 400, 40 and 16 across eleven students in one run."
- **Results land per cell as they arrive** (`onCellUpdate` at `:273`, `:322`);
  `progress` is `{done, total}` (`:218`).

There is no streaming transport in this repo to copy instead:

```
grep -rn "text/event-stream\|EventSource" src --include=*.ts --include=*.tsx
#   -> only workflow-triggers' own getEventSource(), unrelated to the browser API
grep -rn "getReader()\|TextDecoderStream" src --include=*.ts --include=*.tsx   # exit 1, no output
grep -rn "ReadableStreamNoSuchThing" src                                        # canary, exit 1
```

`ReadableStream` appears once, at `src/app/api/lms-export/selection/route.ts:541`,
converting a Node zip stream for download. **A streamed response would be a new
transport invented in a repo that renders no component under test; a client
pool is a shipped, tested, adversarially-reviewed pattern twenty metres away.**

### 1.4 The rubric, per surface, and the policy the owner just dropped

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
- `repoGradesUiState.ts:54` `ta-repo-grades-rubric`, restored at `:199`. Its
  comment block at `:46-53` justifies the key's SHAPE on simplicity ("this view
  only ever has one course active at a time") and raises no sensitivity
  objection at all.
- The dropped policy is asserted in exactly two places, and both statements
  become false: `RubricInputModal.tsx:28-34` ("NOTHING here persists it ... a
  rubric is exactly as sensitive as a syllabus ... nothing about it lingers")
  and `SnapshotGradingPanel.tsx:142-147` (the same, extended to
  `assignmentText`).

**The line those authors actually drew, which matters for what replaces them.**
`SnapshotGradingPanel.tsx:147-157` persists `instructorInstructions` under a
`ta-` key eight lines below refusing to persist `rubricText`, with the
discriminator stated verbatim: that field "is not captured or transcribed
material ... and it carries none of the 'unreleased assignment content'
sensitivity RubricInputModal.tsx's U10 note is about." Section 6.1 uses this to
write the replacement comments, because a deletion with nothing in its place is
how the next pass re-derives the old rule.

One mechanism the policy comments do not account for:
`src/lib/client-state-sweep.ts` erases localStorage on every change of signed-in
owner by a KEEP-LIST (`DEVICE_PREFERENCE_KEYS = ["ta-theme"]`, `:46`), so any
new `ta-` key is swept by default. That answers the CROSS-USER half of the
policy's concern and not the "nothing lingers while I am signed in" half.
Section 6.5 states both halves rather than treating the sweep as a pass.

### 1.5 The one per-submission entry point that exists, and its defect

`gradeOneSubmissionAction` (`grading.ts:597-643`) has no attended UI caller
(`grep -rn "gradeOneSubmissionAction" src` returns exactly three lines: its
declaration and `steps.grading-singles.ts:3,238`). Two facts about its
signature decide section 4's contract:

1. It takes `(code, courseId, assignmentId, userId, provider)` and re-fetches
   the submission from Canvas at `:607`. **It cannot receive a zip entry at
   all**, so it is not the seam for path A - a design that assumed it was would
   have bound a requirement to an object that cannot satisfy it.
2. `:633-635` computes
   `effectiveRubric = meta.rubricText.trim() ? meta.rubricText : await generateRubric(instructions, gradeProvider)`
   **inside the per-call body**. Called twice for two students of one assignment
   with no Canvas rubric, it can synthesize two different rubrics - the exact
   defect `useRepoGradesBulkGrade.ts:405-424` exists to prevent, and the one the
   new seam must be constructed to make unrepresentable.

### 1.6 What the browser already receives

`GradeResultBase.submittedFiles: SubmittedFileInfo[]` (`types.ts:241`), and
`SubmittedFileInfo` carries `rawBase64?: string` (`types.ts:124`).
`engine.ts:242` pushes the entry's `submittedFiles` straight onto the result.
**Every submitted file's raw bytes already cross to the browser on every
attended run today.** Section 4.3 needs this: routing entry content through the
client adds a direction, not a class of exposure.

### 1.7 No runaway spend from a growing run

```
grep -n "useEffect\|fetch(\|onClick" src/app/components/drafted-grades/ClassTrendsPanel.tsx
```

`ClassTrendsPanel` is mounted by `GradingResults.tsx:607` whenever
`hasTrendableResults`. Its model call (`requestInsight`, hitting
`/api/class-trends-insight` at `:98`) is reached only from `onClick` at `:159`,
`:173`, `:196` - never from an effect. **A run whose `results` array grows 40
times fires zero extra model calls.** Checked because the brief forbids buying a
click with spend; it is clear.

### 1.8 The source-text tests that will go red if a wave ignores them

```
for n in "GradingTab.tsx" "actions/grading.ts" "grade/engine.ts" "grade/types.ts" \
         "lib/grade.ts" "app/actions.ts"; do
  echo "### $n"; grep -rl "$n" src --include="*.test.ts"; echo; done
```

```
### GradingTab.tsx
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts

### actions/grading.ts
src/app/actions/grading-missing-submissions.test.ts
src/app/actions/grading-run-mapping.test.ts
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
src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts
src/app/components/repo-grades/repoGradeScoreDisplay.test.ts
src/lib/github-grading-run-store.test.ts
src/lib/grading-drafts.test.ts

### lib/grade.ts

### app/actions.ts
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
```

**`src/app/components/autoGradeTransition.wiring.test.ts` is the one that will
bite, and it must be in the write set of every wave that edits
`GradingTab.tsx`.** It reads the file as source text (`:99`) after stripping
comments and asserts, among others:

- **A5** (`:159-162`): `formAction(` appears **exactly once in the whole file**.
- **A6** (`:164-189`): the loading-state brace span must contain
  `source !== "livefeed"` in a LIVE CONJUNCTION, plus `pending` and
  `styles.loadingState`, and **must contain no `||` anywhere in that span**.
- **A7** (`:192-200`): `disabled={pending}` appears **exactly 3 times** in
  `LiveFeedPanel.tsx`.

These are constraints on the design, not obstacles to route around. Sections
4.4, 6.6 and 8 discharge each one explicitly.

### 1.9 The exact-key-set canaries, located

DECISION 3 requires the relevant canary be bumped in the same commit as the
key. There are two, each directory-scoped, and I found them by grep rather than
by assuming which directory owns which:

| Directory | Canary | What it asserts | Bump needed |
|---|---|---|---|
| `src/app/components/grading-recording/` (path F) | `grading-rows.test.ts:678-687`, plus a second list at `:719-725` and the explanatory block at `:596-640` | the exact set of `ta-rec-grade-*` keys across every non-test file in the directory; today seven: `-assessment`, `-course`, `-declarations`, `-dismissed`, `-filter`, `-sort`, `-table` | **YES** - `ta-rec-grade-rubric` must be added to BOTH lists and to the comment block |
| `src/app/components/snapshot-grading/` (path G) | `snapshot-grading.structure.test.ts:176-205`, plus the comment at `:125-131` | the exact set of `ta-snap-*` keys; today four: `ta-snap-armed-role`, `ta-snap-auto-grade-armed`, `ta-snap-grading-instructions`, `ta-snap-table`. **Its own test name at `:195` says "U10 keeps shot bytes and rubric/assignment text out of localStorage"** | **YES** - add `ta-snap-rubric` and `ta-snap-assignment`, and rewrite that test NAME, which asserts the dropped policy in prose |
| `src/app/components/` root (path A) and `CartridgeDropPanel.tsx` (path H) | **none** | - | **No canary exists.** Stated rather than implied: `ta-grading-rubric` and `ta-cartridge-rubric` are covered by no exact-set test, and this design does not invent one (RES-A39-13) |

I initially recorded the grading-recording canary as ABSENT because
`recording-split.structure.test.ts` scans `src/app/components/recording/`
non-recursively (`:81`, `:279-290`) and does not reach the sibling directory.
That was wrong, and grep corrected it - `grading-rows.test.ts` owns it. The
false-absence is recorded because it is exactly the failure this loop's search
card exists to prevent.

### 1.10 Line counts, both instruments

PowerShell: `foreach ($f in $files) { "{0}`t{1}" -f @(Get-Content $f).Count, $f }`.
Bash: `wc -l < $f`. **The two agreed on every file below.** (They disagree only
with `Measure-Object -Line`, never used here: on `docs/a39-census.md`,
`@(Get-Content).Count` = 652 and `wc -l` = 652 while `Measure-Object -Line`
returns 525 - a 127-line gap, not the 132 my brief quoted. The brief's figure is
close but not what this checkout produces; the two instruments that matter
agree.)

| File | `@(Get-Content).Count` | `wc -l` | Headroom to 1001 |
|---|---|---|---|
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | **990** | 990 | **10** |
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | **970** | 970 | **30** |
| `src/app/components/GradingResults.tsx` | **906** | 906 | 94 |
| `src/app/actions/grading.ts` | **905** | 905 | 95 |
| `src/app/components/ContentTab.tsx` | 895 | 895 | 105 |
| `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | 822 | 822 | 178 |
| `src/app/components/grading-recording/grading-rows.test.ts` | 733 | 733 | 267 |
| `src/app/components/LiveFeedPanel.tsx` | 719 | 719 | 281 |
| `src/app/page.tsx` | 703 | 703 | 297 |
| `src/app/components/CartridgeDropPanel.tsx` | 544 | 544 | 456 |
| `src/lib/grade/engine.ts` | 498 | 498 | 502 |
| `src/app/components/repo-grades/useRepoGradesBulkGrade.ts` | 489 | 489 | 511 |
| `src/app/components/GradingTab.tsx` | 476 | 476 | 524 |
| `src/lib/grade/types.ts` | 406 | 406 | 594 |
| `src/lib/grade/utils.ts` | 393 | 393 | 607 |
| `src/app/components/grading-recording/RubricInputModal.tsx` | 375 | 375 | 625 |
| `src/lib/grade/extraction.ts` | 300 | 300 | 700 |
| `src/lib/canvas-credentials.ts` | 228 | 228 | 772 |
| `src/lib/research/rubric-bank.ts` | 120 | 120 | 880 |
| `src/app/actions.ts` | 77 | 77 | 923 |
| `src/lib/grade.ts` | 19 | 19 | 981 |

`src/file-size-ceiling.structure.test.ts:39` sets `LIMIT = 1000`; `:140` fails
on `lineCount > limit`, so 1001 is red. Its `ALLOWED_OVERAGE` map (`:75-92`)
holds exactly four entries, all `*.test.ts`, all "already over the ceiling
before this gate existed". **No wave below proposes an overage entry.**

**The top two rows are a hard finding, not an estimate.** The owner's decision
to persist the rubric lands on paths F and G, whose panels are 10 and 30 lines
from the ceiling. **An extraction precedes the feature on both**, and it is
scheduled as the first half of its own wave in section 8. Section 5.3 does the
per-wave arithmetic.

---

## 2. The problem restated: the loss is at N = 1, and it is the zip

The census's verdict is that clicks are not the loss, and I accept it: on
interaction count, six of seven costed paths beat `2 + N` by N = 5 and four beat
it by N = 2 (census section 3). Nothing below reduces clicks as an end.

But the census's own section 7 lists, under "what I could not measure", **"the
cost of PRODUCING the zip on paths A and H."** With the N = 1 rule applied, that
unmeasured cost is not a footnote - **it is the largest single item on the first
assignment**, which is the only assignment the instructor evaluates the app on.

Trace it. An instructor with ONE submission in hand - a `.docx` downloaded from
Canvas, a PDF, a pasted paragraph - meets this:

- `GradingTab.tsx:236-239`: `<input type="file" accept=".zip,application/zip">`.
  The only intake is a zip.
- `GradingTab.tsx:240`: the entire stated requirement is "Upload a zip archive
  that contains the student submissions."
- `grading.ts:820-821`: no file, no grade.
- `engine.ts:403-424`: `gradeSubmissions` opens the buffer with
  `JSZip.loadAsync` and walks it.
- `utils.ts:87-107` `matchStudentFileConvention` needs **at least four
  underscore-separated parts** (`:95-97`); anything else falls through to
  `leafStemFallback` (`:121-126`), which takes the leading alphanumeric run of
  the stem as the student's identity.

So at N = 1 the app charges two navigation clicks, **constructing a zip around
one file**, naming it to a convention stated nowhere, two pastes, a submit, and
then the whole-run wait. The chat charges three pastes and answers after the
third.

There is a sharper edge on the same line. `TEXT_EXTENSIONS`
(`src/lib/office-extract.ts:13-52`) contains `"xml"`. A `.docx` **is** a zip. An
instructor who renames their submission to `.zip` to satisfy the input gets a
run in which JSZip walks the OOXML parts, `word/document.xml` is "supported",
and `leafStemFallback` names the student `document`. **The app does not error -
it grades the wrong thing and reports success.** Measured, not hypothesised
(RES-A39-11).

**THE RULING THAT ORDERS THE WAVES: the N = 1 remedy is to stop requiring a
container for a single submission, and it precedes everything else**, including
incremental delivery. `docs/a39-research.md` 7.4 reaches the same ordering from
the outside view for a different reason ("M4 ... should never be scheduled ahead
of M1 or M2"), which is corroboration, not the argument.

### 2.1 The axis the census cannot see: an interaction count measures a path the user has already found

`docs/a17-discovery.md` (commit cb4e446) section 5 establishes a limit that
binds every number in the census, and I am not re-deriving it - it is another
pass's measured work and it is cited, not repeated. Its class is **an affordance
that was RELOCATED rather than ADDED, with the user's prior path closed and no
instrument able to notice**, and it traced one shipped, fully wired feature that
read as ABSENT to the person who built it: the old route (pressing a button
again) was closed by a guard added to that same button, and the replacement was
placed below two full-height renderings of a text body, neither height-capped.
**Its true interaction count is infinity while every instrument in this repo
reports two clicks.**

**So the census's crossover table is valid ONLY for a path the instructor has
already found**, and this design does not rest on "six of seven paths already
beat the chat" without that qualifier. The chat has **no discovery cost at
all** - one text box, everything goes in it, nothing to find - and that is part
of why it feels faster on an axis the census does not measure and cannot.

Two of that pass's generalisations land directly on this design:

- **One act, five names** (`a17-discovery.md` 5.1): the "make this again" act is
  spelled `Regenerate`, `Regenerate announcement`, `Redraft`, `Redraft every
  reply` and a computed label across five files, **two of them in the same
  12-entry sub-tab strip**. A new affordance inherits that problem unless it is
  named the same thing everywhere the instructor might look.
- **The layout precondition is the house default** (`a17-discovery.md` 5.2): 79
  of 82 component files with a multiline TextField let it auto-grow, so "an
  action control beneath unbounded content" is the default shape here, not a
  one-off.

**And that second one is already true on the A39 path, today.**
`GradingTab.tsx:295-306` and `:311-322` are both
`multiline minRows={10} fullWidth` with **no `maxRows`**, and the "Start Review"
button is at `:343-356` - BELOW both. **Seam 2 makes it worse**: a restored
rubric and a restored description mean those two textareas arrive NON-EMPTY and
already ten rows tall, pushing the only control that starts a run further down
than it is today. A convenience feature that hides the button it feeds is
exactly the a17 shape, one scale down, and it would be invisible to every gate.
Wave 2 therefore caps both (`maxRows`), which three files in this repo already
do (`AiChatWindow.tsx`, `CopilotChatPanel.tsx`, `ModuleDeckSettings.tsx` -
`a17-discovery.md` 5.2).

### 2.2 What this design owes as a result: a naming contract, a placement contract, and an instrument for both

**THE NAMING CONTRACT.** This design adds or changes user-facing affordances on
up to five surfaces. Each act gets ONE name, used everywhere the instructor
might look, fixed here so no wave invents a sixth spelling:

| Act | The one name | Every surface that must use it |
|---|---|---|
| supplying work to be graded | **"Submissions"** | `GradingTab.tsx:232` label (already this word), the widened copy at `:240`, and any later intake surface (RES-A39-8) |
| supplying the scoring criteria | **"Rubric"** | `GradingTab.tsx:310` (already), `CartridgeDropPanel.tsx:411` (already), `RubricInputModal.tsx`'s "Add rubric"/"Edit rubric" opener (already), `SnapshotGradingPanel.tsx` |
| starting the run | **"Start Review"** | `GradingTab.tsx:343-356` (already) - **not renamed by any wave**, because the instructor's existing habit is the cheapest path there is |
| stopping the run | **"Stop grading"** | the new cancel control (4.4); it must not be called Cancel on one surface and Stop on another |
| the rubric a run used | **"Rubric used"** | `RubricProvenance.tsx`, and it must match `useRepoGradesBulkGrade.ts:89`'s existing activity-log string `Rubric used: ...` rather than inventing a synonym |

**THE PLACEMENT CONTRACT.** No control this design adds may sit below unbounded
content. Concretely: the progress line, the **Stop grading** control and the
**Rubric used** line all render ABOVE the results region in DOM order, never
below the growing table and never below an uncapped textarea. The results table
is the unbounded content in this design, exactly as the draft body was in A17.

**THE INSTRUMENT, which is the part a17 5.4 says does not exist today.** That
pass's finding is that "a green suite in this repo is evidence about logic and
silence about findability", because nothing renders and structure tests are
hand-written per feature with nothing requiring them to cover a label or a
placement. That is true, and this design does not pretend otherwise. What IS
buildable, and is specified as W2-7 and W4-8, is a **source-text ORDERING
assertion**: the index of each new control's literal in `GradingTab.tsx` must be
less than the index of the `<GradingResults` mount, and `maxRows` must be
present on both textareas. `autoGradeTransition.wiring.test.ts` already reasons
by `indexOf` over stripped source (`:167`, `:194`), so the technique is in use
here rather than invented.

**Its honest limit, stated so nobody credits it with more:** it pins DOM ORDER
and the presence of a height cap. It catches the a17 rank-1 mechanism - a
control relocated below unbounded content. **It cannot catch a label the
instructor does not recognise, and it cannot catch a control being visually
hidden by CSS**, because nothing renders. Those stay with the owner
(RES-A39-17).

**What this document does NOT design, stated so the waves are honest.** The full
paste/drop intake primitive of research M3 is out. Its four correctness traps
(research 2.2: synchronous harvest of `dataTransfer.items` before the first
await; the `readEntries()` drain loop, since Chromium yields 100 of 120 and
reports success; `webkitGetAsEntry().isDirectory` rather than `kind`; and the
WCAG 2.2 SC 2.5.7 single-pointer alternative, which **must not be deleted**) all
fail only in a real browser, and this checkout renders nothing. Wave 1 takes
only the part of M3 that is **pure, server-side and testable as a plain `.ts`
leaf**: accepting a single non-zip file through the existing
`<input type="file">`. The drop target, the paste target and the folder walk are
RES-A39-8, with the four traps named and owned.

---

## 3. The leverage claim

Per `docs/loop/leverage.md`, a claim names a MECHANISM, says what the user does
instead today and what it costs them, and is proven by ONE criterion that goes
RED when the advantage is REMOVED.

**The claim is NOT "the app remembers your rubric."** That is falsified
(research 5.3: Anthropic Projects carry persistent per-project instructions and
uploaded knowledge, so an instructor pastes a rubric once, ever). DECISION 3
says so itself: "persistence alone is not leverage ... If the rubric is
persisted without recording which version graded which submission, this decision
buys convenience and no leverage at all."

### CLAIM 1 - VERSION PROVENANCE (class: GUARANTEED, earned)

**MECHANISM.** Every `GradingRun` carries `rubricUsed` (the exact text every row
was graded against) and `rubricFingerprint` (its content hash, computed
server-side by `rubricFingerprint`, `src/lib/research/rubric-bank.ts:28-30`).
Both are stamped at the engine's single return site and are **read back from the
run, never re-derived from the store**. Editing the stored rubric afterwards
therefore cannot change what a past run reports.

**WHAT THE USER DOES INSTEAD TODAY.** Puts the rubric in a chat project's
instructions or knowledge. **WHAT IT COSTS THEM:** project instructions can be
edited at any time with no record of what was in force when a given answer was
produced, so the instructor cannot answer "which rubric produced this grade" for
a grade a student is appealing. Nothing in a chat binds a version to an output.

**EARNED, not inherited.** `grep -rn "rubricUsed\|rubricFingerprint" src` returns
nothing today (canary: `grep -rn "rubricAreaNames" src` returns 47 lines through
the same instrument), so no comparable module has this for free. It is built
here.

**THE REMOVAL TEST** (`src/lib/grade/rubricProvenance.test.ts`, pass condition
W2-3). STATE THE DELETION: make `describeRunRubricProvenance(run, store)` read
the CURRENT store instead of `run.rubricUsed`/`run.rubricFingerprint`. TRACE THE
ASSERTION: the test grades a fixture run, mutates the store's rubric text, and
asserts the run's reported fingerprint is unchanged. With the deletion, the
observed fingerprint becomes the store's new one, so the assertion's value
changes. It is a pure-function assertion on typed data, which `leverage.md`
names as the honest limit here, and it is buildable - unlike a render.

### CLAIM 2 - PER-SUBMISSION ISOLATION UNDER IDENTICAL TERMS (class: SCALE, earned)

**MECHANISM.** One grading run resolves ONE rubric string and ONE ordered
criteria list before any submission is graded, and every one of the N model
calls receives that identical pinned text in its own isolated request carrying
exactly one submission.

**WHAT THE USER DOES INSTEAD TODAY.** Attaches forty files to one chat message.
**WHAT IT COSTS THEM:** that is not forty gradings. Submission 20 sits at the
position research 5.1 sources as the worst-served (Liu et al., TACL 2023, arXiv
2307.03172), competing with 39 others for attention, and its isolation from the
other 39 cannot be established.

**EARNED, not inherited.** The engine already pins criteria for a batch
(`engine.ts:197-198`), so the class exists here - but it is earned by THIS
design because the design's own new seam is the one place the property could be
lost, and the only per-submission entry point in the tree today loses it
(`grading.ts:633-635` regenerates a rubric inside the per-call body). Pinning is
the thing being built, not the thing being inherited.

**THE REMOVAL TEST** (`src/app/components/grading/incrementalRunPlan.test.ts`,
pass condition W4-3). STATE THE DELETION: remove `pinned.rubric` from the
request `buildRunItemRequests` constructs, so each item call arrives with an
empty rubric and `gradeRunItemAction` falls through to its own generation.
TRACE THE ASSERTION: the test builds a plan over three tickets and asserts
`new Set(requests.map(r => r.rubric)).size === 1` AND that the single member is
byte-identical to `pinned.rubric`. With the field deleted the observed set is
`{""}` - size 1, but the second half's value changes.

### What I am NOT claiming

Incremental delivery (section 4) removes a DEFICIT; it is not leverage.
Persisting the rubric (section 6) is CLICK-COST, which `leverage.md` struck as
non-categorical and requires be named as click-cost rather than dressed up -
section 6.3 names it. Write-back is not claimed as a capability at all (research
5.4: community MCP servers document `grade_submission` against a personal access
token); the honest form is setup cost removed, and nothing here changes it
either way.

---

## 4. Seam 1: incremental delivery, which is the same change as survival

### 4.1 The ruling

**A client-driven bounded-concurrency pool over a per-item Server Action** - not
a streamed response, and not a Route Handler with `maxDuration = 60`.

| Candidate | Delivers row 1 early? | Survives N large? | Precedent here |
|---|---|---|---|
| Route Handler + `maxDuration = 60` | No - still one terminal response | No - 46.8s of the budget is sleep alone at N = 40 (`1.2 * 39`, `gemini.ts:67`) | Four instances (1.2) |
| Streamed NDJSON/SSE | Yes | **No** - one invocation still dies at its cap; it only makes the rows before the kill visible | **None** (1.3, with canary) |
| **Client pool over a per-item action** | **Yes** | **Yes - every call is one model call, so the platform clock resets on each** | `useRepoGradesBulkGrade.ts`, shipped, with a lifecycle test |

The brief asked whether "a design that streams is also a design that survives,
and those may be the same change." They are the same change only for the third
candidate, which is the whole reason to pick it.

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
RETURNS new rows; it never writes `result.rubricAreas` or
`result.overallComment` in place. Section 5.1 is why that word is load-bearing.

**`src/app/actions/grading-incremental.ts`** - new `"use server"` file, new
rather than an addition to `grading.ts` for the ceiling reason in 5.3.

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

export async function gradeRunItemAction(
  ticket: GradingRunTicket,
  pinned: PinnedGradingContext
): Promise<{ results: GradeResult[] } | { error: string }>;
```

`prepareGradingRunAction` does once, before any grading call, everything the run
must not do N times: `requireOwner()`; extract entries
(`extractStudentEntries`, `extraction.ts:134`, for a zip;
`extractCanvasEntries`, `:146`, for a URL); resolve the rubric
(`rubric.trim() || await generateRubric(...)`, the same branch
`grading.ts:864-866` runs today); compute `criteriaNames` with
`extractRubricCriteria` (`rubric.ts:27`, pure and synchronous); and compute
`rubricFingerprint`.

`gradeRunItemAction` calls `gradeEntries` (`engine.ts:457`) with a
**single-element array** and the pinned rubric. It contains **no
`generateRubric` call and no `fetchCanvasMeta` call** - the constructed
prevention of the `grading.ts:633-635` defect, pinned by W4-4.

**`src/app/components/grading/incrementalRunPlan.ts`** - PURE, client-safe, no
server imports. Holds `buildRunItemRequests`, `mergeArrivedResults`,
`INCREMENTAL_CONCURRENCY = 3` (matching `BULK_GRADE_CONCURRENCY`). This leaf
exists so claim 2's removal test has a testable object.

**`src/app/components/grading/useIncrementalGradingRun.ts`** - the pool, ported
structurally from `useRepoGradesBulkGrade.ts`: a `useRef` run lock
(`:216,228,244`), a shared cursor with `INCREMENTAL_CONCURRENCY` workers
(`:466-478`), per-item `.catch` mapping a transport rejection to the same
`{ error }` shape (`:291`), `finally`-released state (`:234-247`). It adds one
thing that hook lacks: cancellation (4.4).

### 4.3 Where the submission content lives, and why it crosses the client

- **Canvas (B/C)**: the ticket is `{canvasUrl, userId, student}` - a few dozen
  bytes. The server re-derives the submission, as `grading.ts:607` already does.
  **No content crosses the client.**
- **Zip (A)**: entries can only be produced by opening the archive server-side
  (`extraction.ts:31` uses JSZip; `office-extract.ts:179` needs `officeparser`,
  which `next.config.ts` pins as a `serverExternalPackages` entry). So
  `prepareGradingRunAction` returns the entries and each item call sends ONE
  back.

Three measured facts make that acceptable rather than a hidden cost:

1. **Not a new exposure class** - 1.6: every submitted byte already reaches the
   browser on every attended run today. This adds a direction, not a recipient.
2. **Linear, not quadratic** - the corpus comes down once and goes back up once,
   split across N calls. The zip is never re-uploaded.
3. **The per-request budget is 10 MB**, set explicitly by `next.config.ts`
   `experimental.serverActions.bodySizeLimit: "10mb"`.

**The failure mode, stated rather than discovered later.** One entry whose
`rawBase64` images push its serialized request past 10 MB fails transport. The
`.catch` turns that into an ordinary failed row rather than a wedged run, so the
run survives - but the row fails for a reason the instructor cannot act on.
**DIRECTION OF FAILURE: a run in which every image-bearing submission fails and
every text submission succeeds.** So `buildRunItemRequests` measures each
request's serialized length, and `prepareGradingRunAction` returns
`{ mode: "whole-run", reason }` when any single entry exceeds the budget,
sending that run down today's existing path unchanged. That is RES-A39-5's
instrument, and it is why `mode: "whole-run"` is in the contract rather than
being a later patch.

### 4.4 Ordering, partial failure, the not-yet-reached row, and cancellation

**ORDERING.** The pool is unordered by construction, so rows arrive out of
order. The table must NOT reorder itself as rows land - a row moving under the
reader's cursor is worse than a late row. So `prepareGradingRunAction` returns
tickets in the source order the engine would have used,
`mergeArrivedResults` writes each arrival at its `sourceIndex`, and the
accumulator is **a full-length array seeded with one placeholder row per
ticket**, never an append-only list. `GradingResults.tsx` already sorts through
`useResultsSort`, so the instructor's own sort is unaffected.

**THE ROW NOT YET REACHED.** Not a new UI state and not an empty row. It is
`UngradedResult` with `{ kind: "not-attempted", stoppedBy: "run-deadline" }` -
the member the engine already appends at `engine.ts:299-311`, whose copy already
exists (`UNGRADED_NOT_ATTEMPTED_MESSAGES`, `types.ts`) and whose disclosure leaf
already renders it (`src/app/components/grading-results/ungradedDisclosure.ts`).
A pending row is a not-attempted row not yet replaced. **No new discriminant, no
new copy sheet, nothing for the switch's exhaustiveness to grow.** This is the
largest reuse in the design and it is why the run can be rendered by an
unchanged `GradingResults`.

There is a live caveat, already a backlog fact: `docs/backlog.yml` A39's
neighbour A31 records that `stoppedBy: "run-deadline"` "is copy for a state its
own surface cannot reach" because only four unattended step files write
`runDeadlineMs`, and names as its DIRECTION OF FAILURE "a fifth writer outside
those four step files, which means the member has gone live on the review
table." **This design is that fifth writer**, recorded as RES-A39-4 rather than
quietly landed, because A31 asks to be told.

**PARTIAL FAILURE.** Per item, isolated, exactly as
`useRepoGradesBulkGrade.ts:272-297`: `gradeRunItemAction` never throws (it
returns `{ error }`), and the call site's `.catch` maps a transport rejection
onto the same shape. A failed item becomes a `grading-failed` row carrying
`GRADING_FAILURE_PREFIX` - the member `engine.ts:257-270` already builds. One
failure never aborts the pool.

**CANCELLATION.** A `cancelledRef` checked by `runWorker` at the top of each
iteration, before it claims the next index. Three properties: it **stops further
spend** (each un-started item is one model call not made), so it is added
without a confirmation and does not trade away the earned one (4.6); it **keeps
every row already graded**, with un-started rows staying `not-attempted`, which
is what they were; and it **never leaves the lock held**, released in the same
`finally` that `useRepoGradesBulkGrade.ts:234-247` uses - which that file's own
header records was added because a rejecting fetch once left the run stuck.
Cancel is a transient run control, not a setting, so it carries no `ta-` key
(4.6). **Its placement is fixed by 2.2 and is not a wave-level choice: the
"Stop grading" control and the progress line render ABOVE the results region,
never below the growing table.** A stop control placed under forty rows of
results is the `a17-discovery.md` rank-1 shape reproduced inside the fix for it,
and W4-8 is the ordering assertion that catches it.

**THE CONSTRAINT 1.8 IMPOSES.** A5 pins `formAction(` to exactly one occurrence
in `GradingTab.tsx`, so the incremental path **does not add a second dispatch**:
the `<form>` at `:228` keeps its single `action={formAction}` and its single
call inside `handleAutoGrade`'s transition, and the incremental run is started
from the SAME submit, intercepted in the hook. A6 pins the loading span to a
`||`-free conjunction, so the progress line is a SEPARATE sibling region, never
a widening of that span. If wave 4 finds it cannot honour either, the test
changes in the SAME wave with the reason recorded; it is in the write set for
exactly that reason.

### 4.5 Why `mode: "whole-run"` stays in the contract forever

Three real states route to it: any single entry over the byte budget (4.3);
`provider === "other"`, which posts a whole base64 archive to an external engine
(`grading.ts:825-827`) and has no per-student decomposition at all; and
`provider === "embedded"`, which grades in-process with no model call
(`grading.ts:832-857`), so incremental delivery buys nothing and `attachCodeRuns`
(`:849`) is already a pooled batch. Keeping the old path reachable is not a
hedge - it is the correct answer for three enumerated cases.

### 4.6 The two constraints the brief will not let me trade

**PERSISTENCE.** Seam 1 adds no new persisted CONTROL. Cancel is a run action,
progress is derived, the accumulator is run state; nothing here should survive a
reload. The constraint bites in seam 2 and is honoured there (6.5).

**THE EARNED CONFIRMATION.** "Start Review" (`GradingTab.tsx:343-356`) is the
single act that commits to N model calls. **It is not removed, not merged into
the file picker, and not made implicit.** Research 6.1 rules that a confirmation
on spend naming the amount is the one that is earned; this design keeps it and
makes it MORE informative rather than cheaper, because `prepareGradingRunAction`
returns `tickets.length` before any grading call is made, so the button can
state how many submissions are about to be graded. Same one click, carrying a
number it does not carry today.

---

## 5. What the seams cost, and the ceiling arithmetic

### 5.1 Why reconciliation must become a projection

The shape decision with the widest blast radius, so it is argued.

`engine.ts:332-393` today MUTATES rows. If the incremental path called that code
after each arrival, it would re-run a mutation over already-mutated rows:

- When `extractRubricCriteria(rubric)` returns criteria, `canonical` is fixed
  before the loop and re-running is idempotent - every row's areas already equal
  the canonical names, strays already folded and removed.
- When it returns NOTHING, `canonical` is derived from "the student the model
  gave the most areas" (`:337-344`), and that set **grows as rows arrive**. A row
  reconciled against a 3-name set has already had a stray folded into
  `overallComment` and deleted from `rubricAreas`. If that stray later becomes
  canonical, re-running produces a row carrying the text in `overallComment` AND
  a blank column for the same criterion. **Today's whole-run output has
  neither.**

Two defensible fixes. Rejecting one on the record:

- **REJECTED: refuse the incremental path when `criteriaNames` is empty.** Sound
  and cheap, and it makes the divergence unrepresentable. Rejected because it
  silently routes exactly the rubrics that parse worst - the free-text ones an
  instructor is most likely to paste at N = 1 - back onto the blocking path,
  which is the path this row exists to fix.
- **ADOPTED: reconciliation becomes a PROJECTION re-derived from raw on every
  arrival.** Rows keep their model-returned areas; `reconcileRun` reads raw and
  RETURNS reconciled rows. Re-deriving from raw with a larger canonical set is
  then correct by construction, because nothing was destroyed.

`docs/loop/traps-spec.md:88-92` records this repo's own precedent for exactly
this choice: "the tombstone stopped being a RECORD and became a PROJECTION of
the live accumulator entry, re-derived on every advance ... Prefer the
construction that makes the banned state unrepresentable over the assertion that
it is absent."

Cost: `O(N)` short-string comparisons per arrival, `O(N^2)` over the run, N
capped at `DEFAULT_MAX_SUBMISSIONS = 40` (`gemini.ts:32`). No model call, no
I/O.

**This is a change to a shared function and is NOT trivially revertible.**
`gradeStudentEntries` is reached by `gradeSubmissions`, `gradeEntries` and
`gradeCanvasUrl` in `engine.ts`, and through them by `steps.grading-run.ts`,
`steps.grading-draft-flow.ts` and `steps.grading-cartridge.ts`. **The invariant
wave 4 must hold: `gradeStudentEntries` returns byte-identical results before
and after.** Instrument: `src/lib/grade/engine.test.ts` and
`engine.ungraded.test.ts` pass unchanged, plus a **frozen-literal oracle** in
`reconcile.test.ts` - a literal fixture, never a comparison against the old
implementation (`docs/loop/traps-tests.md`, and this repo's own
refactor-disarms-tests memory). DIRECTION OF FAILURE: any change to a reconciled
row's `rubricAreas` names or order, or to `overallComment`.

### 5.2 The fingerprint has to move out of `rubric-bank.ts`

`rubricFingerprint` is at `src/lib/research/rubric-bank.ts:28-30` and depends on
`createHash` (`node:crypto`) and `cleanText` (`@/lib/embedded/scaffold`) only.
But the module it lives in also imports `getDbClient` and the Supabase
`Database` types (`:16-17`), so importing it into `engine.ts` would widen the
engine's runtime import graph to include a database client.

**So wave 2 extracts it**: `src/lib/research/rubric-fingerprint.ts` holds the
function, and `rubric-bank.ts` re-exports it so every existing caller is
unchanged. A ten-line move, and `src/lib/module-graph/runtime-import-graph.test.ts`
is the instrument that says whether the widening was avoided.

**Why the engine and not `grading.ts`**: stamping at `engine.ts:395-399`, the
single return site, covers all five entry points (zip, Canvas, entries, and the
three unattended workflow steps through them) in three lines, and costs
`src/app/actions/grading.ts` - at 905, the tightest non-panel file in this area -
nothing at all.

### 5.3 Per-wave ceiling arithmetic

`LIMIT = 1000`, red at 1001 (`src/file-size-ceiling.structure.test.ts:39,140`).
**No overage entry is proposed anywhere below.**

| Wave | File | Before | Est. delta | Est. after | Wave gate |
|---|---|---|---|---|---|
| 1 | `src/app/actions/grading.ts` | **905** | +20 | 925 | `-le 940` |
| 1 | `src/app/components/GradingTab.tsx` | 476 | +12 | 488 | -le 520 |
| 2 | `src/lib/grade/engine.ts` | 498 | +4 | 502 | -le 520 |
| 2 | `src/lib/grade/types.ts` | 406 | +6 | 412 | -le 430 |
| 2 | `src/app/components/GradingTab.tsx` | 488 | +30 (incl. `maxRows` on both textareas, 2.1) | 518 | -le 560 |
| 2 | `src/app/components/CartridgeDropPanel.tsx` | 544 | +14 | 558 | -le 600 |
| 2 | `src/app/components/GradingResults.tsx` | **906** | **+6** | 912 | `-le 925`; the provenance body lives in a leaf |
| 2 | `src/lib/research/rubric-bank.ts` | 120 | -8 | 112 | must not rise |
| **3** | `src/app/components/grading-recording/GradingRecordingPanel.tsx` | **990** | **extraction FIRST, then +10** | **target <= 940** | **`-le 940` - the extraction is the wave's first commit, not a follow-up** |
| **3** | `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | **970** | **extraction FIRST, then +14** | **target <= 940** | **`-le 940`, same rule** |
| 3 | `src/app/components/grading-recording/RubricInputModal.tsx` | 375 | -7 policy +12 | 380 | -le 420 |
| 3 | `src/app/components/grading-recording/grading-rows.test.ts` | 733 | +6 | 739 | -le 780 |
| 3 | `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | 822 | +10 | 832 | -le 880 |
| 4 | `src/lib/grade/engine.ts` | 502 | **-45** | 457 | must NOT rise |
| 4 | `src/app/components/GradingTab.tsx` | 518 | +45 | 563 | -le 620 |
| 4 | `src/app/actions.ts` | 77 | +1 | 78 | - |
| 4 | `src/lib/grade.ts` | 19 | +2 | 21 | - |
| 5 | `src/app/components/GradingTab.tsx` | 563 | +10 | 573 | -le 620 |
| 5 | `src/app/components/LiveFeedPanel.tsx` | 719 | +10 | 729 | -le 760 |

**Four files force structure, and they are called out rather than buried.**

- **`GradingRecordingPanel.tsx` at 990 and `SnapshotGradingPanel.tsx` at 970**
  have 10 and 30 lines of headroom. Persisting a rubric on either is impossible
  without shrinking them first. **Wave 3's first commit is the extraction, and
  its gate is `-le 940` BEFORE the feature commit lands.** The extraction target
  is chosen by that wave against the real file, not guessed here - but the SHAPE
  is fixed: a plain `.ts` leaf, never a `.tsx`, because nothing renders under
  vitest so logic in a `.tsx` cannot be tested at all
  (`docs/loop/this-repo.md` section 2). The directory already has shipped
  examples (`useSnapshotKeyboardShortcuts.ts`).
  **AND THE KNOWN TRAP, which the wave must budget for**:
  `docs/loop/this-repo.md:85-100` records that extracting a hook out of
  `SnapshotGradingPanel.tsx` typechecked and passed 311 tests and then failed
  `npm run lint` with two new errors naming `handleNextStudentConfirm`, a
  callback touching none of the moved code - React Compiler's
  `preserve-manual-memoization`, not `exhaustive-deps`. The shipped workaround
  is to keep the ref and its effect declared in the panel and pass the ref into
  the new hook as a parameter. **`npm run lint` is therefore a wave-3 gate, not
  an afterthought, and its baseline is 4 warnings / 0 errors**
  (`docs/loop/this-repo.md:78-83`).
- **`src/app/actions/grading.ts` at 905** has 95 lines of headroom. Wave 1 may
  spend 20; waves 2-5 may spend none - which is why `prepareGradingRunAction`
  and `gradeRunItemAction` go in a new file and why the provenance stamp goes in
  the engine (5.2). A file at 925 is one wave from the wall: **the extraction
  debt is RES-A39-9**, filed now rather than discovered at a gate.
- **`src/app/components/GradingResults.tsx` at 906** takes a 6-line mount and
  nothing else; the provenance body is a leaf for that reason alone.

The estimates are estimates. **The wave gate is `@(Get-Content <file>).Count` on
the real tree, never this table.**

---

## 6. Seam 2: the rubric is remembered, scoped, labelled and versioned

DECISION 3 settles the policy question: drop it, persist the rubric. It names
four consequences. Each has its own subsection below, because a decision
recorded and not discharged is how this repo has lost requirements before.

### 6.1 Consequence 1 - delete the policy WHERE IT IS ASSERTED

"Two source comments currently tell a reader the rubric is deliberately not
persisted. Leaving them while shipping persistence is how a future pass
'restores' the old behaviour believing it was intended."

Three places, all in wave 3's write set, and **a deletion is not enough - each
gets a replacement that records what changed and why**, or the next pass
re-derives the old rule from the silence:

| Where | What is there now | What replaces it |
|---|---|---|
| `RubricInputModal.tsx:28-34` | "the text is handed to the caller via onSubmit and NOTHING here persists it - no localStorage, no persisted-control key of any kind ... a deliberate exception to this repo's usual 'every new textbox persists' rule" | a comment naming `docs/owner-decisions-2026-09-23.md` DECISION 3, the key (`ta-rec-grade-rubric`), the canary that now covers it (`grading-rows.test.ts:678-687`), and the one surviving limit: the SHOT BYTES and the transcribed capture still do not persist, which was never the same question |
| `SnapshotGradingPanel.tsx:142-147` | the same, extended to `assignmentText` | the same, naming `ta-snap-rubric` and `ta-snap-assignment`, and preserving the file's own live distinction at `:147-157` (`instructorInstructions` persists because it is "not captured or transcribed material") - which is now the rule for the WHOLE file rather than an exception inside it |
| `snapshot-grading.structure.test.ts:195` | the test's own NAME asserts the policy in prose: "U10 keeps shot bytes and rubric/assignment text out of localStorage" | rewritten to assert only what survives - shot bytes out, rubric and assignment text in - in the same commit as the key (1.9) |

**DIRECTION OF FAILURE for this consequence, so it is checkable rather than
hoped:** a grep for the phrase "not persist" or "nothing ... persists" in either
panel directory returning a line that still claims the rubric is not stored,
after wave 3. Instrument:
`grep -rn "persists it\|not persisted\|out of localStorage" src/app/components/grading-recording src/app/components/snapshot-grading`.

### 6.2 Consequence 3 - key it to something the app actually knows

"Repo Grades already persists a rubric - as ONE GLOBAL VALUE for every
assignment (`ta-repo-grades-rubric`). Copying that shape would silently apply one
assignment's rubric to another."

**The defect the warning names is SILENCE, not reuse.** Reusing a rubric across
assignments is often exactly right; applying it without the instructor being
able to see that it happened is the defect. So the design answers it twice: with
a SCOPE KEY where the app knows one, and with a VISIBLE ORIGIN LABEL always -
including where it does not.

What the app actually knows, per surface, measured:

| Path | Scope the app knows at restore time | Key | Evidence it is known |
|---|---|---|---|
| B/C Canvas | the assignment URL, normalized | `canvas:<normalized url>` | `GradingTab.tsx:77` `canvasUrl` state, set before any retrieve |
| H cartridge | course label + assignment label | `cartridge:<course>|<assignment>` | `CartridgeDropPanel.tsx:40,44` already restore both from `ta-cartridge-course` / `ta-cartridge-assignment` |
| E repo-grades | course id + folder | `repo:<courseId>|<folder>` | `repoGradesUiState.ts:195` restores the course; `index.tsx:729` holds `selectedFolder` |
| A zip / single file | **NOTHING at restore time.** The field is typed before any file is chosen, and `GradingTab.tsx:445` passes `assignmentName=""` to `GradingResults` with its own note that "no assignment name source of truth exists on this classic zip/canvas path" | `upload:<uploaded file name>` **after** a file is chosen; before that, the LAST-USED entry, labelled | the file input at `:234-239` is the only identity the surface ever acquires |
| F recording / G snapshots | **NOTHING, ever.** `GradingRecordingPanel.tsx:700`'s own copy: "Nothing here is bound to a student record or posted to an LMS" | a single last-used slot | that line |

**THE RULING.** `src/lib/grade/rubric-memory.ts` is a pure leaf holding a MAP
from scope key to `{ rubric, instructions, savedAt }` under one `ta-` key per
surface. Where a scope is known, the entry for THAT scope is restored - a
different assignment never silently gets this one's rubric. Where no scope is
known (A before a file is chosen, F, G), the last-used entry is restored **and
the label says which scope it came from and when**, so cross-assignment reuse is
visible rather than silent. On path A, the moment a file is chosen, if that
file's scope has its own stored entry AND the field has not been edited since
restore, the entry is swapped and the label updates; if the field HAS been
edited, nothing is swapped, because overwriting typing is worse than a stale
label.

**Why per-surface keys rather than one shared key** - and this is not
cosmetic: the two existing canaries are directory-scoped regexes
(`/ta-rec-grade-[a-z-]*/g` at `grading-rows.test.ts:678`,
`/(?<![a-zA-Z])ta-snap-[a-z-]*[a-z]/g` at
`snapshot-grading.structure.test.ts:188`). A single shared key such as
`ta-rubric-memory` would match NEITHER, so the new storage would be invisible to
both canaries and DECISION 3's "bump the canary in the same commit" instruction
would be vacuous. Per-surface keys make the canaries bind:

| Surface | Key | Canary it must bump |
|---|---|---|
| A | `ta-grading-rubric-memory` | **none exists** (1.9) - RES-A39-13 |
| H | `ta-cartridge-rubric` | **none exists** (1.9) - RES-A39-13 |
| F | `ta-rec-grade-rubric` | `grading-rows.test.ts:678-687` AND `:719-725` AND the block at `:596-640` |
| G | `ta-snap-rubric`, `ta-snap-assignment` | `snapshot-grading.structure.test.ts:195-205` AND the comment at `:125-131` |
| E | unchanged (`ta-repo-grades-rubric`) | - |

**E is deliberately NOT re-keyed.** Re-scoping the Repo Grades rubric mid-run
would change the rubric a half-graded column is being graded against, and that
column's own comment (`repoGradesUiState.ts:46-53`) ties the single key to a
one-course-at-a-time assumption this document has not audited. It is the warning
DECISION 3 cites, not a file this design writes. **RES-A39-14** carries it, with
an owner, an instrument and a step - it is not left as an implied "someday".

### 6.3 Consequence 2 - the RETRIEVAL interaction, specified

"Persisting is not the same as making it cheap to reach ... the retrieval
interaction is part of this decision's delivery, not a follow-up."

Arithmetic in the census's own unit (focus + paste = ONE interaction):

- Re-pasting: **1**.
- Restoring automatically into the field: **0**.
- Picking from a named library: **1** - which TIES a paste and therefore does
  NOT satisfy the constraint on its own.

**THE RULING: auto-restore into the field, visibly, with no picker.** The field
IS the receipt - the instructor sees the exact text that will be used, in the
control that will submit it, with nothing to open. Research M2 reaches the same
conclusion and names the failure mode to design against: "the failure mode is
silent and produces wrong grades that look right ... This move is only safe WITH
the visible label, and a version that pre-selects without showing what was
selected is worse than the status quo. It must not be softened into a
confirmation dialog." A filled textarea plus the origin label from 6.2 is that
label; no confirmation is added, and none is removed.

**Honest naming, per `leverage.md`'s struck "click cost" row: this is a
click-cost saving of exactly 1 interaction per assignment, not integration and
not persistence-as-advantage.** The leverage is claim 1 in section 3, which is a
different mechanism that happens to ride on the same storage.

**A named rubric library is WITHDRAWN, not deferred** (section 9): at 1
interaction it ties a paste and fails this document's own metric, so it would
have to be justified on a cost this checkout cannot measure - the instructor
finding the rubric outside the app. **Enforcer it protected: none; it was never
built.** Anyone reviving it owes that measurement first.

**Two mechanics, because both have bitten this repo.** A `localStorage`-seeded
`useState` initializer never shows its restored value on an SSR'd surface; it
needs a mount effect (this repo's persisted-details-open-hydration memory, and
`SnapshotGradingPanel.tsx:159-160` says the same in source). And load/save live
in the pure leaf, modelled on `repoGradesUiState.ts:192-205`, which is also what
makes the retrieval testable without a render.

### 6.4 Consequence 4 - version provenance, or this buys nothing

"If the rubric is persisted without recording which version graded which
submission, this decision buys convenience and no leverage at all."

Discharged by claim 1 in section 3. Concretely:

- `GradingRun` gains `rubricUsed?: string` and `rubricFingerprint?: string`,
  stamped at `engine.ts:395-399` (5.2).
- **Both optional**, because `src/lib/github-grading-run-store.ts:282-289`
  parses a persisted `GradingRun` and returns `null` when a REQUIRED field is
  missing, while treating `speedGraderUrl` and `sampleAnswer` as optional. A
  required field would invalidate every stored run. **Instrument:
  `src/lib/github-grading-run-store.test.ts`, in wave 2's write set. DIRECTION
  OF FAILURE: a stored-run fixture that parsed before returning `null` after.**
- `src/app/components/grading-results/RubricProvenance.tsx`, a leaf mounted by
  `GradingResults.tsx` in 6 lines, states the fingerprint's short form, the
  scope it came from, and when it was saved.
- **The property that makes it chat-impossible, and the thing W2-3 asserts: the
  provenance line reads the RUN, never the store.** Editing the stored rubric
  after a run cannot change what that run says it was graded against.

### 6.5 The persistence constraint, and the half the sweep does not answer

Every new control persists under a `ta-` key: five new keys, listed in 6.2, each
either bumping its directory's canary or explicitly recorded as uncovered.

**None of them is added to `DEVICE_PREFERENCE_KEYS`** (`client-state-sweep.ts:46`).
That is the design, not an omission: being swept on a change of signed-in owner
is correct for user content. It answers the cross-user half of the dropped
policy's concern. **It does not answer the other half** - "nothing about it
lingers once the instructor moves on" - because a rubric now survives on this
device for as long as this instructor stays signed in. That is the cost the
owner's decision buys, stated here rather than papered over, and it is exactly
what the replacement comments in 6.1 must say.

### 6.6 Path H's ordering defect, which persistence reduces but does not close

`CartridgeDropPanel.tsx:334-341` is the file input; its `onChange` at `:338`
calls `handleFileSelect` (`:161`), which calls `saveCartridgeDrop` (`:210`)
immediately, reading `effective.rubricText`. The rubric box is at `:406-418`,
BELOW it. An instructor reading top to bottom picks the file first and uploads
with an empty rubric.

Persisting means the box is already filled when the file is picked, so the
common case stops failing, and deleting `setRubricText("")` at `:220` means the
second upload keeps it. **It does not close the case where the instructor edits
the rubric after choosing the file.** RES-A39-3 stays open, narrowed: seam 2
makes it rarer, not gone. Reordering the form or gating the upload on a
non-blank rubric is a UX decision outside this document's write set.

---

## 7. Seam 3: the credential is payable, and unreachable from where it is felt

Section 0 item 1 establishes that `resolveCanvasCredential`
(`canvas-credentials.ts:189`) reads the caller's own stored credential first
(`:193-196`) and falls back to the owner's env pair only when
`identity.role === "owner"` (`:220-225`). The census's P2 is wrong, and with it
the census's third verdict bullet.

The real defect is a ROUTE:

```
grep -rn "account/integrations" src --include=*.tsx --include=*.ts \
  | grep -v "\.test\." | grep -v "^src/app/account"
grep -rn "account/integrationsZZZ" src        # canary, exit 1, no output
```

Seven lines, of which exactly one is a link a user can follow:
`src/app/components/TopBar.tsx:435`. **Nothing on any grading surface routes
there.** An instructor who picks Live Feed and is told "Connect your Canvas
account for this institution in Settings."
(`CANVAS_CREDENTIAL_REQUIRED_MESSAGE`, `canvas-credentials.ts:77`) gets a
destination and no way to reach it.

**THE DESIGN.** A pure leaf, `src/lib/canvas-credential-cta.ts`, exporting
`isCanvasCredentialRequired(message)`, `CANVAS_CREDENTIAL_CTA_HREF =
"/account/integrations"` and a label. The predicate compares **by identity**
(`message === CANVAS_CREDENTIAL_REQUIRED_MESSAGE`, importing the constant),
never by a copied literal - the contract the constant's own doc comment states
at `canvas-credentials.ts:70-76`: "a surface that must render a designed empty
state (E8) catches this message by `=== CANVAS_CREDENTIAL_REQUIRED_MESSAGE`,
never by copying the string literal, so the two can never drift apart." The
callers are `GradingTab.tsx` (its `state.error` region at `:202-206`) and
`LiveFeedPanel.tsx`.

**CAN THE GATE BE DEFERRED RATHER THAN REMOVED - value first, provisioning
later?** Measured answer: **it already is, and the deferral already works.**
`ContentTab.tsx:772` renders the grading view OUTSIDE the `!loaded` course gate
at `:778` (census P9, re-opened and confirmed), and path A needs no credential
at all - `gradeAction`'s zip branch (`grading.ts:820-884`) never calls
`resolveCanvasCredential`. **An instructor who has paid nothing can already
reach a real grade on path A**, which is research M1's requirement, and after
wave 1 they can do it without owning a zip utility. Seam 3 is therefore not a
deferral; it is a route out of the one wall a Canvas-mode instructor hits.

**What an instructor without the credential can reach, for the copy:** paths A
(zip or, after wave 1, a single file) and H (cartridge drop) in full, including
the grades table, per-row feedback, editing and CSV export. What they cannot
reach: B, C, E, I, and posting grades back. That sentence is true on every
caller, which is the bar A31 ruling 1 sets for any sentence this app asserts.

---

## 8. The wave plan

Five waves. Each is independently pushable and independently valuable.

**Disjointness, computed rather than eyeballed.** Waves 1, 2, 4 and 5 all write
`GradingTab.tsx`, so they are sequential:

```
comm -12 <(sort wave1.txt) <(sort wave2.txt)
# -> src/app/components/GradingTab.tsx
comm -12 <(sort wave3.txt) <(sort wave4.txt)
# -> (empty)
```

**Waves 3 and 4 are disjoint by exact path and may run concurrently** - wave 3
lives entirely under `src/app/components/grading-recording/` and
`src/app/components/snapshot-grading/`, wave 4 under `src/lib/grade/`,
`src/app/actions/` and `GradingTab.tsx`. Both also carry a shared, invisible
resource: `npx tsc --noEmit` has exactly one caller
(`docs/loop/this-repo.md:131-137`), so the two waves may not typecheck at once.

**Why wave 4 (the census's cause 1, and my brief's headline) is fourth.**
Research 7.4 rules that streaming "should never be scheduled ahead of M1 or M2",
and section 2 rules the N = 1 cost is the zip. Delivering row 1 early is worth
nothing to an instructor who abandoned on the first assignment because they had
to build a zip. If the owner disagrees, **waves 3 and 4 can swap freely** - they
are disjoint, and wave 4 depends only on waves 1 and 2.

### Wave 1 - one submission needs no zip

The N = 1 wave. Every line of it is pure server-side or pure routing logic with
no browser-only failure mode.

| Path | New? | Why it is here |
|---|---|---|
| `src/lib/grade/single-file-entry.ts` | new | PURE. `classifyGradingUpload(name): "zip" \| "single" \| "unsupported"` and `buildSingleFileEntry(name, buffer): StudentSubmissionEntry \| null`. Reuses `getFileExtension`, `TEXT_EXTENSIONS`, `DOCUMENT_EXTENSIONS`, `extractTextFromBuffer` (`office-extract.ts:80,13,55,179`), `IMAGE_EXTENSIONS`, `getMimeType` (`grade/constants.ts:41,62`), `toPreviewContent` (`grade/utils.ts:49`). No new dependency |
| `src/lib/grade/single-file-entry.test.ts` | new | the oracle |
| `src/app/actions/grading.ts` | edit | **THE CALLER.** Routes a non-zip upload to `gradeEntries([entry], ...)` (`engine.ts:457`) instead of `gradeSubmissions`. +20 lines, gate in 5.3 |
| `src/app/components/GradingTab.tsx` | edit | **THE CALLER** of the widened intake. `accept` at `:238`, copy at `:240` |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **owned** | reads `GradingTab.tsx` as source text; A5/A6 (1.8) |
| `src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts`, `src/app/components/grading-results/gradingResultsHelpersEditState.test.ts` | **owned** | same instrument, same file |
| `src/app/actions/grading-missing-submissions.test.ts`, `src/app/actions/grading-run-mapping.test.ts`, `src/lib/grade/postable.test.ts` | **owned** | name `actions/grading.ts` (1.8) |
| `src/file-size-ceiling.structure.test.ts` | **owned, read-only** | the gate |

**PASS CONDITIONS.**

- **W1-1.** OBJECT: `classifyGradingUpload` over
  `{"a.zip", "essay.docx", "paper.pdf", "notes.txt", "shot.png", "x.exe"}`.
  INSTRUMENT: `npx vitest run src/lib/grade/single-file-entry.test.ts`.
  DIRECTION OF FAILURE: RED if `.docx` classifies as `"zip"` - the live hazard,
  because a `.docx` IS a zip and `JSZip.loadAsync` opens it (section 2).
- **W1-2.** OBJECT: `buildSingleFileEntry("essay.docx", buf)`. INSTRUMENT: same.
  DIRECTION OF FAILURE: RED if it returns more than one entry, if the entry's
  `student` is the empty string, or if it routes through
  `groupSubmissionsByStudent`, whose `leafStemFallback` (`utils.ts:121-126`)
  would name the student after the leading alphanumeric run of the stem.
- **W1-3, owner-only.** OBJECT: the interactions from a cold app to a first
  graded single submission, before and after. INSTRUMENT: the census
  walkthrough in a real browser. DIRECTION OF FAILURE: RED if the count does not
  fall, or if any removed interaction reappears after the result. **Nothing
  renders under vitest, so this is not a suite claim** - RES-A39-2.

### Wave 2 - the rubric is remembered on A and H, and the run records its version

Everything DECISION 3 asks for on the two surfaces that need no extraction
first. Wave 3 carries the same change to F and G, behind their extractions.

| Path | New? | Why it is here |
|---|---|---|
| `src/lib/research/rubric-fingerprint.ts` | new | the extraction in 5.2 |
| `src/lib/research/rubric-bank.ts` | edit | re-exports it; every existing caller unchanged |
| `src/lib/grade/rubric-memory.ts` | new | PURE, client-safe. Scope keys, the map, `describeRubricOrigin` - the label 6.2 and 6.3 both require |
| `src/lib/grade/rubric-memory.test.ts` | new | the oracle for scope keying and the label |
| `src/lib/grade/types.ts` | edit | `GradingRun.rubricUsed?`, `rubricFingerprint?` (6.4) |
| `src/lib/grade/engine.ts` | edit | **THE CALLER** of `rubricFingerprint`; stamps both at `:395-399` |
| `src/lib/grade/rubricProvenance.ts` | new | PURE `describeRunRubricProvenance(run)` - reads the RUN, never the store |
| `src/lib/grade/rubricProvenance.test.ts` | new | **W2-3, claim 1's removal test** |
| `src/app/components/GradingTab.tsx` | edit | **THE CALLER** of `rubric-memory` on path A. Also caps both textareas with `maxRows` (`:295-306`, `:311-322`) so a restored rubric does not push "Start Review" further below the fold - 2.1 |
| `src/app/components/CartridgeDropPanel.tsx` | edit | **THE CALLER** on path H; delete `setRubricText("")` at `:220` |
| `src/app/components/grading-results/RubricProvenance.tsx` | new | the provenance leaf |
| `src/app/components/GradingResults.tsx` | edit | **THE CALLER** of that leaf. +6 lines only |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **owned** | 1.8 |
| `src/lib/github-grading-run-store.test.ts`, `src/lib/grading-drafts.test.ts` | **owned** | parse a `GradingRun`; the optional-field claim in 6.4 is checked here |
| `src/lib/grade/engine.test.ts`, `src/lib/grade/engine.ungraded.test.ts`, `src/app/components/grading-results/ungradedDisclosure.test.ts`, `src/lib/code-runner.test.ts`, `src/lib/grade/grouping-zip-parents.wiring.test.ts` | **owned** | name `grade/engine.ts` (1.8) |
| `src/app/actions/grading-submission-grade.test.ts`, `src/app/components/grading-recording/copy-feedback.test.ts`, `src/app/components/grading-results/gradingResultsHelpers.test.ts`, `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`, `src/app/components/repo-grades/repoGradePostScore.test.ts`, `src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts`, `src/app/components/repo-grades/repoGradeScoreDisplay.test.ts` | **owned** | name `grade/types.ts` (1.8) |
| `src/lib/module-graph/runtime-import-graph.test.ts` | **owned** | 5.2's instrument: it says whether `engine.ts` widened into a database client |
| `src/file-size-ceiling.structure.test.ts` | **owned, read-only** | the gate |

**PASS CONDITIONS.**

- **W2-1, retrieval costs zero.** OBJECT: the interactions to apply a previously
  used rubric, and separately to apply a DIFFERENT one. INSTRUMENT: the leaf
  test for the first (a saved entry is returned by
  `loadRubricMemory(scope)` with no further call), the census walkthrough
  owner-confirmed for the second. DIRECTION OF FAILURE: RED if the first is
  greater than zero, or if the second is greater than today's cost - a default
  that makes the non-default case dearer has moved cost, not removed it.
- **W2-2, scope keying never silently crosses assignments.** OBJECT:
  `loadRubricMemory` for scope B after saving under scope A. INSTRUMENT:
  `npx vitest run src/lib/grade/rubric-memory.test.ts`. DIRECTION OF FAILURE:
  RED if scope B returns scope A's text **without** `describeRubricOrigin`
  naming scope A - the label is what makes the fallback legal, so the test
  asserts the pair, never the text alone.
- **W2-3, THE REMOVAL TEST for claim 1.** OBJECT: the fingerprint a finished run
  reports, before and after the STORE is mutated. INSTRUMENT:
  `npx vitest run src/lib/grade/rubricProvenance.test.ts`. DIRECTION OF FAILURE:
  RED if the run's reported fingerprint changes when the store changes.
  **Sabotage to prove it can fail**: make `describeRunRubricProvenance` read the
  store, watch it go red, restore.
- **W2-4, the stored-run parser.** OBJECT: an existing persisted-run fixture.
  INSTRUMENT: `npx vitest run src/lib/github-grading-run-store.test.ts`.
  DIRECTION OF FAILURE: RED if a fixture that parsed before returns `null` after
  - i.e. if either new field was made required.
- **W2-5, the engine did not widen.** OBJECT: `engine.ts`'s runtime import
  closure. INSTRUMENT:
  `npx vitest run src/lib/module-graph/runtime-import-graph.test.ts`.
  DIRECTION OF FAILURE: RED if a Supabase client entered it via the fingerprint
  import (5.2).
- **W2-6, all five keys together.** INSTRUMENT:
  `npm run test:paths -- src/lib/grade/rubric-memory.test.ts src/lib/grade/rubricProvenance.test.ts src/lib/github-grading-run-store.test.ts`
  (never a raw multi-path `vitest run`, which silently drops unmatched
  arguments - `docs/loop/this-repo.md:28-41`).
- **W2-7, the convenience did not hide the button it feeds** (2.1, 2.2).
  OBJECT: the stripped source of `GradingTab.tsx`. INSTRUMENT: a source-text
  assertion in `autoGradeTransition.wiring.test.ts` (or a sibling
  `*.wiring.test.ts` in the same directory) that BOTH the
  `id="assignment-instructions"` and `id="rubric"` TextFields carry a `maxRows`
  prop, and that the "Rubric used" literal's index is less than the index of
  `<GradingResults`. DIRECTION OF FAILURE: RED if either textarea is uncapped
  after a restored value can fill it, or if the provenance line renders below
  the results region. **Honest limit: this pins DOM order and a height cap, not
  visibility** - nothing renders here (RES-A39-17).

### Wave 3 - the policy is deleted where it is asserted, F and G persist

**Two commits, in this order, and the first is not optional.**

**Commit 3a, the extraction.** `GradingRecordingPanel.tsx` (990) and
`SnapshotGradingPanel.tsx` (970) each shrink to `<= 940` by moving a cohesive
piece into a plain `.ts` leaf in the same directory. GATE:
`@(Get-Content <file>).Count -le 940` for both, plus `npm run lint` at its
4-warning / 0-error baseline, because of the React Compiler trap in 5.3.
**No feature line lands in 3a.**

**Commit 3b, the feature.**

| Path | New? | Why it is here |
|---|---|---|
| (the two leaves 3a created) | new | carried in |
| `src/app/components/grading-recording/RubricInputModal.tsx` | edit | **DELETE the asserted policy at `:28-34`**, replace per 6.1 |
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | edit | **THE CALLER** - owns `ta-rec-grade-rubric` and passes the restored text into the modal |
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | edit | **DELETE the asserted policy at `:142-147`**, replace per 6.1; **THE CALLER** for `ta-snap-rubric` / `ta-snap-assignment` |
| `src/app/components/grading-recording/grading-rows.test.ts` | **edit, required** | the exact-set canary at `:678-687` and `:719-725`, plus the block at `:596-640` |
| `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | **edit, required** | the exact set at `:195-205` AND the test NAME at `:195`, which asserts the dropped policy in prose |
| `src/app/components/grading-recording/grading-rows.test.ts` also named above | - | listed once; it is both the canary and a source-text reader of the directory |
| `src/file-size-ceiling.structure.test.ts` | **owned, read-only** | the gate, run before AND after 3a |

**PASS CONDITIONS.**

- **W3-1, the extraction landed first.** OBJECT: both panels' line counts at the
  3a gate. INSTRUMENT: `@(Get-Content <file>).Count` (PowerShell). DIRECTION OF
  FAILURE: **greater than 940 at 3a, or any feature line present in 3a.** No
  `ALLOWED_OVERAGE` entry is acceptable.
- **W3-2, the policy is gone where it was asserted.** OBJECT: the two panel
  directories' source text. INSTRUMENT:
  `grep -rn "persists it\|not persisted\|out of localStorage" src/app/components/grading-recording src/app/components/snapshot-grading`.
  DIRECTION OF FAILURE: RED if any surviving line still tells a reader the
  rubric is deliberately not stored (6.1).
- **W3-3, the canaries bind.** OBJECT: the two exact key sets. INSTRUMENT:
  `npm run test:paths -- src/app/components/grading-recording/grading-rows.test.ts src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`.
  DIRECTION OF FAILURE: RED if a new key is present in source and absent from
  its expected set, **and equally RED if a key is added to an expected set that
  no source file actually reads and writes** - `snapshot-grading.structure.test.ts:216`
  already asserts the read+write wiring separately, and the new keys get the
  same treatment.
- **W3-4, lint did not regress.** OBJECT: `npm run lint`. DIRECTION OF FAILURE:
  a fifth warning, or any error (`docs/loop/this-repo.md:78-83`).

### Wave 4 - the run delivers row 1 while row 7 is still running

| Path | New? | Why it is here |
|---|---|---|
| `src/lib/grade/reconcile.ts` | new | PURE `reconcileRun` (4.2, 5.1) |
| `src/lib/grade/reconcile.test.ts` | new | frozen-literal oracle, never a comparison against the old implementation |
| `src/lib/grade/engine.ts` | edit | **THE CALLER**; `:332-393` becomes a call. Must SHRINK |
| `src/lib/grade.ts` | edit | barrel export of `reconcileRun` |
| `src/app/actions/grading-incremental.ts` | new | `prepareGradingRunAction`, `gradeRunItemAction` (4.2) |
| `src/app/actions/grading-incremental.test.ts` | new | W4-4 |
| `src/app/actions.ts` | edit | `export * from "./actions/grading-incremental"` - the barrel the client imports through |
| `src/app/components/grading/incrementalRunPlan.ts` | new | PURE plan leaf |
| `src/app/components/grading/incrementalRunPlan.test.ts` | new | **W4-3, claim 2's removal test** |
| `src/app/components/grading/useIncrementalGradingRun.ts` | new | the pool, the lock, cancellation |
| `src/app/components/GradingTab.tsx` | edit | **THE CALLER** of the hook and both actions |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **owned, expected to be touched** | A5 and A6 constrain this wave directly (1.8, 4.4) |
| `src/lib/grade/engine.test.ts`, `src/lib/grade/engine.ungraded.test.ts`, `src/app/components/grading-results/ungradedDisclosure.test.ts`, `src/lib/code-runner.test.ts`, `src/lib/grade/grouping-zip-parents.wiring.test.ts` | **owned** | the byte-identity invariant of 5.1 |
| `src/lib/module-graph/runtime-import-graph.test.ts`, `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | **owned** | name `app/actions.ts`; the first sees a new barrel edge |
| `src/file-size-ceiling.structure.test.ts` | **owned, read-only** | the gate |

**PASS CONDITIONS.**

- **W4-1, byte identity.** OBJECT: the `GradingRun` returned by
  `gradeStudentEntries` for one fixture, before and after the extraction.
  INSTRUMENT:
  `npm run test:paths -- src/lib/grade/engine.test.ts src/lib/grade/engine.ungraded.test.ts src/lib/grade/reconcile.test.ts`.
  DIRECTION OF FAILURE: RED on any change to a reconciled row's `rubricAreas`
  names or order, or to `overallComment`.
- **W4-2, idempotence, which is what makes incremental legal.** OBJECT:
  `reconcileRun(reconcileRun(raw, names).results, names)` against
  `reconcileRun(raw, names)`, with `names` GROWING between the two calls.
  INSTRUMENT: `npx vitest run src/lib/grade/reconcile.test.ts`. DIRECTION OF
  FAILURE: RED if they differ - which is exactly what the mutating version does
  (5.1).
- **W4-3, THE REMOVAL TEST for claim 2.** OBJECT: the set of `rubric` strings
  across `buildRunItemRequests(threeTickets, pinned)`. INSTRUMENT:
  `npx vitest run src/app/components/grading/incrementalRunPlan.test.ts`.
  DIRECTION OF FAILURE: RED if the set has more than one member, or if its one
  member is not byte-identical to `pinned.rubric`. **Sabotage**: delete
  `pinned.rubric` from the request, watch it go red, restore.
- **W4-4, no regeneration in the new seam.** OBJECT: the source text of
  `src/app/actions/grading-incremental.ts`. INSTRUMENT: a source-text assertion
  in its test that the file contains no `generateRubric(` and no
  `fetchCanvasMeta(`. DIRECTION OF FAILURE: RED the moment either appears -
  the `grading.ts:633-635` defect reappearing. It pins the FACT (no per-call
  resolution), not a spelling.
- **W4-5, ordering.** OBJECT: `mergeArrivedResults` applied in arrival order
  `[2, 0, 1]`. DIRECTION OF FAILURE: RED if any row's array index differs from
  its `sourceIndex`, or if the array's length changes during the run.
- **W4-6, cancellation costs nothing already paid.** OBJECT: the accumulator
  after cancelling with two of five arrived. DIRECTION OF FAILURE: RED if a
  graded row is discarded, or if any un-started row is anything other than
  `not-attempted`.
- **W4-7, owner-only.** OBJECT: wall-clock elapsed from Start Review to the
  first readable row, before and after. INSTRUMENT: the owner, with real keys,
  against a clock. **No API key exists here** (`docs/loop/this-repo.md` section
  6). RES-A39-6.
- **W4-8, the stop control is not buried under its own results** (2.2, 4.4).
  OBJECT: the stripped source of `GradingTab.tsx`. INSTRUMENT: a source-text
  ordering assertion in `autoGradeTransition.wiring.test.ts` that the index of
  the `Stop grading` literal and of the progress region are both less than the
  index of `<GradingResults`. DIRECTION OF FAILURE: RED if either renders below
  the results region - the `docs/a17-discovery.md` rank-1 mechanism reproduced
  inside the fix for it. **Also RED if the literal is spelled anything other
  than `Stop grading`** (2.2's naming contract), which is the only thing in this
  repo that can stop a sixth synonym appearing.

### Wave 5 - the credential has a route

**WRITE SET.** `src/lib/canvas-credential-cta.ts` (new, pure),
`src/lib/canvas-credential-cta.test.ts` (new),
`src/app/components/GradingTab.tsx` (**the caller**),
`src/app/components/LiveFeedPanel.tsx` (**the caller**),
`src/app/components/autoGradeTransition.wiring.test.ts` (**owned** - its A7 pins
`disabled={pending}` to exactly 3 occurrences in `LiveFeedPanel.tsx`, and a CTA
added near one must not become a fourth),
`src/file-size-ceiling.structure.test.ts` (owned, read-only).

**PASS CONDITIONS.**

- **W5-1.** OBJECT: `isCanvasCredentialRequired(CANVAS_CREDENTIAL_REQUIRED_MESSAGE)`
  and `isCanvasCredentialRequired("Some other error.")`. INSTRUMENT:
  `npx vitest run src/lib/canvas-credential-cta.test.ts`, which IMPORTS the
  constant and compares. DIRECTION OF FAILURE: RED if the module holds a copied
  literal, so a drift in `canvas-credentials.ts:77` fails here rather than
  silently.
- **W5-2, owner-only.** OBJECT: whether the link appears and is keyboard
  reachable. INSTRUMENT: the owner, in a browser. RES-A39-2.

---

## 9. Disposition of the census's residuals

The census is a measurement artifact, not a prior version of this design, so
there is no renumbering of a prior design to do. Its seven residuals are
dispositioned here; the id column was re-derived last, after every entry in
section 11 was written.

| Census id | Disposition | Where it goes |
|---|---|---|
| RES-A39-1 (rubric policy) | **DISCHARGED by the owner**, `docs/owner-decisions-2026-09-23.md` DECISION 3. Section 6 carries all four of its named consequences. **It is NOT carried forward as an open residual**, because carrying a settled decision as a residual is how a decision gets re-litigated | closed; the four consequences become W3-2, W2-1, W2-2 and W2-3 |
| RES-A39-2 (counts are reading claims) | **KEPT verbatim**, and extended: W1-3, W4-7 and W5-2 all route to it | RES-A39-2 below |
| RES-A39-3 (path H two labels + cleared rubric) | **PARTLY CLOSED, PARTLY KEPT.** Wave 2 closes the cleared-rubric half (`CartridgeDropPanel.tsx:220`). The two-label half (`steps.grading-cartridge.ts:95`) is untouched - no wave here writes that file | RES-A39-3 below, narrowed |
| RES-A39-4 (zip filename convention mis-groups) | **KEPT, blast radius reduced.** Wave 1 means a single submission never reaches `groupSubmissionsByStudent`, so it stops applying at N = 1. It still applies to every multi-submission zip | RES-A39-10 below, restated with wave 1's boundary |
| RES-A39-5 (no `maxDuration` on the attended run) | **CLOSED BY DESIGN, not by a `maxDuration`.** 4.1 rules that a Route Handler at 60s does not survive N = 40; the per-item pool does. The residual's own direction of failure ("a run of N students returning nothing rather than N-minus-some rows") is what W4-6 now asserts | discharged by wave 4; the instrument survives as W4-6 |
| RES-A39-6 (rubric bank unreachable on the default provider) | **WITHDRAWN as a mechanism, KEPT as a fact.** 6.3 rules against a library, so the bank is not proposed as the memory mechanism and its `provider === "embedded"` gates stay shut. **What IS taken from it is one pure function**, `rubricFingerprint`, extracted in 5.2. **Enforcer it protected: none** - it guarded a claim, not a behaviour | RES-A39-7 below, re-owned |
| RES-A39-7 (F/G per-submission cost unmeasured) | **KEPT verbatim** | RES-A39-12 below |

**And one withdrawal of my own, recorded so it is not a silent deletion**: a
NAMED RUBRIC LIBRARY with a picker. Withdrawn in 6.3 because at 1 interaction it
ties a paste and fails the brief's own "cheaper to reach than to re-paste"
constraint. **Enforcer it protected: none** - it was never built. Reviving it
requires first measuring the out-of-app find cost.

---

## 10. What I could not determine

Stated rather than filled in, per `docs/loop/this-repo.md` section 6.

- **Any wall-clock number.** No API key in this checkout, so the model latency
  the 1.2s sleep adds to is unmeasurable, and so is whether an attended run of N
  actually dies in production. `1.2 * (N - 1)` is arithmetic on `gemini.ts:67`,
  not an observation.
- **Whether the 10 MB per-request budget is ever exceeded in practice.** I can
  cite `bodySizeLimit: "10mb"` and the presence of `rawBase64`; I cannot cite the
  distribution of real submission sizes.
- **Anything a screen shows.** No component renders under vitest. Every
  interaction count above is a reading claim, and **no pass condition in section
  8 is satisfied by a render.**
- **Whether any affordance in this design is DISCOVERABLE.** W2-7 and W4-8 pin
  DOM order, a height cap and one label spelling, which is the most a source-text
  test can reach. They cannot tell whether an instructor recognises a name,
  whether CSS hides a control, or whether an existing habit was closed - which is
  precisely `docs/a17-discovery.md` 5.4's finding that "a green suite in this
  repo is evidence about logic and silence about findability." RES-A39-17.
- **Whether the census's own crossover numbers hold for an instructor who has
  not already found each path.** They do not measure discovery, and no
  instrument here can (2.1). The chat's discovery cost is zero and this app's is
  unmeasured, which is a gap in the comparison that no wave below closes.
- **Whether the four browser-only intake traps in research 2.2 bite.** They fail
  only at runtime in a browser; that is why the drop/paste primitive is
  RES-A39-8 and not a wave.
- **Which specific piece should come out of `GradingRecordingPanel.tsx` and
  `SnapshotGradingPanel.tsx` in commit 3a.** I measured the sizes and the
  requirement and named the SHAPE (a plain `.ts` leaf) and the trap (React
  Compiler), but I did not read either panel line by line, and naming an
  extraction target I have not read would be the thing this repo's traps card
  warns against.
- **Whether `client-state-sweep.ts` predates the rubric policy comments.** I did
  not run `git log` on either file. The mechanism is cited as it exists today,
  never as an argument about what its authors knew.
- **The real cost of finding a rubric outside the app.** Paid in a file manager
  or an LMS; nothing here can cite it. 6.3 declines to build on it rather than
  assuming it.

---

## 11. Residual register

Every entry names an OWNER, an INSTRUMENT, an OBJECT, a DIRECTION OF FAILURE and
a STEP. **Missing any of the five it is a deletion** - none below is. **A
residual that is not in `docs/BACKLOG.md` does not exist** (`docs/DEV_LOOP.md`
step 0), so each is owed an entry there by whoever lands the next A39 chunk.

| id | Residual | Owner | Instrument | Object | Direction of failure | Step |
|---|---|---|---|---|---|---|
| RES-A39-2 | **Every interaction count in the census and in this document is a reading claim.** W1-3, W4-7 and W5-2 all route here | **Repo owner**, in a real browser | walk path A cold and count the acts against census section 2 | the act count per path | the owner's count differing from the census tables | the owner verification pass, after wave 1 |
| RES-A39-3 | **Path H sends `"<course> - <assignment>"` as the assignment description** (`steps.grading-cartridge.ts:95`), so the cheapest path grades against the least information. The cleared-rubric half is closed by wave 2 | the chunk whose write set includes `src/lib/workflows/registry/steps.grading-cartridge.ts` - no wave here does | a unit test over the FormData that step builds | the `assignmentInstructions` field the step sends | **RED on today's code** - it must be watched failing before it is fixed | the first chunk that touches cartridge grading |
| RES-A39-4 | **Wave 4 is the FIFTH writer of `stoppedBy: "run-deadline"`, and `docs/backlog.yml` A31 asks to be told.** A31 records that member as "copy for a state its own surface cannot reach" because only four unattended step files write `runDeadlineMs` | wave 4's implementer, and the chunk that owns A31 | `grep -rn "runDeadlineMs\|\"run-deadline\"" src --include=*.ts --include=*.tsx \| grep -v "\.test\."` | the set of writers of that member | a writer outside `steps.grading-cartridge.ts`, `steps.grading-draft-flow.ts` and `steps.grading-run.ts` - the signal that the member has gone live on the review table and its copy must be re-read | in wave 4, before the pending-row rendering is accepted |
| RES-A39-5 | **The 10 MB per-request budget for an inline entry is a platform constant, not a measured distribution.** 4.3 designs a `mode: "whole-run"` escape | wave 4's implementer | `next.config.ts` `experimental.serverActions.bodySizeLimit`, plus a measured serialized length in `buildRunItemRequests` | one item request's serialized byte length | **a run in which every image-bearing submission fails and every text submission succeeds** | in wave 4; the budget must be a named constant with the config value beside it, never a literal |
| RES-A39-6 | **Time-to-first-readable-row cannot be measured here.** No API key | **Repo owner**, with real keys and a clock | one real run of at least five submissions, timed from Start Review | elapsed ms to the first readable row, before and after | unchanged, or total interactions rising to pay for the streaming | the owner verification pass after wave 4 |
| RES-A39-7 | **The rubric bank is unreachable on the default provider** (readers and writers both gated on `provider === "embedded"`: `grade/rubric.ts:252-256`, `grading.ts:796,848` against the ungated Gemini branch at `:864`). Withdrawn as this row's mechanism; the fact stands, and wave 2 takes only `rubricFingerprint` out of it | the next chunk proposing server-side rubric memory | the two greps in census 5.4, re-run | the set of `findRubricForTopic` / `rememberRubric` call sites and their enclosing branch | a reader or writer appearing outside an `embedded` branch, meaning the gate moved and census 5.4 is stale | before any design that proposes the bank |
| RES-A39-8 | **The paste/drop intake primitive (research M3) is not designed here**, only its pure single-file half. Four traps fail only in a browser: synchronous harvest of `dataTransfer.items` before the first await; the `readEntries()` drain loop (Chromium yields 100 of 120 and reports success); `webkitGetAsEntry().isDirectory` rather than `kind`; and the WCAG 2.2 SC 2.5.7 single-pointer alternative, which **must not be deleted** | a later chunk, with **owner verification in a real browser as a required step, not an optional one** | `docs/a39-research.md` 2.2, each trap walked in a browser | a dropped folder of more than 100 files, and each of the four intake kinds | **a dropped folder of 120 files reporting fewer than it contains**, or any kind reachable only by dragging | after wave 1; never merged into a wave whose other pass conditions are suite-checkable, because it would borrow their green |
| RES-A39-9 | **`src/app/actions/grading.ts` reaches 925 lines after wave 1** (905 measured, +20 estimated), 75 from the ceiling | the next chunk needing more than 75 lines there | `@(Get-Content src/app/actions/grading.ts).Count` (PowerShell) | that file's line count | **greater than 940 at any wave gate** - an extraction precedes the feature, and **no `ALLOWED_OVERAGE` entry is acceptable** (`src/file-size-ceiling.structure.test.ts:75-92` holds four entries, all pre-existing test files) | at every wave gate from wave 1 onward |
| RES-A39-10 | **A multi-submission zip not following the four-part convention silently mis-groups students** (`utils.ts:95-97` then `:121-126`), with the UI stating no requirement (`GradingTab.tsx:240`). Wave 1 removes it at N = 1 only | the chunk whose write set includes `src/lib/grade/utils.ts` - no wave here does | a unit test over `groupSubmissionsByStudent` with three non-conforming filenames | the returned entry count | **RED when three files collapse to fewer than three students** - today's behaviour | the first chunk touching ingestion beyond wave 1's single-file path |
| RES-A39-11 | **A `.docx` renamed to `.zip` grades its own OOXML and reports success.** `TEXT_EXTENSIONS` (`office-extract.ts:13-52`) contains `"xml"`; `JSZip.loadAsync` opens a `.docx`; `word/document.xml` is "supported"; `leafStemFallback` names the student `document`. W1-1 stops the app ever classifying a `.docx` as a zip; it does not stop a renamed file | wave 1's implementer, then the chunk that owns `extraction.ts` | `npx vitest run src/lib/grade/single-file-entry.test.ts` for the classifier; a zip-magic sniff is NOT designed here | the classification of an uploaded file | **a run whose student column reads `document`** | W1-1 in wave 1; the renamed-file case stays open and is not claimed closed |
| RES-A39-12 | **Per-submission cost on paths F and G is unmeasured** (census 7), so the census's path table is incomplete by two rows. Wave 3 persists a rubric there without changing that | Repo owner, or a chunk that can observe a real capture session | count the acts for one real three-student capture | the per-submission act count on F and G | a crossover being asserted for F or G without that count | whenever F or G is proposed as the fast path |
| RES-A39-13 | **Two of the five new `ta-` keys are covered by NO exact-key-set canary**: `ta-grading-rubric-memory` (`src/app/components/` root) and `ta-cartridge-rubric` (`CartridgeDropPanel.tsx`). Neither directory has one (1.9), and this design does not invent one - a canary over `src/app/components/` root would scan hundreds of files and is a scoping question, not a wave-2 line | the chunk that next adds a persisted key outside `grading-recording/`, `snapshot-grading/`, `recording/` and `repo-grades/` | `grep -rln "ta-" src --include=*.structure.test.ts`, re-run | the set of directories carrying an exact-key-set canary | a new persisted key landing in a directory with no canary and nobody noticing, which is today's state for these two | escalate with wave 2; **do not** hand-roll a root-level canary inside a feature wave |
| RES-A39-14 | **Repo Grades keeps ONE GLOBAL rubric** (`ta-repo-grades-rubric`, `repoGradesUiState.ts:54`), which is the shape DECISION 3 names as a warning. This design does not re-key it: re-scoping mid-run would change the rubric a half-graded column is being graded against, and `:46-53` ties the single key to a one-course-at-a-time assumption this document has not audited | the chunk whose write set includes `src/app/components/repo-grades/repoGradesUiState.ts` | `repoGradesUiState.ts:46-53` read against `useRepoGradesBulkGrade.ts:446-460`'s shared-rubric prologue | the rubric text a bulk column run resolves | **a column graded with two different rubric texts within one run**, which is what a naive re-key would introduce | before any chunk re-keys that value; **not** inside waves 1-5 |
| RES-A39-15 | **A persisted rubric now lingers on the device for as long as the instructor stays signed in.** `client-state-sweep.ts:46`'s keep-list sweeps it on a change of owner, which answers the cross-user half of the dropped policy and not the other half (6.5) | **Repo owner** - it is the cost DECISION 3 buys, and only the owner can say it is still acceptable once it is visible | `DEVICE_PREFERENCE_KEYS` at `client-state-sweep.ts:46`, plus the five keys in 6.2 | what survives on a shared device between sessions of the same signed-in user | any of the five keys being ADDED to `DEVICE_PREFERENCE_KEYS`, which would make them survive a sign-out too | stated in the replacement comments wave 3 writes (6.1); escalate once with wave 2, never re-raised |
| RES-A39-17 | **No instrument in this repo can tell whether an affordance is discoverable**, and this design adds five (widened intake copy, restored rubric field, "Rubric used", progress, "Stop grading"). W2-7 and W4-8 pin DOM order, a height cap and one spelling; they cannot see a label the instructor does not recognise, a control hidden by CSS, or a closed habit. `docs/a17-discovery.md` 5.4 is the finding | **Repo owner**, and the chunk that next adds a control to a grading surface | the owner opening each surface cold and saying what they looked for first; plus W2-7/W4-8 as the buildable floor | whether each new affordance is found without being told where it is | **an affordance that is present, wired, gate-green and reported as missing** - the exact A17 outcome | escalate once with wave 2; never re-raised. **Do not let W2-7/W4-8 passing be read as discoverability coverage** |
| RES-A39-18 | **"Start Review" already sits below two uncapped auto-growing textareas** (`GradingTab.tsx:295-306`, `:311-322`, button at `:343-356`), the `docs/a17-discovery.md` 5.2 house default (79 of 82 files). Wave 2 caps those two, but the same audit is owed on every OTHER grading surface this design touches and on `ClassTrendsDraftPanel.tsx`, which a17 5.2 names as an un-opened candidate | the chunk whose write set includes `CartridgeDropPanel.tsx`, `GradingRecordingPanel.tsx` or `SnapshotGradingPanel.tsx` - waves 2 and 3 touch all three and **must check, not assume** | `grep -n "multiline" <file>` against `grep -n "maxRows" <file>`, plus the index of the file's primary action control | each grading surface's action control against the content above it | **an action control whose index in source is greater than that of an uncapped multiline field** | in waves 2 and 3, as a read-only check; capping a third file's textarea is in scope only if that wave already writes it |
| RES-A39-16 | **The cold navigation cost (two clicks to reach Grading) and the default landing view are untouched.** `useAppNavigation.ts:104` defaults `activeTab` to `"manual"`, `:156-189` to `"course-planning"`. Research M1 wants the first graded result before anything; this design gets there on path A but still behind two clicks on a first run | **Repo owner** - a default landing is a product decision with blast radius far beyond grading | the census's COLD column for path A, re-walked | the act count from a cold profile to the first grade | a cold count that does not fall after wave 1, meaning wave 1's saving is warm-path only | escalate with wave 1's result; do not change a default landing inside a grading row |

---

## 12. Gates run over this file

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Exit code read from a file rather than a pipe, and `git status --short` proving
the write set is this file and nothing else, are both reported in the author's
hand-off.
