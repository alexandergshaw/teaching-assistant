# Scope: grading chat consolidation (expand + screenshot-snap, then tab removal)

Owner request, 2026-10-11, verbatim: "tool the chat window to allow me to
expand the submission text field vert[ically], and to allow me to snap a
screenshot from that same view and upload that. after this is done, get rid of
submissions, from a recording, and from screenshots sibling tabs within grading
tab".

This is a new scope; no prior version exists, so there is no disposition table
to re-derive. A `loop-checker` reads this before any build wave is dispatched.

## 0. What the owner's three surfaces map to in the tree

Measured by reading the nav source, not inferred:

- The Grading sub-nav is a `gradingView` union with six members, declared at
  `src/app/components/manual/manual-rail.ts:45`
  (`"run" | "repos" | "recording" | "snapshots" | "drafts" | "chat"`) and
  rendered from the "Grading" destination group at `manual-rail.ts:201-210`.
- The owner's three named tabs are destination entries in that group:
  - **"Submissions"** = `grading-run` -> `gradingView === "run"`
    (`manual-rail.ts:203`), the surface `GradingTab.tsx` renders
    (`page.tsx:708-724`).
  - **"From a recording"** = `grading-recording` -> `gradingView ===
    "recording"` (`manual-rail.ts:205`), `GradingRecordingPanel`
    (`page.tsx:792-803`).
  - **"From screenshots"** = `grading-snapshots` -> `gradingView ===
    "snapshots"` (`manual-rail.ts:206`), `SnapshotGradingPanel`
    (`page.tsx:805-816`).
- The "chat window" the owner wants tooled is `grading-chat` -> `gradingView ===
  "chat"` (`manual-rail.ts:208`), `GradingChatPanel` (`page.tsx:827-836`).
- The two tabs the owner did NOT name, and which this scope keeps: "Repo
  Grades" (`grading-repos` -> `RepoGradesTab`, `page.tsx:710-711`) and "Drafted
  Grades" (`grading-drafts` -> `DraftedGradesTab`, `page.tsx:738-740`).

Line counts, measured with `wc -l <file>` from the Bash tool (which
`docs/loop/this-repo.md:9,194` records agrees with the mandated
`@(Get-Content <file>).Count`; re-measure in PowerShell at the wave gate):

```
619  src/app/components/GradingTab.tsx
563  src/app/components/grading-chat/GradingChatPanel.tsx
380  src/app/components/grading-chat/ChatComposer.tsx
151  src/app/components/grading-chat/chatFrameCapture.ts
142  src/app/components/grading-chat/chatSubmissionIntake.ts
 88  src/app/components/grading-chat/chatSeamDiagnostic.ts
906  src/app/components/grading-recording/GradingRecordingPanel.tsx
953  src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
```

No W1-edited file is near the 1000-line ceiling
(`src/file-size-ceiling.structure.test.ts:41`, `LIMIT = 1000`); `ChatComposer.tsx`
at 380 is the growth target and has ~620 lines of headroom.

## 1. Leverage claim (the Criteria seat's one paragraph)

`DEV_LOOP.md` "The loop / Criteria" and `docs/loop/leverage.md` require a
leverage claim on feature work. This chunk has three parts with different
triggers:

- **(B) screenshot-snap earns CAPTURE** (`docs/loop/leverage.md:38`): screen
  pixels are device input a chat window cannot receive at all - a chat has only
  the text channel. The chat already earns CAPTURE through its "Record" mode
  (`ChatComposer.tsx:320-348`, `useChatScreenFrameCapture`,
  `chatFrameCapture.ts:45` using `navigator.mediaDevices.getDisplayMedia`,
  `:123`); the single-snap extends the SAME mechanism. The claim is NOT
  inherited from the platform: no other chat input gets screen pixels for free;
  it is built here via `getDisplayMedia` -> `canvas` -> `frameToImageFile`.
- **(A) vertical expand is click-cost / attention only**, not a categorical
  advantage over a chat (`docs/loop/leverage.md:66`, the explicitly struck
  "click cost" row). Per `leverage.md:112-123` this shape owes one of three
  explicit calls, and the honest call here is **"accept the cost explicitly"**:
  (A) is a UI affordance on an existing field, stated as such, never dressed up
  as integration or persistence it does not have.
- **(C) tab removal makes no leverage claim** - it is a consolidation/removal,
  not a new capability (`seats.md:75-76`: no claim on a refactor). Fired
  trigger recorded.

**Removal test (the one criterion, test-seat-owned).** CAPTURE's advantage is
screen pixels reaching a gradable submission. The buildable half is the pure
byte leaf: `frameToImageFile(base64, index)` (`chatFrameCapture.ts:24`) returns
a `File` of `type: "image/jpeg"` whose `.jpg` name the server classifies by
extension. A removal test asserts that the single-snap path's output is an
`image/jpeg` File produced from a captured frame; it goes RED if the snap stops
routing the captured frame through `frameToImageFile` (e.g. returns the raw
base64, or a non-image File). **Honest limit** (`leverage.md:179-183`,
`this-repo.md:134`): the capture itself - `getDisplayMedia` opening a share and
a frame being drawn - is OWNER-WALK; nothing renders a component or grants
display-capture under vitest. The removal test covers the byte-shaping leaf, not
the live capture. Recorded as residual RES-GCC-LEV (owner, instrument, step in
section 8).

## 2. CRITICAL: capability-coverage table (the load-bearing part)

The repo's hardest-won lesson is a capability LOST when a surface is removed
(`MEMORY.md`, "Verify reachability...": "two items shipped a library and an
endpoint with no surface between them"; `DEV_LOOP.md` "THE SURFACE IS A LAYER").
Before removing any tab, every capability each tab hosts is inventoried and
mapped to where it lives in the chat after this feature, or marked LOST.

What the chat accepts today, read from the driver and intake, not assumed:
`GradingChatPanel`/`ChatComposer` submit **text, file, single-or-multi-file,
storaged-zip, url, and composite** (`ChatComposer.tsx:32` modes
text/file/url/record; `GradingChatPanel.tsx:309-381` handlers;
`chatSubmissionIntake.ts:26-35` `ChatSubmissionInput`). A `url` submission that
resolves to MANY entries (a whole Canvas assignment) IS dispatched - verified at
`useContinuousGradingRun.ts:338-348,416-454`, where a Canvas URL pins one
`canvasUrl` per session and `submit()` loops over every resolved entry (the
comment at `:421-426` confirms "a zip or a whole Canvas assignment resolves to
many"). So Canvas single-assignment batch grading is COVERED by the chat, not
lost.

| Tab (gradingView) | Capability today | Where it lives in the chat after this feature | Lost? |
|---|---|---|---|
| Submissions (`run`) - zip upload grading | `GradingTab.tsx:361-374` zip input; bulk-zip Storage path | chat file/storaged-zip intake (`GradingChatPanel.tsx:319-368`, `useContinuousGradingRun.ts:307-331`) | NO |
| Submissions (`run`) - single-file grading | `GradingTab.tsx:361-374` accepts one file | chat file intake (`ChatComposer.tsx:234-248`) | NO |
| Submissions (`run`) - Canvas single-assignment (paste URL, retrieve, grade all submissions) | `GradingTab.tsx:375-421`, `source === "canvas"` | chat `url` mode -> whole-assignment dispatch (`useContinuousGradingRun.ts:338-348,416`) | NO |
| Submissions (`run`) - **Live Feed** (cross-institution needs-grading QUEUE, per-row Auto Grade, institution counts) | `GradingTab.tsx:326-342` `LiveFeedPanel`; `source === "livefeed"` | **NO chat equivalent.** `LiveFeedPanel` is imported ONLY by `GradingTab.tsx` (measured: `grep -rln "import LiveFeedPanel" src` -> `GradingTab.tsx` only). The chat is a push model with no queue, no `onAutoGrade`, no `totalNeedsGrading`. | **LOST** (BLOCKER-1) |
| Submissions (`run`) - **GitHub repo grading** (org/repo picker, `gradeReposAction`, test dispatch, LMS-assignment pull) | `GradingTab.tsx:324-325` `GithubGradingPanel` (`GithubGradingPanel.tsx:1-40`, `useLmsAssignmentPull`, `LmsAssignmentPullSection`) | chat `url` mode accepts a GitHub URL (`ChatComposer.tsx:356`) = single repo. The kept "Repo Grades" tab (`RepoGradesTab`) grades repo cohorts. The org-picker + LMS-assignment-pull + test-dispatch flow is NOT obviously in either. | **CONFIRM** (BLOCKER-2) |
| From a recording (`recording`) - grade by **narrating over a screen recording** (audio narration + capture + extraction) | `GradingRecordingPanel.tsx:202` + `gradeCapturedSubmissionsAction` | chat "Record" mode captures screen FRAMES as images only (`chatFrameCapture.ts:45-151`); NO audio narration, NO narration-to-grade flow | **LOST** (BLOCKER-3) |
| From screenshots (`snapshots`) - capture/paste/drop screenshots, **role-tag** each (assignment/rubric/post/replies/submission/other), **LIVE-LOOP keyboard layer**, next-student partition, auto-grade | `SnapshotGradingPanel.tsx:202` (`snapshot-shot.ts:27` roles; `useSnapshotKeyboardShortcuts` is a named leverage.md LIVE-LOOP instance, `leverage.md:39`) | chat (B) single-snap + file upload cover snapping/uploading screenshot IMAGES as submissions. Role-tagging, the LIVE-LOOP keyboard layer, and next-student partition are NOT in the chat. | **PARTIAL LOSS** incl. a named LEVERAGE instance (BLOCKER-4) |

### The lost-capability finding, surfaced (do not silently drop)

Taken literally, "get rid of" the three tabs loses four things with no chat
equivalent: **Live Feed** (BLOCKER-1), the **GitHub panel** flow pending
confirmation (BLOCKER-2), **recording-narration grading** (BLOCKER-3), and the
**snapshot role-tagging + LIVE-LOOP keyboard layer** (BLOCKER-4, a documented
leverage instance). `leverage.md:112-123` is explicit that losing a capability
or a leverage class is a PRODUCT CALL "decided by the human who scoped it, never
defaulted by the agent." The brief's instruction (ii) is to STOP and surface
this rather than silently drop it.

**D1 WAS DECIDED = reading (a)** (owner, 2026-10-11, relayed via coordinator):
remove all three tabs, accepting the loss of Live Feed (BLOCKER-1), the GitHub
grading panel (BLOCKER-2), and recording multi-submission extraction
(BLOCKER-3); the snapshot role-tagging + LIVE-LOOP layer (BLOCKER-4) goes with
the `snapshots` tab too. W2 (section 6) is now the reading-(a) build plan; the
original question and analysis are retained below unchanged because the checker
re-walks them and because the Verify step re-rules the capability table against
what actually shipped. The losses are accepted by the owner, NOT silently
dropped.

This was the **terminating question for the owner** (`AGENTS.md`, "Two rounds,
then ask" - shaped so every answer ends the activity). It bounded W2's write
set:

> **D1. The chat covers zip, single-file, and Canvas-assignment grading. It does
> NOT cover Live Feed, the GitHub org-picker/LMS-pull/test-dispatch flow,
> recording-narration grading, or the snapshot role-tagging + LIVE-LOOP keyboard
> layer. Which do you want?**
> - **(a) Remove all three tabs as written, accepting the loss** of Live Feed,
>   the GitHub panel flow, recording-narration grading, and the snapshot
>   role-tagging + LIVE-LOOP layer.
> - **(b) Remove the three tabs, but first rehome the capabilities you want to
>   keep** (most likely Live Feed and/or the GitHub panel) to a surviving entry
>   so nothing is stranded. This adds a wave per rehomed capability.
> - **(c) Remove only "From a recording" and "From screenshots"** (whose core -
>   image/frame submission - the chat covers via file-upload + (B) snap) and
>   **keep "Submissions"**, because it is the sole host of Live Feed and the
>   GitHub panel.

**Recommended reading, acted on where safe (not a default of D1):** ship W1
(section 5) regardless - it is pure addition and loses nothing. For W2, my
recommendation is **(c)**: it honours the owner's clear intent that screenshot
and recording grading belong in the chat (the capabilities the chat genuinely
replaces or improves) while not silently deleting Live Feed and the GitHub flow,
which the chat does not replace. If the owner confirms (a), W2 is larger and
accepts named losses; if (b), W2 gains rehoming waves. **W1 does not depend on
D1 and must not wait on it.**

## 3. (A) Vertical expand of the submission text field

**Target.** The composer's Submission text field, `ChatComposer.tsx:284-300`:
a MUI `TextField multiline maxRows={6}` on `className={chatStyles.composerGrow}`
(`grading-chat.module.css:61-64`, `flex: 1 1 240px`). `maxRows={6}` caps its
auto-grow; there is no user-controlled height today.

**Mechanism (architect's call, one recommendation, fallback named).** MUI 9's
`multiline` renders a `TextareaAutosize` that writes `height` inline from a
hidden shadow textarea, so a bare CSS `resize: vertical` is fought by autosize
and is unreliable (external fact to confirm against the installed version:
`node_modules/@mui/material`; `MEMORY.md` "MUI 9.0.1 facts, verified" is the
starting point). Recommended, autosize-independent mechanism:

1. Keep `multiline` but drop the `maxRows` cap on this field and set an explicit
   resizable wrapper: render the field with a persisted `minHeight` applied to
   the textarea via `slotProps.input.sx`, and a native `resize: vertical` handle
   with `overflow: auto` on the same textarea. The user drags the handle; on
   drag-end the height is captured and persisted.
2. Persist the chosen height under a NEW `ta-` key (the repo's
   persist-UI-control-state rule, `MEMORY.md`): `ta-grading-chat-composer-height`.
   A pure clamp helper (min 72px per the setup-field floor precedent
   `grading-chat.module.css:87-89`; a sane max, e.g. 600px) keeps the stored
   value sane; the helper is a plain `.ts` leaf so it is unit-testable (nothing
   renders).

**Fallback** if the installed MUI makes (1) infeasible: a persisted `minRows`
integer with explicit expand/collapse stepper buttons (same `ta-` key, integer
rows instead of px). Either way the persisted control gets a `ta-` key.

**What is machine-checkable vs owner-walk.** Machine-checkable: the `ta-` key is
present and in the directory canary's frozen set (section 6); the pure
clamp/parse helper's behaviour; the height state is read on mount and written on
resize-end (source-text wiring). **Owner-walk** (`this-repo.md:134`): that the
field actually drags taller and the height survives a reload - no component
renders, so this is a reading claim plus an owner walk.

## 4. (B) Snap a screenshot and upload it

**What already exists.** The composer's "Record" mode
(`ChatComposer.tsx:320-348`) shares the screen via `getDisplayMedia`
(`chatFrameCapture.ts:123`), samples a frame every 3000ms
(`FRAME_SAMPLE_INTERVAL_MS`, `:20`), encodes each as JPEG
(`SNAP_JPEG_QUALITY = 0.92`, `snapshot-shot.ts:46`; width capped at 1920,
`:49,51-53`), turns each into an image File via `frameToImageFile` (`:24`), and
adds them as composite file parts into the tray
(`ChatComposer.tsx:90-92`). So the getDisplayMedia -> canvas -> image-File ->
submission pipeline is ALREADY BUILT. The owner wants a SINGLE snap, not a
multi-frame recording.

**Mechanism.** Add a single-snap path to `chatFrameCapture.ts` that reuses the
existing `grab`/`frameToImageFile` leaf: open a share, wait for the sampling
video to be ready, grab EXACTLY ONE frame immediately, stop the track, and
deliver one image File. Note `start(1)` is NOT sufficient: the first `grab`
only fires after `FRAME_SAMPLE_INTERVAL_MS` (`:141`), so a one-frame recording
takes 3s. The snap must grab immediately. Expose it as a hook method
(e.g. `snapOnce(): Promise<void>` delivering through the same `onFrames`
callback) or a sibling control in the composer that produces one File and routes
it through the EXISTING `onSubmitFiles` (`GradingChatPanel.tsx:338`, direct
submit) OR the composite tray (`addParts`, `ChatComposer.tsx:86`) - reuse,
never a new submission kind (the record mode's own header, `chatFrameCapture.ts:4-5`,
states this principle).

**The blob -> submission wiring is the machine-checkable seam**
(`chatFrameCapture.ts` is client-safe, imports only react and snapshot-shot
constants, `:7-12`; `frameToImageFile` is pure and already tested in
`chatFrameCapture.test.ts`). **The capture UI** (`getDisplayMedia`, drawing a
frame) **is owner-walk** - it does not exist under vitest (`chatFrameCapture.ts:9-10`
says exactly this). Browser-permission note: `getDisplayMedia` prompts for a
share target every snap; a cancelled picker is a `NotAllowedError` and must be
treated as a no-op, not an error (the existing `start` does this at `:124-128` -
mirror it).

## 5. Diagnostics representation (NEW dev-loop rule, owner 2026-10-11)

Owner rule: "any new feature always needs rep in the diagnostics." The grading
diagnostics system is `src/app/components/grading/gradingDiagnosticLog.ts`:
`GradingDiagnosticOperation` (a union, `:17-28`) + `GRADING_DIAGNOSTIC_OPERATION_LABELS`
(`:30-42`) -> `recordGradingDiagnosticEntry` (`:58`) -> the app-wide session log
`recordSessionDiagnosticEntry` (`@/lib/session-diagnostic-log`). The chat seams
already record through it via `chatSeamDiagnostic.ts` (operations
resolve_header / prepare_submission / grade_item / fetch_canvas_meta, `:13`).

**How a feature registers a diagnostic:** add a member to
`GradingDiagnosticOperation` and a label in
`GRADING_DIAGNOSTIC_OPERATION_LABELS`, then call `recordGradingDiagnosticEntry`
(or, for a chat-seam-shaped op, add the operation to
`ChatSeamOperation`, `chatSeamDiagnostic.ts:13`, and record via
`recordChatSeamSettled`, `:73`). **No exact-set canary pins the operation
vocabulary** - measured: `gradingDiagnosticLog.test.ts` reads
`GRADING_DIAGNOSTIC_OPERATION_LABELS.grade_whole_run` (`:69`) but does not freeze
the full set; `chatSeamDiagnostic.test.ts` asserts individual operations, not an
exact set. So adding an operation does not red a frozen-set canary. The build
wave must still DERIVE this with its own grep (not trust this sentence -
`traps-spec.md:30-34`, floor-not-set): search `*.test.ts` under
`src/app/components/grading` and `src/lib/session-diagnostic-log.test.ts` for
any `toEqual`/exact-set assertion over the operation union before adding a
member.

**AC-DIAG.** The screenshot-snap path records one grading diagnostic entry on
success and one on failure. Add a new operation `capture_screenshot`
(label e.g. "Capture screenshot") - the snap is a client capture, not a server
seam, so it is a `GradingDiagnosticOperation` recorded directly (not a
`ChatSeamOperation`, which are server round-trips). On success: outcome
"success", a `durationMs`. On failure (capture error, not a cancelled picker):
outcome "failure" with NO student data (the diagnostic core carries only the
fixed operation label and a scrubbed error, `gradingDiagnosticLog.ts:12-14`;
`chatSeamDiagnostic.ts:7-10` records why: a refusal message can embed student
names, so only fixed class strings are passed on - reuse that discipline). The
vertical-expand (A) is a persisted UI preference with no success/failure seam
and no meaningful operation; it is represented by the snap's diagnostic for this
feature. Record the absence of an (A) diagnostic as an explicit decision
(residual RES-GCC-DIAG-A), not an omission.

## 6. Wave cut and minimal write sets

The owner's "after this is done" is a HARD wave boundary: (A)+(B)+diagnostics
land and work before any tab is removed.

### W1 - expand + screenshot-snap + diagnostics (additive, no dependency on D1)

Write set (every file that holds a new export's CALLER is included -
`seats.md:160-164`):

- `src/app/components/grading-chat/chatFrameCapture.ts` - add the single-snap
  path (`snapOnce`/immediate-grab); reuses `grab`/`frameToImageFile`.
- `src/app/components/grading-chat/ChatComposer.tsx` - the Snap control (its
  caller) + the vertical-expand field change + the `ta-` height key read/write.
  CALLER of the new capture export and of the height helper.
- `src/app/components/grading-chat/grading-chat.module.css` - `.composerGrow`
  resize/overflow rule for (A).
- `src/app/components/grading/gradingDiagnosticLog.ts` - add
  `capture_screenshot` to the operation union + label map.
- `src/app/components/grading-chat/GradingChatPanel.tsx` - ONLY if the snap
  routes through `onSubmitFiles` at the panel level and the panel records the
  `capture_screenshot` diagnostic (its caller). If the diagnostic is recorded
  inside the composer/capture hook, the panel is untouched - the implementer
  decides at build, but whichever file records it is the caller and must be in
  this set.
- A new pure height helper leaf if (A) needs one (e.g.
  `grading-chat/composerHeight.ts`) + its `.test.ts` - a NEW file in the
  grading-chat directory TRIGGERS the directory `ta-` key canary and the
  recording-split count only if it is under those scanners; grading-chat has its
  OWN canary (see tests below), which the frozen `ta-` set must bump for.
- Updated tests: `ChatComposer`/`GradingChatPanel.structure.test.ts`,
  `chatFrameCapture.test.ts`, `chatSeamDiagnostic.test.ts` (only if a seam op is
  added - it is not), `gradingDiagnosticLog.test.ts`, and
  `grading-chat-storage-keys.structure.test.ts` (the `ta-` canary, below).

**The `ta-` key canary MUST bump in the same commit.**
`grading-chat-storage-keys.structure.test.ts:13-20` freezes the exact `ta-` key
set for the grading-chat directory and scans RAW source (comments included,
`:4-6`). Adding `ta-grading-chat-composer-height` requires adding it to
`EXPECTED` (`:13-20`) in the SAME commit, or the "the key set equals the frozen
list" assertion (`:50-52`) goes RED. The companion assertions (`:54-65`) prove
the canary fires on a planted key. This is the `gate-must-include-directory-canary`
lesson (`MEMORY.md`): run this test in the W1 wave gate.

### W2 - tab removal + nav migration (AFTER W1; reading (a) DECIDED)

**D1 is DECIDED = reading (a)** (owner, 2026-10-11, relayed via coordinator):
remove ALL THREE named tabs - Submissions (`run`), From a recording
(`recording`), From screenshots (`snapshots`) - accepting the loss of Live
Feed, the GitHub grading panel, and recording multi-submission extraction. This
is no longer gated. **Kept gradingView set, confirmed against HEAD**
(`manual-rail.ts:45,116-123`): `repos` (Repo Grades, `RepoGradesTab`), `drafts`
(Drafted Grades, `DraftedGradesTab`), `chat` (`GradingChatPanel`) - three
members, down from six.

**W2 shape ruling: NAV-ONLY first, FULL-DELETE deferred as a residual.** The
section-7 `owns` grep shows deleting `GradingRecordingPanel.tsx` /
`SnapshotGradingPanel.tsx` / `GradingTab.tsx` / `LiveFeedPanel.tsx` /
`GithubGradingPanel.tsx` as FILES cascades into ~40 source-text/structure tests
(`grading-recording/*`, `snapshot-grading/*`,
`recording/recording-split.structure.test.ts`,
`componentStorageKeys.structure.test.ts`) plus the frozen-roots/basename
canaries in those directories (`gate-must-include-directory-canary`,
`MEMORY.md`). W2 removes the NAV ENTRIES + MOUNTS + wiring + migration and
flips the nav canaries; it does NOT delete the now-orphaned panel files. The
owner accepted the capability loss, so those files are **dead by design**, but
their deletion is a large, error-prone mechanical sweep better run as its own
cleanup wave (RES-GCC-DELETE, section 9) than bundled into the nav change -
`seats.md:181` "smallest safe revert". The orphaned files stay under the
1000-line ceiling (`GradingRecordingPanel.tsx` 906, `SnapshotGradingPanel.tsx`
953, `GradingTab.tsx` 619 - section 0), so they redden no size gate while they
wait, and `GRADING_TAB_RATCHET = 620` still holds GradingTab at 619 unchanged.

**W2 write set, exact, against HEAD `831cb748` (W1 shipped `ce2c48f3`; it
touched only grading-chat files + `gradingDiagnosticLog.ts`, so every nav line
number below is unchanged from HEAD - verified by `git show --stat ce2c48f3`):**

1. `src/app/components/manual/manual-rail.ts`:
   - `GradingView` union (`:45`): drop `"run"`, `"recording"`, `"snapshots"` ->
     `"repos" | "drafts" | "chat"`.
   - `GRADING_VIEW_PRESENCE` (`:116-123`): drop the `run`/`recording`/`snapshots`
     keys. `GRADING_VIEWS` (`:124`) derives from it, so the exported list shrinks
     to three with no second edit.
   - "Grading" destinations group (`:201-210`): delete the `grading-run`
     (`:203`), `grading-recording` (`:205`), `grading-snapshots` (`:206`)
     entries; keep `grading-repos`, `grading-drafts`, `grading-chat`.
   - `resolveStateFromDestinationId` gradingView ladder (`:440-445`): delete the
     `grading-run`/`grading-recording`/`grading-snapshots` branches (`:440,442,443`);
     keep repos/drafts/chat.
2. `src/app/page.tsx`:
   - Delete the `run`/`repos` TabShell branch's `run` arm: the branch at
     `:708-725` becomes `manualView === "grading" && gradingView === "repos"`
     rendering only `<RepoGradesTab />` - the `(gradingView === "run" || gradingView === "repos")`
     guard and the `GradingTab` else-arm (`:713-722`) go.
   - Delete the `GradingRecordingPanel` mount (`:792-803`) and the
     `SnapshotGradingPanel` mount (`:805-816`), and their imports (`:15,16`).
     Also delete the `GradingTab` import (`:` top-of-file).
   - **Dead whole-run action plumbing (the GradingTab-removal ripple) - COMPLETE
     orphan list.** `GradingTab` is the sole consumer of `state`/`formAction`/
     `pending` (`useActionState(gradeAction, initialState)`, `page.tsx:76`) and
     `testState` (`useActionState(testGeminiAction, initialTestState)`, `:81`).
     With the mount gone, ALL of these go unused and must be removed (tsc/eslint
     catch each in-wave, but the enumeration must be complete): the two
     `useActionState` calls (`:76,:81`); their seed constants `initialState`
     (`:72`) and `initialTestState` (`:73`); and on the line-6 import
     `import { gradeAction, testGeminiAction, type GradeActionState, type TestGeminiState } from "./actions"`
     ALL FOUR symbols (`gradeAction`/`testGeminiAction` are called only by the
     two removed `useActionState`s; `GradeActionState`/`TestGeminiState` type
     only `initialState`/`initialTestState`). **Keep `resultsSectionFallbackRef`**
     (`:126`) - it is ALSO passed to the FilePreviewModal `fallbackFocusRefs`
     (`:927`), so it is not dead. This ripple is the cross-link to the zip
     collision: `useWholeRunDiagnostic` (`GradingTab:170`) dies with the mount -
     see section 6b.
   - **Recording-launch handler cleanup (`:160-182`).** Once
     `resolveRecordingLaunchRoute` loses its `gradingView` field (item 4),
     `page.tsx:175` `if (route.gradingView) setGradingView(route.gradingView)`
     references a property the return type no longer has (TS2339) - delete that
     line. The effect then no longer calls `setGradingView`, so drop it from the
     dependency array (`:182`); `setGradingView` STAYS in the `nav` destructure
     (`:86`) and the `:618` call site, so it is not otherwise dead. Update the
     `:155-159` comment, which describes the now-removed "grading"/"snapgrade"
     routing.
3. **Migration leaf** (`MEMORY.md` migration-leaf pattern; `traps-spec.md:58-64`;
   this is the repoint the W1 check's NIT-3 flagged):
   `src/app/url-state.ts` - `normalizeGradingView` falls back to `"run"`
   (`:218-219`); `DEFAULT_GRADING_VIEW = normalizeGradingView(null)` (`:282`);
   and the param is serialized only when `gradingView !== DEFAULT_GRADING_VIEW`
   (`:541-542`). Since `run`/`recording`/`snapshots` leave `isGradingView`, a
   stored or bookmarked `ta-grading-view` of any of the three
   (`useAppNavigation.ts:67,520`) now normalizes to the fallback. **Repoint the
   fallback from `"run"` to `"chat"`** (`:219`), so a returning user on a removed
   view lands on the live chat, never a dead view. `DEFAULT_GRADING_VIEW` then
   becomes `"chat"` automatically (it derives from the fallback), which also
   makes `?gradingView=chat` the omitted default and `?gradingView=repos`/`drafts`
   the serialized cases - confirm `url-state.test.ts` expectations follow.
   **AND repoint the THREE EXISTING `RETIRED_GRADING_POINTERS` that already
   target `gradingView: "run"`** (`manual-rail.ts:360` `content-view:grading`,
   `:362` `lms-grading`, `:367` `active-tab:grading`) to `"chat"`. Once `"run"`
   leaves the `GradingView` union these three are TS2322 (the
   `GradingPointerTarget.gradingView` field no longer admits `"run"`) - so this
   is not optional polish, it is a compile break. Also ADD raw-id redirects for
   `grading-run`, `grading-recording`, `grading-snapshots` ->
   `{ manualView: "grading", gradingView: "chat" }`, so an old DESTINATION id
   (from a bookmark or a persisted rail destination) redirects rather than
   falling through to `currentGradingView`.
   **AND repoint the SSR/initial default in `useAppNavigation.ts:480-481`**:
   `const [gradingView, setGradingView] = useState<GradingView>(() => { if (typeof window === "undefined") return "run"; ... })` hardcodes `"run"` as the
   SSR return, NOT routed through `normalizeGradingView`, so the fallback repoint
   above does not cover it - it is TS2322 (`"run"` is no longer a `GradingView`).
   Change that SSR literal to `"chat"` (or route it through
   `normalizeGradingView(null)` so the one fallback covers both paths; the latter
   is preferred - one source of truth for the default). `GRADING_VIEW_KEY`
   (`:67`) and the later `normalizeGradingView(localStorage.getItem(...))` reads
   (`:501,520`) already funnel through the normalizer, so they need no separate
   edit once its fallback is `"chat"`.
4. **Recording-launch entry points: REMOVE, not redirect (ORCHESTRATOR RULING,
   recommended by the coordinator).** `src/lib/recording-launch.ts`'s
   `resolveRecordingLaunchRoute` returns `gradingView: "recording"` for launch
   view `"grading"` (`:101-103`) and `gradingView: "snapshots"` for `"snapgrade"`
   (`:104-106`); once those leave the `GradingView` union, `page.tsx:175`
   `setGradingView(route.gradingView)` is TS2345. These launch controls
   ADVERTISE a capability the owner chose to REMOVE (grade-by-recording /
   snapshot grading), so redirecting them to chat would mislabel - the chat does
   NOT do recording multi-submission or snapshot grading. Remove the entry
   points rather than redirect. Exhaustive caller inventory (greps pasted in the
   handback):
   - `src/lib/recording-launch.ts`: drop `"grading"` (`:65`) and `"snapgrade"`
     (`:69`) from the `RecordingLaunchView` union and from `RECORDING_LAUNCH_VIEWS`
     (`:80,:84`); delete the two `resolveRecordingLaunchRoute` branches
     (`:101-106`); delete the `gradingView?: "recording" | "snapshots"` field
     from its return type (`:96`). The now-orphaned `openRubric` field
     (`RecordingLaunch`, `:165`) was only meaningful for `view: "grading"` -
     leave it (an independent optional boolean; no tsc break) or remove it, noted
     for the implementer.
   - `src/app/components/KnowledgeTab.tsx`: remove `startGradingWithSelection`
     (`:459-~490`, the only production dispatcher of `view: "grading"`, `:474-476`)
     and its "Grade via recording" bulk-bar button. KEEP
     `startRecordingWithSelection` (the `view: "discussions"` dispatch at `:422`)
     and the `openRecordingTool` import (still used by it). (No production code
     dispatches `"snapgrade"` - verified by grep; it is a defined-but-unused
     launch view, removed with the union member.)
   - `src/app/components/RecordingTab.tsx:119`: the guard
     `if (detail.view === "grading" || detail.view === "snapgrade" || ...)` -
     drop the `"grading"` and `"snapgrade"` terms (they become TS2367
     no-overlap comparisons once off the union); keep `remembered`/`walkannounce`/
     `announcement`. Update the `:62,:112-118` comments that narrate them.
   - `src/app/page.tsx`: the `:175` / `:182` handler cleanup is already listed
     under item 2.
5. **Canary flips (same commit - `gate-must-include-directory-canary`).** The
   6-view union shrinks to 3; every test that pins the removed members, the
   removed mounts, or the removed launch views MUST change in the SAME commit:
   - `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`
     (`:71-99`): its OWN page.tsx reachability block asserts the
     `SnapshotGradingPanel` import (`:73-75`), the `<SnapshotGradingPanel` render
     (`:79`), and the `manualView === "grading" && gradingView === "snapshots"`
     display gate (`:86-98`). Nav-only mount removal REDS this - **FLIP it to
     assert the panel is no longer mounted** (zero `<SnapshotGradingPanel` render
     sites in `page.tsx`). This is the canary the first W2 draft's section-7
     prose wrongly said changes only under full-delete; it changes under
     NAV-ONLY. (`grading-recording` has no symmetric page.tsx reachability
     structure test - its mount is covered only by `topLevelTabs` I-W2, flipped
     below - so the snapshot structure test is the one extra canary.)
   - `src/lib/recording-launch.test.ts`: remove the `view: "grading"` +
     `openRubric` parse cases (`:24-43`), the `resolveRecordingLaunchRoute` ->
     grading/snapshots route assertions, and the `{ view: "grading" }` dispatch
     case (`:485,:492`). It tests the entry points being removed.
   - `src/app/components/knowledge/knowledgeBulkBar.wiring.test.ts`: remove the
     "Grade via recording" / `startGradingWithSelection` button assertions
     (the `view: "grading"` handoff).
   - CHECKED-SAFE, stays green, do NOT edit (stated so the implementer does not
     touch them): `recording-split.structure.test.ts` asserts grading/snapgrade
     are ABSENT from recView's tab-literal (`:157-158`) and restore guard
     (`:201-202`) - still true after removal; it pins no `RECORDING_LAUNCH_VIEWS`
     count. `walkthrough-announcement.structure.test.ts:68-73` asserts
     `"walkannounce"` is IN the union - still true after removing the other two.
   - `topLevelTabs.wiring.test.ts`: the I-W2 block (`:540-586`) asserts
     `GradingRecordingPanel` and `SnapshotGradingPanel` ARE mounted as display
     toggles - **FLIP to assert ABSENCE** (each panel has zero mount sites in
     `page.tsx` now). The `assertAlwaysMounted` helper's "exactly one render
     site" shape no longer applies to these two; replace their two `it(...)`
     cases with absence assertions (`page.tsx` contains no `<GradingRecordingPanel`
     / `<SnapshotGradingPanel`). The I-chat-mount case (`:593-600`) and the
     WalkthroughAnnouncement case (`:605-612`) STAY (chat and walkthrough are
     kept). The R-1 branch-guard test (`:681-695`) asserts the grading branch is
     scoped to `run`/`repos` - **update to `repos` only** (its regex
     `/gradingView === "run"[\s\S]{0,80}gradingView === "repos"/` must become a
     `repos`-only assertion, since `run` is gone).
   - `manual-rail.test.ts`: two kinds of change. (i) `GRADING_VIEWS`/
     destination-count / exact-member assertions reflect three members and the
     three kept destination ids; `:568` asserts `lms-grading` resolves to
     `gradingView: "run"` - repoint the EXPECTATION to `"chat"`. (ii) THE
     FILE-WIDE `"run"`-AS-ARGUMENT SWEEP, understated in the first draft: this
     file passes the literal `"run"` as `currentGradingView: GradingView` at
     ~30 call sites (checker-cited `:50,:55,...,:420,:500,:566,:572,:613,...`) -
     each is TS2345 once `"run"` leaves the union. Every one must change to a
     KEPT view (`"chat"` is the safe default; `"repos"`/`"drafts"` where the test
     semantics need a specific kept view) in the SAME commit. The implementer
     greps `"run"` across this file and reclassifies each occurrence; this is a
     mechanical but mandatory part of the wave, not optional cleanup.
   - `useAppNavigation.test.ts`: `:304` asserts
     `resolveGradingPointer("content","grading")` yields gradingView `"run"` ->
     repoint to `"chat"`; `:363-380` the `"run"` SSR-default text -> `"chat"`.
   - `url-state.test.ts` (`:40,:801`), `url-state.ppt-design.test.ts` (`:17`),
     `url-state.announcements.test.ts` (`:19`), `tab-rails.test.ts` (`:245`):
     each passes the literal `"run"` as a `GradingView` fixture argument - change
     to a kept view (`"chat"`) in the same commit. Plus any gradingView
     default/serialization expectation (the default is now `chat`, not `run`).
   - `tab-sections.test.ts`, `url-state.automate-collapse.test.ts`: update any
     gradingView default/member expectation if present.
   - REPOINT TARGET for every cascade expectation above = `"chat"` (the new
     default), so each test has a defined value to assert, not a guess. The build
     wave re-derives this whole set with the section-7 grep + a `"run"`/`"recording"`/
     `"snapshots"` literal sweep rather than trusting this enumeration
     (`traps-spec.md:30-34`, floor-not-set); if the sweep surfaces a reference
     not listed here, that is the signal the migration is underspecified and the
     orchestrator takes the narrow terminating question to the owner (ship with
     the completed set, or split the nav-change from the migration repoint).
6. **Unconditional gates:** `src/file-size-ceiling.structure.test.ts`
   (`this-repo.md:42-49`; confirm `GRADING_TAB_RATCHET` still holds - W2 does not
   edit `GradingTab.tsx`, so 619 <= 620 stands), `src/source-bytes.structure.test.ts`,
   `src/lib/no-emojis.test.ts`, run via `npm run test:paths <p1> <p2> ...`.

**W2 does NOT touch the grading engine/lib** (`src/lib/grade/*`): it is nav +
page wiring + nav tests only. This matters for the zip feature's sequencing
(section 6b): the zip classifier leaf + `GradingRun.submissionClassification`
carrier are in `src/lib/grade/*`, disjoint from W2's write set, so the classifier
could land before, during, or after W2 without a write collision.

## 6b. The zip-feature collision and its re-home (for `docs/zip-class-vs-single-scope.md` to re-baseline)

A separate, SHIP-confirmed scope - `docs/zip-class-vs-single-scope.md`
("detect whether a submission zip is a whole-class bundle or a single person")
- targets `GradingTab` as the HOST for both its visible badge and its
diagnostic. Reading (a) removes `GradingTab` from the nav, so those two hosts
die. This section states the re-homed hosts so that scope can be re-baselined
AFTER W2 ships. **It does not re-design the classifier** (SHIP-confirmed); it
moves the surface.

What that scope pins on GradingTab (read from `zip-class-vs-single-scope.md`):
- Badge mounted in `GradingTab.tsx:558-560`, beside `RubricProvenance`, under
  `source !== "livefeed" && phase === "idle" && run && run.results.length > 0`
  (that scope's section 3).
- `GradingNotesCard` extracted from `GradingTab:542-551` and
  `GRADING_TAB_RATCHET` (620) re-pinned, purely to make ceiling room for the
  badge in GradingTab (its section 3 ceiling plan).
- Diagnostic recorded via `useWholeRunDiagnostic.ts:19-28`, which
  `GradingTab.tsx:170` is the ONLY caller of (its section 4).

Each of those is invalidated by W2. The re-home, part by part:

- **(a) Classifier leaf + carrier SURVIVE - keep, unchanged.** The pure
  `src/lib/grade/classify-submission-zip.ts`, the `SubmissionZipClassification`
  type in `src/lib/grade/types.ts`, and the `GradingRun.submissionClassification?`
  field are nav-independent and are NOT touched by W2 (W2 edits no
  `src/lib/grade/*`). Keep them as that scope specifies.
- **(b) BADGE re-homes to the CHAT result surface, NOT GradingTab.** A completed
  chat run renders in `GradingChatPanel.tsx` inside the `chatStyles.stream`
  block (the `hasRows && driver.run` branch, ~`:515-535` at HEAD - W1 did not
  touch `GradingChatPanel.tsx`), where `RubricProvenance run={driver.run}` and
  `GeneratedRubricCard` already mount beside `<GradingResults run={driver.run}>`.
  Mount `SubmissionClassificationBadge` THERE, reading
  `driver.run.submissionClassification`. The `GradingNotesCard` extraction and
  the `GRADING_TAB_RATCHET` re-pin become **MOOT** - GradingTab gains nothing and
  is not edited, so its ratchet stays at 620 untouched. `GradingChatPanel.tsx`
  is 563 lines (`wc -l`), far under the ceiling, so a badge mount there needs no
  extraction.
- **(b-carrier) THE LOAD-BEARING RE-BASELINE FACT: the classification does NOT
  reach `driver.run` for free.** The chat does not build its run through
  `gradeSubmissions`/`ingestZipEntries` (where that scope computes and attaches
  the classification). The chat builds `driver.run` via `buildIncrementalRun`
  (`useContinuousGradingRun.ts:190-204`), whose inputs are
  `{header, speedGraderUrl, totalTicketCount, arrived, phase, tier2}` - NO
  classification field. And the chat's zip ingest is the NDJSON streaming path
  `ingestStoragedZip` (`@/lib/grade/ndjson-ingest-parser`,
  `useContinuousGradingRun.ts:42,314`), a DIFFERENT path from `ingestZipEntries`.
  So re-baselining the badge onto the chat requires the zip scope to (i) compute
  the classification on the chat's own zip-ingest path (the NDJSON ingest or
  `prepareChatSubmissionAction`) and (ii) carry it onto `buildIncrementalRun`'s
  output (add a classification input to that builder, or expose it as a separate
  `driver` field). This is exactly the chat-path gap that scope already named as
  residual **RES-ZIP-CLASS-DIAG** - reading (a) promotes it from a deferred
  residual to the PRIMARY carrier path, because the whole-run path it was built
  for is being removed. **Semantic note for that re-baseline:** in the chat a zip
  is ONE submission among a stream, so "class vs single" is a per-zip-submission
  fact, not a per-run fact; the badge belongs to the submission event, not the
  whole session. That scope owns resolving this; W2 only names it.
- **(c) DIAGNOSTIC re-homes to the CHAT settle seam, NOT `useWholeRunDiagnostic`.**
  `useWholeRunDiagnostic` fires only for GradingTab's whole-run grade, which W2
  removes, so that scope's `decideClassifyDiagnostic` + `recordClassifySettled`
  threaded through `useWholeRunDiagnostic.ts` grades no user-reachable run after
  W2. Re-home the diagnostic to the chat's existing diagnostic seam,
  `src/app/components/grading-chat/chatSeamDiagnostic.ts` (`recordChatSeamSettled`,
  `:73`), recorded at the seam where the chat ingests a zip submission
  (`prepare_submission`, `useContinuousGradingRun.ts:383-398`) or at a new
  chat-run-complete seam. The pure `decideClassifyDiagnostic` leaf and the
  `classificationStudentCount?: number` core field SURVIVE unchanged (both are
  host-independent); only the EFFECT that calls the leaf moves from
  `useWholeRunDiagnostic.ts` to the chat path. NOTE: the chat already records
  through the grading diagnostic surface (`chatSeamDiagnostic.ts:11` imports
  `recordGradingDiagnosticEntry`), so the surface and its coverage row are
  already correct - no coverage-honesty change.
- **(d) GradingNotesCard extraction + ratchet re-pin: MOOT.** Under W2's
  nav-only shape GradingTab is unmounted but still on disk unchanged, so its
  ratchet (620) holds with no edit; that scope should DROP its section-3 ceiling
  plan (the extraction and the re-pin) entirely, because it no longer adds
  anything to GradingTab. If/when RES-GCC-DELETE removes `GradingTab.tsx`, the
  ratchet entry for it is removed with the file.

**Sequencing (confirmed).** W2 builds FIRST - it defines the post-removal
surface (which views exist, where a completed chat run renders, which diagnostic
seam is live). The zip feature then re-baselines and builds against the post-W2
chat host (badge in `GradingChatPanel`'s stream block; diagnostic on the chat
seam). The zip CLASSIFIER + CARRIER (`src/lib/grade/*`) are disjoint from W2's
write set (W2 touches no `src/lib/grade/*`), so that pure lib work could land
before, during, or after W2 with no collision; only the two hosts (badge,
diagnostic) must wait for the post-W2 surface. This ordering is a one-way type/
surface dependency, not a write collision.

## 7. `owns` file list (derived, output pasted)

Derived with (Bash tool): `grep -rln --include="*.test.ts" <literal filenames
and symbols of each wave's edited files> src/app`. These are files that read the
edited files AS SOURCE TEXT and will go red on a correct change if not updated
(`traps-search.md`, `this-repo.md:139-146` source-text tests).

**W1 owns (source-text readers of the W1-edited files):**
```
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-chat/chatFrameCapture.test.ts
src/app/components/grading-chat/chatSeamDiagnostic.test.ts
src/app/components/grading-chat/chatSeamDiagnostic.wiring.test.ts
src/app/components/grading/gradingDiagnosticLog.test.ts
```
plus the edited source files themselves (section 6 W1) and
`grading-chat/grading-chat-storage-keys.structure.test.ts` (the `ta-` canary,
which the grep for `grading-chat-storage-keys` did not surface because it scans
the directory rather than naming a file, but which the new `ta-` key reddens -
this is exactly the "orchestrator's enumeration is a FLOOR" case,
`traps-spec.md:30-34`: the build wave must re-derive the set, not trust this
list). Also include UNCONDITIONALLY `src/file-size-ceiling.structure.test.ts`
(`this-repo.md:42-49`).

**W2 owns (source-text readers that reference the removed panels / nav files):**
```
src/app/actions/grading-submission-grade.test.ts
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/canvas-tab/announcements-panel.wiring.test.ts
src/app/components/componentStorageKeys.structure.test.ts
src/app/components/contentTab.wiring.test.ts
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts
src/app/components/grading-recording/GradingCaptureSettings.wiring.test.ts
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/grading-recording/grading-recording-log.test.ts
src/app/components/grading-recording/grading-rows.test.ts
src/app/components/grading-recording/markLate.wiring.test.ts
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
src/app/components/grading-results/rubricProvenanceLeaf.test.ts
src/app/components/grading/gradingDiagnosticWiring.wiring.test.ts
src/app/components/grading/gradingPictureWiring.wiring.test.ts
src/app/components/grading/replySectionMarker.wiring.test.ts
src/app/components/grading/zipUploadPreflight.wiring.test.ts
src/app/components/home/useAppNavigation.test.ts
src/app/components/manual/manual-rail.test.ts
src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts
src/app/components/module-deck-capture/module-deck-dispatch.test.ts
src/app/components/recording/AddKnowledgePages.test.ts
src/app/components/recording/discussion-capture.test.ts
src/app/components/recording/discussion-knowledge-context.test.ts
src/app/components/recording/recording-split.structure.test.ts
src/app/components/recording/runLogRow.test.ts
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
src/app/components/snapshot-grading/snapshot-instructions-handoff.wiring.test.ts
src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts
src/app/components/tabs/tab-rails.test.ts
src/app/components/tabs/tab-sections.test.ts
src/app/components/tabs/topLevelTabs.wiring.test.ts
src/app/components/ui/buttonVariant.test.ts
src/app/url-state.announcements.test.ts
src/app/url-state.automate-collapse.test.ts
src/app/url-state.ppt-design.test.ts
src/app/url-state.test.ts
```
Most of these matched on the shared tokens `gradingView`/`grading`/`recording`
rather than on the removed panels specifically. Under the W2-nav-only shape the
tests that MUST change are the nav/tab tests (`manual-rail.test.ts`,
`topLevelTabs.wiring.test.ts`, `tab-rails.test.ts`, `tab-sections.test.ts`,
`useAppNavigation.test.ts`, `url-state*.test.ts`) AND - CORRECTION to this
draft's earlier claim - `snapshot-grading/snapshot-grading.structure.test.ts`,
which carries its OWN page.tsx reachability block (`:71-99`) asserting the
`SnapshotGradingPanel` mount and so REDS under nav-only mount removal (section 6
item 5). The earlier wording "the grading-recording/* and snapshot-grading/*
suites change ONLY under W2-full" was WRONG for that one structure test; the
rest of the grading-recording/* and snapshot-grading/* suites (which read the
panels' INTERNAL logic, not their page.tsx mount) do change only under W2-full
file deletion. **This `owns` grep used `--include=*.test.ts`, so it
STRUCTURALLY MISSED every PRODUCTION reference** to the removed views - those
are enumerated in section 6 items 1-4 (`manual-rail.ts`, `page.tsx`,
`url-state.ts`, `useAppNavigation.ts`, `recording-launch.ts`, `KnowledgeTab.tsx`,
`RecordingTab.tsx`), found by the separate production sweep
`grep -rn --include=*.ts --include=*.tsx '...' src | grep -v '\.test\.'`. The
build wave must re-run BOTH greps (test and production) and classify each hit
owned / adopted / checked-safe (`DEV_LOOP.md` step 3), never trust this list as
the set.

## 8. Instruments: pass conditions (object, instrument, direction)

Every pass condition names the object under comparison, the instrument, and the
direction of failure (`traps-spec.md:26-28`). Vitest renders nothing, so UI feel
is owner-walk; the wiring, keys, migration and canary bumps are machine-checkable.

Multi-path runs use `npm run test:paths <p1> <p2> ...`, never a raw multi-path
`vitest`/`npm test` (`this-repo.md:52-66`, `MEMORY.md` test-paths-wrapper).

**AC-A (vertical expand).**
- Machine: the pure height clamp/parse helper. Object: helper output for inputs
  below the floor, above the max, and non-numeric. Instrument: a new unit test
  on the helper leaf. Direction: RED if an out-of-range stored value is applied
  unclamped or a non-numeric value is not defaulted.
- Machine: persistence wiring. Object: `ChatComposer.tsx` source. Instrument:
  source-text test that the height is read from `localStorage` on mount and
  written on resize-end under `ta-grading-chat-composer-height`. Direction: RED
  if the read or the write is absent.
- Machine: the `ta-` canary. Object: the grading-chat directory `ta-` key set.
  Instrument: `grading-chat-storage-keys.structure.test.ts` with
  `ta-grading-chat-composer-height` added to `EXPECTED`. Direction: RED if the
  key is used but not in `EXPECTED`, or in `EXPECTED` but not used.
- Owner-walk: the field drags taller and the height survives a reload.

**AC-B (screenshot-snap).**
- Machine: `frameToImageFile` output shape (the removal test). Object: the File
  the snap path produces. Instrument: `chatFrameCapture.test.ts`. Direction: RED
  if the produced File is not `type: "image/jpeg"` with a `.jpg` name, or the
  snap path does not route the frame through `frameToImageFile`.
- Machine: the snap File reaches a submission. Object: `ChatComposer.tsx` /
  `GradingChatPanel.tsx` source. Instrument: source-text test that the single
  snap's File is passed to `onSubmitFiles` or `addParts` (the existing intake),
  never a new submission kind. Direction: RED if the snap builds its own
  parallel submit path.
- Machine: cancelled-picker no-op. Object: the snap path's `NotAllowedError`
  branch. Instrument: a unit test on the error-classifying leaf (mirror
  `chatFrameCapture.ts:124-128`). Direction: RED if a cancelled picker sets an
  error instead of a silent no-op.
- Owner-walk: `getDisplayMedia` opens a share and one real frame is captured.

**AC-DIAG (diagnostics rep).**
- Machine: the operation exists. Object: `GradingDiagnosticOperation` +
  `GRADING_DIAGNOSTIC_OPERATION_LABELS`. Instrument: a unit test that
  `capture_screenshot` is in the union and has a label. Direction: RED if the
  member or its label is missing.
- Machine: the snap records on success and failure. Object: the snap path's
  record calls. Instrument: a source-text or injected-recorder test (mirror the
  injected-seam pattern in `useContinuousGradingRun.diagnostic.test.ts:105-183`)
  that one `recordGradingDiagnosticEntry` with `operation: "capture_screenshot"`
  fires on a successful snap and one failure entry fires on a capture error.
  Direction: RED if either is absent.
- Machine: no student data. Object: the recorded `error` value. Instrument: a
  test that a failure records only a fixed/scrubbed string, never raw capture
  text (mirror `chatSeamDiagnostic.ts:29-40`). Direction: RED if raw text is
  recorded.
- Machine: no frozen-set canary broken. Object: the operation vocabulary.
  Instrument: the build wave's own grep for an exact-set assertion
  (`traps-spec.md:30-34`); none found at scope time, but re-derive. Direction:
  RED if an exact-set canary exists and is not bumped.

**AC-C (tab removal + migration), reading (a) - remove run + recording + snapshots.**
- Machine: the union shrinks to three. Object: `GradingView` +
  `GRADING_VIEW_PRESENCE` + `GRADING_VIEWS`. Instrument: `manual-rail.test.ts`.
  Direction: RED if `run`, `recording`, or `snapshots` remain in the union,
  presence record, or derived list; RED if the kept set is not exactly
  `repos`/`drafts`/`chat`.
- Machine: migration of all three removed values. Object:
  `normalizeGradingView("run")`, `("recording")`, `("snapshots")`, and
  `DEFAULT_GRADING_VIEW`. Instrument: `url-state.test.ts`. Direction: RED if any
  of the three returns anything other than `"chat"` (the repointed fallback), or
  if `DEFAULT_GRADING_VIEW` is not `"chat"` - a returning user on any removed
  view must land on a live surface, never a dead one.
- Machine: retired pointers. Object: `RETIRED_GRADING_POINTERS["grading-run"]`,
  `["grading-recording"]`, `["grading-snapshots"]`. Instrument:
  `manual-rail.test.ts`. Direction: RED if a raw removed id does not redirect to
  `{ manualView: "grading", gradingView: "chat" }`.
- Machine: the mounts are gone and the branch guard collapsed. Object: `page.tsx`
  source. Instrument: `topLevelTabs.wiring.test.ts` - the I-W2 guard
  (`:540-586`) FLIPPED to assert `GradingRecordingPanel`/`SnapshotGradingPanel`
  have zero mount sites, and the R-1 branch guard (`:681-695`) updated to
  `repos`-only. Direction: RED if `page.tsx` still contains a
  `<GradingRecordingPanel`/`<SnapshotGradingPanel`/`<GradingTab` mount, or the
  grading branch still admits `run`.
- Machine: no dead action plumbing. Object: `page.tsx` imports/bindings.
  Instrument: `tsc` + `eslint` (no-unused). Direction: RED (unused binding/import)
  if `state`/`formAction`/`pending`/`testState`/`gradeAction`/`testGeminiAction`
  remain after the GradingTab mount is removed; `resultsSectionFallbackRef` must
  STAY (still used by FilePreviewModal, `page.tsx:927`).
- Owner-walk: all three chips are gone from the Grading rail (Repo Grades,
  Drafted Grades, Chat remain); an old `?gradingView=run`/`recording`/`snapshots`
  bookmark lands on chat.

## 9. Residual register (owner, instrument, step)

Each entry names an owner, an instrument, and the measuring step; missing any
of the three it is a deletion (`DEV_LOOP.md`; `iteration-caps.md:36-37`). These
must be filed in `docs/BACKLOG.md` or they do not exist.

- **RES-GCC-LEV** - CAPTURE removal test covers only the byte leaf
  (`frameToImageFile`); the live `getDisplayMedia` capture is owner-walk. Owner:
  test-author at the W1 verify. Instrument: `chatFrameCapture.test.ts` (leaf) +
  an owner-walk note in the verify. Step: W1 Verify records the owner-walk.
- **RES-GCC-DIAG-A** - the vertical-expand (A) has no diagnostic operation of its
  own (it is a persisted preference, not a success/failure seam); the feature's
  diagnostics rep is carried by `capture_screenshot`. Owner: the orchestrator's
  disposal of the new dev-loop rule for non-operation UI changes. Instrument:
  this scope's AC-DIAG. Step: surface to the owner whether a UI-preference change
  must also carry a diagnostic, since it has no natural operation.
- **RES-GCC-D1 - RESOLVED (a).** BLOCKER-1..4 (Live Feed, GitHub panel flow,
  recording-narration grading, snapshot role-tagging + LIVE-LOOP keyboard layer)
  are accepted LOSSES per the owner's reading (a). Owner: decided by the human.
  Instrument: the capability-coverage table (section 2) re-checked against the
  built W2 diff at Verify. Step: W2 Verify re-rules the table against what
  shipped and records the four accepted losses as DELIVERED losses, not defects.
- **RES-GCC-GH** - the GitHub panel (`GithubGradingPanel`: org-picker +
  LMS-assignment-pull + test-dispatch) is an ACCEPTED loss under (a). If the
  owner later wants it back, it is a rehome, not a bug. Owner: the owner, if a
  future ask. Instrument: a reachability trace from each control to its action.
  Step: none required by this scope; recorded so the loss is not mistaken for a
  regression.
- **RES-GCC-DELETE** - the now-orphaned panel files (`GradingTab.tsx`,
  `GradingRecordingPanel.tsx`, `SnapshotGradingPanel.tsx`, `LiveFeedPanel.tsx`,
  `GithubGradingPanel.tsx`, and their support files/test suites) are dead by
  design after W2's nav-only removal; W2 leaves them on disk to avoid the ~40-test
  deletion cascade. Owner: a follow-up cleanup wave. Instrument: the section-7
  `owns` grep re-run + the directory frozen-roots/basename canaries
  (`recording-split.structure.test.ts`, `snapshot-grading.structure.test.ts`,
  `componentStorageKeys.structure.test.ts`) bumped in the same commit as the
  deletions (`gate-must-include-directory-canary`). Step: a dedicated FULL-DELETE
  wave removes each file and its readers together; MUST be filed in
  `docs/BACKLOG.md`.
- **RES-GCC-ZIP-REHOME** - `docs/zip-class-vs-single-scope.md` must re-baseline
  its badge host and diagnostic host onto the post-W2 chat surface (section 6b):
  badge in `GradingChatPanel`'s `chatStyles.stream` block reading
  `driver.run.submissionClassification`; diagnostic on the chat seam
  (`chatSeamDiagnostic.ts`), NOT `useWholeRunDiagnostic` (which W2 makes dead);
  and the classification must be carried onto the chat's `buildIncrementalRun`
  output + computed on the chat's NDJSON zip-ingest path (promoting that scope's
  own RES-ZIP-CLASS-DIAG to its primary carrier path). The
  `GradingNotesCard`-extraction + `GRADING_TAB_RATCHET`-re-pin in that scope
  become MOOT. Owner: the author re-baselining `zip-class-vs-single-scope.md`.
  Instrument: the chat run-render block + `chatSeamDiagnostic` seam. Step: that
  scope's re-baseline wave, sequenced AFTER W2 ships; the pure classifier +
  carrier (`src/lib/grade/*`) may land independently (disjoint from W2).
- **RES-GCC-MUI** - confirm whether the installed MUI's `multiline`
  `TextareaAutosize` permits CSS `resize: vertical`, which decides (A)'s
  mechanism vs the `minRows`-stepper fallback (section 3). Owner:
  external-facts research at W1 build. Instrument: read
  `node_modules/@mui/material` + an owner walk. Step: W1 build confirms before
  coding (A).

## 10. House rules checklist

- No emojis / non-ASCII anywhere (`src/lib/no-emojis.test.ts`); this file is
  ASCII-only.
- 1000-line ceiling: no W1-edited file is near it (section 0); `ChatComposer.tsx`
  at 380 has headroom. W2-full deletions only shrink.
- persist-UI-control-state: (A)'s height persists under a new `ta-` key, bumped
  in the directory canary (section 6).
- Fixtures match emitted shape: the snap's File fixture must be an
  `image/jpeg` `.jpg` File (`frameToImageFile`'s real output,
  `chatFrameCapture.ts:24-29`), never a bare base64 string.
- Multi-path test runs use `npm run test:paths`; include
  `src/file-size-ceiling.structure.test.ts` and the grading-chat `ta-` canary in
  every wave gate.
