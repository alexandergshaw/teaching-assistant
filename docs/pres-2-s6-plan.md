# PRES-2 S6 wave plan: assembling the 13-stage pipeline onto the presentations surface

- Item: PRES-2, wave S6 (the pipeline + surface wave), area `presentations-authoring`.
- Seat: `loop-plan` (Opus). A fresh `loop-checker` gates this document before any
  implementer builds from it. This seat does not check its own artifact.
- Consumes: `docs/pres-2-scope.md` (the checked S1-S6 design, the 13-stage map,
  section 3 reachability, section 8 forks); the five BUILT/VERIFIED leaves under
  `src/lib/deck-standard/*` (S1-S5, opened for this pass); the shipped
  presentations surface (`src/app/components/presentations/*`,
  `src/lib/presentations/*`, `src/app/api/presentations/generate/route.ts`); the
  shipped A43-C ops layer (`src/lib/decks/deck-operations.ts`,
  `src/app/api/decks/ask/route.ts`); the nav ladder
  (`src/app/components/manual/manual-rail.ts`, `src/app/url-state.ts`,
  `src/app/components/home/useAppNavigation.ts`, `src/app/page.tsx`); and
  `docs/pres-1-architecture.md` (the house format and the reachability-ladder
  precedent).
- Produces: (1) the stage -> artifact -> UI map for all 13 stages, SHIPPED/PARTIAL/NEW
  updated for what S1-S5 now provide, with the route each callLlm stage uses;
  (2) the PORT / REUSE-IN-PLACE-VIA-IMPORT / REBUILD decision per rich capability;
  (3) the stage-gated + run-to-end execution model; (4) the sub-wave cut with
  disjoint write sets, dependency order, and pure-vs-surface classification;
  (5) the disjointness computation, both senses, pasted; (6) per-wave gates;
  (7) line-shift obligations; (8) the residual register.
- OWNER DECISIONS this plan builds to and does NOT reopen: **F1** = the pipeline
  lives on the presentations surface (`src/app/components/presentations/*`), NOT
  the ppt-design tab; **F3** = stage-gated by default WITH a run-to-end option,
  every stage emitting an editable intermediate honored downstream.

All quantities name the command that produced them. Line counts use
`@(Get-Content <file>).Count` (PowerShell), the mandated instrument
(`docs/loop/this-repo.md` section 3); `Measure-Object -Line` is never used.
Absence claims run WITHOUT a pipe (so `$?` is grep's), each with a canary.
Measured at HEAD `6c585a24`, 2026-09-29.

---

## 0. Three things this plan settles before the cut, because they change the write sets

1. **F1 leaves ONE small naming sub-fork the plan cannot settle: new child vs
   rename.** The `presentations` Manual view ALREADY EXISTS in the nav with one
   inner child `presentations-slide-deck`, label "Slide Deck Creation"
   (`manual-rail.ts:120-125`, measured). The owner's "NEW Slide Deck Creation
   tab" therefore lands as a SECOND inner-nav child under the existing
   `presentations` view - the child-#2 plumbing `docs/pres-1-architecture.md:210-225`
   already specifies. This plan is designed to that reading (recommended label
   "Slide Deck Pipeline", id `presentations-pipeline`; the shipped thin one-shot
   child stays as the fast path). Whether the owner would rather RENAME/replace
   the thin child is a product/naming call (RES-S6-A); it changes only S6.7's
   nav edits, not any other wave, and terminates.

2. **Adding a CHILD does not touch the rail-chip arrays.** Because
   `presentations` is already a `MANUAL_VIEW_ORDER` member, adding a child adds NO
   rail chip and changes NO `TOOLS_RAIL_ITEMS` count. The frozen count/array
   assertions in `tab-rails.test.ts` and `topLevelTabs.wiring.test.ts`
   (`toHaveLength(11)` at `topLevelTabs.wiring.test.ts:376`, measured) are
   CHECKED-SAFE and out of S6.7's write set. What S6.7 DOES break is the frozen
   `getInnerDestinations("presentations")` assertion
   (`manual-rail.test.ts:391-394`, `toEqual(["presentations-slide-deck"])` /
   `["Slide Deck Creation"]`, measured) - that test is OWNED and updated.

3. **Two BUILT leaves need a correction before the surface trusts them, and
   these are their own early sub-waves** (the task's carried corrections 2 and 3):
   - **Title Case** false-flags legitimate colon-subtitle dividers.
     `isTitleCase("Section 2: The Request Lifecycle")` returns `false` today,
     because "The" is a mid-title small word required lowercase
     (`standard.ts:61-79`, traced: words `["Section","2:","The","Request","Lifecycle"]`,
     "The" fails the small-word branch). It also checks only the first letter of a
     hyphenated word (`word.match(/[A-Za-z]/)[0]`, `standard.ts:69`), so
     "Post-lecture" passes on "P" alone. Fix = S6.1.
   - **`polishDeck` is LOSSY over a real slide.** `PolishSlideInput` is
     `{title, bullets, notes?}` only (`polish.ts:27-31`), and `polishDeck`
     rebuilds each returned slide as `{title, bullets, notes?}`
     (`polish.ts:166-168`), DROPPING `code`, `codeLanguage`, `graphic` that a real
     `PptxSlide` carries (`grep -nE "code|graphic" src/lib/deck-standard/polish.ts`
     -> only a comment at `:53`, measured). Because dedupe removes slides
     (`polish.ts:172-184`, index shift) re-attaching fields by index at the
     wiring boundary is unsafe, so the fix belongs IN `polish.ts`
     (spread the original slide). Fix = S6.2.

---

## 1. The 13-stage map on the new tab (SHIPPED / PARTIAL / NEW, updated for S1-S5)

Status is re-graded from `docs/pres-2-scope.md` section 1 for what the five leaves
now provide. "Route" names the server entry a callLlm stage goes through; PURE
stages run client-side by importing the shipped leaf (no route, no secret, no
network). Every new route mirrors `api/presentations/generate/route.ts`:
`requireUser` (R2, `src/lib/supabase/auth.ts:328`), `maxDuration = 60`,
`withDeadline` 50s soft budget, ONE stage per invocation.

| # | Stage | Status | Intermediate (editable) | UI on the new tab | callLlm? / route |
|---|---|---|---|---|---|
| 1 | Teaching materials, not a blank deck | **SHIPPED** | `PresentationContext` (`sources[] + text`) | Reuse `SourcesEditor` (drag-drop) | No; `extractDeckSourceFileAction` (shipped, `requireUser`) |
| 2 | intuition->analogy->term->mechanism->example->application | **PARTIAL->wired** | `OutlineContent` folding `slideStructureRequirements` | Outline stage card (reuse `ArtifactCard` idiom) | Yes; **S6.5** op `outline` |
| 3 | ONE mental model reused | **SHIPPED (leaf) / NEW (wiring)** | `PinnedFrame.mentalModel` (S2 `frame.ts`) | Frame editor (name + steps) | Optional "suggest"; **S6.5** op `frame-suggest` |
| 4 | ONE running example threaded | **SHIPPED (leaf) / NEW (wiring)** | `PinnedFrame.runningExample` | Frame editor (name + description) | shares op `frame-suggest` |
| 5 | 5-second comprehension: one dominant claim/slide | **SHIPPED (leaf) / NEW (wiring)** | `SlidePlan.entries[].dominantClaim` (S3) | Slide-plan editor; `validateSlidePlan` inline | plan-gen Yes (**S6.5** op `plan`); validate PURE (`slide-plan.ts`) |
| 6 | Visuals that EXPLAIN | **PARTIAL (reused unchanged)** | `PptxSlide.graphic` (shipped `SlideGraphic`) | Rendered in preview | via deck-gen; F4 = no new diagram types |
| 7 | Professional visual standards (Title Case, title-slide-only, cap) | **SHIPPED (leaf, after S6.1) / NEW (wiring)** | `CheckResult{standardVersion, violations}` (S1) | Standard-check findings list | PURE (`checkDeckStandard`); + `ta-deck-standard-override` |
| 8 | Three activity candidates, pick one | **PARTIAL->wired** | `ActivitiesContent.ideas` | Activities stage card | Yes; **S6.5** op `activities` |
| 9 | Prediction before explanation, on separate slides | **SHIPPED (leaf) / NEW (wiring)** | `SlidePlan` type (prediction/answer = 2 entries) | Enforced in plan editor (type-level) | PURE (`validateSlidePlan`) |
| 10 | Tie hands-on back to theory | **PARTIAL (prompt-level)** | folded into deck-gen prompt | (implicit, in deck) | via deck-gen (**S6.5** op `deck`) |
| 11 | Adversarial review of information flow | **SHIPPED (leaf FIND) / NEW (wiring)** | `ChecklistResult` (S4 `INFO_FLOW_CHECKLIST`) | Findings list, opt-in | deterministic PURE (`runDeterministicChecklist`); llm items **S6.5** op `review-infoflow` |
| 12 | Adversarial review of visuals | **SHIPPED (leaf FIND) / NEW (wiring)** | `ChecklistResult` (S4 `VISUAL_CHECKLIST`) | Findings list, opt-in | all llm; **S6.5** op `review-visual` |
| 13 | Production polish pass | **SHIPPED (leaf, after S6.2) / NEW (wiring)** | `PolishResult{deck, changes}` (S5) | Change-log list | PURE (`polishDeck`) |
| - | The pipeline: resumable, editable intermediates, re-run at stage N | **NEW** | the stage-state container + invalidation graph (S6.3) | the stepper; run-to-end button | orchestration is S6.3/S6.6/S6.7 |
| - | Deck assembly (plan+frame -> slides) | **NEW** | `DeckContent` (= `GeneratedDeck`) | preview (reuse `SlideDeckPreview`) | Yes; **S6.5** op `deck` |
| - | Per-slide regeneration (edit Frame/plan -> re-gen affected slides) | **NEW** (carried correction 1) | one regenerated `PptxSlide` | per-slide "regenerate" control | Yes; **S6.5** op `regen-slide` |
| - | Apply a finding / per-slide content op | **SHIPPED (reused)** | mutated `PptxSlide[]` | "apply" button on a finding | Yes; **reuse shipped** `/api/decks/ask` |

**Two reachability facts this map fixes** (the scope flagged both):
- **Per-slide regeneration is NEW code, not `regenerateArtifact`.**
  `regenerateArtifact` re-runs a WHOLE artifact via `parseDeckSlides`
  (`src/lib/presentations/generate.ts:121-147`, measured). S6.5's `regen-slide`
  op regenerates ONE slide given `{context, frame, planEntry, priorSlide}`,
  folding `buildFrameFoldLines(frame)` (S2) + the entry's `dominantClaim` by code.
- **APPLY does not hard-depend on A43-C C2.** The scope routed "apply a finding"
  through C2's in-app control. On the presentations surface (F1) PRES-2 builds
  its OWN apply button that POSTs to the **shipped** `/api/decks/ask` route
  (`src/app/api/decks/ask/route.ts:98-155`, measured: `requireUser`, takes
  `{instruction, slides}`, returns `{status, slides|reason}`). So C2 is no longer
  a blocker for PRES-2's apply step; RES-PRES2-6 is reconciled below.

---

## 2. PORT vs REUSE-IN-PLACE-VIA-IMPORT vs REBUILD (per rich capability, one line each)

Preferring reuse-by-import wherever the lib is surface-independent; porting only
ppt-design-coupled code; rebuilding only where the tree has nothing.

| Capability | Decision | Justification (file:line) |
|---|---|---|
| Rich prompt contract (`SLIDE_STRUCTURE_REQUIREMENTS`, `slideStructureRequirements(kind)`, `SLIDE_DECK_JSON_SHAPE`) | **REUSE-IN-PLACE-VIA-IMPORT** | Surface-independent exports in `src/lib/slide-prompt.ts:65,293,40` (measured); S6.4 composes them into the pipeline deck prompt. No port, no edit to `slide-prompt.ts`. |
| Conversational ops (`applyDeckOperation`) + ask route | **REUSE-IN-PLACE-VIA-IMPORT (call the shipped route)** | `deck-operations.ts:168` + `api/decks/ask/route.ts` are surface-independent and template-blind; PRES-2's apply button fetches the shipped route. No port. |
| Diagram model (`SlideGraphic`, `coerceSlideGraphic`, `enforceGraphicsForApplied`) | **REUSE-IN-PLACE-VIA-IMPORT, unchanged** | F4 = defer new diagram types; deck-gen already emits graphics via the shipped path. No edit to `slide-graphics.ts` (it stays CHECKED-SAFE). |
| Template conformance (A43 `fillOfficeTemplate` / `fillDeckTemplateFileAction`) | **REUSE-IN-PLACE-VIA-IMPORT, but DEFERRED to a follow-up** | `fillDeckTemplateFileAction` exists (`src/app/actions/deck-template-files.ts:145`, measured) and is reachable as an optional export (F1 rec a). PRES-2 ships built-from-scratch decks via the shipped `serializeDeckToPptx`; template export is RES-S6-E. |
| The five deck-standard leaves (S1-S5) | **REUSE-IN-PLACE-VIA-IMPORT (2 need a fix first)** | All under `src/lib/deck-standard/*`, surface-independent, structural inputs. S6.1 fixes `isTitleCase`; S6.2 fixes `polishDeck` loss. Everything else imported unchanged. |
| PRES-1 thin generate path (`buildOutlinePrompt/buildActivitiesPrompt`, `generateOneArtifact`, `serializeDeckToPptx`) | **REUSE-IN-PLACE-VIA-IMPORT** | Outline/activities stages reuse the shipped executors; download reuses `serializeDeckToPptx` (`deck-file.ts`). No edit to the shipped files -> the thin flow and its tests stay green. |
| PRES-1 surface pieces (`SourcesEditor`, `SlideDeckPreview`, `usePersistedJSON`, `ArtifactCard`) | **REUSE-IN-PLACE-VIA-IMPORT** | Imported by the new pipeline `.tsx` components; the existing thin `PresentationsTab` (`index.tsx`) is untouched. |
| **REBUILD (nothing in the tree provides it):** the pipeline stage-state model + invalidation graph; the pipeline deck/plan/frame prompts; the pipeline route ops; per-slide regeneration; the stepper surface | **REBUILD (new files)** | `grep -rniE "pipeline-?stage\|invalidat" --include=*.ts src/lib/presentations` -> exit 1 (canary `grep -rc "PresentationContext" src/lib/presentations/types.ts` -> non-zero). Greenfield. |

**No wave writes** `slide-prompt.ts`, `slide-graphics.ts`, `deck-operations.ts`,
`fit-report.ts`, `office-template-fill.ts`, or the shipped
`src/lib/presentations/{prompts,generate,parse,deck-file}.ts` and their tests -
all are reused unchanged, keeping the shipped flow's tests
(`prompts.test.ts`, `generate.test.ts`, `parse.test.ts`, `deck-file.test.ts`,
`generate/route.test.ts`, measured present) out of every S6 write set.

---

## 3. The execution model: stage-gated with run-to-end (F3)

**Stage state + editable intermediates.** One `PipelineState` container
(defined in S6.3, `pipeline.ts`), persisted client-only under `ta-pres-pipeline-*`
keys via the shipped `usePersistedJSON` idiom (`hooks.ts:25`). Its fields are the
leaf types verbatim (carried correction 3 - S6 adapts the real
`GeneratedDeck`/`PptxSlide` to the leaves' structural inputs at the boundary; a
`GeneratedDeck` is assignable to `DeckStandardInput`/`FrameDeckInput`/
`ChecklistDeckInput`/`PolishDeckInput` structurally, and after S6.2 `polishDeck`
round-trips it without dropping fields):

```
sources: PresentationSource[]        // stage 1
frame:   PinnedFrame | null          // stages 3/4
outline: OutlineContent | null       // stage 2
plan:    SlidePlan | null            // stage 5/9
deck:    DeckContent | null          // deck assembly
standard:CheckResult | null          // stage 7 (pure, recomputed on demand)
reviews: { infoFlow?: ChecklistResult; visual?: ChecklistResult }  // 11/12
polish:  PolishResult | null         // stage 13
stale:   Set<StageId>                // which stages an edit invalidated
```

- **Server persistence + RLS are DEFERRED** (no live DB here,
  `docs/loop/this-repo.md` section 6). Client `ta-` keys only, matching the PRES-1
  recommendation (`docs/pres-1-architecture.md:554-572`). RES-PRES2-2 / RES-S6-B.
- **The invalidation graph is the "honored downstream" mechanism** and it is PURE,
  so its LOGIC is machine-checkable (only the re-render is owner-verification).
  `computeStale(state, editedStage): StageId[]` (S6.3): editing `frame` marks
  `deck, reviews, polish` stale (deck folds the frame; plan does not); editing
  `outline` marks `plan, deck, reviews, polish`; editing `plan` marks
  `deck, reviews, polish`; editing `deck` (per-slide regen/apply) marks
  `reviews, polish` and recomputes the pure `standard`/frame-drift receipts;
  editing the standard config re-runs `checkDeckStandard` only. This is
  PIPE-REACH's testable half.

**Run-to-end** is a CLIENT-DRIVEN sequential fan-out, never one server call doing
all stages (the never-loop contract, `command-interface.ts:26-32`, cited by
PRES-1). The client (S6.6 `runToEnd` sequencer) awaits each callLlm stage's route
call in dependency order, feeding each output to the next; pure stages
(`checkDeckStandard`, `validateSlidePlan`, `runDeterministicChecklist`,
`polishDeck`, `frameConsistencyReceipt`) run inline in the browser between route
calls. Each route call does <=1-2 callLlm under the 50s soft budget (mirrors
`generate/route.ts:36`), so the 60s Hobby cap binds per stage, never across the
pipeline. Stage-gated (default) simply stops the sequencer after each stage for
edit; run-to-end passes a "continue" flag through the same sequencer.

**Click budget (PIPE-BUDGET).** The pipeline adds no REQUIRED input beyond source
intake: stage-gated is the default but each stage's output is pre-filled from the
model, so a user who wants the thin behaviour clicks "run to end" once. No course
must be selected first. Owner-verified (nothing renders), RES-S6-C.

---

## 4. The sub-wave cut (write sets derived, dependency order, pure vs surface)

Seven sub-waves. Write set = the files the wave EDITS plus the tests that read
those files AS SOURCE TEXT. New-leaf waves are owned only by the repo-wide
scanners (`file-size-ceiling.structure.test.ts`, `no-emojis.test.ts`,
`source-bytes.structure.test.ts`); no existing test reads a new file (verified:
the shipped presentations/deck-standard tests all import by relative or `@/`
paths that resolve to the SHIPPED files, not the new ones).

Derivation command for each edited SHIPPED file (run per wave, output pasted in
section 5's owns note):
`grep -rlnE "from \"(\./|\.\./|@/...)<module>\"" --include=*.ts --include=*.tsx src/`
plus, for nav files, the nav-symbol reader grep in section 5.

| Wave | Files (write set) | Exports | Caller of each export | Pure/surface | Independently gateable? |
|---|---|---|---|---|---|
| **S6.1** title-case fix | `deck-standard/standard.ts`, `standard.test.ts` | edits `isTitleCase` (already exported) | `checkDeckStandard` (same file) + `standard.test.ts` (in wave) | PURE | YES (vitest) |
| **S6.2** polish carry-through | `deck-standard/polish.ts`, `polish.test.ts` | edits `polishDeck` (already exported) | `polish.test.ts` (in wave); production caller S6.6/S6.7 | PURE | YES (vitest) |
| **S6.3** pipeline core + wire contract | `presentations/pipeline.ts`, `pipeline.test.ts` | `StageId`, `PipelineState`, `computeStale`, the route request/response contract types | `pipeline.test.ts` (in wave); S6.5 + S6.6 (later, named) | PURE | YES (vitest) |
| **S6.4** pipeline prompts+parsers | `presentations/pipeline-prompts.ts`, `pipeline-prompts.test.ts` | `buildPipelineDeckPrompt`, `buildPlanPrompt`, `buildFrameSuggestPrompt`, `parsePlan`, `parseFrame` | `pipeline-prompts.test.ts` (in wave); S6.5 (later, named) | PURE | YES (vitest) |
| **S6.5** pipeline route | `app/api/presentations/pipeline/route.ts`, `route.test.ts` | `POST` (one stage per op) | `route.test.ts` drives POST (in wave); S6.7 fetches it (later, named) | route (mocked-llm) | YES (vitest, mocked callLlm) |
| **S6.6** client pipeline logic | `components/presentations/pipeline/panel-logic.ts`, `panel-logic.test.ts` | request builders, response reducers, `runToEnd` sequencer, `applyStageEdit` | `panel-logic.test.ts` (in wave); `PipelineTab.tsx` (S6.7) | PURE | YES (vitest) |
| **S6.7** surface + nav + mount | pipeline `.tsx` (`PipelineTab`, `PipelineStepper`, `FrameEditor`, `ReviewFindings`); `manual-rail.ts`, `manual-rail.test.ts`, `url-state.ts`, `url-state.test.ts`, `useAppNavigation.ts`, `useAppNavigation.test.ts`, `page.tsx` | `PipelineTab` component; `PresentationsView`, `isPresentationsView`, threaded nav | the `page.tsx` mount is the CALLER of `PipelineTab` (IN THIS WAVE) | surface (owner-verify) + reading/nav (vitest) | machine part YES; render/drag/download OWNER |

**Dependency order and concurrency:**

- **S6.1, S6.2, S6.3, S6.4 depend only on shipped leaves/contract** -> all four are
  disjoint and informationally independent (S6.3 puts the wire contract in
  `pipeline.ts`; S6.4 depends only on the shipped leaf types + `slide-prompt`, NOT
  on `pipeline.ts` - "extract the shared contract into an earlier step", so no
  S6.3<->S6.4 coupling). Run CONCURRENTLY in batches of <=3
  (`parallel-disjointness.md` cap): e.g. {S6.1, S6.2, S6.3} then {S6.4}.
- **S6.5 depends on S6.3 (StageId + wire contract) + S6.4 (prompts) + shipped
  `generate.ts`.** Runs after S6.3+S6.4.
- **S6.6 depends on S6.3 (contract + `computeStale`) + the leaves.** S6.5 and S6.6
  are disjoint files AND informationally independent, BECAUSE both code against
  the S6.3 wire contract rather than against each other - so once S6.3+S6.4 land,
  **S6.5 and S6.6 may run concurrently**.
- **S6.7 depends on S6.6 (imports `panel-logic`), S6.5 (fetch target), and S6.1+S6.2
  (trusts the fixed leaves).** Runs last. Its mount is the caller of `PipelineTab`,
  so the caller rule is satisfied WITHIN the wave (PRES-1 wave-3 precedent,
  `docs/pres-1-architecture.md:628-638`).

**Caller-rule note for the pure waves (S6.3, S6.4, S6.6).** Each ships a pure
library whose IN-WAVE caller is its own test and whose PRODUCTION caller lands in
a NAMED later wave (S6.5/S6.7). This is exactly the S1-S5 pattern the scope
already sanctioned (`docs/pres-2-scope.md:386-390`): the pieces are consumed by
their tests and by a later wave that names each caller. It is NOT the type-only
exception - these emit runtime code - so this plan names the downstream caller
explicitly per wave above, and the S6 chunk lands as one push so no export ships
without its production caller by the end of the chunk.

**File-size ceiling (`@(Get-Content).Count`, measured 2026-09-29, LIMIT=1000):**
- New files: all comfortably small (leaf tests today run 133-232 lines).
- Edited shipped files after S6.7: `page.tsx` 832 (+~10), `useAppNavigation.ts`
  762 (+~15), `url-state.ts` 475 (+~15), `manual-rail.ts` 381 (+~20) - all clear.
- **`url-state.test.ts` is 970** - within 30 lines of the wall. S6.7 adds a
  `normalizePresentationsView` round-trip; the implementer MUST re-measure with
  `@(Get-Content src/app/url-state.test.ts).Count` and split the file if the
  addition breaches 1000. RES-S6-D.

---

## 5. Disjointness computation (BOTH senses), pasted

**Half one - exact-path (`sort | uniq -d`, empty is the only pass).** Command and
output, from the Bash tool at HEAD `6c585a24`:

```
$ cat s1 s2 s3 s4 s5 s6 s7 | sort | uniq -d
                       <-- (empty)
$ cat s1 s1 | sort | uniq -d          # canary: duplicating a set must print its paths
src/lib/deck-standard/standard.test.ts
src/lib/deck-standard/standard.ts
```
(`s1..s7` are the seven write sets in section 4; `s7` enumerated all four `.tsx`
plus the six nav files.) Empty intersection = pass; the canary confirms the
instrument prints overlaps when they exist.

**Half two - informational independence.** Facts each wave assumes, and who
establishes them:

| Wave | Facts it assumes to start | Established by | Coupled? |
|---|---|---|---|
| S6.1 | the four deck-decidable rules + `SMALL_WORDS` (in `standard.ts`) | S1 (shipped) | No |
| S6.2 | `PolishDeckInput`, `BADGE_RULES` (in `polish.ts`) | S5 (shipped) | No |
| S6.3 | the five leaf types (Frame/SlidePlan/CheckResult/ChecklistResult/PolishResult), `GeneratedDeck` | S1-S5 + PRES-1 (all shipped) | No |
| S6.4 | `slideStructureRequirements`, `SLIDE_DECK_JSON_SHAPE`, `buildFrameFoldLines`, `SlidePlanEntry` | slide-prompt + S2/S3 (shipped) | No - does NOT read `pipeline.ts` |
| S6.5 | the S6.3 wire contract + S6.4 prompts + shipped `generate.ts` executors | S6.3, S6.4 | Directional: after S6.3+S6.4 |
| S6.6 | the S6.3 wire contract + `computeStale` + the pure leaves | S6.3 | Directional: after S6.3 |
| S6.7 | S6.6 `panel-logic`, S6.5 route, S6.1/S6.2 fixed leaves, nav symbols | S6.5, S6.6, S6.1, S6.2, nav (shipped) | Directional: last |

The one coupling that WOULD have made S6.5/S6.6 collide - each coding against the
other's request/response shape - is removed by putting the wire contract in S6.3
(`pipeline.ts`) and having BOTH import it. With that, no wave establishes a fact a
CONCURRENT wave assumes: the concurrent batches ({S6.1,S6.2,S6.3}, then {S6.4},
then {S6.5,S6.6}) are independent in both senses. S6.7 is sequential and alone.

**Shared-resource guards for every concurrent batch** (`parallel-disjointness.md`
section 5): exactly ONE wave in a batch runs `npx tsc --noEmit` at the batch gate
(it races on `tsconfig.tsbuildinfo`); no two waves sabotage-verify on the tree at
once (sequence the sabotage passes, or give one a private worktree); NO wave runs
`git add -A` or `git stash` - every wave stages EXPLICIT paths; `docs/BACKLOG.md`
and `docs/REGRESSION.md` are written by the orchestrator only, never by a wave in
the same window.

---

## 6. Gates per wave

Each names the exact command and what a pass looks like. A gate naming two or more
test files uses `npm run test:paths -- <p1> <p2> ...`, never a raw multi-path
`vitest` (`docs/loop/this-repo.md` section 1). Every wave also runs the repo-wide
gates once (`npx tsc --noEmit` -> no output; `npm run lint` -> exit 0, no NEW
warning in the wave's files vs the pre-change run; the build compile-line
`(check-mark) Compiled successfully`, NOT the exit code), and gates on the tree
(`git status --short` vs the assignment; no `.claude/worktrees` copy edited).

| Wave | Test command | Pass looks like |
|---|---|---|
| S6.1 | `npx vitest run src/lib/deck-standard/standard.test.ts` | `isTitleCase("Section 2: The Request Lifecycle")` true; `"Post-Lecture Practice"` requires each hyphen part capitalized; existing rules still pass. **Sabotage (mandatory, one per fix branch):** revert the colon-edge branch -> the divider case goes RED; revert the hyphen-loop -> the hyphen case goes RED. |
| S6.2 | `npx vitest run src/lib/deck-standard/polish.test.ts` | polishing a deck whose slides carry `code`/`graphic` returns those fields intact; idempotence (`polishDeck(polishDeck(d).deck).changes` empty) still holds. **Sabotage:** drop the field-spread -> the preservation assertion goes RED. |
| S6.3 | `npx vitest run src/lib/presentations/pipeline.test.ts` | `computeStale` returns the exact downstream set per edited stage (oracle: a table whose axes come from a source other than the generator). **Sabotage:** drop one edge (e.g. frame->deck) -> the stale-set assertion goes RED. |
| S6.4 | `npx vitest run src/lib/presentations/pipeline-prompts.test.ts` | the built deck prompt CONTAINS the frame step names, each plan entry's `dominantClaim`, and the structure-contract text (FRAME-FOLD-style presence on the raw string). `parsePlan`/`parseFrame` never throw on malformed input. **Sabotage:** delete the frame-fold line -> presence assertion RED. |
| S6.5 | `npx vitest run src/app/api/presentations/pipeline/route.test.ts` | with `callLlm` mocked: `requireUser` awaited before any call; one op per request; a deadline -> styled 504; a failed call -> styled 502; `regen-slide` regenerates ONE slide. **Sabotage:** remove the auth await -> the auth assertion RED. |
| S6.6 | `npx vitest run src/app/components/presentations/pipeline/panel-logic.test.ts` | request bodies name one stage; response reducers branch on HTTP + JSON status (the `panel-logic.ts:111` idiom); `runToEnd` visits stages in dependency order; `applyStageEdit` marks the `computeStale` set. |
| S6.7 | `npm run test:paths -- src/app/components/manual/manual-rail.test.ts src/app/url-state.test.ts src/app/components/home/useAppNavigation.test.ts` + `npx tsc --noEmit` + build compile-line + `git status --short` | the two-child `getInnerDestinations("presentations")` assertion updated and green; `presentationsView` round-trips through url-state and restore; `PipelineTab` mounts under the presentations child. Render, drag, download, run-to-end and real generation quality are OWNER-verification (RES-S6-C). |

**S6 chunk gate (before the single push):** `npx tsc --noEmit` (no output);
`npm run test:paths -- <all seven new/edited test files>`; the build compile-line;
`git status --short` shows ONLY the files in sections 4's write sets;
`src/lib/no-emojis.test.ts` and `src/source-bytes.structure.test.ts` green over
the new files.

---

## 7. Line-shift and revertibility obligations this plan creates

- **S6.7 adds a `useState` (`presentationsView`) to `useAppNavigation.ts`.** This
  churns the positional useState-order guard in `useAppNavigation.test.ts`
  (`docs/pres-1-architecture.md:216-225` warned of it for the grading precedent).
  DELTA: one added hook shifts the block boundaries the guard anchors on. OWNER:
  the S6.7 implementer re-pins that guard in the SAME wave, and states the new
  anchor lines - do not leave a stale line citation.
- **S6.7 changes the `page.tsx` presentations mount** from a single branch to a
  child switch. `snapshot-grading.structure.test.ts` `readFileSync`s `page.tsx`
  (`docs/pres-1-architecture.md:824-827`); its assertions target the grading
  wrapper, not presentations, so it is expected GREEN - but the S6.7 implementer
  MUST re-run it, because the mount edit shifts line numbers it may anchor on.
- **`url-state.test.ts` at 970** (measured): S6.7's added cases risk breaching
  1000 (`file-size-ceiling.structure.test.ts:41`). OWNER: S6.7 implementer
  re-measures and splits if needed (RES-S6-D).
- **Not trivially revertible:** the nav thread (`PresentationsView` through
  `manual-rail.ts` + `url-state.ts` + `useAppNavigation.ts` + `page.tsx`) is a
  four-file coordinated change; its smallest safe revert is the whole S6.7 nav
  edit, not a one-file patch. Every other wave (S6.1-S6.6) is a self-contained
  new file or a two-file leaf edit and reverts cleanly.

---

## 8. What stays OWNER-VERIFICATION vs machine-checkable

- **Machine-checkable here:** S6.1 (title case), S6.2 (polish preservation +
  idempotence), S6.3 (`computeStale` graph), S6.4 (prompt presence + parser
  safety), S6.5 (route auth/budget/single-op, callLlm mocked), S6.6 (request
  builders, reducers, `runToEnd` order, `applyStageEdit`), and S6.7's nav/reading
  claims (inner destinations, url round-trip, restore).
- **OWNER-VERIFICATION only** (nothing renders under vitest; no API key; network
  blocked): the stepper rendering and drag-drop; the deck PREVIEW; the .pptx
  DOWNLOAD opening correctly; the click budget walked live; run-to-end producing
  a good deck; whether the model stays on-Frame and whether the checklist findings
  are genuinely adversarial; and any per-course DB/RLS. These are RES-S6-B/C and
  the carried RES-PRES2-2/3/4/5.

---

## 9. Residual register (owner, instrument, object/direction, step)

A residual not in `docs/BACKLOG.md` does not exist (`docs/DEV_LOOP.md` step 0);
this plan does NOT write the backlog, so whoever lands the first S6 wave owes each
a row. Missing any of owner/instrument/step = a deletion.

| id | Residual | Owner | Instrument | Object / direction | Step |
|---|---|---|---|---|---|
| RES-S6-A | New child vs rename/replace the thin "Slide Deck Creation" child (naming/product call). Recommended reading acted on: NEW child `presentations-pipeline`, label "Slide Deck Pipeline"; thin child kept. | Repo owner | This plan section 0.1 | The new child's label/id against the owner's intent. FAILS if the owner wanted the thin child renamed/removed. | Owner confirms; only S6.7 nav edits differ. |
| RES-S6-B | Pipeline stage-state is client-only `ta-pres-pipeline-*`; per-project server persistence + RLS deferred (no live DB). | Repo owner + future data wave | Migration with a stored generated column + idempotent RLS (`seats.md:217-229`) | The persisted stage-state row against RLS. FAILS if per-project is shipped without live-DB verification. | Deferred; owner verification on a deployed DB (dedup RES-PRES2-2). |
| RES-S6-C | Render/drag/download/click-budget/run-to-end quality and model faithfulness are unverifiable here. | Repo owner | Walk the tab in prod; generate; count clicks; download and open the .pptx | Observed behaviour against the stage map. FAILS if a stage adds a required step, the preview/download is broken, or the model drifts off-Frame. | Owner verification after S6.7 (dedup RES-PRES2-3/4/5). |
| RES-S6-D | `url-state.test.ts` at 970 lines (`@(Get-Content).Count`, 2026-09-29) risks breaching the 1000 ceiling when S6.7 adds `normalizePresentationsView` cases. | S6.7 implementer | `@(Get-Content src/app/url-state.test.ts).Count` after the edit vs `LIMIT=1000` (`file-size-ceiling.structure.test.ts:41`) | The file's line count. FAILS if it reaches 1000. | Re-measure at the S6.7 gate; split if breached. |
| RES-S6-E | Template-fill export (`fillDeckTemplateFileAction`) is an optional downstream export (F1 rec a), NOT built in S6. | Repo owner / follow-up wave | Wire the shipped action as a "Download into template" button and owner-verify byte identity (A43 H1) | The exported .pptx against the uploaded template. FAILS if template fit is claimed before wired. | A follow-up sub-wave, if the owner wants it. |
| RES-S6-F | The LEVERAGE removal test for the pipeline's low-interaction editing (clicks/latency/attention) is not buildable here (nothing renders). | Repo owner | Walk the surface; count clicks first-use and repeat-use (`seats.md:190-194`) | Observed click count against the budget. FAILS if a stage adds a required step. | Owner verification after S6.7 (dedup RES-PRES2-3). |

**Reconciled from the scope:** RES-PRES2-1 (F1 unanswered) is CLOSED - F1 is
settled (presentations surface, new child). RES-PRES2-6 (APPLY needs A43-C C2) is
RECONCILED - PRES-2 builds its own apply button against the SHIPPED
`/api/decks/ask` route, so C2 is no longer a blocker; if the owner still wants
ppt-design's C2 control reused, that is a separate item.

---

## 10. Disposition table

Not applicable: this is the FIRST wave plan for PRES-2 S6. No prior S6 plan was
restructured, so there is no prior requirement to map to kept / handed-over /
withdrawn. Where this plan corrects the scope's C2 dependency and the polish/
title-case leaf state, section 0 and 9 state the correction inline against the
tree.

---

## 11. Instruments used in this pass

Reproducible from the repo root at HEAD `6c585a24`, 2026-09-29.

```
git rev-parse --short HEAD                                              -> 6c585a24
@(Get-Content src/app/page.tsx).Count                                  -> 832
@(Get-Content src/app/components/home/useAppNavigation.ts).Count       -> 762
@(Get-Content src/app/url-state.ts).Count                              -> 475
@(Get-Content src/app/url-state.test.ts).Count                         -> 970
@(Get-Content src/app/components/manual/manual-rail.ts).Count          -> 381
@(Get-Content src/app/components/manual/manual-rail.test.ts).Count     -> 609
@(Get-Content src/lib/deck-standard/polish.ts).Count                   -> 211
@(Get-Content src/lib/deck-standard/standard.ts).Count                 -> 128
grep -nE "export (const|function) (slideStructureRequirements|SLIDE_STRUCTURE_REQUIREMENTS|SLIDE_DECK_JSON_SHAPE|enforceTitleLength)" src/lib/slide-prompt.ts -> :293,:65,:40,:515
grep -rnE "export async function fillDeckTemplateFileAction" src/app/actions -> deck-template-files.ts:145
grep -rnE "export async function (requireUser|requireAppOwner)" src/lib/supabase -> auth.ts:328,:408
grep -nE "code|graphic|codeLanguage" src/lib/deck-standard/polish.ts   -> :53 (comment only; returned slides drop these fields)
cat s1..s7 | sort | uniq -d                                            -> (empty; canary prints the 2 shared paths of a duplicated set)
grep -rniE "pipeline-?stage|invalidat" --include=*.ts src/lib/presentations -> exit 1 (greenfield; canary grep -rc "PresentationContext" ... non-zero)
```

Files opened directly for this pass: the five leaves
(`src/lib/deck-standard/{standard,frame,slide-plan,checklists,polish,types}.ts`);
`src/app/components/presentations/{index.tsx,panel-logic.ts,hooks.ts}`;
`src/lib/presentations/{prompts,generate,parse,types}.ts`;
`src/app/api/presentations/generate/route.ts`;
`src/lib/decks/deck-operations.ts`; `src/app/api/decks/ask/route.ts`;
`src/app/components/manual/manual-rail.ts`; `docs/pres-2-scope.md`;
`docs/pres-1-architecture.md`; `docs/loop/{DEV_LOOP,this-repo,seats,parallel-disjointness,iteration-caps}.md`.

Line counts use `@(Get-Content).Count`, the mandated PowerShell instrument; an
implementer re-measures before trusting any headroom, since it and
`Measure-Object -Line` disagree by up to 138 on one file in this repo
(`docs/loop/this-repo.md` section 3).
