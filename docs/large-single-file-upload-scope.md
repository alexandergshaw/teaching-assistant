# Scope: large single non-zip submission refused in grading chat

Owner-reported bug, 2026-10-12. A 6.06 MiB `.docx` submission
(`SecurityUpgradePaper.docx`, 6,354,708 bytes) is refused in the grading chat
as "too large" and cannot be graded.

READ-ONLY scope. No production files were edited producing this document. All
`file:line` citations were opened; every quantity names the command that
produced it. ASCII only. A fresh `loop-checker` reads this before any build.

---

## 0. Leverage (one line)

This is a BUG FIX, not a feature, so no leverage claim is owed; the fired
trigger is "bug fix restoring an existing capability" (`seats.md`, AC brief:
"On a bug fix ... there is no claim to make"). For the record the capability it
restores is CAPTURE/SCALE-adjacent - the app grades a dropped 6 MiB document a
chat window cannot ingest at all - but the claim is not re-argued here.

---

## 1. The measured bug, verified in tree

Byte math (`powershell`: `[math]::Ceiling(6354708*4/3)`, `3.5*1024*1024`,
`[math]::Floor((3.5*1024*1024)/(4/3))`):

| Quantity | Value |
|---|---|
| File on disk (`SecurityUpgradePaper.docx`) | 6,354,708 bytes (6.06 MiB) |
| WIRE bytes once base64-encoded (`ceil(size*4/3)`) | 8,472,944 bytes (8.08 MiB) |
| `UPLOAD_WIRE_BUDGET_BYTES` (`upload-budget.ts:41`) | 3,670,016 bytes (3.5 MiB) |
| `maxFileBytesForWireBudget()` (shown in the refusal) | 2,752,512 bytes (2.6 MiB) |

The user-facing refusal reads "This file is too large to upload in one request
(6.1MB, limit 2.6MB)" (`upload-budget.ts:90-93`, `formatMB` quotes FILE bytes).

**Path correction (brief vs tree).** The brief states both files live in
`src/app/actions/lib`. Measured (`Glob`): there is no `src/app/actions/lib`
directory. The real paths are `src/app/actions/grading-chat-intake.ts` and
`src/lib/grade/grading-zip-transport.ts`. The brief's line cite is otherwise
correct: `grading-chat-intake.ts:187` is
`const budgetCheck = checkFileWireBudget(file.size, "This file");`.

---

## 2. Root cause: THREE budget gates, not one

The brief names one gate (raw-size refusal at intake). There are three, all
measuring against the SAME 3.5 MiB budget, and a complete fix must clear all
three. This is the load-bearing correction to the brief, and it changes the
design.

**Gate 1 - intake raw-size refusal (the reported symptom).**
`src/app/actions/grading-chat-intake.ts:187-190` (inside `resolveOnePart`,
`kind === "file"`) calls `checkFileWireBudget(file.size, ...)` BEFORE any
classification or extraction. A 6.06 MiB file fails here. This runs for every
file kind (single / zip / video) alike.

**Gate 2 - intake per-entry budget.** Even if Gate 1 were bypassed, the entry
`buildSingleFileEntry` produces carries the full source bytes as base64 (see
below), and `grading-chat-intake.ts:121-127` (`firstOversizedEntryReason`)
refuses when `estimateNeededWireBytes(entry) > ITEM_REQUEST_BYTE_BUDGET`.
`ITEM_REQUEST_BYTE_BUDGET === UPLOAD_WIRE_BUDGET_BYTES` (3.5 MiB,
`incrementalRunPlan.ts:43`).

**Gate 3 - grade dispatch budget.** Even if Gates 1-2 were bypassed, the client
dispatches the entry to `POST /api/grade-run-item`, whose body parser refuses
identically: `src/app/api/grade-run-item/route.ts:171`,
`if (estimateNeededWireBytes(entry) > ITEM_REQUEST_BYTE_BUDGET) return null;`
-> 400 "This submission could not be read."

**Why the entry's bytes are "needed" for a docx, so Gates 2-3 bite.**
`buildSingleFileEntry` (`single-file-entry.ts:207-222`) sets
`rawBase64: buffer.toString("base64")` on the submitted file (~8.47 MiB here).
Whether that base64 counts toward the per-item budget is decided by
`fileNeedsRawBytes` (`incrementalRunPlan.ts:115-117`) =
`graderReadsFileBytes(mimeType) || previewTruncated`.
`graderReadsFileBytes` (`:96-98`) =
`graderNeedsFileBytes(mime) || OFFICE_IMAGE_SOURCE_MIME_TYPES has mime`.

For a docx, `getMimeType("docx")` =
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`
(`constants.ts:3`). That mime is NOT in `GEMINI_INLINE_MIME_TYPES` (images +
PDF only, `constants.ts:87-90`), so `graderNeedsFileBytes` is false - BUT it IS
in `OFFICE_IMAGE_SOURCE_MIME_TYPES` (`constants.ts:94-97`), so
`graderReadsFileBytes` is TRUE. The source bytes are therefore kept by
`stripUnneededRawBase64` (`:129-139`) and counted by `estimateNeededWireBytes`.

**Where the docx bytes are actually consumed.** At GRADE time, server-side,
`collectInlineVisualParts` -> `officeImageParts`
(`inline-visuals.ts:23-34,43-55`) calls
`extractOfficeImagesWithData(kind, Buffer.from(f.rawBase64, "base64"))`
(`office-edit.ts:781-792`). The embedded raster images are pulled out of the
SOURCE docx bytes inside the grader. So the full container must reach the
grader for the images to be seen - which is exactly why the bytes are "needed",
and exactly why a stored-then-rebuilt entry still fails Gate 3.

**Consequence for the brief.** The brief's proposal (A) - "the raw bytes go to
Supabase Storage ... the server downloads + extracts them server-side ... builds
the entry" - clears Gate 1 but, as framed, builds an entry that still fails
Gates 2-3 for a docx/pptx. Routing raw bytes to storage is necessary; it is not
sufficient. The design below adds the missing decision: what reaches the grader.

---

## 3. The real fork: what reaches the grader (per file kind)

The brief's fork is A (storage transport) vs B (client extraction). That fork is
about how RAW bytes reach the server. The consequential fork the brief did not
pose is what reaches the GRADER, and its answer differs by file kind. This is
where SHAPE matters, so it is stated explicitly.

| Kind (over budget) | What the grader needs today | Fits a 3.5 MiB grade body? | Resolution |
|---|---|---|---|
| Office text/doc: `.docx`/`.pptx`/`.xlsx`/`.odt`/... | extracted TEXT (small) + embedded raster images, pulled from source bytes at grade time | No (source bytes counted) | FORK-VISUALS (below) |
| Plain text/code: `.txt`/`.md`/`.py`/... | `entry.content` = full extracted text; source base64 dropped by strip (`graderReadsFileBytes` false, `previewTruncated` aside) | Usually yes once routed server-side; `content` itself is bounded by `MAX_CONTENT_CHARS = 2_000_000` (`route.ts:67`) | storage -> text entry; content-cap residual |
| `.pdf` | the WHOLE PDF sent inline to the model (`GEMINI_INLINE_MIME_TYPES` has `application/pdf`) | No, and there is NO text-only equivalent that preserves today's behaviour | OUT OF THIS BUILD; storage-to-grade residual |
| single image `.png`/`.jpg`/... | the image bytes sent inline | No at 6 MiB, but a downscale lever exists (`downscaleImageToBudget.ts`) | OUT OF THIS BUILD; downscale residual |

**FORK-VISUALS (office text/doc, the reported class).**

- **(i) TEXT-ONLY (recommended for this build).** Extract text server-side at
  ingest; build an entry whose single submitted file carries `previewContent`
  and NO `rawBase64`, and whose `content` is the extracted text. Then
  `estimateNeededWireBytes` = `content.length` only, which clears Gates 2-3 with
  no change to `grade-run-item`. COST, stated as an acceptance criterion and a
  residual: the embedded raster images of a LARGE office file are not seen by
  the model (small office files still get them today via `inline-visuals`). The
  grade proceeds on text, which is exactly `inline-visuals.ts`'s own documented
  fallback on any image-extraction failure (`:19-21,32-34`).
- **(ii) VISUALS-PRESERVED.** At ingest, extract text AND the embedded office
  images, DOWNSCALE each image under budget (reuse the image-downscale lever,
  `src/app/components/grading/downscaleImageToBudget.ts`), and attach them as
  separate `image/*` submitted files (which the grader already inlines directly,
  `inline-visuals.ts:47-49`), dropping the source container bytes. Preserves
  visuals within budget but is a materially larger change: office-image
  extraction moves to (or is duplicated at) ingest time, diverging from the
  grade-time extraction the small-file path still uses.

**Recommended reading (mine, not an owner ruling): (A) + FORK-VISUALS (i),**
scoped to office text/doc and plain-text single files. Rationale, grounded in
the tree:

- **(A) over (B): the extractor is server-only by construction.**
  `office-extract.ts` imports `jszip`/`officeparser`/`Buffer` and its header
  (`:16-19`) says it must never be imported client-side;
  `chatSubmissionIntake.ts:9-16` records that `classifyGradingUpload` is
  deliberately NOT re-exported into the client leaf for this reason, policed by
  `runtime-import-graph.test.ts`. (B) would ship an OOXML parser to the browser
  and fork extraction from the server's single source of truth. (A) reuses
  `extractTextFromBuffer` unchanged.
- **(i) over (ii): smallest fix that grades the reported file,** touching no
  budget constant and not the grade dispatch. (ii) is a clean follow-up once the
  owner decides whether large-file visuals are worth the added ingest surface.

The owner fork question is in section 9, shaped so every answer terminates.

---

## 4. The design (recommended path: A + FORK-VISUALS (i))

A new single-file storage lane, a SIBLING of the two that already exist
(`chooseZipTransport` for zips, `decideVideoTransport` for videos), not a
generalisation of `isZipFileName`. Three transports now fan out from the same
file pick; a third sibling keeps each lane's refusal wording and ceiling its
own. The video lane (`video-transport.ts` + `POST /api/grade-submission-video`)
is a near-exact precedent for every piece below.

### 4.1 Client transport choice

Add to `src/lib/grade/grading-zip-transport.ts` (or a sibling leaf
`single-file-transport.ts`; the zip module is 119 lines by
`@(Get-Content).Count`, so either fits the 1000-line ceiling):

- `SINGLE_FILE_MAX_BYTES` - the stored-object ceiling for a single file.
  Recommend defining it `= GRADING_ZIP_MAX_BYTES` (110,100,480 bytes = 105 MiB,
  measured: `ZIP_MAX_CUMULATIVE_DECLARED_BYTES = 100*1024*1024`,
  `zip-caps.ts:36`, plus 5 MiB, `grading-zip-transport.ts:31`). Reusing the zip
  ceiling means the Storage bucket limit the owner already raised for zips
  (>=105 MiB) covers this with NO new infra action.
- `chooseSingleFileTransport(file, ingestEnabled)` returning the existing
  `ZipTransport` union shape (`body | storage | refused`): a zip or a video is
  not its concern (the caller consults those siblings first and this returns
  `body`); a non-zip/non-video file within the wire budget -> `body`
  (unchanged); over the budget with ingest enabled and under
  `SINGLE_FILE_MAX_BYTES` -> `storage`; over the ceiling -> `refused` with a
  worded message mirroring the zip path (`grading-zip-transport.ts:56-64`).
  Gate it on `GRADING_ZIP_STORAGE_INGEST_ENABLED` (the dark flag already in that
  file, `:22`) so the whole lane ships behind one switch.

### 4.2 Client wiring (the surface the user reaches)

`src/app/components/grading-chat/GradingChatPanel.tsx`, `handleSubmitFiles`
(`:348-392`). After the video decision (`:358-374`) and in place of the current
zip-only transport line (`:380-391`): consult the single-file transport sibling
too. On `storage`, upload via a new `uploadGradingSingleFile` (a sibling of
`uploadGradingZip`, `grading-zip-transport.ts:90-106`, writing to the same
`${userId}/grading-uploads/<uuid>.<ext>` namespace via
`syllabusUploadStoragePath`) and call
`driver.submit({ kind: "storaged-file", storagePath, name })`. This wave
contains the caller of every new export (the panel calls the transport chooser
and the uploader; the driver calls the ingest client), satisfying the
caller-inclusion rule.

### 4.3 Driver + input type

- `src/app/components/grading-chat/chatSubmissionIntake.ts`: add
  `{ readonly kind: "storaged-file"; readonly storagePath: string; readonly name: string; readonly label?: string }`
  to `ChatSubmissionInput` (`:27-41`), beside `storaged-zip` and
  `storaged-video`.
- `src/app/components/grading-chat/useContinuousGradingRun.ts`: add a
  `storaged-file` branch in `submit` (`:352-512`), modelled on the
  `storaged-video` branch (`:412-432`) - capture `sessionIdRef` before the
  await (ghost-run guard), call a new `ingestSingleFile` client, record the seam
  via `recordChatSeamSettled`/`recordClassifySettled` (diagnostics
  representation; section 6), and on refusal best-effort delete the temp object.
  Inject the client as an optional param defaulting to the real one, matching
  `ingestZip`/`prepareVideo` (`:95-102,186-187`) so the no-render lifecycle
  harness can drive it.

### 4.4 Server ingest route

New `src/app/api/grade-submission-file/route.ts`, modelled line-for-line on
`grade-submission-video/route.ts` (112 lines) and `grade-submission-zip`
(230 lines). Fixed order, pinned by its own route test:

1. `requireAppOwner()` before the body is read (401 on failure).
2. JSON content-type CSRF floor (400 otherwise).
3. Parse; read `storagePath`, `provider`, optional `label`.
4. Dark-flag gate on `GRADING_ZIP_STORAGE_INGEST_ENABLED`.
5. Path bind: `isKnownUploadPath(userId, storagePath)` AND segment
   `[1] === "grading-uploads"` AND an extension in the single-file allowlist
   (text/office/image extensions; NOT `.zip`, NOT a video extension - those are
   the siblings' namespaces), mirroring `grade-submission-zip/route.ts:121-127`.
6. `statObjectSize` gate against `SINGLE_FILE_MAX_BYTES` before download
   (client pre-flight not trusted), mirroring `:131-134`.
7. `withUploadedSyllabusFile` (download + delete-on-every-path) wrapped in
   `raceWithTimeout` under a soft budget below `maxDuration`, mirroring
   `:183-203`. Inside: `extractTextFromBuffer(name, buffer)` then build a
   TEXT-ONLY entry (section 4.5). Return `{ entry }` (200) or a worded error.

Run `runtime = "nodejs"`, `maxDuration = 60`, `dynamic = "force-dynamic"` as the
sibling routes do.

### 4.5 The text-only entry builder (clears Gates 2-3)

A server-side builder (new, or a `rawBase64`-dropping option on
`buildSingleFileEntry`) that returns an entry whose submitted file has
`rawBase64` ABSENT. Concretely: `content` = extracted text, `submittedFiles[0]`
= `{ name, extension, previewContent, previewTruncated, mimeType }` with no
`rawBase64`. Because `estimateNeededWireBytes` only adds `rawBase64.length` when
present (`incrementalRunPlan.ts:121-124`), an absent source base64 makes needed
bytes = `content.length`, which clears Gates 2-3. Name inference
(`inferStudentNameFromContent`, `single-file-entry.ts:67-96`) may run
server-side here exactly as it does in the body path.

Do NOT rely on `stripUnneededRawBase64` to remove the bytes: it KEEPS bytes when
`previewTruncated` is true (`:115-117`), which a long docx preview can be, so the
builder must omit `rawBase64` outright rather than set-then-strip.

---

## 5. Caps

- Below the wire budget (file <= 2,752,512 bytes): BODY path, unchanged.
- Between the wire budget and `SINGLE_FILE_MAX_BYTES`: STORAGE path (this build).
- Over `SINGLE_FILE_MAX_BYTES`: a worded refusal, nothing uploaded, mirroring the
  zip ceiling refusal (`grading-zip-transport.ts:56-62`).
- `SINGLE_FILE_MAX_BYTES` recommended `= GRADING_ZIP_MAX_BYTES` (105 MiB) so the
  existing bucket limit covers it and the server-side ingest work is already
  bounded by the zip-bomb caps that `extractTextFromBuffer` runs
  (`office-extract.ts:214-229`, `assertContainerWithinCaps`). An independent,
  smaller single-file figure is legitimate but a second number that can drift;
  if chosen, define it once and import it into the route's stat gate, as
  `GRADING_ZIP_MAX_BYTES` is (`grade-submission-zip/route.ts:10,132,193`).
- INDEPENDENT of the above: a graded text payload is still bounded by
  `MAX_CONTENT_CHARS = 2_000_000` at `grade-run-item/route.ts:67`. A file whose
  EXTRACTED TEXT exceeds that is refused at the grade dispatch even after this
  build. Residual, section 8.

The VIDEO lane and the ZIP lane are untouched. This adds the single-file lane
only.

---

## 6. Diagnostics representation (acceptance criterion)

The new seam reports through the same chat diagnostics the zip and video lanes
use. The `storaged-file` driver branch must call `recordChatSeamSettled`
(operation name for the prepare step) and `recordClassifySettled`
(`useContinuousGradingRun.ts:402-407,495-511`) so a stored single-file ingest -
its latency and its failure class (not-found / over-ceiling / timed-out /
unreadable) - is observable, not invisible. A built diff that adds the lane with
no diagnostic line is an unmet criterion (`DEV_LOOP.md`, "Diagnostics
representation").

---

## 7. Waves, smallest-first

Sequential (W1 then W2); regenerate W2's brief after W1 lands. Each wave
includes the caller of every new runtime export it adds.

**W1 - server ingest, dark.** Owns:

```
src/app/api/grade-submission-file/route.ts            (new)
src/lib/grade/single-file-entry.ts                    (add text-only builder/option)
src/app/api/grade-submission-file/route.test.ts       (new)
src/lib/grade/single-file-entry.test.ts               (extend; exists, 1 existing test file)
```

The route is reached over HTTP (a route handler is not a dead export; the
framework is its caller), and it is dark behind `GRADING_ZIP_STORAGE_INGEST_ENABLED`
until W2 drives it. The route test asserts the fixed order, the path/segment/
extension bind, the stat-size ceiling (413), the timeout line, and that the
returned entry carries NO `rawBase64` and passes `estimateNeededWireBytes <=
ITEM_REQUEST_BYTE_BUDGET`. Verify (W2) confirms reachability.

**W2 - client lane + wiring (flips reachability).** Owns:

```
src/lib/grade/grading-zip-transport.ts                (add chooseSingleFileTransport, SINGLE_FILE_MAX_BYTES, uploadGradingSingleFile)
src/app/components/grading-chat/chatSubmissionIntake.ts   (add storaged-file member)
src/app/components/grading-chat/useContinuousGradingRun.ts (add storaged-file branch + ingest client param)
src/app/components/grading-chat/GradingChatPanel.tsx      (wire transport + upload + submit)
src/lib/grade/ndjson-ingest-parser.ts OR a new client helper (ingestSingleFile)   (new/extend)
src/lib/grade/grading-zip-transport.test.ts            (extend)
src/app/components/grading-chat/*.test.ts              (extend driver/lifecycle tests)
```

Disjointness is not required ACROSS sequential waves. W1 and W2 share only the
route's wire contract and the new builder's signature, both frozen at W1.

### 7.1 Gate commands (both waves)

Run from PowerShell. Multi-path test runs use `npm run test:paths` (a raw
multi-path `vitest` silently drops unmatched args, `this-repo.md` section 1).

- Typecheck: `npx tsc --noEmit` (no output, exit 0).
- Lint: `npm run lint` (exit 0; no NEW warning in files this wave writes,
  measured against the same command before the change - do not pin the count).
- Structural ceiling, every wave: `npx vitest run src/file-size-ceiling.structure.test.ts`.
- W1 targeted:
  `npm run test:paths src/app/api/grade-submission-file/route.test.ts src/lib/grade/single-file-entry.test.ts`
- W2 targeted:
  `npm run test:paths src/lib/grade/grading-zip-transport.test.ts src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts src/app/components/grading-chat/chatSubmissionIntake.test.ts`
  (confirm each path resolves to an executed file with `COVERED`; add real test
  files only).
- An actions/route file changed in both waves, so the security pass runs: the
  new route adds egress (Storage download) and a new `"use server"`-adjacent
  endpoint - run the wholesale-auth / action-guard structure canaries if a
  `src/app/actions` file is touched, and confirm `requireAppOwner()` is the first
  statement (the sibling routes' pinned order).
- FULL sweep per wave before the push: `npm test`
  (snapshot `Test Files .. passed` / `Tests .. passed`, exit 0; re-measure, do
  not quote a count).

### 7.2 Seats to run

Architect (this doc; every wave touches >2 files). Data/storage (a new Storage
object lifecycle - creation, the delete-on-every-path, the orphan sweep).
Security (new egress, new owner-gated route, path-traversal on `storagePath`,
SSRF-free by construction since the server mints the path). Reliability (the
download+extract timeout against `maxDuration`, temp-object leak on every
failure path). Test seat (always). UX/Visual/A11y triage OUT for W1 (no user
surface) and IN for W2 only for the refusal copy and the upload-phase indicator
(no new control; reuses the existing drop surface).

---

## 8. What cannot be verified here, and residuals

**Cannot be verified in this checkout** (`this-repo.md` section 6): no live
Supabase and the network is blocked, so the Storage UPLOAD, the server DOWNLOAD,
and the real bucket limit are owner-walk only. The build can verify, through
mocks: the transport CHOICE (`chooseSingleFileTransport` unit tests), the
text-only entry BUILD from a buffer via a mock bucket/`extractTextFromBuffer`,
the entry clearing `estimateNeededWireBytes <= ITEM_REQUEST_BYTE_BUDGET`, and the
ceiling REFUSAL. No component is rendered by any test, so the panel wiring is a
reading claim (W2 verify).

**Residual register** (each: owner / instrument / step; absent any of the three
it is a deletion). All must be filed in `docs/BACKLOG.md` at disposal or they do
not exist.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-LSF-1 | Large office files lose embedded-image visuals under FORK-VISUALS (i) | loop-ac / owner | A W2 acceptance criterion stating the cost; a driver/intake unit test asserting the `storaged-file` entry carries no `image/*` parts | Named in W2 criteria; re-judged at Verify against the built diff |
| RES-LSF-2 | FORK-VISUALS (ii) - preserve visuals via ingest-time image downscale | owner (product) | design follow-up; reuses `downscaleImageToBudget.ts` | A new scoped item if the owner wants visuals for large files |
| RES-LSF-3 | Large single PDF still refused (whole PDF sent inline; no text-only equivalent) | owner (product) | `grade-run-item` storage-to-grade design (read PDF from Storage, like video) | A new scoped item; NOT in this build |
| RES-LSF-4 | Large single image still refused over budget | loop-plan | reuse `src/app/components/grading/downscaleImageToBudget.ts` before upload | A follow-up wave; NOT in this build |
| RES-LSF-5 | Extracted text over `MAX_CONTENT_CHARS` (2,000,000) refused at grade dispatch | loop-ac | `grade-run-item/route.ts:67,144` | Stated in W2 criteria as a known edge; worded refusal, not a crash |
| RES-LSF-6 | No Files-UI re-download of the original large file (source bytes dropped, temp object deleted after ingest) | owner (product) | the Files tab download path | A follow-up if re-download matters; otherwise accept |
| RES-LSF-7 | Owner-infra: Storage bucket limit must cover `SINGLE_FILE_MAX_BYTES` | owner | Supabase dashboard bucket limit | NONE if `SINGLE_FILE_MAX_BYTES = GRADING_ZIP_MAX_BYTES` and the zip raise already happened; else raise the limit (feature ships dark regardless) |

---

## 9. The owner fork, shaped to terminate

Build proceeds on the recommended reading (A + FORK-VISUALS (i), office/text
single files) regardless of the answer; this question only decides whether a
SECOND, larger change is also scoped. Every answer ends the activity:

> A 6 MiB `.docx` is graded on its EXTRACTED TEXT, with its embedded images not
> sent to the model (small files still get images today). Do you want:
> (a) ship text-only for large files, images as a later item if ever (my
> recommendation - smallest fix, grades the reported file, no change to the
> grade dispatch); or
> (b) also scope now the visuals-preserved path (ii), which moves office-image
> extraction to ingest-time with downscaling and is a materially larger change?

PDF and image large-single files (RES-LSF-3/4) are separate shapes and are NOT
folded into either answer; they are their own items.
