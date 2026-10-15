# Template tools implementation contract

Status: revision 2 for independent delta check; not accepted for implementation yet.
Run: `template-tools-20261015`. Requested author model: `gpt-6-astra`, high;
observed provider/model identity: unavailable. Scoped author owns this document only.
This combines distinct criteria, architecture, plan and oracle sections under the
coordinator's bounded-package ruling. The coordinator imports the checked artifact
into its manual-adapter run; this author does not dispatch providers or drive it.

## User acceptance criteria

**Leverage claim (CORPUS + GUARANTEED).** An instructor can retain an uploaded
deck's classified slide examples or a document's reusable placeholders, reopen them
in a later visit, and reuse/download them without uploading and explaining the
source again. Source identity and permitted replacements are held by code, rather
than relying on a model to remember or faithfully rewrite the whole original.

- U1: Presentations gains **PowerPoint Templates** and **Document Templates** as
  siblings of Slide Deck Creation, Slide Deck Pipeline and existing PowerPoint
  Design. Selection survives reload, direct URL and Back/Forward navigation.
- U2: In PowerPoint Templates the instructor selects a `.pptx`, explicitly confirms
  **Use this upload as a template**, then analyzes it. The resulting saved library
  shows actual source slide examples classified as title, section divider, content,
  closing or other; absent roles are shown as absent, never invented. Each example
  identifies its source slide and displays its extracted text, not a promised image
  preview. The instructor can correct classifications and save them.
- U3: Reopening a saved PowerPoint library restores those classifications and the
  original source; **Use in Slide Deck Creation** selects that uploaded file using
  the existing template selection, and the original `.pptx` and classification
  manifest are downloadable. Existing positional fill/fit refusal remains honest;
  this scope does not promise arbitrary slide cloning or new layout rendering.
- U4: Document Templates accepts `.docx` and text-bearing `.pdf`. An explicit
  abstract action proposes reusable named fields in the source's organization,
  shows retained text and placeholders for review, then saves a reusable template.
  The instructor can reopen it, enter replacement field values, and download both
  an unfilled template and a filled DOCX without calling the model again.
- U5: DOCX abstraction preserves the source package and unaffected paragraphs;
  PDF abstraction produces an editable text-based DOCX and plainly states that
  PDF page layout, images and forms are not retained. Originals remain separately
  downloadable and unmodified. Scanned/image-only or encrypted/unreadable PDFs
  receive a concrete refusal, not an empty successful template.
- U6: Unsupported/corrupt/oversize input, unsupported source complexity, no usable
  model result, provider failure and save failure are visible and retryable where
  appropriate. Failed abstraction never replaces a saved template or source. A
  save failure leaves the reviewed proposal available for retry/download.
- U7: The account diagnostics session log reports each new surface's load,
  analyze, save, reuse and download outcomes, duration and stable error code.
  It contains no source text, original filename, field values or model response.
- U8 (removal criterion): after save, discard component state, reopen by persisted
  identity, and reuse the recovered classification/fields plus original bytes.
  Removing the persistent read must fail this scenario; merely asserting an insert
  or rendering a hard-coded definition does not establish the leverage claim.

## Survey and existing boundaries

Evidence was opened with `Get-Content` and found with `rg -n` / `rg --files` in
the canonical checkout on 2026-10-15; no absence claim relies on a proposed path.

- `src/app/components/presentations/{index.tsx,DeckTemplatePicker.tsx}` already
  uploads/selects file templates. `ppt-design/{index.tsx,TemplateSelector.tsx,hooks.ts}`
  distinguishes structural `DeckTemplate` from a selected original file; reuse
  `useSelectedDeckTemplateFileId` for the latter, never conflate their IDs.
- `src/app/actions/deck-template-files.ts` authenticates with `requireUser`, scopes
  list/fill/delete by `user_id`, validates real PPTX packages, persists original
  bytes/hash in `deck_template_files`, and uses positional fill with overflow refusal.
- `src/lib/deck-templates.ts` stores abstract pedagogical deck recipes; it is not
  a source-slide library. `artifact-templates.ts` and its action store typed
  assignment/test/discussion/etc. specs, not arbitrary document templates.
- `src/app/actions/syllabus-templates.ts` demonstrates DOCX paragraph prompting
  and fill; its syllabus store is the wrong semantic home for generic documents.
  Do not copy its permissive model filtering or silent prompt truncation.
- `src/lib/files/ooxml.ts` does not exist. Actual parser/writer:
  `src/lib/office-edit.ts`; extraction: `src/lib/office-extract.ts`;
  source-preserving fill: `src/lib/decks/office-template-fill.ts`.
  `applyOfficeSections` deletes omitted paragraphs: new callers must use
  `fillOfficeTemplate`, after stricter caller-side replacement validation.
- `parseOfficeParagraphs("pptx")` enumerates slide filenames numerically, not
  presentation relationship order, and omits textless slides. A library inventory
  must reconcile source part paths with `presentation.xml` + relationships so its
  displayed slide number is actual presentation order and no slide vanishes.
- `extractTextFromBuffer` supports PDF through installed officeparser; the DOCX
  generator is `src/lib/docx.ts::buildDocxFromPlainText`. Neither implies PDF
  layout preservation. ZIP readers use `zip-caps.ts` bounded member reads.
- Navigation is owned by `manual/manual-rail.ts`, `src/app/url-state.ts`,
  `home/useAppNavigation.ts` and `src/app/page.tsx` (the actual panel caller).
  `session-diagnostic-log.ts` is browser-only; Settings already consumes its
  registry. Server actions must never import its mutable session store.
- Local Next guide read: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`:
  server functions are POST endpoints; authenticate/authorize each export; only
  async exports in `"use server"` files. Separate pure types/validators from actions.
- Existing backlog rows are `PPT-TEMPLATE-SLIDE-LIBRARY` and
  `DOCUMENT-TEMPLATE-ABSTRACTION`; root coordinates their status and baseline.

## Architecture and safe defaults

These are author-recommended implementation choices, not new owner decisions.
No live credentials, deployment or provider installation is needed to build them.

Shared seam: view IDs `ppt-templates` and `document-templates`; default exports at
`components/powerpoint-templates/index.tsx` and `components/document-templates/index.tsx`.
Both accept optional `onUseInSlideDeckCreation?: () => void`; only PPT invokes it
after a P-owned `panel-logic.ts` handoff helper synchronously persists the JSON-encoded
source file ID to the existing `ta-ppt-template-file-id` localStorage key. Only after
that write succeeds may it invoke navigation. A storage failure returns a fixed
retryable error and never navigates. Calling the existing hook's state setter is
insufficient: its passive persistence effect may not run before panel unmount.
Page supplies navigation; the destination's existing hook reads the committed ID.
Diagnostic surface is `templates`; operations are prefixed `ppt_template_` or
`document_template_`; clients call `recordSessionDiagnosticEntry` directly. Shared
owner adds registry coverage and tests; neither feature edits the session module.

PPT: use existing `uploadDeckTemplateFileAction` to store a validated original,
then analyze only that authenticated user's saved source ID. Add
`powerpoint_template_libraries` with generated UUID, user_id, source_file_id,
name, versioned definition JSON and timestamps. Source reference is checked against
the same user on every read/save/reuse/download; SQL enforces matching ownership
(composite FK or equivalent policy), not just a guessed UUID. Save is insert or
user-scoped update, never unrestricted primary-key upsert. Definition contains
one entry per actual source slide: stable source-part identity, display ordinal,
closed role, and source-derived text. Model supplies only role assignments for
enumerated source slide IDs; no paths, source bytes, resource IDs or text authority.
Require exact coverage, unique known IDs and allowed roles. Reclassification
uses the same validator; source text always comes from the stored original.
Textless slides stay visible as `other` with no text; do not infer their visuals.
The original may remain saved when analysis fails, making retry possible.

Document: add `document_template_files` with server UUID, user_id, name,
source_file_name, source_kind, immutable source_base64/hash, versioned definition
JSON, template DOCX base64 and timestamps. Types live in its own module using the
repo's local row-mapper/service-client convention; no global Database type edits
are needed. Store original and validated abstraction together at explicit Save.
DOCX uses parsed paragraph IDs. PDF extracted paragraphs receive server-generated
IDs and are built into a new DOCX. Model proposes named fields and full paragraph
replacement strings containing `{{field_key}}` tokens; retain omitted paragraphs
through `fillOfficeTemplate`. Validate unique known paragraph IDs, unique bounded
field keys/labels, references to declared fields, and at least one used field.
Reject unknown IDs/keys, duplicate replacements, malformed tokens, empty/deleting
replacements and unused definitions. Partial replacement maps are valid by design
and leave all other paragraphs untouched; an empty/no-field result is not success.
Before saving, validate proposal again against parsed source; build output server-side
instead of trusting client-supplied derived bytes. Fill accepts values only for the
persisted field set and substitutes literal strings, not regex replacement syntax;
missing required values refuse. Subsequent fill never sends data to the model.

Limits: use `checkFileWireBudget` before client reading and `checkWireBudget` on
the server, strict base64 validation, real content signatures, existing ZIP caps,
and the same wire budget on returned binaries. New policy defaults: at most 80
slides and 24,000 extracted text characters per analysis; reject excess with a
smaller-file message, never silently truncate. Bound names, labels, field values,
JSON array sizes and prompt/output sizes to that text budget. DOCX signature must
identify a non-macro Word package, not merely ZIP magic; PDF must have PDF magic.
These are chosen limits, not measured provider capacities. Provider uses existing
`callLlm` with a bounded output cap; one call per Analyze, user-triggered retry,
no retry loop or side effects on refusal. Treat uploaded instructions as quoted
data; schema validation, not a prompt promise, is the enforcement boundary.

Security/storage/reliability triage: all run, because new actions, untrusted content
and persistence are introduced. Authenticate before decoding/parsing/model/storage;
every query scopes by server-derived user_id. Migrations enable RLS and owner
policies. No model-chosen writes, external URL fetches, arbitrary HTML, deletion
operation or source overwrite. Raw provider/database diagnostics are not rendered
or logged; return fixed user-facing errors/codes. Recheck ownership after long calls.
Avoid modal complexity: inline upload, proposal review and saved-library sections.
Busy controls prevent double submission; stale async responses cannot replace a
newly selected file, and navigation/unmount does not commit stale state.
UX/visual/a11y triage: all run; use existing spacing/buttons, visible input labels,
keyboard-operable native controls, status live region and alert errors. Render all
names/text/values through React text nodes. No claims of thumbnail fidelity.
External-facts research triages out: rely on inspected local APIs and executable
fixtures, not undocumented library promises. Operability runs: missing schema/key
returns setup/unavailable feedback; coordinator records migration deployment as a
runtime step, not a reason to defer code or hide ordinary UI behind a new flag.

## Bounded write plan and disjoint ownership

After a fresh independent contract check, start these implementation seats. The
shared owner reserves common paths; feature workers do not edit them or each other.
No source in another worktree, routing grant, provider config, or older run is owned.

**S (navigation/diagnostics, root assigns one worker):**
`src/app/components/manual/manual-rail.ts`, its `.test.ts`;
`src/app/page.tsx`; `src/app/url-state.template-tools.test.ts` (new);
`src/app/components/home/template-tools.wiring.test.ts` (new);
`src/lib/session-diagnostic-log.ts`, its `.test.ts` and `.detail.test.ts`.
Read/check-safe `url-state.ts`, `useAppNavigation.ts` and their existing tests: their
normalization/persistence is already driven by the presentations union. Expand
ownership only with coordinator ruling if executing tests reveal another caller.

**P (PowerPoint, independently implementable):**
`src/app/components/powerpoint-templates/{index.tsx,panel-logic.ts,panel-logic.test.ts,wiring.test.ts}`;
`src/app/actions/powerpoint-template-library.ts` and `.test.ts`;
`src/lib/powerpoint-template-library/{types.ts,inventory.ts,analysis.ts,store.ts,inventory.test.ts,analysis.test.ts,store.test.ts}`;
`supabase/migrations/20261030000000_powerpoint_template_libraries.sql`.
Read-only/adopted dependencies: existing deck-template-files action/storage,
PPT selection hook, PPT validation, bounded ZIP readers, office paragraph parser.

**D (documents, independently implementable):**
`src/app/components/document-templates/{index.tsx,panel-logic.ts,panel-logic.test.ts,wiring.test.ts}`;
`src/app/actions/document-template-files.ts` and `.test.ts`;
`src/lib/document-templates/{types.ts,extract.ts,abstract.ts,fill.ts,store.ts,extract.test.ts,abstract.test.ts,fill.test.ts,store.test.ts}`;
`supabase/migrations/20261031000000_document_template_files.sql`.
Read-only/adopted dependencies: office-extract/edit, fillOfficeTemplate, docx builder,
upload/ZIP budgets, shared LLM/auth clients and download helper.

Feature tests use inline/generated ZIP and minimal real PDF fixtures in their own
test modules; no package install, shared fixture edits or global mock changes.
Root owns `docs/REGRESSION.md`, backlog changes and durable run evidence separately.

## Test-author instruments and final verification

- P fixture: generate a real OPC PPTX with title, divider, content and textless
  slides, presentation order differing from part filename order; classify through
  mocked LLM then parse/reopen saved definition and source. Assert exact source
  membership/order/text, missing-role reporting, correction persistence, manifest
  and original-byte equality; use the selected file through existing fill path.
  Executable P-owned handoff test: the navigation callback immediately reads and
  JSON-decodes storage, observing the newly selected source ID; simulate destination
  reopen from that stored ID. Force storage to throw and assert no navigation plus
  the fixed retryable error. Source-text checks alone do not establish this ordering.
- D fixture: real DOCX package with styled paragraphs, a table paragraph and an
  untouched relationship/media member; model changes one paragraph to a field.
  Reparse downloaded template/filled DOCX, assert exact replacement, retained
  boilerplate and source hash/bytes. A real text PDF fixture must pass the actual
  installed parser and produce inspectable DOCX text; do not mock PDF extraction
  for its acceptance case. A no-text PDF must refuse.
- Both: malformed JSON, refusal, provider error, duplicate/foreign IDs, unknown
  roles/fields, missing PPT coverage, empty document abstraction, HTML-looking
  strings, misleading extensions, macro package, corrupt ZIP/PDF, byte/character
  bounds and returned-output bounds. Assert no save on invalid output and no source
  mutation; partial document replacements retain every unrelated paragraph.
- Action/store tests execute real requireUser with mocked cookie/account factories
  (not wholesale auth mocks); inactive/anonymous identities reach no parser/model/DB.
  Recording DB fake checks user scope on list/get/update/download and foreign source
  attachment; force save failure and prove previous record survives. Validate SQL
  policies/owner-link constraint by source checks, with live DB residual below.
- Removal sabotage: suppress persisted library read and assert reopened reuse fails;
  remove ownership filter and assert cross-user case fails; omit untouched paragraph
  preservation and assert reparse fails. A harmless comment-only mutant survives;
  a deliberate wrong known role/field value fires the semantic canary. Restore each
  mutant before continuing; report commands and observed outcomes, not predictions.
- S instruments: executable URL round-trip/normalization tests for both IDs, active
  destination resolution and source wiring from page to panels/callback. Diagnostic
  registry plus emitted-event tests assert success/failure/code and absence of
  document content. Source wiring is not rendered-browser evidence.
- Each wave: `npm.cmd run test:paths -- <owned tests> src/file-size-ceiling.structure.test.ts
  src/app/actions/action-guard-coverage.test.ts src/app/actions/wholesale-auth-mock-population.structure.test.ts
  src/lib/use-server-exports.test.ts`; include existing deck-template-files,
  office-template-fill, office-edit and session-log tests when integrating consumers.
  Coordinator alone runs `npx.cmd tsc --noEmit --incremental false`; run lint against measured baseline,
  full suite and `npm.cmd run build` at final gate. Build compile success and known
  missing-Supabase-env prerender failure are separate observations, never green build.

Residuals to be filed by root, not silently removed: owner/browser agent uses a
running authenticated browser to exercise tab history, labels, keyboard/focus,
live announcements, stale-request behavior and downloads; owner/live-provider agent
checks classification/abstraction quality on their files; owner/database operator
applies migrations and probes cross-account RLS/source-link constraints before live
use. Step: after code verification, before declaring runtime rollout complete.
The repo's Node tests render no components and call no live model. Those limits
do not block implementation. No deployment is authorized by this package.
