# Scope: accept video submissions in the grading chat view

Branch main, HEAD c8586eeb. READ-ONLY architecture pass - no production code was
written. Every quantity below names the command that produced it. All citations
were opened. ASCII only (verified: `LC_ALL=C grep -nc '[^ -~\t]'` == 0 is the
acceptance check this file must pass; see Instruments).

Owner request: "make it so that videos submitted to the grading chat view are
accepted." Example input: a ~32MB Loom screen-recording mp4 (ISO Media MP4) of a
Jira module walkthrough. Owner extension (2026-10-11): video must be accepted
across ALL THREE ingest paths - loose single file, loose multi-file, and INSIDE
A ZIP - never one path accepting it while another silently drops it.

---

## 0. The headline finding, read this before the fork

Today a video is REFUSED on every path, in two different ways, and one of the
two is SILENT:

- Loose single/multi (composer File mode): `classifyGradingUpload(name)` returns
  `"unsupported"` for a video extension (`src/lib/grade/single-file-entry.ts:106-115`
  - the set is `TEXT_EXTENSIONS | DOCUMENT_EXTENSIONS | IMAGE_EXTENSIONS`, no
  video), so `resolveOnePart` kind `"file"` returns the worded refusal "This
  file type isn't supported for grading."
  (`src/app/actions/grading-chat-intake.ts:184-190`). A test already PINS this:
  `src/app/components/grading-chat/chatFrameCapture.test.ts:28` asserts
  `classifyGradingUpload("screen-recording-2.webm") === "unsupported"`.
- In-zip: `extractSubmissions`'s member classifier returns `"skip"` for a video
  extension (`src/lib/grade/extraction.ts:100-106`) - the file is dropped with
  NO entry, NO raw bytes, and NOT even counted in `failedSupportedFiles`. An
  instructor who zips a student's `walkthrough.mp4` gets a grade computed as if
  the video were not there.

So "accept" means, at minimum: recognize a video as a supported, gradable part
on all three paths, cap it, transport it, represent it to the grader, and report
it in diagnostics. What the grader DOES with it is the central fork (section 2).

**The finding that reshapes the fork (THE SURFACE IS A LAYER).** The owner wants
one answer applied "however the video arrives." A video arrives in two different
places:
- loose (composer): the bytes are in the BROWSER, on a `File`, before any
  upload;
- in-zip: the bytes are on the SERVER, inside a zip already uploaded to Storage
  and expanded by `ingestZipEntries` (`extraction.ts:227`), with no browser and
  no `HTMLVideoElement` anywhere near them.

A representation that can only be produced in the browser (client-side frame
sampling - the mechanism that already exists, section 1) therefore CANNOT be
produced for the in-zip path without adding a server-side video decoder
(ffmpeg-class dependency this repo does not have - measured: `grep -rni
"ffmpeg\|fluent-ffmpeg" src package.json` returns nothing). This is the load-
bearing consequence of the owner extension and it is what my recommendation in
section 2 turns on: the extension pushes AGAINST the cheap client-frames reading
and toward a uniform SERVER-SIDE sink.

---

## 1. Survey: how grading-chat intake works today (all cited, all opened)

### 1.1 The part-kind sink
`prepareChatSubmissionAction(formData)` (`grading-chat-intake.ts:131`) reads a
`kind` discriminator and calls the module-private `resolveOnePart(kind, data)`
(`:164`). The accepted kinds are exactly `"text"`, `"file"`, `"url"`
(`:167,174,221`); the composite action `prepareCompositeSubmissionAction`
(`:309`) resolves each part through the SAME `resolveOnePart`. There is no
`"video"` kind. `resolveOnePart` is the single sink all three composer paths and
the composite path already converge on - the right place for a video to be
handled identically however it is attached.

The client type `ChatSubmissionInput` (`chatSubmissionIntake.ts:26-35`) has
members `text | file | url | composite | storaged-zip`; `CompositePartInput`
(`:41-44`) is `text | file | url`. A video rides as `kind: "file"` today (a
`File` with an `.mp4`/`.webm` name) - it does not need a new client union member
unless the fork picks a path that requires one (section 2).

### 1.2 The loose file path, end to end
Composer File mode / drop -> `onSubmitFiles` (`ChatComposer.tsx:173,226`) ->
`handleSubmitFiles` (`GradingChatPanel.tsx:339`). Per file it calls
`chooseZipTransport(file)` (`:351`) then `preflightUploadFile` (`:353`); a non-
zip file takes the body path and is sent as FormData to
`prepareChatSubmissionAction` via `driver.submit({kind:"file",...})`
(`:362`, consumed at `useContinuousGradingRun.ts:412`). Inside `resolveOnePart`
kind `"file"`: `checkFileWireBudget(file.size,...)` (`grading-chat-intake.ts:179`),
then `classifyGradingUpload` (`:184`), then `buildSingleFileEntry` or
`ingestZipEntries` (`:196,206`).

### 1.3 The in-zip path, end to end
A zip over the body wire budget takes the Storage transport:
`chooseZipTransport` returns `"storage"` when `isZipFileName` and over wire
budget and under `GRADING_ZIP_MAX_BYTES = 25MB`
(`grading-zip-transport.ts:44-60,26`); `submitStoragedZip`
(`GradingChatPanel.tsx:320`) uploads via `uploadGradingZip` to
`${userId}/grading-uploads/<uuid>.zip` (`grading-zip-transport.ts:85-101`), then
`driver.submit({kind:"storaged-zip",...})` POSTs the path to
`/api/grade-submission-zip`. That route (`route.ts`) downloads the object,
`ingestZipEntries(await blob.arrayBuffer(), ...)` (`route.ts:131`), streams
NDJSON, deletes the object on every path. `ingestZipEntries` ->
`extractSubmissions` (`extraction.ts:67`), whose per-member classifier
(`:100-106`) is where video is dropped as `"skip"` today.

### 1.4 The caps machinery that already exists (REUSE, do not reinvent)
- Request-body transport: `src/lib/upload-budget.ts`. `VERCEL_BODY_LIMIT_BYTES =
  4.5MB` (`:38`), `UPLOAD_WIRE_BUDGET_BYTES = 3.5MB` (`:41`), WIRE vs FILE bytes
  distinction (`:16-33`), `checkFileWireBudget` (`:101`). The per-grade-item POST
  body is capped at `ITEM_REQUEST_BYTE_BUDGET = UPLOAD_WIRE_BUDGET_BYTES`
  (`incrementalRunPlan.ts:43`), enforced by `firstOversizedEntryReason` ->
  `estimateNeededWireBytes` (`grading-chat-intake.ts:113-120`,
  `incrementalRunPlan.ts:119-125`).
- Decompress / zip-bomb caps: `src/lib/zip-caps.ts`.
  `ZIP_MAX_MEMBER_DECLARED_BYTES = 40MB` (`:38`),
  `ZIP_MAX_CUMULATIVE_DECLARED_BYTES = 100MB` (`:36`),
  `ZIP_MAX_CUMULATIVE_ENTRIES = 1000` (`:34`), ratio caps `:41-42`,
  `ZIP_EXTRACTION_CONCURRENCY = 4` (`:44`). `extractSubmissions` charges the
  budget from DECLARED sizes BEFORE decompression, per nesting level
  (`extraction.ts:60-65,97`), and a breach throws `ZipCapError` and refuses the
  WHOLE archive. Crucially: the budget is charged only for members the classifier
  does NOT mark `"skip"` - so a `"skip"` video's bytes are NOT counted today.
  Measured: `grep -n "ZIP_MAX" src/lib/zip-caps.ts`.
- Storage transport ceiling: `GRADING_ZIP_MAX_BYTES = 25MB`
  (`grading-zip-transport.ts:26`), re-checked server-side
  (`grade-submission-zip/route.ts:116,130`).

### 1.5 The model path (what the grader can read today)
`LlmPart = { text } | { inlineData: { mimeType; data } }`
(`src/lib/llm.ts:33-35`). There is NO `fileData`/`file_uri` member - the app
CANNOT reference a Gemini Files API upload. The grader sends visual files as
INLINE base64 only: `scoreAxis` builds `parts: LlmPart[]` and pushes
`inlineData` (`engine.ts:96-101`) from `collectInlineVisualParts(submittedFiles)`
(`:413`); `filesToLlmPartsDetailed` does the same (`llm-files.ts:48-49`). The
inline-eligible set is images + PDF only: `GEMINI_INLINE_MIME_TYPES`
(`constants.ts:65-68`), `isGeminiInlineSupported` (`llm-files.ts:23-25`). No
video MIME anywhere. Default model `gemini-3.1-flash-lite`
(`gemini.ts:1`, `getGeminiModel` `:99`); `GEMINI_MODEL` overrides. No Files API
client exists: `grep -n "files/\|resumable\|uploadFile" src/lib/gemini.ts`
returns nothing.

**Consequence for transport.** A 32MB video is ~43MB on the wire base64'd
(`wireBytesForFile`, 4/3 inflation, `upload-budget.ts:56`). That is ~12x the
3.5MB per-item body budget AND over the 4.5MB Vercel body cap. Inline is
IMPOSSIBLE for a 32MB video on every path - loose OR in-zip - regardless of
fork. Any reading in which the GRADER SEES THE VIDEO ITSELF therefore requires
the Gemini Files API (`fileData` part), a new `LlmPart` member, and a new egress
- it cannot be done by widening the inline set.

### 1.6 The mechanism that already samples video frames (the frames reading's seed)
`src/app/components/grading-chat/chatFrameCapture.ts` already turns a LIVE screen
share into gradable image parts: `useChatScreenFrameCapture` samples frames from
a detached `HTMLVideoElement` via `encodeVideoFrame` -> canvas -> JPEG base64
(`:59-71`), delivered as image `File`s through `frameToImageFile` (`:25-30`) into
the composer's composite tray (`ChatComposer.tsx:91-93`). Caps: `MAX_RECORDING_FRAMES
= MAX_SHOTS = 12` (`:18`, `snapshot-shot.ts:43`), width `min(trackWidth, 1920)`
(`snapshot-shot.ts:51`), JPEG quality 0.92 (`:46`). It records a diagnostic via
`recordSnapDiagnostic` -> `capture_screenshot` operation
(`chatFrameCapture.ts:44-52`, `gradingDiagnosticLog.ts:30,47`). This operates on
a live `MediaStream`, NOT on an uploaded `File`, and it is client-only.

### 1.7 Diagnostics
`src/app/components/grading/gradingDiagnosticLog.ts` is the grading surface's
wrapper over the app-wide session diagnostic log. Operation vocabulary at
`:18-33`; every entry is student-data-free by construction (`:12-14`). Relevant
existing operations: `prepare_submission`, `grade_item`, `capture_screenshot`,
`classify_submission_{class,single,unknown}`. A new video path is a new
capability and a new failure surface, so it owes diagnostic representation
(DEV_LOOP b907ff8e); section 5 specifies it.

---

## 2. THE CENTRAL FORK: what "accepted" means (recommended reading, acted on)

This is a product fork I cannot settle from the code. Per AGENTS.md (SHAPE 5) I
recommend one reading, write the scope's SHAPE to it, and hand the terminating
question to the owner. The owner's extension said keep this fork, and it now
applies to a video "however it arrives" - which, per section 0, changes which
readings are even uniform.

### The three readings, re-evaluated against the three-path requirement

**(A) Native multimodal - the grader WATCHES the video (Gemini Files API).**
Each video's bytes are uploaded to the Gemini Files API server-side, yielding a
`file_uri` referenced by a new `LlmPart` `fileData` member. UNIFORM server-side
sink: loose videos transport to Storage then the server uploads them to the
Files API; in-zip videos are extracted server-side by `ingestZipEntries` and
each uploaded the same way. One seam (`fileData`), one uploader, all three paths
converge.
- Leverage (categorical, CAPTURE + SCALE): the grader watches motion AND hears
  audio narration of a screen-recording walkthrough, graded on ONE rubric held
  constant across the batch (`engine.ts:186`, SCALE). A chat window cannot watch
  a 32MB screen recording and grade it on a held rubric across N students.
- Cost if wrong / risk: ENTIRELY owner-walk-unverifiable here - no
  `GEMINI_API_KEY`, no Files API locally, network blocked under vitest
  (this-repo.md section 6). Every gate green proves NOTHING about whether Gemini
  accepts the video, how long processing takes, or whether the upload+poll+grade
  fits 60s (`maxDuration = 60`, `grade-submission-zip/route.ts:25`). A zip of
  several 32MB videos is a memory + time bomb: `ZIP_MAX_CUMULATIVE_DECLARED_BYTES`
  is 100MB, so up to ~3 videos could pass the decompress cap, then each needs a
  separate Files API upload inside one 60s request - infeasible without a per-run
  video-count cap or a background worker. Large unverifiable surface.

**(frames) Client-side frame sampling - the grader sees SAMPLED STILLS.**
Reuse `chatFrameCapture`'s `encodeVideoFrame` against an uploaded `File` decoded
in the browser (object URL + `HTMLVideoElement`); deliver ~12 JPEG frames as
composite parts. Loose video never leaves the browser; only tiny JPEGs upload.
- Leverage (thinner): visual-only (no audio narration), and it is largely a
  click-cost + SCALE claim - a chat user could scrub the Loom and paste
  screenshots manually; the app auto-samples. Real but closer to the AskAiModal
  negative example (`leverage.md:100-130`) than to a categorical win.
- FATAL against the owner extension: produces frames only where a browser
  decode point exists = the LOOSE composer paths. The IN-ZIP path has no browser
  and no `HTMLVideoElement`; frames there would require a server-side decoder
  this repo lacks. So frames CANNOT satisfy "accept in-zip video" uniformly. It
  can cover loose-only.
- Cost if wrong: if the owner picks frames but keeps the in-zip requirement, the
  in-zip path is unmet and we have shipped exactly the "one path accepts, another
  drops" failure the extension forbids.

**(C) Store + link only - no grading-content extraction.**
Uniform and cheap (reuse the Storage transport), testable, but gives the grader
NOTHING to read - the grade would ignore the video's content entirely. Near-zero
leverage; the negative-example shape in full. Include only as a fallback the
owner might pick to ship "accepted != crashed" fast.

### Recommendation (acted on in this scope): reading (A), native via Files API.

Because it is the ONLY reading that is UNIFORM across all three paths with the
existing architecture plus one new seam, and the only one with a categorical
leverage claim. I have written sections 3-7 to reading (A)'s shape. I did NOT
decide the fork - this is my reading, recorded as mine; when the owner answers,
that is the decision and it ends the activity.

### The terminating question for the owner (shape: every answer ends it)

> The "accept video in all three paths, including inside a zip" requirement is
> INCOMPATIBLE with the cheap client-side frames reading, because an in-zip
> video has no browser decode point (section 0). So the real fork is:
>
> - **(A)** native Gemini video via the Files API everywhere - strongest, uniform,
>   but entirely unverifiable in this environment and heavy/risky on the zip-of-
>   videos case (60s + memory); or
> - **(frames-loose)** keep the cheap, fully-testable client frames but RELAX the
>   in-zip requirement (in-zip videos stay refused-with-a-worded-reason, not
>   silently skipped); or
> - **(C)** store-and-link only, no grading of video content.
>
> Which do you want? (A) over-builds an unverifiable surface if you really wanted
> frames; (frames-loose) leaves in-zip video ungraded if you really wanted (A).
> The transport, caps, recognition and diagnostics layers below are written for
> (A); section 8 states exactly which waves are discarded or reshaped under each
> other answer.

Cost-if-wrong is symmetric and large, which is why this is a question and not a
default: (A) spends a big owner-walk build; (frames-loose)/(C) ship weaker
leverage. The leverage question's honest answer: the class is CAPTURE+SCALE under
(A), click-cost+SCALE under (frames), and NONE under (C).

---

## 3. Recognition across all three paths (THE SURFACE IS A LAYER)

A single owner of "is this extension a supported video" plus one sink, with a
source-text reachability pin per path so one path cannot accept video while
another drops it.

### 3.1 The one allow-list owner
Add video containers to a single exported set, consumed by every path. The
existing precedent is `IMAGE_EXTENSIONS` (`constants.ts:41-50`) +
`GEMINI_IMAGE_MIME_TYPES` (`:54-60`). Define, beside them (one owner, no drift):
- `VIDEO_EXTENSIONS = { mp4, webm, mov, m4v }` (accepted formats, section 6).
- `VIDEO_MIME_TYPES` mapping each to its container MIME (`video/mp4`, `video/webm`,
  `video/quicktime`). Add these to `MIME_TYPES` (`constants.ts:1-36`), which has
  no video entry today.
- For reading (A): a `GEMINI_FILE_API_MIME_TYPES` set (video containers Gemini's
  Files API accepts) - separate from `GEMINI_INLINE_MIME_TYPES`, because video is
  NEVER inline. `graderNeedsFileBytes` (`constants.ts:78-80`) must NOT return
  true for video (that predicate feeds the inline path and the wire-budget
  estimate `estimateNeededWireBytes`); video needs a parallel predicate that
  routes to the Files API and is EXCLUDED from the per-item wire budget.

### 3.2 The three sinks, each pinned
- Loose single + loose multi: `classifyGradingUpload`
  (`single-file-entry.ts:106-115`) gains a `"video"` kind (or routes video into a
  video branch of `resolveOnePart`). `resolveOnePart` kind `"file"`
  (`grading-chat-intake.ts:174`) dispatches a video file to the new video builder
  rather than `buildSingleFileEntry`/`ingestZipEntries`. Multi-file is the same
  sink iterated (`handleSubmitFiles` -> `submitFilesSequentially`,
  `GradingChatPanel.tsx:345`), so recognition is identical for one or many.
- In-zip: `extraction.ts:100-106` classifier returns `"leaf"` (not `"skip"`) for
  a video extension, and the leaf handler (`:113-146`) gains a video branch that
  records the raw bytes as a video `SubmittedFileInfo` (parallel to the image
  branch `:117-131`), so the student is grouped and the video reaches the model
  path.
- Reachability pins (source-text, because no component renders): one
  `*.wiring.test.ts` assertion per path that the video extension threads from the
  composer/zip-classifier THROUGH `resolveOnePart`/the leaf handler TO the
  model-part builder (`fileData` under A). Model: the existing seam pins
  `useContinuousGradingRun.wire.test.ts` and `GradingChatPanel.structure.test.ts`
  (`:442-465`, pins the composer prop wiring). THREE pins, one per path - a
  name-shaped grep does not prove a video reaches the model, so each pin asserts
  the emitted part shape, not the presence of a string.

### 3.3 The existing pin that MUST be updated (owned, not collateral)
`chatFrameCapture.test.ts:28` asserts `.webm` classifies `"unsupported"`. Under
any reading where video becomes a recognized kind, that assertion is now WRONG
and must be changed to the new expectation in the SAME wave - it is in the owns
list (section 9) precisely because it reads the behaviour we change.

---

## 4. Caps and safety (videos are large - the high-risk layer)

### 4.1 Loose video (single and multi)
- A loose video over the body wire budget cannot ride FormData (section 1.5). So
  under reading (A) a loose video takes a direct-to-Storage transport (section 5),
  with a pre-flight FILE-byte ceiling and a server re-check, mirroring the zip
  Storage transport exactly (`chooseZipTransport`/`uploadGradingZip`). Cap:
  reuse a single owner constant `VIDEO_MAX_BYTES` (propose 200MB, OWNER TO
  CONFIRM - a Loom of a long walkthrough can exceed the 32MB example; this is a
  product number, not derivable from code). Over-cap => a typed, worded refusal
  BEFORE upload (client) AND a server re-check (`statObjectSize` precedent,
  `grade-submission-zip/route.ts:47-61,116`), never a crash/OOM.
- Multi-file: the aggregate of several videos must be bounded too - each uploads
  to its own Storage object (no single body), so the per-file ceiling holds per
  video; a per-run count/total cap (propose: at most 3 videos, or total <=
  `VIDEO_MAX_BYTES * 3`, OWNER TO CONFIRM) bounds the Files API fan-out inside
  60s. Over-cap => typed refusal naming which file/aggregate tripped it.

### 4.2 In-zip video (the decompress bomb)
Making video a `"leaf"` (section 3.2) automatically brings it under the existing
decompress cap, because the budget charges declared bytes for every non-`"skip"`
member (`extraction.ts:60-65,97`; `zip-caps.ts`). This is the key reuse: NO new
cap code for the zip path. Consequences, each stated:
- A single in-zip video over `ZIP_MAX_MEMBER_DECLARED_BYTES = 40MB`
  (`zip-caps.ts:38`) => `ZipCapError`, whole archive refused with the "Refused: "
  worded prefix (`zip-caps.ts:29`). The 32MB example fits (under 40MB); a 50MB
  video does not.
- A zip whose expanded video payload exceeds `ZIP_MAX_CUMULATIVE_DECLARED_BYTES
  = 100MB` (`:36`) => `ZipCapError`, whole archive refused. So ~3 x 32MB videos
  is the practical ceiling for a zip today.
- OWNER DECISION SURFACED: `ZIP_MAX_MEMBER_DECLARED_BYTES` (40MB) and
  `VIDEO_MAX_BYTES` (loose, proposed 200MB) now bound the SAME quantity (one
  student's video) by different numbers depending on arrival path. Re-measured:
  `grep -n "ZIP_MAX_MEMBER_DECLARED_BYTES" src/lib/zip-caps.ts` = 40MB;
  `VIDEO_MAX_BYTES` does not exist yet. A loose 50MB video would be accepted while
  the same video inside a zip would refuse the archive. That asymmetry is a
  product decision - either align them or state the asymmetry deliberately. Do
  NOT silently ship two numbers for one quantity.
- TRANSPORT CONFLICT (must fix): `GRADING_ZIP_MAX_BYTES = 25MB`
  (`grading-zip-transport.ts:26`) is the ceiling for a zip taking the Storage
  transport - UNDER a single 32MB video. A zip containing one 32MB video is 25MB+
  and is REFUSED by `chooseZipTransport` before ingest ever runs
  (`:51-58`). So the in-zip video path is dead on arrival unless this ceiling is
  raised. Raising it means the server downloads a larger blob into memory
  (`route.ts:131`, whole blob in memory) and must still re-check against the
  decompress cap. Name a new `GRADING_ZIP_MAX_BYTES` (propose 120MB to clear a
  ~3-video zip, OWNER TO CONFIRM) and verify the in-memory download + ingest of
  that size fits 60s and the nodejs function's memory - a RELIABILITY-seat item
  (section 8, wave 2).

### 4.3 Event loop
Never block the event loop: client-side decode (frames reading) and base64 of
large buffers must be chunked/async; the zip ingest already runs bounded
(`runBounded`, concurrency 4, `extraction.ts:113`). For (A) the Files API upload
is network I/O (await), not CPU.

---

## 5. Transport, settled against the real deployment

Facts: Vercel Hobby, serverless body cap ~4.5MB (`upload-budget.ts:36-38`),
`maxDuration = 60` (`grade-submission-zip/route.ts:25`; memory:
deployment-vercel-hobby). A 32MB+ video CANNOT go through a server-action /
route-handler body.

- Loose video (reading A): direct-to-Storage upload, reusing the EXISTING
  grading upload machinery - `syllabusUploadStoragePath(userId, uuid, ext,
  "grading-uploads")` into `SYLLABUS_UPLOAD_BUCKET`
  (`grading-zip-transport.ts:85-101`), RLS-scoped by `${userId}` first segment.
  A new `video` segment or reuse of `grading-uploads` (name a segment, do not
  hand-write the path). The client sends only the storage path to a new route
  (mirror `/api/grade-submission-zip`), which downloads the object, uploads it to
  the Gemini Files API, obtains the `file_uri`, grades, and deletes the object on
  every path (the `withUploadedSyllabusFile` delete-on-every-path precedent,
  `route.ts:122-133`).
- In-zip video (reading A): the ZIP itself is the single upload (existing
  Storage transport, ceiling raised per 4.2). Its video members are extracted
  server-side inside the route; each video's bytes (already in memory from
  `ingestZipEntries`) are uploaded to the Files API there. No per-video client
  upload. This is how the zip path DIFFERS from the loose path, as the owner
  asked me to state.
- The Files API upload+poll-until-ACTIVE+grade must fit 60s. UNVERIFIABLE here
  (no key, no network). This is the single biggest reliability risk in (A) and a
  wave-2 reliability obligation; a per-run video cap (4.1) is the mitigation.
- signed-URL direct-to-Gemini from the browser is NOT viable: it would expose
  the Gemini key or require a signing endpoint, and the bytes still must be
  owner-gated (`requireAppOwner`). Keep the server as the only Files API caller.

---

## 6. Accepted formats

Validate by content type AND magic bytes, never extension alone (an extension
can lie; `single-file-entry.ts:14-18` documents the `.docx`-is-a-zip hazard this
repo already hit).
- mp4 (ISO Media, the example): magic `ftyp` box at offset 4 (`66 74 79 70`).
- webm (Loom's common output): magic EBML `1A 45 DF A3`.
- mov/quicktime: also `ftyp`/`moov`; `video/quicktime`.
- Propose accepting mp4 + webm at minimum (the example and Loom), mov as a
  cheap add. Magic-byte validation is a pure function => fully unit-testable
  (section 7). Extension classification stays the fast first gate
  (`classifyGradingUpload`); magic bytes are the server-side confirmation before
  any upload to the Files API, so a renamed non-video cannot reach Gemini.

---

## 7. Diagnostics (required - new capability, new failure surface)

Add to `GradingDiagnosticOperation` (`gradingDiagnosticLog.ts:18-33`) and its
label map (`:35-51`):
- `prepare_video` ("Prepare video submission") - one entry per video part, with
  `outcome` success/failure and `durationMs`; `error` is a FIXED class string
  (never raw - the module bans student data, `:12-14`), classes:
  `too large`, `unsupported format`, `upload failed`, `model rejected`,
  `extraction failed`. Mirror `recordSnapDiagnostic`'s fixed-class discipline
  (`chatFrameCapture.ts:32-52`).
- The in-zip path already records `classify_submission_*`
  (`gradingDiagnosticLog.ts:144-177`); a per-video accept/reject within the zip
  rides the same `prepare_video` operation, so the accept/reject/cap matrix is
  observable for loose-single, loose-multi, and in-zip alike (owner's
  requirement). This is a PURE decision + thin recorder (the
  `decideWholeRunDiagnostic`/`recordWholeRunSettled` pattern, `:101-132`) so it
  is unit-testable with no render.

No absence is claimed; this feature is user-reachable and gets diagnostics.

---

## 8. Waves

Serialization note: any BUILD serializes on the shared `tsc`/full-test resource
(this-repo.md section 2; one `tsc` caller, racing on `tsconfig.tsbuildinfo`).
1000-line ceiling per file is enforced repo-wide
(`file-size-ceiling.structure.test.ts`, LIMIT 1000). Files in flux that collide
with this work (from `git status` at HEAD): `src/lib/grade/engine.ts`,
`src/lib/grade/prompts.ts`, `src/app/actions/github-repos.ts` are modified in the
working tree; the repo-grades / grading-chat consolidation scopes are untracked
siblings. `engine.ts` is a collision for reading (A) wave 3 - coordinate.

Cut, under reading (A):

- **Wave 1 - recognition + constants + magic bytes (logic leaf, testable).**
  `VIDEO_EXTENSIONS`/`VIDEO_MIME_TYPES` in `constants.ts`; `classifyGradingUpload`
  video kind (`single-file-entry.ts`); `extraction.ts` leaf classification for
  video; magic-byte validator (new pure leaf). Update
  `chatFrameCapture.test.ts:28`. No transport, no model. Fully unit-testable.
  Includes the three reachability pins' SKELETON (recognition reaches the sink).
- **Wave 2 - caps + transport (SRC + reliability).** `VIDEO_MAX_BYTES`, per-run
  count cap; raise `GRADING_ZIP_MAX_BYTES` and verify in-memory download fits;
  new direct-to-Storage route for loose video (mirror
  `/api/grade-submission-zip`); `resolveOnePart` + `GradingChatPanel` loose-video
  Storage path; in-zip leaf video-bytes capture. Depends on wave 1's recognition.
  SECURITY + RELIABILITY seats gate this wave (new egress, new route, 60s/memory).
- **Wave 3 - the model seam (owner-walk, isolated).** `LlmPart` `fileData` member
  (`llm.ts:33-35`); Gemini Files API uploader (`gemini.ts`, new); `collectInlineVisualParts`/
  `scoreAxis` video branch (`engine.ts:96-101,413`); exclude video from
  `estimateNeededWireBytes`/the inline wire budget; per-item route `fileData`
  threading. This wave is ENTIRELY unverifiable here (no key, no network, no
  render) - its tests mock the Files API CLIENT (not fetch; memory:
  tests-are-network-blocked) and assert the emitted `fileData` part shape; the
  real upload + real grade are owner-walk.
- **Wave 4 - UI + diagnostics.** Composer affordance for video (a video file is
  already pickable - the file input has no `accept` filter,
  `ChatComposer.tsx:267`; so this is copy/affordance + a video part-type tray
  row, `describePart` `:65-69`), progress/uploading states, over-cap error copy;
  `prepare_video` diagnostic. UX + a11y + visual seats here.

How the fork changes the cut:
- If owner picks **(frames-loose)**: waves 2/3 collapse. No Storage transport for
  loose video, no Files API, no `fileData` seam - instead reuse
  `chatFrameCapture`'s `encodeVideoFrame` against an uploaded `File` (new decode-
  from-file hook), delivering JPEG composite parts. In-zip video stays REFUSED
  with a worded reason (classify as a NEW `"video-unsupported-in-zip"` that counts
  as a failed supported file, not a silent `"skip"`). Much smaller, fully
  testable. Wave 1 recognition is still needed (to route loose video to the
  frame decoder and to give in-zip a worded refusal instead of silence).
- If owner picks **(C)**: waves 1-2 only (recognize, transport to Storage, link);
  no model wave; the grade ignores video content. Smallest.

---

## 9. The `owns` file list

Derived, not recalled. Production files traced in sections 1-7; source-text
tests enumerated by:

```
# grading-chat test files (Get-ChildItem src\app\components\grading-chat\*.test.ts)
chatFileBatch.test.ts, chatFrameCapture.test.ts, chatSeamDiagnostic.test.ts,
chatSeamDiagnostic.wiring.test.ts, chatSnap.test.ts, chatSubmissionIntake.test.ts,
grading-chat-storage-keys.structure.test.ts, GradingChatPanel.structure.test.ts,
useContinuousGradingRun.{classification,diagnostic,lifecycle,wire}.test.ts
# inline-type symbol readers (Select-String ... GEMINI_INLINE_MIME_TYPES|...)
src\lib\llm-files.test.ts
```

Production (edited; by reading A - (frames)/(C) drop the model/transport rows):
- src/lib/grade/constants.ts (video extensions + MIME + Files-API set)
- src/lib/grade/single-file-entry.ts (classifyGradingUpload video kind)
- src/lib/grade/extraction.ts (zip leaf classification + video leaf handler)
- src/app/actions/grading-chat-intake.ts (resolveOnePart video dispatch)
- src/app/components/grading-chat/chatSubmissionIntake.ts (part-kind if a new union member is needed)
- src/app/components/grading-chat/ChatComposer.tsx (affordance, tray row)
- src/app/components/grading-chat/GradingChatPanel.tsx (loose-video transport handler)
- src/app/components/grading-chat/useContinuousGradingRun.ts (driver submit path)
- src/app/components/grading/gradingDiagnosticLog.ts (prepare_video operation)
- src/lib/grade/grading-zip-transport.ts (ceiling; maybe a video transport sibling)
- src/app/api/grade-submission-zip/route.ts (in-zip video + raised ceiling)
- (A) src/lib/llm.ts (LlmPart fileData), src/lib/llm-files.ts, src/lib/grade/engine.ts,
  src/lib/gemini.ts (Files API), src/app/api/grade-run-item/route.ts, src/app/components/grading/incrementalRunPlan.ts (exclude video from wire budget)
- NEW: a magic-byte video validator leaf; (A) a NEW loose-video Storage route +
  a NEW Gemini Files API client leaf.

Tests that read the edited files AS SOURCE TEXT (go red if the change is correct
but the pin is not updated - MUST be in the assignment):
- src/app/components/grading-chat/chatFrameCapture.test.ts (:28 pins `.webm` unsupported - MUST update)
- src/app/components/grading-chat/chatSubmissionIntake.test.ts
- src/app/components/grading-chat/GradingChatPanel.structure.test.ts (:442-465 composer prop wiring)
- src/app/components/grading-chat/useContinuousGradingRun.{wire,classification,diagnostic,lifecycle}.test.ts
- src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts (input-mode storage key canary, if a mode is added)
- src/lib/grade/extraction.zip-caps.test.ts, extraction.zip-caps.oracle.test.ts, src/lib/zip-caps.test.ts (cap behaviour)
- src/lib/llm-files.test.ts, src/lib/grade/engine.*.test.ts (A)
- src/file-size-ceiling.structure.test.ts (UNCONDITIONAL - engine.ts and GradingChatPanel.tsx are near-large; measure after)
- src/lib/no-emojis.test.ts + src/source-bytes.structure.test.ts (docs gate for this scope file; run `npm run docs:gate`)

Measured sizes at HEAD (`@(Get-Content <f>).Count`): ChatComposer.tsx 436,
chatFrameCapture.ts 229, GradingChatPanel.tsx 565, useContinuousGradingRun.ts
593, chatSubmissionIntake.ts 148, grading-chat-intake.ts 340, single-file-entry.ts
220, gradingDiagnosticLog.ts 177. None near 1000 today, but engine.ts and the
driver grow under (A) - re-measure each touched file in the wave gate, never from
these numbers.

Gate for any wave touching 2+ test paths: `npm run test:paths <p1> <p2> ...`
(never a raw multi-path vitest - it silently drops unmatched args,
this-repo.md section 1). Always include
`src/file-size-ceiling.structure.test.ts`.

---

## 10. Residual register (each has owner, instrument, step)

Entries to file into `docs/BACKLOG.md` at disposal (a residual not in the backlog
does not exist):

1. **The fork itself.** Owner: repo owner. Instrument: the terminating question
   in section 2. Step: owner answers A / frames-loose / C; the answer ends the
   activity and selects the wave cut (section 8). Until answered, sections 3-7
   are written to (A). File as a fork row per AGENTS.md SHAPE 5 (tally in the
   row, started = a commit touching an owns path within two commits).
2. **`VIDEO_MAX_BYTES` and the in-zip vs loose member-size asymmetry (4.2).**
   Owner: repo owner (product number). Instrument: `grep -n
   "ZIP_MAX_MEMBER_DECLARED_BYTES" src/lib/zip-caps.ts` (= 40MB) vs the chosen
   `VIDEO_MAX_BYTES`. Step: owner sets both numbers or confirms the asymmetry;
   implementer pins them in one owner constant each.
3. **`GRADING_ZIP_MAX_BYTES` raise + 60s/memory fit (4.2, 5).** Owner: RELIABILITY
   seat, then owner-walk confirmation in prod. Instrument: a size/time analysis in
   the wave-2 reliability pass against `maxDuration = 60`
   (`grade-submission-zip/route.ts:25`); cannot be measured here (no deploy). Step:
   reliability pass computes the budget; prod walk confirms a real large zip.
4. **The entire model path under (A) is owner-walk-unverifiable.** Owner: repo
   owner. Instrument: NONE here - no `GEMINI_API_KEY`, network blocked under
   vitest, no component rendered (this-repo.md section 6). Step: unit tests mock
   the Files API client and assert the `fileData` part shape; a real 32MB Loom
   graded end to end is an owner walk. This is a deletion-if-omitted: do NOT
   propose any requirement whose only enforcer would be a live grade.
5. **Per-run video count/total cap (4.1).** Owner: SRC/reliability seat.
   Instrument: a pure cap function + unit test over mocked multi-upload. Step:
   wave 2.

## 11. What I could NOT determine here (stated, not filled in)
- Whether Gemini `gemini-3.1-flash-lite` (the default) accepts video via the
  Files API, the real size/duration limits, and processing latency. No key, no
  network. All of reading (A)'s model behaviour is owner-walk.
- Whether a raised-ceiling zip download + ingest + per-video Files API upload
  fits 60s / function memory. No local deploy.
- Nothing renders under vitest, so every UI/affordance claim in section 8 wave 4
  is a reading claim, and no requirement here rests on a render.
