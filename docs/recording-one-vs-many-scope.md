# Scope: recording one-vs-many (owner request 2026-10-12)

Owner's words: "when I submit a RECORDING, the app/LLM needs to better determine
whether the recording is ONE submission or MULTIPLE, depending on the recording
and on the assignment." Meaning: a recording submitted to the grading chat may
contain ONE student's work or SEVERAL students' submissions (e.g. several
presentations back to back). Today it is one submission. The app should decide
one-vs-many from (a) the ASSIGNMENT intent and (b) the RECORDING, then split a
multi-recording into per-student submissions.

READ-ONLY artifact. No production code was edited producing it. A fresh
`loop-checker` reads this before any build consumes it.

Every quantity below names the command that produced it. ASCII only.

---

## 0. The current recording path, traced (STEP 0)

### 0.1 How a recording ENTERS the grading chat - two distinct paths

There are TWO things a grading-chat user calls a "recording", and they are
mechanically different. This distinction is load-bearing for the whole scope,
so it is stated first.

1. **In-app "Record" = screen FRAMES as images (NOT a continuous video).**
   The composer's `{ value: "record", label: "Record" }` segment
   (`ChatComposer.tsx`, pinned by
   `GradingChatPanel.structure.test.ts:713-732`) drives
   `useChatScreenFrameCapture` (`chatFrameCapture.ts:91`). It samples JPEG
   frames every `FRAME_SAMPLE_INTERVAL_MS = 3000` (`chatFrameCapture.ts:21`),
   capped at `MAX_RECORDING_FRAMES = MAX_SHOTS` = 12
   (`chatFrameCapture.ts:18`), and delivers each frame as an image `File`
   (`frameToImageFile`, `chatFrameCapture.ts:25-30`). The composer adds each
   frame as a **composite file part** (`GradingChatPanel.structure.test.ts:720-727`),
   so "Grade submission (N)" merges them into ONE composite row via
   `mergeCompositeEntries` (`chatSubmissionIntake.ts:120-138`). There is no
   continuous-video capture feeding the grading chat; `useRecorder.ts`'s
   `MediaRecorder` (the CAPTURE leverage instance,
   `docs/loop/leverage.md:38`) belongs to the recording studio, not this
   surface.

2. **Uploaded video file = a continuous video (the storaged-video path).**
   `decideVideoTransport` (`video-transport.ts:92-121`) routes a picked file
   with a video extension straight to private Storage
   (`uploadGradingVideo`, `video-transport.ts:132-156`;
   `submitLooseVideo`, `videoClient.ts:97-130`), then the driver's
   `storaged-video` branch (`useContinuousGradingRun.ts:412-432`) calls
   `prepareVideo` -> `POST /api/grade-submission-video`
   (`videoClient.ts:51-66`; route `grade-submission-video/route.ts:66-112`).
   `prepareLooseVideo` (`video-prepare.ts:58-118`) returns **exactly ONE
   entry** carrying a `videoRef`.

**SHAPE DECISION (owned here): the one-vs-many feature targets path 2, the
continuous uploaded video.** The owner's own example - "a video of several
presentations back to back" - is a continuous timeline, which path 1 does not
produce: path 1 is up to 12 discrete screenshots already merged into one
composite, with no timeline to segment and much weaker per-student signal.
Splitting a frame tray by student is a different problem with a different
instrument; it is recorded as an explicit out-of-scope residual in section 7,
not folded in. Treating it as "the same feature" is the exact error this seat
is told to avoid (a surface pretending two mechanisms are one).

### 0.2 Where "one recording == one submission" lives today

- Uploaded video: `prepareLooseVideo` returns `{ entry: {...} }` - a singular
  `entry`, one `submittedFiles[0]` with one `videoRef`
  (`video-prepare.ts:100-117`). The driver sets `entries = [prepared.entry]`
  (`useContinuousGradingRun.ts:432`) - a one-element array, dispatched as one
  `sourceIndex`.
- At grade time, `/api/grade-run-item` grades that ONE entry and sends the
  WHOLE video as a single `fileData` attachment: `withEntryVideos` uploads it
  to the Gemini Files API and hands `gradeEntries([resolved], ...,
  { extraAttachments })` (`grade-run-item/route.ts:292-301`);
  `extraAttachments` become one `{ fileData: { fileUri, mimeType } }` part in
  `scoreAxis` (`engine.ts:104-113`). One video in, one model call, one grade
  out. That is the assumption the owner wants broken.

### 0.3 How the assignment intent is available at grade time

- The chat session captures `assignmentInstructions` and the rubric once at
  `beginSession` and freezes them: `assignmentInstructionsRef.current =
  sessionParams.assignmentInstructions` and `headerRef.current = header`
  (`useContinuousGradingRun.ts:343-344`); the resolved header carries
  `effectiveRubric` (`:331`, `:675`). Every dispatched grade body carries
  `assignmentInstructions: assignmentInstructionsRef.current` and
  `rubric: header.effectiveRubric` (`useContinuousGradingRun.ts:555-556`).
- So the assignment description/instructions and the rubric ARE in hand on the
  client at submit time, before any grade is dispatched - which is exactly
  when a one-vs-many decision must be made. No new fetch is needed to read
  assignment intent; it is already a driver ref. (The Canvas-pulled
  description, when a Canvas URL is pinned, is already composed into those
  same instructions upstream of `beginSession` via the override flow,
  `GradingChatPanel.structure.test.ts:285-348`.)

### 0.4 The identity / distinctness model a split must reuse

- The driver assigns each dispatched entry a **session-unique** student
  display: `assignUnclaimedLabel(baseStudent, takenLabelsRef.current)` then
  `takenLabelsRef.current.add(label)` (`useContinuousGradingRun.ts:546-549`) -
  the assign-then-add that makes distinctness hold, the same shape as
  `assignNextUploadIdentity` (`oneUploadQueue.ts:54-63`) and
  `assignUploadIdentities` (`:66-75`).
- Distinctness is not cosmetic: `GradingResults.tsx` keys every per-row state
  (edit cell, post status) on `r.student`, so two rows sharing a display
  "would cross-wire an edit cell / post status into a live gradebook write"
  (`oneUploadQueue.ts:10-11`). This is the gradebook-write hazard a multi-split
  must not reintroduce.
- The refusal precedent for blended students is `collisionRefusal.ts`
  (`decideCollisionRefusal`, `:40-44`) - it refuses a run whose parse would
  collapse distinct students onto one key. It operates on zip/path inputs, not
  on a video timeline, so it is a PRECEDENT for the invariant ("this may split,
  never merge"), not a component reused verbatim here.

### 0.5 Can Gemini be asked to segment / timestamp the video?

- Today the model receives the video as ONE `fileData` part and a text prompt
  (`engine.ts:104-113`). The wire type `LlmPart` is
  `{ fileData: { fileUri: string; mimeType: string } }` and nothing more
  (`llm.ts:42`) - there is NO `videoMetadata` / `startOffset` / `endOffset`
  field on the part. So a native per-part time window is NOT representable
  today without widening `LlmPart`.
- Asking the model, in the TEXT part, to return timestamp ranges ("list each
  distinct presentation with its start and end time") is feasible with the
  current Files API usage with no wire change. Likewise, instructing a grade
  call to attend only to a time window is a TEXT instruction, not a wire field.
- **Honest limit (this repo):** there is no API key and no network here
  (`docs/loop/this-repo.md` section 6; `gemini-files.ts:7-10` states the wire
  protocol is "RECALLED, never observed"), and `vitest.setup.ts` throws on real
  fetch. So whether the model segments correctly, and whether a textual time
  window actually confines its attention, is **OWNER-walk only** and
  unverifiable in-checkout. The build can prove the plumbing, the typed
  decision shape, and the distinctness of the produced rows; it can NEVER prove
  the segmentation is accurate.

### 0.6 Caps and budgets already in force (measured)

- `VIDEO_MAX_BYTES = ZIP_MAX_MEMBER_DECLARED_BYTES = 40 * 1024 * 1024` (40 MB)
  - `grep -n ZIP_MAX_MEMBER_DECLARED_BYTES src/lib/zip-caps.ts` -> `38:export
  const ZIP_MAX_MEMBER_DECLARED_BYTES = 40 * 1024 * 1024;`, imported at
  `video-limits.ts:14`. A video over 40 MB is refused by
  `decideVideoTransport` BEFORE any upload (`video-transport.ts:104-112`).
  There is NO downscale path - the cap is a hard refuse.
- `VIDEO_GRADING_ENABLED = true` - `grep -n VIDEO_GRADING_ENABLED
  src/lib/grade/constants.ts` -> `50:export const VIDEO_GRADING_ENABLED =
  true;`. The video path is LIVE, not dark.
- `VIDEO_MAX_PENDING_STAGED = 6` (`video-limits.ts:22`); session entry ceiling
  `DEFAULT_MAX_ENTRIES = 40` (`useContinuousGradingRun.ts:75`).
- Per grade-item budget: `TOTAL_BUDGET_MS = 50_000`, `VIDEO_PREPARE_BUDGET_MS =
  25_000` (`grade-run-item/route.ts:58,62`).

### 0.7 Measured sizes of files a build would touch

`@(Get-Content <file>).Count` (the mandated instrument), 2026-10-12:

| File | Lines |
|---|---|
| `src/lib/grade/engine.ts` | 691 |
| `src/app/components/grading-chat/useContinuousGradingRun.ts` | 690 |
| `src/app/components/grading-chat/GradingChatPanel.tsx` | 599 |
| `src/app/components/grading-chat/ChatComposer.tsx` | 565 |
| `src/app/api/grade-run-item/route.ts` | 333 |
| `src/lib/gemini-files.ts` | 272 |
| `src/lib/grade/video-grade-seam.ts` | 166 |
| `src/app/components/grading-chat/chatSubmissionIntake.ts` | 159 |
| `src/app/components/grading-chat/videoClient.ts` | 130 |

The 1000-line ceiling (`src/file-size-ceiling.structure.test.ts`, `LIMIT =
1000` at `:41`) is the binding constraint. The three largest files on the edit
path (engine 691, driver 690, panel 599) all have headroom, but every wave
below adds to them; W3 in particular adds to engine.ts and the driver, so the
plan keeps new logic in NEW leaves and keeps per-file additions small (section
3.6).

---

## 1. Leverage claim (AC seat owns the final wording; recorded here for the checker)

**Class: SCALE + ATTRIBUTION** (`docs/loop/leverage.md:41,43`), the same
compound N15 claims.

- SCALE: one rubric/criteria pair, held constant, applied to N students found
  inside ONE recording - `gradeStudentEntries` already pins one
  `rubric`/`criteria` pair across a batch (`engine.ts:383-399`,
  leverage `:41`). A chat re-grades each pasted clip independently with nothing
  holding the batch to one rubric.
- ATTRIBUTION: each segment becomes a DISTINCT student row by construction
  (`assignUnclaimedLabel` + taken-set, `useContinuousGradingRun.ts:546-549`),
  so the grade for presentation 2 cannot be written onto presentation 1's row.
  In a chat the human IS the attribution mechanism: they paste one clip and
  read back one grade, and nothing can detect that two presentations were
  blended onto one grade. "A chat has no microphone or camera" (CAPTURE,
  leverage `:38`) is a weaker adjacent claim and is NOT the one made here - the
  video arrives as an uploaded file, not live capture.

**Removal test (the ONE criterion that goes RED when the advantage is
removed):** with a confirmed two-segment split, assert the produced run has two
results with two DISTINCT `student` values. Deletion that removes the
advantage: collapse the two segments into one entry (or drop the
`assignUnclaimedLabel` disambiguation) and the assertion that
`run.results[0].student !== run.results[1].student` goes red. This is a pure,
buildable removal test (it reads produced `student` strings, not a render).
Honest limit per `docs/loop/leverage.md:179-183`: the SIGNAL's accuracy
(whether the model found the right two segments) has NO buildable removal test
here, because it needs a live model - recorded as a residual with an owner and
a step (section 6, RES-R-1).

---

## 2. The design decisions (each recommended; forks surfaced for the owner)

### 2.1 THE SIGNAL - how one-vs-many is decided

**Recommendation: ONE video model call that is given the assignment intent and
returns a typed single-or-segments decision.**

- Input sent to the model: the uploaded video (via the Files API, reusing
  `withUploadedGeminiVideo`, `gemini-files.ts:224`) PLUS a fixed-wording prompt
  built from the session `assignmentInstructions` and rubric (already in hand,
  section 0.3). The prompt states the assignment intent and asks: "Does this
  recording contain one student's submission or several? If several, return
  each distinct submission's start time, end time, and a short tentative
  label." (Exact prompt text is the test seat's / implementer's to pin; the
  AC seat owns the user-facing copy.)
- Output parsed into a GUARANTEED-style discriminated type (the model cannot
  widen it):

  ```
  type RecordingSplit =
    | { kind: "single" }
    | { kind: "multiple"; segments: RecordingSegment[] };   // length >= 2
  type RecordingSegment = { startSec: number; endSec: number; label: string };
  ```

  The parse is FAIL-SAFE to `single`: a malformed answer, a `multiple` with
  fewer than 2 valid segments, overlapping/out-of-order/negative ranges that
  cannot be repaired, or any JSON error collapses to `{ kind: "single" }`. The
  bad state ("silently graded as several when the model hiccuped") is made
  unrepresentable, matching the construction `seats.md` prefers over an
  assertion (`class-trends-insight.ts:171-185` precedent).

- **The GRADING-decision collapse must stay distinguishable from a genuine
  single, or the fail-safe is invisible (section 2.6).** So the collapse to
  `{ kind: "single" }` is the GRADE decision, and a SEPARATE boolean carries
  WHY. The classify route's response is `{ split: RecordingSplit; failed?:
  true }`: on a classifier error or timeout the route still returns
  `split = { kind: "single" }` (fail-safe grading - the run proceeds exactly as
  today) BUT sets `failed: true`, so the client can tell an error-fallback
  single from a model-confirmed single. `failed` is NOT a field on
  `RecordingSplit` (the discriminated grade type stays two-armed and the model
  still cannot widen it); it is a transport flag on the route response, read
  only by the W2 client to decide which diagnostic to record (section 2.6). A
  model-confirmed single returns `{ split: { kind: "single" } }` with `failed`
  absent.

- **Forks surfaced, not gated:**
  - *Transcript or duration/scene cues instead of the video model.* REJECTED
    as the primary: there is no ASR/transcript infra in this repo on this path,
    and duration is not known without probing the file. The video model is
    already wired for grading video, so it is the lowest-new-surface signal.
  - *A cheap assignment-intent pre-filter that SKIPS the video call when the
    assignment clearly expects one student.* Recommended NOT built in W1-W3: a
    false "single" on an ambiguous assignment silently defeats the whole
    feature. Recorded as RES-R-4 (a cost optimization the owner can prioritize
    later), not a default.

- **Verifiability (honest):** the build proves the decision TYPE, the parse's
  fail-safe collapse, and that the seam makes exactly one model call and
  deletes its Files upload. It CANNOT prove the model's answer is correct
  (section 0.5). That is RES-R-1, OWNER-walk.

### 2.2 THE SEGMENTATION - how a multi-recording becomes N per-student submissions

**Recommendation: N separate grade calls over the SAME stored video, each
confined to its segment's time window by a TEXT instruction; each call produces
one DISTINCT student entry.**

- On confirm (section 2.3), the driver builds N entries from the one videoRef.
  Each entry carries the same `videoRef` (`{storagePath, sizeBytes}`
  unchanged) and its own time window. Each is dispatched as its own
  `sourceIndex` to `/api/grade-run-item`, exactly like N separate uploads
  today, so N DISTINCT rows arrive.
- **The time window must REACH the model call. This is the binding decision.**
  The requirement "grade only MM:SS-MM:SS" binds to `scoreAxis`'s text part
  (`engine.ts:104-113`). The window must travel: entry/segment -> grade-run-item
  body -> `gradeEntries` -> `gradeStudentEntries` -> `scoreAxis`. The reachable
  binding is a new OPTIONAL field on `GradingRunOptions`
  (`engine.ts:290-319`), e.g. `videoGradeWindowSec?: { startSec: number;
  endSec: number }`, rendered as a fixed-wording note appended to the prompt
  (the same shape as `imageNote` / `codeNote`, `engine.ts:87-101`). **The last
  hop is NOT automatic: `scoreAxis` does NOT receive `GradingRunOptions`** - it
  takes POSITIONAL args, the last of which is `commentSplit = false`
  (`engine.ts:68-84`, the `commentSplit` param at `:83`). `gradeStudentEntries`
  destructures `GradingRunOptions` and hands `commentSplit` to `scoreAxis`
  POSITIONALLY through the intermediate grade-one wrapper (`engine.ts:210-212`,
  where `commentSplit` is both the wrapper's last positional param at `:210` and
  the last positional arg in the `scoreAxis` call at `:212`). So
  `videoGradeWindowSec` must be threaded to `scoreAxis` as a NEW POSITIONAL arg
  EXACTLY as `commentSplit` is: destructured off `GradingRunOptions`, passed
  down the wrapper, and received by `scoreAxis` as a new trailing positional
  param - not read from an options object `scoreAxis` never sees. The route
  reads the window off the request body and passes it through the options it
  already threads (`grade-run-item/route.ts:291,303`). Default unset keeps every
  existing caller byte-identical.
- **Why NOT put the window on `videoRef`:** `isVideoRef` enforces EXACTLY two
  keys `{storagePath, sizeBytes}` (`grade-run-item/route.ts:94-102`,
  `keys.length !== 2` at `:97`), pinned by `route.videoref.test.ts`. Adding
  `startSec/endSec` to `videoRef` breaks that validator and its tests. The
  window is a GRADING INSTRUCTION, not part of the stored-object reference, so
  it rides in options, not in the ref. (SHAPE: the requirement binds to the
  object that can satisfy it - the grade call - not to the storage handle.)
- **Why NOT a native per-part `videoMetadata`:** `LlmPart` has no such field
  (`llm.ts:42`). Widening `LlmPart` to carry a native start/end offset is an
  UNVERIFIABLE wire change here (no live model), so it is recorded as
  RES-R-2, an owner-walk alternative, not the W1-W3 path.
- **Distinctness (the gradebook-write hazard):** each of the N entries gets its
  session-unique display through the EXISTING loop
  (`useContinuousGradingRun.ts:546-549`); the confirm UI's edited labels are
  the `baseStudent`. The required invariant: a confirmed split of N>=2 segments
  produces N results with N pairwise-distinct `student` values, never fewer.
  This is the removal test (section 1) and a W3 unit test.

### 2.3 THE UX FORK - auto-split vs detect-then-confirm

**Recommendation: DETECT-then-CONFIRM.** When the signal says `multiple`, show
the instructor "This looks like N submissions: [segment list with
times + tentative labels]. Confirm, adjust, or grade as one," and dispatch only
on confirm. Rationale (per the brief and `docs/loop/minimize-clicks`): a wrong
auto-split mis-grades a real student and silently blending two students is the
exact hazard `collisionRefusal.ts` / N15 exist to prevent; a confirm is one
click and lets the instructor fix a wrong boundary or label before any grade is
spent. A wrong auto-split costs a real re-grade and a damaged gradebook row; a
confirm costs one click.

**The other reading, for the owner:** AUTO-split-and-grade (no confirm) is
fewer clicks when the model is reliable. It is recorded as RES-R-3 / an open
fork (section 8): if the owner wants auto after watching the confirm step in
practice, it is a small follow-up (skip the hold, dispatch on detect) - but it
is NOT the default, because its failure is silent and expensive.

### 2.4 ASSIGNMENT-DEPENDENCE - how intent biases the decision

- The assignment text comes from `assignmentInstructionsRef.current` and the
  resolved rubric (section 0.3), already frozen at `beginSession`. It is passed
  INTO the classification prompt so the model weighs it: an assignment whose
  instructions describe one student's own presentation biases toward `single`
  even for a long recording; an assignment describing "all group
  presentations" / "each student presents" biases toward `multiple`.
- The bias lives in the PROMPT (the model weighs intent + recording together in
  one call), not in a separate deterministic gate - because "what the
  assignment expects" is a reading of free text, which this repo cannot compute
  deterministically and must not fake. The fail-safe default (section 2.1) is
  `single`, which is the conservative direction: when intent is absent or
  ambiguous and the model is unsure, the app treats it as one submission and
  grades as today (no silent multi-split).

### 2.5 COST / LENGTH - interaction with the video caps

- A long multi-student recording is MORE likely to hit `VIDEO_MAX_BYTES` (40
  MB, section 0.6). It is refused at `decideVideoTransport`
  (`video-transport.ts:104-112`) BEFORE any classification - there is no
  downscale. So the ceiling on a multi-student recording is the SAME 40 MB as a
  single, and the refusal wording ("over the limit... trim or compress") is
  unchanged. Flag: this bounds how many back-to-back presentations fit in one
  upload; a bigger cap or a downscale path is an owner decision
  (RES-R-5), not this scope.
- The video is uploaded to the Files API once for CLASSIFY and once per SEGMENT
  grade = N+1 uploads of the same bytes. Each upload is bracketed and deleted
  within its own request (`withUploadedGeminiVideo`, `gemini-files.ts:224-272`;
  per-request budget `grade-run-item/route.ts:58-62`), so no single request
  exceeds its budget, but the aggregate re-uploads the same video N+1 times.
  Upload-once-reuse-fileUri would cross the per-request bracket boundary and is
  recorded as a cost residual (RES-R-6), not built here.
- Each segment grade is its own `/api/grade-run-item` call with its own 50 s
  budget, dispatched through the existing bounded pool
  (`INCREMENTAL_CONCURRENCY`, `useContinuousGradingRun.ts:270`). N segments
  consume up to N of the session's 40-entry ceiling, counted by the existing
  `available = maxEntries - dispatchedCountRef.current` clip
  (`useContinuousGradingRun.ts:516`).

### 2.6 DIAGNOSTICS REPRESENTATION (required by DEV_LOOP.md)

A new feature a user reaches must be observable in the Session Diagnostic Log.
The vocabulary extension and the recording are DELIBERATELY split across waves,
because the diagnostic store is BROWSER-ONLY and the classify route is a server
file.

**The store is browser-only, so the ROUTE must not record through it.**
`gradingDiagnosticLog.ts` records through `session-diagnostic-log.ts`, whose
module-scope state would be shared across requests on a server
(`gradingDiagnosticLog.ts:7-10`). `session-diagnostic-log.test.ts:768-797` scans
every file under `src/app/api` and `src/app/actions` (and every `"use server"`
file) and FAILS if the text `.includes()` either `"session-diagnostic-log"` or
`"gradingDiagnosticLog"` (`BROWSER_ONLY_SPECIFIERS`, `:738-744`; the
`.includes` check at `:790`). So `src/app/api/classify-recording/route.ts` must
name NEITHER module - a route that referenced `gradingDiagnosticLog` would ship
that canary RED (and that canary is in the W1 gate). The route therefore records
NOTHING; it only returns `{ split, failed? }` (section 2.1).

**W1 adds the vocabulary as a TYPE/DATA extension, with no runtime caller.**
Add two operations to `GradingDiagnosticOperation`
(`gradingDiagnosticLog.ts:18-37`): `classify_recording_single` and
`classify_recording_multiple`, each with a label row in
`GRADING_DIAGNOSTIC_OPERATION_LABELS` (`:39-59`). The `Readonly<Record<
GradingDiagnosticOperation, string>>` at `:39` makes tsc FORCE both new label
rows the instant the union gains the two members - a missing label is a type
error - so this edit needs no runtime caller and is not an export-without-caller
(the two members and their labels are the whole edit). This is why the enum +
label change rides in W1 even though the thing that RECORDS them lands in W2.

**W2 does the recording, CLIENT-SIDE in the driver.** The classify diagnostic
is recorded in `useContinuousGradingRun.ts` (a browser component, not a server
file, so it may import the store), driven by the route's `{ split, failed? }`
response: a client-side recorder sibling to `recordClassifySettled`
(`gradingDiagnosticLog.ts:172`, the existing client recorder for classify
outcomes) records `classify_recording_single` on a `single` result,
`classify_recording_multiple` on a `multiple` result (with a bare segment
count), and a FAILURE entry when `failed === true`. Recorded with `durationMs`
and a bare segment count only (never a student name or any text), mirroring the
existing `classify_submission_*` operations (`:56-58`) and `videoDiagnostic.ts`'s
counts-only discipline (`:8-12`). The recorder helper lands in W2 alongside its
driver caller (so it is never an export-without-caller). The failure it makes
visible: because `failed:true` is recorded as its own entry while the GRADE
still falls back to `single` (section 2.1), a run that fell back because the
model errored is DISTINGUISHABLE in the log from a model-confirmed single - the
observability the fail-safe collapse would otherwise hide. This is an AC the AC
seat writes and Verify re-judges against the built diff.

---

## 3. The SHAPE: where the surface falls, as explicit layers

The repo has shipped "a library and an endpoint with no surface between them"
(`docs/loop/this-repo.md`-era memory; `verify-reachability-not-just-correctness`).
So each layer below names the layer the USER reaches and how.

### 3.1 Layer W1 - the SIGNAL (library + seam + route). NO user surface.

- **New pure leaf** `src/lib/grade/recording-split.ts`: the `RecordingSplit` /
  `RecordingSegment` types; the pure prompt-builder
  `buildRecordingSplitPrompt(assignmentInstructions, rubric)`; the pure parser
  `parseRecordingSplit(modelText, opts)` with the fail-safe collapse to
  `single` (section 2.1); pure validators (segments >= 2, sorted,
  non-overlapping-or-repairable, distinct labels via `assignUnclaimedLabel`).
  Client-safe (no Next/Supabase/office imports) so it is unit-testable and
  importable from both the route and the driver's diagnostic.
- **New server seam** `src/lib/grade/recording-split-seam.ts`:
  `classifyRecording(deps, ctx, videoRef)` - injected `download` / Files
  client / `removeObjects` (the same injected-deps shape as
  `video-grade-seam.ts:26-31`), uploads the video via `withUploadedGeminiVideo`,
  makes ONE `callLlm` classification call, returns `RecordingSplit`, deletes
  the Files upload in `finally`. Pure of Next/Supabase. Never throws: a failure
  is a typed outcome that the route maps to `{ kind: "single" }` plus a
  diagnostic failure.
- **New route** `src/app/api/classify-recording/route.ts`:
  `requireAppOwner()` before the body is read; JSON content-type CSRF floor;
  parse + validate the `videoRef` the SAME way `grade-run-item` does
  (`isVideoRef` shape + `isVideoUploadPath` ownership,
  `grade-run-item/route.ts:94-102,259-266`); a soft budget under `maxDuration`
  (copy `grade-run-item`'s 50 s / reserve shape, `:58-62`); dark behind a new
  `RECORDING_SPLIT_ENABLED` flag (default `false`) in `constants.ts`, so the
  whole feature ships OFF and the owner flips one constant to turn it on
  (build-dark per AGENTS.md "never stall").
  - **Return contract (a W1 contract W2 consumes - fixed here):**
    `{ split: RecordingSplit; failed?: true }`. On a classifier error or timeout
    the route catches it, returns `split = { kind: "single" }` (fail-safe
    grading) AND sets `failed: true`; a model-confirmed single returns
    `{ split: { kind: "single" } }` with `failed` ABSENT; a confirmed multiple
    returns `{ split: { kind: "multiple"; segments } }` with `failed` absent.
    `failed` is a transport flag the W2 client reads to record the right
    diagnostic (section 2.6); it is NOT a member of `RecordingSplit`.
  - **The route names NO browser-only diagnostic module.** It must not contain
    the substring `"gradingDiagnosticLog"` or `"session-diagnostic-log"` anywhere
    in `route.ts` or its test, or `session-diagnostic-log.test.ts:768-797` ships
    RED (section 2.6). The route RECORDS nothing - all diagnostic recording is
    client-side in W2's driver, driven by this response.

W1 is reachable ONLY by W2. It is deliberately a library+seam+endpoint with no
surface - which is why W2 exists and why W1 must NOT be called "done" on its
own.

### 3.2 Layer W2 - the CONFIRM surface (the layer the user reaches).

- **Driver change** (`useContinuousGradingRun.ts`, `storaged-video` branch at
  `:412-432`): when `RECORDING_SPLIT_ENABLED` and the prepared entry carries a
  videoRef, call classify (injected `classifyRecording?` fn, default the real
  `POST /api/classify-recording`, mirroring how `prepareVideo` is injected at
  `:102,187`). If `single` -> dispatch one entry as today. If `multiple` ->
  store a PENDING SPLIT in a ref and expose it as a new read-only driver field
  `pendingSplit: PendingSplit | null` (the videoRef, the segments, the source
  file name); do NOT push to the queue yet.
- **New UI component** `src/app/components/grading-chat/RecordingSplitConfirm.tsx`:
  rendered by `GradingChatPanel.tsx` when `driver.pendingSplit !== null`,
  inside the sticky composer wrapper region (near the submit-error alert,
  `GradingChatPanel.structure.test.ts:432-447`). Shows "This looks like N
  submissions" with an editable list (label + start/end per segment), a
  "Grade N submissions" primary button -> `driver.confirmRecordingSplit(edited)`,
  and a "Grade as one" button -> `driver.rejectRecordingSplit()`. House
  patterns only (`.adaptRow` / `chatStyles.*`, per the visual seat's rules,
  `seats.md:267-279`); copy carries no emojis; keyboard story owned by the UX
  seat. **This component IS the surface** - the user reaches the entire feature
  through this card; without it W1 is dead code.
- **Reachability pins** (source-text, since nothing renders under vitest): a
  new block in `GradingChatPanel.structure.test.ts` asserting the panel
  imports and renders `<RecordingSplitConfirm>` fed by `driver.pendingSplit`
  with `onConfirm={driver.confirmRecordingSplit}` and
  `onReject={driver.rejectRecordingSplit}`; a `video-w4.wiring.test.ts`-style
  pin that the driver's storaged-video branch routes through classify when the
  flag is on.

### 3.3 Layer W3 - the multi-grade DISPATCH (distinct entries).

- **Driver** (`useContinuousGradingRun.ts`): `confirmRecordingSplit(segments)`
  builds N entries from the one pending videoRef, each with the segment label
  as `baseStudent` and its window, and pushes them through the EXISTING admit +
  `assignUnclaimedLabel` + queue loop (`:528-566`) so distinctness and the
  40-entry clip are reused, not reinvented. `rejectRecordingSplit()` dispatches
  a single whole-video entry (today's path).
- **Engine + route** (`engine.ts`, `grade-run-item/route.ts`): the optional
  `videoGradeWindowSec` on `GradingRunOptions` and its fixed-wording note in
  `scoreAxis` (section 2.2); the route reads a validated `gradeWindowSec` off
  the body and threads it. Default unset = byte-identical to today.
- **Invariant test (removal test):** a confirmed 2-segment split yields a run
  whose `results[0].student !== results[1].student`, and both carry the same
  underlying videoRef storagePath. Pure, no render.

### 3.4 What is NOT in scope (stated, not assumed)

- Path 1 (in-app frame capture) one-vs-many - RES-R-7, section 7.
- Auto-split without confirm - RES-R-3 / fork, section 8.
- Native `videoMetadata` wire windows - RES-R-2.
- A video larger than 40 MB / downscale - RES-R-5.
- Upload-once-reuse-fileUri across classify + N grades - RES-R-6.
- A deterministic assignment-intent pre-filter - RES-R-4.

### 3.5 Reachability trace (control -> code), stated per the trap card

User picks a video in the composer -> `decideVideoTransport` -> upload ->
driver `storaged-video` submit -> `prepareVideo` (one entry) -> [flag on] ->
`classifyRecording` -> `multiple` -> `driver.pendingSplit` set ->
`GradingChatPanel` renders `<RecordingSplitConfirm>` -> user edits + clicks
"Grade N" -> `driver.confirmRecordingSplit` -> N entries through the existing
admit/queue loop -> N `/api/grade-run-item` dispatches, each with its window ->
N distinct rows in `GradingResults`. Every hop is a named edit above; the
hop that is a NEW SURFACE is `<RecordingSplitConfirm>` (W2).

### 3.6 1000-line ceiling management

New logic lives in NEW leaves (`recording-split.ts`, `recording-split-seam.ts`,
`RecordingSplitConfirm.tsx`, `classify-recording/route.ts`). Additions to
existing files are small: `engine.ts` (691) gains one `GradingRunOptions` field
+ one note (est. < 15 lines); the driver (690) gains the classify branch + two
callbacks + one field (est. < 60 lines - the plan/architect must re-measure
with `@(Get-Content).Count` and, if it crosses ~930, extract the split
handling into a `recordingSplitDriver.ts` leaf BEFORE adding). The panel (599)
gains one conditional mount. None is near 1000 today, but the architect pass
owns the per-file post-edit measurement and the extraction call.

---

## 4. The waves (smallest-first) with full canary gates

Each gate runs from PowerShell. Multi-path test runs use
`npm run test:paths <p1> <p2> ...` (never a raw multi-path `vitest`/`npm test`,
which silently drops unmatched args - `docs/loop/this-repo.md` section
"Running a named set of test files"). Every wave ALSO runs, unconditionally:
`npx tsc --noEmit` (exit 0, no output); `npm run lint` (exit 0, no NEW warning
in files this wave writes - never pin the count, `this-repo.md` section 1);
`npx vitest run src/file-size-ceiling.structure.test.ts` (the repo-wide 1000
ceiling); `npx vitest run src/source-bytes.structure.test.ts` and the emoji
scan `npx vitest run src/lib/no-emojis.test.ts` (ASCII/no-BOM); and the
`npm run build` compile-line check (grep for `Compiled successfully`, do NOT
`&&` on exit code - `this-repo.md` section 1). A FULL `npm test` sweep runs
before each wave is called done.

Pass condition format throughout: OBJECT under comparison / INSTRUMENT
producing each quantity / DIRECTION of failure.

### W1 - the signal (library + seam + dark route)

**Write set (new files + the files that CALL the new exports):**
- `src/lib/grade/recording-split.ts` (new; pure leaf)
- `src/lib/grade/recording-split-seam.ts` (new; server seam)
- `src/app/api/classify-recording/route.ts` (new; CALLS the seam - the caller
  of the new seam export ships in the same wave, per `seats.md:160-165`)
- `src/lib/grade/constants.ts` (edit: add `RECORDING_SPLIT_ENABLED = false`)
- `src/app/components/grading/gradingDiagnosticLog.ts` (edit: two new
  `GradingDiagnosticOperation` members + their two label rows) - a TYPE/DATA
  extension only. The `Readonly<Record<GradingDiagnosticOperation, string>>` at
  `:39` forces tsc to require both labels the instant the union gains the two
  members, so this edit needs NO runtime caller and is not an
  export-without-caller. The RECORDING of these operations is W2, client-side in
  the driver (section 2.6); the W1 route does NOT reference this module.
- Tests: `recording-split.test.ts`, `recording-split-seam.test.ts`,
  `classify-recording/route.test.ts`, and a `gradingDiagnosticLog.test.ts` edit
  asserting the two new labels (`:124-127` precedent).

**Gate (the full canary set above) PLUS:**
`npm run test:paths src/lib/grade/recording-split.test.ts
src/lib/grade/recording-split-seam.test.ts
src/app/api/classify-recording/route.test.ts
src/app/components/grading/gradingDiagnosticLog.test.ts
src/lib/session-diagnostic-log.test.ts`
- OBJECT: the parse of a malformed / sub-2-segment / overlapping model answer.
  INSTRUMENT: `parseRecordingSplit` unit tests. DIRECTION: RED if any such
  input yields `kind: "multiple"` (must collapse to `single`).
- OBJECT: the seam's Files lifecycle. INSTRUMENT: fake Files client counting
  upload/delete. DIRECTION: RED if `delete` is not called on both the success
  and the throw path (mirrors `video-grade-seam` cleanup discipline).
- OBJECT: the route's auth/validation order. INSTRUMENT: route test with a
  fake request. DIRECTION: RED if the body is read before `requireAppOwner()`,
  if a foreign-user videoRef is not refused, or if the flag-off path makes any
  Storage/Files call.

`session-diagnostic-log.test.ts` is in this gate as the browser-only-IMPORT-BAN
scan, NOT as an operation enumeration. Its `describe` at `:768-797` lists every
file under `src/app/api` and `src/app/actions` (plus every `"use server"` file)
and FAILS if any contains the substring `"session-diagnostic-log"` or
`"gradingDiagnosticLog"` (`BROWSER_ONLY_SPECIFIERS`, `:738-744`; the `.includes`
check at `:790`). It is here to PROVE the new `src/app/api/classify-recording/
route.ts` names NEITHER module - the route records nothing (section 2.6). The
operation-label freeze is a DIFFERENT instrument: `gradingDiagnosticLog.test.ts`
(the `:124-127` precedent in the write set above), which asserts the two new
label rows; that is where the implementer confirms the label set and bumps it in
the SAME commit.

### W2 - the confirm surface (the layer the user reaches)

**Write set:**
- `src/app/components/grading-chat/useContinuousGradingRun.ts` (edit: classify
  branch in `storaged-video`, `pendingSplit` field, injected `classifyRecording`)
- `src/app/components/grading-chat/videoClient.ts` (edit: the default
  `postClassifyRecording` client, sibling of `postPrepareVideo` `:51-66`)
- `src/app/components/grading-chat/RecordingSplitConfirm.tsx` (new; the surface)
- `src/app/components/grading-chat/GradingChatPanel.tsx` (edit: render the
  surface - CALLER of the new component)
- `src/app/components/grading-chat/grading-chat.module.css` (edit, if new
  classes are needed - house patterns first)
- `src/app/components/grading/gradingDiagnosticLog.ts` (edit: a client-side
  recorder helper for the recording-split operations, sibling of
  `recordClassifySettled` `:172`, consuming the W1 enum members; it lands HERE,
  in W2, alongside its driver caller so it is never an export-without-caller -
  the driver imports and calls it from the classify branch, driven by the
  route's `{ split, failed? }` response, recording `classify_recording_single` /
  `classify_recording_multiple` / a failure entry per section 2.6)
- Tests: new blocks in `GradingChatPanel.structure.test.ts`,
  `useContinuousGradingRun.video.test.ts` (or a new
  `useContinuousGradingRun.split.test.ts`), `videoClient.test.ts`,
  `video-w4.wiring.test.ts`, and a `gradingDiagnosticLog.test.ts` block for the
  new recorder (single / multiple / failure entries, counts-only).

**Gate (full canary set) PLUS:**
`npm run test:paths
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts
src/app/components/grading-chat/useContinuousGradingRun.video.test.ts
src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts
src/app/components/grading-chat/videoClient.test.ts
src/app/components/grading-chat/video-w4.wiring.test.ts
src/app/components/grading-chat/composerHeight.test.ts
src/app/components/grading/gradingDiagnosticLog.test.ts
src/lib/session-diagnostic-log.test.ts`
- OBJECT: the panel's render of the confirm surface. INSTRUMENT:
  `GradingChatPanel.structure.test.ts` source-text pin. DIRECTION: RED if
  `<RecordingSplitConfirm>` is absent, or present but not fed `driver.pendingSplit`
  / `onConfirm` / `onReject` (reachability - the exact "shipped dead" failure).
- OBJECT: the driver's storaged-video branch. INSTRUMENT: lifecycle test with a
  mocked `classifyRecording`. DIRECTION: RED if a `multiple` result dispatches
  immediately instead of holding `pendingSplit`, or if the flag-off path
  classifies at all.
- OBJECT: the client-side classify recorder. INSTRUMENT:
  `gradingDiagnosticLog.test.ts` block for the new recorder. DIRECTION: RED if a
  `single` / `multiple` / `failed` response does not produce the matching
  diagnostic entry, or if any entry carries a student name or free text (counts
  only).
- OBJECT: server files vs the browser-only store. INSTRUMENT:
  `session-diagnostic-log.test.ts:768-797` import-ban scan. DIRECTION: RED if
  W2's recording work put `"gradingDiagnosticLog"` / `"session-diagnostic-log"`
  into any `src/app/api` or `src/app/actions` file (the driver is a browser
  component, so recording there is legal; this gate proves no server file was
  contaminated).
- `grading-chat-storage-keys.structure.test.ts` is MANDATORY in this wave: it
  is an exact-key-set canary over RAW source of every non-test file in the
  directory (`:13-22`, frozen list of 8 keys). The confirm component must NOT
  introduce a new `ta-` key (reuse the input-mode / composer state); if any
  new persisted control is genuinely needed, the frozen list AND this gate
  are bumped in the same commit. Reason this is load-bearing: the pre-push
  gate runs no vitest (`this-repo.md` section "The pre-push gate runs NO
  vitest"), so a drift here reaches main silently otherwise.

### W3 - the multi-grade dispatch (distinct entries)

**Write set:**
- `src/app/components/grading-chat/useContinuousGradingRun.ts` (edit:
  `confirmRecordingSplit` / `rejectRecordingSplit`, N-entry build through the
  existing admit loop)
- `src/lib/grade/engine.ts` (edit: `videoGradeWindowSec?` option + the note in
  `scoreAxis`)
- `src/app/api/grade-run-item/route.ts` (edit: validate `gradeWindowSec` off
  the body, thread into options - CALLER of the new engine option)
- `src/app/components/grading/incrementalRunPlan.ts` (edit IF
  `GradeRunItemRequestBody` must carry the window - the shared body type lives
  here; confirm with the implementer's own grep)
- Tests: new/edited `useContinuousGradingRun` split test (the distinctness
  removal test), an `engine` test for the window note, a `grade-run-item`
  route test for the window validation.

**Gate (full canary set) PLUS:**
`npm run test:paths
src/app/components/grading-chat/useContinuousGradingRun.video.test.ts
src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts
src/app/api/grade-run-item/route.test.ts
src/app/api/grade-run-item/route.videoref.test.ts
src/app/api/grade-run-item/route.videoseam.test.ts
src/lib/grade/engine.test.ts`
(the exact engine test filename is the implementer's to confirm by
`Glob src/lib/grade/*engine*.test.ts`; the gate must name the real file, not
this placeholder).
- OBJECT: the produced run of a confirmed 2-segment split. INSTRUMENT: driver
  test asserting `results[0].student !== results[1].student`. DIRECTION: RED if
  the two segments collapse to one row or share a display (the gradebook-write
  hazard and the leverage removal test).
- OBJECT: `isVideoRef` shape. INSTRUMENT: `route.videoref.test.ts`. DIRECTION:
  RED if the window change widened `videoRef` beyond its two keys (it must
  NOT - the window rides in options, section 2.2).
- OBJECT: every existing non-window caller's wire body. INSTRUMENT: the
  default-wire byte-identical pins already in the suite. DIRECTION: RED if the
  new option changes the body when unset.

### W-final - regression (per DEV_LOOP.md, batched for this group)

One regression pass over the grading-chat video path against
`docs/REGRESSION.md`, its own push. Baseline the current single-video behaviour
into `docs/REGRESSION.md` BEFORE W1 hand-off (the Baseline seat; check with
`grep -a` whether the video path is already covered).

---

## 5. `owns` file list (derived by command; output pasted)

Command (PowerShell, repo root), finding every non-test file that imports the
driver / video client / intake leaf / seam / route, AND every TEST file that
reads any surface file as source text:

```
Get-ChildItem -Recurse -Include *.ts,*.tsx src | Select-String -Pattern
  "useContinuousGradingRun|videoClient|chatSubmissionIntake|video-grade-seam|grade-run-item"
  | Where-Object { $_.Path -notmatch "\.test\." } | ...   # (A) importers
Get-ChildItem -Recurse -Include *.test.ts src | Select-String -Pattern
  "GradingChatPanel.tsx|ChatComposer.tsx|useContinuousGradingRun.ts|videoClient.ts|
   chatSubmissionIntake.ts|gradingDiagnosticLog.ts|video-grade-seam.ts|grade-run-item"
  | ...                                                     # (B) source-text consumers
```

**(A) Non-test importers (a change to an edited file can break these):**
```
src/app/actions/grading-chat-intake.ts
src/app/actions/grading-incremental.ts
src/app/actions/grading-one-upload.ts
src/app/api/grade-run-item/route.ts
src/app/api/grade-submission-zip/route.ts
src/app/components/grading/incrementalRunPlan.ts
src/app/components/grading/useIncrementalGradingRun.ts
src/app/components/grading/useOneUploadRun.ts
src/app/components/grading-chat/ChatComposer.tsx
src/app/components/grading-chat/chatSubmissionIntake.ts
src/app/components/grading-chat/GradingChatPanel.tsx
src/app/components/grading-chat/runStatus.ts
src/app/components/grading-chat/useContinuousGradingRun.ts
src/app/components/grading-chat/videoClient.ts
src/app/page.tsx
src/lib/grade/engine.ts
src/lib/grade/extraction.ts
src/lib/grade/single-file-entry.ts
src/lib/grade/types.ts
src/lib/grade/video-grade-seam.ts
```

**(B) Test files that read a surface/driver file AS SOURCE TEXT (these go RED
if a pinned string moves - they must be in the wave gate even though the wave
does not "edit" them):**
```
src/app/api/grade-run-item/route.test.ts
src/app/api/grade-run-item/route.videoref.test.ts
src/app/api/grade-run-item/route.videoseam.test.ts
src/app/components/grading/oneUploadWiring.wiring.test.ts
src/app/components/grading/useOneUploadRun.lifecycle.test.ts
src/app/components/grading/zipUploadPreflight.wiring.test.ts
src/app/components/grading-chat/chatSeamDiagnostic.wiring.test.ts
src/app/components/grading-chat/chatSnap.test.ts
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-chat/lmsPicker.structure.test.ts
src/app/components/grading-chat/lmsPicker.wiring.test.ts
src/app/components/grading-chat/useContinuousGradingRun.video.test.ts
src/app/components/grading-chat/video-w4.wiring.test.ts
src/app/components/tabs/topLevelTabs.wiring.test.ts
src/lib/grade/video-w2.wiring.test.ts
```

This list is a FLOOR, not the set (`traps-spec.md:30-34`): the implementer of
each wave must re-derive it with the same command against the then-current tree
and report what the list missed, because a NEW pin added by W2/W3 is not in the
command's output run today.

---

## 6. Residual register (owner / instrument / step - each or it is a deletion)

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-R-1 | Segmentation ACCURACY (does the model find the right segments?) cannot be verified here - no live model/network (`this-repo.md` s.6) | Owner | OWNER-walk: upload a known 2-presentation recording, read the confirm card | Verify half records the leverage SIGNAL finding; owner walk after the flag is flipped |
| RES-R-2 | Native per-part `videoMetadata` time window (vs the textual window) is an unverifiable wire change (`llm.ts:42` has no such field) | Owner | n/a in-checkout | Owner decides at the walk whether the textual window confines attention; if not, a `LlmPart` widen is a new scoped item |
| RES-R-3 | AUTO-split (no confirm) as an alternative to detect-then-confirm | Owner | Driver flag | Open fork, section 8 - one-line driver change to dispatch on detect if chosen |
| RES-R-4 | Deterministic assignment-intent pre-filter to SKIP the classify call when the assignment is clearly single | Agent | A pure heuristic over `assignmentInstructions` + its unit test | A later grading-chat wave; NOT built now (false-single risk) |
| RES-R-5 | Multi-student recordings over 40 MB are hard-refused (no downscale); raising the cap is a product decision | Owner | `VIDEO_MAX_BYTES` (`video-limits.ts:14`) | Owner decides a larger cap or a downscale path |
| RES-R-6 | The same video is uploaded to the Files API N+1 times (1 classify + N grades) | Agent | A seam that uploads once and reuses the fileUri across segment grades | A later optimization wave (crosses the per-request bracket) |
| RES-R-7 | In-app frame-capture (path 1) one-vs-many is OUT of scope (frames are discrete screenshots, not a timeline) | Owner | n/a | A separate item if the owner wants it; the mechanism differs from the video path |

Each residual MUST be filed as a row in `docs/BACKLOG.md` by the orchestrator;
a residual that is not in the backlog does not exist (`DEV_LOOP.md` step 0).

---

## 7. What this environment CANNOT verify (stated, not worked around)

- No live model: the one-vs-many DECISION and the segmentation ACCURACY are
  OWNER-walk (RES-R-1). The build proves only the plumbing, the typed decision
  shape, the fail-safe collapse, and row distinctness.
- No network under vitest (`vitest.setup.ts` throws): the classify seam and
  grade path are exercised through fakes only; the Gemini Files wire protocol
  is RECALLED (`gemini-files.ts:7-10`), not observed.
- No rendered component (`this-repo.md` s.6): the confirm surface, its keyboard
  story, and its focus order are READING claims via source-text canaries; no
  test proves what the instructor sees. The UX/accessibility seats' findings
  must say so.
- No `.env`: `requireAppOwner()` and real Storage behaviour on the new route
  are unverifiable locally; the build proves the auth ORDER and the fake-deps
  path only.

---

## 8. Open fork for the owner (ONE terminating question)

The scope above is built on DETECT-then-CONFIRM (section 2.3) as the recommended
reading, and the build can proceed on it now. The single fork whose answer
changes a wave rather than a residual:

**"When the signal says MULTIPLE, should the app CONFIRM with the instructor
before grading (recommended, W2 builds a confirm surface), or AUTO-split and
grade immediately (fewer clicks, but a wrong split silently mis-grades a real
student)?"**

- Recommended: CONFIRM. A wrong auto-split costs a real re-grade and a damaged
  gradebook row keyed on `r.student`; a confirm costs one click
  (`minimize-clicks` does not trade away a confirm on a destructive/irreversible
  action - a posted grade is exactly that).
- Cost of being wrong: if the owner later wants AUTO, it is a one-line driver
  change (RES-R-3) - dispatch on detect instead of holding `pendingSplit`. If
  the owner wants AUTO from the start, W2 collapses to a toast + immediate N
  dispatch and `RecordingSplitConfirm.tsx` is not built.

Every answer terminates the activity: CONFIRM -> build W1/W2/W3 as written;
AUTO -> build W1 + a reduced W2/W3 (no confirm surface). The build does not
wait on this answer - W1 (the signal, dark) is identical under both readings
and is startable now.
