# Change a recorded video's speed, and save the result to the Files tab

Status: DRAFT - step 1 (acceptance criteria) of `docs/DEV_LOOP.md`. Reuse survey
complete. Written while four implementer agents are mid-wave on
`src/app/components/recording/*` and `src/lib/*` for
`docs/screen-recording-and-walkthrough-acceptance-criteria.md`; **no source file
was touched to write this document**, and every ownership constraint that
document records is honoured below.

Opened: 2026-08-30

## The request

The owner wants a four-step chain, each step's output feeding the next:

1. Record a screen video of the upcoming week's module. *(being built now)*
2. **Watch it back, choose a speed multiplier - faster or slower - and save the
   sped-up or slowed-down video to the Files tab.** *(this document)*
3. Apply captions to that video, save to Files. *(ships today as Caption
   Studio)*
4. Play the captioned video while recording narration over it, save to Files.
   *(being built now as the walkthrough)*

This document specifies step 2 only, but it is written against the whole chain,
because a step 2 whose output step 3 cannot see is worthless.

## The chain, traced concretely

**Joint 2 -> 3 works today and needs no new code.**

`saveRecordingFile` (`src/lib/recording-files.ts:68`) writes a row that
`listRecordingFiles` (`:123`) returns. Caption Studio's source picker calls
`listRecordingFiles` in `useVideoImport`
(`src/app/components/caption-studio/hooks/useVideoImport.ts:77` and `:93`) and
renders every row it gets under **"From the Files tab"**
(`src/app/components/caption-studio/VideoSource.tsx:79-111`), each with an
Import button wired to `handleImportLibraryVideo` (`useVideoImport.ts:113`).
**There is no kind filter and no mime filter on that list.** So a speed-adjusted
video saved as any kind at all appears there.

Two frictions at this joint, both real, neither fatal:

- **The library list is fetched exactly once.** The effect at
  `useVideoImport.ts:86-111` is guarded by `libraryVideos === null`, and
  `RecordingTab`'s inner views all stay mounted behind `display:none`
  (`docs/REGRESSION.md`, "2026-07-22 - Recording surface", check 1). So a file
  saved *after* Caption Studio's first mount does **not** appear until the user
  presses the **Refresh** button at `VideoSource.tsx:90-92`. AC14 below closes
  this from step 2's side with a sentence of copy rather than by editing Caption
  Studio.
- **`VideoSource.tsx:96` mislabels any unrecognised kind.** It is a three-way
  ternary - `recording` -> "Recording", `narrated` -> "Narrated", **everything
  else -> "Captioned"**. A `bundle`, `file`, `sample` or `avatar` row already
  reads "Captioned" in that picker today. This is the single strongest argument
  against inventing a new `kind` for step 2 (see AC7): a new kind would be
  labelled "Captioned" at the exact joint this chain depends on.

**Joint 3 -> 4 is the one to watch. It is assigned, but it does not exist yet.**

Step 4 consumes a **library file** (`kind: "captioned"`, written by
`src/app/components/caption-studio/hooks/useBurnCaptions.ts:175`), not a session
take. The walkthrough surface, per AC16b of the in-flight document, is reached
only from a take row and is keyed by `walkthroughTakeId`. Session takes are
in-memory object URLs that vanish on reload. So without a library source path
the walkthrough cannot open a captioned file at all, and the chain breaks at
that joint with every gate green.

That is AC26 of the in-flight document, and as of this writing it **is**
assigned - to Agent E in wave 2, which constructs a `Take`-shaped object from a
library file (`downloadRecordingFile` -> `URL.createObjectURL` -> a `Take`) and
hands it to the unchanged `openWalkthrough(take)` entry point. **It is not built
yet.** Nothing in this document can verify it. Whoever runs step 8's
reachability audit on that wave must trace it by hand: pick a captioned library
file, open the walkthrough on it, confirm the source plays.

**The consequence for step 2:** save the output as `kind: "recording"` (AC7).
Agent E's library-to-`Take` shim will be written against whatever the Files tab
holds; a kind it has never heard of is exactly the thing that gets filtered out
by a picker written a week earlier.

## Where step 2 lives, and why not the Files tab

**Decision: a fifth inner view of the Recording tab, labelled "Change speed",
placed second in the strip - Record, Change speed, Caption a video, Narrate a
deck, Avatar. Not the Files tab.**

The deciding fact is not click cost. It is this:

```
src/app/page.tsx:394-396   <div style={{display: ... "none"}}><RecordingTab .../></div>
src/app/page.tsx:398       {activeTab === "files" && <FilesTab onOpenWorkflow={openWorkflow} />}
```

`RecordingTab` is **always mounted** - the comment above it at `page.tsx:392-393`
says why: "so an in-progress recording survives switching subtabs or top-level
tabs". `FilesTab` is **conditionally mounted**. Switching to any other top-level
tab unmounts it and kills anything running inside it.

A speed re-encode runs in wall-clock real time - five to eighty minutes (see
AC1's table). Putting it in a surface that unmounts on a tab switch would lose
the whole job silently, mid-encode, with no error and no partial file. Every
other long real-time re-encode in this repo already lives in the always-mounted
`RecordingTab`: Caption Studio's burn (`useBurnCaptions.ts`) and Slide Studio's
`renderNarratedVideo`. **`stripAudio` in `FilesTab` is the odd one out, and it
carries this exact latent defect today** - a strip-audio of a 40-minute video
dies on a tab switch. That is a pre-existing bug found in passing; it is
reported, not fixed here.

The rest of the case, in order of weight:

1. **It needs a source picker, and one already exists.** `useVideoImport`
   (session take / backup folder / library file) is the shipped answer to
   exactly the reachability problem AC26 of the sibling document exists for.
   Reusing it means step 2 can act on anything - a take from this session, a
   file recorded last week - on day one.
2. **It puts step 2 physically next to step 3.** The tab strip becomes the
   workflow, read left to right.
3. **It is never dead.** AC16b of the sibling document refuses a fifth tab-strip
   entry for the walkthrough because that surface has no subject until a take is
   clicked. A speed view with its own source picker always has a subject. The
   refusal there does not transfer here, and this paragraph exists so it is not
   quoted as though it did.
4. **The "watch it back" half comes free.** The picker already produces an
   object URL; a `<video controls>` on it is the playback surface the request
   asks for, and setting `playbackRate` on that same element previews the chosen
   speed live, before the user commits five to eighty minutes (AC10).

Click cost, honestly: from the end of a recording the user is already on the
Recording tab, so it is *Change speed -> Import (the session take is the first
row) -> Save at 1.5x* = three clicks, with the rate persisted from last time.
The Files-tab route is *Files -> find the row -> Speed -> rate -> Save* = four
or five, plus the unmount hazard. The Recording tab wins on both counts.

**Sequencing constraint, not negotiable:** `RecordingTab.tsx` is Agent E's file
in the in-flight wave 2. The four lines this feature needs there (AC12) must be
written **after** that wave lands. Everything else in this document is in new
files that collide with nobody.

## What already exists (do not rebuild)

| Need | Reuse | Where (file:line) |
| --- | --- | --- |
| Play a Blob through a canvas and re-record it | `stripAudio(source, onProgress?)` | `src/lib/strip-audio.ts:8-112` |
| Route the source element's own audio into the recorded stream | `renderNarratedVideo`'s `mode: "mix"` branch | `src/lib/narrate-video.ts:101-102`, `:142-145`, `:161-163` |
| A tick source that survives a hidden tab | `startFrameTicker(fps, onTick)` | `src/lib/frame-ticker.ts:11` |
| Duration of a webm whose metadata says `Infinity` | `ensureFiniteDuration(video)` | `src/lib/caption-burn.ts:234` |
| Waiting for `loadedmetadata` with a timeout | `awaitVideoMetadata(video, timeoutMs?)` | `src/lib/caption-burn.ts:115` |
| Recorder mime fallback chain for video | the `mimeTypeCandidates` loop | `src/lib/strip-audio.ts:51-58` |
| Saving a derived video to the library | `saveRecordingFile(supabase, userId, blob, meta)` | `src/lib/recording-files.ts:68` |
| The "derive a new file from an existing one, name it, re-save it" precedent | `handleStripAudio` | `src/app/components/FilesTab.tsx:301-321` |
| Source picking - session take / backup folder / library file | `useVideoImport()` | `src/app/components/caption-studio/hooks/useVideoImport.ts:7` |
| The source-picker UI, including its `1. Video source` heading | `VideoSource` | `src/app/components/caption-studio/VideoSource.tsx:31` |
| An inner view of the Recording tab, kept mounted behind `display:none` | the `recView` state, its persist effect, and the tab strip | `src/app/components/RecordingTab.tsx:31-39`, `:134-137` |
| Reading bytes back out of a `Take` | `await (await fetch(take.url)).blob()` | `src/app/components/caption-studio/hooks/useVideoImport.ts:36` |
| Downloading a library file's bytes | `downloadRecordingFile(supabase, file)` | `src/lib/recording-files.ts:246` |
| `m:ss` formatting | `fmtTime(sec)` | `src/app/components/caption-studio/utils/formatting.ts:1` |
| A labelled cluster of related controls | `<div role="group" aria-labelledby=...>` | `src/app/components/recording/AvatarStudioPanel.tsx:239` |
| Panel and button vocabulary for this tab | `styles.adaptPanel`, `styles.ghPanel`, `styles.adaptPanelSubtitle`, `styles.fieldHint`, `styles.error`, MUI `Button size="small" variant="outlined"` | `src/app/page.module.css`; every panel under `recording/` |
| Kind labels, badges and the Files filter | `kindLabels`, `getDisplayKind`, `FILES_FILTER_KIND_OPTIONS` | `src/app/components/files/helpers.ts:13`, `:21`; `src/app/components/files/filter-sort.ts:15` |

**`fmtTime` is the third identical `m:ss` formatter in this repo** - the others
are `fmt` at `src/app/components/files/helpers.ts:4` and `fmt` at
`src/app/components/recording/types.ts:42`. Do not add a fourth. Consolidating
the three is a legitimate follow-up and explicitly **not** part of this feature.

### Is this a new function, or a parameter on an existing one?

**A new function in a new file: `src/lib/video-speed.ts`.** Not a parameter on
`stripAudio`, and not a generalisation of `renderNarratedVideo`.

- `stripAudio` has **no audio path at all** - it records
  `canvas.captureStream(30)` and nothing else (`strip-audio.ts:61-62`). A
  sped-up lecture with no audio is useless, so this feature needs the audio
  branch `stripAudio` does not have. Adding a rate parameter would mean adding
  an entire audio graph to a function whose name and contract are "strip the
  audio".
- `renderNarratedVideo` has the audio branch but is shaped around scheduling
  pre-decoded clips on `ac.currentTime` (`narrate-video.ts:188-202`). The
  in-flight sibling document has **already recorded the decision not to
  generalise it** ("`renderNarratedVideo` is NOT generalized", its Deviations
  section). Reversing that decision mid-wave, from a different document, is
  exactly the kind of cross-document drift step 10a exists to catch.
- **Neither file has a test file.** `src/lib/strip-audio.test.ts` and
  `src/lib/narrate-video.test.ts` do not exist. A refactor there is completely
  unguarded, and this repo's recorded lesson is that consolidating two
  implementations disarms the test that used to compare them
  (`docs/DEV_LOOP.md` step 9; the `refactor-disarms-tests` memory).

Extracting the five mechanics all three share - metadata wait,
`ensureFiniteDuration`, canvas sizing, ticker loop, mime fallback - is a real
follow-up, but as a guard-before-migration job with a frozen oracle, not a side
effect of this feature.

## Mechanism: what a speed change actually is here

### The wall-clock cost, with the real numbers

`stripAudio` plays the source element at 1x and records the canvas as it plays.
It stops when `v.ended` fires (`strip-audio.ts:93-96`), so it runs for exactly
the source's duration in wall-clock time. `MediaRecorder` consumes a live track
in real time, so the **output's duration is the wall-clock elapsed recording
time**, not the source's media duration.

**That last sentence is implementation behaviour, not a citable guarantee, and
this document says so rather than dressing it up.** Searched 2026-08-30: neither
the MediaStream Recording spec (https://w3c.github.io/mediacapture-record/) nor
MDN states that a recording's duration equals wall-clock elapsed time. What they
do support it indirectly: `BlobEvent.timecode` is derived from chunk **creation
time**, and Media Capture and Streams
(https://w3c.github.io/mediacapture-main/) says a live track's source makes "a
best-effort attempt to provide data in real time" and a user agent "MUST NOT
buffer". Container-level duration metadata in MediaRecorder WebM output is a
known weak point covered by no spec text - which is exactly why AC1f computes
the output duration instead of measuring it.

Setting `video.playbackRate = N` makes `currentTime` advance N seconds of media
per wall-clock second. **This too is an inference from the definition of the
rate, not a quoted line** - MDN says only that 1.0 is normal speed, lower is
slower, higher is faster, and the WHATWG prose on "current playback position"
and "effective media playback rate" sits in the part of `media.html` that could
not be fetched (checked 2026-08-30). So:

> **wait time = output duration = source duration / rate.**

The two are the same number. That identity is worth stating because it is
counter-intuitive in one direction: **slowing a video down costs more wall-clock
time than the original video.**

| Source | 0.5x | 0.75x | 1.25x | 1.5x | 1.75x | 2x |
| --- | --- | --- | --- | --- | --- | --- |
| 10:00 | **20:00** | 13:20 | 8:00 | 6:40 | 5:43 | 5:00 |
| 20:00 | **40:00** | 26:40 | 16:00 | 13:20 | 11:26 | 10:00 |
| 40:00 | **80:00** | 53:20 | 32:00 | 26:40 | 22:52 | 20:00 |

The owner's specific question - a 10-minute video at 0.5x - is **20 minutes of
waiting**, and the resulting file is 20 minutes long.

This is the single biggest usability fact about the feature, and it must be on
screen before the user commits (AC9), not discovered after.

### The canvas draw loop does NOT change its tick rate

Reason it through explicitly, because the wrong answer is plausible.

The ticker fires 30 times per **wall-clock** second and draws whatever frame the
`<video>` element is currently showing. `captureStream(30)` samples the canvas
in wall-clock time too, and the rate argument is an **upper bound gated on the
canvas actually being painted** - it has no connection to any source video's
`playbackRate`. Media Capture from DOM Elements (W3C,
https://w3c.github.io/mediacapture-fromelement/, checked 2026-08-30):
`captureStream()` "produces a real-time video capture of the surface of the
canvas"; with a non-zero rate "the user agent starts a periodic timer at an
interval of `1/frameRequestRate` seconds", and "A new frame is requested from
the canvas when [[frameCaptureRequested]] is true and the canvas is painted."
MDN's parameter description agrees: without a rate, "a new frame will be
captured each time the canvas changes".
https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream

The output therefore always plays at 30fps.

- **At 2x:** in one wall-clock second we draw 30 times while the source advances
  2 seconds of media. That is 15 samples per second of source content - so a
  30fps source has every other frame dropped. Correct decimation for a 2x
  speed-up, and the output is a smooth 30fps.
- **At 0.5x:** 30 draws per wall-clock second while the source advances 0.5
  seconds of media - 60 samples per second of source content, from a source that
  only has 30 distinct frames per second. Each source frame is drawn twice.
  Correct frame duplication for slow motion, and the output is a smooth 30fps.

So 30 is right at every multiplier, in both directions.

- **Raising it for slow-down buys nothing.** The source has no extra frames to
  give; a higher tick rate duplicates more, and would exceed the
  `captureStream(30)` ceiling anyway.
- **Lowering it for speed-up would make the output stutter** - fewer than 30
  frames per second of finished video.

**Do not touch the tick rate.** Keep `startFrameTicker(30, ...)` exactly as
`stripAudio` uses it.

The real cost of a high rate is elsewhere: the **decoder** must now decode N
times real-time. On a 1080p screen capture that is usually fine at 2x and is not
guaranteed at 4x - the element simply advances with dropped frames, and the
output judders. That is one of the two reasons the offered rates stop at 2x.

### The canvas-free alternative, considered and rejected

`HTMLMediaElement.captureStream()` would return the element's video **and**
audio as one `MediaStream`, already rate-adjusted, with no canvas and no draw
loop at all. Media Capture from DOM Elements is explicit that this route is
rate-aware in a way the canvas route is not (checked 2026-08-30,
https://w3c.github.io/mediacapture-fromelement/): "Captured audio from an
element with an effective playback rate other than 1.0 MUST be time-stretched.
An unplayable playback rate causes the captured audio track to become muted."

**Rejected**, for three reasons, recorded here so it is not re-proposed as an
obvious simplification:

1. Cross-browser support for capturing a media element is materially worse than
   for capturing a canvas, and this feature has to work in Safari.
2. This repo has **zero** precedent for it and three working precedents for the
   canvas route (`stripAudio`, `renderNarratedVideo`, `useBurnCaptions`).
   Introducing a fourth mechanism for the newest of four chained features is the
   wrong place to try it.
3. It does not remove Risk 2 - the spec sentence above says the captured audio
   track becomes **muted** at an unplayable rate, which is the same silent
   failure, just reached by a different path.

It is a legitimate follow-up experiment with its own AC, on the day someone is
willing to measure it in three browsers. Not now, and not as a side effect.

### Audio: pitch, and the range where the browser keeps it at all

This is the most likely defect in the whole feature, and there are two separate
risks in it.

**Risk 1 - pitch. Chipmunk audio is the AVOIDABLE outcome, not the default one.**

`HTMLMediaElement.preservesPitch` controls whether the browser time-stretches
the audio (keeping the pitch) or simply resamples it (chipmunk at speed-up,
drone at slow-down). **Its specified default is `true`**, so setting
`playbackRate = 1.5` and touching nothing else yields pitch-corrected audio in
current Chrome, Firefox and Safari.

Sources, all checked **2026-08-30**:

- WHATWG HTML Standard, media elements: `preservesPitch` returns true when
  pitch-preserving algorithms are used at a `playbackRate` other than 1.0, and
  states "The default value is true."
  https://html.spec.whatwg.org/dev/media.html
- MDN, `HTMLMediaElement.preservesPitch`: "A boolean value defaulting to
  `true`"; marked Baseline widely available since December 2023.
  https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preservesPitch
- Chromium's own implementation carries the same default -
  `bool preserves_pitch_ = true;` in
  `third_party/blink/renderer/core/html/media/html_media_element.h`.
  https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/html/media/html_media_element.h

**Unprefixed support** (MDN browser-compat-data, `api/HTMLMediaElement.json`,
checked 2026-08-30): Chrome 86, Firefox 101, Safari 17.2.
https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HTMLMediaElement.json

**Prefixed forms in 2026:**

- `webkitPreservesPitch` - BCD records it as an alternative name in Safari from
  version 4; it was the only form there until Safari 17.2. **Still worth setting
  as a fallback**, and only for Safari 17.1 and older.
- `mozPreservesPitch` - **do not set it.** Firefox 101 shipped the unprefixed
  name and made the `moz` form a deprecated alias (bug 1652950), and Firefox 115
  disabled it by default with a note that it may be fully removed (bug 1831205).
  https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/101 and
  .../Releases/115. Any Firefox that lacks the unprefixed property is far older
  than anything this app supports.

**Risk 2 - silence, and it is the worse one.** At rates a browser is not willing
to time-stretch, it **mutes the audio entirely** rather than producing artefacts.
Because this feature routes audio through `createMediaElementSource`, a muted
element feeds **silence** into the graph and the output video gets a silent
audio track, **with no error anywhere**. That is the same failure shape as
defect D1 in the sibling document: the artifact is simply wrong, and nothing
says so.

The normative rule (HTML Standard): "When the playbackRate is so low or so high
that the user agent cannot play audio usefully, the corresponding audio must not
play." The exact current wording could not be fetched directly - the multipage
`media.html` truncates inside section 4.8.11.5 and the developer edition omits
UA-conformance text - so this is quoted from a W3C public archive of the spec
thread that introduced it (2008-10-14) and confirmed by search indexing of
https://html.spec.whatwg.org/multipage/media.html; checked 2026-08-30.
https://lists.w3.org/Archives/Public/public-whatwg-archive/2008Oct/0142.html

**Where the actual bounds are, per browser, checked 2026-08-30:**

| Source | What it says |
| --- | --- |
| MDN, `playbackRate` | "The audio is muted when the fast forward or slow motion is outside a useful range (for example, Gecko mutes the sound outside the range `0.25` to `4.0`)." https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate |
| MDN, WebAudio playbackRate explained | "Most browsers stop playing audio outside `playbackRate` bounds of 0.5 and 4 ... it's recommended that you limit the range to between 0.5 and 4." https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Audio_and_video_delivery/WebAudio_playbackRate_explained |
| Chromium (Blink) | `kMinPlaybackRate = 0.0625`, `kMaxPlaybackRate = 16.0` in `html_media_element.h`, used by `IsValidPlaybackRate`. These are **validity** limits, not audio-mute limits. |
| Chromium (media) | `audio_renderer_algorithm.h` still comments "Audio at very low or very high playback rates are muted to preserve quality" but **states no thresholds**, and no such constants remain in `audio_renderer_algorithm.cc` or `audio_renderer_impl.cc` - the only silence case in current source is `playback_rate == 0`. https://raw.githubusercontent.com/chromium/chromium/main/media/filters/audio_renderer_algorithm.h |
| Firefox | Bugzilla 1630569, VERIFIED FIXED in the Firefox 97 cycle: audio is not muted until `playbackRate > 8`, controlled by the pref `media.audio.playbackrate.muting_threshold` (default 8). https://bugzilla.mozilla.org/show_bug.cgi?id=1630569 The older behaviour - muting below 0.5 and above 2 - is Bugzilla 1021711 (RESOLVED WONTFIX). https://bugzilla.mozilla.org/show_bug.cgi?id=1021711 |

**Two corrections that matter, both recorded so nobody re-derives the old
numbers from memory:**

1. **"Chromium mutes audio outside [0.5, 4.0]" is not confirmable in current
   Chromium source.** Those constants are gone. Treat `[0.0625, 16.0]` as
   Blink's accepted rate range and treat audio audibility beyond about 4x as
   **unspecified**, not as a documented guarantee.
2. **MDN's "Gecko mutes outside 0.25 to 4.0" is stale**, superseded by bug
   1630569's threshold of 8.

**Negative rates are not usable.** MDN: "support for this is not yet
widespread"; whatwg/html issue #2754 (opened 2017-06-13) records Chrome
accepting the value but playing at 1x, Edge resetting to 1, Firefox throwing
`NS_ERROR_NOT_IMPLEMENTED`, and Safari implementing reverse playback only
conditionally. https://github.com/whatwg/html/issues/2754 This feature never
produces a negative rate (AC2).

**Risk 3 - the artefact band right next to 1.0, which is why no rate near 1x is
offered.** Chromium time-stretches with WSOLA, and its own commit
`ab98b39d38e0` (2019-10-25) records that "The WSOLA algorithm introduces
noticeable audio artifacts when doing small adjustments to playback rate (e.g.
1.03 playback speed) ... warbling or transient stuttering", and that Chromium
therefore **resamples instead** - shifting pitch - within roughly 0.95 to 1.06,
"Beyond that, the WSOLA artifacts become tolerable, and the pitch shifting
doesn't." Checked 2026-08-30.
https://chromium.googlesource.com/chromium/src/+/ab98b39d38e0c5678a209c5e980a8974bd114eea%5E!

**None of the rates AC2 offers falls inside `[0.95, 1.06]`**, so every offered
rate is time-stretched and pitch-preserved rather than resampled and
pitch-shifted. That is a reason to keep the set as it is, not an accident of it.

No source quantifies quality at 0.25x or 4x; Chromium's only statement is the
qualitative "muted to preserve quality" comment above.

**All three risks are handled the same way: a fixed, small set of offered rates
well inside every documented safe window, plus a human check before shipping.**
No free-text rate field, no slider. See AC2.

### The audio graph

`stripAudio` has no audio. `renderNarratedVideo`'s `"mix"` branch is the
precedent to copy (`narrate-video.ts:142-145`):

```
new AudioContext()
  -> createMediaElementSource(v)   // v.muted must be FALSE
  -> connect(createMediaStreamDestination())
new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()])
```

`v.muted = false` is required and is **not** a request for audible playback: per
the Web Audio spec, `createMediaElementSource` re-routes the element's output
into the graph, and audio reaches the speakers only via a path to
`context.destination`, which this graph never builds. A **muted** element feeds
silence into the graph. The sibling document's trap 11 records this same
reasoning and marks it VERIFY; this feature inherits both the reasoning and the
VERIFY (AC16, item 4).

## Acceptance criteria

### Group A - the renderer

**AC1.** A new module `src/lib/video-speed.ts` exports the renderer and its pure
helpers. Nothing else in `src/lib/` is modified.

```ts
/** The offered multipliers. Deliberately a fixed set, not a range: outside a
 *  narrow window browsers stop time-stretching audio and emit silence, and a
 *  silent output with no error is this feature's worst failure. */
export const SPEED_RATES = [0.5, 0.75, 1.25, 1.5, 1.75, 2] as const;
export type SpeedRate = (typeof SPEED_RATES)[number];

export function isSpeedRate(value: unknown): value is SpeedRate;

/** 1.5 -> "1.5x"; 2 -> "2x"; 0.5 -> "0.5x". Trailing zeros are trimmed, so
 *  there is exactly one spelling of each rate everywhere in the UI. */
export function formatSpeedLabel(rate: number): string;

/** "Week 3 module" + 1.5 -> "Week 3 module (1.5x)". */
export function speedAdjustedName(sourceName: string, rate: number): string;

/** Both the output's duration and the wall-clock render time - they are the
 *  same number (see the Mechanism section). Returns null for a null, zero,
 *  negative, NaN or Infinity source duration, or a rate <= 0. */
export function speedAdjustedDurationSec(
  sourceSec: number | null,
  rate: number,
): number | null;

export interface SpeedProgress {
  /** 0-100, integer, monotonic. */
  pct: number;
  /** Where the source element has reached, in source seconds. */
  elapsedSourceSec: number;
  /** Wall-clock seconds still to wait: (sourceDur - elapsedSourceSec) / rate. */
  remainingWallSec: number;
}

export interface SpeedAdjustResult {
  blob: Blob;
  /** From ensureFiniteDuration on the SOURCE - never measured on the output. */
  sourceDurationSec: number;
  /** sourceDurationSec / rate. */
  outputDurationSec: number;
  /** False when the element exposed no preservesPitch-family property, so the
   *  caller can say so rather than letting the user discover it. */
  pitchPreserved: boolean;
}

export interface SpeedAdjustOptions {
  onProgress?: (progress: SpeedProgress) => void;
  signal?: AbortSignal;
}

export async function renderSpeedAdjustedVideo(
  source: Blob,
  rate: number,
  options?: SpeedAdjustOptions,
): Promise<SpeedAdjustResult>;
```

**AC1b.** `renderSpeedAdjustedVideo` follows `stripAudio`'s structure verbatim
for everything it shares, in this order, and deviates only where named:

1. `URL.createObjectURL(source)`; a **fresh** `<video>` per call, `playsInline`,
   `preload = "auto"`, and **`muted = false`** (AC1c).
2. Await metadata - `awaitVideoMetadata(v)` (`caption-burn.ts:115`) rather than
   `stripAudio`'s inlined copy of the same promise.
3. `const dur = await ensureFiniteDuration(v)` - which seeks to
   `Number.MAX_SAFE_INTEGER` and back to 0 (`caption-burn.ts:265-281`).
4. **Only now** set `preservesPitch` (AC1c) and `playbackRate = rate`. Setting
   the rate before step 3 makes `ensureFiniteDuration`'s probe seek run at the
   wrong rate - harmless, but it will confuse whoever debugs this next.
5. Size the canvas: `v.videoWidth || 1280` by `v.videoHeight || 720`.
6. Mime fallback chain, identical list and order to `strip-audio.ts:51-58`.
7. Build the audio graph (AC1c) and the combined stream.
8. `rec.start(1000)`, then `await v.play()`.
9. `startFrameTicker(30, ...)` - never `requestAnimationFrame`, never
   `setInterval`. A screen recording's re-encode runs precisely while the tab is
   hidden.
10. Stop on `v.ended`; resolve on `rec.onstop`.
11. `finally`: revoke the object URL, `v.removeAttribute("src")`, and
    `await ac.close()` swallowing any rejection - as `narrate-video.ts:229-237`
    does.

**AC1c. The audio graph, and the pitch flag.** Before `play()`:

```ts
const el = v as HTMLVideoElement & {
  preservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};
let pitchPreserved = false;
// Both are set, explicitly, even though the specified default is already
// `true` - it removes this feature's dependence on a default staying put, and
// it makes the intent legible at the one place where getting it wrong turns
// every lecture into a chipmunk. The webkit form is Safari 17.1 and older;
// there is deliberately no moz form (deprecated in Firefox 101, disabled by
// default in 115).
for (const key of ["preservesPitch", "webkitPreservesPitch"] as const) {
  if (key in el) { el[key] = true; pitchPreserved = true; }
}
```

The graph is `renderNarratedVideo`'s `"mix"` branch with no clips:
`createMediaElementSource(v)` connected to `createMediaStreamDestination()`, and
the recorded stream is
`new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()])`.

`pitchPreserved` is `false` only when the element exposes **neither** property -
which, given Chrome 86 / Firefox 101 / Safari 17.2, means a browser older than
anything this app targets. AC17's pitch-fallback string therefore renders almost
never, and that is correct: it is a real state with a real message, not a
warning to show routinely. Do not render it on any other condition, and in
particular do not render it as a general "audio may sound odd" hint.

**A source with no audio still gets a silent audio track in the output.** A
`MediaStreamAudioDestinationNode` always produces one track. There is no
reliable way to detect this in Chrome (`HTMLMediaElement.audioTracks` is not
implemented there), so the result shape deliberately carries **no `hadAudio`
field** - inventing one that cannot be computed honestly is worse than omitting
it. State the behaviour in the Limits.

**AC1d. The pass can be cancelled, and cancellation leaves nothing behind.**
`options.signal` is checked inside the ticker callback. On abort: stop the
ticker, `rec.stop()`, and reject with
`new DOMException("Speed change cancelled", "AbortError")`. The `finally` block
still runs. No blob is returned and nothing is saved.

This is required, not optional. `extractAudioOnly` has `onProgress` but **no
abort**, and the sibling document (AC23c) records that as unacceptable for a
20-minute job. This feature's job can be 80 minutes.

**AC1e. Progress is computed in source time and reported in wall-clock time.**

```
pct              = min(100, round((v.currentTime / dur) * 100))
elapsedSourceSec = v.currentTime
remainingWallSec = max(0, (dur - v.currentTime) / rate)
```

`onProgress` fires only when `pct` changes, as `stripAudio` does
(`strip-audio.ts:86-92`). A percentage alone is not enough for an 80-minute
wait; `remainingWallSec` is what the UI actually shows (AC9).

**AC1f. The output's duration is computed, never measured.**
`outputDurationSec = sourceDurationSec / rate`. A MediaRecorder WebM reports
`duration: Infinity` until it is seeked, so measuring the output would either
return `Infinity` or cost a second element load and seek for a number we already
know exactly.

**AC2. The rate set is closed.** `SPEED_RATES` is `[0.5, 0.75, 1.25, 1.5, 1.75,
2]`. No free-text field, no slider, no 0.25x, no 4x, and nothing between 0.95
and 1.06. Three independent reasons, each traceable to a source in the Mechanism
section, all stated so none is "optimised" away:

- **Audio.** `[0.5, 2]` sits inside every documented safe window: MDN
  recommends limiting to `[0.5, 4]`; Firefox mutes only above 8 since bug
  1630569; Blink accepts `[0.0625, 16]` and states no mute threshold at all.
  0.25x is excluded because MDN's own stale-but-conservative note has Gecko
  muting below 0.25, and 0.5 is the lower bound MDN actually recommends.
- **Artefacts near 1x.** Chromium resamples rather than time-stretches within
  roughly `[0.95, 1.06]`, which shifts pitch. No offered rate is in that band.
- **Decoding.** Above roughly 2x the decoder must run more than 2x real-time on
  a 1080p screen capture, which is not guaranteed, and the failure is a
  juddering output rather than an error.

0.5x is the value at the edge of the documented window and is therefore the one
the VERIFY list checks hardest (Verification item 2).

`renderSpeedAdjustedVideo` itself accepts `rate: number` rather than
`SpeedRate`, so a test can drive an out-of-range value deliberately; the **UI**
offers only `SPEED_RATES` (AC8). A rate that is not finite or is `<= 0` throws
`new Error("Speed must be a positive number.")` before any element is created.

**AC3. Pure helpers are pinned by example, because they are the only part of
this feature a test can actually reach:**

| Call | Result |
| --- | --- |
| `formatSpeedLabel(0.5)` | `"0.5x"` |
| `formatSpeedLabel(1.25)` | `"1.25x"` |
| `formatSpeedLabel(1.5)` | `"1.5x"` |
| `formatSpeedLabel(2)` | `"2x"` |
| `speedAdjustedName("Week 3 module", 1.5)` | `"Week 3 module (1.5x)"` |
| `speedAdjustedName("Take 3 (1.5x)", 1.5)` | `"Take 3 (1.5x) (1.5x)"` |
| `speedAdjustedDurationSec(600, 0.5)` | `1200` |
| `speedAdjustedDurationSec(600, 1.5)` | `400` |
| `speedAdjustedDurationSec(null, 1.5)` | `null` |
| `speedAdjustedDurationSec(Infinity, 1.5)` | `null` |
| `speedAdjustedDurationSec(0, 1.5)` | `null` |
| `speedAdjustedDurationSec(600, 0)` | `null` |
| `isSpeedRate(1.5)` / `isSpeedRate(1.3)` / `isSpeedRate("1.5")` | `true` / `false` / `false` |

**The double-suffix case is correct and deliberate.** A 1.5x copy of a 1.5x copy
really is 2.25x of the original, and the name says so twice rather than lying
once. A collapsing rule would have to do rate arithmetic across an unknown
number of re-encodes and would produce a name that claims a single pass
happened. Do not add one.

### Group B - naming, provenance, and the `kind` question

**AC4. The derived file is named `<source name> (<rate>x)`.** Exactly the
`handleStripAudio` shape - `${file.name} (no audio)`
(`FilesTab.tsx:309`) - with the rate in place of the words. `saveRecordingFile`
strips a matching extension from the name for us (`recording-files.ts:91`), so
no extension handling is needed here.

**AC5. Provenance in the Files list is the NAME, and nothing else. Say so.**
Three things a reader would otherwise assume are false:

- **The kind badge will read "Recording" for both the original and the sped-up
  copy** (AC7). They are not distinguishable by badge, by filter, or by colour.
- **`origin` and `source` are write-only for this purpose.** `FileRow.tsx`
  renders a provenance line only for `file.source === "workflow"`
  (`FileRow.tsx:128-132`); nothing renders `origin`. Writing
  `origin: "speed-1.5x"` costs nothing and is queryable later, so **do** write
  it - but do not claim it as user-visible provenance, because it is not.
- **Grouping will not help.** `groupRecordingFiles`
  (`src/lib/recording-file-groups.ts:20`) groups by `workflow_run_id` only;
  every manually derived file is ungrouped.

What the name does buy is real: with the Files tab sorted by name
(`filter-sort.ts:66-67`), `Week 3 module`, `Week 3 module (1.5x)`,
`Week 3 module (1.5x)-captioned` and `Week 3 module (no audio)` sort adjacently,
and the chain reads in one glance. Caption Studio appends `-captioned`
(`useBurnCaptions.ts:164`), so a captioned copy of a sped-up video is
unambiguous without any new mechanism.

**AC6. `durationSec` on the saved row is the OUTPUT's duration**, i.e.
`result.outputDurationSec`, not the source's.

This is a real difference from `handleStripAudio`, which passes
`durationSec: file.durationSec` (`FilesTab.tsx:312`) - correct there, because
stripping audio does not change the length. Getting this wrong makes the Files
tab show a 10:00 duration next to a 6:40 video, and it feeds a wrong number into
Caption Studio's own display at `VideoSource.tsx:97`.

When the source row's duration is null the renderer still measures it with
`ensureFiniteDuration` and returns it, so the output row gets a real number even
when the input row did not have one.

**AC7. `kind` is `"recording"`. No new kind, and therefore no migration.**

The blast radius of adding one, measured rather than estimated
(`docs/REGRESSION.md`, "2026-08-06 - recording_files.kind as a five-place
contract", checks 1 and 1b - and the sibling document's trap 4 corrects the
count to six):

1. a migration dropping and recreating `recording_files_kind_check` - the
   established pattern is `drop constraint if exists` then
   `add constraint ... check (...)`, one migration per widening (see
   `supabase/migrations/20260719000000_recording_files_kind_narrated.sql`,
   `..._kind_bundle.sql`, `..._kind_file.sql`, and
   `20260922000000_avatar_likenesses.sql:16-17`);
2. **numbered above `20261010000000`** - the highest migration on disk is
   `20261010000000_scheduled_releases_cancel.sql`, and the numbering is a
   monotonic counter that has run ahead of the calendar, so a `20260830...`
   file would sort before dozens of applied migrations;
3. `RecordingFile.kind` (`recording-files.ts:11`) **and** `saveRecordingFile`'s
   inline `meta.kind` union (`:72`) - two separate literal unions in one file,
   and `recording-files.kinds.test.ts` asserts there are exactly two, so
   "tidying" them into one named type fails the test;
4. all three interfaces in `src/lib/supabase/types.tables-b.ts` (Row, Insert,
   Update);
5. `FILES_FILTER_KIND_OPTIONS` (`filter-sort.ts:15`) plus the five untyped
   duplicates of that union: `FilesTab.tsx:63` and `:66`,
   `FilterToolbar.tsx:11`, `:12` and `:97`, and `FilterToolbar`'s hand-written
   `<MenuItem>` list;
6. `kindLabels` (`helpers.ts:13`) - without an entry the badge renders the raw
   lowercase value next to properly-cased siblings.

Of that set the **DB CHECK constraint is caught by nothing** - tsc cannot read
SQL and vitest never touches Postgres - so its failure surfaces only in
production, after a multi-hundred-megabyte upload has already succeeded.

And the specific reason it would be actively harmful here: **`VideoSource.tsx:96`
labels any kind other than `recording`/`narrated` as "Captioned"**, so a
`kind: "speed"` file would read "Captioned" in the very picker step 3 uses. On
top of that, AC26's library-to-`Take` shim in the in-flight wave is being written
now, against the kinds that exist now.

The cost of not adding one is stated in AC5 and accepted: the sped-up copy is
not distinguishable from its original by kind. This matches the two derived-file
paths already shipping - `handleStripAudio` saves `kind: "recording"`
(`FilesTab.tsx:310`), and `handleExtractAudio`'s derived audio take goes through
`saveTakeToLibrary`, which hardcodes `kind: "recording"` (`useTakes.ts:156`).

**If this decision is ever reversed**, the migration number rule in point 2
above is the part that will be got wrong.

### Group C - the surface

**AC8. SUPERSEDED - the files live directly in `src/app/components/recording/`,
not in a new `speed-studio/` directory.** As built: `SpeedPanel.tsx`,
`useVideoSpeed.ts` and `useVideoSpeed.test.ts` sit flat in `recording/`,
matching the existing convention there (`AvatarStudioPanel.tsx`,
`TakesPanel.tsx`, `WalkthroughPanel.tsx`).

This also changes AC10b: the key is `ta-rec-speed-rate`, WITH the `ta-rec-`
prefix, and it IS in `recording-split.structure.test.ts`'s `expectedKeys`
(sorted between `ta-rec-source` and `ta-rec-use-countdown`). The original
reasoning for an unprefixed key rested on the file being outside the canary's
non-recursive scan; since it is inside `recording/` after all, the scan sees it
and the prefixed key is both correct and covered. The line cap covers it too.

The original directory proposal, retained so the reasoning is not lost:
~~A new directory `src/app/components/speed-studio/`, a sibling of
`caption-studio/` and `slide-studio/`, holding:~~

| File | Owns |
| --- | --- |
| `SpeedStudio.tsx` | the view: source picker, player, rate group, save, progress |
| `useSpeedRender.ts` | render state machine: busy, progress, abort, save-to-library |

**Not** a subdirectory under `recording/`: the structure test's `readdirSync` at
`recording-split.structure.test.ts:57` and `:103` is non-recursive, so a
subdirectory would escape both the 1000-line cap and the localStorage key scan.
A sibling top-level directory escapes neither in a way that matters, because
neither guard covers `caption-studio/` today either - and that is precisely the
established shape for an inner view of this tab.

**AC9. The view's layout, top to bottom.** Numbered headings matching Caption
Studio's own (`styles.adaptPanelSubtitle`, `VideoSource.tsx:52-54`):

1. **`1. Video source`** - `<VideoSource>` itself is **not** reused as a
   component (its props are Caption-Studio-shaped and it hardcodes that
   heading's number), but `useVideoImport()` **is** reused as-is. The markup is
   a sibling implementation of the same three lists: *From the Files tab*, *From
   current session*, *From backup folder*.
2. **The player.** `<video controls src={videoImport.videoUrl}>` on the
   `styles`-consistent dark background already used at `TakesPanel.tsx:112` and
   `FileRow.tsx:228`. This is the "watch it back" half of the request.
3. **`2. Playback speed`** - the rate group (AC10).
4. **The cost line** (AC11).
5. **Save** and, while running, progress plus Cancel (AC12).

**AC10. The rate group is a row of buttons, and choosing one changes the
player's speed immediately.**

```tsx
<div role="group" aria-labelledby="speed-rate-heading">
  {SPEED_RATES.map((r) => (
    <Button key={r} size="small"
      variant={r === rate ? "contained" : "outlined"}
      aria-pressed={r === rate}
      onClick={() => setRate(r)}>
      {formatSpeedLabel(r)}
    </Button>
  ))}
</div>
```

- `role="group"` with `aria-labelledby` is this repo's idiom
  (`AvatarStudioPanel.tsx:239`).
- Selecting a rate sets `playbackRate` (and the three `preservesPitch` flags) on
  the **preview** element. **This is the point of putting the rate next to the
  player**: the user hears 1.5x before committing six minutes, and hears the
  chipmunk immediately if a browser turns out not to preserve pitch. It also
  means the preview is a live canary for the risks in the Mechanism section.
- A row of buttons rather than a `TextField select` because a select costs two
  interactions to change and a button row costs one, and the set is small enough
  to show in full. Do **not** replace it with a select or a slider.

**AC10b. The chosen rate persists under `ta-speed-rate`, default `1.5`.**

The key is deliberately **not** `ta-rec-`-prefixed. The localStorage canary at
`recording-split.structure.test.ts:119-167` scans only `recording/*.ts(x)` plus
`RecordingTab.tsx` with the regex `/ta-rec-[a-z-]*/g` and asserts `toEqual`
against a hand-maintained list. A `ta-rec-`-prefixed key living in
`speed-studio/` would be **invisible to that scan**, so adding it to
`expectedKeys` would fail the test in the other direction. `ta-speed-rate` needs
no canary edit at all, and does not collide with the in-flight wave's own
36 -> 42 bump. This mirrors `ta-files-*` and `ta-cc-*`.

On read, validate with `isSpeedRate(Number(stored))` and fall back to `1.5` -
a stored value from a future build with a different rate set must not select a
button that no longer exists.

**AC11. The cost is on screen BEFORE the click, computed from the real source.**
Under the rate group, a `styles.fieldHint` paragraph:

> `Re-encoding plays the video through in real time - about 6:40 at 1.5x - and the copy will be 6:40 long.`

Both numbers are `fmtTime(speedAdjustedDurationSec(sourceDurationSec, rate))`.
Until a source is picked, the line reads:

> `Re-encoding plays the video through in real time, so a slower copy takes longer to make than the original is long.`

The slow-down case must not be softened. At 0.5x, "about 20:00" for a 10-minute
video is the honest number and the user is entitled to it before they start.

**AC12. Running, cancelling, and finishing.**

- The Save button reads `Save at 1.5x`, tracking the selected rate.
- It is disabled with a visible reason (never silently greyed - this repo's
  precedent, `GeneratedPostSection` AC12b) when no source is picked:
  `Pick a video first.`
- While running, the button is replaced by a status region:
  - a `role="progressbar"` with `aria-valuemin={0}`, `aria-valuemax={100}`,
    `aria-valuenow={pct}` and
    `aria-valuetext="Re-encoding at 1.5x, 40 percent, about 4:00 left"`;
  - the visible line `Re-encoding at 1.5x - 40% - about 4:00 left`;
  - a `Cancel` button wired to the `AbortController` from AC1d.
- A `role="status" aria-live="polite"` region announces **stage transitions
  plus roughly every 25 percent** - started, quarter marks, saved, cancelled,
  failed. **The raw percentage and the countdown must still be `aria-hidden` or
  outside that region**; a per-percent live region reads a hundred updates
  aloud, which is the obvious wrong implementation and the same mistake the
  sibling document's AC28 item 2 records on the elapsed timer.

  **AMENDED**: an earlier draft said "stage transitions only". That is wrong for
  a job that can run twenty minutes - a screen-reader user would hear "started"
  and then nothing at all until it finished, with no way to tell progress from a
  hang. The quarter marks are the same compromise the sibling feature's AC23b
  reached for chunked transcription, and the two surfaces should not disagree.
- Only one render may run at a time. While one runs, the rate buttons and the
  source picker's Import buttons are disabled.

**AC13. Save failure is visible.** On success the blob goes to
`saveRecordingFile(supabase, user.id, blob, { name, kind: "recording", mimeType:
blob.type || "video/webm", durationSec: outputDurationSec, origin: "speed" })`.

`saveTakeToLibrary` sets a badge and `console.error`s but **never** calls
`setError` (`useTakes.ts:143-146`, `:161-164`). Do not copy that. A failed save
here renders in `styles.error` with `role="alert"`, carrying the underlying
message, and the rendered blob **stays in state** so the user can retry the save
without re-encoding.

Each stage's failure must be distinguishable - collapsing them is the defect
this repo's loop catches most often:

| Stage | String |
| --- | --- |
| Could not read the source | `Could not read that video - {reason}. Nothing was saved.` |
| Re-encode failed | `Could not re-encode this video - {reason}. Nothing was saved.` |
| Cancelled | `Cancelled - nothing was saved.` |
| Save failed | `The video was made but could not be saved to the Files tab - {reason}. Try saving again.` |
| Not signed in | `Sign in to save to the Files tab.` |

**AC14. Success names the next step in the chain.**

> `Saved "Week 3 module (1.5x)" to the Files tab. To caption it, open Caption a video and press Refresh under "From the Files tab".`

The Refresh instruction is not padding: `useVideoImport`'s library effect is
guarded by `libraryVideos === null` (`useVideoImport.ts:87`) and Caption Studio
stays mounted, so a file saved after its first load genuinely does not appear
until Refresh is pressed. One sentence here is cheaper, and less risky
mid-wave, than editing Caption Studio's fetch guard.

**AC15. Reaching the view.** Four edits to `RecordingTab.tsx`, **and only after
the in-flight wave 2 has landed** (Agent E owns that file):

1. `:31` - the `recView` union gains `"speed"`.
2. `:34` - the validator gains `v === "speed"`.
3. `:134` - the strip array becomes
   `[["record","Record"],["speed","Change speed"],["captions","Caption a video"],["slides","Narrate a deck"],["avatar","Avatar"]]`.
   Second position, so the strip reads in workflow order.
4. a `display:none` wrapper mounting
   `<SpeedStudio takes={takes} backupDir={backupDir} />`, alongside the existing
   view wrappers.

`ta-rec-view` gains an accepted value but **no new key**, so the canary array is
untouched. Reordering the strip is a visible change to a shipped surface and the
`docs/REGRESSION.md` entry for this feature must say so; nothing in
`recording-split.structure.test.ts` pins the order (it pins three contract
strings at `:78-90`, none of them the strip).

**AC16. Accessibility.** Nothing here is covered by the suite - vitest is
node-env, collects only `src/**/*.test.ts`, and renders no component - so
anything not written here will not exist.

1. Focus ring: new MUI `Button` controls inherit the ring from the
   `MuiButtonBase` override in `theme.ts` (`docs/focus-ring-acceptance-criteria.md`
   AC3). **The dark `#0f172a` panel is the video's own background only, and hosts
   no focusable child** (native `controls` live in the shadow DOM), so
   `--focus-ring-on-navy` is **not** needed here. Stated explicitly because
   AC3b of that document is, by its own account, the rule three implementers
   have already misread, and the right answer here is "no work", not "copy the
   navy reset in case".
2. Every control carries a visible label: `Playback speed`, each rate button's
   own `1.5x`, `Save at 1.5x`, `Cancel`.
3. The progressbar and live-region rules of AC12 are requirements, not
   suggestions.
4. Errors render in `role="alert"`. `styles.error` is a bare `<p>` with no role
   (`RecordingTab.tsx:144`), so a failure arriving while focus is elsewhere is
   silent today - do not inherit that.
5. **WITHDRAWN - switching to this view must NOT move focus.** An earlier
   draft required focus to move to the heading "matching the other inner
   views' behaviour", and that premise was simply wrong: none of Record,
   Caption a video, Narrate a deck or Avatar moves focus on switch. Switching
   here is a TAB activation, so stealing focus would break arrow-key travel
   along the tab strip and single this one view out for surprising behaviour.
   The take-scoped panes that DO move focus (WalkthroughPanel,
   TakeAnnouncementPanel) are a different case - they open from a button in a
   row rather than from a tab, so focus has to go somewhere. The original
   requirement, retained only so it is not reinstated by accident:
   ~~Switching to this view moves focus to its heading (`<h2 tabIndex={-1}>`),~~
   matching the other inner views' behaviour.

**AC17. Copy.** Sentence case, a hyphen rather than an em dash, second person,
consequence stated plainly, no emojis - matching
`No takes yet - record something.` and
`Pick a microphone - audio-only recording needs one.`

| Element | String |
| --- | --- |
| Tab label | `Change speed` |
| Heading | `Change a video's speed` |
| Source heading | `1. Video source` |
| Rate heading | `2. Playback speed` |
| Rate buttons | `0.5x`, `0.75x`, `1.25x`, `1.5x`, `1.75x`, `2x` |
| Cost line | `Re-encoding plays the video through in real time - about {mm:ss} at {rate} - and the copy will be {mm:ss} long.` |
| Save | `Save at {rate}` |
| No source | `Pick a video first.` |
| Running | `Re-encoding at {rate} - {pct}% - about {mm:ss} left` |
| Cancel | `Cancel` |
| Keep-open warning | `Keep this tab open - the re-encode runs in this browser and stops if you close the page.` |
| Pitch fallback | `This browser could not hold the pitch steady, so voices will sound higher or lower.` |
| Success | `Saved "{name}" to the Files tab. To caption it, open Caption a video and press Refresh under "From the Files tab".` |

The keep-open warning is accurate and the tab-switch case is **not** a hazard
here, because `RecordingTab` is always mounted (`page.tsx:394`). Do not write a
"do not switch tabs" warning; it would be false, and it is exactly the sentence
that would be copied verbatim if this ever moved to the Files tab, where it
would be true.

## Traps

1. **`recording_files.kind` is a six-place hand-maintained contract plus a DB
   CHECK constraint that nothing tests.** AC7 decides not to add one. If that is
   ever reversed, the migration must be numbered above `20261010000000` - not
   dated today - and the whole list in AC7 must be worked through, the DB
   constraint last and most carefully, because it is the only member that fails
   in production rather than in a gate.
2. **`VideoSource.tsx:96` labels any unrecognised kind "Captioned".** A new kind
   would be mislabelled at the exact joint this chain depends on.
3. **`FilesTab.tsx` is at 999 lines.** If any part of this ever lands there
   anyway, the handler cannot go in that file's body. It is also **conditionally
   mounted** (`page.tsx:398`), which is the reason this feature is not there at
   all.
4. **Use `startFrameTicker`, never `requestAnimationFrame` and never
   `setInterval`.** `extractAudioOnly` drives its progress from a plain
   `setInterval` (`strip-audio.ts:183`) and is therefore throttled in a hidden
   tab. Copy `stripAudio`'s ticker, not `extractAudioOnly`'s interval.
5. **Do not import MUI `Dialog`.** `isDialogSite`
   (`src/app/components/ui/modalAdoptionScan.ts:294-302`) treats a `Dialog`
   import - or `role="dialog"`, or `styles.previewBackdrop` - as making the file
   a dialog site, which then fails the AC8 derived guard in
   `docs/modal-dismissal-focus-acceptance-criteria.md` unless it adopts
   `ModalShell` or is added to an allow-list, and moves a pinned count. MUI
   `Menu`/`Button` are unaffected. Nothing in this feature needs a dialog.
6. **Do not refactor `strip-audio.ts` or `narrate-video.ts`.** Neither has a test
   file, so a refactor there is unguarded, and the in-flight document has already
   recorded the decision not to generalise `renderNarratedVideo`.
7. **`createMediaElementSource` may be called once per element per context, and
   permanently reroutes that element.** Create the `<video>` fresh inside
   `renderSpeedAdjustedVideo` and close the context in `finally`. In particular,
   **never** call it on the preview element from AC9 item 2 - that element must
   keep playing through the speakers.
8. **`ensureFiniteDuration` seeks the element** to `Number.MAX_SAFE_INTEGER` and
   back to 0 (`caption-burn.ts:265-281`). Set `playbackRate` after it returns
   (AC1b step 4).
9. **A MediaRecorder WebM reports `duration: Infinity`.** Never measure the
   output (AC1f).
10. **Take names collide.** `Take ${takesLength + 1}` uses a stale closure
    (`useRecorder.ts:450`), so deleting a take and recording again produces two
    takes named `Take 3` and two identically named library rows. A speed copy of
    each produces two rows named `Take 3 (1.5x)`. Pre-existing; do not make it
    worse by deriving a name from a count.
11. **Library-save failures are silent in `useTakes`** (`:143-146`, `:161-164`).
    AC13 deliberately does not inherit that.
12. **Never `git stash`** - one agent's stash reverts every sibling's work.
13. **No emojis.** `src/lib/no-emojis.test.ts` owns the rule; never hand-roll a
    scan.
14. **Do not write a `ta-rec-` prefix inside a comment** in any file under
    `recording/` - the key-scan regex reads raw text including comments, and a
    comment mentioning `ta-rec-pip-*` injects the bogus key `ta-rec-pip-`. This
    feature's own key is `ta-speed-rate` and lives outside that scan (AC10b).
15. **Supabase typed selects collapse to `never`** - anything reading rows goes
    through the existing `mapRecordingFile` path inside `recording-files.ts`;
    this feature adds no new query.

## Verification

```
npx tsc --noEmit
npx eslint src/lib/video-speed.ts src/lib/video-speed.test.ts src/app/components/speed-studio
npx vitest run
npx next build
```

Run from PowerShell; Bash is unreliable on this machine. The build gate is the
**compile line only** - the env-dependent prerender tail fails locally with no
Supabase keys and that failure is expected. Count file lines with
`@(Get-Content path).Count`, never `Measure-Object -Line`.

### What only a human, in a browser, can check

Every item is a VERIFY, not a result. Each must be checked in Chrome, and items
1 and 2 in Firefox and Safari as well, because they are the ones where the
browsers differ.

1. **A 1.5x output has audible, pitch-correct speech.** The whole feature is
   worthless if voices come out as chipmunks. The documentation says
   `preservesPitch` defaults to `true` and AC1c sets it explicitly on top of
   that, so this is expected to pass - but nothing in this repo has ever
   exercised the property, and the audio being tapped here goes through
   `createMediaElementSource` rather than the speakers. **Whether a
   `MediaElementAudioSourceNode` receives the time-stretched, pitch-corrected
   output or some earlier stage of the element's audio pipeline is not stated in
   any source checked on 2026-08-30.** It is the single most important unproven
   assumption in this document.
2. **A 0.5x output has audio at all, in Chrome AND Firefox AND Safari.** 0.5 is
   the edge of the range MDN recommends and was Gecko's historical mute
   threshold, so it is the offered rate most likely to come back silent. Silence
   here produces a wrong file with no error anywhere. Check 2x in the same three
   browsers for the same reason at the other end.
3. **`createMediaElementSource` does not reach the speakers** during a render -
   the graph never connects to `context.destination`, so it should be silent
   while working. The sibling document's trap 11 marks the same claim VERIFY.
4. **A backgrounded tab still produces frames.** Switch to another application
   mid-render and confirm the output is not a black or frozen video. This is
   what `startFrameTicker` exists for and it has never been checked on this
   path.
5. **A 2x render of a 1080p screen capture keeps up.** Watch for judder in the
   output, which is the decoder failing to run at 2x real-time.
6. **The output's duration on the saved row matches its real length** (AC6) -
   a 10:00 source at 1.5x should show 6:40 in the Files tab, and 6:40 again in
   Caption Studio's picker line.
7. **The full chain, end to end**, on one real video: record -> Change speed at
   1.5x -> Caption a video -> Refresh -> Import the `(1.5x)` file -> burn -> and
   then the walkthrough on the `(1.5x)-captioned` file. Step 4 is the joint that
   does not exist yet; if it is still missing when this ships, say so in the
   `docs/REGRESSION.md` entry rather than describing the chain as complete.

## Limits

- **The suite cannot test the renderer.** vitest here is node-env and collects
  only `src/**/*.test.ts`. There is no `MediaRecorder`, no canvas, no
  `AudioContext`, no `HTMLVideoElement`, and no component is ever rendered. The
  only genuinely covered code in this feature is the pure helpers in AC3 -
  `formatSpeedLabel`, `speedAdjustedName`, `speedAdjustedDurationSec`,
  `isSpeedRate` - and they are shaped that way on purpose. A green suite proves
  nothing about whether a single frame or a single sample was ever encoded.
- **Every claim about pitch, audio muting and time-stretch quality is a reading
  of documentation, not an observation of this code.** Items 1, 2 and 2b of the
  VERIFY list are the only evidence that will ever exist for them.
- **Three facts in the Mechanism section could not be confirmed by direct
  fetch on 2026-08-30 and are labelled where they appear**: the exact current
  WHATWG wording of the "cannot play audio usefully" muting rule (quoted from a
  W3C archive of the thread that introduced it, because `media.html` truncates
  mid-section); any verbatim statement that `currentTime` advances at
  `playbackRate` times wall-clock (an inference from the rate's definition); and
  any statement that a MediaRecorder file's duration equals wall-clock elapsed
  time (implementation behaviour, supported only indirectly by the "MUST NOT
  buffer" and chunk-creation-timecode language).
- **Current Chromium states no numeric audio-mute thresholds at all.** The
  `[0.5, 4.0]` constants that used to live in `audio_renderer_algorithm.cc` are
  gone, and `[0.0625, 16.0]` in `html_media_element.h` is a validity range, not
  an audibility one. AC2's rate set is chosen against MDN's recommendation and
  Firefox's documented threshold, not against a Chromium guarantee, because no
  Chromium guarantee exists to cite.
- **A source with no audio produces an output with a silent audio track**, not
  an output with no audio track (AC1c). Nothing detects or reports this.
- **The rate set stops at 2x and 0.5x by decision, not by capability.** Faster
  and slower are technically reachable and are deliberately not offered.
- **The kind badge does not distinguish a sped-up copy from its original**
  (AC5, AC7). The name is the only signal, and it is not enforced - a user can
  rename the row and lose the provenance entirely.
- **`origin: "speed"` is written and never read.** No UI surfaces it today.
- **Re-encoding is destructive of quality.** The output is a fresh VP9/Opus (or
  MP4) encode of decoded frames at whatever bitrate MediaRecorder chooses; it is
  not a container-level retiming. Nothing here measures the quality loss.
- **The chain's fourth joint is unbuilt.** Step 3 -> step 4 depends on AC26 of
  `docs/screen-recording-and-walkthrough-acceptance-criteria.md`, which is
  assigned to Agent E in wave 2 and is not written yet. This document could not
  verify it and does not claim it works.
- **`stripAudio` in the Files tab has the tab-unmount defect described above.**
  Found while surveying, not fixed here, and not in this feature's scope.
