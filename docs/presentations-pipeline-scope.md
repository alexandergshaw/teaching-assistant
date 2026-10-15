# Presentations PIPELINE - auto-download + per-slide regen - acceptance criteria + scope

Branch `main`. Author: architecture seat (`loop-architect`), 2026-10-08. This is a
SCOPE artifact: acceptance criteria, measured ground truth, the mechanism for each
request, a wave plan with write sets and frozen instruments, collision flags, and a
residual register. It writes NO production code.

Subject: the Presentations > **PIPELINE** sub-view only - `PipelineTab`
(`src/app/components/presentations/pipeline/`), the `presentationsView =
presentations-pipeline` inner nav child (`manual-rail.ts:177`, per
`docs/tools-ia-reorg-scope.md:177`). NOT the `presentations-slide-deck` sub-view
(`index.tsx` / `PresentationsTab`), which is owned by
`docs/presentations-template-dropzone-scope.md`.

How every quantity here was measured: line counts with `wc -l < <file>` (Bash tool),
which equals the mandated `@(Get-Content <file>).Count` on this checkout
(`docs/loop/this-repo.md:184-195`; both give 964 on the file cited there,
`Measure-Object -Line` is the wrong one and is not used). Every `file:line` below was
opened directly while writing this scope.

---

## EXECUTIVE SUMMARY (read this first)

### The two CRITICAL ground-truth answers

**CRITICAL #1 (drives auto-download): a real downloadable `.pptx` artifact ALREADY
EXISTS, and so does a manual download button. There is NO auto-download today.**
`serializeDeckToPptx` (`src/lib/presentations/deck-file.ts:22-28`) wraps the shipped
`buildSlidesPptx` (`@/lib/pptx`) and returns a real `.pptx` `ArrayBuffer`. `PipelineTab`
already serializes it to a Blob and anchor-clicks a download in `handleDownload`
(`PipelineTab.tsx:268-292`), fired ONLY by the manual "Download .pptx" button
(`:503-510`). **Consequence: auto-download needs NO export-building wave.** It is a
small addition: fire the existing download path once when the pipeline reaches
completion, guarded so revisiting/reloading a completed run does not re-download.

**CRITICAL #2 (drives per-slide regen): single-slide regeneration ALREADY EXISTS end
to end - UI, handler, route op, parser - but the MERGE-BACK IS BROKEN: it destroys
every other slide, and a wrong-shape test fixture hides it.** The surface
(`PipelineTab.tsx:516-550`: a slide picker `regenSlideIndex`, a prompt field
`regenInstruction`, a "Regenerate this slide" button), the handler (`handleRegenSlide`,
`:215-237`), the route op (`route.ts:207-223` validate, `:342-346` respond), and the
parser (`parseRegenSlideResponse` returns `[parsed.slides[0]]` - exactly ONE slide,
`pipeline-prompts.ts:354-358`) are all shipped. The defect is in the client merge:
`applyRegenSlideSuccess` (`pipeline/panel-logic.ts:207-211`) sets the deck to
`{ presentationTitle, slides }` where `slides` is the route's **one-element** array -
so regenerating slide N of an M-slide deck **collapses the deck to a single slide.**
The `slideIndex` needed to splice slide N back in place is never threaded into the
reducer. The existing test masks this (`pipeline/panel-logic.test.ts:206-224`) by
feeding a **two-element** `slides` fixture the route never emits (memory:
"fixtures-must-match-emitted-shape"; the route emits `[slides[0]]`, length 1).

### The recommended mechanism for each request

- **Request 1 (auto-download):** on transition into the completed state, fire the
  EXISTING `handleDownload` path once, guarded by a persisted deck fingerprint
  (`ta-pres-pipeline-autodl-fingerprint`) so a reload or revisit of the same completed
  deck does not re-download, while a genuine re-run that changes the deck downloads
  once more. Filename reuses `deckDownloadFilename(deck.presentationTitle)`
  (parent `panel-logic.ts:143-150`), unchanged.
- **Request 2 (per-slide regen):** FIX the merge so slide N is replaced IN PLACE and
  every other slide is preserved by construction (a pure `mergeRegeneratedSlide`
  splice, with `slideIndex` threaded into the reducer), and PROMOTE the existing regen
  controls into a dedicated, always-reachable "Regenerate a slide" card in
  `PipelineTab` instead of leaving them buried in the deck-stage inline block.

### THE ONE FORK the owner must decide (request 2's "dedicated view")

The owner asked for "a dedicated view to allow me to prompt the regeneration of any 1
slide" believing it does not exist. It DOES exist - buried inline in the deck stage and
silently destroying the other slides. This is the same shape as shipped backlog row
**A17** ("Owner asked ... for a regenerate feature ... MEASURED THE SAME DAY: IT
ALREADY EXISTS ... the real work is finding out why it reads as absent",
`docs/BACKLOG.md:35`). So "dedicated view" has a cheap and an expensive reading that
give materially different products:

- **(A) RECOMMENDED - Fix + promote in place.** Fix the merge (the load-bearing
  correctness bug) and surface the existing controls as a dedicated "Regenerate a
  slide" card in `PipelineTab`, reachable whenever a deck exists. Collision-free (stays
  entirely inside `pipeline/`), cheap, and fixes a shipped data-loss bug. The merge fix
  is REQUIRED under either reading.
- **(B) EXPENSIVE - A new richer sub-view.** A separate surface with slide thumbnails,
  click-to-select, and before/after preview. Most of its value is visual and
  unverifiable here (no component renders under vitest, `this-repo.md:134`), and a new
  `presentationsView` nav child would touch `manual-rail.ts` / `url-state.ts` /
  `page.tsx` - colliding with the in-flight TOOLS-IA reorg (section 6).

**Recommendation: (A).** The question for the owner, shaped so every answer terminates
the activity: *"Per-slide regen already exists but silently destroys the other slides
when used; I am fixing that merge and promoting the controls to a dedicated card inside
the pipeline view (reading A). Do you want A, or a separate richer sub-view with slide
thumbnails and before/after (reading B, which also collides with the Tools reorg)?"*
This scope is written for (A) and starts there; (B) is residual **R7**.

A secondary completion-semantics decision (NOT a second owner question - a recommended
default, section 4.1): auto-download fires when the full run-to-end sequence reaches its
terminal frontier (all non-`sources` stages `done`), not merely when the deck stage is
`done`. A deck-only user who never runs the review/polish stages keeps the manual
Download button; auto-download is "at the end," matching the owner's words.

---

## 1. Ground-truth findings (every claim opened and quoted)

### 1.1 Pipeline shape: stages, state, and where "the end" is

`PipelineState` (`src/lib/presentations/pipeline.ts:86-97`) holds ten stages,
`ALL_STAGE_IDS` (`:50-61`) in topological order:
`sources, outline, activities, frame, plan, deck, standard, reviewInfoFlow,
reviewVisual, polish`. Each stage is `StageState<T> = { artifact: T | null; status:
"idle" | "running" | "done" | "stale" | "error" }` (`:64-70`).

The **final OUTPUT the user downloads is the DECK** - `pipelineState.deck.artifact`, a
`DeckContent = { presentationTitle: string; slides: PptxSlide[] }` (`pipeline.ts:92`,
type at `src/lib/presentations/types.ts`). The deck is produced at the `deck` stage
(index 5 of 10). The downstream stages consume it but do NOT replace it:
- `standard` holds a `CheckResult`, `reviewInfoFlow`/`reviewVisual` hold
  `ChecklistResult`, `polish` holds a `PolishResult` (`pipeline.ts:93-96`). `polish`
  is a report of mechanical changes (`PipelineTab.tsx:630-644` renders
  `polish.artifact.changes`), NOT a mutated deck. So the artifact to download is always
  `deck.artifact`.

"The end" in code: `handleRunToEnd` (`PipelineTab.tsx:181-209`) loops calling the pure
planner `runToEnd(state)` (`pipeline/panel-logic.ts:272-280`), running each runnable
frontier stage, until `runnable.length === 0` (`:194-195`). At true completion every
stage is `done`, so `runToEnd` returns `[]`. `runToEnd` excludes `done`-and-fresh
stages and anything with an unmet/`error` dependency, so a non-empty frontier means
"not done yet" (`pipeline/panel-logic.test.ts:280-334` proves these cases).

There is **no completion-detection predicate and no auto-download today** - grep of
`PipelineTab.tsx` shows `handleDownload` is referenced only at its definition (`:268`)
and the button `onClick` (`:505`); no `useEffect` fires it.

### 1.2 CRITICAL #1 - the real `.pptx` export and the manual download

`src/lib/presentations/deck-file.ts:22-28`:
```ts
export function serializeDeckToPptx(deck: GeneratedDeck, author?: string): Promise<ArrayBuffer> {
  return buildSlidesPptx({ presentationTitle: deck.presentationTitle, slides: deck.slides, author });
}
```
`PipelineTab.tsx:268-292` (`handleDownload`) dynamically imports it, builds a Blob with
the OOXML presentation MIME, creates an anchor, sets `anchor.download =
deckDownloadFilename(deck.presentationTitle)`, clicks it, and revokes the object URL -
the standard browser "save a file to the user's machine" dance. It is wired ONLY to the
manual button (`:503-510`), `disabled` until `pipelineState.deck.artifact` exists.

**So a real downloadable artifact exists; auto-download is a trigger + guard, not an
export build.**

### 1.3 CRITICAL #2 - single-slide regen exists, and its merge is broken

Request payload and server contract (all present):
- Wire type `regen-slide` carries `{ context, frame, plan, deck, slideIndex, instruction }`
  (`pipeline.ts:298-305`); success payload is `{ slides: PptxSlide[] }` (`:322`).
- Route validates it (`route.ts:207-223`) and responds `{ op, status: "ok", slides }`
  with `slides = parseRegenSlideResponse(text)` (`route.ts:342-346`).
- `parseRegenSlideResponse` (`pipeline-prompts.ts:354-358`) returns `[parsed.slides[0]]`
  - **exactly one slide**, the regenerated replacement; the prompt itself says 'The
  "slides" array in your reply must contain EXACTLY ONE slide' and "every other slide
  stays unchanged" (`pipeline-prompts.ts:327,339`).

The BROKEN merge (`pipeline/panel-logic.ts:207-211`):
```ts
function applyRegenSlideSuccess(state: PipelineState, slides: PptxSlide[]): PipelineState {
  const presentationTitle = state.deck.artifact?.presentationTitle ?? "";
  const nextDeck: DeckContent = { presentationTitle, slides };   // <- whole array REPLACED
  return applyStageEdit(state, "deck", nextDeck);
}
```
Called from `reducePipelineResponse` (`:222-223`) with `body.slides` (length 1). So a
10-slide deck becomes a 1-slide deck. The `slideIndex` that would let it splice slide N
is in `handleRegenSlide`'s scope (`PipelineTab.tsx:221` `regenSlideIndex`) but is **not
passed to `reducePipelineResponse`** (signature `(op, httpStatus, body, state)`,
`:213-218`) - the "requirement needs an input its own signature cannot receive" failure
class.

The masking test (`pipeline/panel-logic.test.ts:206-224`) feeds
`newSlides = [makeSlide("S0"), { title: "S1 revised", ... }]` (length 2) and asserts
`next.deck.artifact` equals `{ presentationTitle, slides: newSlides }` - green, because
the fixture is a whole revised deck, a shape the route NEVER emits (it emits length 1).
This is precisely "a green suite proves nothing if every fixture uses a value shape the
UI never emits" (memory: fixtures-must-match-emitted-shape).

### 1.4 Where the regen surface lives today (the "dedicated view" gap)

The regen controls are rendered INSIDE the `deck` stage panel, gated twice: only when
`activeStage === "deck"` (`PipelineTab.tsx:497`) AND `pipelineState.deck.status ===
"done"` (`:516`). A user is not told the capability exists unless they are on the deck
stage with a finished deck. That is the discoverability gap the owner's "dedicated
view" names (A17 shape).

### 1.5 Persistence facts

`PipelineTab` persists via `usePersistedJSON` (`pipeline` reuses the parent hook,
`hooks.ts:25-43`; keys `ta-pres-pipeline-state`, `-context-text`, `-sources`,
`PipelineTab.tsx:66-68`). A new persisted key is safe: the directory-wide ta- key
exact-set canary (`componentStorageKeys.structure.test.ts:219-262`) is **non-recursive
over `src/app/components/` top-level only** (`:103-108`), so it does NOT scan
`presentations/pipeline/*` and a new `ta-pres-pipeline-*` key does not trip it.
Confirmed: `grep -rln "ta-pres" src --include=*.structure.test.ts` returns nothing - no
frozen key list enumerates the pipeline's keys (section 6, residual R6).

---

## 2. Acceptance criteria (owner words -> checkable)

Owner, direct chat 2026-10-08: (1) "the slide deck pipeline should auto download the
slides it produces at the end"; (2) "it should have a dedicated view to allow me to
prompt the regeneration of any 1 slide using prompts."

Each pass condition names the OBJECT under comparison, the INSTRUMENT, and the
DIRECTION of failure. "Owner-walk" marks a claim no instrument here can compute because
no component renders (`this-repo.md:134`).

### Request 1 - auto-download at completion

- **AC-1.1 (completion predicate).** A pure predicate decides the pipeline is complete
  iff the deck exists and every non-`sources` stage is `done`. Object: `isPipelineComplete(state)`
  over constructed `PipelineState` fixtures. Instrument: a new unit test on the pure
  function. Direction: RED if it returns `true` for any state whose `deck.status !==
  "done"`, or whose `runToEnd(state)` still contains a non-`sources` stage, or `false`
  for a fully-`done` state. (Reuses the shipped `runToEnd`, `pipeline/panel-logic.ts:272`.)
- **AC-1.2 (fires once per run, not per render/revisit).** The decision to download is a
  pure function of the completed state and the last-downloaded fingerprint. Object:
  `shouldAutoDownloadDeck(state, lastFingerprint)`. Instrument: unit test. Direction:
  RED if it returns `download: true` when `deckFingerprint(deck) === lastFingerprint`
  (same completed deck already downloaded - the reload/revisit case), or `download:
  false` when the deck content differs from the last fingerprint at completion (a
  genuine re-run).
- **AC-1.3 (persisted guard; nothing stranded).** The last-downloaded fingerprint
  persists across reload under `ta-pres-pipeline-autodl-fingerprint`. Object: the
  persisted key. Instrument: wiring pin that the key literal exists and is read/written
  via `usePersistedJSON` (source-text). Direction: RED if the key is absent or not
  round-tripped. (persist-ui-control-state: clearing it costs at most one extra
  download, never a crash - stated, not stranded.)
- **AC-1.4 (filename).** The downloaded file is named
  `deckDownloadFilename(presentationTitle)` (e.g. `My-Lecture.pptx`, fallback
  `presentation.pptx`). Object: the filename string. Instrument: the EXISTING
  `deckDownloadFilename` test coverage in the parent `panel-logic.test.ts` (unchanged).
  Direction: RED if a different name is produced. (No new instrument needed - reused.)
- **AC-1.5 (the download actually fires, and only once).** OWNER-WALK. Running the
  pipeline to the end downloads one `.pptx`; reloading the completed view downloads
  nothing further; re-generating the deck and finishing again downloads once more.
  Instrument: owner walk in the running app (no render/network here). Residual R1.
- **AC-1.6 (manual button preserved).** The existing "Download .pptx" button still
  works and is unchanged. Object: button `onClick` -> `handleDownload`. Instrument:
  source-text wiring pin. Direction: RED if the button no longer calls the shared
  download path.

### Request 2 - per-slide regen, fixed and dedicated

- **AC-2.1 (splice, not replace - THE load-bearing bug fix).** Regenerating slide N
  replaces ONLY slide N; every other slide and the slide count are preserved. Object:
  `mergeRegeneratedSlide(deck, slideIndex, newSlide)`. Instrument: unit test over a
  multi-slide deck. Direction: RED if any slide other than index N changes, if the
  slide count changes, or if the title changes. This is ALSO the leverage removal test
  (section 3).
- **AC-2.2 (slideIndex reaches the merge).** The regen reduction uses the selected slide
  index. Object: the regen branch of `reducePipelineResponse` (threaded `slideIndex`).
  Instrument: unit test feeding a ONE-element `slides` body (the shape the route emits,
  `parseRegenSlideResponse`) plus a `slideIndex`, asserting the returned deck has the
  original length with only index N changed. Direction: RED if the whole array is
  replaced (the current bug) or the wrong index is changed.
- **AC-2.3 (out-of-range is a safe no-op).** A `slideIndex` outside `0..slides.length-1`
  leaves the deck unchanged (never collapses, never appends). Object:
  `mergeRegeneratedSlide` with an out-of-range index. Instrument: unit test. Direction:
  RED if the deck is mutated or truncated.
- **AC-2.4 (downstream invalidation preserved).** A successful regen still marks
  `standard`/`reviewInfoFlow`/`reviewVisual`/`polish` `stale` (they were computed from
  the old deck). Object: the post-regen statuses. Instrument: the EXISTING reducer test
  pattern (`pipeline/panel-logic.test.ts:206-224`, re-pointed at the length-preserving
  behaviour). Direction: RED if a downstream stage is not staled. (Reuses
  `applyStageEdit`'s invalidation graph, `pipeline.ts:225-239`.)
- **AC-2.5 (dedicated, always-reachable surface).** When a deck exists
  (`deck.status === "done"`), a clearly-labeled "Regenerate a slide" surface is
  reachable without being on the deck stage; it offers a slide picker, a prompt field,
  and a regenerate button, and persists its control state (`persist-ui-control-state`).
  Object: the rendered surface and its reachability. Instrument: source-text wiring pin
  that the controls mount outside the `activeStage === "deck"` block; the actual
  rendering/reachability is OWNER-WALK (R2).
- **AC-2.6 (reuses the existing regen call; no new endpoint).** Regen still POSTs the
  `regen-slide` op to `/api/presentations/pipeline` via `buildPipelineRequest`
  (`pipeline/panel-logic.ts:142-155`); no new route or action is added. Object: the
  request body. Instrument: the EXISTING `buildPipelineRequest("regen-slide", ...)` test
  (`pipeline/panel-logic.test.ts:129-150`, unchanged). Direction: RED if the body shape
  drifts.

---

## 3. Leverage claim (one paragraph + one removal-test criterion)

Class: **GUARANTEED** (`docs/loop/leverage.md:44`). Mechanism: the pipeline regenerates
ONE slide and preserves every other slide BY CONSTRUCTION - the merge maps over the
existing deck array and substitutes only index N (`mergeRegeneratedSlide`), so the
untouched slides survive verbatim no matter what the model returns. What the user does
instead today in a chat: pastes the whole deck and a single-slide instruction and gets
back a rewritten deck, with no guarantee the other slides come back unchanged - and in
fact TODAY this app has the same failure (the whole-array replace, section 1.3), which
is exactly what this work removes. This is EARNED, not inherited: the preservation is a
property of this feature's merge code, not of any shared import. It is not a click-cost
dressed up as a mechanism.

Request 1 (auto-download) is, by contrast, **click-cost only** - the honest "Accept the
cost explicitly" disposal (`leverage.md:116-119`): it saves one click on an export that
already exists; it is not a categorical advantage over a chat, and the criteria say so
(AC-1.5 is owner-walk, no removal test is buildable for a click/latency advantage here,
`leverage.md:177-183`). Stated plainly so Verify does not credit it with integration it
does not have.

**Removal test (one criterion, = AC-2.1).** Delete the index-preserving map in
`mergeRegeneratedSlide` and revert it to `{ presentationTitle, slides: [newSlide] }`
(the current bug). The assertion in AC-2.1 - that a multi-slide deck keeps its other
slides and its length after regenerating index N - goes RED. Trace: the deleted line is
the `deck.slides.map((s, i) => i === slideIndex ? newSlide : s)` splice; the assertion
whose observed value changes is `next.deck.artifact.slides.length` (M, not 1) and
`next.deck.artifact.slides[k] === original.slides[k]` for `k !== slideIndex`. Buildable
here (pure function, no render).

---

## 4. Mechanisms (the SHAPE each wave builds against)

All new pure logic lives in **`src/app/components/presentations/pipeline/panel-logic.ts`**
(the pipeline's own pure leaf), NOT in the parent `panel-logic.ts` - see section 6, this
keeps the write set disjoint from TEMPLATE-DROPZONE, which owns the parent file.

### 4.1 Request 1 - auto-download

Four pure additions in `pipeline/panel-logic.ts`, plus an effect in `PipelineTab.tsx`:

1. `isPipelineComplete(state: PipelineState): boolean` =
   `state.deck.status === "done" && runToEnd(state).every((s) => s === "sources")`.
   Reuses the shipped `runToEnd` (`:272`). Recommended completion semantics (NOT an
   owner question): complete = full run-to-end terminal frontier reached, so a
   deck-only user who never runs review/polish does NOT auto-download (manual button
   covers them). Rationale: the owner said "at the end."
2. `deckFingerprint(deck: DeckContent): string` = a stable serialization of
   `{ presentationTitle, slides }` (e.g. `JSON.stringify`). Pure, deterministic; two
   equal decks produce equal fingerprints, a changed deck a different one.
3. `shouldAutoDownloadDeck(state, lastFingerprint): { download: boolean; fingerprint:
   string | null }`. Returns `{ download: true, fingerprint: fp }` iff
   `isPipelineComplete(state)` and `deck.artifact` exists and `deckFingerprint(deck) !==
   lastFingerprint`; otherwise `{ download: false, fingerprint: lastFingerprint }`.
4. Extract the Blob/anchor body of `handleDownload` into one shared function so the
   manual button AND the auto path call the identical code (AC-1.6). The DOM dance stays
   in `.tsx` (owner-walk).

Wiring in `PipelineTab.tsx`: a new `usePersistedJSON<string>("ta-pres-pipeline-autodl-fingerprint", "")`,
and a `useEffect` that, when `shouldAutoDownloadDeck(pipelineState, lastFp).download`,
runs the shared download and sets the persisted fingerprint. The effect compares
fingerprints so it fires once on the transition into completion and never on a plain
re-render or a reload of an already-downloaded deck (AC-1.2). Known one-time behaviour,
recorded as R1: a run completed BEFORE this feature shipped (empty fingerprint) will
auto-download once on its first post-upgrade load - acceptable.

### 4.2 Request 2 - per-slide regen (fix + promote)

Pure merge in `pipeline/panel-logic.ts`:
```
mergeRegeneratedSlide(deck: DeckContent, slideIndex: number, newSlide: PptxSlide): DeckContent
  -> if slideIndex < 0 || slideIndex >= deck.slides.length: return deck unchanged (AC-2.3)
  -> else: { presentationTitle: deck.presentationTitle,
             slides: deck.slides.map((s, i) => i === slideIndex ? newSlide : s) }
```
`applyRegenSlideSuccess` changes signature to `(state, slideIndex, newSlides)`: it takes
`newSlides[0]` (the route emits exactly one; `newSlides.length === 0` is treated as no
success - route already refuses that case), computes
`mergeRegeneratedSlide(state.deck.artifact, slideIndex, newSlides[0])`, then
`applyStageEdit(state, "deck", mergedDeck)` so downstream staling is unchanged (AC-2.4).

`reducePipelineResponse` gains an optional trailing `regenSlideIndex?: number`, used ONLY
on the `regen-slide` branch (`:222-223`); every other op path is untouched.
`handleRegenSlide` (`PipelineTab.tsx:231`) passes `regenSlideIndex` into the reducer.

Dedicated surface (reading A): lift the regen controls (`PipelineTab.tsx:516-550`) out of
the `activeStage === "deck"` conditional into a dedicated "Regenerate a slide" `Card`
rendered whenever `pipelineState.deck.status === "done"`, reusing `handleRegenSlide` and
the existing `regenSlideIndex`/`regenInstruction` state. No new nav param, no new route.
`regenSlideIndex`/`regenInstruction` are component state today (`:163-164`); if the owner
wants the chosen slide to survive reload, persist them under `ta-pres-pipeline-regen-*`
(R5, minor - the instruction is transient by nature, so default is to persist only the
selected index).

---

## 5. Wave plan + write sets + frozen instruments

Two waves. Both stay entirely inside `src/app/components/presentations/pipeline/` (plus
reading the parent `panel-logic.ts` for `deckDownloadFilename`). Ordering: **W1 (merge
fix) before W2 (auto-download)** - W1 is a data-loss bug fix and should ship first; both
edit the same two files so they do NOT run concurrently with each other (serialize
within this item). Each wave is independently pushable.

Every multi-file gate uses `npm run test:paths <p1> <p2> ...` (never a raw multi-path
vitest, which silently drops unmatched args, `this-repo.md:52-66`). The repo-wide
`src/file-size-ceiling.structure.test.ts` runs in every wave gate unconditionally
(`this-repo.md:42-49`); measured sizes (section 7) are far under 1000.

### Wave W1 - per-slide regen merge fix + dedicated card (reading A)

**Write set (edits):**
- `src/app/components/presentations/pipeline/panel-logic.ts` - add
  `mergeRegeneratedSlide`; change `applyRegenSlideSuccess` to take `slideIndex`; thread
  `regenSlideIndex` through `reducePipelineResponse`.
- `src/app/components/presentations/pipeline/panel-logic.test.ts` - RE-POINT the regen
  test (`:206-224`) at a ONE-element `slides` body + `slideIndex` asserting
  length-preserving in-place replace (kills the masking fixture); add `mergeRegeneratedSlide`
  unit tests (in-range, out-of-range, length/other-slides preserved); add the
  slideIndex-threading reducer test.
- `src/app/components/presentations/pipeline/PipelineTab.tsx` - pass `regenSlideIndex`
  into `reducePipelineResponse`; lift the regen controls into a dedicated card.

**Frozen tests that MUST change in the same commit (object / instrument / direction):**
- `pipeline/panel-logic.test.ts:206-224` - Object: the regen reduction result.
  Instrument: `toEqual` on `next.deck.artifact`. Direction: today it asserts a
  wrong-shape (length-2) whole-array replace; re-point it to feed `{ slides: [oneSlide]
  }` + `slideIndex` and assert the deck keeps its original length with only index N
  changed. This fixture-shape correction is the sabotage removal of the mask.

**Gate:** `npm run test:paths src/app/components/presentations/pipeline/panel-logic.test.ts
src/app/components/presentations/pipeline/merged-review.test.ts`, plus
`src/file-size-ceiling.structure.test.ts`, plus `npx tsc --noEmit`, `npm run lint`.
(`merged-review.test.ts` is included because `PipelineTab.tsx` imports
`buildMergedReview`; a stray edit there must stay green. The route test
`src/app/api/presentations/pipeline/route.test.ts` is unchanged by W1 - the route and
parser are correct; run it to confirm no drift.)

### Wave W2 - auto-download at completion

**Write set (edits):**
- `src/app/components/presentations/pipeline/panel-logic.ts` - add `isPipelineComplete`,
  `deckFingerprint`, `shouldAutoDownloadDeck`.
- `src/app/components/presentations/pipeline/panel-logic.test.ts` - unit tests for all
  three (AC-1.1, AC-1.2): complete vs incomplete states; download true only when
  fingerprint differs.
- `src/app/components/presentations/pipeline/PipelineTab.tsx` - extract the shared
  download body; add the persisted fingerprint + the completion `useEffect`.

**Frozen tests:** none pre-exist for these new functions; the directory ta- key canary
does NOT reach this subdirectory (section 1.5), so the new key needs no list bump. The
pure functions reference `runToEnd` and `DeckContent` - no structure test pins them.

**Gate:** `npx vitest run src/app/components/presentations/pipeline/panel-logic.test.ts`
(single path - safe to use `vitest run` directly), plus
`src/file-size-ceiling.structure.test.ts`, `npx tsc --noEmit`, `npm run lint`.

### What is machine-checkable vs owner-walk

- **Machine-checkable (the instruments that exist):** `isPipelineComplete`,
  `deckFingerprint`, `shouldAutoDownloadDeck`, `mergeRegeneratedSlide` (in-place splice,
  length preservation, out-of-range no-op), the slideIndex-threaded reducer, the
  request-body shape, and source-text wiring pins (persisted key present, manual button
  still wired, regen controls mounted outside the deck-stage block). Mock nothing -
  these are pure; do NOT mock `fetch` (the merge/guard logic never touches it).
- **Owner-walk (no render, no network here):** the download actually firing once
  (AC-1.5 / R1), the dedicated card rendering and being reachable (AC-2.5 / R2), and the
  regenerated slide looking right (R3).

---

## 6. Serialization and collision flags

Two scopes are in flight over Presentations.

**TOOLS-IA reorg (`docs/tools-ia-reorg-scope.md`).** Its write set is
`manual-rail.ts(+test)`, `tab-rails.test.ts`, `RecordingTab.tsx`,
`recording-split.structure.test.ts`, `url-state.ts`, `page.tsx`,
`useAppNavigation.ts`, `topLevelTabs.wiring.test.ts` (that scope's section 5). **None is
under `src/app/components/presentations/`.** It keeps the `presentations` chip and the
`presentations-pipeline` inner child (`:177`); it does not touch `PipelineTab` internals.
**Verdict: DISJOINT from this item under reading A** (which adds no nav param). Reading B
WOULD collide (a new `presentationsView` child touches `manual-rail.ts` / `url-state.ts`
/ `page.tsx`) - another reason to prefer A.

**TEMPLATE-DROPZONE (`docs/presentations-template-dropzone-scope.md`).** It EDITS the
PARENT `src/app/components/presentations/panel-logic.ts` (`:422`) and `index.tsx`
(`:418`), plus the parent `panel-logic.test.ts` (`:486`). **This item does NOT edit the
parent `panel-logic.ts`** - it only IMPORTS `deckDownloadFilename` from it
(`PipelineTab.tsx:45`), a read dependency on a stable export the dropzone scope does not
touch (that scope adds template helpers, `:422`). All of this item's NEW pure logic
lives in `pipeline/panel-logic.ts`. **Verdict: DISJOINT by write set** (parent
`panel-logic.ts` is read-only here). Shared-file note for the orchestrator: if the
dropzone work ever changes or removes `deckDownloadFilename`, this item's import breaks -
unlikely, but worth a tsc run after both land.

**Shared singletons.** `npx tsc --noEmit` has one caller - W1 and W2 must not run it
concurrently with each other or with either sibling scope's wave gate
(`this-repo.md:156-162`). `docs/BACKLOG.md` is a file like any other under concurrency.

**Within this item:** W1 and W2 both edit `pipeline/panel-logic.ts`,
`pipeline/panel-logic.test.ts`, and `PipelineTab.tsx` - they SERIALIZE (W1 then W2), not
concurrent.

### `owns` file list (derived; this enumeration is a FLOOR, `traps-spec.md:30-34`)

Files this item EDITS:
```
src/app/components/presentations/pipeline/panel-logic.ts
src/app/components/presentations/pipeline/panel-logic.test.ts
src/app/components/presentations/pipeline/PipelineTab.tsx
```
Files that READ the edited files AS SOURCE TEXT or import them (must be in the wave gate
so a correct change does not ship red). Derived with
`grep -rln "presentations/pipeline/panel-logic\|from \"./panel-logic\"\|PipelineTab" src --include=*.ts --include=*.tsx`
and by reading imports:
```
src/app/components/presentations/pipeline/panel-logic.test.ts   (imports ./panel-logic)
src/app/components/presentations/pipeline/merged-review.test.ts (sibling; PipelineTab imports buildMergedReview)
src/app/components/presentations/pipeline/PipelineTab.tsx        (imports ./panel-logic, ./merged-review, parent ../panel-logic)
src/app/api/presentations/pipeline/route.test.ts                (regen-slide contract - unchanged, run to confirm no drift)
```
No `*.structure.test.ts` or `*.wiring.test.ts` reads these files (grep:
`grep -rln "pipeline/panel-logic\|PipelineTab" src --include=*.structure.test.ts
--include=*.wiring.test.ts` returns nothing). The implementer MUST re-derive this set
with its own grep and report what this list missed.

---

## 7. Measured sizes (command + output)

`wc -l < <file>` (Bash), equal to `@(Get-Content).Count` here (`this-repo.md:184-195`):
```
651  src/app/components/presentations/pipeline/PipelineTab.tsx
280  src/app/components/presentations/pipeline/panel-logic.ts
335  src/app/components/presentations/pipeline/panel-logic.test.ts
283  src/app/components/presentations/panel-logic.ts   (parent; read-only here)
```
All far below the 1000-line ceiling. W1 adds a merge helper + tests and a card
(~+60-120 lines across the three files); W2 adds three pure functions + an effect
(~+60-100). `PipelineTab.tsx` at 651 has headroom; re-measure at each wave gate with
`@(Get-Content src/app/components/presentations/pipeline/PipelineTab.tsx).Count`.

---

## 8. Residual register

Each: residual / owner / instrument / measuring step. Missing any of the three is a
deletion. A residual not in `docs/BACKLOG.md` does not exist - the orchestrator files
these at disposal.

- **R1 - auto-download actually fires once per completion (not per render/revisit).**
  Owner: repo owner (owner-walk; no render/network here). Instrument: manual walk of the
  running app - run to end (one download), reload (no download), re-generate + finish
  (one more). Step: owner review of the W2 diff in the app. Also covers the one-time
  first-post-upgrade download of a pre-existing completed run.
- **R2 - the dedicated "Regenerate a slide" card renders and is reachable whenever a
  deck exists.** Owner: repo owner (owner-walk). Instrument: visual walk of PipelineTab.
  Step: owner review of the W1 diff in the app. (The machine side proves only that the
  controls mount outside the deck-stage block, not that they read well.)
- **R3 - the regenerated slide is good and on-Frame.** Owner: repo owner (owner-walk;
  model output, no API key here). Instrument: read the regenerated slide in the app.
  Step: owner walk. (Mirrors the pipeline's own standing owner-verification note,
  `PipelineTab.tsx:31-37`.)
- **R4 - completion semantics (recommended default applied, not an owner question).**
  Owner: repo owner may override. Instrument: `isPipelineComplete` unit test pins the
  chosen semantics (full run-to-end, not deck-only). Step: if the owner wants
  auto-download the moment the DECK is done (ignoring review/polish), change the
  predicate to `deck.status === "done"` alone and re-run the W2 gate.
- **R5 - persist the selected regen slide index across reload.** Owner: W1 implementer
  (optional). Instrument: a `ta-pres-pipeline-regen-index` round-trip wiring pin. Step:
  W1 wave gate. Default: persist only the index (the instruction is transient); skip if
  the owner does not want it.
- **R6 - no directory ta- key canary over `presentations/pipeline/`.** Owner: test
  seat / owner decision. Instrument: none exists today (`componentStorageKeys.structure.test.ts`
  is non-recursive, section 1.5). Step: if the owner wants a frozen key set for this
  subdirectory, author one in the snapshot-grading precedent's shape
  (`componentStorageKeys.structure.test.ts:16-20`). Not built by default - this item
  adds at most two keys and no canary is required to keep main green.
- **R7 - the EXPENSIVE "dedicated view" reading (B): a new sub-view with slide
  thumbnails / click-to-select / before-after.** Owner: repo owner (the section-0 fork).
  Instrument: mostly owner-walk (no render here); only the request-body + merge stay
  machine-checkable. Step: owner answers the fork question; if B, a separate scope that
  includes the TOOLS-IA collision (a new `presentationsView` child) and serializes
  against that reorg.
- **R8 - auto-download is CLICK-COST only, not a categorical advantage.** Owner: repo
  owner (leverage disposal already taken: "accept the cost explicitly", section 3).
  Instrument: none buildable (click/latency, no render, `leverage.md:177-183`). Step:
  Verify re-reads the claim against the built diff and does not credit integration.
