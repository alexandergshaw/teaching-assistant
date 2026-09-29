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
| `saveRecordingFile(supabase, userId, blob, {origin, ...})` | `src/lib/recording-files.ts:68` (accepts `origin?: string \| null`, `:72`) | The Files-tab persist primitive IF a manual save is ever added. It MUST be called with `origin: "manual"` - NOT `savePresentationFileAction` (`media.ts:590`), which hardcodes `origin: "unattended"` (`media.ts:629`) for workflow-generated files. Per X2 this is MOOT for round 1 (client-session-only persistence, R-D1 / section 7); recorded so no later chunk copies the unattended action. |
| `URL.createObjectURL(blob)` download MECHANICS only | `src/app/components/ppt-design/index.tsx:553-559` | The client download mechanics: `new Blob([bytes], {type})`, `createObjectURL`, anchor `.download`, `.click()`, `revokeObjectURL`. Copy THESE lines. The surrounding `catch` at `:560-562` is `console.error`-only and is the ANTI-PATTERN (SRE 3a) - do NOT copy it; PRES-1's handler surfaces an error STATE on a throw (section 6.7, pass condition 3a). |
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
| `src/lib/presentations/generate.ts` | ~130 | yes | The executors: `selectedContentKinds` (pure selection->kinds map, AC-4), `generateOneArtifact`, `reviewArtifact`, `regenerateArtifact`. NO multi-kind looper (B1). |
| `src/lib/presentations/deck-file.ts` | ~20 | yes | `serializeDeckToPptx(deck)` (wraps `buildSlidesPptx`, NO theme param - section 6.5) and `PRES_PPTX_MIME`. |
| `src/app/api/presentations/generate/route.ts` | ~70 | yes (Route Handler) | The single-artifact entry point (B1): POST, one content kind (produce+optional review) OR one regenerate per request; `maxDuration=60` + soft deadline; `requireUser`. Replaces the `"use server"` action. |
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
5. **Mount.** `page.tsx` renders per-view branches (the `ppt-design` block is
   `:601-605`). Add `{manualView === "presentations" && (<TabShell><SlideDeckCreationTab
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
  adding a `useState` to `useAppNavigation.ts` is why the positional
  useState-order guard in `useAppNavigation.test.ts:39-47` (which isolates the
  `contentView` useState block by anchoring between the `contentView` and the
  `workflowsView` useState declarations) does NOT churn: no `useState` is added,
  so the block boundaries and content are unchanged and the guard stays green.
  (The `toHaveLength` bump in `topLevelTabs.wiring.test.ts:374` is a separate,
  unrelated edit - the rail-chip COUNT, section 4/10 - not this positional
  guard, which I1 corrected.)

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
// R-UX-8 (cross-seat, RESOLVED): `sources` is PLURAL - a PresentationSource[],
// not a single receipt. AC-3 is "files AND text"; multiple uploaded files each
// become one PresentationSource. The data pass's singular `fileReceipt` naming
// ALIGNS TO this array (one receipt per element); there is no singular-file
// seam. Any implementer building intake binds to the array, not one receipt.

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

### 6.2 `src/lib/presentations/generate.ts` (the executors - AC-4/AC-5/AC-7 seam)

**B1 shape change (round 2): there is NO multi-kind looper here.** The old
`generateSelectedArtifacts(context, selection)` - which looped all selected kinds
and their reviews in one invocation, up to 6 sequential `callLlm` calls - is
REMOVED, because that is exactly the shape the SRE pass measured as unsafe under
the Vercel Hobby cap (section 6.6, pass condition 2a). It is split into (a) a
PURE selection->kinds map the client uses to drive the fan-out, and (b)
single-artifact executors the route handler calls ONE at a time.

```ts
import { callLlm } from "@/lib/llm";
import { buildOutlinePrompt, buildActivitiesPrompt, buildDeckPrompt,
         buildReviewPrompt, buildRegeneratePrompt } from "./prompts";
import { parseDeckSlides, parseActivities } from "./parse";
import type { ArtifactSelection, ContentArtifactKind, PresentationContext,
              ProducedArtifact, RegenerateInput, Critique } from "./types";

// Fixed order. PURE (no callLlm): maps a selection to exactly the selected
// content kinds, deselected kinds absent. This is the AC-4 object (section 9);
// the client fans out ONE request per element. `review` is NOT a content kind.
const CONTENT_KINDS: readonly ContentArtifactKind[] = ["outline", "activities", "deck"];
export function selectedContentKinds(selection: ArtifactSelection): ContentArtifactKind[];

// One callLlm; parses into the ProducedArtifact for that ONE kind, critique null.
// EXPORTED (B1): the route handler calls this once per request.
export async function generateOneArtifact(
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

`selectedContentKinds` is a pure list-membership map: `["outline","activities",
"deck"]` filtered to the flags set true, in that fixed order, `review` ignored.
This is the direct AC-4 instrument (section 9) - a deselected kind is absent from
the list, so the client issues NO request for it, so the server issues NO
`callLlm` for it. AC-4's "no call for a deselected kind" is thus GUARANTEED BY
CONSTRUCTION, not by a loop that could regress: the server never sees more than
the one `kind` its request body names.

`generateOneArtifact` calls `callLlm(req)` with no explicit provider, so every
call routes to Gemini, the in-house path (`llm.ts:379-385`) - AC-3 egress is
satisfied by construction. Every prompt is built from `context`, which the
executor receives; `reviewArtifact`'s critique is built from the
`ProducedArtifact` just made, so there is no input a requirement needs that the
object cannot reach.

`GenerationResult` (types.ts) is now the CLIENT-ASSEMBLED collection: the tab
holds a `ProducedArtifact[]` accreted from the per-kind responses (that array IS
the `GenerationResult` shape). No server function returns it; the route returns
one `ProducedArtifact` per request (section 6.6).

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
export function parseDeckSlides(text: string): DeckContent | null; // slice, map to PptxSlide[], enforceTitleLength, THEN validateDeck; null on failure
export function parseActivities(text: string): string[];          // parseLenientJsonArray
export function validateDeck(deck: DeckContent): DeckContent | null; // pre-flight gate (B2 / SRE 3b)
```

**B2 pre-flight validation (round 2).** The SRE pass MEASURED (`pres-1-sre.md`
section 3.1, executed against the real `pptxgenjs`) that `buildSlidesPptx` (a)
THROWS an internal, non-user-facing error on non-array `bullets`
(`"slide.bullets.map is not a function"`), and (b) SILENTLY succeeds on
`slides: []`, producing a valid ~45.6KB one-title-slide file that is not what
was asked for. Both must be caught BEFORE `serializeDeckToPptx` is ever called.
`validateDeck` is that pure, machine-testable gate: it returns the deck only when
`deck.slides.length > 0` AND every slide has a non-empty trimmed `title` AND
`Array.isArray(slide.bullets)`; otherwise it returns `null`. `parseDeckSlides`
runs it as its last step, so a malformed model response becomes a parse failure
(`null`) - which `generateOneArtifact` surfaces as a GENERATION FAILURE (the
route returns `{ error }`, section 6.6), never a zero-slide "success" and never a
raw builder throw. This is pass condition 3b (section 9), now binding.

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

**No theme param, by construction (B2 / SRE 3.4).** The signature takes only
`(deck, author?)` - deliberately NO `theme`. SRE measured that
`buildSlidesPptx` THROWS `"Cannot read properties of undefined (reading
'startsWith')"` when handed a `theme` with `backgroundKind: "solid"` and no
`backgroundColor` (`pptx.ts:104-107`). AC-6 asks only for a visible, downloadable
deck - never a branded one - so omitting `theme` lets `buildSlidesPptx`'s standard
NAVY/ACCENT path (`pptx.ts:493-527`) run and AVOIDS the theme-crash mode entirely.
This is a construction, not a test: not building a theme object is cheaper and
safer than validating one. (The empty-deck and non-array-bullets crash modes are
still possible from a malformed MODEL response, which is why `validateDeck`
- section 6.4 - is the pre-flight gate; the theme mode alone is closed here.)

### 6.6 `src/app/api/presentations/generate/route.ts` (Route Handler - the B1 entry point)

**Why a Route Handler, not a Server Action (B1, structural - not a
recommendation).** The SRE pass established the split criterion from this repo's
own precedent: a Server Action reachable from `src/app/page.tsx` gets NO
`maxDuration` and runs under the platform's unconfigured default, which is
TIGHTER than 60s (`deck/route.ts:30-33`: "src/app/page.tsx (a client component)
sets none, so every Server Action reachable from it is capped by the platform
default"; `command-interface.ts:28`). Even a single-kind request can be 2
sequential `callLlm` calls (produce + review), whose worst-case retry backoff
alone is ~21s (arithmetic below) BEFORE any real Gemini latency, which is
unmeasured here (R-SRE-1) and can only make it worse. Under an unknown default
tighter than 60s that is not provably safe, and the house response to "a Server
Action's work will not fit that default" is unanimous across `deck/route.ts`,
`visualizer-selection.ts` and `class-trends-insight/route.ts`: move it to a
Route Handler with an explicit ceiling. So PRES-1's generation entry point IS a
Route Handler; the `"use server"` action is not created.

```ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { generateOneArtifact, reviewArtifact, regenerateArtifact }
  from "@/lib/presentations/generate";
import type { ContentArtifactKind, PresentationContext, ProducedArtifact,
              RegenerateInput } from "@/lib/presentations/types";

export const runtime = "nodejs";
export const maxDuration = 60;          // Hobby hard cap; matches class-trends-insight/route.ts:33
export const dynamic = "force-dynamic";

// A SINGLE artifact per request. The body names exactly ONE kind (generate) or
// carries ONE regenerate input - never an array, never a full selection. This is
// the single-kind boundary that caps sequential callLlm at <=2 per invocation.
type PresentationsRequest =
  | { op: "generate"; kind: ContentArtifactKind; context: PresentationContext; withReview: boolean }
  | { op: "regenerate"; input: RegenerateInput };

export async function POST(req: Request): Promise<Response>;
// -> NextResponse.json(ProducedArtifact) on success, or .json({ error }, { status }) on failure.
```

The handler `await requireUser()` first (a signed-in check; NOT `requireAppOwner`
- the instructor generates from their own pasted material - and NOT the
deprecated `requireOwner` alias). It parses the body, and:

- `op: "generate"`: `const produced = await generateOneArtifact(kind, context)`;
  if `withReview`, `produced.critique = await reviewArtifact(produced, context)`.
  At most 2 sequential `callLlm` calls.
- `op: "regenerate"`: `await regenerateArtifact(input)` (which itself is at most 2
  `callLlm` - the regenerate call plus, if `input.withReview`, its re-review).

**Soft deadline (SRE 2.3).** The handler imposes its OWN budget strictly under
60s and returns a WORDED error before the platform kills it, mirroring
`class-trends-insight/route.ts:47` (`TOTAL_BUDGET_MS = 50_000`, ~10s margin under
the 60s hard cap for auth/parse/serialize). MEASURED CAVEAT carried forward from
SRE 2.3: `callLlm`/`postGenerateContent` accept no `AbortSignal` today
(`llm.ts:375-386`), so a soft deadline bounds the CLIENT'S WAIT, not the retry
loop's own work - it must not be described as cancellation. This is acceptable
here because each request does at most 2 `callLlm` calls, so "give up waiting"
and "the function is about to finish" are close together.

**The client drives the fan-out.** `SlideDeckCreationTab.tsx` (wave 3) calls
`selectedContentKinds(selection)` (section 6.2) and `fetch`es
`/api/presentations/generate` ONCE per returned kind (an `op: "generate"`
request each), and once per regenerate. This matches `command-interface.ts:26-32`
("the fan-out is driven from the BROWSER, one invocation per row ... This
function must NEVER loop over rows") and `SnapshotGradingPanel.tsx:13-19` (per
batch, from the click handler, never one action looping internally). No type
re-export concern applies (a Route Handler is not a `"use server"` file), so the
`use-server-exports.test.ts` gate does not bind this file; the binding gate is
pass condition 2b (route shape + auth, section 9).

**Corrected worst-case call count (round 2, reconciling SRE's "8").** SRE section
2.2 counted "4 artifacts x 2 passes = up to 8 `callLlm`". That is WRONG for the
flag model: `ArtifactSelection` has 3 CONTENT kinds (`outline`, `activities`,
`deck`) plus a single `review` boolean - `review` is NOT a 4th artifact
(section 6.1, types.ts). So the corrected worst case is 3 content kinds x
(1 produce + up to 1 review) = up to 6 `callLlm` TOTAL across the whole
generation, spread over up to 3 independent requests, at most 2 `callLlm` PER
request. Per-request worst-case retry backoff = 2 x ~10.6s = ~21.2s
(SRE 2.2's ~10.6s-per-call figure), well under the 50s soft budget - so the
single-kind boundary satisfies pass condition 2a on a lower bound alone,
independent of the unmeasured real latency (R-SRE-1 / R-A2).

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
  `new Blob([bytes], { type: PRES_PPTX_MIME })`, and uses the `createObjectURL`
  MECHANICS from `ppt-design/index.tsx:553-559` (Blob, `createObjectURL`, anchor
  `.download`, `.click()`, `revokeObjectURL`).

**The download handler MUST surface an error STATE on a throw (B2 / SRE 3a).**
`serializeDeckToPptx` can still throw if a malformed deck reaches it (though
`validateDeck`, section 6.4, is the upstream gate and the no-theme construction,
section 6.5, closes the theme mode). The `catch` in `ppt-design/index.tsx:560-562`
is `console.error`-only - a thrown builder error there produces NO user-visible
feedback, the button appears to do nothing. That catch is the ANTI-PATTERN;
PRES-1's handler does NOT copy it. On a throw (or an `{ error }` from the deck
generation) it sets a rendered error state (the same discipline as
`ppt-design/index.tsx:549-552`'s `setGenerateError` branch), never a bare
`console.error`. This is pass condition 3a (section 9), now binding.

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
- **Optional explicit save: MOOT this round (X2).** Persistence is
  client-session-only (R-D1), so no "Save deck to Files" button ships in round 1.
  Stated here so no later chunk copies the wrong action: IF a manual save button
  is later added, its target is `saveRecordingFile(..., { origin: "manual", ... })`
  (`recording-files.ts:68`, `origin?` at `:72`) - NOT
  `savePresentationFileAction` (`media.ts:590`), which hardcodes
  `origin: "unattended"` (`media.ts:629`) for workflow-generated files and would
  mis-tag an instructor's manual save.

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
  `generate.ts`; `generate.ts`'s exports (`selectedContentKinds`,
  `generateOneArtifact`, `reviewArtifact`, `regenerateArtifact`) are called by
  the wave-1 unit tests and, in wave 2, by the route handler (and
  `selectedContentKinds` additionally by the wave-3 tab); `serializeDeckToPptx`
  is called by the wave-1 AC-6 test and, in wave 3, by the tab; `validateDeck` is
  called by `parseDeckSlides` and the wave-1 B2 test; `types.ts` is TYPE-ONLY
  (stated exception).
- This is where AC-4, AC-5, AC-7, LEV-1 and B2's pre-flight validation are
  provable with `callLlm` mocked - the highest-consequence logic, landed first.

**Wave 2 - route handler:** `src/app/api/presentations/generate/route.ts` (B1).
- Depends on wave 1's `generate.ts`. Its `POST` is reached by the wave-3 tab via
  `fetch`.
- Isolated because the AC-3 import-egress test and the route-shape/auth check
  (pass condition 2b) bind here. This is NOT a `"use server"` file, so
  `use-server-exports.test.ts` does not bind it (B1 file-kind change).

**Wave 3 - surface and nav wiring (reading/OWNER verified):**
`src/app/components/presentations/SlideDeckCreationTab.tsx`,
`SlideDeckPreview.tsx`, `hooks.ts`; `src/app/components/manual/manual-rail.ts`;
`src/app/components/home/useAppNavigation.ts`; `src/app/page.tsx`; and the three
owned test updates (`manual-rail.test.ts`, `tab-rails.test.ts`,
`topLevelTabs.wiring.test.ts`).
- The tab `fetch`es the wave-2 route (one request per `selectedContentKinds`
  entry, one per regenerate), and calls `serializeDeckToPptx`, `selectedContentKinds`,
  `SlideDeckPreview`, and the hooks; `manual-rail.ts`/`useAppNavigation.ts`/`page.tsx`
  are the reachability ladder (section 5). The mount branch is the caller of the tab.

**Disjointness (exact-path, `sort | uniq -d` yields empty across waves):**
wave 1 is `src/lib/presentations/*`; wave 2 is
`src/app/api/presentations/generate/route.ts`; wave 3 is
`src/app/components/presentations/*` plus the three ladder files plus the three
owned test files. No path appears in two waves. The waves are a dependency chain
and run sequentially, not in parallel; they are disjoint from any OTHER backlog
item's files, which is what lets PRES-1 run concurrently with an unrelated item.

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
  returns a zero-byte buffer for a non-empty deck. (A non-zero byte count is
  necessary but NOT sufficient - SRE 3.5 measured that an empty deck ALSO yields
  ~45.6KB - which is why the zero-slide case is a refusal upstream, pass condition
  3b, not a byte-threshold test.)
- **Deck pre-flight validation (B2 / SRE 3b), BINDING.** Object: the
  `DeckContent` a deck generation is about to serialize. Instrument [MACHINE]: a
  pure unit test over `validateDeck` (section 6.4) - assert it returns `null` for
  (a) `slides: []`, (b) a slide with a blank/whitespace `title`, and (c) a slide
  whose `bullets` is not an array; and returns the deck unchanged for a valid
  one. AND assert `generateOneArtifact` for `deck` surfaces a `null` parse as a
  GENERATION FAILURE (the route returns `{ error }`) rather than calling
  `serializeDeckToPptx`. Direction: RED if a zero-slide, blank-title, or
  non-array-bullets deck ever reaches `buildSlidesPptx` (which SRE measured
  either crashes with an internal message or silently ships a content-empty
  file).
- **Download error-state on throw (B2 / SRE 3a), BINDING.** Object: PRES-1's
  download handler's behaviour when `serializeDeckToPptx` throws. Instrument
  [READING]: a source-text/wiring test that the handler's `catch` (and the
  deck-generation `{ error }` branch) sets a rendered error STATE, not merely a
  `console.error`. Direction: RED if the only effect on a throw is a
  `console.error` with no state a component could render - the exact shape at
  `ppt-design/index.tsx:560-562`, which must NOT be copied. (The throw ITSELF is
  hard to trigger post-`validateDeck` and post-no-theme; this pins the handler's
  SHAPE, since nothing renders under vitest - R-4.)
- **Selection map (AC-4).** Object: `selectedContentKinds(selection)` output,
  over at least the selections {outline-only, deck-only, outline+deck, all
  three}. Instrument [MACHINE]: a PURE unit test (no `callLlm`) asserting the
  returned kind list equals exactly the selected content kinds, in fixed order,
  with every deselected kind ABSENT and `review` never appearing as a kind.
  Direction: RED if a subset selection returns all, if a selected kind is
  missing, if a deselected kind appears, or if the order drifts. (Must range over
  multiple selections - the partial-fix trap, `docs/loop/traps-spec.md:98-106`.)
  AC-4's "no `callLlm` for a deselected kind" is then guaranteed BY CONSTRUCTION
  (B1): the client requests only listed kinds, and `generateOneArtifact` /
  `regenerateArtifact` each act on exactly one kind (a single mocked-`callLlm`
  assertion of call count `=== 1` for a produce, `=== 2` with review, confirms
  the executor issues no extra call).
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
- **In-house egress (AC-3 MACHINE), widened (I2).** Object: the imports and
  source text of `src/app/api/presentations/generate/route.ts`,
  `src/lib/presentations/*.ts`, AND `src/app/components/presentations/*`
  (especially `SlideDeckPreview.tsx`). Instrument [MACHINE]: a source-text test
  asserting (1) the only generation egress is `@/lib/llm` (`callLlm`) - no
  external generation SDK import, no `fetch(` to a non-in-house host; AND (2) no
  component under `src/app/components/presentations/*` embeds an external viewer -
  no `<iframe`, no `office.com`, no `docs.google.com`. Direction: RED if any such
  import/link/embed is introduced. The component scan is REQUIRED because
  RENDERING is not GENERATION: a generation-only egress test would miss an
  external-viewer preview (a `<iframe src="office.com/...">` in
  `SlideDeckPreview.tsx`), which is exactly the in-house-only rule's failure mode
  the security pass flagged (R-SEC-1 / SEC-2).
- **Route shape and auth (2b), BINDING.** Object: the route handler file
  `src/app/api/presentations/generate/route.ts`. Instrument [READING/MACHINE]: a
  source-text test asserting it exports `runtime = "nodejs"` and
  `maxDuration = 60`, `await`s `requireUser()` before any generation, and its
  request type carries exactly ONE `kind` per generate op (never an array of
  kinds, never a full `ArtifactSelection`, never an internal loop over kinds).
  Direction: RED if `maxDuration` is missing or above 60 (fails to build on
  Hobby), if auth is absent, or if the body accepts/loops a kinds array (the
  never-loop contract, `command-interface.ts:26-32`). Note: this is NOT a
  `"use server"` file, so `use-server-exports.test.ts` and the type-re-export
  check do NOT bind it (B1 file-kind change).
- **Sequential `callLlm` per invocation (2a), BINDING (was residual R-A2).**
  Object: any single request the route handler issues. Instrument [READING]:
  count sequential `callLlm` invocations reachable from `POST` without an
  intervening network-response boundary. Direction: RED if that count x ~10.6s
  (SRE 2.2's worst-case-per-call retry-backoff figure) exceeds 50s (10s margin
  under the 60s hard cap, mirroring `class-trends-insight/route.ts`'s 50s/60s
  split). Under the single-kind boundary the count is <=2 (produce + review, or
  regenerate + re-review), so 2 x 10.6s = ~21.2s passes on a lower bound alone;
  the condition RE-FAILS the moment any future edit lets one entry point issue a
  third sequential call. Real Gemini latency remains owner-verified (R-SRE-1 /
  R-A2), but it can only raise the number, so the arithmetic bound is the gate.

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
| R-A2 | The ARITHMETIC/structural half of the 60s-cap concern is now a BINDING gate (pass condition 2a + 2b, section 9), NOT a residual - B1 made the entry point single-kind (<=2 `callLlm`/request) and moved it to a Route Handler with `maxDuration=60` + a 50s soft deadline. What remains a residual is ONLY the part this checkout cannot measure: REAL Gemini per-call latency (no API key), which can raise the ~21.2s lower bound but is owner-verified post-deploy (dedup with SRE R-SRE-1). | Owner | Time real generation requests against the deployed route; read Vercel function-duration data | Post-deploy owner verification (same as SRE R-SRE-1) |
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
