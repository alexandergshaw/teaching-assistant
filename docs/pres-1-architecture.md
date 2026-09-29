# PRES-1 architecture (round 1)

- Item: PRES-1, area `presentations-authoring`, kind feature.
- Seat: `loop-architect` (Opus). A fresh `loop-checker` gates this document
  before any implementer builds from it.
- Consumes: `docs/pres-1-acceptance-criteria.md` (AC-1..AC-8, LEV-1, the reuse
  notes, residual register). Owner decisions R-1 (deck format = .pptx via the
  shipped `buildSlidesPptx`; "visible" = an on-page slide preview, a distinct
  build item) and R-2 (Presentations is a NEW inner-nav sibling REUSING the deck
  infra; `ppt-design` left untouched) are treated as fixed and are NOT reopened.
- Produces: the shape - where each seam falls, the exact type at each seam, the
  reachability ladder, the disjoint wave cut, the owns set, and the residuals.
- This document decides SHAPE only. No production code. Oracle construction,
  fixtures and sabotage are the test seat's (`docs/loop/seats.md:59`); wave
  ordering detail and global-invariant accounting beyond the cut below are the
  plan's; reliability, security and data passes are wave 2.

All quantities name the command that produced them. Line counts use
`@(Get-Content <file>).Count` (PowerShell), the mandated instrument
(`docs/loop/this-repo.md` section 3); `Measure-Object -Line` is never used.

---

## 1. Leverage (inherited from AC, enforcer named here)

PRES-1 earns GUARANTEED (`docs/loop/leverage.md:44`) compounding with CORPUS
(`:37`), exactly as the AC states (`docs/pres-1-acceptance-criteria.md:47-61`).
This document does not re-argue the class; it names the LINE that is the
enforcer, so the checker and the test seat bind to one object:

- The earned mechanism is `buildRegeneratePrompt(input)` in
  `src/lib/presentations/prompts.ts` (new). It concatenates BOTH
  `input.priorContext` (the prior pasted text and file-extracted source text)
  AND `input.priorCritique.text` into the model request BY CODE. In a plain
  chat the human is the transport for that loop; here the code holds the record
  regardless of what the model returns.
- CORPUS compounds it: the pasted context persists across reload under `ta-`
  keys (AC-8) and is read back by the regenerate call - so the fold-in survives
  a session, not just a render.
- The removal test is LEV-1 / AC-7, owned by the test seat (AC residual R-6):
  drive `regenerateArtifact` with `callLlm` mocked, capture
  `vi.mocked(callLlm).mock.calls[0][0]` (the request-capture idiom already used
  at `src/lib/decks/sequence.test.ts:359`), assert the captured request text
  contains both the prior context and the prior critique. Direction: deleting
  the context fold line OR the critique fold line in `buildRegeneratePrompt`
  turns it RED. This is EARNED, not inherited: the two fold lines are the code
  that would have to be deleted for the claim to become false.

---

## 2. Reuse survey (vetted, opened, file:line)

| Symbol | Location | What it gives us |
|---|---|---|
| `buildSlidesPptx(BuildSlidesOptions): Promise<ArrayBuffer>` | `src/lib/pptx.ts:199` | The shipped .pptx serializer (owner R-1). Takes `{presentationTitle, slides: PptxSlide[], author?, theme?}`. Runs under vitest (exercised by `src/lib/lms-generation/artifact-download.ts:187`, which a test suite calls). |
| `PptxSlide` (`{title, bullets, code?, codeLanguage?, notes?, graphic?}`) | `src/lib/pptx.ts:19-39` | THE one slide model. Both the on-page preview and the .pptx read it, so they cannot diverge (section 6). |
| `GeneratedDeck` (`{presentationTitle, slides: PptxSlide[]}`) | `src/lib/decks/generate.ts:36-39` | The deck-content type. Reused verbatim as the deck artifact's content, so no parallel deck type is invented. |
| `callLlm(req: LlmRequest): Promise<LlmResult>` | `src/lib/llm.ts:375` | The in-house generation path (always routes to Gemini, `:379-385`). The single egress. Network blocked under vitest; mock this, not `fetch`. |
| `LlmRequest` (`{contents, generationConfig?, systemInstruction?, webSearch?}`) | `src/lib/llm.ts:48-55` | The request shape every artifact call builds. |
| `SLIDE_DECK_JSON_SHAPE` | `src/lib/slide-prompt.ts:40-63` | The JSON output contract whose fields match `PptxSlide`. Reused as the deck prompt's output shape. |
| `enforceTitleLength(slides)` | `src/lib/slide-prompt.ts` (exported; used at `src/lib/decks/generate.ts:463`) | Post-generation title-cap guard, applied on the deck path exactly as the deck generator applies it. |
| `parseLenientJsonArray(text): string[]` | `src/lib/decks/generate.ts:147` | Exported lenient JSON-array parse. Reused to parse the activities artifact (a string list) and to tolerate a fenced response. |
| `extractDeckSourceFileAction(name, base64): Promise<DeckSourceResult \| {error}>` | `src/app/actions/deck-source.ts:34` | In-house file intake: `requireUser`, reads only the caller's own uploaded bytes, extracts text via `extractTextFromBuffer` (50 extensions), returns normalized `materials`. This is the FILE half of AC-3. |
| `normalizeDeckSource` / `DeckSourceResult` (`{materials, receipt}`) / `DeckSourceReceipt` / `DECK_SOURCE_MAX_CHARS = 20000` | `src/lib/decks/deck-source.ts:19-62` | The extracted-source shape and its char budget, and the receipt shape reused as the persisted intake receipt. |
| `savePresentationFileAction({presentationTitle, slides, ...})` | `src/app/actions/media.ts:590` | Optional "save the deck to the Files tab" (delegates to `saveRecordingFile`). Reused for the optional persist button; no new storage code. |
| `URL.createObjectURL(blob)` download idiom | `src/app/components/ppt-design/index.tsx:545-563` | The client download idiom: `new Blob([bytes], {type: PPTX_MIME})`, anchor `.download`, `.click()`, `revokeObjectURL`. Copied into the tab's download handler. |
| `useLocalStorageState<T>(key, default)` | `src/app/components/ppt-design/hooks.ts:15-36` | The `ta-` persistence idiom. Reused for the value-bound intake and selection state (with the hydration caveat in section 7). |
| Inner-nav mechanism: `ManualViewType` (`:14-21`), `MANUAL_VIEW_ORDER` (`:154-162`), `MANUAL_VIEW_LABELS` (`:164-172`), `isManualViewType` built FROM the order (`:180-184`), `destinations` groups (`:75-130`), `InnerNavViewType`/`INNER_NAV` (`:192-198`), `getInnerDestinations` (`:212-216`), `getInnerNavAriaLabel` (`:222-225`), `getActiveDestinationId` (`:227-249`), `resolveStateFromDestinationId` (`:285-346`) | `src/app/components/manual/manual-rail.ts` | The extensible sub-tab + child-tab mechanism (R-2). Grading (`GradingView`, `:43`) is the worked precedent for an inner-nav view with multiple children. |
| `TOOLS_RAIL_ITEMS` derived from `MANUAL_VIEW_ORDER` | `src/app/components/tabs/tab-rails.ts:132-136` | The rail chips are derived, so a new `MANUAL_VIEW_ORDER` member joins the rail with no edit to `tab-rails.ts`. |
| `normalizeManualView` delegating to `isManualViewType` | `src/app/url-state.ts:194-195` | The URL/localStorage validator is derived, so restore of a new manualView is automatic - NO `url-state.ts` edit is needed (section 5, hop 3). |
| `ManualRail` renders `getInnerDestinations`/`getActiveDestinationId` generically | `src/app/components/manual/ManualRail.tsx:48-68` | The inner child-tab strip is rendered generically, so a new inner-nav view's child strip appears with no `ManualRail.tsx` edit. |

---

## 3. Do-not-reuse list (with justification)

- **`generateDeckFromTemplate` (`src/lib/decks/generate.ts:353`) and the
  `DeckTemplate` / loop-group machinery (`presets`, `types`, `sequence`,
  `fit-report`).** This is the `ppt-design` template flow: it requires a
  `DeckTemplate` with loop groups and runs a multi-call pre-pass (breadth
  enumeration `:369`, sequencing `:377`) before the generation call. PRES-1's
  deck is generated from free pasted context, not a template, and owner R-2
  says leave `ppt-design` untouched. Reusing the template orchestrator would
  drag in template selection and the loop-group model that PRES-1 does not have.
  PRES-1 reuses the LEAF pieces instead (`SLIDE_DECK_JSON_SHAPE`,
  `enforceTitleLength`, `PptxSlide`, `GeneratedDeck`, `parseLenientJsonArray`,
  `buildSlidesPptx`) and issues ONE `callLlm` per artifact. This also keeps the
  reliability envelope small (section 8, R-A2): no per-deck fan-out.
- **`extractDeckSourceRepoAction` (`src/app/actions/deck-source.ts:63`).** It is
  gated by `requireAppOwner()` because it reaches the deployment's single GitHub
  PAT (`deck-source.ts:24-26`). PRES-1's intake is the instructor's own pasted
  files and text; wiring the repo action would gate the feature to the owner and
  add an owner-private egress the AC does not ask for. Use only
  `extractDeckSourceFileAction` (`requireUser`).
- **`sliceJsonObject` (`src/lib/decks/generate.ts:134`).** It is a private
  helper, not exported. PRES-1 needs a first-JSON-object slice for the deck
  parse. Rather than widen `decks/generate.ts`'s API (which would pull that
  shared file and its tests into the PRES-1 write set), duplicate the ~8-line
  slicer into `src/lib/presentations/parse.ts`. This is a deliberate, small
  duplication in the same class as the `PPTX_MIME` constant, which is already
  defined locally in five places (`grep -rn "presentationml.presentation" src`:
  `media.ts:583`, `ppt-design/index.tsx:56`, `course-engine.ts:16`,
  `api/lms-export/selection/route.ts:183`, plus reuses). Recorded as residual
  R-A5 so a later consolidation is owned, not forgotten.

---

## 4. File layout and per-file line estimates

New files (all new leaves; none near the 1000-line ceiling
`src/file-size-ceiling.structure.test.ts:41`):

| File | Est. lines | Runtime? | Role |
|---|---|---|---|
| `src/lib/presentations/types.ts` | ~55 | TYPE-ONLY (no runtime emit) | The seam types (section 6). |
| `src/lib/presentations/prompts.ts` | ~120 | yes | Pure per-artifact prompt builders, incl. `buildRegeneratePrompt` (the LEV-1 enforcer). |
| `src/lib/presentations/parse.ts` | ~55 | yes | Deck JSON slice + parse into `PptxSlide[]` (via `enforceTitleLength`); activities parse (via `parseLenientJsonArray`). |
| `src/lib/presentations/generate.ts` | ~140 | yes | The orchestrator: `generateSelectedArtifacts`, `generateOneArtifact`, `reviewArtifact`, `regenerateArtifact`. |
| `src/lib/presentations/deck-file.ts` | ~20 | yes | `serializeDeckToPptx(deck)` (wraps `buildSlidesPptx`) and `PRES_PPTX_MIME`. |
| `src/app/actions/presentations.ts` | ~45 | yes (`"use server"`) | Thin server actions; `requireUser`; async-only exports. |
| `src/app/components/presentations/SlideDeckCreationTab.tsx` | ~320 | yes (client) | The surface. |
| `src/app/components/presentations/SlideDeckPreview.tsx` | ~90 | yes (client) | On-page slide preview (AC-6 VISIBLE). |
| `src/app/components/presentations/hooks.ts` | ~40 | yes (client) | `ta-` persistence for intake and selection. |

Existing files edited (current count by `@(Get-Content <f>).Count`, 2026-09-29):

| File | Now | After (est.) | Edit |
|---|---|---|---|
| `src/app/components/manual/manual-rail.ts` | 368 | ~398 | Add the `presentations` member, order entry, label, destinations group, `INNER_NAV`/`InnerNavViewType`, and the two switch branches. |
| `src/app/components/home/useAppNavigation.ts` | 754 | 755 | Add `"presentations"` to the local `ManualView` union (`:40-47`). |
| `src/app/page.tsx` | 825 | ~833 | Add the mount branch + import. |
| `src/app/components/manual/manual-rail.test.ts` | (owned) | + | Add `presentations` to the frozen `MANUAL_VIEW_ORDER` array (`:195`) and the new-view assertions. |
| `src/app/components/tabs/tab-rails.test.ts` | (owned) | + | Add `manual:presentations` to the frozen id array (`:54`); update `toHaveLength(10)` to `11` (`:66`). |
| `src/app/components/tabs/topLevelTabs.wiring.test.ts` | (owned) | + | Update `toHaveLength(10)` to `11` (`:374`). |

No edited file approaches 1000. The largest edited file is `page.tsx` at 825
(command above); +8 lines keeps it at ~833.

---

## 5. Reachability ladder - the surface IS a layer

Owner R-2: Presentations is a NEW inner-nav sibling. AC-1/AC-2 require the tab
reachable and the child under an EXTENSIBLE inner nav. This is the layer the
user reaches; each hop is named and cited, and each is marked derived
(auto-accepts a new member) or hand-list (must be edited). The one hand-list
that has dropped a member before is called out.

1. **Rail chip appears.** `TOOLS_RAIL_ITEMS` is built from `MANUAL_VIEW_ORDER`
   (`tab-rails.ts:133-136`). DERIVED: adding `"presentations"` to the order adds
   the chip, labelled from `MANUAL_VIEW_LABELS["presentations"]`. No
   `tab-rails.ts` edit. (This is why the two `toHaveLength(10)` assertions and
   the two frozen id/order arrays go red - section 9.)
2. **Clicking the chip sets `manualView`.** The rail's `onClick` routes through
   `useAppNavigation.setManualView`; the accepted set is `isManualViewType`,
   built FROM `MANUAL_VIEW_ORDER` (`manual-rail.ts:180-184`). DERIVED.
3. **Restore across reload (URL and localStorage).** The manualView initializer
   uses `isManualViewType(savedManual)` (`useAppNavigation.ts:259`) and the URL
   path uses `normalizeManualView`, which delegates to `isManualViewType`
   (`url-state.ts:194-195`). DERIVED - `"presentations"` survives a reload with
   NO edit to the validator or the restore ladder. This is the exact hop the AC
   warned could be missed (`docs/loop/traps-spec.md:58-64`); here it is auto
   because the guards are derived, not hand-restated. Enforcer already exists:
   `manual-rail.test.ts:530` loops `isManualViewType` over every
   `MANUAL_VIEW_ORDER` member.
4. **The local `ManualView` union.** `useAppNavigation.ts:40-47` restates the
   union as literals (a SECOND copy of `ManualViewType`). HAND-LIST: it must gain
   `"presentations"` or `setManualView(parsed.manualView)` fails `tsc`. This is
   the same class that once dropped `"artifact-design"` from a hand-restated
   guard (`manual-rail.ts:175-179` comment). It is edit hop 4 and must not be
   skipped.
5. **Mount.** `page.tsx` renders per-view branches (`ppt-design` at `:601-603`).
   Add `{manualView === "presentations" && (<TabShell><SlideDeckCreationTab
   .../></TabShell>)}`. HAND-EDIT.
6. **Child tab strip.** `ManualRail` renders `getInnerDestinations(manualView)`
   generically (`ManualRail.tsx:49,57`). DERIVED once `presentations` is in
   `INNER_NAV` with a destinations group - the one-child "Slide Deck Creation"
   strip appears with no `ManualRail.tsx` edit.
7. **Child click resolves back to state.** `resolveStateFromDestinationId`
   (`manual-rail.ts:285-346`) must map an id beginning `presentations-` to
   `manualView "presentations"`; `getActiveDestinationId` (`:227-249`) must
   return `"presentations-slide-deck"` for the presentations branch so the strip
   highlights it. HAND-EDIT (both in `manual-rail.ts`).

**Net: the ladder is THREE files** - `manual-rail.ts`, `useAppNavigation.ts`
(hop 4), `page.tsx` (hop 5). `url-state.ts`, `tab-rails.ts`, `ManualRail.tsx`,
and every restore/validator path are derived and need no edit. This is the
whole point of R-2 reusing the mechanism.

### The extensible-child decision (AC-2), stated so the checker can bind it

AC-2 forbids wiring the child as "a single non-list mount of the kind used by
version-control / recording / ppt-design" (`manual-rail.ts:96-118`, views for
which `getInnerDestinations` returns null). The shape here satisfies that at the
mechanism level and NOT by threading a full child-selection state for one child:

- `presentations` is added to `InnerNavViewType` (`:192`) and `INNER_NAV`
  (`:194-198`), and gets a `destinations` group named `"Presentations"` holding
  an ARRAY: `[{ id: "presentations-slide-deck", label: "Slide Deck Creation",
  description: "..." }]`. So `getInnerDestinations("presentations")` returns a
  non-null LIST containing a "Slide Deck Creation" destination - exactly AC-2's
  READING instrument, and the anti-foreclosure the AC asks for lives at the rail
  level, where a second child is one more array entry.
- For ONE child, `getActiveDestinationId` returns the constant
  `"presentations-slide-deck"` and needs NO new parameter (its signature is
  unchanged: `(manualView, buildView, contentView, gradingView)`), and the
  `page.tsx` mount is a single conditional. This is NOT the foreclosed shape:
  the foreclosed shape is a view absent from `INNER_NAV` whose
  `getInnerDestinations` is null. Presentations is in `INNER_NAV` with a list.
- **To add child #2 later** (the extensibility AC-2 requires): add a destination
  to the Presentations group, introduce a `PresentationsView` union plus a
  threaded selection state mirroring `gradingView` exactly (a
  `normalizePresentationsView` in `url-state.ts`, a `?presentationsView=` param
  in `buildUrlSearch`/`parseUrlState`, a `GRADING_VIEW_KEY`-style `ta-` key and
  restore branch in `useAppNavigation.ts`, and a `page.tsx` mount switch), and
  give `getActiveDestinationId` the extra parameter then. Round 1 ships one
  child, so none of that selection plumbing is added now - and deliberately NOT
  adding a `useState` to `useAppNavigation.ts` is why the positional guard in
  `topLevelTabs.wiring.test.ts` (which pins the order of the `useState`
  declarations between `contentView` and `workflowsView`) does NOT churn.

This choice is a genuine cost trade: threading a one-member selection now would
add three more edited files and churn the positional guard, for a child that
does not exist. The rail-level list is the extensibility the AC's instrument
tests; the leaf selection is additive when a real second child arrives.

---

## 6. Seam types (exact signatures)

### 6.1 `src/lib/presentations/types.ts` (TYPE-ONLY - no runtime, states the exception)

This module emits NO runtime code (types and interfaces only), so it is the one
legal exception to the "a wave must include the caller of every new export"
rule (`docs/loop/seats.md:163-165`): there is nothing to call.

```ts
import type { PptxSlide } from "@/lib/pptx";
import type { GeneratedDeck } from "@/lib/decks/generate";
import type { DeckSourceReceipt } from "@/lib/decks/deck-source";

export type ContentArtifactKind = "outline" | "activities" | "deck";

// The four independently-selectable artifacts (AC-4). `review` is not a fourth
// content kind: when true, each PRODUCED content artifact carries its own
// critique (AC-5 reconciliation, docs/pres-1-acceptance-criteria.md:194-199).
export interface ArtifactSelection {
  outline: boolean;
  activities: boolean;
  deck: boolean;
  review: boolean;
}

// The pasted context (AC-3: files AND text, in-house only). `sources` are the
// file receipts extracted server-side by extractDeckSourceFileAction; their
// TEXT (not raw bytes) feeds every prompt by code.
export interface PresentationSource { name: string; text: string; }
export interface PresentationContext { text: string; sources: PresentationSource[]; }

export interface OutlineContent { markdown: string; }
export interface ActivitiesContent { ideas: string[]; } // 3-5 is prompt/OWNER (R-3), not a machine count
// Deck content IS GeneratedDeck (reused): { presentationTitle; slides: PptxSlide[] }.
export type DeckContent = GeneratedDeck;

export interface Critique { text: string; }

// Per-artifact keying is STRUCTURAL (AC-5): the critique lives INSIDE the
// produced artifact, so "a critique for a non-produced artifact" is
// unrepresentable, and "a produced-and-reviewed artifact with no critique" is
// exactly `critique === null`. This is the construction the checker prefers
// over an assertion of absence (docs/loop/seats.md:110-114).
export type ProducedArtifact =
  | { kind: "outline"; content: OutlineContent; critique: Critique | null }
  | { kind: "activities"; content: ActivitiesContent; critique: Critique | null }
  | { kind: "deck"; content: DeckContent; critique: Critique | null };

export interface GenerationResult { artifacts: ProducedArtifact[]; } // exactly the selected content kinds

export interface RegenerateInput {
  kind: ContentArtifactKind;
  priorContext: PresentationContext;      // folded in BY CODE (LEV-1/AC-7)
  priorCritique: Critique | null;         // folded in BY CODE (LEV-1/AC-7)
  priorContent: ProducedArtifact["content"] | null; // the version being improved
  withReview: boolean;                    // re-run the critique after regeneration
}

// The persisted intake receipt reuses the existing shape.
export type { DeckSourceReceipt, PptxSlide };
```

Note: importing `GeneratedDeck` and `DeckSourceReceipt` via `import type` from
runtime modules is erased at compile time, so this stays a type-only module.

### 6.2 `src/lib/presentations/generate.ts` (the orchestrator - AC-4/AC-5/AC-7 seam)

```ts
import { callLlm } from "@/lib/llm";
import { buildOutlinePrompt, buildActivitiesPrompt, buildDeckPrompt,
         buildReviewPrompt, buildRegeneratePrompt } from "./prompts";
import { parseDeckSlides, parseActivities } from "./parse";
import type { ArtifactSelection, ContentArtifactKind, PresentationContext,
              ProducedArtifact, GenerationResult, RegenerateInput, Critique } from "./types";

// Fixed order; a deselected kind is skipped ENTIRELY - no callLlm is issued for
// it (AC-4 direction of failure).
const CONTENT_KINDS: readonly ContentArtifactKind[] = ["outline", "activities", "deck"];

export async function generateSelectedArtifacts(
  context: PresentationContext,
  selection: ArtifactSelection,
): Promise<GenerationResult>;

// One callLlm; parses per kind into the ProducedArtifact for that kind, critique null.
async function generateOneArtifact(
  kind: ContentArtifactKind, context: PresentationContext,
): Promise<ProducedArtifact>;

// One callLlm; produces the critique for an already-produced artifact (AC-5).
export async function reviewArtifact(
  produced: ProducedArtifact, context: PresentationContext,
): Promise<Critique>;

// Builds the request from prior context + prior critique BY CODE (LEV-1/AC-7),
// one callLlm, optional re-review.
export async function regenerateArtifact(
  input: RegenerateInput,
): Promise<ProducedArtifact>;
```

`generateSelectedArtifacts` loops `CONTENT_KINDS`, skips any kind whose selection
flag is false, calls `generateOneArtifact` for each selected kind, and when
`selection.review` is true attaches `await reviewArtifact(produced, context)` to
that artifact's `critique`. It calls `callLlm(req)` with no explicit provider, so
every call routes to Gemini, the in-house path (`llm.ts:379-385`) - AC-3 egress
is satisfied by construction. This is the every-input-reachable check the
architect brief demands: every prompt is built from `context`, which the
orchestrator receives; the critique is built from the `ProducedArtifact` the same
loop just made, so there is no input a requirement needs that the object cannot
reach.

### 6.3 `src/lib/presentations/prompts.ts` (pure builders)

```ts
export function buildOutlinePrompt(context: PresentationContext): string;
export function buildActivitiesPrompt(context: PresentationContext): string;   // asks for 3-5 ideas as a JSON array
export function buildDeckPrompt(context: PresentationContext): string;         // composes SLIDE_DECK_JSON_SHAPE
export function buildReviewPrompt(kind: ContentArtifactKind, contentText: string, context: PresentationContext): string;
export function buildRegeneratePrompt(input: RegenerateInput): string;         // folds priorContext AND priorCritique
```

`buildRegeneratePrompt` is the LEV-1 enforcer: it must include both
`input.priorContext` (text plus each `sources[].text`) and, when non-null,
`input.priorCritique.text`. The two fold-ins are separate, deletable lines so
the removal test fails on removal of either (AC-7 direction).

`contextToPromptText(context)` (a private helper in prompts.ts) is the single
place the pasted text and file-source text are joined into one block, reused by
every builder, so "files AND text both reach generation" (AC-3) is one code path.

### 6.4 `src/lib/presentations/parse.ts`

```ts
export function parseDeckSlides(text: string): DeckContent | null; // slice first JSON object, map to PptxSlide[], enforceTitleLength
export function parseActivities(text: string): string[];          // parseLenientJsonArray
```

### 6.5 `src/lib/presentations/deck-file.ts` (AC-6 DOWNLOADABLE serializer)

```ts
import { buildSlidesPptx } from "@/lib/pptx";
import type { GeneratedDeck } from "@/lib/decks/generate";
export const PRES_PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export function serializeDeckToPptx(deck: GeneratedDeck, author?: string): Promise<ArrayBuffer>;
```

`serializeDeckToPptx` is the pure serializer AC-6 [MACHINE] binds to: a non-empty
deck yields a non-empty `ArrayBuffer`. It lives in a `.ts` leaf, not the `.tsx`
tab, so it is collectable by vitest (`.test.tsx` is not collected -
`this-repo.md:112`).

### 6.6 `src/app/actions/presentations.ts` (`"use server"`, async-only)

```ts
"use server";
import { requireUser } from "@/lib/supabase/auth";
import { generateSelectedArtifacts, regenerateArtifact } from "@/lib/presentations/generate";
import type { ArtifactSelection, PresentationContext, GenerationResult,
              ProducedArtifact, RegenerateInput } from "@/lib/presentations/types";

export async function generatePresentationArtifactsAction(
  context: PresentationContext, selection: ArtifactSelection,
): Promise<GenerationResult | { error: string }>;

export async function regeneratePresentationArtifactAction(
  input: RegenerateInput,
): Promise<ProducedArtifact | { error: string }>;
```

Both are `export async function` (the guard-ratchet shape the security checker
requires - `docs/loop/seats.md:350-352`; never an arrow-function export in a
`"use server"` file). Both `await requireUser()` first (a signed-in check;
NOT `requireAppOwner`, since the instructor generates from their own pasted
material, and NOT the deprecated `requireOwner` alias). Only async functions are
exported (no type re-export from a `"use server"` file - memory
`use-server-no-type-reexport.md`; the types are imported, used, and re-declared
at the call boundary, never re-exported).

**Reliability recommendation (feeds wave-2 reliability seat, R-A2):** the CLIENT
fans out one `generatePresentationArtifactsAction` call per selected content kind
(passing a single-kind `ArtifactSelection`), so each server invocation issues at
most 2 `callLlm` calls (the content call plus, if review is on, its critique) -
well under the 60s Hobby cap (`this-repo.md` / memory `deployment-vercel-hobby`).
The same orchestrator is driven either way; AC-4's "no call for a deselected
kind" holds inside the orchestrator regardless of how the client batches. This is
a recommendation, not a gate.

### 6.7 The tab, the preview, and the ONE slide model (AC-6 VISIBLE)

`SlideDeckCreationTab.tsx` holds the generated deck in state as a single
`DeckContent` (`= GeneratedDeck`). Two consumers read that ONE object:

- `<SlideDeckPreview slides={deck.slides} />` renders each `PptxSlide` in-page
  (title, bullets, and any `code`) as visible slide thumbnails. This is the
  deliverable the owner SEES - not a `data-` attribute or a hidden node standing
  in for it (the exact failure this seat has paid for,
  `.claude/agents/loop-architect.md:37-39`). "Visible" is OWNER-verified (nothing
  renders under vitest); the wiring that the preview reads the deck's own slides
  is a READING claim (section 9, the one-slide-model check).
- the download handler calls `serializeDeckToPptx(deck)`, wraps the bytes in
  `new Blob([bytes], { type: PRES_PPTX_MIME })`, and uses the
  `URL.createObjectURL` idiom (`ppt-design/index.tsx:545-563`).

Because both read `deck.slides` from the same state object, the preview and the
.pptx cannot diverge - there is no second slide source to fall out of sync. Any
edit that gave the preview its own slide array, or made the download read a
different field, is what the one-slide-model wiring test (section 9) forbids.

---

## 7. Persistence and state (AC-8) - recommendation

**Recommendation: client-side only for round 1. No Supabase table, no migration,
no server-side artifact store.** This matches `ppt-design` exactly, avoids the
no-database ceiling (`this-repo.md` section 6), and still delivers the CORPUS
leverage through `ta-` keys.

- Persisted via `ta-` keys (AC-8), value-bound and reusing `useLocalStorageState`
  (`ppt-design/hooks.ts:15`):
  - `ta-pres-source-text` (string): the pasted/typed text.
  - `ta-pres-source-receipts` (`DeckSourceReceipt[]` reused shape) and
    `ta-pres-source-materials` (the extracted source text): mirrors the
    `ta-ppt-source-receipt` / `ta-ppt-source-materials` split
    (`ppt-design/hooks.ts:118,122`).
  - `ta-pres-selection` (`ArtifactSelection`): the four selection flags.
- **Not persisted:** the generated artifacts themselves. They live in component
  state; regenerate re-derives them from the persisted context. This is
  deliberate - persisting model output would need a store the environment cannot
  verify, and the leverage is the CONTEXT surviving reload (read back by
  regenerate), which the keys above deliver.
- **Optional explicit save:** a "Save deck to Files" button reusing
  `savePresentationFileAction` (`media.ts:590`). No new storage code.

**Hydration rule (AC-8 direction, memory `persisted-details-open-hydration`).**
`useLocalStorageState` seeds from a `useState` initializer. For controls bound to
`value`/`checked` (the text field and the selection checkboxes) this reconciles
correctly after hydration and the persisted value shows on reload. The one
documented hazard is a `<details open={persisted}>` pattern, whose `open`
attribute does NOT reconcile. **Design constraint for the implementer:** any
persisted open/visibility state must be driven by CONDITIONAL RENDERING
(`{open && <panel/>}`) from the persisted boolean, never by a `<details
open={...}>` attribute, and if a `<details>`-style control is used its open state
must be applied through a mount effect. The test seat owns the exact AC-8
instrument (a source-text test that new intake/selection state uses
`useLocalStorageState` with `ta-` keys and no `<details open={seeded}>`).

The data seat (wave 1 trigger: a `ta-` key is persisted) reviews the persisted
SHAPE; there is no Supabase, migration, or typed-row mapper in scope.

---

## 8. Waves (dependency-ordered, disjoint write sets)

Three waves, a strict dependency chain (backend, then action, then surface),
each with a disjoint file set. All three land in the SINGLE PRES-1 chunk push,
so the caller of every new export exists by the end of the chunk; per-wave, each
export's caller is named below.

**Wave 1 - backend logic (pure, fully machine-verifiable):**
`src/lib/presentations/types.ts`, `prompts.ts`, `parse.ts`, `generate.ts`,
`deck-file.ts`.
- Callers within the wave: `prompts.ts` and `parse.ts` are called by
  `generate.ts`; `generate.ts`'s exports are called by the wave-1 unit tests and,
  in wave 2, by the action; `serializeDeckToPptx` is called by the wave-1 AC-6
  test and, in wave 3, by the tab; `types.ts` is TYPE-ONLY (stated exception).
- This is where AC-4, AC-5, AC-7 and LEV-1 are provable with `callLlm` mocked -
  the highest-consequence logic, landed first.

**Wave 2 - server action:** `src/app/actions/presentations.ts`.
- Depends on wave 1's `generate.ts`. Its exports are called by the wave-3 tab.
- Isolated because the `"use server"` shape check (`use-server-exports.test.ts`)
  and the AC-3 import-egress test bind here.

**Wave 3 - surface and nav wiring (reading/OWNER verified):**
`src/app/components/presentations/SlideDeckCreationTab.tsx`,
`SlideDeckPreview.tsx`, `hooks.ts`; `src/app/components/manual/manual-rail.ts`;
`src/app/components/home/useAppNavigation.ts`; `src/app/page.tsx`; and the three
owned test updates (`manual-rail.test.ts`, `tab-rails.test.ts`,
`topLevelTabs.wiring.test.ts`).
- The tab calls the wave-2 action, `serializeDeckToPptx`, `SlideDeckPreview`, and
  the hooks; `manual-rail.ts`/`useAppNavigation.ts`/`page.tsx` are the
  reachability ladder (section 5). The mount branch is the caller of the tab.

**Disjointness (exact-path, `sort | uniq -d` yields empty across waves):**
wave 1 is `src/lib/presentations/*`; wave 2 is `src/app/actions/presentations.ts`;
wave 3 is `src/app/components/presentations/*` plus the three ladder files plus
the three owned test files. No path appears in two waves. The waves are a
dependency chain and run sequentially, not in parallel; they are disjoint from
any OTHER backlog item's files, which is what lets PRES-1 run concurrently with
an unrelated item.

**Files near the 1000 ceiling: none.** Measured (section 4): the largest edited
file is `page.tsx` at 825 by `@(Get-Content src/app/page.tsx).Count`; +~8 lines.

---

## 9. Pass conditions this shape introduces

Each names the object, the instrument, and the direction of failure. These
supplement (do not replace) the AC's own instruments; the test seat owns oracle
construction.

- **One-slide-model (AC-6 VISIBLE plus DOWNLOADABLE do not diverge).** Object:
  the slide array read by the preview versus the slide array serialized to
  .pptx. Instrument [READING]: a source-text/wiring test that
  `SlideDeckPreview` is passed `deck.slides` and the download handler calls
  `serializeDeckToPptx(deck)` on the SAME `deck` state, with no second slide
  array constructed in the tab. Direction: RED if the preview builds its own
  slides or the download reads a different field. (Rendering itself is OWNER,
  R-4 - nothing renders under vitest.)
- **DOWNLOAD serializer non-empty (AC-6 MACHINE).** Object: the `ArrayBuffer`
  from `serializeDeckToPptx` for a non-empty `GeneratedDeck`. Instrument
  [MACHINE]: a unit test asserting `byteLength > 0` (the `buildSlidesPptx`
  serialization is exercised the same way at
  `src/lib/lms-generation/artifact-download.ts:187`). Direction: RED if it
  returns a zero-byte buffer for a non-empty deck.
- **Selection fan-out (AC-4).** Object: `generateSelectedArtifacts` output and
  the `callLlm` mock call record, over at least the selections
  {outline-only, deck-only, outline+deck, all four}. Instrument [MACHINE]: mocked
  `callLlm`; assert the returned `artifacts` are exactly the selected content
  kinds and no `callLlm` call was issued for a deselected kind. Direction: RED if
  a subset selection produces all, if a selected kind is missing, or if a
  deselected kind triggers a call. (Must range over multiple selections - the
  partial-fix trap, `docs/loop/traps-spec.md:98-106`.)
- **Per-artifact critique keying (AC-5).** Object: the `critique` field on each
  `ProducedArtifact`. Instrument [MACHINE]: generate outline+deck with review on;
  assert the outline artifact and the deck artifact each carry a non-null
  critique and no artifact exists for the non-produced `activities`. Direction:
  RED if review is a single undifferentiated blob or a critique appears for a
  non-produced kind. (Structural: a critique for a non-produced kind is
  unrepresentable by the discriminated type - the enforcer is the type shape.)
- **Regenerate fold-in (AC-7 / LEV-1).** Object: the `callLlm` request built by
  `regenerateArtifact`. Instrument [MACHINE]: mocked `callLlm` request-capture
  (`mock.calls[0][0]`); assert the request text contains both the prior context
  and the prior critique. Direction: RED when the context fold line OR the
  critique fold line in `buildRegeneratePrompt` is deleted.
- **In-house egress (AC-3 MACHINE).** Object: the imports of
  `src/app/actions/presentations.ts` and `src/lib/presentations/*.ts`.
  Instrument [MACHINE]: a source-text test asserting the only generation egress
  is `@/lib/llm` (`callLlm`) and there is no external generation SDK import, no
  `fetch(` to a non-in-house host, and no out-link to an external authoring tool.
  Direction: RED if any such import/link is introduced.
- **`"use server"` shape (security).** Object: the exports of the action file.
  Instrument [MACHINE]: `src/lib/use-server-exports.test.ts` (existing) plus
  `next build`'s type-re-export check. Direction: RED on a non-async export.

A gate naming two or more test files uses `npm run test:paths` (never a raw
multi-path `vitest`, which silently drops unmatched args -
`this-repo.md:31-46`). Example for the nav suite after wave 3:
`npm run test:paths src/app/components/manual/manual-rail.test.ts
src/app/components/tabs/tab-rails.test.ts
src/app/components/tabs/topLevelTabs.wiring.test.ts`.

---

## 10. The `owns` set (derived, command and output pasted)

Files that reference the nav symbols this design edits (`MANUAL_VIEW_ORDER`,
`getActiveDestinationId`, `getInnerDestinations`, `resolveStateFromDestinationId`,
`isManualViewType`, `TOOLS_RAIL_ITEMS`, or a `manualView ===` mount), from the
Bash tool:

```
grep -rln "MANUAL_VIEW_ORDER\|getActiveDestinationId\|getInnerDestinations\|resolveStateFromDestinationId\|isManualViewType\|TOOLS_RAIL_ITEMS\|manualView ===" src --include="*.ts" --include="*.tsx" | sort
```

Output (2026-09-29):

```
src/app/components/contentTab.wiring.test.ts
src/app/components/home/useAppNavigation.test.ts
src/app/components/home/useAppNavigation.ts
src/app/components/manual/ManualRail.tsx
src/app/components/manual/manual-rail.test.ts
src/app/components/manual/manual-rail.ts
src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
src/app/components/tabs/tab-rails.test.ts
src/app/components/tabs/tab-rails.ts
src/app/components/tabs/topLevelTabs.wiring.test.ts
src/app/page.tsx
src/app/url-state.ts
```

**Tests that read the edited files AS SOURCE TEXT and go RED on this change
(owned, MUST be updated in wave 3):**

- `src/app/components/manual/manual-rail.test.ts:195` -
  `expect(MANUAL_VIEW_ORDER).toEqual([...])` is a FROZEN exact-array assertion;
  add `"presentations"` in the chosen position (recommended: immediately after
  `"ppt-design"`, so the two presentation tools sit adjacent). Also add the
  new-view assertions (getInnerDestinations non-null containing "Slide Deck
  Creation", getActiveDestinationId, resolveStateFromDestinationId,
  isManualViewType, aria label).
- `src/app/components/tabs/tab-rails.test.ts:54` - frozen
  `TOOLS_RAIL_ITEMS.map(id)` exact array; add `"manual:presentations"`.
- `src/app/components/tabs/tab-rails.test.ts:66` -
  `expect(TOOLS_RAIL_ITEMS).toHaveLength(10)`; update to `11`.
- `src/app/components/tabs/topLevelTabs.wiring.test.ts:374` -
  `expect(TOOLS_RAIL_ITEMS).toHaveLength(10)`; update to `11`.

Commands establishing the RED-on-change facts:

```
grep -n "toEqual(\[\|toHaveLength(10)" src/app/components/manual/manual-rail.test.ts src/app/components/tabs/tab-rails.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts
```

**Files in the owns set that DO NOT break (verify green, no edit):**

- `src/app/url-state.ts` - `normalizeManualView` delegates to `isManualViewType`
  (`:194-195`), derived; no edit (ladder hop 3).
- `src/app/components/tabs/tab-rails.ts` - `TOOLS_RAIL_ITEMS` derived from
  `MANUAL_VIEW_ORDER` (`:132-136`); no edit.
- `src/app/components/manual/ManualRail.tsx` - renders `getInnerDestinations`
  generically; no edit.
- `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` -
  `readFileSync`s `page.tsx` (`:61-62`) and asserts the grading/snapshots mount
  wrapper (`:82,97`); adding a `presentations` mount branch does not touch those
  assertions.
- `src/app/components/contentTab.wiring.test.ts` - asserts LMS eligibility
  (`:81`), unrelated.
- `src/app/components/home/useAppNavigation.test.ts` - references the symbols in
  comments/asserts around `artifact-design`; no frozen manual-view array or count
  found (`grep -n "toHaveLength\|toEqual(\[" src/app/components/home/useAppNavigation.test.ts`
  returns none for the manual-view set). Verify green.

No `.structure.test.ts` count in `src/app/components/recording/` is touched -
Presentations is not in the recording directory, so
`recording-split.structure.test.ts`'s hardcoded 12/11 counts
(`this-repo.md:153`) are out of scope. Confirmed by the absence of any
presentations path under `src/app/components/recording/` in wave 3's file set.

---

## 11. Disposition table

Not applicable: this is the FIRST architecture version for PRES-1. No prior
architecture was restructured, so there is no prior requirement to map to
kept / handed-over / withdrawn.

---

## 12. Residual register

Each residual names an owner, an instrument, and the step that will measure it.
**These must be filed as rows in `docs/BACKLOG.md` by the orchestrator** (this
seat does not write the backlog under concurrency); until filed they exist only
here, which `iteration-caps.md` counts as not yet real. AC residuals R-3, R-4,
R-5, R-6 stand unchanged and are not restated here.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-A1 | The LEV-1 / AC-7 removal-test oracle (regenerate request-capture asserting both prior context and prior critique). | Test seat | Mocked-`callLlm` `mock.calls[0][0]` capture (`sequence.test.ts:359` idiom) | Test seat, after Build and Verify (same as AC R-6) |
| R-A2 | Reliability of multi-`callLlm` generation against the 60s Hobby cap. The recommended per-artifact client fan-out keeps each server invocation to at most 2 `callLlm` calls; confirm the arithmetic and the client actually fans out. | Reliability seat (wave 2) | Timeout arithmetic: max `callLlm` count per action invocation times worst-case latency versus 60s | Wave-2 reliability pass |
| R-A3 | Prompt-injection exposure: pasted files/text and prior critique reach `callLlm` prompts as free text. | Security seat (wave 2) | Open every prompt builder in `src/lib/presentations/prompts.ts`; assess framing/mitigation | Wave-2 security pass |
| R-A4 | Duplication: `sliceJsonObject` copied into `parse.ts`, and `PRES_PPTX_MIME` becomes a sixth local copy of the MIME string. Accepted for round 1 (consistent with the existing five copies); consolidation deferred. | Orchestrator / future chunk | `grep -rn "presentationml.presentation" src` (count the copies) and a grep for the duplicated slicer | A later cleanup chunk, if the owner wants it |
| R-A5 | OWNER-only verifications specific to this build: the Presentations chip is reachable and survives reload; the child "Slide Deck Creation" strip shows; the deck PREVIEW renders slides on screen; the download opens a valid .pptx. (These are AC R-4; recorded here because the reachability ladder in section 5 is the thing being verified.) | Owner | Open Tools > Presentations > Slide Deck Creation in prod; paste context; generate; see the preview; download | Post-deploy owner verification |

---

## 13. What this environment cannot verify (stated, not worked around)

- **Nothing renders under vitest** (`this-repo.md:113`). The tab appearing, the
  child strip, the deck PREVIEW being drawn, and the download button working are
  OWNER verifications (R-A5 / AC R-4), never machine-checked. This design pins
  the on-page preview as the visible deliverable and does NOT propose any
  requirement whose only enforcer would be a render.
- **No API key** (`this-repo.md:227-231`). Every `callLlm` path is exercised only
  through mocks; the generation and review LOGIC is machine-checkable, the model
  OUTPUT QUALITY (3-5 useful ideas, on-topic slides, genuinely adversarial
  critique) is OWNER (AC R-3, R-5).
- **No live database / no migration in scope.** The persistence recommendation
  (section 7) is client-side `ta-` keys only, so there is nothing here that needs
  a live database, an RLS check, or a migration to verify.
