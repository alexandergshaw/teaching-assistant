# PPT-TEMPLATE-UPLOAD-PLACE - security pass (untrusted .pptx + magic-byte boundary)

Author: security seat (loop-seat, Sonnet). Date: 2026-10-11. Branch main, HEAD
`550b242e` (`git rev-parse --short HEAD`). Consumes
`docs/ppt-template-upload-place-scope.md` (check verdict SHIP). READ-ONLY pass:
no production or test code. Written to be adversarially checked; a one-line
delta check may ratify it before it is folded into the build brief.

Every quantity names the command that produced it. Every `file:line` below was
opened in this session. "Measured" = a node script run against the repo's own
`node_modules/jszip` (3.10.1, `grep '"version"' node_modules/jszip/package.json`).

---

## 0. Verdict and the two findings that change the build

**Safe to build on the recommended readings (A1 + B1 + C1), conditional on the
numbered requirements below being in the W1 brief.** The upload path already
has: requireUser (`deck-template-files.ts:85`), per-user `.eq("user_id")` on
list/delete/fill (`:66,:123,:155`), a pre-decode wire-size check (`:89`), and a
capped zip open on every parse (`office-edit.ts:348-352`). No XML parser is on
the path. No external egress is on the path.

Two findings the scope did NOT carry, both in section 5 and both measured:

- **F1 (scope sec 1.7 is wrong about output size).** The scope says the 4.5MB
  cap "does not bind the output". Vercel's limits page, fetched today
  (`WebFetch https://vercel.com/docs/functions/limitations`, page dated
  2026-08-24), states: "The maximum payload size for the request body or the
  response body of a Vercel Function is 4.5 MB" (413 FUNCTION_PAYLOAD_TOO_LARGE).
  `upload-budget.ts:38` only ever documented the REQUEST side.
- **F2 (the fill output is re-emitted uncompressed).** `applyOfficeSections`
  ends in `zip.generateAsync({ type: "nodebuffer" })` with no `compression`
  option (`office-edit.ts:487`), and JSZip's default is STORE. Measured
  (`node m.cjs` in the scratchpad): a DEFLATE zip whose one 2,000,000-byte member
  is 2,413 bytes on disk regenerates to **2,000,455 bytes**, whether or not the
  member was touched. So the filled `.pptx` is roughly the template's total
  UNCOMPRESSED size, then base64 (x4/3), then must fit a 4.5MB response. A
  template that passes the 3.5MB-wire upload gate can still be unfillable.
  This is a refusal-path / resource finding, not a cross-user one; it applies
  today on the PowerPoint Design tab.

---

## 1. The magic-byte boundary (new)

### 1.1 Accept/reject contract (closed list; everything not accepted is rejected)

Layers, in order. Layer 1 is pure (`pptx-signature.ts`, client-importable).
Layers 2-4 are server (`pptx-validate.ts`).

| # | Input | Layer that decides | Outcome | Message class |
|---|---|---|---|---|
| 1 | Genuine .pptx | passes 1-4 | ACCEPT | - |
| 2 | .docx renamed .pptx (main part `/word/document.xml`, `wordprocessingml.document.main+xml`) | 3 | REJECT | "different Office file (Word or Excel)" |
| 3 | .xlsx renamed (`/xl/workbook.xml`, `spreadsheetml.sheet.main+xml`) | 3 | REJECT | same |
| 4 | .ppt OLE binary (head `D0 CF 11 E0`) | 1 | REJECT | "not a PowerPoint (.pptx) file" |
| 5 | Non-Office zip (valid PK head, no `[Content_Types].xml`) | 3 | REJECT | "not a PowerPoint (.pptx) file" |
| 6 | Non-zip (text, PDF, exe) | 1 | REJECT | same |
| 7 | PK head but truncated/corrupt zip (JSZip throws) | 2 | REJECT | worded, NOT the raw JSZip message |
| 8 | Macro-enabled (`application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml`) | 3 | REJECT | "macro-enabled files are not accepted" |
| 9 | Zip bomb with a valid-looking Content_Types | 2 (cap) | REJECT | worded (see 1.4) |
| 10 | `[Content_Types].xml` containing `<!DOCTYPE` or `<!ENTITY` | 3 | REJECT | "not a PowerPoint (.pptx) file" |
| 11 | Decoy: docx whose Content_Types has the pptx type string inside an XML comment, or on an Override whose PartName is not `/ppt/presentation.xml` | 3 | REJECT | different-Office / not-PowerPoint |
| 12 | Content_Types says presentation but zip has no `ppt/presentation.xml` member | 3 | REJECT | "not a PowerPoint (.pptx) file" |
| 13 | `[Content_Types].xml` declared size above 256KB | 3 (cap) | REJECT | worded |

Layer detail:

1. `sniffZipHead(head)`: true iff bytes 0-3 are `50 4B 03 04`. Only the
   local-file-header magic; `PK\x05\x06` (empty archive) and `PK\x07\x08` are
   rejected (Office never writes them first). Head is 4 bytes; the server runs
   it on `buffer.subarray(0, 4)`, the client pre-check on `file.slice(0, 4)`.
   Extension is advisory only (video-magic precedent, `video-magic.ts:1-8`).
2. Open through the capped pattern (section 2).
3. Read `[Content_Types].xml` (exact name, `zip.file("[Content_Types].xml")`),
   by `readOfficeMember` with a **tight member cap**:
   `createZipBudget({ maxMemberDeclaredBytes: 262144 })`
   (`zip-caps.ts:83-90` takes `Partial<ZipLimits>`; `readOfficeMember`,
   `zip-caps.ts:501`, enforces `limits.maxMemberDeclaredBytes` at `:509`).
   Then `isPptxContentTypes(xml)` as specified in 1.2.
4. Require `zip.file("ppt/presentation.xml")` non-null (the Override must point
   at a part that exists).

### 1.2 `isPptxContentTypes` (pure, no XML parser): exact algorithm

1. If the text contains `<!DOCTYPE` or `<!ENTITY` (case-sensitive; real OOXML
   never carries a DTD) return false.
2. Remove XML comments: `text.replace(/<!--[\s\S]*?-->/g, "")`. (Closes decoy 11a.)
3. Collect each tag with `/<Override\b[^>]*>/g`. For each, extract attributes
   with two separate anchored regexes `/\bPartName\s*=\s*"([^"]*)"/` and
   `/\bContentType\s*=\s*"([^"]*)"/` (attribute order is not fixed by OPC; do
   not write one regex that assumes an order).
4. Accept iff there is an Override with `PartName === "/ppt/presentation.xml"`
   and `ContentType` in the CLOSED set
   `{ "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml" }`
   (extended by `...presentationml.slideshow.main+xml` and
   `...presentationml.template.main+xml` only if the owner takes R-POTX; the
   `macroEnabled` types are never in the set). Equality, never `includes`.
5. Classification for the message only: if no accept and the text contains
   `wordprocessingml` or `spreadsheetml` return the different-Office class.

ReDoS check: every pattern is a single-pass scan with no nested quantifier;
input is capped at 256KB by layer 3 before it is converted to a string.

### 1.3 XXE and execution-path statement

- **No XML parser anywhere on this path.** Measured:
  `grep -rn "DOMParser\|xml2js\|fast-xml\|xmldom" src` returns only
  `src/lib/accessibility/remediate.ts`, which is not imported by
  `deck-template-files.ts`, `office-edit.ts`, `office-template-fill.ts` or
  `zip-caps.ts` (their imports opened in this session). `package.json` lists
  `jszip` and no XML parser (`grep -n "jszip\|xml2js\|fast-xml\|DOMParser\|xmldom" package.json`
  returned only `"jszip": "^3.10.1"`). `office-edit.ts` reads slide text with
  regexes (`PPTX_PARA`, `PPTX_RUN`, `office-edit.ts:109,111`). So external
  entities cannot be resolved because nothing resolves entities. Requirement:
  `pptx-signature.ts` and `pptx-validate.ts` import no XML parser; if a future
  change introduces one, entity/DTD resolution must be disabled AND this
  document re-opened. Step 1 of 1.2 (DOCTYPE/ENTITY reject) is defence in depth.
- **The sniff reads bytes and one declared-size-capped member as a string.** It
  executes nothing, evals nothing, writes nothing to disk, resolves no URL, and
  does not extract members by name to a filesystem (so zip-slip has no sink: JSZip
  entries stay in memory).
- Output-side injection: generated text is written into `<a:t>` via
  `escapeXml` (`office-edit.ts:103-105,199`), escaping `&`, `<`, `>`; this is a
  text node, so unescaped quotes are not reachable. Checked-safe.

### 1.4 Error surface (requirements, because the catch reflects `err.message`)

`deck-template-files.ts:113-115` returns `err.message` verbatim for any throw.
Therefore:

- **S-ERR-1.** `assertPptxContainer` wraps `JSZip.loadAsync` failures (e.g.
  "Can't find end of central directory", row 7) and throws a worded error
  (a small `PptxValidationError extends Error`). The raw library text must not
  reach the user.
- **S-ERR-2 (wrong copy today).** A `ZipCapError` message ends "Nothing was
  graded. Remove or shrink that file, or split the archive into smaller parts"
  (`zip-caps.ts:163-165`). Shown verbatim to a template uploader that is wrong.
  The upload action must catch `ZipCapError` (`instanceof`, or the
  `ZIP_REFUSAL_PREFIX` at `zip-caps.ts:29`) and return template-worded text
  ("That file is too large or too heavily compressed to open safely."). Rows 9
  and 13 both need this.
- Do not widen the generic catch to hide other errors in this item (pre-existing,
  owner-wide); register it as R-S-CATCH (section 9).

---

## 2. Zip-bomb / resource: cap on every open

Measured, `grep -n "loadAsync\|assertContainerWithinCaps\|openOfficeZip" src/lib/office-edit.ts src/lib/decks/*.ts src/app/actions/deck-template-files.ts`:

- The ONLY non-test `JSZip.loadAsync` in the template path is `office-edit.ts:349`,
  immediately followed by `assertContainerWithinCaps(zip, "office-file")` at
  `:350`. `openOfficeZip` (`:348`) is NOT exported, and has 8 call sites
  (`:378,458,496,542,602,661,698,716`), so every
  parse/fill/re-parse is capped (CONFIRMED; matches scope sec 1.5).
- A fill executes 4 capped loads: `groupOfficeTemplateParagraphsBySlide`
  (`office-template-fill.ts:132-136`), `fillOfficeTemplate`'s parse (`:114`),
  and `applyOfficeSections`'s parse (`office-edit.ts:428`) plus its own
  `openOfficeZip` (`:458`). All capped. Rows stored before W1 (extension-only
  validated) are read through the same capped path, so legacy rows are not a
  bomb vector.
- `assertContainerWithinCaps` (`zip-caps.ts:427-499`) is synchronous over the
  central directory and fails closed: entry count > 2000, member declared >
  40MB, member ratio > 100 (above a 1MB floor), total declared > 100MB.

**The new validator is where an UNCAPPED open could be introduced.**
`openOfficeZip` is not exported and the scope forbids editing `office-edit.ts`,
so `pptx-validate.ts` must open the zip itself. Requirements:

- **S-CAP-1.** In `pptx-validate.ts`, `JSZip.loadAsync(buffer)` is followed
  IMMEDIATELY (no intervening statement, no member read, no `.file()` lookup
  that decompresses) by `assertContainerWithinCaps(zip, "office-file")`, the
  same two-line pattern as `office-edit.ts:349-350`. Every member read goes
  through `readOfficeMember`. No `entry.async(...)` call anywhere in the file.
- **S-CAP-2 (instrument, source-text).** A structure/pin test reads
  `pptx-validate.ts` as text and asserts: every occurrence of `loadAsync` is
  followed within the same function by `assertContainerWithinCaps`, and the file
  contains no `.async(`. Direction: RED if either is absent.
- **S-CAP-3 (instrument, behavioural).** A fixture bomb built with the idiom in
  `office-edit.zip-caps.test.ts:25-53` (`patchDeclaredSize` lies about a
  member's size in the central directory; DUPLICATE it, no cross-test-file
  import) with a valid Content_Types and a member declared above 40MB:
  `assertPptxContainer` must reject with a `ZipCapError`. Sabotage: delete the
  cap call from `pptx-validate.ts` -> this test goes RED and S-CAP-2 goes RED.
- **Double load is accepted.** Validate loads once, `parseOfficeParagraphs`
  loads again (`:93`). Both capped; the extra cost is a central-directory parse
  (JSZip does not decompress at load). Not worth an `office-edit.ts` edit to
  share. Register nothing.
- Existing fixture trap: the existing `makePptx` (`office-edit.zip-caps.test.ts:19-24`)
  has NO `[Content_Types].xml`, so it would be REJECTED by the new validator.
  The W1 action-test fixtures must include a real
  `<Override PartName="/ppt/presentation.xml" ContentType="...presentation.main+xml"/>`
  and a `ppt/presentation.xml` member. The existing office-edit tests do not go
  through the validator and are unaffected (checked-safe).

---

## 3. Auth and per-user scoping

Opened: `deck-template-files.ts` whole file; `supabase/migrations/20261021000000_create_deck_template_files.sql`;
`auth.ts:328-358` (`requireUser`).

| Action | Auth | Scope filter | Line |
|---|---|---|---|
| list | `requireUser()` | `.eq("user_id", user.id)` | `:63,66` |
| upload | `requireUser()` | row `user_id: user.id` from session, not from a client arg | `:85,102` |
| delete | `requireUser()` | `.eq("user_id", user.id).eq("id", id)` | `:121,123` |
| fill | `requireUser()` | `.eq("user_id", user.id).eq("id", templateFileId)` | `:150,155-156` |

CONFIRMED: fill re-scopes by `user_id` at the query, so a guessed or stale
foreign id selects zero rows -> `maybeSingle()` null -> "That template no longer
exists." (`:159`). A foreign id and a nonexistent id return the SAME message
(no existence oracle).

**Important:** the client is `createServiceClient()` (`:55`; migration header
`:6-7` "Writes go through the Supabase service-role client"). Service role
BYPASSES RLS, so the RLS policies in the migration are NOT a control on this
path. The `.eq("user_id")` filters are the only guard. Requirements:

- **S-AUTH-1 (instrument).** W1's new `deck-template-files.test.ts` mocks
  `requireUser` (user A) and `createServiceClient` with a call-recording chain,
  and asserts that list, delete and fill each call `.eq("user_id", "<A>")`, and
  that upload's inserted row has `user_id === "<A>"`. Direction: RED if any
  action drops the filter. Sabotage: remove `.eq("user_id", ...)` from fill ->
  RED. (No test file exists today:
  `ls src/app/actions/deck-template-files*` returned only the source file.)
- **S-AUTH-2 (non-uuid id).** `id` is a uuid column. A non-uuid string
  (tampered or stale `ta-ppt-template-file-id`) currently reaches Postgres and
  returns the raw `invalid input syntax for type uuid` text (`:158`, `:124`).
  Add a module-private (NOT exported; a `"use server"` file may export only
  async functions, `seats.md` Security checker question 3) uuid-shape test in
  fill and delete returning "That template no longer exists." Direction: RED if
  a non-uuid id yields a Postgres message. Same file as W1, no new export, so
  `guard-overtightening.test.ts:184-196` is unaffected.
- **S-AUTH-3 (shared selection key, Fork C1).** The key
  `ta-ppt-template-file-id` is browser-local (`ppt-design/hooks.ts:133`); two
  accounts in one browser can see each other's stored id. This is safe at the
  server (above), so no cross-user read is possible. Reliability requirement for
  the picker: reconcile the stored id against `listDeckTemplateFilesAction`
  (user-scoped) on mount and clear it if absent, so a foreign/stale id does not
  make every download fail. Source-text pin: the picker reads the list and
  clears on absence.
- Fill input shape: `deck` is client-controlled. Add a guard that
  `Array.isArray(deck.slides)` and each slide has string `title` and an array
  of string `bullets`, returning a worded error (today a malformed body throws a
  raw TypeError that the catch reflects). Low severity, same file, no new export.
  Size is already bounded by the 4.5MB request cap; slide count by
  `planSlideTemplateFill` refusing M > T (`office-template-fill.ts:179-186`).
- Per-user quota: there is no cap on the NUMBER of stored templates
  (`grep -n "count\|limit" src/app/actions/deck-template-files.ts` has no
  match). Each row is up to ~3.5MB of base64 text in Postgres. Authenticated
  users only, so low severity; register as R-S-QUOTA (section 9) rather than
  block the build.

---

## 4. Transport and size: the real limits and the refusal path

Measured: `node -e "Math.floor(3.5*1048576/(4/3))"` = **2,752,512 bytes** (about
2.6MB on disk) is the largest file the 3.5MB wire budget admits
(`upload-budget.ts:41,65`). The platform request cap is 4.5MB
(`upload-budget.ts:38`; confirmed against the Vercel page above).
`next.config.ts:14` sets `bodySizeLimit: "10mb"`, which does NOT raise the
Vercel cap (`upload-budget.ts` header comment).

Three size bands for the UPLOAD request:

- wire <= 3.5MB: accepted by the size gate (`:89`).
- 3.5MB < wire <= 4.5MB: the action runs and refuses CLEANLY with
  `checkWireBudget`'s worded message (`upload-budget.ts` `checkWireBudget`),
  BEFORE any decode (`Buffer.from` is at `:92`, after the check). No OOM path.
- wire > 4.5MB: the platform rejects before the action runs; the user sees an
  opaque failure (`ppt-design/index.tsx:443-450` has no client pre-check, so this
  exists today).
  - **S-SIZE-1.** `DeckTemplatePicker` calls
    `checkFileWireBudget(file.size, "That template")`
    (`upload-budget.ts:101`) on the `File` BEFORE `readFileAsBase64`, and shows
    the worded refusal. It converts disk bytes to wire bytes first, so it counts
    the right unit. Source-text pin: the picker imports `checkFileWireBudget`
    and calls it before the upload action.

Does a realistic template fit, or does it need direct-to-storage? **For the
upload leg: a text/vector-heavy template (under ~2.6MB) fits; an image-heavy
master does not and is refused cleanly.** I do not recommend the
direct-to-storage path for this item, because the fill leg (below) is the
tighter limit and storage transport would not relieve it. Whether the owner's
real templates fit is an owner-walk (R-WIRE, unchanged).

### The fill/response leg (F1 + F2) - requirements

The filled file returns as a server-action RETURN value, and Vercel caps the
response at 4.5MB. With STORE regeneration (F2) the response is about
`4/3 * (sum of the template's declared member sizes + headers)`.

- **S-OUT-1 (backstop, REQUIRED).** In `fillDeckTemplateFileAction`, after
  `fillOfficeTemplate` and before returning, compute `out.toString("base64")`
  length and refuse with a worded message when it exceeds
  `UPLOAD_WIRE_BUDGET_BYTES` (3.5MB, leaving 1MB for the action envelope; reuse
  the constant, do NOT reuse `checkWireBudget`'s upload-worded message): "The
  filled deck is X.XMB, larger than the Y.YMB this app can return in one
  response." Direction: RED if an oversize fill returns a payload instead of an
  error. Test: a fixture template with a highly compressible large member
  (regenerated STORE size over budget, wire size tiny).
- **S-OUT-2 (fail-fast, RECOMMENDED).** In `assertPptxContainer` (it already has
  the central directory), sum the members' declared sizes with `declaredSizesOf`
  (`zip-caps.ts:214`, exported) and reject at UPLOAD when `4/3 * (sum + 30*N +
  46*N + 22)` exceeds the same budget, with a message that says the template
  expands to X MB and the fill limit is Y MB. Reason: with STORE regeneration
  this estimate is nearly exact, so it turns a guaranteed late fill failure into
  an early clear refusal, and it also stops a hostile template (declared up to
  the 100MB cap, `zip-caps.ts:417`, at ratio <= 100 so compressed >= 1MB, which
  fits the 2.6MB upload) from forcing a roughly 100MB buffer plus 133MB base64
  string on every fill. Cost: it changes the PowerPoint Design tab's upload
  behaviour for templates that expand past the budget (AC-9: a genuine .pptx that
  is fillable still uploads). Put to the owner as S-FORK-1 (section 8).
- **S-OUT-3 (the better fix, OWNER decision).** Pass `compression: "DEFLATE"` in
  `applyOfficeSections`'s `generateAsync` (`office-edit.ts:487`). Output then
  tracks input size and S-OUT-2's gate relaxes. It edits the shared 792-line
  `office-edit.ts` and changes bytes (not content) of the emitted file for every
  docx/pptx edit caller, so it is NOT in this item's write set; register as
  R-S-DEFLATE. I did not measure the DEFLATE result on a real template.

---

## 5. PII and egress

Measured: `grep -n "fetch(\|https://" src/lib/decks/office-template-fill.ts src/app/actions/deck-template-files.ts src/lib/office-edit.ts`
returned no match. The upload path's only I/O is the Supabase service client
(the data provider, `:55`). The fill action makes no model call (header comment
`:10-13`) and runs entirely server-side on the stored base64. Nothing in the
upload, validate, parse or fill path reaches a non-provider endpoint.
`vitest.setup.ts` blocks real `fetch`, so no test can exercise egress; the claim
rests on the grep above plus reading the three files' imports. A template is
instructor content, persisted per user. I did not and cannot inspect what the
owner's real templates contain (could include names); that is why the
cross-user scoping in section 3 is the control that matters.

---

## 6. Ordering: validate -> parse -> persist (fail fast)

Current (`deck-template-files.ts`): name `:86` -> extension `:87` -> empty `:88`
-> wire budget on `base64.length` `:89` (before decode) -> decode `:92` -> parse
`:93` -> sha256 `:100` -> insert `:109`.

Required: insert `await assertPptxContainer(buffer)` between `:92` and `:93`.
Inside it the order is head sniff (4 bytes, no zip work) -> capped open ->
Content_Types -> presentation part. Every rejection happens before the
paragraph parse, the sha256 over the buffer, and the DB insert.

- **S-ORDER-1 (instrument).** `deck-template-files.test.ts` runs a rejected
  fixture for each of rows 2-8, 10-13 of the table in 1.1 and asserts the
  recording mock's `insert` was NEVER called and `parseOfficeParagraphs` (spy) was
  never called for the head-sniff rows (4, 6). Direction: RED if a rejected file
  reaches insert or the parse. Sabotage: move the assert after `insert` -> RED.
- **S-ORDER-2 (fail-fast shape).** A non-zip (row 6) must be rejected without
  `JSZip.loadAsync` being called (spy on the module). Direction: RED if the sniff
  does not short-circuit.

---

## 7. Test and instrument summary (what the W1 test/build seat implements)

Gate for the multi-file check is the wrapper's per-argument form, never raw
vitest: `npm run test:paths src/lib/decks/pptx-signature.test.ts
src/lib/decks/pptx-validate.test.ts src/app/actions/deck-template-files.test.ts
src/lib/office-edit.zip-caps.test.ts src/app/actions/guard-overtightening.test.ts`
(`docs/loop/this-repo.md` section on the wrapper). `pptx-validate.test.ts` is a
NEW file this pass asks the scope's W1 write set to add (the scope lists only
`pptx-signature.test.ts` and `deck-template-files.test.ts`); S-CAP-2/3 live there.
Also run the repo canaries (`no-emojis.test.ts`, `source-bytes.structure.test.ts`,
`file-size-ceiling.structure.test.ts`) and `npx tsc --noEmit`.

| Req | Object | Instrument | Direction of failure |
|---|---|---|---|
| Accept/reject table 1.1 rows 1-13 | `sniffZipHead`, `isPptxContentTypes`, `assertPptxContainer` | unit tests over in-test JSZip fixtures | RED if any non-pptx accepted, a real pptx rejected, or a message class wrong |
| 1.2 equality not `includes` | `isPptxContentTypes` | decoy fixtures (comment, wrong PartName) | RED if a decoy is accepted |
| 1.3 no XML parser | `pptx-signature.ts`, `pptx-validate.ts` | source-text pin: no import matching `xml2js\|fast-xml\|xmldom\|DOMParser`; no `.async(` | RED if present |
| S-CAP-1..3 | `pptx-validate.ts` | source-text + lying-central-directory bomb fixture | RED if loadAsync lacks the cap call or the bomb is accepted |
| S-ERR-1/2 | upload action catch | corrupt-zip and bomb fixtures assert message does NOT contain "Nothing was graded" or "end of central directory" | RED if raw text reaches the user |
| S-AUTH-1/2 | list/upload/delete/fill | recording mock | RED if `user_id` filter dropped or non-uuid reaches the query |
| S-SIZE-1 | picker | source-text pin: `checkFileWireBudget` before upload action; picker imports `pptx-signature` only, never `pptx-validate` or `zip-caps` (registry/client-bundle guard, jszip must not enter the client bundle) | RED otherwise |
| S-OUT-1 | fill action | large-compressible fixture | RED if oversize payload returned |
| S-ORDER-1/2 | upload action | spies on insert / loadAsync | RED if a rejected file reaches insert/parse |
| Guard shape | `deck-template-files.ts` exports | `guard-overtightening.test.ts:184-196` unchanged | RED if any new export or non-`export async function` export is added; helpers (uuid regex, size constant) stay module-private |

---

## 8. Forks (each answer terminates; build proceeds on the recommendation)

- **S-FORK-1 - fail-fast expansion gate at upload (S-OUT-2).** Recommend: build
  S-OUT-1 (backstop) AND S-OUT-2 (upload-time estimate). Alternative: S-OUT-1
  only. Cost if the owner prefers the alternative: delete one check in
  `pptx-validate.ts`; templates that expand past the budget then upload and fail
  at fill with the worded S-OUT-1 message instead. Either answer ends this
  activity; R-S-DEFLATE is the long-term fix in both.
- **R-POTX** (scope sec 9) stays an owner choice; security-neutral for
  `.potx`/`.ppsx` (no macros). `macroEnabled` is rejected in both readings.

---

## 9. Residual register (owner / instrument / step)

- **R-S-WIRE-FIT** - a real template vs the upload wire budget AND the fill
  response budget. Owner: repo owner. Instrument: upload then fill the owner's
  actual template; expect success or one of the two worded refusals (never an
  opaque 413). Step: owner walk after W2.
- **R-S-DEFLATE** - emit DEFLATE from `applyOfficeSections`
  (`office-edit.ts:487`). Owner: repo owner (shared file, bytes change for all
  callers). Instrument: round-trip a real template, compare sizes, run
  `office-edit.test.ts` and `office-edit.zip-caps.test.ts`. Step: its own backlog
  item after W1; until then S-OUT-1/2 carry the load.
- **R-S-VERCEL-RESP** - the 4.5MB RESPONSE cap is taken from Vercel's published
  page (fetched today), not from a deployed measurement; and I did not verify the
  server-action response envelope overhead (I budgeted 1MB). Owner: repo owner.
  Instrument: fill an over-budget template on the deployed app. Step: owner walk
  with R-S-WIRE-FIT.
- **R-S-CATCH** - the generic `catch` in all four actions reflects `err.message`.
  Owner: repo owner. Instrument: a source-text sweep for `err.message` in
  `src/app/actions/*.ts` catch blocks. Step: own backlog item (pre-existing,
  repo-wide, out of scope).
- **R-S-QUOTA** - no per-user template count cap. Owner: repo owner. Instrument:
  count query in upload plus test. Step: own backlog item after W1.
- **R-S-LEGACY** - rows uploaded before W1 were extension-validated only, so a
  stored row could be a non-pptx. Impact: none beyond today (fill reads through
  the capped, regex-based path and fails with "Could not read any slides").
  Owner: repo owner. Instrument: none needed unless the owner wants cleanup.
  Step: none scheduled.
- Not determinable here (`docs/loop/this-repo.md` section 6): no render, no
  network, no live Supabase, no deployed Vercel. All size claims about real
  templates, and the response-envelope headroom, are owner-walk.

---

## 10. Sign-off

Safe to build W1 (and W2/W3) on A1+B1+C1 provided the W1 brief carries S-CAP-1..3,
S-ERR-1/2, S-AUTH-1/2, S-ORDER-1/2, S-OUT-1 (and S-OUT-2 per S-FORK-1) and W2
carries S-SIZE-1 and the S-AUTH-3 reconcile. The scope's sec 1.7 sentence
"the 4.5MB request cap does not bind the output" should be struck from the build
brief (F1). The scope's 1.5 claim that the zip cap is already applied is
CONFIRMED independently here, and the zip-bomb risk the new validator could
add is closed by S-CAP-1..3.

Commands that produced this document's quantities: `git rev-parse --short HEAD`;
`node -e` (2,752,512); the scratchpad `m.cjs` JSZip regeneration (2,413 ->
2,000,455); `grep -n` over `office-edit.ts`, `deck-template-files.ts`,
`upload-budget.ts`, `zip-caps.ts`, `package.json`, `next.config.ts`; WebFetch of
the Vercel limits page; `ls src/app/actions/deck-template-files*`.
