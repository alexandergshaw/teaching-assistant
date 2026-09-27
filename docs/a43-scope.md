# A43 scope: a slide deck from an uploaded source, against an uploaded template

Seat: scoping pass for backlog row A43 (`docs/backlog.yml:637`, state
`unscoped`). Owner's request, verbatim, as the row records it
(`docs/backlog.yml:644`):

> "A way to make a slide deck given an uploaded content source (repo, ch obj's,
> homework, etc). The flexibility of an llm with the structure of a deterministic
> method. I need to be able to smoothly upload and ask for things while still
> ensuring the output is going to use a predefined template that i upload".

Every quantity below names the command that produced it. Every `file:line` was
opened in this pass. Measurements taken 2026-09-27 in this checkout, working
tree as reported by `git status --short` at the end of this document.

**No prior version of this scope exists** (`git ls-files | grep -c "a43"`
returns 0), so there is no disposition table to write. Section 11 is the
residual register; section 10 is the wave plan.

---

## 1. The headline: most of this is built, and the row is not greenfield

**The row is EXTENSION plus ONE REAL NEW CAPABILITY, not a build.** Traced end
to end this pass:

| Piece of the owner's sentence | Status | Proof |
|---|---|---|
| "make a slide deck" from a template + an LLM | **SHIPS, reached, four surfaces** | section 2 |
| "the structure of a deterministic method" | **SHIPS as shape (a)** - the model emits content only, a deterministic writer places it | `src/lib/decks/generate.ts:37-40` returns `{presentationTitle, slides: PptxSlide[]}`; `src/lib/pptx.ts:213` is the only place a presentation is constructed |
| "given an uploaded content source" | **PARTLY** - a `materials` slot exists and three callers fill it, but the manual deck surface does not | `src/lib/decks/generate.ts:24` (`materials?: string`), `:114` (the prompt slot); `src/app/components/ppt-design/index.tsx:341-344` builds `ctx` with **no `materials` key** |
| "a predefined template that i upload" | **DOES NOT EXIST.** A "deck template" here is a JSON role/loop/theme spec in Postgres, not a file | `supabase/migrations/20260820000000_create_deck_templates.sql` (`slides jsonb`, `loops jsonb`); `src/lib/decks/types.ts:346-368` (`DeckTemplate`) |
| "smoothly upload and ask" | **DOES NOT EXIST as asking.** The app's chat has attachments but no tool calling anywhere | `src/lib/chat/attachments.ts:24,30`; absence canaried in section 7 |

So the row splits into three pieces of very different size, and the scope's main
job is to say so:

- **A43-S (SOURCE)** - wire an uploaded source into the manual deck surface.
  Small. The receiving slot, the prompt slot, and the file-to-text extractor all
  ship; the surface just never fills them.
- **A43-T (TEMPLATE AS A FILE)** - the owner's own `.pptx`, obeyed. This is the
  real feature, and it is the one the owner's sentence is actually about ("not a
  template the app ships, and not a layout the model imitates - the owner's own
  file, obeyed", `docs/backlog.yml:645`).
- **A43-C (CONVERSATIONAL ASK)** - "ask for things". Recommended **out of
  A43**, as its own row, because the app has no function-calling layer at all
  (section 7). Putting it inside A43 would make the whole row depend on the
  largest unbuilt thing in it.

---

## 2. What exists, traced end to end (control -> action -> model -> output)

Instrument for the inventory: `git ls-files | grep -iE "slide|pptx|deck"` (75
paths) and `git ls-files | grep -iE "template"` (37 paths). Counts:

```
git ls-files | grep -icE "slide|pptx|deck"      -> 75
git ls-files | grep -icE "template"             -> 37
```

Four deck paths reach a real `.pptx`. All four use the same core.

### 2.1 The shared core (the deterministic writer)

- `src/lib/decks/generate.ts` (474 lines, `wc -l`) - `buildDeckPrompt` at `:64`
  asks the model for JSON only; `generateDeckFromTemplate` maps it to
  `PptxSlide[]`.
- `src/lib/pptx.ts` (680 lines, `wc -l`) - `buildSlidesPptx`, the only
  presentation constructor. `:213` `const { default: PptxGenJS } = await
  import("pptxgenjs")`.
- `src/lib/decks/types.ts` (521 lines) - `DeckSlide` at `:334`, `DeckTemplate`
  at `:346`, `expandTemplate` referenced at `:445`.
- Callers of `buildSlidesPptx`: 75 hits
  (`grep -rn "buildSlidesPptx" --include=*.ts --include=*.tsx src/ | wc -l`).

**This is already shape (a).** The model never sees or emits a file. It returns
`{title, bullets, code, codeLanguage, graphic}` and TypeScript builds the
presentation. That matters for section 4: the project does not have to choose
shape (a); it already has it, for the templates it owns.

### 2.2 Path P - PowerPoint Design tab (manual, no source)

Reached: Tools tab -> "PowerPoint Design" chip
(`src/app/components/manual/manual-rail.ts:76`, `:115`) ->
`src/app/components/PowerPointDesignTab.tsx:1` re-exports
`./ppt-design` -> rendered at `src/app/page.tsx:566`.

Both ends proven:
- Control: `src/app/components/ppt-design/GeneratePanel.tsx:78-82` (Subject
  field), `:96-145` (loop-item fields), and the Generate button in the same
  panel; wired by `src/app/components/ppt-design/index.tsx:567`
  (`onGenerateDeck={handleGenerateDeck}`).
- Action: `index.tsx:347` `generateDeckFromTemplateAction(selected, ctx,
  getStoredProvider())`, imported at `:26`.
- Output: `handleDownloadPptx` at `index.tsx:361` calls `buildSlidesPptx`.

**THE GAP, cited exactly.** `index.tsx:341-344`:

```
      const ctx = {
        subject: subject || selected.name,
        audience: audience || selected.audience,
        loopItems: resolvedLoopItems,
      };
```

No `materials`. The field exists on the type
(`src/lib/decks/generate.ts:24`) and is injected into the prompt
(`:114`). Absence canaried:
`grep -niE "materials|source" src/app/components/ppt-design/GeneratePanel.tsx
src/app/components/ppt-design/index.tsx` returns 5 lines, all of them
`group.source` (the loop-source enum), none of them a materials input; the
canary that the command fires is `grep -c "useState"
src/app/components/ppt-design/index.tsx` -> 2.

**This surface requires no course.** `grep -niE "course"
src/app/components/ppt-design/index.tsx` returns nothing (canary: `grep -c
"selected"` on the same file -> 83). That is the single most useful fact for
section 5.

### 2.3 Path W - workflow step "generate-presentation-from-template"

`src/lib/workflows/registry/steps.media.presentation-from-template.ts`. This
path DOES have a source. Inputs declared at `:48-56`: `template` (required),
`hubCourse`, `moduleId`, `subject`, `concepts`, `audience`, `modulesAhead`,
`sources`. The source is gathered by `gatherModuleMaterials`
(`src/lib/workflows/registry-helpers.sources.ts:144`) under a policy
(`src/lib/workflows/source-policy.ts`), whose kinds at `:12-20` are
`live-lms | course-export | source-url | materials-zip | repo | tile-meta |
topic-outline`, labelled at `:45-52`. Default policy `:63-66` is
`["live-lms","course-export","tile-meta"]`, `first-success`.

The repo gatherer is `:687-710` of `registry-helpers.sources.ts` and reads
`tile.repos[0].repo` via `ingestRepoAction`
(`src/app/actions/github.ts:258`). **It takes a repo REFERENCE off a course
tile, never an upload** - `:688` `const repoRef = tile.repos?.[0]?.repo?.trim()`,
`:689-691` refuses with "repo: no repository linked to this course tile".

So path W's source is real but is **gated on a course tile** and on a workflow.

### 2.4 Path M - module deck capture (source is a screen capture)

`src/app/components/module-deck-capture/ModuleDeckCapturePanel.tsx` (843
lines). Controls at `:758` (Start/Stop capture), `:761` (legibility probe),
`:764-774` (Generate), `:832` (Download). It posts to
`src/app/api/lms-generation/deck-from-capture/route.ts`, which at `:124` calls
`buildDeckGenContext(tplRes.template, moduleLabel, materialsText)`.

**This is the closest existing thing to the owner's ask**: arbitrary text +
a template -> a deck, with no LMS selection. Its own header comment says so
(`:20-28`): "that route's contract is 'a selection becomes materials' ... This
route's caller ... already HAS its materials text". The source is a screen
capture rather than an upload, and the route resolves a course row
(`:4-5` imports `resolveLmsCourseRowAction`).

### 2.5 Path L - LMS generation, deck kind

`src/app/api/lms-generation/deck/route.ts:171`
`buildDeckGenContext(tplRes.template, moduleLabel, materials.materialsText)`.
Template picker state is
`src/app/components/content-tab/modules/useLmsGenerationDeckTemplates.ts` - the
module the row flagged. Read in full (76 lines): it is a **picker** over
`DECK_PRESETS` plus the user's `deck_templates` rows, persisted per course
(`:50`). It uploads nothing. Its name asserts "deck templates are a concept
here" and that is true - but the concept is a JSON spec, not a file.

### 2.6 `slide-graphics-repair.ts` is NOT shape (b)

The row asked whether its existence suggests shape (b) is partly built. **It
does not.** `src/app/actions/slide-graphics-repair.ts` (251 lines) is a
one-shot content backfill, not a template validator with a repair loop. Its own
header, `:3-8`: `enforceGraphicsForApplied` "only NAMES a gap - a slide that was
required to carry a graphic ... but has none. This module fills that gap with
ONE additional, narrowly-scoped LLM call". It repairs a *content* omission
(a missing `graphic` field) against the app's own prompt contract; it never sees
a template file and there is no loop - `:19-24` says an LLM failure "leave[s]
the deck exactly as it was handed in". Its sibling `src/lib/pptx-graphics-audit.ts`
(216 lines) audits the *emitted* pptx XML for graphics presence.

So: shape (b) machinery for a *template* does not exist. One instance of a
content-level check-and-repair exists, and it is a precedent for cost (one extra
LLM call, salvage logic for truncated responses, `:26-44`) rather than a
foundation.

---

## 3. Q1 - what format is the uploaded template, and what library reads it

### 3.1 What the tree already decided, and what it did not

**Decided:** a stored deck template is a JSON layout spec.
`supabase/migrations/20260820000000_create_deck_templates.sql` declares
`slides jsonb`, `loops jsonb`, `audience text`, `tone text`, plus
`theme jsonb` (`20260822000000_deck_templates_theme.sql`) and `course_kind text`
(`20260919000000_deck_templates_course_kind.sql`). The TypeScript shape is
`DeckTemplate` (`src/lib/decks/types.ts:346-368`) with `DeckSlide`
(`:334-344`: `role`, `title`, `notes`, `includeCode`, `codeLanguage`,
`maxBullets`, `loopGroupId`, `depth`) and `DeckTheme` (`:60-67`:
`backgroundKind`, `backgroundColor`, `backgroundColor2`, `gradientAngle`,
`fontColor`).

`docs/slide-spec.md` is orthogonal: it specifies slide CONTENT and ORDERING
(sections 1-6) and explicitly separates rendering ("Rendering (informational)",
naming `buildSlidesPptx`). It says nothing about a template file.

**NOT decided, and the owner's sentence rules against the decided answer.** The
owner says "not a template the app ships ... the owner's own file, obeyed". A
`deck_templates` row is a template the app's own editor builds. So A43-T needs a
NEW artifact kind, and the format question is genuinely open.

### 3.2 The library facts, measured

| Fact | Command / citation |
|---|---|
| `pptxgenjs@^4.0.1` is a dependency | `package.json:38` |
| **`pptxgenjs` cannot READ a presentation.** Its whole method surface is `stream`, `write`, `writeFile`, `addSection`, `addSlide`, `defineLayout`, `defineSlideMaster`, `tableToSlides` | `node_modules/pptxgenjs/types/index.d.ts:85-140`; the only doc comments are "Export the current Presentation" (`:101`) |
| `jszip@^3.10.1` is a dependency, widely used | `package.json:33`; 27 call sites (`grep -rn "jszip\|JSZip" --include=*.ts --include=*.tsx src/ \| grep -v "\.test\." \| wc -l` -> 41 lines across 27 files) |
| `officeparser@^7.0.3` can parse `.pptx`, but only to TEXT | `package.json:36`; `node_modules/officeparser/dist/types.d.ts:846` lists `pptx` in `SupportedFileType`; `src/lib/office-extract.ts:214` calls `OfficeParser.parseOffice(buffer, {fileType})` then `.to("text")` |
| **Nothing in `src/` parses a slide layout or master.** | `grep -rniE "slideLayout\|sldLayout\|slideMaster\|sldMaster\|potx" --include=*.ts --include=*.tsx src/` returns 12 lines, ALL of them either `graphicSlideLayout` (this repo's own pptxgenjs *write*-side geometry helper, `src/lib/slide-graphics.ts:434`) or `prs.defineSlideMaster` (`src/lib/pptx.ts:337`, also write-side). Canary that the command fires: `grep -rn "buildSlidesPptx" --include=*.ts --include=*.tsx src/ \| wc -l` -> 75 |
| **Nothing in `src/` adds or clones a slide part.** | `grep -rniE "sldIdLst\|presentation\.xml\|appendPptx\|addSlideXml\|cloneSlide\|_rels/slide" --include=*.ts --include=*.tsx src/` returns nothing, exit 1. Canary, same command form: `grep -rniE "sortedSlides" --include=*.ts src/ \| wc -l` -> 6 |
| **No `.pptx`/`.potx`/`.docx` fixture is tracked** | `git ls-files \| grep -icE "\.(pptx\|potx\|docx\|thmx)$"` -> 0. Canary, same form: `git ls-files \| grep -icE "\.sql$"` -> 109. (Note: the first spelling of this check was piped through `\| cat`, which made `$?` report `cat`'s status - 0 - instead of grep's 1. The count form above is immune and is the one quoted.) |

### 3.3 THE FINDING THAT DECIDES THIS: the tree already reads and writes `.pptx` in place

`src/lib/office-edit.ts` (755 lines, `wc -l`) - **no direct test file**, see
residual RES-A43-1 - already does the deterministic half of shape (a) for a real
`.pptx` on disk:

- `:17` `export type OfficeKind = "docx" | "pptx";`
- `:41-45` `OfficeParagraph { id; slide?: number; text; runs: RunSpan[]; style }`
- `:341-345` `sortedSlides(zip)` filters `/^ppt\/slides\/slide\d+\.xml$/i`
- `:348` `parseOfficeParagraphs(kind, buffer)` - for pptx, walks each slide's
  paragraphs and returns them with per-run formatting (`:369-380`)
- `:393` `applyOfficeSections(kind, buffer, sections)` - writes them back. Its
  own doc comment, `:383-392`, states the contract: "A paragraph whose single
  section is unchanged is left byte-for-byte (so its formatting, images, and
  hyperlinks are untouched); only edited/added/cloned paragraphs are rebuilt.
  Structural paragraphs (no editable text) are always left as-is. Works for
  docx + pptx." The pptx write branch is `:440-456`, and it only calls
  `zip.file(file.name, xml)` when a slide was `touched` (`:454`).

**Both ends of this are reached in production**, not dead code:
- Read: `src/app/actions/media.ts:403`
  `parseOfficeParagraphs("pptx", Buffer.from(base64, "base64"))` inside
  `extractPptxSlidesAction` (`:390`), whose own comment at `:396-399` names "all
  six production callers ... Slide Studio deck mode, file preview, and four
  workflow steps". Confirmed: `grep -rn "extractPptxSlidesAction"` finds call
  sites at `src/app/components/slide-studio/useDeckMode.ts:229`,
  `src/app/components/files/useFilePreview.ts:172`,
  `src/lib/workflows/registry/steps.content-generators.ts:240`,
  `steps.knowledge.ts:614`, `steps.media.ts:290`, `steps.visualizer.ts:94`.
- Write: `src/lib/canvas-modules/office.ts:143`
  `applyOfficeSections(meta.kind, buffer, sections)` where `meta.kind` is
  resolved from the filename at `:48`
  (`lower.endsWith(".pptx") ? "pptx" : null`).

**A `.pptx` upload surface also already exists**:
`src/app/components/slide-studio/DeckModeSection.tsx:73-79` is a real
`<input type="file" accept=".pptx">`, clicked from `:67`, handled by
`src/app/components/slide-studio/useDeckMode.ts:213-229`. It is the **only**
`.pptx` file input in the app: `grep -rn 'accept=' --include=*.tsx src/ | grep
-i "pptx"` returns exactly that one line, out of 33 files carrying
`type="file"` (`grep -rln 'type="file"' --include=*.tsx src/ | wc -l` -> 33).

### 3.4 Recommendation on Q1

**The uploaded template is a `.pptx` (or `.potx`) and it is read with `jszip`
plus the existing `office-edit.ts` idiom. It is NOT an HTML/CSS theme and NOT a
JSON layout spec, because a JSON spec is what already exists and is what the
owner explicitly excluded.** No new dependency is needed. `pptxgenjs` stays the
writer for the app's own presets and is NOT used for a file-backed template,
because it cannot read one.

**Storage shape, with an in-tree precedent:** a new owner-scoped table holding
the file base64 in a `text` column, modelled on `syllabus_templates`
(`supabase/migrations/20260709000000_create_syllabus_templates.sql`), whose
header says exactly this: "Each row is a saved Word .docx (base64-encoded in
`content`) plus a name, owner-scoped." Alternative: the `course-files` storage
bucket, which exists (`grep -rhoE '\.storage\s*\.from\("[a-z-]+"'` over `src/`
-> `cartridge-drops`, `course-files`, `recordings`). The table is the better fit
because a template is not a course file and must be listable without a course.

### 3.5 THE HARD CONSTRAINT this creates, stated before the shape argument

`applyOfficeSections` can, per its own contract (`:383-392`), **rewrite a
paragraph, clone it in place, or delete it. It cannot add a slide.** The only
append helper is `appendDocxParagraph` (`:464`), docx-only. And nothing in the
tree touches `ppt/presentation.xml`, `sldIdLst`, or slide rels (canaried in 3.2).

**Therefore, on shipped machinery, a deck built from an uploaded `.pptx` has
EXACTLY the slide count of the uploaded file.** That is fine for a fixed
deliverable (a weekly one-pager, a five-slide standup) and wrong for a lecture
deck generated from a chapter, where the app's own worst case is 79-82 slides
(`src/lib/slide-token-budget.ts`, the CODING and APPLIED arithmetic in its
header comment). So slide cloning is **not optional** if the owner wants the
existing lecture shapes against their own file - it is wave 3, and its cost is
five OOXML edits per cloned slide (`ppt/slides/slideN.xml`,
`ppt/slides/_rels/slideN.xml.rels`, `ppt/presentation.xml`'s `sldIdLst`,
`ppt/_rels/presentation.xml.rels`, `[Content_Types].xml`).

**Related risk I could not settle here:** a PowerPoint `.potx` commonly carries
its design in `ppt/slideLayouts/` and `ppt/slideMasters/` with **zero**
`ppt/slides/` entries. `sortedSlides` (`:341-345`) matches only
`ppt/slides/slideN.xml`, so such a file parses to zero paragraphs and the
feature would silently do nothing. This is a property of the owner's actual
file, and there is no fixture in this checkout to test against (3.2), so it goes
to owner verification: RES-A43-4.

---

## 4. Q2 - where the guarantee lives

### 4.1 The three shapes, argued rather than picked

**(a) Model emits content only; a deterministic writer places it into the
template.**

- The guarantee is STRUCTURAL: every byte of the uploaded file except the text
  runs the writer rewrote is carried through unchanged, because
  `applyOfficeSections` re-serialises the same `JSZip` object and only calls
  `zip.file(name, xml)` for slides it touched (`office-edit.ts:454`). Nothing
  reviews the model's output for conformance, because the model's output never
  reaches the file.
- **It is already this repo's answer for its own templates** (section 2.1), so
  choosing it is continuity, not a new bet.
- It matches `docs/loop/leverage.md`'s GUARANTEED class, whose defining line is
  "An output property the code holds regardless of what the model returns".
- **Cost, stated honestly:** it constrains what the owner can ask for. The model
  can be asked for text, bullet counts, code, and a choice among roles. It
  cannot be asked to "add a summary slide at the end", "make this one two
  columns", or "use the dark variant of slide 3" unless the writer was built to
  express that. Every new degree of freedom is a writer feature, not a prompt
  edit. **That is the trade the owner has to see, and it is the whole trade.**

**(b) Model emits a deck; a validator rejects violations; a repair loop runs.**

- Rejected for the template guarantee, on three measured grounds.
  1. **The model cannot emit a `.pptx` at all.** It emits JSON
     (`generate.ts:114-131`, "Return ONLY valid JSON"). To emit a deck it would
     have to emit OOXML, which nothing in the pipeline accepts and which would
     have to be validated byte-wise against the owner's file anyway - i.e. (a)
     with extra steps and a failure mode.
  2. **The one repair loop that exists is a content backfill, not a template
     check** (section 2.6), and its own file records what a repair pass costs:
     an extra LLM call, a salvage parser for truncated responses
     (`slide-graphics-repair.ts:26-44`), and an explicit decision that an
     unrepaired gap "is a reported defect ... never a crashed run" (`:22-24`).
     A template violation that ships as "a reported defect" is exactly what the
     owner asked not to happen.
  3. A checked guarantee is falsifiable only where the checker looks. The
     app's own precedent for this failing is in `docs/loop/leverage.md`: the
     `FORBIDDEN_PATH_PREFIXES` list that omitted `lib/llm` and passed a real
     sabotage.

**(c) Model chooses among template-declared layouts by name, and can express
nothing else.**

- This is not a rival to (a); it is **the content contract that (a) needs.** (a)
  answers "who writes the file"; (c) answers "what vocabulary the model is given".
- Its in-tree ancestor is `SlideRole` (`src/lib/decks/types.ts:145-159`:
  `role`, `label`, `hint`, `promptContract`, `codeDefault`,
  `maxBulletsDefault`, `answersPrevious?`) and `expandTemplate` (`:445`). The
  deck prompt already enumerates a closed per-slide spec list
  (`generate.ts:70-97`) and demands "EXACTLY the N slides listed above, in that
  exact order and count" (`:124`).

### 4.2 Ruling

**Shape (a), with (c) as its content contract. (b) is rejected for the template
guarantee.** The recommendation is not a coin flip: (a) is the shape the
existing pipeline already is, the deterministic pptx writer already ships and is
already reached, and the guarantee it produces is a **byte property of a zip**,
which - unlike anything about appearance - IS testable in this checkout
(section 9.1).

**What the owner loses, in one sentence so it is not buried:** conversational
requests that change LAYOUT ("put this on two columns", "add a slide here") are
not answerable in wave 1 or 2; conversational requests that change CONTENT
("more detail on recursion", "drop the case study", "aim this at first-years")
are. If the owner needs the first class, that is a writer feature with its own
row, and A43 should say so rather than imply the model can do it.

---

## 5. Q3 - what "smoothly upload and ask" costs, measured against A39

Counting unit is A39's, quoted from `docs/a39-census.md:29-35`: one interaction
is a click, one field fill, one file-dialog round trip, one list/dropdown
selection, or one page/view transition; WAITS are counted separately and never
folded in. COLD is a first-ever visit; WARM is a return, which is free wherever
a `ta-` key persists the choice.

### 5.1 Persistence already measured on path P

`grep -rn "localStorage\|ta-" src/app/components/ppt-design/*.ts
src/app/components/ppt-design/*.tsx`:

| Key | Line |
|---|---|
| `ta-ppt-selected-id` | `hooks.ts:71` |
| `ta-ppt-settings-open` | `hooks.ts:79` |
| `ta-ppt-gen-subject` | `hooks.ts:110` |
| `ta-ppt-gen-audience` | `hooks.ts:111` |
| `ta-ppt-gen-loop-<groupId>` | `hooks.ts:124`, read at `index.tsx:91-93` |

Navigation is persisted too: `ta-active-tab`
(`src/app/components/home/useAppNavigation.ts:392`) and `ta-manual-view`
(`:46`).

### 5.2 Today's counts

| Path | Cold | s (warm) | p (per extra deck) | Source supported? |
|---|---|---|---|---|
| **P PowerPoint Design** | 2 nav + 1 template pick + 1 subject + 1 loop items + 1 Generate + 1 Download = **7** | subject + Generate + Download = **3** | 3 | **no source at all** |
| **M module deck capture** | nav + start + share-picker + stop + Generate + Download = **6** (share picker is an OS dialog, counted as one file-dialog-equivalent) | **4** | 4 | screen capture only; resolves a course |
| **W workflow step** | not costed - bounded below by "select or build a workflow" (A39 declines to cost path I on the same ground, `docs/a39-census.md:620-622`) | - | - | yes: 7 source kinds, needs a course tile |

### 5.3 The chat baseline for THIS act, and where the scaling unit is

A39's baseline is `2 + N` over submissions. For a deck the scaling unit is
**slides**, not submissions, and the chat's per-slide cost is not a paste into
the chat - it is a paste OUT of the chat into the owner's PowerPoint file,
because a plain chat cannot emit a file that obeys an uploaded template.

| Quantity | Chat | This design (warm) |
|---|---|---|
| Setup | 2 (attach source, ask) | 3 (source file dialog, Generate, Download) |
| Per slide S | 1 (paste into the template by hand) | 0 |
| Total | `2 + S` | `3` |
| Crossover | - | **S\* = 2**, so the app wins from S = 3 |

**Concession, stated because the row demands it:** if the owner's chat product
has code execution and file output, the per-slide paste disappears and the chat's
total collapses to roughly `2 + k` for small k. The app's remaining advantages
are then only the two in section 8 - the guarantee and the not-being-re-told -
and this design must not be sold on click count alone.

### 5.4 The design's own count, and the constraints that hold it there

Target: **3 warm interactions, 6 cold, and ZERO prerequisites.**

| # | Interaction | Warm cost | Why it is not more |
|---|---|---|---|
| 1 | Drop / pick the source file | 1 | one file dialog, not a kind picker: `extractTextFromBuffer` already dispatches on extension across 50 extensions (section 6) |
| 2 | Generate | 1 | - |
| 3 | Download | 1 | - |
| (cold only) | 2 nav clicks | 0 warm | `ta-active-tab` + `ta-manual-view` |
| (cold only) | Upload the template once | 0 warm | a new `ta-ppt-template-file-id` key; the template is a term-long choice, not a per-deck one |
| Subject | 0 | derived from the source's own filename/first heading, NOT asked. `index.tsx:342` already falls back to `selected.name` |
| Course | 0 | path P requires none (2.2), and this design must not introduce one |
| Format | 0 | one dialog, extension-dispatched |

**HARD ACCEPTANCE CONSTRAINTS the criteria seat must carry forward, each stated
as a direction of failure:**

- **C1.** Generating a deck from a dropped source with **no course selected**
  must succeed. FAILS if any new code path reads a course id. Instrument: a
  source-text test asserting no `hubCourse`/`courseId`/`canvasUrl` identifier
  appears in the new ppt-design files.
- **C2.** Generating must succeed with **no subject typed**. FAILS if the
  Generate button is disabled or the action refuses when `subject` is empty.
- **C3.** The source control must be **one** interaction, not a kind selector
  plus an input. FAILS if the new panel renders more than one input whose value
  the user must set before Generate.
- **C4.** The template choice must persist. FAILS if a second deck in the same
  term costs a template interaction. (This is the A39 lesson applied: the
  rubric re-paste is `docs/a39-census.md:568-572`, ranked the single
  highest-count defect in that census.)

**A design that asks for a course, a template and a format before the first
slide would cost 6 warm instead of 3 and would reproduce A39's finding exactly.
That is the thing to refuse, and C1-C4 are how a checker can see the refusal.**

---

## 6. Q4 - where the source comes from, and whether the intake is reusable

### 6.1 The reusable intake exists and is the right one

`src/lib/office-extract.ts:179` `extractTextFromBuffer(name, buffer)` -
"Extract plain text from a file's bytes, dispatching on its extension"
(`:174-178`). It handles:

- `TEXT_EXTENSIONS` (`:13`) - **39** entries, measured:
  `sed -n '13,54p' src/lib/office-extract.ts | grep -cE '^\s*"[a-z0-9]+",?$'`
  -> 39. They include `py js ts tsx jsx java c cpp cs rb go rs php swift kt
  scala r m sql sh ipynb md json xml csv`.
- `DOCUMENT_EXTENSIONS` (`:55`) - **11** entries, measured the same way ->
  11: `docx doc pptx ppt xlsx xls odt odp ods pdf rtf`.

So **50 extensions** are already handled, including the three the owner named by
implication: a homework `.docx`, chapter objectives in `.pdf` or `.docx`, and
source code files from a repo.

**Constraint:** `office-extract.ts:9` states it "must only ever be imported" by
server code, because it pulls `jszip` and `officeparser`. So the browser posts
base64 to a server action, exactly as `extractPptxSlidesAction` does
(`media.ts:390-403`), including that action's wire budget check
(`media.ts:396-401`, `checkWireBudget` against `UPLOAD_WIRE_BUDGET_BYTES`).

### 6.2 The repo case, and the second-spelling risk

The owner lists a repo FIRST. Two repo intakes exist today and neither is an
upload:

1. **`ingestRepoAction(repoRef, branch)`** (`src/app/actions/github.ts:258`) -
   takes `owner/name` or a github.com URL (`:262`) and returns a `RepoDigest`.
   This is the one path W uses (`registry-helpers.sources.ts:695`).
2. **A codebase `.zip`** - `src/app/actions/syllabus-adapt.ts:58`
   `summarizeCodebaseZip(zipBase64)`, reached from a `.zip` input
   (`grep -rn 'accept=' --include=*.tsx src/` shows
   `".zip" ref={adaptZipRef} disabled={!!adaptRepo.trim()}`, i.e. a surface that
   already offers "a repo ref OR a zip" and disables one when the other is set).

**Reuse verdict.** `ingestRepoAction` IS reusable and should be reused: it takes
a bare string, requires no course tile (`:260-263` is `requireOwner()` + parse +
`ingestRepo`), and the whole repo-digest formatting is already written. But it
is a TEXT FIELD, not a file dialog - so honouring C3 means the source control
must accept either a dropped file or a pasted string in **one** field, the way
the syllabus-adapt surface already pairs them, rather than adding a second
labelled input. **A third spelling of "give me a source" would be the defect the
row warns about.** Current spelling count for this one act, measured: 33 files
carry `type="file"` (`grep -rln 'type="file"' --include=*.tsx src/ | wc -l`),
and the distinct `accept=` values number 24 lines
(`grep -rhn 'accept=' --include=*.tsx src/ | sed 's/.*accept=//' | sort -u | wc
-l` -> 24).

### 6.3 What this design should NOT reuse

`gatherModuleMaterials` (`registry-helpers.sources.ts:144`) - it takes
`(tile: Course, moduleIdRaw, helpers, onProgress, policy, options)`. Its first
parameter is a course tile. Reusing it would import the course prerequisite this
design exists to avoid (C1). The right reuse is one level down:
`extractTextFromBuffer` for files, `ingestRepoAction` for repo refs.

---

## 7. Q5 - what happens when the content does not fit the template

### 7.1 Today, three truncations exist and the instructor sees none of them

| # | What is dropped | Citation | What the instructor sees |
|---|---|---|---|
| T1 | **Bullets past the slide's cap** | `src/lib/decks/generate.ts:250` `bullets: (raw.bullets ?? []).slice(0, maxBullets)`, and `:319` `bullets.slice(0, spec.maxBullets)` | **nothing.** No count, no log, no note. |
| T2 | **Title text past 60 characters** | `SLIDE_TITLE_MAX_CHARS = 60` (`src/lib/slide-prompt.ts:38`); `enforceTitleLength` (`:515-545`) | **nothing user-facing.** This one is well designed - it relocates the dropped clause into the first bullet (`:537-541`) and it COUNTS (`:534`, returned at `:545`) - but all three callers send the count to the console only: `src/lib/decks/generate.ts:464-467` (`console.error`), `src/app/actions/shared.ts:365-368`, `src/app/actions/course-planning-grounding.ts:909-912`. |
| T3 | **Text longer than the shape it is drawn into** | `src/lib/pptx.ts` has **no** overflow handling: `grep -niE "truncat\|overflow\|shrink\|autofit\|clip" src/lib/pptx.ts` exits 1 with no output. Canary that the file is being read: `grep -c "addText" src/lib/pptx.ts` -> 23, and `grep -nE "fit:\|shrinkText\|autoFit\|valign" src/lib/pptx.ts` returns 10 `valign` lines and zero `fit`/`shrinkText`/`autoFit`. | **nothing until PowerPoint opens it**, and then overflowing text, because pptxgenjs applies no shrink-to-fit unless asked. |

**T2 is the design precedent to copy and T1/T3 are the bugs to not repeat.**
`enforceTitleLength` does the right three things: it counts, it relocates rather
than discards, and it never silently changes a title it cannot improve
(`:533` `if (!nextTitle || nextTitle === title) return slide;`). What it lacks is
a route to the screen.

### 7.2 What an uploaded template adds

Three new mismatch classes, none of which any existing code can see:

- **Text longer than a shape.** A `.pptx` shape has a fixed box. The writer
  replaces a paragraph's text runs; it does not measure. **There is no way to
  measure rendered text length in this environment** (no browser layout, no
  font metrics, nothing renders under vitest). So the honest instrument is a
  CHARACTER BUDGET derived from the template's OWN original text: the paragraph
  the owner wrote in that shape is a worked example of what fits. Budget =
  `k * len(original)` for a declared k.
- **More sections than the template has slides.** This is the section 3.5
  constraint, and it is COUNTABLE exactly: `parseOfficeParagraphs` gives the
  slide count; `expandTemplate` gives the required count.
- **An image where the template wants none, or a graphic with no home.** The
  existing `graphic` field renders via pptxgenjs shapes (`src/lib/pptx.ts:239-242`,
  `src/lib/slide-graphics.ts`). A file-backed template has no declared graphic
  area, so a graphic must be DROPPED, and dropping it silently is the T1 defect
  again.

### 7.3 What the instructor must see - the requirement

**A FIT REPORT, rendered next to the Download button, listing every adjustment
by slide, before the download, and counting zero as "nothing was cut".** Not a
console line. Not a toast. Four counted classes:

| Class | Reported as |
|---|---|
| Slide-count mismatch | "Your template has 12 slides; this deck needs 40. 28 slides were created by copying slide N." (wave 3) or, before wave 3, a REFUSAL: "Your template has 12 slides and this deck needs 40. Pick a shorter shape or a longer template." |
| Text over a shape's character budget | "Slide 7, body: 340 characters placed into a shape whose original text was 120. It may overflow." - with the overflowing text also placed in the slide's speaker notes, so nothing is lost |
| Bullets dropped | "Slide 3: 6 bullets generated, 4 placed, 2 moved to speaker notes" |
| Graphic dropped | "Slide 5: a table graphic was generated and this template declares no graphic area, so it was omitted" |

**DIRECTION OF FAILURE for the whole section: any adjustment that reaches the
downloaded file without a corresponding line in the fit report is a defect. A
zero-adjustment deck must say so explicitly, because a blank report is
indistinguishable from a missing report.** That last clause exists because T1
today produces a blank nothing and reads as success.

---

## 8. Q6 - the leverage claim, argued against the mechanism

Per `docs/loop/leverage.md`: a claim names a mechanism, and a class is EARNED
only if the feature had to build something to get it.

### 8.1 What is claimed - GUARANTEED, earned

**Claim.** A chat can draft slide text and can be handed a template to imitate.
It cannot make the OUTPUT FILE be the owner's file. This feature makes the
output file the owner's uploaded `.pptx` by construction: the model's response
never touches the zip, and every part of the presentation other than the text
runs the writer rewrote is carried through byte-for-byte
(`office-edit.ts:383-392`, `:454`).

**Why it is EARNED and not inherited.** Failure-mode-B count: the mechanism is
"a deterministic writer places model output into a user-supplied file". Today
`applyOfficeSections` is called for a user-supplied file from exactly TWO places
(`src/lib/canvas-modules/office.ts:143,192` and
`src/lib/canvas-modules/office-accessibility.ts:235`), and in both the source is
a Canvas-hosted document being edited in place - never a template a generator
fills. Zero of the four deck paths (section 2) do this. So the class is not free
here.

**Removal test, with the deletion named.** Delete the `applyOfficeSections` call
in the new writer and hand the model's slides to `buildSlidesPptx` instead. The
assertion whose observed value changes: a test that loads the uploaded template
with `jszip`, loads the produced file with `jszip`, and asserts every zip entry
whose name is NOT `ppt/slides/slideN.xml` is byte-identical between the two.
With `buildSlidesPptx` it fails immediately - the produced zip has an entirely
different part list. **This test is buildable in THIS checkout**, because the
guarantee is a byte property of a zip, not an appearance property. Nothing needs
to render. That is the single most important thing this design has going for it.

### 8.2 Second claim - CORPUS, earned, thin

**Claim.** The template is uploaded once and read back on every later deck for
the whole term. A chat must be re-handed the template file on every new
conversation.

**Mechanism.** A `deck_template_files` row plus `ta-ppt-template-file-id`; the
read-back is the later generate. Modelled on `syllabus_templates`
(`migrations/20260709000000`).

**Honest limit.** Per `leverage.md`'s struck "Persistence (generic)" row - 262
files import a Supabase client - merely writing a row is free here. This earns
CORPUS only because of the READ-BACK on a later act. Its removal test is the
weaker kind (assert `listDeckTemplateFiles` returns the row and that the
generate path consults it), so it should be claimed as the second, thinner
claim, not the headline.

### 8.3 Third claim - SCALE, weak, and I recommend conceding it

**Claim.** The same template applied across every module of a term without being
re-told.

**Why it is weak.** `leverage.md`'s SCALE exemplar is `gradeStudentEntries`
pinning one rubric/criteria pair and looping it over a batch as ONE unit
(`src/lib/grade/engine.ts:113-134`). Nothing in this design batches: each deck
is one act. The real content of this claim is 8.2's read-back. **Concede it:
this is CORPUS again, not SCALE.** It becomes SCALE only if a later row runs one
template over N modules in one act, which the workflow step
`generate-presentation-from-template` is the natural home for and which is NOT
in this scope.

### 8.4 What is CONVENIENCE and must be conceded

- **"Provenance: which template version produced this deck."** The row suggests
  this as a claim (`docs/backlog.yml:645`) and it is real but **it is not this
  feature's advantage over a chat** - it is a stamped column, and per
  `leverage.md`'s struck "Persistence (generic)" row a stamped column is free
  here. It is worth building (one `template_file_id` + `template_sha256` on the
  saved deck row) and it is worth exactly one sentence, not a leverage claim.
  A3 is being redesigned around the provenance class and this should not
  duplicate its argument.
- **Fewer clicks (section 5.3).** Real, and per `leverage.md` "it is not a
  categorical advantage over a chat - it is a claim about steady-state assembly
  cost". Name it as click cost or not at all.
- **Everything about how the deck LOOKS.** Nothing renders here. No claim.

### 8.5 What I must NOT claim, as the brief instructs

- **Memory** beyond the one read-back in 8.2. A research pass falsified a
  broader memory claim; this scope claims only the template row.
- **LMS write-back.** Not in this scope and falsified as a claim.

---

## 9. What can and cannot be verified in this environment

Per `docs/loop/this-repo.md` section 6.

### 9.1 CAN be verified here, and this is more than usual

- **The byte guarantee** (8.1) - `jszip` runs under node, vitest is node-env
  (`docs/loop/this-repo.md` section 2), so loading two zips and diffing their
  entry bytes is an ordinary unit test. No network, no key, no render.
- **Slide/paragraph parsing** - `parseOfficeParagraphs` is pure over a `Buffer`.
- **The fit report's arithmetic** - counts and character budgets are pure.
- **Reachability** - source-text tests. 68 `*.wiring.test.ts` and 17
  `*.structure.test.ts` files exist per `docs/loop/this-repo.md` (which itself
  says to re-measure rather than quote; I did not re-measure and am not quoting
  these as this pass's numbers).
- **Fixture construction** - no `.pptx` is tracked (3.2), so every test must
  BUILD one with `jszip` in the test body. That is a real obligation, not a
  detail: a synthetic fixture that does not match PowerPoint's real part layout
  would make a green suite meaningless. See RES-A43-4.

### 9.2 CANNOT be verified here

- **Whether the produced file opens in PowerPoint.** Owner verification.
- **Whether text overflows a shape.** No font metrics, no layout engine, nothing
  renders. The character budget in 7.2 is a PROXY and must be described as one.
- **Whether the owner's actual template file parses** (3.5's `.potx` risk).
- **Any model output.** No API key (`docs/loop/this-repo.md` section 6). Every
  LLM path is mocked; tests are network-blocked by `vitest.setup.ts`.
- **Any claim about the new controls' appearance, focus order or keyboard
  behaviour.** Reading claims only.
- **RLS on the new table.** No live database, no local migration apply.

---

## 10. Wave plan

Each wave's list contains the file that CALLS or RENDERS the new capability.
Line counts are `wc -l` from the Bash tool, 2026-09-27; the mandated PowerShell
instrument is `@(Get-Content <file>).Count` and an implementer must re-measure
with it before trusting headroom against the 1000-line ceiling
(`src/file-size-ceiling.structure.test.ts`, `LIMIT = 1000` at `:41`).

### Wave 1 - A43-S: an uploaded source reaches the manual deck path

Smallest useful increment. Ships value on its own with no template work.

| File | Role | Now |
|---|---|---|
| `src/lib/decks/deck-source.ts` | NEW. Pure: normalise an extracted source to materials text + a receipt (name, bytes, characters, whether it was truncated for the prompt) | - |
| `src/lib/decks/deck-source.test.ts` | NEW | - |
| `src/app/actions/deck-source.ts` | NEW `"use server"`. base64 -> `extractTextFromBuffer`; a repo ref -> `ingestRepoAction`. Wire budget via `checkWireBudget`. Only async exports (`src/lib/use-server-exports.test.ts`) | - |
| `src/app/components/ppt-design/GeneratePanel.tsx` | **RENDERS** the one source control (C3) and the source receipt | 400 |
| `src/app/components/ppt-design/index.tsx` | **CALLER.** Add `materials` to the `ctx` at `:341-344`; derive `subject` from the source when empty (C2) | 595 |
| `src/app/components/ppt-design/hooks.ts` | Persist the source receipt under a new `ta-ppt-source-*` key | 156 |

Gate: C1 (no course identifier appears in these files), C2, C3.

### Wave 2 - A43-T part 1: upload a `.pptx` template and obey it, fixed length

| File | Role | Now |
|---|---|---|
| `supabase/migrations/<ts>_create_deck_template_files.sql` | NEW table on the `syllabus_templates` shape (`20260709000000`), idempotent, owner-scoped RLS, lexically checked by `src/supabase-migrations.structure.test.ts` | - |
| `src/lib/decks/pptx-template.ts` | NEW. Pure over a `Buffer`: slide count, per-slide paragraph slots, each slot's original character length (the budget basis, 7.2), and the `sections` array `applyOfficeSections` consumes | - |
| `src/lib/decks/pptx-template.test.ts` | NEW. Builds a synthetic `.pptx` with `jszip` (no fixture exists, 3.2) | - |
| `src/lib/office-edit.pptx.test.ts` | NEW. **The first direct test of `office-edit.ts`'s pptx branch** (RES-A43-1). Round-trips a synthetic pptx through `parseOfficeParagraphs` + `applyOfficeSections` and asserts non-slide parts are byte-identical | - |
| `src/app/actions/deck-template-files.ts` | NEW `"use server"`: upload / list / delete, plus the fill call | - |
| `src/lib/supabase/types.ts` | The new table's Row type | - |
| `src/app/components/ppt-design/TemplateSelector.tsx` | **RENDERS** the template upload control and the uploaded-template list | 154 |
| `src/app/components/ppt-design/index.tsx` | **CALLER.** Route a file-backed template to the new writer instead of `buildSlidesPptx` | 595 |

Gate: the byte-identity removal test of 8.1 must exist and must be watched
FAILING when the writer is swapped for `buildSlidesPptx`.

### Wave 3 - A43-T part 2: slide cloning, so the deck can be longer than the template

Not optional if the owner wants the existing lecture shapes (3.5).

| File | Role |
|---|---|
| `src/lib/decks/pptx-clone.ts` | NEW. Duplicate a slide part: `ppt/slides/slideN.xml`, `ppt/slides/_rels/slideN.xml.rels`, a new `rId` in `ppt/_rels/presentation.xml.rels`, a `<p:sldId>` in `ppt/presentation.xml`'s `sldIdLst`, and an Override in `[Content_Types].xml`. Nothing in the tree does any of this (canaried, 3.2) |
| `src/lib/decks/pptx-clone.test.ts` | NEW |
| `src/lib/decks/pptx-template.ts` | **CALLER** |
| `src/app/components/ppt-design/GeneratePanel.tsx` | **RENDERS** the slide-count line of the fit report |

### Wave 4 - the fit report reaches the screen

| File | Role |
|---|---|
| `src/lib/decks/fit-report.ts` + `.test.ts` | NEW. Pure: the four counted classes of 7.3, plus the zero case |
| `src/lib/decks/pptx-template.ts` | **CALLER** - emits the report alongside the buffer |
| `src/app/components/ppt-design/GeneratePanel.tsx` | **RENDERS** it beside Download |
| `src/app/components/ppt-design/index.tsx` | **CALLER** - threads it through |

Optional in the same wave, and cheap: route `enforceTitleLength`'s existing
`shortened` count (T2) into the same report instead of `console.error`, which
touches `src/lib/decks/generate.ts:464-467` only.

### Wave 5 - A43-C: "ask for things" - RECOMMENDED OUT OF A43

Grounds, measured: there is **no function/tool calling anywhere**.
`grep -rniE "functionDeclaration|functionCall|tools" src/app/api/ai-chat/route.ts`
returns one line, `:517`, which is a comment about a canned acknowledgment
string; canary that the file greps is `grep -c "export async function POST"` ->
1. `src/lib/llm.ts:519` uses `tools: [{ google_search: {} }]`, which is Google's
search grounding, not app tools. The chat's attachment path exists
(`src/lib/chat/attachments.ts:24` budget, `:30`
`MAX_ATTACHMENTS_PER_MESSAGE = 6`) and `src/app/api/ai-chat/route.ts` is 717
lines, but nothing there can invoke a deck action.

Building function calling is a platform capability, not a wave of a deck
feature. **Recommend a separate row**, and note that waves 1-4 already deliver
the owner's "smoothly upload" at 3 warm interactions without it.

### Structural notes for the plan seat

- `src/app/components/slide-studio/DeckModeSection.tsx` is 261 lines (`wc -l`)
  and owns the only `.pptx` input today (`:73-79`). It is NOT in any wave's
  write set: its upload feeds narration/video, a different feature.
- No wave should touch `src/lib/office-edit.ts` itself. Wave 2 adds its first
  test; a behaviour change there would ripple into three Canvas features
  (`canvas-modules/office.ts`, `office-accessibility.ts`, `media.ts`).
- Concurrency: `npx tsc --noEmit` is not concurrency-safe
  (`docs/loop/this-repo.md` section 2); exactly one caller runs it, and it is
  the wave gate.

---

## 11. Residual register

Each entry names an OWNER, an INSTRUMENT, the OBJECT under comparison, the
DIRECTION OF FAILURE, and the STEP. Per `docs/DEV_LOOP.md` step 0, a residual
that is not in `docs/BACKLOG.md` does not exist, so each of these is owed a
backlog entry by whoever lands the first A43 chunk. **I did not write them
there: `docs/backlog.yml` and `docs/BACKLOG.md` are outside my write set.**

| id | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| RES-A43-1 | **`src/lib/office-edit.ts` (755 lines, `wc -l`) has no direct test, and all four test files that reach it mock it.** Measured: `git ls-files \| grep -c "office-edit.*test"` -> 0; and for each of the four files found by `grep -rl "office-edit" --include=*.test.ts src/`, `grep -c 'vi.mock("@/lib/office-edit"\|vi.mock("../office-edit"' <file>` -> 1. The whole shape-(a) guarantee rests on this file. | The wave-2 implementer. | The new `src/lib/office-edit.pptx.test.ts`, run via `npm run test:paths -- src/lib/office-edit.pptx.test.ts src/lib/decks/pptx-template.test.ts`. | Object: a synthetic pptx's zip entries before and after a round trip. **FAILS if any entry outside `ppt/slides/` differs by a single byte.** | Wave 2, first commit, before any UI work. |
| RES-A43-2 | **No `.pptx` fixture is tracked** (`git ls-files \| grep -icE "\.(pptx\|potx\|docx\|thmx)$"` -> 0; canary `\.sql$` -> 109), so every test builds its own with `jszip`. A synthetic fixture that does not match PowerPoint's real part layout makes a green suite meaningless. | The wave-2 implementer, then the repo owner. | The fixture builder itself, plus the owner opening one produced file in PowerPoint. | Object: the synthetic fixture's part list against a real PowerPoint export's. **FAILS if PowerPoint refuses the produced file while every test is green.** | Wave 2 authors the builder; owner verification confirms one real round trip. |
| RES-A43-3 | **Text-overflow detection is a character-count PROXY, not a measurement.** Nothing renders here; there are no font metrics. `src/lib/pptx.ts` sets no `fit`/`shrinkText`/`autoFit` (`grep -niE "truncat\|overflow\|shrink\|autofit\|clip" src/lib/pptx.ts` exits 1; canary `grep -c "addText"` -> 23). | The repo owner. | Generate one deck whose body text is 3x the template's own paragraph length and open it. | Object: the fit report's "may overflow" lines against what PowerPoint actually shows. **FAILS if text overflows a shape with no report line, or a report line fires on text that fits comfortably.** | Owner verification, after wave 4. |
| RES-A43-4 | **A `.potx` may contain zero `ppt/slides/` entries.** `sortedSlides` (`src/lib/office-edit.ts:341-345`) matches only `/^ppt\/slides\/slide\d+\.xml$/i`, so such a file parses to zero paragraphs and the feature would silently do nothing. Unverifiable here (RES-A43-2). | The repo owner. | Upload the owner's real template and read the reported slide count. | Object: the reported slide count against the count PowerPoint shows. **FAILS on a reported count of 0, and DOUBLE-FAILS if the UI accepts the upload without saying so.** | Before wave 2's UI is considered done. A wave-2 acceptance criterion: a template parsing to zero slides must REFUSE with a stated reason, never accept silently. |
| RES-A43-5 | **Slide cloning does not exist** (`grep -rniE "sldIdLst\|presentation\.xml\|appendPptx\|addSlideXml\|cloneSlide\|_rels/slide" --include=*.ts --include=*.tsx src/` returns nothing, exit 1; canary `sortedSlides` -> 6), so before wave 3 a deck is capped at the template's own slide count, while the app's own lecture shapes reach 79-82 slides (`src/lib/slide-token-budget.ts` header arithmetic). | The wave-3 implementer. | A unit test asserting the produced deck's slide count equals `expandTemplate`'s count, not the template's. | Object: produced slide count against required slide count. **FAILS whenever they differ AND the fit report does not say a refusal happened.** | Wave 3. Until then, wave 2 must REFUSE a mismatch loudly rather than truncate. |
| RES-A43-6 | **T1: bullets past `maxBullets` are dropped with no count and no log** (`src/lib/decks/generate.ts:250`, `:319`). Pre-existing, on every deck path, not created by A43. | The wave-4 implementer (the fit report is its natural home). | A unit test over `toDeckSlide` with 6 bullets and `maxBullets` 4. | Object: the returned bullet count and the returned adjustment count. **RED on today's code, which returns 4 bullets and no count at all** - so it must be watched failing first. | Wave 4. |
| RES-A43-7 | **T2: `enforceTitleLength`'s `shortened` count reaches only the console** (`src/lib/decks/generate.ts:464-467`, `src/app/actions/shared.ts:365-368`, `src/app/actions/course-planning-grounding.ts:909-912`). | The wave-4 implementer, for the ppt-design path only; the other two call sites belong to other surfaces and are relocated debt, not this scope. | `grep -n "console.error" src/lib/decks/generate.ts` plus an assertion that the returned object carries the count. | Object: the count in the returned value against the count in the console. **FAILS if the only record of a shortened title is a console line.** | Wave 4 for the ppt-design path. The other two sites: a backlog entry for whichever chunk next writes those files. |
| RES-A43-8 | **A43-C (conversational ask) is deferred out of this row** and no function-calling layer exists (section 10, wave 5). If it stays inside A43 the row cannot close. | The repo owner, as a scope decision. | Section 10's canaried greps, re-run. **The finding stands only while they stay empty.** | Object: A43's closing condition against the owner's sentence. **FAILS if A43 is marked done while the owner still expects to ask conversationally.** | Before A43 is chunked. This is the one item that needs an owner answer rather than an agent decision. |
| RES-A43-9 | **Provenance (which template file and version produced a given deck) is scoped IN as one stamped column, not as a leverage claim** (8.4). It overlaps A3's provenance redesign. | The wave-2 implementer, coordinating with whoever owns A3. | The saved deck row's `template_file_id` + `template_sha256`. | Object: a saved deck row against the template file bytes it was built from. **FAILS if two different template files can produce rows indistinguishable in provenance.** | Wave 2, same migration. |
| RES-A43-10 | **Every interaction count in section 5 is a reading claim**, traced from control to handler. Nothing renders under vitest. Same limit A39 recorded as RES-A39-2. | The repo owner, in a real browser. | Walk path P cold and warm and count the acts against section 5.2 and 5.4. | Object: the observed act count against the tabled count. **FAILS if warm exceeds 3 for a second deck in the same term.** | Owner verification, after wave 1. |

---

## 12. Instruments used in this pass

Reproducible, in the Bash tool from the repo root. Line counts are `wc -l`; the
PowerShell mandate is `@(Get-Content <file>).Count` and the two instruments
disagree by 15 to 138 on files where they disagree at all
(`docs/loop/this-repo.md`, section 3), so an implementer must re-measure before
trusting any headroom claim against the 1000-line ceiling.

```
git ls-files | grep -icE "slide|pptx|deck"                    -> 75
git ls-files | grep -icE "template"                           -> 37
git ls-files | grep -icE "\.(pptx|potx|docx|thmx)$"            -> 0   (canary \.sql$ -> 109)
git ls-files | grep -c "office-edit.*test"                     -> 0
git ls-files | grep -c "a43"                                   -> 0
grep -rn "buildSlidesPptx" --include=*.ts --include=*.tsx src/ | wc -l  -> 75
grep -rln 'type="file"' --include=*.tsx src/ | wc -l           -> 33
grep -rn 'accept=' --include=*.tsx src/ | grep -i "pptx" | wc -l -> 1
grep -rhn 'accept=' --include=*.tsx src/ | sed 's/.*accept=//' | sort -u | wc -l -> 24
sed -n '13,54p' src/lib/office-extract.ts | grep -cE '^\s*"[a-z0-9]+",?$'  -> 39
sed -n '55,68p' src/lib/office-extract.ts | grep -cE '^\s*"[a-z0-9]+",?$'  -> 11
grep -niE "truncat|overflow|shrink|autofit|clip" src/lib/pptx.ts -> exit 1, no output
                                              (canary: grep -c "addText" -> 23)
grep -rniE "sldIdLst|presentation\.xml|appendPptx|addSlideXml|cloneSlide|_rels/slide" \
  --include=*.ts --include=*.tsx src/                          -> exit 1, no output
                                              (canary: sortedSlides -> 6)
grep -rniE "slideLayout|sldLayout|slideMaster|sldMaster|potx" \
  --include=*.ts --include=*.tsx src/                          -> 12 lines, all write-side
grep -niE "course" src/app/components/ppt-design/index.tsx     -> no output
                                              (canary: grep -c "selected" -> 83)
grep -rniE "functionDeclaration|functionCall|tools" src/app/api/ai-chat/route.ts -> 1 line, a comment
                                              (canary: grep -c "export async function POST" -> 1)
wc -l on: office-edit.ts 755, pptx.ts 680, decks/generate.ts 474, decks/types.ts 521,
  decks/presets.ts 391, ppt-design/index.tsx 595, GeneratePanel.tsx 400,
  TemplateSelector.tsx 154, DeckSettingsPanel.tsx 242, SlidesPanel.tsx 512,
  AddContentPanel.tsx 77, hooks.ts 156, utils.ts 24,
  slide-studio/DeckModeSection.tsx 261, slide-studio/useDeckMode.ts 489,
  useLmsGenerationDeckTemplates.ts 76, lms-generation/deck.ts 296,
  slide-graphics-repair.ts 251, pptx-graphics-audit.ts 216,
  registry-helpers.sources.ts 814, chat/attachments.ts 279,
  api/ai-chat/route.ts 717, ModuleDeckCapturePanel.tsx 843,
  deck-from-capture/route.ts 157, lms-generation/deck/route.ts 194,
  syllabus-adapt.ts 485, syllabus-upload.ts 246, syllabus-templates.ts 459
```

**One instrument defect I made and corrected, recorded because the rules
require it.** The first spelling of the office-fixture check was
`git ls-files | grep -iE "..." | cat; echo "exit=$?"`, which reports `cat`'s
status (0) rather than grep's (1), and would have read as "matches found" with
no output. Re-run without the pipe to `cat`: grep exits 1, and the
`grep -c` form quoted above is immune to the confusion entirely.

**A claim I deliberately did not make.** `docs/loop/this-repo.md` gives counts
for `*.wiring.test.ts` (68) and `*.structure.test.ts` (17) and tells the reader
to re-measure rather than quote them. I did not re-measure, so section 9.1 cites
the card rather than presenting those as this pass's numbers.
