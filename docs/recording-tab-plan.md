# Feature plan: Recording tab (camera capture)

A new top-level tab that records video from any attached camera (webcam,
document camera, capture card) directly in the app - for lecture snippets,
feedback videos, and assignment walkthroughs.

## Goals

- Record from ANY attached camera, chosen from a device picker.
- Pick the microphone independently of the camera.
- Live preview before and during recording; pause/resume; elapsed timer.
- Play back the take in-app, then download it or discard and retake.
- Zero new dependencies: the whole v1 is browser-native APIs.

## Non-goals (v1)

- Editing/trimming, transcription, or transcoding.
- Screen capture (planned as a later phase).
- Cloud storage of the video itself (files are large; see Phases).

## Technical approach

All client-side; no server actions, env vars, or DB changes in v1.

| Concern | API |
|---|---|
| List cameras/mics | `navigator.mediaDevices.enumerateDevices()` (videoinput / audioinput) |
| Open a stream | `getUserMedia({ video: { deviceId }, audio: { deviceId } })` |
| Live preview | `<video muted autoPlay srcObject={stream}>` |
| Record | `MediaRecorder` collecting Blob chunks (`ondataavailable`) |
| Container | Prefer `video/mp4` when `MediaRecorder.isTypeSupported` says so (Safari, newer Chrome), else `video/webm;codecs=vp9,opus` |
| Playback/download | `URL.createObjectURL(blob)` into a `<video controls>` + a download anchor |

Notes and constraints:
- Requires a secure context (HTTPS or localhost) for device access.
- Device labels are blank until permission is granted once - the picker
  re-enumerates after the first `getUserMedia` succeeds.
- Recording never leaves the browser in v1, so Vercel's ~4.5 MB request cap
  is irrelevant until an upload phase.
- Chrome commonly records webm only; Canvas accepts webm uploads, but if mp4
  is required by a consumer, transcoding stays out of scope.

## UI sketch

New `ActiveTab` value `"recordings"`, tab label "Recording", rendered by a new
`RecordingTab.tsx` (client component), styled with the existing card/panel
design system:

- Toolbar panel: Camera select, Microphone select, resolution select
  (720p/1080p constraint hints), mirror-preview toggle.
- Stage panel: large live `<video>` preview; while recording, a red dot badge
  (reuse `.navBadge`) + elapsed timer + running size estimate.
- Controls: Start / Pause / Resume / Stop buttons (design-system buttons,
  danger tone for Stop); disabled states driven by the MediaRecorder state.
- Takes list: each finished take as a row (`.ghRow` idiom) with inline
  playback, duration, size, rename, Download (`.webm`/`.mp4`), Delete.
  Takes live in memory for the session (object URLs revoked on delete/unmount).

## File changes

- `src/app/components/RecordingTab.tsx` (new; all logic + UI)
- `src/app/page.tsx` (tab wiring: ActiveTab union, Tab element, render block,
  saved-tab guard)
- `src/app/page.module.css` (stage/preview styles)

## Phases

1. **V1 - capture and download** (one working session): device pickers,
   preview, record/pause/stop, takes list, download. Everything above.
2. **V2 - polish**: audio level meter, persisted device/resolution choices
   (localStorage), keyboard shortcuts, camera hot-plug refresh
   (`devicechange` event).
3. **V3 - destinations**: upload a take to a Canvas course (Files/module via
   the existing canvas-modules layer - needs chunked or signed upload to
   dodge the 4.5 MB body cap), and/or attach a recording link to a Courses
   tile.
4. **V4 - screen capture**: `getDisplayMedia` screen/window recording with
   optional picture-in-picture webcam overlay via canvas compositing.

## Risks

- Browser codec variance (mitigated by `isTypeSupported` fallback chain).
- Long recordings held in memory as Blobs - cap the timer display with a
  soft warning around ~30 min; chunked `ondataavailable` keeps memory sane.
- OneDrive-synced downloads folder can be slow for GB files - user-side note.
