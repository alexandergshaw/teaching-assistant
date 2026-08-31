# Screen recording, Loom-style webcam bubble, walkthrough takes, and announcements from a recording

Status: DRAFT - reuse survey complete, awaiting the architecture pass
Opened: 2026-08-30

Baseline gates at the time this was written (all green, so a later failure is
attributable): `npx tsc --noEmit` exit 0; `npx vitest run` exit 0;
`npx next build` "Compiled successfully in 44s" followed by the expected
env-dependent prerender failure on `/_not-found` (no Supabase keys locally).

## The request, verbatim

> i need a screen recording feature on the recording view, and once the screen
> recording is recorded, i need the option to be able to generate an
> announcement from that screen recording and/or record a video/audio of me
> talking through that recording

> if i choose to record a video of myself and overlay it on a screen recording,
> it should show up as a circular profile pic in the lower left like loom does

## What already exists (do not rebuild)

Screen capture is NOT absent. `source: "screen"` has shipped since the original
recording tab. The real work splits three ways: (a) repair and finish the screen
path, which has a silent audio defect and a rectangular bubble in the wrong
corner, (b) add the walkthrough (talk-over) pass, (c) add announcement
generation from a finished take.

| Need | Reuse | Where (file:line) | Notes |
| --- | --- | --- | --- |
| Screen capture | `getDisplayMedia` branch of `startPreview` | `src/app/components/recording/useRecorder.ts:229-249` | Already requests `{video:true,audio:true}`; no surface hint, no cursor option |
| Webcam bubble over screen | `usePipWebcam` + the PiP draw block | `src/app/components/recording/usePipWebcam.ts` (whole file), `useCanvasPipeline.ts:117-166` | Rounded RECT at 22% width, 4 corner presets, default `br` |
| Compositing to the recorded file | `canvas.captureStream(30)` in `startRecording` | `useRecorder.ts:420-430` | The bubble, annotations, cards and background effect are all burned in here |
| Take lifecycle (name/download/delete/backup/library save) | `useTakes` + `TakesPanel` | `src/app/components/recording/useTakes.ts`, `TakesPanel.tsx` | New per-take actions belong as buttons in `TakesPanel`'s `ghActions` row |
| Publishing a derived take | `addRecordedTake(take: Take, blob: Blob) => void` | `useTakes.ts:176` | Appends to the list AND fires `saveTakeToLibrary` (backup folder + `saveRecordingFile` with `kind: "recording"`, `useTakes.ts:130-164`). A walkthrough take calls exactly this - no second save path. |
| Getting a take's bytes back | `const blob = await (await fetch(take.url)).blob()` | `useTakes.ts:184-185` | A `Take` holds only an object URL, never the blob. Both the walkthrough source and the announcement transcript start here. |
| Audio-only derivation from a take | `handleExtractAudio` -> `extractAudioOnly(source: Blob, onProgress?: (pct: number) => void): Promise<Blob>` | `useTakes.ts`, `src/lib/strip-audio.ts:110` | Precedent for "derive a new take from an existing take" |
| Play a take back through a canvas and re-record it | `stripAudio(source: Blob, onProgress?): Promise<Blob>` | `src/lib/strip-audio.ts:8-108` | This is EXACTLY the walkthrough's shape: load metadata, `ensureFiniteDuration`, size the canvas to `videoWidth/videoHeight`, `canvas.captureStream(30)`, `startFrameTicker(30, draw)`, stop on `v.ended`, mime fallback chain. Read it before writing Group C. |
| Mixing a source video's own audio under new audio, and re-encoding | `renderNarratedVideo(source: Blob, clips: NarrationClip[], mode: "replace" \| "mix", onProgress?): Promise<Blob>` | `src/lib/narrate-video.ts:84-180` | **The closest existing thing to the walkthrough.** Already plays a Blob through a canvas, already does `ac.createMediaStreamDestination()` + `createMediaElementSource(v).connect(dest)` for `mode: "mix"`, already composes `[...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]`. Its `"replace" \| "mix"` is AC19's toggle under another name. Difference: it schedules PRE-DECODED clips, the walkthrough needs a LIVE mic. The architect decides whether generalizing it is real reuse or a false one. |
| WebAudio mixing precedent for AC1 | `createMediaStreamDestination` usage | `src/app/components/slide-studio/useDeckMode.ts:376`, `src/app/components/caption-studio/hooks/useBurnCaptions.ts:122-123` | Mixing into one destination track is an established idiom here, not a new invention. |
| A tick source that survives a hidden tab | `startFrameTicker(fps, onTick)` | `src/lib/frame-ticker.ts` | Uses an inline Worker because rAF and main-thread timers are throttled while the tab is hidden - which is precisely when a screen recording runs. Never replace it with `setInterval` or rAF. |
| Duration of a webm blob whose metadata says `Infinity` | `ensureFiniteDuration(v)` | `src/lib/caption-burn.ts` | MediaRecorder webm blobs report `duration: Infinity` until seeked; the walkthrough's progress and end-detection need this. |
| Panel/idiom vocabulary | `styles.adaptPanel`, `styles.ghPanel`, `styles.ghRow`, `styles.ghActions`, `styles.ghBadge*`, `styles.fieldHint` | `src/app/page.module.css` | Two button vocabularies exist in this repo; Recording uses MUI `Button size="small" variant="outlined"` |
| Speech to text | `transcribeLiveAudioAction(wavBase64: string, opts?: { hintTerms?: string; provider?: LlmProvider }): Promise<{ text: string } \| { error: string }>` | `src/app/actions/live-class.ts:142` | The ONLY STT path in the repo. Gemini, not Whisper. Accepts `audio/wav` ONLY - the `audio/webm` MediaRecorder produces is rejected by the provider. Never throws; returns `{error}`. |
| WAV encoding for that action | `LIVE_SAMPLE_RATE` (16000), `downsampleToMono(input: Float32Array[], inputRate: number, targetRate: number): Float32Array`, `encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer`, `estimateWavBytes(seconds, sampleRate?): number`, `base64FromArrayBuffer(buf: ArrayBuffer): string` | `src/lib/live-class/wav.ts:20,32,84,129,140` | Dependency-free, safe on client and server. 16 kHz mono int16. |
| The segmented transcription precedent | `useLiveTranscription` | `src/app/components/live-class/useLiveTranscription.ts:144` | Decode -> downsample -> WAV -> base64 -> action, on a rotation. Read it before writing the take transcriber. |
| The LLM call | `callLlm(req: LlmRequest, provider?: LlmProvider): Promise<LlmResult>` | `src/lib/llm.ts:232` | Server-only (reads `process.env`). Model `gemini-3.1-flash-lite`. |
| LLM failure text | `describeLlmFailure(result, label)`, `describeEmptyLlmText(result, label)` | `src/lib/llm.ts:175,190` | Use these; `transcribeLiveAudioAction` itself drops `result.body` and is the worse precedent. |
| Lenient JSON out of a model | `parseLenientJsonArray` / `jsonObjectSlice` | `src/lib/lenient-json.ts:6`, `src/app/actions/shared.ts` | No Zod in this repo. Prompt for JSON, parse leniently, hand-filter with `typeof`. |
| Wire budget | `checkWireBudget(wireBytes, what, maxWireBytes?)`, `UPLOAD_WIRE_BUDGET_BYTES` (3.5MB) | `src/lib/upload-budget.ts` | See trap 12 - this is what forces audio chunking. |
| Announcement drafting | `draftAnnouncementAction(instruction: string, provider?: LlmProvider): Promise<{ title: string; message: string } \| { error: string }>` | `src/app/actions/messaging.ts:405` | THE canonical drafter. Owner-gated, folds in the user's saved writing style, client-callable, never throws. Takes ONE instruction string - the transcript goes in there. |
| Two-step post confirm | `postArmSignature(kindId, artifactId, moduleChoice, newModuleName)`, `isConfirmArmed(armedFor, signature)`, `mayPostCommit(unavailableReason, dirty, armed)` | `src/app/components/content-tab/modules/postConfirmArming.ts:69,42,94` | Pure, node-testable, no dependencies. Reuse verbatim. |
| "Edited but not saved" predicates | `draftsNeedReseed`, `draftsDirty` | `src/app/components/content-tab/modules/generatedPreviewDrafts.ts:45,61` | NOT reused - see AC25c for why the dirty rule has no meaning without a saved artifact row. |
| Posting an announcement to Canvas | `createAnnouncementAction(courseUrl: string, title: string, message: string, acronym?: string, delayedPostAt?: string): Promise<{ announcement: CanvasAnnouncement } \| { error: string }>` | `src/app/actions/canvas-inbox.ts:233` | The ONLY Canvas announcement write reachable from a client component. Wire params are `title`, `message` (through `textToHtml`), `is_announcement="true"`, optional `delayed_post_at`. |
| Announcement preview modal | `GeneratedPreviewModal` | `src/app/components/content-tab/modules/GeneratedPreviewModal.tsx:234` | NOT reused - see AC22e for why. |
| Recording library save | `saveRecordingFile` | `src/lib/recording-files.ts` | `kind` is a five-place contract - see the trap list |

## Defects found in the existing screen path (in scope, they are the feature)

**D1. The narration mic is silently dropped from every screen recording.**
`useRecorder.ts:243-248` adds the selected mic as a SECOND audio track on the
display stream, and `startRecording` then builds
`new MediaStream([...canvasStream.getVideoTracks(), ...streamRef.current.getAudioTracks()])`
(`useRecorder.ts:426`). MediaRecorder encodes only the FIRST audio track, so
with system audio present the user's voice never reaches the file. There is no
error - the take just has the wrong audio. This is the single most important fix
in this document: "record a screen recording while I talk over it" is the
headline ask and it does not currently work.

**D2. The bubble is a rounded rectangle in the bottom right.** The request is a
circular bubble in the lower LEFT (Loom's default).

**D3. Screen source ignores the resolution control and the mirror control** (both
are `disabled={source !== "camera"}`), which is correct, but there is no
screen-specific option at all - no surface preference, no system-audio toggle,
no cursor choice.

## Acceptance criteria

### Group A - Screen recording, done properly

**AC1.** Audio for a screen recording is MIXED, not stacked. A new module
`src/app/components/recording/audio-mix.ts` exports:

```ts
export interface MixedAudio {
  track: MediaStreamTrack;
  close: () => void;
}
export function mixAudioTracks(tracks: MediaStreamTrack[]): MixedAudio | null;
```

- Returns `null` when `tracks` is empty.
- With exactly one track, returns that track unchanged and a no-op `close`
  (no AudioContext is created - do not pay for a graph that mixes nothing).
- With two or more, creates one `AudioContext`, one
  `MediaStreamAudioSourceNode` per track, connects each into a single
  `MediaStreamAudioDestinationNode`, and returns
  `destination.stream.getAudioTracks()[0]`. `close()` closes the context and
  stops the produced track.
- Pure enough to unit test: the module accepts an injected context factory so a
  test can drive it in node without WebAudio. The interface is pinned here,
  because an earlier draft named `AudioContextLike` without defining it and four
  agents would each have invented a different shape:

```ts
export interface AudioContextLike {
  createMediaStreamSource(stream: MediaStream): { connect(dest: unknown): void };
  createMediaStreamDestination(): { stream: MediaStream };
  resume(): Promise<void>;
  close(): Promise<void>;
  readonly state: string;
}
export function mixAudioTracks(
  tracks: ReadonlyArray<MediaStreamTrack>,
  makeContext?: () => AudioContextLike,
): MixedAudio | null;
```

  The default `makeContext` resolves `window.AudioContext ?? window.webkitAudioContext`,
  matching `useRecorder.ts:129-134`. The fake must also produce a fake
  `MediaStream`, since the return value is `destination.stream.getAudioTracks()[0]`.

**AC1b. The context must be resumed immediately after construction.**
`startRecording` is reached from a `setInterval` callback when the 3-2-1
countdown is on (`useRecorder.ts:380-393`). An `AudioContext` constructed there
can be `"suspended"` under Chrome's autoplay policy, and a suspended context's
`MediaStreamAudioDestinationNode` produces a track carrying NO AUDIO - a silent
take with no error, which is D1's failure shape reached by another route. Call
`ctx.resume()` fire-and-forget, swallowing the rejection. **VERIFY** that a take
started via the countdown (not a direct click) has audio.

**AC1b-bis. A suspended context must be VISIBLE, not just detected.** `MixedAudio`
carries `resumedState: Promise<string>`, resolving to the context's actual state
once `resume()` settles either way. Detecting the condition and then discarding
it is worthless - a review found exactly that, with the field read only by its
own tests while the user still got a silently silent take. `useRecorder` must
observe it and surface a notice through the same channel as the other capture
warnings, so a silent take is distinguishable from a working one.

**AC1c. Mixing is at unity gain and may clip.** Summing a hot mic and loud
system audio can exceed full scale. Gain nodes are deliberately NOT specified -
any value would be a guess and it would complicate the tested contract - but the
Limits must record that mixed screen recordings are un-attenuated and that
clipping under two loud sources is expected, unmeasured behaviour.

**AC2.** `startRecording` uses the mixed track. The recorded stream is
`new MediaStream([...canvasStream.getVideoTracks(), mixedTrack])` when a mixed
track exists, and falls back to today's behaviour when there is no audio at all.
The mix is closed in `stopEverything` and in `recorder.onstop`.

**AC3.** Mute still works while mixed, and it mutes the **mic** only - system
audio is deliberately not muted by the mute button.

The wording matters, because "operate on the source tracks" (an earlier draft)
is wrong: today `streamRef.current` for the screen source contains BOTH the
display audio track and the mic, since `useRecorder.ts:245` does
`stream.addTrack(audioTrack)`. Muting "the source tracks" would mute system
audio too. Required: **the mic track is held in its own ref and never added to
the display stream**, and the mute path flips `enabled` on that mic source track
alone - never on the mixed output track, which would silence the shared tab as
well. Carry that reasoning as a comment; it is exactly what a later refactor
collapses.

The same correction applies to `setMicCaptureEnabled` (the title/closing-card
mute), which has the identical bug and which the earlier draft did not mention.

**AC3b.** Two consequences of holding the mic separately, neither previously
stated: `hasAudio` and the level meter currently derive from the combined
stream, so today the meter shows SYSTEM audio when there is no mic. Both must
follow the mic - the Mute button is a mic control and should appear only when
there is a mic to mute.

**AC4.** The screen capture request carries explicit hints:
`{ video: { displaySurface: "monitor", frameRate: { ideal: 30 } }, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }`.
System audio must NOT be processed by voice DSP - noise suppression on a shared
tab destroys music and speech in the shared content. The mic keeps the user's
chosen DSP settings.

**AC5.** A new "Share system audio" checkbox (`ta-rec-screen-audio`, default on)
controls whether the display stream's audio track is included in the mix. When
off, the display audio track is stopped immediately.

There are THREE states, not two, and each gets its own string. An earlier draft
of this AC had one message asserting the user "left the audio box unchecked",
which is false in the common case: Chrome offers tab audio for a tab and system
audio for a whole screen on Windows only, offers nothing for a window, and
Firefox and Safari offer no display audio at all. Blaming the user for a control
that was never rendered is worse than saying nothing.

| Situation | String |
| --- | --- |
| Checkbox off | `System audio is off - only your microphone is being recorded.` |
| Offered, none granted | `System audio was not shared. It has to be ticked in the browser's share dialog, and it is only offered for a tab or a whole screen.` plus a `Share again` action |
| Browser cannot share it | `This browser does not share system audio. Your microphone is still being recorded.` |
| Granted, then stopped by the checkbox | `System audio was granted earlier but was stopped when you turned it off - use Share again to include it.` |

**AC5b. There are FOUR states, not three.** The fourth was found during review:
toggling the checkbox off and then back on leaves a display-audio track that was
already stopped, so the stream has no system audio even though the checkbox
reads on. An earlier version of this AC listed three states and the code
truthfully needed a fourth; the table above is amended to match what ships
rather than leaving the code disagreeing with its own AC. The distinction that
matters is unchanged: **never blame the user for a control the browser did not
render**, and never let a checkbox claim something is being recorded when it is
not.

**AC5c. The pinned strings have exactly ONE definition each.**
`SCREEN_AUDIO_NOT_GRANTED_NOTICE` lives in
`src/app/components/recording/screen-source.ts`, is re-exported from
`useRecorder.ts` for existing importers, and the `Share again` control gates on
that binding rather than on a restated literal. This is load-bearing: the
recovery action is gated by a string comparison, so a duplicated copy meant a
one-character copy edit could silently delete the only way to recover from a
missed audio checkbox, with every gate green.

- The message renders **on the stage**, beside the existing "no mic on this
  stream" warning (`StagePanel.tsx:308`), not in the options panel the user has
  just collapsed. It is a session-long fact about the current stream.
- `Share again` re-runs `getDisplayMedia` in one click. Without it the only
  recovery is stop preview, start preview, and two more picker clicks - four
  interactions to fix a checkbox the user missed.
- When no display audio track exists, the checkbox renders **disabled with the
  reason attached via `aria-describedby`**, not checked and inert. A checkbox
  that reads "on" while nothing is being mixed is a lie.

**AC6.** Ending the screen share from the browser's own "Stop sharing" bar while
RECORDING must finish the take cleanly. Today `startPreview` wires
`videoTrack.addEventListener("ended", () => void stopEverything())`
(`useRecorder.ts:296-301`).

**Corrected justification** - an earlier draft of this AC claimed the take is
lost entirely. It is not: `stopEverything` DOES call `recorderRef.current.stop()`
first (`useRecorder.ts:171-206`), which fires `onstop`, builds the blob and
calls `addRecordedTake`. What is actually lost is (a) the closing card, because
`stopEverything` bypasses `stopRecording`'s card branch, and (b) potentially the
final chunk, because `streamRef.current.getTracks().forEach(t => t.stop())` runs
in the same tick, before `onstop`. The fix is unchanged - route through
`stopRecordingRef.current()` and defer teardown to `onstop` - but the reasoning
is corrected here so a reviewer does not verify a claim that was never true and
conclude the fix did nothing.

### Group B - The Loom bubble

**AC7.** The bubble shape is selectable and defaults to CIRCLE. New setting
`bubbleShape: "circle" | "rounded"` persisted under `ta-rec-pip-shape`, default
`"circle"`.

**AC8.** The bubble corner default changes to `"bl"` (lower left). The persisted
key `ta-rec-pip-corner` keeps its name and its four values.

**A plain default change would reach nobody, including the person who asked for
this.** `RecordingTab.tsx:106` writes `ta-rec-pip-corner` on every run of the
persist effect, so anyone who has ever opened the Recording tab already has
`"br"` stored and would keep it forever. "Only a user with nothing stored sees
the new default" is, in practice, only a user who has never opened the tab.

Required: a **one-time migration**, keyed off the absence of the new
`ta-rec-pip-shape` key, which by definition is unset for every pre-feature user
and set for every post-feature one. On first load, if `ta-rec-pip-shape` is
absent, set the corner to `"bl"` as well as the shape to `"circle"`. This needs
no additional localStorage key and no additional entry in the canary array. A
user who changes the corner afterwards keeps their choice, because the migration
never runs again.

**AC9.** A circular bubble is drawn as a true circle with a cover-fit crop, not
a squashed circle. Diameter `d = round(canvas.width * bubbleSize)`; the source
video is cropped to its centred square before drawing (`sx`, `sy`, `sSide`
derived from `videoWidth`/`videoHeight`), then clipped with
`ctx.arc(cx, cy, d/2, 0, Math.PI*2)`. Drawing a non-square video into a circular
clip without the crop is the defect this AC exists to prevent.

**AC10.** The crop math lives in a pure, testable helper - not inline in the
draw loop:

```ts
// src/app/components/recording/bubble-geometry.ts
export interface BubbleRect { x: number; y: number; size: number; }
export interface BubbleCrop { sx: number; sy: number; sSide: number; }
export function bubbleRect(
  canvasW: number, canvasH: number,
  corner: "br" | "bl" | "tr" | "tl",
  sizeFraction: number,
): BubbleRect;
export function coverCrop(videoW: number, videoH: number): BubbleCrop;
```

`coverCrop` returns the largest centred square of the source. For 1280x720 it
returns `{ sx: 280, sy: 0, sSide: 720 }`. For 720x1280, `{ sx: 0, sy: 280, sSide: 720 }`.
For a zero or NaN dimension it returns `{ sx: 0, sy: 0, sSide: 0 }` and the
caller skips the draw (a NaN reaching `drawImage` throws and kills the whole
frame ticker, taking the recording with it).

**AC11.** Bubble size is selectable: `ta-rec-pip-size` in `"sm" | "md" | "lg"`
mapping to `0.16 | 0.22 | 0.30` of canvas width, default `"md"` (0.22, today's
value, so an existing user sees no size change).

**AC12.** The circular bubble keeps a white ring border (the existing
`rgba(255,255,255,0.85)`, `lineWidth: 3`) and gains a soft drop shadow
(`ctx.shadowColor = "rgba(0,0,0,0.35)"`, `shadowBlur = 12`) so it reads as a
floating bubble over light-coloured slides. The shadow must be reset before the
next draw (`ctx.shadowBlur = 0` inside the same `save`/`restore` pair) or every
subsequent element on the frame is shadowed.

**AC13.** The webcam bubble is mirrored horizontally when `mirror` is on, so the
presenter sees themselves the way a mirror shows them. Today `mirror` is forced
off for screen source in the UI; the bubble uses its own always-on mirroring
(Loom's behaviour) - no new control.

**AC14.** The bubble is visible in the LIVE PREVIEW, not only in the recorded
file. Today the preview `<video>` shows the raw stream and the composited canvas
is never displayed (REGRESSION.md baseline check 3 states effects are burned in
while "the preview stays raw"). For a Loom-style bubble the user must be able to
see where the bubble sits before recording. Required: when `source === "screen"`,
the stage shows the composited pipeline canvas instead of the raw video element.
This changes a documented baseline behaviour for the screen source only - camera
and audio sources keep the raw preview - and the REGRESSION.md entry must be
amended to say so.

Six things the first draft of this AC left open, each of which produces a
predictable defect:

**(a) The condition is `source === "screen"` ALONE, not "and the bubble is on."**
Tying it to the bubble checkbox means ticking the box swaps the displayed
element mid-session, with a reflow and a visible flash. One element for the
whole screen source, no swap.

**(b) The hidden `<video>` remains the pipeline's SOURCE.** The canvas draws
from it (`useCanvasPipeline.ts` reads `videoRef.current`). Showing the canvas
means the `<video>` becomes `display:none` but stays alive and playing - it is
not removed, and its `srcObject` is not cleared.

**(c) The annotation overlay's coordinate mapping must be re-checked.**
`overlayCanvasRef` is `position:absolute; inset:0` over the `<video>`
(`StagePanel.tsx:135-151`) and stroke coordinates derive from that element's
box. Swapping the displayed element for a canvas with a different intrinsic
size changes the mapping. Annotations landing in the wrong place is the
predictable defect here; verify the mapping explicitly rather than assuming the
`inset:0` absolves it.

**(d) The pipeline's lifecycle changes and it is not free.** `startPipeline()`
is called only from `startRecording` today (`useRecorder.ts:417`). It must now
start with the screen PREVIEW and stop with it. State the cost plainly: an idle
screen preview now runs a 30fps compositor, plus a second camera stream when the
bubble is on, where it previously cost nothing.

**(e) Mirroring differs between the two paths.** The preview `<video>` mirrors
with a CSS transform; the canvas burns it in per AC13. Say which applies on the
canvas preview so the presenter is not surprised by the swap.

**(f) Changes must be live.** Corner, shape and size changes appear in the
preview immediately, or the controls are still blind and AC14 has bought
nothing.

**AC14b. The bubble is NOT draggable.** Rejected deliberately: it is a
mouse-only interaction that would need a keyboard equivalent built alongside it,
and four corner presets already cover the need. Do not add it as a "nice to
have" later in the wave.

### Group C - Walkthrough (talk over a finished recording)

**AC15. The take action row becomes two-tier.** Today it is Download / Audio
only / Delete inside `styles.ghActions`. Adding "Talk through this" and "Draft
announcement" would make five controls, two with long labels, wrapping onto two
lines in a narrow pane - and it puts an **unconfirmed destructive Delete**
(`handleDelete` revokes the object URL immediately, `useTakes.ts:122-130`, and
takes are in-memory only, so it is unrecoverable) next to two benign new buttons
in a layout that reflows.

- Visible: **Talk through this**, **Draft announcement**, **Download**.
- Overflow: an icon button opening a MUI `Menu` holding **Audio only** and
  **Delete**. Precedent: `FolderActionsMenu`, already a sanctioned family-E site
  in `docs/modal-dismissal-focus-acceptance-criteria.md` AC7, and already
  keyboard-operable. Delete gains one click, which is a feature given it has no
  confirmation step.
- The menu trigger's accessible name includes the take name -
  `More actions for Take 3`. A row-repeated "More" is a screen-reader dead end.
- Audio-only takes keep today's behaviour of hiding the "Audio only" action.

**AC15b. Per-take busy state replaces the global string.** `extractingAudioId`
is one global string with the percent smuggled into it (`useTakes.ts:189`, read
back at `TakesPanel.tsx:67`). Three long-running per-take operations cannot
share that. Use one record: `{ takeId: string; stage: string; detail?: string }`.
While any of the three runs, the other two are disabled **on every take**, not
just the busy one - the recorder and the transcription queue are singletons.
A disabled control states why, per this repo's own precedent
(`GeneratedPostSection` AC 12b replaces a blocked button with a visible hint
rather than greying it silently).

**AC15c. After Stop, the new take's actions appear inline on the stage** -
`Take 3 saved - Talk through this | Draft announcement` - instead of making the
user scroll to find the row. Zero added clicks, removes a hunt.

**AC16.** Choosing it opens a walkthrough stage that plays the source take back
while capturing the user. Two capture modes, persisted under
`ta-rec-walk-mode`, default `"video"`:
- `"video"` - camera plus mic, rendered as the same circular bubble over the
  playing take, producing a NEW composited video take.
- `"audio"` - mic only, producing a new video take that is the source take's
  video with the narration audio replacing/mixing over it.

**AC16b. The walkthrough lives in a fifth PANE of `RecordingTab`'s existing
always-mounted `display:none` stack. It is not a modal and not an inline
expansion in the takes list.** Shown when `walkthroughTakeId !== null`, reached
only from a take's button, with a `Back to takes` control. Reasons, in order of
weight, so this is not relitigated:

1. A modal contradicts the surface's load-bearing contract: REGRESSION check 1
   pins that inner views stay mounted behind `display:none` precisely so
   navigation never kills a live recording. A dialog is the opposite shape.
2. A modal inherits Escape-to-close, and Escape during a walkthrough destroys
   the take. Building a dialog whose purpose is to refuse the dialog
   mechanism's default is a sign the shape is wrong.
3. Any new `styles.previewBackdrop` or `role="dialog"` is caught automatically
   by the derived modal-adoption scan in
   `docs/modal-dismissal-focus-acceptance-criteria.md` AC8 and fails unless it
   adopts `ModalShell` or is allowlisted.
4. `ModalShell` defaults to 980px; the walkthrough needs the full stage width -
   a 48vh video, a transport row, and the bubble.
5. An inline expansion puts a live camera and a transport inside a list row
   that reflows as other takes finish saving.

**Do NOT add a fifth entry to the tab strip** - it would be dead until a take is
chosen. Two further rules:

- **`ta-rec-view` must never accept the walkthrough pane.** Takes are in-memory
  object URLs; restoring that pane after a reload restores a pane whose subject
  no longer exists.
- **The R/P/M keyboard shortcuts must be scoped away from it.** They are gated
  only by `active` today; pressing R inside a walkthrough must not start a
  second recorder.

**AC16c. Entering the walkthrough stops the record preview, and says so.** The
record preview may already hold the camera, and `usePipWebcam` opens a SECOND
camera stream for the bubble. Two consumers of one webcam is a hard device
conflict on Windows for a large class of cameras. Either share one stream or
stop the preview explicitly; whichever is chosen, the user is told:
`Stopped the record preview so the walkthrough can use the camera.`

**AC16d. The walkthrough stage shows the composited canvas, exactly as AC14
requires for the screen source.** The bubble is the entire output of this flow;
positioning it blind is not acceptable. AC14's rules (a) through (f) apply here
verbatim.

**AC16e. The walkthrough's own controls live IN the walkthrough surface**, next
to the transport they modify - never in the "Recording options" disclosure.
Putting `ta-rec-walk-mode` and `ta-rec-walk-keep-source-audio` in that panel
would cost four extra interactions and a scroll past thirteen unrelated
controls, on a panel that has nothing to do with the take just clicked.

**AC17.** The walkthrough records through the same canvas pipeline. The source
take's `<video>` element is the pipeline's video source, the webcam is the
bubble, and `canvas.captureStream(30)` plus the mixed audio feeds MediaRecorder.
Reusing the pipeline rather than writing a second compositor is required - a
second compositor is how the bubble ends up looking different in the two places.
`src/lib/strip-audio.ts:8-108` is the working precedent for the surrounding
mechanics (metadata wait, `ensureFiniteDuration`, canvas sizing, ticker, stop on
`v.ended`, mime fallback) and the bubble draw must come from the SAME helper
Group B adds (`bubble-geometry.ts` plus the draw block), not a copy.

**AC17b.** The source take's own duration is unreliable. A MediaRecorder webm
blob reports `duration: Infinity` until it is seeked; use `ensureFiniteDuration`
(`src/lib/caption-burn.ts`) exactly as `stripAudio` does. A walkthrough whose
progress bar divides by `Infinity` shows 0 percent forever.

**AC18.** Playback controls during a walkthrough: play/pause is the recording
transport. Recording starts when playback starts and stops when the source take
ends. If the user pauses, the recorder pauses too, so the output stays in sync
with the source. Restating the invariant that matters: **output duration equals
the source take's played duration** - if these drift, the narration desyncs from
the visuals and the artifact is useless.

**AC19.** Source audio handling during a walkthrough: a checkbox
`ta-rec-walk-keep-source-audio` (default OFF) mixes the source take's own audio
under the narration. Default off because talking over a recording that already
has your voice in it is the common mistake.

**AC19b. WITHDRAWN - there is no speaker feedback path, so no headphones
warning is warranted and none should be written.** An earlier draft of this
document required one, on the mistaken premise recorded in trap 11. The
walkthrough's `MediaStreamAudioDestinationNode` is never connected to
`ac.destination`, so nothing reaches the speakers and the microphone cannot
re-capture the playback.

Two things follow, and both belong in the Limits:
- In `keepSourceAudio` mode the user **cannot hear** what they are narrating
  over. That is the correct default trade - AC19 turns the mode off by default
  precisely because talking over your own voice is the common mistake.
- If monitoring is ever wanted it must be headphones-only and behind its own
  control, never a side effect of the mix.

`ta-rec-walk-keep-source-audio` OFF means the element source is simply not
connected to the destination. Say that plainly; "off" is one thing, not two.

**AC20.** The resulting take is named `<source name> - walkthrough` and is a
first-class take: it appears in `TakesPanel`, backs up, and saves to the library
exactly like a recorded take. It records its provenance so the UI can show
"from: <source take name>".

### Group D - Announcement from a recording

**AC21.** Every take gets a "Draft announcement" action.

**AC22.** The flow is: obtain audio for the take -> transcribe it -> generate a
subject and body from the transcript -> review and edit it -> post it to a
chosen course. The generation step must NOT invent its own Canvas write;
`createAnnouncementAction` is the shipped path (AC25c).

**AC22a. Audio is captured during recording, not extracted afterwards.**
`extractAudioOnly` runs in WALL-CLOCK REAL TIME (a 20-minute take takes 20
minutes) and, because it uses `createMediaElementSource` with `v.muted = false`,
it plays the audio out loud through the user's speakers while it works. Making
that the announcement path would be unusable.

Instead: while a take is recording, a SECOND `MediaRecorder` runs on the mixed
audio track alone (`pickAudioMimeType()`'s chain) and its blob is attached to
the finished take. Transcription then starts instantly and silently.

**The sidecar ROTATES, and the take carries `audioSegments?: Blob[]`, not one
blob.** An earlier draft said one blob; that is an out-of-memory bug on exactly
the recordings this feature exists for. `decodeAudioData` decodes an ENTIRE
buffer at once, and a WebM/Opus fragment is not independently decodable
(`useLiveTranscription.ts:12-19` records this vendor fact), so a single blob
cannot be sliced before decoding. A 40-minute take - the size AC25b itself uses
as its worked example - decodes at 48 kHz stereo to roughly
`40*60*48000*2*4` = **920 MB** in one allocation. Twenty minutes is ~460 MB.
That is a crash, not a slowdown.

So: the sidecar rotates at `TRANSCRIBE_CHUNK_SECONDS`, stopping its recorder and
immediately constructing a fresh one on the same `new MediaStream([track])` -
the shipped `useLiveTranscription` rotation idiom, not a new mechanism. Peak
decode memory becomes about one minute (~23 MB), and **the segments ARE the
chunks**, so no slicing is needed on this path at all.

- `Take` gains `audioSegments?: Blob[]` (in-memory only, never persisted, never
  sent to the library - the library already has the audio inside the video).
- The rotation cadence is driven by `startFrameTicker` so a hidden tab cannot
  stretch it, and it is SUSPENDED while the recorder is paused (see below).
- Decode with `new AudioContext({ sampleRate: LIVE_SAMPLE_RATE })` so
  `decodeAudioData` resamples on the way out and `downsampleToMono` only has to
  mix channels. **VERIFY** that Chrome honours the constructor's `sampleRate`
  here and that the resampling quality is acceptable; this is an optimisation,
  and if it does not hold, decode at the native rate and downsample as usual.

**AC22a-bis. Pause and resume must drive BOTH recorders.** Two `MediaRecorder`
instances are independent objects, and `pauseRecording` (`useRecorder.ts:503`)
touches only `recorderRef.current`. Left alone, the sidecar records straight
through a pause, so its audio is longer than the video take and
`planTranscriptChunks(take.durationSec)` plans against the wrong length - the
transcript drifts out of alignment with the video for every pause.

Related, and correct as it stands so do not "fix" it: because the title/closing
card mute flips `enabled` on the mic SOURCE track feeding the mix, the mixed
output goes silent for the mic while system audio continues, and the sidecar
records those seconds as silence rather than dropping them. Timings stay
aligned. A later refactor that muted the MIXED track instead would break this
silently.

**VERIFY**: that a second `MediaRecorder` on `new MediaStream([mixedTrack])`
starts at all in Chrome while the first records, and measure the second Opus
encode's CPU cost during a 1080p screen capture. Nothing in the spec forbids it
and the shape is common, but it is unverified here.
- The parallel recorder must not affect the video take. If constructing or
  starting it throws, log it and carry on: the video recording is the product,
  the audio sidecar is a convenience.
- Takes with no sidecar (imported, pre-existing, or the sidecar failed) fall
  back to `extractAudioOnly`. That fallback is gated by a **two-step confirm,
  not a notice** - the thing being warned about is up to twenty minutes of
  uninterruptible out-loud playback, which is not something to slide past in a
  hint. The estimate is computed from the take's duration:
  `This take has no captured audio track, so it has to be played back in real
  time to get one - about 20 minutes - and you will hear it play.` with
  `Play it back` and `Cancel`. The two paths must be distinguishable in the UI -
  a user waiting 20 minutes deserves to know why. **The string must NOT claim
  the user will hear it** unless trap 11's VERIFY says otherwise; the real-time
  cost alone is the reason to warn.

**AC22b. Transcription is chunked, because one request cannot hold a lecture.**
`transcribeLiveAudioAction` takes base64 WAV inline. At `LIVE_SAMPLE_RATE`
(16 kHz mono int16) that is 32000 bytes per second of audio, and
`UPLOAD_WIRE_BUDGET_BYTES` is 3.5MB of WIRE bytes, which base64 inflates by 4/3
- roughly **82 seconds of audio per request**. The action's own
`MAX_AUDIO_BINARY_BYTES` of 7MB is NOT a real guard: 7MB decoded is ~9.33MB on
the wire, far above Vercel's 4.5MB body cap, so an oversized clip dies as an
opaque 413 before the friendly message can run. The code says so itself at
`live-class.ts:78-81`.

Required: a new pure module `src/lib/take-transcript.ts`:

```ts
export const TRANSCRIBE_CHUNK_SECONDS = 60;
export interface TranscriptChunkPlan { index: number; startSec: number; endSec: number; }
export function planTranscriptChunks(
  durationSec: number,
  chunkSeconds?: number,
): TranscriptChunkPlan[];
export function joinTranscriptChunks(parts: ReadonlyArray<string>): string;
```

- `planTranscriptChunks` returns contiguous, non-overlapping chunks covering
  `[0, durationSec)`; a zero, negative, `NaN` or `Infinity` duration returns
  `[]` (a MediaRecorder webm reports `Infinity` until seeked - see AC17b).
- 60 seconds is chosen with the real number stated: 60s * 32000 B/s = 1.92MB of
  WAV, ~2.56MB on the wire, inside the 3.5MB budget with headroom for the
  prompt. Do not raise it without redoing that arithmetic.
- `joinTranscriptChunks` trims each part, drops empties (the action returns `""`
  for silence by design, via its `normalizeTranscript`), and joins with a single
  space.
- The client pre-flights each chunk with `checkWireBudget(base64.length, ...)`
  before calling the action, so an over-budget chunk gets a real message instead
  of a 413.

**AC22c.** Chunks are transcribed SEQUENTIALLY, not in parallel. `callLlm`
already retries 5 times with backoff on 429; firing ten chunks at once turns a
rate limit into ten of them. Progress reports `Transcribing... chunk N of M`.

**AC22d.** A chunk boundary can cut a word in half, and this is accepted rather
than solved (no overlap, no stitching heuristic). Say so in the Limits: the
transcript is good enough to write an announcement from, and is not offered as
a caption track. Caption Studio remains the captioning surface.

**AC23.** Progress is visible and each stage's failure is distinguishable.
The stages are: `Preparing audio` (sidecar or real-time extraction),
`Transcribing... chunk N of M`, `Drafting`. A failure names WHICH stage failed
and carries the underlying reason. Specifically:
- a transcription chunk failure reports the chunk index and the action's
  `error` string;
- an empty transcript across ALL chunks is its own message - `No speech was
  found in this recording.` - and is NOT reported as a failure of the LLM;
- a draft failure carries `draftAnnouncementAction`'s `{ error }` string
  verbatim. **An earlier draft of this AC required `describeLlmFailure` /
  `describeEmptyLlmText` at a call site that cannot reach them:** both live in
  `src/lib/llm.ts` and take an `LlmResult`, which the client never sees -
  `draftAnnouncementAction` returns `{title, message} | {error}` and
  `transcribeLiveAudioAction` returns `{text} | {error}`, discarding
  `result.body` at `live-class.ts:179` before any client exists. Satisfying the
  old wording would require editing a server action, which no AC line authorizes
  and which is out of scope here. Record in the Limits that the underlying HTTP
  body is lost at the action boundary. Improving `draftAnnouncementAction`
  itself, so every caller benefits, is a correctly-scoped follow-up with its own
  AC - **not** a rider on this feature, and specifically not a partial version
  invented inside a hook and reported as satisfying this AC.
Collapsing these into one "Could not draft an announcement" is the defect this
repo's loop catches most often - do not.

**AC23b. Progress has a real surface.** A 20-minute take is roughly 20
sequential chunks - minutes of waiting. The `extractingAudioId` precedent (a
percentage inside a button label) is far too small and scrolls out of view.
Required: a status line under the take row containing a `role="progressbar"`
with `aria-valuemin`/`aria-valuemax`/`aria-valuenow` and an `aria-valuetext` of
`Transcribing chunk 7 of 20`, plus a `role="status" aria-live="polite"` region
that announces **stage transitions and every 25 percent of chunks only**. A
polite region re-announcing every chunk reads twenty updates aloud; that is the
failure mode a naive reading of AC23 produces.

**AC23c. The pass can be CANCELLED.** AC22c already makes chunks sequential, so
cancellation is a `cancelledRef` checked between chunks - nearly free. A Cancel
control sits beside the progress, for both the transcription pass and the AC22a
real-time fallback.

**RESOLVED - `extractAudioOnly` now takes an abort signal.** It previously had
`onProgress` but no way to stop, making the fallback an uninterruptible
20-minute commitment. The signature is now:

```ts
export async function extractAudioOnly(
  source: Blob,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<Blob>
```

Aborting pauses the element and stops the recorder immediately, so the playback
does not keep running in the background, and it rejects with
`new DOMException("Audio extraction was cancelled.", "AbortError")`. It
deliberately does NOT return the partial audio - a truncated blob would be
transcribed and drafted from with nothing indicating it was short, which is the
same class of silent-wrong-answer defect as AC23d.

The caller must treat `AbortError` as a CANCELLATION, not a failure: it lands on
`idle` with the cancellation copy, never on `{ phase: "failed", stage: "audio" }`.
Showing a user who pressed Cancel an error is a bug.

**AC23d. A cancelled or failed pass must NOT write `Take.transcript`.** AC24
caches the transcript for reuse; a partial value left behind means every future
draft silently reads a truncated transcript with no indication that it is
truncated. `Take.transcript` is set only on a complete, successful pass. This is
a trap AC24 creates and it is closed here, explicitly.

**AC23e. A chunk failure offers RESUME, not restart.** The completed parts are
already in memory. `Retry from chunk 7` versus re-running 19 successful chunks
is the difference between ten seconds and four minutes, and it costs one array
index. Offer both `Retry from chunk 7` and `Start over`.

**AC24.** The transcript is retained on the take (`Take.transcript?: string`,
in-memory for the session) so a second draft, or a draft of a walkthrough of the
same source, does not pay for transcription twice. A walkthrough take does NOT
inherit its source's transcript - it has different narration and must be
transcribed on its own.

**AC25.** The draft prompt is told what it is reading: a transcript of a screen
recording made by an instructor for their students, and it must produce a
student-facing announcement (subject plus body), not a summary of the video.
It carries the same course context the recording tab already gathers from
`ta-rec-script-topic` / `ta-rec-script-objectives` / the title-card fields, the
way `gatherRecordingContext()` does for captions.

The drafting call is `draftAnnouncementAction(instruction, provider)`
(`src/app/actions/messaging.ts:405`), which takes ONE instruction string and
already folds in the user's saved writing style. The transcript, the context and
the standing instruction are composed into that string by a pure, testable
builder:

```ts
// src/lib/take-announcement.ts
export interface TakeAnnouncementContext {
  takeName: string;
  durationSec: number;
  topic?: string;
  objectives?: string;
  cardTitle?: string;
  cardSubtitle?: string;
}
export function buildTakeAnnouncementInstruction(
  transcript: string,
  context: TakeAnnouncementContext,
): string;
```

It must include the standing instruction verbatim so a prompt change is a
one-line diff in a tested module rather than an edit inside a component:
`Write a short announcement for students about this recording. Link the
recording's purpose to what they should do next. Do not summarize the video
minute by minute.`

**AC25b.** The transcript is TRUNCATED before it reaches the prompt, at a stated
cap. Precedent: `MODULE_MATERIALS_CAP = 8000` in
`src/lib/announcement-module-content.ts:30`. Use the same 8000-character cap,
truncate on a word boundary, and append ` [transcript truncated]` so the model
and the user both know. A 40-minute recording produces roughly 6000 words - well
past any sensible prompt - and letting it through unbounded is how a draft call
starts failing on `MAX_OUTPUT_TOKENS` for reasons nobody can see.

**AC25c. Review, edit and post happen in the Recording tab, and posting is
two-step.** After a draft returns, the tab shows an editable subject field and
body textarea, a course picker, and a post control that ARMS on the first click
and commits on the second, quoting exactly what will be sent.

- The arm/commit decision reuses `isConfirmArmed(armedFor: string | null,
  current: string)` and `mayPostCommit` (`postConfirmArming.ts:42,94`) - pure
  and already node-tested. Note that `postArmSignature` takes **one object**
  (`PostArmFields`), not four positional arguments as an earlier draft of this
  document implied: `postArmSignature({ kindId, artifactId, moduleChoice, newModuleName })`
  (`postConfirmArming.ts:69`).

**AC25c-bis. `postArmSignature` cannot express this post target, so it is
WRAPPED, not edited.** `PostArmFields` has no slot for a course. In the modal
the course is implied by the artifact row; here it is a separate picker the user
can change AFTER arming - so signing only the take id means: arm for course X,
switch the picker to course Y, confirm, and the post goes to Y under an arm
granted for X. That is precisely the failure the two-step exists to prevent.

Do not edit `postConfirmArming.ts` - it is tested, and appending a field changes
the signature string for every existing caller. Instead, a new pure module:

```ts
// src/app/components/recording/takeAnnouncementArming.ts
export function takePostArmSignature(
  takeId: string, hubCourseId: string, institution: string,
): string;
// => JSON.stringify([
//      postArmSignature({ kindId: "announcement", artifactId: takeId,
//                         moduleChoice: "", newModuleName: "" }),
//      hubCourseId, institution,
//    ])
```

Verbatim reuse of the inner term, explicit outer terms, node-testable, no
sibling file touched. Do NOT overload `moduleChoice` with a course id.

**The arming SIGNATURE is inverted relative to the modal's, deliberately, and
this must not be "corrected" back.** In `GeneratedPreviewModal`, text is
excluded from `postArmSignature` because the confirm panel quotes the SAVED
`generated_artifacts` row that `post()` will actually read, so an unsaved edit
cannot change what gets sent. Here there is no artifact row and no save step
(AC25d): the subject and body live in component state and are the exact strings
handed to `createAnnouncementAction`. So the confirm panel quotes the LIVE
editor text, and therefore **any edit after arming must disarm** - otherwise the
quote and the payload diverge. The signature includes the subject and body.
An implementer reading `postConfirmArming.ts`'s comments will find the opposite
rule stated for the modal; this paragraph is why.

**The `draftsDirty` rule is NOT reused, and an earlier draft of this AC was
wrong to require it.** "Dirty" in the modal means the editor disagrees with the
saved row - which is what makes a visible contradiction possible, and is what
`GeneratedPostSection.tsx:161-168` exists to prevent. With no saved copy there
is nothing to disagree with, so the rule would demand an "Apply" click whose
destination does not exist. Drop it. The disarm-on-edit rule above provides the
same guarantee for this shape.
- The post itself is `createAnnouncementAction(courseUrl, title, message,
  acronym, delayedPostAt?)`.
- The course list comes from `listCourseHubAction(): Promise<{ courses: Course[] } | { error: string }>`
  (`src/app/actions/course-hub-core.ts:12`), called directly. Do NOT use
  `useCoursesData()` - it additionally fires five list actions plus one
  notification action PER COURSE on mount, which is absurd for a recording tab.
- **Rows with `canvasUrl: null` are export-only tiles and cannot be posted to.
  Filter them out of the picker rather than letting the user pick one and fail.**
- `courseUrl` is `course.canvasUrl`; `acronym` is
  `course.institution ?? useInstitutionSelection().active`. Do not source the
  acronym from `useWorkflowOptions`'s `hubCourses` projection - it drops
  `institution` (`useWorkflowOptions.ts:144-160`).
- Every one of these actions returns `{ error }` rather than throwing, so
  `"error" in result` narrowing is mandatory at each call site.
- The selected course persists under `ta-rec-ann-course` (a course_hub row id),
  per the repo's persist-every-control rule.

**AC25f. There is a post-SUCCESS state, and it prevents a second post.** After
a successful post the panel switches to a success state naming the course and
subject, does not auto-close, and the take gains a `ghBadgeSuccess` badge
reading `Announcement posted`. Without this nothing stops a second, duplicate,
irreversible post - which after the confirm step is the largest remaining safety
gap in Group D.

**AC25e. "Save to drafts" is offered alongside posting**, via
`saveMessageDraftAction(summary, payload, workflowId?, workflowName?)`
(`src/app/actions/messaging.ts:218`) with
`payload = { kind: "announcement", title, body, courseUrl, hubCourseId, institution }`.
This is the repo's established review-later idiom and it is also the ONLY path
available when no course is linked. Known limitation to state in the Limits, not
to fix here: `postMessageDraftAction`'s announcement branch
(`messaging.ts:289-299`) drops `delayedPostAt`, so a draft always posts
immediately on approval.
- A draft with an empty subject or empty body cannot be posted. Canvas rejects
  both (`An announcement needs a title.` / `An announcement needs a message.`,
  `src/lib/canvas/announcements.ts:236-237`); refuse locally with the same
  meaning rather than shipping a round trip that fails.

**AC25d. `GeneratedPreviewModal` is deliberately NOT mounted here.** It is the
shipped preview/edit/confirm surface and reusing it was considered and rejected,
for reasons that must not be relitigated without new evidence:
- it consumes a `GenerationPreviewState` whose `versions` are real
  `generated_artifacts` rows, so a Recording-tab caller would have to write
  artifact rows purely to render a modal;
- posting through it (`postGeneratedArtifactAction`) requires a resolved
  `course_hub` row via `resolveGenerationCourseRow`, returning
  `courseNotLinked: true` otherwise;
- `generateFromSelectionAction` refuses an empty selection
  (`Select at least one item to generate from.`), and a transcript is not a
  selection of Canvas materials;
- its wiring test reads `ModulesView.tsx` as SOURCE TEXT and matches each
  capability against both a declared prop and a binding in that file, so adding
  a prop for a second caller breaks it.
What IS reused is the part that carries the guarantee: the pure arming and
dirty-state primitives. The visual vocabulary matches the rest of the Recording
tab (`styles.adaptPanel`, MUI `Button size="small"`), not a second modal.

### Group E - Reachability, information architecture, accessibility

**AC26. Both new flows must reach recordings made BEFORE this page load.**
Takes are in-memory object URLs created in `useRecorder`'s `onstop`, revoked on
unmount, never rehydrated - so after a reload the takes list is empty and both
"Talk through this" and "Draft announcement" are unreachable for anything
recorded earlier, even though the video is sitting in the Supabase library and
in the backup folder. Shipping it that way would be a capability that is dead
for everything older than the current tab.

`CaptionStudio` already solves exactly this: it accepts a session take, a
backup-folder video, or a library file. Required: **reuse that source-picking
pattern for both new flows** (`src/app/components/caption-studio/hooks/useVideoImport.ts`
is the precedent; library reads go through `listRecordingFiles` and
`downloadRecordingFile`, `src/lib/recording-files.ts:123,246`). If a wave has to
be cut short, the session-only limit must be stated **in the UI**, not only in
the Limits section: `Takes are kept for this session only - download them or use
them before you reload.`

**AC27. "Recording options" is reorganized; it is already overloaded.** That one
`<details>` today holds roughly sixteen controls and four hint paragraphs across
five unrelated concerns (mirror, three audio-processing checkboxes, countdown,
auto-stop, background plus image picker, bubble enable plus corner, the whole
Backup block, the whole Cards block). This feature adds three more. Required:

- **"Share system audio" moves next to the Microphone select in the main row**,
  rendered only when `source === "screen"`. It is a source decision, not an
  option, and it is the input the user most needs to see before pressing Share.
- **The bubble gets its own always-visible group in the main panel body**, shown
  when `source === "screen"`: `role="group" aria-label="Webcam bubble"` (idiom
  already at `AvatarStudioPanel.tsx:239`), holding the enable checkbox and -
  only when on - Shape, Size, Corner. This is the headline feature; it does not
  belong behind a disclosure the user has to know to open. Today `pipEnabled` is
  `disabled={source !== "screen"}` inside that disclosure, so a user who never
  expands it never learns the bubble exists.
- **What remains is subdivided** with the `styles.adaptPanelSubtitle` heading
  idiom the Backup block already uses (`SourceDevicesPanel.tsx:289`): *Audio
  processing*, *Timing*, *Appearance*, *Backup*, *Cards*.
- Revealing the conditional bubble selects must NOT move focus.
- **No new subdirectory under `recording/`** for any extracted component - trap
  2. A sibling file in the same folder is fine.

**AC28. Accessibility. None of this is covered by the suite** (node-env,
`src/**/*.test.ts`, no component ever renders), so anything not written here
will not exist. Inherited rules, named precisely:

*From `docs/focus-ring-acceptance-criteria.md`:*
- AC3 - new MUI `Button`/`Checkbox`/`TextField select`/`MenuItem` inherit the
  focus ring from the `MuiButtonBase` override in `theme.ts`. No per-control
  work; this is inheritance, not a task.
- AC2's rule exactly as that doc states it: an element that CONTAINS what takes
  focus needs the `--focus-ring-color` reset; an element that IS what takes
  focus needs nothing. That doc records this as the single most misread rule in
  its change, missed by three implementers. It will be misread again here.
- **AC3b applies and is the one that will be missed.** Both stages paint
  `#0f172a` as an INLINE style (`StagePanel.tsx:103,112`), which a CSS sweep
  structurally cannot see - exactly the case AC3b exists for. The record stage
  hosts no focusable child today; **the walkthrough stage will.** Any focusable
  control on that dark surface sets
  `--focus-ring-color: var(--focus-ring-on-navy)`, or the panel computes it with
  `needsOnNavyFocusRing()` from `src/lib/focus-ring-fill.ts`. Otherwise the ring
  lands at 2.21:1.

*From `docs/modal-focus-restoration-acceptance-criteria.md` - these apply even
though AC16b makes the walkthrough a pane rather than a dialog, because the
situation is identical:*
- AC3 - capture `event.currentTarget` synchronously at click time. Never
  `document.activeElement`, never after an `await`.
- Decision 5, the KEYED ref map - one walkthrough pane and one announcement
  panel serve N take rows. A single ref restores to whichever row was clicked
  most recently rather than the one that opened the surface. Key by take id.
- AC2/AC5, the degrade case - a take row can be DELETED while its walkthrough or
  announcement surface is open. Pass an ordered candidate list: the take's own
  button first, then the `TakesPanel` container, which outlives the row. Never
  `document.body`.

*From `docs/modal-dismissal-focus-acceptance-criteria.md`* - applies only if
anything here becomes a dialog, which is the strongest practical argument for
AC16b's pane. AC8's derived guard fires automatically on any new
`styles.previewBackdrop` or `role="dialog"`.

New, feature-specific:
1. Every new control carries a visible label: `Share system audio`,
   `Bubble shape`, `Bubble size`, `Bubble corner`, `Capture`, `Course`,
   `Subject`, `Message`.
2. **Recording state is announced.** `REC`/`PAUSED` is a bare `span.navBadge`
   today (`StagePanel.tsx:269`) with no live region, so a screen-reader user
   gets no signal that recording started, paused, auto-stopped, or that the
   screen share ended and finished the take (AC6). Add
   `role="status" aria-live="polite"` around a state-text node emitting
   `Recording`, `Paused`, `Recording stopped - saved as Take 3`,
   `Screen sharing ended - the take was finished and saved`.
   **The elapsed timer must be `aria-hidden` or outside that region** - a
   per-second counter inside a live region floods the screen reader
   continuously. This is stated because it is the obvious wrong implementation.
3. The 3-2-1 countdown, currently a purely visual overlay, announces through the
   same region.
4. Errors render in `role="alert"`. `styles.error` in `RecordingTab.tsx:144` is
   a plain `<p>` with no role, so a failure arriving while focus is elsewhere is
   silent today.
5. Focus moves to the surface heading (`<h2 tabIndex={-1}>`) or its first
   control on open, and is restored via the keyed map on close - even though
   these are not dialogs.
6. The takes overflow is a MUI `Menu` (arrow keys, Escape, type-ahead), never a
   custom popover. The bubble is configured by selects, not by dragging.
7. The confirm pattern is reused exactly as `GeneratedPostSection.tsx:210-225`
   does it: the consequence paragraph carries
   `role="status" aria-live="polite"` and a stable id, and the commit button
   carries `aria-describedby` pointing at it ONLY while armed. **The quoted
   subject and body sit OUTSIDE the live region** - wrapping them reads an
   entire announcement aloud the moment the panel arms.
8. A text equivalent for the bubble preview, since AC14's value is entirely
   visual: `Bubble: circle, medium, bottom left. The preview shows exactly what
   is recorded.`

**AC29. User-facing copy.** Sentence case, a hyphen rather than an em dash,
second person, consequence stated plainly, no emojis - matching the existing
strings (`No takes yet - record something.`, `Pick a microphone - audio-only
recording needs one.`). The strings fixed by this AC:

| Element | String |
| --- | --- |
| Bubble shape options | `Circle`, `Rounded square` |
| Bubble size options | `Small`, `Medium`, `Large` |
| Take row actions | `Talk through this`, `Draft announcement` |
| Overflow trigger | `More actions for {take name}` |
| Walkthrough heading | `Talk through {take name}` |
| Walkthrough capture | `Camera and microphone`, `Microphone only` |
| Keep source audio | `Keep the original recording's audio`, hint `Off by default - the original usually already has your voice in it.` |
| Walkthrough transport | `Start walkthrough`, `Pause`, `Resume`, `Stop and keep` |
| Walkthrough done | `Saved as {take name} - walkthrough.` |
| Announcement heading | `Announcement from {take name}` |
| Course hint | `Only courses linked to Canvas can be posted to.` |
| Post | `Post to Canvas` then `Confirm post` |
| Consequence (armed) | `Posting publishes this announcement to every student in {course} immediately - Canvas has no unpublished state for an announcement - and this app cannot recall or delete it afterward.` |
| Quote labels | `Subject that will be sent:`, `Body that will be sent:` |
| Success | `Posted to {course}. Students can see it now.` |
| Empty subject | `Enter a subject - an announcement cannot be posted without one.` |
| Empty body | `Enter a message - an announcement cannot be posted without one.` |
| Progress | `Preparing audio...`, `Transcribing - chunk 7 of 20`, `Writing the announcement...` |
| Share ended mid-record | `Screen sharing ended - the take was finished and saved.` |
| Chunk failure | `Transcription failed on chunk 7 of 20 - {reason}.` |
| Cancelled | `Transcription cancelled after 7 of 20 chunks. Nothing was kept.` |
| No speech | `No speech was found in this recording.` |
| Post failure | `Canvas refused the announcement - {reason}. Nothing was posted.` |

## Limits - what this feature does NOT do, and what was never observed

Five AC lines above require entries here. An entry that only lists successes is
a trap for the next session, so these are stated plainly.

1. **Mixed audio is un-attenuated and can clip** (AC1c). Source nodes connect to
   the destination at unity gain with no `GainNode`. A hot microphone plus loud
   system audio can exceed full scale. Expected, unmeasured behaviour - no gain
   value was chosen because any value would have been a guess.
2. **During a walkthrough you cannot hear what you are narrating over** (AC19b).
   The destination node is never connected to `ac.destination`, deliberately, so
   nothing reaches the speakers and the microphone cannot re-capture the
   playback. The cost is no monitoring. If monitoring is ever added it must be
   headphones-only and behind its own control, never a side effect of the mix.
3. **Transcript chunk boundaries cut words** (AC22d). Chunks are contiguous with
   no overlap and no stitching heuristic. The transcript is good enough to write
   an announcement from and is NOT offered as a caption track - Caption Studio
   remains the captioning surface.
4. **A draft failure loses the provider's HTTP body** (AC23). `describeLlmFailure`
   and `describeEmptyLlmText` take an `LlmResult`, which never crosses the server
   action boundary: `draftAnnouncementAction` returns `{title, message} | {error}`
   and `transcribeLiveAudioAction` discards `result.body` before any client
   exists. Improving that inside the action, so every caller benefits, is a
   correctly-scoped follow-up with its own AC.
5. **A scheduled announcement cannot survive a draft round trip** (AC25e).
   `postMessageDraftAction`'s announcement branch (`messaging.ts:289-299`) drops
   `delayedPostAt`, so a draft always posts immediately on approval.
   Pre-existing; not introduced here.
6. **The real-time audio fallback is capped at 20 minutes, and refuses above
   it.** AC22a's rotation bounds the SIDECAR path to about one minute of decoded
   audio at a time, but a take with no sidecar - every pre-existing take, every
   library file, and every walkthrough output - goes through `extractAudioOnly`
   and then a SINGLE `decodeAudioData` call, which decodes the entire buffer at
   once. At 48 kHz stereo that is `durationSec * 48000 * 2 * 4` bytes of
   intermediate PCM before the resample: about 23 MB per minute, so 20 minutes
   is roughly 460 MB in one allocation and 40 minutes is about 920 MB. Rather
   than let the tab die part-way through, `REAL_TIME_MAX_SECONDS` refuses
   up-front with a message that names the way out: a take recorded in this
   session carries its own audio segments and skips the path entirely at any
   length. **The cap is a real functional limit** - a long recording that only
   exists in the library cannot currently be drafted from. The clean fix is to
   stop round-tripping through WAV at all (trap 12: Gemini now accepts
   WebM/Opus directly), which is a follow-up with its own AC.
7. **Take names collide.** `Take ${takesLength + 1}` uses the in-memory count, so
   deleting a take and recording again produces two takes with the same name and
   two identically named library rows. A walkthrough named
   `<source> - walkthrough` inherits any collision, and there are now three
   derivation paths (`(audio)`, `- walkthrough`, and the announcement panel
   naming a take to the user) where it is visible. Pre-existing; not fixed here.
8. **NOTHING in this feature was run in a browser.** vitest here is node-env,
   collects only `src/**/*.test.ts`, and renders no component - there is no
   `MediaRecorder`, no `getDisplayMedia`, no `AudioContext` and no canvas in the
   test environment. Every claim about what the bubble looks like, whether the
   preview composites, whether a real screen share records the mic, and every
   accessibility and keyboard claim, is a READING. The pure helpers
   (`mixAudioTracks` with an injected context, `bubbleRect`, `coverCrop`,
   `planTranscriptChunks`, `sliceMonoSamples`, `joinTranscriptChunks`,
   `truncateTranscriptForPrompt`, `buildTakeAnnouncementInstruction`,
   `takePostArmSignature`) are the only parts genuinely covered, and they were
   shaped that way on purpose. **No announcement was posted to a real Canvas
   course, and no code path was exercised against a real screen share.**
9. **The VERIFY list below stands unresolved** except where a source settled it.
   Confirmed by documentation: a near-zero-size `<video>` keeps supplying frames
   to `drawImage` (nothing ties frame supply to rendering; the `display:none`
   prohibition is justified by an iOS/WebKit buffer-retention hazard rather than
   frame starvation); two `MediaRecorder`s on streams sharing a track are
   permitted; `createMediaElementSource` routes audio into the graph and reaches
   the speakers only via `context.destination`; and
   `new AudioContext({ sampleRate })` does resample in `decodeAudioData`. Still
   unverified: whether Chrome's autoplay gate accepts a `resume()` issued from a
   timer after an earlier gesture; whether a MUTED element feeds silence into the
   graph (asserted in a `strip-audio.ts` comment, uncited); the CPU cost of the
   second Opus encode at 1080p; `decodeAudioData`'s resampling QUALITY into a
   16 kHz context; and real pause/resume sync on a canvas captureStream - for
   which the spec is weaker than an earlier draft of this document claimed. Pause
   is documented to "stop gathering data", not to elide the interval, and there
   are engine bugs of exactly this shape (Firefox 1354457 freezes video for the
   pause duration; Chromium 40703184 mis-durations files when the surface stops
   producing frames). All checked 2026-08-30.

## Traps (this repo has bitten people on all of these)

1. **`recording-split.structure.test.ts` pins an exact 36-entry list of
   `ta-rec-*` keys** (`:127-164`) and asserts `toEqual`. Every new key here -
   `ta-rec-screen-audio`, `ta-rec-pip-shape`, `ta-rec-pip-size`,
   `ta-rec-walk-mode`, `ta-rec-walk-keep-source-audio`, `ta-rec-ann-course` -
   must be added to that array IN THE SAME COMMIT, in sorted order. That takes
   the array from 36 entries to 42.
2. **The same test caps every file in `src/app/components/recording/` at 1000
   lines, and its `readdirSync` is NON-RECURSIVE.** A new subdirectory under
   `recording/` escapes both the cap and the key scan. Do not create one.
   `useRecorder.ts` is at 601 lines and is the file most at risk.
3. **The key-scan regex is `/ta-rec-[a-z-]*/g` over RAW TEXT including
   comments.** A comment mentioning `ta-rec-pip-*` injects the bogus key
   `ta-rec-pip-` and fails the canary. Do not write a `ta-rec-` prefix in a
   comment, and never put a digit in a key.
4. **`recording_files.kind` is a six-place contract** (survey-confirmed; the
   REGRESSION.md entry titled "five-place" is out of date - the set has since
   grown to `recording | captioned | narrated | bundle | file | sample | avatar`).
   Adding a kind requires: the DB CHECK migration, `RecordingFile.kind`,
   `saveRecordingFile`'s inline `meta.kind` union (and
   `recording-files.kinds.test.ts:71-91` asserts there are EXACTLY TWO literal
   unions in that file, so "tidying" them into one named type breaks the test),
   all three interfaces in `types.tables-b.ts:292,310,328`,
   `FILES_FILTER_KIND_OPTIONS`, and `kindLabels`/`getDisplayKind`.
   **Decision: do not add a kind.** Walkthroughs save as `recording`, which is
   also what `handleExtractAudio`'s derived audio take already does.
4b. **A new migration must be numbered above `20261010000000`**, not dated
   today. Migration numbers here are a monotonic counter that has run ahead of
   the calendar; a `20260830...` file sorts before dozens of applied migrations
   and `supabase db push` rejects it. (Only relevant if trap 4's decision is
   ever reversed - this feature ships no migration.)
5. **Supabase typed selects collapse to `never`** - map rows through an
   explicitly typed mapper (`mapRecordingFile`).
6. **`"use server"` files export only async functions** - no type re-exports.
   `next build` is the only gate that catches a violation.
7. **Never `git stash`.** One agent's stash reverts every sibling's work.
8. **No emojis.** `src/lib/no-emojis.test.ts` owns the rule.
9. **MediaRecorder records only the first audio track** - the root of D1. Any
   future "just add the track" shortcut reintroduces it.
10. **A NaN or zero dimension reaching `drawImage` throws inside the frame
    ticker**, which silently ends compositing mid-recording. Guard the bubble
    draw.
11. **CORRECTED - `extractAudioOnly` almost certainly does NOT play out loud,
    and an earlier draft of this document said it did.** It sets
    `v.muted = false`, which looks like audible playback but is not: per the Web
    Audio spec, `createMediaElementSource` re-routes the element's output INTO
    the graph, and audio reaches the speakers only through a path to
    `context.destination`. `extractAudioOnly` (`strip-audio.ts:157-158`) and
    `renderNarratedVideo` (`narrate-video.ts:143-144`) both connect solely to a
    `MediaStreamAudioDestinationNode`. `v.muted = false` is there because a
    MUTED element feeds SILENCE into the graph - not because anyone wanted
    sound. **VERIFY in Chrome before shipping any string that claims otherwise.**
    What remains true, and is the actual justification for AC22a, is that
    `extractAudioOnly` runs in WALL-CLOCK REAL TIME. It also drives progress
    from a plain `setInterval` rather than `startFrameTicker`, so a backgrounded
    tab throttles it.
12. **`transcribeLiveAudioAction` accepts `audio/wav` ONLY - but this is an APP
    constraint, not a provider one, and the distinction matters.**
    `src/lib/live-class/wav.ts:1-6` records it as a vendor fact and that is now
    out of date: Gemini's current audio documentation lists `audio/wav`,
    `audio/mp3`, `audio/aiff`, `audio/aac`, `audio/ogg`, `audio/flac` AND
    WebM/Opus (ai.google.dev/gemini-api/docs/audio, checked 2026-08-30). What
    forces the WAV round trip is that the action hardcodes
    `inlineData.mimeType = "audio/wav"`.
    Nothing changes in this feature - audio still goes `decodeAudioData` ->
    `downsampleToMono` -> `encodeWav`. But the premise is load-bearing for the
    entire sidecar-rotation and decode design, so a future reader must not treat
    it as immovable: **sending Opus straight through would delete the decode
    memory problem entirely.** That is a follow-up with its own AC, not a rider.
12b. **Gemini's inline cap is 20 MB per request and 32 tokens per second of
    audio** (same source, same date). A 20-minute take is ~38,400 audio input
    tokens; AC22b's 60-second chunk sits ~7x under the provider cap. The binding
    constraint is Vercel's 4.5 MB body limit, not the provider. Confirmed
    conservative - do not raise the chunk size on provider limits alone.
12c. **`gemini-3.1-flash-lite` is a CURRENT stable model id** (checked
    2026-08-30). What is deprecated is the separate
    `gemini-3.1-flash-lite-preview`. Do not "update" the model id here.
13. **`callLlm` silently rewrites `generationConfig` on Gemini 3 models**
    (`llm.ts:78-109`): a `temperature < 1` is DELETED unless
    `GEMINI_ALLOW_LOW_TEMPERATURE=1`, and `maxOutputTokens` below 512 is RAISED.
    Do not claim determinism from `temperature: 0`.
14. **`{ ok: true, text: "" }` is a real LLM outcome** (MAX_TOKENS or a safety
    block), not a transport failure. Use `describeEmptyLlmText`.
15. **The preview shows the RAW stream today; the pipeline canvas is never
    displayed.** `startPipeline()` is called only from `startRecording`
    (`useRecorder.ts:417`), so the bubble, background effect and annotations
    cannot be positioned before a take begins. This is the whole substance of
    AC14 and it is a real behaviour change, not a tidy-up.
16. **The title/closing card branch early-returns BEFORE the bubble draw**
    (`useCanvasPipeline.ts:104`), so the bubble and annotations vanish during
    cards. That is existing behaviour; do not "fix" it as a side effect.
17. **PiP is screen-source-only and triple-gated**: `usePipWebcam.ts:54`, the
    checkbox `disabled` at `SourceDevicesPanel.tsx:262`, and a draw-time
    `sourceRef.current === "screen"` check at `useCanvasPipeline.ts:119`. The
    walkthrough needs the bubble over a source that is NOT `"screen"`, so all
    three gates must be widened together - missing one produces a bubble that
    is acquired but never drawn, or drawn but never acquired.
18. **Take names collide.** `Take ${takesLength + 1}` uses the in-memory count
    captured in the `onstop` closure (`useRecorder.ts:450`), so deleting a take
    and recording again produces two takes with the same name and two
    identically named library rows. A walkthrough named `<source> - walkthrough`
    inherits this; do not make it worse by deriving from the count.
19. **Library-save failures are silent** - `saveTakeToLibrary` only sets a badge
    and `console.error`s, never `setError` (`useTakes.ts:143-146,161-164`).
    Any new save path should be at least as visible, and ideally more.
20. **`mapRecordingFile` is module-private** and writes need
    `.from("recording_files") as any` with an eslint-disable. A new write helper
    belongs INSIDE `recording-files.ts`, not in a new module that cannot import
    the mapper.
21. **Do not import types from a `"use server"` file.** `lms-generation.ts:174-184`
    records a real deploy break: a type re-export is erased by Next and fails
    `next build` while tsc, eslint and the unit suite all pass.

## Architecture (DEV_LOOP step 4 output)

### New modules

| File | Owns |
| --- | --- |
| `recording/audio-mix.ts` | AC1 mixing, injectable for node tests |
| `recording/audio-sidecar.ts` | AC22a rotating audio-only recorder |
| `recording/bubble-geometry.ts` | Pure bubble math (AC10) |
| `recording/bubble-draw.ts` | THE one bubble compositor, used by both surfaces |
| `recording/useWalkthrough.ts` | Group C state machine and capture |
| `recording/WalkthroughPanel.tsx` | Group C surface (AC16b's pane) |
| `recording/useTakeAnnouncement.ts` | Group D pipeline, review and post state |
| `recording/TakeAnnouncementPanel.tsx` | Group D surface |
| `recording/takeAnnouncementArming.ts` | AC25c-bis wrapper |
| `src/lib/take-transcript.ts` | `planTranscriptChunks`, `sliceMonoSamples`, `joinTranscriptChunks` |
| `src/lib/take-announcement.ts` | `buildTakeAnnouncementInstruction`, `truncateTranscriptForPrompt` |

`sliceMonoSamples(mono: Float32Array, sampleRate: number, plan: TranscriptChunkPlan): Float32Array`
is an addition to AC22b's contract: without it the slice arithmetic lives inline
in a hook and is untestable, which is the same reason `bubbleRect`/`coverCrop`
were extracted. It clamps to `[0, mono.length]` and returns an empty array for
an empty range. It is needed only on the `extractAudioOnly` fallback path, since
on the sidecar path the segments ARE the chunks.

### Wave 0 - orchestrator, before dispatch

`recording/types.ts`: `Take` gains four optional fields - `audioSegments?: Blob[]`,
`transcript?: string`, `sourceTakeId?: string`, `sourceTakeName?: string`. All
optional, so nothing breaks and C and D compile against them immediately. Not an
agent assignment: four fully-specified lines, and splitting them would
manufacture a file conflict between C and D.

### Wave 1 - four concurrent agents on disjoint file sets

**Agent A - screen audio, mixing, capture lifecycle, sidecar.**
Owns `audio-mix.ts`, `audio-mix.test.ts`, `audio-sidecar.ts`, `useRecorder.ts`.
Codes AC1-AC6 and AC22a. Reads `settings.shareSystemAudio` (B declares it) and
adds `screenAudioNotice: string | null` to `UseRecorderReturn` (B renders it).
Owns exactly three of AC14's lifecycle edits: start the pipeline at the end of
`startPreview` when the source is screen; do not stop it in `recorder.onstop`
for that source; leave `stopEverything`'s stop alone. `useRecorder.ts` is 601
lines and the delta is +130 to +170 - **if it passes ~850, stop and report
rather than exceed** the 1000-line cap.

**Agent B - the bubble, its settings, the live preview.**
Owns `bubble-geometry.ts`, `bubble-geometry.test.ts`, `bubble-draw.ts`,
`usePipWebcam.ts`, `useCanvasPipeline.ts`, `useRecordingSettings.ts`,
`SourceDevicesPanel.tsx`, `StagePanel.tsx`. Codes AC7-AC14 and AC5's control.
Deletes the inline PiP block (`useCanvasPipeline.ts:117-167`) in favour of one
`drawWebcamBubble` call, and REMOVES the `sourceRef` prop - trap 17's third
gate now lives entirely in `pipEnabledRef`, which is redefined as "the bubble is
live and should be drawn" rather than "the checkbox is ticked". B will see a
transient tsc error at `RecordingTab.tsx`; it reports it and does not fix it.

**Agent C - walkthrough.** Owns `useWalkthrough.ts`, `WalkthroughPanel.tsx`.
Codes AC15-AC20. Imports `drawWebcamBubble` and `BUBBLE_SIZE_FRACTIONS` from B,
`ensureFiniteDuration` from `@/lib/caption-burn`, `startFrameTicker` from
`@/lib/frame-ticker`. Calls `addRecordedTake` exactly once per finished
walkthrough and creates no second save path. Builds its OWN AudioContext graph -
see the deviation note below.

**Agent D - announcement.** Owns `src/lib/take-transcript.ts{,.test.ts}`,
`src/lib/take-announcement.ts{,.test.ts}`, `takeAnnouncementArming.ts{,.test.ts}`,
`useTakeAnnouncement.ts`, `TakeAnnouncementPanel.tsx`. Codes AC21-AC25f. Calls
all four server actions exactly as they ship and **modifies none of them**.
Fully independent of A, B and C - its worst case (no sidecar) already works
through `extractAudioOnly`.

### AC26 is Agent E's, and this is why

Both new surfaces take a `Take`. A library file is not a `Take`. The cheapest
correct seam is therefore **not** to teach Agents C and D about the library, but
to have Agent E construct a `Take`-shaped object from a library file -
`downloadRecordingFile` -> `URL.createObjectURL(blob)` -> a `Take` with the
file's name, mime and duration - and hand it to the existing
`openWalkthrough(take)` / announcement entry points unchanged. C and D need no
knowledge of where the bytes came from, and neither signature moves.

This matters more than it looks, because of the workflow it unblocks: record ->
adjust speed -> caption -> narrate over the captioned video, with every step
saving to the Files tab and the next step reading it back. **Step 4 consumes a
LIBRARY file, not a session take.** Without AC26 the chain breaks at that joint
even though every individual feature passes its own tests - which is exactly the
"ships dead with every gate green" failure this repo has recorded before.

E must trace that joint by hand and report it: pick a captioned library file,
open the walkthrough on it, confirm the source plays and the bubble draws.

### Wave 2 - Agent E, integration

Owns `RecordingTab.tsx`, `TakesPanel.tsx`, `useTakes.ts` (only if a prop
requires it), `recording-split.structure.test.ts`. Threads `active`/`forceOn`
into `usePipWebcam`, drops the `sourceRef` argument, mounts both new panels,
adds the six `localStorage.setItem` writes, and bumps `expectedKeys` 36 -> 42 in
`Array.prototype.sort()` order (`-` is 0x2D, so it sorts before any letter):
`ta-rec-ann-course` first; `ta-rec-pip-shape` and `ta-rec-pip-size` after
`ta-rec-pip-corner`; `ta-rec-screen-audio` after `ta-rec-res`;
`ta-rec-walk-keep-source-audio` and `ta-rec-walk-mode` last.

**No file appears in two allow-lists.** The two genuine cross-agent seams -
A's three lifecycle edits inside `useRecorder.ts`, and A reading a field B
declares - are named in both directions rather than split down the middle of a
file. Every brief carries: read the AC in full first; never `git stash`; no
emojis; no subdirectory under `recording/`; no `ta-rec-` prefix inside a
comment; and if `tsc` reports a sibling's module missing, **report it, do not
create it or inline a copy**.

### Gating the waves

`npx vitest run` will be RED across the whole of wave 1 and that is expected:
the key canary asserts `toEqual` in both directions, so there is no ordering
that keeps it green until E bumps the array. Gate wave 1 with
`git status --short` against the assignments plus per-file `tsc` and `eslint`.
Only after E do the three real gates mean anything for this group.

### Deviations from the AC, deliberately taken

**AC17's "reuse the same canvas pipeline" is narrowed to "reuse the same bubble
draw".** Reusing `useCanvasPipeline` wholesale would force the walkthrough to
supply `applyBackgroundEffect`, `overlayCanvasRef`, `strokesRef`,
`redrawOverlay` and five card refs as no-op stubs, and would couple it to the
card early-return (trap 16). The guarantee AC17 actually wants - one bubble,
identical in both places - is delivered by `bubble-draw.ts`. Flagged here so the
step-10 reviewer reads it as intent, not drift.

**The walkthrough does not call `mixAudioTracks`.** Its input is
`MediaStreamTrack[]`; the source take's audio lives in an `HTMLMediaElement`.
`createMediaElementSource` is the shipped precedent (`narrate-video.ts:143`), so
C builds one graph with one optional branch rather than one code path in one
mode and a different one in the other. Implementer note that will otherwise
bite: `createMediaElementSource` may be called **once per element per context**
and permanently reroutes that element - so the walkthrough `<video>` is created
fresh per session and the context is closed on teardown.

**`renderNarratedVideo` is NOT generalized.** It shares five surface mechanics
with the walkthrough and nothing structural: it is a fire-and-forget async
function playing a source start to finish with pre-decoded clips scheduled on
`ac.currentTime`, while the walkthrough needs a live mic, a user-driven
transport that is also the recorder transport, a visible canvas, and a bubble.
Generalizing it would leave nothing of the original signature and would hand
SlideStudio four parameters it never uses. Both `narrate-video.ts` and
`strip-audio.ts` have **no test files**, so a refactor there is unguarded, and
this repo's recorded lesson is that consolidating two implementations disarms
the test that compared them. Extracting the shared mechanics is a legitimate
follow-up, but as a guard-before-migration job with a frozen oracle - not a side
effect of this feature.

### The VERIFY list - browser behaviour nothing here can test

Every item below is a reading, not a result. The suite renders nothing and has
no `MediaRecorder`, `getDisplayMedia`, `AudioContext` or canvas.

1. **A near-zero-size `<video>` keeps supplying live frames to `drawImage`.**
   AC14 hides the source element behind the canvas; it must stay mounted with
   `position:absolute; width:1px; height:1px; opacity:0` and **never
   `display:none`**, or the canvas draws a frozen or blank frame and the
   recording is ruined with no error.
2. **A second `MediaRecorder` on a stream sharing the mixed track starts**, and
   its CPU cost during a 1080p screen capture is acceptable.
3. **`MediaRecorder.pause()/resume()` on a canvas-captureStream keeps the output
   in sync.** Per spec the paused interval is not recorded, which is what AC18
   wants, but Chromium has a long history of WebM timestamp trouble across
   pause/resume. If it desyncs, **disable pause during a walkthrough** rather
   than shipping a desynced artifact - decided now so nobody invents a third
   option under time pressure.
4. **`createMediaElementSource` does not reach the speakers** (trap 11, AC19b,
   AC22a's string all depend on this).
5. **A take started via the 3-2-1 countdown has audio** (AC1b's suspended-context
   risk).
6. **`new AudioContext({ sampleRate: LIVE_SAMPLE_RATE })` resamples in
   `decodeAudioData`** at acceptable quality.

### Two further AC14 consequences, recorded as intentional

**Annotations render twice.** The pipeline composites the overlay canvas into
the frame (`useCanvasPipeline.ts:169-172`) and the overlay also stays in the DOM
on top for pointer events. Same strokes, same coordinates, so it is visually
identical - but it is a real double-draw, recorded here so it is not
"discovered" later as a defect.

**AC18's duration invariant needs UI constraints the AC omitted.** Seeking
destroys it outright, so the walkthrough `<video>` renders with **no `controls`
attribute**, a custom play/pause only, a read-only progress bar, and
`playbackRate` locked at 1. And the output's own duration is unmeasurable
anyway - a MediaRecorder WebM reports `Infinity` until seeked - so the take's
`durationSec` comes from `ensureFiniteDuration` on the SOURCE, not the output.

## Verification

```
npx tsc --noEmit
npx eslint <touched files>
npx vitest run
npx next build
```

The build gate is the compile line only; the env-dependent prerender tail fails
locally and that is expected.

**What the suite cannot prove here:** vitest is node-env and collects only
`src/**/*.test.ts`. No component renders. There is no `MediaRecorder`, no
`getDisplayMedia`, no `AudioContext`, and no canvas in the test environment.
Every claim about what the bubble LOOKS like, whether the preview shows it, and
whether a real screen share records the mic is a READING, not a test result. The
pure helpers (`mixAudioTracks` with an injected context, `bubbleRect`,
`coverCrop`) are the only parts genuinely covered, and they are shaped that way
on purpose.
