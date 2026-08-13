# The training recorder proves its frame rate before Tavus does

Tavus rejected a training video with: "The video provided does not meet the
minimum frame rate requirement for a training video. Please ensure your training
video has a frame rate of at least 23fps." That rejection arrives AFTER the
upload and the multi-hour training window, so the cost of the defect is not a
failed request - it is the user's whole session.

## What is actually wrong

`useAvatarStudio.ts`'s `startCapturePreview` requests
`frameRate: { ideal: 30 }`. `ideal` is a soft hint with no floor: the browser is
free to hand back 15fps, or 7.5, and reports success either way. Webcams do this
routinely - in dim light auto-exposure lengthens exposure time and the driver
halves the capture rate to compensate. So the most likely way to produce a
rejected video is the one thing the recorder never warns about: recording
somewhere a bit too dark.

Nothing downstream checks. The stream is handed straight to `MediaRecorder`, and
the first time frame rate is mentioned anywhere is `src/lib/tavus.ts`'s
`video_fps` failure-reason string, which explains the rejection after the fact.
**The app already knows this failure exists and only ever reports it in the
past tense.**

## The precedent this follows

`avatar-script.ts`'s `isRiskyCodec` is the same problem, already solved the right
way: a codec mismatch is "only rejected with a video_codec training error AFTER
the multi-hour round trip. The caller must warn the user before training starts."
Frame rate gets the same treatment - detected locally, surfaced before recording,
and blocking at submit - rather than a second post-mortem string.

## Decisions taken up front

1. **The floor is 23, not 24 or 30.** Tavus's own message says "at least 23fps",
   which is almost certainly there to admit 23.976 (24000/1001). Encoding 24
   would reject genuinely valid footage. 30 stays the RECOMMENDED target, and the
   two numbers are separate constants because they mean different things.
2. **Measure the delivered rate, do not trust `getSettings()`.**
   `track.getSettings().frameRate` reports what was NEGOTIATED. A camera that
   negotiated 30 and is dropping to 12 in low light still reports 30, which is
   exactly the case that produced the rejection. Real frames must be counted, via
   `requestVideoFrameCallback` on the preview element.
3. **`getSettings()` is still the fallback, and the UI must say which it used.**
   `requestVideoFrameCallback` is not universally available. Where it is missing,
   the negotiated rate is better than nothing, but it is a weaker claim and must
   not be presented as a measurement.
4. **Constrain with `min`, but never let it break capture.** Ask for
   `frameRate: { min: 23, ideal: 30 }` so a capable camera is held to the floor.
   A camera that cannot advertise it throws `OverconstrainedError`; that must
   fall back to `{ ideal: 30 }` and let the measurement decide, not leave the
   user with a dead preview and no camera at all.
5. **Blocking, not just warning.** Submitting known-bad footage costs hours. The
   submit path refuses below the floor, with an explanation naming lighting
   first, since that is the likeliest cause.
6. **The decision logic is pure.** Threshold classification and the
   sample-to-fps arithmetic go in `avatar-script.ts` beside `pickAvatarMimeType`,
   which is already the pure, injected-dependency module for exactly this kind
   of rule. No DOM, no React.

## Acceptance criteria

**AC1 - the pure module owns the rule.** `avatar-script.ts` exports the floor and
target constants, a function turning frame-callback samples into a rate, and a
classifier mapping a rate (plus whether it was measured or merely reported) to
`"ok" | "warn" | "block"` with a user-facing reason. Pure and unit-tested.

**AC2 - capture asks for a floor and survives being refused it.**
`frameRate: { min: 23, ideal: 30 }`, with an `OverconstrainedError` fallback that
still yields a working preview.

**AC3 - the delivered rate is measured from real frames**, via
`requestVideoFrameCallback` on the preview video, over a window long enough to be
stable, falling back to `getSettings().frameRate` where unavailable.

**AC4 - the user is told before recording**, in the panel, next to the existing
codec warning, and told which number it is (measured or reported).

**AC5 - submission is blocked below the floor**, with a message that names dim
lighting as the likely cause, and does not merely repeat the provider's string.

**AC6 - the existing `video_fps` post-mortem string stays.** A local pre-flight
reduces the chance of the rejection; it cannot eliminate it, since Tavus measures
the encoded file and this measures the live stream.

**AC7 - the usual gates.** Suite green, `tsc` clean, `lint` clean, no emojis,
every touched file under 1000 lines, no new dependency.

## Limits

vitest here is node-env and renders no component, so AC1 is the only part under
real test. There is no `MediaStream`, `MediaRecorder` or `requestVideoFrameCallback`
in this environment - `avatar-script.test.ts` already documents that and resorts
to scanning the hook's source for its guarantees. AC2 to AC5 are verified by
reading. The app cannot be run here (no Supabase env), so none of this has been
observed against a real camera, and the specific low-light case that produced the
original rejection cannot be reproduced locally at all.
