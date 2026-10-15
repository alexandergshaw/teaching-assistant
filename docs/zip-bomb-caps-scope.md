# BW0 - zip-bomb caps: scope + wave plan (standalone hardening)

Status: SCOPE ONLY, written 2026-10-08 against HEAD `b0d3a1ce`. No production
code and no test code was written. Every quantity names the command that
produced it; every `file:line` was opened. Where the brief and the tree
disagree, the tree is reported and the disagreement named (section 0).

This item closes a resource-exhaustion hole that is reachable TODAY and is
independent of the bulk-zip transport (`docs/bulk-zip-grading-scope.md`). It
makes that item's RES-BZ-3 / I6 true on the code that exists now, instead of
waiting for BW2 of that item.

---

## 0. READ FIRST - what the tree and the measurements say that the brief did not

1. **The collision with INFER-AND-FLAG is gone.** The brief says INFER-FLAG W1 is
   editing `types.ts`, `single-file-entry.ts`, `grading-chat-intake.ts` right
   now. At HEAD both INFER-FLAG waves are committed (`git log --oneline`:
   `71e99a4a` W1, `3b22ebc6` W2, `b0d3a1ce` closes the row). `git status --short` at
   write time shows only untracked `docs/*.md`, plus another item's chat-panel
   edits (`GradingChatPanel.tsx`, `useContinuousGradingRun.ts`,
   `chatSeamDiagnostic.ts`) that this item does not touch. BW0 writes NEITHER
   `types.ts` NOR `grading-chat-intake.ts` in any wave (section 5), so the
   collision cannot recur. The serialization that DOES still bind is against
   QUEUED, unbuilt work on `extraction.ts` / `office-extract.ts` (section 5.2).

2. **The read path, not the archive, is the amplifier - and it makes the
   proposed cap values meaningless unless the read path changes in the same
   wave.** Measured on the real function (section 1, M3): `extractSubmissions`
   on a 102,038-byte zip holding one 100 MiB entry took 8.5 s and raised the
   process's peak RSS by 2,981.8 MiB (29.8x the declared size). Per-call
   isolation (M4): `file.async("base64")` alone costs 25.8x declared and
   8.2 s per 100 MiB; `async("string")` costs 2.6x; `async("nodebuffer")` 2.2x.
   jszip's pure-JS base64 encoder is the dominant term. A single bounded read
   into a Buffer followed by `Buffer.toString("base64")` / `toString("utf-8")`
   costs 3.5x-4.1x declared and 0.47 s per 100 MiB (M5), and its output is
   byte-identical on the six encodings tested (M7). So a 100 MiB cumulative cap
   is safe only AFTER that fold (about 350-380 MiB peak delta) and would still
   be a roughly 2.7-3.0 GiB spike before it. **W1 therefore includes the fold;
   the constants must not ship without it.**

3. **The brief's "~4x amplification / ~807 MiB RSS" does not reproduce with the
   instrument that matters.** An event-loop sampler (5 ms `setInterval` on
   `process.memoryUsage().rss`) reproduces 816 MiB / 992 MiB on the 200 MiB
   fixture (M2), matching the security pass; `process.resourceUsage().maxRSS`
   in a fresh process reads 4,490.8 MiB peak on the same fixture (M3). The
   sampler cannot see a synchronous allocation spike. I do not know which
   instrument the security pass used; I only know mine reproduces its number.
   This is the repo's own "instruments disagree" trap (`traps-spec.md:11-16`)
   applied to memory. W1's verifier must re-measure with `maxRSS` in a child
   process, never with a sampler.

4. **Brief item 3 ("nodeStream + .destroy()") does not stop the producer.**
   Measured (M8): `nodeStream` then `destroy()` leaves jszip's worker running to
   the end of the current 16 KiB compressed block and emits 1,027
   `stream.push() after EOF` error events on the stream; `nodeStream` then
   `_helper.pause()` is undone by the Readable's own `_read` and all 200 MiB
   flowed. `entry.internalStream("nodebuffer")` with `.pause()` stops cleanly
   after the same bounded burst. The spec (D4) uses `internalStream` + `pause()`.
   Cost of the deviation: `internalStream` is not in jszip's `index.d.ts`
   (`grep -n internalStream node_modules/jszip/index.d.ts` returns nothing) so
   it needs a local cast, as `submission-archive-sniff.ts:420-427` already does
   for `_data`; D4 makes it fail closed and I2 is its upgrade canary.

5. **The reusable primitive is fail-OPEN.** `submission-archive-sniff.ts:442`
   reads `entry._data?.uncompressedSize ?? 0`: an entry with no readable size
   counts as 0 bytes. Reusing the primitive's SHAPE (brief) must not reuse that
   line; D2 makes an unreadable size a refusal.

6. **A cap error whose message does not start with `Refused: ` is routed to the
   wrong place.** `grading-incremental.ts:60` defines
   `REFUSAL_MESSAGE_PREFIX = "Refused: "` and `:196-198` sends a caught message
   with that prefix to `mode: "refused"` (a dead end that starts nothing) and
   every other message to `mode: "whole-run"`, whose consumer re-runs the whole
   extraction in `gradeAction`. A cap refusal without the prefix would make the
   bomb get extracted twice. D6 requires the prefix.

7. **HEAD's `submissions` key order is completion order, not archive order.**
   Measured (M12): for entries `a_report.docx b.txt c.png d.zip e.txt f.docx`
   HEAD yields `["c.png","b.txt","e.txt","a_report.docx","d.zip/n1.txt",
   "d.zip/n2.txt","f.docx"]`. `groupSubmissionsByStudent` merges a student's
   files in that insertion order (`utils.ts:452` loop; `files` pushed in order).
   Any restructure (bounded concurrency, one read per member) changes it. D7
   makes the order deterministic (archive order) and says so; it is a
   behaviour change the owner can see in the Files column order.

8. **Only ONE reachable caller is not owner-gated.** `gradeAction`
   (`grading.ts:714`, `requireAppOwner` at `:742`), `prepareGradingRunAction`
   (`grading-incremental.ts:80`), the chat intake (`grading-chat-intake.ts:132,
   303`) are all owner-only. `testGeminiAction` (`llm-content.ts:654-703`) has no
   guard call and is pinned in `PINNED_UNGUARDED`
   (`action-guard-coverage.test.ts:235,262`), whose comment (`:228-233`) states
   these are "reachable by any signed-in account ... NOT anonymously reachable".
   That is the account-level exposure; the owner-gated paths are exposed to a
   hostile student file inside the instructor's own export.

---

## 1. Measurement log (re-runnable; scripts reproduced in Appendix A)

Environment for every row: node v22.14.0, win32 (`node -v`), jszip 3.10.1
(`node_modules/jszip/package.json`), officeparser 7.0.3. **Not measured:** Linux
or the Vercel runtime, any pdf/OCR path, concurrency effects, a docx bomb through
the real `extractTextFromBuffer`, the owner's real 13 MB zip.

| ID | Quantity | Command | Result |
|---|---|---|---|
| M1 | Bomb fixture: one 200 MiB zero entry, DEFLATE 9 | `node bomb.js` | zip 203,954 B; declared 209,715,200; compressed 203,842; ratio 1028 (matches the security pass's ~204 KB / ~1028) |
| M2 | Current text path, event-loop sampler | `node --expose-gc bomb4.js` (async "string" then async "base64"), two runs | string 861 / 930 ms; base64 22,650 / 23,091 ms; sampled peak RSS 816.4 / 991.6 MiB (reproduces the brief's ~23 s and ~807 MiB) |
| M3 | Same path, true peak: `process.resourceUsage().maxRSS` in a fresh process | `node --expose-gc run.js old <MiB>` after `cmp.js x <MiB>` builds `bomb-<MiB>.zip` | 200 MiB: 25,495 ms, peak 4,490.8 MiB, delta 4,439.4 MiB (22.2x). 100 MiB, two runs: peak 3,054.9 / 2,731.7 MiB, delta 3,003.1 / 2,680.4 (30.0x / 26.8x). 40 MiB: peak 1,179.5, delta 1,128.2 (28.2x). **Real function:** a vitest probe calling `extractSubmissions` on a 102,038 B / 100 MiB zip: 8,546 ms, maxRSS 232.1 -> 3,213.9 MiB, delta 2,981.8 (29.8x); the 232.1 already includes the in-process fixture build, so this delta is a lower bound |
| M4 | Per-call cost, 100 MiB entry | `node --expose-gc run2.js <string\|nodebuffer\|base64> 100` | string 489 ms, delta 259.1 MiB (2.59x); nodebuffer 367 ms, 222.9 MiB (2.23x); **base64 8,200 ms, 2,579.8 MiB (25.8x)** |
| M5 | Folded path: one bounded read into `Buffer.allocUnsafeSlow(declared)` via `internalStream`, then native `toString` for text and base64 | `node --expose-gc run.js new <MiB>` | 100 MiB, two runs: 466 / 463 ms, delta 347.6 / 376.8 MiB (3.48x / 3.77x); 40 MiB: 223 ms, 165.6 MiB (4.14x); 200 MiB: 865 ms, 691.9 MiB (3.46x). Output lengths equal the old path's (text 104,857,600; base64 139,810,136) |
| M6 | Native conversions of a 200 MiB Buffer | `node -e` (Buffer.alloc, toString) | base64 64 ms; utf-8 96 ms (against 22,650 ms for jszip's base64) |
| M7 | Old vs folded encoding equivalence | `node utf.js` | six cases (BOM, invalid bytes, 4-byte emoji + CJK, truncated 4-byte, CRLF, NUL): `async("string") === buf.toString("utf-8")` and `async("base64") === buf.toString("base64")` all true |
| M8 | Stopping a stream | `node --expose-gc bomb2.js destroy\|pause\|destroy+pause`, `bomb3.js internal-pause\|destroy-wait` | **internalStream + pause:** 1,028 chunks x 16,384 B = 16,842,752 B delivered, nothing after, 3 s wait, RSS delta 20.7 MiB. **nodeStream + destroy:** 16,384 B seen at destroy, 1,027 `stream.push() after EOF` errors, 1,028 chunks total. **nodeStream + _helper.pause():** 209,715,200 B delivered (pause undone). Block size source: `node_modules/jszip/lib/stream/DataWorker.js:8` `DEFAULT_BLOCK_SIZE = 16 * 1024`. Deflate cannot expand past ~1032:1, so worst-case overshoot per refusal = 16 KiB x 1032 = 16,908,288 B |
| M9 | Lying header, today's path | `node bomb.js` section A (declared patched to 1000, real 200 MiB) | `entry.async("nodebuffer")` ran the full decompression (570-590 ms, sampled peak ~460 MiB) and THEN threw `Bug : uncompressed data size mismatch` (`compressedObject.js:37-38`). Only the central directory needs patching: `zipEntry.js:70` (`reader.skip(22)`) skips the local sizes |
| M10 | Cost of listing a hostile entry table | `node many.js 50000` | 50,000 entries / 4.6 MiB zip: `JSZip.loadAsync` 349 ms. So an entry-count cap enforced after `loadAsync` costs <0.4 s at the current body cap and needs no end-of-central-directory pre-parse today |
| M11 | officeparser's fallback unzip (fflate) vs a lying header | `node fflate2.js` (word/document.xml, central size patched to 1000) | output length 1000, RSS delta 0.0 MiB. Honest header: output 209,715,200 B, delta 200.9 MiB. So fflate allocates by the DECLARED size: a declared-size refusal in front of it is sufficient for small lies, and a declared-large lie is what the same refusal rejects. fflate with a declared-large lie was NOT run |
| M12 | HEAD key order | vitest probe `order.probe.test.ts` over a 6-entry mixed zip | see section 0 item 7 |
| M13 | File sizes | `@(Get-Content <f>).Count` | `extraction.ts` 623; `office-extract.ts` 224; `types.ts` 498; `llm-content.ts` 921; `grading.ts` 977; `extraction.test.ts` 507 |
| M14 | Write-set vs queued sets | `cat bw0.txt queued.txt \| sort \| uniq -d` (canary: a known overlap printed) | `src/lib/grade/extraction.ts`, `src/lib/office-extract.ts` (section 5.2) |

---

## 2. What exists (read from the tree, not a design doc)

**The extraction code.** `collectFromZip` is `extraction.ts:70-130`. Nothing
bounds it except depth: `extraction.ts:85` (`depth < MAX_NESTED_ZIP_DEPTH`,
`types.ts:3` = 3). `Promise.all` over every entry at once: `:76`. Nested archive
read: `file.async("arraybuffer")` `:87`, then `JSZip.loadAsync` `:88`, then the
swallow: `catch { }` `:90-92`. Text path: `file.async("string")` (`:37`) or
`file.async("nodebuffer")` (`:41`), then `file.async("base64")` AGAIN (`:120`);
image: `file.async("base64")` `:109`. Per-file failure is swallowed into
`failedSupportedFiles` at `:125-127`. Outer archive: `JSZip.loadAsync` `:132`.

**The Office extractors.** `extractDocxText` / `extractPptxText` /
`extractXlsxText` (`office-extract.ts:106-171`) each `JSZip.loadAsync` the buffer
(`:107,125,153`) then `.async("string")` (`:114,137,160`) with no cap.
`extractTextFromBuffer` (`:179-224`) decodes TEXT_EXTENSIONS with
`buffer.toString("utf-8")` (`:186`), and for any DOCUMENT extension falls
through to `OfficeParser.parseOffice` (`:212-215`), whose unzip is
`fflate.unzip` with a name filter (`node_modules/officeparser/dist/utils/
zipUtils.js:61`). Eight OTHER files import `extractTextFromBuffer`
(`grep -rlE "import[^;]*extractTextFromBuffer|extractTextFromBuffer[^;]*from \"" src
--include=*.ts --include=*.tsx`, tests excluded): `ai-chat/route.ts`,
`course-planning-lecture.ts`, `deck-source.ts`, `materials-extract.ts`,
`canvas-modules/file-preview.ts`, `grade/single-file-entry.ts`,
`knowledge-scope-context.ts`, `llm-files.ts`; `extraction.ts` is the ninth
importer and the one that wires the shared budget. W2's change therefore
protects all of them; I did not audit each one's guard.

**The primitive.** `submission-zip-intake.ts:20` `MAX_ARCHIVE_ENTRIES = 500`,
`:27` `MAX_ARCHIVE_UNCOMPRESSED_BYTES = 250 MiB`, `checkArchiveCaps` `:48-57`
(declared sizes only, `reduce` over `uncompressedSize`). Declared size source:
`submission-archive-sniff.ts:420-427` types `_data?: { uncompressedSize? }` and
`:442` reads it with `?? 0`. jszip's real record is `CompressedObject`
(`compressedObject.js:17-21`: `compressedSize`, `uncompressedSize`, `crc32`,
`compression`, `compressedContent`), assigned at `zipEntry.js:96`.

**Callers of the unbounded path** (all opened):

| Caller | Line | Guard | Catch that surfaces the message |
|---|---|---|---|
| `gradeAction` (embedded provider) -> `extractStudentEntries` | `grading.ts:860` | `requireAppOwner` `:742` | `:957-960` returns `{ run: null, error: message }` |
| `gradeAction` hoisted collision pre-check -> `extractSubmissions` | `grading.ts:931` | same | same |
| `gradeSubmissions` -> `ingestZipEntries` (called by `gradeAction` at `grading.ts:943`, AFTER the hoisted `:931` extraction - so a bomb is refused at `:931` first and this second parse is never reached) | `engine.ts:574` | same `requireAppOwner` `:742` | same catch `:957-960`. The `provider === "other"` path (`gradeZipViaEngine`, `grading.ts:854`) ships base64 to an external API and does not extract locally |
| `prepareGradingRunAction` -> `extractStudentEntries` | `grading-incremental.ts:133` | `requireAppOwner` `:80` | `:177-199`; `Refused: ` prefix routes to `mode: "refused"` |
| chat intake file path | `grading-chat-intake.ts:203` | `requireAppOwner` `:132` | `:208-211` returns `{ kind: "refused", reason: message }` |
| chat intake Drive path | `grading-chat-intake.ts:273` | `requireAppOwner` `:303` | `:278-281` same shape |
| `testGeminiAction` -> `extractSubmissions` | `llm-content.ts:667` | NONE (pinned unguarded) | `:698-703` returns `{ result: null, error: err.message }` |

**Tests that import extraction or office-extract** (19 files,
`grep -rlE "grade/extraction|\./extraction|office-extract" src --include=*.test.ts`):
action-guard-coverage-github-cohort, grading-chat-intake, grading-incremental,
grading.guard, llm-content.upload-budget, gradingResultsHelpersEditState,
file-preview.canvas-fetch, collisionRefusal.wiring, extraction.inference,
extraction, grouping-zip-parents.wiring, ingestion-attribution.oracle,
reply-axis-scoring.oracle, rubric-stamp.wiring, single-file-entry,
zip-link-resolution, llm-files, runtime-import-graph, office-edit. Those that
read `extraction.ts` AS SOURCE TEXT: `grouping-zip-parents.wiring.test.ts:39`
(regex `const { ... zipParents ... } = await extractSubmissions(`, `:41-49`:
the destructure shape must survive) and `runtime-import-graph.test.ts:640-690`
(frozen trails; its comment at `:665-672` records that an import placed ABOVE the
`../canvas` import in `extraction.ts` reddened it).

### 2.1 Reuse list

| Symbol | `file:line` | What it gives | Use |
|---|---|---|---|
| `formatMB` | `src/lib/upload-budget.ts:46` | MB formatting; the file has no imports (`grep -n "^import" upload-budget.ts` empty) | refusal wording |
| shape of `checkArchiveCaps` | `submission-zip-intake.ts:48-57` | entry count + summed declared bytes, pre-decompression | SHAPE ONLY (parameterized, fail-closed) |
| `_data` cast idiom | `submission-archive-sniff.ts:420-427` | typed-loose read of jszip's record | copy the idiom, not the `?? 0` |
| pooled-Buffer trap note | `extraction.test.ts:222-226` | never pass `buffer.buffer` to JSZip | D4 allocates with `allocUnsafeSlow` and passes the Buffer itself |
| `withoutLineComments` convention | `this-repo.md:179` | a new test must not mention the comment-strip helper literal | wiring test (I11) |
| `mapWithConcurrency` (shape) | `src/app/actions/shared.ts:662-678` | worker-pool semantics | SHAPE ONLY - see 2.2 |

### 2.2 Do-NOT-reuse list

- `MAX_ARCHIVE_ENTRIES` / `MAX_ARCHIVE_UNCOMPRESSED_BYTES` (`submission-zip-
  intake.ts:20,27`): client constants, 250 MiB is far above the server's safe
  size (section 0 item 2), and the module's own header calls it client-only.
- `checkArchiveCaps` itself: top-level only, no ratio, no compressed size, no
  shared budget, and the caller feeds it `?? 0` (section 0 item 5).
- `mapWithConcurrency` from `shared.ts:662`: `shared.ts` is a heavy
  non-leaf (its imports start `import type { SlideData ... } from
  "../actions-types"` and continue into slide/prompt modules); importing it
  from `lib/grade/extraction.ts` inverts the layer and risks the frozen
  trails in `runtime-import-graph.test.ts:671-681`. It already exists FOUR times
  (`shared.ts:662`, `bulkRubricGenerateSummary.ts:181`,
  `lms-export/selection/route.ts:119`, `github-student-repos.ts:55` as
  `runWithConcurrency`). The new leaf carries a fifth, ~15-line copy; the
  consolidation is a separate loop-maintenance row, not this item.
- `nodeStream` + `destroy()` (section 0 item 4).

---

## 3. Design

Everything is a proposal measured at one point (M3-M5). **The values below are
starting defaults from ONE machine, ONE node version and ONE synthetic bomb;
they were not tuned against the owner's real 13 MB / 26-entry zip** (the real
zip's shape: `bulk-zip-grading-scope.md:3-8`, 11 pdf, 10 png, 3 docx, 1 nested
zip, 2 link.html). Every one is a named exported constant in ONE module so the
owner tunes by editing one file.

### D1. One shared budget, enforced inside `extractSubmissions`

`extractSubmissions(zipBuffer, options?: { limits?: Partial<ZipLimits> })`
creates ONE `ZipBudget` and threads it through `collectFromZip` at every
depth - never per-level caps (three nesting levels multiply a per-level cap by
up to 4 archives). The return type is unchanged (the `grouping-zip-parents`
regex at `:41-49` depends on it). `ingestZipEntries`, `extractStudentEntries`,
`gradeSubmissions`, `gradeAction`, `testGeminiAction` all reach it through
`extractSubmissions`, so every caller inherits it with no per-caller change.
`options.limits` exists for tests (tiny limits against small fixtures); no
production caller passes it.

### D2. Pre-decompression refusal from declared sizes (plan pass)

At each archive level, BEFORE any member is read, one SYNCHRONOUS pass walks
`Object.entries(zip.files)` in archive order and charges the budget; the first
violation throws. Deterministic: the offending entry is a function of the
archive bytes alone, not of scheduling.

Charged per entry (in this order):
1. **Entries.** Every entry at every opened level (files, directories, and
   extension-skipped files all count) increments `budget.entries`; over
   `ZIP_MAX_CUMULATIVE_ENTRIES` refuses with code `entry-count`.
2. **Decompressed members only** (nested zip within depth, image, supported
   text/document - the exact classification `extraction.ts:78-100` already
   makes) charge bytes. A skipped `.mp4` is never decompressed, so it costs an
   entry and no bytes. The declared sizes come from `entry._data` via
   `declaredSizesOf`, which **fails closed**: a missing/non-finite size throws
   `unverifiable-size` (never `?? 0`).
   - member declared > `ZIP_MAX_MEMBER_DECLARED_BYTES` -> `member-bytes`
   - cumulative declared > `ZIP_MAX_CUMULATIVE_DECLARED_BYTES` -> `cumulative-bytes`
   - member declared >= `ZIP_RATIO_FLOOR_BYTES` and declared / max(compressed,1)
     > `ZIP_MAX_MEMBER_RATIO` -> `member-ratio`
   - after the charge, cumulative declared >= floor and cumulative declared /
     max(cumulative compressed,1) > `ZIP_MAX_ARCHIVE_RATIO` -> `archive-ratio`
     (catches a bomb spread over many sub-floor members, each too small for the
     per-member ratio rule).
3. A nested archive's own declared bytes are charged at the parent level, and its
   inner members are charged again when it is opened. That double count is
   deliberate: the nested buffer and its inner buffers are alive at once.

The ratio rules are defence in depth and wording quality; the safety comes from
the declared-bytes caps (D2) and the streaming bound (D3). A lying compressed
size cannot defeat either.

| Constant | Start | Why this number (all from one measurement) |
|---|---|---|
| `ZIP_MAX_CUMULATIVE_ENTRIES` | 1,000 | owner shape is ~26 entries; M10 shows a 50,000-entry list parses in 349 ms, so the cap is for the work downstream, not for parsing |
| `ZIP_MAX_CUMULATIVE_DECLARED_BYTES` | 100 MiB | folded path costs 3.5x-3.8x declared (M5): ~350-380 MiB peak delta at the cap, before downstream copies (`mergedContent`, wire payload) which were NOT measured |
| `ZIP_MAX_MEMBER_DECLARED_BYTES` | 40 MiB | 40 MiB member = 165.6 MiB delta (M5) |
| `ZIP_RATIO_FLOOR_BYTES` | 1 MiB | below it a ratio is noise (small text compresses 5-10x) |
| `ZIP_MAX_MEMBER_RATIO` | 100 | the bomb is 1028 (M1); ordinary text is far below; a 5 MiB highly repetitive CSV is the plausible false positive (unmeasured) |
| `ZIP_MAX_ARCHIVE_RATIO` | 100 | same |
| `ZIP_EXTRACTION_CONCURRENCY` | 4 | D5 |
| `ZIP_ERROR_NAME_MAX_CHARS` | 120 | D6 message hygiene |

### D3. Streaming bound against lying headers

The declared size can lie in the SMALL direction (M9: declared 1000, real
200 MiB; jszip detects it only after decompressing everything). Every member
read goes through `readMemberBounded(entry, ctx)`:

- `declared` comes from `declaredSizesOf` (already capped by D2).
- `out = Buffer.allocUnsafeSlow(declared)` - bounded by the cap, non-pooled
  (the pooled-buffer trap, `extraction.test.ts:222-226`), never exposed unless
  fully written.
- `h = entry.internalStream("nodebuffer")`; attach `data`/`end`/`error` handlers;
  then `h.resume()`.
- on `data`: ignore if already settled; if `filled + chunk.length > declared`,
  mark settled, call `h.pause()`, reject with `ZipCapError("stream-overrun")`
  carrying `observedBytes`; else copy into `out`. After a refusal the handler
  keeps being invoked for the rest of the current burst (up to 1,027 more calls,
  M8) and must ignore them without storing anything.
- on `end`: if `filled !== declared`, reject with a plain `Error` (jszip's own
  mismatch class - NOT a cap error, handled as a corrupt member as today).
- fail closed: if `typeof entry.internalStream !== "function"` throw
  `unverifiable-size`; never fall back to `entry.async`.

Worst-case overshoot before the stop: 16 KiB compressed block x 1032 =
16,908,288 B (M8 measured 16,842,752). This replaces EVERY `file.async` /
`.nodeStream` call in `extraction.ts` and every `.async("string")` in
`office-extract.ts`; I11 pins that none remain.

### D3b. The fold (mandatory, see section 0 item 2)

One bounded read per member, then derive: text = `extractTextFromBuffer(name,
buffer)` (which already does `buffer.toString("utf-8")` for TEXT_EXTENSIONS,
`office-extract.ts:186`, and the Office path for documents), `rawData` =
`buffer.toString("base64")`, image placeholder unchanged. Today a supported file
is decompressed TWICE (`:37`/`:41` then `:120`); it becomes once. The equivalence
is measured (M7) but only on six encodings; the frozen oracle (I7) is the guard.

### D4 (nested archives)

Nested archives are processed SEQUENTIALLY in archive order after the level's own
members, never inside the concurrent leaf pool: bounded read -> `JSZip.loadAsync
(buffer)` (pass the Buffer itself, never `.buffer`) -> plan pass for that level
-> recurse. At most one nested buffer per depth is alive (<= 3), and the shared
budget is charged in a deterministic order. Wall time is unchanged: inflate is
single-threaded CPU work and `Promise.all` overlapped nothing.

### D5. Bounded concurrency

Leaf reads (supported + image) run through a local `runBounded(items, K, fn)`
with `K = ZIP_EXTRACTION_CONCURRENCY`, FAIL-FAST: on the first rejection set an
`aborted` flag so no queued item starts, await the in-flight ones, then throw the
first error. With D2's cumulative cap the memory ceiling is already fixed, so K
mainly bounds how many ~40 MiB buffers coexist (<= 4 x 40 MiB) and prevents
hundreds of simultaneous inflates. It is the "recommended" item; keep it small.

### D6. A cap error is NEVER swallowed - decision: RETHROW

**Chosen: rethrow `ZipCapError` and refuse the whole archive.** Not a per-student
note. Reasons: (a) a skip-with-note needs a typed note on `StudentSubmissionEntry`
(`types.ts`) plus UI - the collision this scope was told to avoid, and the UI is
BULK-ZIP BW2's per-student oversized-row design (RES-BZ-4 / I7); (b) the budget is
cumulative, so "skip what does not fit" would grade a different subset depending
on order; (c) every caller already surfaces `err.message` verbatim (section 2
table) - zero new plumbing; (d) a silently ungraded student is the worse failure.
Cost, stated: one oversized or hostile entry blocks the whole archive until the
instructor removes it - visible and named, not silent. Handed to BULK-ZIP BW2
(residual R5).

Catch sites to change (nothing else may swallow it):
- `extraction.ts:90-92` nested catch: `if (err instanceof ZipCapError) throw err;`
  then swallow every other error exactly as today. A corrupt nested archive
  remains silently skipped (pre-existing, R6) - characterised, not changed.
- `extraction.ts:125-127` per-file catch: rethrow `ZipCapError` before pushing to
  `failedSupportedFiles`, else a docx bomb is reported as "could not extract".
- The existing Z1 behaviour (`ingestion-attribution.oracle.test.ts:548-566`,
  `broken.docx` -> `failedSupportedFiles` -> engine "could not extract" message)
  MUST stay byte-identical: a non-cap docx failure still lands in
  `failedSupportedFiles`.

**The error and its wording.** `class ZipCapError extends Error` with
`code` in {`entry-count`, `cumulative-bytes`, `member-bytes`, `member-ratio`,
`archive-ratio`, `stream-overrun`, `unverifiable-size`}, plus `limit`,
`observed`, `observedBytes?`, `entryName`, `chain`. The message:
`Refused: "<offending path>" <reason clause>. Limit: <name> (<value>). Nothing was
graded. Remove or shrink that file, or split the archive into smaller parts, then
upload again.` The path is the `fullName` the code already builds (`:80`),
truncated to `ZIP_ERROR_NAME_MAX_CHARS` with control characters replaced
(student-controlled text; it reaches the instructor's UI only, as a React text
node - a reading claim, no component renders under vitest). It MUST start with
`Refused: ` (section 0 item 6) and uses `formatMB`. Tests pin the prefix, the
entry path and the limit value computed from the constant - not the full
sentence.

### D7. Deterministic order (a behaviour change, flagged)

Leaf results are collected per entry and merged into `submissions` / `rawData` /
`zipParents` in ARCHIVE order after each level's pool settles; nested levels
follow in archive order. This replaces HEAD's completion order (M12). The
oracle (I7) compares key SETS and per-key values order-insensitively; I12 pins
the new order. Visible consequence: a student's files appear in archive order.

### D8. Office files (S5) - `office-extract.ts`

Same primitives, applied inside `extractTextFromBuffer` for the zip-container
extensions `docx pptx xlsx odt odp ods`:
- Load once at the top of the branch; `docx/pptx/xlsx` load failure propagates
  exactly as today (Z1); `odt/odp/ods` (no JSZip load today) tolerate a NON-cap
  open failure and proceed to `OfficeParser` as today, but a cap error
  propagates.
- **Container pre-flight** (not charged to the shared budget): entries <=
  `OFFICE_MAX_ENTRIES` (2,000), every member satisfies the per-member declared +
  ratio rule, total declared <= `OFFICE_MAX_ARCHIVE_DECLARED_BYTES` (100 MiB).
  Applied to ALL members because officeparser's filter (`zipUtils.js:61`) decides
  what it reads and we cannot see it (M11: fflate allocates by declared size, so
  this pre-flight is what bounds the fallback).
- **Read members** (`word/document.xml`, `ppt/slides/slide*.xml`,
  `xl/sharedStrings.xml`) go through `readMemberBounded`, then `buffer.toString
  ("utf-8")`. When the caller passes `options.budget` (extraction.ts does), these
  reads charge bytes to the SHARED archive budget so a 1,000-docx archive cannot
  multiply the cap; when absent (the eight other importing files) a fresh default
  budget is created per call. Office-internal entries are NOT charged to the
  shared entry count (a deck legitimately has hundreds; ten decks would blow a
  1,000 cap).
- `extractTextFromBuffer(name, buffer, options?)`: optional third parameter
  `{ budget?: ZipBudget; limits?: Partial<ZipLimits> }`. The private
  `extractDocxText/PptxText/XlsxText` take the already-loaded `JSZip`.
- Not covered, by decision: pdf, rtf, legacy binary `doc/ppt/xls` (R7).

### D9. What this item does NOT do

No change to `types.ts`, `grading-chat-intake.ts`, `grading-incremental.ts`,
`llm-content.ts`, `shared.ts`, or any guard. No fix for `testGeminiAction`
being unguarded (R3). No change to the client-only `submission-zip-intake.ts`.
No per-student quarantine (R5). No wall-clock budget (R9).

---

## 4. Rulings requested, each with the reading already acted on

The scope proceeds on these defaults; none of them gates the build.

| ID | Question | Default acted on | Cost if the owner answers the other way |
|---|---|---|---|
| Q1 | Rethrow (whole archive refused) or per-student note? | Rethrow (D6) | The note variant is a different item: new field on `StudentSubmissionEntry` + UI, i.e. BULK-ZIP BW2. D6's catch sites become "record" instead of "rethrow"; the plan pass and stream bound are unchanged |
| Q2 | Archive-order determinism (D7) or keep completion order? | Archive order | Reverting D7 means re-introducing scheduling dependence; the I12 pin is dropped |
| Q3 | Is a single oversized unread media member inside a docx/xlsx (>40 MiB declared) an acceptable false refusal (D8)? | Yes - tunable constant | Owner raises `ZIP_MAX_MEMBER_DECLARED_BYTES`; one-line edit |

---

## 5. Wave cut, write set, serialization

### 5.1 Waves

**W1 - archive caps + the fold (the reachable hole).** Closes testGeminiAction's
and every owner-path's exposure to a top-level or nested bomb.

Production: NEW `src/lib/zip-caps.ts` (constants, `ZipLimits`, `ZipBudget`,
`createZipBudget`, `ZipCapError`, `declaredSizesOf`, `chargeArchiveLevel`,
`readMemberBounded`, `runBounded`; est. 230-280 lines); EDIT
`src/lib/grade/extraction.ts` (`collectFromZip`, `extractTextFromFile`, signature
of `extractSubmissions`; 623 -> est. 690-720; import placed BELOW the `../canvas`
import, per the note at `extraction.ts:15-19` and `runtime-import-graph.test.ts:
665-672`). The new module imports only `type JSZip` from `jszip` and `formatMB`
from `../upload-budget`; it imports nothing that reaches `lib/supabase`.
Every export W1 adds is called by `extraction.ts` in the same wave (constants,
`createZipBudget`, `ZipCapError`, `declaredSizesOf`, `chargeArchiveLevel`,
`readMemberBounded`, `runBounded`); the Office-only helpers arrive in W2 together
with `office-extract.ts`, their caller, so no wave ships an export without its
caller.

Tests (all NEW files; no existing test edited):
`src/lib/zip-caps.test.ts` (units: charge accounting, each code, fail-closed,
bounded reader honest/lying/early-stop, wording hygiene, `runBounded` fail-fast);
`src/lib/grade/extraction.zip-caps.test.ts` (I1-I5, I8, I10, I12);
`src/lib/grade/extraction.zip-caps.oracle.test.ts` (I7, frozen);
`src/lib/grade/extraction.zip-caps.wiring.test.ts` (I11);
`src/app/actions/llm-content.zip-caps.test.ts` (I9a);
`src/app/actions/grading-incremental.zip-caps.test.ts` (I9b).

Step 0 INSIDE W1, before any production edit: write the I7 oracle against the
UNCHANGED tree and run it green, pasting the output (guard before migration; a
refactor disarms the test that compared old to new, so the oracle is a frozen
literal captured from HEAD, not a re-derivation). Only then edit production.

**W2 - Office (S5), after W1 lands.** Production: EDIT `src/lib/office-extract.ts`
(224 -> est. 280-300); EDIT `src/lib/zip-caps.ts` (add `OFFICE_*` constants and
`assertContainerWithinCaps`); EDIT `src/lib/grade/extraction.ts` (ONE line:
`extractTextFromFile` passes `{ budget }` - this is the caller of the new
`options.budget` parameter). Tests (NEW): `src/lib/office-extract.zip-caps.test.ts`
(I6), `src/lib/zip-caps.office.test.ts` (container pre-flight units). Blast
radius: `extractTextFromBuffer` has eight other importing files; their tests are in the
gate (section 7).

W2 depends on W1 (shares `zip-caps.ts` and `extraction.ts`), so they are
sequential; each is its own push and revert point.

### 5.2 Serialization (computed by exact path, M14)

`cat bw0.txt queued.txt | sort | uniq -d` with `bw0.txt` = the eleven paths
above and `queued.txt` = the declared write sets of queued items
(BULK-ZIP BW2/BW3 `bulk-zip-grading-scope.md:660-678`; the ZIP-UPLOAD-LAG
remnant `zip-upload-lag-scope.md:333-335`) prints exactly
`src/lib/grade/extraction.ts` and `src/lib/office-extract.ts`. The canary (a
known overlap piped through the same command) printed `extraction.ts`, so the
empty-for-everything-else result is not a dead pipe.

Rule: **BW0 lands BEFORE BULK-ZIP BW2/BW3 and before any ZIP-UPLOAD-LAG FIX-3
remnant is built; none of them may run concurrently with W1 or W2.** That
ordering is also the correct one on substance: BULK-ZIP's BW2 lists "the
zip-bomb caps" in its own write set (`:664`) and its I6 (`:549-551`) asserts the
same refusal. BW0 makes I6 true on today's code; BW2 then owes only the Storage
read, the owner gate, and the 60s soft budget. ZIP-UPLOAD-LAG's FIX-3 was
re-homed into BULK-ZIP (`bulk-zip-grading-scope.md:615`). Items with disjoint file
sets (everything in `git status --short` at write time) may run concurrently
with BW0.

New files do not exist yet (`ls` on each of the eleven paths returned nothing for
the nine new ones).

### 5.3 Reversibility

W1: revert the commit; `extraction.ts` returns to HEAD, `zip-caps.ts` and the six
test files disappear together. Nothing persisted, no migration, no shared-helper
signature change. W2: `extractTextFromBuffer` gains an OPTIONAL third parameter
only; reverting restores HEAD's behaviour for all eight other importing files. Neither wave is
non-trivially revertible.

---

## 6. Instruments

Every vitest case uses real jszip in-memory fixtures; nothing needs the network
(`vitest.setup.ts` blocks it). Lying-header fixtures are made by patching the
central directory of a SMALL zip (offset +24 of the `PK\x01\x02` record is the
uncompressed size, +20 the compressed size) - no 200 MiB fixture is built for the
patched cases (M9). The one case that needs real expansion (I2) uses a 32-64 MiB
zero entry, ~0.3 s. Build zips with `type: "arraybuffer"` (or pass the nodebuffer
itself), never `.buffer` of a pooled Buffer (`extraction.test.ts:222-226`).

Each row: object / instrument / direction of failure.

- **I1 - refused from declared sizes without decompressing.** Object:
  `extractSubmissions` on a zip whose one member's central-directory size is
  patched to 200 MiB (real data 1 KiB). Instrument: `rejects` with
  `ZipCapError` `code === "member-bytes"`, message starting `Refused: ` and
  containing the entry path and `formatMB(ZIP_MAX_MEMBER_DECLARED_BYTES)`; AND a
  `vi.spyOn` on `Object.getPrototypeOf(probeZip.files[x])` for `internalStream`
  and `async` records zero calls on the refused run and >=1 call on a legitimate
  run of the same helper (positive control: proves the spy can see). RED if it
  resolves, if the spy count is >0, or if the message lacks the path or limit.
- **I2 - lying header stops early.** Object: a member with real 32+ MiB of zeros
  and a central-directory size patched to 1,000. Instrument: `rejects` with
  `code === "stream-overrun"`; `err.observedBytes` is `<= 1000 + 16*1024*1032`
  (the bound from M8, literal in the test with a comment citing
  `DataWorker.js:8`) AND `< real size`. RED if it resolves, if `observedBytes`
  reaches the real size (full decompression), or if the error is jszip's plain
  mismatch Error. This case is also the canary for jszip dropping or retyping
  `internalStream`: it goes red loudly rather than the module silently falling
  back (D3 fail-closed).
- **I3 - honest oversize.** Object: member whose declared == real, with
  `options.limits.maxMemberDeclaredBytes` set below it. Instrument: rejects
  `member-bytes`, spy 0 calls. RED if resolved or decompression began.
- **I4 - the budget is SHARED across levels.** Object: a 3-level fixture (outer
  with members, a nested zip, a second nested zip) built from non-compressible
  bytes so the ratio rules cannot fire, in which EACH level's declared total is
  below `limits.cumulativeBytes` and the SUM is above. Instrument: the test
  computes and asserts both facts about its own fixture, then `rejects`
  `code === "cumulative-bytes"` whose `chain` names a nested archive; positive
  control: the same fixture with a large `cumulativeBytes` resolves. RED if the
  over-sum fixture resolves (a per-level cap would pass it).
- **I5 - entries count cumulatively and include extension-skipped.** Object: N
  `.bin` entries (skipped by extension, so no bytes) spread over two levels.
  Instrument: rejects `entry-count` with N chosen so no single level exceeds the
  limit; control with a higher limit resolves. RED if it resolves.
- **I6 - a bomb inside a docx is refused and not swallowed.** Object: (a)
  `extractTextFromBuffer("a.docx", buf)` where `word/document.xml` is honest and
  over a tiny injected member cap; (b) same with a patched-small central
  directory over a real larger member; (c) the same docx as a member of a zip
  through `extractSubmissions`; (d) pptx and xlsx variants. Instrument: `rejects`
  with `ZipCapError`; for (c) `failedSupportedFiles` does NOT contain the docx
  (it rejected). RED if any returns `null`/resolves, or lands in
  `failedSupportedFiles`. Control: the Z1 fixture (`"this is not a real docx"`)
  still resolves into `failedSupportedFiles` unchanged (the non-cap path must not
  start rejecting).
- **I7 - a legitimate archive PASSES, byte-identical (frozen oracle).** Object:
  the owner's shape - ~26 entries, ~13 MB compressed, nested zip at depth 2,
  3 docx built like `single-file-entry.test.ts:14`'s builder, png images (random
  bytes), txt, two `*_link.html`, and `.pdf` entries of garbage bytes (expected to
  land in `failedSupportedFiles` on both sides) - through default limits.
  Instrument: `submissions`, `zipParents`, `attemptedSupportedFiles`,
  `failedSupportedFiles` deep-equal literals captured from HEAD in W1 step 0;
  each `rawData` value compared by frozen sha256 hex (not a 13 MB literal);
  `extractStudentEntries` output (student names, merged-content hash) frozen the
  same way; key SETS compared order-insensitively (D7). Plus an encoding
  sub-fixture: BOM, invalid bytes, emoji/CJK, CRLF, NUL. RED on any difference, or
  on any refusal. Pass condition spans the whole table of fixtures, not one
  column (`traps-spec.md:98-106`).
- **I8 - a cap error is not swallowed; a corrupt nested archive still is.**
  Object: a nested zip two levels down whose member is a bomb (patched header).
  Instrument: outer `extractSubmissions` `rejects` with `ZipCapError` (not a
  resolved result missing that file). Characterization control: a nested
  `.zip` whose bytes are garbage still resolves with the rest of the archive
  (today's `:90-92` behaviour). RED if the bomb run resolves, or if the corrupt
  run now rejects.
- **I9 - all callers inherit.** (a) `testGeminiAction` (no guard, no auth mock
  needed; mock only `callLlm`, pattern `llm-content.upload-budget.test.ts:14-20`)
  with a patched-header zip returns `{ result: null, error }` where `error`
  starts `Refused: `, and `callLlm` was not called. (b) `prepareGradingRunAction`
  (auth + `callLlm` mocks, pattern `grading-incremental.test.ts:1-60`) returns
  `mode: "refused"` with a reason containing the limit, and `callLlm` was not
  called. (c) Checked-safe, no new test: `grading-chat-intake.ts:208-211` passes
  `err.message` through, pinned for a generic Error by
  `grading-chat-intake.test.ts:157-166`. RED if (a) resolves a result or calls the
  model, or (b) returns `mode: "whole-run"` (prefix missing, section 0 item 6).
- **I10 - concurrency is bounded.** Object: extraction of 12 supported members.
  Instrument: wrap `internalStream` on the ZipObject prototype to track the
  maximum number of simultaneously open streams (increment on call, decrement on
  `end`/`error`); assert `1 <= max <= ZIP_EXTRACTION_CONCURRENCY`; after an
  injected cap refusal no further `internalStream` call starts (fail-fast). RED if
  `max > K` (sabotage: K -> Infinity) or if work continues after the refusal.
- **I11 - no unbounded read survives (source-text pin).** Object:
  `extraction.ts` and `office-extract.ts` after comment stripping (name the helper
  `withoutLineComments`; `this-repo.md:179`). Instrument: zero matches of
  `.async(` and `nodeStream(` in either. Pin the fact, not the spelling. RED if a
  raw read is reintroduced.
- **I12 - archive order.** Object: the M12 fixture. Instrument:
  `Object.keys(submissions)` deep-equals the archive-order list (leaf files of a
  level in entry order, nested contents after). RED on any other order. Retire
  with Q2 if the owner reverses D7.

Sabotage design for the test seat (each must turn a named test red): remove the
plan pass (I1, I3, I4, I5), `?? 0` in `declaredSizesOf` (unit), `destroy`-style
no-op in the reader (I2), replace per-budget with per-level budgets (I4),
swallow `ZipCapError` at `:90` (I8), at `:125` (I6c), K -> Infinity (I10),
restore `file.async("base64")` (I11).

---

## 7. Gates

Per wave, in PowerShell, multi-path through the wrapper (never raw
`vitest run a b`; `this-repo.md:51-66`). A multi-path check quotes the wrapper's
per-argument `COVERED`/`NOT COVERED` lines:

```
npm run test:paths src/lib/zip-caps.test.ts src/lib/grade/extraction.zip-caps.test.ts src/lib/grade/extraction.zip-caps.oracle.test.ts src/lib/grade/extraction.zip-caps.wiring.test.ts src/app/actions/llm-content.zip-caps.test.ts src/app/actions/grading-incremental.zip-caps.test.ts
```
then the existing importers (the 19 files in section 2) plus the canaries every
wave carries:
`src/file-size-ceiling.structure.test.ts` (UNCONDITIONAL, `this-repo.md:42-49`),
`src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts`,
`src/tools/strip-comments-agreement.structure.test.ts`,
`src/lib/module-graph/runtime-import-graph.test.ts` (frozen trails),
`src/lib/grade/grouping-zip-parents.wiring.test.ts`,
`src/lib/grade/ingestion-attribution.oracle.test.ts` (Z1),
and the three `src/lib/canvas-client-boundary*.test.ts` files (cheap, they walk
`src/lib`). Plus `npx tsc --noEmit` (one caller only, the wave gate),
`npm run lint` (pass condition: exit 0 and no NEW warning in files this wave
writes, `this-repo.md:26`), `npm run build` compile line only.
`git status --short` against the write set, and require no `.claude/worktrees`
copy edited (`.claude/worktrees/friendly-meninsky-8032bc` exists).

Pass condition for the memory claim (W1 verify, not a vitest): object = peak
RSS of `extractSubmissions` on the M3 real-function fixture (102,038 B / 100 MiB)
and on a 90 MiB-cumulative synthetic that is UNDER the caps; instrument =
`process.resourceUsage().maxRSS` before/after in a fresh process or a vitest
probe (NOT an event-loop sampler, section 0 item 3); direction = RED if the
over-cap fixture is not refused, or if the under-cap fixture's delta exceeds the
Vercel memory figure the owner reads (R1).

---

## 8. Disposition of the seven asks and neighbouring requirements

| Ask / prior requirement | Disposition | Where |
|---|---|---|
| 1 shared budget through every level, inside `extractSubmissions` | KEPT | D1, I4 |
| 2 pre-decompression refusal + named owner-tunable constants | KEPT | D2 table, I1/I3/I5 |
| 3 streaming bound against lying headers | KEPT, mechanism changed (`internalStream` + `pause`, measured) | D3, I2 |
| 4 cap error not swallowed; note or rethrow, pick one | KEPT: rethrow | D6, I8 |
| 5 worded refusal naming limit and entry, surfaced by the chat catch | KEPT, plus `Refused: ` prefix | D6, I9 |
| 6 Office inner caps via shared helper | KEPT, W2 | D8, I6 |
| 7 bound the `Promise.all` | KEPT | D5, I10 |
| added: single bounded read + native base64 | NEW, mandatory | D3b, I7 |
| added: archive-order determinism | NEW, flagged | D7, I12 |
| BULK-ZIP I6 / RES-BZ-3 (`bulk-zip-grading-scope.md:549-551,704-706`) | HANDED OVER TO THIS ITEM as the executing enforcer; BW2 keeps the Storage read, owner gate, 60s soft budget | section 5.2 |
| ZIP-UPLOAD-LAG FIX-3 (`zip-upload-lag-scope.md:333-335`) | already re-homed to BULK-ZIP (`:615`); now satisfied here | - |

---

## 9. Residual register (owner / instrument / step - else it is a deletion)

Each must be filed in `docs/BACKLOG.md` to exist (the orchestrator files; a
backlog row bumps `EXPECTED_ROW_COUNT`, `src/tools/backlog/backlog-file.
structure.test.ts:148`, currently 149).

- **R1 - cap VALUES vs the real platform ceiling.** Not decidable here: no
  network, `vercel.json` sets only crons (`cat vercel.json`), so function memory
  and `maxDuration` are the plan defaults and I did not verify them. Owner: repo
  owner. Instrument: owner-walk reading the Vercel function log's "Max Memory
  Used" for (a) the real zip and (b) a synthetic archive just under the caps.
  Step: after W2 ships, before touching the constants; edit them in
  `zip-caps.ts` only.
- **R2 - the owner's real 13 MB zip passes.** Owner: repo owner. Instrument:
  owner-walk (drop it in the chat; expect grading proceeds, no `Refused:`). Step:
  after W2. A refusal there is a tuning input to R1, not a defect to patch around.
- **R3 - `testGeminiAction` is unguarded (pre-existing, NOT fixed here).** It
  accepts a zip from any signed-in account and calls the paid model. BW0 stops it
  being a memory bomb; it does not stop it spending LLM budget. Owner:
  orchestrator files a SEPARATE row. Instrument: removing it from
  `PINNED_UNGUARDED` (`action-guard-coverage.test.ts:235-262`) while the equality
  at `:450` stays green. Step: its own wave.
- **R4 - same class elsewhere, not in this write set.** `materials-extract.ts:
  45-56` decompresses a member (`member.async("nodebuffer")`) BEFORE comparing its
  size to `maxMemberBytes`, behind `requireOwner()` which is `requireUser()`
  (`supabase/auth.ts:451-453`), i.e. any account. A census of the other
  `JSZip.loadAsync` sites (`grep -rn loadAsync src --include=*.ts`: ~30 non-test
  sites in actions and lib) classified by whether the input is untrusted is
  owed. Owner: security seat. Instrument: that census plus reuse of
  `zip-caps.ts`. Step: after W2, own scope.
- **R5 - one hostile or oversized entry blocks the whole archive (D6 cost).**
  Owner: BULK-ZIP BW2 / RES-BZ-4 (per-student oversized row). Instrument: its
  I7. Step: BW2 design of the skip-with-reason channel; cap refusals can adopt it
  then.
- **R6 - pre-existing silent skips, unchanged.** A corrupt (non-cap) nested
  archive (`extraction.ts:90-92`) and a `.zip` at depth 3 (`:85` condition false,
  falls through to the unsupported branch) are skipped with no note. I8's control
  pins the first so it is not changed by accident. Owner: orchestrator files a
  row. Instrument: `failedSupportedFiles` or a typed note (BW2's channel). Step:
  BW2.
- **R7 - pdf / rtf / legacy binary parsing is uncapped.** Those go straight to
  `OfficeParser` (`office-extract.ts:212-217`, pdfjs). Only the container's
  declared size is bounded by the outer budget. Owner: security seat.
  Instrument: a crafted-pdf `maxRSS` probe like Appendix A. Step: own scope.
- **R8 - time, not memory.** A 1,000-docx archive under every cap can still
  exceed the platform duration. Owner: BULK-ZIP BW2 (60s soft budget,
  `bulk-zip-grading-scope.md:664`). Instrument: its soft-budget refusal test.
  Step: BW2.
- **R9 - the memory instrument disagreement (section 0 item 3).** I could not
  reconcile the security pass's 807 MiB with the 4,490.8 MiB `maxRSS` on the same
  fixture. Owner: W1 verifier. Instrument: `maxRSS` in a child process on the
  built code (section 7). Step: W1 verify; the verifier states which instrument
  it used.
- **R10 - jszip internals.** `internalStream` is untyped and `_data` is private.
  Owner: W1 implementer; instrument: I2 (and the `unverifiable-size` unit test);
  step: W1. Re-run on any jszip upgrade (`package.json` carets `^3.10.1`).
- **R11 - the fold is proven equivalent on six encodings only (M7).** Owner: W1
  verifier. Instrument: the I7 encoding sub-fixture against HEAD-frozen values.
  Step: W1 step 0 / verify.
- **R12 - downstream memory after extraction is unmeasured.** `mergedContent`
  copies and the per-item wire payload were not measured; the 100 MiB figure is
  extraction only. Owner: W1 verifier / R1 owner-walk. Instrument: R1's log.
  Step: after W2.
- **R13 - false-positive surface of the ratio rules** (a large repetitive CSV; an
  unread >40 MiB media member in an Office file, Q3). Owner: repo owner.
  Instrument: R2 owner-walk. Step: after W2.

---

## 10. Dispatch list for the orchestrator

1. File the backlog row (suggested id `ZIP-BOMB-CAPS`, area `grading-security`,
   `owns` = the eleven paths in section 5.2, instrument = I1-I12, `from` =
   this doc) and the separate rows for R3, R4, R6, R7. Bump
   `EXPECTED_ROW_COUNT` per row filed.
2. Checker on THIS scope (fresh `loop-checker`): it should re-run M3-M5 and
   M8-M9 and challenge section 0 items 2, 3 and 4 hardest - they contradict the
   brief.
3. Wave 1 seats (this item has a security surface; per `seats.md` triage):
   `loop-test-author` for the test notes (I1-I12, sabotage list) in parallel
   with a `loop-seat` security and reliability pass; both consume this doc, so
   dispatch them after the check clears it, not alongside it.
4. Build: W1 (`loop-implementer`, write set exactly section 5.1 W1, step 0 =
   frozen oracle green at HEAD), verify, push; THEN W2, verify, push. Not
   concurrent with each other and not concurrent with BULK-ZIP BW2/BW3.
5. Leverage claim: this is hardening, not a user-reachable capability; no claim
   to make (`DEV_LOOP.md`, "The loop / Criteria").

---

## Appendix A. The measurement scripts (node, run from a scratch directory)

`cmp.js` builds a zip of one `MIB`-sized `0x61` entry and writes it to disk so the
reader runs in a fresh process (generating the fixture inflates `maxRSS`):

```
node --expose-gc cmp.js x 100     // writes bomb-100.zip
node --expose-gc run.js old 100   // async("string") then async("base64")
node --expose-gc run.js new 100   // internalStream into allocUnsafeSlow(declared), then native toString
```

`run.js` core (the whole instrument is: read `maxRSS` before, do the work, read it
after, in a process that has not built the fixture):

```js
const base = process.resourceUsage().maxRSS * 1024;
// old:  text = await f.async("string"); b64 = await f.async("base64");
// new:  const out = Buffer.allocUnsafeSlow(declared); let off = 0;
//       await new Promise((res, rej) => { const h = f.internalStream("nodebuffer");
//         h.on("data", c => { if (off + c.length > declared) { h.pause(); return rej(new Error("overrun")); }
//                             c.copy(out, off); off += c.length; });
//         h.on("end", res); h.on("error", rej); h.resume(); });
//       text = out.toString("utf-8"); b64 = out.toString("base64");
const peak = process.resourceUsage().maxRSS * 1024;   // delta = peak - base
```

The lying-header fixture: find the central record with
`buf.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]))`, then
`buf.writeUInt32LE(1000, cd + 24)` (uncompressed size) - the local header need
not be patched (`zipEntry.js:70`). Scripts used for this document live in the
session scratchpad (`...\scratchpad\bomb.js bomb2.js bomb3.js bomb4.js cmp.js
run.js run2.js fflate2.js many.js utf.js fold.js` and `probe\*.probe.test.ts`);
they are inputs to a checker's re-run, not repo artifacts, and were not added to
the repo.
