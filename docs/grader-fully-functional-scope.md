# Scope: the LLM-chat grader, to "off the ground and fully functional"

Seat: `loop-seat` (authoring; RECON + SCOPE; no production code written).
Consumer: the orchestrator, then a fresh `loop-checker`, then (per
`docs/DEV_LOOP.md`) the acceptance-criteria and architect seats.
Date measured: 2026-10-04. Tree: HEAD `6bb3d7e2`, `git status --short` showed
only four unrelated docs files modified or untracked (`docs/a29-*`,
`docs/css-orphans.md`, `docs/loop-retro-roles-acceptance-criteria.md`) -
nothing under `src/`.

Owner's words (verbatim, as relayed by the orchestrator): "getting the llm like
grader ... off the ground and fully functional."

## 0. How I read the owner's phrase, and what that costs if wrong

"The llm like grader" is read as the **Chat sub-tab under Tools > Grading**
(`GRADING-CHAT`, `docs/backlog.yml` row `GRADING-CHAT`, owner request
2026-09-28: "really mimic the look and feel of an llm chat"). Evidence for the
reading: it is the only grading surface the owner has ever described in LLM-chat
terms, and the owner's A39 report (2026-09-23) is that grading "is faster in an
LLM chat than in this app". Evidence against: "off the ground" could mean the
whole grading stack. The scope therefore maps the whole stack (section 1) but
**binds the criteria to the Chat surface plus the shared engine paths it
reaches**; fork F0 (section 7) lets the owner widen it with a terminating
answer. If the reading is wrong the cost is that waves W1-W4 below (which are
about the Chat surface) are still correct and still needed; only the owner-facing
priority changes.

## 1. Instruments (every quantity in this document names its command)

| Quantity | Command |
|---|---|
| Existence of files/symbols | `Glob`, `grep -n` against the working tree, each hit opened with `Read` |
| Line counts | `wc -l <path>` (Git Bash). `docs/loop/traps-spec.md` says `wc -l` agrees with `@(Get-Content $f).Count`; I did not run PowerShell on every file, so treat as +-1 |
| Test state | `npm run test:paths -- <seven paths>` (the wrapper; output quoted in section 2.9) |
| Backlog rows | `python` + `yaml.safe_load` over `docs/backlog.yml` (92 rows; `python rows.py \| head -1` printed `92`) |
| Grader caller floor | `grep -rln "parseRubricResponse"` and `grep -rln "gradeEntries\|gradeSubmissions\|gradeCanvasUrl"` over `src`, test files excluded; canary `grep -c "parseRubricResponse" src/lib/grade/engine.ts` returned 2 (instrument reaches the file). The lists are a FLOOR - some hits are comment mentions |

**Not measured, and why:** nothing live. No `.env`, no Gemini key, no rendered
component, no network (`docs/loop/this-repo.md` section 6). Every claim about
model output, Canvas behaviour or what the screen shows is a READING claim and
is labelled one.

## 2. CURRENT STATE: what the Chat grader does today, end to end

### 2.1 Reachability (control to code) - verified, every hop opened

| Hop | Citation |
|---|---|
| Rail destination "Chat" | `src/app/components/manual/manual-rail.ts:158` (`id: "grading-chat"`), mapped to view `"chat"` at `:382`; `GradingView` union includes `"chat"` at `:44` |
| View restore/validation | `GRADING_VIEWS` derived from a presence record, `manual-rail.ts:77`, set at `:79` (derived, so the hand-written-ladder trap in `traps-spec.md` does not apply here) |
| Mount | `src/app/page.tsx:749-767`: always-mounted, display-toggled wrapper whose guard names `gradingView === "chat"` at `:761`; render at `:766` |
| Panel | `src/app/components/grading-chat/GradingChatPanel.tsx` (191 lines, `wc -l`) |
| Driver | `grading-chat/useContinuousGradingRun.ts` (303 lines) |
| Composer | `grading-chat/ChatComposer.tsx` (174 lines) - text / file / url modes |
| Header action | `src/app/actions/grading-chat-intake.ts:47` `resolveChatRunHeaderAction`, `requireAppOwner()` at `:52` |
| Intake action | `grading-chat-intake.ts:114` `prepareChatSubmissionAction`, `requireAppOwner()` at `:115` |
| Per-item transport | `useContinuousGradingRun.ts:98` `postGradeRunItem` -> `POST /api/grade-run-item` |
| Route | `src/app/api/grade-run-item/route.ts:139` `POST`, `requireAppOwner()` at `:147`, `maxDuration = 60` at `:38` |

The surface is reachable. Nothing below is "ships dead" at the navigation level.

### 2.2 How a submission enters

`ChatComposer` collects text, one file, or one URL. Text builds a client-side
entry (`chatSubmissionIntake.ts:60` `buildTextEntry`, default label
`Submission N` from a per-session ordinal, `useContinuousGradingRun.ts:214-215`).
A file or URL goes to `prepareChatSubmissionAction`, which classifies a file by
EXTENSION (`grading-chat-intake.ts:140`, never by byte sniffing - a `.docx`
is a zip), reads a single file with `buildSingleFileEntry`
(`src/lib/grade/single-file-entry.ts:72`), a zip with `extractStudentEntries`
(A44's collision refusal can throw here, surfaced verbatim,
`grading-chat-intake.ts:157-166`), a Canvas URL with `extractCanvasEntries`
(`src/lib/grade/extraction.ts:182`, which also returns `pointsPossible`), and a
GitHub URL with `fetchGradableRepoContent`. Every branch applies a per-entry wire
budget (`firstOversizedEntryReason`, `:96-103`) and a file wire budget
(`checkFileWireBudget`, `:135`).

### 2.3 How the rubric is applied

Once per session `beginSession` (`useContinuousGradingRun.ts:180-199`) calls
`resolveChatRunHeaderAction`, which refuses blank instructions, bounds both text
fields at 20,000 chars (`grading-chat-intake.ts:37-38,54-61`), and calls
`resolveRunHeader(..., { synthesizeRubricWhenBlank: true })`
(`src/lib/grade/run-header.ts:36-60`): a blank rubric is synthesized from the
instructions by `generateRubric`, criteria names are parsed from the effective
rubric by `extractRubricCriteria` (regex, `src/lib/grade/rubric.ts:30`), and a
provenance stamp is computed. The effective rubric is copied onto EVERY queued
item (`useContinuousGradingRun.ts:249-256`), so all students in a session are
graded against one rubric text. The panel locks both fields once the session is
ready (`GradingChatPanel.tsx:83,138,152`).

### 2.4 How the LLM is invoked and bounded

Per item: client pool of `INCREMENTAL_CONCURRENCY = 3`
(`src/app/components/grading/incrementalRunPlan.ts:31`) with a `.finally()`
slot release (`useContinuousGradingRun.ts:154-178`) -> route
`gradeEntries([entry], ...)` (`route.ts:186-189`) -> `gradeStudentEntries`
(`src/lib/grade/engine.ts:189`) -> `buildSystemPrompt(instructions, rubric,
criteria)` (`engine.ts:209`; prompt text `src/lib/grade/prompts.ts:56`) ->
`gradeSubmission` -> `callLlm` (`engine.ts:85`) with `temperature: 0.2` and
`maxOutputTokens = getGeminiMaxOutputTokens()` (`engine.ts:57,88`, default 700,
`src/lib/gemini.ts:24`). Submission text is framed as data via
`SUBMISSION_FRAMING_HEADER` (`engine.ts:78`; `prompts.ts:30`).

The 60s wall: the route races the whole call against
`raceWithTimeout(..., waitMs)` with a 50,000 ms soft budget and a 2,000 ms
reserve (`route.ts:50-51,177-189`) and answers 504 "did not finish grading in
time" on timeout (`route.ts:191-196`). `raceWithTimeout`
(`src/lib/bounded-race.ts`) does NOT cancel the losing call - its own header
says so - and `callLlm` takes no `AbortSignal`, so a timed-out grade keeps
spending. `callGemini` retries 408/429/5xx up to `MAX_ATTEMPTS = 5` with backoff
(`src/lib/llm.ts:395-396,467-495`). `withDeadline` is NOT used on this path (it
lives at `src/lib/course-intel/fetch.ts:316`). The 50s budget and the retry
backoff are therefore not coordinated by anything I found; whether a slow item
can hit 504 while still retrying is owner/live-only.

### 2.5 How a grade and comment are produced

`parseRubricResponse` (`src/lib/grade/parsing.ts:49`) reads JSON
(`overallComment`, `improvements`, `rubricResults`, `totalScore`). Per-criterion
scores become `rubricAreas`; the engine sets `strengths = parsed.overallComment`
(`engine.ts:114`) and `improvements = parsed.improvements`; `resubmitNotice` is
fixed wording, never model-authored (`engine.ts:116-117`); the three compose into
`overallComment`. Rows are re-columned to the pinned criteria by `reconcileRun`
(`engine.ts:350`, `buildIncrementalRun` in `incrementalRunPlan.ts:260`).

### 2.6 Where it surfaces, and what is persisted

Rows render in the SHARED `GradingResults` component
(`GradingChatPanel.tsx:173-181`): per-criterion cells, three copyable boxes
labelled "What Went Well" / "What Could Be Better" / "Resubmission Note"
(`gradingResultsHelpers.ts:255-282`), CSV export, and - for rows carrying a
Canvas `userId` - Post to Canvas controls (`GradingResults.tsx:557,641-672`).

Persisted: instructions and rubric text (`ta-grading-chat-instructions`,
`ta-grading-chat-rubric`, `GradingChatPanel.tsx:26-27`), the composer mode
(`ChatComposer.tsx:28`), and per-row EDITS only, under
`ta-grading-results-edits::grading-chat` (`gradingResultsHelpers.ts:558-560`).
**The graded rows themselves persist nowhere**: a reload or tab close loses
every row and everything in flight, and the panel says so at all times
(`GradingChatPanel.tsx:33-34,157`). Nothing writes a Drafted Grades row: the
only callers of `saveGradingDraftAction` are workflow steps
(`grep -rn saveGradingDraftAction src` -> `steps.grading-*.ts` only), so the
Drafted Grades inbox shows unattended-workflow output and never a Chat session.

### 2.7 What already works (do not re-scope)

| Capability | Evidence |
|---|---|
| Continuous dispatch-on-arrival, bounded at 3, cannot wedge on repeated async failure | `useContinuousGradingRun.ts:154-178`; test `useContinuousGradingRun.lifecycle.test.ts` (10 tests passed, section 2.9) |
| Append, never reset | `arrivedRef` only cleared by `reset()` (`:274-289`); verify doc `docs/grading-chat-wave1-verify.md` attack 5 |
| Session ceiling with partial grade | `:234-271` (`DEFAULT_MAX_ENTRIES = 40`, `:55`) |
| `pointsPossible` threaded for Canvas-URL submissions | `grading-chat-intake.ts:178-184` -> `useContinuousGradingRun.ts:231,255` -> `route.ts:123,187` |
| Route guard is `requireAppOwner`, CSRF floor, body validation | `route.ts:147,156-159,87-133` |
| Submission framed as data (SEC-GC-1a) | `engine.ts:78`, `prompts.ts:30` - NOTE the `GRADING-CHAT` backlog row still lists SEC-GC-1a as "queued"; the tree has it shipped (commit `6e8e7134`, `git log -- src/lib/grade/prompts.ts`). The row text is stale and needs correcting |
| Locked instructions/rubric and a confirmed New session | `GradingChatPanel.tsx:83-94`, shipped `54e0525e` |
| A13 guard: an unreviewed unparsed row is refused on post | `src/lib/grade/postable.ts`, used at `GradingResults.tsx` post paths |
| Always-mounted host survives nav | `page.tsx:749-767`; pinned by `assertAlwaysMounted` (`topLevelTabs.wiring.test.ts`) |

### 2.8 The other grader surfaces (map only; not the target of the criteria)

| Surface | Entry | LLM path | Delivery |
|---|---|---|---|
| Submissions (`run`) | `GradingTab.tsx` -> `gradeAction` (`src/app/actions/grading.ts:714`) | whole-run `gradeStudentEntries`, sequential with a 1200 ms sleep (`engine.ts:284-290`, `gemini.ts:67`) | Post to Canvas (Canvas URL), CSV |
| Incremental fill of `run` | `useIncrementalGradingRun.ts` | same per-item route | gated OFF by `INCREMENTAL_ROUTE_ENABLED = false` (`incrementalRunPlan.ts:104`, RULING 116); the Chat surface is where that route first goes live |
| Repo Grades | `repo-grades.ts` | engine | roster-keyed Canvas post |
| Recording (A38) | `GradingRecordingPanel.tsx` -> `useGradingRowGrade.ts` -> `gradeCapturedSubmissionsAction` (`grading-submission-grade.ts:138`) | its own prompt, shares `parseRubricResponse` | copy only (no Canvas post in the panel, `grep -n "postCanvas" grading-recording/*.tsx` empty) |
| Snapshots | `SnapshotGradingPanel.tsx` -> `snapshotGradeAction` | own prompt (uses `separate-strengths` routing, `prompts.ts:86`) | copy |
| Drafted Grades | `DraftedGradesTab.tsx` | none (reads `grading_drafts`) | `postGradingDraftAction` (`grading.ts:498`) |

A38's status per its row: single-row grade path shipped (`b9069a9e`), confirm-above-N
follows; it is a different surface with its own owner-walk and is OUT of this
scope.

### 2.9 Test state, measured

`npm run test:paths -- src/app/components/grading-chat/chatSubmissionIntake.test.ts
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts
src/app/actions/grading-chat-intake.test.ts src/app/api/grade-run-item/route.test.ts
src/lib/grade/engine.test.ts src/lib/grade/postable.test.ts` printed (wrapper
per-argument lines):

```
COVERED src/app/components/grading-chat/chatSubmissionIntake.test.ts files=1 passed=7
COVERED src/app/components/grading-chat/GradingChatPanel.structure.test.ts files=1 passed=13
COVERED src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts files=1 passed=10
COVERED src/app/actions/grading-chat-intake.test.ts files=1 passed=15
COVERED src/app/api/grade-run-item/route.test.ts files=1 passed=18
COVERED src/lib/grade/engine.test.ts files=1 passed=12
COVERED src/lib/grade/postable.test.ts files=1 passed=14
```

`Test Files 7 passed (7)`, `Tests 89 passed (89)`. I did not run the full suite,
lint, tsc or build (this is an authoring pass).

The structure test (13 tests) pins: disclosure copy, Send focus, `slotProps.input`
vs top-level `onKeyDown`, `driver.run` feeding `GradingResults`, the lock
binding, and New session. It pins NOTHING about `canvasUrl`, `runKey` or
`editsSurface` (`grep -n "canvasUrl\|editsSurface\|runKey"
GradingChatPanel.structure.test.ts` empty) - which is why the defects in
section 3 shipped with every gate green.

## 3. THE GAP to "fully functional"

Separated into GENUINE defects (the surface does not do what it claims),
HARDENING (works, fragile), and DEBT (known, deferred, still owed). Each names
the absent or broken path and the file where it would live.

### 3.1 GENUINE defects (reading claims unless stated; each has a named instrument in section 4)

**G1. Post to Canvas ships as a control that cannot succeed (reachability).**
`GradingChatPanel.tsx:175` passes `canvasUrl=""` to `GradingResults`. For a row
from a Canvas-URL submission, `userId` is a number (threaded
`extraction.ts:364,499` -> `route.ts:112` -> `engine.ts:254`), so
`canvasGradable` is true (`GradingResults.tsx:318`) and the "Post N grade(s) to
Canvas" button (`:557`) and per-row "Post to Canvas" (`:641-672`) RENDER. Their
handlers call `postCanvasGradesAction("", payload)` (`:381,:459`), which reaches
`postCanvasGrades` (`src/lib/canvas/grades.ts:77-82`) where
`parseCanvasUrl("")` returns null (`src/lib/canvas-url.ts:17-30`: both patterns
require `/courses/<digits>/...`) and the action throws "Could not read a
discussion or assignment from that URL ...". The Canvas URL the instructor typed
is consumed at intake and never retained (the driver keeps no URL;
`useContinuousGradingRun.ts` has no `canvasUrl` symbol - `grep -n canvasUrl` on
it is empty). Also no SpeedGrader link (`speedGraderUrl: null`, `:138`).
Consequence: the app's strongest INTEGRATION advantage (read the class from
Canvas, write grades back) is half-wired on the surface built to carry it.

**G2. Rows from separate submission events can collide on identity (attribution).**
Everything downstream of intake keys on the bare `student` string:
`seedEdits` (`gradingResultsHelpers.ts:287`, `seeded[result.student]`),
React row keys (`GradingResults.tsx:647` `${result.student}-matrix`, `:780`), and
the Canvas post payload. RULING 129 (`extraction.ts:196-230`) states this and
disambiguates collisions WITHIN one event. Across events nothing does:
a single file's label is its stem (`single-file-entry.ts:57-64`), so two
students who each drop `Assignment 1.docx` produce two entries named
`Assignment 1`; two text pastes given the same label, or one Canvas URL added
twice, do the same. Both rows then share one edit slot and one React key, so an
instructor's edit to one row overwrites the other and `run.results` carries
duplicate keys. The mechanism that already solves this in-tree is
`assignUnclaimedLabel` (`src/lib/grade/utils.ts:433`), used by
`extraction.ts:232`; the driver never calls it. This is the ATTRIBUTION class in
`docs/loop/leverage.md` - and on this surface it is currently WEAKER than the
batch path.

**G3. A prior session's text can replace a new session's model output.**
`GradingChatPanel` never passes `runKey`, and edits for an empty `canvasUrl` live
under the single key `ta-grading-results-edits::grading-chat`
(`gradingResultsHelpers.ts:558-560`). `loadPersistedEdits`
(`:619-635`) iterates the CURRENT run's students and, for each, merges the stored
record over the freshly seeded one (`mergeStoredRowEdit`, `:597-611`: `total`,
`strengths`, `improvements`, `resubmitNotice`, `areas` all taken from storage when
present). `GradingChatPanel.handleNewSession` calls only `driver.reset()`
(`:85-94`); nothing removes the key (`grep -rn "removeItem\|clearGradingResultsEdits"
grading-chat/ GradingResults.tsx gradingResultsHelpers.ts` empty; canary
`grep -c localStorage GradingChatPanel.tsx` = 2). Text submissions restart at
`Submission 1` after reset or reload (`ordinalRef`, `:121,:281`), so the new
session's first row, named `Submission 1`, is overwritten by the previous
session's stored values for `Submission 1` - including the previous model
output, because `GradingResults`'s persist effect (`GradingResults.tsx:247-249`) writes the seeded
values on first mount. Same hazard for any repeated file stem. READING claim; a
pure-function test settles it (section 4, FF-3).

**G4. Seven pieces of row state reset every time any row lands.**
`runResetKey(runKey, run)` returns `runKey ?? run` (`gradingResultsHelpers.ts:735-737`).
The Chat panel passes no `runKey`, and `buildIncrementalRun` returns a NEW object
per landed row (`useContinuousGradingRun.ts:131-145`), so `GradingResults`'s
identity changes on every arrival and it resets `postStatus`, `postSummary`,
`expandedBox`, `codeRuns`, `codeRunning`, `codeOutputStudent`, `browseFilesFor`
(`GradingResults.tsx:232-241`). Effect: a "Posted to Canvas" badge on row 1
reverts to "Post to Canvas" when row 3 lands (inviting a double post), and an
open feedback expand modal closes under the instructor. This is exactly what
RULING 131 (`GradingResults.tsx:119-123`, `incrementalRunPlan.ts:292`
`selectRunKey`) built `runKey` to prevent; the Chat surface is the one
incremental caller that does not use it. Hidden today only because G1 means
nothing can be posted.

**G5. Unparseable or truncated model output becomes a GRADED row.**
`parseRubricResponse` falls back to the raw text as `overallComment` plus a
single `Overall` area with a blank score when JSON is absent or invalid
(`parsing.ts:60-73,115-128`). `gradeSubmission` (`engine.ts:41`) neither checks `finishReason`
(`grep -n finishReason src/lib/grade/*.ts` empty, excluding tests; the field
exists, `llm.ts:201`) nor requests structured JSON (`responseMimeType` exists in
`LlmGenerationConfig`, `llm.ts:45`, unused at `engine.ts:88`). The output cap
is 700 tokens by default (`gemini.ts:24`, `engine.ts:57`; `callGemini` raises
caps below `DEFAULT_MIN_OUTPUT_TOKENS = 512` only, `gemini.ts:69,181`). A multi-criterion rubric with
three prose fields can plausibly exceed that, in which case the row is `kind:
graded` carrying raw JSON text in "What Went Well" and no scores. The A13 guard
refuses to POST such a row, so it cannot reach a student, but it LOOKS like a
grade. Whether it happens in production depends on the owner's
`GEMINI_MAX_OUTPUT_TOKENS` and the live model: UNDETERMINED here.

**G6. A failed row has no retry, and the only workaround creates G2.**
`GradingResults` has no retry affordance (`grep -in "retry\|re-run\|regrade"
GradingResults.tsx grading-results/*.tsx grading-chat/*.tsx` matches only a
comment at `GradingResults.tsx:62`). `classifyItemFailure`
(`incrementalRunPlan.ts:198`) turns a rejected dispatch into a `grading-failed`
row; the instructor's only remedy is to re-add the submission, which produces a
SECOND row with the same `student` (G2) and a new `sourceIndex`. This is the
chat-surface instance of backlog `A13-2` / `A37`.

**G7. The effective rubric is invisible and provenance is unshown.**
`resolveChatRunHeaderAction` returns `generatedRubric` when the rubric box was
blank (`run-header.ts:47`) but the driver keeps only `headerRef`
(`useContinuousGradingRun.ts:115,194`) and exposes neither; the panel renders the
instructor's own blank rubric field, locked. `RubricProvenance` is mounted only in
`GradingTab.tsx:557` and `LiveFeedPanel.tsx:432`
(`grep -rn "RubricProvenance\|GeneratedRubricCard" src/app --include=*.tsx`),
never in the Chat panel; `GeneratedRubricCard` only at `GradingTab.tsx:538`.
`docs/owner-decisions-2026-09-23.md` records provenance ("which rubric produced
which grade") as the app's clearest surviving advantage over a chat. The Chat
surface computes it (`run.rubricUsed`/`rubricFingerprint` via
`buildIncrementalRun`, `incrementalRunPlan.ts:260-276`) and shows none of it.

**G8. "Did right / did wrong" is not what the boxes hold.** The owner asked for
comments "split up into what they did right, what they did wrong". AC-13
(`docs/grading-chat-acceptance-criteria.md:278-294`) mapped that onto the existing
`strengths` / `improvements` boxes. In the default prompt routing the
`overallComment` schema line is "what the student did well, AND for each
deduction the rubric area and specific reason" (`prompts.ts:97`) and the engine
stores that as `strengths` (`engine.ts:114`): the box labelled "What Went Well"
carries the deductions ("what they did wrong"), while "What Could Be Better" holds
forward-looking advice. A `separate-strengths` routing exists in the same file
(`prompts.ts:86`) but `gradeSubmission` does not use it and
`parseRubricResponse` has no `strengths` key. Whether this matters is an owner
judgement (fork F1); that it is a divergence from the owner's literal sentence is
measured.

### 3.2 HARDENING (works today, fragile)

| Id | Item | Evidence | Instrument (what would measure it) |
|---|---|---|---|
| H1 | No pacing between dispatches (RES-GC-13); three concurrent calls with no spacing vs the batch path's 1200 ms sleep | `route.ts` has no delay; `engine.ts:284-290` is whole-run only | Real Gemini rate limit is live-only; owner walk with a 10-submission drop |
| H2 | Session ceiling mirrors 40 client-side, ignoring `GRADE_MAX_SUBMISSIONS` | `useContinuousGradingRun.ts:55` vs `gemini.ts:129` | Owner decision RES-GC-5; none needed unless env is set |
| H3 | Synchronous throw from the dispatch seam leaks a slot | verify doc attack 1; unreachable (`postGradeRunItem` is `async`) | defensive wrap + lifecycle test |
| H4 | A large Canvas URL does its whole fetch inside ONE server action with no declared `maxDuration` of its own (`grep -rn "export const maxDuration" src/app` lists routes only, no action file) | `extractCanvasEntries` loops `canvasWorkToEntry` sequentially (`extraction.ts:189-192`) | live-only; owner drops a real class-size assignment URL |
| H5 | Instructions/rubric/composer-mode restore on reload uses a `localStorage`-reading `useState` initializer (`GradingChatPanel.tsx:61-62`, `ChatComposer.tsx:60`). Two repo statements conflict: the architecture doc rules this idiom correct (`docs/grading-chat-architecture.md:822-829`, citing `GradingTab.tsx:109-113`), and `SnapshotGradingPanel.tsx:167-172` plus open backlog row `G2` say it never shows on an SSR'd surface | G2's instrument is "owner reloads once" | owner reload; answers both G2 and this |
| H6 | Per-row `GradingResults` has no "full-credit checklist" or "sample answer" on this surface (`buildIncrementalRun(... tier2: null)`, `useContinuousGradingRun.ts:142`) | RULING 116 documents the incremental route as thinner | owner decision whether wanted; not claimed as a defect |

### 3.3 DEBT already filed (kept, not re-derived)

RES-GC-7 durable store (designed, `docs/grading-chat-durability-design.md`,
recommendation section 4: persist completed rows, strip raw submissions, model on
`src/lib/github-grading-run-store.ts`); RES-GC-1/-5/-UX-2/-UX-4/-UX-5, SEC-GC-5,
SEC-GC-1b (role-split prompt, `prompts.ts:26-28`), RES-GC-12/12b; the R2/R3
owner alternatives; the OWNER BROWSER-WALK. Carry-forward table in section 8.

## 4. PROPOSED ACCEPTANCE CRITERIA for "fully functional"

Written as what an instructor must be able to do, start to finish. Every pass
condition names the object, the instrument and the direction of failure. Items
marked [PURE] are node-drivable under the repo's no-render hook harness
(`useContinuousGradingRun.lifecycle.test.ts` uses `vi.mock("react", ...)`; the
driver imports only `useRef`/`useState`, `useContinuousGradingRun.ts:30`).
Items marked [READ] are reading claims; [OWNER] needs a real browser or key.

**LEVERAGE CLAIM (one paragraph).** The advantage claimed is INTEGRATION +
ATTRIBUTION from `docs/loop/leverage.md`: for a Canvas assignment URL the app
reads the whole class, grades each student as soon as their submission is
extracted while the instructor keeps adding, keeps every row attached to the
right student by construction, and writes each grade back to that same Canvas
assignment without leaving the surface. Today the instructor does this in a chat
by pasting each submission, copying each reply, and typing grades into
SpeedGrader by hand; the cost is one paste, one copy and one gradebook entry per
student and no check that a grade reached the right student. HONEST LIMIT: for
text and single-file rows (no Canvas identity) the app has no integration or
writeback advantage over a chat - only concurrency and a pinned rubric; that
limit is fork F2. CONCURRENCY is already earned and shipped (AC-L of
`grading-chat-acceptance-criteria.md`), not re-claimed here.

**FF-L (the one removal test).** A row produced from Canvas assignment URL `U`
posts to `U`. Object: the value the Chat surface hands `GradingResults` as
`canvasUrl` after a URL submission of `U`. Instrument [PURE]: drive the hook with
a mocked `prepareChatSubmissionAction` returning entries plus `pointsPossible`
for `U`, then assert `driver.canvasUrl === U`. Removal: delete the retention of
`U` in the driver and the assertion's observed value changes from `U` to `""`.
Direction of failure: RED if empty, or equal to a different URL. [READ] companion:
`GradingChatPanel.tsx` passes `canvasUrl={driver.canvasUrl}` (a source-text pin,
which `docs/backlog.yml` rows L9/A23 note is weaker than a behavioural test; the
true end is the owner walk). A criterion about a database row would pass the
chat-could-not test trivially; this one goes red on the edit that removes the
advantage.

**FF-1. A session can be started and its rubric is known.** Instructions
non-blank starts a session; blank is refused with the existing wording
(`run-header.ts:39`, unchanged). When the
rubric box was blank the synthesized rubric is exposed to the surface and
displayed read-only before the first row lands. Instrument [PURE]: driver output
exposes the effective rubric string and whether it was generated; equals
`header.effectiveRubric` for a mocked header. Direction: RED if the exposed value
is the instructor's blank input. Display: [READ].

**FF-2. Identity is unique within a session.** After any sequence of submit
events (text with equal labels, files with equal stems, the same Canvas URL
twice), no two rows in `driver.run.results` share a `student` string, every row's
`sourceIndex` still maps to its own entry, and the first claimant of a label keeps
it unchanged (RULING 129's order rule). Instrument [PURE]: hook harness, N events
built from a generator over {text, file-stem, URL} x {unique, equal}, expected
display set computed from the entries independently of the driver. Direction: RED
on any duplicate display, any score landing on the wrong `sourceIndex`, or a
first claimant renamed.

**FF-3. A new session never inherits a previous session's text.** After
`reset()`, or after a reload, the first row's seeded fields are the model's output
for ITS submission for every submission kind. Instrument [PURE]: feed
`loadPersistedEdits` a stored blob built from session A against session B's run
(same student names) using the key/surface the Chat panel would use, and assert
the seeded values win. Direction: RED if any of `total`, `strengths`,
`improvements`, `resubmitNotice`, `areas` equals session A's. (Mechanism - a
per-session surface key versus clearing on reset - is the architect's.)

**FF-4. Row state survives arrivals and resets between sessions.** Instrument
[PURE]: `runResetKey(driver.runKey, run)` is identical for two consecutive `run`
objects of ONE session and different across `reset()`. Direction: RED if it
changes within a session (G4 persists) or fails to change across sessions.

**FF-5. Posting works for Canvas-URL rows and is honest elsewhere.** A Canvas-URL
row can be posted singly or in bulk to `U` (FF-L), shows posted status that
persists across later arrivals (FF-4), and a text/file/GitHub row shows no Post
control. Instrument: [PURE] for the argument and status identity; [OWNER] for the
live Canvas write (no key, no network here). Direction: RED if `canvasUrl` is
empty with a posted-capable row present.

**FF-6. A bad model response is never shown as a grade.** On the Chat path, a
response with `finishReason` indicating truncation or with no parseable JSON
object yields an ungraded `grading-failed` row whose message names the cause, and
the raw model text appears in no feedback box. Instrument [PURE]: `engine.test.ts`
with a mocked `callLlm` returning (a) `ok:true` + `finishReason: "MAX_TOKENS"` +
truncated JSON, (b) prose with no JSON, (c) valid JSON - assert (a) and (b) are
`ungraded.kind === "grading-failed"` and (c) is graded; expected values are
literals, not computed from the parser. Direction: RED if (a) or (b) is
`kind: graded`. BLAST RADIUS for the architect: `gradeSubmission` is shared by
every surface that calls the engine (caller floor in section 1: 18 non-test
files); `parseRubricResponse` is additionally shared by the recording path
(`grading-submission-grade.ts`, `grading-feedback-prompt.ts`), so the guard
belongs in `gradeSubmission`, not in the parser. Owner measure [OWNER]: how often
production truncates (section 3.1 G5) - not decidable here.

**FF-7. A failed row can be regraded in place.** Instrument [PURE]: with the
dispatch seam failing once then succeeding, `retry(sourceIndex)` leaves
`results.length` and `dispatchedCount` unchanged, replaces the failed row with the
graded one, and dispatches a body deep-equal to the original (same
`assignmentInstructions`, same session rubric, same `pointsPossible`). Direction:
RED if the row count grows, the rubric differs from the session's, or a retry on
an already-graded row dispatches. The retry control's placement is [READ].

**FF-8 (conditional on F4 = build). The graded table survives a reload.** Per the
durability design: completed rows (raw submissions stripped) restore on remount;
rows that were in flight are disclosed as lost, in copy that says which.
Instrument [PURE]: store leaf round-trip with an explicit field allowlist (no
`rawBase64`, no submission `content`), size measured on a 40-row fixture.
Direction: RED if any raw-submission field persists, or a restored row is marked
in flight. The reload itself is [OWNER] (and H5's hydration question applies).

**FF-9. Provenance is visible on every graded row set.** The surface shows which
rubric text and fingerprint produced the rows. Instrument [PURE]:
`driver.run.rubricFingerprint` equals `stampRubricProvenance(effectiveRubric)`
(`src/lib/grade/rubric-provenance-stamp.ts`); the mount is [READ]. Direction: RED
if the fingerprint is empty or differs from the stamp of the rubric actually sent
in the item bodies.

**FF-10 (conditional on F1 = split). The comment boxes mean what the owner said.**
"Did right" holds praise only; "did wrong" holds the deductions; advice is not
mixed into either. Instrument [PURE] for the prompt string and for parsing a
literal response with the new shape; whether a live model obeys is [OWNER].
Direction: RED if a literal deduction sentence lands in the praise box.

**FF-11. Existing guarantees do not regress.** The seven test files in section 2.9
stay green with no assertion edited or deleted; `route.ts` keeps `requireAppOwner`
first, the CSRF floor and `maxDuration = 60` (pinned by `route.test.ts:42-66`).
Direction: RED on any of the 89 tests, or on a diff that deletes an assertion.

**FF-12. Owner walk (cannot be run here).** Look and feel as an LLM chat; Enter
sends; Send keeps focus; the table streams and survives navigating away and back;
the partial-refusal alert; reload restore of the three persisted controls (H5/G2);
a real Gemini grade on a 5-criterion rubric not truncated (G5); a real Canvas
post (FF-5); a 10-submission drop for rate limiting (H1).

## 5. THE LEVERAGE QUESTION (`docs/loop/leverage.md`)

What does a grader inside this app do that an instructor pasting a rubric and a
submission into a chat cannot?

Honest accounting against the card's classes, with the A39 research
corrections applied (a chat CAN persist a rubric via Projects and CAN write grades
via community MCP tooling - `docs/owner-decisions-2026-09-23.md`; those are not
claimed):

| Class | Built today on the Chat surface | Earned or inherited | Verdict |
|---|---|---|---|
| CONCURRENCY | 3-at-a-time pool, rows append as they land (`useContinuousGradingRun.ts:154-178`) | Earned (the surface built the driver) | Real, shipped, mocked-seam instrument exists. A chat blocked on the human cannot do it. Caveat: a chat shows each result as it arrives, so the app wins only when the instructor adds faster than grading finishes |
| SCALE | One session rubric pinned across all rows (`:249-256`), criteria names frozen (`run-header.ts:49`) | Earned, but weaker than batch | Real for consistency; pacing unmeasured (H1) |
| INTEGRATION (read) | Canvas URL reads the whole class with real `userId`s and `pointsPossible` | Earned (the intake action) | Real |
| INTEGRATION (write) | Post controls render but cannot succeed (G1) | NOT earned today | Claim is false until FF-L |
| ATTRIBUTION | Within one event only; cross-event collisions (G2) | Regressed vs batch | Claim is false until FF-2 |
| GUARANTEED | Fixed resubmit wording, A13 post guard, data-framing header | Mostly inherited from the shared engine | Do not credit to this feature |
| CORPUS / provenance | Computed, not shown (G7); rows not persisted (3.3) | Not earned | Thin until FF-9 / FF-8 |

The honest bottom line: **today the Chat grader's only earned, working,
chat-beating mechanism is CONCURRENCY plus the Canvas read.** For an instructor
who pastes text submissions it is a chat with a pinned rubric and a results
table - thin, and the table is where copy-paste costs go to be saved, not a new
capability. The advantage becomes genuine only for Canvas-URL work, and only
once G1, G2 and G4 are closed; that is why waves W1-W2 are first. For
text/file rows the fork F2 is the owner's to answer: either accept
copy-only (a chat's cost, stated openly) or build roster matching to give those
rows a Canvas identity. Silence is the one illegal answer under the card; this
document states the thin version rather than narrating it as integrated.

## 6. WAVE PROPOSAL

Cut pure leaves -> action -> surface. Every wave lists the file that CALLS each
new export (`seats.md` architect rule). Line counts via `wc -l`; none of these
pushes a file near 1000 (largest write target `engine.ts` 487; `GradingResults.tsx`
918 is READ-ONLY in every wave below because `canvasUrl` and `runKey` are already
props, `GradingResults.tsx:114,123`).

| Wave | Content | Write set (exact paths) | Caller of each new export | Verifiable here |
|---|---|---|---|---|
| W1 | Driver state: session id / `runKey`, retained `canvasUrl` (first Canvas URL pins the session), session-unique `student` labels, exposed effective rubric + provenance, `retry(sourceIndex)` | `src/app/components/grading-chat/useContinuousGradingRun.ts`; a new pure leaf under `grading-chat/` if the architect extracts one (client-safe: no `Buffer`, per `chatSubmissionIntake.ts:9-17`); `useContinuousGradingRun.lifecycle.test.ts` | the driver itself (leaf) and `GradingChatPanel.tsx` (W2) | FF-1, FF-2, FF-4, FF-7, FF-9, FF-L (PURE halves) |
| W2 | Surface wiring: pass `canvasUrl`, `runKey`, per-session edits surface; clear/scope edits on `reset()`; mount `RubricProvenance` and `GeneratedRubricCard` (`grading-results/` components, imported, not edited); Failed-submissions list with Retry, panel-owned | `GradingChatPanel.tsx`; `GradingChatPanel.structure.test.ts` | the panel is the caller | FF-3, FF-5 argument half, FF-L [READ]; display is [OWNER] |
| W3 | Bad-output honesty: finish-reason / no-JSON guard in `gradeSubmission` (never in the shared parser) | `src/lib/grade/engine.ts`; `engine.test.ts` (or `engine.ungraded.test.ts`) | `gradeStudentEntries` (same file) | FF-6 PURE |
| W4 | Owner walk package: the FF-12 checklist written as steps | `docs/` only | - | none (owner) |
| W5 (iff F1=split) | Comment split: new routing option through route body -> `gradeEntries` options -> `buildSystemPrompt` + parse of a `strengths` key, chat-only | `src/app/api/grade-run-item/route.ts`, `src/lib/grade/engine.ts`, `src/lib/grade/prompts.ts`, `src/lib/grade/parsing.ts` (additive), their tests, the chat driver body | route -> engine | FF-10 PURE; live compliance [OWNER] |
| W6 (iff F4=build) | Durable completed-row store, port of `github-grading-run-store.ts` pattern | a new `src/lib/` store leaf, `GradingChatPanel.tsx` (hydrate via a mount effect, honoring G2), disclosure copy at `GradingChatPanel.tsx:33-34` | the panel | FF-8 PURE |
| W7 (iff F2=roster) | Roster-matched Canvas identity for text/file rows | NOT sized here - needs its own scope (roster source, assignment target, match UI; precedent `grading-roster-match.ts`) | - | - |

Sequencing and disjointness. W1 and W3 write disjoint sets (`grading-chat/**`
versus `src/lib/grade/engine.ts` and tests) and may run in parallel; W2 consumes
W1's exports and follows it. **I did not compute disjointness against the sibling
announcements agent or against A29's modified files** (`git status --short` shows
`docs/a29-*` only); the orchestrator must intersect the real write sets with
`sort | uniq -d` and paste the empty output per `parallel-disjointness.md`.
W3's tests assert on shared behaviour: the caller floor in section 1 (18 non-test
files, including `repo-grades`, recording and `class-trends` paths) is a floor,
and `docs/REGRESSION.md` needs a baseline entry for `gradeSubmission`'s
unparseable-response behaviour before W3 changes it (`grep -a -n "GRADING-CHAT"
docs/REGRESSION.md` finds entry 440 for the Chat surface; I did not find a
baseline for the engine's fallback row - run `grep -a -n "No feedback generated"
docs/REGRESSION.md` as the first step of W3).

Machine-verifiable versus owner-verified. Machine-verifiable: every FF marked
[PURE] (mocked `dispatchItem` seam in the lifecycle harness; mocked `callLlm`
via `vi.mock` - never a real `fetch`, `vitest.setup.ts` throws on one). Not
machine-verifiable: anything rendered, any keyboard or clipboard behaviour, any
live Gemini output, any live Canvas read or write, the reload round-trip. The
removal test FF-L's last hop (panel passes the field) is a source-text pin and
inherits the L9/A23 weakness; the owner walk is its real end.

## 7. OPEN FORKS (each answer terminates the activity)

None needs a third round. Each states what the next activity produces, the
recommendation, what is already startable regardless, and the cost of the other
answer. W1, W2, W3, W4 are independent of ALL of these except F0; the forks only
decide whether W5, W6, W7 exist.

**F0 - target.** Which does this activity produce: (A) the Chat sub-tab to fully
functional, with the shared engine paths it reaches (this document as written), or
(B) the whole grading stack (add `A13-2`/`A37` re-run controls on every surface,
the G2 shared-hook fix, the `GradingTab` provenance/column work)? Recommend A.
Startable now regardless: W1-W3, all inside A. Cost of answering B: the activity
re-scopes to a multi-row cut over seven importers of `useAssessmentRowStore`
(`G2`) and the A38 surface; W1-W3 are still correct and unchanged.

**F1 - comment split.** Keep the three existing boxes (A: "What Went Well" keeps
praise plus deductions; document that) or split (B: "did right" praise only, the
deductions folded into "What Could Be Better" via a chat-only routing, no
`GradeResult` type change)? Recommend B because it is the owner's literal sentence
and costs no shared type or allowlist change; its risk is live-model
compliance, which only the owner can see. Startable now regardless: W1-W4. Cost of
the other answer: A costs W5 nothing (it is simply not built); B costs one
additive prompt/parse path plus an owner check on a real model.

**F2 - text and file rows.** Copy-only (A: only Canvas-URL rows are postable;
state this in the surface copy) or Canvas identity for text/file rows (B: assignment
target plus roster match, a new scope)? Recommend A: it is zero build and the card
requires the limit be stated, and B is its own scoped item, not a wave of this one.
Startable now regardless: W1-W4. Cost of B: a new scope activity (W7) that
reuses `grading-roster-match.ts` but needs an assignment-target UI nothing here
sketches.

**F3 - one Canvas assignment per session.** The first Canvas URL pins the
session's post target, and a different Canvas URL is refused with "start a new
session" (A), or each row carries its own URL (B)? Recommend A: instructions and
rubric are already locked per session (`GradingChatPanel.tsx:83-94`), so a session
IS one assignment, and A is what makes `canvasUrl` a single prop `GradingResults`
already accepts. Cost of B: the shared `GradingResults` (918 lines) would have to
take a per-row URL, which `GradingResults.tsx:381,459` does not support and which
puts that file within 82 lines of its ceiling.

**F4 - durability.** Build completed-row persistence per the existing design (A,
W6) or keep the always-visible "not saved" floor and accept loss on reload (B)?
Recommend A (the design's own recommendation, `docs/grading-chat-durability-design.md`
section 4: ~94 KB at 40 rows, estimated, plus an already-shipped sibling to port).
Startable now regardless: W1-W4. Cost of B: nothing to build; an instructor who
reloads mid-class loses every row, which the panel already tells them.

## 8. Carry-forward from the GRADING-CHAT row (nothing silently dropped)

This document does not restructure a prior version; it is the first scope for
"fully functional". The `GRADING-CHAT` row lists deferred items; each is
dispositioned here so none is deleted.

| Prior item | Disposition |
|---|---|
| SEC-GC-1a prompt framing ("queued") | WITHDRAWN as open: shipped `6e8e7134` (`prompts.ts:30`, `engine.ts:78`). Enforcer: `engine.test.ts` "submission text is framed as data" block. The row text needs correcting |
| RES-GC-7 durable store | HANDED to W6 / FF-8 (conditional on F4) |
| RES-GC-10 receipt | WITHDRAWN per `grading-chat-durability-design.md` section 6 (superseded by RES-GC-14) |
| RES-GC-13 pacing | KEPT as hardening H1, owner/live instrument |
| RES-GC-11 not-saved floor | KEPT unchanged (`GradingChatPanel.tsx:33-34`); copy changes only if W6 lands |
| RES-GC-5 ceiling | KEPT as H2 |
| RES-GC-1 mount lifecycle | KEPT built as always-mounted; owner-walk FF-12 |
| SEC-GC-1b role split | KEPT deferred, cross-surface (`prompts.ts:26-28`) |
| RES-GC-12/12b logging | KEPT deferred (route.ts not in W1/W2 write sets; touched only if W5) |
| RES-GC-UX-2/-4/-5, SEC-GC-5 | KEPT deferred; unchanged |
| R2 blank-rubric synthesize, R3 Canvas+GitHub only | KEPT as built; no fork reopened |
| FF-12 owner browser walk | KEPT; now an explicit checklist (W4) |

## 9. RESIDUAL REGISTER (owner, instrument, step - all three, or it is a deletion)

| Id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| FF-R1 | Reload restore of instructions/rubric/composer mode (H5, and backlog G2) | owner | one browser reload with saved text | W4 owner walk, step 6 |
| FF-R2 | How often production truncates grading JSON (G5) | owner | a real 5-criterion grade with the production `GEMINI_MAX_OUTPUT_TOKENS` | W4 owner walk; then W3's guard reports it as a named failed row |
| FF-R3 | Rate limiting at three concurrent calls (H1) | owner | a 10-submission drop; count of `grading-failed` rows | W4 owner walk |
| FF-R4 | Live Canvas write via the Chat surface (FF-5) | owner | one real post to a test assignment | W4 owner walk |
| FF-R5 | A large Canvas URL inside one server action (H4) | owner | a real class-size assignment URL | W4 owner walk |
| FF-R6 | Whether 504-at-50s can coincide with retry backoff (section 2.4) | owner | a deliberately slow submission against the real key | W4 owner walk |
| FF-R7 | The panel passing `canvasUrl`/`runKey` is a source-text pin | test-author seat | a behavioural drive is unavailable (no render); the pin plus owner walk is the ceiling | W2 test notes, state the limit |
| FF-R8 | Look and feel as an LLM chat (layout is form-then-table-then-composer, `GradingChatPanel.tsx:126-188`, not a transcript) | owner | browser walk | W4 owner walk, step 1 |
| FF-R9 | `GRADING-CHAT` backlog row text is stale (SEC-GC-1a) | orchestrator | `grep -n "SEC-GC-1a" docs/backlog.yml` vs `prompts.ts:30` | the push that lands W1 |
| FF-R10 | Disjointness against the sibling announcements agent and A29 not computed | orchestrator | `sort \| uniq -d` over the real write sets | before dispatching W1 |

## 10. What I could not determine

- Anything about real model output, token usage, rate limits or latency.
- Whether the reload restore works (H5 / G2).
- Whether the always-mounted panel and its hidden `GradingResults` behave under
  navigation (verify doc says correct by reading; nothing renders).
- The exact production values of `GEMINI_MAX_OUTPUT_TOKENS`,
  `GRADE_MAX_SUBMISSIONS`, `GRADE_INTER_REQUEST_DELAY_MS`.
- Which of the 18 non-test engine callers would be affected by W3's guard; the
  list is a grep floor, not a derived set.
- G3's actual on-screen effect: derived from `loadPersistedEdits` by reading, not
  by running it; FF-3's instrument is the test that would settle it.
- I did not open `docs/grading-chat-ux.md`, `-reliability.md` or `-security.md`
  in full; I relied on the architecture, AC, durability, verify and waves
  documents plus the code. Any UX copy claim is out of scope here (UX seat).
