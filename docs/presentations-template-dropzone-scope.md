# Presentations template drop zone - acceptance criteria + scope

Status: SCOPE ONLY, written 2026-10-08 against HEAD `63d48642`. No production
code and no test code was written. Every quantity names the command that
produced it; every `file:line` cited was opened. This is a NEW item (no prior
version restructured), so there is no disposition table; section 9 is the
residual register.

Owner request (direct chat, 2026-10-08): "on the presentations page, i need a
dedicated place to drop a ppt to use as a template."

---

## 0. Executive summary - the one fork the owner must settle

"Use as a template" has two readings that build materially different products,
and the code decides which is cheap:

- **Reading B - RESKIN (recommended default, scoped here).** The dropped `.pptx`
  supplies brand COLORS. We extract its theme colors and apply them to the decks
  this app already generates, by feeding the EXISTING-but-unused `theme?` path of
  `buildSlidesPptx` (`src/lib/pptx.ts:60-91,330-492`). Feasible, leverage-positive,
  and the download already runs the serializer under test (section 6, I5).
- **Reading A - TRUE TEMPLATE APPLICATION (not scoped; infeasible in this stack
  without a large lift).** The dropped `.pptx` is kept INTACT - its slide masters,
  layouts, placeholders, footer and logo - and the generated slides are injected
  INTO it so the output IS the user's file with new content. `pptxgenjs` only
  BUILDS decks from scratch; it has no API to open an existing `.pptx` and append
  to its masters/layouts (ground truth, section 2). Delivering A means hand-editing
  OOXML XML inside the zip with no library for it, and its fidelity is exactly the
  class this repo cannot verify - no component or file is rendered by any test
  (`docs/loop/this-repo.md`; `AGENTS.md` "No component is rendered").

They are not the same feature at different sizes. B changes the color scheme of
the app's own layout; A preserves the user's actual slide design. **The scope
below builds B.** The single terminating question for the owner (shaped so every
answer ends the activity, per `AGENTS.md` two-rounds rule):

> Do you want the dropped PowerPoint to (B) **recolor the decks this app
> generates to match its brand colors** - shippable on the layout we already
> produce - or (A) **have your generated content placed into that actual file**,
> keeping its slide masters, layouts and logos? A is a large build with visual
> fidelity we cannot test here; B ships now. The reading already acted on is B.

Cost if the owner answers A: the W1 extractor (theme colors) is reusable as A's
theme input, but A's injector, the whole UI affordance stays, the apply-at-download
seam (section 5) is replaced by an OOXML merge, and the fidelity criteria become
owner-walks. B's extraction and dropzone are not wasted; B's serializer thread-through is.

---

## 1. Acceptance criteria (owner words -> checkable)

The owner's words: "a dedicated place to drop a ppt to use as a template."
Three nouns - DEDICATED PLACE, DROP A PPT, USE AS A TEMPLATE - become:

| # | Criterion | How it is checked | Instrument |
|---|---|---|---|
| AC-1 | There is a drop target on the Slide Deck sub-view that is SEPARATE from the existing sources dropzone - a `.pptx` dropped there becomes the TEMPLATE, never a text source. | The template dropzone and the sources dropzone (`SourcesEditor.tsx:129-179`) are distinct controls; a `.pptx` routed to the template path never calls `extractDeckSourceFileAction`. | Owner-walk (render) + wiring pin I7 |
| AC-2 | The drop target accepts a `.pptx`; a `.ppt`, `.potx`, or non-PowerPoint file is refused with a worded message, nothing silently loaded. | accept-filter leaf classifies by extension; the action refuses by the same rule. | I1 (machine) |
| AC-3 | A dropped `.pptx` is PARSED SAFELY - a hostile/zip-bomb `.pptx` cannot exhaust memory. | Parse goes through BW0's capped path (`zip-caps.ts` `readMemberBounded` + `assertContainerWithinCaps`), never a raw `JSZip.loadAsync` of the whole file; a bomb fixture is refused. | I4 (machine) |
| AC-4 | After a successful drop, every deck this app GENERATES and the user DOWNLOADS is colored by the template's brand colors - a visible change in the downloaded `.pptx`. | Serialize a themed deck, unzip the output, assert the slide background fill carries the brand hex. Delete the theme thread-through -> hex reverts to default navy. | I5 (machine, REMOVAL TEST) |
| AC-5 | The loaded template's name is shown, with a clear/replace affordance; the selection survives a reload. | `PRES_TEMPLATE_KEY = "ta-pres-template-theme"` round-trips; clearing removes it; reload rehydrates. | I6 (machine) + owner-walk (render) |
| AC-6 | A broken/garbage `.pptx` with no readable theme fails WITHOUT crashing the deck path, and decks keep generating with the default scheme. | Extractor returns `{ error }` on unparseable input; with no stored template the download path is byte-identical to today (no theme argument). | I2, I3, I5-control (machine) |

**Leverage claim (class, per `docs/loop/leverage.md`).** The mechanism is a
typed brand record the app EXTRACTS from a binary `.pptx` a chat cannot read, and
APPLIES deterministically to a `.pptx` it emits - which a chat cannot emit at all.
Closest taxonomy row: **CORPUS** (a persisted record read back by a LATER act - every
subsequent Download reads the stored theme), compounded with the plain fact that
producing a themed `.pptx` is outside a chat's channel entirely. **Removal test
(I5):** delete the `theme` argument thread-through in `serializeDeckToPptx` and the
unzipped background hex changes from the brand color to the default navy `1a2744`
(`pptx.ts:94`). The claim is honestly bounded: the persistence is `localStorage`,
not Supabase, so it is weaker than the course-intel CORPUS instance - stated here so
a later reader does not credit it with server-side persistence it does not have
(`leverage.md` "negative example" discipline). Disposal if Verify finds it thin:
`iteration-caps.md` (b) Reduce or (d) Delete, never a third round.

---

## 2. Ground truth for the two CRITICAL UNKNOWNS (quoted code)

### UNKNOWN #1 - what IS the "deck" artifact? A REAL downloadable .pptx.

The deck is a genuine `.pptx` built by `pptxgenjs`, not JSON rendered with no
export. The content model is `GeneratedDeck` (`src/lib/decks/generate.ts:36-39`):

```
export interface GeneratedDeck {
  presentationTitle: string;
  slides: PptxSlide[];
}
```

`generateOneArtifact` (server, `src/app/api/presentations/generate/route.ts:194`)
produces the slide CONTENT. The `.pptx` BYTES are built CLIENT-SIDE at download:
`ArtifactCard.tsx:188-199` dynamically imports `@/lib/presentations/deck-file` and
calls `serializeDeckToPptx(deck)`, then blobs and anchor-clicks it. The serializer
(`src/lib/presentations/deck-file.ts:22-28`) wraps `buildSlidesPptx`:

```
export function serializeDeckToPptx(deck: GeneratedDeck, author?: string): Promise<ArrayBuffer> {
  return buildSlidesPptx({ presentationTitle: deck.presentationTitle, slides: deck.slides, author });
}
```

`buildSlidesPptx` (`src/lib/pptx.ts:199-680`) is a from-scratch builder:
`new PptxGenJS()` (`:215`), `prs.addSlide()` per slide, `prs.write({ outputType:
"arraybuffer" })` (`:679`). On-page preview (`SlideDeckPreview.tsx`) is plain React
text, unrelated to the download bytes. **So "use as a template" can only mean
styling the deck this builder emits - it cannot mean editing an external viewer's
file, because there is no external viewer.**

### UNKNOWN #2 - feasibility of applying a real template.

**`pptxgenjs` cannot ingest an arbitrary `.pptx`'s masters/layouts/theme.** The
whole of `pptx.ts` constructs a new presentation; there is no `load`/`open`/`read`
of an existing deck anywhere (`buildSlidesPptx` is the only exported builder, and
`grep` for a theme reader found nothing - see below). So mechanism **A is infeasible
with the present library.**

**But the generator ALREADY has a theme path that nobody feeds.** `buildSlidesPptx`
accepts `theme?: PptxTheme` (`pptx.ts:90`), and `PptxTheme` is
(`pptx.ts:60-68`):

```
export interface PptxTheme {
  backgroundKind: "solid" | "gradient" | "classic";
  backgroundColor: string;
  backgroundColor2?: string;
  fontColor: string;
  backgroundImageData?: string;
}
```

When a theme is supplied, `pptx.ts:330-492` renders a clean themed layout
(`titleSlide.background = bgProps`, `titleColor = hexColor(theme.fontColor)`); when
absent, `:493-677` renders the standard navy/accent scheme. **The one consumer that
could use it deliberately refuses to** - `serializeDeckToPptx` takes no theme, and
its reason is a measured crash (`deck-file.ts:12-21`): `buildSlidesPptx` throws
"Cannot read properties of undefined (reading 'startsWith')" on a theme with
`backgroundKind:"solid"` and no `backgroundColor` (the `hexColor(theme.backgroundColor)`
call at `pptx.ts:195`, `:104-107`). That crash is avoidable by CONSTRUCTION: never
emit a solid theme without a `backgroundColor` (section 3, I3).

So the feasible-and-cheap mechanism is **B via the existing theme path**: extract
theme colors from the uploaded `.pptx`, build a safe `PptxTheme`, and pass it into
`serializeDeckToPptx` -> `buildSlidesPptx`.

**Mechanism verdict:**
- (A) full template application - INFEASIBLE with `pptxgenjs`; needs raw OOXML
  manipulation and is unverifiable here. Not scoped.
- (B) extract theme hints -> feed the existing `theme` path - RECOMMENDED. Reuses a
  code path already written and shipped; the only new lift is the extractor + the
  dropzone + the thread-through.
- (C) store the file and hand it back - WEAK leverage: the user already has their
  file; `pptxgenjs` cannot merge generated slides into it, so "hand back" produces
  nothing branded. It also drags in Supabase Storage + lifecycle + orphan sweep for
  no payoff. Rejected.
- (D) cheapest high-value variant of B = extract COLORS ONLY (background + text) and
  leave fonts/logo to residuals, because `PptxTheme` already carries colors and the
  themed path already consumes them; fonts/logo would each need new fields threaded
  through every `addText` call in `pptx.ts`. **This is what the scope builds.**

**Tooling present** (`grep -n` over `package.json`): `jszip: ^3.10.1` (line 34),
`pptxgenjs: ^4.0.1` (line 39). No `officegen`, `docxtemplater`, or other OOXML
authoring lib. **No theme reader exists** (`Grep theme1|clrScheme|fontScheme|
themeElements|a:srgbClr` over `src` -> "No files found"). `office-extract.ts`
reads only `word/document.xml`, `ppt/slides/slide*.xml`, `xl/sharedStrings.xml`
(`office-extract.ts:108,127,154`) - never `ppt/theme/theme1.xml`. So the theme
extractor is genuinely new.

---

## 3. Design (mechanism B)

### D1. The surface is a LAYER, named explicitly

`AGENTS.md` records a past failure where a library and an endpoint shipped "with no
surface between them." The user-reachable surface here is: **the Download `.pptx`
button on a generated deck produces a file colored by the stored template.** That is
`ArtifactCard.tsx`'s `DeckArtifact` -> `serializeDeckToPptx(deck, author, theme)`.
The theme does NOT flow to the server generate route - styling attaches at
SERIALIZE, not at content generation - so there is no request-body change to
`/api/presentations/generate` for colors. (A future "write slide text in the brand's
voice" feature WOULD need request-body wiring; it is out of scope and noted as R-VOICE.)

### D2. Theme extraction - pure parse + capped read, split

Two pieces, kept apart so the parse is a pure testable leaf:

- **`parseThemeXml(xml: string): TemplateThemeHints | null`** - PURE (string in, no
  zip). Regex over `ppt/theme/theme1.xml`'s `<a:clrScheme>`: read the `<a:srgbClr
  val="..."/>` / `<a:sysClr ... lastClr="..."/>` under `a:dk1 a:lt1 a:dk2 a:lt2
  a:accent1`. OOXML structure assumed (ECMA-376); VALIDATED by the fixture test
  (I4), FIDELITY on real decks is an owner-walk (R-MAP). Returns `null` for xml with
  no readable `clrScheme` (AC-6).
- **`extractTemplateThemeFromBuffer(buffer): Promise<PptxTheme | null>`** -
  server-only. Follows BW0's Office pattern (`docs/zip-bomb-caps-scope.md` D8):
  `JSZip.loadAsync(buffer)` -> `assertContainerWithinCaps` (BW0 `OFFICE_*` caps) ->
  `readMemberBounded(entry, ctx)` for the `ppt/theme/theme1.xml` member -> `buffer
  .toString("utf-8")` -> `parseThemeXml` -> `themeHintsToPptxTheme`. **It imports the
  capped primitives from `zip-caps.ts`; it does NOT edit `office-extract.ts`** (keeps
  my write set off BW0's file - section 7).

### D3. Mapping + the crash guard (the invariant that REPLACES the frozen no-theme test)

**`themeHintsToPptxTheme(hints): PptxTheme`** maps extracted colors to the existing
`PptxTheme`, with ONE non-negotiable invariant: **it never returns a theme with
`backgroundKind:"solid"` and an empty/undefined `backgroundColor`** (the SRE crash,
`pptx.ts:195`). Concretely:

- `backgroundColor <- lt1` (light background; default `FFFFFF` if unreadable).
- `fontColor <- dk2` if readable and distinct, else `dk1`, else `1e293b`.
- `backgroundKind: "solid"` with both always set; if confidence is low (no readable
  colors), return `backgroundKind: "classic"`, which `normalizePptxTheme`
  (`pptx.ts:110-114`) turns into `undefined` -> the standard navy path -> no crash,
  no accidental ugly recolor.

This is a tunable mapping in ONE module; the mapping QUALITY ("does it look like my
brand") is an owner-walk (R-MAP). The crash-avoidance moves from "serializeDeckToPptx
takes no theme" to "the only producer of a theme cannot emit an unsafe one."

### D4. Persistence - global for the owner

The existing presentations controls persist GLOBALLY (no course id in the key):
`ta-pres-context-text`, `ta-pres-sources`, `ta-pres-selection`
(`panel-logic.ts:163-165`). The template follows the same model: ONE template,
app-wide, key **`ta-pres-template-theme`**, value `{ name: string; theme: PptxTheme }`
(or absent = no template). Rationale: "my template" = the instructor's brand, one
brand. Per-course brands are R-COURSE. Reuses the shipped pure
`readPersistedJSON`/`writePersistedJSON` + `usePersistedJSON` hook
(`panel-logic.ts:180-201`, `hooks.ts:25-43`), so it survives reload by construction
(persist-ui-control-state rule). Only the small theme JSON persists - never the file.

### D5. Accept filter

`isPptxTemplateFilename(name)` - true only for `.pptx` (case-insensitive). The action
refuses `.ppt` (legacy binary, not even a zip), `.potx` (a zip with the same theme1,
but refused in v1 to keep one accepted extension - message "Save it as .pptx and try
again"; accepting `.potx` is a one-line residual R-POTX), and anything else ("That is
not a PowerPoint (.pptx) file."). State to the user, never silently load.

---

## 4. The drop-zone UX

- A dedicated card on the Slide Deck sub-view, ABOVE "Generate", labeled as the
  template slot (e.g. "Deck template" / "Drop a .pptx to brand your decks").
  Professional, modern, minimal, no emojis (UI/UX standard).
- Reuse the shipped dropzone idiom from `SourcesEditor.tsx:129-179` verbatim in
  shape: a `role="button" tabIndex={0}` dashed-border div, `onDragOver`
  preventDefault, `onDrop` reads `dataTransfer.files[0]`, click + Enter/Space open a
  hidden `<input type="file" accept=".pptx">`. This is a SEPARATE component
  (`TemplateDropzone.tsx`), NOT a second mode of the sources dropzone - AC-1 forbids
  conflating them.
- Empty state: the drop prompt. Loaded state: the template NAME + a swatch of the
  two resolved colors (background/font) + a "Clear" (and re-drop replaces) control.
  Extracting state: "Reading template...". Error state: the worded refusal with a
  dismiss, same pattern as `SourcesEditor.tsx:181-207`.
- Single file (a template is one file), unlike sources which are `multiple`.

---

## 5. Safe upload / parse transport - SERVER-PARSE, NO PERSIST

**Decision: the client posts the `.pptx` as base64 to a new server action that
parses it through BW0's capped path and returns ONLY the extracted `PptxTheme`; the
file is discarded (never written to Storage).** Justification, option by option:

- **Client-parse-only (rejected).** Parsing the `.pptx` in the browser with `jszip`
  would avoid a round trip, but the brief's SAFETY rule and `AGENTS.md` require the
  parse to go through the capped `office-extract`/`zip-caps` path, and that primitive
  is node-targeted (`Buffer`, `internalStream` - `docs/zip-bomb-caps-scope.md` D3).
  It cannot run in the browser, so a client parse would be a raw `JSZip.loadAsync` -
  exactly what the brief forbids.
- **Server-parse, no persist (CHOSEN).** Reuses the capped path (AC-3), adds no
  Storage/lifecycle/orphan-sweep surface, and respects the upload budget: the action
  calls `checkWireBudget(base64.length, "That template")` (`upload-budget.ts:82`,
  the 3.5MB wire budget) exactly as `extractDeckSourceFileAction` does
  (`deck-source.ts:42`). The returned theme JSON is tiny and persists in
  `localStorage`. The file leaves the browser only to be parsed and is gone after.
- **Storage-backed (rejected).** `withUploadedSyllabusFile` + Supabase Storage +
  the orphan sweep are only justified when the raw FILE must outlive the request.
  Mechanism B needs only the extracted colors, so persisting the file is pure cost.

Transport consequence: a template larger than ~2.6MB on disk (3.5MB wire / `4/3`,
`maxFileBytesForWireBudget`, `upload-budget.ts:65`) is refused at upload. A
theme-only or typical branded template is far under this; an image-heavy master could
exceed it - stated as R-WIRE (owner-walk), not patched speculatively.

---

## 6. Instruments (object / instrument / direction of failure)

Every case is a node-env vitest with in-memory fixtures; the network is blocked
(`vitest.setup.ts`). **Fidelity IS machine-checkable here**: `serializeDeckToPptx`
already runs under vitest and returns real `.pptx` bytes (`deck-file.test.ts:13-20`
awaits it; confirmed the builder executes in node), so I5 unzips the output and reads
its XML - no component render needed.

- **I1 - accept filter (leaf, pure).** Object: `isPptxTemplateFilename` over
  `["a.pptx","A.PPTX","a.ppt","a.potx","a.pdf","noext","a.pptx.exe"]`. Instrument:
  `true` only for the two `.pptx` spellings. RED if a non-`.pptx` is accepted or a
  `.pptx` rejected.
- **I2 - theme-XML parse (leaf, pure).** Object: `parseThemeXml` over a FROZEN
  `theme1.xml` literal whose `clrScheme` has known hexes (e.g. `lt1=FFFFFF`,
  `dk2=1F3864`, `accent1=4472C4`). Instrument: returns `TemplateThemeHints` with
  those exact hexes; returns `null` for `"<xml/>"` and `""`. RED on wrong hex or
  non-null for garbage.
- **I3 - mapping crash-guard (leaf, pure).** Object: `themeHintsToPptxTheme` over
  (a) full hints, (b) hints missing the background color, (c) empty hints.
  Instrument: for (a)/(b) a `solid` theme whose `backgroundColor` matches
  `/^[0-9a-fA-F]{6}$/` and is non-empty; for (c) `backgroundKind === "classic"`. RED
  if ANY input yields `backgroundKind:"solid"` with empty/undefined `backgroundColor`
  (the SRE crash becomes representable). Sabotage: remove the fallback -> (b)/(c) go
  red.
- **I4 - extraction over a fixture pptx THROUGH the capped path.** Object:
  `extractTemplateThemeFromBuffer` over (a) a minimal valid `.pptx` zip built in-test
  with `jszip` (members `[Content_Types].xml`, `ppt/presentation.xml`,
  `ppt/theme/theme1.xml` with I2's known colors) and (b) a bomb fixture - the
  `theme1.xml` member's central-directory uncompressed size patched large (pattern
  from `zip-bomb-caps-scope.md` I1 / Appendix A). Instrument: (a) resolves a
  `PptxTheme` carrying the fixture's colors; (b) `rejects` with `ZipCapError`. RED if
  (a)'s colors are wrong, or if (b) does NOT reject (proves a raw-`JSZip` bypass of
  the cap). This is the AC-3 proof. DEPENDS on `zip-caps.ts` existing (BW0).
- **I5 - the REMOVAL TEST: themed download fidelity (machine).** Object:
  `serializeDeckToPptx(deck, undefined, theme)` with `theme = { backgroundKind:
  "solid", backgroundColor: "C21807", fontColor: "1F3864" }`. Instrument: await the
  `ArrayBuffer`, `await JSZip.loadAsync(buffer)`, read `ppt/slides/slide1.xml` (or the
  slide-master bg), assert the solid fill carries `srgbClr val="C21807"` (the brand
  hex). Positive control: with NO theme argument, the same read carries the default
  `1a2744` (`pptx.ts:94,497`). Direction: RED if the themed output lacks the brand hex
  OR if the no-theme output lacks the default. **Deletion traced:** remove the `theme`
  argument from `serializeDeckToPptx`'s call to `buildSlidesPptx` -> the themed-case
  background hex changes from `C21807` to `1a2744` -> I5 flips. That is the leverage
  removal test (section 1). Caveat R-PPTXNODE: if a future `pptxgenjs` bump breaks
  node serialization, this test breaks loudly (it is the canary), and fidelity would
  fall back to a `buildSlidesPptx` spy (wiring) + owner-walk.
- **I6 - persistence key pins (machine).** Object: `PRES_TEMPLATE_KEY` and a
  round-trip through `readPersistedJSON`/`writePersistedJSON` with a mock
  `KeyValueStorage`. Instrument: `PRES_TEMPLATE_KEY === "ta-pres-template-theme"`;
  writing then reading a `{ name, theme }` returns it; clearing (store `null`/remove)
  then reading returns the no-template fallback. RED if the key string drifts or a
  cleared template rehydrates as present (strands) / a stored one fails to rehydrate.
- **I7 - wiring: template path never calls the sources extractor (source-text pin).**
  Object: `TemplateDropzone.tsx` / the template handler after comment-stripping (name
  the helper `withoutLineComments`, `docs/loop/this-repo.md:179`). Instrument: zero
  matches of `extractDeckSourceFileAction` in the template handler; the template
  action is `extractPresentationTemplateThemeAction`. Pin the fact, not the spelling.
  RED if the template drop is wired to the sources extractor (AC-1 regression).
- **deck-file.test.ts disposition (KEPT, REWRITTEN).** The frozen no-theme invariant
  (`deck-file.test.ts:26-34`, asserting the signature has no `theme` and the
  `buildSlidesPptx` call has no `theme:`) is DELIBERATELY reversed by this item. It is
  REPLACED in the SAME wave by: the signature DOES take an optional `theme`, AND the
  crash-guard lives in `themeHintsToPptxTheme` (I3) rather than in the serializer's
  absence of a parameter. The byteLength case (`:13-20`) is KEPT unchanged.

**Owner-walks (not machine-checkable here - no render, network blocked):** the
dropzone renders and accepts a real drop showing name + clear (AC-1/AC-5 render half);
a REAL branded `.pptx` the owner drops yields a deck that visibly matches their brand
(R-MAP); the themed flat layout reads as professional vs the default navy
(`pptx.ts:330-492` is visually distinct); whether a real image-heavy template fits the
wire budget (R-WIRE).

---

## 7. Wave plan, write set, serialization

### 7.1 Hard dependency (read first)

**This item depends on ZIP-BOMB-CAPS (BW0) having SHIPPED.** `src/lib/zip-caps.ts`
does NOT exist at HEAD (`Test-Path` -> "DOES NOT EXIST"), and the capped primitives
this item's safe parse requires (`readMemberBounded`, `assertContainerWithinCaps`,
`createZipBudget`, `ZipCapError`, the `OFFICE_*` caps) are BW0 W1+W2 deliverables
(`docs/zip-bomb-caps-scope.md` section 5, D3, D8). **Do not build W1 of this item
until BW0 W2 is landed on main.** If the owner wants this before BW0, that is a
blocking re-scope (the parse cannot be made safe without re-implementing the cap),
not a workaround - state it, do not hand-roll a second capped reader.

### 7.2 Waves

Line counts from `@(Get-Content <f>).Count` (PowerShell, 2026-10-08).

**W1 - safe theme extraction (library + server action). Internal only; ships DEAD
until W2 provides the surface - the item is NOT complete after W1.**

Production (NEW, no existing file edited):
- `src/lib/presentations/template-theme.ts` - pure: `TemplateThemeHints`,
  `parseThemeXml`, `themeHintsToPptxTheme` (imports `type PptxTheme` from `@/lib/pptx`).
- `src/lib/presentations/extract-template-theme.ts` - server-only: imports the capped
  primitives from `@/lib/zip-caps` (BW0) + `type JSZip`; does NOT edit
  `office-extract.ts`. Exports `extractTemplateThemeFromBuffer`.
- `src/app/actions/presentation-template.ts` - `"use server"`:
  `extractPresentationTemplateThemeAction(name, base64)`; `requireUser()`
  (`deck-source.ts:38` precedent - caller's own bytes only, no owner resource),
  `checkWireBudget`, accept filter, calls the extractor, returns `{ name, theme }`
  or `{ error }`.

Tests (NEW): `src/lib/presentations/template-theme.test.ts` (I1, I2, I3);
`src/lib/presentations/extract-template-theme.test.ts` (I4);
`src/app/actions/presentation-template.test.ts` (action wiring: budget refusal,
accept-filter refusal, success shape - mock the extractor; `callLlm`/auth pattern per
`deck-source` has no model call).

Every export W1 adds is called within W1 (the action calls the extractor which calls
the pure leaf), except `themeHintsToPptxTheme`'s OUTPUT consumer, which is W2 - and
`parseThemeXml`/the hints type, consumed by the extractor in the same wave. No export
ships without a caller in its own wave.

**W2 - the surface (dropzone + persist + apply at download). Makes the item reachable.**

Production:
- `src/app/components/presentations/TemplateDropzone.tsx` - NEW. The dropzone; posts
  to the W1 action; shows name/clear/error. (Reuses `SourcesEditor.tsx:129-179` shape
  + `readFileAsBase64` idiom `:64-75`.)
- `src/app/components/presentations/index.tsx` - EDIT (202 lines). Mount
  `TemplateDropzone` above Generate; hold the persisted template via
  `usePersistedJSON<StoredTemplate | null>(PRES_TEMPLATE_KEY, null)`; pass
  `template?.theme` down to each `ArtifactCard`.
- `src/app/components/presentations/panel-logic.ts` - EDIT (283 lines). Add
  `PRES_TEMPLATE_KEY = "ta-pres-template-theme"`, the `StoredTemplate` type, and
  `isPptxTemplateFilename`.
- `src/app/components/presentations/ArtifactCard.tsx` - EDIT (226 lines). `DeckArtifact`
  takes optional `theme?: PptxTheme`; `handleDownload` passes it:
  `serializeDeckToPptx(deck, undefined, theme)`.
- `src/lib/presentations/deck-file.ts` - EDIT (28 lines). `serializeDeckToPptx(deck,
  author?, theme?: PptxTheme)` threads `theme` into `buildSlidesPptx`.
- `src/lib/presentations/deck-file.test.ts` - EDIT (35 lines). Replace the frozen
  no-theme invariant (`:26-34`) with the themed-and-safe invariant; keep `:13-20`.

Tests (NEW/EDIT): `deck-file.test.ts` gains I5 (themed serialize -> unzip -> assert
hex, + no-theme control); `src/app/components/presentations/panel-logic.test.ts` gains
I6 (key pin, round-trip) and I1 (accept filter) if co-located, else a new
`template-persistence.test.ts`; `src/app/components/presentations/
template-dropzone.wiring.test.ts` for I7 (source-text pin).

W2 depends on W1 (consumes `themeHintsToPptxTheme`'s output type and the action). Each
wave is its own push and revert point.

### 7.3 Serialization / collision

- **ZIP-BOMB-CAPS (BW0) - DEPENDENCY, not a file collision.** BW0 owns `zip-caps.ts`
  and `office-extract.ts` (`zip-bomb-caps-scope.md` section 5.1). This item's W1
  IMPORTS from `zip-caps.ts` and deliberately does NOT edit `office-extract.ts` (the
  new extractor is its own module, D2), so the write sets are DISJOINT. The relation
  is ordering: **BW0 W1+W2 land first; this item's W1 builds against the shipped
  `zip-caps.ts`.** Confirm with `ls src/lib/zip-caps.ts` before dispatching W1.
- **TOOLS-IA reorg - NO file collision; a conceptual note.** `tools-ia-reorg-scope.md`
  is a "pure presentation change: no param" (`:319`) that renames/reorders views and
  the rail, and MAY merge `ppt-design` into `presentationsView` as a third child
  (O2, `:586-588`). Its write set is the view registry / rail
  (`manual-rail.ts`, view-order constants) - it does NOT edit the slide-deck panel
  internals (`index.tsx`, `ArtifactCard.tsx`, `panel-logic.ts`, `deck-file.ts`). This
  item edits only those internals and adds new files; it does NOT edit `page.tsx`
  (PresentationsTab is already mounted at `page.tsx:651`) or the rail. So the write
  sets are disjoint and they may run concurrently. The only interaction: if TOOLS-IA's
  O2 merge restructures `index.tsx`'s view wiring, re-run this item's W2 gate against
  the merged file. Flag, not block. (Confirm disjointness at build time with
  `git status --short` and a `uniq -d` of the two write sets, per
  `wave-gate: git status`.)
- New files do not exist yet; the five edited files exist (section 7.2 counts).

### 7.4 Reversibility

W1: revert the commit; three new modules + three new tests disappear; nothing
persisted, no shared signature changed. W2: `serializeDeckToPptx` gains an OPTIONAL
third parameter (reverting restores the no-theme behaviour for the one other caller,
`deck-file.test.ts`), `index.tsx`/`ArtifactCard.tsx`/`panel-logic.ts` revert to HEAD,
the dropzone file disappears, and the `ta-pres-template-theme` key simply goes unread
(stale localStorage is harmless and ignored). Neither wave is non-trivially revertible.

---

## 8. Gates (per wave, PowerShell)

Multi-path runs use the wrapper, never raw `vitest run a b`
(`docs/loop/this-repo.md`; `test-paths` memory):

W1: `npm run test:paths src/lib/presentations/template-theme.test.ts
src/lib/presentations/extract-template-theme.test.ts
src/app/actions/presentation-template.test.ts`

W2: `npm run test:paths src/lib/presentations/deck-file.test.ts
src/app/components/presentations/panel-logic.test.ts
src/app/components/presentations/template-dropzone.wiring.test.ts` plus the existing
presentations tests that read these files
(`src/app/components/presentations/panel-logic.test.ts`, `src/lib/presentations/
parse.test.ts` - which `types.ts` comment at `:9-10` says guards the single slide
model).

Both waves also run the unconditional canaries (`docs/loop/this-repo.md`):
`src/file-size-ceiling.structure.test.ts`, `src/lib/no-emojis.test.ts`,
`src/source-bytes.structure.test.ts`; plus `npx tsc --noEmit`, `npm run lint` (exit 0,
no NEW warning in files this wave writes), `npm run build` compile-line only; and
`git status --short` against the exact write set, requiring no `.claude/worktrees`
copy edited (`stale worktree shadows Glob` memory).

The AC-4 fidelity claim's pass condition (I5): object = the unzipped
`ppt/slides/slide1.xml` background fill of a themed vs a no-theme `serializeDeckToPptx`
output; instrument = `JSZip.loadAsync` of the returned `ArrayBuffer` + a hex assertion;
direction = RED if the themed output lacks the brand hex or the no-theme output lacks
`1a2744`.

---

## 9. Residual register (residual / owner / instrument / measuring step)

Each must be filed in `docs/BACKLOG.md` to exist (the orchestrator files; a row bumps
`EXPECTED_ROW_COUNT`, `src/tools/backlog/backlog-file.structure.test.ts`). Missing an
owner, an instrument, or a step, it is a deletion.

- **R-FORK - the A/B product decision (section 0).** Owner: repo owner. Instrument:
  the owner's answer to the section-0 question. Step: put the one question with B
  already running; B ships regardless, A becomes its own item if chosen.
- **R-BW0 - the hard dependency on ZIP-BOMB-CAPS.** Owner: orchestrator (ordering).
  Instrument: `ls src/lib/zip-caps.ts` and that `assertContainerWithinCaps` /
  `readMemberBounded` are exported. Step: before dispatching this item's W1.
- **R-MAP - color-mapping fidelity (does a real brand look right).** Owner: repo owner.
  Instrument: owner-walk - drop a real branded `.pptx`, generate a deck, download, open
  in PowerPoint, compare. Step: after W2. A bad mapping is a one-module tuning edit
  (D3), not a redesign.
- **R-PPTXNODE - `pptxgenjs` serializing under node/vitest.** Owner: W1/W2 verifier.
  Instrument: I5 runs green today (`deck-file.test.ts:18` already serializes under
  vitest); re-check on any `pptxgenjs` bump (`^4.0.1`). Step: W2 verify; if it breaks,
  fidelity falls back to a `buildSlidesPptx` spy + owner-walk.
- **R-WIRE - image-heavy templates exceed the 3.5MB wire budget.** Owner: repo owner.
  Instrument: owner-walk - drop a large template, expect the worded size refusal. Step:
  after W2. Raising it needs the Storage transport (rejected here), i.e. a re-scope.
- **R-FONTS - brand FONTS are not applied** (only colors). `PptxTheme` has no font
  field and `pptx.ts` hardcodes typefaces. Owner: orchestrator files a row. Instrument:
  a new `fontFamily` on `PptxTheme` threaded through every `addText` + an I5-style
  unzip assertion on `<a:latin typeface=...>`. Step: its own item.
- **R-LOGO - brand LOGO / background image not applied.** `PptxTheme.backgroundImageData`
  exists but extracting a logo PNG from `ppt/media/*` and placing it is new work. Owner:
  orchestrator files a row. Instrument: unzip-assert the media part is embedded. Step:
  own item.
- **R-PREVIEW - the on-page `SlideDeckPreview` does not reflect the theme** (only the
  download does). Owner: repo owner (is it wanted). Instrument: owner-walk. Step: a UX
  follow-up; the download is the pinned artefact (AC-4).
- **R-POTX - `.potx` refused though it is parseable.** Owner: repo owner. Instrument:
  I1 extended to accept `.potx`. Step: one-line edit if wanted.
- **R-COURSE - per-course templates** instead of one global brand. Owner: repo owner.
  Instrument: key becomes `ta-pres-template-theme-<courseId>` + a course prop. Step:
  own item if the global model proves too coarse.
- **R-VOICE - brand VOICE in generated text** (request-body wiring to the generate
  route). Owner: repo owner. Instrument: a prompt field + a generate-route body pin.
  Step: own item; explicitly out of scope here (styling attaches at serialize, D1).

---

## 10. Dispatch list for the orchestrator

1. Put the section-0 fork question to the owner WHILE B proceeds (R-FORK); do not gate.
2. Confirm BW0 has shipped `zip-caps.ts` with `readMemberBounded` +
   `assertContainerWithinCaps` (R-BW0) before W1.
3. Fresh `loop-checker` on THIS scope before any seat consumes it - challenge hardest:
   (a) that `serializeDeckToPptx` truly runs the real builder under vitest so I5 is
   machine-checkable (re-open `deck-file.test.ts:13-20`), (b) that the themed path
   `pptx.ts:330-492` writes a readable solid background hex into `slide1.xml` (not only
   a slide master), and (c) that the new extractor can avoid editing `office-extract.ts`
   while still using BW0's caps.
4. After the check clears: `loop-test-author` for I1-I7 + the `deck-file.test.ts`
   rewrite and sabotage list, alongside a `loop-seat` security pass (untrusted `.pptx`
   parse) - both consume this doc.
5. Build: W1 (`loop-implementer`, write set exactly section 7.2 W1, after BW0), verify,
   push; THEN W2, verify, push. W2 is the surface - the item is not "done" until the
   Download produces a themed file (AC-4 / I5 green).
6. File R-FORK, R-FONTS, R-LOGO, R-COURSE, R-VOICE and any other residual the owner
   wants tracked as backlog rows; bump `EXPECTED_ROW_COUNT` per row.
