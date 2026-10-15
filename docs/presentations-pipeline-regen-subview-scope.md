# PRESENTATIONS-PIPELINE-REGEN-SUBVIEW: acceptance criteria + scope (reading B)

Author: loop-architect (Opus seat). Date: 2026-10-08. Branch: main.
Backlog row: `docs/BACKLOG.md:111` (PRESENTATIONS-PIPELINE). Owner decision
2026-10-08: READING B - a richer, dedicated per-slide regeneration surface with
slide thumbnails and a before/after preview, not just the W1 card.

This document is the design artifact. It authors no production code. It is
written to be adversarially checked by a fresh `loop-checker` before any
consumer (the test seat, the plan if re-cut, the implementer) reads it.

---

## 1. Executive summary

The owner wants, for the slide-deck pipeline, a dedicated surface to regenerate
any single slide, richer than the W1 card: a grid of the deck's slides to pick
from, and a before/after preview so the instructor sees the regenerated
candidate next to the current slide and chooses to keep or discard it. The W1
card (shipped at `2bd10b65`) already fixes the data-loss bug - its
`mergeRegeneratedSlide` splices one slide and preserves every other by
construction - and that pure function is REUSED here unchanged. What reading B
adds is a preview GATE in front of the merge: the committed deck is not touched
until the instructor accepts.

**The headline feasibility finding, stated plainly so no one downstream builds
against a fiction: there is no slide-image rasterizer anywhere in this stack.**
The only path that renders a `PptxSlide` to anything visual is
`buildSlidesPptx` (`src/lib/pptx.ts:199`), which produces a binary `.pptx`
ArrayBuffer via pptxgenjs - a downloadable file, opened in PowerPoint/Keynote,
never a per-slide image. The on-page preview that exists today,
`SlideDeckPreview` (`src/app/components/presentations/SlideDeckPreview.tsx`),
renders each slide as escaped React text (title + bullets + optional code +
notes) and its own comment declares it "the whole preview surface, never an
external viewer/iframe/redirect" (`:6-8`, SEC-2 / in-house-only). **Therefore a
"thumbnail" in this feature is a STRUCTURAL HTML representation of the slide
(its title and a short body preview), not a rasterized picture of the laid-out
slide.** This is achievable and is exactly the shipped `SlideDeckPreview`
idiom, miniaturized. Rendered-image fidelity is NOT promised and is recorded as
an owner-walk gap (RES-1): the only way to see the real laid-out slide remains
the `.pptx` download, which this environment cannot open or verify (no `.env`,
no component rendered by any test - `docs/loop/this-repo.md` section 6).

**Mount decision (the architect's call, which the task delegated - "a new
presentationsView child like 'slide-regen', or a full-screen mode within
PipelineTab").** The sub-view mounts as a **full-screen mode INSIDE
`PipelineTab`**, entered from the deck stage, not as a third `presentationsView`
rail child. Reasons in section 6; the rail-child alternative (B1) is recorded
there as considered-and-rejected with its cost. This delivers reading B's
experience (thumbnails + before/after + dedicated surface) while touching ZERO
of the IA files the Tools reorg touched (`manual-rail.ts`,
`src/app/url-state.ts`, `page.tsx`, `src/app/components/home/useAppNavigation.ts`),
so the "collides with the Tools reorg" cost
the owner was quoted at scoping time does not materialise. If the owner
specifically wants a rail chip for discoverability, that is B1 and is a larger,
separable wave.

**What is machine-checkable here** (vitest renders nothing, network blocked):
the slide-selection reducer, the candidate-extraction pure helper, the
accept-path merge reusing `mergeRegeneratedSlide`, the request-body wiring, the
discard-leaves-the-deck-unchanged guarantee (the leverage removal test), the
`ta-` persistence pins, and the no-stranded-key pin. **What is owner-walk only:
the thumbnails and before/after actually rendering, the regeneration quality,
and the laid-out `.pptx` fidelity.** Section 8 separates them.

**Shape hazard surfaced for the checker:** `panel-logic.test.ts:322-337` reads
`PipelineTab.tsx` AS SOURCE TEXT and pins the current W1 card (the
`reducePipelineResponse(...regenSlideIndex)` call site at `:325-329` and the
"Regenerate a slide" card mount at `:331-337`). Reading B replaces that card, so
those two pins WILL go red unless `panel-logic.test.ts` is in the write set and
updated in the same wave. It is (section 7, section 9).

---

## 2. Ground-truth findings (every citation opened; code quoted)

All line counts by `@(Get-Content <file>).Count` (PowerShell), the mandated
instrument, run 2026-10-08.

### 2.1 The slide model, and why a thumbnail is structural, not an image

`PptxSlide` (`src/lib/pptx.ts:19-39`):

```
export interface PptxSlide {
  title: string;
  bullets: string[];
  code?: string;
  codeLanguage?: string;
  notes?: string;
  graphic?: SlideGraphic;
}
```

- The ONLY visual render of these fields is `buildSlidesPptx`
  (`src/lib/pptx.ts:199-680`), returning `Promise<ArrayBuffer>` (the `.pptx`
  binary). In the pipeline it is reached only through the download path: the
  W2-extracted helper `downloadDeckPptx`
  (`src/app/components/presentations/pipeline/PipelineTab.tsx:79-93`) dynamically
  imports `serializeDeckToPptx` (`:80`), builds a Blob of type
  `...presentationml.presentation` (`:82-84`) and clicks an anchor; both
  `handleDownload` (`:305-317`) and the completion auto-download effect call it.
  No image is produced at any point.
- The on-page preview `SlideDeckPreview`
  (`src/app/components/presentations/SlideDeckPreview.tsx:13-98`) takes
  `{ slides: PptxSlide[] }` and renders each as a `Card` with an `<h5>` title
  (`:31-33`), a `<ul>` of bullets (`:36-48`), an optional monospace code block
  (`:50-79`) and italic speaker notes (`:81-92`) - all ordinary escaped JSX,
  "never `dangerouslySetInnerHTML`" (`:5-8`).
- No rasterizer exists: no `html2canvas`, no `pptx`-to-image, no headless
  renderer. Verified by search over the stack (`grep -rl "html2canvas\|toImage\|
  canvas.toDataURL" src` returns nothing relevant to slides; the only
  `toDataURL` use is theme-gradient background generation in the deck builder's
  caller, not a slide snapshot). **Conclusion: a thumbnail = a compact
  `SlideDeckPreview`-style structural card. This is final and not a limitation
  the implementer can engineer around here.**

### 2.2 The merge is already pure, tested, and reusable (W1)

`mergeRegeneratedSlide` (`src/app/components/presentations/pipeline/panel-logic.ts:205-211`):

```
export function mergeRegeneratedSlide(deck: DeckContent, slideIndex: number, newSlide: PptxSlide): DeckContent {
  if (!Number.isInteger(slideIndex) || slideIndex < 0 || slideIndex >= deck.slides.length) return deck;
  return { ...deck, slides: deck.slides.map((slide, i) => (i === slideIndex ? newSlide : slide)) };
}
```

Exported (`:205`), and tested in `panel-logic.test.ts:302-320`: replaces only
the indexed slide, preserves length and other slides, does not mutate input
(`:306-313`), and is a safe no-op for out-of-range / non-integer indexes
(`:315-319`). **This is the accept-path primitive and is reused verbatim.**
`applyStageEdit` (`src/lib/presentations/pipeline.ts:225-239`) is also exported
(re-exported from panel-logic at `:42`) and marks `standard`/`reviewInfoFlow`/
`reviewVisual`/`polish` stale when `deck` changes (`STAGE_DEPENDENCIES`,
`pipeline.ts:153-164`). Accepting a candidate therefore correctly stales the
downstream review/polish stages, exactly as a full deck regeneration would.

### 2.3 The regen route op already exists and is fully wired

- Wire contract: `PipelineOp` includes `"regen-slide"`
  (`src/lib/presentations/pipeline.ts:266-274`); its request payload is
  `{ context, frame, plan, deck, slideIndex, instruction }` (`:298-305`) and its
  success payload is `{ slides: PptxSlide[] }` (`:322`).
- Request builder: `buildPipelineRequest("regen-slide", state, contextText,
  { slideIndex, instruction })` (`panel-logic.ts:111-157`, the `regen-slide`
  case at `:142-155`), tested at `panel-logic.test.ts:137-167`. Exported.
- Route: `src/app/api/presentations/pipeline/route.ts` validates a `regen-slide`
  body (`:207-223`), requires a non-empty `instruction` and a non-negative
  integer `slideIndex`, builds the prompt via `buildRegenSlidePrompt`
  (`pipeline-prompts.ts:313-345`), and returns `{ op, status: "ok", slides }`
  where `parseRegenSlideResponse` (`pipeline-prompts.ts:354-358`) returns a
  one-element array `[parsed.slides[0]]`, or `refused(...)` (502) when empty
  (`route.ts:342-346`). **No route change is needed; the sub-view reuses this op.**

### 2.4 The W1 card AUTO-MERGES - reading B must not

`handleRegenSlide` (`PipelineTab.tsx:252-274`) POSTs the regen request and then
immediately folds the result into the committed deck via
`reducePipelineResponse("regen-slide", res.status, body, pipelineState,
regenSlideIndex)` (`:268`) -> `applyRegenSlideSuccess` (`panel-logic.ts:221-230`)
-> `mergeRegeneratedSlide`. There is no preview and no accept/discard. The card
itself is `PipelineTab.tsx:641-681`, mounted at module scope after the stage
`Card`, gated on `pipelineState.deck.status === "done"`. **Reading B splits the
fetch from the merge: fetch -> hold candidate -> before/after -> accept (merge)
or discard (no change).**

### 2.5 The IA layers, in their CURRENT (post-Tools-reorg) state

TOOLS-IA-REORG W1+W2 AND PPT-DESIGN-INTO-PRESENTATIONS have shipped. Confirmed
current state (re-measured at HEAD 2026-10-08):

- `PresentationsView = "slide-deck" | "pipeline" | "ppt-design"` - now THREE
  children, not two (`manual-rail.ts:57`), derived from a presence record
  (`:59-63`), with the guard `isPresentationsView` built from it (`:69`) - the
  drift-proof pattern, unlike the recording sub-tab ladder. The `ppt-design`
  child was added by PPT-DESIGN-INTO-PRESENTATIONS after this scope's sibling
  drafts were cut.
- Rail destinations: `presentations-slide-deck`, `presentations-pipeline`, and
  `presentations-ppt-design` (`manual-rail.ts:195-197`); `getActiveDestinationId`
  maps `presentationsView` (`:316`); `resolveStateFromDestinationId` maps the
  destination ids back (`:379`, the `presentationsView` branch at `:449-455`).
- URL param `presentationsView` (const `PRESENTATIONS_VIEW_PARAM`,
  `src/app/url-state.ts:311`), emitted only when non-default and `manualView ===
  "presentations"` (`:544-545`).
- Persisted key `ta-presentations-view` (`PRESENTATIONS_VIEW_KEY`,
  `src/app/components/home/useAppNavigation.ts:71`), read on init in the
  `useState` initializer (`:537-552`), written in an effect (`:689-690`),
  restored on Back/Forward (`:876`).
- Mount in `page.tsx:691-696` is a THREE-WAY branch, not a two-way ternary:
  `{presentationsView === "ppt-design" ? <PowerPointDesignTab /> :
  presentationsView === "pipeline" ? <PipelineTab /> : <PresentationsTab />}`.
- `manual-rail.test.ts` pins `presentations-pipeline` among the rail
  destinations. **Because B2 adds no rail child, none of these files change and
  `manual-rail.test.ts` stays green.** They are listed here only so the checker
  can confirm B2 avoids them and so the B1 alternative's true cost (all of the
  above, plus two tests) is visible.

File sizes relevant to the 1000-line ceiling
(`src/file-size-ceiling.structure.test.ts`, LIMIT 1000 at `:41`), by
`@(Get-Content <file>).Count` at HEAD 2026-10-08:
`PipelineTab.tsx` 684, `panel-logic.ts` 337, `panel-logic.test.ts` 490,
`SlideDeckPreview.tsx` 98, `page.tsx` 933, `home/useAppNavigation.ts` 938,
`url-state.ts` 572, `manual-rail.ts` 495. **`PipelineTab.tsx` at 684 is the
one to watch:** the sub-view's richness must live in its OWN component file, not
inline, or the ceiling is at risk (section 5).

### 2.6 Persistence idiom and the pre-existing gap

`usePersistedJSON` (`src/app/components/presentations/hooks.ts:25-43`) is the
house hook: seeds from `localStorage` on init, writes on change, `ta-` keys. The
pipeline already uses it for `ta-pres-pipeline-state`,
`ta-pres-pipeline-context-text`, `ta-pres-pipeline-sources` (key constants
`PipelineTab.tsx:72-74`, `usePersistedJSON` calls `:179-184`). **Pre-existing
inconsistency the checker should note:** the W1 card's `regenSlideIndex` and
`regenInstruction` are plain `useState` (`PipelineTab.tsx:188-189`), NOT persisted - a standing violation of
the persist-ui-control-state rule. Reading B's sub-view FIXES this: its mode,
selected index and instruction are all persisted (section 4).

---

## 3. Leverage claim (feature work - a user-reachable capability)

**Class: GUARANTEED** (`docs/loop/leverage.md:44`). The regenerated slide is held
as an unconfirmed CANDIDATE outside the committed deck, and the committed deck's
contents are provably unchanged until the instructor explicitly accepts; on
discard the deck is byte-for-byte what it was. A chat window cannot do this: a
chat re-emits slide text as prose in the transcript, and nothing downstream can
guarantee the other slides were preserved or that an unwanted regeneration did
not already overwrite the slide the instructor meant to keep. Here the preserve
property is structural (`mergeRegeneratedSlide`, inherited from W1) AND the
"nothing changes until accept" property is new to this feature (the candidate
hold + discard path this sub-view builds).

**Earned vs inherited:** the merge-preservation is inherited from W1 and is not
claimed as this feature's own. What THIS feature earns is the preview gate - the
deck is not mutated on a regeneration at all until accept. That required building
candidate-hold state and a discard path that did not exist in the auto-merging
W1 card.

**The one removal-test acceptance criterion (AC-R, the test seat owns the final
oracle):** a pure reducer over `{deck, candidate}` state, given a DISCARD action,
returns a `PipelineState` whose `deck.artifact` deep-equals the pre-regeneration
deck (same slides, same order, same length). **State the deletion:** delete the
discard branch so discard falls through to accept (auto-merge). **Trace the
assertion:** the asserted value - `deck.artifact` after discard - changes from
"original deck" to "deck with the candidate spliced in", so the assertion goes
red. This is a pure-function test, buildable here (no render, no network).

---

## 4. Acceptance criteria

Each is phrased as what a user experiences or a failure a test must catch.
Mechanism is in sections 5-6; oracle construction is the test seat's (section 8).

**AC-1 (entry).** From the deck stage of the pipeline, once a deck exists
(`pipelineState.deck.status === "done"`), the instructor can open a dedicated
full-screen "Regenerate a slide" sub-view with one click. When no deck exists,
the entry control is not offered (same gate as the W1 card). FAIL: the entry
control is absent when a deck is done, or present/active when no deck exists.

**AC-2 (return).** From the sub-view the instructor can return to the pipeline
with one click, landing back on the deck stage. FAIL: no return control, or
return loses the pipeline state.

**AC-3 (persistence / reload).** The sub-view being open, the selected slide
index, and the typed instruction each survive a reload, via `ta-` keys. On
reload with the sub-view open and a deck present, the instructor is still in the
sub-view with the same slide selected. FAIL: reload drops back to the pipeline,
or loses the selected index, or any control state does not persist. (A
transient, unconfirmed CANDIDATE is explicitly NOT persisted - see AC-7.)

**AC-4 (no stranded key).** Every `ta-` key this feature writes is also read on
init and used. FAIL: a key is written but never read (D26 stranded key).

**AC-5 (thumbnails).** The sub-view shows every slide of the deck as a
selectable STRUCTURAL card (its number, title, and a short body preview), with
the currently selected slide visibly highlighted; selecting a card changes the
selection. The copy and empty state make explicit that this is a text/structure
preview, not a rendered image. FAIL: the grid does not list all `deck.slides`,
selection does not track, or the surface implies image fidelity it does not have.

**AC-6 (before/after preview).** After the instructor enters an instruction and
triggers regeneration for the selected slide, the sub-view shows the CURRENT
committed slide and the regenerated CANDIDATE side by side, both rendered with
the `SlideDeckPreview` idiom. FAIL: the candidate is merged into the deck before
the instructor sees it (i.e. the W1 auto-merge behaviour survives), or only one
side is shown.

**AC-7 (accept / discard).** From the before/after preview, Accept merges the
candidate into the deck at the selected index via `mergeRegeneratedSlide`,
preserving every other slide and the deck length, and marks the downstream
review/polish stages stale (via `applyStageEdit`). Discard clears the candidate
and leaves the committed deck unchanged. After either action the candidate is no
longer held. FAIL: accept drops or reorders other slides, or does not stale
downstream; discard mutates the deck; the candidate persists after the action.

**AC-8 (request wiring).** Regeneration POSTs the existing `regen-slide` op built
by `buildPipelineRequest("regen-slide", state, contextText, { slideIndex,
instruction })` with the SUB-VIEW's selected index and instruction - no new
endpoint, no new wire contract. A failed/empty/error response surfaces a worded
error in the sub-view and does NOT produce a candidate. FAIL: a new route is
added, the wrong index is sent, or an error response yields a bogus candidate.

**AC-9 (leverage removal test).** AC-R of section 3. FAIL: discard does not leave
the committed deck unchanged, or no such assertion exists.

**AC-10 (house style).** Professional, modern, minimal; reuses the app's visual
language (MUI `Card`/`Button`/`TextField`, `var(--space-*)` tokens, the
`SlideDeckPreview` rendering); no emojis (`src/lib/no-emojis.test.ts`). FAIL: a
new bespoke visual vocabulary, or any emoji in code/copy.

---

## 5. The sub-view: components and the candidate seam

**New component file:** `src/app/components/presentations/pipeline/SlideRegenView.tsx`
(a `.tsx`; not collected by vitest, so its logic that needs testing stays in the
`.ts` seam below). It receives the pipeline's `deck` (`DeckContent`), the
`contextText`, the full `PipelineState`, and a `setPipelineState` updater and an
`onBack` callback from `PipelineTab`. It renders:

- the thumbnail grid (structural cards over `deck.slides`, selected highlighted);
- the selected slide's instruction `TextField` and a "Generate candidate" button;
- when a candidate is held, the before/after pair (two `SlideDeckPreview` renders,
  each passed a single-element `[slide]` array) with Accept and Discard buttons;
- loading / error / empty copy states.

**Two new pure, EXPORTED seams in `panel-logic.ts` (`.ts`, so they ARE testable
under vitest - a `.tsx` handler is not):**

1. `extractRegenCandidate(httpStatus: number, body: unknown): PptxSlide | null`.
   Mirrors the existing `isMatchingOkBody("regen-slide", ...)` shallow check
   (`panel-logic.ts:172-192`): returns `body.slides[0]` when `httpStatus === 200`
   and `body` is an ok `regen-slide` payload with a non-empty `slides` array,
   else `null`. The surface between the route and the preview - the layer the
   user reaches, named explicitly (the brief's "the surface is a layer" rule).

2. `applyRegenDecision(state: PipelineState, candidate: PptxSlide, slideIndex:
   number, action: "accept" | "discard"): PipelineState`. The accept/discard
   DECISION, as a pure function with an explicit, deletable discard branch:

   ```
   export function applyRegenDecision(
     state: PipelineState, candidate: PptxSlide, slideIndex: number,
     action: "accept" | "discard",
   ): PipelineState {
     if (action === "discard") return state;          // <- the branch I-3 sabotages
     const deck = state.deck.artifact;
     if (!deck) return state;
     return applyStageEdit(state, "deck", mergeRegeneratedSlide(deck, slideIndex, candidate));
   }
   ```

   This is why the reducer is extracted rather than inlined: the GUARANTEED
   leverage claim's removal test (I-3) needs a coherent production mutation
   ("remove the discard branch") and a pure assertion ("deck unchanged after
   discard"), neither of which exists if Accept/Discard are inline `.tsx`
   handlers that vitest never runs. Accept composes through the SAME
   `mergeRegeneratedSlide` + `applyStageEdit` as W1, so no merge path is
   duplicated.

**Why these rather than reusing `reducePipelineResponse`:**
`reducePipelineResponse` MERGES on success (the auto-merge W1 used). The preview
flow must obtain the candidate WITHOUT merging, so extraction (seam 1) and the
accept/discard decision (seam 2) are deliberately separated from the fetch.

**SlideRegenView's Accept and Discard handlers both call `applyRegenDecision`,
never a merge or a clear inline:**
- Accept: `setPipelineState(prev => applyRegenDecision(prev, candidate,
  selectedIndex, "accept"))`, then clear the local candidate.
- Discard: `setPipelineState(prev => applyRegenDecision(prev, candidate,
  selectedIndex, "discard"))` (a no-op on `state` by construction), then clear
  the local candidate. Routing discard through the reducer - rather than "just
  skip the setState" - is deliberate: it keeps the discard branch a line of
  PRODUCTION code that I-3's sabotage can delete, instead of an absence that
  cannot be mutated.

**PipelineTab changes (minimal, to hold the ceiling):** add a persisted mode
flag, an entry button in the deck stage block, and a conditional top-level mount
of `<SlideRegenView .../>` when the mode is "regen". REMOVE the W1 card
(`PipelineTab.tsx:641-681`) and `handleRegenSlide` (`:252-274`) / the
`regenSlideIndex` / `regenInstruction` `useState` (`:188-189`) that only served
it; those responsibilities move into the sub-view. Net line change to
`PipelineTab.tsx` is expected to be near zero or negative, so the 684 count does
not approach the ceiling; the richness lives in `SlideRegenView.tsx`.

**PRESERVE, DO NOT REMOVE (W2 auto-download machinery).** While restructuring
`PipelineTab.tsx` the implementer must KEEP the following intact - they belong to
the W2 auto-download feature (PRESENTATIONS-PIPELINE W2, `415315fc`), NOT to the
W1 regen card, and nothing in reading B touches them:
- the auto-download `useEffect` (`PipelineTab.tsx:200-206`);
- `autoDlFingerprint` state (`:195`);
- `PIPELINE_AUTODL_FINGERPRINT_KEY = "ta-pres-pipeline-autodl-fingerprint"`
  (`:75`);
- the `downloadDeckPptx` helper (`:79-93`) and its sole `serializeDeckToPptx`
  dynamic import - `handleDownload` (`:305-317`) and the auto-download effect
  BOTH call it, so it must remain the single download path;
- `isPipelineComplete` / `deckFingerprint` / `shouldAutoDownloadDeck`
  (`panel-logic.ts:313-337`), which the effect reads.
Their source-text pins (`panel-logic.test.ts:478-490`, section 9) assert
`usePersistedJSON<string>(PIPELINE_AUTODL_FINGERPRINT_KEY ...)`,
`downloadDeckPptx(` appearing at least 3 times, and `serializeDeckToPptx(`
exactly once; reading B keeps all three green because it adds no new download
call and removes none. Removing the W1 card does not touch any of these - the
card is the `pipelineState.deck.status === "done"` block at `:641-681`, disjoint
from the auto-download block.

**Collision confirmation (Accept vs the auto-download effect).** Accepting a
candidate runs `applyRegenDecision(state, candidate, i, "accept")` ->
`applyStageEdit(state, "deck", mergeRegeneratedSlide(...))`. `applyStageEdit`
(`pipeline.ts:225-239`) stales the deck's dependents via `STAGE_DEPENDENCIES`
(`pipeline.ts:153-164`: `standard`/`reviewInfoFlow`/`reviewVisual`/`polish`), so
immediately after an Accept `isPipelineComplete` (`panel-logic.ts:313-316`)
returns `false` (not every stage is `sources`), so `shouldAutoDownloadDeck`
returns `{ download: false }` and the auto-download effect does nothing - there is
NO spurious download on Accept. When the instructor later re-runs the staled
stages to a genuine completion, the deck's `deckFingerprint` has changed (the
accepted slide differs), so the effect fires exactly once for the new completion.
The two features compose correctly by inheritance; reading B adds no new
coupling.

---

## 6. Mount + nav: the shape, decided and justified

**Chosen (B2): a full-screen mode inside `PipelineTab`.** A persisted flag
`ta-pres-pipeline-regen-open` (boolean-as-JSON via `usePersistedJSON`) selects
between the pipeline body and the sub-view. The deck stage block gains a
"Regenerate a slide" button (gated on `deck.status === "done"`) that sets the
flag true; the sub-view's header carries a "Back to pipeline" button that sets it
false. The sub-view's own controls persist via `ta-pres-regen-slide-index` and
`ta-pres-regen-instruction`.

Reachability trace, every hop (the brief's "trace the path from the control to
the code" rule):

1. Instructor is on `presentationsView === "pipeline"` (`page.tsx:693-694`),
   `PipelineTab` mounted.
2. Deck stage done -> "Regenerate a slide" button visible -> click sets
   `ta-pres-pipeline-regen-open = true`.
3. `PipelineTab` reads the flag and renders `<SlideRegenView>` instead of the
   pipeline body (reads `pipelineState.deck` in memory - no re-fetch, no
   cross-surface sync).
4. Thumbnail grid over `deck.slides`; select sets `ta-pres-regen-slide-index`.
5. Instruction typed into `ta-pres-regen-instruction`; "Generate candidate" ->
   `buildPipelineRequest("regen-slide", ...)` -> `fetch(PIPELINE_URL)` ->
   `extractRegenCandidate` -> candidate held in local (non-persisted) state.
6. Before/after -> Accept (`mergeRegeneratedSlide` + `applyStageEdit`) or Discard.
7. "Back to pipeline" -> flag false -> pipeline body returns, deck stage active.

No IA-layer file is touched, so the five-edit sub-tab reachability ladder
(`docs/loop/traps-spec.md:58-64`) does not apply and cannot be half-done.

**D26 compliance:** the sub-view is a presentation over the SAME pipeline params
(the one deck in `ta-pres-pipeline-state`), not a new param; persisted via `ta-`
keys; every key read on init (AC-4); no new URL param, no stranded key.

**Hydration guard (required mechanism, not a nicety).** The mode flag
`ta-pres-pipeline-regen-open` must NOT be read straight into a `useState`
initializer and used to choose what renders on the first paint: a
localStorage-seeded initializer diverges from the server/default render and
React only warns on the mismatch, so the sub-view can fail to show on reload
(`persisted-details-open-hydration`, the repo's recorded instance). The shape:
first render uses the default (pipeline body), and a mount `useEffect` then reads
the persisted flag and sets the mode. `usePersistedJSON` (hooks.ts:25-43) seeds
in its own initializer, so for the OPEN flag specifically the sub-view/PipelineTab
must apply the mount-effect pattern on top of it (or store the flag with a
mounted-gate), rather than branching render on the seeded value directly. The
selected-index and instruction keys do not have this problem - they feed form
controls, not a mount-time branch. If the implementer cannot apply the guard
cleanly, it is flagged as RES-6 (an explicit UX follow-up), never shipped as a
silent reload regression.

**Rejected alternative (B1): a FOURTH `presentationsView` child "slide-regen".**
(There are now THREE children - `slide-deck`, `pipeline`, `ppt-design`, section
2.5 - so B1 would add a fourth, not a third.) Considered and rejected because:
(a) it would be reachable as a rail chip even when no deck exists, splitting one
task (build a deck, then refine a slide) across two sibling chips and worsening
click-cost and discoverability; (b) it pays the full IA tax - edits to
`manual-rail.ts` (the view union, presence record, rail destination,
`getActiveDestinationId`, `resolveStateFromDestinationId`), `src/app/url-state.ts`
(param normaliser, read, emit), `page.tsx` (the three-way mount branch), and
`src/app/components/home/useAppNavigation.ts` (key, init, effect, Back/Forward
restore), PLUS updates to `manual-rail.test.ts` and new url-state coverage -
against the near-zero IA cost of B2; (c) it requires a second surface to read the
same `ta-pres-pipeline-state` with no benefit over reading it in memory. **This delivers the SAME reading-B
experience; only the mount is cheaper. If the owner wants a persistent rail chip
specifically, that preference turns B1 back on as a separate wave - recorded as
RES-2, not re-litigated here.**

---

## 7. Wave plan + write set per wave

One scoped item, cut into two dependency waves. No two waves touch the same file,
so each is independently gate-able; wave 2 depends on wave 1's pure seam.

### Wave 1 - the pure candidate seam + its tests

- **Writes:**
  `src/app/components/presentations/pipeline/panel-logic.ts` (add
  `extractRegenCandidate`; ~12 lines; 337 -> ~349, well under 1000).
  `src/app/components/presentations/pipeline/panel-logic.test.ts` (add the
  `extractRegenCandidate` unit block).
- **Caller rule:** `extractRegenCandidate`'s runtime caller is `SlideRegenView`
  in wave 2. To satisfy the repo's "a wave must include the caller of each new
  export" rule WITHIN wave 1, wave 1 keeps `extractRegenCandidate` exported and
  proven by its own tests (the sanctioned "consumed by its own tests, named
  downstream caller" shape this module already uses, `panel-logic.ts:4-9`), and
  the plan note records that wave 2 is its production caller. If the plan seat
  prefers a single wave, waves 1 and 2 may be merged - they are split only for
  reviewability, not by a hard dependency boundary.
- **Gate:** `npx tsc --noEmit`; `npx vitest run
  src/app/components/presentations/pipeline/panel-logic.test.ts`;
  `npx vitest run src/file-size-ceiling.structure.test.ts`; `npm run lint`
  (no new warning in the written files).

### Wave 2 - the sub-view, the PipelineTab mode, the persistence, and the pin update

- **Writes:**
  `src/app/components/presentations/pipeline/panel-logic.ts` (EDIT again in W2:
  add the exported `applyRegenDecision` reducer from section 5; ~6 lines). This
  file is therefore in BOTH wave write sets - `extractRegenCandidate` in W1,
  `applyRegenDecision` in W2. The waves are SEQUENTIAL (W2 depends on W1), not
  concurrent, so editing the same file in both is not a disjointness violation
  (the disjointness rule governs concurrent items; `docs/loop/parallel-disjointness.md`).
  `src/app/components/presentations/pipeline/SlideRegenView.tsx` (NEW - the
  thumbnail grid, before/after, and the Accept/Discard handlers that call
  `applyRegenDecision`; this is the production caller of both W-waves' pure seams;
  est. 180-260 lines, under 1000).
  `src/app/components/presentations/pipeline/PipelineTab.tsx` (add mode flag,
  entry button, sub-view mount; REMOVE the W1 card + its dead state/handler; net
  near zero).
  `src/app/components/presentations/pipeline/panel-logic.test.ts` (ADD the
  `applyRegenDecision` I-2/I-3 unit block, AND rewrite the two source-text pins at
  `:325-329`/`:331-337` - see below).
  A new `SlideRegenView.wiring.test.ts` for the source-text request/accept wiring
  assertions (I-4, I-5, I-6) that read `SlideRegenView.tsx` - these cannot live in
  `panel-logic.test.ts`, which reads `PipelineTab.tsx`, not the sub-view. Do NOT
  import helpers across `*.test.ts` files - duplicate them, per
  `docs/loop/this-repo.md`.
- **Pin update detail (the owns-file shape hazard, resolved):**
  `panel-logic.test.ts:323` reads `PipelineTab.tsx` as source text
  (`describe("PipelineTab wiring (source-text pin)")` at `:322`), so its pins can
  only assert things that still live in `PipelineTab.tsx`.
  - `:325-329` currently asserts the card calls `reducePipelineResponse(...,
    regenSlideIndex)`. Under reading B that call leaves `PipelineTab.tsx` entirely
    (the accept wiring now lives in `SlideRegenView.tsx` via `applyRegenDecision`).
    So this pin is REPLACED with an assertion that still belongs in
    `PipelineTab.tsx`: that the deck-stage block mounts the "Regenerate a slide"
    ENTRY BUTTON and that `<SlideRegenView` is conditionally mounted. The
    request/accept WIRING assertion (that `SlideRegenView` calls
    `buildPipelineRequest("regen-slide", ...)` with the selected index and
    `applyRegenDecision` on accept/discard) is routed to
    `SlideRegenView.wiring.test.ts` (I-4), which reads the sub-view's own source.
  - `:331-337` asserts the "Regenerate a slide" card mounts after the standard
    block; REPLACED with the entry-button/sub-view-mount assertion above.
  These are pin rewrites that follow the shipped behaviour, not deletions (I-7).
- **Gate:** `npx tsc --noEmit`; the two-path run via the wrapper
  `npm run test:paths src/app/components/presentations/pipeline/panel-logic.test.ts
  src/app/components/presentations/pipeline/SlideRegenView.wiring.test.ts` (raw
  multi-path `vitest` silently drops an unmatched path -
  `docs/loop/this-repo.md` section 1); `npx vitest run
  src/file-size-ceiling.structure.test.ts`; `npm run lint`; `npm run build`
  (grep for `Compiled successfully`, do not `&&` on exit code).

**Flagged for the plan/implementer:** a new `presentationsView` child would
touch `manual-rail.ts` + `src/app/url-state.ts` + `page.tsx` +
`src/app/components/home/useAppNavigation.ts` - the same files TOOLS-IA-REORG
touched. Those shipped (W1+W2), so there is **no
live collision**, but B2 touches NONE of them; the only cross-file edit is the
source-text pin in `panel-logic.test.ts`. Confirm current state at section 2.5
before assuming any of those four files are involved - under the chosen shape
they are not.

---

## 8. Frozen tests / instruments

Vitest renders no component and the network is blocked
(`docs/loop/this-repo.md` sections 2, 6). So the rendering of the thumbnails and
the before/after, the regeneration quality, and the `.pptx` layout fidelity are
OWNER-WALKS, recorded as residuals. Everything else is machine-checkable as a
pure function or a source-text pin. Each pass condition below names the object,
the instrument, and the direction of failure. The test seat owns final oracle
construction; these are the instruments and their fail directions.

### Machine-checkable (the implementer's tests are written from the test seat's notes)

**I-1 candidate extractor.** Object: `extractRegenCandidate(httpStatus, body)`.
Instrument: a pure unit test in `panel-logic.test.ts`. Pass: `(200, { op:
"regen-slide", status: "ok", slides: [s0, s1] })` returns `s0`; `(200, { ...,
slides: [] })`, `(502, { status: "error", reason })`, a non-200 status, and a
malformed body each return `null`. FAIL (red): a non-ok or empty body yields a
non-null candidate, or an ok body yields `null`.

**I-2 accept preserves the deck (reuses the W1 guarantee).** Object: the
`PipelineState` returned by `applyRegenDecision(state, c, i, "accept")` - the
same pure reducer as I-3. Instrument: a pure test against a frozen literal
3-slide deck oracle. Pass: `deck.slides` equals the original with only index `i`
replaced, length unchanged, other slides `toEqual` the originals;
`reviewInfoFlow`/`reviewVisual`/`standard`/`polish` statuses are `"stale"`. FAIL:
any other slide changes, length changes, or a downstream stage is not staled.
(`mergeRegeneratedSlide`'s own preservation is already pinned at
`panel-logic.test.ts:306-319`; I-2 pins the ACCEPT composition through the
reducer.)

**I-3 discard leaves the deck unchanged (the leverage removal test, AC-9).**
Object: the `PipelineState` returned by `applyRegenDecision(state, candidate,
slideIndex, "discard")` - the pure EXPORTED reducer from section 5, in
`panel-logic.ts` (`.ts`), so this runs under vitest with no render. Instrument: a
pure unit test against a frozen literal 3-slide deck oracle. Pass: after
`"discard"`, the returned state's `deck.artifact` deep-equals the input state's
`deck.artifact` (same slides, order, length), and every stage status is
unchanged. FAIL (red) on the stated deletion: remove the `if (action ===
"discard") return state;` line so discard falls through to the accept branch, and
the asserted deck now contains the spliced candidate. This is the one assertion
that goes red when the feature's earned advantage is removed, and it is a
coherent production mutation precisely because the discard branch is a line of
`.ts` code, not an inline `.tsx` absence. (I-2 above asserts the `"accept"` branch
of the same reducer preserves the other slides and stales downstream.)

**I-4 request + decision wiring.** Object: the source of `SlideRegenView.tsx`.
Instrument: a source-text (`readFileSync`) wiring assertion in
`SlideRegenView.wiring.test.ts`. Pass: the source (a) calls
`buildPipelineRequest("regen-slide", ...)` with the sub-view's selected index
variable and instruction variable (not a hardcoded `0`) and posts to the existing
`PIPELINE_URL`, introducing no new `fetch` URL or route import; and (b) routes
BOTH its accept and discard handlers through `applyRegenDecision` (so the preview
gate's merge/no-merge decision is the pure reducer's, not an inline `.tsx`
merge/clear that I-3 could not mutate). FAIL: a new endpoint string appears, the
index passed is not the selection state, or a handler merges/clears inline
instead of calling `applyRegenDecision`. (Pin the FACT and the ordering, never
the exact spelling - `docs/loop/this-repo.md`, source-text-tests-overspecify.)

**I-5 persistence pins (AC-3).** Object: the sources of `SlideRegenView.tsx` /
`PipelineTab.tsx`. Instrument: source-text assertion. Pass: the three keys
`ta-pres-pipeline-regen-open`, `ta-pres-regen-slide-index`,
`ta-pres-regen-instruction` are each passed to `usePersistedJSON`. FAIL: a
control uses plain `useState` where persistence is required.

**I-6 no-stranded-key pin (AC-4).** Object: each `ta-` key this feature adds.
Instrument: source-text assertion that each key literal appears as an argument
to `usePersistedJSON` (which both reads on init and writes) - so a written key
is necessarily read. FAIL: a key written via `localStorage.setItem`/a bare effect
with no corresponding init read. (This is the "no orphan view / no stranded key"
pin for the chosen B2 shape; under B1 the equivalent pin would instead assert the
third child is reachable through all four IA layers.)

**I-7 the superseded-card pins are updated, not deleted.** Object:
`panel-logic.test.ts`. Instrument: the updated pins themselves (section 7). Pass:
the pin asserts the NEW accept wiring and the NEW entry-button/sub-view mount.
FAIL: the old `reducePipelineResponse(...regenSlideIndex)` or "card after
standard block" pins remain and go red against the shipped diff, OR the pins are
simply removed with no replacement (a deletion - `iteration-caps.md` residual
rule).

**I-8 emoji / source-bytes.** Object: all written files. Instrument: the
committed `src/lib/no-emojis.test.ts` and `src/source-bytes.structure.test.ts`
(never a hand-rolled scan). Pass: exit 0. FAIL: any emoji or non-text byte.

### Owner-walk only (no instrument exists here; recorded as residuals)

- The thumbnail grid and before/after actually RENDER and are legible (no
  component renders under vitest). -> RES-3.
- The regeneration produces a good slide (no API key, LLM mocked only). -> RES-4.
- The `.pptx` download opens with the accepted slide laid out correctly (no
  `.pptx` can be opened or rasterized here). -> RES-1.

---

## 9. owns file list

Derived 2026-10-08 by searching for every test that names the write-set files or
their pinned strings as source text:

```
grep -rln -e "PipelineTab" -e "pipeline/panel-logic" -e "SlideDeckPreview" \
  -e "Regenerate a slide" -e "mergeRegeneratedSlide" -e "presentations-pipeline" \
  -e "presentations/pipeline" src --include=*.test.ts
```

Output (pasted verbatim):

```
src/app/api/presentations/pipeline/route.test.ts
src/app/components/manual/manual-rail.test.ts
src/app/components/presentations/pipeline/panel-logic.test.ts
```

Classification:

- `panel-logic.test.ts` - **OWNED and edited.** It reads `PipelineTab.tsx` as
  source text in TWO `describe` blocks:
  - `describe("PipelineTab wiring (source-text pin)")` (`readFileSync` at `:323`)
    pins the W1 card: the `reducePipelineResponse(...regenSlideIndex)` call site
    (`:325-329`) and the "Regenerate a slide" card mount after the standard block
    (`:331-337`). **These two pins go red under reading B** unless rewritten in
    wave 2 (I-7). In the write set.
  - `describe("PipelineTab auto-download wiring (source-text pin)")`
    (`readFileSync` at `:479`; asserts at `:481-488`:
    `usePersistedJSON<string>(PIPELINE_AUTODL_FINGERPRINT_KEY ...)`,
    `downloadDeckPptx(` appearing >= 3 times, and `serializeDeckToPptx(` exactly
    once). **These pins must STAY GREEN** - reading B touches neither
    `downloadDeckPptx` nor `serializeDeckToPptx` and adds no new download call, so
    the implementer must keep the auto-download effect, `downloadDeckPptx`, and
    `handleDownload` intact (section 5, PRESERVE). Do NOT edit these three
    assertions.
- `manual-rail.test.ts` - **checked-safe.** It matched on the `presentations-pipeline`
  rail destination string. Because B2 adds no rail child, `manual-rail.ts` is not
  edited and this test stays green. NOT in the write set. (It WOULD be, under the
  rejected B1 shape.)
- `route.test.ts` - **checked-safe.** It exercises the `regen-slide` ROUTE, which
  is unchanged (section 2.3). The sub-view reuses the route; no route edit. NOT in
  the write set.

Full write set (new + edited), by wave:

- Wave 1: `src/app/components/presentations/pipeline/panel-logic.ts` (edit),
  `src/app/components/presentations/pipeline/panel-logic.test.ts` (edit).
- Wave 2: `src/app/components/presentations/pipeline/SlideRegenView.tsx` (new),
  `src/app/components/presentations/pipeline/PipelineTab.tsx` (edit),
  `src/app/components/presentations/pipeline/panel-logic.test.ts` (edit - the pin
  rewrite), and optionally `.../SlideRegenView.wiring.test.ts` (new).

`file-size-ceiling.structure.test.ts` runs in both wave gates unconditionally
(`docs/loop/this-repo.md` section 1). No file is pushed past 1000 by this plan;
the one to watch, `PipelineTab.tsx`, is expected flat-to-smaller because the W1
card leaves it as the sub-view arrives.

---

## 10. Disposition table (W1 card -> reading B)

Reading B restructures the W1 per-slide-regen surface. Each prior element:

| Prior element (W1, `2bd10b65`) | Disposition | Where it goes |
|---|---|---|
| `mergeRegeneratedSlide` pure fn (`panel-logic.ts:205-211`) | KEPT | Reused verbatim as the Accept primitive (AC-7). Its tests (`panel-logic.test.ts:302-320`) stay green. |
| `reducePipelineResponse` regen fold (`panel-logic.ts:221-230, 232-268`) | KEPT, no longer the UI path | Still the auto-merge reducer; the sub-view uses `extractRegenCandidate` + explicit merge instead, so the fold is no longer reached from the UI but is not removed (it has its own tests at `panel-logic.test.ts:214-251`). |
| W1 "Regenerate a slide" CARD (`PipelineTab.tsx:641-681`) | WITHDRAWN (superseded) | Replaced by the deck-stage entry button + `SlideRegenView`. Its enforcer pins (`panel-logic.test.ts:325, 331`) are REWRITTEN to the new wiring (I-7), not deleted. |
| `handleRegenSlide` + `regenSlideIndex`/`regenInstruction` `useState` (`PipelineTab.tsx:188-189, 252-274`) | HANDED OVER | Responsibility (select index, instruction, POST, fold) moves into `SlideRegenView` + the accept path; the selection/instruction become PERSISTED controls (fixing the section 2.6 gap). |
| W1 auto-merge-on-success behaviour | REPLACED | By the before/after preview gate (AC-6, AC-7): the deck is not mutated until Accept. |
| W2 auto-download machinery: effect (`PipelineTab.tsx:200-206`), `autoDlFingerprint` (`:195`), `PIPELINE_AUTODL_FINGERPRINT_KEY` (`:75`), `downloadDeckPptx` (`:79-93`), `isPipelineComplete`/`deckFingerprint`/`shouldAutoDownloadDeck` (`panel-logic.ts:313-337`) | PRESERVED (not part of W1 regen; untouched by reading B) | Kept intact while restructuring `PipelineTab.tsx` (section 5, PRESERVE). Its pins (`panel-logic.test.ts:478-490`) stay green; Accept stales deck dependents so no spurious auto-download fires (section 5, collision confirmation). |

No prior requirement is silently dropped; the merge-fix and its data-loss
guarantee survive unchanged.

---

## 11. Residual register

Each names an owner, an instrument, and the step that will measure it. A residual
not in `docs/BACKLOG.md` does not exist - these must be appended to the
PRESENTATIONS-PIPELINE row (or filed as rows) at disposal.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-1 | The accepted slide's real laid-out `.pptx` fidelity (the structural preview is not an image). | Owner | Open the downloaded `.pptx` in PowerPoint/Keynote. | Owner-walk after ship; this environment cannot open or rasterize `.pptx` (`this-repo.md` s6). |
| RES-2 | Whether a PERSISTENT rail chip (B1) is wanted for discoverability over the in-pipeline mode (B2). | Owner | Product decision. | One batched question at hand-off; B2 ships regardless. If yes, B1 is a separate wave touching the four IA files in section 2.5. |
| RES-3 | The thumbnail grid and before/after actually render and are legible. | Owner | Visual walk in the running app. | Owner-walk; no component renders under vitest. |
| RES-4 | Regeneration quality / on-instruction behaviour. | Owner | Run in the app with a live key. | Owner-walk; LLM mocked and network blocked here. |
| RES-5 | Pre-existing: W1's `regenSlideIndex`/`regenInstruction` were unpersisted. Reading B fixes this for the sub-view; confirm no other pipeline control remains unpersisted. | loop-seat (UX, wave 3 follow-up) | Source read of `PipelineTab.tsx` for plain `useState` on textboxes/selects. | Follow-up UX pass against the as-built diff. |
| RES-6 | The `ta-pres-pipeline-regen-open` mode flag's hydration guard (section 6) is only confirmable by a live reload, which this environment cannot do (no component renders). Specified as the mount-effect pattern; falls here as a UX follow-up ONLY if the implementer cannot apply it cleanly. | Owner / loop-seat (UX) | Live reload walk with the sub-view open; source read for the mount-effect pattern on the OPEN flag. | Owner-walk after ship; source-read check in the wave-3 follow-up. |

---

## 12. What this scope did NOT determine (stated plainly)

- Whether the thumbnail body preview should truncate at N bullets or N
  characters, and how a code/graphic slide previews compactly - a visual/UX
  detail for the wave-3 seats against the as-built diff, not a shape decision.
- The exact copy for the empty/loading/error states - User experience seat.
- Whether to persist the instruction at all (persisting an unconfirmed
  instruction is mildly odd but rule-compliant); scoped as persisted for the
  persist-ui-control-state rule, but the UX seat may argue to clear it on accept.
- Whether `extractRegenCandidate` lives in `panel-logic.ts` or a new leaf - placed
  in `panel-logic.ts` here because it sits beside its sibling `isMatchingOkBody`;
  the plan seat may relocate it without changing the contract.
