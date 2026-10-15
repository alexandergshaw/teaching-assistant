# Bulk-zip FINISH: AC + scope for BW3 (grade-time link resolution) and BW4 (progress + skip/failed ledger)

Architecture seat, 2026-10-08. Branch `main`. This document finishes BULK-ZIP:
BW1 (client Storage transport, dormant) and BW2 (streaming Route Handler ingest +
never-throw parser + driver storaged-zip path, flag ON) have SHIPPED
(`d7bfe495`, cited in `docs/bulk-zip-grading-scope.md` section 0b / BACKLOG line
for `| BULK-ZIP |`). The two remaining waves make the feature COMPLETE and
VISIBLE. Every `file:line` below was opened in this pass; every quantity names
the command that produced it; where the task brief or the prior scope disagreed
with the tree, the measurement is reported and the disagreement named. No
production code was written.

This supersedes the BW3/BW4 halves of `docs/bulk-zip-grading-scope.md` (which
scoped BW3 as a GitHub-only deferrable enhancement). The owner clarified
2026-10-08 that **a link is often a student's whole submission** in the real
zips, so BW3 is co-priority with BW4 - both block "bulk-zip is complete." The
disposition table (section 9) maps every prior requirement.

---

## 0. EXECUTIVE SUMMARY

**What BW4 gives the owner.** After a 12-13 MB zip uploads and grades through the
chat pump, the owner sees (a) a progress state during upload and streaming, and
(b) a persistent, professional **skip/failed ledger** naming exactly who did NOT
get a clean grade and why: students the ingest skipped as oversized (with the
reason), supported files that FAILED to extract, and link submissions that could
not be fetched. Today none of this is durable: the skip list exists only as a
transient one-line `submitError` string that the next submission overwrites, and
`failedSupportedFiles` is collected by the parser and then **dropped by the
driver** (see section 2, Finding B). So BW4 is NOT purely "render existing data"
- it adds a small structured ledger surface on the hook, then renders it.

**The BW3 necessity verdict: REQUIRED, not deferrable.** The owner's bulk zips
carry `*_link.html` files where the link IS the submission (a GitHub repo, a
Google Doc). The owner's specific zip has **two `*_link.html` entries pointing at
Google Docs**. Measured facts:

- Today, in the zip-ingest path, a Google Docs / Drive link is **noted, not
  fetched** (`resolveSubmittedLink`, `extraction.ts:494-497`: "automatic fetch of
  Drive links from a zip is not supported yet"). So the owner's two Google-Docs
  students would grade against a bare note - effectively ungraded. That is the
  gap BW3 closes.
- The capability to fetch-and-grade a Google Doc already EXISTS
  (`fetchGoogleDriveFile`, `google-drive-content.ts:161`) and is wired into the
  single-URL submission path (`grading-chat-intake.ts:247-282`), but is NOT wired
  into the zip-link path. BW3 brings the zip-link path to parity.
- GitHub links DO resolve-and-grade in the zip path today, but SEQUENTIALLY at
  ingest (`resolveLinkSubmissions`, `extraction.ts:237,511-529`), which both
  blocks the streaming ingest under its ~35s soft budget (reliability R1) and -
  once Drive fetching is added - would compound to many serial 25s Drive fetches.

So BW3 does two things that are both required for "bulk-zip complete": it
**brings Drive/Docs link grading to the zip path** (the owner's real case), and
it **moves link resolution off ingest to grade-time** (per-item, inside each
pump dispatch) so the stream stays fast and the fetches parallelize across the
pump's 3 concurrent slots.

**The per-link-type verdict (the deliverable's headline).** After BW3, for a
link that is a student's whole submission inside a zip:

| Link type | Zip path TODAY (ingest) | After BW3 (grade-time) |
|---|---|---|
| GitHub repo (`github.com`, `.git`) | GRADES - code folded, serial at ingest | GRADES - folded per-item at grade time, parallel across the pump |
| `vscode.dev/github/<owner>/<repo>` | GRADES (normalized to github, `canvas-link-submission.ts:66-77`) | GRADES |
| Google Doc (`docs.google.com/document/...`, native-doc docType `document`) | **NOTED, not fetched** | **GRADES** (exported to txt via `fetchGoogleDriveFile`) - the owner's case |
| Google Drive file (`drive.google.com/file/...`, a supported type) | NOTED, not fetched | GRADES (downloaded + extracted, if a gradeable file type) |
| Google Sheets / Slides (native-doc, docType != document) | NOTED | FLAGGED "not supported yet" (named, one row, graded on the note) |
| Google Drive folder, or a Drive link to a ZIP | NOTED | FLAGGED (one pump row cannot fan a folder/zip into many students - RES-BZF-3) |
| Any other host | NOTED | FLAGGED "host not supported" |
| A GitHub/Drive fetch that FAILS (private/404/timeout) | GRADES on the note (`repoReadNote`) | GRADES on the note + surfaced by BW4's ledger as "link could not be fetched" |

"GRADES" = the student gets a real grade from the fetched content. "FLAGGED" =
the student still gets exactly one row (never silently dropped), graded on the
bare link note, and BW4's ledger names it so the owner knows the link was not
fetched. This is the BW3->BW4 tie.

**Bottom line for the owner.** After BW3+BW4: a bulk zip whose students submitted
GitHub repos or Google Docs grades those students on their real work, the stream
stays responsive, and every student who could not be fully graded (oversized,
unreadable file, or un-fetchable link) appears in one named ledger instead of
vanishing.

---

## 1. GROUND TRUTH (opened this pass)

Line counts, `wc -l` from the Bash tool (which `this-repo.md` confirms equals the
mandated `@(Get-Content).Count`; `Measure-Object -Line` is NOT used):

| File | Lines | Near 1000? | Role |
|---|---|---|---|
| `src/lib/grade/extraction.ts` | 664 | no | BW3 edits (ingest defer + shared resolver) |
| `src/app/api/grade-run-item/route.ts` | 221 | no | BW3 edits (accept/validate/resolve `submissionUrl`) |
| `src/app/api/grade-submission-zip/route.ts` | 149 | no | BW3 edits (pass `deferLinks`) |
| `src/lib/grade/ndjson-ingest-parser.ts` | 211 | no | read-only (entry rides through transparently) |
| `src/lib/grade/repo-content.ts` | 134 | no | read-only (reused resolver) |
| `src/lib/grade/google-drive-content.ts` | 241 | no | read-only (reused resolver) |
| `src/app/actions/grading-chat-intake.ts` | 333 | no | read-only (the single-URL parity reference) |
| `src/app/components/grading-chat/useContinuousGradingRun.ts` | 539 | no | BW4 edits (retain ledger) |
| `src/app/components/grading-chat/GradingChatPanel.tsx` | 517 | no | BW4 edits (mount ledger + progress) |
| `src/app/actions/grading.ts` | 977 | **YES - 23 from ceiling** | NOT edited by the recommended BW3 shape (section 4.3) |

### 1a. What the ingest emits, and how a link reaches the entry today

- `ingestZipEntries(zipBuffer, {inferFileNamesWith})` (`extraction.ts:213-243`)
  runs: `extractSubmissions` -> collision refusal (`:231-234`, throws) ->
  **`await resolveLinkSubmissions(submissions, rawData)` UNCONDITIONALLY**
  (`:237`) -> inference -> `groupSubmissionsByStudent`. It returns
  `{ entries, attemptedSupportedFiles, failedSupportedFiles }` (`:242`).
- `resolveLinkSubmissions` (`extraction.ts:511-529`) is a SEQUENTIAL `for` loop.
  For each `.html`/`.htm` submission it calls `extractCanvasSubmittedUrl`
  (`canvas-link-submission.ts:43-57`, which requires the Canvas
  "this submission was a url" marker), then `resolveSubmittedLink` (`:489-502`),
  then **replaces `submissions[path]` with the resolved text in place** and
  `delete rawData[path]` (`:526-527`). So the URL is consumed at ingest; the
  resolved text (or the Drive/other-host note) is folded into `content`.
- `resolveSubmittedLink` (`:489-501`): GitHub/vscode.dev ->
  `foldGithubRepoContent` (fetches). Google Drive detected via
  `parseGoogleDriveUrl` -> a NOTE only (NOT fetched). Any other host -> a note.
- **`groupSubmissionsByStudent` (`utils.ts:439-449`) returns entries with ONLY
  `{ student, content, mergedFileCount, submittedFiles }`** - it drops
  `submissionUrl`/`gradedRepo`/`gradedRef`. So a ZIP-derived entry carries NO
  `submissionUrl` today (verified: the only `submissionUrl` setters in
  `extraction.ts` are `canvasWorkToEntry` at `:553,659`, the Canvas path, not the
  zip path). `StudentSubmissionEntry.submissionUrl` is an optional field that
  exists (`types.ts:459`) but is unset for zip entries.

**Consequence for BW3's shape:** to defer resolution, the ingest must (a) NOT
call `resolveSubmittedLink` for the bulk path, (b) attach the extracted URL to
the owning entry as `submissionUrl` plus a bare `Submitted link: <url>` note in
`content`, and (c) carry that through grouping. Because `groupSubmissionsByStudent`
is A44-sensitive (its disambiguation pass has 28 pinned tests -
`utils.ts:467-498`), BW3 must NOT change its signature; the recommended threading
is a post-group pass keyed on the CITATION NAME (`submittedFiles[].name =
parseSubmissionFileName(...).citationFileName`, `utils.ts:512,518,522`, the
STRIPPED leaf name - NOT the path, which the entry does not retain), with a
cross-student collision guard (section 4.2, checker B2).

### 1b. What `grade-run-item/route.ts` does with a link today

- `parseRequestBody` (`route.ts:91-148`) reconstructs `entry` field-by-field
  (`:114-122`) and reads `gradedRepo`/`gradedRef` but **NOT `submissionUrl`** - so
  even if an entry carries `submissionUrl`, the route STRIPS it before grading.
  There is no resolve step; `gradeEntries([entry], ...)` runs directly (`:202`).
- The route has `MAX_CONTENT_CHARS = 2_000_000` (`:57`), enforced on the INCOMING
  content (`:110`) and the wire budget `estimateEntryWireBytes > ITEM_REQUEST_BYTE_BUDGET`
  (`:124`). After a grade-time fold these bounds no longer apply to the folded
  text - so BW3 must RE-CLAMP folded content to `MAX_CONTENT_CHARS` before
  `gradeEntries`.

### 1c. What the single-URL path already proves (the parity reference)

`resolveOnePart` kind `"url"` (`grading-chat-intake.ts:214-288`) is the shape BW3
generalizes to a per-entry grade-time resolver:
- Canvas URL -> `extractCanvasEntries` (not relevant to a zip link.html).
- GitHub (`parseSubmissionGithubUrl` NOT-error) -> `fetchGradableRepoContent`
  (`repo-content.ts:55`) -> `buildRepoUrlEntry` (`:93-108`). GRADES.
- Google Drive (`parseGoogleDriveUrl`): folder -> refused; native-doc non-document
  (Sheets/Slides) -> refused; `"file"` or native-doc `"document"` ->
  `fetchGoogleDriveFile` -> `classifyGradingUpload` -> `buildSingleFileEntry` or
  `extractStudentEntries`. GRADES.
- Other host -> refused with a named message.
- `parseSubmissionGithubUrl` was **hardened against owner/repo path traversal**
  (`74acf814`, "reject traversal/non-safe owner+repo"; backlog `GITHUB-URL-TRAVERSAL`
  is now `verification`). So the prior scope's RES-BZ-7 is DISCHARGED - BW3's
  `submissionUrl` validation rests on the now-safe parser and does not re-own it.

`GoogleDriveTarget` (`google-drive-url.ts:16-19`) is
`{kind:"file"|"native-doc"|"folder"}`; native-doc carries `docType`. `fetchGoogleDriveFile`
only supports `"file"` and native-doc `docType==="document"` (`:167-173`); it is
SSRF-safe (host allowlist `:38-50`, `credentials:"omit"`, bounded hops, size
capped).

### 1d. What the driver exposes for the ledger today (Finding A and B)

- `useContinuousGradingRun` exposes `dispatchedCount`, `completedCount`,
  `inFlight` (`:533-535`), already rendered as the N-of-M indicator
  (`GradingChatPanel.tsx:489-502`, keyed on `dispatchedCount - completedCount`).
  PROGRESS for the per-student grade is already shown.
- **Finding A - skips are transient.** The storaged-zip `submit` branch reads
  `ingestSkipped = ingest.ledger.skipped` (`:310`) and folds it into the
  `"partial"` outcome's `reason` STRING (`:444-459`). That string is returned,
  set into `submitError` (`GradingChatPanel.tsx:261,297`), and shown as a one-line
  `role="alert"` (`:475-479`) that the NEXT submission overwrites. There is no
  structured, retained skip list on the hook's result.
- **Finding B - `failedSupportedFiles` is DROPPED.** The parser collects
  `ledger.failedSupportedFiles` (`ndjson-ingest-parser.ts:197`), but the driver's
  storaged-zip branch reads ONLY `ingest.ledger.skipped` (`:310`) and never
  references `ingest.ledger.failedSupportedFiles`. It reaches no returned state
  and no UI. So "files that failed to extract" is currently invisible.

- **Finding C - `GradeResult` carries no link signal.** `GradeResultBase`
  (`types.ts:235-294`) has `gradedRepo`/`gradedRef` (`:273-274`) but NO
  `repoReadNote`, NO `submissionUrl`, and no link-outcome field; `engine.ts`
  references neither. `gradedRepo === null` is true for every ordinary text row
  too, so the link-not-fetched class cannot be INFERRED from a result - it needs
  an explicit field BW3 adds (`linkFetch`, section 4.3). This makes `types.ts` a
  BW3-owned edit that BW4 depends on (sections 6/7).

So BW4 must add a structured ledger to the hook (both lists, plus the
link-not-fetched flags read from the new `result.linkFetch` field), then render
it. This is the "the surface is a layer" correction to the brief's "renders
EXISTING data" premise.

---

## 2. ACCEPTANCE CRITERIA

Written from the owner's words; user-experienced outcomes and the failures the
tests must catch. Mechanism is section 3-4; oracle construction is the test
seat's.

**Leverage claim trigger: FIRED** (BW3+BW4 complete a capability the user
reaches, not a bug fix). The architect records the fired trigger; the AC seat
owns the one-paragraph claim and its single removal criterion. Honest classes
from `docs/loop/leverage.md`: **SCALE** (one frozen rubric held across N students
of a 26-file zip), **ATTRIBUTION** (per-student identity by construction - the
A44 collision refusal the ingest runs), and the BW3-specific edge: a chat window
**cannot ingest a 13 MB zip and fetch-and-fold each student's GitHub repo or
Google Doc under one rubric** - the human would have to open each link, download,
and paste, losing the batch. Buildable removal-test candidate (test seat decides):
delete the fold in `resolveEntryLinks` and assert a GitHub-link entry's graded
`content` no longer contains the repo code (observable by deletion; see I-resolve-at-grade).
The FELT advantages (fast upload, streaming rows) have NO buildable removal test
here - no component renders (owner-walk, RES-BZF-5).

### BW3 - link submissions grade (REQUIRED)

- **AC-BZF-1.** A student whose zip submission is a `*_link.html` to a GitHub repo
  is graded on the repo's fetched code, with the repo recorded (`gradedRepo`/`gradedRef`
  populated), exactly as the single-URL GitHub path grades it today. FAIL if the
  student grades on a bare note while the repo was fetchable.
- **AC-BZF-2.** A student whose zip submission is a `*_link.html` to a Google Doc
  (`docs.google.com/document`) is graded on the Doc's exported text. FAIL if a
  Google-Docs link is only noted and not fetched (today's behaviour). This is the
  owner's specific blocked case.
- **AC-BZF-3.** Link resolution does NOT happen during the streaming ingest: the
  ingest emits the link student as an entry carrying its URL and a bare note, and
  the fetch happens inside that student's own per-item grade. FAIL if a GitHub or
  Drive fetch is observed during `ingestZipEntries` on the bulk path.
- **AC-BZF-4.** A link type that cannot be fetched (Sheets/Slides, a folder, a
  Drive-zip, an unknown host, or a GitHub/Drive fetch that fails) still produces
  exactly ONE graded row for that student - graded on the bare link note - and
  is never silently dropped. FAIL if such a student produces zero rows or throws.
- **AC-BZF-5.** No caller-supplied URL is fetched raw: a GitHub URL is fetched
  only through the hardened `parseSubmissionGithubUrl` + `fetchGradableRepoContent`
  allowlist, and a Drive URL only through `parseGoogleDriveUrl` +
  `fetchGoogleDriveFile`'s host allowlist. A `submissionUrl` on any other host is
  classified "flag", not fetched. FAIL if a non-allowlisted host is fetched.
- **AC-BZF-6.** After a grade-time fold, the entry's `content` is clamped to
  `MAX_CONTENT_CHARS` before `gradeEntries`. FAIL if folded content exceeding the
  cap reaches the engine.

### BW4 - the owner sees progress and who did not get graded

- **AC-BZF-7.** While a bulk zip is uploading and streaming, the surface shows a
  working state (an upload/preparation label, then the existing N-of-M counter as
  students dispatch). FAIL if the surface looks idle during upload/stream.
- **AC-BZF-8.** After (and during) a bulk run, a persistent ledger lists, by name:
  students SKIPPED as oversized (with the reason), supported files that FAILED to
  extract (`failedSupportedFiles`), and students whose LINK could not be fetched.
  The ledger does not vanish on the next submission. FAIL if any of the three
  classes is absent, or if it is overwritten by the next submit (today's transient
  string). FAIL specifically if `failedSupportedFiles` is not shown (Finding B).
- **AC-BZF-9.** The ledger is professional, minimal, reuses the app's visual
  language, and contains no emojis. (Owner-walk acceptance; the copy/structure
  leaf is machine-checkable for content, not appearance.)
- **AC-BZF-10.** Student-level accounting holds: `studentsFound === studentsEmitted
  + skipped.length` (both from the done sentinel), where `studentsEmitted` is the
  graded rows (a link-not-fetched student is one of those graded rows, graded on
  the note - NOT an additional category) and `skipped` is the oversized students.
  `failedSupportedFiles` is a per-FILE informational list, not a student bucket
  (checker M2). FAIL if a skipped student is unlisted, or if failed files are
  counted as missing students.

---

## 3. BW4 DESIGN - progress + skip/failed ledger

### 3.1 The new structured state on the hook (closes Finding A and B)

`useContinuousGradingRun` gains a retained, session-scoped ledger exposed on its
result. Recommended shape (the exact field names are the implementer's within
this contract):

```
readonly ingestLedger: {
  readonly studentsFound: number;
  readonly studentsEmitted: number;
  readonly skipped: readonly { student: string; reason: string }[];
  readonly failedSupportedFiles: readonly string[];
} | null;   // null until a storaged-zip submit completes
```

- Populated in the storaged-zip branch of `submit` from `ingest.ledger` - reading
  BOTH `skipped` AND `failedSupportedFiles` (the latter is currently dropped,
  Finding B). Stored in a `useState` so it survives across the next submit
  (unlike `submitError`).
- `reset()` clears it to `null` (add to the reset block, `:493-516`).
- The link-not-fetched class is NOT in `ingestLedger` - it arrives on GRADED
  ROWS via the explicit `result.linkFetch` field BW3 adds to `GradeResultBase`
  (section 4.3). BW4 reads `driver.run.results[i].linkFetch === "failed" |
  "flagged"` - never an inferred predicate like `gradedRepo === null` (which is
  also true for every ordinary text row; checker B1). Because `linkFetch` is a
  `types.ts` field BW3 owns and lands, BW4 DEPENDS on BW3 for it: the two waves
  are NOT fully disjoint and are sequenced BW3 -> BW4 (sections 6 and 7).

### 3.2 The pure mapping leaf (machine-checkable)

A new pure leaf `src/app/components/grading-chat/ingestLedger.ts`:

```
buildLedgerView(args: {
  ledger: IngestLedger | null;
  results: readonly GradeResult[];   // from driver.run
}): {
  skipped: { student: string; reason: string }[];   // STUDENT-level, from the sentinel
  linkNotFetched: { student: string }[];             // results[i].linkFetch failed/flagged
  failedFiles: string[];                             // per-FILE, informational only
  accountedFor: boolean;                             // studentsFound === studentsEmitted + skipped.length
  hasAny: boolean;
}
```

Pure, no React, no fetch - so vitest exercises every branch (no render). This is
the **outcome->ledger mapping leaf** the brief asks for.

**Student vs file identity (checker M2).** `skipped` and `linkNotFetched` are
STUDENT-level outcomes. `failedSupportedFiles` is a per-FILE `string[]` collected
at extraction (`ndjson-ingest-parser.ts:197`), NOT a per-student bucket: a student
with one failed file can still grade on their other files. So `failedFiles` is
presented as an informational "these files inside the zip could not be read"
list, NEVER as a third mutually-exclusive student category. The student-level
accounting identity is `studentsFound === studentsEmitted + skipped.length` (both
from the done sentinel; `linkNotFetched` students are a subset of the
`studentsEmitted` graded rows, not additional). Direction of failure: RED if a
skip or a link-not-fetched student is dropped, if `failedFiles` is miscounted as
a student category, or if the `accountedFor` identity is computed wrong
(I-ledger-map, section 5).

The **progress-text leaf** is a second pure function
`describeBulkProgress({ phase, dispatchedCount, completedCount }): string` (phase
in `"uploading" | "preparing" | "grading" | "idle"`). RED on a one-off count or
wrong phrasing (I-progress-text).

### 3.3 Where it mounts

`GradingChatPanel`, inside `chatStyles.stickyComposer` (`:466-512`), between the
`LatestResultCard` and the `submitError` alert, OR directly under the results
`stream`. It renders only when `buildLedgerView(...).hasAny`. Reuse the existing
notice/visual language: the `controls.notice` family (`RecordingControls.module.css`,
used at `:476`) for a neutral (not danger) callout, the `styles.ghMeta` text
class (`:433`), and the `unresolvedStudents` flagged-set render idiom already in
`StudentNameCell` (`grading-results/StudentNameCell.tsx`, driven from
`GradingResults.tsx:726`) for naming students. No new color token; the visual
seat (Wave-3) confirms spacing/contrast against both themes (owner-walk for the
render).

Progress (AC-BZF-7): the existing indicator (`:480-506`) already shows N-of-M and
"Reading your submission..." while `preparing`. BW4's only progress addition is a
clearer bulk label via `describeBulkProgress` (e.g. "Uploading zip...", then
"Preparing students..."), reusing `preparing` + the counters - NOT a new
mechanism. No new persisted key (no `ta-` key; the ledger is session state that
dies with the session, consistent with `CHAT_SESSION_NOT_SAVED_DISCLOSURE`,
`:58-59`). No stranded key.

### 3.4 Machine-checkable vs owner-walk (BW4)

- Machine-checkable: `buildLedgerView` (mapping), `describeBulkProgress` (copy),
  and a hook lifecycle test proving `ingestLedger` retains BOTH lists after a
  storaged-zip submit (I-ledger-retained).
- Owner-walk: the rendered ledger and progress indicator - no component renders
  under vitest (RES-BZF-5).

---

## 4. BW3 DESIGN - grade-time link resolution

### 4.1 The one shared resolver (so the route cannot grow a looser path)

Export ONE `resolveEntryLinks(entry: StudentSubmissionEntry): Promise<StudentSubmissionEntry>`
from `extraction.ts`. It NEVER throws (mirrors `foldGithubRepoContent`,
`:473-476`). Given an entry with `submissionUrl` set:

1. Classify the URL via a pure leaf `planLinkResolution(url)` (section 4.4):
   `"github" | "drive-doc" | "drive-file" | "flag"`.
2. `"github"`: `fetchGradableRepoContent(url)` (reusing the hardened parser);
   on success fold code into `content` + set `gradedRepo`/`gradedRef`; on failure
   set `repoReadNote` and keep the bare note (AC-BZF-4).
3. `"drive-doc"`/`"drive-file"`: `fetchGoogleDriveFile(target)` then the SAME
   `classifyGradingUpload` + `buildSingleFileEntry`/`extractStudentEntries` the
   single-URL path uses (`grading-chat-intake.ts:260-274`); fold the result's
   content + files into the entry. On any error keep the bare note + a
   `repoReadNote`.
4. **POST-FETCH SINGLE-ENTRY GUARD (checker M1).** `planLinkResolution` is pure
   URL logic, so `drive.google.com/file/d/<id>` classifies as `"drive-file"`
   regardless of the real file type; a Drive file that turns out to be a ZIP runs
   `extractStudentEntries` and yields MULTIPLE entries, which folded into one pump
   row is exactly the A44 cross-student BLEND the collision refusal exists to
   prevent. So after fetching a Drive `"file"`, if the fetch yields `!= 1` entry
   (an archive, or zero entries), FLAG it: keep the ONE original entry on its bare
   note, set a `repoReadNote` ("the linked Drive file could not be used as a
   single submission"), and NEVER fan it into the student. Only a single-entry
   result is folded. (A Drive `"document"`/native-doc always yields one file, so
   this guard bites only on `"drive-file"` archives.) Instrument I-resolve-single-entry.
5. `"flag"`: leave the bare note, set a `repoReadNote` ("link not fetched:
   <reason>"), so BW4's ledger names it.
6. Set the link outcome signal `entry.linkFetch` (checker B1, section 4.3): `"ok"`
   when a fetch folded real content, `"failed"` when a fetch was attempted and
   failed, `"flagged"` when `planLinkResolution`/the single-entry guard refused
   to fetch. Unset for an entry with no `submissionUrl`.
7. In ALL cases, re-clamp `content` to `MAX_CONTENT_CHARS` (AC-BZF-6).

An entry with no `submissionUrl` is returned unchanged (no-op), so the route can
call it on every entry unconditionally.

Note: a Drive FOLDER or a Drive link to a ZIP would fan out to many students,
which one pump row cannot represent. A folder is caught upstream by
`planLinkResolution` -> `"flag"` (matching the single-URL folder refusal,
`grading-chat-intake.ts:249-251`); a Drive FILE that is secretly a zip is caught
by the post-fetch guard above (step 4). Both are named by BW4 (RES-BZF-3).

### 4.2 The ingest half (stop resolving on the bulk path; thread the URL)

`ingestZipEntries` gains an option `{ deferLinks?: boolean }` (default
**false = today's inline-resolve behaviour, unchanged**, so the batch/engine path
is untouched - section 4.3).

When `deferLinks: true` (the bulk ingest passes this):
- Do NOT call `resolveLinkSubmissions`. Instead, for each `.html`/`.htm`
  submission, run `extractCanvasSubmittedUrl`; if it yields a URL, replace that
  submission's content with a bare `Submitted link: <url>` note, and leave
  `rawData` as-is.
- **The threading KEY must be the CITATION NAME, not the path (checker B2).**
  `groupSubmissionsByStudent` returns entries whose `submittedFiles[].name` is
  `parseSubmissionFileName(filePath, ...).citationFileName` - the STRIPPED/leaf
  name with the Canvas `name_id_id_` convention prefix removed
  (`utils.ts:512,518,522`) - and the returned entry keeps NO raw path
  (`utils.ts:531-536` returns only `student`/`content`/`mergedFileCount`/`submittedFiles`).
  A path-keyed map matched against a stripped name finds NOTHING on the owner's
  convention-prefixed Canvas zips, so the URL would never attach and the link
  student would grade on the bare note - the exact bug BW3 exists to fix. So:
  AFTER inference is computed (the step at `extraction.ts:238-240`, because
  `citationFileName` depends on `inferredLookup` + `zipParents`), build a
  `Map<citationName, { url: string; linkPaths: Set<string> }>` by running the
  SAME `parseSubmissionFileName(linkPath, inferredLookup, zipParents[linkPath])`
  on each link path and keying on its `citationFileName`.
- After `groupSubmissionsByStudent`, run a POST-GROUP pass: for each entry, for
  each `submittedFiles[].name` present in the citation map, set
  `entry.submissionUrl` ONLY WHEN that citation name maps to exactly ONE link
  path in the whole zip (`linkPaths.size === 1`). This does NOT change
  `groupSubmissionsByStudent`'s signature or behaviour, preserving the 28 A44
  pinned tests (`utils.ts:467-498`).
- **Cross-student collision rule (checker B2).** Two DIFFERENT students' link
  files can strip to the same `citationFileName` (e.g. both "link.html"), so the
  citation name maps to >1 link path. In that case, attach NOTHING (leave the
  bare note and set a `repoReadNote` "submitted link could not be matched to a
  single student"), so a URL is NEVER cross-attached to the wrong student. The
  owner's case ("the link IS the whole submission", one link file per student)
  has a unique citation name per student, so it attaches cleanly; only the
  ambiguous case is flagged. A single student with multiple link files that
  collide is the same `size > 1` branch (now flagged, not first-match -
  RES-BZF-4 updated).

The bulk ingest route (`grade-submission-zip/route.ts:131`) passes
`{ inferFileNamesWith: provider, deferLinks: true }`. BW2's partition and
sentinel are unchanged - the unresolved link entry is tiny (bare note), so it is
emitted as a normal `"entry"` line, well under `ITEM_REQUEST_BYTE_BUDGET`
(`buildIngestLines`, `ndjson-ingest-parser.ts:38-64`).

**`submissionUrl` rides the wire transparently.** `buildIngestLines` emits the
whole `entry` object; the parser's `isEntry` (`:93-100`) checks only
`student`/`content`/`submittedFiles`, so the extra `submissionUrl` field survives
`JSON.parse`; the driver's admission spreads `rawEntry` (`useContinuousGradingRun.ts:420`),
so `submissionUrl` reaches the `/api/grade-run-item` POST untouched. NO change to
the parser or the driver is needed for BW3 (confirmed by reading both).

### 4.3 The grade-run-item half (accept, validate, resolve, re-clamp)

In `grade-run-item/route.ts`:
- `parseRequestBody` (`:91-148`) newly reads `submissionUrl`: accept
  `typeof rawEntry.submissionUrl === "string"` with a bounded length (add
  `MAX_URL_CHARS`, e.g. 2048); otherwise leave it `undefined`. Add it to the
  reconstructed `entry` (`:114-122`). Validation is type+length ONLY - the SSRF
  safety is in the resolvers' host allowlists, not at this boundary (AC-BZF-5).
- After parse, before `gradeEntries` (`:201-202`), call
  `entry = await resolveEntryLinks(entry)` (inside the existing `raceWithTimeout`
  budget, or just before it - the resolver's own fetches have their own
  timeouts: `fetchGoogleDriveFile` `TOTAL_TIMEOUT_MS = 25_000`, `google-drive-content.ts:36`).
  `resolveEntryLinks` re-clamps content (AC-BZF-6).
- **Stamp the link outcome onto the RESULT (checker B1).** The link-not-fetched
  class is NOT computable from a `GradeResult`: `GradeResultBase` (`types.ts:235-294`)
  carries `gradedRepo`/`gradedRef` (`:273-274`) but NO `repoReadNote` or
  `submissionUrl` or link signal, and `gradedRepo === null` is also true for every
  ordinary text row - so an inferred predicate over results cannot tell a failed
  link from a plain submission. Fix: add an explicit field `linkFetch?: "ok" |
  "failed" | "flagged"` to `GradeResultBase` in `types.ts`, and in this route
  stamp it onto the result from the resolved entry's `entry.linkFetch` before
  returning (the route already holds `const result = outcome.value.results[0]` at
  `:216`): `return NextResponse.json({ sourceIndex, result: { ...result,
  linkFetch: entry.linkFetch } })`. No `engine.ts` edit is needed. BW4 reads
  `result.linkFetch`, never an inferred predicate.

**Why NOT touch `grading.ts` (correction to the prior scope).** The prior scope
(section 4) put a whole-run enrichment call in `grading.ts` (at 977 lines, 23
from the ceiling) to keep the batch path resolving links after ingest stopped.
The `deferLinks` option makes that unnecessary: the batch/engine path keeps
`deferLinks` absent (= today's inline resolution), so it needs NO change and
`grading.ts` is NOT edited. The tradeoff: the batch (GradingTab "grade all") path
does NOT gain Drive-link-in-zip grading - it keeps GitHub-only inline resolution,
exactly as today. That is not a regression (it grades no worse than today) and it
keeps BW3 small and trivially revertible. Recorded as RES-BZF-2.

### 4.4 The pure classification leaf (machine-checkable)

`planLinkResolution(url: string): { action: "github"|"drive-doc"|"drive-file"|"flag"; reason?: string }`
in a new leaf `src/lib/grade/link-resolution-plan.ts` (or colocated in
`extraction.ts` if small). Pure string logic reusing `parseSubmissionGithubUrl`,
`normalizeSubmittedRepoUrl`, `parseGoogleDriveUrl` - no fetch. This is the
per-type resolve/flag decision as a testable leaf: a Google-Docs URL -> `"drive-doc"`,
a GitHub URL -> `"github"`, Sheets/Slides/folder/other-host -> `"flag"` with
a reason. RED if a non-allowlisted host maps to a fetch action, or a Google-Docs
maps to `"flag"` (I-link-plan). NOTE (checker M1): `"drive-file"` is a URL-SHAPE
verdict only - this pure leaf cannot know a `drive.google.com/file/d/<id>` is
secretly a ZIP, so the archive/multi-entry case is caught by the POST-FETCH
single-entry guard in `resolveEntryLinks` (section 4.1 step 4), not here.

### 4.5 What is NOT trivially revertible (architect's required flag)

- `grade-run-item/route.ts` accepting+folding `submissionUrl` changes a live
  production route's body contract and network behaviour. The smallest safe
  revert also removes `resolveEntryLinks` and restores `deferLinks: false` on the
  bulk ingest - touches `extraction.ts` (shared) + two routes together. NOT small.
- The `deferLinks` option itself is additive and trivially revertible (default
  false preserves all existing callers).

---

## 5. INSTRUMENTS (machine-checkable; object / instrument / direction of failure)

Network is blocked (`vitest.setup.ts` throws on real `fetch`); mock
`fetchGradableRepoContent` / `fetchGoogleDriveFile`, never `fetch`. Run named
sets with `npm run test:paths <p1> <p2> ...`, never a raw multi-path vitest.
Every wave gate carries `src/file-size-ceiling.structure.test.ts` UNCONDITIONALLY.

### BW3
- **I-link-plan** (BW3, pure). Object: `planLinkResolution`. Instr: a table of URLs
  (github.com, vscode.dev/github, docs.google.com/document, drive file, Sheets,
  Slides, folder, random host) -> expected action. RED if a non-allowlisted host
  -> a fetch action, or a Google-Docs -> `"flag"`.
- **I-defer-ingest** (BW3, incl. checker B2). Object:
  `ingestZipEntries(..., {deferLinks:true})`. Instr: a zip whose link.html files
  carry the Canvas `name_id_id_` convention prefix (so the citation-name keying
  is exercised, NOT path keying); assert `fetchGradableRepoContent`/`fetchGoogleDriveFile`
  are NOT called, and each link student's entry carries `submissionUrl` + a bare
  note in `content`. RED if a fetch happens at ingest, or `submissionUrl` is unset
  because the map was keyed on path instead of `citationFileName` (the B2 bug).
  Extend `zip-link-resolution.test.ts`.
- **I-defer-collision** (BW3, checker B2). Object: the post-group attach. Instr: a
  zip where two DIFFERENT students' link files strip to the SAME citation name;
  assert NEITHER entry gets a `submissionUrl` (both flagged with a `repoReadNote`),
  so no URL is cross-attached. RED if a URL attaches to either student.
- **I-defer-off-unchanged** (BW3). Object: `ingestZipEntries` with `deferLinks`
  absent. Instr: the existing `zip-link-resolution.test.ts` "resolves before
  grouping" expectations stay GREEN unchanged. RED if the default behaviour
  changed (proves the batch path is untouched).
- **I-resolve-at-grade** (BW3, removal pair with I-defer-ingest). Object:
  `resolveEntryLinks`. Instr: an entry with a GitHub `submissionUrl` + mocked repo
  fetch folds code into `content` and sets `gradedRepo`/`gradedRef`; an entry with
  a Google-Docs `submissionUrl` + mocked Drive fetch folds the doc text. RED if
  the link never resolves at grade time. (Removal test for the leverage claim:
  delete the fold -> content lacks the repo code.)
- **I-resolve-never-throws** (BW3, AC-BZF-4). Object: `resolveEntryLinks` with a
  failing/flag URL. Instr: a failing fetch and a Sheets URL each return the entry
  with the bare note + a `repoReadNote` and `linkFetch` set (`"failed"`/`"flagged"`),
  never throw. RED if it throws or loses the note.
- **I-resolve-single-entry** (BW3, checker M1). Object: `resolveEntryLinks` on a
  `"drive-file"` whose fetched bytes are a ZIP. Instr: mock `fetchGoogleDriveFile`
  to return a zip buffer so `extractStudentEntries` would yield MULTIPLE entries;
  assert the resolver returns the ONE original entry on its bare note with
  `linkFetch: "flagged"`, and does NOT fold multiple students into the row. RED if
  the row absorbs >1 extracted entry (the A44 blend).
- **I-linkfetch-field** (BW3, checker B1). Object: `GradeResultBase` + the
  grade-run-item route. Instr: after grading a link entry, the returned
  `result.linkFetch` equals the resolved entry's outcome (`"ok"`/`"failed"`/`"flagged"`);
  a plain text submission leaves `linkFetch` undefined. RED if the field is absent
  from the result or always undefined. Extend `grade-run-item/route.test.ts`.
- **I-submissionurl-validated** (BW3, AC-BZF-5). Object: `route.ts parseRequestBody`.
  Instr: a non-string / over-length `submissionUrl` is rejected; a valid string is
  carried onto the entry. A non-allowlisted host is classified `"flag"` (not
  fetched). RED if a raw non-allowlisted URL is fetched. Extend
  `grade-run-item/route.test.ts`.
- **I-reclamp** (BW3, AC-BZF-6). Object: `resolveEntryLinks`. Instr: a fold that
  produces content over `MAX_CONTENT_CHARS` is clamped before return. RED if
  over-length content is returned.

### BW4
- **I-ledger-map** (BW4, pure, AC-BZF-8/10; checker B1/M2). Object: `buildLedgerView`.
  Instr: a ledger with skips + `failedSupportedFiles`, and run results that are
  REAL `GradeResult` objects carrying the new `linkFetch` field
  (`"failed"`/`"flagged"` on one, undefined on the rest) - NOT a fabricated
  excess-property shape. Assert: `skipped` and `linkNotFetched` are student-level
  and named; `failedFiles` is the per-file list (never counted as a student
  category); `accountedFor` reflects `studentsFound === studentsEmitted +
  skipped.length`. RED if `linkNotFetched` is derived by an inferred predicate
  (e.g. `gradedRepo === null`) instead of `result.linkFetch`, or if `failedFiles`
  is mixed into the student accounting.
- **I-ledger-retained** (BW4, lifecycle, Finding A/B). Object: the driver after a
  storaged-zip submit. Instr: inject an ingest returning `skipped:[...]` AND
  `failedSupportedFiles:[...]`; assert `driver.ingestLedger` exposes BOTH, and
  survives a subsequent `submit`. RED if `failedSupportedFiles` is absent (today)
  or the ledger is overwritten. Extend `useContinuousGradingRun.lifecycle.test.ts`.
- **I-progress-text** (BW4, pure, AC-BZF-7). Object: `describeBulkProgress`. Instr:
  phase+counts -> copy. RED on a one-off count or wrong phrasing.

### Owner-walk ONLY (no component renders; no live Storage/network/60s timer)
- RES-BZF-1: the live end-to-end grade of the owner's 12-13 MB / ~26-file zip,
  including the two Google-Docs link students, on prod.
- RES-BZF-5: the rendered ledger + progress indicator (markup, spacing, contrast
  in both themes).
- The real GitHub/Drive fetch behaviour (network blocked here; mocked in tests).

### Regression set (keep GREEN via `npm run test:paths -- <paths>`)
`extraction.test.ts`, `zip-link-resolution.test.ts`, `extraction.inference.test.ts`,
`ingestion-attribution.oracle.test.ts`, `collisionRefusal.wiring.test.ts`,
`grouping-zip-parents.wiring.test.ts`, `grading-chat-intake.test.ts`,
`useContinuousGradingRun.lifecycle.test.ts`, `incrementalRunPlan.test.ts`,
`google-drive-url.test.ts`, the `grade-run-item` route test, the
`grade-submission-zip` route test, and `src/file-size-ceiling.structure.test.ts`
unconditionally.

---

## 6. WAVE PLAN + WRITE SETS (co-priority, but SEQUENCED BW3 -> BW4)

BW3 and BW4 are **co-priority** (both block "complete") and their write sets are
**disjoint by exact path**. BUT BW4 reads the `GradeResult.linkFetch` field that
BW3 adds to `types.ts` (checker B1), so BW4 cannot typecheck until BW3 lands that
field. Therefore they are **SEQUENCED: BW3 lands first (including the `types.ts`
field), then BW4 reads it** - NOT run concurrently with each other. (A disjoint
backlog item with no grading-chat/grade-route overlap may still run concurrently
with whichever of these is in flight - section 7.) Each of BW3/BW4 is
independently pushable once BW3 has landed.

**BW3 - grade-time link resolution.** Owns:
- `src/lib/grade/types.ts` (add `linkFetch?: "ok"|"failed"|"flagged"` to
  `GradeResultBase` and to `StudentSubmissionEntry`; checker B1). BW3 owns this
  result-shape change; BW4 only reads it.
- `src/lib/grade/extraction.ts` (the `deferLinks` option; the citation-name URL
  threading + collision rule; export `resolveEntryLinks` with the post-fetch
  single-entry guard and the `linkFetch` population)
- `src/lib/grade/link-resolution-plan.ts` (NEW pure leaf `planLinkResolution`) +
  its test
- `src/app/api/grade-submission-zip/route.ts` (pass `deferLinks: true`)
- `src/app/api/grade-run-item/route.ts` (accept/validate `submissionUrl`, call
  `resolveEntryLinks`, re-clamp, stamp `result.linkFetch`) + `route.test.ts`
- `src/lib/grade/zip-link-resolution.test.ts`, `src/lib/grade/extraction.test.ts`
  (expectations: the defer path is new; the inline-default path stays green)
- The file that CALLS the new `resolveEntryLinks` export is
  `grade-run-item/route.ts`, in this wave (no dead export).

**BW4 - progress + skip/failed ledger.** Owns:
- `src/app/components/grading-chat/ingestLedger.ts` (NEW pure leaves
  `buildLedgerView` + `describeBulkProgress`) + its test
- `src/app/components/grading-chat/useContinuousGradingRun.ts` (retain
  `ingestLedger`; read `failedSupportedFiles`; clear on reset) +
  `useContinuousGradingRun.lifecycle.test.ts`
- `src/app/components/grading-chat/GradingChatPanel.tsx` (mount the ledger +
  progress label; the file that CALLS `buildLedgerView`/`describeBulkProgress`)
- optionally `src/app/components/grading-chat/grading-chat.module.css` (a neutral
  ledger block if `controls.notice` does not fit; visual seat decides)
- The caller of each new export (`GradingChatPanel.tsx`) is in this wave.

**Disjointness proof (exact path intersection).** BW3's WRITE set and BW4's WRITE
set share no path - BW4 does NOT edit `types.ts` (BW3 does); BW4 only READS the
`linkFetch` field. BW4 reads `ndjson-ingest-parser.ts`/`incrementalRunPlan.ts`
without writing them. So there is no write collision. The BW3->BW4 tie is a
TYPE/COMPILE dependency (BW4's `buildLedgerView` references `GradeResult.linkFetch`),
which is exactly why the waves SEQUENCE rather than run concurrently - the
runtime data (link-not-fetched rows) flows through `driver.run.results`, but the
field must EXIST in `types.ts` for BW4 to typecheck. Command to confirm the write
sets do not intersect (paste output; empty is the only pass):

```
comm -12 <(printf '%s\n' \
  src/lib/grade/types.ts src/lib/grade/extraction.ts \
  src/lib/grade/link-resolution-plan.ts \
  src/app/api/grade-submission-zip/route.ts src/app/api/grade-run-item/route.ts \
  src/lib/grade/zip-link-resolution.test.ts src/lib/grade/extraction.test.ts \
  src/app/api/grade-run-item/route.test.ts | sort) \
<(printf '%s\n' \
  src/app/components/grading-chat/ingestLedger.ts \
  src/app/components/grading-chat/useContinuousGradingRun.ts \
  src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts \
  src/app/components/grading-chat/GradingChatPanel.tsx \
  src/app/components/grading-chat/grading-chat.module.css | sort)
```

**Shared resource not on any file list:** `npx tsc --noEmit` has ONE caller (it
races on `tsconfig.tsbuildinfo`), and no two agents may sabotage-verify on the
tree at once. So the two waves build concurrently but the orchestrator serializes
the tsc/verify gate. `docs/BACKLOG.md` is written by the orchestrator, not either
wave.

**Design seats before build (regenerate briefs between waves):**
- BW3: security (the `submissionUrl` validation + the resolver allowlists +
  re-clamp), reliability (the per-item fetch timeouts vs the 50s route budget;
  `resolveEntryLinks` never-throw), test seat (I-link-plan / I-resolve-* / the
  removal pair).
- BW4: UX (the ledger copy + the progress phases + click count - zero new clicks,
  it is passive), visual + a11y (reading claims; the ledger as a live region if
  it updates during the run). Test seat (I-ledger-map / I-ledger-retained /
  I-progress-text).

---

## 7. SERIALIZATION (vs in-flight work)

- **BW3+BW4 are DISJOINT from WORKFLOWS-COLLAPSE.** The working tree's modified
  files (`git status`) are nav/IA: `WorkflowsPanel.tsx`, `useAppNavigation.ts/.test.ts`,
  `tab-rails.ts/.test.ts`, `tab-sections.ts/.test.ts`, `topLevelTabs.wiring.test.ts`,
  `page.tsx`, `url-state.ts/.test.ts`, `drafts-nav.ts`, plus new
  `url-state.automate-collapse.test.ts` and `workflows-drafts-library-migration.ts/.test.ts`.
  None is in BW3's or BW4's write set. The collapse W2 (still to come) stays in
  the nav/IA area; BULK-ZIP-FINISH touches grading-chat + grade routes +
  extraction. No intersection.
- **`GradingChatPanel.tsx` (BW4) is NOT touched by WORKFLOWS-COLLAPSE** (confirmed
  against the modified list above). The collapse touches `page.tsx`, which mounts
  `GradingChatPanel` as a sibling but does not edit the panel; BW4 edits the panel
  body. A `page.tsx` edit by the collapse and a `GradingChatPanel.tsx` edit by BW4
  are different files - disjoint. If the collapse's W2 re-parents the grading
  mount in `page.tsx` while BW4 is in flight, that is a `page.tsx` conflict the
  orchestrator sequences, NOT a BW4 file; BW4 does not edit `page.tsx`.
- **BW0 (ZIP-BOMB-CAPS) and BW1/BW2 are SHIPPED.** BW3 builds ON `extraction.ts`'s
  existing `zip-caps` routing (read-only there) and BW2's route/parser/driver.

---

## 8. DISPOSITION OF THE PRIOR SCOPE'S BW3/BW4 (ID column re-derived LAST)

| Prior item (`bulk-zip-grading-scope.md`) | Disposition | Where it goes |
|---|---|---|
| BW3 "FIX-4 defer link resolution", scoped GitHub-only + deferrable | SUPERSEDED, widened + made REQUIRED | This doc BW3: Drive/Docs parity added, co-priority with BW4 (owner clarification 2026-10-08) |
| BW3's whole-run enrichment call in `grading.ts` (section 4, the "ONE surgical add") | WITHDRAWN | Replaced by the `deferLinks` default-false option; batch path keeps inline resolution, `grading.ts` is NOT edited (section 4.3). RES-BZF-2 records the batch-path Drive gap |
| BW3's `resolveEntryLinks` single shared resolver | KEPT, deepened | Now folds Drive as well as GitHub (section 4.1) |
| BW3's `parseRequestBody` accepts+validates `submissionUrl` | KEPT | Section 4.3; validation is type+length, allowlist in the resolvers (I-submissionurl-validated) |
| RES-BZ-7 (`parseSubmissionGithubUrl` owner/repo traversal, UNFILED) | DISCHARGED | Fixed by `74acf814`; backlog `GITHUB-URL-TRAVERSAL` now `verification`. BW3 relies on the hardened parser; does not re-own it |
| BW4 "skip ledger + progress", scoped as "render EXISTING data" | SUPERSEDED, corrected | This doc BW4: the skip list is transient and `failedSupportedFiles` is dropped (Findings A/B), so BW4 adds a structured hook ledger, then renders |
| RES-BZ-9 (NESTED-ZIP-SILENT-SKIP, carried) | CARRIED, unchanged | Still its own backlog row; BW2's skip partition is its surface. Not owned here |
| RES-BZ-1/2/3/4/5/6/8/10 (prior residuals) | CARRIED where live | RES-BZ-1 (owner-walk e2e) -> RES-BZF-1; RES-BZ-10 (segment bind) discharged by BW1 ship; the rest remain on the BULK-ZIP backlog row, not re-owned here |

No enforcer is deleted: the `deferLinks` default-false keeps every existing
`ingestZipEntries` caller (batch/engine) on today's resolution, and
`zip-link-resolution.test.ts`'s existing expectations stay green (I-defer-off-unchanged).

---

## 9. RESIDUAL REGISTER (owner / instrument / step - else it is a deletion)

Each must be filed under the `| BULK-ZIP |` row in `docs/BACKLOG.md` (which now
EXISTS, status `actionable` - measured 2026-10-08, contrary to the prior scope's
"no BULK-ZIP row"). The orchestrator files these; this scope cannot.

- **RES-BZF-1 (owner-walk):** end-to-end grade of the owner's 12-13 MB / ~26-file
  zip on prod, INCLUDING the two Google-Docs link students grading on their Doc
  text. Owner: repo owner. Instrument: owner-walk (live Storage + browser + prod
  tick). Step: after BW3+BW4, owner drops the real zip and confirms the two link
  students got real grades and the ledger is empty/correct.
- **RES-BZF-2 (product/reliability):** the batch (GradingTab "grade all") path
  does NOT gain Drive-link-in-zip grading - it keeps GitHub-only inline resolution
  (`deferLinks` absent). Owner: owner (product). Instrument: I-defer-off-unchanged
  (proves it is unchanged, not regressed). Step: record; wire the batch path to
  `deferLinks` only if the owner uses that surface for link-bearing zips.
- **RES-BZF-3 (product):** a Drive FOLDER or a Drive link to a ZIP inside a bulk
  zip is FLAGGED, not fanned into multiple students (one pump row cannot fan out).
  Owner: owner (product). Instrument: I-link-plan (`"flag"` branch) + BW4's ledger.
  Step: record; a future row could pre-expand such links at ingest.
- **RES-BZF-4 (edge):** under the citation-name uniqueness rule (section 4.2), a
  citation name that maps to >1 link path - whether two different students (the
  B2 collision) or one student with multiple link files - is FLAGGED (no URL
  attached, `repoReadNote` set), never first-match-attached. The owner's 1:1
  case is unaffected. Owner: BW3 implementer. Instr: I-defer-collision. Step: BW3
  documents the flag; revisit only if real zips show legitimate multi-link
  students who need each link graded.
- **RES-BZF-5 (owner-walk):** the rendered ledger + progress indicator (markup,
  spacing, contrast in both themes, emoji-free). Owner: UX/visual/a11y seats +
  owner. Instrument: owner-walk (no component renders under vitest) + the
  no-emoji test over any new copy strings. Step: Wave-3 design against the
  as-built diff; owner confirms on prod.
- **RES-BZF-6 (reliability, carried):** whether `resolveEntryLinks`' per-item
  fetch (GitHub fold or a 25s Drive fetch) plus the model call fits the route's
  `TOTAL_BUDGET_MS = 50_000` (`grade-run-item/route.ts:51`) for a big repo/doc.
  Owner: reliability seat + owner. Instrument: the route's existing
  `raceWithTimeout` 504 path for the agent half; wall-clock for the owner half.
  Step: BW3 relies on the existing budget; owner confirms on a real big-repo link.

---

## 10. `owns` / FILES CITED

Candidate write-set command (files a build wave edits OR reads as source text, so
a change can turn a test red without a behaviour change):

```
grep -rl "resolveLinkSubmissions\|resolveSubmittedLink\|ingestZipEntries\|resolveEntryLinks\|submissionUrl\|fetchGoogleDriveFile\|fetchGradableRepoContent\|parseGoogleDriveUrl\|parseSubmissionGithubUrl\|failedSupportedFiles\|ingestStoragedZip\|useContinuousGradingRun" src/app src/lib
```

Files opened and cited in this pass (all read directly):
`src/lib/grade/extraction.ts` (`ingestZipEntries:213-243`, `resolveLinkSubmissions:511-529`,
`resolveSubmittedLink:489-501`, `foldGithubRepoContent:442-476`,
`canvasWorkToEntry:537-662`), `src/lib/grade/utils.ts` (`groupSubmissionsByStudent:439-498`),
`src/lib/grade/types.ts` (`StudentSubmissionEntry:447-471`),
`src/app/api/grade-run-item/route.ts` (`parseRequestBody:91-148`, `MAX_CONTENT_CHARS:57`,
`TOTAL_BUDGET_MS:51`, `gradeEntries:202`),
`src/app/api/grade-submission-zip/route.ts` (`ingestZipEntries call:131`,
`buildIngestLines:148`), `src/lib/grade/ndjson-ingest-parser.ts`
(`buildIngestLines:38-64`, `isEntry:93-100`, `ledger.skipped/failedSupportedFiles:196-197`),
`src/app/components/grading-chat/useContinuousGradingRun.ts` (storaged-zip submit:294-314,
`ingestSkipped:310`, `failedSupportedFiles` NOT read, partial outcome:444-461,
result:518-538, reset:493-516), `src/app/components/grading-chat/GradingChatPanel.tsx`
(`submitStoragedZip:255-267`, submitError:475-479, progress indicator:480-506,
stickyComposer:466-512), `src/app/actions/grading-chat-intake.ts` (`resolveOnePart` url
branch:214-288, `buildRepoUrlEntry:93-108`), `src/lib/grade/repo-content.ts`
(`fetchGradableRepoContent:55`), `src/lib/grade/google-drive-content.ts`
(`fetchGoogleDriveFile:161-241`, host allowlist:38-50, `TOTAL_TIMEOUT_MS:36`),
`src/lib/grade/canvas-link-submission.ts` (`extractCanvasSubmittedUrl:43-57`,
`normalizeSubmittedRepoUrl:66-77`), `src/lib/google-drive-url.ts`
(`GoogleDriveTarget:16-19`, `parseGoogleDriveUrl:54-107`),
`src/app/components/GradingResults.tsx` (`unresolvedStudents:189,224,726`),
`docs/bulk-zip-grading-scope.md`, `docs/BACKLOG.md` (grep for `| BULK-ZIP |`,
`GITHUB-URL-TRAVERSAL`, `NESTED-ZIP`).

Tests that read these files AS SOURCE TEXT (include in each build wave's gate):
`extraction.test.ts`, `zip-link-resolution.test.ts`, `extraction.inference.test.ts`,
`ingestion-attribution.oracle.test.ts`, `collisionRefusal.wiring.test.ts`,
`grouping-zip-parents.wiring.test.ts`, `grading-chat-intake.test.ts`,
`useContinuousGradingRun.lifecycle.test.ts`, `incrementalRunPlan.test.ts`,
`google-drive-url.test.ts`, the `grade-run-item` route test, the
`grade-submission-zip` route test, and `src/file-size-ceiling.structure.test.ts`
unconditionally.
