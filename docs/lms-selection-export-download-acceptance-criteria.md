# Download an export or a zip of just the selected modules and items

Instructor request: "another of the bulk actions i want available in the lms
view is to download a course export and/or zip with only the selected
modules/items in it."

Both outputs ship: a **course export** (`.imscc`, importable into an LMS) and a
**files zip** (`.zip`, a plain folder of the selected content). "and/or" is read
as "both, chosen per download".

> **This document was rewritten after an audit demolished its first version.**
> The first draft argued the archive had to be built in the browser, on three
> claims: that `maxDuration` is inert here, that a function response is capped at
> 4.5 MB, and that file bytes arrive through `getFilePreview`. The first is
> false (the page-level restriction applies to Server Actions; six route
> handlers export `maxDuration` and it works), the second confused Vercel's
> REQUEST body cap for a response cap, and the third is flatly wrong -
> `getFilePreview` returns base64 for images and PDFs only and returns
> explanatory prose for everything else. The corrected design is below. The
> wrong one is recorded here so it is not re-proposed.

## The architecture, and the constraints that actually bind

**A route handler builds the archive.** `POST /api/lms-export/selection`,
`runtime = "nodejs"`, `export const maxDuration` declared the way
`src/app/api/lms-generation/deck/route.ts:50` declares it (asking for more than
Hobby's 60s ceiling and documenting that it will not get it), authenticated with
`requireOwner()` exactly as that route does. This is the only shape in Next.js
that can raise its own time limit at all, and it is the only place
`getCanvasFileBuffer` - the sole real file-bytes function in this repo
(`src/lib/canvas-modules/office-accessibility.ts:126`) - can be called from.
Its one existing caller is also a route handler
(`src/app/api/accessibility/route.ts:107`).

**The response streams.** A buffered function response is subject to a size cap;
a streamed one is not. jszip can produce a stream, and the handler returns it as
the `Response` body with a `Content-Disposition` filename. Nothing in
`src/app/api/**` streams today, so this is the one genuinely new mechanism this
feature introduces, and it is introduced deliberately rather than by defaulting
to a buffer that would fail on any real course.

**60 seconds is the binding constraint, and it is spent on fan-out, not on
zipping.** N selected items means N Canvas round trips. That is why the caps in
AC5 exist and why concurrency is bounded with the existing
`createThrottleBudget` helper rather than an unbounded `Promise.all`. Note the
adjacent precedent: the generate path stops fetching descriptions after six
items (`DESCRIPTION_FETCH_LIMIT`, `src/lib/lms-generation/materials.ts:60`)
because it judged this exact fan-out too expensive. This feature needs more than
six, so it pays for them with a cap and a bounded pool instead of pretending the
cost is not there.

## What the cartridge writer can and cannot hold

Verified against `src/lib/workflows/common-cartridge.ts` (887 lines) as it
stands, NOT against REGRESSION entry 240, which pins that file at 528 lines and
is superseded - entry 241 added announcements after it was written.

| Item type | Native slot | Consequence |
|---|---|---|
| Page | yes, `wiki_content/` webcontent | clean |
| Assignment | yes, but flavor-dependent | the default `"cc"` flavor routes assignments through `buildQtiAssessmentXml`, which accepts neither points nor due date |
| File | yes, `web_resources/` | slot is real; bytes must come from `getCanvasFileBuffer` |
| Announcement | yes, `imsdt_xmlv1p1` | shipped by entry 241 |
| Discussion | **no** | the only discussion-shaped emitter hardcodes `<type>announcement</type>` |
| Quiz | **effectively no** | the QTI path emits a single manually-graded essay stub, no question model and no answer key, so fetched questions have nowhere to land |
| ExternalUrl | **no** | no weblink resource is emitted |
| ExternalTool | **no** | no LTI resource is emitted |
| SubHeader | **no** | the organization tree is two levels with no title-only item form |

Neither `CanvasModuleItem.type` nor `CartridgeModuleItem.type` is a union - both
are bare `string`, so TypeScript will never flag a missed case. The
classification must therefore be exhaustive by construction and default to
"omitted, with a reason", never to "silently included as nothing".

## Acceptance criteria

**AC1 - one new bulk row, two actions.** A `bulkRow` labelled "Download" in the
Modules bulk bar, following the existing row grammar (`bulkLabel` first,
controls, `bulkHint` last). Two outlined controls, one per format, each label
doubling as its own progress word. `schedule-weekly-announcements-for-term`
already offers `["imscc", "zip"]` as a multi-select via
`parseMultiSelectValue`; if that idiom fits the bulk bar it wins over two
buttons, since it is the settled convention for this exact pair.

**AC2 - the archive contains exactly the selection, expanded server-side from a
fresh tree.** The handler re-reads the module tree itself rather than trusting
the client's, the way the deck route does, and expands whole-module selections
with `expandModuleSelection` (`src/lib/lms-generation/materials.ts:316`, a pure
DI leaf) including its `seenKeys` guard so an item both loose-selected and
inside a selected module appears once. Note `selectedMaterialItems` is NOT in
that file - it is a closure on the `useModuleSelection` hook
(`useModuleSelection.ts:310`) and cannot be reached from the server.

**AC3 - content, not titles.** Pages carry their body, assignments and
discussions their description, quizzes their questions, files their real bytes
via `getCanvasFileBuffer`. `getFilePreview` is NOT a bytes path and must not be
used for this: it returns base64 for `image/*` and `application/pdf` only, and
for every other type returns extracted text or the sentence "No text preview is
available for this file type." It also reports an over-15 MB file as
`truncated: false`, so it cannot even be used as a size probe.
`fetchCanvasMetaAction` takes a full Canvas URL, not `(courseUrl, id, acronym)`
- an asymmetry REGRESSION already records breaking a prior feature.

**AC4 - nothing is silently dropped, ever.** Every selected item ends in exactly
one bucket: included, or omitted with a reason. The classification is driven by
the item's type AND the chosen format (the table above), so an item with no slot
in a cartridge is omitted from the `.imscc` with a reason naming the constraint,
while the `.zip` - a plain folder with no format restrictions - can still carry
its content. The classification must default to omitted-with-a-reason for a type
it does not recognise: neither type field is a union, so a type this app has
never seen must not fall through into "included as nothing". Every archive
contains a manifest listing what went in and, in its own section, every omission
with its reason; the manifest always states the omission count even when it is
zero. The UI note after a download states the same counts. Every entry's path is
named after its item, so the zip is navigable rather than a pile of counters.

**AC5 - caps, enforced where the number is actually knowable.** The item-count
cap is enforced in the browser BEFORE the request, because a count is knowable
from the selection. Byte caps are NOT: `CanvasModuleItem` has no size field, so
per-item and total byte caps are enforced server-side during assembly, and an
item that busts either is omitted with a reason naming its size and the limit
rather than failing the archive, and the reason makes clear WHICH cap it hit -
"too big by itself" and "did not fit in what was left" are different facts and
must not read identically. Refusals name the limit and the offending number. How
a size is formatted is the implementer's choice; a human-readable "1.5 KB" is as
acceptable as a raw byte count. Any new budget constant lives in the module that owns budgets rather
than being redeclared locally.

**AC6 - one item's failure does not lose the archive.** A per-item fetch that
fails is caught, recorded as an omission with its error, and the archive still
builds - the fail-forward rule `gatherLiveModuleItems` already follows. Only a
failure to build the archive itself surfaces as an error, leaving the selection
intact.

**AC7 - reuse the download plumbing that exists.** `triggerFileDownload`
(`src/app/components/course-planning/utils.ts:19`) for handing the blob to the
browser - REGRESSION entry 267 check 4 already refused a sixth hand-rolled copy
of that dance. Filename sanitizing reuses `sanitizeFilenamePart`
(`src/lib/lms-generation/artifact-download.ts:119`), which already handles the
Windows-illegal characters AND the sanitizes-to-nothing fallback; export it
rather than writing a seventh sanitizer in the same directory.

**AC8 - gated as a read, using the existing vocabulary honestly.** Do NOT assert
that every `GatedSubject` is a write: `"files"` gates the Files view, a read
surface, precisely because a cartridge has no standalone files list. Decide the
gating against `gateOperation`'s actual three-way shape (allowed / blocked /
works-degraded-and-says-so), and remember `ContentTab.tsx:144` hardcodes
`hasLiveCourse: false` for export selections. A live-only capability that is
unavailable in export mode must say so in the hint, not disappear or fail.

**AC9 - busy state follows the surface it lives on.** The row's own per-format
busy string follows the `busy`/`downloading` shape `useLmsGeneration` uses. Note
`GenerateFromSelectionSection` does NOT take `opBusy`, and the existing download
IS mutually exclusive with generation (`useLmsGeneration.ts:881` returns early
when either is in flight) - match that, do not invent a looser rule.

**AC10 - non-destructive, and visibly so.** Nothing is written to Canvas, to
Supabase Storage, or to the course tile. Do not claim this preserves entry 262's
"the Generate group adds no destructive path" property - entry 269 already
shipped posting to Canvas from that group, so that property is historical.

**AC11 - the cartridge is a valid cartridge, and is honest about its stamp.** A
Common Cartridge is defined by its `imsmanifest.xml`, so a subset package is
legitimate as long as the manifest references every resource present and none
absent. `buildCommonCartridge` writes `CARTRIDGE_STAMP_PATH` unconditionally, so
every subset export is stamped app-generated and will be refused as source
material if re-uploaded to this app (REGRESSION entry 206). That is acceptable
and must be stated in the manifest so it is not discovered by surprise.

**AC12 - scope: live selections both formats, export selections zip only.** An
export-sourced item's body was already tag-stripped and truncated to 3000
characters at PARSE time (`MAX_CARTRIDGE_ITEM_BODY_CHARS`), invisibly to this
feature - so re-emitting it into a cartridge would produce de-formatted stubs
that the manifest would wrongly report as complete, violating AC4 from inside.
An export-sourced selection therefore refuses the `.imscc` with a message saying
why, and its `.zip` carries the export's text AS PARSED - with every
export-sourced item flagged in the manifest as reduced fidelity (markup removed,
text truncated when it was first parsed). Flagging is what keeps AC4 true here:
the loss already happened upstream, so the archive must disclose it rather than
present a stub as complete. Copying the ORIGINAL resource entries out of the
stored cartridge byte-for-byte would avoid the loss entirely and is the right
eventual answer, but it is a separate mechanism (resource-href mapping into the
stored zip) and is deliberately not in this slice - see Limits. No message may
claim the zip copies original files until that ships.

**AC13 - the usual gates.** Suite green, `tsc` clean, `lint` clean, no emojis,
every touched file under 1000 lines - note `useLmsGeneration.ts` is at 938 and
`ModulesView.tsx` at 798, so new code goes in new files. `jszip` is already a
dependency; it is NOT always dynamically imported (six static imports exist,
including a client hook), and REGRESSION entry 242 records a live hazard about
Blobs surviving jszip under Node - heed it.

## Reuse survey (verified)

- `expandModuleSelection` - `src/lib/lms-generation/materials.ts:316`, pure, DI.
- `buildCommonCartridge` - `src/lib/workflows/common-cartridge.ts:699`, takes a
  plain `CartridgeWeek[]`, so a subset is a matter of what you hand it.
- `announcement-package-zip.ts` - the existing plain-zip sibling of the cartridge
  builder, already split into a pure core the way AC13 demands. The `.zip`
  builder should follow it, not invent a new shape.
- `sanitizeFilenamePart` - `artifact-download.ts:119`, needs exporting.
- `triggerFileDownload` - `course-planning/utils.ts:19`.
- `createThrottleBudget` - the bounded-concurrency helper the Canvas bulk paths
  already use.
- `getCanvasFileBuffer` - `office-accessibility.ts:126`, server-only, real bytes.
- `requireOwner` + `maxDuration` + fresh-tree re-read - the deck route
  (`src/app/api/lms-generation/deck/route.ts`) is the template for the handler.

## Limits

vitest is node-env and collects only `src/**/*.test.ts`, so no component renders:
AC1, AC9 and AC10 are verified by reading. The pure planning module carries
everything testable - classification, caps, paths, the manifest - and the fetch
seam is dependency-injected so AC3 and AC6 are executable without a network. No
`.imscc` this repo produces has ever been imported into a real LMS, and this
feature does not change that.
