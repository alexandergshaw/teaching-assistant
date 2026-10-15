# Zip-upload lag: RCA and fix scope

Owner report (chat, 2026-10-08): "uploading zips is just clocking/lagging."
Representative zip the owner supplied: 26 files, ~13 MB total - 11 .pdf, 10 .png,
3 .docx, 1 nested .zip, 2 `*_link.html` (the two links point to **Google Docs**
`docs.google.com/document/d/.../edit`, NOT GitHub). Base HEAD 08252c9a.

This scope was written from the tree, not from the attached diagnostic logs (the
logs only show a Canvas-auth `list_courses` failure; grading is not instrumented).
Every quantity below names the command that produced it. No production code was
written.

---

## 0. The headline, because it reframes the whole RCA

**For the owner's actual ~13 MB zip, the dominant cost is NOT extraction and NOT
the link fetch - it is the UPLOAD SIZE GATE that rejects the zip before any
extraction runs, with no client-side pre-flight, so the browser uploads ~13 MB
and then the request fails opaquely.** Extraction and link-fetch are real costs,
but they only bite a zip that *fits under the caps*, and the owner's zip does not.

This conflicts with the mid-task reframe that named synchronous extraction as the
primary cause. I measured both and am reporting the conflict rather than adopting
either silently (repo rule: when measurement and the owner disagree, state the
measurement). The measured gate chain below is the reconciliation.

### The measured gate chain (every interactive grading surface)

| Gate | Value | Source | A 13 MB zip |
|---|---|---|---|
| Next Server-Action body cap | `bodySizeLimit: "10mb"` | `next.config.ts:14` | **~13 MB body REJECTED by the framework** before the action body runs |
| Vercel platform body cap (prod) | ~4.5 MB | `src/lib/upload-budget.ts:38` (`VERCEL_BODY_LIMIT_BYTES`) | rejected even earlier on prod, regardless of `bodySizeLimit` |
| In-action wire budget | `UPLOAD_WIRE_BUDGET_BYTES = 3_670_016` wire bytes = **2_752_512 file bytes (~2.6 MB on disk)** | `upload-budget.ts:41`; `maxFileBytesForWireBudget()` `:65`; math: `node -e` / PowerShell `[math]::Floor(3.5*1024*1024/(4/3)) = 2752512` | `checkFileWireBudget(file.size)` returns `{ ok:false }` - but only if the body survived the body cap, which a 13 MB body does not |

So on a Server-Action surface a 13 MB zip never reaches `checkFileWireBudget`'s
friendly message (`bodySizeLimit` rejects the body first); the owner sees the
browser upload ~13 MB and then an opaque failure - which reads exactly as
"clocking/lagging". There is **no client-side pre-flight** on the grading file
inputs (confirmed below), so the full 13 MB is transmitted before anything
refuses it.

Independent corroboration already in the backlog: `N15-PHOTO-DOWNSCALE`
(`docs/BACKLOG.md`) records that a 3-5 MB phone photo "EXCEEDS
maxFileBytesForWireBudget() = 2752512 bytes, so N15 W3 ... REFUSES it" - the
identical gate, already a known pain point, with a client-side downscale filed as
the fix. A 13 MB zip is ~5x over that same gate.

**Consequence for the fix:** a size guard + clear message stops the clocking, but
it does not let the owner *grade* this zip. Grading a 13 MB / 14-office-doc zip at
all requires getting the bytes off the one Server-Action request body (Storage or
a streamed Route Handler) AND staying under the 60s `maxDuration`. That is the
real work, and it is an owner product decision (FORK 1).

---

## 1. Confirmed RCA, ranked by what bites the owner's zip

### Cause A (DOMINANT for the owner's zip): the upload size gate, no pre-flight

- All three interactive zip-ingest entry points are **Server Actions** and so are
  governed by `bodySizeLimit: "10mb"`:
  - `gradeAction` -> `checkFileWireBudget(file.size, ...)` at `src/app/actions/grading.ts:843`.
  - `prepareGradingRunAction` -> `checkFileWireBudget(file.size, ...)` at `src/app/actions/grading-incremental.ts:117`.
  - `prepareChatSubmissionAction` -> `resolveOnePart` -> `checkFileWireBudget(file.size, "This file")` at `src/app/actions/grading-chat-intake.ts:175`.
- Client inputs have **no size pre-flight**:
  - GradingTab zip input: `<input type="file" accept={STUDENT_SUBMISSIONS_ACCEPT}>` (`src/app/components/GradingTab.tsx:369-370`, accept list at `:59`) - no `file.size` check before submit.
  - Chat composer: `<input ref={fileInputRef} type="file" multiple ...>` (`src/app/components/grading-chat/ChatComposer.tsx:229`) - no `accept`, no size check; `grep -n "wireBytes\|checkFileWireBudget" src/app/components/grading-chat/ChatComposer.tsx` -> no matches.
- Net: the 13 MB upload is attempted in full, then rejected by `bodySizeLimit`
  (framework) / the Vercel 4.5 MB cap (prod). The hand-written friendly refusal
  never fires. **This is the clocking.**

### Cause B (DOMINANT for any zip that FITS the caps): blocking whole-run, no progressive rows

- The incremental/per-student pool that would stream rows as each student finishes
  is **BUILT AND DISABLED**: `INCREMENTAL_ROUTE_ENABLED = false`
  (`src/app/components/grading/incrementalRunPlan.ts:110`; `routeGradingRun` early-returns
  `"whole-run"` at `:132`). RULING 116 (same file `:94-109`) gates it off until a
  shape decision lands.
- So GradingTab always takes the single blocking `gradeAction`. During ingest it
  shows one indeterminate state - `<p className={styles.loadingTitle}>Grading In
  Progress</p>` (`GradingTab.tsx:301`) and a disabled "Grading..." button (`:493`)
  - and renders NO row until the one Server Action returns the entire run. For N
  students this blocks on: extraction of all files + N sequential model calls +
  `DEFAULT_INTER_REQUEST_DELAY_MS = 1200` (`src/lib/gemini.ts:67`) of sleep between
  each (`engine.ts:481-483`). At even 20 students that is >=1.2s x 19 of pure sleep
  plus 20 model latencies with zero feedback - felt as "lagging" independent of zip
  size. This is the CONCURRENCY gap already filed as A46 (`docs/loop/leverage.md:42`).

### Cause C (real, but only for a zip under the caps): synchronous extraction

- `ingestZipEntries` (`extraction.ts:172`) runs `extractSubmissions` (`:181`)
  synchronously before returning any entry. `extractSubmissions` -> `collectFromZip`
  (`:70-133`) does, before resolving:
  - office/PDF text extraction for every `.docx`/`.pdf` via
    `extractTextFromFile` -> `extractTextFromBuffer` (`office-extract.ts:179`) ->
    `OfficeParser.parseOffice` (`:214`) for PDFs, bespoke OOXML XML parsing for docx
    (`:106-122`). CPU-bound; `collectFromZip` wraps the entries in `Promise.all`
    (`extraction.ts:76`) but PDF/XML parsing is CPU work on the single Node thread,
    so it does NOT truly parallelize - it interleaves at best.
  - base64 encode of every image AND every supported file's raw bytes
    (`:109`, `:120`) for the vision grader - 10 PNGs + 14 office docs here.
  - nested-zip recursion (`:85-94`, `MAX_NESTED_ZIP_DEPTH = 3`, `types.ts:3`).
- All of this is inside the ONE serverless invocation under the Vercel Hobby **60s
  `maxDuration`** (MEMORY: deployment-vercel-hobby). A heavy-but-under-cap zip can
  approach or exceed 60s and be killed with no worded response (the platform kill
  cannot be intercepted - same reasoning as `src/app/api/grade-run-item/route.ts:42-51`).

### Cause D (SECONDARY regression, does not bite THIS zip): serial link resolution

- `ingestZipEntries` calls `await resolveLinkSubmissions(submissions, rawData)`
  (`extraction.ts:196`) synchronously before grouping. `resolveLinkSubmissions`
  (`:470`) is a sequential `for` loop (`:474`); each `*_link.html` whose body
  carries the Canvas URL marker awaits `resolveSubmittedLink` (`:448`) ->
  `foldGithubRepoContent` (`:401`) -> `fetchGradableRepoContent`
  (`repo-content.ts:55`), a full GitHub pull: `getRepo` + `listCommits` +
  `getRepoTree` + up to `MAX_SUBMISSION_REPO_FILES` `getFileText` calls.
- This blocks ingest on N serial remote pulls - a genuine regression shipped this
  session at `05a2ff49` (`git show -s --format="%h %s" 05a2ff49` =
  `feat(ZIP-LINK-SUBMISSION): open Canvas URL submissions inside a grading zip`).
  The sequential choice is deliberate (the `:465-468` comment).
- **But it does not bite the owner's zip:** the 2 links are Google Docs, and
  `resolveSubmittedLink` only fetches GitHub/vscode.dev hosts; a Drive/Docs URL is
  left as a NOTE with no fetch (`:453-456`). `grep`-proven by
  `src/lib/grade/zip-link-resolution.test.ts:94-104` ("a Google Drive link is
  detected, noted, and not fetched"). So link resolution does ~zero remote work
  for this zip. Still worth deferring (Cause D fix below); it compounds on any
  GitHub-link zip and parallelizes for free once per-student grading exists.

### Which surface is the owner using, and what it shows

Not determinable from the code alone - **all three surfaces gate identically**, so
no surface grades a 13 MB zip. The likely surface is **GradingTab's zip tool**
(the only batch "Upload ZIP" surface; its ingest state is the "Grading In Progress"
block at `GradingTab.tsx:301`). The chat surface additionally refuses any single
extracted entry over 3.5 MB wire (`firstOversizedEntryReason`,
`grading-chat-intake.ts:113-120`), so a Canvas bulk zip would not survive there
even if it fit the body cap. **OWNER-WALK required:** which page did you drop it on,
and did you see a spinner that never resolves, or a worded error? (Residual
RES-LAG-1.)

---

## 2. The fix - goal: upload returns FAST, and a real bulk zip can actually grade

The coordinator's A/B/C/D options map onto the measured causes. Reconciled and
ranked:

### FIX-1 (ship first, cheap): client pre-flight + honest failure  -> kills the clocking

- Add a client-side `file.size` pre-flight on BOTH grading file inputs using the
  existing `wireBytesForFile` / `maxFileBytesForWireBudget` (`upload-budget.ts`),
  mirroring the picture path (`src/app/components/grading/gradingPictureIngest.ts`
  already imports these). Refuse before upload with the budget message, so a too-big
  zip fails in <1s with "This zip is 13.0MB, limit 2.6MB..." instead of uploading
  13 MB and hanging.
- Ensure the server refusal / `bodySizeLimit` rejection is SURFACED, not swallowed:
  GradingTab shows `state.error` in `role="alert"` (`GradingTab.tsx:311-313`); the
  chat path returns `{ kind: "refused", reason }`. Confirm a `bodySizeLimit`
  rejection (a thrown action error, not a returned `{error}`) reaches these and
  does not leave "Grading In Progress" stuck (owner-walk RES-LAG-1 answers this).
- This does NOT let the owner grade the zip; it makes the failure fast and legible.
  Touches the UI surfaces only.

### FIX-2 (the real fix, owner product decision - FORK 1): ingest a bulk zip off the request body

To grade a 13 MB / 14-office-doc zip at all, two platform ceilings must be crossed:
the ~4.5 MB request-body cap and the 60s `maxDuration`. Neither can be raised by
config (`upload-budget.ts:5-11`; `maxDuration` is the platform's). So:

- Upload the zip to **Supabase Storage** from the client (direct, not through a
  Server-Action body), then grade server-side by reading from Storage - decoupling
  the file bytes from the request body entirely. (Precedent: this repo already
  stores uploads in Storage for other features; MEMORY: deployment + migrations.)
- Grade **progressively and per-student**: the machinery already exists -
  `/api/grade-run-item` (Route Handler, own 60s budget, `route.ts:38-51`),
  `useIncrementalGradingRun` / `useContinuousGradingRun`, and the pure plan leaf
  `incrementalRunPlan.ts`. Enabling the incremental route
  (`INCREMENTAL_ROUTE_ENABLED`) after closing RULING 116's shape gaps gives rows
  that appear as each student is graded, with `INCREMENTAL_CONCURRENCY = 3`
  (`incrementalRunPlan.ts:31`) in flight - so the 1200ms sleeps and the serial
  wait disappear.
- Extraction still must run somewhere under 60s. Because per-student grading is
  now separate requests, extraction can be done ONCE server-side when the Storage
  object is read, and each student's entry dispatched as it is grouped - OR, if
  extraction itself risks 60s, split extraction into its own bounded step. This is
  the biggest change and is the correct one.

### FIX-3 (defer/bound extraction) - the stopgap if FIX-2 is deferred

- Guard the blocking path so a too-heavy zip fails FAST with a message instead of
  clocking to a silent 60s kill: a file-count cap and a total-office-doc cap, and
  a per-file extraction time budget, surfaced as a worded refusal. This is Cause C
  mitigation without the Storage rework. Does not raise the ceiling; makes the
  failure honest.

### FIX-4 (Cause D defer) - the original "Option A", worthwhile and cheap once FIX-2 exists

Defer link resolution OUT of ingest to grade-time. Trace below.

**RECOMMENDATION:** Ship **FIX-1** immediately (W1) - it directly answers the
owner's symptom (no more clocking; fast legible failure). Put **FORK 1** to the
owner (FIX-2 full Storage+progressive ingest vs FIX-3 fast-fail guard interim),
with FIX-2 recommended because the owner's real need is to grade a 60-student bulk
zip, which no current surface can do. Fold **FIX-4** into FIX-2 (it is nearly free
once grading is per-student).

---

## 3. The grade-time seam for FIX-4 (deferring link resolution), traced

Today the link is resolved at INGEST and inlined: `resolveLinkSubmissions` mutates
`submissions[path]` to the folded repo text BEFORE grouping (`extraction.ts:485`),
and `delete rawData[path]` (`:486`); the `*_link.html` then groups like any file,
so its `entry.content` carries the resolved code and `entry.submittedFiles` carries
it as one pseudo-file. The zip path discards `foldGithubRepoContent`'s per-file list
and `gradedRepo/gradedRef` (only `.contentPart` is kept, `:452`) - unlike the Canvas
path, which keeps them.

To defer, ingest must emit an UNRESOLVED link entry carrying the URL, and the fetch
must happen per-entry at grade time:

- **Entry shape carries the URL.** `StudentSubmissionEntry` already has the fields:
  `submissionUrl?: string | null` and `gradedRepo/gradedRef/repoReadNote`
  (`types.ts:459-468`). A zip link entry would set `submissionUrl` (as the Canvas
  path does) and leave `content` as the bare link note, instead of inlining the
  fetched code. No new field is needed.
- **Where it is fetched at grade time.** The shared fold helper
  `foldGithubRepoContent` (`extraction.ts:401`) already serves BOTH paths. The
  grade-time call site is the per-student enrichment the action already does before
  the pure engine grades: the established pattern is `attachCodeRuns(entries)` in
  `grading.ts:876` (the action enriches entries with async work; the engine stays
  network-shaped-only). A parallel `resolveEntryLinks(entries)` would fold
  `entry.submissionUrl` into `entry.content` + `submittedFiles` + `gradedRepo/Ref`
  there, one entry at a time, naturally concurrent with the per-item pool once
  FIX-2 lands (each `/api/grade-run-item` call resolves its own link).
- **This touches which graders?** The fold currently lives in the single shared
  `ingestZipEntries`, so ALL THREE local zip graders (chat file upload via
  `extractStudentEntries`; GradingTab embedded `grading.ts:860`; GradingTab Gemini
  `gradeSubmissions` -> `engine.ts:565-574`) inherit it. If deferred to a per-entry
  enrichment step, each grade path must call it - the embedded engine is
  network-free by design (`gradeEntriesEmbedded`), so for it the enrichment must be
  done by the ACTION (like `attachCodeRuns`), not inside the engine.
- **Canvas path (`canvasWorkToEntry:555`) does NOT need the same defer** - it folds
  at `extractCanvasEntries` ingest and that is not the owner's reported bottleneck;
  `canvasWorkToEntry`/`extraction.test.ts`'s `canvasWorkToEntry` oracle must stay
  green and unchanged. Deferring Canvas folding is out of scope for this item.

**Preserved behavior (all four graders):** a link submission STILL gets its linked
repo graded (the fold still runs, just later); per-student failure still isolates
(`foldGithubRepoContent` never throws, `:432-435`; `resolveLinkSubmissions`'s own
try/catch, `:480-484`); SSRF posture UNCHANGED - only GitHub/vscode.dev hosts
fetched, Drive noted-not-fetched, other hosts noted (`resolveSubmittedLink:451-459`).

---

## 4. Instruments: machine-checkable vs owner-walk

**Machine-checkable (vitest; network-blocked, so mock `fetchGradableRepoContent`
/ module seams, never `fetch` - MEMORY: tests-are-network-blocked):**

- **I1 - FIX-1 client pre-flight exists.** Object: the two grading file-input
  handlers. Instrument: a structure/wiring test asserting each handler calls
  `wireBytesForFile(file.size)` / `checkFileWireBudget` before submit. Fails RED if
  a handler submits without a size check. (Pattern: `gradingPictureIngest.ts`'s own
  tests.)
- **I2 - FIX-4 resolution NOT at ingest.** Object: `ingestZipEntries` output.
  Instrument: extend `zip-link-resolution.test.ts` - a GitHub `*_link.html` zip run
  through `ingestZipEntries` leaves `mockFetchRepo` **NOT called** and the entry
  carries `submissionUrl` with the bare note, not the folded code. Direction of
  failure: RED if `fetchGradableRepoContent` is called during ingest.
- **I3 - FIX-4 resolution AT grade time.** Object: the per-entry enrichment step.
  Instrument: a test that runs the grade path (the action's `resolveEntryLinks`
  equivalent, or `/api/grade-run-item` driven) and asserts `mockFetchRepo` IS
  called and the folded code reaches `entry.content`. RED if the link never
  resolves (the shipped grade-the-link behavior regressed). I2 + I3 together are
  the removal-test pair for "resolution moved".
- **I4 - FIX-3 guards.** Object: `ingestZipEntries` / the action. Instrument: a zip
  exceeding the file-count or office-doc cap returns a worded refusal; a per-file
  time budget is honored. RED if an over-cap zip proceeds to block.
- **I5 - no regression.** Object: existing suites. Instrument: keep green -
  `extraction.test.ts` (`canvasWorkToEntry`), `zip-link-resolution.test.ts`,
  `ingestion-attribution.oracle.test.ts`, `collisionRefusal.wiring.test.ts`,
  `grouping-zip-parents.wiring.test.ts`, `rubric-stamp.wiring.test.ts`. Run via
  `npm run test:paths -- <p1> <p2> ...` (NEVER a raw multi-path `vitest` - MEMORY:
  test-paths-wrapper).

**Owner-walk ONLY (no component renders under vitest - MEMORY: ac-sonnet-opus-loop;
no live Storage/network/60s timer here):**

- The FELT speed: that the upload returns fast and rows stream. No test observes
  wall-clock latency or a rendered spinner.
- Which surface the owner used and what it showed (RES-LAG-1).
- That a Storage-backed upload + progressive grading actually grades a 13 MB /
  14-office-doc / 60-student zip end to end on prod (needs live Storage, a real
  browser, and a production tick - owner-only by construction).

---

## 5. Forks for the owner (each answer terminates the activity)

- **FORK 1 (product, the big one): how far to take FIX-2?** This activity ships one
  of: **(A)** FIX-1 only (fast legible failure; the owner must split a bulk zip into
  <2.6 MB pieces) - cheapest, ships now, does NOT grade a 13 MB zip; **(B)** FIX-1 +
  the full Storage-upload + progressive per-student ingest - multi-wave, crosses the
  4.5 MB/60s ceilings, actually grades a 60-student bulk zip. **Recommendation: B**,
  because the owner's stated workflow is bulk Canvas-export grading and no current
  surface can do it; cost of being wrong on A is the owner keeps hitting the same
  wall. If B, FIX-3 and FIX-4 fold into it; if A, FIX-3 ships as the interim and
  FIX-4 + B are filed as residuals.
- **FORK 2 (scope of FIX-4): defer link resolution now, or with FIX-2?** Recommend
  bundling FIX-4 into FIX-2's per-student path (nearly free there); if FIX-2 is
  deferred, FIX-4 can ship standalone against the embedded/whole-run paths but must
  then add the enrichment call to each grader (section 3), which is more surface for
  a secondary bottleneck. **Recommendation: bundle into FIX-2.**

---

## 6. Wave plan (for the recommended path: ship FIX-1 now; FIX-2 pending FORK 1)

Disjoint by write set. The wave gate is `git status --short` against each wave's
file list (MEMORY: wave-gate-git-status). No file here is near the 1000-line ceiling
(`@(Get-Content).Count`: `extraction.ts` 623, `office-extract.ts` 224, `grading.ts`
977 - closest; `GradingTab.tsx` 620; `incrementalRunPlan.ts` 305 - watch the
305-vs-300 note at `:302-305`).

- **W1 (ship immediately, no FORK answer needed) - FIX-1 client pre-flight.**
  Owns: `src/app/components/GradingTab.tsx` (zip input handler), the chat file
  handler reached from `src/app/components/grading-chat/ChatComposer.tsx` /
  `useContinuousGradingRun.ts`, and a new/extended wiring test for I1. Reuses
  `upload-budget.ts` (no edit). Delivers fast legible failure; independently
  pushable.
- **W2 (interim, only if FORK 1 = A) - FIX-3 extraction guards.** Owns:
  `src/lib/grade/extraction.ts` (+ `office-extract.ts` if a per-file timeout is
  added), and test for I4. Must bump no frozen canary unless one fires (check
  directory-canary rule - MEMORY: gate-must-include-directory-canary).
- **W3 (only if FORK 1 = B) - FIX-2 Storage upload transport.** Owns: a new client
  upload-to-Storage path + a server read-from-Storage entry into extraction; a new
  migration/bucket if needed (data seat + security seat REQUIRED - new egress, new
  storage, Storage RLS). Largest wave; not trivially revertible (Storage/bucket).
- **W4 (only if FORK 1 = B) - FIX-2 progressive grading reachability.** Owns:
  `incrementalRunPlan.ts` (`INCREMENTAL_ROUTE_ENABLED`), the RULING 116 shape gaps
  (rubric provenance mount, blank-rubric/blank-instructions parity on the
  incremental route), and the GradingTab wiring to the pool. Depends on W3's entries
  source. Carries FIX-4.
- **W5 (with W4) - FIX-4 defer link resolution.** Owns: `extraction.ts`
  (`ingestZipEntries` emits unresolved link entries; add `resolveEntryLinks`), the
  per-grader enrichment call sites (`grading.ts` for embedded, the per-item route /
  action for Gemini), and tests I2/I3. `zip-link-resolution.test.ts` updated
  deliberately (the "resolves ... before grouping" expectations invert to
  "carries the URL, resolves at grade time").

Seats to run (per `docs/loop/seats.md`): Architect (shape of the Storage seam +
the per-entry enrichment seam) - W3/W4/W5; Data/storage (Storage bucket, RLS,
retention of an abandoned upload) - W3; Security (new egress to Storage, the
`bodySizeLimit`/CSRF posture of any new upload route, SSRF unchanged on the fold) -
W3; Reliability (the 60s budget split, partial-upload cleanup, progressive-render
failure isolation) - W3/W4; UX + Accessibility (the progress/streaming states,
the pre-flight refusal copy) - W1/W4. Acceptance criteria + Test seat always.

---

## 7. Residual register (owner, instrument, step for each - else it is a deletion)

Each must be filed in `docs/BACKLOG.md` to exist.

- **RES-LAG-1 (owner-walk):** Which surface ingests the owner's zip and what it
  shows during ingest (spinner-that-hangs vs worded error). Owner: repo owner.
  Instrument: owner-walk. Step: owner reproduces with the supplied zip and reports.
- **RES-LAG-2 (regression, Cause D):** Serial GitHub link fetch blocks ingest for
  GitHub `*_link.html` zips. Owner: FIX-4 (W5) or, if deferred, a standalone row.
  Instrument: I2/I3 in `zip-link-resolution.test.ts`. Step: defer to grade-time.
  Origin commit `05a2ff49`.
- **RES-LAG-3 (Cause C, if FORK 1 = B defers FIX-3):** No fast-fail guard on a
  too-heavy under-cap zip; it can clock to a silent 60s kill. Owner: FIX-3 (W2).
  Instrument: I4. Step: add file-count/office-doc caps + per-file time budget.
- **RES-LAG-4 (platform, owner-only):** A 13 MB / 60s-exceeding bulk zip cannot be
  graded in one serverless invocation; needs Storage-backed ingest (FIX-2).
  Owner: repo owner (product decision FORK 1) + the implementing waves. Instrument:
  owner-walk on prod (live Storage + real browser + production tick). Step: FORK 1
  answer, then W3/W4.
- **RES-LAG-5 (related, pre-existing):** `N15-PHOTO-DOWNSCALE` (already in
  `docs/BACKLOG.md`) is the same 2_752_512-byte gate for photos; FIX-1's pre-flight
  and any client-side size handling should be designed consistently with it.
  Owner: existing N15 row. Instrument: existing. Step: cross-reference, do not
  duplicate.

---

## 8. `owns` / files cited (all opened)

Read as source for this RCA: `src/lib/grade/extraction.ts`, `.../repo-content.ts`,
`.../types.ts`, `.../engine.ts`, `.../utils.ts`, `.../constants.ts`,
`.../canvas-link-submission.ts`, `.../single-file-entry.ts`,
`.../zip-link-resolution.test.ts`; `src/lib/office-extract.ts`,
`src/lib/upload-budget.ts`, `src/lib/gemini.ts`; `src/app/actions/grading.ts`,
`.../grading-incremental.ts`, `.../grading-chat-intake.ts`;
`src/app/api/grade-run-item/route.ts`;
`src/app/components/grading/incrementalRunPlan.ts`,
`src/app/components/grading-chat/useContinuousGradingRun.ts`,
`.../ChatComposer.tsx`, `.../chatFileBatch.ts`;
`src/app/components/GradingTab.tsx`; `next.config.ts`; `docs/BACKLOG.md`.

Tests that read these files AS SOURCE TEXT (so a change can turn them RED even
without a behavior change - include in any build wave's gate):
`zip-link-resolution.test.ts`, `extraction.test.ts`, `extraction.inference.test.ts`,
`ingestion-attribution.oracle.test.ts`, `collisionRefusal.wiring.test.ts`,
`grouping-zip-parents.wiring.test.ts`, `rubric-stamp.wiring.test.ts`,
`grading-chat-intake.test.ts`, `grading.budget.test.ts`, `grading.guard.test.ts`,
`incrementalRunPlan.test.ts`, `useContinuousGradingRun.lifecycle.test.ts`.
