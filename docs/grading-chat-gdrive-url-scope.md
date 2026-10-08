# GRADING-CHAT-GDRIVE-URL - scope and wave plan (round 1, UNCHECKED)

Status: authored by the architecture/scoping seat. NOT yet checked by a fresh
`loop-checker`. Recon + design + wave plan only; no production code, no test,
no CSS was changed by this seat. This is the first version of this scope; it
restructures no prior artifact, so the disposition table is N/A (stated in
section 9).

Owner request (direct chat, 2026-10-06), verbatim: "the grading chat tool also
needs to be able to accept google drive sharing url's".

Tree measured at HEAD `f18406ae` (`git rev-parse --short HEAD`).

---

## 0. Measured quantities and the command that produced each

| Quantity | Value | Command |
|---|---|---|
| `grading-chat-intake.ts` lines | 210 | `@(Get-Content src/app/actions/grading-chat-intake.ts).Count` (PowerShell) and `wc -l` agree (both 210) |
| `ChatComposer.tsx` lines | 203 | `@(Get-Content ...ChatComposer.tsx).Count`; `wc -l` agrees (203) |
| `submission-repo.ts` lines | 240 | `@(Get-Content ...).Count` |
| `repo-content.ts` lines | 134 | `@(Get-Content ...).Count` |
| `canvas-url.ts` lines | 128 | `@(Get-Content ...).Count` |
| Per-item wire budget `ITEM_REQUEST_BYTE_BUDGET` | `= UPLOAD_WIRE_BUDGET_BYTES` | `grep -n "ITEM_REQUEST_BYTE_BUDGET" src/app/components/grading/incrementalRunPlan.ts` (`:42`) |
| `UPLOAD_WIRE_BUDGET_BYTES` | `3.5 * 1024 * 1024` = 3,670,016 bytes | `grep -n "UPLOAD_WIRE_BUDGET_BYTES\s*=" src/lib/upload-budget.ts` (`:41`) |
| Max on-disk file bytes for that wire budget | ~2.75 MB (budget / BASE64_INFLATION, 4/3) | `maxFileBytesForWireBudget` (`upload-budget.ts:65`), `BASE64_INFLATION = 4/3` (`:44`) |
| Existing Drive OAuth scope | Calendar only, NO Drive scope | `GOOGLE_CALENDAR_SCOPES` (`src/lib/google-oauth.ts:12-15`): `calendar.readonly`, `calendar.events` |
| Existing Drive parser/fetcher module | none | `ls src/lib | grep -i drive` returns only `google-calendar*`, `google-credentials`, `google-oauth` (no drive module); `grep -rin "drive\.google\|docs\.google" src` returns only a help-center resource link (`resource-links/tool-tutorials.ts:120-122`) and an explicit "ruled out" comment (`courses/MiscFilesCell.tsx:4`) |
| vitest fetch behaviour | throws on real `fetch` | `vitest.setup.ts:45-53` (`globalThis.fetch = blocked`) |

---

## 1. The seam, verified against the tree

The owner request adds one branch to one existing decision point. Everything
below was opened, not recalled.

### 1.1 The branch point

`src/app/actions/grading-chat-intake.ts`, `prepareChatSubmissionAction`,
`kind === "url"` (`:170-207`). Today the order is:

1. `detectCanvasUrlKind(url)` (`src/lib/canvas-url.ts:32`) -> `extractCanvasEntries` (`:176-189`).
2. else `parseSubmissionGithubUrl(url)` (`src/lib/submission-repo.ts:47`) ->
   `fetchGradableRepoContent` (`src/lib/grade/repo-content.ts:55`) -> `buildRepoUrlEntry` (`:191-201`, local `:76-91`).
3. else REFUSE: `"This surface accepts Canvas assignment/discussion URLs and
   GitHub repo URLs. Arbitrary web URLs are not supported yet."` (`:203-206`).

The Google Drive branch slots in as a **new step 2.5, before the final
refuse** (`:203`), and the refuse copy at `:203-206` widens to name Google
Drive (section 4 of this scope). No other branch changes.

### 1.2 The reuse targets, each opened

- `buildSingleFileEntry(name, Buffer)` (`src/lib/grade/single-file-entry.ts:72-133`):
  turns a filename + bytes into one `StudentSubmissionEntry` by extension -
  image, text, or office document. Returns `null` when the text could not be
  extracted. This is the target for a fetched single Drive file. It classifies
  **by extension only**, never by sniffing bytes (`:14-21` comment; `getFileExtension`
  at `:73`) - so a correct `name` with a correct extension is load-bearing (see
  the crux in section 3.3).
- `classifyGradingUpload(name)` (`single-file-entry.ts:36-45`): `"zip" | "single"
  | "unsupported"` by extension. The file-upload path at intake `:140-160`
  dispatches on exactly this; the Drive path mirrors it once bytes are in hand.
- `extractStudentEntries(arrayBuffer, { inferFileNamesWith })` (`src/lib/grade/extraction.ts:154`):
  the zip path the file-upload branch uses at intake `:159`. Reused unchanged if
  a Drive link resolves to a `.zip`.
- `firstOversizedEntryReason(entries)` (intake `:96-103`): final per-entry wire
  bound, already applied on every branch (`:125,161-162,182-183,198-199`). The
  Drive branch applies it identically.
- `checkFileWireBudget(fileBytes, what)` (`src/lib/upload-budget.ts:101-107`):
  the disk-bytes-to-wire-bytes refusal the file path applies at `:135`. The
  Drive fetcher applies it to the fetched byte length.
- `getFileExtension` (`src/lib/office-extract.ts`, imported at intake `:19`),
  `TEXT_EXTENSIONS`/`DOCUMENT_EXTENSIONS`/`IMAGE_EXTENSIONS` (`office-extract.ts:13,55`;
  `grade/constants.ts` IMAGE set) - the vocabulary of what a Drive file's
  derived name is allowed to be.

### 1.3 The mirror for the new helpers

The GitHub path is the exact shape to copy: a **pure URL parser**
(`parseSubmissionGithubUrl`, `submission-repo.ts:47-91`, no network, returns a
parsed struct or `{ error }`, never throws) plus a **server-only async fetcher**
(`fetchGradableRepoContent`, `repo-content.ts:55-134`, returns content or
`{ error }`, never throws). The Canvas parser (`canvas-url.ts`) is the model for
a pure, client-safe parser importable from both server and client. The Drive
helpers follow both: `google-drive-url.ts` pure/client-safe; the fetcher
server-only.

### 1.4 The AUTH finding - a correction to the brief

The brief states "the app has NO Google Drive OAuth." Measured, the sharper
truth is: **the app HAS Google OAuth, but only with Calendar scopes**
(`GOOGLE_CALENDAR_SCOPES`, `google-oauth.ts:12-15`: `calendar.readonly`,
`calendar.events`). There is a full token store (`google-credentials.ts`:
encrypted at rest, refresh, `getValidAccessToken` at `:128`). **None of it can
read a Drive file**: the Drive API requires a `drive.readonly`/`drive.file`
scope that is not in the grant, so the stored token would 403 against Drive.

Consequences for this scope:

- The effect the brief relies on holds: **v1 is public-link-only ("anyone with
  the link").** A private/permissioned link cannot be read.
- **The Drive fetcher must NOT reach for `getValidAccessToken`.** Attaching the
  calendar token to a Drive request would (a) not work, and (b) leak a calendar
  bearer token to a download host - a security defect. The fetch carries NO
  credential, by construction.
- An OAuth-authenticated Drive path is a **residual** (RES-GDRIVE-5), not v1:
  it would need `drive.readonly` added to the scope list (forcing every owner
  to re-consent), a Drive API client, and the Drive `files.get?alt=media` flow.
  It has a partial foundation (the token store) but is a materially larger item.

---

## 2. Leverage note for the Acceptance-criteria seat (not authored here)

Per `DEV_LOOP.md` "The loop / Criteria", the leverage claim opens the AC
document, not this scope. This is feature-shaped (a new ingestion channel a
user reaches), so a claim is owed. The honest reading, handed to the AC seat to
decide (never defaulted by this seat, per `leverage.md`):

- The thin, real advantage: the app **fetches bytes a chat window cannot
  receive** - a binary `.docx`/`.pdf`/image hosted behind a Drive link - exactly
  as the existing GitHub-repo path already does, with the human pasting only a
  link, not relaying the bytes. A chat would require the user to download and
  paste (and cannot ingest a binary at all).
- This is NOT a categorical new class; it extends the same ingestion-reach the
  GitHub/Canvas URL paths already have (neither of which is itself claimed as
  leverage). It is most honestly recorded as **click-cost + reach**, parallel to
  `leverage.md`'s treatment of the GitHub path, NOT dressed as INTEGRATION (the
  human still initiates) or CORPUS (nothing new is persisted and read back).
- Removal-test honesty: because the advantage is click-cost/reach on an
  ingestion path and nothing renders under vitest, the AC/test seats will likely
  find **no buildable removal test here** and must record a residual with an
  owner and a step (`seats.md`, Test seat; the parser oracle in section 6 is a
  correctness instrument, not a removal test).

---

## 3. The mechanism, end to end

### 3.1 Files

| File | New/Edit | Role | Est. lines |
|---|---|---|---|
| `src/lib/google-drive-url.ts` | NEW | Pure, client-safe: parse a Drive URL -> discriminated result; sanitize the file id; build the canonical download URL. No `fetch`, no `Buffer`. | ~90 |
| `src/lib/google-drive-url.test.ts` | NEW | The frozen-table oracle for the parser + builder + id sanitizer (section 6). | ~140 |
| `src/lib/grade/google-drive-content.ts` | NEW | Server-only async fetcher: constructed download URL -> host-allowlisted `fetch` with size cap + content-type guard -> `{ name, buffer }` or `{ error }`. Mirrors `repo-content.ts`. | ~110 |
| `src/app/actions/grading-chat-intake.ts` | EDIT | Add the Drive branch at `:203` (before the final refuse); widen the refuse copy at `:203-206`. The CALLER of both new exports. | +~35 (to ~245) |
| `src/app/components/grading-chat/ChatComposer.tsx` | EDIT (W2, serialized) | Widen the URL-field label at `:188`. One line. Collision point - see section 7. | +0 / 1 line changed |

No file approaches the 1000-line ceiling (`this-repo.md` section 1): the
largest touched is the intake action at ~245.

### 3.2 The parser contract (`google-drive-url.ts`)

```
export type GoogleDriveTarget =
  | { readonly kind: "file"; readonly id: string }
  | { readonly kind: "native-doc"; readonly docType: "document" | "spreadsheet" | "presentation"; readonly id: string }
  | { readonly kind: "folder"; readonly id: string };

// null => not a Google Drive/Docs URL at all (caller falls through to refuse).
export function parseGoogleDriveUrl(raw: string): GoogleDriveTarget | null;

// The canonical, host-fixed download URL for a file target. The id is the ONLY
// attacker-influenced input, and it is validated to DRIVE_ID charset first.
export function buildDriveDownloadUrl(id: string): string;          // https://drive.google.com/uc?export=download&id=<id>
export function buildDriveDocExportUrl(docType, id): string;         // https://docs.google.com/<path>/d/<id>/export?format=txt

export const DRIVE_ID = /^[A-Za-z0-9_-]+$/;   // Google file ids are URL-safe base64-ish
```

URL shapes the parser recognises (host must be `drive.google.com` or
`docs.google.com`, case-insensitive, optional `www.`):

| Input shape | Result |
|---|---|
| `drive.google.com/file/d/{ID}/view?usp=sharing` | `{ kind: "file", id: ID }` |
| `drive.google.com/open?id={ID}` | `{ kind: "file", id: ID }` |
| `drive.google.com/uc?export=download&id={ID}` (and `uc?id={ID}`) | `{ kind: "file", id: ID }` |
| `drive.usercontent.google.com/download?id={ID}&...` | `{ kind: "file", id: ID }` (accepted so a user who pastes the redirected form still works) |
| `docs.google.com/document/d/{ID}/edit` | `{ kind: "native-doc", docType: "document", id: ID }` |
| `docs.google.com/spreadsheets/d/{ID}/...` | `{ kind: "native-doc", docType: "spreadsheet", id: ID }` |
| `docs.google.com/presentation/d/{ID}/...` | `{ kind: "native-doc", docType: "presentation", id: ID }` |
| `drive.google.com/drive/folders/{ID}` (and `.../drive/u/0/folders/{ID}`) | `{ kind: "folder", id: ID }` |
| any non-Drive host, or a Drive host with no extractable id, or an id failing `DRIVE_ID` | `null` |

Like `parseSubmissionGithubUrl`, it accepts a scheme-less paste (prepend
`https://` before `new URL`, mirroring `submission-repo.ts:40,53`) and never
throws.

### 3.3 The fetcher contract (`google-drive-content.ts`) - and the crux

```
export interface FetchedDriveFile { readonly name: string; readonly buffer: Buffer; }
export async function fetchGoogleDriveFile(target: GoogleDriveTarget): Promise<FetchedDriveFile | { error: string }>;
```

Never throws (every failure -> `{ error }`), matching `fetchGradableRepoContent`.
Steps:

1. Build the URL **ourselves** from the sanitized id (`buildDriveDownloadUrl`
   for `file`, `buildDriveDocExportUrl` for a supported `native-doc`). The raw
   user URL is never fetched - only the id survives parsing.
2. `fetch(url, { redirect: "manual" })` with NO credentials and NO cookies.
   - On a 3xx: read `Location`; accept ONLY if its host is in the Google
     download allowlist (`drive.google.com`, `drive.usercontent.google.com`,
     `*.googleusercontent.com`, `docs.google.com`); otherwise `{ error }`.
     Follow at most a small fixed number of hops (e.g. 3).
   - On 401/403: `{ error: "<not publicly shared> message" }` (section 4).
3. **Size cap before reading the body:** if `Content-Length` exceeds
   `UPLOAD_WIRE_BUDGET_BYTES`-equivalent on-disk bytes
   (`maxFileBytesForWireBudget()`), `{ error: "<too large> message" }`. Then cap
   the actual read as a backstop (abort past the ceiling), since Drive may omit
   `Content-Length`.
4. **Content-type guard:** if the response `Content-Type` is `text/html`
   (a sign-in page or the large-file virus-scan interstitial - see FORK-4), do
   NOT treat it as a file; `{ error }` with the sharing-or-size message. This is
   the single rule that handles both the private-link HTML and the interstitial
   HTML without following any confirm token (justified in FORK-4).
5. **Derive the name (the crux).** `buildSingleFileEntry`/`classifyGradingUpload`
   key off the extension of `name`, so the fetcher must produce a name with the
   right extension:
   - `native-doc` (document, exported `format=txt`): name = `<slug>.txt`
     (extension known from the export format).
   - `file`: read the filename from `Content-Disposition` (`filename*=` then
     `filename=`); else map `Content-Type` -> extension via a small table
     (`application/pdf`->`pdf`, the DOCX/PPTX/XLSX mimes, `image/png`->`png`,
     etc.); else `{ error: "could not determine the file type; download it and
     drop the file instead" }`. Deriving a real extension is REQUIRED, not
     optional - a name without a recognised extension classifies as
     `"unsupported"` and would refuse anyway.

### 3.4 The intake branch (`grading-chat-intake.ts`, new step 2.5)

Inserted before `:203`:

```
const driveTarget = parseGoogleDriveUrl(url);
if (driveTarget) {
  if (driveTarget.kind === "folder")    return refuse(FOLDER_MSG);
  if (driveTarget.kind === "native-doc" && driveTarget.docType !== "document")
                                        return refuse(SHEETS_SLIDES_MSG);
  try {
    const fetched = await fetchGoogleDriveFile(driveTarget);
    if ("error" in fetched) return { kind: "refused", reason: fetched.error };
    // From here, mirror the file-upload path (:140-163) exactly:
    const uploadKind = classifyGradingUpload(fetched.name);
    if (uploadKind === "unsupported") return refuse(UNSUPPORTED_TYPE_MSG);
    let entries: StudentSubmissionEntry[];
    if (uploadKind === "single") {
      const entry = await buildSingleFileEntry(fetched.name, fetched.buffer);
      if (!entry) return refuse("This file could not be read.");
      entries = [entry];
    } else {
      // reuse the existing zip path; A44 collision refusal throws from here and is surfaced verbatim
      const ab = new Uint8Array(fetched.buffer).slice().buffer;   // own ArrayBuffer, not the pooled Node one
      entries = await extractStudentEntries(ab, { inferFileNamesWith: provider });
    }
    const oversized = firstOversizedEntryReason(entries);
    if (oversized) return { kind: "refused", reason: oversized };
    return { kind: "entries", entries, pointsPossible: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read this Google Drive link.";
    return { kind: "refused", reason: message };
  }
}
```

A Drive-hosted file behaves identically to a dropped file once bytes are in
hand - the same classify -> single/zip -> entry path, the same oversize
backstop. `pointsPossible` is `null` (a Drive link carries no Canvas point
scale), matching every non-Canvas branch.

`parseGoogleDriveUrl` returning `null` means "not a Drive URL" and falls through
to the widened final refuse (section 4). Canvas and GitHub precedence are
unchanged (the Drive branch is after both).

---

## 4. Refusal / default copy for every unsupported shape

Each string is the user-facing `reason`. No emojis (`no-emojis.test.ts`).

| Case | Copy |
|---|---|
| Private / not link-shared (401/403 or sign-in HTML) | `This Google Drive link is not publicly shared (anyone with the link). Make it link-shareable, or download the file and drop it in instead.` |
| Too large (Content-Length or interstitial HTML over the budget) | `This Google Drive file is too large to grade on this surface. Download it and drop in a smaller file, or share just the file you want graded.` |
| Folder link | `This is a Google Drive folder, which is not supported yet. Open the folder and share a single file's link, or download the files and drop them in.` |
| Sheets / Slides native doc | `Google Sheets and Slides links are not supported yet. Share a Google Doc, or export the file and drop it in.` |
| Type undeterminable / unsupported extension | `This file type is not supported for grading. Download it and drop in a text file, document, image, or zip archive.` |
| Final fall-through (not Canvas, GitHub, or Drive) - WIDENED from `:203-206` | `This surface accepts Canvas assignment/discussion URLs, GitHub repo URLs, and Google Drive share links. Other web URLs are not supported yet.` |

---

## 5. The forks, each with a recommended reading

Per the never-stall rule, these are recommendations acted on as the default of
this scope; the owner's answer to any one ends the activity and is applied as
transcription (section 7). None gates the build of the parser oracle.

- **FORK-1 - which URL shapes (crux: machine-checkable).** RECOMMEND: accept
  `file/d/{ID}`, `open?id={ID}`, `uc?export=download&id={ID}`/`uc?id={ID}`, and
  the redirected `drive.usercontent.google.com/download?id={ID}` form; parse the
  id and canonicalize to `buildDriveDownloadUrl`. Justification: these are the
  four share forms a user actually copies; all reduce to one id. The parser is
  the oracle (section 6).

- **FORK-2 - native Docs/Sheets/Slides.** RECOMMEND (a)-narrowed: **support
  Google Docs (document) export to text** (`/document/d/{ID}/export?format=txt`
  -> `.txt` name -> the existing text path), and **refuse Sheets and Slides by
  name**. Justification by grading value vs complexity: a Google Doc is the most
  common "share a link" artifact for written-work grading, and txt export reuses
  `buildSingleFileEntry`'s text branch with zero new extraction; Sheets/Slides
  are rare for this surface and their txt export is near-useless, while pdf/docx
  export would drag in binary extraction for marginal value. Fallback the owner
  may pick: (b) refuse ALL native docs in v1 (smallest surface). Cost of being
  wrong: the Docs branch is ~4 lines reusing the file path.

- **FORK-3 - folders.** RECOMMEND: out of scope for v1, refuse with the folder
  message, record RES-GDRIVE-4. Justification: needs the Drive API + listing +
  auth, none of which exists.

- **FORK-4 - the large-file virus-scan interstitial.** RECOMMEND: **detect the
  HTML response and refuse; do NOT follow the confirm token.** Justification
  (the decisive measured fact): the interstitial only appears for public files
  large enough to trigger the scan (Google's threshold is ~25 MB), and our
  on-disk ceiling is ~2.75 MB (`maxFileBytesForWireBudget`, section 0). **Every
  file that triggers the interstitial already exceeds our budget**, so following
  the confirm token would only let us then refuse for size - net zero, at the
  cost of a fragile, frequently-changed token/cookie dance. The content-type
  guard (section 3.3 step 4) collapses the interstitial case and the private-link
  case into one "not a file" refusal. EXTERNAL-FACTS residual RES-GDRIVE-6: the
  ~25 MB threshold and the exact interstitial behaviour are Google-side facts
  not verifiable in this repo (network-blocked); confirm at the owner walk.

- **FORK-5 - auth.** RECOMMEND: public-link-only, NO credential attached (see
  the corrected finding in section 1.4). Private links refuse with the sharing
  message. Authenticated Drive is RES-GDRIVE-5.

- **FORK-6 - does this need a dedicated security pass?** RECOMMEND: **yes, one
  brief `loop-seat` security pass** in wave 2's design slot. Justification: it
  fetches remote bytes, which is the trigger in `seats.md` (any new network
  egress). It is far more bounded than the "arbitrary web URLs" the existing
  refuse defers (section 1.1) - the host is fixed by construction and only the
  id is user-influenced - so the pass is cheap and mostly confirmatory, but
  remote-byte egress earns it. The security note below is the starting brief.

---

## 6. What is machine-checkable vs owner-walk

### 6.1 Machine-checkable: the parser oracle (`google-drive-url.test.ts`)

`parseGoogleDriveUrl`, `buildDriveDownloadUrl`, `buildDriveDocExportUrl`, and
the `DRIVE_ID` sanitizer are **pure functions with no network** - fully testable
here. The oracle is a **frozen table** of input URL -> expected result, its
axes drawn from a different source than the implementation (the URL-shape
catalogue in section 3.2, authored before the code), per the Test seat rule
that generator and expected table must not share hardcoded axes.

Pass condition (object / instrument / failure direction):
- Object: each catalogue URL and its expected `GoogleDriveTarget | null`.
- Instrument: `npm run test:paths src/lib/google-drive-url.test.ts` (single
  path; the wrapper is still the correct form, but if the test seat gates the
  parser alongside the intake's own test it MUST use
  `npm run test:paths <p1> <p2>`, never a raw multi-path `vitest`).
- Fails when: a recognised shape returns `null` or the wrong `kind`/`docType`;
  an id with a character outside `DRIVE_ID` is accepted; a non-Drive host
  (github.com, a Canvas host, an arbitrary host) returns non-`null`; the built
  download URL's host is anything but `drive.google.com`/`docs.google.com`.

Required oracle rows (minimum): every row of the section 3.2 table; a
scheme-less paste; a URL whose id contains a `/` or `.` (must reject or stop at
the id boundary); a `github.com` repo URL and a Canvas `/courses/.../assignments/...`
URL (both -> `null`, proving Drive does not shadow the earlier branches); an
`http://` Drive URL; a Drive host with a typo (`drive.google.com.evil.com` ->
`null`, proving host match is exact, not substring).

Sabotage the test seat should run (each must go red, restored from a `cp`
backup, never `git checkout`): (a) relax the host check to `.includes("drive.google.com")`
-> the `drive.google.com.evil.com` row goes red; (b) drop the `DRIVE_ID`
validation -> the `/`-in-id row goes red; (c) have `buildDriveDownloadUrl`
interpolate the raw input instead of the id -> a host-of-built-URL assertion
goes red.

### 6.2 Owner / browser-walk ONLY (cannot be exercised here)

`vitest.setup.ts:45-53` throws on real `fetch`, and no component renders. So
**the entire fetch path is owner-walk**, stated plainly:

- A real public Drive file link downloaded and graded end to end.
- A private link refused with the sharing message.
- A Google Doc link exported to text and graded.
- A Sheets/Slides link and a folder link refused by name.
- A file over ~2.75 MB refused for size; the interstitial behaviour (FORK-4).
- The redirect allowlist actually rejecting an off-Google `Location`.

The intake branch's wiring (that `parseGoogleDriveUrl` is called, folder/sheets
refused before any fetch, the classify->entry mapping) can be unit-tested with
a **mocked** `fetchGoogleDriveFile` (`vi.mock` the module), the same way the
repo already tests fetch-bearing paths by mocking the fetcher, NOT `fetch`
(`vitest.setup.ts:24` + the memory note "mock canvasFetch not fetch"). The test
seat decides whether to add that intake wiring test; it is not the oracle.

---

## 7. Owner decisions (every answer terminates this activity)

This activity ships sections 3-6 with the FORK recommendations applied as
defaults. Each answer is transcription and reopens nothing.

- OD1 (FORK-2): Docs->txt supported, Sheets/Slides refused (recommended), or
  refuse all native docs (fallback). Cost if wrong: ~4 lines.
- OD2 (FORK-4): refuse interstitial (recommended) vs follow the confirm token.
  Cost if wrong: the fetcher's HTML branch, plus the fragility residual.
- OD3 (FORK-6): one brief security pass (recommended) vs rely on this scope's
  security note. Cost if wrong: one `loop-seat` dispatch.

What is already running on the recommended reading: nothing yet - this is a
scope artifact and no build is dispatchable until a fresh `loop-checker` clears
it (`docs/loop/`: a build from an unchecked scope is not dispatchable). The
loop keeps moving on disjoint items meanwhile.

---

## 8. Security note (starting brief for the FORK-6 pass)

The egress path traced through the proposed code, not asserted:

1. **The URL is constructed, never passed through.** The only
   attacker-influenced value that reaches `fetch` is the file id, validated to
   `DRIVE_ID = /^[A-Za-z0-9_-]+$/` (section 3.2). Host, scheme, and path are
   fixed literals in `buildDriveDownloadUrl`/`buildDriveDocExportUrl`. This is
   the primary SSRF mitigation: the attacker cannot steer the host.
2. **Host allowlist on every hop.** `redirect: "manual"`; a `Location` is
   followed only if its host is exactly in the Google download allowlist
   (`drive.google.com`, `drive.usercontent.google.com`, `*.googleusercontent.com`,
   `docs.google.com`). Any off-Google redirect -> refuse. Hop count bounded.
   Host comparison is exact (full-host equality / suffix match on a leading
   dot), never `includes` - the oracle's `drive.google.com.evil.com` row proves
   this for the parser; the fetcher's redirect check needs the same discipline.
3. **No credentials.** The calendar OAuth token (section 1.4) is never attached;
   the request is anonymous. This both works (public-only) and prevents leaking
   a bearer token to a download host.
4. **Size cap counted in the right unit.** `Content-Length` is compared via
   `maxFileBytesForWireBudget` (disk bytes), and the body read is aborted past
   the ceiling - never comparing disk bytes to a wire limit (the repeated wire-
   unit bug in `seats.md`, Security). `firstOversizedEntryReason` is the final
   backstop on the built entry.
5. **Content-type guard** rejects `text/html` (sign-in / interstitial) so a
   non-file response is never parsed as bytes.
6. **Model-output XSS: not applicable here** - the Drive path produces a
   `StudentSubmissionEntry`, graded by the same downstream path as every other
   submission; it introduces no new renderer. The grade output's rendering is
   unchanged and out of this scope.

Residual the pass must rule on: a public Drive file is UNTRUSTED content (a
student or a stranger authored it); it flows into a grading prompt exactly as
an uploaded file does today, so the prompt-injection exposure is **identical to
the existing file-upload path**, not new - confirm that framing against the
built diff rather than inheriting it.

---

## 9. Wave plan

Disposition table: N/A (first version of this scope; restructures nothing).

### W1 - the capability (the user reaches it by pasting a Drive URL)

The functional surface. A user can grade a Drive link the moment W1 lands,
because `prepareChatSubmissionAction` accepts the URL regardless of the
composer's label.

Write set (exact paths), each new export's caller in the same wave:
- `src/lib/google-drive-url.ts` (NEW pure parser/builder; its caller is the
  intake action below, and its test).
- `src/lib/google-drive-url.test.ts` (NEW oracle; the caller of the parser).
- `src/lib/grade/google-drive-content.ts` (NEW fetcher; its only caller is the
  intake action below).
- `src/app/actions/grading-chat-intake.ts` (EDIT: the Drive branch at `:203`
  and the widened final-refuse copy - the CALLER of both new exports).

No new export ships without its caller: the intake action imports and calls
both `parseGoogleDriveUrl` and `fetchGoogleDriveFile`; the oracle imports the
parser. Neither new lib module is type-only, so no type-only exemption applies.

Not in W1: `ChatComposer.tsx` (W2), any CSS, `page.tsx`, the GitHub/Canvas
helpers (read-only here), `single-file-entry.ts`/`extraction.ts`/`upload-budget.ts`
(reused unchanged).

### W2 - discoverability (the label), SERIALIZED, not concurrent

`src/app/components/grading-chat/ChatComposer.tsx:188`: `label="Canvas or
GitHub repo URL"` -> `label="Canvas, GitHub, or Google Drive URL"`. One line.

**This cannot run concurrently with W1's intake edit? It can** (disjoint files),
but it **cannot run concurrently with the two other efforts that also edit
`ChatComposer.tsx`** - the four-controls scope (clear-fields / copy-feedback /
harshness / loading) and `docs/grading-chat-visual-scope.md` (round 1,
UNCHECKED, which rewrites the composer's buttons and classes). File-set
intersection on `ChatComposer.tsx` is non-empty, so per
`parallel-disjointness.md` and the `no-git-stash-under-concurrency` memory note,
**W2 must be serialized after whichever of those lands last**, and whichever
agent edits the composer LAST owns the merged label string
`"Canvas, GitHub, or Google Drive URL"`. Recommended handling: hand the
one-line label change to whichever ChatComposer effort runs last (fold it into
their write), rather than dispatching W2 as its own agent against a file another
agent is mid-edit. If this item's W1 is the last to touch the surface, W2 runs
alone at the end.

Flag for the orchestrator: three efforts now queue on `ChatComposer.tsx` (this
W2, four-controls, visual). They are mutually exclusive on that file; sequence
them and let the last carry this label.

### Gate (both waves)

The section 0.1-style wrapper with one path per argument:
`npm run test:paths <new oracle> <any intake/composer test the test seat adds>`
(never a raw multi-path `vitest`), plus `npx tsc --noEmit` and `npm run lint`
run by exactly one caller (they race on `tsconfig.tsbuildinfo`), plus the
`npm run build` compile-line check (the prerender tail failure is expected and
is not a signal - `this-repo.md` section 1). `git status --short` against this
section's write set, and no `.claude/worktrees` copy edited instead of the real
tree.

### Seats and triggers for this chunk (verifier rules on each against the diff)

- Acceptance criteria: runs (always).
- Test seat: runs (always); owns the parser oracle + sabotage (section 6).
- Architect + reuse: ran here (new modules, >2 files).
- Security: **runs** (new network egress; FORK-6) - brief in section 8.
- Reliability: runs (a remote fetch with a timeout/size failure mode; the
  fetcher must bound the request time and the read - carry the same "never
  throws, returns `{ error }`" contract as `repo-content.ts`).
- External-facts research: runs (the ~25 MB interstitial threshold and Drive's
  redirect/export behaviour - RES-GDRIVE-6).
- User experience: runs for W2 only (the label; one-line, user-visible copy).
- Visual / aesthetic, Accessibility: triaged OUT (no layout/markup/color change;
  the label text swap keeps the same control, role and `type="url"`). Recorded
  trigger: none fired.
- Data / storage, Operability / admin: triaged OUT (nothing persisted; no `ta-`
  key; no owner config, audit, or revoke surface - v1 attaches no credential).
- Baseline: the URL-ingestion area of the grading-chat surface - check
  `docs/REGRESSION.md` with `grep -a` for existing coverage of
  `prepareChatSubmissionAction`'s url branch before hand-off; add an entry if
  absent.

---

## 10. Residual register

Each entry names an owner, an instrument, and the step that will measure it.
Each must be filed in `docs/BACKLOG.md`, or it does not exist.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-GDRIVE-1 | The entire fetch path (download, redirect allowlist, size cap, content-type guard, name derivation) is unexercised here - vitest throws on real fetch | Repo owner | Owner walk: paste a real public Drive file / Doc / private / folder / oversize link against a deployed build and confirm each outcome | After W1 ships; stated in the verify report as the load-bearing unverified half |
| RES-GDRIVE-2 | Intake wiring (Drive branch order, folder/sheets refused pre-fetch, classify->entry mapping) - coverable with a mocked fetcher | Test seat | `vi.mock` `google-drive-content`, drive `prepareChatSubmissionAction` with a Drive URL | W1 test step (test seat decides scope) |
| RES-GDRIVE-3 | The W2 label collision on `ChatComposer.tsx` with the four-controls and visual efforts | Orchestrator | `git status --short`; one agent on the file at a time | Before dispatching any ChatComposer edit; last writer carries the label |
| RES-GDRIVE-4 | Shared Drive FOLDER of submissions (listing + API + auth) - refused in v1 | Repo owner (product) | n/a (scope decision) | File as a follow-on row if wanted |
| RES-GDRIVE-5 | Authenticated (private) Drive via OAuth: needs `drive.readonly` added to `GOOGLE_CALENDAR_SCOPES` (forces re-consent) + a Drive API client; partial foundation exists (`google-credentials.ts`) | Repo owner (product) | n/a (scope decision) | File as a follow-on row if wanted |
| RES-GDRIVE-6 | External facts: Google's ~25 MB scan threshold, the interstitial/confirm-token behaviour, and Drive's redirect/export endpoints - none verifiable in this network-blocked repo | External-facts seat / owner | Read Google's current docs at scope-build time; confirm at the owner walk | W1 external-facts pass + owner walk |

---

## 11. What this seat could not determine

- Nothing in the fetch path was executed (network-blocked; no `.env`; no render).
  Every statement about what Drive returns for a given link is a design
  expectation to be confirmed at the owner walk (RES-GDRIVE-1, -6).
- The exact `Content-Disposition`/`Content-Type` Drive returns for each file
  kind (which drives the name-derivation crux in 3.3) was not observed; the
  derivation must degrade to a named refusal when no extension can be found.
- Whether Google still serves the `uc?export=download` form or has fully moved
  to `drive.usercontent.google.com` for direct downloads - the parser accepts
  both input forms, but which one a live fetch must TARGET is an external fact
  (RES-GDRIVE-6).
- The four-controls scope document was not located by name in this pass (the
  brief names its controls: clear-fields / copy-feedback / harshness / loading);
  its existence and its edit to `ChatComposer.tsx` are taken from the brief and
  from the live file already carrying sibling edits (drag-and-drop shipped at
  `f30846d7`). The collision handling in W2 does not depend on reading that doc,
  only on the file-set overlap, which is certain.
- This artifact has not been checked by a peer. Round 1 of two.
</content>
</invoke>
