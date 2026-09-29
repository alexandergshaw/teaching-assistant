# A43-C scope + architecture: the conversational ask over a template-conformant deck

- Item: A43-C, the conversational-ask layer of backlog row `A43`
  (`deck-generation-from-source`), kind feature.
- Seat: `loop-architect` (Opus). A fresh `loop-checker` gates this document
  before any implementer builds from it.
- Consumes: `docs/a43-scope.md` (REVISION 2) sections 9, 11.7 and 12 (the prior
  A43-C sketch); `docs/owner-decisions-2026-09-27.md` DECISION 15 (the owner
  kept A43-C and named the three non-relaxable constraints); the `A43` backlog
  row note and `question` field (`docs/backlog.yml:727-738`); the shipped
  template guarantee (T1 `f497303`, T2 `e4021de`); and the PRES-1 library
  (`6464a523`/`c20a9063`/`fda6bc52`) as the freshest deck infra to reuse from.
- Produces: the SHAPE - which object the operation set binds to, the closed op
  set, the per-op schema, the validating dispatcher, the refusal path, where the
  turn executes, the disjoint wave cut, the `owns` set, the disposition of the
  prior sketch, and the residuals.
- This document decides SHAPE only. No production code. Oracle construction,
  fixtures, the removal test and sabotage are the test seat's
  (`docs/loop/seats.md:59,416-431`); global-invariant accounting beyond the cut
  is the plan's.

All quantities name the command that produced them. Line counts use
`@(Get-Content <file>).Count` (PowerShell), the mandated instrument
(`docs/loop/this-repo.md` section 3); `Measure-Object -Line` is never used.
Absence claims are run WITHOUT a pipe so `$?` is grep's, each with a canary.
Measured at HEAD `d6eb26de`, 2026-09-29.

---

## 0. The fork status is QUEUE-RECORD STALENESS between two records. Reported, not silently adopted.

The brief and the backlog row both say the general-vs-specific fork is OPEN and
the scope must argue it with a recommendation, forbidding a default. But
`docs/a43-scope.md` (REVISION 2) already records it as DECIDED:

- `docs/backlog.yml:738` (`A43.question`), the durable queue record, verbatim:
  "STILL OPEN FOR THE REVISED SCOPE, deliberately not decided: whether this is a
  general tool-calling mechanism or a deck-specific operation set ... The scope
  must argue it with a recommendation rather than default to whichever is easier
  to write."
- `docs/a43-scope.md:865` (section 9.1): "RULED: a deck-specific operation set.
  Not general tool calling ... Adopted per RULING 54."
- `docs/owner-decisions-2026-09-27.md:60-65` (DECISION 15): the owner did NOT
  decide the fork - "it is the scope's to settle now that the disposition has
  changed ... the revised scope must argue it, with a recommendation."

So the queue record and the design record are stale against each other about
whether the fork is settled. The authority is the DURABLE record and the owner
decision: the backlog `question` (`docs/backlog.yml:738`) and DECISION 15
(`docs/owner-decisions-2026-09-27.md:60-65`) both say the SCOPE settles it with a
recommendation, and section 9.1's RULING 54 is that scope's own prior
recommendation, not an owner ruling. DECISION 15 independently and explicitly
hands the fork to the scope ("it is the scope's to settle now that the
disposition has changed ... the revised scope must argue it, with a
recommendation"), which is sufficient authority on its own to re-settle it here.
This document therefore RE-ARGUES the fork from the mechanism (section 2) rather
than inheriting RULING 54, reaches the same disposition on stronger and
re-measured grounds, and a reconciliation of the two records is filed as a
residual (RES-A43C-1) so the queue-record staleness is closed.

I did NOT adopt section 9.1's ruling silently, and I did NOT overturn it without
measuring. Both records now point at this document.

---

## 1. The headline: the op set binds to the DECK CONTENT MODEL, not the template `sections` array

This is the one decision every later A43-C wave is built against, and it is a
CORRECTION to the prior sketch. `docs/a43-scope.md:894-908` (section 9.2)
describes each operation as "a transformation of the `sections` array WITHOUT
changing the set of `sourceId`s in it", and H2 (`:1158`) is a runtime comparison
of the `sourceId` set before and after. **That binds the operation to the
template-coupled layer. It is the weaker of the two available shapes, and the
tree already shows why.**

The measured data flow, opened end to end:

1. `handleGenerateDeck` (`src/app/components/ppt-design/index.tsx:465-512`)
   calls `generateDeckFromTemplateAction` (`src/app/actions/media.ts:567`),
   which returns a `GeneratedDeck` = `{ presentationTitle: string; slides:
   PptxSlide[] }` (`src/lib/decks/generate.ts:36-39`).
2. That deck is held in client state as `editedSlides: PptxSlide[]`
   (`hooks.ts:201`, `useGenerationState`), and the instructor edits it in place
   with `onEditSlide` (`GeneratePanel.tsx:322-339`, wired at
   `index.tsx:746-750`) - a per-field mutation that NEVER changes
   `editedSlides.length`.
3. Only at Download/Save does `buildOutputPptx` (`index.tsx:517-543`) route the
   deck into the template: when a `.pptx` is uploaded it calls
   `fillDeckTemplateFileAction(selectedFileId, { presentationTitle, slides:
   editedSlides })` (`src/app/actions/deck-template-files.ts:145-178`), which
   maps the deck onto the template's own paragraphs by slide position through
   `planSlideTemplateFill` -> `fillOfficeTemplate` (T2 shipped).

The template `sections`/`sourceId` array is **an artefact of step 3 alone**. The
model never produces it and the instructor never sees it. The abstract object the
whole surface is built around - generated, edited, previewed, re-poured - is the
deck content model `PptxSlide[]`.

**RULING (this document): a conversational operation is a model-driven
`onEditSlide`. It transforms `editedSlides: PptxSlide[]` into a new
`PptxSlide[]`, and everything downstream of `editedSlides` - the fill mapping,
the slide-count refusal, the byte-identity writer - is reused UNCHANGED.** The
operation type is `PptxSlide[] -> PptxSlide[] | Refusal`, and `PptxSlide`
(`src/lib/pptx.ts:19-39`, `{ title; bullets; code?; codeLanguage?; notes?;
graphic?: SlideGraphic }`, cross-checked against the content-shape spec at
`docs/slide-spec.md:8-19`, which lists title/bullets/code/codeLanguage only)
carries no placement, no layout, no template handle, no `sourceId`. Its one
non-text field, `graphic?`, is an app-rendered content visual - a matrix, process
or table this app's OWN writer draws into pptxgenjs shapes
(`src/lib/pptx.ts:32-38`), NOT a template placeholder, a layout name, or any
handle onto the uploaded file - so the unrepresentable-by-type claim holds: there
is no field on the object the model produces through which it could reach the
template or the layout. (`notes?` and `graphic?` matter for a different reason in
sections 5 and 7: the op set must PRESERVE them, because `SlideContent` (section
6) omits both.)

Why this is strictly stronger than the `sections` binding, argued against the
mechanism and against this repo's own rule:

1. **The template is never in the model's hands, by the TYPE, not by a check.**
   Under a `sections` binding the model would emit content keyed to template
   `sourceId`s - i.e. it would be shown, and would name, the template's paragraph
   structure. Under the deck-content binding the model is shown slides (title +
   bullets) and returns slides. DECISION 15's own words
   (`owner-decisions-2026-09-27.md:39-47`): "the template is never in the model's
   hands ... if an operation cannot be expressed as content, it is not an
   operation." A `PptxSlide[]` transform IS "expressed as content" by
   construction.
2. **Construction beats review, which is the repo's stated rule**
   (`docs/backlog.yml:737`, the shape-(a) argument, verbatim: "a constraint
   enforced by construction beats one enforced by review"). H2 as
   written is a runtime set comparison on every dispatch - a review. Under the
   deck-content binding, the layout-reaching state is UNREPRESENTABLE: there is
   no `sourceId` on the object, so "an op that removes a `sourceId`" cannot be
   constructed. H2 survives as a downstream belt-and-suspenders check that fires
   for free because the fill path is unchanged (section 13, H2'), never as the
   primary enforcer.
3. **Zero new template-layer code.** The entire guarantee (H1 byte-identity, the
   single writer, the T2 counted slide-count refusal) already sits downstream of
   `editedSlides` and is reused verbatim. A `sections` binding would pull the
   conversational op set DOWN into `office-template-fill.ts`, coupling it to
   `office-edit.ts`'s paragraph model - a file NO wave may touch
   (`docs/a43-scope.md:1137-1139`, five production callers in four files).
4. **The no-add-slide constraint is enforced where the instructor's ask lives.**
   Slide count is the invariant that preserves template fit. Under the
   deck-content binding every op preserves `slides.length` by construction, and
   any produced deck whose length exceeds the template still hits T2's counted
   refusal (`buildSlideCountAdjustment`, `fit-report.ts:83-97`) at the unchanged
   fill boundary - a second, independent enforcement of the same rule.

What the deck-content binding CANNOT express, conceded: a template-paragraph-level
edit ("put this exact text in the third text box of slide 2"). That is a
placement operation, which the guarantee forbids anyway
(`owner-decisions-2026-09-27.md:42-45`), so nothing legitimate is lost. The one
operation in section 9.2's list that genuinely wanted the `sections` layer is
`drop` (empty every paragraph of a slide); its treatment and its one residual are
in section 5 and RES-A43C-2.

---

## 2. THE FORK: general tool-calling (X) vs a deck-specific operation set (Y)

**Recommendation: Y, a deck-specific operation set.** Re-argued from the
mechanism, re-measured at HEAD, not inherited from RULING 54.

### 2.1 The grounds, each measured

1. **There is nothing partial to extend into a general mechanism.** No
   function/tool-calling construct exists repo-wide:
   ```
   grep -rniE "functionDeclarations|function_declarations|functionCall|function_call|toolConfig|tool_config" \
     --include=*.ts --include=*.tsx src/     -> exit 1
   canary: grep -rniE "google_search" --include=*.ts --include=*.tsx src/ | wc -l   -> 1
   ```
   The single `tools:` site in the model client is Google search grounding, not
   app tools (`docs/a43-scope.md:876-878`, re-confirmed by the exit-1 above).
   X is a green-field capability surface, not an extension.
2. **A general dispatcher would own provider differences at a seam every later
   feature is built against.** `callLlm` has 133 non-test callers, re-measured at
   HEAD `d6eb26de`: `grep -rn "callLlm(" --include=*.ts --include=*.tsx src/ |
   grep -v "\.test\." | wc -l` -> 133. (`docs/a43-scope.md:880-881` recorded 127
   at an earlier HEAD; the order-of-magnitude argument is unchanged - it is well
   over a hundred callers either way.) A shared
   tool-calling seam over that surface is precisely what `docs/DEV_LOOP.md`
   routes to `loop-top`, not to a single deck row - and building it inside A43-C
   would make the row the de-facto owner of an app-wide contract with no
   consumer but itself.
3. **The structural guarantee makes the deck set naturally CLOSED; a general
   mechanism's whole value is that it is OPEN.** DECISION 15's constraint is
   "content only, never layout." A deck op set is finite because the set of
   content-only transforms of `PptxSlide[]` is finite (reword/expand/condense/
   retitle/retarget/reorder/drop - section 5). A general mechanism is valuable
   exactly when new operations can be added without re-touching the dispatcher,
   which is the opposite property - so a general mechanism used for A43 would
   still need a per-surface deck allowlist INSIDE it to hold the guarantee, i.e.
   it re-implements Y as a sub-component and adds a generic layer nothing else
   consumes.
4. **Continuity with two shipped patterns.** A closed, model-facing vocabulary
   with defensive coercion at the boundary exists twice: `coerceSlideGraphic`
   (`src/lib/slide-graphics.ts`, a `switch` over `matrix2x2`/`process`/`table`
   with a `default`) and `SlideRoleDef.promptContract`
   (`src/lib/decks/types.ts:156`, sixteen closed role contracts). Y copies a
   pattern the tree already trusts.
5. **The cost of being wrong is bounded and already accepted** by DECISION 15
   (`owner-decisions-2026-09-27.md:62-64`): "the deck-specific one is smaller and
   will be re-implemented the next time this need appears." One future
   re-implementation, against an unbounded new seam maintained for one consumer.

### 2.2 What X buys, conceded honestly

- **One implementation the next conversational surface reuses.** If PRES-1's
  authoring surface, or a future grading-comment surface, wants "ask for
  things," X would already have the dispatcher and schema registry. Y means each
  such surface writes its own closed set. This is a real saving and it is the
  only real thing X buys.
- **A single place to add safety once.** A general dispatcher could centralise
  prompt-injection defence and schema validation. Under Y each surface repeats
  it - but each surface's set is smaller and its guarantee is different, so the
  centralisation is shallower than it looks (see ground 3).

### 2.3 What would change the recommendation

Flip to X only if BOTH hold at scoping time, re-measured then, not now:
- A SECOND conversational surface is already scoped and in the queue (so the
  reuse in 2.2 has a named consumer, not a hypothetical one), AND
- that surface's operation set is NOT expressible as a content-only transform of
  a typed object (so Y's "closed by construction" property does not transfer and
  a general open mechanism is actually required).

Today neither holds: `grep -c "conversational\|tool-calling\|ask-for-things"
docs/backlog.yml` names no second consumer, and PRES-1's own surface is
regenerate-with-context (`docs/pres-1-architecture.md:24-49`), not a per-artifact
ask. So Y stands.

### 2.4 Is any of this the owner's call?

No. The general-vs-specific SHAPE is an architecture decision and DECISION 15
explicitly handed it to the scope (`:60-65`). It is recommended here, not punted.
The only owner-facing item is the record reconciliation (RES-A43C-1), which is
bookkeeping, not a fork. There is no terminating owner question from this
document (section 18).

---

## 3. Reuse survey (vetted, opened, `file:line`)

| Symbol | `file:line` | What it gives A43-C |
|---|---|---|
| `GeneratedDeck` / `PptxSlide` | `src/lib/decks/generate.ts:36-39`; `src/lib/pptx.ts:19-39` (cross-checked against `docs/slide-spec.md:8-19`) | The single deck content model the op set binds to (section 1). No new slide type is declared. |
| `editedSlides` state + `onEditSlide` | `hooks.ts:201`, `GeneratePanel.tsx:322-339`, `index.tsx:746-750` | The in-memory `PptxSlide[]` a conversational op replaces - the op is a model-driven `onEditSlide`. |
| `fillDeckTemplateFileAction` -> `planSlideTemplateFill` -> `fillOfficeTemplate` | `deck-template-files.ts:145-178`; `office-template-fill.ts:179` (`planSlideTemplateFill`), `office-template-fill.ts:109` (`fillOfficeTemplate`) | The unchanged fill path the transformed deck is re-poured through. H1 + byte-identity + slide-count refusal inherited whole. |
| `buildSlideCountAdjustment`, `buildOperationRefusedAdjustment`, `describeFitReport` | `src/lib/decks/fit-report.ts:83-97,159-161,213-218` | The counted refusal path. `operation-refused` ALREADY EXISTS and its header already names "section 9.3 ... constraint H3" - the fit-report was built anticipating A43-C. Reused verbatim. |
| `callLlm`, `LlmRequest` | `src/lib/llm.ts` (via `presentations/generate.ts:10`) | The one model call the ask turn makes. Server-only. |
| The T\|null + JSON-slice + validate idiom | `src/lib/presentations/parse.ts:57-111` (`parseDeckSlides` returns `DeckContent \| null`); `parseLenientJsonArray` (`src/lib/decks/generate.ts:147-165`, exported) | The parse/validate contract C1's dispatcher copies: a malformed model response becomes a typed null/refusal, never a crash and never a silent no-op. |
| The route shape: `requireUser` + `withDeadline` soft budget + styled partial | `src/app/api/presentations/generate/route.ts:25-42,140-168,194-207` | The exact server-route shape C3 mirrors: `runtime="nodejs"`, `maxDuration=60`, a `SOFT_DEADLINE_MS` wall, a 504 partial and a 502 on a failed call - never an unstyled Next 500. |
| `coerceSlideGraphic` | `src/lib/slide-graphics.ts` (`switch` over a closed vocab, `default: return undefined`) | The SHAPE of the dispatcher: a switch over a closed op vocabulary. Explicitly NOT its `default: undefined` (section 7). |
| `useLocalStorageState` / `ta-` keys | `hooks.ts:15-36,132-134` | The persistence idiom for the ask draft (section 12), matching this repo's standing `ta-` rule. |

**Half of the above were opened directly:** `office-template-fill.ts`,
`fit-report.ts`, `deck-template-files.ts`, `presentations/parse.ts`,
`presentations/generate.ts`, `presentations/generate/route.ts`,
`decks/generate.ts`, `ppt-design/index.tsx`, `GeneratePanel.tsx`, `hooks.ts`.

**PRES-1 reuse vs office-edit reuse, stated explicitly per the brief:**

- **From `src/lib/presentations/`**: the MODEL-BOUNDARY idiom only - `callLlm` +
  JSON-slice + T|null (parse.ts), and the route shape (auth + withDeadline wall +
  styled partial). A43-C does NOT reuse presentations' deck GENERATION
  (`generateOneArtifact` -> `parseDeckSlides` -> `serializeDeckToPptx`): that path
  BUILDS a fresh `.pptx` from scratch with `buildSlidesPptx` and never fills an
  uploaded template - it is exactly the non-guaranteed shape (b) DECISION 15's
  guarantee forbids. A43-C's deck already exists as `editedSlides`; C only
  TRANSFORMS it.
- **From `office-edit.ts` / `src/lib/decks/`**: nothing new. A43-C reuses the
  already-shipped fill path (T1/T2) UNCHANGED and adds `office-edit.ts` to no
  wave's write set. `fit-report.ts`'s `operation-refused` class is the single
  pre-built hook A43-C lands on.
- **Genuinely new**: the closed op set + dispatcher (`deck-operations.ts`), the
  ask prompt builder (`ask-prompt.ts`), the ask route (`api/decks/ask/route.ts`),
  and the ask box + its wiring in the existing panel. Nothing else.

---

## 4. Do-not-reuse list (with justification)

| Not reused | Why |
|---|---|
| `presentations/generate.ts` `generateOneArtifact` / `serializeDeckToPptx` deck path | Builds a fresh deck; does not fill the uploaded template. Shape (b), which the guarantee forbids. A43-C transforms an existing `editedSlides`, it does not generate. |
| `generateDeckFromTemplate` for `retarget` | It regenerates against the STRUCTURAL `DeckTemplate`, whose slide count is `expandTemplate`'s count - which need not equal the uploaded file's slide count. `retarget` must preserve the current slide count, so it re-writes the EXISTING `editedSlides`, not the structural template (section 5, `retarget`). |
| A `sections`/`sourceId` binding for the op set | Section 1: couples the op to `office-edit.ts`'s paragraph model, weakens construction to review, and would put the model's hands on the template's structure. |
| Any change to `src/lib/office-edit.ts` or `src/lib/llm.ts`'s `tools:` site | `office-edit.ts` has five production callers in four files (`docs/a43-scope.md:1137-1139`); `llm.ts:519` is search grounding, out of scope (`docs/a43-scope.md:1128-1130`). A43-C parses ops out of a JSON response, exactly as `coerceSlideGraphic` does - it does NOT add tool calling to the model client. |
| `requireOwner` / `requireAppOwner` | An uploaded deck and its edits are a per-user resource. Any new action or route uses `requireUser()` explicitly - `requireOwner` is a deprecated alias for `requireUser` (row R2, `docs/backlog.yml:91`), and A43-S/T already fixed this. |

---

## 5. The operation set, closed and enumerated

Each op is a content-only transform `PptxSlide[] -> PptxSlide[]` that PRESERVES
`slides.length`, so it provably cannot change the template's slide count or reach
its layout. The "how expressed" column is a transform of `editedSlides`, never of
template paragraphs.

**Content ops MERGE onto the existing slide; they do not replace it.** A content
op (`reword`, `expand`, `condense`, `retitle`, `retarget`) applies its
model-produced content as `{ ...slide, ...newContent }` for each touched slide -
PRESERVING `notes`, `graphic`, and every field the op does not set - matching the
existing `onEditSlide` merge idiom at
`src/app/components/ppt-design/index.tsx:747-750` (`updated[idx] = {
...updated[idx], ...updates }`). This is NOT a full replacement: `SlideContent`
(section 6) is a `Pick` that omits `notes` and `graphic`, so a full-replace
`applyDeckOperation` that returned the model's `content` alone would SILENTLY DROP
per-slide speaker notes and any graphic on every touched slide - and would pass
CO-COUNT, H2', H3 and H4 while doing it, because none of those inspects those two
fields. The merge is the only thing that preserves them (pinned by CO-PRESERVE,
section 13).

**The merge is by KEY the model actually returned (leave-unless-present), not by
the presence of a field on the type.** `applyDeckOperation` copies only the keys
present on the model's `content` object, so an omitted optional the op CAN set -
for example a `reword` whose `content` carries no `code` - LEAVES the existing
`code` intact rather than clearing it. A naive `{ ...slide, code: undefined }`
that spreads an absent key as `undefined` would wipe `code` and is forbidden. The
one op that DELIBERATELY clears deck-supplied content is `drop` (below), which
does so by intent, not by an accidental `undefined` spread.

| Operation | What the instructor asks | Transform on `editedSlides: PptxSlide[]` | Preserves count? |
|---|---|---|---|
| `reword` | "rewrite slide 3 more plainly" | MERGE model-produced `{title,bullets,code?}` onto `slides[i]` (keys returned only; `notes`, `graphic` preserved) | yes (1 slide merged in place) |
| `expand` | "add more detail to slide 3" | same as `reword`, model produces longer bullets (still <= the slide's cap; over-cap is a fit-report line, not a refusal) | yes |
| `condense` | "shorten slide 3" | same, shorter content | yes |
| `retitle` | "call slide 3 'Recursion basics'" | MERGE only `{title}` onto `slides[i]` (all other fields preserved) | yes |
| `retarget` | "re-aim the whole deck at beginners" | model returns EXACTLY `slides.length` content items; each MERGED onto its positional slide; dispatcher REFUSES on any count mismatch | yes (enforced) |
| `reorder` | "move the summary before the examples" | apply a permutation `order: number[]` of `[0..n)` to `slides` (whole `PptxSlide` objects move, so `notes`/`graphic` travel with their slide); dispatcher REFUSES a non-permutation | yes (permutation) |
| `drop` | "clear slide 4" | set `slides[i]` to `{ ...slides[i], title: "", bullets: [], code: undefined, codeLanguage: undefined, graphic: undefined }` - the one op that deliberately clears deck-supplied content; `notes` retained (see RES-A43C-2) | yes (slide kept, emptied) |

`drop` and the `sections` layer: `docs/a43-scope.md:907` defined `drop` as
"emits an EMPTY section for every paragraph of that slide." Under the deck-content
binding, emptying a slide's content clears the title, bullets, code and graphic the
deck supplies, but template placeholder paragraphs the deck does NOT fill retain their
original template text - because `planSlideTemplateFill` only emits replacements
for provided bullets (`office-template-fill.ts:188-198`), and an unreplaced
paragraph passes through byte-for-byte (`office-template-fill.ts:83-86`). This is
a PRE-EXISTING property of the T2 fill mapping (it already happens when the
instructor clears bullets manually), not something C introduces. A hard-blank of
every template paragraph on a dropped slide is a fill-boundary enhancement,
relocated as RES-A43C-2, not part of C's first ship. `drop` as scoped here is
honest: it empties what the deck controls and says so.

### 5.1 The refusals (H3 / H4), each with its counted reason

| Asked for | Why it refuses | Reason class + wording |
|---|---|---|
| "add a slide about X" | The writer cannot add a slide - proven inert at `src/lib/office-edit.test.ts:126-154`. Adding one is blocked on wave T3. | `slide-count-refusal` via `buildSlideCountAdjustment` when a produced deck exceeds the template; and an explicit add op maps to `operation-refused`: "I cannot add a slide to an uploaded template yet. Your template has N slides and that is what this deck has. Pick a longer template, or a shape with fewer slides." Must name T3. |
| "put this on two columns" / "use the dark variant" / "move the logo" | Layout, not content. DECISION 15: a request may not reach the writer, template, or layout. Unrepresentable in `PptxSlide` (section 1). | `operation-refused`: "That changes the layout of your template, and this feature is built so the model can never do that. Change it in PowerPoint and re-upload." |
| "delete slide 4" (remove, not empty) | Removing a slide changes the count and would drop a template slide. | `operation-refused`: "I can empty a slide's content, but I cannot remove a slide from your template." - and `drop` is offered as what it CAN do. |
| unrecognised op tag, or a recognised op whose schema does not validate | H3. | `operation-refused` with a reason - never `undefined`, never a no-op (section 7). |

---

## 6. Per-op schema shape (the model boundary contract)

The model emits ONE operation as JSON. The schema is a discriminated union tagged
on `op`. Content-producing ops carry the produced content inline, so the ask is
ONE model call, not two (classify then produce):

```
// src/lib/decks/deck-operations.ts (NEW, type-level shape - not code to copy)
type SlideContent = Pick<PptxSlide, "title" | "bullets" | "code" | "codeLanguage">;

type DeckOperation =
  | { op: "reword";   slideIndex: number; content: SlideContent }
  | { op: "expand";   slideIndex: number; content: SlideContent }
  | { op: "condense"; slideIndex: number; content: SlideContent }
  | { op: "retitle";  slideIndex: number; title: string }
  | { op: "retarget"; slides: SlideContent[] }        // length must equal input length
  | { op: "reorder";  order: number[] }               // a permutation of [0..n)
  | { op: "drop";     slideIndex: number }
  | { op: "refuse";   category: "add-slide" | "layout" | "delete-slide" | "other"; note?: string };
```

The `refuse` member is how the PROMPT lets the model decline an out-of-set ask
with a precise category; the dispatcher does NOT trust it as the only refusal
(section 7). `SlideContent` is a `Pick` of the existing `PptxSlide` - no new
content shape is declared, so a field the model cannot legitimately set (a
`sourceId`, a placement) is not on the object at all.

---

## 7. The validating dispatcher (C1, pure)

Two pure functions, mirroring the tree's coerce-then-apply split, no `callLlm`:

```
coerceDeckOperation(raw: unknown): DeckOperation | null
applyDeckOperation(slides: PptxSlide[], op: DeckOperation): DeckOpResult

type DeckOpResult =
  | { ok: true;  slides: PptxSlide[] }
  | { ok: false; refusal: FitReportAdjustment };   // operation-refused | slide-count-refusal
```

- `coerceDeckOperation` copies the SHAPE of `coerceSlideGraphic` - a `switch`
  over the closed `op` vocabulary - and explicitly NOT its `default: return
  undefined`. A malformed decorative graphic degrading to no graphic is correct;
  an operation the instructor asked for out loud degrading to nothing is the
  silent-truncation defect this row has documented four times
  (`docs/a43-scope.md:919-930`). An unknown tag or a member that fails its schema
  returns `null`, which `applyDeckOperation`'s caller turns into an
  `operation-refused` (H3).
- `applyDeckOperation` enforces every invariant BY CONSTRUCTION and returns a
  refusal, never a mutated-in-place deck:
  - `reword`/`expand`/`condense`/`retitle`: `slideIndex` in `[0, n)` or refuse;
    MERGE the model's content onto that ONE slide as `{ ...slides[i], ...content }`,
    copying ONLY the keys the model returned - so `notes`, `graphic`, and any field
    the op did not set are PRESERVED (leave-unless-present). A full replacement, or
    spreading an absent `code` as `undefined`, is forbidden: it would silently drop
    those fields (section 5, pinned by CO-PRESERVE). Length unchanged by construction.
  - `retarget`: `op.slides.length === slides.length` or refuse via
    `buildSlideCountAdjustment(n, op.slides.length)` (H4 for the "asked for more"
    direction; a symmetric refusal for fewer); each returned content item is MERGED
    onto its positional slide by the same leave-unless-present rule, preserving
    `notes`/`graphic`.
  - `drop`: `slideIndex` in `[0, n)` or refuse; set that slide to
    `{ ...slides[i], title: "", bullets: [], code: undefined, codeLanguage:
    undefined, graphic: undefined }` - the single op that DELIBERATELY clears
    deck-supplied content; `notes` retained (RES-A43C-2). Length unchanged (slide
    kept, emptied).
  - `reorder`: `op.order` is a permutation of `[0..n)` (a sorted copy equals
    `[0..n)`) or refuse; length unchanged.
  - `refuse`: maps the category to the section-5.1 wording via
    `buildOperationRefusedAdjustment` (add-slide names T3).
  - It NEVER returns `{ ok: true }` with a length other than `slides.length`.
    That single postcondition is the whole no-add/no-delete guarantee at this
    layer, and it is a pure assertion the test seat can pin and sabotage.

`coerceDeckOperation` and `applyDeckOperation` are pure and mocked-callLlm-free,
so H2'/H3/H4/the count postcondition are all unit-testable here (section 13).

---

## 8. The refusal path (counted, T2-style)

A43-C adds NO new refusal class. It lands on `fit-report.ts`'s existing
`operation-refused` (`:159-161`, whose header already cites "section 9.3 ...
constraint H3") and `slide-count-refusal` (`:83-97`). `describeFitReport`
(`:213-218`) already guarantees a non-empty output, so a refusal always reaches a
line - never silent, never a no-op (`docs/a43-scope.md:928-930`). The route
surfaces a refusal to the client as `{ status: "refused", reason }` and the panel
renders it beside the ask box (the same `generateError` slot pattern
`GeneratePanel.tsx:241-255,420-440` already uses for the T2 refusal). A refusal
is a normal 200 outcome of a well-formed request, distinct from a 502 model
failure and a 504 deadline.

---

## 9. Where the turn executes, and the seam signatures

**Server route, mirroring `api/presentations/generate/route.ts`, not a client
call and not an action.** The model call is server-only (the key is server-side)
and the deck content - never the template - is the only thing sent to the model.

- `src/app/api/decks/ask/route.ts` (NEW): `runtime="nodejs"`, `maxDuration=60`,
  `dynamic="force-dynamic"`. `await requireUser()` first (401 on failure), then
  a `SOFT_DEADLINE_MS` wall around the single `callLlm`, returning a 504 styled
  partial on deadline and a 502 on a failed/blank call - copied from
  `presentations/generate/route.ts:25-42,140-168`. One `callLlm`, not a fan-out,
  so the wall is simpler than PRES-1's but present for the same reason (a
  retrying `callLlm` must not run past the platform kill).
- Request: `{ instruction: string; slides: PptxSlide[] }` - the current
  `editedSlides` and the instructor's sentence. **The uploaded template is NOT in
  the request body**; the model is shown slide content only.
- Response: `{ status: "ok"; slides: PptxSlide[] }` (op applied server-side via
  C1) | `{ status: "refused"; reason: string }` | `{ status: "error"; error }` |
  the 504 partial.
- Flow inside the route: `buildAskPrompt(instruction, slides)` (pure,
  `ask-prompt.ts`) -> `callLlm` -> slice JSON (`parseLenientJsonArray`'s object
  sibling) -> `coerceDeckOperation` -> `applyDeckOperation(slides, op)` ->
  serialise the `DeckOpResult`. C1 runs server-side, so all validation is
  server-side and the client stays dumb.

Why a route, not a server action: the withDeadline styled partial and the
consistency with the freshest infra (PRES-1). An action would run under the same
platform cap but with no soft-deadline partial. If a later wave prefers an action
for symmetry with `deck-template-files.ts`, it uses `requireUser()` and owes its
own timeout story; the route is the recommendation.

---

## 10. The reachability ladder - the surface IS a layer

Traced control -> code, because "the surface is a layer" is the failure this repo
has shipped twice (`MEMORY.md`, verify-reachability). Each rung names the wave
that builds it:

1. The instructor types a sentence in an ask box beside the deck preview
   (C2, `GeneratePanel.tsx`, rendered only when `generatedDeck` is set) and
   presses a button - one added optional control, no mode switch, no prerequisite.
2. `index.tsx` (C2, CALLER) `fetch`es `POST /api/decks/ask` with
   `{ instruction, slides: editedSlides }`.
3. The route (C3) authenticates, calls the model, parses + dispatches (C1),
   returns `{ status, slides | reason }`.
4. On `ok`, `index.tsx` sets `editedSlides` to the returned slides - the SAME
   state `onEditSlide` writes - and the preview re-renders. On `refused`, the
   panel shows the reason.
5. Download/Save is UNCHANGED: `buildOutputPptx` re-pours `editedSlides` through
   `fillDeckTemplateFileAction`, where H1 + byte-identity + slide-count refusal
   already live.

The surface between C1 (the dispatcher) and C2 (the panel) is the route (C3): the
JSON request/response contract in section 9. The cut in section 11 ships C1 + C3
together (the pure op layer plus its HTTP caller) and C2 - the in-app control - in
a SEPARATE later chunk. That ordering is a DELIBERATE and ACCEPTED intermediate,
stated here so no wave misreads it and no push overclaims:

- **At the C1 + C3 push, `/api/decks/ask` exists but NO in-app control posts to
  it.** It is exercised end to end by `route.test.ts` (mocked `callLlm`) and is
  reachable over HTTP, and that is all. It is an INERT-TO-THE-USER endpoint, not a
  shipped end-user capability, and the C1 + C3 push MUST NOT claim the
  conversational-ask feature is reachable by an instructor. What it claims is: the
  op layer is correct and its contract is exercised.
- **C2 is the required successor that closes the ladder** (rungs 1-2 and 4 above).
  The A43 row does not deliver the owner's "ask for things" until C2 lands; C2 is
  not optional and is named as owed in the same breath as C1 + C3.

This is NOT the "library and an endpoint with no surface between them" defect
(`MEMORY.md`, verify-reachability): that defect is two shipped layers with no
contract joining them. Here C1's surface - the route (C3) - ships WITH C1 in the
same chunk, so the dispatcher is never stranded without its contract. What is
deferred, openly and with a named successor, is the USER's surface (C2). The
distinction the check must hold me to: a MISSING seam between shipped layers is the
defect; a deferred user surface behind a shipped, tested seam is an accepted
staging step, provided the intermediate push does not claim the capability.

---

## 11. Wave cut (dependency-ordered, disjoint write sets)

Sequenced AFTER the template half (T1/T2 shipped; T3/F1 per `docs/a43-scope.md`
11.5-11.6 still owed), per DECISION 15's "template half ships first and
completely" (`owner-decisions-2026-09-27.md:31-35`). A conversational editor is
built against a deck that already conforms.

### C1 - the pure op layer (no surface, no model)
| File | Role |
|---|---|
| `src/lib/decks/deck-operations.ts` | NEW, pure. `DeckOperation` union (section 6), `coerceDeckOperation`, `applyDeckOperation` (section 7). Imports `PptxSlide` (type), `FitReport*` builders. |
| `src/lib/decks/deck-operations.test.ts` | NEW. The count postcondition (CO-COUNT), the notes/graphic preservation postcondition (CO-PRESERVE), H2'/H3/H4, each op, each refusal - and the sabotages that prove them (section 13). CO-PRESERVE's oracle carries a slide with non-empty `notes` and a `graphic`, and its sabotage is a full-replace `applyDeckOperation`. |

Independently reviewable: a pure library with a full test, no caller yet. It
exports nothing a runtime path calls until C3 - legal because C3 lands in the
same chunk (C1 and C3 ship together; see structural note).

### C3 - the model boundary + the route (the CALLER of C1)
| File | Role |
|---|---|
| `src/lib/decks/ask-prompt.ts` | NEW, pure. `buildAskPrompt(instruction, slides)` - states the closed op vocabulary and the refuse-with-category contract to the model. |
| `src/lib/decks/ask-prompt.test.ts` | NEW. The prompt names every op and forbids layout, asserted on the built string (`docs/loop/traps-tests.md`: pin the fact, not the spelling). |
| `src/app/api/decks/ask/route.ts` | NEW. `requireUser` + withDeadline + `callLlm` + C1 dispatch (section 9). CALLS `coerceDeckOperation`/`applyDeckOperation`/`buildAskPrompt`. |
| `src/app/api/decks/ask/route.test.ts` | NEW. Mocked `callLlm` (network is blocked): an out-of-set ask returns `refused`; a valid ask returns `ok` with count preserved; a model failure returns 502. |

C1 and C3 land in ONE chunk so the new exports have their runtime caller in the
same wave (`docs/loop/seats.md:163-165`); the route is the caller of the pure
layer. This chunk ships an endpoint with no in-app caller yet - an inert-to-the-user
HTTP surface, an accepted intermediate per section 10 - and its push does NOT claim
the end-user capability; C2 is its required successor and the row's user-facing
"ask for things" lands only when C2 does.

### C2 - the surface (the CALLER of the route)
| File | Role |
|---|---|
| `src/app/components/ppt-design/GeneratePanel.tsx` | RENDERS the ask box + button + the refusal line, only when `generatedDeck` is set. |
| `src/app/components/ppt-design/index.tsx` | CALLER. `handleAskDeck` fetches the route and sets `editedSlides` on `ok`. |
| `src/app/components/ppt-design/hooks.ts` | `ta-ppt-ask-draft` (persist the unsent ask, section 12). |

C2 adds ONE optional control to an existing panel: no new required input, no mode
switch, no course prerequisite (C-BUDGET, section 13).

### Structural notes
- **Write-set disjointness across waves is by construction**: C1 writes only
  `src/lib/decks/deck-operations.*`; C3 adds `ask-prompt.*` and the route; C2
  touches only the three `ppt-design` files. No file is written by two waves.
- **`src/lib/office-edit.ts`, `office-template-fill.ts`, `fit-report.ts`,
  `deck-template-files.ts` are in NO A43-C wave's write set.** C reuses them
  unchanged. `fit-report.ts`'s `operation-refused` already exists.
- **Line budgets, re-measured with `@(Get-Content).Count` at HEAD**:
  `GeneratePanel.tsx` 503, `index.tsx` 773 (headroom 227 to the 1000 ceiling),
  `hooks.ts` 241. C2's additions (an ask box ~40 lines, a handler ~25, a hook
  ~8) fit with margin; none is ratcheted (`grep -n "ppt-design\|GeneratePanel"
  src/file-size-ceiling.structure.test.ts` exits 1, canary `grep -c "maxLines"`
  -> 8). An implementer re-measures before trusting these.
- Multi-file test runs use `npm run test:paths -- <p1> <p2> ...`, never a raw
  multi-path `vitest run` (`docs/loop/this-repo.md` section 1).
- `npx tsc --noEmit` is not concurrency-safe; exactly one caller runs it, the
  wave gate.

---

## 12. Persistence and state

- `ta-ppt-ask-draft` (string): the unsent ask text, so a reload does not lose a
  half-typed instruction. Matches this repo's standing `ta-` rule
  (`MEMORY.md`, persist-ui-control-state) and the existing `ta-ppt-*` family
  (`hooks.ts:73,118,133`). Per-viewer convenience, wrapped in try/catch like
  `useLocalStorageState` already is (`hooks.ts:19-33`).
- The applied deck lives in the existing `editedSlides` state - A43-C adds no new
  deck state; it writes the state that already exists.
- Nothing new persists server-side. The uploaded template row (T1) and the deck
  drafts (existing `savePresentationFileAction`) are unchanged. No migration.

---

## 13. Pass conditions this shape introduces

Each names the OBJECT under comparison, the INSTRUMENT, and the DIRECTION of
failure. Gates naming two or more test files use `npm run test:paths`.

| id | Constraint | Object | Instrument | FAILS if |
|---|---|---|---|---|
| **CO-COUNT** | Every `{ ok: true }` result preserves slide count | `applyDeckOperation(slides, op).slides.length` against `slides.length`, over every op in section 5 | a unit test in `deck-operations.test.ts`, run `npx vitest run src/lib/decks/deck-operations.test.ts` | any successful op returns a different length, OR the assertion still passes when `retarget`'s length check is removed (sabotage mandatory) |
| **CO-PRESERVE** | A content op preserves `notes` and `graphic` (and any field the op does not set) on the touched slide | the `notes` and `graphic` of `applyDeckOperation(slides, op).slides[i]` against `slides[i]`, for `reword`/`expand`/`condense`/`retitle`/`retarget` given a slide carrying non-empty `notes` and a `graphic` and `content` that sets neither | a unit test in `deck-operations.test.ts`, run `npx vitest run src/lib/decks/deck-operations.test.ts` | a content op drops `notes` or `graphic`; SABOTAGE (mandatory): a full-replace `applyDeckOperation` that returns `content` alone instead of `{ ...slide, ...content }` must turn this red |
| **H2'** | No dispatched op can remove a template `sourceId` (the section-1 successor to `docs/a43-scope.md` H2) | the `sourceId` set the FILL writes, before vs after an op, on a synthetic `.pptx` fixture | a unit test running an op through `applyDeckOperation` then `fillOfficeTemplate`, run `npm run test:paths -- src/lib/decks/deck-operations.test.ts src/lib/decks/office-template-fill.test.ts` | the written file's `sourceId` set differs from the template's after any op (it cannot, because count is preserved and the fill path is unchanged - the test PROVES the inheritance holds, and is the belt behind CO-COUNT's construction) |
| **H3** | An unrecognised or schema-invalid op refuses with a reason; never `undefined`, never a no-op | `coerceDeckOperation(raw)` / the dispatch result for an unknown tag against the set of refusal reasons | a unit test in `deck-operations.test.ts` | the dispatcher returns `undefined`, an unchanged deck, or a value with no reason string |
| **H4** | An add-slide ask refuses with a reason naming wave T3 | the dispatcher's refusal reason for an add/over-count op against the required text; plus the existing pin `src/lib/office-edit.test.ts:126-154` | `npm run test:paths -- src/lib/decks/deck-operations.test.ts src/lib/office-edit.test.ts` | the ask is accepted, OR refused with no reason, OR reaches `applyOfficeSections` (where it is inert, i.e. silent) |
| **C-TEMPLATE-BLIND** | The model is shown deck content only, never the template | the ask route's request body shape and `buildAskPrompt`'s inputs | a source-text assertion that `route.ts`'s posted body has no template/file field and `buildAskPrompt` takes only `(instruction, slides)`; `grep -niE "templateFileId\|base64\|\.content" src/app/api/decks/ask/route.ts src/lib/decks/ask-prompt.ts` -> exit 1, canary `grep -c "slides"` | the prompt or the request carries the template file, its bytes, or a `sourceId` |
| **C-BUDGET** | The ask adds no required step, mode switch, or prerequisite | the count of REQUIRED inputs the panel gains (must be 0) | reading `GeneratePanel.tsx` (no component renders under vitest); owner verification walking the surface | the ask box is required before any existing action, OR a mode toggle gates the deck editor |
| **C-REACH** | The ask box reaches the dispatcher and back to `editedSlides` | the call chain box -> `index.tsx` handler -> route -> `applyDeckOperation` -> `setEditedSlides` | a source-text wiring assertion that `index.tsx`'s ask handler posts to `/api/decks/ask` and sets `editedSlides` from the result | any link is absent (a library + endpoint with no control, `MEMORY.md`) |
| **C-REFUSE-VISIBLE** | A refusal reaches the screen | the route's `refused` status against a rendered line in the panel | mocked-callLlm route test for the status; owner verification for the render | a refusal returns 200 with an unchanged deck and no visible reason |

CO-COUNT, CO-PRESERVE, H2', H3, H4 are pure or synthetic-fixture tests -
verifiable here. C-BUDGET, C-REFUSE-VISIBLE's render half are reading +
owner-verification claims: no component renders under vitest
(`docs/loop/this-repo.md` section 6).

---

## 14. The `owns` set (derived, command and output pasted)

The files A43-C EDITS plus the tests that read those files AS SOURCE TEXT (a test
that greps a string it does not own goes red when the string moves).

Edited/new files: `src/lib/decks/deck-operations.ts`,
`src/lib/decks/ask-prompt.ts`, `src/app/api/decks/ask/route.ts` (+ their tests),
`src/app/components/ppt-design/{GeneratePanel,index}.tsx`,
`src/app/components/ppt-design/hooks.ts`.

Readers of the edited `ppt-design` files, derived:
```
$ grep -rln "ppt-design" --include=*.test.ts src/
src/app/components/manual/manual-rail.test.ts
src/app/components/tabs/tab-rails.test.ts
src/app/url-state.test.ts
src/lib/decks/deck-source.test.ts
$ grep -rln "GeneratePanel\|ppt-design/index\|ppt-design/hooks" --include=*.test.ts src/
src/lib/decks/deck-source.test.ts
```
Classification:
- **`src/lib/decks/deck-source.test.ts`** - OWNED (adopted). It reads
  `ppt-design/index.tsx` as source (`:115,148-149`) and asserts
  `handleGenerateDeck`'s `ctx` literal carries `materials`. C2 edits a DIFFERENT
  region of `index.tsx` (a new `handleAskDeck`), so this must stay green; the C2
  implementer runs it as part of the wave gate:
  `npx vitest run src/lib/decks/deck-source.test.ts`.
- **`manual-rail.test.ts`, `tab-rails.test.ts`, `url-state.test.ts`** -
  CHECKED-SAFE. They reference the `"ppt-design"` VIEW ID string
  (`manual-rail.test.ts:69-71,175,204,257`; `tab-rails.test.ts:59`;
  `url-state.test.ts:70-71`), not the file contents. A43-C adds no tab and
  does not change the view id, so they cannot go red.
- Repo-wide scanners that read every new `src` file: `src/file-size-ceiling.
  structure.test.ts` (1000-line ceiling), `src/lib/no-emojis.test.ts`,
  `src/source-bytes.structure.test.ts` - OWNED generically; each new C file is
  subject to them.
- `src/lib/use-server-exports.test.ts` - NOT triggered: A43-C adds a ROUTE, not
  a `"use server"` file. If a later wave prefers an action, it becomes owned and
  the async-export rule applies.

---

## 15. Disposition of the prior A43-C sketch (`docs/a43-scope.md` section 9, H2-H4)

| Prior item | Disposition | Detail |
|---|---|---|
| 9.1 RULING 54: deck-specific op set, not general | **KEPT, re-argued** as section 2 | Same disposition, re-measured at HEAD `d6eb26de` from the mechanism, not inherited. The backlog `question`/DECISION-15 record it as the scope's to settle (section 0). |
| 9.2: ops as transforms of the `sections` array, `sourceId` set held constant | **WITHDRAWN as the binding, REPLACED by section 1** | The binding object is the deck content model `PptxSlide[]`, not the template `sections` array. Enforcer it protected (no layout reach) is KEPT and made STRONGER: unrepresentable by type rather than checked at runtime. |
| 9.2 the seven listed ops | **KEPT** as section 5 | Same set (reword/expand/condense/retitle/retarget/reorder/drop), re-expressed as `PptxSlide[]` transforms. `drop`'s placeholder-showthrough limit is now recorded (RES-A43C-2). |
| 9.3 the three refusals | **KEPT** as section 5.1 | add-slide, layout, delete-slide; wording preserved; add-slide names T3. |
| 9.4 dispatcher copies `coerceSlideGraphic` SHAPE, not its `default` | **KEPT** as section 7 | Unchanged. |
| H1 (`:1157`) | **UNTOUCHED** | Lives in the fill path A43-C does not write. Inherited whole. |
| H2 (`:1158`, `sourceId` set comparison as the primary instrument) | **DEMOTED to belt** as H2' (section 13) | Under the deck-content binding it is a downstream check that fires for free (fill path unchanged), not the primary enforcer. Primary is CO-COUNT (construction). |
| H3 (`:1159`) | **KEPT** as H3 (section 13) | Unchanged. |
| H4 (`:1160`) | **KEPT** as H4 (section 13) | Unchanged, plus the `office-edit.test.ts:126-154` pin. |
| 11.7 waves C1-C3 (C1 `deck-operations.ts`, C2 surface, C3 model boundary) | **KEPT and RE-ORDERED** as section 11 | C1 (pure) + C3 (route, the caller of C1) ship together so the export has its caller; C2 last. `llm.ts:519` stays out of scope. |
| 12.1 C5 (warm not exceeded), C4 (template persists) | **INHERITED, not re-opened** | A43-C adds no interaction to the warm path; C-BUDGET (section 13) is the A43-C-specific restatement. |

---

## 16. Residual register

Each names an OWNER, an INSTRUMENT, the OBJECT / DIRECTION of failure, and the
STEP. Per `docs/DEV_LOOP.md` step 0 a residual not in `docs/BACKLOG.md` does not
exist; this pass did NOT write them there (`docs/backlog.yml` and
`docs/BACKLOG.md` are outside its write set), so each is owed a backlog entry by
whoever lands the first A43-C wave.

| id | Residual | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| RES-A43C-1 | The fork status disagrees between records: `docs/backlog.yml:738` says "deliberately not decided" while `docs/a43-scope.md:865` says "RULED". This document settles it (section 2); the queue record must be updated so it stops reading as unsettled. | The orchestrator (owns `docs/backlog.yml`). | `grep -n "deliberately not decided" docs/backlog.yml` -> must exit 1 once reconciled, canary `grep -c "A43" docs/backlog.yml`. | Object: the `A43.question` field against this document's section 2. FAILS while the queue says the fork is open after it has been settled. | At the first A43-C chunk's push, in the same commit that opens the wave. |
| RES-A43C-2 | `drop`'s visual-emptiness is DEFERRED, not covered. `drop` clears the title, bullets, code and graphic the deck supplies, but template placeholder paragraphs the deck does not fill retain their original template text (a pre-existing T2 mapping property, `office-template-fill.ts:83-86,188-198`, not introduced by C). NO A43-C pass condition verifies a dropped slide is visually empty: CO-COUNT checks length, CO-PRESERVE checks preserved fields, and H2' checks only the `sourceId` SET and count before vs after - none inspects whether a dropped slide's rendered paragraphs are blank. A hard-blank of every template paragraph on a dropped slide is a fill-boundary enhancement, explicitly NOT claimed as covered by C's gates. | The chunk that next writes `src/lib/decks/office-template-fill.ts` (T-half), OR the repo owner if a hard-blank is wanted. | A unit test over `planSlideTemplateFill` with a dropped (empty-content) slide against a template slide that has more bullet paragraphs than the deck fills. | Object: the written slide's paragraph text after a `drop` against "all blank". FAILS if the owner expects a dropped slide to be visually empty and template placeholders show through. | Owner verification decides whether the hard-blank is wanted; if so, a fill-boundary wave, NOT folded into C silently. |
| RES-A43C-3 | Every appearance/interaction claim in this document (the ask box renders, the refusal is visible, the budget is unchanged, `editedSlides` re-renders) is a reading claim - no component renders under vitest (`docs/loop/this-repo.md` section 6). | The repo owner, in a real browser with a live key. | Walk the surface: upload a template, generate, type an ask, confirm the deck updates in the preview, type an add-slide ask, confirm the counted refusal shows and no slide is added; download and confirm the .pptx conforms. | Object: the observed behaviour against C-BUDGET / C-REFUSE-VISIBLE / C-REACH. FAILS if the ask adds a required step, a refusal is silent, or a produced deck breaks the template. | Owner verification, after C2 lands. |
| RES-A43C-4 | `retarget` and every content op rely on the model returning well-formed, count-matching content; the dispatcher refuses a mismatch, but WHETHER the model's rewritten content is faithful is unverifiable here (no API key; `vitest.setup.ts` throws on real `fetch`). | The repo owner. | Generate a deck, `retarget` it at a different audience, read the result. | Object: the retargeted content against the instruction. FAILS if `retarget` silently returns the same content or drifts off-topic (a quality claim, not a structural one). | Owner verification, after C3 lands. |

---

## 17. What this environment cannot verify (stated, not worked around)

- **Any model output.** No API key; the network is blocked. Every `callLlm` path
  is exercised only through mocks; `route.test.ts` mocks `callLlm`, not `fetch`.
- **The ask box's appearance, focus order, keyboard behaviour, and the refusal
  render.** No component renders under vitest - reading claims only (RES-A43C-3).
- **Whether a retargeted or reworded deck is faithful** (RES-A43C-4).
- **Whether the produced .pptx opens in PowerPoint** - inherited from
  `docs/a43-scope.md` RES-A43-2, unchanged by C (C re-pours through the same
  writer).
- **RLS on the template row** - no live database; unchanged by C (no new table).

---

## 18. Terminating owner question

**None from this document.** The general-vs-specific fork is an architecture
decision DECISION 15 handed to the scope, and it is recommended here (section 2).
The only owner-facing items are RES-A43C-2 (whether a `drop` hard-blank is
wanted) and RES-A43C-1 (record reconciliation) - both are residuals with owners
and steps, not gates, and neither blocks the C1/C3 build, which can start against
this shape immediately.

---

## 19. Instruments used in this pass

Reproducible from the repo root at HEAD `d6eb26de`, 2026-09-29. Absence claims
run WITHOUT a pipe (so `$?` is grep's), each with a canary.

```
git rev-parse --short HEAD                                          -> d6eb26de
grep -rniE "functionDeclarations|function_declarations|functionCall|function_call|toolConfig|tool_config" \
  --include=*.ts --include=*.tsx src/                               -> exit 1
     canary: grep -rniE "google_search" ... | wc -l                 -> 1
ls src/lib/decks/deck-operations.ts                                 -> absent (exit 2)
sed -n '567,582p' src/app/actions/media.ts                          -> generateDeckFromTemplateAction sig
grep -rln "ppt-design" --include=*.test.ts src/                     -> manual-rail, tab-rails, url-state, deck-source
grep -rln "GeneratePanel|ppt-design/index|ppt-design/hooks" --include=*.test.ts src/ -> deck-source.test.ts
grep -n "GeneratePanel|ppt-design|readFileSync|index.tsx" src/lib/decks/deck-source.test.ts
                                                                    -> reads index.tsx source at :115,148-149
grep -n "ppt-design" src/app/components/manual/manual-rail.test.ts  -> view-id refs :69-71,175,204,257
@(Get-Content src/app/components/ppt-design/index.tsx).Count        -> 773
@(Get-Content src/app/components/ppt-design/GeneratePanel.tsx).Count -> 503
@(Get-Content src/app/components/ppt-design/hooks.ts).Count          -> 241
@(Get-Content src/lib/decks/office-template-fill.ts).Count           -> 200
@(Get-Content src/lib/decks/fit-report.ts).Count                     -> 218
@(Get-Content src/lib/decks/generate.ts).Count                       -> 474
@(Get-Content src/lib/office-edit.ts).Count                          -> 755
@(Get-Content src/app/actions/deck-template-files.ts).Count          -> 178
```

Files opened directly for this pass: `src/lib/office-edit.ts`,
`src/lib/decks/office-template-fill.ts`, `src/lib/decks/fit-report.ts`,
`src/lib/decks/generate.ts`, `src/app/actions/deck-template-files.ts`,
`src/app/components/ppt-design/{index,GeneratePanel}.tsx`, `.../hooks.ts`,
`src/lib/presentations/{parse,types,generate}.ts`,
`src/app/api/presentations/generate/route.ts`, `docs/slide-spec.md`,
`docs/a43-scope.md`, `docs/owner-decisions-2026-09-27.md`, `docs/backlog.yml`
(A43 row), `docs/pres-1-architecture.md` (house format), and
`src/lib/slide-graphics.ts` (the `coerceSlideGraphic` pattern, `:200-225`).

Line counts above use `@(Get-Content).Count`, the mandated PowerShell instrument;
an implementer re-measures before trusting any headroom, since it and
`Measure-Object -Line` disagree by 15 to 138 where they disagree
(`docs/loop/this-repo.md` section 3).
