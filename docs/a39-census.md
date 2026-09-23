# A39: the grading interaction census

Backlog row A39. This document is the row's FIRST deliverable and it is a
COUNT, not a design. The remedy's shape belongs to the architect pass that
consumes this; section 6 names the highest-count removable steps and stops
there.

**The owner's words, verbatim, 2026-09-23:**

> "currently to grade assignments using an llm chat, i paste/drop the rubric
> in, do the same for the assignment description, and then do the same for
> each submission - it's much faster to use an llm chat today - plan a way to
> make this app faster to use than llms and then implement"

**Measurement discipline binding this document.** Every quantity below names
the command or the `file:line` that produced it. Every claim of absence was
paired with a canary run in the same call, and no absence grep was piped
through `head`. **NOTHING RENDERS UNDER VITEST HERE** (`docs/loop/this-repo.md`
section 2) - so every interaction count in this document is a READING CLAIM
traced from a control to the code behind it, never an observation of a screen.
Section 8 routes that confirmation to the owner rather than implying coverage.
All greps were run from the repo root through the Bash tool (Git Bash) on
2026-09-23.

---

## 0. The counting unit, and the baseline

**One INTERACTION** = one discrete act the instructor must perform:

- a click on a control,
- filling one field (focus + paste/type counts as ONE, not two),
- one file-dialog round trip (click input, pick file),
- one selection from a list or dropdown (open + pick counts as ONE),
- one page/tab/view transition.

**One WAIT** = a point where the instructor cannot proceed until something
finishes. Waits are counted separately and are NEVER folded into the
interaction count, because the app's per-submission interaction cost is zero
on several paths while its wait is linear in N. Collapsing the two is how a
path that counts cheap can feel slow, and section 6 turns on exactly that
distinction.

**THE CHAT BASELINE, as the owner states it and as this document uses it:**

| Quantity | Value |
|---|---|
| Per-assignment setup | 2 interactions (paste rubric, paste assignment description) |
| Per submission | 1 interaction (paste the submission) |
| Total | **2 + N** |
| Navigation | 0 |
| Prerequisites | 0 |
| Waits before proceeding | 0 |
| Time to FIRST grade | after interaction 3 |
| Paid | on every assignment, forever |

The last two rows of that table are load-bearing and are the reason the
verdict in section 6 is what it is.

**CROSSOVER N*, defined once so every path's number means the same thing:**
the smallest integer N at which the app's total interaction count is strictly
less than the chat's `2 + N`. A path with per-submission cost `p` and setup `s`
satisfies `s + p*N < 2 + N`, so when `p = 0` the crossover is `N* = s - 1`, and
when `p >= 1` there is NO crossover at any N.

**Two states are counted for every app path, because they differ by the whole
navigation cost:**

- **COLD** - a signed-in instructor who has never used this surface, so every
  persisted view/source key is at its default.
- **WARM** - the same instructor returning. Every navigation and source
  selection below is persisted under a `ta-` key
  (`useAppNavigation.ts:392,396,416` write `ta-active-tab` / `ta-manual-view` /
  `ta-tools-section`; `:156-189` restore the manual view; `content-tab/constants.ts:6`
  `ta-content-view`; `GradingTab.tsx:74,86` `ta-grading-source`), so a
  returning instructor lands where they left off and pays 0.

WARM is the number to compare against the chat, because the chat's 2 + N is
also a steady-state number. COLD is reported so the first-run cost is not
hidden.

---

## 1. Every grading path the app actually offers

**Instrument.** Enumerated from the server actions that reach a grading
engine, then traced back to the control that calls each one, rather than from
any design document (`docs/loop/traps-spec.md`: "Brief from the tree, not from
the doc").

```
grep -rn "^export async function \(grade\|.*[Gg]rade\)" src/app/actions/*.ts
```

returns nine exports; six of them grade (the other three are
`createGradedDiscussionAction`, `listCourseGradeSummariesAction`,
`postCanvasGradesAction`). Each was then traced to its callers with
`grep -rn "<name>" src`, and the canary `grep -rn "gradeNoSuchAction" src`
printed nothing and exited 1, so an empty result from that instrument is a
real absence.

| Action | UI caller | Path |
|---|---|---|
| `gradeAction` (`grading.ts:705`) | `page.tsx:63` via `useActionState`, form in `GradingTab.tsx` | A (zip), B (Canvas URL), C (Live Feed) |
| `gradeReposAction` (`github.ts:603`) | `GithubGradingPanel.tsx:372` | D (GitHub repo queue) |
| `gradeRepoAction` (`github-repos.ts:652`) | `repo-grades/RepoGradeCellControl.tsx`, per cell | E (Repo Grades) |
| `gradeCapturedSubmissionsAction` (`grading-submission-grade.ts:131`) | `grading-recording/GradingRecordingPanel.tsx:593` | F (grade from a recording) |
| `snapshotGradeAction` (`snapshot-grade.ts:47`) | `snapshot-grading/useSnapshotGrade.ts:150` | G (grade from screenshots) |
| `gradeOneSubmissionAction` (`grading.ts:597`) | **NO ATTENDED UI CALLER** | workflow-only |

`gradeOneSubmissionAction`'s census is exact and worth stating: the full
`grep -rn "gradeOneSubmissionAction" src` returns exactly three lines - its own
declaration and two lines inside
`src/lib/workflows/registry/steps.grading-singles.ts` (`:3` import, `:238`
call). No component reaches it.

A ninth surface grades without calling any of those from the browser: the
**cartridge drop**, which uploads an archive and lets an unattended workflow
call `gradeAction` server-side (`steps.grading-cartridge.ts:108`).

**THE NINE PATHS, named by the surface an instructor lands on:**

| # | Path | Where it lives | Input it takes |
|---|---|---|---|
| A | **Upload ZIP** | Tools > LMS > Grading, "Grade from" = Upload ZIP (`GradingTab.tsx:181`) | one zip of every submission |
| B | **Single Assignment** | same select, = Single Assignment (`:182`) | a Canvas discussion/assignment URL |
| C | **Live Feed** | same select, = Live Feed (`:183`) | a Canvas queue of everything pending |
| D | **GitHub Repo** | same select, = GitHub Repo (`:184`) -> `GithubGradingPanel` | one GitHub repo per student |
| E | **Repo Grades** | Tools rail item `repo-grades` (`manual-rail.ts:117,127`) | a course's GitHub org, scanned folder by folder |
| F | **Grading (from a recording)** | Tools > Recording, sub-tab `grading` (`RecordingTab.tsx:592` strip literal) | a screen recording of submissions |
| G | **Grading (from screenshots)** | same strip, sub-tab `snapgrade` | screenshots, one or more per student |
| H | **Submissions / cartridge drop** | bottom of the SAME Tools > LMS > Grading view (`GradingTab.tsx:473`) | a zip or .imscc archive, graded unattended |
| I | **Workflow presets** | Tools > Workflows | Canvas courses, unattended |

A and H share one screen. B and C share the same select as A. So the "Grading"
view alone hosts five of the nine.

---

## 2. Per-path step lists, cold start to a graded table

Each step is cited to the file and line that demands it. **A step I could not
cite is not listed** - section 7 says what those are.

### Prerequisite paid by every path

`gradeAction` opens with `await requireOwner()` (`grading.ts:733`), and
`requireOwner` is `requireUser` (`src/lib/supabase/auth.ts:451-453`), so
sign-in is required. The chat also requires sign-in, so this is counted as a
wash and appears in no formula.

### Path A - Upload ZIP

| # | Step | Kind | Citation |
|---|---|---|---|
| A1 | Land on Tools > Build Courses | transition | default: `useAppNavigation.ts:104` `activeTab` -> `"manual"`; `:156-189` `manualView` -> `"course-planning"` when nothing is stored |
| A2 | Click the "LMS" rail chip | click | `tab-rails.ts:132-140` builds the Tools rail from `MANUAL_VIEW_ORDER`; `manual-rail.ts:122` labels `content` as "LMS" |
| A3 | Click "Grading" in the inner destination row | click | `manual-rail.ts:56` `{ id: "lms-grading", label: "Grading" }`; `:191,:212` `resolveStateFromDestinationId` sets `manualView="content"` and `contentView="grading"` together |
| A4 | "Grade from" already reads Upload ZIP | 0 (default) | `GradingTab.tsx:72-76`: unrecognised/absent `ta-grading-source` falls back to `"zip"` |
| A5 | Choose the zip | file dialog | `GradingTab.tsx:236-241` `<input type="file" accept=".zip">` |
| A6 | Paste the assignment description | field | `GradingTab.tsx:295-306` `assignmentInstructions` textarea |
| A7 | Paste the rubric | field | `GradingTab.tsx:310-322` `rubric` textarea |
| A8 | Click "Start Review" | click | `GradingTab.tsx:343-356` submit button |
| A9 | Wait for the whole run | **WAIT** | see section 2.1 |

`view === "grading"` is rendered BEFORE the course-loaded gate in
`ContentTab.tsx:772`, while `!loaded ? null :` only guards `:778` onward - so
**no course selection is required on this path.** Confirmed by reading both
lines in one window.

**COLD = 6.** A1 is a landing, not an act, so the countable acts are A2, A3,
A5, A6, A7, A8.
**WARM = A5, A6, A7, A8 = 4.** Per submission = **0**.

### 2.1 The wait on paths A, B, C, H and I - the number the interaction count cannot see

`gradeStudentEntries` (`src/lib/grade/engine.ts:178`) is a **sequential**
`for` loop over students (`:207`), one model call per student
(`gradeSubmission` at `:229`), with `await sleep(interRequestDelayMs)` between
iterations (`:278`). `getGeminiInterRequestDelayMs()` defaults to
`DEFAULT_INTER_REQUEST_DELAY_MS = 1200` (`src/lib/gemini.ts:67,143-149`), and
the run is capped at `DEFAULT_MAX_SUBMISSIONS = 40`
(`src/lib/gemini.ts:32,129-134`) applied by `.slice(0, maxSubmissions)`
(`engine.ts:193`).

So the instructor's wait is at least `1.2 * (N - 1)` seconds of deliberate
sleep plus N model latencies, **and nothing is shown until all N finish** -
`GradingTab.tsx:426-427` renders `GradingResults` only when
`run && run.results.length > 0`, and `run` is the action's single return
value.

**And that loop runs inside a Server Action with no declared ceiling.**
`grep -n "maxDuration" src/app/page.tsx` printed nothing and exited 1, while
the same instrument on the same file printed `:63` for `useActionState` and
`:6` for `gradeAction` - so the canary fires and the absence is real.
This repo's own code states the consequence in two places:

- `src/app/actions/command-interface.ts:28`: "src/app/page.tsx sets no
  maxDuration and a server action looping N objects dies mid-loop on the
  platform default".
- `src/app/actions/learning-resource-links.ts:60`: "a Server Action with no
  maxDuration, set against Vercel Hobby's hard 60s ceiling".

`gradeAction` IS that shape, reachable from that page. **The app's
per-submission interaction cost of 0 is bought with an all-or-nothing wait
that grows with N and can end with nothing.** The chat's per-submission cost
of 1 buys a grade after every single paste.

### Path B - Single Assignment (Canvas URL)

| # | Step | Kind | Citation |
|---|---|---|---|
| B1-B3 | as A1-A3 | 2 clicks | as above |
| B4 | Pick "Single Assignment" in "Grade from" | selection | `GradingTab.tsx:182` |
| B5 | Paste the Canvas URL | field | `GradingTab.tsx:246-259` |
| B6 | Click "Retrieve from Canvas" | click | `GradingTab.tsx:265` `onClick={handleRetrieveCanvas}` |
| B7 | Wait for the fetch | **WAIT** | `handleRetrieveCanvas` at `GradingTab.tsx:99-131`, status `"loading"` at `:105` |
| B8 | Instructions and rubric arrive FILLED and READ-ONLY | **0** | `:113-114` set both from the fetch; `:301` and `:317` set `readOnly: source === "canvas"` |
| B9 | Click "Start Review" | click | `:343-356`; `disabled` until `canvasRetrieved` |
| B10 | Wait for the run | **WAIT** | section 2.1 |

**COLD = 6, WARM = 3** (B5, B6, B9; B4 is free when `ta-grading-source` is
already `canvas`, +1 when it is not). Per submission = **0**.

**This is the only path where the two chat inputs cost the instructor
nothing** - B8 is where the app genuinely beats a chat window, because Canvas
already holds the description and the rubric. Its price is in section 3.

Note the honest limit stated by the UI itself: if Canvas holds no rubric,
none is synthesized on this path (`GradingTab.tsx:123-126`).

### Path C - Live Feed

| # | Step | Kind | Citation |
|---|---|---|---|
| C1-C3 | as A1-A3 | 2 clicks | as above |
| C4 | Pick "Live Feed" | selection | `GradingTab.tsx:183` |
| C5 | Wait for the queue | **WAIT** | `LiveFeedPanel.tsx:117-118`: initial status is `"loading"` only when `readActiveInstitution()` is set, `"idle"` otherwise |
| C6 | Click "Auto Grade" on one row | click | `LiveFeedPanel.tsx:474` |
| C7 | Wait for that assignment's run | **WAIT** | `:421-425` renders the grading spinner |

**COLD = 4, WARM = 1 per assignment.** Per submission = **0** - `handleAutoGrade`
(`GradingTab.tsx:138-149`) hands the whole row to the same `formAction`.

This is the cheapest ATTENDED path in the app, and it is one dropdown entry
away from path A. Its price is the same as B's (section 3).

### Path D - GitHub Repo

| # | Step | Kind | Citation |
|---|---|---|---|
| D1-D4 | as A1-A3 plus "GitHub Repo" in the select | 3 clicks | `GradingTab.tsx:184,207-209` |
| D5 | **Per student**: pick the repo | selection | `GithubGradingPanel.tsx:490` `<GithubRepoPicker>` |
| D6 | **Per student**: type the label | field | `:492-504` |
| D7 | **Per student**: click "Add to queue" | click | `:505` |
| D5' | OR: pick the org | selection | `:524` |
| D6' | OR: type the repo-name prefix | field | (same block) |
| D7' | OR: click Import | click | `:538`, plus a wait |
| D8 | Paste the assignment instructions | field | `:713` |
| D9 | Paste the rubric (or generate one from a repo) | field / 2 clicks + wait | `:733` textarea; `:725-726` the repo picker + "generate" alternative |
| D10 | Click "Grade all" | click | `:744`, `disabled` while `queue.length === 0` |

**WARM, per-student queueing = 3 + 3N.** Since `3N > N` for all N >= 1, this
path has **NO CROSSOVER**: it loses to the chat at every N, forever.
**WARM, org import = 6 flat** (3 import acts + 2 pastes + grade).

The queue itself persists (`GithubGradingPanel.tsx:97,256`, key `QUEUE_KEY`),
so a SECOND assignment for the same cohort pays 3 rather than 3N. The
instructions and rubric do not (`:116-117`, both `useState("")`).

### Path E - Repo Grades

| # | Step | Kind | Citation |
|---|---|---|---|
| E1 | Click the "Repo Grades" rail chip | click | `manual-rail.ts:117,127`; `:196` maps the id to `manualView="repo-grades"` |
| E2 | Pick the course | selection | `repo-grades/index.tsx:706` `courseId` |
| E3 | Wait for the roster, the scan and the assignment list | **WAIT x3** | `index.tsx:761-775` passes `coursesLoading`, `scanLoading`, `rosterLoading`, `assignmentsLoading` to the banner component |
| E4 | Pick the folder (the assignment) | selection | `index.tsx:729` `selectedFolder` |
| E5 | Instructions and rubric are ALREADY THERE | **0** | `repoGradesUiState.ts:198-199` restore them from `ta-repo-grades-instructions` / `ta-repo-grades-rubric` |
| E6 | Click "Grade all" on the column | click | `RepoGradesGrid.tsx:349` `buildBulkGradePlan` |

**WARM = 2** (E4, E6; E2 restores from `ta-repo-grades-course`,
`repoGradesUiState.ts:195`). Per submission = **0**.

On interaction count alone this is the app's best path. Its entire cost is in
section 3, and it is the largest prerequisite bill in the app.

### Path F - Grading (from a recording)

| # | Step | Kind | Citation |
|---|---|---|---|
| F1 | Click the "Recording" rail chip | click | `manual-rail.ts:114,124` |
| F2 | Click the "Grading (from a recording)" sub-tab | click | `RecordingTab.tsx:592` strip literal, key `grading` |
| F3 | Click "Add rubric", paste it in the modal, submit | 3 acts | `GradingRecordingPanel.tsx:797-803` button; `RubricInputModal.tsx` |
| F4 | Click start capture | click | `GradingRecordingPanel.tsx:855-859` |
| F5 | **Per submission**: bring it on screen for the capture | >= 1 | the capture is the input; see section 7 |
| F6 | Click stop | click | same control (`handleStartStop`) |
| F7 | Click "Grade submissions" | click | `GradingRecordingPanel.tsx:863-869`; disabled while `rubricText` is blank (`:680`, `:875`) |

**WARM = 8 + p*N where p >= 1** (F1, F2, F3 counted as 3 acts, F4, F6, F7)
**and p is not measurable from source**
(section 7). **No crossover can be asserted.** The panel's own copy concedes
the surface is unbound: "Nothing here is bound to a student record or posted
to an LMS" (`:700`).

### Path G - Grading (from screenshots)

Same two navigation clicks as F (rail chip, then the `snapgrade` sub-tab in
the same strip literal at `RecordingTab.tsx:592`), then the rubric through the
same non-persisting modal as F (`SnapshotGradingPanel.tsx:197-198` button and
modal state; `:149` `rubricText` as plain `useState("")`) counted as 3 acts,
then per student a set of shots plus a "next student" advance.
**WARM = 5 + p*N with p >= 1**, and p is not measurable from source
(section 7); **no crossover can be asserted.**

### Path H - Submissions / cartridge drop

This path is at the bottom of the SAME screen as path A
(`GradingTab.tsx:473` renders `<CartridgeDropPanel />`).

| # | Step | Kind | Citation |
|---|---|---|---|
| H1-H3 | as A1-A3 | 2 clicks | as above |
| H4 | Course / Assignment / Points / LMS are ALREADY FILLED | **0** | `CartridgeDropPanel.tsx:40,44,48,52` restore `ta-cartridge-course`, `-assignment`, `-points`, `-lms` |
| H5 | Edit the assignment label for this assignment | field | `:364` `id="cartridge-assignment"` |
| H6 | Paste the rubric - **BEFORE** touching the file input | field | `:406-418`, `id` at `:411` |
| H7 | Choose the archive - this UPLOADS IMMEDIATELY | file dialog | `:338` `onChange={handleFileSelect}`; `handleFileSelect` at `:161`, `saveCartridgeDrop` at `:210` |
| H8 | Turn on auto-grading (once, ever) | click | `:457`, creating a `cartridge-uploaded` trigger for workflow `cartridge-grading` (`:266`, `:283`; the workflow is `presets/grading.ts:89-105`) |
| H9 | **No wait at all** | 0 | the workflow runs unattended; grades land in Drafts and as a CSV (`:439`, `:446`) |

**WARM = 3** (H5, H6, H7). Per submission = **0**. Waits = **0**.

**This is the cheapest path in the app by every measure this census can take,
and it is the one with no navigation entry of its own.**

### Path I - Workflow presets

Every grading preset's first step takes Canvas courses or an institution
(`steps.grading-run.ts:31-46`, inputs `courses` (`hubCourseList`) and
`institution`), so this path inherits every Canvas prerequisite in section 3
plus the cost of selecting or building a workflow. Not costed further here;
it is the unattended sibling of B/C rather than a fifth way to grade a zip.

---

## 3. Setup and per-submission, as formulas in N, with the crossover

`s` = per-assignment setup (WARM), `p` = per-submission, chat = `2 + N`.
Crossover `N*` = smallest N with `s + p*N < 2 + N`.

| Path | Cold | s (warm) | p | Formula | **N\*** | Beats the chat? |
|---|---|---|---|---|---|---|
| **H cartridge** | 5 | **3** | 0 | `3` | **2** | yes, from N = 2 |
| **E Repo Grades** | 4 | **2** | 0 | `2` | **1** | yes, from N = 1 |
| **C Live Feed** | 4 | **1** | 0 | `1` | **1** | yes, from N = 1 |
| **B Canvas URL** | 6 | **3** | 0 | `3` | **2** | yes, from N = 2 |
| **A Upload ZIP** | 6 | **4** | 0 | `4` | **3** | yes, from N = 3 |
| **D GitHub, org import** | 9 | **6** | 0 | `6` | **5** | yes, from N = 5 |
| **D GitHub, per repo** | 6+3N | **3 + 3N** | 3 | `3 + 3N` | **none** | **never** |
| **F recording** | 8 + pN | 8 + pN | >= 1 | unmeasured | **none assertable** | unmeasured |
| **G screenshots** | 5 + pN | 5 + pN | >= 1 | unmeasured | **none assertable** | unmeasured |

**Read this table carefully, because its headline is the opposite of the
owner's experience.** Six of the nine costed rows cross over at N = 5 or
below; four of them (C, E, B, H) cross at N <= 2, which is every assignment
worth the name. On INTERACTION COUNT ALONE the app already wins for any
realistic assignment. The owner reports the app is slower anyway. The count is
therefore not where the loss is, and sections 4, 5 and 6 are where it is.

---

## 4. The prerequisite audit - what the app demands before any value exists

Each row says whether the requirement is GENUINELY REQUIRED (the path cannot
produce a grade without it) or the DEFAULT ROUTE (a path exists around it).

| # | Prerequisite | Paths | Citation | Required or default |
|---|---|---|---|---|
| P1 | Sign in | all | `grading.ts:733` `requireOwner()`; `auth.ts:451-453` | required; the chat charges the same |
| P2 | **A Canvas credential set as a SERVER ENVIRONMENT VARIABLE, per institution** | B, C, E, I | `canvas-credentials.ts:130` reads `process.env[\`${institution}_CANVAS_API_TOKEN\`]`; `canvas-core.ts:14` documents the same shape | **REQUIRED and OWNER-ONLY.** An instructor cannot pay this from inside the app at all. |
| P3 | An active institution selected | C, I | `LiveFeedPanel.tsx:117-118`: the queue does not even enter `loading` without `readActiveInstitution()` | required for C |
| P4 | A course record carrying a GitHub org | E | `repo-grades/index.tsx:697` `missingOrg = !!course && !(course.githubOrg ?? "").trim()` | required for E |
| P5 | Student GitHub usernames linked to the roster | E | `repo-grades/LinkUsernamesPanel.tsx`, and `index.tsx:698` `noConfirmedRows` when every row's binding is unconfirmed | required for E |
| P6 | A repo scan, a roster load and an assignment list | E | `index.tsx:761-775` four `*Loading` props | required for E; three waits before the first grade |
| P7 | **A zip whose filenames follow `studentname_date_time_filename`** | A, H | `grade/utils.ts:87-100` `matchStudentFileConvention` needs **at least four underscore-separated parts** | **REQUIRED IN EFFECT, STATED NOWHERE, AND FAILS SILENTLY** - see below |
| P8 | Supported file extensions inside the zip | A, H | `grade/extraction.ts:67-69` computes `isSupportedFile` from `TEXT_EXTENSIONS` and `DOCUMENT_EXTENSIONS`; `:83-85` drops anything that is neither that nor an image, with no message | required; failure surfaces only as `GradingTab.tsx:368` "No supported submission files were found" |
| P9 | A course selected | A, B, C | **NOT REQUIRED** - `ContentTab.tsx:772` renders the grading view outside the `!loaded` gate at `:778` | **default route only.** Good news, stated so the remedy does not "fix" a cost that is not being charged. |
| P10 | One GitHub repo per student, already existing | D, E | `GithubGradingPanel.tsx:490`; `repo-grades/index.tsx:697` | required for D and E |
| P11 | A workflow trigger turned on | H | `CartridgeDropPanel.tsx:266,283` | required ONCE, ever; not per assignment |

**P7 is the one that deserves its own paragraph.** `matchStudentFileConvention`
matches the Canvas bulk-download shape (`utils.ts:68-76` names it). When no
part of a file's path matches it, `parseSubmissionFileName` falls through to
`leafStemFallback` (`utils.ts:121-126`), which takes the **leading alphanumeric
run of the filename stem** as the student identity. A zip of `essay1.docx`,
`essay2.docx`, `essay3.docx` therefore groups into ONE student called "essay".
The UI's entire statement of this requirement is "Upload a zip archive that
contains the student submissions" (`GradingTab.tsx:240`). **A wrong-shaped zip
does not error - it silently returns the wrong number of students**, and the
instructor's only signal is a table that is shorter than the class.

**P2 is the prerequisite that decides the product question.** Paths B, C and E
are the three that beat the chat most decisively, and all three are gated on a
credential only the repo owner can set, in Vercel, outside the app. Path A and
path H are the two an unprovisioned instructor can actually use, and they are
exactly the two that still demand both chat inputs by hand.

---

## 5. What the app stores, and what it must be re-told every time

The chat must be re-told all three inputs on every assignment, forever. This is
the axis where the app has a categorical advantage available to it, so a
failure here is not a missing optimisation - it is the advantage not being
taken.

**Instrument:** `grep -n "localStorage" <file>` on each grading surface, plus
`grep -rn "rememberRubric\|rubric-bank\|rubricBank" src --include=*.ts
--include=*.tsx | grep -v "\.test\."`. Absence canary on `GradingTab.tsx`:
grepping a key that does not exist printed nothing and exited 1, while the
real key printed `:74` and `:86`.

### 5.1 The rubric

| Path | Stored? | Where, keyed by what | Cost to REACH the stored one | Cost to re-paste |
|---|---|---|---|---|
| A zip | **NO** | `GradingTab.tsx:80` `useState("")` | n/a | 1 |
| B Canvas | not stored, but **FETCHED** | from Canvas, keyed by the assignment URL (`GradingTab.tsx:114`) | 2 (paste URL, click Retrieve) + 1 wait, and it also brings the description | 0 |
| C Live Feed | fetched per row | `GradingTab.tsx:143` `fd.set("rubric", row.rubricText)` | 0 | 0 |
| D GitHub | **NO** | `GithubGradingPanel.tsx:117` `useState("")` | n/a | 1 |
| E Repo Grades | **YES** | `repoGradesUiState.ts:54` `ta-repo-grades-rubric`, **ONE GLOBAL VALUE** - `:46-53` states it is deliberately not per-column and not per-course | **0** - restored at `:199` | 1 |
| F recording | **NO, BY POLICY** | `RubricInputModal.tsx:29-34` | n/a | 1 per session |
| G screenshots | **NO, BY POLICY** | `SnapshotGradingPanel.tsx:143-149` | n/a | 1 per session |
| H cartridge | **NO, AND ACTIVELY CLEARED** | `CartridgeDropPanel.tsx:55` `useState("")`, cleared at `:220` after every upload | n/a | 1 per upload |
| bank | partial | `rubric_bank` table, keyed by a content hash of the rubric (`rubric-bank.ts:28`) and matched on topic words (`:88-99`) | **UNREACHABLE on the default provider** - see 5.4 | n/a |

**THE POLICY, quoted because it is the finding.** `RubricInputModal.tsx:29-34`:

> the text is handed to the caller via onSubmit and NOTHING here persists it -
> no localStorage, no persisted-control key of any kind, no server record.
> That is a deliberate exception to this repo's usual "every new textbox
> persists" rule ... a rubric is exactly as sensitive as a syllabus ... and
> this feature's whole point is that nothing about it lingers once the
> instructor moves on.

`SnapshotGradingPanel.tsx:143-149` repeats it verbatim in its own words and
applies it to `assignmentText` as well.

So: **the one thing a chat structurally cannot do - remember the rubric - is
switched off across most of this app on purpose.** This is not a bug report.
It is a decision with a stated reason, and it is the single largest gap
between what this app could offer and what it does offer. Whether the reason
still holds is an OWNER decision, recorded in section 8 as RES-A39-1, not
settled here.

### 5.2 The specific defect the row predicted, found

Row A39's note predicted: "if the app already stores them, the defect is that
reaching the stored one costs more than re-pasting." The census found a
sharper instance than that.

**On path H - the app's cheapest path - four of the five form fields persist
and the rubric is the only one that does not, and it is explicitly cleared
after every use.** `CartridgeDropPanel.tsx:40,44,48,52` restore
`ta-cartridge-course`, `ta-cartridge-assignment`, `ta-cartridge-points`,
`ta-cartridge-lms`. `:55` declares `rubricText` as plain `useState("")`, and
`:220` runs `setRubricText("")` immediately after `saveCartridgeDrop` returns.

The field ORDER compounds it. The file input sits at `:334-341` (`id="cartridge-file"` at `:335`) and its
`onChange` (`:338`) uploads immediately (`handleFileSelect` at `:161` calls
`saveCartridgeDrop` at `:210`). The rubric box sits at `:406-418` (`id="cartridge-rubric"` at `:411`), **below it**.
An instructor who reads the form top to bottom picks the file first, the
upload fires with `rubricText` still empty, and the workflow grades against a
generated rubric. Nothing warns them. **DIRECTION OF FAILURE: a rubric typed
after the file is chosen has no effect on the grade, and the instructor cannot
tell.**

### 5.3 The assignment description

| Path | Stored? | Citation |
|---|---|---|
| A zip | **NO** | `GradingTab.tsx:79` `useState("")` |
| B / C Canvas | fetched | `GradingTab.tsx:112`, `:141` |
| D GitHub | **NO** | `GithubGradingPanel.tsx:116` |
| E Repo Grades | **YES** | `ta-repo-grades-instructions` (`repoGradesUiState.ts:53`, restored `:198`); and it can be taken from the folder's README instead (`ta-repo-grades-readme-instructions`, `:63`) |
| F / G | **NO, same policy** | as 5.1 |
| H cartridge | **REPLACED BY TWO LABELS** | `steps.grading-cartridge.ts:95` sends `assignmentInstructions` as `"${courseLabel} - ${assignmentLabel}"` |

**The H row is a defect with a specific consequence.** On the app's cheapest
path, the assignment description the owner pastes into the chat has **nowhere
to go**: no field collects it, and what the engine receives instead is a
course label joined to an assignment label. If the rubric box is also empty -
which 5.2 shows is the likely state - `gradeAction` reaches
`generateRubric(assignmentInstructions, provider)` (`grading.ts:866`) and
synthesizes a whole rubric from that two-label string. **DIRECTION OF FAILURE:
the fastest path in the app is also the one grading against the least
information, and nothing in the UI says so.**

### 5.4 The rubric bank, and why it does not close this

There IS a server-side rubric store: `rubric_bank`, written by
`rememberRubric` (`rubric-bank.ts:57`) and read by `findRubricForTopic`
(`:107`). It would be the mechanism that makes "paste the rubric once, ever"
real. It is not reachable on the default path, for two independent reasons,
both measured:

1. **The only reader is gated on the `embedded` provider.**
   `grep -n "findRubricForTopic"` over `src` returns readers at
   `grade/rubric.ts:2,253` and `embedded/router.ts:19` (measured by `grep -n "findRubricForTopic" -r src`). The `rubric.ts` call
   sits inside `if (provider === "embedded")` (`:252-256`). The default
   provider is `gemini` (`llm-provider.ts:14` `DEFAULT_PROVIDER`), so a default
   instructor never reads the bank.
2. **The writers are gated the same way.** In `grading.ts`, `rememberRubric` is
   called at `:796` and `:848` only - both inside `provider === "embedded"`
   branches. The Gemini branch (`:859` onward) calls it nowhere. So a default
   instructor's pasted rubric is never even stored.

Even if both gates were opened, the bank is keyed by a content hash and
matched by topic-word overlap with a threshold of `MIN_MATCH_SCORE = 6`
(`rubric-bank.ts:25,95`) - it is a similarity lookup, not "this assignment's
rubric". **It is a plausible foundation for the remedy and a poor substitute
for one; the architect owns that call.**

### 5.5 The submissions

The chat pays 1 per submission. Every app path except D-per-repo, F and G
pays 0, because the archive, the Canvas queue or the org scan carries all N at
once. **This is the app's real, already-built advantage and it is not the
problem.**

---

## 6. The honest verdict

**Cheapest path: H, the cartridge drop** (3 interactions, 0 per submission, 0
waits, crossover N* = 2) - but only for an instructor who has found it, turned
on auto-grading once, and knows to fill the rubric before the file input.
**Cheapest path an instructor is likely to actually land on: A, Upload ZIP**
(4 warm, crossover N* = 3).
**Cheapest path outright, if the owner has set the Canvas credential: C, Live
Feed** (1 interaction per assignment).

**Does the app beat the chat at the N a real instructor has?** On interaction
count, **yes, and comfortably** - every costed path but D-per-repo crosses
over by N = 5, and the four cheapest cross by N = 2. **So the count is not
where the owner's experience comes from, and any remedy aimed only at reducing
clicks will not change what the owner feels.** That sentence is the most
important finding in this document and it is stated plainly because softening
it would send the architect at the wrong target.

**Where the loss actually is, each with the evidence already cited above:**

1. **The chat returns a grade after 3 interactions. The app returns the first
   grade only after ALL N are done** (`engine.ts:206` sequential loop, `:277`
   1.2s sleep between students, `GradingTab.tsx:365` renders nothing until
   `run.results.length > 0`), **and that run has no declared time ceiling on a
   platform this repo's own code says kills it mid-loop**
   (`page.tsx` has no `maxDuration`, canary-confirmed;
   `command-interface.ts:28`). Time-to-first-value is where the chat wins,
   and the interaction count cannot see it.

2. **The rubric is re-pasted on every path an unprovisioned instructor can
   reach, by explicit policy** (`RubricInputModal.tsx:29-34`). So on paths A,
   F, G and H the app charges the chat's own 2 setup interactions AND adds
   navigation, a file dialog and a format requirement on top. Against the chat,
   the app's setup is the chat's setup plus overhead - which is exactly what
   "much faster to use an llm chat" describes.

3. **The paths that DO remove both pastes (B, C, E) are gated on a credential
   the instructor cannot set** (`canvas-credentials.ts:130`, P2) **or on a
   configured GitHub org and a linked roster** (P4, P5). The app's advantage
   and the app's provisioning bill are on the same three surfaces.

**The two or three steps whose removal would move the number most, ranked by
the count they carry:**

| Rank | Step | Count it carries | Evidence |
|---|---|---|---|
| **1** | **Re-pasting the rubric** | **1 of the 4 warm interactions on path A (25%), 1 of 3 on path H (33%), and 100% of the app's only categorical advantage over a chat on this axis** | 5.1: not persisted on A, D, F, G, H; persisted only on E; cleared on H at `CartridgeDropPanel.tsx:219` |
| **2** | **Re-pasting the assignment description** | 1 of 4 on path A (25%); on path H it is not merely repeated but **absent**, replaced by two labels | 5.3, `steps.grading-cartridge.ts:95` |
| **3** | **The two navigation clicks to reach Grading** | 2 of 6 cold interactions (33%), **0 warm** | A2/A3, and `ta-manual-view` / `ta-content-view` make it free on return. **Listed so it is visibly the SMALLEST of the three, not the first thing optimised.** |

**And one that carries zero interactions and is named separately because
ranking by count would bury it:** the blocking, all-or-nothing, uncapped run
(item 1 above). It costs 0 clicks and it is the difference between "a grade
after 3 acts" and "everything after a wait that may return nothing".

**What I am NOT designing here**, per the seat boundary: whether the rubric
policy should change, whether the run should stream or move to a route handler
with a declared `maxDuration`, and whether path H should have its own
navigation entry. Those are shape decisions and they belong to the architect
pass that consumes this document.

---

## 7. What I could not measure, stated rather than guessed

- **Per-submission cost on paths F and G.** The input is a screen capture or a
  set of screenshots, so the instructor's cost is scrolling, framing and
  advancing - acts that exist in the world, not in the source. `p >= 1` is
  provable (each student must be brought on screen); the value of `p` is not.
  **No crossover is asserted for F or G.**
- **The cost of PRODUCING the zip on paths A and H.** It is paid in the LMS,
  outside this repo, and nothing here can cite it. The chat charges nothing
  comparable because a paste has no container. This is a real cost that this
  census reports as unmeasured rather than assuming to be zero.
- **Wall-clock latency of one model call.** There is no API key in this
  checkout (`docs/loop/this-repo.md` section 6), so the 1.2s inter-request
  sleep is measurable from source and the model latency it is added to is not.
- **Whether the uncapped Server Action actually dies at N submissions in
  production.** The code's shape is measured and this repo's own comments
  state the consequence, but the ceiling itself is a deployment fact
  (`docs/loop/this-repo.md` section 6: no `.env`, no live platform).
- **Anything a screen shows.** Nothing renders under vitest here. Every
  interaction count above is a reading claim traced from a control to its
  handler, never an observed click.
- **Path I's per-workflow setup cost.** Bounded below by "select or build a
  workflow" and not costed; it inherits every Canvas prerequisite regardless,
  which is enough for this census's purpose.

---

## 8. Residual register

Every entry names an OWNER, an INSTRUMENT and a STEP. **A residual that is not
in `docs/BACKLOG.md` does not exist** (`docs/DEV_LOOP.md` step 0), so each of
these is owed an entry there by whoever lands the next A39 chunk.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-A39-1 | **Does the no-persistence rubric policy still hold?** `RubricInputModal.tsx:29-34` states it deliberately, citing sensitivity. Removing the re-paste is the highest-count remedy in this census and it cannot be designed without this answer. | **Repo owner.** Not an agent decision: it trades a stated privacy position against the app's one categorical advantage. | The quoted policy comment, plus the per-path table in 5.1 | Before the architect pass designs any rubric memory. Not blocking the architect pass itself - it can design both branches. |
| RES-A39-2 | **Every interaction count in this document is a reading claim.** Nothing renders under vitest. | **Repo owner**, in a real browser. | Walk path A and path H from a cold profile and count the acts against the tables in section 2. | The owner verification pass. |
| RES-A39-3 | **Path H grades against two labels instead of the assignment description** (`steps.grading-cartridge.ts:95`), and its rubric field is cleared after every upload (`CartridgeDropPanel.tsx:220`) while every sibling field persists. | The chunk whose write set includes `CartridgeDropPanel.tsx` or `steps.grading-cartridge.ts`. Agent work once scoped. | A unit test over the FormData the step builds: assert `assignmentInstructions` is not merely `"<course> - <assignment>"` when a description exists. **DIRECTION OF FAILURE: RED on today's code**, so it must be watched failing first. | The first A39 implementation chunk. |
| RES-A39-4 | **Path P7: a zip that does not follow the four-part convention silently mis-groups students** (`grade/utils.ts:87-100` then `:121-126`), with the UI stating no requirement (`GradingTab.tsx:240`). | The chunk whose write set includes `GradingTab.tsx` or `grade/utils.ts`. | A unit test over `groupSubmissionsByStudent` with three non-conforming filenames, asserting the returned entry count. **DIRECTION OF FAILURE: RED when three files collapse to fewer than three students** - which is today's behaviour. | The first A39 implementation chunk that touches ingestion. |
| RES-A39-5 | **The attended grading run has no declared `maxDuration`** and loops N model calls (`page.tsx`, canary-confirmed absent; `engine.ts:206,277`). | The architect pass, then an implementer. | `grep -n "maxDuration" src/app/page.tsx` (must stay empty for the finding to stand) plus the loop's own shape. **DIRECTION OF FAILURE: a run of N students returning nothing rather than N-minus-some rows.** | The architect pass consuming this census. |
| RES-A39-6 | **The rubric bank is unreachable on the default provider** - both its readers and its writers are gated on `provider === "embedded"` (`grade/rubric.ts:252-256`; `grading.ts:796,848` versus the ungated Gemini branch at `:860`). | The architect pass. | The two greps in 5.4, re-run. **DIRECTION OF FAILURE: a reader or writer appearing outside an `embedded` branch means the gate has moved and 5.4 is stale.** | Before any design that proposes the bank as the rubric-memory mechanism. |
| RES-A39-7 | **Per-submission cost on paths F and G is unmeasured** (section 7), so the census's path table is incomplete by two rows. | Repo owner, or a later chunk that can observe a real capture session. | Count the acts for one real three-student capture. | Whenever F or G is proposed as the fast path. |

---

## 9. What this document deliberately does not contain

Per `docs/loop/seats.md` (Acceptance criteria brief) and
`docs/loop/traps-spec.md:35-42`: no mechanism, no seam placement, no oracle
construction, no reuse survey. The remedy's shape - streaming versus a route
handler, per-assignment versus global rubric memory, whether path H gets its
own rail entry - is the architect's, built on the counts above. There is no
LEVERAGE CLAIM in this document because it is a measurement artifact, not a
feature's criteria; **the claim is owed by the criteria document that follows
it**, and section 5 is the evidence that claim will have to argue against: on
the axis the owner named, the app's advantage over a chat is currently
switched off by policy on every path an unprovisioned instructor can reach.
