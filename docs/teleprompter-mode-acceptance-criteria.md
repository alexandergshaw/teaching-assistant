# Teleprompter mode in the script preview modal (chunk 3f)

The instructor's request, in their own words: as part of the modal that holds
the script, let me enter teleprompter mode which gives me a preview of what the
camera sees, allows me to control the mic and camera inputs and outputs, allows
me to blur the background, gives me feedback on talking speed and verbal
filler, gives a timer of elapsed time, etc.

This is a REHEARSAL AND DELIVERY surface, not a recorder. It captures nothing,
saves no file, and produces no take. The Recording tab already owns recording,
and this chunk does not duplicate or replace it.

## Reuse survey (vetted - every symbol read before this doc was written)

**The headline: four of the six requested capabilities already exist and work.
Background blur in particular is fully built, on a dependency already shipped.**

| Capability | Verdict | What already exists |
| --- | --- | --- |
| Background blur | **REUSE** | `useBackgroundEffect({source})` -> `{bgMode, setBgMode, bgStatus, applyBackgroundEffect(video, w, h)}` - MediaPipe `ImageSegmenter`, GPU delegate, `ctx.filter = "blur(16px)"` composited under a `source-in` person cutout, and it returns the RAW video on any failure rather than breaking. `@mediapipe/tasks-vision` is already a dependency. `src/app/components/recording/useBackgroundEffect.ts:16`, blur at `:103-105`, graceful fallback `:67`, `:112-114` |
| Camera preview | **REUSE (extract)** | `useRecorder`'s `startPreview` (`useRecorder.ts:208-296`) and `stopEverything` (`:171-206`), including the exact teardown ORDER that matters (stop tracks, null the ref, null `srcObject`, cancel the level-meter rAF, close the `AudioContext`) |
| Camera + mic device pickers | **REUSE** | `useDevices` (`useDevices.ts:28-33`, `enumerateDevices` + a permission probe + a `devicechange` listener) and the two selects in `SourceDevicesPanel.tsx:101-138`, including "System default" and "No microphone (mute)" |
| Elapsed timer | **REUSE** | `fmt(s)` (`recording/types.ts:27`) - the one recording symbol with real unit tests - and the 1s interval shape at `useRecorder.ts:320-345` |
| Realtime transcript (the INPUT for speed/filler) | **REUSE** | `useLiveTranscription(options)` (`live-class/useLiveTranscription.ts:144`). Web Speech path is genuinely streaming (`continuous`, `interimResults`, flushed every `INTERIM_FLUSH_MS = 300`), and every utterance already carries `atMs` - a timestamp plus text is all a words-per-minute meter needs. `mergeInterim` (`live-class/questions.ts`) folds revised interim results so nothing double-counts |
| Speaking pace target | **REUSE** | `LECTURE_SCRIPT_WORDS_PER_MINUTE` (140) - `src/lib/lecture-script-bounds.ts`. The script was WRITTEN to a 140 wpm target, so the teleprompter must measure against that same constant, not a second opinion |
| Speaker / audio-output selection | **BUILD** | No `audiooutput` enumeration and no `setSinkId` call exists anywhere in the repo |
| Auto-scroll | **BUILD** | The current teleprompter does not scroll. `StagePanel.tsx:85-102` is a `maxHeight: 180, overflowY: "auto"` div - manual wheel scrolling, no speed control, no rAF, no highlight |
| Words-per-minute meter | **BUILD** | No WPM/pace measurement exists (only a static `words / 140` estimate at `LectureScriptPanel.tsx:88`) |
| Filler-word detection | **BUILD** | Zero prior art |

**The existing teleprompter is 17 inline lines, not a component.** `StagePanel.tsx:85-102`,
gated on `prompterOn && script`, with `prompterSize` applied as a hardcoded
ternary at `:95`. It depends on no ref, no stream and no annotation state, so
lifting it into a real component is a pure move.

**Deliberately NOT reused:**

- `useRecorder` wholesale. It takes 17 parameters including title-card refs,
  the takes list and the canvas pipeline, and its elapsed timer only runs while
  `recState === "recording"`. A teleprompter needs preview and teardown, not
  recording, so the camera half is extracted rather than the hook mounted.
- `MediaRecorder`, `useTakes`, `useAnnotations`, title cards, PiP. Out of
  scope - this chunk records nothing.

## Findings that shape the design

1. **BLUR IS NOT CURRENTLY VISIBLE IN A PREVIEW, ONLY IN THE RECORDING.** The
   `<video>` element shows the raw `srcObject`; the blurred output lives on an
   OFFSCREEN canvas (`useCanvasPipeline.ts:71`) that is only consumed via
   `canvas.captureStream(30)` when recording starts (`useRecorder.ts:415-424`),
   and `startPipeline()` is only ever invoked from the record path. "Show me
   what the camera sees, blurred" therefore requires mounting that canvas into
   the DOM and running the pipeline outside recording. This is the single
   biggest structural difference between what exists and what was asked for.

2. **FILLER DETECTION NEEDS VERBATIM TEXT, WHICH ONLY ONE TRANSCRIPTION PATH
   GIVES.** `useLiveTranscription` has two: Web Speech (streaming, Chrome/Edge,
   emits disfluencies) and a segmented batch fallback that posts audio to
   `transcribeLiveAudioAction`. The server prompt there is written for clean
   text and will strip "um"/"uh", and the batch path lags ~15 seconds
   (`SEGMENT_CADENCE_SECONDS = 15`). Live filler feedback is realistically
   Web-Speech-only, and must SAY SO rather than silently reporting zero fillers
   in a browser that cannot detect them.

3. **MEDIA DEVICES REQUIRE A SECURE CONTEXT.** Blocked on a plain-HTTP LAN IP;
   HTTPS or `http://localhost` only. `useDevices.ts:25,58,62` already carries
   three distinct user-facing error strings for this, and REGRESSION.md entry
   311 records it. Also: before permission is granted, `enumerateDevices`
   returns entries with empty `deviceId`s, which must be filtered and
   re-enumerated after the first successful `getUserMedia`.

4. **THE MODAL IS ALREADY IN A STACKING FIGHT IT WON ONCE.** `GeneratedPreviewModal`
   renders at `ModulesView`'s ROOT, not inside the sticky header, because that
   header is a stacking context and a `position: fixed` containing block that
   traps a modal rendered inside it (entry 272,
   docs/lms-preview-modal-stacking-acceptance-criteria.md). A full-screen
   teleprompter overlay is subject to the identical trap.

5. **THE RECORDING DIRECTORY HAS A LINE-COUNT RATCHET.**
   `recording-split.structure.test.ts` asserts every `recording/*.ts(x)` file
   stays under 1000 lines. `useRecorder.ts` is already 601. Extracting a camera
   hook out of it moves the count in the right direction; growing it does not.

6. **NONE OF THE BROWSER CODE IS TESTED, AND STRUCTURALLY CANNOT BE.** vitest
   is node-env, collects only `src/**/*.test.ts`, and the repo has no jsdom and
   no testing-library. `useRecorder`, `useDevices`, `useBackgroundEffect`,
   `useCanvasPipeline` and `useLiveTranscription` have zero behavioural tests.
   The established pattern is the `live-class-logic.ts` / `useLiveTranscription.ts`
   split: pure decision logic in a testable module, thin untestable glue in the
   hook. `avatar-script.test.ts` shows the fallback for the glue - source-text
   regex assertions.

7. **A VISIBLE TELEPROMPTER SCRIPT MUST NEVER REACH A TTS OR AVATAR PATH.**
   REGRESSION.md:15335 records this as a deliberate decision - it would be read
   aloud. And per entry 310, a lecture script is instructor material that is
   never posted to Canvas. This chunk adds no posting or narration affordance.

## Acceptance criteria

### Scope and entry

**T1. TELEPROMPTER MODE IS OFFERED ONLY FOR CONTENT MEANT TO BE SPOKEN.** Not
for every kind. The gate is a new declarative flag on the kind config
(`deliveredAloud: true` on `scriptsKindConfig` only), read the same way
`kindOffersPost` reads `commitMode` - NOT a hardcoded `kindId === "scripts"`
comparison at the call site, so a future spoken kind opts in by declaring it.

**T2. IT CAPTURES NOTHING.** No `MediaRecorder`, no take, no file, no upload,
no Supabase write. The camera and mic streams exist only to drive the on-screen
preview and the live feedback, and are stopped on exit. This is stated in the
UI, so an instructor is never unsure whether they are being recorded.

**T3. ENTERING AND LEAVING IS EXPLICIT AND ALWAYS REVERSIBLE.** A control in
the modal enters teleprompter mode; leaving it tears down every stream and
returns to the normal preview with the version text unchanged. Leaving is
reachable by an explicit control AND by Escape.

### Camera, devices, blur

**T4. THE CAMERA PREVIEW REUSES THE EXISTING CAPTURE PATH, EXTRACTED NOT
COPIED.** A new `useCameraPreview` hook is extracted from `useRecorder`'s
`startPreview`/`stopEverything`, and `useRecorder` is refactored to consume it
so there is ONE getUserMedia path, not two that can drift. The teardown ORDER
is preserved exactly (stop tracks, null the ref, null `srcObject`, cancel the
level-meter rAF, close the `AudioContext`) - a leaked camera light is the
failure users notice most.

**T5. DEVICE PICKERS REUSE `useDevices`, INCLUDING ITS FAILURE STRINGS.** Camera
and microphone selects are driven by the existing hook, keeping its permission
probe, its empty-`deviceId` filtering, its `devicechange` listener, and its
three secure-context error messages (finding 3). A device change re-opens the
stream.

**T6. AUDIO OUTPUT SELECTION IS NEW AND MUST DEGRADE HONESTLY.** `audiooutput`
enumeration plus `setSinkId`. `setSinkId` is not supported everywhere; where it
is unavailable the control is absent with a short reason, never a select that
silently does nothing.

**T7. BLUR IS VISIBLE IN THE PREVIEW, WHICH IS WHAT WAS ASKED FOR.** The
pipeline canvas is mounted into the DOM and driven outside the record path
(finding 1), so the instructor sees the blurred image rather than a raw one
that will only be blurred later. `useBackgroundEffect` is reused unchanged,
including its return-the-raw-video-on-failure behaviour, and its
`bgStatus: "loading" | "failed"` is surfaced rather than hidden - the model
downloads from a CDN and can fail.

### Feedback

**T8. THE PACE TARGET IS THE SAME CONSTANT THE SCRIPT WAS WRITTEN TO.**
`LECTURE_SCRIPT_WORDS_PER_MINUTE` (140) from `src/lib/lecture-script-bounds.ts`.
A teleprompter measuring against a different number than the generator targeted
would tell the instructor they are too slow for a script that was sized for
exactly that pace.

**T9. SPEED AND FILLER FEEDBACK ARE PURE FUNCTIONS OVER TIMESTAMPED TEXT.** A
new leaf module exposing a words-per-minute calculation over `{text, atMs}[]`
and a filler matcher over a string, with NO browser API in either, so both are
directly testable in the node environment (finding 6). The hook that feeds them
from `useLiveTranscription` is the thin, untested glue. Interim results are
folded through the existing `mergeInterim` so a revised utterance is not
counted twice.

**T10. THE WPM READING IS OVER A ROLLING RECENT WINDOW, NOT THE WHOLE SESSION.**
A session average converges and stops responding, which makes it useless as
live feedback. The window is a named constant with its reasoning recorded, and
the meter reports "not enough speech yet" rather than a wild number computed
from one or two words.

**T11. FILLER FEEDBACK STATES WHEN IT CANNOT WORK.** Where the Web Speech path
is unavailable, the filler meter shows an explicit unsupported state, never a
count of zero (finding 2). The filler list is a named constant, matched
case-insensitively on word boundaries so "like" inside "unlikely" is not a hit.

**T12. THE TIMER IS ELAPSED-SINCE-START AND REUSES `fmt`.** It runs from the
moment the instructor starts, not from a recording state that does not exist
here, and formats with the existing tested `fmt(s)`.

### Cross-cutting

**X1. THE MODAL'S STACKING CONTRACT IS NOT BROKEN.** Any full-screen
teleprompter surface renders inside the modal that already renders at
`ModulesView`'s root, and the existing test asserting no component in the sticky
header contains `previewBackdrop` must stay green (finding 4).

**X2. NO FILE EXCEEDS THE CEILING.** The recording directory's under-1000-line
ratchet must stay green, and the new teleprompter surface is its own component
file rather than growth of `GeneratedPreviewModal.tsx` (366 lines before chunk
3e) or `useLmsGeneration.ts` (already over).

**X3. THE SCRIPT TEXT IS NEVER SENT ANYWHERE NEW.** No TTS, no avatar, no
narration, no Canvas post (finding 7). The teleprompter only displays text the
modal already has.

**X4. THE RECORDING TAB STILL WORKS.** T4's extraction refactors a hook six
other surfaces depend on. The recording tab's own behaviour - preview, record,
pause, blur, PiP, takes - is unchanged, and `recording-split.structure.test.ts`
plus `avatar-script.test.ts` stay green.

## Limits (state, do not paper over)

- vitest is node-env with no jsdom, so NOTHING in this chunk that touches a
  camera, a microphone, a canvas, `setSinkId` or the Web Speech API can be
  tested by execution. Only the pure WPM and filler logic will have real tests;
  everything else is verified by reading plus source-text assertions. A green
  suite says almost nothing about whether this feature works on screen, and
  this is the chunk where that gap is widest.
- Filler detection will be unavailable outside Chromium-based browsers, and
  accuracy even there is bounded by what the speech engine emits.
- WPM from speech recognition is an estimate: recognition drops words in noisy
  rooms, so the meter is directional guidance, not measurement.
- The MediaPipe model and WASM load from third-party CDNs, so blur can fail
  offline. That is pre-existing behaviour, surfaced rather than fixed.
- Nothing here will have been exercised against a real camera as part of the
  automated gate.
