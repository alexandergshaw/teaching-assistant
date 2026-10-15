# DECOMPRESS-CAP-HARDENING scope

Scope only. No production code is written here. One architect pass; a fresh
`loop-checker` reads this before any builder.

Clusters three UNSCOPED `docs/BACKLOG.md` rows (lines 218, 219, 223) plus one
named residual (W0b, inside the PRESENTATIONS-TEMPLATE row at line 285) that are
the SAME CLASS - decompress/parse-before-any-bounded-cap on an ingest path -
and share the extraction/materials path plus the `src/lib/zip-caps.ts`
primitives already shipped (ZIP-BOMB-CAPS BW0 + PRESENTATIONS-TEMPLATE W0).

`GUARD-TESTGEMINI-ACTION` (BACKLOG line 95) is EXCLUDED: it is an owner decision
(guard vs intentionally-open), not a decompress-cap hole. Not scoped here.

---

## 0. Conflicts with the dispatch brief, measured

The brief said "trust the code"; the code disagrees with the brief in four
places, each load-bearing for how the fix is shaped. Recorded so the checker
need not re-derive them, and so no builder inherits a wrong frame.

1. **office-edit.ts does NOT "decompress before any cap."** Every one of its
   raw-decompress sites is reached only AFTER `openOfficeZip()`
   (`src/lib/office-edit.ts:348-352`), which runs `assertContainerWithinCaps`
   over EVERY member from DECLARED sizes before any decompress. So a
   declared-size bomb (a member whose header declares a huge size) is ALREADY
   refused for all these functions. The residual is NARROWER and exact: a
   LIE-LOW member (header declares small, stream decompresses large) passes the
   declared-size pre-flight - its ratio check is skipped because a small
   declared size is below `ZIP_RATIO_FLOOR_BYTES` (1 MB, `zip-caps.ts:40`) - and
   the raw `.async()` then decompresses it unbounded. The bounded reader
   (`readMemberBounded`, which the pre-flight does NOT invoke on these sites) is
   the only thing that stops lie-low. The BACKLOG W0b row already states this
   correctly ("NOT bounded against a lie-low member by the pre-flight alone");
   the dispatch brief's "decompress before any cap" wording is the imprecise
   one. The lie-low distinction CHANGES THE ORACLE: the fixture must be
   small-declared / large-actual, not the declared-large fixture the existing
   `office-edit.zip-caps.test.ts` uses - a declared-large fixture is already
   refused by the pre-flight on these sites and proves nothing.

2. **The count is 14 raw `.async()`, not ~12.** `grep -n '\.async(' src/lib/
   office-edit.ts` returns 14 lines (488, 536, 547, 596, 603, 614, 625, 635,
   652, 663, 684, 702, 724, 731). `generateAsync` (serialize) is excluded by the
   `\.async(` anchor and is NOT a decompress. The BACKLOG row's "12 OTHER raw
   .async reads" is an approximation; the measured census is 14.

3. **`openOfficeZip` is NOT a zip-caps export.** The brief lists it among "the
   zip-caps.ts primitives already shipped." It is a PRIVATE function local to
   `src/lib/office-edit.ts:348`. The zip-caps.ts exports this scope reuses are:
   `ZIP_REFUSAL_PREFIX`, `ZIP_MAX_MEMBER_DECLARED_BYTES`, `ZipCapError`,
   `declaredSizesOf`, `readMemberBounded`, `readOfficeMember`,
   `assertContainerWithinCaps`, `createZipBudget`, `chargeArchiveLevel`. Do not
   import `openOfficeZip` from zip-caps; it is not there.

4. **The NESTED-ZIP row's stated blocker is already cleared.** BACKLOG line 219
   says surfacing "needs the typed StudentSubmissionEntry skip field that
   BULK-ZIP BW2 designs, so coordinate with that." BW2 has SHIPPED: the skip
   surface exists as `IngestLedger.failedSupportedFiles` /
   `IngestLedger.skipped` (`src/lib/grade/ndjson-ingest-parser.ts:17-22`),
   folded to the UI through `buildLedgerView` (`src/app/components/grading-chat/
   ingestLedger.ts:36-53`). The fix is UNBLOCKED. See item 2 for the one
   reachability caveat this creates (the engine whole-run path).

The stale line numbers in the brief (materials `:45-56`, extraction `:90-92`)
are corrected per item below; the extraction swallow is at `:174-177`, not
`:90-92`.

---

## 1. Leverage question, answered

All three items are SECURITY HARDENING and BUG FIXES (a silent drop becoming a
visible row; an unbounded decompress becoming a bounded one). `DEV_LOOP.md`
("The loop / Criteria") and `seats.md` (Acceptance criteria) both rule that a
bug fix / hardening change carries NO leverage claim. **Fired trigger: bug fix /
hardening - no leverage claim is owed, and none is made.**

For honesty about the one item that touches a user-visible surface: item 2
(nested-zip skip row) COMPOUNDS an advantage the app already earned and shipped -
the ingest ledger's accounting identity (`studentsFound === studentsEmitted +
skipped.length`, `ingestLedger.ts:45`), a GUARANTEED-class mechanism a chat
cannot hold (a chat has no ledger reconciling who was found against who was
emitted). Item 2 does not EARN a new class; it closes a leak in an existing one.
No new leverage criterion is created.

---

## 2. Reused primitives (vetted, each line opened)

| Symbol | `file:line` | What it gives us |
|---|---|---|
| `ZIP_REFUSAL_PREFIX` = `"Refused: "` | `zip-caps.ts:29` | The refusal-message prefix grading-incremental routes to a dead-end "refused" mode. Reuse verbatim. |
| `ZIP_MAX_MEMBER_DECLARED_BYTES` = `40*1024*1024` | `zip-caps.ts:38` | The per-decompressed-member ceiling. Item 3 reuses it as the single-artifact parse cap. |
| `ZipCapError` | `zip-caps.ts:142-166` | The "Refused: "-prefixed error class with a typed `ZipCapDetail`. |
| `declaredSizesOf(entry, name, chain?, limits?)` | `zip-caps.ts:204-215` | `{declared, compressed}` from the central directory; FAILS CLOSED (throws `ZipCapError` "unverifiable-size" when a size is unreadable). |
| `readMemberBounded(entry, declared, name, chain?, limits?)` | `zip-caps.ts:338-402` | Reads one member to a Buffer, aborting with a "stream-overrun" `ZipCapError` the moment the stream exceeds `declared` - the lie-low guard. |
| `readOfficeMember(entry, name, budget, chain?)` | `zip-caps.ts:491-523` | `declaredSizesOf` + member-cap + cumulative-cap + `readMemberBounded`, charging a shared `ZipBudget`. The office-container member reader. |
| `assertContainerWithinCaps(zip, name, chain?, limits?, container?)` | `zip-caps.ts:417-484` | Declared-size pre-flight over EVERY member; refuses before any decompress. Already run by `openOfficeZip`. |
| `createZipBudget(overrides?)` | `zip-caps.ts:76-83` | A fresh shared accumulator. |
| `openOfficeZip(buffer)` (private) | `office-edit.ts:348-352` | `JSZip.loadAsync` + `assertContainerWithinCaps`. Already guards every office-edit function's CONTAINER. |
| `readXmlMember(entry, budget)` (private) | `office-edit.ts:355-357` | `readOfficeMember(...).toString("utf-8")`. The bounded string reader item 1 routes the raw `.async("string")` sites through. |

**Do-not-reuse:** `chargeArchiveLevel` / `runBounded` (zip-caps.ts) - they are
the whole-archive refuse-semantics walker for the grading batch; items 1 and 3
need per-member / per-buffer bounding with best-effort or single-artifact
semantics, not a whole-archive refusal. Reusing them would change the two
non-grading paths' contracts (materials-extract lists oversized members with
empty text; it must not start refusing the whole zip).

---

## 3. Item 1 (W1): MATERIALS-EXTRACT-DECOMPRESS-HOLE + W0b office-edit census

Two files, one mechanism: route every raw member decompress through the bounded
reader so a lie-low member cannot be fully inflated before a size check.

### 1A. materials-extract.ts - the clean "decompress before ANY cap" case

**Owning file:function:** `src/app/actions/materials-extract.ts` ->
`extractZipMaterialsTextAction` (the loop at `:49-61`).

**The hole (confirmed):** `:45` `JSZipMod.loadAsync(...)` with NO
`assertContainerWithinCaps`, then `:51` `await member.async("nodebuffer")`
decompresses the FULL member into memory, and only `:52`
(`buffer.byteLength > maxMemberBytes`) discards it afterward. A 100 MB
header-honest member, or a lie-low member, is fully materialised before the
check. This is the one true "decompress before any cap" site of the three.

**Minimal write set (behaviour-preserving except for the hole):** inside the
existing per-member `try` (`:50`), BEFORE decompressing:
- `const { declared } = declaredSizesOf(member, member.name);` (fail-closed:
  an unreadable size throws into the existing `catch` at `:58` -> listed with
  empty text, which is the current contract for a member that cannot be read).
- `if (declared > maxMemberBytes) { entries.push({ name, size: declared, text: "" }); continue; }` - skip WITHOUT decompressing (today it decompresses first).
- else `const buffer = await readMemberBounded(member, declared, member.name);`
  then `extractTextFromBuffer` as today. A lie-low member whose stream exceeds
  `declared` throws "stream-overrun" into the existing `catch` -> empty text.

**Contract preserved on purpose:** this path is `requireOwner()`-gated (`:43`),
best-effort, and documented to LIST oversized/unreadable members with empty text
and never fail the whole call (`:21-24`, `:33-35`). So it reuses
`declaredSizesOf` + `readMemberBounded` but DELIBERATELY does NOT call
`assertContainerWithinCaps` (which would refuse the whole archive). Stated as a
deviation, not an omission: refusing the owner's own materials zip because one
member is oversized would regress the workflow-source feature. The existing
per-member `catch` (`:58-60`) already converts any throw to an empty-text entry,
so the bounded reader's refusals integrate with no new error handling.

**Accepted residual (named, not silent):** `Object.values(zip.files)` (`:46`)
and the 20-member slice bound how many members are PROCESSED, not how many the
central directory holds; a pathological central directory is a `loadAsync`-time
concern shared by every JSZip caller in the repo and is out of scope for this
hardening. Owner: materials-extract; instrument: none here; step: folded into
the accepted-residual register (section 7) - do not pretend it is closed.

### 1B. office-edit.ts - W0b, the lie-low residual on 14 raw `.async()` sites

**Owning file:** `src/lib/office-edit.ts`. **Owning functions (each calls
`openOfficeZip` first, then reads members raw):**

| Function | `file:line` of `openOfficeZip` | raw `.async()` lines | reader kind |
|---|---|---|---|
| `appendDocxParagraph` | 485 | 488 | string |
| `extractOfficeImages` | 530 | 536, 547 | string |
| `extractOfficeImageData` | 589 | 596, 603, 614, 625, 635 | 596 base64; rest string |
| `setOfficeImageAlt` | 647 | 652, 663 | string |
| `extractDocxTitle` | 683 | 684 | string |
| `setDocxTitle` | 700 | 702, 724, 731 | string |
| `extractOfficeImagesWithData` | - (composes the two above) | - | - |

`parseOfficeParagraphs` (`:366`) and `applyOfficeSections` (`:412`) are ALREADY
bounded (they use `readXmlMember` at `:373,391,452,463`) - leave them.

**The hole (confirmed by reading):** `openOfficeZip` refuses a declared-LARGE
bomb, but a LIE-LOW member passes its pre-flight and the raw `.async()` inflates
it unbounded. Reachable in production via `src/lib/canvas-modules/office.ts`
(the Canvas office-edit feature: `appendOfficeParagraph`, `getOfficeFileStructure`,
`saveOfficeFileStructure`, `saveOfficeFileImageAlt` reach the raw functions) and
via `src/lib/grade/inline-visuals.ts:25` (`extractOfficeImagesWithData`, on the
grading path through `engine.ts`). The Canvas path caps the buffer at 15 MB
(`office.ts:50,63`) - that bounds the CONTAINER, not a lie-low MEMBER inside it.

**Minimal write set:** route every raw member read through the bounded reader.
- String reads: replace `await <entry>.async("string")` with
  `await readXmlMember(<entry>, budget)` (the existing helper, `:355`).
- The one base64 read (`:596`): add a sibling private helper
  `readBase64Member(entry, budget)` = `(await readOfficeMember(entry, entry.name, budget)).toString("base64")` and use it.
- Each of the 6 functions creates one `const budget = createZipBudget();` after
  its `openOfficeZip`, shared across that function's member reads.
- Preserve every existing null guard: `const f = zip.file(path); if (!f) return <existing>; const xml = await readXmlMember(f, budget);` - the optional-chaining
  sites (`:603,614,625,635,684,702,724,731`) must keep returning exactly what
  they return today when the member is absent.

`extractOfficeImagesWithData` needs no edit beyond inheriting its callees' fix.

### Oracle / instrument for item 1

vitest is node-env, network-blocked, renders nothing - all buildable. Extend
`src/lib/office-edit.zip-caps.test.ts` (it already has `makePptx` and
`patchDeclaredSize`, `:12-45`) and add a materials-extract sibling. Test-author
owns final construction; the SPEC and sabotage are fixed here:

- **Lie-low member fixture (the new shape).** Reuse `patchDeclaredSize` but patch
  the target member's declared uncompressed size to a value SMALLER than its real
  content (e.g. 5 bytes for an ~80-byte member), not larger. Then:
  - `assertContainerWithinCaps` passes (small declared < member cap; ratio check
    skipped below the 1 MB floor) - proving the pre-flight does NOT catch this.
  - The bounded reader's first data chunk exceeds `declared` -> "stream-overrun"
    `ZipCapError`.
- **office-edit assertions (one per function listed in 1B):** patch the member
  that function reads (document.xml for `appendDocxParagraph`/`setOfficeImageAlt`;
  slide XML for the pptx branch of `extractOfficeImages`; core.xml for
  `extractDocxTitle`/`setDocxTitle`; an image member for `extractOfficeImageData`),
  then `await expect(fn(...)).rejects.toBeInstanceOf(ZipCapError)` and
  `.rejects.toThrow(ZIP_REFUSAL_PREFIX)`.
- **materials-extract assertion:** a zip with a lie-low member -> the returned
  `entries` lists that member with `text: ""` (best-effort, NOT a throw), AND a
  zip with a header-honest oversized member (declared > `maxMemberBytes`) ->
  listed with `text: ""` and NEVER fully decompressed. Both are machine-checkable
  on the action's return value.
- **Source-text census instrument (regression guard, pins the FACT not a
  spelling):** a structure assertion that `src/lib/office-edit.ts` contains ZERO
  matches of `/\.async\(/` and `src/app/actions/materials-extract.ts` contains
  ZERO matches of `/\.async\(/` (both `readFileSync` scans; `generateAsync` is
  excluded by the anchor and stays legal). This makes a future raw decompress
  re-reddening the gate. Put it in a `*.structure.test.ts` or the existing
  zip-caps test file.
- **Legit-file guards stay green:** the existing "still parses / still fills"
  cases (`office-edit.zip-caps.test.ts:48-63`) and a new "materials-extract lists
  a normal member's text" case prove the routing did not regress good files.

**Sabotage proving each oracle catches the live hole:** revert the one function's
member read to raw `await <entry>.async(...)` (and remove its `budget`). The
lie-low fixture is then ACCEPTED (resolves, no refusal) -> the `rejects`
assertion goes RED. For the source-text instrument, re-adding one `.async(` call
reddens it directly. Do this per function so a kill is owed for each.

---

## 4. Item 2 (W2): NESTED-ZIP-SILENT-SKIP

**Owning file:function:** `src/lib/grade/extraction.ts` -> `extractSubmissions`,
the nested-archive loop at `:163-178` (the brief's `:90-92` is stale).

**The hole (confirmed):** when a nested zip cannot be opened - `readMemberBounded`
throws a non-cap error (corrupt member) or `JSZip.loadAsync(nestedBuffer)` throws
(unreadable archive) - the `catch` at `:174-177` rethrows only `ZipCapError` and
otherwise `continue`s with NO record. The leaf path already surfaces its failures
(`:138-143` -> `failedSupportedFiles` at `:151-153`); only the NESTED path drops
silently. A student whose only work is inside an unreadable nested archive
vanishes with no row and no reason. No existing fixture exercises this: the oracle
fixture's one corrupt nested zip (`toodeep.zip`, `extraction.zip-caps.oracle.
test.ts:65`) is SKIPPED by the depth cap (`MAX_NESTED_ZIP_DEPTH = 3`,
`src/lib/grade/types.ts:3`) before it is ever opened, so the swallow has never
been tested.

**Minimal write set:** in the `catch` at `:174-177`, after the
`if (err instanceof ZipCapError) throw err;` line, replace the bare `continue`
comment with two statements:
- `attemptedSupportedFiles += 1;`
- `failedSupportedFiles.push(member.fullName);`

Both variables are already in scope (`:85-86`). Nothing else changes.

**Why these two and not a throw:** the brief forbids converting the swallow into
a throw that aborts the batch - the fix must PARTITION per student like the
oversize skips. `failedSupportedFiles.push` is exactly that: it adds a per-file
failed row without aborting. `attemptedSupportedFiles += 1` makes the engine's
zero-entry policy (`engine.ts:571-578`) report "Found supported files, but could
not extract text" instead of a silent empty result when a zip holds ONLY an
unreadable nested archive.

**Surface, traced end to end (the reachability layer - this IS a layer):**
- BULK path: `src/app/api/grade-submission-zip/route.ts:147-148` ->
  `buildIngestLines(entries, failedSupportedFiles)` -> the `done` line's
  `failedSupportedFiles` (`ndjson-ingest-parser.ts:56-62`) -> client
  `IngestLedger.failedSupportedFiles` -> `buildLedgerView.failedFiles`
  (`ingestLedger.ts:41`), with `hasAny` true (`:51`). The nested-zip path appears
  as a failed-file row. FULLY SURFACED.
- ENGINE whole-run path: `engine.ts:566-587` reads `failedSupportedFiles` ONLY
  in the `studentSubmissions.length === 0` branch. When OTHER students graded,
  the engine DROPS `failedSupportedFiles` and never surfaces it. So on the
  whole-run path the nested-zip failure surfaces only when the whole run yields
  zero students. This is a PRE-EXISTING surface gap (the engine does not thread
  `failedSupportedFiles` into `GradingRun`), NOT created by this fix, and it is
  recorded as a residual (section 7). The fix fully closes the bulk path and
  improves the engine zero-entry case; closing the engine students-greater-than-
  zero case needs a `GradingRun` field, which is a separate owned item.

**Honest limit on "a reason":** `failedSupportedFiles` is a `readonly string[]`
with no per-item reason field; the nested-zip path surfaces under the existing
"Supported files that failed to extract" category (`ingestLedger.ts:18-19`),
named by its archive path, not by a bespoke reason string, and NOT as a
per-student row (we cannot enumerate the students inside an archive we could not
open - naming the archive is the honest surface). Adding a per-item reason would
change the `IngestLedger` wire shape that the never-throw parser, the merge, and
the view all read, and is out of proportion for this hardening. Recorded as a
residual if the owner wants reason granularity.

### Oracle / instrument for item 2

Extend `src/lib/grade/extraction.zip-caps.test.ts` (node, in-process JSZip, no
network). Test-author owns construction; SPEC and sabotage fixed here:

- **Corrupt-nested-zip fixture:** an outer zip with a member named e.g.
  `HW1/zed_9009_9009_corrupt.zip` whose bytes are NOT a valid archive (random
  bytes). It is classified "nested" (depth 0 < `MAX_NESTED_ZIP_DEPTH`), read by
  `readMemberBounded` (succeeds - they are just bytes), then
  `JSZip.loadAsync(corruptBytes)` throws. Include at least one VALID student
  file alongside it so the run is not zero-entry (proving the fix surfaces the
  failure even when other students grade).
- **Assertion:** `extractSubmissions` resolves (no throw) AND the returned
  `failedSupportedFiles` includes `HW1/zed_9009_9009_corrupt.zip`, AND the valid
  student's entry is still present. Directly machine-checkable on the return
  value - no student is silently dropped.
- **The existing frozen oracle must stay GREEN** (`extraction.zip-caps.oracle.
  test.ts:169-349`, `toEqual(EXPECTED)`): its owner-shape fixture has no corrupt
  IN-DEPTH nested zip, so `failedSupportedFiles` is unchanged by this fix. If
  the builder's edit changes that snapshot, the edit is wrong.

**Sabotage proving the oracle catches the live hole:** revert the two added lines
to the bare `continue`. The corrupt-nested fixture's `failedSupportedFiles` no
longer contains the archive path -> the assertion goes RED, reproducing the
silent drop.

---

## 5. Item 3 (W3): UNCAPPED-PDF-RTF-PARSING

**Owning sites (census - all three are "the OfficeParser path"):**
- `src/lib/office-extract.ts:277-279` (`extractTextFromBuffer`, the OfficeParser
  fallback for pdf/rtf/doc/ppt/xls and any OOXML/ODF whose fast-path returns null).
- `src/app/actions/syllabus-upload.ts:73` (`OfficeParser.parseOffice(buffer, { fileType: "pdf" })`).
- `src/lib/calendar-parser.ts:36` (`extractPdfText`, `OfficeParser.parseOffice(buffer, { fileType: "pdf" })`; reachable from `src/app/api/parse-calendar/route.ts`).

**The hole (confirmed):** pdf and rtf are in `DOCUMENT_EXTENSIONS` and
`OFFICE_FILE_TYPE_HINTS` (`office-extract.ts:62-85`) but NOT in
`OOXML_EXTENSIONS`/`ODF_EXTENSIONS` (`:205-206`), so `openContainer` - the only
thing that runs `assertContainerWithinCaps` - is never called for them (`:249-252`
leaves `zip = null`). They fall straight to `OfficeParser.parseOffice(buffer)`
with no size pre-flight at all. The two direct callers
(syllabus-upload, calendar-parser) bypass office-extract entirely and have no
cap either. A large or hostile pdf/rtf is parsed into an in-memory AST with
nothing bounding the input.

**The parser offers no size hook (confirmed, not recalled):** officeparser
7.0.3 (`node_modules/officeparser/package.json`). `OfficeParserConfig`
(`node_modules/officeparser/dist/officeparser.browser.d.ts:116-120`) has no
`size`/`limit`/`byte`/`max` field - its only knobs are output/OCR/delimiter/
fileType. So the gate MUST be a pre-parse byte check on the buffer, exactly as
the brief anticipated for "the parser offers no size hook."

**Minimal write set - one reused primitive, three callers inherit it:**
- Add to `src/lib/zip-caps.ts` one small exported assertion (this leaf is the
  single place the owner tunes caps, per its own header `:4-6`):
  `export function assertBytesWithinMemberCap(byteLength: number, name: string, limits: ZipLimits = DEFAULT_ZIP_LIMITS): void` - throws a `ZipCapError`
  with `code: "member-bytes"`, `limitName: "ZIP_MAX_MEMBER_DECLARED_BYTES"`,
  `observed: byteLength` when `byteLength > limits.maxMemberDeclaredBytes`.
  Reuses the existing `ZipCapError` + `ZIP_REFUSAL_PREFIX` + the 40 MB constant;
  it is a thin reuse in the caps leaf, not a new leaf. No JSZip needed (takes a
  raw byteLength), so it is client-safe like the rest of zip-caps.
- `office-extract.ts`: call `assertBytesWithinMemberCap(buffer.byteLength, name, budget.limits)` immediately before `:277` (the `const ast = ...` line).
- `syllabus-upload.ts:73` and `calendar-parser.ts:36`: call
  `assertBytesWithinMemberCap(buffer.byteLength, <name>, DEFAULT_ZIP_LIMITS)`
  before each `OfficeParser.parseOffice`. Both gain a one-symbol import from
  `@/lib/zip-caps` (client-safe, no new heavy dependency).

**Cap VALUE and unit (the security checker's trap):** reuse
`ZIP_MAX_MEMBER_DECLARED_BYTES` = 40 MB (`zip-caps.ts:38`). The unit is
DECOMPRESSED / on-disk bytes (`buffer.byteLength`), NOT wire bytes - this is a
MEMORY cap on an already-in-process Buffer, so file-bytes is the correct unit and
the "file bytes vs wire limit" error class does not apply. Justification for 40 MB:
a pdf/rtf/office file is a single decompressed artifact analogous to one zip
member, so the existing per-member decompressed ceiling is the right knob and
reusing it keeps the caps surface at one file. It never regresses a legitimate
input: every upload path that reaches here is already bounded well below 40 MB
(`UPLOAD_WIRE_BUDGET_BYTES` = 3.5 MB wire / ~2.6 MB file, `upload-budget.ts:41`;
Canvas `PREVIEW_MAX_BYTES` = 15 MB, `canvas-modules/office.ts:17`; grading zip
members already pass `readMemberBounded`'s 40 MB member cap). The owner tunes one
constant.

**What CANNOT be measured here, stated not worked around:** the BACKLOG row
(line 223) asks for "measurement" of OfficeParser's memory behaviour before
setting a cap. This environment cannot profile OfficeParser's per-byte memory,
and a hostile-pdf OOM test would crash the vitest runner (no component renders,
no profiling harness, network blocked - `this-repo.md` section 6). So the cap is
set by REUSE + the proportionality argument above, not by a memory measurement,
and the "how much memory does a 40 MB pdf cost OfficeParser" question is an
owner-only verification residual (section 7). What we CAN build and test is the
byte-budget GATE (a declared-oversize buffer refused before the parse), which is
the actual hardening.

### Oracle / instrument for item 3

Extend `src/lib/office-extract.zip-caps.test.ts` and add sibling cases for
syllabus-upload / calendar-parser (node, no network - but note both actions are
`requireUser`/auth-gated; the test must drive the pure extract function or mock
the auth/transport layer the way the existing syllabus-upload tests do, never
reach past the seam).

- **Declared-oversize pdf/rtf fixture refused pre-parse:** hand
  `extractTextFromBuffer("big.pdf", buffer)` (and `extractPdfText(buffer)`) a
  Buffer whose `byteLength` exceeds `ZIP_MAX_MEMBER_DECLARED_BYTES` (a cheap
  `Buffer.alloc(ZIP_MAX_MEMBER_DECLARED_BYTES + 1)` - allocation is fine in a
  node test and the assertion fires BEFORE any parse, so OfficeParser is never
  invoked on it). Assert `rejects` with `ZipCapError` / `ZIP_REFUSAL_PREFIX`.
  Because the refusal is BEFORE the parse, the fixture need not be a real pdf -
  which is the point: the gate must stop a hostile buffer without parsing it.
- **Under-cap input still parses:** a small real/synthetic pdf (or the existing
  pdf fixture used by the extraction oracle) still returns text - proves the gate
  did not regress legitimate files.
- **Census instrument (regression guard):** a source-text structure assertion
  that every `OfficeParser.parseOffice(` call site in `src/` is preceded within
  its function by an `assertBytesWithinMemberCap` call - OR, more robustly,
  enumerate the three known sites and assert each file imports and uses
  `assertBytesWithinMemberCap`. This pins the census so a FOURTH OfficeParser site
  added later without the cap reddens the gate. (Test-author chooses the exact
  form; the fact pinned is "no unguarded OfficeParser.parseOffice in src/".)

**Sabotage proving the oracle catches the live hole:** remove the
`assertBytesWithinMemberCap` call at one site. The oversize fixture is then parsed
(or, if OfficeParser rejects the junk bytes with its own error, assert the error
is NOT a `ZipCapError`/not `ZIP_REFUSAL_PREFIX`) -> the `rejects.toBeInstanceOf(ZipCapError)`
assertion goes RED. For the census instrument, deleting one site's cap reddens it
directly.

---

## 6. Wave cut, dependency order, and disjointness

Three waves, each independently pushable. Dependency order W1, W2, W3; W1 is
fully disjoint from both others and may run concurrently with either.

| Wave | Item | Edited production files | New/edited test files |
|---|---|---|---|
| W1 | Item 1 (materials-extract + W0b office-edit) | `src/app/actions/materials-extract.ts`, `src/lib/office-edit.ts` | `src/lib/office-edit.zip-caps.test.ts` (extend), a new materials-extract zip-caps test, a source-text census structure test |
| W2 | Item 2 (nested-zip skip row) | `src/lib/grade/extraction.ts` | `src/lib/grade/extraction.zip-caps.test.ts` (extend) |
| W3 | Item 3 (pdf/rtf pre-flight) | `src/lib/zip-caps.ts`, `src/lib/office-extract.ts`, `src/app/actions/syllabus-upload.ts`, `src/lib/calendar-parser.ts` | `src/lib/office-extract.zip-caps.test.ts` (extend), syllabus-upload + calendar-parser cases, an OfficeParser census structure test |

**Every new export ships with its caller in the same wave.** W3's new
`assertBytesWithinMemberCap` has its three callers (office-extract, syllabus-upload,
calendar-parser) in W3. W1 and W2 add no new production exports (they re-route
existing calls). The W1 `readBase64Member` helper is private and called within
office-edit.ts in W1.

**Production write-set intersection (computed, not eyeballed):**
```
W1: {materials-extract.ts, office-edit.ts}
W2: {grade/extraction.ts}
W3: {zip-caps.ts, office-extract.ts, syllabus-upload.ts, calendar-parser.ts}
pairwise intersections (sort | uniq -d): W1^W2 = {}, W1^W3 = {}, W2^W3 = {}
```
Empty on all three pairs - no production file is edited by two waves.

**The shared-read seam (the thing a file list does not show):** `zip-caps.ts`
is EDITED only by W3; W1 and W2 IMPORT it read-only. `grade/extraction.ts` (W2)
imports `office-extract.ts` (W3) read-only. The test
`extraction.zip-caps.oracle.test.ts` reads BOTH `extraction.ts` (W2) and
`zip-caps.ts` (W3) as source, so it is in both waves' owns sets. W2 and W3 are
therefore NOT informationally independent and must NOT be sabotage-verified on
the tree simultaneously (one `tsc` caller, one sandbox at a time - `this-repo.md`
section 2). Run W2 and W3 sequentially. They are nonetheless safe to land in
either order because neither changes the other's observable output: W3's 40 MB
byte cap leaves the oracle's 2 KB pdf fixtures untouched, and W2's
`failedSupportedFiles` push does not fire on the oracle's owner-shape fixture
(no corrupt in-depth nested zip). W1 shares no edited file and no behaviour with
either and may run alongside one of them within the 2-3 item wave cap.

**Not trivially revertible:** nothing here changes a migration, a persisted-key
shape, or a wire protocol. W2 adds no field to any wire shape (it reuses the
existing `failedSupportedFiles` list). W3 adds one export to a shared leaf. All
three are small single-purpose diffs, each revertible on its own.

**Files pushed past 1000 lines: none.** Measured below; the largest edited file
is `extraction.ts` at 873, and item 2 adds two lines. The file-size ceiling
(`src/file-size-ceiling.structure.test.ts`, LIMIT 1000, walks all of `src/`)
must still be in every wave gate and verify, unconditionally.

---

## 7. owns file list

Command run from the repo root (Bash tool), pasted output. These are the test
and source files that READ an edited file by basename or exported symbol - a
test that greps a string it does not own is how a correct change goes red.

```
$ for b in materials-extract office-edit grade/extraction office-extract \
      syllabus-upload calendar-parser zip-caps; do
    echo "--- $b ---"; grep -rln "$b" src --include=*.test.ts | sort; done
--- office-edit ---
src/app/actions/media.budget.test.ts
src/app/actions/media.intro-script-diag.test.ts
src/app/actions/media.script-length.test.ts
src/lib/canvas-modules/office.canvas-fetch.test.ts
src/lib/decks/office-template-fill.test.ts
src/lib/office-edit.test.ts
src/lib/office-edit.zip-caps.test.ts
--- grade/extraction ---
src/app/actions/action-guard-coverage-github-cohort.test.ts
src/app/actions/grading-chat-intake.test.ts
src/app/actions/grading-incremental.test.ts
src/app/actions/grading.guard.test.ts
src/app/api/grade-run-item/route.test.ts
src/app/api/grade-submission-zip/route.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
src/lib/grade/extraction.zip-caps.wiring.test.ts
src/lib/grade/grouping-zip-parents.wiring.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
src/lib/office-edit.test.ts
--- office-extract ---
src/app/actions/llm-content.upload-budget.test.ts
src/lib/canvas-modules/file-preview.canvas-fetch.test.ts
src/lib/grade/extraction.zip-caps.wiring.test.ts
src/lib/grade/single-file-entry.test.ts
src/lib/llm-files.test.ts
src/lib/office-extract.zip-caps.test.ts
--- syllabus-upload ---
src/app/actions/action-guard-coverage-github-cohort.test.ts
src/app/actions/syllabus-upload.grading-bind.test.ts
src/app/actions/syllabus-upload.preserves-columns.test.ts
src/app/actions/syllabus-upload.rubric-reuse.test.ts
src/app/actions/syllabus-upload.test.ts
src/app/actions/syllabusUploadTransport.wiring.test.ts
src/app/actions/wholesale-auth-mock-population.structure.test.ts
src/app/api/cron/sweep-orphan-uploads/route.test.ts
src/app/api/grade-submission-zip/route.test.ts
src/app/components/tasks/taskCellAttachments.wiring.test.ts
src/app/components/tasks/taskInstructionEdit.test.ts
src/lib/course-tasks.test.ts
src/lib/grade/grading-zip-transport.test.ts
src/lib/orphan-upload-sweep.test.ts
src/lib/supabase/course-task-attachments.test.ts
src/lib/supabase/storage.test.ts
src/lib/supabase/task-institution-instructions.test.ts
src/lib/syllabus-upload-source.test.ts
src/lib/task-institution-instructions.test.ts
src/lib/task-instruction-accessible-name.test.ts
src/lib/workflows/registry/steps.course-schedule-from-source.source-syllabus-document.test.ts
--- zip-caps ---
src/app/actions/grading-incremental.zip-caps.test.ts
src/lib/grade/extraction.zip-caps.oracle.test.ts
src/lib/grade/extraction.zip-caps.test.ts
src/lib/grade/extraction.zip-caps.wiring.test.ts
src/lib/office-edit.zip-caps.test.ts
src/lib/office-extract.zip-caps.test.ts
src/lib/zip-caps.office.test.ts
src/lib/zip-caps.test.ts
```
(`materials-extract` and `calendar-parser` match no `*.test.ts` by filename;
materials-extract's tests reference the symbol `extractZipMaterialsTextAction`
- `src/app/actions/live-class.test.ts`, `src/lib/workflows/export-module-materials.test.ts`,
`src/lib/workflows/registry-helpers.sources.test.ts` - and calendar-parser's
callers are source, not tests. Each wave's gate must `npm run test:paths` its
own edited file's owners from this list, never a bare multi-path `vitest`.)

**Gate note (pre-push runs no vitest):** W1 adds new test files and a structure
test; W3 adds an export and a structure test. The frozen-roots / exact-set
canaries are NOT caught at push. No zip-caps export-enumeration structure test
exists (`grep -rln "zip-caps" src --include=*.structure.test.ts` -> empty), so
adding `assertBytesWithinMemberCap` trips no frozen-export canary. Each wave gate
must still run, by exact path via `npm run test:paths`: its own new/edited tests,
the owners above, `src/file-size-ceiling.structure.test.ts`,
`src/source-bytes.structure.test.ts`, and `src/lib/no-emojis.test.ts` (the new
test files and the scope live under `src/` and `docs/`, both of which no-emojis
scans).

---

## 8. Residual register

Each entry names an owner, an instrument, and the step that measures it. An
entry missing any of the three is a deletion - none below is. Each must be
appended to `docs/BACKLOG.md` at disposal or it does not exist.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-DCH-1 | ENGINE whole-run path (`engine.ts:566-587`) still drops `failedSupportedFiles` when `studentSubmissions.length > 0`, so a nested-zip failure in a non-empty whole-run grade surfaces nowhere. Pre-existing; item 2 closes only the bulk path + the engine zero-entry case. | engine / `gradeSubmissions` | a test asserting a `GradingRun` carries a failed-files surface when students>0 | thread `failedSupportedFiles` onto `GradingRun` and render it; file as a BACKLOG row |
| RES-DCH-2 | `failedSupportedFiles` carries no per-item reason; a nested-zip failure surfaces under the generic "failed to extract" category named by archive path, not a stated reason, and not a per-student row. | ingest ledger / `IngestLedger` | a wire-shape test if a reason field is added | owner decides whether reason granularity is worth changing the `IngestLedger` wire shape; file as a BACKLOG row |
| RES-DCH-3 | materials-extract bounds members PROCESSED (20-slice) and per-member bytes, but not central-directory ENTRY COUNT; a pathological central directory is a `loadAsync`-time concern. Accepted as out of scope (owner-gated path). | materials-extract | none buildable here | state the acceptance in the BACKLOG note; revisit only if the entry-count class is scoped repo-wide |
| RES-DCH-4 | The 40 MB OfficeParser cap VALUE is set by reuse + proportionality, not by a memory measurement of OfficeParser (the BACKLOG row asked for measurement; this env cannot profile it, and an OOM test would crash the runner). | owner | an owner-run memory profile of OfficeParser on a near-cap pdf | owner verification only; the GATE itself (oversize buffer refused pre-parse) is built and tested in W3 |

**Backlog reconciliation at the push (disposition of the four source rows):**
- `MATERIALS-EXTRACT-DECOMPRESS-HOLE` (BACKLOG:218) -> CLOSED by W1 (name the W1
  discharging commit in the push message). It also asked for "a census of other
  loadAsync sites" - that census is this scope's items 1B/3 plus RES-DCH-3; the
  office-edit sites are W1, the OfficeParser sites are W3.
- `NESTED-ZIP-SILENT-SKIP` (BACKLOG:219) -> CLOSED by W2 for the bulk path; its
  stated BW2 blocker is noted as already cleared; RES-DCH-1 and RES-DCH-2 carry
  the remaining engine-path and reason-granularity debts.
- `UNCAPPED-PDF-RTF-PARSING` (BACKLOG:223) -> CLOSED by W3 as a byte-budget gate;
  RES-DCH-4 carries the owner-only measurement it also asked for.
- W0b residual (inside PRESENTATIONS-TEMPLATE, BACKLOG:285) -> CLOSED by W1-1B.
  Strike the W0b clause from that row when W1 lands; the rest of the
  PRESENTATIONS-TEMPLATE row is untouched by this scope.

---

## 9. Measurements (every quantity names its command)

| Quantity | Value | Command |
|---|---|---|
| office-edit.ts lines | 775 | `@(Get-Content src/lib/office-edit.ts).Count` (PowerShell) |
| materials-extract.ts lines | 67 | `@(Get-Content src/app/actions/materials-extract.ts).Count` |
| office-extract.ts lines | 288 | `@(Get-Content src/lib/office-extract.ts).Count` |
| grade/extraction.ts lines | 873 | `@(Get-Content src/lib/grade/extraction.ts).Count` |
| zip-caps.ts lines | 562 | `@(Get-Content src/lib/zip-caps.ts).Count` |
| syllabus-upload.ts lines | 264 | `@(Get-Content src/app/actions/syllabus-upload.ts).Count` |
| calendar-parser.ts lines | 254 | `@(Get-Content src/lib/calendar-parser.ts).Count` |
| raw `.async(` sites in office-edit.ts | 14 (lines 488,536,547,596,603,614,625,635,652,663,684,702,724,731) | `grep -n '\.async(' src/lib/office-edit.ts` |
| `MAX_NESTED_ZIP_DEPTH` | 3 | `grep -n "MAX_NESTED_ZIP_DEPTH" src/lib/grade/types.ts` |
| `ZIP_MAX_MEMBER_DECLARED_BYTES` | 40*1024*1024 | read `src/lib/zip-caps.ts:38` |
| `ZIP_RATIO_FLOOR_BYTES` | 1024*1024 | read `src/lib/zip-caps.ts:40` |
| OfficeParser.parseOffice sites in src/ | 3 (office-extract.ts:277-279 counts as one pair, syllabus-upload.ts:73, calendar-parser.ts:36) | `grep -rn "OfficeParser.parseOffice" src --include=*.ts \| grep -v .test.ts` |
| officeparser version | 7.0.3 | `node -e "console.log(require('./node_modules/officeparser/package.json').version)"` |
| OfficeParserConfig size field | none | `sed -n '116,120p' node_modules/officeparser/dist/officeparser.browser.d.ts` (fields: outputErrorToConsole, onWarning, newlineDelimiter, ignoreNotes, putNotesAtLast, extractAttachments, includeRawContent, ocr, ocrLanguage, ocrConfig, serializeRawContent, preserveXmlWhitespace, pdfWorkerSrc, includeBreakNodes, ignoreInternalLinks, fileType, csvDelimiter) |
| zip-caps export-enumeration structure test | none | `grep -rln "zip-caps" src --include=*.structure.test.ts` (empty) |

Line counts use `@(Get-Content).Count` per `this-repo.md` section 3; the two
line tools disagree by up to 138 on this repo, so these are the mandated
instrument's numbers, re-measure before relying on them if the tree moves.

---

## 10. What cannot be verified in this environment (stated, not worked around)

- **No component renders under vitest**, but none of these fixes touches markup -
  every oracle here is a pure-function / action-return / source-text assertion,
  all buildable and all listed. No fix depends on a render.
- **OfficeParser memory behaviour is unprofilable here** (RES-DCH-4): the cap is
  a byte GATE, testable; the per-byte memory cost is owner-only.
- **The network is blocked**; no fixture reaches a real archive or a live
  OfficeParser download. All JSZip work is in-process. syllabus-upload /
  calendar-parser tests must drive the pure extract seam or mock the transport
  the way the existing `syllabus-upload.*.test.ts` do, never reach the network.
- **No live Canvas**: item 1B's Canvas reachability (`canvas-modules/office.ts`)
  is a reading claim traced through the code, not an executed path.
