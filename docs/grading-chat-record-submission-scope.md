# GRADING-CHAT record-a-submission - scope and wave plan

Owner request (direct chat, 2026-10-06), verbatim:
"on the chat grading view, add an option to record screen and then upload that
recording as a submission option".

This is the architecture/scoping artifact. It resolves the central A/B/C fork,
names the capture mechanism to reuse, traces the recording end to end into a
gradable row, places the feature in the composer and in the cross-scope
serialization chain, and cuts a wave plan with enumerated write-sets. It writes
NO production code. Every structural claim cites `file:line` opened in the live
tree; every quantity names the command that produced it.

This is a NEW artifact, not a restructuring of a prior version, so there is no
disposition table (nothing prior to map kept/handed-over/withdrawn).

---

## 0. Measured facts (commands pasted, not recalled)

### 0.1 HEAD conflict with the brief - resolved by measuring

The dispatch brief states "HEAD d08d0fc4." Measured now:
`git rev-parse --short HEAD` -> **20e9f4d1**. The tree moved under the brief
(the repo's auto-commit hook moves branches; MEMORY "trust the working tree, not
git bookkeeping"). I brief from the tree, not the stated hash.

`git log --oneline d08d0fc4..20e9f4d1`:
```
20e9f4d1 backlog(GRADING-CHAT-CONTROLS): cite harshness-seam ship f87b5415; ...
f87b5415 feat(GRADING-CHAT-CONTROLS): harshness prompt seam (W1, byte-identical default)
```
So **controls Wave 1 (harshness prompt seam) has shipped** since the brief.

### 0.2 Composite Wave 1 is LIVE in the working tree (uncommitted), Wave 2 is not

`git status --short` (grading-chat paths):
```
 M src/app/actions/grading-chat-intake.ts
 M src/app/components/grading-chat/chatSubmissionIntake.ts
 M src/app/components/grading-chat/useContinuousGradingRun.ts
```
`grep -rln "mergeCompositeEntries\|CompositePartInput\|prepareCompositeSubmissionAction\|extractSingleEntry"`
-> those three files. So the composite SEAM (type contract + pure merge + server
resolver + driver branch) from `docs/grading-chat-composite-scope.md` Wave 1 is
PRESENT in the working tree as uncommitted edits, opened and cited below. The
composite composer tray (its Wave 2 - `ChatComposer.tsx`, panel wiring) is NOT
present: `ChatComposer.tsx` is unchanged (still text/file/url only). This feature
depends on that Wave 2 and therefore serializes behind it (section 7, section 10).

### 0.3 Line counts - `@(Get-Content <file>).Count` (PowerShell), run 2026-10-06 at HEAD 20e9f4d1

| File | Lines | Ceiling (1000) headroom |
|---|---|---|
| `src/app/components/grading-chat/ChatComposer.tsx` | 203 | large |
| `src/app/components/grading-chat/GradingChatPanel.tsx` | 244 | large |
| `src/app/components/grading-chat/useContinuousGradingRun.ts` | 378 | large |
| `src/app/components/grading-chat/chatSubmissionIntake.ts` | 137 | large |
| `src/app/actions/grading-chat-intake.ts` | 257 | large |
| `src/lib/grade/single-file-entry.ts` | 133 | large |
| `src/app/components/snapshot-grading/useSnapshotCapture.ts` | 212 | large |
| `src/app/components/snapshot-grading/snapshot-shot.ts` | 322 | large |
| `src/app/components/grading-chat/grading-chat.module.css` | 165 | large |
| `src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts` | 64 | n/a |
| `src/lib/grade/constants.ts` | 64 | large |
| `src/lib/office-extract.ts` | 224 | large |

No file this feature edits is near the 1000-line ceiling. The two files that
will grow materially - `ChatComposer.tsx` (203) and a new capture hook - stay far
under it (estimates in section 10).

### 0.4 New symbols are collision-free

`grep -rln "useChatScreenFrameCapture\|frameToImageFile\|RECORD_FRAME\|ta-grading-chat-record" src`
-> nothing (2026-10-06). The capture-hook name and the frame-File helper name are
unused today.

---

## 1. The central fork resolved: VIDEO-FILE (A) vs OCR-EXTRACTION (B) vs FRAMES-AS-IMAGES (C)

**RECOMMENDED READING: (C) FRAMES-AS-IMAGES.** The recording is captured as one
or more still JPEG frames; each frame is an image `File`; those image files ride
the ALREADY-BUILT image-submission path into the grader, which is vision-capable
and reads screens directly. Zero new server/engine machinery. This is exactly
what the shipped Snapshot-grading feature already does (section 3).

### 1.1 (A) RAW VIDEO - a confirmed dead end, with the tree evidence

A recorded `.webm`/`.mp4` submitted through the file path is **refused** and
nothing grades it. Proof, each opened:

- The grading-chat file path classifies by extension:
  `prepareChatSubmissionAction` -> `resolveOnePart` -> `classifyGradingUpload(file.name)`
  (`src/app/actions/grading-chat-intake.ts:180`). `classifyGradingUpload`
  (`src/lib/grade/single-file-entry.ts:36-45`) returns `"single"` ONLY if the
  extension is in `TEXT_EXTENSIONS`, `DOCUMENT_EXTENSIONS`, or `IMAGE_EXTENSIONS`;
  otherwise `"unsupported"`.
- No video extension exists in ANY of those three sets:
  - `TEXT_EXTENSIONS` (`src/lib/office-extract.ts:13-53`) - 39 code/text
    extensions, no `webm`/`mp4`/`mov`.
  - `DOCUMENT_EXTENSIONS` (`src/lib/office-extract.ts:55-67`) - 11 office/pdf
    extensions, no video.
  - `IMAGE_EXTENSIONS` (`src/lib/grade/constants.ts:41-50`) - `png jpg jpeg gif
    webp bmp heic heif`, no video.
- So a `.webm`/`.mp4` file hits the `"unsupported"` branch and is refused:
  `src/app/actions/grading-chat-intake.ts:181-186` ("This file type isn't
  supported for grading...").
- The engine has no video handling at all:
  `grep -rn 'webm|"mp4"|\.mp4|"mov"|video/' src/lib/grade` -> **no matches**.
- And the only producer of a video blob in this repo, `useRecorder.ts`, emits
  `video/mp4` or `video/webm` (`src/app/components/recording/useRecorder.ts:542`,
  opened) - precisely the MIME types nothing downstream can grade.

(A) would require a video-grading engine (frame sampling + a video-capable model
path), which is large and out of scope, and the brief forbids video-engine work.
**Rejected.**

### 1.2 (B) OCR-EXTRACTION - works, but is strictly more machinery than (C) for one submission

The recording grader turns a screen capture into gradable text via
`useGradingRecordingExtraction` (`src/app/components/grading-recording/useGradingRecordingExtraction.ts:61-136`,
opened): it drains a frame queue (`takeFrameBatch`, `:62`), posts the frames to
`extractGradingSubmissionsAction` (`:74`), which OCR-reads them into
`result.submissions`, then reconciles those against an accumulator/roster/
tombstone system (`capture.advance`, `:97`;
`useGradingCaptureTracking.ts:51-97`, opened) to append MULTIPLE student rows.

Two reasons this is the wrong reuse for "one recording = one row":

1. It is a **many-students scanner**, not a one-submission extractor. Its whole
   machinery (`commitCaptureAdvance`, roster matching, dismissal tombstones,
   `totalReadingsCount`) exists to pull N students off a classroom screen into N
   rows over a continuous drain. Bending it to produce one row is working against
   its design.
2. It produces an intermediate TEXT representation via a server action, when the
   grader is ALREADY vision-capable. Path (C) hands the SAME grading model the
   image directly (section 2), so the OCR middle-step `extractGradingSubmissionsAction`
   is unnecessary. (B) adds a server round-trip and a frame-drain loop that (C)
   does not need.

(B) works end to end, but it is more code and more surface for an outcome (C)
reaches with none. **Rejected for this feature;** reusable pieces (the frame
sampler idea) inform (C)'s capture hook instead.

### 1.3 (C) FRAMES-AS-IMAGES - works end to end today, least new machinery

Images are gradable from intake to model with no new code:

- Intake: an image file is `"single"` (`classifyGradingUpload`,
  `single-file-entry.ts:41`, `IMAGE_EXTENSIONS` membership), and
  `buildSingleFileEntry`'s image branch (`single-file-entry.ts:79-97`, opened)
  builds an entry carrying `rawBase64: buffer.toString("base64")` and
  `mimeType: getMimeType(extension)` (`.jpg` -> `image/jpeg`,
  `constants.ts:28-30,62-64`).
- Model: `image/jpeg` is in `GEMINI_IMAGE_MIME_TYPES`
  (`src/lib/grade/constants.ts:54-60`), i.e. the grader sends it to the vision
  model as inline data.
- This is not theoretical: the shipped **Snapshot-grading** feature grades screen
  frames exactly this way - `useSnapshotCapture.captureFrame`
  (`src/app/components/snapshot-grading/useSnapshotCapture.ts:177-189`, opened)
  returns a JPEG base64 of a screen frame, graded as an image.

**Why (C) is the minimum:** the recording-side work is (1) capture frames and (2)
turn each frame into an image `File`. Everything after the `File` already exists -
the composite file-part path (section 2) merges them into one gradable entry with
no new seam code. (A) needs an engine; (B) needs a server extractor and a drain
loop; (C) needs a capture hook and a pure `frame -> File` helper.

---

## 2. How a recording becomes ONE gradable row - end to end (all hops opened)

The one-row requirement is the governing constraint. A recording of N frames must
become ONE `StudentSubmissionEntry` -> ONE dispatched item -> ONE row. The only
single-submit path in this surface that merges MANY files into ONE entry is the
**composite** merge (the standalone file path is one-file-one-row). So frames feed
composite file parts. Trace:

1. **Capture** (new, client, owner-walk): `getDisplayMedia` screen share; draw the
   current frame to a canvas; `canvas.toDataURL("image/jpeg", q)` -> base64 - the
   exact idiom at `useSnapshotCapture.ts:121-124,177-189`.
2. **Frame -> File** (new, pure, machine-checkable): a leaf
   `frameToImageFile(base64, index): File` decodes base64 to bytes and returns
   `new File([bytes], "recording-frame-<index>.jpg", { type: "image/jpeg" })`. The
   `.jpg` name is load-bearing: the server classifies by extension
   (`classifyGradingUpload`, section 1.1), so the frame must be named as an image.
3. **Each frame becomes a composite FILE part**: `{ kind: "file", file }` -
   `CompositePartInput` (`chatSubmissionIntake.ts:36-39`, opened) already has a
   `file` member. No new part type.
4. **Submit as one composite**: `driver.submit({ kind: "composite", student, parts })`
   (`useContinuousGradingRun.ts:265-297`, opened). The driver builds the composite
   FormData and calls `prepareCompositeSubmissionAction`.
5. **Server resolves each part and merges**: `prepareCompositeSubmissionAction`
   (`grading-chat-intake.ts:298-328`, opened) runs `resolveOnePart("file", ...)`
   for each frame (`:311`) -> `classifyGradingUpload` -> `buildSingleFileEntry`
   image branch -> one image entry per frame; `extractSingleEntry` admits each
   (cardinality 1); `mergeCompositeEntries(entries, student)`
   (`chatSubmissionIntake.ts:98-116`, opened) concatenates every part's
   `submittedFiles` **preserving each file's `rawBase64`/`mimeType`**
   (`:108-112` - `name === file.name ? file : { ...file, name }`, so the vision
   bytes ride through unchanged). Result: ONE merged entry with N frame images.
6. **One row**: the merged entry is returned as `entries: [merged]`
   (`grading-chat-intake.ts:327`); the driver dispatches it as ONE item with one
   `sourceIndex` (`useContinuousGradingRun.ts:318-320`) -> ONE row in
   `GradingResults`.

The frame count is bounded by `MAX_COMPOSITE_PARTS = 12`
(`grading-chat-intake.ts:47`, opened) and by the merged-entry wire budget
(`firstOversizedEntryReason([merged])`, `grading-chat-intake.ts:325`, against
`ITEM_REQUEST_BYTE_BUDGET` = 3.5MB). The capture UI must cap frames at 12 and show
the running wire size, reusing the same budget instrument the server enforces with
(`checkWireBudget`/`sumBase64WireBytes`, `src/lib/upload-budget.ts:82-115`, which
is dependency-free and client-safe, `:33`) - exactly as Snapshot grading's
`checkShotWireBudget`/`computeSnapshotWireBytes` do (`snapshot-shot.ts:86-95`).

---

## 3. The capture infrastructure to reuse (surveyed, cited)

| Need | Reuse | `file:line` | Client-bundle-safe? |
|---|---|---|---|
| Screen share + detached sampling video + canvas frame grab -> JPEG base64 | `useSnapshotCapture` (`start`/`stop`/`captureFrame`/`encodeFile`, teardown, "ended" listener) | `src/app/components/snapshot-grading/useSnapshotCapture.ts:63-212` | YES - imports only `react` and `./snapshot-shot`; `snapshot-shot` imports only `@/lib/upload-budget` (dependency-free, `upload-budget.ts:33`). No server module. |
| The video-only `getDisplayMedia` call (NOT `requestScreenShareStream`, which pins `displaySurface:"monitor"` + requests system audio) | direct `navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "window" }, audio: false })` | `useSnapshotCapture.ts:121-124` | YES |
| Frame encode decisions (JPEG quality, hard width cap, wire budgeting) | `SNAP_JPEG_QUALITY`, `resolveSnapTargetWidth`, `checkShotWireBudget`, `computeSnapshotWireBytes`, `MAX_SHOTS` | `snapshot-shot.ts:43-53,86-99` | YES |
| Wire-byte budget (same instrument server + client) | `checkWireBudget`, `checkFileWireBudget`, `sumBase64WireBytes`, `UPLOAD_WIRE_BUDGET_BYTES` | `src/lib/upload-budget.ts:41,82-115` | YES (`:33`) |

**DO-NOT-REUSE list, with justification:**

- `src/app/components/recording/useRecorder.ts` - it drives `MediaRecorder` to
  produce a `video/webm`/`video/mp4` blob (`:542,682,705`). That blob cannot be
  graded (section 1.1) and its `window`-level `r`/`p`/`m` keydown layer would
  collide with the composer. Not reused.
- `src/app/components/recording/screen-source.ts`'s `requestScreenShareStream`
  (`:82-87`) - pins `displaySurface:"monitor"` and requests system audio, raising
  the share-audio notice tree (`classifyDisplayAudioGrant`), none of which a
  silent frame grab needs. Snapshot grading already rejected it for this reason
  (`useSnapshotCapture.ts:11-19`). Not reused.
- `useGradingRecordingExtraction.ts` / `extractGradingSubmissionsAction` /
  `useGradingCaptureTracking.ts` - the multi-student OCR scanner (section 1.2).
  Not reused.

**Reuse decision - import vs extract (FORK, section 8 Fork G).** RECOMMEND:
EXTRACT a small, grading-chat-owned hook `useChatScreenFrameCapture` that reuses
the SAME idiom as `useSnapshotCapture` (video-only `getDisplayMedia`, detached
sampling video, canvas `toDataURL` at the snapshot quality/width cap, idempotent
teardown). It depends only on `snapshot-shot`'s exported encode constants and
`upload-budget`. Rationale: `useSnapshotCapture` lives in the `snapshot-grading`
feature directory, whose own header declares it a SEPARATE capture surface that
deliberately does not couple to other grading features
(`snapshot-shot.ts:7-9`); importing a sibling feature's hook cross-directory
would couple two features' lifecycles. Extracting a thin grading-chat hook that
reuses the published encode constants keeps the duplication to the ~40 lines of
canvas/stream plumbing (which no vitest can execute anyway, section 9) while
avoiding the coupling. Rejected alternative (import `useSnapshotCapture`
directly): fewer lines but couples grading-chat to snapshot-grading's internal
hook, against that file's own stated boundary.

---

## 4. The ChatComposer integration - own mode vs composite part

**RECOMMENDED READING: a recorded submission is NEITHER a new `ChatSubmissionInput`
kind NOR a new `CompositePartInput` part type. It is a CAPTURE AFFORDANCE that
emits image `File`s, which become the EXISTING composite `file` part.** One
recording = one-or-more image file parts of ONE composite submission = ONE row.

Why this, not the two options the brief named:

- **Not a new submission kind (option i).** A 4th `ChatSubmissionInput` member
  (e.g. `{kind:"record"; frames}`) would need its own driver branch, its own
  server resolver, and its own merge, all to re-derive what the composite merge
  already does. A frame is an image file; the file union member already carries
  it. Adding a kind is duplicate machinery.
- **Not a new part TYPE (option ii, literally).** `CompositePartInput`
  (`chatSubmissionIntake.ts:36-39`) already has `{kind:"file"; file:File}`. A
  recorded frame IS a file part. A new `{kind:"record"}` part type would force a
  new branch in `resolveOnePart` (`grading-chat-intake.ts:160`) and in
  `mergeCompositeEntries`, when the file branch already handles image bytes
  (`single-file-entry.ts:79-97`; merge carries `rawBase64` at
  `chatSubmissionIntake.ts:108-112`). No new type is warranted.
- **What IS new** is purely the composer UI that produces the frame files: a
  "Record" affordance that shares the screen, captures frames, and auto-adds each
  frame to the composite tray as a `{kind:"file"}` part. The brief's option (ii)
  spirit - "a recording is one (or more) part(s) of a composite submission" - is
  adopted; the refinement is that the part is the existing file part, not a new
  one.

**Composer shape (designed against the POST-composite-Wave-2 composer, section 7):**
- A 4th segment **"Record"** in the composer's `SegmentedToggle`
  (`ChatComposer.tsx:129-140`), alongside Text/File/URL.
- Selecting Record reveals a capture sub-panel: **Share screen** (start), a live
  preview `<video>`, **Capture frame** (grabs one frame -> auto-adds it to the
  composite tray as a file part, named `recording-frame-N.jpg`), a frame
  count + running wire size, and **Stop sharing**. Each captured frame appears in
  the composite tray (composite Wave 2's tray) as a file part.
- Grading uses composite Wave 2's existing **"Grade submission (N parts)"** button
  -> `driver.submit({kind:"composite", student, parts})`. No new submit handler
  for the common path; the capture button IS the add-part action for frames, so
  the instructor does not pay a separate "+ Add part" per frame.
- The composer persists the selected input mode under the EXISTING key
  `ta-grading-chat-input-mode` (`ChatComposer.tsx:28-50`); "record" is a new
  enum value of `InputMode`, validated in `loadInputMode` (`:32-41`). **This adds
  NO new `ta-` key** (section 6).

**Minimize-clicks (owner standard), first use:** Share (1) + Capture x N +
Grade (1). No per-frame "+ Add part". The single-frame case is 3 actions
(Share, Capture, Grade) and still yields one row.

Rejected alternative (capture emits a standalone file submission via
`onSubmitFiles([file])`): one file is one row, so N frames would be N rows -
violates the one-row requirement for a multi-frame recording. Keeping ONE path
(frames -> composite file parts) gives one-row semantics for any frame count and
reuses the merge rather than special-casing single vs multi.

---

## 5. Position in the serialization chain

This feature touches `ChatComposer.tsx`, `GradingChatPanel.tsx`, and
`grading-chat.module.css` - the exact shared files three in-flight scopes already
contend for. It MUST land AFTER composite's Wave 2 and after controls/visual,
because it builds on the composite tray and must not collide with their composer
edits.

Dependency facts (opened):
- Composite Wave 2 (the tray + "+ Add part" + student-name field + "Grade
  submission (N parts)") is where the `composite` submit path reaches the UI. It
  is NOT yet in the tree (`ChatComposer.tsx` unchanged, section 0.2). Record
  feeds frame files INTO that tray, so Record cannot land before it.
- `docs/grading-chat-composite-scope.md:679-695` sets the order: **composite
  FIRST**, then **controls and visual AFTER composite, serialized against each
  other** on `ChatComposer.tsx` / `GradingChatPanel.tsx` / `grading-chat.module.css`
  / `GradingChatPanel.structure.test.ts`.
- Controls Wave 3 adds `ta-grading-chat-harshness` to the frozen storage-key set
  and edits the panel (`docs/grading-chat-controls-scope.md:314-320,477-481`).
- Visual edits the composer's CSS/markup (`docs/grading-chat-visual-scope.md:28,639`).

**Record's position: LAST in the grading-chat composer chain** -
composite(W1,W2) -> controls -> visual -> **RECORD**. Record is serialized behind
all of them on the shared composer/panel/CSS paths; it is never run concurrently
with any of them. (It does not reorder controls vs visual; it only requires it
come after both, so it designs against their settled composer.) Record's
non-composer work (the capture hook, the pure frame-File helper) is disjoint and
could be built while the chain finishes, but its composer wiring waits.

---

## 6. Persisted state and the storage-key canary

- The composer's input mode persists under the EXISTING key
  `ta-grading-chat-input-mode` (`ChatComposer.tsx:28`); adding `"record"` to the
  `InputMode` union adds NO new key.
- The `grading-chat` ta-key canary
  (`grading-chat-storage-keys.structure.test.ts:13-18`, opened) freezes the EXACT
  set, scanning the directory's non-test files RAW (comments included,
  `:20-26,34-35`). By the time Record lands, controls Wave 3 will have grown
  `EXPECTED` to include `ta-grading-chat-harshness` (`controls-scope.md:481`).
  **Record must add NO new `ta-` key** - no capture setting is persisted by this
  design (the live share is a device resource, not a preference). If a later
  revision wants to persist, e.g., a capture quality, that key is added to
  `EXPECTED` SAME-COMMIT and this becomes a Data-seat concern.
- The new capture-hook file, if placed in `src/app/components/grading-chat/`, is
  scanned by that canary: it must contain NO `ta-` literal spelling (the hook has
  no persisted state). Refer to the input-mode key by description, never by a
  second literal, per the canary's own warning (`:4-6`).

---

## 7. What is machine-checkable vs owner-walk (honest split - most of this is owner-walk)

**Machine-checkable (pure leaves; node, no render, network blocked):**
- `frameToImageFile(base64, index)`: returns a `File` whose `.name` ends `.jpg`,
  `.type === "image/jpeg"`, and whose bytes decode from the base64 (round-trip).
  `File`/`Blob`/`atob` exist in node here (FormData already round-trips in node,
  per `composite-scope.md:384-396`). Mutation that flips it: change the name
  suffix to `.webm` and a `classifyGradingUpload("...webm") === "unsupported"`
  assertion goes red; change `type` and the mime assertion goes red.
- A composite built from N frame file parts resolves to exactly ONE entry with N
  `submittedFiles`, each image, via the EXISTING
  `mergeCompositeEntries`/`extractSingleEntry` oracle (owned by composite's test
  seat, `composite-scope.md:703`). Record adds no new merge code, so it writes no
  new merge oracle - only a frame-File round-trip test and a wiring canary.
- Source-text canaries in `GradingChatPanel.structure.test.ts`: a "Record"
  segment is present in `ChatComposer.tsx`; the capture control wires to the
  composite submit path; `InputMode`'s `loadInputMode` admits `"record"`; no new
  `ta-` literal appears in the directory (the existing key-set canary already
  enforces this).

**Owner-walk ONLY (no component renders under vitest; `getDisplayMedia`,
`MediaRecorder`, canvas, `toDataURL` do NOT exist in the test env -
`this-repo.md:134,262`, `useRecorder.test.ts:5`):**
- The entire capture: screen-share picker, live preview, frame grab, teardown on
  Stop / track "ended" / unmount.
- That a captured frame visibly enters the composite tray and that "Grade
  submission (N parts)" produces exactly ONE row showing N frame images in
  `GradingResults`.
- Frame legibility / JPEG quality adequacy for grading.
- Focus order, keyboard reachability of the capture controls, the "Record"
  segment's visual placement (UX / Visual / Accessibility seats - reading claims
  only, no render).

This split is deliberately honest: the capture is almost entirely owner-walk. The
only genuinely machine-checkable glue is the pure `frame -> File` helper and the
source-text wiring canaries. Each owner-walk item is a residual with an owner and
a step (section 11), not an assumption to fill in.

---

## 8. Forks, each with a recommended reading

- **Fork CENTRAL - A/B/C grading path.** RECOMMEND (C) frames-as-images
  (section 1). (A) raw video cannot grade (no video extension, no engine); (B)
  OCR works but is strictly more machinery than (C) for one submission.
- **Fork F1 - submission SHAPE.** RECOMMEND neither a new submission kind nor a
  new part type; a frame is the EXISTING composite `file` part (section 4).
- **Fork F2 - single-frame vs multi-frame.** RECOMMEND one uniform path: capture
  emits composite file parts regardless of count (one part -> one row; N parts ->
  one row via the merge). Rejected: a separate standalone-file path for a single
  frame (two code paths, and multi-frame would be N rows). Frame cap = 12
  (`MAX_COMPOSITE_PARTS`, `grading-chat-intake.ts:47`).
- **Fork F3 - recording cadence.** RECOMMEND operator-timed MANUAL frame capture
  ("Capture frame" button), like Snapshot grading's deliberate single draw
  (`snapshot-shot.ts:16-19` contrasts a sampled stream), NOT an automatic
  interval sampler. Rationale: the instructor chooses the moments worth grading;
  an interval sampler re-introduces the stream-legibility and byte-budget
  pressure the snapshot path deliberately avoided, and the 12-part cap makes an
  unbounded sampler pointless. Residual: whether instructors want timed sampling
  is an owner product question (RES-REC-CADENCE), not settled here.
- **Fork F4 - capture hook location.** RECOMMEND extract a grading-chat-owned
  `useChatScreenFrameCapture` reusing snapshot-grading's published encode
  constants, rather than importing `useSnapshotCapture` cross-feature
  (section 3). Rejected: direct import (couples two feature directories against
  `snapshot-shot.ts:7-9`).
- **Fork F5 - frame image format.** RECOMMEND JPEG at `SNAP_JPEG_QUALITY`
  (`snapshot-shot.ts:46`) with the hard width cap `resolveSnapTargetWidth`
  (`:51-53`), matching the shipped snapshot path and keeping every frame within
  the shared wire budget. `image/jpeg` is in `GEMINI_IMAGE_MIME_TYPES`
  (`constants.ts:54-60`), so it reaches the vision model; PNG would too but is
  larger for a screen frame.

---

## 9. Wave plan (dependency-ordered; each wave names its write-set and its caller)

Record is strictly AFTER composite Wave 2 and after controls/visual on the
composer (section 5). Within Record, the pure capture plumbing is disjoint from
the composer wiring but both are small; they are cut as two waves so the
machine-checkable leaf lands and is gated before the owner-walk composer wiring
depends on it.

Multi-path test runs use `npm run test:paths <p1> <p2> ...`
(`this-repo.md:52-67`), never a bare multi-path `vitest`. Every wave gate also
runs `src/file-size-ceiling.structure.test.ts` (unconditional) and the two
grading-chat directory canaries that read Record's edit targets as source text.

**Wave R1 - the pure frame-File leaf + the capture hook (no composer edit).**
Write-set:
- `src/app/components/grading-chat/chatFrameCapture.ts` - NEW. Pure
  `frameToImageFile(base64, index): File` (machine-checkable) AND the client hook
  `useChatScreenFrameCapture` (reuses the snapshot idiom; owner-walk). Est. ~90
  lines. NO `ta-` literal (section 6). It is client-safe (imports only `react`,
  `./` encode constants re-exported from a shared leaf, `@/lib/upload-budget`),
  so `runtime-import-graph.test.ts` stays green.
- `src/app/components/grading-chat/chatFrameCapture.test.ts` - NEW. The
  `frameToImageFile` round-trip oracle (name suffix, mime, byte round-trip, and
  the `.webm`-name mutation that proves `classifyGradingUpload` would refuse a
  mis-named frame). Test-seat owns the axes.
Caller: the hook's production caller is the composer (Wave R2); the pure helper's
caller in-wave is its oracle. To satisfy the caller-in-wave rule, R1 ships ONLY
the pure helper as a runtime export consumed by its test, and the hook is a
client hook whose only caller is R2 - so R1 must either (a) land the hook
together with R2, or (b) mark the hook module type/lint-clean but note the hook
is dead until R2. RECOMMEND folding the hook into R2 and keeping R1 to the PURE
helper + oracle only, so no wave ships a dead runtime export. (Revised write-set
below reflects this.)

REVISED - **Wave R1 (pure helper only):**
- `src/app/components/grading-chat/chatFrameCapture.ts` - NEW, the PURE
  `frameToImageFile` leaf only (~25 lines), consumed by its oracle in-wave.
- `src/app/components/grading-chat/chatFrameCapture.test.ts` - NEW oracle.

**Wave R2 - the capture hook + composer "Record" mode + panel wiring + styles.**
Write-set:
- `src/app/components/grading-chat/chatFrameCapture.ts` - ADD
  `useChatScreenFrameCapture` (the owner-walk capture hook) beside the pure
  helper it already holds; the hook's production caller (the composer) is in this
  same wave.
- `src/app/components/grading-chat/ChatComposer.tsx` - add `"record"` to
  `InputMode` + `loadInputMode` validation (`:30-41`); add the "Record" segment
  (`:129-140`); render the capture sub-panel (Share/Capture/Stop + preview +
  frame count + wire size); each Capture adds a `{kind:"file", file}` part to the
  composite tray (composite Wave 2's tray). Est. 203 -> ~300.
- `src/app/components/grading-chat/GradingChatPanel.tsx` - only if the capture
  sub-panel needs a panel-level handler beyond composite's existing
  `onSubmitComposite`; prefer reusing composite Wave 2's composite submit path, so
  this edit is minimal or none.
- `src/app/components/grading-chat/grading-chat.module.css` - capture sub-panel
  classes if any, referenced SAME-COMMIT (dead-CSS avoidance). Prefer house rows
  `styles.ghActions`/`styles.adaptRow` + inline token styles.
- `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` -
  source-text canaries: the "Record" segment exists; the capture control routes a
  frame into the composite path; `InputMode` admits `"record"`.
Caller: `ChatComposer.tsx` is the production caller of `useChatScreenFrameCapture`
and of `frameToImageFile`; the composite submit path (composite Wave 2) is the
production caller of the frame file parts.

Each wave is independently pushable (gates green at each). No intra-wave
parallelism is needed at this size, and Record has no sibling it may run
concurrently with (it is last in the composer chain, section 5).

---

## 10. owns - files that read Record's edit targets AS SOURCE TEXT

Derived, not eyeballed:
```
grep -rln -e "ChatComposer.tsx" -e "GradingChatPanel.tsx" -e "grading-chat.module.css" \
  -e 'components/grading-chat"' --include="*.ts" --include="*.tsx" src | sort -u
```
output (2026-10-06):
```
src/app/components/grading-chat/ChatComposer.tsx
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-chat/GradingChatPanel.tsx
src/app/components/grading-chat/LatestResultCard.tsx
src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts
```
Plus the directory-scan canaries:
```
grep -rln "components/grading-chat" --include="*.structure.test.ts" src
-> src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts
   src/app/components/grading-chat/GradingChatPanel.structure.test.ts
```

Consequences for the wave gate (these go red on a change they do not "own"):
- `GradingChatPanel.structure.test.ts` reads `ChatComposer.tsx`,
  `GradingChatPanel.tsx`, `grading-chat.module.css`, and `LatestResultCard.tsx`
  as source text (`:12-13,244`). Record's composer edits CAN red its existing
  assertions (e.g. the "Send stays grouped in the text-mode adaptRow" check
  `:335-347`, the sticky-composer checks `:260-275`). The implementer must keep
  those invariants or update the canary SAME-COMMIT with justification. NOTE: this
  file will already have been edited by composite W2 / controls / visual before
  Record; Record briefs against its THEN-current state, not today's.
- `grading-chat-storage-keys.structure.test.ts` scans the whole directory raw
  (`:28-35`). A new file in the directory (the capture hook) with any `ta-`
  literal, or a new persisted key, reds it. Record adds neither (section 6), so it
  stays green - but the wave gate MUST run it to prove that.
- `src/file-size-ceiling.structure.test.ts` - unconditional, all of `src/`.

Wave gate (both waves), using the paths wrapper:
```
npm run test:paths \
  src/app/components/grading-chat/chatFrameCapture.test.ts \
  src/app/components/grading-chat/GradingChatPanel.structure.test.ts \
  src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts \
  src/file-size-ceiling.structure.test.ts
```
plus `npx tsc --noEmit` (single caller) and `npm run lint` (exit 0, no NEW
warning in Record's files vs the pre-change run).

Pass conditions, each naming object / instrument / direction:
- OBJECT the produced frame File; INSTRUMENT `chatFrameCapture.test.ts`
  (`frameToImageFile` name/mime/byte-round-trip); FAILS (red) if the name suffix
  is not `.jpg`, the type is not `image/jpeg`, or the bytes do not round-trip.
- OBJECT the grading-chat directory's `ta-` key set; INSTRUMENT the directory
  canary's frozen `EXPECTED`; FAILS if Record introduces any new `ta-` literal.
- OBJECT every `src/` file's line count; INSTRUMENT `file-size-ceiling`
  (`@(Get-Content)`-equivalent, LIMIT 1000); FAILS if any edited file exceeds
  1000 (none is near it, section 0.3).
- OBJECT the composer's existing invariants; INSTRUMENT
  `GradingChatPanel.structure.test.ts`; FAILS if a Record composer edit breaks an
  asserted structure without a same-commit canary update.

---

## 11. Residual register (owner / instrument / step - each present, or it is a deletion)

| id | residual | owner | instrument | step |
|---|---|---|---|---|
| RES-REC-LEV | the leverage claim is not authored (candidate class CAPTURE - device input a chat cannot receive, `leverage.md:38`; compounded with ATTRIBUTION via the composite merge) | loop-ac seat | `leverage.md` earned-vs-inherited check; a removal test is likely NOT buildable here because the advantage is CAPTURE/clicks and nothing renders - record that per `leverage.md:177-183` | Acceptance-criteria round for this item |
| RES-REC-ORACLE | the `frameToImageFile` oracle (axes from a source distinct from the generator; the `.webm`-name mutation) is not built | loop-test-author seat | a frozen oracle in `chatFrameCapture.test.ts` | test-seat round after Wave R1 design |
| RES-REC-CAPTURE | the capture itself (share, preview, frame grab, teardown) cannot be verified here - no render, `getDisplayMedia`/canvas absent under vitest | repo owner | browser walk of the Grading chat sub-tab, Record mode | owner walk after Wave R2 ships |
| RES-REC-ONEROW | that a multi-frame recording produces exactly ONE row with N frame images visible in `GradingResults` | repo owner | browser walk (live grading, network + API key present) | owner walk after Wave R2 ships |
| RES-REC-CADENCE | whether instructors want automatic interval sampling instead of manual Capture (Fork F3) | repo owner | product decision | owner decision; not blocking R1/R2 |
| RES-REC-SERIAL | Record cannot start until composite Wave 2 (the tray) lands; composite W1 is uncommitted working-tree state today | orchestrator | `git status --short` + `grep` for the composite tray in `ChatComposer.tsx` | gate before dispatching Record R2 |
| RES-REC-VISUAL | the Record segment's placement, the capture sub-panel layout, and focus/keyboard story are not designed here | Visual + UX + Accessibility seats | source-text canaries + reading claims (no component renders) | Wave R2 design pass against the as-built composer |

All residuals must be copied into `docs/BACKLOG.md` at disposal time by the
orchestrator (a residual that lives only here does not exist, per DEV_LOOP
step 0). A residual that is not in `docs/BACKLOG.md` does not exist.

---

## 12. Not trivially revertible

- Adding `"record"` to `InputMode` and its `loadInputMode` validator is additive
  and cleanly revertible (the persisted key is unchanged; a stored `"record"`
  value would fall back to the default `"text"` after a revert, no crash).
- The new `chatFrameCapture.ts` module is a clean add/delete.
- No migration, no persisted-key shape change (section 6), no change to
  `single-file-entry.ts`, `grading-chat-intake.ts`, `chatSubmissionIntake.ts`,
  `utils.ts`, or `extraction.ts` - the whole grading path is REUSED, not edited.
  This is the direct consequence of resolving the central fork to (C) with frames
  as composite file parts: the server and engine surface for Record is ZERO.
