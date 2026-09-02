# Discussion reply capture - acceptance criteria

Screen-record a course discussion board, have the app read the posts off the
screen as you scroll, and draft a reply to each one into an editable, orderable
table that survives a reload until you delete it.

Feature lives on the **Manual** tab, under **Recording**, as a new inner view
called **Discussion replies**.

The user's own words, kept verbatim because every clause below is traceable to
one of them:

> start screen recording / open the discussion section for a course i'm
> teaching / select who my audience is (peers or students) / scroll through the
> discussion posts while screen recording / app records posts, and drafts and
> displays responses to them inside large editable textboxes inside an orderable
> table that displays the name of the person alongside the drafted reply to them
> / each textbox has a copy icon next to it / these replies survive until i
> delete the table

---

## 0. Scope decisions and stated assumptions

**D0-1. The discussion is read off the SCREEN, not off the Canvas API.**
This repo already has Canvas discussion write paths
(`src/lib/canvas-modules/graded-discussion.ts`) and could in principle fetch
posts over the API. It deliberately does not here. The user described a screen
recording as the capture mechanism, which also means the feature works on a
board this app has no API credentials for (a peer/faculty community, another
institution's LMS, a private cohort space). Vision extraction over sampled
frames is the whole design, not a fallback.

**D0-2. "Screen recording" produces a saved video only when asked.**
The capture's purpose is the reply table. A `Save the screen recording too`
checkbox (default off) additionally runs a `MediaRecorder` on the display
stream and offers the result as a download when the session stops. Nothing is
uploaded to Supabase and nothing is added to the recording library - that would
be scope the user did not ask for, and the recording library already has its
own entry points on the Record view.

**D0-3. Audience means register, not recipients.** "Peers" and "students" change
the drafting prompt's stance and nothing else. No message is ever sent, posted,
or transmitted anywhere by this feature. The only output is text in a textbox
and on the clipboard.

**D0-4. The table is local.** It persists in `localStorage`, not Supabase. It is
the durable output of one instructor at one machine, it contains no data the
app can re-derive, and "survives until I delete the table" is exactly
localStorage's lifetime. No migration is added.

---

## 1. Reuse survey (step 2 of the dev loop)

Vetted before any implementation section below was written. Line numbers are
from the tree at the time of writing.

| Need | Reuse | Where |
| --- | --- | --- |
| Request a display stream | `requestScreenShareStream` is NOT reused - it pins `displaySurface: "monitor"` and requests audio, which raises the share-audio checkbox and the whole `classifyDisplayAudioGrant` notice tree this feature has no use for. A video-only request is made locally. | `src/app/components/recording/screen-source.ts:77-87` (read for idiom, not imported) |
| A tick source that survives a hidden tab | `startFrameTicker(fps, onTick)` - Worker-backed, because `rAF` stops and main-thread timers throttle to ~1/s while the tab is hidden, and this feature samples frames precisely while the tab is hidden | `src/lib/frame-ticker.ts:11` |
| Video frame to base64 JPEG | The `canvas.toDataURL("image/jpeg", q).split(",")[1]` idiom | `src/lib/narrate-video.ts:62-66`, `src/app/components/caption-studio/hooks/useCaptionGeneration.ts:60` |
| Sending JPEG frames to a vision model | `parts: [{text}, ...frames.map(f => ({ inlineData: { mimeType: "image/jpeg", data: f.base64 } }))]` | `src/app/actions/media.ts:491-502` |
| Refusing an oversized request body | `checkWireBudget(sumBase64WireBytes(...), what)` - measures WIRE bytes, the unit the 4.5MB platform cap is in | `src/lib/upload-budget.ts:82,113`; call-site precedent `src/app/actions/media.ts:489` |
| LLM dispatch + retry/backoff | `callLlm(req, provider)` | `src/lib/llm.ts:232` |
| Failure and empty-response wording | `describeLlmFailure`, `describeEmptyLlmText` | `src/lib/llm.ts:175,190` |
| Tolerant JSON array parsing | `parseLenientJsonArray` | `src/lib/lenient-json.ts` |
| Owner gate for a server action | `requireOwner()` returning `{ id, ... }` | `src/lib/supabase/auth.ts:29`; call-site precedent `src/app/actions/chat-style.ts:29` |
| Instructor's own writing voice in a prompt | `getWritingStyleBlock(userId)` | `src/app/actions/shared.ts` (re-export of `src/app/actions/writing-style-block.ts:9`) |
| The provider the user picked | `getStoredProvider()` | `src/lib/llm-provider.ts`; call-site precedent `src/app/components/recording/useTakeAnnouncement.ts` |
| Course list for a picker | `listCourseHubAction()`, **unfiltered** (see AC30) - NOT `useCoursesData()`, which fires several list actions per course on mount | `src/app/components/recording/useTakeAnnouncement.ts:347-380` (call idiom only) |
| Panel chrome, disclosure, error and hint classes | `styles.adaptPanel`, `.adaptPanelHeader`, `.adaptPanelTitle`, `.adaptPanelSubtitle`, `.error`, `.fieldHint`, `.ghActions`, `.ghMeta` | `src/app/page.module.css`, used throughout `src/app/components/recording/*.tsx` |
| Inline SVG icons (there is no `@mui/icons-material` in this repo) | The 20x20 `viewBox`, `fill="currentColor"`, `aria-hidden` shape | `src/app/components/courses/icons.tsx` |
| Defensive coercion of persisted JSON | `coerceMessageDraftPayload`'s shape: never throw, drop what is malformed | `src/lib/message-drafts.ts:54` |
| Bounded-concurrency drafting with per-item failure isolation | Read for idiom. NOT imported - that module's unit is a week number and its contract is the weekly-announcement one. | `src/lib/announcement-drafting.ts:41` |

**Near-misses deliberately not reused**, recorded so nobody re-opens them:
`useRecorder.ts` (owns the Record stage's whole state machine, countdown,
takes, backup dir - none of it applies); `useTakes` (persists takes to Supabase
and the backup dir); `postConfirmArming` (Canvas-post arming with a signature
over post targets, not a local delete).

---

## 2. Where it lives, and how it is reached

**AC1.** `src/app/components/RecordingTab.tsx` gains a sixth inner view. The
tab strip literal becomes:

```
[["record", "Record"], ["discussions", "Discussion replies"], ["speed", "Change speed"],
 ["captions", "Caption a video"], ["slides", "Narrate a deck"], ["avatar", "Avatar"]]
```

`Discussion replies` sits second, directly after `Record` - it is a capture
surface, and grouping it with the other capture surface beats burying it after
three post-production tools.

**AC2.** `recView`'s type becomes
`"record" | "discussions" | "speed" | "captions" | "slides" | "avatar"`, and the
`ta-rec-view` restore guard in the `useState` initializer accepts
`"discussions"`. A value the guard does not accept still falls back to
`"record"`. The union and the guard are two hand-maintained places in the same
file and both change in the same edit.

**`ta-rec-view` is guarded in exactly ONE place** - `RecordingTab.tsx:43`.
`isManualViewType` in `manual-rail.ts:123-125` is a **cautionary precedent, not
a second edit site**: it validates Manual *rail subtabs*
(`course-planning`, `recording`, `repo-grades`, ...), a different concept
entirely. `src/app/components/manual/manual-rail.ts` is edited by **nobody** in
this group; adding `"discussions"` there breaks `manual-rail.test.ts` and is
wrong.

**AC3.** The panel mounts inside the same always-mounted `display:none` stack as
the other inner views:

```tsx
<div style={{ display: recView === "discussions" ? undefined : "none" }}>
  <DiscussionRepliesPanel active={recView === "discussions"} />
</div>
```

Never unmounted on a tab switch. A capture session and its in-flight extraction
must survive the user navigating to another inner view, for the same reason the
speed re-encode lives here.

**AC4.** `DiscussionRepliesPanel` takes exactly one prop, `active: boolean`, and
nothing else. It owns its own state through `useDiscussionReplies()`. No props
are threaded from `RecordingTab`, so the wiring edit stays a four-line change to
a file that is already at 712 of its 1000-line budget.

---

## 3. The capture session

**AC5. Starting.** One primary button, `Start capture`. Clicking it calls
`navigator.mediaDevices.getDisplayMedia` with:

```ts
{ video: { frameRate: { ideal: 5 } }, audio: false }
```

**The `width: { max: 1920 }` hint of AC8a-i is OPTIONAL and omitting it is
correct.** AC5 previously said "exactly", which contradicted AC8a-i's "may
additionally carry" - resolved here in favour of omitting it. Whether Chromium
honours a resolution constraint on a display-surface track is UNVERIFIED and
probably false, and the canvas-side scaling in AC8a is required to be correct on
its own regardless, so the hint buys nothing certain and its absence costs
nothing.

No `displaySurface` hint - the user is choosing a browser tab or a window
showing their LMS, and pinning `"monitor"` (what the Record stage does) would
push the picker toward the wrong surface. `audio: false` because nothing here
listens to audio, and asking for it would raise a share-audio checkbox that
means nothing in this flow. `frameRate: 5` because the sampler reads at most
one frame every 1.5s and a 30fps display capture costs the machine for nothing.

If the user cancels the picker (`NotAllowedError`), the panel returns to idle
with no error banner - a cancelled picker is not a failure. Any other rejection
surfaces its own message: `Could not start the screen capture: <reason>`.

**AC6. Stopping.** Three things stop a session, and all three run the same
teardown:

1. the `Stop capture` button,
2. the browser's own "Stop sharing" bar - the display video track's `ended`
   event MUST be wired, or the panel keeps claiming it is capturing over a dead
   track,
3. the component unmounting (page navigation away from the app).

Teardown stops the ticker, stops every track on the display stream, stops the
`MediaRecorder` if one is running, and flushes the pending frame queue (AC10)
so posts already scrolled past are not thrown away.

**AC7. While capturing** the panel shows, in one status row:

- a live 200px-wide muted `<video>` preview of the shared surface, so the user
  can confirm they picked the right window without alt-tabbing;
- elapsed time as `m:ss` (`fmt` from `recording/types.ts:42` - minutes are
  unpadded and there is no hours field, so 3661 renders `61:01`);
- `N posts found`;
- `Reading the screen...` while an extraction request is in flight, and
  `Catching up - scroll a little slower.` when the pending queue is non-empty.

**AC7a. The elapsed timer must not be inside the live region.** Ticking every
second, it would announce roughly 240 times per capture and would defeat AC7's
own 5-second throttle by re-firing the whole region on every tick. The repo
already solved this in this very folder: `StagePanel.tsx:539-562` marks the
visible badge and `{fmt(elapsed)}` `aria-hidden="true"` and puts transition-only
text in a separate clipped `role="status"` span (there is no `.srOnly` class -
the inline clip-rect style object is the idiom).

So the visible status row is `aria-hidden`, and a separate polite region carries
**one computed sentence**, recomputed at most every 5 seconds, covering count,
reading state and backpressure together.

**AC7b. This panel is invisible for its entire useful life, so it owes the user
a state that survives Stop.** The user is looking at their LMS in another
window; the 200px preview is only on screen when they are *not* looking at the
thing being captured. Nothing in the original AC described what the panel says
**after** Stop - which is the user's whole experience of this feature ("did it
work?").

On stop, a persistent session summary replaces the live status row and stays
until the next capture starts:

> `Capture stopped after 4:12. Found 9 posts, drafted 8 replies. 1 reply failed
> - use Retry on that row.`

with the tallies computed from the rows, and, when `droppedFrames > 0` (AC10),
the drop sentence beneath it.

**AC7c. There is deliberately NO out-of-tab notification channel.**
`new Notification`, `Notification.requestPermission`, `navigator.vibrate` and
favicon manipulation have **zero hits repo-wide**, and `document.title` is the
only channel that exists - already contested, since `live-class-logic.ts:284-287`
declares a single owner and `page.tsx:113-117` overwrites it anyway. Introducing
a notification permission prompt for this feature is out of scope and was
rejected, not overlooked. The compensation is AC7b's durable summary.

**AC8. Frame sampling.** Driven by `startFrameTicker(1000 / FRAME_SAMPLE_INTERVAL_MS, ...)`
-- never `setInterval` directly, and never `requestAnimationFrame`. The app tab
is hidden for the entire useful life of this feature (the user is looking at
their LMS in another window), which is exactly the condition that throttles
main-thread timers to ~1/s and stops `rAF` outright.

Constants live in **two** files, and the split is load-bearing.

The three constants the **server also enforces** live in set B's
`src/lib/discussion-reply-prompt.ts`, which AC35 already requires to be
dependency-free and importable from both the client and a `"use server"` file:

```ts
export const EXTRACT_BATCH_SIZE = 6;
export const DRAFT_BATCH_SIZE = 5;
export const MAX_POST_CHARS = 4000;
```

They are imported from there by `discussion-capture.ts` and by the action. They
must NOT be restated on either side: a client batching 6 against a server
refusing more than 5 fails 100% of the time, with a generic message, and no gate
in this repo would catch it. (This is the "split constants into the leaf" rule -
one owner, one direction, no cycle.)

The capture-only constants stay in `discussion-capture.ts`:

```ts
export const FRAME_SAMPLE_INTERVAL_MS = 500;      // detection rate
export const FRAME_MIN_KEEP_INTERVAL_MS = 1200;   // keep rate - decoupled
export const FRAME_TARGET_WIDTH = 1920;
export const FRAME_MIN_SCALE = 0.5;               // never downscale past half
export const FRAME_JPEG_QUALITY = 0.55;
export const SIGNATURE_GRID = 32;                 // 32x32 grayscale signature
export const FRAME_CHANGE_THRESHOLD = 6;          // mean abs diff, 0-255
export const MAX_PENDING_FRAMES = 16;
export const EXTRACT_BATCH_WIRE_BUDGET = 3_000_000;  // the REAL batch ceiling
export const STALL_NOTICE_TICKS = 60;             // 60 x 500ms = 30s
export const MAX_TABLE_ROWS = 500;
```

**AC8a. The width rule is `FRAME_TARGET_WIDTH` with a scale FLOOR, and the
original `min(1280, trackWidth)` was a silent-garbage blocker.**

```ts
const targetWidth = Math.min(
  trackWidth,
  Math.max(FRAME_TARGET_WIDTH, Math.round(trackWidth * FRAME_MIN_SCALE))
);
```

`getDisplayMedia` hands back the **device framebuffer**, not CSS pixels, and a
14.5px body glyph is 14.5 *device* pixels at DPR 1 regardless of monitor size -
there is simply more page. So a plain `min(WIDTH, trackWidth)` means **the
higher the user's resolution, the smaller the text arrives.** That is backwards
from the intuition the constant was picked under.

MEASURED on this machine, 2026-08-31, rasterizing a dense Canvas-style board
with the repo's own `@napi-rs/canvas` and encoding with libjpeg at 4:2:0 (what
Chromium's `toDataURL` does), then rendering the delivered pixels at 4x and
reading them by eye - body glyph size in the frame actually transmitted:

| Source | sent as | scale | 14.5px glyph arrives at | verdict |
| --- | --- | --- | --- | --- |
| 1280x720 | 1280x720 | 1.00 | 14.5px | clean |
| 1920x1080 | 1280x720 | 0.67 | 9.7px | readable |
| 2560x1440 (QHD) | 1280x720 | 0.50 | 7.3px | degraded, still readable |
| 3840x2160 (4K, Retina) | 1280x720 | 0.33 | **4.8px - illegible** |

At 3840 the delivered pixels are grey corduroy; not a single word was
recoverable by a human reader, and the model will do no better. **A MacBook
Pro's built-in display is 3024 or 3456 physical pixels wide and an external 4K
panel is ordinary faculty kit** - this is not an edge case for this audience.

It is also the worst possible failure profile: AC4b correctly treats an empty
array as success (a nav-chrome frame legitimately has no posts), so a 4K user
gets a session that runs, shows `Reading...`, never errors, and produces zero
rows - or rows with invented authors. Every gate stays green and vitest renders
nothing.

The floor puts a 3840 source at scale 0.5 (the QHD row: degraded but readable)
instead of 0.33, and leaves 1920 and 2560 sources better than the old best case.

**AC8a-i.** The constraint may additionally carry `width: { max: 1920 }` so the
browser's own (better) scaler runs first. Whether Chromium honours a resolution
constraint on a display-surface track is **UNVERIFIED** - browsers have
historically ignored them there. **Safe assumption: it is ignored.** The
canvas-side scaling above must therefore be correct on its own, and no
implementer may treat the constraint as the fix.

**AC8d. Sampling rate and keep rate are DECOUPLED, and 1500ms for both was
wrong in two directions at once.**

Coverage settles it. A normal skim scrolls 500-800 px/s. At a 1500ms interval,
600 px/s is **900px of travel between samples** - longer than a 720px capture
viewport. Content that entered and left the viewport between two ticks was never
photographed by anything: it does not arrive late, does not arrive truncated,
and does not appear in the `Catching up` counter. **It is simply absent, with no
trace in the UI that anything was missed.** That is the quietest possible
data-loss mode and it was a direct consequence of that one constant.

And the slow interval bought nothing, because ticking is not what costs
anything: a tick is a `drawImage` plus a 32x32 compare. The expensive units are
the KEPT frame (a JPEG encode) and the BATCH (an LLM call), and both already
have their own governors.

So: **tick at 500ms** (300px of travel - guaranteed overlap against any
viewport), and keep a frame only if it differs enough (AC9) **and** at least
`FRAME_MIN_KEEP_INTERVAL_MS` has elapsed since the last kept frame. The keep
rate, and therefore the LLM spend, is unchanged from the original design; the
coverage guarantee is new.

Each tick: draw the **detached sampling video** (AC8b) into an offscreen canvas
at `targetWidth` preserving aspect ratio, compute the frame signature (AC9), and
apply the two keep gates. A kept frame is JPEG-encoded at `FRAME_JPEG_QUALITY`
and pushed to the pending queue.

**AC8e. The signature baseline advances only on an actual KEEP**, never on every
observed tick. A frame that clears the change threshold but loses the
`FRAME_MIN_KEEP_INTERVAL_MS` gate must leave the baseline untouched, so the
comparison stays anchored to the last frame actually captured. Advancing it on
every tick would let a slow continuous scroll drift past the threshold in
sub-threshold increments and keep nothing at all - coverage silently lost, which
is the failure mode AC8d exists to close.

**AC8b. The frame source is a DETACHED video element, and this is the single
most important implementation detail in the feature.**

The sampling `<video>` is created with `document.createElement("video")`, gets
`muted = true`, `playsInline = true`, `srcObject = stream`, `play()`, and is
**never attached to the DOM**. This is the repo's proven idiom -
`usePipWebcam.ts:129-136` creates exactly such an element and
`useCanvasPipeline.ts:157-164` `drawImage`s from it at 30fps, in production,
while this tab is hidden.

Sampling from a video inside AC3's `display:none` subtree is where frames would
be expected to stop advancing, and **the failure would be silent**: a frozen
frame produces an identical signature, AC9's change detection correctly
suppresses it, and the user scrolls an entire board while the status row reads
`0 posts found`.

`previewRef` (AC7's visible 200px preview) is therefore a **second, separate**
`<video>` in the DOM with `srcObject` set to the same `MediaStream`. If it
stalls while hidden, nothing is lost - it is decoration.

**AC8c. Stall detection. AC8's hidden-tab premise is now SETTLED at source
level (checked 2026-08-31), and it holds.** `requestAnimationFrame` stops
outright while hidden; main-thread timers are clamped, reaching ~1/min after
five minutes. And the third claim, previously unverified: **dedicated Worker
timers are NOT throttled** (`kDedicatedWorkerThrottling` is disabled by
default), **and** `worker.onmessage` is delivered on a non-throttleable task
queue - so `frame-ticker.ts`'s premise holds on both hops, not just the timer
hop. The producer side of this feature is sound.

**This settles the producer only.** See AC8f: the CONSUMER loops were a
main-thread `setTimeout` chain and had exactly the problem the ticker exists to
avoid.

**AC8c-i. The stall detector as first specified has a FALSE NEGATIVE, and the
fix is the spec's own channel.** Watching the sampling video's `currentTime`
detects a stalled *playback*, not a stalled *frame source*: `currentTime` is
specified to advance linearly in real time while playing, so a capture that
stops producing frames keeps advancing it and the notice never fires - a stall
detector that misses the stall it was written for. The track's `muted` property
and its `mute` / `unmute` events are the spec's actual signal for "this track is
not currently producing frames" and are the primary detector; the `currentTime`
check stays as a secondary signal.

So the design does not bet silently. Each tick records the sampling video's
`currentTime` in `lastMediaTimeRef`. A tick where `currentTime` has not advanced
is a duplicate: skip the encode entirely (a free win) and increment
`stallTicksRef`. Any tick that advances resets it. At `STALL_NOTICE_TICKS` the
hook exposes `stalled: true` and the panel shows:

> `Nothing new has been read off the screen for 30 seconds. Keep this app's tab
> visible in a second window while you scroll.`

This converts every unverified assumption above from a silent no-op into a
visible instruction, for about twelve lines.

**AC9. Change detection is pure and lives in the lib.**

```ts
export type FrameSignature = Uint8Array;  // length SIGNATURE_GRID * SIGNATURE_GRID
export function computeFrameSignature(pixels: Uint8ClampedArray, width: number, height: number): FrameSignature;
export function framesDifferEnough(a: FrameSignature | null, b: FrameSignature, threshold?: number): boolean;
```

`framesDifferEnough(null, b)` is `true` - the first frame of a session is always
kept. Otherwise it is the mean absolute difference across the signature,
compared against `threshold` (default `FRAME_CHANGE_THRESHOLD`). This is what
stops a still screen from spending an LLM call every keep interval, and it is
tested against synthetic pixel buffers with no canvas involved.

**AC9a. The signature is computed from a DEDICATED 32x32 canvas, never from the
full frame.** A literal reading of AC8 - draw at `targetWidth`, then take the
signature from those pixels - means `getImageData` on a 1920x1080 canvas, an 8MB
GPU readback, **twice a second** at the new tick rate. Draw the video a second
time into its own 32x32 canvas and call `getImageData` on that: 4KB, and the
browser's scaler does the box-filter for free. `computeFrameSignature`'s
signature already supports this (pass `width = height = SIGNATURE_GRID`); it
just has to be said, or an implementer will read AC8 literally and read back the
whole frame twice a second.

The signature draw happens on **every** tick; the full-width draw and the JPEG
encode happen only for a frame that passes both keep gates (AC8d).

**AC10. Backpressure, and the loss it causes is VISIBLE.** If the pending queue
already holds `MAX_PENDING_FRAMES` frames, the tick drops its frame and does not
enqueue. The status row shows `Catching up (K frames)`.

**The original justification for dropping the newest was inverted and is
withdrawn.** It argued that the dropped frame's content "is still on screen and
will be sampled again on the next tick" - true only for a **static** screen,
which is exactly the case `framesDifferEnough` has already filtered out. A frame
only reaches the backpressure check *because* the screen changed. Under
sustained scrolling - the only condition that fills the queue - the dropped
content is gone within a second and is never sampled again.

Neither drop direction is good, so the design's job is **not to reach the wall,
and to admit it when it does**:

- `MAX_PENDING_FRAMES` is 16, not 12.
- Batches are packed by bytes (AC10a), so a tall window does not stall the loop.
- A session-level `droppedFrames` counter increments on every drop, and on stop,
  if it is non-zero, the panel surfaces:
  `Some of the screen scrolled past faster than it could be read. Scroll back
  over that section to catch it.`

Silent loss with no UI trace is the actual defect here; which end of the queue
is sacrificed is secondary.

**AC10c. `callLlm`'s own retry budget is the concrete path by which this
happens - and it is far worse than the comment in `llm.ts` claims.** That file's
header says the backoff totals "~9s across the 4 retries, still far under the
60s Vercel function cap". That arithmetic only holds when no `Retry-After`
header is present. **`llm.ts:274` caps each honoured `Retry-After` at 20
seconds, four times over - a worst case of 80 seconds**, which does not merely
exceed AC10c's original sizing, it exceeds the platform's own 60s function cap
(verified 2026-08-31).

With the single extraction slot held for that whole time, a 16-frame queue -
under 20 seconds of scrolling - is consumed several times over by ONE retried
call. So `MAX_PENDING_FRAMES` cannot be sized to survive a rate-limited call; it
is sized to survive ordinary latency, and the rate-limited case is handled by
making the loss VISIBLE (AC10's `droppedFrames` notice), not by absorbing it.

This is new evidence against a number the AC previously asserted, so it
legitimately reopens the sizing question rather than being a preference.

Extraction sends **at most** `EXTRACT_BATCH_SIZE` frames per request with **at
most one request in flight at a time**. A batch's failure does not stop the
session: it surfaces a dismissible notice carrying the real reason and the loop
continues with the next batch.

**AC10a. Batches are packed by BYTES, with count as a ceiling - and this is
required, not an optimisation.** Take frames oldest-first while
`count < EXTRACT_BATCH_SIZE` **and**
`wireSoFar + next.base64.length <= EXTRACT_BATCH_WIRE_BUDGET` (3,000,000), using
the same `sumBase64WireBytes` unit the server uses. **Always send at least one
frame**, even if it alone exceeds the budget, so the action's own
`checkWireBudget` produces a user-facing refusal rather than the client silently
stalling with an unsendable frame wedged at the head of the queue.

MEASURED (2026-08-31, method as in AC8a): at the new `FRAME_TARGET_WIDTH` of
1920, six frames of a **1920x3000** window come to **3.48MB against the 3.5MB
budget - 99.4% of it**. A fixed count of six is one slightly taller window away
from a hard refusal, and because the window does not change during a session,
that refusal would recur on **every batch for the rest of the session**. A
count-only cap is a latent outage for tall-window users.

For calibration, the same measurement at other shapes (wire bytes per frame, and
x6): 1280x720 -> 107-126KB -> 0.63-0.74MB; 1280x1600 -> 252-292KB -> 1.48-1.71MB;
1920x1080 -> 203KB -> 1.19MB; 1920x2400 -> 465KB -> 2.72MB. Two realism checks
worth recording so nobody adds a safety factor for them: photographic avatars
cost +8%, and ClearType subpixel fringing costs **-5%**, not more - the fringe is
a low-pass blur on luma and JPEG likes it.

2026-09-02 CORRECTION (per `REGRESSION.md` entry 383's Limits): every number in
the two paragraphs above is FILE bytes (the JPEG's on-disk/Blob size) reported
as if it were WIRE bytes (the base64-encoded string that actually rides in the
request body). This is exactly the failure class `src/lib/upload-budget.ts`'s
own header calls out as the recurring mistake in this repo ("a file that is
base64-encoded into a JSON body rides the wire at 4/3 its size on disk"), and a
second, independent error compounds it: **"the 3.5MB budget" is the wrong
constant.** `EXTRACT_BATCH_WIRE_BUDGET` (`discussion-capture.ts:74`) - the
constant this very passage's own AC10a paragraph names two sentences earlier as
"the REAL batch ceiling" - is `3_000_000`, which the app's own `formatMB`
renders as **2.9MB**, not 3.5MB. 3.5MB is `UPLOAD_WIRE_BUDGET_BYTES`
(`upload-budget.ts:41`), a different, larger budget that only applies here
because `extractDiscussionPostsAction` (`discussion-replies.ts:176`) calls
`checkWireBudget` with no third argument and so falls back to that default -
irrelevant to what AC10a is actually about, which is the client-side packer's
own ceiling.

The unit error is independently provable from this passage's own numbers, no
re-measurement required: `packFrameBatch` (`discussion-capture.ts:188`) never
lets a packed batch's real (`sumBase64WireBytes`) wire total exceed
`EXTRACT_BATCH_WIRE_BUDGET` - it checks the running sum before admitting each
frame and stops short rather than crossing it. A six-frame batch whose WIRE
total is 3.48MB (3,650,000 bytes) could therefore never have been produced by
that function against a 3,000,000-byte ceiling: admitting the sixth frame
would have been refused. The only way six frames of this size were ever
observed together is if the quantity measured was each frame's file size, not
the wire size the batch is actually gated on.

**Derived corrections** (applying the exact base64 relationship, not a fresh
measurement - see AC10a's own dispute resolution in this file's companion
analysis: base64 turns every 3 input bytes into 4 output characters, padded up
to a multiple of 4, i.e. exactly `4 * ceil(F/3)`; at these MB-scale sizes the
`ceil(F * 4/3)` shortcut `wireBytesForFile` actually uses differs from the
exact formula by at most 2-3 bytes, negligible here, so plain **x4/3** is used
below):

- Headline: six frames of a 1920x3000 window, file bytes 3.48MB -> **derived
  wire bytes 4.64MB** (3.48 x 4/3). Against the constants that actually govern
  this path: **159% of `EXTRACT_BATCH_WIRE_BUDGET`'s real 2.9MB**, 126% of the
  3.5MB `UPLOAD_WIRE_BUDGET_BYTES` the original text (wrongly) cited, and
  **103% of `VERCEL_BODY_LIMIT_BYTES`'s 4.5MB platform cap** - before counting
  any of the surrounding JSON envelope. `REGRESSION.md` entry 383 states this
  corrected figure as 4.55MB; that is close to but not identical to the 4.64MB
  this exact x4/3 derivation produces, and the small gap could not be resolved
  without knowing exactly how entry 383's number was computed. Both readings
  agree on the conclusion that matters: the reported 3.48MB, read as wire
  bytes, is over every budget that applies here, not 99.4% inside one.
- Calibration table, file bytes -> derived wire bytes (x4/3), per frame and x6:
  - 1280x720: 107-126KB -> 142.7-168.0KB; x6 0.63-0.74MB -> 0.84-0.99MB
  - 1280x1600: 252-292KB -> 336.0-389.3KB; x6 1.48-1.71MB -> 1.97-2.28MB
  - 1920x1080: 203KB -> 270.7KB; x6 1.19MB -> 1.59MB
  - 1920x2400: 465KB -> 620.0KB; x6 2.72MB -> 3.63MB

Note that the 1920x2400 row's derived x6 wire total (3.63MB) already exceeds
both the real 2.9MB batch ceiling and the (wrongly cited) 3.5MB figure - this
was never a problem unique to the extreme 3000px-tall case the original text
singled out; every window shape in this table taller than roughly 1080px
already implies more wire bytes than a real six-frame batch could legally
carry, once read in the correct unit. The photographic-avatar (+8%) and
ClearType (-5%) percentage adjustments above are unaffected by this
correction - a relative adjustment is the same percentage in either unit,
since both scale by the same x4/3 factor.

**Consequence for behaviour: this was a documentation defect, not a shipped
one, and no user is affected today.** `packFrameBatch` and the single-frame
check in `useDiscussionCapture.ts:279` (`if (base64.length >
EXTRACT_BATCH_WIRE_BUDGET)`) both gate on the real, already-base64-encoded
`base64.length` at capture time - true wire bytes, computed at runtime,
completely independent of any number written in this document. The packer
cannot be fooled by this doc's arithmetic because it never reads this doc; it
re-derives the real total every time a frame is considered for the batch. The
practical effect of the window sizes above being larger than this passage
claimed is that **fewer than six frames get packed per batch** for a tall
window (more, smaller batches - more round trips, not a refusal), and a
single-frame refusal (AC10b) only fires for one frame alone exceeding 2.9MB
wire, far above anything in this calibration table even after correction. The
risk this correction exists to prevent is forward-looking: if a future change
had trusted this passage's false 99.4%-safe headroom - to raise
`EXTRACT_BATCH_SIZE`, loosen `EXTRACT_BATCH_WIRE_BUDGET`, or drop the
byte-based packing check in favour of a count-only one - that change would
have shipped a real defect. No such change has been made; the byte-based
packing rule this passage argues for is itself what keeps every real batch
under budget regardless of this arithmetic error.

**AC10b.** A single frame that alone exceeds the budget is re-encoded once at
`FRAME_JPEG_QUALITY / 2`, and dropped with a notice if it still does not fit.
Otherwise the queue head wedges permanently and every frame behind it starves.

**AC10d. Cost is not a design constraint here and must not be treated as one.**
The conclusion holds; the numbers behind it were wrong and are corrected
(checked 2026-08-31).

**A Gemini 3.x image costs a FLAT 1,120 tokens regardless of resolution.** Two
consequences, and the first is easy to get backwards: **downscaling a frame
saves no tokens at all.** AC8a's target width is justified *purely* by
legibility - the model must be able to read body text - and never by cost. Do
not "optimise" the frame width to save tokens; there is nothing to save.

The earlier estimate also priced only input. Output is $1.50/M with thinking
billed as output, so the real per-batch figure is roughly **four times** the
quarter-cent originally stated. Still small enough that nothing in the design
may be sized around it - size it around latency and coverage - but the previous
figure should not be quoted.

**Latency is the binding constraint and it is UNVERIFIED** - no live call was
made. Safe assumption: 4-12 seconds for a six-image `generateContent` with a
long tail. Repo evidence that this is the right order of magnitude:
`describeScreenRecordingAction` (`media.ts:476`) sends up to **30** frames in one
call inside Vercel Hobby's 60s cap, and `callLlm` calls ~9s of backoff "far
under" that cap. **This assumption must be validated on the first real session**,
because the pipeline's viability depends on it and nothing else in the design
does: at 8s per batch, a 10-minute session with 50% active scrolling runs the
single in-flight slot at roughly 88% utilisation, with no margin.

**AC8f. The CONSUMER loops must run off the same non-throttled source as the
producer.** This is the finding that most nearly shipped a feature that works
for five minutes and then quietly stops.

AC8 moved frame SAMPLING onto a Worker ticker because hidden tabs throttle
timers. The extraction and drafting loops were then written with a chained
main-thread `await delay(300)` on their idle path - which exceeds the spec's
maximum timer nesting level and therefore lands on the intensively-throttleable
queue: 1 per second while hidden, and **1 per minute after five minutes
hidden** (checked 2026-08-31). `getDisplayMedia` grants no exemption; a live
capture track disables the back/forward cache but does not disable aggressive
throttling.

The tab is hidden for this feature's entire useful life. So after five minutes
the producer keeps sampling at full rate, the 16-frame queue fills in under
twenty seconds, and every subsequent frame is dropped while the consumer wakes
once a minute. The user scrolls an entire board and gets almost nothing, with
the only clue being a `Catching up` counter they cannot see because they are
looking at another window.

Both loops therefore take their idle wait from the Worker-backed ticker, not
from `setTimeout`. AC43's `isRunningRef` latch and AC51's drain-to-empty
behaviour are unchanged.

**AC8g. Platform limit, stated because it cannot be fixed here.** AC8b's
detached-`<video>` frame delivery holds on desktop browsers and **fails on
Android**, where a hidden page's video elements stop producing frames
regardless of attachment. This feature is a two-window desktop workflow by
construction - the instructor scrolls their LMS in one window while this app
sits in another - so Android is out of scope rather than broken. The Limits
section says so.
---

## 4. Wire contracts

Fixed here so the four implementers do not each invent them.

### 4a. `src/lib/discussion-reply-prompt.ts` (pure, testable, no `"use server"`)

```ts
export type DiscussionAudience = "peers" | "students";

export const DISCUSSION_AUDIENCE_LABELS: Record<DiscussionAudience, string> = {
  peers: "Peers",
  students: "Students",
};

export function normalizeAudience(value: unknown): DiscussionAudience;   // anything else -> "students"

export function buildPostExtractionPrompt(courseName: string, frameCount: number): string;

export function buildReplyDraftingPrompt(
  posts: ReadonlyArray<{ id: string; author: string; text: string }>,
  audience: DiscussionAudience,
  courseName: string,
  styleBlock: string
): string;
```

`normalizeAudience` trims and lowercases before comparing, so `" Peers "` and
`"PEERS"` both resolve to `"peers"`; anything else - including `null`,
`undefined` and non-strings - is `"students"`. (This is
`coerceMessageDraftPayload`'s own shape, `message-drafts.ts:57-58`.) It defaults
to `"students"`: the overwhelmingly common case, and the register that errs
toward being encouraging and explanatory rather than toward collegial shorthand
aimed at a colleague.

**The extraction prompt's output schema is load-bearing and must be stated in
the prompt**, since AC4b filters `author` and `text` off the parsed array.
`buildPostExtractionPrompt` must instruct the model to return ONLY a JSON array
of `{"author": "...", "text": "..."}`, with no markdown and no code fences, and
to return `[]` when the frames show no discussion posts. It must additionally
state that the images are consecutive screenshots of one scrolling discussion
board taken about 1.5 seconds apart, so the same post appears in several of
them: emit each distinct post **once**, using the **fullest** version of its
text seen across the frames; use the author name exactly as displayed; skip
navigation chrome, sidebars, reply-count badges, and any post cut off at a frame
edge; and never invent a post or an author. `frameCount` appears in the prompt
text ("You are looking at N screenshots") or the parameter is dropped.

The two audience stances, pinned as prompt text because the whole feature turns
on them:

- **students** - "You are the instructor replying to a student's discussion
  post. Be warm, specific and encouraging; name something the student actually
  said; add one substantive idea, correction or example; end with a question
  that invites them to go further. Never grade, never assign a score, never
  promise a deadline change."
- **peers** - "You are replying to a fellow educator's post in a professional
  community. Address them as an equal, not as a teacher. Engage with the
  substance, add your own experience or a concrete counterpoint, and skip
  praise-first framing and pedagogical scaffolding."

Both stances share: reply in the first person, 3-6 sentences, plain prose, no
markdown headings, no bullet lists, no salutation line and no sign-off (the
instructor pastes this into a reply box that already knows who is speaking), no
emoji, and never invent a fact about the course that was not supplied.

### 4b. `src/app/actions/discussion-replies.ts` (`"use server"`, async exports only)

Both actions wrap their **entire body** in `try/catch`, returning
`{ error: err instanceof Error ? err.message : "<fallback>" }`. This is not
optional: `requireOwner()` **throws** (`supabase/auth.ts:47-54`), so "return
`{ error }` rather than throwing" is unachievable without the catch. Precedent:
`media.ts:482-518`.

Neither re-exports a type - `next build` is the only gate that catches a type
re-export from a `"use server"` file, so there is not one. `LlmProvider` is
imported from `@/lib/llm-provider`; the client supplies it from
`getStoredProvider()` **at dispatch time, per call**, never captured once at
mount.

The client imports both actions **directly**
(`from "@/app/actions/discussion-replies"`), never through the
`src/app/actions.ts` barrel. That barrel re-exports some fifty server-action
modules, and pulling their whole dependency graph into a client component's
import trace to reach two functions is a real cost. `src/app/actions.ts` is
edited by **nobody** in this group.

```ts
export async function extractDiscussionPostsAction(
  frames: Array<{ base64: string }>,
  courseName: string,
  provider: LlmProvider
): Promise<
  { posts: Array<{ author: string; text: string; postedAt?: string }> }
  | { error: string }
>;
```

- `frames.length === 0` -> `{ error: "No frames were captured from the screen." }`
- `frames.length > EXTRACT_BATCH_SIZE` (6) ->
  `{ error: "Too many frames in one batch." }`
- `checkWireBudget(sumBase64WireBytes(frames.map(f => f.base64)), "These screen frames")`
  and return its `error` verbatim when not ok.
- `callLlm({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192 } }, provider)`
  with `parts = [{ text: buildPostExtractionPrompt(...) }, ...frames.map(inlineData image/jpeg)]`.
- On `!r.ok` return `{ error: describeLlmFailure(r, "Reading the screen failed") }`.
  **The reason survives** - this must not collapse to a generic string. A 429
  and a 400 read differently and the user acts on them differently.
- On `r.ok` with empty text -> `{ error: describeEmptyLlmText(r, "Reading the screen") }`.
- Parse with `parseLenientJsonArray`; a null parse ->
  `{ error: "Could not read any posts from that part of the screen." }`.
- Keep entries where `author` and `text` are non-empty strings after trim; carry
  `postedAt` through when it is a non-empty string (AC12b). Truncate `text` to
  `MAX_POST_CHARS` and, when truncation actually occurred, append a visible
  `...` marker - AC12 compares lengths to decide which read wins, so two
  truncated reads of an over-long post are otherwise both exactly 4000 and the
  merge keeps whichever arrived first, arbitrarily, while the Post column
  silently lies about what the person wrote. An empty result after filtering is
  **success with an empty array**, not an error - a batch of frames showing only
  the LMS's navigation chrome legitimately contains no posts.

**AC4b-i. `maxOutputTokens` is 8192 for extraction, and 4096 was a silent
data-loss bug.** On Gemini 3.x, thinking tokens draw from the **same** budget as
output (`gemini.ts:126-131`). Six overlapping frames of a dense board can
legitimately hold 8-10 unique posts, and at `MAX_POST_CHARS = 4000` the JSON
alone can exceed 4096 tokens before any thinking. The failure is not clean:
`parseLenientJsonArray`'s truncation recovery (`lenient-json.ts:64-86`) salvages
the complete objects and **silently drops the tail**, so the last posts of each
batch vanish with no error anywhere. 4096 remains correct for drafting (five
replies of six sentences).

**AC4b-ii. The temperatures below are ADVISORY on the default model and will not
be applied.** `normalizeGenerationConfig` (`llm.ts:89-95`) **deletes** any
`temperature < 1` when `isGemini3Model(model)`, and the default model is
`gemini-3.1-flash-lite` (`gemini.ts:1`), which matches. So the extraction pass
actually runs at temperature 1.0 - the least appropriate setting for verbatim
transcription - and the drafting pass does too. This is recorded rather than
worked around: the normalization exists for a documented vendor reason (low
temperature on Gemini 3 causes looping and empty `MAX_TOKENS` responses,
`llm.ts:283-295`). **No implementer may special-case it in the new action.** If
the deployment wants the stated values honoured, it sets
`GEMINI_ALLOW_LOW_TEMPERATURE`.

**AC4b-iii. `provider` is threaded but has no effect.** `callLlm` does
`void provider; return callGemini(req)` (`llm.ts:241-242`). Consistent with the
rest of the repo and harmless, but stated here so a reviewer does not chase a
bug that does not exist, and so nobody claims the provider toggle changes this
feature's output.

```ts
export async function draftDiscussionRepliesAction(
  posts: Array<{ id: string; author: string; text: string }>,
  audience: "peers" | "students",
  courseName: string,
  provider: LlmProvider
): Promise<{ replies: Array<{ id: string; reply: string }> } | { error: string }>;
```

- `posts.length === 0` -> `{ error: "No posts to reply to." }`
- `posts.length > DRAFT_BATCH_SIZE` (5) -> `{ error: "Too many posts in one batch." }`
- `styleBlock = await getWritingStyleBlock(user.id)` is passed as
  `buildReplyDraftingPrompt`'s fourth parameter. The **builder owns the whole
  prompt** so the whole prompt is unit-testable; the action never concatenates
  anything onto it. A failure inside that helper already returns `""` and must
  not fail the draft.
- **The caller's ids never go on the wire.** The action maps them to
  **positional integers 1..N** for the prompt and maps them back before
  returning; the public signature is unchanged. A single small integer is well
  inside a model's reliable-copy envelope in a way an opaque token is not, and
  echoing text ids back also wastes output tokens on a value nobody reads.

  ```ts
  // prompt shows "POST 1", "POST 2", ...; model returns [{"post": 1, "reply": "..."}]
  const replies = raw
    .filter((r) => Number.isInteger(r.post) && r.post >= 1 && r.post <= posts.length
                   && typeof r.reply === "string" && r.reply.trim())
    .map((r) => ({ id: posts[r.post - 1].id, reply: r.reply.trim() }));
  ```

  Belt and braces, since `DRAFT_BATCH_SIZE` is only 5: if the array comes back
  with exactly `posts.length` elements and **none** carries a usable `post`
  index, fall back to positional order. Cheap, and it rescues the whole batch
  from the one remaining failure mode.
- `generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }` - replies are
  prose, not extraction. Subject to AC4b-ii: this value is not applied on the
  default model.
- Same `!r.ok` / empty-text / lenient-parse treatment, with the label
  `Drafting replies`.
- Returns only entries whose position was in the request and whose `reply` is a
  non-empty string. A post the model skipped comes back missing, and the caller
  marks exactly that row failed (AC17) rather than failing all five.

### 4c. Domain types (`src/app/components/recording/discussion-capture.ts`)

```ts
export type ReplyRowState = "pending" | "drafting" | "ready" | "failed";

export interface ReplyRow {
  id: string;            // opaque, minted once: `disc-${now}-${counter}`. See AC11b.
  author: string;
  post: string;
  postedAt?: string;     // the LMS's own timestamp, as displayed. See AC11a.
  reply: string;         // "" until drafted; user edits overwrite it
  userEdited: boolean;   // a human wrote this reply. PERSISTED - see AC22.
  state: ReplyRowState;
  error: string | null;  // set only when state === "failed"
  firstSeenAt: number;   // ms epoch; the "Captured" column and sort key
  order: number;         // manual position; see AC14
}

export type ReplySort = "captured-asc" | "captured-desc" | "name-asc" | "name-desc" | "custom";
```

---

## 5. Deduplication and merging

**AC11. Identity is decided by COMPARISON against existing rows, not by a
derived key. The original `postKey` scheme is withdrawn - it was measured, and
it false-splits on 10 of 16 realistic re-reads.**

MEASURED on this machine, 2026-08-31. One realistic 235-character post was put
through the perturbations a vision model actually produces between two reads of
the same post off two overlapping frames. A SPLIT means one post became two
rows.

| Perturbation | old `postKey` | scheme below |
| --- | --- | --- |
| identical read | ok | ok |
| comma dropped | ok | ok |
| period added mid-sentence | ok | ok |
| truncated at "Show more" | **SPLIT** | ok |
| cut at frame edge, mid-word | **SPLIT** | ok |
| one word misread (clean/dean) | **SPLIT** | ok |
| one word misread inside first 120 chars | **SPLIT** | ok |
| a word misread at char ~55 | **SPLIT** | ok |
| leading quote artifact | ok | ok |
| model rewrapped whitespace | ok | ok |
| author read with middle initial | **SPLIT** | ok |
| author surname only (avatar clipped) | **SPLIT** | ok |
| model prefixed the timestamp | **SPLIT** | ok |
| "Show more" suffix kept | ok | ok |
| first word dropped | **SPLIT** | ok |
| first sentence scrolled off top | **SPLIT** | fixed in the prompt |
| **totals** | **10 / 16 split** | **0 / 13 split** |

The failure was structural, not bad luck. A 120-character prefix makes every
character in that window load-bearing, and it computes identity over exactly the
region most likely to be cut by a truncation control or a frame edge. Vision
transcription of 7-14px text does not have a per-120-character error rate near
zero.

And the damage compounds: each frame is a fresh reading, so a post visible in
six overlapping frames gets six independent chances to mint a distinct key. The
user watches `N posts found` climb past the number of posts on screen and ends
with four near-identical rows for one student, each with its own half-drafted
reply, each having cost a drafting call - the feature failing in the most
visible way possible while every gate stays green, because `postKey` is pure and
its unit tests, written against clean strings, all pass.

**`postKey` is deleted, not kept alongside.** Keeping a derived key that is no
longer identity is exactly how this repo's "coercion changes set membership" and
"refactors disarm tests" lessons get re-learned.

```ts
export const PREFIX_TOKENS = 40;
export const SIMILARITY_THRESHOLD = 0.25;
export const MIN_TOKENS_FOR_SIMILARITY = 4;

export function normalizeForMatch(s: string): string;   // lowercase, collapse ws, strip to [a-z0-9 ], trim
export function authorsMatch(a: string, b: string): boolean;
export function postSimilarityDistance(aText: string, bText: string): number;
export function isSamePost(
  a: { author: string; text: string; postedAt?: string },
  b: { author: string; text: string; postedAt?: string }
): boolean;
```

- `authorsMatch` is **surname-anchored**: normalized equality, else the last
  token must agree AND (the first tokens agree OR either side is a single
  token). This is what tolerates a middle initial appearing in one read and a
  surname-only read when the avatar clipped the given name.
- `postSimilarityDistance` is Levenshtein over **tokens**, both lists truncated
  to the first `PREFIX_TOKENS` (40) and then to the **shorter** of the two,
  normalized by that length. Truncating to the shorter list is the whole trick:
  it makes a partially-read post match its fully-read self, because the longer
  read's extra tail is free.
- `isSamePost` requires `authorsMatch`, then compares distance against
  `SIMILARITY_THRESHOLD`. Below `MIN_TOKENS_FOR_SIMILARITY` (4) tokens it falls
  back to exact normalized equality - a three-word post has no room for a
  distance measure to mean anything.

**MEASURED threshold sweep**, which is how 0.25 was chosen rather than guessed:

| threshold | false splits | false merges |
| --- | --- | --- |
| 0.15 | 1 / 13 | 2 / 5 |
| 0.20 | 1 / 13 | 2 / 5 |
| **0.25** | **0 / 13** | **2 / 5** |
| 0.30 | 0 / 13 | 2 / 5 |
| 0.40 | 0 / 13 | 2 / 5 |

0.25 is the smallest threshold clearing every false split, and the merge count
is **flat** from 0.15 to 0.40 - so no split/merge trade-off is being made here
at all. It is a step edge, not a tuning knob.

Cost is `O(40^2)` = 1600 cell updates per comparison against at most a few
hundred rows, a few times a minute. Not a performance concern.

**AC11a. `postedAt` is the primary identity signal when both sides have it,**
and capturing it is the highest value-per-line change in this whole data path.
The two pairs no text-only scheme can separate - two genuinely identical short
posts by one author, and a shared 20-word boilerplate opener - are separated
trivially by the per-post timestamp every LMS already prints, which the
extraction prompt would otherwise throw away as chrome.

- Extraction returns `{ author, text, postedAt? }`, `postedAt` being the
  timestamp string exactly as shown (`"Mar 12 at 9:04 PM"`), omitted when not
  visible.
- In `isSamePost`: if **both** sides carry a non-empty `postedAt` and the
  normalized strings **differ**, they are different posts - short-circuit,
  skip the similarity test. If both carry the **same** `postedAt` and the
  authors match, they are the same post - short-circuit the other way.
- Fall back to the similarity rule whenever either side lacks a timestamp.

This turns the residual 2/5 false merges into 0/5.

**AC11b. `ReplyRow.id` is opaque and minted ONCE.** Under the old scheme the id
was `postKey(author, text)` while AC12 replaces `post` with a longer read - so
**the row's own primary key mutated under a normal, expected event**, breaking
`moveRow`, `removeRow`, `retryRow`, `editReply` and the drafting queue's
`addedIds` for that row, mid-session. Nobody had noticed because AC12 says
"replaces `post` only" without observing that `id` was computed from `post`.

The id is `disc-${now}-${counter}` - deliberately **not** `crypto.randomUUID()`,
which requires a secure context and would be a second failure mode when testing
over `http://` on a LAN address.

**AC12.**

```ts
export function mergeCapturedPosts(
  rows: ReadonlyArray<ReplyRow>,
  incoming: ReadonlyArray<{ author: string; text: string; postedAt?: string }>,
  now: number
): { rows: ReplyRow[]; addedIds: string[] };
```

Every behaviour below is unchanged from the original AC12; **only the lookup
changes** - a linear scan with `isSamePost` against existing rows, instead of a
`Map` keyed by `postKey`:

- An incoming post matching no existing row becomes a new row with
  `state: "pending"`, `reply: ""`, `userEdited: false`, `firstSeenAt: now`, and
  `order` one past the current maximum. Its id goes in `addedIds`.
- An incoming post matching an existing row whose text is **longer** than the
  stored `post` replaces `post` (and fills `postedAt` if the row lacked one). It
  does **not** reset `reply`, `state`, `userEdited`, `order` or `firstSeenAt`,
  and it is **not** in `addedIds`. This is the scrolled-into-view case: the same
  post read again with more of it on screen. Overwriting a reply the user has
  already edited because they scrolled back up is the single worst thing this
  feature could do.
- Ordering of `rows` is preserved; new rows append.
- Incoming posts are matched against **each other** as well as against existing
  rows, in the same pass, so "the same post appears twice in one batch" still
  collapses to one row under similarity rather than equality.
- **Tie-break, pinned because it is otherwise a nondeterministic test:** when two
  incoming entries match each other and have equal-length text, the **first**
  wins.

**AC13.** `mergeCapturedPosts` is pure, takes `now` as an argument rather than
calling `Date.now()`, and never mutates its inputs. Its unit tests pin the
perturbation table above as a **frozen literal oracle** - input pairs and
expected same/different - never re-deriving expectations from the
implementation.

**AC13a. No existing normalizer is widened to cover this.** Checked, so a
seventh is not written and an existing one is not bent: `normalizedTitleEquals`
(trim + lowercase only, pinned by its own header to two LMS-tab call sites);
`normalizeConceptKey` (strips spaces entirely, so `"i agree"` and `"iagree"`
collide - wrong for prose); `normalizeTypography` (ASCII-folds curly punctuation
but preserves case and spacing - complementary, and unnecessary here since the
`[^a-z0-9 ]` strip already removes curly punctuation); `normalizeWrittenTextForComparison`
(HTML-oriented, preserves case and newlines - wrong unit); `normalizeStudentDisplay`
(grade-scoped, and importing from the grade module tree would violate AC35's
dependency-free requirement). `normalizeForMatch` + `authorsMatch` are genuinely
new behaviour and belong in `discussion-capture.ts`.

---

## 6. The table

Set D imports **`../workflows/AutomationsTable.module.css`** for the table skin,
with a header comment saying why. That stylesheet's own header declares it the
shared idiom so the app's tables read as one system, and
`courses/WeeklyChecklistOverviewModal.module.css` already copied it verbatim.
Use its `.scroller` and `.table`. Do **not** use its `.sortableHeader`, which
styles a clickable bare `<th>` - see AC14.

**`page.module.css` has NO table classes.** Referencing `table`, `tableWrap`,
`scroller`, `sortableHeader`, `sortHeaderButton`, `stickyName`, `cellMenu` or
`focusAnnouncement` on `styles` fails `courses/page-module-css-classes.test.ts`,
which guards every `src/**` import resolving to `page.module.css` - and all
eight recording panels import it. `.liveFeedTable` and `.sortButton` are dead
selectors and must not be revived.

Confirmed present and usable: `adaptPanel` 855, `adaptPanelHeader` 865,
`adaptPanelTitle` 871, `adaptPanelSubtitle` 895, `field` 118, `error` 507,
`fieldHint` 228, `ghActions` 1502, `ghMeta` 1493, `ghBadge` 1517 with
`ghBadgeNeutral` 1528 / `Success` 1544 / `Danger` 1549 / `Warning` 1560,
`linkButton` 752.

**AC14a. The panel has a title and subtitle**, in the canonical chrome used by
about 18 of 23 sites: `adaptPanel > adaptPanelHeader > (h2.adaptPanelTitle +
p.adaptPanelSubtitle)`. The `adaptPanelHeader` wrapper is load-bearing - it
carries `gap: 4px` against the panel's `gap: 18px`.
(`TakeAnnouncementPanel.tsx:152,174` omits it and is the outlier, not the model.)

**AC14. Orderable, two ways.**

- The `Name` and `Captured` column headers each contain a `<button>` inside the
  `<th>`, using `styles.linkButton`. Clicking cycles that column's direction.
  **Only those two `<th>`s carry `aria-sort`** (`"ascending"` / `"descending"`
  on the active one, `"none"` on the other); a non-sortable column advertising
  `aria-sort="none"` tells a screen-reader user it can be sorted when it cannot.
  `AutomationsPanel.tsx:163-172` puts `onClick` on a bare `<th>` with no button
  and is **not keyboard-operable** - it is the skin precedent, not the markup
  precedent. The markup precedent is `repo-grades/RepoGradesGrid.tsx:129-140`.
- Every row has `Move up` / `Move down` buttons in the **right-hand actions
  cell**, not a leading column - reorder is a rare action and must not occupy
  the first two tab stops of every row ahead of the textbox and the copy button.
- **The boundary buttons use `aria-disabled`, never `disabled`.** A `disabled`
  attribute applied to the focused button - press `Move up` until the row
  reaches position 1 - removes it from the tab order and **drops focus to
  `<body>`**, which `docs/modal-focus-restoration-acceptance-criteria.md` AC2
  forbids outright. The button stays focusable and its handler is a no-op that
  announces `Already first.` / `Already last.` into the panel's polite region.
- `sortReplyRows(rows, sort)` is pure and returns a new array; `"custom"` sorts
  by `order` ascending. Name sorting uses
  `localeCompare(b, undefined, { sensitivity: "base" })` so `alvarez` and
  `Alvarez` do not straddle the capitals.
- Switching to `"custom"` via a reorder announces the mode change
  (`Custom order.`) rather than changing it silently. See AC53 for the `order`
  rewrite that must accompany it.
- The sort choice persists under `ta-rec-disc-sort`.

**AC15. Columns**, left to right:

| Column | Content |
| --- | --- |
| Name | the author, as read off the screen; `<th scope="row">`; sortable header |
| Captured | `fmt`-free short local time from `firstSeenAt`; sortable header; renders `-` when `firstSeenAt` is 0 |
| Post | the captured post in a fixed-height scrollable cell (AC15a) |
| Reply | a **large editable textbox**: MUI `TextField` `multiline`, `minRows={6}`, `fullWidth`, `size="small"` |
| Status | one always-present badge (AC17) |
| (actions) | copy button, `Retry` (only when `state === "failed"`), `Move up`, `Move down`, `Remove` |

**The `Captured` column must actually be rendered.** The original AC14 offered
it as a sort key and the original AC15 never listed it - a direct contradiction
between two ACs that four concurrent implementers would each have resolved
differently. It is guarded on `firstSeenAt > 0`, because AC22 falls back to `0`
for a malformed persisted row and an unguarded render shows 1970.

**AC15a. The Post cell is a fixed-height scroll region, NOT a three-line clamp
with `Show more`.** The clamp cost one click on nearly every row - on the one
column the AC itself argues is essential for judging a reply - and expanding it
reflowed the table under the user mid-scan. The cell gets the same fixed height
as the reply box, `overflow-y: auto`, and - **mandatory, WCAG 2.1.1** - a
`tabIndex={0}` with an `aria-label` of `Post by ${row.author}`, because a
scrollable region must be keyboard-scrollable. Same tab-stop count as the clamp,
N fewer clicks, no reflow.

**AC15b. The reply textbox needs an accessible name.** A MUI `TextField` with no
`label` renders an unnamed `<textarea>`; `<th scope="row">` names the row, not
the control. This is a plain WCAG 4.1.2 failure on the feature's central
control. It carries
`slotProps={{ htmlInput: { "aria-label": \`Reply to ${row.author}\` } }}`.

**AC16. The copy affordance swaps the ICON, not the text.** `Copied` is six
characters inside a `size="small"` `IconButton`'s 30px circle - it clips, and
the one text-swapping site in the repo (`RowFeedbackBoxes.tsx:99-113`) is the
one that visibly shifts. The repo's idiom is `AiChatWindow.tsx:477-484`:
`CopyIcon` swaps to `CheckIcon` in the same box.

So `discussion-icons.tsx` exports **two** glyphs, not one - `CopyIcon` and
`CheckIcon` - both matching `courses/icons.tsx` exactly: `viewBox="0 0 20 20"`,
`width`/`height` `13`, `fill="currentColor"`, `aria-hidden="true"`,
`focusable="false"`. There is no `@mui/icons-material` in this repo and one is
not being added for two glyphs.

- The `aria-label` is **stable** (`Copy the reply to ${row.author}`) and does not
  change on copy: a changing label on a focused button is not reliably
  announced, which is why `CoursesTable.tsx:457-466` keeps its live region
  separate from its buttons. The `title` swaps, the icon swaps, and the
  confirmation is announced into the panel's polite region.
- 1500ms, cleared with the repo's stale-timer guard
  `setCopiedId((k) => (k === row.id ? null : k))`, so copying a second row does
  not cancel the first row's indicator early or resurrect it late.
- `disabled` when `reply` is empty.
- Clipboard failure - including a secure-context precheck - goes to the panel's
  error line, never into the icon slot:
  `Could not copy automatically. Select the text in the reply box and copy it.`

**AC17. Four states, one always-present badge.** State was previously signalled
from three different places with `ready` indicated by absence, in a table with
roughly 180px rows - not glanceable. Each row carries exactly one `ghBadge`:

| State | Badge | Variant |
| --- | --- | --- |
| `pending` | `Waiting` | `ghBadgeNeutral` |
| `drafting` | `Drafting` | `ghBadgeWarning` |
| `ready` | `Ready` | `ghBadgeSuccess` |
| `failed` | `Failed` | `ghBadgeDanger` |
| any, `userEdited` | `Yours` | `ghBadgeNeutral`, in addition |

- `pending` - the textbox `placeholder` is `Waiting to draft - or write your
  own.` (a `placeholder`, never rendered text, which would have to be cleared on
  focus). The textbox is editable; typing into it sets `userEdited` and the
  drafting queue skips the row.
- `drafting` - the textbox stays editable and is not overwritten if the user has
  typed since dispatch (AC44).
- `failed` - the row's `error` renders in `styles.error` **with its actual
  reason**, plus `Retry`.

**AC17a. A per-row failure must NOT be `role="alert"`.** AC27 fails up to five
rows per batch, and the repo's default alert idiom would fire five assertive
interruptions in a row. The per-row error is plain `styles.error` text; one
aggregate polite announcement covers the batch.

**AC18. Editing.** Typing in a reply textbox updates that row's `reply`, sets
`userEdited: true`, bumps its `editSeq` (AC44), and - when the row was `pending`
or `failed` - sets it to `ready`. Persistence is debounced per AC23.

**AC19. Deleting, and the arming is signature-based, NOT a timer.**

- `Remove` per row: one click when `!userEdited`. **When `userEdited` is true it
  arms first** - AC19's original reasoning ("re-capturing costs a scroll") holds
  for the captured post, not for prose the instructor wrote themselves.
  Focus after a removal goes to the next row's `Remove` via a keyed ref map,
  falling back to the actions-bar container with `tabIndex={-1}` - never
  `document.body` (`docs/modal-focus-restoration-acceptance-criteria.md`
  decisions 2, 3 and 5).
- `Delete table` uses `isConfirmArmed` from
  `content-tab/modules/confirmArming.ts` over the signature
  `` `${rows.length}|${recordingUrl ? "video" : "novideo"}` ``, with an explicit
  `Cancel`, and **no disarm timer**.

  A timer here reproduces REGRESSION entry 258 verbatim: capture is still
  running, so the user arms at 3 rows, a batch lands, and the second click
  deletes 9. That module's stated invariant is that **the confirmation matches
  the thing that would be deleted, not a timer since the last click**. There is
  no shared arming hook in this repo (`useArmedAction` / `useConfirmOnce` do not
  exist; about twenty sites hand-roll it), and the only two disarm timers in the
  codebase are 2000ms and 5000ms - a third magic number was not wanted, and
  "clicking anywhere else disarms" would need a document-level listener the repo
  has nowhere.

  The consequence sentence is attached with `aria-describedby` (the
  `GeneratedPostSection` precedent), and the armed and unarmed states are **two
  literal `<Button>` branches** so React reconciles them as the same element and
  focus survives arming (`tasks/TaskAttachmentsDialog.tsx:571-598` does exactly
  this).

**AC19a.** AC29's `Redraft every reply` arms the same way, with `audience`
included in the signature.

---

## 7. Persistence

**AC20.** Five new `localStorage` keys, all `ta-rec-` prefixed:

| Key | Holds |
| --- | --- |
| `ta-rec-disc-audience` | `"peers"` or `"students"` |
| `ta-rec-disc-course` | the selected course hub id, or `""` |
| `ta-rec-disc-save-video` | `"1"` / `"0"` |
| `ta-rec-disc-sort` | a `ReplySort` value |
| `ta-rec-disc-table` | the serialized table |

**AC21. The canary must be bumped in the same commit.** All five go into the
`expectedKeys` array in
`src/app/components/recording/recording-split.structure.test.ts`, in the sorted
position AC56 gives. A new key without the bump turns the whole suite red, which
is the canary working; shipping the key by loosening the canary is not an
option.

**AC22. Serialization.**

```ts
export const DISCUSSION_TABLE_VERSION = 1;

export function serializeReplyTable(rows: ReadonlyArray<ReplyRow>): string;
export function deserializeReplyTable(raw: string | null): ReplyRow[];
```

`serializeReplyTable` writes `{ v: DISCUSSION_TABLE_VERSION, rows }`. Rows in a
transient state are normalized on the way out: `drafting` is written as
`pending` (nothing is in flight after a reload), and `error` is preserved for
`failed` rows so a reload does not turn a real failure into a mystery.

**`userEdited` IS persisted.** It is not in-flight state like `editSeq` - it
records that a human wrote this reply, and if it is lost on reload the next
`Redraft every reply` silently overwrites hand-written work, which AC12 names as
the single worst thing this feature could do.

`deserializeReplyTable` **never throws**, following `coerceMessageDraftPayload`'s
discipline: a null/empty/unparseable input, a wrong `v`, or a non-array `rows`
all yield `[]`; individual malformed rows are dropped; missing `order` falls
back to the array index; missing `firstSeenAt` falls back to `0`; missing
`userEdited` falls back to `false`; an unknown `state` falls back to `"pending"`.
Both functions are unit-tested including a round-trip and a garbage-input case.

**AC23. Writing, with two debounces.** Structural changes - a merge, a reorder,
a removal, a drafted reply landing - are rare and the user expects immediate
durability, so they write at **400ms**. **Typing writes at 1000ms.**

`serializeReplyTable` re-serializes the whole table on every write and
`localStorage.setItem` is synchronous on the main thread. At 200 rows that is a
~336KB `JSON.stringify` plus a blocking write; at 400ms per keystroke it is
visible jank on a large table, and a keystroke is not worth a 400ms round trip
when AC57 already flushes once more on unmount.

**AC23a. The write failure is caught by CATCHING, never by name.** The rule
stands; **the two browser facts originally given for it were stale and are
withdrawn** (checked 2026-08-31): Firefox throws a standard
`QuotaExceededError`, and Safari private browsing has not thrown on every
`setItem` since 2017. The real reason to catch broadly is simpler and still
sufficient - the failure mode is not worth a name-match, browser behaviour here
has already changed once, and the shipped code catches correctly regardless. The
message is:

> `There is no room left to save the reply table. Your replies still work until
> you reload - copy the ones you need, then remove rows you are done with.`

which is true whatever the cause and names the right risk. The in-memory rows
keep working. The saved video Blob is never put in `localStorage`.

**AC23b. Quota is not the real bound; row count is, and it gets an actionable
ceiling.** MEASURED: one row at realistic sizes (800-char post, 700-char reply,
opaque id, JSON escaping) is **~1,680 characters**. Against a conservative
5,000,000-character quota that is **~2,970 rows**; a busy board is 30-200 posts,
so a 200-row table is ~336KB, three to four orders of magnitude of headroom.
(The actual per-origin quota is **UNVERIFIED** - historically 5MB, current
Chromium widely reported at 10MiB, Firefox and Safari differing again; 5,000,000
characters is the safe floor.)

So the realistic way to hit a write failure is that some *other* `ta-` key
filled the shared origin quota, which is why AC23a's message does not blame the
table's size. The actionable bound is instead checked **before** the write:
`mergeCapturedPosts` refuses to add rows past `MAX_TABLE_ROWS` (500), and the
panel surfaces `The reply table is full. Delete it, or remove some rows, to keep
capturing.`

**AC23c. Post text is NOT truncated on the way into storage.** Three reasons:
the action already caps at `MAX_POST_CHARS`; truncating on write would break
AC12's longest-wins merge, since a stored-truncated post looks shorter than the
next read of the same post and every subsequent capture would "update" it
forever without converging; and AC15's Post column exists so a reply can be
judged against what it answers, so silently storing a truncated post would make
the cell a lie.

**AC24. Loading.** The table is read once, in the `useState` initializer,
guarded by `typeof window === "undefined"`. It renders before, during, and after
any capture session - the table is not owned by a session, and there is no
"start a capture to see your replies" empty state hiding existing rows.

**AC24a. Restored `pending` rows do NOT auto-draft.** AC25 queues from
`mergeCapturedPosts`'s `addedIds`, so rows restored from storage are in no
queue. That is deliberate - a reload should not spontaneously spend money - but
it must be **stated**, because the natural reading of AC22's normalization is
that `pending` rows resume drafting. Without saying so, the panel ships with
rows sitting at `Waiting to draft` forever, looking broken. They are reached by
`Draft the missing replies` (AC28), and the persisted-table empty-state copy
(AC59) says so.

---

## 8. The drafting queue

**AC25.** After `mergeCapturedPosts` returns `addedIds`, those rows are queued.
The queue drains in batches of at most `DRAFT_BATCH_SIZE` (5) rows, **one
request in flight at a time**, and runs concurrently with (not after) the
extraction loop - Next.js serializes client-dispatched Server Functions anyway,
so the two interleave rather than truly overlap, and the user sees replies
appear while they are still scrolling.

**AC26.** Rows move to `drafting` when their batch is dispatched. On success,
each returned `id` gets its `reply` and `state: "ready"` - **unless the user
has edited that row's textbox since dispatch**, in which case the model's text
is discarded and the row is left as the user typed it.

**AC27.** On a batch-level error, every row in the batch becomes `failed` with
that error as its `error`. On a batch that succeeded but omitted an id, only
that row becomes `failed` with `The model did not return a reply for this post.`

**AC28.** `Retry` on a row re-queues it alone. `Draft the missing replies` above
the table re-queues every `pending` and `failed` row - one click to recover from
a transient quota blip across a whole table, instead of N.

**AC28a. The two differ on whether they override `userEdited`, and that
asymmetry is deliberate.** A row can be `failed` while holding prose the
instructor wrote (hand-edit a reply, run `Redraft every reply`, have the batch
fail). The automatic queue must never overwrite that text - but a control the
user aimed at that specific row must always do something, or it is a dead
button.

So: **`Retry` forces past the `userEdited` guard; `Draft the missing replies`
does not.** `Retry` is a targeted, per-row affordance sitting next to a visible
`Failed` badge - clicking it is an unambiguous instruction about that one row.
The bulk button is untargeted and sweeps every row at once, so it keeps AC52's
protection and simply skips rows carrying the author's own text. `Redraft every
reply` also forces, because it is armed (AC29) and overwriting is its entire
purpose.

A row that is `failed` and `userEdited` is therefore reachable by `Retry` and by
`Redraft every reply`, and deliberately not by the bulk button. That is a
decision, not an oversight.

**AC29.** Changing the audience select does **not** re-draft existing rows;
their replies are already edited work. A `Redraft all with this audience` text
button appears next to the select once the table is non-empty, and it is armed
the same way `Delete table` is - it overwrites replies.

---

## 9. Course context

**AC30.** A `Course` select, loaded via `listCourseHubAction()` and mapped to
`{ id, name }`, persisted under `ta-rec-disc-course`, and **optional** - the
flow works fully with no course selected, since the posts on screen may belong
to a board this app does not know about. When one is selected its name is passed
to both actions as `courseName`; when not, `""` is passed and the prompts omit
the course line entirely rather than saying "unknown course".

**The list is NOT filtered.** `useTakeAnnouncement.ts:363-370` drops
`canvasUrl: null` tiles because that hook posts to Canvas and an export-only
tile would fail at post time. This feature never posts anything (D0-3) and
`courseName` is prompt context only, so filtering here would hide courses the
instructor could legitimately name.

**AC30a.** `courses: null` is ambiguous between "never activated" and "still
loading", which the UI cannot render correctly. The hook exposes
`coursesLoading: boolean` alongside it.

A course-loading failure sets a hint under the select
(`Could not load your courses - drafting still works without one.`) and never
blocks capture.

---

## 10. The optional saved recording

**AC31.** `Save the screen recording too` (checkbox, `ta-rec-disc-save-video`,
default off). When on at the moment `Start capture` is pressed, a
`MediaRecorder` is started on the display stream with the first supported type
from `["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]`, tested
with `MediaRecorder.isTypeSupported`, falling back to no `mimeType` option.
Chunks are collected in a ref; on stop, the Blob is kept and the panel shows
`Download recording (N.N MB)` as a download link.

Toggling the checkbox mid-session does nothing to the running session; the
control's hint says `Applies to the next capture.`

The object URL is revoked when a new session starts, when the recording is
replaced, when the table is deleted, and on unmount. `MediaRecorder` failing to
start is caught and surfaced as
`Could not save the recording: <reason>. The capture is still running.` - the
capture is the point and must not die with the optional extra.

---

## 11. Non-functional requirements

**AC32.** No emojis anywhere - enforced by `src/lib/no-emojis.test.ts`.

**AC33.** Every new file stays under the 1000-line ceiling enforced for
`src/app/components/recording/*` by `recording-split.structure.test.ts`. New
recording files go **directly in** `recording/`, not a subdirectory - that
test's `readdirSync` is non-recursive and a subdirectory would escape both the
line cap and the localStorage-key scan.

**AC34.** `RecordingTab.tsx` stays under 1000 lines. It was 712 before this
group and is **725** after it - the four-line wiring of AC1-AC3 plus a comment
explaining why the new panel joins the always-mounted stack. (The original
estimate of "roughly six" is superseded by the measured number.)

**AC35.** Registry/client-bundle safety: `discussion-capture.ts` and
`discussion-reply-prompt.ts` import nothing server-only. `discussion-capture.ts`
is `"use client"`-safe but contains no React. `discussion-reply-prompt.ts` is
imported by both the server action and (for `DISCUSSION_AUDIENCE_LABELS` and
`normalizeAudience`) the client, so it must stay dependency-free.

**AC36.** Accessibility: the table has a `<caption>` reading
`Captured discussion posts and drafted replies`; the author cell is
`<th scope="row">`; every icon button has a real `aria-label`; sort headers
carry `aria-sort`; the status row is `aria-live="polite"`.

**AC37.** The panel does no work at all when it has never been opened and no
persisted table exists: the course list loads lazily on first activation
(`active === true`), not on mount, so a user who never opens this view never
pays a `listCourseHubAction` round trip.

---

## 12. File ownership (the disjoint split step 6 dispatches against)

**Seven sets, one wave.** The original five-set split put every client
responsibility in one hook; sized against this repo's two closest analogues
(`useRecorder.ts` 961 lines, `useTakeAnnouncement.ts` 915, both owning *less*),
that file lands at 1110-1250 lines including this repo's 25-40% comment
overhead. That is a breach of the ceiling
`recording-split.structure.test.ts` enforces, and the `ModulesView` precedent
says a dedicated extraction agent afterwards still leaves the file bigger than
planned. It is therefore split **now, before the code exists**, by *lifetime*
rather than by feature name.

| Set | Files | Written against |
| --- | --- | --- |
| **A** | `recording/discussion-capture.ts`, `recording/discussion-capture.test.ts` | B's three shared constants, by contract |
| **B** | `lib/discussion-reply-prompt.ts`, `lib/discussion-reply-prompt.test.ts`, `actions/discussion-replies.ts` | nothing |
| **C1** | `recording/useDiscussionCapture.ts` | A |
| **C2** | `recording/useReplyRows.ts` | A |
| **C3** | `recording/useDiscussionReplies.ts` | A, B, C1, C2 |
| **D** | `recording/DiscussionRepliesPanel.tsx`, `recording/DiscussionReplyRow.tsx`, `recording/discussion-icons.tsx`, `recording/DiscussionRepliesPanel.module.css` | C3's return shape, A's types |
| **E** | `components/RecordingTab.tsx`, `recording/recording-split.structure.test.ts`, `components/courses/page-module-css-classes.test.ts` | AC1-AC3, AC21, AC56, D's default export |

**`page-module-css-classes.test.ts` was an unowned file** and is assigned to E.
It guards every `src/**` import that resolves to `page.module.css`, and all
eight recording panels import it; set D's new panel joins that population, and
its `STYLESHEETS` list needs `AutomationsTable.module.css` added so the reused
table skin is checked the same way. An unowned file that a wave's work makes red
is exactly how a wave ends with an agent "fixing" a guard it does not own.

All paths under `recording/` are `src/app/components/recording/`.

No file appears in two sets. **`src/app/actions.ts` and
`src/app/components/manual/manual-rail.ts` are edited by NOBODY.** An agent that
finds a sibling's module missing from disk reports it and does not create it or
inline a copy.

### The C1 / C2 / C3 boundaries

**C1 `useDiscussionCapture.ts`** owns everything with a **device** lifetime and
knows nothing about rows, replies, the LLM or localStorage: `getDisplayMedia`,
the detached sampling video (AC8b), the DOM preview video, the `ended` listener,
the single idempotent `teardown()`, the Worker ticker, the offscreen canvas,
signature + threshold, the pending frame queue and its backpressure,
`elapsedSec`, stall detection (AC8c), and the optional `MediaRecorder` with its
Blob and object URL.

```ts
export interface UseDiscussionCaptureReturn {
  capturing: boolean; elapsedSec: number; pendingFrames: number;
  stalled: boolean;
  /** AC10: session-level count of frames dropped to backpressure. Drives the
   *  stop-time "scrolled past faster than it could be read" notice. Without
   *  this on the interface the loss is invisible, which is the defect AC10
   *  exists to prevent. */
  droppedFrames: number;
  /** AC31: why the optional MediaRecorder failed to start, or null. Capture
   *  continues regardless - but the reason must reach the user, not a
   *  console.warn. */
  recordingError: string | null;
  recordingUrl: string | null; recordingBytes: number;
  previewRef: React.RefObject<HTMLVideoElement | null>;
  start: (opts: { saveVideo: boolean }) => Promise<void>;
  stop: () => void;
  /** Removes and returns up to `max` frames, oldest first, packed to fit
   *  `maxWireBytes` (AC10a). Never returns more than asked for; always
   *  returns at least one frame when the queue is non-empty. */
  takeFrameBatch: (max: number, maxWireBytes: number) => Array<{ base64: string }>;
  clearRecording: () => void;
}
```

**C2 `useReplyRows.ts`** owns everything with a **table** lifetime and knows
nothing about streams or the LLM: `rows`, `sort`, the `editSeqRef` generation
map and the `tableEpochRef` (AC38), `mergeIncoming`, sort application,
`moveRow`, `editReply`, `removeRow`, `clearTable`, `markDrafting`, `applyReply`,
`markFailed`, and the `ta-rec-disc-table` / `ta-rec-disc-sort` persistence
(400ms debounce, `QuotaExceededError` catch, unmount flush).

**C3 `useDiscussionReplies.ts`** is the orchestrator and the **only** file D
imports. It composes C1 and C2, owns the two async loops, `Draft all pending`,
`Retry`, `Redraft all`, the lazy course load, and the three simple persisted
controls (`audience`, `courseId`, `saveVideo`). It assembles
`UseDiscussionRepliesReturn` **unchanged** - which is the point of the split: D
is unaffected by it.

C1 and C2 are disjoint from each other and are written concurrently.

### Set D also splits, for a performance reason

A controlled multiline `TextField` per row, with every row re-rendered on every
keystroke because `rows` is one array in one hook, is visibly laggy past about
25 rows. `DiscussionReplyRow.tsx` is therefore a separate `React.memo` child
owning its own `copied` and `expanded` state. For the memo to do anything, C2's
`editReply` must be a stable `useCallback` and **every** row updater must return
the identical object reference for untouched rows.

`DiscussionRepliesPanel.module.css` is in D's list explicitly: there is no
shared table stylesheet reachable from `recording/` (`CoursesTable.module.css`
is scoped to `courses/`, and `page.module.css` has panel, error and hint classes
but no table classes). A `.module.css` is invisible to
`recording-split.structure.test.ts`, which filters `/\.(ts|tsx)$/` - so it
escapes both the line cap and the key scan, and **no localStorage key may be
named in it**.

### Wave sequencing facts every brief must carry

1. **`npx vitest run` is NOT a per-agent gate this wave.** E's `expectedKeys`
   bump is red until C1/C2/C3 land the key literals, and the key literals are
   red until E's bump lands. They are mutually red by construction. The
   dispatcher runs the full suite once, after the wave. An agent that "fixes"
   the canary by deleting keys from `expectedKeys` has broken the thing the
   canary exists for.
2. Each agent's own gate is `npx eslint <its files>` plus `npx tsc --noEmit`
   read with sibling-module errors filtered out. `Cannot find module` for a
   sibling is **expected** during the wave and is reported, never fixed by
   creating the sibling's file or inlining a copy.
3. Only **A** and **B** are gate-clean standalone.
4. **Never `git stash`.** One agent's stash reverts every sibling's work.

### C3's public contract, so D can be written against it without waiting

```ts
export interface UseDiscussionRepliesReturn {
  audience: DiscussionAudience;
  setAudience: (a: DiscussionAudience) => void;
  courseId: string;
  setCourseId: (id: string) => void;
  courses: Array<{ id: string; name: string }> | null;
  coursesLoading: boolean;
  coursesError: string | null;

  saveVideo: boolean;
  setSaveVideo: (v: boolean) => void;
  recordingUrl: string | null;
  recordingBytes: number;

  capturing: boolean;
  elapsedSec: number;
  pendingFrames: number;
  droppedFrames: number;
  extracting: boolean;
  stalled: boolean;
  notices: Array<{ id: string; text: string }>;
  dismissNotice: (id: string) => void;
  previewRef: React.RefObject<HTMLVideoElement | null>;
  start: () => Promise<void>;
  stop: () => void;

  rows: ReplyRow[];            // already sorted for display
  sort: ReplySort;
  setSort: (s: ReplySort) => void;
  moveRow: (id: string, dir: "up" | "down") => void;
  editReply: (id: string, text: string) => void;
  removeRow: (id: string) => void;
  retryRow: (id: string) => void;
  draftAllPending: () => void;
  redraftAll: () => void;
  clearTable: () => void;
  drafting: boolean;
}
```

**AC38. `notices` is a LIST, and that is a correctness requirement, not a
nicety.** A single `notice: string | null` slot is shared by four unrelated
failures - an extraction batch failure, a drafting batch failure, a
`MediaRecorder` start failure (AC31), and a `QuotaExceededError` (AC23) - and
the newest silently overwrites the previous, so a storage-quota message erases
the 429 the user actually needed to act on. Collapsing distinct failures into
one indistinguishable state is the defect `docs/DEV_LOOP.md` step 8 names as the
one this loop catches most often, and it is not being designed in on purpose.

The list is capped at 4, oldest evicted, and identical consecutive texts are
deduped so a repeating 429 does not build a wall.

**AC39. What lives in D, not in C3**, so the two do not each build it: the
two-step arming for `Delete table` (AC19) and `Redraft every reply` (AC29); the
per-row `copied` state (AC16); and the per-row `removeArmed` state (AC19). C3's
`clearTable` and `redraftAll` are the **committed** actions and are not
themselves armed. `capturedPostCount` is not a field - it is `rows.length`.

**Two corrections to earlier drafts of this line, both of which contradicted
later ACs and are withdrawn:**

- There is **no 6-second disarm timer and no click-elsewhere document
  listener.** AC19 governs: arming is signature-based via `isConfirmArmed`,
  because capture is still running and a timer lets the user arm at 3 rows and
  delete 9 - REGRESSION entry 258 verbatim.
- There is **no per-row `Show more` state**, because AC15a replaced the
  three-line clamp with a fixed-height scroll region. There is nothing to
  expand.

---

## 13a. Concurrency, lifecycle and teardown

The two async loops mutate one `rows` array while the user types into it. These
rules are not style preferences; each closes a specific way this feature would
silently corrupt the instructor's work.

**AC40. Every write to `rows` is `setRows(prev => ...)`. No exceptions.** Neither
loop may compute a next array from a `rows` value captured in a closure - both
are `await`-suspended across renders and their closure is stale by definition.
Both updaters `map` over `prev` and touch only ids they own; a returned reply for
an id absent from `prev` (removed, or cleared) is dropped, written as an
intentional branch with a comment rather than left as an accident of `map`. Every
updater returns the identical object reference for untouched rows.

**AC41.** Anything a loop reads to decide what to dispatch (`rows`, `sort`,
`audience`, `courseId`) is read through a ref mirrored in an effect - the
`recStateRef` / `transcriptRef` idiom (`useRecorder.ts:197-199`,
`useTakeAnnouncement.ts:323`). Refs are for scheduling only and are never the
source of a state write.

**AC42.** Non-React bookkeeping (`editSeqRef`, `tableEpochRef`, the pending
frame queue) lives in `useRef`, mutated in event handlers and loop bodies,
**never inside a `setState` updater** - which would double-fire under
StrictMode. The `hubCache` setState-updater workaround
(`useCoursesData.ts:56-62`) must **not** be copied here: that rule
(`react-hooks/globals`) is about module-scope reassignment, and a ref mutation
is the correct form. Copying it would be cargo cult.

**AC43.** Each loop is a `while` driven by an `isRunningRef` latch, not an effect
keyed on `rows` - an effect keyed on `rows` re-enters on its own output.

**AC44. AC26's edit-guard mechanism, named: a per-row monotonic `editSeq` in
`editSeqRef: React.MutableRefObject<Map<string, number>>`.** Not a timestamp
(two keystrokes in the same millisecond are indistinguishable, and a laptop that
sleeps mid-capture adjusts its clock), and not a field on `ReplyRow` (AC22
deliberately strips in-flight state on the way to storage; a generation counter
is purely an in-flight concern). C2 exposes:

```ts
bumpEditSeq(id)                        // editReply calls this BEFORE setRows
snapshotEditSeq(ids): Map<string, number>
isUnchangedSince(id, snap): boolean    // (editSeqRef.get(id) ?? 0) === snap.get(id)
```

Dispatch snapshots; on response, a returned reply is applied only when
`isUnchangedSince`, else the model's text is discarded and the row is set
`ready` on the user's own text.

**AC45. `tableEpochRef` is a second, separate guard.** AC40's map-over-`prev`
rule protects *updates* but not *insertions*: `clearTable` while an extraction
request is in flight lets the response land afterwards and **resurrect the posts
the user just deleted**. `clearTable` (and `redraftAll`) increment
`tableEpochRef.current`; the extraction loop snapshots the epoch before dispatch
and drops the entire merge if it changed.

**AC46. `active` must never gate the capture machinery.** The ticker, both
loops, the `MediaRecorder`, teardown and persistence are explicitly independent
of it, or switching to `Change speed` mid-capture kills the session. The course
load is latched on a `hasActivatedRef` set at the first `active === true`, so it
runs once and does not refetch on every return (AC37).

**Corrected wording.** This clause previously read "gates NOTHING but the course
fetch", which is no longer true of the code and was flagged as such: `active`
legitimately reaches a second effect. The prohibition is what matters and it is
restated above as a prohibition on the capture machinery, not as a claim about
the number of call sites - a claim that was bound to go stale and did. Any new
use of `active` must be commented at its site with what it gates and why, so the
next reader does not "correct" it back.

`RecordingTab` passes `active && recView === "discussions"`, not
`recView === "discussions"` alone, so the lazy course fetch cannot fire while the
whole Recording tab is off-screen.

**AC47. `aria-live` inside a `display:none` subtree is not announced at all.**
AC7's 5-second throttle is wall-clock (`lastAnnouncedAtRef`), not a counter, so
returning to the view does not fire a burst of queued announcements.

**AC48. Teardown is one function, guarded, and is NOT idempotent by
construction.** Facts established for each resource:

- `track.stop()` on an already-ended track is a safe no-op, and `track.stop()`
  does **not** fire `ended` - so our own teardown never re-enters through the
  listener. The real double-call is a manual `Stop` after the browser's "Stop
  sharing" bar has already fired `ended`.
- `startFrameTicker`'s `stop()` is idempotent, but the ref is nulled after
  stopping, following `useCanvasPipeline.stopPipeline`.
- **`MediaRecorder.stop()` on an `inactive` recorder.** The guard on
  `state !== "inactive"` stays, but its stated justification was **WRONG and is
  corrected here**: verified 2026-08-31 against the spec, `stop()` on an
  inactive recorder does **not** throw - it returns without effect. (MDN says
  otherwise and is incorrect.) The guard is kept because it is harmless,
  defensive, and matches `useRecorder.ts:897-905`'s existing shape, not because
  a double teardown would explode. Anyone reading this later: do not go looking
  for the crash this comment used to promise.
- The adjacent claim in this AC that `track.stop()` does **not** fire `ended`
  was checked and **is** correct.
- `URL.revokeObjectURL` twice is a no-op.

```ts
const tearingDownRef = useRef(false);
const teardownRef = useRef<() => void>(() => {});   // useRecorder.ts:914-917 idiom
function teardown() {
  if (tearingDownRef.current) return;
  tearingDownRef.current = true;
  try { /* ticker, tracks, recorder (guarded), video srcObject, timer */ }
  finally { tearingDownRef.current = false; }
}
```

All three triggers call `teardownRef.current()`. The unmount cleanup uses the
ref so its effect has `[]` deps and never re-runs
(`RecordingTab.tsx:476-488`).

**AC49. Teardown must NOT clear the MediaRecorder chunks ref.** `recorder.stop()`
is asynchronous: the final `dataavailable` and `onstop` arrive *after* teardown
returns, and `onstop` is what builds the Blob (AC31). `start()` clears the
chunks; `stop()` never does.

**AC50.** `recorder.onstop` and any in-flight action response can land after
unmount. Every post-`await` `setState` is guarded by a `mountedRef`
(`useTakeAnnouncement.ts:393-401` is the precedent).

**AC51. The extraction loop outlives `capturing === false`.** AC6 requires
teardown to flush the pending queue so posts already scrolled past are not
thrown away, so `capturing` cannot be the loop's termination condition - the
loop drains to empty. `elapsedSec` freezes at stop while `pendingFrames` keeps
counting down.

**AC52. The drafting queue re-checks a row's state at DISPATCH time, not at
enqueue time.** AC17 says a `pending` row the user has typed into is treated as
ready and skipped; if that check happens at enqueue, the row is already in the
batch and gets overwritten. `retryRow` is valid on `pending` and `failed` rows;
`Draft all pending` re-queues both; both skip any row whose `reply` is non-empty.

**AC53. `moveRow` sets `sort` to `"custom"` in the SAME state update**, and -
when the previous sort was not already `"custom"` - first rewrites every row's
`order` to its current **displayed** index before performing the swap. Without
this, the first `Move up` after a `Name` sort reorders against capture-time
`order` values that bear no relation to what is on screen, and the table visibly
scrambles. `moveRow` operates on the displayed order, since `rows` is documented
as already sorted for display.

**AC54.** `mergeCapturedPosts` tie-break when two incoming entries share a key
with equal-length text: the **first** wins. Pinned because it is otherwise a
nondeterministic test.

**AC55. localStorage keys are written as whole string literals.** Never
`` localStorage.setItem(`ta-rec-disc-${name}`, ...) ``: the canary derives its
set with `/ta-rec-[a-z-]*/g` (`recording-split.structure.test.ts:121`), so a
template literal contributes the fragment `ta-rec-disc-` and turns the whole
suite red for a reason nobody will recognise.

**AC56.** The five new keys sort between `"ta-rec-cards"` and `"ta-rec-echo"`,
in this order: `ta-rec-disc-audience`, `ta-rec-disc-course`,
`ta-rec-disc-save-video`, `ta-rec-disc-sort`, `ta-rec-disc-table`. Note
`save-video` precedes `sort`.

**AC57.** AC23's "once more on teardown" means on **unmount**, not on session
stop - a stopped session is followed by more edits.

**AC58.** AC17's `Waiting to draft...` is the `TextField`'s `placeholder` prop,
not rendered text; the textbox is editable and rendered text would have to be
cleared on focus.

---

## 13. What this feature explicitly does not do

Recorded so a reviewer does not report them as gaps:

- It does not post, send, or submit any reply anywhere. Copy is the only export.
- It does not read the discussion over the Canvas API (D0-1).
- It does not identify students against a roster; the name is whatever text the
  model read next to the post.
- It does not upload the optional recording to Supabase or the recording library.
- It does not sync the table across devices.

---

## 14. Trade-offs already rejected

Recorded from the architect pass so step 8 and step 10 do not reopen them. New
evidence reopens any of these; a preference does not.

1. **Reading the posts over the Canvas API instead of off the screen.** D0-1.
   A board this app has no credentials for is the motivating case.
2. **OCR (tesseract.js) instead of a vision model.** A new dependency, worse on
   LMS layout, and it still would not separate author from body.
3. **Uploading the captured video and extracting server-side.** Turns a
   ~200KB-per-request feature into a multi-MB upload the 4.5MB platform cap
   forbids anyway.
4. **`requestAnimationFrame` or a bare `setInterval` for the tick.** See
   `frame-ticker.ts`'s header and AC8.
5. **Dropping the OLDEST frame under backpressure.** AC10's reasoning stands:
   the newest frame's content is still on screen and will be sampled again.
6. **Persisting the table to Supabase.** D0-4.
7. **Adding `@mui/icons-material`.** Not in the repo; one glyph does not
   justify it.
8. **A `recording/discussions/` subdirectory.** The structure test's
   `readdirSync` is non-recursive, so a subdirectory escapes both the line cap
   and the key scan. AC33.
9. **Keeping set C as one file.** Rejected on the line arithmetic in section 12
   and the `ModulesView` precedent.
10. **`editSeq` as a persisted field on `ReplyRow`, or a wall-clock timestamp
    instead of a generation counter.** Both rejected in AC44.
11. **Uncontrolled row textboxes with debounced sync to the hook.** It would fix
    the re-render cost, but it breaks AC26's edit-guard: the hook would not know
    about an edit until after the debounce. `React.memo` plus stable object
    identity solves the same problem with no correctness loss.
12. **Re-drafting automatically when the audience changes.** AC29. It would
    destroy edited work.
13. **Auto-starting capture on first activation.** The `getDisplayMedia` picker
    requires a user gesture.
14. **`MediaStreamTrackProcessor` or `ImageCapture.grabFrame()` for frames.**
    Both are Chromium-only for display tracks and neither has precedent in this
    repo; the detached-`<video>` + `drawImage` path is proven here.
15. **Copying the `hubCache` setState-updater workaround.** AC42.
16. **Importing the actions through the `src/app/actions.ts` barrel.** AC4b.
17. **Adding `"discussions"` to `isManualViewType`.** Wrong file, wrong concept.
    AC2.
18. **Moving dedupe server-side.** It needs the existing table, which never
    leaves the browser (D0-4).

---

## 15. Limits this feature's REGRESSION entry must state

Drafted now, while the reasons are fresh, so the entry cannot quietly omit them.

- **Worker-timer behaviour and MediaStream frame delivery while this tab is
  hidden were never measured for this feature, on any browser.** The design
  relies on `startFrameTicker` and on a detached `<video>` yielding frames to
  `drawImage` - both of which the shipped Record stage also relies on, but
  neither was instrumented here. AC8c's `stalled` notice is the only thing
  standing between a browser that throttles either one and a capture session
  that silently records nothing. It was never observed firing.
- **Extraction accuracy was never measured against a real discussion board**, at
  any frame width, in any LMS. `FRAME_MAX_WIDTH` was chosen by reasoning about
  text legibility and wire cost, not by trial.
- **No component in this group is rendered by any test.** vitest here is
  node-env and collects only `src/**/*.test.ts`. Every claim about the table's
  markup, its `aria-sort`, its keyboard path, the copy button, or the armed
  delete comes from reading the source.
- `getDisplayMedia`, `MediaRecorder`, `Worker`, `canvas.toDataURL` and
  `navigator.clipboard` do not exist in the node test environment. Nothing in
  the suite exercises the capture path end to end.
- **No frame ever reached Gemini and no reply was ever drafted under test.** The
  two server actions are covered only for their guard clauses, their batching
  refusals and their parsing, against a mocked `callLlm`.

---

## 16. Controls, empty states and copy

**AC59. Empty states - all four, because all four were missing.** The repo's
pattern is a `<p className={styles.fieldHint}>` (never `styles.emptyState`,
which no recording panel uses), worded `No <plural> yet - <the action that fixes
it>.` with an ASCII hyphen (`TakesPanel.tsx:117-123`).

| Situation | Copy |
| --- | --- |
| Never opened, no table | `No replies yet - start a capture, then scroll through the discussion board in the other window.` |
| A persisted table exists | `${n} replies kept from an earlier session. They stay here until you delete the table.` |
| Capturing, nothing found yet | status: `Capturing - 0 posts so far.`; table area: `Posts appear here as you scroll past them in the other window.` |
| Stopped, nothing found | `Capture stopped after ${fmt(elapsedSec)}. No posts were found. Check that you shared the window showing the discussion board, and scroll through the posts while the capture is running.` |

The capturing-with-zero state must **not** lead with the count: zero cannot
distinguish "broken" from "you have not scrolled yet", and the sentence has to
carry that.

The stopped-with-zero state is the "it did not work" moment and is the most
important string in the feature. Beneath it, list the **distinct** notice
reasons (AC38), so six repeated 429s do not read as "you shared the wrong
window".

**AC60. The audience control is a one-click toggle, not a select.** Two options
never justified a select's open-then-choose. Use the repo's existing
`variant={x ? "contained" : "outlined"}` pair
(`StagePanel.tsx:441-455`), labelled:

> `Replying to:  [ My students ]  [ Fellow educators ]`

`DISCUSSION_AUDIENCE_LABELS` is a display map only, so this is a copy change and
no contract change; the drafting prompt itself already says "a fellow
educator's post". The persisted value is still `"peers"` / `"students"`.

**AC61.** The `Redraft every reply` slot is **reserved** in the layout so the
audience control does not shift sideways the moment the first post lands.

**AC62.** The panel tells the user they can stop from the browser's own sharing
bar - AC6 already wires the `ended` event, but nothing in the UI said so:
`You can also stop from your browser's sharing bar.`

**AC63. The copy sheet.** Exact strings. Where a string is not listed here, the
one given in the AC body stands.

| Where | String |
| --- | --- |
| extraction in flight | `Reading the screen...` |
| backpressure | `Catching up - scroll a little slower.` |
| pending reply placeholder | `Waiting to draft - or write your own.` |
| model omitted a reply | `No reply came back for this post.` |
| clipboard refused | `Could not copy automatically. Select the text in the reply box and copy it.` |
| storage write failed | `There is no room left to save the reply table. Your replies still work until you reload - copy the ones you need, then remove rows you are done with.` |
| re-queue button | `Draft the missing replies` |
| redraft button | `Redraft every reply` |
| save-video checkbox | `Also save the screen recording` |
| extraction batch failed | `Some of the screen could not be read: ${reason} Capture is still running.` |
| table row ceiling | `The reply table is full. Delete it, or remove some rows, to keep capturing.` |
| frames dropped | `Some of the screen scrolled past faster than it could be read. Scroll back over that section to catch it.` |
| stall (AC8c) | `Nothing new has been read off the screen for 30 seconds. Keep this app's tab visible in a second window while you scroll.` |

Already correct, do not rewrite: `Could not start the screen capture: <reason>`,
`Could not save the recording: <reason>. The capture is still running.`,
`Could not read any posts from that part of the screen.`,
`Could not load your courses - drafting still works without one.`,
`Applies to the next capture.`, and the table caption
`Captured discussion posts and drafted replies`.

`Draft all pending` was renamed because it also re-queues **failed** rows
(AC52), so the old label was wrong about what the button does.

---

## 17. The two prompts, in full

Both live in `src/lib/discussion-reply-prompt.ts` (set B) and are unit-tested
there. Fold these verbatim; they are the contract, not a sketch.

### 17a. `buildPostExtractionPrompt(courseName, frameCount)`

```ts
export function buildPostExtractionPrompt(courseName: string, frameCount: number): string {
  const course = courseName.trim();
  return [
    `The ${frameCount} images are consecutive screenshots of an online course discussion board, captured about a second apart while the reader scrolled down the page.`,
    course ? `The board belongs to a course called "${course}".` : "",

    "Read the discussion posts written by people and return them.",

    "HOW THE IMAGES RELATE TO EACH OTHER",
    "- The images overlap heavily. The same post will usually appear in several of them, in a different vertical position each time. That is one post, not several. Return it ONCE.",
    "- When a post appears in more than one image, use the reading in which the MOST of its text is visible.",
    "- When the top of a post is visible in one image and the bottom in another, join the two halves into one post and return the joined text.",
    "- Read the images in the order given; they run top-to-bottom down one page.",

    "WHAT COUNTS AS A POST",
    "- A post is a person's own writing, with their display name shown next to it.",
    "- Include replies nested underneath other posts. Return each one as its own entry with its own author. Do not merge a reply into its parent and do not prefix it with the parent's text.",
    "- Include posts by the instructor or by anyone else. Do not skip a post because of who wrote it, and do not mark it in any way. The author's name is the only thing that distinguishes it.",
    "- Ignore everything that is page furniture rather than someone's writing: navigation bars and menus, course sidebars, breadcrumbs, buttons and links such as Reply, Like, Edit, Delete, Subscribe, Mark as read, Search entries, Sort by, Expand threads; reply counters such as \"3 replies\" or \"12 unread\"; avatars and profile pictures; badges, pill labels, points, and any grading or rubric panel.",
    "- Ignore the discussion's own prompt or question at the top of the page if it is the assignment text rather than a person's post. If it carries a person's display name, treat it as a post.",

    "TIMESTAMPS",
    "- Do not put the post's timestamp inside its text.",
    "- Report it separately in \"postedAt\", exactly as it is shown on screen, for example \"Mar 12 at 9:04 PM\".",
    "- If no timestamp is visible for a post, leave \"postedAt\" out of that entry entirely.",

    "TEXT THAT IS CUT OFF",
    "- If a post is truncated by a control such as \"Show more\", \"Read more\", \"See more\" or an ellipsis, return only the text that is actually visible, and do NOT include the control's own words in the text.",
    "- If a post runs off the bottom edge of the last image, return the visible part.",
    "- If a post's author name is NOT visible in any image - because the top of the post was already scrolled past - SKIP that post entirely. Do not guess who wrote it and do not attribute it to the nearest name you can see.",
    "- Never continue, complete, summarise, paraphrase, correct or tidy a post. Transcribe the words that are on the screen. If you cannot read a word, leave it out rather than inventing one.",

    "IF THERE ARE NO POSTS",
    "- If these images show only navigation, a course home page, an empty board or a loading state, return an empty array: []",

    "OUTPUT",
    'Return ONLY a JSON array, and nothing else. Each element is {"author": "...", "text": "...", "postedAt": "..."} - no other keys, and "postedAt" omitted when it is not visible.',
    '"author" is the display name exactly as it is shown, with no title, no timestamp and no role label.',
    '"text" is the post\'s words as plain text. Use "\\n" between paragraphs. Do not use markdown and do not use backticks.',
    "Order the array the way the posts appear on the page, top to bottom.",
    "No prose before or after the array. No code fences.",
  ].filter(Boolean).join("\n\n");
}
```

The `author name not visible -> SKIP` rule is load-bearing, not decoration: a
post whose opening has scrolled off the top produces a headless fragment that no
prefix-similarity scheme can match back to the full post. Solving it in the
prompt is free; solving it in `mergeCapturedPosts` is not possible.

`Do not use backticks` is also load-bearing - see AC64.

**AC64. `parseLenientJsonArray` will corrupt any post containing a code fence,
and this repo serves programming courses.** `lenient-json.ts:8` runs
`text.replace(/```[a-z]*\n?/gi, "")` over the **entire response, including
inside string values**, before parsing. A student post containing a fenced code
block comes back with that token deleted from the middle of a sentence. It does
not throw and it does not fail to parse - it silently returns a mangled post,
which then feeds the dedupe comparison and the drafting prompt.

Given GitHub student repos, per-student repo binding and CS course tiles, a
discussion board with a code fence in it is an ordinary Tuesday here.
Mitigation is the prompt line above; **fixing `lenient-json.ts` itself is a
separate chunk** and would touch every existing caller, so the residual risk is
recorded here and in the Limits rather than fixed in passing.

The same function's fence-stripping does mean the `No code fences` instruction
is belt-and-braces rather than load-bearing for parsing - a fenced array, a
fenced array with prose around it, and a bare array all parse today. Keep the
instruction (it saves output tokens); **do not add fence handling on top of it.**

### 17b. `buildReplyDraftingPrompt(posts, audience, courseName, styleBlock)`

```ts
const AUDIENCE_STANCE: Record<DiscussionAudience, string> = {
  students: [
    "You are the instructor, replying to a student's post on your course discussion board.",
    "Be warm, specific and encouraging. Open by naming something the student actually said - quote or paraphrase their own words, not a generic compliment.",
    "Add one substantive thing: an idea they did not raise, a correction if something is wrong, or a concrete example from the field.",
    "End with a question that invites them to take it further.",
    "Never grade the post, never give or imply a score or a mark, never say whether it meets a requirement, and never promise or hint at a deadline change.",
  ].join(" "),
  peers: [
    "You are replying to a fellow educator's post in a professional community of practice.",
    "Address them as an equal. They are not your student and you are not assessing them.",
    "Do not open with praise and do not explain the underlying concepts back to them - assume they know the field as well as you do.",
    "Engage with the substance directly: extend their argument, add your own experience of it, or put a concrete counterpoint to them.",
    "It is fine to disagree, and fine to say the thing you are unsure about.",
  ].join(" "),
};

export function buildReplyDraftingPrompt(
  posts: ReadonlyArray<{ id: string; author: string; text: string }>,
  audience: DiscussionAudience,
  courseName: string,
  styleBlock: string
): string {
  const course = courseName.trim();
  return [
    AUDIENCE_STANCE[audience],
    course ? `The discussion is on a course called "${course}".` : "",

    "Write one reply to each post below.",

    "EVERY REPLY, BOTH REGISTERS",
    "- Write in the first person, as yourself.",
    "- 3 to 6 sentences. Plain prose.",
    "- No markdown, no headings, no bullet lists, no bold.",
    "- No greeting line and no sign-off. Do not open with the person's name. The reply is pasted into a box that already shows who is speaking and who is being answered.",
    "- No emoji.",
    "- Never state a fact about the course - a date, a policy, a reading, an assignment, a grade - that is not written in the post you are answering. If you need one, write around it.",
    "- Reply only to what that post says. Do not refer to the other posts below.",

    "THE POSTS",
    posts.map((p, i) => `POST ${i + 1}\nWritten by: ${p.author}\n${p.text}`).join("\n\n---\n\n"),

    "OUTPUT",
    `Return ONLY a JSON array with exactly ${posts.length} elements, and nothing else.`,
    'Each element is {"post": <the POST number>, "reply": "..."} - the number, not the name.',
    `Include every post number from 1 to ${posts.length}, in order.`,
    'Write the reply as plain text. Use "\\n" between paragraphs if you need one. No backticks.',
    "No prose before or after the array. No code fences.",
    styleBlock,
  ].filter(Boolean).join("\n\n");
}
```

**`styleBlock` goes LAST, deliberately.** `getWritingStyleBlock` returns a string
already beginning `\n\nMATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE...`
(`writing-style-block.ts:29`) and ending with up to 1500 characters of the
instructor's own prose. Placing it before the output contract would leave 1500
characters of freeform writing between the format instruction and the model's
turn, and format instructions decay with distance. It returns `""` on any
failure, which `.filter(Boolean)` drops cleanly.

**AC65. The two stances differ STRUCTURALLY, not tonally, and that was a
deliberate rewrite.** As originally worded they were two tone adjectives over an
identical task - "be warm and encouraging" versus "address them as an equal" -
sharing a constraint list that pinned the *shape* identical. A model handed the
same post twice with only an adjective changed writes recognisably the same
reply. The forced, checkable differences now are:

1. **Opening move, mandated and mutually exclusive.** students *must* open by
   naming something the student said; peers is told *not* to open with praise,
   which forbids that opener outright.
2. **Explanation required in one, banned in the other.** students adds "a
   concrete example from the field" (i.e. teaches); peers is told not to explain
   the concepts back to them. This is where the vocabulary actually diverges -
   one defines its terms, the other uses them bare.
3. **Closing move mandated in one only.** students must end on a question; peers
   has no closing requirement and ends on the substantive point.
4. **Stance toward disagreement.** peers may open with a counterpoint; students,
   under warmth plus the assessment ban, structurally cannot.
5. **Four prohibitions exist in one register only** - no grade, no implied
   score, no requirement judgement, no deadline hint - which carry real weight
   in an instructor-to-student channel and are meaningless between colleagues.

**This was not tested against the model.** It is an argument about what the
prompt *forces*. The honest verification is a bug-loop step: draft **three**
posts under both audiences and diff them - three, not one, because AC4b-ii means
both registers actually run at temperature 1.0, so two runs of the *same*
audience differ enough to make a single-sample comparison misleading. If they
come back similar, the fix is to sharpen item 2 (peers gets an explicit "do not
define terms" line), **not** to add more tone adjectives.

---

## 18. Amendments made after the code landed

Four behaviours in the shipped code could not be traced to any AC line. All four
are correct and the AC was wrong or silent; they are written down here so the
next reader does not file them as scope creep, and so a later change to any of
them is a decision rather than an accident.

**AC66 supersedes AC27's "every row in the batch becomes failed".** A row the
user edited while it was drafting must resolve to `ready` on the user's own
text, on BOTH the batch-error path and the omitted-id path - not to `failed`.
Read literally, AC27 would mark a row failed while it holds prose the instructor
wrote, and AC26 already promises the opposite ("left as the user typed it").
Worse, nothing else would ever move such a row out of `drafting`, so it would
display `Drafting` forever over good content. The pure `partitionDraftOutcome`
helper exists to make that branching testable in a node-env suite, since no test
here can render a hook.

**AC67. `draftDiscussionRepliesAction` keeps only the FIRST element carrying a
given positional index.** AC4b's filter snippet did not say so. A model that
returns `post: 2` twice would otherwise map both to the same row and leave
another row reported as "no reply came back" though the batch looked complete.
The mapping is one-to-one by construction.

**AC68. The default sort is `"captured-asc"`.** No default was specified
anywhere. Oldest-first matches the order posts were scrolled past, which is the
order the instructor read them in.

**AC69 refines AC11's normalizer.** AC11 said "lowercase, collapse whitespace,
strip to `[a-z0-9 ]`, trim", which would turn `don't` into two tokens and
`user,name` into one. The implementation strips apostrophes (straight and curly)
by deletion FIRST, then space-replaces the remaining punctuation - so `don't`
becomes `dont` and `user,name` becomes `user name`. `PREFIX_TOKENS` arithmetic
and the measured `SIMILARITY_THRESHOLD` both depend on this, so it is pinned
here rather than left to the implementation. The frozen perturbation oracle was
re-run under this variant and still reports zero false splits.
---

## 19. Late amendments from the closure and final-verification passes

These landed after the code did, and each exists because a pass found the AC
silent where the code had to make a decision.

**AC70. Every "already did this once" latch in these hooks is reset in the
cleanup of the effect that sets it - as a CLASS, not per instance.**

React StrictMode runs an extra mount/cleanup/remount cycle in development. A ref
that records "started" and is never reset turns that extra cycle into a permanent
failure: the cleanup tears the work down, the remount declines to restart it, and
nothing in a node-env test suite can see any of it.

This bit the wake ticker (`loopsStartedRef`) hard enough to leave both consumer
loops idling forever in `next dev` on the ordinary returning-user path, with every
gate green. It then bit `hasActivatedRef` in the effect immediately above it, in
exactly the same shape - which is why this is written as a class rule. A latch
that guards an ASYNC operation must additionally only be considered set once that
operation actually SETTLES; a cancelled run has not happened and must be allowed
to run again.

**AC71. `loopEpochRef` - why resetting the latch alone was not enough.**
`loopsActiveRef` flips `false` then `true` **synchronously** across StrictMode's
cleanup-then-remount, with no microtask boundary in between. So a loop parked in
`waitForWake()` resumes, re-reads the flag, sees `true`, and keeps running
alongside the freshly started pair - a duplicate-loop bug traded for the hang.

Each loop therefore captures a monotonic epoch at start and re-checks it on every
wake (`shouldLoopContinue(loopsActive, currentEpoch, capturedEpoch)`, pure and
tested). The remount bumps the epoch, so an orphaned instance exits on its next
wake instead of double-running. A real unmount leaves `loopsActiveRef` false and
there is no remount to bump anything.

**AC72. The wake ticker pauses when there is nothing to wake for.**
`shouldTickerRun({ capturing, pendingFrames, extracting, drafting,
draftQueueSize })` - pure and tested - gates it, so the panel does not wake the
main thread several times a second for the whole life of a page that is merely
holding a saved table. `draftQueueSize` exists as React state mirroring the
queue ref purely so this predicate can see it; **the ref stays authoritative for
dispatch** and the mirror is never read as the source of truth.

The correctness requirement on any future edit here: a transition that creates
work must commit in the same React batch as the state the predicate reads, or a
wake is missed and the loops sleep with work pending - which is the original
blocker in a new dress.

**AC73. Focus after removing the last row** falls back to a container that
outlives the table, per `docs/modal-focus-restoration-acceptance-criteria.md`
AC2 - never `document.body`. This went slightly beyond the finding that prompted
it and is kept deliberately.

**AC74.** Where AC27's literal wording and AC63's copy sheet disagree on a
string, **AC4b and the copy sheet's specific entry win** over AC27's general
sentence. AC27 predates both.