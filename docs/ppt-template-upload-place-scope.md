# PPT-TEMPLATE-UPLOAD-PLACE - acceptance criteria + scope

Author: architecture seat (loop-architect, Opus). Date: 2026-10-11. Branch: main,
HEAD `2db21b7e` (`git rev-parse --short HEAD`). This is a SCOPE artifact: it
authors NO production and NO test code. It is written to be adversarially checked
by a fresh `loop-checker` (plus a security pass over the upload) before any
consumer reads it.

Owner request (direct chat, 2026-10-11): "I need an explicit place to upload ONLY
an existing ppt [.pptx] as a template to the slide deck creation and slide deck
pipeline views."

Read as: a DEDICATED, explicit control to upload an EXISTING `.pptx` used as a
TEMPLATE (not as content/source material), present in BOTH the slide-deck
CREATION view and the slide-deck PIPELINE view, accepting ONLY `.pptx` validated
by magic bytes / OOXML signature, not by extension.

Every quantity below names the command that produced it. Every `file:line` was
opened while writing this. Line counts are `wc -l < <file>` (Bash), which equals
the mandated `@(Get-Content <file>).Count` on this checkout
(`docs/loop/this-repo.md:184-195`); `Measure-Object -Line` is NOT used.

---

## 0. EXECUTIVE SUMMARY - read this first

### 0.1 The one-line verdict: the ENGINE largely EXISTS; the CONTROL is ABSENT from both named views

This is the same shape as the LMS-submissions reframe and the backlog's own A17
note: the hard part is already built and reachable, just not where the owner is
looking. Measured facts:

- The uploaded-`.pptx`-as-template capability is SHIPPED end to end and lives on
  the **PowerPoint Design** tab (`presentationsView === "ppt-design"`), the third
  Presentations sub-view. Server actions upload/list/delete/fill, persisted to a
  real Supabase table, and a live UI (`TemplateSelector.tsx`) that says in the
  owner's own words "Upload your own .pptx. Generated content is written into its
  existing slides and formatting - nothing else in the file changes"
  (`src/app/components/ppt-design/TemplateSelector.tsx:194-197`).
- The **slide-deck CREATION view** (`PresentationsTab`,
  `src/app/components/presentations/index.tsx`, 202 lines) has NO template
  affordance at all. Its deck downloads via `serializeDeckToPptx(deck)` - the
  from-scratch builder, no template branch (`ArtifactCard.tsx:188-199`).
- The **slide-deck PIPELINE view** (`PipelineTab`,
  `src/app/components/presentations/pipeline/PipelineTab.tsx`, 654 lines) has NO
  template affordance. Its manual download and its auto-download-on-completion
  both go through `downloadDeckPptx -> serializeDeckToPptx`, no template branch
  (`PipelineTab.tsx:85-99,213,298`).

**So this feature is a SURFACING plus a small earned increment, not a from-scratch
build and not pure navigation.** The three reusable halves are: (1) the shipped
server actions + the pure fill engine + the Supabase table; (2) the exact
download-routing precedent on ppt-design (`buildOutputPptx`,
`ppt-design/index.tsx:528-537`: `if (selectedFileId) fillDeckTemplateFileAction(...)
else buildSlidesPptx(...)`); (3) the shipped selection key
`ta-ppt-template-file-id` (`useSelectedDeckTemplateFileId`,
`ppt-design/hooks.ts:132-134`). The genuinely NEW work is: a shared upload+select
control placed in the two named views, a download branch in each view, and the
owner's explicitly requested magic-byte validation (which does NOT exist today -
the action validates by extension only, section 1.4).

### 0.2 What "template" means here - aligned with the SHIPPED semantics, not invented

"Template" = the shipped `fillDeckTemplateFileAction` semantics: the generated
deck's content is written INTO the uploaded `.pptx`'s own slides by position (a
slide's first paragraph becomes the title, the rest become bullets), and
EVERYTHING ELSE in the file - slide masters, layouts, theme, logos, geometry - is
preserved byte-for-byte by construction via `applyOfficeSections`
(`src/lib/decks/office-template-fill.ts:109-122`,
`src/lib/office-edit.ts:413-422`). This is the OOXML content-into-template path
scoped in `docs/presentations-template-ooxml-scope.md` (Reading A), now shipped as
backlog A43. This scope does NOT invent a parallel semantic and does NOT build the
brand-color reskin (`docs/presentations-template-dropzone-scope.md` Reading B,
withdrawn; `presentations-template-ooxml-scope.md:650`). The owner's words "use as
a template" and the shipped copy at `TemplateSelector.tsx:194-197` agree.

**The one inherited constraint the owner must know (prominent, section 9 R1):**
when the generated deck has MORE slides than the uploaded template,
`planSlideTemplateFill` REFUSES with a worded fit-report line
(`office-template-fill.ts:179-186`, `fit-report.ts:83-97`) - it does not silently
drop slides. The T3 OOXML slide-clone that would remove this limit is NOT built
(`src/lib/decks/pptx-slide-clone.ts` ABSENT; the `slide-count-clone` fit class is
defined at `fit-report.ts:31-36` but nothing produces it). So on a creation or
pipeline deck, the template path WORKS when the template has at least as many
slides as the deck, and REFUSES otherwise. This is inherited behaviour, surfaced
here, not re-scoped.

### 0.3 The forks the owner should settle (each shaped so every answer terminates)

The scope BUILDS the recommended reading of each; the alternatives are additive,
not rework. These are recommendations on open forks, not gates.

- **FORK A - the shape of the control (RECOMMEND: lean shared slot).** Reading A1
  (recommended, built here): a lean, explicit "Deck template" slot in each view -
  an "Upload .pptx template" button, the selected template's name, pick from
  already-uploaded, and Clear - reusing the ONE shared template library and the
  ONE shared selection. Full management (rename/duplicate etc.) stays on the
  PowerPoint Design tab. Reading A2: a full management surface (list + upload +
  delete + select) duplicated verbatim in both views. RECOMMEND A1
  (minimize-clicks, one library, no triplicated management UI). Cost if the owner
  wants A2: add a delete affordance to the shared control - additive, no rewiring.

- **FORK B - the pipeline auto-download when a template is selected (RECOMMEND:
  suppress auto, keep manual).** The pipeline auto-downloads the plain deck on
  completion via a CLIENT serializer (`PipelineTab.tsx:207-214`). A templated
  download is a SERVER action that can REFUSE (the slide-count limit, 0.2).
  Reading B1 (recommended, built here): when a template is selected, the
  completion auto-download is SUPPRESSED and the manual "Download" button produces
  the filled template, with a one-line notice that a template is selected so the
  download is manual. Reading B2: the auto-download itself calls the fill action
  and, on refusal, falls back to the plain deck with a notice. RECOMMEND B1 - never
  auto-fire a refusable server round-trip; it keeps the completion effect simple
  and never silently emits an un-templated file as if it were templated. Cost if
  the owner wants B2: change the completion effect to await the fill with a
  fallback - additive to the same effect.

- **FORK C - the selection key (RECOMMEND: share across all three surfaces).**
  Reading C1 (recommended, built here): reuse the shipped `ta-ppt-template-file-id`
  (`useSelectedDeckTemplateFileId`, `ppt-design/hooks.ts:132-134`) so a template
  selected on any surface is the one selection everywhere - one brand, one intent.
  Reading C2: a presentations-local key. RECOMMEND C1 (minimize-clicks; the FILE
  library is already server-side and shared regardless). Cost if wrong: switch to a
  new key literal - one line; the server-side library is unaffected.

### 0.4 The surface is a LAYER, stated

Per `AGENTS.md` ("a library and an endpoint shipped with no surface between them")
and `docs/loop/this-repo.md`: the user-reachable surface here is (a) the upload+
select CONTROL in each view and (b) the DOWNLOAD BRANCH in each view that routes to
`fillDeckTemplateFileAction` when a template is selected. The template does NOT
change generation - styling attaches at DOWNLOAD/fill, exactly as ppt-design does
(`buildOutputPptx`, `ppt-design/index.tsx:528-537`). There is no request-body change
to `/api/presentations/generate` or `/api/presentations/pipeline`. Shipping the
control without the download branch, or the branch without the control, ships the
feature dead in that view; both are named in each view's wave write set (section 5).

---

## 1. Ground-truth findings (every claim opened and quoted)

### 1.1 The three Presentations sub-views and where each produces/downloads a deck

The Presentations inner nav now has THREE children
(`src/app/components/manual/manual-rail.ts:57`):
`PresentationsView = "slide-deck" | "pipeline" | "ppt-design"`, derived from a
presence record (`:59-66`) with the guard `isPresentationsView` (`:69-70`). The
mount is a three-way under `manualView === "presentations"`
(`src/app/page.tsx:679-686`):
```
presentationsView === "ppt-design" ? <PowerPointDesignTab />
: presentationsView === "pipeline" ? <PipelineTab />
: <PresentationsTab />
```
- **slide-deck creation** = `PresentationsTab`
  (`src/app/components/presentations/index.tsx`). Generates via
  `POST /api/presentations/generate` (`:34,61-64`); the deck artifact renders in
  `ArtifactCard` (`:190-197`). Download is in `DeckArtifact.handleDownload`
  (`ArtifactCard.tsx:184-206`): `serializeDeckToPptx(deck)` then blob+anchor. NO
  template path.
- **slide-deck pipeline** = `PipelineTab`
  (`src/app/components/presentations/pipeline/PipelineTab.tsx`). The single
  serialize path `downloadDeckPptx` (`:85-99`) wraps `serializeDeckToPptx`; the
  manual button calls it (`handleDownload`, `:292-304`, wired at `:528`) and the
  completion effect auto-calls it once (`:207-214`). NO template path.
- **PowerPoint Design** = `PowerPointDesignTab`
  (`src/app/components/ppt-design/index.tsx`, 826 lines). HAS the full template UI
  and the download routing (sections 1.2, 1.3).

### 1.2 The shipped template-fill engine and server actions (REUSE verbatim)

- `src/app/actions/deck-template-files.ts` (178 lines), `"use server"`:
  `listDeckTemplateFilesAction` (`:59-76`), `uploadDeckTemplateFileAction`
  (`:79-116`), `deleteDeckTemplateFileAction` (`:119-129`),
  `fillDeckTemplateFileAction` (`:145-178`). Auth is `requireUser()` (`:85` etc.) -
  a per-user resource, not owner-only. Persistence is a real Supabase table:
  `supabase/migrations/20261021000000_create_deck_template_files.sql` (48 lines)
  exists.
- `fillDeckTemplateFileAction(templateFileId, deck)` (`:145-178`) takes a deck of
  shape `{ presentationTitle: string; slides: Array<{ title: string; bullets:
  string[] }> }` (`:147`), loads the stored template base64 (`:162`), groups its
  paragraphs by slide (`:163`), plans the fill (`:168`), and returns
  `{ base64, name }` or `{ error }` (`:170,174-176`).
- The pure engine `src/lib/decks/office-template-fill.ts` (200 lines):
  `planSlideTemplateFill` (`:179-200`) maps by position and REFUSES on a slide-count
  shortfall (`:183-186`); `fillOfficeTemplate` (`:109-122`) is the ONLY writer and
  maps over EVERY paragraph (HARD CONSTRAINT H1, `:15-26`) so untouched paragraphs
  are preserved; `applyOfficeSections` (`office-edit.ts:423`) rewrites only touched
  runs and re-emits the zip, leaving masters/layouts/theme/media byte-for-byte
  (`office-edit.ts:413-422`).

### 1.3 The download-routing precedent (REUSE as the shape for both views)

`ppt-design/index.tsx:528-537` is the exact branch this scope copies:
```
const buildOutputPptx = async (): Promise<...> => {
  if (!generatedDeck || !selected) return { error: "Generate a deck first." };
  if (selectedFileId) {                                   // a template is selected
    const result = await fillDeckTemplateFileAction(selectedFileId, {
      presentationTitle: generatedDeck.presentationTitle,
      slides: editedSlides,
    });
    if ("error" in result) return result;
    return { bytes: base64ToBytes(result.base64), name: result.name };
  }
  ... buildSlidesPptx(...)                                 // no template: from scratch
};
```
`selectedFileId` comes from `useSelectedDeckTemplateFileId`
(`ppt-design/index.tsx:127`), which is
`useLocalStorageState<string>("ta-ppt-template-file-id", "")`
(`ppt-design/hooks.ts:132-134`). The deck shape passed in (title + slides, each
with title+bullets) is exactly what the two target views already hold:
`DeckContent = GeneratedDeck = { presentationTitle, slides: PptxSlide[] }`
(`src/lib/presentations/types.ts:54`; `src/lib/decks/generate.ts:36-39`), and
`PptxSlide` carries `title` and `bullets: string[]` (`src/lib/pptx.ts:19-21`). The
mapper reads only title + bullets, so a creation/pipeline deck fills cleanly;
`PptxSlide`'s `code`/`notes`/`graphic` fields are ignored on the template path (a
fidelity note, section 9 R-RICH, mirroring the fit-report's counted-drop model).

### 1.4 CRITICAL - validation TODAY is by EXTENSION, not magic bytes (the owner's ask)

`uploadDeckTemplateFileAction` validates the filename only:
`if (!/\.pptx$/i.test(fileName.trim())) return { error: "The template must be a
PowerPoint .pptx file." };` (`deck-template-files.ts:87`). It then calls
`parseOfficeParagraphs("pptx", buffer)` (`:93`). Consequences, measured from the
code path:
- A `.docx`/`.xlsx` renamed to `.pptx` passes the extension check; it is a valid
  ZIP, so the capped open succeeds, but `parseOfficeParagraphs("pptx")` reads
  `ppt/slides/slide*.xml` (`office-edit.ts:399-409`) and finds none, returning `[]`,
  so the action rejects with "Could not read any slide text from that file..."
  (`:94-98`) - a MISLEADING message, not "that is not a PowerPoint file."
- A legacy `.ppt` (OLE compound, not a zip) renamed to `.pptx` throws inside
  `JSZip.loadAsync` (`office-edit.ts:349`) and is caught as the generic "Could not
  save the template." (`:113-114`).

So the owner's request - validate by MAGIC BYTES / OOXML signature, reject other
types with a CLEAR message - is genuinely NEW work and a real hardening. The flat
ZIP magic plus the OOXML content-type marker are what distinguish a `.pptx` from a
`.docx`/`.xlsx` (all three are PK zips) and from a `.ppt` (not a zip).

### 1.5 The capped parse already exists (CORRECTS the 2026-10-08 scope docs)

`parseOfficeParagraphs` loads through `openOfficeZip` (`office-edit.ts:348-352`),
which runs `JSZip.loadAsync(buffer)` then `assertContainerWithinCaps(zip,
"office-file")` (`:349-350`) and reads members through the bounded
`readOfficeMember` (`:355-356`). **So the zip-bomb cap IS already applied to every
template upload** (the action parses through this path at `:93`).
`docs/presentations-template-ooxml-scope.md:126,201-202` and its R-CAP assert
`office-edit.ts:349` uses "raw `JSZip.loadAsync`, NOT the capped path" - that is
STALE as of HEAD `2db21b7e`: line 349 is immediately followed by
`assertContainerWithinCaps` at 350. The capped-read gap is CLOSED. This scope does
NOT re-scope R-CAP; it records the conflict (section 10). The magic-byte validation
below is a SEPARATE concern (accept only a genuine `.pptx`), not a memory-exhaustion
cap.

### 1.6 The magic-byte precedent (REUSE the shape, not the module)

`src/lib/grade/video-magic.ts` is the in-repo precedent: a PURE, import-free,
head-only byte sniff (`sniffVideoContainer(head, extension)`, `:63-73`;
`VIDEO_HEAD_BYTES = 64`, `:17`) that decides the container from BYTES ONLY and
treats the extension as advisory. The `.pptx` sniff follows this shape but needs
two layers (flat head is not sufficient to distinguish OOXML types): a flat ZIP
magic check (pure, head-only) plus an OOXML content-type check that reads one zip
member (server-side, through the capped path). ZIP local-file-header magic is the
four bytes `50 4B 03 04` ("PK\x03\x04"); a `.ppt` (OLE) starts `D0 CF 11 E0`.

### 1.7 Persistence + budget facts

- Selection: `ta-ppt-template-file-id` via `useSelectedDeckTemplateFileId`
  (`ppt-design/hooks.ts:132-134`); this is `useLocalStorageState`, not
  `usePersistedJSON`. The creation and pipeline views both use `usePersistedJSON`
  for their own control state (`presentations/hooks.ts:25`; keys at
  `presentations/panel-logic.ts:163-165` and `PipelineTab.tsx:73-77`). Reusing the
  shipped hook keeps ONE selection across all three surfaces (FORK C1).
- Upload budget: `checkWireBudget(base64.length, "That template")` is already in
  the action (`deck-template-files.ts:89`). `UPLOAD_WIRE_BUDGET_BYTES = 3.5MB`
  (`upload-budget.ts:41`); `maxFileBytesForWireBudget` ~= 2.6MB on disk
  (`upload-budget.ts:65`, 3.5MB / (4/3)). So a template larger than ~2.6MB on disk
  is refused at upload with a worded size message; an image-heavy master could
  exceed it (owner-walk, section 9 R-WIRE).
- The file leaves the browser once at upload (base64 to the server action,
  persisted server-side); the download POSTs only the templateFileId + the small
  deck JSON and receives the filled base64 as a server-action RETURN (not a request
  body), so the 4.5MB request cap does not bind the output (`upload-budget.ts:38`).

---

## 2. Acceptance criteria (owner words -> checkable)

Each pass condition names the OBJECT under comparison, the INSTRUMENT, and the
DIRECTION of failure. "Owner-walk" marks a claim no instrument here can compute
because no component renders and the network is blocked
(`docs/loop/this-repo.md`, section 6; `vitest.setup.ts`).

- **AC-1 (dedicated control in the CREATION view).** On the slide-deck creation
  view (`PresentationsTab`), there is a clearly labelled, dedicated "Deck template"
  control, separate from the sources input (`SourcesEditor`,
  `presentations/index.tsx:148-153`). A `.pptx` placed there becomes the TEMPLATE,
  never a text source. Object: the control's handler. Instrument: source-text
  wiring pin (I-WIRE-CREATE) that the control calls `uploadDeckTemplateFileAction`
  and never `extractDeckSourceFileAction`/the sources path; render is owner-walk
  (R2). Direction: RED if the template drop reaches the sources path, or the
  control is absent.
- **AC-2 (dedicated control in the PIPELINE view).** Same control, same contract,
  on `PipelineTab`. Object/instrument/direction as AC-1 (I-WIRE-PIPE). Render is
  owner-walk (R2).
- **AC-3 (accept ONLY `.pptx` by magic bytes, reject others with a clear message).**
  A `.pptx` is accepted; a `.ppt` (legacy binary), a `.docx`/`.xlsx` (other OOXML),
  and a non-Office ZIP renamed to `.pptx` are each REJECTED with a worded message
  distinguishing "not a PowerPoint/zip file" from "that is a different Office
  file." Object: the pure sniff `sniffZipHead` + `isPptxContentTypes`
  (`pptx-signature.ts`) and the server assertion `assertPptxContainer`
  (`pptx-validate.ts`). Instrument: unit tests over fixtures (I-ACCEPT). Direction:
  RED if any non-`.pptx` is accepted, if a real `.pptx` is rejected, or if the
  message does not distinguish the two failure classes.
- **AC-4 (the download produces the TEMPLATE in each view - the earned mechanism).**
  After selecting a template, the deck the user DOWNLOADS from the creation view
  and from the pipeline view is the template's own file with generated content
  placed into its slides - masters, layouts, theme and logos preserved. Object:
  the view's download plan + the fill engine output. Instrument: the pure download
  plan `chooseDeckDownloadPlan(templateFileId)` (I-PLAN, removal test, section 3)
  plus the engine-level preserve assertion (I-PRESERVE) driving
  `fillOfficeTemplate` over a fixture template, unzipping and asserting the
  template's `ppt/slideMasters/*`, `ppt/slideLayouts/*`, `ppt/theme/*` parts are
  present and byte-identical. Direction: RED if the plan does not route to the fill
  path when a template is set, or if the filled output loses the template's design
  parts. The actual rendered fidelity is owner-walk (R-FIDELITY).
- **AC-5 (deck longer than the template refuses, never drops slides).** When the
  generated deck needs more slides than the template, the download REFUSES with the
  shipped worded fit-report line - it does not silently truncate. Object:
  `planSlideTemplateFill` over (template T slides, deck M slides, M > T).
  Instrument: the EXISTING `office-template-fill.test.ts` refusal coverage (run to
  confirm no drift) plus a view-level pin that the download surfaces the returned
  error (I-REFUSE). Direction: RED if M > T produces a file with < M slides or the
  refusal message is swallowed.
- **AC-6 (selection persists; nothing stranded).** The selected template survives a
  reload via a `ta-` key, and clearing it returns to the plain (own-design)
  download. Object: the selection key round-trip. Instrument: source-text pin that
  the key literal (`ta-ppt-template-file-id`, FORK C1) is read/written via the
  shipped hook (I-PERSIST); clearing costs at most one plain download, never a
  crash (persist-ui-control-state). Direction: RED if the key is absent or a cleared
  selection rehydrates as present.
- **AC-7 (pipeline auto-download behaviour with a template, FORK B1).** When a
  template is selected on the pipeline view, the completion AUTO-download is
  suppressed and the manual Download applies the template; a one-line notice states
  this. When no template is selected, the shipped auto-download is unchanged.
  Object: the completion gate (`shouldAutoDownloadDeck` plus the template-selected
  condition). Instrument: a unit test on the gate (I-AUTOGATE) plus a source-text
  pin that the effect skips when a template is selected; the actual fire/no-fire is
  owner-walk (R1b). Direction: RED if the auto-download fires an un-templated file
  while a template is selected.
- **AC-8 (no new endpoint; reuse the shipped actions).** Upload/list/delete/fill
  all reuse `deck-template-files.ts`; no new route or `"use server"` export is
  added. Object: the action imports in the control and each download branch.
  Instrument: source-text pin (I-NOEDIT-ENDPOINT) + `guard-overtightening.test.ts`
  staying green (no new action). Direction: RED if a new endpoint appears or the
  guard's frozen set changes.
- **AC-9 (ppt-design upload unbroken by the shared validation).** Hardening the
  shared `uploadDeckTemplateFileAction` with magic bytes still accepts a genuine
  `.pptx` on the PowerPoint Design tab. Object: the action's happy path. Instrument:
  the W1 action test accepting a valid-pptx fixture (I-ACCEPT positive) + the
  REGRESSION baseline of ppt-design upload (section 8). Direction: RED if a valid
  `.pptx` is newly refused.

---

## 3. Leverage claim (one paragraph + one removal-test criterion)

Class: **GUARANTEED / FIDELITY-PRESERVE** (`docs/loop/leverage.md:44`;
`presentations-template-ooxml-scope.md:132-148` proposed the FIDELITY-PRESERVE
row). Mechanism, EARNED by this feature: a deck generated by the CREATION or
PIPELINE flow is emitted as the user's own uploaded `.pptx` - its authored masters,
layouts, theme and logo preserved by construction (`applyOfficeSections` touches
only run text, `office-edit.ts:413-422`) - which was IMPOSSIBLE from these two
generators before, because neither view had any template path (section 0.1). What
the user does instead today: either accept the app's from-scratch navy deck, or
switch to the PowerPoint Design tab's DIFFERENT builder and re-drive generation
there. A chat cannot emit a `.pptx` at all, let alone one that inherits a specific
uploaded deck's design. The PRESERVATION mechanism itself is INHERITED from the
shipped engine (stated honestly, not claimed as this feature's own); what this
feature earns is making it REACHABLE from the two named generators. Honest bound:
auto-download in the pipeline stays plain (FORK B1), and the magic-byte gate is a
correctness hardening, not a chat-advantage in itself.

**Removal test (one criterion, machine-buildable here, = the I-PLAN half of AC-4).**
Object: the pure `chooseDeckDownloadPlan(templateFileId: string): "template" |
"own"` (mirroring ppt-design's `if (selectedFileId)` branch,
`ppt-design/index.tsx:530`). Delete the branch so it always returns `"own"`; the
assertion that `chooseDeckDownloadPlan("some-id") === "template"` flips RED, and the
paired source-text pin that the `"template"` plan calls `fillDeckTemplateFileAction`
goes unsatisfiable. Trace: with the branch deleted, both views' download falls back
to `serializeDeckToPptx` -> a from-scratch navy deck -> the template's design parts
are absent -> the feature's earned advantage is gone. Buildable (pure function +
source-text), no render. The engine-level I-PRESERVE (template design parts
byte-identical) is the inherited half and is pinned by driving `fillOfficeTemplate`
over an in-test fixture `.pptx` (the production path's pure middle; the action is
I/O only).

---

## 4. Mechanisms (the SHAPE each wave builds against)

### 4.1 Magic-byte validation (W1)

Two new modules, no edit to the 792-line shared `office-edit.ts`:

- `src/lib/decks/pptx-signature.ts` - PURE, import-free (video-magic shape):
  - `PPTX_HEAD_BYTES = 4`; `sniffZipHead(head: Uint8Array): boolean` - true iff
    the first four bytes are `0x50 0x4B 0x03 0x04`. Rejects OLE `.ppt`
    (`0xD0 0xCF 0x11 0xE0`) and non-zip binaries.
  - `isPptxContentTypes(contentTypesXml: string): boolean` - true iff the XML
    declares the presentation main-part content type
    `application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml`
    (an `<Override ... ContentType="...presentationml.presentation.main+xml"/>`).
    False for `wordprocessingml`/`spreadsheetml` (so `.docx`/`.xlsx` are rejected).
    Decision for the owner to confirm, built permissively here: also accept the
    slideshow (`...slideshow.main+xml`, `.ppsx`) and template (`...template.main
    +xml`, `.potx`) main-part types, since the fill engine reads slides either way;
    recorded as R-POTX if the owner wants `.pptx` only.
- `src/lib/decks/pptx-validate.ts` - SERVER-ONLY, imports the capped primitives
  from `@/lib/zip-caps` and the pure checks from `pptx-signature.ts`:
  - `assertPptxContainer(buffer: Buffer): Promise<void>` - `sniffZipHead` on the
    head (throws a worded Error "That is not a PowerPoint (.pptx) file." on
    failure), then `JSZip.loadAsync` + `assertContainerWithinCaps(zip,
    "office-file")` (the shipped `openOfficeZip` pattern, `office-edit.ts:348-352`)
    + `readOfficeMember` the `[Content_Types].xml` member + `isPptxContentTypes`
    (throws "That looks like a different Office file (Word or Excel), not a
    PowerPoint .pptx." on failure). This is the one place the content-type is
    asserted; it does NOT duplicate the engine's later parse.
- EDIT `src/app/actions/deck-template-files.ts`: in `uploadDeckTemplateFileAction`,
  after `checkWireBudget` (`:89`) and before `parseOfficeParagraphs` (`:93`), call
  `await assertPptxContainer(buffer)` inside the try, mapping its thrown message to
  the returned `{ error }`. The extension check at `:87` STAYS (cheap first filter);
  the magic-byte assertion is the authoritative boundary. No new export - the guard
  ratchet's frozen set for this file (`guard-overtightening.test.ts:184-196`) is
  unchanged (AC-8).

Client pre-check (W2/W3, UX only): the control reads the first `PPTX_HEAD_BYTES`
via `file.slice(0, 4).arrayBuffer()` and refuses a non-zip head before uploading,
for fast feedback. The server assertion remains authoritative.

### 4.2 The shared control + the download branch (W2 creation, W3 pipeline)

- NEW `src/app/components/presentations/DeckTemplatePicker.tsx` - the lean shared
  slot (FORK A1): an "Upload .pptx template" button (hidden `<input accept=".pptx,
  application/vnd.openxmlformats-officedocument.presentationml.presentation">`, the
  `TemplateSelector.tsx:210-220` idiom; base64 via the `readFileAsBase64` idiom,
  `SourcesEditor.tsx:64-75`), the selected template's name, a pick-from-uploaded
  list (`listDeckTemplateFilesAction`), and a Clear ("Use the deck's own design
  instead", `TemplateSelector.tsx:242-244`). States: empty, uploading, selected,
  error (worded refusal). It takes the selected id + setter as props so each view
  owns the shared-hook wiring. No business logic beyond calling the shipped actions.
- NEW pure seam in `src/app/components/presentations/panel-logic.ts`:
  `chooseDeckDownloadPlan(templateFileId: string): "template" | "own"` = the
  removal-test object (section 3). Keeps the branch testable out of the `.tsx`.
- CREATION (W2): EDIT `presentations/index.tsx` to mount `DeckTemplatePicker` near
  Generate, hold the shared selection via `useSelectedDeckTemplateFileId`
  (`ppt-design/hooks.ts`), and pass `templateFileId` to each `ArtifactCard`. EDIT
  `ArtifactCard.tsx` so `DeckArtifact` takes `templateFileId?: string` and
  `handleDownload` branches on `chooseDeckDownloadPlan`: `"template"` ->
  `fillDeckTemplateFileAction(templateFileId, { presentationTitle, slides })` ->
  download its base64 (surface `{ error }` inline); `"own"` -> the existing
  `serializeDeckToPptx` path UNCHANGED.
- PIPELINE (W3): EDIT `PipelineTab.tsx` to mount `DeckTemplatePicker` (reuse the
  shared hook), branch `handleDownload` identically, and - FORK B1 - SKIP the
  completion auto-download when a template is selected (gate the effect at
  `:207-214` on `chooseDeckDownloadPlan(templateFileId) === "own"`), with a one-line
  notice. EDIT `pipeline/panel-logic.ts` only if a pure helper is lifted (e.g. reuse
  `chooseDeckDownloadPlan` imported from the parent, or a pipeline-local gate
  combining it with `shouldAutoDownloadDeck`). Preserve the shipped auto-download
  machinery when no template is set (the pins at `pipeline/panel-logic.test.ts` for
  `shouldAutoDownloadDeck`/`downloadDeckPptx` must stay green).

---

## 5. Wave plan + write sets + frozen instruments

Three waves. Every multi-file gate uses `npm run test:paths <p1> <p2> ...`, never a
raw multi-path `vitest`/`npm test` (which silently drops unmatched args,
`docs/loop/this-repo.md:52-66`; test-paths memory). The repo-wide unconditional
canaries run in every wave gate: `src/file-size-ceiling.structure.test.ts`,
`src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts`; plus
`npx tsc --noEmit` (ONE caller - never concurrent), `npm run lint` (exit 0, no NEW
warning in files the wave writes), `npm run build` compile-line only; and
`git status --short` against the exact write set with no `.claude/worktrees` copy
edited (stale-worktree memory). Measured sizes (section 7) are all far under 1000.

### Wave W1 - magic-byte validation (independent; hardens ppt-design too)

**Write set (new + edit):**
- NEW `src/lib/decks/pptx-signature.ts` (pure sniff + content-type check).
- NEW `src/lib/decks/pptx-validate.ts` (server `assertPptxContainer` via zip-caps).
- EDIT `src/app/actions/deck-template-files.ts` - call `assertPptxContainer` in
  `uploadDeckTemplateFileAction` (section 4.1).
- NEW `src/lib/decks/pptx-signature.test.ts` (I-ACCEPT: head sniff + content-type
  over `.pptx`/`.docx`/`.xlsx`/`.ppt`/renamed-zip fixtures).
- NEW `src/app/actions/deck-template-files.test.ts` (NONE exists today, section 6):
  the action's accept (valid pptx), reject (magic-byte failure), and size-refusal
  shapes - mock the Supabase client and the extractor boundary; do NOT mock `fetch`
  (the validation never touches it; tests-are-network-blocked).

Caller rule: `assertPptxContainer` is called by the action in this wave;
`sniffZipHead`/`isPptxContentTypes` are called by `assertPptxContainer` and their
own tests - no export ships dead.

**Frozen tests that must stay green (object / instrument / direction):**
- `src/app/actions/guard-overtightening.test.ts:184-196` - Object: the frozen
  allowlist for `actions/deck-template-files.ts`. Instrument: the ratchet. Direction:
  this wave adds NO new `"use server"` export, so the frozen set is UNCHANGED; RED
  if a new action is added without a frozen-set bump. Run it.
- `src/lib/office-edit.test.ts`, `src/lib/office-edit.zip-caps.test.ts` - read
  `office-edit.ts` as source; this wave does NOT edit `office-edit.ts`, so they are
  checked-safe. Run to confirm no drift.

**Gate:** `npm run test:paths src/lib/decks/pptx-signature.test.ts
src/app/actions/deck-template-files.test.ts
src/lib/office-edit.zip-caps.test.ts` plus the unconditional canaries, tsc, lint,
build-compile-line.

**SHARED-FILE NOTE:** `deck-template-files.ts` is called by ppt-design's
`buildOutputPptx` (`ppt-design/index.tsx:531`). The change only ADDS a rejection
before the parse; it cannot change the happy path. Baseline ppt-design upload
(section 8) and keep AC-9 green.

### Wave W2 - shared control + CREATION view wiring (depends on nothing; W3 depends on it)

**Write set:**
- NEW `src/app/components/presentations/DeckTemplatePicker.tsx` (the shared slot).
- EDIT `src/app/components/presentations/panel-logic.ts` - add
  `chooseDeckDownloadPlan`.
- EDIT `src/app/components/presentations/index.tsx` - mount the picker, hold the
  shared selection, pass `templateFileId` down.
- EDIT `src/app/components/presentations/ArtifactCard.tsx` - `DeckArtifact` takes
  `templateFileId`; `handleDownload` branches (section 4.2).
- EDIT `src/app/components/presentations/panel-logic.test.ts` - add
  `chooseDeckDownloadPlan` unit + the I-PLAN removal test; keep the existing
  `deckDownloadFilename` block (`:171-184`) unchanged.
- NEW `src/app/components/presentations/template-picker.wiring.test.ts` - I-WIRE-CREATE
  (source-text over `DeckTemplatePicker.tsx` + `ArtifactCard.tsx`): the picker calls
  `uploadDeckTemplateFileAction`/`listDeckTemplateFilesAction`, never
  `extractDeckSourceFileAction`; the download branches to `fillDeckTemplateFileAction`
  under the `"template"` plan. Pin the fact and the ordering, never the spelling
  (source-text-tests-overspecify memory).
- NEW `src/app/components/presentations/presentations-template-fill.test.ts` -
  I-PRESERVE + I-CONTENT + I-REFUSE by driving `fillOfficeTemplate` /
  `planSlideTemplateFill` over an in-test fixture `.pptx` (the production middle;
  reuse `office-template-fill.test.ts`'s fixture-building idiom; do NOT import a
  helper across `*.test.ts` - duplicate it, no-cross-test-file-imports memory). If
  `office-template-fill.test.ts` already pins preserve+refuse adequately, cite it
  and keep this file to the view-level routing only.

**Gate:** `npm run test:paths
src/app/components/presentations/panel-logic.test.ts
src/app/components/presentations/template-picker.wiring.test.ts
src/app/components/presentations/presentations-template-fill.test.ts` plus canaries,
tsc, lint, build-compile-line.

### Wave W3 - PIPELINE view wiring (depends on W2's shared control)

**Write set:**
- EDIT `src/app/components/presentations/pipeline/PipelineTab.tsx` - mount the
  shared `DeckTemplatePicker`; branch `handleDownload`; gate the completion
  auto-download on no-template (FORK B1); add the one-line notice.
- EDIT `src/app/components/presentations/pipeline/panel-logic.ts` - only if a pure
  gate helper is lifted here (otherwise import `chooseDeckDownloadPlan` from the
  parent `panel-logic.ts`); keep `shouldAutoDownloadDeck`/`downloadDeckPptx`
  intact.
- EDIT `src/app/components/presentations/pipeline/panel-logic.test.ts` - add
  I-WIRE-PIPE (source-text over `PipelineTab.tsx`: download branches to the fill
  action; the auto-download effect skips when a template is selected) and
  I-AUTOGATE (the gate unit). PRESERVE the shipped auto-download pins
  (`shouldAutoDownloadDeck`, `downloadDeckPptx` count, `serializeDeckToPptx`
  once) - do NOT edit them; they must stay green.

**Frozen tests that must stay green:** the pipeline auto-download + regen source-text
pins in `pipeline/panel-logic.test.ts` (the regen subview SHIPPED -
`SlideRegenView.tsx` exists, `PipelineTab.tsx:70,77`); this wave adds a template
branch and an auto-download GATE, removing nothing. Direction: RED if a pin for
`downloadDeckPptx`/`serializeDeckToPptx`/`shouldAutoDownloadDeck` goes red.

**Gate:** `npm run test:paths
src/app/components/presentations/pipeline/panel-logic.test.ts
src/app/api/presentations/pipeline/route.test.ts` plus canaries, tsc, lint,
build-compile-line. (`route.test.ts` run to confirm no wire drift; the route is
unchanged.)

### What is machine-checkable vs owner-walk

- **Machine:** `sniffZipHead`, `isPptxContentTypes`, `assertPptxContainer`
  (accept/reject), `chooseDeckDownloadPlan` (the removal test), the engine preserve/
  content/refuse via `fillOfficeTemplate`, the auto-download gate, and every
  source-text wiring pin (control reaches the actions in BOTH views; download
  branches to fill; auto-download skips on template; selection key present).
- **Owner-walk (no render, no network, no real PowerPoint here,
  `docs/loop/this-repo.md` section 6):** the control actually renders and accepts a
  drop (R2); the filled deck visibly uses the template's masters/layout/logo
  (R-FIDELITY); the pipeline auto-download fire/no-fire (R1b); a real image-heavy
  template vs the wire budget (R-WIRE).

---

## 6. Serialization + collision flags + owns list

### 6.1 In-flight collisions

- **`deck-template-files.ts` is SHARED.** W1 edits it; it is also called by
  ppt-design (`ppt-design/index.tsx:531`) and is the file TEMPLATE-A W2 (the T3
  slide-clone, `presentations-template-ooxml-scope.md:508-510`) would edit. T3 is
  NOT built (`src/lib/decks/pptx-slide-clone.ts` ABSENT). If the orchestrator
  dispatches T3 concurrently, W1 and T3 SERIALIZE on `deck-template-files.ts` (and
  on `office-template-fill.ts`, which W1 does not touch but T3 does) - they must not
  run in the same concurrency window. Flag, not block.
- **`PipelineTab.tsx`** was last restructured by the shipped regen subview
  (reading B, `SlideRegenView.tsx` present). W3 rebases onto the current 654-line
  file; no live collision, but confirm the auto-download block is at `:207-214` at
  build time (it may have moved).
- **TOOLS-IA / fold items:** the ppt-design fold has SHIPPED
  (`manual-rail.ts:57,194`; `page.tsx:681-686`; `src/lib/ppt-view-migration.ts`
  present). This scope touches NO IA file (`manual-rail.ts`, `url-state.ts`,
  `page.tsx`, `useAppNavigation.ts`) - it adds controls inside two existing
  sub-views and hardens one action. Disjoint from any future IA work.
- **Shared singletons:** `npx tsc --noEmit` has one caller (races on
  `tsconfig.tsbuildinfo`); no two of W1/W2/W3 (or a sibling scope's wave) run it
  concurrently. `docs/BACKLOG.md` is a file like any other under concurrency.
- **Within this item:** W2 before W3 (W3 imports W2's `DeckTemplatePicker`). W1 is
  file-disjoint from W2/W3 and may run first or in parallel with W2, subject to the
  tsc singleton.

### 6.2 owns file list (a FLOOR, `traps-spec.md:30-34`; the implementer re-derives)

Files this item EDITS:
```
src/app/actions/deck-template-files.ts                               (W1)
src/app/components/presentations/panel-logic.ts                      (W2)
src/app/components/presentations/index.tsx                           (W2)
src/app/components/presentations/ArtifactCard.tsx                    (W2)
src/app/components/presentations/pipeline/PipelineTab.tsx            (W3)
src/app/components/presentations/pipeline/panel-logic.ts             (W3, maybe)
```
Files that READ the edited files as source text / import them, derived with
`grep -rln "deck-template-files\|fillDeckTemplateFileAction\|uploadDeckTemplateFileAction\|ArtifactCard\|presentations/panel-logic\|PipelineTab\|chooseDeckDownloadPlan" src --include=*.ts --include=*.tsx`
(pasted, classified):
```
src/app/actions/guard-overtightening.test.ts          -> OWNED-ADJACENT: pins deck-template-files.ts "use server" exports; run in W1 (must stay green, no new export).
src/app/components/ppt-design/index.tsx               -> ADOPTED: calls fillDeckTemplateFileAction + uploadDeckTemplateFileAction; W1 must not change their happy-path contract. Baseline (section 8).
src/app/components/ppt-design/TemplateSelector.tsx    -> ADOPTED: the ppt-design upload UI; unchanged; read-only here.
src/app/components/presentations/panel-logic.test.ts  -> OWNED (W2): edited for chooseDeckDownloadPlan + removal test.
src/app/components/presentations/pipeline/panel-logic.test.ts -> OWNED (W3): edited for the pipeline pins.
src/lib/decks/office-template-fill.test.ts            -> CHECKED-SAFE: engine unchanged; run to confirm the refusal/preserve pins hold.
src/lib/office-edit.test.ts, office-edit.zip-caps.test.ts -> CHECKED-SAFE: office-edit.ts not edited; run in W1.
src/lib/presentations/deck-file.test.ts               -> CHECKED-SAFE: serializer unchanged; run.
src/app/api/presentations/pipeline/route.test.ts      -> CHECKED-SAFE: route unchanged; run in W3.
```
No `*.structure.test.ts` enumerates the presentations/pipeline `ta-` keys that this
item adds (none - it reuses the shipped `ta-ppt-template-file-id`), so no frozen key
list needs a bump. The implementer MUST re-run this grep and report what the floor
missed.

---

## 7. Measured sizes (command + output)

`wc -l < <file>` (Bash), equal to `@(Get-Content).Count` here
(`docs/loop/this-repo.md:184-195`), 2026-10-11 at HEAD `2db21b7e`:
```
178  src/app/actions/deck-template-files.ts
200  src/lib/decks/office-template-fill.ts
792  src/lib/office-edit.ts          (NOT edited)
596  src/lib/zip-caps.ts             (NOT edited)
202  src/app/components/presentations/index.tsx
226  src/app/components/presentations/ArtifactCard.tsx
283  src/app/components/presentations/panel-logic.ts
654  src/app/components/presentations/pipeline/PipelineTab.tsx
370  src/app/components/presentations/pipeline/panel-logic.ts
265  src/app/components/ppt-design/TemplateSelector.tsx   (NOT edited)
826  src/app/components/ppt-design/index.tsx              (NOT edited)
```
All edited files are far below the 1000-line ceiling. W1 adds ~15-30 lines to
`deck-template-files.ts`; W2/W3 each add ~30-60 across their files plus the new
`DeckTemplatePicker.tsx` (~120-180 lines, under 1000) and the new leaves
(`pptx-signature.ts` ~40, `pptx-validate.ts` ~30). Re-measure `PipelineTab.tsx`
with `@(Get-Content src/app/components/presentations/pipeline/PipelineTab.tsx).Count`
at the W3 gate.

---

## 8. Baseline before build (REGRESSION)

Before W1/W2/W3 hand-off, record in `docs/REGRESSION.md` (check with `grep -a`
first; A43/template coverage may partly exist): the CURRENT behaviour of (a) the
ppt-design template upload + fill + slide-count refusal, since W1 edits the shared
action and W2/W3 reuse the shared selection; and (b) the two target views'
CURRENT download (plain `serializeDeckToPptx`, no template) so the added branch is a
measurable delta. W1 must keep ppt-design's upload happy path green (AC-9).

---

## 9. Residual register (residual / owner / instrument / measuring step)

Each must be filed in `docs/BACKLOG.md` by the orchestrator to exist; missing an
owner, an instrument, or a step, it is a deletion.

- **R-FORK-A/B/C - the three product forks (section 0.3).** Owner: repo owner.
  Instrument: the owner's answers. Step: the scope BUILDS A1 + B1 + C1; each
  alternative is additive. File as the fork note on the PPT-TEMPLATE-UPLOAD-PLACE
  row with A1/B1/C1 as the started readings.
- **R1 - deck longer than template REFUSES (inherited slide-count limit, 0.2).**
  Owner: repo owner (does the refusal suffice, or is T3 wanted). Instrument:
  `office-template-fill.test.ts` refusal coverage + I-REFUSE. Step: the T3
  slide-clone is backlog A43's own follow-up; this item inherits the refusal.
- **R1b - pipeline auto-download fire/no-fire with a template (FORK B1).** Owner:
  repo owner (owner-walk). Instrument: manual walk - select a template, run the
  pipeline to completion, confirm no auto-download and the manual Download applies
  the template. Step: owner review of the W3 diff in the app.
- **R2 - the control renders and accepts a drop in BOTH views.** Owner: repo owner
  (owner-walk; no render here). Instrument: visual walk. Step: owner review of the
  W2 and W3 diffs.
- **R-FIDELITY - the filled deck visibly uses the template's design in real
  PowerPoint.** Owner: repo owner (owner-walk; this environment renders/opens no
  `.pptx`). Instrument: open the downloaded `.pptx`. Step: after W2 and W3.
- **R-WIRE - an image-heavy template exceeds the ~2.6MB-on-disk wire budget.**
  Owner: repo owner (owner-walk). Instrument: drop a large template, expect the
  worded size refusal. Step: after W2. Raising it needs the Storage transport, a
  re-scope.
- **R-RICH - a deck slide's code/graphic is dropped on the template path** (the
  mapper reads title + bullets only, section 1.3). Owner: repo owner. Instrument:
  an unzip-assert that a code/graphic shape is emitted. Step: own item (adjacent to
  A43 R-RICH).
- **R-POTX - `.potx`/`.ppsx` acceptance.** Owner: repo owner. Instrument: I-ACCEPT
  extended. Step: one-line change to `isPptxContentTypes`'s accepted main-part set
  (section 4.1) if the owner wants `.pptx` only (or wants `.potx` too).
- **R-SHAREKEY - the selection is SHARED with ppt-design (FORK C1).** Owner: repo
  owner. Instrument: I-PERSIST + a note of the cross-surface coupling. Step: switch
  to a presentations-local key if the shared selection surprises.
- **R-CONSOLIDATE - three surfaces now carry a template control for one library.**
  Owner: repo owner. Instrument: the three mount sites. Step: a later UX pass may
  unify; out of scope here, and the owner explicitly asked for the control in the
  two deck-producing views.

---

## 10. Conflicts with prior scope docs (measured, not adopted silently)

The five 2026-10-08 scope docs are decision records, not the tree. Measured
conflicts at HEAD `2db21b7e`:

- `presentations-template-ooxml-scope.md:126,201-202` / R-CAP: asserts the shipped
  engine uses raw `JSZip.loadAsync` and lacks the capped pre-flight. STALE - the
  capped pre-flight is applied at `office-edit.ts:348-352` (`openOfficeZip` ->
  `assertContainerWithinCaps`), reached by every template upload via
  `parseOfficeParagraphs`. The zip-bomb cap is CLOSED; the owner's magic-byte ask is
  a distinct accept-only-pptx concern, scoped above.
- `presentations-template-ooxml-scope.md` W1 ("add a `TemplateFilePicker.tsx` to the
  Slide Deck sub-view") was recorded as SUPERSEDED by the ppt-design fold (A2,
  `ppt-design-into-presentations-scope.md:34-48`). The owner's 2026-10-11 request
  REVIVES that surfacing and EXTENDS it to the pipeline view too - the fold (reach
  template-fill via a separate tab) was the loop's reading; the owner now wants the
  control in the two deck-producing views. This scope does not remove the
  PowerPoint Design tab; it adds controls to the other two views and notes the
  three-surface consolidation (R-CONSOLIDATE).
- `presentations-template-dropzone-scope.md` (Reading B, brand-color reskin) is
  WITHDRAWN (`presentations-template-ooxml-scope.md:650`); this scope does NOT build
  it. "Template" = content-into-template (A43), the shipped semantic.

---

## 11. Dispatch list for the orchestrator

1. Put FORK A/B/C to the owner WHILE A1/B1/C1 proceed; do not gate (the scope is
   written for A1+B1+C1). Record them against the PPT-TEMPLATE-UPLOAD-PLACE row.
2. Fresh `loop-checker` on THIS scope before any seat consumes it, plus a security
   pass on the upload. Challenge hardest: (a) that `assertPptxContainer`'s
   content-type check truly distinguishes `.pptx` from `.docx`/`.xlsx` (re-open a
   real `[Content_Types].xml` and confirm the main-part Override string); (b) that
   driving `fillOfficeTemplate` under node vitest preserves the template's
   master/layout/theme parts byte-for-byte for I-PRESERVE (re-open
   `office-edit.ts:413-422` and `office-template-fill.test.ts`); (c) that adding the
   magic-byte call to `uploadDeckTemplateFileAction` adds NO `"use server"` export,
   so `guard-overtightening.test.ts:184-196` stays green; (d) that the shared
   selection key C1 has no stranded-key or cross-surface hazard with ppt-design.
3. After the check clears: `loop-test-author` for I-ACCEPT / I-PLAN / I-PRESERVE /
   I-CONTENT / I-REFUSE / I-AUTOGATE / the wiring pins + the sabotage list
   (delete the download branch -> I-PLAN RED; delete the sniff -> a `.docx` is
   accepted), alongside a `loop-seat` security pass (untrusted `.pptx` parse, the
   magic-byte boundary) - both consume this doc.
4. Build W1 (verify, push), then W2 (verify, push), then W3 (verify, push). W2
   before W3 (component dependency). W1 is file-disjoint and may lead or run
   parallel to W2 subject to the tsc singleton; serialize W1 against TEMPLATE-A T3
   if that is dispatched (both edit `deck-template-files.ts`).
5. File R-FORK-A/B/C, R1, R1b, R2, R-FIDELITY, R-WIRE, R-RICH, R-POTX, R-SHAREKEY,
   R-CONSOLIDATE as backlog rows; bump the row count per row.
