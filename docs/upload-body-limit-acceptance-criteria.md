# The 6 MB upload caps are unreachable in production

Two surfaces cap user file uploads at 6 MB and justify that number against
`next.config.ts`'s `experimental.serverActions.bodySizeLimit: "10mb"`. The
justification is wrong: this project deploys to Vercel, where Functions cap the
request body at **4.5 MB** and return `413 FUNCTION_PAYLOAD_TOO_LARGE` at the
platform layer, before the request reaches the app. `bodySizeLimit` cannot raise
a platform limit. Base64 inflates by 4/3, so the real ceiling on either path is
about **3.3 MB of decoded bytes**.

The user-visible consequence is not "uploads are smaller than advertised" - it
is that the carefully-worded refusal message never runs. The action is never
entered, so the user gets an opaque platform error instead of
`attachmentSizeCapMessage`'s "over the 6 MB per-file limit".

Scope is the two surfaces named in the report. A survey found 15 further paths
with the same class of defect, 9 of them with no size cap at all - those are
recorded in AC6 as findings, NOT fixed here.

## AC1. Knowledge-base attachments move to direct-to-Storage

1. `src/app/components/knowledge/AttachmentsPanel.tsx` stops reading files into
   base64 (`readFileBase64`) and uploads them with the authenticated browser
   Supabase client (`useSupabase()`) straight into the existing private
   `institution-attachments` bucket - the same transport the Tasks-cell
   attachments feature uses and the same one `MiscFilesCell` has always used.
2. `uploadInstitutionPageAttachmentAction` takes METADATA ONLY - no `base64`
   field in its payload, in any encoding. It records the row for an object the
   browser has already written.
3. The write ordering and its rollback are UNCHANGED in meaning: object first,
   then row, and the object is removed if the row insert fails. That logic
   already exists in `createInstitutionPageAttachment` - it moves, it is not
   reinvented, and delete still removes the object before the row.
4. The storage path keeps its current shape
   (`${userId}/${pageId}/${attachmentId}.${ext}`, `buildAttachmentStoragePath`).
   The user id must remain the first segment or the bucket's RLS refuses the
   write.
5. `MAX_ATTACHMENT_SIZE_BYTES` rises to 25 MB, matching
   `MAX_TASK_ATTACHMENT_BYTES` - the two surfaces now share a transport, so
   they should not disagree on the limit. The bucket's own `file_size_limit`
   (currently 6291456) is raised to match IN A MIGRATION, following
   `20260806000000_course_files_size_limit.sql`'s precedent, because it is now
   the binding constraint rather than a second gate behind a smaller app cap.
6. The cap is enforced in the BROWSER before any byte is uploaded, and its
   message still names the limit.

## AC2. The syllabus upload moves to direct-to-Storage

7. `SyllabusUploadControl.tsx` uploads the chosen file to the existing private
   `course-files` bucket (200 MB limit, RLS already keyed on the user id as
   first path segment) rather than base64-encoding it, and passes
   `{ name, storagePath, mimeType }` to the action.
8. `uploadSyllabusAction` downloads that object server-side, parses it exactly
   as it does today (`extractTextFromFile` - docx via `parseOfficeParagraphs`,
   pdf via OfficeParser, txt/md decoded), and builds the same rebuilt docx it
   builds today. **The persisted artifact is unchanged**: `createSyllabus`
   still stores the rebuilt docx under `"uploaded-syllabus.docx"` in
   `course_syllabi.content`, and `course_hub.syllabus_id` is still set the same
   way, in the same record-first order.
9. **The uploaded original is temporary and is always cleaned up.** Nothing in
   this app reads the original file after parsing - it is parsed and discarded
   today, and that stays true. The object is removed after the parse whether
   the parse SUCCEEDED OR FAILED, so a failed upload cannot leave an orphan in
   a bucket nothing else enumerates.
10. `extractSyllabusTextAction` converts in the same change. Its own comment
    claims the two paths "can never drift" on accepted types and sizes;
    converting one alone would falsify that comment silently.
11. **This is the repo's first server-side Storage download.**
    `downloadFile(bucket, path)` exists at `src/lib/supabase/storage.ts` with
    ZERO callers anywhere - it is untested scaffolding, not a proven helper.
    Whatever is used must be exercised by a test with an injected fake, and the
    "object missing / download failed" path must produce a real error message,
    not a crash or a silent empty parse.
12. `MAX_FILE_SIZE` in `src/lib/syllabus-upload-validation.ts` rises to 25 MB
    for consistency with AC1, and is enforced in the BROWSER before upload -
    today it is checked only server-side, which is why a 5 MB syllabus fails
    with a platform 413 instead of the module's own message.

## AC3. The false reasoning is corrected everywhere it appears

13. Every comment that justifies a cap against `bodySizeLimit` is corrected to
    state the real constraint. Known sites, each to be verified rather than
    trusted: `src/lib/institution-page-attachments.ts` (the
    `MAX_ATTACHMENT_SIZE_BYTES` doc block), `src/lib/syllabus-upload-validation.ts`,
    `src/app/actions/live-class.ts`, `src/lib/live-class/session.ts`,
    `src/lib/live-class/wav.ts`, and
    `src/lib/workflows/registry/steps.content-insights.ts`.
14. **No new explanation is written.** The repo already documents the 4.5 MB
    platform limit correctly in several places; `src/lib/chat/attachments.ts`
    has the clearest prose tied to a real enforced constant, and
    `src/lib/course-task-attachments.ts` states it for the Storage transport.
    Corrected comments point at one of those rather than adding a seventh
    wording of the same fact.
15. `docs/REGRESSION.md` entry 150 AC2 (the knowledge-base attachment entry)
    carries the wrong reasoning verbatim AND is the entry that ties the two
    caps together, so it is amended rather than left to contradict the code.
    The syllabus entry's "up to ~6 MB" is corrected the same way.

## AC4. What must not change

16. The persisted artifacts are byte-identical in shape: `course_syllabi`
    still receives a rebuilt docx built from extracted text, never the original
    upload; `institution_page_attachments` rows keep every column they have.
17. `readFileBase64` stays - it has other callers and this work converts only
    two of them.
18. `next.config.ts`'s `bodySizeLimit` is NOT changed. Nothing reads it, raising
    it cannot help, and lowering it would only change local `next dev`
    behaviour. The dev/prod divergence (dev honours 10mb, prod refuses above
    4.5 MB) is recorded rather than papered over.
19. Accepted file types are unchanged on both surfaces: any type for
    attachments, `.docx/.pdf/.txt/.md` for syllabi.

## AC5. Tests

20. A test proves the browser path sends NO base64: the converted components
    must not reference `readFileBase64`, `readAsDataURL`, `btoa(` or a
    `base64` payload field. The Tasks-cell wiring test's `readSource`/`present`
    idiom is reused. Note `syllabus-upload.ts` legitimately mentions `base64`
    for the REBUILT docx it writes, so the server-side assertion must target
    the action's INPUT payload, not the whole file.
21. A test proves the size cap is enforced BEFORE upload, and that its message
    names the limit.
22. A test proves the syllabus temp object is removed on BOTH the success and
    the parse-failure paths, using an injected fake - this is the new orphan
    risk the conversion introduces and nothing else would catch it.
23. Existing tests that encode the old transport are updated, not deleted:
    `syllabus-upload.preserves-columns.test.ts`'s `{name, base64, mimeType}`
    fixture, `steps.course-schedule-from-source.source-syllabus-document.test.ts`'s
    `expect(typeof fileArg.base64).toBe("string")`, and
    `institution-page-attachments.test.ts`'s "computes sizeBytes from the
    DECODED base64 payload" test, which becomes meaningless under the new
    transport and should be replaced by one asserting the size recorded is the
    size the browser reported.

## AC6. Found and deliberately NOT fixed here

24. A survey found 15 further paths where a user's file reaches a server action
    as base64. **Nine have no size cap at all**, client or server: the
    lecture-planning repo `.zip` (routinely over 3.3 MB, so it is failing in
    production today), the syllabus-adaptation docx/zip/images, textbook photo
    extraction, `.pptx` slide extraction, voice-clone samples, the Gemini
    lesson-planner path, and the workflow `uploads` field. Two more have caps
    ABOVE the limit, and the Course Engine path caps at 4.5 MB measured on the
    RAW file - off by exactly the 4/3 base64 factor, so it permits 6 MB on the
    wire and does not protect the request it guards.
25. These are recorded here, and as their own work item, rather than folded in:
    they are a different size of job, several need the same server-side
    download this work is introducing for the first time, and mixing them into
    this slice would make the regression gate cover far more than the defect
    that was reported. The one cap in the repo that is CORRECT -
    `src/lib/chat/attachments.ts`, measured in wire bytes against a 3.5 MB
    budget - is the model for whatever fixes them.
