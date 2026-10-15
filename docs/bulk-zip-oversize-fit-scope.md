# BULK-ZIP: get pdf/docx VISUAL content to the grader (and reconcile the wire budget)

Seat: architecture (`loop-architect`). OWNER-PRIORITY grading-ACCURACY bug plus
the oversize budget it reframes. This document is the SCOPE + acceptance
criteria. No production code is written here.

> **This supersedes this file's earlier premise.** An earlier draft scoped
> "strip non-image base64 from pdf/docx because the model never reads it." That
> premise was WRONG. The model SHOULD read pdf/docx visual content and does not
> today; stripping it is the opposite of what grading accuracy needs. This
> rewrite leads with the accuracy fix and treats the wire budget as a
> consequence of it.

---

## 0. Executive summary

**The accuracy bug (owner-priority).** A student embedded their required 5
outreach SCREENSHOTS inside a PDF (and in a DOCX); the grader marked them
"missing screenshots" and docked the student. Root cause (measured, section 2):
the grade engine hands Gemini ONLY files whose `mimeType` is in
`GEMINI_IMAGE_MIME_TYPES` (png/jpeg/webp/heic/heif, `constants.ts:54-60`). A
PDF is `application/pdf` and a DOCX is a zip - neither is in that set - so a
PDF's pages/screenshots and a DOCX's embedded images NEVER reach the model; it
grades the EXTRACTED TEXT only (`engine.ts:97` sends `content`, `:99-101` sends
only image parts). The screenshots were in the submission; the grader could not
see them.

**The fix (section 4).** Make the grader SEE pdf/docx visual content, per type:
- **PDF** - send the PDF to Gemini as inline `application/pdf` data; Gemini reads
  a PDF natively, including its images. The transport already forwards inline
  data of any mime (`callGemini` serializes `contents` straight to Gemini,
  `llm.ts:539-540`; `LlmPart` has `{inlineData:{mimeType,data}}`, `llm.ts:35`),
  so this is a set-widening plus a collection change, not a new transport.
- **DOCX / PPTX** - Gemini cannot parse a docx/pptx container, so EXTRACT its
  embedded raster images with the app's existing `extractOfficeImagesWithData`
  (`src/lib/office-edit.ts:764`) and send each as inline image data.
This lands in the ENGINE's shared model-input step, so it fixes every grading
path (batch, chat, per-item), not just bulk-zip.

**The wire budget, reconciled (section 5).** Because pdf/docx visual content now
MUST be sent, it is NOT strippable dead weight. The per-item budget
(`ITEM_REQUEST_BYTE_BUDGET` ~3.5MB) must measure the bytes the grader actually
NEEDS - `content` + images + pdf + office files - and a student whose VISUAL
payload exceeds it is a GENUINE oversize (section 6). The only bytes still
strippable from the per-item POST are files the grader does NOT need to see -
a non-visual file whose text is already folded into `content` (e.g. a submitted
`.zip` or `.txt`) - kept client-side for the Files-UI download. So the two
originally skipped students grade IFF their visual payload fits; if their
PDF/docx visuals alone exceed the budget, they stay skipped with the BW4 ledger
reason, and PDF compression / page-limiting / the Gemini File API is a filed
follow-up fork, not this build.

**Serialization (section 10).** The accuracy core (engine + constants + a new
`inline-visuals.ts` leaf) is DISJOINT from BULK-ZIP BW4 and can ship first. The
budget-reconciliation wave touches `useContinuousGradingRun.ts`, which BW4 is
editing (uncommitted); that wave SERIALIZES AFTER BW4 COMMITS.

---

## 1. Leverage trigger

BUG FIX (grading accuracy), so no leverage claim is owed (`seats.md`, Acceptance
criteria). Fired trigger: BUG FIX. For the record it repairs the existing
GUARANTEED/SCALE advantages (`docs/loop/leverage.md`): the app claims to grade
"the content the grader actually read" (`SubmittedFilesPanel.tsx:13-15`) and to
hold one rubric over every student; today it silently grades a pdf/docx student
on less than they submitted. No new class, no removal test owed - but I5
(section 9) is removal-test-SHAPED for the accuracy fix (revert the mime set,
the pdf inline part disappears, the assertion goes red).

---

## 2. Confirmed root-cause measurement

Every line was opened in this checkout on 2026-10-08.

### 2.1 The engine sends the model ONLY image-mime files

`src/lib/grade/engine.ts:405-409`, inside `gradeStudentEntries`:

```
const imageFiles = submittedFiles
  .filter((f) => f.rawBase64 && f.mimeType && GEMINI_IMAGE_MIME_TYPES.has(f.mimeType))
  .map((f) => ({ name: f.name, base64: f.rawBase64!, mimeType: f.mimeType! }));
```

`imageFiles` is handed to `gradeSubmission`/`gradeDiscussionAxes` (`:416-442`)
-> `scoreAxis`, which builds the model parts at `:95-102`:

```
const parts: LlmPart[] = [
  { text: `${systemPrompt}...\n\n${content}${imageNote}${codeNote}` },
  ...imageFiles.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } })),
];
```

So the ONLY non-text thing the model receives is inline data for files whose
mime is in `GEMINI_IMAGE_MIME_TYPES`
(`constants.ts:54-60` = {png, jpeg, webp, heic, heif}). A PDF
(`application/pdf`) and a DOCX
(`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) are
not in that set, so their bytes are never put in `parts`. The grade for such a
file runs on `content` (the extracted text) alone. `imageNote` (`:78-83`) even
tells the model the screenshots are "attached below" - but for a pdf/docx they
are not.

### 2.2 The transport forwards inline data of any mime straight to Gemini

`src/lib/llm.ts:33-35`: `LlmPart = ... | { inlineData: { mimeType: string; data: string } }`.
`callGemini` (`:509`) builds the request body at `:539-544`:
`JSON.stringify({ contents: req.contents, ... })` - `contents` (with its
`inlineData` parts) is sent verbatim to
`.../v1beta/models/${model}:generateContent` (`:459`). The image path proves
this works today; an `application/pdf` inline part rides the same channel. (The
model's native-PDF support is an external fact - section 7.)

### 2.3 The pdf/docx bytes ARE present at grade time

Extraction keeps `rawBase64` for every file, image or not
(`src/lib/grade/extraction.ts:842-849` text branch, `:850-859` empty-text
branch, both `rawBase64: file.base64, mimeType: file.mimeType`). So at grade
time a pdf `submittedFile` carries its base64 and `mimeType: "application/pdf"`,
and a docx carries the docx-zip base64 - the inputs the fix needs are already
on the entry. (This is also why they counted toward the old budget.)

### 2.4 The DOCX image extractor already exists

`src/lib/office-edit.ts:764-775`,
`extractOfficeImagesWithData(kind: OfficeKind, buffer: Buffer): Promise<Array<OfficeImage & { mimeType?: string; base64?: string }>>`.
It lists each embedded image and reads its bytes via `extractOfficeImageData`
(`:584-596`, returns `{ mimeType, base64 } | null`, skipping vector formats
emf/wmf/svg). `OfficeKind = "docx" | "pptx"` (`office-edit.ts:18`), so the same
function covers docx AND pptx. It imports only `jszip` and `@/lib/zip-caps`
(`office-edit.ts:1-2`) - no DB client, and zip-caps gives zip-bomb protection
on untrusted office files.

### 2.5 The budget counts ALL base64, and three gates skip/refuse on it

`estimateEntryWireBytes` (`incrementalRunPlan.ts:86-92`) sums `content.length`
plus EVERY file's `rawBase64.length`.
`ITEM_REQUEST_BYTE_BUDGET = UPLOAD_WIRE_BUDGET_BYTES = 3.5 * 1024 * 1024`
(`incrementalRunPlan.ts:42`, `upload-budget.ts:41`). Three live gates skip/refuse
an entry over budget:

| # | Site | file:line | Over-budget behaviour |
|---|---|---|---|
| G1 | `buildIngestLines` (bulk-zip PARTITION) | `ndjson-ingest-parser.ts:47-50` | emits a `skip` line, `OVERSIZED_SKIP_REASON` ("too large to grade on this surface") |
| G2 | `firstOversizedEntryReason` (chat single/composite) | `grading-chat-intake.ts:113-119` | refuses: "One submission is too large to grade on this surface." |
| G3 | `parseRequestBody` (per-item route guard) | `grade-run-item/route.ts:141` | returns null -> HTTP 400 |

The owner's two skipped students were skipped at **G1**. Whether they now grade
depends on their VISUAL payload size (section 6) - the accuracy fix is
independent of the skip, and the budget change only un-skips a student oversize
due to non-visual bytes.

### 2.6 The whole-run / batch path has no per-item budget gate

`gradeStudentEntries` grades in-process (no per-item POST), so G1-G3 are the
chat/bulk-zip transport only. The ACCURACY fix (2.1) lives in the shared engine
and therefore repairs batch, chat and per-item alike; the BUDGET reconciliation
(section 5) concerns only the chat/bulk-zip transport.

---

## 3. Acceptance criteria

- **AC-1 (ACCURACY - owner priority).** When a student submits a PDF that
  contains visual content (e.g. screenshots), the grader RECEIVES that content:
  the PDF is included in the model request as an inline `application/pdf` part.
  When a student submits a DOCX/PPTX with embedded raster images, those images
  are extracted and included as inline image parts. A student who embedded their
  required screenshots in a PDF/docx is no longer marked "missing screenshots"
  for the reason that the visuals never reached the model. (Instrument I5; the
  live "graded correctly" is owner-verified - no API key here, section 12.)
- **AC-2 (no regression to existing inputs).** Existing image-file submissions
  are still sent; `content` (extracted text) is still sent unchanged; code-run
  notes unchanged. A within-budget student's wire payload does not grow (their
  pdf/docx base64 already rode the wire; the fix only changes what the engine
  pulls from it into the model call).
- **AC-3 (budget measures the NEEDED payload).** The per-item budget counts
  `content` plus the base64 of files the grader needs - images, pdf, and office
  files (docx/pptx) - and EXCLUDES the base64 of non-visual files whose text is
  already in `content`. A student over budget ONLY because of such non-visual
  download-only bytes is no longer skipped/refused.
- **AC-4 (genuine visual oversize - honest fallback).** A student whose NEEDED
  payload (content + visual bytes) still exceeds `ITEM_REQUEST_BYTE_BUDGET` is a
  genuine oversize and is still SKIPPED (bulk, G1) or REFUSED (chat, G2) with the
  SAME wording, and listed in the ingest ledger's `skipped`. Never silently
  dropped; never a whole-call failure. Compression / page-limiting / the Gemini
  File API is NOT in this build (fork, section 6 / RES-VIS-1).
- **AC-5 (budget and wire agree).** The bytes a gate measures equal the bytes the
  per-item POST actually carries. No student is emitted whose POST then fails the
  platform body cap; none is skipped whose POST would have fit. (Construction:
  one predicate drives the estimate, the strip and the engine's collection -
  section 4.)
- **AC-6 (Files UI preserved).** A pdf/docx/image row keeps its working Download
  and Preview (their bytes ride the wire as needed-payload). A non-visual file
  stripped from the POST is retained client-side and restored into the displayed
  row so its Download still works. (Reading claim; no component renders - section
  9 I6, section 12.)
- **AC-7 (retry/regrade).** Re-dispatching a failed/arrived row POSTs the same
  needed-payload (stripped) body, so a retried row does not 400 at G3 or fail the
  platform cap.
- **AC-8 (office extraction never breaks a grade).** A docx/pptx whose image
  extraction throws or yields no usable images is graded on its text exactly as
  today - the failure is swallowed per file, never thrown out of the grade.

---

## 4. The mechanism

### 4.1 One predicate, defined once

Add to `src/lib/grade/constants.ts` (next to the existing mime sets; the file is
import-free, so it stays client-bundle-safe):

```
// Mimes Gemini reads directly as inline data (vision + native PDF).
export const GEMINI_INLINE_MIME_TYPES = new Set([
  ...GEMINI_IMAGE_MIME_TYPES, "application/pdf",
]);
// Office containers Gemini cannot parse but whose embedded images we extract
// and send as inline image data (via extractOfficeImagesWithData).
export const OFFICE_IMAGE_SOURCE_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
]);
// The grader needs this file's BYTES (to send inline, or to extract images from).
// Everything else is text-only and its base64 is download-only.
export function graderNeedsFileBytes(mimeType: string | undefined): boolean {
  return !!mimeType &&
    (GEMINI_INLINE_MIME_TYPES.has(mimeType) || OFFICE_IMAGE_SOURCE_MIME_TYPES.has(mimeType));
}
```

This one predicate is the seam the whole design hangs on: the engine branches on
it, the budget sums over it, and the strip inverts it, so "what the grader gets",
"what the budget counts" and "what the wire carries" cannot diverge (AC-5).

### 4.2 Accuracy - the engine's model-input step (ALL grade paths)

New server leaf `src/lib/grade/inline-visuals.ts` (imports `office-edit` and
`constants`; `async` because office unzip is):

```
export async function collectInlineVisualParts(
  submittedFiles: SubmittedFileInfo[]
): Promise<Array<{ name: string; base64: string; mimeType: string }>>;
```

Per file with `rawBase64`:
- mime in `GEMINI_INLINE_MIME_TYPES` (image or pdf): push `{ name, base64: rawBase64, mimeType }`.
- mime in `OFFICE_IMAGE_SOURCE_MIME_TYPES` (docx/pptx): `extractOfficeImagesWithData(kind, Buffer.from(rawBase64,"base64"))`,
  where `kind` maps docx-mime->"docx", pptx-mime->"pptx"; for each returned image
  that HAS `base64` and `mimeType`, push `{ name: \`${file.name} / ${im.name}\`, base64, mimeType }`.
  Wrap this per file in try/catch; on throw, push nothing for that file (AC-8).
- otherwise: skip (text already in `content`).

In `engine.ts`, replace the `imageFiles` build at `:405-409` with
`const inlineFiles = await collectInlineVisualParts(submittedFiles);` and pass
`inlineFiles` wherever `imageFiles` was passed (`:416-442`). Rename the
`scoreAxis` param `imageFiles` -> `inlineFiles` (`:64,78-83,99-101`) and
generalize `imageNote` so it names the attached visual content (e.g. "the
student also submitted visual content (screenshots, a PDF, or document images),
attached below; treat it as part of the submission" - final copy is UX's, but it
must not say "image file(s)" exclusively). The build site is already inside an
`async` loop that `await`s `runSubmittedCode` (`:413`), so awaiting here is
consistent; placing the JSZip work in a leaf keeps `engine.ts` from growing and
keeps the collection unit-testable in isolation. `engine.ts` is already
server-only (it imports `gemini.ts`, which reads `process.env`), so adding the
`office-edit`/JSZip import to its closure via this leaf does not reach a client
bundle - but the engine runtime-import-graph guard (`engine.ts:40`'s
`runtime-import-graph.test.ts`) MUST run in the gate to confirm no forbidden
module (a DB client) entered the closure (section 8).

### 4.3 Budget - measure the NEEDED payload, client-safe

In `src/app/components/grading/incrementalRunPlan.ts` (client-safe leaf; it may
import `graderNeedsFileBytes` from `constants.ts` but MUST NOT import
`office-edit`/JSZip):

```
// Bytes the grader needs over the wire for this entry: content + the base64 of
// every file whose bytes the grader needs (images, pdf, office files). Office
// files are counted at their CONTAINER size as a conservative proxy for their
// extracted-image size (extracted images <= the zip).
export function estimateNeededWireBytes(entry: StudentSubmissionEntry): number;
// Drops rawBase64 from files the grader does NOT need (text already in content);
// keeps it for needed files. Pure, total, non-mutating, returns a new entry.
export function stripUnneededRawBase64(entry: StudentSubmissionEntry): StudentSubmissionEntry;
```

`estimateNeededWireBytes(entry)` = `entry.content.length` +
`sum(f.rawBase64.length for f in submittedFiles if f.rawBase64 && graderNeedsFileBytes(f.mimeType))`.
`estimateEntryWireBytes` keeps its honest as-is meaning (its existing tests
stay valid); the gates switch to `estimateNeededWireBytes`.

Change the three gates to `estimateNeededWireBytes > ITEM_REQUEST_BYTE_BUDGET`:
G1 (`ndjson-ingest-parser.ts:47`), G2 (`grading-chat-intake.ts:115`), G3
(`grade-run-item/route.ts:141`). G1/G2 still EMIT/return the FULL entry (the
client needs the full bytes for the Files-UI download of non-visual files).

**Office budget is a conservative proxy.** The budget counts the docx/pptx
CONTAINER base64, but the wire carries the container (grade-time extraction reads
from it) so this is exact for the wire; it over-estimates only relative to the
extracted-image size the MODEL finally sees. A docx large from body text but
small in images could be skipped though its images alone would fit - recorded as
RES-VIS-2 (precise ingest-time extraction is the follow-up).

### 4.4 Wire - strip the per-item POST to the needed payload

In `src/app/components/grading-chat/useContinuousGradingRun.ts`,
`postGradeRunItem` (`:146-157`), the default `dispatchItem`: before
`JSON.stringify(request)`, send
`{ ...request, entry: stripUnneededRawBase64(request.entry) }`. Because
`retainedBodiesRef` keeps the FULL body (`:444`, unchanged), `retry`/`regrade`
re-dispatch through `postGradeRunItem` and are stripped again (AC-7), and the
full bytes remain available for the Files-UI restore (4.5). The route guard G3
then measures the already-stripped entry, so its `estimateNeededWireBytes`
equals the wire payload (AC-5). The office container (needed) is NOT stripped; it
rides the wire so the engine can extract its images at grade time.

### 4.5 Files UI - restore non-visual download bytes (option b, narrowed)

Stripping a non-visual file's base64 from the POST would, via the engine's
pass-through of `submittedFiles` (`engine.ts:443-452`), remove its Download
control in the displayed row (`FilesCell.tsx:77`). Restore it from the retained
full entry. In `useContinuousGradingRun.ts` `pump()` success path (`:227-235`),
before `recordArrival`, substitute:

```
const full = retainedBodiesRef.current.get(request.sourceIndex)?.entry.submittedFiles;
const restored = full ? { ...result, submittedFiles: full } : result;
recordArrival({ sourceIndex: request.sourceIndex, result: restored });
```

Sound because grading never mutates `submittedFiles` (`engine.ts:443-452`); the
retained entry's array is the authoritative original. The failure path
(`classifyItemFailure`, `:242-245`) already builds from the full retained
`request.entry.submittedFiles`, so it needs no change. This costs no new client
memory: the full body is ALREADY retained today (`:444`). pdf/docx/image
downloads already work (their bytes ride the wire); only non-visual files need
the restore.

---

## 5. What reaches the model, the wire, and the download - per type (after the fix)

| Submitted file | Model receives (inline) | Per-item POST carries | Budget counts | Files-UI download |
|---|---|---|---|---|
| Image (png/jpeg/webp/heic/heif) | the image (as today) | image base64 | yes | same base64 |
| **PDF** | the PDF as `application/pdf` (Gemini reads its images) | PDF base64 | yes | same base64 |
| **DOCX / PPTX** | its embedded raster images, extracted, as image parts | the office container base64 (extraction source + download) | yes (container, proxy) | the container |
| Non-visual (txt/code/zip - text already in `content`) | nothing (text is in `content`) | **stripped** from POST; kept client-side | no | restored from client copy |
| gif/bmp image | **nothing** (not in Gemini set) - pre-existing gap, RES-VIS-3 | base64 (currently counted) | yes | same base64 |

---

## 6. The genuine-visual-oversize fallback and the OWNER FORK

After the budget counts only needed bytes, a student can still exceed
`ITEM_REQUEST_BYTE_BUDGET` because their VISUAL payload is genuinely large:
a PDF > ~3.5MB, or a docx/pptx container > ~3.5MB, or many images. The platform
also caps the POST body at ~4.5MB (`upload-budget.ts:9-11`), and the app has no
Gemini File API / resumable-upload path, so inline is the only channel and the
budget binds.

**Shipped behaviour (AC-4):** such a student is SKIPPED (bulk) / REFUSED (chat)
with the same BW4 ledger reason and listed in the ledger. The fix does NOT
compress, rasterize-at-lower-DPI, page-limit, or File-API-upload the PDF.

**OWNER FORK (for the orchestrator to put to the owner; recommendation recorded,
not gated per `AGENTS.md`).** The genuinely-large visual submission:
- **(A) Skip with the ledger reason now; file compression/page-limit/File-API as
  a follow-up.** RECOMMENDED. It is honest and buildable/testable here; it ships
  the owner-priority accuracy fix without blocking on a capability this
  environment cannot verify (no API key, no network - section 12).
- **(B) Build PDF down-scaling / page-limiting / Gemini File-API upload now.** A
  substantial new capability (a rasterizer or the File API client), unverifiable
  here, and not needed to fix the accuracy bug for the common case.

This scope BUILDS reading (A); (B) is RES-VIS-1, filed for the owner. The two
originally skipped students grade if their visual payload fits (A); if their
PDF/docx visuals alone exceed the budget they remain skipped under (A) until the
owner chooses (B).

---

## 7. External facts to confirm (External-facts seat)

- **Gemini reads inline `application/pdf` including its images.** Google's Gemini
  document-understanding docs state PDFs (incl. scanned/visual pages) are
  accepted as inline data on `generateContent`. Confirm against the model
  `getGeminiModel()` resolves to (env-set; the code targets "Gemini 3",
  `llm.ts:521`). Source: Google AI / Vertex Gemini docs; checked 2026-10-08.
  Inline-request total has a vendor cap (historically ~20MB) ABOVE our ~4.5MB
  Vercel body cap, so Vercel binds first. UNVERIFIABLE live here (no API key).
- **Inline part shape.** `{ inlineData: { mimeType, data } }` camelCase is
  accepted by `v1beta/:generateContent` - proven by the working image path
  (`engine.ts:99-101`), so no snake_case conversion is needed.

---

## 8. Gates (wave gate + verify)

PowerShell; one `tsc` caller.

- `npx tsc --noEmit` - no output, exit 0.
- `npm run lint` - exit 0, no NEW warning in files this wave writes.
- `npm run build` - the `Compiled successfully` line (not exit 0).
- `src/file-size-ceiling.structure.test.ts` - unconditional; all touched files
  under 1000 (section 10).
- The engine runtime-import-graph guard (`engine.ts:40`,
  `runtime-import-graph.test.ts`) - confirms `inline-visuals.ts` -> `office-edit`
  added no DB client to the engine closure.
- `src/lib/canvas-client-boundary.runtime-graph.test.ts` - confirms
  `incrementalRunPlan.ts`'s new `constants.ts` import did not pull a server-only
  module into the client graph (it must NOT import `office-edit`).
- The `owns` tests (section 10) via `npm run test:paths <...>` (never raw
  multi-path vitest).

---

## 9. Instruments (pass conditions: object, instrument, failure direction)

vitest is node-env; no component renders (`this-repo.md:133-139`). Oracle
CONSTRUCTION is the test seat's; this states what each compares.

- **I1 - inline collection (the model-input decision).** Object:
  `collectInlineVisualParts([image, pdf, docxWithPng, pptxWithJpg, txt])`.
  Instrument: unit test `inline-visuals.test.ts` with an in-memory docx/pptx
  fixture (a real zip buffer the test builds, or a committed fixture). Assert:
  the image is present; the pdf is present as `application/pdf`; the docx's png
  and the pptx's jpg appear as image parts; the txt produces NOTHING; a vector-
  only office image (no base64) is omitted; a docx whose extraction throws yields
  no parts and does NOT reject (AC-8). FAILS if the pdf/docx image is omitted, if
  the txt is included, or if a throw escapes.
- **I2 - predicate + needed-bytes estimate.** Object: `graderNeedsFileBytes` and
  `estimateNeededWireBytes`. Instrument: `incrementalRunPlan.test.ts`. Assert
  true for image/pdf/docx/pptx mimes, false for text/plain/application/zip; and
  `estimateNeededWireBytes` counts content + needed base64 only (a txt's base64
  is NOT counted; a pdf's IS). FAILS if a non-visual base64 is counted or a pdf's
  is not.
- **I3 - partition (owner case + fallback).** Object:
  `buildIngestLines([nonVisualHeavy, pdfOversize], [])`. Instrument:
  `ndjson-ingest-parser.test.ts`. `nonVisualHeavy`: a large text file pushing the
  OLD all-base64 estimate over budget but the needed estimate under. `pdfOversize`:
  a pdf whose base64 alone exceeds budget. Assert: `nonVisualHeavy` -> an `entry`
  line (not skip); `pdfOversize` -> a `skip` line with `OVERSIZED_SKIP_REASON`;
  the emitted entry retains its full `submittedFiles`. FAILS if the non-visual-
  heavy student is skipped (the bug), or the pdf-oversize one is emitted.
- **I4 - route guard.** Object: `parseRequestBody`. Instrument:
  `grade-run-item/route.test.ts`. Admits an entry within needed-budget whose
  needed bytes fit; rejects one whose needed bytes exceed. FAILS on either
  inversion.
- **I5 - engine SENDS visuals (the accuracy instrument, removal-test-shaped).**
  Object: the model-request `contents[0].parts`. Instrument: an engine test that
  mocks `callLlm`/the gemini layer and captures the parts, driving `gradeEntries`
  with (a) an entry carrying a pdf - assert a part
  `{ inlineData: { mimeType: "application/pdf", data: <pdfBase64> } }` is present;
  (b) an entry carrying a docx with an embedded png - assert an image inline part
  is present. FAILS (red) if the mime set is reverted to image-only (the pdf part
  disappears) - which is exactly the removal of the advantage. Network is blocked
  under vitest (`this-repo.md:147-153`); mock the LLM layer, never real fetch.
- **I6 - wire strip + display restore.** Object: the POSTed body's entry and the
  displayed `run.results[i].submittedFiles`. Instrument:
  `useContinuousGradingRun.lifecycle.test.ts` (the no-render harness) for the
  restore, and a direct `postGradeRunItem` test (spy `fetch`) for the strip,
  since the injected `dispatchItem` bypasses `postGradeRunItem`. Assert: the
  serialized body's entry has no non-visual `rawBase64` but keeps image/pdf/office
  base64; and after a dispatched row with a stripped non-visual file arrives, its
  displayed `submittedFiles[i].rawBase64` equals the original (restore). FAILS if
  the wire carries non-visual base64, if visual base64 is dropped, or if the row
  lost its download bytes.

Every assertion names its killing mutation (remove pdf from the inline set ->
I1/I5 red; count txt base64 -> I2/I3 red; drop the restore -> I6 red). The test
seat proves these red before build and runs a sabotage pass.

---

## 10. Wave plan, write set, owns, serialization

### 10.1 Serialization vs BW4

BW4 is UNCOMMITTED in the working tree:

```
git status --short
 M src/app/components/grading-chat/GradingChatPanel.tsx
 M src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts
 M src/app/components/grading-chat/useContinuousGradingRun.ts
?? src/app/components/grading-chat/ingestLedger.ts  (+ .test.ts)
git log --oneline -1  ->  0149ff09 ... BW4 building
```

Overlap with this build: only `useContinuousGradingRun.ts` (+ its lifecycle
test), touched in Wave 3 below. `GradingChatPanel.tsx` is NOT in this build's
write set (the restore lives in the hook, 4.5). Waves 1-2 are DISJOINT from BW4.

### 10.2 Waves

- **Wave 1 - ACCURACY core (owner priority; disjoint from BW4, ships first).**
  - `src/lib/grade/constants.ts` - `GEMINI_INLINE_MIME_TYPES`,
    `OFFICE_IMAGE_SOURCE_MIME_TYPES`, `graderNeedsFileBytes`.
  - `src/lib/grade/inline-visuals.ts` (NEW) - `collectInlineVisualParts`
    (imports `office-edit`, `constants`).
  - `src/lib/grade/engine.ts` - call `collectInlineVisualParts` (caller of the
    new export); rename/widen `imageFiles`->`inlineFiles` through `scoreAxis`;
    generalize `imageNote`.
  - Tests: `inline-visuals.test.ts` (I1), an engine test for I5.
- **Wave 2 - budget estimate + gates (depends on Wave 1's predicate; disjoint
  from BW4).**
  - `src/app/components/grading/incrementalRunPlan.ts` - `estimateNeededWireBytes`,
    `stripUnneededRawBase64` (import `graderNeedsFileBytes`).
  - `src/lib/grade/ndjson-ingest-parser.ts` (G1), `src/app/actions/grading-chat-intake.ts`
    (G2), `src/app/api/grade-run-item/route.ts` (G3) - switch to
    `estimateNeededWireBytes`; G1/G2 emit full entry; callers of the new exports.
  - Tests: `incrementalRunPlan.test.ts` (I2), `ndjson-ingest-parser.test.ts`
    (I3), `grading-chat-intake.test.ts`, `grade-run-item/route.test.ts` (I4).
- **Wave 3 - hook: leg-B strip + restore. SERIALIZES AFTER BW4 AND WAVE 2.**
  - `src/app/components/grading-chat/useContinuousGradingRun.ts` - strip in
    `postGradeRunItem` (4.4); restore in `pump` (4.5); import
    `stripUnneededRawBase64`.
  - Test: `useContinuousGradingRun.lifecycle.test.ts` (I6).

**Coupling note:** Wave 2 must not land WITHOUT Wave 3. Wave 2's G1 would emit a
student the hook then POSTs as a FULL entry (non-visual bytes included), which
could exceed the platform cap and fail opaquely. Ship Wave 2+3 together (both
after BW4). Wave 1 is safe alone: it changes only what the engine reads INTO the
model call, not the wire or the skip, so it can land before BW4 commits.

### 10.3 Line-count headroom (`@(Get-Content <file>).Count`, 2026-10-08)

```
   665  src/lib/grade/engine.ts                 (+ ~5; collection moves to the leaf)
    64  src/lib/grade/constants.ts              (+ ~12)
     0  src/lib/grade/inline-visuals.ts         (NEW, ~70)
   305  src/app/components/grading/incrementalRunPlan.ts   (+ ~20)
   211  src/lib/grade/ndjson-ingest-parser.ts   (~ +2)
   333  src/app/actions/grading-chat-intake.ts  (~ +2)
   245  src/app/api/grade-run-item/route.ts     (~ +2)
   551  src/app/components/grading-chat/useContinuousGradingRun.ts  (+ ~8)
```
None pinned in `file-size-ceiling.structure.test.ts`'s `ALLOWED_OVERAGE` (grep:
none); all stay far under 1000.

### 10.4 `owns` list (derived, output pasted)

```
grep -rln "incrementalRunPlan\|ndjson-ingest-parser\|grading-chat-intake\|useContinuousGradingRun\|grade-run-item\|grade/engine\|grade/constants\|office-edit\|inline-visuals" src --include=*.test.ts | sort
```
Tests that read an edited file as source. Classified; all run via
`npm run test:paths` in the wave gate and verify:

- **Owned (assertions this change edits):** `inline-visuals.test.ts` (new),
  an engine test for I5, `incrementalRunPlan.test.ts`,
  `ndjson-ingest-parser.test.ts`, `grading-chat-intake.test.ts`,
  `grade-run-item/route.test.ts`, `useContinuousGradingRun.lifecycle.test.ts`.
- **Adopted (must stay green):** `grading-incremental.test.ts` (uses the as-is
  `estimateEntryWireBytes`, unchanged), `useContinuousGradingRun.diagnostic.test.ts`,
  `latestGradedResult.test.ts`, and every existing `engine`/`constants`/
  `office-edit` consumer test - notably the engine's own grading tests and
  `office-edit`'s tests (`canvas-accessibility`, `syllabus-*`, `media.*` under
  `src/app/actions`) and any `grade/constants`-reading test: a widened mime set
  must not change their expectations.
- **Checked-safe canaries (run because they read a touched file as source text;
  counts must NOT move):** `action-guard-coverage-github-cohort.test.ts` and
  `wholesale-auth-mock-population.structure.test.ts` (grade-run-item guard
  cohort - we change a size check inside an existing guarded route, not the guard
  set), `runtime-import-graph.test.ts` (engine closure), and the client-boundary
  runtime-graph test.

The implementer MUST re-run the exact grep against the as-committed tree (it will
grow once `inline-visuals.ts` and the engine test exist) and gate on its full
output; the list above is the 2026-10-08 derivation to build from.

---

## 11. Seat triage (wave-by-wave)

- **Security (wave 2 trigger: untrusted bytes reach a new code path).** The fix
  feeds untrusted pdf bytes to Gemini (same inline channel and trust as today's
  image submissions - no new egress) and unzips untrusted docx/pptx. The office
  unzip already runs under `@/lib/zip-caps` (`office-edit.ts:2`,
  `assertContainerWithinCaps`), so zip-bomb exposure is bounded by an existing
  control - the security pass must confirm `extractOfficeImagesWithData`'s path
  actually applies those caps and that a malformed office file cannot throw out
  of the grade (AC-8). RUN security in wave 2.
- **Reliability (wave 2 trigger: new async work in a budgeted handler).** Office
  extraction adds async unzip per docx/pptx inside the grade-run-item 50s soft
  budget (`route.ts:52`) and the batch loop; it must be bounded and swallow
  failures (AC-8). RUN reliability in wave 2.
- **Data/storage: triaged OUT** - no persisted shape changes; `SubmittedFileInfo`
  / `StudentSubmissionEntry` are unchanged (`rawBase64?` already optional,
  `types.ts:150,461`); the strip produces a valid existing shape.
- **UX/visual/accessibility (wave 3):** the only user-visible change is the
  generalized `imageNote` copy (section 4.2) and that pdf/docx rows now grade on
  their visuals; the Files-UI surface is unchanged. Light pass on the copy;
  record findings as reading claims.
- **Operability/admin: triaged OUT** - nothing an owner configures/audits/revokes
  changes.

---

## 12. What this environment cannot verify (stated, not worked around)

- **No real grade / no API key.** AC-1's "the screenshots are now seen and the
  student is graded correctly" is owner-verified in production. Here it is
  verified only as "the model request CONTAINS the pdf/docx visual parts" (I5,
  mocked LLM). RES-VIS-4: owner live-check that a real PDF-with-screenshots
  grades as present.
- **No rendered component.** AC-6's Files-UI claims are reading claims on
  `result.submittedFiles` data, not a render.
- **Gemini PDF support / inline limit** cannot be exercised here (section 7);
  confirmed from vendor docs only.
- **No disposition table owed** - this is a re-scope of a WRONG-premise draft of
  the same file, not a restructuring of validated requirements; every prior
  requirement rested on the overturned "strip because unread" premise and is
  withdrawn with it. The one piece KEPT and inverted: the strip/restore machinery
  (now stripping NON-VISUAL bytes, keyed on `graderNeedsFileBytes` instead of the
  image-only test).

---

## 13. Residual register

Each has an owner, an instrument, and the step that measures it. The orchestrator
files these in `docs/BACKLOG.md` (a residual not in the backlog does not exist,
`DEV_LOOP.md` step 0).

- **RES-VIS-1 - genuinely-large visual submission (the owner fork, section 6).**
  Owner: repo owner (product call A vs B). Instrument: if (B), a partition/route
  test that a > budget pdf is down-scaled/page-limited/File-API-uploaded to fit;
  if (A), I3's `pdfOversize` skip assertion is the whole requirement. Step: this
  build ships (A); a follow-up scope builds (B) if chosen.
- **RES-VIS-2 - office budget is a container-size proxy, not exact.** A docx large
  in body text but small in images may be skipped though its images alone fit
  (section 4.3/5). Owner: repo owner. Instrument: a partition test over an entry
  carrying the EXACTLY-extracted image bytes. Step: a follow-up that extracts
  office images at INGEST time (precise budget; also lets the extracted images,
  not the container, ride the wire).
- **RES-VIS-3 - gif/bmp images are still not sent to the model.** They are in
  `IMAGE_EXTENSIONS` but not `GEMINI_IMAGE_MIME_TYPES`/`GEMINI_INLINE_MIME_TYPES`
  (`constants.ts:41-60`), so a gif/bmp screenshot is still invisible to the
  grader - a sibling of the bug this scope fixes. Owner: repo owner. Instrument:
  I1 extended with a gif entry asserting a converted/sent part. Step: a follow-up
  that transcodes gif/bmp to a Gemini-accepted format (not in this build - a
  transcode dependency this env cannot verify).
- **RES-VIS-4 - live accuracy verification.** Owner: repo owner. Instrument: a
  real PDF-with-screenshots and a docx-with-screenshots graded in production.
  Step: owner runs one of each after deploy and confirms the screenshots are
  acknowledged, since no API key exists here (section 12).
- **RES-VIS-5 - the disabled incremental action's sibling gate.**
  `grading-incremental.ts:150` uses `estimateEntryWireBytes` and is dead behind
  `INCREMENTAL_ROUTE_ENABLED = false` (`incrementalRunPlan.ts:110,132`); not
  edited here to keep the write set disjoint. Owner: whoever re-enables that
  route. Instrument: a partition test mirroring I3 there. Step: the wave that
  flips the flag must switch it to `estimateNeededWireBytes` and strip, or it
  reintroduces the spurious skip.
