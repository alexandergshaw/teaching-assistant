# Presentations template, Reading A (OOXML content-into-template) - acceptance criteria + scope

Status: SCOPE ONLY, written 2026-10-08 against HEAD `d12b5820` (`git rev-parse
--short HEAD`). No production code and no test code was written. Every quantity
names the command that produced it; every `file:line` cited was opened while
writing this. This supersedes the build of the sibling B scope
(`docs/presentations-template-dropzone-scope.md`) - see section 10 for the
disposition table.

Owner decision (direct, 2026-10-08): for "drop a ppt to use as a template," the
owner chose **Reading A** - PLACE the app's generated content INTO the actual
dropped `.pptx`, keeping its masters/layouts/logos - over Reading B (brand-color
reskin). The brief framed A as "the large, OOXML-level build the earlier scope
deferred as the fork."

---

## 0. Executive summary - READ THIS FIRST (the premise has moved)

**Reading A is NOT a from-scratch build. Its core engine is already SHIPPED and
reachable in this tree - on the `ppt-design` view, not on the `presentations`
view the owner is looking at.** The B scope concluded "A is infeasible with
`pptxgenjs` ... needs raw OOXML manipulation and is unverifiable here"
(`docs/presentations-template-dropzone-scope.md:30-32,151-153`). That conclusion
was measured against `pptxgenjs` ONLY and missed two shipped modules that already
do exactly Reading A by hand-editing the `.pptx` zip's XML:

- **`src/lib/office-edit.ts`** (755 lines, `@(Get-Content).Count`) - a shipped
  jszip OOXML editor for `.docx`/`.pptx` that rewrites a slide's text runs IN
  PLACE and leaves "the original formatting, images, or layout" byte-for-byte
  (`office-edit.ts:3-15`). `applyOfficeSections` (`:393-457`) loads the zip,
  replaces only the touched paragraphs, and re-emits via
  `zip.generateAsync({ type: "nodebuffer" })` (`:456`). `setDocxTitle`
  (`:679-724`) already demonstrates the add-a-part pattern: write a new part,
  register an `<Override>` in `[Content_Types].xml` (`:706-709`) and a
  `<Relationship>` in `_rels/.rels` (`:713-718`).
- **`src/lib/decks/office-template-fill.ts`** (200 lines) - the pure engine that
  maps a `GeneratedDeck`'s slides onto an uploaded template's OWN paragraphs by
  position (title paragraph <- deck title, remaining paragraphs <- bullets:
  `planSlideTemplateFill`, `:179-200`) and writes them back under
  `applyOfficeSections`'s byte-for-byte contract (`fillOfficeTemplate`,
  `:109-122`). HARD CONSTRAINT H1 (`:15-26`) makes it impossible to
  accidentally delete an untouched paragraph.
- **`src/app/actions/deck-template-files.ts`** (178 lines) - the server actions,
  with templates PERSISTED to a real Supabase table
  (`supabase/migrations/20261021000000_create_deck_template_files.sql` exists).
  `uploadDeckTemplateFileAction` (`:79-116`), `listDeckTemplateFilesAction`
  (`:59-76`), `deleteDeckTemplateFileAction` (`:119-129`),
  `fillDeckTemplateFileAction` (`:145-178`).
- **The UI is live** on `ppt-design`: `TemplateSelector.tsx:180-262` renders a
  "Your PowerPoint templates" section - "Upload your own .pptx. Generated
  content is written into its existing slides and formatting - nothing else in
  the file changes" (`:194-197`) - with upload/select/delete and a "Use the
  deck's own design instead" toggle (`:242-244`). `ppt-design/index.tsx`'s
  `buildOutputPptx` (`:527-556`) routes a download to
  `fillDeckTemplateFileAction` when a template file is selected (`:530-535`).

So Reading A, measured in the tree, is **built, persisted, and reachable** - just
not on the `presentations` view. There are two separate presentation surfaces
(`page.tsx`): `manualView === "presentations"` renders
`presentationsView === "pipeline" ? <PipelineTab /> : <PresentationsTab />`
(`page.tsx:684-686`), and `manualView === "ppt-design"` renders a different deck
builder (`page.tsx:663`). The template-fill lives on `ppt-design`
(`page.tsx:663`); the owner's "presentations page" is `PresentationsTab`
(`src/app/components/presentations/index.tsx`), which has no template affordance.

**What is genuinely NOT built - the one real remaining OOXML build.** When the
generated deck needs MORE slides than the uploaded template has,
`planSlideTemplateFill` REFUSES (`office-template-fill.ts:183-186` ->
`buildSlideCountAdjustment`, `fit-report.ts:83-97`: "Your template has N slides
and this deck needs M. Pick a shorter shape or a longer template."). The writer
"has no way to add a slide" (`fit-report.ts:80`, pointing at
`office-edit.ts:383-392`). The `slide-count-clone` fit-report class is already
DEFINED and described (`fit-report.ts:31-36,168-174`) but nothing produces it.
This is A43 wave T3 (`office-template-fill.ts:28-36`), deferred inside backlog row
A43 ("the inability to add a slide stays," A43 row in `docs/BACKLOG.md`). **T3 -
the OOXML slide-clone primitive - is the large, PowerPoint-will-refuse-if-wrong
build the owner's decision is really about.**

**Feasibility verdict, stated plainly:**
- Placing generated title + bullets into the dropped `.pptx` while preserving its
  masters/layouts/theme/logos: **FEASIBLE and SHIPPED.** High fidelity, because
  `applyOfficeSections` changes only touched run text (`office-edit.ts:8-12`).
- Surfacing that capability on the `presentations` page: **CHEAP** - UI wiring
  that reuses the shipped actions, zero new OOXML (W1).
- Decks longer than the template (the T3 clone): **FEASIBLE but the hard part** -
  new OOXML (clone a slide part + its rels + a content-types override + a
  `presentation.xml` `sldIdLst` entry + a fresh relationship). Error-prone; a
  malformed part makes PowerPoint refuse to open the file, so it needs a strict
  OPC-validity instrument (W2).
- True VISUAL fidelity (does the filled deck look right in real PowerPoint):
  **OWNER-WALK.** No component or file is rendered by any test here
  (`docs/loop/this-repo.md:132-139,262-264`; `AGENTS.md`). Machine tests prove
  the output is a structurally valid `.pptx` that preserves the template's parts;
  only the owner opening it in PowerPoint proves it looks right.

**The single terminating question for the owner** (shaped so every answer ends the
activity, per `AGENTS.md` two-rounds rule). The reading already acted on is A1+A3
(sections 7). It is a RECOMMENDATION on an open fork, filed as its own backlog row
per `AGENTS.md` SHAPE 5 (section 9, R-SURFACE):

> The engine that places your generated content into a dropped `.pptx` (keeping
> its masters, layouts and logos) already exists and works - but it lives on the
> **PPT Design** page, not the **Presentations** page. Do you want me to (A1) add
> a drop-a-template control to the Presentations Slide Deck page that reuses that
> same engine, or (A2) fold PPT Design into Presentations so you reach the
> existing control there (this overlaps the Tools reorg already queued)? And,
> separately: today a deck LONGER than your template is refused with a message;
> do you want me to (A3) build slide-cloning so it fills a longer deck instead?
> I am proceeding on A1 + A3. Answering A2 instead discards W1's ~2 new files;
> answering "no A3" discards W2 (the OOXML slide-clone), the larger half.

---

## 1. Acceptance criteria (owner words -> checkable)

Owner's words: "on the presentations page, i need a dedicated place to drop a ppt
to use as a template," read as A (content placed into the dropped file). Nouns:
PRESENTATIONS PAGE, DEDICATED PLACE/DROP, USE AS A TEMPLATE (= A: keep its design,
fill it with generated content).

| # | Criterion | How it is checked | Instrument |
|---|---|---|---|
| AC-1 | On the **Presentations > Slide Deck** sub-view (`PresentationsTab`, `index.tsx`), there is a dedicated template control, separate from the sources dropzone (`SourcesEditor.tsx:129-179`). A `.pptx` placed there becomes the TEMPLATE, never a text source. | The template control calls the deck-template actions (`uploadDeckTemplateFileAction`), never `extractDeckSourceFileAction`. | I-WIRE (machine) + owner-walk (render) |
| AC-2 | The control accepts `.pptx`; a non-`.pptx` is refused with a worded message. | `uploadDeckTemplateFileAction` already enforces `/\.pptx$/i` (`deck-template-files.ts:87`); the client accept filter matches. | I-ACCEPT (machine) |
| AC-3 | A dropped `.pptx` is parsed SAFELY - a hostile/zip-bomb `.pptx` cannot exhaust memory. | The read path runs the uploaded bytes through BW0's capped pre-flight (`assertContainerWithinCaps`, `zip-caps.ts:417`) before any member is decompressed; a bomb fixture is refused with `ZipCapError`. **GAP TODAY:** the shipped engine uses raw `JSZip.loadAsync` (`office-edit.ts:349,428`), NOT the capped path (section 3.3). | I-CAP (machine) |
| AC-4 | After selecting a template, a generated deck the user DOWNLOADS is the **template's own file** with generated content placed into its slides - its masters, layouts, theme, logos and slide size preserved. | Unzip the output; assert the template's `ppt/slideMasters/*`, `ppt/slideLayouts/*`, `ppt/theme/*` parts are PRESENT and byte-identical to the template's, and the generated title/bullet strings appear in `ppt/slides/slideN.xml`. | I-PRESERVE (REMOVAL TEST) + I-CONTENT (machine) |
| AC-5 | The selected template is shown by name with a clear/replace affordance and SURVIVES a reload. | A persisted selection key round-trips; clearing removes it; reload rehydrates. The shipped pattern is `useSelectedDeckTemplateFileId` -> `"ta-ppt-template-file-id"` (`ppt-design/hooks.ts:132-134`). | I-PERSIST (machine) + owner-walk (render) |
| AC-6 | A deck that needs MORE slides than the template either (a) FILLS by cloning template slides, or (b) REFUSES with a worded count - never silently drops slides. | `planSlideTemplateFill` returns a `slide-count-clone` plan (W2) or the shipped `slide-count-refusal` (W1 inherits it, `fit-report.ts:83-97`). The output `sldIdLst` entry count equals the deck's slide count on the clone path. | I-COUNT (machine) |
| AC-7 | The output is a `.pptx` PowerPoint opens without "repair" - every referenced part exists, `[Content_Types].xml` + rels are consistent, and `presentation.xml` `sldIdLst` resolves. | The OPC-validity checker over the emitted bytes (I-OPC). **Visual** fidelity is owner-walk. | I-OPC (machine) + owner-walk |

**Leverage claim (class per `docs/loop/leverage.md`; the AC seat ratifies).** The
mechanism: the app ingests a binary `.pptx` a chat cannot read, and emits a new
`.pptx` that IS the user's institutional template - its authored masters, layouts,
theme and logo preserved by construction - carrying app-generated content. A chat
cannot emit a `.pptx` at all, let alone one that inherits a specific uploaded
deck's design. This does not fit an existing taxonomy row cleanly (it is a binary
document transformation, not CORPUS/SCALE/etc.); per `leverage.md:49-52` a genuinely
new checked claim earns a new row once built - propose **FIDELITY-PRESERVE**: an
output property (the template's design parts survive untouched) the code holds
regardless of model output, adjacent to GUARANTEED. **Removal test (I-PRESERVE):**
delete the template branch in the download handler so it falls back to
`serializeDeckToPptx` -> `buildSlidesPptx` (from-scratch navy deck) -> the output's
master/layout/theme parts are pptxgenjs's own, NOT the template's markers -> the
assertion flips RED. This is machine-checkable here because `serializeDeckToPptx`
and `fillDeckTemplateFileAction` both run their real builders under node vitest
(`deck-file.test.ts:13-20` serializes real bytes). Disposal if Verify finds the
claim thin: `iteration-caps.md` (b) Reduce or (d) Delete, never a third round.

---

## 2. Ground truth (quoted code)

### 2.1 The generated deck and its two download call sites

`GeneratedDeck = { presentationTitle: string; slides: PptxSlide[] }`
(`src/lib/decks/generate.ts:36-39`). `PptxSlide` carries `title`, `bullets[]`,
optional `code`/`codeLanguage`/`notes`/`graphic` (`src/lib/pptx.ts:19-39`).

`serializeDeckToPptx(deck, author?)` (`deck-file.ts:22-28`) wraps the from-scratch
`buildSlidesPptx` (`pptx.ts:199-680`) - a `new PptxGenJS()` builder that CANNOT
open an existing `.pptx`. Two client download sites call it:
- `ArtifactCard.tsx:188-189` (Presentations > Slide Deck sub-view).
- `PipelineTab.tsx:274-275` (Presentations > Pipeline sub-view; owned by
  `docs/presentations-pipeline-scope.md`).

**The download-forwarding wiring pin (flagged by the B-scope check):** threading a
template through the download touches whichever of these two sites the stored
template reaches. This item's template state lives on the Slide Deck sub-view, so
only `ArtifactCard.tsx` forwards it. `PipelineTab.tsx` is deliberately NOT wired
(R-PIPELINE). I-WIRE pins both: the template branch IS reached from
`ArtifactCard`, and the pipeline site is left on the plain serializer - so the
feature ships on exactly one surface, not silently on neither or mis-wired on both.

### 2.2 The shipped template-fill engine (Reading A, already built)

- `fillDeckTemplateFileAction(templateFileId, deck)` (`deck-template-files.ts:145-178`):
  loads the persisted template row's base64 (`:162`), groups its paragraphs by
  slide (`groupOfficeTemplateParagraphsBySlide`, `:163`), plans the fill
  (`planSlideTemplateFill`, `:168`), and on a refusal returns
  `describeFitReport(...)` (`:169-171`), else writes via `fillOfficeTemplate`
  and returns `{ base64, name }` (`:173-174`).
- `fillOfficeTemplate(kind, buffer, replacements)` (`office-template-fill.ts:109-122`):
  parses every paragraph, builds one section PER paragraph (H1, `:79-99`), and
  calls `applyOfficeSections` (`:121`). `applyOfficeSections`
  (`office-edit.ts:393-457`) rewrites only touched paragraphs' `<a:t>` runs and
  re-emits the zip (`:456`), leaving masters/layouts/theme/media byte-for-byte.
- `planSlideTemplateFill(groups, deckSlides)` (`office-template-fill.ts:179-200`):
  positional map (slide's first paragraph = title, rest = bullets, `:193-197`);
  when `deckSlides.length > groups.length` it REFUSES
  (`buildSlideCountAdjustment`, `:183-186`). This refusal is the T3 gap.

### 2.3 The capped-read primitives this item must use (BW0, shipped)

`src/lib/zip-caps.ts` (562 lines) exists at HEAD. The Office pattern:
`assertContainerWithinCaps(zip, name, [], limits)` (`:417-484`) pre-flights EVERY
member from declared sizes before any decompression, fail-closed; `readOfficeMember`
(`:491-523`) reads one member bounded. `office-extract.ts:213-228` (`openContainer`)
is the reference: `JSZip.loadAsync(buffer)` then `assertContainerWithinCaps`. The
shipped template engine does NOT use these - `office-edit.ts` and
`deck-template-files.ts` call raw `JSZip.loadAsync`/`parseOfficeParagraphs`. Closing
that gap for the untrusted upload is part of AC-3 (section 3.3).

---

## 3. Design

### 3.1 The surface is a LAYER, named (A1)

The user-reachable surface is a **template control on `PresentationsTab`'s Slide
Deck sub-view**, plus a **branch in `ArtifactCard`'s download**: when a template is
selected, the Download button produces the template's file filled with the
generated deck. The control reuses the shipped actions
(`uploadDeckTemplateFileAction`/`listDeckTemplateFilesAction`/
`deleteDeckTemplateFileAction`/`fillDeckTemplateFileAction`) verbatim - no second
engine. New code is UI + one persisted selection key + a pure download-plan helper.

### 3.2 Persistence - reuse or isolate the selection key

The shipped selection key is `"ta-ppt-template-file-id"`
(`ppt-design/hooks.ts:133`). Two options:
- **Share it (recommended):** a template selected on either surface is the same
  selection. One brand, one selection, matches the global presentations-control
  model (`panel-logic.ts:163-165`). Reuse `useSelectedDeckTemplateFileId` or its
  key. Risk: a selection change on one surface silently changes the other - stated,
  acceptable (one user, one template intent).
- **Isolate it:** a new key `"ta-pres-template-file-id"`. Risk: a template the
  user uploaded on PPT Design is not pre-selected on Presentations, re-selection
  needed.

Decision: **share the key** to minimise clicks (`minimize-clicks` rule) and avoid a
stranded-key pair. The template FILE itself is already persisted server-side
(`deck_template_files`), so nothing large goes in localStorage - only the id
string. No `ta-` key stores bytes (contrast the B scope's localStorage-base64
concern, which does not arise here).

### 3.3 Capped read for the untrusted upload (AC-3)

Add a capped pre-flight before the engine parses an uploaded template. Two
placements, pick the lower-blast-radius one:
- **At the action boundary (recommended):** `uploadDeckTemplateFileAction` and
  `fillDeckTemplateFileAction` call a new thin `assertPptxWithinCaps(buffer)` that
  runs `JSZip.loadAsync` + `assertContainerWithinCaps` (the `openContainer`
  pattern) and throws `ZipCapError` on a bomb, BEFORE `parseOfficeParagraphs`.
  This guards BOTH surfaces (ppt-design and presentations) in one place and does
  NOT edit `office-edit.ts` (a 755-line shared file touched by 23 modules). The
  engine's own `loadAsync` then runs on already-pre-flighted bytes.
- Rejected: editing `office-edit.ts` to route through `readOfficeMember` -
  highest blast radius (23 callers), and unnecessary, because the container
  pre-flight already bounds the decompression surface for a legitimately small
  Office file.

**Honesty note:** the template is the INSTRUCTOR'S OWN uploaded file behind
`requireUser` (`deck-template-files.ts:85`), a lower threat than a student grading
zip. The cap is defence-in-depth the brief requires, not the primary trust
boundary. The cap addition is its own small change; it can land in W1 or as a
W0 pre-wave.

### 3.4 The T3 slide-clone engine (W2 - the real OOXML build)

**Recommended OOXML approach: CLONE an existing template slide** (brief's option
(i)), in preference to authoring a new slide from a layout (option (ii)).

Rationale, grounded in the tree:
- `applyOfficeSections` already fills text into a REAL authored slide and
  preserves its layout reference, geometry and theme by construction
  (`office-edit.ts:8-12`). Cloning a template slide and then filling the clone
  reuses that proven path end to end - the clone inherits the donor's layout
  reference (`slideN.xml.rels`), so its placeholders already resolve to the
  template's master/layout.
- Authoring a slide from a layout (option ii) requires hand-writing placeholder
  XML with correct `<p:ph type idx>` matching per layout, with no renderer here to
  catch a mismatch - strictly riskier for the same payoff.

**The clone primitive** (new module `src/lib/decks/pptx-slide-clone.ts`,
server-only, jszip). To add K slides by cloning a donor template slide
`ppt/slides/slideD.xml`:
1. Pick the donor: the template's LAST content slide (so the clones sit after it),
   or a configurable index. Read it and its `_rels/slideD.xml.rels`.
2. For each new slide `slideU.xml` (U = next unused slide number):
   a. Write `ppt/slides/slideU.xml` = a copy of the donor's XML.
   b. Write `ppt/slides/_rels/slideU.xml.rels` = a copy of the donor's rels
      (keeps the donor's layout + any logo image relationship, so the clone
      inherits the same design and media).
   c. Add `<Override PartName="/ppt/slides/slideU.xml"
      ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
      to `[Content_Types].xml` (the `setDocxTitle` pattern, `office-edit.ts:706-709`).
   d. Add `<Relationship Id="rIdNEW" Type=".../slide" Target="slides/slideU.xml"/>`
      to `ppt/_rels/presentation.xml.rels` with an rId unique in that part.
   e. Add `<p:sldId id="SID" r:id="rIdNEW"/>` to `<p:sldIdLst>` in
      `ppt/presentation.xml`, with `SID` unique and >= 256 (OOXML requires slide
      ids >= 256; collisions make PowerPoint refuse).
3. Return the mutated buffer; then `fillOfficeTemplate` runs over the now-longer
   slide set (the clones have the donor's paragraphs, which the positional mapper
   fills).

Uniqueness is the sharp edge: rId must be unique within `presentation.xml.rels`,
and sldId unique within `sldIdLst` - a duplicate of either makes PowerPoint refuse
to open the file. The clone primitive computes both from the existing maxima and
I-OPC proves no duplicate shipped.

`planSlideTemplateFill` switches from refusal to a `slide-count-clone` plan
(`fit-report.ts:31-36` class already defined) when the deck is longer; a combined
`fillSlideTemplate(buffer, deckSlides)` orchestrates group -> plan -> clone-apply
-> `fillOfficeTemplate`, so `fillDeckTemplateFileAction` calls one function.

**This is a SHARED-ENGINE change.** Editing `office-template-fill.ts` changes the
behaviour of the `ppt-design` surface too (both call
`fillDeckTemplateFileAction`). W2 therefore owes a REGRESSION baseline of
`ppt-design`'s current refusal behaviour and a guard that the clone path does not
break the fits-exactly and fewer-slides cases (section 8).

### 3.5 Fidelity, honestly bounded

- Title + bullets into existing/cloned slides: high fidelity (byte-for-byte
  preserve of everything else).
- Code blocks and graphics: the fit-report ALREADY models these as counted
  drops - `graphic-dropped` (`fit-report.ts:148-151`), `bullets-dropped`
  (`:103-116`), `text-over-budget` (`:138-146`). A template slide has no code
  panel or graphic area to receive them; they are reported, not forced. Native
  code/graphic shapes on the template are a later wave (R-RICH).
- True visual fidelity: owner-walk (no render here).

---

## 4. The template-control UX (A1)

- A dedicated card on the Slide Deck sub-view, above "Generate," titled e.g.
  "Deck template" with copy matching the shipped voice: "Upload your own .pptx.
  Generated content is written into its existing slides and formatting - nothing
  else in the file changes" (reuse `TemplateSelector.tsx:194-197` verbatim).
  Professional, minimal, no emojis (UI/UX standard).
- Controls, reusing the shipped action set: a list of the user's uploaded
  templates (`listDeckTemplateFilesAction`), an "Upload .pptx template" button
  (hidden `<input accept=".pptx,...">`, `TemplateSelector.tsx:210-220` idiom),
  select-to-use, "Remove uploaded template," and a "Use the deck's own design
  instead" toggle that clears the selection (`TemplateSelector.tsx:242-244`).
- States: empty ("No uploaded templates yet"), uploading ("Uploading..."),
  selected (name + file name, highlighted), error (worded refusal), and - after a
  download that triggered a fit-report - the fit lines from `describeFitReport`
  (`fit-report.ts:213-218`), which never renders empty.
- New component `TemplateFilePicker.tsx` rather than importing ppt-design's
  `TemplateSelector` (which carries DeckTemplate-preset concerns irrelevant here
  and lives in another view's write set). The new component is thin: it calls the
  same shipped actions.

---

## 5. Transport - reuse the shipped SERVER-PERSIST path

The shipped path already resolves the transport the B scope agonised over:
- Upload once: `uploadDeckTemplateFileAction(name, fileName, base64)` checks the
  3.5MB wire budget (`checkWireBudget`, `deck-template-files.ts:89`) and persists
  the base64 to `deck_template_files` (`:101-109`). The file leaves the browser
  once, at upload, and is stored server-side.
- Download: `fillDeckTemplateFileAction(templateFileId, deck)` posts only the
  `templateFileId` + the (small, text) deck JSON; the server reads the template
  from the row (`:162`) and returns the filled base64. **The whole template never
  rides the download request** - so Reading A does NOT suffer the B-scope's
  wire-budget strain (`presentations-template-dropzone-scope.md:288-291`).
- Response size: the filled `.pptx` base64 is a server-action return, not a
  request body, so Vercel's 4.5MB REQUEST cap (`upload-budget.ts:36-38`) does not
  bind it; it is bounded by the template size (<= 2.6MB on disk,
  `maxFileBytesForWireBudget`, `upload-budget.ts:65`) plus small generated text.
  Stated, not patched (R-RESP).

---

## 6. Instruments (object / instrument / direction of failure)

Node-env vitest, jszip in-memory, network blocked (`vitest.setup.ts`). Machine
fidelity IS available here: `fillOfficeTemplate`/`serializeDeckToPptx` run their
real builders under node (`deck-file.test.ts:13-20`), so a test can unzip emitted
bytes and read their XML - no component render needed.

- **I-OPC - OPC validity checker (the backbone; W2's primary gate).** Object: the
  emitted `.pptx` bytes. Instrument (new `src/lib/decks/opc-validate.ts`, pure):
  unzip; (a) `[Content_Types].xml` exists and every part is covered by a `Default`
  extension or an `Override`; (b) every `<Relationship Target>` in every `.rels`
  resolves to an existing part (resolving relative targets, reusing
  `office-edit.ts:550-557` `resolveZipPath`'s logic); (c) every
  `<p:sldId r:id>` in `presentation.xml` maps to a relationship in
  `presentation.xml.rels` whose target part exists; (d) no duplicate
  `Relationship Id` within any rels part; (e) no duplicate `p:sldId id`. Direction:
  RED on any dangling/duplicate/uncovered part. This is the "PowerPoint will open
  it" proxy - necessary, not sufficient (visual fidelity is owner-walk).
- **I-PRESERVE - the REMOVAL TEST (W1).** Object: the output of a filled download
  over a fixture template whose `ppt/slideMasters/slideMaster1.xml`,
  `ppt/slideLayouts/slideLayout1.xml`, `ppt/theme/theme1.xml` carry known marker
  strings. Instrument: unzip; assert those three parts are present and
  byte-identical to the template's. Deletion traced: remove the template branch in
  `ArtifactCard` download -> falls back to `serializeDeckToPptx` -> output has
  pptxgenjs's own master/theme, markers ABSENT -> RED. Direction: RED if the
  template's design parts are missing or mutated.
- **I-CONTENT (W1).** Object: the filled output over a fixture template + a deck
  with known title/bullet strings. Instrument: unzip; assert each generated string
  appears inside an `<a:t>` run in the correct `ppt/slides/slideN.xml`. Direction:
  RED if generated text is missing or in the wrong slide.
- **I-COUNT (W1 refusal / W2 clone).** Object: template with T slides + deck with
  M slides. W1 instrument: M > T returns a `slide-count-refusal` fit line (no
  file written). W2 instrument: M > T returns a `slide-count-clone` plan AND the
  output's `<p:sldIdLst>` has exactly M resolving `<p:sldId>` entries. Direction:
  RED if slides are silently dropped (M > T producing < M slides) or the refusal
  path regresses.
- **I-CAP (AC-3).** Object: `assertPptxWithinCaps` over (a) a minimal valid
  `.pptx` built in-test and (b) a bomb fixture (one member's declared uncompressed
  size patched large, the `zip-bomb-caps` pattern). Instrument: (a) resolves;
  (b) `rejects` with `ZipCapError`. Direction: RED if the bomb is not refused
  (proves a raw-`JSZip` bypass of the cap).
- **I-SLIDESIZE (W2).** Object: output `<p:sldSz>` vs template's. Instrument:
  equal. Direction: RED if the slide size changed (catches a clone that reset
  geometry).
- **I-OUTPUT-BOUND (W2).** Object: output entry count + total declared bytes.
  Instrument: <= input's + (clonedSlides x a small per-slide allowance). Direction:
  RED if the output is unexpectedly large (catches a duplication bug).
- **I-WIRE - download-forwarding + source routing (W1, source-text).** Object:
  `ArtifactCard.tsx` download handler and the template control, after
  comment-stripping (`withoutLineComments`, `docs/loop/this-repo.md:179`).
  Instrument: (a) the template control calls a deck-template action, never
  `extractDeckSourceFileAction`; (b) the download branches to
  `fillDeckTemplateFileAction` when a template is selected; (c) `PipelineTab.tsx`
  still calls `serializeDeckToPptx` unbranched (pipeline deliberately not wired).
  Direction: RED if the template is routed to the sources extractor, if the
  download branch is unreachable (ships dead), or if the pin does not record the
  pipeline site's status.
- **I-ACCEPT (W1).** Object: the client accept filter / the action's `/\.pptx$/i`
  (`deck-template-files.ts:87`). Instrument: true only for `.pptx`. Direction: RED
  if a non-`.pptx` is accepted.
- **I-PERSIST (W1).** Object: the selection key round-trip. Instrument: the key
  string is pinned (`"ta-ppt-template-file-id"` if shared, section 3.2); write then
  read returns the id; clear then read returns the no-template fallback. Direction:
  RED if the key drifts or a cleared selection rehydrates as present.

**Owner-walks (no render / no real PowerPoint here):** the control renders and
accepts a drop showing name + clear (AC-1/AC-5 render half); a REAL template the
owner drops yields a deck that visibly uses its master/layout/logo (AC-4 visual);
the clone path's clones look right in PowerPoint (AC-6 visual); the file opens
without "repair" (AC-7 confirmation beyond structural I-OPC).

---

## 7. Wave plan, write sets, serialization

Line counts: `@(Get-Content <f>).Count` (PowerShell, 2026-10-08), equals `wc -l`
on this checkout (`docs/loop/this-repo.md:184-195`).

### W0 (optional pre-wave) - capped pre-flight (AC-3). ~1 new leaf + 1 edit.
- NEW `src/lib/decks/pptx-caps.ts` - `assertPptxWithinCaps(buffer)` (loadAsync +
  `assertContainerWithinCaps` from `@/lib/zip-caps`; throws `ZipCapError`).
- NEW `src/lib/decks/pptx-caps.test.ts` - I-CAP.
- EDIT `src/app/actions/deck-template-files.ts` (178) - call
  `assertPptxWithinCaps` in `uploadDeckTemplateFileAction` and
  `fillDeckTemplateFileAction` before `parseOfficeParagraphs`/
  `groupOfficeTemplateParagraphsBySlide`.
- SHARED-FILE NOTE: this file is also used by ppt-design (same action). The change
  is a pre-flight that only rejects bombs, so it cannot change the happy path;
  baseline + guard anyway (section 8). Can fold into W1 if the owner wants fewer
  pushes.

### W1 - surface the shipped engine on the Presentations page (A1). NO new OOXML.
Makes Reading A reachable where the owner is looking; inherits the slide-count
refusal. Independently shippable.

Production:
- NEW `src/app/components/presentations/TemplateFilePicker.tsx` - the template
  card; calls `listDeckTemplateFilesAction`/`uploadDeckTemplateFileAction`/
  `deleteDeckTemplateFileAction`; reuses the `readFileAsBase64` idiom
  (`SourcesEditor.tsx:64-75`) and the upload-input idiom
  (`TemplateSelector.tsx:210-220`).
- EDIT `src/app/components/presentations/index.tsx` (202) - mount the picker above
  Generate; hold the selected template id via the shared hook
  (`useSelectedDeckTemplateFileId`, `ppt-design/hooks.ts:132`); pass it to each
  `ArtifactCard`.
- EDIT `src/app/components/presentations/ArtifactCard.tsx` (226) - `DeckArtifact`
  takes an optional `templateFileId`; `handleDownload` branches: if set, call
  `fillDeckTemplateFileAction(templateFileId, deck)` and download its base64 (and
  surface its fit-report/error lines); else the existing `serializeDeckToPptx`
  path, UNCHANGED.
- EDIT `src/app/components/presentations/panel-logic.ts` (283) - add the pure
  download-plan helper (`chooseDownloadPlan(templateFileId): "template" | "own"`)
  and the accept-filter leaf; no key stored here (the id persists via the shared
  hook). Keeps the testable logic out of the `.tsx`.

Tests (NEW/EDIT): `panel-logic.test.ts` gains I-ACCEPT + the download-plan + the
key pin (I-PERSIST); a new `template-filepicker.wiring.test.ts` for I-WIRE
(source-text over `TemplateFilePicker.tsx`, `ArtifactCard.tsx`, `PipelineTab.tsx`);
a new `presentations-template-fill.test.ts` exercising I-PRESERVE + I-CONTENT +
I-COUNT(refusal) by driving `fillDeckTemplateFileAction`'s engine
(`office-template-fill.ts` directly, with an in-test fixture `.pptx`) - the
production path, per `seats.md` Test-seat practice 3.

Reused VERBATIM (no edit, in the wave's read set only): `deck-template-files.ts`
actions, `office-template-fill.ts`, `fit-report.ts`, `office-edit.ts`.

### W2 - the T3 slide-clone OOXML primitive (A3). The real build. Independently shippable.

Production:
- NEW `src/lib/decks/pptx-slide-clone.ts` - the clone primitive (section 3.4):
  `cloneTemplateSlides(buffer, donorSlideNumber, count): Promise<Buffer>` patching
  slide parts, rels, `[Content_Types].xml`, `presentation.xml` `sldIdLst`,
  `presentation.xml.rels`. Server-only, jszip.
- NEW `src/lib/decks/opc-validate.ts` - the I-OPC checker (pure; reusable by tests
  and by the clone's own self-check).
- EDIT `src/lib/decks/office-template-fill.ts` (200) - `planSlideTemplateFill`
  returns a `slide-count-clone` plan when the deck is longer (emitting the
  `fit-report.ts:31-36` class); add `fillSlideTemplate(buffer, deckSlides)` that
  orchestrates group -> plan -> `cloneTemplateSlides` -> `fillOfficeTemplate`.
- EDIT `src/app/actions/deck-template-files.ts` (178) - `fillDeckTemplateFileAction`
  calls `fillSlideTemplate` so the clone applies before the fill (small change; or
  none, if the orchestration stays entirely in `office-template-fill.ts`).

Tests (NEW/EDIT): `pptx-slide-clone.test.ts` + `opc-validate.test.ts` (I-OPC,
I-COUNT clone, I-SLIDESIZE, I-OUTPUT-BOUND over in-test fixtures, incl. a
sabotage: a clone that reuses an rId -> I-OPC RED); `office-template-fill.test.ts`
gains the clone-plan branch (and keeps the refusal test only for the no-donor
edge). The clone's hardest machine proof is I-OPC on a multi-clone output.

**W2 blast radius:** editing `office-template-fill.ts`/`deck-template-files.ts`
changes the `ppt-design` download too (it loses the refusal, gains cloning). This
is intended (both surfaces improve) but must be baselined + guarded (section 8).

### 7.1 Serialization / collision

- **Shared engine (W0/W2):** `office-template-fill.ts`, `deck-template-files.ts`,
  (and in W0) the action are READ by ppt-design's `buildOutputPptx`
  (`ppt-design/index.tsx:530-535`). W1 does NOT edit them (reuse). W0 and W2 DO -
  blast radius = the ppt-design surface. Baseline both surfaces' template-fill
  behaviour into `docs/REGRESSION.md` before W0/W2 (section 8). `office-edit.ts`
  is NOT edited by any wave (section 3.3).
- **Pipeline scope (`docs/presentations-pipeline-scope.md`):** edits
  `PipelineTab.tsx` + `pipeline/*`, not the Slide Deck panel internals
  (`index.tsx`/`ArtifactCard.tsx`/`panel-logic.ts`). Write sets disjoint. The two
  download sites (section 2.1) are the only contact point; I-WIRE pins that
  PipelineTab stays unbranched. Confirm at build time with `git status --short` +
  a `sort | uniq -d` of the two write sets.
- **B scope (`docs/presentations-template-dropzone-scope.md`):** targets the SAME
  three files on the SAME sub-view (`index.tsx`/`ArtifactCard.tsx`/`panel-logic.ts`).
  It is SUPERSEDED by the owner's A decision - it must NOT be built (section 10).
  So there is no live collision once B's row is withdrawn.
- **TOOLS-IA reorg (`docs/tools-ia-reorg-scope.md`):** may merge `ppt-design`
  under `presentationsView` (its O2). If that lands, the presentations page gains
  ppt-design's template control for free and W1 (A1) becomes redundant - this is
  exactly fork option A2. Flag, not block: if the owner picks A2, W1 collapses to a
  consolidation note; W2 (the OOXML build) is unaffected either way.
- New files do not exist yet; the edited files exist at the counts above.

### 7.2 Reversibility

W0: revert the pre-flight edit; one new leaf disappears. W1:
`ArtifactCard`/`index.tsx`/`panel-logic.ts` revert to HEAD, the picker file
disappears, the shared selection key simply goes unread (harmless). W2: the clone
module + opc-validate disappear; `office-template-fill.ts`/`deck-template-files.ts`
revert to the refusal behaviour - a BEHAVIOUR change for both surfaces, so W2's
revert is observable (longer decks refuse again), not silent. None is
non-trivially irreversible (no migration, no persisted-shape change - the
`deck_template_files` table already exists).

---

## 8. Gates (per wave, PowerShell)

Multi-path runs use the wrapper, never raw `vitest run a b`
(`docs/loop/this-repo.md:52-66`; `test-paths` memory).

W0: `npm run test:paths src/lib/decks/pptx-caps.test.ts
src/app/actions/deck-template-files.test.ts`

W1: `npm run test:paths src/app/components/presentations/panel-logic.test.ts
src/app/components/presentations/template-filepicker.wiring.test.ts
src/app/components/presentations/presentations-template-fill.test.ts`

W2: `npm run test:paths src/lib/decks/pptx-slide-clone.test.ts
src/lib/decks/opc-validate.test.ts src/lib/decks/office-template-fill.test.ts
src/app/actions/deck-template-files.test.ts` plus the existing ppt-design
template tests that read `office-template-fill.ts`/`deck-template-files.ts`
(derive the set with `grep -rl "office-template-fill\|fillDeckTemplateFileAction"
src --include=*.test.ts`; the orchestrator's list is a FLOOR, re-derive it).

All waves also run the unconditional canaries (`docs/loop/this-repo.md:42-49`):
`src/file-size-ceiling.structure.test.ts`, `src/lib/no-emojis.test.ts`,
`src/source-bytes.structure.test.ts`; plus `npx tsc --noEmit`, `npm run lint`
(exit 0, no NEW warning in files this wave writes), `npm run build` compile-line
only; and `git status --short` against the exact write set with no
`.claude/worktrees` copy edited (`stale worktree shadows Glob` memory). No new
file is near the 1000-line ceiling (largest edited file `office-edit.ts` = 755 and
is NOT edited; `ppt-design/index.tsx` = 826 and is NOT edited).

**Baseline before W0/W2 (shared-engine change):** record in `docs/REGRESSION.md`,
for BOTH surfaces, the current template-fill behaviour - fits-exactly fills,
fewer-template-slides fills, and more-deck-slides REFUSES with the
`slide-count-refusal` line (`fit-report.ts:88-96`). W2 must keep the first two and
change only the third (refusal -> clone). Check with `grep -a` first.

---

## 9. Residual register (residual / owner / instrument / measuring step)

Each must be filed in `docs/BACKLOG.md` to exist (bumps the backlog row count;
`src/tools/backlog/backlog-file.structure.test.ts`). Missing an owner, an
instrument or a step, it is a deletion.

- **R-SURFACE - the A1/A2/A3 fork (section 0), filed as a fork ROW.** Owner: repo
  owner. Instrument: the owner's answer. Step: filed now with A1+A3 as the started
  reading; the row's `owns` = this item's W1 write set; per `AGENTS.md` SHAPE 5 a
  commit touching that write set within two commits of filing discharges the
  "started" obligation. B ships nothing; A2 collapses W1; "no A3" drops W2.
- **R-CAP - the capped-read gap on the template upload (AC-3).** Owner: W0
  implementer. Instrument: I-CAP (bomb fixture rejected). Step: W0, or folded into
  W1. Until it lands, the upload uses raw `JSZip.loadAsync` (`office-edit.ts:349`).
- **R-T3 - the slide-clone OOXML build itself.** Owner: repo owner (is a longer
  deck wanted). Instrument: I-OPC + I-COUNT on a clone output. Step: W2. Tracked
  inside A43 today ("the inability to add a slide stays"); this is its own build
  row. If "no A3," the shipped refusal stands and this closes as won't-do.
- **R-RICH - code blocks and graphics are not placed as native shapes** on a
  template slide; they are COUNTED as drops (`fit-report.ts:103-151`). Owner: repo
  owner. Instrument: an unzip-assert that a code/graphic shape is emitted into the
  template slide. Step: own item.
- **R-PIPELINE - the template does not apply on the Pipeline sub-view** (only the
  Slide Deck sub-view). Owner: repo owner. Instrument: I-WIRE extended to brand
  `PipelineTab.tsx:274-275`. Step: own item if wanted; coordinate with
  `docs/presentations-pipeline-scope.md`.
- **R-KEY - the selection key is SHARED with ppt-design** (section 3.2). Owner:
  repo owner. Instrument: I-PERSIST + a note of the shared-selection behaviour.
  Step: switch to `ta-pres-template-file-id` if the shared selection surprises.
- **R-RESP - the filled `.pptx` returns as a server-action base64**; large
  templates make a large response (section 5). Owner: repo owner. Instrument:
  owner-walk with a large template. Step: stream/Route-Handler if it bites.
- **R-FIDELITY - visual fidelity is owner-walk.** Owner: repo owner. Instrument:
  open the filled deck in real PowerPoint. Step: after W1 and after W2; this
  environment renders nothing (`docs/loop/this-repo.md:262-264`).
- **R-CONSOLIDATE - ppt-design vs presentations duplication** (two deck surfaces
  with overlapping template concerns). Owner: repo owner. Instrument: the tools-IA
  reorg's O2. Step: `docs/tools-ia-reorg-scope.md`; W1 duplicates a control a
  merge would unify.

---

## 10. Disposition of the superseded B scope

The owner chose A over B, so `docs/presentations-template-dropzone-scope.md` must
NOT be built; its row is WITHDRAWN. Both scopes target the same three files on the
same sub-view, so leaving both live would build conflicting things. Mapping each B
AC to its A disposition:

| B criterion | B mechanism | A disposition |
|---|---|---|
| B AC-1 (dedicated drop target, separate from sources) | new `TemplateDropzone.tsx` | KEPT as intent -> A W1's `TemplateFilePicker.tsx` (reuses shipped actions, not a theme extractor). |
| B AC-2 (accept `.pptx`, refuse others) | accept filter | KEPT -> A AC-2 / I-ACCEPT (the shipped action already enforces it, `deck-template-files.ts:87`). |
| B AC-3 (capped safe parse) | zip-caps on a theme read | KEPT, BROADENED -> A AC-3 / R-CAP over the whole template upload. |
| B AC-4 (download colored by template brand colors) | thread `PptxTheme` into `serializeDeckToPptx` | WITHDRAWN - that is Reading B (reskin). A preserves the template's actual design instead (A AC-4). `serializeDeckToPptx` is NOT modified by A; `deck-file.ts`'s no-theme invariant (`deck-file.test.ts:26-34`) stays green. |
| B AC-5 (loaded template name shown, persists) | `ta-pres-template-theme` key | KEPT -> A AC-5, via the shipped `ta-ppt-template-file-id` selection (section 3.2); the FILE persists server-side already. |
| B AC-6 (broken pptx fails without crashing deck path) | extractor returns `{error}` | KEPT -> the shipped `uploadDeckTemplateFileAction` already returns `{error}` on an unreadable file (`deck-template-files.ts:93-98`). |
| B's theme extractor (`parseThemeXml`, `themeHintsToPptxTheme`) | new modules | WITHDRAWN - not needed for A. |
| B's R-FONTS/R-LOGO/R-POTX/R-COURSE/R-VOICE residuals | - | R-LOGO is MOOT under A (the template's own logo is preserved by construction). R-FONTS likewise moot (the template's fonts are preserved). R-POTX/R-COURSE/R-VOICE carry over as R-RICH-adjacent follow-ups if the owner wants them. |

This A scope introduces no prior-version restructure of ITSELF (it is new), so
section 9 is its only residual register; this table is the cross-scope
supersession the owner's decision requires.

---

## 11. Dispatch list for the orchestrator

1. File R-SURFACE as a fork ROW now, with A1+A3 as the started reading and W1's
   write set as its `owns`; put the section-0 question to the owner WHILE W1
   proceeds (do not gate). Withdraw the B scope's backlog row (section 10).
2. Fresh `loop-checker` on THIS scope before any seat consumes it - challenge
   hardest: (a) that `office-template-fill.ts`/`deck-template-files.ts`/
   `TemplateSelector.tsx` do what section 2.2 claims (re-open them), since the
   whole reframe rests on it; (b) that `applyOfficeSections` truly preserves
   master/layout/theme parts byte-for-byte for the I-PRESERVE removal test
   (re-open `office-edit.ts:393-457` and confirm it writes only
   `ppt/slides/slideN.xml`); (c) that the clone primitive's uniqueness story
   (section 3.4, rId + sldId) is complete; (d) that sharing the selection key
   across two surfaces (section 3.2) has no stranded-key or cross-surface hazard
   the scope missed.
3. After the check clears: `loop-test-author` for I-OPC through I-PERSIST + the
   `office-template-fill.ts` clone-branch test rewrite and the sabotage list
   (duplicate rId, dropped slide), alongside a `loop-seat` security pass
   (untrusted `.pptx` parse, the capped-read gap R-CAP) - both consume this doc.
4. Build: W0 (if separate) -> verify -> push; W1 -> verify -> push (the item
   becomes reachable on the presentations page here; A AC-4/I-PRESERVE green);
   THEN W2 (the OOXML clone) -> verify -> push. W2 changes the shared engine, so
   baseline both surfaces first (section 8).
5. File R-CAP, R-T3, R-RICH, R-PIPELINE, R-KEY, R-RESP, R-FIDELITY, R-CONSOLIDATE
   as backlog rows; bump the row count per row.
