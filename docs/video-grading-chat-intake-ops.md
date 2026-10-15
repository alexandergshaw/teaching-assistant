# Security + reliability + ops design: video submissions in the grading chat view

Seat: security / reliability / operability pass (the scope's "W2"), HEAD 7a668112
(`git log --oneline -1`). Consumes `docs/video-grading-chat-intake-scope.md`
(check verdict SHIP-with-findings). READ-ONLY: no production code was written.
ASCII only (acceptance check, run on this file after writing:
`LC_ALL=C grep -nc '[^ -~\t]' docs/video-grading-chat-intake-ops.md` must print 0).

Vocabulary used below, to avoid colliding with the scope's numbering:
- "build wave 1..4" = the scope section 8 waves (recognition / caps+transport /
  model seam / UI+diagnostics). "This pass" = the scope's "W2" design pass.
- Fork legend: **A** = native Gemini video via the Files API (scope section 2
  reading A). **S** = the owner's "store" reading (scope reading C: store and
  link, grader reads nothing of the video). The scope's third reading
  (frames-loose) is not covered; where it would differ it needs no transport at
  all. Everything is SHARED between A and S unless a row says "A only" or
  "S only"; section 12 collects the differences in one table.

Files opened for this pass (all read in full unless a range is given):
`docs/DEV_LOOP.md`, `docs/loop/seats.md`, `docs/loop/traps-spec.md`,
`docs/loop/this-repo.md`, the scope, `src/lib/grade/grading-zip-transport.ts`,
`src/lib/zip-caps.ts`, `src/lib/grade/extraction.ts`,
`src/lib/grade/single-file-entry.ts`, `src/app/actions/grading-chat-intake.ts`,
`src/lib/llm.ts`, `src/lib/grade/constants.ts`, `src/lib/gemini.ts`,
`src/lib/upload-budget.ts`, `src/lib/llm-files.ts`,
`src/app/api/grade-submission-zip/route.ts`, `src/app/api/grade-run-item/route.ts`
(1-245), `src/lib/grade/ndjson-ingest-parser.ts`,
`src/app/components/grading/incrementalRunPlan.ts`,
`src/app/components/grading-chat/chatSubmissionIntake.ts`,
`src/app/components/grading-chat/chatSeamDiagnostic.ts`,
`src/app/components/grading/gradingDiagnosticLog.ts` (1-80),
`src/app/components/grading-chat/useContinuousGradingRun.ts` (145-170, 300-520),
`src/app/components/grading-chat/GradingChatPanel.tsx` (290-420),
`src/lib/syllabus-upload-source.ts`, `src/lib/orphan-upload-sweep.ts` (1-200),
`.github/workflows/sweep-orphan-uploads.yml` (1-40),
`supabase/migrations/20260806000000_course_files_size_limit.sql`,
`supabase/migrations/20260722000000_course_materials.sql` (policy lines),
`src/lib/supabase/storage.ts` (1-60), `src/lib/bounded-race.ts` (1-40),
`src/lib/grade/inline-visuals.ts` (1-80), `src/lib/grade/utils.ts` (495-540).

---

## 0. Headline findings (things the scope did not say, or said differently)

Each is a correction or an addition to the scope. Citations were opened.

**O-1. The entry cannot carry video bytes on ANY path. This reshapes the scope's
section 5 "in-zip video" design.** An entry is a plain JSON object that is
(a) streamed server -> browser as one NDJSON line per student
(`ndjson-ingest-parser.ts:40-68`, `route.ts:147-150`), (b) held in browser
memory for retry (`useContinuousGradingRun.ts:185,485` `retainedBodiesRef`),
and (c) POSTed browser -> server to `/api/grade-run-item` under a 3.5MiB wire
budget (`incrementalRunPlan.ts:43`, enforced `grade-run-item/route.ts:141`).
`rawBase64` is how images/PDFs ride that pipe. For a video it is fatal in a way
the existing estimate does NOT catch: `estimateNeededWireBytes`
(`incrementalRunPlan.ts:119-125`) charges `rawBase64` only for files the grader
"reads" (`fileNeedsRawBytes`, `:115`); a video MIME is in neither
`GEMINI_INLINE_MIME_TYPES` (`constants.ts:65-68`) nor the office set, so a
video's `rawBase64` would be charged ZERO bytes, pass `buildIngestLines`'
oversize partition, and be written whole into the NDJSON line sent to the
browser (the POST-time strip, `useContinuousGradingRun.ts:159`, happens too late
to help the ingest stream). A 40MiB video is a 53.3MiB line (`node` check in
section 13). Therefore: **a video-bearing `SubmittedFileInfo` carries a small
`videoRef` (a Storage path + size + container), never `rawBase64`, on every path
and under both forks.** This is enforced by construction (section 3.5) and by a
test (T14).

**O-2. The scope's section 5 sentence "each video's bytes (already in memory from
`ingestZipEntries`) are uploaded to the Files API there" is not safe as
written (A only).** It puts N Files API uploads + ACTIVE-polls inside the
ingest route's 35s soft budget (`grade-submission-zip/route.ts:31`) together
with download and extraction, leaves a provider-side file that must outlive the
ingest call until its student is graded (so no request ever owns its cleanup),
and hands the browser a provider URI (`fileUri`) it could forge. This pass
instead stages each extracted video to Storage at ingest time and defers the
Files API upload to GRADE time, inside that one student's
`/api/grade-run-item` request (section 7). Per-student blast radius, cleanup in
the same request as use, and the browser holds only a Storage path.

**O-3. The F1 hazard is wider than `resolveOnePart`: there are FIVE branch sites
of shape "single, else zip", across four files.** Command:
`grep -rn "classifyGradingUpload" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
returns call sites at `grading-chat-intake.ts:184`, `grading-chat-intake.ts:267`
(Google Drive link path), `grading-incremental.ts:122`, `grading.ts:835`,
`extraction.ts:704` (`resolveEntryLinksUnsafe`, Drive link). Their dispatches:
`grading-chat-intake.ts:195` (`if single ... else ingestZipEntries`, `:201-206`),
`grading-chat-intake.ts:272` (`if single ... else extractStudentEntries`,
`:276-280`), `grading-incremental.ts:123` (else `extractStudentEntries`),
`grading.ts:892` (`if single {...}`, everything else falls to the zip path),
`extraction.ts:709` (`if single ... else extractStudentEntries`, `:713`). A new
`"video"` kind returned by `classifyGradingUpload` falls into every one of the
five else-branches, where `JSZip.loadAsync` throws on mp4 bytes and the raw JSZip
message becomes the user-visible refusal. Section 10 gives the required
handling per site.

**O-4. `raceWithTimeout` does not cancel the loser** (`bounded-race.ts:30-34`
comment: "Losing the race does not cancel `work`"). Both routes wrap their work in
it (`grade-run-item/route.ts:221`, `grade-submission-zip/route.ts:121`). When the
soft budget fires and the response is returned, a `finally` that deletes a
Files API file or a staged Storage object may never run (the serverless
instance can be frozen). So **"delete in finally" is a best effort, not the
guarantee.** The guarantees are the provider's 48h file TTL (A) and the orphan
sweep (Storage). Section 7.4 designs the cancellation signal, a prefix-tagged
`displayName`, and an optional Files API sweep.

**O-5. The orphan sweep's 10 minute threshold is shorter than a plausible video
queue wait.** `ORPHAN_SWEEP_THRESHOLD_MS = 10 * 60 * 1000`
(`orphan-upload-sweep.ts:34`), cron `9,24,39,54 * * * *`
(`sweep-orphan-uploads.yml`). The chat driver grades 3 at a time
(`INCREMENTAL_CONCURRENCY = 3`, `incrementalRunPlan.ts:32`; session ceiling 40,
`useContinuousGradingRun.ts:73`), each item up to 50s
(`grade-run-item/route.ts:52`). The LAST of k staged videos finishes after at most
`ceil(k/3)*50` seconds (section 13: k=6 -> 100s, k=36 -> 600s, k=40 -> 700s). A staged object older than 10 minutes is reaped before its
student is graded. Design: a pending-staged-video cap (section 5.3) so the wait
stays far under the threshold, and a typed "upload failed (expired)" outcome if
it happens anyway.

**O-6. The bucket cap and the project cap are different numbers.** The
`course-files` bucket's own per-file limit is 200MiB
(`20260806000000_course_files_size_limit.sql:4`, `209715200`), but that
migration's own comment (lines 1-3) says "the project-wide upload limit (Storage
settings) still applies and must be raised in the dashboard to exceed 50 MB".
Nothing in this checkout can tell us what the dashboard says. The scope's
proposed 200MB `VIDEO_MAX_BYTES` is therefore only reachable if the owner has
raised the dashboard limit. Recommendation in section 5.1: 40MiB, which is under
50MiB with no dashboard action. Owner-only fact (D8).

**O-7. The diagnostics module is browser-only and the existing text classifier
mis-buckets size refusals.** `gradingDiagnosticLog.ts:7-9` bans any
`src/app/api`, `src/app/actions` or `"use server"` import. So the in-zip,
route-side and grade-side video outcomes must reach the browser as typed data
and be recorded there. And `classifyChatSeamFailure`
(`chatSeamDiagnostic.ts:31-40`) tests `/limit|too many|between \d+ and \d+/`
(`:35`) BEFORE `/too large|exceed|oversize|budget/` (`:36`), so a video refusal worded "over the
40.0MB limit" is recorded as "cap exceeded", not "too large". Section 9 avoids
text-parsing entirely.

**O-8. A frozen oracle already encodes the "skip" behaviour.**
`src/lib/grade/extraction.zip-caps.oracle.test.ts:111` puts
`HW1/hal_1008_2008_clip.mp4` (3000 bytes of seeded noise, NOT a valid mp4) in the
owner-shape zip, and `:268` freezes `attemptedSupportedFiles: 22` with the mp4
excluded because the classifier returns `"skip"` (`extraction.ts:106`). Making
mp4 a leaf changes this snapshot. That is correct, but it is a deliberate
RE-FREEZE of a frozen oracle (the only permitted diff is hal's mp4 row), not
collateral. It is in the build-wave-1 owns list below.

**O-9. The image leaf branch has a latent whole-archive-failure shape that the
video branch must NOT copy.** `extraction.ts:117-131` calls `readMemberBounded`
with no `try/catch`; any read failure rejects out of `runBounded`
(`zip-caps.ts:555-586`, fail-fast) and fails the whole archive, unlike the
generic branch (`:133-146`) which catches everything but `ZipCapError`. The video
branch needs the generic branch's catch shape so one bad video is one failed
file (requirement 3 "per-video error partition").

**O-10. Cross-route object confusion.** `/api/grade-submission-zip` binds only
`storagePath.split("/")[1] === "grading-uploads"` (`route.ts:109`), and deletes
the object on every path (`route.ts:21-23`). A video object's path posted to the
ZIP route would be downloaded, fail `JSZip` parsing, and be DELETED while its
video submission is still pending. Owner-self-inflicted only (the route is
`requireAppOwner`-gated) but cheap to close: bind the extension in both routes.

---

## 1. Decisions the owner must make (recommended default for each)

None of these blocks the build waves that do not depend on them. Each names
which wave first needs it.

| ID | Decision | Recommended default | Cost of being wrong | First needed |
|---|---|---|---|---|
| D1 | The fork: A (native Gemini video) vs S (store only) vs frames-loose | A (scope recommendation, unchanged; this pass finds it viable only with the grade-time upload of O-2) | A over-builds an owner-walk-only model seam if S was wanted; section 12 lists the waves dropped under S | build wave 3 |
| D2 | `VIDEO_MAX_BYTES` and the 40 vs 200 asymmetry | ONE number: `VIDEO_MAX_BYTES = ZIP_MAX_MEMBER_DECLARED_BYTES` = 40MiB, defined by import so it cannot drift (section 5.1) | A Loom over 40MiB (about 6-10 minutes at typical screen-recording bitrates, unmeasured) is refused with a worded reason; raising it later is a one-constant change that ALSO raises the cap for every other zip member (coupling, section 5.1) | build wave 2 |
| D3 | New `GRADING_ZIP_MAX_BYTES` | 105MiB = `ZIP_MAX_CUMULATIVE_DECLARED_BYTES` (100MiB) + 5MiB headroom, derived by import | Needs the Storage dashboard limit >= 105MiB (D8); if the limit stays at 50MiB the effective ceiling is 50MiB and a bigger zip fails at upload as "upload failed" | build wave 2 |
| D4 | Retention of stored student videos | EPHEMERAL: deleted at the end of the grading request that consumes them, reaped by the orphan sweep within roughly 10-25 minutes otherwise; never persisted past the session (section 8) | If the owner wanted durable storage ("link" under S) that is a separate, undesigned data pass (residual R-9) | build wave 2 |
| D5 | Count caps | `VIDEO_MAX_PENDING_STAGED = 6` (loose, session-level), `ZIP_MAX_VIDEO_MEMBERS = 4` (per zip, all nesting levels) | Too low refuses legitimate batches with a worded "too many videos"; too high lets queue age approach the sweep threshold (arithmetic in section 13) | build wave 2 |
| D6 | Files API cleanup guarantee (A only) | Explicit delete in `finally` + 48h provider TTL as the stated backstop + prefix-tagged `displayName` (build wave 3). Prefix-scoped Files API sweep is OPTIONAL, recommended if D7 answers "paid tier is not assured" | Without the sweep, a timed-out grade can leave a student's video at the provider for up to 48h | build wave 3 |
| D7 | Provider data-use terms for `GEMINI_API_KEY` (A only) | Owner confirms the key's project is on terms that do not train on submitted content. Unverifiable here; the same exposure already exists for student text/images/PDF, but video adds face/voice and adds provider-side file retention (section 7.5) | A free-tier key may let the provider use student video; unknowable from the checkout | before build wave 3 ships dark -> on |
| D8 | Supabase project-wide Storage upload limit | Owner reads the dashboard value; if < 105MiB, either raise it or lower D3 | Uploads above the real limit fail with a generic Storage error | build wave 2 |

---

## 2. Threat model for the large-upload path

Assets: (1) student video content (PII: face, voice, possibly names on screen;
FERPA-class education record), (2) the owner's `GEMINI_API_KEY` and quota,
(3) the shared `course-files` bucket (which also holds course materials), (4)
function time and memory.

Actors: the owner (trusted, but their browser holds untrusted student files); a
non-owner approved account (can write to its OWN Storage prefix through RLS,
`20260722000000_course_materials.sql:17-33`, but cannot pass `requireAppOwner`);
an unauthenticated caller; a hostile student file; a hostile zip.

| Attack | Where it would land | Design response | Test |
|---|---|---|---|
| Unauthenticated upload | Storage | Bucket is private (`public=false`, migration line 11) and every policy is `(storage.foldername(name))[1] = auth.uid()::text`. No new bucket, no public path. Unchanged by this feature. | none new (RLS is not testable here; residual R-2) |
| Non-owner authenticated account fills own prefix with 200MiB junk | Storage cost | Pre-existing and NOT widened: the bucket cap (200MiB) is unchanged. The orphan sweep reaps any user's `grading-uploads` objects (`orphan-upload-sweep.ts` per-user-prefix loop). Both new routes are `requireAppOwner`-first, so a non-owner cannot trigger the egress. | route auth-order test (T10) |
| Client-supplied URL -> SSRF / arbitrary fetch | server | **There is no client-supplied URL anywhere in this design.** The client sends only a Storage path (bound, below). The server mints any signed URL itself from the validated path. The Files API `fileUri` is obtained server-side at grade time and never sent to or accepted from the browser (O-2). | T11: `grade-run-item` rejects an entry carrying any `fileUri`/`url` key on a `videoRef` |
| Storage-key injection / traversal / wrong-object | Storage read+delete | `isVideoUploadPath(userId, path)`: layer on `isKnownUploadPath` (`syllabus-upload-source.ts:149-156`, which already rejects `.`/`..`/encoded separators) and require EXACTLY 3 segments, `[0] === userId`, `[1] === "grading-uploads"`, `[2]` matches `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp4\|webm\|mov\|m4v)$` (lowercase only; `crypto.randomUUID()` is v4). Server never builds a path from a client filename; the extension comes from a closed map keyed by the validated container. | T2 hostile-path table |
| Cross-route confusion (O-10) | zip route deletes a video object | Zip route additionally requires `storagePath` to end `.zip` and to match the same 3-segment shape with a `.zip` extension; video route requires a video extension. | T12 |
| Content-type spoofing (`.mp4` that is a zip, html, or image; wrong `File.type`) | Gemini egress, JSZip | Container is decided from BYTES ONLY (section 4). `File.type`, the filename extension and the Storage `contentType` are never used to pick the MIME that goes to the provider; the MIME is derived from the sniff. Extension is only the fast first gate. A mismatch between extension and sniffed container is not an error (a `.mp4` that is really QuickTime is fine); a sniff failure is "unsupported format". | T1 |
| Polyglot (valid `ftyp` head + junk tail) | Gemini | Passes the sniff by design; the only consumer is Gemini, which rejects it ("model rejected"). The app NEVER serves stored video bytes back to a browser (no preview, no Files-UI download), so there is no content-sniffing XSS surface. Stated as a design constraint. | source-text pin: no `createSignedUrl` for a video path reaches a client response (T13) |
| Zip bomb with a video member | extraction | Video becomes a `"leaf"`, so the declared-size plan pass (`zip-caps.ts:262-322`) applies BEFORE any decompression: member cap, cumulative cap, member and archive ratio. A 40MiB member of zeros has ratio far over 100 (`ZIP_MAX_MEMBER_RATIO`, `:41`) and is refused. Real video is incompressible (ratio about 1), so ratio checks do not false-positive. | existing `extraction.zip-caps*.test.ts` plus T4 |
| Many small videos exhaust one 60s tick | zip route | `ZIP_MAX_VIDEO_MEMBERS` checked in the plan pass (section 5.2), before any member is read. | T4 |
| Prompt-injection through video content (a student narrates "ignore the rubric") | model | Pre-existing class for all student content: the engine frames submissions with `SUBMISSION_FRAMING_HEADER` (`engine.ts:96-101` region). A video enters as a separate `fileData` part after that framed text, the same position inline images occupy. Not made worse; NOT solved. Noted for the security checker: no mitigation is claimed for audio/visual injection. | none (residual R-7, owner-walk) |
| Key leakage through Files API errors | logs, UI | The Files client authenticates with the `x-goog-api-key` HEADER (the pattern at `llm.ts:636-641`), never `?key=` (`llm.ts:459` shows the leak: `describeLlmFailure`, `:257-264`, redacts because upstream bodies can echo the request URL). Every error string from the Files client goes through `redactSensitiveText` (`generation-diag.ts:73`) before it leaves the module. | T9 (fake client returns a body containing a key and a URL; assert the thrown message contains neither) |
| Malicious `X-Goog-Upload-URL` in a Files API response | server | The Files client refuses to send bytes or the key to any upload URL whose origin is not `https://generativelanguage.googleapis.com`. | T9 |

---

## 3. Transport, per path (SHARED between A and S)

Hard facts: Vercel body cap about 4.5MiB, app budget 3.5MiB wire
(`upload-budget.ts:38,41`); a 32MiB video is 42.67MiB on the wire, 12.19x the
budget (section 13); `maxDuration = 60` on both routes
(`grade-submission-zip/route.ts:25`, `grade-run-item/route.ts:40`);
`next.config.ts:13-14` sets `serverActions.bodySizeLimit: "10mb"`, which
`upload-budget.ts:5-9` says cannot raise the platform cap.

### 3.1 Loose single and loose multi (one path, iterated)

Multi-file is the same sink iterated one file at a time
(`submitFilesSequentially`, `chatFileBatch.ts`), so there is one design.

1. **Client pre-flight, BEFORE `preflightUploadFile`.** In
   `GradingChatPanel.tsx` `handleSubmitFiles` (`:339` region) the transport
   decision today is `chooseZipTransport(file)` then `preflightUploadFile`. A
   video must be decided by a new pure leaf `decideVideoTransport(file,
   pendingStaged, enabled)` consulted FIRST, because `preflightUploadFile`'s
   refusal text says "Split the archive into parts" (`zip-upload-preflight.ts`
   message) which is wrong for a video. Outcomes:
   `{kind:"storage"}` | `{kind:"refused", failure, message}`. Refusals, in order:
   not a video extension -> `{kind:"not-video"}` (caller proceeds as today);
   `enabled === false` -> refused, class `not supported here`, the worded W1
   placeholder text (section 10); `size === 0` -> `unsupported format`;
   `size > VIDEO_MAX_BYTES` -> `too large`; `pendingStaged >= VIDEO_MAX_PENDING_STAGED`
   -> `too many videos`. NO upload happens on a refusal.
2. **Direct-to-Storage upload.** New `uploadGradingVideo(storage, userId, file,
   uploadId = crypto.randomUUID())`, a sibling of `uploadGradingZip`
   (`grading-zip-transport.ts:85-101`): path from
   `syllabusUploadStoragePath(userId, uploadId, ext, "grading-uploads")` where
   `ext` is looked up in a closed map from the lowercased filename extension
   (`mp4|webm|mov|m4v`), `contentType` from the same map (NOT `file.type`),
   `upsert: false`. Failure -> `upload failed` with the existing worded shape
   ("Could not upload \"<name>\" - try again."). Uses the bucket's RLS exactly as
   the zip does.
3. **Reference, not bytes.** The driver gains `ChatSubmissionInput` member
   `{kind:"storaged-video"; storagePath; name}` (mirrors `storaged-zip`,
   `chatSubmissionIntake.ts:35`) and an injected `prepareVideo` that POSTs
   `{storagePath, label?}` to the new `POST /api/grade-submission-video`.
4. **Server prepare** (`grade-submission-video/route.ts`, modelled on
   `grade-submission-zip/route.ts`): order is FIXED and pinned by a test:
   `requireAppOwner()` first (before the body is read, `route.ts:80-87` shape);
   `content-type` JSON CSRF floor (`:89-93` shape); parse; `isVideoUploadPath`
   (400, no Storage call on failure); `statObjectSize` (`:47-61`) and refuse
   `> VIDEO_MAX_BYTES` with 413 AND delete the object; read the first
   `VIDEO_HEAD_BYTES = 64` bytes only (see 3.3) and run the sniff; on sniff
   failure delete the object and return `unsupported format`; on success return
   `{entry}` where `entry.submittedFiles[0] = {name, extension, previewContent:
   "[Video file: <name>, <size>MiB, <container>]", previewTruncated:false,
   mimeType: <sniffed>, videoRef:{storagePath, sizeBytes}}` and `rawBase64`
   absent. The object is NOT deleted on success: grade time owns it (A). Under S
   see section 12.
5. **Grade.** `/api/grade-run-item` (section 7) reads `videoRef`, never bytes.

### 3.2 In-zip

The zip is the single upload, exactly as today; only two things change:

- `GRADING_ZIP_MAX_BYTES` rises (D3, section 5.4).
- `ingestZipEntries` gains an injected `stageVideo?: (bytes: Buffer, container)
  => Promise<{storagePath:string} | {failure: VideoFailureClass}>` option. The
  route builds it closed over `userId` (it already has `userId`, `route.ts:81-86`)
  and over an `abandoned` flag (3.4). Extraction itself stays free of Storage
  imports and network, so `extraction*.test.ts` keep running with plain fakes.
  When `stageVideo` is ABSENT (build wave 1, flag off, batch/embedded callers of
  `extractStudentEntries`), the video leaf records the W1 placeholder and reads
  no bytes (section 10).

Per video member, inside the existing leaf pool (`extraction.ts:113`, concurrency
4): `readMemberBounded` -> `sniffVideoContainer(head of the bytes)` -> if invalid
record failure `unsupported format` -> else `stageVideo(bytes, container)` ->
record `videoRef`. The bytes are NEVER base64'd and never stored on the outcome
(O-1); the Buffer is eligible for GC as soon as `stageVideo` returns. The
per-member `try/catch` is the generic branch's shape (`extraction.ts:133-146`):
rethrow `ZipCapError` only; everything else becomes that one member's failure.

### 3.3 Reading the head of a stored object without downloading it all

`supabase.storage.from(b).download()` (what `downloadFile`, `storage.ts:22-25`,
wraps) returns the whole object as a `Blob`. For the loose prepare step the
route needs only 64 bytes. Design: the route mints a short-lived signed URL
itself (`createSignedUrl`, `storage.ts:32-39`, 60s) from the VALIDATED path,
`fetch`es it, reads chunks from `response.body` until at least 64 bytes are in
hand, then `cancel()`s the body. It does not rely on Range support (unverified
here). The fetch is injected so vitest never dials out (`vitest.setup.ts` throws
on real fetch; this-repo.md section 2). Fallback if signed-URL streaming is
unavailable in the deployed SDK: sniff at GRADE time on the full bytes (which
the grade route downloads anyway) and let a bad file become that row's
`unsupported format`. Either way the sniff at grade time (7.2) is the one that
protects the provider egress; the prepare-time sniff is an early, cheap
refusal.

### 3.4 Staging cleanup when an ingest fails part-way (in-zip)

The route keeps `staged: string[]` (paths returned by `stageVideo`). On every
non-success outcome (`timedout`, `failed`, `!value.ok`, a thrown `ZipCapError`)
it `removeFiles`-es them best-effort. Because the timeout loser keeps running
(O-4), the route sets `abandoned = true` at timeout and `stageVideo` returns
`{failure:"timed out"}` instead of uploading once `abandoned` is true. Anything
staged in the race window is covered by the sweep (section 8). A test with
fakes: stage 2 of 4, then force the race to time out, assert (a) the 2 staged
paths are removed and (b) the 3rd and 4th `stageVideo` calls upload nothing.

### 3.5 What is a "video-bearing file" (the O-1 construction)

`SubmittedFileInfo` (`types.ts:145-152`) gains `videoRef?: { storagePath:
string; sizeBytes: number }`. Invariant, enforced by the three builders (loose
prepare route, in-zip leaf, placeholder builder) and by test T14: **a file with
a `videoRef` or a video MIME has `rawBase64 === undefined`.** `getMimeType` gains
video entries in `MIME_TYPES` (`constants.ts:1-36`) and a test pins
`graderNeedsFileBytes(m) === false` and `graderReadsFileBytes(m) === false` for
every video MIME (so the existing estimate/strip predicates correctly treat a
video as "no bytes needed").

---

## 4. Magic-byte validation, precisely (SHARED)

New pure leaf `src/lib/grade/video-magic.ts` (no imports; client-safe):

```
type VideoContainer = "mp4" | "quicktime" | "webm";
sniffVideoContainer(head: Uint8Array):
  | { ok: true; container: VideoContainer; mimeType: "video/mp4"|"video/quicktime"|"video/webm" }
  | { ok: false }
```

Input: the first `VIDEO_HEAD_BYTES = 64` bytes (or fewer if the object is
shorter; fewer than 12 bytes -> `{ok:false}`).

**ISO Base Media (mp4, m4v, mov).**
- Read the big-endian uint32 box size at bytes 0-3. Valid iff the size is `1`
  (a 64-bit largesize follows) OR `16 <= size <= 4096`. A real `ftyp` box is
  8 header bytes + 4 brand + 4 minor version + compatible brands (tens of bytes),
  so under 16 cannot be a real box and over 4096 is a crafted one. A size larger
  than the 64 bytes we hold is fine (we only have the head).
- Bytes 4-7 must equal ASCII `ftyp` (`66 74 79 70`). **Offset 4, not 0.**
- Major brand = bytes 8-11 (ASCII). Accept this allowlist:
  `isom iso2 iso3 iso4 iso5 iso6 mp41 mp42 mp71 avc1 dash msdn "M4V " M4VH M4VP`
  -> `container "mp4"`, mime `video/mp4`; and `"qt  "` (`71 74 20 20`) ->
  `container "quicktime"`, mime `video/quicktime`. Anything else (including
  `heic heix mif1 msf1 avif avis "M4A " "M4B "`, which are image/audio ISO BMFF)
  -> `{ok:false}`. The scope's example file (`file(1)` reports "ISO Media, MP4
  Base Media v1") corresponds, as recalled and UNVERIFIED here, to brand `isom`;
  the owner-walk (R-1) must open a real Loom file and confirm its brand is on
  this list. The list lives in one array so adding a brand is one line.
- QuickTime without `ftyp`: only when the extension is `.mov`, additionally
  accept bytes 4-7 in `{moov, mdat, wide, free, skip}` -> `quicktime`. (This
  needs the extension passed in: signature is `sniffVideoContainer(head,
  extension)`; the extension can only WIDEN acceptance for `.mov`, never decide
  the container for any other case.)

**WebM (Matroska/EBML).**
- Bytes 0-3 must equal `1A 45 DF A3`.
- The EBML DocType must be `webm`: the ASCII bytes `77 65 62 6D` must appear
  within the first 64 bytes. (`matroska` DocType = an `.mkv`, not in the accepted
  set -> `{ok:false}`.) Container `webm`, mime `video/webm`.

Everything else, including the 4 bytes `PK\x03\x04` (a zip renamed `.mp4`), PNG
(`89 50 4E 47`), JPEG (`FF D8 FF`), `<!DOC`/`<htm`, empty input, and `ftyp` at
offset 0 instead of 4, is `{ok:false}`.

Consequences: the MIME sent to the provider and recorded on the file is ALWAYS
the sniffed one. `.m4v`/`.mp4` bytes that are really QuickTime go as
`video/quicktime`. Where the sniff runs: (a) the loose prepare route (head only,
3.3), (b) the in-zip leaf on the member's bytes, (c) grade time on the downloaded
bytes immediately before the provider upload (7.2). (c) is the trust boundary.

T1 (section 11) is a table-driven test over a fixture list (one row per accepted
brand, one per hostile class above) asserting BOTH false-accept and false-reject.

---

## 5. Caps (SHARED), one number per quantity

### 5.1 `VIDEO_MAX_BYTES` and the 40/200 asymmetry (scope F3)

Re-measured: `grep -n "ZIP_MAX_MEMBER_DECLARED_BYTES =" src/lib/zip-caps.ts` ->
`:38` = `40 * 1024 * 1024`; `VIDEO_MAX_BYTES` does not exist
(`grep -rn VIDEO_MAX_BYTES src` -> nothing).

Resolution (D2): ONE quantity ("largest accepted single video"), ONE number, on
all three paths: new leaf `src/lib/grade/video-limits.ts` exports
`VIDEO_MAX_BYTES = ZIP_MAX_MEMBER_DECLARED_BYTES` (imported from
`../zip-caps`, so the two cannot disagree by construction). 40MiB clears the
owner's ~32MB example and sits under the 50MiB dashboard default (O-6).

What stays different, honestly: the BLAST RADIUS of exceeding it. An oversize
loose video refuses only that video; an oversize in-zip video refuses the WHOLE
archive (`ZipCapError`, `zip-caps.ts:268-278`, "Refused: " prefix). That is the
existing zip-bomb posture and this design does not weaken it to per-member
skipping. The refusal text already names the entry and the limit
(`zip-caps.ts:153-155`).

Coupling to state, not hide: because `VIDEO_MAX_BYTES` is the member cap, an owner
who later wants 100MiB videos must change `ZIP_MAX_MEMBER_DECLARED_BYTES`, which
also raises the per-member exposure for text/doc/image zip members and for
`assertBytesWithinMemberCap` (`zip-caps.ts:531-547`). If the owner wants that,
the follow-up is a per-kind member cap in `chargeArchiveLevel` (its `classify`
callback returns only `"nested"|"leaf"|"skip"`, `zip-caps.ts:217,240`); it is
deliberately NOT built now. Residual R-4.

Boundary rule, one inclusive convention everywhere: a size is REFUSED iff
`size > VIDEO_MAX_BYTES` (matches `declared > limits.maxMemberDeclaredBytes`,
`zip-caps.ts:268`). T3 pins `MAX-1`, `MAX`, `MAX+1` on all three paths.

### 5.2 Per-zip video count (the real 60s / memory bomb)

`ZIP_MAX_VIDEO_MEMBERS = 4` in `zip-caps.ts`, next to the other zip constants.
Why 4: it equals `ZIP_EXTRACTION_CONCURRENCY` (`zip-caps.ts:44`), so all video
members stage in ONE pool round and the added latency is the slowest single
stage, not the sum; and `100MiB` cumulative at up to 40MiB/member already means
at most 2 maximum-size videos (100/40 = 2.5) or about 3 of the ~32MB example. It is an unmeasured starting value (like the
file's own header says of the others, `zip-caps.ts:31-32`); R-3 measures it.

Enforcement: a new `ZipCapCode` `"video-count"` (`zip-caps.ts:85-92`) and
`reasonClause` branch (`:122-140`; the switch has no default, so `tsc` flags a
missing case). Counted in `extractSubmissions`' closure across ALL nesting levels,
checked immediately after each `chargeArchiveLevel` returns (`extraction.ts:97`)
and BEFORE `runBounded` reads any member: count the planned leaves whose
extension is in `VIDEO_EXTENSIONS`, add to a running total, throw
`ZipCapError({code:"video-count", limitName:"ZIP_MAX_VIDEO_MEMBERS", ...})` when
the total exceeds the limit. A refusal is whole-archive like the others. Scope:
ZIP path only; the loose-multi path has no per-run cap here because each loose
video is its own incremental request (it has the pending cap, 5.3).

### 5.3 Loose pending-staged cap

`VIDEO_MAX_PENDING_STAGED = 6`: the number of loose videos uploaded/staged and
not yet graded or failed in this session. Enforced in the driver (`pendingRef`
already tracks in-flight, `useContinuousGradingRun.ts:179-196`) via
`decideVideoTransport`. Derivation: worst-case wait for the last of 6 is
`ceil(6/3) * 50s = 100s` against a 600s sweep threshold (section 13), a 6x
margin; 36 would be the break-even (600s) which is why the cap is far below it.
Sequential drops can still stack; the typed `upload failed` (expired) outcome
covers the residual.

### 5.4 `GRADING_ZIP_MAX_BYTES` (D3) and what raising it also relaxes

Today 25MiB (`grading-zip-transport.ts:26`), under one 32MiB video, so a zip with
one video is refused by `chooseZipTransport` (`:51-58`) before ingest runs. New
value: `ZIP_MAX_CUMULATIVE_DECLARED_BYTES + 5MiB` = 105MiB, defined by import from
`../zip-caps` (a client-safe leaf: its header, `zip-caps.ts:24-26`, says it
imports only a jszip TYPE and `formatMB`). Rationale: video does not compress, so
a zip's stored size is about its declared size, and anything over 100MiB of
charged members is refused by the cumulative cap anyway; 5MiB covers central
directory and uncharged members.

It is ONE constant used in THREE places: the client transport
(`grading-zip-transport.ts:51`), the route's stat gate (`route.ts:115-118`) and
the route's post-download re-check (`route.ts:130`). So raising it also relaxes
the SERVER re-check, for every zip, video or not: the route will now download
and `arrayBuffer()` up to 105MiB (`route.ts:131`). Memory consequences in 6.2.
`grading-zip-transport.test.ts:65` pins `GRADING_ZIP_MAX_BYTES + 1` relatively,
so it survives; a NEW relation test asserts `GRADING_ZIP_MAX_BYTES >=
ZIP_MAX_CUMULATIVE_DECLARED_BYTES` (failure direction: ceiling below the
cumulative cap makes the cap unreachable and silently re-imposes the old
limit).

---

## 6. Reliability (SHARED)

### 6.1 The zip tick: time

The ingest route has a 35s soft budget for download + extraction + staging
(`route.ts:31`, applied by `raceWithTimeout` at `:121-135`), leaving the rest of
the 60s for writing the NDJSON stream. Staged-video work adds to that budget; it
does not get its own. On expiry the route already returns a worded
`TIMED_OUT_MESSAGE` `done` line (`:137-139`) - that IS the typed too-large
failure mode, and nothing in this design changes it. What this design adds is
that it fires for the right reason and cleans up (3.4).

Bound (arithmetic, not measurement): worst legal input is `Z = 105MiB` zip with
`V <= 100MiB` of video in at most 4 members of at most 40MiB. Required
sustained throughput to finish in 35s with the download alone is
`105/35 = 3.0MiB/s`; staging 100MiB back to Storage adds `100/35 = 2.9MiB/s`
if serialised, which is why staging runs inside the 4-wide pool. Neither number
is measurable here (no deploy, no Storage). R-3 owns measuring them: the first
real 90-100MiB owner-walk records `prepare_video` `durationMs`
(section 9) and the owner compares it to 35,000.

### 6.2 The zip tick: memory

Peak model (labelled MODEL, not measurement): the route holds the `Blob` (Z),
`blob.arrayBuffer()` is a second copy (Z; `route.ts:131`), `JSZip.loadAsync`
wraps it, and up to 4 members are materialised at once by `readMemberBounded`
(`zip-caps.ts:353-401`, `Buffer.allocUnsafeSlow(declared)`), bounded by the
100MiB cumulative cap. `node` arithmetic (13): 105 + 105 + 100 = 310MiB.
Retaining base64 would add 133MiB for the strings plus about 267MiB for
`JSON.stringify` + `TextEncoder` of the NDJSON line - the O-1 reason bytes never
stay on the entry. The platform memory limit for this deployment is NOT readable
from the checkout (no `vercel.json` function config: `vercel.json` has only the
cron); Vercel Hobby's default is recalled as about 1GiB and is UNVERIFIED
(R-3). 310MiB under an assumed 1GiB is a comfortable model but not a proof.

Streaming vs buffering decision: BUFFER, bounded. The download side cannot
stream into JSZip (random access to the central directory is required). The
member side could stream `internalStream` chunks to Storage, but that bypasses
the tested fail-closed bounded reader, defers the sniff, and relies on a
`supabase-js` stream-body contract that cannot be exercised here. Trigger for
revisiting: a measured prod peak above about 600MiB or a staged-video timeout
in R-3.

Failure mode when too large: never OOM by design - every size is checked from
declared sizes before any byte is read (`chargeArchiveLevel`), the count before
any member is read (5.2), the ceiling before download (`route.ts:115-118`) and
after (`:130`), and the budget race around the lot. The typed outcomes are:
`ZipCapError` "Refused: ..." (cap breach, whole archive), `OVER_CEILING_MESSAGE`
413, `TIMED_OUT_MESSAGE` (budget). An actual OOM kill would produce no response;
that is the one failure this design cannot convert to a typed error, and it is
why R-3 exists.

### 6.3 Per-video error partition

- Loose: each video is its own `storaged-video` submit and its own row; a bad one
  is a refused outcome for that file only (`submitFilesSequentially` never
  short-circuits, `chatFileBatch.ts` header).
- In-zip: each member independent (3.2). A member failure -> that member's name
  in `failedSupportedFiles` (the existing channel, `extraction.ts:153-156`) +
  a class count in the ledger (section 9). A student whose ONLY content was
  failed videos has no entry and is therefore absent from `entries`; they are
  surfaced in `failedSupportedFiles` plus the class counts, never silently.
- Grade: each student is its own `/api/grade-run-item` request, so a model
  rejection or timeout is one row (`classifyItemFailure`,
  `incrementalRunPlan.ts:251-267`), never the batch.

### 6.4 Failure-mode inventory

| # | Failure | Detection | Behaviour | Cleanup | Class |
|---|---|---|---|---|---|
| F1 | Video over `VIDEO_MAX_BYTES` (loose) | client `decideVideoTransport`; server `statObjectSize` | refuse before upload / 413 | delete staged object (server case) | too large |
| F2 | Over cap in zip | plan pass | whole archive "Refused:" | none staged yet | too large |
| F3 | > `ZIP_MAX_VIDEO_MEMBERS` | plan pass | whole archive "Refused:" | none staged yet | too many videos |
| F4 | > `VIDEO_MAX_PENDING_STAGED` | driver | refuse that submit | none | too many videos |
| F5 | Bytes not a video | sniff | refuse / member failed | delete object (loose) | unsupported format |
| F6 | Storage upload fails (client) | `uploadGradingVideo` result | refuse | none | upload failed |
| F7 | Stage fails (in-zip) | `stageVideo` result | member failed, others continue | none | upload failed |
| F8 | Staged object swept before grading | grade-time download miss | row `grading-failed` | none | upload failed |
| F9 | Ingest budget expires | `raceWithTimeout` | `TIMED_OUT_MESSAGE` | route removes `staged[]`; `abandoned` flag; sweep | timed out |
| F10 | Member read/corrupt | `readMemberBounded` rejects (non-cap) | member failed | none | extraction failed |
| F11 | Files API upload fails / cannot reach ACTIVE (A) | Files client | row failed | delete file if created | upload failed / timed out |
| F12 | Model rejects the video (A) | `callLlm` `!ok` or non-STOP finish | row failed, existing `engine.ts:114` + `:122-129` path | delete file | model rejected |
| F13 | Grade budget expires (A) | `grade-run-item` race | 504 row | best-effort; Files TTL 48h; Storage sweep | timed out |
| F14 | Composite / Drive link / batch surface receives video | dispatch | worded refusal (section 10) | none | not supported here |

---

## 7. Grading egress (A only)

### 7.1 Acceptability under the in-house-AI rule

The rule (memory `in-house-ai-only`): generation stays inside the app via
provider APIs; never send the user to an external tool's UI. The Files API is a
server-to-provider API call made with the existing `GEMINI_API_KEY`
(`gemini.ts:88-96`) against the existing host
(`generativelanguage.googleapis.com`, `llm.ts:459`). The owner never leaves the
app. **Compliant.**

### 7.2 Lifecycle (one student, one `/api/grade-run-item` request)

New leaf `src/lib/gemini-files.ts`, client injected (the
`withUploadedSyllabusFile` shape, `syllabus-upload-source.ts:174-245`, so the
lifecycle is provable with fakes):

```
withUploadedGeminiVideo(client, {bytes, mimeType, displayName, signal}, consume)
  1. client.upload(...)            -> { name: "files/<id>", uri }   (resumable)
  2. client.waitActive(name, deadline, signal)   // poll state PROCESSING -> ACTIVE
  3. consume({ fileUri: uri, mimeType })         // builds the LlmPart, runs grade
  4. finally: client.delete(name) if step 1 returned a name   // best effort
```

Order inside the route, for an entry whose file has `videoRef`:
1. validate `videoRef.storagePath` with `isVideoUploadPath(userId, ...)` (userId
   from `requireAppOwner()`); reject the whole item 400 otherwise;
2. download the object (`downloadFile`), enforce `blob.size <= VIDEO_MAX_BYTES`
   AGAIN (the client entry is untrusted; the object may have been replaced);
3. sniff the downloaded head (this is the trust boundary, section 4); on failure
   -> `unsupported format`, delete the Storage object (terminal);
4. `withUploadedGeminiVideo`; MIME is the sniffed one;
5. `gradeEntries` with the `fileData` part;
6. Storage object: delete on success and on TERMINAL failures (`unsupported
   format`, `too large`); KEEP on transient failures (`timed out`, `upload
   failed`, `model rejected`) so the existing row retry
   (`useContinuousGradingRun.ts:244` reads the retained body; `retry` is `:515`) can succeed; the sweep
   reaps it within roughly 10-25 minutes if nobody retries.

Time budget (defaults, unmeasured; R-1): the route total is 50s
(`route.ts:52`) minus the 2s reserve (`:53`) = 48s. Reserve at least 20s for
`generateContent` (video token cost is proportional to duration, so this is the
largest unknown); give download + sniff + upload + ACTIVE-poll at most 25s,
checked against a deadline passed to the Files client. If ACTIVE is not reached
by the deadline: abort (signal), delete the file, row fails with `timed out`.
Poll interval 1s. At 40MiB the required throughput for download + upload in 25s is
`2 * 40 / 25 = 3.2MiB/s` sustained, before processing time.

### 7.3 Files API client contract (UNVERIFIED RECALL - owner-walk R-1)

No key, no network here (this-repo.md section 6); nothing below was observed. It
is what the Files API is recalled to do, and `gemini-files.ts` must be written
against the current Google documentation by the implementer, with the owner-walk
confirming:
- Resumable upload: `POST https://generativelanguage.googleapis.com/upload/v1beta/files`
  with `X-Goog-Upload-Protocol: resumable`, `X-Goog-Upload-Command: start`, the
  byte length and MIME as headers, `{"file":{"display_name": ...}}` body; the
  response header `X-Goog-Upload-URL` is the upload target; the byte POST uses
  `X-Goog-Upload-Command: upload, finalize` and `X-Goog-Upload-Offset: 0`.
- State machine: `PROCESSING` -> `ACTIVE` (or `FAILED`); a `generateContent`
  against a non-ACTIVE file is rejected.
- Delete: `DELETE .../v1beta/files/<id>`.
- Limits recalled: per-file 2GB, project 20GB, retention 48 hours.
- Part shape in `generateContent`: `{ fileData: { mimeType, fileUri } }`
  (camelCase in REST JSON).
- Whether `gemini-3.1-flash-lite` (`gemini.ts:1`) accepts video input at all.

Auth: header `x-goog-api-key` (section 2). `fileUri` validation before it goes
into a part: must start `https://generativelanguage.googleapis.com/v1beta/files/`.
`name` for delete must match `^files/[a-z0-9-]{1,40}$`. `displayName` is
`ta-grading-video-<random>` and carries NO student data (section 9 contract).

### 7.4 Cleanup guarantee, stated honestly (D6)

- Primary: `finally` delete (above).
- It does not run reliably when the budget race is lost (O-4). Mitigation 1: the
  Files client takes an `AbortSignal` wired to the route's remaining budget, so
  the upload/poll stops itself rather than being orphaned mid-flight (the
  signal support `llm.ts:415-421` notes was left for "a future wave"; the Files
  client is that wave only for itself and does not touch `postGenerateContent`).
- Guaranteed backstop: the provider's 48h TTL (recalled, R-1).
- Optional (D6): a prefix-scoped sweep appended to the existing cron route
  (`sweep-orphan-uploads/route.ts`) that lists Files API files and deletes those
  whose `displayName` starts `ta-grading-video-` and whose create time is older
  than 1h. The prefix is why the sweep cannot touch any other feature's files in
  a shared project. Recommended only if D7 is not reassuring; costs one module +
  test. It is NOT in the minimum build.

### 7.5 PII and the trust boundary

Is video "the same trust boundary, not a new one"? Mostly yes, with one real
addition. SAME: student content already leaves to this exact host with this
exact key - submission text inside the prompt parts (`engine.ts:96-101` region),
and images/PDF as `inlineData` (`GEMINI_INLINE_MIME_TYPES`, `constants.ts:65-68`;
`collectInlineVisualParts`, `inline-visuals.ts`). NEW: inline data is transient
per request; a Files API file is PERSISTED provider-side until deleted or 48h.
So video adds (1) provider-side retention and (2) more intrinsically identifying
content (voice, face if a webcam is on). Neither changes who receives it; both
raise the stakes of D7 and justify D6's explicit delete. Nothing is sent to any
non-provider endpoint: the only hosts the design touches are Supabase Storage
(already used) and `generativelanguage.googleapis.com` (already used).

Logging: `engine.ts:114` already `console.error`s the raw model error body; the
Files client must not log filenames, bytes, `fileUri` or `displayName`, and
routes log only the decomposed `{userId, segment, uploadId}` shape
`withUploadedSyllabusFile` already uses (`syllabus-upload-source.ts:187-196`).

### 7.6 Model-seam failure modes

| Mode | Handling |
|---|---|
| Upload 4xx/5xx or network | retry policy NOT reused from `postGenerateContent` (that retries up to 5 attempts, `llm.ts:396`, with worst-case about 9s of backoff - too much of a 25s window); Files client: at most 1 retry on 429/5xx, else `upload failed` |
| File never reaches ACTIVE / `FAILED` | `timed out` / `model rejected` respectively; delete file |
| Model returns non-STOP finish or non-JSON | existing guards (`engine.ts:122-129`) throw into the `grading-failed` row; message tagged `model rejected` |
| Provider says file too large / too long (the 1,048,576-token context, `gemini.ts:35`) | `model rejected`; a pre-flight duration parse (container header) would turn this into a cheap pre-upload "too long" - NOT designed here, residual R-6 |
| 429 under 3 concurrent video grades | existing `callLlm` retries; if exhausted -> `model rejected`; unmeasurable here (R-1) |

---

## 8. PII, storage and retention

Path/bucket: reuse the existing private `course-files` bucket
(`SYLLABUS_UPLOAD_BUCKET`, `syllabus-upload-source.ts:261`) and the
`grading-uploads` segment (`UPLOAD_PATH_SEGMENTS`, `:66`): object is
`${userId}/grading-uploads/<uuid>.<ext>`. No new bucket, no new segment, no
migration. Because `UPLOAD_PATH_SEGMENTS` is the array the sweep imports
(`orphan-upload-sweep.ts` `SWEPT_PATH_SEGMENTS`), videos are swept for free; the
existing `orphan-upload-sweep.grading-segment.test.ts` already proves the
segment is listed (and uses a ZIP name, so T12 adds a video-name case).

Access control: owner-gated, server-side only. Reads happen in exactly two
places, both behind `requireAppOwner()` and `isVideoUploadPath(userId, ...)`: the
prepare route (head only) and `grade-run-item` (full object). No client-facing
read: there is no preview, no Files-UI download, no signed URL in any response
(T13). RLS (`20260722000000_course_materials.sql:17-33`) gates the browser's own
upload/delete to its own prefix.

Retention (D4, recommended EPHEMERAL), A:
- Success: object deleted by the grade request; Files API file deleted by the same
  request.
- Terminal failure: object deleted.
- Transient failure / abandoned: object remains at most until the next sweep tick
  after it is 10 minutes old (cron every 15 minutes, best-effort), so roughly
  10-25 minutes; Files API file at most 48h (or 1h with the optional sweep).
- Never persisted past the session: results rows keep the grade and a
  `previewContent` note (name, size, container); they hold no video bytes and no
  `videoRef` that outlives the object. A retried row whose object is gone fails
  with `upload failed` and the instructor re-uploads.
- Consequence to tell the owner plainly: a graded video cannot be re-opened from
  the app afterwards.

Under S the ephemeral policy defeats "store and link"; section 12.

---

## 9. Diagnostics (required by DEV_LOOP)

### 9.1 Adequacy of the scope's `prepare_video`

The scope's operation and five classes are the right shape but incomplete.
Missing, each a real failure this design creates: the per-zip count refusal
(`too many videos`), the budget expiry (`timed out`), and the surfaces that
refuse video by name (`not supported here`). Final class set (8), one owner
module `src/lib/grade/video-failure.ts`:

`VIDEO_FAILURE_CLASSES = ["too large", "too many videos", "unsupported format",
"upload failed", "extraction failed", "model rejected", "timed out", "not
supported here"]`.

### 9.2 Typed, not text-parsed (O-7)

The class travels as a TYPED field, never recovered from message text:
- `IntakeOutcome` refused branch (`chatSubmissionIntake.ts:54-62`) gains optional
  `videoFailure?: VideoFailureClass`;
- `IngestSkip` and `IngestLedger` (`ndjson-ingest-parser.ts:12-24`) gain optional
  `videoFailure` / `videoOutcomes?: { accepted: number; failed:
  Partial<Record<VideoFailureClass, number>> }` (COUNTS only; additive, so old
  sentinels still parse - `classificationFrom`'s precedent, `:131-153`);
- `/api/grade-run-item` and `/api/grade-submission-video` error JSON gain
  `videoFailure`; `postGradeRunItem` (`useContinuousGradingRun.ts:155-166`)
  throws an error carrying it.

`prepare_video` is added to `GradingDiagnosticOperation` and its label map
(`gradingDiagnosticLog.ts:18-33,35-51`). A pure `decideVideoDiagnostic(...)` +
thin `recordVideoSettled(...)` mirror `decideChatSeamDiagnostic` /
`recordChatSeamSettled` (`chatSeamDiagnostic.ts:60-89`). One entry per video part:
loose = one entry per file; in-zip = one entry per counted outcome (the browser
fans `videoOutcomes` out: `accepted` success entries and one failure entry per
class occurrence, each with the zip prepare `durationMs`).

### 9.3 PII-safe contract

The recorded `error` is EXACTLY a member of `VIDEO_FAILURE_CLASSES`; no
filename, size, path, student name, bytes, `fileUri` or `displayName` is ever
passed to `recordGradingDiagnosticEntry`. T8 passes a canary
(`"Jordan Lee walkthrough.mp4"`, a Storage path, a fake `files/abc` URI) through
every producer and asserts the serialised entry contains none of them. The user-
visible message MAY name the file (as existing refusals do); the diagnostic never
does. The module stays browser-only: no server file imports it
(`session-diagnostic-log.test.ts` scan already enforces this per
`gradingDiagnosticLog.ts:7-9`).

Build-wave split: the class module and the browser recorder ship with build wave 1
(recognition outcomes are recordable immediately, including `not supported
here`); the ledger/field plumbing ships with build wave 2; model classes with
build wave 3.

---

## 10. Honoring the orchestrator rulings F1 and F2

### 10.1 F1: recognition ships WITH a defined consumer (build wave 1)

Build wave 1 delivers, together (none may land without the others):
1. `VIDEO_EXTENSIONS` (+ video MIME entries) in `constants.ts`.
2. `classifyGradingUpload` returns `"video"` (`single-file-entry.ts:98,106-115`;
   `GradingUploadKind` gains the member) and `chatFrameCapture.test.ts:28` is
   changed from `"unsupported"` to `"video"` in the same commit (the second half
   of that test, `:27`, still pins the jpg as `"single"`).
3. In-zip classifier returns `"leaf"` for `VIDEO_EXTENSIONS`
   (`extraction.ts:100-106`) AND the leaf handler has a video branch (O-9 shape).
4. A defined handler at EVERY dispatch site (O-3). Required behaviour per site,
   all non-silent, none reaching `JSZip`:

| Site | Behaviour in build wave 1 |
|---|---|
| `grading-chat-intake.ts:184-209` `resolveOnePart` kind "file" | explicit `uploadKind === "video"` branch BEFORE the single/zip split. Body-path video (small file received in FormData): sniff the received bytes; invalid -> refused `unsupported format`; valid -> refused (class `not supported here`) with the worded text below. NO entry, no grade from absent evidence. When `VIDEO_GRADING_ENABLED` is true the client sends videos through the storage transport, so this body-path branch stays a refusal (it only sees a crafted call or a composite part). |
| `grading-chat-intake.ts:267-281` Drive link | explicit branch: refused, `not supported here`, "Video files can't be graded from a Google Drive link; download it and drop it in." |
| `grading-incremental.ts:123`, `grading.ts:892` (batch surfaces) | explicit branch: worded refusal "Videos are only accepted in the grading chat." |
| `extraction.ts:709` `resolveEntryLinksUnsafe` | `withLinkNote(entry, "flagged", "link not fetched: video files aren't supported for linked submissions")` (existing note channel, `:704-707` shape) |
| composite (`prepareCompositeSubmissionAction`, `grading-chat-intake.ts:309-340`) | falls out of `resolveOnePart`'s refusal via `extractSingleEntry` (`chatSubmissionIntake.ts:135-148`): "Part N: ...". Composite with video is explicitly out of the three paths; it is refused by name. |

Each of those branches is an exhaustive dispatch ending in an `assertNever(kind)`
(`const _x: never = uploadKind`) so that adding a FIFTH `GradingUploadKind`
member later fails `tsc` at all five sites instead of silently falling into
else. The exhaustive-switch is the construction; T7 is the behaviour test.

Placeholder wording (one constant, `VIDEO_PENDING_MESSAGE`): "Video received. Grading
videos is being set up, so nothing was graded." In-zip placeholder file note:
`[Video file: <name> - received; video grading is being set up, do not treat its
absence from the work as missing.]`

5. In-zip placeholder semantics with `stageVideo` absent (flag off): the video leaf
   reads NO bytes, counts as an attempted supported file
   (`attemptedSupportedFiles += 1`: the video branch must NOT set `isImage`,
   `extraction.ts:152`), and records `submission = <placeholder note>`,
   `raw = ""` (not `null`, which `extraction.ts:153-156` treats as failed; `""` is
   falsy so `rawBase64: ""` is never charged or sent). The student is grouped,
   and graded on their OTHER files with the note in `content` so the grader does
   not penalise. A student whose entry contains ONLY video placeholders is not
   graded: `buildIngestLines` converts them to a NAMED `skip` line with reason
   `VIDEO_PENDING_MESSAGE` via a pure `isVideoOnlyEntry(entry)` (the existing
   named-skip channel, `ndjson-ingest-parser.ts:50-53`), so an instructor never
   receives a computed grade based on a missing video. The batch/embedded callers
   of `extractStudentEntries` get the note in `content` (their behaviour
   changes from silent drop to noted; flagged for the checker as a blast radius).
6. Re-freeze `extraction.zip-caps.oracle.test.ts` (O-8): the only permitted
   diffs are `attemptedSupportedFiles` 22 -> 23 and hal's entry gaining the
   placeholder file. Any other diff means the change leaked.

### 10.2 F2: the in-zip oracle asserts arrival, not charge

Two instruments, because the outcome differs by wave:

**Conservation law (build wave 1 onward; this is the "defined non-silent
outcome"):** for a zip fixture with `k` video members (mix of valid, invalid
magic, and one exactly at `VIDEO_MAX_BYTES`), every video is accounted exactly
once. Count form (names are rewritten to citation names, so assert counts, not
paths): `k === videoMimedSubmittedFiles(entries).length +
failedSupportedFiles.filter(isVideoName).length + skippedVideoStudents(lines)`.
Failure direction: LHS greater than RHS = a silently dropped video = RED. A
sabotage that restores `return "skip"` at `extraction.ts:106` must turn this
red AND it must turn the re-frozen oracle red (two independent instruments).

**Bytes-reach test (build wave 3, A):** one chain test with fakes and no network.
(1) build a real zip with a known valid mp4 head + body (bytes `B`, sha256 `h`);
(2) `ingestZipEntries` with a fake `stageVideo` that records the Buffer it was
handed and returns `{storagePath:"u/grading-uploads/<uuid>.mp4"}`; assert
`sha256(recorded) === h` and the entry's `videoRef.storagePath` equals what the
fake returned; (3) call the same entry through the grade-time seam with a fake
Storage `download` (returns `B`) and a fake Files client; assert the fake
client's `upload` received bytes with sha `h`, and that the `LlmPart` handed to
a mocked `callLlm` is `{fileData:{mimeType:"video/mp4", fileUri:<fake uri>}}`;
(4) assert the fake `delete` was called with the fake name. Failure direction:
any hop that drops, truncates or re-encodes the bytes, or builds the part from
anything other than the fake client's `uri`, goes red. Mock the Files CLIENT,
not `fetch` (tests-are-network-blocked). The real upload and real grade are
owner-walk (R-1).

---

## 11. Test plan (what is asserted, where, and how it fails)

Gate for every wave: `npm run test:paths <p1> <p2> ...` (never raw multi-path
`vitest`; `docs/loop/this-repo.md` section 1); ALWAYS include
`src/file-size-ceiling.structure.test.ts`; a verification report quotes the
wrapper's `COVERED`/`NOT COVERED` line per argument. Single-file runs may use
`npx vitest run <path>`. Docs gate for this file: `npm run docs:gate`.
Mock `canvasFetch`/Files client, never `fetch`. Do not write `accept="video/*"`
or other `x/*` literals into a test whose helper strips block comments
(`docs/BACKLOG.md:203`, A42): the `/*` opens a false comment.

| ID | Wave | Object under comparison | Instrument | Pass condition (direction) | Mutant that must kill it |
|---|---|---|---|---|---|
| T1 | 1 | `sniffVideoContainer` verdict vs table | table-driven vitest, `src/lib/grade/video-magic.test.ts` | every accepted-brand row ok + right mime; every hostile row `{ok:false}`; RED on false accept AND false reject | accept any `ftyp`; check offset 0; drop webm DocType check; trust extension; allow `heic` |
| T2 | 2 | `isVideoUploadPath` vs hostile list (`<uid>/grading-uploads/../x.mp4`, `%2e%2e`, other uid, `syllabus-uploads`, `.zip`, 4 segments, uppercase `.MP4`, empty, NUL, 300-char name) | vitest, `src/lib/grade/video-transport.test.ts` | all rejected; one valid path accepted (positive control) | drop the segment-count check; case-insensitive regex |
| T3 | 2 | verdict at `MAX-1/MAX/MAX+1` on client decide, route stat gate, zip plan pass (via `patchCentralDirectory` as in `extraction.zip-caps.test.ts`) | vitest, one file per surface | all three agree: accept, accept, refuse | `>=` instead of `>` on any one surface |
| T4 | 2 | zip with 4 and 5 video leaves | `extraction.video.test.ts` with a spy on `readMemberBounded` | 5 -> `ZipCapError` code `video-count` and ZERO reads; 4 -> proceeds | count only top level; check after read |
| T5 | 2 | pending cap decision | pure `decideVideoTransport` test | 5 pending ok, 6 refused `too many videos` | off-by-one |
| T6 | 2 | `GRADING_ZIP_MAX_BYTES >= ZIP_MAX_CUMULATIVE_DECLARED_BYTES`; route uses the same constant at both gates | vitest + source-text pin | relation holds; both `route.ts` uses present | revert to 25MiB literal |
| T7 | 1 | each of the 5 dispatch sites given `x.mp4` | vitest with `vi.spyOn(JSZip, "loadAsync")` | spy NEVER called; outcome is the defined refusal/note; worded text, not a JSZip message | restore the bare `else` |
| T8 | 1-3 | diagnostic entries | canary test through every producer | serialised entry contains none of the canaries; `error` is a class member or absent | pass `outcome.reason` through |
| T9 | 3 | `withUploadedGeminiVideo` with a fake client | vitest | `delete` called on success, on `consume` throw, on poll timeout, on abort; NOT called when upload returned no name; error text contains neither a key nor a URL; refuses a foreign `X-Goog-Upload-URL` origin | remove the `finally`; skip redaction |
| T10 | 2 | `grade-submission-video/route` | route test like `grade-submission-zip/route.test.ts` | `requireAppOwner` rejection -> 401 and Storage fakes UNCALLED; hostile path -> 400, Storage UNCALLED; oversize -> 413 + delete; bad magic -> delete + class; success -> object NOT deleted | move auth after body parse |
| T11 | 3 | `grade-run-item` `videoRef` handling | extend `grade-run-item/route.test.ts` | foreign-user path -> 400; `videoRef` + `rawBase64` together -> 400; any `fileUri`/`url` key on a `videoRef` -> 400; `isSubmittedFileInfo` accepts a valid `videoRef` | accept client `fileUri` |
| T12 | 2 | zip route ext bind; sweep with a video name | extend route test + `orphan-upload-sweep.grading-segment.test.ts` | video path posted to zip route -> 400 and NOT deleted; sweep deletes a stale `*.mp4` in `grading-uploads` | drop the `.zip` check |
| T13 | 1-4 | reachability (source text): `decideVideoTransport` consulted before `preflightUploadFile` in `handleSubmitFiles`; `uploadGradingVideo` and `prepareVideo` have callers; no video path reaches `createSignedUrl` in a response | `*.wiring.test.ts` (pins the FACT and the order, never the spelling - memory `source-text-tests-overspecify`) | pins present | delete the call |
| T14 | 1-2 | O-1 invariant: every builder output (loose prepare, in-zip leaf, placeholder) has `rawBase64 === undefined` when `videoRef`/video MIME | vitest over the three builders + `graderNeedsFileBytes`/`graderReadsFileBytes` false for every video MIME | holds | attach `rawBase64` in the leaf |
| T15 | 1-3 | conservation law and bytes-reach chain | section 10.2 | as stated | `return "skip"`; truncate bytes |
| T16 | 2 | staging cleanup on timeout/failure | route test with fake `stageVideo` | 2 of 4 staged then timeout -> 2 removed, calls 3-4 upload nothing | drop `abandoned` |

Not testable here, so no requirement rests on it: real Storage upload of 40MiB,
Range/streaming read behaviour, Files API, real model output, memory peak,
60s fit, any rendered state of the new tray row/progress copy. See residuals.

---

## 12. What differs between A and S (and what is dropped)

| Concern | A (Files API) | S (store only, no grader reading) |
|---|---|---|
| Transport, caps, magic bytes, path validation, diagnostics classes, F1/F2 conservation | identical | identical |
| `LlmPart` `fileData`, `gemini-files.ts`, grade-time download+upload, sections 7.x, T9/T11/bytes-reach | built (build wave 3) | NOT built |
| Grader sees the video | yes | no; the row's `previewContent`/`content` note says it was stored and not viewed. Video-only students become named skips permanently (10.1 item 5 is the steady state) |
| Egress to a non-Storage endpoint | `generativelanguage.googleapis.com` only | none new |
| Stored-video retention | ephemeral (D4) | **undesigned.** "Link" implies the object outlives the session; that needs a durable segment OUTSIDE `UPLOAD_PATH_SEGMENTS` (else the sweep deletes it in about 10-25 minutes), a place to keep the link (grading results rows live in browser session state; no table exists for them), an owner-gated read (`createSignedUrl` exists, `storage.ts:32-39`) and a delete surface. That is a data + admin pass of its own. Residual R-9. |
| PII exposure | provider-side file for at most 48h | app-side durable PII store - arguably the larger obligation |
| Flag | `VIDEO_GRADING_ENABLED` true only after the owner-walk | n/a |

Rollback ladder (A): module-private constant `VIDEO_GRADING_ENABLED = false`
(precedent: `GRADING_ZIP_STORAGE_INGEST_ENABLED`, `grading-zip-transport.ts:21`,
and `INCREMENTAL_ROUTE_ENABLED`, `incrementalRunPlan.ts:157`, which is
deliberately a constant, not an env var, so it behaves identically in every
environment). False -> build wave 1 behaviour (recognise + placeholder + named
skip); build waves 2-3 land DARK behind it. The ceiling constants revert
independently (one line each). Build wave 1 stays on regardless; its handlers are
what stops the else-branch crash.

---

## 13. Measurements (every quantity and its command)

| Quantity | Value | Command / source |
|---|---|---|
| 32MiB video on the wire | 42.67MiB, 12.19x the 3.5MiB budget | `node -e` using `Math.ceil(b*4/3)` (the `wireBytesForFile` formula, `upload-budget.ts:56-58`) |
| 40MiB on the wire | 53.33MiB | same |
| Largest file that fits the wire budget | 2.625MiB | same, `maxFileBytesForWireBudget` formula (`:65-67`) |
| Zip route peak MODEL, Z=105, V=100, 4x40 | 105 + 105 + 100 = 310MiB; +133MiB base64; +about 267MiB stringify/encode if base64 were retained | `node -e` peak model (arithmetic on the structure at `route.ts:129-131`, `zip-caps.ts:353-401`; NOT a measurement of a running process) |
| Worst-case queue wait for the k-th staged video (3 in flight, 50s each) | k=6: 100s; 12: 200s; 18: 300s; 36: 600s; 40: 700s | `node -e` `ceil(k/3)*50`; inputs from `incrementalRunPlan.ts:32`, `grade-run-item/route.ts:52` |
| Sweep threshold / cadence | 600s; cron `9,24,39,54` | `orphan-upload-sweep.ts` constant, `.github/workflows/sweep-orphan-uploads.yml` |
| Bucket per-file cap | 209715200 (200MiB) | `supabase/migrations/20260806000000_course_files_size_limit.sql:4` |
| `ZIP_MAX_MEMBER_DECLARED_BYTES`, `..._CUMULATIVE_...`, entries, concurrency | 40MiB, 100MiB, 1000, 4 | `grep -n "export const ZIP_" src/lib/zip-caps.ts` (`:34-44`) |
| Classifier call sites | 5 dispatch sites in 4 files | `grep -rn "classifyGradingUpload" src --include=*.ts --include=*.tsx \| grep -v "\.test\."` |
| Frozen oracle's mp4 and count | `extraction.zip-caps.oracle.test.ts:111`, `:268` (22) | `grep -n "clip\|attemptedSupportedFiles" src/lib/grade/extraction.zip-caps.oracle.test.ts` |

Line counts at HEAD, command `wc -l < <file>` from Git Bash (this-repo.md section 3
records `wc -l` agreeing with `@(Get-Content <file>).Count` on 13 files; not
re-cross-checked on these four): `extraction.ts` 881, `zip-caps.ts` 586,
`grading-chat-intake.ts` 340, `single-file-entry.ts` 220. The build seat
re-measures each touched file with `@(Get-Content <file>).Count` (never
`Measure-Object -Line`) and runs `src/file-size-ceiling.structure.test.ts`.
`extraction.ts` is closest to the 1000 ceiling, so the video leaf branch should
live in a new `src/lib/grade/video-leaf.ts` rather than inline.

---

## 14. Disposition of the scope's claims

| Scope claim | Disposition |
|---|---|
| s0: video refused on every path, one silently (`single-file-entry.ts:106-115`, `extraction.ts:100-106`) | CONFIRMED (read both) |
| s1.4: skip videos are not charged to the budget | CONFIRMED (`zip-caps.ts:262-264`) |
| s1.5: inline impossible for 32MB | CONFIRMED and strengthened: also the NDJSON stream (O-1) |
| s3.1: `graderNeedsFileBytes` must not return true for video | KEPT, plus T14 pins `graderReadsFileBytes` too |
| s3.2: in-zip leaf "records the raw bytes as a video `SubmittedFileInfo`, parallel to the image branch" | CORRECTED: no raw bytes; `videoRef` only (O-1); and not parallel to the image branch (O-9) |
| s4.2: raise `GRADING_ZIP_MAX_BYTES`, propose 120MB | CORRECTED to 105MiB derived from the cumulative cap (D3) |
| s4.1: `VIDEO_MAX_BYTES` 200MB | CORRECTED to 40MiB, single number (D2, O-6) |
| s4.1: count cap "3 videos or 3x total" | REPLACED by two caps with different homes (5.2, 5.3) |
| s5: in-zip videos uploaded to the Files API inside the route | CORRECTED (O-2): stage at ingest, upload at grade time |
| s5: loose video route "downloads the object, uploads to the Files API, grades, deletes" | CORRECTED: prepare route does NOT grade or delete on success; grade route does |
| s6: validate by content type AND magic bytes | KEPT; content type dropped as an input (spoofable), bytes decide (section 4) |
| s7: five diagnostic classes | EXTENDED to eight; typed, not text-parsed (section 9) |
| s8 wave 1 owns list | EXTENDED: dispatch sites at `grading-incremental.ts`, `grading.ts`, `extraction.ts:704`, the frozen oracle (O-3, O-8), `video-failure.ts`, `video-leaf.ts` |
| s10 residual 3 (`GRADING_ZIP_MAX_BYTES` + 60s/memory) | HANDED OVER to R-3 with a model (6.1, 6.2) |

---

## 15. Residual register (owner, instrument, step - none is a deletion)

| ID | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-1 | The whole Files API path is unverified: upload protocol, ACTIVE wait, `fileData` shape, `gemini-3.1-flash-lite` video support, latency, rate limits, mp4 brand of a real Loom | repo owner | an owner-walk grading a real ~32MB Loom end to end on a deployed preview with `GEMINI_API_KEY`; the walk records `prepare_video` and `grade_item` `durationMs` from the in-app diagnostics log | after build wave 3 lands dark; flag flips only after the walk passes |
| R-2 | RLS and bucket privacy are asserted from migration text only | repo owner | Supabase dashboard policy listing for `course-files` | before flag on |
| R-3 | 35s ingest budget, staging time, memory peak, platform memory limit | repo owner (Vercel) | owner-walk with a real 90-100MiB zip; read function memory and duration from the Vercel invocation log; compare against 35,000ms and the plan's limit | after build wave 2 lands dark, before `ZIP_MAX_VIDEO_MEMBERS` is trusted |
| R-4 | Per-kind member cap if the owner wants videos > 40MiB | repo owner decision, then architect seat | the loose/zip boundary matrix T3 extended to the new number | only if D2 is answered "bigger" |
| R-5 | Stacked sequential drops can exceed `VIDEO_MAX_PENDING_STAGED` effect and age past the sweep threshold | reliability seat | owner-walk dropping 3 batches of 6; observe `upload failed (expired)` count in diagnostics | after build wave 4 |
| R-6 | Pre-flight duration parse (ISO BMFF `mvhd`, WebM Info/Duration) to refuse "too long" before upload; token-cost abuse is owner-gated today | architect seat | a pure `readVideoDurationSeconds` leaf with fixture tests, if R-1 shows model rejections for length | only if R-1 shows it |
| R-7 | Prompt injection via video audio/visual content: no mitigation claimed | security seat at the A model-seam check | adversarial fixture is impossible here (no model); owner-walk with a narrated "ignore the rubric" clip | during R-1 |
| R-8 | Prefix-scoped Files API sweep (D6) | repo owner chooses; reliability seat builds | fake lister/remover test mirroring `orphan-upload-sweep.test.ts` | build wave 3 if D6/D7 say so |
| R-9 | Durable "store and link" retention (S only) | data/storage seat | a new data pass: segment, link location, signed-URL read, delete UI | only if D1 = S |
| R-10 | Dashboard Storage limit vs D3/D2 | repo owner | read the value; if < 105MiB lower D3 | before build wave 2 ships on |
| R-11 | Standard (non-resumable) Storage upload of a ~40MiB object on a flaky link | UX/reliability seat | owner-walk on a throttled connection; adopt TUS resumable upload only if failures appear | after build wave 4 |
| R-12 | Provider data-use terms for the key (D7) | repo owner | provider console / billing page | before flag on |

---

## 16. What I could not determine (stated, not filled in)

- Anything about the real Gemini Files API or `gemini-3.1-flash-lite`'s video
  support (no key, no network). Section 7.3 is recall and is labelled as such.
- The Supabase project-wide Storage limit, Vercel function memory, real download,
  staging and upload throughput, and whether a Storage signed-URL stream can be
  cancelled early (3.3 has a fallback that does not depend on it).
- Whether `supabase-js` accepts a stream body on `upload` (not needed: buffering
  is the chosen design).
- Any rendered UI: the tray row, progress and refusal copy are build wave 4 and
  are reading claims only; no requirement here rests on a render.
- Whether the batch `run` surfaces (`grading.ts`, `grading-incremental.ts`) are
  reachable in production today. `INCREMENTAL_ROUTE_ENABLED = false`
  (`incrementalRunPlan.ts:157`) gates one; the design still gives every site a
  defined behaviour because an unreached `else` that is later reached is exactly
  the F1 failure.
