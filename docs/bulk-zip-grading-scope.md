# Bulk-zip grading: FINAL buildable plan (FIX-2 / FIX-4)

Owner decision, 2026-10-08: **build full bulk-zip support** (FORK=B), so an
instructor can upload a large Canvas-export zip (the owner's blocked case: a
~12-13 MB zip, ~26 files - 11 pdf, 10 png, 3 docx, 1 nested zip, 2 `*_link.html`
to Google Docs) and grade it per student. Today the FIX-1 fast-fail preflight
refuses that zip ("too large to upload in one request, limit 2.6MB") before a
byte reaches the server. This item uploads the zip to Supabase Storage (off the
~4.5 MB request-body cap) and grades it through the chat surface's existing
per-item pump.

This is the ARCHITECTURE pass, revised to FINAL after the two adversarial
(security + reliability) passes and after ZIP-BOMB-CAPS (BW0) shipped. Every
`file:line` below was opened in this revision; every quantity names the command
that produced it; where this document's earlier draft or the task brief
disagreed with the tree, the measurement is reported and the disagreement named
(repo rule). No production code was written.

---

## 0. EXECUTIVE SUMMARY - what changed from the previous draft

Three structural changes, each forced by a finding the previous draft did not
have:

1. **The ingest is a STREAMING Route Handler emitting NDJSON, not a Server
   Action.** The previous draft's `prepareStoragedZipSubmissionAction` returned
   every student's entries in ONE response. For the owner's zip that response is
   ~17 MB (13 MB of image bytes base64-inflate 4/3; `estimateEntryWireBytes`
   counts `content.length` + every `rawBase64.length`, `incrementalRunPlan.ts:86-92`).
   A Server Action cannot `maxDuration` itself and head-of-line-blocks the page;
   a single 17 MB JSON is a serverless-memory spike and a single parse the client
   must hold whole, with no way to tell a truncated response from a complete one.
   REPLACED by `src/app/api/grade-submission-zip/route.ts` + `route.test.ts`: a
   Route Handler (`maxDuration = 60`, soft budget under it) that extracts
   server-side and then writes one NDJSON line per student (each `<=`
   `ITEM_REQUEST_BYTE_BUDGET`) followed by a `{"done":true,...}` sentinel. A pure
   client parser dispatches each line into the EXISTING pump as it arrives and
   treats a missing sentinel as "interrupted after K of M".

   Note, corrected from the brief: Vercel's ~4.5 MB cap is on the REQUEST BODY
   and "applies to Route Handlers exactly as it does to Server Actions"
   (`upload-budget.ts:8-10`). So the Route Handler does **not** defeat the cap -
   the STORAGE upload does (the request body becomes just the storage path).
   NDJSON streaming is chosen for the RESPONSE for the memory / incremental-
   dispatch / interruption-detection reasons above; it does NOT rest on any
   claim that the response body is platform-capped (unverifiable here - owner-walk).

2. **ZIP-BOMB-CAPS (BW0) shipped and is REUSED, not re-scoped.** `src/lib/zip-caps.ts`
   exists (W1 `9d3933fb`, W2 `5150961f`): the shared `ZipBudget`, `declaredSizesOf`
   (fail-closed), `readMemberBounded`/`readOfficeMember` (internalStream + pause,
   fail-closed), `assertContainerWithinCaps`, `chargeArchiveLevel`, `runBounded`,
   and `ZIP_REFUSAL_PREFIX = "Refused: "` (`zip-caps.ts:29`). `extraction.ts`
   already routes every level through it (`extraction.ts:24-28,87,103,112,124`);
   `office-extract.ts` already routes docx/pptx/xlsx through it. So the old S1/S5
   zip-bomb hole is CLOSED and this item inherits the caps for free - it reuses
   them, it does not design them.

3. **The wave plan is cut to four independently shippable build waves** (BW1-BW4)
   with explicit write sets, instruments, and ordering, below. The old "revive
   GradingTab's incremental route" half is withdrawn (section 10).

What the owner gets at the end: the 12-13 MB zip uploads to Storage and grades
through the chat pump, with oversized or failed students surfaced as named
skips, not a whole-run refusal.

---

## 0b. Measurement log (so the checker can re-run, not re-trust)

Line counts, `@(Get-Content <file>).Count` (PowerShell), run 2026-10-08 at HEAD
~`5150961f`:

| File | Lines | Near 1000 ceiling? |
|---|---|---|
| `src/app/actions/grading.ts` | 977 | **YES - 23 from the ceiling; do not add to it** |
| `src/lib/grade/extraction.ts` | 664 | no (was 623 pre-BW0; BW3 edits it) |
| `src/lib/zip-caps.ts` | 562 | no (BW0, shipped; READ ONLY here) |
| `src/app/components/grading-chat/useContinuousGradingRun.ts` | 499 | no |
| `src/app/components/grading-chat/GradingChatPanel.tsx` | 491 | no |
| `src/lib/orphan-upload-sweep.ts` | 441 | no |
| `src/lib/course-files.ts` | 380 | no |
| `src/app/actions/grading-chat-intake.ts` | 333 | no |
| `src/app/components/grading/incrementalRunPlan.ts` | 305 | watch (`runProgressCopy` split already done) |
| `src/lib/syllabus-upload-source.ts` | 299 | no (BW1 adds one array member) |
| `src/app/api/grade-run-item/route.ts` | 221 | no |
| `src/app/components/grading-chat/chatSubmissionIntake.ts` | 137 | no |
| `src/lib/upload-budget.ts` | 115 | no |
| `src/app/components/courses/SyllabusUploadControl.tsx` | 117 | no |
| `src/app/components/grading-chat/chatSeamDiagnostic.ts` | 88 | no |

Consequence: `grading.ts` at 977 cannot absorb new code. The new ingest is a new
route file; FIX-4's whole-run enrichment call is the ONE surgical add to
`grading.ts` (section 4), and if it would push the file over 1000 an extraction
precedes it (BW3).

Grep facts re-verified (command -> result, each opened):
- `zip-caps.ts` exports `ZIP_REFUSAL_PREFIX = "Refused: "` (`:29`),
  `declaredSizesOf` (`:204`, throws `unverifiable` on a missing size - fail-closed),
  `readMemberBounded` (`:338`), `readOfficeMember` (`:491`),
  `assertContainerWithinCaps` (`:417`), `chargeArchiveLevel` (`:234`),
  `createZipBudget`/`ZipBudget` (`:68-83`), `runBounded` (`:531`). CONFIRMED.
- `extraction.ts` imports `chargeArchiveLevel, createZipBudget, readMemberBounded,
  runBounded, ZipCapError` from `../zip-caps` (`:20-28`) and a `ZipCapError`
  rethrow refuses the whole archive (`:133,167`). CONFIRMED - caps inherited.
- `resolveLinkSubmissions` runs UNCONDITIONALLY inside `ingestZipEntries`
  (`extraction.ts:237`), a SEQUENTIAL `for` loop (`:511-529`). CONFIRMED - FIX-4
  target.
- `UPLOAD_PATH_SEGMENTS = ["syllabus-uploads", "rubric-uploads"]`
  (`syllabus-upload-source.ts:66`); the sweep imports that exact array
  (`orphan-upload-sweep.ts:27`), aliases it `SWEPT_PATH_SEGMENTS` (`:76`), and
  loops over it (`:353`). So adding a third member reaches BOTH the upload path
  and the sweep from ONE edit.
- `firstOversizedEntryReason` (`grading-chat-intake.ts:113`) refuses the WHOLE
  submission when any one entry is oversized. CONFIRMED - wrong for bulk.
- The soft-budget instrument `checkSoftBudgetUnderCap` is a **test-side
  source-text predicate** (`grade-run-item/route.test.ts:41`), NOT a production
  function - corrected from the brief. The production mechanism is
  `export const maxDuration = 60` (`route.ts:39`) + `TOTAL_BUDGET_MS = 50_000`
  (`:51`) + `raceWithTimeout` (`:201`).

---

## 1. The surface decision (settled by FORK=B; recorded for the checker)

**Grade the bulk zip on the chat surface (`GradingChatPanel` +
`useContinuousGradingRun`).** The owner chose full bulk-zip support graded
through the chat per-item pump, which settles the old FORK A (chat surface vs
reviving GradingTab's "Upload ZIP" incremental route) in favour of the chat
surface. FORK A is RESOLVED, not open; the restatement-tally machinery the
previous draft attached to it is moot.

Why this is the least-new-machinery surface (the architect's obligation - the
surface IS a layer; say which layer the user reaches and how):
- **The progressive pump is already live in production here.** `useContinuousGradingRun`
  dispatches each student to `POST /api/grade-run-item` (`:133-144`) with a
  bounded pool at `INCREMENTAL_CONCURRENCY = 3` (`incrementalRunPlan.ts:31`), the
  RES-GC-9 wedge fix (`.finally()` frees a slot on every outcome, `:232-239`),
  retry (`:424`) and regrade (`:437`), last-wins by `sourceIndex`
  (`mergeArrivedResults`, `incrementalRunPlan.ts:178`), and the N-of-M indicator
  keyed on `dispatchedCount - completedCount` (`GradingChatPanel.tsx:463`). None
  of that is rebuilt.
- **The RULING 116 shape gaps do not exist on this path.** `resolveChatRunHeaderAction`
  (`grading-chat-intake.ts:64`) calls `resolveRunHeader(..., { synthesizeRubricWhenBlank: true })`
  (`:81-83`) and refuses blank-over-limit instructions/rubric (`:71-79`), and
  `beginSession` calls it once (`useContinuousGradingRun.ts:251`).
  `INCREMENTAL_ROUTE_ENABLED = false` (`incrementalRunPlan.ts:110`) stays false;
  GradingTab's incremental route is untouched; RULING 116 is MOOT for this item.
- **The user-reached layer, and how:** the owner **drops a zip onto the
  grading-chat surface** (a gesture the panel already supports -
  `handlePanelDrop`, `GradingChatPanel.tsx:303-309`, calls `handleSubmitFiles`).
  The only new behaviour is that a LARGE zip now routes to the Storage transport
  instead of being refused by the FIX-1 preflight.

### What is missing on this surface (the real work)

**The transport.** Today the chat ingests a dropped file through
`prepareChatSubmissionAction` (`grading-chat-intake.ts:131`), a Server Action,
so the zip rides the request body and is rejected by the ~4.5 MB cap
(`upload-budget.ts:38`) / `bodySizeLimit: "10mb"` (`next.config.ts`) - and before
that, by the FIX-1 preflight in `handleSubmitFiles` (`preflightUploadFile`,
`GradingChatPanel.tsx:257`). The zip bytes must reach the server off the body:
therefore Storage, plus a server reader, plus the NDJSON stream back.

### Considered and rejected

- **Client-side extraction (no Storage):** office/PDF extraction is Node-shaped
  here - `extractSubmissions` (`extraction.ts:57`) reaches `office-extract.ts`'s
  `extractTextFromBuffer` (Node `Buffer`), and the A44 collision refusal
  (`collisionRefusal.ts`, thrown at `extraction.ts:231-234`) and filename
  inference run server-side. Porting them to the browser is a large separate
  surface change. The zip bytes must reach the server, and the body cap says
  they cannot ride the body - therefore Storage.

---

## 2. Storage transport design (FIX-2 transport half)

### The shape

1. **Client pre-flight + direct-to-Storage upload (BW1).** On the grading-chat
   surface, a dropped/picked file that is a zip over a body-safe threshold
   uploads straight to the private `course-files` bucket, off the request body -
   the pattern `SyllabusUploadControl.tsx` already proves (`:35` pure pre-flight,
   `:61-63` `supabase.storage.from(bucket).upload(...)`). A small zip and every
   non-zip file keep today's body path (`prepareChatSubmissionAction`) unchanged.
2. **Server reads from Storage and streams entries (BW2).** The new Route Handler
   `POST /api/grade-submission-zip` takes the storage path (tiny body), downloads
   the blob server-side, runs the existing `extractStudentEntries`
   (`extraction.ts:197`), and writes the per-student entries back as NDJSON (one
   line per student). The chat driver's new storaged-zip submit path feeds each
   line into the existing pump.
3. **Cleanup (BW1 + BW2).** The zip is parsed once and never read again, so the
   object is deleted on every path via the `withUploadedSyllabusFile` lifecycle
   (download-use-delete-on-every-path, `syllabus-upload-source.ts:177-250`), with
   the scheduled orphan sweep as the backstop (section 7) and a client
   delete-on-reject courtesy (R10).

### The storage location (settled: reuse `course-files` + a new segment)

The grading surfaces carry no `courseId` (measured: A45's row records the grading
form carries only `provider/studentSubmissions/canvasUrl/assignmentInstructions/
rubric/rubricFile`), so the course-zip path shape `${userId}/${courseId}/<uuid>.zip`
is unavailable. The SYLLABUS lifecycle's path shape is the fit, and it is the
chosen transport:

- **Add `"grading-uploads"` to `UPLOAD_PATH_SEGMENTS`** (`syllabus-upload-source.ts:66`),
  turning the array into `["syllabus-uploads", "rubric-uploads", "grading-uploads"]`.
  This is a one-line, code-revertible change, NO migration: the `course-files`
  bucket and its RLS policies already exist (`supabase/migrations/20260722000000_course_materials.sql:14-33`,
  `(storage.foldername(name))[1] = auth.uid()::text`).
- **Build the path ONLY via** `syllabusUploadStoragePath(userId, uuid, ".zip", "grading-uploads")`
  (`syllabus-upload-source.ts:291`). Do NOT hand-roll a path; do NOT use
  `uploadCourseZip` (`course-files.ts:173`, wrong `${userId}/${courseId}/` shape).
- **The validator is `isKnownUploadPath`** (`syllabus-upload-source.ts:149`),
  NOT `isOwnCourseFilesStoragePath` - corrected from the brief and the previous
  draft. `isKnownUploadPath` requires `segments[0] === userId`,
  `segments[1] in UPLOAD_PATH_SEGMENTS` (exact membership), `>= 3` segments, and
  no empty/`.`/`..`/percent-encoded-separator segment anywhere (RULING 130,
  `:140-156`). It runs INSIDE `withUploadedSyllabusFile` before any download or
  delete (`:183-185`), so the guard is inherited, not re-added per caller.
- **BIND the segment per action, on BOTH sides, in BW1** (S3). Because
  `"grading-uploads"` is now in the SHARED union, `isKnownUploadPath` (which checks
  only MEMBERSHIP in the union) alone would let `extractSyllabusTextAction` accept a
  grading path and the grading ingest accept a syllabus/rubric path, within one
  user's own uid prefix (same-uid confinement, so RLS does not catch it - a
  defence-in-depth regression that ships green). Two binds, both BEFORE any Storage
  call:
  - the grading ingest asserts `storagePath.split("/")[1] === "grading-uploads"`;
  - `extractSyllabusTextAction` (`src/app/actions/syllabus-upload.ts:227-246`,
    which today validates ONLY via `isKnownUploadPath` at `withUploadedSyllabusFile`,
    `:233`) asserts `storagePath.split("/")[1]` is one of the segments it
    legitimately serves - **`"syllabus-uploads"` OR `"rubric-uploads"`** (it is
    reused WHOLE by the rubric upload, `RubricInputModal.tsx:207`, so it must NOT
    refuse `"rubric-uploads"`), i.e. it REFUSES `"grading-uploads"` specifically.
  **The compensating bind lands in the SAME wave (BW1) that adds the union member,
  so the bind lands WITH the exposure, never after it.** `src/app/actions/syllabus-upload.ts`
  is in BW1's write set for exactly this. (Separately noted, not the blocker:
  `extractSyllabusTextAction` uses `requireOwner()` = the deprecated `requireUser()`
  alias at `:231`, which is why its segment bind must be explicit rather than
  assumed from the gate.)

### Which client, and the SSRF posture (security #1)

- **Prefer the caller's own cookie/authenticated Storage client** (RLS-enforced),
  so the uid-prefix policy (`...course_materials.sql:14-33`) is the PRIMARY gate
  and `isKnownUploadPath` + the segment bind are defence-in-depth. A Route
  Handler can read cookies via `next/headers`; `requireAppOwner()` is callable in
  a route handler (`grade-run-item/route.ts:162` proves it).
- **If any sink uses a service-role client** (the syllabus action's own delete
  does - `syllabus-upload-source.ts:119-126` names this), the guard becomes
  LOAD-BEARING, not defence-in-depth, because the service role bypasses RLS
  (RULING 127, `course-files.ts:65-108`). Either way `isKnownUploadPath` runs
  before the first Storage call, refusing (not sanitising) on failure.
- The download URL is derived from a path the server validated against the
  caller's own uid; it is never a caller-supplied URL. The transport itself
  introduces NO new arbitrary-fetch/SSRF surface (contrast the link-fold,
  section 4).

### Reuse inventory (symbol, file:line, what it gives us)

| Symbol | file:line | Gives us |
|---|---|---|
| `SyllabusUploadControl` upload flow | `SyllabusUploadControl.tsx:35,58-63,70` | Client pre-flight -> direct Storage upload -> server-with-path pattern |
| `UPLOAD_PATH_SEGMENTS` + `UploadPathSegment` | `syllabus-upload-source.ts:66,71` | The TS-enforced extension point - add one member, both upload and sweep inherit it |
| `syllabusUploadStoragePath(userId, uploadId, ext, segment)` | `syllabus-upload-source.ts:291` | The ONLY path builder; `segment` typed `UploadPathSegment` so a wrong segment is a compile error |
| `isKnownUploadPath(userId, path)` | `syllabus-upload-source.ts:149` | RULING 130 segment-by-segment validator - the service-role-sink guard |
| `withUploadedSyllabusFile(storage, userId, path, consume)` | `syllabus-upload-source.ts:177` | Download-use-delete-on-EVERY-path lifecycle; guard runs first; provable with fakes in a node-env test |
| `downloadCourseZipBlob` | `course-files.ts:284` | Server-side blob read with retry/backoff for the known "Failed to fetch" transient (R6) |
| `SYLLABUS_UPLOAD_BUCKET = "course-files"` | `syllabus-upload-source.ts:261` | The existing private bucket - no new bucket, no migration |
| `ingestZipEntries(zipBuffer, {inferFileNamesWith})` | `extraction.ts:213` | Zip -> `{ entries, attemptedSupportedFiles, failedSupportedFiles }`, inheriting BW0 caps + A44 collision refusal. BW2 uses THIS, not `extractStudentEntries` (`:197`), which discards `failedSupportedFiles` the sentinel needs |
| `estimateEntryWireBytes` / `ITEM_REQUEST_BYTE_BUDGET` | `incrementalRunPlan.ts:86,42` | Per-STUDENT wire-budget check (3.5 MB wire); `ITEM_REQUEST_BYTE_BUDGET = UPLOAD_WIRE_BUDGET_BYTES` |
| `raceWithTimeout` + `maxDuration`/`TOTAL_BUDGET_MS` shape | `grade-run-item/route.ts:39,51,201` | The soft-budget-under-hard-cap route shape to copy |
| Pump `submit`/`pump`/`recordArrival` | `useContinuousGradingRun.ts:205-241,272-422` | Per-student dispatch, wedge fix, last-wins, N-of-M, 40-cap clip - all inherited |

### Pre-flight ceiling

The FIX-1 2.6 MB disk ceiling no longer applies once the zip goes to Storage.
The syllabus precedent is 25 MB (`syllabus-upload-validation.ts:17`,
`MAX_FILE_SIZE = 25 * 1024 * 1024`). **Recommended pre-flight ceiling: 25 MB**
(reuse the syllabus figure). The owner's 13 MB is comfortably under it. The REAL
bound is not the upload - it is server-side extraction under the soft budget
(reliability R1) and the per-STUDENT wire budget (next).

### The per-STUDENT wire budget still applies (security #4, reliability R5)

The transport bypasses the request-body cap, but **each student entry is still
POSTed to `/api/grade-run-item` and must fit `ITEM_REQUEST_BYTE_BUDGET`** (3.5 MB
wire; `estimateEntryWireBytes` counts `content.length` + every file's
`rawBase64.length`, `incrementalRunPlan.ts:86-92`). An image-heavy student entry
is wire-heavy (the owner's zip has 10 pngs). Today `firstOversizedEntryReason`
(`grading-chat-intake.ts:113`) refuses the WHOLE submission when any one entry is
oversized. For bulk that is wrong: one oversized student must become ONE NDJSON
skip line with a named reason, never a whole-call refusal (section 6 R5; cross-
references N15-PHOTO-DOWNSCALE, which would downscale images before this bound
bites - do NOT duplicate it).

---

## 3. The streaming Route Handler ingest (BW2 - the structural core)

`POST /api/grade-submission-zip/route.ts` + `route.test.ts`, modelled on
`grade-run-item/route.ts`:

```
export const runtime = "nodejs";
export const maxDuration = 60;             // R2
export const dynamic = "force-dynamic";
const TOTAL_BUDGET_MS = 35_000;            // R1: EXTRACTION budget, under 60s,
                                           // ~35-40s to leave stream time
```

Request body: `{ storagePath: string }` only (the zip is already in Storage).

Flow:
1. `await requireAppOwner()` as the FIRST statement, before the body is read -
   the guard-first instrument is a ROUTE TEST (unauthenticated POST gets 401
   before the body is parsed), not the OWNER_ONLY action-guard list, because this
   is a Route Handler (S2). Copy `grade-run-item/route.ts:161-165`.
2. CSRF floor: `content-type` must include `application/json` (copy
   `grade-run-item/route.ts:171-174`).
3. Read `storagePath`; assert `split("/")[1] === "grading-uploads"` (segment bind,
   section 2); run a SERVER-SIDE size check against the 25 MB ceiling BEFORE
   download (S4 - do not trust the client preflight; a Storage `info`/list size,
   or refuse a blob whose byte length exceeds the ceiling after download but
   before extraction).
4. `withUploadedSyllabusFile(storageClient, userId, storagePath, consume)` where
   `consume(bytes)` runs `ingestZipEntries(bytes.arrayBuffer, {inferFileNamesWith})`
   - NOT `extractStudentEntries`, which discards the `failedSupportedFiles` the
   sentinel needs (`extraction.ts:200-203`) - bounded by the soft budget
   (`raceWithTimeout` over the extraction, `TOTAL_BUDGET_MS`). The lifecycle
   deletes the object on every path (happy / throw / download-fail).
   `ingestZipEntries` inherits the BW0 caps: a cap breach throws a
   `ZipCapError` ("Refused: ...") which becomes a WHOLE-run worded refusal (the
   zip bomb is refused as one unit; per-student nested-zip skips are a separate
   deferred row, NESTED-ZIP-SILENT-SKIP - section 6).
5. Partition the extracted entries and STREAM NDJSON:
   - For each entry, if `estimateEntryWireBytes(entry) > ITEM_REQUEST_BYTE_BUDGET`,
     write a `{"kind":"skip","student":<label>,"reason":"too large to grade on
     this surface"}` line (S6 / R5) and do NOT dispatch it.
   - Otherwise write `{"kind":"entry","entry":<StudentSubmissionEntry>,"pointsPossible":null}`
     (one line, `<= ITEM_REQUEST_BYTE_BUDGET`).
   - After all lines, write the terminal sentinel
     `{"done":true,"studentsFound":N,"studentsEmitted":E,"skipped":[{student,reason}...],
     "failedSupportedFiles":[...]}` (R5). `ingestZipEntries` already returns
     `failedSupportedFiles` (`extraction.ts:218,242`), so every field here is
     reachable from BW2's own write set. **`nestedZipFailures` is NOT in the
     sentinel:** nested-zip failures are swallowed at `extraction.ts:166-169` and
     surfacing them needs an `extraction.ts` edit outside BW2's write set - deferred
     to NESTED-ZIP-SILENT-SKIP (RES-BZ-9), which adds the count when it ships.
   - If the soft budget fires during extraction, write a worded
     `{"done":true,"error":"this zip was too large to prepare in time..."}` instead
     of a silent platform kill.

The NDJSON writer is a Node stream / `ReadableStream`; the server never holds all
entries' JSON as one string if it can help it, but even buffered, the win is that
the CLIENT dispatches per line and detects a missing sentinel.

### The never-throw client parser leaf (BW2)

A pure client wrapper `ingestStoragedZip(storagePath, onEntry)` that fetches the
route, reads the NDJSON stream line by line, calls `onEntry` per `"entry"` line
(the driver pushes it into `queueRef` + `pump()`), collects `"skip"` lines and
the sentinel, and **NEVER throws** (R3): a non-OK status, a non-NDJSON body, a
thrown fetch, or a stream that ends with no `{"done":true}` sentinel all map to
`{ kind: "refused", reason }` (a missing sentinel -> "preparation was
interrupted after K of M students"). The driver's `dispatchedCount` is unchanged
on a refusal (R3's lifecycle test: an injected rejecting ingest returns refused
with `dispatchedCount` unchanged).

### The driver's new submit input (BW1/BW2, `useContinuousGradingRun.ts`)

Add a `{ kind: "storaged-zip"; storagePath: string }` member to
`ChatSubmissionInput` (`chatSubmissionIntake.ts:26`). `submit` for this kind
captures `sessionIdRef.current` at start, calls `ingestStoragedZip`, and for each
arriving entry runs the SAME admission code the existing file path runs
(`useContinuousGradingRun.ts:378-404`: `assignUnclaimedLabel`, `sourceIndex`,
`retainedBodiesRef`, `queueRef.push`, `pump()`), **dropping any entry whose
`sessionIdRef.current` changed after the await** (R4 - a reset mid-stream must
not spend ~26 Gemini calls on a ghost run). The existing 40-entry session clip
(`maxEntries - dispatchedCountRef.current`, `:358`) already produces the
`"partial"` SubmitOutcome and covers R12 (a bulk zip over 40 is clipped with a
worded remainder; recorded as a product residual).

---

## 4. FIX-4: defer link resolution to grade-time (BW3)

### Today

`ingestZipEntries` resolves links AT INGEST: `await resolveLinkSubmissions(submissions, rawData)`
runs unconditionally (`extraction.ts:237`), a SEQUENTIAL `for` loop (`:511-529`)
where each `*_link.html` carrying the Canvas marker awaits `resolveSubmittedLink`
(`:489`) -> `foldGithubRepoContent` (`:442`) -> a full GitHub pull. This blocks
ingest on N serial remote pulls and serializes the ingest the bulk path must keep
under the soft budget. (For the owner's specific zip this is ~zero work - the 2
links are Google Docs, noted-not-fetched, `:494-497` - but it compounds on any
GitHub-link zip.)

### The grade-time seam

`StudentSubmissionEntry` already carries `submissionUrl`, `gradedRepo`,
`gradedRef`, `repoReadNote` (set by `canvasWorkToEntry`, `extraction.ts:553-556,659-662`).
The established grade-time per-entry enrichment precedent is `attachCodeRuns`
(`grading.ts:876`) - the ACTION enriches entries with network work so the engine
stays network-free.

Design (ONE shared resolver so the route cannot grow a looser path - S8):
- Export ONE `resolveEntryLinks(entry): Promise<entry>` from `extraction.ts` that
  folds `entry.submissionUrl` into `content`/`submittedFiles`/`gradedRepo`/`gradedRef`
  via the existing `foldGithubRepoContent`. Both the route and the whole-run
  action call this one export; neither re-implements the fold.
- `ingestZipEntries` STOPS calling `resolveLinkSubmissions`; instead it emits an
  UNRESOLVED link entry carrying `submissionUrl` + a bare note in `content`
  (mirror `canvasWorkToEntry`'s `submissionUrl` set).
- The `/api/grade-run-item` route calls `resolveEntryLinks(entry)` BEFORE
  `gradeEntries` (`route.ts:201`), and `parseRequestBody` MUST newly accept and
  VALIDATE `submissionUrl` (it reads `gradedRepo`/`gradedRef` today at `:120-121`
  but NOT `submissionUrl`). Validation uses the SAME allowlist
  `resolveSubmittedLink` enforces (GitHub/vscode.dev only, `extraction.ts:489-500`),
  never a raw fetch of a caller-supplied URL (security #5).
- The whole-run paths (`gradeEntriesEmbedded`, `grading.ts:876` region; the Gemini
  engine path) that still run ingest get the enrichment added to the ACTION
  alongside `attachCodeRuns` - the ONE surgical add to `grading.ts`. If it would
  push `grading.ts` past 1000 (it is at 977), extract an offsetting slice FIRST.

### The bonus the defer buys

The folded repo CODE never has to fit the per-item wire budget - the UNRESOLVED
entry (bare note + URL) is tiny, and the route folds server-side bounded by its
own `MAX_CONTENT_CHARS = 2_000_000` (`route.ts:57`). So the defer both
parallelizes the pulls (each student's fold runs inside its own `/api/grade-run-item`
call, three in flight) AND lifts the wire-budget ceiling a big-repo link would
otherwise trip.

### The pre-existing GitHub owner/repo path-traversal (S8, UNFILED - corrected)

`parseSubmissionGithubUrl` (`submission-repo.ts:47`) decodes each path segment
(`:66-71`) and takes `owner = segments[0]`, `repo = segments[1].replace(/\.git$/i,"")`
(`:77-78`) with **no `^[A-Za-z0-9_.-]+$` validation**, so a decoded `..` or a
segment with an embedded `/` can be interpolated into the GitHub API path
`fetchGradableRepoContent` builds. The brief said this is "already filed as its
own concern" - **MEASURED FALSE**: a search of `docs/BACKLOG.md` for
`parseSubmissionGithubUrl`/`owner/repo`/the regex/`path traversal` matches ONLY
ZIP-LINK-SUBMISSION (line 289), whose residuals R1-R4 do not include it. It is
NOT filed. It is PRE-EXISTING (reachable today via `prepareChatSubmissionAction`'s
URL branch, `grading-chat-intake.ts:235-237`), but FIX-4 adds a second reach (the
route folding a caller-supplied `submissionUrl`). Owned here as RES-BZ-7 with the
regex instrument; the orchestrator must FILE it (this scope cannot).

### What stays unchanged

SSRF posture (GitHub/vscode.dev only, Drive noted-not-fetched, other hosts noted;
`extraction.ts:489-500`). Per-entry failure isolation (`foldGithubRepoContent`
never throws, `:473-476`). The Canvas path (`canvasWorkToEntry`) folds at its own
ingest and is OUT of scope; its `extraction.test.ts` oracle stays green.
`zip-link-resolution.test.ts`'s "resolves before grouping" expectations INVERT
deliberately in BW3 (the removal-test pair I4/I5).

---

## 5. SECURITY section (folded, re-verified against the tree)

Ranked by blast radius. Each traced to code, not to this doc.

1. **S1/S5 zip-bomb: RESOLVED by BW0 (reused).** `extraction.ts` routes every
   level through `zip-caps.ts`'s `chargeArchiveLevel` + bounded reads
   (`:87,103,112,124`); `office-extract.ts` routes docx/pptx/xlsx through
   `assertContainerWithinCaps` + `readOfficeMember`. Moving bulk zips off the body
   cap removed the incidental size limit the cap provided, and BW0 is exactly what
   replaces it. The bulk ingest inherits the caps with no new code. (The cap
   VALUES vs the real Vercel memory ceiling and the real 13 MB zip are owner-walks
   - ZIP-BOMB-CAPS R1/R2.)
2. **S2 guard-first on the ingest.** The ingest is a ROUTE HANDLER, so the
   instrument is a ROUTE TEST: an unauthenticated POST gets 401 before the body is
   read (`requireAppOwner()` first, copy `grade-run-item/route.ts:161-165`), NOT
   the OWNER_ONLY action-guard list (which only sees `"use server"` exports).
   `requireOwner()` is a deprecated alias for `requireUser()` - do not use it.
3. **S3 storage path confusion.** Use the cookie client + `withUploadedSyllabusFile`;
   add `"grading-uploads"` to `UPLOAD_PATH_SEGMENTS`; build the path ONLY via
   `syllabusUploadStoragePath(userId, uuid, ".zip", "grading-uploads")`; and BIND
   the segment on BOTH sides, in BW1, before any Storage call (section 2): the
   grading ingest asserts `segments[1] === "grading-uploads"`, and
   `extractSyllabusTextAction` (`syllabus-upload.ts:227-246`) asserts
   `segments[1] in {"syllabus-uploads","rubric-uploads"}` (refusing `"grading-uploads"`;
   it serves the rubric upload too, `RubricInputModal.tsx:207`). The compensating
   bind MUST land in the same wave that widens the union, or `extractSyllabusTextAction`
   begins accepting grading paths the instant BW1 lands - a same-uid defence-in-depth
   regression that ships green. Do NOT hand-roll download/delete; do NOT use
   `uploadCourseZip`.
4. **S4 server-side size check before download.** Do not trust the client 25 MB
   preflight; the route re-checks the stored object's size before extraction.
5. **S6 per-student oversize + the skip partition.** One oversized student becomes
   one NDJSON skip line with a named reason (section 3), reconciled with R5's
   ledger; never a whole-call refusal. The wire check counts the RIGHT unit -
   `estimateEntryWireBytes` (wire bytes), not file bytes (the class
   `upload-budget.ts` warns about).
6. **S7 cleanup + orphan sweep.** Adding `"grading-uploads"` to
   `UPLOAD_PATH_SEGMENTS` makes the sweep cover it AUTOMATICALLY (the sweep imports
   that array, `orphan-upload-sweep.ts:27,76`, and loops it, `:353`). Replace the
   previous draft's tautological I8 with a REAL test (section 8, I8).
7. **S8 FIX-4 link defer.** ONE shared `resolveEntryLinks` export so the route
   cannot grow a looser path; `parseRequestBody` validates the new `submissionUrl`
   against the same GitHub/vscode.dev allowlist, never a raw fetch. PLUS the
   pre-existing, UNFILED `parseSubmissionGithubUrl` owner/repo traversal
   (RES-BZ-7, section 4).
8. **S9 PII/log hygiene.** Log decomposed `{userId, segment, uploadId}`, never
   names/paths/raw messages - the pattern `withUploadedSyllabusFile` already uses
   (`syllabus-upload-source.ts:195-199`) and the cron sweep uses. The recorded
   DIAGNOSTIC error is a FIXED class, never raw collision/refusal text (R8).
9. **CSRF floor** on both routes is unchanged (JSON content-type required).

---

## 6. RELIABILITY section (folded, re-verified)

1. **R1 extraction budget (HIGHEST).** The transport solves the body cap, not the
   clock. The ingest downloads + runs `extractSubmissions` (PDF via `OfficeParser`,
   OOXML docx parse, base64 of every image) in ONE invocation. Design: the route
   declares `maxDuration = 60` and an EXTRACTION soft budget of ~35-40 s (NOT 50 s
   - the stream write must fit under 60 s after extraction), returning a worded
   `{"done":true,"error":...}` sentinel instead of a silent platform kill (which
   cannot be intercepted). Whether a realistic bulk zip extracts under the budget
   is UNMEASURABLE here (no live Storage, no 60 s timer) - owner-walk RES-BZ-2.
2. **R2 Route Handler, not Server Action.** A Server Action cannot set
   `maxDuration` and head-of-line-blocks the page. The ingest is
   `src/app/api/grade-submission-zip/route.ts` with the soft-budget-under-hard-cap
   shape copied from `grade-run-item/route.ts:39,51,192-204` (`raceWithTimeout` +
   `TOTAL_BUDGET_MS`). The instrument that it stays under the cap is the route
   test's `checkSoftBudgetUnderCap` source-text predicate shape (section 8, I-budget).
3. **R3 never-throw client wrapper.** Section 3; lifecycle test with an injected
   rejecting ingest returns `refused` with `dispatchedCount` unchanged.
4. **R4 stale-session guard.** `submit` captures `sessionIdRef` at start and drops
   an arriving entry if it changed after the await; the UI disables "New session"
   (`handleNewSession`, `GradingChatPanel.tsx:167`) while `preparing` is true
   (BW1). Prevents a reset mid-upload spending ~26 Gemini calls on a ghost run.
5. **R5 the M-of-N ledger.** The terminal NDJSON line returns
   `failedSupportedFiles` + `studentsFound` vs `studentsEmitted` + the skip list;
   BW4 renders it. (A `nestedZipFailures` count is NOT in the sentinel for BW2 -
   it needs an `extraction.ts` edit outside BW2's write set, deferred to
   NESTED-ZIP-SILENT-SKIP / RES-BZ-9.) The pump already isolates one
   item's transport failure into one ungraded row (`classifyItemFailure`,
   `incrementalRunPlan.ts:204`; the `.finally` wedge fix,
   `useContinuousGradingRun.ts:232-239`) and supports retry/regrade. A bulk run
   where M of N students fail leaves N-M graded rows plus M named failures/skips,
   each retryable.
6. **R6 the soft budget covers download + inference + serial link pulls.** The
   download reuses `downloadCourseZipBlob`'s retry/backoff (`course-files.ts:284`),
   either by injecting a retrying `download` into the lifecycle's storage client
   (recommended) or calling it inside `consume`; extraction already has a bounded
   pool (BW0's `runBounded`, `zip-caps.ts:531`). With FIX-4 deferring link pulls to
   grade-time, the ingest's budget no longer covers the serial GitHub fetches -
   another reason FIX-4 is on the bulk path. Data/reliability seat settles the
   download-retry placement in BW2.
7. **R7 rollback keeps the swept union.** A revert must keep `"grading-uploads"` in
   `UPLOAD_PATH_SEGMENTS` until a sweep tick has drained every stored grading
   object; reverting the union line strands those objects permanently (the sweep
   would never list that segment again). Section 7.
8. **R8 fixed-class diagnostic.** The recorded diagnostic error is a FIXED class
   via the EXISTING `classifyChatSeamFailure` (`chatSeamDiagnostic.ts:31`), never
   the raw collision/refusal text (which embeds student names). The classifier
   already has `"cap exceeded"`, `"too large"`, `"interrupted"`, `"timed out"`
   classes (`CHAT_SEAM_FAILURE_CLASSES`, `:15-25`) that cover a zip-bomb refusal
   and a missing-sentinel interruption.
9. **R9 observability.** A started/stage/finished log bracket with a per-request
   token (counts only, no PII). GRADING-DIAGNOSTICS-COVERAGE is COMPLETE on main
   (all four waves shipped; the grading surface + `chatSeamDiagnostic` leaf exist).
   Corrected from the brief: `"prepare_submission"` ALREADY exists in
   `ChatSeamOperation` (`chatSeamDiagnostic.ts:13`) and is reused; only
   `"upload_zip"` is a NEW operation to add to the existing `"grading"` surface -
   do NOT make a new surface.
10. **R10 client delete-on-reject is a courtesy.** It cannot cover a tab-close; the
    sweep is the guarantee (S7).
11. **R11 idempotency on re-run.** A re-dropped zip after a `reset()` grades
    cleanly (new session, new `sessionId`); the first upload's object is cleaned by
    the lifecycle/sweep. Confirm, do not assume.
12. **R12 session ceiling 40.** A bulk zip over 40 students is clipped by the
    existing `maxEntries` logic (`useContinuousGradingRun.ts:356-364`, the
    `"partial"` SubmitOutcome). Product residual RES-BZ-8.

---

## 7. What is NOT trivially revertible (architect's required flag)

- **The `"grading-uploads"` path segment.** NO migration (the bucket + policies
  exist), so the code change is a one-line union addition and is revertible - BUT
  any object already uploaded under the new segment outlives the revert until the
  sweep collects it, and reverting the union line BEFORE the sweep drains it
  strands those objects permanently (R7). Keep the union member until a sweep tick
  has run.
- **The `/api/grade-run-item` route accepting `submissionUrl` and folding at
  grade-time (FIX-4).** Changes a live production route's body contract and its
  network behaviour. A revert must also restore `ingestZipEntries`' inline
  `resolveLinkSubmissions` call, or link submissions grade against a bare note.
  Smallest safe revert touches `extraction.ts` (shared) + `route.ts` (shared)
  together - NOT small.
- **A new client transport + a new live Route Handler** is net-new reachable
  surface, not a config flip.

---

## 8. Machine-checkable vs owner-walk split (instruments)

**Machine-checkable (vitest; `environment: node`, network blocked - mock the
Storage client / `downloadCourseZipBlob` / `fetchGradableRepoContent`, NEVER real
`fetch`). Run named sets with `npm run test:paths <p1> <p2> ...`, never a raw
multi-path vitest. Every wave gate carries `file-size-ceiling.structure.test.ts`
unconditionally.**

For each instrument: object under comparison / instrument / direction of failure.

- **I-stream-parse (BW2).** Object: the never-throw NDJSON client wrapper. Instr:
  feed it a byte stream of N `"entry"` lines + sentinel -> N `onEntry` calls and a
  resolved ledger; feed it N lines with NO sentinel -> `{kind:"refused", reason}`
  naming K-of-M; feed it a non-NDJSON body / a 401 -> `{kind:"refused"}`. FAILS RED
  if a missing sentinel is treated as complete, or any input throws.
- **I-never-throw (BW2, R3).** Object: the driver `submit({kind:"storaged-zip"})`.
  Instr: inject a rejecting ingest; assert the call resolves `refused` and
  `dispatchedCount` is unchanged. RED if it throws or advances `dispatchedCount`.
- **I-partition (BW2, S6/R5).** Object: the route's partition over extracted
  entries. Instr: a set with one over-budget entry (by `estimateEntryWireBytes`)
  yields N-1 `"entry"` lines + one `"skip"` line + a sentinel listing it. RED if
  one oversized entry refuses the whole call, or is silently dropped with no skip
  line.
- **I-budget (BW2, R1/R2).** Object: the new route's source. Instr: copy
  `grade-run-item/route.test.ts`'s `checkSoftBudgetUnderCap`/`checkAuthOrder`/
  `checkCsrfFloor` source-text predicates (RULING 41, one fixture per check) over
  `grade-submission-zip/route.ts`: `maxDuration` present, `TOTAL_BUDGET_MS <
  maxDuration*1000`, `requireAppOwner()` before the first Storage/extract call,
  content-type check before body parse. RED if the soft budget is not strictly
  under the hard cap, or the guard is not first.
- **I-guard-route (BW2, S2).** Object: the route handler. Instr: a route test -
  an unauthenticated POST returns 401 and NO Storage call is made. RED if the body
  is read or a download happens before `requireAppOwner()` throws.
- **I-path-bind (BW1/BW2, S3).** Object: the grading ingest's path handling. Instr:
  a cross-segment path (`${userId}/syllabus-uploads/x.zip`) and a traversal path are
  refused before any Storage call (`isKnownUploadPath` + the `segments[1] ===
  "grading-uploads"` bind). RED if a syllabus/rubric path, a foreign-uid path, or
  a `../`-walking path reaches the fake Storage client. Reuse
  `syllabus-upload-source.test.ts`'s own validator cases.
- **I-syllabus-segment-bind (BW1, S3 blocker).** Object: `extractSyllabusTextAction`
  (`syllabus-upload.ts:227-246`). Instr: drive it with a `${userId}/grading-uploads/x.zip`
  path (fake Storage client) and assert it refuses BEFORE any `download`/`remove`
  call, while a `syllabus-uploads` and a `rubric-uploads` path still reach the
  lifecycle. RED if a `grading-uploads` path reaches the Storage client (the
  defence-in-depth regression BW1 would otherwise ship), or if the bind also refuses
  the legitimate `rubric-uploads` reuse.
- **I-sweep-lists-segment (BW1, S7 - replaces the tautological I8).** Object: the
  sweep's enumeration. Instr: drive `sweepOrphanUploads` (`orphan-upload-sweep.ts:286`)
  with a fake `OrphanSweepLister` that records every `path` passed to `listPage`,
  one user prefix, and assert `${userId}/grading-uploads` is among the recorded
  paths. RED if the sweep never lists the grading segment. (NOT a test that
  `"grading-uploads" in UPLOAD_PATH_SEGMENTS` - that is tautological, since both the
  upload side and the sweep read the same array.)
- **I-size-check (BW2, S4).** Object: the route's pre-download size gate. Instr: a
  stored object reported over 25 MB is refused with a worded message before
  download/extract. RED if an over-ceiling object is downloaded.
- **I-fix4-not-at-ingest (BW3, removal pair with I-fix4-at-grade).** Object:
  `ingestZipEntries` output. Instr: a GitHub `*_link.html` zip through
  `ingestZipEntries` leaves `fetchGradableRepoContent` NOT called and the entry
  carries `submissionUrl` + the bare note. RED if the repo is fetched during
  ingest. Extend `zip-link-resolution.test.ts`.
- **I-fix4-at-grade (BW3).** Object: `resolveEntryLinks` (route + whole-run action
  call). Instr: driving the enrich step calls the mocked repo fetch and folds code
  into `entry.content`. RED if the link never resolves at grade time. I-fix4-* are
  the removal pair for "resolution moved, not deleted".
- **I-submissionurl-validated (BW3, S8).** Object: `route.ts parseRequestBody`.
  Instr: a `submissionUrl` on a non-allowlisted host is rejected (400) or not
  fetched. RED if a raw non-GitHub URL is fetched.
- **I-regression.** Keep green via `npm run test:paths -- <paths>`:
  `extraction.test.ts`, `zip-link-resolution.test.ts`,
  `extraction.inference.test.ts`, `ingestion-attribution.oracle.test.ts`,
  `collisionRefusal.wiring.test.ts`, `grouping-zip-parents.wiring.test.ts`,
  `rubric-stamp.wiring.test.ts`, `grading-chat-intake.test.ts`,
  `useContinuousGradingRun.lifecycle.test.ts`, `incrementalRunPlan.test.ts`,
  `course-files.test.ts`, `orphan-upload-sweep.test.ts`,
  `syllabus-upload-source.test.ts`, `chatSeamDiagnostic.test.ts`, and the
  `grade-run-item` route test, plus `file-size-ceiling.structure.test.ts`
  unconditionally.

**Owner-walk ONLY (no component renders under vitest; no live Storage / network /
60 s timer here):**

- RES-BZ-1: the live 12-13 MB upload to Storage and the end-to-end grade of the
  owner's ~26-file zip on prod (needs real Storage, a browser, a prod tick).
- RES-BZ-2: whether extraction of a realistic bulk zip completes under the ~35-40 s
  soft budget (R1).
- The FELT behaviour: upload returns fast, rows stream, the N-of-M indicator
  counts up. No test observes wall-clock or a rendered indicator.

---

## 9. Disposition of the prior scope's requirements

Re-derived against this restructuring. ID column re-derived LAST, after the
renumbering below.

| Prior item | Disposition | Where it goes |
|---|---|---|
| FIX-1 (client pre-flight + honest failure) | KEPT, made transport-aware | W1 here: a large zip routes to Storage instead of being refused; small zips keep the FIX-1 refusal unchanged |
| FIX-2 transport (Storage upload + server read) | KEPT, deepened | BW1-BW2 (section 2-3) |
| FIX-2 progressive grading via `INCREMENTAL_ROUTE_ENABLED` + RULING 116 | WITHDRAWN for this item | The chat pump already streams and already closes the gaps (section 1); GradingTab's route stays gated. No enforcer deleted - nothing on the bulk path depends on that route |
| FIX-3 (fast-fail extraction guards) | KEPT, re-homed and SHIPPED | Became ZIP-BOMB-CAPS (BW0, `9d3933fb`/`5150961f`); reused, not re-scoped (section 0) |
| FIX-4 (defer link resolution) | KEPT | BW3 (section 4) |
| Prior draft's `prepareStoragedZipSubmissionAction` (Server Action) | WITHDRAWN | Replaced by the streaming Route Handler (section 3). Reason: a Server Action cannot `maxDuration`, head-of-line-blocks the page, and cannot stream a per-student partition - R1/R2 |
| Prior draft's `isOwnCourseFilesStoragePath` as the sink guard | WITHDRAWN | Replaced by `isKnownUploadPath` (the syllabus lifecycle's own guard) + the segment bind - the correct validator for this path shape (section 2) |
| The compensating bind on `extractSyllabusTextAction` | KEPT, OWNED by BW1 | `src/app/actions/syllabus-upload.ts` is in BW1's write set (not handed off as an obligation): the bind that refuses `"grading-uploads"` lands in the SAME wave that widens `UPLOAD_PATH_SEGMENTS`. Instrument I-syllabus-segment-bind; residual RES-BZ-10 |
| Prior "zip-bomb caps MUST be designed" (old security #3 / RES-BZ-3) | WITHDRAWN (discharged) | Shipped as BW0; inherited, not re-owned |
| Old W3 (Storage transport wave) | KEPT -> BW1/BW2 | Split into client-upload (BW1) and server-stream (BW2) |
| Old W4 (progressive via GradingTab) | WITHDRAWN | Superseded by the chat pump (section 1) |
| RES-LAG-2 (serial GitHub link fetch blocks ingest) | CARRIED -> resolved by BW3 | Instrument I-fix4-*; origin `05a2ff49` |
| RES-LAG-4/5 (platform ceiling, N15 cross-ref) | CARRIED | Platform ceiling addressed by the transport; N15 cross-ref in RES-BZ-6 |

---

## 10. Multi-wave plan (disjoint by write set within this item)

Wave gate: `git status --short` against each wave's file list (MEMORY:
wave-gate-git-status), plus the `.claude/worktrees` shadow check (MEMORY:
stale-worktree-shadows-glob), plus `file-size-ceiling.structure.test.ts`
unconditionally.

**Design seats BEFORE build (regenerate briefs between waves):**
- Wave-1 design: this architecture pass (done) + reuse survey (done, section 2) +
  **data/storage seat** (the `grading-uploads` segment, the cleanup lifecycle,
  retention of an abandoned upload, the download-retry placement R6) +
  external-facts (confirm Route Handler `maxDuration` behaviour on this Vercel
  deployment) + baseline (`docs/REGRESSION.md` for the grading-chat intake + the
  grade-run-item route, `grep -a`).
- Wave-2 design: **security seat** (section 5) + **reliability seat** (section 6) +
  operability/admin (the sweep segment, the owner's view of N-of-M + skips).
- Wave-3 design: UX (the drop-a-zip flow, the skip-ledger + progress copy, click
  count first-use vs repeat) + visual + a11y (reading claims - no render here).
- AC + Test seat always. AC owns the LEVERAGE CLAIM (section 11); the test seat
  owns the removal pair I-fix4-* and the instruments in section 8.

**Build waves (disjoint write sets):**

- **BW1 - client transport + preflight + stale-session UI + the paired segment
  binds.** Owns: `GradingChatPanel.tsx` (make `handleSubmitFiles`/the preflight
  branch transport-aware: a zip over the body-safe threshold uploads to Storage and
  calls the ingest instead of being refused; disable "New session" while
  `preparing`; client delete-on-reject courtesy), a NEW client upload-to-Storage
  leaf (reuses the `SyllabusUploadControl` pattern; no edit to `course-files.ts`
  beyond possibly a thin grading-path wrapper), `"grading-uploads"` added to
  `UPLOAD_PATH_SEGMENTS` in `syllabus-upload-source.ts`, the `ChatSubmissionInput`
  `"storaged-zip"` member in `chatSubmissionIntake.ts`, **and
  `src/app/actions/syllabus-upload.ts` - the compensating bind refusing
  `"grading-uploads"` in `extractSyllabusTextAction` (`:227-246`), landing in the
  SAME wave that widens the union so the bind lands with the exposure**. Instruments:
  I-path-bind (client half), I-sweep-lists-segment, I-syllabus-segment-bind.
  Independently reviewable; not user-reachable until BW2 provides the server stream.
- **BW2 - streaming Route Handler ingest + never-throw parser + driver wiring.**
  Owns: `src/app/api/grade-submission-zip/route.ts` + `route.test.ts` (the
  `requireAppOwner`-first guard, the CSRF floor, the segment bind, the S4 size
  check, the soft budget, `withUploadedSyllabusFile` + `extractStudentEntries`,
  the NDJSON partition + sentinel), the never-throw client parser leaf, and the
  driver's `"storaged-zip"` submit path + sessionId guard in
  `useContinuousGradingRun.ts`. Instruments: I-stream-parse, I-never-throw,
  I-partition, I-budget, I-guard-route, I-size-check. **Security + reliability seat
  passes land on this wave.** Depends on BW1's path. `grading.ts` is NOT touched.
- **BW3 - FIX-4 grade-time link defer.** Owns: `extraction.ts` (`ingestZipEntries`
  stops calling `resolveLinkSubmissions`; export ONE `resolveEntryLinks`),
  `route.ts` (accept + validate `submissionUrl`, fold before `gradeEntries`), the
  whole-run enrichment call in `grading.ts` (SMALL; extract first if it would pass
  1000), and `zip-link-resolution.test.ts` (expectations invert). Instruments:
  I-fix4-not-at-ingest, I-fix4-at-grade, I-submissionurl-validated. **Shares
  `extraction.ts` + `route.ts` with BW2, so BW3 is SEQUENCED AFTER BW2.**
- **BW4 - UI: skip ledger + progress.** Owns: the grading-chat skip-ledger + N-of-M
  partial-failure copy (`GradingChatPanel.tsx` and/or a results leaf), reusing the
  INFER-FLAG `unresolvedStudents` flagged-set rendering idiom (shipped). UX + visual
  + a11y follow-up. Owner-walk is final acceptance.

Internal ordering: BW1 -> BW2 (needs BW1's path) -> BW3 (shares `extraction.ts`/
`route.ts` with BW2) -> BW4 (polish on the as-built). BW1/BW2/BW3 are NOT disjoint
from each other, so this item runs its waves in SEQUENCE; a different backlog item
with a disjoint file set may run concurrently (section 12).

---

## 11. The leverage claim (architect records the fired trigger; AC seat owns the claim)

Trigger fired: this item builds a capability a user reaches (not a bug fix). The
honest classes, from `docs/loop/leverage.md`: **SCALE** (one frozen rubric/criteria
pair held constant across N students - `engine.ts`'s `gradeStudentEntries`, capped
at `DEFAULT_MAX_SUBMISSIONS = 40`) and **ATTRIBUTION** (per-student identity by
construction - the A44 collision refusal + disambiguation the zip ingest runs,
`collisionRefusal.ts` + `extraction.ts:231-234`). A chat window cannot ingest a
13 MB / 26-file zip at all, cannot hold a batch together under one rubric, and
cannot stream per-student rows past a 60 s wall. CONCURRENCY (A46) is touched - rows
stream as each student finishes - but the human is not the transport here (the zip
delivers all inputs at once), so SCALE/ATTRIBUTION are the EARNED claims.

The CLAIM and its single removal test belong to the AC + test seats. The buildable
removal test is most likely I-fix4-shaped (observable by deletion) OR an ATTRIBUTION
assertion over the streamed partition; the FELT advantage (fast upload, streaming
rows) has NO buildable removal test here (no component renders) - owner-walk
RES-BZ-1. The architect does not default the three-way call (redesign / accept-cost
/ reject); recorded for the AC seat and the owner.

---

## 12. Serialization flags (confirmed against the tree)

- **BW0 (ZIP-BOMB-CAPS) is COMPLETE** (W1 `9d3933fb`, W2 `5150961f`). It edited
  `extraction.ts` + `office-extract.ts`; those edits are SHIPPED, so BW2/BW3 (which
  also touch `extraction.ts`) have NO live conflict with BW0 - they build ON it.
  Confirmed: `extraction.ts` already imports from `zip-caps.ts` (`:20-28`).
- **GRADING-DIAGNOSTICS-COVERAGE is COMPLETE** (all four waves). The `"grading"`
  diagnostic surface + `chatSeamDiagnostic.ts` classifier are shipped; R8/R9 reuse
  them (add only `"upload_zip"`; reuse the existing `"prepare_submission"`).
- **INFER-FLAG is COMPLETE** (`71e99a4a`, `3b22ebc6`). Its row records a "4-file
  intersection with BULK-ZIP" (the driver + GradingResults tail + grading-chat-intake).
  Because INFER-FLAG is SHIPPED, this is a COORDINATE-not-conflict: BW2/BW4 inherit
  `studentNameSource` on `StudentSubmissionEntry` and the `unresolvedStudents`
  flagged-set idiom, and BW4 reuses that render idiom for the skip ledger.
- **Presentations pipeline work is DISJOINT from grading-chat.** PRESENTATIONS-PIPELINE
  (W1 shipped `2bd10b65`) and its regen sub-view (`docs/presentations-pipeline-regen-subview-scope.md`,
  a `presentationsView` child) edit presentations files; PRESENTATIONS-TEMPLATE
  IMPORTS `zip-caps.ts` office primitives but does not edit them. None of that
  intersects BULK-ZIP's write set (grading-chat + `extraction.ts` + `route.ts` +
  `syllabus-upload-source.ts`). Confirmed by path area; the precise write sets live
  in those scope docs. The ONLY shared read is `zip-caps.ts` (read-only in both),
  which is not a write conflict.

---

## 13. Residual register (owner / instrument / step - else it is a deletion)

Each must be filed in `docs/BACKLOG.md` to exist. **Measured gap the orchestrator
must act on: there is NO standalone `| BULK-ZIP |` row in `docs/BACKLOG.md` today**
(searched 2026-10-08: `| BULK-ZIP |` returns zero matches; BULK-ZIP is referenced
only as a forward dependency inside ZIP-UPLOAD-LAG, ZIP-BOMB-CAPS,
NESTED-ZIP-SILENT-SKIP, GRADING-DIAGNOSTICS, INFER-FLAG). The ZIP-UPLOAD-LAG row
(line 223) says FORK 1 resolved to "build full bulk-zip support -> tracked as the
separate BULK-ZIP item", but that item has no row. The orchestrator must file the
BULK-ZIP row (owner=me) and these residuals; this scope cannot create them.

- **RES-BZ-1 (owner-walk):** end-to-end grade of the owner's 12-13 MB / ~26-file
  zip on prod. Owner: repo owner. Instrument: owner-walk (live Storage + browser +
  prod tick). Step: after BW1-BW4, owner drops the real zip and reports.
- **RES-BZ-2 (reliability, measurement):** whether extraction of a realistic bulk
  zip completes under the ~35-40 s soft budget. Owner: reliability seat + owner.
  Instrument: the soft-budget worded sentinel (I-budget) for the agent half;
  wall-clock for the owner half. Step: BW2 declares the budget; owner confirms on
  prod.
- **RES-BZ-3 (reliability, measurement):** the download-retry placement under the
  soft budget (R6). Owner: data/reliability seat. Instrument: a node-env test that
  a retrying `download` is called within budget. Step: BW2 settles inject-vs-call.
- **RES-BZ-4 (reliability):** per-student oversized-entry handling vs
  N15-PHOTO-DOWNSCALE. Owner: reliability + UX seats. Instrument: I-partition.
  Step: BW2 emits skip lines; cross-reference N15-PHOTO-DOWNSCALE (do not duplicate).
- **RES-BZ-5 (enrichment absence):** `fullCreditChecklist`/`sampleAnswer`/
  `speedGraderUrl` are whole-run enrichments the chat surface omits
  (`buildIncrementalRun` sets them from `tier2`, `incrementalRunPlan.ts:274-276`);
  the bulk path inherits the omission. Owner: owner (product). Instrument:
  owner-walk. Step: record; do not silently add.
- **RES-BZ-6 (reliability, carried from RES-LAG):** N15-PHOTO-DOWNSCALE
  cross-reference - a client image downscale would keep a photo-heavy student under
  the per-entry budget. Owner: N15 owner. Instrument: N15's own. Step: do not
  duplicate; cross-link.
- **RES-BZ-7 (security, PRE-EXISTING + UNFILED):** `parseSubmissionGithubUrl`
  (`submission-repo.ts:77-78`) does not validate owner/repo against
  `^[A-Za-z0-9_.-]+$`; a decoded `..` or embedded `/` can reach the GitHub API path.
  Reachable today via the chat URL branch; FIX-4 adds a route reach. Owner: security
  seat (BW3). Instrument: a parser test rejecting a traversal owner/repo. Step:
  add the regex guard in BW3; the orchestrator FILES this as its own row (the brief's
  "already filed" premise was MEASURED FALSE).
- **RES-BZ-8 (product):** bulk zip over the 40-student session ceiling is clipped
  (R12). Owner: owner (product). Instrument: the existing `"partial"` SubmitOutcome
  path. Step: record; the worded remainder already ships.
- **RES-BZ-9 (reliability, carried):** NESTED-ZIP-SILENT-SKIP - a corrupt nested
  zip is swallowed (`extraction.ts:166-169`) with no per-student row. Already filed
  (BACKLOG line 218) and explicitly coordinated with "BULK-ZIP BW2 owns the typed
  skip field + the M-of-N ledger UI". Owner: that row. Instrument: a per-student
  skip note. Step: BW2's skip partition is the surface it needs; BW2 should emit a
  skip line for a swallowed nested zip rather than dropping it silently. (BW2's
  sentinel does NOT carry `nestedZipFailures` until this row ships - M2.)
- **RES-BZ-10 (security, the segment-bind blocker):** `extractSyllabusTextAction`
  (`syllabus-upload.ts:227-246`) validates only via `isKnownUploadPath` (union
  membership), so widening `UPLOAD_PATH_SEGMENTS` with `"grading-uploads"` makes it
  accept a grading path within the caller's own uid prefix (same-uid defence-in-depth
  regression). Owner: security seat (BW1). Instrument: I-syllabus-segment-bind.
  Step: in BW1, the SAME wave that widens the union, add the `segments[1] in
  {"syllabus-uploads","rubric-uploads"}` bind to `extractSyllabusTextAction` before
  any Storage call.

---

## 14. `owns` / files cited (all opened in this revision)

Candidate write-set command (files a build wave edits OR reads as source text, so
a change can turn a test red without a behaviour change):

```
grep -rl "prepareChatSubmissionAction\|useContinuousGradingRun\|/api/grade-run-item\|ingestZipEntries\|resolveLinkSubmissions\|isKnownUploadPath\|UPLOAD_PATH_SEGMENTS\|estimateEntryWireBytes\|parseSubmissionGithubUrl\|withUploadedSyllabusFile" src/app src/lib
```

Read as source for this pass (all opened):
`src/lib/zip-caps.ts`, `src/lib/grade/extraction.ts`,
`src/app/actions/grading-chat-intake.ts`,
`src/app/components/grading-chat/useContinuousGradingRun.ts`,
`src/app/components/grading-chat/GradingChatPanel.tsx`,
`src/app/components/grading-chat/chatSubmissionIntake.ts`,
`src/app/components/grading-chat/chatSeamDiagnostic.ts`,
`src/app/api/grade-run-item/route.ts`,
`src/app/api/grade-run-item/route.test.ts`,
`src/lib/syllabus-upload-source.ts`,
`src/app/actions/syllabus-upload.ts` (`extractSyllabusTextAction:227-246`,
`requireOwner():231`; reused by `RubricInputModal.tsx:207`),
`src/lib/orphan-upload-sweep.ts`,
`src/lib/course-files.ts` (grep: `downloadCourseZipBlob:284`,
`isOwnCourseFilesStoragePath:135`, `uploadCourseZip:173`),
`src/lib/upload-budget.ts`, `src/lib/submission-repo.ts`,
`src/app/components/grading/incrementalRunPlan.ts`,
`src/app/actions/grading.ts` (size only), `docs/BACKLOG.md` (grep).

Tests that read these files AS SOURCE TEXT (include in every build wave's gate):
`extraction.test.ts`, `zip-link-resolution.test.ts`,
`extraction.inference.test.ts`, `ingestion-attribution.oracle.test.ts`,
`collisionRefusal.wiring.test.ts`, `grouping-zip-parents.wiring.test.ts`,
`rubric-stamp.wiring.test.ts`, `grading-chat-intake.test.ts`,
`useContinuousGradingRun.lifecycle.test.ts`, `incrementalRunPlan.test.ts`,
`course-files.test.ts`, `orphan-upload-sweep.test.ts`,
`syllabus-upload-source.test.ts`, `chatSeamDiagnostic.test.ts`,
the `grade-run-item` route test, and `file-size-ceiling.structure.test.ts`.

---

## 15. What the owner gets

The 12-13 MB submissions zip the FIX-1 preflight refuses today uploads to Supabase
Storage (off the request-body cap) and grades through the existing chat per-item
pump: rows stream in as each student finishes, under the frozen session rubric,
with oversized or failed or unreadable students surfaced as NAMED skips (not a
whole-run refusal), and the stored zip deleted on every path with the orphan sweep
as the backstop.
