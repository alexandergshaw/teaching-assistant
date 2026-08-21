# Course cartridge: import it, or upload it to Canvas - from the Modules view

Request (verbatim): "give me a choice on the modules view to import and upload
a course cartridge to canvas".

Read as TWO destinations for one artefact - a Common Cartridge (`.imscc` /
`.zip`) file:

- **Import** - bring the cartridge INTO this app: parse it, attach it to the
  course's `course_hub` row, and render it as the Course Content source. No
  Canvas involvement at all.
- **Upload to Canvas** - push a cartridge INTO the live Canvas course as a
  `common_cartridge_importer` content migration, and watch it until Canvas
  finishes.

"A choice" is the deliverable: from the Modules view, both destinations are
one control group, side by side, so the instructor picks the destination
rather than discovering only one of them.

---

## Reuse survey (vetted - each of these was read before this doc was written)

Nothing below is to be reinvented. Line references are as of commit b19f98a.

| Need | Existing code to reuse | Where |
| --- | --- | --- |
| Start a Canvas content migration | `createCourseCopy` - the exact `POST /api/v1/courses/:id/content_migrations` shape, incl. `writeJson` + `resolveCourse` + `canvasError` | `src/lib/canvas-modules/copy.ts:26` |
| Poll a migration | `getMigrationState` (lib) / `getMigrationStateAction` (action) | `src/lib/canvas-modules/copy.ts:47`, `src/app/actions/canvas-files-bulk.ts:85` |
| Choose content types on a `waiting_for_select` migration | `selectCopyTypes` / `selectCopyTypesAction`, and the `COURSE_COPY_TYPES` list | `src/lib/canvas-modules/copy.ts:110`, `src/app/actions/canvas-files-bulk.ts:98` |
| Browser POST of file bytes to a Canvas pre-signed upload ticket | the established idiom (`FormData` from `uploadParams`, `file` appended LAST, `fetch(uploadUrl, {method:"POST", body: form})`) | `src/app/components/content-tab/utils.ts:336`, `src/app/components/files/add-to-module.ts:39`, `FilesView.tsx:285` |
| The `FileUploadTicket` type | `src/lib/canvas-modules/types.ts:94` | reuse verbatim, do not declare a second ticket type |
| Server-action idiom (`requireOwner()`, `{...} \| {error}`) | `createCourseCopyAction` | `src/app/actions/canvas-files-bulk.ts:69` |
| Parse a cartridge client-side | `parseCartridgeBlob` | `src/lib/cartridge-import.ts` |
| Decide which saved row an import belongs to | `chooseImportDestination`, `resolveImportFallbackName` | `src/lib/imported-export-destination.ts` |
| Attach an uploaded export to a row | `uploadCourseZipChunked` + `appendCourseExportFileAction` (NO `generated` flag) | `src/lib/course-files.ts:109`, `src/app/actions` |
| The whole import pipeline, already written once | `ImportCourseExportControl.tsx` (257 lines) - **extract, do not copy** | `src/app/components/content-tab/ImportCourseExportControl.tsx` |
| Resolve this course's `course_hub` row from a `courseUrl` | `resolveLmsCourseRowAction(courseUrl, acronym)` | used at `ContentTab.tsx:142` |
| The newest INSTRUCTOR-provided export on a row | `latestSourceExportFile` (never a raw `exportFiles` reduce - entry 196) | `src/lib/courses-table-helpers.ts:631` |
| Download a stored export's bytes (with retry) | `downloadCourseZipBlob` | `src/lib/course-files.ts:205` |
| Per-operation gating vocabulary | `gateOperation` / `ContentSourceContext` | `src/app/components/content-tab/contentSourceGating.ts` |
| Modal shell + focus restoration | `ModalShell` | `src/app/components/ui/ModalShell.tsx` |
| Where a Modules-view modal is allowed to render | `ModulesViewSecondaryModals.tsx` | see AC15 |

---

## A. The control group (Modules view)

**AC1.** `ModulesHeaderBar` gains ONE new group, labelled `Cartridge`, holding
exactly two controls:

- `Import cartridge` - opens the device file picker directly (a hidden
  `<input type="file" accept=".imscc,.zip,application/zip">`, the same idiom
  `syllabusTemplateFileInputRef` already uses in this bar). ONE click to the
  picker; no intermediate modal.
- `Upload to Canvas` - opens the cartridge-upload modal (AC15).

**AC2.** The group renders whenever the Modules view renders - live source or
export source, modules present or not. Neither control depends on the module
list, the current selection, or `targets`.

**AC3.** `Import cartridge` is NEVER gated. Every step it runs is owner-scoped
and never touches Canvas, so an instructor with zero Canvas configuration must
be able to complete it (the same reasoning as `ImportCourseExportControl`'s
B5). It takes no `acronym`.

**AC4.** `Upload to Canvas` is gated on ONE fact only: whether a live Canvas
course exists to write into. It is **not** blocked when the on-screen source is
a stored export - pushing the export you are looking at into the live course is
the single most valuable use of this feature, and blocking it would ship the
capability dead. This is expressed by a NEW named helper in
`contentSourceGating.ts` (never a hand-rolled `!ctx.hasLiveCourse` at the call
site), so the wording stays defined once:

- `gateCartridgeUpload(ctx): OperationGate` - `allowed:false` with
  `NO_LIVE_COURSE_REASON.courseWrite`'s existing sentence when
  `!ctx.hasLiveCourse`; `allowed:true` otherwise, including
  `source === "export"`.
- `describeCartridgeUploadOnExport(ctx): string | null` - failure shape
  (iii), WORKS DEGRADED: on `source === "export"` returns a sentence saying
  the import lands in the live Canvas course and this export view will not
  change until it is re-read from Canvas; `null` on the live source, so the
  caller renders it unconditionally.

**AC5.** Unavailable is `aria-disabled` + a visible `aria-describedby` reason,
never native `disabled` and never a `title` tooltip - the split
`DownloadSelectionSection.tsx` and `ModuleItemRow.tsx` already use, for the
reason their header comments give (a natively-disabled control leaves the
tab order and the reason becomes undiscoverable). A transient busy state MAY
use native `disabled`.

**AC6.** Neither control renders a modal, dialog, popover or any
`position: fixed` element from inside the sticky header. `ModulesHeaderBar`
renders inside `styles.ccStickyHeader`, which is a stacking context AND the
containing block for fixed descendants - anything fixed painted from there
lands at the header's size, not the viewport's (see
`GeneratedPreviewModal.tsx`'s header comment and
`generatedPreviewModal.wiring.test.ts`). The header may only set state that
`ModulesView` reads.

---

## B. Import (cartridge -> this app)

**AC7.** Choosing a file from `Import cartridge` runs the SAME pipeline
`ImportCourseExportControl` already runs, in this order, and stops at the first
failure with an inline message:

1. reject over 100 MB (`MAX_EXPORT_BYTES`, the storage bucket's own ceiling);
2. `parseCartridgeBlob` BEFORE anything is uploaded or created;
3. `listCourseHubAction` + `chooseImportDestination` +
   `resolveImportFallbackName` to pick or create the destination row;
4. `uploadCourseZipChunked` + `appendCourseExportFileAction` with NO
   `generated` flag, so `latestSourceExportFile` counts it exactly as a
   manual upload;
5. on a failure after a row was created, name that row in the error rather
   than silently orphaning it.

**AC8.** That pipeline is **extracted** out of `ImportCourseExportControl.tsx`
into one shared module, `src/app/components/content-tab/importCourseExportPipeline.ts`,
and `ImportCourseExportControl.tsx` is rewritten to call it. Two copies of this
pipeline must not exist. The extraction is a pure move: same order, same
messages, same `generated`-flag omission, same storage-cleanup-on-failure
behaviour.

**AC8a - the fixed contract**, so the extraction and its second caller can be
built concurrently:

```
export type ImportOutcome =
  | { kind: "attached";  courseId: string; courseName: string }
  | { kind: "stamped";   courseId: string; courseName: string }
  | { kind: "created";   courseId: string; courseName: string };

export async function importCourseExportFile(
  supabase: SupabaseClient<Database>,
  userId: string,
  file: File,
  onPhase?: (phase: "parsing" | "uploading") => void
): Promise<ImportOutcome>;   // throws Error with a user-ready message on failure
```

The three `kind`s are exactly the three outcomes AC9 requires the caller to
distinguish, and `courseName` is carried so the caller can name the row
without re-reading it. `onPhase` exists so a caller can drive its own busy
label; it is optional because the pipeline must remain usable without one.

**AC9.** On success the Modules view surfaces, through the existing `setNote`
channel, which of the three outcomes happened (attached to an existing row /
attached and stamped that row with the cartridge's Canvas identity / created a
new row), naming the course row - the same three outcomes
`ImportCourseExportControl` already distinguishes.

**AC10.** After a successful import the Modules view does not silently keep
showing stale content: it tells the instructor the export is attached and,
where the current course row IS the destination row, reloads the content so the
imported modules are visible without a manual refresh.

---

## C. Upload to Canvas (cartridge -> live Canvas course)

**AC11.** New lib function, `src/lib/canvas-modules/cartridge-migration.ts`:

```
createCartridgeMigration(
  courseUrl: string,
  file: { name: string; size: number },
  opts: { selective: boolean; overwriteQuizzes: boolean },
  code?: string
): Promise<{ migrationId: number; courseId: string; state: string; ticket: FileUploadTicket }>
```

- `POST {baseUrl}/api/v1/courses/{ctx.courseId}/content_migrations` via
  `writeJson`, with `migration_type=common_cartridge_importer`,
  `pre_attachment[name]`, `pre_attachment[size]`,
  `selective_import=true` when `opts.selective`, and
  `settings[overwrite_quizzes]=true` when `opts.overwriteQuizzes`.
  (VERIFIED 2026-08-21: `pre_attachment[name]` is "Required if uploading a
  file"; `pre_attachment[*]` takes "Other file upload properties, See File
  Upload Documentation", which is where `size` comes from. The migration_type
  string is exactly `common_cartridge_importer`.)
- Throws a clear Error if Canvas returns no numeric `id`.
- **The documented pre-processing error path, which must NOT be reported as a
  generic failure:** "if there is no upload_url then there was an attachment
  pre-processing error, the error message will be in the message key". So when
  `pre_attachment.upload_url` is absent, throw with
  `pre_attachment.message` verbatim when present, falling back to a generic
  sentence only when it is not. Canvas is telling us exactly what it disliked
  about the file; discarding that is how an instructor gets "something went
  wrong" for a problem Canvas already named.
- Returns `ctx.courseId` so the caller can drive the EXISTING
  `getMigrationStateAction` / `selectCopyTypesAction` without deriving a
  course id of its own.
- Reuses `resolveCourse`, `writeJson`, `canvasError`, and the existing
  `FileUploadTicket` type. Exported from `src/lib/canvas-modules/index.ts`.

**AC12.** New server action `createCartridgeMigrationAction`, in
`src/app/actions/canvas-cartridge.ts`, re-exported through
`src/app/actions/canvas.ts`. Same idiom as `createCourseCopyAction`:
`requireOwner()`, returns the lib result or `{ error }` - never throws.
`canvas-files-bulk.ts` is already 521 lines and is NOT the home for this.

**AC13.** The bytes go from the BROWSER to `ticket.uploadUrl` - never through
a server action, and never through this app's own request body. A cartridge is
allowed up to 100 MB here (AC17); routing that through a server action would
hit this repo's upload body limits (`docs/upload-body-limit-acceptance-criteria.md`).
Use the established idiom: `FormData`, every `uploadParams`
entry appended first, the file appended LAST under `file`, `fetch(uploadUrl,
{ method: "POST", body: form })`, non-`ok` treated as a failure.

**AC13a - THE STEP THAT CREATES ZOMBIES. Read this before touching the upload
call.** Canvas's file-upload workflow is THREE steps, not two, and the third is
mandatory (verified 2026-08-21 against
canvas.instructure.com/doc/api/file.file_uploads.html):

1. ask for the ticket (AC11);
2. POST the bytes to `upload_url` as `multipart/form-data`. Every
   `upload_params` entry must be sent **exactly as given** - "The request is
   signed, and will be denied if any parameters from the `upload_params`
   response are added, removed or modified" - the file field must be named
   `file` and "must be posted as the last parameter following all the
   others", and **no Authorization header may be sent** ("The access token is
   not sent with this request");
3. **follow the redirect.** "the application needs to perform a GET to this
   location in order to complete the upload, otherwise the new file may not be
   marked as available." Either a 3XX or a 201 indicates step 2 succeeded.

A client that completes step 2 and skips step 3 leaves the migration waiting
for a file Canvas never marks available - which is precisely the
`pre_processing`-forever row the Diagnostics screen classifies as
`stuck-no-file` (`docs/REGRESSION.md` entry 318 check 5), and which the
Canvas API can neither cancel nor delete. This feature must not manufacture
them.

`fetch`'s default `redirect: "follow"` performs step 3 automatically, so the
existing repo idiom is already correct - but this must be DELIBERATE:
**never pass `redirect: "manual"` or `redirect: "error"` on this call.** If a
future change needs the raw redirect, it must perform the follow-up GET
itself. Add a comment at the call site saying so, because the failure mode is
invisible at the time it is introduced and only surfaces as an unclearable
stuck import days later.

**AC14.** The upload runs as an explicit phase machine, each phase named in the
UI in plain language:

`idle -> preparing (reading/locating the file) -> creating (asking Canvas to
start the migration) -> uploading (bytes to the ticket) -> processing (Canvas
is unpacking it) -> [selecting (only when selective)] -> done | failed`

- Polls with `getMigrationStateAction(courseUrl, courseId, migrationId,
  acronym)` on a bounded interval, exactly as `CourseCopyModal` polls today.
- Terminal Canvas states: `completed` -> done; `failed` -> failed, with the
  Canvas state named. `waiting_for_select` -> the selecting phase.
- The poll loop is BOUNDED (a maximum elapsed time), and on timeout it
  reports that Canvas is still working and the import will finish on its own
  - it must never claim failure it cannot prove, and never spin forever.
- Cancellation: closing the modal stops polling (a `cancelled` flag), and
  says plainly that Canvas keeps importing in the background - a started
  migration cannot be recalled.

**AC15.** The modal renders from `ModulesViewSecondaryModals.tsx`, NOT from
`ModulesView.tsx`'s sticky header (AC6), and uses `ModalShell` with focus
restoration to the `Upload to Canvas` button that opened it - the
capture-alongside-the-setter shape this bar already uses for its other four
openers (`onBulkUploadTrigger` and siblings).

**AC16.** The modal offers a SOURCE choice:

1. **A file from your device** - always available.
2. **This course's stored export** - available only when
   `resolveLmsCourseRowAction(courseUrl, acronym)` resolves a row whose
   `latestSourceExportFile` is non-null. Bytes come from
   `downloadCourseZipBlob` (which brings its own retry). App-GENERATED
   cartridges are excluded by construction, because `latestSourceExportFile`
   already excludes them - do not reduce over `exportFiles` directly (entry
   196: self-consumption).

When option 2 is unavailable, say why in one sentence rather than hiding it.

**AC17.** Pre-flight, before any Canvas call: reject a file over 100 MB with
the size named, and reject a file whose name ends in neither `.imscc` nor
`.zip`. Canvas rejecting it later is a worse experience than refusing it here.

**AC18.** Options in the modal, both defaulting OFF:

- `Choose what to import` -> `selective: true`; on `waiting_for_select` the
  modal shows the `COURSE_COPY_TYPES` checkboxes and submits via
  `selectCopyTypesAction`. No new type list is declared. (Type-level only -
  the per-item `SelectiveNode` tree stays `CourseCopyModal`'s; that
  component is not refactored by this chunk.)
- `Overwrite existing quizzes with matching identifiers` ->
  `settings[overwrite_quizzes]`. Its label states plainly that it replaces
  quiz content in the live course.

**AC19.** Every persistent control in the modal - the source select and both
option checkboxes - persists across reloads under `ta-`-prefixed localStorage
keys (this repo's standing rule). Transient state (the picked File, phase,
migration id, error) does not persist.

**AC20.** On `completed`, the modal reports success naming the destination
course, and the Modules view reloads live content so the newly imported
modules appear without a manual refresh. On the export source, it additionally
renders `describeCartridgeUploadOnExport`'s sentence (AC4) so the instructor is
not left thinking the on-screen list should have changed.

---

## D. Cross-cutting

**AC21.** No emojis anywhere (repo rule; `src/lib/no-emojis.test.ts` owns it).

**AC22.** Visual language is the existing one: MUI `Button variant="outlined"
size="small"`, `styles.bulkRow`/`bulkLabel`/`bulkHint` grammar in the header
bar, `ModalShell` for the modal, `var(--text-secondary)` for muted text. No new
colour tokens. No opacity multiplier on label text (contrast floor).

**AC23.** No file this chunk touches ends over 1000 lines. `ModulesView.tsx`
(764) and `ModulesHeaderBar.tsx` (463) are the two at risk - split rather than
exceed.

**AC24.** `next build`, `tsc`, and `eslint` all clean. Server-action files
export only `async` functions (no type re-exports from a `"use server"` file).
Registry/client files import no server-only module.

**AC25.** New unit tests cover, at minimum: the migration params
`createCartridgeMigration` sends (including both option flags on and off), its
two "Canvas did not return..." failure shapes, the phase machine's mapping of
Canvas workflow states to phases (including `waiting_for_select` and the
bounded-timeout branch), the AC17 pre-flight rejections, the AC4 gating
helpers, and the extracted import pipeline's three outcomes. Tests assert
facts and ordering, never source spelling. Every new test is sabotage-checked
(it must actually fail when the behaviour it pins is broken).
